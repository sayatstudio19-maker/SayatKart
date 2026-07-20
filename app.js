/* ==========================================================
   SayatX — app.js
   Firebase (compat SDK) powered: phone/OTP auth, Firestore data,
   Storage uploads, realtime chat + post feed.
   ========================================================== */

/* ---------- 1. FIREBASE INIT ---------- */

const firebaseConfig = {
  apiKey: "AIzaSyDidasKeBJ2KMqXHLCuP41JngvPGKIUp70",
  authDomain: "sayaya-b71c0.firebaseapp.com",
  projectId: "sayaya-b71c0",
  storageBucket: "sayaya-b71c0.firebasestorage.app",
  messagingSenderId: "526286690702",
  appId: "1:526286690702:web:3a2b8570ea5d8c10622cdf",
  measurementId: "G-8HVWCTQ44F"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

/* ---------- 2. GLOBAL STATE ---------- */

const state = {
  user: null,            // firebase auth user
  profile: null,         // Firestore users/{uid} doc data
  activeChatId: null,
  activeChatOtherUid: null,
  activeChatOtherProfile: null,
  userCache: new Map(),  // uid -> profile, avoids repeat reads
  unlockedChats: new Set(), // chatIds unlocked this session
  pendingMediaFile: null,
  pendingMediaType: null, // 'image' | 'video'
  postImageFile: null,
  confirmationResult: null,
  currentUsersListener: null
};

const unsub = {}; // key -> unsubscribe function, for realtime listeners

function stopListener(key) {
  if (unsub[key]) { unsub[key](); delete unsub[key]; }
}

/* ---------- 3. GENERIC HELPERS ---------- */

function $(sel) { return document.querySelector(sel); }
function $all(sel) { return Array.from(document.querySelectorAll(sel)); }

function escapeHTML(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

// Turns plain URLs inside text into clickable links (text stays escaped).
function linkify(text) {
  const escaped = escapeHTML(text);
  const urlPattern = /((https?:\/\/|www\.)[^\s<]+)/gi;
  return escaped.replace(urlPattern, (match) => {
    const href = match.startsWith('http') ? match : `https://${match}`;
    return `<a href="${href}" target="_blank" rel="noopener noreferrer">${match}</a>`;
  });
}

function formatTime(ts) {
  if (!ts) return '';
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString([], { day: '2-digit', month: 'short' });
}

async function sha256(text) {
  const enc = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function generateUsername(phone) {
  const digits = phone.replace(/\D/g, '').slice(-4);
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `user${digits}${rand}`;
}

function toast(msg) {
  let el = $('#toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.style.cssText = `
      position:fixed; bottom:100px; left:50%; transform:translateX(-50%);
      background:#1F232C; color:#E8EAF0; padding:11px 18px; border-radius:999px;
      font-size:13.5px; z-index:999; box-shadow:0 8px 24px rgba(0,0,0,0.4);
      max-width:80%; text-align:center; border:1px solid #2A2F3A;
    `;
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.opacity = '1';
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.style.opacity = '0'; }, 2400);
}

function chatIdFor(uidA, uidB) {
  return [uidA, uidB].sort().join('_');
}

async function uploadFile(file, path) {
  const ref = storage.ref().child(path);
  await ref.put(file);
  return ref.getDownloadURL();
}

async function getUserProfile(uid) {
  if (state.userCache.has(uid)) return state.userCache.get(uid);
  const doc = await db.collection('users').doc(uid).get();
  const data = doc.exists ? { uid, ...doc.data() } : { uid, name: 'Unknown', username: 'unknown', photoURL: '' };
  state.userCache.set(uid, data);
  return data;
}

/* ---------- 4. SCREEN NAVIGATION ---------- */

const NAV_SCREENS = ['home', 'yourchat', 'feed']; // screens that show bottom-nav

function goToScreen(name) {
  $all('.screen').forEach(s => s.classList.remove('active'));
  const target = document.getElementById(`screen-${name}`);
  if (target) target.classList.add('active');

  $('#bottom-nav').classList.toggle('hidden', !NAV_SCREENS.includes(name));

  if (NAV_SCREENS.includes(name)) {
    $all('.nav-item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.target === name);
    });
  }

  // Stop listeners not relevant to the destination screen
  if (name !== 'chat') stopListener('messages');
  if (name !== 'home') stopListener('homeChats');
  if (name !== 'yourchat') stopListener('savedChats');
  if (name !== 'feed' && name !== 'createpost') { /* keep feed listener alive in background */ }

  closeAllDropdowns();
}

function closeAllDropdowns() {
  $all('.dropdown-menu').forEach(d => d.classList.add('hidden'));
}

/* ---------- 5. AUTH FLOW: MOBILE + OTP + PROFILE SETUP ---------- */

let currentAuthStep = 1;
let fullPhoneNumber = '';

function setAuthStep(step) {
  currentAuthStep = step;
  $all('.auth-form').forEach(f => f.classList.toggle('hidden', Number(f.dataset.step) !== step));
  $all('.auth-step-dot').forEach(d => d.classList.toggle('active', Number(d.dataset.step) === step));
}

function ensureRecaptcha() {
  if (!document.getElementById('recaptcha-container')) {
    const div = document.createElement('div');
    div.id = 'recaptcha-container';
    document.body.appendChild(div);
  }
  if (!window.recaptchaVerifier) {
    window.recaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptcha-container', {
      size: 'invisible'
    });
  }
  return window.recaptchaVerifier;
}

$('#step-mobile').addEventListener('submit', async (e) => {
  e.preventDefault();
  const raw = $('#mobile-number').value.trim();
  if (!raw) return toast('Enter your mobile number');
  const countryCode = $('.country-code').textContent.trim();
  fullPhoneNumber = `${countryCode}${raw.replace(/^0+/, '')}`;

  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true; btn.textContent = 'Sending...';

  try {
    const verifier = ensureRecaptcha();
    state.confirmationResult = await auth.signInWithPhoneNumber(fullPhoneNumber, verifier);
    $('#otp-mobile-display').textContent = fullPhoneNumber;
    setAuthStep(2);
    $all('.otp-digit')[0].focus();
  } catch (err) {
    console.error(err);
    toast(err.message || 'Could not send OTP. Try again.');
    if (window.recaptchaVerifier) {
      window.recaptchaVerifier.render().then(id => grecaptcha.reset(id));
    }
  } finally {
    btn.disabled = false; btn.textContent = 'Send OTP';
  }
});

// OTP digit auto-advance
$all('.otp-digit').forEach((input, idx, list) => {
  input.addEventListener('input', () => {
    input.value = input.value.replace(/\D/g, '').slice(0, 1);
    if (input.value && list[idx + 1]) list[idx + 1].focus();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Backspace' && !input.value && list[idx - 1]) list[idx - 1].focus();
  });
});

$('#step-otp').addEventListener('submit', async (e) => {
  e.preventDefault();
  const code = $all('.otp-digit').map(i => i.value).join('');
  if (code.length !== 6) return toast('Enter the full 6-digit code');
  if (!state.confirmationResult) return toast('Please request a new OTP');

  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true; btn.textContent = 'Verifying...';

  try {
    const result = await state.confirmationResult.confirm(code);
    await handlePostLogin(result.user);
  } catch (err) {
    console.error(err);
    toast('Invalid code. Try again.');
  } finally {
    btn.disabled = false; btn.textContent = 'Verify';
  }
});

$('#resend-otp-btn').addEventListener('click', async () => {
  if (!fullPhoneNumber) return;
  try {
    const verifier = ensureRecaptcha();
    state.confirmationResult = await auth.signInWithPhoneNumber(fullPhoneNumber, verifier);
    toast('Code resent');
  } catch (err) {
    toast('Could not resend code');
  }
});

async function handlePostLogin(firebaseUser) {
  state.user = firebaseUser;
  const doc = await db.collection('users').doc(firebaseUser.uid).get();

  if (doc.exists && doc.data().username) {
    state.profile = { uid: firebaseUser.uid, ...doc.data() };
    enterApp();
  } else {
    // New user — collect name + photo, username is pre-filled/auto-generated
    $('#signup-username').value = generateUsername(firebaseUser.phoneNumber || fullPhoneNumber);
    setAuthStep(3);
  }
}

// Profile photo picker (signup step 3)
$('#signup-photo-upload').addEventListener('click', () => $('#signup-photo-input').click());
$('#signup-photo-input').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  state.pendingSignupPhoto = file;
  const url = URL.createObjectURL(file);
  $('#signup-photo-preview').src = url;
  $('#signup-photo-preview').classList.remove('hidden');
  $('#signup-photo-placeholder').classList.add('hidden');
});

$('#step-profile').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('#signup-name').value.trim();
  const username = $('#signup-username').value.trim();
  if (!name) return toast('Enter your name');

  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true; btn.textContent = 'Setting up...';

  try {
    let photoURL = '';
    if (state.pendingSignupPhoto) {
      photoURL = await uploadFile(
        state.pendingSignupPhoto,
        `avatars/${state.user.uid}_${Date.now()}`
      );
    }

    const profileData = {
      uid: state.user.uid,
      phone: state.user.phoneNumber || fullPhoneNumber,
      name,
      username,
      username_lower: username.toLowerCase(),
      photoURL,
      lockPasswordHash: null,
      lockedChats: [],
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    await db.collection('users').doc(state.user.uid).set(profileData, { merge: true });
    state.profile = profileData;
    state.userCache.set(state.user.uid, profileData);
    enterApp();
  } catch (err) {
    console.error(err);
    toast('Something went wrong. Try again.');
  } finally {
    btn.disabled = false; btn.textContent = 'Continue to SayatX';
  }
});

/* ---------- 6. ENTER APP / AUTH STATE ---------- */

auth.onAuthStateChanged(async (fbUser) => {
  if (fbUser) {
    state.user = fbUser;
    const doc = await db.collection('users').doc(fbUser.uid).get();
    if (doc.exists && doc.data().username) {
      state.profile = { uid: fbUser.uid, ...doc.data() };
      enterApp();
    }
    // If no profile yet, stay on auth screen — user must complete step 3
    // (covers the case of a returning-but-incomplete signup only; normal
    // fresh visitors start at step 1 since there is no fbUser yet)
  } else {
    goToScreen('auth');
    setAuthStep(1);
  }
});

function enterApp() {
  $('#home-my-avatar').src = state.profile.photoURL || '';
  goToScreen('home');
  loadHomeChats();
  loadPostFeed();
}

/* ---------- 7. BOTTOM NAV + BACK BUTTONS ---------- */

$all('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    goToScreen(btn.dataset.target);
    if (btn.dataset.target === 'yourchat') loadSavedChats();
  });
});

$('#profile-back').addEventListener('click', () => goToScreen(state._returnScreen || 'home'));
$('#chat-back').addEventListener('click', () => goToScreen(state._chatReturnScreen || 'home'));
$('#create-post-back').addEventListener('click', () => goToScreen('feed'));
$('#my-posts-back').addEventListener('click', () => goToScreen('feed'));

/* ---------- 8. DROPDOWN MENUS (⋮) ---------- */

function wireDropdown(btnId, menuId) {
  const btn = $(btnId), menu = $(menuId);
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isHidden = menu.classList.contains('hidden');
    closeAllDropdowns();
    menu.classList.toggle('hidden', !isHidden);
  });
}
wireDropdown('#feed-menu-btn', '#feed-dropdown');
wireDropdown('#chat-menu-btn', '#chat-dropdown');
document.addEventListener('click', closeAllDropdowns);

$('#my-posts-btn').addEventListener('click', () => {
  closeAllDropdowns();
  loadMyPosts();
  goToScreen('myposts');
});

/* ---------- 9. HOME: USER SEARCH + CHAT LIST ---------- */

let searchDebounce;
$('#home-search-input').addEventListener('input', (e) => {
  clearTimeout(searchDebounce);
  const q = e.target.value.trim().toLowerCase();
  if (!q) {
    $('#home-search-results').classList.add('hidden');
    return;
  }
  searchDebounce = setTimeout(() => searchUsers(q), 250);
});

async function searchUsers(q) {
  const snap = await db.collection('users')
    .orderBy('username_lower')
    .startAt(q)
    .endAt(q + '\uf8ff')
    .limit(20)
    .get();

  const list = $('#home-search-results');
  list.innerHTML = '';
  list.classList.remove('hidden');

  if (snap.empty) {
    list.innerHTML = `<li class="empty-state"><p>No users found</p></li>`;
    return;
  }

  snap.forEach(doc => {
    const u = doc.data();
    if (u.uid === state.user.uid) return;
    const li = document.createElement('li');
    li.className = 'user-result-item';
    li.innerHTML = `
      <img class="avatar" src="${u.photoURL || ''}" alt="">
      <div class="chat-item-body">
        <span class="chat-item-name">${escapeHTML(u.name)}</span>
        <span class="chat-item-preview">@${escapeHTML(u.username)}</span>
      </div>`;
    li.addEventListener('click', () => openProfile(u.uid, 'home'));
    list.appendChild(li);
  });
}

function loadHomeChats() {
  stopListener('homeChats');
  const listEl = $('#home-chat-list');
  const q = db.collection('chats').where('participants', 'array-contains', state.user.uid)
    .orderBy('lastMessageTime', 'desc');

  unsub.homeChats = q.onSnapshot(async (snap) => {
    listEl.innerHTML = '';
    for (const doc of snap.docs) {
      const chat = doc.data();
      const otherUid = chat.participants.find(u => u !== state.user.uid);
      const other = await getUserProfile(otherUid);
      const unreadCount = (chat.unread && chat.unread[state.user.uid]) || 0;

      const li = document.createElement('li');
      li.className = 'chat-item' + (unreadCount > 0 ? ' unread' : '');
      li.innerHTML = `
        <img class="avatar" src="${other.photoURL || ''}" alt="">
        <div class="chat-item-body">
          <div class="chat-item-top">
            <span class="chat-item-name">${escapeHTML(other.name)}</span>
            <span class="chat-item-time">${formatTime(chat.lastMessageTime)}</span>
          </div>
          <div class="chat-item-bottom">
            <span class="chat-item-preview">${escapeHTML(chat.lastMessage || '')}</span>
            ${unreadCount > 0 ? `<span class="unread-badge">${unreadCount}</span>` : ''}
          </div>
        </div>`;
      li.addEventListener('click', () => openChat(otherUid, 'home'));
      listEl.appendChild(li);
    }
  });
}

/* ---------- 10. YOUR CHAT (SAVED) ---------- */

$('#saved-search-input').addEventListener('input', (e) => {
  const q = e.target.value.trim().toLowerCase();
  $all('#saved-chat-list .chat-item').forEach(item => {
    const name = item.querySelector('.chat-item-name').textContent.toLowerCase();
    item.style.display = name.includes(q) ? '' : 'none';
  });
});

function loadSavedChats() {
  stopListener('savedChats');
  const listEl = $('#saved-chat-list');
  const q = db.collection('users').doc(state.user.uid).collection('savedChats');

  unsub.savedChats = q.onSnapshot(async (snap) => {
    listEl.innerHTML = '';
    $('#saved-empty-state').classList.toggle('hidden', !snap.empty);

    for (const doc of snap.docs) {
      const otherUid = doc.id;
      const other = await getUserProfile(otherUid);
      const chatDoc = await db.collection('chats').doc(chatIdFor(state.user.uid, otherUid)).get();
      const chat = chatDoc.exists ? chatDoc.data() : {};

      const li = document.createElement('li');
      li.className = 'chat-item';
      li.innerHTML = `
        <img class="avatar" src="${other.photoURL || ''}" alt="">
        <div class="chat-item-body">
          <div class="chat-item-top">
            <span class="chat-item-name">${escapeHTML(other.name)}</span>
            <span class="chat-item-time">${formatTime(chat.lastMessageTime)}</span>
          </div>
          <div class="chat-item-bottom">
            <span class="chat-item-preview">${escapeHTML(chat.lastMessage || 'Say hi 👋')}</span>
          </div>
        </div>`;
      li.addEventListener('click', () => openChat(otherUid, 'yourchat'));
      listEl.appendChild(li);
    }
  });
}

/* ---------- 11. PROFILE SCREEN ---------- */

async function openProfile(uid, returnScreen) {
  state._returnScreen = returnScreen;
  const u = await getUserProfile(uid);
  $('#profile-topbar-name').textContent = u.username ? `@${u.username}` : 'Profile';
  $('#profile-avatar').src = u.photoURL || '';
  $('#profile-name').textContent = u.name || '';
  $('#profile-username').textContent = `@${u.username || ''}`;
  $('#profile-message-btn').onclick = () => openChat(uid, 'profile');

  const savedDoc = await db.collection('users').doc(state.user.uid).collection('savedChats').doc(uid).get();
  const saveBtn = $('#profile-save-chat-btn');
  saveBtn.textContent = savedDoc.exists ? 'Saved ✓' : 'Save Chat';
  saveBtn.onclick = async () => {
    if (savedDoc.exists) return;
    await db.collection('users').doc(state.user.uid).collection('savedChats').doc(uid).set({
      savedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    saveBtn.textContent = 'Saved ✓';
    toast('Chat saved');
  };

  const grid = $('#profile-posts-grid');
  grid.innerHTML = '';
  const postsSnap = await db.collection('posts').where('authorId', '==', uid)
    .orderBy('createdAt', 'desc').get();
  postsSnap.forEach(doc => {
    const p = doc.data();
    const div = document.createElement('div');
    div.className = 'post-grid-item';
    div.innerHTML = `<img class="post-grid-image" src="${p.imageURL || ''}" alt="">`;
    grid.appendChild(div);
  });

  goToScreen('profile');
}

$('#home-profile-btn').addEventListener('click', () => openProfile(state.user.uid, 'home'));

/* ---------- 12. POST FEED ---------- */

function loadPostFeed() {
  stopListener('postFeed');
  const listEl = $('#post-feed-list');
  const q = db.collection('posts').orderBy('createdAt', 'desc').limit(50);

  unsub.postFeed = q.onSnapshot(async (snap) => {
    listEl.innerHTML = '';
    for (const doc of snap.docs) {
      listEl.appendChild(await renderPostCard(doc.id, doc.data()));
    }
  });
}

async function renderPostCard(postId, p) {
  const author = await getUserProfile(p.authorId);
  const liked = (p.likes || []).includes(state.user.uid);

  const article = document.createElement('article');
  article.className = 'post-card';
  article.dataset.postId = postId;
  article.innerHTML = `
    <header class="post-card-header">
      <img class="avatar" src="${author.photoURL || ''}" alt="">
      <div class="post-card-user">
        <span class="post-card-name">${escapeHTML(author.name)}</span>
        <span class="post-card-time">${formatTime(p.createdAt)}</span>
      </div>
    </header>
    <h4 class="post-card-title">${linkify(p.title || '')}</h4>
    ${p.imageURL ? `<img class="post-card-image" src="${p.imageURL}" alt="">` : ''}
    <div class="post-card-actions">
      <button class="post-action like-btn ${liked ? 'liked' : ''}">
        <span class="icon">${liked ? '♥' : '♡'}</span><span class="count">${(p.likes || []).length}</span>
      </button>
      <button class="post-action comment-btn">
        <span class="icon">💬</span><span class="count">${p.commentsCount || 0}</span>
      </button>
      <button class="post-action share-btn"><span class="icon">↗</span></button>
    </div>`;

  article.querySelector('.post-card-name').addEventListener('click', () => openProfile(p.authorId, 'feed'));
  article.querySelector('.avatar').addEventListener('click', () => openProfile(p.authorId, 'feed'));

  article.querySelector('.like-btn').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const ref = db.collection('posts').doc(postId);
    if (liked) {
      await ref.update({ likes: firebase.firestore.FieldValue.arrayRemove(state.user.uid) });
    } else {
      await ref.update({ likes: firebase.firestore.FieldValue.arrayUnion(state.user.uid) });
    }
  });

  article.querySelector('.share-btn').addEventListener('click', () => {
    const url = `${location.origin}${location.pathname}#post-${postId}`;
    if (navigator.share) {
      navigator.share({ title: p.title, url });
    } else {
      navigator.clipboard.writeText(url);
      toast('Link copied');
    }
  });

  return article;
}

/* ---------- 13. CREATE POST ---------- */

$('#new-post-fab').addEventListener('click', () => {
  state.postImageFile = null;
  $('#post-image-preview').classList.add('hidden');
  $('#post-title-input').value = '';
  goToScreen('createpost');
});

$('#post-image-upload').addEventListener('click', () => $('#post-image-input').click());
$('#post-image-input').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  state.postImageFile = file;
  const preview = $('#post-image-preview');
  preview.src = URL.createObjectURL(file);
  preview.classList.remove('hidden');
});

