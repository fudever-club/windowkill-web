/* =====================================================================
   WINDOWKILL: Web Edition — js/juice2.js
   JUICE MỞ RỘNG (Game Feel spec §11) — KHÔNG sửa js/juice.js, chỉ mở rộng.

   - IIFE, "use strict", vanilla JS, không dependency, CSP-safe.
   - Đọc G của game.js qua global lexical (không sửa game.js). Mọi truy cập
     G đều qua gameG() có guard → an toàn khi game chưa boot.
   - Nguyên tắc vàng: juice KHÔNG BAO GIỜ làm player chết oan:
       · hitstop chỉ freeze logic gameplay — input (keydown/keyup) vẫn chạy
         vì listener của game.js là event-driven, không nằm trong update(dt);
       · resume sau pause: gọi Juice2.noteResume() → 0.5s grace, integrator
         bỏ qua sát thương khi Juice2.graceActive() === true;
       · không 2 cinematic chồng nhau: gameOver mới HỦY gameOver cũ.

   API chính (xem INTEGRATION.md để biết điểm hook trong game.js):
     updateHitstop(rawDt) -> 0 | rawDt   // gọi đầu loop(), sau Juice.update
     update(rawDt)                        // flash decay, rings, multikill, cine
     drawOverlays(ctx, W, H)               // flash, rings, multikill, gameover
     hitstop(sec) / hitstopTier(tier)      // tick|pop|boom|cinematic (§11.2)
     flash(v) / flashRed(v)
     ring(x, y, maxR, color, life)
     onKill(x, y, kind)                   // kind: 'normal'|'tank'|'boss'
     onWaveStart() / onWaveClear() / onLevelUp(x, y)
     onBossPhase(x, y) / onBossKill(x, y)
     onNuke() / onBossSlamTelegraph()
     checkNearDeath()                     // gọi mỗi frame khi ship.hp === 1
     gameOverShip() / gameOverWindow()     // 2 kiểu game over phân biệt
     cineOverlayReady() / cineT()
     haptic(pattern)
     setQuality('full'|'reduced') / getQuality()
     noteFrame(rawDt)                      // watchdog FPS → gợi ý giảm hiệu ứng
     onLowFps(cb)                          // cb() khi FPS < 45 trong 3s
     noteResume() / graceActive()
     reset()
   ===================================================================== */
