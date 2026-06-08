'use strict';
/* ═══════════════════════════════════════════════════
   SAYATX — app.js  v6.0
   Phone · Email · Anonymous login (no Google)
   Background upload with % · Thumbnail picker
   Sponsor links · Follow fix · Comments newest first
═══════════════════════════════════════════════════ */

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
try{ DB.enablePersistence({synchronizeTabs:true}).catch(e=>{ if(e.code!=='failed-precondition'&&e.code!=='unimplemented') console.warn('Persistence:',e.code); }); }catch(e){}
if(typeof pdfjsLib!=='undefined') pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const RAZORPAY_KEY = 'rzp_live_SkOEXpqOtkBrwk';
const LOGO_URL     = 'https://firebasestorage.googleapis.com/v0/b/sayat-kart.firebasestorage.app/o/products%2FAdobe%20Express%20-%20file.png?alt=media&token=65c25cb1-becd-4fb3-91d1-89f6f6898cd1';
const ADMIN_DIGEST = 'b48764d71f2345c31d7a346c490764b3635d62dbaf04ddb4802db5a8a572063a';
const ADMIN_B64    = btoa(unescape(encodeURIComponent('Aayat@28April')));
const TS  = () => firebase.firestore.FieldValue.serverTimestamp();
const INC = n  => firebase.firestore.FieldValue.increment(n);
const DEL = () => firebase.firestore.FieldValue.delete();

/* ── DOM helpers ── */
const $   = id  => document.getElementById(id);
const qs  = (s,ctx) => (ctx||document).querySelector(s);
const qsa = (s,ctx) => [...(ctx||document).querySelectorAll(s)];
function on(id,evt,fn){ const e=typeof id==='string'?$(id):id; if(e) e.addEventListener(evt,fn); }
function setText(id,v)    { const e=typeof id==='string'?$(id):id; if(e) e.textContent=v; }
function setHTML(id,v)    { const e=typeof id==='string'?$(id):id; if(e) e.innerHTML=v; }
function setStyle(id,p,v) { const e=typeof id==='string'?$(id):id; if(e) e.style[p]=v; }

/* ── Utils ── */
function esc(s){ const d=document.createElement('div'); d.appendChild(document.createTextNode(s||'')); return d.innerHTML; }
function fmt(n){ return Number(n||0).toLocaleString('en-IN',{minimumFractionDigits:0,maximumFractionDigits:2}); }
function fmtDate(d){ return new Date(d).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}); }
function fmtAgo(ts){ if(!ts) return 'now'; const d=ts.toDate?ts.toDate():new Date(ts),diff=Date.now()-d.getTime(); const m=Math.floor(diff/60000),h=Math.floor(m/60),dy=Math.floor(h/24); if(dy>0) return dy+'d'; if(h>0) return h+'h'; if(m>0) return m+'m'; return 'now'; }
function fmtTime(s){ if(!s||isNaN(s)) return '0:00'; return Math.floor(s/60)+':'+String(Math.floor(s%60)).padStart(2,'0'); }
function fmtCount(n){ n=Number(n)||0; if(n>=1000000) return (n/1e6).toFixed(1)+'M'; if(n>=1000) return (n/1000).toFixed(1)+'K'; return String(n); }
function getMime(n){ const e=(n||'').split('.').pop().toLowerCase(); return({jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',gif:'image/gif',webp:'image/webp',mp4:'video/mp4',webm:'video/webm',mov:'video/quicktime',mp3:'audio/mpeg',wav:'audio/wav',ogg:'audio/ogg',aac:'audio/aac',m4a:'audio/mp4',pdf:'application/pdf'})[e]||'application/octet-stream'; }
function randomColor(uid){ const c=['#f97316','#8b5cf6','#06b6d4','#ec4899','#22c55e','#f59e0b','#3b82f6']; if(!uid) return c[0]; let h=0; for(let i=0;i<uid.length;i++) h=uid.charCodeAt(i)+((h<<5)-h); return c[Math.abs(h)%c.length]; }

/* ── Loading & Toast ── */
function showLoading(msg){ setText('loadingMsg',msg||'Processing...'); const e=$('loadingOverlay'); if(e) e.classList.add('loading-open'); }
function hideLoading(){ const e=$('loadingOverlay'); if(e) e.classList.remove('loading-open'); }
function toast(msg,type,dur){ type=type||'info';dur=dur||3000; const c=$('toastContainer');if(!c) return; const el=document.createElement('div');el.className='toast toast-'+type;el.textContent=msg;c.appendChild(el); setTimeout(()=>{el.style.opacity='0';el.style.transition='opacity .4s';setTimeout(()=>el.remove(),400);},dur); }

/* ── Admin verify ── */
async function hashStr(s){ try{ const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)); return Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,'0')).join(''); }catch{ return null; } }
async function verifyAdmin(input){ if(!input) return false; const h=await hashStr(input); if(h!==null) return h===ADMIN_DIGEST; try{ if(btoa(unescape(encodeURIComponent(input)))===ADMIN_B64) return true; }catch(e){} if(currentUser){ try{ const s=await DB.collection('admins').doc(currentUser.uid).get(); return !!(s&&s.exists); }catch(e){} } return false; }

/* ── State ── */
let currentUser=null,allProducts=[],feedUnsub=null,ordersUnsub=null;
let chatUnsub=null,notifUnsub=null,activeChatUid=null,activeChatConvId=null;
let rcaptchaVerifier=null,rcaptchaResult=null;
let createPostType='text',createMediaFile=null,createMediaBlob=null,createThumbFile=null,createThumbBlob=null;
let currentReelItems=[],currentReelObs=null,commentsPostId=null,checkoutProduct=null;
const viewedPosts=new Set();
const likedPosts=JSON.parse(localStorage.getItem('sx_liked')||'{}');
window._feedItems=[];

/* Inject brand-X animation */
(function(){ const s=document.createElement('style'); s.textContent=`@keyframes brandX{0%{background-position:0%}100%{background-position:200%}} .brand-x{background:linear-gradient(90deg,#f97316,#ec4899,#8b5cf6,#06b6d4,#f97316);background-size:300% 100%;-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;animation:brandX 2.5s linear infinite;font-weight:900}`; document.head.appendChild(s); })();

/* ── Theme ── */
let isDark=localStorage.getItem('sx_theme')!=='light';
function applyTheme(dark){ isDark=dark; document.documentElement.setAttribute('data-theme',dark?'dark':'light'); localStorage.setItem('sx_theme',dark?'dark':'light'); setText('drawerThemeIcon',dark?'light_mode':'dark_mode'); setText('profileThemeIcon',dark?'light_mode':'dark_mode'); const ds=$('drwSwitch'),ps=$('profileDarkSwitch'); if(ds) ds.classList.toggle('switch-on',dark); if(ps) ps.classList.toggle('switch-on',dark); }
applyTheme(isDark);
on('drawerThemeToggle','click',()=>applyTheme(!isDark));
on('menuTheme','click',()=>applyTheme(!isDark));
on('overlay','click',()=>{closeDrawer();closeAllSheets();});

/* ── Logo update ── */
function updateLogos(){ qsa('img[data-logo]').forEach(img=>img.src=LOGO_URL); qsa('.brand-name-el').forEach(el=>{ if(!el.querySelector('.brand-x')){const t=el.textContent||'SayatX';el.innerHTML=`<span style="color:var(--txt)">${esc(t.slice(0,-1))}</span><span class="brand-x">X</span>`;} }); }
setTimeout(updateLogos,100);

/* ══════════════════════════════════════
   DRAWER
══════════════════════════════════════ */
function openDrawer(){ const d=$('drawer'),o=$('overlay'),m=$('menuBtn'); if(d) d.classList.add('drawer-open'); if(o) o.classList.add('active'); if(m) m.classList.add('menu-open'); document.body.style.overflow='hidden'; }
function closeDrawer(){ const d=$('drawer'),o=$('overlay'),m=$('menuBtn'); if(d) d.classList.remove('drawer-open'); if(o) o.classList.remove('active'); if(m) m.classList.remove('menu-open'); document.body.style.overflow=''; }
on('menuBtn','click',openDrawer); on('drawerCloseBtn','click',closeDrawer);
on('drawerLoginBtn','click',()=>{closeDrawer();switchSection('profile');});
on('drawerLogoutBtn','click',()=>{closeDrawer();handleLogout();});
qsa('[data-drawer-nav]').forEach(btn=>{ btn.addEventListener('click',()=>{ qsa('[data-drawer-nav]').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); closeDrawer(); handleDrawerNav(btn.dataset.drawerNav); }); });
function handleDrawerNav(nav){ switch(nav){ case 'home': loadFeed('all');switchSection('home');break; case 'trending': loadFeed('trending');switchSection('home');break; case 'videos': loadFeed('videos');switchSection('home');break; case 'photos': loadFeed('photos');switchSection('home');break; case 'shop': loadFeed('shop');switchSection('home');break; case 'your-posts': if(!currentUser){toast('Login required','info');switchSection('profile');}else openYourPosts();break; case 'orders': if(!currentUser){toast('Login required','info');switchSection('profile');}else openOrdersOverlay();break; case 'notifications': openNotificationsPanel();break; case 'saved': toast('Saved — coming soon','info');break; case 'settings': if(!currentUser){toast('Login required','info');}else openSettings();break; case 'about': toast('SayatX v6.0','info');break; default: switchSection('home'); } }

/* ══════════════════════════════════════
   SECTIONS
══════════════════════════════════════ */
const SECTIONS={home:'sectionHome',messages:'sectionMessages',profile:'sectionProfile'};
let currentSection='home';
function switchSection(name){ if(!SECTIONS[name]) return; currentSection=name; Object.entries(SECTIONS).forEach(([k,id])=>{const el=$(id);if(el) el.classList.toggle('active',k===name);}); const adm=$('sectionAdmin');if(adm){adm.classList.remove('admin-visible');adm.style.display='';} qsa('[data-bnav]').forEach(b=>b.classList.toggle('bnav-active',b.dataset.bnav===name)); qsa('[data-drawer-nav]').forEach(b=>b.classList.toggle('active',b.dataset.drawerNav===name)); window.scrollTo({top:0,behavior:'smooth'}); if(name==='messages') initMessages(); if(name==='profile') refreshProfileUI(); }
qsa('[data-bnav]').forEach(btn=>btn.addEventListener('click',()=>switchSection(btn.dataset.bnav)));

/* Admin 10 taps */
let brandTaps=0,brandTimer=null;
on('headerBrand','click',()=>{ brandTaps++;clearTimeout(brandTimer);brandTimer=setTimeout(()=>{brandTaps=0;},3000); if(brandTaps>=10){ brandTaps=0; const pwd=prompt('Admin password:'); if(pwd===null) return; verifyAdmin(pwd).then(ok=>{ if(ok){ qsa('.app-section').forEach(s=>s.classList.remove('active')); const adm=$('sectionAdmin'); if(adm){adm.style.display='block';adm.classList.add('admin-visible');} updateAdminAuthUI(); toast('Admin Panel unlocked','success'); window.scrollTo({top:0}); }else toast('Wrong password','error'); }); } });

/* ══════════════════════════════════════
   SEARCH
══════════════════════════════════════ */
on('mobileSearchToggle','click',()=>{ const bar=$('mobileSearchBar');if(!bar) return; bar.classList.toggle('visible'); if(bar.classList.contains('visible')){const inp=$('mobileSearchInput');if(inp) inp.focus();} });
on('mobileSearchClose','click',()=>{ const bar=$('mobileSearchBar');if(bar) bar.classList.remove('visible'); const inp=$('mobileSearchInput');if(inp) inp.value=''; closeSearchPanel(); });
on('mobileSearchInput','input',e=>doSearch(e.target.value));
on('searchInput','input',e=>{ const cb=$('searchClearBtn');if(cb) cb.style.display=e.target.value?'flex':'none'; doSearch(e.target.value); });
on('searchClearBtn','click',()=>{ const si=$('searchInput');if(si) si.value=''; const cb=$('searchClearBtn');if(cb) cb.style.display='none'; closeSearchPanel(); });
on('notifBtn','click',openNotificationsPanel);
function closeSearchPanel(){ setStyle('searchResultsPanel','display','none');setStyle('feedContainer','display','');setStyle('featuredStrip','display',''); }
async function doSearch(q){ if(!(q||'').trim()){closeSearchPanel();return;} if(currentSection!=='home') switchSection('home'); setStyle('featuredStrip','display','none');setStyle('feedContainer','display','none');setStyle('searchResultsPanel','display','block'); setText('searchResultsLabel','Results for "'+q+'"');setStyle('searchNoResult','display','none');setHTML('searchResultsList',''); const lower=q.trim().toLowerCase(); const prodResults=allProducts.filter(p=>(p.title||'').toLowerCase().includes(lower)); let postResults=[],userResults=[]; try{const snap=await DB.collection('posts').orderBy('createdAt','desc').limit(100).get();postResults=snap.docs.map(d=>({id:d.id,...d.data(),_type:'post'})).filter(p=>!p.status&&((p.text||'').toLowerCase().includes(lower)||(p.userName||'').toLowerCase().includes(lower)));}catch(e){} try{const snap=await DB.collection('users').orderBy('displayName').get();userResults=snap.docs.map(d=>({id:d.id,...d.data()})).filter(u=>(u.displayName||'').toLowerCase().includes(lower)).slice(0,8);}catch(e){} const list=$('searchResultsList');if(!list) return; let found=false; if(userResults.length){found=true;const lbl=document.createElement('p');lbl.style.cssText='padding:8px 14px;font-size:.76rem;font-weight:800;color:var(--tm);text-transform:uppercase;';lbl.textContent='People';list.appendChild(lbl);userResults.forEach(u=>{const el=document.createElement('div');el.style.cssText='display:flex;align-items:center;gap:12px;padding:11px 14px;border-bottom:1px solid var(--bdr);cursor:pointer;';const av=document.createElement('div');av.style.cssText='width:42px;height:42px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:900;color:#fff;font-size:1rem;flex-shrink:0;overflow:hidden;background:'+randomColor(u.id);if(u.photoURL){const img=document.createElement('img');img.src=u.photoURL;img.style.cssText='width:100%;height:100%;object-fit:cover';av.appendChild(img);}else av.textContent=(u.displayName||'U')[0].toUpperCase();el.appendChild(av);const info=document.createElement('div');info.innerHTML='<p style="font-weight:800;font-size:.9rem;color:var(--txt)">'+esc(u.displayName||'User')+'</p><p style="font-size:.76rem;color:var(--tm)">@'+esc((u.displayName||'user').toLowerCase().replace(/\s+/g,'_'))+'</p>';el.appendChild(info);el.addEventListener('click',()=>openUserProfile(u.id));list.appendChild(el);});} if(postResults.length||prodResults.length){found=true;const lbl=document.createElement('p');lbl.style.cssText='padding:8px 14px;font-size:.76rem;font-weight:800;color:var(--tm);text-transform:uppercase;';lbl.textContent='Posts & Products';list.appendChild(lbl);[...postResults,...prodResults.map(p=>({...p,_type:'product'}))].forEach(item=>{const el=item._type==='product'?buildProductPost(item):buildUserPost(item);if(el) list.appendChild(el);});} if(!found){setStyle('searchNoResult','display','block');setText('searchNoResultMsg','No results for "'+q+'"');} }

/* ══════════════════════════════════════
   UPLOAD — chunked for large files
══════════════════════════════════════ */
function uploadFile(file,folder,onProgress){ return new Promise((resolve,reject)=>{ if(!file){reject(new Error('No file'));return;} if(!currentUser){reject(new Error('Not logged in'));return;} const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,100); const path=folder+currentUser.uid+'_'+Date.now()+'_'+safeName; const ref=Storage.ref(path); const meta={contentType:getMime(file.name),customMetadata:{uid:currentUser.uid}}; const task=ref.put(file,meta); task.on('state_changed', snap=>{const pct=snap.totalBytes>0?Math.round(snap.bytesTransferred/snap.totalBytes*100):0;if(onProgress) onProgress(pct);}, err=>reject(err), ()=>task.snapshot.ref.getDownloadURL().then(resolve).catch(reject) ); }); }

function generateVideoThumbnail(file){ return new Promise(resolve=>{ const video=document.createElement('video'); const url=URL.createObjectURL(file); video.src=url;video.muted=true;video.playsInline=true;video.currentTime=0.5; video.addEventListener('seeked',()=>{ const canvas=document.createElement('canvas'); canvas.width=video.videoWidth||640;canvas.height=video.videoHeight||360; canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height); canvas.toBlob(blob=>{URL.revokeObjectURL(url);resolve(blob||null);},'image/jpeg',0.85); },{once:true}); video.addEventListener('error',()=>{URL.revokeObjectURL(url);resolve(null);},{once:true}); video.load(); }); }

/* ══════════════════════════════════════
   AUTH — Phone · Email · Anonymous
   No Google login (WebView safe)
══════════════════════════════════════ */
Auth.onAuthStateChanged(user=>{ currentUser=user; refreshAuthUI(user); if(user){ensureUserDoc(user);listenNotifications(user.uid);listenOrders(user.uid);updateDrawerStrip(user);}else{if(notifUnsub){notifUnsub();notifUnsub=null;}if(ordersUnsub){ordersUnsub();ordersUnsub=null;}} handleDeepLink(); });

