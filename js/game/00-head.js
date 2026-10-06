/* =====================================================================
   WINDOWKILL: Web Edition — arena engine
   Twin-stick shooter trong popup. Cửa sổ popup CHÍNH LÀ máu:
   quái tím bám viền -> window.resizeTo() gặm nhỏ; đạn bắn vào viền ->
   window.moveBy() đẩy cửa sổ bay + hất văng quái bám.
   ===================================================================== */
"use strict";
(() => {
/* Ẩn ảnh bị lỗi tải (thay cho inline onerror — tương thích CSP script-src 'self') */
document.querySelectorAll("img[data-hide-onerror]").forEach(img => {
  img.addEventListener("error", () => { img.style.display = "none"; });
});
const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");
const $ = id => document.getElementById(id);
const BUS = "windowkill_bus";
const bus = ("BroadcastChannel" in window) ? new BroadcastChannel(BUS) : null;
const qp = new URLSearchParams(location.search);

/* GC-2026-10 (perf batch 2): nén mảng tại chỗ, giữ đúng thứ tự, KHÔNG alloc mảng mới.
 * Thay cho arr = arr.filter(keep) chạy mỗi frame (parts/floats/cracks/enemies...).
 * Trả về cùng mảng (đã rút gọn length) để code gọi giữ nguyên được. */
function compactInPlace(arr, keep) {
  let w = 0;
  for (let i = 0; i < arr.length; i++) {
    const it = arr[i];
    if (keep(it)) arr[w++] = it;
  }
  arr.length = w;
  return arr;
}
/* GC-2026-10: predicate hoist sẵn — tránh alloc closure mỗi frame khi gọi compactInPlace */
const _keepPart = p => p.t < p.life;
const _keepFloat = f => f.t < f.life;
const _keepCrack = c => c.t < c.life;
const _keepEnemy = e => !e.dead;
const _keepZone = z => z.ttl > 0 && !(z.from && z.from.dead);
/* GC-2026-10: maker gradient hoist sẵn (ctx ở module scope) — _gradGet không alloc factory mỗi lần gọi */
function _mkShipGrad() {
  const g = ctx.createLinearGradient(-12, 0, 14, 0);
  g.addColorStop(0, "#7dd3fc"); g.addColorStop(1, "#f0fdff");
  return g;
}
/* GC-2026-10: vignette nguy hiểm — cache trực tiếp (W/H là biến cục bộ render),
 * nhịp đập qua globalAlpha nên gradient chỉ build lại khi resize */
let _dangerVg = null, _dangerVgKey = "";
const _gradCache = new Map(); // key -> CanvasGradient
function _gradGet(key, make) {
  let g = _gradCache.get(key);
  if (!g) {
    g = make();
    if (_gradCache.size > 96) _gradCache.clear(); // trần an toàn, tránh phình vô hạn
    _gradCache.set(key, g);
  }
  return g;
}

/* ---------------- config ---------------- */
/* REBALANCE v2.0 (CEO): chill phải thật chill — quái yếu/chậm/thưa hơn, gặm chậm lại;
 * normal wave 1-3 là onboarding; hardcore giữ nguyên.
 * pickupBoost: hệ số tăng trọng số rớt heart/shield. dropRateMul: tăng tỉ lệ rớt chung ở chill.
 * bossBulletMul/bossAtkMul: chill → đạn boss chậm hơn, pattern thưa hơn. */
const DIFFS = {
  chill:    { label: "Chill",       hpMul: 0.55, spMul: 0.75, chew: 1.7,  shipHp: 4, spawnMul: 1.5,
              pickupBoost: 1.5, dropRateMul: 1.2, bossBulletMul: 0.8, bossAtkMul: 1.3 },
  normal:   { label: I18N.t("menu.diff.normal"),      hpMul: 1.0,  spMul: 1.0,  chew: 0.9,  shipHp: 3, spawnMul: 1.0,
              pickupBoost: 1.0, dropRateMul: 1.0, bossBulletMul: 1.0, bossAtkMul: 1.0 },
  hardcore: { label: I18N.t("menu.diff.hard"), hpMul: 1.45, spMul: 1.15, chew: 0.65, shipHp: 2, spawnMul: 0.85,
              pickupBoost: 1.0, dropRateMul: 1.0, bossBulletMul: 1.0, bossAtkMul: 1.0 },
};
DIFFS.hard = DIFFS.hardcore; // launcher gửi diff=hard — alias để độ khó Khắc nghiệt có hiệu lực
const DIFF = DIFFS[qp.get("diff")] || DIFFS.normal;
const DIFF_KEY = qp.get("diff") in DIFFS ? qp.get("diff") : "normal";
const PROFILE_ID = qp.get("profile") || null;
AudioEngine.setSettings({ music: qp.get("music") === "1", sfx: qp.get("sfx") === "1" });
let musicOn = qp.get("music") === "1"; // AUDIT 2026-10-02: trạng thái nhạc cho phím M (xem handler KeyM)
// AUDIT 2026-10-02: nối toggle SFX cho lớp sfx2 — trước đây Sfx2.setEnabled không có
// caller nào nên tắt SFX ở menu vẫn nghe tiếng multikill/levelup/shield của sfx2.
if (window.Sfx2) { try { Sfx2.setEnabled(qp.get("sfx") === "1"); } catch (e) {} }
if (window.BGM) { try { BGM.init(); BGM.setEnabled(qp.get("music") === "1"); } catch (e) {} } // BGM: nhạc nền file thật, tiếp tục từ menu
// BGM handoff: game chạy ở popup riêng, tab menu (opener) vẫn mở nền → bảo opener tạm nhường nhạc, khỏi chồng 2 bài
try {
  if (window.opener && !window.opener.closed && window.opener.BGM && typeof window.opener.BGM.suspend === "function") {
    window.opener.BGM.suspend();
    window.__wkSuspendedOpener = true;
  }
} catch (e) {}
window.addEventListener("pagehide", () => {
  try {
    if (window.__wkSuspendedOpener && window.opener && !window.opener.closed && window.opener.BGM && typeof window.opener.BGM.resume === "function")
      window.opener.BGM.resume(); // đóng game → trả nhạc lại cho menu (nếu user vẫn bật nhạc)
  } catch (e) {}
});
// Auto-pause khi tab bị ẩn (click ra ngoài / minimize) — tránh chết oan lúc không nhìn
document.addEventListener("visibilitychange", () => { if (document.hidden) { try { pauseGame(true); } catch (e) {} } });
// Fullscreen như game .exe — không còn gì ở ngoài để ấn nhầm (cần 1 click của user, luật browser)
function toggleFullscreen() {
  try {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen();
  } catch (e) {}
}
window.toggleFullscreen = toggleFullscreen; // H3: radial mobile gọi
document.addEventListener("fullscreenchange", () => {
  const b = document.getElementById("btn-hud-full");
  if (b) b.classList.toggle("on", !!document.fullscreenElement);
});
document.getElementById("btn-hud-full")?.addEventListener("click", toggleFullscreen);
// MOBILE 2026-10-03 (iPhone): iPhone Safari không có Fullscreen API cho
// documentElement (chỉ iPad/macOS) → nút "toàn màn hình" bấm không có tác dụng.
// Ẩn nút và đưa nút pause về sát mép phải cho gọn.
try {
  var _de = document.documentElement;
  if (!_de.requestFullscreen && !_de.webkitRequestFullscreen) {
    var _bf = document.getElementById("btn-hud-full");
    if (_bf) _bf.style.display = "none";
    try { document.body.classList.add("no-fullscreen"); } catch (e2) {}
  }
} catch (e) {}
// AUDIT 2026-10-02: nút pause HUD phải được nối TẠI ĐÂY (trong scope IIFE của game.js).
// mobile.js không truy cập được pauseGame() (game.js bọc IIFE) nên wiring ở đó
// chết im — nút pause từng không hoạt động trên mọi thiết bị.
document.getElementById("btn-hud-pause")?.addEventListener("click", (e) => {
  try { e.stopPropagation(); } catch (_) {}
  if (typeof pauseGame === "function") pauseGame(true);
});
// Súng Bắn Keo (2026-10-04, CEO chốt): nút touch cạnh nút pause — chỉ hiện khi có nâng cấp
const _glueBtn = document.getElementById("btn-hud-glue");
let _glueBtnShown = false;
_glueBtn?.addEventListener("click", (e) => {
  try { e.stopPropagation(); AudioEngine.resume(); } catch (_) {}
  if (G.phase === "play") fireGlueGun();
});
const SHAKE_WINDOW = qp.get("shake") === "1";
/* ---------- adaptive quality tiers (js/quality.js, feat/mobile-quality) ----------
   Khởi tạo TRƯỚC fit() để wkDpr() đọc đúng dprCap của nấc. Áp nấc = set BG +
   Juice quality + fit() lại (đổi DPR cap → resize backing store). */
function applyQualityTier(tier) {
  var T = (window.WKQuality && window.WKQuality.TIERS[tier]) || null;
  try { if (typeof BG !== "undefined" && T) BG.setQuality(T.bg); } catch (e) {}
  try { if (window.Juice && T) Juice.setPerfQuality(T.juice); } catch (e) {}
  try { fit(); } catch (e) {} // áp lại DPR cap của nấc mới
}
if (window.WKQuality) {
  try {
    window.WKQuality.setOnTierChange(function (t) { applyQualityTier(t); });
    window.WKQuality.init();
    applyQualityTier(window.WKQuality.tier);
  } catch (e) {}
}
// Helper đọc hệ số scale shadowBlur theo nấc (0 = tắt hẳn ở lite).
function wkShadowScale() {
  try {
    var s = window.WKQuality && window.WKQuality.shadowScale;
    return (typeof s === "number") ? s : 1;
  } catch (e) { return 1; }
}
// Helper haptic: game core gọi, mobile.js cung cấp window.WKBuzz lúc runtime.
// Guard đầy đủ — desktop / trình duyệt không có navigator.vibrate đều no-op.
function wkBuzz(p) { try { if (window.WKBuzz) window.WKBuzz(p); } catch (e) {} }

const MIN_W = 250, MIN_H = 190;      // cửa sổ nhỏ hơn -> vỡ
const START_W = 980;
const START_H = 720; // kích thước ban đầu 980×720 (xem growWindow(START_W, 720) lúc hồi size)

/* ---------------- helpers ---------------- */
// MOBILE 2026-10-03 (iPhone): canvas render theo devicePixelRatio để không bị mờ
// trên màn hình DPR cao (iPhone DPR 2-3). Backing store = CSS px * dpr, còn mọi
// logic vẽ vẫn dùng CSS px nhờ ctx.setTransform. Chặn dpr ở 2 để giữ perf GPU
// mobile (DPR 3 native = 1170x2532 quá nặng cho hiệu ứng shadowBlur mỗi frame).
function wkDpr() {
  try {
    var cap = (window.WKQuality && window.WKQuality.dprCap) || 2;
    return Math.min(window.devicePixelRatio || 1, cap);
  } catch (e) { return 1; }
}
function fit() {
  var dpr = wkDpr();
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
  try { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); } catch (e) {}
  // kích thước logic (CSS px) — mọi code vẽ/hit-test dùng cái này, KHÔNG dùng canvas.width
  try { window.WKViewW = window.innerWidth; window.WKViewH = window.innerHeight; } catch (e) {}
}
fit();
window.addEventListener("resize", () => { fit(); if (typeof refreshBG === "function") refreshBG(); });
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
const hypot = (x, y) => Math.sqrt(x * x + y * y); // OPT: nhanh hơn Math.hypot 2-4x với 2 đối số

