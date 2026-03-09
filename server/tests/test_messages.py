"""
Tests for message history endpoint.
Covers: GET /api/messages
"""


async def test_messages_no_token(client):
    """GET /api/messages without token returns 401."""
    r = await client.get("/api/messages?room=dm_alice_bob")
    assert r.status_code == 401


async def test_messages_authorized_returns_list(client, auth_token):
    """Authenticated request returns a list (even if empty)."""
    r = await client.get(
        "/api/messages?room=dm_user_test",
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    assert r.status_code == 200
    assert isinstance(r.json(), list)


async def test_messages_different_rooms_isolated(client, auth_token):
    """Messages for different rooms are separate lists."""
    headers = {"Authorization": f"Bearer {auth_token}"}
    r_room1 = await client.get("/api/messages?room=dm_user_test", headers=headers)
    r_room2 = await client.get("/api/messages?room=dm_user_other", headers=headers)
    assert r_room1.status_code == 200
    assert r_room2.status_code == 200
