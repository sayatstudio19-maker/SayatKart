/* ==========================================================================
   SAYAT — app.js
   Wires up the Fabric.js customizer, Firebase (Auth/Firestore/Storage),
   cart + checkout with live add-on/delivery pricing, PayU (via the Bolt
   SDK loaded in index.html) / COD order placement, the password-gated
   admin product-upload panel, and shared UI (toasts, loaders, modals).

   Security note: this file intentionally contains NO PayU salt, Qikink
   secret, or Firebase admin credentials. The PayU hash and the Qikink
   order call happen server-side, in /api/generate-payu-hash and
   /api/place-order — this file only calls those two endpoints.
   ========================================================================== */

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup,
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  onAuthStateChanged, signOut,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import {
  getFirestore, collection, addDoc, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
import {
  getStorage, ref, uploadBytes, getDownloadURL,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-storage.js";

/* ---------------------------------------------------------------------
   Firebase — TODO: replace with your real project config
   (Firebase console → Project settings → General → Your apps → Web app).
   These are safe to expose client-side; access is controlled by your
   Firestore/Storage security rules, not by hiding this object.
--------------------------------------------------------------------- */
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const storage = getStorage(firebaseApp);

/* ---------------------------------------------------------------------
   PayU — TODO: replace with your real Merchant Key (safe client-side).
   The SALT never goes here — /api/generate-payu-hash holds it server-side.
--------------------------------------------------------------------- */
const PAYU_MERCHANT_KEY = "YOUR_PAYU_MERCHANT_KEY";

/* ---------------------------------------------------------------------
   Admin access — PLACEHOLDER ONLY.
   This is a client-side string check, so anyone who reads this file can
   see it. Before going live, move admin verification server-side (a
   Firebase custom claim checked by your Firestore/Storage rules) so the
   product-upload write is actually protected, not just hidden.
--------------------------------------------------------------------- */
const ADMIN_ACCESS_PASSWORD = "changeme";

/* ---------------------------------------------------------------------
   Pricing — mirrors the Qikink-style add-ons/delivery options
--------------------------------------------------------------------- */
const ADDON_PRICES = { addonGiftPack: 50, addonWelcomeLetter: 50 };
const DELIVERY_PRICES = { standard: 0, express: 20 };

/* ==========================================================================
   Shortcuts & small utilities
   ========================================================================== */

const $ = (id) => document.getElementById(id);
const formatINR = (n) => `₹${Number(n).toLocaleString("en-IN")}`;

function showLoader(message = "Loading…") {
  $("globalLoaderMessage").textContent = message;
  $("globalLoader").classList.remove("hidden");
}
function hideLoader() {
  $("globalLoader").classList.add("hidden");
}

function showToast(message, type = "info") {
  const container = $("toastContainer");
  const toast = document.createElement("div");
  toast.className = `toast toast--${type}`;
  toast.setAttribute("role", type === "error" ? "alert" : "status");
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4200);
}

function openOverlay(overlayId) {
  $(overlayId).classList.remove("hidden");
  document.body.style.overflow = "hidden";
}
function closeOverlay(overlayId) {
  $(overlayId).classList.add("hidden");
  document.body.style.overflow = "";
}

function wireOverlayDismiss(overlayId, closeBtnIds = []) {
  const overlay = $(overlayId);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeOverlay(overlayId);
  });
  closeBtnIds.forEach((id) => $(id).addEventListener("click", () => closeOverlay(overlayId)));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !overlay.classList.contains("hidden")) closeOverlay(overlayId);
  });
}

/* ==========================================================================
   State
   ========================================================================== */

const state = {
  selectedProduct: { id: "white-tee", name: "White T-Shirt", price: 499 },
  cart: [],
  currentUser: null,
  fabricCanvas: null,
  activeImage: null,
};

/* ==========================================================================
   Header / mobile nav
   ========================================================================== */

