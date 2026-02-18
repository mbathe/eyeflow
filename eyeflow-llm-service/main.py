import logging
import time
import json
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse
from typing import Optional, Dict, Any
import asyncio

from config.settings import settings
from app.providers.registry import LLMProviderRegistry
from app.services.context_cache import ContextCacheService
from app.services.config_fetcher import LLMConfigFetcher
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

# Global services
llm_provider = None
context_cache = None
config_fetcher = None


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
        logger.info(f"✅ LLM Config loaded from NestJS: {llm_config}")

        # Create LLM provider from fetched config
        llm_provider = LLMProviderRegistry.create(llm_config)
        logger.info(f"✅ LLM Provider initialized: {llm_provider.name} ({llm_provider.model_name})")

    except Exception as e:
        import traceback
        logger.error(f"⚠️  Failed to initialize LLM configuration: {str(e)}")
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
    )
    logger.info(f"✅ Context cache initialized (TTL: {settings.CONTEXT_FETCH_INTERVAL_MINUTES}min)")

    # Warm up cache
    try:
        await context_cache.get_aggregated_context()
    except Exception as e:
        logger.warning(f"⚠️  Could not warm up context cache on startup: {str(e)}")

    logger.info("✅ Eyeflow LLM Service ready!")


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    cache_age = (
        context_cache._get_cache_age_minutes()
        if context_cache and context_cache.cache_timestamp
        else None
    )

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
    3. Sends to configured LLM provider
    4. Returns production-ready workflow JSON
    """
    start_time = time.time()

    try:
        logger.info(f"📝 Generating rules for intent: {request.user_intent[:100]}...")

        # Use provided context or fetch fresh
        context = request.aggregated_context
        if not context or not context.get("condition_types"):
            logger.info("📦 Fetching fresh aggregated context from NestJS...")
            context = await context_cache.get_aggregated_context()

        # Generate rules
        rules_dict, tokens_used = await llm_provider.generate_rules(
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

        logger.info(
            f"✅ Rules generated in {generation_time_ms}ms using {tokens_used} tokens"
        )

        return GenerateRulesResponse(
            workflow_rules=rules_dict,
            model_used=llm_provider.model_name,
            tokens_used=tokens_used,
            generation_time_ms=generation_time_ms,
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
        if not context or not context.get("condition_types"):
            logger.info("📦 Fetching fresh context for batch generation...")
            context = await context_cache.get_aggregated_context()

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

        refined_rules, tokens_used = await llm_provider.refine_rules(
            current_rules=request.current_rules,
            feedback=request.feedback,
            aggregated_context=request.aggregated_context,
        )

        generation_time_ms = int((time.time() - start_time) * 1000)

        logger.info(f"✅ Rules refined in {generation_time_ms}ms")

        return RefineRulesResponse(
            refined_rules=refined_rules,
            tokens_used=tokens_used,
            changes_summary=f"Rules refined based on feedback: {request.feedback[:200]}",
        )

    except Exception as e:
        logger.error(f"❌ Rule refinement failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/cache/invalidate")
async def invalidate_cache():
    """Manually invalidate context cache"""
    if context_cache:
        context_cache.invalidate_cache()
        return {"status": "context cache invalidated"}
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
    """Get cache status"""
    if not context_cache:
        raise HTTPException(status_code=500, detail="Cache service not initialized")

    return {
        "is_valid": context_cache._is_cache_valid(),
        "age_minutes": context_cache._get_cache_age_minutes(),
        "ttl_minutes": int(context_cache.cache_ttl.total_seconds() / 60),
        "has_context": context_cache.cached_context is not None,
    }


@app.get("/")
async def root():
    """Root endpoint"""
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
            "refresh_config": "POST /config/refresh",
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