(function () {
"use strict";

/* ---------- helpers ---------- */
function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function rand(a, b) { return a + Math.random() * (b - a); }
/** G của game.js: const G ở top-level classic script → global lexical, đọc được
 *  từ script khác. Fallback window.G / globalThis.G cho môi trường test. */
function gameG() {
  try { if (typeof G !== "undefined" && G) return G; } catch (e) {}
  if (typeof window !== "undefined" && window.G) return window.G;
  if (typeof globalThis !== "undefined" && globalThis.G) return globalThis.G;
  return null;
}
function nowMs() {
  if (typeof performance !== "undefined" && performance.now) return performance.now();
  return Date.now();
}
/** i18n: dùng I18N.t('juice.<key>') nếu có, fallback tiếng Việt. */
function T(key, vi) {
  try {
    if (typeof window !== "undefined" && window.I18N && typeof window.I18N.t === "function") {
      var s = window.I18N.t("juice." + key);
      if (typeof s === "string" && s && s !== "juice." + key) return s;
    }
  } catch (e) {}
  return vi;
}

/* ---------- §11.2: 4 tier hit-stop (giây) ----------
* TUNING 2026-10-02 (user feedback: di chuyển dật dật): giảm ~1/2 so với
* giá trị gốc (pop 30→15, boom 60→35, cinematic 120→90) để mượt hơn nhưng
* vẫn giữ cảm giác "đã tay" khi giết quái. */
var HS_TIER = { tick: 0, pop: 0.015, boom: 0.035, cinematic: 0.090 };

/* ---------- §11.4: slow-mo triggers ---------- */
var SLOWMO = {
  nearDeath: { scale: 0.25, ms: 1200, cd: 20000 },
  bossKill:  { scale: 0.20, ms: 1500, cd: 0 },
  levelup:   { scale: 0.30, ms: 600,  cd: 0 },
  nuke:      { scale: 0.40, ms: 500,  cd: 0 },
  bossSlam:  { scale: 0.50, ms: 700,  cd: 0 },
  gameOver:  { scale: 0.15, ms: 1200, cd: 0 }
};
var _slowCd = {}; // kind -> timestamp hết cooldown (ms)

/* ---------- quality ---------- */
var _quality = "full"; // 'full' | 'reduced'
function qParticleMul() { return _quality === "reduced" ? 0.4 : 1; }
function qShakeMul() { return _quality === "reduced" ? 0.6 : 1; }
function qFlashOn() { return _quality === "full"; }
function qHapticOn() { return _quality === "full"; }
var PART_CAP = 400, PART_CAP_REDUCED = 160, FLOAT_CAP = 24, RING_CAP = 12;

/* ---------- multikill §11.5 ---------- */
var _mk = { n: 0, t: 0, label: "", bonus: 0, showT: 0, firstBloodDone: false };
function _mkBonus(n) {
  if (n === 2) return 25;
  if (n === 3) return 60;
  return 25 * n; // RAMPAGE xN
}
function _mkLabel(n) {
  if (n === 2) return T("doubleKill", "DOUBLE KILL!");
  if (n === 3) return T("tripleKill", "TRIPLE KILL!!");
  return T("rampage", "RAMPAGE x" + n + "!");
}

/* ---------- near-death §11.4 ---------- */
var _nd = { cdUntil: 0, active: false, t: 0 };

/* ---------- game over cinematic (không chồng nhau) ---------- */
var _cine = null; // { kind:'ship'|'window', t, shards:[], cracks:[] }

/* ---------- pause grace 0.5s ---------- */
var _graceT = 0;

/* ---------- haptic throttle ---------- */
var _lastHap = 0;

/* ---------- fps watchdog ---------- */
var _fpsAcc = 0, _fpsN = 0, _lowSec = 0, _lowCb = null, _lowFired = false;

/* ---------- boom throttle: tối đa 2 lần/giây toàn cục ---------- */
var _boomAt = [];

/* ================= HIT-STOP ================= */
/**
 * Đặt G.hitstop (giây). Loop của game gọi updateHitstop(rawDt) → 0 trong
 * hit-stop (freeze logic gameplay) nhưng vẫn render + input không bị freeze
 * (listener phím là event-driven, nằm ngoài update(dt)).
 */
function hitstop(sec) {
  var G = gameG(); if (!G || !(sec > 0)) return false;
  G.hitstop = Math.max(G.hitstop || 0, sec);
  // Đồng bộ sang Juice.hitStop (ms) để Juice.update() cũng đóng băng —
  // Juice có cooldown 250ms riêng; G.hitstop là nguồn chân lý cho loop.
  try {
    if (typeof window !== "undefined" && window.Juice && window.Juice.hitStop)
      window.Juice.hitStop(Math.min(150, sec * 1000));
  } catch (e) {}
  return true;
}
/** Hit-stop theo tier §11.2. G.parts > 300 → ép pop/boom thành tick (van perf). */
function hitstopTier(tier) {
  var G = gameG();
  var t = HS_TIER[tier] != null ? tier : "tick";
  if (G && (G.parts || []).length > 300 && (t === "pop" || t === "boom")) t = "tick";
  return hitstop(HS_TIER[t]);
}
/**
 * Gọi ĐẦU loop(), sau Juice.update(rawDt):
 *   var dt = Juice.update(rawDt);
 *   if (Juice2.updateHitstop(rawDt) === 0) dt = 0;   // freeze gameplay
 *   if (G.phase === "play" && dt > 0) update(dt);
 * Trả về 0 khi đang hit-stop, ngược lại trả về rawDt.
 */
function updateHitstop(rawDt) {
  var G = gameG();
  if (_graceT > 0) _graceT = Math.max(0, _graceT - rawDt);
  if (!G) return rawDt;
  var hs = G.hitstop || 0;
  if (hs > 0) { G.hitstop = Math.max(0, hs - rawDt); return 0; }
  return rawDt;
}
/** Gọi khi resume sau pause → 0.5s grace (integrator bỏ sát thương). */
function noteResume() { _graceT = 0.5; }
function graceActive() { return _graceT > 0; }

/* ================= FLASH ================= */
function flash(v) { var G = gameG(); if (!G || !qFlashOn()) return; G.flash = clamp(Math.max(G.flash || 0, v), 0, 1); }
function flashRed(v) { var G = gameG(); if (!G || !qFlashOn()) return; G.flashRed = clamp(Math.max(G.flashRed || 0, v), 0, 1); }

/* ================= RINGS ================= */
/** Shockwave nở: ring(x, y, maxR, color, life). Cap 12 (§11.7). */
function ring(x, y, maxR, color, life) {
  var G = gameG(); if (!G) return;
  if (!G.rings) G.rings = [];
  if (G.rings.length >= RING_CAP) G.rings.shift();
  G.rings.push({ x: x, y: y, r: 6, maxR: maxR || 80, color: color || "#ffffff",
                 t: 0, life: life || 0.45 });
}
function _updateRings(dt) {
  var G = gameG(); if (!G || !G.rings) return;
  for (var i = G.rings.length - 1; i >= 0; i--) {
    var r = G.rings[i]; r.t += dt;
    var k = clamp(r.t / r.life, 0, 1);
    r.r = 6 + (r.maxR - 6) * (1 - Math.pow(1 - k, 4)); // easeOutQuart
    if (k >= 1) G.rings.splice(i, 1);
  }
}
function _drawRings(ctx) {
  var G = gameG(); if (!G || !G.rings) return;
  for (var i = 0; i < G.rings.length; i++) {
    var r = G.rings[i], k = clamp(r.t / r.life, 0, 1);
    ctx.save();
    ctx.globalAlpha = 0.85 * (1 - k);
    ctx.strokeStyle = r.color; ctx.lineWidth = 3 * (1 - k) + 1;
    ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
}

/* ================= particle helper (budget theo quality) ================= */
function _burst(x, y, n, colors, spd) {
  var G = gameG(); if (!G) return;
  if (!G.parts) G.parts = [];
  var cap = _quality === "reduced" ? PART_CAP_REDUCED : PART_CAP;
  n = Math.max(1, Math.round(n * qParticleMul()));
  for (var i = 0; i < n; i++) {
    if (G.parts.length >= cap) return;
    var a = Math.random() * Math.PI * 2, s = (0.3 + Math.random() * 0.7) * (spd || 260);
    G.parts.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0,
      life: 0.4 + Math.random() * 0.5, c: colors[i % colors.length],
      sz: 2 + Math.random() * 3.5 });
  }
}
function _float(x, y, text, color, big) {
  var G = gameG(); if (!G) return;
  if (!G.floats) G.floats = [];
  if (big) { // big float tối đa 1 đồng thời (§11.7)
    for (var i = G.floats.length - 1; i >= 0; i--) if (G.floats[i].big) G.floats.splice(i, 1);
  }
  if (G.floats.length >= FLOAT_CAP) G.floats.shift();
  G.floats.push({ x: x, y: y, text: text, color: color || "#fff", t: 0, life: 1.25, big: !!big });
}
function _shake(amp, durMs, prio) {
  try {
    if (typeof window !== "undefined" && window.Juice && window.Juice.addShake)
      window.Juice.addShake(amp * qShakeMul(), durMs, prio || 0);
  } catch (e) {}
}
function _boomThrottleOk() {
  var t = nowMs();
  while (_boomAt.length && t - _boomAt[0] > 1000) _boomAt.shift();
  if (_boomAt.length >= 2) return false;
  _boomAt.push(t);
  return true;
}
function _sfx(name, arg) {
  try {
    if (typeof window !== "undefined" && window.Sfx2 && typeof window.Sfx2[name] === "function")
      window.Sfx2[name](arg);
  } catch (e) {}
}
/** windowJitter của game.js (global) — guard khi chưa load. */
function _jitter(px) {
  try {
    var f = null;
    if (typeof windowJitter === "function") f = windowJitter;
    else if (typeof window !== "undefined" && typeof window.windowJitter === "function") f = window.windowJitter;
    if (f) f(px);
  } catch (e) {}
}

/* ================= HAPTIC §11.6 ================= */
function haptic(pattern) {
  if (!qHapticOn()) return false;
  try {
    if (typeof navigator === "undefined" || !navigator.vibrate) return false;
    var t = nowMs();
    if (t - _lastHap < 80) return false; // throttle 80ms
    _lastHap = t;
    navigator.vibrate(pattern);
    return true;
  } catch (e) { return false; }
}

/* ================= SLOW-MO §11.4 ================= */
/**
 * slowmo(kind): kind ∈ nearDeath|bossKill|levelup|nuke|bossSlam|gameOver.
 * Ưu tiên Juice.slowMo (có sẵn, tôn trọng reduced-motion). Trả về false nếu
 * đang cooldown (chỉ nearDeath có cooldown 20s).
 */
function slowmo(kind) {
  var cfg = SLOWMO[kind]; if (!cfg) return false;
  var t = nowMs();
  if (cfg.cd > 0 && t < (_slowCd[kind] || 0)) return false;
  if (cfg.cd > 0) _slowCd[kind] = t + cfg.cd;
  var ok = false;
  try {
    if (typeof window !== "undefined" && window.Juice && window.Juice.slowMo)
      ok = window.Juice.slowMo(cfg.scale, cfg.ms);
  } catch (e) {}
  if (!ok) { // fallback: G.slowmoT để integrator tự scale dt
    var G = gameG();
    if (G) { G.slowmoScale = cfg.scale; G.slowmoT = Math.max(G.slowmoT || 0, cfg.ms / 1000); ok = true; }
  }
  if (ok && kind === "nearDeath") _sfx("slowmo");
  return ok;
}

/* ================= KILL EVENTS §11.3 + §11.5 ================= */
/**
 * Gọi trong killEnemy(e) của game.js — SAU Juice.onKill hiện có.
 * kind: 'normal' | 'tank' | 'boss'. Áp tier §11.3 + multikill §11.5.
 * Trả về { multikill: n|null, bonus }.
 */
function onKill(x, y, kind) {
  kind = kind || "normal";
  var res = { multikill: null, bonus: 0 };
  // --- multikill tracker (cửa sổ 1.0s) ---
  var t = nowMs() / 1000;
  if (t - _mk.t > 1.0) { _mk.n = 0; }
  _mk.n++; _mk.t = t;
  if (!_mk.firstBloodDone) {
    _mk.firstBloodDone = true;
    var G0 = gameG();
    if (G0) G0.score = (G0.score || 0) + 50;
    _float(x, y - 34, T("firstBlood", "🩸 FIRST BLOOD! +50"), "#ff6b6b", true);
    res.bonus += 50;
  }
  if (_mk.n >= 2) {
    var b = _mkBonus(_mk.n);
    var G = gameG();
    if (G) G.score = (G.score || 0) + b;
    _mk.label = _mkLabel(_mk.n) + " +" + b;
    _mk.showT = 1.2;
    _sfx("multikill", _mk.n);
    res.multikill = _mk.n; res.bonus += b;
  }
  // --- tier feedback §11.3 ---
  var Gp = gameG();
  var heavyParts = Gp && (Gp.parts || []).length > 300;
  if (kind === "boss") {
    hitstopTier("cinematic");
    _burst(x, y, 90, ["#0080FF", "#ffffff", "#ffd166", "#ff5470"], 420);
    ring(x, y, 240, "#0080FF", 0.7); ring(x, y, 180, "#ffffff", 0.6); ring(x, y, 120, "#ffd166", 0.5);
    flash(0.7); _shake(16, 700, 10); _jitter(30);
    slowmo("bossKill");
    haptic([50, 40, 50, 40, 80]);
  } else if (kind === "tank") {
    if (!heavyParts && _boomThrottleOk()) {
      hitstopTier("boom");
      _burst(x, y, 34, ["#ff9f1c", "#ffffff", "#ffd166"], 340);
      ring(x, y, 70, "#ff9f1c", 0.5);
      flash(0.25); _shake(8, 300, 4); _jitter(10);
      haptic([40]);
    } // else: ép thành tick — chỉ burst nhỏ, không HS/shake
    else _burst(x, y, 6, ["#ff9f1c", "#ffffff"], 260);
  } else { // normal → tier pop
    if (!heavyParts) {
      hitstopTier("pop");
      _burst(x, y, 14, ["#b388ff", "#ffffff", "#ffd166"], 300);
      ring(x, y, 46, "#b388ff", 0.4);
      _shake(5, 160, 2);
      haptic([15]);
    } else _burst(x, y, 6, ["#b388ff", "#ffffff"], 260);
  }
  return res;
}
/** Gọi khi wave mới bắt đầu (spawn wave) — reset first blood + multikill. */
function onWaveStart() {
  _mk.n = 0; _mk.t = 0; _mk.label = ""; _mk.showT = 0; _mk.firstBloodDone = false;
}
/** Wave clear §11.3: ring toàn màn hình #0080FF + viền sáng + float + HS 40ms. */
function onWaveClear(cx, cy) {
  var W = (typeof window !== "undefined") ? window.innerWidth : 800;
  var H = (typeof window !== "undefined") ? window.innerHeight : 600;
  ring(cx == null ? W / 2 : cx, cy == null ? H / 2 : cy, Math.max(W, H) * 0.7, "#0080FF", 0.8);
  hitstopTier("boom");
  _float(W / 2, H * 0.35, T("waveClear", "Vá cửa sổ +40px 🪟"), "#7DD3FC", true);
  _sfx("levelup"); // placeholder vui; integrator có thể thay sfx.repair()
  haptic([30, 30, 30]);
}
/** Lên cấp §11.3: slow-mo 0.3/0.6s + ring r150 + flash 0.35 + HS 50ms + sfx.levelup. */
function onLevelUp(x, y, level) {
  slowmo("levelup");
  ring(x, y, 150, "#ffd23f", 0.5);
  flash(0.35);
  hitstop(0.05);
  _float(x, y - 40, T("levelUp", "LÊN CẤP " + level + "!"), "#ffd23f", true);
  _sfx("levelup");
  haptic([25, 25, 40]);
}
/** Boss mất phase §11.3: burst 40 + flash 0.4 + HS 70ms + sfx.phaseBreak. */
function onBossPhase(x, y) {
  if (!_boomThrottleOk()) return;
  _burst(x, y, 40, ["#ff5470", "#ffffff", "#ffd166"], 360);
  flash(0.4);
  hitstop(0.07);
  _shake(9, 350, 8);
  _float(x, y - 50, T("bossWeak", "BOSS SUY YẾU!"), "#ff6b6b", true);
  _sfx("phaseBreak");
  haptic([60, 30, 60]);
}
/** Hạ boss: gọi onKill(x, y, 'boss') + banner do integrator vẽ. */
function onBossKill(x, y) { return onKill(x, y, "boss"); }
/** Nuke pickup: slow-mo 0.4/0.5s + flash + ring lớn. */
function onNuke(x, y) {
  slowmo("nuke");
  ring(x, y, 300, "#ffffff", 0.7);
  flash(0.6);
  hitstopTier("boom");
  _shake(12, 500, 9);
  haptic([80, 40, 80]);
}
/** Boss slam telegraph: slow-mo 0.5/0.7s + sfx.slamWarn (còi leo thang vui nhộn). */
function onBossSlamTelegraph() {
  slowmo("bossSlam");
  _sfx("slamWarn");
}

/* ================= NEAR-DEATH §11.4 ================= */
/**
 * Gọi mỗi frame (khi G.phase === 'play'). Nếu tàu còn 1 HP và có
 * đạn địch/dasher trong 90px → slow-mo 0.25/1.2s (cooldown 20s).
 * Khi hết slow-mo mà tàu vẫn sống → float "THOÁT HIỂM! +300".
 */
function checkNearDeath() {
  var G = gameG(); if (!G || !G.ship) return false;
  var s = G.ship;
  if (_nd.active) return true;
  if (s.hp !== 1) return false;
  var t = nowMs();
  if (t < _nd.cdUntil) return false;
  var danger = false, i, e;
  var eb = G.ebullets || [];
  for (i = 0; i < eb.length && !danger; i++) {
    var dx = eb[i].x - s.x, dy = eb[i].y - s.y;
    if (dx * dx + dy * dy < 90 * 90) danger = true;
  }
  var en = G.enemies || [];
  for (i = 0; i < en.length && !danger; i++) {
    e = en[i];
    if (e.dead) continue;
    var ddx = e.x - s.x, ddy = e.y - s.y;
    if (ddx * ddx + ddy * ddy < 90 * 90) danger = true;
  }
  if (!danger) return false;
  if (!slowmo("nearDeath")) return false;
  _nd.active = true; _nd.t = 1.2;
  return true;
}
function _updateNearDeath(dt) {
  if (!_nd.active) return;
  _nd.t -= dt;
  if (_nd.t > 0) return;
  _nd.active = false;
  var G = gameG();
  if (G && G.ship && G.ship.hp > 0 && (G.phase === "play" || G.phase === "draft")) {
    G.score = (G.score || 0) + 300;
    _float(G.ship.x, G.ship.y - 44, T("closeCall", "THOÁT HIỂM! +300"), "#4ade80", true);
    _sfx("levelup");
  }
}

/* ================= GAME OVER — 2 KIỂU PHÂN BIỆT §11.3 ================= */
function _startCine(kind, cx, cy) {
  // Không 2 cinematic chồng nhau: mới hủy cũ.
  _cine = { kind: kind, t: 0, dur: 2.4, shards: [], cracks: [] };
  var i, a, sp;
  if (kind === "ship") {
    for (i = 0; i < 8; i++) { // 8 mảnh tàu văng
      a = rand(0, Math.PI * 2); sp = rand(120, 380);
      _cine.shards.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        rot: rand(0, 6.28), vr: rand(-9, 9), sz: rand(6, 16), c: ["#0080FF", "#ffffff", "#8fc3ff"][i % 3] });
    }
  } else { // window: 12 đường nứt từ tâm + mảnh kính rơi
    for (i = 0; i < 12; i++) {
      a = (i / 12) * Math.PI * 2 + rand(-0.12, 0.12);
      _cine.cracks.push({ a: a, segs: _makeCrackSegs(a), len: rand(0.55, 1) });
    }
    for (i = 0; i < 26; i++) {
      _cine.shards.push({ x: cx + rand(-160, 160), y: cy + rand(-120, 120),
        vx: rand(-40, 40), vy: rand(60, 220), rot: rand(0, 6.28), vr: rand(-6, 6),
        sz: rand(4, 12), c: "rgba(180,220,255,0.85)", glass: true });
    }
  }
}
function _makeCrackSegs(a) {
  var segs = [], steps = 5 + Math.floor(Math.random() * 3), d = 0;
  for (var i = 0; i < steps; i++) {
    var nd = d + rand(40, 90), na = a + rand(-0.35, 0.35);
    segs.push({ d0: d, a0: a, d1: nd, a1: na });
    d = nd; a = na;
  }
  return segs;
}
/** Tàu nổ: slow-mo 0.15/1.2s + burst 70 + 2 ring + flash 0.8 → fade đen. */
function gameOverShip() {
  var G = gameG();
  var cx = G && G.ship ? G.ship.x : 400, cy = G && G.ship ? G.ship.y : 300;
  _startCine("ship", cx, cy);
  slowmo("gameOver");
  hitstopTier("cinematic");
  _burst(cx, cy, 70, ["#0080FF", "#ffffff", "#ffd166", "#ff8f8f"], 420);
  ring(cx, cy, 200, "#ffffff", 0.7); ring(cx, cy, 130, "#0080FF", 0.6);
  flash(0.8);
  _shake(16, 700, 10); _jitter(30);
  haptic([100, 50, 100, 50, 150]);
}
/** Cửa sổ vỡ: nứt lan 0.8s + mảnh kính rơi + flashRed 0.6 + slow-mo + sfx.windowShatter. */
function gameOverWindow() {
  var G = gameG();
  var W = (typeof window !== "undefined") ? window.innerWidth : 800;
  var H = (typeof window !== "undefined") ? window.innerHeight : 600;
  _startCine("window", W / 2, H / 2);
  slowmo("gameOver");
  hitstopTier("cinematic");
  flashRed(0.6);
  _sfx("windowShatter");
  _shake(14, 600, 10); _jitter(24);
  haptic([100, 50, 100, 50, 150]);
}
/** Overlay game-over của game.js nên hiện sau 1.2s (integrator check). */
function cineOverlayReady() { return !!_cine && _cine.t >= 1.2; }
function cineT() { return _cine ? _cine.t : 0; }
function cineKind() { return _cine ? _cine.kind : null; }
function _updateCine(dt) {
  if (!_cine) return;
  _cine.t += dt;
  var i, s;
  for (i = 0; i < _cine.shards.length; i++) {
    s = _cine.shards[i];
    s.x += s.vx * dt; s.y += s.vy * dt; s.rot += s.vr * dt;
    if (s.glass) s.vy += 500 * dt; // mảnh kính rơi nhanh dần
    else { s.vx *= (1 - 1.6 * dt); s.vy *= (1 - 1.6 * dt); }
  }
  if (_cine.t >= _cine.dur) _cine.done = true;
}