function initHeaderNav() {
  const toggle = $("menuToggle");
  const nav = $("mainNav");
  toggle.addEventListener("click", () => {
    const isOpen = nav.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", String(isOpen));
  });
  nav.querySelectorAll("a").forEach((link) =>
    link.addEventListener("click", () => {
      nav.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
    })
  );

  $("cartButton").addEventListener("click", () => openOverlay("miniCartOverlay"));
  $("accountButton").addEventListener("click", () => openOverlay("authModalOverlay"));
  wireOverlayDismiss("miniCartOverlay", ["closeMiniCart"]);
  wireOverlayDismiss("authModalOverlay", ["closeAuthModal"]);
}

/* ==========================================================================
   Product customizer — Fabric.js
   ========================================================================== */

// Matches the .print-area-overlay CSS rule (inset: 16% 22%) — keep in sync.
const PRINT_AREA = { top: 0.16, left: 0.22, right: 0.22, bottom: 0.16 };

function initCustomizerCanvas() {
  const container = $("canvasContainer");
  const canvasEl = $("designCanvas");
  const rect = container.getBoundingClientRect();

  state.fabricCanvas = new fabric.Canvas(canvasEl, {
    width: rect.width,
    height: rect.height,
    backgroundColor: "transparent",
    preserveObjectStacking: true,
  });

  window.addEventListener("resize", debounce(resizeFabricCanvas, 150));
}

function resizeFabricCanvas() {
  if (!state.fabricCanvas) return;
  const rect = $("canvasContainer").getBoundingClientRect();
  state.fabricCanvas.setDimensions({ width: rect.width, height: rect.height });
  state.fabricCanvas.renderAll();
}

function debounce(fn, wait) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

async function addImageToCanvas(url) {
  const img = await fabric.Image.fromURL(url, { crossOrigin: "anonymous" });
  const canvas = state.fabricCanvas;

  const maxWidth = canvas.width * 0.5;
  if (img.width > maxWidth) img.scaleToWidth(maxWidth);

  img.set({
    left: canvas.width / 2,
    top: canvas.height / 2,
    originX: "center",
    originY: "center",
  });

  if (state.activeImage) canvas.remove(state.activeImage);
  canvas.add(img);
  canvas.setActiveObject(img);
  canvas.renderAll();
  state.activeImage = img;

  syncSlidersToActiveImage();
}

function syncSlidersToActiveImage() {
  if (!state.activeImage) return;
  $("scaleSlider").value = Math.round(state.activeImage.scaleX * 100);
  $("rotationSlider").value = Math.round(state.activeImage.angle % 360);
}

function initUploadControls() {
  const dropzone = $("dropzone");
  const input = $("imageUpload");

  input.addEventListener("change", (e) => handleFiles(e.target.files));

  ["dragenter", "dragover"].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.add("is-dragover");
    })
  );
  ["dragleave", "drop"].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.remove("is-dragover");
    })
  );
  dropzone.addEventListener("drop", (e) => handleFiles(e.dataTransfer.files));
}

function handleFiles(fileList) {
  const file = fileList && fileList[0];
  if (!file) return;
  if (!["image/png", "image/jpeg"].includes(file.type)) {
    showToast("Please upload a PNG or JPEG file.", "error");
    return;
  }

  const progress = $("uploadProgress");
  const bar = progress.querySelector(".upload-progress-bar");
  progress.classList.remove("hidden");
  bar.style.width = "0%";

  const reader = new FileReader();
  reader.onprogress = (e) => {
    if (e.lengthComputable) bar.style.width = `${Math.round((e.loaded / e.total) * 100)}%`;
  };
  reader.onload = async () => {
    bar.style.width = "100%";
    await addImageToCanvas(reader.result);
    setTimeout(() => progress.classList.add("hidden"), 400);
  };
  reader.onerror = () => {
    showToast("Couldn't read that file — please try again.", "error");
    progress.classList.add("hidden");
  };
  reader.readAsDataURL(file);
}

