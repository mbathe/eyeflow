import logging
import json
import httpx
from typing import Dict, Any, Optional
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)


class ContextCacheService:
    """
    Manages caching of aggregated context from NestJS server.
    Reduces API calls and improves performance.
    """

    def __init__(self, nestjs_url: str, cache_ttl_minutes: int = 60):
        self.nestjs_url = nestjs_url
        self.cache_ttl = timedelta(minutes=cache_ttl_minutes)
        self.cached_context: Optional[Dict[str, Any]] = None
        self.cache_timestamp: Optional[datetime] = None

    async def get_aggregated_context(self) -> Dict[str, Any]:
        """
        Get aggregated context from NestJS, using cache if valid.

        Returns:
            Complete aggregated context with 20+ types
        """
        if self._is_cache_valid():
            logger.info(f"📦 Using cached context ({self._get_cache_age_minutes()}min old)")
            return self.cached_context

        return await self._fetch_fresh_context()

    async def _fetch_fresh_context(self) -> Dict[str, Any]:
        """Fetch fresh context from NestJS server"""
        try:
            endpoint = f"{self.nestjs_url}/tasks/manifest/llm-context/aggregated"
            logger.info(f"🔄 Fetching aggregated context from {endpoint}")

            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(endpoint)
                response.raise_for_status()

            self.cached_context = response.json()
            self.cache_timestamp = datetime.now()

            condition_count = len(
                self.cached_context.get("conditionTypes", [])
            )
            action_count = len(self.cached_context.get("actionTypes", []))
            logger.info(
                f"✅ Context fetched: {condition_count} conditions, {action_count} actions"
            )

            return self.cached_context

        except Exception as e:
            logger.error(f"❌ Failed to fetch context: {str(e)}")
            if self.cached_context:
                logger.warning("⚠️  Using stale cache due to fetch error")
                return self.cached_context
            raise

    def _is_cache_valid(self) -> bool:
        """Check if cache is still valid"""
        if not self.cached_context or not self.cache_timestamp:
            return False

        age = datetime.now() - self.cache_timestamp
        is_valid = age < self.cache_ttl

        if not is_valid:
            logger.info(
                f"📍 Cache expired ({age.total_seconds():.0f}s old, TTL {self.cache_ttl.total_seconds():.0f}s)"
            )

        return is_valid

    def _get_cache_age_minutes(self) -> int:
        """Get cache age in minutes"""
        if not self.cache_timestamp:
            return 0
        age = datetime.now() - self.cache_timestamp
        return int(age.total_seconds() / 60)

    def invalidate_cache(self):
        """Manually invalidate cache"""
        self.cached_context = None
        self.cache_timestamp = None
        logger.info("🗑️  Cache invalidated")
