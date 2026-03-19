from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, or_, and_, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import get_current_user
from app.database import get_db
from app.models import Group, GroupMember, Message, User
from app.schemas import MessageOut

router = APIRouter(prefix="/api", tags=["messages"])

def _parse_group_room(room: str | None) -> int | None:
    if not room or not room.startswith("group_"):
        return None
    suffix = room.split("_", 1)[1]
    if not suffix.isdigit():
        return None
    return int(suffix)


@router.get("/messages", response_model=list[MessageOut])
async def get_messages(
    room: str | None = Query(None),
    group_id: int | None = Query(None),
    user_id: int | None = Query(None, description="ID of the user for DMs"),
    limit: int = Query(50, ge=1, le=200),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the last N messages based on context, ordered oldest→newest."""
    if group_id is not None and user_id is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Use only one of group_id or user_id",
        )

    if group_id is None:
        group_id = _parse_group_room(room)

    query = select(Message).options(selectinload(Message.sender))

    if group_id:
        # Group messages
        group = await db.get(Group, group_id)
        if not group:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")

        membership = await db.execute(
            select(GroupMember).where(
                GroupMember.group_id == group_id,
                GroupMember.user_id == current_user.id,
            )
        )
        if membership.scalar_one_or_none() is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not a member of this group",
            )

        query = query.where(
            or_(
                Message.group_id == group_id,
                Message.room == f"group_{group_id}",
            )
        )
    elif user_id:
        # Direct messages between current_user and user_id
        target_user = await db.get(User, user_id)
        if not target_user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        query = query.where(
            or_(
                and_(Message.sender_id == current_user.id, Message.recipient_id == user_id),
                and_(Message.sender_id == user_id, Message.recipient_id == current_user.id)
            )
        )
    else:
        # Legacy room, defaults to 'general' if everything is missing
        target_room = room if room else "general"
        query = query.where(Message.room == target_room)

    result = await db.execute(
        query.order_by(Message.timestamp.desc()).limit(limit)
    )
    messages = result.scalars().all()
    return list(reversed(messages))

@router.delete("/messages", status_code=status.HTTP_204_NO_CONTENT)
async def delete_chat(
    room: str = Query(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete all messages in a specific room (e.g., DM room)."""
    if room.startswith("dm_"):
        # Build the expected room name from the current user
        # and verify it matches — prevents user "vi" deleting "dm_vitalik_bob"
        parts = room[3:]  # remove 'dm_' prefix
        # The room is dm_{sorted_user1}_{sorted_user2}
        # We need to verify the current user is one of the two participants
        # Safe approach: reconstruct all possible DM rooms for this user
        # and check if the requested room matches
        me = current_user.username
        if not (
            room == "dm_" + "_".join(sorted([me, parts.replace(me, "", 1).strip("_")]))
            and me in parts
        ):
            raise HTTPException(status_code=403, detail="Not your DM room")
            
    await db.execute(delete(Message).where(Message.room == room))
    await db.commit()
    return
