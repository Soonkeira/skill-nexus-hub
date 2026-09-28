import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.models import ApiToken, User
from app.schemas.token import TokenCreate, TokenCreateResponse, TokenResponse

router = APIRouter(prefix="/api/tokens", tags=["tokens"])

MAX_TOKENS_PER_USER = 10


@router.get("", response_model=list[TokenResponse])
async def list_tokens(
    user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ApiToken).where(ApiToken.user_id == user.id)
    )
    return result.scalars().all()


@router.post("", response_model=TokenCreateResponse, status_code=status.HTTP_201_CREATED)
async def create_token(
    body: TokenCreate,
    user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    # Enforce token limit
    count_result = await db.execute(
        select(func.count()).where(ApiToken.user_id == user.id)
    )
    count = count_result.scalar() or 0
    if count >= MAX_TOKENS_PER_USER:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"最多创建 {MAX_TOKENS_PER_USER} 个令牌，请先撤销不需要的令牌",
        )

    token = "snh_" + secrets.token_hex(24)
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    token_prefix = token[:8]

    expires_at = None
    if body.expires_in_days:
        expires_at = datetime.now(timezone.utc) + timedelta(days=body.expires_in_days)

    api_token = ApiToken(
        user_id=user.id,
        name=body.name,
        token_hash=token_hash,
        token_prefix=token_prefix,
        expires_at=expires_at,
    )
    db.add(api_token)
    await db.commit()
    await db.refresh(api_token)

    return TokenCreateResponse(
        id=api_token.id,
        name=api_token.name,
        token_prefix=api_token.token_prefix,
        last_used_at=api_token.last_used_at,
        created_at=api_token.created_at,
        expires_at=api_token.expires_at,
        token=token,
    )


@router.delete("/{token_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_token(
    token_id: str,
    user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ApiToken).where(ApiToken.id == token_id)
    )
    api_token = result.scalar_one_or_none()
    if api_token is None:
        raise HTTPException(status_code=404, detail="Token not found")

    # Only own tokens or admin
    if str(api_token.user_id) != str(user.id) and user.role != "admin":
        raise HTTPException(status_code=403, detail="Cannot revoke others' tokens")

    await db.delete(api_token)
    await db.commit()
