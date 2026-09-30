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
    if (on) AudioEngine.startMusic(curTrack);
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
  phase: "boot", wave: 0, act: 0, score: 0, kills: 0, time: 0,
  ship: null, bullets: [], ebullets: [], enemies: [], gems: [], pickups: [], parts: [], floats: [],
  boss: null, spawnQueue: [], spawnT: 0, waveBreak: 0, waveClearShown: false,
  banner: "", bannerT: 0, bannerSub: "",
  xp: 0, level: 1, xpNeed: 6, shake: 0, combo: 0, comboT: 0, slowmo: 1,
};
let lastT = performance.now();

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
  const box = $("draft-cards"); box.innerHTML = "";
  const pool = UPS.filter(u => !u.can || u.can(G.ship));
  const picks = [];
  while (picks.length < 3 && pool.length) picks.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
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
      const p = nearestEdgePoint(e.x, e.y);
      const d = Math.hypot(p.x - e.x, p.y - e.y);
      if (d < 16) {
        e.latched = p.edge; e.x = p.x; e.y = p.y;
        addFloat(e.x, e.y - 24, "⚠ Gặm viền!", "#c084fc");
        AudioEngine.sfx.shrink();
      } else { e.x += (p.x - e.x) / d * spd * dt; e.y += (p.y - e.y) / d * spd * dt; }
    } else {
      e.chewT += dt;
      if (e.chewT >= DIFF.chew) {
        e.chewT = 0;
        const dd = { left: [14, 0], right: [14, 0], top: [0, 14], bottom: [0, 14] }[e.latched];
        shrinkWindow(dd[0], dd[1]);
        AudioEngine.sfx.shrink(); G.shake = Math.max(G.shake, 5);
        burst(e.x, e.y, 8, ["#c084fc", "#7c3aed"], 160);
      }
      const q = nearestEdgePoint(e.x, e.y); e.x = q.x; e.y = q.y;
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
  { id: 1, name: "NEON GRID", waves: [1, 10], hpMul: 1.0, spMul: 1.0, scoreMul: 1.0,
    palette: { bg0: "#0b1e3a", bg1: "#04080f", grid: "#ffffff08", edge: "rgba(255,110,196,0.28)" },
    music: "act1", sub: "Lưới neon — bắn quái tím trước, chúng gặm cửa sổ!",
    boss: { name: "GÃ GẶM KHỔNG LỒ", color: "#8b2fc9", hpMul: 1.0, shot: "ring", slam: 26, adds: ["chewer", "chewer"] } },
  { id: 2, name: "DEEP VOID", waves: [11, 20], hpMul: 1.35, spMul: 1.08, scoreMul: 1.25,
    palette: { bg0: "#160b33", bg1: "#05030d", grid: "#b26bff10", edge: "rgba(178,107,255,0.35)" },
    music: "act2", sub: "Hư không sâu — coi chừng quái bắn xa và cảm tử!",
    boss: { name: "VOID REAPER", color: "#5b21b6", hpMul: 1.6, shot: "aimed", slam: 32, adds: ["dasher"] } },
  { id: 3, name: "CORE BREACH", waves: [21, Infinity], hpMul: 1.8, spMul: 1.15, scoreMul: 1.6,
    palette: { bg0: "#331016", bg1: "#0d0505", grid: "#ff547010", edge: "rgba(255,84,112,0.40)" },
    music: "act3", sub: "Lõi vỡ — tổng lực! Giữ cửa sổ sống sót.",
    boss: { name: "CORE TYRANT", color: "#b91c1c", hpMul: 2.3, shot: "spiral", slam: 38, adds: ["chewer", "dasher"] } },
];
function actOf(w) { return w <= 10 ? 1 : w <= 20 ? 2 : 3; }
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
  if (e) G.enemies.push(e);
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
  AudioEngine.sfx.bigboom(); G.shake = Math.max(G.shake, 10); windowJitter(20);
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
  G.wave = n;
  G.waveClearShown = false;
  const act = actOf(n), cfg = ACTS[act - 1];
  const changed = act !== G.act;
  G.act = act;
  if (changed) playActMusic(); // đổi nhạc nền theo Act
  if (n % 5 === 0) { spawnBoss(); return; }
  G.spawnQueue = buildSpawnQueue(n);
  G.spawnQueue.sort(() => Math.random() - 0.5);
  G.spawnT = 0;
  if (changed) setBanner(`ACT ${act} — ${cfg.name}`, cfg.sub);
  else setBanner(`WAVE ${n}`, n === 1 ? "Bắn quái tím trước — chúng gặm cửa sổ!" : pickSub());
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
  const v = ACTS[(G.act || 1) - 1].boss; // boss variant theo Act
  const hp = (130 + G.wave * 14) * DIFF.hpMul * v.hpMul;
  G.boss = { x: b.x + b.w / 2, y: b.y + 130, r: 46, hp, maxHp: hp, t: 0,
    atkT: 2.2, spawnT: 5, slamT: 11,
    name: v.name, color: v.color, shot: v.shot, slam: v.slam, adds: v.adds };
  setBanner(`⚠ BOSS: ${v.name}`, "Nó nện cửa sổ — giữ cửa sổ sống sót!");
  AudioEngine.sfx.boss();
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
  playActMusic(); // Act 1
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
  const def = MONSTER_REGISTRY[e.type];
  const base = def ? def.score : 10;
  const actMul = ACTS[(G.act || 1) - 1].scoreMul;
  const pts = Math.round((base + G.combo * 2) * G.ship.scoreMul * actMul);
  G.score += pts;
  AudioEngine.sfx.boom(); G.shake = Math.max(G.shake, 5);
  burst(e.x, e.y, e.type === "tank" ? 26 : 14, [e.color, "#ffffff", "#ffd166"], 300);
  addFloat(e.x, e.y - 16, `+${pts}`, "#fde68a");
  if (G.combo >= 5 && G.combo % 5 === 0) addFloat(e.x, e.y - 40, `🔥 COMBO x${G.combo}!`, "#f9a8d4", true);
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
  setBanner(`WAVE ${G.wave} CLEAR — ${ACTS[(G.act || 1) - 1].name}`, "Cửa sổ được vá lại +40px");
}

