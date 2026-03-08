# План розділення та доповнень: Сервер ↔ Клієнт

> Оновлено: після аналізу коду, вимог завдання та плану деплою на Google Cloud

---

## Поточний стан

Зараз сервер FastAPI робить три речі одночасно:
- роздає REST API (`/api/...`)
- підтримує WebSocket (`/ws/...`)
- **роздає фронтенд** як статичні файли (`/static/`, `/`, `/chat`)

**Ціль 1:** сервер — тільки API + WebSocket, клієнт — окремий процес  
**Ціль 2:** сервер задеплоєний на Google Cloud Run, клієнти підключаються з локального комп'ютера  
**Ціль 3:** виконати всі вимоги завдання (2 клієнти, команди, лог-файл, тести)

---

## ⚠️ Відомі проблеми — треба виправити при розділенні

### П1. Редиректи на `/chat` зламаються
**Файл:** `frontend/index.html`, рядки 61, 98, 127
```js
// Зараз: /chat — це маршрут FastAPI
window.location.href = '/chat';

// Після розділення — змінити на:
window.location.href = '/chat.html';
```

### П2. CSS підключений через FastAPI шлях `/static/`
**Файл:** `frontend/index.html`, рядок 8
```html
<!-- Зараз: -->
<link rel="stylesheet" href="/static/style.css" />

<!-- Після розділення — змінити на відносний шлях: -->
<link rel="stylesheet" href="./style.css" />
```
Перевірити те саме в `chat.html`.

### П3. CORS bug — `credentials=True` з `"*"` заборонено браузерами
**Файл:** `backend/app/main.py`
```python
# Зараз (не працює в продакшені):
allow_origins=["*"],
allow_credentials=True,

# Треба: явний список origins + читати з .env
allow_origins=settings.CORS_ORIGINS,  # список
allow_credentials=True,
```

### П4. Адреса API в `index.html` — захардкоджена порожня рядок
**Файл:** `frontend/index.html`, рядок 57
```js
const API = '';  // відносний шлях — тільки якщо client і server на одному домені
```
Після розділення і деплою на хмару: замінити на `https://...run.app`.

### П5. `app.js` — адреси WS і API також відносні
**Файл:** `frontend/app.js`, рядки 13-15
```js
const API = '';
const WS_PROTO = location.protocol === 'https:' ? 'wss:' : 'ws:';
const WS_HOST = location.host;
```
Після деплою серверу на Cloud Run:
```js
const API = 'https://chat-server-xxx.run.app';
const WS_HOST = 'chat-server-xxx.run.app';
// WS_PROTO вже визначається автоматично через location.protocol ✅
```

### П6. SQLite не працює в хмарі
Cloud Run має **ефемерну файлову систему** — при перезапуску `chat.db` зникає.  
**Рішення:** перейти на PostgreSQL (Cloud SQL).

### П7. Vite потребує конфігурації для двох HTML-файлів (multi-page)
За замовчуванням Vite — single-page. Треба явно вказати обидва entry points:
```js
// vite.config.js
import { resolve } from 'path'
export default {
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        chat: resolve(__dirname, 'chat.html'),
      }
    }
  }
}
```

### П8. WebSocket timeout на Cloud Run
Cloud Run за замовчуванням обриває запити через **5 хвилин**.  
При деплої треба встановити: `--timeout=3600` (1 година).  
Клієнт вже має автоперепідключення — цього достатньо.

---

## Фінальна архітектура після всіх змін

```
Локальний комп'ютер                    Google Cloud
──────────────────────────             ─────────────────────────────────
client/ (браузер, :5173)  ──HTTPS──►  Cloud Run: https://chat-xxx.run.app
                                              /api/*   (REST)
client-console/ (Python)  ──WSS──►          /ws/*    (WebSocket)
                                                     │
                                          Cloud SQL (PostgreSQL)

Локально для розробки:
client/* ──HTTP──► localhost:8000 ──► SQLite (chat.db)
```

---

## Покроковий план

---

### Крок 1 — Виправити відомі проблеми у фронтенді
**Файли:** `frontend/index.html`, `frontend/chat.html`

