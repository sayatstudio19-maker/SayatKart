/* ==========================================================================
   YOUR STORE — app.js  (the ONLY JavaScript file)

   This one file does two jobs, depending on where it runs:
     1) In the visitor's browser (index.html loads it)  -> the storefront + admin panel.
     2) On Vercel as a serverless function (api/index.js is a one-line pointer to it)
        -> PayU payments, order creation and review checks, using your secret env vars.
   Your PayU secret and Firebase service-account key are NEVER written in this file —
   they are read from Vercel Environment Variables.

   Files you deploy:  index.html, style.css, app.js, package.json, vercel.json,
                      api/index.js (contains only: module.exports = require("../app.js");)

   ==========================  SETUP GUIDE  ==========================
   # Setup guide (Firebase + PayU + Vercel)

   ## 1. Firebase
   1. https://console.firebase.google.com → **Add project**.
   2. **Build → Authentication → Get started** → Sign-in method → turn on **Email/Password** and **Google**.
   3. **Build → Firestore Database → Create database** (production mode, nearest region).
   4. **Build → Storage → Get started**.
   5. **Project settings (gear) → Your apps → Web (</>)** → register app → copy the firebaseConfig values into the FIREBASE_CONFIG block at the top of app.js.
   6. **Authentication → Settings → Authorized domains** → add your Vercel domain (e.g. your-store.vercel.app) and your own domain if you have one.
   7. **Firestore → Rules** → paste the firestore.rules text from further down in this file → Publish.
      **Storage → Rules** → paste the storage.rules text from further down in this file → Publish (if asked, allow Storage to read Firestore).

   ## 2. Server key for Vercel (lets api/index.js write orders safely)
   Firebase console → Project settings → **Service accounts → Generate new private key**. Keep that JSON file private.
   Vercel env var FIREBASE_SERVICE_ACCOUNT = the whole JSON contents.

   ## 3. PayU
   - PayU Client ID  = your **Merchant Key**  → paste into PAYU_CLIENT_ID in app.js (public) and also add it as Vercel env var PAYU_CLIENT_ID.
   - PayU Client Secret = your **Merchant Salt** → ONLY in Vercel env var PAYU_CLIENT_SECRET.
   - PAYU_MODE = test while testing, live when you go live (use your live key + salt then).

   ## 4. Deploy on Vercel
   Put these files in one folder: index.html, style.css, app.js, package.json, vercel.json, and the api/ folder (it holds just one file, api/index.js — the server part).
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

   ==========================  firestore.rules  ==========================
   (Firebase console -> Firestore Database -> Rules -> paste the text below -> Publish)

   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {

       function signedIn() { return request.auth != null; }
       function isOwner(uid) { return signedIn() && request.auth.uid == uid; }
       // An admin is anyone with a document at admins/{their uid}.
       // The first one is created by hand in the Firebase console (see SETUP.md).
       function isAdmin() { return signedIn() && exists(/databases/$(database)/documents/admins/$(request.auth.uid)); }

       match /settings/{id}   { allow read: if true; allow write: if isAdmin(); }
       match /categories/{id} { allow read: if true; allow write: if isAdmin(); }

       // Shoppers only ever see published products; admins see everything.
       match /products/{id} {
         allow read: if resource.data.status == 'published' || isAdmin();
         allow write: if isAdmin();
       }

       match /admins/{uid} {
         allow read: if isOwner(uid) || isAdmin();
         allow write: if isAdmin();
       }

       match /users/{uid} {
         allow read: if isOwner(uid) || isAdmin();
         allow create: if isOwner(uid)
           && request.resource.data.keys().hasOnly(['fullName', 'email', 'phone', 'provider', 'photoURL', 'createdAt', 'updatedAt'])
           && request.resource.data.email == request.auth.token.email;
         allow update: if isOwner(uid)
           && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['fullName', 'phone', 'photoURL', 'updatedAt']);
       }

       match /addresses/{id} {
         allow read: if signedIn() && (resource.data.userId == request.auth.uid || isAdmin());
         allow create: if signedIn() && request.resource.data.userId == request.auth.uid;
         allow update: if signedIn() && resource.data.userId == request.auth.uid && request.resource.data.userId == request.auth.uid;
         allow delete: if signedIn() && resource.data.userId == request.auth.uid;
       }

       // Orders are created and paid-confirmed ONLY by the server (api/index.js).
       // Shoppers can read their own; only admins can change status / tracking.
       match /orders/{id} {
         allow read: if signedIn() && (resource.data.userId == request.auth.uid || isAdmin());
         allow create, delete: if false;
         allow update: if isAdmin();
       }

       // Reviews are created only by the server (api/index.js), after checking the order was delivered.
       match /reviews/{id} {
         allow read: if resource.data.visible == true
           || (signedIn() && resource.data.userId == request.auth.uid)
           || isAdmin();
         allow create: if false;
         allow update, delete: if isAdmin();
       }

       // meta/* (order counter) is server-only: no client rule = no access.
     }
   }

   ==========================  storage.rules  ==========================
   (Firebase console -> Storage -> Rules -> paste the text below -> Publish)

   rules_version = '2';
   service firebase.storage {
     match /b/{bucket}/o {

       function isImage() { return request.resource.contentType.matches('image/.*') && request.resource.size < 5 * 1024 * 1024; }
       function isAdmin() { return request.auth != null && firestore.exists(/databases/(default)/documents/admins/$(request.auth.uid)); }

       // Product photos, category images, banners, logo: public to read, admin-only to change
       match /products/{allPaths=**} {
         allow read: if true;
         allow create, update: if isAdmin() && isImage();
         allow delete: if isAdmin();
       }
       match /site/{allPaths=**} {
         allow read: if true;
         allow create, update: if isAdmin() && isImage();
         allow delete: if isAdmin();
       }

       // Shopper review photos and profile pictures: each shopper can only write to their own folder
       match /reviews/{uid}/{allPaths=**} {
         allow read: if true;
         allow create: if request.auth != null && request.auth.uid == uid && isImage();
         allow delete: if isAdmin();
       }
       match /avatars/{uid}/{allPaths=**} {
         allow read: if true;
         allow create, update: if request.auth != null && request.auth.uid == uid && isImage();
         allow delete: if request.auth != null && request.auth.uid == uid;
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
  apiKey: "PASTE_YOUR_FIREBASE_API_KEY",
  authDomain: "PASTE_YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "PASTE_YOUR_PROJECT_ID",
  storageBucket: "PASTE_YOUR_STORAGE_BUCKET",
  messagingSenderId: "PASTE_YOUR_SENDER_ID",
  appId: "PASTE_YOUR_APP_ID",
};

// Your PayU Client ID (merchant key). Public by design.
// The Client Secret (salt) must ONLY live in Vercel -> Environment Variables as PAYU_CLIENT_SECRET.
const PAYU_CLIENT_ID = "PASTE_YOUR_PAYU_CLIENT_ID";

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
const admin = require("firebase-admin");

/* ---------------------------- helpers ---------------------------- */
function httpError(status, message) { const e = new Error(message); e.status = status; return e; }

