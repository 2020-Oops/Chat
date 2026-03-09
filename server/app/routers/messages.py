from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import get_current_user
from app.database import get_db
from app.models import Message, User
from app.schemas import MessageOut

router = APIRouter(prefix="/api", tags=["messages"])


@router.get("/messages", response_model=list[MessageOut])
async def get_messages(
    room: str = Query(...),
    limit: int = Query(50, ge=1, le=200),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the last N messages from a room, ordered oldest→newest."""
    result = await db.execute(
        select(Message)
        .where(Message.room == room)
        .options(selectinload(Message.sender))
        .order_by(Message.timestamp.desc())
        .limit(limit)
    )
    messages = result.scalars().all()
    return list(reversed(messages))