- Замінити `href="/static/style.css"` → `href="./style.css"` в обох файлах
- Замінити `window.location.href = '/chat'` → `'/chat.html'` (3 місця в index.html)
- Замінити `const API = ''` → читати з конфігурації (або залишити для Vite proxy)

---

### Крок 2 — Виправити CORS на сервері
**Файл:** `backend/app/main.py`, `backend/app/config.py`

Додати `CORS_ORIGINS` до конфігу:
```python
# config.py
class Settings(BaseSettings):
    ...
    CORS_ORIGINS: list[str] = ["http://localhost:5173", "http://localhost:3000"]
```

```python
# main.py
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

В `.env`:
```env
CORS_ORIGINS=["http://localhost:5173","http://localhost:3000"]
```

---

### Крок 3 — Прибрати роздачу фронтенду з FastAPI
**Файл:** `backend/app/main.py`

Видалити:
```python
# ВИДАЛИТИ:
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

FRONTEND_DIR = ...
if os.path.isdir(FRONTEND_DIR):
    app.mount("/static", ...)
    @app.get("/") ...
    @app.get("/chat") ...
```

Після цього сервер відповідає **тільки** на `/api/...` та `/ws/...`.

---

### Крок 4 — Ініціалізувати Vite-клієнт та перенести файли
```bash
cd проект/
npm create vite@latest client -- --template vanilla
```

Перенести файли:
```
frontend/index.html  →  client/index.html
frontend/chat.html   →  client/chat.html
frontend/app.js      →  client/src/app.js
frontend/style.css   →  client/src/style.css
```

Налаштувати `vite.config.js` для двох HTML (П7):
```js
import { resolve } from 'path'
export default {
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        chat: resolve(__dirname, 'chat.html'),
      }
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8000',
      '/ws': { target: 'ws://localhost:8000', ws: true },
    }
  }
}
```

---

### Крок 5 — Перейменувати папки та оновити README
```
backend/ → server/
frontend/ → (замінено клієнтом у client/)
```

---

### Крок 6 — Консольний Python-клієнт (другий клієнт з завдання)
**Нова папка:** `client-console/`

```
client-console/
├── main.py           # asyncio + websockets + httpx
└── requirements.txt  # websockets>=12.0, httpx>=0.27.0
```

Дивись skill: `.agents/skills/console-client/SKILL.md`

---

### Крок 7 — Реалізувати команди `/name`, `/exit`, `/history`
**Файл:** `backend/app/websocket.py`

Дивись skill: `.agents/skills/websocket/SKILL.md`

---

### Крок 8 — Записувати повідомлення у лог-файл
**Файл:** `backend/app/websocket.py`

```python
import aiofiles, os

async def log_to_file(room: str, username: str, content: str):
    os.makedirs("logs", exist_ok=True)
    line = f"[{datetime.utcnow().isoformat()}] {username}: {content}\n"
    async with aiofiles.open(f"logs/{room}.log", mode="a", encoding="utf-8") as f:
        await f.write(line)
```

Додати `aiofiles` до `requirements.txt`.

---

### Крок 9 — Unit-тести (мінімум 5)
**Папка:** `server/tests/`

Дивись skill: `.agents/skills/pytest/SKILL.md`

Додати до `requirements.txt`:
```
pytest==8.1.1
pytest-asyncio==0.23.6
httpx==0.27.0
```

---

### Крок 10 — Перейти з SQLite на PostgreSQL (для деплою)
**Файл:** `backend/app/database.py`, `backend/requirements.txt`

```python
# Замінити aiosqlite → asyncpg в engine
```

В `requirements.txt` розкоментувати:
```
asyncpg==0.29.0
```

Cloud SQL рядок підключення (з Google Cloud Console):
```env
DATABASE_URL=postgresql+asyncpg://user:pass@/dbname?host=/cloudsql/PROJECT:REGION:INSTANCE
```

---

### Крок 11 — Написати Dockerfile для сервера
**Новий файл:** `server/Dockerfile`

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
ENV PORT=8080
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
```

