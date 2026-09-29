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

const cidsRef = db.ref('allowed_cids');
const usersRef = db.ref('users');
const chatsRef = db.ref('chats');
const groupsRef = db.ref('groups');
const userChatsRef = db.ref('user_chats');
const callsRef = db.ref('calls');

let cloudCids = [];
let cloudCidsKeys = {};
let cloudUsers = {};
let myUserChats = {};

let currentAuthCID = localStorage.getItem('coum_active_cid') || null;
let pendingLoginCID = null;
let activeTargetID = localStorage.getItem('coum_last_target_id') || null;
let activeTargetType = 'direct';

let currentMetaListener = null;
let currentMessagesListener = null;
let currentPinnedListener = null;
let currentGroupMembersListener = null;

let searchFilterMode = 'name';
let searchQuery = '';

let editingMessageId = null;
let targetContextMessage = null;

/* ==================== ВСПОМОГАТЕЛЬНЫЕ ==================== */

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
  if (date.toDateString() === now.toDateString()) return 'СЕГОДНЯ';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'ВЧЕРА';
  const options = { day: 'numeric', month: 'long' };
  if (date.getFullYear() !== now.getFullYear()) options.year = 'numeric';
  return date.toLocaleDateString('ru-RU', options).toUpperCase();
}

function generate11CharCID() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let randomPart = '';
  for (let i = 0; i < 11; i++) randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
  return `CID_${randomPart}`;
}

function generate11CharGID() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let randomPart = '';
  for (let i = 0; i < 11; i++) randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
  return `GID_${randomPart}`;
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

/* ==================== REALTIME ==================== */

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
    if (activeTargetID) updateTopBarInfo();
  }
});

function attachUserChatsListener() {
  if (!currentAuthCID) return;
  userChatsRef.child(currentAuthCID).on('value', (snapshot) => {
    myUserChats = snapshot.val() || {};
    renderSidebar();
  });
}

/* ==================== DOM ==================== */

const authScreen = document.getElementById('auth-screen');
const authLogo = document.getElementById('auth-logo');
const appScreen = document.getElementById('app-screen');

const authCidRow = document.getElementById('auth-cid-row');
const authInput = document.getElementById('auth-input');
const authSubmitCidBtn = document.getElementById('auth-submit-cid-btn');
const authPassRow = document.getElementById('auth-pass-row');
const authPassInput = document.getElementById('auth-pass-input');
const authSubmitPassBtn = document.getElementById('auth-submit-pass-btn');
const authError = document.getElementById('auth-error');
const authHint = document.getElementById('auth-hint');

const myDisplayNameEl = document.getElementById('my-display-name');
const myFixedCidEl = document.getElementById('my-fixed-cid');
const myMiniAvatarEl = document.getElementById('my-mini-avatar');
const editNameBtn = document.getElementById('edit-name-btn');
const peersListEl = document.getElementById('peers-list');
const sidebarSectionTitle = document.getElementById('sidebar-section-title');

const contactSearchInput = document.getElementById('contact-search-input');
const searchClearBtn = document.getElementById('search-clear-btn');
const filterNameBtn = document.getElementById('filter-name-btn');
const filterCidBtn = document.getElementById('filter-cid-btn');

const sidebarPlusBtn = document.getElementById('sidebar-plus-btn');
const plusDropdownMenu = document.getElementById('plus-dropdown-menu');
const dropdownCreateGroupBtn = document.getElementById('dropdown-create-group-btn');

const activeChatAvatar = document.getElementById('active-chat-avatar');
const activePeerHeaderEl = document.getElementById('active-peer-header');
const activeGroupSubtitle = document.getElementById('active-group-subtitle');
const groupManageBtn = document.getElementById('group-manage-btn');
const startGroupCallBtn = document.getElementById('start-group-call-btn');
const mobileBackBtn = document.getElementById('mobile-back-btn');
const messagesContainer = document.getElementById('messages-container');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');
const sendMsgBtn = document.getElementById('send-msg-btn');
const attachBtn = document.getElementById('attach-btn');
const imageFileInput = document.getElementById('image-file-input');
const startCallBtn = document.getElementById('start-call-btn');

const antispamRequestBanner = document.getElementById('antispam-request-banner');
const antispamBannerText = document.getElementById('antispam-banner-text');
const acceptChatBtn = document.getElementById('accept-chat-btn');
const rejectChatBtn = document.getElementById('reject-chat-btn');
const pinnedBar = document.getElementById('pinned-bar');
const pinnedTypeLabel = document.getElementById('pinned-type-label');
const pinnedTextPreview = document.getElementById('pinned-text-preview');
const unpinBtn = document.getElementById('unpin-btn');

const editStateBar = document.getElementById('edit-state-bar');
const cancelEditBtn = document.getElementById('cancel-edit-btn');

const msgContextMenu = document.getElementById('msg-context-menu');
const ctxCopyBtn = document.getElementById('ctx-copy-btn');
const ctxEditBtn = document.getElementById('ctx-edit-btn');
const ctxPinBothBtn = document.getElementById('ctx-pin-both-btn');
const ctxPinSelfBtn = document.getElementById('ctx-pin-self-btn');
const ctxDeleteBtn = document.getElementById('ctx-delete-btn');
const reactionEmojiButtons = document.querySelectorAll('.reaction-emoji-btn');

const createGroupModal = document.getElementById('create-group-modal');
const closeCreateGroupBtn = document.getElementById('close-create-group-btn');
const newGroupNameInput = document.getElementById('new-group-name-input');
const submitCreateGroupBtn = document.getElementById('submit-create-group-btn');

const groupManageModal = document.getElementById('group-manage-modal');
const closeGroupManageBtn = document.getElementById('close-group-manage-btn');
const groupManageTitle = document.getElementById('group-manage-title');
const groupManageGid = document.getElementById('group-manage-gid');
const groupRenameSection = document.getElementById('group-rename-section');
const groupRenameInput = document.getElementById('group-rename-input');
const saveGroupNameBtn = document.getElementById('save-group-name-btn');
const groupMembersCount = document.getElementById('group-members-count');
const openInviteModalBtn = document.getElementById('open-invite-modal-btn');
const groupMembersList = document.getElementById('group-members-list');
const leaveGroupBtn = document.getElementById('leave-group-btn');
const deleteGroupBtn = document.getElementById('delete-group-btn');

const groupInviteModal = document.getElementById('group-invite-modal');
const closeInviteModalBtn = document.getElementById('close-invite-modal-btn');
const inviteCandidatesList = document.getElementById('invite-candidates-list');

const imageViewerModal = document.getElementById('image-viewer-modal');
const viewerImg = document.getElementById('viewer-img');
const closeViewerBtn = document.getElementById('close-viewer-btn');

const openSettingsBtn = document.getElementById('open-settings-btn');
const settingsModal = document.getElementById('settings-modal');
const settingsCloseBtn = document.getElementById('settings-close-btn');
const settingsLogoutBtn = document.getElementById('settings-logout-btn');

const settingsAvatarPreview = document.getElementById('settings-avatar-preview');
const avatarFileInput = document.getElementById('avatar-file-input');
const uploadAvatarBtn = document.getElementById('upload-avatar-btn');
const clearAvatarBtn = document.getElementById('clear-avatar-btn');

const passwordStatusIndicator = document.getElementById('password-status-indicator');
const setPassInput1 = document.getElementById('set-pass-input1');
const setPassInput2 = document.getElementById('set-pass-input2');
const savePasswordBtn = document.getElementById('save-password-btn');
const removePasswordBtn = document.getElementById('remove-password-btn');

const autoDeleteCheckbox = document.getElementById('auto-delete-checkbox');
const autoDeleteAttemptsInput = document.getElementById('auto-delete-attempts-input');
const saveAutoDeleteConfigBtn = document.getElementById('save-auto-delete-config-btn');

const selfDestructWarnModal = document.getElementById('self-destruct-warn-modal');
const confirmSelfDestructBtn = document.getElementById('confirm-self-destruct-btn');
const cancelSelfDestructBtn = document.getElementById('cancel-self-destruct-btn');
let warnTimerInterval = null;

const hideCidCheckbox = document.getElementById('hide-cid-checkbox');
const scaleButtons = document.querySelectorAll('.scale-btn');
const themeButtons = document.querySelectorAll('.theme-select-btn');
const applyCustomThemeBtn = document.getElementById('apply-custom-theme-btn');
const customBgInput = document.getElementById('custom-color-bg');
const customPanelInput = document.getElementById('custom-color-panel');
const customTextInput = document.getElementById('custom-color-text');
const customAccentInput = document.getElementById('custom-color-accent');

const adminAuthModal = document.getElementById('admin-auth-modal');
const adminPassInput = document.getElementById('admin-pass-input');
const adminPanel = document.getElementById('admin-panel');
const adminCloseBtn = document.getElementById('admin-close-btn');
const generateCidBtn = document.getElementById('generate-cid-btn');
const copyCidBtn = document.getElementById('copy-cid-btn');
const lastGeneratedCidEl = document.getElementById('last-generated-cid');
const adminCidListEl = document.getElementById('admin-cid-list');

const deleteConfirmModal = document.getElementById('delete-confirm-modal');
const deletePhraseInput = document.getElementById('delete-phrase-input');
const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
const cancelDeleteBtn = document.getElementById('cancel-delete-btn');
let cidPendingDelete = null;

/* ==================== ПЛЮСИК ==================== */

sidebarPlusBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  const isHidden = plusDropdownMenu.classList.contains('hidden');
  plusDropdownMenu.classList.toggle('hidden', !isHidden);
  sidebarPlusBtn.classList.toggle('active', isHidden);
});

document.addEventListener('click', (e) => {
  if (!plusDropdownMenu.contains(e.target) && e.target !== sidebarPlusBtn) {
    plusDropdownMenu.classList.add('hidden');
    sidebarPlusBtn.classList.remove('active');
  }
});

dropdownCreateGroupBtn.addEventListener('click', () => {
  plusDropdownMenu.classList.add('hidden');
  sidebarPlusBtn.classList.remove('active');
  createGroupModal.classList.remove('hidden');
  newGroupNameInput.value = '';
  setTimeout(() => newGroupNameInput.focus(), 80);
});

/* ==================== ПОИСК ==================== */

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
    sidebarSectionTitle.textContent = searchFilterMode === 'name' ? 'ПОИСК ПО НИКУ' : 'ПОИСК ПО CID';
    const lowerQuery = searchQuery.toLowerCase();
    const matchedCids = cloudCids.filter(cid => {
      if (cid === currentAuthCID) return false;
      const userObj = cloudUsers[cid] || {};
      const userName = (userObj.name || '').toLowerCase();
      if (searchFilterMode === 'name') return userName.includes(lowerQuery);
      if (userObj.hideCid) return false;
      return cid.toLowerCase().includes(lowerQuery);
    });

    if (matchedCids.length === 0) {
      peersListEl.innerHTML = '<div style="padding:16px;color:var(--text-muted);font-size:11px;text-align:center;">НИЧЕГО НЕ НАЙДЕНО</div>';
      return;
    }

    matchedCids.forEach(peerCID => {
      const isAlreadyChat = !!myUserChats[peerCID];
      const peerObj = cloudUsers[peerCID] || {};
      const displayName = peerObj.name || peerCID;
      const cidLabel = peerObj.hideCid ? '[CID СКРЫТ]' : peerCID;
      const avatarStyle = peerObj.avatarUrl ? `background-image: url('${peerObj.avatarUrl}');` : '';

      const btn = document.createElement('button');
      btn.className = `peer-btn ${peerCID === activeTargetID ? 'active' : ''}`;
      btn.innerHTML = `
        <div class="peer-avatar-thumb" style="${avatarStyle}"></div>
        <div class="peer-btn-info">
          <span class="peer-btn-name">${escapeHTML(displayName)}</span>
          <span class="peer-btn-cid">${cidLabel}</span>
          ${isAlreadyChat ? '<span class="peer-btn-tag">[УЖЕ В ЧАТАХ]</span>' : '<span class="peer-btn-tag" style="color:var(--accent-color);">[НАЧАТЬ ДИАЛОГ]</span>'}
        </div>
      `;
      btn.onclick = () => selectChat(peerCID, 'direct');
      peersListEl.appendChild(btn);
    });
  } else {
    sidebarSectionTitle.textContent = 'ДИАЛОГИ';
    const entries = Object.entries(myUserChats);

    if (entries.length === 0) {
      peersListEl.innerHTML = '<div style="padding:20px 16px;color:var(--text-muted);font-size:11px;line-height:1.6;text-align:center;">НЕТ АКТИВНЫХ ДИАЛОГОВ<br><br>Создайте группу через [+] или найдите собеседника.</div>';
      return;
    }

    entries.forEach(([targetId, info]) => {
      const isGroup = info.type === 'group' || targetId.startsWith('GID_');
      let displayName = '';
      let subInfo = '';
      let tagHTML = '';
      let avatarStyle = '';

      if (isGroup) {
        displayName = info.title || 'Безымянная группа';
        subInfo = targetId;
        tagHTML = info.status === 'pending_group'
          ? '<span class="peer-btn-tag" style="color:#ef4444;">[ПРИГЛАШЕНИЕ]</span>'
          : '<span class="peer-btn-tag" style="color:var(--accent-color);">[ГРУППА]</span>';
      } else {
        if (!cloudCids.includes(targetId)) return;
        const peerObj = cloudUsers[targetId] || {};
        displayName = peerObj.name || info.peerUsername || targetId;
        subInfo = peerObj.hideCid ? '[CID СКРЫТ]' : targetId;
        if (peerObj.avatarUrl) avatarStyle = `background-image: url('${peerObj.avatarUrl}');`;
        if (info.status === 'pending') {
          tagHTML = info.isInitiator
            ? '<span class="peer-btn-tag">[ОЖИДАНИЕ]</span>'
            : '<span class="peer-btn-tag" style="color:#ef4444;">[ЗАПРОС]</span>';
        }
      }

      const btn = document.createElement('button');
      btn.className = `peer-btn ${targetId === activeTargetID ? 'active' : ''}`;
      btn.innerHTML = `
        <div class="peer-avatar-thumb" style="${avatarStyle}"></div>
        <div class="peer-btn-info">
          <span class="peer-btn-name">${escapeHTML(displayName)}</span>
          <span class="peer-btn-cid">${subInfo}</span>
          ${tagHTML}
        </div>
      `;
      btn.onclick = () => selectChat(targetId, isGroup ? 'group' : 'direct');
      peersListEl.appendChild(btn);
    });
  }
}

