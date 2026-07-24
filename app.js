'use strict';
/* ============================================================
   SayatX — app.js
   Wires every screen in index.html to Firebase (Auth, Firestore,
   Storage, Messaging). Organised in the same order as the blueprint:
   Auth → Profile → Navigation → Home/Your Chats → Chat Conversation
   → Groups → Posts → Notifications → Settings → Report → Media
   Viewer → Push → Init.

   BEFORE RUNNING: paste your real Firebase project config into
   firebaseConfig below (Firebase console → Project settings →
   General → Your apps → SDK setup and configuration). For push
   notifications in the background (app closed/minimised) you'll
   also need a firebase-messaging-sw.js service worker file — not
   part of this file, ask for it whenever you're ready.
   ============================================================ */

/* ---------- FIREBASE INIT ---------- */
const firebaseConfig = {
  apiKey: "AIzaSyDidasKeBJ2KMqXHLCuP41JngvPGKIUp70",
  authDomain: "sayaya-b71c0.firebaseapp.com",
  projectId: "sayaya-b71c0",
  storageBucket: "sayaya-b71c0.firebasestorage.app",
  messagingSenderId: "526286690702",
  appId: "1:526286690702:web:3a2b8570ea5d8c10622cdf"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();
let messaging = null;
if (firebase.messaging && firebase.messaging.isSupported) {
  try { messaging = firebase.messaging(); } catch (e) { messaging = null; }
}

/* ---------- GLOBAL STATE ---------- */
const state = {
  user: null,
  profile: null,
  confirmationResult: null,
  currentChatId: null,
  currentChatUser: null,
  chatsUnsub: null,
  messagesUnsub: null,
  postsUnsub: null,
  notifUnsub: null,
  selectedMessageEl: null,
  isRecording: false,
  mediaRecorder: null,
  recordChunks: [],
  recordStart: 0,
  recordTimer: null,
  lockTargetChatId: null,
  pendingReportTarget: null,
  confirmCallback: null,
  typingTimeout: null,
  viewingOwnProfile: false,
  viewingProfileUid: null
};

/* ---------- DOM HELPER ---------- */
const $ = (id) => document.getElementById(id);

/* ---------- NAVIGATION UTILITIES ---------- */
function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  const target = $(id);
  if (target) target.classList.remove('hidden');
}
function hidePage(id) {
  const target = $(id);
  if (target) target.classList.add('hidden');
}
function goToAuthStep(id) {
  ['loginPage', 'otpPage', 'profileSetupPage'].forEach(p => $(p).classList.add('hidden'));
  if (id) $(id).classList.remove('hidden');
}
function showScreen(id) {
  document.querySelectorAll('#appShell .screen').forEach(s => s.classList.remove('active'));
  const target = $(id);
  if (target) target.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.screen === id));
  if (id === 'postsScreen') loadPostsFeed();
  if (id === 'homeScreen') loadHomeData();
}
function enterApp() {
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  $('splashScreen').classList.add('hidden');
  $('appShell').classList.remove('hidden');
  showScreen('homeScreen');
  setupPush();
}
function showModal(id) { $(id).classList.remove('hidden'); }
function hideModal(id) { $(id).classList.add('hidden'); }
function toggleDropdown(id, anchorEl) {
  const dd = $(id);
  const wasHidden = dd.classList.contains('hidden');
  document.querySelectorAll('.dropdown').forEach(d => d.classList.add('hidden'));
  if (wasHidden) {
    dd.classList.remove('hidden');
    const rect = anchorEl.getBoundingClientRect();
    const rootRect = $('appRoot').getBoundingClientRect();
    dd.style.top = (rect.bottom - rootRect.top + 6) + 'px';
    dd.style.right = Math.max(8, rootRect.right - rect.right) + 'px';
    dd.style.left = 'auto';
  }
}
function showConfirm(title, sub, onConfirm) {
  $('confirmTitle').textContent = title;
  $('confirmSub').textContent = sub;
  state.confirmCallback = onConfirm;
  showModal('confirmActionModal');
}
function showToast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  $('toastContainer').appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

/* ---------- FORMAT / MISC UTILITIES ---------- */
function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str ?? '';
  return d.innerHTML;
}
function formatTime(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
function formatDate(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return 'Today';
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
}
function formatFileSize(bytes) {
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}
async function uploadFile(fileOrBlob, pathPrefix) {
  const name = fileOrBlob.name || 'blob';
  const ref = storage.ref().child(`${pathPrefix}_${Date.now()}_${name}`);
  const snap = await ref.put(fileOrBlob);
  return snap.ref.getDownloadURL();
}
async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
function wireAvatarPreview(inputId) {
  const input = $(inputId);
  const label = document.querySelector(`label[for="${inputId}"]`);
  if (!input || !label) return;
  input.addEventListener('change', () => {
    const file = input.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    label.style.backgroundImage = `url(${url})`;
    label.style.backgroundSize = 'cover';
    label.style.backgroundPosition = 'center';
    const icon = label.querySelector(':scope > i');
    if (icon) icon.style.display = 'none';
  });
}

/* ============================================================
   AUTH — Login (phone/OTP) → Profile Setup → Home
   ============================================================ */
function setupRecaptcha() {
  window.recaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptcha-container', { size: 'invisible' });
}
function otpErrorMessage(err) {
  const map = {
    'auth/invalid-phone-number': 'That phone number looks invalid — check the digits and country code.',
    'auth/operation-not-allowed': "Phone sign-in isn't turned on for this Firebase project yet (Authentication → Sign-in method → Phone).",
    'auth/too-many-requests': 'Too many attempts from this number/device — wait a bit and try again.',
    'auth/captcha-check-failed': 'reCAPTCHA check failed — refresh the page and try again.',
    'auth/quota-exceeded': 'SMS quota exceeded for this Firebase project today.',
    'auth/invalid-app-credential': 'Firebase config looks wrong — check firebaseConfig at the top of app.js.',
    'auth/unauthorized-domain': "This domain isn't in Firebase's authorized domains list (Authentication → Settings → Authorized domains)."
  };
  return map[err.code] || `Could not send OTP (${err.code || err.message || 'unknown error'})`;
}
async function sendOtp() {
  // Strip everything except digits — E.164 phone numbers can't contain spaces,
  // and a space typed in the middle (e.g. "98765 43210") would otherwise be
  // sent straight to Firebase and rejected as an invalid number.
  const phone = $('phoneInput').value.replace(/\D/g, '');
  if (phone.length < 6) { showToast('Enter a valid phone number'); return; }
  const fullPhone = $('countryCode').textContent.trim() + phone;
  const btn = $('sendOtpBtn');
  btn.disabled = true; btn.textContent = 'Sending...';
  try {
    if (!window.recaptchaVerifier) setupRecaptcha();
    state.confirmationResult = await auth.signInWithPhoneNumber(fullPhone, window.recaptchaVerifier);
    $('otpPhoneDisplay').textContent = fullPhone;
    document.querySelectorAll('.otp-box').forEach(b => b.value = '');
    goToAuthStep('otpPage');
    document.querySelector('.otp-box').focus();
  } catch (err) {
    console.error(err);
    showToast(otpErrorMessage(err));
  } finally {
    btn.disabled = false; btn.textContent = 'Send OTP';
  }
}
function getOtpValue() {
  return Array.from(document.querySelectorAll('.otp-box')).map(b => b.value).join('');
}
function wireOtpBoxes() {
  const boxes = document.querySelectorAll('.otp-box');
  boxes.forEach((box, i) => {
    box.addEventListener('input', () => {
      box.value = box.value.replace(/[^0-9]/g, '').slice(0, 1);
      if (box.value && i < boxes.length - 1) boxes[i + 1].focus();
      if (getOtpValue().length === boxes.length) verifyOtp();
    });
    box.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !box.value && i > 0) boxes[i - 1].focus();
    });
  });
}
async function verifyOtp() {
  const code = getOtpValue();
  if (code.length !== 6) { showToast('Enter the 6-digit code'); return; }
  const btn = $('verifyOtpBtn');
  btn.disabled = true; btn.textContent = 'Verifying...';
  try {
    const result = await state.confirmationResult.confirm(code);
    state.user = result.user;
    const userDoc = await db.collection('users').doc(state.user.uid).get();
    if (userDoc.exists) {
      state.profile = userDoc.data();
      await db.collection('users').doc(state.user.uid).update({
        online: true, lastSeen: firebase.firestore.FieldValue.serverTimestamp()
      });
      enterApp();
    } else {
      goToAuthStep('profileSetupPage');
    }
  } catch (err) {
    console.error(err);
    showToast('Incorrect code. Try again.');
  } finally {
    btn.disabled = false; btn.textContent = 'Verify OTP';
  }
}