function firebase() {
  if (admin.apps.length) return admin;
  let raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw httpError(503, "The store server isn't configured yet (missing FIREBASE_SERVICE_ACCOUNT).");
  raw = raw.trim();
  if (!raw.startsWith("{")) raw = Buffer.from(raw, "base64").toString("utf8");
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
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
const BULK_DISCOUNT_MIN_QTY = 2;
const BULK_DISCOUNT_RATE = 0.10;
const COD_HANDLING_FEE = 15;
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

function calculateOrderPricing(items, paymentMethod, settings) {
  const totalQty = items.reduce((s, it) => s + it.quantity, 0);
  const subtotal = round2(items.reduce((s, it) => s + it.unitPrice * it.quantity, 0));
  const discount = totalQty >= BULK_DISCOUNT_MIN_QTY ? round2(subtotal * BULK_DISCOUNT_RATE) : 0;
  const afterDiscount = round2(subtotal - discount);
  const shipping = calculateShipping(items, afterDiscount, settings);
  const total = round2(afterDiscount + shipping);
  const isCod = paymentMethod === "cod";
  const codAdvance = isCod ? round2(items.reduce((s, it) => s + (Number(it.codAdvancePerUnit) || 0) * it.quantity, 0)) : 0;
  const codFee = isCod ? COD_HANDLING_FEE : 0;
  return { subtotal, discount, shipping, total, codAdvance, codFee, codRemaining: isCod ? round2(total - codAdvance) : 0, payNow: isCod ? round2(codAdvance + codFee) : total };
}

/* ---------------------------- GET /api : PayU status ---------------------------- */
function payuStatus(req, res) {
  res.status(200).json({
    configured: !!(process.env.PAYU_CLIENT_ID && process.env.PAYU_CLIENT_SECRET),
    mode: process.env.PAYU_MODE === "live" ? "live" : "test",
    firebaseAdmin: !!process.env.FIREBASE_SERVICE_ACCOUNT,
  });
}

/* ---------------------------- action: payu-create ---------------------------- */
async function payuCreate(req, res) {
  const user = await verifyUser(req);
  const body = req.body || {};
  const key = process.env.PAYU_CLIENT_ID || body.clientId;
  const salt = process.env.PAYU_CLIENT_SECRET;
  if (!key || !salt || /^PASTE_/.test(String(key))) throw httpError(503, "Online payments aren't set up yet. Please contact the store.");

  const paymentMethod = body.paymentMethod === "cod" ? "cod" : "online";
  const lines = Array.isArray(body.items) ? body.items : [];
  if (!lines.length || lines.length > 50) throw httpError(400, "Your cart is empty.");

  const db = firebase().firestore();
  const addrSnap = await db.collection("addresses").doc(String(body.addressId || "-")).get();
  if (!addrSnap.exists || addrSnap.data().userId !== user.uid) throw httpError(400, "Please choose a valid delivery address.");
  const address = { id: addrSnap.id, ...addrSnap.data() };
  const settings = (await db.collection("settings").doc("store").get()).data() || {};

  // Every price, stock level and COD rule is re-read from Firestore — never trusted from the browser.
  const items = [], seen = new Set();
  for (const line of lines) {
    const quantity = Number(line.quantity);
    if (!line.productId || !Number.isInteger(quantity) || quantity < 1 || quantity > 100) throw httpError(400, "One of the cart quantities isn't valid.");
    const lineKey = `${line.productId}::${line.variantId || ""}`;
    if (seen.has(lineKey)) throw httpError(400, "The same item appears twice in the cart. Please refresh and try again.");
    seen.add(lineKey);

    const snap = await db.collection("products").doc(String(line.productId)).get();
    if (!snap.exists || snap.data().status !== "published") throw httpError(409, "An item in your cart is no longer available. Please remove it and try again.");
    const p = { id: snap.id, ...snap.data() };
    const variant = line.variantId ? (p.variants || []).find((v) => v.variantId === line.variantId) : null;
    if (line.variantId && !variant) throw httpError(409, `"${p.name}" changed. Please remove it from the cart and add it again.`);
    const stock = Number(variant ? variant.stock : p.stock) || 0;
    if (stock < quantity) throw httpError(409, stock > 0 ? `Only ${stock} left of "${p.name}". Please reduce the quantity.` : `"${p.name}" is out of stock.`);

    items.push({
      productId: p.id, variantId: line.variantId || null, quantity,
      productName: p.name, brand: p.brand || "", sku: (variant && variant.sku) || p.sku || "",
      variant: variant ? [variant.color, variant.size].filter(Boolean).join(" / ") : "",
      unitPrice: Number(variant ? variant.price : p.price) || 0, mrp: Number(variant ? variant.mrp : p.mrp) || 0,
      codAvailable: !!p.codAvailable, codAdvancePerUnit: Number(variant ? variant.codAdvancePerUnit : p.codAdvancePerUnit) || 0,
      freeShipping: !!p.freeShipping, shippingCharge: p.shippingCharge,
      image: (p.images && p.images[0] && p.images[0].url) || "",
    });
  }
  if (paymentMethod === "cod" && items.some((it) => !it.codAvailable)) throw httpError(400, "Cash on Delivery isn't available for one of the items in your cart.");

  const pricing = calculateOrderPricing(items, paymentMethod, settings);
  const amountToPay = pricing.payNow;
  if (!(amountToPay >= 1)) throw httpError(400, "The amount to pay isn't valid.");

  const orderId = await db.runTransaction(async (tx) => {
    const ref = db.collection("meta").doc("orderCounter");
    const snap = await tx.get(ref);
    const n = (snap.exists ? snap.data().n : 0) + 1;
    tx.set(ref, { n });
    return "ORD" + (100000 + n);
  });

  const now = Date.now();
  await db.collection("orders").doc(orderId).set({
    orderId, userId: user.uid, customerEmail: user.email || "",
    items: items.map((it) => ({
      productId: it.productId, variantId: it.variantId, productName: it.productName, brand: it.brand, sku: it.sku, variant: it.variant,
      quantity: it.quantity, unitPrice: it.unitPrice, mrp: it.mrp, discount: round2(Math.max(0, it.mrp - it.unitPrice) * it.quantity),
      codAdvancePerUnit: it.codAdvancePerUnit, itemTotal: round2(it.unitPrice * it.quantity), itemCodAdvance: round2(it.codAdvancePerUnit * it.quantity), image: it.image,
    })),
    shippingAddressSnapshot: address,
    pricing: { subtotal: pricing.subtotal, discount: pricing.discount, shipping: pricing.shipping, total: pricing.total, codFee: pricing.codFee, codAdvance: pricing.codAdvance, codRemaining: pricing.codRemaining },
    payment: { method: paymentMethod, status: "pending", transactionId: "", paidAmount: 0, expectedAmount: amountToPay },
    courier: { name: "", trackingNumber: "", trackingUrl: "", shipmentDate: "", estimatedDelivery: "" },
    orderStatus: "payment_pending", estimatedDelivery: "", isBuyNow: !!body.isBuyNow,
    createdAt: now, updatedAt: now,
    statusHistory: [{ status: "payment_pending", note: "", at: now, by: "system" }],
  });

  const origin = siteOrigin(req);
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
    const FieldValue = admin.firestore.FieldValue;
    const orderRef = db.collection("orders").doc(orderId);

    const outcome = await db.runTransaction(async (tx) => {
      const snap = await tx.get(orderRef);
      if (!snap.exists) return "missing";
      const order = snap.data();
      if (order.payment.status !== "pending") return order.payment.status === "failed" ? "failed" : "paid"; // already handled

      const now = Date.now();
      const paidOk = status === "success" && Math.abs(Number(b.amount) - Number(order.payment.expectedAmount)) < 0.01;
      if (!paidOk) {
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
          if (v) { if ((Number(v.stock) || 0) < it.quantity) stockNote = "Stock ran short — please check inventory."; v.stock = Math.max(0, (Number(v.stock) || 0) - it.quantity); }
        } else {
          if ((Number(p.stock) || 0) < it.quantity) stockNote = "Stock ran short — please check inventory.";
          p.stock = Math.max(0, (Number(p.stock) || 0) - it.quantity);
        }
      }
      for (const ref of productRefs) {
        const p = products.get(ref.id); if (!p) continue;
        tx.update(ref, { stock: p.stock ?? 0, variants: p.variants || [], updatedAt: now });
      }
      tx.update(orderRef, {
        "payment.status": order.payment.method === "cod" ? "cod_advance_paid" : "paid",
        "payment.transactionId": String(b.mihpayid || b.txnid), "payment.paidAmount": Number(b.amount), "payment.paidAt": now,
        orderStatus: "pending_admin_confirmation", updatedAt: now,
        statusHistory: FieldValue.arrayUnion({ status: "pending_admin_confirmation", note: ["Payment received", stockNote].filter(Boolean).join(". "), at: now, by: "system" }),
      });
      return "paid";
    });

    if (outcome === "paid") return redirect(res, `${site}/#/order-details?id=${encodeURIComponent(orderId)}&placed=1`);
    return redirect(res, failedUrl);
  } catch (err) {
    console.error(err);
    return redirect(res, failedUrl);
  }
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

