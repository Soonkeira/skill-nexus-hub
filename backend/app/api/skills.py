from datetime import datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import delete, exists, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db, get_optional_user
from app.api.shared import check_skill_access, get_skill_by_slug
from app.services.file_storage import delete_skill_dir
from app.services.audit import log_action
from app.models import (
    Bookmark,
    Collaborator,
    Comment,
    DownloadLog,
    InstallLog,
    Skill,
    SkillInstallTarget,
    SkillVersion,
    User,
)
from app.schemas.skill import (
    InstallTargetResponse,
    SkillCreate,
    SkillListResponse,
    SkillResponse,
    SkillUpdate,
    SkillTrustStatus,
)
from app.utils.time import utc_now

router = APIRouter(prefix="/api/skills", tags=["skills"])


async def _load_owner_names(
    db: AsyncSession,
    skills: list[Skill],
) -> tuple[dict[str, str], dict[str, str | None], dict[str, str | None]]:
    if not skills:
        return {}, {}, {}
    user_ids = list(set(s.owner_id for s in skills))
    result = await db.execute(
        select(User.id, User.username, User.nickname, User.department)
        .where(User.id.in_(user_ids))
    )
    names = {}
    nicknames = {}
    departments = {}
    for row in result:
        names[str(row[0])] = row[1]
        nicknames[str(row[0])] = row[2]
        departments[str(row[0])] = row[3]
    return names, nicknames, departments


async def _load_latest_versions(db: AsyncSession, skills: list[Skill]) -> dict[str, SkillVersion]:
    if not skills:
        return {}

    skill_ids = [s.id for s in skills]
    result = await db.execute(
        select(SkillVersion)
        .where(SkillVersion.skill_id.in_(skill_ids))
        .order_by(SkillVersion.created_at.desc())
    )
    versions = result.scalars().all()
    by_id = {str(v.id): v for v in versions}
    by_skill: dict[str, SkillVersion] = {}
    for v in versions:
        by_skill.setdefault(str(v.skill_id), v)

    latest: dict[str, SkillVersion] = {}
    for skill in skills:
        if skill.latest_version_id and str(skill.latest_version_id) in by_id:
            latest[str(skill.id)] = by_id[str(skill.latest_version_id)]
        elif str(skill.id) in by_skill:
            latest[str(skill.id)] = by_skill[str(skill.id)]
    return latest


async def _can_edit(db: AsyncSession, skill: Skill, user: User) -> bool:
    if user.role == "admin":
        return True
    if str(skill.owner_id) == str(user.id):
        return True
    result = await db.execute(
        select(Collaborator).where(
            Collaborator.skill_id == skill.id,
            Collaborator.user_id == user.id,
            Collaborator.role.in_(["owner", "editor"]),
        )
    )
    return result.scalar_one_or_none() is not None


def _documentation_status(skill: Skill, version: SkillVersion | None) -> str:
    readme = (version.readme if version else None) or ""
    if not readme.strip():
        return "missing"

    doc_text = f"{skill.description or ''}\n{readme}".lower()
    signals = ["适用", "使用", "限制", "示例", "触发", "workflow", "usage", "example"]
    signal_count = sum(1 for signal in signals if signal in doc_text)
    if len(readme.strip()) >= 80 and signal_count >= 2:
        return "complete"
    return "needs_work"


def _build_trust_status(skill: Skill, latest_version: SkillVersion | None) -> SkillTrustStatus:
    labels: list[str] = []
    warnings: list[str] = []
    review_status = "no_version"
    security_status = "not_checked"

    if latest_version is None:
        warnings.append("暂无可审核版本")
    else:
        review_status = (
            latest_version.status.value
            if hasattr(latest_version.status, "value")
            else latest_version.status
        )
        if review_status == "approved":
            labels.extend(["已审核", "基础安全检查通过"])
            security_status = "passed"
        elif review_status == "pending":
            labels.append("待审核")
            warnings.append("最新版本仍在审核中")
            security_status = "pending"
        elif review_status == "rejected":
            labels.append("已驳回")
            warnings.append("最新版本未通过审核")
            security_status = "warning"

    documentation_status = _documentation_status(skill, latest_version)
    if documentation_status == "complete":
        labels.append("说明完整")
    elif documentation_status == "needs_work":
        warnings.append("说明文档建议补充适用场景、使用方式或限制说明")
    else:
        warnings.append("缺少说明文档")

    return SkillTrustStatus(
        review_status=review_status,
        security_status=security_status,
        documentation_status=documentation_status,
        latest_version=latest_version.version if latest_version else None,
        reviewed_at=latest_version.reviewed_at if latest_version else None,
        labels=labels,
        warnings=warnings,
    )


