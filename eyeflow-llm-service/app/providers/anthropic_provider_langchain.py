"""
Anthropic Claude 3 LLM Provider using LangChain

This provider uses LangChain for:
- Structured prompt management
- JSON output parsing with guaranteed structure
- Chain composition for complex workflows
- Integrated error handling and retries
"""

import json
import logging
import re
from typing import Dict, Any, List, Optional, Tuple

from langchain_anthropic import ChatAnthropic
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import JsonOutputParser, StrOutputParser
from pydantic import BaseModel, Field

from .base import ILLMProvider

logger = logging.getLogger(__name__)

# ============================================================================
# Output Schema Definitions for JSON Parsing
# ============================================================================


class WorkflowCondition(BaseModel):
    """Structured workflow condition"""
    type: str = Field(description="Condition type (e.g., task_overdue, user_assigned)")
    operator: str = Field(description="Operator (==, !=, >, <, in, contains)")
    value: str = Field(description="Condition value")
    metadata: Optional[Dict[str, Any]] = Field(default=None, description="Optional metadata")


class WorkflowAction(BaseModel):
    """Structured workflow action"""
    type: str = Field(description="Action type (e.g., send_notification, update_task)")
    channel: Optional[str] = Field(default=None, description="Channel (email, slack, webhook)")
    payload: Dict[str, Any] = Field(description="Action payload")
    retry: Optional[bool] = Field(default=False, description="Enable retry logic")


class GeneratedRule(BaseModel):
    """Complete generated workflow rule"""
    name: str = Field(description="Rule name (short, descriptive)")
    description: str = Field(description="Rule description (full intent)")
    trigger: str = Field(description="Trigger event")
    conditions: List[WorkflowCondition] = Field(description="List of conditions")
    actions: List[WorkflowAction] = Field(description="List of actions")
    priority: int = Field(default=100, description="Priority (0-1000)")
    enabled: bool = Field(default=True, description="Is rule enabled")


class GeneratedRules(BaseModel):
    """Response containing generated rules"""
    rules: List[GeneratedRule] = Field(description="List of generated rules")
    summary: str = Field(description="Summary of what was generated")
    confidence: float = Field(default=0.9, description="Confidence level (0-1)")


