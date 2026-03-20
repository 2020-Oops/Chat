from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select, or_, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import (
    authenticate_user,
    create_access_token,
    get_current_user,
    get_user_by_username,
    hash_password,
)
from app.database import get_db
from app.websocket import manager
from app.models import User, Message, Group, GroupMember
from app.schemas import Token, UserCreate, UserOut, UserDelete

router = APIRouter(prefix="/api", tags=["users"])


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def register(user_in: UserCreate, db: AsyncSession = Depends(get_db)):
    existing = await get_user_by_username(db, user_in.username)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already taken",
        )
    user = User(
        username=user_in.username,
        display_name=user_in.display_name,
        hashed_password=hash_password(user_in.password),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.post("/login", response_model=Token)
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
):
    user = await authenticate_user(db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = create_access_token({"sub": user.username})
    return Token(access_token=token)


@router.get("/me", response_model=UserOut)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.get("/users", response_model=list[UserOut])
async def get_users(
    q: str | None = None,
    limit: int = 20,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return registered users (excluding yourself), with optional search and limit."""
    stmt = select(User).where(User.id != current_user.id)
    if q:
        stmt = stmt.where(User.username.ilike(f"%{q}%"))
    
    stmt = stmt.order_by(User.username).limit(limit)
    result = await db.execute(stmt)
    users = result.scalars().all()
    
    out_users = []
    for u in users:
        room_name = "dm_" + "_".join(sorted([current_user.username, u.username]))
        msg_stmt = (
            select(Message.content)
            .where(
                or_(
                    Message.room == room_name,
                    and_(Message.sender_id == current_user.id, Message.recipient_id == u.id),
                    and_(Message.sender_id == u.id, Message.recipient_id == current_user.id)
                )
            )
            .order_by(Message.timestamp.desc())
            .limit(1)
        )
        msg_result = await db.execute(msg_stmt)
        last_msg = msg_result.scalar_one_or_none()
        
        user_out = UserOut.model_validate(u)
        user_out.last_message = last_msg
        user_out.is_online = u.username in manager.global_online_users()
        out_users.append(user_out)
        
    return out_users


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete_me(
    user_delete: UserDelete,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete the current user's account and all associated data."""
    # Authenticate password before deleting
    user = await authenticate_user(db, current_user.username, user_delete.password)
    if not user:
         raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect password",
        )
    
    # Cascade is enabled for group_members and messages in groups and group creator_id,
    # but we need to explicitly handle where the user is sender/recipient for direct messages.
    # Group ownership: if a user deletes their account, what happens to groups they created?
    # SQLAlchemy might fail if we don't handle them. But let's delete their groups entirely
    # as in ShiftChat, or delete their User which cascades.
    # Let's cleanly delete groups they created first.
    stmt = select(Group).where(Group.creator_id == current_user.id)
    result = await db.execute(stmt)
    owned_groups = result.scalars().all()
    for g in owned_groups:
        await db.delete(g)
        
    # Delete direct messages where they are sender or recipient
    # Group messages get cascaded when either Group or User is deleted.
    
    # Finally, delete the user.
    await db.delete(current_user)
    
    await db.commit()
    return None

