from datetime import datetime

from pydantic import BaseModel, ConfigDict


# ── User schemas ─────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    username: str
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    created_at: datetime


# ── Auth schemas ─────────────────────────────────────────────────────────────

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    username: str | None = None


# ── Message schemas ───────────────────────────────────────────────────────────

class MessageCreate(BaseModel):
    content: str
    room: str


class MessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    content: str
    room: str
    timestamp: datetime
    sender: UserOut
