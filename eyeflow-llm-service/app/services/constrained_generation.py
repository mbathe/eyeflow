"""
Constrained Generation Service — spec §3.3
==========================================

"Les tokens invalides — c'est-à-dire les références à des connecteurs ou actions
non présents dans le catalogue — sont masqués pendant la génération.
Le LLM ne peut physiquement pas générer un programme qui référence une ressource inexistante."

Implementation strategy (no direct GPU token-level masking from Python HTTP API):

  1. Build EXPLICIT ALLOWLIST — extract valid connector IDs and function IDs from the
     catalog context and inject them into the system prompt as a strict grammar.

  2. JSON Schema structural constraint — pass `response_format={"type": "json_schema"}`
     for OpenAI ≥ Nov 2024, or build an Anthropic prefill.  Falls back to JSON mode.

  3. Progressive constraint tightening — up to MAX_ATTEMPTS:
       • Attempt 1 : standard generation with allowlist in prompt
       • Attempt 2 : add explicit "FORBIDDEN tokens" list (hallucinated names from attempt 1)
       • Attempt 3 : ultra-restricted prompt with only valid options enumerated

  4. Logit bias (OpenAI only) — when `tiktoken` is available, compute token IDs for
     known-invalid connector names and set logit_bias = -100 to suppress them.

Usage:
    service = ConstrainedGenerationService(context)
    result, tokens = await service.generate(user_intent, llm_provider)
"""

import json
import logging
import re
from typing import Any, Dict, List, Optional, Set, Tuple

logger = logging.getLogger(__name__)

# Maximum number of repair attempts before failing
MAX_ATTEMPTS = 3

# JSON Schema that all LLM outputs must conform to (§4.2 CatalogEntry output schema)
WORKFLOW_RULES_SCHEMA = {
    "type": "object",
    "required": ["rules"],
    "properties": {
        "rules": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["name", "trigger", "actions"],
                "properties": {
                    "name": {"type": "string"},
                    "trigger": {
                        "type": "object",
                        "required": ["source"],
                        "properties": {
                            "source": {"type": "string"},
                            "filter": {"type": "object"},
                        },
                    },
                    "condition": {"type": ["object", "null"]},
                    "actions": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "required": ["type"],
                            "properties": {
                                "type": {"type": "string"},
                                "payload": {"type": "object"},
                            },
                        },
                    },
                },
                "additionalProperties": True,
            },
        },
        "summary": {"type": "string"},
        "confidence": {"type": "number", "minimum": 0, "maximum": 1},
    },
}


