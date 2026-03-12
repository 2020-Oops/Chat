from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError

from app.auth import get_current_user
from app.database import get_db
from app.models import Group, GroupMember, User
from app.schemas import GroupCreate, GroupOut, GroupMemberOut
from app.websocket import manager

router = APIRouter(prefix="/api/groups", tags=["groups"])


@router.post("", response_model=GroupOut, status_code=status.HTTP_201_CREATED)
async def create_group(
    group_in: GroupCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new group. The creator is automatically added as a member."""
    existing_group = await db.execute(select(Group).where(Group.name == group_in.name))
    if existing_group.scalars().first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Group with this name already exists",
        )

    # 1. Create Group
    new_group = Group(name=group_in.name, creator_id=current_user.id)
    db.add(new_group)
    await db.commit()
    await db.refresh(new_group)

    # 2. Add creator as first member
    member = GroupMember(group_id=new_group.id, user_id=current_user.id)
    db.add(member)
    await db.commit()
    
    return new_group


@router.get("", response_model=list[GroupOut])
async def get_my_groups(
    q: str | None = None,
    limit: int = 20,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return groups the current user is a member of, with optional search."""
    stmt = (
        select(Group)
        .join(GroupMember)
        .where(GroupMember.user_id == current_user.id)
    )
    
    if q:
        stmt = stmt.where(Group.name.ilike(f"%{q}%"))
        
    stmt = stmt.order_by(Group.name).limit(limit)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.delete("/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_group(
    group_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a group (only the creator can delete it)."""
    group = await db.get(Group, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
        
    if group.creator_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="Only the group creator can delete this group"
        )
        
    await db.delete(group)
    await db.commit()
    return None


@router.get("/{group_id}/members", response_model=list[GroupMemberOut])
async def get_group_members(
    group_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get all members of a group."""
    # Verify group exists and current user is a member
    membership = await db.execute(
        select(GroupMember)
        .where(GroupMember.group_id == group_id, GroupMember.user_id == current_user.id)
    )
    if not membership.scalars().first():
        raise HTTPException(status_code=403, detail="You are not a member of this group")
        
    result = await db.execute(
        select(GroupMember).where(GroupMember.group_id == group_id)
    )
    members = result.scalars().all()
    # Let's load user details for each member conceptually (usually eager load in real app, but lazy works here if fast enough, better is selectinload)
    # We will manually fetch users to avoid detached instances issues
    for m in members:
        await db.refresh(m, ['user'])

    return members


@router.post("/{group_id}/members", response_model=GroupMemberOut, status_code=status.HTTP_201_CREATED)
async def add_member_to_group(
    group_id: int,
    username: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Add a user to the group by username."""
    # 1. Verify group exists and current user is a member
    membership = await db.execute(
        select(GroupMember)
        .where(GroupMember.group_id == group_id, GroupMember.user_id == current_user.id)
    )
    if not membership.scalars().first():
        raise HTTPException(status_code=403, detail="You are not a member of this group")

    # 2. Find user to add
    user_to_add = await db.execute(select(User).where(User.username == username))
    target_user = user_to_add.scalars().first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
        
    # 3. Add to group
    try:
        new_member = GroupMember(group_id=group_id, user_id=target_user.id)
        db.add(new_member)
        await db.commit()
        await db.refresh(new_member, ['user'])
        
        # 4. Notify user if they are online
        await manager.send_to_user(target_user.username, {
            "type": "group_joined",
            "group_id": group_id
        })
        
        return new_member
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=400, detail="User is already a member of this group")


@router.delete("/{group_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member_from_group(
    group_id: int,
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove a user from the group. Users can remove themselves, or the creator can remove anyone."""
    group = await db.get(Group, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
        
    is_creator = group.creator_id == current_user.id
    is_self = user_id == current_user.id
    
    if not (is_creator or is_self):
        raise HTTPException(status_code=403, detail="Not authorized to remove this member")
        
    if is_creator and is_self:
        raise HTTPException(status_code=400, detail="Creator cannot leave the group, delete the group instead")

    membership = await db.execute(
        select(GroupMember)
        .where(GroupMember.group_id == group_id, GroupMember.user_id == user_id)
    )
    target_membership = membership.scalars().first()
    
    if not target_membership:
        raise HTTPException(status_code=400, detail="User is not a member of this group")
        
    await db.delete(target_membership)
    await db.commit()
    return None
