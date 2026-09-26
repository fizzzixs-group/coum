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
const messagesRef = db.ref('messages');

let cloudCids = [];
let cloudCidsKeys = {};
let cloudUsers = {};
let cloudMessages = {};

let currentAuthCID = localStorage.getItem('coum_active_cid') || null;
let activePeerCID = localStorage.getItem('coum_last_peer') || null;

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

// ==================== REALTIME СЛУШАТЕЛИ ====================

cidsRef.on('value', (snapshot) => {
  const data = snapshot.val() || {};
  cloudCidsKeys = data;
  cloudCids = Object.values(data);

  if (currentAuthCID && !cloudCids.includes(currentAuthCID)) {
    performLogout();
    return;
  }

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
const activePeerHeaderEl = document.getElementById('active-peer-header');
const mobileBackBtn = document.getElementById('mobile-back-btn');
const messagesContainer = document.getElementById('messages-container');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');
const attachBtn = document.getElementById('attach-btn');
const imageFileInput = document.getElementById('image-file-input');

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

// ==================== ВСТРОЕННЫЙ РЕДАКТОР ИЗОБРАЖЕНИЙ ====================

const imageEditorModal = document.getElementById('image-editor-modal');
const editorCanvas = document.getElementById('editor-canvas');
const editorCtx = editorCanvas.getContext('2d');
const editorCanvasContainer = document.getElementById('editor-canvas-container');
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
let currentTool = 'brush'; // 'brush', 'highlighter', 'eraser', 'text', 'crop'
let currentColor = '#ffffff';
let brushSize = 6;
let undoStack = [];
const MAX_UNDO = 15;

let isDrawing = false;
let lastX = 0;
let lastY = 0;

// Кадрирование
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
    // Ограничиваем максимальное рабочее разрешение для быстродействия
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

// Добавление надписи
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
  
  // Рисуем по центру снизу
  const x = editorCanvas.width / 2;
  const y = editorCanvas.height - 40;
  editorCtx.textAlign = 'center';
  editorCtx.fillText(userText.trim(), x, y);
  editorCtx.shadowBlur = 0;
};

// Палитра
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

// Отмена шага
editorUndoBtn.addEventListener('click', () => {
  if (undoStack.length <= 1) return;
  undoStack.pop(); // Текущее состояние
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

// Быстрая отправка без изменений
editorQuickSendBtn.addEventListener('click', () => {
  if (rawOriginalImageBase64) {
    sendMessage('', rawOriginalImageBase64);
  }
  imageEditorModal.classList.add('hidden');
});

// Отправка отредактированного изображения (сжатие в легкий webp)
editorSendBtn.addEventListener('click', () => {
  const resultWebP = editorCanvas.toDataURL('image/webp', 0.8);
  sendMessage('', resultWebP);
  imageEditorModal.classList.add('hidden');
  rawOriginalImageBase64 = null;
});

// Координаты холста с учетом CSS масштабирования
function getCanvasCoords(e) {
  const rect = editorCanvas.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  
  const scaleX = editorCanvas.width / rect.width;
  const scaleY = editorCanvas.height / rect.height;

  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY,
    rawClientX: clientX,
    rawClientY: clientY
  };
}

// Рисование и кадрирование на холсте
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
    // В режиме ластика рисуем исходными пикселями или стираем в темный фон
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

// Логика кадрирования
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

// ==================== СЖАТИЕ КАРТИНОК И ПЕРЕДАЧА В РЕДАКТОР ====================

function processInputImage(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    openEditorWithImage(e.target.result);
  };
  reader.readAsDataURL(file);
}

// Кнопка скрепки
attachBtn.addEventListener('click', () => imageFileInput.click());

imageFileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  processInputImage(file);
  imageFileInput.value = '';
});

// Вставка скриншота из буфера обмена (Ctrl + V) -> сразу в редактор
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
  localStorage.removeItem('coum_active_cid');
  localStorage.removeItem('coum_last_peer');
  currentAuthCID = null;
  activePeerCID = null;
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
    peersListEl.innerHTML = '<div style="padding:12px;color:var(--text-muted);font-size:12px;">НЕТ ДРУГИХ CID</div>';
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

  let lastDayKey = null;

  list.forEach(msg => {
    const currentDayKey = getMessageDayKey(msg.createdAt);

    if (currentDayKey && currentDayKey !== lastDayKey) {
      lastDayKey = currentDayKey;
      const dateDiv = document.createElement('div');
      dateDiv.className = 'date-separator';
      dateDiv.innerHTML = `<span>${formatDateSeparator(msg.createdAt)}</span>`;
      messagesContainer.appendChild(dateDiv);
    }

    const row = document.createElement('div');
    row.className = 'msg-row';
    const isSelf = msg.sender === currentAuthCID;
    const authorName = isSelf ? 'Я' : (cloudUsers[msg.sender]?.name || msg.sender);
    const timeFormatted = formatMessageTime(msg.createdAt);

    let contentHTML = '';
    if (msg.text) {
      contentHTML += `<span class="msg-text">${escapeHTML(msg.text)}</span>`;
    }

    if (msg.image) {
      contentHTML += `
        <div class="msg-image-wrap">
          <img src="${msg.image}" class="msg-image" alt="фото" />
        </div>
      `;
    }

    row.innerHTML = `
      <span class="msg-time">[${timeFormatted}]</span>
      <span class="msg-author">${escapeHTML(authorName)}:</span>
      ${contentHTML}
    `;

    const imgEl = row.querySelector('.msg-image');
    if (imgEl) {
      imgEl.onclick = () => openImageViewer(msg.image);
    }

    messagesContainer.appendChild(row);
  });

  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// ==================== ОТПРАВКА СООБЩЕНИЙ ====================

function sendMessage(text = '', imageBase64 = null) {
  if (!activePeerCID || !currentAuthCID) return;
  if (!text && !imageBase64) return;

  const chatKey = getChatKey(currentAuthCID, activePeerCID);

  const newMsg = {
    sender: currentAuthCID,
    text: text.trim(),
    createdAt: new Date().toISOString()
  };

  if (imageBase64) {
    newMsg.image = imageBase64;
  }

  messagesRef.child(chatKey).push(newMsg);
}

messageForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = messageInput.value.trim();
  if (!text) return;
  sendMessage(text, null);
  messageInput.value = '';
});

// Просмотрщик картинок на весь экран
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

// Инициализация при старте
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