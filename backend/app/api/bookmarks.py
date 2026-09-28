from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.api.shared import get_skill_by_slug
from app.models import Bookmark, DownloadLog, Skill, User
from app.models.skill import Visibility

router = APIRouter(prefix="/api/bookmarks", tags=["bookmarks"])


@router.post("/{slug}")
async def add_bookmark(
    slug: str,
    user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
    owner: str | None = Query(None),
):
    skill = await get_skill_by_slug(db, slug, owner)
    if skill.visibility == Visibility.private and str(skill.owner_id) != str(user.id) and user.role != "admin":
        raise HTTPException(status_code=404, detail="Skill not found")

    existing = await db.execute(
        select(Bookmark).where(Bookmark.user_id == user.id, Bookmark.skill_id == skill.id)
    )
    if existing.scalar_one_or_none() is not None:
        return {"status": "already_bookmarked"}

    db.add(Bookmark(user_id=user.id, skill_id=skill.id))
    await db.commit()
    return {"status": "bookmarked"}


@router.delete("/{slug}")
async def remove_bookmark(
    slug: str,
    user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
    owner: str | None = Query(None),
):
    skill = await get_skill_by_slug(db, slug, owner)
    await db.execute(
        delete(Bookmark).where(Bookmark.user_id == user.id, Bookmark.skill_id == skill.id)
    )
    await db.commit()
    return {"status": "removed"}


@router.get("")
async def list_bookmarks(
    user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
    page: int = 1,
    page_size: int = 20,
):
    base = (
        select(Skill)
        .join(Bookmark, Bookmark.skill_id == Skill.id)
        .where(Bookmark.user_id == user.id)
        .where(Skill.visibility == Visibility.public)
        .order_by(Bookmark.created_at.desc())
    )

    count_q = select(func.count()).select_from(base.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    rows_q = base.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(rows_q)
    skills = result.scalars().all()

    from app.api.skills import _load_owner_names, _skill_to_response

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
    return {"items": items, "page": page, "page_size": page_size, "total": total}


@router.get("/check/{slug}")
async def check_bookmark(
    slug: str,
    user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
    owner: str | None = Query(None),
):
    skill = await get_skill_by_slug(db, slug, owner)
    result = await db.execute(
        select(Bookmark).where(Bookmark.user_id == user.id, Bookmark.skill_id == skill.id)
    )
    return {"bookmarked": result.scalar_one_or_none() is not None}
