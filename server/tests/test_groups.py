import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models import Group, GroupMember


@pytest.mark.asyncio
async def test_create_group(authenticated_client: AsyncClient, db_session: AsyncSession):
    client, token = authenticated_client
    
    response = await client.post(
        "/api/groups",
        json={"name": "My New Group"},
        headers={"Authorization": f"Bearer {token}"}
    )
    
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "My New Group"
    assert "id" in data
    
    # db verification
    group = await db_session.get(Group, data["id"])
    assert group is not None
    assert group.name == "My New Group"


@pytest.mark.asyncio
async def test_create_duplicate_group(authenticated_client: AsyncClient, db_session: AsyncSession):
    client, token = authenticated_client
    
    # Create first time
    await client.post(
        "/api/groups",
        json={"name": "Duplicate Group"},
        headers={"Authorization": f"Bearer {token}"}
    )
    
    # Second try
    response = await client.post(
        "/api/groups",
        json={"name": "Duplicate Group"},
        headers={"Authorization": f"Bearer {token}"}
    )
    
    assert response.status_code == 400
    assert "already exists" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_get_my_groups(client: AsyncClient, create_test_user, db_session: AsyncSession):
    # Setup two users
    user1, token1 = await create_test_user("groupcreator", "pass", "Creator")
    user2, token2 = await create_test_user("groupmember", "pass", "Member")
    
    # User 1 creates group
    response = await client.post(
        "/api/groups",
        json={"name": "Test Fetch Group"},
        headers={"Authorization": f"Bearer {token1}"}
    )
    group_id = response.json()["id"]
    
    # Get user1 groups -> should see it
    resp1 = await client.get("/api/groups", headers={"Authorization": f"Bearer {token1}"})
    assert resp1.status_code == 200
    assert len(resp1.json()) >= 1
    assert any(g["id"] == group_id for g in resp1.json())
    
    # Get user2 groups -> should not see it
    resp2 = await client.get("/api/groups", headers={"Authorization": f"Bearer {token2}"})
    assert resp2.status_code == 200
    assert not any(g["id"] == group_id for g in resp2.json())


@pytest.mark.asyncio
async def test_add_and_remove_member(client: AsyncClient, create_test_user, db_session: AsyncSession):
    user1, token1 = await create_test_user("admin", "pass")
    user2, token2 = await create_test_user("target_user", "pass")
    
    # Admin creates group
    resp = await client.post(
        "/api/groups",
        json={"name": "Member Test Group"},
        headers={"Authorization": f"Bearer {token1}"}
    )
    group_id = resp.json()["id"]
    
    # Admin adds Target User
    add_resp = await client.post(
        f"/api/groups/{group_id}/members",
        params={"username": "target_user"},
        headers={"Authorization": f"Bearer {token1}"}
    )
    assert add_resp.status_code == 201
    assert add_resp.json()["user"]["username"] == "target_user"
    
    # Verify via get members
    members_resp = await client.get(
        f"/api/groups/{group_id}/members",
        headers={"Authorization": f"Bearer {token1}"}
    )
    assert len(members_resp.json()) == 2  # creator + target_user
    
    # Target User fetches their groups
    target_groups = await client.get("/api/groups", headers={"Authorization": f"Bearer {token2}"})
    assert any(g["id"] == group_id for g in target_groups.json())
    
    # Admin removes Target User
    remove_resp = await client.delete(
        f"/api/groups/{group_id}/members/{user2['id']}",
        headers={"Authorization": f"Bearer {token1}"}
    )
    assert remove_resp.status_code == 204
    
    # Verify via get members
    members_after = await client.get(
        f"/api/groups/{group_id}/members",
        headers={"Authorization": f"Bearer {token1}"}
    )
    assert len(members_after.json()) == 1
    
@pytest.mark.asyncio
async def test_delete_group(authenticated_client: AsyncClient, db_session: AsyncSession):
    client, token = authenticated_client
    
    resp = await client.post(
        "/api/groups",
        json={"name": "To Be Deleted"},
        headers={"Authorization": f"Bearer {token}"}
    )
    group_id = resp.json()["id"]
    
    delete_resp = await client.delete(
        f"/api/groups/{group_id}",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert delete_resp.status_code == 204
    
    # Verify from DB
    group = await db_session.get(Group, group_id)
    assert group is None
