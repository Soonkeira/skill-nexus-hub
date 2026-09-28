from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.models import User
from app.models.local_scan import LocalPublishItem, LocalPublishRequest, LocalSkillReport, ScanBatch
from app.schemas.local_scan import (
    DeviceResponse,
    LocalSkillReportResponse,
    ScanBatchResponse,
    ScanReportRequest,
    ScanReportResponse,
    LocalPublishRequestCreate,
    LocalPublishRequestCreated,
    LocalPublishRequestResponse,
    LocalPublishResults,
)
from app.utils.time import utc_now

router = APIRouter(prefix="/api/local-skills", tags=["local-skills"])

MAX_BATCHES_PER_DEVICE = 10


@router.post("/report", response_model=ScanReportResponse, status_code=status.HTTP_201_CREATED)
async def upload_scan_report(
    body: ScanReportRequest,
    user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    batch = ScanBatch(
        user_id=user.id,
        device_id=body.device_id,
        device_name=body.device_name,
        status="completed",
        skill_count=len(body.skills),
    )
    db.add(batch)
    await db.flush()

    for skill in body.skills:
        report = LocalSkillReport(
            batch_id=batch.id,
            skill_name=skill.skill_name,
            skill_slug=skill.skill_slug,
            local_ref=skill.local_ref,
            relative_directory=skill.relative_directory,
            agent_target=skill.agent_target,
            files=skill.files,
            has_skill_md=skill.has_skill_md,
            has_skill_yaml=skill.has_skill_yaml,
            file_count=skill.file_count,
            total_size=skill.total_size,
        )
        db.add(report)

    # Auto-cleanup: keep only MAX_BATCHES_PER_DEVICE most recent batches per user+device
    # Use a single subquery to find old batch IDs, then bulk delete atomically
    old_ids_subq = (
        select(ScanBatch.id)
        .where(ScanBatch.user_id == user.id, ScanBatch.device_id == body.device_id)
        .order_by(ScanBatch.scanned_at.asc())
        .offset(MAX_BATCHES_PER_DEVICE)
        .subquery()
    )
    # Delete reports first (FK constraint), then batches
    await db.execute(
        LocalSkillReport.__table__.delete().where(
            LocalSkillReport.batch_id.in_(select(old_ids_subq.c.id))
        )
    )
    await db.execute(
        ScanBatch.__table__.delete().where(
            ScanBatch.id.in_(select(old_ids_subq.c.id))
        )
    )

    await db.commit()

    # Use the in-memory id (set before commit) instead of refresh
    # to avoid issues with async session expiry after commit
    return ScanReportResponse(scan_id=batch.id, skill_count=batch.skill_count)


@router.get("/scan/{scan_id}", response_model=ScanBatchResponse)
async def get_scan_result(
    scan_id: str,
    user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ScanBatch).where(ScanBatch.id == scan_id, ScanBatch.user_id == user.id)
    )
    batch = result.scalar_one_or_none()
    if not batch:
        raise HTTPException(status_code=404, detail="Scan not found")

    reports_result = await db.execute(
        select(LocalSkillReport).where(LocalSkillReport.batch_id == batch.id)
    )
    reports = reports_result.scalars().all()

    resp = ScanBatchResponse(
        id=batch.id,
        device_id=batch.device_id,
        device_name=batch.device_name,
        status=batch.status,
        skill_count=batch.skill_count,
        scanned_at=batch.scanned_at,
        reports=[LocalSkillReportResponse.model_validate(r) for r in reports],
    )
    return resp