function selectChat(targetId, type) {
  if (activeTargetID === targetId && activeTargetType === type) {
    appScreen.classList.add('chat-opened');
    return;
  }
  activeTargetID = targetId;
  activeTargetType = type;
  localStorage.setItem('coum_last_target_id', targetId);
  localStorage.setItem('coum_last_target_type', type);
  cancelEditingMessage();
  renderSidebar();
  attachActiveChatListeners();
  appScreen.classList.add('chat-opened');
}

function updateTopBarInfo() {
  if (!activeTargetID) {
    activePeerHeaderEl.textContent = 'ВЫБЕРИТЕ ДИАЛОГ';
    activeGroupSubtitle.classList.add('hidden');
    groupManageBtn.classList.add('hidden');
    startGroupCallBtn.classList.add('hidden');
    startCallBtn.classList.remove('hidden');
    activeChatAvatar.style.backgroundImage = 'none';
    return;
  }

  if (activeTargetType === 'group') {
    const groupTitle = myUserChats[activeTargetID]?.title || 'Группа';
    activePeerHeaderEl.textContent = groupTitle;
    activeGroupSubtitle.textContent = activeTargetID;
    activeGroupSubtitle.classList.remove('hidden');
    groupManageBtn.classList.remove('hidden');
    startCallBtn.classList.add('hidden');
    startGroupCallBtn.classList.remove('hidden');
    activeChatAvatar.style.backgroundImage = 'none';
  } else {
    const peerObj = cloudUsers[activeTargetID] || {};
    const name = peerObj.name || activeTargetID;
    const cidLabel = peerObj.hideCid ? '[CID СКРЫТ]' : activeTargetID;
    activePeerHeaderEl.textContent = `${name} (${cidLabel})`;
    activeGroupSubtitle.classList.add('hidden');
    groupManageBtn.classList.add('hidden');
    startGroupCallBtn.classList.add('hidden');
    startCallBtn.classList.remove('hidden');
    if (peerObj.avatarUrl) {
      activeChatAvatar.style.backgroundImage = `url('${peerObj.avatarUrl}')`;
    } else {
      activeChatAvatar.style.backgroundImage = 'none';
    }
  }
}

/* ==================== СЛУШАТЕЛИ ЧАТА ==================== */

function detachCurrentChatListeners() {
  if (!activeTargetID) return;
  if (activeTargetType === 'group') {
    const groupRef = groupsRef.child(activeTargetID);
    if (currentMetaListener) groupRef.child('meta').off('value', currentMetaListener);
    if (currentMessagesListener) groupRef.child('messages').off('value', currentMessagesListener);
    if (currentPinnedListener) groupRef.child('pinned').off('value', currentPinnedListener);
    if (currentGroupMembersListener) groupRef.child('members').off('value', currentGroupMembersListener);
  } else {
    const chatKey = getChatKey(currentAuthCID, activeTargetID);
    const chatRef = chatsRef.child(chatKey);
    if (currentMetaListener) chatRef.child('meta').off('value', currentMetaListener);
    if (currentMessagesListener) chatRef.child('messages').off('value', currentMessagesListener);
    if (currentPinnedListener) chatRef.child('pinned').off('value', currentPinnedListener);
  }
  currentMetaListener = null;
  currentMessagesListener = null;
  currentPinnedListener = null;
  currentGroupMembersListener = null;
}

function attachActiveChatListeners() {
  detachCurrentChatListeners();
  if (!activeTargetID || !currentAuthCID) return;
  updateTopBarInfo();

  if (activeTargetType === 'group') {
    const groupRef = groupsRef.child(activeTargetID);
    currentMetaListener = groupRef.child('meta').on('value', (snap) => {
      const meta = snap.val();
      if (!meta) {
        delete myUserChats[activeTargetID];
        activeTargetID = null;
        updateTopBarInfo();
        renderSidebar();
        messagesContainer.innerHTML = '';
        return;
      }
      activePeerHeaderEl.textContent = meta.title || 'Группа';
      if (myUserChats[activeTargetID]) myUserChats[activeTargetID].title = meta.title;
      renderSidebar();
      updateGroupStatusUI();
    });
    currentPinnedListener = groupRef.child('pinned').on('value', (snap) => updatePinnedBarUI(snap.val()));
    currentMessagesListener = groupRef.child('messages').on('value', (snap) => renderMessages(snap.val() || {}));
    currentGroupMembersListener = groupRef.child('members').on('value', (snap) => {
      const members = snap.val() || {};
      const count = Object.keys(members).length;
      activeGroupSubtitle.textContent = `${activeTargetID} • ${count} уч.`;
      if (!members[currentAuthCID]) updateGroupStatusUI();
    });
  } else {
    const chatKey = getChatKey(currentAuthCID, activeTargetID);
    const chatRef = chatsRef.child(chatKey);
    currentMetaListener = chatRef.child('meta').on('value', (snap) => updateDirectChatStatusUI(snap.val()));
    currentPinnedListener = chatRef.child('pinned').on('value', (snap) => updatePinnedBarUI(snap.val()));
    currentMessagesListener = chatRef.child('messages').on('value', (snap) => renderMessages(snap.val() || {}));
  }
}

function updateDirectChatStatusUI(meta) {
  const isPending = meta && meta.status === 'pending';
  const initiatorCid = meta ? meta.initiatorCid : null;
  if (isPending) {
    if (initiatorCid === currentAuthCID) {
      antispamRequestBanner.classList.add('hidden');
      messageInput.disabled = true;
      messageInput.placeholder = 'Ожидание принятия запроса...';
      sendMsgBtn.disabled = true;
      attachBtn.disabled = true;
      startCallBtn.disabled = true;
    } else {
      antispamBannerText.textContent = 'Новый контакт отправил запрос на переписку.';
      antispamRequestBanner.classList.remove('hidden');
      messageInput.disabled = true;
      messageInput.placeholder = 'Примите запрос...';
      sendMsgBtn.disabled = true;
      attachBtn.disabled = true;
      startCallBtn.disabled = true;
    }
  } else {
    antispamRequestBanner.classList.add('hidden');
    messageInput.disabled = false;
    messageInput.placeholder = 'Сообщение...';
    sendMsgBtn.disabled = false;
    attachBtn.disabled = false;
    startCallBtn.disabled = false;
  }
}

function updateGroupStatusUI() {
  const chatInfo = myUserChats[activeTargetID];
  const isPendingInvite = chatInfo && chatInfo.status === 'pending_group';
  if (isPendingInvite) {
    antispamBannerText.textContent = `Вас пригласили в группу «${chatInfo.title || activeTargetID}».`;
    antispamRequestBanner.classList.remove('hidden');
    messageInput.disabled = true;
    messageInput.placeholder = 'Примите приглашение...';
    sendMsgBtn.disabled = true;
    attachBtn.disabled = true;
  } else {
    antispamRequestBanner.classList.add('hidden');
    messageInput.disabled = false;
    messageInput.placeholder = 'Сообщение в группу...';
    sendMsgBtn.disabled = false;
    attachBtn.disabled = false;
  }
}

acceptChatBtn.addEventListener('click', async () => {
  if (!activeTargetID || !currentAuthCID) return;
  if (activeTargetType === 'group') {
    await groupsRef.child(activeTargetID).child('members').child(currentAuthCID).set('member');
    await userChatsRef.child(currentAuthCID).child(activeTargetID).update({ status: 'accepted' });
    if (myUserChats[activeTargetID]) myUserChats[activeTargetID].status = 'accepted';
    updateGroupStatusUI();
  } else {
    const chatKey = getChatKey(currentAuthCID, activeTargetID);
    await chatsRef.child(chatKey).child('meta').update({ status: 'accepted' });
    await userChatsRef.child(currentAuthCID).child(activeTargetID).update({ status: 'accepted' });
    await userChatsRef.child(activeTargetID).child(currentAuthCID).update({ status: 'accepted' });
    updateDirectChatStatusUI({ status: 'accepted' });
  }
  antispamRequestBanner.classList.add('hidden');
  renderSidebar();
});

rejectChatBtn.addEventListener('click', async () => {
  if (!activeTargetID || !currentAuthCID) return;
  if (!confirm('Отклонить и удалить диалог?')) return;
  if (activeTargetType === 'group') {
    await userChatsRef.child(currentAuthCID).child(activeTargetID).remove();
    await groupsRef.child(activeTargetID).child('members').child(currentAuthCID).remove();
  } else {
    const chatKey = getChatKey(currentAuthCID, activeTargetID);
    await chatsRef.child(chatKey).remove();
    await userChatsRef.child(currentAuthCID).child(activeTargetID).remove();
    await userChatsRef.child(activeTargetID).child(currentAuthCID).remove();
  }
  activeTargetID = null;
  localStorage.removeItem('coum_last_target_id');
  messagesContainer.innerHTML = '';
  antispamRequestBanner.classList.add('hidden');
  pinnedBar.classList.add('hidden');
  updateTopBarInfo();
  renderSidebar();
  appScreen.classList.remove('chat-opened');
});

/* ==================== ГРУППЫ ==================== */

closeCreateGroupBtn.addEventListener('click', () => createGroupModal.classList.add('hidden'));

submitCreateGroupBtn.addEventListener('click', async () => {
  const groupTitle = newGroupNameInput.value.trim();
  if (!groupTitle) { alert('Введите название группы!'); return; }
  const newGID = generate11CharGID();
  const groupData = {
    meta: {
      groupId: newGID,
      title: groupTitle,
      ownerCid: currentAuthCID,
      createdAt: firebase.database.ServerValue.TIMESTAMP
    },
    members: { [currentAuthCID]: 'owner' }
  };
  await groupsRef.child(newGID).set(groupData);
  await userChatsRef.child(currentAuthCID).child(newGID).set({
    type: 'group', title: groupTitle, status: 'accepted'
  });
  createGroupModal.classList.add('hidden');
  selectChat(newGID, 'group');
});

groupManageBtn.addEventListener('click', () => {
  if (!activeTargetID || activeTargetType !== 'group') return;
  openGroupSettingsModal();
});

closeGroupManageBtn.addEventListener('click', () => groupManageModal.classList.add('hidden'));

async function openGroupSettingsModal() {
  const groupSnap = await groupsRef.child(activeTargetID).once('value');
  const group = groupSnap.val();
  if (!group || !group.meta) return;
  const isOwner = group.meta.ownerCid === currentAuthCID;
  groupManageTitle.textContent = `ГРУППА: ${group.meta.title}`;
  groupManageGid.textContent = group.meta.groupId;
  groupRenameInput.value = group.meta.title;
  groupRenameSection.style.display = isOwner ? 'flex' : 'none';
  deleteGroupBtn.classList.toggle('hidden', !isOwner);
  const members = group.members || {};
  const memberCids = Object.keys(members);
  groupMembersCount.textContent = memberCids.length;
  groupMembersList.innerHTML = '';
  memberCids.forEach(cid => {
    const role = members[cid];
    const name = cloudUsers[cid]?.name || cid;
    const row = document.createElement('div');
    row.className = 'group-member-item';
    row.innerHTML = `
      <span>${escapeHTML(name)} <small style="color:var(--text-muted);">(${cid})</small></span>
      <span class="member-role-badge ${role === 'owner' ? 'role-owner' : 'role-member'}">${role.toUpperCase()}</span>
    `;
    groupMembersList.appendChild(row);
  });
  groupManageModal.classList.remove('hidden');
}