function initDesignControls() {
  const canvas = () => state.fabricCanvas;
  const active = () => canvas().getActiveObject();

  $("rotateLeftBtn").addEventListener("click", () => {
    const obj = active(); if (!obj) return;
    obj.rotate((obj.angle - 15 + 360) % 360);
    canvas().renderAll(); syncSlidersToActiveImage();
  });
  $("rotateRightBtn").addEventListener("click", () => {
    const obj = active(); if (!obj) return;
    obj.rotate((obj.angle + 15) % 360);
    canvas().renderAll(); syncSlidersToActiveImage();
  });
  $("bringForwardBtn").addEventListener("click", () => {
    const obj = active(); if (!obj) return;
    canvas().bringObjectForward(obj); canvas().renderAll();
  });
  $("sendBackwardBtn").addEventListener("click", () => {
    const obj = active(); if (!obj) return;
    canvas().sendObjectBackwards(obj); canvas().renderAll();
  });
  $("centerHorizontalBtn").addEventListener("click", () => {
    const obj = active(); if (!obj) return;
    canvas().centerObjectH(obj); canvas().renderAll();
  });
  $("centerVerticalBtn").addEventListener("click", () => {
    const obj = active(); if (!obj) return;
    canvas().centerObjectV(obj); canvas().renderAll();
  });
  $("deleteBtn").addEventListener("click", () => {
    const obj = active(); if (!obj) return;
    canvas().remove(obj);
    if (obj === state.activeImage) state.activeImage = null;
    canvas().renderAll();
  });
  $("resetBtn").addEventListener("click", () => {
    canvas().clear();
    canvas().backgroundColor = "transparent";
    state.activeImage = null;
    $("scaleSlider").value = 100;
    $("rotationSlider").value = 0;
    canvas().renderAll();
  });

  $("scaleSlider").addEventListener("input", (e) => {
    const obj = state.activeImage; if (!obj) return;
    obj.scale(Number(e.target.value) / 100);
    canvas().renderAll();
  });
  $("rotationSlider").addEventListener("input", (e) => {
    const obj = state.activeImage; if (!obj) return;
    obj.rotate(Number(e.target.value));
    canvas().renderAll();
  });
}

// Crops the canvas to the print-area bounds and renders it at higher
// resolution onto the hidden #printExportCanvas — the exported file
// contains only the user's artwork, never the product mockup/overlay.
async function exportPrintFile() {
  const canvas = state.fabricCanvas;
  const w = canvas.width, h = canvas.height;
  const bounds = {
    left: w * PRINT_AREA.left,
    top: h * PRINT_AREA.top,
    width: w * (1 - PRINT_AREA.left - PRINT_AREA.right),
    height: h * (1 - PRINT_AREA.top - PRINT_AREA.bottom),
  };

  const dataUrl = canvas.toDataURL({ format: "png", multiplier: 3, ...bounds });

  const exportEl = $("printExportCanvas");
  const img = new Image();
  await new Promise((resolve, reject) => {
    img.onload = resolve; img.onerror = reject; img.src = dataUrl;
  });
  exportEl.width = img.width;
  exportEl.height = img.height;
  exportEl.getContext("2d").drawImage(img, 0, 0);

  return dataUrl;
}

/* ==========================================================================
   Product selector + live pricing
   ========================================================================== */

function initProductSelector() {
  document.querySelectorAll(".product-card").forEach((card) => {
    card.addEventListener("click", () => selectProduct(card));
  });
}

function selectProduct(card) {
  document.querySelectorAll(".product-card").forEach((c) => {
    c.classList.remove("is-selected");
    c.setAttribute("aria-checked", "false");
  });
  card.classList.add("is-selected");
  card.setAttribute("aria-checked", "true");

  state.selectedProduct = {
    id: card.dataset.productId,
    name: card.dataset.productName,
    price: Number(card.dataset.productPrice),
  };

  $("productName").textContent = state.selectedProduct.name;
  $("productPrice").textContent = formatINR(state.selectedProduct.price);
  updateOrderSummary();
}

