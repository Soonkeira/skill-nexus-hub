import uuid
from datetime import datetime
from pydantic import BaseModel


class RegisterRequest(BaseModel):
    username: str
    password: str
    nickname: str | None = None
    employee_id: str | None = None
    department: str | None = None


class LoginRequest(BaseModel):
    username: str
    password: str
    captcha_id: str | None = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class ProfileUpdateRequest(BaseModel):
    nickname: str | None = None
    avatar_url: str | None = None
    department: str | None = None


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str


class CliTokenResponse(BaseModel):
    token: str


class PublicUserResponse(BaseModel):
    username: str
    nickname: str | None = None
    avatar_url: str | None = None
    department: str | None = None
    role: str
    created_at: datetime

    model_config = {"from_attributes": True}


class UserResponse(BaseModel):
    id: uuid.UUID
    username: str
    nickname: str | None = None
    employee_id: str | None = None
    department: str | None = None
    avatar_url: str | None = None
    email: str | None = None
    role: str
    created_at: datetime

    model_config = {"from_attributes": True}
