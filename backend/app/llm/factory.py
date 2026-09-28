from __future__ import annotations

from .base import LLMAdapter
from .openai_adapter import OpenAIAdapter
from .anthropic_adapter import AnthropicAdapter


def get_adapter(provider_type: str, base_url: str, model_name: str, api_key: str) -> LLMAdapter:
    """Create an LLM adapter instance based on provider type."""
    if not api_key:
        raise ValueError("API key is not configured")

    if provider_type == "openai":
        return OpenAIAdapter(base_url=base_url, model_name=model_name, api_key=api_key)
    elif provider_type == "anthropic":
        return AnthropicAdapter(base_url=base_url, model_name=model_name, api_key=api_key)
    else:
        raise ValueError(f"Unsupported provider type: {provider_type}")
