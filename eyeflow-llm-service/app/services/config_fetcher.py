import logging
import httpx
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta
from config.settings import settings

logger = logging.getLogger(__name__)


class LLMConfigFetcher:
    """
    Fetches ALL LLM agent configurations from NestJS /llm-config/for-service.
    Credentials (API keys) are returned already decrypted by NestJS.
    Provides default-config selection and task-based agent selection.
    """

    def __init__(self, nestjs_base_url: str, user_id: str = "system"):
        self.nestjs_base_url = nestjs_base_url.rstrip("/")
        self.user_id = user_id
        self.agents: List[Dict[str, Any]] = []
        self.agents_timestamp: Optional[datetime] = None
        self.agents_ttl = timedelta(minutes=settings.CONFIG_FETCH_INTERVAL_MINUTES)

    # ─── Public API ───────────────────────────────────────────────────────────

    async def get_all_agents(self, force_refresh: bool = False) -> List[Dict[str, Any]]:
        """Return all LLM agent configs (with API keys resolved by NestJS)."""
        if not force_refresh and self._is_cache_valid():
            logger.debug(f"📦 Using cached LLM agents ({len(self.agents)} agents)")
            return self.agents
        return await self._fetch_agents()

    async def get_llm_config(self, force_refresh: bool = False) -> Dict[str, Any]:
        """
        Return the default LLM agent config ready for LLMProviderRegistry.
        Falls back gracefully to .env API keys if none found in DB.
        """
        agents = await self.get_all_agents(force_refresh=force_refresh)

        # Pick default agent, then first available, then None
        agent = (
            next((a for a in agents if a.get("isDefault")), None)
            or (agents[0] if agents else None)
        )

        if not agent:
            logger.warning(
                "⚠️  No LLM agents found in NestJS — using .env fallback"
            )
            return self._env_fallback()

        logger.info(
            f"✅ Using LLM agent: {agent.get('name') or agent.get('provider')} "
            f"({agent.get('provider')}/{agent.get('model')}) "
            f"[default={agent.get('isDefault')}]"
        )
        return self._normalize(agent)

    async def get_agent_for_task(self, task_type: str) -> Dict[str, Any]:
        """
        Select the best LLM agent for a given task type using taskAffinities.
        Falls back to default if no explicit affinity declared.
        """
        agents = await self.get_all_agents()
        if not agents:
            return self._env_fallback()

        best = None
        best_score = -1

        for agent in agents:
            for aff in agent.get("taskAffinities") or []:
                if aff.get("taskType") == task_type:
                    score = aff.get("score", 0)
                    if score > best_score:
                        best_score = score
                        best = agent

        if best is None or best_score < 50:
            # Fall back to default agent
            best = next((a for a in agents if a.get("isDefault")), agents[0])
            logger.info(
                f"📌 No strong affinity for task '{task_type}' — using default agent"
            )
        else:
            logger.info(
                f"🎯 Selected agent '{best.get('name') or best.get('provider')}' "
                f"for task '{task_type}' (affinity score: {best_score})"
            )

        return self._normalize(best)

    def invalidate_cache(self):
        self.agents = []
        self.agents_timestamp = None
        logger.info("🗑️  LLM agents cache invalidated")

    def get_cache_age_minutes(self) -> Optional[float]:
        if not self.agents_timestamp:
            return None
        return (datetime.now() - self.agents_timestamp).total_seconds() / 60

    # ─── Internals ────────────────────────────────────────────────────────────

    async def _fetch_agents(self) -> List[Dict[str, Any]]:
        """Fetch all resolved LLM agents from NestJS /llm-config/for-service."""
        endpoint = f"{self.nestjs_base_url}/llm-config/for-service"
        logger.info(f"🔄 Fetching LLM agents from {endpoint} (user: {self.user_id})")

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    endpoint,
                    headers={"X-User-ID": self.user_id},
                )
                response.raise_for_status()

            self.agents = response.json()
            self.agents_timestamp = datetime.now()
            logger.info(f"✅ Loaded {len(self.agents)} LLM agent(s) from NestJS")
            for a in self.agents:
                has_key = bool(a.get("apiKey") or a.get("localConfig"))
                logger.info(
                    f"  • {a.get('name') or a.get('provider')} | {a.get('provider')}/{a.get('model')} "
                    f"| default={a.get('isDefault')} | key={'✓' if has_key else '✗'}"
                )
            return self.agents

        except httpx.HTTPStatusError as e:
            logger.error(f"❌ NestJS returned {e.response.status_code}: {e.response.text[:200]}")
            if self.agents:
                logger.warning("⚠️  Using stale agent cache")
                return self.agents
            raise ValueError(
                f"Cannot fetch LLM agents from NestJS (HTTP {e.response.status_code}). "
                "Make sure the NestJS server is running and at least one LLM agent is configured."
            )
        except Exception as e:
            logger.error(f"❌ Failed to fetch LLM agents: {e}")
            if self.agents:
                logger.warning("⚠️  Using stale agent cache")
                return self.agents
            raise

    def _normalize(self, agent: Dict[str, Any]) -> Dict[str, Any]:
        """Translate NestJS agent record to LLMProviderRegistry-compatible dict."""
        provider = (agent.get("provider") or "").lower()

        normalized: Dict[str, Any] = {
            "id": agent.get("id"),
            "name": agent.get("name"),
            "provider": provider,
            "model": agent.get("model", ""),
            "temperature": agent.get("temperature", 0.7),
            "max_tokens": agent.get("maxTokens", 4096),
            "top_p": agent.get("topP"),
            "frequency_penalty": agent.get("frequencyPenalty"),
            "presence_penalty": agent.get("presencePenalty"),
            "seed": agent.get("seed"),
            "response_format": agent.get("responseFormat"),
            "context_window": agent.get("contextWindow"),
            "stop_sequences": agent.get("stopSequences"),
            "system_prompt": agent.get("systemPrompt"),
            "skills": agent.get("skills", []),
            "task_affinities": agent.get("taskAffinities", []),
            "is_default": agent.get("isDefault", False),
            # Credentials (decrypted by NestJS)
            "api_key": agent.get("apiKey") or self._env_key(provider),
            "api_url": agent.get("apiUrl"),
            "organization": agent.get("organization"),
            "deployment": agent.get("deployment"),
            "api_version": agent.get("apiVersion"),
            "local_config": agent.get("localConfig"),
        }

        if not normalized["api_key"] and provider not in ("ollama", "ollama_local", "llamacpp", "llama_cpp", "custom"):
            logger.warning(
                f"⚠️  Agent '{agent.get('name') or provider}' has no API key in DB "
                f"— falling back to {provider.upper()}_API_KEY env var"
            )

        return normalized

    def _env_key(self, provider: str) -> Optional[str]:
        """Env-var fallback for API keys."""
        import os
        mapping = {
            "anthropic": os.getenv("ANTHROPIC_API_KEY") or settings.ANTHROPIC_API_KEY,
            "openai": os.getenv("OPENAI_API_KEY"),
            "google": os.getenv("GOOGLE_API_KEY"),
            "mistral": os.getenv("MISTRAL_API_KEY"),
            "groq": os.getenv("GROQ_API_KEY"),
            "cohere": os.getenv("COHERE_API_KEY"),
        }
        return mapping.get(provider)

    def _env_fallback(self) -> Dict[str, Any]:
        """Build a minimal config from .env vars when NestJS has no agents."""
        import os
        api_key = os.getenv("ANTHROPIC_API_KEY") or settings.ANTHROPIC_API_KEY
        provider = "anthropic" if api_key else "unknown"
        logger.warning(f"⚠️  Using .env fallback config: provider={provider}")
        return {
            "id": None,
            "name": "Fallback (.env)",
            "provider": provider,
            "model": "claude-3-haiku-20240307",
            "temperature": 0.7,
            "max_tokens": 4096,
            "api_key": api_key,
            "api_url": None,
            "organization": None,
            "system_prompt": None,
            "skills": [],
            "task_affinities": [],
            "is_default": True,
        }

    def _is_cache_valid(self) -> bool:
        if not self.agents or not self.agents_timestamp:
            return False
        return (datetime.now() - self.agents_timestamp) < self.agents_ttl
