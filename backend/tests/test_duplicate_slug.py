"""Tests for two users owning Skills with the same slug.

The schema allows duplicate slugs across owners (UniqueConstraint is owner_id +
slug). These tests guard against the old behavior where a bare-slug lookup
returned multiple rows and raised MultipleResultsFound (HTTP 500).
"""
import pytest

from tests.conftest import (
    auth_header,
    create_skill_direct,
    login_user,
    make_admin,
    register_user,
)

pytestmark = pytest.mark.asyncio


async def _setup_two_owners_same_slug(client):
    """Register two users who each own a Skill with slug 'shared-skill'."""
    await register_user(client, username="alice")
    await register_user(client, username="bob")
    await create_skill_direct("shared-skill", "alice", name="Alice Skill")
    await create_skill_direct("shared-skill", "bob", name="Bob Skill")


async def test_bare_slug_requires_owner_with_duplicate_owners(client):
    """A bare duplicate slug must fail safely instead of selecting an owner."""
    await _setup_two_owners_same_slug(client)
    token = await login_user(client, username="alice")
    resp = await client.get(
        "/api/skills/by-slug/shared-skill", headers=auth_header(token)
    )
    assert resp.status_code == 409
    assert "owner" in resp.json()["detail"].lower()


async def test_owner_disambiguates_duplicate_slug(client):
    """?owner= resolves to the correct user's Skill when slugs collide."""
    await _setup_two_owners_same_slug(client)
    token = await login_user(client, username="alice")

    resp_bob = await client.get(
        "/api/skills/by-slug/shared-skill",
        params={"owner": "bob"},
        headers=auth_header(token),
    )
    assert resp_bob.status_code == 200
    assert resp_bob.json()["name"] == "Bob Skill"

    resp_alice = await client.get(
        "/api/skills/by-slug/shared-skill",
        params={"owner": "alice"},
        headers=auth_header(token),
    )
    assert resp_alice.status_code == 200
    assert resp_alice.json()["name"] == "Alice Skill"


async def test_nonexistent_owner_returns_404(client):
    await _setup_two_owners_same_slug(client)
    token = await login_user(client, username="alice")
    resp = await client.get(
        "/api/skills/by-slug/shared-skill",
        params={"owner": "nobody"},
        headers=auth_header(token),
    )
    assert resp.status_code == 404


async def test_analysis_endpoint_uses_owner_to_select_duplicate_slug(client):
    await _setup_two_owners_same_slug(client)
    await make_admin("alice")

    from sqlalchemy import select

    from app.api.deps import get_db
    from app.main import app as fastapi_app
    from app.models import Skill, SkillVersion, User

    async for session in fastapi_app.dependency_overrides[get_db]():
        bob = (await session.execute(select(User).where(User.username == "bob"))).scalar_one()
        bob_skill = (
            await session.execute(
                select(Skill).where(Skill.owner_id == bob.id, Skill.slug == "shared-skill")
            )
        ).scalar_one()
        session.add(
            SkillVersion(
                skill_id=bob_skill.id,
                version="1.0.0",
                file_path="/tmp/shared-skill.zip",
                original_filename="shared-skill.zip",
                file_size=1,
                checksum="0" * 64,
                publisher_id=bob.id,
                status="approved",
            )
        )
        await session.commit()
        break

    token = await login_user(client, username="alice")
    headers = auth_header(token)
    exact = await client.get(
        "/api/skills/by-slug/shared-skill/versions/1.0.0/analysis",
        params={"owner": "bob"},
        headers=headers,
    )
    ambiguous = await client.get(
        "/api/skills/by-slug/shared-skill/versions/1.0.0/analysis",
        headers=headers,
    )

    assert exact.status_code == 200
    assert exact.json() is None
    assert ambiguous.status_code == 409
