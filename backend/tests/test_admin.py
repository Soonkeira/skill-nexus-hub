import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.api.deps import get_db
from app.main import app as fastapi_app
from app.models import Skill, SkillVersion, User
from app.models.skill import VersionStatus

pytestmark = pytest.mark.asyncio


async def _register(client: AsyncClient, username: str = "testuser"):
    resp = await client.post(
        "/api/auth/register",
        json={
            "username": username,
            "email": f"{username}@test.com",
            "password": "Test1234",
        },
    )
    return resp.json()


async def _login(client: AsyncClient, username: str = "testuser"):
    resp = await client.post(
        "/api/auth/login",
        json={"username": username, "password": "Test1234"},
    )
    return resp.json()["access_token"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _make_admin(username: str = "admin"):
    """Set a user's role to admin directly in the DB."""
    async for session in fastapi_app.dependency_overrides[get_db]():
        result = await session.execute(
            select(User).where(User.username == username)
        )
        user = result.scalar_one()
        user.role = "admin"
        await session.commit()
        break


async def _make_publisher(username: str):
    """Backward-compatible helper for old pending tests; publish permission is admin-only."""
    async for session in fastapi_app.dependency_overrides[get_db]():
        result = await session.execute(
            select(User).where(User.username == username)
        )
        user = result.scalar_one()
        user.role = "admin"
        await session.commit()
        break


async def _create_skill_direct(slug: str, username: str, **kwargs):
    """Insert a skill directly into the DB."""
    async for session in fastapi_app.dependency_overrides[get_db]():
        user_result = await session.execute(
            select(User).where(User.username == username)
        )
        user = user_result.scalar_one()

        skill = Skill(
            name=kwargs.get("name", slug.replace("-", " ").title()),
            slug=slug,
            description=kwargs.get("description", f"Skill {slug}"),
            visibility=kwargs.get("visibility", "public"),
            owner_id=user.id,
        )
        session.add(skill)
        await session.commit()
        break


async def _create_version_direct(slug: str, version: str, publisher_username: str, status: str = "pending"):
    """Insert a version directly into the DB."""
    import hashlib

    async for session in fastapi_app.dependency_overrides[get_db]():
        skill_result = await session.execute(
            select(Skill).where(Skill.slug == slug)
        )
        skill = skill_result.scalar_one()

        user_result = await session.execute(
            select(User).where(User.username == publisher_username)
        )
        user = user_result.scalar_one()

        ver = SkillVersion(
            skill_id=skill.id,
            version=version,
            changelog=None,
            file_path=f"/tmp/{slug}-{version}.zip",
            original_filename=f"{slug}-{version}.zip",
            file_size=1024,
            checksum=hashlib.sha256(b"test").hexdigest(),
            publisher_id=user.id,
            status=status,
        )
        session.add(ver)
        await session.commit()
        break


# --- Admin tests ---


async def test_admin_skills_list(client: AsyncClient):
    await _register(client, "admin_skill_list")
    await _make_admin("admin_skill_list")
    admin_token = await _login(client, "admin_skill_list")

    await _register(client, "admin_skill_owner")
    await _create_skill_direct("admin-visible-skill", "admin_skill_owner")

    resp = await client.get("/api/admin/skills", headers=_auth(admin_token))

    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 1
    assert "admin-visible-skill" in {item["slug"] for item in data["items"]}


async def test_pending_list(client: AsyncClient):
    await _register(client, "admin_pending")
    await _make_admin("admin_pending")
    admin_token = await _login(client, "admin_pending")

    await _register(client, "publisher_pending")
    await _make_publisher("publisher_pending")
    await _create_skill_direct("pending-skill", "publisher_pending")
    await _create_version_direct("pending-skill", "1.0.0", "publisher_pending", "pending")

    resp = await client.get("/api/admin/pending", headers=_auth(admin_token))
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["items"]) >= 1
    item = data["items"][0]
    assert item["skill_slug"] == "pending-skill"
    assert item["version"] == "1.0.0"
    assert item["owner_username"] == "publisher_pending"
    assert item["publisher_username"] == "publisher_pending"


async def test_pending_list_non_admin_sees_only_own_uploads(client: AsyncClient):
    await _register(client, "pending_owner")
    owner_token = await _login(client, "pending_owner")
    await _create_skill_direct("own-pending-skill", "pending_owner")
    await _create_version_direct("own-pending-skill", "1.0.0", "pending_owner", "pending")

    await _register(client, "pending_other")
    await _create_skill_direct("other-pending-skill", "pending_other")
    await _create_version_direct("other-pending-skill", "1.0.0", "pending_other", "pending")

    resp = await client.get("/api/pending", headers=_auth(owner_token))
    assert resp.status_code == 200
    slugs = {item["skill_slug"] for item in resp.json()["items"]}
    assert slugs == {"own-pending-skill"}


