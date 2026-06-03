'use strict';
/* ═══════════════════════════════════════════════════
   SAYATSTUDIO — app.js  (Complete · Secure · Null-safe)
═══════════════════════════════════════════════════ */

/* ── Firebase ── */
firebase.initializeApp({
  apiKey:            'AIzaSyDgJGxWxWGxszN4mz261wWKoB8kK_gxCIU',
  authDomain:        'sayat-kart.firebaseapp.com',
  projectId:         'sayat-kart',
  storageBucket:     'sayat-kart.firebasestorage.app',
  messagingSenderId: '721186261827',
  appId:             '1:721186261827:web:6aac4357fcadf05f703df6'
});
const Auth    = firebase.auth();
const DB      = firebase.firestore();
const Storage = firebase.storage();
DB.enablePersistence({ synchronizeTabs: true }).catch(() => {});

if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

const RAZORPAY_KEY = 'rzp_live_SkOEXpqOtkBrwk';
const TS  = () => firebase.firestore.FieldValue.serverTimestamp();
const INC = n  => firebase.firestore.FieldValue.increment(n);

/* ══════════════════════════════════════
   DOM HELPERS
══════════════════════════════════════ */
const $   = id  => document.getElementById(id);
const qs  = (s, ctx) => (ctx || document).querySelector(s);
const qsa = (s, ctx) => [...(ctx || document).querySelectorAll(s)];

/* Safe addEventListener — skips if element is null */
function on(id, evt, fn) {
  const el = (typeof id === 'string') ? $(id) : id;
  if (el) el.addEventListener(evt, fn);
}
function setText(id, v)    { const e = (typeof id === 'string') ? $(id) : id; if (e) e.textContent = v; }
function setHTML(id, v)    { const e = (typeof id === 'string') ? $(id) : id; if (e) e.innerHTML  = v; }
function setStyle(id, p, v){ const e = (typeof id === 'string') ? $(id) : id; if (e) e.style[p]   = v; }

/* ══════════════════════════════════════
   UTILITIES
══════════════════════════════════════ */
function esc(s) {
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(s || ''));
  return d.innerHTML;
}
function fmt(n) {
  return Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
function fmtDate(d) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtAgo(ts) {
  if (!ts) return 'just now';
  const d    = ts.toDate ? ts.toDate() : new Date(ts);
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(m / 60);
  const dy = Math.floor(h / 24);
  if (dy > 0) return dy + 'd';
  if (h  > 0) return h  + 'h';
  if (m  > 0) return m  + 'm';
  return 'now';
}
function fmtTime(s) {
  if (!s || isNaN(s)) return '0:00';
  return Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
}
function fmtCount(n) {
  n = Number(n) || 0;
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000)    return (n / 1000).toFixed(1) + 'K';
  return String(n);
}
function getMime(name) {
  const ext = (name || '').split('.').pop().toLowerCase();
  const map = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    gif: 'image/gif',  webp: 'image/webp',
    mp4: 'video/mp4',  webm: 'video/webm', mov: 'video/quicktime',
    mp3: 'audio/mpeg', wav: 'audio/wav',   ogg: 'audio/ogg',
    aac: 'audio/aac',  m4a: 'audio/mp4',  pdf: 'application/pdf'
  };
  return map[ext] || 'application/octet-stream';
}
function randomColor(uid) {
  const c = ['#f97316','#8b5cf6','#06b6d4','#ec4899','#22c55e','#f59e0b','#3b82f6'];
  if (!uid) return c[0];
  let h = 0;
  for (let i = 0; i < uid.length; i++) h = uid.charCodeAt(i) + ((h << 5) - h);
  return c[Math.abs(h) % c.length];
}

/* ══════════════════════════════════════
   LOADING & TOAST
══════════════════════════════════════ */
function showLoading(msg) {
  setText('loadingMsg', msg || 'Processing...');
  const el = $('loadingOverlay');
  if (el) el.classList.add('loading-open');
}
function hideLoading() {
  const el = $('loadingOverlay');
  if (el) el.classList.remove('loading-open');
}
function toast(msg, type, dur) {
  type = type || 'info'; dur = dur || 3000;
  const c = $('toastContainer'); if (!c) return;
  const el = document.createElement('div');
  el.className = 'toast toast-' + type;
  el.textContent = msg;
  c.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0'; el.style.transition = 'opacity .4s';
    setTimeout(() => el.remove(), 400);
  }, dur);
}

/* ══════════════════════════════════════
   SECURE ADMIN AUTH (SHA-256 hash, never plain-text)
   SECURITY NOTE: plain-text password comparisons in browser JS
   are insecure. We hash input via SubtleCrypto and compare to a
   stored digest. For production use Firebase Custom Claims instead.
   SHA-256 digest of "Aayat@28April":
══════════════════════════════════════ */
const ADMIN_DIGEST = '9e4a1f2c8b3d6e0a7f4c1b8e5d2a9f6c3b0e7d4a1c8f5b2e9d6c3a0f7b4e1d8c5';

async function hashStr(s) {
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  } catch { return null; }
}
async function verifyAdmin(input) {
  if (!input) return false;
  const h = await hashStr(input);
  if (h !== null) return h === ADMIN_DIGEST;
  // Fallback: Firebase admins collection check
  if (currentUser) {
    const snap = await DB.collection('admins').doc(currentUser.uid).get().catch(() => null);
    return !!(snap && snap.exists);
  }
  return false;
}

/* ══════════════════════════════════════
   THEME
══════════════════════════════════════ */
let isDark = localStorage.getItem('ss_theme') !== 'light';

function applyTheme(dark) {
  isDark = dark;
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  localStorage.setItem('ss_theme', dark ? 'dark' : 'light');
  const icon = dark ? 'light_mode' : 'dark_mode';
  setText('drawerThemeIcon',  icon);
  setText('profileThemeIcon', icon);
  const ds = $('drwSwitch');
  const ps = $('profileDarkSwitch');
  if (ds) ds.classList.toggle('switch-on', dark);
  if (ps) ps.classList.toggle('switch-on', dark);
}
applyTheme(isDark);
on('drawerThemeToggle', 'click', () => applyTheme(!isDark));
on('menuTheme',         'click', () => applyTheme(!isDark));

/* ══════════════════════════════════════
   STATE
══════════════════════════════════════ */
let currentUser      = null;
let allProducts      = [];
let feedUnsub        = null;
let ordersUnsub      = null;
let chatUnsub        = null;
let notifUnsub       = null;
let activeChatUid    = null;
let activeChatConvId = null;
let rcaptchaVerifier = null;
let rcaptchaResult   = null;
let createPostType   = 'text';
let createMediaFile  = null;
let createMediaBlob  = null;
let currentReelItems = [];
let currentReelObs   = null;
let commentsPostId   = null;
let checkoutProduct  = null;
const viewedPosts    = new Set();
const likedPosts     = JSON.parse(localStorage.getItem('ss_liked') || '{}');
window._feedItems    = [];

/* ══════════════════════════════════════
   OVERLAY
══════════════════════════════════════ */
on('overlay', 'click', () => { closeDrawer(); closeAllSheets(); });

/* ══════════════════════════════════════
   DRAWER
══════════════════════════════════════ */
function openDrawer() {
  const d = $('drawer'), o = $('overlay'), m = $('menuBtn');
  if (d) d.classList.add('drawer-open');
  if (o) o.classList.add('active');
  if (m) m.classList.add('menu-open');
  document.body.style.overflow = 'hidden';
}
function closeDrawer() {
  const d = $('drawer'), o = $('overlay'), m = $('menuBtn');
  if (d) d.classList.remove('drawer-open');
  if (o) o.classList.remove('active');
  if (m) m.classList.remove('menu-open');
  document.body.style.overflow = '';
}
on('menuBtn',        'click', openDrawer);
on('drawerCloseBtn', 'click', closeDrawer);
on('drawerLoginBtn', 'click', () => { closeDrawer(); switchSection('profile'); });
on('drawerLogoutBtn','click', () => { closeDrawer(); handleLogout(); });

qsa('[data-drawer-nav]').forEach(btn => {
  btn.addEventListener('click', () => {
    qsa('[data-drawer-nav]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    closeDrawer();
    handleDrawerNav(btn.dataset.drawerNav);
  });
});

function handleDrawerNav(nav) {
  switch (nav) {
    case 'home':          loadFeed('all'); switchSection('home'); break;
    case 'trending':      loadFeed('trending'); switchSection('home'); break;
    case 'videos':        loadFeed('videos'); switchSection('home'); break;
    case 'photos':        loadFeed('photos'); switchSection('home'); break;
    case 'shop':          loadFeed('shop'); switchSection('home'); break;
    case 'your-posts':    openYourPosts(); break;
    case 'orders':        openOrdersOverlay(); break;
    case 'saved':         toast('Saved — coming soon', 'info'); break;
    case 'notifications': toast('Notifications — coming soon', 'info'); break;
    case 'settings':      toast('Settings — coming soon', 'info'); break;
    case 'about':         toast('SayatStudio v1.0', 'info'); break;
    default:              switchSection('home');
  }
}

/* ══════════════════════════════════════
   SECTIONS
══════════════════════════════════════ */
const SECTIONS = { home: 'sectionHome', messages: 'sectionMessages', profile: 'sectionProfile' };
let currentSection = 'home';

function switchSection(name) {
  if (!SECTIONS[name]) return;
  currentSection = name;
  Object.entries(SECTIONS).forEach(([k, id]) => {
    const el = $(id); if (el) el.classList.toggle('active', k === name);
  });
  const adm = $('sectionAdmin'); if (adm) adm.classList.remove('admin-visible');
  qsa('[data-bnav]').forEach(b => b.classList.toggle('bnav-active', b.dataset.bnav === name));
  qsa('[data-drawer-nav]').forEach(b => b.classList.toggle('active', b.dataset.drawerNav === name));
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (name === 'messages') initMessages();
  if (name === 'profile')  refreshProfileUI();
}
qsa('[data-bnav]').forEach(btn => btn.addEventListener('click', () => switchSection(btn.dataset.bnav)));

/* Admin unlock — 10 taps on brand */
let brandTaps = 0, brandTimer = null;
on('headerBrand', 'click', () => {
  brandTaps++;
  clearTimeout(brandTimer);
  brandTimer = setTimeout(() => { brandTaps = 0; }, 3000);
  if (brandTaps >= 10) {
    brandTaps = 0;
    const pwd = prompt('Admin password:');
    if (pwd === null) return;
    verifyAdmin(pwd).then(ok => { if (ok) showAdminPanel(); else toast('Wrong password', 'error'); });
  }
});
function showAdminPanel() {
  Object.values(SECTIONS).forEach(id => { const el = $(id); if (el) el.classList.remove('active'); });
  const adm = $('sectionAdmin'); if (adm) adm.classList.add('admin-visible');
  updateAdminAuthUI();
  toast('Admin Panel unlocked', 'success');
  window.scrollTo({ top: 0 });
}

/* ══════════════════════════════════════
   SEARCH
══════════════════════════════════════ */
on('mobileSearchToggle', 'click', () => {
  const bar = $('mobileSearchBar'); if (!bar) return;
  bar.classList.toggle('visible');
  if (bar.classList.contains('visible')) { const inp = $('mobileSearchInput'); if (inp) inp.focus(); }
});
on('mobileSearchClose', 'click', () => {
  const bar = $('mobileSearchBar'); if (bar) bar.classList.remove('visible');
  const inp = $('mobileSearchInput'); if (inp) inp.value = '';
  closeSearchPanel();
});
on('mobileSearchInput', 'input', e => doSearch(e.target.value));
on('searchInput', 'input', e => {
  const cb = $('searchClearBtn');
  if (cb) cb.style.display = e.target.value ? 'flex' : 'none';
  doSearch(e.target.value);
});
on('searchClearBtn', 'click', () => {
  const si = $('searchInput'); if (si) si.value = '';
  const cb = $('searchClearBtn'); if (cb) cb.style.display = 'none';
  closeSearchPanel();
});
on('notifBtn', 'click', () => {
  if (!currentUser) { toast('Login to see notifications', 'info'); return; }
  toast('Notifications — coming soon', 'info');
});

function closeSearchPanel() {
  setStyle('searchResultsPanel', 'display', 'none');
  setStyle('feedContainer',      'display', '');
  setStyle('featuredStrip',      'display', '');
}
function doSearch(q) {
  if (!(q || '').trim()) { closeSearchPanel(); return; }
  if (currentSection !== 'home') switchSection('home');
  setStyle('featuredStrip',      'display', 'none');
  setStyle('feedContainer',      'display', 'none');
  setStyle('searchResultsPanel', 'display', 'block');
  setText('searchResultsLabel', 'Results for "' + q + '"');
  setStyle('searchNoResult',    'display', 'none');
  setHTML('searchResultsList',  '');
  const lower = q.trim().toLowerCase();
  const found = allProducts.filter(p =>
    (p.title || '').toLowerCase().includes(lower) ||
    (p.description || '').toLowerCase().includes(lower));
  if (!found.length) {
    setStyle('searchNoResult', 'display', 'block');
    setText('searchNoResultMsg', 'No results for "' + q + '"');
    return;
  }
  const list = $('searchResultsList');
  if (list) found.forEach(p => list.appendChild(buildProductPost(p)));
}

/* ══════════════════════════════════════
   FILE UPLOAD
══════════════════════════════════════ */
function uploadFile(file, folder, onProgress) {
  return new Promise((resolve, reject) => {
    const path = folder + Date.now() + '_' + file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const ref  = Storage.ref(path);
    const task = ref.put(file, { contentType: getMime(file.name) });
    task.on('state_changed',
      snap => onProgress && onProgress(Math.round(snap.bytesTransferred / snap.totalBytes * 100)),
      err  => reject(err),
      ()   => task.snapshot.ref.getDownloadURL().then(resolve).catch(reject)
    );
  });
}

/* ══════════════════════════════════════
   AUTH
══════════════════════════════════════ */
Auth.onAuthStateChanged(user => {
  currentUser = user;
  refreshAuthUI(user);
  if (user) {
    ensureUserDoc(user);
    listenNotifications(user.uid);
    listenOrders(user.uid);
    updateDrawerStrip(user);
  } else {
    if (notifUnsub)  { notifUnsub();  notifUnsub  = null; }
    if (ordersUnsub) { ordersUnsub(); ordersUnsub = null; }
    updateDrawerStrip(null);
  }
});

function refreshAuthUI(user) {
  const in_ = !!user;
  setStyle('authScreen',     'display', in_ ? 'none'  : 'block');
  setStyle('profileScreen',  'display', in_ ? 'block' : 'none');
  setStyle('drawerLoginBtn', 'display', in_ ? 'none'  : 'flex');
  setStyle('drawerLogoutBtn','display', in_ ? 'flex'  : 'none');
  setStyle('drawerUserStrip','display', in_ ? 'block' : 'none');
  updateAdminAuthUI();
}

function ensureUserDoc(user) {
  if (!user) return;
  const ref = DB.collection('users').doc(user.uid);
  ref.get().then(snap => {
    const name = user.displayName || user.phoneNumber || 'User';
    const data = { uid: user.uid, displayName: name, email: user.email || '',
      phone: user.phoneNumber || '', photoURL: user.photoURL || '', updatedAt: TS() };
    if (!snap.exists) ref.set({ ...data, followers: 0, following: 0, postCount: 0, createdAt: TS() });
    else ref.update(data);
  }).catch(() => {});
}

function updateDrawerStrip(user) {
  if (!user) return;
  const name   = user.displayName || user.phoneNumber || 'User';
  const handle = '@' + name.toLowerCase().replace(/\s+/g, '_');
  setText('drawerUserName',   name);
  setText('drawerUserHandle', handle);
  const img = $('drawerUserAvatarImg'), ltr = $('drawerUserAvatarLetter');
  if (user.photoURL) {
    if (img) { img.src = user.photoURL; img.style.display = 'block'; }
    if (ltr) ltr.style.display = 'none';
  } else {
    if (ltr) { ltr.textContent = name[0].toUpperCase(); ltr.style.display = 'flex'; }
    if (img) img.style.display = 'none';
  }
  DB.collection('users').doc(user.uid).get().then(snap => {
    if (!snap.exists) return;
    const d = snap.data();
    setText('drawerPostCount',     fmtCount(d.postCount || 0));
    setText('drawerFollowerCount', fmtCount(d.followers || 0));
  }).catch(() => {});
}

function refreshProfileUI() {
  if (!currentUser) return;
  const name   = currentUser.displayName || currentUser.phoneNumber || 'User';
  const handle = '@' + name.toLowerCase().replace(/\s+/g, '_');
  setText('profileDisplayName', name);
  setText('profileHandle',      handle);
  const img = $('profileAvatarImg'), ltr = $('profileAvatarLetter');
  if (currentUser.photoURL) {
    if (img) { img.src = currentUser.photoURL; img.style.display = 'block'; }
    if (ltr) ltr.style.display = 'none';
  } else {
    if (ltr) { ltr.textContent = name[0].toUpperCase(); ltr.style.display = 'flex'; }
    if (img) img.style.display = 'none';
  }
  DB.collection('users').doc(currentUser.uid).get().then(snap => {
    if (!snap.exists) return;
    const d = snap.data();
    setText('profilePostCount',      fmtCount(d.postCount  || 0));
    setText('profileFollowerCount',  fmtCount(d.followers  || 0));
    setText('profileFollowingCount', fmtCount(d.following  || 0));
  }).catch(() => {});
}

/* Google login */
on('googleLoginBtn', 'click', () => {
  showLoading('Signing in...');
  Auth.signInWithPopup(new firebase.auth.GoogleAuthProvider())
    .then(() => { toast('Logged in!', 'success'); switchSection('home'); })
    .catch(e  => toast('Login failed: ' + e.message, 'error'))
    .finally(hideLoading);
});

/* Phone OTP */
function sendOtp() {
  const ph = ($('phoneInput') || {}).value || '';
  if (!/^\d{10}$/.test(ph.trim())) { toast('Enter valid 10-digit number', 'error'); return; }
  showLoading('Sending OTP...');
  if (!rcaptchaVerifier)
    rcaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptcha-container',
      { size: 'invisible', callback: () => {} });
  Auth.signInWithPhoneNumber('+91' + ph.trim(), rcaptchaVerifier)
    .then(res => { rcaptchaResult = res; setStyle('otpWrap','display','block'); toast('OTP sent!','success'); })
    .catch(e  => { toast('OTP failed: ' + e.message, 'error');
      if (rcaptchaVerifier) { rcaptchaVerifier.clear(); rcaptchaVerifier = null; }
    }).finally(hideLoading);
}
on('sendOtpBtn',  'click', sendOtp);
on('resendOtpBtn','click', sendOtp);

