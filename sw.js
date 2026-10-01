/* WINDOWKILL Web Edition — Service Worker
 * Chiến lược:
 *  - stale-while-revalidate cho static assets (CSS/JS/ảnh/icon/manifest) — cache có version
 *  - network-first cho trang HTML (navigation) — luôn lấy bản mới khi online
 *  - offline fallback về offline.html
 * Không chạm tài nguyên cross-origin.
 */
"use strict";

const VERSION = "windowkill-v3"; // bump 2026-10-01: xóa cache v2 (PR #24: bgm suspend/resume, fullscreen, handoff), ép tải mới
const STATIC_CACHE = VERSION + "-static";
const HTML_CACHE = VERSION + "-html";
const OFFLINE_URL = "offline.html";

const STATIC_ASSETS = [
  "css/style.css",
  "js/audio.js",
  "js/api.js",
  "js/menu.js",
  "js/game.js",
  "js/pwa.js",
  "js/analytics.js",
  "js/bgm.js",
  "js/bg.js",
  "js/juice.js",
  "js/cinema.js",
  "manifest.webmanifest",
  OFFLINE_URL,
  "assets/favicon.png",
  "assets/hero.jpg",
  "assets/logo-lockup.webp",
  "assets/og-banner.jpg",
  "assets/brand/dever-logo.png",
  "assets/icons/icon-192.png",
  "assets/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) =>
        cache.addAll(
          STATIC_ASSETS.map((u) => new Request(u, { cache: "reload" }))
        )
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.indexOf("windowkill-") === 0 && k !== STATIC_CACHE && k !== HTML_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

function putIfOk(cache, req, res) {
  if (res && res.ok && req.url.indexOf(self.location.origin) === 0) {
    cache.put(req, res.clone());
  }
  return res;
}

// Navigation: network-first, fallback cache, cuối cùng offline.html
function networkFirstPage(req) {
  return caches.open(HTML_CACHE).then((cache) =>
    fetch(req)
      .then((res) => putIfOk(cache, req, res))
      .catch(() =>
        cache.match(req).then((hit) => hit || cache.match(OFFLINE_URL))
      )
  );
}

// Static: stale-while-revalidate — trả cache ngay (nhanh), đồng thời fetch bản mới
// ngầm để lần sau dùng bản mới nhất. Không còn kẹt JS cũ vĩnh viễn sau deploy.
function staleWhileRevalidate(req) {
  return caches.open(STATIC_CACHE).then((cache) =>
    cache.match(req).then((hit) => {
      const network = fetch(req)
        .then((res) => putIfOk(cache, req, res))
        .catch(() => hit || cache.match(OFFLINE_URL));
      return hit || network;
    })
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  if (req.headers.has("range")) return; // audio seek: để browser tự xử, không cache 206
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // cross-origin: không chạm
  if (req.mode === "navigate") {
    event.respondWith(networkFirstPage(req));
    return;
  }
  event.respondWith(staleWhileRevalidate(req));
});