/* ---------------------------- the one entry point ---------------------------- */
return async (req, res) => {
  try {
    if (req.method === "GET") return payuStatus(req, res);
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
    const b = req.body && typeof req.body === "object" ? req.body : {};
    if (b.txnid && b.hash && !b.action) return await payuCallback(req, res);   // PayU's own result post
    if (b.action === "payu-create") return await payuCreate(req, res);
    if (b.action === "review") return await addReview(req, res);
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
    getAuth = firebaseMissing, onAuthStateChanged = firebaseMissing, signInWithEmailAndPassword = firebaseMissing,
    createUserWithEmailAndPassword = firebaseMissing, fbSignOut = firebaseMissing, GoogleAuthProvider = firebaseMissing,
    signInWithPopup = firebaseMissing, sendPasswordResetEmail = firebaseMissing, updateProfile = firebaseMissing,
    updatePassword = firebaseMissing, reauthenticateWithCredential = firebaseMissing, EmailAuthProvider = {},
    initializeFirestore = firebaseMissing, collection = firebaseMissing, doc = firebaseMissing, getDoc = firebaseMissing,
    getDocs = firebaseMissing, setDoc = firebaseMissing, updateDoc = firebaseMissing, deleteDoc = firebaseMissing,
    onSnapshot = firebaseMissing, query = firebaseMissing, where = firebaseMissing, arrayUnion = firebaseMissing,
    getStorage = firebaseMissing, storageRef = firebaseMissing, uploadBytes = firebaseMissing, getDownloadURL = firebaseMissing;
  try {
    const fbBase = "https://www.gstatic.com/firebasejs/10.14.1/";
    const [appM, authM, fsM, stM] = await Promise.all([
      import(fbBase + "firebase-app.js"), import(fbBase + "firebase-auth.js"),
      import(fbBase + "firebase-firestore.js"), import(fbBase + "firebase-storage.js"),
    ]);
    ({ initializeApp } = appM);
    ({ getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut: fbSignOut,
       GoogleAuthProvider, signInWithPopup, sendPasswordResetEmail, updateProfile, updatePassword,
       reauthenticateWithCredential, EmailAuthProvider } = authM);
    ({ initializeFirestore, collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, onSnapshot, query, where, arrayUnion } = fsM);
    ({ getStorage, ref: storageRef, uploadBytes, getDownloadURL } = stM);
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
// Bulk quantity discount: buy 2 or more items in total, get 10% off.
const BULK_DISCOUNT_MIN_QTY = 2;
const BULK_DISCOUNT_RATE = 0.10;
// Cash on Delivery handling fee: flat ₹15, collected together with the
// advance (paid online via PayU) — never added to what's collected at delivery.
// NOTE: api/payu/create.js uses the same numbers. Change both together.
const COD_HANDLING_FEE = 15;

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
   The exact rules as specified:
   - Buy 2 or more items (combined quantity across the cart) → automatic
     10% off the subtotal. Shown to the shopper before they place the order.
   - Cash on Delivery: a flat ₹15 handling fee, charged together with the
     advance (paid online via PayU) — never added to the pay-at-delivery
     amount. So choosing COD adds ₹15 to what the shopper pays in total.
   - The existing per-unit COD advance system is unchanged: each product
     can set its own advance-per-unit; COD is blocked for the whole order
     if any item in the cart doesn't support COD.
   All figures the shopper can see (advance / pay-at-delivery / COD fee /
   discount) come from this one function so every screen agrees.
   ========================================================================== */

function lineTotal(item) { return item.unitPrice * item.quantity; }

function calculateBulkDiscount(items) {
  const totalQty = items.reduce((sum, it) => sum + it.quantity, 0);
  const subtotal = items.reduce((sum, it) => sum + lineTotal(it), 0);
  const qualifies = totalQty >= BULK_DISCOUNT_MIN_QTY;
  const discount = qualifies ? round2(subtotal * BULK_DISCOUNT_RATE) : 0;
  return { qualifies, discount, totalQty };
}

function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }

function calculateCodAdvance(items) {
  return round2(items.reduce((sum, it) => sum + (Number(it.codAdvancePerUnit) || 0) * it.quantity, 0));
}

function codBlockedItems(items) {
  return items.filter((it) => !it.codAvailable);
}

function calculateShipping(items, subtotalAfterDiscount, settings) {
  const s = settings || {};
  const allFreeShipping = items.length > 0 && items.every((it) => it.freeShipping);
  const threshold = Number(s.freeShippingThreshold);
  const overThreshold = threshold > 0 && subtotalAfterDiscount >= threshold;
  if (allFreeShipping || overThreshold) return 0;
  // Only items that explicitly set their own shippingCharge opt out of the
  // site default — an unset value means "use the site default", not ₹0.
  const explicitCharges = items
    .filter((it) => !it.freeShipping && it.shippingCharge !== undefined && it.shippingCharge !== null && it.shippingCharge !== "")
    .map((it) => Number(it.shippingCharge) || 0);
  if (explicitCharges.length) return round2(Math.max(...explicitCharges));
  return round2(Number(s.defaultShippingCharge) || 0);
}

/**
 * The single source of truth for order pricing. `items` is an array of
 * { unitPrice, quantity, codAvailable, codAdvancePerUnit, freeShipping, shippingCharge }.
 * `paymentMethod` is 'online' or 'cod'.
 */
function calculateOrderPricing(items, paymentMethod, settings) {
  const { discount, qualifies: discountApplied, totalQty } = calculateBulkDiscount(items);
  const subtotal = round2(items.reduce((sum, it) => sum + lineTotal(it), 0));
  const afterDiscount = round2(subtotal - discount);
  const shipping = calculateShipping(items, afterDiscount, settings);
  const total = round2(afterDiscount + shipping);

  const isCod = paymentMethod === "cod";
  const blocked = codBlockedItems(items);
  const codAdvance = isCod ? calculateCodAdvance(items) : 0;
  const codFee = isCod ? COD_HANDLING_FEE : 0;
  const codRemaining = isCod ? round2(total - codAdvance) : 0;
  const payNow = isCod ? round2(codAdvance + codFee) : total;
  // Grand total is what the shopper ultimately pays across both payments —
  // for COD that's the order total PLUS the flat handling fee.
  const grandTotal = isCod ? round2(total + codFee) : total;

  return {
    subtotal, discount, discountApplied, discountRate: BULK_DISCOUNT_RATE, totalQty,
    shipping, total,
    paymentMethod, codBlocked: blocked, codBlockedNames: blocked.map((b) => b.productName || b.name),
    codAdvance, codFee, codRemaining, payNow, grandTotal,
  };
}

/* ==========================================================================
   4. FIREBASE + DATA LAYER
   The pages call DB.* synchronously. Behind that, Firestore listeners keep an
   in-memory cache fresh in real time, and every write goes to Firestore at
   once (a failed write shows an error and the cache snaps back to the truth).
   ========================================================================== */
const CONFIG_FILLED = !Object.values(FIREBASE_CONFIG).some((v) => /^PASTE_/.test(String(v)));
let fbApp, fbAuth, fbDb, fbStorage;
if (!FIREBASE_ERROR && CONFIG_FILLED) {
  try {
    fbApp = initializeApp(FIREBASE_CONFIG);
    fbAuth = getAuth(fbApp);
    fbDb = initializeFirestore(fbApp, { ignoreUndefinedProperties: true, experimentalAutoDetectLongPolling: true });
    fbStorage = getStorage(fbApp);
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
  profile: null, users: [], admins: [], addresses: [], orders: [], reviews: [], publicReviews: {},
};

const docsOf = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));

function normalizeCategory(c) {
  return { parentId: null, image: "", sortOrder: 0, active: true, description: "", featured: false, ...c, slug: c.slug || slugify(c.name || c.id) };
}
function normalizeProduct(p) {
  const out = {
    sku: "", productCode: "", shortDescription: "", description: "", brand: "", lowStockThreshold: 5,
    hasVariants: false, material: "", dimensions: "", weight: "", countryOfOrigin: "", manufacturer: "", packContents: "",
    warranty: "", returnPolicy: "", deliveryDaysMin: 3, deliveryDaysMax: 7, freeShipping: false,
    seoTitle: "", metaDescription: "", keywords: "", status: "draft", codAvailable: false, codAdvancePerUnit: 0,
    mrp: 0, price: 0, stock: 0, ...p,
  };
  ["images", "variants", "flags", "tags", "highlights", "specifications", "offers"].forEach((k) => { if (!Array.isArray(out[k])) out[k] = []; });
  out.slug = out.slug || slugify(out.name || out.id || "");
  out.rating = out.rating && typeof out.rating === "object" ? { average: Number(out.rating.average) || 0, count: Number(out.rating.count) || 0 } : { average: 0, count: 0 };
  out.reviewCount = out.rating.count;
  out.createdAt = Number(out.createdAt) || 0; out.updatedAt = Number(out.updatedAt) || 0;
  out.discountPercent = out.mrp > 0 ? Math.max(0, Math.round(((out.mrp - out.price) / out.mrp) * 100)) : 0;
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
  const path = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
  const r = storageRef(fbStorage, path);
  await uploadBytes(r, blob, { contentType: "image/jpeg", cacheControl: "public,max-age=31536000" });
  return getDownloadURL(r);
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
    getProducts, getAllProducts, getProductById, getRelatedProducts, getAllBrands, saveProduct, deleteProduct,
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
  const Session = { fbUser: null, isAdmin: false };
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
      try { Session.isAdmin = (await getDoc(doc(fbDb, "admins", fbUser.uid))).exists(); } catch { Session.isAdmin = false; }
      await startUser(fbUser.uid, Session.isAdmin);
    }
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
      const cred = await signInWithPopup(fbAuth, new GoogleAuthProvider());
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

  return { currentUser, isAdmin, onChange, signIn, signUp, signInWithGoogle, signOut, sendPasswordReset, changePassword, ready, watchFirebaseAuth };
})();