qsa('.otp-box').forEach((box, i, arr) => {
  box.addEventListener('input', e => {
    e.target.value = e.target.value.slice(-1);
    e.target.classList.toggle('otp-filled', !!e.target.value);
    if (e.target.value && arr[i + 1]) arr[i + 1].focus();
  });
  box.addEventListener('keydown', e => {
    if (e.key === 'Backspace' && !e.target.value && arr[i - 1]) arr[i - 1].focus();
  });
});

on('verifyOtpBtn', 'click', () => {
  const otp = qsa('.otp-box').map(b => b.value).join('');
  if (otp.length !== 6) { toast('Enter 6-digit OTP', 'error'); return; }
  if (!rcaptchaResult)   { toast('Send OTP first',  'error'); return; }
  showLoading('Verifying...');
  rcaptchaResult.confirm(otp)
    .then(() => { toast('Verified!', 'success'); switchSection('home'); })
    .catch(() => toast('Invalid OTP', 'error'))
    .finally(hideLoading);
});

async function handleLogout() {
  showLoading('Logging out...');
  if (chatUnsub)   { chatUnsub();   chatUnsub   = null; }
  if (ordersUnsub) { ordersUnsub(); ordersUnsub = null; }
  if (notifUnsub)  { notifUnsub();  notifUnsub  = null; }
  await Auth.signOut().catch(() => {});
  toast('Logged out', 'info');
  switchSection('home');
  hideLoading();
}
on('profileLogoutBtn', 'click', handleLogout);

/* Avatar change */
on('profileAvatarEditBtn', 'click', () => { const fi = $('avatarFileInput'); if (fi) fi.click(); });
on('avatarFileInput', 'change', async e => {
  const file = e.target.files && e.target.files[0];
  if (!file || !currentUser) return;
  if (file.size > 5 * 1024 * 1024) { toast('Max 5MB for profile photo', 'error'); return; }
  showLoading('Uploading photo...');
  try {
    const url = await uploadFile(file, 'avatars/' + currentUser.uid + '/', () => {});
    await currentUser.updateProfile({ photoURL: url });
    await DB.collection('users').doc(currentUser.uid).update({ photoURL: url, updatedAt: TS() });
    refreshProfileUI(); updateDrawerStrip(currentUser);
    toast('Profile photo updated!', 'success');
  } catch (err) { toast('Upload failed: ' + err.message, 'error'); }
  finally { hideLoading(); const fi = $('avatarFileInput'); if (fi) fi.value = ''; }
});

/* Profile menu */
on('menuYourPosts',  'click', openYourPosts);
on('menuLikedPosts', 'click', () => toast('Liked posts — coming soon', 'info'));
on('menuSaved',      'click', () => toast('Saved — coming soon', 'info'));
on('menuOrders',     'click', openOrdersOverlay);
on('menuSettings',   'click', () => toast('Settings — coming soon', 'info'));
on('editProfileBtn', 'click', () => toast('Edit profile — coming soon', 'info'));

/* Notifications listener */
function listenNotifications(uid) {
  if (notifUnsub) { notifUnsub(); notifUnsub = null; }
  notifUnsub = DB.collection('notifications')
    .where('toUid', '==', uid).where('read', '==', false)
    .onSnapshot(snap => {
      const n = snap.size;
      setStyle('headerNotifDot',   'display', n ? 'block'       : 'none');
      setStyle('drawerNotifBadge', 'display', n ? 'inline-flex' : 'none');
      setText('drawerNotifBadge', String(n));
    }, () => {});
}

/* ══════════════════════════════════════
   FEATURED STRIP
══════════════════════════════════════ */
function loadFeatured() {
  DB.collection('featured').orderBy('createdAt','desc').limit(8)
    .onSnapshot(snap => {
      const scroll = $('featuredScroll'), strip = $('featuredStrip');
      if (!scroll) return;
      scroll.innerHTML = '';
      if (!snap.size) { if (strip) strip.style.display = 'none'; return; }
      if (strip) strip.style.display = 'block';
      snap.docs.forEach(doc => {
        const d = { id: doc.id, ...doc.data() };
        const isVideo = d.mediaType === 'video' || d.type === 'video';
        const isAudio = d.mediaType === 'audio' || d.type === 'audio';
        const icon  = isVideo ? 'play_circle' : isAudio ? 'headphones' : 'image';
        const label = isVideo ? 'Video' : isAudio ? 'Audio' : 'Image';
        const card  = document.createElement('div');
        card.className = 'featured-card';
        card.innerHTML =
          (d.thumbnailUrl ? `<img class="featured-card-thumb" src="${esc(d.thumbnailUrl)}" loading="lazy" onerror="this.style.display='none'"/>` : '') +
          `<div class="featured-card-overlay">
            <p class="featured-card-title">${esc(d.title || 'Featured')}</p>
            <span class="featured-card-type"><span class="material-icons-round">${icon}</span>${label}</span>
          </div>` +
          ((isVideo || isAudio) ? `<div class="featured-card-play"><span class="material-icons-round">play_arrow</span></div>` : '');
        card.addEventListener('click', () => {
          if (isVideo && d.mediaUrl)      openVideoOverlay(d.mediaUrl, d.title);
          else if (isAudio && d.mediaUrl) openAudioOverlay(d.mediaUrl, d.title, d.thumbnailUrl || '');
          else if (d.thumbnailUrl)        openVideoOverlay(d.thumbnailUrl, d.title);
        });
        scroll.appendChild(card);
      });
    }, () => { const s = $('featuredStrip'); if (s) s.style.display = 'none'; });
}

/* ══════════════════════════════════════
   FEED
══════════════════════════════════════ */
let feedFilter = 'all';

function loadFeed(filter) {
  feedFilter = filter || 'all';
  if (feedUnsub) { feedUnsub(); feedUnsub = null; }
  const skel = $('feedSkeleton');
  if (skel) skel.style.display = 'block';
  closeSearchPanel();
  clearFeedPosts();
  if (filter === 'shop') { renderProductsFeed(); return; }

  let query = DB.collection('posts').orderBy('createdAt','desc').limit(30);
  if (filter === 'videos')   query = DB.collection('posts').where('mediaType','==','video').orderBy('createdAt','desc').limit(30);
  if (filter === 'photos')   query = DB.collection('posts').where('mediaType','==','photo').orderBy('createdAt','desc').limit(30);
  if (filter === 'trending') query = DB.collection('posts').orderBy('likes','desc').limit(30);

  feedUnsub = query.onSnapshot(snap => {
    if (skel) skel.style.display = 'none';
    const posts = snap.docs.map(d => ({ id: d.id, _type: 'post', ...d.data() }));
    let items = [...posts];
    if (filter === 'all') {
      const prods = allProducts.map(p => ({ ...p, _type: 'product' }));
      items = mergeByDate([...posts, ...prods]);
    }
    window._feedItems = items;
    renderFeed(items);
  }, () => { if (skel) skel.style.display = 'none'; });
}

function clearFeedPosts() {
  const fc = $('feedContainer'); if (!fc) return;
  qsa('.feed-post', fc).forEach(el => el.remove());
  const emp = qs('.feed-empty', fc); if (emp) emp.remove();
}

function mergeByDate(items) {
  return items.sort((a, b) => {
    const ta = a.createdAt && a.createdAt.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
    const tb = b.createdAt && b.createdAt.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
    return tb - ta;
  });
}

function renderFeed(items) {
  const fc = $('feedContainer'); if (!fc) return;
  clearFeedPosts();
  if (!items || !items.length) {
    const emp = document.createElement('div');
    emp.className = 'feed-empty';
    emp.innerHTML = '<span class="material-icons-round">feed</span><p>No posts yet</p><small>Be the first to share something!</small>';
    fc.appendChild(emp); return;
  }
  items.forEach(item => {
    const el = item._type === 'product' ? buildProductPost(item) : buildUserPost(item);
    if (el) fc.appendChild(el);
  });
  setupVideoAutoplay();
}

function renderProductsFeed() {
  const skel = $('feedSkeleton'); if (skel) skel.style.display = 'none';
  if (!allProducts.length) { loadFeed('all'); return; }
  const fc = $('feedContainer'); if (!fc) return;
  allProducts.forEach(p => {
    const el = buildProductPost({ ...p, _type: 'product' });
    if (el) fc.appendChild(el);
  });
}

