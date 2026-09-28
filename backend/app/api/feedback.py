from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db, require_role
from app.models import Feedback, User
from app.schemas.feedback import (
    FeedbackCreate,
    FeedbackListResponse,
    FeedbackReply,
    FeedbackResponse,
    FeedbackStatusUpdate,
)
from app.services.audit import log_action
from app.utils.time import utc_now

router = APIRouter(prefix="/api/feedback", tags=["feedback"])

VALID_TYPES = {"bug", "usage", "suggestion", "other"}
VALID_STATUSES = {"pending", "processing", "resolved", "closed"}

STATUS_LABELS = {
    "pending": "待处理",
    "processing": "处理中",
    "resolved": "已解决",
    "closed": "已关闭",
}


async def _enrich_response(fb: Feedback, db: AsyncSession) -> FeedbackResponse:
    resp = FeedbackResponse.model_validate(fb)
    # Load username
    result = await db.execute(select(User.username).where(User.id == fb.user_id))
    row = result.scalar_one_or_none()
    resp.username = row
    # Load replier name
    if fb.replied_by:
        result = await db.execute(select(User.nickname, User.username).where(User.id == fb.replied_by))
        row = result.one_or_none()
        if row:
            resp.replier_name = row[0] or row[1]
    return resp


@router.post("", response_model=FeedbackResponse, status_code=status.HTTP_201_CREATED)
async def create_feedback(
    body: FeedbackCreate,
    user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    fb = Feedback(
        user_id=user.id,
        title=body.title,
        feedback_type=body.feedback_type,
        description=body.description,
        status="pending",
    )
    db.add(fb)
    await db.commit()
    await db.refresh(fb)
    return await _enrich_response(fb, db)


@router.get("/my", response_model=FeedbackListResponse)
async def list_my_feedback(
    user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    base = select(Feedback).where(Feedback.user_id == user.id).order_by(Feedback.created_at.desc())
    count_q = select(func.count()).select_from(base.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    items_q = base.offset((page - 1) * page_size).limit(page_size)
    rows = (await db.execute(items_q)).scalars().all()

    items = []
    for fb in rows:
        items.append(await _enrich_response(fb, db))

    return FeedbackListResponse(items=items, page=page, page_size=page_size, total=total)


# ── Admin endpoints ──────────────────────────────────

admin_router = APIRouter(prefix="/api/admin/feedback", tags=["admin-feedback"])


@admin_router.get("", response_model=FeedbackListResponse)
async def admin_list_feedback(
    admin: Annotated[User, Depends(require_role("admin"))],
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    feedback_type: str | None = None,
    fb_status: str | None = Query(None, alias="status"),
    q: str | None = None,
):
    base = select(Feedback).order_by(Feedback.created_at.desc())

    if feedback_type and feedback_type in VALID_TYPES:
        base = base.where(Feedback.feedback_type == feedback_type)
    if fb_status and fb_status in VALID_STATUSES:
        base = base.where(Feedback.status == fb_status)
    if q:
        escaped = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        base = base.where(
            Feedback.title.ilike(f"%{escaped}%", escape="\\")
            | Feedback.description.ilike(f"%{escaped}%", escape="\\")
        )

    count_q = select(func.count()).select_from(base.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    items_q = base.offset((page - 1) * page_size).limit(page_size)
    rows = (await db.execute(items_q)).scalars().all()

    items = []
    for fb in rows:
        items.append(await _enrich_response(fb, db))

    return FeedbackListResponse(items=items, page=page, page_size=page_size, total=total)


@admin_router.put("/{feedback_id}/reply", response_model=FeedbackResponse)
async def admin_reply_feedback(
    feedback_id: str,
    body: FeedbackReply,
    admin: Annotated[User, Depends(require_role("admin"))],
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Feedback).where(Feedback.id == feedback_id))
    fb = result.scalar_one_or_none()
    if not fb:
        raise HTTPException(status_code=404, detail="反馈不存在")

    fb.admin_reply = body.reply
    fb.replied_by = admin.id
    fb.replied_at = utc_now()
    if body.status and body.status in VALID_STATUSES:
        fb.status = body.status
    elif fb.status == "pending":
        fb.status = "processing"

    await log_action(
        db,
        actor_id=str(admin.id),
        action="reply_feedback",
        target_type="feedback",
        target_id=str(fb.id),
        detail=f"status={fb.status}",
    )

    await db.commit()
    await db.refresh(fb)
    return await _enrich_response(fb, db)


@admin_router.put("/{feedback_id}/status", response_model=FeedbackResponse)
async def admin_update_feedback_status(
    feedback_id: str,
    body: FeedbackStatusUpdate,
    admin: Annotated[User, Depends(require_role("admin"))],
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Feedback).where(Feedback.id == feedback_id))
    fb = result.scalar_one_or_none()
    if not fb:
        raise HTTPException(status_code=404, detail="反馈不存在")

    fb.status = body.status

    await log_action(
        db,
        actor_id=str(admin.id),
        action="update_feedback_status",
        target_type="feedback",
        target_id=str(fb.id),
        detail=f"status={body.status}",
    )

    await db.commit()
    await db.refresh(fb)
    return await _enrich_response(fb, db)