/* ---- Startup: connect to Firebase and load what the first page needs ---- */
const Backend = {
  async init() {
    const banner = document.getElementById("appOffline");
    if (!FIREBASE_READY) {
      if (banner) {
        banner.textContent = FIREBASE_ERROR
          ? "Firebase couldn't start: " + FIREBASE_ERROR + ". Check the FIREBASE_CONFIG values at the top of app.js."
          : "This store isn't connected to Firebase yet. Open app.js and paste ALL the values of your Firebase config at the top.";
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

  function lineKey(productId, variantId) { return productId + "::" + (variantId || ""); }

  function getItems() {
    return raw().map((it) => {
      const p = DB.getProductById(it.productId);
      if (!p) return null;
      const variant = it.variantId ? p.variants.find((v) => v.variantId === it.variantId) : null;
      if (it.variantId && !variant) return null;
      const stock = variant ? variant.stock : p.stock;
      return {
        productId: p.id, variantId: it.variantId || null, product: p, variant,
        quantity: Math.min(it.quantity, Math.max(stock, 0)) || it.quantity,
        unitPrice: variant ? variant.price : p.price,
        mrp: variant ? variant.mrp : p.mrp,
        discountPercent: variant ? variant.discountPercent ?? p.discountPercent : p.discountPercent,
        codAvailable: p.codAvailable, codAdvancePerUnit: variant ? variant.codAdvancePerUnit : p.codAdvancePerUnit,
        freeShipping: p.freeShipping, shippingCharge: p.shippingCharge,
        stock, productName: p.name, image: (p.images[0] && p.images[0].url) || "",
      };
    }).filter(Boolean);
  }

  function count() { return raw().reduce((s, it) => s + it.quantity, 0); }

  function add(productId, variantId, quantity = 1) {
    const items = raw();
    const key = lineKey(productId, variantId);
    const existing = items.find((it) => lineKey(it.productId, it.variantId) === key);
    if (existing) existing.quantity += quantity;
    else items.push({ productId, variantId: variantId || null, quantity });
    set(items);
  }
  function setQuantity(productId, variantId, quantity) {
    let items = raw();
    const key = lineKey(productId, variantId);
    if (quantity <= 0) items = items.filter((it) => lineKey(it.productId, it.variantId) !== key);
    else { const line = items.find((it) => lineKey(it.productId, it.variantId) === key); if (line) line.quantity = quantity; }
    set(items);
  }
  function remove(productId, variantId) { setQuantity(productId, variantId, 0); }
  function clear() { set([]); }
  function replaceForBuyNow(productId, variantId, quantity) { writeLS(LS_KEYS.cart + "_buynow", [{ productId, variantId, quantity }]); }
  function consumeBuyNow() { const v = readLS(LS_KEYS.cart + "_buynow", null); localStorage.removeItem(LS_KEYS.cart + "_buynow"); return v; }

  return { getItems, count, add, setQuantity, remove, clear, replaceForBuyNow, consumeBuyNow };
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
  const name = DB.getSettings().storeName || STORE_NAME;
  $$("[data-store-name]").forEach((el) => (el.textContent = name));
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
      if (!user.isAdmin) { await Auth.signOut(); throw new Error("This account doesn't have admin access."); }
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
      if (product.hasVariants) { location.hash = buildHash("/product", { id }); return; }
      Cart.add(id, null, 1);
      toast(`${product.name} added to cart`, "success");
      return;
    }

    if (action === "move-to-cart") {
      const card = btn.closest("[data-wishlist-card]");
      const id = card?.dataset.id;
      const product = id && DB.getProductById(id);
      if (!product) return;
      if (product.hasVariants) { location.hash = buildHash("/product", { id }); return; }
      Cart.add(id, null, 1); Wishlist.remove(id); card.remove();
      toast("Moved to cart", "success");
      return;
    }

    if (action === "remove-item" || action === "move-to-wishlist") {
      const row = btn.closest("[data-cart-item]");
      const { id: pid, variantId } = row.dataset;
      if (action === "move-to-wishlist") Wishlist.toggle(pid);
      Cart.remove(pid, variantId || null);
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
        Cart.setQuantity(row.dataset.id, row.dataset.variantId || null, val);
        document.dispatchEvent(new CustomEvent("cart:linechange"));
      }
      document.dispatchEvent(new CustomEvent("qty:change", { detail: { wrap, value: val } }));
    }
  });
}