function refreshAuthUI(user){ const in_=!!user; setStyle('authScreen','display',in_?'none':'block');setStyle('profileScreen','display',in_?'block':'none'); setStyle('drawerLoginBtn','display',in_?'none':'flex');setStyle('drawerLogoutBtn','display',in_?'flex':'none');setStyle('drawerUserStrip','display',in_?'block':'none'); updateAdminAuthUI(); }

function ensureUserDoc(user){ if(!user) return; const ref=DB.collection('users').doc(user.uid); ref.get().then(snap=>{ const name=user.displayName||user.phoneNumber||user.email?.split('@')[0]||'Guest'; const data={uid:user.uid,displayName:name,email:user.email||'',phone:user.phoneNumber||'',photoURL:user.photoURL||'',isAnonymous:user.isAnonymous||false,updatedAt:TS()}; if(!snap.exists) ref.set({...data,followers:0,following:0,postCount:0,createdAt:TS()}); else ref.update(data); }).catch(()=>{}); }

function updateDrawerStrip(user){ if(!user) return; const name=user.displayName||user.phoneNumber||user.email?.split('@')[0]||(user.isAnonymous?'Guest':'User'); setText('drawerUserName',name);setText('drawerUserHandle','@'+name.toLowerCase().replace(/[^a-z0-9]/g,'_')); const img=$('drawerUserAvatarImg'),ltr=$('drawerUserAvatarLetter'); if(user.photoURL){if(img){img.src=user.photoURL;img.style.display='block';}if(ltr) ltr.style.display='none';}else{if(ltr){ltr.textContent=name[0].toUpperCase();ltr.style.display='flex';}if(img) img.style.display='none';} DB.collection('users').doc(user.uid).get().then(snap=>{if(!snap.exists) return;const d=snap.data();setText('drawerPostCount',fmtCount(d.postCount||0));setText('drawerFollowerCount',fmtCount(d.followers||0));}).catch(()=>{}); }

function refreshProfileUI(){ if(!currentUser) return; const name=currentUser.displayName||currentUser.phoneNumber||currentUser.email?.split('@')[0]||(currentUser.isAnonymous?'Guest':'User'); setText('profileDisplayName',name);setText('profileHandle','@'+name.toLowerCase().replace(/[^a-z0-9]/g,'_')); const img=$('profileAvatarImg'),ltr=$('profileAvatarLetter'); if(currentUser.photoURL){if(img){img.src=currentUser.photoURL;img.style.display='block';}if(ltr) ltr.style.display='none';}else{if(ltr){ltr.textContent=name[0].toUpperCase();ltr.style.display='flex';}if(img) img.style.display='none';} DB.collection('users').doc(currentUser.uid).get().then(snap=>{if(!snap.exists) return;const d=snap.data();setText('profilePostCount',fmtCount(d.postCount||0));setText('profileFollowerCount',fmtCount(d.followers||0));setText('profileFollowingCount',fmtCount(d.following||0));}).catch(()=>{}); }

/* ── Build auth screen in DOM ── */
function buildAuthScreen(){
  const authScreen=$('authScreen'); if(!authScreen) return;
  authScreen.innerHTML=`
  <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;">
  <div style="background:var(--card);border:1px solid var(--bdr);border-radius:24px;padding:28px 22px;width:100%;max-width:380px;">
    <!-- Logo -->
    <div style="text-align:center;margin-bottom:24px">
      <div style="width:68px;height:68px;border-radius:18px;overflow:hidden;margin:0 auto 12px;box-shadow:0 4px 20px rgba(249,115,22,.3)"><img src="${LOGO_URL}" style="width:100%;height:100%;object-fit:contain" alt="SayatX"/></div>
      <h1 style="font-family:'Baloo 2',cursive;font-size:1.8rem;margin-bottom:4px"><span style="color:var(--txt)">Sayat</span><span class="brand-x">X</span></h1>
      <p style="font-size:.86rem;color:var(--tm)">Share your world</p>
    </div>
    <!-- Tabs -->
    <div style="display:flex;border-bottom:1px solid var(--bdr);margin-bottom:18px">
      <button id="tabPhone" onclick="showAuthTab('phone')" style="flex:1;padding:9px 4px;font-weight:800;font-size:.8rem;border:none;background:none;cursor:pointer;border-bottom:2.5px solid var(--pr);color:var(--pr)">📱 Phone</button>
      <button id="tabEmail" onclick="showAuthTab('email')" style="flex:1;padding:9px 4px;font-weight:800;font-size:.8rem;border:none;background:none;cursor:pointer;border-bottom:2.5px solid transparent;color:var(--tm)">✉️ Email</button>
      <button id="tabAnon" onclick="showAuthTab('anon')" style="flex:1;padding:9px 4px;font-weight:800;font-size:.8rem;border:none;background:none;cursor:pointer;border-bottom:2.5px solid transparent;color:var(--tm)">👤 Guest</button>
    </div>
    <!-- Phone tab -->
    <div id="authTabPhone">
      <div style="display:flex;border:1.5px solid var(--bdr2);border-radius:var(--rf);overflow:hidden;background:var(--card2);margin-bottom:10px">
        <span style="padding:11px 13px;font-weight:700;color:var(--tb);border-right:1.5px solid var(--bdr2);white-space:nowrap">+91</span>
        <input id="phoneInput" type="tel" placeholder="10-digit mobile number" maxlength="10" inputmode="numeric" style="flex:1;padding:11px 13px;background:none;border:none;outline:none;color:var(--txt);font-size:.9rem;"/>
      </div>
      <div id="recaptcha-container" style="margin-bottom:10px"></div>
      <button id="sendOtpBtn" style="width:100%;padding:13px;background:var(--pr);color:#fff;border-radius:var(--rf);font-size:.9rem;font-weight:700;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:7px"><span class="material-icons-round" style="font-size:17px">sms</span>Send OTP</button>
      <div id="otpWrap" style="display:none;margin-top:14px">
        <p style="font-size:.82rem;color:var(--tm);text-align:center;margin-bottom:10px">Enter the 6-digit OTP</p>
        <div style="display:flex;gap:8px;justify-content:center;margin-bottom:10px">
          <input type="number" class="otp-box" maxlength="1" inputmode="numeric"/>
          <input type="number" class="otp-box" maxlength="1" inputmode="numeric"/>
          <input type="number" class="otp-box" maxlength="1" inputmode="numeric"/>
          <input type="number" class="otp-box" maxlength="1" inputmode="numeric"/>
          <input type="number" class="otp-box" maxlength="1" inputmode="numeric"/>
          <input type="number" class="otp-box" maxlength="1" inputmode="numeric"/>
        </div>
        <button id="verifyOtpBtn" style="width:100%;padding:13px;background:var(--pr);color:#fff;border-radius:var(--rf);font-size:.9rem;font-weight:700;border:none;cursor:pointer">Verify OTP</button>
        <button id="resendOtpBtn" style="width:100%;margin-top:8px;padding:10px;background:none;border:1.5px solid var(--bdr2);border-radius:var(--rf);font-size:.84rem;font-weight:700;color:var(--tm);cursor:pointer">Resend OTP</button>
      </div>
    </div>
    <!-- Email tab -->
    <div id="authTabEmail" style="display:none">
      <input id="emEmail" type="email" placeholder="Email address" autocomplete="email" style="width:100%;padding:12px 14px;border:1.5px solid var(--bdr2);border-radius:var(--rf);background:var(--card2);color:var(--txt);font-size:.9rem;outline:none;margin-bottom:10px;box-sizing:border-box"/>
      <input id="emPass" type="password" placeholder="Password (min 6 chars)" autocomplete="current-password" style="width:100%;padding:12px 14px;border:1.5px solid var(--bdr2);border-radius:var(--rf);background:var(--card2);color:var(--txt);font-size:.9rem;outline:none;margin-bottom:10px;box-sizing:border-box"/>
      <button id="emSignIn" style="width:100%;padding:13px;background:var(--pr);color:#fff;border-radius:var(--rf);font-size:.9rem;font-weight:700;border:none;cursor:pointer;margin-bottom:8px">Sign In</button>
      <button id="emSignUp" style="width:100%;padding:13px;background:var(--card2);color:var(--txt);border-radius:var(--rf);font-size:.9rem;font-weight:700;border:1.5px solid var(--bdr2);cursor:pointer;margin-bottom:8px">Create Account</button>
      <button id="emForgot" style="width:100%;padding:8px;background:none;border:none;color:var(--inf);font-size:.82rem;cursor:pointer">Forgot Password?</button>
    </div>
    <!-- Guest tab -->
    <div id="authTabAnon" style="display:none;text-align:center;padding:10px 0">
      <p style="color:var(--tm);font-size:.86rem;margin-bottom:16px">Browse without an account.<br/>You can upgrade later.</p>
      <button id="anonLoginBtn" style="width:100%;padding:13px;background:var(--card2);color:var(--txt);border-radius:var(--rf);font-size:.9rem;font-weight:700;border:1.5px solid var(--bdr2);cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px"><span class="material-icons-round" style="font-size:18px">person_outline</span>Continue as Guest</button>
      <p style="margin-top:12px;font-size:.74rem;color:var(--tm)">Some features require a full account</p>
    </div>
  </div>
  </div>`;
  initAuthListeners();
}

function showAuthTab(tab){ ['phone','email','anon'].forEach(t=>{ const btn=$('tab'+t.charAt(0).toUpperCase()+t.slice(1)),panel=$('authTab'+t.charAt(0).toUpperCase()+t.slice(1)); if(btn){btn.style.borderBottomColor=t===tab?'var(--pr)':'transparent';btn.style.color=t===tab?'var(--pr)':'var(--tm)';}if(panel) panel.style.display=t===tab?'block':'none'; }); }
window.showAuthTab=showAuthTab;

function initAuthListeners(){
  /* Phone OTP */
  on('sendOtpBtn','click',sendOtp); on('resendOtpBtn','click',sendOtp);
  qsa('.otp-box').forEach((box,i,arr)=>{ box.addEventListener('input',e=>{e.target.value=e.target.value.slice(-1);e.target.classList.toggle('otp-filled',!!e.target.value);if(e.target.value&&arr[i+1]) arr[i+1].focus();}); box.addEventListener('keydown',e=>{if(e.key==='Backspace'&&!e.target.value&&arr[i-1]) arr[i-1].focus();}); });
  on('verifyOtpBtn','click',verifyOtp);
  /* Email */
  on('emSignIn','click',async()=>{ const email=(($('emEmail')||{}).value||'').trim(),pass=($('emPass')||{}).value||''; if(!email||!pass){toast('Enter email and password','error');return;} showLoading('Signing in...'); try{await Auth.signInWithEmailAndPassword(email,pass);toast('Logged in!','success');switchSection('home');}catch(e){toast(e.code==='auth/wrong-password'?'Wrong password':e.code==='auth/user-not-found'?'No account found':e.message,'error');}finally{hideLoading();} });
  on('emSignUp','click',async()=>{ const email=(($('emEmail')||{}).value||'').trim(),pass=($('emPass')||{}).value||''; if(!email||pass.length<6){toast('Email required, password min 6 chars','error');return;} showLoading('Creating account...'); try{await Auth.createUserWithEmailAndPassword(email,pass);toast('Account created!','success');switchSection('home');}catch(e){toast(e.code==='auth/email-already-in-use'?'Email already in use':e.message,'error');}finally{hideLoading();} });
  on('emForgot','click',async()=>{ const email=(($('emEmail')||{}).value||'').trim(); if(!email){toast('Enter your email first','error');return;} showLoading('Sending reset email...'); try{await Auth.sendPasswordResetEmail(email);toast('Reset email sent!','success');}catch(e){toast(e.message,'error');}finally{hideLoading();} });
  /* Anonymous */
  on('anonLoginBtn','click',async()=>{ showLoading('Continuing as guest...'); try{await Auth.signInAnonymously();toast('Welcome, Guest!','success');switchSection('home');}catch(e){toast('Failed: '+e.message,'error');}finally{hideLoading();} });
}

/* sendOtp and verifyOtp defined below */

function sendOtp(){ const ph=(($('phoneInput')||{}).value||'').trim(); if(!/^\d{10}$/.test(ph)){toast('Enter valid 10-digit number','error');return;} showLoading('Sending OTP...'); const rc=$('recaptcha-container');if(rc) rc.innerHTML=''; try{ rcaptchaVerifier=new firebase.auth.RecaptchaVerifier('recaptcha-container',{size:'normal',callback:()=>{}}); rcaptchaVerifier.render().then(()=>{ Auth.signInWithPhoneNumber('+91'+ph,rcaptchaVerifier).then(res=>{rcaptchaResult=res;setStyle('otpWrap','display','block');toast('OTP sent!','success');}).catch(e=>{toast('OTP failed: '+e.message,'error');try{rcaptchaVerifier.clear();}catch(e){}rcaptchaVerifier=null;}).finally(hideLoading); }).catch(e=>{toast('reCAPTCHA error: '+e.message,'error');hideLoading();}); }catch(e){toast('Setup failed: '+e.message,'error');hideLoading();} }

function verifyOtp(){ const otp=qsa('.otp-box').map(b=>b.value).join(''); if(otp.length!==6){toast('Enter 6-digit OTP','error');return;} if(!rcaptchaResult){toast('Send OTP first','error');return;} showLoading('Verifying...'); rcaptchaResult.confirm(otp).then(()=>{toast('Verified!','success');switchSection('home');}).catch(()=>toast('Invalid OTP','error')).finally(hideLoading); }

async function handleLogout(){ showLoading('Logging out...'); if(chatUnsub){chatUnsub();chatUnsub=null;} if(ordersUnsub){ordersUnsub();ordersUnsub=null;} if(notifUnsub){notifUnsub();notifUnsub=null;} await Auth.signOut().catch(()=>{}); toast('Logged out','info');switchSection('home');hideLoading(); }
on('profileLogoutBtn','click',handleLogout);

/* Avatar change */
on('profileAvatarEditBtn','click',()=>{const fi=$('avatarFileInput');if(fi) fi.click();});
on('avatarFileInput','change',async e=>{ const file=e.target.files&&e.target.files[0]; if(!file||!currentUser) return; if(file.size>5*1024*1024){toast('Max 5MB','error');return;} showLoading('Uploading photo...'); try{const url=await uploadFile(file,'avatars/'+currentUser.uid+'/',()=>{}); await currentUser.updateProfile({photoURL:url}); await DB.collection('users').doc(currentUser.uid).update({photoURL:url,updatedAt:TS()}); const snap=await DB.collection('posts').where('userId','==',currentUser.uid).orderBy('createdAt','desc').limit(20).get(); const batch=DB.batch();snap.docs.forEach(doc=>batch.update(doc.ref,{userPhoto:url}));await batch.commit().catch(()=>{}); refreshProfileUI();updateDrawerStrip(currentUser);toast('Profile photo updated!','success');}catch(err){toast('Upload failed: '+err.message,'error');}finally{hideLoading();const fi=$('avatarFileInput');if(fi) fi.value='';} });

on('editProfileBtn','click',openEditProfile);
function openEditProfile(){ if(!currentUser) return; const existing=document.getElementById('editProfileOverlay'); if(existing){existing.classList.add('upo-open');document.body.style.overflow='hidden';return;} const ov=document.createElement('div');ov.id='editProfileOverlay';ov.className='user-profile-overlay upo-open';ov.style.zIndex='615'; ov.innerHTML=`<div class="upo-header"><button class="upo-back-btn" id="epClose"><span class="material-icons-round">close</span></button><span class="upo-header-title">Edit Profile</span></div><div class="upo-body" style="padding:20px"><div style="margin-bottom:14px"><label style="display:block;font-size:.8rem;font-weight:700;color:var(--txt);margin-bottom:6px">Display Name</label><input id="editNameInput" type="text" value="${esc(currentUser.displayName||currentUser.email?.split('@')[0]||'')}" style="width:100%;padding:11px 13px;border:1.5px solid var(--bdr2);border-radius:var(--rf);background:var(--card2);color:var(--txt);font-size:.9rem;outline:none;box-sizing:border-box" placeholder="Your display name" maxlength="50"/></div><button id="saveProfileBtn" style="display:flex;align-items:center;justify-content:center;gap:7px;width:100%;padding:13px;background:var(--pr);color:#fff;border-radius:var(--rf);font-size:.9rem;font-weight:700;border:none;cursor:pointer"><span class="material-icons-round">save</span>Save Changes</button></div>`; document.body.appendChild(ov);document.body.style.overflow='hidden'; ov.querySelector('#epClose').onclick=()=>{ov.classList.remove('upo-open');document.body.style.overflow='';}; ov.querySelector('#saveProfileBtn').addEventListener('click',async()=>{ const n=(ov.querySelector('#editNameInput').value||'').trim(); if(!n||n.length<2){toast('At least 2 characters','error');return;} showLoading('Saving...'); try{await currentUser.updateProfile({displayName:n});await DB.collection('users').doc(currentUser.uid).update({displayName:n,updatedAt:TS()});refreshProfileUI();updateDrawerStrip(currentUser);ov.classList.remove('upo-open');document.body.style.overflow='';toast('Profile updated!','success');}catch(err){toast('Failed: '+err.message,'error');}finally{hideLoading();}; }); }

