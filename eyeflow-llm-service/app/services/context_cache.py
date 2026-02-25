import logging
import json
import httpx
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)


class ContextCacheService:
    """
    Manages caching of aggregated context from NestJS server.
    Provides specialized context for each use case (rules, tasks, DAG compilation).
    Also enriches context with LLM agent skills so the LLM knows which agent
    is best suited for each task type.
    """

    def __init__(self, nestjs_url: str, cache_ttl_minutes: int = 60, user_id: str = "service"):
        self.nestjs_url = nestjs_url
        self.user_id = user_id
        self.cache_ttl = timedelta(minutes=cache_ttl_minutes)
        # Three separate caches for the three context flavours
        self._caches: Dict[str, Dict] = {
            "aggregated": {"data": None, "ts": None},
            "rule":       {"data": None, "ts": None},
            "task":       {"data": None, "ts": None},
        }

    # ── Public API ────────────────────────────────────────────────────────────

    async def get_aggregated_context(self) -> Dict[str, Any]:
        """Full aggregated context — for general use and constrained generation."""
        return await self._get_or_fetch("aggregated", "/tasks/manifest/llm-context/aggregated")

    async def get_rule_context(self) -> Dict[str, Any]:
        """Enriched rule context — optimised for event-driven rule generation."""
        return await self._get_or_fetch("rule", "/tasks/manifest/llm-context/enhanced/rule")

    async def get_task_context(self) -> Dict[str, Any]:
        """Enriched task context — optimised for one-shot task generation."""
        return await self._get_or_fetch("task", "/tasks/manifest/llm-context/enhanced/task")

    def enrich_with_agent_skills(
        self,
        context: Dict[str, Any],
        agents: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """
        Injects LLM agent skills / task affinities into the context so that
        _build_system_prompt can expose them to the model.
        Keys injected under `_llm_agent_skills`:
          { agent_name: { skills, taskAffinities, model, provider } }
        """
        skills_map: Dict[str, Any] = {}
        for agent in agents or []:
            name = agent.get("name") or agent.get("provider") or agent.get("id") or "unknown"
            skills_map[name] = {
                "skills": agent.get("skills") or [],
                "taskAffinities": agent.get("taskAffinities") or agent.get("task_affinities") or [],
                "model": agent.get("model"),
                "provider": agent.get("provider"),
                "isDefault": agent.get("isDefault") or agent.get("is_default"),
            }
        return {**context, "_llm_agent_skills": skills_map}

    def invalidate_cache(self, kind: str = "all") -> None:
        """Invalidate one or all caches."""
        targets = list(self._caches.keys()) if kind == "all" else [kind]
        for key in targets:
            if key in self._caches:
                self._caches[key] = {"data": None, "ts": None}
        logger.info(f"🗑️  Context cache invalidated: {', '.join(targets)}")

    def _get_cache_age_minutes(self) -> Optional[int]:
        ts = self._caches["aggregated"]["ts"]
        if not ts:
            return None
        return int((datetime.now() - ts).total_seconds() / 60)

    def _is_cache_valid(self) -> bool:
        return self._is_valid("aggregated")

    # ── Internals ─────────────────────────────────────────────────────────────

    def _is_valid(self, kind: str) -> bool:
        entry = self._caches.get(kind, {})
        if not entry.get("data") or not entry.get("ts"):
            return False
        return (datetime.now() - entry["ts"]) < self.cache_ttl

    async def _get_or_fetch(self, kind: str, endpoint_path: str) -> Dict[str, Any]:
        if self._is_valid(kind):
            age = (datetime.now() - self._caches[kind]["ts"]).total_seconds() / 60
            logger.debug(f"📦 [{kind}] Using cached context ({age:.1f}min old)")
            return self._caches[kind]["data"]
        return await self._fetch(kind, endpoint_path)

    async def _fetch(self, kind: str, endpoint_path: str) -> Dict[str, Any]:
        url = f"{self.nestjs_url}{endpoint_path}"
        logger.info(f"🔄 Fetching [{kind}] context from {url}")
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(url, headers={"X-User-ID": self.user_id})
                response.raise_for_status()

            data = response.json()
            self._caches[kind] = {"data": data, "ts": datetime.now()}

            # Log summary
            conn_count = len(data.get("connectors", []))
            cond_count = len(data.get("conditionTypes", data.get("condition_types", [])))
            svc_count = len(data.get("servicesManifest", []))
            logger.info(
                f"✅ [{kind}] Context loaded — "
                f"{conn_count} connectors, {cond_count} condition types, {svc_count} services"
            )
            return data

        except Exception as e:
            logger.error(f"❌ Failed to fetch [{kind}] context: {e}")
            if self._caches.get(kind, {}).get("data"):
                logger.warning(f"⚠️  Using stale [{kind}] cache")
                return self._caches[kind]["data"]
            raise