groupManageGid.addEventListener('click', () => {
  navigator.clipboard.writeText(activeTargetID);
  const oldText = groupManageGid.textContent;
  groupManageGid.textContent = 'GID СКОПИРОВАН';
  setTimeout(() => { groupManageGid.textContent = oldText; }, 1200);
});

saveGroupNameBtn.addEventListener('click', async () => {
  const newName = groupRenameInput.value.trim();
  if (!newName) return;
  await groupsRef.child(activeTargetID).child('meta').update({ title: newName });
  await userChatsRef.child(currentAuthCID).child(activeTargetID).update({ title: newName });
  alert('Название группы обновлено!');
});

leaveGroupBtn.addEventListener('click', async () => {
  if (!confirm('Выйти из этой группы?')) return;
  await groupsRef.child(activeTargetID).child('members').child(currentAuthCID).remove();
  await userChatsRef.child(currentAuthCID).child(activeTargetID).remove();
  groupManageModal.classList.add('hidden');
  activeTargetID = null;
  localStorage.removeItem('coum_last_target_id');
  updateTopBarInfo();
  renderSidebar();
  messagesContainer.innerHTML = '';
  appScreen.classList.remove('chat-opened');
});

deleteGroupBtn.addEventListener('click', async () => {
  if (!confirm('Группа и вся переписка будут удалены навсегда. Удалить?')) return;
  const gid = activeTargetID;
  const groupSnap = await groupsRef.child(gid).once('value');
  const group = groupSnap.val();
  if (group && group.members) {
    const memberCids = Object.keys(group.members);
    for (const cid of memberCids) {
      await userChatsRef.child(cid).child(gid).remove();
    }
  }
  await groupsRef.child(gid).remove();
  groupManageModal.classList.add('hidden');
  activeTargetID = null;
  localStorage.removeItem('coum_last_target_id');
  updateTopBarInfo();
  renderSidebar();
  messagesContainer.innerHTML = '';
  appScreen.classList.remove('chat-opened');
});

openInviteModalBtn.addEventListener('click', async () => {
  inviteCandidatesList.innerHTML = '';
  const groupSnap = await groupsRef.child(activeTargetID).once('value');
  const existingMembers = groupSnap.val()?.members || {};
  const acceptedFriends = Object.entries(myUserChats).filter(([cid, chat]) => {
    return chat.type !== 'group' && !cid.startsWith('GID_') && chat.status === 'accepted';
  });
  if (acceptedFriends.length === 0) {
    inviteCandidatesList.innerHTML = '<div style="padding:14px;color:var(--text-muted);font-size:11px;">Нет подтвержденных контактов.</div>';
    groupInviteModal.classList.remove('hidden');
    return;
  }
  let candidatesCount = 0;
  acceptedFriends.forEach(([friendCID, chat]) => {
    if (existingMembers[friendCID]) return;
    candidatesCount++;
    const friendName = cloudUsers[friendCID]?.name || chat.peerUsername || friendCID;
    const row = document.createElement('div');
    row.className = 'invite-candidate-item';
    row.innerHTML = `
      <span>${escapeHTML(friendName)} <small style="color:var(--text-muted);">(${friendCID})</small></span>
      <button type="button" class="btn-small-accent">ПРИГЛАСИТЬ</button>
    `;
    row.querySelector('button').onclick = async () => {
      await sendGroupInvite(friendCID);
      row.remove();
    };
    inviteCandidatesList.appendChild(row);
  });
  if (candidatesCount === 0) {
    inviteCandidatesList.innerHTML = '<div style="padding:14px;color:var(--text-muted);font-size:11px;">Все друзья уже в группе.</div>';
  }
  groupInviteModal.classList.remove('hidden');
});

closeInviteModalBtn.addEventListener('click', () => groupInviteModal.classList.add('hidden'));

async function sendGroupInvite(targetCID) {
  const groupSnap = await groupsRef.child(activeTargetID).child('meta').once('value');
  const groupMeta = groupSnap.val();
  if (!groupMeta) return;
  await userChatsRef.child(targetCID).child(activeTargetID).set({
    type: 'group', title: groupMeta.title, status: 'pending_group', invitedBy: currentAuthCID
  });
  alert(`Приглашение отправлено ${cloudUsers[targetCID]?.name || targetCID}!`);
}

/* ==================== ЗАКРЕП ==================== */

let currentPinnedMsgId = null;

function updatePinnedBarUI(cloudPinned) {
  if (cloudPinned && cloudPinned.text) {
    currentPinnedMsgId = cloudPinned.id || null;
    pinnedTypeLabel.textContent = 'ЗАКРЕП:';
    pinnedTextPreview.textContent = cloudPinned.text;
    pinnedBar.classList.remove('hidden');
    pinnedBar.dataset.pinnedType = 'both';
    return;
  }
  const localKey = activeTargetType === 'group'
    ? `coum_pinned_${activeTargetID}`
    : `coum_pinned_${getChatKey(currentAuthCID, activeTargetID)}`;
  const localDataRaw = localStorage.getItem(localKey);
  if (localDataRaw) {
    try {
      const parsed = JSON.parse(localDataRaw);
      currentPinnedMsgId = parsed.id || null;
      pinnedTypeLabel.textContent = 'ЗАКРЕП (Я):';
      pinnedTextPreview.textContent = parsed.text || '';
    } catch(e) {
      currentPinnedMsgId = null;
      pinnedTypeLabel.textContent = 'ЗАКРЕП (Я):';
      pinnedTextPreview.textContent = localDataRaw;
    }
    pinnedBar.classList.remove('hidden');
    pinnedBar.dataset.pinnedType = 'self';
    return;
  }
  currentPinnedMsgId = null;
  pinnedBar.classList.add('hidden');
  pinnedBar.dataset.pinnedType = '';
}

pinnedBar.addEventListener('click', (e) => {
  if (e.target === unpinBtn || unpinBtn.contains(e.target)) return;
  if (!currentPinnedMsgId) return;
  const targetMsgEl = messagesContainer.querySelector(`[data-msg-id="${currentPinnedMsgId}"]`);
  if (targetMsgEl) {
    targetMsgEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    targetMsgEl.classList.add('highlighted-msg');
    setTimeout(() => targetMsgEl.classList.remove('highlighted-msg'), 1500);
  } else {
    alert('Закрепленное сообщение не найдено.');
  }
});

unpinBtn.addEventListener('click', async (e) => {
  e.stopPropagation();
  if (!activeTargetID || !currentAuthCID) return;
  const type = pinnedBar.dataset.pinnedType;
  if (type === 'both') {
    if (activeTargetType === 'group') {
      await groupsRef.child(activeTargetID).child('pinned').remove();
    } else {
      const chatKey = getChatKey(currentAuthCID, activeTargetID);
      await chatsRef.child(chatKey).child('pinned').remove();
    }
  } else if (type === 'self') {
    const localKey = activeTargetType === 'group'
      ? `coum_pinned_${activeTargetID}`
      : `coum_pinned_${getChatKey(currentAuthCID, activeTargetID)}`;
    localStorage.removeItem(localKey);
    updatePinnedBarUI(null);
  }
});

/* ==================== СООБЩЕНИЯ ==================== */

function renderMessages(messagesData) {
  messagesContainer.innerHTML = '';
  if (!activeTargetID || !currentAuthCID) return;
  const list = Object.entries(messagesData).map(([id, msg]) => ({ id, ...msg }));
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
    const authorUser = cloudUsers[msg.senderCid] || {};
    const authorName = isSelf ? 'Я' : (msg.senderName || authorUser.name || msg.senderCid);
    const timeFormatted = formatMessageTime(isoDate);
    const senderAvatarUrl = authorUser.avatarUrl || '';
    const avatarStyle = senderAvatarUrl ? `background-image: url('${senderAvatarUrl}');` : '';

    let contentHTML = '';
    if (msg.text) contentHTML += `<span class="msg-text">${escapeHTML(msg.text)}</span>`;
    if (msg.imageUrl) {
      contentHTML += `<div class="msg-image-wrap"><img src="${msg.imageUrl}" class="msg-image" alt="фото" /></div>`;
    }
    if (msg.isEdited) contentHTML += `<span class="msg-edited-tag">(изм.)</span>`;

    let reactionsHTML = '';
    if (msg.reactions && Object.keys(msg.reactions).length > 0) {
      const reactionCounts = {};
      Object.entries(msg.reactions).forEach(([cid, emoji]) => {
        reactionCounts[emoji] = (reactionCounts[emoji] || 0) + 1;
      });
      reactionsHTML = '<div class="msg-reactions-bar">';
      for (const [emoji, count] of Object.entries(reactionCounts)) {
        const isMyReaction = msg.reactions[currentAuthCID] === emoji;
        reactionsHTML += `<div class="reaction-badge ${isMyReaction ? 'my-active' : ''}" data-emoji="${emoji}"><span>${emoji}</span> <span>${count}</span></div>`;
      }
      reactionsHTML += '</div>';
    }

    row.innerHTML = `
      <div class="msg-avatar-col" style="${avatarStyle}"></div>
      <div class="msg-body-col">
        <div class="msg-meta-line">
          <span class="msg-time">${timeFormatted}</span>
          <span class="msg-author">${escapeHTML(authorName)}</span>
        </div>
        ${contentHTML}
        ${reactionsHTML}
      </div>
    `;

    const imgEl = row.querySelector('.msg-image');
    if (imgEl) imgEl.onclick = () => openImageViewer(msg.imageUrl);

    row.querySelectorAll('.reaction-badge').forEach(badge => {
      badge.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleReaction(msg.id, badge.dataset.emoji, msg.reactions);
      });
    });

    row.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      openContextMenu(e.clientX, e.clientY, msg);
    });

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

/* ==================== КОНТЕКСТНОЕ МЕНЮ ==================== */

function openContextMenu(x, y, msg) {
  targetContextMessage = msg;
  msgContextMenu.classList.remove('hidden');
  const menuWidth = 210, menuHeight = 260;
  let posX = x, posY = y;
  if (posX + menuWidth > window.innerWidth) posX = window.innerWidth - menuWidth - 10;
  if (posY + menuHeight > window.innerHeight) posY = window.innerHeight - menuHeight - 10;
  msgContextMenu.style.left = `${Math.max(10, posX)}px`;
  msgContextMenu.style.top = `${Math.max(10, posY)}px`;
  const isMine = msg.senderCid === currentAuthCID;
  const isText = !!msg.text;
  ctxEditBtn.style.display = (isMine && isText) ? 'block' : 'none';
  ctxCopyBtn.style.display = isText ? 'block' : 'none';
}

function closeContextMenu() {
  msgContextMenu.classList.add('hidden');
  targetContextMessage = null;
}

window.addEventListener('click', (e) => {
  if (!msgContextMenu.contains(e.target)) closeContextMenu();
});

ctxCopyBtn.addEventListener('click', () => {
  if (!targetContextMessage || !targetContextMessage.text) return;
  navigator.clipboard.writeText(targetContextMessage.text);
  const oldText = ctxCopyBtn.textContent;
  ctxCopyBtn.textContent = 'СКОПИРОВАНО';
  setTimeout(() => { ctxCopyBtn.textContent = oldText; closeContextMenu(); }, 900);
});

reactionEmojiButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    if (!targetContextMessage) return;
    toggleReaction(targetContextMessage.id, btn.dataset.emoji, targetContextMessage.reactions);
    closeContextMenu();
  });
});

async function toggleReaction(msgId, emoji, existingReactions = {}) {
  if (!activeTargetID || !currentAuthCID) return;
  const targetRef = activeTargetType === 'group'
    ? groupsRef.child(activeTargetID).child('messages').child(msgId).child('reactions').child(currentAuthCID)
    : chatsRef.child(getChatKey(currentAuthCID, activeTargetID)).child('messages').child(msgId).child('reactions').child(currentAuthCID);
  if (existingReactions && existingReactions[currentAuthCID] === emoji) {
    await targetRef.remove();
  } else {
    await targetRef.set(emoji);
  }
}

ctxDeleteBtn.addEventListener('click', async () => {
  if (!targetContextMessage || !activeTargetID || !currentAuthCID) return;
  if (activeTargetType === 'group') {
    await groupsRef.child(activeTargetID).child('messages').child(targetContextMessage.id).remove();
  } else {
    const chatKey = getChatKey(currentAuthCID, activeTargetID);
    await chatsRef.child(chatKey).child('messages').child(targetContextMessage.id).remove();
  }
  closeContextMenu();
});

