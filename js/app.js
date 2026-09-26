const firebaseConfig = {
  apiKey: "AIzaSyB8PNy6s68CvLCG1UsUdge8mnj3Q4clXo",
  authDomain: "coum-a25ae.firebaseapp.com",
  databaseURL: "https://coum-a25ae-default-rtdb.firebaseio.com",
  projectId: "coum-a25ae",
  storageBucket: "coum-a25ae.firebasestorage.app",
  messagingSenderId: "583802954010",
  appId: "1:583802954010:web:8c41807a67c1053c80cca3"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

const ADMIN_PASS = 'ir87O9fjm_jrg';
const DELETE_CONFIRM_PHRASE = 'да я хочу этого';

// Ссылки на ветки Firebase
const cidsRef = db.ref('allowed_cids');
const usersRef = db.ref('users');
const chatsRef = db.ref('chats');
const userChatsRef = db.ref('user_chats');
const callsRef = db.ref('calls');

let cloudCids = [];
let cloudCidsKeys = {};
let cloudUsers = {};
let myUserChats = {};
let currentChatData = null;

let currentAuthCID = localStorage.getItem('coum_active_cid') || null;
let activePeerCID = localStorage.getItem('coum_last_peer') || null;

// Слушатели Firebase для отписки при смене чата
let currentChatMetaListener = null;
let currentChatMessagesListener = null;
let currentChatPinnedListener = null;

// Переменные поиска
let searchFilterMode = 'name'; // 'name' | 'cid'
let searchQuery = '';

// Переменные редактирования и контекстного меню
let editingMessageId = null;
let targetContextMessage = null;

// ==================== СИСТЕМА ДАТ И ТАЙМЗОНЫ ====================

function formatMessageTime(isoString) {
  if (!isoString) return '--:--';
  const d = new Date(isoString);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

function getMessageDayKey(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDateSeparator(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  const now = new Date();

  const isToday = date.toDateString() === now.toDateString();
  if (isToday) return 'СЕГОДНЯ';

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'ВЧЕРА';

  const options = { day: 'numeric', month: 'long' };
  if (date.getFullYear() !== now.getFullYear()) {
    options.year = 'numeric';
  }
  return date.toLocaleDateString('ru-RU', options).toUpperCase();
}

function generate11CharCID() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let randomPart = '';
  for (let i = 0; i < 11; i++) {
    randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `CID_${randomPart}`;
}

function getChatKey(cid1, cid2) {
  return [cid1, cid2].sort().join('__');
}

function escapeHTML(str) {
  if (typeof str !== 'string') str = String(str || '');
  return str.replace(/[&<>'"]/g, tag => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[tag] || tag));
}

// ==================== REALTIME СЛУШАТЕЛИ ОБЩИХ ДАННЫХ ====================

cidsRef.on('value', (snapshot) => {
  const data = snapshot.val() || {};
  cloudCidsKeys = data;
  cloudCids = Object.values(data);

  if (currentAuthCID && !cloudCids.includes(currentAuthCID)) {
    performLogout();
    return;
  }

  if (currentAuthCID) renderSidebar();
  if (!adminPanel.classList.contains('hidden')) renderAdminCIDList();
});

usersRef.on('value', (snapshot) => {
  cloudUsers = snapshot.val() || {};
  if (currentAuthCID) {
    renderProfile();
    renderSidebar();
    if (activePeerCID) {
      updateTopBarInfo();
    }
  }
});

// Слушаем список чатов конкретного пользователя
function attachUserChatsListener() {
  if (!currentAuthCID) return;
  userChatsRef.child(currentAuthCID).on('value', (snapshot) => {
    myUserChats = snapshot.val() || {};
    renderSidebar();
  });
}

// ==================== DOM ССЫЛКИ ====================

const authScreen = document.getElementById('auth-screen');
const authLogo = document.getElementById('auth-logo');
const appScreen = document.getElementById('app-screen');
const authInput = document.getElementById('auth-input');
const authError = document.getElementById('auth-error');

const myDisplayNameEl = document.getElementById('my-display-name');
const myFixedCidEl = document.getElementById('my-fixed-cid');
const editNameBtn = document.getElementById('edit-name-btn');
const peersListEl = document.getElementById('peers-list');
const sidebarSectionTitle = document.getElementById('sidebar-section-title');

// Поиск в сайдбаре
const contactSearchInput = document.getElementById('contact-search-input');
const searchClearBtn = document.getElementById('search-clear-btn');
const filterNameBtn = document.getElementById('filter-name-btn');
const filterCidBtn = document.getElementById('filter-cid-btn');

// Чат
const activePeerHeaderEl = document.getElementById('active-peer-header');
const mobileBackBtn = document.getElementById('mobile-back-btn');
const messagesContainer = document.getElementById('messages-container');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');
const sendMsgBtn = document.getElementById('send-msg-btn');
const attachBtn = document.getElementById('attach-btn');
const imageFileInput = document.getElementById('image-file-input');
const startCallBtn = document.getElementById('start-call-btn');

// Антиспам и Закреп
const antispamRequestBanner = document.getElementById('antispam-request-banner');
const acceptChatBtn = document.getElementById('accept-chat-btn');
const rejectChatBtn = document.getElementById('reject-chat-btn');
const pinnedBar = document.getElementById('pinned-bar');
const pinnedTypeLabel = document.getElementById('pinned-type-label');
const pinnedTextPreview = document.getElementById('pinned-text-preview');
const unpinBtn = document.getElementById('unpin-btn');

// Редактирование сообщения
const editStateBar = document.getElementById('edit-state-bar');
const cancelEditBtn = document.getElementById('cancel-edit-btn');

// Контекстное меню
const msgContextMenu = document.getElementById('msg-context-menu');
const ctxEditBtn = document.getElementById('ctx-edit-btn');
const ctxPinBothBtn = document.getElementById('ctx-pin-both-btn');
const ctxPinSelfBtn = document.getElementById('ctx-pin-self-btn');
const ctxDeleteBtn = document.getElementById('ctx-delete-btn');
const reactionEmojiButtons = document.querySelectorAll('.reaction-emoji-btn');

// Просмотрщик картинок
const imageViewerModal = document.getElementById('image-viewer-modal');
const viewerImg = document.getElementById('viewer-img');
const closeViewerBtn = document.getElementById('close-viewer-btn');

// Настройки
const openSettingsBtn = document.getElementById('open-settings-btn');
const settingsModal = document.getElementById('settings-modal');
const settingsCloseBtn = document.getElementById('settings-close-btn');
const settingsLogoutBtn = document.getElementById('settings-logout-btn');
const scaleButtons = document.querySelectorAll('.scale-btn');
const themeButtons = document.querySelectorAll('.theme-select-btn');
const applyCustomThemeBtn = document.getElementById('apply-custom-theme-btn');
const customBgInput = document.getElementById('custom-color-bg');
const customPanelInput = document.getElementById('custom-color-panel');
const customTextInput = document.getElementById('custom-color-text');
const customAccentInput = document.getElementById('custom-color-accent');

// Админка
const adminAuthModal = document.getElementById('admin-auth-modal');
const adminPassInput = document.getElementById('admin-pass-input');
const adminPanel = document.getElementById('admin-panel');
const adminCloseBtn = document.getElementById('admin-close-btn');
const generateCidBtn = document.getElementById('generate-cid-btn');
const copyCidBtn = document.getElementById('copy-cid-btn');
const lastGeneratedCidEl = document.getElementById('last-generated-cid');
const adminCidListEl = document.getElementById('admin-cid-list');

// Удаление пользователя
const deleteConfirmModal = document.getElementById('delete-confirm-modal');
const deletePhraseInput = document.getElementById('delete-phrase-input');
const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
const cancelDeleteBtn = document.getElementById('cancel-delete-btn');
let cidPendingDelete = null;

// ==================== САЙДБАР И СИСТЕМА ПОИСКА ====================

filterNameBtn.addEventListener('click', () => {
  searchFilterMode = 'name';
  filterNameBtn.classList.add('active');
  filterCidBtn.classList.remove('active');
  renderSidebar();
});

filterCidBtn.addEventListener('click', () => {
  searchFilterMode = 'cid';
  filterCidBtn.classList.add('active');
  filterNameBtn.classList.remove('active');
  renderSidebar();
});

contactSearchInput.addEventListener('input', (e) => {
  searchQuery = e.target.value.trim();
  searchClearBtn.classList.toggle('hidden', searchQuery.length === 0);
  renderSidebar();
});

searchClearBtn.addEventListener('click', () => {
  contactSearchInput.value = '';
  searchQuery = '';
  searchClearBtn.classList.add('hidden');
  renderSidebar();
});

function renderSidebar() {
  if (!currentAuthCID) return;
  peersListEl.innerHTML = '';

  const isSearchActive = searchQuery.length > 0;

  if (isSearchActive) {
    sidebarSectionTitle.textContent = `ПОИСК (${searchFilterMode === 'name' ? 'ПО НИКУ' : 'ПО CID'}):`;

    const lowerQuery = searchQuery.toLowerCase();
    const matchedCids = cloudCids.filter(cid => {
      if (cid === currentAuthCID) return false;
      const userName = (cloudUsers[cid]?.name || '').toLowerCase();
      const cidLower = cid.toLowerCase();

      if (searchFilterMode === 'name') {
        return userName.includes(lowerQuery);
      } else {
        return cidLower.includes(lowerQuery);
      }
    });

    if (matchedCids.length === 0) {
      peersListEl.innerHTML = '<div style="padding:14px;color:var(--text-muted);font-size:11px;">НИЧЕГО НЕ НАЙДЕНО</div>';
      return;
    }

    matchedCids.forEach(peerCID => {
      const isAlreadyChat = !!myUserChats[peerCID];
      const displayName = cloudUsers[peerCID]?.name || peerCID;
      const btn = document.createElement('button');
      btn.className = `peer-btn ${peerCID === activePeerCID ? 'active' : ''}`;
      
      btn.innerHTML = `
        <span class="peer-btn-name">${escapeHTML(displayName)}</span>
        <span class="peer-btn-cid">${peerCID}</span>
        ${isAlreadyChat ? '<span class="peer-btn-tag">[УЖЕ В ЧАТАХ]</span>' : '<span class="peer-btn-tag" style="color:#38bdf8;">[НАЧАТЬ ДИАЛОГ]</span>'}
      `;

      btn.onclick = () => selectPeer(peerCID);
      peersListEl.appendChild(btn);
    });

  } else {
    // Отображаем только активные диалоги
    sidebarSectionTitle.textContent = 'ВАШИ ДИАЛОГИ:';
    const chatPeers = Object.keys(myUserChats).filter(cid => cloudCids.includes(cid));

    if (chatPeers.length === 0) {
      peersListEl.innerHTML = '<div style="padding:14px;color:var(--text-muted);font-size:11px;line-height:1.5;">НЕТ АКТИВНЫХ ДИАЛОГОВ.<br>ВОСПОЛЬЗУЙТЕСЬ ПОИСКОМ СВЕРХУ, ЧТОБЫ НАЙТИ СОБЕСЕДНИКА.</div>';
      return;
    }

    chatPeers.forEach(peerCID => {
      const info = myUserChats[peerCID] || {};
      const displayName = cloudUsers[peerCID]?.name || info.peerUsername || peerCID;
      const isPending = info.status === 'pending';

      const btn = document.createElement('button');
      btn.className = `peer-btn ${peerCID === activePeerCID ? 'active' : ''}`;

      let tagHTML = '';
      if (isPending) {
        tagHTML = info.isInitiator ? '<span class="peer-btn-tag">[ОЖИДАНИЕ ОТВЕТА]</span>' : '<span class="peer-btn-tag" style="color:#ef4444;">[ЗАПРОС НА ПЕРЕПИСКУ]</span>';
      }

      btn.innerHTML = `
        <span class="peer-btn-name">${escapeHTML(displayName)}</span>
        <span class="peer-btn-cid">${peerCID}</span>
        ${tagHTML}
      `;

      btn.onclick = () => selectPeer(peerCID);
      peersListEl.appendChild(btn);
    });
  }
}

function selectPeer(peerCID) {
  if (activePeerCID === peerCID) {
    appScreen.classList.add('chat-opened');
    return;
  }

  activePeerCID = peerCID;
  localStorage.setItem('coum_last_peer', peerCID);
  cancelEditingMessage();
  renderSidebar();
  attachChatListeners();
  appScreen.classList.add('chat-opened');
}

function updateTopBarInfo() {
  if (!activePeerCID) {
    activePeerHeaderEl.textContent = 'ВЫБЕРИТЕ ДИАЛОГ';
    return;
  }
  const name = cloudUsers[activePeerCID]?.name || activePeerCID;
  activePeerHeaderEl.textContent = `${name} (${activePeerCID})`;
}

// ==================== РАБОТА С ВЫБРАННЫМ ЧАТОМ И АНТИСПАМ ====================

function detachCurrentChatListeners() {
  if (!activePeerCID || !currentAuthCID) return;
  const chatKey = getChatKey(currentAuthCID, activePeerCID);
  const chatRef = chatsRef.child(chatKey);

  if (currentChatMetaListener) chatRef.child('meta').off('value', currentChatMetaListener);
  if (currentChatMessagesListener) chatRef.child('messages').off('value', currentChatMessagesListener);
  if (currentChatPinnedListener) chatRef.child('pinned').off('value', currentChatPinnedListener);

  currentChatMetaListener = null;
  currentChatMessagesListener = null;
  currentChatPinnedListener = null;
}

function attachChatListeners() {
  detachCurrentChatListeners();
  if (!activePeerCID || !currentAuthCID) return;

  updateTopBarInfo();
  const chatKey = getChatKey(currentAuthCID, activePeerCID);
  const chatRef = chatsRef.child(chatKey);

  // 1. Слушаем мету чата (статус антиспама: pending/accepted)
  currentChatMetaListener = chatRef.child('meta').on('value', (snap) => {
    const meta = snap.val();
    updateChatStatusUI(meta);
  });

  // 2. Слушаем закрепленное сообщение для обоих
  currentChatPinnedListener = chatRef.child('pinned').on('value', (snap) => {
    updatePinnedBarUI(snap.val());
  });

  // 3. Слушаем сообщения чата
  currentChatMessagesListener = chatRef.child('messages').on('value', (snap) => {
    const messagesData = snap.val() || {};
    renderMessages(messagesData);
  });
}

function updateChatStatusUI(meta) {
  // Проверяем статус в Firebase или в локальном узле user_chats
  const isPending = meta && meta.status === 'pending';
  const initiatorCid = meta ? meta.initiatorCid : null;

  if (isPending) {
    if (initiatorCid === currentAuthCID) {
      // Я отправил запрос — блокируем повторную отправку
      antispamRequestBanner.classList.add('hidden');
      messageInput.disabled = true;
      messageInput.placeholder = 'Ожидание принятия запроса собеседником...';
      sendMsgBtn.disabled = true;
      attachBtn.disabled = true;
      startCallBtn.disabled = true;
    } else {
      // Мне пришел запрос — показываем кнопки Принять/Отклонить
      antispamRequestBanner.classList.remove('hidden');
      messageInput.disabled = true;
      messageInput.placeholder = 'Примите запрос, чтобы отвечать...';
      sendMsgBtn.disabled = true;
      attachBtn.disabled = true;
      startCallBtn.disabled = true;
    }
  } else {
    // Чат принят или новый
    antispamRequestBanner.classList.add('hidden');
    messageInput.disabled = false;
    messageInput.placeholder = 'Сообщение или вставьте скриншот (Ctrl+V)...';
    sendMsgBtn.disabled = false;
    attachBtn.disabled = false;
    startCallBtn.disabled = false;
  }
}

// Принятие чата
acceptChatBtn.addEventListener('click', async () => {
  if (!activePeerCID || !currentAuthCID) return;
  const chatKey = getChatKey(currentAuthCID, activePeerCID);

  await chatsRef.child(chatKey).child('meta').update({
    status: 'accepted'
  });

  // Обновляем статус в списках диалогов обоих участников
  await userChatsRef.child(currentAuthCID).child(activePeerCID).update({ status: 'accepted' });
  await userChatsRef.child(activePeerCID).child(currentAuthCID).update({ status: 'accepted' });

  antispamRequestBanner.classList.add('hidden');
  updateChatStatusUI({ status: 'accepted' });
});

// Отклонение чата (полное удаление)
rejectChatBtn.addEventListener('click', async () => {
  if (!activePeerCID || !currentAuthCID) return;
  if (!confirm('Отклонить запрос и удалить этот чат навсегда?')) return;

  const chatKey = getChatKey(currentAuthCID, activePeerCID);

  await chatsRef.child(chatKey).remove();
  await userChatsRef.child(currentAuthCID).child(activePeerCID).remove();
  await userChatsRef.child(activePeerCID).child(currentAuthCID).remove();

  activePeerCID = null;
  localStorage.removeItem('coum_last_peer');
  messagesContainer.innerHTML = '';
  antispamRequestBanner.classList.add('hidden');
  pinnedBar.classList.add('hidden');
  updateTopBarInfo();
  renderSidebar();
  appScreen.classList.remove('chat-opened');
});

// ==================== ЗАКРЕПЛЕНИЕ СООБЩЕНИЙ ====================

function updatePinnedBarUI(cloudPinned) {
  // Сначала проверяем облачный закреп
  if (cloudPinned && cloudPinned.text) {
    pinnedTypeLabel.textContent = 'ЗАКРЕП (ДЛЯ ОБОИХ):';
    pinnedTextPreview.textContent = cloudPinned.text;
    pinnedBar.classList.remove('hidden');
    pinnedBar.dataset.pinnedType = 'both';
    return;
  }

  // Если в облаке нет — проверяем локальный закреп для себя
  const chatKey = getChatKey(currentAuthCID, activePeerCID);
  const localPinnedText = localStorage.getItem(`coum_pinned_${chatKey}`);

  if (localPinnedText) {
    pinnedTypeLabel.textContent = 'ЗАКРЕП (ДЛЯ СЕБЯ):';
    pinnedTextPreview.textContent = localPinnedText;
    pinnedBar.classList.remove('hidden');
    pinnedBar.dataset.pinnedType = 'self';
    return;
  }

  pinnedBar.classList.add('hidden');
  pinnedBar.dataset.pinnedType = '';
}

unpinBtn.addEventListener('click', async () => {
  if (!activePeerCID || !currentAuthCID) return;
  const chatKey = getChatKey(currentAuthCID, activePeerCID);
  const type = pinnedBar.dataset.pinnedType;

  if (type === 'both') {
    await chatsRef.child(chatKey).child('pinned').remove();
  } else if (type === 'self') {
    localStorage.removeItem(`coum_pinned_${chatKey}`);
    updatePinnedBarUI(null);
  }
});

// ==================== РЕНДЕР СООБЩЕНИЙ ====================

function renderMessages(messagesData) {
  messagesContainer.innerHTML = '';
  if (!activePeerCID || !currentAuthCID) return;

  const list = Object.entries(messagesData).map(([id, msg]) => ({
    id,
    ...msg
  }));

  list.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

  let lastDayKey = null;

  list.forEach(msg => {
    const isoDate = msg.timestamp ? new Date(msg.timestamp).toISOString() : new Date().toISOString();
    const currentDayKey = getMessageDayKey(isoDate);

    if (currentDayKey && currentDayKey !== lastDayKey) {
      lastDayKey = currentDayKey;
      const dateDiv = document.createElement('div');
      dateDiv.className = 'date-separator';
      dateDiv.innerHTML = `<span>${formatDateSeparator(isoDate)}</span>`;
      messagesContainer.appendChild(dateDiv);
    }

    const row = document.createElement('div');
    row.className = 'msg-row';
    row.dataset.msgId = msg.id;

    const isSelf = msg.senderCid === currentAuthCID;
    const authorName = isSelf ? 'Я' : (msg.senderName || cloudUsers[msg.senderCid]?.name || msg.senderCid);
    const timeFormatted = formatMessageTime(isoDate);

    let contentHTML = '';
    if (msg.text) {
      contentHTML += `<span class="msg-text">${escapeHTML(msg.text)}</span>`;
    }

    if (msg.imageUrl) {
      contentHTML += `
        <div class="msg-image-wrap">
          <img src="${msg.imageUrl}" class="msg-image" alt="фото" />
        </div>
      `;
    }

    if (msg.isEdited) {
      contentHTML += `<span class="msg-edited-tag">(изм.)</span>`;
    }

    // Реакции
    let reactionsHTML = '';
    if (msg.reactions && Object.keys(msg.reactions).length > 0) {
      // Подсчет реакций по типам
      const reactionCounts = {};
      Object.entries(msg.reactions).forEach(([cid, emoji]) => {
        reactionCounts[emoji] = (reactionCounts[emoji] || 0) + 1;
      });

      reactionsHTML = '<div class="msg-reactions-bar">';
      for (const [emoji, count] of Object.entries(reactionCounts)) {
        const isMyReaction = msg.reactions[currentAuthCID] === emoji;
        reactionsHTML += `
          <div class="reaction-badge ${isMyReaction ? 'my-active' : ''}" data-emoji="${emoji}">
            <span>${emoji}</span> <span>${count}</span>
          </div>
        `;
      }
      reactionsHTML += '</div>';
    }

    row.innerHTML = `
      <span class="msg-time">[${timeFormatted}]</span>
      <span class="msg-author">${escapeHTML(authorName)}:</span>
      ${contentHTML}
      ${reactionsHTML}
    `;

    // Клик по превью картинки
    const imgEl = row.querySelector('.msg-image');
    if (imgEl) {
      imgEl.onclick = () => openImageViewer(msg.imageUrl);
    }

    // Клик по бэйджику реакции в сообщении
    row.querySelectorAll('.reaction-badge').forEach(badge => {
      badge.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleReaction(msg.id, badge.dataset.emoji, msg.reactions);
      });
    });

    // Обработчик контекстного меню (ПКМ)
    row.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      openContextMenu(e.clientX, e.clientY, msg);
    });

    // Долгий тап для мобильных устройств
    let longPressTimer = null;
    row.addEventListener('touchstart', (e) => {
      longPressTimer = setTimeout(() => {
        const touch = e.touches[0];
        openContextMenu(touch.clientX, touch.clientY, msg);
      }, 550);
    }, { passive: true });

    row.addEventListener('touchend', () => clearTimeout(longPressTimer));
    row.addEventListener('touchmove', () => clearTimeout(longPressTimer));

    messagesContainer.appendChild(row);
  });

  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// ==================== КОНТЕКСТНОЕ МЕНЮ И ДЕЙСТВИЯ ====================

function openContextMenu(x, y, msg) {
  targetContextMessage = msg;
  msgContextMenu.classList.remove('hidden');

  // Позиционирование в границах окна
  const menuWidth = 200;
  const menuHeight = 220;
  let posX = x;
  let posY = y;

  if (posX + menuWidth > window.innerWidth) posX = window.innerWidth - menuWidth - 10;
  if (posY + menuHeight > window.innerHeight) posY = window.innerHeight - menuHeight - 10;

  msgContextMenu.style.left = `${Math.max(10, posX)}px`;
  msgContextMenu.style.top = `${Math.max(10, posY)}px`;

  // Редактировать можно только своё текстовое сообщение
  const isMine = msg.senderCid === currentAuthCID;
  const isText = !!msg.text;
  ctxEditBtn.style.display = (isMine && isText) ? 'block' : 'none';
}

function closeContextMenu() {
  msgContextMenu.classList.add('hidden');
  targetContextMessage = null;
}

window.addEventListener('click', (e) => {
  if (!msgContextMenu.contains(e.target)) {
    closeContextMenu();
  }
});

// Добавление / переключение реакции из контекстного меню
reactionEmojiButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    if (!targetContextMessage) return;
    const emoji = btn.dataset.emoji;
    toggleReaction(targetContextMessage.id, emoji, targetContextMessage.reactions);
    closeContextMenu();
  });
});