/* ---------- PROFILE SETUP ---------- */
async function generateUniqueUsername(name) {
  const base = (name.toLowerCase().trim().replace(/[^a-z0-9]/g, '').slice(0, 20)) || 'user';
  let candidate = base, n = 0;
  while (true) {
    const doc = await db.collection('usernames').doc(candidate).get();
    if (!doc.exists) return candidate;
    n += 1;
    candidate = `${base}_${n}`;
  }
}
async function completeProfileSetup() {
  const name = $('setupNameInput').value.trim();
  if (!name) { showToast('Enter your name'); return; }
  const btn = $('setupContinueBtn');
  btn.disabled = true; btn.textContent = 'Setting up...';
  try {
    const username = await generateUniqueUsername(name);
    let photoURL = '';
    const file = $('setupAvatarInput').files[0];
    if (file) photoURL = await uploadFile(file, `avatars/${state.user.uid}`);
    const profile = {
      uid: state.user.uid, name, username, photoURL, bio: '',
      phone: state.user.phoneNumber || '',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      lastUsernameChange: firebase.firestore.FieldValue.serverTimestamp(),
      lastSeen: firebase.firestore.FieldValue.serverTimestamp(),
      online: true
    };
    await db.collection('users').doc(state.user.uid).set(profile);
    await db.collection('usernames').doc(username).set({ uid: state.user.uid });
    state.profile = profile;
    enterApp();
  } catch (err) {
    console.error(err);
    showToast('Something went wrong. Try again.');
  } finally {
    btn.disabled = false; btn.textContent = 'Continue';
  }
}

/* ---------- EDIT PROFILE ---------- */
function populateEditProfile() {
  $('editNameInput').value = state.profile.name || '';
  $('editBioInput').value = state.profile.bio || '';
  $('editUsernameInput').value = state.profile.username || '';
}
async function saveProfile() {
  const name = $('editNameInput').value.trim();
  const bio = $('editBioInput').value.trim();
  const newUsername = $('editUsernameInput').value.trim().toLowerCase();
  if (!name) { showToast('Name cannot be empty'); return; }
  const updates = { name, bio };
  const btn = $('saveProfileBtn');
  btn.disabled = true;
  try {
    if (newUsername && newUsername !== state.profile.username) {
      const last = state.profile.lastUsernameChange && state.profile.lastUsernameChange.toDate
        ? state.profile.lastUsernameChange.toDate() : new Date(0);
      const daysSince = (Date.now() - last.getTime()) / 86400000;
      if (daysSince < 30) {
        showToast(`You can change your username again in ${Math.ceil(30 - daysSince)} day(s)`);
        return;
      }
      const taken = await db.collection('usernames').doc(newUsername).get();
      if (taken.exists) { showToast('That username is already taken'); return; }
      await db.collection('usernames').doc(state.profile.username).delete();
      await db.collection('usernames').doc(newUsername).set({ uid: state.user.uid });
      updates.username = newUsername;
      updates.lastUsernameChange = firebase.firestore.FieldValue.serverTimestamp();
    }
    const file = $('editAvatarInput').files[0];
    if (file) updates.photoURL = await uploadFile(file, `avatars/${state.user.uid}`);

    await db.collection('users').doc(state.user.uid).update(updates);
    Object.assign(state.profile, updates);
    showToast('Profile updated');
    hidePage('editProfilePage');
  } catch (err) {
    console.error(err);
    showToast('Could not save profile');
  } finally {
    btn.disabled = false;
  }
}

/* ============================================================
   HOME — chat list, search
   ============================================================ */
function renderChatListItem(chat) {
  const node = $('tmplChatListItem').content.cloneNode(true);
  const row = node.querySelector('.list-row');
  row.dataset.chatId = chat.id;
  row.querySelector('img').src = chat.photoURL || 'https://i.pravatar.cc/100';
  row.querySelector('.online-dot').classList.toggle('hidden', !chat.online);
  row.querySelector('.row-name').textContent = chat.name || 'Chat';
  row.querySelector('.row-time').textContent = chat.updatedAt ? formatTime(chat.updatedAt) : '';
  row.querySelector('.row-sub').textContent = chat.lastMessage || '';
  const badge = row.querySelector('.badge');
  if (chat.unread > 0) { badge.textContent = chat.unread; badge.classList.remove('hidden'); }
  row.addEventListener('click', () => openChat(chat.id, chat));
  let pressTimer;
  row.addEventListener('touchstart', () => { pressTimer = setTimeout(() => openChatCardMenu(chat.id), 500); });
  row.addEventListener('touchend', () => clearTimeout(pressTimer));
  return row;
}
function loadHomeData() {
  if (!state.user) return;
  if (state.chatsUnsub) state.chatsUnsub();
  state.chatsUnsub = db.collection('chats')
    .where('members', 'array-contains', state.user.uid)
    .orderBy('updatedAt', 'desc')
    .onSnapshot(snap => {
      const list = $('homeChatList');
      list.innerHTML = '';
      if (snap.empty) {
        list.innerHTML = '<div style="padding:40px 24px;text-align:center;color:var(--paper-faint);font-size:13px;">No chats yet — search for someone to say hi 👋</div>';
        return;
      }
      snap.forEach(doc => list.appendChild(renderChatListItem({ id: doc.id, ...doc.data() })));
    }, err => console.error('chats listener', err));
}
let searchDebounce;
function onHomeSearchInput(value) {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => searchUsers(value), 300);
}
async function searchUsers(query) {
  query = query.trim().toLowerCase();
  const results = $('homeSearchResults');
  if (!query) { results.classList.add('hidden'); $('homeChatList').classList.remove('hidden'); return; }
  results.classList.remove('hidden');
  $('homeChatList').classList.add('hidden');
  results.innerHTML = '<div style="padding:20px;text-align:center;color:var(--paper-faint);font-size:13px;">Searching...</div>';
  try {
    const snap = await db.collection('users')
      .orderBy('username').startAt(query).endAt(query + '\uf8ff').limit(20).get();
    results.innerHTML = '';
    if (snap.empty) {
      results.innerHTML = '<div style="padding:20px;text-align:center;color:var(--paper-faint);font-size:13px;">No users found</div>';
      return;
    }
    snap.forEach(doc => {
      const u = doc.data();
      if (u.uid === state.user.uid) return;
      const row = document.createElement('div');
      row.className = 'list-row';
      row.innerHTML = `<img class="avatar avatar-md" src="${escapeHtml(u.photoURL || 'https://i.pravatar.cc/100')}"><div class="row-body"><div class="row-name">${escapeHtml(u.name)}</div><span class="row-sub">@${escapeHtml(u.username)}</span></div>`;
      row.addEventListener('click', () => { results.classList.add('hidden'); $('homeChatList').classList.remove('hidden'); openProfileView(u, false); });
      results.appendChild(row);
    });
  } catch (err) { console.error('search users', err); }
}
async function openChatCardMenu(chatId) {
  state.lockTargetChatId = chatId;
  showModal('chatCardMenuModal');
}
async function getOrCreateChat(otherUid) {
  const existing = await db.collection('chats').where('members', 'array-contains', state.user.uid).get();
  let found = null;
  existing.forEach(d => {
    const m = d.data().members || [];
    if (m.length === 2 && m.includes(otherUid)) found = d.id;
  });
  if (found) return found;
  const ref = await db.collection('chats').add({
    members: [state.user.uid, otherUid],
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    lastMessage: ''
  });
  return ref.id;
}