function openShareDialog() {
  const dlg = $("#shareDialog");
  if (!dlg) return;
  const url = location.href;
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
  let reviews = DB.getReviewsForProduct(product.id);
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
  if (product.returnPolicy) { host.querySelector("#returnSection").hidden = false; host.querySelector("#productReturnPolicy").innerHTML = `<p>${escapeHtml(product.returnPolicy)}</p>`; }
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
    const advancePerUnit = currentVariant ? currentVariant.codAdvancePerUnit : product.codAdvancePerUnit;
    host.querySelector("#codInfo").hidden = !codAvailable || !advancePerUnit;
    if (codAvailable && advancePerUnit) host.querySelector("#codAdvancePerUnit").textContent = formatMoney(advancePerUnit);

    const images = currentImages();
    gallery.setImages(images, product.name);

    const addBtn = host.querySelector("#addToCartBtn"), buyBtn = host.querySelector("#buyNowBtn");
    const needsSelection = product.hasVariants && !currentVariant;
    const disabled = stock === 0 || needsSelection;
    addBtn.disabled = disabled; buyBtn.disabled = disabled;
    addBtn.textContent = needsSelection ? "Select options" : stock === 0 ? "Out of stock" : "Add to cart";

    updateTotals(advancePerUnit, codAvailable);
  }

  function updateTotals(advancePerUnit, codAvailable) {
    const qty = Number(host.querySelector("#productQty").value) || 1;
    const price = currentVariant ? currentVariant.price : product.price;
    host.querySelector("#lineTotal").textContent = formatMoney(price * qty);
    const codLine = host.querySelector("#codLine");
    if (codAvailable && advancePerUnit) {
      codLine.hidden = false;
      host.querySelector("#codQtyLabel").textContent = qty === 1 ? "1 unit" : `${qty} units`;
      host.querySelector("#codAdvanceTotal").textContent = formatMoney(advancePerUnit * qty);
    } else codLine.hidden = true;
  }

  host.querySelector("#colorOptions")?.addEventListener("click", (e) => { const b = e.target.closest("[role=radio]"); if (b) { selected.color = b.dataset.value; renderVariantUI(); updateForVariant(); } });
  host.querySelector("#sizeOptions")?.addEventListener("click", (e) => { const b = e.target.closest("[role=radio]"); if (b) { selected.size = b.dataset.value; renderVariantUI(); updateForVariant(); } });
  host.querySelector("#productQty")?.addEventListener("change", () => updateForVariant());
  document.addEventListener("qty:change", (e) => { if (host.contains(e.detail.wrap)) updateForVariant(); }, { once: false });

  if (product.hasVariants) { const init = pickInitialVariant(); selected.color = init?.color || null; selected.size = init?.size || null; }
  renderVariantUI();
  updateForVariant();

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
  const reviews = DB.getReviewsForProduct(product.id);
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
  if (eligibleOrder) { writeBtn.hidden = false; writeBtn.addEventListener("click", () => openReviewDialog(host, product, eligibleOrder, () => { renderReviews("recent"); renderRatingSummary(host, product); })); }

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
      root.dataset.id = it.productId; root.dataset.variantId = it.variantId || "";
      const href = buildHash("/product", { id: it.productId });
      node.querySelector('[data-field="link"]').href = href;
      if (it.image) node.querySelector('[data-field="image"]').src = it.image;
      node.querySelector('[data-field="brand"]').textContent = it.product.brand;
      const titleLink = node.querySelector('[data-field="titleLink"]'); titleLink.textContent = it.productName; titleLink.href = href;
      const variantText = it.variant ? [it.variant.color, it.variant.size].filter(Boolean).join(" / ") : "";
      node.querySelector('[data-field="variant"]').textContent = variantText;
      node.querySelector('[data-field="price"]').textContent = formatMoney(it.unitPrice);
      if (it.mrp > it.unitPrice) { const m = node.querySelector('[data-field="mrp"]'); m.hidden = false; m.textContent = formatMoney(it.mrp); const d = node.querySelector('[data-field="discountText"]'); d.hidden = false; d.textContent = it.discountPercent + "% off"; }
      const qtyInput = node.querySelector('[data-field="qty"]'); qtyInput.value = it.quantity; qtyInput.max = it.stock || 1; qtyInput.dataset.max = it.stock || 1;
      if (it.quantity > it.stock) { const n = node.querySelector('[data-field="notice"]'); n.hidden = false; n.textContent = `Only ${it.stock} left — quantity adjusted`; }
      if (it.codAvailable && it.codAdvancePerUnit) { const c = node.querySelector('[data-field="codAdvance"]'); c.hidden = false; c.textContent = `COD advance: ${formatMoney(it.codAdvancePerUnit * it.quantity)}`; }
      node.querySelector('[data-field="lineTotal"]').textContent = formatMoney(it.unitPrice * it.quantity);
      list.appendChild(node);
    });

    const pricing = calculateOrderPricing(items, "online", DB.getSettings());
    host.querySelector("#cartSubtotal").textContent = formatMoney(pricing.subtotal);
    const discountRow = host.querySelector("#cartDiscount").closest(".summary-row");
    if (pricing.discountApplied) { discountRow.hidden = false; host.querySelector("#cartDiscount").textContent = "−" + formatMoney(pricing.discount); }
    else discountRow.hidden = true;
    host.querySelector("#cartShipping").textContent = pricing.shipping === 0 ? "Free" : formatMoney(pricing.shipping);
    host.querySelector("#cartTotal").textContent = formatMoney(pricing.total);

    const codItems = items.filter((it) => it.codAvailable);
    const codNote = host.querySelector("#cartCodNote");
    if (codItems.length === items.length && items.length) {
      const codPricing = calculateOrderPricing(items, "cod", DB.getSettings());
      codNote.hidden = false;
      host.querySelector("#cartCodAdvance").textContent = formatMoney(codPricing.codAdvance + codPricing.codFee);
    } else codNote.hidden = true;

    if (!discountRow.hidden === false) { /* no-op, chip already shown via summary row */ }
    showBulkDiscountNote(host, pricing);
  }
  render();
  document.addEventListener("cart:linechange", render);
  return () => document.removeEventListener("cart:linechange", render);
};

function showBulkDiscountNote(host, pricing) {
  const el = host.querySelector("#bulkDiscountNote");
  if (!el) return;
  if (pricing.discountApplied) el.textContent = `10% bulk discount applied — you're buying ${pricing.totalQty} items.`;
  else el.textContent = `Buy ${BULK_DISCOUNT_MIN_QTY} or more items and get ${Math.round(BULK_DISCOUNT_RATE * 100)}% off — applied automatically.`;
  el.hidden = false;
}

/* ---- Checkout: the pricing rules must be exactly right and always visible ---- */
PageControllers.checkout = function (host, params) {
  const buyNow = params.get("mode") === "buynow" ? Cart.consumeBuyNow() : null;
  const cartItems = buyNow ? buyNowToItems(buyNow) : Cart.getItems();
  if (params.get("payment") === "failed") host.querySelector("#paymentStatusBanner").hidden = false;
  const empty = host.querySelector("#checkoutEmpty"), form = host.querySelector("#checkoutForm");
  if (!cartItems.length) { empty.hidden = false; form.hidden = true; return; }
  empty.hidden = true; form.hidden = false;
  if (buyNow) host.querySelector("#checkoutModeNote").hidden = false, (host.querySelector("#checkoutModeNote").textContent = "Buying this item now — your cart is unaffected.");

  const user = Auth.currentUser();
  const settings = DB.getSettings();
  let selectedAddressId = null, paymentMethod = "online";

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
  function renderPricing() {
    const pricing = calculateOrderPricing(cartItems, paymentMethod, settings);
    host.querySelector("#checkoutSubtotal").textContent = formatMoney(pricing.subtotal);
    const discountRow = host.querySelector("#checkoutDiscount").closest(".summary-row");
    discountRow.hidden = !pricing.discountApplied;
    if (pricing.discountApplied) host.querySelector("#checkoutDiscount").textContent = "−" + formatMoney(pricing.discount);
    host.querySelector("#checkoutShipping").textContent = pricing.shipping === 0 ? "Free" : formatMoney(pricing.shipping);
    host.querySelector("#checkoutTotal").textContent = formatMoney(pricing.total);
    showBulkDiscountNote(host, pricing);

    const codBox = host.querySelector("#codBreakdown");
    codBox.hidden = paymentMethod !== "cod";
    if (paymentMethod === "cod") {
      host.querySelector("#codOrderTotal").textContent = formatMoney(pricing.total);
      host.querySelector("#codAdvanceAmount").textContent = formatMoney(pricing.codAdvance);
      host.querySelector("#codFeeAmount").textContent = formatMoney(pricing.codFee);
      host.querySelector("#codPayNow").textContent = formatMoney(pricing.payNow);
      host.querySelector("#codPayAtDelivery").textContent = formatMoney(pricing.codRemaining);
    }
    const label = host.querySelector("#placeOrderLabel");
    label.textContent = paymentMethod === "cod" ? `Pay ${formatMoney(pricing.payNow)} & place COD order` : `Pay ${formatMoney(pricing.grandTotal)} securely`;
    return pricing;
  }
  host.querySelectorAll('input[name="paymentMethod"]').forEach((r) => r.addEventListener("change", (e) => { paymentMethod = e.target.value; renderPricing(); updatePlaceOrderState(); }));

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
    const pricing = renderPricing();
    placeOrder({ address, items: cartItems, paymentMethod, isBuyNow: !!buyNow });
  });
};

