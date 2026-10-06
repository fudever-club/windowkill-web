/* WINDOWKILL Web Edition — Service Worker
 * Chiến lược (đổi từ 2026-10-04, fix incident "lớp xám" do stale-while-revalidate):
 *  - network-first cho GAME CORE (HTML + js/* + css/* + manifest + tuning config):
 *    luôn lấy bản mới khi online → user không bao giờ kẹt JS cũ sau deploy.
 *    Offline → fallback về cache (toàn bộ core đã precache ở lần load đầu).
 *  - cache-first cho asset NẶNG ít đổi (assets/music, ảnh, icons, fonts):
 *    đổi hiếm, tránh tải lại nhiều MB mỗi lần; version bump dọn sạch cache cũ.
 *  - navigation: network-first, fallback cache, cuối cùng offline.html.
 * Không chạm tài nguyên cross-origin. Không nuốt /api/* và range request (audio seek).
 *
 * VERSION: TỰ ĐỘNG — không sửa tay. Pre-commit hook (.githooks/pre-commit, bật bằng
 * `git config core.hooksPath .githooks`) tự stamp mỗi khi site assets đổi; CI verify
 * bằng `node scripts/bump-sw.js --check`. Mỗi stamp đổi byte file này → browser cài
 * SW mới → cache mới → client nhận assets mới sau deploy.
 */
"use strict";

const VERSION = "windowkill-20261006T053119Z-1b04e5e"; // AUTO-STAMP: không sửa tay — xem scripts/bump-sw.js
const CORE_CACHE = VERSION + "-core";
const STATIC_CACHE = VERSION + "-static";
const OFFLINE_URL = "offline.html";

// Game core — precache toàn bộ vào CORE_CACHE để chơi offline ngay sau lần load đầu.
const CORE_ASSETS = [
  "index.html",
  "game.html",
  "satellite.html",
  OFFLINE_URL,
  "manifest.webmanifest",
  "difficulty.config.json",
  "css/style.css",
  "css/roles.css",
  "js/audio.js",
  "js/config.js", // fix/audit-batch-1: WK_API_BASE CSP-safe — precache để offline vẫn có config
  "js/api.js",
  "js/menu.js",
  "js/game.js",
  "js/pwa.js",
  "js/particles.js", // perf-batch-2: particle batching — precache để offline vẫn có
  "js/install-prompt.js", // feat/pwa-trailer: PWA install prompt (launcher) — precache để offline vẫn có card
  "js/analytics.js",
  "js/bgm.js",
  "js/bg.js",
  "js/juice.js",
  "js/cinema.js",
  "js/tuning.js", // Sprint R2 Item 3: loader tuning tập trung — precache để offline vẫn có config
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
  "js/stageobj.js", // Stage Identity item 3: objective phụ + huy hiệu theo ải
  "js/upgrades2.js",
  "js/v2glue.js",
  "js/mobile.js",
  "js/portal.js",
  "js/quality.js", // feat/mobile-quality: adaptive quality tiers — precache để offline vẫn có
];

