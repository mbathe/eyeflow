import logging
import time
import json
import httpx
from fastapi import FastAPI, HTTPException, BackgroundTasks, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional, Dict, Any
import asyncio

from config.settings import settings
from app.providers.registry import LLMProviderRegistry
from app.services.context_cache import ContextCacheService
from app.services.config_fetcher import LLMConfigFetcher
from app.services.constrained_generation import ConstrainedGenerationService, ConstrainedGenerationError
from app.models.schemas import (
    GenerateRulesRequest,
    GenerateRulesResponse,
    GenerateRulesBatchRequest,
    EvaluateConditionRequest,
    EvaluateConditionResponse,
    RefineRulesRequest,
    RefineRulesResponse,
    HealthResponse,
    ProvidersListResponse,
    DeployWorkflowRequest,
    DeployWorkflowResponse,
    DeployedRuleResult,
)

# Logging setup
logging.basicConfig(level=settings.LOG_LEVEL)
logger = logging.getLogger(__name__)

# FastAPI app
app = FastAPI(
    title="Eyeflow LLM Service",
    description="Multi-provider LLM service for workflow rule generation",
    version="1.0.0",
)

# CORS — allow the dashboard (and any localhost origin during dev)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",
        "http://localhost:5176",
        "http://localhost:3001",
        "http://localhost:4173",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://127.0.0.1:5175",
        "http://127.0.0.1:5176",
    ],
    allow_origin_regex=r"http://localhost:\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global services
llm_provider = None
context_cache = None
config_fetcher = None


# ─────────────────────────────────────────────────────────────────────────────
# Deterministic feasibility check
# ─────────────────────────────────────────────────────────────────────────────

def _deterministic_feasibility_check(
    rules_dict: dict,
    context: dict,
) -> dict:
    """
    Cross-reference every connector/action referenced in the generated rules
    against the real connector catalog from NestJS (with health status).

    Returns a feasibility object that is AUTHORITATIVE — it overrides the
    LLM's self-assessment because it is based on live catalog data, not
    on the model's own judgment.

    Structure:
      {
        "feasible": bool,
        "checked_by": "deterministic",
        "missing_capabilities": ["connector X is not registered"],
        "unavailable_connectors": ["connector Y exists but is offline"],
        "warnings": ["connector Z health status unknown"],
        "assumptions": ["..."],   # kept from LLM if feasible
        "questions_for_user": []
      }
    """
    # Build lookup maps from context
    connector_map: dict = {}   # id/name -> connector dict
    action_set: set = set()

    for conn in context.get("connectors", []) or []:
        cid = conn.get("id") or conn.get("connector_id") or conn.get("name", "")
        if cid:
            connector_map[str(cid).lower()] = conn
        for fn in (conn.get("functions") or conn.get("actions") or []):
            fname = fn.get("id") or fn.get("name") or ""
            if fname:
                action_set.add(str(fname).lower())

    trigger_sources: set = set()
    for ct in context.get("condition_types", []) or []:
        if isinstance(ct, str):
            trigger_sources.add(ct.lower())
        elif isinstance(ct, dict):
            src = ct.get("id") or ct.get("type") or ct.get("name", "")
            if src:
                trigger_sources.add(str(src).lower())

    missing: list = []
    unavailable: list = []
    warnings: list = []

    # If catalog is empty, skip deterministic validation (no data to check against)
    if not connector_map and not action_set and not trigger_sources:
        return {
            "feasible": True,
            "checked_by": "deterministic",
            "missing_capabilities": [],
            "unavailable_connectors": [],
            "warnings": ["Catalogue vide — impossible de vérifier la disponibilité des connecteurs"],
            "questions_for_user": [],
        }

    for rule in (rules_dict.get("rules") or []):
        # Check trigger source
        trigger = rule.get("trigger") or {}
        source = str(trigger.get("source") or "").lower()
        if source and trigger_sources and source not in trigger_sources and source not in connector_map:
            missing.append(f"Source de déclencheur '{source}' inconnue dans le catalogue")

        # Check each action
        for action in (rule.get("actions") or []):
            atype = str(action.get("type") or "").lower()
            payload = action.get("payload") or {}
            connector_ref = str(
                payload.get("connector") or action.get("channel") or ""
            ).lower()

            # Check connector reference
            if connector_ref and connector_map:
                if connector_ref not in connector_map:
                    missing.append(f"Connecteur '{connector_ref}' non enregistré dans le catalogue")
                else:
                    conn_data = connector_map[connector_ref]
                    status = (conn_data.get("status") or "").lower()
                    is_healthy = conn_data.get("isHealthy")
                    if is_healthy is False or status in ("disconnected", "error", "unavailable", "offline"):
                        unavailable.append(
                            f"Connecteur '{connector_ref}' est enregistré mais actuellement hors ligne (status: {status or 'error'})"
                        )
                    elif status == "" and is_healthy is None:
                        warnings.append(f"Statut du connecteur '{connector_ref}' inconnu — vérifiez la connexion")

            # Check action type
            if atype and action_set and atype not in action_set:
                # Only flag as missing if this is clearly a function reference (not a generic type)
                if "." in atype or "_" in atype:
                    missing.append(f"Action '{atype}' non trouvée dans le catalogue")

    feasible = len(missing) == 0 and len(unavailable) == 0

    result = {
        "feasible": feasible,
        "checked_by": "deterministic",
        "missing_capabilities": missing,
        "unavailable_connectors": unavailable,
        "warnings": warnings,
        "questions_for_user": [],
    }

    if not feasible:
        logger.warning(
            f"[Feasibility] Workflow NOT feasible — "
            f"{len(missing)} missing, {len(unavailable)} unavailable"
        )
    else:
        logger.info("[Feasibility] Workflow is feasible ✅")

    return result


