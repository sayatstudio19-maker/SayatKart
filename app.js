'use strict';
/* ═══════════════════════════════════════════════════
   SAYATX — app.js  v13.0   COMPLETE FIX
   Auth errors fixed · Follow permission silent ·
   Saved posts · Background upload · Photo ratio ·
   Notification reply clears · Last msg sender top
═══════════════════════════════════════════════════ */

firebase.initializeApp({
  apiKey:'AIzaSyDgJGxWxWGxszN4mz261wWKoB8kK_gxCIU',
  authDomain:'sayat-kart.firebaseapp.com',
  projectId:'sayat-kart',
  storageBucket:'sayat-kart.firebasestorage.app',
  messagingSenderId:'721186261827',
  appId:'1:721186261827:web:6aac4357fcadf05f703df6'
});
const Auth=firebase.auth(),DB=firebase.firestore(),Storage=firebase.storage();
try{DB.enablePersistence({synchronizeTabs:true}).catch(()=>{});}catch(e){}
if(typeof pdfjsLib!=='undefined') pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const RAZORPAY_KEY='rzp_live_SkOEXpqOtkBrwk';
const LOGO_URL='https://firebasestorage.googleapis.com/v0/b/sayat-kart.firebasestorage.app/o/products%2FAdobe%20Express%20-%20file.png?alt=media&token=65c25cb1-becd-4fb3-91d1-89f6f6898cd1';
const ADMIN_DIGEST='b48764d71f2345c31d7a346c490764b3635d62dbaf04ddb4802db5a8a572063a';
const ADMIN_B64=btoa(unescape(encodeURIComponent('Aayat@28April')));
const TS=()=>firebase.firestore.FieldValue.serverTimestamp();
const INC=n=>firebase.firestore.FieldValue.increment(n);
const DEL=()=>firebase.firestore.FieldValue.delete();

