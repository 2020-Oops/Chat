/**
 * i18n.js — Lightweight internationalisation for ChatApp
 * Supported languages: 'en' (English) | 'uk' (Українська)
 * Usage:
 *   t('key')              — returns translated string
 *   applyTranslations()   — patches all [data-i18n] elements in DOM
 *   setLang('uk')         — switch language and re-apply translations
 */
(function () {
  'use strict';

  const TRANSLATIONS = {
    en: {
      // ── Auth page ──────────────────────────────────────
      app_tagline:           'Real-time messaging',
      sign_in:               'Sign In',
      register:              'Register',
      username_label:        'Username',
      password_label:        'Password',
      enter_username:        'Enter username',
      enter_password:        'Enter password',
      choose_username:       'Choose a username',
      create_password:       'Create a password',
      create_account:        'Create Account',
      please_wait:           'Please wait…',

      // ── Sidebar ────────────────────────────────────────
      groups:                'Groups',
      create_group_btn:      'Create Group',
      search_groups:         'Search groups…',
      no_groups:             'No groups yet',
      direct_messages:       'Direct Messages',
      all_contacts:          'All Contacts',
      search_users:          'Search users…',
      no_active_chats:       'No active chats yet',
      no_contacts:           'No contacts found',

      // ── Settings ───────────────────────────────────────
      settings:              'SETTINGS',
      account_label:         'ACCOUNT',
      sign_out:              'Sign out',
      delete_account:        'Delete Account',
      language_label:        'LANGUAGE',

      // ── Header ─────────────────────────────────────────
      select_chat:           'Select a user or group',
      add_member_btn:        '+ Add',
      leave_btn:             'Leave',
      delete_btn:            'Delete',
      connecting:            'Connecting…',
      connected:             'Connected',
      disconnected:          'Disconnected',
      reconnecting:          'Reconnecting in',
      reconnecting_suffix:   's…',

      // ── Empty states ───────────────────────────────────
      no_chat_title:         'Select a user or group',
      no_chat_sub:           'Pick someone from the left to start chatting',
      chat_empty:            'Empty chat',

      // ── Input ──────────────────────────────────────────
      select_to_chat:        'Select a user to chat…',
      message_at:            'Message @',
      message_group:         'Message ',

      // ── DM list ────────────────────────────────────────
      chat_empty_preview:    'Empty chat',
      file_preview:          '📎 File',

      // ── Context menu ───────────────────────────────────
      delete_chat:           'Delete chat',

      // ── Modals ─────────────────────────────────────────
      create_group_title:    'Create New Group',
      group_name_ph:         'Group Name',
      select_members:        'Select initial members (optional):',
      search_members_ph:     'Search members…',
      cancel:                'Cancel',
      create:                'Create',

      add_member_title:      'Add Member to Group',
      search_by_username:    'Search by username…',
      type_to_search:        'Type to search users',
      close:                 'Close',

      delete_account_title:  'Delete Account',
      delete_account_warn:   '⚠️ This will permanently delete your account and all your messages. This action cannot be undone.',
      password_confirm_ph:   'Password to confirm',
      cancel_btn:            'Cancel',
      delete_account_btn:    'Delete my account',

      delete_group_title:    'Delete Group',
      delete_group_warn:     '⚠️ Are you sure you want to delete this group? This action cannot be undone and will remove all members and messages.',
      delete_group_btn:      'Delete Group',

      // ── Toasts ─────────────────────────────────────────
      toast_file_large:      'File is too large (Max 10MB)',
      toast_group_created:   'Group created successfully.',
      toast_group_create_err:'Failed to create group',
      toast_group_create_ex: 'Error creating group',
      toast_member_added:    'has been added to the group.',
      toast_member_add_err:  'Failed to add user',
      toast_member_add_ex:   'Error adding user',
      toast_group_deleted:   'Group deleted.',
      toast_group_del_err:   'Failed to delete group (must be creator).',
      toast_group_del_ex:    'Error deleting group',
      toast_left_group:      'Left group.',
      toast_leave_err:       'Failed to leave group / Creator cannot leave.',
      toast_leave_ex:        'Error leaving group',
      toast_pw_required:     'Please enter your password to confirm.',
      toast_acc_deleted:     'Account deleted successfully.',
      toast_acc_del_err:     'Failed to delete account (incorrect password?).',
      toast_acc_del_ex:      'Error deleting account',
      toast_chat_deleted:    'Chat deleted',
      toast_chat_del_err:    'Failed to delete chat',
      toast_server_err:      'Server error',
      toast_upload_fail:     'Upload failed',

      // ── Group header meta ──────────────────────────────
      direct_message_meta:   'Direct Message',
      group_chat_meta:       'Group Chat',
      select_chat_header:    'Select a chat',

      // ── No users found ─────────────────────────────────
      no_users_found:        'No users found',

      // ── Misc ───────────────────────────────────
      download:              'Download',
    },

    uk: {
      // ── Auth page ──────────────────────────────────────
      app_tagline:           'Месенджер у реальному часі',
      sign_in:               'Увійти',
      register:              'Реєстрація',
      username_label:        'Ім\'я користувача',
      password_label:        'Пароль',
      enter_username:        'Введіть ім\'я',
      enter_password:        'Введіть пароль',
      choose_username:       'Оберіть ім\'я',
      create_password:       'Придумайте пароль',
      create_account:        'Створити акаунт',
      please_wait:           'Зачекайте…',

      // ── Sidebar ────────────────────────────────────────
      groups:                'Групи',
      create_group_btn:      'Створити групу',
      search_groups:         'Пошук груп…',
      no_groups:             'Ще немає груп',
      direct_messages:       'Приватні повідомлення',
      all_contacts:          'Всі контакти',
      search_users:          'Пошук користувачів…',
      no_active_chats:       'Немає активних чатів',
      no_contacts:           'Контакти не знайдені',

      // ── Settings ───────────────────────────────────────
      settings:              'НАЛАШТУВАННЯ',
      account_label:         'АКАУНТ',
      sign_out:              'Вийти',
      delete_account:        'Видалити акаунт',
      language_label:        'МОВА',

      // ── Header ─────────────────────────────────────────
      select_chat:           'Оберіть користувача або групу',
      add_member_btn:        '+ Додати',
      leave_btn:             'Вийти',
      delete_btn:            'Видалити',
      connecting:            'Підключення…',
      connected:             'Підключено',
      disconnected:          'Відключено',
      reconnecting:          'Перепідключення через',
      reconnecting_suffix:   'с…',

      // ── Empty states ───────────────────────────────────
      no_chat_title:         'Оберіть користувача або групу',
      no_chat_sub:           'Оберіть когось зліва, щоб почати спілкування',
      chat_empty:            'Чат порожній',

      // ── Input ──────────────────────────────────────────
      select_to_chat:        'Оберіть користувача для чату…',
      message_at:            'Повідомлення @',
      message_group:         'Повідомлення ',

      // ── DM list ────────────────────────────────────────
      chat_empty_preview:    'Чат порожній',
      file_preview:          '📎 Файл',

      // ── Context menu ───────────────────────────────────
      delete_chat:           'Видалити чат',

      // ── Modals ─────────────────────────────────────────
      create_group_title:    'Нова група',
      group_name_ph:         'Назва групи',
      select_members:        'Оберіть початкових учасників (необов\'язково):',
      search_members_ph:     'Пошук учасників…',
      cancel:                'Скасувати',
      create:                'Створити',

      add_member_title:      'Додати учасника до групи',
      search_by_username:    'Пошук за іменем…',
      type_to_search:        'Введіть ім\'я для пошуку',
      close:                 'Закрити',

      delete_account_title:  'Видалення акаунту',
      delete_account_warn:   '⚠️ Це назавжди видалить ваш акаунт і всі повідомлення. Дію не можна скасувати.',
      password_confirm_ph:   'Пароль для підтвердження',
      cancel_btn:            'Скасувати',
      delete_account_btn:    'Видалити мій акаунт',

      delete_group_title:    'Видалити групу',
      delete_group_warn:     '⚠️ Ви впевнені, що хочете видалити цю групу? Дію не можна скасувати — всі учасники та повідомлення будуть видалені.',
      delete_group_btn:      'Видалити групу',

      // ── Toasts ─────────────────────────────────────────
      toast_file_large:      'Файл занадто великий (Макс. 10МБ)',
      toast_group_created:   'Групу успішно створено.',
      toast_group_create_err:'Не вдалося створити групу',
      toast_group_create_ex: 'Помилка при створенні групи',
      toast_member_added:    'доданий до групи.',
      toast_member_add_err:  'Не вдалося додати користувача',
      toast_member_add_ex:   'Помилка при додаванні користувача',
      toast_group_deleted:   'Групу видалено.',
      toast_group_del_err:   'Не вдалося видалити групу (має бути творець).',
      toast_group_del_ex:    'Помилка при видаленні групи',
      toast_left_group:      'Ви вийшли з групи.',
      toast_leave_err:       'Не вдалося вийти / Творець не може залишити.',
      toast_leave_ex:        'Помилка при виході з групи',
      toast_pw_required:     'Введіть пароль для підтвердження.',
      toast_acc_deleted:     'Акаунт успішно видалено.',
      toast_acc_del_err:     'Не вдалося видалити акаунт (неправильний пароль?).',
      toast_acc_del_ex:      'Помилка при видаленні акаунту',
      toast_chat_deleted:    'Чат видалено',
      toast_chat_del_err:    'Помилка видалення чату',
      toast_server_err:      'Помилка сервера',
      toast_upload_fail:     'Помилка завантаження',

      // ── Group header meta ──────────────────────────────
      direct_message_meta:   'Приватне повідомлення',
      group_chat_meta:       'Групова розмова',
      select_chat_header:    'Оберіть чат',

      // ── No users found ─────────────────────────────────
      no_users_found:        'Користувачів не знайдено',

      // ── Misc ───────────────────────────────────
      download:              'Завантажити',
    },
  };

  // ── Core ───────────────────────────────────────────────
  const STORAGE_KEY = 'chatapp_lang';
  let currentLang = localStorage.getItem(STORAGE_KEY) || 'en';

  /** Get translation for key in current language (falls back to English). */
  function t(key) {
    const dict = TRANSLATIONS[currentLang] || TRANSLATIONS.en;
    return dict[key] !== undefined ? dict[key] : (TRANSLATIONS.en[key] || key);
  }

  /** Switch language, persist choice, re-apply all translations. */
  function setLang(lang) {
    if (!TRANSLATIONS[lang]) return;
    currentLang = lang;
    localStorage.setItem(STORAGE_KEY, lang);
    applyTranslations();
    // Fire a custom event so app.js can react (update runtime strings)
    document.dispatchEvent(new CustomEvent('langchange', { detail: { lang } }));
  }

  /** Get currently selected language code. */
  function getLang() {
    return currentLang;
  }

  /**
   * Patch every DOM element that has data-i18n attributes.
   *
   *  data-i18n="key"          → element.textContent
   *  data-i18n-placeholder    → element.placeholder
   *  data-i18n-title          → element.title
   *  data-i18n-aria-label     → element.ariaLabel
   */
  function applyTranslations() {
    // textContent
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      el.textContent = t(key);
    });
    // placeholder
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      el.placeholder = t(key);
    });
    // title
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      const key = el.getAttribute('data-i18n-title');
      el.title = t(key);
    });
    // aria-label
    document.querySelectorAll('[data-i18n-aria]').forEach(el => {
      const key = el.getAttribute('data-i18n-aria');
      el.setAttribute('aria-label', t(key));
    });
  }

  // ── Expose globally ────────────────────────────────────
  window.i18n = { t, setLang, getLang, applyTranslations };

})();