function buyNowToItems(buyNow) {
  return buyNow.map((b) => {
    const p = DB.getProductById(b.productId);
    if (!p) return null;
    const variant = b.variantId ? p.variants.find((v) => v.variantId === b.variantId) : null;
    return {
      productId: p.id, variantId: b.variantId || null, product: p, variant, quantity: b.quantity,
      unitPrice: variant ? variant.price : p.price, mrp: variant ? variant.mrp : p.mrp,
      discountPercent: variant ? variant.discountPercent ?? p.discountPercent : p.discountPercent,
      codAvailable: p.codAvailable, codAdvancePerUnit: variant ? variant.codAdvancePerUnit : p.codAdvancePerUnit,
      freeShipping: p.freeShipping, shippingCharge: p.shippingCharge,
      stock: variant ? variant.stock : p.stock, productName: p.name, image: firstImage(p),
    };
  }).filter(Boolean);
}

function formatAddress(a) {
  return [a.houseFlat, a.road, a.villageTown, a.area, a.city, a.district, a.state, a.pin].filter(Boolean).join(", ");
}

let placingOrder = false;
async function placeOrder({ address, items, paymentMethod, isBuyNow }) {
  if (placingOrder) return;
  const overlay = $("#paymentOverlay"), errorEl = $("#checkoutError");
  placingOrder = true; overlay.hidden = false; errorEl.hidden = true;
  try {
    // The server re-reads every price and stock level from Firestore, creates the
    // order and signs the PayU request with the secret. We only send what was chosen.
    const res = await Api.post("/api", {
      action: "payu-create", clientId: PAYU_CLIENT_ID, paymentMethod, addressId: address.id, isBuyNow: !!isBuyNow,
      items: items.map((it) => ({ productId: it.productId, variantId: it.variantId || null, quantity: it.quantity })),
    });
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
    errorEl.textContent = err.message || "We couldn't start the payment. Please try again.";
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
      node.querySelector('[data-field="text"]').textContent = statusLabel(o.orderStatus);
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

function statusLabel(status) { return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()); }

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
      const statusEl = node.querySelector('[data-field="status"]'); statusEl.textContent = statusLabel(o.orderStatus); statusEl.dataset.status = o.orderStatus;
      const itemsWrap = node.querySelector('[data-field="items"]');
      o.items.forEach((it) => { const t = thumbTpl.content.cloneNode(true); if (it.image) t.querySelector("img").src = it.image; t.querySelector('[data-field="name"]').textContent = it.productName; itemsWrap.appendChild(t); });
      node.querySelector('[data-field="total"]').textContent = formatMoney(o.pricing.total + (o.pricing.codFee || 0));
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
const STATUS_TO_STEP = { pending_admin_confirmation: "payment", confirmed: "confirmed", processing: "confirmed", packed: "packed", shipped: "shipped", out_for_delivery: "out_for_delivery", delivered: "delivered" };

PageControllers.orderDetails = function (host, params) {
  const id = params.get("id");
  const order = id && DB.getOrderById(id);
  const notFound = host.querySelector("#orderNotFound"), view = host.querySelector("#orderView");
  if (!order) { notFound.hidden = false; view.hidden = true; return; }
  notFound.hidden = true; view.hidden = false;

  if (params.get("placed") === "1") {
    if (!order.isBuyNow) Cart.clear();
    const banner = host.querySelector("#orderPlacedBanner"); banner.hidden = false;
    if (order.payment.method === "cod") host.querySelector("#orderPlacedText").textContent = `Your ${formatMoney(order.payment.paidAmount)} advance is confirmed. Pay ${formatMoney(order.pricing.total - order.pricing.codAdvance)} at delivery.`;
  }
  host.querySelector("#orderIdText").textContent = order.orderId;
  host.querySelector("#orderDate").textContent = formatDate(order.createdAt);
  const badge = host.querySelector("#orderStatusBadge"); badge.textContent = statusLabel(order.orderStatus); badge.dataset.status = order.orderStatus;

  if (["cancelled", "rejected", "returned"].includes(order.orderStatus)) {
    host.querySelector("#orderExceptionNotice").hidden = false;
    host.querySelector("#orderExceptionTitle").textContent = "Order " + statusLabel(order.orderStatus).toLowerCase();
    const lastNote = order.statusHistory[order.statusHistory.length - 1]?.note;
    host.querySelector("#orderExceptionText").textContent = lastNote || "Contact support if you have questions about this order.";
  }

  renderTimeline(host, order);
  if (order.courier?.trackingNumber) {
    host.querySelector("#courierName").textContent = order.courier.name || "—";
    host.querySelector("#trackingNumber").textContent = order.courier.trackingNumber;
    host.querySelector("#shipmentDate").textContent = formatDate(order.courier.shipmentDate);
    host.querySelector("#estimatedDelivery").textContent = formatDate(order.courier.estimatedDelivery);
    if (order.courier.trackingUrl) { const link = host.querySelector("#trackShipmentLink"); link.hidden = false; link.href = order.courier.trackingUrl; }
    else { const copy = host.querySelector("#copyTrackingBtn"); copy.hidden = false; copy.addEventListener("click", () => { navigator.clipboard.writeText(order.courier.trackingNumber); toast("Tracking number copied"); }); }
  }

  const itemsList = host.querySelector("#orderItems"); itemsList.innerHTML = "";
  const tpl = document.getElementById("tpl-order-item");
  order.items.forEach((it) => {
    const node = tpl.content.cloneNode(true);
    if (it.image) node.querySelector('[data-field="image"]').src = it.image;
    node.querySelector('[data-field="brand"]').textContent = it.brand;
    const titleLink = node.querySelector('[data-field="titleLink"]'); titleLink.textContent = it.productName; titleLink.href = buildHash("/product", { id: it.productId });
    node.querySelector('[data-field="variant"]').textContent = it.variant;
    node.querySelector('[data-field="qty"]').textContent = `Qty: ${it.quantity}`;
    node.querySelector('[data-field="price"]').textContent = formatMoney(it.unitPrice);
    if (it.mrp > it.unitPrice) { node.querySelector('[data-field="mrp"]').hidden = false; node.querySelector('[data-field="mrp"]').textContent = formatMoney(it.mrp); }
    node.querySelector('[data-field="lineTotal"]').textContent = formatMoney(it.itemTotal);
    if (order.orderStatus === "delivered") {
      const user = Auth.currentUser();
      if (user && !DB.hasReviewed(user.uid, it.productId, order.orderId)) {
        const link = node.querySelector('[data-field="reviewLink"]'); link.hidden = false;
        link.addEventListener("click", (e) => { e.preventDefault(); const p = DB.getProductById(it.productId); openReviewDialog(host, p, order, () => {}); });
      }
    }
    itemsList.appendChild(node);
  });

  host.querySelector("#shippingAddress").innerHTML = addressHtml(order.shippingAddressSnapshot);
  host.querySelector("#paymentMethodText").textContent = order.payment.method === "cod" ? "Cash on Delivery" : "Online payment";
  host.querySelector("#paymentStatusText").textContent = statusLabel(order.payment.status);
  host.querySelector("#paidAmount").textContent = formatMoney(order.payment.paidAmount);
  if (order.payment.method === "cod") {
    host.querySelector("#codAdvanceRow").hidden = false; host.querySelector("#orderCodAdvance").textContent = formatMoney(order.pricing.codAdvance);
    host.querySelector("#codRemainingRow").hidden = false; host.querySelector("#orderCodRemaining").textContent = formatMoney(order.pricing.total - order.pricing.codAdvance);
  }
  if (order.payment.transactionId) { host.querySelector("#transactionRow").hidden = false; host.querySelector("#transactionId").textContent = order.payment.transactionId; }
  host.querySelector("#orderSubtotal").textContent = formatMoney(order.pricing.subtotal);
  host.querySelector("#orderDiscount").textContent = "−" + formatMoney(order.pricing.discount);
  host.querySelector("#orderShipping").textContent = order.pricing.shipping === 0 ? "Free" : formatMoney(order.pricing.shipping);
  host.querySelector("#orderTotal").textContent = formatMoney(order.pricing.total + (order.pricing.codFee || 0));

  host.querySelector("#viewInvoiceBtn").addEventListener("click", () => openInvoice(order));
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
  $("#invDiscount", dlg).textContent = "−" + formatMoney(order.pricing.discount);
  $("#invShipping", dlg).textContent = order.pricing.shipping === 0 ? "Free" : formatMoney(order.pricing.shipping);
  $("#invTotal", dlg).textContent = formatMoney(order.pricing.total + (order.pricing.codFee || 0));
  $("#invPaymentMethod", dlg).textContent = order.payment.method === "cod" ? "Cash on Delivery" : "Online";
  $("#invPaid", dlg).textContent = formatMoney(order.payment.paidAmount);
  if (order.payment.method === "cod") { $("#invCodRow", dlg).hidden = false; $("#invCodRemaining", dlg).textContent = formatMoney(order.pricing.total - order.pricing.codAdvance); }
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
  const counts = { pending_admin_confirmation: 0, confirmed: 0, processing: 0, shipped: 0, delivered: 0, cancelled: 0 };
  orders.forEach((o) => { if (counts[o.orderStatus] != null) counts[o.orderStatus] += 1; });
  const setStat = (key, val) => { const el = host.querySelector(`[data-stat="${key}"]`); if (el) el.textContent = val; };
  setStat("totalProducts", allProducts.length);
  setStat("totalOrders", orders.length);
  setStat("pendingConfirmation", counts.pending_admin_confirmation);
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
    const codRemaining = inRange.filter((o) => o.payment.method === "cod").reduce((s, o) => s + (o.pricing.total - o.pricing.codAdvance), 0);
    host.querySelector('[data-sales="collected"]').textContent = formatMoney(collected);
    host.querySelector('[data-sales="orders"]').textContent = inRange.length;
    host.querySelector('[data-sales="codRemaining"]').textContent = formatMoney(codRemaining);
    host.querySelector('[data-sales="averageOrder"]').textContent = formatMoney(inRange.length ? collected / inRange.length : 0);
  }
  renderSales(7);
  host.querySelector("#salesRange").addEventListener("change", (e) => renderSales(Number(e.target.value)));

  const pendingList = host.querySelector("#pendingOrdersList"); pendingList.innerHTML = ""; pendingList.removeAttribute("aria-busy");
  const miniOrderTpl = document.getElementById("tpl-mini-order");
  const pendingOrders = orders.filter((o) => o.orderStatus === "pending_admin_confirmation").slice(0, 5);
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
  document.querySelector(`[data-admin-badge="pendingOrders"]`) && (document.querySelector(`[data-admin-badge="pendingOrders"]`).hidden = counts.pending_admin_confirmation === 0, document.querySelector(`[data-admin-badge="pendingOrders"]`).textContent = counts.pending_admin_confirmation);

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
      node.querySelector('[data-field="cod"]').textContent = p.codAvailable ? `Yes (₹${p.codAdvancePerUnit || 0})` : "No";
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
  const codAdvanceInput = host.querySelector("#pCodAdvance");
  function updateCodState() {
    const on = host.querySelector('input[name="codAvailable"]:checked')?.value === "yes";
    codAdvanceInput.disabled = !on;
    const preview = host.querySelector("#codPreview");
    if (on && Number(codAdvanceInput.value) > 0) {
      preview.hidden = false;
      preview.textContent = `Example: 2 units → COD advance ${formatMoney(Number(codAdvanceInput.value) * 2)}, paid online; the rest at delivery.`;
    } else preview.hidden = true;
  }
  codRadios.forEach((r) => r.addEventListener("change", updateCodState));
  codAdvanceInput.addEventListener("input", updateCodState);

  // ---- Variants ----
  const variantsBody = host.querySelector("#variantsBody"), variantList = host.querySelector("#variantList"), hasVariantsToggle = host.querySelector("#hasVariants");
  hasVariantsToggle.checked = existing?.hasVariants || false;
  variantsBody.hidden = !hasVariantsToggle.checked;
  hasVariantsToggle.addEventListener("change", () => { variantsBody.hidden = !hasVariantsToggle.checked; if (hasVariantsToggle.checked && !variants.length) addVariant(); });

  function addVariant(seed) {
    variants.push(seed || { variantId: genId("v"), color: "", colorHex: "", size: "", optionName: "", optionValue: "", sku: "", mrp: Number(pMrp.value) || 0, price: Number(pPrice.value) || 0, stock: 0, codAdvancePerUnit: 0, images: [] });
    renderVariants();
  }
  function renderVariants() {
    variantList.innerHTML = "";
    const tpl = document.getElementById("tpl-variant-row");
    variants.forEach((v, i) => {
      const node = tpl.content.cloneNode(true);
      node.querySelector('[data-field="title"]').textContent = [v.color, v.size].filter(Boolean).join(" / ") || `Variant ${i + 1}`;
      node.querySelector('[data-field="variantId"]').value = v.variantId;
      ["color", "colorHex", "size", "optionName", "optionValue", "sku", "mrp", "price", "stock", "codAdvancePerUnit"].forEach((f) => {
        const input = node.querySelector(`[data-field="${f}"]`); input.value = v[f] || "";
        input.addEventListener("input", () => {
          v[f] = ["mrp", "price", "stock", "codAdvancePerUnit"].includes(f) ? Number(input.value) || 0 : input.value;
          if (f === "mrp" || f === "price") { v.discountPercent = v.mrp > 0 ? Math.round(((v.mrp - v.price) / v.mrp) * 100) : 0; node.querySelector('[data-field="discountPercent"]') && (node.querySelector('[data-field="discountPercent"]').value = v.discountPercent); }
          if (f === "color" || f === "size") node.querySelector('[data-field="title"]') && (node.querySelector('[data-field="title"]').textContent = [v.color, v.size].filter(Boolean).join(" / ") || `Variant ${i + 1}`);
        });
      });
      node.querySelector('[data-field="discountPercent"]').value = v.discountPercent || 0;
      node.querySelector('[data-action="duplicate-variant"]').addEventListener("click", () => { addVariant({ ...v, variantId: genId("v") }); });
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
    setVal("pCodAdvance", existing.codAdvancePerUnit); updateCodState();
    setVal("pStock", existing.stock); setVal("pLowStock", existing.lowStockThreshold); setVal("pBarcode", existing.barcode);
    setVal("pMaterial", existing.material); setVal("pDimensions", existing.dimensions); setVal("pWeight", existing.weight);
    setVal("pOrigin", existing.countryOfOrigin); setVal("pManufacturer", existing.manufacturer); setVal("pPackContents", existing.packContents);
    setVal("pWarranty", existing.warranty); setVal("pReturnPolicy", existing.returnPolicy);
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
      codAvailable: fd.get("codAvailable") === "yes", codAdvancePerUnit: Number(fd.get("codAdvancePerUnit")) || 0,
      stock: Number(fd.get("stock")) || 0, lowStockThreshold: Number(fd.get("lowStockThreshold")) || 5, barcode: fd.get("barcode").trim(),
      images, hasVariants: hasVariantsToggle.checked, variants: hasVariantsToggle.checked ? variants : [],
      highlights: highlights.map((h) => h.text).filter(Boolean), specifications: specs.filter((s) => s.key), offers: offers.map((o) => o.text).filter(Boolean),
      material: fd.get("material").trim(), dimensions: fd.get("dimensions").trim(), weight: fd.get("weight").trim(),
      countryOfOrigin: fd.get("countryOfOrigin").trim(), manufacturer: fd.get("manufacturer").trim(), packContents: fd.get("packContents").trim(),
      warranty: fd.get("warranty").trim(), returnPolicy: fd.get("returnPolicy").trim(),
      deliveryDaysMin: Number(fd.get("deliveryDaysMin")) || 0, deliveryDaysMax: Number(fd.get("deliveryDaysMax")) || 0,
      shippingCharge: fd.get("shippingCharge") ? Number(fd.get("shippingCharge")) : undefined, freeShipping: fd.get("freeShipping") === "on",
      seoTitle: fd.get("seoTitle").trim(), metaDescription: fd.get("metaDescription").trim(), slug: fd.get("slug").trim() || slugify(fd.get("name")), keywords: fd.get("keywords").trim(),
      status: fd.get("status"), flags: fd.getAll("flags"),
      rating: existing?.rating || { average: 0, count: 0 }, reviewCount: existing?.reviewCount || 0,
    };
    if (!product.name || !product.brand || product.mrp <= 0 || product.price <= 0) { showFormError("Please fill in all required fields."); return; }
    DB.saveProduct(product);
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
      node.querySelector('[data-field="total"]').textContent = formatMoney(o.pricing.total + (o.pricing.codFee || 0));
      node.querySelector('[data-field="method"]').textContent = o.payment.method === "cod" ? "COD" : "Online";
      const pStatusEl = node.querySelector('[data-field="paymentStatus"]'); pStatusEl.textContent = statusLabel(o.payment.status); pStatusEl.dataset.status = o.payment.status;
      node.querySelector('[data-field="paidNote"]').textContent = "Paid " + formatMoney(o.payment.paidAmount);
      const statusEl = node.querySelector('[data-field="status"]'); statusEl.textContent = statusLabel(o.orderStatus); statusEl.dataset.status = o.orderStatus;
      node.querySelector('[data-field="viewLink"]').href = buildHash("/admin/order-details", { id: o.orderId });
      if (o.orderStatus === "pending_admin_confirmation") { node.querySelector('[data-action="confirm"]').hidden = false; node.querySelector('[data-action="reject"]').hidden = false; }
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
    if (btn.dataset.action === "confirm") { DB.updateOrderStatus(order.orderId, "confirmed", "", "admin"); toast("Order confirmed", "success"); render(); }
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
      node.querySelector('[data-field="variant"]').textContent = it.variant || "—";
      node.querySelector('[data-field="sku"]').textContent = it.sku || "—";
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
    host.querySelector("#codAdvance").textContent = formatMoney(o.pricing.codAdvance || 0);
    host.querySelector("#codRemaining").textContent = formatMoney(o.payment.method === "cod" ? o.pricing.total - o.pricing.codAdvance : 0);
    host.querySelector("#transactionId").textContent = o.payment.transactionId || "—";

    host.querySelector("#orderSubtotal").textContent = formatMoney(o.pricing.subtotal);
    host.querySelector("#orderDiscount").textContent = "−" + formatMoney(o.pricing.discount);
    host.querySelector("#orderShipping").textContent = o.pricing.shipping === 0 ? "Free" : formatMoney(o.pricing.shipping);
    host.querySelector("#orderTotal").textContent = formatMoney(o.pricing.total + (o.pricing.codFee || 0));


    const nextAllowed = nextActionsFor(o.orderStatus);
    host.querySelectorAll("[data-order-action]").forEach((btn) => { btn.disabled = !nextAllowed.includes(btn.dataset.orderAction); });
    host.querySelector("#orderActionsHint").textContent = o.orderStatus === "delivered" ? "This order has been delivered." : o.orderStatus === "pending_admin_confirmation" ? "Payment success doesn't confirm an order. Confirm it here before it moves to fulfillment." : "Move the order forward as it progresses.";
  }

  host.querySelector("#orderActions").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-order-action]"); if (!btn || btn.disabled) return;
    const status = btn.dataset.orderAction;
    const o = DB.getOrderById(order.orderId);
    if (status === "confirmed") { DB.updateOrderStatus(o.orderId, "confirmed", "", "admin"); toast("Order confirmed", "success"); render(); }
    else openStatusDialog(o, status, render);
  });
  host.querySelector("#editTrackingBtn").addEventListener("click", () => openTrackingDialog(DB.getOrderById(order.orderId), render));

  render();
};