ctxPinBothBtn.addEventListener('click', async () => {
  if (!targetContextMessage || !activeTargetID || !currentAuthCID) return;
  const textToPin = targetContextMessage.text || '[Изображение]';
  if (activeTargetType === 'group') {
    await groupsRef.child(activeTargetID).child('pinned').set({ id: targetContextMessage.id, text: textToPin });
  } else {
    const chatKey = getChatKey(currentAuthCID, activeTargetID);
    await chatsRef.child(chatKey).child('pinned').set({ id: targetContextMessage.id, text: textToPin });
  }
  closeContextMenu();
});

ctxPinSelfBtn.addEventListener('click', () => {
  if (!targetContextMessage || !activeTargetID || !currentAuthCID) return;
  const textToPin = targetContextMessage.text || '[Изображение]';
  const localKey = activeTargetType === 'group'
    ? `coum_pinned_${activeTargetID}`
    : `coum_pinned_${getChatKey(currentAuthCID, activeTargetID)}`;
  localStorage.setItem(localKey, JSON.stringify({ id: targetContextMessage.id, text: textToPin }));
  updatePinnedBarUI(null);
  closeContextMenu();
});

ctxEditBtn.addEventListener('click', () => {
  if (!targetContextMessage) return;
  editingMessageId = targetContextMessage.id;
  messageInput.value = targetContextMessage.text || '';
  editStateBar.classList.remove('hidden');
  messageInput.focus();
  closeContextMenu();
});

cancelEditBtn.addEventListener('click', () => cancelEditingMessage());

function cancelEditingMessage() {
  editingMessageId = null;
  editStateBar.classList.add('hidden');
  messageInput.value = '';
}

/* ==================== ОТПРАВКА ==================== */

async function sendMessage(text = '', imageBase64 = null) {
  if (!activeTargetID || !currentAuthCID) return;
  if (!text && !imageBase64) return;
  const myName = cloudUsers[currentAuthCID]?.name || currentAuthCID;

  if (activeTargetType === 'group') {
    const groupRef = groupsRef.child(activeTargetID);
    if (editingMessageId) {
      if (text) await groupRef.child('messages').child(editingMessageId).update({ text: text.trim(), isEdited: true });
      cancelEditingMessage();
      return;
    }
    const newMsgRef = groupRef.child('messages').push();
    const msgPayload = {
      id: newMsgRef.key,
      senderCid: currentAuthCID,
      senderName: myName,
      timestamp: firebase.database.ServerValue.TIMESTAMP
    };
    if (text) msgPayload.text = text.trim();
    if (imageBase64) msgPayload.imageUrl = imageBase64;
    await newMsgRef.set(msgPayload);
  } else {
    const chatKey = getChatKey(currentAuthCID, activeTargetID);
    const peerName = cloudUsers[activeTargetID]?.name || activeTargetID;
    if (editingMessageId) {
      if (text) await chatsRef.child(chatKey).child('messages').child(editingMessageId).update({ text: text.trim(), isEdited: true });
      cancelEditingMessage();
      return;
    }
    const metaSnap = await chatsRef.child(chatKey).child('meta').once('value');
    let meta = metaSnap.val();
    if (!meta) {
      meta = { status: 'pending', initiatorCid: currentAuthCID };
      await chatsRef.child(chatKey).child('meta').set(meta);
      await userChatsRef.child(currentAuthCID).child(activeTargetID).set({
        peerUsername: peerName, status: 'pending', isInitiator: true
      });
      await userChatsRef.child(activeTargetID).child(currentAuthCID).set({
        peerUsername: myName, status: 'pending', isInitiator: false
      });
    } else if (meta.status === 'pending') {
      if (meta.initiatorCid === currentAuthCID) {
        alert('Вы уже отправили стартовое сообщение. Дождитесь подтверждения.');
        return;
      }
    }
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
}

messageForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = messageInput.value.trim();
  if (!text) return;
  sendMessage(text, null);
  if (!editingMessageId) messageInput.value = '';
});

/* ==================== ЗВОНКИ ==================== */

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
let audioCtx = null;
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
  } catch (e) {}
}

function stopRingTone() {
  if (ringInterval) { clearInterval(ringInterval); ringInterval = null; }
  if (audioCtx) { try { audioCtx.close(); } catch(e){} audioCtx = null; }
}

const rtcConfig = {
  iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }]
};

function initCallSignalingListener() {
  if (!currentAuthCID) return;
  callsRef.child(currentAuthCID).on('value', async (snapshot) => {
    const callData = snapshot.val();
    if (!callData) {
      if (activeCallTargetCID && !isCallInitiator) cleanupCall();
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

startGroupCallBtn.addEventListener('click', () => startGroupCall());

startCallBtn.addEventListener('click', async () => {
  if (!activeTargetID || !currentAuthCID || activeTargetType === 'group') return;
  if (activeTargetID === currentAuthCID) return;
  const chatKey = getChatKey(currentAuthCID, activeTargetID);
  const metaSnap = await chatsRef.child(chatKey).child('meta').once('value');
  const meta = metaSnap.val();
  if (meta && meta.status === 'pending') {
    alert('Звонки недоступны до подтверждения диалога.');
    return;
  }
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  } catch (err) {
    alert('Не удалось получить доступ к микрофону!');
    return;
  }
  isCallInitiator = true;
  activeCallTargetCID = activeTargetID;
  const targetName = cloudUsers[activeTargetID]?.name || activeTargetID;
  activeCallPeerName.textContent = `${targetName} (${activeTargetID})`;
  callStatusLabel.textContent = 'ВЫЗОВ...';
  callTimerLabel.textContent = '00:00';
  activeCallModal.classList.remove('hidden');
  playRingTone('dialing');

  peerConnection = new RTCPeerConnection(rtcConfig);
  localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
  peerConnection.ontrack = (event) => { remoteAudio.srcObject = event.streams[0]; };
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      callsRef.child(activeCallTargetCID).child('callerCandidates').push(JSON.stringify(event.candidate));
    }
  };

  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  const myName = cloudUsers[currentAuthCID]?.name || currentAuthCID;
  await callsRef.child(activeCallTargetCID).set({
    callerCID: currentAuthCID, callerName: myName, offer: JSON.stringify(offer), status: 'ringing'
  });

  const myCallRef = callsRef.child(activeCallTargetCID);
  myCallRef.on('value', async (snap) => {
    const data = snap.val();
    if (!data) { cleanupCall(); return; }
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
      try { await peerConnection.addIceCandidate(new RTCIceCandidate(JSON.parse(candidateData))); } catch (e) {}
    }
  });
});

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
  if (!callData || !callData.offer) { cleanupCall(); return; }
  isCallInitiator = false;
  activeCallTargetCID = callData.callerCID;
  const targetName = cloudUsers[activeCallTargetCID]?.name || activeCallTargetCID;
  activeCallPeerName.textContent = `${targetName} (${activeCallTargetCID})`;
  callStatusLabel.textContent = 'СОЕДИНЕНИЕ...';
  activeCallModal.classList.remove('hidden');

  peerConnection = new RTCPeerConnection(rtcConfig);
  localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
  peerConnection.ontrack = (event) => { remoteAudio.srcObject = event.streams[0]; };
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      callsRef.child(currentAuthCID).child('calleeCandidates').push(JSON.stringify(event.candidate));
    }
  };

  const offer = JSON.parse(callData.offer);
  await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);
  await callsRef.child(currentAuthCID).update({ answer: JSON.stringify(answer), status: 'connected' });
  startCallTimer();

  callsRef.child(currentAuthCID).child('callerCandidates').on('child_added', async (cSnap) => {
    const candidateData = cSnap.val();
    if (candidateData && peerConnection) {
      try { await peerConnection.addIceCandidate(new RTCIceCandidate(JSON.parse(candidateData))); } catch (e) {}
    }
  });
});

rejectCallBtn.addEventListener('click', () => rejectIncomingCall());

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
  if (peerConnection) { peerConnection.close(); peerConnection = null; }
  if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
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
  if (callTimerInterval) { clearInterval(callTimerInterval); callTimerInterval = null; }
  callDurationSeconds = 0;
}

toggleMuteBtn.addEventListener('click', () => {
  if (!localStream) return;
  isMuted = !isMuted;
  localStream.getAudioTracks().forEach(track => track.enabled = !isMuted);
  toggleMuteBtn.textContent = isMuted ? 'МИКРОФОН: ВЫКЛ' : 'МИКРОФОН: ВКЛ';
});

/* ==================== РЕДАКТОР ИЗОБРАЖЕНИЙ ==================== */

const imageEditorModal = document.getElementById('image-editor-modal');
const editorCanvas = document.getElementById('editor-canvas');
const editorCtx = editorCanvas.getContext('2d');
const editorViewport = document.getElementById('editor-viewport');
const editorContainer = document.getElementById('editor-canvas-container');
const editorZoomIndicator = document.getElementById('editor-zoom-indicator');

const cropOverlay = document.getElementById('crop-overlay');
const cropSelectionBox = document.getElementById('crop-selection-box');
const cropShadeTop = cropOverlay.querySelector('.crop-shade-top');
const cropShadeBottom = cropOverlay.querySelector('.crop-shade-bottom');
const cropShadeLeft = cropOverlay.querySelector('.crop-shade-left');
const cropShadeRight = cropOverlay.querySelector('.crop-shade-right');
const cropHandles = cropOverlay.querySelectorAll('.crop-handle');

const toolBrushBtn = document.getElementById('tool-brush');
const toolHighlighterBtn = document.getElementById('tool-highlighter');
const toolEraserBtn = document.getElementById('tool-eraser');
const toolTextBtn = document.getElementById('tool-text');
const toolCropBtn = document.getElementById('tool-crop');

const editorUndoBtn = document.getElementById('editor-undo-btn');
const editorResetZoomBtn = document.getElementById('editor-reset-zoom-btn');
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

// Зум/панорама редактора
let edScale = 1;      // текущий масштаб отображения канваса
let edBaseScale = 1;  // минимальный (вписывающий)
let edOffsetX = 0;
let edOffsetY = 0;
const MAX_ZOOM_FACTOR = 12;

// Рисование
let isDrawing = false;
let lastX = 0;
let lastY = 0;

// Кадрирование — рамка хранится в координатах канваса (пикселях картинки)
let crop = { x: 0, y: 0, w: 0, h: 0 };
let cropMode = null; // 'move' | 'resize-nw' | ... | 'new'
let cropStartPointer = { x: 0, y: 0 };
let cropStartRect = { x: 0, y: 0, w: 0, h: 0 };

// Пинч
let pinchActive = false;
let pinchStartDist = 0;
let pinchStartScale = 1;
let pinchMidX = 0, pinchMidY = 0;
let pinchStartOffsetX = 0, pinchStartOffsetY = 0;

// Панорамирование (когда зум > 1, режим рисования)
let panActive = false;
let panStartX = 0, panStartY = 0;
let panStartOffsetX = 0, panStartOffsetY = 0;

/* --- Работа с координатами --- */

function applyViewportTransform() {
  editorCanvas.style.transform = `translate(${edOffsetX}px, ${edOffsetY}px) scale(${edScale})`;
  const percent = Math.round((edScale / edBaseScale) * 100);
  editorZoomIndicator.textContent = `${percent}%`;
}

function showZoomIndicator() {
  editorZoomIndicator.classList.add('visible');
  clearTimeout(showZoomIndicator._t);
  showZoomIndicator._t = setTimeout(() => {
    editorZoomIndicator.classList.remove('visible');
  }, 900);
}

function computeBaseScale() {
  const cw = editorContainer.clientWidth;
  const ch = editorContainer.clientHeight;
  if (cw <= 0 || ch <= 0) return;
  // Вписываем картинку с небольшим padding
  const padding = 24;
  const availW = cw - padding;
  const availH = ch - padding;
  const sx = availW / editorCanvas.width;
  const sy = availH / editorCanvas.height;
  // Берём меньший из двух, чтобы картинка полностью влезла; но не меньше 1.0 для мелких, чтобы апскейлить
  edBaseScale = Math.min(sx, sy);
  if (edBaseScale <= 0 || !isFinite(edBaseScale)) edBaseScale = 1;
  edScale = edBaseScale;
  edOffsetX = 0;
  edOffsetY = 0;
  applyViewportTransform();
}

// Координаты экрана (относительно canvas-container) -> координаты картинки на canvas
function screenToCanvasCoords(clientX, clientY) {
  const contRect = editorContainer.getBoundingClientRect();
  const pointerX = clientX - contRect.left;
  const pointerY = clientY - contRect.top;
  // Центр контейнера
  const cx = contRect.width / 2 + edOffsetX;
  const cy = contRect.height / 2 + edOffsetY;
  // Позиция относительно центра, с учётом масштаба
  const xOnCanvas = (pointerX - cx) / edScale + editorCanvas.width / 2;
  const yOnCanvas = (pointerY - cy) / edScale + editorCanvas.height / 2;
  return { x: xOnCanvas, y: yOnCanvas };
}

