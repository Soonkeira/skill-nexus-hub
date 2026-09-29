import hashlib
import logging
import mimetypes
import re
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, UploadFile, File, Form, status
from pydantic import BaseModel
from fastapi.responses import Response, StreamingResponse
from sqlalchemy import func, select, update as sa_update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_optional_user, get_db
from app.api.shared import check_skill_access, get_skill_by_slug
from app.models import DownloadLog, Skill, SkillVersion, User
from app.models.skill import VersionStatus
from app.schemas.version import VersionListResponse, VersionResponse
from app.services import file_storage
from app.services.skill_yaml import parse_skill_yaml, validate_skill_yaml, normalize_to_zip, list_zip_files, read_zip_file
from app.services.audit import log_action
from app.utils.time import utc_now

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/skills", tags=["versions"])


async def _read_upload_with_limit(file: UploadFile, max_size: int) -> bytes:
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await file.read(1024 * 1024)
        if not chunk:
            break
        total += len(chunk)
        if total > max_size:
            raise HTTPException(
                status_code=413,
                detail=f"File too large. Maximum size is {max_size // (1024 * 1024)}MB",
            )
        chunks.append(chunk)
    return b"".join(chunks)


def _version_to_response(v: SkillVersion) -> VersionResponse:
    return VersionResponse(
        id=v.id,
        skill_id=v.skill_id,
        version=v.version,
        targets=v.targets,
        readme=v.readme,
        changelog=v.changelog,
        original_filename=v.original_filename,
        file_size=v.file_size,
        checksum=v.checksum,
        status=v.status.value if hasattr(v.status, "value") else v.status,
        publisher_id=v.publisher_id,
        reviewer_id=v.reviewer_id,
        reviewed_at=v.reviewed_at,
        rejection_reason=v.rejection_reason,
        created_at=v.created_at,
    )


