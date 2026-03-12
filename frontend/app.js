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
  // Runtime config (see config.js)
  const runtime = window.ChatConfig || {};
  const API = runtime.apiBase || '';
  const WS_BASE = runtime.wsBase || (
    API ? API.replace(/^http/, 'ws') :
    `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`
  );

  let currentRoom = null;
  let currentRoomType = 'dm'; // 'channel' | 'dm' | 'group'
  let currentDmPeer = null; // username of the DM peer
  let currentGroupId = null; // currently selected group ID
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
  const groupList = document.getElementById('group-list');
  const groupEmpty = document.getElementById('group-empty');
  
  // Modals & Group actions
  const createGroupModal = document.getElementById('create-group-modal');
  const btnCreateGroup = document.getElementById('btn-create-group');
  const btnCancelGroup = document.getElementById('btn-cancel-group');
  const btnSubmitGroup = document.getElementById('btn-submit-group');
  const newGroupNameInput = document.getElementById('new-group-name');
  
  // Header Actions
  const btnAddMember = document.getElementById('btn-add-member');
  const btnLeaveGroup = document.getElementById('btn-leave-group');
  const btnDeleteGroup = document.getElementById('btn-delete-group');

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
    headerMeta.textContent = '';
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
      const [usersRes, groupsRes] = await Promise.all([
        fetch(`${API}/api/users`, { headers: { Authorization: `Bearer ${TOKEN}` } }),
        fetch(`${API}/api/groups`, { headers: { Authorization: `Bearer ${TOKEN}` } })
      ]);
      
      if (usersRes.status === 401 || groupsRes.status === 401) { logout(); return; }
      
      if (usersRes.ok) {
        const users = await usersRes.json();
        renderDmList(users);
      }
      if (groupsRes.ok) {
        const groups = await groupsRes.json();
        renderGroupList(groups);
      }
    } catch (e) {
      console.warn('Failed to load data', e);
    }
  }

  function renderGroupList(groups) {
    if (!groups || groups.length === 0) {
      groupEmpty.style.display = '';
      return;
    }
    groupEmpty.style.display = 'none';

    groupList.querySelectorAll('li:not(#group-empty)').forEach(li => li.remove());

    groups.forEach(group => {
      const li = document.createElement('li');
      li.dataset.group = group.id;
      li.className = '';
      li.innerHTML = `
        <span class="dm-avatar">👥</span>
        <span class="dm-username">${escapeHtml(group.name)}</span>
        <span class="dm-unread" id="unread-group-${group.id}" style="display:none"></span>
      `;
      li.addEventListener('click', () => openGroup(group.id, group.name, group.creator_id));
      groupList.appendChild(li);
    });
  }

  function openDm(peer) {
    currentDmPeer = peer;
    currentGroupId = null;
    const room = dmRoomName(ME, peer);
    currentRoomType = 'dm';

    // Update DM sidebar: activate peer
    dmList.querySelectorAll('li').forEach(li => {
      li.classList.toggle('active', li.dataset.peer === peer);
    });
    groupList.querySelectorAll('li').forEach(li => li.classList.remove('active'));

    // Clear unread badge
    const badge = document.getElementById(`unread-${CSS.escape(peer)}`);
    if (badge) { badge.style.display = 'none'; badge.textContent = ''; }

    // Update header
    headerIcon.textContent = '✉';
    headerRoom.textContent = peer;
    headerMeta.textContent = 'Direct Message';
    messageInput.placeholder = `Message @${peer}…`;
    messageInput.removeAttribute('disabled');
    
    // Hide group actions
    btnAddMember.style.display = 'none';
    btnLeaveGroup.style.display = 'none';
    btnDeleteGroup.style.display = 'none';

    messagesArea.innerHTML = '';
    onlineList.innerHTML = '';

    loadHistory(room).then(() => connect(room));
  }

  function openGroup(groupId, groupName, creatorId) {
    currentGroupId = groupId;
    currentDmPeer = null;
    const room = `group_${groupId}`;
    currentRoomType = 'group';

    // Update sidebar
    groupList.querySelectorAll('li').forEach(li => {
      li.classList.toggle('active', li.dataset.group == groupId);
    });
    dmList.querySelectorAll('li').forEach(li => li.classList.remove('active'));

    const badge = document.getElementById(`unread-group-${groupId}`);
    if (badge) { badge.style.display = 'none'; badge.textContent = ''; }

    // Update header
    headerIcon.textContent = '👥';
    headerRoom.textContent = groupName;
    headerMeta.textContent = 'Group Chat';
    messageInput.placeholder = `Message ${groupName}…`;
    messageInput.removeAttribute('disabled');
    
    // Show group actions
    btnAddMember.style.display = 'block';
    // fetch my user ID to compare with creatorId (or decode JWT, or save my ID on login)
    // For now, allow leave for all, and delete if seems to be creator (handled by backend mostly)
    btnLeaveGroup.style.display = 'block';
    btnDeleteGroup.style.display = 'block';

    messagesArea.innerHTML = '';
    onlineList.innerHTML = '';
    
    // Load members to show in online section
    loadGroupMembers(groupId);

    loadHistory(room).then(() => connect(room));
  }

  async function loadGroupMembers(groupId) {
    try {
      const res = await fetch(`${API}/api/groups/${groupId}/members`, {
        headers: { Authorization: `Bearer ${TOKEN}` },
      });
      if (!res.ok) return;
      const members = await res.json();
      renderOnlineList(members.map(m => m.user.username));
    } catch (e) {
      console.warn('Failed to load members', e);
    }
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

  function connect(room) {
    if (!room) return;
    if (socket) {
      socket.onclose = null;
      socket.close();
      socket = null;
    }
    clearTimeout(reconnectTimer);
    setConnected(false);

    const url = `${WS_BASE}/ws/${encodeURIComponent(room)}?token=${TOKEN}`;
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
        // System messages not filtered currently
      }
      // For groups, we render member list via API instead of WS presence
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
        if (currentRoom) connect(currentRoom);
      }, reconnectDelay);
    };

    socket.onerror = () => { socket.close(); };
    currentRoom = room;
  }

  // ── Channel switching is removed for DM-only mode ──

  // ── Send message ───────────────────────────────────────
  function sendMessage() {
    const content = messageInput.value.trim();
    if (!content || !socket || socket.readyState !== WebSocket.OPEN) return;
    
    const payload = { content };
    if (currentRoomType === 'group' && currentGroupId) {
       payload.group_id = currentGroupId;
    } else if (currentRoomType === 'dm' && currentDmPeer) {
       // payload.recipient_id could be added if frontend fetched it, but backend mostly relies on room name or recipient_id
    }
    
    socket.send(JSON.stringify(payload));
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

  // ── Group Management Logic ──────────────────────────────────────────
  
  btnCreateGroup.addEventListener('click', () => {
    createGroupModal.style.display = 'flex';
    newGroupNameInput.focus();
  });
  
  btnCancelGroup.addEventListener('click', () => {
    createGroupModal.style.display = 'none';
    newGroupNameInput.value = '';
  });
  
  btnSubmitGroup.addEventListener('click', async () => {
    const name = newGroupNameInput.value.trim();
    if (!name) return;
    try {
      const res = await fetch(`${API}/api/groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
        body: JSON.stringify({ name })
      });
      if (res.ok) {
        createGroupModal.style.display = 'none';
        newGroupNameInput.value = '';
        loadUsers(); // Refresh groups
      } else {
        const error = await res.json();
        alert(error.detail || 'Failed to create group');
      }
    } catch (e) {
      console.error(e);
      alert('Error creating group');
    }
  });

  btnAddMember.addEventListener('click', async () => {
    if (!currentGroupId) return;
    const username = prompt('Enter username to add to this group:');
    if (!username) return;
    try {
      const res = await fetch(`${API}/api/groups/${currentGroupId}/members?username=${encodeURIComponent(username)}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${TOKEN}` }
      });
      if (res.ok) {
        loadGroupMembers(currentGroupId); // Refresh member list
        alert(`${username} has been added.`);
      } else {
        const error = await res.json();
        alert(error.detail || 'Failed to add user');
      }
    } catch (e) {
      alert('Error adding user');
    }
  });

  btnDeleteGroup.addEventListener('click', async () => {
    if (!currentGroupId) return;
    if (!confirm('Are you sure you want to delete this group? Only the creator can do this.')) return;
    try {
      const res = await fetch(`${API}/api/groups/${currentGroupId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${TOKEN}` }
      });
      if (res.ok || res.status === 204) {
        alert('Group deleted.');
        window.location.reload();
      } else {
        const error = await res.json();
        alert(error.detail || 'Failed to delete group (must be creator).');
      }
    } catch (e) {
      alert('Error deleting group');
    }
  });
  
  btnLeaveGroup.addEventListener('click', async () => {
    if (!currentGroupId) return;
    // We need my user_id to correctly hit the endpoint. Wait, let's fetch my profile first to get my ID.
    try {
      const meRes = await fetch(`${API}/api/me`, { headers: { Authorization: `Bearer ${TOKEN}` } });
      const meData = await meRes.json();
      
      const res = await fetch(`${API}/api/groups/${currentGroupId}/members/${meData.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${TOKEN}` }
      });
      if (res.ok || res.status === 204) {
        alert('Left group.');
        window.location.reload();
      } else {
        const error = await res.json();
        alert(error.detail || 'Failed to leave group / Creator cannot leave.');
      }
    } catch (e) {
      alert('Error leaving group');
    }
  });

  // ── Logout ─────────────────────────────────────────────
  window.logout = function () {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    window.location.href = '/';
  };

  // ── Init ───────────────────────────────────────────────
  loadUsers();

})();