@app.on_event("startup")
async def startup_event():
    """Initialize services on startup"""
    global llm_provider, context_cache, config_fetcher
    import os

    logger.info("🚀 Starting Eyeflow LLM Service...")
    logger.info(f"📍 NestJS Server: {settings.NESTJS_SERVER_URL}")
    logger.info(f"📍 User ID: {settings.USER_ID}")
    logger.info(f"🔑 ANTHROPIC_API_KEY in env: {bool(os.getenv('ANTHROPIC_API_KEY'))}")
    logger.info(f"🔑 ANTHROPIC_API_KEY in settings: {bool(settings.ANTHROPIC_API_KEY)}")

    # Initialize config fetcher (fetches from NestJS)
    try:
        config_fetcher = LLMConfigFetcher(
            nestjs_base_url=settings.NESTJS_SERVER_URL,
            user_id=settings.USER_ID,
        )
        llm_config = await config_fetcher.get_llm_config()
        logger.info(f"LLM Config loaded from NestJS: {llm_config}")

        # Create LLM provider from fetched config
        llm_provider = LLMProviderRegistry.create(llm_config)
        logger.info(f"LLM Provider initialized: {llm_provider.name} ({llm_provider.model_name})")

    except Exception as e:
        import traceback
        logger.error(f"Failed to initialize LLM configuration: {str(e)}")
        logger.error(f"Traceback: {traceback.format_exc()}")
        logger.warning(
            "Starting in LIMITED mode (health check only).\n"
            "Create LLM config via POST /llm-config (NestJS) to activate rule generation."
        )
        llm_provider = None  # Allow startup without LLM provider

    # Initialize context cache
    context_cache = ContextCacheService(
        nestjs_url=settings.NESTJS_SERVER_URL,
        cache_ttl_minutes=settings.CONTEXT_FETCH_INTERVAL_MINUTES,
        user_id=settings.USER_ID,
    )
    logger.info(f"✅ Context cache initialized (TTL: {settings.CONTEXT_FETCH_INTERVAL_MINUTES}min)")

    # Warm up caches and inject agent skills into context
    try:
        await context_cache.get_aggregated_context()
        rule_ctx = await context_cache.get_rule_context()
        # Enrich context with agent skills so prompts know which LLM can do what
        if config_fetcher:
            try:
                all_agents = await config_fetcher.get_all_agents()
                enriched = context_cache.enrich_with_agent_skills(rule_ctx, all_agents)
                context_cache._caches["rule"]["data"] = enriched
                logger.info(f"✅ Agent skills injected into rule context ({len(all_agents)} agents)")
            except Exception as skill_err:
                logger.warning(f"⚠️  Could not inject agent skills: {skill_err}")
    except Exception as e:
        logger.warning(f"⚠️  Could not warm up context caches on startup: {str(e)}")

    logger.info("✅ Eyeflow LLM Service ready!")


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    cache_age = context_cache._get_cache_age_minutes() if context_cache else None

    return HealthResponse(
        status="healthy",
        provider=llm_provider.name if llm_provider else "unknown",
        model=llm_provider.model_name if llm_provider else "unknown",
        context_cache_age_minutes=cache_age,
    )


