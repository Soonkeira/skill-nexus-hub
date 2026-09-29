import io
import zipfile
from datetime import datetime, timezone

import pytest
from fastapi import HTTPException
from httpx import AsyncClient
from sqlalchemy import select

from app.api.deps import get_db
from app.api.versions import _read_upload_with_limit
from app.main import app as fastapi_app
from app.models import Skill, SkillVersion, User

pytestmark = pytest.mark.asyncio


def _make_skill_zip(slug: str = "test-skill", version: str = "1.0.0") -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr(
            "skill.yaml",
            f"name: {slug}\nversion: {version}\ntargets:\n  - cursor\n",
        )
        zf.writestr("skill.md", "# Test Skill\nHello world")
    return buf.getvalue()


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


class _ChunkedUpload:
    def __init__(self, chunks: list[bytes]):
        self.chunks = chunks
        self.read_calls = 0

    async def read(self, size: int) -> bytes:
        self.read_calls += 1
        if not self.chunks:
            return b""
        return self.chunks.pop(0)


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


async def test_upload_reader_rejects_when_stream_exceeds_limit():
    upload = _ChunkedUpload([b"abc", b"de"])

    with pytest.raises(HTTPException) as exc:
        await _read_upload_with_limit(upload, 4)

    assert exc.value.status_code == 413
    assert upload.read_calls == 2


async def _make_admin(username: str = "admin"):
    """Promote a user to admin role directly in the DB."""
    async for session in fastapi_app.dependency_overrides[get_db]():
        result = await session.execute(
            select(User).where(User.username == username)
        )
        user = result.scalar_one()
        user.role = "admin"
        await session.commit()
        break


async def _set_version_created_at(skill_slug: str, version: str, created_at: datetime):
    """Pin a version's created_at so latest-pointer ordering is deterministic."""
    async for session in fastapi_app.dependency_overrides[get_db]():
        skill_result = await session.execute(
            select(Skill).where(Skill.slug == skill_slug)
        )
        skill = skill_result.scalar_one()
        ver_result = await session.execute(
            select(SkillVersion).where(
                SkillVersion.skill_id == skill.id,
                SkillVersion.version == version,
            )
        )
        ver = ver_result.scalar_one()
        ver.created_at = created_at
        await session.commit()
        break


async def _get_version_id(skill_slug: str, version: str):
    async for session in fastapi_app.dependency_overrides[get_db]():
        skill_result = await session.execute(
            select(Skill).where(Skill.slug == skill_slug)
        )
        skill = skill_result.scalar_one()
        ver_result = await session.execute(
            select(SkillVersion.id).where(
                SkillVersion.skill_id == skill.id,
                SkillVersion.version == version,
            )
        )
        return ver_result.scalar_one()


async def _get_latest_version_id(skill_slug: str):
    async for session in fastapi_app.dependency_overrides[get_db]():
        result = await session.execute(
            select(Skill).where(Skill.slug == skill_slug)
        )
        return result.scalar_one().latest_version_id


