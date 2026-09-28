from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.skill import Skill, Visibility
from app.models.user import User


async def get_skill_by_slug(db: AsyncSession, slug: str, owner: str | None = None) -> Skill:
    if owner:
        result = await db.execute(
            select(Skill).join(User, Skill.owner_id == User.id)
            .where(Skill.slug == slug, User.username == owner)
        )
        skill = result.scalar_one_or_none()
        if skill is None:
            raise HTTPException(status_code=404, detail="Skill not found")
        return skill

    # A bare slug remains convenient while it is globally unambiguous. Once two
    # owners use the same slug, selecting one implicitly could target the wrong
    # Skill, so require the caller to identify the owner explicitly.
    result = await db.execute(
        select(Skill).where(Skill.slug == slug).order_by(Skill.created_at.desc()).limit(2)
    )
    skills = result.scalars().all()
    if not skills:
        raise HTTPException(status_code=404, detail="Skill not found")
    if len(skills) > 1:
        raise HTTPException(
            status_code=409,
            detail="Multiple Skills use this slug; specify the owner parameter",
        )
    return skills[0]


def check_skill_access(skill: Skill, user: User | None = None):
    if skill.visibility == Visibility.private:
        if user is None:
            raise HTTPException(status_code=404, detail="Skill not found")
        if str(skill.owner_id) != str(user.id) and user.role != "admin":
            raise HTTPException(status_code=404, detail="Skill not found")