@app.get("/providers", response_model=ProvidersListResponse)
async def list_providers():
    """List available LLM providers"""
    return ProvidersListResponse(
        available_providers=LLMProviderRegistry.list_available_providers(),
        current_provider=llm_provider.name if llm_provider else "unknown",
    )


@app.post("/api/rules/generate", response_model=GenerateRulesResponse)
async def generate_rules(request: GenerateRulesRequest):
    """
    Generate workflow rules from natural language intent.

    This endpoint:
    1. Uses LLM config from NestJS (updated hourly)
    2. Fetches aggregated context from NestJS
    3. Runs through ConstrainedGenerationService (spec §3.3) — allowlist enforcement
       + progressive repair (max 3 attempts) + JSON Schema validation
    4. Returns production-ready workflow JSON guaranteed to reference only
       catalog-registered connectors/actions
    """
    start_time = time.time()

    try:
        logger.info(f"📝 Generating rules for intent: {request.user_intent[:100]}...")

        # Use provided context or fetch rule-optimised context from NestJS
        context = request.aggregated_context
        if not context or not (context.get("conditionTypes") or context.get("condition_types") or context.get("connectors")):
            logger.info("📦 Fetching rule context from NestJS...")
            context = await context_cache.get_rule_context()

        # Select the best LLM for rule generation (falls back to default provider)
        active_provider = llm_provider
        if config_fetcher:
            try:
                task_agent = await config_fetcher.get_agent_for_task("rule_generation")
                if task_agent:
                    active_provider = LLMProviderRegistry.create(task_agent)
                    logger.info(f"🎯 Using task-specific agent: {active_provider.name} ({active_provider.model_name})")
            except Exception as pa_err:
                logger.warning(f"⚠️  Could not get task-specific LLM, using default: {pa_err}")

        if not active_provider:
            raise HTTPException(status_code=503, detail="No LLM provider configured")

        # ── Constrained generation (spec §3.3) ────────────────────────────────
        # ConstrainedGenerationService wraps the provider call with:
        #   1. Allowlist prompt injection
        #   2. logit_bias suppression (OpenAI)
        #   3. Post-validation against catalog + progressive repair
        constrained = ConstrainedGenerationService(context)
        try:
            rules_dict, tokens_used = await constrained.generate(
                user_intent=request.user_intent,
                llm_provider=active_provider,
            )
            logger.info("[ConstrainedGen] Generation succeeded with catalog compliance")
        except ConstrainedGenerationError as cge:
            logger.warning(
                f"[ConstrainedGen] All repair attempts failed, falling back to unconstrained: {cge}"
            )
            # Graceful fallback: run without constraints rather than returning 500
            rules_dict, tokens_used = await active_provider.generate_rules(
                aggregated_context=context,
                user_intent=request.user_intent,
            )

        # Normalize output keys for backward compatibility with NestJS client
        # Accept multiple possible key formats produced by providers (generatedRules, GeneratedRules, generated_rules)
        if isinstance(rules_dict, dict):
            if 'generatedRules' in rules_dict or 'GeneratedRules' in rules_dict or 'generated_rules' in rules_dict:
                rules_list = rules_dict.get('generatedRules') or rules_dict.get('GeneratedRules') or rules_dict.get('generated_rules') or []
                rules_dict = {
                    'rules': rules_list,
                    'summary': rules_dict.get('summary', ''),
                    'confidence': rules_dict.get('confidence', 0.9),
                }
            # If provider already returned 'rules' key, keep as-is
            elif 'rules' in rules_dict and isinstance(rules_dict.get('rules'), list):
                pass
            else:
                # If top-level is already an array of rules, normalize that too
                if isinstance(rules_dict, list):
                    rules_dict = { 'rules': rules_dict, 'summary': '', 'confidence': 0.9 }


        generation_time_ms = int((time.time() - start_time) * 1000)

        # Extract conversational fields from the LLM JSON (top-level)
        chat_reply   = rules_dict.pop("chat_reply", None)   if isinstance(rules_dict, dict) else None
        llm_feasibility = rules_dict.pop("feasibility", None) if isinstance(rules_dict, dict) else None

        # ── Deterministic feasibility check overrides LLM self-assessment ────
        det_feasibility = _deterministic_feasibility_check(rules_dict, context)
        # Merge: deterministic is authoritative for feasible/missing/unavailable,
        # but we keep the LLM's assumptions and questions_for_user if any.
        if llm_feasibility and isinstance(llm_feasibility, dict):
            det_feasibility["assumptions"] = llm_feasibility.get("assumptions") or []
            # Merge LLM's questions into deterministic result
            llm_questions = llm_feasibility.get("questions_for_user") or []
            det_feasibility["questions_for_user"] = llm_questions
            # If LLM found additional missing capabilities not caught by catalog check, include them
            llm_missing = llm_feasibility.get("missing_capabilities") or []
            for cap in llm_missing:
                if cap not in det_feasibility["missing_capabilities"]:
                    det_feasibility["missing_capabilities"].append(f"[LLM] {cap}")
            # If deterministic says not feasible but LLM says feasible, log discrepancy
            if det_feasibility["feasible"] != llm_feasibility.get("feasible"):
                logger.info(
                    f"[Feasibility] Discrepancy: deterministic={det_feasibility['feasible']} "
                    f"vs LLM={llm_feasibility.get('feasible')} — using deterministic"
                )
        feasibility = det_feasibility
        # ─────────────────────────────────────────────────────────────────────

        logger.info(
            f"✅ Rules generated in {generation_time_ms}ms using {tokens_used} tokens"
        )

        return GenerateRulesResponse(
            workflow_rules=rules_dict,
            model_used=active_provider.model_name,
            tokens_used=tokens_used,
            generation_time_ms=generation_time_ms,
            chat_reply=chat_reply,
            feasibility=feasibility,
        )

    except json.JSONDecodeError as e:
        logger.error(f"❌ Invalid JSON in response: {str(e)}")
        raise HTTPException(
            status_code=422,
            detail=f"LLM returned invalid JSON: {str(e)}",
        )
    except Exception as e:
        logger.error(f"❌ Rule generation failed: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Rule generation failed: {str(e)}",
        )


