import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel
from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.api.deps import get_db, require_role
from app.api.pending import PendingListResponse, list_pending_versions_for_user
from app.api.skills import _load_owner_names, _skill_to_response
from app.models import ApiToken, Bookmark, Collaborator, Comment, DownloadLog, InstallLog, Skill, SkillVersion, User
from app.models.comment import Comment as CommentModel
from app.schemas.auth import UserResponse
from app.schemas.skill import SkillListResponse
from app.services.file_storage import delete_skill_dir
from app.services.audit import log_action

router = APIRouter(prefix="/api/admin", tags=["admin"])


class RoleUpdateRequest(BaseModel):
    role: str


@router.get("/pending", response_model=PendingListResponse)
async def list_pending_versions(
    admin: Annotated[User, Depends(require_role("admin"))],
    db: AsyncSession = Depends(get_db),
):
    return await list_pending_versions_for_user(db, admin)


@router.get("/skills", response_model=SkillListResponse)
async def list_all_skills(
    admin: Annotated[User, Depends(require_role("admin"))],
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    q: str | None = None,
):
    base = select(Skill)

    if q:
        escaped = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        base = base.where(
            (Skill.name.ilike(f"%{escaped}%", escape="\\")) | (Skill.description.ilike(f"%{escaped}%", escape="\\"))
        )

    count_q = select(func.count()).select_from(base.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    rows_q = (
        base.order_by(Skill.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    result = await db.execute(rows_q)
    skills = result.scalars().all()

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
    items = [
        _skill_to_response(
            s,
            download_count=dl_map.get(str(s.id), 0),
            owner_name=owner_map.get(str(s.owner_id)),
            owner_nickname=owner_nick_map.get(str(s.owner_id)),
            owner_department=owner_department_map.get(str(s.owner_id)),
        )
        for s in skills
    ]
    return SkillListResponse(items=items, page=page, page_size=page_size, total=total)


@router.get("/users")
async def list_users(
    admin: Annotated[User, Depends(require_role("admin"))],
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    base = select(User).order_by(User.created_at.desc())
    count_q = select(func.count()).select_from(User)
    total = (await db.execute(count_q)).scalar() or 0

    rows_q = base.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(rows_q)
    users = result.scalars().all()
    return {"items": users, "page": page, "page_size": page_size, "total": total}


@router.put("/users/{user_id}/role", response_model=UserResponse)
async def update_user_role(
    user_id: uuid.UUID,
    body: RoleUpdateRequest,
    admin: Annotated[User, Depends(require_role("admin"))],
    db: AsyncSession = Depends(get_db),
    request: Request = None,
):
    if body.role not in ("user", "admin"):
        raise HTTPException(status_code=400, detail="Invalid role. Must be user or admin")
    result = await db.execute(select(User).where(User.id == str(user_id)))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    if str(user.id) == str(admin.id):
        raise HTTPException(status_code=400, detail="Cannot change your own role")
    old_role = user.role
    user.role = body.role
    await log_action(
        db, actor_id=str(admin.id), action="update_role",
        target_type="user", target_id=str(user_id),
        detail=f"{old_role} -> {body.role}",
        ip_address=request.client.host if request and request.client else None,
    )
    await db.commit()
    await db.refresh(user)
    return user


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: uuid.UUID,
    admin: Annotated[User, Depends(require_role("admin"))],
    db: AsyncSession = Depends(get_db),
    request: Request = None,
):
    result = await db.execute(select(User).where(User.id == str(user_id)))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    if str(user.id) == str(admin.id):
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    if user.role == "admin":
        raise HTTPException(status_code=403, detail="Cannot delete other admins")

    await log_action(
        db, actor_id=str(admin.id), action="delete_user",
        target_type="user", target_id=str(user_id),
        detail=f"username={user.username}",
        ip_address=request.client.host if request and request.client else None,
    )

    owned_skill_result = await db.execute(select(Skill.id).where(Skill.owner_id == user.id))
    owned_skill_ids = owned_skill_result.scalars().all()

    if owned_skill_ids:
        await db.execute(
            update(Skill)
            .where(Skill.id.in_(owned_skill_ids))
            .values(latest_version_id=None)
        )
        await db.execute(delete(Bookmark).where(Bookmark.skill_id.in_(owned_skill_ids)))
        await db.execute(delete(Comment).where(Comment.skill_id.in_(owned_skill_ids)))
        await db.execute(delete(InstallLog).where(InstallLog.skill_id.in_(owned_skill_ids)))
        await db.execute(delete(DownloadLog).where(DownloadLog.skill_id.in_(owned_skill_ids)))
        await db.execute(delete(Collaborator).where(Collaborator.skill_id.in_(owned_skill_ids)))
        await db.execute(delete(SkillVersion).where(SkillVersion.skill_id.in_(owned_skill_ids)))
        await db.execute(delete(Skill).where(Skill.id.in_(owned_skill_ids)))

    comment_result = await db.execute(select(Comment.id).where(Comment.user_id == user.id))
    user_comment_ids = comment_result.scalars().all()
    if user_comment_ids:
        await db.execute(
            update(Comment)
            .where(Comment.parent_id.in_(user_comment_ids))
            .values(parent_id=None)
        )
        await db.execute(delete(Comment).where(Comment.id.in_(user_comment_ids)))

    await db.execute(delete(ApiToken).where(ApiToken.user_id == user.id))
    await db.execute(delete(Bookmark).where(Bookmark.user_id == user.id))
    await db.execute(delete(Collaborator).where(Collaborator.user_id == user.id))
    await db.execute(delete(InstallLog).where(InstallLog.user_id == user.id))
    await db.execute(
        update(DownloadLog)
        .where(DownloadLog.user_id == user.id)
        .values(user_id=None)
    )
    await db.execute(
        update(SkillVersion)
        .where(SkillVersion.reviewer_id == user.id)
        .values(reviewer_id=None)
    )
    await db.execute(
        update(SkillVersion)
        .where(SkillVersion.publisher_id == user.id)
        .values(publisher_id=admin.id)
    )

    await db.delete(user)
    await db.commit()

    for skill_id in owned_skill_ids:
        await delete_skill_dir(skill_id)


@router.get("/audit-logs")
async def list_audit_logs(
    admin: Annotated[User, Depends(require_role("admin"))],
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    action: str | None = Query(None),
    target_type: str | None = Query(None),
):
    from app.models.audit import AuditLog
    base = select(AuditLog).order_by(AuditLog.created_at.desc())
    if action:
        base = base.where(AuditLog.action == action)
    if target_type:
        base = base.where(AuditLog.target_type == target_type)

    count_q = select(func.count()).select_from(base.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    rows_q = base.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(rows_q)
    logs = result.scalars().all()

    actor_ids = list(set(str(l.actor_id) for l in logs if l.actor_id is not None))
    actor_map: dict[str, str] = {}
    if actor_ids:
        uresult = await db.execute(select(User.id, User.username).where(User.id.in_(actor_ids)))
        for row in uresult:
            actor_map[str(row[0])] = row[1]

    items = [
        {
            "id": str(l.id),
            "actor_id": str(l.actor_id) if l.actor_id else None,
            "actor_name": actor_map.get(str(l.actor_id), "已删除用户") if l.actor_id else "已删除用户",
            "action": l.action,
            "target_type": l.target_type,
            "target_id": l.target_id,
            "detail": l.detail,
            "ip_address": l.ip_address,
            "created_at": l.created_at.isoformat() if l.created_at else None,
        }
        for l in logs
    ]
    return {"items": items, "page": page, "page_size": page_size, "total": total}


# ── Comment Management ──

@router.get("/comments")
async def list_all_comments(
    admin: Annotated[User, Depends(require_role("admin"))],
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    skill_slug: str | None = Query(None),
    username: str | None = Query(None),
):
    skill_owner = aliased(User)
    base = (
        select(
            Comment,
            User.username,
            Skill.name.label("skill_name"),
            Skill.slug.label("skill_slug"),
            skill_owner.username.label("owner_username"),
        )
        .join(User, Comment.user_id == User.id)
        .join(Skill, Comment.skill_id == Skill.id)
        .join(skill_owner, Skill.owner_id == skill_owner.id)
    )

    if skill_slug:
        base = base.where(Skill.slug.ilike(f"%{skill_slug}%"))
    if username:
        base = base.where(User.username.ilike(f"%{username}%"))

    count_q = select(func.count()).select_from(base.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    rows_q = base.order_by(Comment.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(rows_q)
    rows = result.all()

    items = [
        {
            "id": str(row[0].id),
            "skill_id": str(row[0].skill_id),
            "skill_name": row[2],
            "skill_slug": row[3],
            "owner_username": row[4],
            "user_id": str(row[0].user_id),
            "username": row[1],
            "content": row[0].content,
            "parent_id": str(row[0].parent_id) if row[0].parent_id else None,
            "created_at": row[0].created_at.isoformat() if row[0].created_at else None,
        }
        for row in rows
    ]
    return {"items": items, "page": page, "page_size": page_size, "total": total}


@router.delete("/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def admin_delete_comment(
    comment_id: str,
    admin: Annotated[User, Depends(require_role("admin"))],
    db: AsyncSession = Depends(get_db),
    request: Request = None,
):
    result = await db.execute(select(Comment).where(Comment.id == comment_id))
    comment = result.scalar_one_or_none()
    if comment is None:
        raise HTTPException(status_code=404, detail="Comment not found")

    await log_action(
        db, actor_id=str(admin.id), action="delete_comment",
        target_type="comment", target_id=comment_id,
        detail=f"content={comment.content[:80]}",
        ip_address=request.client.host if request and request.client else None,
    )
    await db.delete(comment)
    await db.commit()


class BulkDeleteCommentsRequest(BaseModel):
    comment_ids: list[str]


@router.post("/comments/bulk-delete")
async def admin_bulk_delete_comments(
    body: BulkDeleteCommentsRequest,
    admin: Annotated[User, Depends(require_role("admin"))],
    db: AsyncSession = Depends(get_db),
    request: Request = None,
):
    """Delete multiple comments at once. Orphaned child comments are detached first."""
    ids = [cid for cid in body.comment_ids if cid]
    if not ids:
        return {"deleted": 0}
    if len(ids) > 500:
        raise HTTPException(status_code=400, detail="Maximum 500 comments per request")

    # Detach children whose parent is in the deletion set, so FK stays valid
    await db.execute(
        update(Comment).where(Comment.parent_id.in_(ids)).values(parent_id=None)
    )
    result = await db.execute(delete(Comment).where(Comment.id.in_(ids)))

    await log_action(
        db, actor_id=str(admin.id), action="bulk_delete_comments",
        target_type="comment", target_id=",".join(ids[:20]),
        detail=f"count={result.rowcount}",
        ip_address=request.client.host if request and request.client else None,
    )
    await db.commit()
    return {"deleted": result.rowcount}


# ── User Content Management ──

@router.put("/users/{user_id}/reset-avatar", response_model=UserResponse)
async def reset_user_avatar(
    user_id: uuid.UUID,
    admin: Annotated[User, Depends(require_role("admin"))],
    db: AsyncSession = Depends(get_db),
    request: Request = None,
):
    result = await db.execute(select(User).where(User.id == str(user_id)))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    await log_action(
        db, actor_id=str(admin.id), action="reset_avatar",
        target_type="user", target_id=str(user_id),
        detail=f"username={user.username} old_avatar={user.avatar_url}",
        ip_address=request.client.host if request and request.client else None,
    )
    user.avatar_url = None
    await db.commit()
    await db.refresh(user)
    return user


@router.put("/users/{user_id}/reset-nickname", response_model=UserResponse)
async def reset_user_nickname(
    user_id: uuid.UUID,
    admin: Annotated[User, Depends(require_role("admin"))],
    db: AsyncSession = Depends(get_db),
    request: Request = None,
):
    result = await db.execute(select(User).where(User.id == str(user_id)))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    old_nickname = user.nickname
    await log_action(
        db, actor_id=str(admin.id), action="reset_nickname",
        target_type="user", target_id=str(user_id),
        detail=f"username={user.username} old_nickname={old_nickname}",
        ip_address=request.client.host if request and request.client else None,
    )
    user.nickname = user.username
    await db.commit()
    await db.refresh(user)
    return user
