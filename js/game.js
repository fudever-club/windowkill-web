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
const DIFFS = {
  chill:    { label: "Chill",       hpMul: 0.7,  spMul: 0.85, chew: 1.3,  shipHp: 4, scoreMul: 1.0, spawnMul: 1.2 },
  normal:   { label: "Thường",      hpMul: 1.0,  spMul: 1.0,  chew: 0.9,  shipHp: 3, scoreMul: 1.0, spawnMul: 1.0 },
  hardcore: { label: "Khắc nghiệt", hpMul: 1.45, spMul: 1.15, chew: 0.65, shipHp: 2, scoreMul: 1.6, spawnMul: 0.85 },
};
DIFFS.hard = DIFFS.hardcore; // launcher gửi diff=hard — alias để độ khó Khắc nghiệt có hiệu lực
const DIFF = DIFFS[qp.get("diff")] || DIFFS.normal;
const DIFF_KEY = qp.get("diff") in DIFFS ? qp.get("diff") : "normal";
const PROFILE_ID = qp.get("profile") || null;
AudioEngine.setSettings({ music: qp.get("music") === "1", sfx: qp.get("sfx") === "1" });
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

/* ---------------- điều khiển cửa sổ thật ---------------- */
const winCtrl = { tested: false, ok: true, expect: 0 };
let arena = null; // fallback đấu trường ảo khi trình duyệt chặn resize
const bounds = () => arena || { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
let wvx = 0, wvy = 0;

function shrinkWindow(dw, dh) {
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
        addFloat(window.innerWidth / 2, 130, "Trình duyệt chặn resize — dùng đấu trường ảo", "#ffd479");
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
  const sp = Math.hypot(wvx, wvy), MAX = 950;
  if (sp > MAX) { wvx *= MAX / sp; wvy *= MAX / sp; }
}
function applyWindowMotion(dt) {
  if (Math.hypot(wvx, wvy) > 2 && winCtrl.ok) {
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
  const PRI = { fragment: 0, debris: 1, nest: 2, shield: 3 }; // hàng đợi ưu tiên
  const queue = [];
  const sats = new Map(); // id -> sat
  let permAsked = false, pollT = 0, blockedWarned = false;

  const pref = () => { try { return localStorage.getItem("wk_sat_pref"); } catch (e) { return null; } };
  const setPref = (v) => { try { localStorage.setItem("wk_sat_pref", v); } catch (e) {} };

  function request(role, opts = {}) {
    if (SAT_MODE === "off") return null; // mechanic không trigger (caller spawn thường thay thế)
    if (sats.size + queue.length >= MAX_SATS) return null;
    const o = Object.assign({ hp: 6, color: "#8b2fc9", label: "VỆ TINH", w: 340, h: 220 }, opts);
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
    const q = new URLSearchParams({ role: sat.role, id: sat.id, hp: sat.hp, color: sat.color, label: sat.label }).toString();
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
      setBanner("Dùng cửa sổ mô phỏng", "Trình duyệt chặn popup — game vẫn chơi đủ mechanic!");
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
      if (sat.dead) continue;
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
    // dọn khỏi map sau hiệu ứng (sim) hoặc khi sat-bye/poll tới (real)
    if (sat.sim) setTimeout(() => sats.delete(id), 350);
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
    const sat = sats.get(id);
    if (!sat || sat.dead) return;
    if (m.type === "sat-ready") sat.ready = true, sat.canMove = !!m.canMove;
    else if (m.type === "sat-hit") {
      const x = clamp(+m.x || 0, 0, sat.w), y = clamp(+m.y || 0, 0, sat.h);
      damage(id, x, y);
    } else if (m.type === "sat-bye") { sats.delete(id); }
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
      // title bar
      const tg = ctx.createLinearGradient(0, s.y, 0, s.y + 26);
      tg.addColorStop(0, "#1a2b4a"); tg.addColorStop(1, "#0f1c33");
      ctx.fillStyle = tg;
      roundRect(s.x, s.y, s.sw, 26, [8, 8, 0, 0]); ctx.fill();
      const cols = ["#ff5f57", "#febc2e", "#28c840"];
      cols.forEach((c, i) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(s.x + 16 + i * 18, s.y + 13, 5.5, 0, Math.PI * 2); ctx.fill(); });
      ctx.fillStyle = "#cfe3ff"; ctx.font = "600 11px system-ui"; ctx.textAlign = "left"; ctx.textBaseline = "middle";
      ctx.fillText(s.label, s.x + 74, s.y + 14);
      ctx.fillStyle = "#ffffff55"; ctx.font = "10px system-ui"; ctx.textAlign = "right";
      ctx.fillText("mô phỏng", s.x + s.sw - 8, s.y + 14);
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
    ctx.fillText("KHIÊN", x, y + 34);
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
      ctx.fillText("BẤM ĐỂ PHÁ!", cx, s.y + s.sh - 22);
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
    addFloat(p.x, p.y - 24, "Ổ VỠ! Quái tràn ra!", "#ff7ad9", true);
    AudioEngine.sfx.bigboom();
  } else if (mode === "killed") {
    burst(p.x, p.y, 26, ["#c084fc", "#8b2fc9", "#fff"], 320);
    addFloat(p.x, p.y - 24, "Ổ quái bị phá!", "#c084fc", true);
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
      addFloat(p.x, p.y - 20, "Ổ nhả quái!", "#c084fc");
    }
  }
}

