import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_delete_user(client: AsyncClient, create_test_user):
    # Setup test user
    user_data, token = await create_test_user("test_user_to_delete", "testpassword")

    # Try deleting with wrong password
    response = await client.request(
        "DELETE",
        "/api/me",
        json={"password": "wrongpassword"},
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 401

    # Try deleting with correct password
    response = await client.request(
        "DELETE",
        "/api/me",
        json={"password": "testpassword"},
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 204

    # Verify user is deleted
    response = await client.get(
        "/api/me",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 401

