---
name: docker-cloudrun
description: Best practices for Dockerizing the FastAPI server and deploying to Google Cloud Run — Dockerfile, .dockerignore, gcloud commands, env vars, WebSocket timeout
---

# Docker + Cloud Run Skill

## Project Context
Server: `server/` — FastAPI + uvicorn.
Target: **Google Cloud Run** (serverless containers, auto-HTTPS, scales to zero).

---

## Dockerfile (production-ready)

```dockerfile
# server/Dockerfile
FROM python:3.12-slim

WORKDIR /app

# Install deps first — Docker caches this layer if requirements.txt unchanged
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy app code
COPY . .

# Flush Python logs immediately (critical for Cloud Logging)
ENV PYTHONUNBUFFERED=1

# Cloud Run injects PORT (default 8080)
ENV PORT=8080

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
```

---

## .dockerignore
```
__pycache__/
*.pyc
*.pyo
.env
chat.db
logs/
tests/
.pytest_cache/
pytest.ini
*.egg-info/
```

> `.env` is excluded — secrets are passed as Cloud Run env vars instead.

---

## One-Time Setup (gcloud CLI)

```bash
# Install gcloud CLI:  https://cloud.google.com/sdk/docs/install-sdk#windows

# Authenticate
gcloud auth login

# Set your project
gcloud config set project YOUR_PROJECT_ID

# Enable required APIs
gcloud services enable run.googleapis.com cloudbuild.googleapis.com sqladmin.googleapis.com
```

---

## Build and Deploy

```bash
cd server/

# Build image via Cloud Build (no local Docker needed)
gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/chat-server

# Deploy to Cloud Run
gcloud run deploy chat-server \
  --image gcr.io/YOUR_PROJECT_ID/chat-server \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --timeout=3600 \
  --set-env-vars="SECRET_KEY=your-very-long-secret" \
  --set-env-vars="ALGORITHM=HS256" \
  --set-env-vars="ACCESS_TOKEN_EXPIRE_MINUTES=1440" \
  --set-env-vars="DATABASE_URL=postgresql+asyncpg://chatuser:PASS@/chatdb?host=/cloudsql/PROJECT:REGION:chat-db" \
  --set-env-vars='CORS_ORIGINS=["http://localhost:3000","http://localhost:5173"]' \
  --add-cloudsql-instances=YOUR_PROJECT:us-central1:chat-db
```

After deploy, note the URL:
```
https://chat-server-xxxxxxxx-uc.a.run.app
```

---

## After Deploy — Update Clients

**Browser client** (`frontend/app.js`):
```js
const API = 'https://chat-server-xxxxxxxx-uc.a.run.app';
const WS_HOST = 'chat-server-xxxxxxxx-uc.a.run.app';
// WS_PROTO = 'wss:' automatically because page is HTTPS
```

**Update CORS on server** — add Cloud Run client URL to `.env` and redeploy:
```
CORS_ORIGINS=["https://your-client.vercel.app","http://localhost:3000"]
```

---

## Key Cloud Run Parameters

| Flag | Value | Why |
|---|---|---|
| `--timeout=3600` | 1 hour | WebSocket connections need long timeout |
| `--allow-unauthenticated` | — | Public access for the chat API |
| `--add-cloudsql-instances` | PROJECT:REGION:INSTANCE | Unix socket to Cloud SQL |
| `--region` | `us-central1` | Closest to Europe is `europe-west1` |

---

## Check Logs After Deploy

```bash
gcloud run logs tail chat-server --region us-central1
```

---

## Do NOT
- Do NOT put `.env` in the Docker image (secrets leak)
- Do NOT use `--timeout` less than 300 for WebSocket apps
- Do NOT forget `--add-cloudsql-instances` when using Cloud SQL
- Do NOT use `python:3.12-alpine` — `asyncpg` has binary deps that need glibc