@router.get("", response_model=list[LocalSkillReportResponse])
async def get_latest_local_skills(
    user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    # Get the most recent batch per device
    latest_q = (
        select(
            ScanBatch.device_id,
            func.max(ScanBatch.scanned_at).label("latest"),
        )
        .where(ScanBatch.user_id == user.id)
        .group_by(ScanBatch.device_id)
    )
    latest_rows = (await db.execute(latest_q)).all()

    if not latest_rows:
        return []

    all_reports = []
    for device_id, _latest_time in latest_rows:
        batch_q = (
            select(ScanBatch.id)
            .where(ScanBatch.user_id == user.id, ScanBatch.device_id == device_id)
            .order_by(ScanBatch.scanned_at.desc())
            .limit(1)
        )
        batch_row = (await db.execute(batch_q)).scalar_one_or_none()
        if not batch_row:
            continue

        reports_q = select(LocalSkillReport).where(LocalSkillReport.batch_id == batch_row)
        reports = (await db.execute(reports_q)).scalars().all()
        for r in reports:
            resp = LocalSkillReportResponse.model_validate(r)
            resp.device_id = device_id
            all_reports.append(resp)

    return all_reports


@router.get("/devices", response_model=list[DeviceResponse])
async def get_devices(
    user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    q = (
        select(
            ScanBatch.device_id,
            ScanBatch.device_name,
            func.max(ScanBatch.scanned_at).label("last_scanned_at"),
            func.sum(ScanBatch.skill_count).label("skill_count"),
        )
        .where(ScanBatch.user_id == user.id)
        .group_by(ScanBatch.device_id, ScanBatch.device_name)
        .order_by(func.max(ScanBatch.scanned_at).desc())
    )
    rows = (await db.execute(q)).all()

    return [
        DeviceResponse(
            device_id=row.device_id,
            device_name=row.device_name,
            last_scanned_at=row.last_scanned_at,
            skill_count=row.skill_count or 0,
        )
        for row in rows
    ]


@router.post("/publish-requests", response_model=LocalPublishRequestCreated, status_code=status.HTTP_201_CREATED)
async def create_publish_request(
    body: LocalPublishRequestCreate,
    user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    report_ids = [item.report_id for item in body.items]
    rows = (await db.execute(
        select(LocalSkillReport)
        .join(ScanBatch, LocalSkillReport.batch_id == ScanBatch.id)
        .where(LocalSkillReport.id.in_(report_ids), ScanBatch.user_id == user.id)
    )).scalars().all()
    reports = {str(report.id): report for report in rows}
    if len(reports) != len(set(map(str, report_ids))):
        raise HTTPException(status_code=404, detail="Local Skill report not found")

    request = LocalPublishRequest(user_id=user.id, status="pending")
    db.add(request)
    await db.flush()
    for item in body.items:
        report = reports[str(item.report_id)]
        if not report.local_ref:
            raise HTTPException(status_code=400, detail="Please rescan this Skill with the latest SNH CLI")
        db.add(LocalPublishItem(
            request_id=request.id,
            report_id=report.id,
            local_ref=report.local_ref,
            name=item.name,
            slug=item.slug,
            description=item.description,
            version=item.version,
            changelog=item.changelog,
            visibility=item.visibility,
            status="pending",
        ))
    await db.commit()
    return LocalPublishRequestCreated(request_id=request.id, status="pending", item_count=len(body.items))


@router.get("/publish-requests/{request_id}", response_model=LocalPublishRequestResponse)
async def get_publish_request(
    request_id: str,
    user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    request = (await db.execute(
        select(LocalPublishRequest)
        .options(selectinload(LocalPublishRequest.items))
        .where(LocalPublishRequest.id == request_id, LocalPublishRequest.user_id == user.id)
    )).scalar_one_or_none()
    if not request:
        raise HTTPException(status_code=404, detail="Publish request not found")
    return request


@router.post("/publish-requests/{request_id}/results", response_model=LocalPublishRequestResponse)
async def update_publish_results(
    request_id: str,
    body: LocalPublishResults,
    user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    request = (await db.execute(
        select(LocalPublishRequest)
        .options(selectinload(LocalPublishRequest.items))
        .where(LocalPublishRequest.id == request_id, LocalPublishRequest.user_id == user.id)
    )).scalar_one_or_none()
    if not request:
        raise HTTPException(status_code=404, detail="Publish request not found")
    updates = {item.local_ref: item for item in body.items}
    for item in request.items:
        update = updates.get(item.local_ref)
        if update:
            item.status = update.status
            item.error_message = update.error_message
    statuses = {item.status for item in request.items}
    if statuses == {"completed"}:
        request.status = "completed"
        request.completed_at = utc_now()
    elif statuses <= {"completed", "failed"}:
        request.status = "partial" if "completed" in statuses else "failed"
        request.completed_at = utc_now()
    else:
        request.status = "processing"
    await db.commit()
    await db.refresh(request)
    return request
