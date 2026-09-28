from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.api.shared import get_skill_by_slug
from app.models import Comment, Skill, SkillVersion, User
from app.schemas.comment import CommentCreate, CommentResponse

router = APIRouter(prefix="/api/skills", tags=["comments"])


@router.get("/by-slug/{slug}/comments")
async def list_comments(
    slug: str,
    owner: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    skill = await get_skill_by_slug(db, slug, owner)

    # Count top-level comments for pagination
    top_count = (
        await db.execute(
            select(func.count()).where(
                Comment.skill_id == skill.id,
                Comment.parent_id.is_(None),
            )
        )
    ).scalar() or 0

    # Fetch top-level comment IDs with pagination
    top_ids_q = (
        select(Comment.id)
        .where(Comment.skill_id == skill.id, Comment.parent_id.is_(None))
        .order_by(Comment.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    top_ids_result = await db.execute(top_ids_q)
    top_ids = [row[0] for row in top_ids_result.all()]

    if not top_ids:
        return {"items": [], "page": page, "page_size": page_size, "total": top_count}

    # Fetch ALL comments belonging to these threads (recursive via CTE)
    # PostgreSQL recursive CTE to find all descendants of the top-level comments
    cte = (
        select(Comment)
        .where(Comment.id.in_(top_ids))
        .cte(name="comment_tree", recursive=True)
    )
    descendants = (
        select(Comment)
        .join(cte, Comment.parent_id == cte.c.id)
    )
    full_tree = select(Comment).select_from(
        cte.union_all(descendants)
    )

    # Actually, simpler approach: just fetch all comments and build tree in code
    all_q = (
        select(Comment, User.username)
        .join(User, Comment.user_id == User.id)
        .where(Comment.skill_id == skill.id)
        .order_by(Comment.created_at.asc())
    )
    result = await db.execute(all_q)
    all_rows = result.all()

    # Build flat list
    all_comments_map: dict[str, dict] = {}
    for comment, username in all_rows:
        all_comments_map[str(comment.id)] = {
            "id": str(comment.id),
            "skill_id": str(comment.skill_id),
            "version_id": str(comment.version_id) if comment.version_id else None,
            "user_id": str(comment.user_id),
            "username": username,
            "content": comment.content,
            "parent_id": str(comment.parent_id) if comment.parent_id else None,
            "created_at": comment.created_at.isoformat() if comment.created_at else None,
            "replies": [],
        }

    # Build tree from flat list, but only include items in the current page's threads
    top_id_strs = {str(tid) for tid in top_ids}

    # Find all descendants of the top-level comments on this page
    def collect_descendants(cid: str) -> list[str]:
        ids = [cid]
        for item in all_comments_map.values():
            if item["parent_id"] == cid:
                ids.extend(collect_descendants(item["id"]))
        return ids

    visible_ids: set[str] = set()
    for tid in top_id_strs:
        visible_ids.update(collect_descendants(tid))

    # Build nested tree from visible items
    roots: list[dict] = []
    for item in all_comments_map.values():
        if item["id"] not in visible_ids:
            continue
        if item["parent_id"] is None or item["parent_id"] not in visible_ids:
            if item["id"] in top_id_strs:
                roots.append(item)
        else:
            parent = all_comments_map.get(item["parent_id"])
            if parent:
                parent["replies"].append(item)

    return {"items": roots, "page": page, "page_size": page_size, "total": top_count}


@router.post("/by-slug/{slug}/comments", response_model=CommentResponse, status_code=status.HTTP_201_CREATED)
async def create_comment(
    slug: str,
    body: CommentCreate,
    user: Annotated[User, Depends(get_current_user)],
    owner: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    skill = await get_skill_by_slug(db, slug, owner)

    if body.version_id is not None:
        ver_result = await db.execute(
            select(SkillVersion).where(
                SkillVersion.id == str(body.version_id),
                SkillVersion.skill_id == skill.id,
            )
        )
        if ver_result.scalar_one_or_none() is None:
            raise HTTPException(status_code=404, detail="Version not found")

    if body.parent_id is not None:
        parent_result = await db.execute(
            select(Comment).where(
                Comment.id == str(body.parent_id),
                Comment.skill_id == skill.id,
            )
        )
        if parent_result.scalar_one_or_none() is None:
            raise HTTPException(status_code=404, detail="Parent comment not found")

    comment = Comment(
        skill_id=skill.id,
        version_id=str(body.version_id) if body.version_id else None,
        user_id=user.id,
        content=body.content,
        parent_id=str(body.parent_id) if body.parent_id else None,
    )
    db.add(comment)
    await db.commit()
    await db.refresh(comment)

    return CommentResponse(
        id=comment.id,
        skill_id=comment.skill_id,
        version_id=comment.version_id,
        user_id=comment.user_id,
        username=user.username,
        content=comment.content,
        parent_id=comment.parent_id,
        created_at=comment.created_at,
        replies=[],
    )


@router.delete("/by-slug/{slug}/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_comment(
    slug: str,
    comment_id: str,
    user: Annotated[User, Depends(get_current_user)],
    owner: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    skill = await get_skill_by_slug(db, slug, owner)

    result = await db.execute(
        select(Comment).where(
            Comment.id == comment_id,
            Comment.skill_id == skill.id,
        )
    )
    comment = result.scalar_one_or_none()
    if comment is None:
        raise HTTPException(status_code=404, detail="Comment not found")

    if str(comment.user_id) != str(user.id) and user.role != "admin":
        raise HTTPException(status_code=403, detail="Cannot delete others' comments")

    await db.delete(comment)
    await db.commit()
