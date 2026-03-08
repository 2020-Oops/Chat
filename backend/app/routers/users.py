from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import (
    authenticate_user,
    create_access_token,
    get_current_user,
    get_user_by_username,
    hash_password,
)
from app.database import get_db
from app.models import User
from app.schemas import Token, UserCreate, UserOut

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
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return all registered users (excluding yourself)."""
    result = await db.execute(
        select(User).where(User.id != current_user.id).order_by(User.username)
    )
    return result.scalars().all()
