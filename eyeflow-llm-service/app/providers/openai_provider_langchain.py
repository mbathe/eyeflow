"""
OpenAI GPT-4 LLM Provider using LangChain

Alternative provider using LangChain for:
- GPT-4 Turbo (128K context window)
- Structured JSON output via OutputParser
- Cost-effective rule generation
- Similar interface to Anthropic provider
"""

import json
import logging
from typing import Dict, Any, List, Optional, Tuple

from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import JsonOutputParser
from pydantic import BaseModel, Field

from .base import ILLMProvider
from .anthropic_provider_langchain import (
    WorkflowCondition,
    WorkflowAction,
    GeneratedRule,
    GeneratedRules,
)

logger = logging.getLogger(__name__)


class OpenAIProviderLangChain(ILLMProvider):
    """
    OpenAI GPT-4 provider using LangChain
    
    Characteristics:
    - Faster responses than Claude (but potentially less accurate)
    - 128K context window (GPT-4 Turbo)
    - Lower cost per token
    - Good for batch generation
    """

    def __init__(self, api_key: str, model: str = "gpt-4-turbo-preview"):
        """Initialize with LangChain ChatOpenAI"""
        self.api_key = api_key
        self._model_name = model
        self._name = "openai"
        self._total_tokens = 0

        # Initialize GPT-4 via LangChain
        self.llm = ChatOpenAI(
            model=model,
            api_key=api_key,
            temperature=0.3,
            max_tokens=4096,
            timeout=60.0,
        )

        logger.info(f"🔧 OpenAIProviderLangChain initialized: {model}")

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
        """Generate workflow rules from user intent"""
        try:
            logger.info(f"🔄 [OpenAI] Generating rules from intent: {user_intent[:60]}...")

            system_prompt = self._build_system_prompt(aggregated_context)

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

            parser = JsonOutputParser(pydantic_object=GeneratedRules)
            chain = prompt | self.llm | parser

            result = await chain.ainvoke({"intent": user_intent})

            tokens_used = self._extract_token_usage()
            logger.info(f"✅ [OpenAI] Generated {len(result.get('rules', []))} rules")

            return result, tokens_used

        except Exception as e:
            logger.error(f"❌ [OpenAI] Error generating rules: {str(e)}")
            raise

    async def generate_rules_batch(
        self,
        aggregated_context: Dict[str, Any],
        user_intents: List[str],
    ) -> Tuple[List[Dict[str, Any]], int]:
        """Generate multiple rules efficiently"""
        try:
            logger.info(f"🔄 [OpenAI] Generating batch of {len(user_intents)} rules...")

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
            logger.info(f"✅ [OpenAI] Generated {len(result)} rules in batch")

            return result, tokens_used

        except Exception as e:
            logger.error(f"❌ [OpenAI] Batch generation error: {str(e)}")
            raise

    async def evaluate_condition(
        self,
        condition: str,
        context: Dict[str, Any],
    ) -> bool:
        """Dynamically evaluate condition using LLM reasoning"""
        try:
            logger.info(f"🔍 [OpenAI] Evaluating condition: {condition}")

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

            logger.info(f"✅ [OpenAI] Condition evaluated: {result['result']}")
            return result.get("result", False)

        except Exception as e:
            logger.error(f"❌ [OpenAI] Condition evaluation error: {str(e)}")
            raise

    async def refine_rules(
        self,
        current_rules: Dict[str, Any],
        feedback: str,
        aggregated_context: Dict[str, Any],
    ) -> Tuple[Dict[str, Any], int]:
        """Refine rules based on user feedback"""
        try:
            logger.info(f"🔄 [OpenAI] Refining rules based on feedback...")

            system_prompt = self._build_system_prompt(aggregated_context)

            prompt = ChatPromptTemplate.from_messages(
                [
                    ("system", system_prompt),
                    (
                        "human",
                        "Current rules:\n{current_rules_json}\n\n"
                        "User feedback:\n{feedback}\n\n"
                        "Refine the rules based on this feedback. Return updated rules as JSON.",
                    ),
                ]
            )

            parser = JsonOutputParser(pydantic_object=GeneratedRules)
            chain = prompt | self.llm | parser

            result = await chain.ainvoke(
                {
                    "current_rules_json": json.dumps(current_rules),
                    "feedback": feedback,
                }
            )

            tokens_used = self._extract_token_usage()
            logger.info(f"✅ [OpenAI] Rules refined successfully")

            return result, tokens_used

        except Exception as e:
            logger.error(f"❌ [OpenAI] Refinement error: {str(e)}")
            raise

    def _extract_token_usage(self) -> int:
        """Extract approximate token usage from LLM call"""
        return 2000  # Placeholder for OpenAI

    def _build_system_prompt(self, context: Dict[str, Any]) -> str:
        """Build comprehensive system prompt from aggregated context"""
        return f"""You are an expert workflow automation system.
Your task is to generate production-ready workflow rules from user intents.

Available context:
- Conditions: {len(context.get('conditions', []))} types available
- Actions: {len(context.get('actions', []))} types available
- Variables: {len(context.get('variables', []))} available
- Triggers: {len(context.get('triggers', []))} types available
- Patterns: {len(context.get('patterns', []))} patterns available

CRITICAL REQUIREMENTS:
1. Generate ONLY valid JSON matching the GeneratedRules schema
2. Each rule must have clear trigger, conditions, and actions
3. Use variable types and action types from available context
4. Set priority between 0-1000 based on importance
5. Ensure all rules are production-ready and can be executed

BEST PRACTICES:
- Keep rule names short and descriptive
- One trigger per rule
- Multiple conditions are OR'd together
- Actions are executed sequentially
- Always set a meaningful priority level"""