function maybeTriggerNest(n) {
  if (SAT_MODE === "off" || SatManager.anyRole("nest")) return;
  const act = actOf(n);
  const want = (act === 1 && n >= 6) || (act === 3 && n > 0 && n % 5 === 0);
  if (!want) return;
  const sat = SatManager.request("nest", {
    hp: 6, color: "#8b2fc9", label: "Ổ QUÁI", w: 340, h: 220,
    spawnEvery: 6, pool: ["chewer", "chaser"], maxSpawns: 8,
    onClose: onNestClose,
  });
  if (sat) {
    sat.spawnT = 2; // nhả con đầu sau 2s
    setBanner("Ổ quái xuất hiện! Bấm vào cửa sổ tím để phá.", "");
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
    addFloat(G.ship.x, G.ship.y - 34, "Khiên hồi đầy!", "#38bdf8", true);
    AudioEngine.sfx.pickup();
    return;
  }
  const sat = SatManager.request("shield", {
    hp: 999, color: "#38bdf8", label: "KHIÊN", w: 260, h: 200,
    shieldPx: 60, hearts: 5,
    onClose: (mode) => {
      if (mode === "killed") {
        const p = shieldTarget() || { x: G.ship.x, y: G.ship.y };
        burst(p.x, p.y, 34, ["#38bdf8", "#ffffff"], 340);
        addFloat(p.x, p.y - 30, "Khiên vỡ rồi!", "#38bdf8", true);
        AudioEngine.sfx.bigboom();
      }
      // thả chewer đang bám khiên
      G.enemies.forEach(e => { if (e.onShield) { e.onShield = false; e.latched = null; } });
    },
  });
  if (sat) {
    sat.shieldPx = 60; sat.hearts = 5; sat.followT = 0;
    setBanner("Khiên cửa sổ! Quái sẽ gặm nó thay bạn.", "");
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
  setBanner("Mảnh vỡ lao tới! Bấm để phá hủy.", "");
  AudioEngine.sfx.boss();
  for (let i = 0; i < n; i++) {
    SatManager.request("debris", {
      hp: 3, color: "#ff5a5a", label: "MẢNH VỠ", w: 200, h: 140, speed: 150,
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
    const d = Math.hypot(s.x - cx, s.y - cy) || 1;
    sat.vx = (s.x - cx) / d * sp; sat.vy = (s.y - cy) / d * sp;
  } else {
    let sx, sy;
    try { sx = sat.win.screenX + sat.w / 2; sy = sat.win.screenY + sat.h / 2; }
    catch (e) { return; }
    const mx = window.screenX + window.outerWidth / 2, my = window.screenY + window.outerHeight / 2;
    const d = Math.hypot(mx - sx, my - sy) || 1;
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
      if (Math.hypot(s.x - cx, s.y - cy) < s.r + 34) {
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
            addFloat(window.innerWidth / 2, window.innerHeight / 2 - 40, "Mảnh vỡ đâm cửa sổ!", "#ff5a5a", true);
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
      hp: 9999, color: "#c084fc", label: "MẢNH BOSS", w: 220, h: 160,
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
            addFloat(mini.x, mini.y - 30, "Mảnh nhập vào arena!", "#c084fc", true);
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
  setBanner("Boss vỡ thành 3 mảnh! Bấm để bắn hạ — đừng để mảnh chạm cửa sổ!", "");
  AudioEngine.sfx.boss();
}

function fragmentBite(edge) {
  if (edge === "left" || edge === "right") shrinkWindow(8, 0);
  else shrinkWindow(0, 8);
  AudioEngine.sfx.crack(); G.shake = Math.max(G.shake, 6);
  addFloat(window.innerWidth / 2, 60, "Mảnh boss cắn viền!", "#c084fc", true);
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
      if (sat.shipCD <= 0 && Math.hypot(s.x - cx, s.y - cy) < s.r + 30) {
        sat.shipCD = 1; hurtShip(1, cx, cy);
        sat.vx *= -1; sat.vy *= -1;
      }
      if (cx < b.x + 20) { fragmentBite("left"); sat.vx = Math.abs(sat.vx); }
      else if (cx > b.x + b.w - 20) { fragmentBite("right"); sat.vx = -Math.abs(sat.vx); }
      if (cy < b.y + 20) { fragmentBite("top"); sat.vy = Math.abs(sat.vy); }
      else if (cy > b.y + b.h - 20) { fragmentBite("bottom"); sat.vy = -Math.abs(sat.vy); }
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
          const nearD = Math.hypot(nearX, nearY);
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
  SatManager.flush(); // phím cũng là user gesture hợp lệ để mở popup
  if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
  if ((e.code === "KeyP" || e.code === "Escape")) {
    if (G.phase === "play") pauseGame(true); else if (G.phase === "paused") pauseGame(false);
  }
  if (e.code === "KeyM") {
    const on = qp.get("music") === "off";
    qp.set("music", on ? "on" : "off");
    AudioEngine.setSettings({ music: on });
    if (on) AudioEngine.startMusic(curTrack);
  }
  if (e.code === "KeyR" && G.phase === "over") resetGame();
});
window.addEventListener("keyup", e => keys[e.code] = false);
canvas.addEventListener("mousemove", e => { mouse.x = e.clientX; mouse.y = e.clientY; });
canvas.addEventListener("mousedown", e => {
  mouse.down = true;
  SatManager.flush(); // user gesture: mở popup vệ tinh đang xếp hàng
  SatManager.hitSim(e.clientX, e.clientY); // click vào cửa sổ mô phỏng = 1 sát thương
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
  const d = Math.hypot(dx, dy);
  if (d < 12) return null;
  const m = Math.min(d, 60) / 60;
  return { x: dx / d * m, y: dy / d * m };
}
function touchAim() {
  const d = Math.hypot(touch.aimDX, touch.aimDY);
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
  return {
    x: window.innerWidth / 2, y: window.innerHeight / 2, r: 13,
    hp: DIFF.shipHp, maxHp: DIFF.shipHp,
    speed: 275, fireInt: 0.21, fireT: 0, streams: 1, dmg: 1, pierce: 0,
    magnet: 125, thorns: 0, bulletSpd: 560, slow: 0, dropMul: 1, scoreMul: DIFF.scoreMul,
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
  { ico: "i-fire", t: "Tốc bắn +30%", d: "Xả đạn nhanh hơn.", apply: s => s.fireInt *= 0.77 },
  { ico: "i-split", t: "+1 tia đạn", d: "Bắn thêm một tia (tối đa 4).", apply: s => s.streams = Math.min(4, s.streams + 1), can: s => s.streams < 4 },
  { ico: "i-bomb", t: "Sát thương +1", d: "Mỗi viên đạn đau hơn.", apply: s => s.dmg += 1 },
  { ico: "i-rocket", t: "Tốc độ +18%", d: "Tàu lanh lẹ hơn.", apply: s => s.speed *= 1.18 },
  { ico: "i-heart", t: "+1 máu & hồi 1", d: "Tăng máu tối đa, hồi ngay 1 tim.", apply: s => { s.maxHp += 1; s.hp = Math.min(s.maxHp, s.hp + 1); } },
  { ico: "i-pierce", t: "Đạn xuyên +1", d: "Đạn bay xuyên thêm quái.", apply: s => s.pierce += 1 },
  { ico: "i-magnet", t: "Nam châm +60%", d: "Hút <svg class=\"ic\" aria-hidden=\"true\"><use href=\"#i-gem\"/></svg> từ xa hơn.", apply: s => s.magnet *= 1.6 },
  { ico: "i-shield", t: "Giáp gai", d: "Va chạm hất văng quái và gây sát thương.", apply: s => s.thorns += 1 },
  { ico: "i-gem", t: "Tham lam", d: "+30% điểm mọi nguồn.", apply: s => s.scoreMul *= 1.3 },
  { ico: "i-bolt", t: "Đạn siêu tốc", d: "+25% tốc độ & tầm bay đạn.", apply: s => s.bulletSpd *= 1.25 },
  { ico: "i-clover", t: "May mắn", d: "+50% tỉ lệ rớt vật phẩm.", apply: s => s.dropMul *= 1.5 },
  { ico: "i-snow", t: "Đạn băng", d: "Quái trúng đạn bị làm chậm 1.5s.", apply: s => s.slow = 1.5 },
];
function openDraft() {
  G.phase = "draft";
  const pool = UPS.filter(u => !u.can || u.can(G.ship));
  const picks = [];
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
          u.apply(G.ship); AudioEngine.sfx.up();
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
      u.apply(G.ship); AudioEngine.sfx.up();
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
  "chaser": { id: "chaser", name: "Truy Đuổi", behavior: "chase", color: "#ff5470",
    r: 12, dmg: 1, score: 10, xp: 1, minWave: 1, weight: 100, acts: [1, 2, 3],
    hp: w => 2 + w * 0.5, spd: w => 95 + w * 7, desc: "Lao thẳng vào tàu." },
  "chewer": { id: "chewer", name: "Gặm Viền", behavior: "chew", color: "#c084fc",
    r: 13, dmg: 1, score: 25, xp: 2, minWave: 2, weight: 70, acts: [1, 2, 3],
    hp: w => 3 + w * 0.4, spd: w => 78 + w * 4,
    init: e => { e.latched = null; e.chewT = 0; }, desc: "Bám viền, gặm nhỏ cửa sổ." },
  "tank": { id: "tank", name: "Xe Tăng", behavior: "chase", color: "#ffb020",
    r: 23, dmg: 1, score: 50, xp: 4, minWave: 3, weight: 40, acts: [1, 2, 3],
    hp: w => 12 + w * 2.2, spd: () => 46, desc: "Trâu, chậm, rớt 3 gem." },
  "dasher": { id: "dasher", name: "Lao Tới", behavior: "dash", color: "#ffe14d",
    r: 11, dmg: 1, score: 20, xp: 2, minWave: 3, weight: 45, acts: [1, 2, 3],
    hp: w => 4 + w * 0.5, spd: w => 120 + w * 5,
    init: e => { e.state = "stalk"; e.stateT = 0; e.dx = 0; e.dy = 0; },
    desc: "stalk -> aim (telegraph) -> dash." },
  "splitter": { id: "splitter", name: "Phân Thân", behavior: "chase", color: "#7df9ff",
    r: 18, dmg: 1, score: 35, xp: 3, minWave: 4, weight: 30, acts: [1, 2, 3],
    hp: w => 7 + w, spd: w => 70 + w * 4,
    onDeath: e => { for (let i = 0; i < 2; i++) spawnEnemyAt("mini", e.x + rand(-14, 14), e.y + rand(-14, 14)); },
    desc: "Chết đẻ 2 mini." },
  "mini": { id: "mini", name: "Mini", behavior: "chase", color: "#ff9df3",
    r: 8, dmg: 1, score: 8, xp: 1, minWave: 0, weight: 0, acts: [1, 2, 3],
    hp: () => 1.5, spd: () => 150, desc: "Chỉ sinh từ splitter." },
  "weaver": { id: "weaver", name: "Dệt Lưới", behavior: "weave", color: "#4dd8a7",
    r: 11, dmg: 1, score: 22, xp: 2, minWave: 6, weight: 40, acts: [1, 2, 3],
    hp: w => 5 + w * 0.6, spd: w => 110 + w * 6, desc: "Zigzag biên độ lớn, khó ngắm." },
  "spitter": { id: "spitter", name: "Phun Độc", behavior: "spit", color: "#b26bff",
    r: 12, dmg: 1, score: 30, xp: 3, minWave: 8, weight: 30, acts: [2, 3],
    hp: w => 6 + w * 0.7, spd: w => 85 + w * 4,
    init: e => { e.shotT = rand(1, 2); }, desc: "Giữ khoảng cách, bắn đạn tầm xa." },
  "healer": { id: "healer", name: "Hồi Phục", behavior: "heal", color: "#7dff9a",
    r: 12, dmg: 0, score: 28, xp: 3, minWave: 11, weight: 22, acts: [2, 3],
    hp: w => 8 + w * 0.8, spd: w => 90 + w * 4,
    init: e => { e.healT = 0; e.healTarget = null; }, desc: "Hồi máu quái khác, không tấn công." },
  "kamikaze": { id: "kamikaze", name: "Cảm Tử", behavior: "kamikaze", color: "#ff7a1a",
    r: 10, dmg: 1, score: 18, xp: 2, minWave: 13, weight: 30, acts: [2, 3],
    hp: w => 3 + w * 0.4, spd: w => 150 + w * 8,
    init: e => { e.fuse = -1; }, desc: "Lao vào viền cửa sổ rồi tự nổ." },
};

const BEHAVIORS = {
  chase: { update(e, dt, s, spd) { // tìm tàu + lượn sóng nhẹ
    const dx = s.x - e.x, dy = s.y - e.y, d = Math.hypot(dx, dy) || 1;
    const wob = Math.sin(e.t * 6) * 12;
    e.x += (dx / d * spd + -dy / d * wob) * dt;
    e.y += (dy / d * spd + dx / d * wob) * dt;
  } },
  weave: { update(e, dt, s, spd) { // zigzag biên độ lớn, khó đoán
    const dx = s.x - e.x, dy = s.y - e.y, d = Math.hypot(dx, dy) || 1;
    const wob = Math.sin(e.t * 7) * 110;
    e.x += (dx / d * spd + -dy / d * wob) * dt;
    e.y += (dy / d * spd + dx / d * wob) * dt;
  } },
  chew: { update(e, dt, s, spd) { // bám viền -> gặm cửa sổ (chiêu signature)
    if (!e.latched) {
      const sh = typeof shieldTarget === "function" ? shieldTarget() : null; // M3: chewer trong 300px ưu tiên bám khiên
      let p = nearestEdgePoint(e.x, e.y), useShield = false;
      if (sh) {
        const ds = Math.hypot(sh.x - e.x, sh.y - e.y);
        if (ds < 300) { useShield = true; p = { x: sh.x, y: sh.y, edge: sh.edge }; }
      }
      const d = Math.hypot(p.x - e.x, p.y - e.y);
      if (d < 16) {
        e.latched = p.edge; e.onShield = useShield; e.x = p.x; e.y = p.y;
        addFloat(e.x, e.y - 24, useShield ? "⚠ Gặm khiên!" : "⚠ Gặm viền!", useShield ? "#38bdf8" : "#c084fc");
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
      const dx = s.x - e.x, dy = s.y - e.y, d = Math.hypot(dx, dy) || 1;
      e.x += dx / d * spd * dt; e.y += dy / d * spd * dt;
      if (d < 260 && e.stateT <= 0) { e.state = "aim"; e.stateT = 0.7; }
    } else if (e.state === "aim") {
      const dx = s.x - e.x, dy = s.y - e.y, d = Math.hypot(dx, dy) || 1;
      e.dx = dx / d; e.dy = dy / d;
      if (e.stateT <= 0) { e.state = "dash"; e.stateT = 0.45; AudioEngine.sfx.shoot(); }
    } else {
      e.x += e.dx * spd * 4.2 * dt; e.y += e.dy * spd * 4.2 * dt;
      if (e.stateT <= 0) { e.state = "stalk"; e.stateT = 1.2; }
    }
  } },
  spit: { update(e, dt, s, spd) { // giữ cự ly, strafe, bắn đạn tầm xa
    const dx = s.x - e.x, dy = s.y - e.y, d = Math.hypot(dx, dy) || 1;
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
      const dx = tgt.x - e.x, dy = tgt.y - e.y, d = Math.hypot(dx, dy) || 1;
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
      const dx = e.x - s.x, dy = e.y - s.y, d = Math.hypot(dx, dy) || 1;
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
    const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
    if (d < 46) {
      e.fuse = 0.8;
      AudioEngine.sfx.shrink();
      addFloat(e.x, e.y - 20, "SẮP NỔ!", "#ff7a1a");
    } else { e.x += dx / d * spd * dt; e.y += dy / d * spd * dt; }
  } },
};

const ACTS = [
  { id: 1, name: "NEON GRID", waves: [1, 10], hpMul: 1.0, spMul: 1.0, scoreMul: 1.0, bgStage: 1,
    palette: { bg0: "#0b1e3a", bg1: "#04080f", grid: "#ffffff08", edge: "rgba(255,110,196,0.28)" },
    music: "act1", sub: "Lưới neon — bắn quái tím trước, chúng gặm cửa sổ!",
    boss: { name: "GÃ GẶM KHỔNG LỒ", color: "#8b2fc9", hpMul: 1.0, shot: "ring", slam: 26, adds: ["chewer", "chewer"] } },
  { id: 2, name: "DEEP VOID", waves: [11, 20], hpMul: 1.35, spMul: 1.08, scoreMul: 1.25, bgStage: 3,
    palette: { bg0: "#160b33", bg1: "#05030d", grid: "#b26bff10", edge: "rgba(178,107,255,0.35)" },
    music: "act2", sub: "Hư không sâu — coi chừng quái bắn xa và cảm tử!",
    boss: { name: "VOID REAPER", color: "#5b21b6", hpMul: 1.6, shot: "aimed", slam: 32, adds: ["dasher"] } },
  { id: 3, name: "CORE BREACH", waves: [21, Infinity], hpMul: 1.8, spMul: 1.15, scoreMul: 1.6, bgStage: 2,
    palette: { bg0: "#331016", bg1: "#0d0505", grid: "#ff547010", edge: "rgba(255,84,112,0.40)" },
    music: "act3", sub: "Lõi vỡ — tổng lực! Giữ cửa sổ sống sót.",
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
  "shield":    { w: 35, use: s => { s.shieldT = 6; addFloat(s.x, s.y - 30, "Khiên 6s!", "#9df3ff", true); } },
  "nuke":      { w: 15, use: () => nukeBlast() },
  "magnet":    { w: 22, use: s => { s.magnetT = 8; addFloat(s.x, s.y - 30, "HÚT GEM 8s!", "#7df9ff", true); } },
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
function mkEnemy(type, x, y) {
  const def = MONSTER_REGISTRY[type];
  if (!def) return null;
  const aMul = ACTS[actOf(G.wave) - 1];
  const e = {
    type, behavior: def.behavior, x, y, t: rand(0, 9), flash: 0, slowT: 0, dead: false,
    kbx: 0, kby: 0, r: def.r, dmg: def.dmg, color: def.color,
    hp: def.hp(G.wave) * DIFF.hpMul * aMul.hpMul,
    speed: def.spd(G.wave) * DIFF.spMul * aMul.spMul,
    xp: def.xp,
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
        () => {
          G.pendingSpawns = Math.max(0, (G.pendingSpawns || 1) - 1);
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
  addFloat(e.x, e.y - 24, "BÙM! -cửa sổ", "#ff7a1a", true);
  const s = G.ship;
  if (dist2(e.x, e.y, s.x, s.y) < 130 * 130) hurtShip(1, e.x, e.y);
}
function buildSpawnQueue(n) {
  const act = actOf(n);
  const pool = Object.values(MONSTER_REGISTRY).filter(d => d.acts.includes(act) && d.minWave <= n && d.weight > 0);
  const totalW = pool.reduce((a, d) => a + d.weight, 0);
  const count = Math.round((4 + n * 3) * (n === 1 ? 0.7 : 1) * (act === 1 ? 1 : act === 2 ? 1.15 : 1.3));
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
  if (n % 5 === 0) { spawnBoss(); return; }
  G.spawnQueue = buildSpawnQueue(n);
  G.spawnQueue.sort(() => Math.random() - 0.5);
  G.spawnT = 0;
  maybeTriggerNest(n); // M1: ổ quái vệ tinh (act 1 wave 6+, endless mỗi 5 wave)
  const sub = n === 1 ? "Bắn quái tím trước — chúng gặm cửa sổ!" : pickSub();
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
  return ["Quái tím gặm viền cửa sổ — bắn chúng xuống!",
          "Bắn vào viền để đẩy cửa sổ bay!",
          "Nhặt 💎 lên cấp, chọn nâng cấp!",
          "Giữ khoảng cách với quái vàng — nó lao tới!"][Math.floor(Math.random() * 4)];
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
    setBanner(`⚠ BOSS: ${v.name}`, "Nó nện cửa sổ — giữ cửa sổ sống sót!");
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
  if (s.hp <= 0) die("ship");
}
function die(reason) {
  if (G.phase === "over") return;
  G.phase = "over";
  SatManager.closeAll(); // dọn popup vệ tinh, không để tiến trình mồ côi
  AudioEngine.sfx.over();
  try { AudioEngine.setMusicState("GAMEOVER"); } catch (e) {} // WOW: downlifter + pad
  AudioEngine.stopMusic();
  const reasonTxt = reason === "window" ? "Cửa sổ vỡ nát!" : "Tàu nổ tung!";
  burst(G.ship.x, G.ship.y, 46, ["#0080FF", "#ffffff", "#8fc3ff"], 380);
  windowJitter(30); jxShake(12, 700, 10); // WOW tier: boss chết / player die
  if (bus) bus.postMessage({ type: "gameover", profileId: PROFILE_ID, score: G.score, wave: G.wave, act: G.act,
    kills: G.kills, time: Math.round(G.time), timeSec: Math.round(G.time), diff: DIFF_KEY, reason: reasonTxt });
  $("over-title").textContent = reasonTxt;
  $("over-score").textContent = `${G.score} điểm · Wave ${G.wave}`;
  $("over-stats").innerHTML = `<svg class="ic" aria-hidden="true"><use href="#i-skull"/></svg> <b>${G.kills}</b> quái hạ · <svg class="ic" aria-hidden="true"><use href="#i-levelup"/></svg> cấp <b>${G.level}</b> · <svg class="ic" aria-hidden="true"><use href="#i-clock"/></svg> <b>${Math.round(G.time)}s</b> · <b>${DIFF.label}</b>`;
  let recTxt = "";
  try {
    const hk = PROFILE_ID ? `wk_high_${DIFF_KEY}_${PROFILE_ID}` : `wk_high_${DIFF_KEY}`;
    const prev = JSON.parse(localStorage.getItem(hk) || "null");
    if (!prev || G.score > prev.score) recTxt = `<svg class="ic" aria-hidden="true"><use href="#i-trophy"/></svg> Kỷ lục mới!`;
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
  });
  G.ship = newShip();
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
  const actMul = ACTS[(G.act || 1) - 1].scoreMul;
  const pts = Math.round((base + G.combo * 2) * G.ship.scoreMul * actMul);
  G.score += pts;
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
  const pdefs = Object.entries(PICKUP_DEFS).filter(([, d]) => !d.can || d.can(G.ship));
  const ptot = pdefs.reduce((a, [, d]) => a + d.w, 0);
  const roll = Math.random() / G.ship.dropMul;
  if (roll < 0.10 && ptot > 0) {
    let r = roll / 0.10 * ptot, kind = pdefs[0][0];
    for (const [k, d] of pdefs) { r -= d.w; if (r <= 0) { kind = k; break; } }
    G.pickups.push({ kind, x: e.x, y: e.y, t: 0 });
  }
}
function nukeBlast() {
  AudioEngine.sfx.nuke();
  jxShake(12, 700, 10); windowJitter(30);
  // WOW: flash trắng toàn màn hình khi nuke nổ
  if (window.Cinema) { try { Cinema.nukeFlash(); } catch (e) {} }
  addFloat(G.ship.x, G.ship.y - 40, "💣 NUKE!", "#ffd166", true);
  G.enemies.forEach(e => { if (!e.dead) { e.hp -= 15; if (e.hp <= 0) killEnemy(e); else { e.flash = 0.15; } } });
  if (G.boss && !G.boss.dead) {
    G.boss.hp -= 40; G.boss.flash = 0.2;
    if (G.boss.hp <= 0) killBoss(); else if (typeof bossSplitCheck === "function") bossSplitCheck(G.boss); // M2
  }
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
  const pts = Math.round(500 * G.ship.scoreMul);
  G.score += pts; G.kills++;
  try { AudioEngine.sfx.explosion(1.2); } catch (err) { try { AudioEngine.sfx.bigboom(); } catch (e2) {} }
  jxShake(12, 700, 10); windowJitter(30);
  burst(bs.x, bs.y, 60, ["#c084fc", "#fff", "#ffd166"], 420);
  // WOW: boss burst + hit-stop elite + damage number vàng
  if (window.Juice) {
    try { Juice.burst("boss", bs.x, bs.y); Juice.onKill("boss", true); } catch (err) {}
    try { Juice.damageNumber(bs.x, bs.y - 60, pts, "crit", null); } catch (err) {}
  }
  addFloat(bs.x, bs.y - 50, `BOSS HẠ! +${pts}`, "#fde68a", true);
  // WOW: death cinematic (~2.1s, lock update) — banner "BOSS BỊ HẠ!" do Cinema vẽ
  if (window.Cinema) {
    G.bossCine = true;
    try {
      Cinema.bossDeath(bs, { player: G.ship, drawBoss: (c, x, y, s, a) => drawBossShape(c, x, y, s, a, bs.color) })
        .then(() => { G.bossCine = false; }, () => { G.bossCine = false; });
    } catch (err) { G.bossCine = false; }
  } else {
    setBanner(`WAVE ${G.wave} CLEAR — ${ACTS[(G.act || 1) - 1].name}`, "Cửa sổ được vá lại +40px");
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

  /* di chuyển */
  let mx = 0, my = 0;
  if (keys.KeyW || keys.ArrowUp) my -= 1;
  if (keys.KeyS || keys.ArrowDown) my += 1;
  if (keys.KeyA || keys.ArrowLeft) mx -= 1;
  if (keys.KeyD || keys.ArrowRight) mx += 1;
  const tm = touchMoveVec();
  if (tm) { mx = tm.x; my = tm.y; }
  const ml = Math.hypot(mx, my);
  if (ml > 0.05) {
    const sp = s.speed * Math.min(1, ml);
    s.x += mx / (ml || 1) * sp * dt; s.y += my / (ml || 1) * sp * dt;
    s.moveSpeed = sp; // WOW: Cinema.playerFx tự vẽ trail khi speed > 180
  } else s.moveSpeed = 0;
  s.x = clamp(s.x, b.x + s.r, b.x + b.w - s.r);
  s.y = clamp(s.y, b.y + s.r, b.y + b.h - s.r);
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
      G.spawnT = Math.max(0.22, 0.85 * DIFF.spawnMul - G.wave * 0.05);
      spawnEnemy(G.spawnQueue.pop());
    }
  } else if (!G.enemies.length && !G.boss && !(G.pendingSpawns > 0) && G.phase === "play") {
    G.waveBreak -= dt;
    if (G.waveBreak <= 0) {
      G.waveBreak = 2.6;
      s.hp = Math.min(s.maxHp, s.hp + 1);
      growWindow(40, 30);
      addFloat(s.x, s.y - 40, "🪟 +vá cửa sổ!", "#9df3ff", true);
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
      const sp = Math.hypot(bl.vx, bl.vy);
      pushWindow(bl.vx / sp * 300, bl.vy / sp * 300);
      AudioEngine.sfx.thud();
      burst(clamp(bl.x, b.x, b.x + b.w), clamp(bl.y, b.y, b.y + b.h), 8, ["#9df3ff", "#fff"], 200);
      G.enemies.forEach(e => {
        if (e.type === "chewer" && e.latched === edge && !e.dead) {
          e.hp -= 1; e.latched = null;
          const p = nearestEdgePoint(e.x, e.y);
          e.x = p.x - p.dx * 70; e.y = p.y - p.dy * 70;
          burst(e.x, e.y, 10, ["#c084fc", "#fff"], 220);
          addFloat(e.x, e.y - 20, "Hất văng!", "#c084fc");
          if (e.hp <= 0) killEnemy(e);
        }
      });
      dead = true;
    }
    if (!dead) {
      for (const e of G.enemies) {
        if (e.dead) continue;
        if (dist2(bl.x, bl.y, e.x, e.y) < (bl.r + e.r) * (bl.r + e.r)) {
          damageEnemy(e, bl.dmg, bl);
          if (bl.pierce > 0) bl.pierce--; else dead = true;
          break;
        }
      }
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
    const spd = e.speed * (e.slowT > 0 ? 0.45 : 1);
    // knockback vật lý
    e.x += e.kbx * dt; e.y += e.kby * dt; e.kbx *= 0.9; e.kby *= 0.9;

    // data-driven: mỗi quái chạy strategy của nó (BEHAVIORS[e.behavior])
    const bh = BEHAVIORS[e.behavior] || BEHAVIORS.chase;
    bh.update(e, dt, s, spd);
    if (G.phase !== "play") return;
    // chạm tàu (healer dmg=0 -> không gây sát thương)
    if (dist2(e.x, e.y, s.x, s.y) < (e.r + s.r) * (e.r + s.r)) {
      if (e.dmg > 0) hurtShip(e.dmg, e.x, e.y);
      if (G.phase !== "play") return;
      const dx = e.x - s.x, dy = e.y - s.y, d = Math.hypot(dx, dy) || 1;
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
        setBanner(`WAVE ${G.wave} CLEAR — ${cfg.name}`, G.wave % 5 === 0 ? "Boss hạ! Chuẩn bị wave tiếp theo…" : "Chuẩn bị wave tiếp theo…");
        AudioEngine.sfx.wave();
      }
    } else {
      setBanner(`WAVE ${G.wave} CLEAR — ${cfg.name}`, G.wave % 5 === 0 ? "Boss hạ! Chuẩn bị wave tiếp theo…" : "Chuẩn bị wave tiếp theo…");
      AudioEngine.sfx.wave();
    }
    try { AudioEngine.setMusicState("VICTORY"); } catch (err) {}
  }

  /* boss */
  const bs = G.boss;
  if (bs && !bs.dead) {
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
    const dx = s.x - bs.x, dy = s.y - bs.y, d = Math.hypot(dx, dy) || 1;
    bs.x += dx / d * 34 * dt; bs.y += dy / d * 34 * dt;
    bs.atkT -= dt; bs.spawnT -= dt; bs.slamT -= dt;
    if (bs.atkT <= 0) {
      bs.atkT = Math.max(1.4, 2.6 - G.wave * 0.06);
      const bdx = s.x - bs.x, bdy = s.y - bs.y, baseA = Math.atan2(bdy, bdx);
      if (bs.shot === "aimed") { // VOID REAPER: chùm đạn xòe về phía tàu
        for (let i = -3; i <= 3; i++) {
          const a = baseA + i * 0.16;
          G.ebullets.push({ x: bs.x, y: bs.y, vx: Math.cos(a) * 240, vy: Math.sin(a) * 240, r: 6, life: 4 });
        }
      } else if (bs.shot === "spiral") { // CORE TYRANT: xoắn ốc xoay theo thời gian
        const n = 18, off = bs.t * 2.2;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + off;
          G.ebullets.push({ x: bs.x, y: bs.y, vx: Math.cos(a) * 200, vy: Math.sin(a) * 200, r: 6, life: 4.5 });
        }
      } else { // ring: vòng đạn tròn (bản cũ)
        const n = 10 + Math.floor(G.wave / 2);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + bs.t;
          G.ebullets.push({ x: bs.x, y: bs.y, vx: Math.cos(a) * 185, vy: Math.sin(a) * 185, r: 6, life: 4 });
        }
      }
      AudioEngine.sfx.shoot(); jxShake(2, 120, 1); // WOW tier: hit
    }
    if (bs.spawnT <= 0) { bs.spawnT = 6; bs.adds.forEach(t => spawnEnemy(t)); }
    if (bs.slamT <= 0) {
      bs.slamT = bs.shot === "spiral" ? 9 : 12;
      addFloat(bs.x, bs.y - 70, "RẦM!!", "#ff5470", true);
      shrinkWindow(bs.slam, Math.round(bs.slam * 0.75));
      if (G.phase !== "play") return;
      // M4: 50% đòn nện → mưa mảnh vỡ (chỉ khi multi-window bật)
      const useDebris = typeof spawnDebris === "function" && typeof SAT_MODE !== "undefined" && SAT_MODE !== "off" && !SatManager.anyRole("debris") && Math.random() < 0.5;
      if (useDebris) spawnDebris();
      else {
        addFloat(bs.x, bs.y - 70, "RẦM!!", "#ff5470", true);
        shrinkWindow(bs.slam, Math.round(bs.slam * 0.75));
        if (G.phase !== "play") return;
        AudioEngine.sfx.bigboom(); jxShake(8, 400, 8); windowJitter(26); // WOW tier: boss slam
        burst(bs.x, bs.y, 30, ["#c084fc", "#ff5470"], 380);
      }
    }
    if (dist2(bs.x, bs.y, s.x, s.y) < (bs.r + s.r) * (bs.r + s.r)) {
      hurtShip(1, bs.x, bs.y);
      if (G.phase !== "play") return;
      const d2 = Math.hypot(dx, dy) || 1;
      s.x -= dx / d2 * 60; s.y -= dy / d2 * 60;
    }
  }

  /* gems */
  for (let i = G.gems.length - 1; i >= 0; i--) {
    const gm = G.gems[i]; gm.t += dt;
    const dx = s.x - gm.x, dy = s.y - gm.y, d = Math.hypot(dx, dy) || 1;
    const magR = s.magnetT > 0 ? 1e9 : s.magnet; // magnet pickup: hút toàn bộ gem
    if (d < magR) { gm.x += dx / d * 360 * dt; gm.y += dy / d * 360 * dt; }
    else { gm.x += gm.vx * dt; gm.y += gm.vy * dt; gm.vx *= 0.94; gm.vy *= 0.94; }
    if (d < 22) {
      G.gems.splice(i, 1); AudioEngine.sfx.gem();
      G.score += Math.round(5 * s.scoreMul);
      burst(gm.x, gm.y, 6, ["#7df9ff", "#fff"], 140);
      gainXp(gm.v);
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
  if (typeof drawCracks === "function") drawCracks(); // M4: vết nứt viền arena

  // gems
  G.gems.forEach(gm => {
    ctx.font = "17px sans-serif"; ctx.textAlign = "center";
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
  const drawList = (G.dying && G.dying.length) ? G.enemies.concat(G.dying) : G.enemies;
  drawList.forEach(e => {
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
    ctx.restore(); ctx.globalAlpha = 1;
    if (e.hp > 4) {
      const maxHp = e.hp; // ước lượng đơn giản: dùng tỉ lệ trên hp ban đầu lưu sẵn
      ctx.fillStyle = "#00000088"; ctx.fillRect(e.x - 16, e.y - e.r - 12, 32, 5);
      ctx.fillStyle = "#ff5470"; ctx.fillRect(e.x - 16, e.y - e.r - 12, 32 * clamp(e.hp / (e.maxHp || e.hp), 0, 1), 5);
    }
  });

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
      const txt = sh.sim ? `🪟KHIÊN ${"💙".repeat(Math.max(0, sh.hearts ?? 5))}` : `🪟KHIÊN ${Math.ceil(sh.shieldPx ?? 60)}px`;
      ctx.fillText(txt, 14 + s.maxHp * 24 + (s.shieldT > 0 ? 64 : 0), 30);
      ctx.fillStyle = "#fff";
    }
  }
  if (s.magnetT > 0 || s.overdriveT > 0) { // timer pickup mới
    ctx.font = "16px sans-serif"; ctx.fillStyle = "#7df9ff";
    let pt = "";
    if (s.magnetT > 0) pt += `HÚT ${Math.ceil(s.magnetT)}s `;
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
  ctx.fillText("🪟 Cửa sổ", W - 14, 40); ctx.textAlign = "left";
  // boss bar
  if (bs && !bs.dead) {
    const bbw = Math.min(560, W - 120);
    ctx.fillStyle = "#000000aa"; ctx.fillRect((W - bbw) / 2, 12, bbw, 14);
    ctx.fillStyle = "#c084fc"; ctx.fillRect((W - bbw) / 2, 12, bbw * clamp(bs.hp / bs.maxHp, 0, 1), 14);
    ctx.fillStyle = "#fff"; ctx.font = "bold 12px sans-serif"; ctx.textAlign = "center";
    ctx.fillText(bs.name || "BOSS", W / 2, 24); ctx.textAlign = "left";
  }
  ctx.fillStyle = "#8f7bb5"; ctx.font = "12px sans-serif";
  ctx.fillText(touch.active ? "Joystick trái: di chuyển · phải: ngắm+bắn" : "WASD di chuyển · chuột ngắm · giữ chuột bắn · bắn vào viền để đẩy cửa sổ! (P: pause)", 14, H - 14);

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
}

/* ---------------- loop & boot ---------------- */
function loop(now) {
  const rawDt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
  // WOW: Juice timescale (hit-stop / slow-mo) điều khiển dt gameplay
  let dt = rawDt;
  if (window.Juice) { try { dt = Juice.update(rawDt); } catch (e) { dt = rawDt; } }
  // WOW: cinematic (boss intro/death) hoặc draft mở → pause gameplay
  let cineLocked = false;
  if (window.Cinema) { try { cineLocked = !!Cinema.locked; } catch (e) {} }
  if (window.Juice && Juice.draftOpen) cineLocked = true;
  if (G.phase === "play" && !cineLocked) update(dt);
  // WOW: FX clock — warning/materialize/death-anim/particles chạy kể cả khi pause
  if (window.Juice) { try { Juice.updateFx(rawDt); } catch (e) {} }
  // WOW: Cinema clock — banner/combo/boss cine/heartbeat/trail (tự đọc info.player)
  if (window.Cinema) { try { Cinema.update(rawDt, cineInfo()); } catch (e) {} }
  // WOW: dọn entity khi death-anim chạy xong
  if (G.dying && G.dying.length) { try { G.dying = G.dying.filter(e => e.jfDeath); } catch (e) {} }
  // WOW: music state + background state mỗi 500ms
  musicT += rawDt;
  if (musicT >= 0.5) { musicT = 0; wowMusicTick(); }
  render(now);
  requestAnimationFrame(loop);
}

// WOW: info cho Cinema.update/drawFront — heartbeat + trail tự chạy bên trong
function cineInfo() {
  const s = G.ship;
  return {
    W: window.innerWidth, H: window.innerHeight,
    player: s ? {
      x: s.x, y: s.y, vx: 0, vy: 0, speed: s.moveSpeed || 0, rot: s.ang || 0, r: 13,
      hp: s.hp, maxHp: s.maxHp, shieldT: s.shieldT || 0
    } : null
  };
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
if (bus) bus.postMessage({ type: "arena-open" });
resetGame();
requestAnimationFrame(loop);
})();
