import uuid

import pytest
import pytest_asyncio
from sqlalchemy import JSON, String, ColumnDefault, TypeDecorator
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from httpx import ASGITransport, AsyncClient

# Import models FIRST so they register with Base.metadata
import app.models  # noqa: F401
from app.database import Base
from app.main import app as fastapi_app
from app.api.deps import get_db


class _SQLiteUUID(TypeDecorator):
    """UUID type that stores as String(36) in SQLite and auto-converts."""
    impl = String(36)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is not None:
            return str(value)
        return value

    def process_result_value(self, value, dialect):
        return value


def _patch_types_for_sqlite():
    """Replace PostgreSQL-specific column types with SQLite-compatible ones."""
    for table in Base.metadata.sorted_tables:
        for col in table.columns:
            type_name = type(col.type).__name__
            if type_name == "UUID":
                col.type = _SQLiteUUID()
                if col.default is not None:
                    if isinstance(col.default, ColumnDefault) and callable(col.default.arg):
                        col.default = ColumnDefault(lambda: str(uuid.uuid4()))
            elif type_name == "JSONB":
                col.type = JSON()


_patch_types_for_sqlite()

TEST_DB_URL = "sqlite+aiosqlite://"
TEST_PASSWORD = "Test1234"


@pytest_asyncio.fixture(autouse=True)
async def setup_db():
    fastapi_app.state.disable_rate_limit = True
    engine = create_async_engine(TEST_DB_URL)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    TestSession = async_sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )

    async def override_get_db():
        async with TestSession() as session:
            yield session

    fastapi_app.dependency_overrides[get_db] = override_get_db
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    fastapi_app.dependency_overrides.clear()
    fastapi_app.state.disable_rate_limit = False
    await engine.dispose()


@pytest_asyncio.fixture
async def client():
    async with AsyncClient(
        transport=ASGITransport(app=fastapi_app), base_url="http://test"
    ) as c:
        yield c


# --- Shared test helpers ---

async def register_user(client: AsyncClient, username: str = "testuser"):
    resp = await client.post(
        "/api/auth/register",
        json={"username": username, "password": TEST_PASSWORD},
    )
    return resp.json()


async def login_user(client: AsyncClient, username: str = "testuser"):
    resp = await client.post(
        "/api/auth/login",
        json={"username": username, "password": TEST_PASSWORD},
    )
    return resp.json()["access_token"]


def auth_header(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def create_skill_direct(slug: str, username: str, **kwargs):
    """Insert a skill directly into the DB."""
    from sqlalchemy import select
    from app.models import Skill, User

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


async def make_admin(username: str = "admin"):
    """Set a user's role to admin directly in DB."""
    from sqlalchemy import select
    from app.models import User

    async for session in fastapi_app.dependency_overrides[get_db]():
        result = await session.execute(select(User).where(User.username == username))
        user = result.scalar_one()
        user.role = "admin"
        await session.commit()
        break


async def make_publisher(username: str):
    """Backward-compatible helper for old tests; publish permission is admin-only."""
    from sqlalchemy import select
    from app.models import User

    async for session in fastapi_app.dependency_overrides[get_db]():
        result = await session.execute(select(User).where(User.username == username))
        user = result.scalar_one()
        user.role = "admin"
        await session.commit()
        break