// Asset nặng ít đổi — precache ảnh/icons + track BGM đầu tiên (mp3 các track còn lại
// sẽ được cache-first runtime lưu lại khi thực sự phát, để install lần đầu nhẹ).
const STATIC_ASSETS = [
  "assets/music/high-score-parade-loop.ogg", // single theme (CEO chốt 2026-10-04) — OGG primary
  "assets/music/high-score-parade-loop.mp3", // MP3 fallback cho Safari — có nhạc ngay cả khi offline lần đầu
  // Stingers (CEO duyệt): OGG primary + MP3 fallback cho Safari
  "assets/stingers/stinger-wave-clear.ogg", "assets/stingers/stinger-wave-clear.mp3",
  "assets/stingers/stinger-level-up.ogg", "assets/stingers/stinger-level-up.mp3",
  "assets/stingers/stinger-game-over.ogg", "assets/stingers/stinger-game-over.mp3",
  "assets/stingers/stinger-victory.ogg", "assets/stingers/stinger-victory.mp3",
  "assets/favicon.png",
  "assets/hero.jpg",
  "assets/logo-lockup.webp",
  // PERF 2026-10-02: bỏ og-banner.jpg (chỉ bot og:image cần) + icon-512.png (chỉ
  // cần khi cài PWA) khỏi precache — file vẫn trên đĩa, runtime cache sẽ tự
  // lưu khi thực sự được request.
  "assets/brand/dever-logo.png",
  "assets/icons/icon-192.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    Promise.all([
      caches
        .open(CORE_CACHE)
        .then((cache) =>
          cache.addAll(CORE_ASSETS.map((u) => new Request(u, { cache: "reload" })))
        ),
      caches
        .open(STATIC_CACHE)
        .then((cache) =>
          cache.addAll(STATIC_ASSETS.map((u) => new Request(u, { cache: "reload" })))
        ),
    ]).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.indexOf("windowkill-") === 0 && k !== CORE_CACHE && k !== STATIC_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  const d = event.data;
  if (d === "SKIP_WAITING" || (d && d.type === "SKIP_WAITING")) self.skipWaiting();
});

function putIfOk(cache, req, res) {
  if (res && res.ok && req.url.indexOf(self.location.origin) === 0) {
    cache.put(req, res.clone());
  }
  return res;
}

// Game core: network-first — luôn ưu tiên bản mới nhất khi online.
// Offline (fetch reject) → trả bản trong cache (đã precache ở install).
function networkFirstCore(req) {
  return caches.open(CORE_CACHE).then((cache) =>
    fetch(req)
      .then((res) => putIfOk(cache, req, res))
      .catch(() => cache.match(req))
  );
}

// Navigation: network-first, fallback cache, cuối cùng offline.html.
function networkFirstPage(req) {
  return caches.open(CORE_CACHE).then((cache) =>
    fetch(req)
      .then((res) => putIfOk(cache, req, res))
      .catch(() =>
        cache.match(req).then((hit) => hit || caches.match(OFFLINE_URL))
      )
  );
}

// Asset nặng ít đổi: cache-first — trả cache ngay nếu có; chưa có thì fetch
// rồi lưu lại cho lần sau. Range request (audio seek) không đi qua đây.
function cacheFirst(req) {
  return caches.open(STATIC_CACHE).then((cache) =>
    cache.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => putIfOk(cache, req, res));
    })
  );
}

// Phân loại request same-origin vào đúng chiến lược.
function isCoreAsset(pathname) {
  return (
    pathname === "/" ||
    pathname === "/index.html" ||
    pathname === "/game.html" ||
    pathname === "/satellite.html" ||
    pathname === "/offline.html" ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/difficulty.config.json" ||
    pathname.indexOf("/js/") === 0 ||
    pathname.indexOf("/css/") === 0 ||
    /\.html$/i.test(pathname)
  );
}

function isHeavyAsset(pathname) {
  return (
    pathname.indexOf("/assets/") === 0 ||
    /\.(mp3|ogg|wav|mp4|webm|woff2?|ttf|otf|eot)$/i.test(pathname)
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  if (req.headers.has("range")) return; // audio seek: để browser tự xử, không cache 206
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // cross-origin: không chạm
  // Không nuốt /api/* vào cache — response API (leaderboard/health) phải luôn tươi.
  if (url.pathname.startsWith("/api/")) return;
  if (req.mode === "navigate") {
    event.respondWith(networkFirstPage(req));
    return;
  }
  if (isCoreAsset(url.pathname)) {
    event.respondWith(networkFirstCore(req));
    return;
  }
  if (isHeavyAsset(url.pathname)) {
    event.respondWith(cacheFirst(req));
    return;
  }
  // Còn lại (robots.txt, sitemap...): network thuần, không cache.
});
