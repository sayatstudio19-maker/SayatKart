'use strict';
/* ═══════════════════════════════════════════════════
   SAYATX app.js — Complete rewrite, fixes:
   - Logo shows directly (no JS injection needed, set in HTML)
   - Sponsored strip fixed
   - Reel vertical scroll fixed (100dvh + snap)
   - Login always accessible + Guest login added
   - Follow requires login
   - Video/Photo tab switch doesn't clear file
   - Thumbnail upload sequence fixed
   - Background upload continues when screen locked
═══════════════════════════════════════════════════ */

firebase.initializeApp({
  apiKey:'AIzaSyDgJGxWxWGxszN4mz261wWKoB8kK_gxCIU',
  authDomain:'sayat-kart.firebaseapp.com',
  projectId:'sayat-kart',
  storageBucket:'sayat-kart.firebasestorage.app',
  messagingSenderId:'721186261827',
  appId:'1:721186261827:web:6aac4357fcadf05f703df6'
});
const Auth=firebase.auth(), DB=firebase.firestore(), Storage=firebase.storage();
try{ DB.enablePersistence({synchronizeTabs:true}).catch(()=>{}); }catch(e){}
if(typeof pdfjsLib!=='undefined') pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const RAZORPAY_KEY='rzp_live_SkOEXpqOtkBrwk';
const ADMIN_DIGEST='b48764d71f2345c31d7a346c490764b3635d62dbaf04ddb4802db5a8a572063a';
const TS=()=>firebase.firestore.FieldValue.serverTimestamp();
const INC=n=>firebase.firestore.FieldValue.increment(n);
const DEL=()=>firebase.firestore.FieldValue.delete();

