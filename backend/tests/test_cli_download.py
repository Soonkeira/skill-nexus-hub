import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def test_download_unsupported_platform(client: AsyncClient):
    resp = await client.get("/api/cli/download/beos")
    assert resp.status_code == 400
    assert "Unsupported platform" in resp.json()["detail"]


async def test_download_windows_not_found(client: AsyncClient):
    resp = await client.get("/api/cli/download/windows")
    assert resp.status_code == 404
    assert "not found" in resp.json()["detail"]


async def test_download_linux_not_found(client: AsyncClient):
    resp = await client.get("/api/cli/download/linux")
    assert resp.status_code == 404