class ConstrainedGenerationService:
    """
    Wraps any ILLMProvider to enforce catalog-constrained generation.

    The catalog allowlist is built once per request from the aggregated context
    fetched from NestJS.  All generation attempts operate against the same
    immutable allowlist to ensure determinism.
    """

    def __init__(self, aggregated_context: Dict[str, Any]) -> None:
        self._context = aggregated_context
        self._allowlist = self._build_allowlist(aggregated_context)
        logger.debug(
            f"[ConstrainedGen] Allowlist built — "
            f"{len(self._allowlist['connector_ids'])} connectors, "
            f"{len(self._allowlist['action_types'])} action types"
        )

    # ──────────────────────────────────────────────────────────────────────────
    # Public API
    # ──────────────────────────────────────────────────────────────────────────

    async def generate(
        self,
        user_intent: str,
        llm_provider: Any,
    ) -> Tuple[Dict[str, Any], int]:
        """
        Generate a workflow constrained to catalog entries.

        Returns (rules_dict, total_tokens_used).
        Raises ConstrainedGenerationError if all attempts fail.
        """
        forbidden_names: Set[str] = set()
        total_tokens = 0

        for attempt in range(1, MAX_ATTEMPTS + 1):
            logger.info(f"[ConstrainedGen] Attempt {attempt}/{MAX_ATTEMPTS}")

            # Build augmented context with constraint annotations
            augmented_context = self._augment_context(
                self._context, forbidden_names, attempt
            )

            try:
                rules_dict, tokens = await llm_provider.generate_rules(
                    aggregated_context=augmented_context,
                    user_intent=user_intent,
                )
                total_tokens += tokens

                # Validate against catalog allowlist
                violations = self._validate_against_allowlist(rules_dict)

                if not violations:
                    logger.info(
                        f"[ConstrainedGen] ✅ Valid output on attempt {attempt} ({tokens} tokens)"
                    )
                    # Attach constraint metadata for NestJS
                    rules_dict["_constrained"] = {
                        "attempt": attempt,
                        "total_tokens": total_tokens,
                        "violations_repaired": list(forbidden_names),
                    }
                    return rules_dict, total_tokens

                # Collect violating names for next attempt
                new_violations = {v["value"] for v in violations}
                logger.warning(
                    f"[ConstrainedGen] Attempt {attempt} produced "
                    f"{len(violations)} catalog violation(s): {new_violations}"
                )
                forbidden_names.update(new_violations)

            except Exception as exc:
                logger.error(
                    f"[ConstrainedGen] Attempt {attempt} threw exception: {exc}"
                )
                if attempt == MAX_ATTEMPTS:
                    raise ConstrainedGenerationError(
                        f"All {MAX_ATTEMPTS} constrained generation attempts failed. "
                        f"Last error: {exc}"
                    ) from exc

        raise ConstrainedGenerationError(
            f"Catalog violations persisted after {MAX_ATTEMPTS} attempts. "
            f"Forbidden names: {forbidden_names}"
        )

    def validate_schema(self, rules_dict: Dict[str, Any]) -> List[str]:
        """
        Validate rules_dict against WORKFLOW_RULES_SCHEMA.
        Returns list of error messages (empty = valid).
        Uses jsonschema if available, falls back to manual check.
        """
        try:
            import jsonschema
            errors = list(jsonschema.Draft7Validator(WORKFLOW_RULES_SCHEMA).iter_errors(rules_dict))
            return [e.message for e in errors]
        except ImportError:
            # Manual minimal check
            if not isinstance(rules_dict, dict):
                return ["Response is not a JSON object"]
            if "rules" not in rules_dict:
                return ["Missing required field: 'rules'"]
            if not isinstance(rules_dict["rules"], list):
                return ["Field 'rules' must be an array"]
            return []

    # ──────────────────────────────────────────────────────────────────────────
    # Allowlist construction
    # ──────────────────────────────────────────────────────────────────────────

    def _build_allowlist(self, context: Dict[str, Any]) -> Dict[str, Set[str]]:
        """
        Extract valid connector IDs, action types, and trigger sources
        from the NestJS aggregated context.
        """
        connector_ids: Set[str] = set()
        action_types: Set[str] = set()
        trigger_sources: Set[str] = set()

        # Connectors
        for conn in context.get("connectors", []):
            cid = conn.get("id") or conn.get("connector_id") or conn.get("name", "")
            if cid:
                connector_ids.add(str(cid))
            for fn in conn.get("functions", []) or conn.get("actions", []) or []:
                fname = fn.get("id") or fn.get("name") or fn.get("function_id", "")
                if fname:
                    action_types.add(str(fname))

        # Condition types (used as trigger source identifiers)
        for ct in context.get("condition_types", []) or []:
            if isinstance(ct, str):
                trigger_sources.add(ct)
            elif isinstance(ct, dict):
                src = ct.get("id") or ct.get("type") or ct.get("name", "")
                if src:
                    trigger_sources.add(str(src))

        # Expert agents as action prefixes
        for agent in context.get("expert_agents", []) or []:
            aid = agent.get("id") or agent.get("name", "")
            if aid:
                action_types.add(str(aid))

        return {
            "connector_ids": connector_ids,
            "action_types": action_types,
            "trigger_sources": trigger_sources,
        }

    def _build_constraint_preamble(
        self,
        forbidden_names: Set[str],
        attempt: int,
    ) -> str:
        """
        Build the constraint preamble injected at the TOP of the system prompt.
        Strength increases with attempt number (§3.3 progressive tightening).
        """
        connector_list = "\n".join(
            f"  - {cid}" for cid in sorted(self._allowlist["connector_ids"])
        ) or "  (none registered)"

        action_list = "\n".join(
            f"  - {a}" for a in sorted(self._allowlist["action_types"])
        ) or "  (none registered)"

        trigger_list = "\n".join(
            f"  - {t}" for t in sorted(self._allowlist["trigger_sources"])
        ) or "  (none registered)"

        forbidden_block = ""
        if forbidden_names:
            forbidden_list = "\n".join(f"  - {n}" for n in sorted(forbidden_names))
            forbidden_block = f"""
═══ FORBIDDEN TOKENS (hallucinated — DO NOT USE) ═══
The following identifiers do NOT exist in the catalog.
Using any of them will cause immediate compilation failure.
{forbidden_list}
════════════════════════════════════════════════════
"""

        strength = ["IMPORTANT", "CRITICAL", "ABSOLUTE RULE"][attempt - 1]

        return f"""
╔══════════════════════════════════════════════════════════╗
║         CATALOG CONSTRAINT — {strength}              ║
╚══════════════════════════════════════════════════════════╝

You MUST ONLY reference identifiers from the following ALLOWLIST.
Generating any connector, action or trigger that is NOT on this list
is a HARD ERROR that will break compilation.  No exceptions.

ALLOWED CONNECTOR IDs:
{connector_list}

ALLOWED ACTION TYPES:
{action_list}

ALLOWED TRIGGER SOURCES:
{trigger_list}
{forbidden_block}
REQUIRED OUTPUT FORMAT: valid JSON object with a "rules" array.
No markdown. No prose. Raw JSON only.
"""

    def _augment_context(
        self,
        context: Dict[str, Any],
        forbidden_names: Set[str],
        attempt: int,
    ) -> Dict[str, Any]:
        """Return a shallow copy of context with constraint preamble injected."""
        return {
            **context,
            "_constraint_preamble": self._build_constraint_preamble(
                forbidden_names, attempt
            ),
            "_attempt": attempt,
            "_max_attempts": MAX_ATTEMPTS,
        }

    # ──────────────────────────────────────────────────────────────────────────
    # Post-generation validation
    # ──────────────────────────────────────────────────────────────────────────

    def _validate_against_allowlist(
        self, rules_dict: Dict[str, Any]
    ) -> List[Dict[str, str]]:
        """
        Walk the rules dict and check every connector/action reference
        against the allowlist.

        Returns list of violation dicts: {"field": ..., "value": ..., "message": ...}
        Empty list = fully valid.
        """
        violations: List[Dict[str, str]] = []
        connector_ids = self._allowlist["connector_ids"]
        action_types = self._allowlist["action_types"]
        trigger_sources = self._allowlist["trigger_sources"]

        # If allowlist is empty (no connectors registered), skip validation
        if not connector_ids and not action_types and not trigger_sources:
            logger.debug("[ConstrainedGen] Empty allowlist — skipping catalog validation")
            return []

        for rule in rules_dict.get("rules", []) or []:
            # Validate trigger source
            trigger = rule.get("trigger") or {}
            source = trigger.get("source", "")
            if source and trigger_sources and source not in trigger_sources and source not in connector_ids:
                violations.append({
                    "field": "trigger.source",
                    "value": source,
                    "message": f"Trigger source '{source}' not in catalog",
                })

            # Validate actions
            for action in rule.get("actions", []) or []:
                atype = action.get("type", "")
                connector = (
                    action.get("payload", {}) or {}
                ).get("connector") or action.get("channel", "")

                if atype and action_types and atype not in action_types:
                    violations.append({
                        "field": "action.type",
                        "value": atype,
                        "message": f"Action type '{atype}' not in catalog",
                    })

                if connector and connector_ids and connector not in connector_ids:
                    violations.append({
                        "field": "action.payload.connector",
                        "value": connector,
                        "message": f"Connector '{connector}' not registered",
                    })

        return violations


class ConstrainedGenerationError(Exception):
    """Raised when constrained generation fails after all repair attempts."""
    pass


# ── Logit bias helpers (OpenAI only) ─────────────────────────────────────────

def build_logit_bias_for_forbidden(
    forbidden_names: Set[str], model: str = "gpt-4"
) -> Dict[int, int]:
    """
    Compute OpenAI logit_bias dict that suppresses hallucinated token sequences.
    Requires `tiktoken` (installed alongside openai).
    Returns empty dict if tiktoken is unavailable.
    """
    logit_bias: Dict[int, int] = {}
    try:
        import tiktoken

        enc = tiktoken.encoding_for_model(model)
        for name in forbidden_names:
            # Encode the connector/action name and suppress first token
            tokens = enc.encode(name)
            if tokens:
                logit_bias[tokens[0]] = -100  # spec: logit_bias = -100 for banned tokens
    except Exception:
        pass  # tiktoken not available — fall back to prompt-only constraints
    return logit_bias
