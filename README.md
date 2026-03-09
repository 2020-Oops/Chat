# 💬 Chat App — FastAPI + WebSocket (Cloud Ready)

Чат-застосунок у реальному часі з JWT-автентифікацією, розроблений та розділений на незалежні **сервер (FastAPI)** та **строго статичний фронтенд (HTML/JS/CSS)**.

---

## 📁 Структура проєкту

```
проєкт/
├── server/           # FastAPI сервер (REST API + WebSocket)
│   ├── app/          # Логіка застосунку
│   ├── tests/        # Unit-тести (pytest)
│   ├── Dockerfile    # Для деплою на Cloud Run
│   ├── .env          # Змінні середовища
│   └── requirements.txt
└── frontend/         # Статичний фронтенд (HTML/JS/CSS)
    ├── index.html    # Сторінка входу / реєстрації
    ├── chat.html     # Сторінка чату
    ├── app.js        # Логіка клієнта
    └── style.css
```

---

## 🚀 Варіант 1: Запуск у хмарі (Вже задеплоєно)

Сервер вже успішно задеплоєно на Google Cloud Run і він використовує базу даних PostgreSQL (Cloud SQL). Фронтенд налаштований на роботу з ним з коробки.

### Запуск клієнта локально:
1. Перейдіть у папку `frontend`:
   ```bash
   cd frontend
   ```
2. Запустіть локальний HTTP-сервер для статики:
   ```bash
   python -m http.server 3000
   ```
3. Відкрийте у браузері: **http://localhost:3000**

> Фронтенд автоматично надсилає запити на видiлений Cloud Run сервер `chat-server-154708099195.us-central1.run.app`. Сервер коректно обробляє CORS для `http://localhost:3000`.

---

## 💻 Варіант 2: Повністю локальний запуск (Development)

Якщо ви бажаєте тестувати чи змінювати і сервер, і клієнт локально.

### 1. Налаштування та запуск Сервера
1. Перейдіть до папки сервера та встановіть залежності:
   ```bash
   cd server
   pip install -r requirements.txt
   ```
2. Створіть файл `.env` у папці `server/` (якщо його немає) з наступним вмістом для використання SQLite:
   ```env
   DATABASE_URL=sqlite+aiosqlite:///./chat.db
   SECRET_KEY=local-dev-secret-key
   ALGORITHM=HS256
   ACCESS_TOKEN_EXPIRE_MINUTES=1440
   CORS_ORIGINS=["http://localhost:3000","http://127.0.0.1:3000"]
   ```
3. Запустіть сервер:
   ```bash
   python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```
   *Сервер працюватиме на `http://localhost:8000`*

### 2. Налаштування та запуск Клієнта (Фронтенду)
1. У файлах `frontend/index.html` (рядок 58) та `frontend/app.js` (рядки 14-16) змініть хмарну URL-адресу API на локальну:
   ```js
   const API = 'http://localhost:8000';
   const WS_PROTO = 'ws:';
   const WS_HOST = 'localhost:8000';
   ```
2. Запустіть статику:
   ```bash
   cd frontend
   python -m http.server 3000
   ```
3. Відкрийте: **http://localhost:3000**

---

## 🧪 Запуск тестів (на сервері)

Бекенд покритий unit-тестами з використанням `pytest`.

```bash
cd server
python -m pytest tests/ -v
```

---

## 🔐 Безпека та Архітектура

- **Паролі** хешуються за допомогою `bcrypt`.
- **Авторизація** відбувається через JSON Web Tokens (JWT).
- **Зв'язок:** Сервер чітко розділений. REST використовується для реєстрації, логіну та завантаження історії. WebSocket (`wss://`) використовується виключно для миттєвого обміну повідомленнями.
- **База Даних:** Локально використовується `SQLite`. В хмарі — `PostgreSQL` через `asyncpg`.