$('#create-post-submit').addEventListener('click', async () => {
  const title = $('#post-title-input').value.trim();
  if (!title && !state.postImageFile) return toast('Add a photo or a title');

  const btn = $('#create-post-submit');
  btn.disabled = true; btn.textContent = 'Posting...';

  try {
    let imageURL = '';
    if (state.postImageFile) {
      imageURL = await uploadFile(state.postImageFile, `posts/${state.user.uid}_${Date.now()}`);
    }
    await db.collection('posts').add({
      authorId: state.user.uid,
      title,
      imageURL,
      likes: [],
      commentsCount: 0,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    toast('Posted');
    goToScreen('feed');
  } catch (err) {
    console.error(err);
    toast('Could not post. Try again.');
  } finally {
    btn.disabled = false; btn.textContent = 'Post';
  }
});

/* ---------- 14. MY POSTS GRID ---------- */

async function loadMyPosts() {
  const grid = $('#my-posts-grid');
  grid.innerHTML = '';
  const snap = await db.collection('posts').where('authorId', '==', state.user.uid)
    .orderBy('createdAt', 'desc').get();
  snap.forEach(doc => {
    const p = doc.data();
    const div = document.createElement('div');
    div.className = 'post-grid-item';
    div.innerHTML = `<img class="post-grid-image" src="${p.imageURL || ''}" alt="">`;
    grid.appendChild(div);
  });
}

/* ---------- 15. CHAT WINDOW ---------- */

async function openChat(otherUid, returnScreen) {
  state._chatReturnScreen = returnScreen;
  state.activeChatOtherUid = otherUid;
  state.activeChatId = chatIdFor(state.user.uid, otherUid);

  const other = await getUserProfile(otherUid);
  state.activeChatOtherProfile = other;
  $('#chat-header-avatar').src = other.photoURL || '';
  $('#chat-header-name').textContent = other.name || '';

  // Ensure the chat document exists
  const chatRef = db.collection('chats').doc(state.activeChatId);
  const chatDoc = await chatRef.get();
  if (!chatDoc.exists) {
    await chatRef.set({
      participants: [state.user.uid, otherUid],
      lastMessage: '',
      lastMessageTime: firebase.firestore.FieldValue.serverTimestamp(),
      unread: { [state.user.uid]: 0, [otherUid]: 0 }
    });
  }

  // Reset my unread counter for this chat
  chatRef.update({ [`unread.${state.user.uid}`]: 0 }).catch(() => {});

  goToScreen('chat');
  checkChatLock();
}

function checkChatLock() {
  const lockedChats = state.profile.lockedChats || [];
  const isLocked = lockedChats.includes(state.activeChatId) && !state.unlockedChats.has(state.activeChatId);

  $('#chat-lock-gate').classList.toggle('hidden', !isLocked);
  $('#chat-message-list').classList.toggle('hidden', isLocked);
  $('.chat-input-bar').classList.toggle('hidden', isLocked);

  if (!isLocked) listenToMessages();
}

$('#lock-gate-submit').addEventListener('click', async () => {
  const val = $('#lock-gate-password').value;
  if (!val) return;
  const hash = await sha256(val);
  if (hash === state.profile.lockPasswordHash) {
    state.unlockedChats.add(state.activeChatId);
    $('#lock-gate-password').value = '';
    checkChatLock();
  } else {
    toast('Wrong password');
  }
});

function listenToMessages() {
  stopListener('messages');
  const listEl = $('#chat-message-list');
  const q = db.collection('chats').doc(state.activeChatId)
    .collection('messages').orderBy('timestamp', 'asc');

  unsub.messages = q.onSnapshot(async (snap) => {
    listEl.innerHTML = '';
    const toMarkSeen = [];

    snap.forEach(doc => {
      const m = doc.data();
      if ((m.deletedFor || []).includes(state.user.uid)) return;

      const isMine = m.senderId === state.user.uid;
      if (!isMine && !(m.seenBy || []).includes(state.user.uid)) toMarkSeen.push(doc.id);

      listEl.appendChild(renderMessageRow(doc.id, m, isMine));
    });

    listEl.scrollTop = listEl.scrollHeight;

    if (toMarkSeen.length) {
      const batch = db.batch();
      toMarkSeen.forEach(id => {
        batch.update(
          db.collection('chats').doc(state.activeChatId).collection('messages').doc(id),
          { seenBy: firebase.firestore.FieldValue.arrayUnion(state.user.uid) }
        );
      });
      batch.commit().catch(() => {});
    }
  });
}

function renderMessageRow(msgId, m, isMine) {
  const row = document.createElement('div');
  row.className = `message-row ${isMine ? 'sent' : 'received'}`;
  row.dataset.messageId = msgId;

  const seen = isMine && (m.seenBy || []).includes(state.activeChatOtherUid);
  const bodyText = m.deletedForEveryone ? 'This message was deleted' : linkify(m.text || '');

  row.innerHTML = `
    <div class="message-bubble">
      ${!m.deletedForEveryone && m.imageURL ? `<img class="message-image" src="${m.imageURL}" alt="">` : ''}
      ${!m.deletedForEveryone && m.videoURL ? `<video class="message-video" src="${m.videoURL}" controls></video>` : ''}
      ${bodyText ? `<p class="message-text">${bodyText}</p>` : ''}
      <span class="message-time">
        ${formatTime(m.timestamp)}
        ${isMine ? `<span class="tick ${seen ? 'seen' : ''}">✓✓</span>` : ''}
      </span>
    </div>
    ${isMine && !m.deletedForEveryone ? `
    <div class="message-action-menu hidden">
      <button class="action-item" data-action="delete-me">Delete for me</button>
      <button class="action-item" data-action="delete-everyone">Delete for everyone</button>
    </div>` : (!m.deletedForEveryone ? `
    <div class="message-action-menu hidden">
      <button class="action-item" data-action="delete-me">Delete for me</button>
    </div>` : '')}
  `;

  attachLongPress(row);
  return row;
}

function attachLongPress(row) {
  let pressTimer;
  const menu = row.querySelector('.message-action-menu');
  if (!menu) return;

  const show = () => { $all('.message-action-menu').forEach(m => m.classList.add('hidden')); menu.classList.remove('hidden'); };
  row.addEventListener('pointerdown', () => { pressTimer = setTimeout(show, 450); });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => row.addEventListener(ev, () => clearTimeout(pressTimer)));
  row.addEventListener('contextmenu', (e) => { e.preventDefault(); show(); });

  menu.addEventListener('click', async (e) => {
    const action = e.target.dataset.action;
    if (!action) return;
    const msgId = row.dataset.messageId;
    const ref = db.collection('chats').doc(state.activeChatId).collection('messages').doc(msgId);

    if (action === 'delete-me') {
      await ref.update({ deletedFor: firebase.firestore.FieldValue.arrayUnion(state.user.uid) });
    } else if (action === 'delete-everyone') {
      await ref.update({ deletedForEveryone: true, text: '', imageURL: null, videoURL: null });
    }
    menu.classList.add('hidden');
  });
}

/* ---------- 16. SENDING MESSAGES ---------- */

$('#chat-attach-btn').addEventListener('click', () => $('#chat-media-input').click());
$('#chat-media-input').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  state.pendingMediaFile = file;
  state.pendingMediaType = file.type.startsWith('video') ? 'video' : 'image';

  const bar = $('#chat-media-preview');
  const img = $('#chat-media-preview-image');
  const vid = $('#chat-media-preview-video');
  bar.classList.remove('hidden');
  const url = URL.createObjectURL(file);
  if (state.pendingMediaType === 'video') {
    vid.src = url; vid.classList.remove('hidden'); img.classList.add('hidden');
  } else {
    img.src = url; img.classList.remove('hidden'); vid.classList.add('hidden');
  }
});