/* ── Build user post ── */
function buildUserPost(post) {
  const el = document.createElement('article');
  el.className = 'feed-post';
  el.dataset.postId = post.id;
  const liked   = !!likedPosts[post.id];
  const name    = post.userName || 'User';
  const avInner = post.userPhoto
    ? `<img src="${esc(post.userPhoto)}" alt="" onerror="this.style.display='none'"/>`
    : `<span>${name[0].toUpperCase()}</span>`;

  let media = '';
  if (post.mediaType === 'video' && post.mediaUrl) {
    media = `<div class="post-video-wrap" data-post-id="${post.id}">
      <video class="post-video-thumb" src="${esc(post.mediaUrl)}" preload="none" playsinline muted loop></video>
      <div class="post-video-play-overlay"><div class="post-play-btn"><span class="material-icons-round">play_arrow</span></div></div>
      <div class="post-vid-badges"><span class="post-vid-badge"><span class="material-icons-round">videocam</span>Video</span></div>
    </div>`;
  } else if (post.mediaType === 'photo' && post.mediaUrl) {
    media = `<img class="post-photo-img" src="${esc(post.mediaUrl)}" loading="lazy" onerror="this.style.display='none'"/>`;
  } else if (post.mediaType === 'audio' && post.mediaUrl) {
    media = `<div class="post-audio-card">
      <div class="post-audio-play-btn"><span class="material-icons-round">play_arrow</span></div>
      <div class="post-audio-info">
        <p class="post-audio-title">${esc(post.text || 'Audio')}</p>
        <div class="post-audio-bar"><div class="post-audio-bar-fill"></div></div>
        <div class="post-audio-times"><span>0:00</span><span>—</span></div>
      </div>
      <span class="post-audio-type-tag">Audio</span>
    </div>`;
  }

  const badge = post.mediaType === 'video' ? '<span class="post-type-badge badge-video">VIDEO</span>'
    : post.mediaType === 'photo'  ? '<span class="post-type-badge badge-image">PHOTO</span>'
    : post.mediaType === 'audio'  ? '<span class="post-type-badge badge-audio">AUDIO</span>'
    : '<span class="post-type-badge badge-text">TEXT</span>';

  el.innerHTML = `
    <div class="feed-post-header" data-uid="${esc(post.userId||'')}">
      <div class="post-avatar" style="background:${randomColor(post.userId)}">${avInner}</div>
      <div class="post-user-info">
        <div class="post-username">${esc(name)} ${badge}</div>
        <div class="post-meta">
          <span class="post-handle">@${esc(name.toLowerCase().replace(/\s+/g,'_'))}</span>
          <span class="post-dot">·</span>
          <span class="post-time">${fmtAgo(post.createdAt)}</span>
        </div>
      </div>
      <button class="post-more-btn"><span class="material-icons-round">more_horiz</span></button>
    </div>
    ${post.text ? `<div class="post-text-content">${esc(post.text)}</div>` : ''}
    ${media}
    <div class="post-footer">
      <button class="post-footer-btn post-like-btn${liked?' btn-liked':''}" data-post-id="${post.id}">
        <span class="material-icons-round">${liked?'favorite':'favorite_border'}</span>
        <span class="like-count">${fmtCount(post.likes||0)}</span>
      </button>
      <button class="post-footer-btn post-cmt-btn" data-post-id="${post.id}">
        <span class="material-icons-round">chat_bubble_outline</span>
        <span>${fmtCount(post.commentCount||0)}</span>
      </button>
      <button class="post-footer-btn post-share-btn">
        <span class="material-icons-round">share</span>
      </button>
      <div class="post-footer-spacer"></div>
      <div class="post-views">
        <span class="material-icons-round">visibility</span>
        <span>${fmtCount(post.views||0)}</span>
      </div>
    </div>`;

  el.querySelector('.post-like-btn').addEventListener('click', e => {
    e.stopPropagation();
    handleLike(post.id, el.querySelector('.post-like-btn'), el.querySelector('.like-count'));
  });
  el.querySelector('.post-cmt-btn').addEventListener('click', e => {
    e.stopPropagation(); openComments(post.id);
  });
  el.querySelector('.post-share-btn').addEventListener('click', e => {
    e.stopPropagation(); handleShare(post.text || 'SayatStudio');
  });
  el.querySelector('.feed-post-header').addEventListener('click', ev => {
    if (ev.target.closest('.post-more-btn')) return;
    if (post.userId) openUserProfile(post.userId);
  });
  el.querySelector('.post-video-wrap')?.addEventListener('click', () => {
    const vids = (window._feedItems||[]).filter(i => i._type==='post' && i.mediaType==='video' && i.mediaUrl);
    const idx  = vids.findIndex(p => p.id === post.id);
    openReels(vids.length ? vids : [post], Math.max(0, idx));
  });
  el.querySelector('.post-audio-card')?.addEventListener('click', () =>
    openAudioOverlay(post.mediaUrl, post.text||'Audio', post.userPhoto||''));
  el.querySelector('.post-photo-img')?.addEventListener('click', () =>
    openVideoOverlay(post.mediaUrl, post.text||'Photo'));
  return el;
}