/* ================= QUALITY / FPS WATCHDOG §11.6 ================= */
function setQuality(q) {
  _quality = (q === "reduced") ? "reduced" : "full";
  try {
    if (typeof window !== "undefined" && window.Juice && window.Juice.setPerfQuality)
      window.Juice.setPerfQuality(_quality);
  } catch (e) {}
  return _quality;
}
function getQuality() { return _quality; }
/** Gọi mỗi frame với rawDt. FPS < 45 trong 3s → gọi cb 1 lần (gợi ý giảm). */
function noteFrame(rawDt) {
  _fpsAcc += rawDt; _fpsN++;
  if (_fpsAcc >= 1) {
    var fps = _fpsN / Math.max(_fpsAcc, 1e-6);
    _fpsAcc = 0; _fpsN = 0;
    if (_quality === "full" && fps < 45) {
      _lowSec++;
      if (_lowSec >= 3 && !_lowFired) {
        _lowFired = true;
        if (typeof _lowCb === "function") { try { _lowCb(fps); } catch (e) {} }
      }
    } else _lowSec = 0;
  }
}
function onLowFps(cb) { _lowCb = (typeof cb === "function") ? cb : null; _lowFired = false; _lowSec = 0; }

/* ================= UPDATE / DRAW ================= */
/**
 * Gọi mỗi frame với rawDt (kể cả khi hit-stop — FX vẫn chạy).
 * Decay flash 6/s, rings, multikill banner, near-death, gameover cine.
 */