on('menuSettings','click',()=>{if(!currentUser){toast('Login required','info');return;}openSettings();});
function openSettings(){ const ex=document.getElementById('settingsOverlay'); if(ex){ex.classList.add('upo-open');document.body.style.overflow='hidden';return;} const ov=document.createElement('div');ov.id='settingsOverlay';ov.className='user-profile-overlay upo-open';ov.style.zIndex='615'; ov.innerHTML=`<div class="upo-header"><button class="upo-back-btn" id="sClose"><span class="material-icons-round">close</span></button><span class="upo-header-title">Settings</span></div><div class="upo-body"><div style="padding:14px"><div style="background:var(--card2);border-radius:var(--r2);border:1px solid var(--bdr);overflow:hidden"><button onclick="applyTheme(!isDark)" style="display:flex;align-items:center;gap:12px;width:100%;padding:14px;border-bottom:1px solid var(--bdr);text-align:left;background:none;cursor:pointer;color:var(--txt)"><span class="material-icons-round" style="color:var(--pr)">palette</span><span style="font-weight:700">Toggle Dark / Light Mode</span></button><button id="sEditBtn" style="display:flex;align-items:center;gap:12px;width:100%;padding:14px;border-bottom:1px solid var(--bdr);text-align:left;background:none;cursor:pointer;color:var(--txt)"><span class="material-icons-round" style="color:var(--pr)">edit</span><span style="font-weight:700">Edit Profile Name</span></button><button id="sPhotoBtn" style="display:flex;align-items:center;gap:12px;width:100%;padding:14px;text-align:left;background:none;cursor:pointer;color:var(--txt)"><span class="material-icons-round" style="color:var(--pr)">photo_camera</span><span style="font-weight:700">Change Profile Photo</span></button></div><button onclick="handleLogout()" style="display:flex;align-items:center;gap:10px;width:100%;margin-top:12px;padding:13px;border-radius:var(--rf);background:var(--er-b);border:1px solid rgba(244,33,46,.2);color:var(--er);font-weight:700;cursor:pointer"><span class="material-icons-round">logout</span>Logout</button></div></div>`; document.body.appendChild(ov);document.body.style.overflow='hidden'; ov.querySelector('#sClose').onclick=()=>{ov.classList.remove('upo-open');document.body.style.overflow='';}; ov.querySelector('#sEditBtn').onclick=()=>{ov.classList.remove('upo-open');document.body.style.overflow='';openEditProfile();}; ov.querySelector('#sPhotoBtn').onclick=()=>{ov.classList.remove('upo-open');document.body.style.overflow='';const fi=$('avatarFileInput');if(fi) fi.click();}; }

on('menuYourPosts','click',()=>{if(!currentUser){toast('Login required','info');return;}openYourPosts();});
on('menuLikedPosts','click',()=>{if(!currentUser){toast('Login required','info');return;}openLikedPosts();});
on('menuSaved','click',()=>{if(!currentUser){toast('Login required','info');return;}toast('Saved — coming soon','info');});
on('menuOrders','click',()=>{if(!currentUser){toast('Login required','info');return;}openOrdersOverlay();});

/* ══════════════════════════════════════
   NOTIFICATIONS — persistent red bell
══════════════════════════════════════ */
function listenNotifications(uid){ if(notifUnsub){notifUnsub();notifUnsub=null;} notifUnsub=DB.collection('notifications').where('toUid','==',uid).where('read','==',false).onSnapshot(snap=>{ const n=snap.size; const dot=$('headerNotifDot');if(dot){dot.style.display=n?'block':'none';dot.style.background='#f4212e';} setStyle('drawerNotifBadge','display',n?'inline-flex':'none');setText('drawerNotifBadge',String(n)); },()=>{}); }

function openNotificationsPanel(){ if(!currentUser){toast('Login to see notifications','info');return;} const existing=document.getElementById('notifOverlay'); if(existing){existing.classList.add('upo-open');document.body.style.overflow='hidden';loadNotifications();return;} const ov=document.createElement('div');ov.id='notifOverlay';ov.className='user-profile-overlay upo-open';ov.style.zIndex='615'; ov.innerHTML=`<div class="upo-header"><button class="upo-back-btn" id="notifClose"><span class="material-icons-round">close</span></button><span class="upo-header-title">Notifications</span></div><div class="upo-body" id="notifBody"><div class="pdf-loading"><div class="spinner"></div></div></div>`; document.body.appendChild(ov);document.body.style.overflow='hidden'; ov.querySelector('#notifClose').onclick=()=>{ov.classList.remove('upo-open');document.body.style.overflow='';}; loadNotifications(); }

async function loadNotifications(){ const body=document.getElementById('notifBody');if(!body||!currentUser) return; body.innerHTML='<div class="pdf-loading"><div class="spinner"></div></div>'; try{ const snap=await DB.collection('notifications').where('toUid','==',currentUser.uid).orderBy('createdAt','desc').limit(30).get(); body.innerHTML=''; if(!snap.size){body.innerHTML='<div style="text-align:center;padding:40px;color:var(--tm)"><span class="material-icons-round" style="font-size:44px;opacity:.3;display:block;margin-bottom:12px">notifications_none</span><p>No notifications</p></div>';return;} const batch=DB.batch();snap.docs.forEach(d=>{if(!d.data().read) batch.update(d.ref,{read:true});});batch.commit().catch(()=>{}); snap.docs.forEach(doc=>{ const n=doc.data(); const el=document.createElement('div');el.style.cssText='display:flex;align-items:flex-start;gap:12px;padding:12px 16px;border-bottom:1px solid var(--bdr);cursor:pointer;'; const av=document.createElement('div');av.style.cssText='width:40px;height:40px;border-radius:50%;background:'+randomColor(n.fromUid)+';display:flex;align-items:center;justify-content:center;color:#fff;font-weight:900;font-size:.95rem;flex-shrink:0;';av.textContent=(n.fromName||'U')[0].toUpperCase(); const typeText=n.type==='follow'?'followed you':n.type==='like'?'liked your post':n.type==='comment'?'commented on your post':n.type==='message'?'sent you a message':'interacted'; const info=document.createElement('div');info.style.flex='1'; const replyBtn=n.type==='message'?`<button style="margin-top:6px;padding:5px 12px;background:var(--pr);color:#fff;border:none;border-radius:var(--rf);font-size:.76rem;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:4px"><span class="material-icons-round" style="font-size:13px">reply</span>Reply</button>`:''; info.innerHTML=`<p style="font-weight:700;font-size:.88rem;color:var(--txt)">${esc(n.fromName||'User')}</p><p style="font-size:.78rem;color:var(--tm)">${typeText} · ${fmtAgo(n.createdAt)}</p>${replyBtn}`; el.appendChild(av);el.appendChild(info); const go=()=>{ const notifOv=document.getElementById('notifOverlay');if(notifOv){notifOv.classList.remove('upo-open');}document.body.style.overflow=''; if(n.type==='message'){switchSection('messages');setTimeout(()=>openChatWith(n.fromUid),300);}else if(n.type==='follow') openUserProfile(n.fromUid); }; el.addEventListener('click',go); const rb=info.querySelector('button');if(rb){rb.addEventListener('click',e=>{e.stopPropagation();go();});} body.appendChild(el); }); }catch(e){body.innerHTML='<p style="padding:20px;color:var(--tm)">Failed to load</p>';} }

