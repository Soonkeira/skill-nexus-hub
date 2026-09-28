import uuid
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db, require_role
from app.api.shared import get_skill_by_slug
from app.models import Skill, SkillVersion, User
from app.models.llm_provider import LLMProvider, SkillAnalysis
from app.schemas.llm_provider import SkillAnalysisResponse
from app.services.analysis import run_analysis

router = APIRouter(prefix="/api/skills", tags=["analysis"])


@router.post(
    "/by-slug/{slug}/versions/{version}/analyze",
    status_code=status.HTTP_201_CREATED,
)
async def trigger_analysis(
    slug: str,
    version: str,
    admin: Annotated[User, Depends(require_role("admin"))],
    background_tasks: BackgroundTasks,
    owner: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Manually trigger LLM analysis for a version (admin only)."""
    skill = await get_skill_by_slug(db, slug, owner)
    ver = await _get_version(db, skill.id, version)
    if not ver:
        raise HTTPException(status_code=404, detail="Version not found")

    # Get default provider
    prov_result = await db.execute(
        select(LLMProvider).where(LLMProvider.is_default == True)
    )
    provider = prov_result.scalar_one_or_none()
    if not provider:
        raise HTTPException(status_code=400, detail="No default LLM provider configured")

    # Delete existing analysis for this version+provider
    existing = await db.execute(
        select(SkillAnalysis).where(
            SkillAnalysis.version_id == ver.id,
            SkillAnalysis.provider_id == provider.id,
        )
    )
    for old in existing.scalars().all():
        await db.delete(old)

    # Create new analysis record
    analysis = SkillAnalysis(
        skill_id=skill.id,
        version_id=ver.id,
        provider_id=provider.id,
        status="pending",
    )
    db.add(analysis)
    await db.commit()
    await db.refresh(analysis)

    # Schedule background task
    background_tasks.add_task(run_analysis, analysis.id)

    return {"analysis_id": analysis.id, "status": "pending"}


@router.get(
    "/by-slug/{slug}/versions/{version}/analysis",
    response_model=SkillAnalysisResponse | None,
)
async def get_analysis(
    slug: str,
    version: str,
    user: Annotated[User, Depends(get_current_user)],
    owner: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Get the latest analysis result for a version (any logged-in user).

    Returns a single record: the most recent completed analysis if one exists,
    otherwise the most recent analysis of any status (e.g. a pending/failed run
    in progress). Returns null when no analysis exists yet.
    """
    skill = await get_skill_by_slug(db, slug, owner)
    ver = await _get_version(db, skill.id, version)
    if not ver:
        raise HTTPException(status_code=404, detail="Version not found")

    result = await db.execute(
        select(SkillAnalysis)
        .where(SkillAnalysis.version_id == ver.id)
        .order_by(SkillAnalysis.status != "completed", SkillAnalysis.created_at.desc())
    )
    return result.scalars().first()


async def _get_version(db: AsyncSession, skill_id: uuid.UUID, version: str) -> SkillVersion | None:
    result = await db.execute(
        select(SkillVersion).where(
            SkillVersion.skill_id == skill_id,
            SkillVersion.version == version,
        )
    )
    return result.scalar_one_or_none()


# ── Admin: batch backfill ──────────────────────────────
admin_router = APIRouter(prefix="/api/admin/analysis", tags=["admin-analysis"])


@admin_router.post("/backfill")
async def backfill_analyses(
    admin: Annotated[User, Depends(require_role("admin"))],
    background_tasks: BackgroundTasks,
    owner: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    limit: int = 50,
):
    """Create analyses for approved versions that lack a completed analysis.

    Covers the case where versions were approved before a default LLM provider
    existed. Only one new analysis per (version, default provider) is created.
    Returns the count of analyses queued.
    """
    prov_result = await db.execute(
        select(LLMProvider).where(LLMProvider.is_default == True)
    )
    provider = prov_result.scalar_one_or_none()
    if not provider:
        raise HTTPException(status_code=400, detail="No default LLM provider configured")

    # Approved versions with no completed/pending analysis from this provider.
    # A LEFT JOIN that fails to match means "no usable analysis exists".
    existing = (
        select(SkillAnalysis.version_id).where(
            SkillAnalysis.provider_id == provider.id,
            SkillAnalysis.status.in_(["pending", "processing", "completed"]),
        )
    ).subquery()

    rows = await db.execute(
        select(SkillVersion)
        .outerjoin(existing, existing.c.version_id == SkillVersion.id)
        .where(
            SkillVersion.status == "approved",
            existing.c.version_id.is_(None),
        )
        .order_by(SkillVersion.created_at.desc())
        .limit(max(1, min(limit, 500)))
    )
    versions = rows.scalars().all()

    queued = 0
    for ver in versions:
        analysis = SkillAnalysis(
            skill_id=ver.skill_id,
            version_id=ver.id,
            provider_id=provider.id,
            status="pending",
        )
        db.add(analysis)
        await db.flush()
        background_tasks.add_task(run_analysis, analysis.id)
        queued += 1

    await db.commit()
    return {"queued": queued, "provider_id": str(provider.id)}


@admin_router.post("/by-slug/{slug}/versions/{version}/analyze")
async def admin_trigger_analysis_by_slug(
    slug: str,
    version: str,
    admin: Annotated[User, Depends(require_role("admin"))],
    background_tasks: BackgroundTasks,
    owner: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Admin-triggered re-analysis (replaces existing analysis for this version+provider)."""
    skill = await get_skill_by_slug(db, slug, owner)
    ver = await _get_version(db, skill.id, version)
    if not ver:
        raise HTTPException(status_code=404, detail="Version not found")

    prov_result = await db.execute(
        select(LLMProvider).where(LLMProvider.is_default == True)
    )
    provider = prov_result.scalar_one_or_none()
    if not provider:
        raise HTTPException(status_code=400, detail="No default LLM provider configured")

    existing = await db.execute(
        select(SkillAnalysis).where(
            SkillAnalysis.version_id == ver.id,
            SkillAnalysis.provider_id == provider.id,
        )
    )
    for old in existing.scalars().all():
        await db.delete(old)

    analysis = SkillAnalysis(
        skill_id=skill.id,
        version_id=ver.id,
        provider_id=provider.id,
        status="pending",
    )
    db.add(analysis)
    await db.commit()
    await db.refresh(analysis)

    background_tasks.add_task(run_analysis, analysis.id)
    return {"analysis_id": analysis.id, "status": "pending"}