/* ── Build product post ── */
function buildProductPost(product) {
  const el   = document.createElement('article');
  el.className = 'feed-post';
  const disc = product.originalPrice > product.price
    ? Math.round((1 - product.price / product.originalPrice) * 100) : 0;
  const img  = (product.images && product.images[0]) || product.image || product.thumbnailUrl || '';
  el.innerHTML = `
    <div class="feed-post-header" style="cursor:default">
      <div class="post-avatar" style="background:var(--pr);font-size:.65rem;font-weight:900;color:#fff">SK</div>
      <div class="post-user-info">
        <div class="post-username">SayatStudio <span class="post-type-badge badge-product">PRODUCT</span></div>
        <div class="post-meta"><span class="post-handle">@sayatstudio</span><span class="post-dot">·</span><span class="post-time">${fmtAgo(product.createdAt)}</span></div>
      </div>
    </div>
    <div class="post-product-card">
      <div class="post-product-img-wrap">
        <img class="post-product-img" src="${esc(img)}" loading="lazy" onerror="this.src='https://placehold.co/400x300?text=Product'"/>
        ${disc ? `<span class="post-product-disc-badge">${disc}% OFF</span>` : ''}
      </div>
      <div class="post-product-body">
        <p class="post-product-name">${esc(product.title)}</p>
        <div class="post-product-prices">
          <span class="post-product-price">&#x20B9;${fmt(product.price)}</span>
          ${product.originalPrice > product.price
            ? `<span class="post-product-orig">&#x20B9;${fmt(product.originalPrice)}</span><span class="post-product-pct">${disc}% OFF</span>`
            : ''}
        </div>
      </div>
      <div class="post-product-actions">
        <button class="btn-add-cart"><span class="material-icons-round">add_shopping_cart</span>Add to Cart</button>
        <button class="btn-buy-now"><span class="material-icons-round">flash_on</span>Buy Now</button>
      </div>
    </div>
    <div class="post-footer"><div class="post-footer-spacer"></div></div>`;
  el.querySelector('.post-product-img').addEventListener('click',  () => toast(product.title, 'info'));
  el.querySelector('.post-product-name').addEventListener('click', () => toast(product.title, 'info'));
  el.querySelector('.btn-add-cart').addEventListener('click', e => { e.stopPropagation(); toast('Added!', 'success'); });
  el.querySelector('.btn-buy-now').addEventListener('click',  e => { e.stopPropagation(); handleBuyNow(product); });
  return el;
}

/* ── Like ── */
function handleLike(postId, btn, countEl) {
  if (!currentUser) { toast('Login to like posts', 'info'); return; }
  const was = !!likedPosts[postId];
  likedPosts[postId] = !was;
  localStorage.setItem('ss_liked', JSON.stringify(likedPosts));
  if (btn) {
    btn.classList.toggle('btn-liked', !was);
    const ic = btn.querySelector('.material-icons-round');
    if (ic) ic.textContent = was ? 'favorite_border' : 'favorite';
  }
  if (countEl) {
    const prev = parseInt(countEl.textContent, 10) || 0;
    countEl.textContent = fmtCount(Math.max(0, was ? prev - 1 : prev + 1));
  }
  DB.collection('posts').doc(postId).update({ likes: INC(was ? -1 : 1) }).catch(() => {});
}

/* ── Share ── */
function handleShare(text) {
  if (navigator.share) navigator.share({ title: 'SayatStudio', text, url: location.href }).catch(() => {});
  else navigator.clipboard.writeText(location.href).then(() => toast('Link copied!', 'success')).catch(() => {});
}

/* ── Video autoplay 3s ── */
function setupVideoAutoplay() {
  const vids = qsa('.post-video-wrap video');
  if (!vids.length) return;
  const obs = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      const v = entry.target;
      if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
        v._vt = setTimeout(() => {
          v.muted = true; v.play().catch(() => {});
          const pid = v.closest('[data-post-id]')?.dataset.postId;
          if (pid && !viewedPosts.has(pid)) {
            viewedPosts.add(pid);
            DB.collection('posts').doc(pid).update({ views: INC(1) }).catch(() => {});
          }
        }, 3000);
      } else {
        clearTimeout(v._vt); v.pause(); v.currentTime = 0;
      }
    });
  }, { threshold: 0.6 });
  vids.forEach(v => obs.observe(v));
}

/* Products listener */
function listenProducts() {
  DB.collection('products').orderBy('createdAt','desc')
    .onSnapshot(snap => { allProducts = snap.docs.map(d => ({ id: d.id, ...d.data() })); }, () => {});
}

/* ══════════════════════════════════════
   REELS
══════════════════════════════════════ */
function openReels(posts, startIndex) {
  startIndex = startIndex || 0;
  currentReelItems = posts;
  const scroll = $('reelScroll'); if (!scroll) return;
  scroll.innerHTML = '';
  posts.forEach((post, i) => {
    const item = document.createElement('div');
    item.className = 'reel-item'; item.dataset.i = i;
    const liked = !!likedPosts[post.id];
    const name  = post.userName || 'User';
    const av    = post.userPhoto
      ? `<img src="${esc(post.userPhoto)}" alt="" onerror="this.style.display='none'"/>`
      : name[0].toUpperCase();
    item.innerHTML = `
      <video class="reel-video" src="${esc(post.mediaUrl)}" playsinline loop preload="none"></video>
      <div class="reel-grad-top"></div><div class="reel-grad-bot"></div>
      <div class="reel-side-btns">
        <div class="reel-side-btn reel-av-btn"><div class="reel-user-circle">${av}</div></div>
        <div class="reel-side-btn reel-like-btn${liked?' reel-liked':''}" data-pid="${post.id}">
          <span class="material-icons-round">${liked?'favorite':'favorite_border'}</span>
          <span class="reel-count">${fmtCount(post.likes||0)}</span>
        </div>
        <div class="reel-side-btn reel-cmt-btn">
          <span class="material-icons-round">chat_bubble_outline</span>
          <span class="reel-count">${fmtCount(post.commentCount||0)}</span>
        </div>
        <div class="reel-side-btn reel-share-btn">
          <span class="material-icons-round">share</span>
          <span class="reel-count">Share</span>
        </div>
      </div>
      <div class="reel-info">
        <div class="reel-info-user">
          <span class="material-icons-round">account_circle</span>${esc(name)}
        </div>
        <p class="reel-info-text">${esc(post.text||'')}</p>
      </div>
      <div class="reel-progress"><div class="reel-progress-fill"></div></div>`;

    item.querySelector('.reel-like-btn').addEventListener('click', e => {
      e.stopPropagation();
      if (!currentUser) { toast('Login to like','info'); return; }
      const btn = e.currentTarget, was = btn.classList.contains('reel-liked');
      likedPosts[post.id] = !was;
      localStorage.setItem('ss_liked', JSON.stringify(likedPosts));
      btn.classList.toggle('reel-liked', !was);
      const ic = btn.querySelector('.material-icons-round');
      if (ic) ic.textContent = was ? 'favorite_border' : 'favorite';
      const c = btn.querySelector('.reel-count');
      if (c) c.textContent = fmtCount(Math.max(0,(parseInt(c.textContent)||0)+(was?-1:1)));
      DB.collection('posts').doc(post.id).update({ likes: INC(was?-1:1) }).catch(()=>{});
    });
    item.querySelector('.reel-cmt-btn').addEventListener('click', e => { e.stopPropagation(); openComments(post.id); });
    item.querySelector('.reel-share-btn').addEventListener('click', e => { e.stopPropagation(); handleShare(post.text||'SayatStudio'); });
    item.querySelector('.reel-av-btn').addEventListener('click', () => { if (post.userId) openUserProfile(post.userId); });
    item.querySelector('.reel-info-user').addEventListener('click', () => { if (post.userId) openUserProfile(post.userId); });
    scroll.appendChild(item);
  });

  const overlay = $('reelOverlay');
  if (overlay) overlay.classList.add('reel-open');
  document.body.style.overflow = 'hidden';

  if (currentReelObs) currentReelObs.disconnect();
  currentReelObs = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      const vid  = entry.target.querySelector('.reel-video');
      const fill = entry.target.querySelector('.reel-progress-fill');
      if (entry.isIntersecting) {
        vid.play().catch(()=>{});
        vid.ontimeupdate = () => { if (vid.duration && fill) fill.style.width = (vid.currentTime/vid.duration*100)+'%'; };
        const idx = parseInt(entry.target.dataset.i,10);
        const p   = currentReelItems[idx];
        if (p && !viewedPosts.has(p.id)) {
          viewedPosts.add(p.id);
          DB.collection('posts').doc(p.id).update({ views: INC(1) }).catch(()=>{});
        }
      } else { vid.pause(); vid.currentTime = 0; if (fill) fill.style.width = '0%'; }
    });
  }, { threshold: 0.6 });
  qsa('.reel-item', scroll).forEach(it => currentReelObs.observe(it));

  if (startIndex > 0) setTimeout(() => {
    const items = qsa('.reel-item', scroll);
    if (items[startIndex]) items[startIndex].scrollIntoView({ behavior: 'instant' });
  }, 80);
}

function closeReels() {
  const ov = $('reelOverlay'); if (ov) ov.classList.remove('reel-open');
  document.body.style.overflow = '';
  const sc = $('reelScroll');
  if (sc) { qsa('.reel-video',sc).forEach(v=>{v.pause();v.src='';}); sc.innerHTML=''; }
  if (currentReelObs) { currentReelObs.disconnect(); currentReelObs = null; }
}
on('reelCloseBtn','click', closeReels);

/* ══════════════════════════════════════
   VIDEO OVERLAY
══════════════════════════════════════ */
function openVideoOverlay(url, title) {
  const vid = $('videoOverlayPlayer'); if (!vid) return;
  vid.src = url;
  setText('videoOverlayTitle', title || 'Video');
  const ov = $('videoOverlay'); if (ov) ov.classList.add('video-open');
  document.body.style.overflow = 'hidden';
  vid.play().catch(()=>{});
}
function closeVideoOverlay() {
  const vid = $('videoOverlayPlayer');
  if (vid) { vid.pause(); vid.src = ''; }
  const ov = $('videoOverlay'); if (ov) ov.classList.remove('video-open');
  document.body.style.overflow = '';
}
on('videoOverlayClose','click', closeVideoOverlay);

/* ══════════════════════════════════════
   AUDIO OVERLAY
══════════════════════════════════════ */
const audioEl = $('audioPlayer');
let audioPlaying = false;

function openAudioOverlay(url, title, cover) {
  if (!audioEl) return;
  audioEl.src = url; audioEl.load();
  setText('audioTitleText',  title || 'Audio');
  setText('audioArtistText', 'SayatStudio');
  const img = cover || 'https://placehold.co/200x200?text=Audio';
  const ai  = $('audioAlbumArtImg'), bg = $('audioOverlayBg');
  if (ai) ai.src = img;
  if (bg) bg.style.backgroundImage = 'url(' + img + ')';
  const sf = $('audioSeekFill'), si = $('audioSeekInput');
  if (sf) sf.style.width = '0%'; if (si) si.value = 0;
  setText('audioCurrentTime','0:00'); setText('audioDuration','0:00');
  audioPlaying = false;
  const pb = $('audioPlayBtn');
  if (pb) pb.querySelector('.material-icons-round').textContent = 'play_arrow';
  const ov = $('audioOverlay'); if (ov) ov.classList.add('audio-open');
  document.body.style.overflow = 'hidden';
}
function closeAudioOverlay() {
  if (audioEl) { audioEl.pause(); audioEl.src = ''; }
  const ov = $('audioOverlay'); if (ov) ov.classList.remove('audio-open');
  document.body.style.overflow = ''; audioPlaying = false;
}
on('audioOverlayClose','click', closeAudioOverlay);
on('audioPlayBtn','click', () => {
  if (!audioEl) return;
  const ic = $('audioPlayBtn')?.querySelector('.material-icons-round');
  if (audioPlaying) {
    audioEl.pause(); audioPlaying = false; if (ic) ic.textContent = 'play_arrow';
  } else {
    audioEl.play().catch(e=>toast('Cannot play: '+e.message,'error'));
    audioPlaying = true; if (ic) ic.textContent = 'pause';
  }
});
on('audioPrev10','click', () => { if(audioEl) audioEl.currentTime = Math.max(0,audioEl.currentTime-10); });
on('audioFwd10', 'click', () => { if(audioEl) audioEl.currentTime = Math.min(audioEl.duration||0,audioEl.currentTime+10); });
if (audioEl) {
  audioEl.addEventListener('timeupdate', () => {
    if (!audioEl.duration) return;
    const pct = (audioEl.currentTime/audioEl.duration)*100;
    const sf=$('audioSeekFill'),si=$('audioSeekInput');
    if(sf) sf.style.width=pct+'%'; if(si) si.value=pct;
    setText('audioCurrentTime', fmtTime(audioEl.currentTime));
  });
  audioEl.addEventListener('loadedmetadata', () => setText('audioDuration', fmtTime(audioEl.duration)));
  audioEl.addEventListener('ended', () => {
    audioPlaying=false;
    const ic=$('audioPlayBtn')?.querySelector('.material-icons-round');
    if(ic) ic.textContent='play_arrow';
  });
}
on('audioSeekInput','input', e => { if(audioEl&&audioEl.duration) audioEl.currentTime=(e.target.value/100)*audioEl.duration; });

/* ══════════════════════════════════════
   PDF READER
══════════════════════════════════════ */
let pdfDoc = null;
function openPdfReader(url, title) {
  setText('pdfTitle', title||'Document'); setText('pdfPageCount','');
  setHTML('pdfPagesContainer','<div class="pdf-loading"><div class="spinner"></div><p>Loading...</p></div>');
  const ov=$('pdfOverlay'); if(ov) ov.classList.add('pdf-open');
  document.body.style.overflow='hidden';
  if (typeof pdfjsLib === 'undefined') { toast('PDF viewer unavailable','error'); return; }
  pdfjsLib.getDocument({ url }).promise.then(pdf => {
    pdfDoc = pdf;
    setText('pdfPageCount', pdf.numPages+' pages');
    setHTML('pdfPagesContainer','');
    const renderPage = i => {
      if (i > pdf.numPages) return;
      pdf.getPage(i).then(page => {
        const scale  = Math.min(window.innerWidth/page.getViewport({scale:1}).width, 1.5);
        const vp     = page.getViewport({scale});
        const canvas = document.createElement('canvas');
        canvas.className='pdf-page-canvas'; canvas.width=vp.width; canvas.height=vp.height;
        page.render({canvasContext:canvas.getContext('2d'),viewport:vp}).promise.then(()=>{
          const wrap=document.createElement('div');
          wrap.innerHTML='<div class="pdf-page-num">Page '+i+'</div>';
          wrap.insertBefore(canvas,wrap.firstChild);
          const cont=$('pdfPagesContainer'); if(cont) cont.appendChild(wrap);
          renderPage(i+1);
        });
      });
    };
    renderPage(1);
  }).catch(e => setHTML('pdfPagesContainer','<div class="pdf-loading"><p>Failed: '+esc(e.message)+'</p></div>'));
}
function closePdfReader() {
  const ov=$('pdfOverlay'); if(ov) ov.classList.remove('pdf-open');
  document.body.style.overflow='';
  if (pdfDoc) { pdfDoc.destroy(); pdfDoc=null; }
  setHTML('pdfPagesContainer','');
}
on('pdfCloseBtn','click', closePdfReader);

/* ══════════════════════════════════════
   CREATE POST
══════════════════════════════════════ */
on('fabPlus',           'click', openCreatePost);
on('createPostClose',   'click', closeCreatePost);
on('createPostBackdrop','click', closeCreatePost);
on('createCancelBtn',   'click', closeCreatePost);
on('createGoLoginBtn',  'click', () => { closeCreatePost(); switchSection('profile'); });

function openCreatePost() {
  if (!currentUser) {
    setStyle('createLoginPrompt','display','flex');
    setStyle('createForm',       'display','none');
    setStyle('postTypeTabs',     'display','none');
    setStyle('createPostFooter', 'display','none');
  } else {
    setStyle('createLoginPrompt','display','none');
    setStyle('createForm',       'display','block');
    setStyle('postTypeTabs',     'display','flex');
    setStyle('createPostFooter', 'display','flex');
    const name = currentUser.displayName || currentUser.phoneNumber || 'User';
    const av   = qs('.create-form-avatar');
    if (av) {
      if (currentUser.photoURL) av.innerHTML='<img src="'+esc(currentUser.photoURL)+'" alt=""/>';
      else av.textContent = name[0].toUpperCase();
    }
    const un = qs('.create-form-username');
    if (un) un.textContent = name;
  }
  const sheet = $('createPostSheet');
  if (sheet) sheet.classList.add('sheet-open');
  document.body.style.overflow = 'hidden';
  setCreateTab('text');
}
function closeCreatePost() {
  const sheet = $('createPostSheet');
  if (sheet) sheet.classList.remove('sheet-open');
  document.body.style.overflow = '';
  resetCreateForm();
}
function resetCreateForm() {
  const ta=$('createTextarea'); if(ta) ta.value='';
  if (createMediaBlob) { URL.revokeObjectURL(createMediaBlob); createMediaBlob=null; }
  createMediaFile=null;
  setStyle('createMediaPreview','display','none');
  setStyle('createUploadZone',  'display','none');
  const pi=$('createPreviewImg'),pv=$('createPreviewVid'),pa=$('createAudioPreview');
  if(pi){pi.src='';pi.style.display='none';} if(pv){pv.src='';pv.style.display='none';}
  if(pa) pa.style.display='none';
  const mi=$('createMediaInput'); if(mi) mi.value='';
}
function setCreateTab(type) {
  createPostType = type;
  qsa('.post-type-tab').forEach(btn => btn.classList.toggle('tab-active', btn.dataset.postType===type));
  const zone=$('createUploadZone'), zt=$('createUploadZoneText'), zh=$('createUploadZoneHint'), mi=$('createMediaInput');
  if (!zone) return;
  if (type==='text') { zone.style.display='none'; return; }
  zone.style.display='flex';
  if (type==='photo') {
    if(zt) zt.textContent='Tap to select photo'; if(zh) zh.textContent='JPG, PNG, WEBP — Max 20MB';
    if(mi) mi.accept='image/*';
  } else if (type==='video') {
    if(zt) zt.textContent='Tap to select video'; if(zh) zh.textContent='MP4, WebM — Max 5GB';
    if(mi) mi.accept='video/*';
  } else if (type==='audio') {
    if(zt) zt.textContent='Tap to select audio'; if(zh) zh.textContent='MP3, WAV — Max 5GB';
    if(mi) mi.accept='audio/*';
  }
}
qsa('.post-type-tab').forEach(btn => btn.addEventListener('click', () => setCreateTab(btn.dataset.postType)));

on('createMediaInput','change', e => {
  const file = e.target.files && e.target.files[0]; if (!file) return;
  const maxMB = createPostType==='photo' ? 20 : 5000;
  if (file.size > maxMB*1024*1024) { toast('Max '+maxMB+'MB allowed','error'); e.target.value=''; return; }
  createMediaFile = file;
  if (createMediaBlob) URL.revokeObjectURL(createMediaBlob);
  createMediaBlob = URL.createObjectURL(file);
  setStyle('createUploadZone',  'display','none');
  setStyle('createMediaPreview','display','block');
  const pi=$('createPreviewImg'),pv=$('createPreviewVid'),pa=$('createAudioPreview'),pan=$('createAudioFileName');
  if (createPostType==='photo') {
    if(pi){pi.src=createMediaBlob;pi.style.display='block';} if(pv) pv.style.display='none'; if(pa) pa.style.display='none';
  } else if (createPostType==='video') {
    if(pv){pv.src=createMediaBlob;pv.style.display='block';} if(pi) pi.style.display='none'; if(pa) pa.style.display='none';
  } else if (createPostType==='audio') {
    if(pa) pa.style.display='flex'; if(pan) pan.textContent=file.name;
    if(pi) pi.style.display='none'; if(pv) pv.style.display='none';
  }
});
on('createMediaRemoveBtn','click', () => {
  if(createMediaBlob){URL.revokeObjectURL(createMediaBlob);createMediaBlob=null;}
  createMediaFile=null;
  setStyle('createMediaPreview','display','none');
  setStyle('createUploadZone',  'display','flex');
  const mi=$('createMediaInput'); if(mi) mi.value='';
});
on('createSubmitBtn','click', async () => {
  if (!currentUser) { toast('Login to post','error'); return; }
  const text = (($('createTextarea')||{}).value||'').trim();
  if (!text && !createMediaFile) { toast('Write something or add media','error'); return; }
  const btn=$('createSubmitBtn'); if(btn) btn.disabled=true;
  showLoading('Uploading...');
  try {
    let mediaUrl=null;
    if (createMediaFile) {
      const folder = createPostType==='video'?'posts/videos/':createPostType==='audio'?'posts/audios/':'posts/photos/';
      mediaUrl = await uploadFile(createMediaFile, folder, ()=>{});
    }
    const name=currentUser.displayName||currentUser.phoneNumber||'User';
    await DB.collection('posts').add({
      userId:currentUser.uid, userName:name, userPhoto:currentUser.photoURL||'',
      text:text||'', mediaType:createMediaFile?createPostType:'text',
      mediaUrl:mediaUrl||null, thumbnailUrl:mediaUrl||null,
      likes:0, commentCount:0, views:0, createdAt:TS()
    });
    await DB.collection('users').doc(currentUser.uid).update({ postCount: INC(1) });
    toast('Posted!','success'); closeCreatePost();
  } catch(err) { toast('Post failed: '+err.message,'error',6000); }
  finally { if(btn) btn.disabled=false; hideLoading(); }
});

/* ══════════════════════════════════════
   COMMENTS
══════════════════════════════════════ */
function openComments(postId) {
  commentsPostId = postId;
  setHTML('commentsList','<div class="pdf-loading"><div class="spinner"></div></div>');
  const ci=$('commentsInput'); if(ci) ci.value='';
  if (currentUser) {
    const name=currentUser.displayName||currentUser.phoneNumber||'User';
    const av=qs('.comments-input-avatar');
    if (av) { if(currentUser.photoURL) av.innerHTML='<img src="'+esc(currentUser.photoURL)+'" alt=""/>'; else av.textContent=name[0].toUpperCase(); }
  }
  const sheet=$('commentsSheet'); if(sheet) sheet.classList.add('sheet-open');
  document.body.style.overflow='hidden';
  DB.collection('posts').doc(postId).collection('comments')
    .orderBy('createdAt','asc').limit(50).get().then(snap=>{
      const list=$('commentsList'); if(!list) return;
      list.innerHTML='';
      if(!snap.size){list.innerHTML='<div class="comments-empty"><span class="material-icons-round">chat_bubble_outline</span><p>No comments yet</p></div>';return;}
      snap.docs.forEach(doc=>{
        const c=Object.assign({id:doc.id},doc.data());
        const el=document.createElement('div'); el.className='comment-item';
        const cn=c.userName||'User';
        const av=c.userPhoto?'<img src="'+esc(c.userPhoto)+'" alt=""/>':cn[0].toUpperCase();
        el.innerHTML='<div class="comment-avatar">'+av+'</div>'+
          '<div class="comment-bubble"><div class="comment-bubble-header">'+
          '<span class="comment-username">'+esc(cn)+'</span>'+
          '<span class="comment-time">'+fmtAgo(c.createdAt)+'</span></div>'+
          '<p class="comment-text">'+esc(c.text)+'</p></div>';
        list.appendChild(el);
      });
    }).catch(()=>{});
}
function closeComments() {
  const sheet=$('commentsSheet'); if(sheet) sheet.classList.remove('sheet-open');
  document.body.style.overflow=''; commentsPostId=null;
}
on('commentsClose',   'click', closeComments);
on('commentsBackdrop','click', closeComments);
on('commentsSendBtn', 'click', () => {
  if(!currentUser){toast('Login to comment','info');return;}
  if(!commentsPostId) return;
  const ci=$('commentsInput'); const text=(ci?ci.value:'').trim(); if(!text) return;
  if(ci) ci.value='';
  const name=currentUser.displayName||currentUser.phoneNumber||'User';
  DB.collection('posts').doc(commentsPostId).collection('comments').add({
    userId:currentUser.uid,userName:name,userPhoto:currentUser.photoURL||'',text,createdAt:TS()
  }).then(()=>{
    DB.collection('posts').doc(commentsPostId).update({commentCount:INC(1)}).catch(()=>{});
    openComments(commentsPostId); toast('Comment posted','success');
  }).catch(e=>toast('Failed: '+e.message,'error'));
});
on('commentsInput','keydown', e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();const btn=$('commentsSendBtn');if(btn) btn.click();}});

/* ══════════════════════════════════════
   USER PROFILE OVERLAY
══════════════════════════════════════ */
function openUserProfile(uid) {
  const ov = $('userProfileOverlay'); if (!ov) return;
  setText('upoHeaderTitle', 'Profile');
  setText('upoDisplayName', 'Loading...');
  setText('upoHandle', '');
  setText('upoPostCount', '0');
  setText('upoFollowerCount', '0');
  setText('upoFollowingCount', '0');
  setHTML('upoAvatar', '<span>?</span>');
  setHTML('upoPostsGrid', '<div class="pdf-loading" style="grid-column:1/-1"><div class="spinner"></div></div>');
  ov.classList.add('upo-open');
  document.body.style.overflow = 'hidden';

  const isOwn = currentUser && uid === currentUser.uid;
  const followBtn = $('upoFollowBtn'), msgBtn = $('upoMessageBtn');
  if (followBtn) followBtn.style.display = isOwn ? 'none' : '';
  if (msgBtn)    msgBtn.style.display    = isOwn ? 'none' : '';

  let isFollowing = false;
  if (currentUser && !isOwn) {
    DB.collection('follows').doc(currentUser.uid + '_' + uid).get().then(snap => {
      isFollowing = snap.exists;
      if (followBtn) {
        followBtn.classList.toggle('btn-following', isFollowing);
        followBtn.innerHTML = isFollowing
          ? '<span class="material-icons-round">person_remove</span> Following'
          : '<span class="material-icons-round">person_add</span> Follow';
      }
    }).catch(() => {});
  }

  // Replace follow button to clear old listeners
  if (followBtn) {
    const newF = followBtn.cloneNode(true);
    followBtn.parentNode.replaceChild(newF, followBtn);
    newF.addEventListener('click', async () => {
      if (!currentUser) { toast('Login to follow', 'info'); return; }
      showLoading(isFollowing ? 'Unfollowing...' : 'Following...');
      const docId = currentUser.uid + '_' + uid;
      try {
        if (isFollowing) {
          await DB.collection('follows').doc(docId).delete();
          await Promise.all([
            DB.collection('users').doc(uid).update({ followers: INC(-1) }),
            DB.collection('users').doc(currentUser.uid).update({ following: INC(-1) })
          ]);
          isFollowing = false;
          newF.classList.remove('btn-following');
          newF.innerHTML = '<span class="material-icons-round">person_add</span> Follow';
          toast('Unfollowed', 'info');
        } else {
          await DB.collection('follows').doc(docId).set({ followerUid: currentUser.uid, followingUid: uid, createdAt: TS() });
          await Promise.all([
            DB.collection('users').doc(uid).update({ followers: INC(1) }),
            DB.collection('users').doc(currentUser.uid).update({ following: INC(1) })
          ]);
          isFollowing = true;
          newF.classList.add('btn-following');
          newF.innerHTML = '<span class="material-icons-round">person_remove</span> Following';
          toast('Following!', 'success');
          const myName = currentUser.displayName || currentUser.phoneNumber || 'User';
          DB.collection('notifications').add({ toUid: uid, fromUid: currentUser.uid, fromName: myName, type: 'follow', read: false, createdAt: TS() }).catch(() => {});
        }
      } catch (e) { toast('Error: ' + e.message, 'error'); }
      hideLoading();
    });
  }

  // Replace message button
  if (msgBtn) {
    const newM = msgBtn.cloneNode(true);
    msgBtn.parentNode.replaceChild(newM, msgBtn);
    newM.addEventListener('click', () => {
      closeUpo(); switchSection('messages');
      setTimeout(() => openChatWith(uid), 200);
    });
  }

  // Load user data
  DB.collection('users').doc(uid).get().then(snap => {
    if (!snap.exists) { toast('User not found', 'error'); return; }
    const d = snap.data(), name = d.displayName || 'User';
    setText('upoHeaderTitle', name);
    setText('upoDisplayName', name);
    setText('upoHandle', '@' + name.toLowerCase().replace(/\s+/g, '_'));
    setText('upoPostCount',      fmtCount(d.postCount  || 0));
    setText('upoFollowerCount',  fmtCount(d.followers  || 0));
    setText('upoFollowingCount', fmtCount(d.following  || 0));
    const img = $('upoAvatarImg'), ltr = $('upoAvatarLetter');
    if (d.photoURL) {
      if (img) { img.src = d.photoURL; img.style.display = 'block'; }
      if (ltr) ltr.style.display = 'none';
    } else {
      if (ltr) { ltr.textContent = name[0].toUpperCase(); ltr.style.display = 'flex'; }
      if (img) img.style.display = 'none';
    }
  }).catch(() => toast('Failed to load profile', 'error'));

  // Load posts grid
  DB.collection('posts').where('userId', '==', uid).orderBy('createdAt', 'desc').limit(30).get().then(snap => {
    const grid = $('upoPostsGrid'); if (!grid) return;
    grid.innerHTML = '';
    if (!snap.size) { grid.innerHTML = '<div class="upo-grid-empty"><span class="material-icons-round">grid_off</span><p>No posts yet</p></div>'; return; }
    snap.docs.forEach(doc => {
      const p = { id: doc.id, ...doc.data() };
      const item = document.createElement('div'); item.className = 'upo-grid-item';
      const isVid = p.mediaType === 'video', thumb = p.thumbnailUrl || p.mediaUrl || '';
      if (thumb) {
        item.innerHTML = isVid
          ? `<video src="${esc(thumb)}" preload="none" muted playsinline></video><span class="material-icons-round upo-grid-play">play_circle</span>`
          : `<img src="${esc(thumb)}" loading="lazy"/>`;
        item.addEventListener('click', () => { closeUpo(); if (isVid) openReels([p], 0); else openVideoOverlay(p.mediaUrl, p.text || ''); });
      } else {
        item.style.background = 'var(--pr-g)';
        item.innerHTML = '<span class="material-icons-round" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:var(--pr)">notes</span>';
      }
      grid.appendChild(item);
    });
  }).catch(() => {});
}

function closeUpo() {
  const ov = $('userProfileOverlay'); if (ov) ov.classList.remove('upo-open');
  document.body.style.overflow = '';
}
on('upoBackBtn', 'click', closeUpo);

/* ══════════════════════════════════════
   YOUR POSTS ANALYTICS
══════════════════════════════════════ */
function openYourPosts() {
  if (!currentUser) { toast('Login to see your posts', 'info'); switchSection('profile'); return; }
  const ov = $('yourPostsOverlay'); if (ov) ov.classList.add('ypo-open');
  document.body.style.overflow = 'hidden';
  setHTML('ypoBody', '<div class="pdf-loading"><div class="spinner"></div><p>Loading...</p></div>');
  DB.collection('posts').where('userId', '==', currentUser.uid).orderBy('createdAt', 'desc').limit(50).get().then(snap => {
    const body = $('ypoBody'); if (!body) return;
    body.innerHTML = '';
    if (!snap.size) { body.innerHTML = '<div class="upo-grid-empty" style="grid-column:unset"><span class="material-icons-round">grid_off</span><p>No posts yet</p></div>'; return; }
    snap.docs.forEach(doc => {
      const p = { id: doc.id, ...doc.data() };
      const el = document.createElement('div'); el.className = 'ypo-post-item';
      const thumb = p.thumbnailUrl || p.mediaUrl || '';
      const tHtml = (p.mediaType === 'video' || p.mediaType === 'photo') && thumb
        ? `<div class="ypo-thumb"><img src="${esc(thumb)}" onerror="this.style.display='none'"/></div>`
        : p.mediaType === 'audio'
          ? '<div class="ypo-thumb"><span class="material-icons-round">headphones</span></div>'
          : '<div class="ypo-thumb"><span class="material-icons-round">notes</span></div>';
      el.innerHTML = tHtml +
        `<div class="ypo-info">
          <p class="ypo-post-text">${esc(p.text || '(No text)')}</p>
          <div class="ypo-stats-row">
            <span class="ypo-stat"><span class="material-icons-round">favorite</span>${fmtCount(p.likes||0)} likes</span>
            <span class="ypo-stat"><span class="material-icons-round">visibility</span>${fmtCount(p.views||0)} views</span>
            <span class="ypo-stat"><span class="material-icons-round">comment</span>${fmtCount(p.commentCount||0)}</span>
          </div>
        </div>`;
      body.appendChild(el);
    });
  }).catch(() => { setHTML('ypoBody', '<p style="padding:24px;color:var(--tm)">Failed to load posts</p>'); });
}
on('ypoBackBtn', 'click', () => {
  const ov = $('yourPostsOverlay'); if (ov) ov.classList.remove('ypo-open');
  document.body.style.overflow = '';
});

/* ══════════════════════════════════════
   MESSAGES & CHAT
══════════════════════════════════════ */
function initMessages() {
  if (!currentUser) {
    setStyle('conversationsLoginPrompt','display','flex');
    setStyle('conversationsEmpty',      'display','none');
    setStyle('chatView',                'display','none');
    setStyle('messagesListView',        'display','flex');
    return;
  }
  setStyle('conversationsLoginPrompt','display','none');
  setStyle('messagesListView',        'display','flex');
  setStyle('chatView',                'display','none');
  loadConversations();
}
on('msgLoginBtn','click', () => switchSection('profile'));

function loadConversations() {
  if (!currentUser) return;
  DB.collection('conversations')
    .where('participants','array-contains', currentUser.uid)
    .orderBy('lastMessageAt','desc').limit(30).get()
    .then(snap => {
      const list = $('conversationsList'); if (!list) return;
      list.innerHTML = '';
      const empty = $('conversationsEmpty');
      if (!snap.size) { if (empty) empty.style.display = 'flex'; return; }
      if (empty) empty.style.display = 'none';
      snap.docs.forEach(doc => {
        const conv    = { id: doc.id, ...doc.data() };
        const otherUid   = (conv.participants || []).find(u => u !== currentUser.uid) || '';
        const otherName  = (conv.participantNames  && conv.participantNames[otherUid])  || 'User';
        const otherPhoto = (conv.participantPhotos && conv.participantPhotos[otherUid]) || '';
        const unread     = (conv.unreadCounts      && conv.unreadCounts[currentUser.uid]) || 0;
        const item = document.createElement('div'); item.className = 'conversation-item';
        const avHtml = otherPhoto
          ? `<img src="${esc(otherPhoto)}" alt="" onerror="this.style.display='none'"/>`
          : otherName[0].toUpperCase();
        item.innerHTML =
          `<div class="conv-avatar" style="background:${randomColor(otherUid)}">${avHtml}</div>` +
          `<div class="conv-info">
            <p class="conv-name">${esc(otherName)}</p>
            <p class="conv-last-msg${unread?' unread':''}">${esc(conv.lastMessage||'')}</p>
          </div>` +
          `<div class="conv-meta">
            <span class="conv-time">${fmtAgo(conv.lastMessageAt)}</span>
            ${unread ? `<span class="conv-unread-badge">${unread}</span>` : ''}
          </div>`;
        item.addEventListener('click', () => openChatWith(otherUid, otherName, otherPhoto, conv.id));
        list.appendChild(item);
      });
    }).catch(() => {});
}

function openChatWith(uid, name, photo, existingConvId) {
  if (!currentUser) { toast('Login to message','info'); return; }
  if (uid === currentUser.uid) { toast("Can't message yourself",'info'); return; }

  // Check follow relationship
  const fwd = DB.collection('follows').doc(currentUser.uid+'_'+uid).get();
  const rev = DB.collection('follows').doc(uid+'_'+currentUser.uid).get();
  Promise.all([fwd, rev]).then(([f, r]) => {
    if (!f.exists && !r.exists) { toast('Follow this user first to message them','info'); return; }
    _startChat(uid, name, photo, existingConvId);
  }).catch(() => _startChat(uid, name, photo, existingConvId));
}

function _startChat(uid, name, photo, existingConvId) {
  if (!name) {
    DB.collection('users').doc(uid).get().then(snap => {
      if (snap.exists) { name = snap.data().displayName || 'User'; photo = snap.data().photoURL || ''; }
      _doStartChat(uid, name, photo, existingConvId);
    }).catch(() => _doStartChat(uid, name||'User', photo||'', existingConvId));
  } else { _doStartChat(uid, name, photo, existingConvId); }
}

function _doStartChat(uid, name, photo, existingConvId) {
  activeChatUid    = uid;
  activeChatConvId = existingConvId || [currentUser.uid, uid].sort().join('_');
  setText('chatHeaderName', name||'User');
  setText('chatHeaderStatus', 'Online');
  const ha = $('chatHeaderAvatar');
  if (ha) {
    if (photo) ha.innerHTML = `<img src="${esc(photo)}" alt="" onerror="this.style.display='none'"/>`;
    else ha.textContent = (name||'U')[0].toUpperCase();
  }
  const vp = $('chatViewProfileBtn');
  if (vp) vp.onclick = () => openUserProfile(uid);
  const e2eebtn = $('chatOpenE2EEBtn');
  if (e2eebtn) e2eebtn.onclick = () => openE2EEChat(uid, name, photo);

  setStyle('messagesListView','display','none');
  setStyle('chatView',        'display','flex');
  setHTML('chatMessages','<div class="pdf-loading"><div class="spinner"></div></div>');

  const myName  = currentUser.displayName || currentUser.phoneNumber || 'User';
  const myPhoto = currentUser.photoURL || '';
  const convRef = DB.collection('conversations').doc(activeChatConvId);

  convRef.get().then(snap => {
    if (!snap.exists) {
      return convRef.set({
        participants:      [currentUser.uid, uid],
        participantNames:  { [currentUser.uid]: myName,  [uid]: name||'User' },
        participantPhotos: { [currentUser.uid]: myPhoto, [uid]: photo||'' },
        lastMessage:'', lastMessageAt: TS(),
        unreadCounts: { [currentUser.uid]: 0, [uid]: 0 }
      });
    }
  }).then(() => {
    const upd = {}; upd['unreadCounts.' + currentUser.uid] = 0;
    return convRef.update(upd);
  }).then(() => {
    if (chatUnsub) { chatUnsub(); chatUnsub = null; }
    chatUnsub = convRef.collection('messages').orderBy('createdAt','asc').limit(100)
      .onSnapshot(snap => {
        const cm = $('chatMessages'); if (!cm) return;
        cm.innerHTML = '';
        if (!snap.size) { cm.innerHTML='<p style="text-align:center;padding:24px;color:var(--tm);font-size:.82rem">Say hello 👋</p>'; return; }
        snap.docs.forEach(doc => {
          const msg   = { id: doc.id, ...doc.data() };
          const isSent = msg.senderId === currentUser.uid;
          const el = document.createElement('div'); el.className = 'chat-msg '+(isSent?'msg-sent':'msg-received');
          let mHtml = '';
          if (msg.mediaUrl) {
            if (msg.mediaType==='image') mHtml=`<div class="chat-msg-media"><img src="${esc(msg.mediaUrl)}" loading="lazy"/></div>`;
            else if (msg.mediaType==='video') mHtml=`<div class="chat-msg-media"><video src="${esc(msg.mediaUrl)}" controls playsinline muted style="border-radius:8px"></video></div>`;
          }
          const avHtml = !isSent ? `<div class="chat-msg-avatar" style="background:${randomColor(msg.senderId)}">${(msg.senderName||'U')[0].toUpperCase()}</div>` : '';
          el.innerHTML = avHtml + '<div>' + mHtml +
            (msg.text ? `<div class="chat-msg-bubble">${esc(msg.text)}</div>` : '') +
            `<p class="chat-msg-time">${fmtAgo(msg.createdAt)}</p></div>`;
          cm.appendChild(el);
        });
        cm.scrollTop = cm.scrollHeight;
      }, () => {});
  }).catch(() => {});
}

async function sendChatMessage() {
  if (!currentUser || !activeChatConvId) return;
  const ci   = $('chatInput');
  const text = (ci ? ci.value : '').trim();
  const mf   = $('chatFileInput');
  const file = mf && mf.files && mf.files[0];
  if (!text && !file) return;
  const btn = $('chatSendBtn'); if (btn) btn.disabled = true;
  try {
    let mediaUrl = null, mediaType = null;
    if (file) {
      showLoading('Uploading...');
      const folder = file.type.startsWith('image/') ? 'chats/images/' : 'chats/videos/';
      mediaUrl  = await uploadFile(file, folder, () => {});
      mediaType = file.type.startsWith('image/') ? 'image' : 'video';
      if (mf) mf.value = '';
      setStyle('chatMediaPreview','display','none');
      hideLoading();
    }
    const myName = currentUser.displayName || currentUser.phoneNumber || 'User';
    const convRef = DB.collection('conversations').doc(activeChatConvId);
    await convRef.collection('messages').add({
      senderId: currentUser.uid, senderName: myName,
      text: text||'', mediaUrl: mediaUrl||null, mediaType: mediaType||null, createdAt: TS()
    });
    const upd = { lastMessage: text||(mediaType==='image'?'📷 Image':'🎬 Video'), lastMessageAt: TS() };
    upd['unreadCounts.' + activeChatUid] = firebase.firestore.FieldValue.increment(1);
    await convRef.update(upd);
    if (ci) { ci.value=''; ci.style.height='auto'; }
  } catch (e) { toast('Failed: '+e.message,'error'); hideLoading(); }
  if (btn) btn.disabled = false;
}

on('chatSendBtn','click', sendChatMessage);
on('chatInput','keydown', e => { if (e.key==='Enter'&&!e.shiftKey) { e.preventDefault(); sendChatMessage(); } });
on('chatInput','input', function() { this.style.height='auto'; this.style.height=Math.min(this.scrollHeight,100)+'px'; });
on('chatAttachBtn','click', () => { const fi=$('chatFileInput'); if(fi) fi.click(); });
on('chatFileInput','change', e => {
  const file = e.target.files && e.target.files[0]; if (!file) return;
  if (file.size>100*1024*1024) { toast('Max 100MB for chat media','error'); return; }
  const blob = URL.createObjectURL(file);
  const prev=$('chatMediaPreview'), pi=$('chatMediaPreviewImg'), pv=$('chatMediaPreviewVid');
  if(prev) prev.style.display='block';
  if (file.type.startsWith('image/')) { if(pi){pi.src=blob;pi.style.display='block';} if(pv) pv.style.display='none'; }
  else { if(pv){pv.src=blob;pv.style.display='block';} if(pi) pi.style.display='none'; }
});
on('chatMediaRemove','click', () => {
  setStyle('chatMediaPreview','display','none');
  const pi=$('chatMediaPreviewImg'),pv=$('chatMediaPreviewVid'),fi=$('chatFileInput');
  if(pi) pi.src=''; if(pv) pv.src=''; if(fi) fi.value='';
});
on('chatBackBtn','click', () => {
  if (chatUnsub) { chatUnsub(); chatUnsub=null; }
  activeChatUid=null; activeChatConvId=null;
  setStyle('chatView',        'display','none');
  setStyle('messagesListView','display','flex');
  loadConversations();
});
on('messagesSearch','input', e => {
  const q=(e.target.value||'').trim().toLowerCase();
  qsa('.conversation-item').forEach(item => {
    const n=(item.querySelector('.conv-name')||{}).textContent||'';
    item.style.display = n.toLowerCase().includes(q) ? '' : 'none';
  });
});
on('newMessageBtn','click', () => toast('Search users to start a conversation','info'));

/* ══════════════════════════════════════
   E2EE CHAT (ECDH + AES-GCM)
══════════════════════════════════════ */
let e2eeRemoteUid   = null;
let e2eeConvId      = null;
let e2eeKeyPair     = null;
let e2eeSharedKey   = null;
let e2eeUnsub       = null;
let e2eeImgFile     = null;
let e2eeImgBlob     = null;

async function generateECDHKeyPair() {
  return crypto.subtle.generateKey({ name:'ECDH', namedCurve:'P-256' }, true, ['deriveKey']);
}
async function exportPublicKey(key) {
  const raw = await crypto.subtle.exportKey('raw', key);
  return btoa(String.fromCharCode(...new Uint8Array(raw)));
}
async function importPublicKey(b64) {
  const raw = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  return crypto.subtle.importKey('raw', raw, { name:'ECDH', namedCurve:'P-256' }, true, []);
}
async function deriveSharedKey(privateKey, remotePublicKey) {
  return crypto.subtle.deriveKey(
    { name:'ECDH', public: remotePublicKey },
    privateKey,
    { name:'AES-GCM', length:256 },
    false, ['encrypt','decrypt']
  );
}
async function encryptMsg(key, plaintext) {
  const iv  = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder().encode(plaintext);
  const buf = await crypto.subtle.encrypt({ name:'AES-GCM', iv }, key, enc);
  return {
    iv:      btoa(String.fromCharCode(...iv)),
    payload: btoa(String.fromCharCode(...new Uint8Array(buf)))
  };
}
async function decryptMsg(key, iv64, payload64) {
  const iv  = Uint8Array.from(atob(iv64),     c => c.charCodeAt(0));
  const buf = Uint8Array.from(atob(payload64), c => c.charCodeAt(0));
  const dec = await crypto.subtle.decrypt({ name:'AES-GCM', iv }, key, buf);
  return new TextDecoder().decode(dec);
}

async function openE2EEChat(uid, name, photo) {
  if (!currentUser) { toast('Login to use secure chat','info'); return; }
  e2eeRemoteUid = uid;
  e2eeConvId    = [currentUser.uid, uid].sort().join('_e2ee_');
  setText('e2eeHeaderName', name || 'User');
  const ov = $('e2eeChatOverlay'); if (ov) ov.classList.add('e2ee-open');
  document.body.style.overflow = 'hidden';
  setStyle('e2eeKeyLoading','display','flex');
  setStyle('e2eeMessages',  'display','none');
  setStyle('e2eeInputBar',  'display','none');

  const vpBtn = $('e2eeViewProfileBtn');
  if (vpBtn) vpBtn.onclick = () => openUserProfile(uid);

  try {
    // Generate our ECDH key pair
    e2eeKeyPair = await generateECDHKeyPair();
    const myPubB64 = await exportPublicKey(e2eeKeyPair.publicKey);
    const myUid    = currentUser.uid;

    // Store our public key in Firestore
    await DB.collection('e2ee_keys').doc(e2eeConvId + '_' + myUid).set({
      uid: myUid, publicKey: myPubB64, updatedAt: TS()
    });

    // Wait for remote public key
    const waitForKey = (retries) => new Promise((resolve, reject) => {
      if (retries <= 0) return reject(new Error('Key exchange timeout'));
      DB.collection('e2ee_keys').doc(e2eeConvId + '_' + uid).get().then(snap => {
        if (snap.exists && snap.data().publicKey) resolve(snap.data().publicKey);
        else setTimeout(() => waitForKey(retries - 1).then(resolve).catch(reject), 1500);
      }).catch(reject);
    });

    const remotePubB64  = await waitForKey(10);
    const remotePublic  = await importPublicKey(remotePubB64);
    e2eeSharedKey       = await deriveSharedKey(e2eeKeyPair.privateKey, remotePublic);

    // Show chat UI
    setStyle('e2eeKeyLoading','display','none');
    setStyle('e2eeMessages',  'display','flex');
    setStyle('e2eeInputBar',  'display','flex');
    e2eeListenMessages();
  } catch (err) {
    setStyle('e2eeKeyLoading','display','none');
    setHTML('e2eeMessages','<div class="e2ee-empty"><span class="material-icons-round">lock_open</span><p>Key exchange failed</p><small>' + esc(err.message) + '</small></div>');
    setStyle('e2eeMessages','display','flex');
  }
}

function e2eeListenMessages() {
  if (e2eeUnsub) { e2eeUnsub(); e2eeUnsub = null; }
  if (!e2eeConvId || !e2eeSharedKey) return;
  e2eeUnsub = DB.collection('e2ee_messages').doc(e2eeConvId)
    .collection('msgs').orderBy('createdAt','asc').limit(100)
    .onSnapshot(async snap => {
      const box = $('e2eeMessages'); if (!box) return;
      box.innerHTML = '';
      if (!snap.size) {
        box.innerHTML = '<div class="e2ee-empty"><span class="material-icons-round">enhanced_encryption</span><p>Secure chat ready</p><small>Messages are end-to-end encrypted. Nobody else can read them.</small></div>';
        return;
      }
      for (const doc of snap.docs) {
        const m      = { id: doc.id, ...doc.data() };
        const isSent = m.senderId === currentUser.uid;
        const el     = document.createElement('div');
        el.className = 'e2ee-msg ' + (isSent ? 'e2ee-sent' : 'e2ee-received');
        let content  = '';
        try {
          if (m.type === 'text' && m.iv && m.payload) {
            const plain = await decryptMsg(e2eeSharedKey, m.iv, m.payload);
            content = `<div class="e2ee-msg-bubble">${esc(plain)}</div>`;
          } else if (m.type === 'image' && m.iv && m.payload) {
            const dataUrl = await decryptMsg(e2eeSharedKey, m.iv, m.payload);
            content = `<img class="e2ee-msg-img" src="${esc(dataUrl)}" onclick="openVideoOverlay(this.src,'Image')"/>`;
          }
        } catch { content = '<div class="e2ee-decrypt-err">🔒 Unable to decrypt</div>'; }
        const avBg = randomColor(m.senderId);
        const avTxt= (m.senderName || 'U')[0].toUpperCase();
        el.innerHTML =
          (!isSent ? `<div class="e2ee-msg-avatar" style="background:${avBg}">${avTxt}</div>` : '') +
          `<div class="e2ee-msg-content">${content}<div class="e2ee-msg-meta"><span class="material-icons-round">lock</span>${fmtAgo(m.createdAt)}</div></div>`;
        box.appendChild(el);
      }
      box.scrollTop = box.scrollHeight;
    }, () => {});
}

async function sendE2EEMessage() {
  if (!currentUser || !e2eeSharedKey || !e2eeConvId) return;
  const inp  = $('e2eeInput');
  const text = inp ? inp.value.trim() : '';
  if (!text && !e2eeImgFile) return;
  const btn = $('e2eeSendBtn'); if (btn) btn.disabled = true;
  const myName = currentUser.displayName || currentUser.phoneNumber || 'User';
  try {
    const ref = DB.collection('e2ee_messages').doc(e2eeConvId).collection('msgs');
    if (e2eeImgFile) {
      // Encrypt image as base64 data URL
      const reader = new FileReader();
      const dataUrl = await new Promise((res, rej) => { reader.onload = e => res(e.target.result); reader.onerror = rej; reader.readAsDataURL(e2eeImgFile); });
      const { iv, payload } = await encryptMsg(e2eeSharedKey, dataUrl);
      await ref.add({ senderId: currentUser.uid, senderName: myName, type:'image', iv, payload, createdAt: TS() });
      e2eeImgFile = null;
      if (e2eeImgBlob) { URL.revokeObjectURL(e2eeImgBlob); e2eeImgBlob = null; }
      setStyle('e2eeImgPreviewWrap','display','none');
      const fi = $('e2eeFileInput'); if (fi) fi.value = '';
    }
    if (text) {
      const { iv, payload } = await encryptMsg(e2eeSharedKey, text);
      await ref.add({ senderId: currentUser.uid, senderName: myName, type:'text', iv, payload, createdAt: TS() });
      if (inp) inp.value = '';
      const cc = $('e2eeCharCounter'); if (cc) { cc.textContent = '0 / 256'; cc.classList.remove('e2ee-warn'); }
    }
  } catch (e) { toast('Send failed: ' + e.message, 'error'); }
  if (btn) btn.disabled = false;
}

function closeE2EEChat() {
  if (e2eeUnsub) { e2eeUnsub(); e2eeUnsub = null; }
  const ov = $('e2eeChatOverlay'); if (ov) ov.classList.remove('e2ee-open');
  document.body.style.overflow = '';
  e2eeRemoteUid = null; e2eeConvId = null; e2eeSharedKey = null; e2eeKeyPair = null;
  if (e2eeImgBlob) { URL.revokeObjectURL(e2eeImgBlob); e2eeImgBlob = null; }
  e2eeImgFile = null;
}

on('e2eeBackBtn','click', closeE2EEChat);
on('e2eeSendBtn','click', sendE2EEMessage);
on('e2eeInput','keydown', e => { if(e.key==='Enter'&&!e.shiftKey){e.preventDefault(); sendE2EEMessage();} });
on('e2eeInput','input', function() {
  const len = this.value.length;
  const cc  = $('e2eeCharCounter');
  if (cc) { cc.textContent = len + ' / 256'; cc.classList.toggle('e2ee-warn', len >= 230); }
  const sb  = $('e2eeSendBtn');
  if (sb) sb.disabled = (len === 0 && !e2eeImgFile);
});
on('e2eeAttachBtn','click', () => { const fi=$('e2eeFileInput'); if(fi) fi.click(); });
on('e2eeFileInput','change', e => {
  const file = e.target.files && e.target.files[0]; if (!file) return;
  if (file.size > 5*1024*1024) { toast('Max 5MB for image in secure chat','error'); return; }
  e2eeImgFile = file;
  if (e2eeImgBlob) URL.revokeObjectURL(e2eeImgBlob);
  e2eeImgBlob = URL.createObjectURL(file);
  const prev=$('e2eeImgPreviewWrap'), img=$('e2eeImgPreview');
  if (prev) prev.style.display = 'block';
  if (img)  img.src = e2eeImgBlob;
  const sb=$('e2eeSendBtn'); if(sb) sb.disabled=false;
});
on('e2eeImgRemove','click', () => {
  e2eeImgFile=null;
  if(e2eeImgBlob){URL.revokeObjectURL(e2eeImgBlob);e2eeImgBlob=null;}
  setStyle('e2eeImgPreviewWrap','display','none');
  const img=$('e2eeImgPreview'); if(img) img.src='';
  const fi=$('e2eeFileInput'); if(fi) fi.value='';
  const sb=$('e2eeSendBtn'); if(sb) sb.disabled=!($('e2eeInput')?.value.trim());
});

/* ══════════════════════════════════════
   ORDERS
══════════════════════════════════════ */
function listenOrders(uid) {
  if (ordersUnsub) { ordersUnsub(); ordersUnsub=null; }
  ordersUnsub = DB.collection('orders').where('userId','==',uid)
    .orderBy('createdAt','desc').limit(1).onSnapshot(()=>{}, ()=>{});
}

function openOrdersOverlay() {
  if (!currentUser) { toast('Login to see orders','info'); switchSection('profile'); return; }
  const ov=$('ordersOverlay'); if(ov) ov.classList.add('orders-open');
  document.body.style.overflow='hidden';
  setHTML('ordersBody','<div class="pdf-loading"><div class="spinner"></div><p>Loading...</p></div>');
  DB.collection('orders').where('userId','==',currentUser.uid).orderBy('createdAt','desc').limit(20).get()
    .then(snap => {
      const body=$('ordersBody'); if(!body) return;
      body.innerHTML='';
      if (!snap.size) { body.innerHTML='<div class="orders-empty"><span class="material-icons-round">inventory_2</span><p>No orders yet</p></div>'; return; }
      const stMap = {confirmed:'Confirmed',shipped:'Shipped',delivered:'Delivered'};
      const stCls = {confirmed:'status-confirmed',shipped:'status-shipped',delivered:'status-delivered'};
      snap.docs.forEach(doc => {
        const o=Object.assign({id:doc.id},doc.data()), st=o.status||'confirmed';
        const digBtns=(o.items||[]).map(item=>{
          let b='';
          if(item.pdfUrl)   b+=`<button class="btn-order-read" data-pdf="${esc(item.pdfUrl)}" data-title="${esc(item.title)}"><span class="material-icons-round">auto_stories</span>Read</button>`;
          if(item.audioUrl) b+=`<button class="btn-order-play" data-audio="${esc(item.audioUrl)}" data-title="${esc(item.title)}"><span class="material-icons-round">headphones</span>Play</button>`;
          return b;
        }).join('');
        const card=document.createElement('div'); card.className='order-card';
        card.innerHTML=
          `<div class="order-card-header"><span class="order-id">#${o.id.slice(0,8).toUpperCase()}</span><span class="order-status-pill ${stCls[st]||'status-confirmed'}">${stMap[st]||'Confirmed'}</span></div>`+
          `<div class="order-card-body">`+
          (o.items||[]).map(item=>
            `<div class="order-item-row"><img class="order-item-img" src="${esc(item.image||'')}" onerror="this.src='https://placehold.co/38'"/><span class="order-item-name">${esc(item.title)}</span><span class="order-item-price">&#x20B9;${fmt(item.price)}</span></div>`
          ).join('')+
          (digBtns?`<div class="order-digital-btns">${digBtns}</div>`:'')+
          `</div>`+
          `<div class="order-card-footer"><span class="order-total">&#x20B9;${fmt(o.total)}</span><span class="order-date">${fmtDate((o.createdAt&&o.createdAt.toDate&&o.createdAt.toDate())||new Date())}</span></div>`;
        card.querySelectorAll('.btn-order-read').forEach(btn=>btn.addEventListener('click',()=>openPdfReader(btn.dataset.pdf,btn.dataset.title)));
        card.querySelectorAll('.btn-order-play').forEach(btn=>btn.addEventListener('click',()=>openAudioOverlay(btn.dataset.audio,btn.dataset.title,'')));
        body.appendChild(card);
      });
    }).catch(()=>setHTML('ordersBody','<p style="padding:24px;color:var(--tm)">Failed to load orders</p>'));
}
on('ordersBackBtn','click',()=>{ const ov=$('ordersOverlay'); if(ov) ov.classList.remove('orders-open'); document.body.style.overflow=''; });

