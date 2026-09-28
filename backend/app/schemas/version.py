import uuid
from datetime import datetime

from pydantic import BaseModel


class VersionUploadRequest(BaseModel):
    version: str
    changelog: str | None = None


class VersionResponse(BaseModel):
    id: uuid.UUID
    skill_id: uuid.UUID
    version: str
    targets: list[str] | None
    readme: str | None
    changelog: str | None
    original_filename: str | None
    file_size: int
    checksum: str
    status: str
    publisher_id: uuid.UUID
    reviewer_id: uuid.UUID | None
    reviewed_at: datetime | None
    rejection_reason: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class VersionListResponse(BaseModel):
    items: list[VersionResponse]
    page: int
    page_size: int
    total: int
