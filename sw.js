/* WINDOWKILL Web Edition — Service Worker
 * Chiến lược:
 *  - stale-while-revalidate cho static assets (CSS/JS/ảnh/icon/manifest) — cache có version
 *  - network-first cho trang HTML (navigation) — luôn lấy bản mới khi online
 *  - offline fallback về offline.html
 * Không chạm tài nguyên cross-origin.
 */
"use strict";

const VERSION = "windowkill-v4"; // bump 2026-10-02 (audit): ép tải mới bộ v2.0 (campaign/meta/tutorial/i18n...)
const STATIC_CACHE = VERSION + "-static";
const HTML_CACHE = VERSION + "-html";
const OFFLINE_URL = "offline.html";

const STATIC_ASSETS = [
  "css/style.css",
  "css/roles.css",
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
  // AUDIT 2026-10-02: precache từng chỉ chứa file v1 — bổ sung toàn bộ file v2.0
  // (campaign/meta/tutorial/i18n/monsters/bosses/juice2/sfx2/stagefx/upgrades2/v2glue/mobile/portal)
  // để chế độ offline cài được game đầy đủ, không rớt vào offline.html thiếu JS.
  "js/i18n.js",
  "js/campaign.js",
  "js/meta.js",
  "js/tutorial.js",
  "js/monsters.js",
  "js/bosses.js",
  "js/juice2.js",
  "js/sfx2.js",
  "js/stagefx.js",
  "js/upgrades2.js",
  "js/v2glue.js",
  "js/mobile.js",
  "js/portal.js",
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

// Navigation: network-first, fallback cache, cuối cùng offline.html.
// AUDIT 2026-10-02: offline.html được precache vào STATIC_CACHE (không phải HTML_CACHE),
// nên fallback phải dùng caches.match (tìm mọi cache), không dùng cache.match của HTML_CACHE.
function networkFirstPage(req) {
  return caches.open(HTML_CACHE).then((cache) =>
    fetch(req)
      .then((res) => putIfOk(cache, req, res))
      .catch(() =>
        cache.match(req).then((hit) => hit || caches.match(OFFLINE_URL))
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
  // AUDIT 2026-10-02: không nuốt /api/* và file media vào stale-while-revalidate —
  // trước đây response API (leaderboard/health) bị cache và trả cũ 1 nhịp, còn mp3
  // không-range bị cache nguyên file ~7.6MB/track vào static cache.
  if (url.pathname.startsWith("/api/")) return;
  if (/\.(mp3|ogg|wav|mp4|webm)$/i.test(url.pathname)) return;
  if (req.mode === "navigate") {
    event.respondWith(networkFirstPage(req));
    return;
  }
  event.respondWith(staleWhileRevalidate(req));
});
