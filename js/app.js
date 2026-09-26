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

const cidsRef = db.ref('allowed_cids');
const usersRef = db.ref('users');
const messagesRef = db.ref('messages');

let cloudCids = [];
let cloudUsers = {};
let cloudMessages = {};

let currentAuthCID = localStorage.getItem('coum_active_cid') || null;
let activePeerCID = localStorage.getItem('coum_last_peer') || null;

// ==================== REALTIME СЛУШАТЕЛИ ====================

cidsRef.on('value', (snapshot) => {
  const data = snapshot.val();
  cloudCids = data ? Object.values(data) : [];
  if (currentAuthCID) renderPeersList();
  if (!adminPanel.classList.contains('hidden')) renderAdminCIDList();
});

usersRef.on('value', (snapshot) => {
  cloudUsers = snapshot.val() || {};
  if (currentAuthCID) {
    renderProfile();
    renderPeersList();
    renderMessages();
  }
});

messagesRef.on('value', (snapshot) => {
  cloudMessages = snapshot.val() || {};
  if (currentAuthCID) {
    renderMessages();
  }
});

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

// ==================== DOM ====================

const authScreen = document.getElementById('auth-screen');
const authLogo = document.getElementById('auth-logo');
const appScreen = document.getElementById('app-screen');
const authInput = document.getElementById('auth-input');
const authError = document.getElementById('auth-error');

const myDisplayNameEl = document.getElementById('my-display-name');
const myFixedCidEl = document.getElementById('my-fixed-cid');
const editNameBtn = document.getElementById('edit-name-btn');
const peersListEl = document.getElementById('peers-list');
const activePeerHeaderEl = document.getElementById('active-peer-header');
const mobileBackBtn = document.getElementById('mobile-back-btn');
const messagesContainer = document.getElementById('messages-container');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');
const logoutBtn = document.getElementById('logout-btn');

const adminAuthModal = document.getElementById('admin-auth-modal');
const adminPassInput = document.getElementById('admin-pass-input');
const adminPanel = document.getElementById('admin-panel');
const adminCloseBtn = document.getElementById('admin-close-btn');
const generateCidBtn = document.getElementById('generate-cid-btn');
const copyCidBtn = document.getElementById('copy-cid-btn');
const lastGeneratedCidEl = document.getElementById('last-generated-cid');
const adminCidListEl = document.getElementById('admin-cid-list');

// ==================== СЕКРЕТНЫЙ ВХОД В АДМИНКУ ====================

let logoClickCount = 0;
let logoClickTimer = null;

// 5 быстрых тапов по логотипу
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

// Хоткей для ПК (Ctrl+Alt+9 или Ctrl+Alt+Numpad9)
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
  if (cloudCids.length === 0) {
    adminCidListEl.innerHTML = '<span style="color:#444;">База пуста. Нажмите кнопку выше.</span>';
    return;
  }

  cloudCids.forEach(cid => {
    const item = document.createElement('div');
    const namePart = cloudUsers[cid]?.name ? ` [${cloudUsers[cid].name}]` : '';
    item.textContent = `${cid}${namePart}`;
    adminCidListEl.appendChild(item);
  });
}

// ==================== ВХОД / ВЫХОД ====================

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
      usersRef.child(cleanCID).set({ name: initialName.trim() });
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

  const peers = cloudCids.filter(c => c !== currentAuthCID);
  if (!activePeerCID || !peers.includes(activePeerCID)) {
    activePeerCID = peers.length > 0 ? peers[0] : null;
  }

  renderPeersList();
  renderMessages();
}

logoutBtn.addEventListener('click', () => {
  localStorage.removeItem('coum_active_cid');
  localStorage.removeItem('coum_last_peer');
  currentAuthCID = null;
  activePeerCID = null;
  appScreen.classList.remove('chat-opened');
  appScreen.classList.add('hidden');
  authScreen.classList.remove('hidden');
  authInput.value = '';
  authError.classList.add('hidden');
});

// Стрелка «Назад» для мобилок
mobileBackBtn.addEventListener('click', () => {
  appScreen.classList.remove('chat-opened');
});

// ==================== РЕНДЕР И ЧАТ ====================

function renderProfile() {
  if (!currentAuthCID) return;
  const myName = cloudUsers[currentAuthCID]?.name || currentAuthCID;
  myDisplayNameEl.textContent = myName;
  myFixedCidEl.textContent = currentAuthCID;
}

editNameBtn.addEventListener('click', () => {
  const currentName = cloudUsers[currentAuthCID]?.name || '';
  const newName = prompt('Новое имя:', currentName);
  if (newName && newName.trim()) {
    usersRef.child(currentAuthCID).update({ name: newName.trim() });
  }
});

function renderPeersList() {
  peersListEl.innerHTML = '';
  const peers = cloudCids.filter(cid => cid !== currentAuthCID);

  if (peers.length === 0) {
    peersListEl.innerHTML = '<div style="padding:12px;color:#444;font-size:12px;">НЕТ ДРУГИХ CID</div>';
    activePeerHeaderEl.textContent = 'НЕТ СОБЕСЕДНИКА';
    return;
  }

  if (!activePeerCID || !peers.includes(activePeerCID)) {
    activePeerCID = peers[0];
  }

  peers.forEach(peerCID => {
    const btn = document.createElement('button');
    btn.className = `peer-btn ${peerCID === activePeerCID ? 'active' : ''}`;
    
    const displayName = cloudUsers[peerCID]?.name || peerCID;
    btn.innerHTML = `
      <span class="peer-btn-name">${escapeHTML(displayName)}</span>
      <span class="peer-btn-cid">${peerCID}</span>
    `;

    btn.onclick = () => {
      activePeerCID = peerCID;
      localStorage.setItem('coum_last_peer', peerCID);
      renderPeersList();
      renderMessages();
      appScreen.classList.add('chat-opened');
    };
    peersListEl.appendChild(btn);
  });

  const activeName = cloudUsers[activePeerCID]?.name || activePeerCID;
  activePeerHeaderEl.textContent = `${activeName} (${activePeerCID})`;
}

function renderMessages() {
  messagesContainer.innerHTML = '';
  if (!activePeerCID || !currentAuthCID) return;

  const chatKey = getChatKey(currentAuthCID, activePeerCID);
  const rawList = cloudMessages[chatKey] || {};
  const list = Object.values(rawList);

  list.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  list.forEach(msg => {
    const row = document.createElement('div');
    row.className = 'msg-row';
    const isSelf = msg.sender === currentAuthCID;
    const authorName = isSelf ? 'Я' : (cloudUsers[msg.sender]?.name || msg.sender);
    const time = msg.createdAt ? msg.createdAt.slice(11, 16) : '--:--';

    row.innerHTML = `
      <span class="msg-time">[${time}]</span>
      <span class="msg-author">${escapeHTML(authorName)}:</span>
      <span class="msg-text">${escapeHTML(msg.text)}</span>
    `;
    messagesContainer.appendChild(row);
  });

  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

messageForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = messageInput.value.trim();
  if (!text || !activePeerCID || !currentAuthCID) return;

  const chatKey = getChatKey(currentAuthCID, activePeerCID);

  const newMsg = {
    sender: currentAuthCID,
    text: text,
    createdAt: new Date().toISOString()
  };

  messagesRef.child(chatKey).push(newMsg);
  messageInput.value = '';
});

// Проверка сессии при запуске
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