// Координаты картинки на canvas -> координаты экрана (относительно контейнера)
function canvasToScreenCoords(cx, cy) {
  const contRect = editorContainer.getBoundingClientRect();
  const centerX = contRect.width / 2 + edOffsetX;
  const centerY = contRect.height / 2 + edOffsetY;
  const px = (cx - editorCanvas.width / 2) * edScale + centerX;
  const py = (cy - editorCanvas.height / 2) * edScale + centerY;
  return { x: px, y: py };
}

function clampView() {
  // Не даём полностью уехать за экран при зуме
  if (edScale <= edBaseScale * 1.001) {
    edOffsetX = 0;
    edOffsetY = 0;
    edScale = edBaseScale;
    return;
  }
  const contRect = editorContainer.getBoundingClientRect();
  const scaledW = editorCanvas.width * edScale;
  const scaledH = editorCanvas.height * edScale;
  const maxOffsetX = Math.max(0, (scaledW - contRect.width) / 2);
  const maxOffsetY = Math.max(0, (scaledH - contRect.height) / 2);
  edOffsetX = Math.max(-maxOffsetX, Math.min(maxOffsetX, edOffsetX));
  edOffsetY = Math.max(-maxOffsetY, Math.min(maxOffsetY, edOffsetY));
}

function zoomAt(clientX, clientY, factor) {
  const oldScale = edScale;
  const newScale = Math.max(edBaseScale, Math.min(edBaseScale * MAX_ZOOM_FACTOR, edScale * factor));
  if (Math.abs(newScale - oldScale) < 0.0001) return;

  const contRect = editorContainer.getBoundingClientRect();
  const pointerX = clientX - contRect.left;
  const pointerY = clientY - contRect.top;
  const centerX = contRect.width / 2;
  const centerY = contRect.height / 2;

  // Смещение точки под курсором: сохраняем позицию относительно центра
  const relX = (pointerX - centerX - edOffsetX) / oldScale;
  const relY = (pointerY - centerY - edOffsetY) / oldScale;

  edScale = newScale;
  edOffsetX = pointerX - centerX - relX * newScale;
  edOffsetY = pointerY - centerY - relY * newScale;

  clampView();
  applyViewportTransform();
  showZoomIndicator();
}

/* --- Undo --- */

function pushUndoState() {
  if (undoStack.length >= MAX_UNDO) undoStack.shift();
  undoStack.push(editorCanvas.toDataURL('image/png'));
}

/* --- Открытие редактора --- */

function openEditorWithImage(srcBase64) {
  rawOriginalImageBase64 = srcBase64;
  undoStack = [];
  setEditorTool('brush');
  hideCropOverlay();
  editorFinishCropBtn.classList.add('hidden');

  const img = new Image();
  img.onload = () => {
    let w = img.width, h = img.height;
    // Не даём пиксельному фото пропасть — при загрузке НЕ уменьшаем больше 1600, чтобы сохранить качество
    const maxDimension = 1600;
    if (w > maxDimension || h > maxDimension) {
      if (w > h) { h = Math.round((h * maxDimension) / w); w = maxDimension; }
      else { w = Math.round((w * maxDimension) / h); h = maxDimension; }
    }
    editorCanvas.width = w;
    editorCanvas.height = h;
    editorCtx.clearRect(0, 0, w, h);
    editorCtx.imageSmoothingEnabled = true;
    editorCtx.imageSmoothingQuality = 'high';
    editorCtx.drawImage(img, 0, 0, w, h);
    pushUndoState();
    imageEditorModal.classList.remove('hidden');
    // Ждём отрисовку layout
    requestAnimationFrame(() => {
      requestAnimationFrame(() => computeBaseScale());
    });
  };
  img.src = srcBase64;
}

/* --- Инструменты --- */

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
    showCropOverlay();
    initCropRect();
    editorCanvas.classList.add('tool-crop');
  } else {
    editorFinishCropBtn.classList.add('hidden');
    hideCropOverlay();
    editorCanvas.classList.remove('tool-crop');
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
  editorCtx.textAlign = 'center';
  editorCtx.fillText(userText.trim(), editorCanvas.width / 2, editorCanvas.height - 40);
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

brushSizeInput.addEventListener('input', (e) => { brushSize = parseInt(e.target.value, 10); });

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
    computeBaseScale();
  };
  img.src = prevState;
});

editorResetZoomBtn.addEventListener('click', () => {
  computeBaseScale();
  showZoomIndicator();
});

editorCancelBtn.addEventListener('click', () => {
  imageEditorModal.classList.add('hidden');
  rawOriginalImageBase64 = null;
  hideCropOverlay();
});

/* --- Рисование (мышь + тач) --- */

function getCanvasCoordsFromEvent(e) {
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  return screenToCanvasCoords(clientX, clientY);
}

function startDraw(e) {
  if (currentTool === 'crop') return; // crop обрабатывается отдельно

  // Если 2 пальца — это пинч, не рисуем
  if (e.touches && e.touches.length === 2) return;

  // Если зум больше базового и мы не хотим случайно рисовать при панорамировании —
  // но обычно рисуем. Панорамирование делаем по средней кнопке мыши / двумя пальцами.
  const coords = getCanvasCoordsFromEvent(e);
  isDrawing = true;
  lastX = coords.x;
  lastY = coords.y;
  pushUndoState();
}

function moveDraw(e) {
  if (currentTool === 'crop') return;

  if (e.touches && e.touches.length === 2) {
    // Пинч — отменяем рисование
    isDrawing = false;
    return;
  }

  if (!isDrawing) return;
  if (e.cancelable) e.preventDefault();

  const coords = getCanvasCoordsFromEvent(e);
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

function stopDraw() { isDrawing = false; }

editorCanvas.addEventListener('mousedown', (e) => {
  if (e.button === 1) { startPan(e); return; }
  if (currentTool === 'crop') return;
  startDraw(e);
});
window.addEventListener('mousemove', (e) => {
  if (panActive) { movePan(e); return; }
  moveDraw(e);
});
window.addEventListener('mouseup', () => {
  stopPan();
  stopDraw();
});

editorCanvas.addEventListener('touchstart', (e) => {
  if (e.touches.length === 2) {
    e.preventDefault();
    startPinch(e);
    return;
  }
  if (currentTool === 'crop') return;
  // Один палец — рисование
  startDraw(e);
}, { passive: false });

editorCanvas.addEventListener('touchmove', (e) => {
  if (e.touches.length === 2) {
    e.preventDefault();
    movePinch(e);
    return;
  }
  if (currentTool === 'crop') return;
  moveDraw(e);
}, { passive: false });

editorCanvas.addEventListener('touchend', (e) => {
  if (e.touches.length === 0) {
    stopPinch();
    stopDraw();
  }
});

editorCanvas.addEventListener('touchcancel', () => {
  stopPinch();
  stopDraw();
});

/* --- Пинч --- */

function getTouchDist(touches) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

function getTouchMid(touches) {
  return {
    x: (touches[0].clientX + touches[1].clientX) / 2,
    y: (touches[0].clientY + touches[1].clientY) / 2
  };
}

function startPinch(e) {
  pinchActive = true;
  isDrawing = false;
  pinchStartDist = getTouchDist(e.touches);
  pinchStartScale = edScale;
  const mid = getTouchMid(e.touches);
  pinchMidX = mid.x;
  pinchMidY = mid.y;
  pinchStartOffsetX = edOffsetX;
  pinchStartOffsetY = edOffsetY;
}

function movePinch(e) {
  if (!pinchActive) return;
  const dist = getTouchDist(e.touches);
  if (pinchStartDist <= 0) return;
  const factor = dist / pinchStartDist;
  let newScale = pinchStartScale * factor;
  newScale = Math.max(edBaseScale, Math.min(edBaseScale * MAX_ZOOM_FACTOR, newScale));

  const contRect = editorContainer.getBoundingClientRect();
  const mid = getTouchMid(e.touches);
  const pointerX = mid.x - contRect.left;
  const pointerY = mid.y - contRect.top;
  const centerX = contRect.width / 2;
  const centerY = contRect.height / 2;

  // Точка под начальным мид-поинтом
  const relX = (pinchMidX - contRect.left - centerX - pinchStartOffsetX) / pinchStartScale;
  const relY = (pinchMidY - contRect.top - centerY - pinchStartOffsetY) / pinchStartScale;

  edScale = newScale;
  edOffsetX = pointerX - centerX - relX * newScale;
  edOffsetY = pointerY - centerY - relY * newScale;

  clampView();
  applyViewportTransform();
  showZoomIndicator();
}

function stopPinch() {
  pinchActive = false;
}

/* --- Панорамирование (средняя кнопка мыши) --- */

function startPan(e) {
  panActive = true;
  panStartX = e.clientX;
  panStartY = e.clientY;
  panStartOffsetX = edOffsetX;
  panStartOffsetY = edOffsetY;
}

function movePan(e) {
  if (!panActive) return;
  edOffsetX = panStartOffsetX + (e.clientX - panStartX);
  edOffsetY = panStartOffsetY + (e.clientY - panStartY);
  clampView();
  applyViewportTransform();
}

function stopPan() { panActive = false; }

/* --- Зум колёсиком --- */

editorContainer.addEventListener('wheel', (e) => {
  e.preventDefault();
  const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
  zoomAt(e.clientX, e.clientY, factor);
}, { passive: false });

/* --- Кадрирование --- */

function showCropOverlay() {
  cropOverlay.classList.remove('hidden');
  cropOverlay.classList.add('active');
}

function hideCropOverlay() {
  cropOverlay.classList.add('hidden');
  cropOverlay.classList.remove('active');
}

function initCropRect() {
  // Ставим рамку почти на всю картинку
  const w = editorCanvas.width;
  const h = editorCanvas.height;
  const padX = w * 0.1;
  const padY = h * 0.1;
  crop.x = padX;
  crop.y = padY;
  crop.w = w - padX * 2;
  crop.h = h - padY * 2;
  updateCropUI();
}

function updateCropUI() {
  // crop в координатах canvas -> преобразуем в экранные
  const topLeft = canvasToScreenCoords(crop.x, crop.y);
  const bottomRight = canvasToScreenCoords(crop.x + crop.w, crop.y + crop.h);
  const left = topLeft.x;
  const top = topLeft.y;
  const right = bottomRight.x;
  const bottom = bottomRight.y;
  const w = right - left;
  const h = bottom - top;

  cropSelectionBox.style.left = `${left}px`;
  cropSelectionBox.style.top = `${top}px`;
  cropSelectionBox.style.width = `${w}px`;
  cropSelectionBox.style.height = `${h}px`;

  const contRect = editorContainer.getBoundingClientRect();
  cropShadeTop.style.height = `${Math.max(0, top)}px`;
  cropShadeBottom.style.height = `${Math.max(0, contRect.height - bottom)}px`;
  cropShadeLeft.style.top = `${Math.max(0, top)}px`;
  cropShadeLeft.style.height = `${Math.max(0, h)}px`;
  cropShadeLeft.style.width = `${Math.max(0, left)}px`;
  cropShadeRight.style.top = `${Math.max(0, top)}px`;
  cropShadeRight.style.height = `${Math.max(0, h)}px`;
  cropShadeRight.style.width = `${Math.max(0, contRect.width - right)}px`;
}

// Обработка взаимодействия с рамкой crop
function onCropPointerDown(e, mode, dir) {
  e.preventDefault();
  e.stopPropagation();
  cropMode = mode;
  cropHandleDir = dir || null;
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  cropStartPointer = { x: clientX, y: clientY };
  cropStartRect = { ...crop };
  if (mode === 'new') {
    const coords = screenToCanvasCoords(clientX, clientY);
    cropStartRect = { x: coords.x, y: coords.y, w: 0, h: 0 };
    crop = { ...cropStartRect };
  }

  window.addEventListener('mousemove', onCropPointerMove);
  window.addEventListener('mouseup', onCropPointerUp);
  window.addEventListener('touchmove', onCropPointerMove, { passive: false });
  window.addEventListener('touchend', onCropPointerUp);
  window.addEventListener('touchcancel', onCropPointerUp);
}

function onCropPointerMove(e) {
  if (!cropMode) return;
  if (e.cancelable) e.preventDefault();

  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;

  const startCanvas = screenToCanvasCoords(cropStartPointer.x, cropStartPointer.y);
  const currentCanvas = screenToCanvasCoords(clientX, clientY);
  const dx = currentCanvas.x - startCanvas.x;
  const dy = currentCanvas.y - startCanvas.y;

  let r = { ...cropStartRect };

  if (cropMode === 'move') {
    r.x += dx;
    r.y += dy;
  } else if (cropMode === 'new') {
    const x1 = cropStartRect.x;
    const y1 = cropStartRect.y;
    const x2 = x1 + dx;
    const y2 = y1 + dy;
    r.x = Math.min(x1, x2);
    r.y = Math.min(y1, y2);
    r.w = Math.abs(x2 - x1);
    r.h = Math.abs(y2 - y1);
  } else if (cropMode === 'resize' && cropHandleDir) {
    const dir = cropHandleDir;
    let x1 = r.x;
    let y1 = r.y;
    let x2 = r.x + r.w;
    let y2 = r.y + r.h;

    if (dir.includes('w')) x1 += dx;
    if (dir.includes('e')) x2 += dx;
    if (dir.includes('n')) y1 += dy;
    if (dir.includes('s')) y2 += dy;

    // Не даём "перевернуться"
    const minSize = 20;
    if (x2 - x1 < minSize) {
      if (dir.includes('w')) x1 = x2 - minSize;
      else x2 = x1 + minSize;
    }
    if (y2 - y1 < minSize) {
      if (dir.includes('n')) y1 = y2 - minSize;
      else y2 = y1 + minSize;
    }

    r.x = x1;
    r.y = y1;
    r.w = x2 - x1;
    r.h = y2 - y1;
  }

  // Ограничиваем границами canvas
  if (r.x < 0) { r.w += r.x; r.x = 0; }
  if (r.y < 0) { r.h += r.y; r.y = 0; }
  if (r.x + r.w > editorCanvas.width) r.w = editorCanvas.width - r.x;
  if (r.y + r.h > editorCanvas.height) r.h = editorCanvas.height - r.y;
  if (r.w < 10) r.w = 10;
  if (r.h < 10) r.h = 10;

  crop = r;
  updateCropUI();
}

function onCropPointerUp() {
  cropMode = null;
  cropHandleDir = null;
  window.removeEventListener('mousemove', onCropPointerMove);
  window.removeEventListener('mouseup', onCropPointerUp);
  window.removeEventListener('touchmove', onCropPointerMove);
  window.removeEventListener('touchend', onCropPointerUp);
  window.removeEventListener('touchcancel', onCropPointerUp);
}

// Слушатели на самой рамке
cropSelectionBox.addEventListener('mousedown', (e) => {
  onCropPointerDown(e, 'move');
});
cropSelectionBox.addEventListener('touchstart', (e) => {
  if (e.touches.length === 1) onCropPointerDown(e, 'move');
}, { passive: false });

cropHandles.forEach(handle => {
  handle.addEventListener('mousedown', (e) => {
    onCropPointerDown(e, 'resize', handle.dataset.handle);
  });
  handle.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) onCropPointerDown(e, 'resize', handle.dataset.handle);
  }, { passive: false });
});

