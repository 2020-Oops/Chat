---
name: pytest
description: Best practices for testing the FastAPI chat server with pytest and pytest-asyncio — fixtures, async tests, dependency overrides, test structure
---

# Pytest Skill

## Project Context
Tests live in `server/tests/` (or `backend/tests/`).
Stack: pytest + pytest-asyncio + httpx.AsyncClient + SQLite in-memory for test DB.

---

## Required Packages
Add to `requirements.txt`:
```
pytest==8.1.1
pytest-asyncio==0.23.6
httpx==0.27.0
```

---

## Test File Structure
```
server/tests/
├── __init__.py
├── conftest.py        # shared fixtures: app, async client, test DB
├── test_auth.py       # register, login, JWT
├── test_messages.py   # save/load messages
└── test_websocket.py  # WebSocket connection (optional)
```

---

## conftest.py — Core Fixtures

```python
# tests/conftest.py
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

from app.main import app
from app.database import get_db, Base

TEST_DB_URL = "sqlite+aiosqlite:///:memory:"

@pytest_asyncio.fixture(scope="session")
async def test_engine():
    engine = create_async_engine(TEST_DB_URL)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    await engine.dispose()

@pytest_asyncio.fixture
async def db_session(test_engine):
    SessionLocal = async_sessionmaker(test_engine, expire_on_commit=False)
    async with SessionLocal() as session:
        yield session

@pytest_asyncio.fixture
async def client(db_session):
    # Override DB dependency
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()
```

---

## Example Tests

### test_auth.py
```python
import pytest

@pytest.mark.asyncio
async def test_register(client):
    r = await client.post("/api/register", json={"username": "alice", "password": "pass123"})
    assert r.status_code == 201
    assert r.json()["username"] == "alice"

@pytest.mark.asyncio
async def test_register_duplicate(client):
    await client.post("/api/register", json={"username": "bob", "password": "pass"})
    r = await client.post("/api/register", json={"username": "bob", "password": "pass"})
    assert r.status_code == 400

@pytest.mark.asyncio
async def test_login(client):
    await client.post("/api/register", json={"username": "carol", "password": "secret"})
    r = await client.post("/api/login", data={"username": "carol", "password": "secret"})
    assert r.status_code == 200
    assert "access_token" in r.json()

@pytest.mark.asyncio
async def test_login_wrong_password(client):
    r = await client.post("/api/login", data={"username": "carol", "password": "wrong"})
    assert r.status_code == 401
```

### test_messages.py
```python
@pytest.mark.asyncio
async def test_get_messages_unauthorized(client):
    r = await client.get("/api/messages?room=general")
    assert r.status_code == 401

@pytest.mark.asyncio
async def test_get_messages_authorized(client):
    # register + login
    await client.post("/api/register", json={"username": "dave", "password": "pw"})
    login = await client.post("/api/login", data={"username": "dave", "password": "pw"})
    token = login.json()["access_token"]

    r = await client.get("/api/messages?room=general",
                         headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert isinstance(r.json(), list)
```

---

## Run Tests
```bash
cd server
venv\Scripts\activate
pytest tests/ -v
```

---

## Pytest Configuration (pytest.ini or pyproject.toml)
```ini
# pytest.ini
[pytest]
asyncio_mode = auto
```
With `asyncio_mode = auto`, no need to decorate each test with `@pytest.mark.asyncio`.

---

## Do NOT
- Do NOT use the real `chat.db` in tests — always use in-memory SQLite
- Do NOT share state between tests — use `function`-scoped fixtures
- Do NOT test implementation details — test HTTP responses and DB state