/* ══════════════════════════════════════
   DEEP LINK
══════════════════════════════════════ */
function handleDeepLink(){ const hash=window.location.hash; if(!hash) return; const pm=hash.match(/^#post\/(.+)$/); if(pm){DB.collection('posts').doc(pm[1]).get().then(snap=>{if(!snap.exists||snap.data().status) return;const post={id:snap.id,...snap.data()};if(post.mediaType==='video'&&post.mediaUrl) openReels([post],0);else if(post.mediaType==='photo'&&post.mediaUrl) openPhotoViewer(post.mediaUrl,post.text||'',post);}).catch(()=>{});} const um=hash.match(/^#user\/(.+)$/); if(um) openUserProfile(um[1]); }
window.addEventListener('hashchange',handleDeepLink);
function getPostShareUrl(pid){ return location.origin+location.pathname+'#post/'+pid; }

/* ══════════════════════════════════════
   FEATURED — sponsor with link, auto-play video+sound, bigger
══════════════════════════════════════ */
function loadFeatured(){
  DB.collection('featured').orderBy('createdAt','desc').limit(10).onSnapshot(snap=>{
    const scroll=$('featuredScroll'),strip=$('featuredStrip'); if(!scroll) return;
    scroll.innerHTML='';
    if(!snap.size){if(strip) strip.style.display='none';return;}
    if(strip) strip.style.display='block';
    snap.docs.forEach(doc=>{
      const d={id:doc.id,...doc.data()};
      const isVideo=d.mediaType==='video'||d.type==='video';
      const isAudio=d.mediaType==='audio'||d.type==='audio';
      const card=document.createElement('div');
      card.className='featured-card';
      /* Bigger card via inline override */
      card.style.cssText='flex-shrink:0;width:240px;height:160px;border-radius:16px;overflow:hidden;position:relative;cursor:pointer;background:#111;';
      if(isVideo&&d.mediaUrl){
        /* Auto-play video with sound */
        card.innerHTML=`<video src="${esc(d.mediaUrl)}" style="width:100%;height:100%;object-fit:cover;display:block;" autoplay loop playsinline muted></video><div style="position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,.75) 0%,transparent 55%);display:flex;flex-direction:column;justify-content:flex-end;padding:10px"><p style="color:#fff;font-size:.82rem;font-weight:800;margin-bottom:3px">${esc(d.title||'Sponsored')}</p><span style="font-size:.65rem;color:rgba(255,255,255,.65);display:flex;align-items:center;gap:3px"><span class="material-icons-round" style="font-size:11px">star</span>Sponsored</span></div>`;
        /* Unmute on hover */
        const vid=card.querySelector('video');
        card.addEventListener('mouseenter',()=>{if(vid) vid.muted=false;});
        card.addEventListener('mouseleave',()=>{if(vid) vid.muted=true;});
        card.addEventListener('touchstart',()=>{if(vid){vid.muted=!vid.muted;}});
      }else{
        const thumb=d.thumbnailUrl||'';
        const icon=isAudio?'headphones':'image';
        card.innerHTML=(thumb?`<img src="${esc(thumb)}" style="width:100%;height:100%;object-fit:cover;display:block;opacity:.65;" onerror="this.style.display='none'"/>`:'')+`<div style="position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,.75) 0%,transparent 55%);display:flex;flex-direction:column;justify-content:flex-end;padding:10px"><p style="color:#fff;font-size:.82rem;font-weight:800;margin-bottom:3px">${esc(d.title||'Sponsored')}</p><span style="font-size:.65rem;color:rgba(255,255,255,.65);display:flex;align-items:center;gap:3px"><span class="material-icons-round" style="font-size:11px">star</span>Sponsored</span></div>`;
      }
      /* Click → open link */
      card.addEventListener('click',()=>{
        if(d.link){
          if(window.gonative||window.median) window.location.href=d.link;
          else window.open(d.link,'_blank','noopener');
        }else if(isVideo&&d.mediaUrl){
          openReels([{id:d.id,mediaUrl:d.mediaUrl,mediaType:'video',text:d.title||'',userName:'SayatX',userPhoto:LOGO_URL,thumbnailUrl:d.thumbnailUrl||'',likes:0,commentCount:0,views:0,createdAt:d.createdAt}],0);
        }else if(isAudio&&d.mediaUrl){
          openAudioOverlay(d.mediaUrl,d.title,d.thumbnailUrl||'');
        }else if(d.thumbnailUrl){
          openPhotoViewer(d.thumbnailUrl,d.title||'',null);
        }
      });
      scroll.appendChild(card);
    });
  },()=>{const s=$('featuredStrip');if(s) s.style.display='none';});
}

/* ══════════════════════════════════════
   FEED
══════════════════════════════════════ */
let feedFilter='all';
function loadFeed(filter){ feedFilter=filter||'all'; if(feedUnsub){feedUnsub();feedUnsub=null;} const skel=$('feedSkeleton');if(skel) skel.style.display='block'; closeSearchPanel();clearFeedPosts(); if(filter==='shop'){renderProductsFeed();return;} let query=DB.collection('posts').where('status','==',null).orderBy('createdAt','desc').limit(30).catch?DB.collection('posts').orderBy('createdAt','desc').limit(30):null; /* Firestore doesn't support null where, use different approach */ let q=DB.collection('posts').orderBy('createdAt','desc').limit(30); if(filter==='videos') q=DB.collection('posts').where('mediaType','==','video').orderBy('createdAt','desc').limit(30); if(filter==='photos') q=DB.collection('posts').where('mediaType','==','photo').orderBy('createdAt','desc').limit(30); if(filter==='trending') q=DB.collection('posts').orderBy('likes','desc').limit(30); feedUnsub=q.onSnapshot(snap=>{ if(skel) skel.style.display='none'; /* Filter out uploading posts */ const posts=snap.docs.map(d=>({id:d.id,_type:'post',...d.data()})).filter(p=>!p.status); let items=[...posts]; if(filter==='all'){const prods=allProducts.map(p=>({...p,_type:'product'}));items=mergeByDate([...posts,...prods]);}window._feedItems=items;renderFeed(items); },()=>{if(skel) skel.style.display='none';}); }
function clearFeedPosts(){ const fc=$('feedContainer');if(!fc) return;qsa('.feed-post',fc).forEach(el=>el.remove());const emp=qs('.feed-empty',fc);if(emp) emp.remove(); }
function mergeByDate(items){ return items.sort((a,b)=>{ const ta=a.createdAt&&a.createdAt.toDate?a.createdAt.toDate():new Date(a.createdAt||0); const tb=b.createdAt&&b.createdAt.toDate?b.createdAt.toDate():new Date(b.createdAt||0); return tb-ta; }); }
function renderFeed(items){ const fc=$('feedContainer');if(!fc) return;clearFeedPosts(); if(!items||!items.length){const emp=document.createElement('div');emp.className='feed-empty';emp.innerHTML='<span class="material-icons-round">feed</span><p>No posts yet</p><small>Be the first to share something!</small>';fc.appendChild(emp);return;} items.forEach(item=>{const el=item._type==='product'?buildProductPost(item):buildUserPost(item);if(el) fc.appendChild(el);}); setupVideoAutoplay(); }
function renderProductsFeed(){ const skel=$('feedSkeleton');if(skel) skel.style.display='none'; if(!allProducts.length){loadFeed('all');return;} const fc=$('feedContainer');if(!fc) return; allProducts.forEach(p=>{const el=buildProductPost({...p,_type:'product'});if(el) fc.appendChild(el);}); }

/* Build user post */
function buildUserPost(post){
  const el=document.createElement('article');el.className='feed-post';el.dataset.postId=post.id;
  const liked=!!likedPosts[post.id],name=post.userName||'User',isOwn=currentUser&&post.userId===currentUser.uid;
  const avInner=post.userPhoto?`<img src="${esc(post.userPhoto)}" alt="" onerror="this.style.display='none'"/>`:`<span>${name[0].toUpperCase()}</span>`;
  let media='';
  if(post.mediaType==='video'&&post.mediaUrl){ media=`<div class="post-video-wrap" data-post-id="${post.id}"><video class="post-video-thumb" src="${esc(post.mediaUrl)}" preload="none" playsinline muted loop poster="${esc(post.thumbnailUrl||'')}"></video><div class="post-video-play-overlay"><div class="post-play-btn"><span class="material-icons-round">play_arrow</span></div></div><div class="post-vid-badges"><span class="post-vid-badge"><span class="material-icons-round">videocam</span>Video</span></div></div>`; }
  else if(post.mediaType==='photo'&&post.mediaUrl){ media=`<img class="post-photo-img" src="${esc(post.mediaUrl)}" loading="lazy" onerror="this.style.display='none'"/>`; }
  else if(post.mediaType==='audio'&&post.mediaUrl){ media=`<div class="post-audio-card" data-post-id="${post.id}">${post.thumbnailUrl?`<img src="${esc(post.thumbnailUrl)}" style="width:56px;height:56px;border-radius:10px;object-fit:cover;flex-shrink:0" alt=""/>`:'<div class="post-audio-play-btn"><span class="material-icons-round">play_arrow</span></div>'}<div class="post-audio-info"><p class="post-audio-title">${esc(post.text||'Audio')}</p><div class="post-audio-bar"><div class="post-audio-bar-fill"></div></div><div class="post-audio-times"><span>0:00</span><span>—</span></div></div><span class="post-audio-type-tag">Audio</span></div>`; }
  const badge=post.mediaType==='video'?'<span class="post-type-badge badge-video">VIDEO</span>':post.mediaType==='photo'?'<span class="post-type-badge badge-image">PHOTO</span>':post.mediaType==='audio'?'<span class="post-type-badge badge-audio">AUDIO</span>':'<span class="post-type-badge badge-text">TEXT</span>';
  el.innerHTML=`
    <div class="feed-post-header" data-uid="${esc(post.userId||'')}">
      <div class="post-avatar" style="background:${randomColor(post.userId)}">${avInner}</div>
      <div class="post-user-info">
        <div class="post-username">${esc(name)} ${badge}</div>
        <div class="post-meta"><span class="post-handle">@${esc(name.toLowerCase().replace(/[^a-z0-9]/g,'_'))}</span><span class="post-dot">·</span><span class="post-time">${fmtAgo(post.createdAt)}</span></div>
      </div>
      <button class="post-more-btn"><span class="material-icons-round">more_horiz</span></button>
    </div>
    ${post.text&&post.mediaType!=='audio'?`<div class="post-text-content">${esc(post.text)}</div>`:''}
    ${media}
    <div class="post-footer">
      <button class="post-footer-btn post-like-btn${liked?' btn-liked':''}" data-post-id="${post.id}"><span class="material-icons-round">${liked?'favorite':'favorite_border'}</span><span class="like-count">${fmtCount(post.likes||0)}</span></button>
      <button class="post-footer-btn post-cmt-btn"><span class="material-icons-round">chat_bubble_outline</span><span>${fmtCount(post.commentCount||0)}</span></button>
      <button class="post-footer-btn post-share-btn"><span class="material-icons-round">share</span></button>
      <div class="post-footer-spacer"></div>
      <div class="post-views"><span class="material-icons-round">visibility</span><span>${fmtCount(post.views||0)}</span></div>
    </div>`;
  el.querySelector('.post-like-btn').addEventListener('click',e=>{e.stopPropagation();handleLike(post.id,el.querySelector('.post-like-btn'),el.querySelector('.like-count'));});
  el.querySelector('.post-cmt-btn').addEventListener('click',e=>{e.stopPropagation();openComments(post.id);});
  el.querySelector('.post-share-btn').addEventListener('click',e=>{e.stopPropagation();handleShare(post.id,post.text||'SayatX');});
  el.querySelector('.feed-post-header').addEventListener('click',ev=>{if(ev.target.closest('.post-more-btn')) return;if(post.userId) openUserProfile(post.userId);});
  el.querySelector('.post-more-btn').addEventListener('click',e=>{e.stopPropagation();showPostMenu(post,isOwn);});
  const vw=el.querySelector('.post-video-wrap');
  if(vw){ let tt=null,tc=0; vw.addEventListener('click',()=>{ tc++;clearTimeout(tt);tt=setTimeout(()=>{ if(tc===1){const vids=(window._feedItems||[]).filter(i=>i._type==='post'&&i.mediaType==='video'&&i.mediaUrl);const idx=vids.findIndex(p=>p.id===post.id);openReels(vids.length?vids:[post],Math.max(0,idx));DB.collection('posts').doc(post.id).update({views:INC(1)}).catch(()=>{});}else if(tc>=2){handleLike(post.id,el.querySelector('.post-like-btn'),el.querySelector('.like-count'));showHeartEffect(vw);}tc=0;},300); }); }
  el.querySelector('.post-audio-card')?.addEventListener('click',()=>{ openAudioOverlay(post.mediaUrl,post.text||'Audio',post.thumbnailUrl||post.userPhoto||''); if(!viewedPosts.has(post.id)){viewedPosts.add(post.id);DB.collection('posts').doc(post.id).update({views:INC(1)}).catch(()=>{});} });
  el.querySelector('.post-photo-img')?.addEventListener('click',()=>{ openPhotoViewer(post.mediaUrl,post.text||'',post);DB.collection('posts').doc(post.id).update({views:INC(1)}).catch(()=>{}); });
  return el;
}

function buildProductPost(product){ const el=document.createElement('article');el.className='feed-post'; const disc=product.originalPrice>product.price?Math.round((1-product.price/product.originalPrice)*100):0; const img=(product.images&&product.images[0])||product.image||product.thumbnailUrl||''; el.innerHTML=`<div class="feed-post-header" style="cursor:default"><div class="post-avatar" style="background:var(--pr);overflow:hidden"><img src="${LOGO_URL}" alt="SX" style="width:100%;height:100%;object-fit:contain" onerror="this.parentNode.textContent='SX'"/></div><div class="post-user-info"><div class="post-username">SayatX <span class="post-type-badge badge-product">PRODUCT</span></div><div class="post-meta"><span class="post-handle">@sayatx</span><span class="post-dot">·</span><span class="post-time">${fmtAgo(product.createdAt)}</span></div></div></div><div class="post-product-card"><div class="post-product-img-wrap"><img class="post-product-img" src="${esc(img)}" loading="lazy" onerror="this.src='https://placehold.co/400x300?text=Product'"/>${disc?`<span class="post-product-disc-badge">${disc}% OFF</span>`:''}</div><div class="post-product-body"><p class="post-product-name">${esc(product.title)}</p><div class="post-product-prices"><span class="post-product-price">&#x20B9;${fmt(product.price)}</span>${product.originalPrice>product.price?`<span class="post-product-orig">&#x20B9;${fmt(product.originalPrice)}</span><span class="post-product-pct">${disc}% OFF</span>`:''}</div></div><div class="post-product-actions"><button class="btn-buy-now" style="grid-column:1/-1"><span class="material-icons-round">flash_on</span>Buy Now — &#x20B9;${fmt(product.price)}</button></div></div><div class="post-footer"><div class="post-footer-spacer"></div></div>`; el.querySelector('.post-product-img').addEventListener('click',()=>openPhotoViewer(img,product.title,null)); el.querySelector('.btn-buy-now').addEventListener('click',e=>{e.stopPropagation();handleBuyNow(product);}); return el; }

function handleLike(postId,btn,countEl){ if(!currentUser){toast('Login to like posts','info');return;} const was=!!likedPosts[postId];likedPosts[postId]=!was;localStorage.setItem('sx_liked',JSON.stringify(likedPosts));if(btn){btn.classList.toggle('btn-liked',!was);const ic=btn.querySelector('.material-icons-round');if(ic) ic.textContent=was?'favorite_border':'favorite';}if(countEl){const prev=parseInt(countEl.textContent,10)||0;countEl.textContent=fmtCount(Math.max(0,was?prev-1:prev+1));}DB.collection('posts').doc(postId).update({likes:INC(was?-1:1)}).catch(()=>{}); }
function handleShare(postId,text){ const url=getPostShareUrl(postId); if(navigator.share) navigator.share({title:'SayatX',text,url}).catch(()=>{}); else navigator.clipboard.writeText(url).then(()=>toast('Link copied!','success')).catch(()=>{}); }

function showHeartEffect(container){ const heart=document.createElement('div');heart.innerHTML='❤️';heart.style.cssText='position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) scale(0);font-size:80px;z-index:10;pointer-events:none;transition:transform .3s ease,opacity .5s ease .3s;';container.style.position='relative';container.appendChild(heart);requestAnimationFrame(()=>{heart.style.transform='translate(-50%,-50%) scale(1)';});setTimeout(()=>{heart.style.opacity='0';setTimeout(()=>heart.remove(),500);},800); }

function showPostMenu(post,isOwn){ const existing=document.getElementById('postMenuOverlay');if(existing) existing.remove(); const menu=document.createElement('div');menu.id='postMenuOverlay';menu.style.cssText='position:fixed;inset:0;z-index:650;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,.5);'; const sheet=document.createElement('div');sheet.style.cssText='background:var(--card);border-radius:20px 20px 0 0;width:100%;max-width:520px;padding:16px 0 calc(env(safe-area-inset-bottom,0px)+16px);'; const btns=[{icon:'share',label:'Share',fn:()=>handleShare(post.id,post.text||'SayatX')},{icon:'link',label:'Copy Link',fn:()=>navigator.clipboard.writeText(getPostShareUrl(post.id)).then(()=>toast('Link copied!','success')).catch(()=>{})},{icon:'person',label:'View Profile',fn:()=>{if(post.userId) openUserProfile(post.userId);}}]; if(isOwn) btns.push({icon:'delete',label:'Delete Post',fn:()=>deletePost(post.id),danger:true}); btns.forEach(b=>{const btn=document.createElement('button');btn.style.cssText='display:flex;align-items:center;gap:14px;width:100%;padding:14px 20px;background:none;border:none;cursor:pointer;font-size:.9rem;font-weight:700;color:'+(b.danger?'var(--er)':'var(--txt)')+';';btn.innerHTML='<span class="material-icons-round" style="color:'+(b.danger?'var(--er)':'var(--pr)')+'">'+b.icon+'</span>'+esc(b.label);btn.addEventListener('click',()=>{menu.remove();b.fn();});sheet.appendChild(btn);}); const cancel=document.createElement('button');cancel.style.cssText='display:flex;align-items:center;justify-content:center;width:calc(100% - 32px);margin:8px 16px 0;padding:13px;background:var(--card2);border:none;border-radius:var(--rf);cursor:pointer;font-size:.9rem;font-weight:700;color:var(--txt);';cancel.textContent='Cancel';cancel.addEventListener('click',()=>menu.remove());sheet.appendChild(cancel); menu.appendChild(sheet);menu.addEventListener('click',e=>{if(e.target===menu) menu.remove();});document.body.appendChild(menu); }
async function deletePost(postId){ if(!currentUser){toast('Login required','error');return;} if(!confirm('Delete this post?')) return; showLoading('Deleting...'); try{await DB.collection('posts').doc(postId).delete();await DB.collection('users').doc(currentUser.uid).update({postCount:INC(-1)}).catch(()=>{});toast('Post deleted','success');const el=document.querySelector('[data-post-id="'+postId+'"]');if(el) el.remove();}catch(e){toast('Failed: '+e.message,'error');}hideLoading(); }

function openPhotoViewer(url,caption,post){ let ov=document.getElementById('photoViewerOverlay'); if(!ov){ov=document.createElement('div');ov.id='photoViewerOverlay';ov.style.cssText='position:fixed;inset:0;background:#000;z-index:620;display:flex;flex-direction:column;align-items:center;justify-content:center;';ov.innerHTML=`<div style="position:absolute;top:calc(env(safe-area-inset-top,0px)+10px);left:0;right:0;display:flex;align-items:center;justify-content:space-between;padding:0 14px;z-index:2"><button id="pvClose" style="width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.15);display:flex;align-items:center;justify-content:center;color:#fff;border:none;cursor:pointer"><span class="material-icons-round">close</span></button><button id="pvShare" style="width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.15);display:flex;align-items:center;justify-content:center;color:#fff;border:none;cursor:pointer"><span class="material-icons-round">share</span></button></div><img id="pvImg" style="max-width:100%;max-height:88dvh;object-fit:contain;display:block;"/><p id="pvCaption" style="color:rgba(255,255,255,.8);font-size:.85rem;padding:10px 14px;text-align:center;max-width:600px;"></p>`;document.body.appendChild(ov);ov.querySelector('#pvClose').onclick=()=>{ov.style.display='none';document.body.style.overflow='';};} ov.querySelector('#pvImg').src=url;ov.querySelector('#pvCaption').textContent=caption||'';ov.querySelector('#pvShare').onclick=()=>{if(post) handleShare(post.id,caption||'SayatX');else navigator.clipboard.writeText(url).then(()=>toast('Copied!','success')).catch(()=>{});};ov.style.display='flex';document.body.style.overflow='hidden'; }

function setupVideoAutoplay(){ const vids=qsa('.post-video-wrap video');if(!vids.length) return; const obs=new IntersectionObserver(entries=>{entries.forEach(entry=>{const v=entry.target;if(entry.isIntersecting&&entry.intersectionRatio>=0.6){v._vt=setTimeout(()=>{v.muted=true;v.play().catch(()=>{});},3000);}else{clearTimeout(v._vt);v.pause();v.currentTime=0;}});},{threshold:0.6}); vids.forEach(v=>obs.observe(v)); }
function listenProducts(){ DB.collection('products').orderBy('createdAt','desc').onSnapshot(snap=>{allProducts=snap.docs.map(d=>({id:d.id,...d.data()}));},()=>{}); }

/* ══════════════════════════════════════
   REELS — tap pause, double-tap like, profile click
══════════════════════════════════════ */
function openReels(posts,startIndex){ startIndex=startIndex||0;currentReelItems=posts; const scroll=$('reelScroll');if(!scroll) return; scroll.innerHTML=''; posts.forEach((post,i)=>{ const item=document.createElement('div');item.className='reel-item';item.dataset.i=i; const liked=!!likedPosts[post.id],name=post.userName||'User'; const av=post.userPhoto?`<img src="${esc(post.userPhoto)}" alt="" onerror="this.style.display='none'"/>`:name[0].toUpperCase(); item.innerHTML=`<video class="reel-video" src="${esc(post.mediaUrl)}" playsinline loop preload="none" poster="${esc(post.thumbnailUrl||'')}"></video><div class="reel-grad-top"></div><div class="reel-grad-bot"></div><div style="position:absolute;top:calc(env(safe-area-inset-top,0px)+10px);left:14px;z-index:5;display:flex;align-items:center;gap:8px;"><img src="${LOGO_URL}" style="width:26px;height:26px;border-radius:7px;object-fit:contain;" alt=""/><span style="font-family:'Baloo 2',cursive;font-weight:900;font-size:.95rem;"><span style="color:#fff">Sayat</span><span class="brand-x">X</span></span></div><div class="reel-side-btns"><div class="reel-side-btn reel-av-btn"><div class="reel-user-circle">${av}</div></div><div class="reel-side-btn reel-like-btn${liked?' reel-liked':''}" data-pid="${post.id}"><span class="material-icons-round">${liked?'favorite':'favorite_border'}</span><span class="reel-count">${fmtCount(post.likes||0)}</span></div><div class="reel-side-btn reel-cmt-btn"><span class="material-icons-round">chat_bubble_outline</span><span class="reel-count">${fmtCount(post.commentCount||0)}</span></div><div class="reel-side-btn reel-share-btn"><span class="material-icons-round">share</span><span class="reel-count">Share</span></div></div><div class="reel-info"><div class="reel-info-user"><span class="material-icons-round">account_circle</span>${esc(name)}</div><p class="reel-info-text">${esc(post.text||'')}</p></div><div class="reel-progress"><div class="reel-progress-fill"></div></div>`; const vid=item.querySelector('.reel-video'); let tt=null,tc=0; item.addEventListener('click',e=>{ if(e.target.closest('.reel-side-btns')||e.target.closest('.reel-info-user')) return; tc++;clearTimeout(tt);tt=setTimeout(()=>{ if(tc===1){if(vid.paused) vid.play().catch(()=>{}); else vid.pause();}else if(tc>=2){handleReelLike(post.id,item.querySelector('.reel-like-btn'));showHeartEffect(item);}tc=0; },300); }); item.querySelector('.reel-like-btn').addEventListener('click',e=>{e.stopPropagation();handleReelLike(post.id,e.currentTarget);}); item.querySelector('.reel-cmt-btn').addEventListener('click',e=>{e.stopPropagation();openCommentsHalf(post.id);}); item.querySelector('.reel-share-btn').addEventListener('click',e=>{e.stopPropagation();handleShare(post.id,post.text||'SayatX');}); const gp=()=>{if(post.userId){closeReels();setTimeout(()=>openUserProfile(post.userId),200);}};item.querySelector('.reel-av-btn').addEventListener('click',e=>{e.stopPropagation();gp();});item.querySelector('.reel-info-user').addEventListener('click',e=>{e.stopPropagation();gp();}); scroll.appendChild(item); }); const ov=$('reelOverlay');if(ov) ov.classList.add('reel-open'); document.body.style.overflow='hidden'; if(currentReelObs) currentReelObs.disconnect(); currentReelObs=new IntersectionObserver(entries=>{entries.forEach(entry=>{ const v=entry.target.querySelector('.reel-video'),fill=entry.target.querySelector('.reel-progress-fill'); if(entry.isIntersecting){v.play().catch(()=>{});v.ontimeupdate=()=>{if(v.duration&&fill) fill.style.width=(v.currentTime/v.duration*100)+'%';};const idx=parseInt(entry.target.dataset.i,10),p=currentReelItems[idx];if(p&&!viewedPosts.has(p.id)){viewedPosts.add(p.id);DB.collection('posts').doc(p.id).update({views:INC(1)}).catch(()=>{});}}else{v.pause();v.currentTime=0;if(fill) fill.style.width='0%';} });},{threshold:0.6}); qsa('.reel-item',scroll).forEach(it=>currentReelObs.observe(it)); if(startIndex>0) setTimeout(()=>{const items=qsa('.reel-item',scroll);if(items[startIndex]) items[startIndex].scrollIntoView({behavior:'instant'});},80); }
function handleReelLike(postId,btn){ if(!currentUser){toast('Login to like','info');return;} const was=btn.classList.contains('reel-liked');likedPosts[postId]=!was;localStorage.setItem('sx_liked',JSON.stringify(likedPosts));btn.classList.toggle('reel-liked',!was);const ic=btn.querySelector('.material-icons-round');if(ic) ic.textContent=was?'favorite_border':'favorite';const c=btn.querySelector('.reel-count');if(c) c.textContent=fmtCount(Math.max(0,(parseInt(c.textContent)||0)+(was?-1:1)));DB.collection('posts').doc(postId).update({likes:INC(was?-1:1)}).catch(()=>{}); }
function closeReels(){ const ov=$('reelOverlay');if(ov) ov.classList.remove('reel-open');document.body.style.overflow='';const sc=$('reelScroll');if(sc){qsa('.reel-video',sc).forEach(v=>{v.pause();v.src='';});sc.innerHTML='';}if(currentReelObs){currentReelObs.disconnect();currentReelObs=null;} }
on('reelCloseBtn','click',closeReels);

/* Comments half-screen in reels — NEWEST FIRST */
function openCommentsHalf(postId){ commentsPostId=postId; let ov=document.getElementById('commentsHalfOverlay'); if(!ov){ov=document.createElement('div');ov.id='commentsHalfOverlay';ov.style.cssText='position:fixed;inset:0;z-index:700;display:flex;flex-direction:column;justify-content:flex-end;';ov.innerHTML=`<div style="position:absolute;inset:0;background:rgba(0,0,0,.4);" id="cHalfBg"></div><div style="position:relative;z-index:1;background:var(--card);border-radius:20px 20px 0 0;height:55dvh;display:flex;flex-direction:column;padding-bottom:env(safe-area-inset-bottom,0px);"><div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--bdr);flex-shrink:0;"><span style="font-weight:800;font-size:.95rem;color:var(--txt)">Comments <small style="color:var(--tm);font-weight:600;font-size:.75rem">(newest first)</small></span><button id="cHalfClose" style="width:30px;height:30px;border-radius:50%;background:var(--card2);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;"><span class="material-icons-round" style="font-size:17px;color:var(--tm)">close</span></button></div><div id="cHalfList" style="flex:1;overflow-y:auto;padding:8px 0;"></div><div style="padding:8px 12px;border-top:1px solid var(--bdr);display:flex;gap:8px;align-items:center;flex-shrink:0;"><div style="flex:1;background:var(--card2);border:1px solid var(--bdr2);border-radius:var(--rf);padding:8px 13px;"><input type="text" id="cHalfInput" placeholder="Add a comment..." style="width:100%;background:none;border:none;outline:none;color:var(--txt);font-size:.86rem;" maxlength="500"/></div><button id="cHalfSend" style="width:36px;height:36px;border-radius:50%;background:var(--pr);color:#fff;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;"><span class="material-icons-round" style="font-size:17px">send</span></button></div></div>`;document.body.appendChild(ov);ov.querySelector('#cHalfBg').onclick=()=>{ov.style.display='none';};ov.querySelector('#cHalfClose').onclick=()=>{ov.style.display='none';};ov.querySelector('#cHalfSend').addEventListener('click',sendHalfComment);ov.querySelector('#cHalfInput').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();sendHalfComment();}});} ov.style.display='flex';loadHalfComments(postId); }
function loadHalfComments(postId){ const list=document.getElementById('cHalfList');if(!list) return;list.innerHTML='<div class="pdf-loading"><div class="spinner"></div></div>';/* Newest first */ DB.collection('posts').doc(postId).collection('comments').orderBy('createdAt','desc').limit(50).get().then(snap=>{list.innerHTML='';if(!snap.size){list.innerHTML='<div style="text-align:center;padding:24px;color:var(--tm)">No comments yet</div>';return;}snap.docs.forEach(doc=>{const c=doc.data();const el=document.createElement('div');el.style.cssText='display:flex;gap:9px;align-items:flex-start;padding:8px 14px;';const cn=c.userName||'User';const avHtml=c.userPhoto?'<img src="'+esc(c.userPhoto)+'" style="width:100%;height:100%;object-fit:cover" alt=""/>':cn[0].toUpperCase();el.innerHTML='<div style="width:32px;height:32px;border-radius:50%;background:'+randomColor(c.userId)+';display:flex;align-items:center;justify-content:center;color:#fff;font-weight:900;font-size:.85rem;flex-shrink:0;overflow:hidden">'+avHtml+'</div><div><p style="font-weight:800;font-size:.82rem;color:var(--txt)">'+esc(cn)+'</p><p style="font-size:.84rem;color:var(--tb);word-break:break-word">'+esc(c.text)+'</p></div>';list.appendChild(el);});}).catch(()=>{}); }
function sendHalfComment(){ if(!currentUser){toast('Login to comment','info');return;} if(!commentsPostId) return;const inp=document.getElementById('cHalfInput');if(!inp) return;const text=inp.value.trim();if(!text) return;inp.value='';const name=currentUser.displayName||currentUser.phoneNumber||'User';DB.collection('posts').doc(commentsPostId).collection('comments').add({userId:currentUser.uid,userName:name,userPhoto:currentUser.photoURL||'',text,createdAt:TS()}).then(()=>{DB.collection('posts').doc(commentsPostId).update({commentCount:INC(1)}).catch(()=>{});loadHalfComments(commentsPostId);}).catch(e=>toast('Failed: '+e.message,'error')); }

