import json
from datetime import datetime, timezone

from fastapi import WebSocket, WebSocketDisconnect
from sqlalchemy.orm import selectinload
from sqlalchemy import select

from app.auth import get_current_user_ws
from app.database import AsyncSessionLocal
from app.models import Message


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


manager = ConnectionManager()


async def websocket_endpoint(websocket: WebSocket, room: str, token: str):
    async with AsyncSessionLocal() as db:
        user = await get_current_user_ws(token, db)
        if user is None:
            await websocket.close(code=4001, reason="Unauthorized")
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
                if not content:
                    continue

                # Persist message to DB
                async with AsyncSessionLocal() as save_db:
                    msg = Message(
                        content=content,
                        room=room,
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
                    "timestamp": msg.timestamp.isoformat(),
                    "sender": {
                        "id": msg.sender.id,
                        "username": msg.sender.username,
                    },
                    "online": manager.online_users(room),
                })

        except WebSocketDisconnect:
            manager.disconnect(websocket, room)
            await manager.broadcast(room, {
                "type": "system",
                "content": f"{user.username} left the room",
                "room": room,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "online": manager.online_users(room),
            })