function update(dt) {
  const s = G.ship, b = bounds();
  G.time += dt;
  G.comboT -= dt; if (G.comboT <= 0) G.combo = 0;
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
  }
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
  if (!G.enemies.length && !G.boss && !G.spawnQueue.length && G.phase === "play" && !G.waveClearShown && G.wave > 0) {
    G.waveClearShown = true;
    const cfg = ACTS[(G.act || 1) - 1];
    setBanner(`WAVE ${G.wave} CLEAR — ${cfg.name}`, G.wave % 5 === 0 ? "Boss hạ! Chuẩn bị wave tiếp theo…" : "Chuẩn bị wave tiếp theo…");
    AudioEngine.sfx.wave();
  }

  /* boss */
  const bs = G.boss;
  if (bs && !bs.dead) {
    bs.t += dt; bs.flash = Math.max(0, bs.flash - dt);
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
      AudioEngine.sfx.shoot(); G.shake = Math.max(G.shake, 4);
    }
    if (bs.spawnT <= 0) { bs.spawnT = 6; bs.adds.forEach(t => spawnEnemy(t)); }
    if (bs.slamT <= 0) {
      bs.slamT = bs.shot === "spiral" ? 9 : 12;
      addFloat(bs.x, bs.y - 70, "RẦM!!", "#ff5470", true);
      shrinkWindow(bs.slam, Math.round(bs.slam * 0.75));
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

  // nền sao (palette đổi theo Act)
  const pal = ACTS[(G.act || 1) - 1].palette;
  const g = ctx.createRadialGradient(W / 2, H / 2, 60, W / 2, H / 2, Math.max(W, H) * 0.75);
  g.addColorStop(0, pal.bg0); g.addColorStop(1, pal.bg1);
  ctx.fillStyle = g; ctx.fillRect(-24, -24, W + 48, H + 48);
  stars.forEach(st => {
    const a = 0.25 + 0.55 * Math.abs(Math.sin(now / 900 + st.tw));
    ctx.globalAlpha = a; ctx.fillStyle = "#fff";
    ctx.fillRect(st.x * W, st.y * H, st.s, st.s);
  });
  ctx.globalAlpha = 1;
  ctx.strokeStyle = pal.grid; ctx.lineWidth = 1;
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
  if (bs && !bs.dead) {
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
  ctx.restore();

  /* ---------- HUD ---------- */
  ctx.textAlign = "left";
  let hearts = "";
  for (let i = 0; i < s.maxHp; i++) hearts += i < s.hp ? "❤️" : "🖤";
  ctx.font = "20px sans-serif"; ctx.fillText(hearts, 14, 32);
  if (s.shieldT > 0) { ctx.font = "16px sans-serif"; ctx.fillText(`🛡${Math.ceil(s.shieldT)}s`, 14 + s.maxHp * 24, 30); }
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