function calculateAddonsTotal() {
  return Object.keys(ADDON_PRICES).reduce((sum, id) => {
    const el = $(id);
    return sum + (el && el.checked ? ADDON_PRICES[id] : 0);
  }, 0);
}

function calculateDeliveryPrice() {
  const checked = document.querySelector('input[name="deliveryMode"]:checked');
  return checked ? DELIVERY_PRICES[checked.value] ?? 0 : 0;
}

function updateOrderSummary() {
  const base = state.selectedProduct.price;
  const addons = calculateAddonsTotal();
  const delivery = calculateDeliveryPrice();
  const total = base + addons + delivery;

  $("summaryProduct").textContent = state.selectedProduct.name;
  $("summaryPrice").textContent = formatINR(base);
  $("summaryAddons").textContent = formatINR(addons);
  $("summaryShipping").textContent = delivery === 0 ? "Free" : formatINR(delivery);
  $("summaryTotal").textContent = formatINR(total);

  return total;
}

function initPricingControls() {
  [...Object.keys(ADDON_PRICES)].forEach((id) => $(id).addEventListener("change", updateOrderSummary));
  document.querySelectorAll('input[name="deliveryMode"]').forEach((el) =>
    el.addEventListener("change", updateOrderSummary)
  );
}

/* ==========================================================================
   Checkout flow
   ========================================================================== */

function initCheckoutFlow() {
  $("proceedToCheckoutBtn").addEventListener("click", () => {
    if (!state.activeImage) {
      showToast("Upload your design before checking out.", "warning");
      return;
    }
    $("checkout").classList.remove("hidden");
    setCheckoutStep("details");
    updateOrderSummary();
    $("checkout").scrollIntoView({ behavior: "smooth", block: "start" });
  });

  $("customerInfoForm").addEventListener("submit", handlePlaceOrder);
}

function setCheckoutStep(step) {
  document.querySelectorAll("#checkoutProgress li").forEach((li) => {
    li.classList.toggle("is-active", li.dataset.step === step);
  });
}

/* ==========================================================================
   Order placement — PayU (prepaid) or COD
   Both paths call our own serverless functions, never Qikink or PayU's
   hash logic directly from the browser.
   ========================================================================== */

async function handlePlaceOrder(e) {
  e.preventDefault();
  const form = e.target;
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  const placeOrderBtn = $("placeOrderBtn");
  const btnLabel = $("placeOrderBtnLabel");
  const btnLoader = $("buttonLoader");
  placeOrderBtn.disabled = true;
  btnLabel.classList.add("hidden");
  btnLoader.classList.remove("hidden");

  try {
    showLoader("Preparing your design…");
    const printFileDataUrl = await exportPrintFile();
    const designUrl = await uploadDesignFile(printFileDataUrl);

    const total = updateOrderSummary();
    const orderPayload = {
      product: state.selectedProduct,
      addons: {
        giftPack: $("addonGiftPack").checked,
        welcomeLetter: $("addonWelcomeLetter").checked,
      },
      deliveryMode: document.querySelector('input[name="deliveryMode"]:checked').value,
      paymentMethod: document.querySelector('input[name="paymentMethod"]:checked').value,
      total,
      designUrl,
      customer: {
        name: $("customerName").value,
        phone: $("customerPhone").value,
        email: $("customerEmail").value,
        address: $("customerAddress").value,
        city: $("customerCity").value,
        state: $("customerState").value,
        pincode: $("customerPincode").value,
      },
    };

    setCheckoutStep("payment");

    if (orderPayload.paymentMethod === "prepaid") {
      await payWithPayU(orderPayload);
    } else {
      showLoader("Placing your order…");
      const result = await placeOrder(orderPayload, { paymentStatus: "cod" });
      showOrderSuccess(result, orderPayload);
    }
  } catch (err) {
    console.error(err);
    showToast("Something went wrong placing your order. Please try again.", "error");
  } finally {
    hideLoader();
    placeOrderBtn.disabled = false;
    btnLabel.classList.remove("hidden");
    btnLoader.classList.add("hidden");
  }
}