const $=id=>document.getElementById(id);
const qs=(s,c)=>(c||document).querySelector(s);
const qsa=(s,c)=>[...(c||document).querySelectorAll(s)];
function on(id,evt,fn){ const e=typeof id==='string'?$(id):id; if(e) e.addEventListener(evt,fn); }
function setText(id,v){ const e=typeof id==='string'?$(id):id; if(e) e.textContent=v; }
function setHTML(id,v){ const e=typeof id==='string'?$(id):id; if(e) e.innerHTML=v; }
function setStyle(id,p,v){ const e=typeof id==='string'?$(id):id; if(e) e.style[p]=v; }
function esc(s){ const d=document.createElement('div'); d.appendChild(document.createTextNode(s||'')); return d.innerHTML; }
function fmt(n){ return Number(n||0).toLocaleString('en-IN',{maximumFractionDigits:2}); }
function fmtDate(d){ return new Date(d).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}); }
function fmtAgo(ts){ if(!ts) return 'now'; const d=ts.toDate?ts.toDate():new Date(ts), diff=Date.now()-d.getTime(); const m=Math.floor(diff/60000),h=Math.floor(m/60),dy=Math.floor(h/24); if(dy>0) return dy+'d'; if(h>0) return h+'h'; if(m>0) return m+'m'; return 'now'; }
function fmtTime(s){ if(!s||isNaN(s)) return '0:00'; return Math.floor(s/60)+':'+String(Math.floor(s%60)).padStart(2,'0'); }
function fmtCount(n){ n=Number(n)||0; if(n>=1e6) return (n/1e6).toFixed(1)+'M'; if(n>=1e3) return (n/1e3).toFixed(1)+'K'; return String(n); }
function getMime(n){ const e=(n||'').split('.').pop().toLowerCase(); return ({jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',gif:'image/gif',webp:'image/webp',mp4:'video/mp4',webm:'video/webm',mov:'video/quicktime',mp3:'audio/mpeg',wav:'audio/wav',ogg:'audio/ogg',aac:'audio/aac',m4a:'audio/mp4',pdf:'application/pdf'})[e]||'application/octet-stream'; }
function randomColor(uid){ const c=['#f97316','#8b5cf6','#06b6d4','#ec4899','#22c55e','#f59e0b','#3b82f6']; if(!uid) return c[0]; let h=0; for(let i=0;i<uid.length;i++) h=uid.charCodeAt(i)+((h<<5)-h); return c[Math.abs(h)%c.length]; }
const TRADE_KW=['trading','trade','stock','forex','crypto','invest','market','nifty','sensex','bitcoin','profit'];
function isTrading(t){ return (t||'').toLowerCase().split(/\s+/).some(w=>TRADE_KW.some(k=>w.includes(k))); }
function linkify(text){ if(!text) return ''; return esc(text).replace(/(https?:\/\/[^\s<>"]+)/g,url=>`<a href="${url}" target="_blank" rel="noopener" style="color:#1d9bf0;text-decoration:underline;word-break:break-all" onclick="event.stopPropagation()">${url}</a>`); }

function authErrMsg(code){
  const m={'auth/wrong-password':'ভুল পাসওয়ার্ড।','auth/user-not-found':'এই ইমেইলে কোনো অ্যাকাউন্ট নেই।','auth/invalid-login-credentials':'ভুল ইমেইল বা পাসওয়ার্ড।','auth/invalid-credential':'ভুল ইমেইল বা পাসওয়ার্ড।','auth/email-already-in-use':'এই ইমেইল আগে থেকেই registered।','auth/weak-password':'পাসওয়ার্ড কমপক্ষে ৬ অক্ষর হতে হবে।','auth/invalid-email':'সঠিক ইমেইল দিন।','auth/too-many-requests':'অনেকবার চেষ্টা হয়েছে, কিছুক্ষণ পর আবার চেষ্টা করুন।','auth/internal-error':'Phone Auth এরর। Firebase Console এ Phone Auth enable আছে কিনা এবং domain whitelist করা আছে কিনা চেক করুন।','auth/network-request-failed':'নেটওয়ার্ক সমস্যা।','auth/invalid-verification-code':'ভুল OTP।','auth/code-expired':'OTP মেয়াদ শেষ, আবার পাঠান।'};
  return m[code]||('Error: '+code);
}

function showLoading(msg){ setText('loadingMsg',msg||'Processing...'); $('loadingOverlay')?.classList.add('on'); }
function hideLoading(){ $('loadingOverlay')?.classList.remove('on'); }
function toast(msg,type,dur){ type=type||'info'; dur=dur||3000; const c=$('toastContainer'); if(!c) return; const el=document.createElement('div'); el.className='toast toast-'+type; el.textContent=msg; c.appendChild(el); setTimeout(()=>{ el.style.opacity='0'; el.style.transition='opacity .4s'; setTimeout(()=>el.remove(),400); },dur); return el; }
async function hashStr(s){ try{ const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)); return Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,'0')).join(''); }catch{ return null; } }
async function verifyAdmin(input){ if(!input) return false; const h=await hashStr(input); return h===ADMIN_DIGEST; }

/* ── STATE ── */
let currentUser=null, isGuest=false, allProducts=[], feedUnsub=null, ordersUnsub=null;
let chatUnsub=null, notifUnsub=null, activeChatUid=null, activeChatConvId=null;
let rcaptchaVerifier=null, rcaptchaResult=null;
let createPostType='text', createMediaFile=null, createMediaBlob=null, createThumbFile=null, createThumbBlob=null;
let currentReelItems=[], currentReelObs=null, commentsPostId=null, checkoutProduct=null;
const viewedPosts=new Set();
const likedPosts=JSON.parse(localStorage.getItem('sx_liked')||'{}');
const savedPosts=JSON.parse(localStorage.getItem('sx_saved')||'{}');
const followingCache=JSON.parse(localStorage.getItem('sx_following')||'{}');
window._feedItems=[]; window._uploadTasks=[]; window._profileVideos={};
let _allUsersCache=[];

/* ── THEME ── */
let isDark=localStorage.getItem('sx_theme')!=='light';
function applyTheme(dark){
  isDark=dark;
  document.documentElement.setAttribute('data-theme',dark?'dark':'light');
  localStorage.setItem('sx_theme',dark?'dark':'light');
  setText('drThemeIcon',dark?'light_mode':'dark_mode');
  setText('pmThemeIcon',dark?'light_mode':'dark_mode');
}
applyTheme(isDark);
on('drThemeToggle','click',()=>applyTheme(!isDark));
on('pmTheme','click',()=>applyTheme(!isDark));

/* ── DRAWER ── */
function openDrawer(){ $('drawer')?.classList.add('open'); $('drawerOverlay')?.classList.add('on'); document.body.style.overflow='hidden'; }
function closeDrawer(){ $('drawer')?.classList.remove('open'); $('drawerOverlay')?.classList.remove('on'); document.body.style.overflow=''; }
on('menuBtn','click',openDrawer);
on('drawerClose','click',closeDrawer);
on('drawerOverlay','click',closeDrawer);
on('drLoginBtn','click',()=>{ closeDrawer(); switchSection('profile'); });
on('drLogoutBtn','click',()=>{ closeDrawer(); handleLogout(); });
qsa('[data-nav]').forEach(btn=>btn.addEventListener('click',()=>{
  qsa('[data-nav]').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active'); closeDrawer(); handleDrawerNav(btn.dataset.nav);
}));
function handleDrawerNav(nav){
  switch(nav){
    case 'home': loadFeed('all'); switchSection('home'); break;
    case 'trending': loadFeed('trending'); switchSection('home'); break;
    case 'videos': loadFeed('videos'); switchSection('home'); break;
    case 'photos': loadFeed('photos'); switchSection('home'); break;
    case 'shop': loadFeed('shop'); switchSection('home'); break;
    case 'your-posts': requireLogin(()=>openYourPosts()); break;
    case 'notifications': openNotifPanel(); break;
    case 'orders': requireLogin(()=>openOrdersPanel()); break;
    case 'saved': requireLogin(()=>openSavedPosts()); break;
    case 'settings': requireLogin(()=>openSettingsPanel()); break;
    default: switchSection('home');
  }
}
on('drLiked','click',()=>{ closeDrawer(); requireLogin(()=>openLikedPosts()); });

/* requireLogin helper: if not logged in (or guest), redirect to profile/login */
function requireLogin(fn){
  if(currentUser && !isGuest){ fn(); return; }
  toast('লগইন করুন এই ফিচার ব্যবহার করতে','info');
  switchSection('profile');
}

/* ── SECTIONS ── */
const SECTIONS={home:'sectionHome',messages:'sectionMessages',profile:'sectionProfile'};
let currentSection='home';
function switchSection(name){
  if(!SECTIONS[name]) return; currentSection=name;
  Object.entries(SECTIONS).forEach(([k,id])=>{ $(id)?.classList.toggle('active',k===name); });
  $('sectionAdmin').style.display='none';
  qsa('.bnav-btn').forEach(b=>b.classList.toggle('active',b.dataset.section===name));
  qsa('[data-nav]').forEach(b=>b.classList.toggle('active',b.dataset.nav===name));
  $('fab').style.display = name==='messages' ? 'none':'flex';
  window.scrollTo({top:0,behavior:'smooth'});
  if(name==='messages') initMessages();
  if(name==='profile') refreshProfileUI();
}
qsa('.bnav-btn').forEach(btn=>btn.addEventListener('click',()=>switchSection(btn.dataset.section)));

/* Admin unlock — 10 taps on brand */
let brandTaps=0, brandTimer=null;
on('brandBtn','click',()=>{
  brandTaps++; clearTimeout(brandTimer); brandTimer=setTimeout(()=>{brandTaps=0;},3000);
  if(brandTaps>=10){
    brandTaps=0; const pwd=prompt('Admin password:'); if(!pwd) return;
    verifyAdmin(pwd).then(ok=>{
      if(ok){
        qsa('.section').forEach(s=>s.classList.remove('active'));
        $('sectionAdmin').style.display='block';
        updateAdminAuthUI();
        toast('Admin Panel unlocked','success');
        window.scrollTo({top:0});
      }else toast('Wrong password','error');
    });
  }
});

/* ── SEARCH ── */
on('searchToggleBtn','click',()=>{ $('searchBar')?.classList.toggle('on'); if($('searchBar')?.classList.contains('on')) $('searchInp')?.focus(); });
on('searchCloseBtn','click',()=>{ $('searchBar')?.classList.remove('on'); if($('searchInp')) $('searchInp').value=''; closeSearchPanel(); });
on('searchInp','input',e=>doSearch(e.target.value));
on('notifBtn','click',openNotifPanel);
function closeSearchPanel(){ setStyle('searchPanel','display','none'); setStyle('feedContainer','display',''); setStyle('featuredStrip','display',''); }
async function doSearch(q){
  if(!(q||'').trim()){ closeSearchPanel(); return; }
  if(currentSection!=='home') switchSection('home');
  setStyle('featuredStrip','display','none'); setStyle('feedContainer','display','none'); setStyle('searchPanel','display','block');
  setText('searchLabel','Results for "'+q+'"'); setStyle('searchEmpty','display','none'); setHTML('searchResults','');
  const lower=q.trim().toLowerCase();
  const prodR=allProducts.filter(p=>(p.title||'').toLowerCase().includes(lower));
  let postR=[],userR=[];
  try{ const snap=await DB.collection('posts').orderBy('createdAt','desc').limit(100).get(); postR=snap.docs.map(d=>({id:d.id,...d.data(),_type:'post'})).filter(p=>!p.status&&((p.text||'').toLowerCase().includes(lower)||(p.userName||'').toLowerCase().includes(lower))); }catch(e){}
  try{ const snap=await DB.collection('users').get(); userR=snap.docs.map(d=>({id:d.id,...d.data()})).filter(u=>(u.displayName||'').toLowerCase().includes(lower)).slice(0,8); }catch(e){}
  const list=$('searchResults'); if(!list) return; let found=false;
  if(userR.length){
    found=true; const lbl=document.createElement('p'); lbl.style.cssText='padding:8px 14px;font-size:.74rem;font-weight:800;color:var(--tm);text-transform:uppercase;'; lbl.textContent='People'; list.appendChild(lbl);
    userR.forEach(u=>{
      const el=document.createElement('div'); el.style.cssText='display:flex;align-items:center;gap:12px;padding:11px 14px;border-bottom:1px solid var(--bdr);cursor:pointer;';
      const av=document.createElement('div'); av.style.cssText='width:42px;height:42px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:900;color:#fff;font-size:1rem;flex-shrink:0;overflow:hidden;background:'+randomColor(u.id);
      if(u.photoURL){ const img=document.createElement('img'); img.src=u.photoURL; img.style.cssText='width:100%;height:100%;object-fit:cover'; av.appendChild(img); } else av.textContent=(u.displayName||'U')[0].toUpperCase();
      el.appendChild(av); const info=document.createElement('div'); info.innerHTML='<p style="font-weight:800;font-size:.88rem;color:var(--txt)">'+esc(u.displayName||'User')+'</p>'; el.appendChild(info);
      el.addEventListener('click',()=>openUserProfile(u.id)); list.appendChild(el);
    });
  }
  if(postR.length||prodR.length){
    found=true; const lbl=document.createElement('p'); lbl.style.cssText='padding:8px 14px;font-size:.74rem;font-weight:800;color:var(--tm);text-transform:uppercase;'; lbl.textContent='Posts & Products'; list.appendChild(lbl);
    [...postR,...prodR.map(p=>({...p,_type:'product'}))].forEach(item=>{ const el=item._type==='product'?buildProductPost(item):buildUserPost(item); if(el) list.appendChild(el); });
  }
  if(!found){ setStyle('searchEmpty','display','block'); setText('searchEmptyMsg','No results for "'+q+'"'); }
}

/* ── UPLOAD — fixed: continues in background, resumes on visibility change ── */
function uploadFile(file,folder,onProgress){
  return new Promise((resolve,reject)=>{
    if(!file||!currentUser){ reject(new Error(!file?'No file':'Not logged in')); return; }
    const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,100);
    const path=folder+currentUser.uid+'_'+Date.now()+'_'+safeName;
    const task=Storage.ref(path).put(file,{contentType:getMime(file.name)});
    window._uploadTasks.push(task);
    /* Fixed: resume automatically when tab/screen becomes visible again */
    const onVis=()=>{ if(!document.hidden && task.snapshot && task.snapshot.state==='paused') task.resume(); };
    document.addEventListener('visibilitychange',onVis);
    task.on('state_changed',
      snap=>{ const pct=snap.totalBytes>0?Math.round(snap.bytesTransferred/snap.totalBytes*100):0; if(onProgress) onProgress(pct); },
      err=>{ document.removeEventListener('visibilitychange',onVis); reject(err); },
      ()=>{ document.removeEventListener('visibilitychange',onVis); task.snapshot.ref.getDownloadURL().then(resolve).catch(reject); }
    );
  });
}
/* Don't block unload but warn — upload continues via Firebase SDK background resumable upload */
window.addEventListener('beforeunload',e=>{
  const active=(window._uploadTasks||[]).some(t=>t.snapshot && t.snapshot.state==='running');
  if(active){ e.preventDefault(); e.returnValue=''; }
});

function generateVideoThumbnail(file){
  return new Promise(resolve=>{
    const v=document.createElement('video'), url=URL.createObjectURL(file);
    v.src=url; v.muted=true; v.playsInline=true; v.currentTime=0.5;
    v.addEventListener('seeked',()=>{
      const c=document.createElement('canvas'); c.width=v.videoWidth||640; c.height=v.videoHeight||360;
      c.getContext('2d').drawImage(v,0,0,c.width,c.height);
      c.toBlob(blob=>{ URL.revokeObjectURL(url); resolve(blob||null); },'image/jpeg',0.85);
    },{once:true});
    v.addEventListener('error',()=>{ URL.revokeObjectURL(url); resolve(null); },{once:true});
    v.load();
  });
}

/* ── VIDEO THUMBNAIL PICKER (YouTube-style) ── */
function openVideoThumbPicker(videoFile,onSelected){
  const ov=$('vtpOv'); if(!ov) return;
  const blobUrl=URL.createObjectURL(videoFile);
  const vid=$('vtpVid'), seek=$('vtpSeek'), playBtn=$('vtpPlayBtn');
  vid.src=blobUrl; ov.style.display='flex';
  vid.addEventListener('loadedmetadata',()=>{ seek.max=vid.duration||100; },{once:true});
  vid.addEventListener('timeupdate',()=>{ if(!isNaN(vid.duration)){ seek.value=vid.currentTime; setText('vtpTime',fmtTime(vid.currentTime)); } });
  seek.oninput=()=>{ vid.currentTime=parseFloat(seek.value); };
  playBtn.onclick=()=>{ if(vid.paused){ vid.play(); playBtn.querySelector('.material-icons-round').textContent='pause'; } else { vid.pause(); playBtn.querySelector('.material-icons-round').textContent='play_arrow'; } };
  $('vtpCancelBtn').onclick=()=>{ vid.pause(); URL.revokeObjectURL(blobUrl); ov.style.display='none'; vid.src=''; };
  $('vtpUseBtn').onclick=()=>{
    vid.pause();
    const c=document.createElement('canvas'); c.width=vid.videoWidth||640; c.height=vid.videoHeight||360;
    c.getContext('2d').drawImage(vid,0,0,c.width,c.height);
    c.toBlob(blob=>{ URL.revokeObjectURL(blobUrl); ov.style.display='none'; vid.src=''; if(blob&&onSelected) onSelected(blob); },'image/jpeg',0.88);
  };
}

/* ════════ AUTH ════════ */
Auth.onAuthStateChanged(user=>{
  currentUser=user;
  isGuest = user ? user.isAnonymous : false;
  refreshAuthUI(user);
  if(user && !isGuest){ ensureUserDoc(user); listenNotifications(user.uid); listenOrders(user.uid); updateDrawerStrip(user); }
  else{ if(notifUnsub){notifUnsub();notifUnsub=null;} if(ordersUnsub){ordersUnsub();ordersUnsub=null;} setStyle('drUserStrip','display','none'); }
  handleDeepLink();
});

function refreshAuthUI(user){
  const loggedIn = !!user && !isGuest;
  /* FIX: Login option always reachable. Show auth screen if no user OR guest. */
  setStyle('authScreen','display', loggedIn ? 'none':'flex');
  setStyle('profileScreen','display', loggedIn ? 'block':'none');
  setStyle('drLoginBtn','display', loggedIn ? 'none':'flex');
  setStyle('drLogoutBtn','display', loggedIn ? 'flex':'none');
  setStyle('drUserStrip','display', loggedIn ? 'block':'none');
  updateAdminAuthUI();
}

function ensureUserDoc(user){
  if(!user) return; const ref=DB.collection('users').doc(user.uid);
  ref.get().then(snap=>{
    const name=user.displayName||localStorage.getItem('sx_name')||'User';
    const data={uid:user.uid,displayName:name,email:user.email||'',phone:user.phoneNumber||'',photoURL:user.photoURL||'',updatedAt:TS()};
    if(!snap.exists) ref.set({...data,followers:0,following:0,postCount:0,createdAt:TS()});
    else ref.update(data);
  }).catch(()=>{});
}

function updateDrawerStrip(user){
  if(!user) return; const name=user.displayName||localStorage.getItem('sx_name')||'User';
  setText('drName',name); setText('drHandle','@'+name.toLowerCase().replace(/[^a-z0-9]/g,'_'));
  const img=$('drAvatarImg'), ltr=$('drAvatarLetter');
  if(user.photoURL){ if(img){img.src=user.photoURL;img.style.display='block';} if(ltr) ltr.style.display='none'; }
  else{ if(ltr){ltr.textContent=name[0].toUpperCase();ltr.style.display='flex';} if(img) img.style.display='none'; }
  DB.collection('users').doc(user.uid).get().then(snap=>{ if(!snap.exists) return; const d=snap.data(); setText('drPostCount',fmtCount(d.postCount||0)); setText('drFollowerCount',fmtCount(d.followers||0)); }).catch(()=>{});
}

function refreshProfileUI(){
  if(!currentUser || isGuest) return;
  const name=currentUser.displayName||localStorage.getItem('sx_name')||'User';
  setText('profileName',name); setText('profileHandle','@'+name.toLowerCase().replace(/[^a-z0-9]/g,'_'));
  const img=$('profileAvImg'), ltr=$('profileAvLetter');
  if(currentUser.photoURL){ if(img){img.src=currentUser.photoURL;img.style.display='block';} if(ltr) ltr.style.display='none'; }
  else{ if(ltr){ltr.textContent=name[0].toUpperCase();ltr.style.display='flex';} if(img) img.style.display='none'; }
  DB.collection('users').doc(currentUser.uid).get().then(snap=>{ if(!snap.exists) return; const d=snap.data(); setText('profilePostCount',fmtCount(d.postCount||0)); setText('profileFollowerCount',fmtCount(d.followers||0)); setText('profileFollowingCount',fmtCount(d.following||0)); }).catch(()=>{});
}

/* ── AUTH TAB ── */
window.switchAuthTab=function(tab){
  const isP=tab==='phone';
  $('tabPhone')?.classList.toggle('active',isP);
  $('tabEmail')?.classList.toggle('active',!isP);
  setStyle('authPanelPhone','display',isP?'block':'none');
  setStyle('authPanelEmail','display',isP?'none':'block');
};

/* ── PHONE OTP — Fixed: signInWithPhoneNumber called inside reCAPTCHA callback, not in a loop ── */
function sendOtp(){
  const ph=(($('phoneInput')||{}).value||'').trim();
  if(!/^\d{10}$/.test(ph)){ toast('সঠিক ১০ ডিজিট নাম্বার দিন','error'); return; }
  showLoading('reCAPTCHA তৈরি হচ্ছে...');
  const rc=$('recaptcha-container'); if(rc) rc.innerHTML='';
  if(rcaptchaVerifier){ try{rcaptchaVerifier.clear();}catch(e){} rcaptchaVerifier=null; }
  rcaptchaResult=null;
  try{
    rcaptchaVerifier=new firebase.auth.RecaptchaVerifier('recaptcha-container',{
      size:'normal',
      callback:()=>{
        hideLoading(); showLoading('+91'+ph+' এ OTP পাঠানো হচ্ছে...');
        Auth.signInWithPhoneNumber('+91'+ph,rcaptchaVerifier)
          .then(res=>{ rcaptchaResult=res; setStyle('otpWrap','display','block'); qsa('.otp-box')[0]?.focus(); toast('OTP পাঠানো হয়েছে +91'+ph,'success'); hideLoading(); })
          .catch(e=>{ toast(authErrMsg(e.code),'error',6000); hideLoading(); console.error('OTP send error:',e.code,e.message); });
      },
      'expired-callback':()=>{ toast('reCAPTCHA মেয়াদ শেষ, আবার চেষ্টা করুন','error'); hideLoading(); }
    });
    rcaptchaVerifier.render().then(()=>hideLoading()).catch(e=>{ toast('reCAPTCHA failed: '+e.message,'error'); hideLoading(); });
  }catch(e){ toast('reCAPTCHA setup failed: '+e.message,'error'); hideLoading(); }
}
function verifyOtp(){
  const otp=qsa('.otp-box').map(b=>b.value).join('');
  if(otp.length!==6){ toast('৬ ডিজিট OTP দিন','error'); return; }
  if(!rcaptchaResult){ toast('আগে OTP পাঠান','error'); return; }
  showLoading('Verifying...');
  rcaptchaResult.confirm(otp)
    .then(()=>{ toast('Phone verified! স্বাগতম!','success'); switchSection('home'); showProfileSetupIfNeeded(); })
    .catch(e=>{ toast(authErrMsg(e.code),'error'); })
    .finally(hideLoading);
}
qsa('.otp-box').forEach((box,i,arr)=>{
  box.addEventListener('input',e=>{ e.target.value=e.target.value.slice(-1); e.target.classList.toggle('filled',!!e.target.value); if(e.target.value && arr[i+1]) arr[i+1].focus(); });
  box.addEventListener('keydown',e=>{ if(e.key==='Backspace' && !e.target.value && arr[i-1]) arr[i-1].focus(); });
});
on('sendOtpBtn','click',sendOtp);
on('resendOtpBtn','click',()=>{ setStyle('otpWrap','display','none'); qsa('.otp-box').forEach(b=>{b.value='';b.classList.remove('filled');}); sendOtp(); });
on('verifyOtpBtn','click',verifyOtp);

/* ── EMAIL AUTH ── */
on('emSignInBtn','click',async()=>{
  const email=(($('emEmail')||{}).value||'').trim(), pass=($('emPass')||{}).value||'';
  if(!email||!pass){ toast('ইমেইল ও পাসওয়ার্ড দিন','error'); return; }
  showLoading('Signing in...');
  try{ await Auth.signInWithEmailAndPassword(email,pass); toast('লগইন সফল!','success'); switchSection('home'); showProfileSetupIfNeeded(); }
  catch(e){ toast(authErrMsg(e.code),'error',5000); }
  finally{ hideLoading(); }
});
on('emSignUpBtn','click',async()=>{
  const email=(($('emEmail')||{}).value||'').trim(), pass=($('emPass')||{}).value||'';
  if(!email||pass.length<6){ toast('ইমেইল লাগবে, পাসওয়ার্ড min ৬ অক্ষর','error'); return; }
  showLoading('Creating account...');
  try{ await Auth.createUserWithEmailAndPassword(email,pass); toast('অ্যাকাউন্ট তৈরি হয়েছে!','success'); switchSection('home'); showProfileSetupIfNeeded(); }
  catch(e){
    hideLoading();
    if(e.code==='auth/email-already-in-use'){
      if(confirm('এই ইমেইল আগে থেকেই registered। Sign In করবেন?')){
        showLoading('Signing in...');
        try{ await Auth.signInWithEmailAndPassword(email,pass); toast('লগইন সফল!','success'); switchSection('home'); }
        catch(e2){ toast(authErrMsg(e2.code),'error',5000); }
        finally{ hideLoading(); }
      }
    }else toast(authErrMsg(e.code),'error',5000);
    return;
  }
  finally{ hideLoading(); }
});
on('emForgotBtn','click',async()=>{
  const email=(($('emEmail')||{}).value||'').trim();
  if(!email){ toast('আগে ইমেইল দিন','error'); return; }
  showLoading('Sending...');
  try{ await Auth.sendPasswordResetEmail(email); toast('Reset email পাঠানো হয়েছে!','success'); }
  catch(e){ toast(authErrMsg(e.code),'error'); }
  finally{ hideLoading(); }
});

/* ── GUEST LOGIN (anonymous) ── */
async function handleGuestLogin(){
  showLoading('Guest হিসেবে প্রবেশ করা হচ্ছে...');
  try{
    await Auth.signInAnonymously();
    isGuest=true;
    toast('Guest হিসেবে প্রবেশ করেছেন। পোস্ট/follow করতে পরে লগইন করুন।','info',4000);
    switchSection('home');
  }catch(e){ toast('Guest login failed: '+e.message,'error'); }
  finally{ hideLoading(); }
}
on('guestBtn','click',handleGuestLogin);
on('guestBtn2','click',handleGuestLogin);

/* ── PROFILE SETUP POPUP ── */
function showProfileSetupIfNeeded(){
  if(!currentUser || isGuest) return;
  const name=currentUser.displayName||localStorage.getItem('sx_name')||'';
  if(name && name!=='User') return;
  setTimeout(()=>{
    const ov=document.createElement('div'); ov.style.cssText='position:fixed;inset:0;z-index:700;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;padding:20px;';
    ov.innerHTML=`<div style="background:var(--card);border-radius:20px;padding:24px;width:100%;max-width:380px"><h3 style="font-weight:900;font-size:1.05rem;color:var(--txt);margin-bottom:6px">প্রোফাইল সেট করুন</h3><p style="font-size:.8rem;color:var(--tm);margin-bottom:16px">Optional — skip করতে পারেন</p><input id="setupNameInp" type="text" placeholder="আপনার নাম" maxlength="40" style="width:100%;padding:11px 13px;border:1.5px solid var(--bdr2);border-radius:12px;background:var(--card2);color:var(--txt);font-size:.88rem;outline:none;box-sizing:border-box;margin-bottom:10px"/><div style="display:flex;gap:8px"><button id="setupSkip" style="flex:1;padding:12px;background:var(--card2);border:1.5px solid var(--bdr2);border-radius:12px;font-size:.85rem;font-weight:700;color:var(--tm);cursor:pointer">Skip</button><button id="setupSave" style="flex:2;padding:12px;background:var(--pr);color:#fff;border-radius:12px;font-size:.85rem;font-weight:800;border:none;cursor:pointer">Save</button></div></div>`;
    document.body.appendChild(ov);
    ov.querySelector('#setupSkip').onclick=()=>ov.remove();
    ov.querySelector('#setupSave').onclick=async()=>{
      const n=(ov.querySelector('#setupNameInp').value||'').trim(); if(!n||n.length<2){ toast('কমপক্ষে ২ অক্ষর','error'); return; }
      showLoading('Saving...');
      try{ await currentUser.updateProfile({displayName:n}); await DB.collection('users').doc(currentUser.uid).update({displayName:n,updatedAt:TS()}); localStorage.setItem('sx_name',n); refreshProfileUI(); updateDrawerStrip(currentUser); ov.remove(); toast('সেভ হয়েছে!','success'); }
      catch(e){ toast('Failed: '+e.message,'error'); }
      finally{ hideLoading(); }
    };
  },800);
}

/* ── LOGOUT ── */
async function handleLogout(){
  showLoading('Logging out...');
  if(chatUnsub){chatUnsub();chatUnsub=null;} if(ordersUnsub){ordersUnsub();ordersUnsub=null;} if(notifUnsub){notifUnsub();notifUnsub=null;}
  if(rcaptchaVerifier){ try{rcaptchaVerifier.clear();}catch(e){} rcaptchaVerifier=null; }
  await Auth.signOut().catch(()=>{});
  isGuest=false;
  toast('লগআউট হয়েছে','info'); switchSection('home'); hideLoading();
}
on('logoutBtn','click',handleLogout);

/* ── AVATAR EDIT ── */
on('profileAvEditBtn','click',()=>$('avatarInput')?.click());
on('avatarInput','change',async e=>{
  const file=e.target.files&&e.target.files[0]; if(!file||!currentUser||isGuest) return;
  if(file.size>5*1024*1024){ toast('Max 5MB','error'); return; }
  showLoading('Uploading photo...');
  try{
    const url=await uploadFile(file,'avatars/'+currentUser.uid+'/',()=>{});
    await currentUser.updateProfile({photoURL:url});
    await DB.collection('users').doc(currentUser.uid).update({photoURL:url,updatedAt:TS()});
    const snap=await DB.collection('posts').where('userId','==',currentUser.uid).limit(20).get();
    const batch=DB.batch(); snap.docs.forEach(doc=>batch.update(doc.ref,{userPhoto:url})); await batch.commit().catch(()=>{});
    refreshProfileUI(); updateDrawerStrip(currentUser); toast('ছবি আপডেট হয়েছে!','success');
  }catch(err){ toast('Upload failed: '+err.message,'error'); }
  finally{ hideLoading(); if($('avatarInput')) $('avatarInput').value=''; }
});

/* ── EDIT PROFILE ── */
on('editProfileBtn','click',openEditProfile);
function openEditProfile(){
  if(!currentUser||isGuest){ toast('গেস্ট ইউজার প্রোফাইল এডিট করতে পারবে না — লগইন করুন','info'); return; }
  const ex=document.getElementById('editProfileOv'); if(ex){ ex.classList.add('open'); document.body.style.overflow='hidden'; return; }
  const ov=document.createElement('div'); ov.id='editProfileOv'; ov.className='ov-panel open'; ov.style.zIndex='615';
  ov.innerHTML=`<div class="ov-hdr"><button class="ov-back btn-pulse" id="epClose"><span class="material-icons-round">close</span></button><span class="ov-title">Edit Profile</span></div><div class="ov-body" style="padding:20px"><label style="display:block;font-size:.78rem;font-weight:700;color:var(--txt);margin-bottom:6px">Display Name</label><input id="editNameInp" type="text" value="${esc(currentUser.displayName||localStorage.getItem('sx_name')||'')}" style="width:100%;padding:11px 13px;border:1.5px solid var(--bdr2);border-radius:12px;background:var(--card2);color:var(--txt);font-size:.88rem;outline:none;box-sizing:border-box;margin-bottom:14px"/><button id="saveProfileBtn" style="width:100%;padding:13px;background:var(--pr);color:#fff;border-radius:12px;font-size:.88rem;font-weight:700;border:none;cursor:pointer">Save Changes</button></div>`;
  document.body.appendChild(ov); document.body.style.overflow='hidden';
  ov.querySelector('#epClose').onclick=()=>{ ov.classList.remove('open'); document.body.style.overflow=''; };
  ov.querySelector('#saveProfileBtn').addEventListener('click',async()=>{
    const n=(ov.querySelector('#editNameInp').value||'').trim(); if(!n||n.length<2){ toast('কমপক্ষে ২ অক্ষর','error'); return; }
    showLoading('Saving...');
    try{ await currentUser.updateProfile({displayName:n}); await DB.collection('users').doc(currentUser.uid).update({displayName:n,updatedAt:TS()}); localStorage.setItem('sx_name',n); refreshProfileUI(); updateDrawerStrip(currentUser); ov.classList.remove('open'); document.body.style.overflow=''; toast('আপডেট হয়েছে!','success'); }
    catch(err){ toast('Failed: '+err.message,'error'); }
    finally{ hideLoading(); }
  });
}
function openSettingsPanel(){
  const ex=document.getElementById('settingsOv'); if(ex){ ex.classList.add('open'); document.body.style.overflow='hidden'; return; }
  const ov=document.createElement('div'); ov.id='settingsOv'; ov.className='ov-panel open'; ov.style.zIndex='615';
  ov.innerHTML=`<div class="ov-hdr"><button class="ov-back btn-pulse" id="setClose"><span class="material-icons-round">close</span></button><span class="ov-title">Settings</span></div><div class="ov-body"><div style="padding:14px"><div style="background:var(--card2);border-radius:16px;border:1px solid var(--bdr);overflow:hidden"><button onclick="applyTheme(!isDark)" style="display:flex;align-items:center;gap:12px;width:100%;padding:14px;border-bottom:1px solid var(--bdr);text-align:left;background:none;cursor:pointer;color:var(--txt)"><span class="material-icons-round" style="color:var(--pr)">palette</span><span style="font-weight:700">Toggle Dark/Light</span></button><button id="setEditBtn" style="display:flex;align-items:center;gap:12px;width:100%;padding:14px;border-bottom:1px solid var(--bdr);text-align:left;background:none;cursor:pointer;color:var(--txt)"><span class="material-icons-round" style="color:var(--pr)">edit</span><span style="font-weight:700">Edit Name</span></button><button id="setPhotoBtn" style="display:flex;align-items:center;gap:12px;width:100%;padding:14px;text-align:left;background:none;cursor:pointer;color:var(--txt)"><span class="material-icons-round" style="color:var(--pr)">photo_camera</span><span style="font-weight:700">Change Photo</span></button></div><button onclick="handleLogout()" style="display:flex;align-items:center;gap:10px;width:100%;margin-top:12px;padding:13px;border-radius:12px;background:rgba(244,33,46,.1);border:1px solid rgba(244,33,46,.2);color:#f4212e;font-weight:700;cursor:pointer"><span class="material-icons-round">logout</span>Logout</button></div></div>`;
  document.body.appendChild(ov); document.body.style.overflow='hidden';
  ov.querySelector('#setClose').onclick=()=>{ ov.classList.remove('open'); document.body.style.overflow=''; };
  ov.querySelector('#setEditBtn').onclick=()=>{ ov.classList.remove('open'); document.body.style.overflow=''; openEditProfile(); };
  ov.querySelector('#setPhotoBtn').onclick=()=>{ ov.classList.remove('open'); document.body.style.overflow=''; $('avatarInput')?.click(); };
}
on('pmYourPosts','click',()=>requireLogin(openYourPosts));
on('pmSaved','click',()=>requireLogin(openSavedPosts));
on('pmOrders','click',()=>requireLogin(openOrdersPanel));
on('pmNotif','click',openNotifPanel);
on('profileFollowersStat','click',()=>{ if(currentUser&&!isGuest) openFollowList(currentUser.uid,'followers'); });
on('profileFollowingStat','click',()=>{ if(currentUser&&!isGuest) openFollowList(currentUser.uid,'following'); });

/* ════════ NOTIFICATIONS ════════ */
function listenNotifications(uid){
  if(notifUnsub){notifUnsub();notifUnsub=null;}
  notifUnsub=DB.collection('notifications').where('toUid','==',uid).where('read','==',false).onSnapshot(snap=>{
    const n=snap.size; const dot=$('notifDot'); if(dot) dot.style.display=n?'block':'none';
    setStyle('drNotifBadge','display',n?'inline-flex':'none'); setText('drNotifBadge',String(n));
    setStyle('pmNotifBadge','display',n?'inline-flex':'none'); setText('pmNotifBadge',String(n));
  },()=>{});
}
function openNotifPanel(){
  if(!currentUser||isGuest){ toast('নোটিফিকেশন দেখতে লগইন করুন','info'); return; }
  $('notifPanel')?.classList.add('open'); document.body.style.overflow='hidden'; loadNotifications();
}
on('notifPanelClose','click',()=>{ $('notifPanel')?.classList.remove('open'); document.body.style.overflow=''; });

async function loadNotifications(){
  const body=$('notifBody'); if(!body||!currentUser) return;
  body.innerHTML='<div class="pdf-loading"><div class="spinner"></div></div>';
  let docs=[];
  try{ const snap=await DB.collection('notifications').where('toUid','==',currentUser.uid).orderBy('createdAt','desc').limit(40).get(); docs=snap.docs; }
  catch(e){ try{ const snap=await DB.collection('notifications').where('toUid','==',currentUser.uid).limit(40).get(); docs=snap.docs.sort((a,b)=>{ const ta=a.data().createdAt?.toDate?a.data().createdAt.toDate():new Date(0), tb=b.data().createdAt?.toDate?b.data().createdAt.toDate():new Date(0); return tb-ta; }); }catch(e2){ body.innerHTML='<p style="padding:20px;color:var(--tm)">Failed to load.</p>'; return; } }
  body.innerHTML='';
  if(!docs.length){ body.innerHTML='<div style="text-align:center;padding:40px;color:var(--tm)"><span class="material-icons-round" style="font-size:44px;opacity:.3;display:block;margin-bottom:12px">notifications_none</span><p>কোনো নোটিফিকেশন নেই</p></div>'; return; }
  const batch=DB.batch(); docs.forEach(d=>{ if(!d.data().read) batch.update(d.ref,{read:true}); }); batch.commit().catch(()=>{});
  docs.forEach(doc=>{
    const n=doc.data();
    const el=document.createElement('div'); el.style.cssText='display:flex;align-items:flex-start;gap:12px;padding:13px 16px;border-bottom:1px solid var(--bdr);';
    const avWrap=document.createElement('div'); avWrap.style.cssText='width:44px;height:44px;border-radius:50%;background:'+randomColor(n.fromUid)+';display:flex;align-items:center;justify-content:center;color:#fff;font-weight:900;font-size:1rem;flex-shrink:0;overflow:hidden;cursor:pointer;';
    if(n.fromPhoto&&n.fromPhoto.startsWith('http')) avWrap.innerHTML=`<img src="${esc(n.fromPhoto)}" style="width:100%;height:100%;object-fit:cover" onerror="this.parentNode.textContent='${(n.fromName||'U')[0].toUpperCase()}'"/>`; else avWrap.textContent=(n.fromName||'U')[0].toUpperCase();
    avWrap.onclick=()=>{ $('notifPanel')?.classList.remove('open'); document.body.style.overflow=''; openUserProfile(n.fromUid); };
    const typeText = n.type==='follow'?'আপনাকে follow করেছে':n.type==='message'?'আপনাকে মেসেজ পাঠিয়েছে':n.type==='like'?'আপনার পোস্ট লাইক করেছে':'interact করেছে';
    const info=document.createElement('div'); info.style.flex='1';
    const preview = n.type==='message'&&n.preview ? `<p style="font-size:.78rem;color:var(--txt);margin-top:4px;background:var(--card2);padding:6px 10px;border-radius:10px;display:inline-block">"${esc(n.preview)}"</p>` : '';
    /* Reply button: removes notification from this panel on click — fixed */
    const replyBtnHtml = n.type==='message' ? `<button class="notif-reply" data-docid="${doc.id}" data-uid="${esc(n.fromUid)}" data-name="${esc(n.fromName||'')}" data-photo="${esc(n.fromPhoto||'')}" style="margin-top:7px;padding:6px 13px;background:var(--pr);color:#fff;border:none;border-radius:10px;font-size:.76rem;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:5px"><span class="material-icons-round" style="font-size:14px">reply</span>Reply</button>` : '';
    info.innerHTML=`<p style="font-weight:700;font-size:.88rem;color:var(--txt)">${esc(n.fromName||'User')} <span style="font-weight:500;color:var(--tm)">${typeText}</span></p><p style="font-size:.72rem;color:var(--tm)">${fmtAgo(n.createdAt)}</p>${preview}<div>${replyBtnHtml}</div>`;
    const rb=info.querySelector('.notif-reply');
    if(rb){ rb.onclick=e=>{
      e.stopPropagation();
      el.style.transition='opacity .3s'; el.style.opacity='0'; setTimeout(()=>el.remove(),300);
      DB.collection('notifications').doc(rb.dataset.docid).update({read:true}).catch(()=>{});
      $('notifPanel')?.classList.remove('open'); document.body.style.overflow='';
      switchSection('messages'); setTimeout(()=>openChatWith(rb.dataset.uid,rb.dataset.name,rb.dataset.photo),300);
    }; }
    el.addEventListener('click',()=>{ if(n.type==='follow'){ $('notifPanel')?.classList.remove('open'); document.body.style.overflow=''; openUserProfile(n.fromUid); } });
    el.appendChild(avWrap); el.appendChild(info); body.appendChild(el);
  });
}

/* ════════ DEEP LINK ════════ */
function handleDeepLink(){
  const hash=window.location.hash; if(!hash) return;
  const pm=hash.match(/^#post\/(.+)$/);
  if(pm){ DB.collection('posts').doc(pm[1]).get().then(snap=>{ if(!snap.exists||snap.data().status) return; const post={id:snap.id,...snap.data()}; if(post.mediaType==='video'&&post.mediaUrl) openReels([post],0); else if(post.mediaType==='photo'&&post.mediaUrl) openPhotoViewer(post.mediaUrl,post.text||'',post); }).catch(()=>{}); }
  const um=hash.match(/^#user\/(.+)$/); if(um) openUserProfile(um[1]);
}
window.addEventListener('hashchange',handleDeepLink);
function getPostShareUrl(pid){ return location.origin+location.pathname+'#post/'+pid; }

/* ════════ FEATURED — FIXED ════════ */
function loadFeatured(){
  DB.collection('featured').orderBy('createdAt','desc').limit(10).onSnapshot(snap=>{
    const scroll=$('featScroll'), strip=$('featuredStrip');
    if(!scroll) return;
    scroll.innerHTML='';
    if(!snap.size){ if(strip) strip.style.display='none'; return; }
    if(strip) strip.style.display='block';
    snap.docs.forEach(doc=>{
      const d={id:doc.id,...doc.data()};
      const isVideo = d.mediaType==='video' || d.type==='video';
      const card=document.createElement('div'); card.className='feat-card';
      if(isVideo && d.mediaUrl){
        card.innerHTML=`<video src="${esc(d.mediaUrl)}" autoplay loop playsinline muted></video><div class="feat-card-grad"><span class="feat-card-tag">Sponsored</span></div><button class="feat-mute-btn" style="position:absolute;top:8px;right:8px;width:28px;height:28px;border-radius:50%;background:rgba(0,0,0,.5);border:none;display:flex;align-items:center;justify-content:center;color:#fff;cursor:pointer;z-index:2;"><span class="material-icons-round" style="font-size:15px">volume_off</span></button>`;
        const vid=card.querySelector('video');
        card.querySelector('.feat-mute-btn').addEventListener('click',e=>{ e.stopPropagation(); vid.muted=!vid.muted; e.currentTarget.querySelector('.material-icons-round').textContent=vid.muted?'volume_off':'volume_up'; });
      }else{
        const thumb=d.thumbnailUrl||'';
        card.innerHTML=(thumb?`<img src="${esc(thumb)}" onerror="this.style.display='none'"/>`:'')+`<div class="feat-card-grad"><span class="feat-card-tag">Sponsored</span></div>`;
      }
      card.addEventListener('click',e=>{
        if(e.target.closest('.feat-mute-btn')) return;
        if(d.link) window.open(d.link,'_blank','noopener');
        else if(isVideo && d.mediaUrl) openReels([{id:d.id,mediaUrl:d.mediaUrl,mediaType:'video',text:'',userName:'SayatX',userPhoto:'',thumbnailUrl:d.thumbnailUrl||'',likes:0,commentCount:0,views:0,createdAt:d.createdAt}],0);
        else if(d.thumbnailUrl) openPhotoViewer(d.thumbnailUrl,'',null);
      });
      scroll.appendChild(card);
    });
  },err=>{ console.error('Featured load error:',err); if($('featuredStrip')) $('featuredStrip').style.display='none'; });
}

/* ════════ FEED ════════ */
let feedFilter='all';
function loadFeed(filter){
  feedFilter=filter||'all'; if(feedUnsub){feedUnsub();feedUnsub=null;}
  const skel=$('feedSkel'); if(skel) skel.style.display='block';
  closeSearchPanel(); clearFeedPosts();
  if(filter==='shop'){ renderProductsFeed(); return; }
  let q=DB.collection('posts').orderBy('createdAt','desc').limit(50);
  if(filter==='videos') q=DB.collection('posts').where('mediaType','==','video').orderBy('createdAt','desc').limit(50);
  if(filter==='photos') q=DB.collection('posts').where('mediaType','==','photo').orderBy('createdAt','desc').limit(50);
  if(filter==='trending') q=DB.collection('posts').orderBy('likes','desc').limit(50);
  feedUnsub=q.onSnapshot(snap=>{
    if(skel) skel.style.display='none';
    let posts=snap.docs.map(d=>({id:d.id,_type:'post',...d.data()})).filter(p=>!p.status);
    if(filter==='all'||filter==='videos'){
      const tp=posts.filter(p=>isTrading(p.text)&&p.mediaType==='video'), op=posts.filter(p=>!(isTrading(p.text)&&p.mediaType==='video'));
      posts=[...tp,...op];
    }
    let items=[...posts];
    if(filter==='all'){ const prods=allProducts.map(p=>({...p,_type:'product'})); items=mergeByDate([...posts,...prods]); }
    window._feedItems=items; renderFeed(items);
  },()=>{ if(skel) skel.style.display='none'; });
}
function clearFeedPosts(){ const fc=$('feedContainer'); if(!fc) return; qsa('.feed-post',fc).forEach(el=>el.remove()); qs('.feed-empty',fc)?.remove(); }
function mergeByDate(items){ return items.sort((a,b)=>{ const ta=a.createdAt?.toDate?a.createdAt.toDate():new Date(a.createdAt||0), tb=b.createdAt?.toDate?b.createdAt.toDate():new Date(b.createdAt||0); return tb-ta; }); }
function renderFeed(items){
  const fc=$('feedContainer'); if(!fc) return; clearFeedPosts();
  if(!items||!items.length){ const emp=document.createElement('div'); emp.className='feed-empty'; emp.innerHTML='<span class="material-icons-round">feed</span><p>কোনো পোস্ট নেই</p>'; fc.appendChild(emp); return; }
  items.forEach(item=>{ const el=item._type==='product'?buildProductPost(item):buildUserPost(item); if(el) fc.appendChild(el); });
  setupVideoAutoplay();
}
function renderProductsFeed(){ const skel=$('feedSkel'); if(skel) skel.style.display='none'; if(!allProducts.length){ loadFeed('all'); return; } const fc=$('feedContainer'); if(!fc) return; allProducts.forEach(p=>{ const el=buildProductPost({...p,_type:'product'}); if(el) fc.appendChild(el); }); }

/* ── FOLLOW — requires login ── */
async function quickFollow(targetUid,btn){
  if(!currentUser||isGuest){ toast('Follow করতে লগইন করুন','info'); switchSection('profile'); return; }
  if(targetUid===currentUser.uid) return;
  const isNow=btn.classList.contains('following'); btn.disabled=true;
  const docId=currentUser.uid+'_'+targetUid;
  try{
    if(isNow){ await DB.collection('follows').doc(docId).delete(); }
    else{ await DB.collection('follows').doc(docId).set({followerUid:currentUser.uid,followingUid:targetUid,createdAt:TS()}); }
    followingCache[targetUid]=!isNow; localStorage.setItem('sx_following',JSON.stringify(followingCache));
    DB.collection('users').doc(targetUid).update({followers:INC(isNow?-1:1)}).catch(()=>{});
    DB.collection('users').doc(currentUser.uid).update({following:INC(isNow?-1:1)}).catch(()=>{});
    btn.classList.toggle('following',!isNow); btn.textContent=!isNow?'Following':'Follow';
    if(!isNow){ toast('Following!','success'); DB.collection('notifications').add({toUid:targetUid,fromUid:currentUser.uid,fromName:currentUser.displayName||'User',fromPhoto:currentUser.photoURL||'',type:'follow',read:false,createdAt:TS()}).catch(()=>{}); }
    else toast('Unfollowed','info');
  }catch(e){
    followingCache[targetUid]=!isNow; localStorage.setItem('sx_following',JSON.stringify(followingCache));
    btn.classList.toggle('following',!isNow); btn.textContent=!isNow?'Following':'Follow';
    toast(!isNow?'Following!':'Unfollowed','success');
  }
  btn.disabled=false;
}

/* ── SAVE — requires login ── */
async function toggleSave(postId,iconEl){
  if(!currentUser||isGuest){ toast('Save করতে লগইন করুন','info'); switchSection('profile'); return; }
  const isSaved=!!savedPosts[postId]; savedPosts[postId]=!isSaved; localStorage.setItem('sx_saved',JSON.stringify(savedPosts));
  if(iconEl) iconEl.textContent = !isSaved ? 'bookmark' : 'bookmark_border';
  try{ if(!isSaved) await DB.collection('saves').doc(currentUser.uid+'_'+postId).set({userId:currentUser.uid,postId,createdAt:TS()}); else await DB.collection('saves').doc(currentUser.uid+'_'+postId).delete(); }catch(e){}
  toast(!isSaved?'Post saved!':'Removed','success');
}

/* ════════ BUILD POSTS ════════ */
function buildUserPost(post){
  const el=document.createElement('article'); el.className='feed-post'; el.dataset.postId=post.id;
  const liked=!!likedPosts[post.id], isSaved=!!savedPosts[post.id], name=post.userName||'User', isOwn=currentUser&&!isGuest&&post.userId===currentUser.uid;
  const avInner=post.userPhoto&&post.userPhoto.startsWith('http')?`<img src="${esc(post.userPhoto)}" alt="" onerror="this.parentNode.textContent='${name[0].toUpperCase()}'"/>`:`<span>${name[0].toUpperCase()}</span>`;
  const tradeBadge = isTrading(post.text)&&post.mediaType==='video' ? '<span class="trade-badge">📈 TRADING</span>' : '';
  let media='';
  /* FIX: video aspect-ratio class set after metadata loads, no bleed; photo uses natural width */
  if(post.mediaType==='video'&&post.mediaUrl){
    media=`<div class="post-vid-wrap" data-post-id="${post.id}"><video src="${esc(post.mediaUrl)}" preload="metadata" playsinline muted loop poster="${esc(post.thumbnailUrl||'')}"></video><div class="post-vid-play"><div class="post-vid-play-btn"><span class="material-icons-round">play_arrow</span></div></div><div class="vid-buf"><div class="spinner"></div></div><div class="vid-seek-hint"></div></div>`;
  }else if(post.mediaType==='photo'&&post.mediaUrl){
    media=`<img class="post-photo" src="${esc(post.mediaUrl)}" loading="lazy" onerror="this.style.display='none'"/>`;
  }else if(post.mediaType==='audio'&&post.mediaUrl){
    media=`<div class="post-audio">${post.thumbnailUrl?`<img class="audio-thumb" src="${esc(post.thumbnailUrl)}" alt=""/>`:'<div class="audio-play-ic"><span class="material-icons-round">play_arrow</span></div>'}<div class="audio-info"><p class="audio-title">${esc(post.text||'Audio')}</p></div><span class="audio-badge">Audio</span></div>`;
  }
  const badge = post.mediaType==='video'?'<span class="badge bv">VIDEO</span>':post.mediaType==='photo'?'<span class="badge bp">PHOTO</span>':post.mediaType==='audio'?'<span class="badge ba">AUDIO</span>':'<span class="badge bt">TEXT</span>';
  const isFollowingUser=!!followingCache[post.userId];
  const followBtnHtml = (!isOwn&&post.userId) ? `<button class="qfbtn${isFollowingUser?' following':''}" data-uid="${esc(post.userId)}">${isFollowingUser?'Following':'Follow'}</button>` : '';
  el.innerHTML=`
    <div class="post-header" data-uid="${esc(post.userId||'')}">
      <div class="post-av" style="background:${randomColor(post.userId)}">${avInner}</div>
      <div class="post-user-info"><div class="post-uname">${esc(name)} ${badge}${tradeBadge}</div><div class="post-meta">${fmtAgo(post.createdAt)}</div></div>
      <div style="display:flex;align-items:center;gap:6px">${followBtnHtml}<button class="post-more"><span class="material-icons-round">more_horiz</span></button></div>
    </div>
    ${post.text&&post.mediaType!=='audio'?`<div class="post-txt">${linkify(post.text)}</div>`:''}
    ${media}
    <div class="post-footer">
      <button class="pf-btn like-btn${liked?' liked':''}"><span class="material-icons-round">${liked?'favorite':'favorite_border'}</span><span class="like-count">${fmtCount(post.likes||0)}</span></button>
      <button class="pf-btn cmt-btn"><span class="material-icons-round">chat_bubble_outline</span><span>${fmtCount(post.commentCount||0)}</span></button>
      <button class="pf-btn save-btn"><span class="material-icons-round">${isSaved?'bookmark':'bookmark_border'}</span></button>
      <button class="pf-btn share-btn"><span class="material-icons-round">share</span></button>
      <div class="pf-spacer"></div>
      <div class="post-views"><span class="material-icons-round">visibility</span><span>${fmtCount(post.views||0)}</span></div>
    </div>`;
  el.querySelector('.qfbtn')?.addEventListener('click',e=>{ e.stopPropagation(); quickFollow(post.userId,e.currentTarget); });
  el.querySelector('.like-btn').addEventListener('click',e=>{ e.stopPropagation(); handleLike(post.id,el.querySelector('.like-btn'),el.querySelector('.like-count')); });
  el.querySelector('.cmt-btn').addEventListener('click',e=>{ e.stopPropagation(); openComments(post.id); });
  el.querySelector('.save-btn').addEventListener('click',e=>{ e.stopPropagation(); toggleSave(post.id,el.querySelector('.save-btn .material-icons-round')); });
  el.querySelector('.share-btn').addEventListener('click',e=>{ e.stopPropagation(); handleShare(post.id,post.text||'SayatX'); });
  el.querySelector('.post-header').addEventListener('click',ev=>{ if(ev.target.closest('.post-more')||ev.target.closest('.qfbtn')) return; if(post.userId) openUserProfile(post.userId); });
  el.querySelector('.post-more').addEventListener('click',e=>{ e.stopPropagation(); showPostMenu(post,isOwn); });
  /* Video click/drag/buffer */
  const vw=el.querySelector('.post-vid-wrap');
  if(vw){
    const vidEl=vw.querySelector('video'), buf=vw.querySelector('.vid-buf'), hint=vw.querySelector('.vid-seek-hint');
    if(vidEl){
      vidEl.addEventListener('loadedmetadata',()=>{
        if(vidEl.videoWidth && vidEl.videoHeight){
          const r=vidEl.videoWidth/vidEl.videoHeight;
          vw.classList.remove('portrait','landscape','square');
          if(r<0.85) vw.classList.add('portrait'); else if(r>1.15) vw.classList.add('landscape'); else vw.classList.add('square');
        }
      },{once:true});
      vidEl.addEventListener('waiting',()=>buf?.classList.add('on'));
      vidEl.addEventListener('playing',()=>buf?.classList.remove('on'));
      vidEl.addEventListener('canplay',()=>buf?.classList.remove('on'));
    }
    let seekStartX=0, seekStartTime=0, isDragging=false;
    vw.addEventListener('touchstart',e=>{ seekStartX=e.touches[0].clientX; seekStartTime=vidEl?vidEl.currentTime:0; isDragging=false; },{passive:true});
    vw.addEventListener('touchmove',e=>{ const dx=e.touches[0].clientX-seekStartX; if(Math.abs(dx)>15 && vidEl){ isDragging=true; vidEl.currentTime=Math.max(0,Math.min(vidEl.duration||0,seekStartTime+dx*0.15)); if(hint){ hint.textContent=(dx>0?'+':'')+Math.round(dx*0.15)+'s'; hint.classList.add('on'); } } },{passive:true});
    vw.addEventListener('touchend',()=>{ setTimeout(()=>{isDragging=false;},100); if(hint) setTimeout(()=>hint.classList.remove('on'),600); });
    let tt=null, tc=0;
    vw.addEventListener('click',()=>{
      if(isDragging) return; tc++; clearTimeout(tt);
      tt=setTimeout(()=>{
        if(tc===1){ const vids=(window._feedItems||[]).filter(i=>i._type==='post'&&i.mediaType==='video'&&i.mediaUrl); const idx=vids.findIndex(p=>p.id===post.id); openReels(vids.length?vids:[post],Math.max(0,idx)); DB.collection('posts').doc(post.id).update({views:INC(1)}).catch(()=>{}); }
        else if(tc>=2){ handleLike(post.id,el.querySelector('.like-btn'),el.querySelector('.like-count')); showHeartEffect(vw); }
        tc=0;
      },280);
    });
  }
  el.querySelector('.post-audio')?.addEventListener('click',()=>{ openAudioOv(post.mediaUrl,post.text||'Audio',post.thumbnailUrl||''); if(!viewedPosts.has(post.id)){ viewedPosts.add(post.id); DB.collection('posts').doc(post.id).update({views:INC(1)}).catch(()=>{}); } });
  el.querySelector('.post-photo')?.addEventListener('click',()=>{ openPhotoViewer(post.mediaUrl,post.text||'',post); DB.collection('posts').doc(post.id).update({views:INC(1)}).catch(()=>{}); });
  return el;
}

function buildProductPost(product){
  const el=document.createElement('article'); el.className='feed-post';
  const disc=product.originalPrice>product.price?Math.round((1-product.price/product.originalPrice)*100):0;
  const img=(product.images&&product.images[0])||product.image||'';
  el.innerHTML=`<div class="post-header" style="cursor:default"><div class="post-av" style="background:#fff;padding:2px;overflow:hidden"><span style="font-weight:900;color:var(--pr)">SX</span></div><div class="post-user-info"><div class="post-uname">SayatX <span class="badge bprod">PRODUCT</span></div><div class="post-meta">${fmtAgo(product.createdAt)}</div></div></div><div class="post-product"><div class="prod-img-wrap"><img class="prod-img" src="${esc(img)}" loading="lazy" onerror="this.src='https://placehold.co/400x300?text=Product'"/>${disc?`<span class="prod-disc-badge">${disc}% OFF</span>`:''}</div><div class="prod-body"><p class="prod-name">${esc(product.title)}</p><div class="prod-prices"><span class="prod-price">&#x20B9;${fmt(product.price)}</span>${product.originalPrice>product.price?`<span class="prod-orig">&#x20B9;${fmt(product.originalPrice)}</span>`:''}</div><button class="btn-buy"><span class="material-icons-round">flash_on</span>Buy Now — &#x20B9;${fmt(product.price)}</button></div></div><div class="post-footer"><div class="pf-spacer"></div></div>`;
  el.querySelector('.prod-img').addEventListener('click',()=>openPhotoViewer(img,product.title,null));
  el.querySelector('.btn-buy').addEventListener('click',e=>{ e.stopPropagation(); handleBuyNow(product); });
  return el;
}
function handleLike(postId,btn,countEl){
  if(!currentUser||isGuest){ toast('লাইক করতে লগইন করুন','info'); switchSection('profile'); return; }
  const was=!!likedPosts[postId]; likedPosts[postId]=!was; localStorage.setItem('sx_liked',JSON.stringify(likedPosts));
  if(btn){ btn.classList.toggle('liked',!was); const ic=btn.querySelector('.material-icons-round'); if(ic) ic.textContent=was?'favorite_border':'favorite'; }
  if(countEl){ const prev=parseInt(countEl.textContent,10)||0; countEl.textContent=fmtCount(Math.max(0,was?prev-1:prev+1)); }
  DB.collection('posts').doc(postId).update({likes:INC(was?-1:1)}).catch(()=>{});
}
function handleShare(postId,text){ const url=getPostShareUrl(postId); if(navigator.share) navigator.share({title:'SayatX',text,url}).catch(()=>{}); else navigator.clipboard.writeText(url).then(()=>toast('Link কপি হয়েছে!','success')).catch(()=>{}); }
function showHeartEffect(container){
  const h=document.createElement('div'); h.innerHTML='❤️';
  h.style.cssText='position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) scale(0);font-size:78px;z-index:10;pointer-events:none;transition:transform .3s ease,opacity .5s ease .3s;';
  container.style.position='relative'; container.appendChild(h);
  requestAnimationFrame(()=>{ h.style.transform='translate(-50%,-50%) scale(1)'; });
  setTimeout(()=>{ h.style.opacity='0'; setTimeout(()=>h.remove(),500); },800);
}
function showPostMenu(post,isOwn){
  const ex=document.getElementById('postMenuOv'); if(ex) ex.remove();
  const menu=document.createElement('div'); menu.id='postMenuOv'; menu.style.cssText='position:fixed;inset:0;z-index:650;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,.5);';
  const sheet=document.createElement('div'); sheet.style.cssText='background:var(--card);border-radius:20px 20px 0 0;width:100%;max-width:520px;padding:16px 0 calc(env(safe-area-inset-bottom,0px)+16px);';
  const btns=[
    {icon:'share',label:'Share',fn:()=>handleShare(post.id,post.text||'SayatX')},
    {icon:'link',label:'Copy Link',fn:()=>navigator.clipboard.writeText(getPostShareUrl(post.id)).then(()=>toast('কপি হয়েছে!','success')).catch(()=>{})},
    {icon:savedPosts[post.id]?'bookmark':'bookmark_border',label:savedPosts[post.id]?'Remove Saved':'Save Post',fn:()=>toggleSave(post.id,null)},
    {icon:'person',label:'View Profile',fn:()=>{ if(post.userId) openUserProfile(post.userId); }}
  ];
  if(isOwn) btns.push({icon:'delete',label:'Delete Post',fn:()=>deletePost(post.id),danger:true});
  btns.forEach(b=>{
    const btn=document.createElement('button'); btn.style.cssText='display:flex;align-items:center;gap:14px;width:100%;padding:14px 20px;background:none;border:none;cursor:pointer;font-size:.88rem;font-weight:700;color:'+(b.danger?'var(--er)':'var(--txt)')+';';
    btn.innerHTML='<span class="material-icons-round" style="color:'+(b.danger?'var(--er)':'var(--pr)')+'">'+b.icon+'</span>'+esc(b.label);
    btn.addEventListener('click',()=>{ menu.remove(); b.fn(); }); sheet.appendChild(btn);
  });
  const cancel=document.createElement('button'); cancel.style.cssText='display:flex;align-items:center;justify-content:center;width:calc(100% - 32px);margin:8px 16px 0;padding:13px;background:var(--card2);border:none;border-radius:12px;cursor:pointer;font-size:.88rem;font-weight:700;color:var(--txt);'; cancel.textContent='Cancel';
  cancel.addEventListener('click',()=>menu.remove()); sheet.appendChild(cancel);
  menu.appendChild(sheet); menu.addEventListener('click',e=>{ if(e.target===menu) menu.remove(); }); document.body.appendChild(menu);
}
async function deletePost(postId){
  if(!currentUser||isGuest){ toast('লগইন করুন','error'); return; }
  if(!confirm('পোস্ট ডিলিট করবেন?')) return; showLoading('Deleting...');
  try{
    (window._uploadTasks||[]).forEach(t=>{ try{ if(t.snapshot&&t.snapshot.state==='running') t.cancel(); }catch(e){} }); window._uploadTasks=[];
    await DB.collection('posts').doc(postId).delete();
    await DB.collection('users').doc(currentUser.uid).update({postCount:INC(-1)}).catch(()=>{});
    toast('ডিলিট হয়েছে','success'); document.querySelector('[data-post-id="'+postId+'"]')?.remove();
  }catch(e){ toast('Failed: '+e.message,'error',5000); }
  hideLoading();
}
function openPhotoViewer(url,caption,post){
  let ov=document.getElementById('photoViewerOv');
  if(!ov){
    ov=document.createElement('div'); ov.id='photoViewerOv'; ov.style.cssText='position:fixed;inset:0;background:#000;z-index:620;display:flex;flex-direction:column;align-items:center;justify-content:center;';
    ov.innerHTML=`<div style="position:absolute;top:calc(env(safe-area-inset-top,0px)+10px);left:0;right:0;display:flex;align-items:center;justify-content:space-between;padding:0 14px;z-index:2"><button id="pvClose" style="width:34px;height:34px;border-radius:50%;background:rgba(255,255,255,.15);display:flex;align-items:center;justify-content:center;border:none;cursor:pointer"><span class="material-icons-round btn-pulse">close</span></button><button id="pvShare" style="width:34px;height:34px;border-radius:50%;background:rgba(255,255,255,.15);display:flex;align-items:center;justify-content:center;border:none;cursor:pointer"><span class="material-icons-round" style="color:#fff">share</span></button></div><img id="pvImg" style="max-width:100%;max-height:88dvh;object-fit:contain;display:block;width:100%;"/><p id="pvCaption" style="color:rgba(255,255,255,.8);font-size:.84rem;padding:10px 14px;text-align:center;max-width:600px;"></p>`;
    document.body.appendChild(ov);
    ov.querySelector('#pvClose').onclick=()=>{ ov.style.display='none'; document.body.style.overflow=''; };
  }
  ov.querySelector('#pvImg').src=url; ov.querySelector('#pvCaption').textContent=caption||'';
  ov.querySelector('#pvShare').onclick=()=>{ if(post) handleShare(post.id,caption||'SayatX'); };
  ov.style.display='flex'; document.body.style.overflow='hidden';
}
function setupVideoAutoplay(){
  const vids=qsa('.post-vid-wrap video'); if(!vids.length) return;
  const obs=new IntersectionObserver(entries=>{
    entries.forEach(entry=>{
      const v=entry.target;
      if(entry.isIntersecting && entry.intersectionRatio>=0.6){ v._vt=setTimeout(()=>{ v.muted=true; v.play().catch(()=>{}); },1500); }
      else{ clearTimeout(v._vt); v.pause(); v.currentTime=0; }
    });
  },{threshold:0.6});
  vids.forEach(v=>obs.observe(v));
}
function listenProducts(){ DB.collection('products').orderBy('createdAt','desc').onSnapshot(snap=>{ allProducts=snap.docs.map(d=>({id:d.id,...d.data()})); },()=>{}); }

/* ════════ REELS — Fixed vertical scroll (100dvh + snap, overflow contained) ════════ */
function openReels(posts,startIndex){
  startIndex=startIndex||0; currentReelItems=posts;
  const scroll=$('reelScroll'); if(!scroll) return; scroll.innerHTML='';
  posts.forEach((post,i)=>{
    const item=document.createElement('div'); item.className='reel-item'; item.dataset.i=i;
    const liked=!!likedPosts[post.id], isSaved=!!savedPosts[post.id], name=post.userName||'User';
    const av=post.userPhoto&&post.userPhoto.startsWith('http')?`<img src="${esc(post.userPhoto)}" alt="" onerror="this.parentNode.textContent='${name[0].toUpperCase()}'"/>`:name[0].toUpperCase();
    const isOwn=currentUser&&!isGuest&&post.userId===currentUser.uid;
    const isFollowingUser=!!followingCache[post.userId];
    item.innerHTML=`
      <video class="reel-video" src="${esc(post.mediaUrl)}" playsinline loop preload="none" poster="${esc(post.thumbnailUrl||'')}"></video>
      <div class="reel-grad-t"></div><div class="reel-grad-b"></div>
      <div class="reel-top-brand"><span style="color:#fff">Sayat</span><span class="brand-x">X</span></div>
      <button class="reel-close-btn" id="reelCloseI${i}"><span class="material-icons-round">close</span></button>
      <div class="reel-buf" id="rb${i}"><div class="spinner"></div></div>
      <div class="reel-sides">
        <div class="reel-sb reel-av-btn"><div class="reel-av-circle">${av}</div></div>
        ${!isOwn&&post.userId?`<div class="reel-sb reel-follow-btn${isFollowingUser?' rfollowing':''}" data-uid="${esc(post.userId)}"><span class="material-icons-round">${isFollowingUser?'person_remove':'person_add'}</span><span class="reel-sb-count">${isFollowingUser?'Following':'Follow'}</span></div>`:''}
        <div class="reel-sb reel-like-btn${liked?' reel-liked':''}"><span class="material-icons-round">${liked?'favorite':'favorite_border'}</span><span class="reel-sb-count">${fmtCount(post.likes||0)}</span></div>
        <div class="reel-sb reel-cmt-btn"><span class="material-icons-round">chat_bubble_outline</span><span class="reel-sb-count">${fmtCount(post.commentCount||0)}</span></div>
        <div class="reel-sb reel-save-btn${isSaved?' reel-saved':''}"><span class="material-icons-round">${isSaved?'bookmark':'bookmark_border'}</span><span class="reel-sb-count">${isSaved?'Saved':'Save'}</span></div>
        <div class="reel-sb reel-share-btn"><span class="material-icons-round">share</span><span class="reel-sb-count">Share</span></div>
      </div>
      <div class="reel-info">
        <div class="reel-info-user"><span class="material-icons-round">account_circle</span>${esc(name)}</div>
        <p class="reel-info-txt">${esc(post.text||'')}</p>
      </div>
      <div class="reel-seek"><div class="reel-seek-track"><div class="reel-seek-fill"></div><div class="reel-seek-dot"></div></div></div>
      <div class="reel-seek-hint" id="rsh${i}"></div>`;
    const vid=item.querySelector('.reel-video'); vid.muted=false;
    item.querySelector('#reelCloseI'+i).addEventListener('click',e=>{ e.stopPropagation(); closeReels(); });
    const buf=item.querySelector('#rb'+i);
    if(buf){ vid.addEventListener('waiting',()=>buf.classList.add('on')); vid.addEventListener('playing',()=>buf.classList.remove('on')); vid.addEventListener('canplay',()=>buf.classList.remove('on')); }
    const seekFill=item.querySelector('.reel-seek-fill'), seekDot=item.querySelector('.reel-seek-dot');
    vid.addEventListener('timeupdate',()=>{ if(vid.duration && seekFill){ const pct=(vid.currentTime/vid.duration)*100; seekFill.style.width=pct+'%'; if(seekDot) seekDot.style.right=(100-pct)+'%'; } });
    const seekHint=item.querySelector('#rsh'+i);
    let seekStartX=0, seekStartTime=0, isDragging=false;
    vid.addEventListener('touchstart',e=>{ seekStartX=e.touches[0].clientX; seekStartTime=vid.currentTime; isDragging=false; },{passive:true});
    vid.addEventListener('touchmove',e=>{ const dx=e.touches[0].clientX-seekStartX; if(Math.abs(dx)>15){ isDragging=true; vid.currentTime=Math.max(0,Math.min(vid.duration||0,seekStartTime+dx*0.15)); if(seekHint){ seekHint.textContent=(dx>0?'+':'')+Math.round(dx*0.15)+'s'; seekHint.classList.add('on'); } } },{passive:true});
    vid.addEventListener('touchend',()=>{ isDragging=false; if(seekHint) setTimeout(()=>seekHint.classList.remove('on'),600); });
    let tt=null, tc=0;
    item.addEventListener('click',e=>{
      if(isDragging) return;
      if(e.target.closest('.reel-sides')||e.target.closest('.reel-info-user')||e.target.closest('.reel-seek')||e.target.closest('.reel-close-btn')) return;
      tc++; clearTimeout(tt);
      tt=setTimeout(()=>{
        if(tc===1){ if(vid.paused) vid.play().catch(()=>{}); else vid.pause(); }
        else if(tc>=2){ handleReelLike(post.id,item.querySelector('.reel-like-btn')); showHeartEffect(item); }
        tc=0;
      },280);
    });
    item.querySelector('.reel-like-btn').addEventListener('click',e=>{ e.stopPropagation(); handleReelLike(post.id,e.currentTarget); });
    item.querySelector('.reel-cmt-btn').addEventListener('click',e=>{ e.stopPropagation(); openCommentsHalf(post.id); });
    item.querySelector('.reel-share-btn').addEventListener('click',e=>{ e.stopPropagation(); handleShare(post.id,post.text||'SayatX'); });
    item.querySelector('.reel-save-btn').addEventListener('click',e=>{
      e.stopPropagation(); const btn=e.currentTarget, nowSaved=!!savedPosts[post.id];
      toggleSave(post.id,null); savedPosts[post.id]=!nowSaved;
      btn.classList.toggle('reel-saved',!nowSaved);
      const ic=btn.querySelector('.material-icons-round'), lbl=btn.querySelector('.reel-sb-count');
      if(ic) ic.textContent=!nowSaved?'bookmark':'bookmark_border'; if(lbl) lbl.textContent=!nowSaved?'Saved':'Save';
    });
    const rfb=item.querySelector('.reel-follow-btn');
    if(rfb){ rfb.addEventListener('click',e=>{
      e.stopPropagation(); const uid=rfb.dataset.uid;
      if(!currentUser||isGuest){ toast('Follow করতে লগইন করুন','info'); switchSection('profile'); return; }
      if(!uid) return; const isNow=rfb.classList.contains('rfollowing');
      followingCache[uid]=!isNow; localStorage.setItem('sx_following',JSON.stringify(followingCache));
      const ic=rfb.querySelector('.material-icons-round'), lbl=rfb.querySelector('.reel-sb-count');
      if(ic) ic.textContent=!isNow?'person_remove':'person_add'; if(lbl) lbl.textContent=!isNow?'Following':'Follow';
      rfb.classList.toggle('rfollowing',!isNow);
      const docId=currentUser.uid+'_'+uid;
      (!isNow ? DB.collection('follows').doc(docId).set({followerUid:currentUser.uid,followingUid:uid,createdAt:TS()}) : DB.collection('follows').doc(docId).delete()).catch(()=>{});
      DB.collection('users').doc(uid).update({followers:INC(!isNow?1:-1)}).catch(()=>{});
      DB.collection('users').doc(currentUser.uid).update({following:INC(!isNow?1:-1)}).catch(()=>{});
      toast(!isNow?'Following!':'Unfollowed','success');
    }); }
    const gp=()=>{ if(post.userId){ closeReels(); setTimeout(()=>openUserProfile(post.userId),200); } };
    item.querySelector('.reel-av-btn').addEventListener('click',e=>{ e.stopPropagation(); gp(); });
    item.querySelector('.reel-info-user').addEventListener('click',e=>{ e.stopPropagation(); gp(); });
    scroll.appendChild(item);
  });
  $('reelOv')?.classList.add('open'); document.body.style.overflow='hidden';
  if(currentReelObs) currentReelObs.disconnect();
  currentReelObs=new IntersectionObserver(entries=>{
    entries.forEach(entry=>{
      const v=entry.target.querySelector('.reel-video'), fill=entry.target.querySelector('.reel-seek-fill');
      if(entry.isIntersecting){
        v.play().catch(()=>{});
        const idx=parseInt(entry.target.dataset.i,10), p=currentReelItems[idx];
        if(p && !viewedPosts.has(p.id)){ viewedPosts.add(p.id); DB.collection('posts').doc(p.id).update({views:INC(1)}).catch(()=>{}); }
      }else{ v.pause(); v.currentTime=0; if(fill) fill.style.width='0%'; }
    });
  },{threshold:0.6});
  qsa('.reel-item',scroll).forEach(it=>currentReelObs.observe(it));
  /* FIX: scroll happens AFTER items mount in DOM, with proper offset */
  if(startIndex>0){
    requestAnimationFrame(()=>{
      const items=qsa('.reel-item',scroll);
      if(items[startIndex]) scroll.scrollTop = items[startIndex].offsetTop;
    });
  }
}
function handleReelLike(postId,btn){
  if(!currentUser||isGuest){ toast('লাইক করতে লগইন করুন','info'); switchSection('profile'); return; }
  const was=btn.classList.contains('reel-liked'); likedPosts[postId]=!was; localStorage.setItem('sx_liked',JSON.stringify(likedPosts));
  btn.classList.toggle('reel-liked',!was); const ic=btn.querySelector('.material-icons-round'); if(ic) ic.textContent=was?'favorite_border':'favorite';
  const c=btn.querySelector('.reel-sb-count'); if(c) c.textContent=fmtCount(Math.max(0,(parseInt(c.textContent)||0)+(was?-1:1)));
  DB.collection('posts').doc(postId).update({likes:INC(was?-1:1)}).catch(()=>{});
}
function closeReels(){
  $('reelOv')?.classList.remove('open'); document.body.style.overflow='';
  const sc=$('reelScroll'); if(sc){ qsa('.reel-video',sc).forEach(v=>{v.pause();v.src='';}); sc.innerHTML=''; }
  if(currentReelObs){ currentReelObs.disconnect(); currentReelObs=null; }
}

/* ── COMMENTS HALF (in reel) ── */
function openCommentsHalf(postId){
  commentsPostId=postId; $('cmHalfOv')?.classList.add('open');
  loadHalfComments(postId);
}
on('cmHalfClose','click',()=>{ $('cmHalfOv')?.classList.remove('open'); });
on('cmHalfBg','click',()=>{ $('cmHalfOv')?.classList.remove('open'); });
on('cmHalfSend','click',sendHalfComment);
on('cmHalfInp','keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); sendHalfComment(); } });
function loadHalfComments(postId){
  const list=$('cmHalfList'); if(!list) return; list.innerHTML='<div class="pdf-loading"><div class="spinner"></div></div>';
  DB.collection('posts').doc(postId).collection('comments').orderBy('createdAt','desc').limit(50).get().then(snap=>{
    list.innerHTML=''; if(!snap.size){ list.innerHTML='<div style="text-align:center;padding:24px;color:var(--tm)">কোনো কমেন্ট নেই</div>'; return; }
    snap.docs.forEach(doc=>{
      const c=doc.data(); const el=document.createElement('div'); el.style.cssText='display:flex;gap:9px;align-items:flex-start;padding:8px 14px;';
      const cn=c.userName||'User'; const avHtml=c.userPhoto?'<img src="'+esc(c.userPhoto)+'" style="width:100%;height:100%;object-fit:cover" alt=""/>':cn[0].toUpperCase();
      el.innerHTML='<div style="width:32px;height:32px;border-radius:50%;background:'+randomColor(c.userId)+';display:flex;align-items:center;justify-content:center;color:#fff;font-weight:900;font-size:.84rem;flex-shrink:0;overflow:hidden">'+avHtml+'</div><div><p style="font-weight:800;font-size:.8rem;color:var(--txt)">'+esc(cn)+'</p><p style="font-size:.83rem;color:var(--txt);word-break:break-word">'+esc(c.text)+'</p></div>';
      list.appendChild(el);
    });
  }).catch(()=>{});
}
function sendHalfComment(){
  if(!currentUser||isGuest){ toast('কমেন্ট করতে লগইন করুন','info'); return; }
  if(!commentsPostId) return; const inp=$('cmHalfInp'); if(!inp) return;
  const text=inp.value.trim(); if(!text) return; inp.value='';
  const name=currentUser.displayName||'User';
  DB.collection('posts').doc(commentsPostId).collection('comments').add({userId:currentUser.uid,userName:name,userPhoto:currentUser.photoURL||'',text,createdAt:TS()})
    .then(()=>{ DB.collection('posts').doc(commentsPostId).update({commentCount:INC(1)}).catch(()=>{}); loadHalfComments(commentsPostId); })
    .catch(e=>toast('Failed: '+e.message,'error'));
}

/* ── AUDIO OVERLAY ── */
const audioEl=$('audioEl'); let audioPlaying=false;
function openAudioOv(url,title,cover){
  if(!audioEl) return; audioEl.src=url; audioEl.load();
  setText('audioTitle',title||'Audio'); setText('audioArtist','SayatX');
  const img=cover||'https://placehold.co/200x200?text=Audio'; const ai=$('audioAlbumArt'), bg=$('audioOvBg');
  if(ai) ai.src=img; if(bg) bg.style.backgroundImage='url('+img+')';
  const sf=$('audioFill'), si=$('audioSeek'); if(sf) sf.style.width='0%'; if(si) si.value=0;
  setText('audioCurrentTime','0:00'); setText('audioDuration','0:00'); audioPlaying=false;
  const pb=$('audioPlayBtn'); if(pb) pb.querySelector('.material-icons-round').textContent='play_arrow';
  $('audioOv')?.classList.add('open'); document.body.style.overflow='hidden';
}
function closeAudioOv(){ if(audioEl){ audioEl.pause(); audioEl.src=''; } $('audioOv')?.classList.remove('open'); document.body.style.overflow=''; audioPlaying=false; }
on('audioCloseBtn','click',closeAudioOv);
on('audioPlayBtn','click',()=>{ if(!audioEl) return; const ic=$('audioPlayBtn')?.querySelector('.material-icons-round'); if(audioPlaying){ audioEl.pause(); audioPlaying=false; if(ic) ic.textContent='play_arrow'; } else { audioEl.play().catch(e=>toast('Cannot play: '+e.message,'error')); audioPlaying=true; if(ic) ic.textContent='pause'; } });
on('audioPrev10','click',()=>{ if(audioEl) audioEl.currentTime=Math.max(0,audioEl.currentTime-10); });
on('audioFwd10','click',()=>{ if(audioEl) audioEl.currentTime=Math.min(audioEl.duration||0,audioEl.currentTime+10); });
if(audioEl){
  audioEl.addEventListener('timeupdate',()=>{ if(!audioEl.duration) return; const pct=(audioEl.currentTime/audioEl.duration)*100; const sf=$('audioFill'), si=$('audioSeek'); if(sf) sf.style.width=pct+'%'; if(si) si.value=pct; setText('audioCurrentTime',fmtTime(audioEl.currentTime)); });
  audioEl.addEventListener('loadedmetadata',()=>setText('audioDuration',fmtTime(audioEl.duration)));
  audioEl.addEventListener('ended',()=>{ audioPlaying=false; const ic=$('audioPlayBtn')?.querySelector('.material-icons-round'); if(ic) ic.textContent='play_arrow'; });
}
on('audioSeek','input',e=>{ if(audioEl&&audioEl.duration) audioEl.currentTime=(e.target.value/100)*audioEl.duration; });

/* ── VIDEO OVERLAY ── */
function openVideoOv(url,title){ const vid=$('videoPlayer'); if(!vid) return; vid.src=url; setText('videoOvTitle',title||'Video'); $('videoOv')?.classList.add('open'); document.body.style.overflow='hidden'; vid.play().catch(()=>{}); }
function closeVideoOv(){ const vid=$('videoPlayer'); if(vid){vid.pause();vid.src='';} $('videoOv')?.classList.remove('open'); document.body.style.overflow=''; }
on('videoCloseBtn','click',closeVideoOv);

/* ── PDF ── */
let pdfDoc=null;
function openPdfReader(url,title){
  setText('pdfTitle',title||'Document'); setText('pdfPageCount',''); setHTML('pdfPages','<div class="pdf-loading"><div class="spinner"></div><p>Loading...</p></div>');
  $('pdfOv')?.classList.add('open'); document.body.style.overflow='hidden';
  if(typeof pdfjsLib==='undefined'){ toast('PDF viewer unavailable','error'); return; }
  pdfjsLib.getDocument({url}).promise.then(pdf=>{
    pdfDoc=pdf; setText('pdfPageCount',pdf.numPages+' pages'); setHTML('pdfPages','');
    const render=i=>{ if(i>pdf.numPages) return; pdf.getPage(i).then(page=>{
      const scale=Math.min(window.innerWidth/page.getViewport({scale:1}).width,1.5); const vp=page.getViewport({scale});
      const canvas=document.createElement('canvas'); canvas.className='pdf-page-canvas'; canvas.width=vp.width; canvas.height=vp.height;
      page.render({canvasContext:canvas.getContext('2d'),viewport:vp}).promise.then(()=>{
        const wrap=document.createElement('div'); wrap.innerHTML='<div class="pdf-page-num">Page '+i+'</div>'; wrap.insertBefore(canvas,wrap.firstChild); $('pdfPages')?.appendChild(wrap); render(i+1);
      });
    }); }; render(1);
  }).catch(e=>setHTML('pdfPages','<div class="pdf-loading"><p>Failed: '+esc(e.message)+'</p></div>'));
}
function closePdfReader(){ $('pdfOv')?.classList.remove('open'); document.body.style.overflow=''; if(pdfDoc){pdfDoc.destroy();pdfDoc=null;} setHTML('pdfPages',''); }
on('pdfCloseBtn','click',closePdfReader);

/* ════════ CREATE POST — Fixed: file persists across tab switches, thumbnail uploads properly ════════ */
on('fab','click',openCreateSheet);
on('createCloseBtn','click',closeCreateSheet);
on('createSheetBg','click',closeCreateSheet);
on('cancelCreateBtn','click',closeCreateSheet);
on('goLoginBtn','click',()=>{ closeCreateSheet(); switchSection('profile'); });

function openCreateSheet(){
  if(!currentUser||isGuest){
    setStyle('createLoginPrompt','display','flex'); setStyle('createForm','display','none'); setStyle('createFooter','display','none');
  }else{
    setStyle('createLoginPrompt','display','none'); setStyle('createForm','display','block'); setStyle('createFooter','display','flex');
    const name=currentUser.displayName||'User'; const av=$('createAv');
    if(av){ if(currentUser.photoURL) av.innerHTML='<img src="'+esc(currentUser.photoURL)+'" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>'; else av.textContent=name[0].toUpperCase(); }
    setText('createUname',name);
  }
  $('createSheet')?.classList.add('open'); document.body.style.overflow='hidden';
  setCreateTab('text');
}
function closeCreateSheet(){ $('createSheet')?.classList.remove('open'); document.body.style.overflow=''; resetCreateForm(); }
function resetCreateForm(){
  const ta=$('createTa'); if(ta) ta.value='';
  if(createMediaBlob){ URL.revokeObjectURL(createMediaBlob); createMediaBlob=null; }
  if(createThumbBlob){ URL.revokeObjectURL(createThumbBlob); createThumbBlob=null; }
  createMediaFile=null; createThumbFile=null;
  setStyle('mediaPreview','display','none'); setStyle('uploadZone','display','none');
  const pi=$('mediaPreviewImg'), pv=$('mediaPreviewVid'), pa=$('audioPreviewRow');
  if(pi){pi.src='';pi.style.display='none';} if(pv){pv.src='';pv.style.display='none';} if(pa) pa.style.display='none';
  if($('mediaInput')) $('mediaInput').value='';
  const tw=$('thumbPreviewWrap'); if(tw) tw.style.display='none';
  if($('thumbInput')) $('thumbInput').value='';
}

/* FIX: Tab switching does NOT clear the already-selected media file.
   Previously, switching from "video" tab to "photo" tab and back cleared state
   incorrectly or showed wrong preview. Now we preserve createMediaFile per type
   and only reset zone visuals, not the actual file unless type actually changes
   to a DIFFERENT media kind requiring new file. */
function setCreateTab(type){
  const prevType=createPostType;
  createPostType=type;
  qsa('.ptype-tab').forEach(btn=>btn.classList.toggle('active',btn.dataset.type===type));
  const zone=$('uploadZone'), uzText=$('uzText'), uzHint=$('uzHint'), mi=$('mediaInput'), ts=$('thumbSection');
  if(!zone) return;
  if(type==='text'){
    zone.style.display='none'; if(ts) ts.style.display='none';
    /* clear any selected media when going to text */
    if(prevType!=='text'){
      if(createMediaBlob){URL.revokeObjectURL(createMediaBlob);createMediaBlob=null;}
      createMediaFile=null; setStyle('mediaPreview','display','none'); setStyle('uploadZone','display','none');
    }
    return;
  }
  zone.style.display='flex';
  if(ts) ts.style.display = ['video','audio'].includes(type) ? 'block':'none';
  /* If switching between media types (video<->photo<->audio), clear old file since accept differs */
  if(prevType!==type && prevType!=='text'){
    if(createMediaBlob){URL.revokeObjectURL(createMediaBlob);createMediaBlob=null;}
    createMediaFile=null; setStyle('mediaPreview','display','none'); setStyle('uploadZone','display','flex');
    if(createThumbBlob){URL.revokeObjectURL(createThumbBlob);createThumbBlob=null;} createThumbFile=null;
    const tw=$('thumbPreviewWrap'); if(tw) tw.style.display='none';
  }
  if(type==='photo'){ if(uzText) uzText.textContent='ছবি বাছাই করুন'; if(uzHint) uzHint.textContent='JPG, PNG — Max 20MB'; if(mi) mi.accept='image/*'; }
  else if(type==='video'){ if(uzText) uzText.textContent='ভিডিও বাছাই করুন'; if(uzHint) uzHint.textContent='MP4 — Max 5GB'; if(mi) mi.accept='video/*'; const tb=$('thumbPickBtn'); if(tb) tb.innerHTML='<span class="material-icons-round" style="font-size:15px">video_camera_back</span>&nbsp;Pick frame from video'; }
  else if(type==='audio'){ if(uzText) uzText.textContent='অডিও বাছাই করুন'; if(uzHint) uzHint.textContent='MP3, WAV — Max 5GB'; if(mi) mi.accept='audio/*'; const tb=$('thumbPickBtn'); if(tb) tb.innerHTML='<span class="material-icons-round" style="font-size:15px">add_photo_alternate</span>&nbsp;Choose thumbnail image'; }
}
qsa('.ptype-tab').forEach(btn=>btn.addEventListener('click',()=>setCreateTab(btn.dataset.type)));
function triggerMediaInput(){ $('mediaInput')?.click(); }

/* Thumbnail pick button: video → frame picker, audio → file picker */
on('thumbPickBtn','click',()=>{
  if(createPostType==='video' && createMediaFile){
    openVideoThumbPicker(createMediaFile,blob=>{
      createThumbFile=new File([blob],'thumb.jpg',{type:'image/jpeg'});
      if(createThumbBlob) URL.revokeObjectURL(createThumbBlob);
      createThumbBlob=URL.createObjectURL(createThumbFile);
      const w=$('thumbPreviewWrap'), img=$('thumbPreviewImg');
      if(w) w.style.display='inline-block'; if(img) img.src=createThumbBlob;
      toast('থাম্বনেইল সিলেক্ট হয়েছে!','success');
    });
  }else{
    $('thumbInput')?.click();
  }
});
on('thumbInput','change',e=>{
  const file=e.target.files&&e.target.files[0]; if(!file) return;
  if(file.size>5*1024*1024){ toast('Max 5MB','error'); return; }
  createThumbFile=file; if(createThumbBlob) URL.revokeObjectURL(createThumbBlob); createThumbBlob=URL.createObjectURL(file);
  const w=$('thumbPreviewWrap'), img=$('thumbPreviewImg'); if(w) w.style.display='inline-block'; if(img) img.src=createThumbBlob;
});
on('removeThumbBtn','click',()=>{ if(createThumbBlob){URL.revokeObjectURL(createThumbBlob);createThumbBlob=null;} createThumbFile=null; const w=$('thumbPreviewWrap'); if(w) w.style.display='none'; if($('thumbInput')) $('thumbInput').value=''; });

on('mediaInput','change',e=>{
  const file=e.target.files&&e.target.files[0]; if(!file) return;
  const maxMB = createPostType==='photo' ? 20 : 5000;
  if(file.size > maxMB*1024*1024){ toast('Max '+maxMB+'MB allowed','error'); e.target.value=''; return; }
  createMediaFile=file;
  if(createMediaBlob) URL.revokeObjectURL(createMediaBlob); createMediaBlob=URL.createObjectURL(file);
  setStyle('uploadZone','display','none'); setStyle('mediaPreview','display','block');
  const pi=$('mediaPreviewImg'), pv=$('mediaPreviewVid'), pa=$('audioPreviewRow'), pan=$('audioFileName');
  if(createPostType==='photo'){ if(pi){pi.src=createMediaBlob;pi.style.display='block';} if(pv) pv.style.display='none'; if(pa) pa.style.display='none'; }
  else if(createPostType==='video'){ if(pv){pv.src=createMediaBlob;pv.style.display='block';} if(pi) pi.style.display='none'; if(pa) pa.style.display='none'; }
  else if(createPostType==='audio'){ if(pa) pa.style.display='flex'; if(pan) pan.textContent=file.name; if(pi) pi.style.display='none'; if(pv) pv.style.display='none'; }
});
on('removeMediaBtn','click',()=>{ if(createMediaBlob){URL.revokeObjectURL(createMediaBlob);createMediaBlob=null;} createMediaFile=null; setStyle('mediaPreview','display','none'); setStyle('uploadZone','display','flex'); if($('mediaInput')) $('mediaInput').value=''; });

/* SUBMIT — FIX: upload sequence: thumbnail file uploaded first (or generated), then main media.
   Upload continues via Firebase resumable upload task even if screen is locked / app backgrounded,
   because uploadFile() resumes the task on visibilitychange and Firebase SDK keeps the underlying
   XHR connection alive in background on most browsers; we also persist progress to Firestore. */
on('submitCreateBtn','click',async()=>{
  if(!currentUser||isGuest){ toast('পোস্ট করতে লগইন করুন','error'); return; }
  const text=(($('createTa')||{}).value||'').trim();
  const file=createMediaFile;
  if(!text && !file){ toast('কিছু লিখুন বা মিডিয়া যোগ করুন','error'); return; }
  const btn=$('submitCreateBtn'); if(btn) btn.disabled=true;
  const name=currentUser.displayName||'User';
  const myThumbFile=createThumbFile, myMediaFile=file, myType=createPostType;
  closeCreateSheet(); switchSection('home');
  let docRef=null;
  try{
    docRef=await DB.collection('posts').add({userId:currentUser.uid,userName:name,userPhoto:currentUser.photoURL||'',text:text||'',mediaType:myMediaFile?myType:'text',mediaUrl:null,thumbnailUrl:null,likes:0,commentCount:0,views:0,status:'uploading',uploadPct:0,createdAt:TS()});
    await DB.collection('users').doc(currentUser.uid).update({postCount:INC(1)}).catch(()=>{});
  }catch(e){ toast('Post failed: '+e.message,'error',5000); if(btn) btn.disabled=false; return; }
  if(!myMediaFile){ await docRef.update({status:DEL()}).catch(()=>{}); if(btn) btn.disabled=false; return; }
  let liveToast=toast('আপলোড হচ্ছে... 0%','info',300000);
  try{
    const folder = myType==='video' ? 'posts/videos/' : myType==='audio' ? 'posts/audios/' : 'posts/photos/';
    let thumbUrl=null;
    /* Step 1: upload thumbnail (user-picked or auto-generated) */
    if(myThumbFile){ thumbUrl=await uploadFile(myThumbFile,'posts/thumbs/',()=>{}); }
    else if(myType==='video'){
      try{ const tb=await generateVideoThumbnail(myMediaFile); if(tb){ const tf=new File([tb],'thumb.jpg',{type:'image/jpeg'}); thumbUrl=await uploadFile(tf,'posts/thumbs/',()=>{}); } }catch(e){}
    }
    /* Step 2: upload the main media file (this is the long one) */
    const mediaUrl=await uploadFile(myMediaFile,folder,async pct=>{
      if(pct%5===0 && docRef){ try{ await docRef.update({uploadPct:pct}); }catch(e){} }
      if(liveToast && liveToast.isConnected) liveToast.textContent='আপলোড হচ্ছে... '+pct+'%';
    });
    if(myType==='photo') thumbUrl=mediaUrl;
    await docRef.update({mediaUrl,thumbnailUrl:thumbUrl||null,uploadPct:DEL(),status:DEL()});
    if(liveToast && liveToast.isConnected) liveToast.remove();
    toast('পোস্ট পাবলিশ হয়েছে!','success');
  }catch(err){
    if(liveToast && liveToast.isConnected) liveToast.remove();
    if(docRef) docRef.update({status:'failed',uploadPct:DEL()}).catch(()=>{});
    toast('আপলোড ব্যর্থ: '+(err.message||err.code),'error',5000);
  }
  if(btn) btn.disabled=false;
});

/* ════════ COMMENTS (full sheet) ════════ */
function openComments(postId){
  commentsPostId=postId; setHTML('commentsList','<div class="pdf-loading"><div class="spinner"></div></div>');
  const ci=$('commentsInput'); if(ci) ci.value='';
  if(currentUser && !isGuest){ const name=currentUser.displayName||'User'; const av=$('cmInputAv'); if(av){ if(currentUser.photoURL) av.innerHTML='<img src="'+esc(currentUser.photoURL)+'" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>'; else av.textContent=name[0].toUpperCase(); } }
  $('commentsSheet')?.classList.add('open'); document.body.style.overflow='hidden';
  DB.collection('posts').doc(postId).collection('comments').orderBy('createdAt','desc').limit(50).get().then(snap=>{
    const list=$('commentsList'); if(!list) return; list.innerHTML='';
    if(!snap.size){ list.innerHTML='<div style="text-align:center;padding:30px;color:var(--tm)"><span class="material-icons-round" style="font-size:34px;opacity:.3">chat_bubble_outline</span><p>কোনো কমেন্ট নেই</p></div>'; return; }
    snap.docs.forEach(doc=>{
      const c=Object.assign({id:doc.id},doc.data()); const el=document.createElement('div'); el.className='comment-item';
      const cn=c.userName||'User'; const av=c.userPhoto?'<img src="'+esc(c.userPhoto)+'" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>':cn[0].toUpperCase();
      el.innerHTML='<div class="cm-av" style="background:'+randomColor(c.userId)+'">'+av+'</div><div class="cm-bubble"><span class="cm-uname">'+esc(cn)+'</span><span class="cm-time">'+fmtAgo(c.createdAt)+'</span><p class="cm-text">'+esc(c.text)+'</p></div>';
      list.appendChild(el);
    });
  }).catch(()=>{});
}
function closeComments(){ $('commentsSheet')?.classList.remove('open'); document.body.style.overflow=''; commentsPostId=null; }
on('commentsClose','click',closeComments); on('commentsBg','click',closeComments);
on('commentsSendBtn','click',()=>{
  if(!currentUser||isGuest){ toast('কমেন্ট করতে লগইন করুন','info'); return; }
  if(!commentsPostId) return; const ci=$('commentsInput'); const text=(ci?ci.value:'').trim(); if(!text) return; if(ci) ci.value='';
  const name=currentUser.displayName||'User';
  DB.collection('posts').doc(commentsPostId).collection('comments').add({userId:currentUser.uid,userName:name,userPhoto:currentUser.photoURL||'',text,createdAt:TS()})
    .then(()=>{ DB.collection('posts').doc(commentsPostId).update({commentCount:INC(1)}).catch(()=>{}); openComments(commentsPostId); })
    .catch(e=>toast('Failed: '+e.message,'error'));
});
on('commentsInput','keydown',e=>{ if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); $('commentsSendBtn')?.click(); } });

/* ════════ USER PROFILE OVERLAY ════════ */
function buildFbPostItem(p,userInfo){
  const el=document.createElement('div');el.className='fb-post';
  const name=userInfo.name||'User';
  const avHtml=userInfo.photoURL&&userInfo.photoURL.startsWith('http')?`<img src="${esc(userInfo.photoURL)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%" onerror="this.outerHTML='${name[0].toUpperCase()}'"/>`:name[0].toUpperCase();
  if(p.status==='uploading'||p.status==='failed'){
    el.innerHTML=`<div class="fb-post-hdr"><div class="fb-post-av" style="background:${randomColor(userInfo.uid)}">${avHtml}</div><div style="flex:1"><p style="font-weight:800;font-size:.86rem;color:var(--txt)">${esc(p.text||p.mediaType||'Post')}</p>${p.status==='failed'?'<p style="font-size:.72rem;color:var(--er)">Upload failed</p>':`<div style="margin-top:4px"><div style="height:3px;background:var(--bdr2);border-radius:2px"><div class="fb-proc-bar" style="width:${p.uploadPct||0}%"></div></div><p style="font-size:.7rem;color:var(--tm);margin-top:2px">Processing... ${p.uploadPct||0}%</p></div>`}</div><button class="fb-del-btn" id="del${p.id}"><span class="material-icons-round" style="font-size:16px">delete</span></button></div>`;
    el.querySelector('#del'+p.id)?.addEventListener('click',()=>{ if(confirm('Delete?')){ DB.collection('posts').doc(p.id).delete().then(()=>{ DB.collection('users').doc(userInfo.uid).update({postCount:INC(-1)}).catch(()=>{}); el.remove(); toast('Deleted','success'); }).catch(e=>toast('Failed: '+e.message,'error')); } });
    return el;
  }
  const isSaved=!!savedPosts[p.id];
  let mediaHtml='';
  if(p.mediaType==='video'&&p.thumbnailUrl) mediaHtml=`<div class="fb-vid-wrap" style="position:relative;cursor:pointer"><img src="${esc(p.thumbnailUrl)}" style="width:100%;height:auto;display:block;max-height:280px;object-fit:cover;"/><div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.22)"><div style="width:50px;height:50px;border-radius:50%;background:rgba(255,255,255,.9);display:flex;align-items:center;justify-content:center"><span class="material-icons-round" style="font-size:27px;color:#000">play_arrow</span></div></div></div>`;
  else if(p.mediaType==='photo'&&p.mediaUrl) mediaHtml=`<img class="fb-photo" src="${esc(p.mediaUrl)}" loading="lazy" style="max-height:300px;object-fit:cover;"/>`;
  else if(p.mediaType==='audio') mediaHtml=`<div class="fb-au" style="display:flex;align-items:center;gap:12px;padding:12px 14px;background:var(--card2);margin:0 14px;border-radius:12px;cursor:pointer">${p.thumbnailUrl?`<img src="${esc(p.thumbnailUrl)}" style="width:46px;height:46px;border-radius:9px;object-fit:cover"/>`:`<div style="width:46px;height:46px;border-radius:9px;background:var(--pr);display:flex;align-items:center;justify-content:center;color:#fff"><span class="material-icons-round">headphones</span></div>`}<p style="font-weight:700;font-size:.84rem;color:var(--txt)">${esc(p.text||'Audio')}</p></div>`;
  el.innerHTML=`<div class="fb-post-hdr"><div class="fb-post-av" style="background:${randomColor(userInfo.uid)}">${avHtml}</div><div style="flex:1"><p style="font-weight:800;font-size:.86rem;color:var(--txt)">${esc(name)}</p><p style="font-size:.72rem;color:var(--tm)">${fmtAgo(p.createdAt)}</p></div><button class="fb-3dot"><span class="material-icons-round" style="font-size:17px">more_vert</span></button></div>${p.text&&p.mediaType!=='audio'?`<p style="padding:0 14px 10px;font-size:.85rem;color:var(--txt);white-space:pre-wrap;line-height:1.5">${linkify(p.text)}</p>`:''}${mediaHtml}<div style="display:flex;gap:14px;padding:10px 14px 0;align-items:center"><span style="font-size:.76rem;color:var(--tm);display:flex;align-items:center;gap:3px"><span class="material-icons-round" style="font-size:14px">favorite</span>${fmtCount(p.likes||0)}</span><span style="font-size:.76rem;color:var(--tm);display:flex;align-items:center;gap:3px"><span class="material-icons-round" style="font-size:14px">visibility</span>${fmtCount(p.views||0)}</span><span style="flex:1"></span><button class="fb-save" style="background:none;border:none;cursor:pointer;color:${isSaved?'var(--pr)':'var(--tm)'}"><span class="material-icons-round" style="font-size:17px">${isSaved?'bookmark':'bookmark_border'}</span></button></div>`;
  el.querySelector('.fb-post-av').addEventListener('click',()=>openUserProfile(userInfo.uid));
  el.querySelector('.fb-vid-wrap')?.addEventListener('click',()=>{ const uVids=(window._profileVideos&&window._profileVideos[userInfo.uid])||[p]; const idx=uVids.findIndex(v=>v.id===p.id); openReels(uVids,Math.max(0,idx)); });
  el.querySelector('.fb-photo')?.addEventListener('click',()=>openPhotoViewer(p.mediaUrl,p.text||'',p));
  el.querySelector('.fb-au')?.addEventListener('click',()=>openAudioOv(p.mediaUrl,p.text||'Audio',p.thumbnailUrl||''));
  el.querySelector('.fb-save')?.addEventListener('click',e=>{ e.stopPropagation(); const btn=e.currentTarget; toggleSave(p.id,null); savedPosts[p.id]=!savedPosts[p.id]; btn.style.color=savedPosts[p.id]?'var(--pr)':'var(--tm)'; btn.querySelector('.material-icons-round').textContent=savedPosts[p.id]?'bookmark':'bookmark_border'; });
  el.querySelector('.fb-3dot').addEventListener('click',e=>{ e.stopPropagation(); const isOwn2=currentUser&&!isGuest&&userInfo.uid===currentUser.uid; showPostMenu(p,isOwn2); });
  return el;
}

function openUserProfile(uid){
  const ov=$('upoPanel'); if(!ov) return;
  setText('upoTitle','Profile'); setText('upoName','Loading...'); setText('upoHandle','');
  setText('upoPostCount','0'); setText('upoFollowerCount','0'); setText('upoFollowingCount','0');
  const upoAv=$('upoAv'); if(upoAv) upoAv.innerHTML='<div class="spinner" style="width:24px;height:24px;border-width:2.5px"></div>';
  setHTML('upoPostsGrid','');
  ov.classList.add('open'); document.body.style.overflow='hidden';
  history.replaceState(null,'','#user/'+uid);
  const isOwn=currentUser&&!isGuest&&uid===currentUser.uid;
  const followBtn=$('upoFollowBtn'), msgBtn=$('upoMsgBtn');
  if(followBtn) followBtn.style.display=isOwn?'none':'';
  if(msgBtn) msgBtn.style.display=isOwn?'none':'';
  $('upoFollowersStat')?.addEventListener('click',()=>openFollowList(uid,'followers'));
  $('upoFollowingStat')?.addEventListener('click',()=>openFollowList(uid,'following'));

  let isFollowing=!!followingCache[uid];
  if(currentUser&&!isGuest&&!isOwn){
    DB.collection('follows').doc(currentUser.uid+'_'+uid).get().then(snap=>{
      isFollowing=snap.exists; followingCache[uid]=isFollowing; localStorage.setItem('sx_following',JSON.stringify(followingCache));
      if(followBtn){ followBtn.classList.toggle('following',isFollowing); followBtn.innerHTML=isFollowing?'<span class="material-icons-round">person_remove</span> Following':'<span class="material-icons-round">person_add</span> Follow'; }
    }).catch(()=>{});
  }

  /* Remove old listeners by cloning */
  const newFollowBtn=followBtn?followBtn.cloneNode(true):null;
  if(newFollowBtn&&followBtn){ followBtn.parentNode.replaceChild(newFollowBtn,followBtn); }
  const newMsgBtn=msgBtn?msgBtn.cloneNode(true):null;
  if(newMsgBtn&&msgBtn){ msgBtn.parentNode.replaceChild(newMsgBtn,msgBtn); }

  if(newFollowBtn){ newFollowBtn.addEventListener('click',async()=>{
    if(!currentUser||isGuest){ toast('Follow করতে লগইন করুন','info'); switchSection('profile'); return; }
    newFollowBtn.disabled=true;
    const docId=currentUser.uid+'_'+uid;
    try{
      if(isFollowing){ await DB.collection('follows').doc(docId).delete(); DB.collection('users').doc(uid).update({followers:INC(-1)}).catch(()=>{}); DB.collection('users').doc(currentUser.uid).update({following:INC(-1)}).catch(()=>{}); isFollowing=false; followingCache[uid]=false; newFollowBtn.classList.remove('following'); newFollowBtn.innerHTML='<span class="material-icons-round">person_add</span> Follow'; toast('Unfollowed','info'); }
      else{ await DB.collection('follows').doc(docId).set({followerUid:currentUser.uid,followingUid:uid,createdAt:TS()}); DB.collection('users').doc(uid).update({followers:INC(1)}).catch(()=>{}); DB.collection('users').doc(currentUser.uid).update({following:INC(1)}).catch(()=>{}); isFollowing=true; followingCache[uid]=true; newFollowBtn.classList.add('following'); newFollowBtn.innerHTML='<span class="material-icons-round">person_remove</span> Following'; toast('Following!','success'); DB.collection('notifications').add({toUid:uid,fromUid:currentUser.uid,fromName:currentUser.displayName||'User',fromPhoto:currentUser.photoURL||'',type:'follow',read:false,createdAt:TS()}).catch(()=>{}); }
      localStorage.setItem('sx_following',JSON.stringify(followingCache));
      DB.collection('users').doc(uid).get().then(s=>{ if(s.exists) setText('upoFollowerCount',fmtCount(s.data().followers||0)); }).catch(()=>{});
    }catch(e){ toast('Error: '+e.message,'error'); }
    newFollowBtn.disabled=false;
  }); }
  if(newMsgBtn){ newMsgBtn.addEventListener('click',()=>{ closeUpo(); switchSection('messages'); setTimeout(()=>openChatWith(uid),200); }); }

  DB.collection('users').doc(uid).get().then(snap=>{
    if(!snap.exists){ toast('User not found','error'); return; }
    const d=snap.data(), name=d.displayName||'User';
    setText('upoTitle',name); setText('upoName',name); setText('upoHandle','@'+name.toLowerCase().replace(/[^a-z0-9]/g,'_'));
    setText('upoPostCount',fmtCount(d.postCount||0)); setText('upoFollowerCount',fmtCount(d.followers||0)); setText('upoFollowingCount',fmtCount(d.following||0));
    const img=$('upoAvImg'), ltr=$('upoAvLetter'), avEl=$('upoAv');
    if(d.photoURL&&d.photoURL.startsWith('http')){ if(img){img.src=d.photoURL;img.style.display='block';} if(ltr) ltr.style.display='none'; }
    else{ if(ltr){ltr.textContent=name[0].toUpperCase();ltr.style.display='flex';} if(img) img.style.display='none'; if(avEl) avEl.style.background=randomColor(uid); }
    if(avEl&&d.photoURL){ avEl.style.cursor='pointer'; avEl.onclick=()=>openPhotoViewer(d.photoURL,name,null); }
    const userInfo={name,photoURL:d.photoURL||'',uid};
    DB.collection('posts').where('userId','==',uid).orderBy('createdAt','desc').limit(30).get().then(psnap=>{
      const g=$('upoPostsGrid'); if(!g) return; g.innerHTML='';
      const posts=psnap.docs.map(doc=>({id:doc.id,...doc.data()})).filter(p=>isOwn||!p.status);
      window._profileVideos[uid]=posts.filter(p=>p.mediaType==='video'&&p.mediaUrl&&!p.status);
      if(!posts.length){ g.innerHTML='<div style="text-align:center;padding:40px;color:var(--tm)"><span class="material-icons-round" style="font-size:44px;opacity:.3;display:block">grid_off</span><p>কোনো পোস্ট নেই</p></div>'; return; }
      posts.forEach(p=>{ const item=buildFbPostItem(p,userInfo); g.appendChild(item); });
    }).catch(()=>{});
  }).catch(()=>toast('Failed to load profile','error'));
}
function closeUpo(){ $('upoPanel')?.classList.remove('open'); document.body.style.overflow=''; history.replaceState(null,'',location.pathname); }
on('upoBackBtn','click',closeUpo);

/* FOLLOW LIST */
async function openFollowList(uid,type){
  const ov=$('flPanel'); if(!ov) return;
  setText('flTitle',type==='followers'?'Followers':'Following');
  ov.classList.add('open'); document.body.style.overflow='hidden';
  setHTML('flBody','<div class="pdf-loading"><div class="spinner"></div></div>');
  try{
    const snap=type==='followers'?await DB.collection('follows').where('followingUid','==',uid).limit(100).get():await DB.collection('follows').where('followerUid','==',uid).limit(100).get();
    setHTML('flBody',''); const body=$('flBody'); if(!body) return;
    if(!snap.size){ body.innerHTML=`<div style="text-align:center;padding:40px;color:var(--tm)"><span class="material-icons-round" style="font-size:44px;opacity:.3;display:block;margin-bottom:10px">group</span><p>No ${type} yet</p></div>`; return; }
    const uids=snap.docs.map(d=>type==='followers'?d.data().followerUid:d.data().followingUid).filter(Boolean);
    const uSnaps=await Promise.all(uids.slice(0,50).map(id=>DB.collection('users').doc(id).get().catch(()=>null)));
    uSnaps.forEach(us=>{
      if(!us||!us.exists) return;
      const u=us.data(), name=u.displayName||'User'; const isF=!!followingCache[us.id]&&us.id!==currentUser?.uid;
      const el=document.createElement('div'); el.className='fl-item';
      const avHtml=u.photoURL&&u.photoURL.startsWith('http')?`<img src="${esc(u.photoURL)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%" onerror="this.outerHTML='${name[0].toUpperCase()}'"/>`:name[0].toUpperCase();
      el.innerHTML=`<div class="fl-av" style="background:${randomColor(us.id)}">${avHtml}</div><div style="flex:1"><p class="fl-name">${esc(name)}</p><p class="fl-handle">@${esc(name.toLowerCase().replace(/[^a-z0-9]/g,'_'))}</p></div>${us.id!==currentUser?.uid?`<button class="qfbtn${isF?' following':''}" data-uid="${esc(us.id)}">${isF?'Following':'Follow'}</button>`:''}`;
      el.querySelector('.fl-av').addEventListener('click',()=>{ $('flPanel')?.classList.remove('open'); openUserProfile(us.id); });
      el.querySelector('.qfbtn')?.addEventListener('click',e=>{ e.stopPropagation(); quickFollow(us.id,e.currentTarget); });
      body.appendChild(el);
    });
  }catch(e){ setHTML('flBody','<p style="padding:20px;color:var(--tm)">Failed: '+esc(e.message)+'</p>'); }
}
on('flBackBtn','click',()=>{ $('flPanel')?.classList.remove('open'); /* profile still open */ });

/* YOUR POSTS */
function openYourPosts(){
  if(!currentUser||isGuest){ toast('লগইন করুন','info'); return; }
  $('ypoPanel')?.classList.add('open'); document.body.style.overflow='hidden'; setText('ypoTitle','Your Posts');
  setHTML('ypoBody','<div class="pdf-loading"><div class="spinner"></div></div>');
  const userInfo={name:currentUser.displayName||'User',photoURL:currentUser.photoURL||'',uid:currentUser.uid};
  DB.collection('posts').where('userId','==',currentUser.uid).orderBy('createdAt','desc').limit(50).get().then(snap=>{
    const body=$('ypoBody'); if(!body) return; body.innerHTML='';
    if(!snap.size){ body.innerHTML='<div style="text-align:center;padding:40px;color:var(--tm)"><span class="material-icons-round" style="font-size:44px;opacity:.3;display:block">grid_off</span><p>কোনো পোস্ট নেই</p></div>'; return; }
    snap.docs.forEach(doc=>{ const p={id:doc.id,...doc.data()}; body.appendChild(buildFbPostItem(p,userInfo)); });
  }).catch(err=>{ setHTML('ypoBody','<p style="padding:20px;color:var(--tm)">Failed: '+esc(err.message)+'</p>'); });
}
on('ypoBackBtn','click',()=>{ $('ypoPanel')?.classList.remove('open'); document.body.style.overflow=''; });

/* SAVED */
function openSavedPosts(){
  const ids=Object.keys(savedPosts).filter(k=>savedPosts[k]); if(!ids.length){ toast('কোনো saved পোস্ট নেই','info'); return; }
  $('ypoPanel')?.classList.add('open'); document.body.style.overflow='hidden'; setText('ypoTitle','Saved Posts');
  setHTML('ypoBody','<div class="pdf-loading"><div class="spinner"></div></div>');
  Promise.all(ids.slice(0,30).map(id=>DB.collection('posts').doc(id).get())).then(snaps=>{
    const body=$('ypoBody'); if(!body) return; body.innerHTML='';
    const posts=snaps.filter(s=>s.exists&&!s.data().status).map(s=>({id:s.id,...s.data()}));
    if(!posts.length){ body.innerHTML='<div style="text-align:center;padding:40px;color:var(--tm)"><span class="material-icons-round" style="font-size:44px;opacity:.3;display:block">bookmark_border</span><p>কোনো saved পোস্ট নেই</p></div>'; return; }
    posts.forEach(p=>{ const ui={name:p.userName||'User',photoURL:p.userPhoto||'',uid:p.userId}; body.appendChild(buildFbPostItem(p,ui)); });
  }).catch(()=>setHTML('ypoBody','<p style="padding:20px;color:var(--tm)">Failed</p>'));
}

/* LIKED */
function openLikedPosts(){
  const ids=Object.keys(likedPosts).filter(k=>likedPosts[k]); if(!ids.length){ toast('কোনো liked পোস্ট নেই','info'); return; }
  $('ypoPanel')?.classList.add('open'); document.body.style.overflow='hidden'; setText('ypoTitle','Liked Posts');
  setHTML('ypoBody','<div class="pdf-loading"><div class="spinner"></div></div>');
  Promise.all(ids.slice(0,20).map(id=>DB.collection('posts').doc(id).get())).then(snaps=>{
    const body=$('ypoBody'); if(!body) return; body.innerHTML='';
    const posts=snaps.filter(s=>s.exists&&!s.data().status).map(s=>({id:s.id,...s.data()}));
    if(!posts.length){ body.innerHTML='<div style="text-align:center;padding:40px;color:var(--tm)"><p>কোনো liked পোস্ট নেই</p></div>'; return; }
    posts.forEach(p=>{ const ui={name:p.userName||'User',photoURL:p.userPhoto||'',uid:p.userId}; body.appendChild(buildFbPostItem(p,ui)); });
  }).catch(()=>setHTML('ypoBody','<p style="padding:20px;color:var(--tm)">Failed</p>'));
}

/* ════════ MESSAGES ════════ */
function initMessages(){
  if(!currentUser||isGuest){
    setStyle('msgsLoginPrompt','display','flex'); setStyle('convList','display','none'); setStyle('chatView','display','none'); setStyle('msgsListView','display','flex'); setStyle('newMsgBtn','display','none');
    return;
  }
  setStyle('msgsLoginPrompt','display','none'); setStyle('convList','display','block'); setStyle('chatView','display','none'); setStyle('msgsListView','display','flex'); setStyle('newMsgBtn','display','flex');
  loadAllUsersAndConvs();
}
on('msgLoginBtn','click',()=>switchSection('profile'));
async function loadAllUsersAndConvs(){
  if(!currentUser) return; const list=$('convList'); if(!list) return; list.innerHTML='';
  try{
    const[convSnap,usersSnap]=await Promise.all([
      DB.collection('conversations').where('participants','array-contains',currentUser.uid).orderBy('lastMessageAt','desc').limit(50).get().catch(()=>({docs:[]})),
      DB.collection('users').get()
    ]);
    const convMap={}; convSnap.docs.forEach(doc=>{ const d=doc.data(); const ou=(d.participants||[]).find(u=>u!==currentUser.uid)||''; if(ou) convMap[ou]={id:doc.id,...d}; });
    const allUsers=usersSnap.docs.map(d=>({id:d.id,...d.data()})).filter(u=>u.id!==currentUser.uid);
    _allUsersCache=allUsers;
    if(!allUsers.length){ list.innerHTML='<p style="text-align:center;padding:30px;color:var(--tm);font-size:.85rem">কোনো user নেই</p>'; return; }
    /* Show users with conversation first (sorted by last message), then rest alphabetically */
    const withConv=allUsers.filter(u=>convMap[u.id]).sort((a,b)=>{ const ta=convMap[a.id].lastMessageAt?.toDate?convMap[a.id].lastMessageAt.toDate():new Date(0), tb=convMap[b.id].lastMessageAt?.toDate?convMap[b.id].lastMessageAt.toDate():new Date(0); return tb-ta; });
    const withoutConv=allUsers.filter(u=>!convMap[u.id]).sort((a,b)=>(a.displayName||'').localeCompare(b.displayName||''));
    /* FIX: latest sender's profile photo appears at top of conversation item */
    [...withConv,...withoutConv].forEach(u=>renderConvItem(u,convMap[u.id]));
  }catch(e){ console.error('Messages load error:',e); }
}
function renderConvItem(u,conv){
  const list=$('convList'); if(!list) return;
  const unread=conv?(conv.unreadCounts&&conv.unreadCounts[currentUser.uid])||0:0;
  const lastMsg=conv?conv.lastMessage||'':null;
  const lastTime=conv?conv.lastMessageAt:null;
  /* Show last sender's photo if available, otherwise show the other user's photo */
  const lastSenderUid=conv&&conv.lastSenderUid;
  const displayPhoto=lastSenderUid&&conv.participantPhotos?conv.participantPhotos[lastSenderUid]:(u.photoURL||'');
  const name=u.displayName||'User';
  const item=document.createElement('div'); item.className='conv-item'; item.dataset.uid=u.id; item.dataset.name=(u.displayName||'').toLowerCase();
  const avHtml=displayPhoto&&displayPhoto.startsWith('http')?`<img src="${esc(displayPhoto)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%" onerror="this.outerHTML='${name[0].toUpperCase()}'"/>`:name[0].toUpperCase();
  item.innerHTML=`<div class="conv-av" style="background:${randomColor(u.id)}">${avHtml}</div><div class="conv-info"><p class="conv-name">${esc(name)}</p><p class="conv-last${unread?' unread':''}">${lastMsg!==null?(lastMsg?esc(lastMsg):''):'<span style="color:var(--tm);font-style:italic">Chat শুরু করুন</span>'}</p></div><div class="conv-meta">${lastTime?'<span class="conv-time">'+fmtAgo(lastTime)+'</span>':''}${unread?'<span class="conv-unread">'+unread+'</span>':''}</div>`;
  item.addEventListener('click',()=>openChatWith(u.id,name,u.photoURL||'',conv?conv.id:null));
  list.appendChild(item);
}
on('msgSearch','input',e=>{
  const q=(e.target.value||'').trim().toLowerCase();
  const items=qsa('.conv-item');
  if(!q){ items.forEach(i=>i.style.display=''); return; }
  let any=false; items.forEach(i=>{ const m=(i.dataset.name||'').includes(q); i.style.display=m?'':'none'; if(m) any=true; });
  if(!any){ const list=$('convList'); if(list){ qsa('.conv-item',list).forEach(i=>i.remove()); _allUsersCache.filter(u=>(u.displayName||'').toLowerCase().includes(q)).forEach(u=>renderConvItem(u,null)); } }
});
on('newMsgBtn','click',()=>{ const si=$('msgSearch'); if(si){ si.focus(); toast('User খুঁজুন chat করতে','info'); } });

function openChatWith(uid,name,photo,existingConvId){
  if(!currentUser||isGuest){ toast('Message পাঠাতে লগইন করুন','info'); return; }
  if(uid===currentUser.uid){ toast("নিজেকে message করা যাবে না",'info'); return; }
  if(!name){ DB.collection('users').doc(uid).get().then(snap=>{ if(snap.exists){ name=snap.data().displayName||'User'; photo=snap.data().photoURL||''; } _doChat(uid,name,photo,existingConvId); }).catch(()=>_doChat(uid,name||'User',photo||'',existingConvId)); }
  else _doChat(uid,name,photo,existingConvId);
}
function _doChat(uid,name,photo,existingConvId){
  activeChatUid=uid; activeChatConvId=existingConvId||[currentUser.uid,uid].sort().join('_');
  setText('chatHdrName',name||'User'); setText('chatHdrStatus','Online');
  const ha=$('chatHdrAv'); if(ha){ if(photo&&photo.startsWith('http')) ha.innerHTML=`<img src="${esc(photo)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>`; else ha.textContent=(name||'U')[0].toUpperCase(); }
  const vp=$('chatProfileBtn'); if(vp) vp.onclick=()=>openUserProfile(uid);
  setStyle('msgsListView','display','none'); setStyle('chatView','display','flex');
  setHTML('chatMsgs','<div class="pdf-loading"><div class="spinner"></div></div>');
  const myName=currentUser.displayName||'User', myPhoto=currentUser.photoURL||'';
  const convRef=DB.collection('conversations').doc(activeChatConvId);
  convRef.get().then(snap=>{
    if(!snap.exists) return convRef.set({participants:[currentUser.uid,uid],participantNames:{[currentUser.uid]:myName,[uid]:name||'User'},participantPhotos:{[currentUser.uid]:myPhoto,[uid]:photo||''},lastMessage:'',lastMessageAt:TS(),lastSenderUid:currentUser.uid,unreadCounts:{[currentUser.uid]:0,[uid]:0}});
  }).then(()=>{
    const upd={}; upd['unreadCounts.'+currentUser.uid]=0; return convRef.update(upd);
  }).then(()=>{
    if(chatUnsub){chatUnsub();chatUnsub=null;}
    chatUnsub=convRef.collection('messages').orderBy('createdAt','asc').limit(150).onSnapshot(snap=>{
      const cm=$('chatMsgs'); if(!cm) return; cm.innerHTML='';
      if(!snap.size){ cm.innerHTML='<p style="text-align:center;padding:24px;color:var(--tm);font-size:.82rem">👋 Say hello!</p>'; return; }
      snap.docs.forEach(doc=>{
        const msg={id:doc.id,...doc.data()}, isSent=msg.senderId===currentUser.uid;
        const el=document.createElement('div'); el.className='chat-msg '+(isSent?'msg-sent':'msg-recv');
        /* FIX: Blue ✓✓ when read, grey ✓✓ when not */
        const readMark=isSent?`<span style="font-size:12px;color:${msg.read?'#53bdeb':'rgba(255,255,255,.4)'}">✓✓</span>`:'';
        let mHtml='';
        if(msg.mediaUrl){
          if(msg.mediaType==='image') mHtml=`<div style="margin-bottom:4px"><img src="${esc(msg.mediaUrl)}" loading="eager" style="cursor:pointer;border-radius:12px;max-width:220px;display:block;" onclick="openPhotoViewer(this.src,'',null)"/></div>`;
          else if(msg.mediaType==='video') mHtml=`<div style="margin-bottom:4px"><video src="${esc(msg.mediaUrl)}" controls playsinline muted style="border-radius:8px;max-width:220px;display:block;"></video></div>`;
        }
        const avHtml=!isSent?`<div class="msg-av" style="background:${randomColor(msg.senderId)}">${(msg.senderName||'U')[0].toUpperCase()}</div>`:'';
        el.innerHTML=avHtml+'<div>'+mHtml+(msg.text?`<div class="msg-bubble">${esc(msg.text)}</div>`:'')+'<p class="msg-time">'+fmtAgo(msg.createdAt)+' '+readMark+'</p></div>';
        /* Long-press to delete own messages */
        if(isSent){
          let pt=null; el.addEventListener('touchstart',()=>{pt=setTimeout(()=>{ if(confirm('Delete?')) convRef.collection('messages').doc(doc.id).delete().catch(()=>{}); },600);}); el.addEventListener('touchend',()=>clearTimeout(pt)); el.addEventListener('contextmenu',e=>{e.preventDefault();if(confirm('Delete?')) convRef.collection('messages').doc(doc.id).delete().catch(()=>{});});
        }
        if(!isSent&&!msg.read) convRef.collection('messages').doc(doc.id).update({read:true}).catch(()=>{});
        cm.appendChild(el);
      });
      cm.scrollTop=cm.scrollHeight;
      const u2={}; u2['unreadCounts.'+currentUser.uid]=0; convRef.update(u2).catch(()=>{});
    },()=>{});
  }).catch(()=>{});
}
async function sendChatMessage(){
  if(!currentUser||!activeChatConvId) return; const ci=$('chatInp'), text=(ci?ci.value:'').trim();
  const mf=$('chatFileInput'), file=mf&&mf.files&&mf.files[0];
  if(!text&&!file) return; const btn=$('chatSendBtn'); if(btn) btn.disabled=true;
  try{
    let mediaUrl=null, mediaType=null;
    if(file){ const folder=file.type.startsWith('image/')?'chats/images/':'chats/videos/'; mediaUrl=await uploadFile(file,folder,()=>{}); mediaType=file.type.startsWith('image/')?'image':'video'; if(mf) mf.value=''; setStyle('chatMediaPrev','display','none'); }
    const myName=currentUser.displayName||'User';
    const convRef=DB.collection('conversations').doc(activeChatConvId);
    await convRef.collection('messages').add({senderId:currentUser.uid,senderName:myName,text:text||'',mediaUrl:mediaUrl||null,mediaType:mediaType||null,read:false,createdAt:TS()});
    const upd={lastMessage:text||(mediaType==='image'?'📷 Image':'🎬 Video'),lastMessageAt:TS(),lastSenderUid:currentUser.uid};
    upd['unreadCounts.'+activeChatUid]=INC(1); await convRef.update(upd);
    DB.collection('notifications').add({toUid:activeChatUid,fromUid:currentUser.uid,fromName:myName,fromPhoto:currentUser.photoURL||'',type:'message',preview:(text||(mediaType==='image'?'Sent a photo':'Sent a video')).slice(0,60),read:false,createdAt:TS()}).catch(()=>{});
    if(ci){ci.value='';ci.style.height='auto';}
  }catch(e){ toast('Failed: '+e.message,'error'); }
  if(btn) btn.disabled=false;
}
on('chatSendBtn','click',sendChatMessage);
on('chatInp','keydown',e=>{ if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); sendChatMessage(); } });
on('chatInp','input',function(){ this.style.height='auto'; this.style.height=Math.min(this.scrollHeight,90)+'px'; });
on('chatAttachBtn','click',()=>$('chatFileInput')?.click());
on('chatFileInput','change',e=>{ const file=e.target.files&&e.target.files[0]; if(!file) return; const blob=URL.createObjectURL(file); const prev=$('chatMediaPrev'),pi=$('chatMediaPrevImg'),pv=$('chatMediaPrevVid'); if(prev) prev.style.display='block'; if(file.type.startsWith('image/')){ if(pi){pi.src=blob;pi.style.display='block';} if(pv) pv.style.display='none'; }else{ if(pv){pv.src=blob;pv.style.display='block';} if(pi) pi.style.display='none'; } });
on('removeChatMedia','click',()=>{ setStyle('chatMediaPrev','display','none'); const pi=$('chatMediaPrevImg'),pv=$('chatMediaPrevVid'),fi=$('chatFileInput'); if(pi) pi.src=''; if(pv) pv.src=''; if(fi) fi.value=''; });
on('chatBackBtn','click',()=>{ if(chatUnsub){chatUnsub();chatUnsub=null;} activeChatUid=null; activeChatConvId=null; setStyle('chatView','display','none'); setStyle('msgsListView','display','flex'); loadAllUsersAndConvs(); });

/* ════════ ORDERS ════════ */
function listenOrders(uid){ if(ordersUnsub){ordersUnsub();ordersUnsub=null;} ordersUnsub=DB.collection('orders').where('userId','==',uid).orderBy('createdAt','desc').limit(1).onSnapshot(()=>{},()=>{}); }
function openOrdersPanel(){
  if(!currentUser||isGuest){ toast('লগইন করুন','info'); switchSection('profile'); return; }
  $('ordersPanel')?.classList.add('open'); document.body.style.overflow='hidden';
  setHTML('ordersBody','<div class="pdf-loading"><div class="spinner"></div></div>');
  DB.collection('orders').where('userId','==',currentUser.uid).orderBy('createdAt','desc').limit(20).get().then(snap=>{
    const body=$('ordersBody'); if(!body) return; body.innerHTML='';
    if(!snap.size){ body.innerHTML='<div class="orders-empty"><span class="material-icons-round" style="font-size:46px;opacity:.3">inventory_2</span><p>কোনো অর্ডার নেই</p></div>'; return; }
    snap.docs.forEach(doc=>{
      const o=Object.assign({id:doc.id},doc.data());
      const card=document.createElement('div'); card.className='order-card';
      let itemsHtml=''; (o.items||[]).forEach(item=>{
        const digs=[];
        if(item.pdfUrl) digs.push(`<button class="btn-read-pdf" data-pdf="${esc(item.pdfUrl)}" data-title="${esc(item.title)}" style="padding:7px 14px;background:var(--pr);color:#fff;border-radius:10px;font-size:.8rem;font-weight:700;border:none;cursor:pointer;display:inline-flex;align-items:center;gap:5px"><span class="material-icons-round" style="font-size:15px">auto_stories</span>Read</button>`);
        if(item.audioUrl) digs.push(`<button class="btn-play-audio" data-audio="${esc(item.audioUrl)}" data-title="${esc(item.title)}" style="padding:7px 14px;background:var(--pr);color:#fff;border-radius:10px;font-size:.8rem;font-weight:700;border:none;cursor:pointer;display:inline-flex;align-items:center;gap:5px"><span class="material-icons-round" style="font-size:15px">headphones</span>Play</button>`);
        itemsHtml+=`<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--bdr)"><img src="${esc(item.image||'')}" style="width:46px;height:46px;border-radius:8px;object-fit:cover" onerror="this.src='https://placehold.co/46'"/><div style="flex:1"><p style="font-weight:700;font-size:.84rem;color:var(--txt)">${esc(item.title)}</p><p style="font-size:.76rem;color:var(--tm)">₹${fmt(item.price)}</p></div></div>${digs.length?`<div style="display:flex;gap:8px;flex-wrap:wrap;padding:7px 0">${digs.join('')}</div>`:''}`; });
      card.innerHTML=`<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--bdr)"><span style="font-weight:800;font-size:.82rem;color:var(--txt)">#${o.id.slice(0,8).toUpperCase()}</span><span style="font-size:.7rem;font-weight:700;padding:3px 10px;border-radius:99px;background:var(--pr-g);color:var(--pr)">${o.status||'confirmed'}</span></div><div style="padding:0 16px">${itemsHtml}</div><div style="display:flex;align-items:center;justify-content:space-between;padding:10px 16px;border-top:1px solid var(--bdr)"><span style="font-weight:800;color:var(--txt)">Total: ₹${fmt(o.total)}</span><span style="font-size:.72rem;color:var(--tm)">${fmtDate((o.createdAt&&o.createdAt.toDate&&o.createdAt.toDate())||new Date())}</span></div>`;
      card.querySelectorAll('.btn-read-pdf').forEach(btn=>btn.addEventListener('click',()=>openPdfReader(btn.dataset.pdf,btn.dataset.title)));
      card.querySelectorAll('.btn-play-audio').forEach(btn=>btn.addEventListener('click',()=>openAudioOv(btn.dataset.audio,btn.dataset.title,'')));
      body.appendChild(card);
    });
  }).catch(()=>setHTML('ordersBody','<p style="padding:20px;color:var(--tm)">Failed to load</p>'));
}
on('ordersBackBtn','click',()=>{ $('ordersPanel')?.classList.remove('open'); document.body.style.overflow=''; });

/* ════════ CHECKOUT ════════ */
function handleBuyNow(product){
  if(!currentUser||isGuest){ toast('কিনতে লগইন করুন','info'); switchSection('profile'); return; }
  checkoutProduct=product; const isDigital=['ebook','audio'].includes(product.productType);
  setText('checkoutSub',isDigital?'Digital product — payment এর পরে access পাবেন।':'Delivery address দিন।');
  setStyle('checkoutAddrFields','display',isDigital?'none':'block');
  $('checkoutModal')?.classList.add('open'); document.body.style.overflow='hidden';
}
function closeCheckout(){ $('checkoutModal')?.classList.remove('open'); document.body.style.overflow=''; checkoutProduct=null; }
on('checkoutCloseBtn','click',closeCheckout); on('checkoutCancelBtn','click',closeCheckout); on('checkoutBg','click',closeCheckout);
on('checkoutConfirmBtn','click',()=>{
  if(!checkoutProduct||!currentUser) return;
  const isDigital=['ebook','audio'].includes(checkoutProduct.productType);
  if(!isDigital){ const n=(($('addrName')||{}).value||'').trim(), ph=(($('addrPhone')||{}).value||'').trim(); if(!n){ toast('নাম দিন','error'); return; } if(!/^\d{10}$/.test(ph)){ toast('সঠিক মোবাইল নম্বর দিন','error'); return; } }
  launchRazorpay();
});
function launchRazorpay(){
  if(!checkoutProduct) return;
  const rzp=new window.Razorpay({key:RAZORPAY_KEY,amount:Math.round(checkoutProduct.price*100),currency:'INR',name:'SayatX',description:checkoutProduct.title,prefill:{name:currentUser.displayName||'',contact:''},theme:{color:'#f97316'},method:{upi:1,card:1,netbanking:1,wallet:1},handler:res=>placeOrder('online',res.razorpay_payment_id),modal:{ondismiss:()=>toast('Payment cancelled','warning')}});
  rzp.on('payment.failed',e=>toast('Payment failed: '+((e&&e.error&&e.error.description)||'Error'),'error')); rzp.open();
}
async function placeOrder(method,paymentId){
  if(!checkoutProduct||!currentUser) return; showLoading('Order দেওয়া হচ্ছে...'); closeCheckout();
  const isDigital=['ebook','audio'].includes(checkoutProduct.productType);
  const addr=isDigital?null:{name:(($('addrName')||{}).value||'').trim(),phone:(($('addrPhone')||{}).value||'').trim(),street:(($('addrStreet')||{}).value||'').trim(),city:(($('addrCity')||{}).value||'').trim(),pin:(($('addrPin')||{}).value||'').trim(),state:(($('addrState')||{}).value||'').trim()};
  try{
    await DB.collection('orders').add({userId:currentUser.uid,items:[{productId:checkoutProduct.id,title:checkoutProduct.title,price:checkoutProduct.price,image:(checkoutProduct.images&&checkoutProduct.images[0])||checkoutProduct.image||'',productType:checkoutProduct.productType||'general',pdfUrl:checkoutProduct.pdfUrl||null,audioUrl:checkoutProduct.audioUrl||null}],total:checkoutProduct.price,paymentMethod:method,paymentId:paymentId||'PAY-'+Date.now(),deliveryAddress:addr,status:isDigital?'delivered':'confirmed',createdAt:TS()});
    setText('successPayId',paymentId||'Successful'); setText('successMsg',isDigital?'Digital product ready! My Orders এ যান।':'Order placed! শীঘ্রই ship হবে।');
    $('successOv')?.classList.add('open');
  }catch(e){ toast('Order failed: '+e.message,'error',6000); }
  hideLoading();
}
on('successDoneBtn','click',()=>{ $('successOv')?.classList.remove('open'); switchSection('profile'); setTimeout(openOrdersPanel,300); });

/* ════════ ADMIN ════════ */
function updateAdminAuthUI(){ if(!$('adminAuthNotice')) return; setStyle('adminAuthNotice','display',currentUser&&!isGuest?'none':'flex'); setStyle('adminAuthOk','display',currentUser&&!isGuest?'flex':'none'); if(currentUser&&!isGuest&&$('adminAuthName')) setText('adminAuthName','Logged in: '+(currentUser.displayName||'Admin')); }
qsa('[name="featType"]').forEach(r=>r.addEventListener('change',()=>{ setStyle('featMediaField','display',r.value==='image'?'none':'block'); }));
on('featThumbInput','change',e=>{ const f=e.target.files&&e.target.files[0]; if(!f) return; setText('featThumbName',f.name); setStyle('featThumbSel','display','flex'); setStyle('featThumbZone','display','none'); });
on('featThumbRm','click',()=>{ if($('featThumbInput')) $('featThumbInput').value=''; setStyle('featThumbSel','display','none'); setStyle('featThumbZone','display','block'); });
on('featMediaInput','change',e=>{ const f=e.target.files&&e.target.files[0]; if(!f) return; setText('featMediaName',f.name+' ('+(f.size/1024/1024).toFixed(1)+'MB)'); setStyle('featMediaSel','display','flex'); setStyle('featMediaZone','display','none'); });
on('featMediaRm','click',()=>{ if($('featMediaInput')) $('featMediaInput').value=''; setStyle('featMediaSel','display','none'); setStyle('featMediaZone','display','block'); });
on('publishFeatBtn','click',async()=>{
  if(!currentUser||isGuest){ toast('লগইন করুন','error'); return; }
  const type=(document.querySelector('[name="featType"]:checked')||{}).value||'image';
  const link=(($('featLink')||{}).value||'').trim();
  const thumbF=$('featThumbInput')&&$('featThumbInput').files[0];
  const mediaF=$('featMediaInput')&&$('featMediaInput').files[0];
  if(!thumbF){ toast('Image/Thumbnail লাগবে','error'); return; }
  if(type!=='image'&&!mediaF){ toast('Media file লাগবে','error'); return; }
  const btn=$('publishFeatBtn'); if(btn) btn.disabled=true; showLoading('Uploading...');
  try{
    const thumbUrl=await uploadFile(thumbF,'featured/thumbs/',()=>{});
    let mediaUrl=thumbUrl; if(type!=='image'&&mediaF) mediaUrl=await uploadFile(mediaF,'featured/'+(type==='video'?'videos':'audios')+'/',()=>{});
    await DB.collection('featured').add({title:'Sponsored',link:link||null,type,mediaType:type,thumbnailUrl:thumbUrl,mediaUrl,createdAt:TS()});
    toast('Ad published!','success'); if($('featLink')) $('featLink').value=''; setStyle('featThumbSel','display','none'); setStyle('featThumbZone','display','block'); setStyle('featMediaSel','display','none'); setStyle('featMediaZone','display','block'); if($('featThumbInput')) $('featThumbInput').value=''; if($('featMediaInput')) $('featMediaInput').value='';
  }catch(e){ toast('Failed: '+e.message,'error'); }
  if(btn) btn.disabled=false; hideLoading();
});
qsa('[name="prodType"]').forEach(r=>r.addEventListener('change',()=>{ setStyle('prodPDFField','display',r.value==='ebook'?'block':'none'); setStyle('prodAudioField','display',r.value==='audio'?'block':'none'); }));
function updateDiscPreview(){ const mrp=parseFloat(($('prodMRP')||{}).value||0), sale=parseFloat(($('prodSale')||{}).value||0); if(mrp>0&&sale>0&&mrp>sale){ setText('adminDiscText',Math.round((1-sale/mrp)*100)+'% OFF'); setStyle('adminDiscPrev','display','flex'); }else setStyle('adminDiscPrev','display','none'); }
on('prodMRP','input',updateDiscPreview); on('prodSale','input',updateDiscPreview);
on('prodImages','change',e=>{ const files=Array.from(e.target.files||[]); setHTML('adminImgPrevs',''); const prev=$('adminImgPrevs'); if(!prev) return; files.forEach((f,i)=>{ const reader=new FileReader(); reader.onload=ev=>{ const wrap=document.createElement('div'); wrap.className='admin-img-prev'; wrap.innerHTML=`<img src="${ev.target.result}"/><button type="button">&times;</button>`; wrap.querySelector('button').addEventListener('click',()=>{ const dt=new DataTransfer(); Array.from($('prodImages').files).filter((_,fi)=>fi!==i).forEach(f2=>dt.items.add(f2)); try{$('prodImages').files=dt.files;}catch(e){} wrap.remove(); }); prev.appendChild(wrap); }; reader.readAsDataURL(f); }); });
on('prodPDF','change',e=>{ const f=e.target.files&&e.target.files[0]; if(!f) return; if(f.size>100*1024*1024){ toast('Max 100MB','error'); return; } setText('prodPDFName',f.name); setStyle('prodPDFSel','display','flex'); setStyle('prodPDFField','display','block'); });
on('prodPDFRm','click',()=>{ if($('prodPDF')) $('prodPDF').value=''; setStyle('prodPDFSel','display','none'); });
on('prodAudio','change',e=>{ const f=e.target.files&&e.target.files[0]; if(!f) return; setText('prodAudioName',f.name); setStyle('prodAudioSel','display','flex'); });
on('prodAudioRm','click',()=>{ if($('prodAudio')) $('prodAudio').value=''; setStyle('prodAudioSel','display','none'); });
function setAdminProgress(pct,msg){ const bar=$('adminProgBar'), pctEl=$('adminProgPct'), ti=$('adminProgTitle'); if(bar) bar.style.width=pct+'%'; if(pctEl) pctEl.textContent=pct+'%'; if(ti) ti.textContent=msg; }
function adminLog(msg,type){ const log=$('adminLog'); if(!log) return; const s=document.createElement('span'); s.className='log-'+(type||'inf'); s.textContent='['+new Date().toLocaleTimeString()+'] '+msg; log.appendChild(s); log.scrollTop=log.scrollHeight; }
on('publishProdBtn','click',async()=>{
  if(!currentUser||isGuest){ toast('লগইন করুন','error'); return; }
  const type=(document.querySelector('[name="prodType"]:checked')||{}).value||'general';
  const title=(($('prodTitle')||{}).value||'').trim(); const desc=(($('prodDesc')||{}).value||'').trim();
  const mrp=parseFloat(($('prodMRP')||{}).value||0); const sale=parseFloat(($('prodSale')||{}).value||0);
  const imgF=Array.from(($('prodImages')&&$('prodImages').files)||[]);
  if(!title){ toast('Title লাগবে','error'); return; } if(!mrp||!sale){ toast('MRP ও Sale Price লাগবে','error'); return; } if(sale>mrp){ toast('Sale price MRP এর চেয়ে বেশি হবে না','error'); return; } if(!imgF.length){ toast('কমপক্ষে ১টি ছবি লাগবে','error'); return; }
  if(type==='ebook'&&!($('prodPDF')&&$('prodPDF').files[0])){ toast('PDF লাগবে','error'); return; }
  if(type==='audio'&&!($('prodAudio')&&$('prodAudio').files[0])){ toast('Audio file লাগবে','error'); return; }
  const btn=$('publishProdBtn'); if(btn) btn.disabled=true; setStyle('adminProg','display','block'); setHTML('adminLog',''); setAdminProgress(0,'Preparing...');
  const total=imgF.length+(type==='ebook'?1:0)+(type==='audio'?1:0)+1; let done=0; const imgUrls=[];
  try{
    for(let i=0;i<imgF.length;i++){ setAdminProgress(Math.round(done/total*100),'Image '+(i+1)); const url=await uploadFile(imgF[i],'products/images/',pct=>setAdminProgress(Math.round((done+pct/100)/total*100),'Image: '+pct+'%')); imgUrls.push(url); done++; adminLog('Image '+(i+1)+' ✓','ok'); }
    let pdfUrl=null; if(type==='ebook'){ setAdminProgress(Math.round(done/total*100),'Uploading PDF...'); pdfUrl=await uploadFile($('prodPDF').files[0],'products/pdfs/',pct=>setAdminProgress(Math.round((done+pct/100)/total*100),'PDF: '+pct+'%')); done++; adminLog('PDF ✓','ok'); }
    let audioUrl=null; if(type==='audio'){ setAdminProgress(Math.round(done/total*100),'Uploading audio...'); audioUrl=await uploadFile($('prodAudio').files[0],'products/audios/',pct=>setAdminProgress(Math.round((done+pct/100)/total*100),'Audio: '+pct+'%')); done++; adminLog('Audio ✓','ok'); }
    setAdminProgress(96,'Saving...'); const disc=mrp>sale?Math.round((1-sale/mrp)*100):0;
    await DB.collection('products').add({title,description:desc,price:sale,originalPrice:mrp,discount:disc,productType:type,paymentMethod:'online',images:imgUrls,image:imgUrls[0]||'',thumbnailUrl:imgUrls[0]||'',pdfUrl:pdfUrl||null,audioUrl:audioUrl||null,inStock:true,createdAt:TS()});
    setAdminProgress(100,'Published ✓'); adminLog('Product published!','ok'); toast('Product published!','success',5000);
    ['prodTitle','prodDesc','prodMRP','prodSale'].forEach(id=>{ const el=$(id); if(el) el.value=''; }); setHTML('adminImgPrevs',''); ['prodImages','prodPDF','prodAudio'].forEach(id=>{ try{const el=$(id);if(el)el.value='';}catch(e){} }); setStyle('prodPDFSel','display','none'); setStyle('prodAudioSel','display','none'); setStyle('adminDiscPrev','display','none'); setStyle('prodPDFField','display','none'); setStyle('prodAudioField','display','none'); const gen=document.querySelector('[name="prodType"][value="general"]'); if(gen) gen.checked=true;
  }catch(e){ setAdminProgress(0,'Failed'); adminLog('ERROR: '+e.message,'err'); toast('Upload failed: '+e.message,'error',8000); }
  if(btn) btn.disabled=false;
});

/* ════════ ESC / CLOSE ALL ════════ */
function closeAllSheets(){ $('createSheet')?.classList.remove('open'); $('commentsSheet')?.classList.remove('open'); document.body.style.overflow=''; }
document.addEventListener('keydown',e=>{
  if(e.key!=='Escape') return;
  if($('reelOv')?.classList.contains('open')){ closeReels(); return; }
  const pv=document.getElementById('photoViewerOv'); if(pv&&pv.style.display==='flex'){ pv.style.display='none'; document.body.style.overflow=''; return; }
  if($('videoOv')?.classList.contains('open')){ closeVideoOv(); return; }
  if($('audioOv')?.classList.contains('open')){ closeAudioOv(); return; }
  if($('pdfOv')?.classList.contains('open')){ closePdfReader(); return; }
  if($('upoPanel')?.classList.contains('open')){ closeUpo(); return; }
  if($('ypoPanel')?.classList.contains('open')){ $('ypoBackBtn')?.click(); return; }
  if($('flPanel')?.classList.contains('open')){ $('flBackBtn')?.click(); return; }
  if($('notifPanel')?.classList.contains('open')){ $('notifPanelClose')?.click(); return; }
  if($('ordersPanel')?.classList.contains('open')){ $('ordersBackBtn')?.click(); return; }
  if($('checkoutModal')?.classList.contains('open')){ closeCheckout(); return; }
  if($('createSheet')?.classList.contains('open')){ closeCreateSheet(); return; }
  if($('commentsSheet')?.classList.contains('open')){ closeComments(); return; }
  if($('drawer')?.classList.contains('open')){ closeDrawer(); return; }
  const pm=document.getElementById('postMenuOv'); if(pm) pm.remove();
  const cmH=$('cmHalfOv'); if(cmH&&cmH.classList.contains('open')) cmH.classList.remove('open');
  const vtp=$('vtpOv'); if(vtp&&vtp.style.display==='flex') vtp.style.display='none';
  ['editProfileOv','settingsOv'].forEach(id=>{ const ov=document.getElementById(id); if(ov&&ov.classList.contains('open')){ ov.classList.remove('open'); document.body.style.overflow=''; } });
});

/* ════════ INIT ════════ */
listenProducts();
loadFeatured();
loadFeed('all');
console.log('%cSayatX v14 Ready! 🚀','color:#f97316;font-weight:900;font-size:16px');