async function toggleReaction(msgId, emoji, existingReactions = {}) {
  if (!activePeerCID || !currentAuthCID) return;
  const chatKey = getChatKey(currentAuthCID, activePeerCID);
  const reactionPath = chatsRef.child(chatKey).child('messages').child(msgId).child('reactions').child(currentAuthCID);

  if (existingReactions && existingReactions[currentAuthCID] === emoji) {
    await reactionPath.remove();
  } else {
    await reactionPath.set(emoji);
  }
}

// Удалить сообщение у всех
ctxDeleteBtn.addEventListener('click', async () => {
  if (!targetContextMessage || !activePeerCID || !currentAuthCID) return;
  const chatKey = getChatKey(currentAuthCID, activePeerCID);
  await chatsRef.child(chatKey).child('messages').child(targetContextMessage.id).remove();
  closeContextMenu();
});

// Закрепить для обоих
ctxPinBothBtn.addEventListener('click', async () => {
  if (!targetContextMessage || !activePeerCID || !currentAuthCID) return;
  const chatKey = getChatKey(currentAuthCID, activePeerCID);
  const textToPin = targetContextMessage.text || '[Изображение]';

  await chatsRef.child(chatKey).child('pinned').set({
    id: targetContextMessage.id,
    text: textToPin
  });
  closeContextMenu();
});

