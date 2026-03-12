import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

from app.main import app
from app.database import get_db, Base

TEST_DB_URL = "sqlite+aiosqlite:///:memory:"


@pytest_asyncio.fixture(scope="session")
async def test_engine():
    """Single in-memory DB for the whole test session."""
    engine = create_async_engine(TEST_DB_URL)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    await engine.dispose()


@pytest_asyncio.fixture
async def db_session(test_engine):
    """Fresh DB session per test — prevents state leakage between tests."""
    SessionLocal = async_sessionmaker(test_engine, expire_on_commit=False)
    async with SessionLocal() as session:
        yield session


@pytest_asyncio.fixture
async def client(db_session):
    """HTTP client with overridden DB dependency — no real server needed."""
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test"
    ) as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def auth_token(client):
    """Register a test user and return their JWT access token."""
    await client.post("/api/register", json={
        "username": "testuser",
        "password": "testpass123"
    })
    r = await client.post("/api/login", data={
        "username": "testuser",
        "password": "testpass123"
    })
    return r.json()["access_token"]


@pytest_asyncio.fixture
async def create_test_user(client):
    """Helper to create a user and return (user_data, token)."""
    async def _create(username, password="password", display_name=None):
        r1 = await client.post("/api/register", json={
            "username": username,
            "password": password,
            "display_name": display_name or username
        })
        user_data = r1.json()
        
        r2 = await client.post("/api/login", data={
            "username": username,
            "password": password
        })
        token = r2.json()["access_token"]
        return user_data, token
    return _create


@pytest_asyncio.fixture
async def authenticated_client(client, auth_token):
    """Return a tuple of (client, token)."""
    return client, auth_token
