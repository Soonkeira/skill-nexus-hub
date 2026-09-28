import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class FeedbackCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    feedback_type: str = Field(pattern=r"^(bug|usage|suggestion|other)$")
    description: str = Field(min_length=1, max_length=5000)


class FeedbackReply(BaseModel):
    reply: str = Field(min_length=1, max_length=5000)
    status: str | None = Field(default=None, pattern=r"^(pending|processing|resolved|closed)$")


class FeedbackStatusUpdate(BaseModel):
    status: str = Field(pattern=r"^(pending|processing|resolved|closed)$")


class FeedbackResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    username: str | None = None
    title: str
    feedback_type: str
    description: str
    status: str
    admin_reply: str | None = None
    replied_by: uuid.UUID | None = None
    replier_name: str | None = None
    replied_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class FeedbackListResponse(BaseModel):
    items: list[FeedbackResponse]
    page: int
    page_size: int
    total: int
