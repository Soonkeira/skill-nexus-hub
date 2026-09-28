import pytest
from httpx import AsyncClient
from jose import jwt

from app.config import settings
from app.models import ApiToken, Skill, SkillVersion, User

pytestmark = pytest.mark.asyncio


async def test_manual_timestamp_columns_are_timezone_aware():
    columns = [
        User.__table__.c.updated_at,
        User.__table__.c.password_changed_at,
        Skill.__table__.c.updated_at,
        SkillVersion.__table__.c.reviewed_at,
        ApiToken.__table__.c.last_used_at,
        ApiToken.__table__.c.expires_at,
    ]

    assert all(column.type.timezone for column in columns)


async def test_register(client: AsyncClient):
    resp = await client.post(
        "/api/auth/register",
        json={
            "username": "alice",
            "email": "alice@example.com",
            "password": "secret123",
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["username"] == "alice"
    assert data["role"] == "user"


async def test_register_duplicate(client: AsyncClient):
    payload = {
        "username": "bob",
        "email": "bob@example.com",
        "password": "secret123",
    }
    resp1 = await client.post("/api/auth/register", json=payload)
    assert resp1.status_code == 201

    resp2 = await client.post("/api/auth/register", json=payload)
    assert resp2.status_code == 400
    assert resp2.json()["detail"] == "用户名已存在"


async def test_login(client: AsyncClient):
    await client.post(
        "/api/auth/register",
        json={
            "username": "carol",
            "email": "carol@example.com",
            "password": "secret123",
        },
    )
    resp = await client.post(
        "/api/auth/login",
        json={"username": "carol", "password": "secret123"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


async def test_login_wrong_password(client: AsyncClient):
    await client.post(
        "/api/auth/register",
        json={
            "username": "dave",
            "email": "dave@example.com",
            "password": "secret123",
        },
    )
    resp = await client.post(
        "/api/auth/login",
        json={"username": "dave", "password": "wrongpassword"},
    )
    assert resp.status_code == 401


async def test_update_profile_department(client: AsyncClient):
    await client.post(
        "/api/auth/register",
        json={
            "username": "profile_user",
            "password": "secret123",
        },
    )
    login = await client.post(
        "/api/auth/login",
        json={"username": "profile_user", "password": "secret123"},
    )
    token = login.json()["access_token"]

    resp = await client.put(
        "/api/auth/profile",
        json={"nickname": "Profile User", "department": "研发部"},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["nickname"] == "Profile User"
    assert data["department"] == "研发部"


async def test_update_profile_accepts_data_url_avatar(client: AsyncClient):
    await client.post(
        "/api/auth/register",
        json={
            "username": "avatar_user",
            "password": "secret123",
        },
    )
    login = await client.post(
        "/api/auth/login",
        json={"username": "avatar_user", "password": "secret123"},
    )
    token = login.json()["access_token"]
    avatar_url = "data:image/png;base64," + ("A" * 1200)

    resp = await client.put(
        "/api/auth/profile",
        json={"nickname": "Avatar User", "avatar_url": avatar_url},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert resp.status_code == 200
    assert resp.json()["avatar_url"] == avatar_url


async def test_password_change_keeps_new_login_token_valid(client: AsyncClient):
    await client.post(
        "/api/auth/register",
        json={
            "username": "password_user",
            "password": "secret123",
        },
    )
    login = await client.post(
        "/api/auth/login",
        json={"username": "password_user", "password": "secret123"},
    )
    old_token = login.json()["access_token"]

    change_resp = await client.put(
        "/api/auth/password",
        json={"old_password": "secret123", "new_password": "secret456"},
        headers={"Authorization": f"Bearer {old_token}"},
    )
    assert change_resp.status_code == 200
    old_me_resp = await client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {old_token}"},
    )
    assert old_me_resp.status_code == 401

    new_login = await client.post(
        "/api/auth/login",
        json={"username": "password_user", "password": "secret456"},
    )
    assert new_login.status_code == 200
    new_token = new_login.json()["access_token"]
    payload = jwt.decode(new_token, settings.secret_key, algorithms=["HS256"])
    assert "iat" in payload

    me_resp = await client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {new_token}"},
    )
    assert me_resp.status_code == 200
