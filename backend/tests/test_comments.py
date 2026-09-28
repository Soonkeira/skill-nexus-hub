import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.api.deps import get_db
from app.main import app as fastapi_app
from app.models import Comment, Skill, SkillVersion, User

pytestmark = pytest.mark.asyncio


async def _register(client: AsyncClient, username: str = "pub"):
    resp = await client.post(
        "/api/auth/register",
        json={
            "username": username,
            "email": f"{username}@test.com",
            "password": "Test1234",
        },
    )
    return resp.json()


async def _login(client: AsyncClient, username: str = "pub"):
    resp = await client.post(
        "/api/auth/login",
        json={"username": username, "password": "Test1234"},
    )
    return resp.json()["access_token"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _create_skill_direct(slug: str, username: str, **kwargs):
    """Insert a skill directly into the DB, handling SQLite type quirks."""
    from app.models import Skill

    async for session in fastapi_app.dependency_overrides[get_db]():
        user_result = await session.execute(
            select(User).where(User.username == username)
        )
        user = user_result.scalar_one()

        skill = Skill(
            name=kwargs.get("name", slug.replace("-", " ").title()),
            slug=slug,
            description=kwargs.get("description", f"Skill {slug}"),
            tags=kwargs.pop("tags", None),
            visibility=kwargs.get("visibility", "public"),
            owner_id=user.id,
        )
        session.add(skill)
        await session.commit()
        break


async def _create_version_direct(skill_slug: str, version: str, username: str):
    """Insert a version directly into the DB."""
    async for session in fastapi_app.dependency_overrides[get_db]():
        skill_result = await session.execute(
            select(Skill).where(Skill.slug == skill_slug)
        )
        skill = skill_result.scalar_one()
        user_result = await session.execute(
            select(User).where(User.username == username)
        )
        user = user_result.scalar_one()

        ver = SkillVersion(
            skill_id=skill.id,
            version=version,
            file_path=f"/tmp/{skill_slug}-{version}.zip",
            original_filename=f"{skill_slug}-{version}.zip",
            file_size=1024,
            checksum="abc123",
            publisher_id=user.id,
            status="pending",
        )
        session.add(ver)
        await session.commit()
        await session.refresh(ver)
        return ver


async def test_create_comment(client: AsyncClient):
    await _register(client, "commenter1")
    token = await _login(client, "commenter1")
    await _create_skill_direct("comment-skill", "commenter1")

    resp = await client.post(
        "/api/skills/by-slug/comment-skill/comments",
        json={"content": "Great skill!"},
        headers=_auth(token),
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["content"] == "Great skill!"
    assert data["username"] == "commenter1"
    assert data["parent_id"] is None
    assert data["replies"] == []


async def test_list_comments(client: AsyncClient):
    await _register(client, "lister")
    token = await _login(client, "lister")
    await _create_skill_direct("list-skill", "lister")

    # Create a comment
    await client.post(
        "/api/skills/by-slug/list-skill/comments",
        json={"content": "First comment"},
        headers=_auth(token),
    )

    resp = await client.get("/api/skills/by-slug/list-skill/comments")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert data["items"][0]["content"] == "First comment"


async def test_version_comment(client: AsyncClient):
    await _register(client, "ver_commenter")
    token = await _login(client, "ver_commenter")
    await _create_skill_direct("ver-skill", "ver_commenter")
    ver = await _create_version_direct("ver-skill", "1.0.0", "ver_commenter")

    # Create comment with version_id
    resp = await client.post(
        "/api/skills/by-slug/ver-skill/comments",
        json={"content": "Version comment", "version_id": str(ver.id)},
        headers=_auth(token),
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["version_id"] == str(ver.id)

    # List with version filter
    resp2 = await client.get(
        "/api/skills/by-slug/ver-skill/comments",
        params={"version": "1.0.0"},
    )
    assert resp2.status_code == 200
    data2 = resp2.json()
    assert data2["total"] == 1
    assert data2["items"][0]["content"] == "Version comment"

    # List without version filter should also include it
    resp3 = await client.get("/api/skills/by-slug/ver-skill/comments")
    assert resp3.status_code == 200
    assert resp3.json()["total"] == 1


async def test_delete_own_comment(client: AsyncClient):
    await _register(client, "deleter")
    token = await _login(client, "deleter")
    await _create_skill_direct("delete-skill", "deleter")

    create_resp = await client.post(
        "/api/skills/by-slug/delete-skill/comments",
        json={"content": "Delete me"},
        headers=_auth(token),
    )
    comment_id = create_resp.json()["id"]

    resp = await client.delete(
        f"/api/skills/by-slug/delete-skill/comments/{comment_id}",
        headers=_auth(token),
    )
    assert resp.status_code == 204

    # Verify comment is gone
    list_resp = await client.get("/api/skills/by-slug/delete-skill/comments")
    assert list_resp.json()["total"] == 0


async def test_cannot_delete_others_comment(client: AsyncClient):
    await _register(client, "user_a")
    await _register(client, "user_b")
    token_a = await _login(client, "user_a")
    token_b = await _login(client, "user_b")
    await _create_skill_direct("other-skill", "user_a")

    # User A creates a comment
    create_resp = await client.post(
        "/api/skills/by-slug/other-skill/comments",
        json={"content": "A's comment"},
        headers=_auth(token_a),
    )
    comment_id = create_resp.json()["id"]

    # User B tries to delete it
    resp = await client.delete(
        f"/api/skills/by-slug/other-skill/comments/{comment_id}",
        headers=_auth(token_b),
    )
    assert resp.status_code == 403

    # Comment still exists
    list_resp = await client.get("/api/skills/by-slug/other-skill/comments")
    assert list_resp.json()["total"] == 1
