from __future__ import annotations

from openai import AsyncOpenAI, APIConnectionError, APIStatusError

from .base import LLMAdapter


class OpenAIAdapter(LLMAdapter):
    """OpenAI-compatible adapter (covers OpenAI, vLLM, Ollama, DeepSeek, etc.)."""

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
        client = AsyncOpenAI(base_url=self.base_url, api_key=self.api_key)
        response = await client.chat.completions.create(
            model=self.model_name,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            max_tokens=max_tokens,
            temperature=temperature,
        )
        return response.choices[0].message.content or ""

    async def test_connection(self) -> tuple[bool, str]:
        """Test connectivity by listing models or a minimal request."""
        try:
            client = AsyncOpenAI(base_url=self.base_url, api_key=self.api_key)
            models = await client.models.list()
            model_ids = [m.id for m in models.data]
            if self.model_name not in model_ids:
                # Some providers don't list all models; try a minimal request
                pass
            return True, f"Connected. {len(models.data)} model(s) available."
        except APIConnectionError as e:
            root = e.__cause__ or e
            return False, f"Connection error: {type(root).__name__}: {root}. Check if base_url ({self.base_url}) is reachable from the server."
        except APIStatusError as e:
            return False, f"API returned {e.status_code}: {e.message}. Check if the API key and base_url are correct."
        except Exception as e:
            return False, f"{type(e).__name__}: {e}"