$('#chat-media-cancel').addEventListener('click', () => {
  state.pendingMediaFile = null;
  $('#chat-media-preview').classList.add('hidden');
  $('#chat-media-input').value = '';
});

async function sendMessage() {
  const textInput = $('#chat-text-input');
  const text = textInput.value.trim();
  if (!text && !state.pendingMediaFile) return;

  const chatRef = db.collection('chats').doc(state.activeChatId);
  const msg = {
    senderId: state.user.uid,
    text: text || '',
    imageURL: null,
    videoURL: null,
    seenBy: [],
    deletedFor: [],
    deletedForEveryone: false,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  };

  textInput.value = '';
  const mediaFile = state.pendingMediaFile;
  const mediaType = state.pendingMediaType;
  state.pendingMediaFile = null;
  $('#chat-media-preview').classList.add('hidden');

  try {
    if (mediaFile) {
      const url = await uploadFile(mediaFile, `chatMedia/${state.activeChatId}/${Date.now()}_${mediaFile.name}`);
      if (mediaType === 'video') msg.videoURL = url; else msg.imageURL = url;
    }

    await chatRef.collection('messages').add(msg);

    const preview = mediaFile ? (mediaType === 'video' ? '📹 Video' : '📷 Photo') : text;
    await chatRef.update({
      lastMessage: preview,
      lastMessageTime: firebase.firestore.FieldValue.serverTimestamp(),
      [`unread.${state.activeChatOtherUid}`]: firebase.firestore.FieldValue.increment(1)
    });
  } catch (err) {
    console.error(err);
    toast('Message failed to send');
  }
}

