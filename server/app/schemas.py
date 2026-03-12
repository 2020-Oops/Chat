from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


# ── User schemas ─────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    username: str
    password: str
    display_name: Optional[str] = None


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    display_name: Optional[str] = None
    created_at: datetime


# ── Group schemas ────────────────────────────────────────────────────────────

class GroupCreate(BaseModel):
    name: str

class GroupOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    created_at: datetime
    creator_id: int

class GroupMemberOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    group_id: int
    user_id: int
    joined_at: datetime
    user: UserOut


# ── Auth schemas ─────────────────────────────────────────────────────────────

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    username: Optional[str] = None


# ── Message schemas ───────────────────────────────────────────────────────────

class MessageCreate(BaseModel):
    content: str
    room: Optional[str] = None
    group_id: Optional[int] = None
    recipient_username: Optional[str] = None


class MessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    content: str
    room: Optional[str] = None
    group_id: Optional[int] = None
    recipient_id: Optional[int] = None
    timestamp: datetime
    sender: UserOut
