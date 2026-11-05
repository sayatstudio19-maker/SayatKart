/* ==========================================================================
   YOUR STORE — app.js  (the ONLY JavaScript file)

   This one file does two jobs, depending on where it runs:
     1) In the visitor's browser (index.html loads it)  -> the storefront + admin panel.
     2) On Vercel as a serverless function (api/index.js is a one-line pointer to it)
        -> PayU payments, order creation and review checks, using your secret env vars.
   Your PayU secret and Firebase service-account key are NEVER written in this file —
   they are read from Vercel Environment Variables.

   Files you deploy:  index.html, style.css, app.js, config.js, package.json, vercel.json,
                      api/index.js (contains only: module.exports = require("../app.js");)

   config.js holds YOUR keys (Firebase config + PayU Merchant Key). Fill it in ONCE and never
   replace it again, so you can freely update app.js / index.html / style.css later.

   ==========================  SETUP GUIDE  ==========================
   # Setup guide (Firebase + PayU + Vercel)

   ## 1. Firebase
   1. https://console.firebase.google.com → **Add project**.
   2. **Build → Authentication → Get started** → Sign-in method → turn on **Email/Password** and **Google**.
   3. **Build → Firestore Database → Create database** (production mode, nearest region).
   4. **Build → Storage → Get started**.
   5. **Project settings (gear) → Your apps → Web (</>)** → register app → copy the firebaseConfig values into config.js (the file next to app.js).
   6. **Authentication → Settings → Authorized domains** → add your Vercel domain (e.g. your-store.vercel.app) and your own domain if you have one.
   7. **Firestore → Rules** → paste the firestore.rules text from further down in this file → Publish.
      **Storage → Rules** → paste the storage.rules text from further down in this file → Publish (if asked, allow Storage to read Firestore).

   ## 2. Server key for Vercel (lets api/index.js write orders safely)
   Firebase console → Project settings → **Service accounts → Generate new private key**. Keep that JSON file private.
   Vercel env var FIREBASE_SERVICE_ACCOUNT = the whole JSON contents.

   ## 3. PayU
   - PayU Client ID  = your **Merchant Key**  → paste into payuClientId in config.js (public) and also add it as Vercel env var PAYU_CLIENT_ID.
   - PayU Client Secret = your **Merchant Salt** → ONLY in Vercel env var PAYU_CLIENT_SECRET.
   - PAYU_MODE = test while testing, live when you go live (use your live key + salt then).

   ## 3b. Qikink (print-on-demand fulfilment)
   Vercel env vars (names only; never paste the values into this file or into chat):
     QIKINK_CLIENT_ID, QIKINK_CLIENT_SECRET   from the Qikink dashboard -> Integration -> Custom API (API access must be requested/enabled first)
     QIKINK_MODE = sandbox while testing, live when you go live
     CRON_SECRET                              any long random text; lets Vercel's daily tracking refresh call the server
     optional, only if Qikink's docs show different paths: QIKINK_ORDER_PATH (default /api/order/create), QIKINK_STATUS_PATH (default /api/order, the order id is added as ?id=), QIKINK_BASE_URL
   Every order is sent with qikink_shipping "1", so Qikink chooses the courier. Nothing here picks a courier or ships by itself.
   BOX PACKING + BRAND STICKER are account settings in the Qikink dashboard (Settings -> Shipping -> "All your orders will go in a box packing",
   and Settings -> Shipping -> Brand Sticker). Qikink's API has no field for them, so this site cannot turn them on or check them.
   The ticks in Admin -> Settings are only your own reminder.
   Each colour/size needs its REAL Qikink SKU (Product form). A product without it can't be published and its orders can't be sent to Qikink.

   ## 4. Deploy on Vercel
   Put these files in one folder: index.html, style.css, app.js, config.js, package.json, vercel.json, and the api/ folder (it holds just one file, api/index.js — the server part).
   Push to GitHub → Vercel → **Add New Project** → import it → add the env vars above → Deploy.
   (Changing env vars needs a redeploy.)

   ## 5. Your first admin
   1. Open your site and **Sign up** with the email you want to use as owner.
   2. Firebase console → Authentication → Users → copy that user's **UID**.
   3. Firestore → **Start collection** admins → Document ID = that UID → add field email (string) = your email.
   4. On the site, scroll to the footer and click the copyright line **10 times quickly** (each click within ~2.5 seconds of the last). The admin sign-in box opens. Log in with that email and password.
   5. More admins later: Admin → Settings → Admin access → Add (they must sign up first).

   ## 6. First things to do in the admin panel
   Settings (store name, support details, shipping charge, policies) → Categories → Products → Homepage banners.

   ## 7. Products with colours and sizes, and print-on-demand
   - Product form → Variants: use "Quick add: colours x sizes" to create every colour/size in one go, then set each price and stock.
     The shopper picks the colour and size on the product page.
   - Product form → Print on demand: switch it on for T-shirts, mugs etc. The shopper taps Customize, uploads a design (front,
     and optionally the back for an extra charge you set), sees it on the product and orders. Their design files appear on the
     order in Admin → Orders with an "Open design" link to download the original.
   - In Admin → Orders you can jump to any later status: Processing, Packed, Shipped, Out for delivery, Delivered.
   - Cash on Delivery: in the product form turn COD on and set the "COD fee per unit" (0 = no fee). The shopper pays nothing online;
     fee x quantity is added to the amount paid at delivery. COD orders wait as "Pending approval" and are sent to Qikink only when you press Approve.
   - Online orders: after PayU confirms the payment (checked on the server) the order is sent to Qikink automatically.
   - Product coupon: product form -> Product coupon (code + percent). It applies only to that product's line. Codes are kept in a private list shoppers can't read.
   - Cancelling: a customer can cancel from the order page within 24 hours of placing it (until it is packed). After that the button disappears. There are no returns.

   ## 8. Showing your products in Google search
   - Every published product also has its own address:  https://your-site/p/<product-name>-<id>
     (with title, description, photo, price and structured data). Sharing a product uses that address.
   - Search Console -> Sitemaps -> add:  sitemap.xml   (it lists every published product automatically).
   - Search Console -> URL inspection -> paste a product address -> Request indexing.
   - Google decides when and where products appear; it normally takes days to weeks.

   ==========================  firestore.rules  ==========================
   (Firebase console -> Firestore Database -> Rules -> select all, paste the text below -> Publish)

   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {

       // ---------- helpers ----------
       function signedIn() { return request.auth != null; }
       function isOwner(uid) { return signedIn() && request.auth.uid == uid; }
       // An admin is anyone who has a document at admins/{their UID}.
       function isAdmin() {
         return signedIn() && exists(/databases/$(database)/documents/admins/$(request.auth.uid));
       }

       function validProfile(d) {
         return d.fullName is string && d.fullName.size() <= 100
           && (!('phone' in d) || (d.phone is string && d.phone.size() <= 20))
           && (!('photoURL' in d) || (d.photoURL is string && d.photoURL.size() <= 1000));
       }

       function validAddress(a) {
         return a.keys().hasOnly(['userId', 'fullName', 'phone', 'houseFlat', 'road', 'villageTown', 'area',
                                  'city', 'district', 'state', 'pin', 'landmark', 'addressType', 'isDefault'])
           && a.keys().hasAll(['userId', 'fullName', 'phone', 'pin'])
           && a.userId == request.auth.uid
           && a.fullName is string && a.fullName.size() > 0 && a.fullName.size() <= 100
           && a.phone is string && a.phone.matches('^[6-9][0-9]{9}$')
           && a.pin is string && a.pin.matches('^[1-9][0-9]{5}$')
           && (!('isDefault' in a) || a.isDefault is bool);
       }

       // ---------- public store data (only admins can change it) ----------
       match /settings/{id}   { allow read: if true; allow write: if isAdmin(); }
       match /categories/{id} { allow read: if true; allow write: if isAdmin(); }

       // Shoppers see only published products. Admins see everything.
       match /products/{id} {
         allow read: if resource.data.status == 'published' || isAdmin();
         allow write: if isAdmin();
       }

       // ---------- admins list ----------
       match /admins/{uid} {
         allow read: if isOwner(uid) || isAdmin();
         allow write: if isAdmin();
       }

       // ---------- customer profiles ----------
       match /users/{uid} {
         allow read: if isOwner(uid) || isAdmin();
         allow create: if isOwner(uid)
           && request.resource.data.keys().hasOnly(['fullName', 'email', 'phone', 'provider', 'photoURL', 'createdAt', 'updatedAt'])
           && request.resource.data.keys().hasAll(['fullName', 'email'])
           && request.resource.data.email == request.auth.token.email
           && validProfile(request.resource.data);
         allow update: if isOwner(uid)
           && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['fullName', 'phone', 'photoURL', 'updatedAt'])
           && validProfile(request.resource.data);
         allow delete: if false;
       }

       // ---------- delivery addresses (each shopper only sees and edits their own) ----------
       match /addresses/{id} {
         allow read: if signedIn() && (resource.data.userId == request.auth.uid || isAdmin());
         allow create: if signedIn() && validAddress(request.resource.data);
         allow update: if signedIn() && resource.data.userId == request.auth.uid && validAddress(request.resource.data);
         allow delete: if signedIn() && resource.data.userId == request.auth.uid;
       }

       // ---------- orders ----------
       // Created and marked paid ONLY by the server (api in app.js, using the PayU secret).
       // A shopper can read their own orders; only admins can change status / tracking.
       match /orders/{id} {
         allow read: if signedIn() && (resource.data.userId == request.auth.uid || isAdmin());
         allow create, delete: if false;
         allow update: if isAdmin();
       }

       // ---------- product coupons (codes are secret: only admins can read or write; the server checks them) ----------
       match /productCoupons/{id} { allow read, write: if isAdmin(); }

       // ---------- reviews ----------
       // Created only by the server after it checks the order was delivered.
       match /reviews/{id} {
         allow read: if resource.data.visible == true
           || (signedIn() && resource.data.userId == request.auth.uid)
           || isAdmin();
         allow create: if false;
         allow update, delete: if isAdmin();
       }

       // ---------- everything else (e.g. the order counter) is closed to browsers ----------
       match /{document=**} {
         allow read, write: if false;
       }
     }
   }

   ==========================  storage.rules  ==========================
   (Firebase console -> Storage -> Rules -> select all, paste the text below -> Publish)

   rules_version = '2';
   service firebase.storage {
     match /b/{bucket}/o {

       function signedIn() { return request.auth != null; }
       // Admin = a document at admins/{uid} in Firestore (the same list the website uses).
       function isAdmin() { return signedIn() && firestore.exists(/databases/(default)/documents/admins/$(request.auth.uid)); }
       function isImage(maxMB) {
         return request.resource.contentType.matches('image/(png|jpeg|webp)') && request.resource.size < maxMB * 1024 * 1024;
       }

       // Product photos, category images, banners and the logo: everyone can see, only admins can change.
       match /products/{allPaths=**} {
         allow read: if true;
         allow create, update: if isAdmin() && isImage(10);
         allow delete: if isAdmin();
       }
       match /site/{allPaths=**} {
         allow read: if true;
         allow create, update: if isAdmin() && isImage(10);
         allow delete: if isAdmin();
       }

       // Review photos: a shopper can only write inside their own folder.
       match /reviews/{uid}/{allPaths=**} {
         allow read: if true;
         allow create: if signedIn() && request.auth.uid == uid && isImage(10);
         allow delete: if isAdmin() || (signedIn() && request.auth.uid == uid);
       }

       // Profile pictures.
       match /avatars/{uid}/{allPaths=**} {
         allow read: if true;
         allow create, update: if signedIn() && request.auth.uid == uid && isImage(5);
         allow delete: if signedIn() && request.auth.uid == uid;
       }

       // Print-on-demand designs: the owner uploads and reads their own; admins can read and delete all.
       match /designs/{uid}/{allPaths=**} {
         allow read: if signedIn() && (request.auth.uid == uid || isAdmin());
         allow create: if signedIn() && request.auth.uid == uid && isImage(15);
         allow delete: if signedIn() && (request.auth.uid == uid || isAdmin());
       }
     }
   }

   ========================================================================== */
"use strict";

/* ==========================================================================
   >>> EDIT THESE TWO BLOCKS <<<
   ========================================================================== */

// Firebase console -> Project settings -> Your apps -> Web app -> Config.
// (Safe to be public. Security comes from the Firestore / Storage rules above.)
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDidasKeBJ2KMqXHLCuP41JngvPGKIUp70",
  authDomain: "sayaya-b71c0.firebaseapp.com",
  projectId: "sayaya-b71c0",
  storageBucket: "sayaya-b71c0.firebasestorage.app",
  messagingSenderId: "526286690702",
  appId: "1:526286690702:web:3a2b8570ea5d8c10622cdf",
  measurementId: "G-8HVWCTQ44F"
};


// Your PayU Client ID (merchant key). Public by design.
// The Client Secret (salt) must ONLY live in Vercel -> Environment Variables as PAYU_CLIENT_SECRET.
const PAYU_CLIENT_ID = "TYh3IB";

/* ==========================================================================
   WHICH MODE? Node (Vercel) has no "window"  -> run the server.
               A browser has "window"         -> run the storefront.
   ========================================================================== */
if (typeof window === "undefined" && typeof module !== "undefined" && module.exports) {
  module.exports = buildServer();
} else {
  startClient().catch((err) => {
    console.error(err);
    const banner = document.getElementById("appOffline");
    if (banner) { banner.textContent = "The store couldn't load: " + ((err && err.message) || err) + ". Please refresh; if it keeps happening, send this message to the developer."; banner.hidden = false; }
  });
}

/* ==========================================================================
   PART A — SERVER (runs on Vercel only)
   ========================================================================== */
function buildServer() {
const crypto = require("crypto");
// firebase-admin is loaded only when needed, so the status check still works (and says what's wrong) if it isn't installed.
let adminLib = null;
function getAdmin() { return adminLib || (adminLib = require("firebase-admin")); }
function readServiceAccount() {
  let raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;
  raw = raw.trim();
  if (!raw.startsWith("{")) raw = Buffer.from(raw, "base64").toString("utf8");
  return JSON.parse(raw);
}

/* ---------------------------- helpers ---------------------------- */
function httpError(status, message) { const e = new Error(message); e.status = status; return e; }

function firebase() {
  const admin = getAdmin();
  if (admin.apps.length) return admin;
  let account;
  try { account = readServiceAccount(); } catch { throw httpError(503, "FIREBASE_SERVICE_ACCOUNT in Vercel is not valid JSON. Paste the whole key file again."); }
  if (!account) throw httpError(503, "The store server isn't configured yet (missing FIREBASE_SERVICE_ACCOUNT).");
  admin.initializeApp({ credential: admin.credential.cert(account) });
  admin.firestore().settings({ ignoreUndefinedProperties: true });
  return admin;
}

async function verifyUser(req) {
  const match = String(req.headers.authorization || "").match(/^Bearer (.+)$/);
  if (!match) throw httpError(401, "Please log in first.");
  try { return await firebase().auth().verifyIdToken(match[1]); }
  catch (err) { if (err && err.status) throw err; throw httpError(401, "Your session has expired. Please log in again."); }
}

function sendError(res, err) {
  if (!err || !err.status) console.error(err);
  res.status((err && err.status) || 500).json({ error: err && err.status ? err.message : "Something went wrong on our side. Please try again." });
}

const siteOrigin = (req) => (process.env.SITE_URL ? process.env.SITE_URL.replace(/\/$/, "") : `https://${req.headers["x-forwarded-host"] || req.headers.host}`);
const sha512 = (s) => crypto.createHash("sha512").update(s).digest("hex");
const safeEqual = (a, b) => { const x = Buffer.from(String(a).toLowerCase()), y = Buffer.from(String(b).toLowerCase()); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const redirect = (res, url) => { res.statusCode = 303; res.setHeader("Location", url); res.end(); };

/* ---------------------------- pricing (same rules as app.js section 3) ---------------------------- */
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

function calculateShipping(items, subtotalAfterDiscount, settings) {
  const s = settings || {};
  const allFree = items.length > 0 && items.every((it) => it.freeShipping);
  const threshold = Number(s.freeShippingThreshold);
  if (allFree || (threshold > 0 && subtotalAfterDiscount >= threshold)) return 0;
  const explicit = items.filter((it) => !it.freeShipping && it.shippingCharge !== undefined && it.shippingCharge !== null && it.shippingCharge !== "").map((it) => Number(it.shippingCharge) || 0);
  if (explicit.length) return round2(Math.max(...explicit));
  return round2(Number(s.defaultShippingCharge) || 0);
}

// items: { unitPrice, quantity, codHandlingFee, couponDiscount, freeShipping, shippingCharge }.
// Order total = items - coupon + shipping (+ COD fee for Cash on Delivery). No automatic bulk discount, no COD advance.
function calculateOrderPricing(items, paymentMethod, settings) {
  const subtotal = round2(items.reduce((s, it) => s + it.unitPrice * it.quantity, 0));
  const discount = round2(items.reduce((s, it) => s + (Number(it.couponDiscount) || 0), 0));
  const afterDiscount = round2(subtotal - discount);
  const shipping = calculateShipping(items, afterDiscount, settings);
  const isCod = paymentMethod === "cod";
  const codFee = isCod ? round2(items.reduce((s, it) => s + Math.max(0, Number(it.codHandlingFee) || 0) * it.quantity, 0)) : 0;
  const total = round2(afterDiscount + shipping + codFee);
  return { subtotal, discount, shipping, codFee, total, codAdvance: 0, payNow: isCod ? 0 : total, codRemaining: isCod ? total : 0 };
}

/* ---------------------------- GET /api : PayU status ---------------------------- */
function payuStatus(req, res) {
  let adminPackage = true;
  try { require.resolve("firebase-admin"); } catch { adminPackage = false; }
  let firebaseKey = "missing";
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try { const a = readServiceAccount(); firebaseKey = a && a.private_key && a.client_email ? "ok" : "invalid"; } catch { firebaseKey = "invalid"; }
  }
  res.status(200).json({
    configured: !!(process.env.PAYU_CLIENT_ID && process.env.PAYU_CLIENT_SECRET),
    hasKey: !!process.env.PAYU_CLIENT_ID, hasSecret: !!process.env.PAYU_CLIENT_SECRET,
    mode: process.env.PAYU_MODE === "live" ? "live" : "test",
    firebaseKey, adminPackage, firebaseAdmin: firebaseKey === "ok",
    qikinkConfigured: qikinkConfig().configured, qikinkMode: process.env.QIKINK_MODE === "live" ? "live" : "sandbox",
  });
}

/* ---------------------------- print-on-demand design check ---------------------------- */
// A design is only accepted if it is a file this shopper uploaded to designs/<their uid>/ in Firebase Storage.
function cleanDesignSide(side, uid) {
  if (!side) return null;
  const url = String(side.url || "");
  if (!url.startsWith("https://firebasestorage.googleapis.com/v0/b/") || !url.includes("/o/designs%2F" + uid + "%2F")) {
    throw httpError(400, "The design file isn't valid. Please upload your design again.");
  }
  const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
  return { url, cx: num(side.cx, 0, 100, 50), cy: num(side.cy, 0, 100, 50), scale: num(side.scale, 0.05, 1.5, 0.7) };
}

/* ---------------------------- action: coupon-check / payu-create ---------------------------- */
// Reads every line from Firestore (price, stock, COD rules, Qikink SKU). Nothing the browser sends is trusted except ids and quantities.
async function loadOrderItems(db, user, lines) {
  if (!lines.length || lines.length > 50) throw httpError(400, "Your cart is empty.");
  const items = [], seen = new Set();
  for (const line of lines) {
    const quantity = Number(line.quantity);
    if (!line.productId || !Number.isInteger(quantity) || quantity < 1 || quantity > 100) throw httpError(400, "One of the cart quantities isn't valid.");
    const lineKey = `${line.productId}::${line.variantId || ""}::${(line.custom && line.custom.id) || ""}`;
    if (seen.has(lineKey)) throw httpError(400, "The same item appears twice in the cart. Please refresh and try again.");
    seen.add(lineKey);

    const snap = await db.collection("products").doc(String(line.productId)).get();
    if (!snap.exists || snap.data().status !== "published") throw httpError(409, "An item in your cart is no longer available. Please remove it and try again.");
    const p = { id: snap.id, ...snap.data() };
    const variant = line.variantId ? (p.variants || []).find((v) => v.variantId === line.variantId) : null;
    if (line.variantId && !variant) throw httpError(409, `"${p.name}" changed. Please remove it from the cart and add it again.`);
    const stock = Number(variant ? variant.stock : p.stock) || 0;
    if (stock < quantity) throw httpError(409, stock > 0 ? `Only ${stock} left of "${p.name}". Please reduce the quantity.` : `"${p.name}" is out of stock.`);

    // Print on demand: the design must belong to this shopper; the back-side surcharge comes from the product, never from the browser.
    const podOn = !!(p.pod && p.pod.enabled);
    let custom = null, extra = 0;
    const baseImage = (variant && variant.images && variant.images[0]) || (p.images && p.images[0] && p.images[0].url) || "";
    if (podOn) {
      const front = cleanDesignSide(line.custom && line.custom.front, user.uid);
      const backIn = line.custom && line.custom.back;
      if (backIn && p.pod.allowBack === false) throw httpError(400, `Back-side printing isn't available for "${p.name}".`);
      const back = cleanDesignSide(backIn, user.uid);
      if (!front && !back) throw httpError(400, `Please add your design to "${p.name}" before ordering.`);
      extra = back ? Math.max(0, Number(p.pod.backExtra) || 0) : 0;
      const a = p.pod.area || {};
      custom = {
        id: String((line.custom && line.custom.id) || "").slice(0, 60), front, back,
        area: { x: Number(a.x) || 30, y: Number(a.y) || 22, w: Number(a.w) || 40, h: Number(a.h) || 40 },
        mockupFront: baseImage, mockupBack: p.pod.backImage || baseImage, backExtra: extra,
      };
    } else if (line.custom) throw httpError(400, `"${p.name}" can't be customized.`);

    items.push({
      productId: p.id, variantId: line.variantId || null, quantity, custom,
      productName: p.name, brand: p.brand || "", sku: String((variant && variant.sku) || (!p.hasVariants && p.sku) || "").trim(),
      variant: variant ? [variant.color, variant.size].filter(Boolean).join(" / ") : "",
      unitPrice: (Number(variant ? variant.price : p.price) || 0) + extra, mrp: (Number(variant ? variant.mrp : p.mrp) || 0) + extra,
      codAvailable: !!p.codAvailable && !custom,
      // Older products that never had a COD fee set are charged NOTHING (never an assumed default).
      codHandlingFee: Math.max(0, Number(p.codHandlingFee) || 0),
      freeShipping: !!p.freeShipping, shippingCharge: p.shippingCharge,
      couponDiscount: 0, couponPercent: 0, couponCode: "",
      image: custom ? custom.mockupFront : (p.images && p.images[0] && p.images[0].url) || "",
    });
  }
  return items;
}

// Product coupons live in productCoupons/{productId} (admin-only in the rules, so shoppers can't read the codes).
// A code applies only to the line(s) of the product it belongs to; one coupon per line, nothing stacks.
async function applyCoupon(db, items, rawCode) {
  const code = String(rawCode || "").trim().toUpperCase();
  if (!code) return { code: "", lines: [] };
  if (!/^[A-Z0-9_-]{2,30}$/.test(code)) throw httpError(400, "That coupon code isn't valid.");
  const ids = [...new Set(items.map((i) => i.productId))];
  const snaps = await Promise.all(ids.map((id) => db.collection("productCoupons").doc(id).get()));
  const byProduct = new Map(snaps.filter((s) => s.exists).map((s) => [s.id, s.data()]));
  const lines = [];
  for (const it of items) {
    const c = byProduct.get(it.productId);
    const pct = c ? Number(c.percent) : 0;
    if (c && c.enabled === true && String(c.code || "").trim().toUpperCase() === code && pct > 0 && pct <= 90) {
      it.couponCode = code; it.couponPercent = pct;
      it.couponDiscount = round2((it.unitPrice * it.quantity * pct) / 100);
      lines.push({ productId: it.productId, variantId: it.variantId, percent: pct, discount: it.couponDiscount });
    }
  }
  if (!lines.length) throw httpError(400, "This coupon isn't valid for the items in your order.");
  return { code, lines };
}

async function couponCheck(req, res) {
  const user = await verifyUser(req);
  const body = req.body || {};
  const paymentMethod = body.paymentMethod === "cod" ? "cod" : "online";
  const db = firebase().firestore();
  const settings = (await db.collection("settings").doc("store").get()).data() || {};
  const items = await loadOrderItems(db, user, Array.isArray(body.items) ? body.items : []);
  const coupon = await applyCoupon(db, items, body.couponCode);
  res.status(200).json({ code: coupon.code, lines: coupon.lines, pricing: calculateOrderPricing(items, paymentMethod, settings) });
}

async function payuCreate(req, res) {
  const user = await verifyUser(req);
  const body = req.body || {};
  const paymentMethod = body.paymentMethod === "cod" ? "cod" : "online";
  const db = firebase().firestore();

  const key = process.env.PAYU_CLIENT_ID || body.clientId;
  const salt = process.env.PAYU_CLIENT_SECRET;
  if (paymentMethod === "online" && (!key || !salt || /^PASTE_/.test(String(key)))) throw httpError(503, "Online payments aren't set up yet. Please contact the store.");

  const addrSnap = await db.collection("addresses").doc(String(body.addressId || "-")).get();
  if (!addrSnap.exists || addrSnap.data().userId !== user.uid) throw httpError(400, "Please choose a valid delivery address.");
  const address = { id: addrSnap.id, ...addrSnap.data() };
  const settings = (await db.collection("settings").doc("store").get()).data() || {};

  const items = await loadOrderItems(db, user, Array.isArray(body.items) ? body.items : []);
  if (paymentMethod === "cod" && items.some((it) => !it.codAvailable)) throw httpError(400, "Cash on Delivery isn't available for one of the items in your order.");
  const coupon = await applyCoupon(db, items, body.couponCode);
  const pricing = calculateOrderPricing(items, paymentMethod, settings);
  if (paymentMethod === "online" && !(pricing.total >= 1)) throw httpError(400, "The amount to pay isn't valid.");

  const orderId = await db.runTransaction(async (tx) => {
    const ref = db.collection("meta").doc("orderCounter");
    const snap = await tx.get(ref);
    const n = (snap.exists ? snap.data().n : 0) + 1;
    tx.set(ref, { n });
    return "ORD" + (100000 + n);
  });

  const now = Date.now();
  const orderRef = db.collection("orders").doc(orderId);
  const orderDoc = {
    orderId, userId: user.uid, customerEmail: user.email || "",
    items: items.map((it) => ({
      productId: it.productId, variantId: it.variantId, productName: it.productName, brand: it.brand, sku: it.sku, variant: it.variant,
      quantity: it.quantity, unitPrice: it.unitPrice, mrp: it.mrp, discount: round2(Math.max(0, it.mrp - it.unitPrice) * it.quantity),
      couponCode: it.couponCode, couponPercent: it.couponPercent, couponDiscount: it.couponDiscount,
      codHandlingFee: it.codHandlingFee, itemTotal: round2(it.unitPrice * it.quantity - it.couponDiscount), image: it.image, custom: it.custom || null,
    })),
    shippingAddressSnapshot: address,
    pricing: { subtotal: pricing.subtotal, discount: pricing.discount, couponCode: coupon.code, shipping: pricing.shipping, codFee: pricing.codFee, total: pricing.total, codAdvance: 0, codRemaining: pricing.codRemaining, v: 2 },
    payment: { method: paymentMethod, status: "pending", transactionId: "", paidAmount: 0, expectedAmount: pricing.total },
    courier: { name: "", trackingNumber: "", trackingUrl: "", shipmentDate: "", estimatedDelivery: "" },
    qikink: { submitState: "not_sent", orderId: "", status: "", error: "", submittedAt: 0, lastSyncAt: 0 },
    orderStatus: "payment_pending", estimatedDelivery: "", isBuyNow: !!body.isBuyNow,
    createdAt: now, placedAt: now, updatedAt: now,
    statusHistory: [{ status: "payment_pending", note: "", at: now, by: "system" }],
  };

  if (paymentMethod === "cod") {
    // Cash on Delivery: nothing is paid online. The order waits for admin approval and is NOT sent to Qikink until then.
    // Stock is taken together with saving the order, so two shoppers can't buy the last piece at once.
    await db.runTransaction(async (tx) => {
      const refs = [...new Set(items.map((it) => it.productId))].map((id) => db.collection("products").doc(id));
      const snaps = await Promise.all(refs.map((r) => tx.get(r)));
      const products = new Map(snaps.filter((x) => x.exists).map((x) => [x.id, x.data()]));
      for (const it of items) {
        const prod = products.get(it.productId);
        if (!prod) throw httpError(409, "An item in your order is no longer available. Please remove it and try again.");
        if (it.variantId) {
          const v = (prod.variants || []).find((x) => x.variantId === it.variantId);
          if (!v || (Number(v.stock) || 0) < it.quantity) throw httpError(409, `"${it.productName}" just went out of stock. Please reduce the quantity.`);
          v.stock = (Number(v.stock) || 0) - it.quantity;
        } else {
          if ((Number(prod.stock) || 0) < it.quantity) throw httpError(409, `"${it.productName}" just went out of stock. Please reduce the quantity.`);
          prod.stock = (Number(prod.stock) || 0) - it.quantity;
        }
      }
      for (const ref of refs) { const prod = products.get(ref.id); tx.update(ref, { stock: prod.stock ?? 0, variants: prod.variants || [], updatedAt: now }); }
      tx.set(orderRef, {
        ...orderDoc, orderStatus: "pending_admin_approval", stockDeducted: true, stockRestored: false,
        payment: { method: "cod", status: "cod_pending", transactionId: "", paidAmount: 0, expectedAmount: pricing.total },
        statusHistory: [{ status: "pending_admin_approval", note: "Cash on Delivery order placed. Waiting for admin approval.", at: now, by: "system" }],
      });
    });
    return res.status(200).json({ orderId, direct: true });
  }

  await orderRef.set(orderDoc);
  const origin = siteOrigin(req);
  const amountToPay = pricing.total;
  const fields = {
    key, txnid: orderId, amount: amountToPay.toFixed(2), productinfo: `Order ${orderId}`,
    firstname: String(address.fullName || "Customer").replace(/[^A-Za-z0-9 ]/g, "").trim().slice(0, 60) || "Customer",
    email: user.email || "", phone: String(address.phone || ""),
    surl: `${origin}/api`, furl: `${origin}/api`, udf1: orderId,
  };
  fields.hash = sha512([fields.key, fields.txnid, fields.amount, fields.productinfo, fields.firstname, fields.email, fields.udf1, "", "", "", "", "", "", "", "", "", salt].join("|"));
  const action = process.env.PAYU_MODE === "live" ? "https://secure.payu.in/_payment" : "https://test.payu.in/_payment";
  res.status(200).json({ orderId, action, fields });
}

/* ---------------------------- PayU result (PayU posts the shopper's browser here) ---------------------------- */
async function payuCallback(req, res) {
  const site = siteOrigin(req);
  const failedUrl = `${site}/#/checkout?payment=failed`;
  try {
    const b = req.body && typeof req.body === "object" ? req.body : {};
    const key = process.env.PAYU_CLIENT_ID || b.key;
    const salt = process.env.PAYU_CLIENT_SECRET;
    if (!salt || !b.txnid || !b.hash) return redirect(res, failedUrl);

    // PayU's signature: salt|status||||||udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key
    const parts = [salt, b.status || "", "", "", "", "", "", b.udf5 || "", b.udf4 || "", b.udf3 || "", b.udf2 || "", b.udf1 || "", b.email || "", b.firstname || "", b.productinfo || "", b.amount || "", b.txnid, key];
    if (b.additionalCharges) parts.unshift(b.additionalCharges);
    if (!safeEqual(sha512(parts.join("|")), b.hash)) { console.warn("PayU callback with a bad signature for", b.txnid); return redirect(res, failedUrl); }

    const orderId = String(b.txnid);
    const status = String(b.status || "").toLowerCase();
    if (status === "pending") return redirect(res, `${site}/#/orders`);

    const db = firebase().firestore();
    const FieldValue = getAdmin().firestore.FieldValue;
    const orderRef = db.collection("orders").doc(orderId);

    const outcome = await db.runTransaction(async (tx) => {
      const snap = await tx.get(orderRef);
      if (!snap.exists) return "missing";
      const order = snap.data();
      if (order.payment.status !== "pending") return order.payment.status === "failed" ? "failed" : "paid"; // already handled (safe against repeat posts)

      const now = Date.now();
      const paidOk = status === "success" && order.payment.method === "online" && Math.abs(Number(b.amount) - Number(order.payment.expectedAmount)) < 0.01;
      if (!paidOk) {
        // No Qikink submission for a failed, mismatched or cancelled payment.
        tx.update(orderRef, {
          "payment.status": "failed", orderStatus: "payment_failed", updatedAt: now,
          statusHistory: FieldValue.arrayUnion({ status: "payment_failed", note: status === "success" ? "Amount mismatch" : "Payment was not completed", at: now, by: "system" }),
        });
        return "failed";
      }

      const productRefs = [...new Set(order.items.map((it) => it.productId))].map((id) => db.collection("products").doc(id));
      const productSnaps = await Promise.all(productRefs.map((r) => tx.get(r)));
      const products = new Map(productSnaps.filter((s) => s.exists).map((s) => [s.id, s.data()]));
      let stockNote = "";
      for (const it of order.items) {
        const p = products.get(it.productId); if (!p) continue;
        if (it.variantId) {
          const v = (p.variants || []).find((x) => x.variantId === it.variantId);
          if (v) { if ((Number(v.stock) || 0) < it.quantity) stockNote = "Stock ran short, please check inventory."; v.stock = Math.max(0, (Number(v.stock) || 0) - it.quantity); }
        } else {
          if ((Number(p.stock) || 0) < it.quantity) stockNote = "Stock ran short, please check inventory.";
          p.stock = Math.max(0, (Number(p.stock) || 0) - it.quantity);
        }
      }
      for (const ref of productRefs) {
        const p = products.get(ref.id); if (!p) continue;
        tx.update(ref, { stock: p.stock ?? 0, variants: p.variants || [], updatedAt: now });
      }
      tx.update(orderRef, {
        "payment.status": "paid", "payment.transactionId": String(b.mihpayid || b.txnid), "payment.paidAmount": Number(b.amount), "payment.paidAt": now,
        orderStatus: "confirmed", placedAt: now, stockDeducted: true, stockRestored: false, updatedAt: now,
        statusHistory: FieldValue.arrayUnion({ status: "confirmed", note: ["Payment received and verified", stockNote].filter(Boolean).join(". "), at: now, by: "system" }),
      });
      return "paid-new";
    });

    if (outcome === "paid-new") {
      // Verified payment -> send the order to Qikink right away. A Qikink problem never undoes the payment; the admin sees the error and can retry.
      try { await submitToQikink(db, orderId, "system"); } catch (e) { console.error("Qikink submit after payment:", e && e.message); }
    }
    if (outcome === "paid" || outcome === "paid-new") return redirect(res, `${site}/#/order-details?id=${encodeURIComponent(orderId)}&placed=1`);
    return redirect(res, failedUrl);
  } catch (err) {
    console.error(err);
    return redirect(res, failedUrl);
  }
}

/* ---------------------------- Qikink (print-on-demand fulfilment) ----------------------------
   Credentials come only from Vercel env vars: QIKINK_CLIENT_ID, QIKINK_CLIENT_SECRET.
   QIKINK_MODE=live uses https://api.qikink.com, anything else uses the sandbox (https://sandbox.qikink.com).
   Orders are always sent with qikink_shipping "1" (Qikink picks the courier). We never pass a courier and never self-ship.
   NOT VERIFIED against Qikink's official API reference: the order-create and order-status paths and the response field names.
   They can be corrected without code changes: QIKINK_ORDER_PATH (default /api/order/create) and QIKINK_STATUS_PATH (default /api/order, id is added as ?id=, or put {id} in the path).
   Box packing and the brand sticker are Qikink dashboard settings; there is no API field for them, so nothing here claims they are on. */
function qikinkConfig() {
  const live = process.env.QIKINK_MODE === "live";
  return {
    id: process.env.QIKINK_CLIENT_ID || "", secret: process.env.QIKINK_CLIENT_SECRET || "", live,
    configured: !!(process.env.QIKINK_CLIENT_ID && process.env.QIKINK_CLIENT_SECRET),
    base: String(process.env.QIKINK_BASE_URL || (live ? "https://api.qikink.com" : "https://sandbox.qikink.com")).replace(/\/$/, ""),
    orderPath: process.env.QIKINK_ORDER_PATH || "/api/order/create",
    statusPath: process.env.QIKINK_STATUS_PATH || "/api/order",
  };
}
let qikinkTokenCache = { value: "", at: 0, base: "" };
async function qikinkFetch(url, init) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 20000);
  try { return await fetch(url, { ...init, signal: ctl.signal }); }
  catch (e) { throw httpError(502, e && e.name === "AbortError" ? "Qikink took too long to answer." : "Couldn't reach Qikink."); }
  finally { clearTimeout(t); }
}
async function qikinkToken(cfg, force) {
  if (!force && qikinkTokenCache.value && qikinkTokenCache.base === cfg.base && Date.now() - qikinkTokenCache.at < 45 * 60 * 1000) return qikinkTokenCache.value;
  const r = await qikinkFetch(cfg.base + "/api/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ClientId: cfg.id, client_secret: cfg.secret }).toString(),
  });
  let data = {}; try { data = await r.json(); } catch { /* not json */ }
  const token = data.Accesstoken || data.accesstoken || data.access_token;
  if (!r.ok || !token) throw httpError(502, `Qikink login failed (HTTP ${r.status}). Check QIKINK_CLIENT_ID and QIKINK_CLIENT_SECRET, and that API access is enabled on your Qikink account.`);
  qikinkTokenCache = { value: String(token), at: Date.now(), base: cfg.base };
  return qikinkTokenCache.value;
}
async function qikinkCall(cfg, method, path, body) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await qikinkToken(cfg, attempt > 0);
    const r = await qikinkFetch(cfg.base + path, {
      method, headers: { "Content-Type": "application/json", ClientId: cfg.id, Accesstoken: token },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (r.status === 401 && attempt === 0) continue;   // token expired: log in again once
    const text = await r.text(); let data = {}; try { data = JSON.parse(text); } catch { /* not json */ }
    return { ok: r.ok, status: r.status, data, text };
  }
  throw httpError(502, "Qikink rejected our login.");
}
// Finds the first value stored under any of these key names, however deeply it is nested in the reply.
function findKey(obj, names) {
  const want = names.map((n) => n.toLowerCase()); const queue = [obj]; let guard = 0;
  while (queue.length && guard++ < 400) {
    const cur = queue.shift();
    if (!cur || typeof cur !== "object") continue;
    for (const [k, v] of Object.entries(cur)) {
      if (want.includes(k.toLowerCase()) && v !== null && v !== undefined && typeof v !== "object" && String(v).trim() !== "") return String(v).trim();
    }
    for (const v of Object.values(cur)) if (v && typeof v === "object") queue.push(v);
  }
  return "";
}
async function qikinkLog(db, orderId, kind, result) {
  try { await db.collection("qikinkLogs").doc(orderId).set({ [kind]: { at: Date.now(), httpStatus: result.status || 0, body: String(result.text || result.message || "").slice(0, 2000) } }, { merge: true }); } catch { /* logging must never break an order */ }
}

const SUBMITTABLE = ["confirmed", "submit_failed"];
const FINAL_STATUSES = ["delivered", "cancelled", "rejected"];

function qikinkPayload(order) {
  const a = order.shippingAddressSnapshot || {};
  const names = String(a.fullName || "Customer").trim().split(/\s+/);
  const isCod = order.payment && order.payment.method === "cod";
  return {
    order_number: String(order.orderId),
    qikink_shipping: "1",
    gateway: isCod ? "COD" : "Prepaid",
    total_order_value: String(order.pricing.total),
    line_items: order.items.map((it) => {
      const line = { search_from_my_products: 1, sku: it.sku, quantity: String(it.quantity), price: String(it.unitPrice) };
      if (it.custom) {
        const designs = [];
        if (it.custom.front) designs.push({ placement_sku: "fr", design_link: it.custom.front.url, mockup_link: it.custom.mockupFront || "" });
        if (it.custom.back) designs.push({ placement_sku: "bk", design_link: it.custom.back.url, mockup_link: it.custom.mockupBack || "" });
        line.designs = designs;
      }
      return line;
    }),
    shipping_address: {
      first_name: names[0], last_name: names.slice(1).join(" ") || "-",
      address1: [a.houseFlat, a.road].filter(Boolean).join(", ") || a.area || a.villageTown || "-",
      address2: [a.villageTown, a.area, a.landmark].filter(Boolean).join(", "),
      phone: String(a.phone || ""), email: String(order.customerEmail || ""),
      city: a.city || a.district || "", zip: String(a.pin || ""), province: a.state || "", country_code: "IN",
    },
  };
}

async function recordSubmitFailure(db, orderId, message, by) {
  const FieldValue = getAdmin().firestore.FieldValue; const now = Date.now();
  await db.collection("orders").doc(orderId).update({
    "qikink.submitState": "failed", "qikink.error": String(message).slice(0, 600), "qikink.lastTriedAt": now,
    orderStatus: "submit_failed", updatedAt: now,
    statusHistory: FieldValue.arrayUnion({ status: "submit_failed", note: "Not sent to Qikink: " + String(message).slice(0, 300), at: now, by: by || "system" }),
  });
}

// Sends one order to Qikink exactly once. Safe to call again: an order that already has a Qikink id is never sent twice.
async function submitToQikink(db, orderId, by) {
  const FieldValue = getAdmin().firestore.FieldValue;
  const ref = db.collection("orders").doc(orderId);
  const claim = await db.runTransaction(async (tx) => {
    const s = await tx.get(ref);
    if (!s.exists) throw httpError(404, "Order not found.");
    const o = s.data(), q = o.qikink || {};
    if (q.submitState === "submitted" || q.orderId) return { already: true };
    if (!SUBMITTABLE.includes(o.orderStatus)) throw httpError(409, "This order can't be sent to Qikink in its current state.");
    if (q.submitState === "submitting" && Date.now() - (q.claimedAt || 0) < 120000) throw httpError(409, "This order is already being sent to Qikink. Please wait a moment.");
    tx.update(ref, { "qikink.submitState": "submitting", "qikink.claimedAt": Date.now() });
    return { already: false };
  });
  if (claim.already) return { already: true };

  try {
    const cfg = qikinkConfig();
    if (!cfg.configured) throw httpError(503, "Qikink isn't set up on the server. Add QIKINK_CLIENT_ID and QIKINK_CLIENT_SECRET in Vercel, then press Retry.");
    const order = (await ref.get()).data();

    // Every item needs the REAL Qikink SKU. Fill any that were empty at order time from the product (it may have been fixed since). Never invent one.
    let filled = false;
    for (const it of order.items) {
      if (String(it.sku || "").trim()) continue;
      const p = await db.collection("products").doc(it.productId).get();
      if (!p.exists) continue;
      const d = p.data(), v = it.variantId ? (d.variants || []).find((x) => x.variantId === it.variantId) : null;
      const sku = String((v && v.sku) || (!d.hasVariants && d.sku) || "").trim();
      if (sku) { it.sku = sku; filled = true; }
    }
    const missing = order.items.filter((it) => !String(it.sku || "").trim());
    if (missing.length) throw httpError(422, "Missing Qikink SKU for: " + missing.map((it) => it.productName + (it.variant ? " (" + it.variant + ")" : "")).join(", ") + ". Add the exact SKU from your Qikink dashboard to that product or variant, then press Retry.");
    if (filled) await ref.update({ items: order.items });

    const result = await qikinkCall(cfg, "POST", cfg.orderPath, qikinkPayload(order));
    await qikinkLog(db, orderId, "create", result);
    const d = result.data || {};
    const failedFlag = d.status === false || d.success === false || String(d.status || "").toLowerCase() === "error" || !!d.error;
    if (!result.ok || failedFlag) {
      const msg = findKey(d, ["message", "error", "msg"]) || String(result.text || "").slice(0, 300) || "Qikink refused the order.";
      throw httpError(502, `Qikink said (HTTP ${result.status}): ${msg}`);
    }
    const qid = findKey(d, ["qikink_order_id", "order_id", "orderid", "id"]) || String(orderId);
    const now = Date.now();
    await ref.update({
      "qikink.submitState": "submitted", "qikink.orderId": qid, "qikink.status": findKey(d, ["order_status", "status"]) || "Submitted",
      "qikink.error": "", "qikink.submittedAt": now, "qikink.mode": cfg.live ? "live" : "sandbox",
      orderStatus: "submitted_to_qikink", updatedAt: now,
      statusHistory: FieldValue.arrayUnion({ status: "submitted_to_qikink", note: "Sent to Qikink (courier is chosen automatically by Qikink)", at: now, by: by || "system" }),
    });
    return { submitted: true, qikinkOrderId: qid };
  } catch (err) {
    const msg = (err && err.message) || "Couldn't send the order to Qikink.";
    await recordSubmitFailure(db, orderId, msg, by);
    throw err && err.status ? err : httpError(502, msg);
  }
}

const STATUS_RANK = { confirmed: 0, submit_failed: 0, submitted_to_qikink: 1, processing: 2, packed: 3, shipped: 4, out_for_delivery: 5, delivered: 6 };
function mapQikinkStatus(text) {
  const s = String(text || "").toLowerCase();
  if (!s) return "";
  if (s.includes("deliver") && !s.includes("out for") && !s.includes("undeliver")) return "delivered";
  if (s.includes("out for delivery")) return "out_for_delivery";
  if (s.includes("transit") || s.includes("manifest") || s.includes("shipped") || s.includes("dispatch")) return "shipped";
  if (s.includes("printed") || s.includes("picklist")) return "packed";
  if (s.includes("to be printed") || s.includes("live") || s.includes("hold")) return "processing";
  return "";
}

// Pulls the latest status, courier, AWB and tracking link from Qikink. Best effort: field names are matched by name, not by a fixed layout.
async function syncQikinkOrder(db, orderId) {
  const FieldValue = getAdmin().firestore.FieldValue;
  const ref = db.collection("orders").doc(orderId);
  const snap = await ref.get();
  if (!snap.exists) throw httpError(404, "Order not found.");
  const o = snap.data(), q = o.qikink || {};
  if (q.submitState !== "submitted") throw httpError(409, "This order hasn't been sent to Qikink yet.");
  const cfg = qikinkConfig();
  if (!cfg.configured) throw httpError(503, "Qikink isn't set up on the server.");
  const id = encodeURIComponent(q.orderId || orderId);
  const path = cfg.statusPath.includes("{id}") ? cfg.statusPath.replace("{id}", id) : `${cfg.statusPath}${cfg.statusPath.includes("?") ? "&" : "?"}id=${id}`;
  const result = await qikinkCall(cfg, "GET", path);
  await qikinkLog(db, orderId, "status", result);
  if (!result.ok) throw httpError(502, `Qikink couldn't give the status (HTTP ${result.status}). The status path may need correcting (QIKINK_STATUS_PATH).`);

  const d = result.data || {};
  const rawStatus = findKey(d, ["order_status", "status", "orderstatus"]);
  const awb = findKey(d, ["awb", "awb_number", "awb_no", "tracking_number", "tracking_no", "tracking_id"]);
  const courier = findKey(d, ["courier", "courier_name", "shipping_partner", "carrier"]);
  const url = findKey(d, ["tracking_url", "track_url", "tracking_link", "track_link"]);
  const now = Date.now();
  const update = { "qikink.lastSyncAt": now, updatedAt: now };
  if (rawStatus) update["qikink.status"] = rawStatus;
  if (courier) update["courier.name"] = courier;
  if (awb) update["courier.trackingNumber"] = awb;
  if (/^https?:\/\//i.test(url)) update["courier.trackingUrl"] = url;
  if (awb && !(o.courier && o.courier.shipmentDate)) update["courier.shipmentDate"] = new Date(now).toISOString().slice(0, 10);
  const next = mapQikinkStatus(rawStatus);
  if (next && !FINAL_STATUSES.includes(o.orderStatus) && (STATUS_RANK[next] ?? -1) > (STATUS_RANK[o.orderStatus] ?? -1)) {
    update.orderStatus = next;
    update.statusHistory = FieldValue.arrayUnion({ status: next, note: `Qikink status: ${rawStatus}`, at: now, by: "qikink" });
  }
  if (/cancel/i.test(rawStatus || "") && !FINAL_STATUSES.includes(o.orderStatus)) update["qikink.needsAttention"] = "Qikink shows this order as cancelled. Check it in the Qikink dashboard.";
  await ref.update(update);
  return { status: rawStatus, courier, awb, trackingUrl: update["courier.trackingUrl"] || "", orderStatus: update.orderStatus || o.orderStatus };
}

/* ---------------------------- order cancel / reject / approve ---------------------------- */
const CANCEL_WINDOW_MS = 24 * 60 * 60 * 1000;
const CUSTOMER_CANCELLABLE = ["pending_admin_approval", "pending_admin_confirmation", "confirmed", "submit_failed", "submitted_to_qikink", "processing"];

// Cancels (or rejects) an order and puts the stock back, once. Customers: only their own order, only within 24 hours of placing it, only before it is packed.
async function cancelOrder(db, orderId, opts) {
  const FieldValue = getAdmin().firestore.FieldValue;
  const ref = db.collection("orders").doc(orderId);
  let flags = {};
  await db.runTransaction(async (tx) => {
    const s = await tx.get(ref);
    if (!s.exists) throw httpError(404, "Order not found.");
    const o = s.data(), now = Date.now();
    if (opts.uid) {
      if (o.userId !== opts.uid) throw httpError(403, "This isn't your order.");
      if (now - (o.placedAt || o.createdAt || 0) > CANCEL_WINDOW_MS) throw httpError(403, "This order can no longer be cancelled. Orders can only be cancelled within 24 hours of placing them.");
      if (!CUSTOMER_CANCELLABLE.includes(o.orderStatus)) throw httpError(409, o.orderStatus === "cancelled" ? "This order is already cancelled." : "This order can no longer be cancelled because it is already on its way.");
    } else if (FINAL_STATUSES.includes(o.orderStatus) || o.orderStatus === "payment_pending" || o.orderStatus === "payment_failed") {
      throw httpError(409, "This order can't be changed any more.");
    }
    const finalStatus = opts.finalStatus || "cancelled";
    const restore = o.stockRestored !== true && o.stockDeducted !== false;
    const refs = restore ? [...new Set(o.items.map((it) => it.productId))].map((id) => db.collection("products").doc(id)) : [];
    const snaps = await Promise.all(refs.map((r) => tx.get(r)));
    const products = new Map(snaps.filter((x) => x.exists).map((x) => [x.id, x.data()]));
    if (restore) {
      for (const it of o.items) {
        const p = products.get(it.productId); if (!p) continue;
        if (it.variantId) { const v = (p.variants || []).find((x) => x.variantId === it.variantId); if (v) v.stock = (Number(v.stock) || 0) + it.quantity; }
        else p.stock = (Number(p.stock) || 0) + it.quantity;
      }
      for (const r of refs) { const p = products.get(r.id); if (p) tx.update(r, { stock: p.stock ?? 0, variants: p.variants || [], updatedAt: now }); }
    }
    const sent = !!(o.qikink && (o.qikink.orderId || o.qikink.submitState === "submitted"));
    const paid = o.payment && o.payment.status === "paid";
    const note = opts.uid ? "Cancelled by customer" + (opts.reason ? ": " + opts.reason : "") : (finalStatus === "rejected" ? "Rejected by admin" : "Cancelled by admin") + (opts.note ? ": " + opts.note : "");
    const upd = {
      orderStatus: finalStatus, cancelledAt: now, cancelledBy: opts.uid ? "customer" : "admin", cancelReason: String(opts.reason || opts.note || "").slice(0, 200),
      stockRestored: true, updatedAt: now,
      statusHistory: FieldValue.arrayUnion({ status: finalStatus, note, at: now, by: opts.uid ? "customer" : "admin" }),
    };
    if (sent) upd["qikink.needsManualCancel"] = true;
    if (paid) upd["payment.refundStatus"] = "refund_pending";
    tx.update(ref, upd);
    flags = { needsManualCancel: sent, refundPending: !!paid };
  });
  return flags;
}

async function verifyAdmin(req) {
  const user = await verifyUser(req);
  const snap = await firebase().firestore().collection("admins").doc(user.uid).get();
  if (!snap.exists) throw httpError(403, "Only store admins can do this.");
  return user;
}

async function cancelOrderAction(req, res) {
  const user = await verifyUser(req);
  const b = req.body || {};
  const result = await cancelOrder(firebase().firestore(), String(b.orderId || ""), { uid: user.uid, reason: String(b.reason || "").slice(0, 100) });
  res.status(200).json({ ok: true, refundPending: result.refundPending });
}

async function adminOrderAction(req, res) {
  const admin = await verifyAdmin(req);
  const b = req.body || {};
  const orderId = String(b.orderId || "");
  const db = firebase().firestore();
  const FieldValue = getAdmin().firestore.FieldValue;
  const ref = db.collection("orders").doc(orderId);
  const op = String(b.op || "");

  if (op === "reject" || op === "cancel") {
    const out = await cancelOrder(db, orderId, { finalStatus: op === "reject" ? "rejected" : "cancelled", note: String(b.note || "").slice(0, 200) });
    return res.status(200).json({ ok: true, ...out });
  }
  if (op === "approve") {
    // Server-side admin check above. Approving moves a COD order to "confirmed" and sends it to Qikink exactly once.
    await db.runTransaction(async (tx) => {
      const s = await tx.get(ref);
      if (!s.exists) throw httpError(404, "Order not found.");
      const o = s.data(), now = Date.now();
      if (o.orderStatus === "pending_admin_approval" || o.orderStatus === "pending_admin_confirmation") {
        tx.update(ref, {
          orderStatus: "confirmed", approvedAt: now, approvedBy: admin.uid, updatedAt: now,
          statusHistory: FieldValue.arrayUnion({ status: "confirmed", note: "Approved by admin" + (b.note ? ": " + String(b.note).slice(0, 200) : ""), at: now, by: "admin" }),
        });
      } else if (!SUBMITTABLE.includes(o.orderStatus) && !(o.qikink && o.qikink.orderId)) {
        throw httpError(409, "This order isn't waiting for approval.");
      }
    });
    try { const r = await submitToQikink(db, orderId, "admin"); return res.status(200).json({ ok: true, ...r }); }
    catch (e) { return res.status(200).json({ ok: true, approved: true, submitError: (e && e.message) || "Couldn't send to Qikink." }); }
  }
  if (op === "submit") {
    const r = await submitToQikink(db, orderId, "admin");
    return res.status(200).json({ ok: true, ...r });
  }
  if (op === "sync") {
    const r = await syncQikinkOrder(db, orderId);
    return res.status(200).json({ ok: true, ...r });
  }
  throw httpError(400, "Unknown order action.");
}

// Daily safety net (Vercel cron, see vercel.json): refresh tracking for orders that are with Qikink. Needs CRON_SECRET in Vercel.
async function qikinkCron(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== "Bearer " + secret) throw httpError(401, "Not allowed.");
  if (!qikinkConfig().configured) return res.status(200).json({ ok: true, skipped: "Qikink isn't configured" });
  const db = firebase().firestore();
  const snap = await db.collection("orders").where("qikink.submitState", "==", "submitted").limit(40).get();
  let done = 0, failed = 0;
  for (const d of snap.docs) {
    if (FINAL_STATUSES.includes(d.data().orderStatus)) continue;
    try { await syncQikinkOrder(db, d.id); done++; } catch { failed++; }
  }
  res.status(200).json({ ok: true, synced: done, failed });
}

/* ---------------------------- action: review ---------------------------- */
async function addReview(req, res) {
  const user = await verifyUser(req);
  const b = req.body || {};
  const rating = Number(b.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw httpError(400, "Please choose a star rating.");
  const text = String(b.text || "").trim().slice(0, 2000);
  const title = String(b.title || "").trim().slice(0, 120);
  const images = (Array.isArray(b.images) ? b.images : []).slice(0, 3).filter((u) => typeof u === "string" && u.startsWith("https://firebasestorage.googleapis.com/"));

  const db = firebase().firestore();
  const orderSnap = await db.collection("orders").doc(String(b.orderId || "-")).get();
  const order = orderSnap.exists ? orderSnap.data() : null;
  if (!order || order.userId !== user.uid || order.orderStatus !== "delivered" || !(order.items || []).some((it) => it.productId === b.productId)) {
    throw httpError(403, "You can review a product once your order has been delivered.");
  }
  const dup = await db.collection("reviews").where("userId", "==", user.uid).where("productId", "==", b.productId).where("orderId", "==", b.orderId).limit(1).get();
  if (!dup.empty) throw httpError(409, "You've already reviewed this product.");

  const profile = await db.collection("users").doc(user.uid).get();
  const userName = (profile.exists && profile.data().fullName) || user.name || (user.email || "").split("@")[0] || "Shopper";
  const review = {
    productId: String(b.productId), userId: user.uid, userName, orderId: String(b.orderId), variantId: b.variantId || null,
    rating, title, text, images, verifiedPurchase: true, visible: true, createdAt: Date.now(),
  };
  const ref = await db.collection("reviews").add(review);

  const all = await db.collection("reviews").where("productId", "==", review.productId).where("visible", "==", true).get();
  const ratings = all.docs.map((d) => Number(d.data().rating) || 0);
  const summary = { average: Math.round((ratings.reduce((s, r) => s + r, 0) / (ratings.length || 1)) * 100) / 100, count: ratings.length };
  await db.collection("products").doc(review.productId).update({ rating: summary });
  res.status(200).json({ review: { id: ref.id, ...review }, rating: summary });
}

/* ---------------------------- search-engine pages ----------------------------
   Google can't read "#/product?id=..." addresses, so every published product also has a normal address:
       /p/<product-name>-<id>      a ready-made page with title, description, price, photos and structured data
       /sitemap.xml                a list of all those addresses (submit it in Search Console)
       /robots.txt                 points Google at the sitemap
   vercel.json rewrites these three paths to this function. People who open /p/... land on the normal shop page. */
const seoEsc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const seoSlug = (v) => String(v || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).replace(/-+$/g, "") || "product";
const ldJson = (o) => JSON.stringify(o).replace(/</g, "\\u003c");
const plainText = (t, n) => String(t || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").replace(/\s+([.,;:!?])/g, "$1").trim().slice(0, n);

let shellCache = { html: "", at: 0 };
async function loadShell(req) {
  if (shellCache.html && Date.now() - shellCache.at < 60000) return shellCache.html;
  const r = await fetch(siteOrigin(req) + "/index.html");
  if (!r.ok) throw httpError(502, "Couldn't load the page template.");
  shellCache = { html: await r.text(), at: Date.now() };
  return shellCache.html;
}
function sendHtml(res, status, html, cache) {
  res.statusCode = status;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  if (cache) res.setHeader("Cache-Control", cache);
  res.end(html);
}
function seoNotFound(res) {
  sendHtml(res, 404, '<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><title>Product not found</title><p style="font-family:sans-serif;padding:2rem">This product isn\'t available any more. <a href="/">Go to the shop</a></p>');
}

async function seoProduct(req, res, slugParam) {
  const id = String(slugParam || "").split("-").pop();
  if (!/^[A-Za-z0-9_]{3,80}$/.test(id)) return seoNotFound(res);
  const db = firebase().firestore();
  const snap = await db.collection("products").doc(id).get();
  const p = snap.exists ? snap.data() : null;
  if (!p || p.status !== "published") return seoNotFound(res);

  const origin = siteOrigin(req);
  const canonicalSlug = `${seoSlug(p.name)}-${id}`;
  if (String(slugParam) !== canonicalSlug) { res.statusCode = 301; res.setHeader("Location", `${origin}/p/${canonicalSlug}`); return res.end(); }

  const settings = (await db.collection("settings").doc("store").get()).data() || {};
  const storeName = settings.storeName || "Online store";
  const variants = p.hasVariants && Array.isArray(p.variants) ? p.variants : [];
  const prices = (variants.length ? variants.map((v) => Number(v.price) || 0) : [Number(p.price) || 0]).filter((x) => x > 0);
  const low = prices.length ? Math.min(...prices) : 0, high = prices.length ? Math.max(...prices) : 0;
  const stock = variants.length ? variants.reduce((sum, v) => sum + (Number(v.stock) || 0), 0) : Number(p.stock) || 0;
  const images = [...new Set([...(p.images || []).map((i) => i && i.url), ...variants.flatMap((v) => v.images || [])].filter((u) => typeof u === "string" && /^https?:\/\//.test(u)))].slice(0, 8);
  const desc = plainText(p.shortDescription || p.description, 300) || `${p.name} from ${storeName}. Fast delivery and secure online payment.`;
  const title = `${p.name} – ${storeName}`.slice(0, 70);
  const url = `${origin}/p/${canonicalSlug}`;
  const availability = stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock";
  const offers = low !== high
    ? { "@type": "AggregateOffer", lowPrice: low, highPrice: high, priceCurrency: "INR", offerCount: variants.length, availability, url }
    : { "@type": "Offer", price: low, priceCurrency: "INR", availability, url, itemCondition: "https://schema.org/NewCondition" };
  const ld = { "@context": "https://schema.org", "@type": "Product", name: p.name, description: desc, sku: String(p.sku || p.productCode || id), url, offers };
  if (images.length) ld.image = images;
  if (p.brand) ld.brand = { "@type": "Brand", name: p.brand };
  if (p.rating && Number(p.rating.count) > 0) ld.aggregateRating = { "@type": "AggregateRating", ratingValue: Number(p.rating.average) || 0, reviewCount: Number(p.rating.count) };

  const head = [
    '<base href="/">',
    `<link rel="canonical" href="${seoEsc(url)}">`,
    '<meta property="og:type" content="product">',
    `<meta property="og:site_name" content="${seoEsc(storeName)}">`,
    `<meta property="og:title" content="${seoEsc(title)}">`,
    `<meta property="og:description" content="${seoEsc(desc)}">`,
    `<meta property="og:url" content="${seoEsc(url)}">`,
    images[0] ? `<meta property="og:image" content="${seoEsc(images[0])}">` : "",
    `<meta name="twitter:card" content="${images[0] ? "summary_large_image" : "summary"}">`,
    `<meta property="product:price:amount" content="${low}">`, '<meta property="product:price:currency" content="INR">',
    `<script type="application/ld+json">${ldJson(ld)}</script>`,
    // People land on the normal shop page for this product; search engines read the page content below.
    `<script>try{history.replaceState(null,"","/#/product?id=${id}")}catch(e){}</script>`,
  ].filter(Boolean).join("\n");

  const content = `<main class="page" id="app" tabindex="-1"><article class="container" style="padding:1.5rem 0"><h1>${seoEsc(p.name)}</h1>` +
    (images[0] ? `<img src="${seoEsc(images[0])}" alt="${seoEsc(p.name)}" width="400" height="400" style="max-width:100%;height:auto">` : "") +
    `<p><strong>&#8377;${low}</strong>${low !== high ? " onwards" : ""}${stock > 0 ? " &middot; In stock" : " &middot; Out of stock"}</p><p>${seoEsc(desc)}</p><p><a href="/#/products">See all products</a></p></article></main>`;

  let html = await loadShell(req);
  html = html.replace(/<title>[\s\S]*?<\/title>/, () => `<title>${seoEsc(title)}</title>`)
    .replace(/<meta name="description"[^>]*>/, () => `<meta name="description" content="${seoEsc(desc)}">`)
    .replace("<head>", () => "<head>\n" + head)
    .replace(/<main class="page" id="app"[^>]*><\/main>/, () => content);
  sendHtml(res, 200, html, "public, s-maxage=300, stale-while-revalidate=86400");
}

async function seoSitemap(req, res) {
  const origin = siteOrigin(req);
  const snap = await firebase().firestore().collection("products").where("status", "==", "published").get();
  const urls = [`<url><loc>${seoEsc(origin)}/</loc></url>`];
  snap.docs.forEach((d) => {
    const p = d.data();
    const last = Number(p.updatedAt) ? `<lastmod>${new Date(Number(p.updatedAt)).toISOString()}</lastmod>` : "";
    urls.push(`<url><loc>${seoEsc(origin)}/p/${seoEsc(seoSlug(p.name))}-${seoEsc(d.id)}</loc>${last}</url>`);
  });
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=600, stale-while-revalidate=86400");
  res.end(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`);
}

function seoRobots(req, res) {
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=3600");
  res.end(`User-agent: *\nAllow: /\nDisallow: /api\n\nSitemap: ${siteOrigin(req)}/sitemap.xml\n`);
}

/* ---------------------------- the one entry point ---------------------------- */
return async (req, res) => {
  try {
    if (req.method === "GET") {
      const q = new URL(req.url || "/", "http://x").searchParams, seo = q.get("seo");
      if (seo === "product") return await seoProduct(req, res, q.get("slug"));
      if (seo === "sitemap") return await seoSitemap(req, res);
      if (seo === "robots") return seoRobots(req, res);
      if (q.get("cron") === "qikink-sync") return await qikinkCron(req, res);
      return payuStatus(req, res);
    }
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
    const b = req.body && typeof req.body === "object" ? req.body : {};
    if (b.txnid && b.hash && !b.action) return await payuCallback(req, res);   // PayU's own result post
    if (b.action === "payu-create") return await payuCreate(req, res);
    if (b.action === "review") return await addReview(req, res);
    if (b.action === "coupon-check") return await couponCheck(req, res);
    if (b.action === "cancel-order") return await cancelOrderAction(req, res);
    if (b.action === "admin-order") return await adminOrderAction(req, res);
    throw httpError(400, "Unknown request.");
  } catch (err) {
    sendError(res, err);
  }
};

}

/* ==========================================================================
   PART B — STOREFRONT + ADMIN PANEL (runs in the browser only)
   Firebase is loaded from Google's CDN right below; there is no build step.
   ========================================================================== */
async function startClient() {
  // Firebase is loaded from Google's CDN. If that (or its start-up) fails, the page still opens and
  // shows the exact reason in the banner instead of dying silently.
  let FIREBASE_ERROR = "";
  const firebaseMissing = () => { throw new Error("Firebase isn't available: " + (FIREBASE_ERROR || "it was not loaded.")); };
  let initializeApp = firebaseMissing,
    initializeAuth = firebaseMissing, indexedDBLocalPersistence = null, browserLocalPersistence = null, browserPopupRedirectResolver = null, onAuthStateChanged = firebaseMissing, signInWithEmailAndPassword = firebaseMissing,
    createUserWithEmailAndPassword = firebaseMissing, fbSignOut = firebaseMissing, GoogleAuthProvider = firebaseMissing,
    signInWithPopup = firebaseMissing, sendPasswordResetEmail = firebaseMissing, updateProfile = firebaseMissing,
    updatePassword = firebaseMissing, reauthenticateWithCredential = firebaseMissing, EmailAuthProvider = {},
    initializeFirestore = firebaseMissing, persistentLocalCache = null, persistentMultipleTabManager = null, collection = firebaseMissing, doc = firebaseMissing, getDoc = firebaseMissing,
    getDocs = firebaseMissing, setDoc = firebaseMissing, updateDoc = firebaseMissing, deleteDoc = firebaseMissing,
    onSnapshot = firebaseMissing, query = firebaseMissing, where = firebaseMissing, arrayUnion = firebaseMissing,
    getStorage = firebaseMissing, storageRef = firebaseMissing, uploadBytes = firebaseMissing, getDownloadURL = firebaseMissing;
  try {
    const fbBase = "https://www.gstatic.com/firebasejs/10.14.1/";
    // Storage (image uploads) is big and only needed in the admin panel / design uploads, so it loads later, on demand.
    const [appM, authM, fsM] = await Promise.all([
      import(fbBase + "firebase-app.js"), import(fbBase + "firebase-auth.js"), import(fbBase + "firebase-firestore.js"),
    ]);
    ({ initializeApp } = appM);
    ({ initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, browserPopupRedirectResolver, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut: fbSignOut,
       GoogleAuthProvider, signInWithPopup, sendPasswordResetEmail, updateProfile, updatePassword,
       reauthenticateWithCredential, EmailAuthProvider } = authM);
    ({ initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, onSnapshot, query, where, arrayUnion } = fsM);
  } catch (err) {
    console.error("Could not load Firebase:", err);
    FIREBASE_ERROR = "could not download Firebase from Google (" + ((err && err.message) || err) + ")";
  }

/* ==========================================================================
   1. CONFIG & CONSTANTS
   ========================================================================== */

const STORE_NAME = "Your Store";
const CURRENCY = "₹";

// ---- Pricing rules ----
// No automatic bulk discount and no COD advance. Discounts come only from a product coupon the shopper types in at checkout.
// Cash on Delivery: each product sets a COD fee PER UNIT (product form). Fee x quantity is added to the amount paid at delivery.
// A product with no fee set is charged nothing. Everything is recalculated on the server from Firestore before an order is saved.

// Only things that are fine to live on the shopper's device:
const LS_KEYS = {
  cart: "ys_cart_v1",
  wishlist: "ys_wishlist_v1",
  recentlyViewed: "ys_recently_viewed_v1",
  recentSearches: "ys_recent_searches_v1",
};

/* ==========================================================================
   2. UTILITIES
   ========================================================================== */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function formatMoney(amount) {
  const n = Math.round((Number(amount) || 0) * 100) / 100;
  const isWhole = Number.isInteger(n);
  return CURRENCY + n.toLocaleString("en-IN", {
    minimumFractionDigits: isWhole ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(value, opts) {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", opts || { day: "numeric", month: "short", year: "numeric" });
}

function formatDateTime(value) {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function debounce(fn, wait = 250) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

function genId(prefix) {
  const rand = Math.random().toString(36).slice(2, 9);
  return `${prefix}_${Date.now().toString(36)}${rand}`;
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function slugify(str) {
  return String(str || "")
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }

function readLS(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}
function writeLS(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full/disabled — degrade silently */ }
}

// ---- Toast ----
function toast(message, tone = "default", timeout = 3200) {
  const region = $("#toastRegion");
  if (!region) return;
  const el = document.createElement("div");
  el.className = "toast" + (tone === "error" ? " toast--error" : tone === "success" ? " toast--success" : "");
  el.setAttribute("role", tone === "error" ? "alert" : "status");
  el.textContent = message;
  region.appendChild(el);
  setTimeout(() => el.remove(), timeout);
}

// ---- Dialogs (native <dialog>): generic open/close wiring ----
function openDialog(dialog) {
  if (!dialog) return;
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
}
function closeDialog(dialog) {
  if (!dialog) return;
  if (typeof dialog.close === "function" && dialog.open) dialog.close();
  else dialog.removeAttribute("open");
}
function wireDialogDismiss(root = document) {
  $$("[data-dialog-close]", root).forEach((btn) => {
    if (btn.dataset.wired) return;
    btn.dataset.wired = "1";
    btn.addEventListener("click", () => closeDialog(btn.closest("dialog")));
  });
  $$("dialog", root).forEach((dlg) => {
    if (dlg.dataset.wiredBackdrop) return;
    dlg.dataset.wiredBackdrop = "1";
    dlg.addEventListener("click", (e) => { if (e.target === dlg) closeDialog(dlg); });
  });
}

// ---- Bottom sheet (filters) open/close, shared pattern ----
function openSheet(sheet, backdrop) {
  if (!sheet) return;
  if (backdrop) backdrop.hidden = false;
  sheet.dataset.open = "true";
  sheet.querySelector("input, select, button, [tabindex]")?.focus({ preventScroll: true });
  document.body.style.overflow = "hidden";
}
function closeSheet(sheet, backdrop) {
  if (!sheet) return;
  sheet.dataset.open = "false";
  if (backdrop) backdrop.hidden = true;
  document.body.style.overflow = "";
}

/* ==========================================================================
   3. PRICING ENGINE
   - Subtotal = sum of (price x quantity).
   - Coupon discount: only on the line of the product the coupon belongs to (the server decides it; the browser just shows it).
   - Cash on Delivery: nothing is paid online. Each product's COD fee per unit x quantity is added, and the shopper pays the
     whole amount at delivery. COD is blocked if any item doesn't support it.
   All figures come from this one function so every screen agrees; the server uses the same rules.
   ========================================================================== */

function lineTotal(item) { return item.unitPrice * item.quantity; }
function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }
function codBlockedItems(items) { return items.filter((it) => !it.codAvailable); }

function calculateShipping(items, subtotalAfterDiscount, settings) {
  const s = settings || {};
  const allFreeShipping = items.length > 0 && items.every((it) => it.freeShipping);
  const threshold = Number(s.freeShippingThreshold);
  const overThreshold = threshold > 0 && subtotalAfterDiscount >= threshold;
  if (allFreeShipping || overThreshold) return 0;
  // Only items that explicitly set their own shippingCharge opt out of the site default.
  const explicitCharges = items
    .filter((it) => !it.freeShipping && it.shippingCharge !== undefined && it.shippingCharge !== null && it.shippingCharge !== "")
    .map((it) => Number(it.shippingCharge) || 0);
  if (explicitCharges.length) return round2(Math.max(...explicitCharges));
  return round2(Number(s.defaultShippingCharge) || 0);
}

// items: { unitPrice, quantity, codAvailable, codHandlingFee, couponDiscount, freeShipping, shippingCharge }
function calculateOrderPricing(items, paymentMethod, settings) {
  const subtotal = round2(items.reduce((sum, it) => sum + lineTotal(it), 0));
  const discount = round2(items.reduce((sum, it) => sum + (Number(it.couponDiscount) || 0), 0));
  const afterDiscount = round2(subtotal - discount);
  const shipping = calculateShipping(items, afterDiscount, settings);
  const isCod = paymentMethod === "cod";
  const blocked = codBlockedItems(items);
  const codFee = isCod ? round2(items.reduce((sum, it) => sum + Math.max(0, Number(it.codHandlingFee) || 0) * it.quantity, 0)) : 0;
  const total = round2(afterDiscount + shipping + codFee);
  return {
    subtotal, discount, shipping, codFee, total, paymentMethod,
    codBlocked: blocked, codBlockedNames: blocked.map((b) => b.productName || b.name),
    payNow: isCod ? 0 : total, codRemaining: isCod ? total : 0,
  };
}

// Orders saved before this upgrade (pricing.v missing) kept the COD fee outside "total" and had an online advance. Keep them readable.
function orderTotalOf(o) { return o.pricing.v >= 2 ? o.pricing.total : round2(o.pricing.total + (Number(o.pricing.codFee) || 0)); }
function orderDueAtDelivery(o) {
  if (!o.payment || o.payment.method !== "cod") return 0;
  return o.pricing.v >= 2 ? o.pricing.total : round2(o.pricing.total - (Number(o.pricing.codAdvance) || 0));
}
// Customers may cancel within 24 hours of placing the order, and only before it is packed.
const CANCEL_WINDOW_MS = 24 * 60 * 60 * 1000;
const CUSTOMER_CANCELLABLE = ["pending_admin_approval", "pending_admin_confirmation", "confirmed", "submit_failed", "submitted_to_qikink", "processing"];
function cancelDeadlineOf(o) { return (o.placedAt || o.createdAt || 0) + CANCEL_WINDOW_MS; }
function canCustomerCancel(o) { return CUSTOMER_CANCELLABLE.includes(o.orderStatus) && Date.now() < cancelDeadlineOf(o); }

/* ==========================================================================
   4. FIREBASE + DATA LAYER
   The pages call DB.* synchronously. Behind that, Firestore listeners keep an
   in-memory cache fresh in real time, and every write goes to Firestore at
   once (a failed write shows an error and the cache snaps back to the truth).
   ========================================================================== */
// Find the config even if it was pasted under another name (Firebase's own console calls it "firebaseConfig").
// config.js (loaded before this file) is where the keys should live, so replacing app.js never wipes them.
const EXTERNAL_CONFIG = (typeof window !== "undefined" && window.STORE_CONFIG) || {};
const configFilled = (c) => !!c && !!c.apiKey && !!c.projectId && !!c.appId && !Object.values(c).some((v) => /^PASTE_/.test(String(v)));
const configCandidates = [EXTERNAL_CONFIG.firebase, typeof FIREBASE_CONFIG !== "undefined" ? FIREBASE_CONFIG : null, typeof firebaseConfig !== "undefined" ? firebaseConfig : null].filter(Boolean);
const FB_CONFIG = configCandidates.find(configFilled) || configCandidates[0] || null;
const PAYU_KEY = [EXTERNAL_CONFIG.payuClientId, typeof PAYU_CLIENT_ID !== "undefined" ? PAYU_CLIENT_ID : ""].find((v) => v && !/^PASTE_/.test(String(v))) || "";
const CONFIG_MISSING = !FB_CONFIG;
const CONFIG_FILLED = !CONFIG_MISSING && !!FB_CONFIG.apiKey && !!FB_CONFIG.projectId && !!FB_CONFIG.appId
  && !Object.values(FB_CONFIG).some((v) => /^PASTE_/.test(String(v)));
let fbApp, fbAuth, fbDb, fbStorage;
if (!FIREBASE_ERROR && CONFIG_FILLED) {
  try {
    fbApp = initializeApp(FB_CONFIG);
    // No popup resolver at start-up: with it Firebase first loads a hidden Google page before it can say who is signed in.
    fbAuth = initializeAuth(fbApp, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] });
    // Keep a copy of the data on the device: a returning visitor sees the shop instantly while fresh data loads behind it.
    try { fbDb = initializeFirestore(fbApp, { ignoreUndefinedProperties: true, localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }); }
    catch (cacheErr) { console.warn("On-device cache unavailable:", cacheErr); fbDb = initializeFirestore(fbApp, { ignoreUndefinedProperties: true }); }
  } catch (err) {
    console.error("Firebase start-up failed:", err);
    FIREBASE_ERROR = (err && (err.code || err.message)) ? `${err.code || ""} ${err.message || ""}`.trim() : String(err);
  }
}
const FIREBASE_READY = CONFIG_FILLED && !FIREBASE_ERROR;

function defaultSettings() {
  return {
    storeName: STORE_NAME, supportEmail: "", supportPhone: "", supportWhatsapp: "", storeAddress: "",
    deliveryDaysMin: 3, deliveryDaysMax: 7, defaultShippingCharge: 0, freeShippingThreshold: 0,
    taxEnabled: false, gstin: "", taxLabel: "GST", taxRate: 0,
    policyShipping: "", policyReturns: "", policyPrivacy: "", policyTerms: "",
    homepage: { hero: [], promo: [], sections: {} },
  };
}

const Store = {
  settings: defaultSettings(), categories: [], products: [],
  profile: null, users: [], admins: [], addresses: [], orders: [], reviews: [], publicReviews: {}, coupons: {},
};

const docsOf = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));

function normalizeCategory(c) {
  return { parentId: null, image: "", sortOrder: 0, active: true, description: "", featured: false, ...c, slug: c.slug || slugify(c.name || c.id) };
}
function normalizeProduct(p) {
  const out = {
    sku: "", productCode: "", shortDescription: "", description: "", brand: "", lowStockThreshold: 5,
    hasVariants: false, material: "", dimensions: "", weight: "", countryOfOrigin: "", manufacturer: "", packContents: "",
    warranty: "", deliveryDaysMin: 3, deliveryDaysMax: 7, freeShipping: false,
    seoTitle: "", metaDescription: "", keywords: "", status: "draft", codAvailable: false, codHandlingFee: 0,
    mrp: 0, price: 0, stock: 0, ...p,
  };
  ["images", "variants", "flags", "tags", "highlights", "specifications", "offers"].forEach((k) => { if (!Array.isArray(out[k])) out[k] = []; });
  out.slug = out.slug || slugify(out.name || out.id || "");
  out.rating = out.rating && typeof out.rating === "object" ? { average: Number(out.rating.average) || 0, count: Number(out.rating.count) || 0 } : { average: 0, count: 0 };
  out.reviewCount = out.rating.count;
  const podIn = out.pod && typeof out.pod === "object" ? out.pod : {};
  out.pod = {
    enabled: !!podIn.enabled, allowBack: podIn.allowBack !== false, backExtra: podIn.backExtra === undefined ? 100 : Math.max(0, Number(podIn.backExtra) || 0),
    area: { x: 30, y: 22, w: 40, h: 40, ...(podIn.area || {}) }, backImage: podIn.backImage || "",
  };
  out.createdAt = Number(out.createdAt) || 0; out.updatedAt = Number(out.updatedAt) || 0;
  // The shop shows the FIRST variant's price when a product has variants, so the "% off" must use that same price.
  const shown = out.hasVariants && out.variants[0] ? out.variants[0] : out;
  out.codHandlingFee = Math.max(0, Number(out.codHandlingFee) || 0);  // no fee set = no fee
  out.discountPercent = shown.mrp > 0 ? Math.max(0, Math.round(((shown.mrp - shown.price) / shown.mrp) * 100)) : 0;
  out.variants = out.variants.map((v) => ({ ...v, discountPercent: v.mrp > 0 ? Math.max(0, Math.round(((v.mrp - v.price) / v.mrp) * 100)) : 0 }));
  return out;
}

/* ---- Realtime listeners (grouped so they can be stopped on sign-out) ---- */
const Live = (() => {
  const subs = { public: {}, user: {}, admin: {} };
  function watch(group, key, target, apply) {
    const prev = subs[group][key];
    if (prev) { prev.unsub(); prev.done(true); }
    return new Promise((resolve) => {
      let first = true;
      const done = (ok) => { if (first) { first = false; resolve(ok); } };
      const unsub = onSnapshot(target,
        (snap) => { apply(snap); document.dispatchEvent(new CustomEvent("db:change", { detail: { key } })); done(true); },
        (err) => { console.error("Firestore listener failed:", key, err); done(false); });
      subs[group][key] = { unsub, done };
    });
  }
  function stop(group) { Object.values(subs[group]).forEach((s) => { s.unsub(); s.done(false); }); subs[group] = {}; }
  return { watch, stop };
})();

const productsTarget = (admin) => (admin ? collection(fbDb, "products") : query(collection(fbDb, "products"), where("status", "==", "published")));
const applyProducts = (snap) => { Store.products = docsOf(snap).map(normalizeProduct); };

let publicStarted = false;
function startPublic(admin) {
  publicStarted = true;
  return Promise.all([
    Live.watch("public", "settings", doc(fbDb, "settings", "store"), (s) => { Store.settings = { ...defaultSettings(), ...(s.exists() ? s.data() : {}) }; }),
    Live.watch("public", "categories", collection(fbDb, "categories"), (s) => { Store.categories = docsOf(s).map(normalizeCategory); }),
    Live.watch("public", "products", productsTarget(admin), applyProducts),
  ]);
}

async function startUser(uid, admin) {
  const jobs = [Live.watch("user", "profile", doc(fbDb, "users", uid), (s) => { Store.profile = s.exists() ? { uid, ...s.data() } : null; })];
  const orders = (s) => { Store.orders = docsOf(s).map((o) => ({ ...o, orderId: o.orderId || o.id })); };
  if (admin) {
    jobs.push(
      Live.watch("admin", "orders", collection(fbDb, "orders"), orders),
      Live.watch("admin", "users", collection(fbDb, "users"), (s) => { Store.users = docsOf(s).map((u) => ({ ...u, uid: u.id })); }),
      Live.watch("admin", "admins", collection(fbDb, "admins"), (s) => { Store.admins = docsOf(s).map((a) => ({ ...a, uid: a.id })); }),
      Live.watch("admin", "reviews", collection(fbDb, "reviews"), (s) => { Store.reviews = docsOf(s); }),
      Live.watch("admin", "addresses", collection(fbDb, "addresses"), (s) => { Store.addresses = docsOf(s); }),
      Live.watch("admin", "coupons", collection(fbDb, "productCoupons"), (s) => { Store.coupons = Object.fromEntries(s.docs.map((d) => [d.id, d.data()])); }),
    );
  } else {
    jobs.push(
      Live.watch("user", "orders", query(collection(fbDb, "orders"), where("userId", "==", uid)), orders),
      Live.watch("user", "reviews", query(collection(fbDb, "reviews"), where("userId", "==", uid)), (s) => { Store.reviews = docsOf(s); }),
      Live.watch("user", "addresses", query(collection(fbDb, "addresses"), where("userId", "==", uid)), (s) => { Store.addresses = docsOf(s); }),
    );
  }
  await Promise.all(jobs);
}

/* ---- Helpers for friendly errors and image upload ---- */
function friendlyFirestoreError(err) {
  const code = err && err.code || "";
  if (code.includes("permission-denied")) return "You don't have permission to do that.";
  if (code.includes("unavailable") || code.includes("network")) return "No connection. Check your internet and try again.";
  if (code.includes("unauthenticated")) return "Please log in again.";
  return "Please try again.";
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not process the image."))), type, quality));
}

function friendlyStorageError(err) {
  const code = (err && err.code) || "";
  if (code === "storage/unauthorized") return "The upload was blocked by the Storage rules. The store owner must publish the Storage rules (Firebase → Storage → Rules).";
  if (code === "storage/unauthenticated") return "Please log in again and try once more.";
  if (code === "storage/quota-exceeded") return "The store's image storage is full. Please contact the store.";
  if (code === "storage/retry-limit-exceeded" || code === "storage/network-request-failed") return "The upload timed out. Check your internet and try again.";
  if (code === "storage/bucket-not-found" || code === "storage/project-not-found") return "Firebase Storage isn't set up yet. Check storageBucket in config.js and make sure Storage is enabled in Firebase.";
  if (code === "storage/canceled") return "The upload was cancelled.";
  return null;
}

let storageLoading = null;
function loadStorage() {
  if (!storageLoading) {
    storageLoading = import("https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js").then((m) => {
      fbStorage = m.getStorage(fbApp); storageRef = m.ref; uploadBytes = m.uploadBytes; getDownloadURL = m.getDownloadURL;
    }).catch((err) => { storageLoading = null; throw new Error("Couldn't load the upload tool. Check your internet and try again."); });
  }
  return storageLoading;
}

/** Resize in the browser, upload to Firebase Storage, return the public download URL. */
async function uploadImage(file, folder, maxW = 800, quality = 0.8) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error("Please choose a JPG, PNG or WebP image.");
  const bitmap = await new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not read that image.")); };
    img.src = url;
  });
  const scale = Math.min(1, maxW / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await canvasToBlob(canvas, "image/jpeg", quality);
  await loadStorage();
  const path = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
  const r = storageRef(fbStorage, path);
  try {
    await uploadBytes(r, blob, { contentType: "image/jpeg", cacheControl: "public,max-age=31536000" });
    return await getDownloadURL(r);
  } catch (err) { console.error("Storage upload failed:", err); throw new Error(friendlyStorageError(err) || (err && err.message) || "The upload failed. Please try again."); }
}

/** Customer print design: keep PNG/WebP transparency, shrink very large files (max 2400px, under ~9 MB), upload to designs/<uid>/. */
async function uploadDesignImage(file, uid) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error("Please choose a PNG, JPG or WebP image.");
  const img = await new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => { URL.revokeObjectURL(url); resolve(im); };
    im.onerror = () => { URL.revokeObjectURL(url); reject(new Error("We couldn't read that image. Try another file.")); };
    im.src = url;
  });
  const type = file.type === "image/jpeg" ? "image/jpeg" : "image/png";
  const canvas = document.createElement("canvas");
  let maxSide = 2400, blob;
  for (;;) {
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    canvas.width = Math.max(1, Math.round(img.width * scale)); canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    blob = await canvasToBlob(canvas, type, 0.92);
    if (blob.size <= 9 * 1024 * 1024 || maxSide <= 800) break;
    maxSide = Math.round(maxSide * 0.75);
  }
  await loadStorage();
  const path = `designs/${uid}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${type === "image/jpeg" ? "jpg" : "png"}`;
  const r = storageRef(fbStorage, path);
  try {
    await uploadBytes(r, blob, { contentType: type, cacheControl: "private,max-age=31536000" });
    return { url: await getDownloadURL(r), width: canvas.width, height: canvas.height };
  } catch (err) { console.error("Design upload failed:", err); throw new Error(friendlyStorageError(err) || (err && err.message) || "The upload failed. Please try again."); }
}

/* ---- Calls to our own Vercel functions (always with the shopper's ID token) ---- */
const Api = {
  async request(method, path, body) {
    const headers = { "Content-Type": "application/json" };
    const user = fbAuth.currentUser;
    if (user) headers.Authorization = "Bearer " + (await user.getIdToken());
    const res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    let data = {};
    try { data = await res.json(); } catch { /* empty body */ }
    if (!res.ok) throw new Error(data.error || "Something went wrong. Please try again.");
    return data;
  },
  post(path, body) { return this.request("POST", path, body || {}); },
  get(path) { return this.request("GET", path); },
};

/* ---- The DB facade the pages use ---- */
const DB = (() => {
  const isAdminView = () => location.hash.startsWith("#/admin");
  function guard(promise, what) {
    Promise.resolve(promise).catch((err) => { console.error(err); toast(`Couldn't save ${what}. ${friendlyFirestoreError(err)}`, "error", 6000); });
  }
  const newId = (coll) => doc(collection(fbDb, coll)).id;
  const strip = (obj) => { const { id, ...rest } = obj; return rest; };
  function upsert(arr, item, key = "id") { const i = arr.findIndex((x) => x[key] === item[key]); if (i === -1) arr.push(item); else arr[i] = item; }

  // ---- Settings ----
  function getSettings() { return Store.settings; }
  function saveSettings(patch) {
    Store.settings = { ...Store.settings, ...patch };
    guard(setDoc(doc(fbDb, "settings", "store"), patch, { merge: true }), "the settings");
    return Store.settings;
  }

  // ---- Categories ----
  function getCategories() {
    return Store.categories.filter((c) => c.active || isAdminView()).sort((a, b) => (a.sortOrder - b.sortOrder) || String(a.name).localeCompare(String(b.name)));
  }
  function getCategoryTree() {
    const cats = getCategories();
    return cats.filter((c) => !c.parentId).map((c) => ({ ...c, subcategories: cats.filter((s) => s.parentId === c.id) }));
  }
  function getCategoryById(id) { return Store.categories.find((c) => c.id === id) || null; }
  function getCategoryBySlug(slug) { return Store.categories.find((c) => c.slug === slug) || null; }
  function saveCategory(cat) {
    const c = normalizeCategory({ ...cat, id: cat.id || newId("categories") });
    upsert(Store.categories, c);
    guard(setDoc(doc(fbDb, "categories", c.id), strip(c)), "the category");
    return c;
  }
  function deleteCategory(id) {
    const gone = Store.categories.filter((c) => c.id === id || c.parentId === id);
    Store.categories = Store.categories.filter((c) => !gone.includes(c));
    gone.forEach((c) => guard(deleteDoc(doc(fbDb, "categories", c.id)), "the category"));
  }

  // ---- Products ----
  function toFlagKey(collectionName) {
    return { "trending": "trending", "best-sellers": "best_seller", "new-arrivals": "new_arrival", "special-offers": "special_offer", "recommended": "recommended" }[collectionName] || collectionName;
  }
  function effectivePrice(p) { return p.hasVariants && p.variants[0] ? p.variants[0].price : p.price; }
  function totalStock(p) { return p.hasVariants ? p.variants.reduce((s, v) => s + (Number(v.stock) || 0), 0) : Number(p.stock) || 0; }
  function sortProducts(list, sort) {
    const arr = [...list];
    switch (sort) {
      case "newest": return arr.sort((a, b) => b.createdAt - a.createdAt);
      case "price_asc": return arr.sort((a, b) => effectivePrice(a) - effectivePrice(b));
      case "price_desc": return arr.sort((a, b) => effectivePrice(b) - effectivePrice(a));
      case "rating": return arr.sort((a, b) => b.rating.average - a.rating.average);
      case "popularity": return arr.sort((a, b) => b.rating.count - a.rating.count);
      default: return arr;
    }
  }
  function getProducts(filter = {}) {
    let list = Store.products.filter((p) => p.status === "published");
    if (filter.categoryId) {
      const target = Store.categories.find((c) => c.id === filter.categoryId);
      if (target && target.parentId) list = list.filter((p) => p.subcategoryId === filter.categoryId);
      else list = list.filter((p) => p.categoryId === filter.categoryId);
    }
    if (filter.subcategoryId) list = list.filter((p) => p.subcategoryId === filter.subcategoryId);
    if (filter.collection) list = list.filter((p) => p.flags.includes(toFlagKey(filter.collection)));
    if (filter.brand) list = list.filter((p) => filter.brand.includes(p.brand));
    if (filter.minPrice != null) list = list.filter((p) => effectivePrice(p) >= filter.minPrice);
    if (filter.maxPrice != null) list = list.filter((p) => effectivePrice(p) <= filter.maxPrice);
    if (filter.minRating) list = list.filter((p) => p.rating.average >= filter.minRating);
    if (filter.minDiscount) list = list.filter((p) => p.discountPercent >= filter.minDiscount);
    if (filter.inStockOnly) list = list.filter((p) => totalStock(p) > 0);
    if (filter.q) {
      const q = filter.q.toLowerCase();
      list = list.filter((p) => [p.name, p.brand, p.sku, p.productCode, ...(p.tags || [])].filter(Boolean).some((f) => String(f).toLowerCase().includes(q)));
    }
    return sortProducts(list, filter.sort);
  }
  function getAllProducts() { return [...Store.products]; } // admin: includes draft / archived
  function getProductById(id) { return Store.products.find((p) => p.id === id) || null; }
  function getRelatedProducts(product, limit = 8) { return getProducts({ categoryId: product.categoryId }).filter((p) => p.id !== product.id).slice(0, limit); }
  function getAllBrands() { return Array.from(new Set(Store.products.map((p) => p.brand).filter(Boolean))).sort(); }

  function saveProduct(product) {
    const existing = product.id && Store.products.find((p) => p.id === product.id);
    const now = Date.now();
    const p = normalizeProduct({ ...product, id: product.id || newId("products") });
    p.updatedAt = now;
    p.createdAt = existing ? existing.createdAt || now : now;
    upsert(Store.products, p);
    guard(setDoc(doc(fbDb, "products", p.id), strip(p)), "the product");
    return p;
  }
  function deleteProduct(id) {
    Store.products = Store.products.filter((p) => p.id !== id);
    guard(deleteDoc(doc(fbDb, "products", id)), "the deletion");
    if (Store.coupons[id]) deleteCoupon(id);
  }
  // Product coupons are kept in their own admin-only collection so shoppers can never read the codes from the product data.
  function getCoupon(productId) { return Store.coupons[productId] || null; }
  function saveCoupon(productId, c) {
    const data = { enabled: !!c.enabled, code: String(c.code || "").trim().toUpperCase(), percent: Number(c.percent) || 0, updatedAt: Date.now() };
    Store.coupons[productId] = data;
    guard(setDoc(doc(fbDb, "productCoupons", productId), data), "the coupon");
  }
  function deleteCoupon(productId) {
    delete Store.coupons[productId];
    guard(deleteDoc(doc(fbDb, "productCoupons", productId)), "the coupon");
  }
  function updateProductStock(id, variantId, newStock) {
    const p = Store.products.find((x) => x.id === id); if (!p) return;
    if (variantId) {
      const v = p.variants.find((x) => x.variantId === variantId); if (!v) return;
      v.stock = newStock;
      guard(updateDoc(doc(fbDb, "products", id), { variants: p.variants, updatedAt: Date.now() }), "the stock");
    } else {
      p.stock = newStock;
      guard(updateDoc(doc(fbDb, "products", id), { stock: newStock, updatedAt: Date.now() }), "the stock");
    }
  }
  function setLowStockThreshold(id, variantId, value) {
    const p = Store.products.find((x) => x.id === id); if (!p) return;
    if (variantId) {
      const v = p.variants.find((x) => x.variantId === variantId); if (!v) return;
      v.lowStockThreshold = value;
      guard(updateDoc(doc(fbDb, "products", id), { variants: p.variants }), "the threshold");
    } else {
      p.lowStockThreshold = value;
      guard(updateDoc(doc(fbDb, "products", id), { lowStockThreshold: value }), "the threshold");
    }
  }

  // ---- Users & admins ----
  function getUserById(uid) {
    return Store.users.find((u) => u.uid === uid) || (Store.profile && Store.profile.uid === uid ? Store.profile : null);
  }
  function findUserByEmail(email) { return Store.users.find((u) => String(u.email).toLowerCase() === String(email).toLowerCase()) || null; }
  function updateUser(uid, patch) {
    Store.profile = { ...(Store.profile || { uid }), ...patch };
    guard(setDoc(doc(fbDb, "users", uid), { ...patch, updatedAt: Date.now() }, { merge: true }), "your profile");
    return Store.profile;
  }
  function getAdmins() { return Store.admins; }
  function getAllCustomers() { const adminIds = new Set(Store.admins.map((a) => a.uid)); return Store.users.filter((u) => !adminIds.has(u.uid)); }
  function setAdmin(uid, email, on) {
    if (on) {
      upsert(Store.admins, { uid, email }, "uid");
      guard(setDoc(doc(fbDb, "admins", uid), { email, grantedBy: fbAuth.currentUser?.uid || "", createdAt: Date.now() }), "the admin access");
    } else {
      Store.admins = Store.admins.filter((a) => a.uid !== uid);
      guard(deleteDoc(doc(fbDb, "admins", uid)), "the admin access");
    }
  }

  // ---- Addresses ----
  function getAddresses(uid) { return Store.addresses.filter((a) => a.userId === uid).sort((a, b) => Number(!!b.isDefault) - Number(!!a.isDefault)); }
  function getAddressById(id) { return Store.addresses.find((a) => a.id === id) || null; }
  function saveAddress(address) {
    const isNew = !address.id || !Store.addresses.some((a) => a.id === address.id);
    const id = address.id || newId("addresses");
    const mine = Store.addresses.filter((a) => a.userId === address.userId);
    const a = { ...address, id };
    if (isNew && mine.length === 0) a.isDefault = true;
    if (a.isDefault) mine.forEach((o) => { if (o.id !== id && o.isDefault) { o.isDefault = false; guard(updateDoc(doc(fbDb, "addresses", o.id), { isDefault: false }), "the address"); } });
    upsert(Store.addresses, a);
    guard(setDoc(doc(fbDb, "addresses", id), strip(a)), "the address");
    return a;
  }
  function deleteAddress(id) {
    const gone = Store.addresses.find((a) => a.id === id); if (!gone) return;
    Store.addresses = Store.addresses.filter((a) => a.id !== id);
    guard(deleteDoc(doc(fbDb, "addresses", id)), "the deletion");
    if (gone.isDefault) {
      const next = Store.addresses.find((a) => a.userId === gone.userId);
      if (next) { next.isDefault = true; guard(updateDoc(doc(fbDb, "addresses", next.id), { isDefault: true }), "the address"); }
    }
  }

  // ---- Orders (created by the server after payment; the admin updates them) ----
  const UNPAID = ["payment_pending", "payment_failed"];
  function getOrders(filter = {}) {
    let list = Store.orders.filter((o) => !UNPAID.includes(o.orderStatus));
    if (filter.userId) list = list.filter((o) => o.userId === filter.userId);
    if (filter.status) list = list.filter((o) => o.orderStatus === filter.status);
    if (filter.q) {
      const q = filter.q.toLowerCase();
      list = list.filter((o) => [o.orderId, o.shippingAddressSnapshot?.fullName, o.shippingAddressSnapshot?.phone, o.customerEmail].filter(Boolean).some((f) => String(f).toLowerCase().includes(q)));
    }
    return list.sort((a, b) => b.createdAt - a.createdAt);
  }
  function getOrderById(id) { return Store.orders.find((o) => o.orderId === id) || null; }
  function updateOrderStatus(orderId, status, note, by) {
    const o = getOrderById(orderId); if (!o) return null;
    const entry = { status, note: note || "", at: Date.now(), by: by || "admin" };
    o.orderStatus = status; o.updatedAt = entry.at;
    o.statusHistory = [...(o.statusHistory || []), entry];
    guard(updateDoc(doc(fbDb, "orders", orderId), { orderStatus: status, updatedAt: entry.at, statusHistory: arrayUnion(entry) }), "the order status");
    return o;
  }
  function updateOrderTracking(orderId, tracking) {
    const o = getOrderById(orderId); if (!o) return null;
    o.courier = tracking; o.updatedAt = Date.now();
    guard(updateDoc(doc(fbDb, "orders", orderId), { courier: tracking, updatedAt: o.updatedAt }), "the tracking details");
    return o;
  }

  // ---- Reviews ----
  function getReviewsForProduct(productId) {
    return Store.publicReviews[productId] || Store.reviews.filter((r) => r.productId === productId && r.visible);
  }
  async function loadReviewsForProduct(productId) {
    try {
      const snap = await getDocs(query(collection(fbDb, "reviews"), where("productId", "==", productId), where("visible", "==", true)));
      Store.publicReviews[productId] = docsOf(snap);
    } catch (err) { console.error(err); }
    return getReviewsForProduct(productId);
  }
  function getAllReviews(filter = {}) {
    let list = [...Store.reviews];
    if (filter.visible != null) list = list.filter((r) => r.visible === filter.visible);
    if (filter.minRating) list = list.filter((r) => r.rating >= filter.minRating);
    return list.sort((a, b) => b.createdAt - a.createdAt);
  }
  function getReviewsByUser(uid) { return Store.reviews.filter((r) => r.userId === uid).sort((a, b) => b.createdAt - a.createdAt); }
  function hasReviewed(uid, productId, orderId) { return Store.reviews.some((r) => r.userId === uid && r.productId === productId && r.orderId === orderId); }
  async function addReview(review) {
    const res = await Api.post("/api", { ...review, action: "review" });
    const saved = res.review;
    upsert(Store.reviews, saved);
    if (Store.publicReviews[saved.productId]) upsert(Store.publicReviews[saved.productId], saved);
    const p = Store.products.find((x) => x.id === saved.productId);
    if (p && res.rating) p.rating = res.rating;
    return saved;
  }
  function recomputeRating(productId) {
    const p = Store.products.find((x) => x.id === productId); if (!p) return;
    const list = Store.reviews.filter((r) => r.productId === productId && r.visible);
    p.rating = list.length ? { average: round2(list.reduce((s, r) => s + r.rating, 0) / list.length), count: list.length } : { average: 0, count: 0 };
    guard(updateDoc(doc(fbDb, "products", productId), { rating: p.rating }), "the rating");
  }
  function setReviewVisibility(id, visible) {
    const r = Store.reviews.find((x) => x.id === id); if (!r) return;
    r.visible = visible;
    guard(updateDoc(doc(fbDb, "reviews", id), { visible }), "the review");
    recomputeRating(r.productId);
  }
  function deleteReview(id) {
    const r = Store.reviews.find((x) => x.id === id); if (!r) return;
    Store.reviews = Store.reviews.filter((x) => x.id !== id);
    guard(deleteDoc(doc(fbDb, "reviews", id)), "the deletion");
    recomputeRating(r.productId);
  }

  return {
    getSettings, saveSettings,
    getCategories, getCategoryTree, getCategoryById, getCategoryBySlug, saveCategory, deleteCategory,
    getProducts, getAllProducts, getProductById, getRelatedProducts, getAllBrands, saveProduct, deleteProduct, getCoupon, saveCoupon, deleteCoupon,
    updateProductStock, setLowStockThreshold, effectivePrice, totalStock,
    getUserById, findUserByEmail, updateUser, getAdmins, getAllCustomers, setAdmin,
    getAddresses, getAddressById, saveAddress, deleteAddress,
    getOrders, getOrderById, updateOrderStatus, updateOrderTracking,
    getReviewsForProduct, loadReviewsForProduct, getAllReviews, getReviewsByUser, hasReviewed, addReview, setReviewVisibility, deleteReview,
  };
})();

/* ==========================================================================
   5. AUTH (Firebase Authentication: email + password, and Google)
   Admin = a document at admins/{uid} in Firestore (create the first one by
   hand in the Firebase console — see SETUP.md). The rules enforce it.
   ========================================================================== */
const Auth = (() => {
  const Session = { fbUser: null, isAdmin: false, adminCheck: null, userLoaded: true, userPromise: Promise.resolve() };
  let listeners = [];
  let suppress = false;          // true while we sign in/out ourselves and apply the session manually
  let chain = Promise.resolve();

  function currentUser() {
    const u = Session.fbUser; if (!u) return null;
    const p = Store.profile || {};
    return {
      uid: u.uid, email: u.email || p.email || "",
      fullName: p.fullName || u.displayName || (u.email || "").split("@")[0] || "Shopper",
      phone: p.phone || "", photoURL: p.photoURL || u.photoURL || "", createdAt: p.createdAt || 0,
      provider: (u.providerData || []).some((x) => x.providerId === "google.com") ? "google.com" : "password",
      isAdmin: Session.isAdmin,
    };
  }
  function isAdmin() { return Session.isAdmin; }
  function onChange(fn) { listeners.push(fn); fn(currentUser()); return () => { listeners = listeners.filter((f) => f !== fn); }; }

  async function doApply(fbUser) {
    Live.stop("user"); Live.stop("admin");
    Object.assign(Store, { profile: null, users: [], admins: [], addresses: [], orders: [], reviews: [] });
    const wasAdmin = Session.isAdmin;
    Session.fbUser = fbUser; Session.isAdmin = false;
    if (fbUser) {
      // Remember WHY someone isn't an admin, so the admin sign-in box can say exactly what to fix.
      Session.adminCheck = { uid: fbUser.uid, exists: false, error: "" };
      try {
        Session.isAdmin = (await getDoc(doc(fbDb, "admins", fbUser.uid))).exists();
        Session.adminCheck.exists = Session.isAdmin;
      } catch (err) {
        console.error("Admin check failed:", err);
        Session.isAdmin = false;
        Session.adminCheck.error = (err && (err.code || err.message)) || "unknown error";
      }
      // Orders/addresses/reviews load in the background so the shop appears sooner. Pages that need them wait (see navigate()).
      Session.userLoaded = false;
      Session.userPromise = startUser(fbUser.uid, Session.isAdmin).then(() => { Session.userLoaded = true; });
      const needsNow = Session.isAdmin || /^#\/(product(\?|$)|orders|order-details|profile|addresses|checkout|reviews|wishlist)/.test(location.hash);
      if (needsNow) await Session.userPromise;
    } else { Session.userLoaded = true; Session.userPromise = Promise.resolve(); }
    if (publicStarted && Session.isAdmin !== wasAdmin) await Live.watch("public", "products", productsTarget(Session.isAdmin), applyProducts);
    listeners.forEach((fn) => fn(currentUser()));
  }
  function applySession(fbUser) { chain = chain.then(() => doApply(fbUser)).catch((e) => console.error(e)); return chain; }

  const MESSAGES = {
    "auth/invalid-credential": "Incorrect email or password.", "auth/wrong-password": "Incorrect email or password.",
    "auth/user-not-found": "Incorrect email or password.", "auth/invalid-email": "Enter a valid email address.",
    "auth/email-already-in-use": "An account with this email already exists.", "auth/weak-password": "Choose a stronger password (at least 8 characters).",
    "auth/too-many-requests": "Too many attempts. Please wait a few minutes and try again.", "auth/network-request-failed": "Network problem. Check your connection and try again.",
    "auth/popup-closed-by-user": "The sign-in window was closed before finishing.", "auth/cancelled-popup-request": "The sign-in window was closed before finishing.",
    "auth/popup-blocked": "Your browser blocked the sign-in window. Allow pop-ups and try again.", "auth/user-disabled": "This account has been disabled.",
    "auth/unauthorized-domain": "This website's address isn't allowed yet in Firebase → Authentication → Settings → Authorized domains.",
    "auth/operation-not-allowed": "This sign-in method isn't turned on in Firebase → Authentication → Sign-in method.",
  };
  const authError = (err) => {
    console.error(err);
    if (!FIREBASE_READY) return new Error("Sign-in isn't available yet: the store isn't connected to Firebase (see the red message at the top of the page).");
    return new Error(MESSAGES[err && err.code] || "Something went wrong. Please try again.");
  };

  async function ensureProfile(fbUser, extra = {}) {
    const ref = doc(fbDb, "users", fbUser.uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        fullName: extra.fullName || fbUser.displayName || (fbUser.email || "").split("@")[0], email: fbUser.email || "",
        phone: extra.phone || "", provider: extra.provider || "password", photoURL: fbUser.photoURL || "", createdAt: Date.now(),
      });
    }
  }

  async function signIn(email, password) {
    suppress = true;
    try {
      const cred = await signInWithEmailAndPassword(fbAuth, email, password);
      await ensureProfile(cred.user).catch(() => {});
      await applySession(cred.user);
      return currentUser();
    } catch (err) { throw authError(err); } finally { suppress = false; }
  }
  async function signUp({ fullName, email, phone, password }) {
    suppress = true;
    try {
      const cred = await createUserWithEmailAndPassword(fbAuth, email, password);
      await updateProfile(cred.user, { displayName: fullName });
      await ensureProfile(cred.user, { fullName, phone, provider: "password" });
      await applySession(cred.user);
      return currentUser();
    } catch (err) { throw authError(err); } finally { suppress = false; }
  }
  async function signInWithGoogle() {
    suppress = true;
    try {
      const cred = await signInWithPopup(fbAuth, new GoogleAuthProvider(), browserPopupRedirectResolver);
      await ensureProfile(cred.user, { provider: "google.com" });
      await applySession(cred.user);
      return currentUser();
    } catch (err) { throw authError(err); } finally { suppress = false; }
  }
  async function signOut() {
    suppress = true;
    try { await fbSignOut(fbAuth); await applySession(null); } catch (err) { throw authError(err); } finally { suppress = false; }
  }
  async function sendPasswordReset(email) {
    try { await sendPasswordResetEmail(fbAuth, email); return true; } catch (err) { throw authError(err); }
  }
  async function changePassword(currentPassword, newPassword) {
    const user = fbAuth.currentUser;
    if (!user || !user.email) throw new Error("Please log in again.");
    try {
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, currentPassword));
      await updatePassword(user, newPassword);
    } catch (err) {
      if (err && (err.code === "auth/invalid-credential" || err.code === "auth/wrong-password")) throw new Error("Current password is incorrect.");
      throw authError(err);
    }
  }

  // Resolves once Firebase has told us who (if anyone) is signed in.
  let readyResolve; const ready = new Promise((r) => (readyResolve = r));
  function watchFirebaseAuth() {
    onAuthStateChanged(fbAuth, (u) => { if (suppress) return; applySession(u).then(() => readyResolve()); });
  }

  return { userDataPending: () => !!Session.fbUser && !Session.userLoaded, userDataReady: () => Session.userPromise, currentUser, isAdmin, adminCheck: () => ({ ...(Session.adminCheck || {}) }), onChange, signIn, signUp, signInWithGoogle, signOut, sendPasswordReset, changePassword, ready, watchFirebaseAuth };
})();

/* ---- Startup: connect to Firebase and load what the first page needs ---- */
const Backend = {
  async init() {
    const banner = document.getElementById("appOffline");
    if (!FIREBASE_READY) {
      if (banner) {
        banner.textContent = FIREBASE_ERROR
          ? "Firebase couldn't start: " + FIREBASE_ERROR + ". Check the Firebase values in config.js."
          : CONFIG_MISSING
            ? "The Firebase config was not found. Open config.js and paste your Firebase values into it."
            : "Some Firebase values in config.js are still empty or say PASTE_... Replace every one of them with your own value.";
        banner.hidden = false;
      }
      return false;
    }
    Auth.watchFirebaseAuth();
    const work = Promise.all([startPublic(false), Auth.ready]).then(() => true);
    const timeout = new Promise((resolve) => setTimeout(() => resolve(false), 15000));
    const ok = await Promise.race([work, timeout]);
    if (!ok && banner) banner.hidden = false;
    return ok;
  },
};

/* ==========================================================================
   6. CART & WISHLIST (guest-friendly: localStorage now, mergeable into a
   Firestore-backed per-user cart later without changing callers)
   ========================================================================== */
const Cart = (() => {
  function raw() { return readLS(LS_KEYS.cart, []); }
  function set(items) { writeLS(LS_KEYS.cart, items); document.dispatchEvent(new CustomEvent("cart:change")); }

  // A printed product is a different line each time (every design is unique).
  const lineKey = (productId, variantId, customId) => productId + "::" + (variantId || "") + "::" + (customId || "");
  const keyOf = (it) => lineKey(it.productId, it.variantId, it.custom && it.custom.id);
  // Printing the back side costs extra (set per product in the admin panel).
  function customExtra(product, custom) { return custom && custom.back ? Math.max(0, Number(product.pod && product.pod.backExtra) || 0) : 0; }

  function getItems() {
    return raw().map((it) => {
      const p = DB.getProductById(it.productId);
      if (!p) return null;
      const variant = it.variantId ? p.variants.find((v) => v.variantId === it.variantId) : null;
      if (it.variantId && !variant) return null;
      const stock = variant ? variant.stock : p.stock;
      const extra = customExtra(p, it.custom);
      return {
        productId: p.id, variantId: it.variantId || null, product: p, variant,
        custom: it.custom || null, customId: (it.custom && it.custom.id) || null,
        quantity: Math.min(it.quantity, Math.max(stock, 0)) || it.quantity,
        unitPrice: (variant ? variant.price : p.price) + extra,
        mrp: (variant ? variant.mrp : p.mrp) + extra,
        discountPercent: variant ? variant.discountPercent ?? p.discountPercent : p.discountPercent,
        codAvailable: p.codAvailable && !it.custom, codHandlingFee: p.codHandlingFee,
        freeShipping: p.freeShipping, shippingCharge: p.shippingCharge,
        stock, productName: p.name, image: (it.custom && it.custom.mockupFront) || (variant && variant.images && variant.images[0]) || (p.images[0] && p.images[0].url) || "",
      };
    }).filter(Boolean);
  }

  function count() { return raw().reduce((s, it) => s + it.quantity, 0); }

  function add(productId, variantId, quantity = 1, custom = null) {
    const items = raw();
    const key = lineKey(productId, variantId, custom && custom.id);
    const existing = items.find((it) => keyOf(it) === key);
    if (existing) existing.quantity += quantity;
    else items.push({ productId, variantId: variantId || null, quantity, ...(custom ? { custom } : {}) });
    set(items);
  }
  function setQuantity(productId, variantId, quantity, customId = null) {
    let items = raw();
    const key = lineKey(productId, variantId, customId);
    if (quantity <= 0) items = items.filter((it) => keyOf(it) !== key);
    else { const line = items.find((it) => keyOf(it) === key); if (line) line.quantity = quantity; }
    set(items);
  }
  function remove(productId, variantId, customId = null) { setQuantity(productId, variantId, 0, customId); }
  function clear() { set([]); }
  function replaceForBuyNow(productId, variantId, quantity, custom = null) { writeLS(LS_KEYS.cart + "_buynow", [{ productId, variantId, quantity, ...(custom ? { custom } : {}) }]); }
  // Buy Now lives in its own storage key and never touches the cart. It is kept until the order is placed (so a refresh doesn't lose it).
  function peekBuyNow() { return readLS(LS_KEYS.cart + "_buynow", null); }
  function clearBuyNow() { try { localStorage.removeItem(LS_KEYS.cart + "_buynow"); } catch { /* ignore */ } }

  return { getItems, count, add, setQuantity, remove, clear, replaceForBuyNow, peekBuyNow, clearBuyNow, customExtra };
})();

const Wishlist = (() => {
  function raw() { return readLS(LS_KEYS.wishlist, []); }
  function set(ids) { writeLS(LS_KEYS.wishlist, ids); document.dispatchEvent(new CustomEvent("wishlist:change")); }
  function has(productId) { return raw().includes(productId); }
  function toggle(productId) {
    const ids = raw();
    const i = ids.indexOf(productId);
    if (i === -1) { ids.push(productId); set(ids); return true; }
    ids.splice(i, 1); set(ids); return false;
  }
  function remove(productId) { set(raw().filter((id) => id !== productId)); }
  function count() { return raw().length; }
  function getProducts() { return raw().map((id) => DB.getProductById(id)).filter(Boolean); }
  return { has, toggle, remove, count, getProducts };
})();

const RecentlyViewed = (() => {
  const LIMIT = 12;
  function raw() { return readLS(LS_KEYS.recentlyViewed, []); }
  function add(productId) {
    let ids = raw().filter((id) => id !== productId);
    ids.unshift(productId);
    writeLS(LS_KEYS.recentlyViewed, ids.slice(0, LIMIT));
  }
  function getProducts() { return raw().map((id) => DB.getProductById(id)).filter(Boolean); }
  function clear() { writeLS(LS_KEYS.recentlyViewed, []); }
  return { add, getProducts, clear };
})();

/* ==========================================================================
   7. ROUTER
   Hash-based: #/path?query=value. Each route clones its <template> into
   #app (public) or #adminApp (admin), toggles which chrome is visible,
   sets the tab title, applies auth/admin gating, then calls that page's
   controller so it can fetch/render its own data.
   ========================================================================== */
const ROUTES = {
  "/": { tpl: "page-home", mode: "public", controller: "home" },
  "/products": { tpl: "page-products", mode: "public", controller: "products" },
  "/category": { tpl: "page-category", mode: "public", controller: "category" },
  "/search": { tpl: "page-search", mode: "public", controller: "search" },
  "/product": { tpl: "page-product", mode: "public", controller: "productDetails" },
  "/cart": { tpl: "page-cart", mode: "public", controller: "cart" },
  "/checkout": { tpl: "page-checkout", mode: "public", controller: "checkout" },
  "/login": { tpl: "page-login", mode: "public", controller: "login" },
  "/register": { tpl: "page-register", mode: "public", controller: "register" },
  "/profile": { tpl: "page-profile", mode: "public", controller: "profile" },
  "/addresses": { tpl: "page-addresses", mode: "public", controller: "addresses" },
  "/wishlist": { tpl: "page-wishlist", mode: "public", controller: "wishlist" },
  "/orders": { tpl: "page-orders", mode: "public", controller: "orders" },
  "/order-details": { tpl: "page-order-details", mode: "public", controller: "orderDetails" },
  "/reviews": { tpl: "page-reviews", mode: "public", controller: "reviews" },
  "/help": { tpl: "page-help", mode: "public", controller: "help" },
  "/admin": { tpl: "page-admin-dashboard", mode: "admin", controller: "adminDashboard" },
  "/admin/products": { tpl: "page-admin-products", mode: "admin", controller: "adminProducts" },
  "/admin/add-product": { tpl: "page-admin-add-product", mode: "admin", controller: "adminProductForm" },
  "/admin/edit-product": { tpl: "page-admin-edit-product", mode: "admin", controller: "adminProductForm" },
  "/admin/orders": { tpl: "page-admin-orders", mode: "admin", controller: "adminOrders" },
  "/admin/order-details": { tpl: "page-admin-order-details", mode: "admin", controller: "adminOrderDetails" },
  "/admin/customers": { tpl: "page-admin-customers", mode: "admin", controller: "adminCustomers" },
  "/admin/reviews": { tpl: "page-admin-reviews", mode: "admin", controller: "adminReviews" },
  "/admin/inventory": { tpl: "page-admin-inventory", mode: "admin", controller: "adminInventory" },
  "/admin/categories": { tpl: "page-admin-categories", mode: "admin", controller: "adminCategories" },
  "/admin/homepage": { tpl: "page-admin-homepage", mode: "admin", controller: "adminHomepage" },
  "/admin/settings": { tpl: "page-admin-settings", mode: "admin", controller: "adminSettings" },
};

function parseHash() {
  let hash = location.hash.replace(/^#/, "");
  if (!hash) hash = "/";
  let [pathAndSub, queryStr] = hash.split("?");
  const segments = pathAndSub.split("/").filter(Boolean);
  let path = "/" + segments.join("/");
  let sub = null;
  // /help/<section> — the only route with an extra path segment (in-page anchors)
  if (segments[0] === "help" && segments[1]) { path = "/help"; sub = segments[1]; }
  if (!ROUTES[path]) path = "/help".startsWith(path) ? path : path; // no-op, keeps intent explicit
  const params = new URLSearchParams(queryStr || "");
  return { path, sub, params };
}

function buildHash(path, params) {
  const qs = params && Object.keys(params).length
    ? "?" + Object.entries(params).filter(([, v]) => v != null && v !== "").map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&")
    : "";
  return "#" + path + qs;
}

// Go to a hash route even if we're already on it (a plain assignment wouldn't re-render then).
function goTo(hash) { if (location.hash === hash) navigate(); else location.hash = hash; }

function setActiveNav(mode, navKey) {
  const scope = mode === "admin" ? "#adminSidebar" : "#bottomNav, .category-nav";
  $$(`${scope} [data-nav-key]`, document).forEach((a) => {
    const active = a.dataset.navKey === navKey;
    a.classList.toggle("is-active", active);
    if (active) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
}

function mountAuthGate(host, requiresAuth) {
  const gate = host.querySelector("#authGate");
  const content = host.querySelector("#pageContent");
  if (!gate || !content) return true; // page has no gate — nothing to do
  if (requiresAuth && !Auth.currentUser()) { gate.hidden = false; content.hidden = true; return false; }
  gate.hidden = true; content.hidden = false; return true;
}

let currentTeardown = null;

function navigate() {
  if (typeof currentTeardown === "function") { try { currentTeardown(); } catch { /* ignore */ } }
  currentTeardown = null;

  const { path, sub, params } = parseHash();
  const route = ROUTES[path] || ROUTES["/"];
  const tpl = document.getElementById(route.tpl);
  // Account pages (and the product page's "write a review" check) need the shopper's orders/addresses; wait for them if still loading.
  if (Auth.userDataPending() && route.mode !== "admin" && (tpl.dataset.requiresAuth === "true" || route.tpl === "page-product")) {
    const hashNow = location.hash;
    $("#app").innerHTML = '<div class="container" style="padding:4rem 0;text-align:center"><span class="spinner" aria-hidden="true"></span></div>';
    Auth.userDataReady().then(() => { if (location.hash === hashNow) navigate(); });
    return;
  }
  const publicChrome = $("#publicChrome");
  const adminChrome = $("#adminChrome");
  const isAdminRoute = route.mode === "admin";

  publicChrome.hidden = isAdminRoute;
  adminChrome.hidden = !isAdminRoute;
  const filterPanel = $("#filterPanel");
  if (filterPanel) closeSheet(filterPanel, $("#filterBackdrop"));
  $("#accountDropdown") && ($("#accountDropdown").hidden = true);
  document.body.classList.remove("nav-open");

  if (isAdminRoute) {
    const gateEl = $("#adminGate"), shell = $("#adminShell"), gateText = $("#adminGateText"), gateHome = $("#adminGateHome");
    const user = Auth.currentUser();
    if (!user || !user.isAdmin) {
      gateEl.hidden = false; shell.hidden = true;
      gateText.textContent = user ? "This account doesn't have admin access." : "Please sign in with an admin account.";
      gateHome.hidden = false;
      document.title = "Admin – " + STORE_NAME;
      return;
    }
    gateEl.hidden = true; shell.hidden = false;
    const host = $("#adminApp");
    host.innerHTML = "";
    host.appendChild(tpl.content.cloneNode(true));
    document.title = (tpl.dataset.title || STORE_NAME);
    setActiveNav("admin", tpl.dataset.nav || "");
    $("#adminUserEmail") && ($("#adminUserEmail").textContent = user.email);
    window.scrollTo(0, 0);
    currentTeardown = PageControllers[route.controller]?.(host, params, sub) || null;
    return;
  }

  const host = $("#app");
  host.innerHTML = "";
  host.appendChild(tpl.content.cloneNode(true));
  document.title = tpl.dataset.title || STORE_NAME;
  const metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc && tpl.dataset.desc) metaDesc.setAttribute("content", tpl.dataset.desc);
  const metaRobots = document.querySelector('meta[name="robots"]');
  if (metaRobots) metaRobots.setAttribute("content", tpl.dataset.robots || "index,follow");
  setActiveNav("public", tpl.dataset.nav || "");

  const requiresAuth = tpl.dataset.requiresAuth === "true";
  const shown = mountAuthGate(host, requiresAuth);
  wireDialogDismiss(host);
  updateHeaderBadges();
  updateAccountMenu();
  window.scrollTo(0, 0);
  if (shown) currentTeardown = PageControllers[route.controller]?.(host, params, sub) || null;
  else { const loginLink = host.querySelector("[data-login-link]"); if (loginLink) loginLink.href = buildHash("/login", { next: path }); }
}

window.addEventListener("hashchange", navigate);

/* ==========================================================================
   8. GLOBAL CHROME + ONE APP-WIDE DELEGATED ACTION HANDLER
   Wired once at bootstrap (header/footer/bottom-nav/sidebar never get
   destroyed, so they're never re-wired). Page-specific forms are wired by
   each page controller directly on its own freshly-cloned elements, which
   is safe with no cleanup needed since they're destroyed on next navigate.
   ========================================================================== */
function updateHeaderBadges() {
  const cartCount = Cart.count(), wishCount = Wishlist.count();
  $$("[data-cart-count]").forEach((el) => { el.textContent = cartCount; el.hidden = cartCount === 0; });
  $$("[data-wishlist-count]").forEach((el) => { el.textContent = wishCount; el.hidden = wishCount === 0; });
}
document.addEventListener("cart:change", updateHeaderBadges);
document.addEventListener("wishlist:change", updateHeaderBadges);

function updateAccountMenu() {
  const user = Auth.currentUser();
  $$("[data-guest-only]").forEach((el) => (el.hidden = !!user));
  $$("[data-auth-only]").forEach((el) => (el.hidden = !user));
  $$("[data-account-label]").forEach((el) => (el.textContent = user ? (user.fullName || "Account").split(" ")[0] : "Account"));
  $$("[data-user-name]").forEach((el) => (el.textContent = user?.fullName || ""));
  $$("[data-user-email]").forEach((el) => (el.textContent = user?.email || ""));
}

function applyStoreName() {
  const settings = DB.getSettings();
  const name = settings.storeName || STORE_NAME;
  $$("[data-store-name]").forEach((el) => (el.textContent = name));
  applyLogo(settings.logo, name);
}

// The logo saved in Admin -> Settings replaces the little bag icon next to the store name (header, footer, admin bar) and the browser-tab icon.
const DEFAULT_BRAND_MARK = $$(".brand__mark")[0] ? $$(".brand__mark")[0].innerHTML : "";
function applyLogo(url, name) {
  $$(".brand__mark").forEach((mark) => {
    if (url) {
      if (mark.dataset.logo === url) return;
      mark.dataset.logo = url; mark.classList.add("brand__mark--logo");
      mark.innerHTML = "";
      const img = document.createElement("img");
      img.src = url; img.alt = ""; img.decoding = "async";
      img.onerror = () => { delete mark.dataset.logo; mark.classList.remove("brand__mark--logo"); mark.innerHTML = DEFAULT_BRAND_MARK; };
      mark.appendChild(img);
    } else if (mark.dataset.logo) {
      delete mark.dataset.logo; mark.classList.remove("brand__mark--logo"); mark.innerHTML = DEFAULT_BRAND_MARK;
    }
  });
  let icon = document.querySelector('link[rel="icon"]');
  if (url) {
    if (!icon) { icon = document.createElement("link"); icon.rel = "icon"; document.head.appendChild(icon); }
    icon.href = url;
  }
}

function populateCategoryNav() {
  const list = $("#categoryNavList");
  if (!list) return;
  const tree = DB.getCategoryTree();
  const extra = tree.flatMap((c) => [c, ...c.subcategories]).slice(0, 8);
  list.innerHTML = '<li class="category-nav__item"><a class="category-nav__link" href="' + buildHash("/products") + '">All products</a></li>'
    + extra.map((c) => `<li class="category-nav__item"><a class="category-nav__link" href="${buildHash("/category", { slug: c.slug })}">${escapeHtml(c.name)}</a></li>`).join("");
}

// ---- Recent / suggested searches ----
function recentSearches() { return readLS(LS_KEYS.recentSearches, []); }
function addRecentSearch(term) {
  term = term.trim(); if (!term) return;
  const list = [term, ...recentSearches().filter((t) => t.toLowerCase() !== term.toLowerCase())].slice(0, 8);
  writeLS(LS_KEYS.recentSearches, list);
}
function clearRecentSearches() { writeLS(LS_KEYS.recentSearches, []); }

function wireHeaderSearch() {
  const toggle = $("#searchToggle"), form = $("#headerSearch"), back = $("#searchBack"), input = $("#searchInput"),
    clearBtn = $("#searchClear"), panel = $("#searchPanel"), recentWrap = $("#recentSearches"), recentList = $("#recentSearchList"),
    suggWrap = $("#searchSuggestions"), suggList = $("#suggestionList"), noResults = $("#searchNoResults"), noResultsTerm = $("#searchNoResultsTerm");
  if (!form) return;

  toggle?.addEventListener("click", () => {
    form.style.display = "flex"; toggle.setAttribute("aria-expanded", "true"); input.focus();
  });
  back?.addEventListener("click", () => { form.style.display = ""; panel.hidden = true; toggle?.setAttribute("aria-expanded", "false"); });

  function renderPanel(term) {
    const recents = recentSearches();
    recentWrap.hidden = !(!term && recents.length);
    if (!term && recents.length) {
      recentList.innerHTML = recents.map((t) => searchItemHtml(t, "clock", true)).join("");
    }
    if (term) {
      const matches = DB.getProducts({ q: term }).slice(0, 6);
      suggWrap.hidden = matches.length === 0;
      noResults.hidden = matches.length !== 0;
      noResultsTerm.textContent = term;
      suggList.innerHTML = matches.map((p) => searchItemHtml(p.name, "search", false, p.id)).join("");
    } else { suggWrap.hidden = true; noResults.hidden = true; }
    panel.hidden = false;
    input.setAttribute("aria-expanded", "true");
  }
  function searchItemHtml(text, icon, removable, productId) {
    const href = productId ? buildHash("/product", { id: productId }) : buildHash("/search", { q: text });
    return `<li class="search-list__item">
      <a class="search-list__link" href="${href}" data-term="${escapeHtml(text)}">
        <span class="search-list__icon">${useIcon(icon)}</span><span class="search-list__text">${escapeHtml(text)}</span>
      </a>${removable ? `<button class="icon-btn search-list__remove" type="button" data-remove-recent="${escapeHtml(text)}" aria-label="Remove">${useIcon("x", "sm")}</button>` : ""}
    </li>`;
  }

  const onInput = debounce(() => {
    clearBtn.hidden = !input.value;
    renderPanel(input.value.trim());
  }, 180);
  input.addEventListener("input", onInput);
  input.addEventListener("focus", () => renderPanel(input.value.trim()));
  clearBtn?.addEventListener("click", () => { input.value = ""; clearBtn.hidden = true; input.focus(); renderPanel(""); });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const term = input.value.trim();
    if (!term) return;
    addRecentSearch(term);
    location.hash = buildHash("/search", { q: term });
    panel.hidden = true; form.style.display = "";
  });
  panel.addEventListener("click", (e) => {
    const link = e.target.closest("a[data-term]");
    if (link) { addRecentSearch(link.dataset.term); panel.hidden = true; form.style.display = ""; return; }
    const removeBtn = e.target.closest("[data-remove-recent]");
    if (removeBtn) {
      e.preventDefault();
      writeLS(LS_KEYS.recentSearches, recentSearches().filter((t) => t !== removeBtn.dataset.removeRecent));
      renderPanel(input.value.trim());
    }
  });
  $("#clearRecentSearches")?.addEventListener("click", () => { clearRecentSearches(); renderPanel(""); });
  document.addEventListener("click", (e) => {
    if (!form.contains(e.target) && !toggle?.contains(e.target)) { panel.hidden = true; if (window.innerWidth < 768) form.style.display = ""; }
  });
}

function useIcon(name, size) {
  return `<svg class="icon icon--${size || "sm"}" width="16" height="16" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
}

function wireAccountMenu() {
  const btn = $("#accountBtn"), panel = $("#accountDropdown");
  if (!btn) return;
  btn.addEventListener("click", () => {
    const open = panel.hidden;
    panel.hidden = !open; btn.setAttribute("aria-expanded", String(open));
  });
  document.addEventListener("click", (e) => { if (!$("#accountMenu").contains(e.target)) { panel.hidden = true; btn.setAttribute("aria-expanded", "false"); } });
}

// Tells the person exactly why the admin check failed and what to fix.
function adminDeniedMessage(check) {
  if (check.error && /permission|denied/i.test(check.error)) {
    return "Firestore is blocking the admin check. In Firebase → Firestore Database → Rules, paste the firestore.rules text from the top of app.js and press Publish. Then try again.";
  }
  if (check.error) return "The admin check failed (" + check.error + "). Check your internet connection and try again.";
  return `Login worked, but this account is not an admin yet. In Firebase → Firestore Database, open the admins collection and make sure there is a document whose Document ID is exactly: ${check.uid}  (copy it from Authentication → Users → User UID for this email).`;
}

function wireAdminEntry() {
  const trigger = $("#adminTrigger");
  const modal = $("#adminLoginModal");
  if (!trigger || !modal) return;
  let clicks = 0, resetTimer;
  trigger.addEventListener("click", () => {
    clicks += 1;
    clearTimeout(resetTimer);
    resetTimer = setTimeout(() => (clicks = 0), 2500);
    if (clicks >= 10) { clicks = 0; openDialog(modal); }
  });
  $("#adminLoginForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("#adminEmail").value.trim(), password = $("#adminPassword").value;
    const errorEl = $("#adminLoginError"), submitBtn = $("#adminLoginSubmit");
    submitBtn.disabled = true;
    try {
      const user = await Auth.signIn(email, password);
      if (!user.isAdmin) { const why = adminDeniedMessage(Auth.adminCheck()); await Auth.signOut(); throw new Error(why); }
      errorEl.hidden = true; closeDialog(modal); $("#adminLoginForm").reset();
      goTo(buildHash("/admin"));
    } catch (err) { errorEl.textContent = err.message; errorEl.hidden = false; }
    finally { submitBtn.disabled = false; }
  });
}

function wireMobileFilters(host) {
  const openBtn = host.querySelector("#openFilters"), panel = host.querySelector("#filterPanel"),
    closeBtn = host.querySelector("#closeFilters"), backdrop = host.querySelector("#filterBackdrop");
  if (!openBtn || !panel) return;
  openBtn.addEventListener("click", () => { openSheet(panel, backdrop); openBtn.setAttribute("aria-expanded", "true"); });
  const close = () => { closeSheet(panel, backdrop); openBtn.setAttribute("aria-expanded", "false"); };
  closeBtn?.addEventListener("click", close);
  backdrop?.addEventListener("click", close);
}

function wireAdminChrome() {
  const menuBtn = $("#adminMenuBtn"), sidebar = $("#adminSidebar"), closeBtn = $("#adminSidebarClose"), backdrop = $("#adminBackdrop");
  menuBtn?.addEventListener("click", () => { sidebar.dataset.open = "true"; backdrop.hidden = false; menuBtn.setAttribute("aria-expanded", "true"); });
  const close = () => { sidebar.dataset.open = "false"; backdrop.hidden = true; menuBtn?.setAttribute("aria-expanded", "false"); };
  closeBtn?.addEventListener("click", close);
  backdrop?.addEventListener("click", close);
  $("#adminSidebar")?.addEventListener("click", (e) => { if (e.target.closest("a")) close(); });
  $("#adminSignOut")?.addEventListener("click", () => { Auth.signOut().then(() => goTo(buildHash("/"))).catch((err) => toast(err.message, "error")); });
  $("#adminGateHome")?.addEventListener("click", (e) => { e.preventDefault(); location.hash = buildHash("/"); });
}

function wireGlobalActions() {
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;

    // ---- Wishlist toggle: works on product cards anywhere (home, listing,
    // product page, wishlist page) ----
    if (action === "toggle-wishlist") {
      const card = btn.closest("[data-product-card], .product__info, [data-wishlist-card]");
      const id = card?.dataset.id || btn.dataset.id;
      if (!id) return;
      const nowOn = Wishlist.toggle(id);
      btn.setAttribute("aria-pressed", String(nowOn));
      toast(nowOn ? "Added to your wishlist" : "Removed from your wishlist");
      if (card?.hasAttribute("data-wishlist-card") && !nowOn) card.remove();
      return;
    }

    if (action === "quick-add") {
      const card = btn.closest("[data-product-card]");
      const id = card?.dataset.id;
      const product = id && DB.getProductById(id);
      if (!product) return;
      if (product.hasVariants || (product.pod && product.pod.enabled)) { location.hash = buildHash("/product", { id }); return; }
      Cart.add(id, null, 1);
      toast(`${product.name} added to cart`, "success");
      return;
    }

    if (action === "move-to-cart") {
      const card = btn.closest("[data-wishlist-card]");
      const id = card?.dataset.id;
      const product = id && DB.getProductById(id);
      if (!product) return;
      if (product.hasVariants || (product.pod && product.pod.enabled)) { location.hash = buildHash("/product", { id }); return; }
      Cart.add(id, null, 1); Wishlist.remove(id); card.remove();
      toast("Moved to cart", "success");
      return;
    }

    if (action === "remove-item" || action === "move-to-wishlist") {
      const row = btn.closest("[data-cart-item]");
      const { id: pid, variantId, customId } = row.dataset;
      if (action === "move-to-wishlist") Wishlist.toggle(pid);
      Cart.remove(pid, variantId || null, customId || null);
      row.remove();
      toast(action === "move-to-wishlist" ? "Moved to wishlist" : "Removed from cart");
      document.dispatchEvent(new CustomEvent("cart:linechange"));
      return;
    }

    if (action === "qty-increase" || action === "qty-decrease") {
      const wrap = btn.closest("[data-qty]");
      const input = wrap.querySelector("input");
      const min = Number(input.min) || 1;
      const max = input.dataset.max ? Number(input.dataset.max) : Infinity;
      let val = clamp((Number(input.value) || min) + (action === "qty-increase" ? 1 : -1), min, max);
      input.value = val;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }

    if (action === "toggle-password") {
      const input = document.getElementById(btn.getAttribute("aria-controls"));
      const showing = input.type === "text";
      input.type = showing ? "password" : "text";
      btn.setAttribute("aria-pressed", String(!showing));
      btn.setAttribute("aria-label", showing ? "Show password" : "Hide password");
      return;
    }

    if (action === "logout") {
      Auth.signOut().then(() => { Cart.clear(); toast("Signed out"); goTo(buildHash("/")); }).catch((err) => toast(err.message, "error"));
      return;
    }

    if (action === "share") { openShareDialog(); return; }
  });

  document.addEventListener("change", (e) => {
    if (e.target.matches("[data-qty] input")) {
      const wrap = e.target.closest("[data-qty]");
      const min = Number(e.target.min) || 1;
      const max = e.target.dataset.max ? Number(e.target.dataset.max) : Infinity;
      const val = clamp(Math.floor(Number(e.target.value)) || min, min, max);
      e.target.value = val;
      const row = wrap.closest("[data-cart-item]");
      if (row) {
        Cart.setQuantity(row.dataset.id, row.dataset.variantId || null, val, row.dataset.customId || null);
        document.dispatchEvent(new CustomEvent("cart:linechange"));
      }
      document.dispatchEvent(new CustomEvent("qty:change", { detail: { wrap, value: val } }));
    }
  });
}

// On a product page, share the clean /p/... address: it shows the photo and price in WhatsApp/Facebook and is what Google lists.
function shareableUrl() {
  const m = /^#\/product\?(?:.*&)?id=([^&]+)/.exec(location.hash);
  const product = m ? DB.getProductById(decodeURIComponent(m[1])) : null;
  if (!product) return location.href;
  const slug = String(product.name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).replace(/-+$/g, "") || "product";
  return `${location.origin}/p/${slug}-${product.id}`;
}

function openShareDialog() {
  const dlg = $("#shareDialog");
  if (!dlg) return;
  const url = shareableUrl();
  $("#shareUrl", dlg).value = url;
  const text = encodeURIComponent(document.title);
  const u = encodeURIComponent(url);
  $("#shareWhatsapp", dlg).href = `https://wa.me/?text=${text}%20${u}`;
  $("#shareTelegram", dlg).href = `https://t.me/share/url?url=${u}&text=${text}`;
  $("#shareFacebook", dlg).href = `https://www.facebook.com/sharer/sharer.php?u=${u}`;
  $("#shareX", dlg).href = `https://twitter.com/intent/tweet?url=${u}&text=${text}`;
  openDialog(dlg);
  $("#copyLinkBtn", dlg).onclick = async () => {
    try { await navigator.clipboard.writeText(url); toast("Link copied", "success"); }
    catch { toast("Couldn't copy the link", "error"); }
  };
}

/* ==========================================================================
   9. SHARED RENDERING HELPERS
   ========================================================================== */
function firstImage(product) { return (product.images && product.images[0] && product.images[0].url) || ""; }

function renderProductCard(container, product) {
  const tpl = document.getElementById("tpl-product-card");
  const node = tpl.content.cloneNode(true);
  const root = node.querySelector("[data-product-card]");
  root.dataset.id = product.id;
  const href = buildHash("/product", { id: product.id });
  root.querySelector('[data-field="imageLink"]').href = href;
  const img = root.querySelector('[data-field="image"]');
  if (firstImage(product)) { img.src = firstImage(product); img.alt = product.name; }
  root.querySelector('[data-field="brand"]').textContent = product.brand;
  const titleLink = root.querySelector('[data-field="titleLink"]');
  titleLink.textContent = product.name; titleLink.href = href;
  const price = DB.effectivePrice(product);
  const mrp = product.hasVariants ? product.variants[0]?.mrp : product.mrp;
  root.querySelector('[data-field="price"]').textContent = formatMoney(price);
  if (mrp > price) {
    const mrpEl = root.querySelector('[data-field="mrp"]'); mrpEl.hidden = false; mrpEl.textContent = formatMoney(mrp);
    const offEl = root.querySelector('[data-field="discountText"]'); offEl.hidden = false; offEl.textContent = product.discountPercent + "% off";
  }
  if (product.rating?.count) {
    const r = root.querySelector('[data-field="rating"]'); r.hidden = false;
    r.querySelector('[data-field="ratingValue"]').textContent = product.rating.average.toFixed(1);
    r.querySelector('[data-field="reviewCount"]').textContent = `(${product.rating.count})`;
  }
  const stock = DB.totalStock(product);
  const stockEl = root.querySelector('[data-field="stockText"]');
  stockEl.textContent = stock === 0 ? "Out of stock" : stock <= (product.lowStockThreshold || 5) ? `Only ${stock} left` : "In stock";
  if (stock === 0) stockEl.dataset.empty = "true";
  const wishBtn = root.querySelector('[data-action="toggle-wishlist"]');
  const isWished = Wishlist.has(product.id);
  wishBtn.setAttribute("aria-pressed", String(isWished));
  const cta = root.querySelector(".product-card__cta");
  if (stock === 0) { cta.disabled = true; cta.textContent = "Out of stock"; }
  else if (product.pod && product.pod.enabled) cta.textContent = "Customize";
  else if (product.hasVariants) cta.textContent = "Choose options";
  container.appendChild(node);
}

function renderProductGrid(container, products, { skeletonCount = 0 } = {}) {
  container.innerHTML = "";
  container.removeAttribute("aria-busy");
  if (skeletonCount && products == null) {
    const skTpl = document.getElementById("tpl-product-skeleton");
    for (let i = 0; i < skeletonCount; i++) container.appendChild(skTpl.content.cloneNode(true));
    return;
  }
  products.forEach((p) => renderProductCard(container, p));
}

function renderCategoryCard(container, category) {
  const tpl = document.getElementById("tpl-category-card");
  const node = tpl.content.cloneNode(true);
  const a = node.querySelector("[data-category-card]");
  a.href = buildHash("/category", { slug: category.slug });
  if (category.image) node.querySelector('[data-field="image"]').src = category.image;
  node.querySelector('[data-field="name"]').textContent = category.name;
  container.appendChild(node);
}

function ratingStars(value) { return useIcon(value >= 1 ? "star-fill" : "star", "xs"); }

function renderReviewItem(container, review, tplId = "tpl-review") {
  const tpl = document.getElementById(tplId);
  const node = tpl.content.cloneNode(true);
  node.querySelector('[data-field="rating"]').textContent = review.rating.toFixed(1);
  const titleEl = node.querySelector('[data-field="title"]');
  if (titleEl) titleEl.textContent = review.title || "";
  node.querySelector('[data-field="text"]').textContent = review.text;
  const imgs = node.querySelector('[data-field="images"]');
  if (imgs && review.images?.length) {
    imgs.hidden = false;
    imgs.innerHTML = review.images.map((src) => `<li><img src="${src}" alt="" width="56" height="56"></li>`).join("");
  }
  const authorEl = node.querySelector('[data-field="author"]');
  if (authorEl) authorEl.textContent = review.userName || "Shopper";
  const verifiedEl = node.querySelector('[data-field="verified"]');
  if (verifiedEl) verifiedEl.hidden = !review.verifiedPurchase;
  const dateEl = node.querySelector('[data-field="date"]');
  if (dateEl) { dateEl.textContent = formatDate(review.createdAt); dateEl.dateTime = new Date(review.createdAt).toISOString(); }
  container.appendChild(node);
}

function renderRatingSummary(host, product) {
  const avg = product.rating?.average || 0, count = product.rating?.count || 0;
  const avgEl = host.querySelector("#ratingAverage"), totalEl = host.querySelector("#ratingTotal");
  if (avgEl) avgEl.textContent = avg ? avg.toFixed(1) : "0.0";
  if (totalEl) totalEl.textContent = count ? `${count} rating${count === 1 ? "" : "s"}` : "No reviews yet";
  const reviews = DB.getReviewsForProduct(product.id);
  [5, 4, 3, 2, 1].forEach((star) => {
    const row = host.querySelector(`.rating-bars__row[data-star="${star}"]`);
    if (!row) return;
    const n = reviews.filter((r) => Math.round(r.rating) === star).length;
    const pct = count ? Math.round((n / reviews.length || 0) * 100) : 0;
    row.querySelector(".rating-bars__meter").value = reviews.length ? Math.round((n / reviews.length) * 100) : 0;
    row.querySelector(".rating-bars__count").textContent = n;
  });
}

/* ==========================================================================
   10. PAGE CONTROLLERS
   One function per route, called by the router right after it mounts that
   route's template. Each returns an optional teardown function.
   ========================================================================== */
const PageControllers = {};

PageControllers.home = function (host) {
  const products = DB.getProducts({});
  renderProductGrid(host.querySelector("#trendingProducts"), products.filter((p) => p.flags.includes("trending")).slice(0, 8));
  renderProductGrid(host.querySelector("#bestSellerProducts"), products.filter((p) => p.flags.includes("best_seller")).slice(0, 8));
  renderProductGrid(host.querySelector("#newArrivalProducts"), products.filter((p) => p.flags.includes("new_arrival")).slice(0, 8));
  renderProductGrid(host.querySelector("#specialOfferProducts"), products.filter((p) => p.flags.includes("special_offer")).slice(0, 8));
  renderProductGrid(host.querySelector("#recommendedProducts"), products.filter((p) => p.flags.includes("recommended")).slice(0, 8));
  const catRail = host.querySelector("#featuredCategories");
  DB.getCategories().filter((c) => !c.parentId).forEach((c) => renderCategoryCard(catRail, c));
  catRail.removeAttribute("aria-busy");

  const recent = RecentlyViewed.getProducts();
  const recentSection = host.querySelector("#sectionRecentlyViewed");
  if (recent.length) { recentSection.hidden = false; renderProductGrid(host.querySelector("#recentlyViewedProducts"), recent.slice(0, 8)); }

  // Hero dots/arrows are ready for multiple banners once the admin adds any;
  // with the single default slide there's nothing to cycle.
  const dots = host.querySelector("#heroDots");
  if (dots) dots.innerHTML = "";
};

PageControllers.help = function (host, params, sub) {
  const settings = DB.getSettings();
  const policies = { shipping: settings.policyShipping, returns: settings.policyReturns, privacy: settings.policyPrivacy, terms: settings.policyTerms };
  Object.entries(policies).forEach(([key, text]) => {
    const body = host.querySelector(`[data-policy="${key}"] [data-policy-body]`);
    if (body && text) body.innerHTML = `<p>${escapeHtml(text).replace(/\n+/g, "</p><p>")}</p>`;
  });
  let anyContact = false;
  [["supportEmail", "mailto:"], ["supportPhone", "tel:+91"], ["supportWhatsapp", "https://wa.me/91"]].forEach(([key, prefix]) => {
    const value = settings[key];
    host.querySelectorAll(`[data-setting-wrap="${key}"]`).forEach((wrap) => {
      if (!value) return;
      anyContact = true;
      wrap.hidden = false;
      const a = wrap.querySelector(`[data-setting="${key}"]`);
      a.textContent = key === "supportEmail" ? value : key === "supportWhatsapp" ? "Chat on WhatsApp" : "+91 " + value;
      a.href = prefix + value;
    });
  });
  const contactEmpty = host.querySelector("#contactEmpty");
  if (contactEmpty) contactEmpty.hidden = anyContact;
  if (sub) requestAnimationFrame(() => host.querySelector("#" + sub)?.scrollIntoView({ block: "start" }));
};

/* ---- Shared listing engine: used by Products, Category and Search pages ---- */
function collectVariantOptions(products, key) {
  const set = new Map();
  products.forEach((p) => (p.variants || []).forEach((v) => { if (v[key]) set.set(v[key], v.colorHex || v[key]); }));
  return set;
}

function initListing(host, opts) {
  const state = { filters: {}, sort: "relevance", page: 1, pageSize: 12 };
  const grid = host.querySelector("#productGrid");
  const countEl = host.querySelector("#resultsCount");
  const emptyEl = host.querySelector("#productsEmpty");
  const errorEl = host.querySelector("#productsError");
  const loadMoreBtn = host.querySelector("#loadMore");
  const listEnd = host.querySelector("#listEnd");
  const form = host.querySelector("#filterForm");
  const allProducts = DB.getProducts(opts.baseFilter || {});

  // populate filter option lists once from what's actually available here
  const catBox = host.querySelector("#filterCategories");
  if (catBox) {
    const cats = opts.categoryOptions || DB.getCategoryTree().flatMap((c) => [c, ...c.subcategories]);
    catBox.innerHTML = cats.map((c) => `<label class="check"><input type="checkbox" name="category" value="${c.id}"><span>${escapeHtml(c.name)}</span></label>`).join("");
  }
  const brandBox = host.querySelector("#filterBrands");
  const brands = Array.from(new Set(allProducts.map((p) => p.brand))).sort();
  if (brandBox) brandBox.innerHTML = brands.map((b) => `<label class="check"><input type="checkbox" name="brand" value="${escapeHtml(b)}"><span>${escapeHtml(b)}</span></label>`).join("");
  host.querySelector("#brandFilterSearch")?.addEventListener("input", (e) => {
    const q = e.target.value.toLowerCase();
    $$("label", brandBox).forEach((l) => (l.hidden = !l.textContent.toLowerCase().includes(q)));
  });
  const colorBox = host.querySelector("#filterColors");
  if (colorBox) {
    const colors = collectVariantOptions(allProducts, "color");
    colorBox.innerHTML = Array.from(colors.entries()).map(([name, hex]) =>
      `<button class="swatch" type="button" role="radio" aria-checked="false" data-option="color" data-value="${escapeHtml(name)}" title="${escapeHtml(name)}"><span class="swatch__color" style="background:${/^#/.test(hex) ? hex : "#ccc"}"></span></button>`
    ).join("");
  }
  const sizeBox = host.querySelector("#filterSizes");
  if (sizeBox) {
    const sizes = collectVariantOptions(allProducts, "size");
    sizeBox.innerHTML = Array.from(sizes.keys()).map((s) =>
      `<button class="chip" type="button" role="radio" aria-checked="false" data-option="size" data-value="${escapeHtml(s)}">${escapeHtml(s)}</button>`
    ).join("");
  }
  colorBox?.addEventListener("click", (e) => { const b = e.target.closest(".swatch"); if (b) toggleSwatch(b, colorBox); });
  sizeBox?.addEventListener("click", (e) => { const b = e.target.closest(".chip"); if (b) toggleSwatch(b, sizeBox); });
  function toggleSwatch(btn, box) {
    const already = btn.getAttribute("aria-checked") === "true";
    $$("[role='radio']", box).forEach((b) => b.setAttribute("aria-checked", "false"));
    btn.setAttribute("aria-checked", String(!already));
    apply();
  }

  function readFilters() {
    const fd = new FormData(form);
    const f = { ...opts.baseFilter };
    const categories = fd.getAll("category");
    if (categories.length === 1) f.categoryId = categories[0];
    const brandVals = fd.getAll("brand");
    if (brandVals.length) f.brand = brandVals;
    const min = fd.get("min"), max = fd.get("max");
    if (min) f.minPrice = Number(min);
    if (max) f.maxPrice = Number(max);
    const rating = fd.get("rating"); if (rating) f.minRating = Number(rating);
    const discount = fd.get("discount"); if (discount) f.minDiscount = Number(discount);
    if (fd.get("stock")) f.inStockOnly = true;
    const activeColor = colorBox?.querySelector('[aria-checked="true"]')?.dataset.value;
    const activeSize = sizeBox?.querySelector('[aria-checked="true"]')?.dataset.value;
    f.color = activeColor; f.size = activeSize;
    f.sort = state.sort;
    return f;
  }

  function matchesVariantFilters(p, f) {
    if (!f.color && !f.size) return true;
    if (!p.hasVariants) return false;
    return p.variants.some((v) => (!f.color || v.color === f.color) && (!f.size || v.size === f.size));
  }

  function renderActiveChips(f) {
    const wrap = host.querySelector("#activeFilters"), list = host.querySelector("#activeFilterList");
    if (!wrap) return;
    const chips = [];
    if (f.brand) f.brand.forEach((b) => chips.push(["brand", b, b]));
    if (f.minRating) chips.push(["rating", f.minRating, f.minRating + "★ & up"]);
    if (f.minDiscount) chips.push(["discount", f.minDiscount, f.minDiscount + "% off & up"]);
    if (f.inStockOnly) chips.push(["stock", "in", "In stock"]);
    if (f.color) chips.push(["color", f.color, f.color]);
    if (f.size) chips.push(["size", f.size, "Size " + f.size]);
    if (f.minPrice || f.maxPrice) chips.push(["price", "", `₹${f.minPrice || 0}–₹${f.maxPrice || "∞"}`]);
    wrap.hidden = chips.length === 0;
    list.innerHTML = chips.map(([, , label]) => `<li>${escapeHtml(label)}</li>`).join("");
    const countBadge = host.querySelector("#filterCount");
    if (countBadge) { countBadge.hidden = chips.length === 0; countBadge.textContent = chips.length; }
  }

  function apply() {
    state.filters = readFilters();
    state.page = 1;
    render();
  }

  function render() {
    let results;
    try { results = DB.getProducts(state.filters).filter((p) => matchesVariantFilters(p, state.filters)); errorEl.hidden = true; }
    catch { errorEl.hidden = false; grid.innerHTML = ""; return; }
    renderActiveChips(state.filters);
    countEl.textContent = results.length + (results.length === 1 ? " product" : " products");
    const visible = results.slice(0, state.page * state.pageSize);
    renderProductGrid(grid, visible);
    emptyEl.hidden = results.length !== 0;
    loadMoreBtn.hidden = visible.length >= results.length;
    listEnd.hidden = !(results.length > state.pageSize && visible.length >= results.length);
  }

  form?.addEventListener("change", apply);
  form?.addEventListener("submit", (e) => { e.preventDefault(); apply(); closeSheet(host.querySelector("#filterPanel"), host.querySelector("#filterBackdrop")); });
  form?.addEventListener("reset", () => {
    setTimeout(() => { $$('[role="radio"]', host).forEach((b) => b.setAttribute("aria-checked", "false")); apply(); }, 0);
  });
  host.querySelector("#clearAllFilters")?.addEventListener("click", () => { form.reset(); form.dispatchEvent(new Event("reset")); });
  host.querySelector("#emptyClearFilters")?.addEventListener("click", () => { form.reset(); form.dispatchEvent(new Event("reset")); });
  host.querySelector("#sortSelect")?.addEventListener("change", (e) => { state.sort = e.target.value; apply(); });
  host.querySelector("#retryProducts")?.addEventListener("click", render);
  loadMoreBtn?.addEventListener("click", () => { state.page += 1; render(); });

  apply();
  return { rerender: apply };
}

PageControllers.products = function (host, params) {
  const collection = params.get("collection");
  const titleMap = { trending: "Trending now", "best-sellers": "Best sellers", "new-arrivals": "New arrivals", "special-offers": "Special offers", recommended: "Recommended for you" };
  if (collection && titleMap[collection]) {
    host.querySelector("#listingTitle").textContent = titleMap[collection];
    const sub = host.querySelector("#listingSubtitle"); sub.hidden = false; sub.textContent = "A hand-picked selection just for this section.";
  }
  initListing(host, { baseFilter: collection ? { collection } : {} });
  wireMobileFilters(host);
};

PageControllers.category = function (host, params) {
  const slug = params.get("slug");
  const indexView = host.querySelector("#categoryIndex");
  const productsView = host.querySelector("#categoryProducts");
  const notFound = host.querySelector("#categoryNotFound");
  const grid = host.querySelector("#categoryGrid");

  if (!slug) {
    indexView.hidden = false; productsView.hidden = true; notFound.hidden = true;
    const tree = DB.getCategoryTree();
    const tplBlock = document.getElementById("tpl-category-block");
    grid.innerHTML = "";
    tree.forEach((cat) => {
      const node = tplBlock.content.cloneNode(true);
      const href = buildHash("/category", { slug: cat.slug });
      node.querySelector('[data-field="link"]').href = href;
      if (cat.image) node.querySelector('[data-field="image"]').src = cat.image;
      const titleLink = node.querySelector('[data-field="titleLink"]'); titleLink.textContent = cat.name; titleLink.href = href;
      node.querySelector('[data-field="subcategories"]').innerHTML = cat.subcategories
        .map((s) => `<li><a href="${buildHash("/category", { slug: s.slug })}">${escapeHtml(s.name)}</a></li>`).join("");
      node.querySelector('[data-field="viewAll"]').href = href;
      grid.appendChild(node);
    });
    grid.removeAttribute("aria-busy");
    host.querySelector("#categoryEmpty").hidden = tree.length !== 0;
    return;
  }

  const cat = DB.getCategoryBySlug(slug);
  if (!cat) { indexView.hidden = true; productsView.hidden = true; notFound.hidden = false; return; }
  indexView.hidden = true; productsView.hidden = false; notFound.hidden = true;

  const crumb = host.querySelector("#categoryBreadcrumb");
  const parent = cat.parentId ? DB.getCategoryById(cat.parentId) : null;
  crumb.innerHTML = `<li class="breadcrumb__item"><a href="${buildHash("/")}">Home</a></li>`
    + `<li class="breadcrumb__item"><a href="${buildHash("/category")}">Categories</a></li>`
    + (parent ? `<li class="breadcrumb__item"><a href="${buildHash("/category", { slug: parent.slug })}">${escapeHtml(parent.name)}</a></li>` : "")
    + `<li class="breadcrumb__item" aria-current="page">${escapeHtml(cat.name)}</li>`;
  host.querySelector("#categoryTitle").textContent = cat.name;
  if (cat.description) { const d = host.querySelector("#categoryDescription"); d.hidden = false; d.textContent = cat.description; }

  const chips = host.querySelector("#subcategoryChips");
  const subs = DB.getCategories().filter((c) => c.parentId === cat.id);
  chips.innerHTML = subs.map((s) => `<li><a class="chip" href="${buildHash("/category", { slug: s.slug })}">${escapeHtml(s.name)}</a></li>`).join("");

  initListing(host, { baseFilter: { categoryId: cat.id }, categoryOptions: subs.length ? subs : [cat] });
  wireMobileFilters(host);
};

PageControllers.search = function (host, params) {
  const q = (params.get("q") || "").trim();
  const landing = host.querySelector("#searchLanding");
  const results = host.querySelector("#searchResults");
  host.querySelector("#searchSubtitle").hidden = !q;
  if (q) host.querySelector("#searchSubtitle").textContent = `Results for “${q}”`;

  if (!q) {
    landing.hidden = false; results.hidden = true;
    const recents = recentSearches();
    const recentBlock = host.querySelector("#searchLandingRecent");
    recentBlock.hidden = recents.length === 0;
    host.querySelector("#searchLandingRecentList").innerHTML = recents
      .map((t) => `<li><a class="chip" href="${buildHash("/search", { q: t })}">${escapeHtml(t)}</a></li>`).join("");
    host.querySelector("#clearRecentSearchesPage")?.addEventListener("click", () => { clearRecentSearches(); location.reload ? navigate() : null; });
    const cats = DB.getCategories().filter((c) => !c.parentId);
    host.querySelector("#searchLandingCategoryList").innerHTML = cats
      .map((c) => `<li><a class="chip" href="${buildHash("/category", { slug: c.slug })}">${escapeHtml(c.name)}</a></li>`).join("");
    return;
  }
  landing.hidden = true; results.hidden = false;
  addRecentSearch(q);
  initListing(host, { baseFilter: { q } });
  wireMobileFilters(host);
};

/* ---- Product details ---- */
PageControllers.productDetails = function (host, params) {
  const id = params.get("id");
  const product = id && DB.getProductById(id);
  const loading = host.querySelector("#productLoading");
  const notFound = host.querySelector("#productNotFound");
  const view = host.querySelector("#productView");
  loading.hidden = true;
  if (!product) { notFound.hidden = false; view.hidden = true; return; }
  notFound.hidden = true; view.hidden = false;
  RecentlyViewed.add(product.id);

  const crumb = host.querySelector("#productBreadcrumb");
  const cat = DB.getCategoryById(product.categoryId);
  if (cat) crumb.insertAdjacentHTML("beforeend", `<li class="breadcrumb__item" aria-current="page">${escapeHtml(cat.name)}</li>`);

  host.querySelector("#productBrand").textContent = product.brand;
  host.querySelector("#productTitle").textContent = product.name;
  if (product.rating?.count) {
    const r = host.querySelector("#productRating"); r.hidden = false; r.href = "#reviews";
    host.querySelector("#productRatingValue").textContent = product.rating.average.toFixed(1);
    host.querySelector("#productReviewCount").textContent = `${product.rating.count} rating${product.rating.count === 1 ? "" : "s"}`;
  }
  if (product.offers?.length) {
    host.querySelector("#productOffers").hidden = false;
    host.querySelector("#offersList").innerHTML = product.offers.map((o) => `<li>${escapeHtml(o)}</li>`).join("");
  }
  if (product.highlights?.length) {
    host.querySelector("#productHighlights").hidden = false;
    host.querySelector("#highlightsList").innerHTML = product.highlights.map((h) => `<li>${escapeHtml(h)}</li>`).join("");
  }
  host.querySelector("#productDescription").innerHTML = `<p>${escapeHtml(product.description || "").replace(/\n+/g, "</p><p>")}</p>`;
  if (product.specifications?.length) {
    host.querySelector("#specsSection").hidden = false;
    host.querySelector("#specTableBody").innerHTML = product.specifications.map((s) => `<tr><td>${escapeHtml(s.key)}</td><td>${escapeHtml(s.value)}</td></tr>`).join("");
  }
  if (product.warranty) { host.querySelector("#warrantySection").hidden = false; host.querySelector("#productWarranty").innerHTML = `<p>${escapeHtml(product.warranty)}</p>`; }
  if (product.sku) { host.querySelector("#skuRow").hidden = false; host.querySelector("#productSku").textContent = product.sku; }
  if (product.productCode) { host.querySelector("#codeRow").hidden = false; host.querySelector("#productCode").textContent = product.productCode; }

  const settings = DB.getSettings();
  const dMin = product.deliveryDaysMin ?? settings.deliveryDaysMin, dMax = product.deliveryDaysMax ?? settings.deliveryDaysMax;
  host.querySelector("#deliveryText").textContent = `Delivery in ${dMin}–${dMax} days`;
  if (product.shippingCharge || product.freeShipping) {
    host.querySelector("#shippingRow").hidden = false;
    host.querySelector("#shippingText").textContent = product.freeShipping ? "Free shipping on this product" : `Shipping: ${formatMoney(product.shippingCharge)}`;
  }

  const wishBtn = host.querySelector("#productWishlistBtn");
  wishBtn.dataset.id = product.id;
  wishBtn.setAttribute("aria-pressed", String(Wishlist.has(product.id)));
  const productInfo = host.querySelector(".product__info"); productInfo.dataset.id = product.id;

  // ---- Variant state ----
  let selected = { color: null, size: null, options: {} };
  let currentVariant = null;
  const gallery = createGallery(host);

  function currentImages() {
    if (currentVariant && currentVariant.images?.length) return currentVariant.images;
    return product.images?.length ? product.images.map((i) => i.url) : [];
  }

  function pickInitialVariant() {
    if (!product.hasVariants) return null;
    return product.variants.find((v) => v.stock > 0) || product.variants[0];
  }

  function findVariant() {
    if (!product.hasVariants) return null;
    return product.variants.find((v) =>
      (!selected.color || v.color === selected.color) && (!selected.size || v.size === selected.size)) || null;
  }

  function renderVariantUI() {
    const selector = host.querySelector("#variantSelector");
    if (!product.hasVariants) { selector.hidden = true; return; }
    selector.hidden = false;
    const colors = Array.from(new Set(product.variants.map((v) => v.color).filter(Boolean)));
    const sizes = Array.from(new Set(product.variants.map((v) => v.size).filter(Boolean)));
    if (colors.length) {
      const group = host.querySelector("#colorGroup"); group.hidden = false;
      host.querySelector("#colorValue").textContent = selected.color || "";
      const box = host.querySelector("#colorOptions");
      box.innerHTML = colors.map((c) => {
        const hex = product.variants.find((v) => v.color === c)?.colorHex || "#ccc";
        return `<button class="swatch" type="button" role="radio" aria-checked="${c === selected.color}" data-value="${escapeHtml(c)}" title="${escapeHtml(c)}"><span class="swatch__color" style="background:${hex}"></span></button>`;
      }).join("");
    }
    if (sizes.length) {
      const group = host.querySelector("#sizeGroup"); group.hidden = false;
      host.querySelector("#sizeValue").textContent = selected.size || "";
      const box = host.querySelector("#sizeOptions");
      box.innerHTML = sizes.map((s) => `<button class="chip" type="button" role="radio" aria-checked="${s === selected.size}" data-value="${escapeHtml(s)}">${escapeHtml(s)}</button>`).join("");
    }
  }

  function updateForVariant() {
    currentVariant = findVariant();
    const price = currentVariant ? currentVariant.price : product.price;
    const mrp = currentVariant ? currentVariant.mrp : product.mrp;
    const stock = currentVariant ? currentVariant.stock : product.stock;
    const discountPct = mrp > 0 ? Math.round(((mrp - price) / mrp) * 100) : 0;

    host.querySelector("#productPrice").textContent = formatMoney(price);
    const mrpEl = host.querySelector("#productMrp"), offEl = host.querySelector("#productDiscount");
    if (mrp > price) { mrpEl.hidden = false; mrpEl.textContent = formatMoney(mrp); offEl.hidden = false; offEl.textContent = discountPct + "% off"; }
    else { mrpEl.hidden = true; offEl.hidden = true; }

    const stockEl = host.querySelector("#stockStatus");
    if (stock === 0) { stockEl.textContent = "Out of stock"; stockEl.dataset.empty = "true"; }
    else if (stock <= (product.lowStockThreshold || 5)) { stockEl.textContent = `Only ${stock} left in stock`; stockEl.dataset.low = "true"; }
    else { stockEl.textContent = "In stock"; delete stockEl.dataset.empty; delete stockEl.dataset.low; }

    const qtyInput = host.querySelector("#productQty");
    qtyInput.max = stock || 1; qtyInput.dataset.max = stock || 1;
    if (Number(qtyInput.value) > stock) qtyInput.value = Math.max(1, stock);

    const codAvailable = product.codAvailable && stock > 0;
    const codFeePerUnit = Number(product.codHandlingFee) || 0;
    host.querySelector("#codInfo").hidden = !codAvailable;
    if (codAvailable) {
      host.querySelector(".cod-note__text").innerHTML = codFeePerUnit > 0
        ? `Cash on Delivery is available. Nothing to pay online. A COD fee of <strong>${formatMoney(codFeePerUnit)}</strong> per unit is added to the amount you pay at delivery.`
        : "Cash on Delivery is available. Nothing to pay online. You pay the full amount at delivery.";
    }

    const images = currentImages();
    gallery.setImages(images, product.name);

    const addBtn = host.querySelector("#addToCartBtn"), buyBtn = host.querySelector("#buyNowBtn");
    const needsSelection = product.hasVariants && !currentVariant;
    const disabled = stock === 0 || needsSelection;
    addBtn.disabled = disabled; buyBtn.disabled = disabled;
    addBtn.textContent = needsSelection ? "Select options" : stock === 0 ? "Out of stock" : "Add to cart";
    const customizeBtn = host.querySelector("#customizeBtn");
    if (customizeBtn) { customizeBtn.disabled = disabled; customizeBtn.textContent = needsSelection ? "Select options" : stock === 0 ? "Out of stock" : "Customize"; }

    updateTotals(codFeePerUnit, codAvailable);
  }

  function updateTotals(codFeePerUnit, codAvailable) {
    const qty = Number(host.querySelector("#productQty").value) || 1;
    const price = currentVariant ? currentVariant.price : product.price;
    host.querySelector("#lineTotal").textContent = formatMoney(price * qty);
    const codLine = host.querySelector("#codLine");
    if (codAvailable && codFeePerUnit) {
      codLine.hidden = false;
      host.querySelector("#codQtyLabel").textContent = qty === 1 ? "1 unit" : `${qty} units`;
      host.querySelector("#codFeeTotal").textContent = formatMoney(codFeePerUnit * qty);
    } else codLine.hidden = true;
  }

  host.querySelector("#colorOptions")?.addEventListener("click", (e) => { const b = e.target.closest("[role=radio]"); if (b) { selected.color = b.dataset.value; renderVariantUI(); updateForVariant(); } });
  host.querySelector("#sizeOptions")?.addEventListener("click", (e) => { const b = e.target.closest("[role=radio]"); if (b) { selected.size = b.dataset.value; renderVariantUI(); updateForVariant(); } });
  host.querySelector("#productQty")?.addEventListener("change", () => updateForVariant());
  document.addEventListener("qty:change", (e) => { if (host.contains(e.detail.wrap)) updateForVariant(); }, { once: false });

  if (product.hasVariants) { const init = pickInitialVariant(); selected.color = init?.color || null; selected.size = init?.size || null; }
  renderVariantUI();
  updateForVariant();

  if (product.pod && product.pod.enabled) {
    // Print on demand: the shopper designs first, then adds to cart from the customizer.
    host.querySelector("#podBox").hidden = false;
    host.querySelector("#addToCartBtn").hidden = true; host.querySelector("#buyNowBtn").hidden = true;
    host.querySelector("#customizeBtn").addEventListener("click", () => {
      openCustomizer(product, currentVariant, Number(host.querySelector("#productQty").value) || 1);
    });
  }

  host.querySelector("#addToCartBtn")?.addEventListener("click", () => {
    const qty = Number(host.querySelector("#productQty").value) || 1;
    Cart.add(product.id, currentVariant?.variantId || null, qty);
    toast(`${product.name} added to cart`, "success");
  });
  host.querySelector("#buyNowBtn")?.addEventListener("click", () => {
    const qty = Number(host.querySelector("#productQty").value) || 1;
    Cart.replaceForBuyNow(product.id, currentVariant?.variantId || null, qty);
    location.hash = buildHash("/checkout", { mode: "buynow" });
  });

  // ---- Reviews ----
  renderRatingSummary(host, product);
  let reviews = DB.getReviewsForProduct(product.id);
  const reviewSection = host.querySelector("#reviews");
  if (reviews.length || Auth.currentUser()) reviewSection.hidden = false;
  host.querySelector("#reviewEmpty").hidden = reviews.length !== 0;
  host.querySelector("#reviewToolbar").hidden = reviews.length === 0;
  function renderReviews(sort) {
    let list = [...reviews];
    if (sort === "high") list.sort((a, b) => b.rating - a.rating);
    else if (sort === "low") list.sort((a, b) => a.rating - b.rating);
    else list.sort((a, b) => b.createdAt - a.createdAt);
    const listEl = host.querySelector("#reviewList"); listEl.innerHTML = "";
    list.forEach((r) => renderReviewItem(listEl, r));
  }
  renderReviews("recent");
  host.querySelector("#reviewSort")?.addEventListener("change", (e) => renderReviews(e.target.value));
  DB.loadReviewsForProduct(product.id).then((fresh) => {
    if (!host.isConnected) return;
    reviews = fresh;
    if (reviews.length || Auth.currentUser()) reviewSection.hidden = false;
    host.querySelector("#reviewEmpty").hidden = reviews.length !== 0;
    host.querySelector("#reviewToolbar").hidden = reviews.length === 0;
    renderReviews(host.querySelector("#reviewSort")?.value || "recent");
    renderRatingSummary(host, product);
  });

  const writeBtn = host.querySelector("#writeReviewBtn");
  const user = Auth.currentUser();
  const eligibleOrder = user && DB.getOrders({ userId: user.uid }).find((o) =>
    o.orderStatus === "delivered" && o.items.some((it) => it.productId === product.id) && !DB.hasReviewed(user.uid, product.id, o.orderId));
  if (eligibleOrder) { writeBtn.hidden = false; writeBtn.addEventListener("click", () => openReviewDialog(host, product, eligibleOrder, () => {
    writeBtn.hidden = true; renderReviews("recent"); renderRatingSummary(host, product);
    const fresh = DB.getProductById(product.id);
    if (fresh?.rating?.count) {
      const r = host.querySelector("#productRating"); r.hidden = false;
      host.querySelector("#productRatingValue").textContent = fresh.rating.average.toFixed(1);
      host.querySelector("#productReviewCount").textContent = `${fresh.rating.count} rating${fresh.rating.count === 1 ? "" : "s"}`;
    }
  })); }

  // ---- Related products ----
  const related = DB.getRelatedProducts(product);
  if (related.length) { host.querySelector("#relatedSection").hidden = false; renderProductGrid(host.querySelector("#relatedProducts"), related); }
};

function createGallery(host) {
  const track = host.querySelector("#galleryTrack"), thumbs = host.querySelector("#galleryThumbs"), dots = host.querySelector("#galleryDots");
  const slideTpl = document.getElementById("tpl-gallery-slide"), thumbTpl = document.getElementById("tpl-gallery-thumb");
  let images = [], index = 0;
  function render() {
    track.innerHTML = ""; thumbs.innerHTML = ""; dots.innerHTML = "";
    const list = images.length ? images : [""];
    list.forEach((src) => {
      const slide = slideTpl.content.cloneNode(true);
      const img = slide.querySelector("img"); if (src) img.src = src;
      track.appendChild(slide);
      const dot = document.createElement("li"); dots.appendChild(dot);
    });
    list.forEach((src, i) => {
      const t = thumbTpl.content.cloneNode(true);
      const btn = t.querySelector("[data-gallery-thumb]");
      if (src) t.querySelector("img").src = src;
      btn.addEventListener("click", () => goTo(i));
      thumbs.appendChild(t);
    });
    goTo(0);
  }
  function goTo(i) {
    index = clamp(i, 0, images.length - 1 || 0);
    track.scrollTo({ left: track.clientWidth * index, behavior: "smooth" });
    $$(".gallery__thumb", thumbs).forEach((b, n) => b.classList.toggle("is-active", n === index));
    $$("li", dots).forEach((d, n) => d.classList.toggle("is-active", n === index));
  }
  host.querySelector("#galleryPrev")?.addEventListener("click", () => goTo(index - 1));
  host.querySelector("#galleryNext")?.addEventListener("click", () => goTo(index + 1));
  host.querySelector("#galleryExpand")?.addEventListener("click", () => openLightbox(images, index));
  return { setImages: (imgs) => { images = imgs; render(); } };
}

function openLightbox(images, startIndex) {
  const dlg = $("#lightbox");
  if (!dlg || !images.length) return;
  let i = startIndex || 0;
  const img = $("#lightboxImage"), counter = $("#lightboxCounter");
  function show() { img.src = images[i]; counter.textContent = `${i + 1} / ${images.length}`; }
  $("#lightboxPrev").onclick = () => { i = (i - 1 + images.length) % images.length; show(); };
  $("#lightboxNext").onclick = () => { i = (i + 1) % images.length; show(); };
  show(); openDialog(dlg);
}

/* ---- Print on demand: small design previews + the customizer ---- */
function designThumbHtml(mockup, area, art, label, link) {
  const a = area || { x: 30, y: 22, w: 40, h: 40 };
  return `<div class="design-thumb"><div class="design-thumb__stage"><img class="design-thumb__mockup" src="${escapeHtml(mockup || "")}" alt="">` +
    `<div class="design-thumb__area" style="left:${a.x}%;top:${a.y}%;width:${a.w}%;height:${a.h}%"><img class="design-thumb__art" src="${escapeHtml(art.url)}" alt="" style="left:${art.cx}%;top:${art.cy}%;width:${Math.round(art.scale * 100)}%"></div></div>` +
    `<span>${label}</span>${link ? `<a href="${escapeHtml(art.url)}" target="_blank" rel="noopener">Open design</a>` : ""}</div>`;
}
function customSummaryHtml(custom, opts = {}) {
  if (!custom || (!custom.front && !custom.back)) return "";
  const parts = [];
  if (custom.front) parts.push(designThumbHtml(custom.mockupFront, custom.area, custom.front, "Front", opts.links));
  if (custom.back) parts.push(designThumbHtml(custom.mockupBack || custom.mockupFront, custom.area, custom.back, "Back", opts.links));
  return `<div class="design-list">${parts.join("")}</div>`;
}

function openCustomizer(product, variant, qty) {
  const dlg = $("#customizerDialog");
  if (!dlg) return;
  const pod = product.pod || {};
  const area = { x: 30, y: 22, w: 40, h: 40, ...(pod.area || {}) };
  const mockupFront = (variant && variant.images && variant.images[0]) || firstImage(product);
  const mockupBack = pod.backImage || mockupFront;
  const baseUnit = variant ? variant.price : product.price;
  const stock = variant ? variant.stock : product.stock;
  const backExtra = Math.max(0, Number(pod.backExtra) || 0);
  const state = { side: "front", front: null, back: null, uploading: 0 };

  const el = (id) => dlg.querySelector("#" + id);
  const mockup = el("customizerMockup"), areaEl = el("customizerArea"), art = el("customizerArt");
  const range = el("customizerScale"), sizeWrap = el("customizerSizeWrap"), removeBtn = el("customizerRemove");
  const errorEl = el("customizerError"), statusEl = el("customizerStatus"), fileInput = el("customizerFile");
  const addBtn = el("customizerAddBtn"), buyBtn = el("customizerBuyBtn");

  el("customizerName").textContent = [product.name, variant ? [variant.color, variant.size].filter(Boolean).join(" / ") : ""].filter(Boolean).join(" — ");
  areaEl.style.left = area.x + "%"; areaEl.style.top = area.y + "%"; areaEl.style.width = area.w + "%"; areaEl.style.height = area.h + "%";
  el("customizerBackTab").hidden = pod.allowBack === false;
  el("customizerBackExtra").textContent = backExtra ? `(+${formatMoney(backExtra)})` : "";
  errorEl.hidden = true; statusEl.textContent = "";

  const current = () => state[state.side];
  const showError = (msg) => { errorEl.innerHTML = msg; errorEl.hidden = false; };

  function render() {
    mockup.src = (state.side === "back" ? mockupBack : mockupFront) || "";
    $$("#customizerSides [data-side]", dlg).forEach((b) => { const on = b.dataset.side === state.side; b.classList.toggle("is-active", on); b.setAttribute("aria-selected", String(on)); });
    const sd = current();
    art.hidden = !sd; sizeWrap.hidden = !sd; removeBtn.hidden = !sd;
    if (sd) {
      art.src = sd.localUrl || sd.url;
      art.style.left = sd.cx + "%"; art.style.top = sd.cy + "%"; art.style.width = Math.round(sd.scale * 100) + "%";
      range.value = String(Math.round(sd.scale * 100));
    }
    el("customizerUploadLabel").textContent = sd ? "Replace design" : "Upload design";
    const hasBack = !!state.back;
    el("customizerPrice").textContent = formatMoney(baseUnit + (hasBack ? backExtra : 0)) + (qty > 1 ? ` × ${qty}` : "");
    el("customizerPriceNote").textContent = hasBack && backExtra ? "Price with back print:" : "Price:";
    const ready = !!(state.front || state.back) && state.uploading === 0 && stock > 0;
    addBtn.disabled = !ready; buyBtn.disabled = !ready;
  }

  el("customizerSides").onclick = (e) => { const b = e.target.closest("[data-side]"); if (!b || b.hidden) return; state.side = b.dataset.side; render(); };
  range.oninput = () => { const sd = current(); if (sd) { sd.scale = Number(range.value) / 100; render(); } };
  removeBtn.onclick = () => { state[state.side] = null; statusEl.textContent = ""; render(); };

  // Drag the design with a finger or the mouse
  let drag = null;
  art.onpointerdown = (e) => {
    const sd = current(); if (!sd) return;
    e.preventDefault(); art.setPointerCapture(e.pointerId);
    const r = areaEl.getBoundingClientRect();
    drag = { x: e.clientX, y: e.clientY, cx: sd.cx, cy: sd.cy, w: r.width || 1, h: r.height || 1 };
  };
  art.onpointermove = (e) => {
    const sd = current(); if (!drag || !sd) return;
    sd.cx = clamp(drag.cx + ((e.clientX - drag.x) / drag.w) * 100, 0, 100);
    sd.cy = clamp(drag.cy + ((e.clientY - drag.y) / drag.h) * 100, 0, 100);
    art.style.left = sd.cx + "%"; art.style.top = sd.cy + "%";
  };
  art.onpointerup = art.onpointercancel = () => { drag = null; };

  fileInput.onchange = async () => {
    const file = fileInput.files[0]; fileInput.value = "";
    if (!file) return;
    errorEl.hidden = true;
    const user = Auth.currentUser();
    if (!user) { showError(`Please <a href="${buildHash("/login", { next: location.hash.slice(1) })}">log in</a> to upload your design, then come back to this product.`); return; }
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { showError("Please choose a PNG, JPG or WebP image."); return; }
    if (file.size > 12 * 1024 * 1024) { showError("That file is larger than 12 MB. Please choose a smaller one."); return; }
    const key = state.side;
    const mine = { url: "", localUrl: URL.createObjectURL(file), cx: 50, cy: 50, scale: 0.7 };
    state[key] = mine; state.uploading += 1; statusEl.textContent = "Uploading your design…"; render();
    try { const up = await uploadDesignImage(file, user.uid); mine.url = up.url; statusEl.textContent = "Design uploaded. Drag it into place."; }
    catch (err) { if (state[key] === mine) state[key] = null; showError(escapeHtml(err.message || "We couldn't upload that design. Please try again.")); statusEl.textContent = ""; }
    finally { state.uploading -= 1; render(); }
  };

  function buildCustom() {
    const clean = (sd) => (sd && sd.url ? { url: sd.url, cx: Math.round(sd.cx * 10) / 10, cy: Math.round(sd.cy * 10) / 10, scale: Math.round(sd.scale * 100) / 100 } : null);
    return { id: genId("c"), front: clean(state.front), back: clean(state.back), mockupFront, mockupBack, area };
  }
  addBtn.onclick = () => {
    const c = buildCustom(); if (!c.front && !c.back) return;
    Cart.add(product.id, variant ? variant.variantId : null, qty, c);
    toast("Added to cart", "success"); closeDialog(dlg);
  };
  buyBtn.onclick = () => {
    const c = buildCustom(); if (!c.front && !c.back) return;
    Cart.replaceForBuyNow(product.id, variant ? variant.variantId : null, qty, c);
    closeDialog(dlg); location.hash = buildHash("/checkout", { mode: "buynow" });
  };
  dlg.onclose = () => { [state.front, state.back].forEach((sd) => { if (sd && sd.localUrl) URL.revokeObjectURL(sd.localUrl); }); };

  render();
  openDialog(dlg);
}

/* ---- Review dialog (shared: product page + My reviews page) ---- */
function openReviewDialog(host, product, order, onSaved) {
  const dlg = $("#reviewDialog");
  if (!dlg) return;
  $("#reviewProductImage", dlg).src = firstImage(product) || "";
  $("#reviewProductName", dlg).textContent = product.name;
  const orderItem = order.items.find((it) => it.productId === product.id);
  $("#reviewProductVariant", dlg).textContent = orderItem?.variant || "";
  $("#reviewProductId", dlg).value = product.id;
  $("#reviewOrderId", dlg).value = order.orderId;
  $("#reviewVariantId", dlg).value = orderItem?.variantId || "";
  const form = $("#reviewForm", dlg);
  form.reset();
  $("#reviewFormError", dlg).hidden = true;
  $("#reviewImagePreview", dlg).innerHTML = "";
  $("#reviewImages", dlg).onchange = (e) => {
    const preview = $("#reviewImagePreview", dlg); preview.innerHTML = "";
    Array.from(e.target.files).slice(0, 3).forEach((file) => {
      const li = document.createElement("li");
      const img = document.createElement("img");
      img.src = URL.createObjectURL(file); img.alt = "";
      li.appendChild(img); preview.appendChild(li);
    });
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const errEl = $("#reviewFormError", dlg), submitBtn = $("#submitReviewBtn", dlg);
    const rating = Number(new FormData(form).get("rating"));
    const text = $("#reviewText", dlg).value.trim();
    if (!rating) { errEl.textContent = "Please choose a star rating."; errEl.hidden = false; return; }
    const user = Auth.currentUser();
    submitBtn.disabled = true; errEl.hidden = true;
    try {
      const files = Array.from($("#reviewImages", dlg).files).slice(0, 3);
      const images = [];
      for (const file of files) images.push(await uploadImage(file, "reviews/" + user.uid, 900, 0.8));
      await DB.addReview({
        productId: product.id, orderId: order.orderId, variantId: orderItem?.variantId || null,
        rating, title: $("#reviewTitle", dlg).value.trim(), text, images,
      });
      closeDialog(dlg);
      toast("Thanks for your review!", "success");
      onSaved?.();
    } catch (err) { errEl.textContent = err.message || "We couldn't save your review. Please try again."; errEl.hidden = false; }
    finally { submitBtn.disabled = false; }
  };  openDialog(dlg);
}

/* ---- Cart ---- */
PageControllers.cart = function (host) {
  function render() {
    const items = Cart.getItems();
    const layout = host.querySelector("#cartLayout"), empty = host.querySelector("#cartEmpty");
    if (!items.length) { layout.hidden = true; empty.hidden = false; return; }
    layout.hidden = false; empty.hidden = true;
    host.querySelector("#cartCountText").hidden = false;
    const qty = items.reduce((s, it) => s + it.quantity, 0);
    host.querySelector("#cartCountText").textContent = `${qty} item${qty === 1 ? "" : "s"} in your cart`;

    const list = host.querySelector("#cartList"); list.innerHTML = "";
    const tpl = document.getElementById("tpl-cart-item");
    items.forEach((it) => {
      const node = tpl.content.cloneNode(true);
      const root = node.querySelector("[data-cart-item]");
      root.dataset.id = it.productId; root.dataset.variantId = it.variantId || ""; root.dataset.customId = it.customId || "";
      const href = buildHash("/product", { id: it.productId });
      node.querySelector('[data-field="link"]').href = href;
      if (it.image) node.querySelector('[data-field="image"]').src = it.image;
      node.querySelector('[data-field="brand"]').textContent = it.product.brand;
      const titleLink = node.querySelector('[data-field="titleLink"]'); titleLink.textContent = it.productName; titleLink.href = href;
      const variantText = it.variant ? [it.variant.color, it.variant.size].filter(Boolean).join(" / ") : "";
      node.querySelector('[data-field="variant"]').textContent = variantText;
      if (it.custom) node.querySelector('[data-field="variant"]').insertAdjacentHTML("afterend", customSummaryHtml(it.custom) + (it.custom.back ? '<p class="design-note">Includes back-side print</p>' : ""));
      node.querySelector('[data-field="price"]').textContent = formatMoney(it.unitPrice);
      if (it.mrp > it.unitPrice) { const m = node.querySelector('[data-field="mrp"]'); m.hidden = false; m.textContent = formatMoney(it.mrp); const d = node.querySelector('[data-field="discountText"]'); d.hidden = false; d.textContent = it.discountPercent + "% off"; }
      const qtyInput = node.querySelector('[data-field="qty"]'); qtyInput.value = it.quantity; qtyInput.max = it.stock || 1; qtyInput.dataset.max = it.stock || 1;
      if (it.quantity > it.stock) { const n = node.querySelector('[data-field="notice"]'); n.hidden = false; n.textContent = `Only ${it.stock} left — quantity adjusted`; }
      if (it.codAvailable && Number(it.codHandlingFee) > 0) { const c = node.querySelector('[data-field="codFee"]'); c.hidden = false; c.textContent = `COD fee if you pay on delivery: ${formatMoney(it.codHandlingFee * it.quantity)}`; }
      node.querySelector('[data-field="lineTotal"]').textContent = formatMoney(it.unitPrice * it.quantity);
      list.appendChild(node);
    });

    const pricing = calculateOrderPricing(items, "online", DB.getSettings());
    host.querySelector("#cartSubtotal").textContent = formatMoney(pricing.subtotal);
    host.querySelector("#cartShipping").textContent = pricing.shipping === 0 ? "Free" : formatMoney(pricing.shipping);
    host.querySelector("#cartTotal").textContent = formatMoney(pricing.total);
  }
  render();
  document.addEventListener("cart:linechange", render);
  return () => document.removeEventListener("cart:linechange", render);
};

/* ---- Checkout: two payment methods only (Cash on Delivery, Pay Online Now via PayU) ---- */
PageControllers.checkout = function (host, params) {
  // Buy Now uses its own saved item and never changes the cart. A normal visit clears any stale Buy Now item.
  const buyNow = params.get("mode") === "buynow" ? Cart.peekBuyNow() : (Cart.clearBuyNow(), null);
  const cartItems = buyNow ? buyNowToItems(buyNow) : Cart.getItems();
  if (params.get("payment") === "failed") host.querySelector("#paymentStatusBanner").hidden = false;
  const empty = host.querySelector("#checkoutEmpty"), form = host.querySelector("#checkoutForm");
  if (!cartItems.length) { empty.hidden = false; form.hidden = true; return; }
  empty.hidden = true; form.hidden = false;
  if (buyNow) { const note = host.querySelector("#checkoutModeNote"); note.hidden = false; note.textContent = "Buying this item now. Your cart is not affected."; host.querySelector("#editCartLink").hidden = true; }

  const user = Auth.currentUser();
  const settings = DB.getSettings();
  let selectedAddressId = null, paymentMethod = "online";
  let coupon = null;   // { code, lines:[{productId, variantId, discount}] } confirmed by the server

  // ---- Items list ----
  const itemsList = host.querySelector("#checkoutItems");
  itemsList.innerHTML = "";
  const itemTpl = document.getElementById("tpl-checkout-item");
  cartItems.forEach((it) => {
    const node = itemTpl.content.cloneNode(true);
    if (it.image) node.querySelector('[data-field="image"]').src = it.image;
    node.querySelector('[data-field="title"]').textContent = it.productName;
    const variantText = it.variant ? [it.variant.color, it.variant.size].filter(Boolean).join(" / ") : "";
    node.querySelector('[data-field="variant"]').textContent = variantText;
    if (it.custom) node.querySelector('[data-field="variant"]').insertAdjacentHTML("afterend", customSummaryHtml(it.custom));
    node.querySelector('[data-field="qty"]').textContent = `Qty: ${it.quantity}`;
    node.querySelector('[data-field="lineTotal"]').textContent = formatMoney(it.unitPrice * it.quantity);
    if (!it.codAvailable) node.querySelector('[data-field="codFlag"]').hidden = false;
    itemsList.appendChild(node);
  });

  // ---- Addresses ----
  const addressBox = host.querySelector("#addressOptions");
  function renderAddresses() {
    const list = DB.getAddresses(user.uid);
    host.querySelector("#noAddressNote").hidden = list.length !== 0;
    addressBox.innerHTML = "";
    const tpl = document.getElementById("tpl-address-option");
    list.forEach((addr) => {
      const node = tpl.content.cloneNode(true);
      const input = node.querySelector(".address-option__input");
      input.value = addr.id;
      if (addr.isDefault && !selectedAddressId) selectedAddressId = addr.id;
      input.checked = addr.id === selectedAddressId;
      node.querySelector('[data-field="name"]').textContent = addr.fullName;
      node.querySelector('[data-field="type"]').textContent = addr.addressType[0].toUpperCase() + addr.addressType.slice(1);
      node.querySelector('[data-field="default"]').hidden = !addr.isDefault;
      node.querySelector('[data-field="address"]').textContent = formatAddress(addr);
      node.querySelector('[data-field="phone"]').textContent = "+91 " + addr.phone;
      node.querySelector('[data-action="edit-address"]').addEventListener("click", () => openAddressDialog(addr, () => { renderAddresses(); }));
      addressBox.appendChild(node);
    });
    if (!selectedAddressId && list[0]) selectedAddressId = list[0].id;
    addressBox.querySelectorAll(".address-option__input").forEach((r) => (r.checked = r.value === selectedAddressId));
    updatePlaceOrderState();
  }
  addressBox.addEventListener("change", (e) => { if (e.target.matches(".address-option__input")) { selectedAddressId = e.target.value; updatePlaceOrderState(); } });
  host.querySelector("#addAddressBtn")?.addEventListener("click", () => openAddressDialog(null, () => renderAddresses()));
  renderAddresses();

  // ---- Payment method ----
  const blocked = codBlockedItems(cartItems);
  const codOption = host.querySelector("#optionCod");
  if (blocked.length) {
    codOption.querySelector("input").disabled = true;
    host.querySelector("#codUnavailableNote").hidden = false;
    host.querySelector("#codBlockedItems").innerHTML = blocked.map((b) => `<li>${escapeHtml(b.productName)}</li>`).join("");
  }

  // Coupon discounts come from the server (it reads the secret coupon list); they are only displayed here.
  function pricedItems() {
    return cartItems.map((it) => {
      const line = coupon && coupon.lines.find((l) => l.productId === it.productId && (l.variantId || null) === (it.variantId || null));
      return { ...it, couponDiscount: line ? line.discount : 0 };
    });
  }
  function renderPricing() {
    const pricing = calculateOrderPricing(pricedItems(), paymentMethod, settings);
    host.querySelector("#checkoutSubtotal").textContent = formatMoney(pricing.subtotal);
    const discountRow = host.querySelector("#checkoutDiscountRow");
    discountRow.hidden = !(pricing.discount > 0);
    if (pricing.discount > 0) {
      host.querySelector("#checkoutDiscountLabel").textContent = `Coupon discount (${coupon.code})`;
      host.querySelector("#checkoutDiscount").textContent = "−" + formatMoney(pricing.discount);
    }
    host.querySelector("#checkoutShipping").textContent = pricing.shipping === 0 ? "Free" : formatMoney(pricing.shipping);
    host.querySelector("#checkoutCodFeeRow").hidden = paymentMethod !== "cod";
    host.querySelector("#checkoutCodFee").textContent = formatMoney(pricing.codFee);
    host.querySelector("#checkoutTotalLabel").textContent = paymentMethod === "cod" ? "Pay at delivery" : "Order total";
    host.querySelector("#checkoutTotal").textContent = formatMoney(pricing.total);

    const codBox = host.querySelector("#codBreakdown");
    codBox.hidden = paymentMethod !== "cod";
    if (paymentMethod === "cod") {
      host.querySelector("#codOrderTotal").textContent = formatMoney(round2(pricing.total - pricing.codFee));
      host.querySelector("#codFeeAmount").textContent = formatMoney(pricing.codFee);
      host.querySelector("#codPayNow").textContent = formatMoney(0);
      host.querySelector("#codPayAtDelivery").textContent = formatMoney(pricing.total);
    }
    host.querySelector("#placeOrderLabel").textContent = paymentMethod === "cod" ? "Place COD order" : `Pay ${formatMoney(pricing.total)} securely`;
    host.querySelector("#checkoutPayNote").innerHTML = paymentMethod === "cod"
      ? 'You pay nothing now. Our team reviews and approves Cash on Delivery orders before they are processed. You can cancel within 24 hours of ordering. No returns. By placing this order you agree to our <a href="#/help/terms">terms</a> and <a href="#/help/returns">cancellation policy</a>.'
      : 'You’ll be taken to PayU to pay. You can cancel within 24 hours of ordering. No returns. By placing this order you agree to our <a href="#/help/terms">terms</a> and <a href="#/help/returns">cancellation policy</a>.';
    return pricing;
  }
  host.querySelectorAll('input[name="paymentMethod"]').forEach((r) => r.addEventListener("change", (e) => { paymentMethod = e.target.value; renderPricing(); updatePlaceOrderState(); }));

  // ---- Coupon ----
  const couponInput = host.querySelector("#couponCode"), couponMsg = host.querySelector("#couponMessage");
  const applyBtn = host.querySelector("#applyCouponBtn");
  function setCouponMessage(text, tone) { couponMsg.textContent = text || ""; if (tone) couponMsg.dataset.tone = tone; else delete couponMsg.dataset.tone; }
  function showCouponState() {
    host.querySelector("#couponInputRow").hidden = !!coupon;
    host.querySelector("#couponApplied").hidden = !coupon;
    if (coupon) host.querySelector("#couponAppliedText").textContent = `${coupon.code} applied`;
  }
  async function applyCoupon() {
    const code = couponInput.value.trim().toUpperCase();
    if (!code) { setCouponMessage("Enter a coupon code first.", "error"); return; }
    applyBtn.disabled = true; setCouponMessage("Checking…");
    try {
      const res = await Api.post("/api", { action: "coupon-check", couponCode: code, paymentMethod, items: checkoutLines(cartItems) });
      coupon = { code: res.code, lines: res.lines };
      couponInput.value = "";
      setCouponMessage(`You save ${formatMoney(res.pricing.discount)} on this order.`, "success");
    } catch (err) { coupon = null; setCouponMessage(err.message || "That coupon couldn't be applied.", "error"); }
    applyBtn.disabled = false; showCouponState(); renderPricing();
  }
  applyBtn.addEventListener("click", applyCoupon);
  couponInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); applyCoupon(); } });
  host.querySelector("#removeCouponBtn").addEventListener("click", () => { coupon = null; setCouponMessage(""); showCouponState(); renderPricing(); });
  showCouponState();

  function updatePlaceOrderState() {
    const btn = host.querySelector("#placeOrderBtn");
    btn.disabled = !selectedAddressId || (paymentMethod === "cod" && blocked.length > 0);
  }
  renderPricing();
  updatePlaceOrderState();

  host.querySelector("#checkoutForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const errorEl = host.querySelector("#checkoutError");
    errorEl.hidden = true;
    const address = DB.getAddressById(selectedAddressId);
    if (!address) { errorEl.textContent = "Please choose a delivery address."; errorEl.hidden = false; return; }
    placeOrder({ address, items: cartItems, paymentMethod, isBuyNow: !!buyNow, couponCode: coupon ? coupon.code : "" });
  });
};

// What the server needs to know about each line: only ids, quantity and the customer's design. Never prices.
function checkoutLines(items) {
  return items.map((it) => ({ productId: it.productId, variantId: it.variantId || null, quantity: it.quantity, ...(it.custom ? { custom: { id: it.custom.id, front: it.custom.front, back: it.custom.back } } : {}) }));
}

function buyNowToItems(buyNow) {
  return buyNow.map((b) => {
    const p = DB.getProductById(b.productId);
    if (!p) return null;
    const variant = b.variantId ? p.variants.find((v) => v.variantId === b.variantId) : null;
    const extra = Cart.customExtra(p, b.custom);
    return {
      productId: p.id, variantId: b.variantId || null, product: p, variant, quantity: b.quantity,
      custom: b.custom || null, customId: (b.custom && b.custom.id) || null,
      unitPrice: (variant ? variant.price : p.price) + extra, mrp: (variant ? variant.mrp : p.mrp) + extra,
      discountPercent: variant ? variant.discountPercent ?? p.discountPercent : p.discountPercent,
      codAvailable: p.codAvailable && !b.custom, codHandlingFee: p.codHandlingFee,
      freeShipping: p.freeShipping, shippingCharge: p.shippingCharge,
      stock: variant ? variant.stock : p.stock, productName: p.name, image: (b.custom && b.custom.mockupFront) || firstImage(p),
    };
  }).filter(Boolean);
}

function formatAddress(a) {
  return [a.houseFlat, a.road, a.villageTown, a.area, a.city, a.district, a.state, a.pin].filter(Boolean).join(", ");
}

let placingOrder = false;
async function placeOrder({ address, items, paymentMethod, isBuyNow, couponCode }) {
  if (placingOrder) return;
  const overlay = $("#paymentOverlay"), errorEl = $("#checkoutError");
  const isCod = paymentMethod === "cod";
  $("#paymentOverlayTitle").textContent = isCod ? "Placing your order" : "Taking you to PayU";
  placingOrder = true; overlay.hidden = false; errorEl.hidden = true;
  try {
    // The server re-reads every price, stock level, coupon and COD rule from Firestore, creates the order and (online) signs the PayU request.
    const res = await Api.post("/api", {
      action: "payu-create", clientId: PAYU_KEY, paymentMethod, addressId: address.id, isBuyNow: !!isBuyNow, couponCode: couponCode || "",
      items: checkoutLines(items),
    });
    if (isBuyNow) Cart.clearBuyNow();
    if (res.direct) {
      // Cash on Delivery: the order already exists (waiting for admin approval). Wait a moment for it to reach this device, then show it.
      const t0 = Date.now();
      while (!DB.getOrderById(res.orderId) && Date.now() - t0 < 6000) await new Promise((r) => setTimeout(r, 150));
      placingOrder = false; overlay.hidden = true;
      goTo(buildHash("/order-details", { id: res.orderId, placed: "1" }));
      return;
    }
    const form = $("#payuRedirectForm");
    form.action = res.action; form.method = "post"; form.innerHTML = "";
    Object.entries(res.fields).forEach(([name, value]) => {
      const input = document.createElement("input");
      input.type = "hidden"; input.name = name; input.value = value;
      form.appendChild(input);
    });
    form.submit(); // leaves for PayU; the overlay stays up until the page unloads
  } catch (err) {
    placingOrder = false; overlay.hidden = true;
    errorEl.textContent = err.message || "We couldn't place the order. Please try again.";
    errorEl.hidden = false;
    errorEl.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

/* ---- Address dialog (shared: checkout + My addresses) ---- */
function openAddressDialog(address, onSaved) {
  const dlg = $("#addressDialog");
  if (!dlg) return;
  const form = $("#addressForm", dlg);
  form.reset();
  $("#addressFormError", dlg).hidden = true;
  $("#addressDialogTitle", dlg).textContent = address ? "Edit address" : "Add new address";
  $("#addressId", dlg).value = address?.id || "";
  if (address) {
    ["fullName", "phone", "houseFlat", "road", "villageTown", "area", "city", "district", "state", "pin", "landmark"].forEach((f) => {
      const el = form.elements[f]; if (el) el.value = address[f] || "";
    });
    form.elements["addressType"].value = address.addressType || "home";
    form.elements["isDefault"].checked = !!address.isDefault;
  }
  form.onsubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const phone = String(fd.get("phone") || "").trim(), pin = String(fd.get("pin") || "").trim();
    if (!/^[6-9]\d{9}$/.test(phone)) return showAddrError("Enter a valid 10-digit mobile number.");
    if (!/^[1-9]\d{5}$/.test(pin)) return showAddrError("Enter a valid 6-digit PIN code.");
    const user = Auth.currentUser();
    const saved = DB.saveAddress({
      id: fd.get("addressId") || undefined, userId: user.uid,
      fullName: fd.get("fullName").trim(), phone, houseFlat: fd.get("houseFlat").trim(),
      road: fd.get("road").trim(), villageTown: fd.get("villageTown").trim(), area: fd.get("area").trim(),
      city: fd.get("city").trim(), district: fd.get("district").trim(), state: fd.get("state"),
      pin, landmark: fd.get("landmark").trim(), addressType: fd.get("addressType"), isDefault: fd.get("isDefault") === "on",
    });
    closeDialog(dlg);
    toast("Address saved", "success");
    onSaved?.(saved);
  };
  function showAddrError(msg) { const el = $("#addressFormError", dlg); el.textContent = msg; el.hidden = false; }
  openDialog(dlg);
}

/* ---- Login / Register ---- */
function setBusy(btn, busy) { if (btn) btn.disabled = busy; }

PageControllers.login = function (host, params) {
  const nextRoute = params.get("next");
  const errorEl = host.querySelector("#authError");
  function afterAuth() { goTo(nextRoute ? "#" + nextRoute : buildHash("/")); }
  host.querySelector("#loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = host.querySelector("#loginSubmit");
    setBusy(btn, true); errorEl.hidden = true;
    try {
      await Auth.signIn(host.querySelector("#loginEmail").value.trim(), host.querySelector("#loginPassword").value);
      toast("Welcome back!", "success");
      afterAuth();
    } catch (err) { errorEl.textContent = err.message; errorEl.hidden = false; }
    finally { setBusy(btn, false); }
  });
  host.querySelector("#googleSignInBtn").addEventListener("click", async () => {
    errorEl.hidden = true;
    try { await Auth.signInWithGoogle(); toast("Signed in with Google", "success"); afterAuth(); }
    catch (err) { errorEl.textContent = err.message; errorEl.hidden = false; }
  });
  host.querySelector("#forgotPasswordBtn")?.addEventListener("click", () => {
    const typed = host.querySelector("#loginEmail").value.trim();
    if (typed) host.querySelector("#resetEmail").value = typed;
    openDialog(host.querySelector("#resetDialog"));
  });
  host.querySelector("#resetForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const resetErr = host.querySelector("#resetError"), btn = host.querySelector("#resetSubmit");
    setBusy(btn, true); resetErr.hidden = true;
    try {
      await Auth.sendPasswordReset(host.querySelector("#resetEmail").value.trim());
      closeDialog(host.querySelector("#resetDialog"));
      toast("If an account exists for that email, a reset link is on its way.", "success", 5000);
    } catch (err) { resetErr.textContent = err.message; resetErr.hidden = false; }
    finally { setBusy(btn, false); }
  });
};

PageControllers.register = function (host) {
  const errorEl = host.querySelector("#authError");
  host.querySelector("#registerForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const password = host.querySelector("#regPassword").value, confirmPw = host.querySelector("#regConfirm").value;
    if (password !== confirmPw) { errorEl.textContent = "Passwords don't match."; errorEl.hidden = false; return; }
    const btn = host.querySelector("#registerSubmit");
    setBusy(btn, true); errorEl.hidden = true;
    try {
      await Auth.signUp({
        fullName: host.querySelector("#regName").value.trim(), email: host.querySelector("#regEmail").value.trim(),
        phone: host.querySelector("#regPhone").value.trim(), password,
      });
      toast("Account created!", "success");
      goTo(buildHash("/"));
    } catch (err) { errorEl.textContent = err.message; errorEl.hidden = false; }
    finally { setBusy(btn, false); }
  });
  host.querySelector("#googleSignInBtn").addEventListener("click", async () => {
    errorEl.hidden = true;
    try { await Auth.signInWithGoogle(); toast("Signed in with Google", "success"); goTo(buildHash("/")); }
    catch (err) { errorEl.textContent = err.message; errorEl.hidden = false; }
  });
};

/* ---- Profile ---- */
PageControllers.profile = function (host) {
  const user = Auth.currentUser();
  host.querySelector("#profileHeadName").textContent = user.fullName;
  host.querySelector("#profileHeadEmail").textContent = user.email;
  host.querySelector("#profileInitials").textContent = (user.fullName || "?").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
  host.querySelector("#profileName").value = user.fullName;
  host.querySelector("#profileEmail").value = user.email;
  host.querySelector("#profilePhone").value = user.phone || "";
  host.querySelector("#passwordProviderNote").hidden = user.provider === "password";
  host.querySelector("#passwordForm").hidden = user.provider !== "password";

  host.querySelectorAll("[data-panel-link]").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const key = link.dataset.panelLink;
      host.querySelectorAll("[data-panel]").forEach((p) => (p.hidden = p.dataset.panel !== key));
      host.querySelectorAll("[data-panel-link]").forEach((l) => l.removeAttribute("aria-current"));
      link.setAttribute("aria-current", "page");
      if (key === "recent") renderRecent();
      if (key === "notifications") renderNotifications();
    });
  });

  function renderRecent() {
    const products = RecentlyViewed.getProducts();
    renderProductGrid(host.querySelector("#recentGrid"), products);
    host.querySelector("#recentEmpty").hidden = products.length !== 0;
  }
  host.querySelector("#clearRecentBtn")?.addEventListener("click", () => { RecentlyViewed.clear(); renderRecent(); });

  function renderNotifications() {
    const orders = DB.getOrders({ userId: user.uid }).slice(0, 6);
    const list = host.querySelector("#notificationList"); list.innerHTML = "";
    const tpl = document.getElementById("tpl-notification");
    orders.forEach((o) => {
      const node = tpl.content.cloneNode(true);
      node.querySelector('[data-field="title"]').textContent = `Order ${o.orderId}`;
      node.querySelector('[data-field="text"]').textContent = customerStatusLabel(o.orderStatus);
      node.querySelector('[data-field="time"]').textContent = formatDateTime(o.updatedAt);
      list.appendChild(node);
    });
    host.querySelector("#notificationsEmpty").hidden = orders.length !== 0;
  }
  host.querySelector("#markAllReadBtn")?.addEventListener("click", () => toast("All caught up"));

  const avatarImg = host.querySelector("#profileAvatar"), initialsEl = host.querySelector("#profileInitials");
  function showAvatar(url) { if (!url) return; avatarImg.src = url; avatarImg.hidden = false; initialsEl.hidden = true; }
  showAvatar(user.photoURL);
  host.querySelector("#changePhotoBtn")?.addEventListener("click", () => host.querySelector("#avatarInput").click());
  host.querySelector("#avatarInput")?.addEventListener("change", async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try { const url = await uploadImage(file, "avatars/" + user.uid, 240); DB.updateUser(user.uid, { photoURL: url }); showAvatar(url); toast("Photo updated", "success"); }
    catch (err) { toast(err.message || "Couldn't upload the photo.", "error"); }
  });

  host.querySelector("#profileForm").addEventListener("submit", (e) => {
    e.preventDefault();
    DB.updateUser(user.uid, { fullName: host.querySelector("#profileName").value.trim(), phone: host.querySelector("#profilePhone").value.trim() });
    toast("Profile updated", "success");
    updateAccountMenu();
  });
  host.querySelector("#passwordForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const errorEl = host.querySelector("#passwordError");
    const newPw = host.querySelector("#newPassword").value, confirmPw = host.querySelector("#confirmNewPassword").value;
    if (newPw !== confirmPw) { errorEl.textContent = "New passwords don't match."; errorEl.hidden = false; return; }
    try { await Auth.changePassword(host.querySelector("#currentPassword").value, newPw); errorEl.hidden = true; e.target.reset(); toast("Password changed", "success"); }
    catch (err) { errorEl.textContent = err.message; errorEl.hidden = false; }
  });
};

const STATUS_WORDS = {
  cod_pending: "Pay on delivery", cod_advance_paid: "COD advance paid (old order)",
  pending_admin_approval: "Pending approval", pending_admin_confirmation: "Pending confirmation (old)",
  submitted_to_qikink: "Sent to Qikink", submit_failed: "Qikink failed", submitting: "Sending…", not_sent: "Not sent",
};
// Customers never see the fulfilment partner's name or its internal errors.
const CUSTOMER_STATUS_WORDS = { submitted_to_qikink: "In production", submit_failed: "Confirmed", pending_admin_confirmation: "Pending confirmation", cod_advance_paid: "COD advance paid" };
function customerStatusLabel(status) { return CUSTOMER_STATUS_WORDS[status] || statusLabel(status); }
function statusLabel(status) { return STATUS_WORDS[status] || status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()); }

/* ---- Addresses ---- */
PageControllers.addresses = function (host) {
  const user = Auth.currentUser();
  function render() {
    const list = DB.getAddresses(user.uid);
    const grid = host.querySelector("#addressList"); grid.innerHTML = "";
    host.querySelector("#addressEmpty").hidden = list.length !== 0;
    const tpl = document.getElementById("tpl-address-card");
    list.forEach((addr) => {
      const node = tpl.content.cloneNode(true);
      const root = node.querySelector("[data-address-card]"); root.dataset.id = addr.id;
      node.querySelector('[data-field="name"]').textContent = addr.fullName;
      node.querySelector('[data-field="type"]').textContent = addr.addressType[0].toUpperCase() + addr.addressType.slice(1);
      node.querySelector('[data-field="default"]').hidden = !addr.isDefault;
      node.querySelector('[data-field="address"]').textContent = formatAddress(addr);
      node.querySelector('[data-field="phone"]').textContent = "+91 " + addr.phone;
      node.querySelector('[data-action="edit-address"]').addEventListener("click", () => openAddressDialog(addr, render));
      node.querySelector('[data-action="set-default"]').addEventListener("click", () => { DB.saveAddress({ ...addr, isDefault: true }); render(); });
      node.querySelector('[data-action="delete-address"]').addEventListener("click", () => { if (confirm("Delete this address?")) { DB.deleteAddress(addr.id); render(); } });
      grid.appendChild(node);
    });
  }
  host.querySelector("#addAddressBtn")?.addEventListener("click", () => openAddressDialog(null, render));
  host.querySelector("#addFirstAddressBtn")?.addEventListener("click", () => openAddressDialog(null, render));
  render();
};

/* ---- Wishlist ---- */
PageControllers.wishlist = function (host) {
  function render() {
    const products = Wishlist.getProducts();
    const grid = host.querySelector("#wishlistGrid"); grid.innerHTML = "";
    host.querySelector("#wishlistEmpty").hidden = products.length !== 0;
    host.querySelector("#wishlistCountText").hidden = products.length === 0;
    if (products.length) host.querySelector("#wishlistCountText").textContent = `${products.length} item${products.length === 1 ? "" : "s"} saved`;
    const tpl = document.getElementById("tpl-wishlist-item");
    products.forEach((p) => {
      const node = tpl.content.cloneNode(true);
      const root = node.querySelector("[data-wishlist-card]"); root.dataset.id = p.id;
      const href = buildHash("/product", { id: p.id });
      node.querySelector('[data-field="imageLink"]').href = href;
      if (firstImage(p)) node.querySelector('[data-field="image"]').src = firstImage(p);
      node.querySelector('[data-field="brand"]').textContent = p.brand;
      const titleLink = node.querySelector('[data-field="titleLink"]'); titleLink.textContent = p.name; titleLink.href = href;
      const price = DB.effectivePrice(p);
      node.querySelector('[data-field="price"]').textContent = formatMoney(price);
      const mrp = p.hasVariants ? p.variants[0]?.mrp : p.mrp;
      if (mrp > price) { node.querySelector('[data-field="mrp"]').hidden = false; node.querySelector('[data-field="mrp"]').textContent = formatMoney(mrp); node.querySelector('[data-field="discountText"]').hidden = false; node.querySelector('[data-field="discountText"]').textContent = p.discountPercent + "% off"; }
      const stock = DB.totalStock(p);
      node.querySelector('[data-field="stockText"]').textContent = stock === 0 ? "Out of stock" : "In stock";
      grid.appendChild(node);
    });
  }
  render();
  document.addEventListener("wishlist:change", render);
  return () => document.removeEventListener("wishlist:change", render);
};

/* ---- Orders list ---- */
PageControllers.orders = function (host) {
  const user = Auth.currentUser();
  let filter = "all", page = 1;
  const PAGE_SIZE = 6;
  function matches(o) {
    if (filter === "active") return !["delivered", "cancelled", "rejected", "returned"].includes(o.orderStatus);
    if (filter === "delivered") return o.orderStatus === "delivered";
    if (filter === "closed") return ["cancelled", "rejected", "returned"].includes(o.orderStatus);
    return true;
  }
  function render() {
    const all = DB.getOrders({ userId: user.uid }).filter(matches);
    const list = host.querySelector("#orderList"); list.innerHTML = ""; list.removeAttribute("aria-busy");
    const visible = all.slice(0, page * PAGE_SIZE);
    const tpl = document.getElementById("tpl-order-card"), thumbTpl = document.getElementById("tpl-order-thumb");
    visible.forEach((o) => {
      const node = tpl.content.cloneNode(true);
      node.querySelector('[data-field="orderId"]').textContent = o.orderId;
      node.querySelector('[data-field="date"]').textContent = formatDate(o.createdAt);
      const statusEl = node.querySelector('[data-field="status"]'); statusEl.textContent = customerStatusLabel(o.orderStatus); statusEl.dataset.status = o.orderStatus;
      const itemsWrap = node.querySelector('[data-field="items"]');
      o.items.forEach((it) => { const t = thumbTpl.content.cloneNode(true); if (it.image) t.querySelector("img").src = it.image; t.querySelector('[data-field="name"]').textContent = it.productName; itemsWrap.appendChild(t); });
      node.querySelector('[data-field="total"]').textContent = formatMoney(orderTotalOf(o));
      node.querySelector('[data-field="payment"]').textContent = o.payment.method === "cod" ? "Cash on Delivery" : "Paid online";
      const link = buildHash("/order-details", { id: o.orderId });
      node.querySelector('[data-field="detailsLink"]').href = link;
      node.querySelector('[data-field="trackLink"]').href = link + "&track=1";
      list.appendChild(node);
    });
    host.querySelector("#ordersEmpty").hidden = all.length !== 0;
    if (all.length === 0) {
      host.querySelector("#ordersEmptyTitle").textContent = filter === "all" ? "You haven't placed any orders yet" : "Nothing here";
      host.querySelector("#ordersEmptyText").textContent = filter === "all" ? "When you do, you'll be able to track them here." : "Try a different filter.";
    }
    host.querySelector("#loadMoreOrders").hidden = visible.length >= all.length;
  }
  host.querySelector("#orderFilters").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-filter]"); if (!btn) return;
    host.querySelectorAll("[data-filter]").forEach((b) => { b.setAttribute("aria-selected", "false"); b.tabIndex = -1; });
    btn.setAttribute("aria-selected", "true"); btn.tabIndex = 0;
    filter = btn.dataset.filter; page = 1; render();
  });
  host.querySelector("#loadMoreOrders").addEventListener("click", () => { page += 1; render(); });
  host.querySelector("#retryOrders")?.addEventListener("click", render);
  render();
};

/* ---- Order details (customer) ---- */
const ORDER_STEPS = ["placed", "payment", "confirmed", "packed", "shipped", "out_for_delivery", "delivered"];
const STATUS_TO_STEP = { pending_admin_approval: "placed", pending_admin_confirmation: "payment", confirmed: "confirmed", submit_failed: "confirmed", submitted_to_qikink: "confirmed", processing: "confirmed", packed: "packed", shipped: "shipped", out_for_delivery: "out_for_delivery", delivered: "delivered" };

PageControllers.orderDetails = function (host, params) {
  const id = params.get("id");
  const order = id && DB.getOrderById(id);
  const notFound = host.querySelector("#orderNotFound"), view = host.querySelector("#orderView");
  if (!order) { notFound.hidden = false; view.hidden = true; return; }
  notFound.hidden = true; view.hidden = false;
  const due = orderDueAtDelivery(order);

  if (params.get("placed") === "1") {
    if (!order.isBuyNow) Cart.clear();
    const banner = host.querySelector("#orderPlacedBanner"); banner.hidden = false;
    if (order.payment.method === "cod") {
      host.querySelector("#orderPlacedTitle").textContent = "Order placed. Thank you!";
      host.querySelector("#orderPlacedText").textContent = `Pay ${formatMoney(due)} in cash when your order is delivered. Our team will review and approve it shortly.`;
    }
  }
  host.querySelector("#orderApprovalNotice").hidden = !["pending_admin_approval", "pending_admin_confirmation"].includes(order.orderStatus) || order.payment.method !== "cod";
  host.querySelector("#orderIdText").textContent = order.orderId;
  host.querySelector("#orderDate").textContent = formatDate(order.placedAt || order.createdAt);
  const badge = host.querySelector("#orderStatusBadge"); badge.textContent = customerStatusLabel(order.orderStatus); badge.dataset.status = order.orderStatus;

  if (["cancelled", "rejected", "returned"].includes(order.orderStatus)) {
    host.querySelector("#orderExceptionNotice").hidden = false;
    host.querySelector("#orderExceptionTitle").textContent = "Order " + statusLabel(order.orderStatus).toLowerCase();
    const lastNote = order.statusHistory[order.statusHistory.length - 1]?.note;
    host.querySelector("#orderExceptionText").textContent = lastNote || "Contact support if you have questions about this order.";
  }

  // ---- 24-hour cancel: the card exists only while the window is open (the server checks it again) ----
  let teardown = null;
  const cancelCard = host.querySelector("#cancelCard");
  if (canCustomerCancel(order)) {
    const deadline = cancelDeadlineOf(order);
    cancelCard.hidden = false;
    host.querySelector("#cancelDeadline").textContent = formatDateTime(deadline);
    host.querySelector("#cancelDeadline").setAttribute("datetime", new Date(deadline).toISOString());
    const countdown = host.querySelector("#cancelCountdown");
    const tick = () => {
      const left = deadline - Date.now();
      if (left <= 0) { cancelCard.hidden = true; clearInterval(timer); return; }
      const h = Math.floor(left / 3600000), m = Math.floor((left % 3600000) / 60000);
      countdown.textContent = `Time left to cancel: ${h}h ${String(m).padStart(2, "0")}m`;
    };
    const timer = setInterval(tick, 30000); tick();
    teardown = () => clearInterval(timer);

    const dlg = $("#cancelOrderDialog");
    host.querySelector("#cancelOrderBtn").addEventListener("click", () => { $("#cancelFormError", dlg).hidden = true; $("#cancelReason", dlg).value = ""; openDialog(dlg); });
    $("#cancelOrderForm", dlg).onsubmit = async (e) => {
      e.preventDefault();
      const btn = $("#cancelOrderConfirmBtn", dlg), errEl = $("#cancelFormError", dlg);
      btn.disabled = true; errEl.hidden = true;
      try {
        await Api.post("/api", { action: "cancel-order", orderId: order.orderId, reason: $("#cancelReason", dlg).value });
        closeDialog(dlg); toast("Your order has been cancelled", "success");
        // Wait for the cancelled status to reach this device, then redraw the page.
        const t0 = Date.now();
        while (DB.getOrderById(order.orderId)?.orderStatus !== "cancelled" && Date.now() - t0 < 5000) await new Promise((r) => setTimeout(r, 150));
        navigate();
      } catch (err) { errEl.textContent = err.message || "We couldn't cancel this order."; errEl.hidden = false; }
      btn.disabled = false;
    };
  }

  renderTimeline(host, order);
  host.querySelector("#fulfilmentStatus").textContent = customerStatusLabel(order.orderStatus);
  if (order.courier?.trackingNumber || order.courier?.name) {
    host.querySelector("#courierName").textContent = order.courier.name || "—";
    host.querySelector("#trackingNumber").textContent = order.courier.trackingNumber || "—";
    host.querySelector("#shipmentDate").textContent = formatDate(order.courier.shipmentDate);
    host.querySelector("#estimatedDelivery").textContent = formatDate(order.courier.estimatedDelivery);
    if (order.courier.trackingUrl) { const link = host.querySelector("#trackShipmentLink"); link.hidden = false; link.href = order.courier.trackingUrl; }
    if (order.courier.trackingNumber) { const copy = host.querySelector("#copyTrackingBtn"); copy.hidden = false; copy.addEventListener("click", () => { navigator.clipboard.writeText(order.courier.trackingNumber); toast("Tracking number copied"); }); }
  }

  const itemsList = host.querySelector("#orderItems"); itemsList.innerHTML = "";
  const tpl = document.getElementById("tpl-order-item");
  order.items.forEach((it) => {
    const node = tpl.content.cloneNode(true);
    if (it.image) node.querySelector('[data-field="image"]').src = it.image;
    node.querySelector('[data-field="brand"]').textContent = it.brand;
    const titleLink = node.querySelector('[data-field="titleLink"]'); titleLink.textContent = it.productName; titleLink.href = buildHash("/product", { id: it.productId });
    node.querySelector('[data-field="variant"]').textContent = it.variant;
    if (it.custom) node.querySelector('[data-field="variant"]').insertAdjacentHTML("afterend", customSummaryHtml(it.custom));
    node.querySelector('[data-field="qty"]').textContent = `Qty: ${it.quantity}`;
    node.querySelector('[data-field="price"]').textContent = formatMoney(it.unitPrice);
    if (it.mrp > it.unitPrice) { node.querySelector('[data-field="mrp"]').hidden = false; node.querySelector('[data-field="mrp"]').textContent = formatMoney(it.mrp); }
    node.querySelector('[data-field="lineTotal"]').textContent = formatMoney(it.itemTotal);
    if (order.orderStatus === "delivered") {
      const user = Auth.currentUser();
      if (user && !DB.hasReviewed(user.uid, it.productId, order.orderId)) {
        const link = node.querySelector('[data-field="reviewLink"]'); link.hidden = false;
        link.addEventListener("click", (e) => { e.preventDefault(); const p = DB.getProductById(it.productId); openReviewDialog(host, p, order, () => { link.hidden = true; }); });
      }
    }
    itemsList.appendChild(node);
  });

  host.querySelector("#shippingAddress").innerHTML = addressHtml(order.shippingAddressSnapshot);
  host.querySelector("#paymentMethodText").textContent = order.payment.method === "cod" ? "Cash on Delivery" : "Pay online (PayU)";
  host.querySelector("#paymentStatusText").textContent = statusLabel(order.payment.status);
  host.querySelector("#paidAmount").textContent = formatMoney(order.payment.paidAmount);
  if (order.payment.method === "cod" && !["cancelled", "rejected"].includes(order.orderStatus)) {
    host.querySelector("#codRemainingRow").hidden = false; host.querySelector("#orderCodRemaining").textContent = formatMoney(due);
  }
  if (order.payment.transactionId) { host.querySelector("#transactionRow").hidden = false; host.querySelector("#transactionId").textContent = order.payment.transactionId; }
  host.querySelector("#orderSubtotal").textContent = formatMoney(order.pricing.subtotal);
  const discountRow = host.querySelector("#orderDiscountRow");
  discountRow.hidden = !(order.pricing.discount > 0);
  host.querySelector("#orderDiscountLabel").textContent = order.pricing.couponCode ? `Coupon discount (${order.pricing.couponCode})` : "Discount";
  host.querySelector("#orderDiscount").textContent = "−" + formatMoney(order.pricing.discount);
  host.querySelector("#orderShipping").textContent = order.pricing.shipping === 0 ? "Free" : formatMoney(order.pricing.shipping);
  host.querySelector("#orderCodFeeRow").hidden = !(order.pricing.codFee > 0);
  host.querySelector("#orderCodFee").textContent = formatMoney(order.pricing.codFee || 0);
  host.querySelector("#orderTotal").textContent = formatMoney(orderTotalOf(order));

  host.querySelector("#viewInvoiceBtn").addEventListener("click", () => openInvoice(order));
  return teardown;
};

function renderTimeline(host, order) {
  const currentStep = STATUS_TO_STEP[order.orderStatus] || "payment";
  const currentIdx = ORDER_STEPS.indexOf(currentStep);
  const isException = ["cancelled", "rejected", "returned"].includes(order.orderStatus);
  ORDER_STEPS.forEach((step, i) => {
    const el = host.querySelector(`.timeline__step[data-step="${step}"]`);
    if (!el) return;
    el.dataset.state = isException ? (i <= 1 ? "done" : "pending") : i < currentIdx ? "done" : i === currentIdx ? "current" : "pending";
    const entry = order.statusHistory.find((h) => STATUS_TO_STEP[h.status] === step || (step === "placed" && true));
    const timeEl = el.querySelector('[data-field="time"]');
    if (entry && (i <= currentIdx || step === "placed")) { timeEl.hidden = false; timeEl.textContent = formatDateTime(step === "placed" ? order.createdAt : entry.at); }
  });
}

function addressHtml(a) {
  return `${escapeHtml(a.fullName)}<br>${escapeHtml([a.houseFlat, a.road, a.villageTown, a.area].filter(Boolean).join(", "))}<br>`
    + `${escapeHtml([a.city, a.district, a.state].filter(Boolean).join(", "))} – ${escapeHtml(a.pin)}<br>Phone: +91 ${escapeHtml(a.phone)}`;
}

function openInvoice(order) {
  const dlg = $("#invoiceDialog");
  const settings = DB.getSettings();
  $("#invStoreAddress", dlg).textContent = settings.storeAddress || "";
  if (settings.taxEnabled && settings.gstin) { $("#invGstin", dlg).hidden = false; $("#invGstinValue", dlg).textContent = settings.gstin; }
  $("#invOrderId", dlg).textContent = order.orderId;
  $("#invOrderDate", dlg).textContent = formatDate(order.createdAt);
  $("#invCustomerName", dlg).textContent = order.shippingAddressSnapshot.fullName;
  $("#invCustomerPhone", dlg).textContent = "+91 " + order.shippingAddressSnapshot.phone;
  $("#invCustomerEmail", dlg).textContent = order.customerEmail || "";
  $("#invShippingAddress", dlg).innerHTML = addressHtml(order.shippingAddressSnapshot);
  const body = $("#invItems", dlg); body.innerHTML = "";
  const rowTpl = document.getElementById("tpl-invoice-row");
  order.items.forEach((it) => {
    const node = rowTpl.content.cloneNode(true);
    node.querySelector('[data-field="name"]').textContent = it.productName;
    node.querySelector('[data-field="variant"]').textContent = it.variant || "—";
    node.querySelector('[data-field="qty"]').textContent = it.quantity;
    node.querySelector('[data-field="price"]').textContent = formatMoney(it.unitPrice);
    node.querySelector('[data-field="discount"]').textContent = formatMoney(it.discount);
    node.querySelector('[data-field="total"]').textContent = formatMoney(it.itemTotal);
    body.appendChild(node);
  });
  $("#invSubtotal", dlg).textContent = formatMoney(order.pricing.subtotal);
  $("#invDiscountRow", dlg).hidden = !(order.pricing.discount > 0);
  $("#invDiscount", dlg).textContent = "−" + formatMoney(order.pricing.discount);
  $("#invShipping", dlg).textContent = order.pricing.shipping === 0 ? "Free" : formatMoney(order.pricing.shipping);
  $("#invCodFeeRow", dlg).hidden = !(order.pricing.codFee > 0);
  $("#invCodFee", dlg).textContent = formatMoney(order.pricing.codFee || 0);
  $("#invTotal", dlg).textContent = formatMoney(orderTotalOf(order));
  $("#invPaymentMethod", dlg).textContent = order.payment.method === "cod" ? "Cash on Delivery" : "Online";
  $("#invPaid", dlg).textContent = formatMoney(order.payment.paidAmount);
  $("#invCodRow", dlg).hidden = order.payment.method !== "cod";
  if (order.payment.method === "cod") $("#invCodRemaining", dlg).textContent = formatMoney(orderDueAtDelivery(order));
  $("#printInvoiceBtn", dlg).onclick = () => window.print();
  openDialog(dlg);
}

/* ---- My reviews ---- */
PageControllers.reviews = function (host) {
  const user = Auth.currentUser();
  const tabToReview = host.querySelector("#tabToReview"), tabMine = host.querySelector("#tabMyReviews");
  const panelToReview = host.querySelector("#panelToReview"), panelMine = host.querySelector("#panelMyReviews");
  function switchTab(which) {
    const toReview = which === "toReview";
    tabToReview.setAttribute("aria-selected", String(toReview)); tabToReview.tabIndex = toReview ? 0 : -1;
    tabMine.setAttribute("aria-selected", String(!toReview)); tabMine.tabIndex = toReview ? -1 : 0;
    panelToReview.hidden = !toReview; panelMine.hidden = toReview;
  }
  tabToReview.addEventListener("click", () => switchTab("toReview"));
  tabMine.addEventListener("click", () => switchTab("mine"));

  function renderPending() {
    const orders = DB.getOrders({ userId: user.uid }).filter((o) => o.orderStatus === "delivered");
    const pending = [];
    orders.forEach((o) => o.items.forEach((it) => { if (!DB.hasReviewed(user.uid, it.productId, o.orderId)) pending.push({ order: o, item: it }); }));
    host.querySelector("#toReviewCount").hidden = pending.length === 0; host.querySelector("#toReviewCount").textContent = pending.length;
    const list = host.querySelector("#pendingReviewList"); list.innerHTML = ""; list.removeAttribute("aria-busy");
    const tpl = document.getElementById("tpl-review-todo");
    pending.forEach(({ order, item }) => {
      const node = tpl.content.cloneNode(true);
      if (item.image) node.querySelector('[data-field="image"]').src = item.image;
      node.querySelector('[data-field="title"]').textContent = item.productName;
      node.querySelector('[data-field="variant"]').textContent = item.variant || "";
      node.querySelector('[data-field="meta"]').textContent = `Delivered · Order ${order.orderId}`;
      node.querySelector('[data-action="write-review"]').addEventListener("click", () => { const p = DB.getProductById(item.productId); openReviewDialog(host, p, order, () => { renderPending(); renderMine(); }); });
      list.appendChild(node);
    });
    host.querySelector("#pendingEmpty").hidden = pending.length !== 0;
  }
  function renderMine() {
    const mine = DB.getReviewsByUser(user.uid).sort((a, b) => b.createdAt - a.createdAt);
    const list = host.querySelector("#myReviewList"); list.innerHTML = "";
    const tpl = document.getElementById("tpl-my-review");
    mine.forEach((r) => {
      const node = tpl.content.cloneNode(true);
      node.querySelector('[data-field="rating"]').textContent = r.rating.toFixed(1);
      node.querySelector('[data-field="title"]').textContent = r.title || "";
      const p = DB.getProductById(r.productId);
      const link = node.querySelector('[data-field="productLink"]'); link.textContent = p?.name || "Product"; link.href = buildHash("/product", { id: r.productId });
      node.querySelector('[data-field="text"]').textContent = r.text;
      node.querySelector('[data-field="status"]').hidden = r.visible;
      node.querySelector('[data-field="date"]').textContent = formatDate(r.createdAt);
      list.appendChild(node);
    });
    host.querySelector("#myReviewsEmpty").hidden = mine.length !== 0;
  }
  renderPending(); renderMine();
};

/* ==========================================================================
   11. ADMIN CONTROLLERS
   ========================================================================== */
PageControllers.adminDashboard = function (host) {
  const orders = DB.getOrders({});
  const allProducts = DB.getAllProducts();
  const counts = { pending_admin_approval: 0, pending_admin_confirmation: 0, submit_failed: 0, confirmed: 0, processing: 0, shipped: 0, delivered: 0, cancelled: 0 };
  orders.forEach((o) => { if (counts[o.orderStatus] != null) counts[o.orderStatus] += 1; });
  const setStat = (key, val) => { const el = host.querySelector(`[data-stat="${key}"]`); if (el) el.textContent = val; };
  setStat("totalProducts", allProducts.length);
  setStat("totalOrders", orders.length);
  setStat("pendingConfirmation", counts.pending_admin_approval + counts.pending_admin_confirmation);
  setStat("confirmed", counts.confirmed);
  setStat("processing", counts.processing);
  setStat("shipped", counts.shipped);
  setStat("delivered", counts.delivered);
  setStat("cancelled", counts.cancelled);
  setStat("totalCustomers", DB.getAllCustomers().length);
  const lowStock = lowStockList();
  setStat("lowStock", lowStock.length);


  function renderSales(days) {
    const cutoff = Date.now() - days * 86400000;
    const inRange = orders.filter((o) => o.createdAt >= cutoff && o.payment.status !== "failed");
    const collected = inRange.reduce((s, o) => s + (o.payment.paidAmount || 0), 0);
    const codRemaining = inRange.filter((o) => o.payment.method === "cod").reduce((s, o) => s + orderDueAtDelivery(o), 0);
    host.querySelector('[data-sales="collected"]').textContent = formatMoney(collected);
    host.querySelector('[data-sales="orders"]').textContent = inRange.length;
    host.querySelector('[data-sales="codRemaining"]').textContent = formatMoney(codRemaining);
    host.querySelector('[data-sales="averageOrder"]').textContent = formatMoney(inRange.length ? collected / inRange.length : 0);
  }
  renderSales(7);
  host.querySelector("#salesRange").addEventListener("change", (e) => renderSales(Number(e.target.value)));

  const pendingList = host.querySelector("#pendingOrdersList"); pendingList.innerHTML = ""; pendingList.removeAttribute("aria-busy");
  const miniOrderTpl = document.getElementById("tpl-mini-order");
  const pendingOrders = orders.filter((o) => ["pending_admin_approval", "pending_admin_confirmation"].includes(o.orderStatus)).slice(0, 5);
  pendingOrders.forEach((o) => {
    const node = miniOrderTpl.content.cloneNode(true);
    node.querySelector('[data-field="link"]').href = buildHash("/admin/order-details", { id: o.orderId });
    node.querySelector('[data-field="orderId"]').textContent = o.orderId;
    node.querySelector('[data-field="customer"]').textContent = o.shippingAddressSnapshot?.fullName || "";
    node.querySelector('[data-field="total"]').textContent = formatMoney(o.pricing.total);
    node.querySelector('[data-field="date"]').textContent = formatDate(o.createdAt);
    pendingList.appendChild(node);
  });
  host.querySelector("#pendingOrdersEmpty").hidden = pendingOrders.length !== 0;
  document.querySelector(`[data-admin-badge="pendingOrders"]`) && (document.querySelector(`[data-admin-badge="pendingOrders"]`).hidden = (counts.pending_admin_approval + counts.pending_admin_confirmation) === 0, document.querySelector(`[data-admin-badge="pendingOrders"]`).textContent = counts.pending_admin_approval + counts.pending_admin_confirmation);

  const lowStockListEl = host.querySelector("#lowStockList"); lowStockListEl.innerHTML = ""; lowStockListEl.removeAttribute("aria-busy");
  const miniStockTpl = document.getElementById("tpl-mini-stock");
  lowStock.slice(0, 5).forEach(({ product, variant, stock }) => {
    const node = miniStockTpl.content.cloneNode(true);
    node.querySelector('[data-field="link"]').href = buildHash("/admin/edit-product", { id: product.id });
    node.querySelector('[data-field="name"]').textContent = product.name + (variant ? ` — ${variant.color || ""} ${variant.size || ""}`.trim() : "");
    node.querySelector('[data-field="sku"]').textContent = variant?.sku || product.sku;
    node.querySelector('[data-field="stock"]').textContent = stock === 0 ? "Out of stock" : `${stock} left`;
    lowStockListEl.appendChild(node);
  });
  host.querySelector("#lowStockEmpty").hidden = lowStock.length !== 0;
  const lowBadge = document.querySelector(`[data-admin-badge="lowStock"]`);
  if (lowBadge) { lowBadge.hidden = lowStock.length === 0; lowBadge.textContent = lowStock.length; }
};

function lowStockList() {
  const out = [];
  DB.getProducts({}).forEach((p) => {
    if (p.hasVariants) p.variants.forEach((v) => { if (v.stock <= (p.lowStockThreshold || 5)) out.push({ product: p, variant: v, stock: v.stock }); });
    else if (p.stock <= (p.lowStockThreshold || 5)) out.push({ product: p, variant: null, stock: p.stock });
  });
  return out.sort((a, b) => a.stock - b.stock);
}

/* ---- Admin: Products list ---- */
PageControllers.adminProducts = function (host) {
  const catSelect = host.querySelector("#filterCategory");
  catSelect.innerHTML = '<option value="">All categories</option>' + DB.getCategoryTree().flatMap((c) => [c, ...c.subcategories]).map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");
  let page = 1; const PAGE_SIZE = 10;

  function allProductsRaw() { return DB.getAllProducts(); } // admin sees drafts/archived too

  function render() {
    let list = allProductsRaw();
    const q = host.querySelector("#productSearch").value.trim().toLowerCase();
    const status = host.querySelector("#filterStatus").value;
    const cat = host.querySelector("#filterCategory").value;
    if (q) list = list.filter((p) => [p.name, p.brand, p.sku, p.productCode].filter(Boolean).some((f) => f.toLowerCase().includes(q)));
    if (status) list = list.filter((p) => p.status === status);
    if (cat) list = list.filter((p) => p.categoryId === cat);
    list = list.sort((a, b) => b.updatedAt - a.updatedAt);

    const tbody = host.querySelector("#productRows"); tbody.innerHTML = ""; tbody.removeAttribute("aria-busy");
    const visible = list.slice(0, page * PAGE_SIZE);
    const tpl = document.getElementById("tpl-product-row");
    visible.forEach((p) => {
      const node = tpl.content.cloneNode(true);
      const root = node.querySelector("[data-product-row]"); root.dataset.id = p.id;
      if (firstImage(p)) node.querySelector('[data-field="image"]').src = firstImage(p);
      const editLink = buildHash("/admin/edit-product", { id: p.id });
      node.querySelector('[data-field="editLink"]').textContent = p.name; node.querySelector('[data-field="editLink"]').href = editLink;
      node.querySelector('[data-field="editIcon"]').href = editLink;
      node.querySelector('[data-field="brand"]').textContent = p.brand;
      node.querySelector('[data-field="sku"]').setAttribute("data-label", "SKU"); node.querySelector('[data-field="sku"]').textContent = p.sku || "—";
      node.querySelector('[data-field="category"]').textContent = (p.subcategoryId && DB.getCategoryById(p.subcategoryId)?.name) || DB.getCategoryById(p.categoryId)?.name || "—";
      node.querySelector('[data-field="price"]').textContent = formatMoney(p.price);
      if (p.mrp > p.price) { node.querySelector('[data-field="mrp"]').hidden = false; node.querySelector('[data-field="mrp"]').textContent = formatMoney(p.mrp); }
      node.querySelector('[data-field="stock"]').textContent = DB.totalStock(p);
      node.querySelector('[data-field="cod"]').textContent = p.codAvailable ? `Yes (COD fee ₹${p.codHandlingFee || 0} per unit)` : "No";
      const statusEl = node.querySelector('[data-field="status"]'); statusEl.textContent = statusLabel(p.status); statusEl.dataset.status = p.status;
      tbody.appendChild(node);
    });
    host.querySelector("#productsEmpty").hidden = list.length !== 0;
    host.querySelector("#loadMoreProducts").hidden = visible.length >= list.length;
  }
  host.querySelector("#productSearch").addEventListener("input", debounce(() => { page = 1; render(); }, 200));
  host.querySelector("#filterStatus").addEventListener("change", () => { page = 1; render(); });
  host.querySelector("#filterCategory").addEventListener("change", () => { page = 1; render(); });
  host.querySelector("#loadMoreProducts").addEventListener("click", () => { page += 1; render(); });

  host.querySelector("#productRows").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]"); if (!btn) return;
    const row = btn.closest("[data-product-row]"); const id = row.dataset.id;
    const product = DB.getProductById(id);
    if (btn.dataset.action === "duplicate") { const copy = { ...product, id: undefined, name: product.name + " (copy)", status: "draft" }; DB.saveProduct(copy); toast("Product duplicated", "success"); render(); }
    if (btn.dataset.action === "toggle-publish") { DB.saveProduct({ ...product, status: product.status === "published" ? "draft" : "published" }); render(); }
    if (btn.dataset.action === "archive") { DB.saveProduct({ ...product, status: "archived" }); toast("Product archived"); render(); }
    if (btn.dataset.action === "delete") { if (confirm(`Delete "${product.name}"? This can't be undone.`)) { DB.deleteProduct(id); toast("Product deleted"); render(); } }
  });
  render();
};

/* ---- Admin: Add / Edit product (shared) ---- */
// Compresses in the browser, uploads to Firebase Storage and returns the public URL.
async function resizeImage(file, maxW = 900, folder = "products") {
  try { return await uploadImage(file, folder, maxW, 0.82); }
  catch (err) { toast(err.message || "Couldn't upload the image. Try again.", "error", 5000); throw err; }
}

PageControllers.adminProductForm = function (host, params) {
  const mode = host.querySelector("#productForm").dataset.mode;
  const editId = mode === "edit" ? params.get("id") : null;
  const existing = editId ? DB.getProductById(editId) : null;
  if (mode === "edit" && !existing) { toast("Product not found", "error"); location.hash = buildHash("/admin/products"); return; }

  let images = existing ? existing.images.map((i) => ({ ...i })) : [];
  let variants = existing ? existing.variants.map((v) => ({ ...v })) : [];
  const form = host.querySelector("#productForm");

  // Category / subcategory cascade
  const catSelect = host.querySelector("#pCategory"), subSelect = host.querySelector("#pSubcategory");
  const topCats = DB.getCategoryTree();
  catSelect.innerHTML += topCats.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");
  function refreshSubcats(selectedSub) {
    const parent = topCats.find((c) => c.id === catSelect.value);
    subSelect.disabled = !parent || !parent.subcategories.length;
    subSelect.innerHTML = '<option value="">Select subcategory</option>' + (parent ? parent.subcategories.map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join("") : "");
    if (selectedSub) subSelect.value = selectedSub;
  }
  catSelect.addEventListener("change", () => refreshSubcats());
  host.querySelector("#brandSuggestions").innerHTML = DB.getAllBrands().map((b) => `<option value="${escapeHtml(b)}">`).join("");

  // ---- Pricing / discount ----
  function recalcDiscount(mrpEl, priceEl, outEl) {
    const mrp = Number(mrpEl.value) || 0, price = Number(priceEl.value) || 0;
    outEl.value = mrp > 0 && price <= mrp ? Math.round(((mrp - price) / mrp) * 100) : 0;
  }
  const pMrp = host.querySelector("#pMrp"), pPrice = host.querySelector("#pPrice"), pDiscount = host.querySelector("#pDiscount");
  [pMrp, pPrice].forEach((el) => el.addEventListener("input", () => recalcDiscount(pMrp, pPrice, pDiscount)));

  // ---- COD ----
  const codRadios = host.querySelectorAll('input[name="codAvailable"]');
  const codFeeInput = host.querySelector("#pCodFee");
  function updateCodState() {
    const on = host.querySelector('input[name="codAvailable"]:checked')?.value === "yes";
    codFeeInput.disabled = !on;
    const preview = host.querySelector("#codPreview");
    const fee = Number(codFeeInput.value) || 0;
    if (on && fee > 0) {
      preview.hidden = false;
      preview.textContent = `Example: 2 units → ${formatMoney(fee * 2)} COD fee is added to the amount the customer pays at delivery.`;
    } else preview.hidden = true;
  }
  codRadios.forEach((r) => r.addEventListener("change", updateCodState));

  // ---- Product coupon (stored in its own admin-only collection) ----
  const couponRadios = host.querySelectorAll('input[name="couponEnabled"]');
  const couponCodeInput = host.querySelector("#pCouponCode"), couponPercentInput = host.querySelector("#pCouponPercent");
  function updateCouponState() {
    const on = host.querySelector('input[name="couponEnabled"]:checked')?.value === "yes";
    couponCodeInput.disabled = !on; couponPercentInput.disabled = !on;
  }
  couponRadios.forEach((r) => r.addEventListener("change", updateCouponState));
  couponCodeInput.addEventListener("input", () => { couponCodeInput.value = couponCodeInput.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ""); });
  updateCouponState();
  codFeeInput.addEventListener("input", updateCodState);

  // ---- Variants ----
  const variantsBody = host.querySelector("#variantsBody"), variantList = host.querySelector("#variantList"), hasVariantsToggle = host.querySelector("#hasVariants");
  hasVariantsToggle.checked = existing?.hasVariants || false;
  variantsBody.hidden = !hasVariantsToggle.checked;
  hasVariantsToggle.addEventListener("change", () => { variantsBody.hidden = !hasVariantsToggle.checked; if (hasVariantsToggle.checked && !variants.length) addVariant(); });

  function addVariant(seed) {
    variants.push(seed || { variantId: genId("v"), color: "", colorHex: "", size: "", optionName: "", optionValue: "", sku: "", mrp: Number(pMrp.value) || 0, price: Number(pPrice.value) || 0, stock: 0, images: [] });
    renderVariants();
  }
  function renderVariants() {
    variantList.innerHTML = "";
    const tpl = document.getElementById("tpl-variant-row");
    variants.forEach((v, i) => {
      const node = tpl.content.cloneNode(true);
      node.querySelector('[data-field="title"]').textContent = [v.color, v.size].filter(Boolean).join(" / ") || `Variant ${i + 1}`;
      node.querySelector('[data-field="variantId"]').value = v.variantId;
      ["color", "colorHex", "size", "optionName", "optionValue", "sku", "mrp", "price", "stock"].forEach((f) => {
        const input = node.querySelector(`[data-field="${f}"]`); input.value = v[f] || "";
        input.addEventListener("input", () => {
          v[f] = ["mrp", "price", "stock"].includes(f) ? Number(input.value) || 0 : input.value;
          if (f === "mrp" || f === "price") { v.discountPercent = v.mrp > 0 ? Math.round(((v.mrp - v.price) / v.mrp) * 100) : 0; node.querySelector('[data-field="discountPercent"]') && (node.querySelector('[data-field="discountPercent"]').value = v.discountPercent); }
          if (f === "color" || f === "size") node.querySelector('[data-field="title"]') && (node.querySelector('[data-field="title"]').textContent = [v.color, v.size].filter(Boolean).join(" / ") || `Variant ${i + 1}`);
        });
      });
      node.querySelector('[data-field="discountPercent"]').value = v.discountPercent || 0;
      node.querySelector('[data-action="duplicate-variant"]').addEventListener("click", () => { addVariant({ ...v, variantId: genId("v"), sku: "" }); });
      node.querySelector('[data-action="remove-variant"]').addEventListener("click", () => { variants.splice(i, 1); renderVariants(); });
      variantList.appendChild(node);
    });
    renderVariantImageChecks();
  }
  function renderVariantImageChecks() {
    $$('[data-field="images"]', variantList).forEach((box, i) => {
      const v = variants[i]; if (!v) return;
      box.innerHTML = images.map((img, imgI) => `<label class="check"><input type="checkbox" data-img="${imgI}" ${v.images?.includes(img.url) ? "checked" : ""}><span>Image ${imgI + 1}</span></label>`).join("");
      box.querySelectorAll("input").forEach((cb) => cb.addEventListener("change", () => {
        v.images = v.images || [];
        const url = images[Number(cb.dataset.img)].url;
        if (cb.checked) v.images.push(url); else v.images = v.images.filter((u) => u !== url);
      }));
    });
  }
  if (variants.length) renderVariants();
  host.querySelector("#addVariantBtn").addEventListener("click", () => addVariant());

  // ---- Quick add: colours x sizes ----
  const genColors = [];
  const genList = host.querySelector("#genColorList");
  const photoOptions = (selected) => `<option value="">No photo</option>` + images.map((im, i) => `<option value="${escapeHtml(im.url)}"${im.url === selected ? " selected" : ""}>Photo ${i + 1}</option>`).join("");
  function renderGenColors() {
    genList.innerHTML = genColors.map((c, i) => `<li class="gen-color" data-i="${i}">
      <input class="input input--color" type="color" data-gc="hex" value="${escapeHtml(c.hex)}" aria-label="Colour swatch">
      <input class="input" type="text" data-gc="name" maxlength="40" placeholder="Colour name, e.g. Red" value="${escapeHtml(c.name)}" aria-label="Colour name">
      <select class="select gen-color__photo" data-gc="image" aria-label="Photo for this colour">${photoOptions(c.image)}</select>
      <button class="icon-btn icon-btn--danger gen-color__remove" type="button" data-gc="remove" aria-label="Remove colour"><svg class="icon icon--sm" width="20" height="20" aria-hidden="true" focusable="false"><use href="#i-x"></use></svg></button>
    </li>`).join("");
  }
  genList.addEventListener("input", (e) => {
    const row = e.target.closest("[data-i]"); if (!row) return;
    const c = genColors[Number(row.dataset.i)], f = e.target.dataset.gc;
    if (f === "hex") c.hex = e.target.value; else if (f === "name") c.name = e.target.value;
  });
  genList.addEventListener("change", (e) => { const row = e.target.closest("[data-i]"); if (row && e.target.dataset.gc === "image") genColors[Number(row.dataset.i)].image = e.target.value; });
  genList.addEventListener("pointerdown", (e) => { // photos may have been uploaded after this colour row was added
    const row = e.target.closest("[data-i]");
    if (row && e.target.dataset.gc === "image") { const c = genColors[Number(row.dataset.i)]; e.target.innerHTML = photoOptions(c.image); }
  });
  genList.addEventListener("click", (e) => { const b = e.target.closest('[data-gc="remove"]'); if (b) { genColors.splice(Number(b.closest("[data-i]").dataset.i), 1); renderGenColors(); } });
  host.querySelector("#genAddColorBtn").addEventListener("click", () => { genColors.push({ name: "", hex: "#cc3333", image: "" }); renderGenColors(); });
  if (!genColors.length) { genColors.push({ name: "", hex: "#cc3333", image: "" }); renderGenColors(); }
  host.querySelector("#genCreateBtn").addEventListener("click", () => {
    const sizes = host.querySelector("#genSizes").value.split(",").map((x) => x.trim()).filter(Boolean);
    const colors = genColors.filter((c) => c.name.trim());
    if (!colors.length && !sizes.length) { toast("Add at least one colour name or size first", "error"); return; }
    const mrp = Number(host.querySelector("#genMrp").value) || Number(pMrp.value) || 0;
    const price = Number(host.querySelector("#genPrice").value) || Number(pPrice.value) || 0;
    const stock = Number(host.querySelector("#genStock").value) || 0;
    // Turning variants on adds one empty row; drop it so only real variants remain.
    variants = variants.filter((v) => v.color || v.size || v.sku || v.optionValue || Number(v.price) > 0 || Number(v.mrp) > 0);
    let added = 0;
    (colors.length ? colors : [{ name: "", hex: "", image: "" }]).forEach((c) => {
      (sizes.length ? sizes : [""]).forEach((size) => {
        const exists = variants.some((v) => (v.color || "").toLowerCase() === c.name.trim().toLowerCase() && (v.size || "").toLowerCase() === size.toLowerCase());
        if (exists) return;
        variants.push({
          variantId: genId("v"), color: c.name.trim(), colorHex: c.name.trim() ? c.hex : "", size, optionName: "", optionValue: "",
          sku: "",   // the admin types the REAL Qikink SKU for each colour/size; a made-up one would send the wrong item to print
          mrp, price, stock, discountPercent: mrp > 0 ? Math.round(((mrp - price) / mrp) * 100) : 0, images: c.image ? [c.image] : [],
        });
        added += 1;
      });
    });
    hasVariantsToggle.checked = true; variantsBody.hidden = false;
    renderVariants();
    toast(added ? `${added} variant${added === 1 ? "" : "s"} created. Now enter the real Qikink SKU, price and stock of each below.` : "Those colour/size combinations already exist.", added ? "success" : "default", 4500);
  });

  // ---- Print on demand ----
  const POD_PRESETS = { chest: { x: 30, y: 22, w: 40, h: 40 }, large: { x: 20, y: 18, w: 60, h: 56 }, small: { x: 38, y: 24, w: 24, h: 22 }, mug: { x: 22, y: 25, w: 56, h: 45 } };
  const podEnabled = host.querySelector("#podEnabled"), podBody = host.querySelector("#podBody"), podPreset = host.querySelector("#podPreset");
  const podInputs = { x: host.querySelector("#podX"), y: host.querySelector("#podY"), w: host.querySelector("#podW"), h: host.querySelector("#podH") };
  const podAllowBack = host.querySelector("#podAllowBack"), podBackExtra = host.querySelector("#podBackExtra"), podBackImage = host.querySelector("#podBackImage");
  const podArea = () => ({ x: clamp(Number(podInputs.x.value) || 0, 0, 100), y: clamp(Number(podInputs.y.value) || 0, 0, 100), w: clamp(Number(podInputs.w.value) || 40, 5, 100), h: clamp(Number(podInputs.h.value) || 40, 5, 100) });
  const setPodArea = (a) => Object.entries(a).forEach(([k, v]) => { podInputs[k].value = v; });
  const presetFor = (a) => (Object.entries(POD_PRESETS).find(([, p]) => p.x === a.x && p.y === a.y && p.w === a.w && p.h === a.h) || ["custom"])[0];
  function updatePodPreview() {
    const main = images.find((im) => im.isMain) || images[0];
    host.querySelector("#podPreviewImg").src = main ? main.url : "";
    const a = podArea(), box = host.querySelector("#podPreviewArea");
    box.style.left = a.x + "%"; box.style.top = a.y + "%"; box.style.width = a.w + "%"; box.style.height = a.h + "%";
    const keep = podBackImage.value;
    podBackImage.innerHTML = '<option value="">Same photo as the front</option>' + images.map((im, i) => `<option value="${escapeHtml(im.url)}">Photo ${i + 1}</option>`).join("");
    podBackImage.value = images.some((im) => im.url === keep) ? keep : "";
  }
  {
    const pod0 = existing?.pod || { enabled: false, allowBack: true, backExtra: 100, area: POD_PRESETS.chest, backImage: "" };
    podEnabled.checked = !!pod0.enabled; podBody.hidden = !podEnabled.checked;
    podAllowBack.value = pod0.allowBack === false ? "no" : "yes";
    podBackExtra.value = pod0.backExtra ?? 100;
    setPodArea(pod0.area); podPreset.value = presetFor(podArea());
    podBackImage.innerHTML = '<option value="">Same photo as the front</option>' + images.map((im, i) => `<option value="${escapeHtml(im.url)}">Photo ${i + 1}</option>`).join("");
    podBackImage.value = images.some((im) => im.url === pod0.backImage) ? pod0.backImage : "";
    updatePodPreview();
  }
  podEnabled.addEventListener("change", () => { podBody.hidden = !podEnabled.checked; updatePodPreview(); });
  podPreset.addEventListener("change", () => { if (POD_PRESETS[podPreset.value]) setPodArea(POD_PRESETS[podPreset.value]); updatePodPreview(); });
  Object.values(podInputs).forEach((inp) => inp.addEventListener("input", () => { podPreset.value = presetFor(podArea()); updatePodPreview(); }));
  new MutationObserver(updatePodPreview).observe(host.querySelector("#imageList"), { childList: true, subtree: true });

  // ---- Images ----
  const imageList = host.querySelector("#imageList");
  function renderImages() {
    imageList.innerHTML = "";
    host.querySelector("#imageCount").textContent = `${images.length} of 10 images (minimum 5)`;
    const tpl = document.getElementById("tpl-image-item");
    images.forEach((img, i) => {
      const node = tpl.content.cloneNode(true);
      const li = node.querySelector("[data-image-item]");
      node.querySelector('[data-field="preview"]').src = img.url;
      const radio = node.querySelector('[data-field="main"]'); radio.checked = img.isMain; radio.name = "mainImage";
      radio.addEventListener("change", () => { images.forEach((im) => (im.isMain = false)); img.isMain = true; renderImages(); });
      const alt = node.querySelector('[data-field="alt"]'); alt.value = img.alt || ""; alt.addEventListener("input", () => (img.alt = alt.value));
      node.querySelector('[data-action="move-up"]').addEventListener("click", () => { if (i > 0) { [images[i - 1], images[i]] = [images[i], images[i - 1]]; renderImages(); } });
      node.querySelector('[data-action="move-down"]').addEventListener("click", () => { if (i < images.length - 1) { [images[i + 1], images[i]] = [images[i], images[i + 1]]; renderImages(); } });
      node.querySelector('[data-action="delete-image"]').addEventListener("click", () => { images.splice(i, 1); if (images.length && !images.some((im) => im.isMain)) images[0].isMain = true; renderImages(); renderVariantImageChecks(); });
      imageList.appendChild(li);
    });
    renderVariantImageChecks();
  }
  host.querySelector("#pImages").addEventListener("change", async (e) => {
    const files = Array.from(e.target.files).slice(0, 10 - images.length);
    for (const file of files) {
      const url = await resizeImage(file);
      images.push({ url, alt: "", isMain: images.length === 0 });
    }
    e.target.value = "";
    renderImages();
  });
  ["dragover", "dragleave", "drop"].forEach((evt) => host.querySelector("#imageDropzone").addEventListener(evt, (e) => e.preventDefault()));
  host.querySelector("#imageDropzone").addEventListener("drop", async (e) => {
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/")).slice(0, 10 - images.length);
    for (const file of files) { const url = await resizeImage(file); images.push({ url, alt: "", isMain: images.length === 0 }); }
    renderImages();
  });
  renderImages();

  // ---- Repeatable rows: highlights / specs / offers ----
  function wireRepeatable(listId, addBtnId, tplId, seedArr, fields) {
    const listEl = host.querySelector("#" + listId);
    function renderRow(item) {
      const tpl = document.getElementById(tplId);
      const node = tpl.content.cloneNode(true);
      const li = node.querySelector("li");
      fields.forEach((f) => { const input = node.querySelector(`[data-field="${f}"]`); if (input) { input.value = item[f] || ""; input.addEventListener("input", () => (item[f] = input.value)); } });
      node.querySelector('[data-action="remove-row"]').addEventListener("click", () => { const idx = seedArr.indexOf(item); if (idx > -1) seedArr.splice(idx, 1); li.remove(); });
      listEl.appendChild(node);
    }
    seedArr.forEach(renderRow);
    host.querySelector("#" + addBtnId).addEventListener("click", () => { const item = fields.length === 1 ? { [fields[0]]: "" } : { key: "", value: "" }; seedArr.push(item); renderRow(item); });
  }
  const highlights = (existing?.highlights || []).map((h) => ({ text: h }));
  const specs = (existing?.specifications || []).map((s) => ({ ...s }));
  const offers = (existing?.offers || []).map((o) => ({ text: o }));
  wireRepeatable("highlightList", "addHighlightBtn", "tpl-highlight-row", highlights, ["text"]);
  wireRepeatable("specList", "addSpecBtn", "tpl-spec-row", specs, ["key", "value"]);
  wireRepeatable("offerList", "addOfferBtn", "tpl-offer-row", offers, ["text"]);

  // ---- Slug auto-fill ----
  host.querySelector("#pName").addEventListener("blur", () => { const slugEl = host.querySelector("#pSlug"); if (!slugEl.value) slugEl.value = slugify(host.querySelector("#pName").value); });

  // ---- Populate for edit ----
  if (existing) {
    const setVal = (id, val) => { const el = host.querySelector("#" + id); if (el) el.value = val ?? ""; };
    setVal("pName", existing.name); setVal("pBrand", existing.brand); catSelect.value = existing.categoryId; refreshSubcats(existing.subcategoryId);
    setVal("pCode", existing.productCode); setVal("pSku", existing.sku); setVal("pShortDesc", existing.shortDescription); setVal("pDesc", existing.description);
    setVal("pTags", (existing.tags || []).join(", "));
    setVal("pMrp", existing.mrp); setVal("pPrice", existing.price); recalcDiscount(pMrp, pPrice, pDiscount);
    host.querySelector(`input[name="codAvailable"][value="${existing.codAvailable ? "yes" : "no"}"]`).checked = true;
    setVal("pCodFee", existing.codHandlingFee || 0); updateCodState();
    const cp = DB.getCoupon(existing.id);
    if (cp) {
      host.querySelector(`input[name="couponEnabled"][value="${cp.enabled ? "yes" : "no"}"]`).checked = true;
      setVal("pCouponCode", cp.code); setVal("pCouponPercent", cp.percent || ""); updateCouponState();
    }
    setVal("pStock", existing.stock); setVal("pLowStock", existing.lowStockThreshold); setVal("pBarcode", existing.barcode);
    setVal("pMaterial", existing.material); setVal("pDimensions", existing.dimensions); setVal("pWeight", existing.weight);
    setVal("pOrigin", existing.countryOfOrigin); setVal("pManufacturer", existing.manufacturer); setVal("pPackContents", existing.packContents);
    setVal("pWarranty", existing.warranty);
    setVal("pDeliveryMin", existing.deliveryDaysMin); setVal("pDeliveryMax", existing.deliveryDaysMax); setVal("pShipping", existing.shippingCharge);
    host.querySelector("#pFreeShipping").checked = !!existing.freeShipping;
    setVal("pSeoTitle", existing.seoTitle); setVal("pMetaDesc", existing.metaDescription); setVal("pSlug", existing.slug); setVal("pKeywords", existing.keywords);
    setVal("pStatus", existing.status);
    (existing.flags || []).forEach((f) => { const cb = host.querySelector(`input[name="flags"][value="${f}"]`); if (cb) cb.checked = true; });
    host.querySelector("#viewOnStoreLink").href = buildHash("/product", { id: existing.id });
  }

  // ---- Save / delete / archive / duplicate ----
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    if (!catSelect.value) { showFormError("Please choose a category."); return; }
    const product = {
      id: existing?.id, name: fd.get("name").trim(), brand: fd.get("brand").trim(), categoryId: catSelect.value, subcategoryId: subSelect.value || null,
      productCode: fd.get("productCode").trim(), sku: fd.get("sku").trim(), shortDescription: fd.get("shortDescription").trim(), description: fd.get("description").trim(),
      tags: fd.get("tags").split(",").map((t) => t.trim()).filter(Boolean),
      mrp: Number(fd.get("mrp")) || 0, price: Number(fd.get("price")) || 0,
      codAvailable: fd.get("codAvailable") === "yes", codHandlingFee: Math.max(0, Number(codFeeInput.value) || 0),
      stock: Number(fd.get("stock")) || 0, lowStockThreshold: Number(fd.get("lowStockThreshold")) || 5, barcode: fd.get("barcode").trim(),
      images, hasVariants: hasVariantsToggle.checked, variants: hasVariantsToggle.checked ? variants : [],
      highlights: highlights.map((h) => h.text).filter(Boolean), specifications: specs.filter((s) => s.key), offers: offers.map((o) => o.text).filter(Boolean),
      material: fd.get("material").trim(), dimensions: fd.get("dimensions").trim(), weight: fd.get("weight").trim(),
      countryOfOrigin: fd.get("countryOfOrigin").trim(), manufacturer: fd.get("manufacturer").trim(), packContents: fd.get("packContents").trim(),
      warranty: fd.get("warranty").trim(),
      deliveryDaysMin: Number(fd.get("deliveryDaysMin")) || 0, deliveryDaysMax: Number(fd.get("deliveryDaysMax")) || 0,
      shippingCharge: fd.get("shippingCharge") ? Number(fd.get("shippingCharge")) : undefined, freeShipping: fd.get("freeShipping") === "on",
      seoTitle: fd.get("seoTitle").trim(), metaDescription: fd.get("metaDescription").trim(), slug: fd.get("slug").trim() || slugify(fd.get("name")), keywords: fd.get("keywords").trim(),
      status: fd.get("status"), flags: fd.getAll("flags"),
      pod: { enabled: podEnabled.checked, allowBack: podAllowBack.value === "yes", backExtra: Math.max(0, Number(podBackExtra.value) || 0), area: podArea(), backImage: podBackImage.value || "" },
      rating: existing?.rating || { average: 0, count: 0 }, reviewCount: existing?.reviewCount || 0,
    };
    if (product.pod.enabled && !images.length) { showFormError("Print on demand needs at least one product photo to show the customer's design on. Add a photo first."); return; }
    if (product.hasVariants && product.variants.length) {
      const bad = product.variants.find((v) => !(Number(v.price) > 0) || !(Number(v.mrp) > 0));
      if (bad) { showFormError(`Please enter the MRP and selling price for the variant "${[bad.color, bad.size].filter(Boolean).join(" / ") || "unnamed"}".`); return; }
      // The shop shows the first variant's price, so the product-level price/MRP/stock follow the variants.
      product.price = product.variants[0].price; product.mrp = product.variants[0].mrp;
      product.stock = product.variants.reduce((sum, v) => sum + (Number(v.stock) || 0), 0);
    }
    if (!product.name || !product.brand || product.mrp <= 0 || product.price <= 0) { showFormError("Please fill in all required fields."); return; }

    // Every product / variant sent to Qikink needs its REAL Qikink SKU (copied from the Qikink dashboard, never invented).
    // A product can stay a draft without it, but it can't be published.
    if (product.status === "published") {
      const rows = product.hasVariants ? product.variants : [product];
      const noSku = rows.find((r) => !String(r.sku || "").trim());
      if (noSku) {
        const label = product.hasVariants ? `the variant "${[noSku.color, noSku.size].filter(Boolean).join(" / ") || "unnamed"}"` : "this product";
        showFormError(`Please enter the exact Qikink SKU for ${label} before publishing. You can save it as a draft meanwhile.`); return;
      }
      const skus = rows.map((r) => String(r.sku).trim().toLowerCase());
      if (new Set(skus).size !== skus.length) { showFormError("Two variants have the same Qikink SKU. Each colour and size needs its own real SKU."); return; }
    }

    // Product coupon
    const couponOn = fd.get("couponEnabled") === "yes";
    const couponCode = couponCodeInput.value.trim().toUpperCase(), couponPercent = Number(couponPercentInput.value) || 0;
    if (couponOn && (!/^[A-Z0-9_-]{3,20}$/.test(couponCode) || !(couponPercent >= 1 && couponPercent <= 90))) {
      showFormError("For the coupon, enter a code of 3 to 20 letters or numbers and a discount between 1% and 90%."); return;
    }
    const saved = DB.saveProduct(product);
    if (couponOn || couponCode) DB.saveCoupon(saved.id, { enabled: couponOn, code: couponCode, percent: couponPercent });
    else if (DB.getCoupon(saved.id)) DB.deleteCoupon(saved.id);
    toast(mode === "add" ? "Product created" : "Product updated", "success");
    location.hash = buildHash("/admin/products");
  });
  function showFormError(msg) { const el = host.querySelector("#productFormError"); el.textContent = msg; el.hidden = false; el.scrollIntoView({ block: "center" }); }

  host.querySelector("#duplicateProductBtn")?.addEventListener("click", () => { const copy = { ...existing, id: undefined, name: existing.name + " (copy)", status: "draft" }; DB.saveProduct(copy); toast("Duplicated as a new draft", "success"); location.hash = buildHash("/admin/products"); });
  host.querySelector("#archiveProductBtn")?.addEventListener("click", () => { DB.saveProduct({ ...existing, status: "archived" }); toast("Product archived"); location.hash = buildHash("/admin/products"); });
  host.querySelector("#deleteProductBtn")?.addEventListener("click", () => { if (confirm(`Delete "${existing.name}"? This can't be undone.`)) { DB.deleteProduct(existing.id); toast("Product deleted"); location.hash = buildHash("/admin/products"); } });
};

/* ---- Admin: Orders list ---- */
const ORDER_ACTION_FLOW = ["confirmed", "processing", "packed", "shipped", "out_for_delivery", "delivered"];
PageControllers.adminOrders = function (host, params) {
  let statusFilter = params.get("status") || "";
  let page = 1; const PAGE_SIZE = 10;

  const tabs = host.querySelector("#orderStatusTabs");
  $$("[data-status]", tabs).forEach((t) => { t.setAttribute("aria-selected", String(t.dataset.status === statusFilter)); t.tabIndex = t.dataset.status === statusFilter ? 0 : -1; });
  tabs.addEventListener("click", (e) => { const t = e.target.closest("[data-status]"); if (!t) return; statusFilter = t.dataset.status; $$("[data-status]", tabs).forEach((x) => { x.setAttribute("aria-selected", String(x === t)); x.tabIndex = x === t ? 0 : -1; }); page = 1; render(); });

  const queueList = host.querySelector("#trackingQueueList");
  function renderQueue() {
    const needTracking = DB.getOrders({}).filter((o) => ["shipped", "out_for_delivery"].includes(o.orderStatus) && !o.courier?.trackingNumber);
    host.querySelector("#trackingQueueCount").hidden = needTracking.length === 0; host.querySelector("#trackingQueueCount").textContent = needTracking.length;
    queueList.innerHTML = ""; queueList.removeAttribute("aria-busy");
    const tpl = document.getElementById("tpl-queue-item");
    needTracking.forEach((o) => {
      const node = tpl.content.cloneNode(true);
      node.querySelector('[data-field="link"]').textContent = o.orderId; node.querySelector('[data-field="link"]').href = buildHash("/admin/order-details", { id: o.orderId });
      node.querySelector('[data-field="meta"]').textContent = `${statusLabel(o.orderStatus)} · ${o.shippingAddressSnapshot?.fullName || ""}`;
      node.querySelector('[data-action="add-tracking"]').addEventListener("click", () => openTrackingDialog(o, render));
      queueList.appendChild(node);
    });
    host.querySelector("#trackingQueueEmpty").hidden = needTracking.length !== 0;
  }

  function render() {
    let list = DB.getOrders({ status: statusFilter || undefined });
    const q = host.querySelector("#orderSearch").value.trim();
    if (q) list = DB.getOrders({ status: statusFilter || undefined, q });
    const method = host.querySelector("#filterPaymentMethod").value;
    if (method) list = list.filter((o) => o.payment.method === method);
    const pstatus = host.querySelector("#filterPaymentStatus").value;
    if (pstatus) list = list.filter((o) => o.payment.status === pstatus);
    const from = host.querySelector("#filterDateFrom").value, to = host.querySelector("#filterDateTo").value;
    if (from) list = list.filter((o) => o.createdAt >= new Date(from).getTime());
    if (to) list = list.filter((o) => o.createdAt <= new Date(to).getTime() + 86399999);

    const tbody = host.querySelector("#orderRows"); tbody.innerHTML = ""; tbody.removeAttribute("aria-busy");
    const visible = list.slice(0, page * PAGE_SIZE);
    const tpl = document.getElementById("tpl-order-row");
    visible.forEach((o) => {
      const node = tpl.content.cloneNode(true);
      const root = node.querySelector("[data-order-row]"); root.dataset.id = o.orderId;
      const link = node.querySelector('[data-field="link"]'); link.textContent = o.orderId; link.href = buildHash("/admin/order-details", { id: o.orderId });
      node.querySelector('[data-field="date"]').textContent = formatDateTime(o.createdAt);
      node.querySelector('[data-field="customer"]').textContent = o.shippingAddressSnapshot?.fullName || "";
      node.querySelector('[data-field="phone"]').textContent = "+91 " + (o.shippingAddressSnapshot?.phone || "");
      node.querySelector('[data-field="items"]').textContent = o.items.reduce((s, it) => s + it.quantity, 0) + " items";
      node.querySelector('[data-field="total"]').textContent = formatMoney(orderTotalOf(o));
      node.querySelector('[data-field="method"]').textContent = o.payment.method === "cod" ? "COD" : "Online";
      const pStatusEl = node.querySelector('[data-field="paymentStatus"]'); pStatusEl.textContent = statusLabel(o.payment.status); pStatusEl.dataset.status = o.payment.status;
      node.querySelector('[data-field="paidNote"]').textContent = "Paid " + formatMoney(o.payment.paidAmount);
      const statusEl = node.querySelector('[data-field="status"]'); statusEl.textContent = statusLabel(o.orderStatus); statusEl.dataset.status = o.orderStatus;
      node.querySelector('[data-field="viewLink"]').href = buildHash("/admin/order-details", { id: o.orderId });
      if (["pending_admin_approval", "pending_admin_confirmation"].includes(o.orderStatus)) { node.querySelector('[data-action="approve"]').hidden = false; node.querySelector('[data-action="reject"]').hidden = false; }
      tbody.appendChild(node);
    });
    host.querySelector("#ordersEmpty").hidden = list.length !== 0;
    host.querySelector("#loadMoreOrders").hidden = visible.length >= list.length;
  }
  ["orderSearch"].forEach((id) => host.querySelector("#" + id).addEventListener("input", debounce(() => { page = 1; render(); }, 200)));
  ["filterPaymentMethod", "filterPaymentStatus", "filterDateFrom", "filterDateTo"].forEach((id) => host.querySelector("#" + id).addEventListener("change", () => { page = 1; render(); }));
  host.querySelector("#clearOrderFilters")?.addEventListener("click", () => { ["filterPaymentMethod", "filterPaymentStatus", "filterDateFrom", "filterDateTo"].forEach((id) => (host.querySelector("#" + id).value = "")); host.querySelector("#orderSearch").value = ""; page = 1; render(); });
  host.querySelector("#loadMoreOrders").addEventListener("click", () => { page += 1; render(); });

  host.querySelector("#orderRows").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]"); if (!btn) return;
    const row = btn.closest("[data-order-row]"); const order = DB.getOrderById(row.dataset.id);
    if (btn.dataset.action === "approve") approveOrder(order, btn, render);
    if (btn.dataset.action === "reject") openStatusDialog(order, "rejected", render);
  });

  renderQueue(); render();
  wireTrackingAndStatusDialogs(host, () => { render(); renderQueue(); });
};

function openTrackingDialog(order, onSaved) {
  const dlg = $("#trackingDialog");
  $("#trackingOrderLabel", dlg).textContent = order.orderId;
  $("#trackingOrderId", dlg).value = order.orderId;
  $("#trkCourier", dlg).value = order.courier?.name || "";
  $("#trkNumber", dlg).value = order.courier?.trackingNumber || "";
  $("#trkUrl", dlg).value = order.courier?.trackingUrl || "";
  $("#trkShipDate", dlg).value = order.courier?.shipmentDate || "";
  $("#trkEta", dlg).value = order.courier?.estimatedDelivery || "";
  $("#trackingFormError", dlg).hidden = true;
  $("#trackingForm", dlg).onsubmit = (e) => {
    e.preventDefault();
    DB.updateOrderTracking(order.orderId, {
      name: $("#trkCourier", dlg).value.trim(), trackingNumber: $("#trkNumber", dlg).value.trim(),
      trackingUrl: $("#trkUrl", dlg).value.trim(), shipmentDate: $("#trkShipDate", dlg).value, estimatedDelivery: $("#trkEta", dlg).value,
    });
    closeDialog(dlg); toast("Tracking updated", "success"); onSaved?.();
  };
  openDialog(dlg);
}

/* ---- Admin actions that need the server (it checks the admin again, sends to Qikink, restores stock) ---- */
function adminOrderOp(op, orderId, note) { return Api.post("/api", { action: "admin-order", op, orderId, note: note || "" }); }
// The order document changes on the server; wait until the new version reaches this screen before redrawing.
async function waitForOrderChange(orderId, previousUpdatedAt) {
  const t0 = Date.now();
  while ((DB.getOrderById(orderId)?.updatedAt || 0) === previousUpdatedAt && Date.now() - t0 < 5000) await new Promise((r) => setTimeout(r, 150));
}
async function approveOrder(order, btn, onDone) {
  if (!confirm(`Approve ${order.orderId}? It will be sent to Qikink for printing and shipping.`)) return;
  if (btn) btn.disabled = true;
  try {
    const res = await adminOrderOp("approve", order.orderId);
    await waitForOrderChange(order.orderId, order.updatedAt);
    if (res.submitError) toast("Approved, but Qikink did not accept it: " + res.submitError, "error", 9000);
    else toast(res.already ? "Order was already sent to Qikink" : "Approved and sent to Qikink", "success");
  } catch (err) { toast(err.message || "Couldn't approve the order.", "error", 7000); }
  if (btn) btn.disabled = false;
  onDone?.();
}

function openStatusDialog(order, status, onSaved) {
  const dlg = $("#statusDialog");
  $("#statusDialogTitle", dlg).textContent = `Mark as ${statusLabel(status)}`;
  $("#statusDialogText", dlg).textContent = `Order ${order.orderId} will move to "${statusLabel(status)}".`;
  $("#statusOrderId", dlg).value = order.orderId; $("#statusTarget", dlg).value = status;
  const noteRequired = status === "rejected" || status === "cancelled";
  $("#statusNoteLabel", dlg).textContent = noteRequired ? "Reason (shown to the customer)" : "Note (optional)";
  $("#statusNote", dlg).required = noteRequired;
  $("#statusNote", dlg).value = "";
  $("#statusForm", dlg).onsubmit = (e) => {
    e.preventDefault();
    const note = $("#statusNote", dlg).value.trim();
    if (noteRequired && !note) { $("#statusFormError", dlg).textContent = "Please add a reason."; $("#statusFormError", dlg).hidden = false; return; }
    if (status === "rejected" || status === "cancelled") {
      // Rejecting / cancelling goes through the server so the stock is put back and any Qikink or refund follow-up is flagged.
      const submitBtn = $("#statusSubmit", dlg); submitBtn.disabled = true;
      adminOrderOp(status === "rejected" ? "reject" : "cancel", order.orderId, note).then(async (res) => {
        await waitForOrderChange(order.orderId, order.updatedAt);
        closeDialog(dlg);
        const extra = [res.needsManualCancel ? "It was already sent to Qikink, so also cancel it in the Qikink dashboard." : "", res.refundPending ? "The customer paid online: refund them from your PayU dashboard." : ""].filter(Boolean).join(" ");
        toast(`Order ${status}. ${extra}`.trim(), extra ? "default" : "success", extra ? 10000 : 3200); onSaved?.();
      }).catch((err) => { $("#statusFormError", dlg).textContent = err.message || "Couldn't update the order."; $("#statusFormError", dlg).hidden = false; })
        .finally(() => { submitBtn.disabled = false; });
      return;
    }
    DB.updateOrderStatus(order.orderId, status, note, "admin");
    closeDialog(dlg); toast(`Order marked ${statusLabel(status).toLowerCase()}`, "success"); onSaved?.();
  };
  openDialog(dlg);
}

function wireTrackingAndStatusDialogs(host, onSaved) {
  host.querySelector("#editTrackingBtn")?.addEventListener("click", () => { const order = DB.getOrderById(host.dataset.orderId); if (order) openTrackingDialog(order, onSaved); });
}

/* ---- Admin: Order details ---- */
PageControllers.adminOrderDetails = function (host, params) {
  const id = params.get("id");
  const order = id && DB.getOrderById(id);
  const notFound = host.querySelector("#orderNotFound"), view = host.querySelector("#orderView");
  if (!order) { notFound.hidden = false; view.hidden = true; return; }
  notFound.hidden = true; view.hidden = false;
  host.dataset.orderId = order.orderId;

  function render() {
    const o = DB.getOrderById(order.orderId);
    host.querySelector("#orderIdText").textContent = o.orderId;
    const badge = host.querySelector("#orderStatusBadge"); badge.textContent = statusLabel(o.orderStatus); badge.dataset.status = o.orderStatus;
    host.querySelector("#createdAt").textContent = formatDateTime(o.createdAt);
    host.querySelector("#updatedAt").textContent = formatDateTime(o.updatedAt);

    const tbody = host.querySelector("#orderItemRows"); tbody.innerHTML = "";
    const tpl = document.getElementById("tpl-admin-order-item");
    o.items.forEach((it) => {
      const node = tpl.content.cloneNode(true);
      if (it.image) node.querySelector('[data-field="image"]').src = it.image;
      node.querySelector('[data-field="name"]').textContent = it.productName;
      node.querySelector('[data-field="brand"]').textContent = it.brand;
      node.querySelector('[data-field="variant"]').innerHTML = escapeHtml(it.variant || "—") + (it.custom ? customSummaryHtml(it.custom, { links: true }) + `<p class="design-note">Custom print: ${it.custom.front ? "front" : ""}${it.custom.front && it.custom.back ? " + " : ""}${it.custom.back ? "back" : ""}. Open the design to download the original file.</p>` : "");
      { const skuEl = node.querySelector('[data-field="sku"]'); skuEl.textContent = it.sku || "Missing"; if (!it.sku) skuEl.dataset.missing = "true"; }
      node.querySelector('[data-field="qty"]').textContent = it.quantity;
      node.querySelector('[data-field="price"]').textContent = formatMoney(it.unitPrice);
      node.querySelector('[data-field="discount"]').textContent = formatMoney(it.discount);
      node.querySelector('[data-field="total"]').textContent = formatMoney(it.itemTotal);
      tbody.appendChild(node);
    });

    host.querySelector("#courierName").textContent = o.courier?.name || "—";
    host.querySelector("#trackingNumber").textContent = o.courier?.trackingNumber || "—";
    host.querySelector("#trackingUrl").textContent = o.courier?.trackingUrl || "—";
    host.querySelector("#shipmentDate").textContent = formatDate(o.courier?.shipmentDate);
    host.querySelector("#estimatedDelivery").textContent = formatDate(o.courier?.estimatedDelivery);

    const historyEl = host.querySelector("#statusHistory"); historyEl.innerHTML = "";
    const hTpl = document.getElementById("tpl-history-item");
    [...o.statusHistory].reverse().forEach((h) => {
      const node = hTpl.content.cloneNode(true);
      const badgeEl = node.querySelector('[data-field="status"]'); badgeEl.textContent = statusLabel(h.status); badgeEl.dataset.status = h.status;
      if (h.note) { const n = node.querySelector('[data-field="note"]'); n.hidden = false; n.textContent = h.note; }
      node.querySelector('[data-field="time"]').textContent = formatDateTime(h.at);
      node.querySelector('[data-field="by"]').textContent = h.by === "admin" ? "by admin" : "";
      historyEl.appendChild(node);
    });

    host.querySelector("#customerName").textContent = o.shippingAddressSnapshot.fullName;
    host.querySelector("#customerPhone").textContent = "+91 " + o.shippingAddressSnapshot.phone;
    host.querySelector("#customerEmail").textContent = o.customerEmail || "—";
    host.querySelector("#shippingAddress").innerHTML = addressHtml(o.shippingAddressSnapshot);

    host.querySelector("#paymentMethodText").textContent = o.payment.method === "cod" ? "Cash on Delivery" : "Online payment";
    const pBadge = host.querySelector("#paymentStatusBadge"); pBadge.textContent = statusLabel(o.payment.status); pBadge.dataset.status = o.payment.status;
    host.querySelector("#paidAmount").textContent = formatMoney(o.payment.paidAmount);
    host.querySelector("#codFee").textContent = formatMoney(o.pricing.codFee || 0);
    host.querySelector("#codRemaining").textContent = formatMoney(orderDueAtDelivery(o));
    host.querySelector("#transactionId").textContent = o.payment.transactionId || "—";

    host.querySelector("#orderSubtotal").textContent = formatMoney(o.pricing.subtotal);
    host.querySelector("#orderCouponRow").hidden = !(o.pricing.discount > 0);
    host.querySelector("#orderCouponLabel").textContent = o.pricing.couponCode ? `Coupon discount (${o.pricing.couponCode})` : "Discount";
    host.querySelector("#orderDiscount").textContent = "−" + formatMoney(o.pricing.discount);
    host.querySelector("#orderShipping").textContent = o.pricing.shipping === 0 ? "Free" : formatMoney(o.pricing.shipping);
    host.querySelector("#orderCodFeeRow").hidden = !(o.pricing.codFee > 0);
    host.querySelector("#orderCodFee").textContent = formatMoney(o.pricing.codFee || 0);
    host.querySelector("#orderTotal").textContent = formatMoney(orderTotalOf(o));

    // ---- Qikink panel ----
    const q = o.qikink || {};
    const submitted = q.submitState === "submitted" || !!q.orderId;
    const done = ["delivered", "cancelled", "rejected"].includes(o.orderStatus);
    const missing = o.items.filter((it) => !String(it.sku || "").trim());
    const stateKey = submitted ? "submitted_to_qikink" : q.submitState === "failed" ? "submit_failed" : q.submitState === "submitting" ? "submitting" : "not_sent";
    const stateEl = host.querySelector("#qkSubmitStatus"); stateEl.textContent = statusLabel(stateKey); stateEl.dataset.status = stateKey;
    host.querySelector("#qkOrderId").textContent = q.orderId || "—";
    host.querySelector("#qkFulfilStatus").textContent = q.status || "—";
    host.querySelector("#qkLastSync").textContent = q.lastSyncAt ? formatDateTime(q.lastSyncAt) : "—";
    const missAlert = host.querySelector("#skuMissingAlert");
    missAlert.hidden = !(missing.length && !submitted && !done);
    if (!missAlert.hidden) host.querySelector("#skuMissingText").textContent = `No Qikink SKU for: ${missing.map((it) => it.productName + (it.variant ? " (" + it.variant + ")" : "")).join(", ")}. This order can't be sent to Qikink until the real SKU is added to that product or variant. Then press Retry.`;
    const notes = [];
    if (q.error && !submitted) notes.push(q.error);
    if (q.needsAttention) notes.push(q.needsAttention);
    if (q.needsManualCancel) notes.push("This order was already sent to Qikink and is now cancelled here. Cancel it in your Qikink dashboard too (it can't be done from this panel).");
    const errEl = host.querySelector("#qkError"); errEl.hidden = notes.length === 0; errEl.textContent = notes.join("\n");
    const submitBtn = host.querySelector("#qkSubmitBtn");
    submitBtn.hidden = !(["confirmed", "submit_failed"].includes(o.orderStatus) && !submitted);
    submitBtn.textContent = q.submitState === "failed" ? "Retry sending to Qikink" : "Send to Qikink";
    host.querySelector("#qkSyncBtn").hidden = !(submitted && !done);


    const nextAllowed = nextActionsFor(o.orderStatus);
    host.querySelectorAll("[data-order-action]").forEach((btn) => { btn.disabled = !nextAllowed.includes(btn.dataset.orderAction); });
    const hints = [];
    if (o.orderStatus === "delivered") hints.push("This order has been delivered.");
    else if (["pending_admin_approval", "pending_admin_confirmation"].includes(o.orderStatus)) hints.push("This Cash on Delivery order has NOT been sent to Qikink. Approve it to send it, or reject it.");
    else hints.push("Qikink statuses update the order automatically when you press “Refresh status”. You can also set a status by hand: Processing, Packed, Shipped, Out for delivery or Delivered.");
    if (o.payment && o.payment.refundStatus === "refund_pending") hints.push("Refund pending: the customer paid online and the order is cancelled. Refund them from your PayU dashboard.");
    host.querySelector("#orderActionsHint").textContent = hints.join(" ");
  }

  host.querySelector("#orderActions").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-order-action]"); if (!btn || btn.disabled) return;
    const status = btn.dataset.orderAction;
    const o = DB.getOrderById(order.orderId);
    if (status === "approve") approveOrder(o, btn, render);
    else openStatusDialog(o, status, () => {
      render();
      // After "Shipped" it's natural to add the courier and tracking number straight away.
      if (status === "shipped") openTrackingDialog(DB.getOrderById(order.orderId), render);
    });
  });
  host.querySelector("#editTrackingBtn").addEventListener("click", () => openTrackingDialog(DB.getOrderById(order.orderId), render));
  host.querySelector("#qkSubmitBtn").addEventListener("click", async (e) => {
    const btn = e.currentTarget, o = DB.getOrderById(order.orderId); btn.disabled = true;
    try { const res = await adminOrderOp("submit", o.orderId); await waitForOrderChange(o.orderId, o.updatedAt); toast(res.already ? "Already sent to Qikink" : "Sent to Qikink", "success"); }
    catch (err) { await waitForOrderChange(o.orderId, o.updatedAt); toast(err.message || "Couldn't send to Qikink.", "error", 9000); }
    btn.disabled = false; render();
  });
  host.querySelector("#qkSyncBtn").addEventListener("click", async (e) => {
    const btn = e.currentTarget, o = DB.getOrderById(order.orderId); btn.disabled = true;
    try { const res = await adminOrderOp("sync", o.orderId); await waitForOrderChange(o.orderId, o.updatedAt); toast(res.status ? `Qikink status: ${res.status}` : "Checked Qikink. No new status yet.", "success"); }
    catch (err) { toast(err.message || "Couldn't check Qikink.", "error", 9000); }
    btn.disabled = false; render();
  });

  render();
};

function nextActionsFor(status) {
  if (["delivered", "cancelled", "rejected", "returned"].includes(status)) return [];
  if (status === "pending_admin_approval" || status === "pending_admin_confirmation") return ["approve", "rejected", "cancelled"];
  // Any later step is allowed (e.g. Confirmed -> Shipped, or Packed -> Delivered), plus Cancel.
  const idx = ORDER_ACTION_FLOW.indexOf(status);
  const later = idx > -1 ? ORDER_ACTION_FLOW.slice(idx + 1) : ORDER_ACTION_FLOW.slice();
  return [...later, "cancelled"];
}

/* ---- Admin: Customers ---- */
PageControllers.adminCustomers = function (host) {
  let page = 1; const PAGE_SIZE = 10;
  function render() {
    let list = DB.getAllCustomers();
    const q = host.querySelector("#customerSearch").value.trim().toLowerCase();
    if (q) list = list.filter((u) => [u.fullName, u.email, u.phone].filter(Boolean).some((f) => f.toLowerCase().includes(q)));
    const tbody = host.querySelector("#customerRows"); tbody.innerHTML = ""; tbody.removeAttribute("aria-busy");
    const visible = list.slice(0, page * PAGE_SIZE);
    const tpl = document.getElementById("tpl-customer-row");
    visible.forEach((u) => {
      const orders = DB.getOrders({ userId: u.uid });
      const spent = orders.reduce((s, o) => s + (o.payment.paidAmount || 0), 0);
      const node = tpl.content.cloneNode(true);
      const root = node.querySelector("[data-customer-row]"); root.dataset.id = u.uid;
      node.querySelector('[data-field="name"]').textContent = u.fullName;
      node.querySelector('[data-field="email"]').textContent = u.email;
      node.querySelector('[data-field="phone"]').textContent = u.phone ? "+91 " + u.phone : "—";
      node.querySelector('[data-field="orders"]').textContent = orders.length;
      node.querySelector('[data-field="spent"]').textContent = formatMoney(spent);
      node.querySelector('[data-field="joined"]').textContent = formatDate(u.createdAt);
      tbody.appendChild(node);
    });
    host.querySelector("#customersEmpty").hidden = list.length !== 0;
    host.querySelector("#loadMoreCustomers").hidden = visible.length >= list.length;
  }
  host.querySelector("#customerSearch").addEventListener("input", debounce(() => { page = 1; render(); }, 200));
  host.querySelector("#loadMoreCustomers").addEventListener("click", () => { page += 1; render(); });
  host.querySelector("#customerRows").addEventListener("click", (e) => {
    const btn = e.target.closest('[data-action="view-customer"]'); if (!btn) return;
    const uid = btn.closest("[data-customer-row]").dataset.id;
    const u = DB.getUserById(uid);
    const dlg = host.querySelector("#customerDialog");
    dlg.querySelector("#custName").textContent = u.fullName; dlg.querySelector("#custEmail").textContent = u.email;
    dlg.querySelector("#custPhone").textContent = u.phone ? "+91 " + u.phone : "—"; dlg.querySelector("#custJoined").textContent = formatDate(u.createdAt);
    const addrs = DB.getAddresses(uid);
    dlg.querySelector("#custAddresses").innerHTML = addrs.map((a) => `<li>${escapeHtml(formatAddress(a))}</li>`).join("");
    dlg.querySelector("#custAddressesEmpty").hidden = addrs.length !== 0;
    const orders = DB.getOrders({ userId: uid });
    const ordersList = dlg.querySelector("#custOrders"); ordersList.innerHTML = "";
    const tpl = document.getElementById("tpl-customer-order");
    orders.slice(0, 8).forEach((o) => {
      const node = tpl.content.cloneNode(true);
      node.querySelector('[data-field="link"]').href = buildHash("/admin/order-details", { id: o.orderId });
      node.querySelector('[data-field="orderId"]').textContent = o.orderId;
      node.querySelector('[data-field="date"]').textContent = formatDate(o.createdAt);
      node.querySelector('[data-field="total"]').textContent = formatMoney(o.pricing.total);
      const s = node.querySelector('[data-field="status"]'); s.textContent = statusLabel(o.orderStatus); s.dataset.status = o.orderStatus;
      ordersList.appendChild(node);
    });
    dlg.querySelector("#custOrdersEmpty").hidden = orders.length !== 0;
    openDialog(dlg);
  });
  render();
};

/* ---- Admin: Reviews ---- */
PageControllers.adminReviews = function (host) {
  let page = 1; const PAGE_SIZE = 10;
  function render() {
    let list = DB.getAllReviews({});
    const status = host.querySelector("#filterReviewStatus").value;
    if (status) list = list.filter((r) => (status === "visible" ? r.visible : !r.visible));
    const rating = host.querySelector("#filterRating").value;
    if (rating) list = list.filter((r) => r.rating === Number(rating));
    const q = host.querySelector("#reviewSearch").value.trim().toLowerCase();
    if (q) list = list.filter((r) => [r.title, r.text, r.userName].filter(Boolean).some((f) => f.toLowerCase().includes(q)) || DB.getProductById(r.productId)?.name.toLowerCase().includes(q));
    const listEl = host.querySelector("#reviewAdminList"); listEl.innerHTML = ""; listEl.removeAttribute("aria-busy");
    const visible = list.slice(0, page * PAGE_SIZE);
    const tpl = document.getElementById("tpl-admin-review");
    visible.forEach((r) => {
      const node = tpl.content.cloneNode(true);
      const root = node.querySelector("[data-review-item]"); root.dataset.id = r.id;
      node.querySelector('[data-field="rating"]').textContent = r.rating.toFixed(1);
      node.querySelector('[data-field="title"]').textContent = r.title || "(No title)";
      const statusEl = node.querySelector('[data-field="status"]'); statusEl.textContent = r.visible ? "Visible" : "Hidden"; statusEl.dataset.status = r.visible ? "visible" : "hidden";
      const p = DB.getProductById(r.productId);
      const pLink = node.querySelector('[data-field="productLink"]'); pLink.textContent = p?.name || "Product"; pLink.href = buildHash("/product", { id: r.productId });
      node.querySelector('[data-field="text"]').textContent = r.text;
      node.querySelector('[data-field="author"]').textContent = r.userName;
      node.querySelector('[data-field="verified"]').hidden = !r.verifiedPurchase;
      node.querySelector('[data-field="date"]').textContent = formatDate(r.createdAt);
      node.querySelector('[data-action="toggle-visibility"]').textContent = r.visible ? "Hide review" : "Show review";
      listEl.appendChild(node);
    });
    host.querySelector("#reviewsEmpty").hidden = list.length !== 0;
    host.querySelector("#loadMoreReviews").hidden = visible.length >= list.length;
  }
  ["reviewSearch"].forEach((id) => host.querySelector("#" + id).addEventListener("input", debounce(() => { page = 1; render(); }, 200)));
  ["filterReviewStatus", "filterRating"].forEach((id) => host.querySelector("#" + id).addEventListener("change", () => { page = 1; render(); }));
  host.querySelector("#loadMoreReviews").addEventListener("click", () => { page += 1; render(); });
  host.querySelector("#reviewAdminList").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]"); if (!btn) return;
    const id = btn.closest("[data-review-item]").dataset.id;
    if (btn.dataset.action === "toggle-visibility") { const r = DB.getAllReviews({}).find((x) => x.id === id); DB.setReviewVisibility(id, !r.visible); render(); }
    if (btn.dataset.action === "remove-review") { if (confirm("Remove this review?")) { DB.deleteReview(id); toast("Review removed"); render(); } }
  });
  render();
};

/* ---- Admin: Inventory ---- */
PageControllers.adminInventory = function (host, params) {
  let filter = params.get("filter") === "low" ? "low" : "all", page = 1; const PAGE_SIZE = 15;
  $$("[data-filter]", host.querySelector("#inventoryFilters")).forEach((t) => { t.setAttribute("aria-selected", String(t.dataset.filter === filter)); t.tabIndex = t.dataset.filter === filter ? 0 : -1; });
  host.querySelector("#inventoryFilters").addEventListener("click", (e) => { const t = e.target.closest("[data-filter]"); if (!t) return; filter = t.dataset.filter; $$("[data-filter]", host.querySelector("#inventoryFilters")).forEach((x) => { x.setAttribute("aria-selected", String(x === t)); x.tabIndex = x === t ? 0 : -1; }); page = 1; render(); });

  function rows() {
    const out = [];
    DB.getProducts({}).forEach((p) => {
      if (p.hasVariants) p.variants.forEach((v) => out.push({ product: p, variant: v, stock: v.stock, threshold: p.lowStockThreshold, sku: v.sku }));
      else out.push({ product: p, variant: null, stock: p.stock, threshold: p.lowStockThreshold, sku: p.sku });
    });
    return out;
  }
  function render() {
    let list = rows();
    const q = host.querySelector("#inventorySearch").value.trim().toLowerCase();
    if (q) list = list.filter((r) => [r.product.name, r.sku].filter(Boolean).some((f) => f.toLowerCase().includes(q)));
    if (filter === "low") list = list.filter((r) => r.stock > 0 && r.stock <= r.threshold);
    if (filter === "out") list = list.filter((r) => r.stock === 0);
    const tbody = host.querySelector("#inventoryRows"); tbody.innerHTML = ""; tbody.removeAttribute("aria-busy");
    const visible = list.slice(0, page * PAGE_SIZE);
    const tpl = document.getElementById("tpl-inventory-row");
    visible.forEach((r) => {
      const node = tpl.content.cloneNode(true);
      const root = node.querySelector("[data-inventory-row]"); root.dataset.id = r.product.id; root.dataset.variantId = r.variant?.variantId || "";
      if (firstImage(r.product)) node.querySelector('[data-field="image"]').src = firstImage(r.product);
      node.querySelector('[data-field="editLink"]').textContent = r.product.name; node.querySelector('[data-field="editLink"]').href = buildHash("/admin/edit-product", { id: r.product.id });
      node.querySelector('[data-field="variant"]').textContent = r.variant ? [r.variant.color, r.variant.size].filter(Boolean).join(" / ") : r.product.brand;
      node.querySelector('[data-field="sku"]').textContent = r.sku || "—";
      node.querySelector('[data-field="stock"]').value = r.stock;
      node.querySelector('[data-field="threshold"]').value = r.threshold;
      const statusEl = node.querySelector('[data-field="status"]');
      statusEl.textContent = r.stock === 0 ? "Out of stock" : r.stock <= r.threshold ? "Low stock" : "In stock";
      statusEl.dataset.status = r.stock === 0 ? "out_of_stock" : r.stock <= r.threshold ? "pending" : "published";
      tbody.appendChild(node);
    });
    host.querySelector("#inventoryEmpty").hidden = list.length !== 0;
    host.querySelector("#loadMoreInventory").hidden = visible.length >= list.length;
  }
  host.querySelector("#inventorySearch").addEventListener("input", debounce(() => { page = 1; render(); }, 200));
  host.querySelector("#inventoryRows").addEventListener("input", (e) => { if (e.target.matches('[data-field="stock"], [data-field="threshold"]')) e.target.closest("[data-inventory-row]").querySelector('[data-action="save-stock"]').disabled = false; });
  host.querySelector("#inventoryRows").addEventListener("click", (e) => {
    const btn = e.target.closest('[data-action="save-stock"]'); if (!btn) return;
    const row = btn.closest("[data-inventory-row]");
    const stock = Number(row.querySelector('[data-field="stock"]').value) || 0;
    DB.updateProductStock(row.dataset.id, row.dataset.variantId || null, stock);
    DB.setLowStockThreshold(row.dataset.id, row.dataset.variantId || null, Number(row.querySelector('[data-field="threshold"]').value) || 0);
    btn.disabled = true; toast("Stock updated", "success"); render();
  });
  render();
};

/* ---- Admin: Categories ---- */
PageControllers.adminCategories = function (host) {
  function render() {
    const tree = DB.getCategoryTree();
    const treeEl = host.querySelector("#categoryTree"); treeEl.innerHTML = ""; treeEl.removeAttribute("aria-busy");
    const tpl = document.getElementById("tpl-category-item"), subTpl = document.getElementById("tpl-subcategory-item");
    tree.forEach((cat) => {
      const node = tpl.content.cloneNode(true);
      const root = node.querySelector("[data-category-item]"); root.dataset.id = cat.id;
      if (cat.image) node.querySelector('[data-field="image"]').src = cat.image;
      node.querySelector('[data-field="name"]').textContent = cat.name;
      node.querySelector('[data-field="meta"]').textContent = `${cat.subcategories.length} subcategor${cat.subcategories.length === 1 ? "y" : "ies"}`;
      const statusEl = node.querySelector('[data-field="status"]'); statusEl.textContent = cat.active ? "Active" : "Hidden"; statusEl.dataset.status = cat.active ? "published" : "draft";
      const subsWrap = node.querySelector('[data-field="subcategories"]');
      cat.subcategories.forEach((sub) => {
        const subNode = subTpl.content.cloneNode(true);
        const subRoot = subNode.querySelector("[data-subcategory-item]"); subRoot.dataset.id = sub.id;
        subNode.querySelector('[data-field="name"]').textContent = sub.name;
        subNode.querySelector('[data-field="meta"]').textContent = DB.getProducts({ subcategoryId: sub.id }).length + " products";
        const sStatus = subNode.querySelector('[data-field="status"]'); sStatus.textContent = sub.active ? "Active" : "Hidden"; sStatus.dataset.status = sub.active ? "published" : "draft";
        subsWrap.appendChild(subNode);
      });
      node.querySelector('[data-action="add-subcategory"]').addEventListener("click", () => openCategoryDialog(host, { parentId: cat.id }, render));
      node.querySelector('[data-action="edit-category"]').addEventListener("click", () => openCategoryDialog(host, cat, render));
      node.querySelector('[data-action="delete-category"]').addEventListener("click", () => { if (confirm(`Delete "${cat.name}" and its subcategories?`)) { DB.deleteCategory(cat.id); render(); } });
      treeEl.appendChild(node);
    });
    treeEl.addEventListener("click", (e) => {
      const editSub = e.target.closest('[data-action="edit-subcategory"]');
      const delSub = e.target.closest('[data-action="delete-subcategory"]');
      if (editSub) { const id = editSub.closest("[data-subcategory-item]").dataset.id; openCategoryDialog(host, DB.getCategoryById(id), render); }
      if (delSub) { const id = delSub.closest("[data-subcategory-item]").dataset.id; if (confirm("Delete this subcategory?")) { DB.deleteCategory(id); render(); } }
    });
    host.querySelector("#categoriesEmpty").hidden = tree.length !== 0;
  }
  host.querySelector("#addCategoryBtn")?.addEventListener("click", () => openCategoryDialog(host, {}, render));
  host.querySelector("#addFirstCategoryBtn")?.addEventListener("click", () => openCategoryDialog(host, {}, render));
  render();
};

function openCategoryDialog(host, cat, onSaved) {
  const dlg = host.querySelector("#categoryDialog");
  const form = dlg.querySelector("#categoryForm"); form.reset();
  dlg.querySelector("#categoryFormError").hidden = true;
  const isSub = !!cat.parentId || (cat.parentId === undefined && cat.id && DB.getCategoryById(cat.id)?.parentId);
  const parentField = dlg.querySelector("#parentField"), parentSelect = dlg.querySelector("#categoryParent");
  const topCats = DB.getCategories().filter((c) => !c.parentId && c.id !== cat.id);
  parentSelect.innerHTML = '<option value="">Select parent category</option>' + topCats.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");
  const willBeSub = !!cat.parentId || (cat.id && DB.getCategoryById(cat.id)?.parentId);
  parentField.hidden = !willBeSub;
  dlg.querySelector("#categoryDialogTitle").textContent = cat.id ? "Edit " + (willBeSub ? "subcategory" : "category") : willBeSub ? "Add subcategory" : "Add category";
  dlg.querySelector("#categoryId").value = cat.id || "";
  dlg.querySelector("#categoryFeaturedField").hidden = willBeSub;
  if (cat.id) {
    dlg.querySelector("#categoryName").value = cat.name || "";
    dlg.querySelector("#categorySlug").value = cat.slug || "";
    dlg.querySelector("#categoryDescription").value = cat.description || "";
    dlg.querySelector("#categorySort").value = cat.sortOrder || 0;
    dlg.querySelector("#categoryActive").checked = cat.active !== false;
    dlg.querySelector("#categoryFeatured").checked = !!cat.featured;
    if (cat.parentId) parentSelect.value = cat.parentId;
    if (cat.image) dlg.querySelector("#categoryImagePreview").src = cat.image;
  } else if (cat.parentId) parentSelect.value = cat.parentId;

  let newImage = cat.image || "";
  dlg.querySelector("#categoryImage").onchange = async (e) => { const file = e.target.files[0]; if (file) { newImage = await resizeImage(file, 480, "site/categories"); dlg.querySelector("#categoryImagePreview").src = newImage; } };

  form.onsubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const name = fd.get("name").trim();
    if (!name) { dlg.querySelector("#categoryFormError").textContent = "Please enter a name."; dlg.querySelector("#categoryFormError").hidden = false; return; }
    if (!parentField.hidden && !fd.get("parentId")) { dlg.querySelector("#categoryFormError").textContent = "Please choose a parent category."; dlg.querySelector("#categoryFormError").hidden = false; return; }
    DB.saveCategory({
      id: cat.id, name, slug: fd.get("slug").trim() || slugify(name), description: fd.get("description").trim(),
      image: newImage, sortOrder: Number(fd.get("sortOrder")) || 0, active: fd.get("active") === "on",
      featured: fd.get("featured") === "on", parentId: parentField.hidden ? (cat.parentId || null) : fd.get("parentId"),
    });
    closeDialog(dlg); toast("Category saved", "success"); onSaved?.();
  };
  openDialog(dlg);
}

/* ---- Admin: Homepage ---- */
PageControllers.adminHomepage = function (host) {
  const settings = DB.getSettings();
  const homepage = settings.homepage || { hero: [], promo: [], sections: {} };
  function renderBanners(placement, listId, emptyId) {
    const list = host.querySelector("#" + listId); list.innerHTML = "";
    const banners = homepage[placement] || [];
    const tpl = document.getElementById("tpl-banner-item");
    banners.forEach((b, i) => {
      const node = tpl.content.cloneNode(true);
      const root = node.querySelector("[data-banner-item]"); root.dataset.id = b.id;
      if (b.image) node.querySelector('[data-field="image"]').src = b.image;
      node.querySelector('[data-field="title"]').textContent = b.title || "(No title)";
      node.querySelector('[data-field="subtitle"]').textContent = b.subtitle || "";
      node.querySelector('[data-field="link"]').textContent = b.buttonUrl || "";
      node.querySelector('[data-field="enabled"]').checked = b.enabled !== false;
      node.querySelector('[data-field="enabled"]').addEventListener("change", (e) => { b.enabled = e.target.checked; save(); });
      node.querySelector('[data-action="move-up"]').addEventListener("click", () => { if (i > 0) { [banners[i - 1], banners[i]] = [banners[i], banners[i - 1]]; save(); renderBanners(placement, listId, emptyId); } });
      node.querySelector('[data-action="move-down"]').addEventListener("click", () => { if (i < banners.length - 1) { [banners[i + 1], banners[i]] = [banners[i], banners[i + 1]]; save(); renderBanners(placement, listId, emptyId); } });
      node.querySelector('[data-action="edit-banner"]').addEventListener("click", () => openBannerDialog(host, placement, b, () => renderBanners(placement, listId, emptyId)));
      node.querySelector('[data-action="delete-banner"]').addEventListener("click", () => { if (confirm("Delete this banner?")) { homepage[placement] = banners.filter((x) => x !== b); save(); renderBanners(placement, listId, emptyId); } });
      list.appendChild(node);
    });
    host.querySelector("#" + emptyId).hidden = banners.length !== 0;
  }
  function save() { DB.saveSettings({ homepage }); }
  renderBanners("hero", "heroBannerList", "heroBannersEmpty");
  renderBanners("promo", "promoBannerList", "promoBannersEmpty");
  host.querySelectorAll("[data-add-banner]").forEach((btn) => btn.addEventListener("click", () => openBannerDialog(host, btn.dataset.addBanner, null, () => renderBanners(btn.dataset.addBanner, btn.dataset.addBanner === "hero" ? "heroBannerList" : "promoBannerList", btn.dataset.addBanner === "hero" ? "heroBannersEmpty" : "promoBannersEmpty"))));

  const sectionList = host.querySelector("#sectionList");
  Object.entries(homepage.sections || {}).forEach(([key, cfg]) => {
    const item = sectionList.querySelector(`[data-section-key="${key}"]`);
    if (item && cfg) { item.querySelector('[data-field="title"]').value = cfg.title || item.querySelector('[data-field="title"]').value; item.querySelector('[data-field="enabled"]').checked = cfg.enabled !== false; }
  });
  sectionList.addEventListener("click", (e) => {
    const item = e.target.closest(".section-list__item"); if (!item) return;
    if (e.target.closest('[data-action="move-up"]')) { const prev = item.previousElementSibling; if (prev) sectionList.insertBefore(item, prev); }
    if (e.target.closest('[data-action="move-down"]')) { const next = item.nextElementSibling; if (next) sectionList.insertBefore(next, item); }
  });
  host.querySelector("#saveHomepageBtn")?.addEventListener("click", () => {
    const sections = {};
    $$(".section-list__item", sectionList).forEach((item, i) => { sections[item.dataset.sectionKey] = { title: item.querySelector('[data-field="title"]').value, enabled: item.querySelector('[data-field="enabled"]').checked, order: i }; });
    homepage.sections = sections;
    save();
    toast("Homepage saved", "success");
  });
};

function openBannerDialog(host, placement, banner, onSaved) {
  const dlg = host.querySelector("#bannerDialog");
  const form = dlg.querySelector("#bannerForm"); form.reset();
  dlg.querySelector("#bannerFormError").hidden = true;
  dlg.querySelector("#bannerDialogTitle").textContent = banner ? "Edit banner" : "Add banner";
  dlg.querySelector("#bannerPlacement").value = placement;
  dlg.querySelectorAll("[data-hero-only]").forEach((el) => (el.hidden = placement !== "hero"));
  let newImage = banner?.image || "";
  if (banner) {
    dlg.querySelector("#bannerId").value = banner.id;
    dlg.querySelector("#bannerAlt").value = banner.alt || "";
    dlg.querySelector("#bannerTitle").value = banner.title || "";
    dlg.querySelector("#bannerSubtitle").value = banner.subtitle || "";
    dlg.querySelector("#bannerButtonText").value = banner.buttonText || "";
    dlg.querySelector("#bannerButtonUrl").value = banner.buttonUrl || "";
    dlg.querySelector("#bannerButton2Text").value = banner.button2Text || "";
    dlg.querySelector("#bannerButton2Url").value = banner.button2Url || "";
    dlg.querySelector("#bannerEnabled").checked = banner.enabled !== false;
    if (banner.image) dlg.querySelector("#bannerImagePreview").src = banner.image;
  }
  dlg.querySelector("#bannerImage").onchange = async (e) => { const file = e.target.files[0]; if (file) { newImage = await resizeImage(file, 1200, "site/banners"); dlg.querySelector("#bannerImagePreview").src = newImage; } };
  form.onsubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const settings = DB.getSettings();
    const homepage = settings.homepage;
    const list = homepage[placement] || (homepage[placement] = []);
    const data = { id: banner?.id || genId("banner"), image: newImage, alt: fd.get("alt").trim(), title: fd.get("title").trim(), subtitle: fd.get("subtitle").trim(), buttonText: fd.get("buttonText").trim(), buttonUrl: fd.get("buttonUrl").trim(), button2Text: fd.get("button2Text")?.trim(), button2Url: fd.get("button2Url")?.trim(), enabled: fd.get("enabled") === "on" };
    if (banner) Object.assign(banner, data); else list.push(data);
    DB.saveSettings({ homepage });
    closeDialog(dlg); toast("Banner saved", "success"); onSaved?.();
  };
  openDialog(dlg);
}

/* ---- Admin: Settings ---- */
PageControllers.adminSettings = function (host) {
  const settings = DB.getSettings();
  const form = host.querySelector("#settingsForm");
  const setVal = (id, val) => { const el = host.querySelector("#" + id); if (el) el.value = val ?? ""; };
  setVal("setStoreName", settings.storeName); setVal("setSupportEmail", settings.supportEmail); setVal("setSupportPhone", settings.supportPhone);
  setVal("setSupportWhatsapp", settings.supportWhatsapp); setVal("setStoreAddress", settings.storeAddress);
  setVal("setDeliveryMin", settings.deliveryDaysMin); setVal("setDeliveryMax", settings.deliveryDaysMax);
  setVal("setShippingCharge", settings.defaultShippingCharge); setVal("setFreeShippingThreshold", settings.freeShippingThreshold);
  host.querySelector("#setTaxEnabled").checked = !!settings.taxEnabled;
  setVal("setGstin", settings.gstin); setVal("setTaxLabel", settings.taxLabel); setVal("setTaxRate", settings.taxRate);
  const qc = settings.qikinkChecklist || {};
  host.querySelector("#chkApiAccess").checked = !!qc.api; host.querySelector("#chkBoxPacking").checked = !!qc.box; host.querySelector("#chkSticker").checked = !!qc.sticker;
  setVal("policyShipping", settings.policyShipping); setVal("policyReturns", settings.policyReturns); setVal("policyPrivacy", settings.policyPrivacy); setVal("policyTerms", settings.policyTerms);

  function updateTaxFields() { const on = host.querySelector("#setTaxEnabled").checked; ["setGstin", "setTaxLabel", "setTaxRate"].forEach((id) => (host.querySelector("#" + id).disabled = !on)); }
  host.querySelector("#setTaxEnabled").addEventListener("change", updateTaxFields); updateTaxFields();
  {
    const badge = host.querySelector("#payuStatusBadge");
    const show = (text, status) => { badge.textContent = text; badge.dataset.status = status; };
    fetch("/api").then(async (r) => {
      if (r.status === 404) return show("Server file missing: /api not found. Upload api/index.js and package.json to GitHub, then redeploy.", "failed");
      if (!r.ok) return show("The server file crashed (error " + r.status + "). Open Vercel → Logs to see why.", "failed");
      let s; try { s = await r.json(); } catch { return show("/api answered, but not with the expected data. Check that api/index.js is the one-line file.", "failed"); }
      const problems = [];
      if (!s.hasKey) problems.push("PAYU_CLIENT_ID missing in Vercel");
      if (!s.hasSecret) problems.push("PAYU_CLIENT_SECRET missing in Vercel");
      if (s.adminPackage === false) problems.push("firebase-admin not installed (upload package.json)");
      else if (s.firebaseKey === "missing") problems.push("FIREBASE_SERVICE_ACCOUNT missing in Vercel");
      else if (s.firebaseKey === "invalid") problems.push("FIREBASE_SERVICE_ACCOUNT is not valid JSON (paste the whole key file)");
      if (problems.length) return show("Not ready: " + problems.join(" · ") + ". After fixing, Redeploy.", "failed");
      show(`Connected (${s.mode === "live" ? "live" : "test mode"}) · Firebase server key OK`, "confirmed");
      const qb = host.querySelector("#qikinkStatusBadge");
      if (qb) {
        qb.textContent = s.qikinkConfigured ? `Credentials found (${s.qikinkMode}). Not verified until an order is sent.` : "Not set up: add QIKINK_CLIENT_ID and QIKINK_CLIENT_SECRET in Vercel, then redeploy.";
        qb.dataset.status = s.qikinkConfigured ? "pending" : "failed";
      }
    }).catch(() => show("Couldn't reach the server. Check your internet and refresh.", "pending"));
  }

  host.querySelector("#setLogo").addEventListener("change", async (e) => { const file = e.target.files[0]; if (file) { const url = await resizeImage(file, 240, "site/logo"); host.querySelector("#logoPreview").src = url; host.dataset.newLogo = url; } });

  const adminList = host.querySelector("#adminList");
  function renderAdminList() {
    const admins = DB.getAdmins();
    adminList.innerHTML = ""; adminList.removeAttribute("aria-busy");
    const tpl = document.getElementById("tpl-admin-user");
    admins.forEach((u) => {
      const node = tpl.content.cloneNode(true);
      node.querySelector('[data-field="email"]').textContent = u.email;
      node.querySelector('[data-field="role"]').textContent = "Admin";
      const removeBtn = node.querySelector('[data-action="remove-admin"]');
      if (u.uid === Auth.currentUser()?.uid) removeBtn.hidden = true;
      else removeBtn.addEventListener("click", () => { if (confirm(`Remove admin access for ${u.email}?`)) { DB.setAdmin(u.uid, u.email, false); renderAdminList(); } });
      adminList.appendChild(node);
    });
  }
  renderAdminList();
  host.querySelector("#inviteAdminBtn").addEventListener("click", () => openDialog(host.querySelector("#inviteAdminDialog")));
  host.querySelector("#inviteAdminForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const email = host.querySelector("#inviteAdminEmail").value.trim();
    const user = DB.findUserByEmail(email);
    const errorEl = host.querySelector("#inviteAdminError");
    if (!user) { errorEl.textContent = "No account found with that email. They need to sign up first."; errorEl.hidden = false; return; }
    DB.setAdmin(user.uid, user.email, true);
    closeDialog(host.querySelector("#inviteAdminDialog"));
    toast("Admin access granted", "success");
    renderAdminList();
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    // Read straight from the fields: FormData skips disabled ones (GST fields are disabled while tax is off) and that used to crash the save.
    const get = (name) => { const el = form.elements[name]; return el ? String(el.value ?? "").trim() : ""; };
    const num = (name, fallback = 0) => Number(get(name)) || fallback;
    DB.saveSettings({
      storeName: get("storeName") || STORE_NAME, logo: host.dataset.newLogo || settings.logo || "",
      supportEmail: get("supportEmail"), supportPhone: get("supportPhone"), supportWhatsapp: get("supportWhatsapp"),
      storeAddress: get("storeAddress"), deliveryDaysMin: num("deliveryDaysMin", 3), deliveryDaysMax: num("deliveryDaysMax", 7),
      defaultShippingCharge: num("defaultShippingCharge"), freeShippingThreshold: num("freeShippingThreshold"),
      taxEnabled: host.querySelector("#setTaxEnabled").checked, gstin: get("gstin"), taxLabel: get("taxLabel") || "GST", taxRate: num("taxRate"),
      qikinkChecklist: { api: host.querySelector("#chkApiAccess").checked, box: host.querySelector("#chkBoxPacking").checked, sticker: host.querySelector("#chkSticker").checked },
      policyShipping: get("policyShipping"), policyReturns: get("policyReturns"), policyPrivacy: get("policyPrivacy"), policyTerms: get("policyTerms"),
    });
    applyStoreName();
    toast("Settings saved", "success");
    host.querySelector("#settingsSavedNotice").hidden = false;
    setTimeout(() => (host.querySelector("#settingsSavedNotice").hidden = true), 3000);
  });
};

/* ==========================================================================
   12. BOOTSTRAP
   ========================================================================== */
async function boot() {
  wireDialogDismiss(document);
  wireHeaderSearch();
  wireAccountMenu();
  wireAdminEntry();
  wireAdminChrome();
  wireGlobalActions();
  updateHeaderBadges();
  ["gesturestart", "gesturechange", "gestureend"].forEach((t) => document.addEventListener(t, (e) => e.preventDefault()));
  document.addEventListener("touchmove", (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
  const yearEl = $("#footerYear"); if (yearEl) yearEl.textContent = new Date().getFullYear();

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { $$("dialog[open]").forEach(closeDialog); }
  });

  // Show a spinner while we connect to Firebase and load the catalogue.
  const bootBox = $("#app");
  bootBox.innerHTML = '<div class="container" style="padding:1.5rem 0"><div class="product-grid" id="bootSkeleton"></div></div>';
  try { renderProductGrid(bootBox.querySelector("#bootSkeleton"), [], { skeletonCount: 8 }); } catch { /* skeleton is optional */ }
  await Backend.init();

  applyStoreName();
  populateCategoryNav();
  updateAccountMenu();
  Auth.onChange(() => { updateAccountMenu(); updateHeaderBadges(); });

  // Keep header/footer/category menu fresh when the admin edits things in real time.
  let refreshTimer;
  document.addEventListener("db:change", () => {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => { applyStoreName(); populateCategoryNav(); updateAccountMenu(); updateHeaderBadges(); }, 150);
  });

  navigate();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();

}
