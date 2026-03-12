/* Runtime configuration for the static frontend. */
(function () {
  'use strict';

  const host = window.location.hostname;
  const isLocal = host === 'localhost' || host === '127.0.0.1';

  const qs = new URLSearchParams(window.location.search);
  const apiFromQuery = qs.get('api') || '';
  const wsFromQuery = qs.get('ws') || '';

  const apiFromStorage = window.localStorage.getItem('chat_api_base') || '';
  const wsFromStorage = window.localStorage.getItem('chat_ws_base') || '';

  if (!window.CHAT_CONFIG && !isLocal) {
    window.CHAT_CONFIG = {
      API_BASE_URL: 'https://chat-server-154708099195.us-central1.run.app',
      WS_BASE_URL: 'wss://chat-server-154708099195.us-central1.run.app',
    };
  }

  const cfg = window.CHAT_CONFIG || {};
  const apiFromWindow = cfg.API_BASE_URL || '';
  const wsFromWindow = cfg.WS_BASE_URL || '';

  const apiBase =
    apiFromQuery ||
    apiFromWindow ||
    apiFromStorage ||
    (isLocal ? 'http://localhost:8000' : '');

  let wsBase = wsFromQuery || wsFromWindow || wsFromStorage;
  if (!wsBase) {
    if (apiBase) {
      wsBase = apiBase.replace(/^http/, 'ws');
    } else {
      wsBase =
        (window.location.protocol === 'https:' ? 'wss://' : 'ws://') +
        window.location.host;
    }
  }

  window.ChatConfig = {
    apiBase,
    wsBase,
    setApiBase(next) {
      window.localStorage.setItem('chat_api_base', next);
    },
    setWsBase(next) {
      window.localStorage.setItem('chat_ws_base', next);
    },
  };
})();
