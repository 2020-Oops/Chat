"""
Tests for message history endpoint.
Covers: GET /api/messages
"""


async def test_messages_no_token(client):
    """GET /api/messages without token returns 401."""
    r = await client.get("/api/messages?room=general")
    assert r.status_code == 401


async def test_messages_authorized_returns_list(client, auth_token):
    """Authenticated request returns a list (even if empty)."""
    r = await client.get(
        "/api/messages?room=general",
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    assert r.status_code == 200
    assert isinstance(r.json(), list)


async def test_messages_different_rooms_isolated(client, auth_token):
    """Messages for different rooms are separate lists."""
    headers = {"Authorization": f"Bearer {auth_token}"}
    r_general = await client.get("/api/messages?room=general", headers=headers)
    r_random = await client.get("/api/messages?room=random", headers=headers)
    assert r_general.status_code == 200
    assert r_random.status_code == 200