// Закрепить только для себя
ctxPinSelfBtn.addEventListener('click', () => {
  if (!targetContextMessage || !activePeerCID || !currentAuthCID) return;
  const chatKey = getChatKey(currentAuthCID, activePeerCID);
  const textToPin = targetContextMessage.text || '[Изображение]';

  localStorage.setItem(`coum_pinned_${chatKey}`, textToPin);
  updatePinnedBarUI(null);
  closeContextMenu();
});

// Начать редактирование сообщения
ctxEditBtn.addEventListener('click', () => {
  if (!targetContextMessage) return;
  editingMessageId = targetContextMessage.id;
  messageInput.value = targetContextMessage.text || '';
  editStateBar.classList.remove('hidden');
  messageInput.focus();
  closeContextMenu();
});

cancelEditBtn.addEventListener('click', () => {
  cancelEditingMessage();
});

function cancelEditingMessage() {
  editingMessageId = null;
  editStateBar.classList.add('hidden');
  messageInput.value = '';
}

// ==================== ОТПРАВКА СООБЩЕНИЙ ====================

async function sendMessage(text = '', imageBase64 = null) {
  if (!activePeerCID || !currentAuthCID) return;
  if (!text && !imageBase64) return;

  const chatKey = getChatKey(currentAuthCID, activePeerCID);
  const myName = cloudUsers[currentAuthCID]?.name || currentAuthCID;
  const peerName = cloudUsers[activePeerCID]?.name || activePeerCID;

  // 1. Проверяем режим редактирования
  if (editingMessageId) {
    if (text) {
      await chatsRef.child(chatKey).child('messages').child(editingMessageId).update({
        text: text.trim(),
        isEdited: true
      });
    }
    cancelEditingMessage();
    return;
  }

  // 2. Проверяем состояние мета-данных чата в Firebase
  const metaSnap = await chatsRef.child(chatKey).child('meta').once('value');
  let meta = metaSnap.val();

  // Если чата еще нет — инициируем запрос (антиспам)
  if (!meta) {
    meta = {
      status: 'pending',
      initiatorCid: currentAuthCID
    };
    await chatsRef.child(chatKey).child('meta').set(meta);

    // Добавляем запись в списки чатов обоих пользователей
    await userChatsRef.child(currentAuthCID).child(activePeerCID).set({
      peerUsername: peerName,
      status: 'pending',
      isInitiator: true
    });

    await userChatsRef.child(activePeerCID).child(currentAuthCID).set({
      peerUsername: myName,
      status: 'pending',
      isInitiator: false
    });
  } else if (meta.status === 'pending') {
    // Если статус ожидания и текущий юзер инициатор — отправка заблокирована
    if (meta.initiatorCid === currentAuthCID) {
      alert('Вы уже отправили стартовое сообщение. Дождитесь подтверждения диалога.');
      return;
    }
  }

  // Создаем сообщение
  const newMsgRef = chatsRef.child(chatKey).child('messages').push();
  const msgPayload = {
    id: newMsgRef.key,
    senderCid: currentAuthCID,
    senderName: myName,
    timestamp: firebase.database.ServerValue.TIMESTAMP
  };

  if (text) msgPayload.text = text.trim();
  if (imageBase64) msgPayload.imageUrl = imageBase64;

  await newMsgRef.set(msgPayload);
}

messageForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = messageInput.value.trim();
  if (!text) return;
  sendMessage(text, null);
  if (!editingMessageId) {
    messageInput.value = '';
  }
});

// ==================== WebRTC АУДИОЗВОНКИ ====================

const remoteAudio = document.getElementById('remote-audio');
const incomingCallModal = document.getElementById('incoming-call-modal');
const incomingCallerName = document.getElementById('incoming-caller-name');
const acceptCallBtn = document.getElementById('accept-call-btn');
const rejectCallBtn = document.getElementById('reject-call-btn');

const activeCallModal = document.getElementById('active-call-modal');
const callStatusLabel = document.getElementById('call-status-label');
const activeCallPeerName = document.getElementById('active-call-peer-name');
const callTimerLabel = document.getElementById('call-timer-label');
const toggleMuteBtn = document.getElementById('toggle-mute-btn');
const endCallBtn = document.getElementById('end-call-btn');

let peerConnection = null;
let localStream = null;
let activeCallTargetCID = null;
let isCallInitiator = false;
let callTimerInterval = null;
let callDurationSeconds = 0;
let isMuted = false;

// Звуковой синтезатор гудков (Web Audio API)
let audioCtx = null;
let ringOscillator = null;
let ringInterval = null;

function playRingTone(type = 'dialing') {
  stopRingTone();
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    ringInterval = setInterval(() => {
      if (!audioCtx) return;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(type === 'dialing' ? 425 : 480, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + (type === 'dialing' ? 1.0 : 0.6));
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + (type === 'dialing' ? 1.0 : 0.6));
    }, type === 'dialing' ? 3000 : 1600);
  } catch (e) {
    console.warn('Audio tone err:', e);
  }
}