/* Video/Audio overlays */
function openVideoOverlay(url,title){ const vid=$('videoOverlayPlayer');if(!vid) return;vid.src=url;setText('videoOverlayTitle',title||'Video');const ov=$('videoOverlay');if(ov) ov.classList.add('video-open');document.body.style.overflow='hidden';vid.play().catch(()=>{}); }
function closeVideoOverlay(){ const vid=$('videoOverlayPlayer');if(vid){vid.pause();vid.src='';}const ov=$('videoOverlay');if(ov) ov.classList.remove('video-open');document.body.style.overflow=''; }
on('videoOverlayClose','click',closeVideoOverlay);
const audioEl=$('audioPlayer');let audioPlaying=false;
function openAudioOverlay(url,title,cover){ if(!audioEl) return;audioEl.src=url;audioEl.load();setText('audioTitleText',title||'Audio');setText('audioArtistText','SayatX');const img=cover||'https://placehold.co/200x200?text=Audio';const ai=$('audioAlbumArtImg'),bg=$('audioOverlayBg');if(ai) ai.src=img;if(bg) bg.style.backgroundImage='url('+img+')';const sf=$('audioSeekFill'),si=$('audioSeekInput');if(sf) sf.style.width='0%';if(si) si.value=0;setText('audioCurrentTime','0:00');setText('audioDuration','0:00');audioPlaying=false;const pb=$('audioPlayBtn');if(pb) pb.querySelector('.material-icons-round').textContent='play_arrow';const ov=$('audioOverlay');if(ov) ov.classList.add('audio-open');document.body.style.overflow='hidden'; }
function closeAudioOverlay(){ if(audioEl){audioEl.pause();audioEl.src='';}const ov=$('audioOverlay');if(ov) ov.classList.remove('audio-open');document.body.style.overflow='';audioPlaying=false; }
on('audioOverlayClose','click',closeAudioOverlay);
on('audioPlayBtn','click',()=>{ if(!audioEl) return;const ic=$('audioPlayBtn')?.querySelector('.material-icons-round');if(audioPlaying){audioEl.pause();audioPlaying=false;if(ic) ic.textContent='play_arrow';}else{audioEl.play().catch(e=>toast('Cannot play: '+e.message,'error'));audioPlaying=true;if(ic) ic.textContent='pause';} });
on('audioPrev10','click',()=>{if(audioEl) audioEl.currentTime=Math.max(0,audioEl.currentTime-10);});
on('audioFwd10','click',()=>{if(audioEl) audioEl.currentTime=Math.min(audioEl.duration||0,audioEl.currentTime+10);});
if(audioEl){ audioEl.addEventListener('timeupdate',()=>{ if(!audioEl.duration) return;const pct=(audioEl.currentTime/audioEl.duration)*100;const sf=$('audioSeekFill'),si=$('audioSeekInput');if(sf) sf.style.width=pct+'%';if(si) si.value=pct;setText('audioCurrentTime',fmtTime(audioEl.currentTime)); });audioEl.addEventListener('loadedmetadata',()=>setText('audioDuration',fmtTime(audioEl.duration)));audioEl.addEventListener('ended',()=>{audioPlaying=false;const ic=$('audioPlayBtn')?.querySelector('.material-icons-round');if(ic) ic.textContent='play_arrow';}); }
on('audioSeekInput','input',e=>{if(audioEl&&audioEl.duration) audioEl.currentTime=(e.target.value/100)*audioEl.duration;});
let pdfDoc=null;
function openPdfReader(url,title){ setText('pdfTitle',title||'Document');setText('pdfPageCount','');setHTML('pdfPagesContainer','<div class="pdf-loading"><div class="spinner"></div><p>Loading...</p></div>');const ov=$('pdfOverlay');if(ov) ov.classList.add('pdf-open');document.body.style.overflow='hidden';if(typeof pdfjsLib==='undefined'){toast('PDF viewer unavailable','error');return;}pdfjsLib.getDocument({url}).promise.then(pdf=>{pdfDoc=pdf;setText('pdfPageCount',pdf.numPages+' pages');setHTML('pdfPagesContainer','');const render=i=>{if(i>pdf.numPages) return;pdf.getPage(i).then(page=>{const scale=Math.min(window.innerWidth/page.getViewport({scale:1}).width,1.5);const vp=page.getViewport({scale});const canvas=document.createElement('canvas');canvas.className='pdf-page-canvas';canvas.width=vp.width;canvas.height=vp.height;page.render({canvasContext:canvas.getContext('2d'),viewport:vp}).promise.then(()=>{const wrap=document.createElement('div');wrap.innerHTML='<div class="pdf-page-num">Page '+i+'</div>';wrap.insertBefore(canvas,wrap.firstChild);const cont=$('pdfPagesContainer');if(cont) cont.appendChild(wrap);render(i+1);});});};render(1);}).catch(e=>setHTML('pdfPagesContainer','<div class="pdf-loading"><p>Failed: '+esc(e.message)+'</p></div>')); }
function closePdfReader(){ const ov=$('pdfOverlay');if(ov) ov.classList.remove('pdf-open');document.body.style.overflow='';if(pdfDoc){pdfDoc.destroy();pdfDoc=null;}setHTML('pdfPagesContainer',''); }
on('pdfCloseBtn','click',closePdfReader);

/* ══════════════════════════════════════
   CREATE POST — thumbnail picker, % progress, background upload
══════════════════════════════════════ */
on('fabPlus','click',openCreatePost);on('createPostClose','click',closeCreatePost);on('createPostBackdrop','click',closeCreatePost);on('createCancelBtn','click',closeCreatePost);on('createGoLoginBtn','click',()=>{closeCreatePost();switchSection('profile');});

function openCreatePost(){ if(!currentUser){setStyle('createLoginPrompt','display','flex');setStyle('createForm','display','none');setStyle('postTypeTabs','display','none');setStyle('createPostFooter','display','none');}else{setStyle('createLoginPrompt','display','none');setStyle('createForm','display','block');setStyle('postTypeTabs','display','flex');setStyle('createPostFooter','display','flex');const name=currentUser.displayName||currentUser.phoneNumber||'User';const av=qs('.create-form-avatar');if(av){if(currentUser.photoURL) av.innerHTML='<img src="'+esc(currentUser.photoURL)+'" alt=""/>';else av.textContent=name[0].toUpperCase();}const un=qs('.create-form-username');if(un) un.textContent=name;}const sheet=$('createPostSheet');if(sheet) sheet.classList.add('sheet-open');document.body.style.overflow='hidden';setCreateTab('text'); }
function closeCreatePost(){ const sheet=$('createPostSheet');if(sheet) sheet.classList.remove('sheet-open');document.body.style.overflow='';resetCreateForm(); }
function resetCreateForm(){ const ta=$('createTextarea');if(ta) ta.value='';if(createMediaBlob){URL.revokeObjectURL(createMediaBlob);createMediaBlob=null;}if(createThumbBlob){URL.revokeObjectURL(createThumbBlob);createThumbBlob=null;}createMediaFile=null;createThumbFile=null;setStyle('createMediaPreview','display','none');setStyle('createUploadZone','display','none');const pi=$('createPreviewImg'),pv=$('createPreviewVid'),pa=$('createAudioPreview'),ti=$('createThumbPreviewWrap');if(pi){pi.src='';pi.style.display='none';}if(pv){pv.src='';pv.style.display='none';}if(pa) pa.style.display='none';if(ti) ti.style.display='none';const mi=$('createMediaInput'),th=$('createThumbInput');if(mi) mi.value='';if(th) th.value=''; }

function setCreateTab(type){ createPostType=type;qsa('.post-type-tab').forEach(btn=>btn.classList.toggle('tab-active',btn.dataset.postType===type));const zone=$('createUploadZone'),zt=$('createUploadZoneText'),zh=$('createUploadZoneHint'),mi=$('createMediaInput');if(!zone) return;if(type==='text'){zone.style.display='none';/* Hide thumb option for text */setStyle('createThumbSection','display','none');return;}zone.style.display='flex'; /* Show thumb for video/audio */ setStyle('createThumbSection','display',['video','audio'].includes(type)?'block':'none'); if(type==='photo'){if(zt) zt.textContent='Tap to select photo';if(zh) zh.textContent='JPG, PNG — Max 20MB';if(mi) mi.accept='image/*';}else if(type==='video'){if(zt) zt.textContent='Tap to select video';if(zh) zh.textContent='MP4 — Max 5GB';if(mi) mi.accept='video/*';}else if(type==='audio'){if(zt) zt.textContent='Tap to select audio';if(zh) zh.textContent='MP3, WAV — Max 5GB';if(mi) mi.accept='audio/*';} }
qsa('.post-type-tab').forEach(btn=>btn.addEventListener('click',()=>setCreateTab(btn.dataset.postType)));

on('createMediaInput','change',e=>{ const file=e.target.files&&e.target.files[0];if(!file) return;const maxMB=createPostType==='photo'?20:5000;if(file.size>maxMB*1024*1024){toast('Max '+maxMB+'MB allowed','error');e.target.value='';return;}createMediaFile=file;if(createMediaBlob) URL.revokeObjectURL(createMediaBlob);createMediaBlob=URL.createObjectURL(file);setStyle('createUploadZone','display','none');setStyle('createMediaPreview','display','block');const pi=$('createPreviewImg'),pv=$('createPreviewVid'),pa=$('createAudioPreview'),pan=$('createAudioFileName');if(createPostType==='photo'){if(pi){pi.src=createMediaBlob;pi.style.display='block';}if(pv) pv.style.display='none';if(pa) pa.style.display='none';}else if(createPostType==='video'){if(pv){pv.src=createMediaBlob;pv.style.display='block';}if(pi) pi.style.display='none';if(pa) pa.style.display='none';}else if(createPostType==='audio'){if(pa) pa.style.display='flex';if(pan) pan.textContent=file.name;if(pi) pi.style.display='none';if(pv) pv.style.display='none';} });
on('createMediaRemoveBtn','click',()=>{ if(createMediaBlob){URL.revokeObjectURL(createMediaBlob);createMediaBlob=null;}createMediaFile=null;setStyle('createMediaPreview','display','none');setStyle('createUploadZone','display','flex');const mi=$('createMediaInput');if(mi) mi.value=''; });

/* Thumbnail input */
on('createThumbInput','change',e=>{ const file=e.target.files&&e.target.files[0];if(!file) return;if(file.size>5*1024*1024){toast('Max 5MB for thumbnail','error');return;}createThumbFile=file;if(createThumbBlob) URL.revokeObjectURL(createThumbBlob);createThumbBlob=URL.createObjectURL(file);const wrap=$('createThumbPreviewWrap'),img=$('createThumbPreviewImg');if(wrap) wrap.style.display='block';if(img) img.src=createThumbBlob; });
on('createThumbRemoveBtn','click',()=>{ if(createThumbBlob){URL.revokeObjectURL(createThumbBlob);createThumbBlob=null;}createThumbFile=null;const wrap=$('createThumbPreviewWrap');if(wrap) wrap.style.display='none';const th=$('createThumbInput');if(th) th.value=''; });

