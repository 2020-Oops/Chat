from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware

from app.database import init_db
from app.routers import users, messages
from app.websocket import websocket_endpoint
from app.config import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("SERVERSIDE STARTUP: chat-server is starting up...")
    await init_db()
    yield


app = FastAPI(
    title="Chat API",
    description="Real-time chat with FastAPI + WebSocket + SQLite/PostgreSQL",
    version="1.0.0",
    lifespan=lifespan,
)

# ── CORS ──────────────────────────────────────────────────────────────────────
# Forced explicit CORS for the frontend origin
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://chat-frontend-154708099195.us-central1.run.app"],
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
