import logging
from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

logger = logging.getLogger(__name__)

engine = create_async_engine(
    settings.database_url,
    pool_size=20,
    max_overflow=10,
    pool_timeout=30,
    pool_recycle=1800,
    pool_pre_ping=True,
    connect_args={
        "server_settings": {"client_encoding": "utf8"},
    },
)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


@asynccontextmanager
async def lifespan(app):
    logger.info("Database engine created (pool_size=%d)", engine.pool.size() if hasattr(engine.pool, 'size') else 20)
    # Recover stale "processing" analyses left over from a crashed/restarted worker
    try:
        from sqlalchemy import update
        from app.models.llm_provider import SkillAnalysis
        async with async_session() as db:
            result = await db.execute(
                update(SkillAnalysis)
                .where(SkillAnalysis.status == "processing")
                .values(status="failed", error_message="Worker restarted; analysis interrupted")
            )
            if result.rowcount:
                await db.commit()
                logger.info("Recovered %d stale 'processing' analyses to 'failed'", result.rowcount)
    except Exception as e:
        logger.warning("Could not recover stale analyses: %s", e)
    yield
    await engine.dispose()
    logger.info("Database engine disposed")
