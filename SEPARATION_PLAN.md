# Архітектура: Сервер ↔ Клієнт (Розділення завершено)

> Оновлено: після аналізу коду, сервер успішно розділений з клієнтом та розгорнутий на Google Cloud Run.

---

## Поточний стан (Завершено)

- **Сервер (FastAPI):** Більше не роздає статику (`/static/...`). Тепер він працює виключно як REST API (`/api/...`) та WebSocket-сервер (`/ws/...`). Сервер задеплоєно на Cloud Run.
- **Клієнт (Frontend):** Статичні файли (HTML/JS/CSS), що лежать у папці `frontend/` та підключаються безпосередньо до хмарного бекенду.
- **База даних:** В хмарі використовується інтеграція з PostgreSQL (Cloud SQL) через `asyncpg`. У локальному середовищі - SQLite.
- **Безпека:** Налаштовано CORS для специфічних origins (`http://localhost:3000` тощо). Додано JWT-автентифікацію.

Вимоги щодо двох HTML-файлів (Vite.js client config), консольного клієнта на Python та специфічних WebSocket-команд (/name, /exit, /history) **прибрано з плану** за запитом.

---

## Архітектура

```
Локальний комп'ютер                    Google Cloud
──────────────────────────             ─────────────────────────────────
клієнт (браузер)          ──HTTPS──►  Cloud Run: https://chat-server-*
(frontend/index.html)                         /api/*   (REST)
                               ──WSS──►       /ws/*    (WebSocket)
                                                      │
                                           Cloud SQL (PostgreSQL)

Локально для розробки:
frontend/* ──HTTP/WS──► localhost:8000 ──► SQLite (chat.db)
```

---

## Навички (Skills)

| Технологія | Skill-файл |
|---|---|
| FastAPI (сервер) | `.agents/skills/fastapi/SKILL.md` |
| WebSocket | `.agents/skills/websocket/SKILL.md` |
| pytest + async тести | `.agents/skills/pytest/SKILL.md` |
| Vanilla JS браузерний клієнт | `.agents/skills/vanilla-js-client/SKILL.md` |
