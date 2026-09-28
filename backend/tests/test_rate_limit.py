import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.middleware.rate_limit import RateLimitMiddleware

pytestmark = pytest.mark.asyncio


async def test_path_specific_limit_does_not_share_global_bucket():
    app = FastAPI()

    @app.post("/api/auth/login")
    async def login():
        return {"ok": True}

    app.add_middleware(RateLimitMiddleware)

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        statuses = [
            (await client.post("/api/auth/login")).status_code for _ in range(10)
        ]
        blocked = await client.post("/api/auth/login")

    assert statuses == [200] * 10
    assert blocked.status_code == 429


async def test_token_list_is_not_limited_by_token_write_limit():
    app = FastAPI()

    @app.get("/api/tokens")
    async def list_tokens():
        return []

    app.add_middleware(RateLimitMiddleware)

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        statuses = [(await client.get("/api/tokens")).status_code for _ in range(6)]

    assert statuses == [200] * 6
