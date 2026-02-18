import json
import logging
from typing import Dict, Any, Tuple, List
from tenacity import retry, stop_after_attempt, wait_exponential
from openai import AsyncOpenAI

from .base import ILLMProvider

logger = logging.getLogger(__name__)


class OpenAIProvider(ILLMProvider):
    """
    OpenAI GPT Provider - Strong alternative to Anthropic.
    GPT-4 excels at:
    - Fast generation (lower latency than Claude)
    - Creative problem-solving
    - Multi-turn conversation awareness
    """

    def __init__(self, api_key: str, model: str = "gpt-4-turbo"):
        self.client = AsyncOpenAI(api_key=api_key)
        self._model = model
        self._name = "openai"
        logger.info(f"✅ OpenAI Provider initialized with model: {model}")

    @property
    def name(self) -> str:
        return self._name

    @property
    def model_name(self) -> str:
        return self._model

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=2))
    async def generate_rules(
        self,
        aggregated_context: Dict[str, Any],
        user_intent: str,
    ) -> Tuple[Dict[str, Any], int]:
        """Generate workflow rules using GPT-4"""
        system_prompt = self._build_system_prompt(aggregated_context)

        prompt = f"""Based on the context and available capabilities provided above, generate workflow rules for this user intent:

User Intent: {user_intent}

Generate production-ready workflow rules as valid JSON only. No explanations, no markdown - just the JSON object."""

        logger.info(f"🔄 Generating rules for intent: {user_intent[:100]}...")

        response = await self.client.chat.completions.create(
            model=self._model,
            max_tokens=4096,
            temperature=0.3,
            system=system_prompt,
            messages=[{"role": "user", "content": prompt}],
        )

        rules_text = response.choices[0].message.content

        try:
            rules_dict = self._extract_json(rules_text)
            tokens_used = response.usage.prompt_tokens + response.usage.completion_tokens
            logger.info(f"✅ Rules generated successfully ({tokens_used} tokens)")
            return rules_dict, tokens_used
        except json.JSONDecodeError as e:
            logger.error(f"❌ Failed to parse rules: {str(e)}")
            raise ValueError(f"Invalid JSON response from GPT-4: {str(e)}")

    async def generate_rules_batch(
        self,
        aggregated_context: Dict[str, Any],
        intents: List[str],
    ) -> Tuple[List[Dict[str, Any]], int]:
        """Generate multiple rules efficiently"""
        system_prompt = self._build_system_prompt(aggregated_context)

        intents_text = "\n".join(
            [f"{i + 1}. {intent}" for i, intent in enumerate(intents)]
        )

        prompt = f"""Generate workflow rules for these {len(intents)} user intents:

{intents_text}

Generate the rules as a JSON array. Return ONLY valid JSON array: [{{workflow1}}, {{workflow2}}, ...]"""

        logger.info(f"🔄 Batch generating {len(intents)} rule sets...")

        response = await self.client.chat.completions.create(
            model=self._model,
            max_tokens=8192,
            temperature=0.3,
            system=system_prompt,
            messages=[{"role": "user", "content": prompt}],
        )

        rules_text = response.choices[0].message.content

        try:
            rules_list = self._extract_json_array(rules_text)
            tokens_used = response.usage.prompt_tokens + response.usage.completion_tokens
            logger.info(
                f"✅ Batch generated {len(rules_list)} rule sets ({tokens_used} tokens)"
            )
            return rules_list, tokens_used
        except json.JSONDecodeError as e:
            logger.error(f"❌ Failed to parse batch rules: {str(e)}")
            raise ValueError(f"Invalid JSON response: {str(e)}")

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=2))
    async def evaluate_condition(
        self,
        condition: str,
        context: Dict[str, Any],
    ) -> bool:
        """Dynamically evaluate a condition with given context"""
        context_json = json.dumps(context, indent=2)

        prompt = f"""You are evaluating a workflow condition.

Condition to evaluate:
{condition}

Available context:
{context_json}

Respond with ONLY "true" or "false" (lowercase)."""

        response = await self.client.chat.completions.create(
            model=self._model,
            max_tokens=10,
            temperature=0.0,
            messages=[{"role": "user", "content": prompt}],
        )

        result = response.choices[0].message.content.strip().lower()
        is_true = result == "true"

        logger.debug(f"📊 Condition evaluation: '{condition}' -> {is_true}")
        return is_true

    async def refine_rules(
        self,
        current_rules: Dict[str, Any],
        feedback: str,
        aggregated_context: Dict[str, Any],
    ) -> Tuple[Dict[str, Any], int]:
        """Refine rules based on user feedback"""
        system_prompt = self._build_system_prompt(aggregated_context)

        current_rules_json = json.dumps(current_rules, indent=2)

        prompt = f"""Refine these workflow rules based on feedback.

Current rules:
{current_rules_json}

User feedback:
{feedback}

Generate improved rules. Return ONLY valid JSON."""

        logger.info(f"🔄 Refining rules based on feedback: {feedback[:100]}...")

        response = await self.client.chat.completions.create(
            model=self._model,
            max_tokens=4096,
            temperature=0.3,
            system=system_prompt,
            messages=[{"role": "user", "content": prompt}],
        )

        refined_text = response.choices[0].message.content

        try:
            refined_rules = self._extract_json(refined_text)
            tokens_used = response.usage.prompt_tokens + response.usage.completion_tokens
            logger.info(f"✅ Rules refined successfully ({tokens_used} tokens)")
            return refined_rules, tokens_used
        except json.JSONDecodeError as e:
            logger.error(f"❌ Failed to parse refined rules: {str(e)}")
            raise ValueError(f"Invalid JSON response: {str(e)}")

    def _extract_json(self, text: str) -> Dict[str, Any]:
        """Extract JSON object from text"""
        text = text.strip()

        if text.startswith("```"):
            end_idx = text.rfind("```")
            if end_idx > 0:
                text = text[text.find("\n") + 1 : end_idx]

        start_idx = text.find("{")
        end_idx = text.rfind("}") + 1

        if start_idx >= 0 and end_idx > start_idx:
            json_str = text[start_idx:end_idx]
            return json.loads(json_str)

        raise json.JSONDecodeError("No JSON object found", text, 0)

    def _extract_json_array(self, text: str) -> List[Dict[str, Any]]:
        """Extract JSON array from text"""
        text = text.strip()

        if text.startswith("```"):
            end_idx = text.rfind("```")
            if end_idx > 0:
                text = text[text.find("\n") + 1 : end_idx]

        start_idx = text.find("[")
        end_idx = text.rfind("]") + 1

        if start_idx >= 0 and end_idx > start_idx:
            json_str = text[start_idx:end_idx]
            return json.loads(json_str)

        raise json.JSONDecodeError("No JSON array found", text, 0)
