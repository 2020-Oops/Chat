---
name: console-client
description: Best practices for building a Python console (CLI) client for the chat server — the second required client per project requirements. Covers login, WebSocket, commands (/name, /exit, /history), and message display.
---

# Console Client Skill

## Project Context
Required by the assignment: "Реалізувати сервер та два клієнти."
This is the second client — a Python terminal/console chat client.
Lives in `client-console/` directory.
Stack: Python `websockets` library + `httpx` for REST calls.

---

## File Structure
```
client-console/
├── main.py            # Entry point: login + chat loop
├── requirements.txt   # websockets, httpx
└── README.md
```

## Requirements
```
websockets>=12.0
httpx>=0.27.0
```

---

## Full Implementation Pattern

```python
# client-console/main.py
import asyncio
import json
import httpx
import websockets
from datetime import datetime

API_URL = "http://localhost:8000"
WS_URL  = "ws://localhost:8000"


async def login(username: str, password: str) -> str:
    """Returns JWT access token."""
    async with httpx.AsyncClient() as client:
        r = await client.post(f"{API_URL}/api/login",
                              data={"username": username, "password": password})
        if r.status_code != 200:
            print("❌ Login failed:", r.json().get("detail", "Unknown error"))
            raise SystemExit(1)
        return r.json()["access_token"]


async def register(username: str, password: str):
    async with httpx.AsyncClient() as client:
        r = await client.post(f"{API_URL}/api/register",
                              json={"username": username, "password": password})
        if r.status_code == 201:
            print(f"✅ Registered as '{username}'")
        elif r.status_code == 400:
            print("ℹ️  Username taken, trying to login...")
        else:
            print("❌ Register error:", r.text)


async def receive_messages(ws):
    """Listen for incoming messages and print them."""
    async for raw in ws:
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            continue

        if data["type"] == "message":
            sender = data["sender"]["username"]
            content = data["content"]
            ts = data.get("timestamp", "")[:16].replace("T", " ")
            print(f"\r[{ts}] {sender}: {content}")

        elif data["type"] == "system":
            print(f"\r*** {data['content']} ***")

        elif data["type"] == "history":
            print("\r--- History ---")
            for m in data.get("messages", []):
                ts = m.get("timestamp", "")[:16].replace("T", " ")
                print(f"  [{ts}] {m['sender']['username']}: {m['content']}")
            print("--- End ---")


async def send_messages(ws, username: str):
    """Read stdin and send messages. Handle commands."""
    loop = asyncio.get_event_loop()
    while True:
        line = await loop.run_in_executor(None, input, f"{username}> ")
        line = line.strip()
        if not line:
            continue
        if line == "/exit":
            print("Goodbye!")
            await ws.close()
            break
        await ws.send(json.dumps({"content": line}))
        # /name, /history are handled by the server


async def chat(token: str, room: str, username: str):
    url = f"{WS_URL}/ws/{room}?token={token}"
    print(f"🔗 Connecting to #{room}...")
    async with websockets.connect(url) as ws:
        print(f"✅ Connected to #{room}. Type /exit to quit, /history for history, /name <new> to rename.")
        await asyncio.gather(
            receive_messages(ws),
            send_messages(ws, username),
            return_exceptions=True,
        )


async def main():
    print("=== Console Chat Client ===")
    username = input("Username: ").strip()
    password = input("Password: ").strip()
    room     = input("Room (default: general): ").strip() or "general"

    await register(username, password)
    token = await login(username, password)
    await chat(token, room, username)


if __name__ == "__main__":
    asyncio.run(main())
```

---

## Running the Console Client
```bash
cd client-console
pip install websockets httpx
python main.py
```

---

## Supported Commands
| Command | What it does |
|---|---|
| `/name <нік>` | Змінити нікнейм (обробляє сервер) |
| `/history` | Показати останні 50 повідомлень |
| `/exit` | Відключитись від чату |
| `/pm <user> <text>` | (опціонально) Приватне повідомлення |

---

## Do NOT
- Do NOT use `input()` directly inside `async` — always wrap in `run_in_executor`
- Do NOT store token in file — keep in memory only during session
- Do NOT ignore `websockets.exceptions.ConnectionClosed` — catch it gracefully
