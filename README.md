# 💬 Chat App — FastAPI + WebSocket

Чат-застосунок у реальному часі з JWT-автентифікацією, побудований на **FastAPI** (бекенд) та чистому **HTML/JS/CSS** (фронтенд).

---

## 📁 Структура проєкту

```
проект/
├── server/           # FastAPI сервер (API + WebSocket)
│   ├── app/          # Код застосунку
│   ├── tests/        # Unit-тести (pytest)
│   ├── logs/         # Лог-файли повідомлень (створюється автоматично)
│   ├── .env          # Змінні середовища
│   ├── pytest.ini    # Конфігурація тестів
│   └── requirements.txt
└── frontend/         # Статичний фронтенд (HTML/JS/CSS)
    ├── index.html    # Сторінка входу / реєстрації
    ├── chat.html     # Сторінка чату
    ├── app.js
    └── style.css
```

---

## ⚙️ Вимоги

- **Python** 3.10–3.13
- Будь-який сучасний браузер

---

## 🚀 Запуск сервера

### 1. Перейти до папки сервера

```bash
cd server
```

### 2. Встановити залежності

```bash
pip install -r requirements.txt
```

### 3. Налаштувати змінні середовища

Відредагуй `.env` за потреби:

```env
DATABASE_URL=sqlite+aiosqlite:///./chat.db
SECRET_KEY=замініть-на-довгий-випадковий-рядок
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440
CORS_ORIGINS=["http://localhost:3000","http://127.0.0.1:3000"]
```

> ⚠️ У продакшені обов'язково змініть `SECRET_KEY`!

### 4. Запустити сервер

```bash
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Сервер буде доступний за адресою: **http://localhost:8000**

---

## 🌐 Запуск фронтенду

```bash
cd frontend
python -m http.server 3000
```

Відкрий у браузері: **http://localhost:3000**

---

## 🧪 Запуск тестів

```bash
cd server
python -m pytest tests/ -v
```

---

## 📌 Корисні посилання

| Ресурс | URL |
|---|---|
| Застосунок (фронтенд) | http://localhost:3000 |
| API сервер | http://localhost:8000 |
| Swagger документація | http://localhost:8000/docs |

---

## 🗃️ База даних

За замовчуванням — **SQLite** (`server/chat.db`, створюється автоматично).

Для **PostgreSQL** (Cloud Run) розкоментуй у `.env`:
```env
DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/chatdb
```

---

## 📋 Лог повідомлень

Кожне повідомлення автоматично записується у `server/logs/{room}.log`:
```
[2026-03-09 00:43:12] alex: Привіт!
[2026-03-09 00:44:05] bob: Як справи?
```

---

## 🔐 Безпека

- Паролі хешуються через **bcrypt**
- Авторизація через **JWT** (HS256)
- CORS налаштований на конкретні origins

---

## 🛑 Зупинка

`Ctrl + C` у терміналі де запущено сервер або фронтенд.