on('createSubmitBtn','click',async()=>{
  if(!currentUser){toast('Login to post','error');return;}
  const text=(($('createTextarea')||{}).value||'').trim();
  const mi=$('createMediaInput');const file=createMediaFile||(mi&&mi.files&&mi.files[0]);
  if(!text&&!file){toast('Write something or add media','error');return;}
  if(file){const maxBytes=createPostType==='photo'?20*1024*1024:5*1024*1024*1024;if(file.size>maxBytes){toast('File too large','error');return;}}
  const btn=$('createSubmitBtn');if(btn) btn.disabled=true;
  const name=currentUser.displayName||currentUser.phoneNumber||'User';

  /* Close sheet → go home immediately */
  closeCreatePost(); switchSection('home');

  /* Create placeholder post with uploading status */
  let docRef=null;
  try{
    docRef=await DB.collection('posts').add({ userId:currentUser.uid,userName:name,userPhoto:currentUser.photoURL||'',text:text||'',mediaType:file?createPostType:'text',mediaUrl:null,thumbnailUrl:null,likes:0,commentCount:0,views:0,status:'uploading',uploadPct:0,createdAt:TS() });
    await DB.collection('users').doc(currentUser.uid).update({postCount:INC(1)}).catch(()=>{});
  }catch(e){toast('Post failed: '+e.message,'error',5000);if(btn) btn.disabled=false;return;}

  if(!file){
    /* Text post — publish immediately */
    await docRef.update({status:DEL()}).catch(()=>{});
    if(btn) btn.disabled=false;
    return;
  }

  toast('Uploading... 0%','info',60000);

  /* Background upload */
  try{
    const folder=createPostType==='video'?'posts/videos/':createPostType==='audio'?'posts/audios/':'posts/photos/';
    let thumbUrl=null;

    /* Custom thumbnail or auto-generate for video */
    if(createThumbFile){
      thumbUrl=await uploadFile(createThumbFile,'posts/thumbs/',()=>{});
    }else if(createPostType==='video'){
      try{ const tb=await generateVideoThumbnail(file); if(tb){const tf=new File([tb],'thumb.jpg',{type:'image/jpeg'});thumbUrl=await uploadFile(tf,'posts/thumbs/',()=>{});} }catch(e){}
    }

    const mediaUrl=await uploadFile(file,folder,async pct=>{
      /* Update percentage in Firestore every 10% */
      if(pct%10===0&&docRef){
        try{ await docRef.update({uploadPct:pct}); }catch(e){}
      }
      /* Update toast */
      const toasts=document.querySelectorAll('.toast');
      toasts.forEach(t=>{if(t.textContent.startsWith('Uploading')) t.textContent='Uploading... '+pct+'%';});
    });

    if(createPostType==='photo') thumbUrl=mediaUrl;

    /* Publish post */
    await docRef.update({ mediaUrl, thumbnailUrl:thumbUrl||null, uploadPct:DEL(), status:DEL() });

    /* Clear "Uploading" toast, show success */
    document.querySelectorAll('.toast').forEach(t=>{if(t.textContent.startsWith('Uploading')) t.remove();});
    toast('Post published!','success');

  }catch(err){
    document.querySelectorAll('.toast').forEach(t=>{if(t.textContent.startsWith('Uploading')) t.remove();});
    if(docRef) docRef.update({status:'failed',uploadPct:DEL()}).catch(()=>{});
    if(err.code==='storage/unauthorized') toast('Storage permission denied. Check Firebase rules.','error',6000);
    else toast('Upload failed: '+(err.message||err.code),'error',5000);
  }
  if(btn) btn.disabled=false;
});

