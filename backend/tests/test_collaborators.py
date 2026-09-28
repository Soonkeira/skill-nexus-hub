import pytest
from httpx import AsyncClient

from tests.conftest import (
    register_user, login_user, auth_header,
    create_skill_direct, make_admin,
)

pytestmark = pytest.mark.asyncio


async def test_list_collaborators_empty(client: AsyncClient):
    await register_user(client, "owner1")
    await create_skill_direct("collab-skill", "owner1")
    token = await login_user(client, "owner1")

    resp = await client.get(
        "/api/skills/by-slug/collab-skill/collaborators",
        headers=auth_header(token),
    )
    assert resp.status_code == 200
    assert resp.json() == []


async def test_add_collaborator(client: AsyncClient):
    await register_user(client, "skill_owner")
    await register_user(client, "collab_user")
    await create_skill_direct("team-skill", "skill_owner")

    owner_token = await login_user(client, "skill_owner")
    collab_resp = await client.get(
        "/api/auth/me", headers=auth_header(await login_user(client, "collab_user"))
    )
    collab_user_id = collab_resp.json()["id"]

    resp = await client.post(
        "/api/skills/by-slug/team-skill/collaborators",
        json={"user_id": collab_user_id, "role": "editor"},
        headers=auth_header(owner_token),
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["username"] == "collab_user"
    assert data["role"] == "editor"


async def test_add_collaborator_forbidden(client: AsyncClient):
    await register_user(client, "real_owner")
    await register_user(client, "random_user")
    await create_skill_direct("owned-skill", "real_owner")

    random_token = await login_user(client, "random_user")
    resp = await client.post(
        "/api/skills/by-slug/owned-skill/collaborators",
        json={"user_id": "fake-id", "role": "editor"},
        headers=auth_header(random_token),
    )
    assert resp.status_code == 403


async def test_add_collaborator_invalid_role(client: AsyncClient):
    await register_user(client, "role_owner")
    await register_user(client, "role_target")
    await create_skill_direct("role-skill", "role_owner")

    owner_token = await login_user(client, "role_owner")
    collab_resp = await client.get(
        "/api/auth/me", headers=auth_header(await login_user(client, "role_target"))
    )
    collab_user_id = collab_resp.json()["id"]

    resp = await client.post(
        "/api/skills/by-slug/role-skill/collaborators",
        json={"user_id": collab_user_id, "role": "admin"},
        headers=auth_header(owner_token),
    )
    assert resp.status_code == 400


async def test_remove_collaborator(client: AsyncClient):
    await register_user(client, "rm_owner")
    await register_user(client, "rm_collab")
    await create_skill_direct("rm-skill", "rm_owner")

    owner_token = await login_user(client, "rm_owner")
    collab_resp = await client.get(
        "/api/auth/me", headers=auth_header(await login_user(client, "rm_collab"))
    )
    collab_user_id = collab_resp.json()["id"]

    # Add first
    await client.post(
        "/api/skills/by-slug/rm-skill/collaborators",
        json={"user_id": collab_user_id, "role": "viewer"},
        headers=auth_header(owner_token),
    )

    # Remove
    resp = await client.delete(
        f"/api/skills/by-slug/rm-skill/collaborators/{collab_user_id}",
        headers=auth_header(owner_token),
    )
    assert resp.status_code == 204

    # Verify list is empty
    list_resp = await client.get(
        "/api/skills/by-slug/rm-skill/collaborators",
        headers=auth_header(owner_token),
    )
    assert list_resp.json() == []