@router.get("/by-slug/{slug}/versions", response_model=VersionListResponse)
async def list_versions(
    slug: str,
    owner: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    user: User | None = Depends(get_optional_user),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    skill = await get_skill_by_slug(db, slug, owner)
    check_skill_access(skill, user)

    base = select(SkillVersion).where(SkillVersion.skill_id == skill.id)

    # Admins see all versions. Submitters and skill owners can see their own review state.
    is_admin = user is not None and user.role == "admin"
    if not is_admin:
        if user is None:
            base = base.where(SkillVersion.status == VersionStatus.approved)
        elif str(skill.owner_id) != str(user.id):
            base = base.where(
                (SkillVersion.status == VersionStatus.approved)
                | (SkillVersion.publisher_id == user.id)
            )

    # Count total
    count_q = select(func.count()).select_from(base.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    # Paginate
    rows_q = (
        base.order_by(SkillVersion.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    result = await db.execute(rows_q)
    versions = result.scalars().all()

    items = [_version_to_response(v) for v in versions]
    return VersionListResponse(items=items, page=page, page_size=page_size, total=total)


@router.post("/by-slug/{slug}/versions", response_model=VersionResponse, status_code=status.HTTP_201_CREATED)
async def upload_version(
    slug: str,
    owner: str | None = Query(None),
    version: str = Form(...),
    file: UploadFile = File(...),
    changelog: str | None = Form(None),
    user: Annotated[User, Depends(get_current_user)] = None,
    db: AsyncSession = Depends(get_db),
):
    if not re.match(r'^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$', version):
        raise HTTPException(status_code=400, detail="Version must follow semver format (e.g. 1.0.0)")

    skill = await get_skill_by_slug(db, slug, owner)

    # Check owner/collaborator
    if user.role != "admin" and str(skill.owner_id) != str(user.id):
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    # Read file content with size limit (50MB)
    MAX_FILE_SIZE = 50 * 1024 * 1024
    content = await _read_upload_with_limit(file, MAX_FILE_SIZE)

    # Normalize to ZIP (handles .md and .tar.gz uploads)
    filename = file.filename or "upload.zip"
    try:
        content, _ = normalize_to_zip(content, filename)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Parse and validate skill definition (skill.yaml or SKILL.md)
    try:
        skill_yaml = parse_skill_yaml(content)
        validate_skill_yaml(skill_yaml, slug, version)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Extract README from SKILL.md body if available
    readme = skill_yaml.readme

    # Compute checksum
    checksum = hashlib.sha256(content).hexdigest()

    # Check for duplicate version
    existing = await db.execute(
        select(SkillVersion).where(
            SkillVersion.skill_id == skill.id,
            SkillVersion.version == version,
        )
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=400, detail="Version already exists")

    # Save file first so a disk failure leaves no orphan DB record
    ver_placeholder_id = SkillVersion(
        skill_id=skill.id,
        version=version,
        targets=skill_yaml.targets or None,
        readme=readme,
        changelog=changelog,
        file_path="",
        original_filename=file.filename,
        file_size=len(content),
        checksum=checksum,
        publisher_id=user.id,
        status=VersionStatus.pending,
    )
    # Generate a temporary UUID to use for file path (flush to get ID)
    db.add(ver_placeholder_id)
    await db.flush()

    try:
        file_path = await file_storage.save_skill_zip(skill.id, ver_placeholder_id.id, content)
    except Exception:
        await db.rollback()
        raise HTTPException(status_code=500, detail="Failed to save file. Please try again.")
    ver_placeholder_id.file_path = file_path

    await db.commit()
    await db.refresh(ver_placeholder_id)
    return _version_to_response(ver_placeholder_id)


@router.post("/by-slug/{slug}/versions/{version}/approve", response_model=VersionResponse)
async def approve_version(
    slug: str,
    version: str,
    user: Annotated[User, Depends(get_current_user)],
    background_tasks: BackgroundTasks,
    owner: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    skill = await get_skill_by_slug(db, slug, owner)

    result = await db.execute(
        select(SkillVersion).where(
            SkillVersion.skill_id == skill.id,
            SkillVersion.version == version,
        )
    )
    ver = result.scalar_one_or_none()
    if ver is None:
        raise HTTPException(status_code=404, detail="Version not found")

    is_reapproval = ver.status == VersionStatus.approved
    ver.status = VersionStatus.approved
    ver.reviewer_id = user.id
    ver.reviewed_at = utc_now()

    # Advance the latest_version_id pointer only on a pending -> approved
    # transition, and only when the newly approved version is the most recently
    # published (created) approved version. Re-approving an older version must
    # never move the pointer backwards.
    if not is_reapproval:
        newest_other = (
            await db.execute(
                select(SkillVersion)
                .where(
                    SkillVersion.skill_id == skill.id,
                    SkillVersion.status == VersionStatus.approved,
                    SkillVersion.id != ver.id,
                )
                .order_by(SkillVersion.created_at.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
        if newest_other is None or ver.created_at >= newest_other.created_at:
            skill.latest_version_id = ver.id

    await log_action(
        db, actor_id=str(user.id), action="approve_version",
        target_type="skill_version", target_id=str(ver.id),
        detail=f"slug={slug} version={version}",
    )

    # Auto-trigger LLM analysis if a default provider exists.
    # IMPORTANT: do this in a SEPARATE session so that any DB error while
    # scheduling the analysis cannot poison the approval transaction (the bare
    # except below would otherwise leave `db` in a failed state and the
    # approval commit at the end would fail too).
    try:
        from app.database import async_session
        from app.models.llm_provider import LLMProvider, SkillAnalysis
        from app.services.analysis import run_analysis

        async with async_session() as analysis_db:
            prov_result = await analysis_db.execute(
                select(LLMProvider).where(LLMProvider.is_default == True)
            )
            provider = prov_result.scalar_one_or_none()
            if provider:
                analysis = SkillAnalysis(
                    skill_id=skill.id,
                    version_id=ver.id,
                    provider_id=provider.id,
                    status="pending",
                )
                analysis_db.add(analysis)
                await analysis_db.flush()
                analysis_id = analysis.id
                await analysis_db.commit()
            else:
                analysis_id = None
        if analysis_id is not None:
            background_tasks.add_task(run_analysis, analysis_id)
    except Exception:
        # Analysis scheduling failure must never block the approval itself.
        logger.warning("Failed to schedule auto analysis for version %s", ver.id, exc_info=True)

    await db.commit()
    await db.refresh(ver)
    return _version_to_response(ver)


class RejectRequest(BaseModel):
    reason: str | None = None


@router.post("/by-slug/{slug}/versions/{version}/reject", response_model=VersionResponse)
async def reject_version(
    slug: str,
    version: str,
    user: Annotated[User, Depends(get_current_user)],
    owner: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    body: RejectRequest | None = None,
):
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    skill = await get_skill_by_slug(db, slug, owner)

    result = await db.execute(
        select(SkillVersion).where(
            SkillVersion.skill_id == skill.id,
            SkillVersion.version == version,
        )
    )
    ver = result.scalar_one_or_none()
    if ver is None:
        raise HTTPException(status_code=404, detail="Version not found")

    ver.status = VersionStatus.rejected
    ver.reviewer_id = user.id
    ver.reviewed_at = utc_now()
    ver.rejection_reason = body.reason if body else None

    # If the rejected version was the skill's latest pointer, repoint it to the
    # most recent remaining approved version (or clear it when none is left).
    # Rejecting a non-latest version leaves the pointer untouched.
    if skill.latest_version_id == ver.id:
        remaining = (
            await db.execute(
                select(SkillVersion)
                .where(
                    SkillVersion.skill_id == skill.id,
                    SkillVersion.status == VersionStatus.approved,
                    SkillVersion.id != ver.id,
                )
                .order_by(SkillVersion.created_at.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
        skill.latest_version_id = remaining.id if remaining is not None else None

    await log_action(
        db, actor_id=str(user.id), action="reject_version",
        target_type="skill_version", target_id=str(ver.id),
        detail=f"slug={slug} version={version} reason={body.reason if body else None}",
    )
    await db.commit()
    await db.refresh(ver)
    return _version_to_response(ver)


@router.get("/by-slug/{slug}/versions/{version}/download")
async def download_version(
    slug: str,
    version: str,
    owner: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    skill = await get_skill_by_slug(db, slug, owner)
    check_skill_access(skill, user)

    result = await db.execute(
        select(SkillVersion).where(
            SkillVersion.skill_id == skill.id,
            SkillVersion.version == version,
        )
    )
    ver = result.scalar_one_or_none()
    if ver is None:
        raise HTTPException(status_code=404, detail="Version not found")

    status_value = ver.status.value if hasattr(ver.status, "value") else ver.status
    if status_value != "approved":
        can_review_download = user is not None and (
            user.role == "admin"
            or str(ver.publisher_id) == str(user.id)
            or str(skill.owner_id) == str(user.id)
        )
        if not can_review_download:
            raise HTTPException(status_code=404, detail="Version not found")
    else:
        # Public approved downloads count toward usage stats.
        log = DownloadLog(
            skill_id=skill.id,
            version_id=ver.id,
            user_id=user.id if user else None,
            source="web",
        )
        db.add(log)
        await db.commit()

    # Stream the file so peak memory stays bounded under concurrent downloads
    filename = ver.original_filename or f"{slug}-{version}.zip"
    return StreamingResponse(
        file_storage.stream_file(ver.file_path),
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Length": str(file_storage.file_size(ver.file_path)),
        },
    )


@router.get("/by-slug/{slug}/versions/{version}/files")
async def list_version_files(
    slug: str,
    version: str,
    owner: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    skill = await get_skill_by_slug(db, slug, owner)
    check_skill_access(skill, user)
    result = await db.execute(
        select(SkillVersion).where(
            SkillVersion.skill_id == skill.id,
            SkillVersion.version == version,
        )
    )
    ver = result.scalar_one_or_none()
    if ver is None:
        raise HTTPException(status_code=404, detail="Version not found")

    status_value = ver.status.value if hasattr(ver.status, "value") else ver.status
    if status_value != "approved":
        can_view = user is not None and (
            user.role == "admin"
            or str(ver.publisher_id) == str(user.id)
            or str(skill.owner_id) == str(user.id)
        )
        if not can_view:
            raise HTTPException(status_code=404, detail="Version not found")

    content = await file_storage.read_file(ver.file_path)
    return {"files": list_zip_files(content)}


@router.get("/by-slug/{slug}/versions/{version}/files/content")
async def read_version_file(
    slug: str,
    version: str,
    path: str = Query(..., description="File path within the ZIP"),
    owner: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    skill = await get_skill_by_slug(db, slug, owner)
    check_skill_access(skill, user)
    result = await db.execute(
        select(SkillVersion).where(
            SkillVersion.skill_id == skill.id,
            SkillVersion.version == version,
        )
    )
    ver = result.scalar_one_or_none()
    if ver is None:
        raise HTTPException(status_code=404, detail="Version not found")

    status_value = ver.status.value if hasattr(ver.status, "value") else ver.status
    if status_value != "approved":
        can_view = user is not None and (
            user.role == "admin"
            or str(ver.publisher_id) == str(user.id)
            or str(skill.owner_id) == str(user.id)
        )
        if not can_view:
            raise HTTPException(status_code=404, detail="Version not found")

    content = await file_storage.read_file(ver.file_path)
    try:
        file_data = read_zip_file(content, path)
    except ValueError:
        raise HTTPException(status_code=404, detail="File not found in ZIP")

    guessed_type = mimetypes.guess_type(path)[0]
    safe_inline_types = {
        "image/avif",
        "image/gif",
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/x-icon",
    }
    if guessed_type in safe_inline_types:
        media_type = guessed_type
    elif guessed_type and (
        guessed_type.startswith("text/")
        or guessed_type in {"application/json", "application/xml", "application/javascript"}
    ):
        media_type = "text/plain"
    else:
        media_type = "application/octet-stream"
    return Response(content=file_data, media_type=media_type)