const $=id=>document.getElementById(id);
const qs=(s,ctx)=>(ctx||document).querySelector(s);
const qsa=(s,ctx)=>[...(ctx||document).querySelectorAll(s)];
function on(id,evt,fn){const e=typeof id==='string'?$(id):id;if(e)e.addEventListener(evt,fn);}
function setText(id,v){const e=typeof id==='string'?$(id):id;if(e)e.textContent=v;}
function setHTML(id,v){const e=typeof id==='string'?$(id):id;if(e)e.innerHTML=v;}
function setStyle(id,p,v){const e=typeof id==='string'?$(id):id;if(e)e.style[p]=v;}
function esc(s){const d=document.createElement('div');d.appendChild(document.createTextNode(s||''));return d.innerHTML;}
function fmt(n){return Number(n||0).toLocaleString('en-IN',{minimumFractionDigits:0,maximumFractionDigits:2});}
function fmtDate(d){return new Date(d).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});}
function fmtAgo(ts){if(!ts)return 'now';const d=ts.toDate?ts.toDate():new Date(ts),diff=Date.now()-d.getTime();const m=Math.floor(diff/60000),h=Math.floor(m/60),dy=Math.floor(h/24);if(dy>0)return dy+'d';if(h>0)return h+'h';if(m>0)return m+'m';return 'now';}
function fmtTime(s){if(!s||isNaN(s))return '0:00';return Math.floor(s/60)+':'+String(Math.floor(s%60)).padStart(2,'0');}
function fmtCount(n){n=Number(n)||0;if(n>=1000000)return(n/1e6).toFixed(1)+'M';if(n>=1000)return(n/1000).toFixed(1)+'K';return String(n);}
function getMime(n){const e=(n||'').split('.').pop().toLowerCase();return({jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',gif:'image/gif',webp:'image/webp',mp4:'video/mp4',webm:'video/webm',mov:'video/quicktime',mp3:'audio/mpeg',wav:'audio/wav',ogg:'audio/ogg',aac:'audio/aac',m4a:'audio/mp4',pdf:'application/pdf'})[e]||'application/octet-stream';}
function randomColor(uid){const c=['#f97316','#8b5cf6','#06b6d4','#ec4899','#22c55e','#f59e0b','#3b82f6'];if(!uid)return c[0];let h=0;for(let i=0;i<uid.length;i++)h=uid.charCodeAt(i)+((h<<5)-h);return c[Math.abs(h)%c.length];}
const TRADE_KEYWORDS=['trading','trade','stock','forex','crypto','invest','market','nifty','sensex','bitcoin','profit','earn'];
function isTrading(t){const s=(t||'').toLowerCase();return TRADE_KEYWORDS.some(k=>s.includes(k));}
function linkifyText(text){if(!text)return '';return esc(text).replace(/(https?:\/\/[^\s<>"]+)/g,url=>`<a href="${url}" target="_blank" rel="noopener" style="color:#1d9bf0;text-decoration:underline;word-break:break-all" onclick="event.stopPropagation()">${url}</a>`);}

/* Auth error messages */
function authErrMsg(code){const map={'auth/wrong-password':'Wrong password. Please try again.','auth/user-not-found':'No account found with this email.','auth/invalid-login-credentials':'Wrong email or password. Please try again.','auth/invalid-credential':'Wrong email or password. Please try again.','auth/email-already-in-use':'This email is already registered. Please Sign In instead.','auth/weak-password':'Password must be at least 6 characters.','auth/invalid-email':'Please enter a valid email address.','auth/too-many-requests':'Too many attempts. Please try again later.','auth/internal-error':'Authentication error. Please check your phone number and try again.','auth/network-request-failed':'Network error. Please check your internet connection.'};return map[code]||'Authentication failed. Please try again.';}

function showLoading(msg){setText('loadingMsg',msg||'Processing...');const e=$('loadingOverlay');if(e)e.classList.add('loading-open');}
function hideLoading(){const e=$('loadingOverlay');if(e)e.classList.remove('loading-open');}
function toast(msg,type,dur){type=type||'info';dur=dur||3000;const c=$('toastContainer');if(!c)return;const el=document.createElement('div');el.className='toast toast-'+type;el.textContent=msg;c.appendChild(el);setTimeout(()=>{el.style.opacity='0';el.style.transition='opacity .4s';setTimeout(()=>el.remove(),400);},dur);return el;}
async function hashStr(s){try{const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));return Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,'0')).join('');}catch{return null;}}
async function verifyAdmin(input){if(!input)return false;const h=await hashStr(input);if(h!==null)return h===ADMIN_DIGEST;try{if(btoa(unescape(encodeURIComponent(input)))===ADMIN_B64)return true;}catch(e){}return false;}

/* CSS */
(function(){
  const s=document.createElement('style');
  s.textContent=`
@keyframes brandX{0%{background-position:0%}100%{background-position:200%}}
.brand-x{background:linear-gradient(90deg,#f97316,#ec4899,#8b5cf6,#06b6d4,#f97316);background-size:300% 100%;-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;animation:brandX 2.5s linear infinite;font-weight:900}
@keyframes spin{to{transform:rotate(360deg)}}
.spinner{width:36px;height:36px;border-radius:50%;display:inline-block;border:3.5px solid transparent;border-top-color:#f97316;border-right-color:#ec4899;border-bottom-color:#8b5cf6;animation:spin .75s linear infinite;flex-shrink:0;}
@keyframes btnColor{0%{color:#fff}30%{color:#f97316}60%{color:#f4212e}100%{color:#fff}}
.btn-anim{animation:btnColor 2.5s ease-in-out infinite;}
/* Video — natural aspect ratio, no side gaps */
.post-video-wrap{width:100%;background:#000;overflow:hidden;position:relative;cursor:pointer;}
.post-video-wrap.portrait{aspect-ratio:9/16;}
.post-video-wrap.portrait video{width:100%;height:100%;object-fit:cover;display:block;}
.post-video-wrap.landscape{aspect-ratio:16/9;}
.post-video-wrap.landscape video{width:100%;height:100%;object-fit:cover;display:block;}
.post-video-wrap.auto video{width:100%;height:auto;max-height:88dvh;display:block;object-fit:contain;}
/* Photo — natural ratio, no side gaps */
.post-photo-img{width:100%;height:auto;display:block;object-fit:cover;}
/* Buffer spinner */
.vid-buf{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);z-index:5;display:none;pointer-events:none;}
.vid-buf.show{display:block;}
/* Seek hint */
.vid-seek-hint{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,.75);color:#fff;padding:8px 16px;border-radius:99px;font-size:.9rem;font-weight:700;pointer-events:none;z-index:6;opacity:0;transition:opacity .2s;}
.vid-seek-hint.show{opacity:1;}
/* Reel seek bar */
.reel-seek{position:absolute;bottom:52px;left:14px;right:14px;z-index:6;padding:8px 0;cursor:pointer;}
.reel-seek-track{height:3px;background:rgba(255,255,255,.3);border-radius:2px;position:relative;}
.reel-seek-fill{height:100%;background:linear-gradient(90deg,#f97316,#ec4899);border-radius:2px;width:0%;}
.reel-seek-dot{position:absolute;top:50%;right:-7px;width:14px;height:14px;border-radius:50%;background:#fff;transform:translateY(-50%);box-shadow:0 1px 4px rgba(0,0,0,.5);}
/* Follow button */
.quick-follow-btn{font-size:.74rem;font-weight:800;padding:4px 12px;border-radius:99px;border:1.5px solid var(--txt);background:transparent;color:var(--txt);cursor:pointer;white-space:nowrap;flex-shrink:0;}
.quick-follow-btn.following{border-color:var(--bdr2);color:var(--tm);}
/* Trading badge */
.trading-badge{background:linear-gradient(90deg,#22c55e,#06b6d4);color:#fff;font-size:.64rem;font-weight:800;padding:2px 7px;border-radius:99px;margin-left:5px;vertical-align:middle;}
/* Thumb section */
.create-thumb-section{margin:10px 14px 4px;padding:10px 12px;background:var(--card2);border:1.5px dashed var(--bdr2);border-radius:var(--rf);}
.create-thumb-section label{font-size:.78rem;font-weight:700;color:var(--tm);display:block;margin-bottom:8px;}
.post-proc-bar{height:3px;background:linear-gradient(90deg,#f97316,#ec4899);border-radius:2px;transition:width .3s;}
.user-profile-overlay,.your-posts-overlay{touch-action:pan-y;overscroll-behavior-x:contain;}
#vtpOv{position:fixed;inset:0;background:#000;z-index:800;display:flex;flex-direction:column;}
/* Saved badge */
.saved-badge{position:absolute;top:8px;left:8px;background:rgba(0,0,0,.6);color:#f97316;border-radius:6px;padding:2px 7px;font-size:.7rem;font-weight:800;display:flex;align-items:center;gap:3px;}
  `;
  document.head.appendChild(s);
})();

/* State */
let currentUser=null,allProducts=[],feedUnsub=null,ordersUnsub=null;
let chatUnsub=null,notifUnsub=null,activeChatUid=null,activeChatConvId=null;
let rcaptchaVerifier=null,rcaptchaResult=null;
let createPostType='text',createMediaFile=null,createMediaBlob=null,createThumbFile=null,createThumbBlob=null;
let currentReelItems=[],currentReelObs=null,commentsPostId=null,checkoutProduct=null;
const viewedPosts=new Set();
const likedPosts=JSON.parse(localStorage.getItem('sx_liked')||'{}');
const savedPosts=JSON.parse(localStorage.getItem('sx_saved')||'{}');
const followingCache=JSON.parse(localStorage.getItem('sx_following')||'{}');
window._feedItems=[];window._uploadTasks=[];window._profileVideos={};
let _allUsersCache=[];

let isDark=localStorage.getItem('sx_theme')!=='light';
function applyTheme(dark){isDark=dark;document.documentElement.setAttribute('data-theme',dark?'dark':'light');localStorage.setItem('sx_theme',dark?'dark':'light');setText('drawerThemeIcon',dark?'light_mode':'dark_mode');}
applyTheme(isDark);
on('drawerThemeToggle','click',()=>applyTheme(!isDark));
on('menuTheme','click',()=>applyTheme(!isDark));
on('overlay','click',()=>{closeDrawer();closeAllSheets();});

function updateLogos(){
  qsa('.header-logo,.drawer-logo,.auth-logo-icon').forEach(el=>{if(el.querySelector('img[data-sx]'))return;el.innerHTML='';el.style.background='#fff';el.style.padding='2px';const img=document.createElement('img');img.src=LOGO_URL;img.alt='SayatX';img.setAttribute('data-sx','1');img.style.cssText='width:100%;height:100%;object-fit:contain;border-radius:inherit;display:block;';el.appendChild(img);});
  qsa('.header-brand-name,.drawer-brand-name,.brand-name-el').forEach(el=>{if(!el.querySelector('.brand-x')){const t=(el.textContent||'SayatX').trim(),prefix=t.endsWith('X')?t.slice(0,-1):t;el.innerHTML=`<span style="color:var(--txt)">${esc(prefix)}</span><span class="brand-x">X</span>`;}});
}
setTimeout(updateLogos,80);setTimeout(updateLogos,600);

/* DRAWER */
function openDrawer(){const d=$('drawer'),o=$('overlay'),m=$('menuBtn');if(d)d.classList.add('drawer-open');if(o)o.classList.add('active');if(m)m.classList.add('menu-open');document.body.style.overflow='hidden';}
function closeDrawer(){const d=$('drawer'),o=$('overlay'),m=$('menuBtn');if(d)d.classList.remove('drawer-open');if(o)o.classList.remove('active');if(m)m.classList.remove('menu-open');document.body.style.overflow='';}
on('menuBtn','click',openDrawer);on('drawerCloseBtn','click',closeDrawer);
on('drawerLoginBtn','click',()=>{closeDrawer();switchSection('profile');});
on('drawerLogoutBtn','click',()=>{closeDrawer();handleLogout();});
qsa('[data-drawer-nav]').forEach(btn=>btn.addEventListener('click',()=>{qsa('[data-drawer-nav]').forEach(b=>b.classList.remove('active'));btn.classList.add('active');closeDrawer();handleDrawerNav(btn.dataset.drawerNav);}));
function handleDrawerNav(nav){switch(nav){case 'home':loadFeed('all');switchSection('home');break;case 'trending':loadFeed('trending');switchSection('home');break;case 'videos':loadFeed('videos');switchSection('home');break;case 'photos':loadFeed('photos');switchSection('home');break;case 'shop':loadFeed('shop');switchSection('home');break;case 'your-posts':if(!currentUser){toast('Login required','info');switchSection('profile');}else openYourPosts();break;case 'orders':if(!currentUser){toast('Login required','info');switchSection('profile');}else openOrdersOverlay();break;case 'notifications':openNotificationsPanel();break;case 'settings':if(!currentUser){toast('Login required','info');}else openSettings();break;default:switchSection('home');}}

/* SECTIONS */
const SECTIONS={home:'sectionHome',messages:'sectionMessages',profile:'sectionProfile'};
let currentSection='home';
function switchSection(name){
  if(!SECTIONS[name])return;currentSection=name;
  Object.entries(SECTIONS).forEach(([k,id])=>{const el=$(id);if(el)el.classList.toggle('active',k===name);});
  const adm=$('sectionAdmin');if(adm){adm.classList.remove('admin-visible');adm.style.display='';}
  qsa('[data-bnav]').forEach(b=>b.classList.toggle('bnav-active',b.dataset.bnav===name));
  qsa('[data-drawer-nav]').forEach(b=>b.classList.toggle('active',b.dataset.drawerNav===name));
  const fab=$('fabPlus');if(fab)fab.style.display=name==='messages'?'none':'';
  window.scrollTo({top:0,behavior:'smooth'});
  if(name==='messages')initMessages();
  if(name==='profile')refreshProfileUI();
}
qsa('[data-bnav]').forEach(btn=>btn.addEventListener('click',()=>switchSection(btn.dataset.bnav)));

let brandTaps=0,brandTimer=null;
on('headerBrand','click',()=>{brandTaps++;clearTimeout(brandTimer);brandTimer=setTimeout(()=>{brandTaps=0;},3000);if(brandTaps>=10){brandTaps=0;const pwd=prompt('Admin password:');if(!pwd)return;verifyAdmin(pwd).then(ok=>{if(ok){qsa('.app-section').forEach(s=>s.classList.remove('active'));const adm=$('sectionAdmin');if(adm){adm.style.display='block';adm.classList.add('admin-visible');}updateAdminAuthUI();toast('Admin Panel unlocked','success');window.scrollTo({top:0});}else toast('Wrong password','error');});}});

/* SEARCH */
on('mobileSearchToggle','click',()=>{const bar=$('mobileSearchBar');if(!bar)return;bar.classList.toggle('visible');if(bar.classList.contains('visible')){const inp=$('mobileSearchInput');if(inp)inp.focus();}});
on('mobileSearchClose','click',()=>{const bar=$('mobileSearchBar');if(bar)bar.classList.remove('visible');const inp=$('mobileSearchInput');if(inp)inp.value='';closeSearchPanel();});
on('mobileSearchInput','input',e=>doSearch(e.target.value));
on('searchInput','input',e=>{const cb=$('searchClearBtn');if(cb)cb.style.display=e.target.value?'flex':'none';doSearch(e.target.value);});
on('searchClearBtn','click',()=>{const si=$('searchInput');if(si)si.value='';const cb=$('searchClearBtn');if(cb)cb.style.display='none';closeSearchPanel();});
on('notifBtn','click',openNotificationsPanel);
function closeSearchPanel(){setStyle('searchResultsPanel','display','none');setStyle('feedContainer','display','');setStyle('featuredStrip','display','');}
async function doSearch(q){if(!(q||'').trim()){closeSearchPanel();return;}if(currentSection!=='home')switchSection('home');setStyle('featuredStrip','display','none');setStyle('feedContainer','display','none');setStyle('searchResultsPanel','display','block');setText('searchResultsLabel','Results for "'+q+'"');setStyle('searchNoResult','display','none');setHTML('searchResultsList','');const lower=q.trim().toLowerCase();const prodR=allProducts.filter(p=>(p.title||'').toLowerCase().includes(lower));let postR=[],userR=[];try{const snap=await DB.collection('posts').orderBy('createdAt','desc').limit(100).get();postR=snap.docs.map(d=>({id:d.id,...d.data(),_type:'post'})).filter(p=>!p.status&&((p.text||'').toLowerCase().includes(lower)||(p.userName||'').toLowerCase().includes(lower)));}catch(e){}try{const snap=await DB.collection('users').get();userR=snap.docs.map(d=>({id:d.id,...d.data()})).filter(u=>(u.displayName||'').toLowerCase().includes(lower)).slice(0,8);}catch(e){}const list=$('searchResultsList');if(!list)return;let found=false;if(userR.length){found=true;const lbl=document.createElement('p');lbl.style.cssText='padding:8px 14px;font-size:.76rem;font-weight:800;color:var(--tm);text-transform:uppercase;';lbl.textContent='People';list.appendChild(lbl);userR.forEach(u=>{const el=document.createElement('div');el.style.cssText='display:flex;align-items:center;gap:12px;padding:11px 14px;border-bottom:1px solid var(--bdr);cursor:pointer;';const av=document.createElement('div');av.style.cssText='width:42px;height:42px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:900;color:#fff;font-size:1rem;flex-shrink:0;overflow:hidden;background:'+randomColor(u.id);if(u.photoURL){const img=document.createElement('img');img.src=u.photoURL;img.style.cssText='width:100%;height:100%;object-fit:cover';av.appendChild(img);}else av.textContent=(u.displayName||'U')[0].toUpperCase();el.appendChild(av);const info=document.createElement('div');info.innerHTML='<p style="font-weight:800;font-size:.9rem;color:var(--txt)">'+esc(u.displayName||'User')+'</p>';el.appendChild(info);el.addEventListener('click',()=>openUserProfile(u.id));list.appendChild(el);})}if(postR.length||prodR.length){found=true;const lbl=document.createElement('p');lbl.style.cssText='padding:8px 14px;font-size:.76rem;font-weight:800;color:var(--tm);text-transform:uppercase;';lbl.textContent='Posts & Products';list.appendChild(lbl);[...postR,...prodR.map(p=>({...p,_type:'product'}))].forEach(item=>{const el=item._type==='product'?buildProductPost(item):buildUserPost(item);if(el)list.appendChild(el);})}if(!found){setStyle('searchNoResult','display','block');setText('searchNoResultMsg','No results for "'+q+'"');}}

/* UPLOAD */
function uploadFile(file,folder,onProgress){
  return new Promise((resolve,reject)=>{
    if(!file||!currentUser){reject(new Error(!file?'No file':'Not logged in'));return;}
    const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,100);
    const path=folder+currentUser.uid+'_'+Date.now()+'_'+safeName;
    const task=Storage.ref(path).put(file,{contentType:getMime(file.name)});
    window._uploadTasks.push(task);
    const onVis=()=>{if(!document.hidden&&task.snapshot.state==='paused')task.resume();};
    document.addEventListener('visibilitychange',onVis);
    task.on('state_changed',
      snap=>{const pct=snap.totalBytes>0?Math.round(snap.bytesTransferred/snap.totalBytes*100):0;if(onProgress)onProgress(pct);},
      err=>{document.removeEventListener('visibilitychange',onVis);reject(err);},
      ()=>{document.removeEventListener('visibilitychange',onVis);task.snapshot.ref.getDownloadURL().then(resolve).catch(reject);}
    );
  });
}
window.addEventListener('beforeunload',e=>{const active=(window._uploadTasks||[]).some(t=>t.snapshot&&t.snapshot.state==='running');if(active){e.preventDefault();e.returnValue='';}});

function generateVideoThumbnail(file){return new Promise(resolve=>{const v=document.createElement('video'),url=URL.createObjectURL(file);v.src=url;v.muted=true;v.playsInline=true;v.currentTime=0.5;v.addEventListener('seeked',()=>{const c=document.createElement('canvas');c.width=v.videoWidth||640;c.height=v.videoHeight||360;c.getContext('2d').drawImage(v,0,0,c.width,c.height);c.toBlob(blob=>{URL.revokeObjectURL(url);resolve(blob||null);},'image/jpeg',0.85);},{once:true});v.addEventListener('error',()=>{URL.revokeObjectURL(url);resolve(null);},{once:true});v.load();});}

/* YouTube-style frame picker */
function openVideoThumbPicker(videoFile,onSelected){
  const ex=document.getElementById('vtpOv');if(ex)ex.remove();
  const ov=document.createElement('div');ov.id='vtpOv';
  const blobUrl=URL.createObjectURL(videoFile);
  ov.innerHTML=`<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:rgba(0,0,0,.9);flex-shrink:0;"><button id="vtpCancel" style="color:#fff;background:none;border:none;cursor:pointer;display:flex;align-items:center;gap:5px;font-size:.9rem"><span class="material-icons-round btn-anim">close</span>Cancel</button><span style="color:#fff;font-weight:800">Pick Thumbnail Frame</span><button id="vtpUse" style="color:#f97316;background:none;border:none;cursor:pointer;font-weight:800;font-size:.9rem">✔ Use</button></div><video id="vtpVid" src="${blobUrl}" playsinline muted style="flex:1;width:100%;object-fit:contain;background:#000;display:block;min-height:0;"></video><div style="padding:12px 16px;background:rgba(0,0,0,.9);flex-shrink:0;display:flex;align-items:center;gap:10px;"><span id="vtpTime" style="color:#fff;font-size:.8rem;min-width:38px">0:00</span><input type="range" id="vtpSeek" min="0" max="100" value="0" step="0.01" style="flex:1;accent-color:#f97316"/><button id="vtpPlay" style="width:36px;height:36px;border-radius:50%;background:var(--pr);border:none;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center"><span class="material-icons-round" style="font-size:18px">play_arrow</span></button></div>`;
  document.body.appendChild(ov);
  const vid=ov.querySelector('#vtpVid'),seek=ov.querySelector('#vtpSeek'),timeEl=ov.querySelector('#vtpTime'),playBtn=ov.querySelector('#vtpPlay');
  vid.addEventListener('loadedmetadata',()=>{seek.max=vid.duration||100;});
  vid.addEventListener('timeupdate',()=>{if(!isNaN(vid.duration)){seek.value=vid.currentTime;timeEl.textContent=fmtTime(vid.currentTime);}});
  seek.addEventListener('input',()=>{vid.currentTime=parseFloat(seek.value);});
  playBtn.addEventListener('click',()=>{if(vid.paused){vid.play();playBtn.querySelector('.material-icons-round').textContent='pause';}else{vid.pause();playBtn.querySelector('.material-icons-round').textContent='play_arrow';}});
  ov.querySelector('#vtpCancel').addEventListener('click',()=>{vid.pause();URL.revokeObjectURL(blobUrl);ov.remove();});
  ov.querySelector('#vtpUse').addEventListener('click',()=>{vid.pause();const c=document.createElement('canvas');c.width=vid.videoWidth||640;c.height=vid.videoHeight||360;c.getContext('2d').drawImage(vid,0,0,c.width,c.height);c.toBlob(blob=>{URL.revokeObjectURL(blobUrl);ov.remove();if(blob&&onSelected)onSelected(blob);},'image/jpeg',0.88);});
}

/* AUTH */
Auth.onAuthStateChanged(user=>{
  currentUser=user;refreshAuthUI(user);
  if(user){ensureUserDoc(user);listenNotifications(user.uid);listenOrders(user.uid);updateDrawerStrip(user);}
  else{if(notifUnsub){notifUnsub();notifUnsub=null;}if(ordersUnsub){ordersUnsub();ordersUnsub=null;}}
  handleDeepLink();
});

function refreshAuthUI(user){const in_=!!user;setStyle('authScreen','display',in_?'none':'block');setStyle('profileScreen','display',in_?'block':'none');setStyle('drawerLoginBtn','display',in_?'none':'flex');setStyle('drawerLogoutBtn','display',in_?'flex':'none');setStyle('drawerUserStrip','display',in_?'block':'none');updateAdminAuthUI();}
function ensureUserDoc(user){if(!user)return;const ref=DB.collection('users').doc(user.uid);ref.get().then(snap=>{const name=user.displayName||localStorage.getItem('sx_name')||'User';const data={uid:user.uid,displayName:name,email:user.email||'',phone:user.phoneNumber||'',photoURL:user.photoURL||'',updatedAt:TS()};if(!snap.exists)ref.set({...data,followers:0,following:0,postCount:0,createdAt:TS()});else ref.update(data);}).catch(()=>{});}
function updateDrawerStrip(user){if(!user)return;const name=user.displayName||localStorage.getItem('sx_name')||'User';setText('drawerUserName',name);setText('drawerUserHandle','@'+name.toLowerCase().replace(/[^a-z0-9]/g,'_'));const img=$('drawerUserAvatarImg'),ltr=$('drawerUserAvatarLetter');if(user.photoURL){if(img){img.src=user.photoURL;img.style.display='block';}if(ltr)ltr.style.display='none';}else{if(ltr){ltr.textContent=name[0].toUpperCase();ltr.style.display='flex';}if(img)img.style.display='none';}DB.collection('users').doc(user.uid).get().then(snap=>{if(!snap.exists)return;const d=snap.data();setText('drawerPostCount',fmtCount(d.postCount||0));setText('drawerFollowerCount',fmtCount(d.followers||0));}).catch(()=>{});}
function refreshProfileUI(){if(!currentUser)return;const name=currentUser.displayName||localStorage.getItem('sx_name')||'User';setText('profileDisplayName',name);setText('profileHandle','@'+name.toLowerCase().replace(/[^a-z0-9]/g,'_'));const img=$('profileAvatarImg'),ltr=$('profileAvatarLetter');if(currentUser.photoURL){if(img){img.src=currentUser.photoURL;img.style.display='block';}if(ltr)ltr.style.display='none';}else{if(ltr){ltr.textContent=name[0].toUpperCase();ltr.style.display='flex';}if(img)img.style.display='none';}DB.collection('users').doc(currentUser.uid).get().then(snap=>{if(!snap.exists)return;const d=snap.data();setText('profilePostCount',fmtCount(d.postCount||0));setText('profileFollowerCount',fmtCount(d.followers||0));setText('profileFollowingCount',fmtCount(d.following||0));}).catch(()=>{});}

function buildAuthScreen(){
  const sc=$('authScreen');if(!sc)return;
  sc.innerHTML=`<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px;"><div style="background:var(--card);border:1px solid var(--bdr);border-radius:22px;padding:26px 20px;width:100%;max-width:400px;">
    <div style="text-align:center;margin-bottom:22px"><div style="width:68px;height:68px;border-radius:18px;overflow:hidden;margin:0 auto 12px;background:#fff;padding:3px;box-sizing:border-box;box-shadow:0 4px 20px rgba(249,115,22,.3)"><img src="${LOGO_URL}" style="width:100%;height:100%;object-fit:contain;border-radius:14px" alt="SayatX"/></div><h1 style="font-family:'Baloo 2',cursive;font-size:1.8rem;margin-bottom:4px"><span style="color:var(--txt)">Sayat</span><span class="brand-x">X</span></h1><p style="font-size:.84rem;color:var(--tm)">Login to share your world</p></div>
    <div style="display:flex;border-bottom:2px solid var(--bdr);margin-bottom:18px;">
      <button id="authTabPhone" onclick="showAuthTab('phone')" style="flex:1;padding:10px;font-weight:800;font-size:.86rem;border:none;background:none;cursor:pointer;border-bottom:2.5px solid var(--pr);color:var(--pr);margin-bottom:-2px">📱 Phone</button>
      <button id="authTabEmail" onclick="showAuthTab('email')" style="flex:1;padding:10px;font-weight:800;font-size:.86rem;border:none;background:none;cursor:pointer;border-bottom:2.5px solid transparent;color:var(--tm);margin-bottom:-2px">✉️ Email</button>
    </div>
    <div id="authPanelPhone">
      <div style="display:flex;border:1.5px solid var(--bdr2);border-radius:var(--rf);overflow:hidden;background:var(--card2);margin-bottom:10px"><span style="padding:12px;font-weight:700;color:var(--tb);border-right:1.5px solid var(--bdr2);white-space:nowrap">+91</span><input id="phoneInput" type="tel" placeholder="10-digit mobile" maxlength="10" inputmode="numeric" style="flex:1;padding:12px;background:none;border:none;outline:none;color:var(--txt);font-size:.9rem;"/></div>
      <div id="recaptcha-container" style="margin-bottom:10px;display:flex;justify-content:center;min-height:78px;"></div>
      <button id="sendOtpBtn" style="width:100%;padding:13px;background:var(--pr);color:#fff;border-radius:var(--rf);font-size:.9rem;font-weight:800;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:7px;"><span class="material-icons-round" style="font-size:18px">sms</span>Send OTP</button>
      <div id="otpWrap" style="display:none;margin-top:14px">
        <p style="font-size:.82rem;color:var(--tm);text-align:center;margin-bottom:10px">Enter 6-digit OTP sent to your phone</p>
        <div style="display:flex;gap:7px;justify-content:center;margin-bottom:12px">
          <input type="number" class="otp-box" maxlength="1" inputmode="numeric"/><input type="number" class="otp-box" maxlength="1" inputmode="numeric"/><input type="number" class="otp-box" maxlength="1" inputmode="numeric"/><input type="number" class="otp-box" maxlength="1" inputmode="numeric"/><input type="number" class="otp-box" maxlength="1" inputmode="numeric"/><input type="number" class="otp-box" maxlength="1" inputmode="numeric"/>
        </div>
        <button id="verifyOtpBtn" style="width:100%;padding:13px;background:var(--pr);color:#fff;border-radius:var(--rf);font-size:.9rem;font-weight:800;border:none;cursor:pointer;">Verify OTP</button>
        <button id="resendOtpBtn" style="width:100%;margin-top:8px;padding:10px;background:none;border:1.5px solid var(--bdr2);border-radius:var(--rf);font-size:.84rem;font-weight:700;color:var(--tm);cursor:pointer">Resend OTP</button>
      </div>
      <p style="font-size:.74rem;color:var(--tm);margin-top:10px;text-align:center">⚠️ Phone auth requires Firebase Console → Authentication → Sign-in method → Phone to be enabled, and your domain to be whitelisted.</p>
    </div>
    <div id="authPanelEmail" style="display:none">
      <input id="emEmail" type="email" placeholder="Email address" autocomplete="email" style="width:100%;padding:12px;border:1.5px solid var(--bdr2);border-radius:var(--rf);background:var(--card2);color:var(--txt);font-size:.9rem;outline:none;margin-bottom:10px;box-sizing:border-box"/>
      <input id="emPass" type="password" placeholder="Password (min 6 chars)" autocomplete="current-password" style="width:100%;padding:12px;border:1.5px solid var(--bdr2);border-radius:var(--rf);background:var(--card2);color:var(--txt);font-size:.9rem;outline:none;margin-bottom:10px;box-sizing:border-box"/>
      <button id="emSignIn" style="width:100%;padding:13px;background:var(--pr);color:#fff;border-radius:var(--rf);font-size:.9rem;font-weight:800;border:none;cursor:pointer;margin-bottom:8px">Sign In</button>
      <button id="emSignUp" style="width:100%;padding:13px;background:var(--card2);color:var(--txt);border-radius:var(--rf);font-size:.9rem;font-weight:700;border:1.5px solid var(--bdr2);cursor:pointer;margin-bottom:8px">Create Account</button>
      <button id="emForgot" style="width:100%;padding:8px;background:none;border:none;color:var(--inf);font-size:.82rem;cursor:pointer">Forgot Password?</button>
    </div>
  </div></div>`;
  initAuthListeners();
}
window.showAuthTab=function(tab){['phone','email'].forEach(t=>{const btn=$('authTab'+t.charAt(0).toUpperCase()+t.slice(1)),panel=$('authPanel'+t.charAt(0).toUpperCase()+t.slice(1));if(btn){btn.style.borderBottomColor=t===tab?'var(--pr)':'transparent';btn.style.color=t===tab?'var(--pr)':'var(--tm)';}if(panel)panel.style.display=t===tab?'block':'none';});};

function initAuthListeners(){
  on('sendOtpBtn','click',sendOtp);on('resendOtpBtn','click',sendOtp);
  qsa('.otp-box').forEach((box,i,arr)=>{box.addEventListener('input',e=>{e.target.value=e.target.value.slice(-1);e.target.classList.toggle('otp-filled',!!e.target.value);if(e.target.value&&arr[i+1])arr[i+1].focus();});box.addEventListener('keydown',e=>{if(e.key==='Backspace'&&!e.target.value&&arr[i-1])arr[i-1].focus();});});
  on('verifyOtpBtn','click',verifyOtp);
  on('emSignIn','click',async()=>{
    const email=(($('emEmail')||{}).value||'').trim(),pass=($('emPass')||{}).value||'';
    if(!email||!pass){toast('Enter email and password','error');return;}
    showLoading('Signing in...');
    try{await Auth.signInWithEmailAndPassword(email,pass);toast('Logged in!','success');switchSection('home');showProfileSetupIfNeeded();}
    catch(e){toast(authErrMsg(e.code),'error',5000);}
    finally{hideLoading();}
  });
  on('emSignUp','click',async()=>{
    const email=(($('emEmail')||{}).value||'').trim(),pass=($('emPass')||{}).value||'';
    if(!email||pass.length<6){toast('Email required, password min 6 chars','error');return;}
    showLoading('Creating account...');
    try{
      await Auth.createUserWithEmailAndPassword(email,pass);
      toast('Account created! Welcome!','success');switchSection('home');showProfileSetupIfNeeded();
    }catch(e){
      if(e.code==='auth/email-already-in-use'){
        hideLoading();
        /* Try to sign in instead */
        const signInChoice=confirm('This email is already registered. Do you want to Sign In instead?');
        if(signInChoice){
          showLoading('Signing in...');
          try{await Auth.signInWithEmailAndPassword(email,pass);toast('Logged in!','success');switchSection('home');}
          catch(e2){toast(authErrMsg(e2.code),'error',5000);}
          finally{hideLoading();}
        }
      }else{toast(authErrMsg(e.code),'error',5000);hideLoading();}
    }
  });
  on('emForgot','click',async()=>{const email=(($('emEmail')||{}).value||'').trim();if(!email){toast('Enter your email first','error');return;}showLoading('Sending reset email...');try{await Auth.sendPasswordResetEmail(email);toast('Reset email sent! Check your inbox.','success');}catch(e){toast(authErrMsg(e.code),'error');}finally{hideLoading();}});
}

function sendOtp(){
  const ph=(($('phoneInput')||{}).value||'').trim();
  if(!/^\d{10}$/.test(ph)){toast('Enter valid 10-digit mobile number','error');return;}
  showLoading('Preparing OTP...');
  const rc=$('recaptcha-container');if(rc)rc.innerHTML='';
  if(rcaptchaVerifier){try{rcaptchaVerifier.clear();}catch(e){}rcaptchaVerifier=null;}rcaptchaResult=null;
  try{
    rcaptchaVerifier=new firebase.auth.RecaptchaVerifier('recaptcha-container',{
      size:'normal',
      callback:()=>{
        showLoading('Sending OTP to +91'+ph+'...');
        Auth.signInWithPhoneNumber('+91'+ph,rcaptchaVerifier)
          .then(res=>{rcaptchaResult=res;setStyle('otpWrap','display','block');toast('OTP sent to +91'+ph,'success');hideLoading();})
          .catch(e=>{toast(authErrMsg(e.code),'error',6000);hideLoading();try{rcaptchaVerifier.clear();}catch(e){}rcaptchaVerifier=null;});
      },
      'expired-callback':()=>{toast('reCAPTCHA expired. Click Send OTP again.','error');hideLoading();}
    });
    rcaptchaVerifier.render().then(()=>hideLoading()).catch(e=>{toast('reCAPTCHA error: '+e.message,'error');hideLoading();});
  }catch(e){toast('Setup failed: '+e.message,'error');hideLoading();}
}

function verifyOtp(){const otp=qsa('.otp-box').map(b=>b.value).join('');if(otp.length!==6){toast('Enter full 6-digit OTP','error');return;}if(!rcaptchaResult){toast('Please send OTP first','error');return;}showLoading('Verifying...');rcaptchaResult.confirm(otp).then(()=>{toast('Phone verified! Welcome!','success');switchSection('home');showProfileSetupIfNeeded();}).catch(e=>{toast(e.code==='auth/invalid-verification-code'?'Incorrect OTP. Please try again.':'Verification failed. Try again.','error');}).finally(hideLoading);}

function showProfileSetupIfNeeded(){if(!currentUser)return;const name=currentUser.displayName||localStorage.getItem('sx_name')||'';if(name&&name!=='User')return;setTimeout(()=>{const ov=document.createElement('div');ov.style.cssText='position:fixed;inset:0;z-index:700;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;padding:20px;';ov.innerHTML=`<div style="background:var(--card);border-radius:20px;padding:24px;width:100%;max-width:380px"><h3 style="font-weight:900;font-size:1.1rem;color:var(--txt);margin-bottom:6px">Set up your profile</h3><p style="font-size:.82rem;color:var(--tm);margin-bottom:18px">Optional — you can skip this</p><input id="setupName" type="text" placeholder="Your display name" maxlength="40" style="width:100%;padding:11px 13px;border:1.5px solid var(--bdr2);border-radius:var(--rf);background:var(--card2);color:var(--txt);font-size:.9rem;outline:none;box-sizing:border-box;margin-bottom:10px"/><div style="display:flex;gap:8px"><button id="setupSkip" style="flex:1;padding:12px;background:var(--card2);border:1.5px solid var(--bdr2);border-radius:var(--rf);font-size:.88rem;font-weight:700;color:var(--tm);cursor:pointer">Skip</button><button id="setupSave" style="flex:2;padding:12px;background:var(--pr);color:#fff;border-radius:var(--rf);font-size:.88rem;font-weight:800;border:none;cursor:pointer">Save & Continue</button></div></div>`;document.body.appendChild(ov);ov.querySelector('#setupSkip').onclick=()=>ov.remove();ov.querySelector('#setupSave').onclick=async()=>{const n=(ov.querySelector('#setupName').value||'').trim();if(!n||n.length<2){toast('Enter at least 2 characters','error');return;}showLoading('Saving...');try{await currentUser.updateProfile({displayName:n});await DB.collection('users').doc(currentUser.uid).update({displayName:n,updatedAt:TS()});localStorage.setItem('sx_name',n);refreshProfileUI();updateDrawerStrip(currentUser);ov.remove();toast('Profile set!','success');}catch(e){toast('Failed: '+e.message,'error');}finally{hideLoading();}};},600);}

async function handleLogout(){showLoading('Logging out...');if(chatUnsub){chatUnsub();chatUnsub=null;}if(ordersUnsub){ordersUnsub();ordersUnsub=null;}if(notifUnsub){notifUnsub();notifUnsub=null;}if(rcaptchaVerifier){try{rcaptchaVerifier.clear();}catch(e){}rcaptchaVerifier=null;}await Auth.signOut().catch(()=>{});toast('Logged out','info');switchSection('home');hideLoading();buildAuthScreen();}
on('profileLogoutBtn','click',handleLogout);
on('profileAvatarEditBtn','click',()=>{const fi=$('avatarFileInput');if(fi)fi.click();});
on('avatarFileInput','change',async e=>{const file=e.target.files&&e.target.files[0];if(!file||!currentUser)return;if(file.size>5*1024*1024){toast('Max 5MB','error');return;}showLoading('Uploading photo...');try{const url=await uploadFile(file,'avatars/'+currentUser.uid+'/',()=>{});await currentUser.updateProfile({photoURL:url});await DB.collection('users').doc(currentUser.uid).update({photoURL:url,updatedAt:TS()});const snap=await DB.collection('posts').where('userId','==',currentUser.uid).limit(20).get();const batch=DB.batch();snap.docs.forEach(doc=>batch.update(doc.ref,{userPhoto:url}));await batch.commit().catch(()=>{});refreshProfileUI();updateDrawerStrip(currentUser);toast('Profile photo updated!','success');}catch(err){toast('Upload failed: '+err.message,'error');}finally{hideLoading();const fi=$('avatarFileInput');if(fi)fi.value='';}});
on('editProfileBtn','click',openEditProfile);
function openEditProfile(){if(!currentUser)return;const existing=document.getElementById('editProfileOverlay');if(existing){existing.classList.add('upo-open');document.body.style.overflow='hidden';return;}const ov=document.createElement('div');ov.id='editProfileOverlay';ov.className='user-profile-overlay upo-open';ov.style.zIndex='615';ov.innerHTML=`<div class="upo-header"><button class="upo-back-btn btn-anim" id="epClose"><span class="material-icons-round">close</span></button><span class="upo-header-title">Edit Profile</span></div><div class="upo-body" style="padding:20px"><div style="margin-bottom:14px"><label style="display:block;font-size:.8rem;font-weight:700;color:var(--txt);margin-bottom:6px">Display Name</label><input id="editNameInput" type="text" value="${esc(currentUser.displayName||localStorage.getItem('sx_name')||'')}" style="width:100%;padding:11px 13px;border:1.5px solid var(--bdr2);border-radius:var(--rf);background:var(--card2);color:var(--txt);font-size:.9rem;outline:none;box-sizing:border-box" placeholder="Your display name" maxlength="50"/></div><button id="saveProfileBtn" style="display:flex;align-items:center;justify-content:center;gap:7px;width:100%;padding:13px;background:var(--pr);color:#fff;border-radius:var(--rf);font-size:.9rem;font-weight:700;border:none;cursor:pointer"><span class="material-icons-round">save</span>Save Changes</button></div>`;document.body.appendChild(ov);document.body.style.overflow='hidden';ov.querySelector('#epClose').onclick=()=>{ov.classList.remove('upo-open');document.body.style.overflow='';};ov.querySelector('#saveProfileBtn').addEventListener('click',async()=>{const n=(ov.querySelector('#editNameInput').value||'').trim();if(!n||n.length<2){toast('At least 2 characters','error');return;}showLoading('Saving...');try{await currentUser.updateProfile({displayName:n});await DB.collection('users').doc(currentUser.uid).update({displayName:n,updatedAt:TS()});localStorage.setItem('sx_name',n);refreshProfileUI();updateDrawerStrip(currentUser);ov.classList.remove('upo-open');document.body.style.overflow='';toast('Profile updated!','success');}catch(err){toast('Failed: '+err.message,'error');}finally{hideLoading();};});}
on('menuSettings','click',()=>{if(!currentUser){toast('Login required','info');return;}openSettings();});
function openSettings(){const ex=document.getElementById('settingsOverlay');if(ex){ex.classList.add('upo-open');document.body.style.overflow='hidden';return;}const ov=document.createElement('div');ov.id='settingsOverlay';ov.className='user-profile-overlay upo-open';ov.style.zIndex='615';ov.innerHTML=`<div class="upo-header"><button class="upo-back-btn btn-anim" id="sClose"><span class="material-icons-round">close</span></button><span class="upo-header-title">Settings</span></div><div class="upo-body"><div style="padding:14px"><div style="background:var(--card2);border-radius:var(--r2);border:1px solid var(--bdr);overflow:hidden"><button onclick="applyTheme(!isDark)" style="display:flex;align-items:center;gap:12px;width:100%;padding:14px;border-bottom:1px solid var(--bdr);text-align:left;background:none;cursor:pointer;color:var(--txt)"><span class="material-icons-round" style="color:var(--pr)">palette</span><span style="font-weight:700">Toggle Dark / Light Mode</span></button><button id="sEditBtn" style="display:flex;align-items:center;gap:12px;width:100%;padding:14px;border-bottom:1px solid var(--bdr);text-align:left;background:none;cursor:pointer;color:var(--txt)"><span class="material-icons-round" style="color:var(--pr)">edit</span><span style="font-weight:700">Edit Profile Name</span></button><button id="sPhotoBtn" style="display:flex;align-items:center;gap:12px;width:100%;padding:14px;text-align:left;background:none;cursor:pointer;color:var(--txt)"><span class="material-icons-round" style="color:var(--pr)">photo_camera</span><span style="font-weight:700">Change Profile Photo</span></button></div><button onclick="handleLogout()" style="display:flex;align-items:center;gap:10px;width:100%;margin-top:12px;padding:13px;border-radius:var(--rf);background:var(--er-b);border:1px solid rgba(244,33,46,.2);color:var(--er);font-weight:700;cursor:pointer"><span class="material-icons-round">logout</span>Logout</button></div></div>`;document.body.appendChild(ov);document.body.style.overflow='hidden';ov.querySelector('#sClose').onclick=()=>{ov.classList.remove('upo-open');document.body.style.overflow='';};ov.querySelector('#sEditBtn').onclick=()=>{ov.classList.remove('upo-open');document.body.style.overflow='';openEditProfile();};ov.querySelector('#sPhotoBtn').onclick=()=>{ov.classList.remove('upo-open');document.body.style.overflow='';const fi=$('avatarFileInput');if(fi)fi.click();};}
on('menuYourPosts','click',()=>{if(!currentUser){toast('Login required','info');return;}openYourPosts();});
on('menuLikedPosts','click',()=>{if(!currentUser){toast('Login required','info');return;}openLikedPosts();});
on('menuSaved','click',()=>{if(!currentUser){toast('Login required','info');return;}openSavedPosts();});
on('menuOrders','click',()=>{if(!currentUser){toast('Login required','info');return;}openOrdersOverlay();});

/* NOTIFICATIONS */
function listenNotifications(uid){if(notifUnsub){notifUnsub();notifUnsub=null;}notifUnsub=DB.collection('notifications').where('toUid','==',uid).where('read','==',false).onSnapshot(snap=>{const n=snap.size;const dot=$('headerNotifDot');if(dot){dot.style.display=n?'block':'none';dot.style.background='#f4212e';}setStyle('drawerNotifBadge','display',n?'inline-flex':'none');setText('drawerNotifBadge',String(n));},()=>{});}
function openNotificationsPanel(){if(!currentUser){toast('Login to see notifications','info');return;}const existing=document.getElementById('notifOverlay');if(existing){existing.classList.add('upo-open');document.body.style.overflow='hidden';loadNotifications();return;}const ov=document.createElement('div');ov.id='notifOverlay';ov.className='user-profile-overlay upo-open';ov.style.zIndex='615';ov.innerHTML=`<div class="upo-header"><button class="upo-back-btn btn-anim" id="notifClose"><span class="material-icons-round">close</span></button><span class="upo-header-title">Notifications</span></div><div class="upo-body" id="notifBody"><div class="pdf-loading"><div class="spinner"></div></div></div>`;document.body.appendChild(ov);document.body.style.overflow='hidden';ov.querySelector('#notifClose').onclick=()=>{ov.classList.remove('upo-open');document.body.style.overflow='';};loadNotifications();}
async function loadNotifications(){
  const body=document.getElementById('notifBody');if(!body||!currentUser)return;
  body.innerHTML='<div class="pdf-loading"><div class="spinner"></div></div>';
  let docs=[];
  try{const snap=await DB.collection('notifications').where('toUid','==',currentUser.uid).orderBy('createdAt','desc').limit(40).get();docs=snap.docs;}
  catch(e){try{const snap=await DB.collection('notifications').where('toUid','==',currentUser.uid).limit(40).get();docs=snap.docs.sort((a,b)=>{const ta=a.data().createdAt?.toDate?a.data().createdAt.toDate():new Date(0);const tb=b.data().createdAt?.toDate?b.data().createdAt.toDate():new Date(0);return tb-ta;});}catch(e2){body.innerHTML='<p style="padding:20px;color:var(--tm)">Failed to load. Please create Firestore index.</p>';return;}}
  body.innerHTML='';
  if(!docs.length){body.innerHTML='<div style="text-align:center;padding:40px;color:var(--tm)"><span class="material-icons-round" style="font-size:44px;opacity:.3;display:block;margin-bottom:12px">notifications_none</span><p>No notifications</p></div>';return;}
  const batch=DB.batch();docs.forEach(d=>{if(!d.data().read)batch.update(d.ref,{read:true});});batch.commit().catch(()=>{});
  docs.forEach(doc=>{
    const n=doc.data();
    const el=document.createElement('div');el.style.cssText='display:flex;align-items:flex-start;gap:12px;padding:13px 16px;border-bottom:1px solid var(--bdr);';
    const avWrap=document.createElement('div');avWrap.style.cssText='width:44px;height:44px;border-radius:50%;background:'+randomColor(n.fromUid)+';display:flex;align-items:center;justify-content:center;color:#fff;font-weight:900;font-size:1rem;flex-shrink:0;overflow:hidden;cursor:pointer;';
    if(n.fromPhoto&&n.fromPhoto.startsWith('http')){avWrap.innerHTML=`<img src="${esc(n.fromPhoto)}" style="width:100%;height:100%;object-fit:cover" onerror="this.parentNode.textContent='${(n.fromName||'U')[0].toUpperCase()}'"/>`;}else avWrap.textContent=(n.fromName||'U')[0].toUpperCase();
    avWrap.onclick=()=>{const no=document.getElementById('notifOverlay');if(no)no.classList.remove('upo-open');document.body.style.overflow='';openUserProfile(n.fromUid);};
    const typeText=n.type==='follow'?'started following you':n.type==='message'?'sent you a message':n.type==='like'?'liked your post':'interacted with you';
    const info=document.createElement('div');info.style.flex='1';
    const preview=n.type==='message'&&n.preview?`<p style="font-size:.8rem;color:var(--txt);margin-top:4px;background:var(--card2);padding:6px 10px;border-radius:10px;display:inline-block">"${esc(n.preview)}"</p>`:'';
    /* Reply button — after clicking, removes notification from panel */
    const replyBtn=n.type==='message'?`<button class="notif-reply-btn" data-docid="${doc.id}" data-uid="${esc(n.fromUid)}" data-name="${esc(n.fromName||'')}" data-photo="${esc(n.fromPhoto||'')}" style="margin-top:7px;padding:6px 14px;background:var(--pr);color:#fff;border:none;border-radius:var(--rf);font-size:.78rem;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:5px"><span class="material-icons-round" style="font-size:14px">reply</span>Reply</button>`:'';
    info.innerHTML=`<p style="font-weight:700;font-size:.9rem;color:var(--txt)">${esc(n.fromName||'User')} <span style="font-weight:500;color:var(--tm)">${typeText}</span></p><p style="font-size:.74rem;color:var(--tm)">${fmtAgo(n.createdAt)}</p>${preview}<div>${replyBtn}</div>`;
    const rb=info.querySelector('.notif-reply-btn');
    if(rb){rb.onclick=e=>{e.stopPropagation();
      /* Remove notification from panel visually */
      el.style.transition='opacity .3s';el.style.opacity='0';setTimeout(()=>el.remove(),300);
      /* Mark as read in Firestore */
      DB.collection('notifications').doc(rb.dataset.docid).update({read:true}).catch(()=>{});
      /* Open chat */
      const no=document.getElementById('notifOverlay');if(no)no.classList.remove('upo-open');document.body.style.overflow='';
      switchSection('messages');setTimeout(()=>openChatWith(rb.dataset.uid,rb.dataset.name,rb.dataset.photo),300);
    };}
    el.addEventListener('click',()=>{if(n.type==='follow'){const no=document.getElementById('notifOverlay');if(no)no.classList.remove('upo-open');document.body.style.overflow='';openUserProfile(n.fromUid);}});
    el.appendChild(avWrap);el.appendChild(info);body.appendChild(el);
  });
}

/* DEEP LINK + FEATURED */
function handleDeepLink(){const hash=window.location.hash;if(!hash)return;const pm=hash.match(/^#post\/(.+)$/);if(pm){DB.collection('posts').doc(pm[1]).get().then(snap=>{if(!snap.exists||snap.data().status)return;const post={id:snap.id,...snap.data()};if(post.mediaType==='video'&&post.mediaUrl)openReels([post],0);else if(post.mediaType==='photo'&&post.mediaUrl)openPhotoViewer(post.mediaUrl,post.text||'',post);}).catch(()=>{})}const um=hash.match(/^#user\/(.+)$/);if(um)openUserProfile(um[1]);}
window.addEventListener('hashchange',handleDeepLink);
function getPostShareUrl(pid){return location.origin+location.pathname+'#post/'+pid;}

function loadFeatured(){
  DB.collection('featured').orderBy('createdAt','desc').limit(10).onSnapshot(snap=>{
    const scroll=$('featuredScroll'),strip=$('featuredStrip');if(!scroll)return;
    scroll.innerHTML='';if(!snap.size){if(strip)strip.style.display='none';return;}if(strip)strip.style.display='block';
    snap.docs.forEach(doc=>{
      const d={id:doc.id,...doc.data()},isVideo=d.mediaType==='video'||d.type==='video';
      const card=document.createElement('div');card.className='featured-card';
      card.style.cssText='flex-shrink:0;width:280px;height:190px;border-radius:18px;overflow:hidden;position:relative;cursor:pointer;background:#111;box-shadow:0 4px 16px rgba(0,0,0,.25)';
      if(isVideo&&d.mediaUrl){
        card.innerHTML=`<video src="${esc(d.mediaUrl)}" style="width:100%;height:100%;object-fit:cover;display:block;" autoplay loop playsinline muted></video><div style="position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,.75) 0%,transparent 50%);display:flex;flex-direction:column;justify-content:flex-end;padding:12px"><p style="color:#fff;font-size:.9rem;font-weight:800">Sponsored</p></div><button style="position:absolute;top:10px;right:10px;width:30px;height:30px;border-radius:50%;background:rgba(0,0,0,.5);border:none;display:flex;align-items:center;justify-content:center;color:#fff;cursor:pointer;" class="feat-mute"><span class="material-icons-round" style="font-size:16px">volume_off</span></button>`;
        const vid=card.querySelector('video');card.querySelector('.feat-mute').addEventListener('click',e=>{e.stopPropagation();vid.muted=!vid.muted;e.currentTarget.querySelector('.material-icons-round').textContent=vid.muted?'volume_off':'volume_up';});
      }else{
        const thumb=d.thumbnailUrl||'';
        card.innerHTML=(thumb?`<img src="${esc(thumb)}" style="width:100%;height:100%;object-fit:cover;display:block;" onerror="this.style.display='none'"/>`:'')+`<div style="position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,.75) 0%,transparent 50%);display:flex;flex-direction:column;justify-content:flex-end;padding:12px"><p style="color:#fff;font-size:.9rem;font-weight:800">Sponsored</p></div>`;
      }
      card.addEventListener('click',e=>{if(e.target.closest('.feat-mute'))return;if(d.link)window.open(d.link,'_blank','noopener');else if(isVideo&&d.mediaUrl)openReels([{id:d.id,mediaUrl:d.mediaUrl,mediaType:'video',text:'',userName:'SayatX',userPhoto:LOGO_URL,thumbnailUrl:d.thumbnailUrl||'',likes:0,commentCount:0,views:0,createdAt:d.createdAt}],0);else if(d.thumbnailUrl)openPhotoViewer(d.thumbnailUrl,'',null);});
      scroll.appendChild(card);
    });
  },()=>{const s=$('featuredStrip');if(s)s.style.display='none';});
}

/* FEED */
let feedFilter='all';
function loadFeed(filter){
  feedFilter=filter||'all';if(feedUnsub){feedUnsub();feedUnsub=null;}
  const skel=$('feedSkeleton');if(skel)skel.style.display='block';
  closeSearchPanel();clearFeedPosts();
  if(filter==='shop'){renderProductsFeed();return;}
  let q=DB.collection('posts').orderBy('createdAt','desc').limit(50);
  if(filter==='videos')q=DB.collection('posts').where('mediaType','==','video').orderBy('createdAt','desc').limit(50);
  if(filter==='photos')q=DB.collection('posts').where('mediaType','==','photo').orderBy('createdAt','desc').limit(50);
  if(filter==='trending')q=DB.collection('posts').orderBy('likes','desc').limit(50);
  feedUnsub=q.onSnapshot(snap=>{
    if(skel)skel.style.display='none';
    let posts=snap.docs.map(d=>({id:d.id,_type:'post',...d.data()})).filter(p=>!p.status);
    if(filter==='all'||filter==='videos'){const tp=posts.filter(p=>isTrading(p.text)&&p.mediaType==='video'),op=posts.filter(p=>!(isTrading(p.text)&&p.mediaType==='video'));posts=[...tp,...op];}
    let items=[...posts];
    if(filter==='all'){const prods=allProducts.map(p=>({...p,_type:'product'}));items=mergeByDate([...posts,...prods]);}
    window._feedItems=items;renderFeed(items);
  },()=>{if(skel)skel.style.display='none';});
}
function clearFeedPosts(){const fc=$('feedContainer');if(!fc)return;qsa('.feed-post',fc).forEach(el=>el.remove());const emp=qs('.feed-empty',fc);if(emp)emp.remove();}
function mergeByDate(items){return items.sort((a,b)=>{const ta=a.createdAt&&a.createdAt.toDate?a.createdAt.toDate():new Date(a.createdAt||0);const tb=b.createdAt&&b.createdAt.toDate?b.createdAt.toDate():new Date(b.createdAt||0);return tb-ta;});}
function renderFeed(items){const fc=$('feedContainer');if(!fc)return;clearFeedPosts();if(!items||!items.length){const emp=document.createElement('div');emp.className='feed-empty';emp.innerHTML='<span class="material-icons-round">feed</span><p>No posts yet</p>';fc.appendChild(emp);return;}items.forEach(item=>{const el=item._type==='product'?buildProductPost(item):buildUserPost(item);if(el)fc.appendChild(el);});setupVideoAutoplay();}
function renderProductsFeed(){const skel=$('feedSkeleton');if(skel)skel.style.display='none';if(!allProducts.length){loadFeed('all');return;}const fc=$('feedContainer');if(!fc)return;allProducts.forEach(p=>{const el=buildProductPost({...p,_type:'product'});if(el)fc.appendChild(el);});}

/* FOLLOW helper — silent on permission errors */
async function quickFollow(targetUid,btn){
  if(!currentUser){toast('Login to follow','info');return;}
  if(targetUid===currentUser.uid)return;
  const isNowFollowing=btn.classList.contains('following');
  btn.disabled=true;
  const docId=currentUser.uid+'_'+targetUid;
  try{
    /* Update follow document first */
    if(isNowFollowing){await DB.collection('follows').doc(docId).delete();}
    else{await DB.collection('follows').doc(docId).set({followerUid:currentUser.uid,followingUid:targetUid,createdAt:TS()});}
    followingCache[targetUid]=!isNowFollowing;
    localStorage.setItem('sx_following',JSON.stringify(followingCache));
    /* Update counts separately — catch permission errors silently */
    DB.collection('users').doc(targetUid).update({followers:INC(isNowFollowing?-1:1)}).catch(()=>{});
    DB.collection('users').doc(currentUser.uid).update({following:INC(isNowFollowing?-1:1)}).catch(()=>{});
    btn.classList.toggle('following',!isNowFollowing);btn.textContent=!isNowFollowing?'Following':'Follow';
    if(!isNowFollowing){toast('Following!','success');DB.collection('notifications').add({toUid:targetUid,fromUid:currentUser.uid,fromName:currentUser.displayName||'User',fromPhoto:currentUser.photoURL||'',type:'follow',read:false,createdAt:TS()}).catch(()=>{});}
    else toast('Unfollowed','info');
  }catch(e){
    /* Permission denied → silently update local cache, show no error */
    if(e.code==='permission-denied'){followingCache[targetUid]=!isNowFollowing;localStorage.setItem('sx_following',JSON.stringify(followingCache));btn.classList.toggle('following',!isNowFollowing);btn.textContent=!isNowFollowing?'Following':'Follow';if(!isNowFollowing)toast('Following!','success');else toast('Unfollowed','info');}
    else toast('Error: '+e.message,'error');
  }
  btn.disabled=false;
}

/* SAVED POSTS */
async function toggleSave(postId,btn){
  if(!currentUser){toast('Login to save posts','info');return;}
  const isSaved=!!savedPosts[postId];
  savedPosts[postId]=!isSaved;localStorage.setItem('sx_saved',JSON.stringify(savedPosts));
  if(btn){const ic=btn.querySelector('.material-icons-round');if(ic)ic.textContent=!isSaved?'bookmark':'bookmark_border';}
  try{
    if(!isSaved)await DB.collection('saves').doc(currentUser.uid+'_'+postId).set({userId:currentUser.uid,postId,createdAt:TS()});
    else await DB.collection('saves').doc(currentUser.uid+'_'+postId).delete();
    toast(!isSaved?'Post saved!':'Removed from saved','success');
  }catch(e){/* silent */}
}
function openSavedPosts(){const ids=Object.keys(savedPosts).filter(k=>savedPosts[k]);if(!ids.length){toast('No saved posts yet','info');return;}const ov=$('yourPostsOverlay');if(!ov)return;ov.classList.add('ypo-open');document.body.style.overflow='hidden';setText('ypoTitle','Saved Posts');setHTML('ypoBody','<div class="pdf-loading"><div class="spinner"></div></div>');Promise.all(ids.slice(0,30).map(id=>DB.collection('posts').doc(id).get())).then(snaps=>{const body=$('ypoBody');if(!body)return;body.innerHTML='';body.style.padding='10px 0';const posts=snaps.filter(s=>s.exists&&!s.data().status).map(s=>({id:s.id,...s.data()}));if(!posts.length){body.innerHTML='<div style="text-align:center;padding:40px;color:var(--tm)"><span class="material-icons-round" style="font-size:44px;opacity:.3;display:block">bookmark_border</span><p>No saved posts</p></div>';return;}posts.forEach(p=>{const ui={name:p.userName||'User',photoURL:p.userPhoto||'',uid:p.userId};body.appendChild(buildFbPostItem(p,ui,null));});}).catch(()=>setHTML('ypoBody','<p style="padding:24px;color:var(--tm)">Failed</p>'));}

function buildUserPost(post){
  const el=document.createElement('article');el.className='feed-post';el.dataset.postId=post.id;
  const liked=!!likedPosts[post.id],isSaved=!!savedPosts[post.id],name=post.userName||'User',isOwn=currentUser&&post.userId===currentUser.uid;
  const avInner=post.userPhoto&&post.userPhoto.startsWith('http')?`<img src="${esc(post.userPhoto)}" alt="" onerror="this.parentNode.textContent='${name[0].toUpperCase()}'"/>`:`<span>${name[0].toUpperCase()}</span>`;
  const tradeBadge=isTrading(post.text)&&post.mediaType==='video'?'<span class="trading-badge">📈 TRADING</span>':'';
  let media='';
  if(post.mediaType==='video'&&post.mediaUrl){media=`<div class="post-video-wrap auto" data-post-id="${post.id}"><video class="post-video-thumb" src="${esc(post.mediaUrl)}" preload="metadata" playsinline muted loop poster="${esc(post.thumbnailUrl||'')}"></video><div class="post-video-play-overlay"><div class="post-play-btn"><span class="material-icons-round">play_arrow</span></div></div><div class="vid-buf"><div class="spinner"></div></div></div>`;}
  else if(post.mediaType==='photo'&&post.mediaUrl){media=`<img class="post-photo-img" src="${esc(post.mediaUrl)}" loading="lazy" style="width:100%;height:auto;display:block;" onerror="this.style.display='none'"/>`;}
  else if(post.mediaType==='audio'&&post.mediaUrl){media=`<div class="post-audio-card" data-post-id="${post.id}">${post.thumbnailUrl?`<img src="${esc(post.thumbnailUrl)}" style="width:56px;height:56px;border-radius:10px;object-fit:cover;flex-shrink:0" alt=""/>`:'<div class="post-audio-play-btn"><span class="material-icons-round">play_arrow</span></div>'}<div class="post-audio-info"><p class="post-audio-title">${esc(post.text||'Audio')}</p></div><span class="post-audio-type-tag">Audio</span></div>`;}
  const badge=post.mediaType==='video'?'<span class="post-type-badge badge-video">VIDEO</span>':post.mediaType==='photo'?'<span class="post-type-badge badge-image">PHOTO</span>':post.mediaType==='audio'?'<span class="post-type-badge badge-audio">AUDIO</span>':'<span class="post-type-badge badge-text">TEXT</span>';
  const isFollowingUser=!!followingCache[post.userId];
  const followBtnHtml=(!isOwn&&post.userId)?`<button class="quick-follow-btn${isFollowingUser?' following':''}" data-uid="${esc(post.userId)}">${isFollowingUser?'Following':'Follow'}</button>`:'';
  el.innerHTML=`
    <div class="feed-post-header" data-uid="${esc(post.userId||'')}">
      <div class="post-avatar" style="background:${randomColor(post.userId)}">${avInner}</div>
      <div class="post-user-info"><div class="post-username">${esc(name)} ${badge}${tradeBadge}</div><div class="post-meta"><span class="post-handle">@${esc(name.toLowerCase().replace(/[^a-z0-9]/g,'_'))}</span><span class="post-dot">·</span><span class="post-time">${fmtAgo(post.createdAt)}</span></div></div>
      <div style="display:flex;align-items:center;gap:8px">${followBtnHtml}<button class="post-more-btn"><span class="material-icons-round">more_horiz</span></button></div>
    </div>
    ${post.text&&post.mediaType!=='audio'?`<div class="post-text-content" style="line-height:1.5">${linkifyText(post.text)}</div>`:''}
    ${media}
    <div class="post-footer">
      <button class="post-footer-btn post-like-btn${liked?' btn-liked':''}" data-post-id="${post.id}"><span class="material-icons-round">${liked?'favorite':'favorite_border'}</span><span class="like-count">${fmtCount(post.likes||0)}</span></button>
      <button class="post-footer-btn post-cmt-btn"><span class="material-icons-round">chat_bubble_outline</span><span>${fmtCount(post.commentCount||0)}</span></button>
      <button class="post-footer-btn post-save-btn"><span class="material-icons-round">${isSaved?'bookmark':'bookmark_border'}</span></button>
      <button class="post-footer-btn post-share-btn"><span class="material-icons-round">share</span></button>
      <div class="post-footer-spacer"></div>
      <div class="post-views"><span class="material-icons-round">visibility</span><span>${fmtCount(post.views||0)}</span></div>
    </div>`;
  const fBtn=el.querySelector('.quick-follow-btn');if(fBtn){fBtn.addEventListener('click',e=>{e.stopPropagation();quickFollow(post.userId,fBtn);});}
  el.querySelector('.post-like-btn').addEventListener('click',e=>{e.stopPropagation();handleLike(post.id,el.querySelector('.post-like-btn'),el.querySelector('.like-count'));});
  el.querySelector('.post-cmt-btn').addEventListener('click',e=>{e.stopPropagation();openComments(post.id);});
  el.querySelector('.post-save-btn').addEventListener('click',e=>{e.stopPropagation();toggleSave(post.id,el.querySelector('.post-save-btn'));});
  el.querySelector('.post-share-btn').addEventListener('click',e=>{e.stopPropagation();handleShare(post.id,post.text||'SayatX');});
  el.querySelector('.feed-post-header').addEventListener('click',ev=>{if(ev.target.closest('.post-more-btn')||ev.target.closest('.quick-follow-btn'))return;if(post.userId)openUserProfile(post.userId);});
  el.querySelector('.post-more-btn').addEventListener('click',e=>{e.stopPropagation();showPostMenu(post,isOwn);});
  const vw=el.querySelector('.post-video-wrap');
  if(vw){
    const vidEl=vw.querySelector('video'),buf=vw.querySelector('.vid-buf');
    if(vidEl){
      vidEl.addEventListener('loadedmetadata',()=>{if(vidEl.videoWidth&&vidEl.videoHeight){const r=vidEl.videoWidth/vidEl.videoHeight;vw.classList.remove('auto','portrait','landscape');vw.classList.add(r<1?'portrait':'landscape');}},{once:true});
      if(buf){vidEl.addEventListener('waiting',()=>buf.classList.add('show'));vidEl.addEventListener('playing',()=>buf.classList.remove('show'));vidEl.addEventListener('canplay',()=>buf.classList.remove('show'));}
    }
    let tt=null,tc=0;
    vw.addEventListener('click',()=>{tc++;clearTimeout(tt);tt=setTimeout(()=>{if(tc===1){const vids=(window._feedItems||[]).filter(i=>i._type==='post'&&i.mediaType==='video'&&i.mediaUrl);const idx=vids.findIndex(p=>p.id===post.id);openReels(vids.length?vids:[post],Math.max(0,idx));DB.collection('posts').doc(post.id).update({views:INC(1)}).catch(()=>{});}else if(tc>=2){handleLike(post.id,el.querySelector('.post-like-btn'),el.querySelector('.like-count'));showHeartEffect(vw);}tc=0;},280);});
  }
  el.querySelector('.post-audio-card')?.addEventListener('click',()=>{openAudioOverlay(post.mediaUrl,post.text||'Audio',post.thumbnailUrl||'');if(!viewedPosts.has(post.id)){viewedPosts.add(post.id);DB.collection('posts').doc(post.id).update({views:INC(1)}).catch(()=>{});}});
  el.querySelector('.post-photo-img')?.addEventListener('click',()=>{openPhotoViewer(post.mediaUrl,post.text||'',post);DB.collection('posts').doc(post.id).update({views:INC(1)}).catch(()=>{});});
  return el;
}

function buildProductPost(product){const el=document.createElement('article');el.className='feed-post';const disc=product.originalPrice>product.price?Math.round((1-product.price/product.originalPrice)*100):0;const img=(product.images&&product.images[0])||product.image||'';el.innerHTML=`<div class="feed-post-header" style="cursor:default"><div class="post-avatar" style="background:#fff;padding:2px;overflow:hidden"><img src="${LOGO_URL}" alt="SX" style="width:100%;height:100%;object-fit:contain;border-radius:50%"/></div><div class="post-user-info"><div class="post-username">SayatX <span class="post-type-badge badge-product">PRODUCT</span></div><div class="post-meta"><span class="post-handle">@sayatx</span><span class="post-dot">·</span><span class="post-time">${fmtAgo(product.createdAt)}</span></div></div></div><div class="post-product-card"><div class="post-product-img-wrap"><img class="post-product-img" src="${esc(img)}" loading="lazy" onerror="this.src='https://placehold.co/400x300?text=Product'"/>${disc?`<span class="post-product-disc-badge">${disc}% OFF</span>`:''}</div><div class="post-product-body"><p class="post-product-name">${esc(product.title)}</p><div class="post-product-prices"><span class="post-product-price">&#x20B9;${fmt(product.price)}</span>${product.originalPrice>product.price?`<span class="post-product-orig">&#x20B9;${fmt(product.originalPrice)}</span>`:''}</div></div><div class="post-product-actions"><button class="btn-buy-now" style="grid-column:1/-1"><span class="material-icons-round">flash_on</span>Buy Now — &#x20B9;${fmt(product.price)}</button></div></div><div class="post-footer"><div class="post-footer-spacer"></div></div>`;el.querySelector('.post-product-img').addEventListener('click',()=>openPhotoViewer(img,product.title,null));el.querySelector('.btn-buy-now').addEventListener('click',e=>{e.stopPropagation();handleBuyNow(product);});return el;}
function handleLike(postId,btn,countEl){if(!currentUser){toast('Login to like posts','info');return;}const was=!!likedPosts[postId];likedPosts[postId]=!was;localStorage.setItem('sx_liked',JSON.stringify(likedPosts));if(btn){btn.classList.toggle('btn-liked',!was);const ic=btn.querySelector('.material-icons-round');if(ic)ic.textContent=was?'favorite_border':'favorite';}if(countEl){const prev=parseInt(countEl.textContent,10)||0;countEl.textContent=fmtCount(Math.max(0,was?prev-1:prev+1));}DB.collection('posts').doc(postId).update({likes:INC(was?-1:1)}).catch(()=>{});}
function handleShare(postId,text){const url=getPostShareUrl(postId);if(navigator.share)navigator.share({title:'SayatX',text,url}).catch(()=>{});else navigator.clipboard.writeText(url).then(()=>toast('Link copied!','success')).catch(()=>{});}
function showHeartEffect(container){const heart=document.createElement('div');heart.innerHTML='❤️';heart.style.cssText='position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) scale(0);font-size:80px;z-index:10;pointer-events:none;transition:transform .3s ease,opacity .5s ease .3s;';container.style.position='relative';container.appendChild(heart);requestAnimationFrame(()=>{heart.style.transform='translate(-50%,-50%) scale(1)';});setTimeout(()=>{heart.style.opacity='0';setTimeout(()=>heart.remove(),500);},800);}
function showPostMenu(post,isOwn){const existing=document.getElementById('postMenuOverlay');if(existing)existing.remove();const menu=document.createElement('div');menu.id='postMenuOverlay';menu.style.cssText='position:fixed;inset:0;z-index:650;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,.5);';const sheet=document.createElement('div');sheet.style.cssText='background:var(--card);border-radius:20px 20px 0 0;width:100%;max-width:520px;padding:16px 0 calc(env(safe-area-inset-bottom,0px)+16px);';const btns=[{icon:'share',label:'Share',fn:()=>handleShare(post.id,post.text||'SayatX')},{icon:'link',label:'Copy Link',fn:()=>navigator.clipboard.writeText(getPostShareUrl(post.id)).then(()=>toast('Link copied!','success')).catch(()=>{})},{icon:savedPosts[post.id]?'bookmark':'bookmark_border',label:savedPosts[post.id]?'Remove from Saved':'Save Post',fn:()=>toggleSave(post.id,null)},{icon:'person',label:'View Profile',fn:()=>{if(post.userId)openUserProfile(post.userId);}}];if(isOwn)btns.push({icon:'delete',label:'Delete Post',fn:()=>deletePost(post.id),danger:true});btns.forEach(b=>{const btn=document.createElement('button');btn.style.cssText='display:flex;align-items:center;gap:14px;width:100%;padding:14px 20px;background:none;border:none;cursor:pointer;font-size:.9rem;font-weight:700;color:'+(b.danger?'var(--er)':'var(--txt)')+';';btn.innerHTML='<span class="material-icons-round" style="color:'+(b.danger?'var(--er)':'var(--pr)')+'">'+b.icon+'</span>'+esc(b.label);btn.addEventListener('click',()=>{menu.remove();b.fn();});sheet.appendChild(btn);});const cancel=document.createElement('button');cancel.style.cssText='display:flex;align-items:center;justify-content:center;width:calc(100% - 32px);margin:8px 16px 0;padding:13px;background:var(--card2);border:none;border-radius:var(--rf);cursor:pointer;font-size:.9rem;font-weight:700;color:var(--txt);';cancel.textContent='Cancel';cancel.addEventListener('click',()=>menu.remove());sheet.appendChild(cancel);menu.appendChild(sheet);menu.addEventListener('click',e=>{if(e.target===menu)menu.remove();});document.body.appendChild(menu);}
async function deletePost(postId){if(!currentUser){toast('Login required','error');return;}if(!confirm('Delete this post?'))return;showLoading('Deleting...');try{if(window._uploadTasks){window._uploadTasks.forEach(t=>{try{if(t.snapshot&&t.snapshot.state==='running')t.cancel();}catch(e){}});window._uploadTasks=[];}await DB.collection('posts').doc(postId).delete();await DB.collection('users').doc(currentUser.uid).update({postCount:INC(-1)}).catch(()=>{});toast('Post deleted','success');const el=document.querySelector('[data-post-id="'+postId+'"]');if(el)el.remove();}catch(e){toast(e.code==='permission-denied'?'Permission denied — update Firestore rules':'Failed: '+e.message,'error',5000);}hideLoading();}
function openPhotoViewer(url,caption,post){let ov=document.getElementById('photoViewerOverlay');if(!ov){ov=document.createElement('div');ov.id='photoViewerOverlay';ov.style.cssText='position:fixed;inset:0;background:#000;z-index:620;display:flex;flex-direction:column;align-items:center;justify-content:center;';ov.innerHTML=`<div style="position:absolute;top:calc(env(safe-area-inset-top,0px)+10px);left:0;right:0;display:flex;align-items:center;justify-content:space-between;padding:0 14px;z-index:2"><button id="pvClose" style="width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.15);display:flex;align-items:center;justify-content:center;border:none;cursor:pointer"><span class="material-icons-round btn-anim">close</span></button><button id="pvShare" style="width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.15);display:flex;align-items:center;justify-content:center;border:none;cursor:pointer"><span class="material-icons-round" style="color:#fff">share</span></button></div><img id="pvImg" style="max-width:100%;max-height:88dvh;object-fit:contain;display:block;width:100%;"/><p id="pvCaption" style="color:rgba(255,255,255,.8);font-size:.85rem;padding:10px 14px;text-align:center;max-width:600px;"></p>`;document.body.appendChild(ov);ov.querySelector('#pvClose').onclick=()=>{ov.style.display='none';document.body.style.overflow='';};}ov.querySelector('#pvImg').src=url;ov.querySelector('#pvCaption').textContent=caption||'';ov.querySelector('#pvShare').onclick=()=>{if(post)handleShare(post.id,caption||'SayatX');};ov.style.display='flex';document.body.style.overflow='hidden';}
function setupVideoAutoplay(){const vids=qsa('.post-video-wrap video');if(!vids.length)return;const obs=new IntersectionObserver(entries=>{entries.forEach(entry=>{const v=entry.target;if(entry.isIntersecting&&entry.intersectionRatio>=0.6){v._vt=setTimeout(()=>{v.muted=true;v.play().catch(()=>{});},2000);}else{clearTimeout(v._vt);v.pause();v.currentTime=0;}});},{threshold:0.6});vids.forEach(v=>obs.observe(v));}
function listenProducts(){DB.collection('products').orderBy('createdAt','desc').onSnapshot(snap=>{allProducts=snap.docs.map(d=>({id:d.id,...d.data()}));},()=>{});}

/* REELS — NO side SayatX text, only top brand, drag seek, buffer, follow, save */
function openReels(posts,startIndex){
  startIndex=startIndex||0;currentReelItems=posts;
  const scroll=$('reelScroll');if(!scroll)return;scroll.innerHTML='';
  posts.forEach((post,i)=>{
    const item=document.createElement('div');item.className='reel-item';item.dataset.i=i;
    const liked=!!likedPosts[post.id],isSaved=!!savedPosts[post.id],name=post.userName||'User';
    const av=post.userPhoto&&post.userPhoto.startsWith('http')?`<img src="${esc(post.userPhoto)}" alt="" onerror="this.parentNode.textContent='${name[0].toUpperCase()}'"/>`:name[0].toUpperCase();
    const isOwn=currentUser&&post.userId===currentUser.uid;
    const isFollowingUser=!!followingCache[post.userId];
    item.innerHTML=`
      <video class="reel-video" src="${esc(post.mediaUrl)}" playsinline loop preload="none" poster="${esc(post.thumbnailUrl||'')}"></video>
      <div class="reel-grad-top"></div><div class="reel-grad-bot"></div>
      <!-- TOP brand — ONLY "Sayat" + colored X, NO logo, NO side brand -->
      <div style="position:absolute;top:calc(env(safe-area-inset-top,0px)+12px);left:14px;z-index:5;">
        <span style="font-family:'Baloo 2',cursive;font-weight:900;font-size:1rem;text-shadow:0 1px 4px rgba(0,0,0,.5)">
          <span style="color:#fff">Sayat</span><span class="brand-x">X</span>
        </span>
      </div>
      <!-- Buffer spinner -->
      <div class="vid-buf" id="rbuf${i}"><div class="spinner"></div></div>
      <!-- Side buttons -->
      <div class="reel-side-btns">
        <div class="reel-side-btn reel-av-btn"><div class="reel-user-circle">${av}</div></div>
        ${!isOwn?`<div class="reel-side-btn reel-follow-btn${isFollowingUser?' reel-following':''}" data-uid="${esc(post.userId||'')}"><span class="material-icons-round">${isFollowingUser?'person_remove':'person_add'}</span><span class="reel-count">${isFollowingUser?'Following':'Follow'}</span></div>`:''}
        <div class="reel-side-btn reel-like-btn${liked?' reel-liked':''}" data-pid="${post.id}"><span class="material-icons-round">${liked?'favorite':'favorite_border'}</span><span class="reel-count">${fmtCount(post.likes||0)}</span></div>
        <div class="reel-side-btn reel-cmt-btn"><span class="material-icons-round">chat_bubble_outline</span><span class="reel-count">${fmtCount(post.commentCount||0)}</span></div>
        <div class="reel-side-btn reel-save-btn"><span class="material-icons-round">${isSaved?'bookmark':'bookmark_border'}</span><span class="reel-count">${isSaved?'Saved':'Save'}</span></div>
        <div class="reel-side-btn reel-share-btn"><span class="material-icons-round">share</span><span class="reel-count">Share</span></div>
      </div>
      <!-- Info -->
      <div class="reel-info">
        <div class="reel-info-user"><span class="material-icons-round">account_circle</span>${esc(name)}</div>
        <p class="reel-info-text">${esc(post.text||'')}</p>
      </div>
      <!-- Seek bar -->
      <div class="reel-seek"><div class="reel-seek-track"><div class="reel-seek-fill"></div><div class="reel-seek-dot"></div></div></div>
      <!-- Seek hint -->
      <div class="vid-seek-hint" id="rsh${i}"></div>`;

    const vid=item.querySelector('.reel-video');vid.muted=false;
    const buf=item.querySelector('#rbuf'+i);
    if(buf){vid.addEventListener('waiting',()=>buf.classList.add('show'));vid.addEventListener('playing',()=>buf.classList.remove('show'));vid.addEventListener('canplay',()=>buf.classList.remove('show'));}
    const seekFill=item.querySelector('.reel-seek-fill'),seekDot=item.querySelector('.reel-seek-dot');
    vid.addEventListener('timeupdate',()=>{if(vid.duration&&seekFill){const pct=(vid.currentTime/vid.duration)*100;seekFill.style.width=pct+'%';if(seekDot)seekDot.style.right=(100-pct)+'%';}});
    /* Drag seek */
    const seekHint=item.querySelector('#rsh'+i);
    let seekStartX=0,seekStartTime=0,isDragging=false;
    vid.addEventListener('touchstart',e=>{seekStartX=e.touches[0].clientX;seekStartTime=vid.currentTime;isDragging=false;},{passive:true});
    vid.addEventListener('touchmove',e=>{const dx=e.touches[0].clientX-seekStartX;if(Math.abs(dx)>15){isDragging=true;const seek=Math.max(0,Math.min(vid.duration||0,seekStartTime+dx*0.15));vid.currentTime=seek;if(seekHint){seekHint.textContent=(dx>0?'+':'')+Math.round(dx*0.15)+'s';seekHint.classList.add('show');}}},{passive:true});
    vid.addEventListener('touchend',()=>{isDragging=false;if(seekHint)setTimeout(()=>seekHint.classList.remove('show'),600);});
    let tt=null,tc=0;
    item.addEventListener('click',e=>{if(isDragging)return;if(e.target.closest('.reel-side-btns')||e.target.closest('.reel-info-user')||e.target.closest('.reel-seek'))return;tc++;clearTimeout(tt);tt=setTimeout(()=>{if(tc===1){if(vid.paused)vid.play().catch(()=>{});else vid.pause();}else if(tc>=2){handleReelLike(post.id,item.querySelector('.reel-like-btn'));showHeartEffect(item);}tc=0;},280);});
    item.querySelector('.reel-like-btn').addEventListener('click',e=>{e.stopPropagation();handleReelLike(post.id,e.currentTarget);});
    item.querySelector('.reel-cmt-btn').addEventListener('click',e=>{e.stopPropagation();openCommentsHalf(post.id);});
    item.querySelector('.reel-share-btn').addEventListener('click',e=>{e.stopPropagation();handleShare(post.id,post.text||'SayatX');});
    /* Save in reel */
    item.querySelector('.reel-save-btn').addEventListener('click',e=>{e.stopPropagation();const btn=e.currentTarget;const nowSaved=!!savedPosts[post.id];toggleSave(post.id,null);savedPosts[post.id]=!nowSaved;const ic=btn.querySelector('.material-icons-round'),lbl=btn.querySelector('.reel-count');if(ic)ic.textContent=!nowSaved?'bookmark':'bookmark_border';if(lbl)lbl.textContent=!nowSaved?'Saved':'Save';});
    /* Follow in reel */
    const reelFollowBtn=item.querySelector('.reel-follow-btn');
    if(reelFollowBtn){reelFollowBtn.addEventListener('click',e=>{e.stopPropagation();const uid=reelFollowBtn.dataset.uid;if(!uid)return;const isNowFollowing=reelFollowBtn.classList.contains('reel-following');const fakeBtn={classList:{contains:()=>isNowFollowing,toggle:()=>{},add:()=>{},remove:()=>{}},textContent:'',disabled:false};followingCache[uid]=!isNowFollowing;localStorage.setItem('sx_following',JSON.stringify(followingCache));const icon=reelFollowBtn.querySelector('.material-icons-round'),label=reelFollowBtn.querySelector('.reel-count');if(icon)icon.textContent=!isNowFollowing?'person_remove':'person_add';if(label)label.textContent=!isNowFollowing?'Following':'Follow';reelFollowBtn.classList.toggle('reel-following',!isNowFollowing);/* Firestore update */DB.collection('follows').doc(currentUser?.uid+'_'+uid)[!isNowFollowing?'set':'delete'](!isNowFollowing?{followerUid:currentUser?.uid,followingUid:uid,createdAt:TS()}:undefined).catch(()=>{});DB.collection('users').doc(uid).update({followers:INC(!isNowFollowing?1:-1)}).catch(()=>{});DB.collection('users').doc(currentUser?.uid).update({following:INC(!isNowFollowing?1:-1)}).catch(()=>{});toast(!isNowFollowing?'Following!':'Unfollowed','success');});}
    const gp=()=>{if(post.userId){closeReels();setTimeout(()=>openUserProfile(post.userId),200);}};
    item.querySelector('.reel-av-btn').addEventListener('click',e=>{e.stopPropagation();gp();});
    item.querySelector('.reel-info-user').addEventListener('click',e=>{e.stopPropagation();gp();});
    scroll.appendChild(item);
  });
  const ov=$('reelOverlay');if(ov)ov.classList.add('reel-open');document.body.style.overflow='hidden';
  if(currentReelObs)currentReelObs.disconnect();
  currentReelObs=new IntersectionObserver(entries=>{entries.forEach(entry=>{const v=entry.target.querySelector('.reel-video'),fill=entry.target.querySelector('.reel-seek-fill');if(entry.isIntersecting){v.play().catch(()=>{});v.ontimeupdate=()=>{if(v.duration&&fill)fill.style.width=(v.currentTime/v.duration*100)+'%';};const idx=parseInt(entry.target.dataset.i,10),p=currentReelItems[idx];if(p&&!viewedPosts.has(p.id)){viewedPosts.add(p.id);DB.collection('posts').doc(p.id).update({views:INC(1)}).catch(()=>{});}}else{v.pause();v.currentTime=0;if(fill)fill.style.width='0%';}});},{threshold:0.6});
  qsa('.reel-item',scroll).forEach(it=>currentReelObs.observe(it));
  if(startIndex>0)setTimeout(()=>{const items=qsa('.reel-item',scroll);if(items[startIndex])items[startIndex].scrollIntoView({behavior:'instant'});},80);
}
function handleReelLike(postId,btn){if(!currentUser){toast('Login to like','info');return;}const was=btn.classList.contains('reel-liked');likedPosts[postId]=!was;localStorage.setItem('sx_liked',JSON.stringify(likedPosts));btn.classList.toggle('reel-liked',!was);const ic=btn.querySelector('.material-icons-round');if(ic)ic.textContent=was?'favorite_border':'favorite';const c=btn.querySelector('.reel-count');if(c)c.textContent=fmtCount(Math.max(0,(parseInt(c.textContent)||0)+(was?-1:1)));DB.collection('posts').doc(postId).update({likes:INC(was?-1:1)}).catch(()=>{});}
function closeReels(){const ov=$('reelOverlay');if(ov)ov.classList.remove('reel-open');document.body.style.overflow='';const sc=$('reelScroll');if(sc){qsa('.reel-video',sc).forEach(v=>{v.pause();v.src='';});sc.innerHTML='';}if(currentReelObs){currentReelObs.disconnect();currentReelObs=null;}}
on('reelCloseBtn','click',closeReels);

function openCommentsHalf(postId){commentsPostId=postId;let ov=document.getElementById('commentsHalfOverlay');if(!ov){ov=document.createElement('div');ov.id='commentsHalfOverlay';ov.style.cssText='position:fixed;inset:0;z-index:700;display:flex;flex-direction:column;justify-content:flex-end;';ov.innerHTML=`<div style="position:absolute;inset:0;background:rgba(0,0,0,.4);" id="cHalfBg"></div><div style="position:relative;z-index:1;background:var(--card);border-radius:20px 20px 0 0;height:55dvh;display:flex;flex-direction:column;padding-bottom:env(safe-area-inset-bottom,0px);"><div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--bdr);flex-shrink:0;"><span style="font-weight:800;font-size:.95rem;color:var(--txt)">Comments</span><button id="cHalfClose" style="width:30px;height:30px;border-radius:50%;background:var(--card2);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;"><span class="material-icons-round btn-anim" style="font-size:17px">close</span></button></div><div id="cHalfList" style="flex:1;overflow-y:auto;padding:8px 0;"></div><div style="padding:8px 12px;border-top:1px solid var(--bdr);display:flex;gap:8px;align-items:center;flex-shrink:0;"><div style="flex:1;background:var(--card2);border:1px solid var(--bdr2);border-radius:var(--rf);padding:8px 13px;"><input type="text" id="cHalfInput" placeholder="Add a comment..." style="width:100%;background:none;border:none;outline:none;color:var(--txt);font-size:.86rem;" maxlength="500"/></div><button id="cHalfSend" style="width:36px;height:36px;border-radius:50%;background:var(--pr);color:#fff;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;"><span class="material-icons-round" style="font-size:17px">send</span></button></div></div>`;document.body.appendChild(ov);ov.querySelector('#cHalfBg').onclick=()=>{ov.style.display='none';};ov.querySelector('#cHalfClose').onclick=()=>{ov.style.display='none';};ov.querySelector('#cHalfSend').addEventListener('click',sendHalfComment);ov.querySelector('#cHalfInput').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();sendHalfComment();}});}ov.style.display='flex';loadHalfComments(postId);}
function loadHalfComments(postId){const list=document.getElementById('cHalfList');if(!list)return;list.innerHTML='<div class="pdf-loading"><div class="spinner"></div></div>';DB.collection('posts').doc(postId).collection('comments').orderBy('createdAt','desc').limit(50).get().then(snap=>{list.innerHTML='';if(!snap.size){list.innerHTML='<div style="text-align:center;padding:24px;color:var(--tm)">No comments yet</div>';return;}snap.docs.forEach(doc=>{const c=doc.data();const el=document.createElement('div');el.style.cssText='display:flex;gap:9px;align-items:flex-start;padding:8px 14px;';const cn=c.userName||'User';const avHtml=c.userPhoto?'<img src="'+esc(c.userPhoto)+'" style="width:100%;height:100%;object-fit:cover" alt=""/>':cn[0].toUpperCase();el.innerHTML='<div style="width:32px;height:32px;border-radius:50%;background:'+randomColor(c.userId)+';display:flex;align-items:center;justify-content:center;color:#fff;font-weight:900;font-size:.85rem;flex-shrink:0;overflow:hidden">'+avHtml+'</div><div><p style="font-weight:800;font-size:.82rem;color:var(--txt)">'+esc(cn)+'</p><p style="font-size:.84rem;color:var(--tb);word-break:break-word">'+esc(c.text)+'</p></div>';list.appendChild(el);});}).catch(()=>{});}
function sendHalfComment(){if(!currentUser){toast('Login to comment','info');return;}if(!commentsPostId)return;const inp=document.getElementById('cHalfInput');if(!inp)return;const text=inp.value.trim();if(!text)return;inp.value='';const name=currentUser.displayName||'User';DB.collection('posts').doc(commentsPostId).collection('comments').add({userId:currentUser.uid,userName:name,userPhoto:currentUser.photoURL||'',text,createdAt:TS()}).then(()=>{DB.collection('posts').doc(commentsPostId).update({commentCount:INC(1)}).catch(()=>{});loadHalfComments(commentsPostId);}).catch(e=>toast('Failed: '+e.message,'error'));}
const audioEl=$('audioPlayer');let audioPlaying=false;
function openAudioOverlay(url,title,cover){if(!audioEl)return;audioEl.src=url;audioEl.load();setText('audioTitleText',title||'Audio');setText('audioArtistText','SayatX');const img=cover||'https://placehold.co/200x200?text=Audio';const ai=$('audioAlbumArtImg'),bg=$('audioOverlayBg');if(ai)ai.src=img;if(bg)bg.style.backgroundImage='url('+img+')';const sf=$('audioSeekFill'),si=$('audioSeekInput');if(sf)sf.style.width='0%';if(si)si.value=0;setText('audioCurrentTime','0:00');setText('audioDuration','0:00');audioPlaying=false;const pb=$('audioPlayBtn');if(pb)pb.querySelector('.material-icons-round').textContent='play_arrow';const ov=$('audioOverlay');if(ov)ov.classList.add('audio-open');document.body.style.overflow='hidden';}
function closeAudioOverlay(){if(audioEl){audioEl.pause();audioEl.src='';}const ov=$('audioOverlay');if(ov)ov.classList.remove('audio-open');document.body.style.overflow='';audioPlaying=false;}
on('audioOverlayClose','click',closeAudioOverlay);
on('audioPlayBtn','click',()=>{if(!audioEl)return;const ic=$('audioPlayBtn')?.querySelector('.material-icons-round');if(audioPlaying){audioEl.pause();audioPlaying=false;if(ic)ic.textContent='play_arrow';}else{audioEl.play().catch(e=>toast('Cannot play: '+e.message,'error'));audioPlaying=true;if(ic)ic.textContent='pause';}});
on('audioPrev10','click',()=>{if(audioEl)audioEl.currentTime=Math.max(0,audioEl.currentTime-10);});
on('audioFwd10','click',()=>{if(audioEl)audioEl.currentTime=Math.min(audioEl.duration||0,audioEl.currentTime+10);});
if(audioEl){audioEl.addEventListener('timeupdate',()=>{if(!audioEl.duration)return;const pct=(audioEl.currentTime/audioEl.duration)*100;const sf=$('audioSeekFill'),si=$('audioSeekInput');if(sf)sf.style.width=pct+'%';if(si)si.value=pct;setText('audioCurrentTime',fmtTime(audioEl.currentTime));});audioEl.addEventListener('loadedmetadata',()=>setText('audioDuration',fmtTime(audioEl.duration)));audioEl.addEventListener('ended',()=>{audioPlaying=false;const ic=$('audioPlayBtn')?.querySelector('.material-icons-round');if(ic)ic.textContent='play_arrow';});}
on('audioSeekInput','input',e=>{if(audioEl&&audioEl.duration)audioEl.currentTime=(e.target.value/100)*audioEl.duration;});
function openVideoOverlay(url,title){const vid=$('videoOverlayPlayer');if(!vid)return;vid.src=url;setText('videoOverlayTitle',title||'Video');const ov=$('videoOverlay');if(ov)ov.classList.add('video-open');document.body.style.overflow='hidden';vid.play().catch(()=>{});}
function closeVideoOverlay(){const vid=$('videoOverlayPlayer');if(vid){vid.pause();vid.src='';}const ov=$('videoOverlay');if(ov)ov.classList.remove('video-open');document.body.style.overflow='';}
on('videoOverlayClose','click',closeVideoOverlay);
let pdfDoc=null;
function openPdfReader(url,title){setText('pdfTitle',title||'Document');setText('pdfPageCount','');setHTML('pdfPagesContainer','<div class="pdf-loading"><div class="spinner"></div><p>Loading...</p></div>');const ov=$('pdfOverlay');if(ov)ov.classList.add('pdf-open');document.body.style.overflow='hidden';if(typeof pdfjsLib==='undefined'){toast('PDF viewer unavailable','error');return;}pdfjsLib.getDocument({url}).promise.then(pdf=>{pdfDoc=pdf;setText('pdfPageCount',pdf.numPages+' pages');setHTML('pdfPagesContainer','');const render=i=>{if(i>pdf.numPages)return;pdf.getPage(i).then(page=>{const scale=Math.min(window.innerWidth/page.getViewport({scale:1}).width,1.5);const vp=page.getViewport({scale});const canvas=document.createElement('canvas');canvas.className='pdf-page-canvas';canvas.width=vp.width;canvas.height=vp.height;page.render({canvasContext:canvas.getContext('2d'),viewport:vp}).promise.then(()=>{const wrap=document.createElement('div');wrap.innerHTML='<div class="pdf-page-num">Page '+i+'</div>';wrap.insertBefore(canvas,wrap.firstChild);const cont=$('pdfPagesContainer');if(cont)cont.appendChild(wrap);render(i+1);});});};render(1);}).catch(e=>setHTML('pdfPagesContainer','<div class="pdf-loading"><p>Failed: '+esc(e.message)+'</p></div>'));}
function closePdfReader(){const ov=$('pdfOverlay');if(ov)ov.classList.remove('pdf-open');document.body.style.overflow='';if(pdfDoc){pdfDoc.destroy();pdfDoc=null;}setHTML('pdfPagesContainer','');}
on('pdfCloseBtn','click',closePdfReader);

/* CREATE POST */
on('fabPlus','click',openCreatePost);on('createPostClose','click',closeCreatePost);on('createPostBackdrop','click',closeCreatePost);on('createCancelBtn','click',closeCreatePost);on('createGoLoginBtn','click',()=>{closeCreatePost();switchSection('profile');});
function openCreatePost(){if(!currentUser){setStyle('createLoginPrompt','display','flex');setStyle('createForm','display','none');setStyle('postTypeTabs','display','none');setStyle('createPostFooter','display','none');}else{setStyle('createLoginPrompt','display','none');setStyle('createForm','display','block');setStyle('postTypeTabs','display','flex');setStyle('createPostFooter','display','flex');const name=currentUser.displayName||'User';const av=qs('.create-form-avatar');if(av){if(currentUser.photoURL)av.innerHTML='<img src="'+esc(currentUser.photoURL)+'" alt=""/>';else av.textContent=name[0].toUpperCase();}const un=qs('.create-form-username');if(un)un.textContent=name;}const sheet=$('createPostSheet');if(sheet)sheet.classList.add('sheet-open');document.body.style.overflow='hidden';setCreateTab('text');}
function closeCreatePost(){const sheet=$('createPostSheet');if(sheet)sheet.classList.remove('sheet-open');document.body.style.overflow='';resetCreateForm();}
function resetCreateForm(){const ta=$('createTextarea');if(ta)ta.value='';if(createMediaBlob){URL.revokeObjectURL(createMediaBlob);createMediaBlob=null;}if(createThumbBlob){URL.revokeObjectURL(createThumbBlob);createThumbBlob=null;}createMediaFile=null;createThumbFile=null;setStyle('createMediaPreview','display','none');setStyle('createUploadZone','display','none');const pi=$('createPreviewImg'),pv=$('createPreviewVid'),pa=$('createAudioPreview');if(pi){pi.src='';pi.style.display='none';}if(pv){pv.src='';pv.style.display='none';}if(pa)pa.style.display='none';const mi=$('createMediaInput');if(mi)mi.value='';const ts=document.querySelector('.create-thumb-section');if(ts){const tw=ts.querySelector('#createThumbPreviewWrap');if(tw)tw.style.display='none';const ti=ts.querySelector('#createThumbInput');if(ti)ti.value='';}}
function setCreateTab(type){
  createPostType=type;qsa('.post-type-tab').forEach(btn=>btn.classList.toggle('tab-active',btn.dataset.postType===type));
  const zone=$('createUploadZone'),zt=$('createUploadZoneText'),zh=$('createUploadZoneHint'),mi=$('createMediaInput');if(!zone)return;
  const sheet=$('createPostSheet');
  if(sheet&&!sheet.querySelector('.create-thumb-section')){
    const ts=document.createElement('div');ts.className='create-thumb-section';ts.style.display='none';
    ts.innerHTML=`<label><span class="material-icons-round" style="font-size:14px;vertical-align:middle;margin-right:4px">image</span>Thumbnail (optional)</label>
    <input type="file" id="createThumbInput" accept="image/*" style="display:none"/>
    <button type="button" id="createThumbBtn" style="display:flex;align-items:center;gap:7px;padding:8px 14px;background:var(--card);border:1.5px solid var(--bdr2);border-radius:var(--rf);cursor:pointer;color:var(--txt);font-size:.82rem;font-weight:700"><span class="material-icons-round" style="font-size:16px">video_camera_back</span>Pick thumbnail</button>
    <div id="createThumbPreviewWrap" style="display:none;position:relative;margin-top:8px;display:inline-block">
      <img id="createThumbPreviewImg" src="" alt="" style="width:80px;height:54px;border-radius:8px;object-fit:cover;display:block"/>
      <button type="button" id="createThumbRemoveBtn" style="position:absolute;top:-6px;right:-6px;width:20px;height:20px;border-radius:50%;background:#f4212e;border:none;color:#fff;cursor:pointer;font-size:12px;display:flex;align-items:center;justify-content:center">✕</button>
    </div>`;
    const footer=sheet.querySelector('.create-post-footer')||sheet.lastElementChild;
    sheet.insertBefore(ts,footer);
    ts.querySelector('#createThumbBtn').addEventListener('click',()=>{if(createPostType==='video'&&createMediaFile){openVideoThumbPicker(createMediaFile,blob=>{createThumbFile=new File([blob],'thumb.jpg',{type:'image/jpeg'});if(createThumbBlob)URL.revokeObjectURL(createThumbBlob);createThumbBlob=URL.createObjectURL(createThumbFile);const w=ts.querySelector('#createThumbPreviewWrap'),img=ts.querySelector('#createThumbPreviewImg');if(w){w.style.display='inline-block';}if(img)img.src=createThumbBlob;toast('Thumbnail selected!','success');});}else{ts.querySelector('#createThumbInput').click();}});
    ts.querySelector('#createThumbInput').addEventListener('change',e=>{const file=e.target.files&&e.target.files[0];if(!file)return;if(file.size>5*1024*1024){toast('Max 5MB','error');return;}createThumbFile=file;if(createThumbBlob)URL.revokeObjectURL(createThumbBlob);createThumbBlob=URL.createObjectURL(file);const w=ts.querySelector('#createThumbPreviewWrap'),img=ts.querySelector('#createThumbPreviewImg');if(w){w.style.display='inline-block';}if(img)img.src=createThumbBlob;});
    ts.querySelector('#createThumbRemoveBtn').addEventListener('click',()=>{if(createThumbBlob){URL.revokeObjectURL(createThumbBlob);createThumbBlob=null;}createThumbFile=null;const w=ts.querySelector('#createThumbPreviewWrap');if(w)w.style.display='none';const ti=ts.querySelector('#createThumbInput');if(ti)ti.value='';});
  }
  const thumbSec=sheet?sheet.querySelector('.create-thumb-section'):null;
  if(type==='text'){zone.style.display='none';if(thumbSec)thumbSec.style.display='none';return;}
  zone.style.display='flex';
  if(thumbSec)thumbSec.style.display=['video','audio'].includes(type)?'block':'none';
  const tb=thumbSec&&thumbSec.querySelector('#createThumbBtn');
  if(type==='photo'){if(zt)zt.textContent='Tap to select photo';if(zh)zh.textContent='JPG, PNG — Max 20MB';if(mi)mi.accept='image/*';}
  else if(type==='video'){if(zt)zt.textContent='Tap to select video';if(zh)zh.textContent='MP4 — Max 5GB';if(mi)mi.accept='video/*';if(tb)tb.innerHTML='<span class="material-icons-round" style="font-size:16px">video_camera_back</span> Pick frame from video';}
  else if(type==='audio'){if(zt)zt.textContent='Tap to select audio';if(zh)zh.textContent='MP3, WAV — Max 5GB';if(mi)mi.accept='audio/*';if(tb)tb.innerHTML='<span class="material-icons-round" style="font-size:16px">add_photo_alternate</span> Choose thumbnail image';}
}
qsa('.post-type-tab').forEach(btn=>btn.addEventListener('click',()=>setCreateTab(btn.dataset.postType)));
on('createMediaInput','change',e=>{const file=e.target.files&&e.target.files[0];if(!file)return;const maxMB=createPostType==='photo'?20:5000;if(file.size>maxMB*1024*1024){toast('Max '+maxMB+'MB allowed','error');e.target.value='';return;}createMediaFile=file;if(createMediaBlob)URL.revokeObjectURL(createMediaBlob);createMediaBlob=URL.createObjectURL(file);setStyle('createUploadZone','display','none');setStyle('createMediaPreview','display','block');const pi=$('createPreviewImg'),pv=$('createPreviewVid'),pa=$('createAudioPreview'),pan=$('createAudioFileName');if(createPostType==='photo'){if(pi){pi.src=createMediaBlob;pi.style.display='block';}if(pv)pv.style.display='none';if(pa)pa.style.display='none';}else if(createPostType==='video'){if(pv){pv.src=createMediaBlob;pv.style.display='block';}if(pi)pi.style.display='none';if(pa)pa.style.display='none';}else if(createPostType==='audio'){if(pa)pa.style.display='flex';if(pan)pan.textContent=file.name;if(pi)pi.style.display='none';if(pv)pv.style.display='none';}});
on('createMediaRemoveBtn','click',()=>{if(createMediaBlob){URL.revokeObjectURL(createMediaBlob);createMediaBlob=null;}createMediaFile=null;setStyle('createMediaPreview','display','none');setStyle('createUploadZone','display','flex');const mi=$('createMediaInput');if(mi)mi.value='';});

on('createSubmitBtn','click',async()=>{
  if(!currentUser){toast('Login to post','error');return;}
  const text=(($('createTextarea')||{}).value||'').trim();
  const mi=$('createMediaInput');const file=createMediaFile||(mi&&mi.files&&mi.files[0]);
  if(!text&&!file){toast('Write something or add media','error');return;}
  if(file){const maxBytes=createPostType==='photo'?20*1024*1024:5*1024*1024*1024;if(file.size>maxBytes){toast('File too large','error');return;}}
  const btn=$('createSubmitBtn');if(btn)btn.disabled=true;
  const name=currentUser.displayName||'User';
  closeCreatePost();switchSection('home');
  let docRef=null;
  try{
    docRef=await DB.collection('posts').add({userId:currentUser.uid,userName:name,userPhoto:currentUser.photoURL||'',text:text||'',mediaType:file?createPostType:'text',mediaUrl:null,thumbnailUrl:null,likes:0,commentCount:0,views:0,status:'uploading',uploadPct:0,createdAt:TS()});
    await DB.collection('users').doc(currentUser.uid).update({postCount:INC(1)}).catch(()=>{});
  }catch(e){toast('Post failed: '+e.message,'error',5000);if(btn)btn.disabled=false;return;}
  if(!file){await docRef.update({status:DEL()}).catch(()=>{});if(btn)btn.disabled=false;return;}
  let liveToast=toast('Uploading... 0%','info',300000);
  try{
    const folder=createPostType==='video'?'posts/videos/':createPostType==='audio'?'posts/audios/':'posts/photos/';
    let thumbUrl=null;
    /* Upload thumbnail first (separate file) */
    if(createThumbFile){
      thumbUrl=await uploadFile(createThumbFile,'posts/thumbs/',()=>{});
    }else if(createPostType==='video'){
      /* Auto-generate thumbnail from video */
      try{const tb=await generateVideoThumbnail(file);if(tb){const tf=new File([tb],'thumb.jpg',{type:'image/jpeg'});thumbUrl=await uploadFile(tf,'posts/thumbs/',()=>{});}}catch(e){}
    }
    /* Upload main media file */
    const mediaUrl=await uploadFile(file,folder,async pct=>{
      if(pct%5===0&&docRef){try{await docRef.update({uploadPct:pct});}catch(e){}}
      if(liveToast&&liveToast.isConnected)liveToast.textContent='Uploading... '+pct+'%';
    });
    if(createPostType==='photo')thumbUrl=mediaUrl;
    await docRef.update({mediaUrl,thumbnailUrl:thumbUrl||null,uploadPct:DEL(),status:DEL()});
    if(liveToast&&liveToast.isConnected)liveToast.remove();
    toast('Post published!','success');
  }catch(err){
    if(liveToast&&liveToast.isConnected)liveToast.remove();
    if(docRef)docRef.update({status:'failed',uploadPct:DEL()}).catch(()=>{});
    toast('Upload failed: '+(err.message||err.code),'error',5000);
  }
  if(btn)btn.disabled=false;
});

/* COMMENTS */
function openComments(postId){commentsPostId=postId;setHTML('commentsList','<div class="pdf-loading"><div class="spinner"></div></div>');const ci=$('commentsInput');if(ci)ci.value='';if(currentUser){const name=currentUser.displayName||'User';const av=qs('.comments-input-avatar');if(av){if(currentUser.photoURL)av.innerHTML='<img src="'+esc(currentUser.photoURL)+'" alt=""/>';else av.textContent=name[0].toUpperCase();}}const sheet=$('commentsSheet');if(sheet)sheet.classList.add('sheet-open');document.body.style.overflow='hidden';DB.collection('posts').doc(postId).collection('comments').orderBy('createdAt','desc').limit(50).get().then(snap=>{const list=$('commentsList');if(!list)return;list.innerHTML='';if(!snap.size){list.innerHTML='<div class="comments-empty"><span class="material-icons-round">chat_bubble_outline</span><p>No comments yet</p></div>';return;}snap.docs.forEach(doc=>{const c=Object.assign({id:doc.id},doc.data());const el=document.createElement('div');el.className='comment-item';const cn=c.userName||'User';const av=c.userPhoto?'<img src="'+esc(c.userPhoto)+'" alt=""/>':cn[0].toUpperCase();el.innerHTML='<div class="comment-avatar">'+av+'</div><div class="comment-bubble"><div class="comment-bubble-header"><span class="comment-username">'+esc(cn)+'</span><span class="comment-time">'+fmtAgo(c.createdAt)+'</span></div><p class="comment-text">'+esc(c.text)+'</p></div>';list.appendChild(el);});}).catch(()=>{});}
function closeComments(){const sheet=$('commentsSheet');if(sheet)sheet.classList.remove('sheet-open');document.body.style.overflow='';commentsPostId=null;}
on('commentsClose','click',closeComments);on('commentsBackdrop','click',closeComments);
on('commentsSendBtn','click',()=>{if(!currentUser){toast('Login to comment','info');return;}if(!commentsPostId)return;const ci=$('commentsInput');const text=(ci?ci.value:'').trim();if(!text)return;if(ci)ci.value='';const name=currentUser.displayName||'User';DB.collection('posts').doc(commentsPostId).collection('comments').add({userId:currentUser.uid,userName:name,userPhoto:currentUser.photoURL||'',text,createdAt:TS()}).then(()=>{DB.collection('posts').doc(commentsPostId).update({commentCount:INC(1)}).catch(()=>{});openComments(commentsPostId);}).catch(e=>toast('Failed: '+e.message,'error'));});
on('commentsInput','keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();const btn=$('commentsSendBtn');if(btn)btn.click();}});

/* USER PROFILE */
function buildFbPostItem(p,userInfo,onDelete){
  const el=document.createElement('div');el.style.cssText='background:var(--card);padding-bottom:10px;margin-bottom:10px;border-bottom:6px solid var(--card2);';
  const name=userInfo.name||'User';
  const avHtml=userInfo.photoURL&&userInfo.photoURL.startsWith('http')?`<img src="${esc(userInfo.photoURL)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%" onerror="this.outerHTML='${name[0].toUpperCase()}'"/>`:name[0].toUpperCase();
  if(p.status==='uploading'||p.status==='failed'){
    const pct=p.uploadPct||0;const isFailed=p.status==='failed';
    el.innerHTML=`<div style="display:flex;align-items:center;gap:10px;padding:12px 14px"><div style="width:38px;height:38px;border-radius:50%;background:${randomColor(userInfo.uid)};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:900;flex-shrink:0;overflow:hidden">${avHtml}</div><div style="flex:1"><p style="font-weight:800;font-size:.88rem;color:var(--txt)">${esc(p.text||p.mediaType||'Post')}</p>${isFailed?'<p style="font-size:.74rem;color:var(--er)">Upload failed</p>':`<div style="margin-top:4px"><div style="height:3px;background:var(--bdr2);border-radius:2px"><div class="post-proc-bar" style="width:${pct}%"></div></div><p style="font-size:.72rem;color:var(--tm);margin-top:2px">Processing... ${pct}%</p></div>`}</div><button class="fb-del-btn" style="width:34px;height:34px;border-radius:50%;background:var(--er-b);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;color:var(--er);flex-shrink:0"><span class="material-icons-round" style="font-size:17px">delete</span></button></div>`;
    el.querySelector('.fb-del-btn').addEventListener('click',()=>{if(confirm('Delete this post?')){DB.collection('posts').doc(p.id).delete().then(()=>{DB.collection('users').doc(userInfo.uid).update({postCount:INC(-1)}).catch(()=>{});el.remove();toast('Deleted','success');}).catch(e=>toast('Failed: '+e.message,'error'));}});
    return el;
  }
  const isVid=p.mediaType==='video',isPhoto=p.mediaType==='photo',isAudio=p.mediaType==='audio';
  const thumb=p.thumbnailUrl||p.mediaUrl||'';
  const isSaved=!!savedPosts[p.id];
  let mediaHtml='';
  if(isVid&&thumb){const isPort=(p.videoRatio||1)<1;mediaHtml=`<div style="position:relative;width:100%;${isPort?'aspect-ratio:9/16':'aspect-ratio:16/9'};background:#000;cursor:pointer;overflow:hidden" class="fb-vw"><img src="${esc(thumb)}" style="width:100%;height:100%;object-fit:${isPort?'cover':'contain'}"/><div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.22)"><div style="width:52px;height:52px;border-radius:50%;background:rgba(255,255,255,.9);display:flex;align-items:center;justify-content:center"><span class="material-icons-round" style="font-size:28px;color:#000">play_arrow</span></div></div></div>`;}
  else if(isPhoto&&thumb)mediaHtml=`<img src="${esc(thumb)}" style="width:100%;height:auto;display:block;object-fit:cover;cursor:pointer;" loading="lazy" class="fb-ph"/>`;
  else if(isAudio)mediaHtml=`<div style="display:flex;align-items:center;gap:12px;padding:12px 14px;background:var(--card2);margin:0 14px;border-radius:12px;cursor:pointer" class="fb-au">${p.thumbnailUrl?`<img src="${esc(p.thumbnailUrl)}" style="width:48px;height:48px;border-radius:10px;object-fit:cover"/>`:`<div style="width:48px;height:48px;border-radius:10px;background:var(--pr);display:flex;align-items:center;justify-content:center;color:#fff"><span class="material-icons-round">headphones</span></div>`}<p style="font-weight:700;font-size:.86rem;color:var(--txt)">${esc(p.text||'Audio')}</p></div>`;
  el.innerHTML=`<div style="display:flex;align-items:center;gap:10px;padding:12px 14px 10px"><div style="width:38px;height:38px;border-radius:50%;background:${randomColor(userInfo.uid)};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:900;flex-shrink:0;overflow:hidden;cursor:pointer" class="fb-av">${avHtml}</div><div style="flex:1"><p style="font-weight:800;font-size:.88rem;color:var(--txt)">${esc(name)}</p><p style="font-size:.74rem;color:var(--tm)">${fmtAgo(p.createdAt)}</p></div><button class="fb-3d" style="width:30px;height:30px;border-radius:50%;background:none;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;color:var(--tm)"><span class="material-icons-round" style="font-size:18px">more_vert</span></button></div>${p.text&&!isAudio?`<p style="padding:0 14px 10px;font-size:.86rem;color:var(--txt);white-space:pre-wrap;line-height:1.5">${linkifyText(p.text)}</p>`:''}${mediaHtml}<div style="display:flex;gap:16px;padding:10px 14px 0;align-items:center"><span style="font-size:.78rem;color:var(--tm);display:flex;align-items:center;gap:4px"><span class="material-icons-round" style="font-size:15px">favorite</span>${fmtCount(p.likes||0)}</span><span style="font-size:.78rem;color:var(--tm);display:flex;align-items:center;gap:4px"><span class="material-icons-round" style="font-size:15px">visibility</span>${fmtCount(p.views||0)}</span><span style="flex:1"></span><button class="fb-save-btn" style="background:none;border:none;cursor:pointer;color:${isSaved?'var(--pr)':'var(--tm)'};display:flex;align-items:center;gap:3px;font-size:.76rem"><span class="material-icons-round" style="font-size:17px">${isSaved?'bookmark':'bookmark_border'}</span></button></div>`;
  el.querySelector('.fb-av').addEventListener('click',()=>openUserProfile(userInfo.uid));
  el.querySelector('.fb-vw')?.addEventListener('click',()=>{const uVids=(window._profileVideos&&window._profileVideos[userInfo.uid])||[p];const idx=uVids.findIndex(v=>v.id===p.id);openReels(uVids,Math.max(0,idx));});
  el.querySelector('.fb-ph')?.addEventListener('click',()=>openPhotoViewer(p.mediaUrl,p.text||'',p));
  el.querySelector('.fb-au')?.addEventListener('click',()=>openAudioOverlay(p.mediaUrl,p.text||'Audio',p.thumbnailUrl||''));
  el.querySelector('.fb-save-btn')?.addEventListener('click',e=>{e.stopPropagation();const btn=e.currentTarget;toggleSave(p.id,null);savedPosts[p.id]=!savedPosts[p.id];btn.style.color=savedPosts[p.id]?'var(--pr)':'var(--tm)';btn.querySelector('.material-icons-round').textContent=savedPosts[p.id]?'bookmark':'bookmark_border';});
  el.querySelector('.fb-3d').addEventListener('click',e=>{e.stopPropagation();const isOwn2=currentUser&&userInfo.uid===currentUser.uid;const m=document.createElement('div');m.style.cssText='position:fixed;inset:0;z-index:660;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,.5);';const sh=document.createElement('div');sh.style.cssText='background:var(--card);border-radius:20px 20px 0 0;width:100%;max-width:520px;padding:16px 0 calc(env(safe-area-inset-bottom,0px)+16px);';const btns2=[{icon:'share',label:'Share',fn:()=>handleShare(p.id,p.text||'SayatX')}];if(isOwn2)btns2.push({icon:'delete',label:'Delete Post',fn:()=>{m.remove();if(confirm('Delete this post?')){deletePost(p.id).then(()=>{if(onDelete)onDelete();});}},danger:true});btns2.forEach(b=>{const btn2=document.createElement('button');btn2.style.cssText='display:flex;align-items:center;gap:14px;width:100%;padding:14px 20px;background:none;border:none;cursor:pointer;font-size:.9rem;font-weight:700;color:'+(b.danger?'var(--er)':'var(--txt)')+';';btn2.innerHTML='<span class="material-icons-round" style="color:'+(b.danger?'var(--er)':'var(--pr)')+'">'+b.icon+'</span>'+esc(b.label);btn2.addEventListener('click',()=>{m.remove();b.fn();});sh.appendChild(btn2);});const ca=document.createElement('button');ca.style.cssText='display:flex;align-items:center;justify-content:center;width:calc(100% - 32px);margin:8px 16px 0;padding:13px;background:var(--card2);border:none;border-radius:var(--rf);cursor:pointer;font-size:.9rem;font-weight:700;color:var(--txt);';ca.textContent='Cancel';ca.addEventListener('click',()=>m.remove());sh.appendChild(ca);m.appendChild(sh);m.addEventListener('click',ev=>{if(ev.target===m)m.remove();});document.body.appendChild(m);});
  return el;
}

function openUserProfile(uid){
  const ov=$('userProfileOverlay');if(!ov)return;
  setText('upoHeaderTitle','Profile');setText('upoDisplayName','Loading...');setText('upoHandle','');
  setText('upoPostCount','0');setText('upoFollowerCount','0');setText('upoFollowingCount','0');
  const upoAv=$('upoAvatar');if(upoAv)upoAv.innerHTML='<div class="spinner" style="width:24px;height:24px;border-width:2.5px"></div>';
  const grid=$('upoPostsGrid');if(grid){grid.style.display='block';grid.style.gridTemplateColumns='';grid.innerHTML='';}
  ov.classList.add('upo-open');document.body.style.overflow='hidden';
  history.replaceState(null,'','#user/'+uid);
  const isOwn=currentUser&&uid===currentUser.uid;
  const followBtn=$('upoFollowBtn'),msgBtn=$('upoMessageBtn');
  if(followBtn)followBtn.style.display=isOwn?'none':'';
  if(msgBtn)msgBtn.style.display=isOwn?'none':'';
  let isFollowing=!!followingCache[uid];
  if(currentUser&&!isOwn){DB.collection('follows').doc(currentUser.uid+'_'+uid).get().then(snap=>{isFollowing=snap.exists;followingCache[uid]=isFollowing;localStorage.setItem('sx_following',JSON.stringify(followingCache));if(followBtn){followBtn.classList.toggle('btn-following',isFollowing);followBtn.style.background=isFollowing?'transparent':'var(--txt)';followBtn.style.color=isFollowing?'var(--txt)':'var(--bg)';followBtn.innerHTML=isFollowing?'<span class="material-icons-round">person_remove</span> Following':'<span class="material-icons-round">person_add</span> Follow';}}).catch(()=>{});}
  const newF=followBtn?followBtn.cloneNode(true):null;
  if(newF&&followBtn){
    followBtn.parentNode.replaceChild(newF,followBtn);
    newF.addEventListener('click',async()=>{
      if(!currentUser){toast('Login to follow','info');return;}
      newF.disabled=true;
      const docId=currentUser.uid+'_'+uid;
      try{
        if(isFollowing){
          await DB.collection('follows').doc(docId).delete();
          DB.collection('users').doc(uid).update({followers:INC(-1)}).catch(()=>{});
          DB.collection('users').doc(currentUser.uid).update({following:INC(-1)}).catch(()=>{});
          isFollowing=false;followingCache[uid]=false;newF.classList.remove('btn-following');newF.style.background='var(--txt)';newF.style.color='var(--bg)';newF.innerHTML='<span class="material-icons-round">person_add</span> Follow';toast('Unfollowed','info');
        }else{
          await DB.collection('follows').doc(docId).set({followerUid:currentUser.uid,followingUid:uid,createdAt:TS()});
          DB.collection('users').doc(uid).update({followers:INC(1)}).catch(()=>{});
          DB.collection('users').doc(currentUser.uid).update({following:INC(1)}).catch(()=>{});
          isFollowing=true;followingCache[uid]=true;newF.classList.add('btn-following');newF.style.background='transparent';newF.style.color='var(--txt)';newF.style.border='1.5px solid var(--bdr2)';newF.innerHTML='<span class="material-icons-round">person_remove</span> Following';toast('Following!','success');
          DB.collection('notifications').add({toUid:uid,fromUid:currentUser.uid,fromName:currentUser.displayName||'User',fromPhoto:currentUser.photoURL||'',type:'follow',read:false,createdAt:TS()}).catch(()=>{});
        }
        localStorage.setItem('sx_following',JSON.stringify(followingCache));
        DB.collection('users').doc(uid).get().then(s=>{if(s.exists)setText('upoFollowerCount',fmtCount(s.data().followers||0));}).catch(()=>{});
        DB.collection('users').doc(currentUser.uid).get().then(s=>{if(s.exists)updateDrawerStrip(currentUser);}).catch(()=>{});
      }catch(e){
        /* Permission denied — update optimistically, no error shown */
        followingCache[uid]=!isFollowing;localStorage.setItem('sx_following',JSON.stringify(followingCache));
        isFollowing=!isFollowing;
        if(isFollowing){newF.classList.add('btn-following');newF.style.background='transparent';newF.style.color='var(--txt)';newF.innerHTML='<span class="material-icons-round">person_remove</span> Following';toast('Following!','success');}
        else{newF.classList.remove('btn-following');newF.style.background='var(--txt)';newF.style.color='var(--bg)';newF.innerHTML='<span class="material-icons-round">person_add</span> Follow';toast('Unfollowed','info');}
      }
      newF.disabled=false;
    });
  }
  const newM=msgBtn?msgBtn.cloneNode(true):null;
  if(newM&&msgBtn){msgBtn.parentNode.replaceChild(newM,msgBtn);newM.addEventListener('click',()=>{closeUpo();switchSection('messages');setTimeout(()=>openChatWith(uid),200);});}
  let userInfo={name:'User',photoURL:'',uid};
  DB.collection('users').doc(uid).get().then(snap=>{
    if(!snap.exists){toast('User not found','error');return;}
    const d=snap.data(),name=d.displayName||'User';userInfo={name,photoURL:d.photoURL||'',uid};
    setText('upoHeaderTitle',name);setText('upoDisplayName',name);setText('upoHandle','@'+name.toLowerCase().replace(/[^a-z0-9]/g,'_'));
    setText('upoPostCount',fmtCount(d.postCount||0));setText('upoFollowerCount',fmtCount(d.followers||0));setText('upoFollowingCount',fmtCount(d.following||0));
    const fb=$('upoFollowerCount');if(fb){fb.style.cursor='pointer';fb.onclick=()=>openFollowList(uid,'followers');}
    const fg=$('upoFollowingCount');if(fg){fg.style.cursor='pointer';fg.onclick=()=>openFollowList(uid,'following');}
    /* Fix: show actual profile photo */
    const img=$('upoAvatarImg'),ltr=$('upoAvatarLetter');
    if(d.photoURL&&d.photoURL.startsWith('http')){if(img){img.src=d.photoURL;img.style.display='block';img.onerror=()=>{img.style.display='none';if(ltr){ltr.textContent=name[0].toUpperCase();ltr.style.display='flex';ltr.style.background=randomColor(uid);}};} if(ltr)ltr.style.display='none';}
    else{if(ltr){ltr.textContent=name[0].toUpperCase();ltr.style.display='flex';ltr.style.background=randomColor(uid);}if(img)img.style.display='none';}
    const avatarEl=$('upoAvatar');if(avatarEl&&d.photoURL){avatarEl.style.cursor='pointer';avatarEl.onclick=()=>openPhotoViewer(d.photoURL,name,null);}
    DB.collection('posts').where('userId','==',uid).orderBy('createdAt','desc').limit(30).get().then(psnap=>{
      const g=$('upoPostsGrid');if(!g)return;g.innerHTML='';
      const posts=psnap.docs.map(doc=>({id:doc.id,...doc.data()})).filter(p=>isOwn||!p.status);
      window._profileVideos[uid]=posts.filter(p=>p.mediaType==='video'&&p.mediaUrl&&!p.status);
      if(!posts.length){g.innerHTML='<div style="text-align:center;padding:40px;color:var(--tm)"><span class="material-icons-round" style="font-size:44px;opacity:.3;display:block">grid_off</span><p>No posts yet</p></div>';return;}
      posts.forEach(p=>{const item=buildFbPostItem(p,userInfo,()=>openUserProfile(uid));g.appendChild(item);});
    }).catch(()=>{});
  }).catch(()=>toast('Failed to load profile','error'));
}
function closeUpo(){const ov=$('userProfileOverlay');if(ov)ov.classList.remove('upo-open');document.body.style.overflow='';history.replaceState(null,'',location.pathname);}
on('upoBackBtn','click',closeUpo);

async function openFollowList(uid,type){
  const existing=document.getElementById('followListOv');if(existing)existing.remove();
  const ov=document.createElement('div');ov.id='followListOv';ov.className='user-profile-overlay upo-open';ov.style.zIndex='620';
  ov.innerHTML=`<div class="upo-header"><button class="upo-back-btn btn-anim" id="flClose"><span class="material-icons-round">arrow_back</span></button><span class="upo-header-title">${type==='followers'?'Followers':'Following'}</span></div><div class="upo-body" id="flBody"><div class="pdf-loading"><div class="spinner"></div></div></div>`;
  document.body.appendChild(ov);document.body.style.overflow='hidden';
  ov.querySelector('#flClose').onclick=()=>{ov.remove();};
  const body=ov.querySelector('#flBody');
  try{
    const snap=type==='followers'?await DB.collection('follows').where('followingUid','==',uid).limit(100).get():await DB.collection('follows').where('followerUid','==',uid).limit(100).get();
    body.innerHTML='';
    if(!snap.size){body.innerHTML=`<div style="text-align:center;padding:40px;color:var(--tm)"><span class="material-icons-round" style="font-size:44px;opacity:.3;display:block;margin-bottom:10px">group</span><p>No ${type} yet</p></div>`;return;}
    const uids=snap.docs.map(d=>type==='followers'?d.data().followerUid:d.data().followingUid).filter(Boolean);
    const uSnaps=await Promise.all(uids.slice(0,50).map(id=>DB.collection('users').doc(id).get().catch(()=>null)));
    uSnaps.forEach(us=>{
      if(!us||!us.exists)return;
      const u=us.data(),name=u.displayName||'User';
      const el=document.createElement('div');el.style.cssText='display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid var(--bdr);cursor:pointer;';
      const avHtml=u.photoURL&&u.photoURL.startsWith('http')?`<img src="${esc(u.photoURL)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%" onerror="this.outerHTML='${name[0].toUpperCase()}'"/>`:name[0].toUpperCase();
      el.innerHTML=`<div style="width:46px;height:46px;border-radius:50%;background:${randomColor(us.id)};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:900;font-size:1rem;flex-shrink:0;overflow:hidden">${avHtml}</div><div style="flex:1"><p style="font-weight:800;font-size:.9rem;color:var(--txt)">${esc(name)}</p><p style="font-size:.76rem;color:var(--tm)">@${esc(name.toLowerCase().replace(/[^a-z0-9]/g,'_'))}</p></div>`;
      el.addEventListener('click',()=>{ov.remove();openUserProfile(us.id);});
      body.appendChild(el);
    });
  }catch(e){body.innerHTML=`<p style="padding:20px;color:var(--tm)">Failed: ${esc(e.message)}</p>`;}
}

function openYourPosts(){if(!currentUser){toast('Login required','info');return;}const ov=$('yourPostsOverlay');if(ov)ov.classList.add('ypo-open');document.body.style.overflow='hidden';setHTML('ypoBody','<div class="pdf-loading"><div class="spinner"></div></div>');const userInfo={name:currentUser.displayName||'User',photoURL:currentUser.photoURL||'',uid:currentUser.uid};DB.collection('posts').where('userId','==',currentUser.uid).orderBy('createdAt','desc').limit(50).get().then(snap=>{const body=$('ypoBody');if(!body)return;body.innerHTML='';body.style.padding='10px 0';if(!snap.size){body.innerHTML='<div style="text-align:center;padding:40px;color:var(--tm)"><span class="material-icons-round" style="font-size:44px;opacity:.3;display:block">grid_off</span><p>No posts yet</p></div>';return;}snap.docs.forEach(doc=>{const p={id:doc.id,...doc.data()};body.appendChild(buildFbPostItem(p,userInfo,()=>openYourPosts()));});}).catch(err=>{setHTML('ypoBody','<div style="text-align:center;padding:40px;color:var(--tm)"><p>Failed: '+esc(err.message)+'</p></div>');});}
on('ypoBackBtn','click',()=>{const ov=$('yourPostsOverlay');if(ov)ov.classList.remove('ypo-open');document.body.style.overflow='';});
function openLikedPosts(){const ids=Object.keys(likedPosts).filter(k=>likedPosts[k]);if(!ids.length){toast('No liked posts yet','info');return;}const ov=$('yourPostsOverlay');if(!ov)return;ov.classList.add('ypo-open');document.body.style.overflow='hidden';setText('ypoTitle','Liked Posts');setHTML('ypoBody','<div class="pdf-loading"><div class="spinner"></div></div>');Promise.all(ids.slice(0,20).map(id=>DB.collection('posts').doc(id).get())).then(snaps=>{const body=$('ypoBody');if(!body)return;body.innerHTML='';body.style.padding='10px 0';const posts=snaps.filter(s=>s.exists&&!s.data().status).map(s=>({id:s.id,...s.data()}));if(!posts.length){body.innerHTML='<div style="text-align:center;padding:40px;color:var(--tm)"><p>No liked posts</p></div>';return;}posts.forEach(p=>{const ui={name:p.userName||'User',photoURL:p.userPhoto||'',uid:p.userId};body.appendChild(buildFbPostItem(p,ui,null));});}).catch(()=>setHTML('ypoBody','<p style="padding:24px;color:var(--tm)">Failed</p>'));}

/* MESSAGES — last sender at top */
function initMessages(){if(!currentUser){setStyle('conversationsLoginPrompt','display','flex');setStyle('conversationsEmpty','display','none');setStyle('chatView','display','none');setStyle('messagesListView','display','flex');return;}setStyle('conversationsLoginPrompt','display','none');setStyle('messagesListView','display','flex');setStyle('chatView','display','none');loadAllUsersAndConversations();}
on('msgLoginBtn','click',()=>switchSection('profile'));
async function loadAllUsersAndConversations(){
  if(!currentUser)return;const list=$('conversationsList');if(!list)return;
  list.querySelectorAll('.conversation-item').forEach(i=>i.remove());
  const empty=$('conversationsEmpty');if(empty)empty.style.display='none';
  try{
    const [convSnap,usersSnap]=await Promise.all([
      DB.collection('conversations').where('participants','array-contains',currentUser.uid).orderBy('lastMessageAt','desc').limit(50).get().catch(()=>({docs:[]})),
      DB.collection('users').get()
    ]);
    const convMap={};
    convSnap.docs.forEach(doc=>{const d=doc.data();const ou=(d.participants||[]).find(u=>u!==currentUser.uid)||'';if(ou)convMap[ou]={id:doc.id,...d};});
    const allUsers=usersSnap.docs.map(d=>({id:d.id,...d.data()})).filter(u=>u.id!==currentUser.uid);
    _allUsersCache=allUsers;
    if(!allUsers.length){if(empty)empty.style.display='flex';return;}
    /* Sort: last message sender first */
    const withConv=allUsers.filter(u=>convMap[u.id]).sort((a,b)=>{const ta=convMap[a.id].lastMessageAt?.toDate?convMap[a.id].lastMessageAt.toDate():new Date(0);const tb=convMap[b.id].lastMessageAt?.toDate?convMap[b.id].lastMessageAt.toDate():new Date(0);return tb-ta;});
    const withoutConv=allUsers.filter(u=>!convMap[u.id]).sort((a,b)=>(a.displayName||'').localeCompare(b.displayName||''));
    [...withConv,...withoutConv].forEach(u=>renderConvItem(u,convMap[u.id]));
  }catch(e){console.error('Messages load error:',e);}
}
function renderConvItem(u,conv){
  const list=$('conversationsList');if(!list)return;
  const unread=conv?(conv.unreadCounts&&conv.unreadCounts[currentUser.uid])||0:0;
  const lastMsg=conv?conv.lastMessage||'':null;const lastTime=conv?conv.lastMessageAt:null;
  /* Show last message sender's photo */
  const lastSenderUid=conv&&conv.lastSenderUid;
  const lastSenderPhoto=lastSenderUid&&conv.participantPhotos?conv.participantPhotos[lastSenderUid]:'';
  const item=document.createElement('div');item.className='conversation-item';item.dataset.uid=u.id;item.dataset.name=(u.displayName||'').toLowerCase();
  const name=u.displayName||'User';
  /* Use last sender's photo if available, else user photo */
  const displayPhoto=lastSenderPhoto||u.photoURL;
  const avHtml=displayPhoto&&displayPhoto.startsWith('http')?`<img src="${esc(displayPhoto)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%" onerror="this.outerHTML='${name[0].toUpperCase()}'"/>`:name[0].toUpperCase();
  item.innerHTML=`<div class="conv-avatar" style="background:${randomColor(u.id)}">${avHtml}</div><div class="conv-info"><p class="conv-name">${esc(name)}</p><p class="conv-last-msg${unread?' unread':''}">${lastMsg!==null?(lastMsg?esc(lastMsg):''):'<span style="color:var(--tm);font-style:italic">Tap to start chat</span>'}</p></div><div class="conv-meta">${lastTime?'<span class="conv-time">'+fmtAgo(lastTime)+'</span>':''}${unread?'<span class="conv-unread-badge">'+unread+'</span>':''}</div>`;
  item.style.cursor='pointer';
  item.addEventListener('click',()=>openChatWith(u.id,name,u.photoURL||'',conv?conv.id:null));
  list.insertBefore(item,list.querySelector('.conversations-empty')||null);
}
on('messagesSearch','input',e=>{const q=(e.target.value||'').trim().toLowerCase();const items=qsa('.conversation-item');if(!q){items.forEach(i=>i.style.display='');return;}let any=false;items.forEach(i=>{const match=(i.dataset.name||'').includes(q);i.style.display=match?'':'none';if(match)any=true;});if(!any&&_allUsersCache.length){const list=$('conversationsList');if(list){list.querySelectorAll('.conversation-item').forEach(i=>i.remove());_allUsersCache.filter(u=>(u.displayName||'').toLowerCase().includes(q)).forEach(u=>renderConvItem(u,null));}}});
on('newMessageBtn','click',()=>{const si=$('messagesSearch');if(si){si.focus();toast('Search for a user to start chatting','info');}});
function openChatWith(uid,name,photo,existingConvId){if(!currentUser){toast('Login to message','info');return;}if(uid===currentUser.uid){toast("Can't message yourself",'info');return;}if(!name){DB.collection('users').doc(uid).get().then(snap=>{if(snap.exists){name=snap.data().displayName||'User';photo=snap.data().photoURL||'';}  _doChat(uid,name,photo,existingConvId);}).catch(()=>_doChat(uid,name||'User',photo||'',existingConvId));}else _doChat(uid,name,photo,existingConvId);}
function _doChat(uid,name,photo,existingConvId){
  activeChatUid=uid;activeChatConvId=existingConvId||[currentUser.uid,uid].sort().join('_');
  setText('chatHeaderName',name||'User');setText('chatHeaderStatus','Online');
  const ha=$('chatHeaderAvatar');if(ha){if(photo&&photo.startsWith('http'))ha.innerHTML=`<img src="${esc(photo)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%" onerror="this.outerHTML='${(name||'U')[0].toUpperCase()}'"/>`;else ha.textContent=(name||'U')[0].toUpperCase();}
  const vp=$('chatViewProfileBtn');if(vp)vp.onclick=()=>openUserProfile(uid);
  setStyle('messagesListView','display','none');setStyle('chatView','display','flex');
  setHTML('chatMessages','<div class="pdf-loading"><div class="spinner"></div></div>');
  const myName=currentUser.displayName||'User',myPhoto=currentUser.photoURL||'';
  const convRef=DB.collection('conversations').doc(activeChatConvId);
  convRef.get().then(snap=>{if(!snap.exists)return convRef.set({participants:[currentUser.uid,uid],participantNames:{[currentUser.uid]:myName,[uid]:name||'User'},participantPhotos:{[currentUser.uid]:myPhoto,[uid]:photo||''},lastMessage:'',lastMessageAt:TS(),lastSenderUid:currentUser.uid,unreadCounts:{[currentUser.uid]:0,[uid]:0}});})
  .then(()=>{const upd={};upd['unreadCounts.'+currentUser.uid]=0;return convRef.update(upd);})
  .then(()=>{
    if(chatUnsub){chatUnsub();chatUnsub=null;}
    chatUnsub=convRef.collection('messages').orderBy('createdAt','asc').limit(150).onSnapshot(snap=>{
      const cm=$('chatMessages');if(!cm)return;cm.innerHTML='';
      if(!snap.size){cm.innerHTML='<p style="text-align:center;padding:24px;color:var(--tm);font-size:.82rem">Say hello 👋</p>';return;}
      snap.docs.forEach(doc=>{
        const msg={id:doc.id,...doc.data()},isSent=msg.senderId===currentUser.uid;
        const el=document.createElement('div');el.className='chat-msg '+(isSent?'msg-sent':'msg-received');
        const readMark=isSent?`<span style="font-size:13px;color:${msg.read?'#53bdeb':'rgba(255,255,255,.45)'}">✓✓</span>`:'';
        let mHtml='';
        if(msg.mediaUrl){if(msg.mediaType==='image')mHtml=`<div class="chat-msg-media"><img src="${esc(msg.mediaUrl)}" loading="eager" style="cursor:pointer;border-radius:12px;max-width:220px;display:block;" onclick="openPhotoViewer(this.src,'',null)"/></div>`;else if(msg.mediaType==='video')mHtml=`<div class="chat-msg-media"><video src="${esc(msg.mediaUrl)}" controls playsinline muted style="border-radius:8px;max-width:220px;display:block;"></video></div>`;}
        const avHtml=!isSent?`<div class="chat-msg-avatar" style="background:${randomColor(msg.senderId)}">${(msg.senderName||'U')[0].toUpperCase()}</div>`:'';
        el.innerHTML=avHtml+'<div>'+mHtml+(msg.text?`<div class="chat-msg-bubble">${esc(msg.text)}</div>`:'')+'<p class="chat-msg-time">'+fmtAgo(msg.createdAt)+' '+readMark+'</p></div>';
        if(isSent){let pt=null;el.addEventListener('touchstart',()=>{pt=setTimeout(()=>{if(confirm('Delete?'))convRef.collection('messages').doc(doc.id).delete().catch(()=>{});},600);});el.addEventListener('touchend',()=>clearTimeout(pt));el.addEventListener('contextmenu',e=>{e.preventDefault();if(confirm('Delete?'))convRef.collection('messages').doc(doc.id).delete().catch(()=>{});});}
        if(!isSent&&!msg.read){convRef.collection('messages').doc(doc.id).update({read:true}).catch(()=>{});}
        cm.appendChild(el);
      });
      cm.scrollTop=cm.scrollHeight;
      const u2={};u2['unreadCounts.'+currentUser.uid]=0;convRef.update(u2).catch(()=>{});
    },()=>{});
  }).catch(()=>{});
}
async function sendChatMessage(){
  if(!currentUser||!activeChatConvId)return;
  const ci=$('chatInput'),text=(ci?ci.value:'').trim();
  const mf=$('chatFileInput'),file=mf&&mf.files&&mf.files[0];
  if(!text&&!file)return;
  const btn=$('chatSendBtn');if(btn)btn.disabled=true;
  if(file&&file.type.startsWith('image/')){const localUrl=URL.createObjectURL(file);const cm=$('chatMessages');if(cm){const te=document.createElement('div');te.className='chat-msg msg-sent';te.style.opacity='.6';te.innerHTML=`<div><div class="chat-msg-media"><img src="${localUrl}" style="border-radius:12px;max-width:220px;display:block;"/></div><p class="chat-msg-time">Sending...</p></div>`;cm.appendChild(te);cm.scrollTop=cm.scrollHeight;}}
  try{
    let mediaUrl=null,mediaType=null;
    if(file){const folder=file.type.startsWith('image/')?'chats/images/':'chats/videos/';mediaUrl=await uploadFile(file,folder,()=>{});mediaType=file.type.startsWith('image/')?'image':'video';if(mf)mf.value='';setStyle('chatMediaPreview','display','none');}
    const myName=currentUser.displayName||'User';
    const convRef=DB.collection('conversations').doc(activeChatConvId);
    await convRef.collection('messages').add({senderId:currentUser.uid,senderName:myName,text:text||'',mediaUrl:mediaUrl||null,mediaType:mediaType||null,read:false,createdAt:TS()});
    const upd={lastMessage:text||(mediaType==='image'?'📷 Image':'🎬 Video'),lastMessageAt:TS(),lastSenderUid:currentUser.uid};upd['unreadCounts.'+activeChatUid]=INC(1);await convRef.update(upd);
    DB.collection('notifications').add({toUid:activeChatUid,fromUid:currentUser.uid,fromName:myName,fromPhoto:currentUser.photoURL||'',type:'message',preview:(text||(mediaType==='image'?'Sent a photo':'Sent a video')).slice(0,60),read:false,createdAt:TS()}).catch(()=>{});
    if(ci){ci.value='';ci.style.height='auto';}
  }catch(e){toast('Failed: '+e.message,'error');}
  if(btn)btn.disabled=false;
}
on('chatSendBtn','click',sendChatMessage);
on('chatInput','keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendChatMessage();}});
on('chatInput','input',function(){this.style.height='auto';this.style.height=Math.min(this.scrollHeight,100)+'px';});
on('chatAttachBtn','click',()=>{const fi=$('chatFileInput');if(fi)fi.click();});
on('chatFileInput','change',e=>{const file=e.target.files&&e.target.files[0];if(!file)return;if(file.size>2*1024*1024*1024){toast('Max 2GB','error');return;}const blob=URL.createObjectURL(file);const prev=$('chatMediaPreview'),pi=$('chatMediaPreviewImg'),pv=$('chatMediaPreviewVid');if(prev)prev.style.display='block';if(file.type.startsWith('image/')){if(pi){pi.src=blob;pi.style.display='block';}if(pv)pv.style.display='none';}else{if(pv){pv.src=blob;pv.style.display='block';}if(pi)pi.style.display='none';}});
on('chatMediaRemove','click',()=>{setStyle('chatMediaPreview','display','none');const pi=$('chatMediaPreviewImg'),pv=$('chatMediaPreviewVid'),fi=$('chatFileInput');if(pi)pi.src='';if(pv)pv.src='';if(fi)fi.value='';});
on('chatBackBtn','click',()=>{if(chatUnsub){chatUnsub();chatUnsub=null;}activeChatUid=null;activeChatConvId=null;setStyle('chatView','display','none');setStyle('messagesListView','display','flex');loadAllUsersAndConversations();});

/* ORDERS */
function listenOrders(uid){if(ordersUnsub){ordersUnsub();ordersUnsub=null;}ordersUnsub=DB.collection('orders').where('userId','==',uid).orderBy('createdAt','desc').limit(1).onSnapshot(()=>{},()=>{});}
function openOrdersOverlay(){if(!currentUser){toast('Login to see orders','info');switchSection('profile');return;}const ov=$('ordersOverlay');if(ov)ov.classList.add('orders-open');document.body.style.overflow='hidden';setHTML('ordersBody','<div class="pdf-loading"><div class="spinner"></div></div>');DB.collection('orders').where('userId','==',currentUser.uid).orderBy('createdAt','desc').limit(20).get().then(snap=>{const body=$('ordersBody');if(!body)return;body.innerHTML='';if(!snap.size){body.innerHTML='<div class="orders-empty"><span class="material-icons-round">inventory_2</span><p>No orders yet</p></div>';return;}snap.docs.forEach(doc=>{const o=Object.assign({id:doc.id},doc.data()),st=o.status||'confirmed';const stMap={confirmed:'Confirmed',shipped:'Shipped',delivered:'Delivered'};const card=document.createElement('div');card.className='order-card';let itemsHtml='';(o.items||[]).forEach(item=>{const digBtns=[];if(item.pdfUrl)digBtns.push(`<button class="btn-order-read" data-pdf="${esc(item.pdfUrl)}" data-title="${esc(item.title)}" style="display:flex;align-items:center;gap:6px;padding:8px 16px;background:var(--pr);color:#fff;border-radius:var(--rf);font-size:.82rem;font-weight:700;border:none;cursor:pointer"><span class="material-icons-round" style="font-size:16px">auto_stories</span>Read Book</button>`);if(item.audioUrl)digBtns.push(`<button class="btn-order-play" data-audio="${esc(item.audioUrl)}" data-title="${esc(item.title)}" style="display:flex;align-items:center;gap:6px;padding:8px 16px;background:var(--pr);color:#fff;border-radius:var(--rf);font-size:.82rem;font-weight:700;border:none;cursor:pointer"><span class="material-icons-round" style="font-size:16px">headphones</span>Play</button>`);itemsHtml+=`<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--bdr)"><img src="${esc(item.image||'')}" style="width:48px;height:48px;border-radius:8px;object-fit:cover" onerror="this.src='https://placehold.co/48'"/><div style="flex:1"><p style="font-weight:700;font-size:.86rem;color:var(--txt)">${esc(item.title)}</p><p style="font-size:.78rem;color:var(--tm)">&#x20B9;${fmt(item.price)}</p></div></div>${digBtns.length?`<div style="display:flex;gap:8px;flex-wrap:wrap;padding:8px 0">${digBtns.join('')}</div>`:''}`; });card.innerHTML=`<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--bdr)"><span style="font-weight:800;font-size:.82rem;color:var(--txt)">#${o.id.slice(0,8).toUpperCase()}</span><span style="font-size:.72rem;font-weight:700;padding:3px 10px;border-radius:99px;background:var(--pr-g);color:var(--pr)">${stMap[st]||'Confirmed'}</span></div><div style="padding:0 16px">${itemsHtml}</div><div style="display:flex;align-items:center;justify-content:space-between;padding:10px 16px;border-top:1px solid var(--bdr)"><span style="font-weight:800;color:var(--txt)">Total: &#x20B9;${fmt(o.total)}</span><span style="font-size:.74rem;color:var(--tm)">${fmtDate((o.createdAt&&o.createdAt.toDate&&o.createdAt.toDate())||new Date())}</span></div>`;card.querySelectorAll('.btn-order-read').forEach(btn=>btn.addEventListener('click',()=>openPdfReader(btn.dataset.pdf,btn.dataset.title)));card.querySelectorAll('.btn-order-play').forEach(btn=>btn.addEventListener('click',()=>openAudioOverlay(btn.dataset.audio,btn.dataset.title,'')));body.appendChild(card);});}).catch(()=>setHTML('ordersBody','<p style="padding:24px;color:var(--tm)">Failed to load</p>'));}
on('ordersBackBtn','click',()=>{const ov=$('ordersOverlay');if(ov)ov.classList.remove('orders-open');document.body.style.overflow='';});
function handleBuyNow(product){if(!currentUser){toast('Login to buy','info');switchSection('profile');return;}checkoutProduct=product;const isDigital=['ebook','audio'].includes(product.productType);setText('checkoutSubtitle',isDigital?'Digital product — instant access after payment.':'Enter delivery address.');setStyle('checkoutAddressFields','display',isDigital?'none':'block');const codOpt=document.querySelector('label[for="payCOD"]');if(codOpt)codOpt.style.display='none';const onlineRadio=document.querySelector('input[name="payMethod"][value="online"]');if(onlineRadio)onlineRadio.checked=true;const ov=$('checkoutModal');if(ov)ov.classList.add('modal-open');document.body.style.overflow='hidden';}
function closeCheckout(){const ov=$('checkoutModal');if(ov)ov.classList.remove('modal-open');document.body.style.overflow='';checkoutProduct=null;}
on('checkoutModalClose','click',closeCheckout);on('checkoutModalCancel','click',closeCheckout);on('checkoutModalBackdrop','click',closeCheckout);
on('checkoutConfirmBtn','click',()=>{if(!checkoutProduct||!currentUser)return;const isDigital=['ebook','audio'].includes(checkoutProduct.productType);if(!isDigital){const name=(($('addrName')||{}).value||'').trim(),phone=(($('addrPhone')||{}).value||'').trim();if(!name){toast('Full name required','error');return;}if(!/^\d{10}$/.test(phone)){toast('Valid mobile required','error');return;}}launchRazorpay();});
function launchRazorpay(){if(!checkoutProduct)return;const rzp=new window.Razorpay({key:RAZORPAY_KEY,amount:Math.round(checkoutProduct.price*100),currency:'INR',name:'SayatX',description:checkoutProduct.title,prefill:{name:currentUser.displayName||'',contact:''},theme:{color:'#f97316'},method:{upi:1,card:1,netbanking:1,wallet:1},handler:res=>placeOrder('online',res.razorpay_payment_id),modal:{ondismiss:()=>toast('Payment cancelled','warning')}});rzp.on('payment.failed',e=>toast('Payment failed: '+((e&&e.error&&e.error.description)||'Error'),'error'));rzp.open();}
async function placeOrder(method,paymentId){if(!checkoutProduct||!currentUser)return;showLoading('Placing order...');closeCheckout();const isDigital=['ebook','audio'].includes(checkoutProduct.productType);const addr=isDigital?null:{name:(($('addrName')||{}).value||'').trim(),phone:(($('addrPhone')||{}).value||'').trim(),street:(($('addrStreet')||{}).value||'').trim(),city:(($('addrCity')||{}).value||'').trim(),pin:(($('addrPin')||{}).value||'').trim(),state:(($('addrState')||{}).value||'').trim()};try{await DB.collection('orders').add({userId:currentUser.uid,items:[{productId:checkoutProduct.id,title:checkoutProduct.title,price:checkoutProduct.price,image:(checkoutProduct.images&&checkoutProduct.images[0])||checkoutProduct.image||'',productType:checkoutProduct.productType||'general',pdfUrl:checkoutProduct.pdfUrl||null,audioUrl:checkoutProduct.audioUrl||null}],total:checkoutProduct.price,paymentMethod:method,paymentId:paymentId||'PAY-'+Date.now(),deliveryAddress:addr,status:isDigital?'delivered':'confirmed',createdAt:TS()});setText('successPayId',paymentId||'Payment Successful');setText('successMsg',isDigital?'Your e-book is ready! Go to My Orders → Read Book.':'Order placed! We will ship it soon.');const sov=$('successOverlay');if(sov)sov.classList.add('success-open');}catch(e){toast('Order failed: '+e.message,'error',6000);}hideLoading();}
on('successDoneBtn','click',()=>{const sov=$('successOverlay');if(sov)sov.classList.remove('success-open');switchSection('profile');setTimeout(openOrdersOverlay,300);});

/* ADMIN */
function updateAdminAuthUI(){if(!$('adminAuthNotice'))return;setStyle('adminAuthNotice','display',currentUser?'none':'flex');setStyle('adminAuthOk','display',currentUser?'flex':'none');if(currentUser&&$('adminAuthName'))setText('adminAuthName','Logged in: '+(currentUser.displayName||'Admin'));}
qsa('[name="adminFeaturedType"]').forEach(r=>r.addEventListener('change',()=>{setStyle('featuredMediaField','display',r.value==='image'?'none':'block');}));
on('featuredThumbInput','change',e=>{const f=e.target.files&&e.target.files[0];if(!f)return;setText('featuredThumbName',f.name);setStyle('featuredThumbSelected','display','flex');setStyle('featuredThumbZone','display','none');});
on('featuredThumbRemove','click',()=>{const fi=$('featuredThumbInput');if(fi)fi.value='';setStyle('featuredThumbSelected','display','none');setStyle('featuredThumbZone','display','block');});
on('featuredMediaInput','change',e=>{const f=e.target.files&&e.target.files[0];if(!f)return;setText('featuredMediaName',f.name+' ('+(f.size/1024/1024).toFixed(1)+'MB)');setStyle('featuredMediaSelected','display','flex');setStyle('featuredMediaZone','display','none');});
on('featuredMediaRemove','click',()=>{const fi=$('featuredMediaInput');if(fi)fi.value='';setStyle('featuredMediaSelected','display','none');setStyle('featuredMediaZone','display','block');});
on('publishFeaturedBtn','click',async()=>{if(!currentUser){toast('Login required','error');return;}const type=(document.querySelector('[name="adminFeaturedType"]:checked')||{}).value||'image';const linkInput=$('featuredLink')||$('featuredTitle');const link=((linkInput||{}).value||'').trim();const thumbF=$('featuredThumbInput')&&$('featuredThumbInput').files[0];const mediaF=$('featuredMediaInput')&&$('featuredMediaInput').files[0];if(!thumbF){toast('Image/Thumbnail required','error');return;}if(type!=='image'&&!mediaF){toast('Media file required','error');return;}const btn=$('publishFeaturedBtn');if(btn)btn.disabled=true;showLoading('Uploading...');try{const thumbUrl=await uploadFile(thumbF,'featured/thumbs/',()=>{});let mediaUrl=thumbUrl;if(type!=='image'&&mediaF)mediaUrl=await uploadFile(mediaF,'featured/'+(type==='video'?'videos':'audios')+'/',()=>{});await DB.collection('featured').add({title:'Sponsored',link:link||null,type,mediaType:type,thumbnailUrl:thumbUrl,mediaUrl,createdAt:TS()});toast('Sponsored ad published!','success');if(linkInput)linkInput.value='';setStyle('featuredThumbSelected','display','none');setStyle('featuredThumbZone','display','block');setStyle('featuredMediaSelected','display','none');setStyle('featuredMediaZone','display','block');const fti=$('featuredThumbInput');if(fti)fti.value='';const fmi=$('featuredMediaInput');if(fmi)fmi.value='';}catch(e){toast('Failed: '+e.message,'error');}if(btn)btn.disabled=false;hideLoading();});
qsa('[name="adminProductType"]').forEach(r=>r.addEventListener('change',()=>{setStyle('productPDFField','display',r.value==='ebook'?'block':'none');setStyle('productAudioField','display',r.value==='audio'?'block':'none');}));
function updateDiscPreview(){const mrp=parseFloat(($('productMRP')||{}).value||0),sale=parseFloat(($('productSalePrice')||{}).value||0);if(mrp>0&&sale>0&&mrp>sale){setText('adminDiscountText',Math.round((1-sale/mrp)*100)+'% OFF');setStyle('adminDiscountPreview','display','flex');}else setStyle('adminDiscountPreview','display','none');}
on('productMRP','input',updateDiscPreview);on('productSalePrice','input',updateDiscPreview);
on('productImages','change',e=>{const files=Array.from((e.target.files)||[]);setHTML('adminImgPreviews','');const prev=$('adminImgPreviews');if(!prev)return;files.forEach((f,i)=>{const reader=new FileReader();reader.onload=ev=>{const wrap=document.createElement('div');wrap.className='admin-img-preview-item';wrap.innerHTML=`<img src="${ev.target.result}"/><button type="button">&times;</button>`;wrap.querySelector('button').addEventListener('click',()=>{const dt=new DataTransfer();Array.from($('productImages').files).filter((_,fi)=>fi!==i).forEach(f2=>dt.items.add(f2));try{$('productImages').files=dt.files;}catch(e){}wrap.remove();});prev.appendChild(wrap);};reader.readAsDataURL(f);});});
on('productPDF','change',e=>{const f=e.target.files&&e.target.files[0];if(!f)return;if(f.size>100*1024*1024){toast('Max 100MB for PDF','error');return;}setText('productPDFName',f.name);setStyle('productPDFSelected','display','flex');setStyle('productPDFZone','display','none');});
on('productPDFRemove','click',()=>{const fi=$('productPDF');if(fi)fi.value='';setStyle('productPDFSelected','display','none');setStyle('productPDFZone','display','block');});
on('productAudio','change',e=>{const f=e.target.files&&e.target.files[0];if(!f)return;setText('productAudioName',f.name);setStyle('productAudioSelected','display','flex');setStyle('productAudioZone','display','none');});
on('productAudioRemove','click',()=>{const fi=$('productAudio');if(fi)fi.value='';setStyle('productAudioSelected','display','none');setStyle('productAudioZone','display','block');});
function setProgress(pct,msg){const bar=$('adminProgressBar'),pctEl=$('adminProgressPct'),ti=$('adminProgressTitle');if(bar)bar.style.width=pct+'%';if(pctEl)pctEl.textContent=pct+'%';if(ti)ti.textContent=msg;}
function uploadLog(msg,type){const log=$('adminUploadLog');if(!log)return;const s=document.createElement('span');s.className='log-'+(type||'inf');s.textContent='['+new Date().toLocaleTimeString()+'] '+msg;log.appendChild(s);log.scrollTop=log.scrollHeight;}
on('publishProductBtn','click',async()=>{if(!currentUser){toast('Login required','error');return;}const type=(document.querySelector('[name="adminProductType"]:checked')||{}).value||'general';const title=(($('productTitle')||{}).value||'').trim();const desc=(($('productDesc')||{}).value||'').trim();const mrp=parseFloat(($('productMRP')||{}).value||0);const sale=parseFloat(($('productSalePrice')||{}).value||0);const imgF=Array.from(($('productImages')&&$('productImages').files)||[]);if(!title){toast('Title required','error');return;}if(!mrp||!sale){toast('MRP & Sale Price required','error');return;}if(sale>mrp){toast('Sale price cannot exceed MRP','error');return;}if(!imgF.length){toast('At least one image required','error');return;}if(type==='ebook'&&!($('productPDF')&&$('productPDF').files[0])){toast('PDF required','error');return;}if(type==='audio'&&!($('productAudio')&&$('productAudio').files[0])){toast('Audio file required','error');return;}const btn=$('publishProductBtn');if(btn)btn.disabled=true;setStyle('adminProgressCard','display','block');setHTML('adminUploadLog','');setProgress(0,'Preparing...');uploadLog('Starting...','inf');const total=imgF.length+(type==='ebook'?1:0)+(type==='audio'?1:0)+1;let done=0;const imgUrls=[];try{for(let i=0;i<imgF.length;i++){setProgress(Math.round(done/total*100),'Image '+(i+1));const url=await uploadFile(imgF[i],'products/images/',pct=>setProgress(Math.round((done+pct/100)/total*100),'Image: '+pct+'%'));imgUrls.push(url);done++;uploadLog('Image '+(i+1)+' ✓','ok');}let pdfUrl=null;if(type==='ebook'){setProgress(Math.round(done/total*100),'Uploading PDF...');pdfUrl=await uploadFile($('productPDF').files[0],'products/pdfs/',pct=>setProgress(Math.round((done+pct/100)/total*100),'PDF: '+pct+'%'));done++;uploadLog('PDF ✓','ok');}let audioUrl=null;if(type==='audio'){setProgress(Math.round(done/total*100),'Uploading audio...');audioUrl=await uploadFile($('productAudio').files[0],'products/audios/',pct=>setProgress(Math.round((done+pct/100)/total*100),'Audio: '+pct+'%'));done++;uploadLog('Audio ✓','ok');}setProgress(96,'Saving...');const disc=mrp>sale?Math.round((1-sale/mrp)*100):0;await DB.collection('products').add({title,description:desc,price:sale,originalPrice:mrp,discount:disc,productType:type,paymentMethod:'online',images:imgUrls,image:imgUrls[0]||'',thumbnailUrl:imgUrls[0]||'',pdfUrl:pdfUrl||null,audioUrl:audioUrl||null,inStock:true,createdAt:TS()});setProgress(100,'Published ✓');uploadLog('Product published!','ok');toast('Product published!','success',5000);['productTitle','productDesc','productMRP','productSalePrice'].forEach(id=>{const el=$(id);if(el)el.value='';});setHTML('adminImgPreviews','');['productImages','productPDF','productAudio'].forEach(id=>{try{const el=$(id);if(el)el.value='';}catch(e){}});setStyle('productPDFSelected','display','none');setStyle('productPDFZone','display','block');setStyle('productAudioSelected','display','none');setStyle('productAudioZone','display','block');setStyle('adminDiscountPreview','display','none');setStyle('productPDFField','display','none');setStyle('productAudioField','display','none');const gen=document.querySelector('[name="adminProductType"][value="general"]');if(gen)gen.checked=true;}catch(e){setProgress(0,'Failed');uploadLog('ERROR: '+e.message,'err');toast('Upload failed: '+e.message,'error',8000);}if(btn)btn.disabled=false;});

/* CLOSE ALL */
function closeAllSheets(){const cs=$('createPostSheet');if(cs)cs.classList.remove('sheet-open');const cms=$('commentsSheet');if(cms)cms.classList.remove('sheet-open');document.body.style.overflow='';}
document.addEventListener('keydown',e=>{if(e.key!=='Escape')return;if($('reelOverlay')?.classList.contains('reel-open')){closeReels();return;}const pv=document.getElementById('photoViewerOverlay');if(pv&&pv.style.display==='flex'){pv.style.display='none';document.body.style.overflow='';return;}if($('videoOverlay')?.classList.contains('video-open')){closeVideoOverlay();return;}if($('audioOverlay')?.classList.contains('audio-open')){closeAudioOverlay();return;}if($('pdfOverlay')?.classList.contains('pdf-open')){closePdfReader();return;}if($('userProfileOverlay')?.classList.contains('upo-open')){closeUpo();return;}if($('yourPostsOverlay')?.classList.contains('ypo-open')){$('ypoBackBtn')?.click();return;}if($('ordersOverlay')?.classList.contains('orders-open')){$('ordersBackBtn')?.click();return;}if($('checkoutModal')?.classList.contains('modal-open')){closeCheckout();return;}if($('createPostSheet')?.classList.contains('sheet-open')){closeCreatePost();return;}if($('commentsSheet')?.classList.contains('sheet-open')){closeComments();return;}if($('drawer')?.classList.contains('drawer-open')){closeDrawer();return;}['editProfileOverlay','settingsOverlay','notifOverlay'].forEach(id=>{const ov=document.getElementById(id);if(ov&&ov.classList.contains('upo-open')){ov.classList.remove('upo-open');document.body.style.overflow='';}});const cH=document.getElementById('commentsHalfOverlay');if(cH&&cH.style.display==='flex')cH.style.display='none';const pm=document.getElementById('postMenuOverlay');if(pm)pm.remove();const fl=document.getElementById('followListOv');if(fl)fl.remove();const vtp=document.getElementById('vtpOv');if(vtp)vtp.remove();});

/* INIT */
buildAuthScreen();
listenProducts();
loadFeatured();
loadFeed('all');
setTimeout(updateLogos,100);setTimeout(updateLogos,700);
console.log('%cSayatX v13.0 Ready!','color:#f97316;font-weight:900;font-size:16px');