// Рисование новой рамки по пустой области
cropOverlay.addEventListener('mousedown', (e) => {
  if (e.target === cropOverlay || e.target.classList.contains('crop-shade')) {
    onCropPointerDown(e, 'new');
  }
});
cropOverlay.addEventListener('touchstart', (e) => {
  if (e.touches.length !== 1) return;
  if (e.target === cropOverlay || e.target.classList.contains('crop-shade')) {
    onCropPointerDown(e, 'new');
  }
}, { passive: false });

// Пересчёт позиции рамки при зуме/панораме
const origApplyViewportTransform = applyViewportTransform;
applyViewportTransform = function() {
  origApplyViewportTransform();
  if (currentTool === 'crop') updateCropUI();
};

editorFinishCropBtn.addEventListener('click', () => {
  const x = Math.round(crop.x);
  const y = Math.round(crop.y);
  const w = Math.round(crop.w);
  const h = Math.round(crop.h);
  if (w < 10 || h < 10) { alert('Слишком маленькая область'); return; }
  pushUndoState();
  const croppedData = editorCtx.getImageData(x, y, w, h);
  editorCanvas.width = w;
  editorCanvas.height = h;
  editorCtx.putImageData(croppedData, 0, 0);
  hideCropOverlay();
  setEditorTool('brush');
  requestAnimationFrame(() => {
    requestAnimationFrame(() => computeBaseScale());
  });
});

/* --- Отправка --- */

editorQuickSendBtn.addEventListener('click', () => {
  if (rawOriginalImageBase64) sendMessage('', rawOriginalImageBase64);
  imageEditorModal.classList.add('hidden');
  rawOriginalImageBase64 = null;
});

editorSendBtn.addEventListener('click', () => {
  const resultWebP = editorCanvas.toDataURL('image/webp', 0.85);
  sendMessage('', resultWebP);
  imageEditorModal.classList.add('hidden');
  rawOriginalImageBase64 = null;
});

/* --- Реагирование на ресайз окна --- */

window.addEventListener('resize', () => {
  if (imageEditorModal.classList.contains('hidden')) return;
  if (!editorCanvas.width || !editorCanvas.height) return;
  const oldBase = edBaseScale;
  const oldScale = edScale;
  // Пересчитываем базу и пропорционально масштаб
  const cw = editorContainer.clientWidth;
  const ch = editorContainer.clientHeight;
  const padding = 24;
  const availW = cw - padding;
  const availH = ch - padding;
  const sx = availW / editorCanvas.width;
  const sy = availH / editorCanvas.height;
  edBaseScale = Math.min(sx, sy) || 1;
  if (oldBase > 0 && oldScale > 0) {
    edScale = (oldScale / oldBase) * edBaseScale;
  } else {
    edScale = edBaseScale;
  }
  if (edScale < edBaseScale) edScale = edBaseScale;
  clampView();
  applyViewportTransform();
  if (currentTool === 'crop') updateCropUI();
});

/* ==================== ПРОСМОТРЩИК ==================== */

const viewerStage = document.getElementById('viewer-stage');
const viewerZoomIndicator = document.getElementById('viewer-zoom-indicator');

let viewerScale = 1;
let viewerBaseScale = 1;
let viewerOffsetX = 0;
let viewerOffsetY = 0;
let viewerPanActive = false;
let viewerPanStartX = 0, viewerPanStartY = 0;
let viewerPanStartOffsetX = 0, viewerPanStartOffsetY = 0;
let viewerPinchActive = false;
let viewerPinchStartDist = 0;
let viewerPinchStartScale = 1;
let viewerPinchMidX = 0, viewerPinchMidY = 0;
let viewerPinchStartOffsetX = 0, viewerPinchStartOffsetY = 0;

function applyViewerTransform() {
  viewerImg.style.transform = `translate(${viewerOffsetX}px, ${viewerOffsetY}px) scale(${viewerScale})`;
  const percent = Math.round((viewerScale / viewerBaseScale) * 100);
  viewerZoomIndicator.textContent = `${percent}%`;
}

function showViewerIndicator() {
  viewerZoomIndicator.classList.add('visible');
  clearTimeout(showViewerIndicator._t);
  showViewerIndicator._t = setTimeout(() => {
    viewerZoomIndicator.classList.remove('visible');
  }, 900);
}

function computeViewerBase() {
  const cw = viewerStage.clientWidth;
  const ch = viewerStage.clientHeight;
  if (cw <= 0 || ch <= 0) return;
  const padding = 32;
  const availW = cw - padding;
  const availH = ch - padding;
  const naturalW = viewerImg.naturalWidth || 1;
  const naturalH = viewerImg.naturalHeight || 1;
  const sx = availW / naturalW;
  const sy = availH / naturalH;
  viewerBaseScale = Math.min(sx, sy);
  // Мелкие — растягиваем до разумного минимума, чтобы было видно
  if (viewerBaseScale < 0.05) viewerBaseScale = 0.05;
  viewerScale = viewerBaseScale;
  viewerOffsetX = 0;
  viewerOffsetY = 0;
  applyViewerTransform();
}

function clampViewer() {
  if (viewerScale <= viewerBaseScale * 1.001) {
    viewerOffsetX = 0;
    viewerOffsetY = 0;
    viewerScale = viewerBaseScale;
    return;
  }
  const cw = viewerStage.clientWidth;
  const ch = viewerStage.clientHeight;
  const naturalW = viewerImg.naturalWidth || 1;
  const naturalH = viewerImg.naturalHeight || 1;
  const scaledW = naturalW * viewerScale;
  const scaledH = naturalH * viewerScale;
  const maxOffsetX = Math.max(0, (scaledW - cw) / 2);
  const maxOffsetY = Math.max(0, (scaledH - ch) / 2);
  viewerOffsetX = Math.max(-maxOffsetX, Math.min(maxOffsetX, viewerOffsetX));
  viewerOffsetY = Math.max(-maxOffsetY, Math.min(maxOffsetY, viewerOffsetY));
}

function viewerZoomAt(clientX, clientY, factor) {
  const oldScale = viewerScale;
  const newScale = Math.max(viewerBaseScale, Math.min(viewerBaseScale * MAX_ZOOM_FACTOR, viewerScale * factor));
  if (Math.abs(newScale - oldScale) < 0.0001) return;
  const stageRect = viewerStage.getBoundingClientRect();
  const px = clientX - stageRect.left;
  const py = clientY - stageRect.top;
  const cx = stageRect.width / 2;
  const cy = stageRect.height / 2;
  const relX = (px - cx - viewerOffsetX) / oldScale;
  const relY = (py - cy - viewerOffsetY) / oldScale;
  viewerScale = newScale;
  viewerOffsetX = px - cx - relX * newScale;
  viewerOffsetY = py - cy - relY * newScale;
  clampViewer();
  applyViewerTransform();
  showViewerIndicator();
}

function openImageViewer(src) {
  viewerImg.src = src;
  imageViewerModal.classList.remove('hidden');
  viewerScale = 1;
  viewerOffsetX = 0;
  viewerOffsetY = 0;
  // Ждём загрузку картинки
  const onLoad = () => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => computeViewerBase());
    });
  };
  if (viewerImg.complete && viewerImg.naturalWidth) onLoad();
  else viewerImg.addEventListener('load', onLoad, { once: true });
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

// Мышь: зум колёсиком + панорамирование зажатой кнопкой
viewerStage.addEventListener('wheel', (e) => {
  e.preventDefault();
  const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
  viewerZoomAt(e.clientX, e.clientY, factor);
}, { passive: false });

viewerStage.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  viewerPanActive = true;
  viewerPanStartX = e.clientX;
  viewerPanStartY = e.clientY;
  viewerPanStartOffsetX = viewerOffsetX;
  viewerPanStartOffsetY = viewerOffsetY;
});
window.addEventListener('mousemove', (e) => {
  if (!viewerPanActive) return;
  viewerOffsetX = viewerPanStartOffsetX + (e.clientX - viewerPanStartX);
  viewerOffsetY = viewerPanStartOffsetY + (e.clientY - viewerPanStartY);
  clampViewer();
  applyViewerTransform();
});
window.addEventListener('mouseup', () => { viewerPanActive = false; });

// Двойной клик — зум в точку
viewerStage.addEventListener('dblclick', (e) => {
  e.preventDefault();
  const targetScale = viewerScale > viewerBaseScale * 1.5
    ? viewerBaseScale
    : viewerBaseScale * 3;
  const factor = targetScale / viewerScale;
  viewerZoomAt(e.clientX, e.clientY, factor);
});

// Тач: 2 пальца — пинч, 1 палец — панорамирование
function viewerTouchDist(touches) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.sqrt(dx * dx + dy * dy);
}
function viewerTouchMid(touches) {
  return {
    x: (touches[0].clientX + touches[1].clientX) / 2,
    y: (touches[0].clientY + touches[1].clientY) / 2
  };
}

viewerStage.addEventListener('touchstart', (e) => {
  if (e.touches.length === 2) {
    e.preventDefault();
    viewerPinchActive = true;
    viewerPanActive = false;
    viewerPinchStartDist = viewerTouchDist(e.touches);
    viewerPinchStartScale = viewerScale;
    const mid = viewerTouchMid(e.touches);
    viewerPinchMidX = mid.x;
    viewerPinchMidY = mid.y;
    viewerPinchStartOffsetX = viewerOffsetX;
    viewerPinchStartOffsetY = viewerOffsetY;
  } else if (e.touches.length === 1) {
    viewerPanActive = true;
    viewerPanStartX = e.touches[0].clientX;
    viewerPanStartY = e.touches[0].clientY;
    viewerPanStartOffsetX = viewerOffsetX;
    viewerPanStartOffsetY = viewerOffsetY;
  }
}, { passive: false });

