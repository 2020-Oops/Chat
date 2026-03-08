from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from app.database import init_db
from app.routers import users, messages
from app.websocket import websocket_endpoint
import os


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(
    title="Chat API",
    description="Real-time chat with FastAPI + WebSocket + SQLite/PostgreSQL",
    version="1.0.0",
    lifespan=lifespan,
)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── REST Routers ──────────────────────────────────────────────────────────────
app.include_router(users.router)
app.include_router(messages.router)

# ── WebSocket ─────────────────────────────────────────────────────────────────
@app.websocket("/ws/{room}")
async def ws_route(websocket: WebSocket, room: str, token: str):
    await websocket_endpoint(websocket, room, token)

# ── Serve Frontend ────────────────────────────────────────────────────────────
FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "frontend")

if os.path.isdir(FRONTEND_DIR):
    app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")

    @app.get("/")
    async def serve_index():
        return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))

    @app.get("/chat")
    async def serve_chat():
        return FileResponse(os.path.join(FRONTEND_DIR, "chat.html"))
