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
document.addEventListener("fullscreenchange", () => {
  const b = document.getElementById("btn-hud-full");
  if (b) b.classList.toggle("on", !!document.fullscreenElement);
});
document.getElementById("btn-hud-full")?.addEventListener("click", toggleFullscreen);
// AUDIT 2026-10-02: nút pause HUD phải được nối TẠI ĐÂY (trong scope IIFE của game.js).
// mobile.js không truy cập được pauseGame() (game.js bọc IIFE) nên wiring ở đó
// chết im — nút pause từng không hoạt động trên mọi thiết bị.
document.getElementById("btn-hud-pause")?.addEventListener("click", (e) => {
  try { e.stopPropagation(); } catch (_) {}
  if (typeof pauseGame === "function") pauseGame(true);
});
const SHAKE_WINDOW = qp.get("shake") === "1";
if (typeof BG !== "undefined") BG.setQuality(qp.get("fx") === "reduced" ? "reduced" : "full");

const MIN_W = 250, MIN_H = 190;      // cửa sổ nhỏ hơn -> vỡ
const START_W = 980;

/* ---------------- helpers ---------------- */
function fit() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
fit();
window.addEventListener("resize", () => { fit(); if (typeof refreshBG === "function") refreshBG(); });
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
const hypot = (x, y) => Math.sqrt(x * x + y * y); // OPT: nhanh hơn Math.hypot 2-4x với 2 đối số