function update(rawDt) {
  var dt = Math.min(0.05, rawDt || 0.016);
  var G = gameG();
  if (G) {
    if (G.flash > 0) G.flash = Math.max(0, (G.flash || 0) - 6 * dt);
    if (G.flashRed > 0) G.flashRed = Math.max(0, (G.flashRed || 0) - 6 * dt);
  }
  _updateRings(dt);
  if (_mk.showT > 0) _mk.showT = Math.max(0, _mk.showT - dt);
  _updateNearDeath(dt);
  _updateCine(dt);
}
/** Vẽ overlay: flash trắng/đỏ, rings, multikill banner, gameover cine.
 *  Gọi CUỐI render(), sau mọi draw khác (kể cả Juice.draw*). */
function drawOverlays(ctx, W, H) {
  var G = gameG();
  if (G && qFlashOn()) {
    if (G.flash > 0) {
      ctx.save(); ctx.globalAlpha = clamp(G.flash, 0, 1);
      ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, W, H); ctx.restore();
    }
    if (G.flashRed > 0) {
      ctx.save(); ctx.globalAlpha = clamp(G.flashRed, 0, 1);
      ctx.fillStyle = "#ff2d2d"; ctx.fillRect(0, 0, W, H); ctx.restore();
    }
  }
  _drawRings(ctx);
  // multikill banner giữa-trên
  if (_mk.showT > 0 && _mk.label) {
    var a = clamp(_mk.showT / 0.4, 0, 1);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.font = "bold 30px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffd23f";
    ctx.strokeStyle = "rgba(0,0,0,0.6)"; ctx.lineWidth = 5;
    var y = H * 0.22;
    ctx.strokeText(_mk.label, W / 2, y);
    ctx.fillText(_mk.label, W / 2, y);
    ctx.restore();
  }
  _drawCine(ctx, W, H);
}
function _drawCine(ctx, W, H) {
  if (!_cine) return;
  var i, s, k;
  if (_cine.kind === "ship") {
    // fade đen dần tới 0.85 trong 1.2s
    k = clamp(_cine.t / 1.2, 0, 1);
    ctx.save(); ctx.globalAlpha = 0.85 * k; ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H); ctx.restore();
    // 8 mảnh tàu
    for (i = 0; i < _cine.shards.length; i++) {
      s = _cine.shards[i];
      ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.rot);
      ctx.globalAlpha = clamp(1 - _cine.t / 2.2, 0, 1);
      ctx.fillStyle = s.c;
      ctx.fillRect(-s.sz / 2, -s.sz / 4, s.sz, s.sz / 2);
      ctx.restore();
    }
  } else {
    // 12 đường nứt lan từ tâm ra viền trong 0.8s
    var cx = W / 2, cy = H / 2, maxD = Math.max(W, H) * 0.75;
    k = clamp(_cine.t / 0.8, 0, 1);
    ctx.save();
    ctx.strokeStyle = "rgba(200,230,255,0.9)"; ctx.lineWidth = 2;
    for (i = 0; i < _cine.cracks.length; i++) {
      var cr = _cine.cracks[i];
      ctx.beginPath();
      var started = false;
      for (var j = 0; j < cr.segs.length; j++) {
        var sg = cr.segs[j], d1 = Math.min(sg.d1, maxD * cr.len * k);
        if (d1 <= sg.d0) break;
        var x0 = cx + Math.cos(sg.a0) * sg.d0, y0 = cy + Math.sin(sg.a0) * sg.d0;
        var x1 = cx + Math.cos(sg.a1) * d1, y1 = cy + Math.sin(sg.a1) * d1;
        if (!started) { ctx.moveTo(x0, y0); started = true; }
        ctx.lineTo(x1, y1);
        if (d1 < sg.d1) break;
      }
      ctx.stroke();
    }
    ctx.restore();
    // mảnh kính rơi
    for (i = 0; i < _cine.shards.length; i++) {
      s = _cine.shards[i];
      ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.rot);
      ctx.globalAlpha = clamp(1 - _cine.t / 2.0, 0, 1) * 0.85;
      ctx.fillStyle = s.c;
      ctx.beginPath();
      ctx.moveTo(0, -s.sz / 2); ctx.lineTo(s.sz / 2, s.sz / 2); ctx.lineTo(-s.sz / 2, s.sz / 2);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }
}

