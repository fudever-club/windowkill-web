/* =====================================================================
   WINDOWKILL: Web Edition — arena engine
   Twin-stick shooter trong popup. Cửa sổ popup CHÍNH LÀ máu:
   quái tím bám viền -> window.resizeTo() gặm nhỏ; đạn bắn vào viền ->
   window.moveBy() đẩy cửa sổ bay + hất văng quái bám.
   ===================================================================== */
"use strict";
(() => {
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
const DIFF = DIFFS[qp.get("diff")] || DIFFS.normal;
const DIFF_KEY = qp.get("diff") in DIFFS ? qp.get("diff") : "normal";
const PROFILE_ID = qp.get("profile") || null;
AudioEngine.setSettings({ music: qp.get("music") === "1", sfx: qp.get("sfx") === "1" });
const SHAKE_WINDOW = qp.get("shake") === "1";

const MIN_W = 250, MIN_H = 190;      // cửa sổ nhỏ hơn -> vỡ
const START_W = 980;

/* ---------------- helpers ---------------- */
function fit() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
fit(); window.addEventListener("resize", fit);
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

/* ---------------- input: phím + chuột + touch ---------------- */
const keys = {};
const mouse = { x: innerWidth / 2, y: innerHeight / 2 - 100, down: false };
const touch = { active: false, moveId: null, aimId: null,
  moveOX: 0, moveOY: 0, moveX: 0, moveY: 0, aimX: 0, aimY: 0, aimDX: 0, aimDY: 0 };
window.addEventListener("keydown", e => {
  keys[e.code] = true;
  if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
  if ((e.code === "KeyP" || e.code === "Escape")) {
    if (G.phase === "play") pauseGame(true); else if (G.phase === "paused") pauseGame(false);
  }
  if (e.code === "KeyM") {
    const on = qp.get("music") === "off";
    qp.set("music", on ? "on" : "off");
    AudioEngine.setSettings({ music: on });
    if (on) AudioEngine.startMusic("game");
  }
  if (e.code === "KeyR" && G.phase === "over") resetGame();
});
window.addEventListener("keyup", e => keys[e.code] = false);
canvas.addEventListener("mousemove", e => { mouse.x = e.clientX; mouse.y = e.clientY; });
canvas.addEventListener("mousedown", e => {
  mouse.down = true;
  if (G.phase === "paused") pauseGame(false);
});
window.addEventListener("mouseup", () => mouse.down = false);
canvas.addEventListener("contextmenu", e => e.preventDefault());
window.addEventListener("blur", () => { if (G.phase === "play") pauseGame(true); });

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
  phase: "boot", wave: 0, score: 0, kills: 0, time: 0,
  ship: null, bullets: [], ebullets: [], enemies: [], gems: [], pickups: [], parts: [], floats: [],
  boss: null, spawnQueue: [], spawnT: 0, waveBreak: 0, banner: "", bannerT: 0, bannerSub: "",
  xp: 0, level: 1, xpNeed: 6, shake: 0, combo: 0, comboT: 0, slowmo: 1,
};
let lastT = performance.now();

function newShip() {
  return {
    x: window.innerWidth / 2, y: window.innerHeight / 2, r: 13,
    hp: DIFF.shipHp, maxHp: DIFF.shipHp,
    speed: 275, fireInt: 0.21, fireT: 0, streams: 1, dmg: 1, pierce: 0,
    magnet: 125, thorns: 0, bulletSpd: 560, slow: 0, dropMul: 1, scoreMul: DIFF.scoreMul,
    iframes: 0, ang: 0, shieldT: 0, regenT: 0,
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
  { ico: "🔥", t: "Tốc bắn +30%", d: "Xả đạn nhanh hơn.", apply: s => s.fireInt *= 0.77 },
  { ico: "🔱", t: "+1 tia đạn", d: "Bắn thêm một tia (tối đa 4).", apply: s => s.streams = Math.min(4, s.streams + 1), can: s => s.streams < 4 },
  { ico: "💥", t: "Sát thương +1", d: "Mỗi viên đạn đau hơn.", apply: s => s.dmg += 1 },
  { ico: "🚀", t: "Tốc độ +18%", d: "Tàu lanh lẹ hơn.", apply: s => s.speed *= 1.18 },
  { ico: "❤️", t: "+1 máu & hồi 1", d: "Tăng máu tối đa, hồi ngay 1 tim.", apply: s => { s.maxHp += 1; s.hp = Math.min(s.maxHp, s.hp + 1); } },
  { ico: "🏹", t: "Đạn xuyên +1", d: "Đạn bay xuyên thêm quái.", apply: s => s.pierce += 1 },
  { ico: "🧲", t: "Nam châm +60%", d: "Hút 💎 từ xa hơn.", apply: s => s.magnet *= 1.6 },
  { ico: "🛡", t: "Giáp gai", d: "Va chạm hất văng quái và gây sát thương.", apply: s => s.thorns += 1 },
  { ico: "💎", t: "Tham lam", d: "+30% điểm mọi nguồn.", apply: s => s.scoreMul *= 1.3 },
  { ico: "⚡", t: "Đạn siêu tốc", d: "+25% tốc độ & tầm bay đạn.", apply: s => s.bulletSpd *= 1.25 },
  { ico: "🍀", t: "May mắn", d: "+50% tỉ lệ rớt vật phẩm.", apply: s => s.dropMul *= 1.5 },
  { ico: "❄️", t: "Đạn băng", d: "Quái trúng đạn bị làm chậm 1.5s.", apply: s => s.slow = 1.5 },
];
function openDraft() {
  G.phase = "draft";
  const box = $("draft-cards"); box.innerHTML = "";
  const pool = UPS.filter(u => !u.can || u.can(G.ship));
  const picks = [];
  while (picks.length < 3 && pool.length) picks.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  picks.forEach(u => {
    const d = document.createElement("div"); d.className = "card";
    d.innerHTML = `<div class="ico">${u.ico}</div><div class="t">${u.t}</div><div class="d">${u.d}</div>`;
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
  const wv = G.wave, hpM = DIFF.hpMul, spM = DIFF.spMul;
  const base = { type, x, y, t: rand(0, 9), flash: 0, slowT: 0, dead: false, kbx: 0, kby: 0 };
  if (type === "chaser")  return { ...base, r: 12, hp: (2 + wv * 0.5) * hpM, speed: (95 + wv * 7) * spM, dmg: 1, xp: 1, color: "#ff5470" };
  if (type === "chewer")  return { ...base, r: 13, hp: (3 + wv * 0.4) * hpM, speed: (78 + wv * 4) * spM, dmg: 1, xp: 2, color: "#c084fc", latched: null, chewT: 0 };
  if (type === "tank")    return { ...base, r: 23, hp: (12 + wv * 2.2) * hpM, speed: 46 * spM, dmg: 1, xp: 4, color: "#ffb020" };
  if (type === "dasher")  return { ...base, r: 11, hp: (4 + wv * 0.5) * hpM, speed: (120 + wv * 5) * spM, dmg: 1, xp: 2, color: "#ffe14d",
                                   state: "stalk", stateT: 0, dx: 0, dy: 0 };
  if (type === "splitter")return { ...base, r: 18, hp: (7 + wv) * hpM, speed: (70 + wv * 4) * spM, dmg: 1, xp: 3, color: "#7df9ff" };
  if (type === "mini")    return { ...base, r: 8, hp: 1.5 * hpM, speed: 150 * spM, dmg: 1, xp: 1, color: "#ff9df3" };
  return null;
}
function spawnEnemy(type) {
  const p = edgeSpawn();
  const e = mkEnemy(type, p.x, p.y);
  if (e) { e.maxHp = e.hp; G.enemies.push(e); }
}
function startWave(n) {
  G.wave = n;
  if (n % 5 === 0) { spawnBoss(); return; }
  const count = Math.round((4 + n * 3) * (n === 1 ? 0.7 : 1));
  G.spawnQueue = [];
  for (let i = 0; i < count; i++) {
    let type = "chaser"; const r = Math.random();
    if (n >= 4 && r < 0.14) type = "splitter";
    else if (n >= 3 && r < 0.30) type = "dasher";
    else if (n >= 3 && r < 0.44) type = "tank";
    else if (n >= 2 && r < 0.66) type = "chewer";
    G.spawnQueue.push(type);
  }
  G.spawnQueue.sort(() => Math.random() - 0.5);
  G.spawnT = 0;
  setBanner(`WAVE ${n}`, n === 1 ? "Bắn quái tím trước — chúng gặm cửa sổ!" : pickSub());
}
function pickSub() {
  return ["Quái tím gặm viền cửa sổ — bắn chúng xuống!",
          "Bắn vào viền để đẩy cửa sổ bay!",
          "Nhặt 💎 lên cấp, chọn nâng cấp!",
          "Giữ khoảng cách với quái vàng — nó lao tới!"][Math.floor(Math.random() * 4)];
}
function setBanner(t, sub = "") { G.banner = t; G.bannerSub = sub; G.bannerT = 2.4; }
function spawnBoss() {
  const b = bounds();
  const hp = (130 + G.wave * 14) * DIFF.hpMul;
  G.boss = { x: b.x + b.w / 2, y: b.y + 130, r: 46, hp, maxHp: hp, t: 0, atkT: 2.2, spawnT: 5, slamT: 11 };
  setBanner("⚠ BOSS: GÃ GẶM KHỔNG LỒ", "Nó nện cửa sổ — giữ cửa sổ sống sót!");
  AudioEngine.sfx.boss();
  G.spawnQueue = ["chewer", "chewer"];
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
  if (s.iframes > 0 || s.shieldT > 0 || G.phase !== "play") return;
  s.hp -= dmg; s.iframes = 0.9;
  AudioEngine.sfx.hurt(); windowJitter(22); G.shake = Math.max(G.shake, 9);
  burst(s.x, s.y, 16, ["#ff5470", "#fff"], 260);
  addFloat(s.x, s.y - 26, `-${dmg} ❤️`, "#ff8f8f", true);
  if (s.hp <= 0) die("ship");
}
function die(reason) {
  if (G.phase === "over") return;
  G.phase = "over";
  AudioEngine.sfx.over(); AudioEngine.stopMusic();
  const reasonTxt = reason === "window" ? "Cửa sổ vỡ nát!" : "Tàu nổ tung!";
  burst(G.ship.x, G.ship.y, 46, ["#0080FF", "#ffffff", "#8fc3ff"], 380);
  windowJitter(30); G.shake = 14;
  if (bus) bus.postMessage({ type: "gameover", profileId: PROFILE_ID, score: G.score, wave: G.wave, kills: G.kills, time: Math.round(G.time), timeSec: Math.round(G.time), diff: DIFF_KEY, reason: reasonTxt });
  $("over-title").textContent = "💥 " + reasonTxt;
  $("over-score").textContent = `${G.score} điểm · Wave ${G.wave}`;
  $("over-stats").innerHTML = `💀 <b>${G.kills}</b> quái hạ · ⬆️ cấp <b>${G.level}</b> · ⏱ <b>${Math.round(G.time)}s</b> · <b>${DIFF.label}</b>`;
  let recTxt = "";
  try {
    const hk = PROFILE_ID ? `wk_high_${DIFF_KEY}_${PROFILE_ID}` : `wk_high_${DIFF_KEY}`;
    const prev = JSON.parse(localStorage.getItem(hk) || "null");
    if (!prev || G.score > prev.score) recTxt = "🏆 Kỷ lục mới!";
  } catch {}
  $("over-record").textContent = recTxt;
  $("ov-over").classList.add("show");
}
function resetGame() {
  Object.assign(G, {
    phase: "play", wave: 0, score: 0, kills: 0, time: 0,
    bullets: [], ebullets: [], enemies: [], gems: [], pickups: [], parts: [], floats: [],
    boss: null, spawnQueue: [], spawnT: 0, waveBreak: 1.4, banner: "", bannerT: 0, bannerSub: "",
    xp: 0, level: 1, xpNeed: 6, shake: 0, combo: 0, comboT: 0, slowmo: 1,
  });
  G.ship = newShip();
  ["ov-over", "ov-draft", "ov-pause"].forEach(id => $(id).classList.remove("show"));
  AudioEngine.startMusic("game");
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
  G.combo++; G.comboT = 2.5;
  const base = { chaser: 10, chewer: 25, tank: 50, dasher: 20, splitter: 35, mini: 8 }[e.type] || 10;
  const pts = Math.round((base + G.combo * 2) * G.ship.scoreMul);
  G.score += pts;
  AudioEngine.sfx.boom(); G.shake = Math.max(G.shake, 5);
  burst(e.x, e.y, e.type === "tank" ? 26 : 14, [e.color, "#ffffff", "#ffd166"], 300);
  addFloat(e.x, e.y - 16, `+${pts}`, "#fde68a");
  if (G.combo >= 5 && G.combo % 5 === 0) addFloat(e.x, e.y - 40, `🔥 COMBO x${G.combo}!`, "#f9a8d4", true);
  if (e.type === "splitter") {
    for (let i = 0; i < 2; i++) {
      const m = mkEnemy("mini", e.x + rand(-14, 14), e.y + rand(-14, 14));
      if (m) { m.maxHp = m.hp; G.enemies.push(m); }
    }
  }
  const n = e.type === "tank" ? 3 : 1;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    G.gems.push({ x: e.x, y: e.y, vx: Math.cos(a) * 130, vy: Math.sin(a) * 130, v: e.xp, t: rand(0, 9) });
  }
  // rớt vật phẩm
  const roll = Math.random() / G.ship.dropMul;
  if (roll < 0.05 && G.ship.hp < G.ship.maxHp) G.pickups.push({ kind: "heart", x: e.x, y: e.y, t: 0 });
  else if (roll < 0.085) G.pickups.push({ kind: "shield", x: e.x, y: e.y, t: 0 });
  else if (roll < 0.10) G.pickups.push({ kind: "nuke", x: e.x, y: e.y, t: 0 });
}
function nukeBlast() {
  AudioEngine.sfx.nuke();
  G.shake = 16; windowJitter(30);
  addFloat(G.ship.x, G.ship.y - 40, "💣 NUKE!", "#ffd166", true);
  G.enemies.forEach(e => { if (!e.dead) { e.hp -= 15; if (e.hp <= 0) killEnemy(e); else { e.flash = 0.15; } } });
  if (G.boss && !G.boss.dead) {
    G.boss.hp -= 40; G.boss.flash = 0.2;
    if (G.boss.hp <= 0) killBoss();
  }
  G.ebullets = [];
  const b = bounds();
  burst(b.x + b.w / 2, b.y + b.h / 2, 60, ["#ffd166", "#ff9a3d", "#fff"], 520);
}
function killBoss() {
  const bs = G.boss; if (!bs || bs.dead) return;
  bs.dead = true; G.boss = null;
  const pts = Math.round(500 * G.ship.scoreMul);
  G.score += pts; G.kills++;
  AudioEngine.sfx.bigboom(); G.shake = 16; windowJitter(30);
  burst(bs.x, bs.y, 60, ["#c084fc", "#fff", "#ffd166"], 420);
  addFloat(bs.x, bs.y - 50, `BOSS HẠ! +${pts}`, "#fde68a", true);
  for (let i = 0; i < 6; i++) {
    const a = Math.random() * Math.PI * 2;
    G.gems.push({ x: bs.x, y: bs.y, vx: Math.cos(a) * 160, vy: Math.sin(a) * 160, v: 2, t: rand(0, 9) });
  }
  G.pickups.push({ kind: "nuke", x: bs.x - 40, y: bs.y, t: 0 });
  G.pickups.push({ kind: "heart", x: bs.x + 40, y: bs.y, t: 0 });
  setBanner(`WAVE ${G.wave} CLEAR!`, "Cửa sổ được vá lại +40px");
}

function update(dt) {
  const s = G.ship, b = bounds();
  G.time += dt;
  G.comboT -= dt; if (G.comboT <= 0) G.combo = 0;
  s.iframes = Math.max(0, s.iframes - dt);
  s.shieldT = Math.max(0, s.shieldT - dt);
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
  }
  s.x = clamp(s.x, b.x + s.r, b.x + b.w - s.r);
  s.y = clamp(s.y, b.y + s.r, b.y + b.h - s.r);
  const ta = touchAim();
  s.ang = ta ? Math.atan2(ta.y, ta.x) : Math.atan2(mouse.y - s.y, mouse.x - s.x);

  /* bắn */
  s.fireT -= dt;
  const wantFire = mouse.down || keys.Space || (ta && ta.fire);
  if (wantFire && s.fireT <= 0) { s.fireT = s.fireInt; fireBullet(); }

  /* wave */
  if (G.spawnQueue.length) {
    G.spawnT -= dt;
    if (G.spawnT <= 0) {
      G.spawnT = Math.max(0.22, 0.85 * DIFF.spawnMul - G.wave * 0.05);
      spawnEnemy(G.spawnQueue.pop());
    }
  } else if (!G.enemies.length && !G.boss && G.phase === "play") {
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
        if (G.boss.hp <= 0) killBoss();
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

    if (e.type === "chewer" && !e.latched) {
      const p = nearestEdgePoint(e.x, e.y);
      const d = Math.hypot(p.x - e.x, p.y - e.y);
      if (d < 16) {
        e.latched = p.edge; e.x = p.x; e.y = p.y;
        addFloat(e.x, e.y - 24, "⚠ Gặm viền!", "#c084fc");
        AudioEngine.sfx.shrink();
      } else { e.x += (p.x - e.x) / d * spd * dt; e.y += (p.y - e.y) / d * spd * dt; }
    } else if (e.type === "chewer" && e.latched) {
      e.chewT += dt;
      if (e.chewT >= DIFF.chew) {
        e.chewT = 0;
        const d = { left: [14, 0], right: [14, 0], top: [0, 14], bottom: [0, 14] }[e.latched];
        shrinkWindow(d[0], d[1]);
        if (G.phase !== "play") return;
        AudioEngine.sfx.shrink(); G.shake = Math.max(G.shake, 5);
        burst(e.x, e.y, 8, ["#c084fc", "#7c3aed"], 160);
      }
      const q = nearestEdgePoint(e.x, e.y); e.x = q.x; e.y = q.y;
    } else if (e.type === "dasher") {
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
    } else {
      const dx = s.x - e.x, dy = s.y - e.y, d = Math.hypot(dx, dy) || 1;
      const wob = Math.sin(e.t * 6) * 12;
      e.x += (dx / d * spd + -dy / d * wob) * dt;
      e.y += (dy / d * spd + dx / d * wob) * dt;
    }
    // chạm tàu
    if (dist2(e.x, e.y, s.x, s.y) < (e.r + s.r) * (e.r + s.r)) {
      hurtShip(e.dmg, e.x, e.y);
      if (G.phase !== "play") return;
      const dx = e.x - s.x, dy = e.y - s.y, d = Math.hypot(dx, dy) || 1;
      const kb = 40 + s.thorns * 60;
      e.kbx += dx / d * kb * 8; e.kby += dy / d * kb * 8;
      if (s.thorns > 0) damageEnemy(e, s.thorns, null);
    }
  }
  G.enemies = G.enemies.filter(e => !e.dead);

  /* boss */
  const bs = G.boss;
  if (bs && !bs.dead) {
    bs.t += dt; bs.flash = Math.max(0, bs.flash - dt);
    const dx = s.x - bs.x, dy = s.y - bs.y, d = Math.hypot(dx, dy) || 1;
    bs.x += dx / d * 34 * dt; bs.y += dy / d * 34 * dt;
    bs.atkT -= dt; bs.spawnT -= dt; bs.slamT -= dt;
    if (bs.atkT <= 0) {
      bs.atkT = Math.max(1.4, 2.6 - G.wave * 0.06);
      const n = 10 + Math.floor(G.wave / 2);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + bs.t;
        G.ebullets.push({ x: bs.x, y: bs.y, vx: Math.cos(a) * 185, vy: Math.sin(a) * 185, r: 6, life: 4 });
      }
      AudioEngine.sfx.shoot(); G.shake = Math.max(G.shake, 4);
    }
    if (bs.spawnT <= 0) { bs.spawnT = 6; spawnEnemy("chewer"); spawnEnemy("chewer"); }
    if (bs.slamT <= 0) {
      bs.slamT = 12;
      addFloat(bs.x, bs.y - 70, "RẦM!!", "#ff5470", true);
      shrinkWindow(26, 20);
      if (G.phase !== "play") return;
      AudioEngine.sfx.bigboom(); G.shake = 14; windowJitter(26);
      burst(bs.x, bs.y, 30, ["#c084fc", "#ff5470"], 380);
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
    if (d < s.magnet) { gm.x += dx / d * 360 * dt; gm.y += dy / d * 360 * dt; }
    else { gm.x += gm.vx * dt; gm.y += gm.vy * dt; gm.vx *= 0.94; gm.vy *= 0.94; }
    if (d < 22) {
      G.gems.splice(i, 1); AudioEngine.sfx.gem();
      G.score += Math.round(5 * s.scoreMul);
      burst(gm.x, gm.y, 6, ["#7df9ff", "#fff"], 140);
      gainXp(gm.v);
      if (G.phase !== "play") return;
    }
  }

  /* pickups */
  for (let i = G.pickups.length - 1; i >= 0; i--) {
    const p = G.pickups[i]; p.t += dt;
    if (p.t > 12) { G.pickups.splice(i, 1); continue; }
    if (dist2(p.x, p.y, s.x, s.y) < 30 * 30) {
      G.pickups.splice(i, 1); AudioEngine.sfx.pickup();
      if (p.kind === "heart") { s.hp = Math.min(s.maxHp, s.hp + 1); addFloat(s.x, s.y - 30, "+1 ❤️", "#7dffa8", true); }
      else if (p.kind === "shield") { s.shieldT = 6; addFloat(s.x, s.y - 30, "🛡 Khiên 6s!", "#9df3ff", true); }
      else if (p.kind === "nuke") nukeBlast();
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
  burst(bl ? bl.x : e.x, bl ? bl.y : e.y, 5, ["#ffd166", "#fff"], 180);
  if (e.hp <= 0) killEnemy(e);
}

/* ---------------- render ---------------- */
const stars = [];
for (let i = 0; i < 90; i++) stars.push({ x: Math.random(), y: Math.random(), s: Math.random() * 2 + 0.5, tw: rand(0, 9) });

function render(now) {
  const W = canvas.width, H = canvas.height, b = bounds(), s = G.ship;
  ctx.save();
  if (G.shake > 0.3) ctx.translate(rand(-1, 1) * G.shake, rand(-1, 1) * G.shake);

  // nền sao
  const g = ctx.createRadialGradient(W / 2, H / 2, 60, W / 2, H / 2, Math.max(W, H) * 0.75);
  g.addColorStop(0, "#0b1e3a"); g.addColorStop(1, "#04080f");
  ctx.fillStyle = g; ctx.fillRect(-24, -24, W + 48, H + 48);
  stars.forEach(st => {
    const a = 0.25 + 0.55 * Math.abs(Math.sin(now / 900 + st.tw));
    ctx.globalAlpha = a; ctx.fillStyle = "#fff";
    ctx.fillRect(st.x * W, st.y * H, st.s, st.s);
  });
  ctx.globalAlpha = 1;
  ctx.strokeStyle = "#ffffff08"; ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 52) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y < H; y += 52) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

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

  // gems
  G.gems.forEach(gm => {
    ctx.font = "17px sans-serif"; ctx.textAlign = "center";
    ctx.fillText("💎", gm.x, gm.y + Math.sin(gm.t * 5) * 3);
  });
  // pickups
  G.pickups.forEach(p => {
    const bob = Math.sin(p.t * 4) * 4, blink = p.t > 9 ? (Math.sin(p.t * 12) > 0 ? 1 : 0.3) : 1;
    ctx.globalAlpha = blink;
    ctx.font = "24px sans-serif"; ctx.textAlign = "center";
    ctx.fillText(p.kind === "heart" ? "❤️" : p.kind === "shield" ? "🛡" : "💣", p.x, p.y + bob);
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
  G.enemies.forEach(e => {
    if (e.dead) return;
    ctx.save(); ctx.translate(e.x, e.y);
    if (e.flash > 0) ctx.globalAlpha = 0.45;
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
  if (bs && !bs.dead) {
    ctx.save(); ctx.translate(bs.x, bs.y);
    if (bs.flash > 0) ctx.globalAlpha = 0.5;
    ctx.rotate(bs.t * 0.5);
    const r = bs.r + Math.sin(bs.t * 6) * 2;
    ctx.fillStyle = "#8b2fc9";
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
  ctx.restore();

  /* ---------- HUD ---------- */
  ctx.textAlign = "left";
  let hearts = "";
  for (let i = 0; i < s.maxHp; i++) hearts += i < s.hp ? "❤️" : "🖤";
  ctx.font = "20px sans-serif"; ctx.fillText(hearts, 14, 32);
  if (s.shieldT > 0) { ctx.font = "16px sans-serif"; ctx.fillText(`🛡${Math.ceil(s.shieldT)}s`, 14 + s.maxHp * 24, 30); }
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
    ctx.fillText("GÃ GẶM KHỔNG LỒ", W / 2, 24); ctx.textAlign = "left";
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
  // vignette nguy hiểm
  const danger = (s.hp === 1) || winPct < 0.25;
  if (danger && G.phase === "play") {
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
  const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
  if (G.phase === "play") update(dt);
  render(now);
  requestAnimationFrame(loop);
}
if (bus) bus.postMessage({ type: "arena-open" });
resetGame();
requestAnimationFrame(loop);
})();