function stopRingTone() {
  if (ringInterval) {
    clearInterval(ringInterval);
    ringInterval = null;
  }
  if (audioCtx) {
    try { audioCtx.close(); } catch(e){}
    audioCtx = null;
  }
}

const rtcConfig = {
  iceServers: [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }
  ]
};

// Слушаем входящие вызовы
function initCallSignalingListener() {
  if (!currentAuthCID) return;

  callsRef.child(currentAuthCID).on('value', async (snapshot) => {
    const callData = snapshot.val();
    if (!callData) {
      if (activeCallTargetCID && !isCallInitiator) {
        cleanupCall();
      }
      return;
    }

    if (callData.status === 'ringing') {
      activeCallTargetCID = callData.callerCID;
      incomingCallerName.textContent = `${callData.callerName || callData.callerCID} (${callData.callerCID})`;
      incomingCallModal.classList.remove('hidden');
      playRingTone('incoming');
    } else if (callData.status === 'ended') {
      cleanupCall();
    }
  });
}

// Исходящий вызов
startCallBtn.addEventListener('click', async () => {
  if (!activePeerCID || !currentAuthCID) return;
  if (activePeerCID === currentAuthCID) return;

  // Проверка статуса антиспама перед звонком
  const chatKey = getChatKey(currentAuthCID, activePeerCID);
  const metaSnap = await chatsRef.child(chatKey).child('meta').once('value');
  const meta = metaSnap.val();
  if (meta && meta.status === 'pending') {
    alert('Голосовые звонки недоступны до подтверждения диалога.');
    return;
  }

  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  } catch (err) {
    alert('Не удалось получить доступ к микрофону!');
    return;
  }

  isCallInitiator = true;
  activeCallTargetCID = activePeerCID;

  const targetName = cloudUsers[activePeerCID]?.name || activePeerCID;
  activeCallPeerName.textContent = `${targetName} (${activePeerCID})`;
  callStatusLabel.textContent = 'ВЫЗОВ...';
  callTimerLabel.textContent = '00:00';
  activeCallModal.classList.remove('hidden');
  playRingTone('dialing');

  peerConnection = new RTCPeerConnection(rtcConfig);

  localStream.getTracks().forEach(track => {
    peerConnection.addTrack(track, localStream);
  });

  peerConnection.ontrack = (event) => {
    remoteAudio.srcObject = event.streams[0];
  };

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      callsRef.child(activeCallTargetCID).child('callerCandidates').push(JSON.stringify(event.candidate));
    }
  };

  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);

  const myName = cloudUsers[currentAuthCID]?.name || currentAuthCID;

  await callsRef.child(activeCallTargetCID).set({
    callerCID: currentAuthCID,
    callerName: myName,
    offer: JSON.stringify(offer),
    status: 'ringing'
  });

  const myCallRef = callsRef.child(activeCallTargetCID);
  myCallRef.on('value', async (snap) => {
    const data = snap.val();
    if (!data) {
      cleanupCall();
      return;
    }

    if (data.status === 'connected' && data.answer && peerConnection.signalingState === 'have-local-offer') {
      stopRingTone();
      const answer = JSON.parse(data.answer);
      await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
      startCallTimer();
    } else if (data.status === 'rejected' || data.status === 'ended') {
      cleanupCall();
    }
  });

  myCallRef.child('calleeCandidates').on('child_added', async (cSnap) => {
    const candidateData = cSnap.val();
    if (candidateData && peerConnection) {
      try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(JSON.parse(candidateData)));
      } catch (e) {}
    }
  });
});

// Принять входящий звонок
acceptCallBtn.addEventListener('click', async () => {
  stopRingTone();
  incomingCallModal.classList.add('hidden');

  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  } catch (err) {
    alert('Не удалось получить доступ к микрофону!');
    rejectIncomingCall();
    return;
  }

  const callSnap = await callsRef.child(currentAuthCID).once('value');
  const callData = callSnap.val();
  if (!callData || !callData.offer) {
    cleanupCall();
    return;
  }

  isCallInitiator = false;
  activeCallTargetCID = callData.callerCID;

  const targetName = cloudUsers[activeCallTargetCID]?.name || activeCallTargetCID;
  activeCallPeerName.textContent = `${targetName} (${activeCallTargetCID})`;
  callStatusLabel.textContent = 'СОЕДИНЕНИЕ...';
  activeCallModal.classList.remove('hidden');

  peerConnection = new RTCPeerConnection(rtcConfig);

  localStream.getTracks().forEach(track => {
    peerConnection.addTrack(track, localStream);
  });

  peerConnection.ontrack = (event) => {
    remoteAudio.srcObject = event.streams[0];
  };

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      callsRef.child(currentAuthCID).child('calleeCandidates').push(JSON.stringify(event.candidate));
    }
  };

  const offer = JSON.parse(callData.offer);
  await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);

  await callsRef.child(currentAuthCID).update({
    answer: JSON.stringify(answer),
    status: 'connected'
  });

  startCallTimer();

  callsRef.child(currentAuthCID).child('callerCandidates').on('child_added', async (cSnap) => {
    const candidateData = cSnap.val();
    if (candidateData && peerConnection) {
      try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(JSON.parse(candidateData)));
      } catch (e) {}
    }
  });
});

rejectCallBtn.addEventListener('click', () => {
  rejectIncomingCall();
});

async function rejectIncomingCall() {
  stopRingTone();
  incomingCallModal.classList.add('hidden');
  if (currentAuthCID) {
    await callsRef.child(currentAuthCID).update({ status: 'rejected' });
    setTimeout(() => callsRef.child(currentAuthCID).remove(), 1000);
  }
  cleanupCall();
}

endCallBtn.addEventListener('click', async () => {
  if (activeCallTargetCID) {
    const targetNode = isCallInitiator ? activeCallTargetCID : currentAuthCID;
    await callsRef.child(targetNode).update({ status: 'ended' });
    setTimeout(() => callsRef.child(targetNode).remove(), 500);
  }
  cleanupCall();
});

function cleanupCall() {
  stopRingTone();
  stopCallTimer();

  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }

  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
    localStream = null;
  }

  remoteAudio.srcObject = null;
  activeCallModal.classList.add('hidden');
  incomingCallModal.classList.add('hidden');
  activeCallTargetCID = null;
  isCallInitiator = false;
  isMuted = false;
  toggleMuteBtn.textContent = 'МИКРОФОН: ВКЛ';
}

function startCallTimer() {
  stopCallTimer();
  callStatusLabel.textContent = 'РАЗГОВОР';
  callDurationSeconds = 0;
  callTimerInterval = setInterval(() => {
    callDurationSeconds++;
    const mins = String(Math.floor(callDurationSeconds / 60)).padStart(2, '0');
    const secs = String(callDurationSeconds % 60).padStart(2, '0');
    callTimerLabel.textContent = `${mins}:${secs}`;
  }, 1000);
}

function stopCallTimer() {
  if (callTimerInterval) {
    clearInterval(callTimerInterval);
    callTimerInterval = null;
  }
  callDurationSeconds = 0;
}

