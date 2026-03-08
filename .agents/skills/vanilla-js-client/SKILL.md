---
name: vanilla-js-client
description: Best practices for the Vanilla JS + HTML/CSS chat frontend — API calls, WebSocket management, token storage, chat commands, Vite setup
---

# Vanilla JS Client Skill

## Project Context
Frontend lives in `frontend/` (or `client/` after separation).
Stack: Vanilla JS (ES Modules), HTML, CSS. Optional: Vite for dev server + build.

---

## File Structure (Post-Separation with Vite)
```
client/
├── index.html       # Login / Register page
├── chat.html        # Chat UI page
├── src/
│   ├── app.js       # Chat logic: WebSocket + REST calls
│   ├── auth.js      # Register / login form handlers
│   └── style.css    # All styles
├── .env             # VITE_API_URL, VITE_WS_URL
└── vite.config.js   # Dev server + proxy settings
```

---

## API Configuration (after server separation)
```js
// src/app.js
const API     = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';
const WS_BASE = import.meta.env.VITE_WS_URL  ?? 'ws://localhost:8000';
```

```env
# client/.env
VITE_API_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000
```

---

## Auth Pattern: JWT in localStorage
```js
// After login:
localStorage.setItem('token', data.access_token);
localStorage.setItem('username', username);

// Auth guard on chat page:
const TOKEN = localStorage.getItem('token');
if (!TOKEN) window.location.href = '/';

// In every fetch call:
headers: { 'Authorization': `Bearer ${TOKEN}` }

// Logout:
localStorage.removeItem('token');
localStorage.removeItem('username');
window.location.href = '/';
```

---

## WebSocket Connection Pattern
```js
function connect(room) {
    const url = `${WS_BASE}/ws/${encodeURIComponent(room)}?token=${TOKEN}`;
    socket = new WebSocket(url);

    socket.onopen  = () => setConnected(true);
    socket.onclose = (ev) => {
        setConnected(false);
        if (ev.code === 4001) { logout(); return; }   // unauthorized
        setTimeout(() => connect(room), reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 2, 30_000);
    };
    socket.onerror = () => socket.close();
    socket.onmessage = (ev) => handleServerMessage(JSON.parse(ev.data));
}
```

---

## Chat Commands (Client Side)
```js
function sendMessage() {
    const content = messageInput.value.trim();
    if (!content) return;

    // Commands start with /
    if (content === '/exit') {
        socket.close();
        logout();
        return;
    }

    // /name and /history are sent to server as-is
    // Server handles /name <newname>, /history

    socket.send(JSON.stringify({ content }));
    messageInput.value = '';
}
```

Commands to support: `/name <нікнейм>`, `/exit`, `/history`

---

## DM Room Naming (consistent between two users)
```js
// dm_alice_bob  (alphabetical, same for both sides)
function dmRoomName(userA, userB) {
    return 'dm_' + [userA, userB].sort().join('_');
}
```

---

## Vite Config (after extraction to client/)
```js
// vite.config.js
export default {
    root: '.',
    server: {
        port: 5173,
        proxy: {
            '/api': 'http://localhost:8000',
            '/ws': { target: 'ws://localhost:8000', ws: true },
        },
    },
    build: {
        outDir: 'dist',
    },
}
```
With proxy active, keep `API = ''` (relative), no CORS needed in dev.

---

## Security Best Practices
- Escape all user content before inserting into DOM (use `escapeHtml()`)
- Never insert raw `innerHTML` from server messages
- JWT stays in `localStorage` — acceptable for this project scope

---

## Do NOT
- Do NOT use `document.write()` or raw `.innerHTML` with user content
- Do NOT store passwords in localStorage
- Do NOT make API calls without `Authorization` header after login
- Do NOT use synchronous `XMLHttpRequest` — always `fetch()` with `await`