async def test_admin_pending_requires_admin_role(client: AsyncClient):
    await _register(client, "pending_non_admin")
    token = await _login(client, "pending_non_admin")

    resp = await client.get("/api/admin/pending", headers=_auth(token))
    assert resp.status_code == 403


async def test_pending_list_admin_sees_all_uploads(client: AsyncClient):
    await _register(client, "pending_admin_all")
    await _make_admin("pending_admin_all")
    admin_token = await _login(client, "pending_admin_all")

    await _register(client, "pending_author_a")
    await _create_skill_direct("author-a-pending", "pending_author_a")
    await _create_version_direct("author-a-pending", "1.0.0", "pending_author_a", "pending")

    await _register(client, "pending_author_b")
    await _create_skill_direct("author-b-pending", "pending_author_b")
    await _create_version_direct("author-b-pending", "1.0.0", "pending_author_b", "pending")

    resp = await client.get("/api/admin/pending", headers=_auth(admin_token))
    assert resp.status_code == 200
    slugs = {item["skill_slug"] for item in resp.json()["items"]}
    assert {"author-a-pending", "author-b-pending"}.issubset(slugs)


async def test_admin_users_list(client: AsyncClient):
    await _register(client, "admin_users")
    await _make_admin("admin_users")
    admin_token = await _login(client, "admin_users")

    await _register(client, "normal_user1")
    await _register(client, "normal_user2")

    resp = await client.get("/api/admin/users", headers=_auth(admin_token))
    assert resp.status_code == 200
    data = resp.json()
    items = data["items"] if isinstance(data, dict) else data
    assert len(items) >= 3
    usernames = [u["username"] for u in items]
    assert "admin_users" in usernames
    assert "normal_user1" in usernames
    assert "normal_user2" in usernames


async def test_admin_delete_user_with_owned_skill_cleans_dependencies(client: AsyncClient):
    await _register(client, "delete_admin")
    await _make_admin("delete_admin")
    admin_token = await _login(client, "delete_admin")

    await _register(client, "delete_owned_user")
    await _create_skill_direct("delete-owned-skill", "delete_owned_user")

    async for session in fastapi_app.dependency_overrides[get_db]():
        result = await session.execute(select(User).where(User.username == "delete_owned_user"))
        target_user = result.scalar_one()
        target_id = target_user.id
        break

    resp = await client.delete(f"/api/admin/users/{target_id}", headers=_auth(admin_token))

    assert resp.status_code == 204
    async for session in fastapi_app.dependency_overrides[get_db]():
        deleted_user = (
            await session.execute(select(User).where(User.username == "delete_owned_user"))
        ).scalar_one_or_none()
        deleted_skill = (
            await session.execute(select(Skill).where(Skill.slug == "delete-owned-skill"))
        ).scalar_one_or_none()
        assert deleted_user is None
        assert deleted_skill is None
        break


# --- Stats tests ---


async def test_stats_overview(client: AsyncClient):
    await _register(client, "stats_viewer")
    token = await _login(client, "stats_viewer")

    resp = await client.get("/api/stats/overview", headers=_auth(token))
    assert resp.status_code == 200
    data = resp.json()
    assert "total_skills" in data
    assert "total_downloads" in data
    assert "total_users" in data
    assert "total_versions" in data


# --- Token tests ---


async def test_create_api_token(client: AsyncClient):
    await _register(client, "token_creator")
    token = await _login(client, "token_creator")

    resp = await client.post(
        "/api/tokens",
        json={"name": "my-token"},
        headers=_auth(token),
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "my-token"
    assert data["token"].startswith("snh_")
    assert len(data["token_prefix"]) == 8
    assert data["token_prefix"] == data["token"][:8]


async def test_list_tokens(client: AsyncClient):
    await _register(client, "token_lister")
    token = await _login(client, "token_lister")

    # Create a token first
    await client.post(
        "/api/tokens",
        json={"name": "listed-token"},
        headers=_auth(token),
    )

    resp = await client.get("/api/tokens", headers=_auth(token))
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) >= 1
    names = [t["name"] for t in data]
    assert "listed-token" in names
    # Ensure full token value is NOT returned in the list
    for t in data:
        assert "token" not in t or t.get("token") is None


async def test_revoke_token(client: AsyncClient):
    await _register(client, "token_revoker")
    token = await _login(client, "token_revoker")

    # Create a token
    create_resp = await client.post(
        "/api/tokens",
        json={"name": "revoke-me"},
        headers=_auth(token),
    )
    assert create_resp.status_code == 201
    token_id = create_resp.json()["id"]

    # Revoke it
    del_resp = await client.delete(
        f"/api/tokens/{token_id}",
        headers=_auth(token),
    )
    assert del_resp.status_code == 204

    # Verify it's gone
    list_resp = await client.get("/api/tokens", headers=_auth(token))
    data = list_resp.json()
    ids = [t["id"] for t in data]
    assert token_id not in ids