toggleMuteBtn.addEventListener('click', () => {
  if (!localStream) return;
  isMuted = !isMuted;
  localStream.getAudioTracks().forEach(track => {
    track.enabled = !isMuted;
  });
  toggleMuteBtn.textContent = isMuted ? 'МИКРОФОН: ВЫКЛ' : 'МИКРОФОН: ВКЛ';
});

// ==================== ВСТРОЕННЫЙ РЕДАКТОР ИЗОБРАЖЕНИЙ ====================

const imageEditorModal = document.getElementById('image-editor-modal');
const editorCanvas = document.getElementById('editor-canvas');
const editorCtx = editorCanvas.getContext('2d');
const cropSelectionBox = document.getElementById('crop-selection-box');

const toolBrushBtn = document.getElementById('tool-brush');
const toolHighlighterBtn = document.getElementById('tool-highlighter');
const toolEraserBtn = document.getElementById('tool-eraser');
const toolTextBtn = document.getElementById('tool-text');
const toolCropBtn = document.getElementById('tool-crop');

const editorUndoBtn = document.getElementById('editor-undo-btn');
const editorCancelBtn = document.getElementById('editor-cancel-btn');
const brushSizeInput = document.getElementById('brush-size-input');
const paletteDots = document.querySelectorAll('.palette-dot');
const editorColorPicker = document.getElementById('editor-color-picker');

const editorQuickSendBtn = document.getElementById('editor-quick-send-btn');
const editorFinishCropBtn = document.getElementById('editor-finish-crop-btn');
const editorSendBtn = document.getElementById('editor-send-btn');

let rawOriginalImageBase64 = null;
let currentTool = 'brush';
let currentColor = '#ffffff';
let brushSize = 6;
let undoStack = [];
const MAX_UNDO = 15;

let isDrawing = false;
let lastX = 0;
let lastY = 0;

let isCropping = false;
let cropStartX = 0;
let cropStartY = 0;
let cropEndX = 0;
let cropEndY = 0;

function pushUndoState() {
  if (undoStack.length >= MAX_UNDO) undoStack.shift();
  undoStack.push(editorCanvas.toDataURL('image/png'));
}

function openEditorWithImage(srcBase64) {
  rawOriginalImageBase64 = srcBase64;
  undoStack = [];
  setEditorTool('brush');
  cropSelectionBox.classList.add('hidden');
  editorFinishCropBtn.classList.add('hidden');

  const img = new Image();
  img.onload = () => {
    let w = img.width;
    let h = img.height;
    const maxDimension = 1400;

    if (w > maxDimension || h > maxDimension) {
      if (w > h) {
        h = Math.round((h * maxDimension) / w);
        w = maxDimension;
      } else {
        w = Math.round((w * maxDimension) / h);
        h = maxDimension;
      }
    }

    editorCanvas.width = w;
    editorCanvas.height = h;
    editorCtx.clearRect(0, 0, w, h);
    editorCtx.drawImage(img, 0, 0, w, h);
    pushUndoState();

    imageEditorModal.classList.remove('hidden');
  };
  img.src = srcBase64;
}

function setEditorTool(tool) {
  currentTool = tool;
  [toolBrushBtn, toolHighlighterBtn, toolEraserBtn, toolTextBtn, toolCropBtn].forEach(b => b.classList.remove('active'));

  if (tool === 'brush') toolBrushBtn.classList.add('active');
  if (tool === 'highlighter') toolHighlighterBtn.classList.add('active');
  if (tool === 'eraser') toolEraserBtn.classList.add('active');
  if (tool === 'text') toolTextBtn.classList.add('active');
  if (tool === 'crop') toolCropBtn.classList.add('active');

  if (tool === 'crop') {
    editorFinishCropBtn.classList.remove('hidden');
    cropSelectionBox.classList.remove('hidden');
  } else {
    editorFinishCropBtn.classList.add('hidden');
    cropSelectionBox.classList.add('hidden');
  }
}

toolBrushBtn.onclick = () => setEditorTool('brush');
toolHighlighterBtn.onclick = () => setEditorTool('highlighter');
toolEraserBtn.onclick = () => setEditorTool('eraser');
toolCropBtn.onclick = () => setEditorTool('crop');

toolTextBtn.onclick = () => {
  setEditorTool('text');
  const userText = prompt('Введите надпись на фото:');
  if (!userText || !userText.trim()) return;

  pushUndoState();
  const fontSize = Math.max(18, Math.round(editorCanvas.width / 22));
  editorCtx.font = `bold ${fontSize}px monospace`;
  editorCtx.fillStyle = currentColor;
  editorCtx.shadowColor = 'rgba(0,0,0,0.8)';
  editorCtx.shadowBlur = 6;
  
  const x = editorCanvas.width / 2;
  const y = editorCanvas.height - 40;
  editorCtx.textAlign = 'center';
  editorCtx.fillText(userText.trim(), x, y);
  editorCtx.shadowBlur = 0;
};

paletteDots.forEach(dot => {
  dot.addEventListener('click', () => {
    paletteDots.forEach(d => d.classList.remove('active'));
    dot.classList.add('active');
    currentColor = dot.dataset.color;
    editorColorPicker.value = currentColor;
    if (currentTool === 'eraser') setEditorTool('brush');
  });
});

editorColorPicker.addEventListener('input', (e) => {
  currentColor = e.target.value;
  paletteDots.forEach(d => d.classList.remove('active'));
  if (currentTool === 'eraser') setEditorTool('brush');
});

brushSizeInput.addEventListener('input', (e) => {
  brushSize = parseInt(e.target.value, 10);
});

editorUndoBtn.addEventListener('click', () => {
  if (undoStack.length <= 1) return;
  undoStack.pop();
  const prevState = undoStack[undoStack.length - 1];
  const img = new Image();
  img.onload = () => {
    editorCanvas.width = img.width;
    editorCanvas.height = img.height;
    editorCtx.clearRect(0, 0, img.width, img.height);
    editorCtx.drawImage(img, 0, 0);
  };
  img.src = prevState;
});

editorCancelBtn.addEventListener('click', () => {
  imageEditorModal.classList.add('hidden');
  rawOriginalImageBase64 = null;
});

editorQuickSendBtn.addEventListener('click', () => {
  if (rawOriginalImageBase64) {
    sendMessage('', rawOriginalImageBase64);
  }
  imageEditorModal.classList.add('hidden');
});

editorSendBtn.addEventListener('click', () => {
  const resultWebP = editorCanvas.toDataURL('image/webp', 0.8);
  sendMessage('', resultWebP);
  imageEditorModal.classList.add('hidden');
  rawOriginalImageBase64 = null;
});

function getCanvasCoords(e) {
  const rect = editorCanvas.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  
  const scaleX = editorCanvas.width / rect.width;
  const scaleY = editorCanvas.height / rect.height;

  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY
  };
}

function startDraw(e) {
  const coords = getCanvasCoords(e);

  if (currentTool === 'crop') {
    isCropping = true;
    cropStartX = coords.x;
    cropStartY = coords.y;
    cropEndX = coords.x;
    cropEndY = coords.y;
    updateCropBox();
    return;
  }

  isDrawing = true;
  lastX = coords.x;
  lastY = coords.y;
  pushUndoState();
}