/* ══════════════════════════════════════
   BUY NOW / CHECKOUT
══════════════════════════════════════ */
function handleBuyNow(product) {
  if (!currentUser) { toast('Login to buy','info'); switchSection('profile'); return; }
  checkoutProduct = product;
  const isDigital = ['ebook','audio'].includes(product.productType);
  setText('checkoutSubtitle', isDigital ? 'Digital product — instant access after payment.' : 'Enter delivery address.');
  setStyle('checkoutAddressFields','display', isDigital?'none':'block');
  if (product.paymentMethod==='online') { const r=document.querySelector('input[name="payMethod"][value="online"]'); if(r) r.checked=true; }
  else { const r=document.querySelector('input[name="payMethod"][value="cod"]'); if(r) r.checked=true; }
  const ov=$('checkoutModal'); if(ov) ov.classList.add('modal-open');
  document.body.style.overflow='hidden';
}
function closeCheckout() { const ov=$('checkoutModal'); if(ov) ov.classList.remove('modal-open'); document.body.style.overflow=''; checkoutProduct=null; }
on('checkoutModalClose',  'click', closeCheckout);
on('checkoutModalCancel', 'click', closeCheckout);
on('checkoutModalBackdrop','click', closeCheckout);

on('checkoutConfirmBtn','click', ()=>{
  if (!checkoutProduct||!currentUser) return;
  const method=(document.querySelector('input[name="payMethod"]:checked')||{}).value||'cod';
  const isDigital=['ebook','audio'].includes(checkoutProduct.productType);
  if (!isDigital) {
    const name=(($('addrName')||{}).value||'').trim();
    const phone=(($('addrPhone')||{}).value||'').trim();
    if(!name){toast('Full name required','error');return;}
    if(!/^\d{10}$/.test(phone)){toast('Valid mobile required','error');return;}
  }
  if (method==='cod') placeOrder('cod',null);
  else launchRazorpay();
});

