---
name: pytest
description: Best practices for testing the FastAPI chat server with pytest and pytest-asyncio — fixtures, async tests, dependency overrides, test structure
---

# Pytest Skill

## Project Context
Tests live in `backend/tests/` (or `server/tests/` after rename).
Stack: **pytest + pytest-asyncio + httpx.AsyncClient + SQLite in-memory**.

> **2024 Best Practice**: use `asyncio_mode = auto` in `pytest.ini` — eliminates need for `@pytest.mark.asyncio` on every test.

---

## Required Packages
```
pytest>=8.1.1
pytest-asyncio>=0.23.6
httpx>=0.27.0
```

---

## Test File Structure
```
backend/tests/
├── __init__.py
├── conftest.py       # DB engine, session, HTTP client, token helper
├── test_auth.py      # register, login, me endpoint
├── test_messages.py  # message history, auth guard
└── pytest.ini        # or put in backend/pytest.ini
```

---

## pytest.ini (must have)
```ini
[pytest]
asyncio_mode = auto
```
Place in `backend/pytest.ini`. Without this every async test needs `@pytest.mark.asyncio`.

---

## conftest.py — Core Fixtures

```python
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

from app.main import app
from app.database import get_db, Base

TEST_DB_URL = "sqlite+aiosqlite:///:memory:"

# --- DB fixtures ---

@pytest_asyncio.fixture(scope="session")
async def test_engine():
    """Single engine for the whole test session."""
    engine = create_async_engine(TEST_DB_URL)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    await engine.dispose()

@pytest_asyncio.fixture
async def db_session(test_engine):
    """Fresh DB session per test function."""
    SessionLocal = async_sessionmaker(test_engine, expire_on_commit=False)
    async with SessionLocal() as session:
        yield session

# --- HTTP client fixture ---

@pytest_asyncio.fixture
async def client(db_session):
    """AsyncClient with DB override — no real server needed."""
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test"
    ) as ac:
        yield ac
    app.dependency_overrides.clear()

# --- Helper fixture: register + login, returns token ---

@pytest_asyncio.fixture
async def auth_token(client):
    """Register testuser and return JWT token."""
    await client.post("/api/register", json={"username": "testuser", "password": "testpass"})
    r = await client.post("/api/login", data={"username": "testuser", "password": "testpass"})
    return r.json()["access_token"]
```

---

## test_auth.py
```python
async def test_register_success(client):
    r = await client.post("/api/register", json={"username": "alice", "password": "pass123"})
    assert r.status_code == 201
    assert r.json()["username"] == "alice"

async def test_register_duplicate(client):
    await client.post("/api/register", json={"username": "bob", "password": "pass"})
    r = await client.post("/api/register", json={"username": "bob", "password": "pass"})
    assert r.status_code == 400

async def test_login_success(client):
    await client.post("/api/register", json={"username": "carol", "password": "secret"})
    r = await client.post("/api/login", data={"username": "carol", "password": "secret"})
    assert r.status_code == 200
    assert "access_token" in r.json()

async def test_login_wrong_password(client):
    await client.post("/api/register", json={"username": "dan", "password": "right"})
    r = await client.post("/api/login", data={"username": "dan", "password": "wrong"})
    assert r.status_code == 401

async def test_get_me(client, auth_token):
    r = await client.get("/api/me", headers={"Authorization": f"Bearer {auth_token}"})
    assert r.status_code == 200
    assert r.json()["username"] == "testuser"
```

---

## test_messages.py
```python
async def test_messages_unauthorized(client):
    r = await client.get("/api/messages?room=general")
    assert r.status_code == 401

async def test_messages_authorized_empty(client, auth_token):
    r = await client.get(
        "/api/messages?room=general",
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    assert r.status_code == 200
    assert isinstance(r.json(), list)
```

---

## Run Tests
```bash
# From backend/ folder
pytest tests/ -v
```

---

## Common Pitfalls
| Problem | Solution |
|---|---|
| `ScopeMismatch` error | Session-scoped `test_engine`, function-scoped `db_session` |
| Tests share data | Each test gets fresh `db_session` — don't use session-scope for data |
| `RuntimeError: no running event loop` | Add `asyncio_mode = auto` to `pytest.ini` |
| `401` on every request | Check `auth_token` fixture is passed correctly |

---

## Do NOT
- Do NOT use real `chat.db` — always `sqlite+aiosqlite:///:memory:`
- Do NOT call `app.dependency_overrides` without clearing after test
- Do NOT skip `pytest.ini` with `asyncio_mode = auto` — causes confusing errors