def _skill_to_response(
    skill: Skill,
    download_count: int = 0,
    versions: list[dict] | None = None,
    owner_name: str | None = None,
    owner_nickname: str | None = None,
    owner_department: str | None = None,
    latest_version: SkillVersion | None = None,
) -> SkillResponse:
    return SkillResponse(
        id=skill.id,
        name=skill.name,
        slug=skill.slug,
        description=skill.description,
        tags=skill.tags if isinstance(skill.tags, list) else None,
        visibility=(
            skill.visibility.value
            if hasattr(skill.visibility, "value")
            else skill.visibility
        ),
        icon_path=skill.icon_path,
        latest_version_id=skill.latest_version_id,
        owner_id=skill.owner_id,
        owner_name=owner_name,
        owner_nickname=owner_nickname,
        owner_department=owner_department,
        created_at=skill.created_at,
        updated_at=skill.updated_at,
        download_count=download_count,
        versions=versions,
        trust=_build_trust_status(skill, latest_version),
    )


@router.get("", response_model=SkillListResponse)
async def list_skills(
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    q: str | None = None,
    tags: str | None = None,
    target: str | None = None,
    sort: str = Query("newest", pattern="^(newest|downloads|weekly_downloads)$"),
):
    approved_version_exists = exists(
        select(SkillVersion.id).where(
            SkillVersion.skill_id == Skill.id,
            SkillVersion.status == "approved",
        )
    )
    base = select(Skill).where(
        Skill.visibility == "public",
        approved_version_exists,
    )

    if target:
        latest_version_supports_target = exists(
            select(SkillVersion.id).where(
                SkillVersion.id == Skill.latest_version_id,
                SkillVersion.status == "approved",
                SkillVersion.targets.contains([target]),
            )
        )
        base = base.where(
            latest_version_supports_target | Skill.tags.contains([target])
        )

    if q:
        escaped = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        base = base.where(
            (Skill.name.ilike(f"%{escaped}%", escape="\\")) | (Skill.description.ilike(f"%{escaped}%", escape="\\"))
        )

    if tags:
        tag_list = [t.strip() for t in tags.split(",") if t.strip()]
        for tag in tag_list:
            base = base.where(Skill.tags.contains([tag]))

    # Count total
    count_q = select(func.count()).select_from(base.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    if sort in ("downloads", "weekly_downloads"):
        dl_filter = DownloadLog.skill_id == Skill.id
        if sort == "weekly_downloads":
            seven_days_ago = datetime.utcnow() - timedelta(days=7)
            dl_filter = dl_filter & (DownloadLog.downloaded_at >= seven_days_ago)
        rows_q = (
            base.outerjoin(DownloadLog, dl_filter)
            .group_by(Skill.id)
            .order_by(func.count(DownloadLog.id).desc(), Skill.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        result = await db.execute(rows_q)
        skills = result.scalars().all()
    else:
        rows_q = (
            base.order_by(Skill.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        result = await db.execute(rows_q)
        skills = result.scalars().all()

    # Batch download counts
    skill_ids = [s.id for s in skills]
    dl_map: dict[str, int] = {}
    if skill_ids:
        dl_sub = (
            select(DownloadLog.skill_id, func.count().label("cnt"))
            .where(DownloadLog.skill_id.in_(skill_ids))
            .group_by(DownloadLog.skill_id)
        )
        dl_result = await db.execute(dl_sub)
        for row in dl_result:
            dl_map[str(row[0])] = row[1]

    owner_map, owner_nick_map, owner_department_map = await _load_owner_names(db, skills)
    latest_map = await _load_latest_versions(db, skills)
    items = [
        _skill_to_response(
            s,
            download_count=dl_map.get(str(s.id), 0),
            owner_name=owner_map.get(str(s.owner_id)),
            owner_nickname=owner_nick_map.get(str(s.owner_id)),
            owner_department=owner_department_map.get(str(s.owner_id)),
            latest_version=latest_map.get(str(s.id)),
        )
        for s in skills
    ]
    return SkillListResponse(items=items, page=page, page_size=page_size, total=total)


@router.get("/my", response_model=SkillListResponse)
async def list_my_skills(
    user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    base = select(Skill).where(Skill.owner_id == user.id)

    # Count total
    count_q = select(func.count()).select_from(base.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    # Paginate
    rows_q = (
        base.order_by(Skill.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    result = await db.execute(rows_q)
    skills = result.scalars().all()

    # Batch download counts
    skill_ids = [s.id for s in skills]
    dl_map: dict[str, int] = {}
    if skill_ids:
        dl_sub = (
            select(DownloadLog.skill_id, func.count().label("cnt"))
            .where(DownloadLog.skill_id.in_(skill_ids))
            .group_by(DownloadLog.skill_id)
        )
        dl_result = await db.execute(dl_sub)
        for row in dl_result:
            dl_map[str(row[0])] = row[1]

    latest_map = await _load_latest_versions(db, skills)
    items = [
        _skill_to_response(
            s,
            download_count=dl_map.get(str(s.id), 0),
            owner_name=user.username,
            owner_nickname=user.nickname,
            owner_department=user.department,
            latest_version=latest_map.get(str(s.id)),
        )
        for s in skills
    ]
    return SkillListResponse(items=items, page=page, page_size=page_size, total=total)


@router.get("/by-slug/{slug}", response_model=SkillResponse)
async def get_skill_detail(
    slug: str,
    owner: str | None = Query(None, description="Owner username to disambiguate"),
    db: AsyncSession = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    skill = await get_skill_by_slug(db, slug, owner)
    check_skill_access(skill, user)

    # Download count
    dl_result = await db.execute(
        select(func.count()).where(DownloadLog.skill_id == skill.id)
    )
    download_count = dl_result.scalar() or 0

    # Owner name and nickname
    owner_result = await db.execute(select(User.username, User.nickname, User.department).where(User.id == skill.owner_id))
    owner_row = owner_result.one_or_none()
    owner_name = owner_row[0] if owner_row else None
    owner_nickname = owner_row[1] if owner_row else None
    owner_department = owner_row[2] if owner_row else None

    # Versions
    ver_result = await db.execute(
        select(SkillVersion)
        .where(SkillVersion.skill_id == skill.id)
        .order_by(SkillVersion.created_at.desc())
    )
    versions = ver_result.scalars().all()
    latest_version = None
    if skill.latest_version_id:
        latest_version = next((v for v in versions if str(v.id) == str(skill.latest_version_id)), None)
    if latest_version is None and versions:
        latest_version = versions[0]
    version_briefs = [
        {
            "id": v.id,
            "version": v.version,
            "status": (
                v.status.value if hasattr(v.status, "value") else v.status
            ),
            "created_at": v.created_at,
        }
        for v in versions
    ]

    return _skill_to_response(
        skill,
        download_count=download_count,
        versions=version_briefs,
        owner_name=owner_name,
        owner_nickname=owner_nickname,
        owner_department=owner_department,
        latest_version=latest_version,
    )


@router.post("", response_model=SkillResponse, status_code=status.HTTP_201_CREATED)
async def create_skill(
    body: SkillCreate,
    user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(
        select(Skill).where(Skill.slug == body.slug, Skill.owner_id == user.id)
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=400, detail="Slug already taken")

    skill = Skill(
        name=body.name,
        slug=body.slug,
        description=body.description,
        tags=body.tags,
        visibility=body.visibility,
        icon_path=body.icon_path,
        owner_id=user.id,
    )
    db.add(skill)
    await db.commit()
    await db.refresh(skill)
    return _skill_to_response(
        skill,
        owner_name=user.username,
        owner_nickname=user.nickname,
        owner_department=user.department,
    )


@router.put("/by-slug/{slug}", response_model=SkillResponse)
async def update_skill(
    slug: str,
    body: SkillUpdate,
    user: Annotated[User, Depends(get_current_user)],
    owner: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    skill = await get_skill_by_slug(db, slug, owner)
    if not await _can_edit(db, skill, user):
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    update_data = body.model_dump(exclude_unset=True)
    if "visibility" in update_data:
        old_vis = skill.visibility.value if hasattr(skill.visibility, "value") else skill.visibility
        new_vis = update_data["visibility"]
        await log_action(
            db, actor_id=str(user.id), action="update_visibility",
            target_type="skill", target_id=str(skill.id),
            detail=f"slug={slug} {old_vis} -> {new_vis}",
        )
    for field, value in update_data.items():
        setattr(skill, field, value)
    skill.updated_at = utc_now()

    await db.commit()
    await db.refresh(skill)
    return _skill_to_response(skill)


@router.delete("/by-slug/{slug}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_skill(
    slug: str,
    user: Annotated[User, Depends(get_current_user)],
    owner: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    skill = await get_skill_by_slug(db, slug, owner)
    if user.role != "admin" and str(skill.owner_id) != str(user.id):
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    await log_action(
        db, actor_id=str(user.id), action="delete_skill",
        target_type="skill", target_id=str(skill.id),
        detail=f"slug={slug} name={skill.name}",
    )
    await db.execute(
        update(Skill)
        .where(Skill.id == skill.id)
        .values(latest_version_id=None)
    )
    await db.execute(delete(Bookmark).where(Bookmark.skill_id == skill.id))
    await db.execute(delete(Comment).where(Comment.skill_id == skill.id))
    await db.execute(delete(InstallLog).where(InstallLog.skill_id == skill.id))
    await db.execute(delete(DownloadLog).where(DownloadLog.skill_id == skill.id))
    await db.execute(delete(Collaborator).where(Collaborator.skill_id == skill.id))
    await db.execute(delete(SkillVersion).where(SkillVersion.skill_id == skill.id))
    await db.delete(skill)
    await db.commit()
    await delete_skill_dir(skill.id)


@router.get(
    "/install-targets",
    response_model=list[InstallTargetResponse],
    tags=["install-targets"],
)
async def list_install_targets(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SkillInstallTarget))
    return result.scalars().all()


@router.get("/latest-versions")
async def latest_versions(
    slugs: str = Query(..., description="Comma-separated skill slugs (max 50)"),
    db: AsyncSession = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    """Batch query latest approved version for multiple skills."""
    slug_list = [s.strip() for s in slugs.split(",") if s.strip()]
    if not slug_list:
        return {"items": {}}
    if len(slug_list) > 50:
        raise HTTPException(status_code=400, detail="Maximum 50 slugs per request")
    # Fetch skills by slug
    result = await db.execute(
        select(Skill).where(Skill.slug.in_(slug_list))
    )
    skills = result.scalars().all()
    if not skills:
        return {"items": {}}
    # Access check: only return skills the user can see
    visible_skills = []
    for skill in skills:
        try:
            check_skill_access(skill, user)
            visible_skills.append(skill)
        except HTTPException:
            continue
    if not visible_skills:
        return {"items": {}}
    # Fetch latest approved version for each visible skill
    skill_ids = [s.id for s in visible_skills]
    slug_by_id = {str(s.id): s.slug for s in visible_skills}
    # Use DISTINCT ON to get the latest approved version per skill
    from sqlalchemy.dialects.postgresql import insert as pg_insert
    subq = (
        select(
            SkillVersion.skill_id,
            SkillVersion.version,
            SkillVersion.status,
        )
        .where(
            SkillVersion.skill_id.in_(skill_ids),
            SkillVersion.status == "approved",
        )
        .order_by(SkillVersion.skill_id, SkillVersion.created_at.desc())
        .distinct(SkillVersion.skill_id)
        .subquery()
    )
    result = await db.execute(select(subq))
    items = {}
    for row in result:
        slug_key = slug_by_id.get(str(row.skill_id))
        if slug_key:
            items[slug_key] = {
                "version": row.version,
                "status": row.status.value if hasattr(row.status, "value") else row.status,
            }
    return {"items": items}