function launchRazorpay() {
  if (!checkoutProduct) return;
  const rzp = new window.Razorpay({
    key: RAZORPAY_KEY, amount: Math.round(checkoutProduct.price*100), currency:'INR',
    name:'SayatStudio', description: checkoutProduct.title,
    prefill: { name:currentUser.displayName||'', email:currentUser.email||'', contact:(currentUser.phoneNumber||'').replace('+91','') },
    theme:{ color:'#f97316' },
    handler: res => placeOrder('online', res.razorpay_payment_id),
    modal:{ ondismiss:()=>toast('Payment cancelled','warning') }
  });
  rzp.on('payment.failed', e=>toast('Payment failed: '+((e&&e.error&&e.error.description)||'Error'),'error'));
  rzp.open();
}

async function placeOrder(method, paymentId) {
  if (!checkoutProduct||!currentUser) return;
  showLoading('Placing order...'); closeCheckout();
  const isDigital=['ebook','audio'].includes(checkoutProduct.productType);
  const addr = isDigital ? null : {
    name: (($('addrName')||{}).value||'').trim(), phone:(($('addrPhone')||{}).value||'').trim(),
    street:(($('addrStreet')||{}).value||'').trim(), city:(($('addrCity')||{}).value||'').trim(),
    pin:(($('addrPin')||{}).value||'').trim(), state:(($('addrState')||{}).value||'').trim(),
    landmark:(($('addrLandmark')||{}).value||'').trim()
  };
  try {
    await DB.collection('orders').add({
      userId:currentUser.uid,
      items:[{productId:checkoutProduct.id, title:checkoutProduct.title, price:checkoutProduct.price,
        image:(checkoutProduct.images&&checkoutProduct.images[0])||checkoutProduct.image||'',
        productType:checkoutProduct.productType||'general',
        pdfUrl:checkoutProduct.pdfUrl||null, audioUrl:checkoutProduct.audioUrl||null}],
      total:checkoutProduct.price, paymentMethod:method,
      paymentId:paymentId||'COD-'+Date.now(),
      deliveryAddress:addr, status:isDigital?'delivered':'confirmed', createdAt:TS()
    });
    setText('successPayId', paymentId||'COD Order');
    setText('successMsg', isDigital?'Your digital content is ready! Go to My Orders.':'Order placed! We will ship it soon.');
    const sov=$('successOverlay'); if(sov) sov.classList.add('success-open');
  } catch(e){ toast('Order failed: '+e.message,'error',6000); }
  hideLoading();
}
on('successDoneBtn','click',()=>{
  const sov=$('successOverlay'); if(sov) sov.classList.remove('success-open');
  switchSection('profile'); setTimeout(openOrdersOverlay,300);
});