function moveDraw(e) {
  if (isCropping && currentTool === 'crop') {
    const coords = getCanvasCoords(e);
    cropEndX = coords.x;
    cropEndY = coords.y;
    updateCropBox();
    return;
  }

  if (!isDrawing) return;
  e.preventDefault();

  const coords = getCanvasCoords(e);
  editorCtx.save();
  editorCtx.lineCap = 'round';
  editorCtx.lineJoin = 'round';

  if (currentTool === 'brush') {
    editorCtx.globalAlpha = 1.0;
    editorCtx.strokeStyle = currentColor;
    editorCtx.lineWidth = brushSize;
    editorCtx.beginPath();
    editorCtx.moveTo(lastX, lastY);
    editorCtx.lineTo(coords.x, coords.y);
    editorCtx.stroke();
  } else if (currentTool === 'highlighter') {
    editorCtx.globalAlpha = 0.35;
    editorCtx.strokeStyle = currentColor;
    editorCtx.lineWidth = brushSize * 3;
    editorCtx.beginPath();
    editorCtx.moveTo(lastX, lastY);
    editorCtx.lineTo(coords.x, coords.y);
    editorCtx.stroke();
  } else if (currentTool === 'eraser') {
    editorCtx.globalCompositeOperation = 'destination-out';
    editorCtx.lineWidth = brushSize * 2;
    editorCtx.beginPath();
    editorCtx.moveTo(lastX, lastY);
    editorCtx.lineTo(coords.x, coords.y);
    editorCtx.stroke();
  }

  editorCtx.restore();
  lastX = coords.x;
  lastY = coords.y;
}

function stopDraw() {
  isDrawing = false;
  isCropping = false;
}

editorCanvas.addEventListener('mousedown', startDraw);
window.addEventListener('mousemove', moveDraw);
window.addEventListener('mouseup', stopDraw);

editorCanvas.addEventListener('touchstart', startDraw, { passive: false });
window.addEventListener('touchmove', moveDraw, { passive: false });
window.addEventListener('touchend', stopDraw);

function updateCropBox() {
  const rect = editorCanvas.getBoundingClientRect();
  const scaleX = rect.width / editorCanvas.width;
  const scaleY = rect.height / editorCanvas.height;

  const left = Math.min(cropStartX, cropEndX) * scaleX + rect.left;
  const top = Math.min(cropStartY, cropEndY) * scaleY + rect.top;
  const width = Math.abs(cropEndX - cropStartX) * scaleX;
  const height = Math.abs(cropEndY - cropStartY) * scaleY;

  cropSelectionBox.style.left = `${left}px`;
  cropSelectionBox.style.top = `${top}px`;
  cropSelectionBox.style.width = `${width}px`;
  cropSelectionBox.style.height = `${height}px`;
}

editorFinishCropBtn.addEventListener('click', () => {
  const x = Math.min(cropStartX, cropEndX);
  const y = Math.min(cropStartY, cropEndY);
  const w = Math.abs(cropEndX - cropStartX);
  const h = Math.abs(cropEndY - cropStartY);

  if (w < 20 || h < 20) {
    alert('Выделите область побольше для обрезки');
    return;
  }

  pushUndoState();
  const croppedData = editorCtx.getImageData(x, y, w, h);
  editorCanvas.width = w;
  editorCanvas.height = h;
  editorCtx.putImageData(croppedData, 0, 0);

  cropSelectionBox.classList.add('hidden');
  setEditorTool('brush');
});

// ==================== СКРЕПКА И ВСТАВКА ФОТО ====================

function processInputImage(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    openEditorWithImage(e.target.result);
  };
  reader.readAsDataURL(file);
}

attachBtn.addEventListener('click', () => imageFileInput.click());

imageFileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  processInputImage(file);
  imageFileInput.value = '';
});

window.addEventListener('paste', (e) => {
  if (!currentAuthCID || !activePeerCID) return;

  const items = (e.clipboardData || e.originalEvent.clipboardData).items;
  for (let item of items) {
    if (item.type.indexOf('image') !== -1) {
      e.preventDefault();
      const file = item.getAsFile();
      if (!file) continue;
      processInputImage(file);
      break;
    }
  }
});

// ==================== ТЕМЫ И МАСШТАБ ====================

function initThemeAndScale() {
  const savedScale = localStorage.getItem('coum_ui_scale') || '1.0';
  applyScale(savedScale);

  const savedTheme = localStorage.getItem('coum_ui_theme') || 'black';
  if (savedTheme === 'custom') {
    const custom = JSON.parse(localStorage.getItem('coum_custom_colors') || '{}');
    applyCustomTheme(custom.bg, custom.panel, custom.text, custom.accent);
  } else {
    applyTheme(savedTheme);
  }
}

function applyScale(scaleVal) {
  document.documentElement.style.setProperty('--ui-scale', scaleVal);
  localStorage.setItem('coum_ui_scale', scaleVal);
  scaleButtons.forEach(b => {
    b.classList.toggle('active', b.dataset.scale === scaleVal);
  });
}

scaleButtons.forEach(btn => {
  btn.addEventListener('click', () => applyScale(btn.dataset.scale));
});

function applyTheme(themeName) {
  document.documentElement.removeAttribute('style');
  const curScale = localStorage.getItem('coum_ui_scale') || '1.0';
  document.documentElement.style.setProperty('--ui-scale', curScale);

  if (themeName === 'black') {
    document.body.removeAttribute('data-theme');
  } else {
    document.body.setAttribute('data-theme', themeName);
  }
  localStorage.setItem('coum_ui_theme', themeName);

  themeButtons.forEach(b => {
    b.classList.toggle('active', b.dataset.theme === themeName);
  });
}

themeButtons.forEach(btn => {
  btn.addEventListener('click', () => applyTheme(btn.dataset.theme));
});

function applyCustomTheme(bg, panel, text, accent) {
  document.body.removeAttribute('data-theme');
  const curScale = localStorage.getItem('coum_ui_scale') || '1.0';
  
  const root = document.documentElement;
  root.style.setProperty('--ui-scale', curScale);
  root.style.setProperty('--bg-main', bg);
  root.style.setProperty('--bg-panel', panel);
  root.style.setProperty('--bg-input', bg);
  root.style.setProperty('--bg-hover', panel);
  root.style.setProperty('--bg-active', panel);
  root.style.setProperty('--text-main', text);
  root.style.setProperty('--text-bright', text);
  root.style.setProperty('--accent-color', accent);
  root.style.setProperty('--border-color', panel);

  localStorage.setItem('coum_ui_theme', 'custom');
  localStorage.setItem('coum_custom_colors', JSON.stringify({ bg, panel, text, accent }));

  themeButtons.forEach(b => b.classList.remove('active'));
}

applyCustomThemeBtn.addEventListener('click', () => {
  applyCustomTheme(
    customBgInput.value,
    customPanelInput.value,
    customTextInput.value,
    customAccentInput.value
  );
});

openSettingsBtn.addEventListener('click', () => settingsModal.classList.remove('hidden'));
settingsCloseBtn.addEventListener('click', () => settingsModal.classList.add('hidden'));

settingsLogoutBtn.addEventListener('click', () => {
  if (confirm('Вы уверены, что хотите выйти из аккаунта?')) {
    settingsModal.classList.add('hidden');
    performLogout();
  }
});

function performLogout() {
  detachCurrentChatListeners();
  if (currentAuthCID) {
    userChatsRef.child(currentAuthCID).off();
  }
  localStorage.removeItem('coum_active_cid');
  localStorage.removeItem('coum_last_peer');
  cleanupCall();
  currentAuthCID = null;
  activePeerCID = null;
  myUserChats = {};
  appScreen.classList.remove('chat-opened');
  appScreen.classList.add('hidden');
  authScreen.classList.remove('hidden');
  authInput.value = '';
  authError.classList.add('hidden');
}

// ==================== СЕКРЕТНЫЙ ВХОД В АДМИНКУ ====================

let logoClickCount = 0;
let logoClickTimer = null;

