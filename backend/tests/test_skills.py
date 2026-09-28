import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.models import DownloadLog, Skill, SkillVersion, User

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
    from app.api.deps import get_db
    from app.main import app as fastapi_app
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


async def _create_version_direct(slug: str, username: str, status: str = "approved"):
    """Insert a version directly and mark approved versions as latest."""
    from app.api.deps import get_db
    from app.main import app as fastapi_app

    async for session in fastapi_app.dependency_overrides[get_db]():
        skill_result = await session.execute(select(Skill).where(Skill.slug == slug))
        skill = skill_result.scalar_one()
        user_result = await session.execute(select(User).where(User.username == username))
        user = user_result.scalar_one()

        version = SkillVersion(
            skill_id=skill.id,
            version="1.0.0",
            file_path=f"/tmp/{slug}.zip",
            original_filename=f"{slug}.zip",
            file_size=10,
            checksum="a" * 64,
            publisher_id=user.id,
            status=status,
        )
        session.add(version)
        await session.flush()
        if status == "approved":
            skill.latest_version_id = version.id
        await session.commit()
        break


async def test_create_skill(client: AsyncClient):
    await _register(client, "normal_create")
    token = await _login(client, "normal_create")

    resp = await client.post(
        "/api/skills",
        json={
            "name": "My Skill",
            "slug": "my-skill",
            "description": "A test skill",
            "tags": ["test"],
            "visibility": "public",
        },
        headers=_auth(token),
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["slug"] == "my-skill"
    assert data["owner_name"] == "normal_create"


async def test_admin_create_skill(client: AsyncClient):
    from app.api.deps import get_db
    from app.main import app as fastapi_app

    await _register(client, "admin_create")
    async for session in fastapi_app.dependency_overrides[get_db]():
        result = await session.execute(
            select(User).where(User.username == "admin_create")
        )
        user = result.scalar_one()
        user.role = "admin"
        await session.commit()
        break

    token = await _login(client, "admin_create")
    resp = await client.post(
        "/api/skills",
        json={
            "name": "Admin Skill",
            "slug": "admin-skill",
            "description": "A test skill",
            "tags": ["test"],
            "visibility": "public",
        },
        headers=_auth(token),
    )

    assert resp.status_code == 201
    data = resp.json()
    assert data["slug"] == "admin-skill"
    assert data["tags"] == ["test"]


async def test_unauthorized_create(client: AsyncClient):
    resp = await client.post(
        "/api/skills",
        json={
            "name": "No Auth Skill",
            "slug": "no-auth",
            "description": "Should fail",
        },
    )
    assert resp.status_code == 403


async def test_list_skills_empty(client: AsyncClient):
    resp = await client.get("/api/skills")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 0
    assert data["items"] == []


async def test_list_skills_with_data(client: AsyncClient):
    await _register(client, "pubuser")
    await _create_skill_direct(
        "test-skill",
        "pubuser",
        name="Test Skill",
        description="A skill for listing",
        tags=["test"],
    )
    await _create_version_direct("test-skill", "pubuser", "approved")

    resp = await client.get("/api/skills")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert data["items"][0]["slug"] == "test-skill"


async def test_list_skills_filters_by_latest_version_target(client: AsyncClient):
    await _register(client, "target_owner")
    await _create_skill_direct("cursor-skill", "target_owner")
    await _create_skill_direct("codex-skill", "target_owner")
    await _create_skill_direct("tagged-skill", "target_owner", tags=["windsurf"])
    await _create_version_direct("cursor-skill", "target_owner", "approved")
    await _create_version_direct("codex-skill", "target_owner", "approved")
    await _create_version_direct("tagged-skill", "target_owner", "approved")

    from app.api.deps import get_db
    from app.main import app as fastapi_app

    async for session in fastapi_app.dependency_overrides[get_db]():
        versions = (
            await session.execute(select(SkillVersion).order_by(SkillVersion.created_at))
        ).scalars().all()
        for version in versions:
            skill = await session.get(Skill, version.skill_id)
            version.targets = ["cursor"] if skill.slug == "cursor-skill" else ["codex"]
        await session.commit()
        break

    resp = await client.get("/api/skills?target=cursor")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert [item["slug"] for item in data["items"]] == ["cursor-skill"]

    tagged_resp = await client.get("/api/skills?target=windsurf")
    assert tagged_resp.status_code == 200
    tagged_data = tagged_resp.json()
    assert tagged_data["total"] == 1
    assert [item["slug"] for item in tagged_data["items"]] == ["tagged-skill"]


async def test_list_skills_hides_empty_and_unapproved_skills(client: AsyncClient):
    await _register(client, "draftuser")
    await _create_skill_direct("empty-skill", "draftuser", name="Empty Skill")
    await _create_skill_direct("pending-skill", "draftuser", name="Pending Skill")
    await _create_version_direct("pending-skill", "draftuser", "pending")

    resp = await client.get("/api/skills")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 0
    assert data["items"] == []


async def test_list_skills_can_sort_by_downloads_and_returns_owner_department(client: AsyncClient):
    from app.api.deps import get_db
    from app.main import app as fastapi_app

    await _register(client, "ops_owner")
    await _create_skill_direct("low-skill", "ops_owner", name="Low Skill")
    await _create_skill_direct("high-skill", "ops_owner", name="High Skill")

    async for session in fastapi_app.dependency_overrides[get_db]():
        user_result = await session.execute(select(User).where(User.username == "ops_owner"))
        user = user_result.scalar_one()
        user.department = "Platform"

        skills_result = await session.execute(select(Skill).where(Skill.owner_id == user.id))
        skills = {skill.slug: skill for skill in skills_result.scalars().all()}
        low_version = SkillVersion(
            skill_id=skills["low-skill"].id,
            version="1.0.0",
            file_path="/tmp/low.zip",
            original_filename="low.zip",
            file_size=10,
            checksum="2" * 64,
            publisher_id=user.id,
            status="approved",
        )
        high_version = SkillVersion(
            skill_id=skills["high-skill"].id,
            version="1.0.0",
            file_path="/tmp/high.zip",
            original_filename="high.zip",
            file_size=10,
            checksum="3" * 64,
            publisher_id=user.id,
            status="approved",
        )
        session.add_all([low_version, high_version])
        await session.flush()
        skills["low-skill"].latest_version_id = low_version.id
        skills["high-skill"].latest_version_id = high_version.id
        session.add_all([
            DownloadLog(skill_id=skills["high-skill"].id, version_id=high_version.id, source="web"),
            DownloadLog(skill_id=skills["high-skill"].id, version_id=high_version.id, source="web"),
            DownloadLog(skill_id=skills["low-skill"].id, version_id=low_version.id, source="web"),
        ])
        await session.commit()
        break

    resp = await client.get("/api/skills?sort=downloads")
    assert resp.status_code == 200
    data = resp.json()
    assert [item["slug"] for item in data["items"][:2]] == ["high-skill", "low-skill"]
    assert data["items"][0]["owner_department"] == "Platform"

    weekly_resp = await client.get("/api/skills?sort=weekly_downloads")
    assert weekly_resp.status_code == 200


async def test_get_skill_detail(client: AsyncClient):
    await _register(client, "detailuser")
    await _create_skill_direct(
        "detail-skill",
        "detailuser",
        name="Detail Skill",
        description="A skill for detail view",
        tags=["detail"],
    )

    resp = await client.get("/api/skills/by-slug/detail-skill")
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Detail Skill"
    assert data["slug"] == "detail-skill"
    assert data["download_count"] == 0


async def test_skill_detail_includes_internal_trust_status(client: AsyncClient):
    from app.api.deps import get_db
    from app.main import app as fastapi_app
    from app.models.skill import VersionStatus

    await _register(client, "trustuser")
    await _create_skill_direct(
        "trust-skill",
        "trustuser",
        name="Trust Skill",
        description="A reviewed internal skill for trusted installation",
        tags=["trust"],
    )

    async for session in fastapi_app.dependency_overrides[get_db]():
        skill_result = await session.execute(
            select(Skill).where(Skill.slug == "trust-skill")
        )
        skill = skill_result.scalar_one()
        user_result = await session.execute(
            select(User).where(User.username == "trustuser")
        )
        user = user_result.scalar_one()
        version = SkillVersion(
            skill_id=skill.id,
            version="1.0.0",
            readme=(
                "## 适用场景\n"
                "用于内部团队复用稳定的工作流。\n\n"
                "## 使用方式\n"
                "安装后在支持的 Agent 中按需调用。\n\n"
                "## 限制说明\n"
                "仅处理团队授权的数据，不适合外部公开数据。"
            ),
            file_path="/tmp/trust-skill.zip",
            original_filename="trust-skill.zip",
            file_size=128,
            checksum="1" * 64,
            publisher_id=user.id,
            reviewer_id=user.id,
            status=VersionStatus.approved,
        )
        session.add(version)
        await session.flush()
        skill.latest_version_id = version.id
        await session.commit()
        break

    resp = await client.get("/api/skills/by-slug/trust-skill")
    assert resp.status_code == 200
    data = resp.json()
    assert data["trust"]["review_status"] == "approved"
    assert data["trust"]["security_status"] == "passed"
    assert data["trust"]["documentation_status"] == "complete"
    assert "已审核" in data["trust"]["labels"]
    assert "基础安全检查通过" in data["trust"]["labels"]


async def test_update_skill(client: AsyncClient):
    await _register(client, "updateuser")
    await _create_skill_direct("update-skill", "updateuser", name="Original")

    token = await _login(client, "updateuser")
    resp = await client.put(
        "/api/skills/by-slug/update-skill",
        json={"name": "Updated Name"},
        headers=_auth(token),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Updated Name"


async def test_delete_skill(client: AsyncClient):
    await _register(client, "deleteuser")
    await _create_skill_direct("delete-skill", "deleteuser", name="Delete Me")

    token = await _login(client, "deleteuser")
    resp = await client.delete(
        "/api/skills/by-slug/delete-skill",
        headers=_auth(token),
    )
    assert resp.status_code == 204

    resp2 = await client.get("/api/skills")
    data = resp2.json()
    assert data["total"] == 0


async def test_delete_skill_with_versions(client: AsyncClient):
    from app.api.deps import get_db
    from app.main import app as fastapi_app

    await _register(client, "delete_version_user")
    await _create_skill_direct("delete-version-skill", "delete_version_user", name="Delete Version")

    async for session in fastapi_app.dependency_overrides[get_db]():
        skill_result = await session.execute(
            select(Skill).where(Skill.slug == "delete-version-skill")
        )
        skill = skill_result.scalar_one()
        user_result = await session.execute(
            select(User).where(User.username == "delete_version_user")
        )
        user = user_result.scalar_one()
        version = SkillVersion(
            skill_id=skill.id,
            version="1.0.0",
            file_path="/tmp/delete-version-skill.zip",
            original_filename="delete-version-skill.zip",
            file_size=128,
            checksum="0" * 64,
            publisher_id=user.id,
            status="pending",
        )
        session.add(version)
        await session.commit()
        break

    token = await _login(client, "delete_version_user")
    resp = await client.delete(
        "/api/skills/by-slug/delete-version-skill",
        headers=_auth(token),
    )
    assert resp.status_code == 204

    resp2 = await client.get("/api/skills")
    assert resp2.json()["total"] == 0


async def test_get_skill_not_found(client: AsyncClient):
    resp = await client.get("/api/skills/by-slug/nonexistent")
    assert resp.status_code == 404


async def test_update_skill_forbidden(client: AsyncClient):
    """Test that a non-owner cannot update a skill."""
    await _register(client, "owner_user")
    await _register(client, "other_user")
    await _create_skill_direct(
        "owned-skill", "owner_user", name="Owned Skill"
    )

    other_token = await _login(client, "other_user")
    resp = await client.put(
        "/api/skills/by-slug/owned-skill",
        json={"name": "Hacked!"},
        headers=_auth(other_token),
    )
    assert resp.status_code == 403


async def test_install_targets_empty(client: AsyncClient):
    resp = await client.get("/api/skills/install-targets")
    assert resp.status_code == 200
    assert resp.json() == []
