# Chat App — FastAPI + WebSocket

Нижче найпростіша та зрозуміла інструкція із запуску.

---

## Швидкий старт (Docker, 1 команда)

Потрібен встановлений Docker Desktop.

```bash
docker compose up --build
```

Після запуску:
- Фронтенд: **http://localhost:3000**
- API: **http://localhost:8000**

Зупинити:
```bash
docker compose down
```

Примітки:
- У корені є `.env` з `COMPOSE_PROJECT_NAME=chatapp`, щоб Compose коректно працював навіть у шляхах із нестандартними символами.
- Дані Postgres зберігаються у volume `pgdata`.

---

## Ручний запуск без Docker (локально)

### 1) Сервер
```bash
cd server
pip install -r requirements.txt
```

Створіть `server/.env`:
```env
DATABASE_URL=sqlite+aiosqlite:///./chat.db
SECRET_KEY=local-dev-secret-key
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440
CORS_ORIGINS=["http://localhost:3000","http://127.0.0.1:3000"]
```

Застосуйте міграції та запустіть сервер:
```bash
python -m alembic upgrade head
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 2) Фронтенд
```bash
cd frontend
python -m http.server 3000
```

Відкрийте: **http://localhost:3000**

---

## Як задати API/WS для фронтенду без змін у коді

Фронтенд читає runtime‑конфіг із `frontend/config.js` і може перевизначатися без редагування файлів:

1) **Query‑params** (швидко для тестів):
```
http://localhost:3000/chat.html?api=https://YOUR_API&ws=wss://YOUR_API
```

2) **LocalStorage** (один раз у консолі браузера):
```js
localStorage.setItem('chat_api_base', 'https://YOUR_API');
localStorage.setItem('chat_ws_base', 'wss://YOUR_API');
```

3) **Глобальний конфіг** (через хостинг або у `frontend/config.js`):
```js
window.CHAT_CONFIG = {
  API_BASE_URL: 'https://YOUR_API',
  WS_BASE_URL: 'wss://YOUR_API'
};
```

---

## Тести

```bash
cd server
python -m pytest tests/ -v
```

---

## Коротко про архітектуру

- FastAPI + SQLAlchemy async
- JWT‑автентифікація
- WebSocket для realtime
- БД: SQLite локально, PostgreSQL у проді
- Міграції через Alembic
