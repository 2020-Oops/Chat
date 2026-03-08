---
name: fastapi
description: Best practices and patterns for FastAPI backend development in this project (routing, Pydantic schemas, dependency injection, async SQLAlchemy, CORS, JWT auth)
---

# FastAPI Skill

## Project Context
This skill applies to the FastAPI server located in `backend/` (or `server/` after separation).
Stack: FastAPI + SQLAlchemy async + SQLite/aiosqlite + JWT (python-jose) + bcrypt.

---

## Project Structure (Best Practice)

```
server/
├── app/
│   ├── main.py          # FastAPI instance, middleware, routers, lifespan
│   ├── config.py        # Pydantic Settings (reads .env)
│   ├── database.py      # async engine, SessionLocal, get_db dependency
│   ├── models.py        # SQLAlchemy ORM models
│   ├── schemas.py       # Pydantic request/response models
│   ├── auth.py          # JWT + bcrypt logic
│   └── routers/
│       ├── users.py     # /api/register, /api/login, /api/me, /api/users
│       └── messages.py  # /api/messages
├── tests/               # pytest tests (see pytest skill)
├── .env
└── requirements.txt
```

---

## Key Patterns

### 1. Router prefix and tags
```python
router = APIRouter(prefix="/api", tags=["users"])
```

### 2. Pydantic schemas — always separate from ORM models
```python
class UserOut(BaseModel):
    id: int
    username: str
    model_config = ConfigDict(from_attributes=True)
```

### 3. Dependency injection for DB session
```python
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with SessionLocal() as session:
        yield session
```
Always use `Depends(get_db)` in route functions — never create sessions manually.

### 4. CORS — explicit origins after client separation
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Vite dev
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```
Avoid `allow_origins=["*"]` in production.

### 5. Lifespan for DB init
```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield

app = FastAPI(lifespan=lifespan)
```

### 6. HTTP status codes
- `201 Created` for POST /register
- `401 Unauthorized` for bad credentials
- `400 Bad Request` for duplicate username
- `404 Not Found` for missing resources

### 7. Environment config via Pydantic Settings
```python
# config.py
class Settings(BaseSettings):
    DATABASE_URL: str
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440
    model_config = SettingsConfigDict(env_file=".env")

settings = Settings()
```

---

## Do NOT
- Do NOT put business logic inside route functions — move to `services/` or `auth.py`
- Do NOT serve frontend static files from the API server (after separation)
- Do NOT hardcode `SECRET_KEY` — always read from `.env`
- Do NOT use synchronous SQLAlchemy sessions with async routes

---

## Useful Commands
```bash
# Run server (from server/ folder, venv activated)
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# View auto-generated API docs
http://localhost:8000/docs
```
