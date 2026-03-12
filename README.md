# Chat App — FastAPI + WebSocket

Ниже самое простое и понятное руководство по запуску.

---

## Быстрый старт (Docker, 1 команда)

Нужен установленный Docker Desktop.

```bash
docker compose up --build
```

После запуска:
- Фронтенд: **http://localhost:3000**
- API: **http://localhost:8000**

Остановить:
```bash
docker compose down
```

Примечания:
- В корне есть `.env` с `COMPOSE_PROJECT_NAME=chatapp`, чтобы Compose работал корректно даже в путях с нестандартными символами.
- Данные Postgres сохраняются в volume `pgdata`.

---

## Ручной запуск без Docker (локально)

### 1) Сервер
```bash
cd server
pip install -r requirements.txt
```

Создайте `server/.env`:
```env
DATABASE_URL=sqlite+aiosqlite:///./chat.db
SECRET_KEY=local-dev-secret-key
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440
CORS_ORIGINS=["http://localhost:3000","http://127.0.0.1:3000"]
```

Накатите миграции и запустите сервер:
```bash
python -m alembic upgrade head
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 2) Фронтенд
```bash
cd frontend
python -m http.server 3000
```

Откройте: **http://localhost:3000**

---

## Как задать API/WS для фронтенда без правок кода

Фронтенд читает runtime‑конфиг из `frontend/config.js` и умеет переопределяться без редактирования файлов:

1) **Query‑params** (быстро для тестов):
```
http://localhost:3000/chat.html?api=https://YOUR_API&ws=wss://YOUR_API
```

2) **LocalStorage** (один раз в консоли браузера):
```js
localStorage.setItem('chat_api_base', 'https://YOUR_API');
localStorage.setItem('chat_ws_base', 'wss://YOUR_API');
```

3) **Глобальный конфиг** (через хостинг или в `frontend/config.js`):
```js
window.CHAT_CONFIG = {
  API_BASE_URL: 'https://YOUR_API',
  WS_BASE_URL: 'wss://YOUR_API'
};
```

---

## Тесты

```bash
cd server
python -m pytest tests/ -v
```

---

## Кратко про архитектуру

- FastAPI + SQLAlchemy async
- JWT‑аутентификация
- WebSocket для realtime
- БД: SQLite локально, PostgreSQL в проде
- Миграции через Alembic
