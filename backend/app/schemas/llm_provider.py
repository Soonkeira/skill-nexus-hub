from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field, SecretStr


class LLMProviderCreate(BaseModel):
    name: str = Field(max_length=128)
    provider_type: str = Field(pattern=r"^(openai|anthropic)$")
    base_url: str
    model_name: str = Field(max_length=128)
    api_key: SecretStr = Field(min_length=1, max_length=4096)
    is_default: bool = False
    max_tokens: int = 4096
    temperature: float = 0.3


class LLMProviderUpdate(BaseModel):
    name: str | None = None
    base_url: str | None = None
    model_name: str | None = None
    provider_type: str | None = Field(default=None, pattern=r"^(openai|anthropic)$")
    api_key: SecretStr | None = Field(default=None, min_length=1, max_length=4096)
    is_default: bool | None = None
    max_tokens: int | None = None
    temperature: float | None = None


class LLMProviderResponse(BaseModel):
    id: uuid.UUID
    name: str
    provider_type: str
    base_url: str
    model_name: str
    api_key_configured: bool
    is_default: bool
    max_tokens: int
    temperature: float
    created_at: datetime

    model_config = {"from_attributes": True}


class LLMProviderTestResponse(BaseModel):
    success: bool
    message: str


class SkillAnalysisResponse(BaseModel):
    id: uuid.UUID
    skill_id: uuid.UUID
    version_id: uuid.UUID
    provider_id: uuid.UUID | None = None
    status: str
    summary: str | None = None
    usage_guide: str | None = None
    effects: str | None = None
    use_cases: str | None = None
    quality_score: int | None = None
    warnings: str | None = None
    error_message: str | None = None
    analyzed_at: datetime | None = None
    created_at: datetime
    is_ai_generated: bool = True

    model_config = {"from_attributes": True}