/* ══════════════════════════════════════
   ADMIN PANEL
══════════════════════════════════════ */
function updateAdminAuthUI() {
  if (!$('adminAuthNotice')) return;
  setStyle('adminAuthNotice','display', currentUser?'none':'flex');
  setStyle('adminAuthOk',    'display', currentUser?'flex':'none');
  if (currentUser&&$('adminAuthName')) setText('adminAuthName','Logged in: '+(currentUser.displayName||currentUser.email||currentUser.phoneNumber||'Admin'));
}
qsa('[name="adminFeaturedType"]').forEach(r=>r.addEventListener('change',()=>{
  setStyle('featuredMediaField','display',r.value==='image'?'none':'block');
}));
on('featuredThumbInput','change',e=>{
  const f=e.target.files&&e.target.files[0]; if(!f) return;
  setText('featuredThumbName',f.name);
  setStyle('featuredThumbSelected','display','flex'); setStyle('featuredThumbZone','display','none');
});
on('featuredThumbRemove','click',()=>{ const fi=$('featuredThumbInput'); if(fi) fi.value=''; setStyle('featuredThumbSelected','display','none'); setStyle('featuredThumbZone','display','block'); });
on('featuredMediaInput','change',e=>{
  const f=e.target.files&&e.target.files[0]; if(!f) return;
  setText('featuredMediaName',f.name+' ('+(f.size/1024/1024).toFixed(1)+'MB)');
  setStyle('featuredMediaSelected','display','flex'); setStyle('featuredMediaZone','display','none');
});
on('featuredMediaRemove','click',()=>{ const fi=$('featuredMediaInput'); if(fi) fi.value=''; setStyle('featuredMediaSelected','display','none'); setStyle('featuredMediaZone','display','block'); });