async function uploadDesignFile(dataUrl) {
  const blob = await (await fetch(dataUrl)).blob();
  const path = `designs/${Date.now()}-${state.selectedProduct.id}.png`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, blob);
  return getDownloadURL(storageRef);
}

// Server-side endpoint — computes the PayU hash from the SALT, which
// never leaves the backend. See /api/generate-payu-hash (next file).
async function requestPayuHash(payload) {
  const res = await fetch("/api/generate-payu-hash", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Could not prepare payment.");
  return res.json();
}

// Server-side endpoint — registers the order (and triggers the Qikink
// order, using its secret key) in your backend. See /api/place-order.
async function placeOrder(orderPayload, extra = {}) {
  const res = await fetch("/api/place-order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...orderPayload, ...extra }),
  });
  if (!res.ok) throw new Error("Could not place order.");
  return res.json();
}

async function payWithPayU(orderPayload) {
  showLoader("Preparing secure payment…");
  const txnid = `sayat${Date.now()}`;

  const { hash } = await requestPayuHash({
    txnid,
    amount: orderPayload.total,
    productinfo: orderPayload.product.name,
    firstname: orderPayload.customer.name,
    email: orderPayload.customer.email,
  });

  hideLoader();

  const data = {
    key: PAYU_MERCHANT_KEY,
    hash,
    txnid,
    amount: String(orderPayload.total),
    firstname: orderPayload.customer.name,
    email: orderPayload.customer.email,
    phone: orderPayload.customer.phone,
    productinfo: orderPayload.product.name,
    surl: `${window.location.origin}/order-success.html`,
    furl: `${window.location.origin}/order-failed.html`,
  };

  const handlers = {
    responseHandler: async (response) => {
      showLoader("Confirming your order…");
      const result = await placeOrder(orderPayload, {
        paymentStatus: response?.response?.status || "unknown",
        txnid,
      });
      hideLoader();
      showOrderSuccess(result, orderPayload);
    },
    catchException: (response) => {
      hideLoader();
      showToast("Payment could not be completed.", "error");
      console.error("PayU error:", response);
    },
  };

  window.bolt.launch(data, handlers);
}

function showOrderSuccess(result, orderPayload) {
  $("successOrderId").textContent = result?.orderId || "—";
  $("successPaymentStatus").textContent =
    orderPayload.paymentMethod === "cod" ? "Cash on Delivery" : "Paid";
  $("successProduct").textContent = orderPayload.product.name;
  $("successTotal").textContent = formatINR(orderPayload.total);
  setCheckoutStep("confirmation");
  openOverlay("successModalOverlay");
  state.cart = [];
  updateCartCount();
}

/* ==========================================================================
   Auth modal (Firebase Auth)
   ========================================================================== */

function initAuthModal() {
  $("loginTab").addEventListener("click", () => switchAuthTab("login"));
  $("signupTab").addEventListener("click", () => switchAuthTab("signup"));

  $("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      showLoader("Logging in…");
      await signInWithEmailAndPassword(auth, $("authEmail").value, $("authPassword").value);
      closeOverlay("authModalOverlay");
      showToast("Welcome back!", "success");
    } catch (err) {
      showToast(err.message.replace("Firebase: ", ""), "error");
    } finally {
      hideLoader();
    }
  });

  $("signupForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if ($("signupPassword").value !== $("signupConfirmPassword").value) {
      showToast("Passwords don't match.", "error");
      return;
    }
    try {
      showLoader("Creating your account…");
      await createUserWithEmailAndPassword(auth, $("signupEmail").value, $("signupPassword").value);
      closeOverlay("authModalOverlay");
      showToast("Account created — welcome to SAYAT!", "success");
    } catch (err) {
      showToast(err.message.replace("Firebase: ", ""), "error");
    } finally {
      hideLoader();
    }
  });

  $("googleLoginBtn").addEventListener("click", async () => {
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
      closeOverlay("authModalOverlay");
    } catch (err) {
      showToast("Google sign-in failed.", "error");
    }
  });

  $("continueAsGuestBtn").addEventListener("click", () => closeOverlay("authModalOverlay"));
}

