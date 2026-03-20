from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    display_name: Mapped[str | None] = mapped_column(String(64), nullable=True) # New field
    hashed_password: Mapped[str] = mapped_column(String(128), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    messages_sent: Mapped[list["Message"]] = relationship("Message", back_populates="sender", foreign_keys="Message.sender_id")
    messages_received: Mapped[list["Message"]] = relationship("Message", back_populates="recipient", foreign_keys="Message.recipient_id")
    groups_created: Mapped[list["Group"]] = relationship("Group", back_populates="creator")
    group_memberships: Mapped[list["GroupMember"]] = relationship("GroupMember", back_populates="user")


class Group(Base):
    __tablename__ = "groups"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(128), index=True, unique=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    creator_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)

    creator: Mapped["User"] = relationship("User", back_populates="groups_created")
    members: Mapped[list["GroupMember"]] = relationship("GroupMember", back_populates="group", cascade="all, delete-orphan")
    messages: Mapped[list["Message"]] = relationship("Message", back_populates="group", cascade="all, delete-orphan")


class GroupMember(Base):
    __tablename__ = "group_members"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    group_id: Mapped[int] = mapped_column(ForeignKey("groups.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    group: Mapped["Group"] = relationship("Group", back_populates="members")
    user: Mapped["User"] = relationship("User", back_populates="group_memberships")

    __table_args__ = (UniqueConstraint('group_id', 'user_id', name='uq_group_user'),)


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    
    # Message Status
    status: Mapped[str] = mapped_column(String(20), default="SENT", nullable=False, index=True)
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    
    # Context (either to a Group or a User)
    group_id: Mapped[int | None] = mapped_column(ForeignKey("groups.id", ondelete="CASCADE"), nullable=True, index=True)
    recipient_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    
    # Legacy room string for backwards compatibility (can be dropped later)
    room: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)

    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    sender_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)

    sender: Mapped["User"] = relationship("User", back_populates="messages_sent", foreign_keys=[sender_id])
    recipient: Mapped["User"] = relationship("User", back_populates="messages_received", foreign_keys=[recipient_id])
    group: Mapped["Group"] = relationship("Group", back_populates="messages")
