import pytest
from httpx import AsyncClient

from tests.conftest import register_user, login_user, auth_header

pytestmark = pytest.mark.asyncio


async def test_overview_unauthorized(client: AsyncClient):
    resp = await client.get("/api/stats/overview")
    assert resp.status_code == 403


async def test_overview_empty(client: AsyncClient):
    await register_user(client, "statsuser")
    token = await login_user(client, "statsuser")

    resp = await client.get("/api/stats/overview", headers=auth_header(token))
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_skills"] == 0
    assert data["total_downloads"] == 0
    assert data["total_users"] == 1
    assert data["total_versions"] == 0


async def test_skill_stats_not_found(client: AsyncClient):
    resp = await client.get("/api/stats/skills/nonexistent")
    assert resp.status_code == 404
