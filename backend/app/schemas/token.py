import uuid
from datetime import datetime
from pydantic import BaseModel


class TokenCreate(BaseModel):
    name: str
    expires_in_days: int | None = None


class TokenResponse(BaseModel):
    id: uuid.UUID
    name: str
    token_prefix: str
    last_used_at: datetime | None
    created_at: datetime
    expires_at: datetime | None

    model_config = {"from_attributes": True}


class TokenCreateResponse(TokenResponse):
    token: str  # shown only once at creation