function nextActionsFor(status) {
  if (["delivered", "cancelled", "rejected", "returned"].includes(status)) return [];
  if (status === "pending_admin_confirmation") return ["confirmed", "rejected", "cancelled"];
  const idx = ORDER_ACTION_FLOW.indexOf(status);
  const next = idx > -1 && idx < ORDER_ACTION_FLOW.length - 1 ? [ORDER_ACTION_FLOW[idx + 1]] : [];
  return [...next, "cancelled"];
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
  setVal("policyShipping", settings.policyShipping); setVal("policyReturns", settings.policyReturns); setVal("policyPrivacy", settings.policyPrivacy); setVal("policyTerms", settings.policyTerms);

  function updateTaxFields() { const on = host.querySelector("#setTaxEnabled").checked; ["setGstin", "setTaxLabel", "setTaxRate"].forEach((id) => (host.querySelector("#" + id).disabled = !on)); }
  host.querySelector("#setTaxEnabled").addEventListener("change", updateTaxFields); updateTaxFields();
  {
    const badge = host.querySelector("#payuStatusBadge");
    Api.get("/api").then((s) => {
      badge.textContent = s.configured ? `Connected (${s.mode === "live" ? "live" : "test mode"})` : "Not connected — add PAYU_CLIENT_ID and PAYU_CLIENT_SECRET in Vercel";
      badge.dataset.status = s.configured ? "confirmed" : "failed";
    }).catch(() => { badge.textContent = "Couldn't check (is the site deployed on Vercel?)"; badge.dataset.status = "pending"; });
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
    const fd = new FormData(form);
    DB.saveSettings({
      storeName: fd.get("storeName").trim() || STORE_NAME, logo: host.dataset.newLogo || settings.logo,
      supportEmail: fd.get("supportEmail").trim(), supportPhone: fd.get("supportPhone").trim(), supportWhatsapp: fd.get("supportWhatsapp").trim(),
      storeAddress: fd.get("storeAddress").trim(), deliveryDaysMin: Number(fd.get("deliveryDaysMin")) || 3, deliveryDaysMax: Number(fd.get("deliveryDaysMax")) || 7,
      defaultShippingCharge: Number(fd.get("defaultShippingCharge")) || 0, freeShippingThreshold: Number(fd.get("freeShippingThreshold")) || 0,
      taxEnabled: fd.get("taxEnabled") === "on", gstin: fd.get("gstin").trim(), taxLabel: fd.get("taxLabel").trim() || "GST", taxRate: Number(fd.get("taxRate")) || 0,
      policyShipping: fd.get("policyShipping").trim(), policyReturns: fd.get("policyReturns").trim(), policyPrivacy: fd.get("policyPrivacy").trim(), policyTerms: fd.get("policyTerms").trim(),
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
  const yearEl = $("#footerYear"); if (yearEl) yearEl.textContent = new Date().getFullYear();

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { $$("dialog[open]").forEach(closeDialog); }
  });

  // Show a spinner while we connect to Firebase and load the catalogue.
  $("#app").innerHTML = '<div class="container" style="padding:4rem 0;text-align:center"><span class="spinner" aria-hidden="true"></span></div>';
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
