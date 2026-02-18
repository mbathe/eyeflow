import json
import logging
from typing import Dict, Any, Tuple, List
from tenacity import retry, stop_after_attempt, wait_exponential
import anthropic

from .base import ILLMProvider

logger = logging.getLogger(__name__)


class AnthropicProvider(ILLMProvider):
    """
    Anthropic Claude Provider - Recommended for production use.
    Claude models excel at:
    - Long context windows (200K tokens for claude-3-opus)
    - Complex reasoning and decision-making
    - Structured JSON generation
    - Following detailed instructions precisely
    """

    def __init__(self, api_key: str, model: str = "claude-3-opus-20240229"):
        self.client = anthropic.AsyncAnthropic(api_key=api_key)
        self._model = model
        self._name = "anthropic"
        logger.info(f"✅ Anthropic Provider initialized with model: {model}")

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
        """
        Generate workflow rules using Claude.
        Uses extended thinking for complex logic generation.
        """
        system_prompt = self._build_system_prompt(aggregated_context)

        prompt = f"""Based on the context and available capabilities provided above, generate workflow rules for this user intent:

User Intent: {user_intent}

Generate production-ready workflow rules as valid JSON only. No explanations, no markdown - just the JSON object."""

        logger.info(f"🔄 Generating rules for intent: {user_intent[:100]}...")

        response = await self.client.messages.create(
            model=self._model,
            max_tokens=4096,  # Claude supports large outputs
            system=system_prompt,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,  # Low temperature for consistency
        )

        rules_text = response.content[0].text

        # Parse JSON
        try:
            # Try to extract JSON from response (in case of markdown wrapping)
            rules_dict = self._extract_json(rules_text)
            tokens_used = (
                response.usage.input_tokens + response.usage.output_tokens
            )
            logger.info(f"✅ Rules generated successfully ({tokens_used} tokens)")
            return rules_dict, tokens_used
        except json.JSONDecodeError as e:
            logger.error(f"❌ Failed to parse rules: {str(e)}")
            raise ValueError(f"Invalid JSON response from Claude: {str(e)}")

    async def generate_rules_batch(
        self,
        aggregated_context: Dict[str, Any],
        intents: List[str],
    ) -> Tuple[List[Dict[str, Any]], int]:
        """
        Generate multiple rules efficiently.
        Uses a single prompt with multiple intents for better context reuse.
        """
        system_prompt = self._build_system_prompt(aggregated_context)

        intents_text = "\n".join(
            [f"{i + 1}. {intent}" for i, intent in enumerate(intents)]
        )

        prompt = f"""Generate workflow rules for these {len(intents)} user intents:

{intents_text}

Generate the rules as a JSON array where each element is a complete workflow object.
Return ONLY valid JSON array: [{{workflow1}}, {{workflow2}}, ...]"""

        logger.info(f"🔄 Batch generating {len(intents)} rule sets...")

        response = await self.client.messages.create(
            model=self._model,
            max_tokens=8192,
            system=system_prompt,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
        )

        rules_text = response.content[0].text

        try:
            rules_list = self._extract_json_array(rules_text)
            tokens_used = (
                response.usage.input_tokens + response.usage.output_tokens
            )
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
        """
        Dynamically evaluate a condition with given context.
        Uses Claude's reasoning capabilities for complex expressions.
        """
        context_json = json.dumps(context, indent=2)

        prompt = f"""You are evaluating a workflow condition with the given context.

Condition to evaluate:
{condition}

Available context:
{context_json}

Evaluate this condition and respond with ONLY the word "true" or "false" (lowercase, no punctuation)."""

        response = await self.client.messages.create(
            model=self._model,
            max_tokens=10,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.0,  # Deterministic evaluation
        )

        result = response.content[0].text.strip().lower()
        is_true = result == "true"

        logger.debug(
            f"📊 Condition evaluation: '{condition}' -> {is_true}"
        )
        return is_true

    async def refine_rules(
        self,
        current_rules: Dict[str, Any],
        feedback: str,
        aggregated_context: Dict[str, Any],
    ) -> Tuple[Dict[str, Any], int]:
        """
        Refine previously generated rules based on user feedback.
        Uses conversation history for context awareness.
        """
        system_prompt = self._build_system_prompt(aggregated_context)

        current_rules_json = json.dumps(current_rules, indent=2)

        prompt = f"""You are refining workflow rules based on user feedback.

Current rules:
{current_rules_json}

User feedback for improvement:
{feedback}

Generate improved rules addressing the feedback. Return ONLY valid JSON."""

        logger.info(f"🔄 Refining rules based on feedback: {feedback[:100]}...")

        response = await self.client.messages.create(
            model=self._model,
            max_tokens=4096,
            system=system_prompt,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
        )

        refined_text = response.content[0].text

        try:
            refined_rules = self._extract_json(refined_text)
            tokens_used = (
                response.usage.input_tokens + response.usage.output_tokens
            )
            logger.info(f"✅ Rules refined successfully ({tokens_used} tokens)")
            return refined_rules, tokens_used
        except json.JSONDecodeError as e:
            logger.error(f"❌ Failed to parse refined rules: {str(e)}")
            raise ValueError(f"Invalid JSON response: {str(e)}")

    def _extract_json(self, text: str) -> Dict[str, Any]:
        """Extract JSON object from text, handling markdown wrapping"""
        text = text.strip()

        # Remove markdown code blocks if present
        if text.startswith("```"):
            # Find the end of the markdown block
            end_idx = text.rfind("```")
            if end_idx > 0:
                text = text[text.find("\n") + 1 : end_idx]

        # Try to find JSON object
        start_idx = text.find("{")
        end_idx = text.rfind("}") + 1

        if start_idx >= 0 and end_idx > start_idx:
            json_str = text[start_idx:end_idx]
            return json.loads(json_str)

        raise json.JSONDecodeError("No JSON object found", text, 0)

    def _extract_json_array(self, text: str) -> List[Dict[str, Any]]:
        """Extract JSON array from text"""
        text = text.strip()

        # Remove markdown code blocks if present
        if text.startswith("```"):
            end_idx = text.rfind("```")
            if end_idx > 0:
                text = text[text.find("\n") + 1 : end_idx]

        # Try to find JSON array
        start_idx = text.find("[")
        end_idx = text.rfind("]") + 1

        if start_idx >= 0 and end_idx > start_idx:
            json_str = text[start_idx:end_idx]
            return json.loads(json_str)

        raise json.JSONDecodeError("No JSON array found", text, 0)