async def test_upload_version(client: AsyncClient):
    await _register(client, "publisher1")
    token = await _login(client, "publisher1")

    # Admins are allowed to upload versions.
    async for session in fastapi_app.dependency_overrides[get_db]():
        result = await session.execute(
            select(User).where(User.username == "publisher1")
        )
        user = result.scalar_one()
        user.role = "admin"
        await session.commit()
        break

    await _create_skill_direct("test-skill", "publisher1", name="Test Skill")

    zip_content = _make_skill_zip("test-skill", "1.0.0")
    resp = await client.post(
        "/api/skills/by-slug/test-skill/versions",
        files={"file": ("skill.zip", zip_content, "application/zip")},
        data={"version": "1.0.0"},
        headers=_auth(token),
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["version"] == "1.0.0"
    assert data["status"] == "pending"
    assert data["skill_id"] is not None
    assert data["targets"] == ["cursor"]


async def test_upload_invalid_yaml(client: AsyncClient):
    await _register(client, "publisher2")
    token = await _login(client, "publisher2")

    async for session in fastapi_app.dependency_overrides[get_db]():
        result = await session.execute(
            select(User).where(User.username == "publisher2")
        )
        user = result.scalar_one()
        user.role = "admin"
        await session.commit()
        break

    await _create_skill_direct("bad-skill", "publisher2", name="Bad Skill")

    # Create a ZIP without skill.yaml
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("readme.md", "# No yaml here")
    bad_zip = buf.getvalue()

    resp = await client.post(
        "/api/skills/by-slug/bad-skill/versions",
        files={"file": ("skill.zip", bad_zip, "application/zip")},
        data={"version": "1.0.0"},
        headers=_auth(token),
    )
    assert resp.status_code == 400


async def test_approve_version(client: AsyncClient):
    await _register(client, "pub_approve")
    token = await _login(client, "pub_approve")

    async for session in fastapi_app.dependency_overrides[get_db]():
        result = await session.execute(
            select(User).where(User.username == "pub_approve")
        )
        user = result.scalar_one()
        user.role = "admin"
        await session.commit()
        break

    await _create_skill_direct("approve-skill", "pub_approve", name="Approve Skill")

    zip_content = _make_skill_zip("approve-skill", "1.0.0")
    await client.post(
        "/api/skills/by-slug/approve-skill/versions",
        files={"file": ("skill.zip", zip_content, "application/zip")},
        data={"version": "1.0.0"},
        headers=_auth(token),
    )

    # Now approve as admin
    await _register(client, "admin_approve")
    await _make_admin("admin_approve")
    admin_token = await _login(client, "admin_approve")

    resp = await client.post(
        "/api/skills/by-slug/approve-skill/versions/1.0.0/approve",
        headers=_auth(admin_token),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "approved"
    assert data["reviewer_id"] is not None


async def test_reject_version(client: AsyncClient):
    await _register(client, "pub_reject")
    token = await _login(client, "pub_reject")

    async for session in fastapi_app.dependency_overrides[get_db]():
        result = await session.execute(
            select(User).where(User.username == "pub_reject")
        )
        user = result.scalar_one()
        user.role = "admin"
        await session.commit()
        break

    await _create_skill_direct("reject-skill", "pub_reject", name="Reject Skill")

    zip_content = _make_skill_zip("reject-skill", "1.0.0")
    await client.post(
        "/api/skills/by-slug/reject-skill/versions",
        files={"file": ("skill.zip", zip_content, "application/zip")},
        data={"version": "1.0.0"},
        headers=_auth(token),
    )

    # Now reject as admin
    await _register(client, "admin_reject")
    await _make_admin("admin_reject")
    admin_token = await _login(client, "admin_reject")

    resp = await client.post(
        "/api/skills/by-slug/reject-skill/versions/1.0.0/reject",
        headers=_auth(admin_token),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "rejected"


async def test_download_version(client: AsyncClient):
    await _register(client, "pub_download")
    token = await _login(client, "pub_download")

    async for session in fastapi_app.dependency_overrides[get_db]():
        result = await session.execute(
            select(User).where(User.username == "pub_download")
        )
        user = result.scalar_one()
        user.role = "admin"
        await session.commit()
        break

    await _create_skill_direct("dl-skill", "pub_download", name="Download Skill")

    zip_content = _make_skill_zip("dl-skill", "1.0.0")
    await client.post(
        "/api/skills/by-slug/dl-skill/versions",
        files={"file": ("skill.zip", zip_content, "application/zip")},
        data={"version": "1.0.0"},
        headers=_auth(token),
    )

    # Approve as admin
    await _register(client, "admin_download")
    await _make_admin("admin_download")
    admin_token = await _login(client, "admin_download")

    await client.post(
        "/api/skills/by-slug/dl-skill/versions/1.0.0/approve",
        headers=_auth(admin_token),
    )

    # Download
    resp = await client.get("/api/skills/by-slug/dl-skill/versions/1.0.0/download")
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/zip"
    assert resp.content == zip_content


async def test_download_pending_version_limited_to_submitter_and_admin(client: AsyncClient):
    await _register(client, "pending_download_pub")
    token = await _login(client, "pending_download_pub")

    async for session in fastapi_app.dependency_overrides[get_db]():
        result = await session.execute(
            select(User).where(User.username == "pending_download_pub")
        )
        user = result.scalar_one()
        user.role = "admin"
        await session.commit()
        break

    await _create_skill_direct(
        "pending-dl-skill", "pending_download_pub", name="Pending Download Skill"
    )

    zip_content = _make_skill_zip("pending-dl-skill", "1.0.0")
    await client.post(
        "/api/skills/by-slug/pending-dl-skill/versions",
        files={"file": ("skill.zip", zip_content, "application/zip")},
        data={"version": "1.0.0"},
        headers=_auth(token),
    )

    owner_resp = await client.get(
        "/api/skills/by-slug/pending-dl-skill/versions/1.0.0/download",
        headers=_auth(token),
    )
    assert owner_resp.status_code == 200
    assert owner_resp.content == zip_content

    await _register(client, "pending_download_admin")
    await _make_admin("pending_download_admin")
    admin_token = await _login(client, "pending_download_admin")
    admin_resp = await client.get(
        "/api/skills/by-slug/pending-dl-skill/versions/1.0.0/download",
        headers=_auth(admin_token),
    )
    assert admin_resp.status_code == 200
    assert admin_resp.content == zip_content

    await _register(client, "pending_download_other")
    other_token = await _login(client, "pending_download_other")
    other_resp = await client.get(
        "/api/skills/by-slug/pending-dl-skill/versions/1.0.0/download",
        headers=_auth(other_token),
    )
    assert other_resp.status_code == 404

    anonymous_resp = await client.get(
        "/api/skills/by-slug/pending-dl-skill/versions/1.0.0/download"
    )
    assert anonymous_resp.status_code == 404


async def test_submitter_sees_own_pending_version_in_version_history(client: AsyncClient):
    await _register(client, "pending_history_pub")
    token = await _login(client, "pending_history_pub")

    async for session in fastapi_app.dependency_overrides[get_db]():
        result = await session.execute(
            select(User).where(User.username == "pending_history_pub")
        )
        user = result.scalar_one()
        user.role = "admin"
        await session.commit()
        break

    await _create_skill_direct(
        "pending-history-skill", "pending_history_pub", name="Pending History Skill"
    )
    zip_content = _make_skill_zip("pending-history-skill", "1.0.0")
    await client.post(
        "/api/skills/by-slug/pending-history-skill/versions",
        files={"file": ("skill.zip", zip_content, "application/zip")},
        data={"version": "1.0.0"},
        headers=_auth(token),
    )

    owner_resp = await client.get(
        "/api/skills/by-slug/pending-history-skill/versions",
        headers=_auth(token),
    )
    assert owner_resp.status_code == 200
    assert [item["status"] for item in owner_resp.json()["items"]] == ["pending"]

    anonymous_resp = await client.get(
        "/api/skills/by-slug/pending-history-skill/versions"
    )
    assert anonymous_resp.status_code == 200
    assert anonymous_resp.json()["items"] == []


async def test_version_file_content_uses_the_file_media_type(client: AsyncClient):
    await _register(client, "file_media_owner")
    token = await _login(client, "file_media_owner")
    await _create_skill_direct("file-media-skill", "file_media_owner")

    png_data = b"\x89PNG\r\n\x1a\n" + b"test-image"
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr(
            "file-media-skill/SKILL.md",
            "---\nname: file-media-skill\nversion: 1.0.0\n---\n# Guide",
        )
        zf.writestr("file-media-skill/assets/preview.png", png_data)
        zf.writestr("file-media-skill/examples/demo.html", "<script>alert('xss')</script>")

    upload = await client.post(
        "/api/skills/by-slug/file-media-skill/versions",
        files={"file": ("skill.zip", buf.getvalue(), "application/zip")},
        data={"version": "1.0.0"},
        headers=_auth(token),
    )
    assert upload.status_code == 201

    response = await client.get(
        "/api/skills/by-slug/file-media-skill/versions/1.0.0/files/content",
        params={"path": "file-media-skill/assets/preview.png"},
        headers=_auth(token),
    )

    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    assert response.content == png_data

    html_response = await client.get(
        "/api/skills/by-slug/file-media-skill/versions/1.0.0/files/content",
        params={"path": "file-media-skill/examples/demo.html"},
        headers=_auth(token),
    )

    assert html_response.status_code == 200
    assert html_response.headers["content-type"].startswith("text/plain")


# --- Helpers for the latest-pointer state-machine tests ---


async def _upload_version(client: AsyncClient, slug: str, version: str, token: str):
    resp = await client.post(
        f"/api/skills/by-slug/{slug}/versions",
        files={"file": ("skill.zip", _make_skill_zip(slug, version), "application/zip")},
        data={"version": version},
        headers=_auth(token),
    )
    assert resp.status_code == 201
    return resp.json()


async def _approve(client: AsyncClient, slug: str, version: str, admin_token: str):
    resp = await client.post(
        f"/api/skills/by-slug/{slug}/versions/{version}/approve",
        headers=_auth(admin_token),
    )
    assert resp.status_code == 200
    return resp.json()


async def _reject(client: AsyncClient, slug: str, version: str, admin_token: str):
    resp = await client.post(
        f"/api/skills/by-slug/{slug}/versions/{version}/reject",
        headers=_auth(admin_token),
    )
    assert resp.status_code == 200
    return resp.json()


async def _setup_skill_with_versions(client: AsyncClient, prefix: str, versions: list[str]):
    """Register publisher + admin, create a skill, upload the given versions."""
    # Usernames only allow [a-zA-Z0-9_] (auth.py), so strip hyphens.
    publisher = f"{prefix.replace('-', '_')}_pub"
    await _register(client, publisher)
    token = await _login(client, publisher)
    await _create_skill_direct(prefix, publisher, name=prefix.replace("-", " ").title())
    for version in versions:
        await _upload_version(client, prefix, version, token)

    admin = f"{prefix.replace('-', '_')}_admin"
    await _register(client, admin)
    await _make_admin(admin)
    admin_token = await _login(client, admin)
    return token, admin_token


async def test_reapprove_does_not_regress_latest_pointer(client: AsyncClient):
    slug = "reapprove-skill"
    _, admin_token = await _setup_skill_with_versions(client, slug, ["1.0.0", "2.0.0"])

    # Pin upload order: 1.0.0 older, 2.0.0 newer.
    await _set_version_created_at(slug, "1.0.0", datetime(2026, 1, 1, tzinfo=timezone.utc))
    await _set_version_created_at(slug, "2.0.0", datetime(2026, 1, 2, tzinfo=timezone.utc))

    await _approve(client, slug, "1.0.0", admin_token)
    await _approve(client, slug, "2.0.0", admin_token)
    assert await _get_latest_version_id(slug) == await _get_version_id(slug, "2.0.0")

    # Re-approving the older, already-approved version must not move the pointer.
    await _approve(client, slug, "1.0.0", admin_token)
    assert await _get_latest_version_id(slug) == await _get_version_id(slug, "2.0.0")


async def test_approve_older_pending_version_keeps_newer_latest(client: AsyncClient):
    slug = "older-pending-skill"
    _, admin_token = await _setup_skill_with_versions(client, slug, ["1.0.0", "2.0.0"])

    # 1.0.0 is the most recently published, 2.0.0 was published earlier.
    await _set_version_created_at(slug, "1.0.0", datetime(2026, 1, 2, tzinfo=timezone.utc))
    await _set_version_created_at(slug, "2.0.0", datetime(2026, 1, 1, tzinfo=timezone.utc))

    await _approve(client, slug, "1.0.0", admin_token)
    assert await _get_latest_version_id(slug) == await _get_version_id(slug, "1.0.0")

    # Approving the older pending version must not move the pointer.
    await _approve(client, slug, "2.0.0", admin_token)
    assert await _get_latest_version_id(slug) == await _get_version_id(slug, "1.0.0")


async def test_reject_latest_version_repoints_pointer(client: AsyncClient):
    slug = "reject-latest-skill"
    _, admin_token = await _setup_skill_with_versions(client, slug, ["1.0.0", "2.0.0"])

    await _set_version_created_at(slug, "1.0.0", datetime(2026, 1, 1, tzinfo=timezone.utc))
    await _set_version_created_at(slug, "2.0.0", datetime(2026, 1, 2, tzinfo=timezone.utc))

    await _approve(client, slug, "1.0.0", admin_token)
    await _approve(client, slug, "2.0.0", admin_token)
    assert await _get_latest_version_id(slug) == await _get_version_id(slug, "2.0.0")

    # Rejecting the latest approved version repoints to the most recent
    # remaining approved version.
    await _reject(client, slug, "2.0.0", admin_token)
    assert await _get_latest_version_id(slug) == await _get_version_id(slug, "1.0.0")

    # With no approved version left, the pointer is cleared.
    await _reject(client, slug, "1.0.0", admin_token)
    assert await _get_latest_version_id(slug) is None


async def test_reject_pending_version_leaves_pointer_untouched(client: AsyncClient):
    slug = "reject-pending-skill"
    _, admin_token = await _setup_skill_with_versions(client, slug, ["1.0.0", "2.0.0"])

    await _approve(client, slug, "1.0.0", admin_token)
    latest_before = await _get_latest_version_id(slug)
    assert latest_before == await _get_version_id(slug, "1.0.0")

    # 2.0.0 is still pending and not the latest pointer — rejecting it must
    # not touch the pointer.
    await _reject(client, slug, "2.0.0", admin_token)
    assert await _get_latest_version_id(slug) == latest_before