/* ============================================================
   YOUR CHATS — saved / locked / favourite tabs
   ============================================================ */
function loadYourChats(type) {
  const list = $('yourChatsList');
  list.innerHTML = '<div style="padding:20px;text-align:center;color:var(--paper-faint);font-size:13px;">Loading...</div>';
  const rootCollection = type === 'locked' ? 'lockedChats' : 'savedChats';
  const subCollection = type === 'favourite' ? 'favourites' : 'chats';
  db.collection(rootCollection).doc(state.user.uid).collection(subCollection).get()
    .then(async snap => {
      list.innerHTML = '';
      if (snap.empty) {
        list.innerHTML = `<div style="padding:40px 24px;text-align:center;color:var(--paper-faint);font-size:13px;">No ${escapeHtml(type)} chats yet</div>`;
        return;
      }
      for (const docSnap of snap.docs) {
        const chatDoc = await db.collection('chats').doc(docSnap.id).get();
        if (chatDoc.exists) list.appendChild(renderChatListItem({ id: chatDoc.id, ...chatDoc.data() }));
      }
    }).catch(err => console.error('your chats', err));
}

/* ============================================================
   PROFILE VIEW (own profile or another user's)
   ============================================================ */
function openProfileView(profile, isOwn) {
  state.viewingOwnProfile = !!isOwn;
  state.viewingProfileUid = profile.uid;
  $('profileViewName').textContent = profile.name || '';
  $('profileViewHandle').textContent = '@' + (profile.username || '');
  $('profileViewBio').textContent = profile.bio || '';
  $('profileViewAvatar').src = profile.photoURL || 'https://i.pravatar.cc/150';
  $('profileViewTitle').textContent = isOwn ? 'My Profile' : 'Profile';
  $('profileMessageBtn').classList.toggle('hidden', !!isOwn);
  if (profile.createdAt && profile.createdAt.toDate) {
    $('profileJoinDate').textContent = profile.createdAt.toDate().toLocaleDateString([], { month: 'short', year: 'numeric' });
  }
  db.collection('posts').where('authorId', '==', profile.uid).get()
    .then(snap => { $('profilePostCount').textContent = snap.size; }).catch(() => {});
  showPage('profileViewPage');
}

/* ============================================================
   NOTIFICATIONS
   ============================================================ */
function notifIcon(type) { return { message: 'fa-message', group: 'fa-user-group', like: 'fa-heart', comment: 'fa-comment' }[type] || 'fa-circle-info'; }
function notifColor(type) { return { message: 'var(--terracotta)', group: 'var(--terracotta)', like: 'var(--alta)', comment: 'var(--paddy)' }[type] || 'var(--paper-faint)'; }
function renderNotifRow(n, id) {
  const node = $('tmplNotifRow').content.cloneNode(true);
  const row = node.querySelector('.notif-row');
  row.classList.toggle('unread', !n.read);
  row.querySelector('.notif-icon').innerHTML = `<i class="fa-solid ${notifIcon(n.type)}"></i>`;
  row.querySelector('.notif-icon').style.background = notifColor(n.type);
  row.querySelector('.notif-text').innerHTML = n.text || '';
  row.querySelector('.notif-time').textContent = formatTime(n.createdAt);
  row.addEventListener('click', () => db.collection('notifications').doc(id).update({ read: true }));
  return node;
}
function loadNotifications() {
  if (state.notifUnsub) state.notifUnsub();
  state.notifUnsub = db.collection('notifications')
    .where('toUid', '==', state.user.uid).orderBy('createdAt', 'desc').limit(30)
    .onSnapshot(snap => {
      const wrap = $('notificationsPage').querySelector('div[style*="overflow-y"]');
      wrap.innerHTML = '';
      let unread = 0;
      if (snap.empty) { wrap.innerHTML = '<div style="padding:40px 24px;text-align:center;color:var(--paper-faint);font-size:13px;">No notifications yet</div>'; }
      snap.forEach(doc => {
        const n = doc.data();
        if (!n.read) unread++;
        wrap.appendChild(renderNotifRow(n, doc.id));
      });
      $('notifDot').classList.toggle('hidden', unread === 0);
    }, err => console.error('notifications listener', err));
}

/* ============================================================
   SETTINGS — theme, privacy, blocked users, logout
   ============================================================ */
function applyTheme(theme) {
  $('appRoot').dataset.theme = theme;
  $('darkModeToggle').classList.toggle('on', theme === 'dark');
  localStorage.setItem('sayatx_theme', theme);
}
function toggleTheme() {
  const next = $('appRoot').dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  if (state.user) db.collection('settings').doc(state.user.uid).set({ theme: next }, { merge: true });
}
function loadBlockedUsers() {
  const list = $('blockedList');
  list.innerHTML = '<div style="padding:20px;text-align:center;color:var(--paper-faint);font-size:13px;">Loading...</div>';
  db.collection('blockedUsers').doc(state.user.uid).collection('users').get().then(async snap => {
    list.innerHTML = '';
    if (snap.empty) { list.innerHTML = '<div style="padding:40px 24px;text-align:center;color:var(--paper-faint);font-size:13px;">No blocked users</div>'; return; }
    for (const docSnap of snap.docs) {
      const uDoc = await db.collection('users').doc(docSnap.id).get();
      if (!uDoc.exists) continue;
      const u = uDoc.data();
      const row = document.createElement('div');
      row.className = 'list-row';
      row.innerHTML = `<img class="avatar avatar-sm" src="${escapeHtml(u.photoURL || 'https://i.pravatar.cc/100')}"><div class="row-body">${escapeHtml(u.name)}</div><button class="btn btn-outline" style="padding:8px 14px;font-size:12px;">Unblock</button>`;
      row.querySelector('button').addEventListener('click', async () => {
        await db.collection('blockedUsers').doc(state.user.uid).collection('users').doc(docSnap.id).delete();
        row.remove();
      });
      list.appendChild(row);
    }
  }).catch(err => console.error('blocked users', err));
}
function logout() {
  showConfirm('Log out of SayatX?', 'You can always sign back in with your phone number.', async () => {
    try { await auth.signOut(); location.reload(); } catch (err) { console.error(err); }
  });
}

/* ============================================================
   EVENT WIRING — Navigation, Home, Settings, Notifications, Profile
   ============================================================ */
