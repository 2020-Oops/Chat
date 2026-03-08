---
name: websocket
description: Best practices for WebSocket real-time chat in this project — connection management, rooms, authentication via token query param, chat commands (/name, /exit, /history), message persistence
---

# WebSocket Skill

## Project Context
WebSocket endpoint: `ws://localhost:8000/ws/{room}?token=<JWT>`
Implementation: `backend/app/websocket.py`
Uses FastAPI's native `WebSocket` class + asyncio.

---

## Architecture Pattern: ConnectionManager

```python
class ConnectionManager:
    def __init__(self):
        # room_name -> list of (WebSocket, username)
        self.rooms: dict[str, list[tuple[WebSocket, str]]] = {}

    async def connect(self, ws: WebSocket, room: str, username: str):
        await ws.accept()
        self.rooms.setdefault(room, []).append((ws, username))

    def disconnect(self, ws: WebSocket, room: str):
        self.rooms[room] = [(w, u) for w, u in self.rooms.get(room, []) if w != ws]

    async def broadcast(self, room: str, message: dict):
        for ws, _ in self.rooms.get(room, []):
            await ws.send_json(message)

    def online_users(self, room: str) -> list[str]:
        return [u for _, u in self.rooms.get(room, [])]

manager = ConnectionManager()
```

---

## Authentication on Connect
```python
@app.websocket("/ws/{room}")
async def ws_route(websocket: WebSocket, room: str, token: str):
    user = await get_current_user_ws(token, db)
    if not user:
        await websocket.close(code=4001)  # custom: unauthorized
        return
    await manager.connect(websocket, room, user.username)
```

---

## Message Format (JSON protocol)
```json
// Вхідне (від клієнта до сервера)
{ "content": "Привіт!" }
{ "content": "/name Новийнік" }
{ "content": "/history" }
{ "content": "/exit" }

// Вихідне (від сервера до клієнта)
{ "type": "message", "sender": {"username": "alex"}, "content": "Привіт!", "timestamp": "..." }
{ "type": "system",  "content": "alex joined #general", "online": ["alex", "bob"] }
{ "type": "history", "messages": [...] }
```

---

## Chat Commands Implementation

```python
async def handle_message(ws, user, room, content, db):
    content = content.strip()

    if content == "/exit":
        await ws.close()
        return

    if content.startswith("/name "):
        new_name = content[6:].strip()
        # update user.username in DB or session
        await manager.broadcast(room, {
            "type": "system",
            "content": f"{user.username} renamed to {new_name}",
            "online": manager.online_users(room)
        })
        user.username = new_name
        return

    if content == "/history":
        msgs = await get_last_messages(room, limit=50, db=db)
        await ws.send_json({"type": "history", "messages": msgs})
        return

    # Regular message
    msg = await save_message(room, user.id, content, db)
    await manager.broadcast(room, {
        "type": "message",
        "sender": {"username": user.username},
        "content": content,
        "timestamp": msg.timestamp.isoformat(),
        "online": manager.online_users(room)
    })
```

---

## Message Persistence to File
Per requirements, save messages to a log file in addition to SQLite:
```python
import aiofiles
from datetime import datetime

async def log_to_file(room: str, username: str, content: str):
    path = f"logs/{room}.log"
    line = f"[{datetime.utcnow().isoformat()}] {username}: {content}\n"
    async with aiofiles.open(path, mode="a", encoding="utf-8") as f:
        await f.write(line)
```
Call `await log_to_file(room, user.username, content)` after saving to DB.

---

## Reconnection (Client Side)
```js
socket.onclose = () => {
    setTimeout(() => connect(currentRoom), reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, 30000);
};
```

---

## Do NOT
- Do NOT block the event loop — use `await` for all I/O
- Do NOT forget to `manager.disconnect()` in try/finally
- Do NOT send unformatted strings — always JSON
- Do NOT skip authentication before `websocket.accept()`
