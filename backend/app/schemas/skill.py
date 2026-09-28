import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class SkillCreate(BaseModel):
    name: str
    slug: str = Field(pattern=r'^[a-z0-9][a-z0-9-]{0,48}[a-z0-9]$')
    description: str | None = None
    tags: list[str] | None = None
    visibility: str = "public"
    icon_path: str | None = None


class SkillUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    tags: list[str] | None = None
    visibility: str | None = None
    icon_path: str | None = None


class SkillVersionBrief(BaseModel):
    id: uuid.UUID
    version: str
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class SkillTrustStatus(BaseModel):
    review_status: str
    security_status: str
    documentation_status: str
    latest_version: str | None = None
    reviewed_at: datetime | None = None
    labels: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class SkillResponse(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    description: str | None
    tags: list[str] | None
    visibility: str
    icon_path: str | None
    latest_version_id: uuid.UUID | None
    owner_id: uuid.UUID
    owner_name: str | None = None
    owner_nickname: str | None = None
    owner_department: str | None = None
    created_at: datetime
    updated_at: datetime
    download_count: int = 0
    versions: list[SkillVersionBrief] | None = None
    trust: SkillTrustStatus | None = None

    model_config = {"from_attributes": True}


class SkillListResponse(BaseModel):
    items: list[SkillResponse]
    page: int
    page_size: int
    total: int


class InstallTargetResponse(BaseModel):
    id: uuid.UUID
    name: str
    display_name: str
    global_path: str
    project_path: str | None
    description: str | None

    model_config = {"from_attributes": True}
