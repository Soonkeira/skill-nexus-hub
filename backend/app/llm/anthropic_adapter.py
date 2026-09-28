from __future__ import annotations

import anthropic
import httpx

from .base import LLMAdapter


class AnthropicAdapter(LLMAdapter):
    """Anthropic Claude adapter."""

    def __init__(self, base_url: str, model_name: str, api_key: str):
        self.base_url = base_url.strip().rstrip("/")
        self.model_name = model_name
        self.api_key = api_key

    async def analyze(
        self,
        system_prompt: str,
        user_prompt: str,
        max_tokens: int = 4096,
        temperature: float = 0.3,
    ) -> str:
        client = anthropic.AsyncAnthropic(base_url=self.base_url, api_key=self.api_key)
        response = await client.messages.create(
            model=self.model_name,
            max_tokens=max_tokens,
            temperature=temperature,
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}],
        )
        return response.content[0].text if response.content else ""

    async def test_connection(self) -> tuple[bool, str]:
        """Test connectivity."""
        try:
            client = anthropic.AsyncAnthropic(base_url=self.base_url, api_key=self.api_key)
            # Minimal request to test connectivity
            response = await client.messages.create(
                model=self.model_name,
                max_tokens=10,
                messages=[{"role": "user", "content": "Hi"}],
            )
            return True, f"Connected. Model: {self.model_name}"
        except anthropic.APIConnectionError as e:
            root = e.__cause__ or e
            return False, f"Connection error: {type(root).__name__}: {root}. Check if base_url ({self.base_url}) is reachable from the server."
        except anthropic.APIStatusError as e:
            return False, f"API returned {e.status_code}: {e.message}. Check if the API key and base_url are correct."
        except httpx.ConnectError as e:
            return False, f"Cannot connect to {self.base_url}: {e}. Check network connectivity."
        except Exception as e:
            return False, f"{type(e).__name__}: {e}"