function wireCoreEvents() {
  // Bottom nav
  document.querySelectorAll('.nav-item').forEach(item => item.addEventListener('click', () => showScreen(item.dataset.screen)));

  // Auth
  $('sendOtpBtn').addEventListener('click', sendOtp);
  $('otpBackBtn').addEventListener('click', () => goToAuthStep('loginPage'));
  $('verifyOtpBtn').addEventListener('click', verifyOtp);
  $('resendOtpBtn').addEventListener('click', sendOtp);
  wireOtpBoxes();
  $('countryCodeBtn').addEventListener('click', () => showModal('countryPickerModal'));
  $('closeCountryPicker').addEventListener('click', () => hideModal('countryPickerModal'));
  document.querySelectorAll('#countryList .list-row').forEach(row => {
    row.addEventListener('click', () => {
      $('countryCode').textContent = row.dataset.code;
      $('countryFlag').textContent = row.querySelector('span').textContent;
      hideModal('countryPickerModal');
    });
  });
  $('setupContinueBtn').addEventListener('click', completeProfileSetup);
  wireAvatarPreview('setupAvatarInput');
  wireAvatarPreview('editAvatarInput');
  wireAvatarPreview('groupPhotoInput');

  // Edit profile
  $('editProfileBack').addEventListener('click', () => hidePage('editProfilePage'));
  $('saveProfileBtn').addEventListener('click', saveProfile);

  // Home
  $('openSearchBtn').addEventListener('click', () => {
    $('homeSearchResults').classList.remove('hidden');
    $('homeChatList').classList.add('hidden');
    const box = $('openSearchBtn');
    box.innerHTML = '<i class="fa-solid fa-search"></i>';
    const input = document.createElement('input');
    input.placeholder = 'Search users...';
    input.style.fontSize = '14px';
    input.addEventListener('input', () => onHomeSearchInput(input.value));
    box.appendChild(input);
    input.focus();
  });
  $('notifBtn').addEventListener('click', () => { showPage('notificationsPage'); loadNotifications(); });
  $('notifBack').addEventListener('click', () => hidePage('notificationsPage'));
  $('homeMenuBtn').addEventListener('click', (e) => { e.stopPropagation(); toggleDropdown('homeMenuDropdown', $('homeMenuBtn')); });
  $('myProfileMenuItem').addEventListener('click', () => { $('homeMenuDropdown').classList.add('hidden'); openProfileView(state.profile, true); });
  $('newGroupMenuItem').addEventListener('click', () => { $('homeMenuDropdown').classList.add('hidden'); showPage('createGroupPage'); });
  $('openSettingsMenuItem').addEventListener('click', () => { $('homeMenuDropdown').classList.add('hidden'); showPage('settingsPage'); });
  $('openCreateGroupBtn').addEventListener('click', () => showPage('createGroupPage'));
  $('postsMenuBtn').addEventListener('click', (e) => { e.stopPropagation(); toggleDropdown('postsMenuDropdown', $('postsMenuBtn')); });

  // Your Chats tabs
  document.querySelectorAll('.tabs .tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tabs .tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      loadYourChats(tab.dataset.tab);
    });
  });
  $('chatCardMenuModal').addEventListener('click', (e) => { if (e.target.id === 'chatCardMenuModal') hideModal('chatCardMenuModal'); });

  // Profile view
  $('profileViewBack').addEventListener('click', () => hidePage('profileViewPage'));
  $('profileViewMenuBtn').addEventListener('click', () => {
    if (state.viewingOwnProfile) { hidePage('profileViewPage'); showPage('editProfilePage'); populateEditProfile(); }
    else { openReport('user', state.viewingProfileUid); }
  });
  $('profileMessageBtn').addEventListener('click', async () => {
    const chatId = await getOrCreateChat(state.viewingProfileUid);
    hidePage('profileViewPage');
    const otherDoc = await db.collection('users').doc(state.viewingProfileUid).get();
    openChat(chatId, { id: chatId, ...otherDoc.data() });
  });
  $('profileShareBtn').addEventListener('click', () => {
    navigator.clipboard.writeText(`https://sayatx.app/u/${state.viewingProfileUid}`);
    showToast('Profile link copied');
  });
  $('profileViewPostsBtn').addEventListener('click', () => { hidePage('profileViewPage'); showPage('yourPostsPage'); });

  // Settings
  $('settingsBack').addEventListener('click', () => hidePage('settingsPage'));
  $('darkModeToggle').addEventListener('click', toggleTheme);
  $('privacySettingsBtn').addEventListener('click', () => showPage('privacySettingsPage'));
  $('privacyBack').addEventListener('click', () => hidePage('privacySettingsPage'));
  $('blockedUsersBtn').addEventListener('click', () => { showPage('blockedUsersPage'); loadBlockedUsers(); });
  $('blockedBack').addEventListener('click', () => hidePage('blockedUsersPage'));
  $('logoutBtn').addEventListener('click', logout);
  document.querySelectorAll('.privacy-toggle, #privacySettingsPage .toggle').forEach(t => {
    t.addEventListener('click', () => t.classList.toggle('on'));
  });

  // Generic confirm modal
  $('confirmOkBtn').addEventListener('click', () => { hideModal('confirmActionModal'); if (state.confirmCallback) state.confirmCallback(); });
  $('confirmCancelBtn').addEventListener('click', () => hideModal('confirmActionModal'));

  // Close any open dropdown on an outside tap (trigger buttons stop propagation below,
  // so this only ever fires for taps that are genuinely outside the open dropdown)
  document.addEventListener('click', (e) => {
    document.querySelectorAll('.dropdown').forEach(dd => {
      if (!dd.classList.contains('hidden') && !dd.contains(e.target)) dd.classList.add('hidden');
    });
  });
}

/* ============================================================
   CHAT CONVERSATION — open, load/render messages, send (text,
   media, voice), typing status, message actions, lock chat
   ============================================================ */
