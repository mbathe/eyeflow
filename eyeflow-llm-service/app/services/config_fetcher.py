import logging
import httpx
import os
from typing import Dict, Any, Optional
from datetime import datetime, timedelta
from config.settings import settings

logger = logging.getLogger(__name__)


class LLMConfigFetcher:
    """
    Fetches LLM configuration from NestJS /api/llm-config/default endpoint.
    Ensures configuration is always centralized and up-to-date.
    """

    def __init__(self, nestjs_base_url: str, user_id: str = "system"):
        self.nestjs_base_url = nestjs_base_url
        self.user_id = user_id
        self.config: Optional[Dict[str, Any]] = None
        self.config_timestamp: Optional[datetime] = None
        self.config_ttl = timedelta(hours=1)

    async def get_llm_config(self, force_refresh: bool = False) -> Dict[str, Any]:
        """
        Get LLM configuration from NestJS.
        Uses cache unless explicitly refreshed.

        Returns:
            Dict with provider, model, and parameters
        """
        if not force_refresh and self._is_config_valid():
            logger.debug(f"📦 Using cached LLM config (age: {self._get_config_age_seconds()}s)")
            return self.config

        return await self._fetch_fresh_config()

    async def _fetch_fresh_config(self) -> Dict[str, Any]:
        """Fetch fresh configuration from NestJS"""
        try:
            endpoint = f"{self.nestjs_base_url}/llm-config/default"
            logger.info(f"🔄 Fetching LLM config from {endpoint}")

            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    endpoint,
                    headers={"X-User-ID": self.user_id},
                )
                response.raise_for_status()

            raw_config = response.json()
            self.config = self._normalize_config(raw_config)
            self.config_timestamp = datetime.now()

            logger.info(
                f"✅ LLM Config fetched: {self.config['provider']} - {self.config['model']}"
            )
            return self.config

        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                logger.error("❌ No default LLM configuration found in NestJS")
                raise ValueError(
                    "No default LLM configuration. Please create one via NestJS API: "
                    "POST /llm-config with X-User-ID header (UUID format)"
                )
            raise
        except Exception as e:
            logger.error(f"❌ Failed to fetch LLM config: {str(e)}")
            if self.config:
                logger.warning("⚠️  Using stale config due to fetch error")
                return self.config
            raise

    def _normalize_config(self, raw_config: Dict[str, Any]) -> Dict[str, Any]:
        """
        Normalize NestJS config to provider-agnostic format.

        Handles:
        - API providers (OpenAI, Anthropic)
        - Local providers (Ollama, llama.cpp)
        - Fallback to environment variables for API keys
        """
        provider = raw_config.get("provider", "").lower()
        model = raw_config.get("model", "")

        normalized = {
            "provider": provider,
            "model": model,
            "temperature": raw_config.get("temperature", 0.3),
            "max_tokens": raw_config.get("maxTokens", 4096),
        }

        # Extract API key based on provider
        if provider == "openai":
            api_config = raw_config.get("apiConfig", {})
            api_key = (
                api_config.get("apiKey")
                or os.getenv("OPENAI_API_KEY")
                or settings.OPENAI_API_KEY
            )
            if not api_key:
                logger.warning("⚠️  OpenAI API key not found in config, OPENAI_API_KEY env var, or settings")
            normalized["api_key"] = api_key
            normalized["api_url"] = api_config.get("apiUrl")

        elif provider == "anthropic":
            api_config = raw_config.get("apiConfig", {})
            api_key = (
                api_config.get("apiKey") 
                or os.getenv("ANTHROPIC_API_KEY")
                or settings.ANTHROPIC_API_KEY
            )
            if not api_key:
                logger.warning("⚠️  Anthropic API key not found in config, ANTHROPIC_API_KEY env var, or settings")
            normalized["api_key"] = api_key

        elif provider in ["ollama_local", "llama_cpp"]:
            local_config = raw_config.get("localConfig", {})
            normalized["api_url"] = local_config.get("apiUrl", "http://localhost:11434")
            normalized["gpu_enabled"] = local_config.get("gpuEnabled", False)
            normalized["context_window"] = local_config.get("contextWindow", 4096)

        return normalized

    def _is_config_valid(self) -> bool:
        """Check if cached config is still valid"""
        if not self.config or not self.config_timestamp:
            return False

        age = datetime.now() - self.config_timestamp
        is_valid = age < self.config_ttl

        if not is_valid:
            logger.debug(f"📍 Config expired ({age.total_seconds():.0f}s old)")

        return is_valid

    def _get_config_age_seconds(self) -> int:
        """Get config age in seconds"""
        if not self.config_timestamp:
            return 0
        age = datetime.now() - self.config_timestamp
        return int(age.total_seconds())

    def invalidate_cache(self):
        """Manually invalidate config cache"""
        self.config = None
        self.config_timestamp = None
        logger.info("🗑️  LLM config cache invalidated")