/* ══════════════════════════════════════
   COMMENTS — newest first
══════════════════════════════════════ */
function openComments(postId){ commentsPostId=postId;setHTML('commentsList','<div class="pdf-loading"><div class="spinner"></div></div>');const ci=$('commentsInput');if(ci) ci.value='';if(currentUser){const name=currentUser.displayName||currentUser.phoneNumber||'User';const av=qs('.comments-input-avatar');if(av){if(currentUser.photoURL) av.innerHTML='<img src="'+esc(currentUser.photoURL)+'" alt=""/>';else av.textContent=name[0].toUpperCase();}}const sheet=$('commentsSheet');if(sheet) sheet.classList.add('sheet-open');document.body.style.overflow='hidden'; /* Newest first */ DB.collection('posts').doc(postId).collection('comments').orderBy('createdAt','desc').limit(50).get().then(snap=>{const list=$('commentsList');if(!list) return;list.innerHTML='';if(!snap.size){list.innerHTML='<div class="comments-empty"><span class="material-icons-round">chat_bubble_outline</span><p>No comments yet</p></div>';return;}snap.docs.forEach(doc=>{const c=Object.assign({id:doc.id},doc.data());const el=document.createElement('div');el.className='comment-item';const cn=c.userName||'User';const av=c.userPhoto?'<img src="'+esc(c.userPhoto)+'" alt=""/>':cn[0].toUpperCase();el.innerHTML='<div class="comment-avatar">'+av+'</div><div class="comment-bubble"><div class="comment-bubble-header"><span class="comment-username">'+esc(cn)+'</span><span class="comment-time">'+fmtAgo(c.createdAt)+'</span></div><p class="comment-text">'+esc(c.text)+'</p></div>';list.appendChild(el);});}).catch(()=>{}); }
function closeComments(){ const sheet=$('commentsSheet');if(sheet) sheet.classList.remove('sheet-open');document.body.style.overflow='';commentsPostId=null; }
on('commentsClose','click',closeComments);on('commentsBackdrop','click',closeComments);
on('commentsSendBtn','click',()=>{ if(!currentUser){toast('Login to comment','info');return;} if(!commentsPostId) return;const ci=$('commentsInput');const text=(ci?ci.value:'').trim();if(!text) return;if(ci) ci.value='';const name=currentUser.displayName||currentUser.phoneNumber||'User';DB.collection('posts').doc(commentsPostId).collection('comments').add({userId:currentUser.uid,userName:name,userPhoto:currentUser.photoURL||'',text,createdAt:TS()}).then(()=>{DB.collection('posts').doc(commentsPostId).update({commentCount:INC(1)}).catch(()=>{});openComments(commentsPostId);toast('Comment posted','success');}).catch(e=>toast('Failed: '+e.message,'error')); });
on('commentsInput','keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();const btn=$('commentsSendBtn');if(btn) btn.click();}});

/* ══════════════════════════════════════
   USER PROFILE — fix avatar '?' + follow count fix
══════════════════════════════════════ */
function openUserProfile(uid){ const ov=$('userProfileOverlay');if(!ov) return; setText('upoHeaderTitle','Profile');setText('upoDisplayName','Loading...');setText('upoHandle','');setText('upoPostCount','0');setText('upoFollowerCount','0');setText('upoFollowingCount','0'); /* Fix: clear avatar properly */ const upoAv=$('upoAvatar'); if(upoAv) upoAv.innerHTML='<div class="spinner"></div>'; setHTML('upoPostsGrid','<div class="pdf-loading" style="grid-column:1/-1"><div class="spinner"></div></div>'); ov.classList.add('upo-open');document.body.style.overflow='hidden'; history.replaceState(null,'','#user/'+uid); const isOwn=currentUser&&uid===currentUser.uid; const followBtn=$('upoFollowBtn'),msgBtn=$('upoMessageBtn'); if(followBtn) followBtn.style.display=isOwn?'none':''; if(msgBtn) msgBtn.style.display=isOwn?'none':'';
  let isFollowing=false;
  if(currentUser&&!isOwn){ DB.collection('follows').doc(currentUser.uid+'_'+uid).get().then(snap=>{ isFollowing=snap.exists;if(followBtn){followBtn.classList.toggle('btn-following',isFollowing);followBtn.style.background=isFollowing?'transparent':'var(--txt)';followBtn.style.color=isFollowing?'var(--txt)':'var(--bg)';followBtn.innerHTML=isFollowing?'<span class="material-icons-round">person_remove</span> Following':'<span class="material-icons-round">person_add</span> Follow';} }).catch(()=>{}); }
  const newF=followBtn?followBtn.cloneNode(true):null;
  if(newF&&followBtn){ followBtn.parentNode.replaceChild(newF,followBtn);
    newF.addEventListener('click',async()=>{
      if(!currentUser){toast('Login to follow','info');return;}
      const docId=currentUser.uid+'_'+uid;
      try{
        if(isFollowing){ await DB.collection('follows').doc(docId).delete(); /* Fix: update BOTH counts */ DB.collection('users').doc(uid).update({followers:INC(-1)}).catch(()=>{}); DB.collection('users').doc(currentUser.uid).update({following:INC(-1)}).catch(()=>{}); isFollowing=false;newF.classList.remove('btn-following');newF.style.background='var(--txt)';newF.style.color='var(--bg)';newF.innerHTML='<span class="material-icons-round">person_add</span> Follow';toast('Unfollowed','info');
          /* Update displayed counts */ DB.collection('users').doc(uid).get().then(s=>{if(s.exists){setText('upoFollowerCount',fmtCount(s.data().followers||0));}}).catch(()=>{});
        }else{ await DB.collection('follows').doc(docId).set({followerUid:currentUser.uid,followingUid:uid,createdAt:TS()}); /* Fix: update BOTH counts */ DB.collection('users').doc(uid).update({followers:INC(1)}).catch(()=>{}); DB.collection('users').doc(currentUser.uid).update({following:INC(1)}).catch(()=>{}); isFollowing=true;newF.classList.add('btn-following');newF.style.background='transparent';newF.style.color='var(--txt)';newF.style.border='1.5px solid var(--bdr2)';newF.innerHTML='<span class="material-icons-round">person_remove</span> Following';toast('Following!','success');
          const myName=currentUser.displayName||currentUser.phoneNumber||'User'; DB.collection('notifications').add({toUid:uid,fromUid:currentUser.uid,fromName:myName,type:'follow',read:false,createdAt:TS()}).catch(()=>{});
          DB.collection('users').doc(uid).get().then(s=>{if(s.exists){setText('upoFollowerCount',fmtCount(s.data().followers||0));}}).catch(()=>{});
        }
      }catch(e){ toast('Error: '+e.message,'error'); }
    });
  }
  const newM=msgBtn?msgBtn.cloneNode(true):null;
  if(newM&&msgBtn){msgBtn.parentNode.replaceChild(newM,msgBtn);newM.addEventListener('click',()=>{closeUpo();switchSection('messages');setTimeout(()=>openChatWith(uid),200);});}
  /* Load user data — fix profile picture '?' */
  DB.collection('users').doc(uid).get().then(snap=>{
    if(!snap.exists){toast('User not found','error');return;}
    const d=snap.data(),name=d.displayName||'User';
    setText('upoHeaderTitle',name);setText('upoDisplayName',name);setText('upoHandle','@'+name.toLowerCase().replace(/[^a-z0-9]/g,'_'));
    setText('upoPostCount',fmtCount(d.postCount||0));setText('upoFollowerCount',fmtCount(d.followers||0));setText('upoFollowingCount',fmtCount(d.following||0));
    /* Fix avatar — show real photo or initial, never '?' */
    const img=$('upoAvatarImg'),ltr=$('upoAvatarLetter');
    if(d.photoURL&&d.photoURL.startsWith('http')){ if(img){img.src=d.photoURL;img.style.display='block';img.onerror=()=>{img.style.display='none';if(ltr){ltr.textContent=name[0].toUpperCase();ltr.style.display='flex';}};}if(ltr) ltr.style.display='none'; }
    else{ if(ltr){ltr.textContent=name[0].toUpperCase();ltr.style.display='flex';ltr.style.background=randomColor(uid);}if(img) img.style.display='none'; }
    /* Avatar click → zoom */
    const avatarEl=$('upoAvatar');
    if(avatarEl&&d.photoURL){ avatarEl.style.cursor='pointer';avatarEl.onclick=()=>openPhotoViewer(d.photoURL,name,null); }
  }).catch(()=>toast('Failed to load profile','error'));
  /* Posts grid */
  DB.collection('posts').where('userId','==',uid).orderBy('createdAt','desc').limit(30).get().then(snap=>{
    const grid=$('upoPostsGrid');if(!grid) return;grid.innerHTML='';
    if(!snap.size){grid.innerHTML='<div class="upo-grid-empty"><span class="material-icons-round">grid_off</span><p>No posts yet</p></div>';return;}
    snap.docs.forEach(doc=>{const p={id:doc.id,...doc.data()};if(p.status) return;/* skip uploading */
      const item=document.createElement('div');item.className='upo-grid-item';const isVid=p.mediaType==='video',thumb=p.thumbnailUrl||p.mediaUrl||'';
      if(thumb){item.innerHTML=isVid?`<video src="${esc(thumb)}" preload="none" muted playsinline></video><span class="material-icons-round upo-grid-play">play_circle</span>`:`<img src="${esc(thumb)}" loading="lazy"/>`;item.addEventListener('click',()=>{closeUpo();if(isVid) openReels([p],0);else openPhotoViewer(p.mediaUrl||thumb,p.text||'',p);});}
      else{item.style.background='var(--pr-g)';item.innerHTML='<span class="material-icons-round" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:var(--pr)">notes</span>';}
      grid.appendChild(item);
    });
  }).catch(()=>{});
}
function closeUpo(){ const ov=$('userProfileOverlay');if(ov) ov.classList.remove('upo-open');document.body.style.overflow='';history.replaceState(null,'',location.pathname); }
on('upoBackBtn','click',closeUpo);

/* ══════════════════════════════════════
   YOUR POSTS — 3-dot, processing status
══════════════════════════════════════ */
function openYourPosts(){ if(!currentUser){toast('Login required','info');return;} const ov=$('yourPostsOverlay');if(ov) ov.classList.add('ypo-open');document.body.style.overflow='hidden';setHTML('ypoBody','<div class="pdf-loading"><div class="spinner"></div><p>Loading your posts...</p></div>');
  DB.collection('posts').where('userId','==',currentUser.uid).orderBy('createdAt','desc').limit(50).get().then(snap=>{
    const body=$('ypoBody');if(!body) return;body.innerHTML='';
    if(!snap.size){body.innerHTML='<div class="upo-grid-empty" style="grid-column:unset"><span class="material-icons-round">grid_off</span><p>No posts yet</p></div>';return;}
    snap.docs.forEach(doc=>{const p={id:doc.id,...doc.data()};const el=document.createElement('div');el.className='ypo-post-item';const thumb=p.thumbnailUrl||p.mediaUrl||'';
      const tHtml=(p.mediaType==='video'||p.mediaType==='photo')&&thumb?`<div class="ypo-thumb"><img src="${esc(thumb)}" onerror="this.style.display='none'"/></div>`:p.mediaType==='audio'?'<div class="ypo-thumb"><span class="material-icons-round">headphones</span></div>':'<div class="ypo-thumb"><span class="material-icons-round">notes</span></div>';
      const statusBadge=p.status==='uploading'?`<span style="font-size:.7rem;padding:2px 8px;background:rgba(29,155,240,.15);color:var(--inf);border-radius:var(--rf);font-weight:700;display:inline-flex;align-items:center;gap:3px"><span class="material-icons-round" style="font-size:12px;animation:spin .75s linear infinite">refresh</span>Processing ${p.uploadPct||0}%</span>`:p.status==='failed'?'<span style="font-size:.7rem;padding:2px 8px;background:var(--er-b);color:var(--er);border-radius:var(--rf);font-weight:700">Upload Failed</span>':'';
      el.innerHTML=tHtml+`<div class="ypo-info"><p class="ypo-post-text">${esc(p.text||'(No text)')}</p>${statusBadge}<div class="ypo-stats-row" style="margin-top:4px"><span class="ypo-stat"><span class="material-icons-round">favorite</span>${fmtCount(p.likes||0)}</span><span class="ypo-stat"><span class="material-icons-round">visibility</span>${fmtCount(p.views||0)}</span><span class="ypo-stat"><span class="material-icons-round">comment</span>${fmtCount(p.commentCount||0)}</span></div></div><button style="width:32px;height:32px;border-radius:50%;background:none;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;color:var(--tm);flex-shrink:0"><span class="material-icons-round" style="font-size:18px">more_vert</span></button>`;
      el.style.cursor='pointer';
      el.querySelector('button').addEventListener('click',e=>{ e.stopPropagation(); const m=document.createElement('div');m.style.cssText='position:fixed;inset:0;z-index:660;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,.5);';const sh=document.createElement('div');sh.style.cssText='background:var(--card);border-radius:20px 20px 0 0;width:100%;max-width:520px;padding:16px 0 calc(env(safe-area-inset-bottom,0px)+16px);';[{icon:'share',label:'Share',fn:()=>handleShare(p.id,p.text||'SayatX')},{icon:'delete',label:'Delete Post',fn:()=>{m.remove();if(confirm('Delete this post?')){deletePost(p.id).then(()=>openYourPosts());}},danger:true}].forEach(b=>{const btn2=document.createElement('button');btn2.style.cssText='display:flex;align-items:center;gap:14px;width:100%;padding:14px 20px;background:none;border:none;cursor:pointer;font-size:.9rem;font-weight:700;color:'+(b.danger?'var(--er)':'var(--txt)')+';';btn2.innerHTML='<span class="material-icons-round" style="color:'+(b.danger?'var(--er)':'var(--pr)')+'">'+b.icon+'</span>'+esc(b.label);btn2.addEventListener('click',()=>{m.remove();b.fn();});sh.appendChild(btn2);});const ca=document.createElement('button');ca.style.cssText='display:flex;align-items:center;justify-content:center;width:calc(100% - 32px);margin:8px 16px 0;padding:13px;background:var(--card2);border:none;border-radius:var(--rf);cursor:pointer;font-size:.9rem;font-weight:700;color:var(--txt);';ca.textContent='Cancel';ca.addEventListener('click',()=>m.remove());sh.appendChild(ca);m.appendChild(sh);m.addEventListener('click',ev=>{if(ev.target===m) m.remove();});document.body.appendChild(m); });
      if(!p.status){ el.addEventListener('click',()=>{if(p.mediaType==='video') openReels([p],0);else if(p.mediaType==='photo') openPhotoViewer(p.mediaUrl,p.text||'',p);}); }
      body.appendChild(el);
    });
  }).catch(err=>{setHTML('ypoBody','<div class="upo-grid-empty" style="grid-column:unset"><span class="material-icons-round">error</span><p>Failed to load</p><small>'+esc(err.message)+'</small></div>');});
}
on('ypoBackBtn','click',()=>{const ov=$('yourPostsOverlay');if(ov) ov.classList.remove('ypo-open');document.body.style.overflow='';});

function openLikedPosts(){ const ids=Object.keys(likedPosts).filter(k=>likedPosts[k]);if(!ids.length){toast('No liked posts yet','info');return;}const ov=$('yourPostsOverlay');if(!ov) return;ov.classList.add('ypo-open');document.body.style.overflow='hidden';setText('ypoTitle','Liked Posts');setHTML('ypoBody','<div class="pdf-loading"><div class="spinner"></div></div>');Promise.all(ids.slice(0,20).map(id=>DB.collection('posts').doc(id).get())).then(snaps=>{const body=$('ypoBody');if(!body) return;body.innerHTML='';const posts=snaps.filter(s=>s.exists&&!s.data().status).map(s=>({id:s.id,...s.data()}));if(!posts.length){body.innerHTML='<div class="upo-grid-empty" style="grid-column:unset"><span class="material-icons-round">favorite_border</span><p>No liked posts</p></div>';return;}posts.forEach(p=>{const el=document.createElement('div');el.className='ypo-post-item';el.style.cursor='pointer';const thumb=p.thumbnailUrl||p.mediaUrl||'';const tHtml=thumb?`<div class="ypo-thumb"><img src="${esc(thumb)}"/></div>`:'<div class="ypo-thumb"><span class="material-icons-round">notes</span></div>';el.innerHTML=tHtml+`<div class="ypo-info"><p class="ypo-post-text">${esc(p.text||'(No text)')}</p><div class="ypo-stats-row"><span class="ypo-stat"><span class="material-icons-round">favorite</span>${fmtCount(p.likes||0)}</span></div></div>`;el.addEventListener('click',()=>{if(p.mediaType==='video') openReels([p],0);else if(p.mediaType==='photo') openPhotoViewer(p.mediaUrl,p.text||'',p);});body.appendChild(el);});}).catch(()=>setHTML('ypoBody','<p style="padding:24px;color:var(--tm)">Failed to load</p>')); }

/* ══════════════════════════════════════
   MESSAGES — ALL users shown like WhatsApp
══════════════════════════════════════ */
function initMessages(){ if(!currentUser){setStyle('conversationsLoginPrompt','display','flex');setStyle('conversationsEmpty','display','none');setStyle('chatView','display','none');setStyle('messagesListView','display','flex');return;}setStyle('conversationsLoginPrompt','display','none');setStyle('messagesListView','display','flex');setStyle('chatView','display','none');loadAllUsersAndConversations(); }
on('msgLoginBtn','click',()=>switchSection('profile'));

async function loadAllUsersAndConversations(){ if(!currentUser) return;const list=$('conversationsList');if(!list) return;list.querySelectorAll('.conversation-item').forEach(i=>i.remove());const empty=$('conversationsEmpty');if(empty) empty.style.display='none';
  try{
    const convSnap=await DB.collection('conversations').where('participants','array-contains',currentUser.uid).orderBy('lastMessageAt','desc').limit(30).get();
    const convMap={};convSnap.docs.forEach(doc=>{const d=doc.data();const ou=(d.participants||[]).find(u=>u!==currentUser.uid)||'';convMap[ou]={id:doc.id,...d};});
    const usersSnap=await DB.collection('users').orderBy('displayName').limit(60).get();
    const allUsers=usersSnap.docs.map(d=>({id:d.id,...d.data()})).filter(u=>u.id!==currentUser.uid);
    if(!allUsers.length){if(empty) empty.style.display='flex';return;}
    const withConv=allUsers.filter(u=>convMap[u.id]).sort((a,b)=>{ const ta=convMap[a.id].lastMessageAt?.toDate?convMap[a.id].lastMessageAt.toDate():new Date(0);const tb=convMap[b.id].lastMessageAt?.toDate?convMap[b.id].lastMessageAt.toDate():new Date(0);return tb-ta; });
    const withoutConv=allUsers.filter(u=>!convMap[u.id]);
    [...withConv,...withoutConv].forEach(u=>{
      const conv=convMap[u.id],unread=conv?(conv.unreadCounts&&conv.unreadCounts[currentUser.uid])||0:0,lastMsg=conv?conv.lastMessage||'':null,lastTime=conv?conv.lastMessageAt:null;
      const item=document.createElement('div');item.className='conversation-item';item.dataset.uid=u.id;
      const name=u.displayName||'User';
      /* Fix: show real photo */
      const avHtml=u.photoURL&&u.photoURL.startsWith('http')?`<img src="${esc(u.photoURL)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%" onerror="this.parentNode.textContent='${name[0].toUpperCase()}'"/>`:name[0].toUpperCase();
      item.innerHTML=`<div class="conv-avatar" style="background:${randomColor(u.id)}">${avHtml}</div><div class="conv-info"><p class="conv-name">${esc(name)}</p><p class="conv-last-msg${unread?' unread':''}">${lastMsg!==null?esc(lastMsg):'<span style="color:var(--tm);font-style:italic">Tap to message</span>'}</p></div><div class="conv-meta">${lastTime?'<span class="conv-time">'+fmtAgo(lastTime)+'</span>':''}${unread?'<span class="conv-unread-badge">'+unread+'</span>':''}</div>`;
      item.addEventListener('click',()=>openChatWith(u.id,name,u.photoURL||'',conv?conv.id:null));
      list.insertBefore(item,list.querySelector('.conversations-empty')||null);
    });
  }catch(e){console.error('Load users error:',e);}
}

function openChatWith(uid,name,photo,existingConvId){ if(!currentUser){toast('Login to message','info');return;} if(uid===currentUser.uid){toast("Can't message yourself",'info');return;} if(!name){DB.collection('users').doc(uid).get().then(snap=>{if(snap.exists){name=snap.data().displayName||'User';photo=snap.data().photoURL||'';}  _doStartChat(uid,name,photo,existingConvId);}).catch(()=>_doStartChat(uid,name||'User',photo||'',existingConvId));}else _doStartChat(uid,name,photo,existingConvId); }

function _doStartChat(uid,name,photo,existingConvId){
  activeChatUid=uid;activeChatConvId=existingConvId||[currentUser.uid,uid].sort().join('_');
  setText('chatHeaderName',name||'User');setText('chatHeaderStatus','Online');
  const ha=$('chatHeaderAvatar');if(ha){if(photo&&photo.startsWith('http')) ha.innerHTML=`<img src="${esc(photo)}" alt="" style="width:100%;height:100%;object-fit:cover" onerror="this.parentNode.textContent='${(name||'U')[0].toUpperCase()}'"/>`;else ha.textContent=(name||'U')[0].toUpperCase();}
  const vp=$('chatViewProfileBtn');if(vp) vp.onclick=()=>openUserProfile(uid);
  setStyle('messagesListView','display','none');setStyle('chatView','display','flex');
  setHTML('chatMessages','<div class="pdf-loading"><div class="spinner"></div></div>');
  const myName=currentUser.displayName||currentUser.phoneNumber||'User',myPhoto=currentUser.photoURL||'';
  const convRef=DB.collection('conversations').doc(activeChatConvId);
  convRef.get().then(snap=>{ if(!snap.exists) return convRef.set({participants:[currentUser.uid,uid],participantNames:{[currentUser.uid]:myName,[uid]:name||'User'},participantPhotos:{[currentUser.uid]:myPhoto,[uid]:photo||''},lastMessage:'',lastMessageAt:TS(),unreadCounts:{[currentUser.uid]:0,[uid]:0}}); })
  .then(()=>{const upd={};upd['unreadCounts.'+currentUser.uid]=0;return convRef.update(upd);})
  .then(()=>{
    if(chatUnsub){chatUnsub();chatUnsub=null;}
    chatUnsub=convRef.collection('messages').orderBy('createdAt','asc').limit(100).onSnapshot(snap=>{
      const cm=$('chatMessages');if(!cm) return;cm.innerHTML='';
      if(!snap.size){cm.innerHTML='<p style="text-align:center;padding:24px;color:var(--tm);font-size:.82rem">Say hello 👋</p>';return;}
      snap.docs.forEach(doc=>{
        const msg={id:doc.id,...doc.data()};const isSent=msg.senderId===currentUser.uid;
        const el=document.createElement('div');el.className='chat-msg '+(isSent?'msg-sent':'msg-received');
        const readMark=isSent?`<span style="font-size:13px;color:${msg.read?'#53bdeb':'rgba(255,255,255,.5)'}">✓✓</span>`:'';
        let mHtml='';
        if(msg.mediaUrl){ if(msg.mediaType==='image') mHtml=`<div class="chat-msg-media"><img src="${esc(msg.mediaUrl)}" loading="eager" style="cursor:pointer;border-radius:12px;max-width:220px;display:block;" onclick="openPhotoViewer(this.src,'',null)"/></div>`; else if(msg.mediaType==='video') mHtml=`<div class="chat-msg-media"><video src="${esc(msg.mediaUrl)}" controls playsinline muted style="border-radius:8px;max-width:220px;display:block;"></video></div>`; }
        const avHtml=!isSent?`<div class="chat-msg-avatar" style="background:${randomColor(msg.senderId)}">${(msg.senderName||'U')[0].toUpperCase()}</div>`:'';
        el.innerHTML=avHtml+'<div>'+mHtml+(msg.text?`<div class="chat-msg-bubble">${esc(msg.text)}</div>`:'')+'<p class="chat-msg-time">'+fmtAgo(msg.createdAt)+' '+readMark+'</p></div>';
        if(isSent){ let pt=null;el.addEventListener('touchstart',()=>{pt=setTimeout(()=>{if(confirm('Delete this message?')) convRef.collection('messages').doc(doc.id).delete().catch(()=>{});},600);});el.addEventListener('touchend',()=>clearTimeout(pt));el.addEventListener('contextmenu',e=>{e.preventDefault();if(confirm('Delete this message?')) convRef.collection('messages').doc(doc.id).delete().catch(()=>{});});}
        if(!isSent&&!msg.read){convRef.collection('messages').doc(doc.id).update({read:true}).catch(()=>{});}
        cm.appendChild(el);
      });
      cm.scrollTop=cm.scrollHeight;
      const upd2={};upd2['unreadCounts.'+currentUser.uid]=0;convRef.update(upd2).catch(()=>{});
    },()=>{});
  }).catch(()=>{});
}

async function sendChatMessage(){ if(!currentUser||!activeChatConvId) return;const ci=$('chatInput');const text=(ci?ci.value:'').trim();const mf=$('chatFileInput');const file=mf&&mf.files&&mf.files[0];if(!text&&!file) return;const btn=$('chatSendBtn');if(btn) btn.disabled=true;
  try{let mediaUrl=null,mediaType=null;if(file){showLoading('Uploading...');const folder=file.type.startsWith('image/')?'chats/images/':'chats/videos/';mediaUrl=await uploadFile(file,folder,()=>{});mediaType=file.type.startsWith('image/')?'image':'video';if(mf) mf.value='';setStyle('chatMediaPreview','display','none');hideLoading();}
    const myName=currentUser.displayName||currentUser.phoneNumber||'User';const convRef=DB.collection('conversations').doc(activeChatConvId);
    await convRef.collection('messages').add({senderId:currentUser.uid,senderName:myName,text:text||'',mediaUrl:mediaUrl||null,mediaType:mediaType||null,read:false,createdAt:TS()});
    const upd={lastMessage:text||(mediaType==='image'?'📷 Image':'🎬 Video'),lastMessageAt:TS()};upd['unreadCounts.'+activeChatUid]=INC(1);await convRef.update(upd);
    DB.collection('notifications').add({toUid:activeChatUid,fromUid:currentUser.uid,fromName:currentUser.displayName||currentUser.phoneNumber||'User',type:'message',read:false,createdAt:TS()}).catch(()=>{});
    if(ci){ci.value='';ci.style.height='auto';}
  }catch(e){toast('Failed: '+e.message,'error');hideLoading();}if(btn) btn.disabled=false;
}
on('chatSendBtn','click',sendChatMessage);
on('chatInput','keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendChatMessage();}});
on('chatInput','input',function(){this.style.height='auto';this.style.height=Math.min(this.scrollHeight,100)+'px';});
on('chatAttachBtn','click',()=>{const fi=$('chatFileInput');if(fi) fi.click();});
on('chatFileInput','change',e=>{const file=e.target.files&&e.target.files[0];if(!file) return;if(file.size>2*1024*1024*1024){toast('Max 2GB','error');return;}const blob=URL.createObjectURL(file);const prev=$('chatMediaPreview'),pi=$('chatMediaPreviewImg'),pv=$('chatMediaPreviewVid');if(prev) prev.style.display='block';if(file.type.startsWith('image/')){if(pi){pi.src=blob;pi.style.display='block';}if(pv) pv.style.display='none';}else{if(pv){pv.src=blob;pv.style.display='block';}if(pi) pi.style.display='none';} });
on('chatMediaRemove','click',()=>{setStyle('chatMediaPreview','display','none');const pi=$('chatMediaPreviewImg'),pv=$('chatMediaPreviewVid'),fi=$('chatFileInput');if(pi) pi.src='';if(pv) pv.src='';if(fi) fi.value='';});
on('chatBackBtn','click',()=>{if(chatUnsub){chatUnsub();chatUnsub=null;}activeChatUid=null;activeChatConvId=null;setStyle('chatView','display','none');setStyle('messagesListView','display','flex');loadAllUsersAndConversations();});
on('messagesSearch','input',e=>{const q=(e.target.value||'').trim().toLowerCase();qsa('.conversation-item').forEach(item=>{const n=(item.querySelector('.conv-name')||{}).textContent||'';item.style.display=n.toLowerCase().includes(q)?'':'none';});});
on('newMessageBtn','click',()=>toast('Search for a user above to start a chat','info'));

/* ══════════════════════════════════════
   ORDERS
══════════════════════════════════════ */
function listenOrders(uid){ if(ordersUnsub){ordersUnsub();ordersUnsub=null;}ordersUnsub=DB.collection('orders').where('userId','==',uid).orderBy('createdAt','desc').limit(1).onSnapshot(()=>{},()=>{}); }
function openOrdersOverlay(){ if(!currentUser){toast('Login to see orders','info');switchSection('profile');return;}const ov=$('ordersOverlay');if(ov) ov.classList.add('orders-open');document.body.style.overflow='hidden';setHTML('ordersBody','<div class="pdf-loading"><div class="spinner"></div><p>Loading...</p></div>');DB.collection('orders').where('userId','==',currentUser.uid).orderBy('createdAt','desc').limit(20).get().then(snap=>{const body=$('ordersBody');if(!body) return;body.innerHTML='';if(!snap.size){body.innerHTML='<div class="orders-empty"><span class="material-icons-round">inventory_2</span><p>No orders yet</p></div>';return;}const stMap={confirmed:'Confirmed',shipped:'Shipped',delivered:'Delivered'},stCls={confirmed:'status-confirmed',shipped:'status-shipped',delivered:'status-delivered'};snap.docs.forEach(doc=>{const o=Object.assign({id:doc.id},doc.data()),st=o.status||'confirmed';const digBtns=(o.items||[]).map(item=>{let b='';if(item.pdfUrl) b+=`<button class="btn-order-read" data-pdf="${esc(item.pdfUrl)}" data-title="${esc(item.title)}"><span class="material-icons-round">auto_stories</span>Read</button>`;if(item.audioUrl) b+=`<button class="btn-order-play" data-audio="${esc(item.audioUrl)}" data-title="${esc(item.title)}"><span class="material-icons-round">headphones</span>Play</button>`;return b;}).join('');const card=document.createElement('div');card.className='order-card';card.innerHTML=`<div class="order-card-header"><span class="order-id">#${o.id.slice(0,8).toUpperCase()}</span><span class="order-status-pill ${stCls[st]||'status-confirmed'}">${stMap[st]||'Confirmed'}</span></div><div class="order-card-body">`+(o.items||[]).map(item=>`<div class="order-item-row"><img class="order-item-img" src="${esc(item.image||'')}" onerror="this.src='https://placehold.co/38'"/><span class="order-item-name">${esc(item.title)}</span><span class="order-item-price">&#x20B9;${fmt(item.price)}</span></div>`).join('')+(digBtns?`<div class="order-digital-btns">${digBtns}</div>`:'')+`</div><div class="order-card-footer"><span class="order-total">&#x20B9;${fmt(o.total)}</span><span class="order-date">${fmtDate((o.createdAt&&o.createdAt.toDate&&o.createdAt.toDate())||new Date())}</span></div>`;card.querySelectorAll('.btn-order-read').forEach(btn=>btn.addEventListener('click',()=>openPdfReader(btn.dataset.pdf,btn.dataset.title)));card.querySelectorAll('.btn-order-play').forEach(btn=>btn.addEventListener('click',()=>openAudioOverlay(btn.dataset.audio,btn.dataset.title,'')));body.appendChild(card);});}).catch(()=>setHTML('ordersBody','<p style="padding:24px;color:var(--tm)">Failed to load</p>')); }
on('ordersBackBtn','click',()=>{const ov=$('ordersOverlay');if(ov) ov.classList.remove('orders-open');document.body.style.overflow='';});

/* ══════════════════════════════════════
   BUY NOW — Razorpay only, no COD
══════════════════════════════════════ */
function handleBuyNow(product){ if(!currentUser){toast('Login to buy','info');switchSection('profile');return;}checkoutProduct=product;const isDigital=['ebook','audio'].includes(product.productType);setText('checkoutSubtitle',isDigital?'Digital product — instant access.':'Enter delivery address.');setStyle('checkoutAddressFields','display',isDigital?'none':'block');const codOpt=document.querySelector('label[for="payCOD"]');if(codOpt) codOpt.style.display='none';const onlineRadio=document.querySelector('input[name="payMethod"][value="online"]');if(onlineRadio) onlineRadio.checked=true;const ov=$('checkoutModal');if(ov) ov.classList.add('modal-open');document.body.style.overflow='hidden'; }
function closeCheckout(){const ov=$('checkoutModal');if(ov) ov.classList.remove('modal-open');document.body.style.overflow='';checkoutProduct=null;}
on('checkoutModalClose','click',closeCheckout);on('checkoutModalCancel','click',closeCheckout);on('checkoutModalBackdrop','click',closeCheckout);
on('checkoutConfirmBtn','click',()=>{ if(!checkoutProduct||!currentUser) return;const isDigital=['ebook','audio'].includes(checkoutProduct.productType);if(!isDigital){const name=(($('addrName')||{}).value||'').trim();const phone=(($('addrPhone')||{}).value||'').trim();if(!name){toast('Full name required','error');return;}if(!/^\d{10}$/.test(phone)){toast('Valid mobile required','error');return;}}launchRazorpay(); });
function launchRazorpay(){ if(!checkoutProduct) return;const rzp=new window.Razorpay({key:RAZORPAY_KEY,amount:Math.round(checkoutProduct.price*100),currency:'INR',name:'SayatX',description:checkoutProduct.title,prefill:{name:currentUser.displayName||'',email:currentUser.email||'',contact:(currentUser.phoneNumber||'').replace('+91','')},theme:{color:'#f97316'},handler:res=>placeOrder('online',res.razorpay_payment_id),modal:{ondismiss:()=>toast('Payment cancelled','warning')}});rzp.on('payment.failed',e=>toast('Payment failed: '+((e&&e.error&&e.error.description)||'Error'),'error'));rzp.open(); }
async function placeOrder(method,paymentId){ if(!checkoutProduct||!currentUser) return;showLoading('Placing order...');closeCheckout();const isDigital=['ebook','audio'].includes(checkoutProduct.productType);const addr=isDigital?null:{name:(($('addrName')||{}).value||'').trim(),phone:(($('addrPhone')||{}).value||'').trim(),street:(($('addrStreet')||{}).value||'').trim(),city:(($('addrCity')||{}).value||'').trim(),pin:(($('addrPin')||{}).value||'').trim(),state:(($('addrState')||{}).value||'').trim(),landmark:(($('addrLandmark')||{}).value||'').trim()};try{await DB.collection('orders').add({userId:currentUser.uid,items:[{productId:checkoutProduct.id,title:checkoutProduct.title,price:checkoutProduct.price,image:(checkoutProduct.images&&checkoutProduct.images[0])||checkoutProduct.image||'',productType:checkoutProduct.productType||'general',pdfUrl:checkoutProduct.pdfUrl||null,audioUrl:checkoutProduct.audioUrl||null}],total:checkoutProduct.price,paymentMethod:method,paymentId:paymentId||'PAY-'+Date.now(),deliveryAddress:addr,status:isDigital?'delivered':'confirmed',createdAt:TS()});setText('successPayId',paymentId||'Payment Successful');setText('successMsg',isDigital?'Your digital content is ready! Go to My Orders.':'Order placed! We will ship it soon.');const sov=$('successOverlay');if(sov) sov.classList.add('success-open');}catch(e){toast('Order failed: '+e.message,'error',6000);}hideLoading(); }
on('successDoneBtn','click',()=>{const sov=$('successOverlay');if(sov) sov.classList.remove('success-open');switchSection('profile');setTimeout(openOrdersOverlay,300);});

/* ══════════════════════════════════════
   ADMIN — sponsor uses link not title
══════════════════════════════════════ */
function updateAdminAuthUI(){ if(!$('adminAuthNotice')) return;setStyle('adminAuthNotice','display',currentUser?'none':'flex');setStyle('adminAuthOk','display',currentUser?'flex':'none');if(currentUser&&$('adminAuthName')) setText('adminAuthName','Logged in: '+(currentUser.displayName||currentUser.email||currentUser.phoneNumber||'Admin')); }
qsa('[name="adminFeaturedType"]').forEach(r=>r.addEventListener('change',()=>{setStyle('featuredMediaField','display',r.value==='image'?'none':'block');}));
on('featuredThumbInput','change',e=>{const f=e.target.files&&e.target.files[0];if(!f) return;setText('featuredThumbName',f.name);setStyle('featuredThumbSelected','display','flex');setStyle('featuredThumbZone','display','none');});
on('featuredThumbRemove','click',()=>{const fi=$('featuredThumbInput');if(fi) fi.value='';setStyle('featuredThumbSelected','display','none');setStyle('featuredThumbZone','display','block');});
on('featuredMediaInput','change',e=>{const f=e.target.files&&e.target.files[0];if(!f) return;setText('featuredMediaName',f.name+' ('+(f.size/1024/1024).toFixed(1)+'MB)');setStyle('featuredMediaSelected','display','flex');setStyle('featuredMediaZone','display','none');});
on('featuredMediaRemove','click',()=>{const fi=$('featuredMediaInput');if(fi) fi.value='';setStyle('featuredMediaSelected','display','none');setStyle('featuredMediaZone','display','block');});
on('publishFeaturedBtn','click',async()=>{
  if(!currentUser){toast('Login required','error');return;}
  const type=(document.querySelector('[name="adminFeaturedType"]:checked')||{}).value||'image';
  const link=(($('featuredLink')||$('featuredTitle')||{}).value||'').trim(); /* use link field, fallback to title */
  const title=(($('featuredTitleText')||{}).value||(($('featuredTitle')||{}).value)||'').trim()||'Sponsored';
  const thumbF=$('featuredThumbInput')&&$('featuredThumbInput').files[0];
  const mediaF=$('featuredMediaInput')&&$('featuredMediaInput').files[0];
  if(!thumbF&&type==='image'){toast('Image required','error');return;}
  if(!thumbF&&type!=='image'){toast('Thumbnail required','error');return;}
  if(type!=='image'&&!mediaF){toast('Media file required','error');return;}
  const btn=$('publishFeaturedBtn');if(btn) btn.disabled=true;showLoading('Uploading...');
  try{
    let thumbUrl=null,mediaUrl=null;
    if(thumbF) thumbUrl=await uploadFile(thumbF,'featured/thumbs/',()=>{});
    if(mediaF) mediaUrl=await uploadFile(mediaF,'featured/'+(type==='video'?'videos':'audios')+'/',()=>{});
    if(type==='image'&&thumbF) mediaUrl=thumbUrl;
    await DB.collection('featured').add({title,link:link||null,type,mediaType:type,thumbnailUrl:thumbUrl||null,mediaUrl:mediaUrl||null,createdAt:TS()});
    toast('Sponsored content published!','success');
    const ft=$('featuredTitle');if(ft) ft.value='';const fl=$('featuredLink');if(fl) fl.value='';
    setStyle('featuredThumbSelected','display','none');setStyle('featuredThumbZone','display','block');setStyle('featuredMediaSelected','display','none');setStyle('featuredMediaZone','display','block');
    const fti=$('featuredThumbInput');if(fti) fti.value='';const fmi=$('featuredMediaInput');if(fmi) fmi.value='';
  }catch(e){toast('Failed: '+e.message,'error');}
  if(btn) btn.disabled=false;hideLoading();
});
qsa('[name="adminProductType"]').forEach(r=>r.addEventListener('change',()=>{setStyle('productPDFField','display',r.value==='ebook'?'block':'none');setStyle('productAudioField','display',r.value==='audio'?'block':'none');}));
function updateDiscPreview(){ const mrp=parseFloat(($('productMRP')||{}).value||0),sale=parseFloat(($('productSalePrice')||{}).value||0);if(mrp>0&&sale>0&&mrp>sale){setText('adminDiscountText',Math.round((1-sale/mrp)*100)+'% OFF');setStyle('adminDiscountPreview','display','flex');}else setStyle('adminDiscountPreview','display','none'); }
on('productMRP','input',updateDiscPreview);on('productSalePrice','input',updateDiscPreview);
on('productImages','change',e=>{const files=Array.from((e.target.files)||[]);setHTML('adminImgPreviews','');const prev=$('adminImgPreviews');if(!prev) return;files.forEach((f,i)=>{const reader=new FileReader();reader.onload=ev=>{const wrap=document.createElement('div');wrap.className='admin-img-preview-item';wrap.innerHTML=`<img src="${ev.target.result}"/><button type="button">&times;</button>`;wrap.querySelector('button').addEventListener('click',()=>{const dt=new DataTransfer();Array.from($('productImages').files).filter((_,fi)=>fi!==i).forEach(f2=>dt.items.add(f2));try{$('productImages').files=dt.files;}catch(e){}wrap.remove();});prev.appendChild(wrap);};reader.readAsDataURL(f);});});
on('productPDF','change',e=>{const f=e.target.files&&e.target.files[0];if(!f) return;if(f.size>100*1024*1024){toast('Max 100MB for PDF','error');return;}setText('productPDFName',f.name);setStyle('productPDFSelected','display','flex');setStyle('productPDFZone','display','none');});
on('productPDFRemove','click',()=>{const fi=$('productPDF');if(fi) fi.value='';setStyle('productPDFSelected','display','none');setStyle('productPDFZone','display','block');});
on('productAudio','change',e=>{const f=e.target.files&&e.target.files[0];if(!f) return;setText('productAudioName',f.name+' ('+(f.size/1024/1024).toFixed(0)+'MB)');setStyle('productAudioSelected','display','flex');setStyle('productAudioZone','display','none');});
on('productAudioRemove','click',()=>{const fi=$('productAudio');if(fi) fi.value='';setStyle('productAudioSelected','display','none');setStyle('productAudioZone','display','block');});
function setProgress(pct,msg){const bar=$('adminProgressBar'),pctEl=$('adminProgressPct'),st=$('adminProgressStatus'),ti=$('adminProgressTitle');if(bar) bar.style.width=pct+'%';if(pctEl) pctEl.textContent=pct+'%';if(st) st.textContent=msg;if(ti) ti.textContent=msg;}
function uploadLog(msg,type){const log=$('adminUploadLog');if(!log) return;const s=document.createElement('span');s.className='log-'+(type||'inf');s.textContent='['+new Date().toLocaleTimeString()+'] '+msg;log.appendChild(s);log.scrollTop=log.scrollHeight;}
on('publishProductBtn','click',async()=>{ if(!currentUser){toast('Login required','error');return;} const type=(document.querySelector('[name="adminProductType"]:checked')||{}).value||'general'; const title=(($('productTitle')||{}).value||'').trim();const desc=(($('productDesc')||{}).value||'').trim();const mrp=parseFloat(($('productMRP')||{}).value||0);const sale=parseFloat(($('productSalePrice')||{}).value||0);const imgF=Array.from(($('productImages')&&$('productImages').files)||[]); if(!title){toast('Title required','error');return;}if(!mrp||!sale){toast('MRP & Sale Price required','error');return;}if(sale>mrp){toast('Sale price cannot exceed MRP','error');return;}if(!imgF.length){toast('At least one image required','error');return;}if(type==='ebook'&&!($('productPDF')&&$('productPDF').files[0])){toast('PDF required','error');return;}if(type==='audio'&&!($('productAudio')&&$('productAudio').files[0])){toast('Audio file required','error');return;} const btn=$('publishProductBtn');if(btn) btn.disabled=true;setStyle('adminProgressCard','display','block');setHTML('adminUploadLog','');setProgress(0,'Preparing...');uploadLog('Starting...','inf'); const total=imgF.length+(type==='ebook'?1:0)+(type==='audio'?1:0)+1;let done=0;const imgUrls=[]; try{for(let i=0;i<imgF.length;i++){setProgress(Math.round(done/total*100),'Image '+(i+1)+'/'+imgF.length);const url=await uploadFile(imgF[i],'products/images/',pct=>setProgress(Math.round((done+pct/100)/total*100),'Image '+(i+1)+': '+pct+'%'));imgUrls.push(url);done++;uploadLog('Image '+(i+1)+' uploaded','ok');}let pdfUrl=null;if(type==='ebook'){setProgress(Math.round(done/total*100),'Uploading PDF...');pdfUrl=await uploadFile($('productPDF').files[0],'products/pdfs/',pct=>setProgress(Math.round((done+pct/100)/total*100),'PDF: '+pct+'%'));done++;uploadLog('PDF uploaded','ok');}let audioUrl=null;if(type==='audio'){setProgress(Math.round(done/total*100),'Uploading audio...');audioUrl=await uploadFile($('productAudio').files[0],'products/audios/',pct=>setProgress(Math.round((done+pct/100)/total*100),'Audio: '+pct+'%'));done++;uploadLog('Audio uploaded','ok');}setProgress(96,'Saving...');const disc=mrp>sale?Math.round((1-sale/mrp)*100):0;await DB.collection('products').add({title,description:desc,price:sale,originalPrice:mrp,discount:disc,productType:type,paymentMethod:'online',images:imgUrls,image:imgUrls[0]||'',thumbnailUrl:imgUrls[0]||'',pdfUrl:pdfUrl||null,audioUrl:audioUrl||null,inStock:true,createdAt:TS()});setProgress(100,'Published!');uploadLog('Product published!','ok');toast('Product published!','success',5000);['productTitle','productDesc','productMRP','productSalePrice'].forEach(id=>{const el=$(id);if(el) el.value='';});setHTML('adminImgPreviews','');['productImages','productPDF','productAudio'].forEach(id=>{try{const el=$(id);if(el) el.value='';}catch(e){}});setStyle('productPDFSelected','display','none');setStyle('productPDFZone','display','block');setStyle('productAudioSelected','display','none');setStyle('productAudioZone','display','block');setStyle('adminDiscountPreview','display','none');setStyle('productPDFField','display','none');setStyle('productAudioField','display','none');const gen=document.querySelector('[name="adminProductType"][value="general"]');if(gen) gen.checked=true;}catch(e){setProgress(0,'Failed');uploadLog('ERROR: '+e.message,'err');toast('Upload failed: '+e.message,'error',8000);}if(btn) btn.disabled=false; });

/* ══════════════════════════════════════
   CLOSE ALL + ESC
══════════════════════════════════════ */
function closeAllSheets(){ const cs=$('createPostSheet');if(cs) cs.classList.remove('sheet-open');const cms=$('commentsSheet');if(cms) cms.classList.remove('sheet-open');document.body.style.overflow=''; }
document.addEventListener('keydown',e=>{ if(e.key!=='Escape') return; if($('reelOverlay')?.classList.contains('reel-open')){closeReels();return;} const pv=document.getElementById('photoViewerOverlay');if(pv&&pv.style.display==='flex'){pv.style.display='none';document.body.style.overflow='';return;} if($('videoOverlay')?.classList.contains('video-open')){closeVideoOverlay();return;} if($('audioOverlay')?.classList.contains('audio-open')){closeAudioOverlay();return;} if($('pdfOverlay')?.classList.contains('pdf-open')){closePdfReader();return;} if($('userProfileOverlay')?.classList.contains('upo-open')){closeUpo();return;} if($('yourPostsOverlay')?.classList.contains('ypo-open')){$('ypoBackBtn')?.click();return;} if($('ordersOverlay')?.classList.contains('orders-open')){$('ordersBackBtn')?.click();return;} if($('checkoutModal')?.classList.contains('modal-open')){closeCheckout();return;} if($('createPostSheet')?.classList.contains('sheet-open')){closeCreatePost();return;} if($('commentsSheet')?.classList.contains('sheet-open')){closeComments();return;} if($('drawer')?.classList.contains('drawer-open')){closeDrawer();return;} ['editProfileOverlay','settingsOverlay','notifOverlay'].forEach(id=>{const ov=document.getElementById(id);if(ov&&ov.classList.contains('upo-open')){ov.classList.remove('upo-open');document.body.style.overflow='';}}); const cH=document.getElementById('commentsHalfOverlay');if(cH&&cH.style.display==='flex'){cH.style.display='none';} const pm=document.getElementById('postMenuOverlay');if(pm) pm.remove(); });

/* ══════════════════════════════════════
   INIT
══════════════════════════════════════ */
/* Build auth screen with Phone/Email/Anonymous tabs */
buildAuthScreen();
listenProducts();
loadFeatured();
loadFeed('all');
setTimeout(updateLogos,150);

console.log('%cSayatX v6.0 Ready!','color:#f97316;font-weight:900;font-size:16px');