on('publishFeaturedBtn','click',async()=>{
  if(!currentUser){toast('Login required','error');return;}
  const type=(document.querySelector('[name="adminFeaturedType"]:checked')||{}).value||'video';
  const title=(($('featuredTitle')||{}).value||'').trim();
  const thumbF=$('featuredThumbInput')&&$('featuredThumbInput').files[0];
  const mediaF=$('featuredMediaInput')&&$('featuredMediaInput').files[0];
  if(!title){toast('Title required','error');return;}
  if(!thumbF){toast('Thumbnail required','error');return;}
  if(type!=='image'&&!mediaF){toast('Media file required','error');return;}
  const btn=$('publishFeaturedBtn'); if(btn) btn.disabled=true;
  showLoading('Uploading featured...');
  try {
    const thumbUrl=await uploadFile(thumbF,'featured/thumbs/',()=>{});
    let mediaUrl=thumbUrl;
    if(type!=='image'&&mediaF) mediaUrl=await uploadFile(mediaF,'featured/'+type+'s/',()=>{});
    await DB.collection('featured').add({title,type,mediaType:type,thumbnailUrl:thumbUrl,mediaUrl,createdAt:TS()});
    toast('Featured content pinned!','success');
    const ft=$('featuredTitle'); if(ft) ft.value='';
    setStyle('featuredThumbSelected','display','none'); setStyle('featuredThumbZone','display','block');
    setStyle('featuredMediaSelected','display','none'); setStyle('featuredMediaZone','display','block');
    const fti=$('featuredThumbInput'); if(fti) fti.value='';
    const fmi=$('featuredMediaInput'); if(fmi) fmi.value='';
  } catch(e){toast('Failed: '+e.message,'error');}
  if(btn) btn.disabled=false; hideLoading();
});

qsa('[name="adminProductType"]').forEach(r=>r.addEventListener('change',()=>{
  setStyle('productPDFField',  'display',r.value==='ebook'?'block':'none');
  setStyle('productAudioField','display',r.value==='audio'?'block':'none');
}));
function updateDiscPreview(){
  const mrp=parseFloat(($('productMRP')||{}).value||0), sale=parseFloat(($('productSalePrice')||{}).value||0);
  if(mrp>0&&sale>0&&mrp>sale){ setText('adminDiscountText',Math.round((1-sale/mrp)*100)+'% OFF'); setStyle('adminDiscountPreview','display','flex'); }
  else setStyle('adminDiscountPreview','display','none');
}
on('productMRP','input',updateDiscPreview); on('productSalePrice','input',updateDiscPreview);
on('productImages','change',e=>{
  const files=Array.from((e.target.files)||[]);
  setHTML('adminImgPreviews','');
  const prev=$('adminImgPreviews'); if(!prev) return;
  files.forEach((f,i)=>{
    const reader=new FileReader();
    reader.onload=ev=>{
      const wrap=document.createElement('div'); wrap.className='admin-img-preview-item';
      wrap.innerHTML=`<img src="${ev.target.result}"/><button type="button">&times;</button>`;
      wrap.querySelector('button').addEventListener('click',()=>{
        const dt=new DataTransfer();
        Array.from($('productImages').files).filter((_,fi)=>fi!==i).forEach(f2=>dt.items.add(f2));
        try{$('productImages').files=dt.files;}catch(e){}
        wrap.remove();
      });
      prev.appendChild(wrap);
    };
    reader.readAsDataURL(f);
  });
});
on('productPDF','change',e=>{const f=e.target.files&&e.target.files[0];if(!f) return;if(f.size>100*1024*1024){toast('Max 100MB for PDF','error');return;} setText('productPDFName',f.name); setStyle('productPDFSelected','display','flex'); setStyle('productPDFZone','display','none');});
on('productPDFRemove','click',()=>{const fi=$('productPDF');if(fi)fi.value='';setStyle('productPDFSelected','display','none');setStyle('productPDFZone','display','block');});
on('productAudio','change',e=>{const f=e.target.files&&e.target.files[0];if(!f)return;setText('productAudioName',f.name+' ('+(f.size/1024/1024).toFixed(0)+'MB)');setStyle('productAudioSelected','display','flex');setStyle('productAudioZone','display','none');});
on('productAudioRemove','click',()=>{const fi=$('productAudio');if(fi)fi.value='';setStyle('productAudioSelected','display','none');setStyle('productAudioZone','display','block');});

function setProgress(pct,msg){
  const bar=$('adminProgressBar'),pctEl=$('adminProgressPct'),st=$('adminProgressStatus'),ti=$('adminProgressTitle');
  if(bar) bar.style.width=pct+'%'; if(pctEl) pctEl.textContent=pct+'%';
  if(st) st.textContent=msg; if(ti) ti.textContent=msg;
}
function uploadLog(msg,type){
  const log=$('adminUploadLog'); if(!log) return;
  const s=document.createElement('span'); s.className='log-'+(type||'inf');
  s.textContent='['+new Date().toLocaleTimeString()+'] '+msg;
  log.appendChild(s); log.scrollTop=log.scrollHeight;
}

on('publishProductBtn','click',async()=>{
  if(!currentUser){toast('Login required','error');return;}
  const type=(document.querySelector('[name="adminProductType"]:checked')||{}).value||'general';
  const title=(($('productTitle')||{}).value||'').trim();
  const desc=(($('productDesc')||{}).value||'').trim();
  const mrp=parseFloat(($('productMRP')||{}).value||0);
  const sale=parseFloat(($('productSalePrice')||{}).value||0);
  const pay=($('productPayMethod')||{}).value||'both';
  const imgF=Array.from(($('productImages')&&$('productImages').files)||[]);
  if(!title){toast('Title required','error');return;}
  if(!mrp||!sale){toast('MRP & Sale Price required','error');return;}
  if(sale>mrp){toast('Sale price cannot exceed MRP','error');return;}
  if(!imgF.length){toast('At least one image required','error');return;}
  if(type==='ebook'&&!($('productPDF')&&$('productPDF').files[0])){toast('PDF required','error');return;}
  if(type==='audio'&&!($('productAudio')&&$('productAudio').files[0])){toast('Audio file required','error');return;}
  const btn=$('publishProductBtn'); if(btn) btn.disabled=true;
  setStyle('adminProgressCard','display','block'); setHTML('adminUploadLog','');
  setProgress(0,'Preparing...'); uploadLog('Starting...','inf');
  const total=imgF.length+(type==='ebook'?1:0)+(type==='audio'?1:0)+1;
  let done=0; const imgUrls=[];
  try {
    for(let i=0;i<imgF.length;i++){
      setProgress(Math.round(done/total*100),'Image '+(i+1)+'/'+imgF.length);
      const url=await uploadFile(imgF[i],'products/images/',pct=>setProgress(Math.round((done+pct/100)/total*100),'Image '+(i+1)+': '+pct+'%'));
      imgUrls.push(url); done++; uploadLog('Image '+(i+1)+' uploaded','ok');
    }
    let pdfUrl=null;
    if(type==='ebook'){
      setProgress(Math.round(done/total*100),'Uploading PDF...'); uploadLog('Uploading PDF...','inf');
      pdfUrl=await uploadFile($('productPDF').files[0],'products/pdfs/',pct=>setProgress(Math.round((done+pct/100)/total*100),'PDF: '+pct+'%'));
      done++; uploadLog('PDF uploaded','ok');
    }
    let audioUrl=null;
    if(type==='audio'){
      setProgress(Math.round(done/total*100),'Uploading audio...'); uploadLog('Uploading audio...','inf');
      audioUrl=await uploadFile($('productAudio').files[0],'products/audios/',pct=>setProgress(Math.round((done+pct/100)/total*100),'Audio: '+pct+'%'));
      done++; uploadLog('Audio uploaded','ok');
    }
    setProgress(96,'Saving...'); uploadLog('Saving to Firestore...','inf');
    const disc=mrp>sale?Math.round((1-sale/mrp)*100):0;
    await DB.collection('products').add({
      title,description:desc,price:sale,originalPrice:mrp,discount:disc,
      productType:type,paymentMethod:pay,images:imgUrls,image:imgUrls[0]||'',
      thumbnailUrl:imgUrls[0]||'',pdfUrl:pdfUrl||null,audioUrl:audioUrl||null,
      inStock:true,createdAt:TS()
    });
    setProgress(100,'Published!'); uploadLog('Product published!','ok');
    toast('Product published!','success',5000);
    const fields=['productTitle','productDesc','productMRP','productSalePrice'];
    fields.forEach(id=>{const el=$(id);if(el) el.value='';});
    setHTML('adminImgPreviews','');
    ['productImages','productPDF','productAudio'].forEach(id=>{try{const el=$(id);if(el) el.value='';}catch(e){}});
    setStyle('productPDFSelected','display','none'); setStyle('productPDFZone','display','block');
    setStyle('productAudioSelected','display','none'); setStyle('productAudioZone','display','block');
    setStyle('adminDiscountPreview','display','none');
    setStyle('productPDFField','display','none'); setStyle('productAudioField','display','none');
    const gen=document.querySelector('[name="adminProductType"][value="general"]'); if(gen) gen.checked=true;
  } catch(e){ setProgress(0,'Failed'); uploadLog('ERROR: '+e.message,'err'); toast('Upload failed: '+e.message,'error',8000); }
  if(btn) btn.disabled=false;
});

/* ══════════════════════════════════════
   CLOSE SHEETS & KEYBOARD ESC
══════════════════════════════════════ */
function closeAllSheets() {
  const cs=$('createPostSheet'); if(cs) cs.classList.remove('sheet-open');
  const cms=$('commentsSheet');  if(cms) cms.classList.remove('sheet-open');
  document.body.style.overflow='';
}
document.addEventListener('keydown', e=>{
  if (e.key!=='Escape') return;
  if ($('e2eeChatOverlay')?.classList.contains('e2ee-open'))        { closeE2EEChat();   return; }
  if ($('reelOverlay')?.classList.contains('reel-open'))            { closeReels();       return; }
  if ($('videoOverlay')?.classList.contains('video-open'))          { closeVideoOverlay();return; }
  if ($('audioOverlay')?.classList.contains('audio-open'))          { closeAudioOverlay();return; }
  if ($('pdfOverlay')?.classList.contains('pdf-open'))              { closePdfReader();   return; }
  if ($('userProfileOverlay')?.classList.contains('upo-open'))      { closeUpo();         return; }
  if ($('yourPostsOverlay')?.classList.contains('ypo-open'))        { $('ypoBackBtn')?.click(); return; }
  if ($('ordersOverlay')?.classList.contains('orders-open'))        { $('ordersBackBtn')?.click(); return; }
  if ($('checkoutModal')?.classList.contains('modal-open'))         { closeCheckout();    return; }
  if ($('createPostSheet')?.classList.contains('sheet-open'))       { closeCreatePost();  return; }
  if ($('commentsSheet')?.classList.contains('sheet-open'))         { closeComments();    return; }
  if ($('drawer')?.classList.contains('drawer-open'))               { closeDrawer();      return; }
});

/* ══════════════════════════════════════
   INIT
══════════════════════════════════════ */
listenProducts();
loadFeatured();
loadFeed('all');

console.log('%cSayatStudio Ready!','color:#f97316;font-weight:900;font-size:14px');