**Новий файл:** `server/.dockerignore`
```
venv/
__pycache__/
*.pyc
.env
chat.db
logs/
tests/
```

---

### Крок 12 — Деплой на Google Cloud Run

#### 12.1 Підготовка (один раз)
```bash
# Встановити Google Cloud CLI: https://cloud.google.com/sdk/docs/install
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
gcloud services enable run.googleapis.com cloudbuild.googleapis.com sqladmin.googleapis.com
```

#### 12.2 Створити Cloud SQL (PostgreSQL)
```bash
gcloud sql instances create chat-db \
  --database-version=POSTGRES_15 \
  --tier=db-f1-micro \
  --region=us-central1

gcloud sql databases create chatdb --instance=chat-db
gcloud sql users create chatuser --instance=chat-db --password=YOUR_PASSWORD
```

#### 12.3 Збудувати та задеплоїти контейнер
```bash
cd server/

# Збудувати образ через Cloud Build
gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/chat-server

# Деплой на Cloud Run
gcloud run deploy chat-server \
  --image gcr.io/YOUR_PROJECT_ID/chat-server \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --timeout=3600 \
  --set-env-vars="SECRET_KEY=your-secret,ALGORITHM=HS256" \
  --set-env-vars="DATABASE_URL=postgresql+asyncpg://chatuser:YOUR_PASSWORD@/chatdb?host=/cloudsql/PROJECT:REGION:chat-db" \
  --set-env-vars='CORS_ORIGINS=["http://localhost:5173","http://localhost:3000"]' \
  --add-cloudsql-instances=PROJECT:REGION:chat-db
```

#### 12.4 Отримати URL сервера
Після деплою Cloud Run видає URL вигляду:
```
https://chat-server-xxxxxxxx-uc.a.run.app
```

#### 12.5 Оновити клієнт
```js
// client/src/app.js або client/.env
const API = 'https://chat-server-xxxxxxxx-uc.a.run.app';
const WS_HOST = 'chat-server-xxxxxxxx-uc.a.run.app';
// WSS відбувається автоматично — сторінка відкрита по HTTPS
```

```python
# client-console/.env або константи в main.py
API_URL = "https://chat-server-xxxxxxxx-uc.a.run.app"
WS_URL  = "wss://chat-server-xxxxxxxx-uc.a.run.app"
```

---

## Повна послідовність виконання

| # | Що робити | Категорія | Пріоритет |
|---|---|---|---|
| 1 | Виправити `/static/` та `/chat` редиректи в HTML | Розділення | 🔴 Критично |
| 2 | Виправити CORS (прибрати `"*"`, читати з env) | Розділення | 🔴 Критично |
| 3 | Прибрати static-mounting з `main.py` | Розділення | 🔴 Критично |
| 4 | Ініціалізувати Vite, перенести файли, multi-page config | Розділення | 🟡 Важливо |
| 5 | Перейменувати `backend/→server/`, оновити README | Розділення | 🟢 Легко |
| 6 | Консольний Python-клієнт | Завдання | 🔴 Обов'язково |
| 7 | Команди `/name`, `/exit`, `/history` | Завдання | 🔴 Обов'язково |
| 8 | Лог-файл повідомлень | Завдання | 🔴 Обов'язково |
| 9 | Unit-тести (мінімум 5) | Завдання | 🔴 Обов'язково |
| 10 | SQLite → PostgreSQL | Хмара | 🟡 Для деплою |
| 11 | Dockerfile + .dockerignore | Хмара | 🟡 Для деплою |
| 12 | Деплой на Google Cloud Run | Хмара | 🟡 Для деплою |

---

## Навички (Skills)

| Технологія | Skill-файл |
|---|---|
| FastAPI (сервер) | `.agents/skills/fastapi/SKILL.md` |
| WebSocket + команди | `.agents/skills/websocket/SKILL.md` |
| pytest + async тести | `.agents/skills/pytest/SKILL.md` |
| Vanilla JS браузерний клієнт | `.agents/skills/vanilla-js-client/SKILL.md` |
| Python консольний клієнт | `.agents/skills/console-client/SKILL.md` |