function openChat(chatId, chatInfo) {
  state.currentChatId = chatId;
  state.currentChatUser = chatInfo;
  $('chatHeaderName').textContent = chatInfo.name || 'Chat';
  $('chatHeaderAvatar').src = chatInfo.photoURL || 'https://i.pravatar.cc/100';
  $('chatHeaderStatus').textContent = chatInfo.online ? 'Online' : 'Offline';
  $('chatHeaderStatus').classList.remove('typing');
  showPage('chatConversationPage');
  loadMessages(chatId);
  db.collection('typingStatus').doc(chatId).onSnapshot(doc => {
    if (!doc.exists) return;
    const data = doc.data();
    const otherTyping = Object.entries(data).some(([uid, val]) => uid !== state.user.uid && val === true);
    $('chatHeaderStatus').textContent = otherTyping ? 'Typing...' : (chatInfo.online ? 'Online' : 'Offline');
    $('chatHeaderStatus').classList.toggle('typing', otherTyping);
  });
}
function renderMessage(msg) {
  const isOut = msg.senderId === state.user.uid;
  const node = $(isOut ? 'tmplMessageOut' : 'tmplMessageIn').content.cloneNode(true);
  const row = node.querySelector('.msg-row');
  const bubble = node.querySelector('.bubble');
  row.dataset.msgId = msg.id;

  if (msg.deleted) {
    bubble.querySelector('.msg-text').textContent = 'This message was deleted';
    bubble.style.opacity = '0.6';
  } else if (msg.type === 'image') {
    bubble.classList.add('bubble-image');
    bubble.querySelector('.msg-text').outerHTML = `<img src="${escapeHtml(msg.mediaURL)}">`;
    bubble.querySelector('img').addEventListener('click', () => openMediaViewer(msg.mediaURL, 'image'));
  } else if (msg.type === 'video') {
    bubble.classList.add('bubble-video');
    bubble.style.padding = '4px';
    bubble.querySelector('.msg-text').outerHTML = `<img class="video-thumb" src="${escapeHtml(msg.mediaURL)}"><span class="play-overlay"><i class="fa-solid fa-play"></i></span>`;
    bubble.addEventListener('click', () => openMediaViewer(msg.mediaURL, 'video'));
  } else if (msg.type === 'voice') {
    bubble.classList.add('bubble-voice');
    const mins = Math.floor((msg.duration || 0) / 60), secs = (msg.duration || 0) % 60;
    bubble.querySelector('.msg-text').outerHTML = `<div class="voice-play"><i class="fa-solid fa-play" style="font-size:11px;"></i></div><div class="waveform"><span style="height:6px"></span><span style="height:14px"></span><span style="height:20px"></span><span style="height:10px"></span><span style="height:16px"></span><span style="height:8px"></span></div><span style="font-size:11px;color:var(--paper-faint);">${mins}:${String(secs).padStart(2,'0')}</span>`;
    bubble.querySelector('.voice-play').addEventListener('click', () => { const a = new Audio(msg.mediaURL); a.play(); });
  } else if (msg.type === 'file') {
    bubble.classList.add('bubble-file');
    bubble.querySelector('.msg-text').outerHTML = `<div class="file-icon"><i class="fa-solid fa-file"></i></div><div class="row-body"><div style="font-size:13px;font-weight:700;">${escapeHtml(msg.fileName)}</div><div style="font-size:11px;color:var(--paper-faint);">${escapeHtml(msg.fileSize||'')}</div></div><i class="fa-solid fa-download"></i>`;
    bubble.querySelector('.fa-download').addEventListener('click', () => window.open(msg.mediaURL, '_blank'));
  } else {
    bubble.querySelector('.msg-text').textContent = msg.text || '';
  }

  bubble.querySelector('.msg-time').textContent = formatTime(msg.createdAt);
  if (isOut) {
    const tick = bubble.querySelector('.ticks');
    if (msg.seen) { tick.classList.add('seen'); tick.classList.remove('fa-check'); tick.classList.add('fa-check-double'); }
    else if (msg.delivered) { tick.classList.remove('fa-check'); tick.classList.add('fa-check-double'); }
  }
  row.addEventListener('contextmenu', (e) => { e.preventDefault(); openMessageMenu(msg, row); });
  let pressTimer;
  row.addEventListener('touchstart', () => { pressTimer = setTimeout(() => openMessageMenu(msg, row), 500); });
  row.addEventListener('touchend', () => clearTimeout(pressTimer));
  return node;
}
function loadMessages(chatId) {
  if (state.messagesUnsub) state.messagesUnsub();
  const area = $('messagesArea');
  area.innerHTML = '';
  state.messagesUnsub = db.collection('chats').doc(chatId).collection('messages')
    .orderBy('createdAt', 'asc').limitToLast(100)
    .onSnapshot(snap => {
      area.innerHTML = '';
      let lastDate = '';
      snap.forEach(doc => {
        const msg = { id: doc.id, ...doc.data() };
        if (msg.deletedFor && msg.deletedFor[state.user.uid]) return;
        const dateStr = formatDate(msg.createdAt);
        if (dateStr && dateStr !== lastDate) {
          const sep = document.createElement('div');
          sep.className = 'date-sep';
          sep.textContent = dateStr;
          area.appendChild(sep);
          lastDate = dateStr;
        }
        area.appendChild(renderMessage(msg));
      });
      area.scrollTop = area.scrollHeight;
    }, err => console.error('messages listener', err));
}
async function sendTextMessage() {
  const text = $('chatTextInput').value.trim();
  if (!text || !state.currentChatId) return;
  $('chatTextInput').value = '';
  $('sendBtn').querySelector('i').className = 'fa-solid fa-microphone';
  updateTypingStatus(false);
  await db.collection('chats').doc(state.currentChatId).collection('messages').add({
    type: 'text', text, senderId: state.user.uid,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    delivered: true, seen: false
  });
  await db.collection('chats').doc(state.currentChatId).update({
    lastMessage: text, updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}
function updateTypingStatus(isTyping) {
  if (!state.currentChatId) return;
  db.collection('typingStatus').doc(state.currentChatId).set({ [state.user.uid]: isTyping }, { merge: true });
}
async function sendMediaMessage(file, type) {
  if (!file || !state.currentChatId) return;
  if (type === 'video' && file.size > 200 * 1024 * 1024) { showToast('Video must be under 200MB'); return; }
  showToast('Uploading...');
  try {
    const url = await uploadFile(file, `chatMedia/${state.currentChatId}`);
    const data = { type, senderId: state.user.uid, mediaURL: url, createdAt: firebase.firestore.FieldValue.serverTimestamp(), delivered: true, seen: false };
    if (type === 'file') { data.fileName = file.name; data.fileSize = formatFileSize(file.size); }
    await db.collection('chats').doc(state.currentChatId).collection('messages').add(data);
    const label = type === 'image' ? '📷 Photo' : type === 'video' ? '🎬 Video' : `📎 ${file.name}`;
    await db.collection('chats').doc(state.currentChatId).update({ lastMessage: label, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
  } catch (err) { console.error(err); showToast('Upload failed'); }
}

/* ---------- VOICE RECORDING ---------- */
async function startRecording() {
  if (!state.currentChatId || state.isRecording) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    state.mediaRecorder = new MediaRecorder(stream);
    state.recordChunks = [];
    state.mediaRecorder.ondataavailable = e => state.recordChunks.push(e.data);
    state.mediaRecorder.start();
    state.isRecording = true;
    state.recordStart = Date.now();
    $('voiceRecordBar').classList.add('active');
    state.recordTimer = setInterval(() => {
      const secs = Math.floor((Date.now() - state.recordStart) / 1000);
      const label = $('voiceRecordBar').querySelector('span');
      if (label) label.textContent = `Recording... 0:${String(secs).padStart(2, '0')}`;
    }, 500);
  } catch (err) { showToast('Microphone access denied'); }
}
function stopRecordingAndSend() {
  if (!state.mediaRecorder || !state.isRecording) return;
  const durationSec = Math.floor((Date.now() - state.recordStart) / 1000);
  clearInterval(state.recordTimer);
  state.mediaRecorder.onstop = async () => {
    $('voiceRecordBar').classList.remove('active');
    state.isRecording = false;
    if (durationSec < 1) return;
    const blob = new Blob(state.recordChunks, { type: 'audio/webm' });
    try {
      const url = await uploadFile(blob, `voice/${state.currentChatId}`);
      await db.collection('chats').doc(state.currentChatId).collection('messages').add({
        type: 'voice', mediaURL: url, duration: durationSec, senderId: state.user.uid,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(), delivered: true, seen: false
      });
      await db.collection('chats').doc(state.currentChatId).update({ lastMessage: '🎤 Voice message', updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
    } catch (err) { console.error(err); showToast('Could not send voice message'); }
  };
  state.mediaRecorder.stop();
}
function cancelRecording() {
  if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') state.mediaRecorder.stop();
  clearInterval(state.recordTimer);
  $('voiceRecordBar').classList.remove('active');
  state.isRecording = false;
}

/* ---------- MESSAGE ACTIONS ---------- */
function openMessageMenu(msg, rowEl) {
  state.selectedMessageEl = { msg, row: rowEl };
  const dd = $('messageContextMenu');
  dd.classList.remove('hidden');
  const rect = rowEl.getBoundingClientRect();
  const rootRect = $('appRoot').getBoundingClientRect();
  dd.style.top = Math.max(8, rect.top - rootRect.top) + 'px';
  dd.style.left = Math.max(8, rect.left - rootRect.left) + 'px';
}
async function deleteSelectedMessage(forEveryone) {
  const sel = state.selectedMessageEl;
  if (!sel || !state.currentChatId) return;
  const ref = db.collection('chats').doc(state.currentChatId).collection('messages').doc(sel.msg.id);
  if (forEveryone) {
    await ref.update({ deleted: true, text: '', mediaURL: firebase.firestore.FieldValue.delete() });
  } else {
    await ref.update({ [`deletedFor.${state.user.uid}`]: true });
  }
  $('messageContextMenu').classList.add('hidden');
}

/* ---------- LOCK CHAT ---------- */
async function confirmLockChat() {
  const pwd = $('lockPasswordInput').value;
  if (!pwd) { showToast('Enter a password'); return; }
  const lockDoc = await db.collection('lockedChats').doc(state.user.uid).get();
  const hash = await sha256(pwd);
  if (lockDoc.exists && lockDoc.data().passwordHash) {
    if (lockDoc.data().passwordHash !== hash) { showToast('Incorrect password'); return; }
  } else {
    await db.collection('lockedChats').doc(state.user.uid).set({ passwordHash: hash }, { merge: true });
  }
  await db.collection('lockedChats').doc(state.user.uid).collection('chats').doc(state.lockTargetChatId).set({ lockedAt: firebase.firestore.FieldValue.serverTimestamp() });
  hideModal('lockChatModal');
  $('lockPasswordInput').value = '';
  showToast('Chat locked');
}

/* ---------- CHAT 3-DOT MENU ACTIONS ---------- */
async function saveChat() {
  if (!state.currentChatId) return;
  await db.collection('savedChats').doc(state.user.uid).collection('chats').doc(state.currentChatId).set({ savedAt: firebase.firestore.FieldValue.serverTimestamp() });
  showToast('Chat saved');
}
function clearChat() {
  showConfirm('Clear this chat?', 'This will delete all messages. This cannot be undone.', async () => {
    const msgs = await db.collection('chats').doc(state.currentChatId).collection('messages').get();
    const batch = db.batch();
    msgs.forEach(d => batch.delete(d.ref));
    await batch.commit();
    showToast('Chat cleared');
  });
}
function blockUser() {
  if (!state.currentChatUser) return;
  showConfirm('Block this user?', "You won't receive messages from them anymore.", async () => {
    await db.collection('blockedUsers').doc(state.user.uid).collection('users').doc(state.currentChatUser.uid || state.currentChatUser.id).set({ blockedAt: firebase.firestore.FieldValue.serverTimestamp() });
    showToast('User blocked');
    hidePage('chatConversationPage');
  });
}

/* ============================================================
   GROUPS
   ============================================================ */
async function createGroup() {
  const name = $('groupNameInput').value.trim();
  if (!name) { showToast('Enter a group name'); return; }
  const btn = $('createGroupSubmitBtn');
  btn.disabled = true;
  try {
    const checked = document.querySelectorAll('#groupMemberPicker input[type=checkbox]:checked');
    const members = Array.from(checked).map(cb => cb.closest('.list-row').dataset.uid).filter(Boolean);
    members.push(state.user.uid);
    const groupRef = db.collection('groups').doc();
    let photoURL = '';
    const file = $('groupPhotoInput').files[0];
    if (file) photoURL = await uploadFile(file, `groupPhotos/${groupRef.id}`);
    await groupRef.set({
      name, photoURL, members, admins: [state.user.uid],
      createdBy: state.user.uid, createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await db.collection('chats').doc(groupRef.id).set({
      isGroup: true, name, photoURL, members,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(), lastMessage: 'Group created'
    });
    showToast('Group created');
    hidePage('createGroupPage');
    showScreen('chatsScreen');
  } catch (err) { console.error(err); showToast('Could not create group'); }
  finally { btn.disabled = false; }
}
function openGroupInfo(groupId) {
  db.collection('groups').doc(groupId).get().then(doc => {
    if (!doc.exists) return;
    const g = doc.data();
    $('groupInfoPage').querySelector('.name').textContent = g.name;
    $('groupMemberCount').textContent = `${(g.members || []).length} members`;
    showPage('groupInfoPage');
  });
}
function deleteGroup() {
  showConfirm('Delete this group?', 'This removes the group for everyone. This cannot be undone.', async () => {
    hidePage('groupInfoPage');
    showScreen('chatsScreen');
    showToast('Group deleted');
  });
}

/* ============================================================
   POSTS — feed, like, create, comments, share, your posts
   ============================================================ */
function renderPostCard(post) {
  const node = $('tmplPostCard').content.cloneNode(true);
  const card = node.querySelector('.post-card');
  card.dataset.postId = post.id;
  node.querySelector('.post-card-head img').src = post.authorPhoto || 'https://i.pravatar.cc/100';
  node.querySelector('.row-name').textContent = post.authorName || '';
  node.querySelector('.row-sub').textContent = '@' + (post.authorUsername || '');
  node.querySelector('.post-media img').src = post.photoURL || '';
  node.querySelector('.overlay-title').textContent = post.overlayText || '';
  node.querySelector('.post-title').textContent = post.title || '';
  node.querySelector('.post-text').textContent = post.caption || '';
  const linkEl = node.querySelector('.post-link');
  if (post.link) linkEl.innerHTML = `<i class="fa-solid fa-link"></i> ${escapeHtml(post.link)}`;
  else linkEl.remove();
  node.querySelector('.like-count').textContent = post.likeCount || 0;
  node.querySelector('.comment-count').textContent = post.commentCount || 0;
  node.querySelector('.share-count').textContent = post.shareCount || 0;
  const acts = node.querySelectorAll('.act');
  acts[0].addEventListener('click', () => toggleLike(post.id, acts[0]));
  acts[1].addEventListener('click', () => openComments(post.id));
  acts[2].addEventListener('click', () => openShareModal(post.id));
  node.querySelector('.post-card-head img').addEventListener('click', () => {
    db.collection('users').doc(post.authorId).get().then(d => { if (d.exists) openProfileView(d.data(), post.authorId === state.user.uid); });
  });
  const kebab = node.querySelector('.post-card-head .icon-btn');
  if (kebab) kebab.addEventListener('click', () => openReport('post', post.id));
  return node;
}
function loadPostsFeed() {
  if (!state.user) return;
  if (state.postsUnsub) state.postsUnsub();
  const feed = $('postsFeed');
  state.postsUnsub = db.collection('posts').orderBy('likeCount', 'desc').limit(30)
    .onSnapshot(snap => {
      feed.innerHTML = '';
      if (snap.empty) { feed.innerHTML = '<div style="padding:60px 24px;text-align:center;color:var(--paper-faint);font-size:13px;">No posts yet — be the first to share something</div>'; return; }
      snap.forEach(doc => feed.appendChild(renderPostCard({ id: doc.id, ...doc.data() })));
    }, err => console.error('posts feed', err));
}
async function toggleLike(postId, actEl) {
  const likeRef = db.collection('likes').doc(`${state.user.uid}_${postId}`);
  const postRef = db.collection('posts').doc(postId);
  const existing = await likeRef.get();
  if (existing.exists) {
    await likeRef.delete();
    await postRef.update({ likeCount: firebase.firestore.FieldValue.increment(-1) });
    if (actEl) actEl.classList.remove('liked');
  } else {
    await likeRef.set({ uid: state.user.uid, postId, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    await postRef.update({ likeCount: firebase.firestore.FieldValue.increment(1) });
    if (actEl) actEl.classList.add('liked');
  }
}
async function publishPost() {
  const file = $('postPhotoInput').files[0];
  if (!file) { showToast('Add a photo'); return; }
  const title = $('postTitleInput').value.trim();
  const overlayText = $('postOverlayInput').value.trim();
  const link = $('postLinkInput').value.trim();
  const btn = $('publishPostBtn');
  btn.disabled = true;
  try {
    const photoURL = await uploadFile(file, `posts/${state.user.uid}`);
    await db.collection('posts').add({
      authorId: state.user.uid, authorName: state.profile.name, authorUsername: state.profile.username,
      authorPhoto: state.profile.photoURL || '', photoURL, title, overlayText, link, caption: title,
      likeCount: 0, commentCount: 0, shareCount: 0, createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    showToast('Posted!');
    $('postPhotoInput').value = ''; $('postTitleInput').value = ''; $('postOverlayInput').value = ''; $('postLinkInput').value = '';
    $('postPhotoUpload').style.backgroundImage = '';
    hidePage('createPostModal');
    showScreen('postsScreen');
  } catch (err) { console.error(err); showToast('Could not publish post'); }
  finally { btn.disabled = false; }
}
let activeCommentPostId = null;
async function openComments(postId) {
  activeCommentPostId = postId;
  const list = $('commentsList');
  list.innerHTML = '<div style="padding:20px;text-align:center;color:var(--paper-faint);font-size:13px;">Loading...</div>';
  showModal('commentsModal');
  try {
    const snap = await db.collection('posts').doc(postId).collection('comments').orderBy('createdAt', 'asc').get();
    list.innerHTML = '';
    if (snap.empty) { list.innerHTML = '<div style="padding:20px;text-align:center;color:var(--paper-faint);font-size:13px;">No comments yet</div>'; return; }
    snap.forEach(doc => {
      const c = doc.data();
      const row = document.createElement('div');
      row.className = 'list-row';
      row.innerHTML = `<img class="avatar avatar-sm" src="${escapeHtml(c.authorPhoto || 'https://i.pravatar.cc/100')}"><div class="row-body"><b style="font-size:13px;">${escapeHtml(c.authorName)}</b><div style="font-size:13px;color:var(--paper-dim);">${escapeHtml(c.text)}</div></div>`;
      list.appendChild(row);
    });
  } catch (err) { console.error('comments', err); }
}
async function submitComment() {
  const text = $('commentInput').value.trim();
  if (!text || !activeCommentPostId) return;
  $('commentInput').value = '';
  await db.collection('posts').doc(activeCommentPostId).collection('comments').add({
    text, authorId: state.user.uid, authorName: state.profile.name, authorPhoto: state.profile.photoURL || '',
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  await db.collection('posts').doc(activeCommentPostId).update({ commentCount: firebase.firestore.FieldValue.increment(1) });
  openComments(activeCommentPostId);
}
let activeSharePostId = null;
function openShareModal(postId) {
  activeSharePostId = postId;
  $('shareLinkInput').value = `https://sayatx.app/p/${postId}`;
  showModal('shareModal');
}
function copyShareLink() {
  navigator.clipboard.writeText($('shareLinkInput').value).then(() => showToast('Link copied'));
  if (activeSharePostId) db.collection('posts').doc(activeSharePostId).update({ shareCount: firebase.firestore.FieldValue.increment(1) }).catch(() => {});
}
function loadYourPosts() {
  const grid = $('yourPostsGrid');
  grid.innerHTML = '<div style="padding:20px;text-align:center;color:var(--paper-faint);font-size:13px;">Loading...</div>';
  db.collection('posts').where('authorId', '==', state.user.uid).orderBy('createdAt', 'desc').get().then(snap => {
    grid.innerHTML = '';
    if (snap.empty) { grid.innerHTML = "<div style=\"padding:60px 24px;text-align:center;color:var(--paper-faint);font-size:13px;\">You haven't posted anything yet</div>"; return; }
    snap.forEach(doc => {
      const p = doc.data();
      const card = document.createElement('article');
      card.className = 'post-card';
      card.innerHTML = `<div class="post-media"><img src="${escapeHtml(p.photoURL)}"></div><div class="post-body" style="display:flex;justify-content:space-between;align-items:center;"><span class="post-text">${p.likeCount||0} likes · ${p.commentCount||0} comments</span><div style="display:flex;gap:14px;font-size:15px;"><i class="fa-solid fa-pen"></i><i class="fa-solid fa-share"></i><i class="fa-solid fa-trash" style="color:var(--alta);"></i></div></div>`;
      card.querySelector('.fa-share').addEventListener('click', () => openShareModal(doc.id));
      card.querySelector('.fa-trash').addEventListener('click', () => {
        showConfirm('Delete this post?', 'This cannot be undone.', async () => { await db.collection('posts').doc(doc.id).delete(); loadYourPosts(); });
      });
      grid.appendChild(card);
    });
  }).catch(err => console.error('your posts', err));
}

/* ============================================================
   REPORT (reusable for user / post / group)
   ============================================================ */
let selectedReportReason = '';
function openReport(type, id) {
  state.pendingReportTarget = { type, id };
  selectedReportReason = '';
  $('reportModalTitle').textContent = `Report ${type.charAt(0).toUpperCase() + type.slice(1)}`;
  document.querySelectorAll('#reportModal .dropdown-item').forEach(i => i.style.background = '');
  showModal('reportModal');
}
async function submitReport() {
  if (!state.pendingReportTarget || !selectedReportReason) { showToast('Choose a reason first'); return; }
  await db.collection('reports').add({
    ...state.pendingReportTarget, reason: selectedReportReason, reportedBy: state.user.uid,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  hideModal('reportModal');
  showToast('Report submitted');
}

/* ============================================================
   MEDIA VIEWER
   ============================================================ */
function openMediaViewer(url, type) {
  if (type === 'image') {
    $('mediaViewerImg').src = url; $('mediaViewerImg').classList.remove('hidden');
    $('mediaViewerVideo').classList.add('hidden');
  } else {
    $('mediaViewerVideo').src = url; $('mediaViewerVideo').classList.remove('hidden');
    $('mediaViewerImg').classList.add('hidden');
    $('mediaViewerVideo').play().catch(() => {});
  }
  $('mediaViewerModal').classList.remove('hidden');
}
function closeMediaViewerFn() {
  $('mediaViewerModal').classList.add('hidden');
  $('mediaViewerVideo').pause();
  $('mediaViewerVideo').removeAttribute('src');
}

/* ============================================================
   PUSH NOTIFICATIONS (FCM) — foreground only.
   Background push needs a firebase-messaging-sw.js service worker
   (separate file, not included here) plus a server/Cloud Function
   that actually sends to the tokens stored in `deviceTokens`.
   ============================================================ */
async function setupPush() {
  if (!messaging || !state.user) return;
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;
    const token = await messaging.getToken(); // add { vapidKey: 'YOUR_VAPID_KEY' } in production
    if (token) {
      await db.collection('deviceTokens').doc(state.user.uid).set(
        { token, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true }
      );
    }
    messaging.onMessage(payload => showToast((payload.notification && payload.notification.title) || 'New notification'));
  } catch (err) { console.warn('push setup skipped', err); }
}

/* ============================================================
   EVENT WIRING — Chat conversation, Groups, Posts, Report, Media
   ============================================================ */
function wireChatPostEvents() {
  // Chat conversation
  $('chatBackBtn').addEventListener('click', () => {
    if (state.messagesUnsub) state.messagesUnsub();
    updateTypingStatus(false);
    hidePage('chatConversationPage');
  });
  $('chatHeaderInfoBtn').addEventListener('click', () => {
    if (!state.currentChatUser) return;
    if (state.currentChatUser.isGroup) openGroupInfo(state.currentChatId);
    else openProfileView(state.currentChatUser, (state.currentChatUser.uid || state.currentChatUser.id) === state.user.uid);
  });
  $('chatMenuBtn').addEventListener('click', (e) => { e.stopPropagation(); toggleDropdown('chatMenuDropdown', $('chatMenuBtn')); });
  $('attachBtn').addEventListener('click', () => showModal('attachMenuModal'));
  $('imageAttachInput').addEventListener('change', () => { const f = $('imageAttachInput').files[0]; hideModal('attachMenuModal'); if (f) sendMediaMessage(f, 'image'); $('imageAttachInput').value = ''; });
  $('videoAttachInput').addEventListener('change', () => { const f = $('videoAttachInput').files[0]; hideModal('attachMenuModal'); if (f) sendMediaMessage(f, 'video'); $('videoAttachInput').value = ''; });
  $('fileAttachInput').addEventListener('change', () => { const f = $('fileAttachInput').files[0]; hideModal('attachMenuModal'); if (f) sendMediaMessage(f, 'file'); $('fileAttachInput').value = ''; });

  $('chatTextInput').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendTextMessage(); } });
  $('chatTextInput').addEventListener('input', () => {
    $('sendBtn').querySelector('i').className = $('chatTextInput').value.trim() ? 'fa-solid fa-paper-plane' : 'fa-solid fa-microphone';
    updateTypingStatus(true);
    clearTimeout(state.typingTimeout);
    state.typingTimeout = setTimeout(() => updateTypingStatus(false), 2000);
  });
  $('sendBtn').addEventListener('click', () => { if ($('chatTextInput').value.trim()) sendTextMessage(); });
  $('sendBtn').addEventListener('pointerdown', () => { if (!$('chatTextInput').value.trim()) startRecording(); });
  $('sendBtn').addEventListener('pointerup', () => { if (state.isRecording) stopRecordingAndSend(); });
  $('sendBtn').addEventListener('pointerleave', () => { if (state.isRecording) stopRecordingAndSend(); });
  $('voiceRecordBar').querySelector('.icon-btn').addEventListener('click', cancelRecording);
  $('voiceRecordBar').querySelector('.mic-fab').addEventListener('click', stopRecordingAndSend);

  $('saveChatMenuItem').addEventListener('click', () => { $('chatMenuDropdown').classList.add('hidden'); saveChat(); });
  $('lockChatMenuItem').addEventListener('click', () => { state.lockTargetChatId = state.currentChatId; $('chatMenuDropdown').classList.add('hidden'); showModal('lockChatModal'); });
  $('mediaMenuItem').addEventListener('click', () => { $('chatMenuDropdown').classList.add('hidden'); showPage('chatMediaModal'); });
  $('closeChatMedia').addEventListener('click', () => hidePage('chatMediaModal'));
  $('searchMsgMenuItem').addEventListener('click', () => { $('chatMenuDropdown').classList.add('hidden'); showPage('searchMessagesModal'); });
  $('closeSearchMsgBtn').addEventListener('click', () => hidePage('searchMessagesModal'));
  $('clearChatMenuItem').addEventListener('click', () => { $('chatMenuDropdown').classList.add('hidden'); clearChat(); });
  $('reportUserMenuItem').addEventListener('click', () => { $('chatMenuDropdown').classList.add('hidden'); openReport('user', state.currentChatUser && (state.currentChatUser.uid || state.currentChatUser.id)); });
  $('blockUserMenuItem').addEventListener('click', () => { $('chatMenuDropdown').classList.add('hidden'); blockUser(); });
  $('confirmLockBtn').addEventListener('click', confirmLockChat);

  document.querySelectorAll('#messageContextMenu .dropdown-item.danger')[0].addEventListener('click', () => deleteSelectedMessage(false));
  $('deleteForEveryoneItem').addEventListener('click', () => deleteSelectedMessage(true));
  $('replyMsgItem').addEventListener('click', () => $('messageContextMenu').classList.add('hidden'));
  $('forwardMsgItem').addEventListener('click', () => { $('messageContextMenu').classList.add('hidden'); showModal('forwardMessageModal'); });
  $('copyMsgItem').addEventListener('click', () => {
    const txt = (state.selectedMessageEl && state.selectedMessageEl.msg.text) || '';
    navigator.clipboard.writeText(txt);
    $('messageContextMenu').classList.add('hidden');
    showToast('Copied');
  });
  $('reactMsgItem').addEventListener('click', () => { $('messageContextMenu').classList.add('hidden'); $('reactionPicker').classList.remove('hidden'); });
  document.querySelectorAll('#reactionPicker span').forEach(s => s.addEventListener('click', () => { $('reactionPicker').classList.add('hidden'); showToast('Reacted ' + s.textContent); }));
  $('msgInfoItem').addEventListener('click', () => { $('messageContextMenu').classList.add('hidden'); showModal('messageInfoModal'); });

  // Groups
  $('createGroupBack').addEventListener('click', () => hidePage('createGroupPage'));
  $('createGroupSubmitBtn').addEventListener('click', createGroup);
  $('groupInfoBack').addEventListener('click', () => hidePage('groupInfoPage'));
  $('deleteGroupBtn').addEventListener('click', deleteGroup);

  // Posts
  $('createPostFab').addEventListener('click', () => showPage('createPostModal'));
  $('createPostClose').addEventListener('click', () => hidePage('createPostModal'));
  $('publishPostBtn').addEventListener('click', publishPost);
  $('postPhotoInput').addEventListener('change', () => {
    const file = $('postPhotoInput').files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const label = $('postPhotoUpload');
    label.style.backgroundImage = `url(${url})`;
    label.style.backgroundSize = 'cover';
    label.style.backgroundPosition = 'center';
    label.querySelectorAll('i,span').forEach(n => n.style.display = 'none');
  });
  $('yourPostsBtn').addEventListener('click', () => { showPage('yourPostsPage'); loadYourPosts(); });
  $('yourPostsBack').addEventListener('click', () => hidePage('yourPostsPage'));
  $('openCommentsBtn').addEventListener('click', () => openComments('sample-post'));
  $('openShareBtn').addEventListener('click', () => openShareModal('sample-post'));
  $('commentsModal').querySelector('.icon-btn').addEventListener('click', submitComment);
  $('commentInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') submitComment(); });
  $('copyLinkBtn').addEventListener('click', copyShareLink);

  // Report
  document.querySelectorAll('#reportModal .dropdown-item').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelectorAll('#reportModal .dropdown-item').forEach(i => i.style.background = '');
      item.style.background = 'var(--ink-raised-2)';
      selectedReportReason = item.textContent;
    });
  });
  $('submitReportBtn').addEventListener('click', submitReport);

  // Media viewer
  $('closeMediaViewer').addEventListener('click', closeMediaViewerFn);

  // Any modal-overlay closes when the backdrop itself (not its sheet/card) is tapped
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.add('hidden'); });
  });
}

/* ============================================================
   INIT
   ============================================================ */
applyTheme(localStorage.getItem('sayatx_theme') || 'dark');
wireCoreEvents();
wireChatPostEvents();

auth.onAuthStateChanged(async (user) => {
  if (user) {
    state.user = user;
    try {
      const doc = await db.collection('users').doc(user.uid).get();
      if (doc.exists) {
        state.profile = doc.data();
        await db.collection('users').doc(user.uid).update({ online: true, lastSeen: firebase.firestore.FieldValue.serverTimestamp() });
        enterApp();
      } else {
        $('splashScreen').classList.add('hidden');
        goToAuthStep('profileSetupPage');
      }
    } catch (err) {
      console.error('auth state check failed', err);
      $('splashScreen').classList.add('hidden');
      goToAuthStep('loginPage');
    }
  } else {
    $('splashScreen').classList.add('hidden');
    goToAuthStep('loginPage');
  }
});

window.addEventListener('beforeunload', () => {
  if (state.user) {
    db.collection('users').doc(state.user.uid)
      .update({ online: false, lastSeen: firebase.firestore.FieldValue.serverTimestamp() })
      .catch(() => {});
  }
});
