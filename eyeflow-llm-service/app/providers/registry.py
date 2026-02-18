import logging
from typing import Dict, Any, Optional
from enum import Enum

from .base import ILLMProvider
from .anthropic_provider_langchain import AnthropicProviderLangChain
from .openai_provider_langchain import OpenAIProviderLangChain

logger = logging.getLogger(__name__)


class LLMProviderType(str, Enum):
    """Available LLM provider types"""

    ANTHROPIC = "anthropic"
    OPENAI = "openai"
    OLLAMA_LOCAL = "ollama_local"
    LLAMA_CPP = "llama_cpp"
    GITHUB = "github"
    GOOGLE = "google"


class LLMProviderRegistry:
    """
    Factory for creating and managing LLM providers.
    Configuration is fetched from NestJS /api/llm-config/default endpoint.
    This ensures single source of truth for LLM configuration.
    """

    @staticmethod
    def create(llm_config: Dict[str, Any]) -> ILLMProvider:
        """
        Create an LLM provider based on configuration from NestJS.

        Args:
            llm_config: Configuration dict from /api/llm-config/default with:
                - provider: "anthropic", "openai", "ollama_local", etc
                - model: model name
                - api_key: API key (for cloud providers)
                - api_url: endpoint URL (for local or custom)
                - temperature: generation temperature
                - max_tokens: max output tokens

        Returns:
            Configured ILLMProvider instance

        Raises:
            ValueError: If provider not supported or configuration invalid
            KeyError: If required configuration missing
        """
        provider_type = llm_config.get("provider", "").lower()
        model = llm_config.get("model", "")

        logger.info(f"🔧 Creating LLM provider: {provider_type} (model: {model})")

        if provider_type == LLMProviderType.ANTHROPIC:
            api_key = llm_config.get("api_key")
            if not api_key:
                raise KeyError(
                    "Anthropic API key not configured. "
                    "Create config via POST /llm-config with apiKey field"
                )

            return AnthropicProviderLangChain(
                api_key=api_key,
                model=model or "claude-3-opus-20240229",
            )

        elif provider_type == LLMProviderType.OPENAI:
            api_key = llm_config.get("api_key")
            if not api_key:
                raise KeyError(
                    "OpenAI API key not configured. "
                    "Create config via POST /llm-config with apiKey field"
                )

            return OpenAIProviderLangChain(
                api_key=api_key,
                model=model or "gpt-4-turbo-preview",
            )

        elif provider_type in [
            LLMProviderType.OLLAMA_LOCAL,
            LLMProviderType.LLAMA_CPP,
        ]:
            api_url = llm_config.get(
                "api_url", "http://localhost:11434"
            )
            logger.warning(
                f"⚠️  Local provider {provider_type} requested but not yet implemented. "
                f"Using: {api_url}"
            )
            raise NotImplementedError(
                f"Local provider {provider_type} coming soon. "
                f"Use Anthropic or OpenAI for now."
            )

        elif provider_type == LLMProviderType.GITHUB:
            raise NotImplementedError(
                "GitHub Models provider coming soon (models.inference.ai.azure.com)"
            )

        elif provider_type == LLMProviderType.GOOGLE:
            raise NotImplementedError("Google Gemini provider coming soon")

        else:
            raise ValueError(
                f"Unknown provider: {provider_type}. "
                f"Supported: anthropic, openai, ollama_local, llama_cpp"
            )

    @staticmethod
    def list_available_providers() -> Dict[str, str]:
        """List all available providers with descriptions"""
        return {
            "anthropic": "Claude 3 Opus (Recommended - best for complex reasoning)",
            "openai": "GPT-4 Turbo (Fast - good for creative tasks)",
            "ollama_local": "Local Ollama (Coming soon)",
            "llama_cpp": "Local llama.cpp (Coming soon)",
            "github": "GitHub Models (Coming soon)",
            "google": "Google Gemini (Coming soon)",
        }