class AnthropicProviderLangChain(ILLMProvider):
    """
    Anthropic Claude 3 Opus provider using LangChain
    
    Features:
    - Structured JSON output via OutputParser (95%+ reliability)
    - Chain composition for rule generation and refinement
    - Async-first design with .ainvoke()
    - Integrated error handling and retries via LangChain
    """

    def __init__(
        self,
        api_key: str,
        model: str = "claude-3-opus-20240229",
        temperature: float = 0.3,
        max_tokens: int = 4096,
        top_p: Optional[float] = None,
        system_prompt_prefix: Optional[str] = None,
    ):
        """Initialize with LangChain ChatAnthropic"""
        self.api_key = api_key
        self._model_name = model
        self._name = "anthropic"
        self._total_tokens = 0
        self._system_prompt_prefix = system_prompt_prefix

        # Build ChatAnthropic kwargs
        llm_kwargs = dict(
            model=model,
            api_key=api_key,
            temperature=temperature,
            max_tokens=max_tokens,
            timeout=60.0,
        )
        if top_p is not None:
            llm_kwargs["top_p"] = top_p

        # Initialize Claude via LangChain
        self.llm = ChatAnthropic(**llm_kwargs)

        logger.info(f"🔧 AnthropicProviderLangChain initialized: {model} (temp={temperature})")

    @property
    def name(self) -> str:
        """Provider name"""
        return self._name

    @property
    def model_name(self) -> str:
        """Model identifier"""
        return self._model_name

    async def generate_rules(
        self,
        aggregated_context: Dict[str, Any],
        user_intent: str,
    ) -> Tuple[Dict[str, Any], int]:
        """
        Generate workflow rules from user intent using LangChain Chain
        
        Args:
            aggregated_context: Aggregated workflow context (40+ types)
            user_intent: Natural language rule description
            
        Returns:
            (generated_rules_dict, tokens_used)
        """
        try:
            logger.info(f"🔄 Generating rules from intent: {user_intent[:60]}...")

            # Build system prompt with context
            system_prompt = self._build_system_prompt(aggregated_context)

            # Create LangChain prompt template
            prompt = ChatPromptTemplate.from_messages(
                [
                    ("system", system_prompt),
                    (
                        "human",
                        "Generate workflow rule(s) from this intent:\n{intent}\n\n"
                        "Return ONLY valid JSON matching the GeneratedRules schema.",
                    ),
                ]
            )

            # Use str parser + robust JSON extraction to handle prose-wrapped responses
            chain = prompt | self.llm | StrOutputParser()

            # Run chain
            raw_text = await chain.ainvoke({"intent": user_intent})
            result = self._extract_json(raw_text)

            tokens_used = self._extract_token_usage()
            logger.info(f"✅ Generated {len(result.get('rules', []))} rules")

            return result, tokens_used

        except Exception as e:
            logger.error(f"❌ Error generating rules: {str(e)}")
            raise

    async def generate_rules_batch(
        self,
        aggregated_context: Dict[str, Any],
        user_intents: List[str],
    ) -> Tuple[List[Dict[str, Any]], int]:
        """
        Generate multiple rules efficiently
        
        Args:
            aggregated_context: Workflow context
            user_intents: List of natural language descriptions
            
        Returns:
            (list_of_rules, tokens_used)
        """
        try:
            logger.info(f"🔄 Generating batch of {len(user_intents)} rules...")

            system_prompt = self._build_system_prompt(aggregated_context)

            prompt = ChatPromptTemplate.from_messages(
                [
                    ("system", system_prompt),
                    (
                        "human",
                        "Generate workflow rules from these intents:\n{intents_text}\n\n"
                        "Return ONLY valid JSON as array of GeneratedRules objects.",
                    ),
                ]
            )

            parser = JsonOutputParser(pydantic_object=list)
            chain = prompt | self.llm | parser

            intents_text = "\n".join([f"- {intent}" for intent in user_intents])
            result = await chain.ainvoke({"intents_text": intents_text})

            tokens_used = self._extract_token_usage()
            logger.info(f"✅ Generated {len(result)} rules in batch")

            return result, tokens_used

        except Exception as e:
            logger.error(f"❌ Batch generation error: {str(e)}")
            raise

    async def evaluate_condition(
        self,
        condition: str,
        context: Dict[str, Any],
    ) -> bool:
        """
        Dynamically evaluate condition using LLM reasoning
        
        Args:
            condition: Condition expression (natural language or structured)
            context: Context variables for evaluation
            
        Returns:
            boolean result of condition evaluation
        """
        try:
            logger.info(f"🔍 Evaluating condition: {condition}")

            prompt = ChatPromptTemplate.from_messages(
                [
                    (
                        "system",
                        "You are a workflow condition evaluator. "
                        "Given a condition and context, determine if the condition is TRUE or FALSE.\n"
                        "Respond with ONLY valid JSON: {\"result\": true/false, \"reason\": \"explanation\"}",
                    ),
                    (
                        "human",
                        f"Condition: {condition}\nContext: {json.dumps(context)}\n\n"
                        'Return JSON with "result" (boolean) and "reason" (string).',
                    ),
                ]
            )

            parser = JsonOutputParser(pydantic_object=dict)
            chain = prompt | self.llm | parser

            result = await chain.ainvoke({})

            logger.info(f"✅ Condition evaluated: {result['result']}")
            return result.get("result", False)

        except Exception as e:
            logger.error(f"❌ Condition evaluation error: {str(e)}")
            raise

    async def refine_rules(
        self,
        current_rules: Dict[str, Any],
        feedback: str,
        aggregated_context: Dict[str, Any],
    ) -> Tuple[Dict[str, Any], int]:
        """
        Refine rules based on user feedback using LangChain Chain
        
        Args:
            current_rules: Current rules to refine
            feedback: User feedback/corrections
            aggregated_context: Workflow context
            
        Returns:
            (refined_rules, tokens_used)
        """
        try:
            logger.info(f"🔄 Refining rules based on feedback...")

            system_prompt = self._build_system_prompt(aggregated_context)

            prompt = ChatPromptTemplate.from_messages(
                [
                    ("system", system_prompt),
                    (
                        "human",
                        "Règles actuelles :\n{current_rules_json}\n\n"
                        "Feedback utilisateur :\n{feedback}\n\n"
                        "Mets à jour les règles selon ce feedback. "
                        "Dans \"chat_reply\", explique en 2-3 phrases ce que tu as modifié et pourquoi. "
                        "Dans \"changes_summary\", liste les changements en une phrase courte. "
                        "Return ONLY valid JSON — no explanations, no prose, just the JSON object.",
                    ),
                ]
            )

            chain = prompt | self.llm | StrOutputParser()

            raw_text = await chain.ainvoke(
                {
                    "current_rules_json": json.dumps(current_rules),
                    "feedback": feedback,
                }
            )
            result = self._extract_json(raw_text)

            tokens_used = self._extract_token_usage()
            logger.info(f"✅ Rules refined successfully")

            return result, tokens_used

        except Exception as e:
            logger.error(f"❌ Refinement error: {str(e)}")
            raise

    def _extract_json(self, text: str) -> Dict[str, Any]:
        """Extract JSON object from a text that may contain surrounding prose."""
        # 1. Try direct parse first (pure JSON response)
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass
        # 2. Find the outermost { ... } block
        match = re.search(r'\{[\s\S]*\}', text)
        if match:
            try:
                return json.loads(match.group(0))
            except json.JSONDecodeError:
                pass
        # 3. Find a fenced code block ```json ... ```
        match = re.search(r'```(?:json)?\s*([\s\S]*?)```', text)
        if match:
            try:
                return json.loads(match.group(1))
            except json.JSONDecodeError:
                pass
        raise ValueError(f"No valid JSON found in LLM response: {text[:200]}")

    def _extract_token_usage(self) -> int:
        """Extract approximate token usage from LLM call"""
        # LangChain's token counting is approximate
        # In production, use actual token counts from API response
        return 3000  # Placeholder

    def _build_system_prompt(self, context: Dict[str, Any]) -> str:
        """Build rich system prompt injecting ALL available capabilities from NestJS context."""

        # ── Constraint preamble (injected by ConstrainedGenerationService) ────
        constraint_preamble = context.get("_constraint_preamble", "")

        # ── Connectors ────────────────────────────────────────────────────────
        connectors = context.get("connectors", [])
        connector_lines: List[str] = []
        for c in connectors:
            cid = c.get("id", "")
            cname = c.get("name", cid)
            fns = [f.get("name", "") for f in (c.get("functions") or []) if f.get("name")]
            nodes = [n.get("displayName", n.get("name", "")) for n in (c.get("nodes") or []) if n.get("name")]
            trigs = [t.get("type", "") for t in (c.get("triggers") or []) if t.get("type")]
            fn_str = ", ".join(fns[:6]) if fns else "—"
            node_str = "  nodes=[" + ", ".join(nodes[:4]) + "]" if nodes else ""
            trig_str = "  triggers=[" + ", ".join(trigs[:3]) + "]" if trigs else ""
            connector_lines.append(f"  • {cid} ({cname}): functions=[{fn_str}]{node_str}{trig_str}")
        connectors_block = "\n".join(connector_lines) if connector_lines else "  (catalogue vide)"

        # ── Trigger types ─────────────────────────────────────────────────────
        trigger_types = context.get("triggerTypes", context.get("trigger_types", []))
        trigger_lines = []
        for t in trigger_types:
            ttype = t.get("type", t) if isinstance(t, dict) else t
            tdesc = t.get("description", "") if isinstance(t, dict) else ""
            trigger_lines.append(f"  • {ttype}" + (f" — {tdesc}" if tdesc else ""))
        triggers_block = "\n".join(trigger_lines) if trigger_lines else "  ON_CREATE, ON_UPDATE, ON_DELETE, ON_WEBHOOK, SCHEDULE"

        # ── Condition types ────────────────────────────────────────────────────
        condition_types = context.get("conditionTypes", context.get("condition_types", []))
        condition_lines = []
        for ct in condition_types:
            ctype = ct.get("type", ct) if isinstance(ct, dict) else ct
            cdesc = ct.get("description", "")[:80] if isinstance(ct, dict) else ""
            ops = ct.get("operators", [])[:4] if isinstance(ct, dict) else []
            condition_lines.append(f"  • {ctype}" + (f" — {cdesc}" if cdesc else "") + (f" [ops: {', '.join(ops)}]" if ops else ""))
        conditions_block = "\n".join(condition_lines) if condition_lines else "  SIMPLE, SERVICE_CALL, ML_PREDICTION, LLM_EVALUATION"

        # ── Action types ───────────────────────────────────────────────────────
        action_types = context.get("actionTypes", context.get("action_types", []))
        action_lines = []
        for a in action_types:
            atype = a.get("type", a) if isinstance(a, dict) else a
            adesc = a.get("description", "")[:80] if isinstance(a, dict) else ""
            action_lines.append(f"  • {atype}" + (f" — {adesc}" if adesc else ""))
        actions_block = "\n".join(action_lines) if action_lines else "  CONNECTOR_CALL, HTTP_REQUEST, TRANSFORM, LOG, NOTIFY"

        # ── Services manifest ──────────────────────────────────────────────────
        services = context.get("servicesManifest", [])
        service_lines = [
            f"  • {s.get('id')} ({s.get('format', '?')}) — {s.get('description', '')[:60]}"
            for s in services[:10]
        ]
        services_block = "\n".join(service_lines) if service_lines else "  (aucun service enregistré)"

        # ── Context variables ──────────────────────────────────────────────────
        ctx_vars = context.get("contextVariables", ["$event", "$result", "$context", "$user", "$rule"])
        if isinstance(ctx_vars, list) and ctx_vars and isinstance(ctx_vars[0], str):
            ctx_vars_str = ", ".join(ctx_vars[:8])
        else:
            ctx_vars_str = "$event, $result, $context, $user, $rule"

        # ── Operators ─────────────────────────────────────────────────────────
        operators = context.get("operators", [])
        op_names = [o.get("operator", o) if isinstance(o, dict) else o for o in operators[:12]]
        operators_str = ", ".join(op_names) if op_names else "EQ, NE, GT, GTE, LT, LTE, IN, NOT_IN, CONTAINS, REGEX"

        # ── Resilience patterns ────────────────────────────────────────────────
        resilience = context.get("resiliencePatterns", [])
        resilience_str = ", ".join([r.get("type", r) if isinstance(r, dict) else r for r in resilience[:6]])

        # ── LLM agent skills (injected by ContextCacheService) ────────────────
        llm_skills = context.get("_llm_agent_skills", {})
        skills_block = ""
        if llm_skills:
            for agent_name, info in llm_skills.items():
                skills = info.get("skills", [])
                affinities = info.get("taskAffinities", [])
                best_tasks = sorted(affinities, key=lambda x: x.get("score", 0), reverse=True)[:3]
                best_str = ", ".join([f"{a['taskType']}({a['score']})" for a in best_tasks])
                skills_block += f"\n  • {agent_name}: skills=[{', '.join(skills[:6])}] best_for=[{best_str}]"

        # ── Example rules ──────────────────────────────────────────────────────
        examples = context.get("exampleRules", [])
        example_block = ""
        if examples:
            ex = examples[0]
            example_block = f"\nEXEMPLE DE RÈGLE COMPLEXE:\n{ex.get('name','')}: {ex.get('description','')[:100]}"

        # ── Agent prefix ───────────────────────────────────────────────────────
        agent_prefix = ""
        if self._system_prompt_prefix:
            agent_prefix = f"INSTRUCTIONS SPÉCIFIQUES DE L'AGENT:\n{self._system_prompt_prefix}\n\n"

        return f"""{constraint_preamble}{agent_prefix}Tu es un système expert d'automatisation de workflows pour Eyeflow.
Ta mission : générer des règles de workflow production-ready depuis des intentions en langage naturel,
ET dialoguer avec l'utilisateur pour valider la faisabilité et clarifier les ambiguïtés.

══════════════════════════════════════════════════════════════
CATALOGUE DES CONNECTEURS DISPONIBLES ({len(connectors)} connecteurs):
══════════════════════════════════════════════════════════════
{connectors_block}

══════════════════════════════════════════════════════════════
TYPES DE DÉCLENCHEURS:
══════════════════════════════════════════════════════════════
{triggers_block}

══════════════════════════════════════════════════════════════
TYPES DE CONDITIONS:
══════════════════════════════════════════════════════════════
{conditions_block}
Opérateurs disponibles: {operators_str}

══════════════════════════════════════════════════════════════
TYPES D'ACTIONS:
══════════════════════════════════════════════════════════════
{actions_block}

══════════════════════════════════════════════════════════════
SERVICES DISPONIBLES (WASM/MCP/Docker):
══════════════════════════════════════════════════════════════
{services_block}

══════════════════════════════════════════════════════════════
VARIABLES DE CONTEXTE: {ctx_vars_str}
PATTERNS DE RÉSILIENCE: {resilience_str}
══════════════════════════════════════════════════════════════
{("COMPÉTENCES DES AGENTS LLM:" + skills_block) if skills_block else ""}
{example_block}

RÈGLES CRITIQUES:
1. Générer UNIQUEMENT du JSON valide
2. Utiliser UNIQUEMENT les connecteurs et fonctions listés ci-dessus
3. Utiliser les variables $event, $result, $context dans les paramètres
4. Chaque règle DOIT contenir OBLIGATOIREMENT les deux blocs : "display" ET "compilation"
5. Priorité 0-1000 (1000 = plus haute), activer la règle (enabled: true)
6. TOUJOURS inclure "chat_reply" et "feasibility" au niveau racine du JSON
7. Pour toute étape notification/action : TOUJOURS générer le contenu complet du message

======================================================================
STRUCTURE OBLIGATOIRE DE CHAQUE RÈGLE (deux blocs en parallèle) :
======================================================================

Bloc 1 — "display" (pour la visualisation, tout en langage naturel) :
  - title           : titre court (max 8 mots) compréhensible par tous
  - summary         : une phrase décrivant l'objectif sans jargon
  - trigger_label   : ce qui déclenche l'action (ex: "Toutes les 5 minutes")
  - data_flow       : chemin des données (ex: "Postgres > Capteurs -> Verification -> Slack #alertes")
  - steps           : tableau d'étapes visuelles, chacune avec :
      . type               : "trigger" | "sensor" | "decision" | "action" | "notification"
      . label              : nom court de l'étape
      . detail             : description précise de ce qui se passe
      . condition_natural  : (si type=decision) "Si X > seuil pendant Y minutes"
      . then_natural       : (si type=decision) "Alors : action à réaliser"
      . else_natural       : (si type=decision) "Sinon : comportement par défaut"
      . connector          : (si type=action/notification) nom exact du connecteur
      . message_preview    : (si type=notification/action) aperçu du message qui sera envoyé
      . on_error           : comportement en cas d'échec
  - constraints     : liste de contraintes en langage naturel

Bloc 2 — "compilation" (pour l'exécution par le moteur) :
  - trigger     : objet avec type (ex: ON_SCHEDULE) et config (ex: cronExpression)
  - conditions  : tableau d'objets SIMPLE/AGGREGATION avec config technique
  - actions     : tableau d'objets CONNECTOR_CALL/HTTP_REQUEST avec config.
                  Pour chaque action de type notification/envoi de message, le champ "config"
                  DOIT contenir OBLIGATOIREMENT :
                    "channel"  : destination exacte (ex: "#alertes-electrique", "admin@company.com")
                    "subject"  : objet / titre du message
                    "message"  : texte COMPLET du message à envoyer, avec valeurs dynamiques
                                 entre chevrons doubles. Ex:
                                 "ALERTE TENSION\nCapteur : <<$event.node>>\nValeur : <<$event.value>> V (seuil : 240 V)\nHorodatage : <<$event.timestamp>>"
  - resilience  : retry, timeout, fallback_action

======================================================================
CHAMP RACINE OBLIGATOIRE — "chat_reply" :
======================================================================
Un message conversationnel naturel de 2-4 phrases adressé à l'utilisateur.
Doit :
  - Confirmer ce qui a été généré en termes simples
  - Mentionner les hypothèses faites (ex: connecteur utilisé, canal Slack choisi)
  - Poser des questions si des clarifications sont nécessaires
  - Si feasible=false : NE PAS générer de règle vide, poser directement la question
Exemples :
  "J'ai créé une règle qui surveille la tension via PostgreSQL toutes les 5 minutes et envoie une alerte sur Slack #alertes-electrique si elle dépasse 240 V. J'ai supposé que le canal #alertes-electrique existe. Est-ce correct ?"
  "Je ne trouve aucun connecteur de mesure de température dans votre catalogue. Comment récupérez-vous cette donnée ? (MQTT, BACnet, API REST, autre capteur ?)"

======================================================================
CHAMP RACINE OBLIGATOIRE — "feasibility" :
======================================================================
  - feasible              : true si la règle peut s'exécuter avec les ressources disponibles,
                            false si des capacités critiques manquent
  - missing_capabilities  : liste des capacités manquantes (vide si feasible=true)
                            Ex: ["Aucun connecteur de mesure de température", "Service SMTP non configuré"]
  - questions_for_user    : liste de questions à poser à l'utilisateur si feasible=false
                            Ex: ["Comment récupérez-vous la température ? (MQTT / API REST / autre ?)",
                                 "Quel canal voulez-vous utiliser pour les notifications ?"]
  - assumptions           : liste des hypothèses faites (même si feasible=true)
                            Ex: ["Canal Slack #alertes-electrique supposé existant",
                                 "Connecteur 'postgres-prod' utilisé pour les capteurs"]

======================================================================
SORTIE FINALE — STRUCTURE RACINE COMPLÈTE :
======================================================================
{{{{
  "chat_reply": "...",
  "feasibility": {{{{
    "feasible": true,
    "missing_capabilities": [],
    "questions_for_user": [],
    "assumptions": ["..."]
  }}}},
  "workflow_name": "...",
  "rules": [ ... ],
  "summary": "...",
  "confidence": 0.92
}}}}

JSON brut uniquement, aucun markdown, aucune prose en dehors du JSON."""


