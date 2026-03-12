# 💬 Chat App — FastAPI + WebSocket (Cloud Ready)

Чат-застосунок у реальному часі з JWT-автентифікацією, розроблений та розділений на незалежні **сервер (FastAPI)** та **строго статичний фронтенд (HTML/JS/CSS)**.

---

## 📁 Структура проєкту

```
проєкт/
├── server/           # FastAPI сервер (REST API + WebSocket)
│   ├── alembic/      # Міграції бази даних
│   ├── app/          # Логіка застосунку (models.py, routers/)
│   ├── tests/        # Unit-тести (pytest)
│   ├── Dockerfile    # Для деплою на Cloud Run
│   ├── alembic.ini   # Конфігурація Alembic
│   ├── .env          # Змінні середовища
│   └── requirements.txt
└── frontend/         # Статичний фронтенд (HTML/JS/CSS)
    ├── index.html    # Сторінка входу / реєстрації
    ├── chat.html     # Сторінка чату
    ├── config.js     # Runtime конфіг клієнта (API/WS)
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

> Тепер фронтенд має **runtime-конфіг** (файл `frontend/config.js`):
> - якщо відкрито з `localhost/127.0.0.1`, API автоматично = `http://localhost:8000`;
> - у prod можна задати API/WS **без правок коду** (див. секцію нижче).

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
3. Накотіть міграції бази даних (Alembic):
   ```bash
   python -m alembic upgrade head
   ```
4. Запустіть сервер:
   ```bash
   python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```
   *Сервер працюватиме на `http://localhost:8000`*

### 2. Налаштування та запуск Клієнта (Фронтенду)
1. Запустіть статику:
   ```bash
   cd frontend
   python -m http.server 3000
   ```
2. Відкрийте: **http://localhost:3000**

### Задати API/WS без правок коду
Є 3 способи:
1. **Query-params** (швидко для тестів):
   - `http://localhost:3000/chat.html?api=https://YOUR_API&ws=wss://YOUR_API`
2. **LocalStorage** (разово в консолі браузера):
   ```js
   localStorage.setItem('chat_api_base', 'https://YOUR_API');
   localStorage.setItem('chat_ws_base', 'wss://YOUR_API');
   ```
3. **Глобальний конфіг** (наприклад, через хостинг або у `frontend/config.js`):
   ```js
   window.CHAT_CONFIG = {
     API_BASE_URL: 'https://YOUR_API',
     WS_BASE_URL: 'wss://YOUR_API'
   };
   ```

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
- **Нова Архітектура (v2):** Сервер тепер підтримує справжні структуровані **Групи** (через окремі таблиці), **Приватні Повідомлення** (Explicit DMs через `recipient_id`) та розширені профілі користувачів (`display_name`).
- **База Даних:** Локально використовується `SQLite`. В хмарі — `PostgreSQL` через `asyncpg`. Управління схемою ведеться через систему міграцій **Alembic**.