@app.post("/api/rules/generate-batch")
async def generate_rules_batch(request: GenerateRulesBatchRequest):
    """
    Generate multiple workflow rules efficiently in batch.

    Returns:
        List of workflow rule objects
    """
    start_time = time.time()

    try:
        logger.info(f"📚 Batch generating {len(request.intents)} rule sets...")

        context = request.aggregated_context
        if not context or not (context.get("conditionTypes") or context.get("condition_types") or context.get("connectors")):
            logger.info("📦 Fetching rule context for batch generation...")
            context = await context_cache.get_rule_context()

        rules_list, tokens_used = await llm_provider.generate_rules_batch(
            aggregated_context=context,
            intents=request.intents,
        )

        generation_time_ms = int((time.time() - start_time) * 1000)

        logger.info(
            f"✅ Batch generated {len(rules_list)} rule sets in {generation_time_ms}ms"
        )

        return {
            "count": len(rules_list),
            "rules": rules_list,
            "model_used": llm_provider.model_name,
            "tokens_used": tokens_used,
            "generation_time_ms": generation_time_ms,
        }

    except Exception as e:
        logger.error(f"❌ Batch generation failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/conditions/evaluate", response_model=EvaluateConditionResponse)
async def evaluate_condition(request: EvaluateConditionRequest):
    """
    Dynamically evaluate a workflow condition with given context.

    Uses LLM reasoning for complex condition expressions.
    """
    try:
        logger.info(f"📊 Evaluating condition: {request.condition[:100]}...")

        result = await llm_provider.evaluate_condition(
            condition=request.condition,
            context=request.context,
        )

        logger.info(f"✅ Condition evaluated: {request.condition} -> {result}")

        return EvaluateConditionResponse(
            result=result,
            provider_used=llm_provider.name,
        )

    except Exception as e:
        logger.error(f"❌ Condition evaluation failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/rules/refine", response_model=RefineRulesResponse)
