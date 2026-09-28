from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class ScanReportSkill(BaseModel):
    skill_name: str = Field(max_length=128)
    skill_slug: str = Field(max_length=128)
    local_ref: str | None = Field(default=None, min_length=8, max_length=64)
    relative_directory: str = Field(max_length=512)
    agent_target: str | None = None
    files: list[str] | None = None
    has_skill_md: bool = False
    has_skill_yaml: bool = False
    file_count: int = 0
    total_size: int = 0


class ScanReportRequest(BaseModel):
    device_id: str = Field(min_length=1, max_length=64)
    device_name: str | None = Field(default=None, max_length=128)
    skills: list[ScanReportSkill] = Field(min_length=1)


class ScanReportResponse(BaseModel):
    scan_id: uuid.UUID
    skill_count: int


class LocalSkillReportResponse(BaseModel):
    id: uuid.UUID
    skill_name: str
    skill_slug: str
    local_ref: str | None = None
    relative_directory: str
    agent_target: str | None = None
    device_id: str | None = None
    has_skill_md: bool
    has_skill_yaml: bool
    file_count: int
    total_size: int
    detected_at: datetime

    model_config = {"from_attributes": True}


class ScanBatchResponse(BaseModel):
    id: uuid.UUID
    device_id: str
    device_name: str | None = None
    status: str
    skill_count: int
    scanned_at: datetime
    reports: list[LocalSkillReportResponse] = []

    model_config = {"from_attributes": True}


class DeviceResponse(BaseModel):
    device_id: str
    device_name: str | None = None
    last_scanned_at: datetime
    skill_count: int


class LocalPublishItemCreate(BaseModel):
    report_id: uuid.UUID
    name: str = Field(min_length=1, max_length=128)
    slug: str = Field(pattern=r'^[a-z0-9][a-z0-9-]{0,48}[a-z0-9]$')
    description: str | None = Field(default=None, max_length=4000)
    version: str = Field(pattern=r'^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$')
    changelog: str | None = Field(default=None, max_length=2000)
    visibility: str = Field(default="public", pattern=r'^(public|private)$')


class LocalPublishRequestCreate(BaseModel):
    items: list[LocalPublishItemCreate] = Field(min_length=1, max_length=10)


class LocalPublishItemResponse(BaseModel):
    id: uuid.UUID
    local_ref: str
    name: str
    slug: str
    description: str | None
    version: str
    changelog: str | None
    visibility: str
    status: str
    error_message: str | None
    model_config = {"from_attributes": True}


class LocalPublishRequestResponse(BaseModel):
    id: uuid.UUID
    status: str
    created_at: datetime
    items: list[LocalPublishItemResponse]
    model_config = {"from_attributes": True}


class LocalPublishRequestCreated(BaseModel):
    request_id: uuid.UUID
    status: str
    item_count: int


class LocalPublishResultItem(BaseModel):
    local_ref: str
    status: str = Field(pattern=r'^(completed|failed)$')
    error_message: str | None = Field(default=None, max_length=1000)


class LocalPublishResults(BaseModel):
    items: list[LocalPublishResultItem] = Field(min_length=1, max_length=10)