/* ================= RESET ================= */
function reset() {
  _mk.n = 0; _mk.t = 0; _mk.label = ""; _mk.showT = 0; _mk.firstBloodDone = false;
  _nd.cdUntil = 0; _nd.active = false; _nd.t = 0;
  _cine = null; _graceT = 0; _boomAt = [];
  _lowSec = 0; _lowFired = false; _fpsAcc = 0; _fpsN = 0;
  var G = gameG();
  if (G) { G.hitstop = 0; G.flash = 0; G.flashRed = 0; if (G.rings) G.rings.length = 0; }
}

/* ================= public API ================= */
var Juice2 = {
  /* hit-stop */
  hitstop: hitstop, hitstopTier: hitstopTier, updateHitstop: updateHitstop,
  noteResume: noteResume, graceActive: graceActive,
  /* flash */
  flash: flash, flashRed: flashRed,
  /* rings */
  ring: ring,
  /* events */
  onKill: onKill, onWaveStart: onWaveStart, onWaveClear: onWaveClear,
  onLevelUp: onLevelUp, onBossPhase: onBossPhase, onBossKill: onBossKill,
  onNuke: onNuke, onBossSlamTelegraph: onBossSlamTelegraph,
  checkNearDeath: checkNearDeath,
  /* game over 2 kiểu */
  gameOverShip: gameOverShip, gameOverWindow: gameOverWindow,
  cineOverlayReady: cineOverlayReady, cineT: cineT, cineKind: cineKind,
  /* slow-mo */
  slowmo: slowmo, SLOWMO_TIERS: SLOWMO,
  /* haptic + quality */
  haptic: haptic, setQuality: setQuality, getQuality: getQuality,
  noteFrame: noteFrame, onLowFps: onLowFps,
  /* frame */
  update: update, drawOverlays: drawOverlays,
  reset: reset,
  version: "1.0-juice2"
};

if (typeof window !== "undefined") window.Juice2 = Juice2;
if (typeof module !== "undefined" && module.exports) module.exports = Juice2;
})();