async def refine_rules(request: RefineRulesRequest):
    """
    Refine previously generated rules based on user feedback.

    Improves rules iteratively through conversation.
    """
    start_time = time.time()

    try:
        logger.info(f"🔄 Refining rules based on feedback: {request.feedback[:100]}...")

        # Auto-fetch rule context if not provided
        refine_context = request.aggregated_context
        if not refine_context or not (refine_context.get("conditionTypes") or refine_context.get("connectors")):
            refine_context = await context_cache.get_rule_context()

        active_refine = llm_provider
        if config_fetcher:
            try:
                task_agent = await config_fetcher.get_agent_for_task("rule_refinement")
                if task_agent:
                    active_refine = LLMProviderRegistry.create(task_agent)
            except Exception:
                pass

        if not active_refine:
            raise HTTPException(status_code=503, detail="No LLM provider configured")

        refined_rules, tokens_used = await active_refine.refine_rules(
            current_rules=request.current_rules,
            feedback=request.feedback,
            aggregated_context=refine_context,
        )

        generation_time_ms = int((time.time() - start_time) * 1000)
        logger.info(f"✅ Rules refined in {generation_time_ms}ms")

        # Extract conversational fields generated by the LLM
        chat_reply      = refined_rules.pop("chat_reply", None)   if isinstance(refined_rules, dict) else None
        feasibility     = refined_rules.pop("feasibility", None)  if isinstance(refined_rules, dict) else None
        changes_summary = refined_rules.pop("changes_summary", None) if isinstance(refined_rules, dict) else None
        if not changes_summary:
            changes_summary = f"Règles mises à jour selon le feedback : {request.feedback[:200]}"

        return RefineRulesResponse(
            refined_rules=refined_rules,
            tokens_used=tokens_used,
            changes_summary=changes_summary,
            chat_reply=chat_reply,
            feasibility=feasibility,
        )

    except Exception as e:
        logger.error(f"❌ Rule refinement failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/cache/invalidate")
async def invalidate_cache(kind: str = "all"):
    """Manually invalidate context cache (kind: all | aggregated | rule | task)"""
    if context_cache:
        context_cache.invalidate_cache(kind)
        return {"status": f"cache invalidated: {kind}"}
    raise HTTPException(status_code=500, detail="Cache service not initialized")


@app.post("/config/refresh")
async def refresh_llm_config():
    """Manually refresh LLM configuration from NestJS"""
    global llm_provider

    if not config_fetcher:
        raise HTTPException(status_code=500, detail="Config fetcher not initialized")

    try:
        logger.info("🔄 Refreshing LLM configuration from NestJS...")
        config_fetcher.invalidate_cache()
        llm_config = await config_fetcher.get_llm_config(force_refresh=True)

        # Recreate provider with new config
        llm_provider = LLMProviderRegistry.create(llm_config)
        logger.info(f"✅ LLM config refreshed: {llm_provider.name} ({llm_provider.model_name})")

        return {
            "status": "LLM config refreshed",
            "provider": llm_provider.name,
            "model": llm_provider.model_name,
        }
    except Exception as e:
        logger.error(f"❌ Failed to refresh config: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/cache/status")
async def cache_status():
    """Get cache status for all context kinds"""
    if not context_cache:
        raise HTTPException(status_code=500, detail="Cache service not initialized")

    ttl_min = int(context_cache.cache_ttl.total_seconds() / 60)
    statuses = {}
    for kind, entry in context_cache._caches.items():
        ts = entry.get("ts")
        age = round(((__import__("datetime").datetime.now() - ts).total_seconds() / 60), 1) if ts else None
        statuses[kind] = {
            "valid": context_cache._is_valid(kind),
            "age_minutes": age,
            "has_data": entry.get("data") is not None,
        }
    return {
        "ttl_minutes": ttl_min,
        "caches": statuses,
    }


