import hashlib
import re
import secrets
from datetime import timedelta

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from jose import jwt
import bcrypt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.api.deps import get_db, get_current_user
from app.models import ApiToken, User
from app.schemas.auth import (
    ChangePasswordRequest,
    CliTokenResponse,
    LoginRequest,
    ProfileUpdateRequest,
    RegisterRequest,
    TokenResponse,
    UserResponse,
)
from app.services.captcha import captcha_service
from app.utils.time import utc_now

router = APIRouter(prefix="/api/auth", tags=["auth"])


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except ValueError:
        return False


DUMMY_PASSWORD_HASH = hash_password("invalid-password")


def create_access_token(user_id: str) -> str:
    issued_at = utc_now()
    expire = issued_at + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {"sub": user_id, "iat": issued_at.timestamp(), "exp": expire}
    return jwt.encode(payload, settings.secret_key, algorithm="HS256")


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    username = body.username
    password = body.password

    if not re.match(r'^[a-zA-Z0-9_]{3,32}$', username):
        raise HTTPException(status_code=400, detail="用户名需为3-32位字母、数字或下划线")
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="密码至少8位")
    if not re.search(r'[a-zA-Z]', password) or not re.search(r'\d', password):
        raise HTTPException(status_code=400, detail="密码需包含字母和数字")

    result = await db.execute(select(User).where(User.username == username))
    if result.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="用户名已存在",
        )
    user = User(
        username=username,
        nickname=body.nickname or username,
        employee_id=body.employee_id,
        department=body.department,
        password_hash=hash_password(password),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)):
    client_ip = request.client.host if request.client else "unknown"

    if captcha_service.is_captcha_required(client_ip):
        if not body.captcha_id or not captcha_service.consume(body.captcha_id):
            raise HTTPException(status_code=400, detail="请完成人机验证")

    result = await db.execute(select(User).where(User.username == body.username))
    user = result.scalar_one_or_none()
    if user is None:
        verify_password(body.password, DUMMY_PASSWORD_HASH)
        captcha_service.record_failure(client_ip)
        raise HTTPException(status_code=401, detail="用户名或密码错误")
    if not verify_password(body.password, user.password_hash):
        captcha_service.record_failure(client_ip)
        raise HTTPException(status_code=401, detail="用户名或密码错误")
    token = create_access_token(str(user.id))
    return TokenResponse(access_token=token)


@router.get("/me", response_model=UserResponse)
async def me(user: User = Depends(get_current_user)):
    return user


@router.put("/profile", response_model=UserResponse)
async def update_profile(
    body: ProfileUpdateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body.nickname is not None:
        user.nickname = body.nickname
    if "avatar_url" in body.model_dump(exclude_unset=True):
        user.avatar_url = body.avatar_url
    if "department" in body.model_dump(exclude_unset=True):
        user.department = body.department
    user.updated_at = utc_now()
    await db.commit()
    await db.refresh(user)
    return user


@router.put("/password")
async def change_password(
    body: ChangePasswordRequest,
    user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    if len(body.new_password) < 8:
        raise HTTPException(status_code=400, detail="新密码至少8位")
    if not re.search(r'[a-zA-Z]', body.new_password) or not re.search(r'\d', body.new_password):
        raise HTTPException(status_code=400, detail="密码需包含字母和数字")
    if not verify_password(body.old_password, user.password_hash):
        raise HTTPException(status_code=400, detail="旧密码错误")

    user.password_hash = hash_password(body.new_password)
    user.password_changed_at = utc_now()
    await db.commit()
    return {"message": "密码已修改"}


@router.post("/cli-token", response_model=CliTokenResponse)
async def create_cli_token(
    user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    token = "snh_" + secrets.token_hex(24)
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    token_prefix = token[:8]

    api_token = ApiToken(
        user_id=user.id,
        name="CLI Token",
        token_hash=token_hash,
        token_prefix=token_prefix,
    )
    db.add(api_token)
    await db.commit()

    return CliTokenResponse(token=token)


@router.get("/captcha")
async def get_captcha(request: Request):
    client_ip = request.client.host if request.client else "unknown"
    captcha_id = captcha_service.generate_id()
    required = captcha_service.is_captcha_required(client_ip)
    return {"captcha_id": captcha_id, "captcha_required": required}


@router.post("/captcha/verify")
async def verify_captcha(request: Request):
    body = await request.json()
    captcha_id = body.get("captcha_id")
    if not captcha_id:
        raise HTTPException(status_code=400, detail="Missing captcha_id")
    captcha_service.mark_verified(captcha_id)
    return {"captcha_id": captcha_id, "verified": True}
