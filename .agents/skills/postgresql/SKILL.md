---
name: postgresql
description: Best practices for PostgreSQL with asyncpg and SQLAlchemy in this project — connection pooling, Cloud SQL integration, switching from SQLite, migration tips
---

# PostgreSQL Skill

## Project Context
This skill applies when switching from SQLite (local dev) to PostgreSQL (Cloud SQL on Google Cloud Run).
Driver: **asyncpg**. ORM: **SQLAlchemy async**.

---

## Connection Strings

### Local dev (SQLite — default)
```env
DATABASE_URL=sqlite+aiosqlite:///./chat.db
```

### Local PostgreSQL (if installed)
```env
DATABASE_URL=postgresql+asyncpg://postgres:password@localhost:5432/chatdb
```

### Google Cloud SQL (Cloud Run via Unix socket)
```env
DATABASE_URL=postgresql+asyncpg://chatuser:PASSWORD@/chatdb?host=/cloudsql/PROJECT_ID:REGION:INSTANCE_NAME
```
Example:
```env
DATABASE_URL=postgresql+asyncpg://chatuser:MyPass123@/chatdb?host=/cloudsql/my-project:us-central1:chat-db
```

---

## Engine Configuration (database.py)

```python
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from app.config import settings

# Connection pooling — critical for PostgreSQL
engine = create_async_engine(
    settings.DATABASE_URL,
    pool_size=5,          # connections in pool
    max_overflow=10,      # extra connections during spikes
    pool_pre_ping=True,   # validate connections before use
    pool_recycle=300,     # recycle connections every 5 min
    echo=False,           # set True for SQL query logging
)

AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)
```

> For SQLite: `pool_size`, `max_overflow` etc. are ignored — safe to keep in code.

---

## Database Init (init_db)

```python
async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
```

Works for both SQLite and PostgreSQL.

---

## Cloud SQL Setup Commands

```bash
# 1. Create Cloud SQL PostgreSQL instance
gcloud sql instances create chat-db \
  --database-version=POSTGRES_15 \
  --tier=db-f1-micro \
  --region=us-central1

# 2. Create database and user
gcloud sql databases create chatdb --instance=chat-db
gcloud sql users create chatuser --instance=chat-db --password=YOUR_PASSWORD

# 3. Get connection name (for DATABASE_URL)
gcloud sql instances describe chat-db --format="value(connectionName)"
# Output: my-project:us-central1:chat-db
```

---

## Switching from SQLite to PostgreSQL

1. In `requirements.txt`: ensure `asyncpg==0.29.0` is uncommented
2. In `.env`: change `DATABASE_URL` to PostgreSQL string
3. In `database.py`: add `pool_size`, `pool_pre_ping` kwargs to `create_async_engine`
4. In `server/Dockerfile`: `asyncpg` will be installed automatically via `pip install -r requirements.txt`

**No changes needed** to models, routers, or schemas — SQLAlchemy abstracts the driver.

---

## Common Pitfalls

| Problem | Solution |
|---|---|
| `asyncpg` install fails on Windows | Requires C++ Build Tools — use Docker for prod |
| Connection timeout on Cloud Run cold start | Add `pool_pre_ping=True` |
| "too many connections" on PostgreSQL | Reduce `pool_size` or use PgBouncer |
| Unix socket not found | Ensure `--add-cloudsql-instances` flag in `gcloud run deploy` |

---

## Do NOT
- Do NOT hardcode DB credentials — always use `.env` / Cloud Run env vars
- Do NOT use `pool_size` > 5 on `db-f1-micro` (Cloud SQL micro has connection limits)
- Do NOT forget `--add-cloudsql-instances` when deploying to Cloud Run