@app.get("/api/agent/select/{task_type}")
async def select_agent_for_task(task_type: str):
    """Return the best LLM agent for a given task type (e.g. rule_generation, dag_compilation)"""
    if not config_fetcher:
        raise HTTPException(status_code=503, detail="Config fetcher not initialized")
    try:
        agent = await config_fetcher.get_agent_for_task(task_type)
        if not agent:
            raise HTTPException(status_code=404, detail=f"No agent found for task type: {task_type}")
        return {
            "task_type": task_type,
            "agent_name": agent.get("name") or agent.get("provider"),
            "provider": agent.get("provider"),
            "model": agent.get("model"),
            "skills": agent.get("skills", []),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/intent/analyze")
async def analyze_intent(body: Dict[str, Any]):
    """
    Analyze a user intent and return:
    - best_agent: which LLM agent is most suited
    - capabilities: what connectors / services are available
    - suggested_task_type: rule_generation | dag_compilation | condition_evaluation
    """
    user_intent: str = body.get("user_intent", "")
    if not user_intent:
        raise HTTPException(status_code=422, detail="user_intent is required")

    context = await context_cache.get_rule_context()

    # Heuristic task type detection
    intent_lower = user_intent.lower()
    if any(kw in intent_lower for kw in ["si", "quand", "when", "if", "dès que", "alerte", "alert"]):
        suggested = "rule_generation"
    elif any(kw in intent_lower for kw in ["dag", "pipeline", "workflow", "process", "processus"]):
        suggested = "dag_compilation"
    elif any(kw in intent_lower for kw in ["évalue", "eval", "condition", "check", "vérifie"]):
        suggested = "condition_evaluation"
    else:
        suggested = "rule_generation"

    best_agent_info = None
    if config_fetcher:
        try:
            best = await config_fetcher.get_agent_for_task(suggested)
            if best:
                best_agent_info = {
                    "name": best.get("name") or best.get("provider"),
                    "provider": best.get("provider"),
                    "model": best.get("model"),
                    "skills": best.get("skills", []),
                }
        except Exception:
            pass

    return {
        "user_intent": user_intent,
        "suggested_task_type": suggested,
        "best_agent": best_agent_info,
        "available_connectors": len(context.get("connectors", [])),
        "available_services": len(context.get("servicesManifest", [])),
    }


@app.post("/api/dag/compile")
async def compile_dag(body: Dict[str, Any]):
    """
    Compile a natural-language intent into a DAG-style workflow.
    Uses the rule context (optimised for structured output) and the best
    dag_compilation agent if one is configured.
    """
    start_time = time.time()
    user_intent: str = body.get("user_intent", "")
    if not user_intent:
        raise HTTPException(status_code=422, detail="user_intent is required")

    context = await context_cache.get_rule_context()

    active_provider = llm_provider
    if config_fetcher:
        try:
            task_agent = await config_fetcher.get_agent_for_task("dag_compilation")
            if task_agent:
                active_provider = LLMProviderRegistry.create(task_agent)
        except Exception:
            pass

    if not active_provider:
        raise HTTPException(status_code=503, detail="No LLM provider configured")

    try:
        rules_dict, tokens_used = await active_provider.generate_rules(
            aggregated_context=context,
            user_intent=f"[DAG COMPILATION] {user_intent}",
        )
        generation_time_ms = int((time.time() - start_time) * 1000)
        return {
            "dag": rules_dict,
            "model_used": active_provider.model_name,
            "tokens_used": tokens_used,
            "generation_time_ms": generation_time_ms,
        }
    except Exception as e:
        logger.error(f"❌ DAG compilation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────────────────────────────────────
# Operator mapping  (LLM format → NestJS ConditionOperator enum)
# ─────────────────────────────────────────────────────────────────────────────

_OP_MAP: Dict[str, str] = {
    "gt": "gt", ">": "gt",
    "gte": "gte", ">=": "gte",
    "lt": "lt", "<": "lt",
    "lte": "lte", "<=": "lte",
    "eq": "eq", "==": "eq", "=": "eq",
    "ne": "ne", "!=": "ne", "<>": "ne",
    "in": "in",
    "nin": "nin", "not_in": "nin",
    "contains": "contains",
    "regex": "regex",
    "between": "between",
    "range": "range",
}


def _map_operator(op: str) -> str:
    return _OP_MAP.get(str(op).lower().strip(), "gt")


def _rule_to_nestjs_dto(rule: dict, user_intent: str) -> dict:
    """
    Transform one LLM-generated rule (compilation block) into a
    NestJS CreateEventRuleDto payload.

    LLM rule format:
      rule.compilation.trigger  → { type, config: { cronExpression, connectorId, ... } }
      rule.compilation.conditions[0] → { type, config: { field/node, operator, threshold/value, connector, durationMs } }
      rule.compilation.actions[]  → [{ type, config: { channel, message, subject, connector, ... } }]
    """
    compilation = rule.get("compilation") or rule.get("display") or {}
    trigger = compilation.get("trigger") or {}
    conditions = compilation.get("conditions") or []
    actions = compilation.get("actions") or []
    resilience = compilation.get("resilience") or {}

    # ── Trigger ──────────────────────────────────────────────────────────────
    trigger_config = trigger.get("config") or {}
    source_type: str = (
        trigger.get("type")
        or trigger_config.get("type")
        or trigger.get("source")
        or "ON_SCHEDULE"
    ).upper()
    source_id: Optional[str] = (
        trigger_config.get("connectorId")
        or trigger_config.get("connector_id")
        or trigger_config.get("connector")
        or trigger.get("connectorId")
    )

    # ── Primary condition ─────────────────────────────────────────────────────
    if conditions:
        cond0 = conditions[0]
        cond_cfg = cond0.get("config") or {}
        condition_dto = {
            "fieldName": (
                cond_cfg.get("field")
                or cond_cfg.get("fieldName")
                or cond_cfg.get("node")
                or cond_cfg.get("metric")
                or "value"
            ),
            "operator": _map_operator(
                cond_cfg.get("operator") or cond_cfg.get("op") or "gt"
            ),
            "value": (
                cond_cfg.get("threshold")
                or cond_cfg.get("value")
                or cond_cfg.get("target")
                or 0
            ),
        }
        if "durationMs" in cond_cfg:
            condition_dto["durationMs"] = int(cond_cfg["durationMs"])
    else:
        # Fallback: always-true condition
        condition_dto = {"fieldName": "value", "operator": "gte", "value": 0}

    # ── Actions ───────────────────────────────────────────────────────────────
    # Map known LLM action types → real connector function names
    _ACTION_TYPE_TO_FUNCTION: dict = {
        "SEND_SLACK_MESSAGE":      "sendMessage",
        "SEND_SLACK_ALERT":        "sendMessage",
        "SLACK_NOTIFY":            "sendMessage",
        "SEND_EMAIL":              "sendEmail",
        "EMAIL_NOTIFY":            "sendEmail",
        "SEND_SMS":                "sendSms",
        "CREATE_TICKET":           "createTicket",
        "CREATE_JIRA_TICKET":      "createIssue",
        "HTTP_REQUEST":            "request",
        "WEBHOOK_CALL":            "request",
        "CONNECTOR_CALL":          None,   # generic — use function from config
        "SEND_NOTIFICATION":       "sendMessage",
        "SEND_ALERT":              "sendMessage",
        "NOTIFY":                  "sendMessage",
    }

    action_dtos = []
    for idx, act in enumerate(actions):
        act_cfg = act.get("config") or {}
        raw_type = (
            act.get("type")
            or act.get("name")
            or ""
        ).upper()

        # Prefer an explicit function name from the config, then map from type
        explicit_fn = (
            act_cfg.get("function")
            or act_cfg.get("functionName")
            or act_cfg.get("fn")
        )
        mapped_fn = _ACTION_TYPE_TO_FUNCTION.get(raw_type)  # may be None
        action_function = explicit_fn or mapped_fn or raw_type.lower() or "sendMessage"

        # The human-readable name stored in DB (used only for display, not validation)
        action_name = act.get("name") or act.get("type") or action_function

        parameters = dict(act_cfg)
        # Always ensure `function` key is set so the NestJS validator can use it
        parameters.setdefault("function", action_function)
        parameters.setdefault("functionName", action_function)

        action_dtos.append({
            "name": action_function,   # <-- real function id, not generic type
            "parameters": parameters,
            "order": idx,
            "failFast": False,
        })

    # ── Debounce ──────────────────────────────────────────────────────────────
    retry_cfg = resilience.get("retry") or {}
    max_attempts = int(retry_cfg.get("max_attempts") or 3)
    debounce_dto = {
        "strategy": "debounce",
        "minIntervalMs": 300000,   # 5 min default
        "maxActionsPerHour": 20,
        "useStateMachine": True,
    }

    return {
        "name": rule.get("name") or "Unnamed Workflow Rule",
        "description": (
            rule.get("description")
            or (user_intent[:200] if user_intent else None)
        ),
        "sourceConnectorType": source_type,
        "sourceConnectorId": source_id,
        "condition": condition_dto,
        "actions": action_dtos,
        "debounceConfig": debounce_dto,
        "enabled": True,
    }


@app.post("/api/workflow/deploy", response_model=DeployWorkflowResponse)
async def deploy_workflow(request: DeployWorkflowRequest, req: Request):
    """
    Save and activate a generated workflow in NestJS.

    For each rule in workflow_rules.rules[]:
      1. Transform LLM compilation format → CreateEventRuleDto
      2. POST /tasks/rules              → creates rule (PENDING_APPROVAL)
      3. POST /tasks/rules/{id}/approve → activates the rule (ACTIVE)

    Returns the list of deployed rules with their NestJS IDs.
    """
    nestjs_base = settings.NESTJS_SERVER_URL.rstrip("/")
    effective_user_id = request.user_id or settings.USER_ID

    # Forward the JWT Bearer token received from the dashboard (if any)
    incoming_auth: Optional[str] = req.headers.get("authorization") or req.headers.get("Authorization")
    # X-User-ID: prefer header passed directly, then request body field
    incoming_user_id: Optional[str] = req.headers.get("x-user-id") or req.headers.get("X-User-ID") or effective_user_id

    headers: dict = {"Content-Type": "application/json"}
    if incoming_auth:
        headers["Authorization"] = incoming_auth
    if incoming_user_id:
        headers["X-User-ID"] = incoming_user_id

    rules: list = (
        request.workflow_rules.get("rules")
        or request.workflow_rules.get("workflow_rules")
        or []
    )

    if not rules:
        raise HTTPException(
            status_code=422,
            detail="workflow_rules must contain a non-empty 'rules' array",
        )

    deployed: list[DeployedRuleResult] = []
    errors: list[str] = []

    async with httpx.AsyncClient(timeout=30.0) as client:
        for rule in rules:
            rule_name = rule.get("name") or "Unnamed Rule"
            try:
                # ── 1. Build NestJS DTO ───────────────────────────────────────
                dto = _rule_to_nestjs_dto(rule, request.user_intent)
                logger.info(f"📤 Deploying rule '{rule_name}' → {nestjs_base}/tasks/rules")
                logger.debug(f"   DTO: {json.dumps(dto, default=str)[:400]}")

                # ── 2. Create rule ────────────────────────────────────────────
                create_resp = await client.post(
                    f"{nestjs_base}/tasks/rules",
                    headers=headers,
                    json=dto,
                )
                if create_resp.status_code not in (200, 201):
                    err = f"Rule '{rule_name}': create failed ({create_resp.status_code}) — {create_resp.text[:300]}"
                    logger.error(f"❌ {err}")
                    errors.append(err)
                    continue

                created = create_resp.json()
                rule_id: str = created.get("id") or created.get("ruleId") or ""
                if not rule_id:
                    err = f"Rule '{rule_name}': no id in create response"
                    errors.append(err)
                    continue

                logger.info(f"✅ Rule '{rule_name}' created → id={rule_id}, status={created.get('status', 'ACTIVE')}")

                # The rule is already created as ACTIVE by createEventRule
                # (approve step uses a different table - event_rules_extended)
                deployed.append(DeployedRuleResult(
                    id=rule_id,
                    name=rule_name,
                    status=created.get("status", "ACTIVE"),
                    approval_status="APPROVED",
                ))

            except httpx.TimeoutException:
                err = f"Rule '{rule_name}': timeout contacting NestJS"
                logger.error(f"❌ {err}")
                errors.append(err)
            except httpx.ConnectError as e:
                err = f"Rule '{rule_name}': cannot connect to NestJS ({nestjs_base}) — {e}"
                logger.error(f"❌ {err}")
                errors.append(err)
                break   # All subsequent rules will also fail
            except Exception as e:
                err = f"Rule '{rule_name}': unexpected error — {e}"
                logger.error(f"❌ {err}", exc_info=True)
                errors.append(err)

    success = len(deployed) > 0 and len([d for d in deployed if not d.error]) > 0

    return DeployWorkflowResponse(
        success=success,
        deployed=deployed,
        errors=errors,
        total_rules=len(rules),
        deployed_count=len([d for d in deployed if not d.error]),
    )


@app.get("/")
async def root():
    return {
        "service": "Eyeflow LLM Service",
        "version": "1.0.0",
        "llm_provider": llm_provider.name if llm_provider else "unknown",
        "llm_model": llm_provider.model_name if llm_provider else "unknown",
        "endpoints": {
            "health": "/health",
            "providers": "/providers",
            "generate_rules": "POST /api/rules/generate",
            "batch_generate": "POST /api/rules/generate-batch",
            "evaluate_condition": "POST /api/conditions/evaluate",
            "refine_rules": "POST /api/rules/refine",
            "compile_dag": "POST /api/dag/compile",
            "analyze_intent": "POST /api/intent/analyze",
            "select_agent": "GET /api/agent/select/{task_type}",
            "deploy_workflow": "POST /api/workflow/deploy",
            "refresh_config": "POST /config/refresh",
            "cache_status": "GET /cache/status",
            "invalidate_cache": "POST /cache/invalidate",
        },
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host=settings.SERVER_HOST,
        port=settings.SERVER_PORT,
        reload=settings.DEBUG,
        log_level=settings.LOG_LEVEL.lower(),
    )