function switchAuthTab(tab) {
  const isLogin = tab === "login";
  $("loginTab").classList.toggle("is-active", isLogin);
  $("signupTab").classList.toggle("is-active", !isLogin);
  $("loginTab").setAttribute("aria-selected", String(isLogin));
  $("signupTab").setAttribute("aria-selected", String(!isLogin));
  $("loginForm").classList.toggle("hidden", !isLogin);
  $("signupForm").classList.toggle("hidden", isLogin);
}

function initAuthStateListener() {
  onAuthStateChanged(auth, (user) => {
    state.currentUser = user;
    $("accountButton").textContent = user ? (user.displayName || "Account") : "Login";
  });
}

/* ==========================================================================
   Admin — password gate + product upload
   ========================================================================== */

function initAdmin() {
  $("adminAccessBtn").addEventListener("click", () => openOverlay("adminAccessModalOverlay"));
  wireOverlayDismiss("adminAccessModalOverlay", ["closeAdminAccessModal"]);
  wireOverlayDismiss("adminPanelOverlay", ["closeAdminPanel"]);

  $("adminAccessForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const entered = $("adminPasswordInput").value;
    if (entered === ADMIN_ACCESS_PASSWORD) {
      $("adminAccessError").classList.add("hidden");
      $("adminAccessForm").reset();
      closeOverlay("adminAccessModalOverlay");
      openOverlay("adminPanelOverlay");
    } else {
      $("adminAccessError").classList.remove("hidden");
    }
  });

  $("adminProductForm").addEventListener("submit", handleAdminProductUpload);
}

async function handleAdminProductUpload(e) {
  e.preventDefault();
  const uploadBtn = $("adminUploadProductBtn");
  const progress = $("adminUploadProgress");
  uploadBtn.disabled = true;
  progress.classList.remove("hidden");

  try {
    const files = $("adminProductImages").files;
    const imageUrls = [];
    for (const file of files) {
      const path = `products/${Date.now()}-${file.name}`;
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, file);
      imageUrls.push(await getDownloadURL(storageRef));
    }

    await addDoc(collection(db, "products"), {
      name: $("adminProductName").value,
      category: $("adminProductCategory").value,
      price: Number($("adminProductPrice").value),
      description: $("adminProductDescription").value,
      images: imageUrls,
      createdAt: serverTimestamp(),
    });

    showToast("Product uploaded.", "success");
    $("adminProductForm").reset();
    closeOverlay("adminPanelOverlay");
  } catch (err) {
    console.error(err);
    showToast("Couldn't upload that product — please try again.", "error");
  } finally {
    uploadBtn.disabled = false;
    progress.classList.add("hidden");
  }
}

/* ==========================================================================
   Cart (mini-cart drawer)
   ========================================================================== */

function updateCartCount() {
  $("cartCount").textContent = String(state.cart.length);
}

/* ==========================================================================
   Init
   ========================================================================== */

document.addEventListener("DOMContentLoaded", () => {
  initHeaderNav();
  initCustomizerCanvas();
  initUploadControls();
  initDesignControls();
  initProductSelector();
  initPricingControls();
  initCheckoutFlow();
  initAuthModal();
  initAuthStateListener();
  initAdmin();
  updateOrderSummary();
  updateCartCount();

  $("startDesigningBtn").addEventListener("click", () =>
    $("customizer").scrollIntoView({ behavior: "smooth", block: "start" })
  );
  $("continueShoppingBtn").addEventListener("click", () => {
    closeOverlay("successModalOverlay");
    window.location.reload();
  });
});
