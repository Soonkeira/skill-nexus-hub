from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.api.deps import get_current_user, get_db
from app.models import Skill, SkillVersion, User

router = APIRouter(prefix="/api", tags=["pending"])


class PendingVersionItem(BaseModel):
    id: str
    version_id: str
    skill_slug: str
    skill_name: str
    owner_username: str
    version: str
    original_filename: str | None
    file_size: int
    publisher_username: str
    created_at: datetime


class PendingListResponse(BaseModel):
    items: list[PendingVersionItem]


async def list_pending_versions_for_user(
    db: AsyncSession,
    user: User,
) -> PendingListResponse:
    owner_user = aliased(User)
    publisher_user = aliased(User)
    query = (
        select(SkillVersion, Skill.slug, Skill.name, owner_user.username, publisher_user.username)
        .join(Skill, SkillVersion.skill_id == Skill.id)
        .join(owner_user, Skill.owner_id == owner_user.id)
        .join(publisher_user, SkillVersion.publisher_id == publisher_user.id)
        .where(SkillVersion.status == "pending")
        .order_by(SkillVersion.created_at.desc())
    )
    if user.role != "admin":
        query = query.where(SkillVersion.publisher_id == user.id)

    result = await db.execute(query)
    items = [
        PendingVersionItem(
            id=str(ver.id),
            version_id=str(ver.id),
            skill_slug=slug,
            skill_name=name,
            owner_username=owner_username,
            version=ver.version,
            original_filename=ver.original_filename,
            file_size=ver.file_size,
            publisher_username=publisher_username,
            created_at=ver.created_at,
        )
        for ver, slug, name, owner_username, publisher_username in result.all()
    ]
    return PendingListResponse(items=items)


@router.get("/pending", response_model=PendingListResponse)
async def list_my_pending_versions(
    user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    return await list_pending_versions_for_user(db, user)
