"""
Tests for user registration and authentication endpoints.
Covers: POST /api/register, POST /api/login, GET /api/me
"""


async def test_register_success(client):
    """New user registers successfully — returns 201 with username."""
    r = await client.post("/api/register", json={
        "username": "alice",
        "password": "password123"
    })
    assert r.status_code == 201
    assert r.json()["username"] == "alice"


async def test_register_duplicate_username(client):
    """Registering with an existing username returns 400."""
    await client.post("/api/register", json={"username": "bob", "password": "pass"})
    r = await client.post("/api/register", json={"username": "bob", "password": "pass"})
    assert r.status_code == 400
    assert "taken" in r.json()["detail"].lower()


async def test_login_success(client):
    """Valid credentials return 200 with access_token."""
    await client.post("/api/register", json={"username": "carol", "password": "secret"})
    r = await client.post("/api/login", data={"username": "carol", "password": "secret"})
    assert r.status_code == 200
    data = r.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


async def test_login_wrong_password(client):
    """Wrong password returns 401 Unauthorized."""
    await client.post("/api/register", json={"username": "dan", "password": "correct"})
    r = await client.post("/api/login", data={"username": "dan", "password": "wrong"})
    assert r.status_code == 401


async def test_login_nonexistent_user(client):
    """Login with unknown username returns 401."""
    r = await client.post("/api/login", data={"username": "ghost", "password": "any"})
    assert r.status_code == 401


async def test_get_me(client, auth_token):
    """GET /api/me returns the current authenticated user."""
    r = await client.get("/api/me", headers={"Authorization": f"Bearer {auth_token}"})
    assert r.status_code == 200
    assert r.json()["username"] == "testuser"


async def test_get_me_no_token(client):
    """GET /api/me without token returns 401."""
    r = await client.get("/api/me")
    assert r.status_code == 401
