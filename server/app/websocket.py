import json
import os
from datetime import datetime, timezone

from fastapi import WebSocket, WebSocketDisconnect
from sqlalchemy.orm import selectinload
from sqlalchemy import select

from app.auth import get_current_user_ws
from app.database import AsyncSessionLocal
from app.models import Group, GroupMember, Message


async def log_to_file(room: str, username: str, content: str) -> None:
    """Append a message to logs/{room}.log (required by assignment)."""
    os.makedirs("logs", exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {username}: {content}\n"
    try:
        import aiofiles
        async with aiofiles.open(f"logs/{room}.log", mode="a", encoding="utf-8") as f:
            await f.write(line)
    except ImportError:
        # Fallback to sync if aiofiles not installed yet
        with open(f"logs/{room}.log", mode="a", encoding="utf-8") as f:
            f.write(line)


class ConnectionManager:
    """Manages active WebSocket connections grouped by room."""

    def __init__(self):
        # room -> list of (websocket, username)
        self._rooms: dict[str, list[tuple[WebSocket, str]]] = {}

    def _get_room(self, room: str) -> list[tuple[WebSocket, str]]:
        return self._rooms.setdefault(room, [])

    async def connect(self, websocket: WebSocket, room: str, username: str):
        await websocket.accept()
        self._get_room(room).append((websocket, username))

    def disconnect(self, websocket: WebSocket, room: str):
        room_connections = self._get_room(room)
        self._rooms[room] = [
            (ws, u) for ws, u in room_connections if ws is not websocket
        ]

    async def broadcast(self, room: str, payload: dict):
        """Send a JSON payload to all connections in a room."""
        dead = []
        for ws, username in self._get_room(room):
            try:
                await ws.send_text(json.dumps(payload, ensure_ascii=False, default=str))
            except Exception:
                dead.append(ws)
        # Clean up dead connections
        if dead:
            self._rooms[room] = [
                (ws, u) for ws, u in self._get_room(room) if ws not in dead
            ]

    def online_users(self, room: str) -> list[str]:
        return [u for _, u in self._get_room(room)]

    async def send_to_user(self, username: str, payload: dict):
        """Send a JSON payload to a specific user across all their connections."""
        dead = []
        for room, conns in self._rooms.items():
            for ws, u in conns:
                if u == username:
                    try:
                        await ws.send_text(json.dumps(payload, ensure_ascii=False, default=str))
                    except Exception:
                        dead.append((room, ws))
        # Clean up dead connections
        for room, ws in dead:
            self.disconnect(ws, room)


manager = ConnectionManager()

def _parse_group_id(room: str) -> int | None:
    if not room.startswith("group_"):
        return None
    suffix = room.split("_", 1)[1]
    if not suffix.isdigit():
        return None
    return int(suffix)


async def websocket_endpoint(websocket: WebSocket, room: str, token: str):
    async with AsyncSessionLocal() as db:
        user = await get_current_user_ws(token, db)
        if user is None:
            await websocket.close(code=4001, reason="Unauthorized")
            return

        group_id_from_room = _parse_group_id(room)
        if room.startswith("group_") and group_id_from_room is None:
            await websocket.close(code=4400, reason="Invalid group room")
            return

        if group_id_from_room is not None:
            group = await db.get(Group, group_id_from_room)
            if not group:
                await websocket.close(code=4404, reason="Group not found")
                return

            membership = await db.execute(
                select(GroupMember).where(
                    GroupMember.group_id == group_id_from_room,
                    GroupMember.user_id == user.id,
                )
            )
            if membership.scalar_one_or_none() is None:
                await websocket.close(code=4403, reason="Forbidden")
                return

        await manager.connect(websocket, room, user.username)

        # Notify room that user joined
        await manager.broadcast(room, {
            "type": "system",
            "content": f"{user.username} joined the room",
            "room": room,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "online": manager.online_users(room),
        })

        try:
            while True:
                raw = await websocket.receive_text()
                data = json.loads(raw)
                content = data.get("content", "").strip()
                group_id = data.get("group_id")
                recipient_id = data.get("recipient_id")

                if group_id_from_room is not None:
                    group_id = group_id_from_room
                    recipient_id = None
                
                if not content:
                    continue

                # Persist message to DB
                async with AsyncSessionLocal() as save_db:
                    msg = Message(
                        content=content,
                        room=room,
                        group_id=group_id,
                        recipient_id=recipient_id,
                        sender_id=user.id,
                    )
                    save_db.add(msg)
                    await save_db.commit()
                    await save_db.refresh(msg)

                    # Reload with sender relationship
                    result = await save_db.execute(
                        select(Message)
                        .where(Message.id == msg.id)
                        .options(selectinload(Message.sender))
                    )
                    msg = result.scalar_one()

                # Broadcast to room
                await manager.broadcast(room, {
                    "type": "message",
                    "id": msg.id,
                    "content": msg.content,
                    "room": msg.room,
                    "group_id": msg.group_id,
                    "recipient_id": msg.recipient_id,
                    "timestamp": msg.timestamp.isoformat(),
                    "sender": {
                        "id": msg.sender.id,
                        "username": msg.sender.username,
                        "display_name": msg.sender.display_name,
                    },
                    "online": manager.online_users(room),
                })

                # Log to file
                await log_to_file(room, user.username, content)

        except WebSocketDisconnect:
            manager.disconnect(websocket, room)
            await manager.broadcast(room, {
                "type": "system",
                "content": f"{user.username} left the room",
                "room": room,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "online": manager.online_users(room),
            })
