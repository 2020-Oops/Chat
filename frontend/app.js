/* app.js — Chat + Direct Messages frontend logic */
(function () {
  'use strict';

  // Shorthand for i18n translations
  const t = (key) => window.i18n ? window.i18n.t(key) : key;

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
  let currentRoomType = 'dm'; // 'dm' | 'group'
  let currentDmPeer = null; // username of the DM peer
  let currentGroupId = null; // currently selected group ID
  let socket = null;
  let reconnectTimer = null;
  let reconnectDelay = 1000;
  
  // Separate presence WebSocket (stays connected permanently)
  let presenceSocket = null;
  let presenceReconnectTimer = null;
  let presenceReconnectDelay = 1000;
  
  let allUsersCache = []; // To power the add-member user selection
  let allGroupsCache = []; // To power group search
  let currentGroupMembersCache = [];

  let selectedFile = null; // Currently selected file for upload

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
  const sidebarOverlay = document.getElementById('sidebar-overlay');
  const btnSidebar = document.getElementById('btn-sidebar');
  const btnSidebarClose = document.getElementById('btn-sidebar-close');

  // Modals & Group actions
  const createGroupModal = document.getElementById('create-group-modal');
  const btnCreateGroup = document.getElementById('btn-create-group');
  const btnCancelGroup = document.getElementById('btn-cancel-group');
  const btnSubmitGroup = document.getElementById('btn-submit-group');
  const newGroupNameInput = document.getElementById('new-group-name');
  
  const createGroupSearch = document.getElementById('create-group-search');
  const createGroupUsers = document.getElementById('create-group-users');
  let pendingCreateGroupMembers = [];
  
  // Header Actions
  const btnAddMember = document.getElementById('btn-add-member');
  const btnLeaveGroup = document.getElementById('btn-leave-group');
  const btnDeleteGroup = document.getElementById('btn-delete-group');
  
  const deleteGroupModal = document.getElementById('delete-group-modal');
  const btnCancelDeleteGroup = document.getElementById('btn-cancel-delete-group');
  const btnConfirmDeleteGroup = document.getElementById('btn-confirm-delete-group');
  
  const addMemberModal = document.getElementById('add-member-modal');
  const searchMemberInput = document.getElementById('search-member-input');
  const searchMemberResults = document.getElementById('search-member-results');
  const btnCancelMember = document.getElementById('btn-cancel-member');

  // Account Management
  const btnDeleteAccount = document.getElementById('btn-delete-account');
  const deleteAccountModal = document.getElementById('delete-account-modal');
  const btnCancelDelete = document.getElementById('btn-cancel-delete');
  const btnConfirmDelete = document.getElementById('btn-confirm-delete');
  const deletePasswordInput = document.getElementById('delete-password-input');

  // File Upload elements
  const btnAttach = document.getElementById('btn-attach');
  const fileInput = document.getElementById('file-input');
  const uploadPreview = document.getElementById('upload-preview');
  const previewFilename = document.getElementById('preview-filename');
  const btnPreviewRemove = document.getElementById('btn-preview-remove');

  function setSidebar(open) {
    document.body.classList.toggle('sidebar-open', open);
  }

  function isMobile() {
    return window.innerWidth <= 720;
  }

  // Back button (mobile)
  const btnBack = document.getElementById('btn-back');
  if (btnBack) {
    btnBack.addEventListener('click', () => {
      document.body.classList.remove('chat-open');
    });
  }

  if (btnSidebar) {
    btnSidebar.addEventListener('click', () => setSidebar(true));
  }
  if (btnSidebarClose) {
    btnSidebarClose.addEventListener('click', () => setSidebar(false));
  }
  if (sidebarOverlay) {
    sidebarOverlay.addEventListener('click', () => setSidebar(false));
  }

  const accountHeader = document.getElementById('account-header');
  if (accountHeader && ME) {
    accountHeader.textContent = `${ME}'s Account`;
  }

  function updateChatLayoutState() {
    const layout = document.querySelector('.chat-layout');
    if (!layout) return;
    if (currentRoom) {
      layout.classList.remove('no-chat-active');
    } else {
      layout.classList.add('no-chat-active');
    }
  }

  // ── Toast Notifications ──────────────────────────────
  const toastContainer = document.getElementById('toast-container');

  function showToast(message, type = 'info') {
    if (!toastContainer) return;
    const toast = document.createElement('div');
    // type can be 'info', 'success', 'error', 'warning'
    toast.className = `toast toast-${type}`;
    
    // Auto-remove icon depending on type
    const icons = {
      success: '✅ ',
      error: '❌ ',
      warning: '⚠️ ',
      info: 'ℹ️ '
    };
    const icon = icons[type] || '';

    toast.innerHTML = `
      <div class="toast-message">${icon}${escapeHtml(message)}</div>
      <button class="toast-close" title="Dismiss" aria-label="Close message">&times;</button>
    `;

    toastContainer.appendChild(toast);

    // Close button logic
    const closeBtn = toast.querySelector('.toast-close');
    
    const removeToast = () => {
      toast.classList.add('hiding');
      toast.addEventListener('animationend', () => {
        toast.remove();
      });
    };

    closeBtn.addEventListener('click', removeToast);

    // Auto dismiss after 4 seconds
    setTimeout(removeToast, 4000);
  }

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
    if (!currentRoom) {
      connBadge.style.display = 'none';
      btnSend.disabled = true;
      if (btnAttach) btnAttach.disabled = true;
      return;
    }
    connBadge.style.display = '';
    connBadge.className = `connection-badge ${ok ? 'connected' : 'disconnected'}`;
    connText.textContent = ok ? t('connected') : t('disconnected');
    btnSend.disabled = !ok;
    if (btnAttach) btnAttach.disabled = !ok;
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
    const sorted = [userA.toLowerCase(), userB.toLowerCase()].sort();
    return 'dm_' + sorted.join('_');
  }

  // ── Read Receipt Observer ─────────────────────────────
  const pendingReadIds = new Set();
  
  const readObserver = new IntersectionObserver((entries) => {
    let newlyReadIds = [];
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const msgElement = entry.target;
        const msgIdStr = msgElement.id;
        if (msgIdStr && msgIdStr.startsWith('msg-')) {
          newlyReadIds.push(parseInt(msgIdStr.replace('msg-', ''), 10));
        }
        readObserver.unobserve(msgElement);
      }
    });

    if (newlyReadIds.length > 0) {
      newlyReadIds.forEach(id => pendingReadIds.add(id));
      flushReadReceipts();
    }
  }, { threshold: 0.5 });

  function flushReadReceipts() {
    if (pendingReadIds.size > 0 && socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: 'mark_read',
        message_ids: Array.from(pendingReadIds)
      }));
      pendingReadIds.clear();
    }
  }
  
  const pendingDeliveredIds = new Set();
  function flushDeliveredReceipts() {
    if (pendingDeliveredIds.size > 0 && socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: 'mark_delivered',
        message_ids: Array.from(pendingDeliveredIds)
      }));
      pendingDeliveredIds.clear();
    }
  }

  function observeMessageForReadStatus(element) {
    readObserver.observe(element);
  }

  // ── Render helpers ───────────────────────────────────
  function renderMessage(msg) {
    hideEmptyPlaceholder();
    const isOwn = msg.sender.username === ME;
    const div = document.createElement('div');
    div.className = `message-bubble ${isOwn ? 'own' : ''}`;
    div.id = `msg-${msg.id}`;
    div.setAttribute('data-status', msg.status || 'SENT');

    // Status icons HTML
    let statusHtml = '';
    if (isOwn) {
      statusHtml = `
        <div class="status-indicator">
          <!-- Single Check (Sent) -->
          <svg class="status-icon icon-single-check" viewBox="0 0 24 24">
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
          </svg>
          <!-- Double Check (Delivered/Read) -->
          <svg class="status-icon icon-double-check" viewBox="0 0 24 24">
            <path d="M18 7l-1.41-1.41-6.34 6.34 1.41 1.41L18 7zm4.24-1.41L11.66 16.17 7.48 12l-1.41 1.41L11.66 19l12-12-1.42-1.41zM.41 13.41L6 19l1.41-1.41L1.83 12 .41 13.41z"/>
          </svg>
        </div>
      `;
    }

    div.innerHTML = `
      <div class="avatar">${avatarInitial(msg.sender.username)}</div>
      <div class="bubble-content">
        <div class="bubble-header">
          <span class="bubble-name">${escapeHtml(msg.sender.username)}</span>
          <span class="bubble-time">${formatTime(msg.timestamp)}</span>
          ${statusHtml}
        </div>
        ${msg.content ? `<div class="bubble-text">${escapeHtml(msg.content)}</div>` : ''}
        ${msg.file ? renderFileAttachment(msg.file) : ''}
      </div>
    `;
    messagesArea.appendChild(div);
    if (!isOwn) {
      observeMessageForReadStatus(div);
    }
    initAudioPlayers(div);
    scrollToBottom();
  }

  window.forceDownload = async function(url, filename) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(blobUrl);
      a.remove();
    } catch (e) {
      console.error(e);
      window.open(url, '_blank');
    }
  };

  function renderFileAttachment(file) {
    const fullUrl = file.url.startsWith('http') ? file.url : API + file.url;
    const isImage = file.mime_type.startsWith('image/');
    if (isImage) {
      return `
        <div class="file-attachment">
          <img src="${fullUrl}" alt="${escapeHtml(file.original_name)}" class="image-attachment" onclick="window.open('${fullUrl}', '_blank')">
        </div>
      `;
    }
    
    const isAudio = file.mime_type.startsWith('audio/');
    if (isAudio) {
      const sizeMb = (file.file_size / (1024 * 1024)).toFixed(2);
      const fileExt = file.mime_type.split('/')[1]?.toUpperCase() || 'AUDIO';
      return `
        <div class="custom-audio-player">
          <audio crossorigin="anonymous" preload="metadata" src="${fullUrl}" style="display:none"></audio>
          <button class="audio-play-btn">▶</button>
          
          <div class="audio-info-container">
            <div class="audio-filename" title="${escapeHtml(file.original_name)}">${escapeHtml(file.original_name)}</div>
            <div class="audio-timeline"><div class="audio-progress"></div></div>
            <div class="audio-meta">${sizeMb} MB • ${escapeHtml(fileExt)}</div>
          </div>
          
          <span class="audio-time">0:00</span>
          <a href="javascript:void(0)" class="audio-download-btn" onclick="forceDownload('${fullUrl}', '${escapeHtml(file.original_name)}')" title="${t('download')}">
            <svg viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
          </a>
        </div>
      `;
    }
    
    // Generic file icon/link
    const sizeMb = (file.file_size / (1024 * 1024)).toFixed(2);
    return `
      <div class="file-message">
        <span class="file-icon">📄</span>
        <div class="file-info">
          <span class="file-name" title="${escapeHtml(file.original_name)}">${escapeHtml(file.original_name)}</span>
          <span class="file-meta">${sizeMb} MB • ${escapeHtml(file.mime_type)}</span>
        </div>
        <a href="javascript:void(0)" class="file-download" onclick="forceDownload('${fullUrl}', '${escapeHtml(file.original_name)}')">${t('download')}</a>
      </div>
    `;
  }

  function formatAudioTime(seconds) {
    if (isNaN(seconds) || !isFinite(seconds)) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  function initAudioPlayers(container) {
    const players = container.querySelectorAll('.custom-audio-player');
    players.forEach(player => {
      const audio = player.querySelector('audio');
      const progress = player.querySelector('.audio-progress');
      const timeDisplay = player.querySelector('.audio-time');
      const playBtn = player.querySelector('.audio-play-btn');
      const timeline = player.querySelector('.audio-timeline');

      let isDragging = false;

      audio.addEventListener('loadedmetadata', () => {
        timeDisplay.textContent = formatAudioTime(audio.duration);
      });

      audio.addEventListener('timeupdate', () => {
        if (isDragging) return;
        const percent = (audio.currentTime / audio.duration) * 100;
        progress.style.width = `${percent || 0}%`;
        timeDisplay.textContent = formatAudioTime(audio.currentTime);
      });

      audio.addEventListener('ended', () => {
        playBtn.innerHTML = '▶';
        progress.style.width = '0%';
        timeDisplay.textContent = formatAudioTime(audio.duration);
      });

      playBtn.addEventListener('click', () => {
        if (audio.paused) {
          // Pause others
          document.querySelectorAll('.custom-audio-player audio').forEach(a => {
            if (a !== audio) {
              a.pause();
              const btn = a.parentElement.querySelector('.audio-play-btn');
              if (btn) btn.innerHTML = '▶';
            }
          });
          audio.play().catch(e => console.error("Playback failed", e));
          playBtn.innerHTML = '⏸';
        } else {
          audio.pause();
          playBtn.innerHTML = '▶';
        }
      });

      let dragPercent = 0;

      function updateTimelineVisual(e) {
        const rect = timeline.getBoundingClientRect();
        let percent = (e.clientX - rect.left) / rect.width;
        percent = Math.max(0, Math.min(1, percent));
        dragPercent = percent;
        progress.style.width = `${percent * 100}%`;
        if (audio.duration) {
          timeDisplay.textContent = formatAudioTime(percent * audio.duration);
        }
      }

      timeline.addEventListener('mousedown', (e) => {
        isDragging = true;
        updateTimelineVisual(e);
      });

      document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        updateTimelineVisual(e);
      });

      document.addEventListener('mouseup', () => {
        if (isDragging) {
          isDragging = false;
          if (audio.duration) {
            audio.currentTime = dragPercent * audio.duration;
          }
        }
      });
    });
  }

  function renderSystem(content) {
    const div = document.createElement('div');
    div.className = 'message-system';
    div.innerHTML = `<span class="sys-pill">${escapeHtml(content)}</span>`;
    messagesArea.appendChild(div);
    scrollToBottom();
  }

  function renderOnlineList(users) {
    if (!onlineList) return;
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
  
  function updateSidebarItem(roomStr, content, unread = false) {
    let li = null;
    let badgeId = null;
    
    // Check if it's a DM (roomStr = dm_userX_userY)
    if (roomStr && roomStr.startsWith('dm_')) {
      // Find which peer we are talking to in this DM
      // Use dmRoomName() comparison instead of naive split (handles underscores in usernames)
      let peer = null;
      for (const u of (allUsersCache || [])) {
        if (dmRoomName(ME, u.username) === roomStr) { peer = u.username; break; }
      }
      if (!peer) return;
      
      if (allUsersCache) {
        const cacheUser = allUsersCache.find(u => u.username === peer);
        let needsRerender = false;
        if (cacheUser) {
          if (!cacheUser.last_message && activeSidebarTab === 'chats') {
            needsRerender = true;
          }
          cacheUser.last_message = content || t('file_preview');
          if (unread) cacheUser.has_unread = true;
        }
        if (needsRerender) {
          renderDmListBase();
        }
      }
      
      li = document.querySelector(`#dm-list li[data-peer="${CSS.escape(peer)}"]`);
      badgeId = `unread-${CSS.escape(peer)}`;
    } 
    // Check if it's a Group
    else if (roomStr && roomStr.startsWith('group_')) {
      const groupId = roomStr.substring(6);
      
      if (allGroupsCache) {
        const cacheGroup = allGroupsCache.find(g => g.id == groupId);
        if (cacheGroup) {
          cacheGroup.last_message = content || t('file_preview');
          if (unread) cacheGroup.has_unread = true;
        }
      }

      li = document.querySelector(`#group-list li[data-group="${CSS.escape(groupId)}"]`);
      badgeId = `unread-group-${CSS.escape(groupId)}`;
    }
    
    if (li) {
      const msgSpan = li.querySelector('.dm-last-message');
      if (msgSpan) {
        msgSpan.textContent = content || t('file_preview');
      }
      
      if (unread && badgeId) {
        const badge = document.getElementById(badgeId);
        if (badge) {
          badge.style.display = 'inline-block';
        }
      }
    }
  }

  // Sidebar Tabs Logic
  let activeSidebarTab = 'chats'; // 'chats' | 'contacts' | 'settings'
  const navBtnContacts = document.getElementById('nav-btn-contacts');
  const navBtnChats = document.getElementById('nav-btn-chats');
  const navBtnSettings = document.getElementById('nav-btn-settings');
  
  const groupListHeader = document.getElementById('group-list-header');
  const groupSearchContainer = document.getElementById('group-search-container');
  const dmListHeader = document.getElementById('dm-list-header');
  const searchUsersContainer = document.querySelector('#search-users').parentElement;
  const settingsView = document.getElementById('settings-view');
  const onlineSection = document.getElementById('online-section');

  if (navBtnContacts) navBtnContacts.addEventListener('click', () => switchSidebarTab('contacts'));
  if (navBtnChats) navBtnChats.addEventListener('click', () => switchSidebarTab('chats'));
  if (navBtnSettings) navBtnSettings.addEventListener('click', () => switchSidebarTab('settings'));

  // Search inputs
  const searchUsersInput = document.getElementById('search-users');
  const searchGroupsInput = document.getElementById('search-groups');

  if (searchUsersInput) {
    searchUsersInput.addEventListener('input', () => renderDmListBase());
  }
  if (searchGroupsInput) {
    searchGroupsInput.addEventListener('input', () => renderGroupListBase());
  }

  function switchSidebarTab(tab) {
    activeSidebarTab = tab;
    if (navBtnContacts) navBtnContacts.classList.toggle('active', tab === 'contacts');
    if (navBtnChats) navBtnChats.classList.toggle('active', tab === 'chats');
    if (navBtnSettings) navBtnSettings.classList.toggle('active', tab === 'settings');
    
    // Toggle Groups
    const groupDisplay = tab === 'chats' ? '' : 'none';
    if (groupListHeader) groupListHeader.style.display = groupDisplay;
    if (groupSearchContainer) groupSearchContainer.style.display = groupDisplay;
    if (groupList) groupList.style.display = groupDisplay;
    
    // Toggle DMs/Contacts
    const dmDisplay = (tab === 'chats' || tab === 'contacts') ? '' : 'none';
    if (dmListHeader) {
      dmListHeader.style.display = dmDisplay;
      dmListHeader.textContent = tab === 'chats' ? t('direct_messages') : t('all_contacts');
      dmListHeader.style.marginTop = tab === 'chats' ? '1rem' : '0';
    }
    if (searchUsersContainer) searchUsersContainer.style.display = dmDisplay;
    if (dmList) dmList.style.display = dmDisplay;
    
    // Toggle Settings and Online list
    if (settingsView) settingsView.style.display = tab === 'settings' ? 'flex' : 'none';
    if (onlineSection) onlineSection.style.display = tab === 'settings' ? 'none' : '';
    
    if (tab !== 'settings') {
      renderDmListBase();
      renderGroupListBase();
    }
  }

  function renderDmListBase() {
    if (!allUsersCache) return;
    const query = searchUsersInput ? searchUsersInput.value.trim().toLowerCase() : '';
    let baseList;
    if (activeSidebarTab === 'chats') {
       baseList = allUsersCache.filter(u => u.last_message);
       const emptyText = dmEmpty.querySelector('span');
       if (emptyText) emptyText.textContent = t('no_active_chats');
    } else {
       baseList = allUsersCache;
       const emptyText = dmEmpty.querySelector('span');
       if (emptyText) emptyText.textContent = t('no_contacts');
    }
    // Apply search filter
    if (query) {
       baseList = baseList.filter(u => u.username.toLowerCase().includes(query));
    }
    renderDmList(baseList);
  }

  function renderGroupListBase() {
    if (!allGroupsCache) return;
    const query = searchGroupsInput ? searchGroupsInput.value.trim().toLowerCase() : '';
    let filtered = allGroupsCache;
    if (query) {
      filtered = allGroupsCache.filter(g => g.name.toLowerCase().includes(query));
    }
    renderGroupList(filtered);
  }

  function renderDmList(users) {
    // Remove old DM entries (keep #dm-empty)
    dmList.querySelectorAll('li:not(#dm-empty)').forEach(li => li.remove());

    if (!users || users.length === 0) {
      dmEmpty.style.display = '';
      return;
    }
    dmEmpty.style.display = 'none';

    users.forEach(user => {
      const li = document.createElement('li');
      li.dataset.peer = user.username;
      
      // Persist active state if this is the currently opened DM
      if (currentRoomType === 'dm' && currentDmPeer === user.username) {
        li.className = 'active';
      } else {
        li.className = '';
      }
      
      const lastMsgText = user.last_message || t('chat_empty_preview');
      const isOnlineStr = user.is_online ? 'online' : 'offline';
      li.innerHTML = `
        <div class="avatar-container">
          <span class="dm-avatar">${avatarInitial(user.username)}</span>
          <span class="status-dot ${isOnlineStr}" id="status-dot-${CSS.escape(user.username)}"></span>
        </div>
        <div class="dm-info">
          <span class="dm-username">${escapeHtml(user.username)}</span>
          <span class="dm-last-message">${escapeHtml(lastMsgText)}</span>
        </div>
        <span class="dm-unread" id="unread-${CSS.escape(user.username)}" style="display:${user.has_unread ? 'inline-block' : 'none'}"></span>
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
        allUsersCache = users;
        renderDmListBase();
      }
      if (groupsRes.ok) {
        const groups = await groupsRes.json();
        allGroupsCache = groups;
        renderGroupListBase();
      }
    } catch (e) {
      console.warn('Failed to load data', e);
    }
  }

  function renderGroupList(groups) {
    // Clear old entries first (same pattern as renderDmList)
    groupList.querySelectorAll('li:not(#group-empty)').forEach(li => li.remove());

    if (!groups || groups.length === 0) {
      groupEmpty.style.display = '';
      return;
    }
    groupEmpty.style.display = 'none';

    groups.forEach(group => {
      const li = document.createElement('li');
      li.dataset.group = group.id;

      // Persist active state if this is the currently opened Group
      if (currentRoomType === 'group' && currentGroupId === group.id) {
        li.className = 'active';
      } else {
        li.className = '';
      }

      const lastMsgText = group.last_message || t('chat_empty_preview');
      li.innerHTML = `
        <span class="dm-avatar">👥</span>
        <div class="dm-info">
          <span class="dm-username">${escapeHtml(group.name)}</span>
          <span class="dm-last-message">${escapeHtml(lastMsgText)}</span>
        </div>
        <span class="dm-unread" id="unread-group-${group.id}" style="display:${group.has_unread ? 'inline-block' : 'none'}"></span>
      `;
      li.addEventListener('click', () => openGroup(group.id, group.name, group.creator_id));
      groupList.appendChild(li);
    });
  }

  function openDm(peer) {
    if (activeSidebarTab !== 'chats') {
      switchSidebarTab('chats');
    }
    currentDmPeer = peer;
    currentGroupId = null;
    const peerUser = (allUsersCache || []).find(u => u.username === peer);
    const room = dmRoomName(ME, peer);
    currentRoomType = 'dm';
    if (isMobile()) {
      document.body.classList.add('chat-open');
    } else {
      setSidebar(false);
    }

    // Update DM sidebar: activate peer
    dmList.querySelectorAll('li').forEach(li => {
      li.classList.toggle('active', li.dataset.peer === peer);
    });
    groupList.querySelectorAll('li').forEach(li => li.classList.remove('active'));

    // Clear unread badge
    const badge = document.getElementById(`unread-${CSS.escape(peer)}`);
    if (badge) { badge.style.display = 'none'; badge.textContent = ''; }
    if (allUsersCache) {
      const u = allUsersCache.find(u => u.username === peer);
      if (u) u.has_unread = false;
    }

    // Update header
    headerIcon.innerHTML = `<div class="avatar">${avatarInitial(peer)}</div>`;
    headerRoom.textContent = peer;
    headerMeta.textContent = t('direct_message_meta');
    messageInput.placeholder = `${t('message_at')}${peer}…`;
    messageInput.removeAttribute('disabled');
    if (btnAttach) btnAttach.removeAttribute('disabled');
    
    // Hide group actions
    btnAddMember.style.display = 'none';
    btnLeaveGroup.style.display = 'none';
    btnDeleteGroup.style.display = 'none';

    messagesArea.innerHTML = '';

    const queryParams = peerUser ? { user_id: peerUser.id } : { room };
    loadHistory(room, queryParams).then(() => connect(room));
  }

  function openGroup(groupId, groupName, creatorId) {
    currentGroupId = groupId;
    currentDmPeer = null;
    const room = `group_${groupId}`;
    currentRoomType = 'group';
    if (isMobile()) {
      document.body.classList.add('chat-open');
    } else {
      setSidebar(false);
    }

    // Update sidebar
    groupList.querySelectorAll('li').forEach(li => {
      li.classList.toggle('active', li.dataset.group == groupId);
    });
    dmList.querySelectorAll('li').forEach(li => li.classList.remove('active'));

    const badge = document.getElementById(`unread-group-${groupId}`);
    if (badge) { badge.style.display = 'none'; badge.textContent = ''; }
    if (allGroupsCache) {
      const g = allGroupsCache.find(g => g.id == groupId);
      if (g) g.has_unread = false;
    }

    // Update header
    headerIcon.innerHTML = `<div class="avatar">${avatarInitial(groupName)}</div>`;
    headerRoom.textContent = groupName;
    headerMeta.textContent = t('group_chat_meta');
    messageInput.placeholder = `${t('message_group')}${groupName}…`;
    messageInput.removeAttribute('disabled');
    if (btnAttach) btnAttach.removeAttribute('disabled');
    
    // Show group actions
    btnAddMember.style.display = 'block';
    // fetch my user ID to compare with creatorId (or decode JWT, or save my ID on login)
    // For now, allow leave for all, and delete if seems to be creator (handled by backend mostly)
    btnLeaveGroup.style.display = 'block';
    btnDeleteGroup.style.display = 'block';

    messagesArea.innerHTML = '';

    loadHistory(room, { group_id: groupId }).then(() => connect(room));
  }

  async function loadGroupMembers(groupId) {
    try {
      const res = await fetch(`${API}/api/groups/${groupId}/members`, {
        headers: { Authorization: `Bearer ${TOKEN}` },
      });
      if (!res.ok) return;
      const members = await res.json();
      currentGroupMembersCache = members.map(m => m.user.username);
      renderOnlineList(currentGroupMembersCache);
    } catch (e) {
      console.warn('Failed to load members', e);
    }
  }

  // ── Load history ─────────────────────────────────────
  async function loadHistory(room, params = {}) {
    try {
      let url = `${API}/api/messages?limit=50`;
      if (params.user_id) url += `&user_id=${params.user_id}`;
      else if (params.group_id) url += `&group_id=${params.group_id}`;
      else if (room) url += `&room=${encodeURIComponent(room)}`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${TOKEN}` },
      });
      if (res.status === 401) { logout(); return; }
      if (!res.ok) return;
      const msgs = await res.json();
      messagesArea.innerHTML = '';
      msgs.forEach(renderMessage);
      
      msgs.forEach(m => {
        if (m.sender.username !== ME && m.status === 'SENT') {
          pendingDeliveredIds.add(m.id);
        }
      });

      // Show empty-chat placeholder if no messages
      if (msgs.length === 0) {
        showEmptyPlaceholder();
      }
    } catch (e) {
      console.warn('History load failed', e);
    }
  }

  function showEmptyPlaceholder() {
    hideEmptyPlaceholder();
    const el = document.createElement('div');
    el.id = 'empty-chat-placeholder';
    el.className = 'empty-chat-placeholder';
    el.textContent = t('chat_empty');
    messagesArea.appendChild(el);
  }

  function hideEmptyPlaceholder() {
    const el = document.getElementById('empty-chat-placeholder');
    if (el) el.remove();
  }

  function connect(room) {
    if (!room) return;
    if (socket) {
      socket.onclose = null;
      socket.close();
      socket = null;
    }
    clearTimeout(reconnectTimer);
    currentRoom = room;
    updateChatLayoutState();
    setConnected(false);
    connText.textContent = t('connecting');

    const url = `${WS_BASE}/ws/${encodeURIComponent(room)}?token=${TOKEN}`;
    socket = new WebSocket(url);

    socket.onopen = () => {
      setConnected(true);
      reconnectDelay = 1000;
      flushReadReceipts();
      flushDeliveredReceipts();
    };

    socket.onmessage = (event) => {
      let data;
      try { data = JSON.parse(event.data); } catch { return; }

      if (data.type === 'status_update') {
        data.message_ids.forEach(id => {
          const msgEl = document.getElementById(`msg-${id}`);
          if (msgEl) {
            msgEl.setAttribute('data-status', data.status);
          }
        });
        return;
      }
      
      // user_status events are now handled by presenceSocket,
      // but handle them here too in case they arrive on the room socket
      if (data.type === 'user_status') {
         handleUserStatus(data);
         return;
      }

      if (data.type === 'message') {
        if (data.sender.username !== ME && socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({
            type: 'mark_delivered',
            message_ids: [data.id]
          }));
        }

        if (data.room === currentRoom) {
          renderMessage(data);
          updateSidebarItem(data.room, data.content, false);
        } else {
          // Message for a different room, update sidebar and show unread
          updateSidebarItem(data.room, data.content, true);
        }
        
      } else if (data.type === 'chat_deleted') {
        handleChatDeleted(data.room);
      } else if (data.type === 'system') {
        // Show system messages for the currently open room, except join/leave noise
        if (data.room === currentRoom) {
          if (!data.content.endsWith('joined the room') && !data.content.endsWith('left the room')) {
            renderSystem(data.content);
          }
        }
      } else if (data.type === 'group_joined') {
        // We were added to a new group, or we created one!
        loadUsers();
      }
    };

    socket.onclose = (ev) => {
      setConnected(false);
      if (ev.code === 4001) { logout(); return; }
      connText.textContent = `${t('reconnecting')} ${Math.round(reconnectDelay / 1000)}${t('reconnecting_suffix')}`;
      reconnectTimer = setTimeout(() => {
        reconnectDelay = Math.min(reconnectDelay * 2, 30000);
        if (currentRoom) connect(currentRoom);
      }, reconnectDelay);
    };

    socket.onerror = () => { socket.close(); };
  }

  // ── Channel switching is removed for DM-only mode ──

  // ── File Upload Handlers ───────────────────────────
  if (btnAttach) {
    btnAttach.addEventListener('click', () => fileInput.click());
  }

  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      // 10MB Limit
      if (file.size > 10 * 1024 * 1024) {
        showToast(t('toast_file_large'), 'error');
        fileInput.value = '';
        return;
      }

      selectedFile = file;
      previewFilename.textContent = file.name;
      uploadPreview.style.display = 'block';
    });
  }

  if (btnPreviewRemove) {
    btnPreviewRemove.addEventListener('click', () => {
      selectedFile = null;
      fileInput.value = '';
      uploadPreview.style.display = 'none';
    });
  }

  async function uploadFile() {
    if (!selectedFile) return null;
    
    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const res = await fetch(`${API}/api/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${TOKEN}`
        },
        body: formData
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Upload failed');
      }

      const data = await res.json();
      return data;
    } catch (e) {
      showToast(e.message, 'error');
      return null;
    }
  }

  // ── Send message ───────────────────────────────────────
  async function sendMessage() {
    const content = messageInput.value.trim();
    if (!content && !selectedFile) return;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;

    let file_id = null;
    if (selectedFile) {
      btnSend.disabled = true;
      const fileData = await uploadFile();
      btnSend.disabled = false;
      if (!fileData) return; // Toast shown in uploadFile
      file_id = fileData.id;
      
      // Clear preview
      selectedFile = null;
      fileInput.value = '';
      uploadPreview.style.display = 'none';
    }
    
    const payload = { 
      content: content || (file_id ? '' : ''), // Can send empty content with file
    };
    if (file_id) payload.file_id = file_id;
    
    // If only file, set content to filename or something
    if (!content && file_id) {
       // payload.content = ''; // Backend handles empty content if file_id is present?
       // Let's check backend... actually I made content=Text, nullable=False in models.py
       // So I should send at least an empty string or the filename.
       // The user prompt says "Single File Limit: Server-side check... Show preview... hit Send"
       // Usually it's nice to send filename as content if empty.
    }

    if (currentRoomType === 'group' && currentGroupId) {
       payload.group_id = currentGroupId;
    } else if (currentRoomType === 'dm' && currentDmPeer) {
       const peerUser = allUsersCache.find(u => u.username === currentDmPeer);
       if (peerUser) payload.recipient_id = peerUser.id;
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
  
  function renderCreateGroupUsers(query = '') {
    if (!createGroupUsers) return;
    createGroupUsers.innerHTML = '';
    
    const queryLower = query.toLowerCase();
    const availableUsers = allUsersCache.filter(u => {
      if (u.username === ME) return false;
      if (queryLower && !u.username.toLowerCase().includes(queryLower)) return false;
      return true;
    });

    if (availableUsers.length === 0) {
      createGroupUsers.innerHTML = `<li class="dm-empty"><span style="font-size:0.8rem;color:var(--text-muted);">${t('no_users_found')}</span></li>`;
      return;
    }

    availableUsers.forEach(u => {
      const li = document.createElement('li');
      if (pendingCreateGroupMembers.includes(u.username)) {
        li.classList.add('selected');
      }
      li.innerHTML = `
        <span class="dm-avatar">${avatarInitial(u.username)}</span>
        <span class="dm-username">${escapeHtml(u.username)}</span>
      `;
      li.addEventListener('click', () => {
        if (pendingCreateGroupMembers.includes(u.username)) {
          pendingCreateGroupMembers = pendingCreateGroupMembers.filter(n => n !== u.username);
          li.classList.remove('selected');
        } else {
          pendingCreateGroupMembers.push(u.username);
          li.classList.add('selected');
        }
      });
      createGroupUsers.appendChild(li);
    });
  }

  btnCreateGroup.addEventListener('click', () => {
    createGroupModal.style.display = 'flex';
    newGroupNameInput.value = '';
    pendingCreateGroupMembers = [];
    if (createGroupSearch) {
      createGroupSearch.value = '';
      createGroupSearch.focus();
    }
    renderCreateGroupUsers();
  });
  
  if (createGroupSearch) {
    createGroupSearch.addEventListener('input', (e) => {
      renderCreateGroupUsers(e.target.value);
    });
  }
  
  btnCancelGroup.addEventListener('click', () => {
    createGroupModal.style.display = 'none';
    newGroupNameInput.value = '';
    pendingCreateGroupMembers = [];
  });
  
  btnSubmitGroup.addEventListener('click', async () => {
    const name = newGroupNameInput.value.trim();
    if (!name) return;
    try {
      btnSubmitGroup.disabled = true;
      const res = await fetch(`${API}/api/groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
        body: JSON.stringify({ 
          name, 
          initial_members: pendingCreateGroupMembers 
        })
      });
      if (res.ok) {
        createGroupModal.style.display = 'none';
        newGroupNameInput.value = '';
        pendingCreateGroupMembers = [];
        showToast(t('toast_group_created'), 'success');
        loadUsers(); // Refresh groups
      } else {
        const error = await res.json();
        showToast(error.detail || t('toast_group_create_err'), 'error');
      }
    } catch (e) {
      console.error(e);
      showToast(t('toast_group_create_ex'), 'error');
    } finally {
      btnSubmitGroup.disabled = false;
    }
  });

  // ── Add Member to Group Modal Logic ────────────────────────────────────
  function renderMemberSearchResults(query = '') {
    if (!searchMemberResults) return;
    searchMemberResults.innerHTML = '';
    
    // Filter available users: Exclude myself, exclude current members, match query
    const queryLower = query.toLowerCase();
    const availableUsers = allUsersCache.filter(u => {
      const username = u.username;
      if (username === ME) return false;
      if (currentGroupMembersCache.includes(username)) return false;
      if (queryLower && !username.toLowerCase().includes(queryLower)) return false;
      return true;
    });

    if (availableUsers.length === 0) {
      searchMemberResults.innerHTML = `<li class="dm-empty"><span style="font-size:0.8rem;color:var(--text-muted);">${t('no_users_found')}</span></li>`;
      return;
    }

    // Render list
    availableUsers.forEach(u => {
      const li = document.createElement('li');
      li.style.cursor = 'pointer';
      li.innerHTML = `
        <span class="dm-avatar">${avatarInitial(u.username)}</span>
        <span class="dm-username">${escapeHtml(u.username)}</span>
      `;
      li.addEventListener('click', async () => {
        try {
          const res = await fetch(`${API}/api/groups/${currentGroupId}/members?username=${encodeURIComponent(u.username)}`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${TOKEN}` }
          });
          if (res.ok) {
            loadGroupMembers(currentGroupId); // Refresh member list
            showToast(`${u.username} ${t('toast_member_added')}`, 'success');
            if (addMemberModal) addMemberModal.style.display = 'none';
          } else {
            const error = await res.json();
            showToast(error.detail || t('toast_member_add_err'), 'error');
          }
        } catch (e) {
          showToast(t('toast_member_add_ex'), 'error');
        }
      });
      searchMemberResults.appendChild(li);
    });
  }

  if (btnAddMember) {
    btnAddMember.addEventListener('click', () => {
      if (!currentGroupId) return;
      if (addMemberModal) {
        addMemberModal.style.display = 'flex';
        if (searchMemberInput) {
          searchMemberInput.value = '';
          searchMemberInput.focus();
        }
        renderMemberSearchResults();
      }
    });
  }

  if (btnCancelMember) {
    btnCancelMember.addEventListener('click', () => {
      if (addMemberModal) addMemberModal.style.display = 'none';
    });
  }

  if (searchMemberInput) {
    searchMemberInput.addEventListener('input', (e) => {
      renderMemberSearchResults(e.target.value);
    });
  }

  // ── Group Deletion Custom Modal Logic ────────────────────────────────────
  
  if (btnDeleteGroup) {
    btnDeleteGroup.addEventListener('click', () => {
      if (!currentGroupId) return;
      if (deleteGroupModal) {
        deleteGroupModal.style.display = 'flex';
      }
    });
  }
  
  if (btnCancelDeleteGroup) {
    btnCancelDeleteGroup.addEventListener('click', () => {
      if (deleteGroupModal) {
        deleteGroupModal.style.display = 'none';
      }
    });
  }
  
  if (btnConfirmDeleteGroup) {
    btnConfirmDeleteGroup.addEventListener('click', async () => {
      if (!currentGroupId) return;
      try {
        btnConfirmDeleteGroup.disabled = true;
        const res = await fetch(`${API}/api/groups/${currentGroupId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${TOKEN}` }
        });
        if (res.ok || res.status === 204) {
          if (deleteGroupModal) deleteGroupModal.style.display = 'none';
          showToast(t('toast_group_deleted'), 'success');
          messagesArea.innerHTML = '';
          headerIcon.innerHTML = '';
          headerRoom.textContent = t('select_chat_header');
          headerMeta.textContent = '';
          messageInput.setAttribute('disabled', 'true');
          if (btnAttach) btnAttach.setAttribute('disabled', 'true');
          btnAddMember.style.display = 'none';
          btnLeaveGroup.style.display = 'none';
          btnDeleteGroup.style.display = 'none';
          currentGroupId = null;
          currentRoomType = 'dm'; // fallback
          currentDmPeer = null;
          currentRoom = null;
          updateChatLayoutState();
          if (socket) {
            socket.onclose = null;
            socket.close();
            socket = null;
          }
          setConnected(false);
          loadUsers();
        } else {
          const error = await res.json();
          showToast(error.detail || t('toast_group_del_err'), 'error');
        }
      } catch (e) {
        console.error('Delete group error:', e);
        showToast(t('toast_group_del_ex'), 'error');
      } finally {
        btnConfirmDeleteGroup.disabled = false;
      }
    });
  }
  
  btnLeaveGroup.addEventListener('click', async () => {
    if (!currentGroupId) return;
    try {
      const meRes = await fetch(`${API}/api/me`, { headers: { Authorization: `Bearer ${TOKEN}` } });
      const meData = await meRes.json();
      
      const res = await fetch(`${API}/api/groups/${currentGroupId}/members/${meData.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${TOKEN}` }
      });
      if (res.ok || res.status === 204) {
        showToast(t('toast_left_group'), 'success');
        messagesArea.innerHTML = '';
        headerIcon.innerHTML = '';
        headerRoom.textContent = t('select_chat_header');
        headerMeta.textContent = '';
        messageInput.setAttribute('disabled', 'true');
        if (btnAttach) btnAttach.setAttribute('disabled', 'true');
        btnAddMember.style.display = 'none';
        btnLeaveGroup.style.display = 'none';
        btnDeleteGroup.style.display = 'none';
        currentGroupId = null;
        currentRoomType = 'dm'; // fallback
        currentDmPeer = null;
        currentRoom = null;
        updateChatLayoutState();
        if (socket) {
          socket.onclose = null;
          socket.close();
          socket = null;
        }
        setConnected(false);
        loadUsers();
      } else {
        const error = await res.json();
        showToast(error.detail || t('toast_leave_err'), 'error');
      }
    } catch (e) {
      console.error('Leave group error:', e);
      showToast(t('toast_leave_ex'), 'error');
    }
  });

  // ── Account Deletion ──────────────────────────────────────
  if (btnDeleteAccount) {
    btnDeleteAccount.addEventListener('click', () => {
      deleteAccountModal.style.display = 'flex';
      deletePasswordInput.value = '';
      deletePasswordInput.focus();
    });
  }

  if (btnCancelDelete) {
    btnCancelDelete.addEventListener('click', () => {
      deleteAccountModal.style.display = 'none';
      deletePasswordInput.value = '';
    });
  }

  if (btnConfirmDelete) {
    btnConfirmDelete.addEventListener('click', async () => {
      const password = deletePasswordInput.value;
      if (!password) {
        showToast(t('toast_pw_required'), 'warning');
        return;
      }
      btnConfirmDelete.disabled = true;
      try {
        const res = await fetch(`${API}/api/me`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${TOKEN}`,
          },
          body: JSON.stringify({ password }),
        });
        
        if (res.ok || res.status === 204) {
          showToast(t('toast_acc_deleted'), 'success');
          setTimeout(() => logout(), 1000);
        } else {
          const error = await res.json();
          showToast(error.detail || t('toast_acc_del_err'), 'error');
        }
      } catch (e) {
        console.error(e);
        showToast(t('toast_acc_del_ex'), 'error');
      } finally {
        btnConfirmDelete.disabled = false;
      }
    });
  }

  // ── Logout ─────────────────────────────────────────────
  window.logout = function () {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    window.location.href = '/';
  };

  // ── Context Menu Logic ──────────────────────────────────────────
  const contextMenu = document.getElementById('context-menu');
  const btnContextDelete = document.getElementById('btn-context-delete');
  let contextMenuTargetId = null;
  let contextMenuTargetType = null;

  const sidebarLists = [dmList, groupList];
  sidebarLists.forEach(list => {
    if (!list) return;
    list.addEventListener('contextmenu', (e) => {
      const li = e.target.closest('li');
      if (!li || li.classList.contains('dm-empty')) return;
      
      e.preventDefault();
      
      if (li.dataset.peer) {
        contextMenuTargetId = li.dataset.peer;
        contextMenuTargetType = 'dm';
      } else if (li.dataset.group) {
        contextMenuTargetId = li.dataset.group;
        contextMenuTargetType = 'group';
      } else {
        return;
      }
      
      if (contextMenu) {
        contextMenu.style.display = 'block';
        let x = e.clientX;
        let y = e.clientY;
        
        const menuWidth = contextMenu.offsetWidth;
        const menuHeight = contextMenu.offsetHeight;
        if (x + menuWidth > window.innerWidth) x = window.innerWidth - menuWidth - 5;
        if (y + menuHeight > window.innerHeight) y = window.innerHeight - menuHeight - 5;
        
        contextMenu.style.left = `${x}px`;
        contextMenu.style.top = `${y}px`;
      }
    });
  });

  document.addEventListener('click', (e) => {
    if (contextMenu && contextMenu.style.display === 'block' && !contextMenu.contains(e.target)) {
      contextMenu.style.display = 'none';
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && contextMenu && contextMenu.style.display === 'block') {
      contextMenu.style.display = 'none';
    }
  });

  if (btnContextDelete) {
    btnContextDelete.addEventListener('click', async () => {
      if (contextMenu) contextMenu.style.display = 'none';
      if (contextMenuTargetType === 'group') {
        currentGroupId = parseInt(contextMenuTargetId, 10); 
        if (deleteGroupModal) deleteGroupModal.style.display = 'flex';
      } else if (contextMenuTargetType === 'dm') {
        const roomName = dmRoomName(ME, contextMenuTargetId);
        try {
          const res = await fetch(`${API}/api/messages?room=${encodeURIComponent(roomName)}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${TOKEN}` }
          });
          if (res.ok || res.status === 204) {
            showToast(t('toast_chat_deleted'), 'success');
            if (currentDmPeer === contextMenuTargetId) {
              messagesArea.innerHTML = '';
              const emptySpan = document.createElement('div');
              emptySpan.className = 'dm-empty';
              emptySpan.innerHTML = `<span style="font-size:0.8rem;color:var(--text-muted);margin:1rem;display:block;">${t('chat_empty')}</span>`;
              messagesArea.appendChild(emptySpan);
            }
            loadUsers();
          } else {
            const err = await res.json();
            showToast(err.detail || t('toast_chat_del_err'), 'error');
          }
        } catch (e) {
          showToast(t('toast_server_err'), 'error');
        }
      }
    });
  }

  // ── Shared status handler ───────────────────────────
  function handleUserStatus(data) {
    const { username, status } = data;
    if (allUsersCache) {
      const cacheUser = allUsersCache.find(u => u.username === username);
      if (cacheUser) {
        cacheUser.is_online = (status === 'online');
      }
    }
    const dot = document.getElementById(`status-dot-${CSS.escape(username)}`);
    if (dot) {
      if (status === 'online') {
        dot.classList.add('online');
        dot.classList.remove('offline');
      } else {
        dot.classList.add('offline');
        dot.classList.remove('online');
      }
    }
  }

  // ── Chat deleted handler ─────────────────────────────
  function handleChatDeleted(roomStr) {
    if (!roomStr) return;

    // Find peer username from room string
    let peerUsername = null;
    for (const u of (allUsersCache || [])) {
      if (dmRoomName(ME, u.username) === roomStr) {
        peerUsername = u.username;
        break;
      }
    }

    // Clear last_message from cache so it disappears from Chats tab
    if (peerUsername) {
      const cached = allUsersCache.find(u => u.username === peerUsername);
      if (cached) cached.last_message = null;
    }

    // If this deleted chat is currently open — clear the messages area
    if (currentRoom && (currentRoom.toLowerCase() === roomStr || currentRoom === roomStr)) {
      messagesArea.innerHTML = '';
      showEmptyPlaceholder();
    }

    // Re-render sidebar to remove the chat entry
    renderDmListBase();
  }

  // ── Presence WebSocket (separate, always-on) ──────────
  function connectPresence() {
    if (presenceSocket) {
      presenceSocket.onclose = null;
      presenceSocket.close();
      presenceSocket = null;
    }
    clearTimeout(presenceReconnectTimer);

    const url = `${WS_BASE}/ws/presence?token=${TOKEN}`;
    presenceSocket = new WebSocket(url);

    presenceSocket.onopen = () => {
      presenceReconnectDelay = 1000;
    };

    presenceSocket.onmessage = (event) => {
      let data;
      try { data = JSON.parse(event.data); } catch { return; }
      if (data.type === 'user_status') {
        handleUserStatus(data);
      } else if (data.type === 'message') {
        // A DM arrived while the user is not in that room.
        // Update sidebar: if room === currentRoom render it, otherwise show unread badge.
        if (data.room && data.room !== currentRoom) {
          // Make sure this contact appears in allUsersCache with a last_message
          // so it shows up in the Chats tab after the sidebar re-renders.
          const senderUsername = data.sender && data.sender.username;
          if (senderUsername && senderUsername !== ME) {
            const cached = allUsersCache.find(u => u.username === senderUsername);
            if (cached) {
              cached.last_message = data.content || t('file_preview');
            }
          }
          updateSidebarItem(data.room, data.content, true);
          // If we're on the chats tab and the item didn't exist yet, re-render
          if (activeSidebarTab === 'chats') {
            renderDmListBase();
          }
        }
      } else if (data.type === 'chat_deleted') {
        handleChatDeleted(data.room);
      }
    };

    presenceSocket.onclose = (ev) => {
      if (ev.code === 4001) return; // auth fail, don't reconnect
      presenceReconnectTimer = setTimeout(() => {
        presenceReconnectDelay = Math.min(presenceReconnectDelay * 2, 30000);
        connectPresence();
      }, presenceReconnectDelay);
    };

    presenceSocket.onerror = () => { presenceSocket.close(); };
  }

  // ── Init ───────────────────────────────────────────────

  // Apply translations and sync language switcher buttons on start and on change
  function syncLangButtons() {
    const lang = window.i18n ? window.i18n.getLang() : 'en';
    const btnEn = document.getElementById('lang-btn-en');
    const btnUk = document.getElementById('lang-btn-uk');
    if (btnEn) btnEn.classList.toggle('active', lang === 'en');
    if (btnUk) btnUk.classList.toggle('active', lang === 'uk');
  }

  // Called whenever language changes — re-apply all dynamic text
  function onLangChange() {
    if (window.i18n) window.i18n.applyTranslations();
    syncLangButtons();

    // Update runtime-rendered strings that are set by JS (not data-i18n)
    if (headerRoom && !currentRoom) {
      headerRoom.textContent = t('select_chat');
    }
    if (currentRoom && currentRoomType === 'dm' && currentDmPeer) {
      headerMeta.textContent = t('direct_message_meta');
      messageInput.placeholder = `${t('message_at')}${currentDmPeer}…`;
    } else if (currentRoom && currentRoomType === 'group') {
      headerMeta.textContent = t('group_chat_meta');
    }
    // Re-render lists so last message previews get translated
    renderDmListBase();
    renderGroupListBase();
    // Update account header
    const accountHeader = document.getElementById('account-header');
    if (accountHeader && ME) {
      accountHeader.textContent = `${ME}'s ${t('account_label') === 'АКАУНТ' ? 'Акаунт' : 'Account'}`;
    }
  }

  document.addEventListener('langchange', onLangChange);

  // Initial setup
  if (window.i18n) {
    window.i18n.applyTranslations();
    syncLangButtons();
  }

  connectPresence();
  updateChatLayoutState(); // Added call
  loadUsers();

})();