viewerStage.addEventListener('touchmove', (e) => {
  if (e.touches.length === 2 && viewerPinchActive) {
    e.preventDefault();
    const dist = viewerTouchDist(e.touches);
    if (viewerPinchStartDist <= 0) return;
    const factor = dist / viewerPinchStartDist;
    let newScale = viewerPinchStartScale * factor;
    newScale = Math.max(viewerBaseScale, Math.min(viewerBaseScale * MAX_ZOOM_FACTOR, newScale));

    const stageRect = viewerStage.getBoundingClientRect();
    const mid = viewerTouchMid(e.touches);
    const px = mid.x - stageRect.left;
    const py = mid.y - stageRect.top;
    const cx = stageRect.width / 2;
    const cy = stageRect.height / 2;
    const relX = (viewerPinchMidX - stageRect.left - cx - viewerPinchStartOffsetX) / viewerPinchStartScale;
    const relY = (viewerPinchMidY - stageRect.top - cy - viewerPinchStartOffsetY) / viewerPinchStartScale;
    viewerScale = newScale;
    viewerOffsetX = px - cx - relX * newScale;
    viewerOffsetY = py - cy - relY * newScale;
    clampViewer();
    applyViewerTransform();
    showViewerIndicator();
  } else if (e.touches.length === 1 && viewerPanActive) {
    e.preventDefault();
    viewerOffsetX = viewerPanStartOffsetX + (e.touches[0].clientX - viewerPanStartX);
    viewerOffsetY = viewerPanStartOffsetY + (e.touches[0].clientY - viewerPanStartY);
    clampViewer();
    applyViewerTransform();
  }
}, { passive: false });

viewerStage.addEventListener('touchend', (e) => {
  if (e.touches.length === 0) {
    viewerPinchActive = false;
    viewerPanActive = false;
  } else if (e.touches.length === 1) {
    // Отпустили один палец — переходим к панорамированию оставшимся
    viewerPinchActive = false;
    viewerPanActive = true;
    viewerPanStartX = e.touches[0].clientX;
    viewerPanStartY = e.touches[0].clientY;
    viewerPanStartOffsetX = viewerOffsetX;
    viewerPanStartOffsetY = viewerOffsetY;
  }
}, { passive: false });

viewerStage.addEventListener('touchcancel', () => {
  viewerPinchActive = false;
  viewerPanActive = false;
});

/* ==================== ЗАГРУЗКА ФОТО ==================== */

function processInputImage(file) {
  const reader = new FileReader();
  reader.onload = (e) => openEditorWithImage(e.target.result);
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
  if (!currentAuthCID || !activeTargetID) return;
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

/* ==================== АВАТАРКА ==================== */

uploadAvatarBtn.addEventListener('click', () => avatarFileInput.click());

avatarFileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const maxBytes = 2 * 1024 * 1024;
  if (file.size > maxBytes) { alert('Файл слишком большой! До 2 МБ.'); return; }
  const reader = new FileReader();
  reader.onload = async (event) => {
    await usersRef.child(currentAuthCID).update({ avatarUrl: event.target.result });
    renderProfile();
    renderSidebar();
  };
  reader.readAsDataURL(file);
  avatarFileInput.value = '';
});

clearAvatarBtn.addEventListener('click', async () => {
  if (!currentAuthCID) return;
  await usersRef.child(currentAuthCID).child('avatarUrl').remove();
  renderProfile();
  renderSidebar();
});

/* ==================== ПАРОЛЬ ==================== */

savePasswordBtn.addEventListener('click', async () => {
  const p1 = setPassInput1.value;
  const p2 = setPassInput2.value;
  if (!p1 || p1.length < 3) { alert('Пароль минимум 3 символа!'); return; }
  if (p1 !== p2) { alert('Пароли не совпадают!'); return; }
  await usersRef.child(currentAuthCID).update({ accountPass: p1, failedAttempts: 0 });
  setPassInput1.value = '';
  setPassInput2.value = '';
  alert('Пароль установлен!');
  renderProfile();
});

removePasswordBtn.addEventListener('click', async () => {
  if (!confirm('Снять защиту паролем?')) return;
  await usersRef.child(currentAuthCID).child('accountPass').remove();
  await usersRef.child(currentAuthCID).child('failedAttempts').remove();
  alert('Пароль удален.');
  renderProfile();
});

autoDeleteCheckbox.addEventListener('change', (e) => {
  if (e.target.checked) {
    openSelfDestructWarningModal();
  } else {
    if (currentAuthCID) usersRef.child(currentAuthCID).update({ selfDestructEnabled: false });
  }
});

function openSelfDestructWarningModal() {
  selfDestructWarnModal.classList.remove('hidden');
  confirmSelfDestructBtn.disabled = true;
  let remainingSeconds = 9;
  confirmSelfDestructBtn.textContent = `ПОДОЖДИТЕ (${remainingSeconds})...`;
  if (warnTimerInterval) clearInterval(warnTimerInterval);
  warnTimerInterval = setInterval(() => {
    remainingSeconds--;
    if (remainingSeconds > 0) {
      confirmSelfDestructBtn.textContent = `ПОДОЖДИТЕ (${remainingSeconds})...`;
    } else {
      clearInterval(warnTimerInterval);
      warnTimerInterval = null;
      confirmSelfDestructBtn.disabled = false;
      confirmSelfDestructBtn.textContent = 'ДА, Я УВЕРЕН';
    }
  }, 1000);
}

confirmSelfDestructBtn.addEventListener('click', async () => {
  selfDestructWarnModal.classList.add('hidden');
  const attempts = parseInt(autoDeleteAttemptsInput.value, 10) || 3;
  await usersRef.child(currentAuthCID).update({
    selfDestructEnabled: true, maxFailedAttempts: attempts, failedAttempts: 0
  });
  autoDeleteCheckbox.checked = true;
  alert('Самоуничтожение активировано!');
});

cancelSelfDestructBtn.addEventListener('click', () => {
  if (warnTimerInterval) { clearInterval(warnTimerInterval); warnTimerInterval = null; }
  selfDestructWarnModal.classList.add('hidden');
  autoDeleteCheckbox.checked = false;
});

saveAutoDeleteConfigBtn.addEventListener('click', async () => {
  const attempts = parseInt(autoDeleteAttemptsInput.value, 10);
  if (!attempts || attempts < 1 || attempts > 10) { alert('От 1 до 10.'); return; }
  await usersRef.child(currentAuthCID).update({ maxFailedAttempts: attempts });
  alert('Число попыток обновлено!');
});

async function executeSelfDestruction(cid) {
  let cidDbKey = null;
  for (const [key, val] of Object.entries(cloudCidsKeys)) {
    if (val === cid) { cidDbKey = key; break; }
  }
  if (cidDbKey) await cidsRef.child(cidDbKey).remove();
  await usersRef.child(cid).remove();
  await userChatsRef.child(cid).remove();
  localStorage.clear();
  authCidRow.classList.remove('hidden');
  authPassRow.classList.add('hidden');
  authHint.classList.add('hidden');
  authInput.value = '';
  authPassInput.value = '';
  pendingLoginCID = null;
  alert('Аккаунт и переписки полностью уничтожены.');
  location.reload();
}

/* ==================== ТЕМЫ ==================== */

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
  const savedHideCid = localStorage.getItem('coum_hide_cid') === 'true';
  hideCidCheckbox.checked = savedHideCid;
}

hideCidCheckbox.addEventListener('change', async (e) => {
  const isHidden = e.target.checked;
  localStorage.setItem('coum_hide_cid', isHidden);
  if (currentAuthCID) {
    await usersRef.child(currentAuthCID).update({ hideCid: isHidden });
    renderProfile();
    renderSidebar();
  }
});

function applyScale(scaleVal) {
  document.documentElement.style.setProperty('--ui-scale', scaleVal);
  localStorage.setItem('coum_ui_scale', scaleVal);
  scaleButtons.forEach(b => b.classList.toggle('active', b.dataset.scale === scaleVal));
}

scaleButtons.forEach(btn => btn.addEventListener('click', () => applyScale(btn.dataset.scale)));

function applyTheme(themeName) {
  const curScale = localStorage.getItem('coum_ui_scale') || '1.0';
  document.documentElement.removeAttribute('style');
  document.documentElement.style.setProperty('--ui-scale', curScale);
  if (themeName === 'black') {
    document.body.removeAttribute('data-theme');
  } else {
    document.body.setAttribute('data-theme', themeName);
  }
  localStorage.setItem('coum_ui_theme', themeName);
  themeButtons.forEach(b => b.classList.toggle('active', b.dataset.theme === themeName));
}

themeButtons.forEach(btn => btn.addEventListener('click', () => applyTheme(btn.dataset.theme)));

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
  applyCustomTheme(customBgInput.value, customPanelInput.value, customTextInput.value, customAccentInput.value);
});

openSettingsBtn.addEventListener('click', () => settingsModal.classList.remove('hidden'));
settingsCloseBtn.addEventListener('click', () => settingsModal.classList.add('hidden'));

settingsLogoutBtn.addEventListener('click', () => {
  if (confirm('Выйти из аккаунта?')) {
    settingsModal.classList.add('hidden');
    performLogout();
  }
});

function performLogout() {
  detachCurrentChatListeners();
  if (currentAuthCID) userChatsRef.child(currentAuthCID).off();
  localStorage.removeItem('coum_active_cid');
  localStorage.removeItem('coum_last_target_id');
  localStorage.removeItem('coum_last_target_type');
  cleanupCall();
  currentAuthCID = null;
  activeTargetID = null;
  pendingLoginCID = null;
  myUserChats = {};
  appScreen.classList.remove('chat-opened');
  appScreen.classList.add('hidden');
  authScreen.classList.remove('hidden');
  authCidRow.classList.remove('hidden');
  authPassRow.classList.add('hidden');
  authHint.classList.add('hidden');
  authInput.value = '';
  authPassInput.value = '';
  authError.classList.add('hidden');
}

/* ==================== АДМИНКА ==================== */

let logoClickCount = 0;
let logoClickTimer = null;

authLogo.addEventListener('click', () => {
  logoClickCount++;
  clearTimeout(logoClickTimer);
  if (logoClickCount >= 5) { logoClickCount = 0; openAdminAuth(); return; }
  logoClickTimer = setTimeout(() => { logoClickCount = 0; }, 1500);
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
  setTimeout(() => adminPassInput.focus(), 80);
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

adminCloseBtn.addEventListener('click', () => adminPanel.classList.add('hidden'));

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
    setTimeout(() => { copyCidBtn.textContent = 'КОПИРОВАТЬ'; }, 1200);
  }
});

function renderAdminCIDList() {
  adminCidListEl.innerHTML = '';
  const entries = Object.entries(cloudCidsKeys);
  if (entries.length === 0) {
    adminCidListEl.innerHTML = '<span style="color:var(--text-muted);font-size:11px;">База пуста.</span>';
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
    delBtn.textContent = 'УДАЛИТЬ';
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
  setTimeout(() => deletePhraseInput.focus(), 80);
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

/* ==================== ВХОД ==================== */

async function attemptCidLogin(inputCID) {
  const cleanCID = inputCID.trim();
  if (!cleanCID) return;
  const snapshot = await cidsRef.once('value');
  const list = snapshot.val() ? Object.values(snapshot.val()) : [];
  if (list.includes(cleanCID)) {
    authError.classList.add('hidden');
    const userSnap = await usersRef.child(cleanCID).once('value');
    if (!userSnap.exists()) {
      let initialName = prompt('Введите ваше имя:');
      if (!initialName || !initialName.trim()) initialName = cleanCID.slice(0, 8);
      await usersRef.child(cleanCID).set({ name: initialName.trim(), hideCid: false });
      completeLoginSuccess(cleanCID);
    } else {
      const userData = userSnap.val() || {};
      if (userData.accountPass) {
        pendingLoginCID = cleanCID;
        authCidRow.classList.add('hidden');
        authPassRow.classList.remove('hidden');
        authHint.classList.remove('hidden');
        authPassInput.value = '';
        authPassInput.focus();
      } else {
        completeLoginSuccess(cleanCID);
      }
    }
  } else {
    authError.textContent = 'Неверный CID';
    authError.classList.remove('hidden');
  }
}

async function attemptPassLogin(inputPass) {
  if (!pendingLoginCID) return;
  const userSnap = await usersRef.child(pendingLoginCID).once('value');
  const userData = userSnap.val() || {};
  if (userData.accountPass === inputPass) {
    authError.classList.add('hidden');
    await usersRef.child(pendingLoginCID).update({ failedAttempts: 0 });
    completeLoginSuccess(pendingLoginCID);
  } else {
    const isSelfDestruct = !!userData.selfDestructEnabled;
    const maxAttempts = userData.maxFailedAttempts || 3;
    const currentFailed = (userData.failedAttempts || 0) + 1;
    await usersRef.child(pendingLoginCID).update({ failedAttempts: currentFailed });
    if (isSelfDestruct && currentFailed >= maxAttempts) {
      await executeSelfDestruction(pendingLoginCID);
      return;
    }
    authError.textContent = isSelfDestruct
      ? `Неверный пароль! Осталось попыток: ${maxAttempts - currentFailed}`
      : 'Неверный пароль!';
    authError.classList.remove('hidden');
    authPassInput.value = '';
    authPassInput.focus();
  }
}

function completeLoginSuccess(cleanCID) {
  currentAuthCID = cleanCID;
  localStorage.setItem('coum_active_cid', cleanCID);
  pendingLoginCID = null;
  authCidRow.classList.remove('hidden');
  authPassRow.classList.add('hidden');
  authHint.classList.add('hidden');
  authInput.value = '';
  authPassInput.value = '';
  enterApp();
}

authInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') attemptCidLogin(authInput.value);
  else authError.classList.add('hidden');
});
authSubmitCidBtn.addEventListener('click', () => attemptCidLogin(authInput.value));

authPassInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') attemptPassLogin(authPassInput.value);
  else authError.classList.add('hidden');
});
authSubmitPassBtn.addEventListener('click', () => attemptPassLogin(authPassInput.value));

function enterApp() {
  authScreen.classList.add('hidden');
  appScreen.classList.remove('hidden');
  renderProfile();
  initCallSignalingListener();
  attachUserChatsListener();
  const savedType = localStorage.getItem('coum_last_target_type') || 'direct';
  activeTargetType = savedType;
  if (activeTargetID) attachActiveChatListeners();
  else updateTopBarInfo();
  renderSidebar();
}

mobileBackBtn.addEventListener('click', () => appScreen.classList.remove('chat-opened'));

function renderProfile() {
  if (!currentAuthCID) return;
  const userObj = cloudUsers[currentAuthCID] || {};
  const myName = userObj.name || currentAuthCID;
  const isHidden = userObj.hideCid || localStorage.getItem('coum_hide_cid') === 'true';
  myDisplayNameEl.textContent = myName;
  myFixedCidEl.textContent = isHidden ? 'CID: [СКРЫТ]' : currentAuthCID;
  hideCidCheckbox.checked = !!isHidden;
  if (userObj.avatarUrl) {
    myMiniAvatarEl.style.backgroundImage = `url('${userObj.avatarUrl}')`;
    settingsAvatarPreview.style.backgroundImage = `url('${userObj.avatarUrl}')`;
  } else {
    myMiniAvatarEl.style.backgroundImage = 'none';
    settingsAvatarPreview.style.backgroundImage = 'none';
  }
  if (userObj.accountPass) {
    passwordStatusIndicator.textContent = 'УСТАНОВЛЕН';
    passwordStatusIndicator.style.color = '#22c55e';
    removePasswordBtn.classList.remove('hidden');
  } else {
    passwordStatusIndicator.textContent = 'НЕ УСТАНОВЛЕН';
    passwordStatusIndicator.style.color = '#ef4444';
    removePasswordBtn.classList.add('hidden');
  }
  autoDeleteCheckbox.checked = !!userObj.selfDestructEnabled;
  autoDeleteAttemptsInput.value = userObj.maxFailedAttempts || 3;
}

myFixedCidEl.addEventListener('click', () => {
  if (!currentAuthCID) return;
  navigator.clipboard.writeText(currentAuthCID);
  const oldText = myFixedCidEl.textContent;
  myFixedCidEl.textContent = 'СКОПИРОВАНО!';
  setTimeout(() => { myFixedCidEl.textContent = oldText; }, 1200);
});

editNameBtn.addEventListener('click', () => {
  const currentName = cloudUsers[currentAuthCID]?.name || '';
  const newName = prompt('Новое имя:', currentName);
  if (newName && newName.trim()) usersRef.child(currentAuthCID).update({ name: newName.trim() });
});

/* ==================== KEYBOARD / UI ==================== */

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeContextMenu();
    plusDropdownMenu.classList.add('hidden');
    sidebarPlusBtn.classList.remove('active');
    if (!createGroupModal.classList.contains('hidden')) createGroupModal.classList.add('hidden');
    if (!groupManageModal.classList.contains('hidden')) groupManageModal.classList.add('hidden');
    if (!groupInviteModal.classList.contains('hidden')) groupInviteModal.classList.add('hidden');
    if (!selfDestructWarnModal.classList.contains('hidden')) {
      if (warnTimerInterval) clearInterval(warnTimerInterval);
      selfDestructWarnModal.classList.add('hidden');
      autoDeleteCheckbox.checked = false;
    }
    if (!imageEditorModal.classList.contains('hidden')) imageEditorModal.classList.add('hidden');
    if (!imageViewerModal.classList.contains('hidden')) {
      imageViewerModal.classList.add('hidden');
      viewerImg.src = '';
    }
    if (!document.getElementById('group-call-modal').classList.contains('hidden')) {
      if (window.grpCallManager) window.grpCallManager.cleanup();
    }
    if (!document.getElementById('active-call-modal').classList.contains('hidden')) cleanupCall();
    if (!document.getElementById('incoming-call-modal').classList.contains('hidden')) rejectIncomingCall();
  }
});

messageInput.addEventListener('focus', () => {
  setTimeout(() => { messagesContainer.scrollTop = messagesContainer.scrollHeight; }, 300);
});

/* ==================== ГРУППОВОЙ ЗВОНОК ==================== */

const GRP_RTC_CONFIG = {
  iceServers: [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
    { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
  ]
};

class GroupCallManager {
  constructor(chatId, participants) {
    this.chatId = chatId;
    this.participants = participants;
    this.myCid = currentAuthCID;
    this.peerConnections = new Map();
    this.localStream = null;
    this.isMuted = false;
    this.audioLevelInterval = null;
    this.callStartTime = null;
    this.callTimerInterval = null;
    this.signalingRef = callsRef.child(chatId).child('mesh');
    this.mySignalRef = this.signalingRef.child(this.myCid);
    this.cleanupDone = false;
  }

  async start() {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      this.setupAudioLevelMonitoring();
      this.createPeerConnections();
      this.setupSignalingListeners();
      await this.createAndSendOffers();
      this.startCallTimer();
      this.showGroupCallModal();
    } catch (err) {
      alert('Не удалось начать групповой звонок: ' + err.message);
      this.cleanup();
    }
  }

  createPeerConnections() {
    this.participants.forEach(p => {
      if (p.cid === this.myCid) return;
      const pc = new RTCPeerConnection(GRP_RTC_CONFIG);
      this.localStream.getTracks().forEach(track => pc.addTrack(track, this.localStream));
      pc.ontrack = (event) => this.handleRemoteTrack(p.cid, event.streams[0]);
      pc.onicecandidate = (event) => {
        if (event.candidate) this.mySignalRef.child('candidates').child(p.cid).push(JSON.stringify(event.candidate));
      };
      pc.onconnectionstatechange = () => {
        this.updatePeerConnectionState(p.cid, pc.connectionState);
        if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          setTimeout(() => pc.restartIce(), 2000);
        }
      };
      this.peerConnections.set(p.cid, pc);
    });
  }

  async createAndSendOffers() {
    for (const [cid, pc] of this.peerConnections) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await this.mySignalRef.child('offers').child(cid).set(JSON.stringify(offer));
    }
  }

  setupSignalingListeners() {
    this.signalingRef.on('child_added', (snap) => {
      const senderCid = snap.key;
      if (senderCid === this.myCid) return;
      this.handleSignalingData(senderCid, snap.val());
    });
    this.signalingRef.on('child_changed', (snap) => {
      const senderCid = snap.key;
      if (senderCid === this.myCid) return;
      this.handleSignalingData(senderCid, snap.val());
    });
  }

  async handleSignalingData(senderCid, data) {
    const pc = this.peerConnections.get(senderCid);
    if (!pc) return;
    if (data.offers && data.offers[this.myCid]) {
      const offer = JSON.parse(data.offers[this.myCid]);
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await this.mySignalRef.child('answers').child(senderCid).set(JSON.stringify(answer));
    }
    if (data.answers && data.answers[this.myCid]) {
      const answer = JSON.parse(data.answers[this.myCid]);
      if (pc.signalingState === 'have-local-offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
      }
    }
    if (data.candidates && data.candidates[this.myCid]) {
      const candidates = data.candidates[this.myCid];
      Object.values(candidates).forEach(async (candStr) => {
        try { await pc.addIceCandidate(new RTCIceCandidate(JSON.parse(candStr))); } catch (e) {}
      });
    }
  }

  handleRemoteTrack(peerCid, stream) {
    const audioEl = document.getElementById(`grp-audio-${peerCid}`);
    if (audioEl) audioEl.srcObject = stream;
  }

  setupAudioLevelMonitoring() {
    const audioCtx = new AudioContext();
    const source = audioCtx.createMediaStreamSource(this.localStream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    this.audioLevelInterval = setInterval(() => {
      analyser.getByteFrequencyData(dataArray);
      const sum = dataArray.reduce((a, b) => a + b, 0);
      const level = Math.min(100, Math.round((sum / dataArray.length) * 2));
      const el = document.getElementById('grp-my-level');
      if (el) el.style.width = `${level}%`;
    }, 100);
  }

  updatePeerConnectionState(cid, state) {
    const statusEl = document.getElementById(`grp-status-${cid}`);
    if (statusEl) {
      statusEl.textContent = state === 'connected' ? 'Подключен' : state === 'connecting' ? 'Соединение...' : 'Отключен';
      statusEl.style.color = state === 'connected' ? '#22c55e' : state === 'connecting' ? '#fbbf24' : '#ef4444';
    }
  }

  startCallTimer() {
    this.callStartTime = Date.now();
    this.callTimerInterval = setInterval(() => {
      const diff = Date.now() - this.callStartTime;
      const mins = String(Math.floor(diff / 60000)).padStart(2, '0');
      const secs = String(Math.floor((diff % 60000) / 1000)).padStart(2, '0');
      const timerEl = document.getElementById('grp-call-timer');
      if (timerEl) timerEl.textContent = `${mins}:${secs}`;
    }, 1000);
  }

  showGroupCallModal() {
    const modal = document.getElementById('group-call-modal');
    const container = document.getElementById('grp-participants-container');
    container.innerHTML = '';
    this.participants.forEach(p => {
      const isSelf = p.cid === this.myCid;
      const div = document.createElement('div');
      div.className = `grp-participant ${isSelf ? 'self' : ''}`;
      div.innerHTML = `
        <div class="grp-avatar" style="${p.avatarUrl ? `background-image:url('${p.avatarUrl}')` : ''}"></div>
        <div class="grp-info">
          <div class="grp-name">${escapeHTML(p.name)}${isSelf ? ' (Я)' : ''}</div>
          <div class="grp-status" id="grp-status-${p.cid}" style="color:${isSelf ? '#22c55e' : '#fbbf24'}">${isSelf ? 'Подключен' : 'Соединение...'}</div>
          <div class="grp-level-bar"><div class="grp-level-fill" id="${isSelf ? 'grp-my-level' : `grp-level-${p.cid}`}"></div></div>
        </div>
        <audio id="grp-audio-${p.cid}" autoplay playsinline ${isSelf ? 'muted' : ''}></audio>
        ${isSelf ? `<button class="grp-mute-btn" id="grp-mute-btn" onclick="window.grpCallManager.toggleMute()">МИКРОФОН: ВКЛ</button>` : ''}
      `;
      container.appendChild(div);
    });
    document.getElementById('grp-end-call-btn').onclick = () => this.cleanup();
    modal.onclick = (e) => { if (e.target === modal) this.cleanup(); };
    modal.classList.remove('hidden');
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    this.localStream.getAudioTracks().forEach(t => t.enabled = !this.isMuted);
    const btn = document.getElementById('grp-mute-btn');
    if (btn) btn.textContent = this.isMuted ? 'МИКРОФОН: ВЫКЛ' : 'МИКРОФОН: ВКЛ';
  }

  cleanup() {
    if (this.cleanupDone) return;
    this.cleanupDone = true;
    if (this.audioLevelInterval) clearInterval(this.audioLevelInterval);
    if (this.callTimerInterval) clearInterval(this.callTimerInterval);
    this.peerConnections.forEach(pc => pc.close());
    this.peerConnections.clear();
    if (this.localStream) {
      this.localStream.getTracks().forEach(t => t.stop());
      this.localStream = null;
    }
    if (this.signalingRef) this.signalingRef.off();
    if (this.mySignalRef) this.mySignalRef.remove();
    document.getElementById('group-call-modal').classList.add('hidden');
    window.grpCallManager = null;
  }
}

async function startGroupCall() {
  if (activeTargetType !== 'group' || !activeTargetID) return;
  const groupSnap = await groupsRef.child(activeTargetID).once('value');
  const group = groupSnap.val();
  if (!group || !group.members) return;
  const memberCids = Object.keys(group.members);
  if (memberCids.length < 2 || memberCids.length > 3) {
    alert('Групповой звонок работает только для 2-3 участников');
    return;
  }
  const participants = memberCids.map(cid => {
    const u = cloudUsers[cid] || {};
    return { cid, name: u.name || cid, avatarUrl: u.avatarUrl || '', isSelf: cid === currentAuthCID };
  });
  window.grpCallManager = new GroupCallManager(activeTargetID, participants);
  await window.grpCallManager.start();
}

/* ==================== ИНИЦИАЛИЗАЦИЯ ==================== */

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