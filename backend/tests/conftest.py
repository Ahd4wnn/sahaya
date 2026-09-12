import uuid

import pytest_asyncio
from sqlalchemy import delete, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.models.marketplace import HelperProfile, HirerProfile
from app.models.user import AuthIdentity, OtpCode, RefreshToken, User


@pytest_asyncio.fixture
async def db() -> AsyncSession:
    """A session on a per-test engine, rolled back at the end.

    The engine is built per test with NullPool rather than reusing the
    application engine: pooled asyncpg connections are bound to the event loop
    that created them, and pytest-asyncio gives each test a fresh loop, so a
    shared pool hands out connections attached to a closed loop.

    Tests run against the real PostgreSQL database because the schema uses
    native enums, ARRAY and JSONB -- testing on SQLite would test a different
    schema than the one that ships.
    """
    engine = create_async_engine(settings.DATABASE_URL, poolclass=NullPool)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        try:
            yield session
        finally:
            await session.rollback()
    await engine.dispose()


@pytest_asyncio.fixture
async def clean_user(db: AsyncSession):
    """Track identifiers created by a test and remove their rows afterwards."""
    created: list[str] = []

    async def _track(*identifiers: str) -> None:
        created.extend(identifiers)

    yield _track

    for ident in created:
        row = (
            await db.execute(
                text("SELECT id FROM users WHERE email = :v OR phone = :v"),
                {"v": ident},
            )
        ).first()
        if row:
            uid = row[0]
            await db.execute(delete(AuthIdentity).where(AuthIdentity.user_id == uid))
            await db.execute(delete(RefreshToken).where(RefreshToken.user_id == uid))
            await db.execute(delete(HelperProfile).where(HelperProfile.user_id == uid))
            await db.execute(delete(HirerProfile).where(HirerProfile.user_id == uid))
            await db.execute(delete(User).where(User.id == uid))
        await db.execute(delete(OtpCode).where(OtpCode.target == ident))
    await db.commit()


def unique_phone() -> str:
    return "+919" + str(uuid.uuid4().int)[:9]


def unique_email() -> str:
    return f"test-{uuid.uuid4().hex[:12]}@sahaya.test"


@pytest_asyncio.fixture
async def client():
    """HTTP client against the real ASGI app, with the database dependency
    rebound to a per-test NullPool engine.

    The application engine pools connections, and an asyncpg connection is bound
    to the loop that opened it. pytest-asyncio gives each test a fresh loop, so
    without this override the app would hand out connections attached to a
    closed loop.
    """
    from httpx import ASGITransport, AsyncClient

    from app.db.session import get_db
    from app.main import app

    engine = create_async_engine(settings.DATABASE_URL, poolclass=NullPool)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async def _override():
        async with factory() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    app.dependency_overrides[get_db] = _override
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as c:
        yield c
    app.dependency_overrides.pop(get_db, None)
    await engine.dispose()