$('#chat-send-btn').addEventListener('click', sendMessage);
$('#chat-text-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); sendMessage(); }
});

/* ---------- 17. DARK/LIGHT TOGGLE ---------- */

$('#chat-theme-toggle').addEventListener('click', () => {
  closeAllDropdowns();
  const isLight = document.documentElement.classList.toggle('theme-light');
  localStorage.setItem('sayatx-theme', isLight ? 'light' : 'dark');
});

(function initTheme() {
  if (localStorage.getItem('sayatx-theme') === 'light') {
    document.documentElement.classList.add('theme-light');
  }
})();

/* ---------- 18. LOCK CHAT ---------- */

$('#chat-lock-toggle').addEventListener('click', async () => {
  closeAllDropdowns();
  const lockedChats = state.profile.lockedChats || [];
  const isLocked = lockedChats.includes(state.activeChatId);

  if (isLocked) {
    // Unlock permanently
    await db.collection('users').doc(state.user.uid).update({
      lockedChats: firebase.firestore.FieldValue.arrayRemove(state.activeChatId)
    });
    state.profile.lockedChats = lockedChats.filter(id => id !== state.activeChatId);
    toast('Chat unlocked');
    return;
  }

  if (!state.profile.lockPasswordHash) {
    $('#set-password-modal').classList.remove('hidden');
  } else {
    await lockCurrentChat();
  }
});

async function lockCurrentChat() {
  await db.collection('users').doc(state.user.uid).update({
    lockedChats: firebase.firestore.FieldValue.arrayUnion(state.activeChatId)
  });
  state.profile.lockedChats = [...(state.profile.lockedChats || []), state.activeChatId];
  toast('Chat locked');
  checkChatLock();
}

$('#set-password-cancel').addEventListener('click', () => {
  $('#set-password-modal').classList.add('hidden');
  $('#set-password-answer').value = '';
});

$('#set-password-confirm').addEventListener('click', async () => {
  const answer = $('#set-password-answer').value.trim();
  if (!answer) return toast('Enter an answer');

  const hash = await sha256(answer);
  await db.collection('users').doc(state.user.uid).update({ lockPasswordHash: hash });
  state.profile.lockPasswordHash = hash;

  $('#set-password-modal').classList.add('hidden');
  $('#set-password-answer').value = '';

  await lockCurrentChat();
});

/* ---------- 19. INIT ---------- */

goToScreen('auth');
setAuthStep(1);