authLogo.addEventListener('click', () => {
  logoClickCount++;
  clearTimeout(logoClickTimer);

  if (logoClickCount >= 5) {
    logoClickCount = 0;
    openAdminAuth();
    return;
  }

  logoClickTimer = setTimeout(() => {
    logoClickCount = 0;
  }, 1500);
});

window.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.altKey && (e.code === 'Numpad9' || e.code === 'Digit9' || e.key === '9')) {
    e.preventDefault();
    openAdminAuth();
  }
});

function openAdminAuth() {
  adminAuthModal.classList.remove('hidden');
  adminPassInput.value = '';
  setTimeout(() => adminPassInput.focus(), 50);
}

adminPassInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    if (adminPassInput.value === ADMIN_PASS) {
      adminAuthModal.classList.add('hidden');
      openAdminPanel();
    } else {
      adminAuthModal.classList.add('hidden');
      adminPassInput.value = '';
    }
  } else if (e.key === 'Escape') {
    adminAuthModal.classList.add('hidden');
    adminPassInput.value = '';
  }
});

adminAuthModal.addEventListener('click', (e) => {
  if (e.target === adminAuthModal) {
    adminAuthModal.classList.add('hidden');
    adminPassInput.value = '';
  }
});

function openAdminPanel() {
  adminPanel.classList.remove('hidden');
  renderAdminCIDList();
}

adminCloseBtn.addEventListener('click', () => {
  adminPanel.classList.add('hidden');
});

generateCidBtn.addEventListener('click', () => {
  const newCID = generate11CharCID();
  cidsRef.push(newCID);

  lastGeneratedCidEl.textContent = newCID;
  copyCidBtn.classList.remove('hidden');
});

copyCidBtn.addEventListener('click', () => {
  const text = lastGeneratedCidEl.textContent;
  if (text && text.startsWith('CID_')) {
    navigator.clipboard.writeText(text);
    copyCidBtn.textContent = 'СКОПИРОВАНО';
    setTimeout(() => {
      copyCidBtn.textContent = 'СКОПИРОВАТЬ';
    }, 1200);
  }
});

function renderAdminCIDList() {
  adminCidListEl.innerHTML = '';
  const entries = Object.entries(cloudCidsKeys);

  if (entries.length === 0) {
    adminCidListEl.innerHTML = '<span style="color:#555;">База пуста.</span>';
    return;
  }

  entries.forEach(([dbKey, cid]) => {
    const row = document.createElement('div');
    row.className = 'admin-cid-row';

    const info = document.createElement('span');
    const namePart = cloudUsers[cid]?.name ? ` [${cloudUsers[cid].name}]` : '';
    info.textContent = `${cid}${namePart}`;

    const delBtn = document.createElement('button');
    delBtn.className = 'admin-del-btn';
    delBtn.textContent = '[УДАЛИТЬ]';
    delBtn.onclick = () => openDeleteModal(dbKey, cid);

    row.appendChild(info);
    row.appendChild(delBtn);
    adminCidListEl.appendChild(row);
  });
}

function openDeleteModal(dbKey, cid) {
  cidPendingDelete = { dbKey, cid };
  deleteConfirmModal.classList.remove('hidden');
  deletePhraseInput.value = '';
  confirmDeleteBtn.disabled = true;
  setTimeout(() => deletePhraseInput.focus(), 50);
}

deletePhraseInput.addEventListener('input', () => {
  confirmDeleteBtn.disabled = (deletePhraseInput.value.trim() !== DELETE_CONFIRM_PHRASE);
});

cancelDeleteBtn.addEventListener('click', () => {
  deleteConfirmModal.classList.add('hidden');
  cidPendingDelete = null;
});

confirmDeleteBtn.addEventListener('click', async () => {
  if (!cidPendingDelete) return;
  const { dbKey, cid } = cidPendingDelete;

  await cidsRef.child(dbKey).remove();
  await usersRef.child(cid).remove();
  await userChatsRef.child(cid).remove();

  deleteConfirmModal.classList.add('hidden');
  cidPendingDelete = null;
});

// ==================== ВХОД В ПРИЛОЖЕНИЕ ====================

async function attemptLogin(inputCID) {
  const cleanCID = inputCID.trim();
  if (!cleanCID) return;
  
  const snapshot = await cidsRef.once('value');
  const list = snapshot.val() ? Object.values(snapshot.val()) : [];

  if (list.includes(cleanCID)) {
    authError.classList.add('hidden');
    currentAuthCID = cleanCID;
    localStorage.setItem('coum_active_cid', cleanCID);

    const userSnap = await usersRef.child(cleanCID).once('value');
    if (!userSnap.exists()) {
      let initialName = prompt('Введите ваше имя:');
      if (!initialName || !initialName.trim()) {
        initialName = cleanCID.slice(0, 8);
      }
      await usersRef.child(cleanCID).set({ name: initialName.trim() });
    }

    enterApp();
  } else {
    authError.classList.remove('hidden');
  }
}

authInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    attemptLogin(authInput.value);
  } else {
    authError.classList.add('hidden');
  }
});

function enterApp() {
  authScreen.classList.add('hidden');
  appScreen.classList.remove('hidden');

  renderProfile();
  initCallSignalingListener();
  attachUserChatsListener();

  if (activePeerCID) {
    attachChatListeners();
  } else {
    updateTopBarInfo();
  }

  renderSidebar();
}

mobileBackBtn.addEventListener('click', () => {
  appScreen.classList.remove('chat-opened');
});

// ==================== ПРОФИЛЬ ====================

function renderProfile() {
  if (!currentAuthCID) return;
  const myName = cloudUsers[currentAuthCID]?.name || currentAuthCID;
  myDisplayNameEl.textContent = myName;
  myFixedCidEl.textContent = currentAuthCID;
}

myFixedCidEl.addEventListener('click', () => {
  if (!currentAuthCID) return;
  navigator.clipboard.writeText(currentAuthCID);
  const oldText = myFixedCidEl.textContent;
  myFixedCidEl.textContent = 'СКОПИРОВАНО!';
  setTimeout(() => {
    myFixedCidEl.textContent = oldText;
  }, 1200);
});

editNameBtn.addEventListener('click', () => {
  const currentName = cloudUsers[currentAuthCID]?.name || '';
  const newName = prompt('Новое имя:', currentName);
  if (newName && newName.trim()) {
    usersRef.child(currentAuthCID).update({ name: newName.trim() });
  }
});

// ==================== ПРОСМОТРЩИК КАРТИНОК ====================

function openImageViewer(src) {
  viewerImg.src = src;
  imageViewerModal.classList.remove('hidden');
}

closeViewerBtn.addEventListener('click', () => {
  imageViewerModal.classList.add('hidden');
  viewerImg.src = '';
});

imageViewerModal.addEventListener('click', (e) => {
  if (e.target === imageViewerModal) {
    imageViewerModal.classList.add('hidden');
    viewerImg.src = '';
  }
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeContextMenu();
    if (!imageEditorModal.classList.contains('hidden')) {
      imageEditorModal.classList.add('hidden');
    }
    if (!imageViewerModal.classList.contains('hidden')) {
      imageViewerModal.classList.add('hidden');
      viewerImg.src = '';
    }
  }
});

messageInput.addEventListener('focus', () => {
  setTimeout(() => {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }, 300);
});

// Инициализация при старте страницы
initThemeAndScale();

if (currentAuthCID) {
  cidsRef.once('value').then((snap) => {
    const list = snap.val() ? Object.values(snap.val()) : [];
    if (list.includes(currentAuthCID)) {
      enterApp();
    } else {
      localStorage.removeItem('coum_active_cid');
    }
  });
}