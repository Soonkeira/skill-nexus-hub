import hashlib
from datetime import datetime, timezone
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import async_session
from app.models import ApiToken, User
from app.utils.time import ensure_aware_utc, utc_now

security = HTTPBearer()
optional_security = HTTPBearer(auto_error=False)


async def get_db():
    async with async_session() as session:
        yield session


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(security)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
    )
    token_value = credentials.credentials

    # Try API token (snh_* format)
    if token_value.startswith("snh_"):
        token_hash = hashlib.sha256(token_value.encode()).hexdigest()
        token_prefix = token_value[:8]

        result = await db.execute(
            select(ApiToken).where(
                ApiToken.token_prefix == token_prefix,
                ApiToken.token_hash == token_hash,
            )
        )
        api_token = result.scalar_one_or_none()

        if api_token is None:
            raise credentials_exception

        if api_token.expires_at and ensure_aware_utc(api_token.expires_at) < utc_now():
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="API token expired",
            )

        # Update last_used_at
        api_token.last_used_at = utc_now()
        await db.commit()

        # Get user
        result = await db.execute(select(User).where(User.id == api_token.user_id))
        user = result.scalar_one_or_none()
        if user is None:
            raise credentials_exception
        return user

    # Try JWT token
    try:
        payload = jwt.decode(
            token_value, settings.secret_key, algorithms=["HS256"]
        )
        user_id: str | None = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise credentials_exception
    # Invalidate tokens issued before password change
    if user.password_changed_at:
        iat = payload.get("iat")
        password_changed_at = ensure_aware_utc(user.password_changed_at)
        if iat is None or datetime.fromtimestamp(iat, tz=timezone.utc) < password_changed_at:
            raise credentials_exception
    return user


async def get_optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(optional_security),
    db: AsyncSession = Depends(get_db),
) -> User | None:
    if credentials is None:
        return None
    token_value = credentials.credentials

    # Try API token (snh_* format)
    if token_value.startswith("snh_"):
        token_hash = hashlib.sha256(token_value.encode()).hexdigest()
        token_prefix = token_value[:8]

        result = await db.execute(
            select(ApiToken).where(
                ApiToken.token_prefix == token_prefix,
                ApiToken.token_hash == token_hash,
            )
        )
        api_token = result.scalar_one_or_none()

        if api_token is None:
            return None

        if api_token.expires_at and ensure_aware_utc(api_token.expires_at) < utc_now():
            return None

        # Update last_used_at
        api_token.last_used_at = utc_now()
        await db.commit()

        # Get user
        result = await db.execute(select(User).where(User.id == api_token.user_id))
        user = result.scalar_one_or_none()
        return user

    # Try JWT token
    try:
        payload = jwt.decode(
            token_value, settings.secret_key, algorithms=["HS256"]
        )
        user_id: str | None = payload.get("sub")
        if user_id is None:
            return None
    except JWTError:
        return None
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    return user


def require_role(*roles: str):
    async def checker(user: Annotated[User, Depends(get_current_user)]) -> User:
        if user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        return user

    return checker
