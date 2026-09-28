from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from typing import Annotated
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_current_user, get_optional_user
from app.api.shared import check_skill_access
from app.models import DownloadLog, Skill, SkillVersion, User

router = APIRouter(prefix="/api/stats", tags=["stats"])


class OverviewResponse(BaseModel):
    total_skills: int
    total_downloads: int
    total_users: int
    total_versions: int


class VersionDownload(BaseModel):
    version: str
    count: int


class SkillStatsResponse(BaseModel):
    skill_name: str
    total_downloads: int
    downloads_by_version: list[VersionDownload]
    recent_downloads: int


@router.get("/overview", response_model=OverviewResponse)
async def overview(
    user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    total_skills = (
        await db.execute(select(func.count()).select_from(Skill))
    ).scalar() or 0
    total_downloads = (
        await db.execute(select(func.count()).select_from(DownloadLog))
    ).scalar() or 0
    total_users = (
        await db.execute(select(func.count()).select_from(User))
    ).scalar() or 0
    total_versions = (
        await db.execute(select(func.count()).select_from(SkillVersion))
    ).scalar() or 0

    return OverviewResponse(
        total_skills=total_skills,
        total_downloads=total_downloads,
        total_users=total_users,
        total_versions=total_versions,
    )


@router.get("/skills/{slug}", response_model=SkillStatsResponse)
async def skill_stats(
    slug: str,
    db: AsyncSession = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    skill_result = await db.execute(select(Skill).where(Skill.slug == slug))
    skill = skill_result.scalar_one_or_none()
    if skill is None:
        raise HTTPException(status_code=404, detail="Skill not found")

    check_skill_access(skill, user)

    # Total downloads for this skill
    total_dl = (
        await db.execute(
            select(func.count()).where(DownloadLog.skill_id == skill.id)
        )
    ).scalar() or 0

    # Downloads by version
    ver_dl_result = await db.execute(
        select(SkillVersion.version, func.count().label("cnt"))
        .join(DownloadLog, DownloadLog.version_id == SkillVersion.id)
        .where(DownloadLog.skill_id == skill.id)
        .group_by(SkillVersion.version)
    )
    downloads_by_version = [
        VersionDownload(version=row.version, count=row.cnt)
        for row in ver_dl_result.all()
    ]

    # Recent downloads (last 30 days)
    # Use string comparison since created_at is stored as string in SQLite
    thirty_days_ago = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    recent_dl = (
        await db.execute(
            select(func.count()).where(
                DownloadLog.skill_id == skill.id,
                DownloadLog.downloaded_at > thirty_days_ago,
            )
        )
    ).scalar() or 0

    return SkillStatsResponse(
        skill_name=skill.name,
        total_downloads=total_dl,
        downloads_by_version=downloads_by_version,
        recent_downloads=recent_dl,
    )
