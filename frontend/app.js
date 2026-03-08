/* app.js — Chat + Direct Messages frontend logic */
(function () {
  'use strict';

  // ── Auth guard ─────────────────────────────────────
  const TOKEN = localStorage.getItem('token');
  const ME = localStorage.getItem('username');
  if (!TOKEN || !ME) {
    window.location.href = '/';
  }

  // ── State ───────────────────────────────────────────
  const API = '';
  const WS_PROTO = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const WS_HOST = location.host;

  let currentRoom = 'general';
  let currentRoomType = 'channel'; // 'channel' | 'dm'
  let currentDmPeer = null; // username of the DM peer
  let socket = null;
  let reconnectTimer = null;
  let reconnectDelay = 1000;

  // ── DOM refs ────────────────────────────────────────
  const messagesArea = document.getElementById('messages-area');
  const messageInput = document.getElementById('message-input');
  const btnSend = document.getElementById('btn-send');
  const connBadge = document.getElementById('conn-badge');
  const connText = document.getElementById('conn-text');
  const onlineList = document.getElementById('online-list');
  const headerRoom = document.getElementById('header-room');
  const headerMeta = document.getElementById('header-meta');
  const headerIcon = document.getElementById('header-icon');
  const dmList = document.getElementById('dm-list');
  const dmEmpty = document.getElementById('dm-empty');

  // ── Utility ─────────────────────────────────────────
  function formatTime(iso) {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function avatarInitial(name) {
    return (name || '?').charAt(0).toUpperCase();
  }

  function scrollToBottom() {
    messagesArea.scrollTop = messagesArea.scrollHeight;
  }

  function setConnected(ok) {
    connBadge.className = `connection-badge ${ok ? 'connected' : 'disconnected'}`;
    connText.textContent = ok ? 'Connected' : 'Disconnected';
    btnSend.disabled = !ok;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** Canonical DM room name for two users (alphabetical, consistent for both sides). */
  function dmRoomName(userA, userB) {
    return 'dm_' + [userA, userB].sort().join('_');
  }

  // ── Render helpers ───────────────────────────────────
  function renderMessage(msg) {
    const isOwn = msg.sender.username === ME;
    const div = document.createElement('div');
    div.className = `message-bubble ${isOwn ? 'own' : ''}`;
    div.innerHTML = `
      <div class="avatar">${avatarInitial(msg.sender.username)}</div>
      <div class="bubble-content">
        <div class="bubble-header">
          <span class="bubble-name">${escapeHtml(msg.sender.username)}</span>
          <span class="bubble-time">${formatTime(msg.timestamp)}</span>
        </div>
        <div class="bubble-text">${escapeHtml(msg.content)}</div>
      </div>
    `;
    messagesArea.appendChild(div);
    scrollToBottom();
  }

  function renderSystem(content) {
    const div = document.createElement('div');
    div.className = 'message-system';
    div.innerHTML = `<span class="sys-pill">${escapeHtml(content)}</span>`;
    messagesArea.appendChild(div);
    scrollToBottom();
  }

  function renderOnlineList(users) {
    onlineList.innerHTML = users.map(u => `
      <li>
        <span class="online-dot"></span>
        ${escapeHtml(u)}
        ${u === ME ? '<span class="me-badge">you</span>' : ''}
      </li>
    `).join('');
    const total = currentRoomType === 'channel' ? `${users.length} online` : '';
    headerMeta.textContent = total;
  }

  // ── DM sidebar ────────────────────────────────────────
  function renderDmList(users) {
    if (!users || users.length === 0) {
      dmEmpty.style.display = '';
      return;
    }
    dmEmpty.style.display = 'none';

    // Remove old DM entries (keep #dm-empty)
    dmList.querySelectorAll('li:not(#dm-empty)').forEach(li => li.remove());

    users.forEach(user => {
      const li = document.createElement('li');
      li.dataset.peer = user.username;
      li.className = '';
      li.innerHTML = `
        <span class="dm-avatar">${avatarInitial(user.username)}</span>
        <span class="dm-username">${escapeHtml(user.username)}</span>
        <span class="dm-unread" id="unread-${CSS.escape(user.username)}" style="display:none"></span>
      `;
      li.addEventListener('click', () => openDm(user.username));
      dmList.appendChild(li);
    });
  }

  async function loadUsers() {
    try {
      const res = await fetch(`${API}/api/users`, {
        headers: { Authorization: `Bearer ${TOKEN}` },
      });
      if (res.status === 401) { logout(); return; }
      if (!res.ok) return;
      const users = await res.json();
      renderDmList(users);
    } catch (e) {
      console.warn('Failed to load users', e);
    }
  }

  function openDm(peer) {
    currentDmPeer = peer;
    const room = dmRoomName(ME, peer);
    currentRoomType = 'dm';

    // Update channel sidebar: deactivate all channels
    document.querySelectorAll('#room-list li').forEach(li => li.classList.remove('active'));
    // Update DM sidebar: activate peer
    dmList.querySelectorAll('li').forEach(li => {
      li.classList.toggle('active', li.dataset.peer === peer);
    });
    // Clear unread badge
    const badge = document.getElementById(`unread-${CSS.escape(peer)}`);
    if (badge) { badge.style.display = 'none'; badge.textContent = ''; }

    // Update header
    headerIcon.textContent = '✉';
    headerRoom.textContent = peer;
    headerMeta.textContent = 'Direct Message';
    messageInput.placeholder = `Message @${peer}…`;

    messagesArea.innerHTML = '';
    onlineList.innerHTML = '';

    loadHistory(room).then(() => connect(room));
  }

  // ── Load history ─────────────────────────────────────
  async function loadHistory(room) {
    try {
      const res = await fetch(`${API}/api/messages?room=${encodeURIComponent(room)}&limit=50`, {
        headers: { Authorization: `Bearer ${TOKEN}` },
      });
      if (res.status === 401) { logout(); return; }
      if (!res.ok) return;
      const msgs = await res.json();
      messagesArea.innerHTML = '';
      msgs.forEach(renderMessage);
    } catch (e) {
      console.warn('History load failed', e);
    }
  }

  // ── WebSocket ─────────────────────────────────────────
  function connect(room) {
    if (socket) {
      socket.onclose = null;
      socket.close();
      socket = null;
    }
    clearTimeout(reconnectTimer);
    setConnected(false);

    const url = `${WS_PROTO}//${WS_HOST}/ws/${encodeURIComponent(room)}?token=${TOKEN}`;
    socket = new WebSocket(url);

    socket.onopen = () => {
      setConnected(true);
      reconnectDelay = 1000;
    };

    socket.onmessage = (event) => {
      let data;
      try { data = JSON.parse(event.data); } catch { return; }

      if (data.type === 'message') {
        renderMessage(data);
      } else if (data.type === 'system') {
        // Only show join/leave in channels, not in DMs
        if (currentRoomType === 'channel') {
          renderSystem(data.content);
        }
      }
      if (data.online && currentRoomType === 'channel') {
        renderOnlineList(data.online);
      }
    };

    socket.onclose = (ev) => {
      setConnected(false);
      if (ev.code === 4001) { logout(); return; }
      connText.textContent = `Reconnecting in ${Math.round(reconnectDelay / 1000)}s…`;
      reconnectTimer = setTimeout(() => {
        reconnectDelay = Math.min(reconnectDelay * 2, 30000);
        connect(currentRoom);
      }, reconnectDelay);
    };

    socket.onerror = () => { socket.close(); };
    currentRoom = room;
  }

  // ── Channel switching ──────────────────────────────────
  window.switchRoom = function (room) {
    if (room === currentRoom && currentRoomType === 'channel') return;
    currentRoomType = 'channel';
    currentDmPeer = null;

    headerIcon.textContent = '#';
    headerRoom.textContent = room;
    headerMeta.textContent = '';
    messageInput.placeholder = `Message #${room}…`;

    document.querySelectorAll('#room-list li').forEach(li => {
      li.classList.toggle('active', li.dataset.room === room);
    });
    dmList.querySelectorAll('li').forEach(li => li.classList.remove('active'));

    messagesArea.innerHTML = '';
    onlineList.innerHTML = '';

    loadHistory(room).then(() => connect(room));
  };

  // ── Send message ───────────────────────────────────────
  function sendMessage() {
    const content = messageInput.value.trim();
    if (!content || !socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ content }));
    messageInput.value = '';
    messageInput.style.height = 'auto';
  }

  btnSend.addEventListener('click', sendMessage);

  messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Auto-grow textarea
  messageInput.addEventListener('input', () => {
    messageInput.style.height = 'auto';
    messageInput.style.height = `${messageInput.scrollHeight}px`;
  });

  // ── Logout ─────────────────────────────────────────────
  window.logout = function () {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    window.location.href = '/';
  };

  // ── Init ───────────────────────────────────────────────
  loadUsers();
  loadHistory(currentRoom).then(() => connect(currentRoom));

})();
