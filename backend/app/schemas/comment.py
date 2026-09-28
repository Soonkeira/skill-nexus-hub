import uuid
from datetime import datetime

from pydantic import BaseModel


class CommentCreate(BaseModel):
    content: str
    version_id: uuid.UUID | None = None
    parent_id: uuid.UUID | None = None


class CommentResponse(BaseModel):
    id: uuid.UUID
    skill_id: uuid.UUID
    version_id: uuid.UUID | None
    user_id: uuid.UUID
    username: str
    content: str
    parent_id: uuid.UUID | None
    created_at: datetime
    replies: list["CommentResponse"] = []

    model_config = {"from_attributes": True}


class CommentListResponse(BaseModel):
    items: list[CommentResponse]
    page: int
    page_size: int
    total: int
