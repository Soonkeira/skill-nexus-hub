from typing import Annotated

from fastapi import APIRouter, Body, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.api.shared import get_skill_by_slug
from app.models import Collaborator, Skill, User

router = APIRouter(prefix="/api/skills", tags=["collaborators"])


class CollaboratorAdd(BaseModel):
    user_id: str
    role: str  # "editor" | "viewer"


class CollaboratorInfo(BaseModel):
    user_id: str
    username: str
    role: str


async def _require_owner_or_admin(
    db: AsyncSession, skill: Skill, user: User
) -> None:
    if user.role == "admin":
        return
    if str(skill.owner_id) == str(user.id):
        return
    raise HTTPException(status_code=403, detail="Insufficient permissions")


@router.get("/by-slug/{slug}/collaborators", response_model=list[CollaboratorInfo])
async def list_collaborators(
    slug: str,
    user: Annotated[User, Depends(get_current_user)],
    owner: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    skill = await get_skill_by_slug(db, slug, owner)
    await _require_owner_or_admin(db, skill, user)

    result = await db.execute(
        select(Collaborator, User.username)
        .join(User, Collaborator.user_id == User.id)
        .where(Collaborator.skill_id == skill.id)
    )
    rows = result.all()
    return [
        CollaboratorInfo(
            user_id=str(collab.user_id),
            username=username,
            role=(
                collab.role.value
                if hasattr(collab.role, "value")
                else collab.role
            ),
        )
        for collab, username in rows
    ]


@router.post(
    "/by-slug/{slug}/collaborators",
    response_model=CollaboratorInfo,
    status_code=status.HTTP_201_CREATED,
)
async def add_collaborator(
    slug: str,
    body: Annotated[CollaboratorAdd, Body()],
    user: Annotated[User, Depends(get_current_user)],
    owner: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    skill = await get_skill_by_slug(db, slug, owner)
    await _require_owner_or_admin(db, skill, user)

    # Validate target user exists
    target_result = await db.execute(
        select(User).where(User.id == body.user_id)
    )
    target_user = target_result.scalar_one_or_none()
    if target_user is None:
        raise HTTPException(status_code=404, detail="User not found")

    if body.role not in ("editor", "viewer"):
        raise HTTPException(status_code=400, detail="Role must be editor or viewer")

    # Check for existing
    existing = await db.execute(
        select(Collaborator).where(
            Collaborator.skill_id == skill.id,
            Collaborator.user_id == body.user_id,
        )
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=400, detail="User is already a collaborator")

    collab = Collaborator(
        skill_id=skill.id,
        user_id=body.user_id,
        role=body.role,
    )
    db.add(collab)
    await db.commit()
    await db.refresh(collab)

    return CollaboratorInfo(
        user_id=str(collab.user_id),
        username=target_user.username,
        role=body.role,
    )


@router.delete(
    "/by-slug/{slug}/collaborators/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def remove_collaborator(
    slug: str,
    owner: str | None = Query(None),
    user_id: str = "",
    user: Annotated[User, Depends(get_current_user)] = None,
    db: AsyncSession = Depends(get_db),
):
    skill = await get_skill_by_slug(db, slug, owner)
    await _require_owner_or_admin(db, skill, user)

    result = await db.execute(
        select(Collaborator).where(
            Collaborator.skill_id == skill.id,
            Collaborator.user_id == user_id,
        )
    )
    collab = result.scalar_one_or_none()
    if collab is None:
        raise HTTPException(status_code=404, detail="Collaborator not found")

    await db.delete(collab)
    await db.commit()