/* ---------------- điều khiển cửa sổ thật ---------------- */
const winCtrl = { tested: false, ok: true, expect: 0 };
let arena = null; // fallback đấu trường ảo khi trình duyệt chặn resize
const bounds = () => arena || { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
let wvx = 0, wvy = 0;

function shrinkWindow(dw, dh) {
  // v2.0: track sát thương cửa sổ (achievement #10)
  try { G.windowDamagePx = (G.windowDamagePx || 0) + Math.abs(dw) + Math.abs(dh); } catch (er) {}
  if (!winCtrl.ok) {
    if (!arena) arena = { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
    arena.x += dw / 2; arena.y += dh / 2; arena.w -= dw; arena.h -= dh;
    if (arena.w < MIN_W || arena.h < MIN_H) die("window");
    return;
  }
  const nw = window.outerWidth - dw, nh = window.outerHeight - dh;
  if (nw < MIN_W || nh < MIN_H) { die("window"); return; }
  if (!winCtrl.tested) {
    winCtrl.tested = true; winCtrl.expect = nw;
    setTimeout(() => {
      if (Math.abs(window.outerWidth - winCtrl.expect) > 6) {
        winCtrl.ok = false;
        arena = { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
        addFloat(window.innerWidth / 2, 130, I18N.t("error.resize_blocked"), "#ffd479");
      }
    }, 500);
  }
  try { window.moveTo(window.screenX + dw / 2, window.screenY + dh / 2); } catch (e) {}
  try { window.resizeTo(nw, nh); } catch (e) {}
}
function growWindow(dw, dh) { // vá cửa sổ sau mỗi wave
  if (!winCtrl.ok) {
    if (arena) {
      arena.x = Math.max(0, arena.x - dw / 2); arena.y = Math.max(0, arena.y - dh / 2);
      arena.w = Math.min(window.innerWidth, arena.w + dw);
      arena.h = Math.min(window.innerHeight, arena.h + dh);
      arena.x = Math.min(arena.x, window.innerWidth - arena.w);
      arena.y = Math.min(arena.y, window.innerHeight - arena.h);
    }
    return;
  }
  const nw = Math.min(START_W, window.outerWidth + dw);
  const nh = Math.min(720, window.outerHeight + dh);
  try { window.moveTo(window.screenX - (nw - window.outerWidth) / 2, window.screenY - (nh - window.outerHeight) / 2); } catch (e) {}
  try { window.resizeTo(nw, nh); } catch (e) {}
}
function pushWindow(dx, dy) {
  if (!winCtrl.ok) return;
  wvx += dx; wvy += dy;
  const sp = hypot(wvx, wvy), MAX = 950;
  if (sp > MAX) { wvx *= MAX / sp; wvy *= MAX / sp; }
}
function applyWindowMotion(dt) {
  if (hypot(wvx, wvy) > 2 && winCtrl.ok) {
    try { window.moveBy(wvx * dt, wvy * dt); } catch (e) {}
    try {
      const aw = window.screen.availWidth || 1920, ah = window.screen.availHeight || 1080;
      const x = window.screenX, y = window.screenY, w = window.outerWidth, h = window.outerHeight;
      const nx = clamp(x, -w + 80, aw - 80), ny = clamp(y, 0, ah - 80);
      if (Math.abs(nx - x) > 1 || Math.abs(ny - y) > 1) window.moveTo(nx, ny);
    } catch (e) {}
  }
  const d = Math.exp(-3.2 * dt); wvx *= d; wvy *= d;
}
function windowJitter(power) {
  if (!winCtrl.ok || !SHAKE_WINDOW) return;
  try { window.moveBy((Math.random() - .5) * power, (Math.random() - .5) * power); } catch (e) {}
}

// WOW: camera shake qua Juice theo bảng tier §1 juice.js (hit 2/120/p1 · chết 3/160/p2 ·
// nổ lớn 6/300/p4 · player hurt 8/350/p8 · boss chết 12/700/p10 · chewer cắn 2/150/p3).
// G.shake vẫn được set để render fallback khi không có Juice.
function jxShake(amp, ms, prio) {
  G.shake = amp;
  if (window.Juice) { try { Juice.addShake(amp, ms, prio); } catch (e) {} }
}

// WOW: drawFn cho Juice.drawGhosts — wrapper đã translate/rotate/scale + alpha,
// chỉ cần vẽ thân tàu tại (g.x, g.y)
function drawShipGhost(c, g) {
  c.fillStyle = "#7dd3fc";
  c.beginPath();
  c.moveTo(g.x + 16, g.y); c.lineTo(g.x - 11, g.y - 11); c.lineTo(g.x - 6, g.y); c.lineTo(g.x - 11, g.y + 11);
  c.closePath(); c.fill();
}

// WOW: vẽ boss cho Cinema bossIntro/bossDeath — chữ ký (ctx, x, y, scale, alpha)
function drawBossShape(c, x, y, s, a, color) {
  const col = color || "#8b2fc9";
  const t = performance.now() / 1000;
  c.save();
  c.translate(x, y); c.scale(s || 1, s || 1); c.globalAlpha = (a == null ? 1 : a);
  c.rotate(Math.sin(t * 0.8) * 0.12);
  c.shadowColor = col; c.shadowBlur = 26;
  c.fillStyle = col;
  c.fillRect(-34, -34, 68, 68);
  c.shadowBlur = 0;
  c.strokeStyle = "#fff"; c.lineWidth = 3;
  c.strokeRect(-34, -34, 68, 68);
  c.fillStyle = "rgba(255,255,255,.16)";
  c.fillRect(-22, -22, 44, 44);
  c.fillStyle = "#fff";
  c.beginPath(); c.arc(0, 0, 9 + Math.sin(t * 6) * 2, 0, Math.PI * 2); c.fill();
  c.restore();
}
/* ---------------- Satellite Window System (multi-window, MULTIWINDOW-SPEC.md) ----------------
 * 1 cửa sổ chính + tối đa 3 popup vệ tinh. Vệ tinh là dumb renderer:
 * logic ở cửa sổ chính, vệ tinh chỉ vẽ + báo click + drift theo lệnh.
 * Không mở được popup (bị chặn/mobile/user chọn) → fallback "cửa sổ mô phỏng" vẽ trong arena. */
const SAT_MODE = qp.get("sat") || "auto"; // "auto" | "sim" | "off" — từ launcher
const IS_MOBILE = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent || "");

const SatManager = (() => {
  const MAX_SATS = 3;
  const PRI = { fragment: 0, debris: 1, nest: 2, shield: 3, lover: 4, superlove: 4, mirror: 5, blackhole: 6 }; // hàng đợi ưu tiên
  const queue = [];
  const sats = new Map(); // id -> sat
  let permAsked = false, pollT = 0, blockedWarned = false;

  const pref = () => { try { return localStorage.getItem("wk_sat_pref"); } catch (e) { return null; } };
  const setPref = (v) => { try { localStorage.setItem("wk_sat_pref", v); } catch (e) {} };

  function request(role, opts = {}) {
    if (SAT_MODE === "off") return null; // mechanic không trigger (caller spawn thường thay thế)
    if (sats.size + queue.length >= MAX_SATS) return null;
    const o = Object.assign({ hp: 6, color: "#8b2fc9", label: I18N.t("sat.generic"), w: 340, h: 220 }, opts);
    const sat = { id: "sat" + Date.now().toString(36) + Math.floor(Math.random() * 46656).toString(36),
      role, hp: Math.max(1, o.hp | 0), maxHp: Math.max(1, o.hp | 0),
      color: /^#[0-9a-fA-F]{6}$/.test(o.color) ? o.color : "#8b2fc9",
      label: String(o.label).slice(0, 24), w: o.w, h: o.h, opts: o,
      win: null, sim: false, ready: false, canMove: false,
      x: 0, y: 0, born: performance.now(), spawnT: 0, spawned: 0, dead: false, shatterT: 0 };
    if (SAT_MODE === "sim" || IS_MOBILE || pref() === "single") makeSim(sat);
    else if (!pref() && !permAsked) { permAsked = true; askPermission(sat); }
    else { queue.push(sat); queue.sort((a, b) => (PRI[a.role] ?? 9) - (PRI[b.role] ?? 9)); }
    return sat;
  }

  /* banner xin phép 1 lần (non-blocking, không pause game) */
  function askPermission(sat) {
    queue.push(sat);
    const bar = $("satperm");
    if (!bar) { flush(); return; }
    bar.style.display = "flex";
    $("btn-sat-allow").onclick = () => { setPref("allow"); bar.style.display = "none"; flush(); };
    $("btn-sat-single").onclick = () => {
      setPref("single"); bar.style.display = "none";
      while (queue.length) makeSim(queue.shift()); // chuyển hàng đợi sang mô phỏng
    };
    setTimeout(() => { // quá 12s không chọn → mô phỏng (R1)
      if (bar.style.display === "flex") { bar.style.display = "none"; setPref("single"); while (queue.length) makeSim(queue.shift()); }
    }, 12000);
  }

  /* mở popup thật ở vị trí cascade từ mép phải cửa sổ chính */
  function openReal(sat) {
    const n = sats.size;
    let left = 0, top = 0;
    try {
      left = window.screenX + window.outerWidth + 24 + n * 36;
      top = window.screenY + 40 + n * 48;
      const aw = window.screen.availWidth || 1920, ah = window.screen.availHeight || 1080;
      left = clamp(Math.round(left), 0, Math.max(0, aw - sat.w - 20));
      top = clamp(Math.round(top), 0, Math.max(0, ah - sat.h - 40));
    } catch (e) {}
    const q = new URLSearchParams({ role: sat.role, id: sat.id, hp: sat.hp, color: sat.color, label: sat.label, enr: sat.opts.enraged ? "1" : "" }).toString();
    let w = null;
    try {
      w = window.open("satellite.html?" + q, "wk_sat_" + sat.id,
        `width=${sat.w},height=${sat.h},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no,resizable=no,scrollbars=no`);
    } catch (e) { w = null; }
    if (!w || w.closed) return false; // bị chặn → fallback
    sat.win = w; sat.x = left; sat.y = top;
    sats.set(sat.id, sat);
    return true;
  }

  /* fallback "cửa sổ mô phỏng": khung OS giả vẽ trong arena */
  function makeSim(sat) {
    sat.sim = true;
    const b = bounds(), s = G.ship || { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    const sw = Math.min(230, b.w * 0.42), sh = sw * 0.62;
    const corners = [
      { x: b.x + 24, y: b.y + 56 }, { x: b.x + b.w - 24 - sw, y: b.y + 56 },
      { x: b.x + 24, y: b.y + b.h - 24 - sh }, { x: b.x + b.w - 24 - sw, y: b.y + b.h - 24 - sh },
    ];
    let best = corners[0], bd = -1;
    for (const c of corners) { const d = (c.x - s.x) ** 2 + (c.y - s.y) ** 2; if (d > bd) { bd = d; best = c; } }
    sat.x = best.x; sat.y = best.y; sat.sw = sw; sat.sh = sh;
    sats.set(sat.id, sat);
    if (!blockedWarned) {
      blockedWarned = true;
      setBanner(I18N.t("error.sim_title"), I18N.t("error.popup_blocked_game"));
    }
  }

  /* gọi ở mọi mousedown/keydown (cần user gesture để window.open) */
  function flush() {
    if (!queue.length || !G || G.phase !== "play" || document.hidden) return;
    while (queue.length && sats.size < MAX_SATS) {
      const sat = queue.shift();
      if (!openReal(sat)) makeSim(sat);
    }
  }

  /* poll mỗi 0.5s: phát hiện đóng tay (R4) */
  function poll(dt) {
    pollT += dt;
    if (pollT < 0.5) return;
    pollT = 0;
    for (const sat of [...sats.values()]) {
      if (sat.dead) { // dọn xác: popup thật đã đóng thì xóa khỏi map (BUG2)
        if (!sat.sim && sat.win && sat.win.closed) sats.delete(sat.id);
        continue;
      }
      if (!sat.sim && sat.win && sat.win.closed) { kill(sat.id, "manual"); }
    }
  }

  function post(id, msg) {
    const sat = sats.get(id);
    if (sat && !sat.sim && sat.win && !sat.win.closed && bus)
      bus.postMessage(Object.assign({ satId: id }, msg));
  }

  /* click vào vệ tinh = 1 sát thương */
  function damage(id, x, y) {
    const sat = sats.get(id);
    if (!sat || sat.dead) return;
    if (sat.role === "shield") return; // khiên của mình — click không phá được
    if (typeof sat.opts.onDamage === "function") { // M2: pool HP chung của boss
      sat.opts.onDamage(1, sat);
      AudioEngine.sfx.hit();
      if (sat.sim) { sat.flash = 1; if (x !== undefined) addFloat(x, y - 14, "-1", "#fff"); }
      return;
    }
    sat.hp = Math.max(0, sat.hp - 1);
    AudioEngine.sfx.hit();
    if (sat.sim) { sat.flash = 1; if (x !== undefined) addFloat(x, y - 14, "-1", "#fff"); }
    else post(id, { type: "sat-dmg", id, hp: sat.hp, x: Math.round(x || 0), y: Math.round(y || 0) });
    if (sat.hp <= 0) kill(id, "killed");
  }

  function kill(id, mode) {
    const sat = sats.get(id);
    if (!sat || sat.dead) return;
    sat.dead = true;
    if (sat.sim) sat.shatterT = 0.3;
    else {
      post(id, { type: "sat-die", id });
      try { setTimeout(() => { try { if (sat.win && !sat.win.closed) sat.win.close(); } catch (e) {} }, 600); } catch (e) {}
    }
    try { if (typeof sat.opts.onClose === "function") sat.opts.onClose(mode, sat); } catch (e) {}
    // dọn khỏi map sau hiệu ứng (sim) hoặc khi popup đã đóng (real)
    if (sat.sim) setTimeout(() => sats.delete(id), 350);
    else {
      // BUG2-FIX: sat thật từng chỉ dọn khi sat-bye tới (bị guard nuốt khi đã dead) —
      // lên lịch xóa map sau khi popup đã đóng; poll() cũng dọn xác mỗi 0.5s.
      try {
        setTimeout(() => {
          const s = sats.get(id);
          if (s && s.dead) {
            try { if (s.win && !s.win.closed) s.win.close(); } catch (e) {}
            sats.delete(id);
          }
        }, 2000);
      } catch (e) {}
    }
  }

  function closeAll() {
    queue.length = 0;
    for (const sat of sats.values()) {
      if (!sat.sim && sat.win) { try { if (!sat.win.closed) sat.win.close(); } catch (e) {} }
    }
    sats.clear();
  }

  /* click test cho cửa sổ mô phỏng (gọi ở mousedown, trước khi bắn) */
  function hitSim(px, py) {
    const list = [...sats.values()].filter(s => s.sim && !s.dead && s.role !== "shield"); // drone khiên không chặn click
    for (let i = list.length - 1; i >= 0; i--) {
      const s = list[i];
      if (px >= s.x && px <= s.x + s.sw && py >= s.y && py <= s.y + s.sh) { damage(s.id, px, py); return true; }
    }
    return false;
  }

  function anyRole(role) { for (const s of sats.values()) if (s.role === role && !s.dead) return true; return false; }
  const list = () => [...sats.values()];
  const count = () => sats.size;

  /* bus: sat-ready / sat-hit / sat-bye */
  if (bus) bus.onmessage = (ev) => {
    const m = ev.data || {};
    if (!m || typeof m.type !== "string" || !m.type.startsWith("sat-")) return;
    const id = String(m.id || m.satId || "");
    // BUG1-FIX: sat-bye (user đóng tay popup) phải đi qua kill("manual") để phạt kích hoạt —
    // đặt TRƯỚC guard dead kẻo nhánh này thành dead code.
    if (m.type === "sat-bye") { const s = sats.get(id); if (s && !s.dead) kill(id, "manual"); else sats.delete(id); return; }
    const sat = sats.get(id);
    if (!sat || sat.dead) return;
    if (m.type === "sat-ready") sat.ready = true, sat.canMove = !!m.canMove;
    else if (m.type === "sat-hit") {
      const x = clamp(+m.x || 0, 0, sat.w), y = clamp(+m.y || 0, 0, sat.h);
      damage(id, x, y);
    }
  };

  // DESIGN-SYSTEM v1.1 §8 — tint title bar mô phỏng theo role (giữ tương phản thấp)
  const ROLE_TB_TINT = {
    nest: ["#3a1d5c", "#190b2c"], fragment: ["#4a2d6b", "#201335"],
    shield: ["#1d3a52", "#0c1c2c"], debris: ["#4a1d1d", "#260d0d"],
    giant: ["#1d4224", "#0d2112"], minion: ["#2d4416", "#141f0a"],
    mother: ["#4d2f0d", "#261505"], chick: ["#4d4211", "#261f09"],
    bomb: ["#4d2113", "#270f08"], lover: ["#4d1428", "#270a14"],
    superlove: ["#521226", "#2a0a13"], mirror: ["#1f3a46", "#0d1a21"],
    blackhole: ["#22133d", "#0f0820"],
  };
  /* vẽ cửa sổ mô phỏng (khung OS giả) */
  function drawSims() {
    for (const s of sats.values()) {
      if (!s.sim || s.dead && s.shatterT <= 0) continue;
      if (s.role === "shield" && s.sim) { drawShieldDrone(s); continue; } // M3: drone khiên bay quanh tàu
      const a = s.dead ? Math.max(0, s.shatterT / 0.3) : 1;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.shadowColor = "rgba(0,0,0,.5)"; ctx.shadowBlur = 18; ctx.shadowOffsetY = 6;
      ctx.fillStyle = "#0d1420";
      roundRect(s.x, s.y, s.sw, s.sh, 8); ctx.fill();
      ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
      // title bar — DESIGN-SYSTEM v1.1 §8: tint theo role
      const tb = ROLE_TB_TINT[s.role] || ["#1a2b4a", "#0f1c33"];
      const tg = ctx.createLinearGradient(0, s.y, 0, s.y + 26);
      tg.addColorStop(0, tb[0]); tg.addColorStop(1, tb[1]);
      ctx.fillStyle = tg;
      roundRect(s.x, s.y, s.sw, 26, [8, 8, 0, 0]); ctx.fill();
      const cols = ["#ff5f57", "#febc2e", "#28c840"];
      cols.forEach((c, i) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(s.x + 16 + i * 18, s.y + 13, 5.5, 0, Math.PI * 2); ctx.fill(); });
      ctx.fillStyle = "#cfe3ff"; ctx.font = "600 11px system-ui"; ctx.textAlign = "left"; ctx.textBaseline = "middle";
      ctx.fillText(s.label, s.x + 74, s.y + 14);
      ctx.fillStyle = "#ffffff55"; ctx.font = "10px system-ui"; ctx.textAlign = "right";
      ctx.fillText(I18N.t("sat.sim_badge"), s.x + s.sw - 8, s.y + 14);
      ctx.strokeStyle = "#ffffff22"; ctx.lineWidth = 1;
      roundRect(s.x + 0.5, s.y + 0.5, s.sw - 1, s.sh - 1, 8); ctx.stroke();
      // nội dung theo role
      ctx.save();
      ctx.beginPath(); roundRect(s.x, s.y + 26, s.sw, s.sh - 26, [0, 0, 8, 8]); ctx.clip();
      drawSimContent(s);
      ctx.restore();
      // thanh HP (fragment M2: hiện HP boss — pool chung)
      const hpf = s.role === "fragment" && G.boss ? clamp(G.boss.hp / G.boss.maxHp, 0, 1) : s.hp / s.maxHp;
      ctx.fillStyle = "#ffffff18"; ctx.fillRect(s.x + 10, s.y + s.sh - 12, s.sw - 20, 5);
      ctx.fillStyle = s.color; ctx.fillRect(s.x + 10, s.y + s.sh - 12, (s.sw - 20) * hpf, 5);
      if (s.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${s.flash * 0.4})`; roundRect(s.x, s.y, s.sw, s.sh, 8); ctx.fill(); }
      if (s.role === "debris" && (s.warnT || 0) > 0) { // M4: telegraph đỏ 0.7s trước khi bay
        const p = (Math.sin(performance.now() / 90) + 1) / 2;
        ctx.strokeStyle = `rgba(255,60,60,${0.5 + 0.5 * p})`; ctx.lineWidth = 3 + 2 * p;
        roundRect(s.x + 1, s.y + 1, s.sw - 2, s.sh - 2, 8); ctx.stroke();
      }
      ctx.restore();
    }
  }

  /* M3: drone khiên (fallback mô phỏng) bay quanh tàu, 5 tim */
  function drawShieldDrone(s) {
    const sh = typeof shieldTarget === "function" ? shieldTarget() : null;
    if (!sh) return;
    const t = performance.now(), bob = Math.sin(t / 300) * 4;
    const x = sh.x, y = sh.y + bob;
    ctx.save();
    ctx.globalAlpha = s.dead ? Math.max(0, s.shatterT / 0.3) : 1;
    ctx.strokeStyle = "rgba(56,189,248,.35)"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y, 70, 0, Math.PI * 2); ctx.stroke(); // quỹ đạo
    ctx.fillStyle = "#0d1b2e"; ctx.strokeStyle = "#38bdf8"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#38bdf8";
    ctx.beginPath(); ctx.arc(x, y, 6 + Math.sin(t / 200) * 1.5, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 4; i++) { // 4 cánh quạt
      const a = i * Math.PI / 2 + t / 400;
      ctx.strokeStyle = "#7dd3fc"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x + Math.cos(a) * 24, y + Math.sin(a) * 24, 5, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.font = "13px sans-serif"; ctx.textAlign = "center";
    ctx.fillText("💙".repeat(Math.max(0, s.hearts ?? 5)) || "💔", x, y - 28);
    ctx.fillStyle = "#38bdf8"; ctx.font = "600 10px system-ui";
    ctx.fillText(I18N.t("sat.shield_label"), x, y + 34);
    ctx.restore();
  }


  function drawGoofyFace(x, y, r, color, angry, t) {
    const wob = Math.sin(t / 500) * 0.06;
    ctx.save(); ctx.translate(x, y); ctx.rotate(wob);
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    const ey = -r * 0.25, ex = r * 0.34;
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(-ex, ey, r * 0.22, 0, Math.PI * 2); ctx.arc(ex, ey, r * 0.22, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = angry ? "#ff2020" : "#1a1a2e";
    const px = angry ? 0 : Math.sin(t / 700) * r * 0.05;
    ctx.beginPath(); ctx.arc(-ex + px, ey, r * 0.1, 0, Math.PI * 2); ctx.arc(ex + px, ey, r * 0.1, 0, Math.PI * 2); ctx.fill();
    if (angry) {
      ctx.strokeStyle = "#7a0d0d"; ctx.lineWidth = Math.max(2, r * 0.09); ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-ex - r * 0.22, ey - r * 0.36); ctx.lineTo(-ex + r * 0.2, ey - r * 0.12);
      ctx.moveTo(ex + r * 0.22, ey - r * 0.36); ctx.lineTo(ex - r * 0.2, ey - r * 0.12);
      ctx.stroke();
    }
    ctx.strokeStyle = "#1a1a2e"; ctx.lineWidth = Math.max(2, r * 0.08); ctx.lineCap = "round";
    ctx.beginPath();
    if (angry) ctx.arc(0, r * 0.75, r * 0.4, Math.PI * 1.15, Math.PI * 1.85);
    else ctx.arc(0, r * 0.1, r * 0.5, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();
    ctx.restore();
  }

  function drawSimContent(s) {
    const cx = s.x + s.sw / 2, cy = s.y + 26 + (s.sh - 26) / 2, t = performance.now();
    if (s.role === "nest") {
      ctx.fillStyle = "#120a24"; ctx.fillRect(s.x, s.y + 26, s.sw, s.sh - 26);
      for (let i = 0; i < 5; i++) {
        const a = i / 5 * Math.PI * 2, pulse = 1 + 0.16 * Math.sin(t / 420 + i * 1.7);
        const x = cx + Math.cos(a) * s.sw * 0.26, y = cy + Math.sin(a) * s.sh * 0.2, r = 11 * pulse;
        const g = ctx.createRadialGradient(x, y, 1, x, y, r);
        g.addColorStop(0, "#e9a8ff"); g.addColorStop(0.55, s.color); g.addColorStop(1, "#3b0764");
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.8, a, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "rgba(255,80,80,.9)";
        ctx.beginPath(); ctx.arc(x, y - r * 0.2, 2, 0, Math.PI * 2); ctx.fill();
      }
    } else if (s.role === "debris") { // M4: mảnh vỡ nứt, nhắc bấm để phá
      ctx.fillStyle = "#140a0a"; ctx.fillRect(s.x, s.y + 26, s.sw, s.sh - 26);
      const wob = Math.sin(t / 180) * 0.12;
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(wob);
      ctx.fillStyle = "#3a3f4a";
      ctx.beginPath();
      for (let i = 0; i < 7; i++) {
        const a = i / 7 * Math.PI * 2, r = 26 + (i % 3) * 9;
        i === 0 ? ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r) : ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "#ff5a5a"; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(-18, 12); ctx.lineTo(-4, -2); ctx.lineTo(8, 8); ctx.lineTo(20, -10); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = "#ff8f8f"; ctx.font = "700 13px system-ui"; ctx.textAlign = "center";
      ctx.fillText(I18N.t("sat.click_break"), cx, s.y + s.sh - 22);
    } else if (s.role === "bomb") { // M8
      const urgent = (s.fuseT === undefined ? 15 : s.fuseT) <= 3;
      const blink = Math.floor(t / (urgent ? 120 : 300)) % 2 === 0;
      ctx.fillStyle = blink ? "#3a0d02" : "#1c0701"; ctx.fillRect(s.x, s.y + 26, s.sw, s.sh - 26);
      const r = Math.min(s.sw, s.sh - 26) * 0.22;
      ctx.fillStyle = "#2b2f36"; ctx.beginPath(); ctx.arc(cx, cy - 8, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#4a5058"; ctx.beginPath(); ctx.arc(cx - r * 0.3, cy - 8 - r * 0.3, r * 0.35, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#c98a3a"; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(cx + r * 0.6, cy - 8 - r * 0.7);
      ctx.quadraticCurveTo(cx + r * 1.2, cy - 8 - r * 1.5, cx + r * 0.9, cy - 8 - r * 1.9); ctx.stroke();
      const sp = (Math.sin(t / 70) + 1) / 2;
      ctx.fillStyle = `rgba(255,${140 + Math.floor(80 * sp)},40,.95)`;
      ctx.beginPath(); ctx.arc(cx + r * 0.9, cy - 8 - r * 1.9, 4 + 3 * sp, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = urgent ? "#ff3b30" : "#ffd166"; ctx.font = "700 44px system-ui";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(String(Math.max(0, Math.ceil(s.fuseT === undefined ? 15 : s.fuseT))), cx, cy + r * 1.15);
      ctx.fillStyle = "#ff8f8f"; ctx.font = "700 13px system-ui";
      ctx.fillText(I18N.t("sat.click_break"), cx, s.y + s.sh - 22);
    } else if (s.role === "giant") { // M6
      ctx.fillStyle = "#0a1a0a"; ctx.fillRect(s.x, s.y + 26, s.sw, s.sh - 26);
      drawGoofyFace(cx, cy, Math.min(s.sw, s.sh - 26) * 0.3, "#4caf50", false, t);
      ctx.fillStyle = "#a5ffb0"; ctx.font = "700 13px system-ui"; ctx.textAlign = "center";
      ctx.fillText(I18N.t("sat.bomb_telegraph"), cx, s.y + s.sh - 22);
    } else if (s.role === "minion") { // M6
      const enr = !!(s.opts.enraged || (s.enrageT || 0) > 0);
      ctx.fillStyle = enr ? "#1c0505" : "#0c160a"; ctx.fillRect(s.x, s.y + 26, s.sw, s.sh - 26);
      drawGoofyFace(cx, cy, Math.min(s.sw, s.sh - 26) * 0.3, enr ? "#ff5252" : "#8bc34a", enr, t);
      ctx.fillStyle = enr ? "#ff8f8f" : "#c5f0a8"; ctx.font = "700 13px system-ui"; ctx.textAlign = "center";
      ctx.fillText(enr ? I18N.t("sat.giant_angry") : I18N.t("sat.giant_idle"), cx, s.y + s.sh - 22);
    } else if (s.role === "mother") { // M5
      ctx.fillStyle = "#241105"; ctx.fillRect(s.x, s.y + 26, s.sw, s.sh - 26);
      const r = Math.min(s.sw, s.sh - 26) * 0.26;
      ctx.fillStyle = "#ff9800";
      ctx.beginPath(); ctx.ellipse(cx, cy + 8, r * 1.15, r * 0.85, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#ffa726";
      ctx.beginPath(); ctx.arc(cx + r * 0.72, cy - r * 0.55, r * 0.45, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#e53935";
      for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.arc(cx + r * 0.72 + i * r * 0.28, cy - r * 0.98, r * 0.16, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = "#1a1a1a";
      ctx.beginPath(); ctx.arc(cx + r * 0.84, cy - r * 0.6, r * 0.07, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#ffca28";
      ctx.beginPath(); ctx.moveTo(cx + r * 1.12, cy - r * 0.55); ctx.lineTo(cx + r * 1.38, cy - r * 0.42); ctx.lineTo(cx + r * 1.12, cy - r * 0.3); ctx.closePath(); ctx.fill();
      const flap = Math.sin(t / 240) * 0.5;
      ctx.save(); ctx.translate(cx - r * 0.35, cy + 8); ctx.rotate(-0.4 + flap * 0.3);
      ctx.fillStyle = "#f57c00"; ctx.beginPath(); ctx.ellipse(0, 0, r * 0.55, r * 0.3, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      ctx.fillStyle = "#ffd9a0"; ctx.font = "700 13px system-ui"; ctx.textAlign = "center";
      ctx.fillText(I18N.t("sat.mother_lay_telegraph"), cx, s.y + s.sh - 22);
    } else if (s.role === "chick") { // M5
      const enr = (s.enrageT || 0) > 0;
      ctx.fillStyle = enr ? "#200808" : "#1d1503"; ctx.fillRect(s.x, s.y + 26, s.sw, s.sh - 26);
      const hop = Math.abs(Math.sin(t / 280 + (s.hopPh || 0))) * (enr ? 26 : 16);
      const cr = Math.min(s.sw, s.sh - 26) * (enr ? 0.3 : 0.24);
      ctx.fillStyle = enr ? "#ff8a65" : "#ffd54f";
      ctx.beginPath(); ctx.arc(cx, cy - hop, cr, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#1a1a1a";
      ctx.beginPath(); ctx.arc(cx - cr * 0.3, cy - hop - cr * 0.15, cr * 0.1, 0, Math.PI * 2);
      ctx.arc(cx + cr * 0.3, cy - hop - cr * 0.15, cr * 0.1, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#ff9800";
      ctx.beginPath(); ctx.moveTo(cx - cr * 0.12, cy - hop + cr * 0.1); ctx.lineTo(cx + cr * 0.12, cy - hop + cr * 0.1); ctx.lineTo(cx, cy - hop + cr * 0.32); ctx.closePath(); ctx.fill();
      if (enr) {
        ctx.fillStyle = "#ff5252";
        ctx.beginPath(); ctx.arc(cx - cr * 0.55, cy - hop, cr * 0.16, 0, Math.PI * 2); ctx.arc(cx + cr * 0.55, cy - hop, cr * 0.16, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = enr ? "#ff8f8f" : "#ffe9a8"; ctx.font = "700 13px system-ui"; ctx.textAlign = "center";
      ctx.fillText(enr ? I18N.t("sat.chick_angry") : I18N.t("sat.chick_idle"), cx, s.y + s.sh - 22);
    } else if (s.role === "lover") { // M7: người yêu — trái tim đập thình thịch
      const hb = !!(s.heartbroken);
      ctx.fillStyle = hb ? "#2a0a12" : "#2a0a1a"; ctx.fillRect(s.x, s.y + 26, s.sw, s.sh - 26);
      const beat = 1 + 0.22 * Math.abs(Math.sin(t / 260));
      const r = Math.min(s.sw, s.sh - 26) * 0.26 * beat;
      ctx.fillStyle = hb ? "#ff2020" : "#ff5f8a";
      ctx.beginPath(); // trái tim
      ctx.moveTo(cx, cy + r * 0.75);
      ctx.bezierCurveTo(cx - r * 1.5, cy - r * 0.2, cx - r * 0.8, cy - r * 1.1, cx, cy - r * 0.35);
      ctx.bezierCurveTo(cx + r * 0.8, cy - r * 1.1, cx + r * 1.5, cy - r * 0.2, cx, cy + r * 0.75);
      ctx.fill();
      if (hb) { // mắt giận
        ctx.fillStyle = "#fff";
        ctx.beginPath(); ctx.arc(cx - r * 0.3, cy - r * 0.3, r * 0.12, 0, Math.PI * 2);
        ctx.arc(cx + r * 0.3, cy - r * 0.3, r * 0.12, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#7a0d0d";
        ctx.beginPath(); ctx.arc(cx - r * 0.3, cy - r * 0.3, r * 0.05, 0, Math.PI * 2);
        ctx.arc(cx + r * 0.3, cy - r * 0.3, r * 0.05, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = hb ? "#ff8f8f" : "#ffc2d6"; ctx.font = "700 13px system-ui"; ctx.textAlign = "center";
      ctx.fillText(hb ? I18N.t("sat.love_big_heartbroken") : I18N.t("sat.love_seeking"), cx, s.y + s.sh - 22);
    } else if (s.role === "superlove") { // M7: siêu-popup — tim khổng lồ + sét
      ctx.fillStyle = "#1c0510"; ctx.fillRect(s.x, s.y + 26, s.sw, s.sh - 26);
      const beat = 1 + 0.14 * Math.abs(Math.sin(t / 220));
      const r = Math.min(s.sw, s.sh - 26) * 0.3 * beat;
      ctx.fillStyle = "#ff5f8a";
      ctx.beginPath();
      ctx.moveTo(cx, cy + r * 0.75);
      ctx.bezierCurveTo(cx - r * 1.5, cy - r * 0.2, cx - r * 0.8, cy - r * 1.1, cx, cy - r * 0.35);
      ctx.bezierCurveTo(cx + r * 0.8, cy - r * 1.1, cx + r * 1.5, cy - r * 0.2, cx, cy + r * 0.75);
      ctx.fill();
      const fl = Math.floor(t / 150) % 2 === 0; // tia sét nhấp nháy
      ctx.fillStyle = fl ? "#ffe93c" : "#fff7ae";
      ctx.beginPath();
      ctx.moveTo(cx + 4, cy - r * 1.15); ctx.lineTo(cx - 12, cy + r * 0.1);
      ctx.lineTo(cx - 1, cy + r * 0.1); ctx.lineTo(cx - 6, cy + r * 0.75);
      ctx.lineTo(cx + 12, cy - r * 0.35); ctx.lineTo(cx + 1, cy - r * 0.35);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#ffc2d6"; ctx.font = "700 13px system-ui"; ctx.textAlign = "center";
      ctx.fillText(I18N.t("sat.love_telegraph"), cx, s.y + s.sh - 22);
    } else if (s.role === "mirror") { // M10: gương thần — mặt kính lấp lánh
      ctx.fillStyle = "#08131c"; ctx.fillRect(s.x, s.y + 26, s.sw, s.sh - 26);
      const mw = s.sw * 0.62, mh = (s.sh - 26) * 0.62;
      const gg = ctx.createLinearGradient(cx - mw / 2, cy - mh / 2, cx + mw / 2, cy + mh / 2);
      gg.addColorStop(0, "#164e63"); gg.addColorStop(0.5, "#a5f3fc"); gg.addColorStop(1, "#164e63");
      ctx.fillStyle = gg;
      ctx.beginPath(); ctx.ellipse(cx, cy, mw / 2, mh / 2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#f0abfc"; ctx.lineWidth = 3; ctx.stroke();
      const sx = ((t / 14) % (mw * 1.6)) - mw * 0.8; // vệt sáng chạy qua gương
      ctx.save();
      ctx.beginPath(); ctx.ellipse(cx, cy, mw / 2, mh / 2, 0, 0, Math.PI * 2); ctx.clip();
      ctx.fillStyle = "rgba(255,255,255,.35)";
      ctx.fillRect(cx + sx - 14, cy - mh / 2, 28, mh);
      ctx.restore();
      ctx.fillStyle = "#a5f3fc"; ctx.font = "700 13px system-ui"; ctx.textAlign = "center";
      ctx.fillText(I18N.t("sat.mirror_warn"), cx, s.y + s.sh - 22);
    } else if (s.role === "blackhole") { // M9: hố đen + đĩa bồi tụ xoay
      ctx.fillStyle = "#05030c"; ctx.fillRect(s.x, s.y + 26, s.sw, s.sh - 26);
      const r = Math.min(s.sw, s.sh - 26) * 0.24;
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(t / 900);
      for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = ["#7c3aed", "#c084fc", "#ff9d5c"][i];
        ctx.lineWidth = 5 - i;
        ctx.globalAlpha = 0.85 - i * 0.2;
        ctx.beginPath(); ctx.ellipse(0, 0, r * (1.5 + i * 0.45), r * (0.62 + i * 0.18), 0, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#000";
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.95, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#ff9d5c"; ctx.lineWidth = 2; ctx.stroke();
      const n = (s.swallowed || []).length;
      ctx.fillStyle = "#c084fc"; ctx.font = "700 13px system-ui"; ctx.textAlign = "center";
      ctx.fillText(I18N.t("sat.vacuum_count", { n }), cx, s.y + s.sh - 22);
    } else {
      ctx.fillStyle = "#0a0a14"; ctx.fillRect(s.x, s.y + 26, s.sw, s.sh - 26);
      ctx.fillStyle = s.color; ctx.font = "700 22px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("◈", cx, cy);
    }
  }

  function updateSims(dt) {
    for (const s of sats.values()) {
      if (s.flash > 0) s.flash -= dt * 4;
      if (s.dead && s.shatterT > 0) s.shatterT -= dt;
    }
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    if (Array.isArray(r)) { // [tl, tr, br, bl]
      ctx.moveTo(x + r[0], y);
      ctx.lineTo(x + w - r[1], y); ctx.arcTo(x + w, y, x + w, y + r[1], r[1]);
      ctx.lineTo(x + w, y + h - r[2]); ctx.arcTo(x + w, y + h, x + w - r[2], y + h, r[2]);
      ctx.lineTo(x + r[3], y + h); ctx.arcTo(x, y + h, x, y + h - r[3], r[3]);
      ctx.lineTo(x, y + r[0]); ctx.arcTo(x, y, x + r[0], y, r[0]);
    } else {
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
    }
    ctx.closePath();
  }

  return { request, flush, poll, closeAll, count, list, anyRole, damage, kill, hitSim, drawSims, updateSims,
    send: (id, msg) => post(id, msg), // M8: gửi sat-tick cho popup thật
    steer: (id, vx, vy) => post(id, { type: "sat-steer", id, vx, vy }),
    warn: (id) => post(id, { type: "sat-warn", id }) };
})();

/* ---------------- M1 — Ổ QUÁI BAY (Nest Window) ---------------- */
function nestSpawnPoint(sat) {
  // vị trí ổ trong tọa độ screen → đổi sang arena, spawn ở viền gần nhất
  let cx, cy;
  if (sat.sim) { cx = sat.x + sat.sw / 2; cy = sat.y + sat.sh / 2; }
  else {
    cx = (sat.x + sat.w / 2) - window.screenX;
    cy = (sat.y + sat.h / 2) - window.screenY;
  }
  return nearestEdgePoint(clamp(cx, 0, window.innerWidth), clamp(cy, 0, window.innerHeight));
}

function onNestClose(mode, sat) {
  const p = nestSpawnPoint(sat);
  if (mode === "manual") {
    // đóng tay: ổ vỡ tung, nhả tối đa 4 con dồn (risk/reward)
    const n = Math.min(4, Math.max(0, sat.opts.maxSpawns - sat.spawned));
    for (let i = 0; i < n; i++) {
      const type = sat.opts.pool[(Math.random() * sat.opts.pool.length) | 0];
      spawnEnemyAt(type, p.x + rand(-40, 40), p.y + rand(-40, 40));
    }
    addFloat(p.x, p.y - 24, I18N.t("sat.nest_burst"), "#ff7ad9", true);
    AudioEngine.sfx.bigboom();
  } else if (mode === "killed") {
    burst(p.x, p.y, 26, ["#c084fc", "#8b2fc9", "#fff"], 320);
    addFloat(p.x, p.y - 24, I18N.t("sat.nest_killed"), "#c084fc", true);
  }
  // "timeout": tự rút êm, không phạt
}

function updateNests(dt) {
  const now = performance.now();
  for (const sat of SatManager.list()) {
    if (sat.role !== "nest" || sat.dead) continue;
    if (now - sat.born > 60000) { SatManager.kill(sat.id, "timeout"); continue; } // TTL 60s
    sat.spawnT -= dt;
    if (sat.spawnT <= 0 && sat.spawned < sat.opts.maxSpawns) {
      sat.spawnT = sat.opts.spawnEvery;
      sat.spawned++;
      const type = sat.opts.pool[(Math.random() * sat.opts.pool.length) | 0];
      const p = nestSpawnPoint(sat);
      spawnEnemyAt(type, p.x, p.y);
      AudioEngine.sfx.shrink();
      addFloat(p.x, p.y - 20, I18N.t("sat.nest_released"), "#c084fc");
    }
  }
}

function maybeTriggerNest(n) {
  if (SAT_MODE === "off" || SatManager.anyRole("nest")) return;
  const act = actOf(n);
  const want = (act === 1 && n >= 6) || (act === 3 && n > 0 && n % 5 === 0);
  if (!want) return;
  const sat = SatManager.request("nest", {
    hp: 6, color: "#8b2fc9", label: I18N.t("sat.nest_label"), w: 340, h: 220,
    spawnEvery: 6, pool: ["chewer", "chaser"], maxSpawns: 8,
    onClose: onNestClose,
  });
  if (sat) {
    sat.spawnT = 2; // nhả con đầu sau 2s
    setBanner(I18N.t("sat.nest_spawn"), "");
  } else {
    // SAT_MODE=off hoặc hết quota: spawn thường tương đương, giữ cân bằng
    const p1 = edgeSpawn(), p2 = edgeSpawn();
    spawnEnemyAt("chewer", p1.x, p1.y); spawnEnemyAt("chewer", p2.x, p2.y);
  }
}

/* ---------------- M3 — CỬA SỔ KHIÊN (Shield Window) ----------------
 * Pickup "shieldwin" (wave 4+): gọi cửa sổ khiên xanh bám cạnh cửa sổ chính.
 * - Popup thật: mỗi 0.5s moveTo giữ khoảng cách 16px bên phải cửa sổ chính.
 * - Chewer trong 300px ưu tiên gặm khiên thay vì cửa sổ chính.
 * - Máu kính 60px, mỗi lần bị gặm -12px (popup thật thu nhỏ theo cho thấy được).
 * - Fallback mô phỏng: drone khiên bay quanh tàu r=70, 5 tim, chewer bám drone.
 * - TTL 45s; đóng tay = mất khiên, không phạt; nhặt nữa = hồi đầy. */
function shieldSat() { return SatManager.list().find(s => s.role === "shield" && !s.dead) || null; }

function requestShield() {
  const ex = shieldSat();
  if (ex) { // nhặt nữa = hồi đầy
    ex.shieldPx = 60; ex.hearts = 5;
    addFloat(G.ship.x, G.ship.y - 34, I18N.t("pickup.shield_refilled"), "#38bdf8", true);
    AudioEngine.sfx.pickup();
    return;
  }
  const sat = SatManager.request("shield", {
    hp: 999, color: "#38bdf8", label: I18N.t("sat.shield_label"), w: 260, h: 200,
    shieldPx: 60, hearts: 5,
    onClose: (mode) => {
      if (mode === "killed") {
        const p = shieldTarget() || { x: G.ship.x, y: G.ship.y };
        burst(p.x, p.y, 34, ["#38bdf8", "#ffffff"], 340);
        addFloat(p.x, p.y - 30, I18N.t("pickup.shield_broken"), "#38bdf8", true);
        AudioEngine.sfx.bigboom();
      }
      // thả chewer đang bám khiên
      G.enemies.forEach(e => { if (e.onShield) { e.onShield = false; e.latched = null; } });
    },
  });
  if (sat) {
    sat.shieldPx = 60; sat.hearts = 5; sat.followT = 0;
    setBanner(I18N.t("pickup.shield_banner"), "");
    AudioEngine.sfx.pickup();
  }
}

/* điểm bám của khiên (tọa độ arena): popup thật → viền phải; sim → drone quanh tàu */
function shieldTarget() {
  const sat = shieldSat();
  if (!sat) return null;
  const b = bounds(), s = G.ship;
  if (sat.sim) {
    const t = performance.now() / 1000;
    return { x: s.x + Math.cos(t * 1.4) * 70, y: s.y + Math.sin(t * 1.4) * 70, edge: "drone" };
  }
  const sy = clamp(sat.y + sat.h / 2 - window.screenY, b.y + 20, b.y + b.h - 20);
  return { x: b.x + b.w, y: sy, edge: "right" };
}

function updateShield(dt) {
  const sat = shieldSat();
  if (!sat) return;
  if (performance.now() - sat.born > 45000) { SatManager.kill(sat.id, "timeout"); return; }
  if (sat.sim) return; // drone tự bay quanh tàu
  sat.followT -= dt;
  if (sat.followT <= 0 && sat.canMove && sat.win && !sat.win.closed) {
    sat.followT = 0.5;
    try {
      sat.x = window.screenX + window.outerWidth + 16;
      sat.y = window.screenY + 100;
      sat.win.moveTo(Math.round(sat.x), Math.round(sat.y));
    } catch (e) { /* popup mất quyền di chuyển: đứng yên */ }
  }
}

/* chewer gặm khiên thay vì gặm cửa sổ chính */
function damageShield(e) {
  const sat = shieldSat();
  if (!sat) { e.onShield = false; e.latched = null; return; }
  AudioEngine.sfx.shrink(); G.shake = Math.max(G.shake, 4);
  burst(e.x, e.y, 8, ["#38bdf8", "#ffffff"], 180);
  if (sat.sim) {
    sat.hearts = Math.max(0, (sat.hearts ?? 5) - 1);
    if (sat.hearts <= 0) SatManager.kill(sat.id, "killed");
  } else {
    sat.shieldPx = Math.max(0, (sat.shieldPx ?? 60) - 12);
    try { // thu nhỏ popup thật để máu kính nhìn thấy được
      const w = sat.win;
      w.resizeTo(Math.max(120, w.outerWidth - 12), Math.max(90, w.outerHeight - 8));
    } catch (err) { /* bỏ qua */ }
    if (sat.shieldPx <= 0) SatManager.kill(sat.id, "killed");
  }
}

/* ---------------- M4 — MƯA MẢNH VỠ (Debris Rain) ----------------
 * Boss slam 50% → thay bằng 2-3 mảnh vỡ vệ tinh bay về cửa sổ chính (150px/s).
 * - Telegraph đỏ 0.7s trước khi xuất phát; click = 1 dmg (HP 3).
 * - Chạm cửa sổ chính → nổ: shrinkWindow(15,12) + shake 10 + jitter 20.
 * - Đóng tay = coi như bắn hạ nhưng không điểm, không gem (chống exploit).
 * - Fallback: bay trong arena từ viền vào tâm tàu; chạm tàu = 1 dmg;
 *   chạm viền arena = nứt viền (+ thu nhỏ arena nếu đang ở chế độ ảo). */
function spawnDebris() {
  if (SAT_MODE === "off" || SatManager.anyRole("debris")) return;
  const n = 2 + (Math.random() < 0.5 ? 1 : 0);
  setBanner(I18N.t("sat.debris_spawn"), "");
  AudioEngine.sfx.boss();
  for (let i = 0; i < n; i++) {
    SatManager.request("debris", {
      hp: 3, color: "#ff5a5a", label: I18N.t("sat.debris_label"), w: 200, h: 140, speed: 150,
      onClose: (mode, s) => {
        if (mode === "impact" || mode === "killed") {
          const p = s.sim ? { x: s.x + s.sw / 2, y: s.y + s.sh / 2 } : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
          burst(p.x, p.y, 22, ["#ff5a5a", "#ffffff"], 300);
        }
        // manual: không thưởng, không phạt
      },
    });
  }
}

function launchDebris(sat) {
  const sp = sat.opts.speed || 150;
  AudioEngine.sfx.shoot();
  if (sat.sim) {
    const s = G.ship, cx = sat.x + sat.sw / 2, cy = sat.y + sat.sh / 2;
    const d = hypot(s.x - cx, s.y - cy) || 1;
    sat.vx = (s.x - cx) / d * sp; sat.vy = (s.y - cy) / d * sp;
  } else {
    let sx, sy;
    try { sx = sat.win.screenX + sat.w / 2; sy = sat.win.screenY + sat.h / 2; }
    catch (e) { return; }
    const mx = window.screenX + window.outerWidth / 2, my = window.screenY + window.outerHeight / 2;
    const d = hypot(mx - sx, my - sy) || 1;
    sat.vx = (mx - sx) / d * sp; sat.vy = (my - sy) / d * sp;
    SatManager.steer(sat.id, sat.vx, sat.vy);
  }
}

function updateDebris(dt) {
  for (const sat of SatManager.list()) {
    if (sat.role !== "debris" || sat.dead) continue;
    if (sat.warnT === undefined) sat.warnT = 0.7; // telegraph bắt đầu khi vệ tinh đã sống
    if (sat.warnT > 0) {
      sat.warnT -= dt;
      if (sat.warnT <= 0) launchDebris(sat);
      continue;
    }
    if (sat.sim) {
      sat.x += sat.vx * dt; sat.y += sat.vy * dt;
      const s = G.ship, b = bounds();
      const cx = sat.x + sat.sw / 2, cy = sat.y + sat.sh / 2;
      if (dist2(s.x, s.y, cx, cy) < (s.r + 34) * (s.r + 34)) {
        hurtShip(1, cx, cy);
        SatManager.kill(sat.id, "impact");
        continue;
      }
      if (cx < b.x || cx > b.x + b.w || cy < b.y || cy > b.y + b.h) {
        addCrack(cx, cy);
        G.shake = Math.max(G.shake, 8);
        if (!winCtrl.ok && arena) shrinkWindow(8, 6); // arena ảo chính là cửa sổ
        SatManager.kill(sat.id, "impact");
      }
    } else {
      sat.colT = (sat.colT || 0) - dt; // check va chạm mỗi 0.2s
      if (sat.colT <= 0) {
        sat.colT = 0.2;
        try {
          const sx = sat.win.screenX, sy = sat.win.screenY;
          const mx = window.screenX, my = window.screenY, mw = window.outerWidth, mh = window.outerHeight;
          if (sx < mx + mw && sx + sat.w > mx && sy < my + mh && sy + sat.h > my) {
            shrinkWindow(15, 12); G.shake = 10; windowJitter(20);
            AudioEngine.sfx.bigboom();
            addFloat(window.innerWidth / 2, window.innerHeight / 2 - 40, I18N.t("sat.debris_hit"), "#ff5a5a", true);
            SatManager.kill(sat.id, "impact");
          }
        } catch (e) { /* popup đã đóng */ }
      }
    }
  }
}

/* vết nứt viền arena (mô phỏng), mờ dần 3s */
function addCrack(x, y) {
  const b = bounds();
  const edge = Math.abs(x - b.x) < 40 ? "left" : Math.abs(x - (b.x + b.w)) < 40 ? "right"
    : Math.abs(y - b.y) < 40 ? "top" : "bottom";
  G.cracks.push({ x: clamp(x, b.x, b.x + b.w), y: clamp(y, b.y, b.y + b.h), edge, t: 3 });
  AudioEngine.sfx.crack();
}
function updateCracks(dt) {
  for (let i = G.cracks.length - 1; i >= 0; i--) { G.cracks[i].t -= dt; if (G.cracks[i].t <= 0) G.cracks.splice(i, 1); }
}
function drawCracks() {
  for (const c of G.cracks) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, c.t);
    ctx.strokeStyle = "#ff8f8f"; ctx.lineWidth = 2;
    ctx.beginPath();
    const horiz = c.edge === "top" || c.edge === "bottom";
    for (let i = -3; i <= 3; i++) {
      const jx = c.x + (horiz ? i * 12 : (i % 2) * 8 - 4), jy = c.y + (horiz ? (i % 2) * 8 - 4 : i * 12);
      i === -3 ? ctx.moveTo(jx, jy) : ctx.lineTo(jx, jy);
    }
    ctx.stroke();
    ctx.restore();
  }
}

/* ---------------- M8 — QUẢ BOM CƯỜI (Bomb Window) ----------------
 * Act 2+, wave ≥ 8, mỗi wave tối đa 2 quả, không cùng lúc với M5.
 * Đếm ngược 15s (số to trong popup qua sat-tick + khung giả vẽ số).
 * Hết giờ → nổ: 5-6 mini + hất tàu văng. Phá kịp (8 click) → +2 gem +500.
 * ĐÓNG TAY = nổ ngay, toàn dasher. Fallback: khung giả nhấp nháy đỏ-cam. */
/* nảy khung giả */
function bounceSimSat(s, mul, dt) {
  s.x += s.vx * mul * dt; s.y += s.vy * mul * dt;
  const b = bounds();
  if (s.x < b.x) { s.x = b.x; s.vx = Math.abs(s.vx); }
  else if (s.x + s.sw > b.x + b.w) { s.x = b.x + b.w - s.sw; s.vx = -Math.abs(s.vx); }
  if (s.y < b.y) { s.y = b.y; s.vy = Math.abs(s.vy); }
  else if (s.y + s.sh > b.y + b.h) { s.y = b.y + b.h - s.sh; s.vy = -Math.abs(s.vy); }
}

function knockShip(fx, fy, power) {
  const s = G.ship;
  if (!s || G.phase !== "play") return;
  const dx = s.x - fx, dy = s.y - fy, d = hypot(dx, dy) || 1;
  const p = Math.min(power, 700);
  s.kbvx = (s.kbvx || 0) + dx / d * p;
  s.kbvy = (s.kbvy || 0) + dy / d * p;
}

function explodeBomb(sat, manual) {
  if (sat.exploded) return;
  sat.exploded = true;
  const p = nestSpawnPoint(sat);
  const n = 5 + (Math.random() < 0.5 ? 1 : 0);
  const type = manual ? "dasher" : "mini";
  for (let i = 0; i < n; i++) spawnEnemyAt(type, p.x + rand(-60, 60), p.y + rand(-60, 60));
  knockShip(p.x, p.y, 460);
  burst(p.x, p.y, 40, ["#ff5722", "#ff9800", "#ffd166", "#ffffff"], 420);
  jxShake(10, 400, 8); windowJitter(26);
  AudioEngine.sfx.bigboom();
  addFloat(p.x, p.y - 30, manual ? I18N.t("sat.bomb_tick") : I18N.t("sat.bomb_boom"), "#ff5722", true);
}

function onBombClose(mode, sat) {
  const p = nestSpawnPoint(sat);
  if (mode === "manual") {
    explodeBomb(sat, true);
  } else if (mode === "killed") {
    burst(p.x, p.y, 24, ["#ff9800", "#ffd166", "#ffffff"], 300);
    for (let i = 0; i < 2; i++) {
      const a = Math.random() * Math.PI * 2;
      G.gems.push({ x: p.x, y: p.y, vx: Math.cos(a) * 130, vy: Math.sin(a) * 130, v: 1, t: rand(0, 9) });
    }
    G.score += 500;
    addFloat(p.x, p.y - 30, I18N.t("sat.bomb_killed"), "#ffd166", true);
    AudioEngine.sfx.pickup();
  }

}

function updateBombs(dt) {
  for (const sat of SatManager.list()) {
    if (sat.role !== "bomb" || sat.dead) continue;
    sat.fuseT -= dt;
    const secs = Math.max(0, Math.ceil(sat.fuseT));
    if (secs !== sat.tickLast) {
      sat.tickLast = secs;
      if (!sat.sim) SatManager.send(sat.id, { type: "sat-tick", id: sat.id, t: secs }); // popup thật hiện số
      AudioEngine.sfx.click();
    }
    if (sat.fuseT <= 0) {
      explodeBomb(sat, false);
      SatManager.kill(sat.id, "exploded");
    }
  }
}

function maybeTriggerBomb(n) {
  if (n < 8 || G.bombWave === n) return;
  if (SatManager.anyRole("mother") || SatManager.anyRole("bomb")) return;
  G.bombWave = n;
  let made = 0;
  for (let i = 0; i < 2; i++) {
    const sat = SatManager.request("bomb", {
      hp: 8, color: "#ff5722", label: I18N.t("sat.bomb_label"), w: 300, h: 220,
      onClose: onBombClose,
    });
    if (sat) { made++; sat.fuseT = 15; sat.tickLast = -1; }
    else break;
  }
  if (made > 0) {
    setBanner(I18N.t("sat.bomb_spawn"), "");
    AudioEngine.sfx.wave();
  } else if (SAT_MODE === "off") {
    spawnEnemy("dasher"); spawnEnemy("dasher");
  }
}

/* ---------------- M6 — MỘT THÀNH HAI (Giant/Minion) ----------------
 * Act 2+, wave ≥ 9, mỗi wave 1 lần. Khổng lồ (8 HP) bị phá → "BỐP!" tách 2 nhóc
 * (HP 4, nhỏ bằng nửa). Nhóc mỗi 4s nhả 1 mini (tối đa 6); phá cả 2 → 1 heart + 2 gem.
 * ĐÓNG TAY khổng lồ = tách ngay nhưng cả 2 nổi giận (nhanh x1.5, nhả mỗi 2.5s).
 * ĐÓNG TAY 1 nhóc = nhóc còn lại giận 12s (nhả nhanh gấp đôi). */
function spawnMinion(parent, enraged) {
  const sat = SatManager.request("minion", {
    hp: 4, color: "#8bc34a", label: I18N.t("sat.giant_label"), w: 210, h: 150,
    enraged, onClose: onMinionClose,
  });
  if (!sat) return null;
  const sp = (enraged ? 1.5 : 1) * (70 + Math.random() * 40);
  const a = Math.random() * Math.PI * 2;
  sat.vx = Math.cos(a) * sp; sat.vy = Math.sin(a) * sp;
  sat.spawnT = enraged ? 2.5 : 4; sat.spawned = 0; sat.maxSpawns = 6; sat.enrageT = 0; sat.steerT = 0;
  if (sat.sim && parent && parent.sim) {
    const b = bounds();
    sat.x = clamp(parent.x + parent.sw / 2 - sat.sw / 2 + rand(-70, 70), b.x, Math.max(b.x, b.x + b.w - sat.sw));
    sat.y = clamp(parent.y + parent.sh / 2 - sat.sh / 2 + rand(-50, 50), b.y, Math.max(b.y, b.y + b.h - sat.sh));
  }
  return sat;
}

function liveMinion(exceptId) {
  return SatManager.list().find(s => s.role === "minion" && !s.dead && s.id !== exceptId) || null;
}

function onGiantClose(mode, sat) {
  const p = nestSpawnPoint(sat);
  if (mode === "killed" || mode === "manual") {
    const enraged = mode === "manual";
    burst(p.x, p.y, 30, ["#4caf50", "#8bc34a", "#ffffff"], 340);
    AudioEngine.sfx.bigboom();
    addFloat(p.x, p.y - 30, enraged ? I18N.t("sat.giant_split_angry") : I18N.t("sat.giant_split"), "#4caf50", true);
    spawnMinion(sat, enraged);
    spawnMinion(sat, enraged);
  }

}

function onMinionClose(mode, sat) {
  const p = nestSpawnPoint(sat);
  if (mode === "manual") {
    const other = liveMinion(sat.id);
    if (other) {
      other.enrageT = 12;
      addFloat(p.x, p.y - 30, I18N.t("sat.giant_enraged"), "#ff5252", true);
      AudioEngine.sfx.boss();
    }
    burst(p.x, p.y, 20, ["#8bc34a", "#ffffff"], 300);
  } else if (mode === "killed") {
    burst(p.x, p.y, 20, ["#8bc34a", "#ffffff"], 300);
    if (!liveMinion(sat.id)) {
      // phá cả 2 nhóc → 1 heart + 2 gem
      G.pickups.push({ kind: "heart", x: p.x, y: p.y, t: 0 });
      for (let i = 0; i < 2; i++) {
        const a = Math.random() * Math.PI * 2;
        G.gems.push({ x: p.x, y: p.y, vx: Math.cos(a) * 130, vy: Math.sin(a) * 130, v: 1, t: rand(0, 9) });
      }
      addFloat(p.x, p.y - 34, I18N.t("sat.giant_caught"), "#8bc34a", true);
      AudioEngine.sfx.pickup();
    }
  }
}

function updateMinions(dt) {
  for (const sat of SatManager.list()) {
    if (sat.role !== "minion" || sat.dead) continue;
    if (performance.now() - sat.born > 45000) { SatManager.kill(sat.id, "timeout"); continue; }
    let interval = sat.opts.enraged ? 2.5 : 4;
    let speedMul = sat.opts.enraged ? 1.5 : 1;
    if (sat.enrageT > 0) {
      sat.enrageT -= dt;
      interval = Math.max(1.2, interval / 2);
      speedMul *= 1.5;
    }
    if (sat.sim) bounceSimSat(sat, speedMul, dt);
    else if (sat.canMove && sat.win && !sat.win.closed) {
      sat.steerT -= dt;
      if (sat.steerT <= 0) {
        sat.steerT = 2;
        const a = Math.random() * Math.PI * 2, sp = 70 * speedMul;
        SatManager.steer(sat.id, Math.cos(a) * sp, Math.sin(a) * sp);
      }
    }
    sat.spawnT -= dt;
    if (sat.spawnT <= 0 && sat.spawned < sat.maxSpawns) {
      sat.spawnT = interval; sat.spawned++;
      const p = nestSpawnPoint(sat);
      spawnEnemyAt("mini", p.x + rand(-30, 30), p.y + rand(-30, 30));
      AudioEngine.sfx.shrink();
    }
  }
}

function maybeTriggerGiant(n) {
  const act = actOf(n);
  if (act < 2 || n < 9 || G.giantWave === n) return;
  if (SatManager.anyRole("giant")) return;
  G.giantWave = n;
  const sat = SatManager.request("giant", {
    hp: 8, color: "#4caf50", label: I18N.t("sat.giant_big_label"), w: 420, h: 300,
    onClose: onGiantClose,
  });
  if (sat) {
    setBanner(I18N.t("sat.giant_big_spawn"), "");
    AudioEngine.sfx.boss();
  } else if (SAT_MODE === "off") {
    spawnEnemy("tank");
  }
}

/* ---------------- M5 — MẸ GÀ ĐẺ TRỨNG VÀNG (Mother/Chick) ----------------
 * Act 2+, wave ≥ 7, mỗi wave 1 lần, cần ≥ 2 slot trống (mẹ + 2 con = 3 popup).
 * Mẹ mỗi 8s đẻ 1 con (tối đa 2); con nhảy tưng tưng, mỗi 5s nhả 1 mini.
 * Phá MẸ → con "NỔI GIẬN MẤT MẸ": to x1.5, nhanh x2, nhả x2 trong 10s rồi tự vỡ
 * (rơi gem an ủi). ĐÓNG TAY mẹ = con giận + mất 1 HP. ĐÓNG TAY con = nổ, 2 mini. */
function motherChicks(motherId) {
  return SatManager.list().filter(s => s.role === "chick" && !s.dead && s.motherId === motherId);
}

function enrageChicks(motherId, msg) {
  const chicks = motherChicks(motherId);
  for (const c of chicks) c.enrageT = 10;
  if (chicks.length) {
    const p = nestSpawnPoint(chicks[0]);
    addFloat(p.x, p.y - 30, msg, "#ff9800", true);
    AudioEngine.sfx.boss();
  }
}

function onMotherClose(mode, sat) {
  const p = nestSpawnPoint(sat);
  if (mode === "killed") {
    burst(p.x, p.y, 26, ["#ff9800", "#ffd54f", "#ffffff"], 320);
    enrageChicks(sat.id, I18N.t("sat.chick_enraged"));
  } else if (mode === "manual") {
    burst(p.x, p.y, 26, ["#ff9800", "#ffd54f", "#ffffff"], 320);
    enrageChicks(sat.id, I18N.t("sat.chick_manual"));
    hurtShip(1, p.x, p.y);
  }

}

function onChickClose(mode, sat) {
  const p = nestSpawnPoint(sat);
  if (mode === "manual") {

    burst(p.x, p.y, 22, ["#ffd54f", "#ff9800", "#ffffff"], 320);
    spawnEnemyAt("mini", p.x - 22, p.y);
    spawnEnemyAt("mini", p.x + 22, p.y);
    addFloat(p.x, p.y - 26, I18N.t("sat.chick_dead"), "#ffd54f", true);
    AudioEngine.sfx.boom();
  } else if (mode === "killed") {
    burst(p.x, p.y, 14, ["#ffd54f", "#ffffff"], 240);
    AudioEngine.sfx.hit();
  }

}

function layChick(mother) {
  const sat = SatManager.request("chick", {
    hp: 4, color: "#ffd54f", label: I18N.t("sat.chick_label"), w: 170, h: 120,
    onClose: onChickClose,
  });
  if (!sat) return null;
  sat.motherId = mother.id;
  const sp = 90 + Math.random() * 60, a = Math.random() * Math.PI * 2;
  sat.vx = Math.cos(a) * sp; sat.vy = Math.sin(a) * sp;
  sat.spawnT = 2; sat.spawned = 0; sat.maxSpawns = 8; sat.enrageT = 0;
  sat.hopPh = Math.random() * 9;
  if (sat.sim && mother.sim) {
    const b = bounds();
    sat.x = clamp(mother.x + mother.sw / 2 - sat.sw / 2 + rand(-70, 70), b.x, Math.max(b.x, b.x + b.w - sat.sw));
    sat.y = clamp(mother.y + mother.sh / 2 - sat.sh / 2 + rand(-50, 50), b.y, Math.max(b.y, b.y + b.h - sat.sh));
  }
  const p = nestSpawnPoint(mother);
  addFloat(p.x, p.y - 20, I18N.t("sat.mother_lay"), "#ffd54f");
  AudioEngine.sfx.pickup();
  return sat;
}

function updateMothers(dt) {
  for (const sat of SatManager.list()) {
    if (sat.role !== "mother" || sat.dead) continue;
    if (performance.now() - sat.born > 75000) { SatManager.kill(sat.id, "timeout"); continue; }
    sat.layT = (sat.layT === undefined ? 3 : sat.layT) - dt;
    if (sat.layT <= 0) {
      if (motherChicks(sat.id).length < 2) layChick(sat);
      sat.layT = 8;
    }
  }
}

function updateChicks(dt) {
  for (const sat of SatManager.list()) {
    if (sat.role !== "chick" || sat.dead) continue;
    const enraged = sat.enrageT > 0;
    if (enraged) {
      sat.enrageT -= dt;
      if (sat.enrageT <= 0) {

        const p = nestSpawnPoint(sat);
        G.gems.push({ x: p.x, y: p.y, vx: rand(-90, 90), vy: rand(-90, 90), v: 1, t: rand(0, 9) });
        addFloat(p.x, p.y - 24, I18N.t("sat.chick_calm"), "#ffd54f");
        burst(p.x, p.y, 16, ["#ffd54f", "#ffffff"], 220);
        AudioEngine.sfx.pickup();
        SatManager.kill(sat.id, "timeout");
        continue;
      }
    }
    const speedMul = enraged ? 2 : 1;
    if (sat.sim) bounceSimSat(sat, speedMul, dt);
    sat.spawnT -= dt;
    if (sat.spawnT <= 0 && sat.spawned < sat.maxSpawns) {
      sat.spawnT = enraged ? 2.5 : 5; sat.spawned++;
      const p = nestSpawnPoint(sat);
      spawnEnemyAt("mini", p.x + rand(-24, 24), p.y + rand(-24, 24));
      AudioEngine.sfx.shrink();
    }
  }
}

function maybeTriggerMother(n) {
  if (n < 10 || G.motherWave === n) return;
  if (SatManager.anyRole("mother") || SatManager.anyRole("bomb")) return;
  if (SatManager.count() > 1) return;
  G.motherWave = n;
  const sat = SatManager.request("mother", {
    hp: 8, color: "#ff9800", label: I18N.t("sat.mother_label"), w: 340, h: 240,
    onClose: onMotherClose,
  });
  if (sat) {
    sat.layT = 3;
    setBanner(I18N.t("sat.mother_spawn"), "");
    AudioEngine.sfx.pickup();
  } else if (SAT_MODE === "off") {
    spawnEnemy("chewer"); spawnEnemy("chewer");
  }
}

/* ---------------- M7 — TÌNH YÊU SÉT ĐÁNH (Lightning Love) ----------------
 * Act 2+, wave ≥ 12, mỗi wave 1 lần, cần cả 3 slot trống.
 * 2 popup "người yêu" (5 HP) trôi về phía nhau; chạm nhau → "BÙM! TÌNH YÊU SÉT ĐÁNH!"
 * hợp thành SIÊU-POPUP 10 HP. Siêu-popup mỗi 5s bắn 1 trái tim độc vào tàu.
 * Phá siêu-popup → +4 gem +800. ĐÓNG TAY 1 người yêu = người còn lại THẤT TÌNH:
 * nhanh x2, mỗi 4s nhả 1 chaser (tối đa 4), ăn ngay 2 chaser.
 * ĐÓNG TAY siêu-popup = 3 trái tim độc bay vào tàu + hất văng.
 * Fallback: khung giả trôi trong arena, chạm nhau là hợp nhất. */
function loverOf(sat) {
  return SatManager.list().find(s => s.role === "lover" && !s.dead && s.id !== sat.id && s.pairId === sat.pairId) || null;
}

/* tâm lover trong tọa độ screen (popup thật) */
function loverScreen(sat) {
  return { x: sat.x + sat.w / 2, y: sat.y + sat.h / 2 };
}

function loverAnchor(sat) {
  if (sat.sim) return { x: sat.x + sat.sw / 2, y: sat.y + sat.sh / 2 };
  const p = nestSpawnPoint(sat);
  return { x: p.x, y: p.y };
}

function onLoverClose(mode, sat) {
  const p = loverAnchor(sat);
  if (mode === "manual") {
    // đóng tay: người còn lại THẤT TÌNH — giận dữ, đẻ quái trả thù
    const other = loverOf(sat);
    burst(p.x, p.y, 22, ["#ff5f8a", "#ff8fab", "#ffffff"], 300);
    addFloat(p.x, p.y - 28, I18N.t("sat.love_heartbroken"), "#ff5f8a", true);
    AudioEngine.sfx.boss();
    if (other && !other.dead) {
      other.heartbroken = true;
      other.spawnT = 0.5; other.spawned = 0;
      for (let i = 0; i < 2; i++) {
        const q = loverAnchor(other);
        spawnEnemyAt("chaser", q.x + rand(-50, 50), q.y + rand(-50, 50));
      }
    }
  } else if (mode === "killed") {
    burst(p.x, p.y, 16, ["#ff8fab", "#ffffff"], 240);
    addFloat(p.x, p.y - 24, "💔", "#ff8fab", true);
    AudioEngine.sfx.hit();
    const other = loverOf(sat); // người còn lại cô đơn → tự rút sau 6s
    if (other && !other.dead) other.lonelyT = 6;
  }
  // "merge"/"timeout": êm, không phạt
}

function onSuperloveClose(mode, sat) {
  const p = loverAnchor(sat);
  if (mode === "killed") {
    burst(p.x, p.y, 44, ["#ff5f8a", "#ff8fab", "#ffd166", "#ffffff"], 420);
    jxShake(8, 350, 6);
    for (let i = 0; i < 4; i++) {
      const a = Math.random() * Math.PI * 2;
      G.gems.push({ x: p.x, y: p.y, vx: Math.cos(a) * 150, vy: Math.sin(a) * 150, v: 1, t: rand(0, 9) });
    }
    G.score += 80; // §6/§1.10: phá siêu-popup = 80 cố định
    addFloat(p.x, p.y - 34, I18N.t("sat.love_broken"), "#ff8fab", true);
    AudioEngine.sfx.pickup();
  } else if (mode === "manual") {
    // đóng tay siêu-popup: 3 trái tim độc bay vào tàu + hất văng
    burst(p.x, p.y, 30, ["#ff2020", "#ff5f8a", "#ffffff"], 380);
    const s = G.ship;
    const base = Math.atan2(s.y - p.y, s.x - p.x);
    for (let i = -1; i <= 1; i++) {
      const a = base + i * 0.28;
      G.ebullets.push({ x: p.x, y: p.y, vx: Math.cos(a) * 260, vy: Math.sin(a) * 260, r: 7, life: 4 });
    }
    knockShip(p.x, p.y, 420);
    jxShake(8, 350, 6);
    addFloat(p.x, p.y - 30, I18N.t("sat.love_manual"), "#ff2020", true);
    AudioEngine.sfx.bigboom();
  }
}

function mergeLovers(a, b) {
  if (!a || !b || a.dead || b.dead || a.merged || b.merged) return;
  a.merged = b.merged = true;
  const pa = loverAnchor(a), pb = loverAnchor(b);
  const mx = (pa.x + pb.x) / 2, my = (pa.y + pb.y) / 2;
  burst(mx, my, 40, ["#ff5f8a", "#ffd166", "#ffffff"], 400);
  jxShake(7, 300, 5); windowJitter(18);
  AudioEngine.sfx.zap();
  addFloat(mx, my - 40, I18N.t("sat.love_boom"), "#ff8fab", true);
  SatManager.kill(a.id, "merge");
  SatManager.kill(b.id, "merge");
  const sat = SatManager.request("superlove", {
    hp: 10, color: "#ff5f8a", label: I18N.t("sat.love_label"), w: 340, h: 240,
    onClose: onSuperloveClose,
  });
  if (sat) {
    sat.heartT = 2.5; sat.steerT = 0;
    const sp = 40 + Math.random() * 30, an = Math.random() * Math.PI * 2;
    sat.vx = Math.cos(an) * sp; sat.vy = Math.sin(an) * sp;
    if (sat.sim) {
      const bd = bounds();
      sat.x = clamp(mx - sat.sw / 2, bd.x, Math.max(bd.x, bd.x + bd.w - sat.sw));
      sat.y = clamp(my - sat.sh / 2, bd.y, Math.max(bd.y, bd.y + bd.h - sat.sh));
    }
    setBanner(I18N.t("sat.love_spawn"), "");
  }
}

function updateLovers(dt) {
  for (const sat of SatManager.list()) {
    if (sat.role !== "lover" || sat.dead) continue;
    if (performance.now() - sat.born > 45000) { SatManager.kill(sat.id, "timeout"); continue; }
    const p = loverOf(sat);
    if (!p) { // mất đôi (bị phá/đóng) → cô đơn, tự rút
      sat.lonelyT = (sat.lonelyT === undefined ? 6 : sat.lonelyT) - dt;
      if (sat.lonelyT <= 0) {
        const q = loverAnchor(sat);
        addFloat(q.x, q.y - 24, I18N.t("sat.love_lonely"), "#ff8fab");
        SatManager.kill(sat.id, "timeout");
      }
      continue;
    }
    const sp = sat.heartbroken ? 150 : 75;
    if (sat.sim) {
      const ax = sat.x + sat.sw / 2, ay = sat.y + sat.sh / 2;
      const bx = p.x + p.sw / 2, by = p.y + p.sh / 2;
      const dx = bx - ax, dy = by - ay, d = hypot(dx, dy) || 1; // OPT: fast hypot (PR #19)
      sat.vx = dx / d * sp; sat.vy = dy / d * sp;
      bounceSimSat(sat, 1, dt);
      if (d < 85) mergeLovers(sat, p);
    } else if (sat.canMove && sat.win && !sat.win.closed) {
      // OPT: tính tâm 2 popup 1 lần/frame, tái dùng d cho cả steer + merge check
      const a = loverScreen(sat), bpos = loverScreen(p);
      const dx = bpos.x - a.x, dy = bpos.y - a.y, d = hypot(dx, dy) || 1;
      sat.steerT = (sat.steerT || 0) - dt;
      if (sat.steerT <= 0) {
        sat.steerT = 1.2;
        SatManager.steer(sat.id, dx / d * sp, dy / d * sp);
      }
      if (d < (sat.w + p.w) / 2 * 0.7) mergeLovers(sat, p);
    }
    // thất tình → đẻ chaser trả thù
    if (sat.heartbroken) {
      sat.spawnT -= dt;
      if (sat.spawnT <= 0 && sat.spawned < 4) {
        sat.spawnT = 4; sat.spawned++;
        const q = loverAnchor(sat);
        spawnEnemyAt("chaser", q.x + rand(-40, 40), q.y + rand(-40, 40));
        AudioEngine.sfx.shrink();
        addFloat(q.x, q.y - 20, I18N.t("sat.love_revenge"), "#ff5f8a");
      }
    }
  }
}

function updateSuperlove(dt) {
  for (const sat of SatManager.list()) {
    if (sat.role !== "superlove" || sat.dead) continue;
    if (performance.now() - sat.born > 60000) { SatManager.kill(sat.id, "timeout"); continue; }
    updateSayNangAura(sat); // CEO §9-Q2: aura I18N.t("sat.love_crush_status") — quái trong 200px tấn công lẫn nhau
    // trôi lững lờ
    if (sat.sim) bounceSimSat(sat, 1, dt);
    else if (sat.canMove && sat.win && !sat.win.closed) {
      sat.steerT -= dt;
      if (sat.steerT <= 0) {
        sat.steerT = 2.5;
        const a = Math.random() * Math.PI * 2, sp = 45;
        SatManager.steer(sat.id, Math.cos(a) * sp, Math.sin(a) * sp);
      }
    }
    // mỗi 5s bắn 1 trái tim độc vào tàu
    sat.heartT -= dt;
    if (sat.heartT <= 0) {
      sat.heartT = 5;
      const p = loverAnchor(sat), s = G.ship;
      const a = Math.atan2(s.y - p.y, s.x - p.x);
      G.ebullets.push({ x: p.x, y: p.y, vx: Math.cos(a) * 170, vy: Math.sin(a) * 170, r: 7, life: 4 });
      AudioEngine.sfx.shrink();
      addFloat(p.x, p.y - 30, "💘!", "#ff8fab");
    }
  }
}

/* CEO chốt §9-Q2 (2026-10-01): aura "say nắng" của siêu-popup M7 — mọi độ khó.
 * Quái trong bán kính 200px bị "say nắng" 6s (refresh khi còn trong aura):
 * thay vì đuổi tàu, chúng TẤN CÔNG LẪN NHAU. Kill do say nắng vẫn cộng điểm gốc
 * cho player (§6 "điểm gốc cố định") — đây là "chaos vui vẻ", không phải bug. */
function updateSayNangAura(sat) {
  const p = loverAnchor(sat), R = 200;
  for (const e of G.enemies) {
    if (e.dead) continue;
    const dx = e.x - p.x, dy = e.y - p.y;
    if (dx * dx + dy * dy < R * R) {
      if (!(e.sayNangT > 0)) {
        e.sayNangT = 6;
        addFloat(e.x, e.y - e.r - 12, I18N.t("sat.love_crush"), "#ff8fab");
        AudioEngine.sfx.pickup();
      } else e.sayNangT = 6; // còn trong aura → refresh 6s
    }
  }
}

/* quái "say nắng": đuổi quái gần nhất còn sống, chạm → cắn 1 dmg (không đuổi tàu nữa) */
function sayNangUpdate(e, dt, spd) {
  let tgt = null, best = Infinity;
  for (const o of G.enemies) {
    if (o === e || o.dead) continue;
    const d2v = dist2(e.x, e.y, o.x, o.y);
    if (d2v < best) { best = d2v; tgt = o; }
  }
  if (!tgt) return; // chỉ còn 1 mình → đứng yên, hết say nắng sẽ đuổi tàu lại
  const dx = tgt.x - e.x, dy = tgt.y - e.y, d = Math.hypot(dx, dy) || 1;
  e.x += dx / d * spd * dt; e.y += dy / d * spd * dt;
  if (d < e.r + tgt.r + 4) {
    damageEnemy(tgt, Math.max(1, e.dmg || 1), null);
    e.kbx -= dx / d * 80; e.kby -= dy / d * 80; // hất nhẹ ra để khỏi dính chùm cắn liên tục
  }
}

function maybeTriggerLove(n) {
  const act = actOf(n);
  if (act < 2 || n < 12 || G.loveWave === n) return;
  if (SatManager.count() > 0) return; // cần cả 3 slot trống
  G.loveWave = n;
  const pairId = "love" + Date.now().toString(36);
  const a = SatManager.request("lover", {
    hp: 5, color: "#ff5f8a", label: I18N.t("sat.love_pair_status"), w: 260, h: 180, onClose: onLoverClose,
  });
  const b = SatManager.request("lover", {
    hp: 5, color: "#c86bff", label: I18N.t("sat.love_pair_status"), w: 260, h: 180, onClose: onLoverClose,
  });
  if (a && b) {
    a.pairId = b.pairId = pairId;
    // đặt 2 khung giả ở 2 góc đối nhau để chúng phải "tìm nhau"
    if (a.sim && b.sim) {
      const bd = bounds();
      const corners = [
        { x: bd.x + 24, y: bd.y + 56 },
        { x: bd.x + bd.w - 24 - b.sw, y: bd.y + bd.h - 24 - b.sh },
      ];
      b.x = corners[1].x; b.y = corners[1].y;
    }
    setBanner(I18N.t("sat.love_pair"), "");
    AudioEngine.sfx.wave();
  } else {
    if (a) SatManager.kill(a.id, "timeout");
    if (b) SatManager.kill(b.id, "timeout");
    if (SAT_MODE === "off") { spawnEnemy("chaser"); spawnEnemy("chaser"); }
  }
}

/* ---------------- M10 — GƯƠNG THẦN LẦY LỘI (Silly Mirror) ----------------
 * Wave ≥ 10, mỗi wave 1 lần, tối đa 1 gương sống.
 * Gương (6 HP) chiếu "vùng gương" bán kính 85px: đạn player bay vào bị PHẢN CHIỀU
 * ngược lại thành đạn địch (1 dmg). Đừng bắn vào gương!
 * Phá gương → +2 gem +60. ĐÓNG TAY = gương vỡ: 4 mảnh vỡ bay vào tàu.
 * Fallback: khung giả — vùng gương vẽ quanh khung. */
function mirrorAnchor(sat) {
  if (sat.sim) return { x: sat.x + sat.sw / 2, y: sat.y + sat.sh / 2 };
  const p = nestSpawnPoint(sat);
  return { x: p.x, y: p.y };
}

function onMirrorClose(mode, sat) {
  const p = mirrorAnchor(sat);
  if (mode === "killed") {
    burst(p.x, p.y, 26, ["#a5f3fc", "#ffffff", "#f0abfc"], 320);
    for (let i = 0; i < 2; i++) {
      const a = Math.random() * Math.PI * 2;
      G.gems.push({ x: p.x, y: p.y, vx: Math.cos(a) * 130, vy: Math.sin(a) * 130, v: 1, t: rand(0, 9) });
    }
    G.score += 60; // §6/§2.10: phá gương = 60 cố định
    addFloat(p.x, p.y - 30, I18N.t("sat.mirror_killed"), "#a5f3fc", true);
    AudioEngine.sfx.pickup();
  } else if (mode === "manual") {
    // đóng tay: gương vỡ — 4 mảnh vỡ bay vào tàu
    burst(p.x, p.y, 30, ["#a5f3fc", "#ff5470", "#ffffff"], 360);
    const s = G.ship;
    const base = Math.atan2(s.y - p.y, s.x - p.x);
    for (let i = 0; i < 4; i++) {
      const a = base + (i - 1.5) * 0.3;
      G.ebullets.push({ x: p.x, y: p.y, vx: Math.cos(a) * 240, vy: Math.sin(a) * 240, r: 6, life: 3.5 });
    }
    jxShake(6, 300, 4);
    addFloat(p.x, p.y - 30, I18N.t("sat.mirror_broken"), "#ff5470", true);
    AudioEngine.sfx.bigboom();
  }
}

/* đạn player bay vào vùng gương → phản chiếu thành đạn địch; trả về true nếu đã phản */
function mirrorReflect(bl) {
  if (!SatManager.anyRole("mirror")) return false; // OPT: không gương sống → skip, tránh alloc SatManager.list() mỗi viên đạn
  for (const m of SatManager.list()) {
    if (m.role !== "mirror" || m.dead) continue;
    if (bl.mirrorId === m.id) continue; // mỗi gương chỉ phản 1 viên 1 lần
    // OPT: dùng anchor đã cache trong updateMirrors (1 lần/frame), fallback tính trực tiếp
    const ax = m._mx !== undefined ? m._mx : mirrorAnchor(m).x;
    const ay = m._my !== undefined ? m._my : mirrorAnchor(m).y;
    const R = 85;
    if (dist2(bl.x, bl.y, ax, ay) < R * R) {
      bl.mirrorId = m.id;
      G.ebullets.push({
        x: bl.x, y: bl.y, vx: -bl.vx, vy: -bl.vy,
        r: Math.max(4, bl.r || 4), life: 3,
      });
      burst(bl.x, bl.y, 10, ["#a5f3fc", "#ffffff", "#f0abfc"], 200);
      addFloat(bl.x, bl.y - 14, I18N.t("sat.mirror_reflect"), "#a5f3fc");
      AudioEngine.sfx.boing();
      return true;
    }
  }
  return false;
}

function updateMirrors(dt) {
  for (const sat of SatManager.list()) {
    if (sat.role !== "mirror" || sat.dead) continue;
    if (performance.now() - sat.born > 40000) { SatManager.kill(sat.id, "timeout"); continue; }
    const _ma = mirrorAnchor(sat); sat._mx = _ma.x; sat._my = _ma.y; // OPT: cache anchor 1 lần/frame cho mirrorReflect
    if (sat.sim) { // gương lững lờ trôi cho khó ngắm
      sat.steerT = (sat.steerT || 0);
      if (!sat.vx) { const a = Math.random() * Math.PI * 2; sat.vx = Math.cos(a) * 45; sat.vy = Math.sin(a) * 45; }
      bounceSimSat(sat, 1, dt);
    }
  }
}

function maybeTriggerMirror(n) {
  if (n < 10 || G.mirrorWave === n) return;
  if (SatManager.anyRole("mirror") || SatManager.count() >= 2) return;
  G.mirrorWave = n;
  const sat = SatManager.request("mirror", {
    hp: 6, color: "#67e8f9", label: I18N.t("sat.mirror_label"), w: 280, h: 200,
    onClose: onMirrorClose,
  });
  if (sat) {
    setBanner(I18N.t("sat.mirror_spawn"), "");
    AudioEngine.sfx.wave();
  } else if (SAT_MODE === "off") {
    spawnEnemy("dasher");
  }
}

/* ---------------- M9 — MÁY HÚT BỤI VŨ TRỤ (Cosmic Vacuum) ----------------
 * Act 3+, mỗi wave 1 lần, tối đa 1 máy sống.
 * Hố đen (8 HP) hút quái trong bán kính 240px; quái chạm tâm → bị NUỐT (mất, không điểm).
 * Mỗi 7s hoặc nuốt đủ 3 con → NHẢ ra: quái giận dữ (nhanh x1.6).
 * Phá máy → mỗi con đã nuốt thành 1 gem +150 điểm/con.
 * ĐÓNG TAY = nhả hết ngay + sóng xung kích hất tàu.
 * Fallback: khung giả vẽ hố đen + vòng xoáy hút. */
function vacAnchor(sat) {
  if (sat.sim) return { x: sat.x + sat.sw / 2, y: sat.y + sat.sh / 2 };
  const p = nestSpawnPoint(sat);
  return { x: p.x, y: p.y };
}

function spitVacuum(sat) {
  const p = vacAnchor(sat);
  const n = sat.swallowed ? sat.swallowed.length : 0;
  if (n > 0) {
    for (const type of sat.swallowed) {
      const e = spawnEnemyAt(type, p.x + rand(-50, 50), p.y + rand(-50, 50));
      if (e) e.speed *= 1.6; // nhả ra giận dữ
    }
    sat.swallowed = [];
    burst(p.x, p.y, 30, ["#7c3aed", "#c084fc", "#ffffff"], 380);
    addFloat(p.x, p.y - 30, I18N.t("sat.vacuum_release"), "#c084fc", true);
    AudioEngine.sfx.boom();
  }
  sat.spitT = 7;
}

function onVacuumClose(mode, sat) {
  const p = vacAnchor(sat);
  const swallowed = sat.swallowed || [];
  const n = swallowed.length;
  if (mode === "killed") {
    burst(p.x, p.y, 36, ["#7c3aed", "#ffd166", "#ffffff"], 400);
    jxShake(7, 320, 5);
    // §6/§3.4: quái bị nuốt "chết luôn" → điểm gốc từng con + gem như giết thường + 40 phá máy
    let pts = 40, gems = 0;
    for (const type of swallowed) {
      const def = MONSTER_REGISTRY[type];
      pts += def && def.score ? def.score : 10;
      const gn = type === "tank" ? 3 : 1, xv = def && def.xp ? def.xp : 1;
      for (let i = 0; i < gn; i++) {
        const a = Math.random() * Math.PI * 2;
        G.gems.push({ x: p.x, y: p.y, vx: Math.cos(a) * 140, vy: Math.sin(a) * 140, v: xv, t: rand(0, 9) });
      }
      gems += gn;
    }
    G.score += pts;
    if (n > 0) {
      addFloat(p.x, p.y - 34, I18N.t("sat.vacuum_killed", { gems, pts }), "#ffd166", true);
    } else {
      addFloat(p.x, p.y - 34, I18N.t("sat.vacuum_killed_simple"), "#c084fc", true);
    }
    AudioEngine.sfx.pickup();
  } else if (mode === "manual") {
    // đóng tay: ho ra tất cả + sóng xung kích
    spitVacuum(sat);
    knockShip(p.x, p.y, 520);
    jxShake(9, 380, 7); windowJitter(22);
    burst(p.x, p.y, 34, ["#7c3aed", "#ff5470", "#ffffff"], 420);
    addFloat(p.x, p.y - 30, I18N.t("sat.vacuum_manual"), "#ff5470", true);
    AudioEngine.sfx.bigboom();
  }
}

function updateBlackholes(dt) {
  for (const sat of SatManager.list()) {
    if (sat.role !== "blackhole" || sat.dead) continue;
    if (performance.now() - sat.born > 45000) { SatManager.kill(sat.id, "timeout"); continue; }
    sat.swallowed = sat.swallowed || [];
    const p = vacAnchor(sat), R = 240;
    // hút quái xung quanh (xoáy trôn ốc)
    // OPT: dist2 kiểm tra tầm trước — chỉ sqrt khi quái đã trong vùng hút
    const R2 = R * R;
    for (const e of G.enemies) {
      if (e.dead || e.type === "boss") continue;
      const dx = p.x - e.x, dy = p.y - e.y, d2 = dx * dx + dy * dy;
      if (d2 < R2) {
        const d = Math.sqrt(d2);
        if (d > 1) {
          const pull = (1 - d / R) * 640;
          const inv = 1 / d;
          e.x += dx * inv * pull * dt;
          e.y += dy * inv * pull * dt;
          // xoáy tiếp tuyến cho vui mắt
          e.x += -dy * inv * pull * 0.45 * dt;
          e.y += dx * inv * pull * 0.45 * dt;
          if (d < 26) {
            e.dead = true; // nuốt: mất luôn, không điểm/kill
            sat.swallowed.push(e.type);
            burst(p.x, p.y, 6, ["#7c3aed", "#ffffff"], 140);
            AudioEngine.sfx.slurp();
            addFloat(p.x + rand(-20, 20), p.y - 24, I18N.t("sat.vacuum_suck"), "#c084fc");
            if (sat.swallowed.length >= 3) spitVacuum(sat);
          }
        }
      }
    }
    // CEO chốt §9-Q4 (2026-10-01): hố đen tương tác gem theo độ khó —
    // CHỈ Khắc nghiệt mới nuốt gem mất luôn; Chill/Thường: gem tới tâm bị HẤT VĂNG ra ngoài
    const hardVac = (typeof DIFF_KEY !== "undefined" && (DIFF_KEY === "hardcore" || DIFF_KEY === "hard"));
    for (let i = G.gems.length - 1; i >= 0; i--) {
      const gm = G.gems[i];
      const gdx = p.x - gm.x, gdy = p.y - gm.y, gd = Math.hypot(gdx, gdy);
      if (gd < R && gd > 1) {
        const pull = (1 - gd / R) * 480;
        gm.x += gdx / gd * pull * dt; gm.y += gdy / gd * pull * dt;
        gm.x += -gdy / gd * pull * 0.45 * dt; gm.y += gdx / gd * pull * 0.45 * dt; // xoáy trôn ốc
        if (gd < 26) {
          AudioEngine.sfx.slurp();
          if (hardVac) { // Khắc nghiệt: nuốt mất luôn
            G.gems.splice(i, 1);
            burst(p.x, p.y, 6, ["#7c3aed", "#ffffff"], 140);
            addFloat(p.x + rand(-20, 20), p.y - 24, I18N.t("sat.vacuum_gem"), "#c084fc");
          } else { // Chill/Thường: hất văng ra ngoài, không mất vĩnh viễn
            const ga = Math.atan2(gm.y - p.y, gm.x - p.x) + rand(-0.4, 0.4);
            gm.x = p.x + Math.cos(ga) * 40; gm.y = p.y + Math.sin(ga) * 40;
            gm.vx = Math.cos(ga) * 420; gm.vy = Math.sin(ga) * 420;
            burst(gm.x, gm.y, 6, ["#7df9ff", "#ffffff"], 160);
          }
        }
      }
    }
    // nhả định kỳ mỗi 7s
    sat.spitT = (sat.spitT === undefined ? 7 : sat.spitT) - dt;
    if (sat.spitT <= 0) spitVacuum(sat);
    // khung giả lững lờ
    if (sat.sim) {
      if (!sat.vx) { const a = Math.random() * Math.PI * 2; sat.vx = Math.cos(a) * 35; sat.vy = Math.sin(a) * 35; }
      bounceSimSat(sat, 1, dt);
    }
  }
}

function maybeTriggerVacuum(n) {
  const act = actOf(n);
  if (act < 3 || G.vacWave === n) return;
  if (SatManager.anyRole("blackhole") || SatManager.count() >= 2) return;
  G.vacWave = n;
  const sat = SatManager.request("blackhole", {
    hp: 8, color: "#7c3aed", label: I18N.t("sat.vacuum_label"), w: 300, h: 220,
    onClose: onVacuumClose,
  });
  if (sat) {
    sat.swallowed = []; sat.spitT = 7;
    setBanner(I18N.t("sat.vacuum_spawn"), "");
    AudioEngine.sfx.wave();
  } else if (SAT_MODE === "off") {
    spawnEnemy("tank");
  }
}

/* vẽ vùng hiệu lực của popup THẬT (gương/hố đen nằm ngoài arena nên phải
 * chiếu vùng ảnh hưởng vào trong để player thấy) */
function drawSatFields() {
  const t = performance.now();
  for (const s of SatManager.list()) {
    if (s.dead || s.sim) continue;
    let a = null, R = 0, col = "#fff", label = "";
    if (s.role === "mirror") { a = mirrorAnchor(s); R = 85; col = "#67e8f9"; label = I18N.t("sat.mirror_zone"); }
    else if (s.role === "blackhole") { a = vacAnchor(s); R = 240; col = "#7c3aed"; label = I18N.t("sat.vacuum_zone"); }
    else continue;
    const pulse = 0.5 + 0.3 * Math.sin(t / 400);
    ctx.save();
    ctx.globalAlpha = 0.16 + pulse * 0.1;
    ctx.strokeStyle = col; ctx.lineWidth = 2.5;
    ctx.setLineDash([10, 8]); ctx.lineDashOffset = -t / 60;
    ctx.beginPath(); ctx.arc(a.x, a.y, R, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = col; ctx.font = "700 11px system-ui"; ctx.textAlign = "center";
    ctx.fillText(label, a.x, a.y - R - 8);
    ctx.restore();
  }
}

/* ---------------- M2 — BOSS TÁCH MẢNH (Boss Split Window) — P1d ----------------
 * Boss vào phase 2 (HP 66%) → tách 3 mảnh vệ tinh bay lượn quanh cửa sổ chính.
 * - Pool HP chung: bắn/click mảnh nào cũng trừ HP boss (qua onDamage).
 * - Đóng tay mảnh = mảnh NHẬP vào arena thành mini-boss (50% HP share, chase)
 *   — không thể "đóng để thoát đòn".
 * - Mảnh chạm cửa sổ chính: cắn 8px viền gần nhất rồi bật ra (cooldown 3s/mảnh),
 *   telegraph tím 0.5s trước khi chạm.
 * - Hết boss → tất cả mảnh tự đóng (mode "cleanup").
 * - Fallback: 3 mảnh bay trong arena, chạm tàu = 1 dmg, chạm viền = cắn 8px. */
function hurtBoss(n) {
  const bs = G.boss;
  if (!bs || bs.dead) return;
  bs.hp -= n; bs.flash = 0.2;
  if (bs.hp <= 0) killBoss(); else bossSplitCheck(bs);
}

function bossSplitCheck(bs) {
  if (!bs || bs.dead || bs.split) return;
  if (bs.hp > bs.maxHp * 0.66) return; // vào phase 2 ở 66% HP
  bs.split = true;
  const hpShare = Math.ceil(bs.hp / 3); // mỗi mảnh hiển thị pool/3
  for (let i = 0; i < 3; i++) {
    const sat = SatManager.request("fragment", {
      hp: 9999, color: "#c084fc", label: I18N.t("sat.bossfrag_label"), w: 220, h: 160,
      hpShare,
      onDamage: (n) => hurtBoss(n), // pool HP chung
      onClose: (mode, s) => {
        if (mode === "manual") {
          // mảnh nhập vào arena thành mini-boss — không thể đóng để thoát đòn
          const b = bounds();
          const px = s.sim ? clamp(s.x + s.sw / 2, b.x + 40, b.x + b.w - 40) : clamp(G.ship.x + 120, b.x + 40, b.x + b.w - 40);
          const py = s.sim ? clamp(s.y + s.sh / 2, b.y + 40, b.y + b.h - 40) : clamp(G.ship.y - 80, b.y + 40, b.y + b.h - 40);
          const mini = spawnEnemyAt("chaser", px, py);
          if (mini) {
            mini.hp = mini.maxHp = Math.max(2, Math.ceil((s.opts.hpShare || 6) / 2));
            mini.color = "#c084fc"; mini.r = Math.max(mini.r, 16);
            addFloat(mini.x, mini.y - 30, I18N.t("sat.bossfrag_enter"), "#c084fc", true);
          }
        }
        // cleanup/killed: không thêm gì
      },
    });
    if (sat) {
      const ang = -Math.PI / 2 + (i - 1) * 0.9; // 3 hướng chéo lên
      const sp = 60 + Math.random() * 60; // drift 60–120px/s
      sat.vx = Math.cos(ang) * sp; sat.vy = Math.sin(ang) * sp;
      sat.biteCD = 0; sat.shipCD = 0; sat.steered = false; sat.warned = false;
    }
  }
  setBanner(I18N.t("sat.bossfrag_spawn"), "");
  AudioEngine.sfx.boss();
}

function fragmentBite(edge) {
  if (edge === "left" || edge === "right") shrinkWindow(8, 0);
  else shrinkWindow(0, 8);
  AudioEngine.sfx.crack(); G.shake = Math.max(G.shake, 6);
  addFloat(window.innerWidth / 2, 60, I18N.t("sat.bossfrag_bite"), "#c084fc", true);
}

function updateFragments(dt) {
  for (const sat of SatManager.list()) {
    if (sat.role !== "fragment" || sat.dead) continue;
    sat.biteCD = Math.max(0, (sat.biteCD || 0) - dt);
    sat.shipCD = Math.max(0, (sat.shipCD || 0) - dt);
    if (sat.sim) {
      sat.x += sat.vx * dt; sat.y += sat.vy * dt;
      const b = bounds(), s = G.ship;
      const cx = sat.x + sat.sw / 2, cy = sat.y + sat.sh / 2;
      if (sat.shipCD <= 0 && dist2(s.x, s.y, cx, cy) < (s.r + 30) * (s.r + 30)) {
        sat.shipCD = 1; hurtShip(1, cx, cy);
        sat.vx *= -1; sat.vy *= -1;
      }
      // AUDIT 2026-10-02: nhánh sim trước đây cắn mỗi frame (không đọc biteCD) — mảnh
      // chạm viền dao động trong vùng 20px, cắn ~10–20 lần × 8px cho 1 lần chạm thay vì
      // 8px/3s như nhánh popup thật. Chỉ cắn khi biteCD hết, cắn xong đặt lại 3s.
      if (cx < b.x + 20) { if (sat.biteCD <= 0) { fragmentBite("left"); sat.biteCD = 3; } sat.vx = Math.abs(sat.vx); }
      else if (cx > b.x + b.w - 20) { if (sat.biteCD <= 0) { fragmentBite("right"); sat.biteCD = 3; } sat.vx = -Math.abs(sat.vx); }
      if (cy < b.y + 20) { if (sat.biteCD <= 0) { fragmentBite("top"); sat.biteCD = 3; } sat.vy = Math.abs(sat.vy); }
      else if (cy > b.y + b.h - 20) { if (sat.biteCD <= 0) { fragmentBite("bottom"); sat.biteCD = 3; } sat.vy = -Math.abs(sat.vy); }
    } else {
      if (!sat.steered && sat.win && !sat.win.closed) { // popup đã mở → bắt đầu bay
        sat.steered = true;
        SatManager.steer(sat.id, sat.vx, sat.vy);
      }
      sat.colT = (sat.colT || 0) - dt; // check va chạm mỗi 0.2s
      if (sat.colT <= 0 && sat.biteCD <= 0) {
        sat.colT = 0.2;
        try {
          const sx = sat.win.screenX, sy = sat.win.screenY;
          const mx = window.screenX, my = window.screenY, mw = window.outerWidth, mh = window.outerHeight;
          // telegraph tím 0.5s khi mảnh bay gần cửa sổ chính (<250px)
          const nearX = Math.max(mx - (sx + sat.w), sx - (mx + mw), 0);
          const nearY = Math.max(my - (sy + sat.h), sy - (my + mh), 0);
          const nearD = hypot(nearX, nearY);
          if (nearD < 250 && !sat.warned) { sat.warned = true; SatManager.warn(sat.id); }
          else if (nearD >= 250) sat.warned = false;
          if (sx < mx + mw && sx + sat.w > mx && sy < my + mh && sy + sat.h > my) {
            const fcX = sx + sat.w / 2, fcY = sy + sat.h / 2;
            const m = Math.min(Math.abs(fcX - mx), Math.abs(fcX - (mx + mw)), Math.abs(fcY - my), Math.abs(fcY - (my + mh)));
            const edge = m === Math.abs(fcX - mx) ? "left" : m === Math.abs(fcX - (mx + mw)) ? "right" : m === Math.abs(fcY - my) ? "top" : "bottom";
            fragmentBite(edge);
            sat.vx *= -1; sat.vy *= -1; // bật ra
            SatManager.steer(sat.id, sat.vx, sat.vy);
            sat.biteCD = 3;
          }
        } catch (e) { /* popup đã đóng */ }
      }
    }
  }
}

/* ---------------- input: phím + chuột + touch ---------------- */
const keys = {};
const mouse = { x: innerWidth / 2, y: innerHeight / 2 - 100, down: false };
const touch = { active: false, moveId: null, aimId: null,
  moveOX: 0, moveOY: 0, moveX: 0, moveY: 0, aimX: 0, aimY: 0, aimDX: 0, aimDY: 0 };
window.addEventListener("keydown", e => {
  keys[e.code] = true;
  // AUDIT 2026-10-02: resume AudioContext ngay trong gesture — trước đây trang game
  // chỉ resume ở touchstart nên người chơi desktop (chuột/phím) mất toàn bộ SFX
  // procedural vì context kẹt "suspended" (gesture ở tab menu không chuyển sang popup).
  try { AudioEngine.resume(); } catch (er) {}
  SatManager.flush(); // phím cũng là user gesture hợp lệ để mở popup
  if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
  if ((e.code === "KeyP" || e.code === "Escape")) {
    if (G.phase === "play") pauseGame(true); else if (G.phase === "paused") pauseGame(false);
  }
  if (e.code === "KeyM") {
    // AUDIT 2026-10-02: trước đây M đọc qp "music" theo chuẩn "off"/"on" trong khi
    // launcher gửi "1"/"0" → vào game với nhạc tắt phải bấm M 2 lần mới bật được, và
    // trạng thái không lưu về settings nên ván sau revert. Dùng biến trạng thái nội
    // bộ khởi tạo từ qp "1"/"0" + ghi lại wk_settings.
    musicOn = !musicOn;
    AudioEngine.setSettings({ music: musicOn });
    if (window.BGM) { try { BGM.setEnabled(musicOn); } catch (e2) {} }
    if (musicOn) AudioEngine.startMusic(curTrack);
    try {
      const st = JSON.parse(localStorage.getItem("wk_settings") || "{}");
      st.music = musicOn; localStorage.setItem("wk_settings", JSON.stringify(st));
    } catch (e2) {}
  }
  if (e.code === "KeyR" && G.phase === "over") resetGame();
  // M22: Neo Quán Tính — Shift kích hoạt neo (xóa hất văng + impulse trơn ải 3 qua module slippery đã export)
  if ((e.code === "ShiftLeft" || e.code === "ShiftRight") && !e.repeat && G.phase === "play" && window.Upgrades2) {
    try {
      if (Upgrades2.tryAnchor(G.ship) && window.StageFX && StageFX.modules && StageFX.modules.slippery &&
          typeof StageFX.modules.slippery.stabilize === "function") StageFX.modules.slippery.stabilize();
    } catch (er) {}
  }
});
window.addEventListener("keyup", e => keys[e.code] = false);
canvas.addEventListener("mousemove", e => { mouse.x = e.clientX; mouse.y = e.clientY; });
canvas.addEventListener("mousedown", e => {
  mouse.down = true;
  try { AudioEngine.resume(); } catch (er) {} // AUDIT 2026-10-02: xem keydown — cứu SFX desktop
  SatManager.flush(); // user gesture: mở popup vệ tinh đang xếp hàng
  SatManager.hitSim(e.clientX, e.clientY); // click vào cửa sổ mô phỏng = 1 sát thương
  // v2.0: tutorial — nút Bỏ qua / nút beat 10
  if (window.Tutorial) { try { if (Tutorial.isActive()) Tutorial.onEvent("tap", { x: e.clientX, y: e.clientY }); } catch (er) {} }
  if (G.phase === "paused") pauseGame(false);
});
window.addEventListener("mouseup", () => mouse.down = false);
canvas.addEventListener("contextmenu", e => e.preventDefault());
window.addEventListener("blur", () => {
  // không auto-pause khi đang thao tác vệ tinh (click popup = blur cửa sổ chính)
  if (G.phase === "play" && SatManager.count() === 0) pauseGame(true);
});
window.addEventListener("pagehide", () => SatManager.closeAll());

// touch: nửa trái = di chuyển, nửa phải = ngắm+bắn
canvas.addEventListener("touchstart", e => {
  e.preventDefault(); touch.active = true;
  AudioEngine.resume();
  for (const t of e.changedTouches) {
    // v2.0: tutorial — tap vào nút Bỏ qua / beat 10 thì không gán joystick
    let tutTap = false;
    if (window.Tutorial) {
      try {
        if (Tutorial.isActive()) {
          const r = Tutorial.skipButtonRect();
          if (r && t.clientX >= r.x && t.clientX <= r.x + r.w && t.clientY >= r.y && t.clientY <= r.y + r.h) tutTap = true;
        }
      } catch (er) {}
    }
    if (tutTap) { try { Tutorial.onEvent("tap", { x: t.clientX, y: t.clientY }); } catch (er) {} continue; }
    if (t.clientX < canvas.width / 2 && touch.moveId === null) {
      touch.moveId = t.identifier; touch.moveOX = touch.moveX = t.clientX; touch.moveOY = touch.moveY = t.clientY;
    } else if (touch.aimId === null) {
      touch.aimId = t.identifier; touch.aimX = t.clientX; touch.aimY = t.clientY;
      touch.aimDX = 0; touch.aimDY = 0;
    }
  }
}, { passive: false });
canvas.addEventListener("touchmove", e => {
  e.preventDefault();
  for (const t of e.changedTouches) {
    if (t.identifier === touch.moveId) { touch.moveX = t.clientX; touch.moveY = t.clientY; }
    else if (t.identifier === touch.aimId) {
      touch.aimDX = t.clientX - touch.aimX; touch.aimDY = t.clientY - touch.aimY;
    }
  }
}, { passive: false });
function touchEnd(e) {
  for (const t of e.changedTouches) {
    if (t.identifier === touch.moveId) { touch.moveId = null; touch.moveDX = 0; touch.moveDY = 0; }
    if (t.identifier === touch.aimId) { touch.aimId = null; touch.aimDX = 0; touch.aimDY = 0; }
  }
  if (touch.moveId === null && touch.aimId === null) touch.active = false;
}
canvas.addEventListener("touchend", touchEnd);
canvas.addEventListener("touchcancel", touchEnd);
function touchMoveVec() {
  if (touch.moveId === null) return null;
  const dx = touch.moveX - touch.moveOX, dy = touch.moveY - touch.moveOY;
  const d = hypot(dx, dy);
  if (d < 12) return null;
  // AUDIT 2026-10-02: áp đường cong joystick R3 ngay tại đây (mobile.js round3 từng
  // cố thay window.touchMoveVec nhưng hàm này nằm trong IIFE nên không thay được —
  // dead code). Cũ: m = min(d,60)/60 → nhảy 20% tốc độ ngay tại mép deadzone.
  // Mới: mép deadzone → 0%, mép 60px → 100%, giữ nguyên deadzone/hướng/tốc độ tối đa.
  const m = Math.min(1, (d - 12) / (60 - 12));
  return { x: dx / d * m, y: dy / d * m };
}
function touchAim() {
  const d = hypot(touch.aimDX, touch.aimDY);
  if (touch.aimId === null || d < 14) return null;
  return { x: touch.aimDX / d, y: touch.aimDY / d, fire: d > 24 };
}

/* ---------------- state ---------------- */
const G = {
  phase: "boot", wave: 0, act: 0, score: 0, kills: 0, time: 0,
  ship: null, bullets: [], ebullets: [], enemies: [], gems: [], pickups: [], parts: [], floats: [],
  boss: null, spawnQueue: [], spawnT: 0, waveBreak: 0, waveClearShown: false,
  banner: "", bannerT: 0, bannerSub: "",
  xp: 0, level: 1, xpNeed: 6, shake: 0, combo: 0, comboT: 0, slowmo: 1,
  dying: [], pendingSpawns: 0, waveKills: 0, bossCine: false, // WOW sprint
  cracks: [], // vết nứt viền arena (M4 mô phỏng)
};
let lastT = performance.now();
let musicT = 0; // WOW: music/bg-state tick 500ms
let bossSpawnTok = 0; // WOW: huỷ boss intro cũ nếu restart giữa chừng

function newShip() {
  // v2.0: Xưởng nâng cấp (Meta.getRunModifiers) áp vào tàu đầu run
  var mods = null;
  if (window.V2) { try { mods = V2.runMods; } catch (er) {} }
  mods = mods || {};
  return {
    x: window.innerWidth / 2, y: window.innerHeight / 2, r: 13,
    hp: DIFF.shipHp + (mods.maxHpBonus | 0), maxHp: DIFF.shipHp + (mods.maxHpBonus | 0),
    speed: 275 * (mods.speedMul || 1), fireInt: 0.21 / (mods.fireRateMul || 1), fireT: 0, streams: 1,
    dmg: 1 + (mods.dmgBonus || 0), pierce: 0,
    magnet: 125 * (mods.magnetMul || 1), thorns: mods.thornsDmg || 0, bulletSpd: 560, slow: 0, dropMul: mods.pickupMul || 1, // Phụ lục A: node 7 Giáp gai + node 8 Mồi thơm
    kbvx: 0, kbvy: 0,
    iframes: 0, ang: 0, shieldT: 0, regenT: 0, magnetT: 0, overdriveT: 0,
  };
}
function addFloat(x, y, text, color = "#fff", big = false) {
  G.floats.push({ x, y, text, color, t: 0, life: 1.25, big });
}
function burst(x, y, n, colors, spd = 260) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = (0.3 + Math.random() * 0.7) * spd;
    G.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0,
      life: 0.4 + Math.random() * 0.5, c: colors[i % colors.length], sz: 2 + Math.random() * 3.5 });
  }
}

/* ---------------- nâng cấp (12 món) ---------------- */
const UPS = [
  { ico: "i-fire", t: I18N.t("upg.firerate.name"), d: I18N.t("upg.firerate.desc"), apply: s => s.fireInt *= 0.77 },
  { ico: "i-split", t: I18N.t("upg.streams.name"), d: I18N.t("upg.streams.desc"), apply: s => s.streams = Math.min(4, s.streams + 1), can: s => s.streams < 4 },
  { ico: "i-bomb", t: I18N.t("upg.damage.name"), d: I18N.t("upg.damage.desc"), apply: s => s.dmg += 1 },
  { ico: "i-rocket", t: I18N.t("upg.speed.name"), d: I18N.t("upg.speed.desc"), apply: s => s.speed *= 1.18 },
  { ico: "i-heart", t: I18N.t("upg.hp.name"), d: I18N.t("upg.hp.desc"), apply: s => { s.maxHp += 1; s.hp = Math.min(s.maxHp, s.hp + 1); } },
  { ico: "i-pierce", t: I18N.t("upg.pierce.name"), d: I18N.t("upg.pierce.desc"), apply: s => s.pierce += 1 },
  { ico: "i-magnet", t: I18N.t("upg.magnet.name"), d: I18N.t("upg.magnet.desc"), apply: s => s.magnet *= 1.6 },
  { ico: "i-shield", t: I18N.t("upg.thorns.name"), d: I18N.t("upg.thorns.desc"), apply: s => s.thorns += 1 },
  { ico: "i-gem", t: I18N.t("upg.greed.name"), d: I18N.t("upg.greed.desc"), apply: s => { s.xpPerGem = (s.xpPerGem || 0) + 1; } },
  { ico: "i-bolt", t: I18N.t("upg.bulletspeed.name"), d: I18N.t("upg.bulletspeed.desc"), apply: s => s.bulletSpd *= 1.25 },
  { ico: "i-clover", t: I18N.t("upg.luck.name"), d: I18N.t("upg.luck.desc"), apply: s => s.dropMul *= 1.5 },
  { ico: "i-snow", t: I18N.t("upg.ice.name"), d: I18N.t("upg.ice.desc"), apply: s => s.slow = 1.5 },
];
/* M22: icon cho 6 nâng cấp v2 (sprite sẵn có trong game.html) + số slot draft bảo đảm */
const U2_ICON = { gai_phan: "i-shield", neo_quan_tinh: "i-bolt", mat_cu: "i-ghost",
                  dan_no: "i-bomb", dan_xich: "i-split", keo_tu_va: "i-heart-plus" };
const U2_DRAFT_SLOTS = 1;
/* M22: callback sát thương dùng chung cho các hiệu ứng lan/gai của v2 — truyền
   bl=null để không knockback; hook đặt tại call-site va chạm, KHÔNG đặt trong
   damageEnemy để tránh đệ quy nổ→nổ / xích→xích (spec §5.3.2). */
const u2DealDamage = (e, dmg) => damageEnemy(e, dmg, null);
/* D-03: đếm nâng cấp khác nhau đã chọn trong run → achievement #15 "Full Build" */
function noteUpgradeTaken(key) {
  try {
    if (!G.upgTaken) G.upgTaken = {};
    if (key) G.upgTaken[key] = true;
    if (window.Meta && typeof Meta.check === "function")
      Meta.check("upgrade", { distinct: Object.keys(G.upgTaken).length });
  } catch (e) {}
}
function applyDraftPick(u) {
  if (!u) return;
  const res = u.apply(G.ship);
  if (u._u2 && res === null) return; // món v2 bị khóa/trùng tại thời điểm áp → không tính đã nhận
  noteUpgradeTaken(u._draftId || u.t || u.ico);
}
function openDraft() {
  G.phase = "draft";
  const pool = UPS.filter(u => !u.can || u.can(G.ship));
  const picks = [];
  // M22: slot bảo đảm cho nâng cấp v2 — pool v2 tự loại món đã lấy / chưa mở khóa ải
  if (window.Upgrades2) {
    try {
      const u2 = Upgrades2.rollDraft(U2_DRAFT_SLOTS);
      if (u2.length) {
        const u = u2[0];
        const pick = { t: u.nameVi, d: u.descVi,
                       _draftId: "u2:" + u.id, _u2: true,
                       apply: s => Upgrades2.applyUpgrade(u.id, s) };
        pick["ico"] = U2_ICON[u.id] || "i-sparkles"; // gán động: giữ nguyên dạng pick cho 2 đường draft
        picks.push(pick);
      }
    } catch (er) {}
  }
  while (picks.length < 3 && pool.length) picks.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  if (!picks.length) { G.phase = "play"; return; }
  // WOW: draft qua Cinema (DOM overlay + phím 1/2/3); fallback overlay cũ
  if (window.Cinema) {
    const ups = picks.map(u => ({ name: u.t, desc: u.d, icon: '<svg class="ic" aria-hidden="true"><use href="#' + u.ico + '"/></svg>' }));
    let ok = false;
    try {
      Cinema.showDraft(ups, (idx) => {
        const u = picks[idx];
        if (u) {
          applyDraftPick(u); AudioEngine.sfx.up();
          addFloat(G.ship.x, G.ship.y - 32, u.t, "#9df3ff", true);
        }
        G.phase = "play"; lastT = performance.now();
      }, { x: G.ship.x, y: G.ship.y });
      ok = true;
    } catch (err) {}
    if (ok) return;
  }
  openDraftLegacy(picks);
}
// Overlay draft cũ (fallback khi không có Cinema)
function openDraftLegacy(picks) {
  const box = $("draft-cards"); box.innerHTML = "";
  picks.forEach(u => {
    const d = document.createElement("div"); d.className = "card";
    d.innerHTML = `<div class="ico"><svg class="ic" aria-hidden="true"><use href="#${u.ico}"/></svg></div><div class="t">${u.t}</div><div class="d">${u.d}</div>`;
    d.onclick = () => {
      applyDraftPick(u); AudioEngine.sfx.up();
      addFloat(G.ship.x, G.ship.y - 32, u.t, "#9df3ff", true);
      $("ov-draft").classList.remove("show");
      G.phase = "play"; lastT = performance.now();
    };
    box.appendChild(d);
  });
  $("ov-draft").classList.add("show");
}
function gainXp(n) {
  G.xp += n;
  while (G.xp >= G.xpNeed) {
    G.xp -= G.xpNeed; G.level++;
    G.xpNeed = 5 + G.level * 3;
    // v2.0: juice2 level-up FX + meta hook
    if (window.V2) { try { V2.onLevelUp(G.ship.x, G.ship.y, G.level); } catch (er) {} }
    openDraft();
  }
}

/* =====================================================================
   DATA-DRIVEN GAMEPLAY (v2.0) — spec chi tiết: studio/game-design/GAME-DESIGN-DOC.md
   - MONSTER_REGISTRY: mọi loại quái. Thêm quái mới = thêm 1 entry, không sửa loop.
   - BEHAVIORS: strategy di chuyển/tấn công, tra cứu qua e.behavior.
   - ACTS: 3 Act (stage) — palette, nhạc, pool quái, boss variant riêng.
   - PICKUP_DEFS: vật phẩm rơi, chia tỉ lệ theo trọng số w.
   ===================================================================== */
const MONSTER_REGISTRY = {
  "chaser": { id: "chaser", name: I18N.t("monster.chaser.name"), behavior: "chase", color: "#ff5470",
    r: 12, dmg: 1, score: 10, xp: 1, minWave: 1, weight: 100, acts: [1, 2, 3],
    hp: w => 2 + w * 0.5, spd: w => 95 + w * 7, desc: I18N.t("monster.chaser.desc") },
  "chewer": { id: "chewer", name: I18N.t("monster.chewer.name"), behavior: "chew", color: "#c084fc",
    r: 13, dmg: 1, score: 25, xp: 2, minWave: 2, weight: 70, acts: [1, 2, 3],
    hp: w => 3 + w * 0.4, spd: w => 78 + w * 4,
    init: e => { e.latched = null; e.chewT = 0; }, desc: I18N.t("monster.chewer.desc") },
  "tank": { id: "tank", name: I18N.t("monster.tank.name"), behavior: "chase", color: "#ffb020",
    r: 23, dmg: 1, score: 50, xp: 4, minWave: 3, weight: 40, acts: [1, 2, 3],
    hp: w => 12 + w * 2.2, spd: () => 46, desc: I18N.t("monster.tank.desc") },
  "dasher": { id: "dasher", name: I18N.t("monster.dasher.name"), behavior: "dash", color: "#ffe14d",
    r: 11, dmg: 1, score: 20, xp: 2, minWave: 3, weight: 45, acts: [1, 2, 3],
    hp: w => 4 + w * 0.5, spd: w => 120 + w * 5,
    init: e => { e.state = "stalk"; e.stateT = 0; e.dx = 0; e.dy = 0; },
    desc: I18N.t("monster.dasher.desc") },
  "splitter": { id: "splitter", name: I18N.t("monster.splitter.name"), behavior: "chase", color: "#7df9ff",
    r: 18, dmg: 1, score: 35, xp: 3, minWave: 4, weight: 30, acts: [1, 2, 3],
    hp: w => 7 + w, spd: w => 70 + w * 4,
    onDeath: e => { for (let i = 0; i < 2; i++) spawnEnemyAt("mini", e.x + rand(-14, 14), e.y + rand(-14, 14)); },
    desc: I18N.t("monster.splitter.desc") },
  "mini": { id: "mini", name: I18N.t("monster.mini.name"), behavior: "chase", color: "#ff9df3",
    r: 8, dmg: 1, score: 8, xp: 1, minWave: 0, weight: 0, acts: [1, 2, 3],
    hp: () => 1.5, spd: () => 150, desc: I18N.t("monster.mini.desc") },
  "weaver": { id: "weaver", name: I18N.t("monster.weaver.name"), behavior: "weave", color: "#4dd8a7",
    r: 11, dmg: 1, score: 22, xp: 2, minWave: 6, weight: 40, acts: [1, 2, 3],
    hp: w => 5 + w * 0.6, spd: w => 110 + w * 6, desc: I18N.t("monster.weaver.desc") },
  "spitter": { id: "spitter", name: I18N.t("monster.spitter.name"), behavior: "spit", color: "#b26bff",
    r: 12, dmg: 1, score: 30, xp: 3, minWave: 8, weight: 30, acts: [2, 3],
    hp: w => 6 + w * 0.7, spd: w => 85 + w * 4,
    init: e => { e.shotT = rand(1, 2); }, desc: I18N.t("monster.spitter.desc") },
  "healer": { id: "healer", name: I18N.t("monster.healer.name"), behavior: "heal", color: "#7dff9a",
    r: 12, dmg: 0, score: 28, xp: 3, minWave: 11, weight: 22, acts: [2, 3],
    hp: w => 8 + w * 0.8, spd: w => 90 + w * 4,
    init: e => { e.healT = 0; e.healTarget = null; }, desc: I18N.t("monster.healer.desc") },
  "kamikaze": { id: "kamikaze", name: I18N.t("monster.kamikaze.name"), behavior: "kamikaze", color: "#ff7a1a",
    r: 10, dmg: 1, score: 18, xp: 2, minWave: 13, weight: 30, acts: [2, 3],
    hp: w => 3 + w * 0.4, spd: w => 150 + w * 8,
    init: e => { e.fuse = -1; }, desc: I18N.t("monster.kamikaze.desc") },
};

const BEHAVIORS = {
  chase: { update(e, dt, s, spd) { // tìm tàu + lượn sóng nhẹ
    const dx = s.x - e.x, dy = s.y - e.y, d = hypot(dx, dy) || 1;
    const wob = Math.sin(e.t * 6) * 12;
    e.x += (dx / d * spd + -dy / d * wob) * dt;
    e.y += (dy / d * spd + dx / d * wob) * dt;
  } },
  weave: { update(e, dt, s, spd) { // zigzag biên độ lớn, khó đoán
    const dx = s.x - e.x, dy = s.y - e.y, d = hypot(dx, dy) || 1;
    const wob = Math.sin(e.t * 7) * 110;
    e.x += (dx / d * spd + -dy / d * wob) * dt;
    e.y += (dy / d * spd + dx / d * wob) * dt;
  } },
  chew: { update(e, dt, s, spd) { // bám viền -> gặm cửa sổ (chiêu signature)
    if (!e.latched) {
      const sh = typeof shieldTarget === "function" ? shieldTarget() : null; // M3: chewer trong 300px ưu tiên bám khiên
      let p = nearestEdgePoint(e.x, e.y), useShield = false;
      if (sh) {
        const ds = hypot(sh.x - e.x, sh.y - e.y);
        if (ds < 300) { useShield = true; p = { x: sh.x, y: sh.y, edge: sh.edge }; }
      }
      const d = hypot(p.x - e.x, p.y - e.y);
      if (d < 16) {
        e.latched = p.edge; e.onShield = useShield; e.x = p.x; e.y = p.y;
        addFloat(e.x, e.y - 24, useShield ? I18N.t("hud.chew_shield") : I18N.t("hud.chew_window"), useShield ? "#38bdf8" : "#c084fc");
        AudioEngine.sfx.shrink();
      } else { e.x += (p.x - e.x) / d * spd * dt; e.y += (p.y - e.y) / d * spd * dt; }
    } else {
      e.chewT += dt;
      if (e.chewT >= DIFF.chew) {
        e.chewT = 0;
        if (e.onShield && typeof damageShield === "function") damageShield(e); // gặm khiên thay vì gặm cửa sổ
        else {
          const dd = { left: [14, 0], right: [14, 0], top: [0, 14], bottom: [0, 14] }[e.latched];
          shrinkWindow(dd[0], dd[1]);
          AudioEngine.sfx.shrink(); jxShake(2, 150, 3); // WOW tier: chewer cắn
          burst(e.x, e.y, 8, ["#c084fc", "#7c3aed"], 160);
        }
      }
      if (e.onShield) { // bám theo khiên (drone di chuyển)
        const sh2 = typeof shieldTarget === "function" ? shieldTarget() : null;
        if (sh2) { e.x = sh2.x; e.y = sh2.y; } else { e.onShield = false; e.latched = null; }
      } else {
        const q = nearestEdgePoint(e.x, e.y); e.x = q.x; e.y = q.y;
      }
    }
  } },
  dash: { update(e, dt, s, spd) { // stalk -> aim (telegraph) -> dash
    e.stateT -= dt;
    if (e.state === "stalk") {
      const dx = s.x - e.x, dy = s.y - e.y, d = hypot(dx, dy) || 1;
      e.x += dx / d * spd * dt; e.y += dy / d * spd * dt;
      if (d < 260 && e.stateT <= 0) { e.state = "aim"; e.stateT = 0.7; }
    } else if (e.state === "aim") {
      const dx = s.x - e.x, dy = s.y - e.y, d = hypot(dx, dy) || 1;
      e.dx = dx / d; e.dy = dy / d;
      if (e.stateT <= 0) { e.state = "dash"; e.stateT = 0.45; AudioEngine.sfx.shoot(); }
    } else {
      e.x += e.dx * spd * 4.2 * dt; e.y += e.dy * spd * 4.2 * dt;
      if (e.stateT <= 0) { e.state = "stalk"; e.stateT = 1.2; }
    }
  } },
  spit: { update(e, dt, s, spd) { // giữ cự ly, strafe, bắn đạn tầm xa
    const dx = s.x - e.x, dy = s.y - e.y, d = hypot(dx, dy) || 1;
    const want = 320, dir = d > want + 40 ? 1 : d < want - 40 ? -1 : 0;
    const strafe = Math.sin(e.t * 2.1 + e.x * 0.01) > 0 ? 1 : -1;
    e.x += (dx / d * dir * spd + -dy / d * strafe * spd * 0.6) * dt;
    e.y += (dy / d * dir * spd + dx / d * strafe * spd * 0.6) * dt;
    e.shotT -= dt;
    if (e.shotT <= 0 && d < 560) {
      e.shotT = 2.4;
      const a = Math.atan2(dy, dx);
      G.ebullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * 230, vy: Math.sin(a) * 230, r: 5, life: 5 });
      burst(e.x, e.y, 6, ["#b26bff", "#fff"], 140);
      AudioEngine.sfx.shoot();
    }
  } },
  heal: { update(e, dt, s, spd) { // tìm quái mất máu gần nhất để hồi
    let tgt = null, bd = Infinity;
    for (const o of G.enemies) {
      if (o === e || o.dead || o.type === "healer") continue;
      if (o.hp < o.maxHp) { const d2 = dist2(e.x, e.y, o.x, o.y); if (d2 < bd) { bd = d2; tgt = o; } }
    }
    e.healTarget = tgt;
    if (tgt) {
      const dx = tgt.x - e.x, dy = tgt.y - e.y, d = hypot(dx, dy) || 1;
      if (d > 90) { e.x += dx / d * spd * dt; e.y += dy / d * spd * dt; }
      else {
        e.healT += dt;
        if (e.healT >= 0.5) {
          e.healT = 0;
          tgt.hp = Math.min(tgt.maxHp, tgt.hp + tgt.maxHp * 0.08);
          burst(tgt.x, tgt.y, 6, ["#7dff9a", "#fff"], 120);
        }
      }
    } else { // không ai cần hồi -> giữ khoảng cách với tàu
      const dx = e.x - s.x, dy = e.y - s.y, d = hypot(dx, dy) || 1;
      if (d < 200) { e.x += dx / d * spd * dt; e.y += dy / d * spd * dt; }
    }
  } },
  kamikaze: { update(e, dt, s, spd) { // lao vào viền gần nhất rồi tự nổ
    if (e.fuse >= 0) {
      e.fuse -= dt;
      if (Math.random() < 0.5) burst(e.x + rand(-8, 8), e.y + rand(-8, 8), 2, ["#ff7a1a", "#fff"], 120);
      if (e.fuse <= 0) detonateKamikaze(e);
      return;
    }
    const p = nearestEdgePoint(e.x, e.y);
    const dx = p.x - e.x, dy = p.y - e.y, d = hypot(dx, dy) || 1;
    if (d < 46) {
      e.fuse = 0.8;
      AudioEngine.sfx.shrink();
      addFloat(e.x, e.y - 20, I18N.t("combat.kamikaze_warn"), "#ff7a1a");
    } else { e.x += dx / d * spd * dt; e.y += dy / d * spd * dt; }
  } },
};

const ACTS = [
  { id: 1, name: "NEON GRID", waves: [1, 10], hpMul: 1.0, spMul: 1.0, bgStage: 1,
    palette: { bg0: "#0b1e3a", bg1: "#04080f", grid: "#ffffff08", edge: "rgba(255,110,196,0.28)" },
    music: "act1", sub: I18N.t("banner.act_sub_1"),
    boss: { name: "GÃ GẶM KHỔNG LỒ", color: "#8b2fc9", hpMul: 1.0, shot: "ring", slam: 26, adds: ["chewer", "chewer"] } },
  { id: 2, name: "DEEP VOID", waves: [11, 20], hpMul: 1.35, spMul: 1.08, bgStage: 3,
    palette: { bg0: "#160b33", bg1: "#05030d", grid: "#b26bff10", edge: "rgba(178,107,255,0.35)" },
    music: "act2", sub: I18N.t("banner.act_sub_2"),
    boss: { name: "VOID REAPER", color: "#5b21b6", hpMul: 1.6, shot: "aimed", slam: 32, adds: ["dasher"] } },
  { id: 3, name: "CORE BREACH", waves: [21, Infinity], hpMul: 1.8, spMul: 1.15, bgStage: 2,
    palette: { bg0: "#331016", bg1: "#0d0505", grid: "#ff547010", edge: "rgba(255,84,112,0.40)" },
    music: "act3", sub: I18N.t("banner.act_sub_3"),
    boss: { name: "CORE TYRANT", color: "#b91c1c", hpMul: 2.3, shot: "spiral", slam: 38, adds: ["chewer", "dasher"] } },
];
function actOf(w) { return w <= 10 ? 1 : w <= 20 ? 2 : 3; }
/* Rebuild background khi đổi ải / resize (được gọi sau khi G đã khởi tạo). */
function refreshBG() {
  if (typeof BG === "undefined") return;
  BG.build((ACTS[(G.act || 1) - 1] || {}).bgStage || 1, canvas.width, canvas.height);
}
let curTrack = "act1";
function playActMusic() {
  curTrack = ACTS[(G.act || 1) - 1].music;
  AudioEngine.startMusic(curTrack);
}

const PICKUP_DEFS = {
  "heart":     { w: 50, can: s => s.hp < s.maxHp,
                 use: s => { s.hp = Math.min(s.maxHp, s.hp + 1); addFloat(s.x, s.y - 30, "+1 ❤️", "#7dffa8", true); } },
  "shield":    { w: 35, use: s => { s.shieldT = 6; addFloat(s.x, s.y - 30, I18N.t("pickup.shield_6s"), "#9df3ff", true); } },
  "nuke":      { w: 15, use: () => nukeBlast() },
  "magnet":    { w: 22, use: s => { s.magnetT = 8; addFloat(s.x, s.y - 30, I18N.t("pickup.magnet_8s"), "#7df9ff", true); } },
  "overdrive": { w: 18, use: s => { s.overdriveT = 8; addFloat(s.x, s.y - 30, "OVERDRIVE 8s!", "#ffe14d", true); } },
  "shieldwin": { w: 18, can: () => G.wave >= 4, use: () => requestShield() }, // M3: cửa sổ khiên
};

/* ---------------- spawn & wave ---------------- */
function edgeSpawn() {
  const b = bounds(), m = 34, s = G.ship;
  const e = Math.floor(Math.random() * 4);
  let x, y;
  if (e === 0) { x = rand(b.x, b.x + b.w); y = b.y - m; }
  else if (e === 1) { x = rand(b.x, b.x + b.w); y = b.y + b.h + m; }
  else if (e === 2) { x = b.x - m; y = rand(b.y, b.y + b.h); }
  else { x = b.x + b.w + m; y = rand(b.y, b.y + b.h); }
  if (dist2(x, y, s.x, s.y) < 200 * 200) { x = b.x + b.w - (x - b.x); y = b.y + b.h - (y - b.y); }
  return { x, y };
}
/* REBALANCE v2.0: đường cong độ khó mượt — thay bước nhảy act (count 1→1.15→1.3,
 * hp 1→1.35→1.8, spd 1→1.08→1.15) bằng ramp tuyến tính theo wave; giữ nguyên giá trị
 * tại các mốc cũ (wave 11, wave 21) nên độ gắt tổng thể không đổi, chỉ hết spike đột ngột. */
function smoothCountMul(n) {
  if (n <= 10) return 1;
  if (n <= 20) return 1 + 0.15 * (n - 10) / 10;
  return 1.15 + 0.15 * Math.min(1, (n - 20) / 10);
}
function smoothHpMul(n) {
  if (n <= 10) return 1;
  if (n <= 20) return 1 + 0.35 * (n - 10) / 10;
  return 1.35 + 0.45 * Math.min(1, (n - 20) / 10);
}
function smoothSpMul(n) {
  if (n <= 10) return 1;
  if (n <= 20) return 1 + 0.08 * (n - 10) / 10;
  return 1.08 + 0.07 * Math.min(1, (n - 20) / 10);
}
/* REBALANCE v2.0: onboarding — normal wave 1-3 dịu lại (ít quái, spawn thưa, quái chậm -15%);
 * tutorial v2.0 chạy ở nhịp chill. Hardcore không đổi. */
function onboardCountMul(n) { return (DIFF_KEY === "normal" && n <= 3) ? 0.7 : 1; }
function tutActive() { return !!(window.Tutorial && window.Tutorial.isActive && window.Tutorial.isActive()); }
function onboardSpawnMul() {
  if (tutActive()) return 1.5; // nhịp chill
  return (DIFF_KEY === "normal" && G.wave <= 3) ? 1.4 : 1;
}
function onboardSpdMul() {
  if (tutActive()) return 0.85;
  return (DIFF_KEY === "normal" && G.wave <= 3) ? 0.85 : 1;
function mkEnemy(type, x, y) {
  // FIX C2b (2026-10-02): id đặc biệt 'mini_boss_N' (campaign wave 5) resolve
  // thành entity mini-boss thật: base monster + hp×8, scale×2.5, gem 20
  // (DIFFICULTY.campaign.miniboss) và bossHpMult theo độ khó đã chọn.
  // e.type giữ = base id để mọi behavior/effect/render theo type cũ nguyên vẹn;
  // đánh dấu e.miniBoss để banner/kill-track nhận diện. Không có Campaign
  // (endless) thì id lạ vẫn trả null như cũ — không đổi hành vi cũ.
  var miniSpec = null;
  if (typeof type === "string" && window.Campaign && Campaign.getMinibossSpec) {
    try { miniSpec = Campaign.getMinibossSpec(type); } catch (e0) { miniSpec = null; }
  }
  var def = MONSTER_REGISTRY[miniSpec ? miniSpec.base : type];
  if (!def) return null;
  var e = {
    type: miniSpec ? miniSpec.base : type, behavior: def.behavior, x, y, t: rand(0, 9), flash: 0, slowT: 0, dead: false,

   kbx: 0, kby: 0, r: def.r, dmg: def.dmg, color: def.color,
    speed: def.spd(G.wave) * DIFF.spMul * smoothSpMul(G.wave) * onboardSpdMul(),
         xp: def.xp,
  };
if (miniSpec) {
    var bossHpM = 1;
    try {
      if (window.V2 && V2.diffKey && Campaign.getRunParams) {
        var rp = Campaign.getRunParams(V2.diffKey);
        if (rp && rp.bossHpMult) bossHpM = rp.bossHpMult;
      }
    } catch (e1) {}
    e.miniBoss = miniSpec.id;
    e.miniName = miniSpec.nameVi;
    e.hp = Math.round(e.hp * miniSpec.hpMult * bossHpM);
    e.r = e.r * miniSpec.scale;
    e.xp = miniSpec.gemReward;
  }
};
  e.maxHp = e.hp;
  if (def.init) def.init(e);
  return e;
}
function spawnEnemyAt(type, x, y) {
  const e = mkEnemy(type, x, y);
  if (!e) return null;
  // WOW: vòng cảnh báo spawn 400ms (elite 500ms) trước khi quái active;
  // quái chưa vào G.enemies nên không gây damage trong lúc warning + materialize
  if (window.Juice) {
    G.pendingSpawns = (G.pendingSpawns || 0) + 1;
    try {
      Juice.spawnWarning(x, y, e.r, { elite: e.r >= 23 }).then(
        (ok) => {
          G.pendingSpawns = Math.max(0, (G.pendingSpawns || 1) - 1);
          // AUDIT 2026-10-02: Juice.reset() settle warning đang treo bằng resolve(false)
          // (fulfilled, không phải reject) — trước đây handler này không kiểm tra nên
          // quái của run cũ spawn thẳng vào run mới sau restart. Hủy khi ok === false.
          if (ok === false) return;
          if (G.phase === "over") return; // game over trong lúc warning → huỷ
          G.enemies.push(e);
          try { Juice.materialize(e); } catch (err) {}
        },
        () => { G.pendingSpawns = Math.max(0, (G.pendingSpawns || 1) - 1); }
      );
    } catch (err) {
      G.pendingSpawns = Math.max(0, (G.pendingSpawns || 1) - 1);
      G.enemies.push(e);
    }
    return e;
  }
  G.enemies.push(e);
  return e;
}
function spawnEnemy(type) {
  const p = edgeSpawn();
  spawnEnemyAt(type, p.x, p.y);
}
function detonateKamikaze(e) {
  e.dead = true;
  shrinkWindow(20, 16); // nổ gặm cửa sổ
  if (G.phase !== "play") return;
  AudioEngine.sfx.bigboom(); jxShake(6, 300, 4); windowJitter(20); // WOW tier: nổ lớn
  burst(e.x, e.y, 26, ["#ff7a1a", "#ffd166", "#fff"], 340);
  addFloat(e.x, e.y - 24, I18N.t("combat.boom"), "#ff7a1a", true);
  const s = G.ship;
  if (dist2(e.x, e.y, s.x, s.y) < 130 * 130) hurtShip(1, e.x, e.y);
}
function buildSpawnQueue(n) {
  const act = actOf(n);
  const pool = Object.values(MONSTER_REGISTRY).filter(d => d.acts.includes(act) && d.minWave <= n && d.weight > 0);
  const totalW = pool.reduce((a, d) => a + d.weight, 0);
  const count = Math.round((4 + n * 3) * (n === 1 ? 0.7 : 1) * smoothCountMul(n) * onboardCountMul(n));
  const q = [];
  for (let i = 0; i < count; i++) {
    let r = Math.random() * totalW, type = pool[0].id;
    for (const d of pool) { r -= d.weight; if (r <= 0) { type = d.id; break; } }
    q.push(type);
  }
  return q;
}
function startWave(n) {
  G.wave = n; G.waveKills = 0;
  G.waveClearShown = false;
  const act = actOf(n), cfg = ACTS[act - 1];
  const changed = act !== G.act;
  G.act = act;
  if (changed) playActMusic(); // đổi nhạc nền theo Act
  if (changed) refreshBG(); // đổi background "Deep Dever" theo ải
  // v2.0 campaign: ?stage=1..5 → wave 10 = boss module, các wave khác lấy comp từ Campaign
  if (window.V2) {
    try {
      const sv = V2.stageWave(n);
      if (sv) {
        if (sv.boss) { V2.startStageBoss(n) || spawnBoss(); return; }
        G.spawnQueue = sv.queue;
        G.spawnQueue.sort(() => Math.random() - 0.5);
        G.spawnT = 0;
        V2.stageFxEnter();
        setBanner(I18N.t("campaign.wave", { n: n, stage: V2.stageId }) || `ẢI ${V2.stageId} — WAVE ${n}`, "");
        return;
      }
    } catch (er) {}
  }
  if (n % 5 === 0) { spawnBoss(); return; }
  G.spawnQueue = buildSpawnQueue(n);
  G.spawnQueue.sort(() => Math.random() - 0.5);
  G.spawnT = 0;
  maybeTriggerNest(n); // M1: ổ quái vệ tinh (act 1 wave 6+, endless mỗi 5 wave)
  maybeTriggerBomb(n); maybeTriggerGiant(n); maybeTriggerMother(n); // M8/M6/M5
  maybeTriggerLove(n); maybeTriggerMirror(n); maybeTriggerVacuum(n); // M7/M10/M9
  const sub = n === 1 ? I18N.t("banner.wave1") : pickSub();
  // WOW: wave banner qua Cinema (fallback setBanner cũ)
  if (window.Cinema) {
    try {
      if (changed) { try { Cinema.stageTransition(); } catch (e) {} }
      Cinema.waveBanner(n, { boss: false, sub: changed ? `ACT ${act} — ${cfg.name}: ${cfg.sub}` : sub });
    } catch (err) {
      setBanner(changed ? `ACT ${act} — ${cfg.name}` : `WAVE ${n}`, changed ? cfg.sub : sub);
    }
  } else if (changed) setBanner(`ACT ${act} — ${cfg.name}`, cfg.sub);
  else setBanner(`WAVE ${n}`, sub);
}
function pickSub() {
  return [I18N.t("banner.tip1"),
          I18N.t("banner.tip2"),
          I18N.t("banner.tip3"),
          I18N.t("banner.tip4")][Math.floor(Math.random() * 4)];
}
function setBanner(t, sub = "") { G.banner = t; G.bannerSub = sub; G.bannerT = 2.4; }
async function spawnBoss() {
  const b = bounds();
  const v = ACTS[(G.act || 1) - 1].boss; // boss variant theo Act
  const hp = (130 + G.wave * 14) * DIFF.hpMul * v.hpMul;
  G.boss = { x: b.x + b.w / 2, y: b.y + 130, r: 46, hp, maxHp: hp, t: 0,
    atkT: 2.2, spawnT: 5, slamT: 11, phase: 1,
    name: v.name, color: v.color, shot: v.shot, slam: v.slam, adds: v.adds };
  // WOW: boss intro cinematic (~3.1s, lock update) — game không vẽ boss đè (G.bossCine)
  if (window.Cinema) {
    const tok = ++bossSpawnTok;
    G.bossCine = true;
    try {
      try { AudioEngine.sfx.boss_roar(); } catch (e2) { try { AudioEngine.sfx.boss(); } catch (e3) {} }
      await Cinema.bossIntro(G.boss, v.name, `ACT ${G.act} — ${ACTS[(G.act || 1) - 1].name}`,
        { drawBoss: (c, x, y, s, a) => drawBossShape(c, x, y, s, a, v.color) });
    } catch (err) {}
    G.bossCine = false;
    if (tok !== bossSpawnTok) return; // restart giữa intro → bỏ
    try { Cinema.bgState("boss"); } catch (err) {}
  } else {
    setBanner(`⚠ BOSS: ${v.name}`, I18N.t("banner.boss_sub"));
    AudioEngine.sfx.boss();
  }
  try { AudioEngine.setMusicState("BOSS"); } catch (err) {}
  if (typeof BG !== "undefined") BG.setDim(0.45); // dim nền khi boss xuất hiện (art-direction §3 L5)
  G.spawnQueue = v.adds.slice();
}
function nearestEdgePoint(x, y) {
  const b = bounds();
  const dl = x - b.x, dr = b.x + b.w - x, dt = y - b.y, db = b.y + b.h - y;
  const m = Math.min(dl, dr, dt, db);
  if (m === dl) return { x: b.x, y: clamp(y, b.y, b.y + b.h), edge: "left", dx: -1, dy: 0 };
  if (m === dr) return { x: b.x + b.w, y: clamp(y, b.y, b.y + b.h), edge: "right", dx: 1, dy: 0 };
  if (m === dt) return { x: clamp(x, b.x, b.x + b.w), y: b.y, edge: "top", dx: 0, dy: -1 };
  return { x: clamp(x, b.x, b.x + b.w), y: b.y + b.h, edge: "bottom", dx: 0, dy: 1 };
}

/* ---------------- bắn ---------------- */
function fireBullet() {
  const s = G.ship;
  let ang;
  const ta = touchAim();
  if (ta) ang = Math.atan2(ta.y, ta.x);
  else ang = Math.atan2(mouse.y - s.y, mouse.x - s.x);
  for (let i = 0; i < s.streams; i++) {
    const a = ang + (i - (s.streams - 1) / 2) * 0.13;
    G.bullets.push({ x: s.x + Math.cos(a) * 18, y: s.y + Math.sin(a) * 18,
      vx: Math.cos(a) * s.bulletSpd, vy: Math.sin(a) * s.bulletSpd,
      r: 4, dmg: s.dmg, pierce: s.pierce, life: 1.15 });
  }
  // chớp nòng
  G.parts.push({ x: s.x + Math.cos(ang) * 22, y: s.y + Math.sin(ang) * 22,
    vx: 0, vy: 0, t: 0, life: 0.08, c: "#fff7ae", sz: 9 });
  AudioEngine.sfx.shoot();
}

/* ---------------- pause / chết / reset ---------------- */
function pauseGame(on) {
  if (on && G.phase === "play") { G.phase = "paused"; $("ov-pause").classList.add("show"); }
  else if (!on && G.phase === "paused") {
    G.phase = "play"; $("ov-pause").classList.remove("show"); lastT = performance.now();
  }
}
function hurtShip(dmg, srcx, srcy) {
  const s = G.ship;
  if (G.phase !== "play") return;
  // WOW: khiên chặn đòn → shield block FX (flash + tia lửa + rung nhẹ + âm thanh)
  if (s.shieldT > 0) {
    if (window.Cinema) { try { Cinema.shieldBlock(s.x, s.y); } catch (e) {} }
    return;
  }
  if (s.iframes > 0) return;
  s.hp -= dmg; s.iframes = 0.9;
  AudioEngine.sfx.hurt(); windowJitter(22); jxShake(8, 350, 8); // WOW tier: player hurt
  burst(s.x, s.y, 16, ["#ff5470", "#fff"], 260);
  // WOW: damage number đỏ thay float -dmg cũ
  if (window.Juice) { try { Juice.damageNumber(s.x, s.y - 20, dmg, "playerHurt", null); } catch (e) {} }
  else addFloat(s.x, s.y - 26, `-${dmg} ❤️`, "#ff8f8f", true);
  if (s.hp <= 0) {
    // Phụ lục A node 10 — Túi cứu sinh: 1 lần/run, hồi 1 HP + 2s bất tử thay vì chết
    let slMods = null;
    try { slMods = G.runMods || (window.V2 ? V2.runMods : null); } catch (e) {}
    if (slMods && slMods.secondLife && !s._secondLifeUsed) {
      s._secondLifeUsed = true; s.hp = 1; s.iframes = 2;
      addFloat(s.x, s.y - 40, "Túi cứu sinh!", "#9df3ff", true);
      burst(s.x, s.y, 20, ["#9df3ff", "#ffffff"], 260);
    } else die("ship");
  }
}
function die(reason) {
  if (G.phase === "over") return;
  G.phase = "over";
  // v2.0: meta (Mảnh Kính thưởng + achievement runEnd), tutorial hook
  if (window.V2) { try { V2.onGameOver(reason); } catch (er) {} }
  SatManager.closeAll(); // dọn popup vệ tinh, không để tiến trình mồ côi
  AudioEngine.sfx.over();
  try { AudioEngine.setMusicState("GAMEOVER"); } catch (e) {} // WOW: downlifter + pad
  AudioEngine.stopMusic();
  const reasonTxt = reason === "window" ? I18N.t("gameover.title_window") : I18N.t("gameover.title_ship");
  burst(G.ship.x, G.ship.y, 46, ["#0080FF", "#ffffff", "#8fc3ff"], 380);
  windowJitter(30); jxShake(12, 700, 10); // WOW tier: boss chết / player die
  if (bus) bus.postMessage({ type: "gameover", profileId: PROFILE_ID, score: G.score, wave: G.wave, act: G.act,
    kills: G.kills, time: Math.round(G.time), timeSec: Math.round(G.time), diff: DIFF_KEY, reason: reasonTxt });
  $("over-title").textContent = reasonTxt;
  $("over-score").textContent = I18N.t("gameover.score_line", { score: I18N.fmtNum(G.score), wave: G.wave });
  $("over-stats").innerHTML = `<svg class="ic" aria-hidden="true"><use href="#i-skull"/></svg> ` + I18N.t("gameover.stats", { kills: `<b>${G.kills}</b>`, level: `<b>${G.level}</b>`, time: `<b>${Math.round(G.time)}s</b>`, diff: `<b>${DIFF.label}</b>` });
  let recTxt = "";
  try {
    const hk = PROFILE_ID ? `wk_high_${DIFF_KEY}_${PROFILE_ID}` : `wk_high_${DIFF_KEY}`;
    const prev = JSON.parse(localStorage.getItem(hk) || "null");
    if (!prev || G.score > prev.score) recTxt = `<svg class="ic" aria-hidden="true"><use href="#i-trophy"/></svg> ${I18N.t("gameover.new_record")}`;
  } catch {}
  $("over-record").innerHTML = recTxt;
  $("ov-over").classList.add("show");
}
function resetGame() {
  Object.assign(G, {
    phase: "play", wave: 0, act: 0, score: 0, kills: 0, time: 0,
    bullets: [], ebullets: [], enemies: [], gems: [], pickups: [], parts: [], floats: [],
    boss: null, spawnQueue: [], spawnT: 0, waveBreak: 1.4, waveClearShown: false,
    banner: "", bannerT: 0, bannerSub: "",
    xp: 0, level: 1, xpNeed: 6, shake: 0, combo: 0, comboT: 0, slowmo: 1,
    bombWave: 0, giantWave: 0, motherWave: 0,
    loveWave: 0, mirrorWave: 0, vacWave: 0, // M7/M10/M9: reset guard 1-lần/wave khi chơi lại
  });
  // F-02 + Phụ lục A: chụp modifiers của Xưởng cho run này (runMods đã được
  // preboot của V2 gán trước lần reset đầu; các lần restart đọc lại cùng nguồn)
  try { G.runMods = (window.V2 && V2.runMods) ? V2.runMods : null; } catch (e) {}
  G.upgTaken = {}; // D-03: đếm distinct upgrade theo run
  G.ship = newShip();
  // AUDIT 2026-10-02: resetGame() trước đây không dọn vệ tinh/boss module/Juice2 —
  // restart từ pause hoặc sau game-over để sót bomb/mother/nest và boss ma của run cũ
  // chạy tiếp sang run mới; cracks + windowDamagePx cũng cộng dồn qua các run.
  try { SatManager.closeAll(); } catch (e) {}
  try { if (window.Bosses) Bosses.stop(); } catch (e) {}
  try { if (window.StageFX) StageFX.exit(); } catch (e) {} // AUDIT 2026-10-02: thoát mechanic ải của run cũ (xóa cả flag G.blackout)
  try { if (window.Juice2) Juice2.reset(); } catch (e) {}
  try { if (window.Upgrades2) Upgrades2.resetRun(); } catch (e) {} // M22: mở lại pool draft v2 (giữ unlock boss ải trong phiên)
  G.cracks = []; G.windowDamagePx = 0;
  // Khôi phục kích thước: arena ảo về null (tự tính lại full-size), cửa sổ thật
  // grow về cỡ ban đầu (growWindow tự cap ở START_W × 720).
  arena = null;
  try { growWindow(START_W, 720); } catch (e) {}
  // §6.4.7: tooltip điểm 1 lần duy nhất sau update — "Điểm = tổng điểm gốc — không nhân."
  try {
    if (!localStorage.getItem("wk_score_tip_seen")) {
      localStorage.setItem("wk_score_tip_seen", "1");
      setTimeout(() => { try { setBanner(I18N.t("banner.score_tip"), ""); } catch (e) {} }, 2500);
    }
  } catch (e) {}
  ["ov-over", "ov-draft", "ov-pause"].forEach(id => $(id).classList.remove("show"));
  // WOW: reset juice/cinema + hàng đợi spawn
  G.dying = []; G.pendingSpawns = 0; G.waveKills = 0; G.bossCine = false; bossSpawnTok++;
  if (window.Juice) { try { Juice.reset(); } catch (e) {} }
  if (window.Cinema) { try { Cinema.reset(); } catch (e) {} }
  playActMusic(); // Act 1
  refreshBG(); // build background ải 1
  lastT = performance.now();
}
$("btn-again").onclick = () => { AudioEngine.sfx.click(); resetGame(); };
$("btn-restart").onclick = () => { AudioEngine.sfx.click(); resetGame(); };
$("btn-resume").onclick = () => { AudioEngine.sfx.click(); pauseGame(false); };
$("btn-quit").onclick = () => window.close();
$("btn-quit2").onclick = () => window.close();

/* ---------------- update ---------------- */
function killEnemy(e) {
  if (e.dead) return;
  e.dead = true; G.kills++;
  G.waveKills = (G.waveKills || 0) + 1;
  G.combo++; G.comboT = 2.5;
  const def = MONSTER_REGISTRY[e.type];
  const base = def ? def.score : 10;
  const pts = base; // §6 "điểm gốc cố định": mỗi kill = đúng điểm gốc, không cộng/không nhân
  G.score += pts;
  // v2.0: juice2 + meta + tutorial hook
  if (window.V2) { try { V2.onKill(e); } catch (er) {} }
  // WOW: death anim + burst + hit-stop theo loại (tank/splitter/elite)
  if (window.Juice) {
    try {
      Juice.onKill(e.type, e.r >= 23);
      Juice.deathAnim(e.type, e, null);
      Juice.burst(e.type, e.x, e.y);
      G.dying.push(e); // giữ lại để vẽ death-anim (~150ms)
    } catch (err) {}
  }
  if (e.type === "tank") jxShake(6, 300, 4); else jxShake(3, 160, 2);
  // WOW: sfx.death theo loại quái (fallback boom cũ)
  try { AudioEngine.sfx.death(e.type); } catch (err) { try { AudioEngine.sfx.boom(); } catch (e2) {} }
  burst(e.x, e.y, e.type === "tank" ? 26 : 14, [e.color, "#ffffff", "#ffd166"], 300);
  // WOW: damage number thay float +pts cũ (fallback khi không có Juice)
  if (window.Juice) { try { Juice.damageNumber(e.x, e.y - 16, pts, "normal", null); } catch (err) {} }
  else addFloat(e.x, e.y - 16, `+${pts}`, "#fde68a");
  // WOW: combo qua Cinema (milestone x10/x25/x50/x100 nội bộ); fallback float cũ
  if (window.Cinema) { try { Cinema.combo(G.combo); } catch (err) {} }
  else if (G.combo >= 5 && G.combo % 5 === 0) addFloat(e.x, e.y - 40, `🔥 COMBO x${G.combo}!`, "#f9a8d4", true);
  if (def && def.onDeath) def.onDeath(e); // vd splitter đẻ mini
  const n = e.type === "tank" ? 3 : 1;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    G.gems.push({ x: e.x, y: e.y, vx: Math.cos(a) * 130, vy: Math.sin(a) * 130, v: e.xp, t: rand(0, 9) });
  }
  // rớt vật phẩm: 10% tổng, chia theo trọng số PICKUP_DEFS
  // REBALANCE v2.0: chill tăng tỉ lệ rớt heart/shield ~+50% (pickupBoost × trọng số + dropRateMul × tỉ lệ chung)
  const boost = DIFF.pickupBoost || 1;
  const dropRate = 0.10 * (DIFF.dropRateMul || 1);
  const wOf = k => ((k === "heart" || k === "shield") ? PICKUP_DEFS[k].w * boost : PICKUP_DEFS[k].w);
  const pdefs = Object.entries(PICKUP_DEFS).filter(([, d]) => !d.can || d.can(G.ship));
  const ptot = pdefs.reduce((a, [k]) => a + wOf(k), 0);
  const roll = Math.random() / G.ship.dropMul;
  if (roll < dropRate && ptot > 0) {
    let r = roll / dropRate * ptot, kind = pdefs[0][0];
    for (const [k] of pdefs) { r -= wOf(k); if (r <= 0) { kind = k; break; } }
    G.pickups.push({ kind, x: e.x, y: e.y, t: 0 });
  }
}
function nukeBlast() {
  AudioEngine.sfx.nuke();
  jxShake(12, 700, 10); windowJitter(30);
  // WOW: flash trắng toàn màn hình khi nuke nổ
  if (window.Cinema) { try { Cinema.nukeFlash(); } catch (e) {} }
  addFloat(G.ship.x, G.ship.y - 40, "💣 NUKE!", "#ffd166", true);
  // v2.0: juice2 nuke FX
  if (window.V2) { try { V2.onNuke(); } catch (er) {} }
  G.enemies.forEach(e => { if (!e.dead) { e.hp -= 15; if (e.hp <= 0) killEnemy(e); else { e.flash = 0.15; } } });
  if (G.boss && !G.boss.dead) {
    G.boss.hp -= 40; G.boss.flash = 0.2;
    if (G.boss.hp <= 0) killBoss(); else if (typeof bossSplitCheck === "function") bossSplitCheck(G.boss); // M2
  }
  // v2.0: nuke cũng trúng boss module
  if (window.V2 && window.Bosses) { try { if (V2.bossActive && Bosses.active && !Bosses.active.dead) Bosses.hit(Bosses.active, 15, Bosses.active.x, Bosses.active.y, G); } catch (er) {} }
  G.ebullets = [];
  const b = bounds();
  burst(b.x + b.w / 2, b.y + b.h / 2, 60, ["#ffd166", "#ff9a3d", "#fff"], 520);
}
function killBoss() {
  const bs = G.boss; if (!bs || bs.dead) return;
  bs.dead = true; G.boss = null;
  for (const sat of SatManager.list()) // M2: hết boss → mảnh tự đóng
    if (sat.role === "fragment" && !sat.dead) SatManager.kill(sat.id, "cleanup");
  if (typeof BG !== "undefined") BG.setDim(0); // hết dim nền
  const pts = 500; // §6: boss = 500 cố định
  G.score += pts; G.kills++;
  // v2.0: meta + tutorial hook
  if (window.V2) { try { V2.onBossKill(); } catch (er) {} }
  try { AudioEngine.sfx.explosion(1.2); } catch (err) { try { AudioEngine.sfx.bigboom(); } catch (e2) {} }
  jxShake(12, 700, 10); windowJitter(30);
  burst(bs.x, bs.y, 60, ["#c084fc", "#fff", "#ffd166"], 420);
  // WOW: boss burst + hit-stop elite + damage number vàng
  if (window.Juice) {
    try { Juice.burst("boss", bs.x, bs.y); Juice.onKill("boss", true); } catch (err) {}
    try { Juice.damageNumber(bs.x, bs.y - 60, pts, "crit", null); } catch (err) {}
  }
  addFloat(bs.x, bs.y - 50, I18N.t("banner.boss_down", { pts }), "#fde68a", true);
  // WOW: death cinematic (~2.1s, lock update) — banner "BOSS BỊ HẠ!" do Cinema vẽ
  if (window.Cinema) {
    G.bossCine = true;
    try {
      Cinema.bossDeath(bs, { player: G.ship, drawBoss: (c, x, y, s, a) => drawBossShape(c, x, y, s, a, bs.color) })
        .then(() => { G.bossCine = false; }, () => { G.bossCine = false; });
    } catch (err) { G.bossCine = false; }
  } else {
    setBanner(`WAVE ${G.wave} CLEAR — ${ACTS[(G.act || 1) - 1].name}`, I18N.t("banner.wave_clear_sub"));
  }
  try { AudioEngine.setMusicState("VICTORY"); } catch (err) {}
  for (let i = 0; i < 6; i++) {
    const a = Math.random() * Math.PI * 2;
    G.gems.push({ x: bs.x, y: bs.y, vx: Math.cos(a) * 160, vy: Math.sin(a) * 160, v: 2, t: rand(0, 9) });
  }
  G.pickups.push({ kind: "nuke", x: bs.x - 40, y: bs.y, t: 0 });
  G.pickups.push({ kind: "heart", x: bs.x + 40, y: bs.y, t: 0 });
}

function update(dt) {
  const s = G.ship, b = bounds();
  G.time += dt;
  SatManager.poll(dt); SatManager.updateSims(dt); updateNests(dt); // multi-window P1a
  if (typeof updateShield === "function") { updateShield(dt); updateDebris(dt); } // P1b/P1c
  if (typeof updateFragments === "function") updateFragments(dt); // P1d
  if (typeof updateBombs === "function") updateBombs(dt);
  if (typeof updateMinions === "function") { updateMinions(dt); updateMothers(dt); updateChicks(dt); }
  if (typeof updateLovers === "function") { updateLovers(dt); updateSuperlove(dt); } // M7
  if (typeof updateMirrors === "function") updateMirrors(dt); // M10
  if (typeof updateBlackholes === "function") updateBlackholes(dt); // M9
  updateCracks(dt);
  G.comboT -= dt;
  if (G.comboT <= 0) {
    // WOW: combo đứt → Cinema.comboLost (chỉ khi combo đáng kể)
    if (G.combo >= 3 && window.Cinema) { try { Cinema.comboLost(); } catch (e) {} }
    G.combo = 0;
  }
  s.iframes = Math.max(0, s.iframes - dt);
  s.shieldT = Math.max(0, s.shieldT - dt);
  s.magnetT = Math.max(0, s.magnetT - dt);
  s.overdriveT = Math.max(0, s.overdriveT - dt);
  if (s.regenT > 0) { /* dành cho nâng cấp sau */ }

  /* M22: tick theo thời gian cho nâng cấp v2 — Keo Tự Vá + hồi chiêu Neo,
     và Gai Phản có throttle 0,5s (helper gốc không có cooldown) */
  if (window.Upgrades2 && s) {
    try {
      const ev = Upgrades2.tick(s, dt);
      if (ev && ev.glue) {
        growWindow(ev.glue, Math.round(ev.glue * 0.75));
        addFloat(s.x, s.y - 40, `+${ev.glue}px`, "#9df3ff");
      }
      if (s.thornBorder) {
        s._thornCd = Math.max(0, (s._thornCd || 0) - dt);
        if (s._thornCd <= 0) {
          const hits = Upgrades2.checkThornBorder(s, G.enemies,
            { l: b.x, t: b.y, r: b.x + b.w, b: b.y + b.h }, u2DealDamage);
          if (hits > 0) s._thornCd = 0.5;
        }
      }
    } catch (er) {}
  }

  /* di chuyển */
  let mx = 0, my = 0;
  if (keys.KeyW || keys.ArrowUp) my -= 1;
  if (keys.KeyS || keys.ArrowDown) my += 1;
  if (keys.KeyA || keys.ArrowLeft) mx -= 1;
  if (keys.KeyD || keys.ArrowRight) mx += 1;
  const tm = touchMoveVec();
  if (tm) { mx = tm.x; my = tm.y; }
  const ml = hypot(mx, my);
  if (ml > 0.05) {
    const sp = s.speed * Math.min(1, ml);
    s.x += mx / (ml || 1) * sp * dt; s.y += my / (ml || 1) * sp * dt;
    s.moveSpeed = sp; // WOW: Cinema.playerFx tự vẽ trail khi speed > 180
  } else s.moveSpeed = 0;
  s.x = clamp(s.x, b.x + s.r, b.x + b.w - s.r);
  s.y = clamp(s.y, b.y + s.r, b.y + b.h - s.r);

  if (s.kbvx || s.kbvy) {
    s.x += s.kbvx * dt; s.y += s.kbvy * dt;
    const dk = Math.pow(0.02, dt);
    s.kbvx *= dk; s.kbvy *= dk;
    if (dist2(s.kbvx, s.kbvy, 0, 0) < 100) { s.kbvx = 0; s.kbvy = 0; }
    s.x = clamp(s.x, b.x + s.r, b.x + b.w - s.r);
    s.y = clamp(s.y, b.y + s.r, b.y + b.h - s.r);
  }
  const ta = touchAim();
  s.ang = ta ? Math.atan2(ta.y, ta.x) : Math.atan2(mouse.y - s.y, mouse.x - s.x);

  /* bắn */
  s.fireT -= dt;
  const wantFire = mouse.down || keys.Space || (ta && ta.fire);
  if (wantFire && s.fireT <= 0) { s.fireT = s.fireInt * (s.overdriveT > 0 ? 0.55 : 1); fireBullet(); }

  /* wave */
  if (G.spawnQueue.length) {
    G.spawnT -= dt;
    if (G.spawnT <= 0) {
      G.spawnT = Math.max(0.22, 0.85 * DIFF.spawnMul * onboardSpawnMul() - G.wave * 0.05);
      spawnEnemy(G.spawnQueue.pop());
    }
  } else if (!G.enemies.length && !G.boss && !(G.pendingSpawns > 0) && G.phase === "play") {
    G.waveBreak -= dt;
    if (G.waveBreak <= 0) {
      G.waveBreak = 2.6;
      s.hp = Math.min(s.maxHp, s.hp + 1);
      // Phụ lục A node 6 — Keo siêu dính: vá cuối wave theo modifiers Xưởng (mặc định 40px)
      const wrPx = (G.runMods && G.runMods.waveRepairPx) || 40;
      growWindow(wrPx, Math.round(wrPx * 0.75));
      addFloat(s.x, s.y - 40, I18N.t("banner.patch"), "#9df3ff", true);
      startWave(G.wave + 1);
    }
  }
  G.bannerT = Math.max(0, G.bannerT - dt);

  /* đạn ta */
  for (let i = G.bullets.length - 1; i >= 0; i--) {
    const bl = G.bullets[i];
    bl.x += bl.vx * dt; bl.y += bl.vy * dt; bl.life -= dt;
    let dead = bl.life <= 0;
    if (!dead && (bl.x < b.x || bl.x > b.x + b.w || bl.y < b.y || bl.y > b.y + b.h)) {
      // CHIÊU SIGNATURE: bắn vào viền -> đẩy cửa sổ
      const ex = bl.x < b.x ? "left" : bl.x > b.x + b.w ? "right" : null;
      const edge = ex || (bl.y < b.y ? "top" : "bottom");
      const sp = hypot(bl.vx, bl.vy);
      pushWindow(bl.vx / sp * 300, bl.vy / sp * 300);
      AudioEngine.sfx.thud();
      burst(clamp(bl.x, b.x, b.x + b.w), clamp(bl.y, b.y, b.y + b.h), 8, ["#9df3ff", "#fff"], 200);
      G.enemies.forEach(e => {
        if (e.type === "chewer" && e.latched === edge && !e.dead) {
          e.hp -= 1; e.latched = null;
          const p = nearestEdgePoint(e.x, e.y);
          e.x = p.x - p.dx * 70; e.y = p.y - p.dy * 70;
          burst(e.x, e.y, 10, ["#c084fc", "#fff"], 220);
          addFloat(e.x, e.y - 20, I18N.t("combat.knockback"), "#c084fc");
          if (e.hp <= 0) killEnemy(e);
        }
      });
      dead = true;
    }
    if (!dead && mirrorReflect(bl)) dead = true; // M10: gương thần phản chiếu đạn
    if (!dead) {
      for (const e of G.enemies) {
        if (e.dead) continue;
        if (dist2(bl.x, bl.y, e.x, e.y) < (bl.r + e.r) * (bl.r + e.r)) {
          damageEnemy(e, bl.dmg, bl);
          /* M22: Đạn Nổ + Đạn Xích — hook tại call-site va chạm đạn (chống đệ quy, §5.3.2) */
          if (window.Upgrades2 && (s.explosive || s.chain)) {
            try {
              if (s.explosive) Upgrades2.explodeAt(bl.x, bl.y, e, G.enemies, u2DealDamage, s);
              if (s.chain) Upgrades2.chainFrom(e, G.enemies, bl.dmg, u2DealDamage, s);
            } catch (er) {}
          }
          if (bl.pierce > 0) bl.pierce--; else dead = true;
          break;
        }
      }
      // v2.0: boss module — đạn đi qua Bosses.hit (áp điểm yếu), skip boss cũ
      if (!dead && window.V2) { try { if (V2.hitBoss(bl)) { if (bl.pierce > 0) bl.pierce--; else dead = true; } } catch (er) {} }
      if (!dead && G.boss && !G.boss.dead &&
          dist2(bl.x, bl.y, G.boss.x, G.boss.y) < (bl.r + G.boss.r) * (bl.r + G.boss.r)) {
        G.boss.hp -= bl.dmg; G.boss.flash = 0.08; AudioEngine.sfx.hit();
        burst(bl.x, bl.y, 5, ["#ffd166", "#fff"], 180);
        if (G.boss.hp <= 0) killBoss(); else if (typeof bossSplitCheck === "function") bossSplitCheck(G.boss); // M2
        if (bl.pierce > 0) bl.pierce--; else dead = true;
      }
    }
    if (dead) G.bullets.splice(i, 1);
  }

  /* đạn địch (boss) */
  for (let i = G.ebullets.length - 1; i >= 0; i--) {
    const eb = G.ebullets[i];
    eb.x += eb.vx * dt; eb.y += eb.vy * dt; eb.life -= dt;
    let dead = eb.life <= 0 || eb.x < b.x - 20 || eb.x > b.x + b.w + 20 || eb.y < b.y - 20 || eb.y > b.y + b.h + 20;
    if (!dead && dist2(eb.x, eb.y, s.x, s.y) < (eb.r + s.r) * (eb.r + s.r)) {
      hurtShip(1, eb.x, eb.y); dead = true;
    }
    if (dead) G.ebullets.splice(i, 1);
  }

  /* quái */
  for (const e of G.enemies) {
    if (e.dead) continue;
    e.t += dt; e.flash = Math.max(0, e.flash - dt); e.slowT = Math.max(0, e.slowT - dt);
    e.sayNangT = Math.max(0, (e.sayNangT || 0) - dt); // CEO §9-Q2: đếm ngược "say nắng"
    const spd = e.speed * (e.slowT > 0 ? 0.45 : 1);
    // knockback vật lý
    e.x += e.kbx * dt; e.y += e.kby * dt; e.kbx *= 0.9; e.kby *= 0.9;

    // CEO §9-Q2: quái "say nắng" (aura M7) tấn công lẫn nhau thay vì đuổi tàu — mọi độ khó
    if (e.sayNangT > 0) sayNangUpdate(e, dt, spd);
    else {
      // data-driven: mỗi quái chạy strategy của nó (BEHAVIORS[e.behavior])
      const bh = BEHAVIORS[e.behavior] || BEHAVIORS.chase;
      bh.update(e, dt, s, spd);
    }
    if (G.phase !== "play") return;
    // chạm tàu (healer dmg=0 -> không gây sát thương; quái say nắng không cắn tàu)
    if (e.sayNangT <= 0 && dist2(e.x, e.y, s.x, s.y) < (e.r + s.r) * (e.r + s.r)) {
      if (e.dmg > 0) hurtShip(e.dmg, e.x, e.y);
      if (G.phase !== "play") return;
      const dx = e.x - s.x, dy = e.y - s.y, d = hypot(dx, dy) || 1;
      const kb = 40 + s.thorns * 60;
      e.kbx += dx / d * kb * 8; e.kby += dy / d * kb * 8;
      if (s.thorns > 0) damageEnemy(e, s.thorns, null);
    }
  }
  G.enemies = G.enemies.filter(e => !e.dead);
  // wave-clear banner kèm tên Act (hiện 1 lần khi sạch quái)
  // WOW: đợi cả quái đang warning-spawn (pendingSpawns) rồi mới clear
  if (!G.enemies.length && !G.boss && !G.spawnQueue.length && !(G.pendingSpawns > 0) && G.phase === "play" && !G.waveClearShown && G.wave > 0) {
    G.waveClearShown = true;
    // v2.0: juice2/meta/tutorial/campaign hook
    if (window.V2) { try { V2.onWaveClear(G.wave); } catch (er) {} }
    const cfg = ACTS[(G.act || 1) - 1];
    // WOW: wave clear cinematic — slow-mo + confetti + fanfare + VICTORY + vá cửa sổ từng vết
    if (window.Cinema) {
      try {
        const b = bounds(), patches = [];
        for (let i = 0; i < 4; i++) {
          const side = (Math.random() * 4) | 0;
          patches.push(side === 0 ? { x: rand(b.x, b.x + b.w), y: b.y }
            : side === 1 ? { x: rand(b.x, b.x + b.w), y: b.y + b.h }
            : side === 2 ? { x: b.x, y: rand(b.y, b.y + b.h) }
            : { x: b.x + b.w, y: rand(b.y, b.y + b.h) });
        }
        Cinema.waveClear(G.wave, G.waveKills || 0, patches);
      } catch (err) {
        setBanner(`WAVE ${G.wave} CLEAR — ${cfg.name}`, G.wave % 5 === 0 ? I18N.t("banner.next_boss") : I18N.t("banner.next"));
        AudioEngine.sfx.wave();
      }
    } else {
      setBanner(`WAVE ${G.wave} CLEAR — ${cfg.name}`, G.wave % 5 === 0 ? I18N.t("banner.next_boss") : I18N.t("banner.next"));
      AudioEngine.sfx.wave();
    }
    try { AudioEngine.setMusicState("VICTORY"); } catch (err) {}
  }

  /* boss */
  const bs = G.boss;
  // AUDIT 2026-10-02: boss module (campaign, do Bosses điều khiển) phải được bỏ qua ở
  // block boss cũ này — trước đây engine cũ vừa kéo boss về phía tàu 34px/s, vừa ghi
  // đè bs.phase theo thang 1–4 (module dùng 1–3) khiến enterPhase không bao giờ chạy
  // và pickAttack đọc phases[2] không tồn tại khi HP ≤ 25% (boss đứng đòn).
  const bsIsModule = !!(bs && window.Bosses && Bosses.active === bs);
  if (bs && !bs.dead && !bsIsModule) {
    bs.t += dt; bs.flash = Math.max(0, bs.flash - dt);
    // WOW: boss phase mỗi 25% HP — flash + slow-mo + banner + palette shift
    const frac = bs.hp / bs.maxHp;
    const ph = frac > 0.75 ? 1 : frac > 0.5 ? 2 : frac > 0.25 ? 3 : 4;
    if (ph !== bs.phase) {
      bs.phase = ph;
      if (window.Cinema) {
        try {
          Cinema.bossPhase(ph, {
            x: bs.x, y: bs.y, r: bs.r,
            clearBullets: () => {
              G.ebullets.forEach(eb => burst(eb.x, eb.y, 3, ["#c084fc", "#fff"], 160));
              G.ebullets = [];
            },
            onPalette: (n) => {
              const pal = ["#8b2fc9", "#a855f7", "#d946ef", "#f43f5e"];
              bs.color = pal[(n - 1) % pal.length] || bs.color;
            }
          });
        } catch (err) {}
      }
    }
    const dx = s.x - bs.x, dy = s.y - bs.y, d = hypot(dx, dy) || 1;
    bs.x += dx / d * 34 * dt; bs.y += dy / d * 34 * dt;
    bs.atkT -= dt; bs.spawnT -= dt; bs.slamT -= dt;
    if (bs.atkT <= 0) {
      // REBALANCE v2.0: chill → pattern boss thưa hơn (bossAtkMul)
      bs.atkT = Math.max(1.4, (2.6 - G.wave * 0.06) * (DIFF.bossAtkMul || 1));
      const bdx = s.x - bs.x, bdy = s.y - bs.y, baseA = Math.atan2(bdy, bdx);
      const bMul = DIFF.bossBulletMul || 1; // REBALANCE v2.0: chill → đạn boss chậm hơn
      if (bs.shot === "aimed") { // VOID REAPER: chùm đạn xòe về phía tàu
        for (let i = -3; i <= 3; i++) {
          const a = baseA + i * 0.16;
          G.ebullets.push({ x: bs.x, y: bs.y, vx: Math.cos(a) * 240 * bMul, vy: Math.sin(a) * 240 * bMul, r: 6, life: 4 });
        }
      } else if (bs.shot === "spiral") { // CORE TYRANT: xoắn ốc xoay theo thời gian
        const n = 18, off = bs.t * 2.2;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + off;
          G.ebullets.push({ x: bs.x, y: bs.y, vx: Math.cos(a) * 200 * bMul, vy: Math.sin(a) * 200 * bMul, r: 6, life: 4.5 });
        }
      } else { // ring: vòng đạn tròn (bản cũ)
        const n = 10 + Math.floor(G.wave / 2);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + bs.t;
          G.ebullets.push({ x: bs.x, y: bs.y, vx: Math.cos(a) * 185 * bMul, vy: Math.sin(a) * 185 * bMul, r: 6, life: 4 });
        }
      }
      AudioEngine.sfx.shoot(); jxShake(2, 120, 1); // WOW tier: hit
    }
    if (bs.spawnT <= 0) { bs.spawnT = 6; bs.adds.forEach(t => spawnEnemy(t)); }
    if (bs.slamT <= 0) {
      bs.slamT = bs.shot === "spiral" ? 9 : 12;
      // AUDIT 2026-10-02: trước đây ở đây có sẵn 1 cặp addFloat+shrinkWindow chạy vô
      // điều kiện, rồi nhánh else lại shrink lần nữa → slam không-debris gây sát thương
      // cửa sổ gấp đôi thiết kế. Chỉ shrink trong nhánh else; nhánh debris thay bằng mưa mảnh vỡ.
      if (G.phase !== "play") return;
      // M4: 50% đòn nện → mưa mảnh vỡ (chỉ khi multi-window bật)
      const useDebris = typeof spawnDebris === "function" && typeof SAT_MODE !== "undefined" && SAT_MODE !== "off" && !SatManager.anyRole("debris") && Math.random() < 0.5;
      if (useDebris) spawnDebris();
      else {
        addFloat(bs.x, bs.y - 70, I18N.t("combat.slam"), "#ff5470", true);
        shrinkWindow(bs.slam, Math.round(bs.slam * 0.75));
        if (G.phase !== "play") return;
        AudioEngine.sfx.bigboom(); jxShake(8, 400, 8); windowJitter(26); // WOW tier: boss slam
        burst(bs.x, bs.y, 30, ["#c084fc", "#ff5470"], 380);
      }
    }
    if (dist2(bs.x, bs.y, s.x, s.y) < (bs.r + s.r) * (bs.r + s.r)) {
      hurtShip(1, bs.x, bs.y);
      if (G.phase !== "play") return;
      const d2 = hypot(dx, dy) || 1;
      s.x -= dx / d2 * 60; s.y -= dy / d2 * 60;
    }
  }

  /* gems */
  for (let i = G.gems.length - 1; i >= 0; i--) {
    const gm = G.gems[i]; gm.t += dt;
    // AUDIT 2026-10-02: gems trước đây không có hạn dùng → tích lũy vô hạn trong
    // session dài (tụt FPS dần). Cho hạn 30s; đồng thời dọn gem NaN (tọa độ hỏng).
    if (gm.t > 30 || !isFinite(gm.x) || !isFinite(gm.y)) { G.gems.splice(i, 1); continue; }
    const dx = s.x - gm.x, dy = s.y - gm.y, d = hypot(dx, dy) || 1;
    const magR = s.magnetT > 0 ? 1e9 : s.magnet; // magnet pickup: hút toàn bộ gem
    if (d < magR) { gm.x += dx / d * 360 * dt; gm.y += dy / d * 360 * dt; }
    else { gm.x += gm.vx * dt; gm.y += gm.vy * dt; gm.vx *= 0.94; gm.vy *= 0.94; }
    if (d < 22) {
      G.gems.splice(i, 1); AudioEngine.sfx.gem();
      burst(gm.x, gm.y, 6, ["#7df9ff", "#fff"], 140);
      gainXp(gm.v + (s.xpPerGem || 0)); // §6: gem = 0 điểm, chỉ XP (Tham lam: +1 XP/gem)
      if (G.phase !== "play") return;
    }
  }

  /* pickups (data-driven: PICKUP_DEFS) */
  for (let i = G.pickups.length - 1; i >= 0; i--) {
    const p = G.pickups[i]; p.t += dt;
    if (p.t > 12) { G.pickups.splice(i, 1); continue; }
    if (dist2(p.x, p.y, s.x, s.y) < 30 * 30) {
      G.pickups.splice(i, 1); AudioEngine.sfx.pickup();
      const pd = PICKUP_DEFS[p.kind];
      if (pd) pd.use(s);
      // v2.0: meta hook (achievement nhặt vật phẩm)
      if (window.V2) { try { V2.onPickup(p.kind); } catch (er) {} }
      burst(p.x, p.y, 14, ["#fff", "#ffd166"], 220);
    }
  }

  /* fx */
  G.parts.forEach(p => { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.96; p.vy *= 0.96; });
  G.parts = G.parts.filter(p => p.t < p.life);
  G.floats.forEach(f => f.t += dt);
  G.floats = G.floats.filter(f => f.t < f.life);
  G.shake = Math.max(0, G.shake - 30 * dt);
  applyWindowMotion(dt);
}
function damageEnemy(e, dmg, bl) {
  if (e.dead) return;
  // v2.0: tutorial beat 2 (bắn trúng quái)
  if (window.V2) { try { V2.onBulletHit(e); } catch (er) {} }
  e.hp -= dmg; e.flash = 0.09;
  if (G.ship.slow) e.slowT = G.ship.slow;
  if (bl) { e.kbx += bl.vx * 0.12; e.kby += bl.vy * 0.12; }
  AudioEngine.sfx.hit();
  // WOW: damage number (tự gộp theo target trong 120ms) + hit flash
  if (window.Juice) {
    try {
      Juice.damageNumber(bl ? bl.x : e.x, (bl ? bl.y : e.y) - 8, dmg, "normal", e);
      Juice.hitFlash(e);
    } catch (err) {}
  }
  burst(bl ? bl.x : e.x, bl ? bl.y : e.y, 5, ["#ffd166", "#fff"], 180);
  if (e.hp <= 0) killEnemy(e);
}

/* ---------------- render ---------------- */
/* Nền "Deep Dever": js/bg.js (procedural, prerender offscreen).
 * Gọi BG.build khi đổi ải / resize; mỗi frame chỉ BG.draw. */

function render(now) {
  const W = canvas.width, H = canvas.height, b = bounds(), s = G.ship;
  ctx.save();
  // WOW: Juice camera shake (fallback: G.shake cũ)
  if (window.Juice) { try { Juice.applyShake(ctx); } catch (e) {} }
  else if (G.shake > 0.3) ctx.translate(rand(-1, 1) * G.shake, rand(-1, 1) * G.shake);

  // L0..L5: background theo art-direction (thay block "nền sao" cũ)
  if (typeof BG !== "undefined") BG.draw(ctx, now);

  if (arena) { // đấu trường ảo fallback
    ctx.strokeStyle = "#ffd479"; ctx.lineWidth = 3; ctx.setLineDash([12, 8]);
    ctx.strokeRect(b.x, b.y, b.w, b.h); ctx.setLineDash([]);
  }
  // viền máu cửa sổ
  const winPct = winCtrl.ok
    ? clamp((window.outerWidth - MIN_W) / (START_W - MIN_W), 0, 1)
    : clamp((b.w - MIN_W) / (START_W - MIN_W), 0, 1);
  const pulse = (Math.sin(now / 280) + 1) / 2;
  ctx.strokeStyle = winPct < 0.35 ? `rgba(255,60,90,${0.45 + 0.5 * pulse})` : "rgba(255,110,196,0.28)";
  ctx.lineWidth = winPct < 0.35 ? 6 : 3;
  ctx.strokeRect(b.x + 3, b.y + 3, b.w - 6, b.h - 6);

  // WOW: Cinema background layers (desat low-HP / boss arena ring / breather) — sau nền, trước entities
  if (window.Cinema) { try { Cinema.drawBack(ctx, W, H); } catch (e) {} }
  // cửa sổ vệ tinh mô phỏng (fallback multi-window)
  SatManager.drawSims();
  if (typeof drawSatFields === "function") drawSatFields(); // M10/M9: vùng hiệu lực popup thật
  if (typeof drawCracks === "function") drawCracks(); // M4: vết nứt viền arena

  // gems (OPT: set font 1 lần, không set lại mỗi gem)
  ctx.font = "17px sans-serif"; ctx.textAlign = "center";
  G.gems.forEach(gm => {
    ctx.fillText("💎", gm.x, gm.y + Math.sin(gm.t * 5) * 3);
  });
  // pickups (heart/shield/nuke dùng emoji cũ; magnet/overdrive vẽ tay — không emoji mới)
  G.pickups.forEach(p => {
    const bob = Math.sin(p.t * 4) * 4, blink = p.t > 9 ? (Math.sin(p.t * 12) > 0 ? 1 : 0.3) : 1;
    ctx.globalAlpha = blink;
    if (p.kind === "magnet") {
      ctx.fillStyle = "#ff5470";
      ctx.fillRect(p.x - 9, p.y - 11 + bob, 7, 20); ctx.fillRect(p.x + 2, p.y - 11 + bob, 7, 20);
      ctx.fillRect(p.x - 9, p.y - 11 + bob, 18, 7);
      ctx.fillStyle = "#fff";
      ctx.fillRect(p.x - 9, p.y + 2 + bob, 7, 7); ctx.fillRect(p.x + 2, p.y + 2 + bob, 7, 7);
    } else if (p.kind === "overdrive") {
      ctx.fillStyle = "#ffe14d";
      ctx.beginPath();
      ctx.moveTo(p.x + 4, p.y - 13 + bob); ctx.lineTo(p.x - 7, p.y + 2 + bob); ctx.lineTo(p.x - 1, p.y + 2 + bob);
      ctx.lineTo(p.x - 4, p.y + 13 + bob); ctx.lineTo(p.x + 7, p.y - 2 + bob); ctx.lineTo(p.x + 1, p.y - 2 + bob);
      ctx.closePath(); ctx.fill();
    } else {
      ctx.font = "24px sans-serif"; ctx.textAlign = "center";
      ctx.fillText(p.kind === "heart" ? "❤️" : p.kind === "shield" ? "🛡" : "💣", p.x, p.y + bob);
    }
    ctx.globalAlpha = 1;
  });
  // đạn ta
  G.bullets.forEach(bl => {
    ctx.save(); ctx.translate(bl.x, bl.y); ctx.rotate(Math.atan2(bl.vy, bl.vx));
    ctx.fillStyle = "#9df3ff"; ctx.fillRect(-9, -2.5, 18, 5);
    ctx.fillStyle = "#fff"; ctx.fillRect(3, -1.5, 6, 3);
    ctx.restore();
  });
  // đạn địch
  G.ebullets.forEach(eb => {
    ctx.fillStyle = "#ff5470";
    ctx.beginPath(); ctx.arc(eb.x, eb.y, eb.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#ffd0da";
    ctx.beginPath(); ctx.arc(eb.x, eb.y, eb.r * 0.45, 0, Math.PI * 2); ctx.fill();
  });

  // quái
  // WOW: vẽ thêm entity đang chạy death-anim (~150ms sau khi chết)
  // OPT: tách hàm vẽ 1 quái — 2 vòng lặp riêng, không concat alloc mỗi frame
  function drawOneEnemy(e) {
    if (e.dead && !e.jfDeath) return;
    ctx.save(); ctx.translate(e.x, e.y);
    if (e.flash > 0) ctx.globalAlpha = 0.45;
    // WOW: spawn materialize (scale pop) + death-anim transform
    if (window.Juice) {
      try {
        if (e.jfMat) { const msc = Juice.materializeScale(e); if (msc !== 1) ctx.scale(msc, msc); }
        if (e.jfDeath) {
          const dtr = Juice.deathTransform(e);
          if (dtr) {
            if (dtr.sx !== 1 || dtr.sy !== 1) ctx.scale(dtr.sx || 1, dtr.sy || 1);
            if (dtr.alpha < 1) ctx.globalAlpha *= dtr.alpha;
          }
        }
      } catch (err) {}
    }
    const slow = e.slowT > 0;
    if (e.type === "chaser" || e.type === "mini") {
      ctx.rotate(Math.atan2(s.y - e.y, s.x - e.x));
      ctx.fillStyle = slow ? "#7dd3fc" : e.color;
      ctx.beginPath(); ctx.moveTo(e.r + 2, 0); ctx.lineTo(-e.r, -e.r * 0.85); ctx.lineTo(-e.r * 0.4, 0); ctx.lineTo(-e.r, e.r * 0.85); ctx.closePath(); ctx.fill();
    } else if (e.type === "chewer") {
      const q = e.r + Math.sin(e.t * 8) * 1.5;
      ctx.fillStyle = slow ? "#7dd3fc" : e.color;
      ctx.fillRect(-q, -q, q * 2, q * 2);
      ctx.fillStyle = "#2a0a3a";
      ctx.fillRect(-5, -5 + (e.latched ? Math.sin(e.t * 10) * 2 : 0), 10, 10);
      if (e.latched) { ctx.fillStyle = "#ff5470"; ctx.font = "13px sans-serif"; ctx.textAlign = "center"; ctx.fillText("⚠", 0, -q - 6); }
    } else if (e.type === "tank") {
      ctx.rotate(e.t * 0.8);
      ctx.fillStyle = slow ? "#7dd3fc" : e.color;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; ctx.lineTo(Math.cos(a) * e.r, Math.sin(a) * e.r); }
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#5b2d00"; ctx.beginPath(); ctx.arc(0, 0, e.r * 0.45, 0, Math.PI * 2); ctx.fill();
    } else if (e.type === "dasher") {
      if (e.state === "aim") { // telegraph
        ctx.strokeStyle = `rgba(255,225,77,${0.4 + 0.4 * Math.sin(now / 80)})`; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(e.dx * 320, e.dy * 320); ctx.stroke();
      }
      ctx.rotate(Math.atan2(e.state === "aim" || e.state === "dash" ? e.dy : s.y - e.y, e.state === "aim" || e.state === "dash" ? e.dx : s.x - e.x));
      ctx.fillStyle = e.state === "aim" ? "#fff3a0" : slow ? "#7dd3fc" : e.color;
      ctx.beginPath(); ctx.moveTo(e.r + 3, 0); ctx.lineTo(-e.r, -e.r); ctx.lineTo(-e.r * 0.3, 0); ctx.lineTo(-e.r, e.r); ctx.closePath(); ctx.fill();
    } else if (e.type === "splitter") {
      ctx.rotate(e.t * 1.2);
      ctx.fillStyle = slow ? "#7dd3fc" : e.color;
      ctx.beginPath(); ctx.arc(0, 0, e.r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#0b3b4a"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-e.r, 0); ctx.lineTo(e.r, 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -e.r); ctx.lineTo(0, e.r); ctx.stroke();
    } else if (e.type === "weaver") {
      ctx.rotate(e.t * 2);
      ctx.fillStyle = slow ? "#7dd3fc" : e.color;
      ctx.beginPath();
      ctx.moveTo(0, -e.r - 2); ctx.lineTo(e.r, 0); ctx.lineTo(0, e.r + 2); ctx.lineTo(-e.r, 0);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#0b3b2a"; ctx.beginPath(); ctx.arc(0, 0, e.r * 0.35, 0, Math.PI * 2); ctx.fill();
    } else if (e.type === "spitter") {
      ctx.rotate(Math.atan2(s.y - e.y, s.x - e.x));
      ctx.fillStyle = slow ? "#7dd3fc" : e.color;
      ctx.beginPath();
      for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; ctx.lineTo(Math.cos(a) * e.r, Math.sin(a) * e.r); }
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#2a0a3a"; ctx.fillRect(0, -4, e.r + 4, 8);
    } else if (e.type === "healer") {
      if (e.healTarget && !e.healTarget.dead) {
        ctx.strokeStyle = "rgba(125,255,154,0.5)"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(e.healTarget.x - e.x, e.healTarget.y - e.y); ctx.stroke();
      }
      ctx.fillStyle = slow ? "#7dd3fc" : e.color;
      ctx.beginPath(); ctx.arc(0, 0, e.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#0b3b1a"; ctx.fillRect(-3, -8, 6, 16); ctx.fillRect(-8, -3, 16, 6);
    } else if (e.type === "kamikaze") {
      ctx.rotate(Math.atan2(s.y - e.y, s.x - e.x));
      const armed = e.fuse >= 0;
      ctx.fillStyle = armed && Math.floor(now / 90) % 2 === 0 ? "#ffffff" : (slow ? "#7dd3fc" : e.color);
      ctx.beginPath(); ctx.moveTo(e.r + 2, 0); ctx.lineTo(-e.r, -e.r * 0.8); ctx.lineTo(-e.r, e.r * 0.8); ctx.closePath(); ctx.fill();
      if (armed) { ctx.fillStyle = "#ff7a1a"; ctx.font = "13px sans-serif"; ctx.textAlign = "center"; ctx.fillText("!", 0, -e.r - 6); }
    } else {
      // fallback: quái mới chưa có nhánh vẽ riêng vẫn chạy được — hình tròn màu registry
      ctx.fillStyle = slow ? "#7dd3fc" : e.color;
      ctx.beginPath(); ctx.arc(0, 0, e.r, 0, Math.PI * 2); ctx.fill();
    }
    // CEO §9-Q2: quái "say nắng" vẽ 💘 trên đầu
    if (e.sayNangT > 0) {
      ctx.fillStyle = "#ff8fab"; ctx.font = "15px sans-serif"; ctx.textAlign = "center";
      ctx.fillText("💘", 0, -e.r - 12);
    }
    ctx.restore(); ctx.globalAlpha = 1;
    if (e.hp > 4) {
      const maxHp = e.hp; // ước lượng đơn giản: dùng tỉ lệ trên hp ban đầu lưu sẵn
      ctx.fillStyle = "#00000088"; ctx.fillRect(e.x - 16, e.y - e.r - 12, 32, 5);
      ctx.fillStyle = "#ff5470"; ctx.fillRect(e.x - 16, e.y - e.r - 12, 32 * clamp(e.hp / (e.maxHp || e.hp), 0, 1), 5);
    }
  }
  for (let _ei = 0; _ei < G.enemies.length; _ei++) drawOneEnemy(G.enemies[_ei]);
  if (G.dying && G.dying.length) for (let _dj = 0; _dj < G.dying.length; _dj++) drawOneEnemy(G.dying[_dj]);

  // boss
  const bs = G.boss;
  // WOW: intro cinematic tự vẽ boss qua drawBoss callback → game không vẽ đè
  if (bs && !bs.dead && !G.bossCine) {
    ctx.save(); ctx.translate(bs.x, bs.y);
    if (bs.flash > 0) ctx.globalAlpha = 0.5;
    ctx.rotate(bs.t * 0.5);
    const r = bs.r + Math.sin(bs.t * 6) * 2;
    ctx.fillStyle = bs.color || "#8b2fc9";
    ctx.fillRect(-r, -r, r * 2, r * 2);
    ctx.fillStyle = "#3d0f5c";
    ctx.fillRect(-r * 0.55, -r * 0.55, r * 1.1, r * 1.1);
    ctx.fillStyle = "#ff5470";
    ctx.beginPath(); ctx.arc(0, 0, r * 0.28 + Math.sin(bs.t * 10) * 3, 0, Math.PI * 2); ctx.fill();
    ctx.restore(); ctx.globalAlpha = 1;
  }

  // tàu
  if (G.phase !== "over" && s) {
    if (s.iframes > 0 && Math.floor(now / 90) % 2 === 0) ctx.globalAlpha = 0.35;
    if (s.shieldT > 0) {
      ctx.strokeStyle = `rgba(157,243,255,${0.5 + 0.4 * Math.sin(now / 120)})`;
      ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(s.x, s.y, s.r + 9, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.ang);
    const tg = ctx.createLinearGradient(-12, 0, 14, 0);
    tg.addColorStop(0, "#7dd3fc"); tg.addColorStop(1, "#f0fdff");
    ctx.fillStyle = tg;
    ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-11, -11); ctx.lineTo(-6, 0); ctx.lineTo(-11, 11); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#0b2536"; ctx.beginPath(); ctx.arc(2, 0, 4.5, 0, Math.PI * 2); ctx.fill();
    const fl = 10 + Math.random() * 9;
    ctx.fillStyle = "#ffb020";
    ctx.beginPath(); ctx.moveTo(-11, -5); ctx.lineTo(-11 - fl, 0); ctx.lineTo(-11, 5); ctx.closePath(); ctx.fill();
    ctx.restore(); ctx.globalAlpha = 1;
  }

  // particles & floats
  G.parts.forEach(p => {
    ctx.globalAlpha = Math.max(0, 1 - p.t / p.life); ctx.fillStyle = p.c;
    ctx.fillRect(p.x - p.sz / 2, p.y - p.sz / 2, p.sz, p.sz);
  });
  ctx.globalAlpha = 1; ctx.textAlign = "center";
  G.floats.forEach(f => {
    ctx.globalAlpha = Math.max(0, 1 - f.t / f.life);
    ctx.font = f.big ? "bold 19px sans-serif" : "bold 15px sans-serif";
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y - f.t * 46);
  });
  ctx.globalAlpha = 1;
  // WOW: Juice FX layers (particles / rings / ghosts / floats / damage numbers / warnings)
  if (window.Juice) {
    try {
      Juice.drawParticles(ctx);
      Juice.drawRings(ctx);
      Juice.drawGhosts(ctx, drawShipGhost);
      Juice.drawFloats(ctx);
      Juice.drawDamageNumbers(ctx);
      Juice.drawWarnings(ctx);
    } catch (e) {}
  }
  // WOW: Cinema front — banner / combo / danger vignette / boss cinematic / draft dim
  if (window.Cinema) { try { Cinema.drawFront(ctx, W, H, cineInfo().player); } catch (e) {} }
  ctx.restore();

  /* ---------- HUD ---------- */
  ctx.textAlign = "left";
  let hearts = "";
  for (let i = 0; i < s.maxHp; i++) hearts += i < s.hp ? "❤️" : "🖤";
  ctx.font = "20px sans-serif"; ctx.fillText(hearts, 14, 32);
  if (s.shieldT > 0) { ctx.font = "16px sans-serif"; ctx.fillText(`🛡${Math.ceil(s.shieldT)}s`, 14 + s.maxHp * 24, 30); }
  { // M3: trạng thái cửa sổ khiên
    const sh = typeof shieldSat === "function" ? shieldSat() : null;
    if (sh) {
      ctx.font = "16px sans-serif"; ctx.fillStyle = "#38bdf8";
      const txt = sh.sim ? I18N.t("hud.shield_sim", { hearts: "💙".repeat(Math.max(0, sh.hearts ?? 5)) }) : I18N.t("hud.shield_popup", { px: Math.ceil(sh.shieldPx ?? 60) });
      ctx.fillText(txt, 14 + s.maxHp * 24 + (s.shieldT > 0 ? 64 : 0), 30);
      ctx.fillStyle = "#fff";
    }
  }
  if (s.magnetT > 0 || s.overdriveT > 0) { // timer pickup mới
    ctx.font = "16px sans-serif"; ctx.fillStyle = "#7df9ff";
    let pt = "";
    if (s.magnetT > 0) pt += I18N.t("hud.magnet", { s: Math.ceil(s.magnetT) }) + " ";
    if (s.overdriveT > 0) pt += `OD ${Math.ceil(s.overdriveT)}s`;
    ctx.fillText(pt, 14 + s.maxHp * 24 + (s.shieldT > 0 ? 64 : 0), 30);
    ctx.fillStyle = "#fff";
  }
  ctx.fillStyle = "#fff"; ctx.font = "bold 15px sans-serif";
  let hud = `WAVE ${Math.max(1, G.wave)}   💀 ${G.kills}   ⭐ ${G.score}`;
  if (G.combo >= 3) hud += `   🔥x${G.combo}`;
  ctx.fillText(hud, 14, 58);
  ctx.fillStyle = "#ffffff18"; ctx.fillRect(14, 68, 220, 8);
  ctx.fillStyle = "#7df9ff"; ctx.fillRect(14, 68, 220 * Math.min(1, G.xp / G.xpNeed), 8);
  ctx.fillStyle = "#c9b8e0"; ctx.font = "12px sans-serif";
  ctx.fillText(`Lv ${G.level}`, 240, 76);
  // máu cửa sổ
  const bw = 220;
  ctx.fillStyle = "#ffffff18"; ctx.fillRect(W - bw - 14, 14, bw, 10);
  ctx.fillStyle = winPct < 0.35 ? "#ff5470" : "#ff9df3";
  ctx.fillRect(W - bw - 14, 14, bw * winPct, 10);
  ctx.fillStyle = "#c9b8e0"; ctx.font = "12px sans-serif"; ctx.textAlign = "right";
  ctx.fillText(I18N.t("hud.window_hp"), W - 14, 40); ctx.textAlign = "left";
  // boss bar (v2.0: boss module vẽ thanh 3 nấc khi active)
  var v2bar = false;
  if (window.V2) { try { v2bar = V2.bossBar(); } catch (e) {} }
  if (!v2bar && bs && !bs.dead) {
    const bbw = Math.min(560, W - 120);
    ctx.fillStyle = "#000000aa"; ctx.fillRect((W - bbw) / 2, 12, bbw, 14);
    ctx.fillStyle = "#c084fc"; ctx.fillRect((W - bbw) / 2, 12, bbw * clamp(bs.hp / bs.maxHp, 0, 1), 14);
    ctx.fillStyle = "#fff"; ctx.font = "bold 12px sans-serif"; ctx.textAlign = "center";
    ctx.fillText(bs.name || "BOSS", W / 2, 24); ctx.textAlign = "left";
  }
  ctx.fillStyle = "#8f7bb5"; ctx.font = "12px sans-serif";
  ctx.fillText(touch.active ? I18N.t("hud.controls_mobile") : I18N.t("hud.controls"), 14, H - 14);

  // banner
  if (G.bannerT > 0) {
    ctx.globalAlpha = Math.min(1, G.bannerT);
    ctx.fillStyle = "#ffd7f4"; ctx.font = "bold 44px sans-serif"; ctx.textAlign = "center";
    ctx.fillText(G.banner, W / 2, H / 2 - 20);
    if (G.bannerSub) {
      ctx.font = "15px sans-serif"; ctx.fillStyle = "#c9b8e0";
      ctx.fillText(G.bannerSub, W / 2, H / 2 + 14);
    }
    ctx.globalAlpha = 1; ctx.textAlign = "left";
  }
  // vignette nguy hiểm (WOW: Cinema tự vẽ danger vignette + heartbeat khi có mặt)
  const danger = (s.hp === 1) || winPct < 0.25;
  if (!window.Cinema && danger && G.phase === "play") {
    const p = (Math.sin(now / 220) + 1) / 2;
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
    vg.addColorStop(0, "rgba(255,40,70,0)"); vg.addColorStop(1, `rgba(255,40,70,${0.18 + 0.22 * p})`);
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  }
  // touch sticks
  if (touch.active) {
    if (touch.moveId !== null) {
      ctx.strokeStyle = "#ffffff55"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(touch.moveOX, touch.moveOY, 52, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = "#ffffff88";
      ctx.beginPath(); ctx.arc(touch.moveOX + clamp(touch.moveX - touch.moveOX, -52, 52), touch.moveOY + clamp(touch.moveY - touch.moveOY, -52, 52), 22, 0, Math.PI * 2); ctx.fill();
    }
    if (touch.aimId !== null) {
      ctx.strokeStyle = "#ff9df355"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(touch.aimX, touch.aimY, 52, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = "#ff9df388";
      ctx.beginPath(); ctx.arc(touch.aimX + clamp(touch.aimDX, -52, 52), touch.aimY + clamp(touch.aimDY, -52, 52), 22, 0, Math.PI * 2); ctx.fill();
    }
  }
  // v2.0: Juice2 overlays + Bosses/StageFX draw + Tutorial coach-marks
  if (window.V2) { try { V2.drawOver(ctx, W, H); } catch (e) {} }
  /* M22: Mắt Cú — outline quái quanh tàu, CHỈ khi mất điện, vẽ SAU lớp blackout ở trên */
  if (window.Upgrades2 && s && s.owlEye && window.StageFX && StageFX.isDark()) {
    try {
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.lineWidth = 1.5;
      for (const e of Upgrades2.owlTargets(s, G.enemies)) {
        ctx.beginPath(); ctx.arc(e.x, e.y, (e.r || 12) + 3, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
    } catch (er) {}
  }
}

/* ---------------- loop & boot ---------------- */
// OPT: FPS monitor + adaptive quality — tự giảm FX khi máy yếu (dùng chung cho mobile team)
let _fpsAcc = 0, _fpsN = 0, _fpsWin = 0, _lowSec = 0, _okSec = 0, _perfReduced = false, _lastFps = 60;
function perfTick(rawDt) {
  _fpsAcc += rawDt; _fpsN++; _fpsWin += rawDt;
  if (_fpsWin >= 1) {
    _lastFps = _fpsN / Math.max(_fpsAcc, 1e-6);
    _fpsAcc = 0; _fpsN = 0; _fpsWin = 0;
    if (!_perfReduced) {
      _lowSec = _lastFps < 45 ? _lowSec + 1 : 0;
      if (_lowSec >= 2) {
        _perfReduced = true; _okSec = 0;
        try { if (typeof BG !== "undefined") BG.setQuality("reduced"); } catch (e) {}
        try { if (window.Juice) Juice.setPerfQuality("reduced"); } catch (e) {}
      }
    } else {
      _okSec = _lastFps > 55 ? _okSec + 1 : 0;
      if (_okSec >= 5) {
        _perfReduced = false; _lowSec = 0;
        try { if (typeof BG !== "undefined") BG.setQuality("full"); } catch (e) {}
        try { if (window.Juice) Juice.setPerfQuality("full"); } catch (e) {}
      }
    }
  }
}
if (typeof window !== "undefined") window.WKPerf = { get fps() { return _lastFps; }, get reduced() { return _perfReduced; } };

function loop(now) {
  const rawDt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
  // WOW: Juice timescale (hit-stop / slow-mo) điều khiển dt gameplay
  let dt = rawDt;
  if (window.Juice) { try { dt = Juice.update(rawDt); } catch (e) { dt = rawDt; } }
  // v2.0: Juice2 hit-stop (đứng hình theo kill/elite/boss)
  if (window.V2) { try { dt = V2.hitstop(rawDt, dt); } catch (e) {} }
  // WOW: cinematic (boss intro/death) hoặc draft mở → pause gameplay
  let cineLocked = false;
  if (window.Cinema) { try { cineLocked = !!Cinema.locked; } catch (e) {} }
  if (window.Juice && Juice.draftOpen) cineLocked = true;
  if (G.phase === "play" && !cineLocked) update(dt);
  // v2.0: Tutorial / Bosses module / StageFX
  if (window.V2) { try { V2.frame(dt); } catch (e) {} }
  // WOW: FX clock — warning/materialize/death-anim/particles chạy kể cả khi pause
  if (window.Juice) { try { Juice.updateFx(rawDt); } catch (e) {} }
  // WOW: Cinema clock — banner/combo/boss cine/heartbeat/trail (tự đọc info.player)
  if (window.Cinema) { try { Cinema.update(rawDt, cineInfo()); } catch (e) {} }
  // WOW: dọn entity khi death-anim chạy xong
  if (G.dying && G.dying.length) { try { // OPT: compaction in-place, không alloc array/closure
      let _dw = 0;
      for (let _di = 0; _di < G.dying.length; _di++) { if (G.dying[_di].jfDeath) G.dying[_dw++] = G.dying[_di]; }
      G.dying.length = _dw;
    } catch (e) {} }
  // WOW: music state + background state mỗi 500ms
  musicT += rawDt;
  if (musicT >= 0.5) { musicT = 0; wowMusicTick(); }
  perfTick(rawDt); // OPT: adaptive quality
  render(now);
  requestAnimationFrame(loop);
}

// WOW: info cho Cinema.update/drawFront — heartbeat + trail tự chạy bên trong
const _cineInfo = { W: 0, H: 0, player: { x: 0, y: 0, vx: 0, vy: 0, speed: 0, rot: 0, r: 13, hp: 0, maxHp: 0, shieldT: 0 } };
function cineInfo() { // OPT: tái dùng object, không alloc mỗi frame
  const s = G.ship, p = _cineInfo.player;
  _cineInfo.W = window.innerWidth; _cineInfo.H = window.innerHeight;
  if (s) {
    p.x = s.x; p.y = s.y; p.speed = s.moveSpeed || 0; p.rot = s.ang || 0;
    p.hp = s.hp; p.maxHp = s.maxHp; p.shieldT = s.shieldT || 0;
    _cineInfo.player = p;
  } else _cineInfo.player = null;
  return _cineInfo;
}

// WOW: đồng bộ music state + background state (danger/lowhp/boss/breather)
function wowMusicTick() {
  const s = G.ship; if (!s) return;
  const b = bounds();
  const winPct = winCtrl.ok ? clamp((window.outerWidth - MIN_W) / (START_W - MIN_W), 0, 1)
                            : clamp((b.w - MIN_W) / (START_W - MIN_W), 0, 1);
  try {
    if (window.Cinema) {
      let st = "normal";
      if (G.boss && !G.boss.dead) st = "boss";
      else if (winPct < 0.3) st = "danger";
      else if (s.hp === 1 || s.hp / s.maxHp < 0.3) st = "lowhp";
      else if (G.waveClearShown && !G.enemies.length && !G.spawnQueue.length) st = "breather";
      try { Cinema.bgState(st); } catch (e) {}
    }
  } catch (e) {}
  try {
    if (!window.AudioEngine || typeof AudioEngine.setMusicState !== "function") return;
    if (G.phase !== "play") return;
    const hp01 = clamp(s.hp / s.maxHp, 0, 1);
    if (G.boss && !G.boss.dead) AudioEngine.setMusicState("BOSS");
    else if (winPct < 0.3 || s.hp === 1) AudioEngine.setMusicState("DANGER", undefined, hp01);
    else if (G.enemies.length >= 12) AudioEngine.setMusicState("COMBAT");
    else if (G.enemies.length < 6) AudioEngine.setMusicState("CALM");
    // 6–11 quái: giữ nguyên state hiện tại (tránh giật)
  } catch (e) {}
}
/* v2.0 bridge: expose controlled globals cho module mới (tutorial/campaign/meta/juice2).
   Tutorial poll G/bounds/openDraft/...; Bosses hooks đi qua window.WK* helpers. */
window.G = G; window.DIFF = DIFF; window.bounds = bounds;
window.openDraft = openDraft; window.gainXp = gainXp; window.addFloat = addFloat;
window.WKSpawnEnemy = function (type, x, y) { return spawnEnemyAt(type, x, y); };
window.WKSpawnPickup = function (kind, x, y) { G.pickups.push({ kind: kind, x: x, y: y, t: 0 }); };
// AUDIT 2026-10-02: trước đây WKSpawnGems chỉ đẩy {x, y, v} — thiếu vx/vy/t nên vòng
// gems biến tọa độ thành NaN ngay frame đầu (gem vô hình, không nhặt được, không xóa được).
window.WKSpawnGems = function (n, x, y) { for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2; G.gems.push({ x: x + rand(-40, 40), y: y + rand(-40, 40), vx: Math.cos(a) * 120, vy: Math.sin(a) * 120, v: 1, t: 0 }); } };
// AUDIT 2026-10-02: bosses.js/monsters.js tra cứu các hàm này qua window (doShrink/
// doGrow/doMoveBy/winJitter + callFn) nhưng game.js chưa từng expose → đòn signature
// của boss campaign (slam thu cửa sổ, boss 5 shrink định kỳ, đẩy cửa sổ) lặng lẽ
// thành no-op. Expose đúng contract mà 2 module đó tài liệu hoá.
window.shrinkWindow = shrinkWindow; window.growWindow = growWindow;
window.pushWindow = pushWindow; window.windowJitter = windowJitter;
window.hurtShip = hurtShip; window.burst = burst; window.jxShake = jxShake;
window.spawnEnemyAt = spawnEnemyAt;
window.WKFireEB = function (x, y, vx, vy, o) { G.ebullets.push(Object.assign({ x: x, y: y, vx: vx, vy: vy, r: 7, t: 0 }, o || {})); };
window.WKHurtShip = function (dmg, x, y) { hurtShip(dmg, x, y); };
window.WKSetBanner = function (t, s) { setBanner(t, s); };
window.WKDie = function (reason) { die(reason); };
// AUDIT 2026-10-02: % cửa sổ còn lại theo đúng công thức engine dùng (popup thật
// theo outerWidth, arena ảo theo bounds) — v2glue cần cho thành tựu hạ boss.
window.WKWinPct = function () {
  try {
    const b = bounds();
    return winCtrl.ok ? clamp((window.outerWidth - MIN_W) / (START_W - MIN_W), 0, 1)
                      : clamp((b.w - MIN_W) / (START_W - MIN_W), 0, 1);
  } catch (e) { return 1; }
};
window.WKDrawBossBar = function (d) {
  // thanh boss 3 nấc (§5.4): viền sáng + 3 khấc phase + tên
  const W = canvas.width, bbw = Math.min(560, W - 120);
  ctx.fillStyle = "#000000aa"; ctx.fillRect((W - bbw) / 2, 12, bbw, 14);
  const f = clamp((d.hp || 0) / (d.maxHp || 1), 0, 1);
  ctx.fillStyle = d.color || "#c084fc"; ctx.fillRect((W - bbw) / 2, 12, bbw * f, 14);
  ctx.fillStyle = "#00000088";
  for (let i = 1; i < 3; i++) ctx.fillRect((W - bbw) / 2 + bbw * i / 3 - 1, 12, 2, 14);
  ctx.fillStyle = "#fff"; ctx.font = "bold 12px sans-serif"; ctx.textAlign = "center";
  // AUDIT 2026-10-02: tên boss theo ngôn ngữ (barData cung cấp nameEn + isEn).
  ctx.fillText(((d.isEn && d.nameEn) ? d.nameEn : (d.nameVi || d.name || "BOSS")) + (d.phase ? " — P" + d.phase : ""), W / 2, 24);
  ctx.textAlign = "left";
  if (d.countdown > 0) { ctx.fillStyle = "#ffd479"; ctx.font = "bold 13px sans-serif"; ctx.fillText(Math.ceil(d.countdown) + "s", W / 2 + bbw / 2 + 10, 24); ctx.textAlign = "left"; }
};
// v2.0: cầu nối V2 (js/v2glue.js) — boot campaign/tutorial/meta/daily
// AUDIT 2026-10-02: boot PHẢI chạy sau resetGame() (đúng như tài liệu của v2glue) —
// trước đây boot chạy trước, resetGame gán banner:"" ngay sau đó nên banner Daily
// (và mọi banner boot set) bị xóa trong cùng tick, không bao giờ hiển thị.
// F-02: preboot gán runMods TRƯỚC resetGame() đầu tiên → run đầu mỗi lần tải trang cũng hưởng Xưởng
if (window.V2) { try { V2.preboot(); } catch (e) {} }
resetGame();
if (window.V2) { try { V2.boot({ profileId: PROFILE_ID, diffKey: DIFF_KEY }); } catch (e) {} }
// Phụ lục A node 9 — Trợ lý kỹ thuật: mở 1 draft ngay đầu run cho người đã mua
if (window.V2 && V2.runMods && V2.runMods.freeUpgrade && G.phase === "play") {
  try { openDraft(); } catch (e) {}
}
if (bus) bus.postMessage({ type: "arena-open" });
requestAnimationFrame(loop);
})();
