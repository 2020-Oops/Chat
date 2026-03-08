# 💬 Chat App — FastAPI + WebSocket

Чат-застосунок у реальному часі з JWT-автентифікацією, побудований на **FastAPI** (бекенд) та чистому **HTML/JS/CSS** (фронтенд).

---

## 📁 Структура проєкту

```
проект/
├── backend/          # FastAPI сервер
│   ├── app/          # Код застосунку
│   ├── .env          # Змінні середовища
│   ├── requirements.txt
│   └── chat.db       # SQLite база даних (створюється автоматично)
└── frontend/         # Статичний фронтенд
    ├── index.html    # Сторінка входу / реєстрації
    ├── chat.html     # Сторінка чату
    ├── app.js
    └── style.css
```

---

## ⚙️ Вимоги

- **Python** 3.10–3.12 (рекомендовано 3.12; Python 3.13 може мати проблеми з `passlib`)
- **pip**
- Будь-який сучасний браузер

---

## 🚀 Запуск бекенду

### 1. Перейти до папки бекенду

```bash
cd "c:\Users\Alex\Desktop\проект\backend"
```

### 2. Створити та активувати віртуальне середовище

```bash
python -m venv venv
venv\Scripts\activate
```

### 3. Встановити залежності

```bash
pip install -r requirements.txt
```

### 4. Налаштувати змінні середовища

Відкрийте файл `.env` і за потреби змініть:

```env
DATABASE_URL=sqlite+aiosqlite:///./chat.db
SECRET_KEY=замініть-на-довгий-випадковий-рядок
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440
```

> ⚠️ У продакшені обов'язково змініть `SECRET_KEY` на безпечний випадковий рядок!

### 5. Запустити сервер

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Сервер буде доступний за адресою: **http://localhost:8000**

---

## 🌐 Запуск фронтенду

Фронтенд — це статичні HTML-файли. Відкрийте `frontend/index.html` у браузері:

**Варіант 1 — напряму через браузер:**

```
Двічі клікніть на файл frontend/index.html
```

> ⚠️ При відкритті через `file://` WebSocket може не працювати через CORS. Рекомендується варіант 2.

**Варіант 2 — через локальний HTTP-сервер (рекомендовано):**

```bash
cd "c:\Users\Alex\Desktop\проект\frontend"
python -m http.server 3000
```

Потім відкрийте в браузері: **http://localhost:3000**

---

## 📌 Корисні посилання після запуску

| Ресурс | URL |
|---|---|
| Застосунок (фронтенд) | http://localhost:3000 |
| API сервер | http://localhost:8000 |
| Swagger документація | http://localhost:8000/docs |
| ReDoc документація | http://localhost:8000/redoc |

---

## 🗃️ База даних

За замовчуванням використовується **SQLite** — база даних `chat.db` створюється автоматично при першому запуску.

Для переходу на **PostgreSQL** розкоментуйте у `.env`:

```env
DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/chatdb
```

І у `requirements.txt` розкоментуйте:

```
asyncpg==0.29.0
```

---

## 🛑 Зупинка сервера

Натисніть `Ctrl + C` у терміналі де запущено `uvicorn`.
