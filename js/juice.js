/* =====================================================================
   WINDOWKILL: Web Edition — js/juice.js
   ANIMATION / JUICE FOUNDATION (Wave 1, WOW-DIRECTION §5)

   Hệ juice độc lập cho game: easing chuẩn, timescale (hit-stop/slow-mo),
   screen-shake 7 tầng, particle/damage-number/ring/ghost/float-text pools,
   hit flash, spawn warning, death animation từng loại quái, damage numbers.

   Spec: studio/ANIMATION-JUICE-DIRECTION.md (+ WOW-DIRECTION.md §1, §4, §5)

   TÍCH HỢP với js/game.js (worker tích hợp sau sẽ chuyển đổi dần):
   - Mỗi frame: const dt = Juice.update(rawDt)      // gameplay dùng dt đã scale
                    Juice.updateFx(rawDt)           // FX luôn chạy real-time
     UI (draft panel, banner) DÙNG rawDt, KHÔNG dùng dt đã scale — vì
     Juice.update() đóng băng dt về 0 trong hit-stop / draft pause.
   - Vẽ: Juice.applyShake(ctx) TRƯỚC mọi draw khác (đúng 1 translate/frame),
     rồi gọi các Juice.draw*() theo thứ tự: drawParticles → drawRings →
     drawGhosts → drawFloats → drawDamageNumbers → drawWarnings.
   - game.js hiện có G.shake (number) và addFloat() — Juice là hệ mới thay thế;
     API dưới đây là hợp đồng tích hợp, worker gọi trực tiếp.

   Ràng buộc kỹ thuật: vanilla JS, IIFE, "use strict", không dependency,
   tương thích CSP (không eval / new Function / inline handler).
   ===================================================================== */
(function () {
"use strict";

/* FIX mobile #7: máy yếu (mobile + <=4 nhân CPU) -> giảm particle x0.5 trong burst() */
var IS_LOW = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent || "") && ((navigator.hardwareConcurrency || 8) <= 4);

/* ================= helpers (module-private) ================= */
function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function rand(a, b) { return a + Math.random() * (b - a); }
/** Chọn màu theo trọng số — items/weights là mảng module-level, không alloc. */
function pickW(items, weights) {
  var r = Math.random(), acc = 0;
  for (var i = 0; i < weights.length; i++) { acc += weights[i]; if (r <= acc) return items[i]; }
  return items[items.length - 1];
}

/* ================= 1. EASING LIBRARY (§0.2 spec) ================= */
/**
 * Bộ easing chuẩn dùng thống nhất toàn game.
 * - linear: decay bar, countdown
 * - easeOutQuad: shake decay, hover nhỏ, fade nhanh
 * - easeOutCubic: di chuyển UI, particle bay, banner
 * - easeOutQuart: ring mở rộng nhanh
 * - easeOutExpo: shockwave, flash decay
 * - easeOutBack(t, s): pop/scale-in, card, banner (s mặc định 1.70158;
 *   spawn quái dùng 1.25 theo spec)
 * - easeInQuad: slide-out, thu nhỏ biến mất
 * - easeInOutQuad: toggle, chuyển trạng thái
 * - easeInOutSine: pulse lặp (shield, heartbeat nền)
 * Mọi hàm nhận t ∈ [0,1], trả về ∈ ~[0,1] (easeOutBack có overshoot).
 */
var Ease = {
  linear: function (t) { return t; },
  easeOutQuad: function (t) { return 1 - (1 - t) * (1 - t); },
  easeOutCubic: function (t) { return 1 - Math.pow(1 - t, 3); },
  easeOutQuart: function (t) { return 1 - Math.pow(1 - t, 4); },
  easeOutExpo: function (t) { return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t); },
  easeOutBack: function (t, s) {
    s = (s === undefined ? 1.70158 : s);
    var u = t - 1;
    return 1 + (s + 1) * u * u * u + s * u * u;
  },
  easeInQuad: function (t) { return t * t; },
  easeInOutQuad: function (t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; },
  easeInOutSine: function (t) { return -(Math.cos(Math.PI * t) - 1) / 2; }
};

/* ================= 11. REDUCED MOTION (Phụ lục B) ================= */
/**
 * Đọc 1 lần lúc boot từ matchMedia('(prefers-reduced-motion: reduce)').
 * Mọi hệ juice tự rút gọn khi cờ này bật:
 * - shake: clamp ≤ 3px; bỏ windowJitter thật
 * - particle: số lượng ×0.3, không shard xoay, không shockwave kép
 * - bỏ: confetti, blink (warning thành vòng tĩnh), arc xoay, slow-mo,
 *   spring overshoot, scale pop của crit
 * - giữ nguyên: hit-stop ngắn (thông tin nhịp combat), spawn warning,
 *   damage numbers, blink invulnerable, banner dạng fade
 */
var reducedMotion = (typeof window.matchMedia === "function") &&
  !!window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ================= 2. TIMESCALE (§0.4 spec) ================= */
var _timeScale = 1;        // 1 bình thường | 0 hit-stop | 0.2–0.4 slow-mo
var _hitStopMs = 0;        // ms hit-stop còn lại
var _slowMoMs = 0;         // ms slow-mo còn lại
var _slowMoScale = 1;
var _lastHitStopAt = -1e9; // performance.now() của hit-stop gần nhất
var _draftOpen = false;    // worker set true khi panel draft mở (game pause)

/**
 * Nạp dt thô (giây, real-time) và trả về dt đã scale theo timescale hiện tại.
 * Gọi 1 lần/frame ở đầu update(); gameplay (di chuyển, bắn, AI) dùng giá trị
 * trả về. UI (draft panel, banner wave, countdown) DÙNG rawDt, không qua đây —
 * vì trong hit-stop / draft pause, update() trả về 0.
 * @param {number} rawDt delta giây chưa scale (vd: Math.min(0.05, (now-last)/1000))
 * @returns {number} dt đã nhân timescale (0 trong hit-stop)
 */
function update(rawDt) {
  var ms = rawDt * 1000;
  var ts = 1;
  if (_draftOpen) { _timeScale = 0; return 0; } // draft mở → đóng băng gameplay
  if (_hitStopMs > 0) { _hitStopMs = Math.max(0, _hitStopMs - ms); ts = 0; }
  else if (_slowMoMs > 0) { _slowMoMs = Math.max(0, _slowMoMs - ms); ts = _slowMoScale; }
  _timeScale = ts;
  return rawDt * ts;
}

/**
 * Đóng băng game (timeScale = 0) trong ms mili-giây — "đòn có trọng lượng".
 * Bị BỎ QUA khi: slow-mo đang chạy (không stack, trừ boss death), draft đang
 * mở, hoặc chưa đủ cooldown 250ms kể từ hit-stop trước (boss death miễn).
 * @param {number} ms thời gian đóng băng (40 / 60 / 70 / 90 theo bảng §2.2)
 * @param {object} [opts] { exempt: true } — miễn cooldown (boss death cinematic)
 * @returns {boolean} true nếu hit-stop được kích hoạt
 */
function hitStop(ms, opts) {
  var exempt = !!(opts && opts.exempt);
  var now = performance.now();
  if (_slowMoMs > 0 && !exempt) return false;
  if (_draftOpen) return false;
  if (!exempt && now - _lastHitStopAt < 250) return false;
  _lastHitStopAt = now;
  _hitStopMs = Math.max(_hitStopMs, ms);
  return true;
}

/**
 * Slow-motion: timescale = scale (0.2–0.4) trong ms mili-giây.
 * Reduced-motion: bỏ slow-mo (giữ nguyên theo Phụ lục B).
 * @param {number} scale 0.2–0.4
 * @param {number} ms thời gian (vd: wave clear 0.3x/350ms, combo x100 0.4x/400ms)
 * @returns {boolean} true nếu slow-mo được kích hoạt
 */
function slowMo(scale, ms) {
  if (reducedMotion) return false;
  _slowMoScale = clamp(scale, 0.2, 0.4);
  _slowMoMs = Math.max(_slowMoMs, ms);
  return true;
}

/** @returns {boolean} true khi đang trong hit-stop (timeScale == 0). */
function isHitStop() { return _hitStopMs > 0; }
/** @returns {boolean} true khi slow-mo đang chạy. */
function isSlowMo() { return _slowMoMs > 0; }

/* ================= 3. SHAKE MANAGER (§0.5, §1 spec) ================= */
var _shakes = []; // { amp, age, dur (giây), prio, ax, ay } — hướng ngẫu nhiên/event
var SHAKE_WINDOW = false;
try { SHAKE_WINDOW = new URLSearchParams(window.location.search).get("shake") === "1"; }
catch (e) { /* URLSearchParams không khả dụng: giữ false */ }

/**
 * Thêm 1 event rung camera. Amplitude cộng dồn, clamp tổng 14px,
 * decay theo easeOutQuad. Event có priority cao hơn thay thế các event
 * priority thấp hơn đang chạy (ưu tiên khi xung đột).
 * Bảng tier (§1): hit 2px/120ms/p1 · chết thường 3px/160ms/p2 · nổ lớn
 * 6px/300ms/p4 · player hurt 8px/350ms/p8 · boss chết 12px/700ms/p10 ·
 * chewer cắn 2px/150ms/p3. Reduced-motion: mọi tier ≤ 3px.
 * @param {number} amp biên độ px
 * @param {number} durMs thời gian mili-giây
 * @param {number} [priority] độ ưu tiên (mặc định 0)
 */
function addShake(amp, durMs, priority) {
  if (reducedMotion) amp = Math.min(amp, 3);
  if (!(amp > 0)) return;
  priority = priority || 0;
  var maxP = -1, i;
  for (i = 0; i < _shakes.length; i++) if (_shakes[i].prio > maxP) maxP = _shakes[i].prio;
  if (_shakes.length && priority >= maxP) {
    for (i = _shakes.length - 1; i >= 0; i--) {
      if (_shakes[i].prio < priority) _shakes.splice(i, 1);
    }
  }
  var a = rand(0, Math.PI * 2);
  _shakes.push({ amp: Math.min(amp, 14), age: 0, dur: Math.max(1, durMs) / 1000,
    prio: priority, ax: Math.cos(a), ay: Math.sin(a) });
}

function _updateShakes(dt) {
  for (var i = _shakes.length - 1; i >= 0; i--) {
    _shakes[i].age += dt;
    if (_shakes[i].age >= _shakes[i].dur) _shakes.splice(i, 1);
  }
}

/**
 * Áp rung camera lên canvas — gọi 1 lần/frame TRƯỚC mọi draw khác, trong
 * cùng 1 ctx.save()/restore() với render. ĐÚNG 1 phép translate/frame
 * (kể cả khi không có shake nào: translate(0,0)).
 * @param {CanvasRenderingContext2D} ctx
 */
function applyShake(ctx) {
  var ox = 0, oy = 0;
  for (var i = 0; i < _shakes.length; i++) {
    var s = _shakes[i];
    var p = clamp(s.age / s.dur, 0, 1);
    var m = s.amp * (1 - Ease.easeOutQuad(p)); // decay easeOutQuad
    var wob = rand(0.4, 1);
    ox += s.ax * m * wob + rand(-0.5, 0.5) * m * 0.5;
    oy += s.ay * m * wob + rand(-0.5, 0.5) * m * 0.5;
  }
  var tot = Math.sqrt(ox * ox + oy * oy);
  if (tot > 14) { ox *= 14 / tot; oy *= 14 / tot; } // clamp tổng 14px
  ctx.translate(ox, oy);
}

var _jitterCdUntil = 0;
/**
 * Rung cửa sổ popup THẬT bằng window.moveBy (tách riêng khỏi shake camera).
 * Tối đa 3 lần moveBy/event, cách nhau 50ms, cooldown 400ms/event.
 * Chỉ chạy khi query param shake=1 (SHAKE_WINDOW như game.js) và KHÔNG chạy
 * khi reduced-motion (Phụ lục B).
 * @param {number} px biên độ ±px mỗi lần moveBy (vd: chewer cắn viền: 2)
 * @returns {boolean} true nếu jitter được lên lịch
 */
function windowJitter(px) {
  if (!SHAKE_WINDOW || reducedMotion) return false;
  var now = performance.now();
  if (now < _jitterCdUntil) return false;
  _jitterCdUntil = now + 400;
  for (var i = 0; i < 3; i++) {
    (function (dx, dy, delay) {
      setTimeout(function () { try { window.moveBy(dx, dy); } catch (e) {} }, delay);
    })((Math.random() - 0.5) * px, (Math.random() - 0.5) * px, i * 50);
  }
  return true;
}

/* ================= 4. POOLS (§0.3, §1.3 spec) =================
 * Tái sử dụng, KHÔNG alloc trong frame nóng: ring-buffer ghi đè slot cũ nhất.
 * Quota: particles 400 · damage numbers 24 · rings 8 · ghost trail 12 ·
 * float text 16. */
function makePool(n, factory) {
  var items = new Array(n), i;
  for (i = 0; i < n; i++) items[i] = factory();
  return { items: items, n: n, cursor: 0,
    next: function () { var it = items[this.cursor]; this.cursor = (this.cursor + 1) % this.n; return it; } };
}

/* ---- particles ---- */
var SHAPE_DOT = 0, SHAPE_SHARD = 1, SHAPE_STREAK = 2, SHAPE_SMOKE = 3, SHAPE_WISP = 4;
var P_PART = makePool(400, function () {
  return { active: false, x: 0, y: 0, vx: 0, vy: 0, grav: 0, drag: 1,
    age: 0, life: 1, size: 3, shape: SHAPE_DOT, color: "#ffffff",
    rot: 0, vr: 0, fade: 1, len: 0 };
});
var _aliveParts = 0, _shardAlive = 0;

function allocParticle() {
  var p = P_PART.next();
  if (p.active) { if (p.shape === SHAPE_SHARD) _shardAlive--; _aliveParts--; }
  p.active = true; _aliveParts++;
  return p;
}

/* ---- rings (shockwave / spawn / milestone) ---- */
var P_RING = makePool(8, function () {
  return { active: false, x: 0, y: 0, r0: 0, r1: 60, age: 0, life: 0.3,
    color: "#ffffff", a0: 0.5, ease: 2 };
});

/* ---- ghost trail (afterimage player) ---- */
var P_GHOST = makePool(12, function () {
  return { active: false, x: 0, y: 0, rot: 0, age: 0, life: 0.22, scale: 0.9,
    color: "#0080ff", alpha: 0.35 };
});

/* ---- float text (thông báo nhỏ, pool riêng với damage numbers) ---- */
var P_FLOAT = makePool(16, function () {
  return { active: false, x: 0, y: 0, text: "", color: "#ffffff",
    age: 0, life: 1.25, size: 15 };
});

/* ---- damage numbers (pool 24, §4 spec) ---- */
var P_DMG = makePool(24, function () {
  return { active: false, x: 0, y: 0, amount: 0, text: "", color: "#ffffff",
    age: 0, life: 0.65, size: 13, kind: "normal", target: null,
    popAge: 9, popDur: 0.15 };
});

var DMG_COLORS = { normal: "#ffffff", crit: "#ffd23f", playerHurt: "#ff5d5d", heal: "#5dff8f" };

/* ================= 7. PARTICLE BURST PRESETS (§3 spec) =================
 * Mọi burst đều radial từ tâm quái. "Shard" = mảnh tam giác xoay
 * (giới hạn ≤ 30% tổng hạt sống vì tốn draw hơn). Mọi loại đều kèm
 * soul wisp: 1 hạt sáng trắng bay thẳng lên 60px/500ms (easeOutCubic).
 *
 * Bảng preset: chaser 10 · chewer 12 (gravity 150, 4 shard) ·
 * tank 24 (+shockwave ring) · dasher 14 (streak lines) · splitter 16 ·
 * mini 6 · elite ×1.5 + ring vàng · boss 90 (3 đợt 0/150/300ms) + 24 shard
 * + 2 shockwave.
 */
var BURST = {
  chaser:   { n: 10, colors: ["#c084fc", "#ffffff"], cw: [0.7, 0.3],
              v: [60, 180], g: 0, life: 400, size: [2, 4], drag: 0.92,
              shard: 0, streak: 0, fade: 1 },
  chewer:   { n: 12, colors: ["#c084fc", "#7c3aed"], cw: [0.6, 0.4],
              v: [40, 140], g: 150, life: 500, size: [2, 4], drag: 0.98,
              shard: 4, streak: 0, fade: 1 },
  tank:     { n: 24, colors: ["#ffb020", "#ff6b35", "#5a5a5a"], cw: [0.5, 0.3, 0.2],
              v: [80, 260], g: 60, life: 600, size: [2, 5], drag: 0.96,
              shard: 0, streak: 0, fade: 2,
              smoke: { color: "#5a5a5a", life: 800 },
              ring: { r1: 70, dur: 250, ease: 1, a: 0.5 } },
  dasher:   { n: 14, colors: ["#ffe14d", "#ffffff"], cw: [0.7, 0.3],
              v: [120, 300], g: 0, life: 350, size: [2, 3], drag: 0.97,
              shard: 0, streak: 1, fade: 1 },
  splitter: { n: 16, colors: ["#a78bfa", "#ffffff"], cw: [0.85, 0.15],
              v: [60, 200], g: 40, life: 450, size: [2, 4], drag: 0.96,
              shard: 0, streak: 0, fade: 1 },
  mini:     { n: 6, colors: ["#d8b4fe", "#ffffff"], cw: [0.75, 0.25],
              v: [50, 150], g: 0, life: 300, size: [2, 3], drag: 0.96,
              shard: 0, streak: 0, fade: 1 },
  boss:     { n: 90, colors: ["#ffffff", "#0080ff", "#c084fc"], cw: [0.35, 0.35, 0.3],
              v: [100, 400], g: 40, life: 900, size: [2, 5], drag: 0.95,
              shard: 24, streak: 0, fade: 2, waves: [0, 150, 300], rings: 2 }
};

var _pending = []; // burst đặt lịch (boss 3 đợt): { at, fn } — xử lý trong updateFx

function _scheduleBurst(delayMs, fn) {
  _pending.push({ at: performance.now() + delayMs, fn: fn });
}

/**
 * Spawn particle burst theo preset §3.
 * Adaptive (§0.3): particle đang sống > 300 → burst mới spawn 50% số lượng.
 * Reduced-motion: số lượng ×0.3 (làm tròn lên), không shard xoay,
 * không shockwave kép.
 * @param {string} presetName chaser|chewer|tank|dasher|splitter|mini|boss
 * @param {number} x tâm burst
 * @param {number} y tâm burst
 * @param {object} [opts] { elite: true } — biến thể vàng: ×1.5 số hạt,
 *   vận tốc ×1.2, life +100ms, pha màu #ffd23f + ring vàng nhỏ
 */
function burst(presetName, x, y, opts) {
  var pr = BURST[presetName];
  if (!pr) return;
  opts = opts || {};
  var n = pr.n;
  if (opts.elite) n = Math.ceil(n * 1.5);
  if (_aliveParts > 300) n = Math.ceil(n * 0.5);
  if (IS_LOW) n = Math.ceil(n * 0.5); // FIX mobile #7: máy yếu giảm particle
  if (reducedMotion) n = Math.max(1, Math.ceil(n * 0.3));
  var velMul = opts.elite ? 1.2 : 1;
  var lifeBonus = opts.elite ? 100 : 0;
  var state = { shardsLeft: reducedMotion ? 0 : (opts.elite ? Math.ceil((pr.shard || 0) * 1.5) : (pr.shard || 0)) };
  var waves = (pr.waves && !reducedMotion) ? pr.waves : [0];
  var perWave = Math.ceil(n / waves.length);
  for (var w = 0; w < waves.length; w++) {
    (function (delay, count) {
      _scheduleBurst(delay, function () { _spawnWave(pr, x, y, count, velMul, lifeBonus, state, opts); });
    })(waves[w], w === waves.length - 1 ? n - perWave * w : perWave);
  }
  // shockwave ring(s)
  var ringN = pr.rings || (pr.ring ? 1 : 0);
  if (reducedMotion && ringN > 1) ringN = 1; // bỏ shockwave kép
  for (var r = 0; r < ringN; r++) {
    (function (delay) {
      _scheduleBurst(delay, function () {
        addRing(x, y, { r1: pr.ring ? pr.ring.r1 : 90, durMs: pr.ring ? pr.ring.dur : 400,
          color: opts.elite ? "#ffd23f" : "#ffffff", alpha: pr.ring ? pr.ring.a : 0.5, ease: pr.ring ? pr.ring.ease : 2 });
      });
    })(r * 150);
  }
  if (opts.elite) addRing(x, y, { r1: 46, durMs: 280, color: "#ffd23f", alpha: 0.6, ease: 1 });
  _spawnWisp(x, y); // soul wisp cho mọi loại
}

function _spawnWave(pr, x, y, count, velMul, lifeBonus, state, opts) {
  for (var i = 0; i < count; i++) {
    var p = allocParticle();
    var a = rand(0, Math.PI * 2);
    var sp = rand(pr.v[0], pr.v[1]) * velMul;
    var color = pickW(pr.colors, pr.cw);
    if (opts.elite && Math.random() < 0.25) color = "#ffd23f"; // pha viền vàng elite
    var shape = SHAPE_DOT, life = (pr.life + lifeBonus) / 1000, grav = pr.g;
    if (state.shardsLeft > 0 && _shardAlive < 0.3 * Math.max(1, _aliveParts)) {
      shape = SHAPE_SHARD; state.shardsLeft--; _shardAlive++;
      p.rot = rand(0, Math.PI * 2); p.vr = rand(-9, 9);
    } else if (pr.streak) shape = SHAPE_STREAK;
    if (pr.smoke && color === pr.smoke.color) { shape = SHAPE_SMOKE; life = pr.smoke.life / 1000; grav = -120; }
    p.x = x; p.y = y;
    p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp;
    p.grav = grav; p.drag = pr.drag;
    p.age = 0; p.life = life * rand(0.85, 1.15);
    p.size = rand(pr.size[0], pr.size[1]);
    p.shape = shape; p.color = color; p.fade = pr.fade;
    p.len = pr.streak ? rand(8, 16) : 0;
  }
}

/** Soul wisp: 1 hạt sáng trắng bay thẳng lên 60px trong 500ms (easeOutCubic). */
function _spawnWisp(x, y) {
  if (reducedMotion && Math.random() < 0.5) return;
  var p = allocParticle();
  p.x = x; p.y = y; p.vx = 0; p.vy = 0; p.grav = 0; p.drag = 1;
  p.age = 0; p.life = 0.55; p.size = 3; p.shape = SHAPE_WISP;
  p.color = "#ffffff"; p.fade = 1;
}

/**
 * Vẽ toàn bộ particle đang sống. Gọi sau applyShake, trước các entity
 * (hoặc sau tùy layer worker muốn — mặc định: dưới damage numbers).
 * @param {CanvasRenderingContext2D} ctx
 */
function drawParticles(ctx) {
  for (var i = 0; i < P_PART.n; i++) {
    var p = P_PART.items[i];
    if (!p.active) continue;
    var t = clamp(p.age / p.life, 0, 1);
    var fadeK = p.fade === 2 ? 1 - Ease.easeOutCubic(t) : 1 - Ease.easeOutQuad(t);
    ctx.globalAlpha = fadeK;
    if (p.shape === SHAPE_DOT) {
      ctx.fillStyle = p.color;
      var s = p.size * (1 - t * 0.5);
      ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
    } else if (p.shape === SHAPE_SHARD) {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      var sh = p.size * 1.7;
      ctx.beginPath();
      ctx.moveTo(0, -sh); ctx.lineTo(sh * 0.8, sh * 0.7); ctx.lineTo(-sh * 0.8, sh * 0.7);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    } else if (p.shape === SHAPE_STREAK) {
      var d = Math.sqrt(p.vx * p.vx + p.vy * p.vy) || 1;
      ctx.strokeStyle = p.color; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx / d * p.len, p.y - p.vy / d * p.len);
      ctx.stroke();
    } else if (p.shape === SHAPE_SMOKE) {
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1 + t * 2), 0, Math.PI * 2); ctx.fill();
    } else { // SHAPE_WISP
      var k = Ease.easeOutCubic(clamp(p.age / 0.5, 0, 1));
      ctx.fillStyle = "#ffffff";
      ctx.beginPath(); ctx.arc(p.x, p.y - 60 * k, p.size, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

/** @returns {number} số particle đang sống (debug / kiểm tra adaptive). */
function aliveParticles() { return _aliveParts; }

/**
 * Thêm 1 shockwave ring (vẽ bằng stroke arc, không dùng ảnh — §0.3).
 * @param {number} x
 * @param {number} y
 * @param {object} [opts] { r0, r1, durMs, color, alpha, ease }
 *   ease: 1 = easeOutCubic, 2 = easeOutQuart (mặc định), 3 = easeOutExpo
 */
function addRing(x, y, opts) {
  opts = opts || {};
  var r = P_RING.next();
  r.active = true;
  r.x = x; r.y = y;
  r.r0 = opts.r0 || 0; r.r1 = opts.r1 || 60;
  r.age = 0; r.life = (opts.durMs || 300) / 1000;
  r.color = opts.color || "#ffffff";
  r.a0 = (opts.alpha === undefined ? 0.5 : opts.alpha);
  r.ease = opts.ease || 2;
}

/** @param {CanvasRenderingContext2D} ctx */
function drawRings(ctx) {
  for (var i = 0; i < P_RING.n; i++) {
    var r = P_RING.items[i];
    if (!r.active) continue;
    var t = clamp(r.age / r.life, 0, 1);
    var k = r.ease === 1 ? Ease.easeOutCubic(t) : r.ease === 3 ? Ease.easeOutExpo(t) : Ease.easeOutQuart(t);
    ctx.globalAlpha = r.a0 * (1 - t);
    ctx.strokeStyle = r.color; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * k, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/**
 * Lưu 1 ghost afterimage (pool 12). Worker gọi khi player speed > 180px/s,
 * mỗi 40ms. Ghost fade 220ms, alpha 0.35→0.
 * @param {number} x
 * @param {number} y
 * @param {object} [opts] { rot, scale, color, alpha, lifeMs }
 */
function pushGhost(x, y, opts) {
  if (reducedMotion) return; // Phụ lục B: bỏ ghost trail
  opts = opts || {};
  var g = P_GHOST.next();
  g.active = true; g.x = x; g.y = y; g.rot = opts.rot || 0;
  g.age = 0; g.life = (opts.lifeMs || 220) / 1000;
  g.scale = opts.scale || 0.9;
  g.color = opts.color || "#0080ff";
  g.alpha = (opts.alpha === undefined ? 0.35 : opts.alpha);
}

/**
 * Vẽ ghost trail. Juice không biết hình player nên nhận drawFn từ worker.
 * @param {CanvasRenderingContext2D} ctx
 * @param {function} drawFn (ctx, ghost, alpha) — vẽ 1 afterimage tại
 *   ghost.x/ghost.y, xoay ghost.rot, scale ghost.scale
 */
function drawGhosts(ctx, drawFn) {
  if (typeof drawFn !== "function") return;
  for (var i = 0; i < P_GHOST.n; i++) {
    var g = P_GHOST.items[i];
    if (!g.active) continue;
    var t = clamp(g.age / g.life, 0, 1);
    ctx.save();
    ctx.globalAlpha = g.alpha * (1 - t);
    ctx.translate(g.x, g.y); ctx.rotate(g.rot); ctx.scale(g.scale, g.scale);
    ctx.translate(-g.x, -g.y);
    drawFn(ctx, g, g.alpha * (1 - t));
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

/**
 * Float text nhỏ (pool 16) — dùng cho thông báo không phải damage
 * (worker vẫn có thể dùng addFloat cũ; Juice cung cấp bản có pool).
 * Bay lên 42px/650ms easeOutCubic, fade từ 55% thời gian.
 * @param {number} x
 * @param {number} y
 * @param {string} text
 * @param {string} [color]
 * @param {object} [opts] { size, lifeMs }
 */
function floatText(x, y, text, color, opts) {
  opts = opts || {};
  var f = P_FLOAT.next();
  f.active = true;
  f.x = x + rand(-6, 6); f.y = y;
  f.text = String(text); f.color = color || "#ffffff";
  f.age = 0; f.life = (opts.lifeMs || 1250) / 1000;
  f.size = opts.size || 15;
}

/** @param {CanvasRenderingContext2D} ctx */
function drawFloats(ctx) {
  ctx.textAlign = "center";
  for (var i = 0; i < P_FLOAT.n; i++) {
    var f = P_FLOAT.items[i];
    if (!f.active) continue;
    var t = clamp(f.age / f.life, 0, 1);
    var rise = 42 * Ease.easeOutCubic(clamp(f.age / 0.65, 0, 1));
    var a = t < 0.55 ? 1 : 1 - (t - 0.55) / 0.45;
    ctx.globalAlpha = clamp(a, 0, 1);
    ctx.font = "bold " + f.size + "px system-ui, sans-serif";
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y - rise);
  }
  ctx.globalAlpha = 1; ctx.textAlign = "left";
}

/* ================= 5. HIT FLASH (§2.1 spec) =================
 * Entity được "đánh dấu" bằng các field jf* (juice fields) — worker đọc qua
 * flashOverlay() / popScale() khi vẽ. Vẽ sau sprite, trước damage number.
 * Giữ tương thích e.flash (giây) của game.js hiện tại: hitFlash() set cả hai.
 */
var _ents = []; // entity đang có juice state — update trong updateFx (không alloc)

/** Đăng ký entity vào danh sách update của Juice (idempotent). @private */
function _track(e) {
  for (var i = 0; i < _ents.length; i++) if (_ents[i] === e) return;
  _ents.push(e);
}
/** @private */
function _untrack(e) {
  for (var i = 0; i < _ents.length; i++) if (_ents[i] === e) { _ents.splice(i, 1); return; }
}
/** @private — entity còn juice state nào không */
function _entsBusy(e) {
  return !!(e.jfFlash || e.jfPop || e.jfMat || e.jfDeath);
}

/**
 * Quái chớp sáng khi trúng đạn.
 * - thường: overlay trắng alpha 0.85, 70ms
 * - boss (opts.boss): alpha 0.6, 100ms (tránh chói vì boss to)
 * - chewer đang bám viền (opts.latchedChewer): trắng-tím pha #c084fc
 * - crit (opts.crit): 90ms + scale pop 1.08 (120ms easeOutBack)
 * Reduced-motion: alpha ×0.4.
 * @param {object} entity quái (object tự do — Juice chỉ gắn field jf*)
 * @param {object} [opts] { boss, latchedChewer, crit }
 */
function hitFlash(entity, opts) {
  opts = opts || {};
  var alpha = 0.85, durMs = 70, color = "#ffffff";
  if (opts.boss) { alpha = 0.6; durMs = 100; }
  if (opts.latchedChewer) color = "#d0a2ff";
  if (opts.crit) durMs = 90;
  if (reducedMotion) alpha *= 0.4;
  entity.jfFlash = { age: 0, dur: durMs / 1000, alpha: alpha, color: color };
  entity.flash = durMs / 1000; // tương thích game.js hiện tại (e.flash giây)
  if (opts.crit && !reducedMotion) entity.jfPop = { age: 0, dur: 0.12 };
  _track(entity);
}

/**
 * Đọc state flash để vẽ overlay. Worker vẽ lại shape quái rồi fill:
 *   var fl = Juice.flashOverlay(e);
 *   if (fl) { ctx.save(); ctx.globalAlpha = fl.alpha; ctx.fillStyle = fl.color;
 *             <vẽ lại shape>; ctx.restore(); }
 * @param {object} entity
 * @returns {{alpha:number,color:string}|null} null khi không flash
 */
function flashOverlay(entity) {
  var f = entity.jfFlash;
  if (!f) return null;
  return { alpha: f.alpha * (1 - f.age / f.dur), color: f.color };
}

/**
 * Scale pop khi crit: 1.08 → 1.0 trong 120ms (easeOutBack).
 * Worker nhân vào scale khi vẽ quái.
 * @param {object} entity
 * @returns {number} scale hiện tại (1 khi không pop)
 */
function popScale(entity) {
  var p = entity.jfPop;
  if (!p) return 1;
  var k = clamp(p.age / p.dur, 0, 1);
  return 1 + 0.08 * (1 - Ease.easeOutBack(k));
}

/* ================= 6. HIT-STOP TRIGGERS (§2.2 spec) ================= */
/**
 * Gọi khi quái chết để trigger hit-stop đúng bảng:
 * - tank / splitter chết: 40ms
 * - elite (biến thể vàng) chết: 60ms
 * - quái thường (chaser/mini/dasher): KHÔNG hit-stop (tránh giật hình)
 * - combo milestone x25: worker khác gọi Juice.hitStop(40) trực tiếp
 * - boss chết: worker gọi Juice.hitStop(90, { exempt: true }) rồi cinematic
 * @param {string} type loại quái (chaser|chewer|tank|dasher|splitter|mini|boss)
 * @param {boolean} [isElite] biến thể vàng
 */
function onKill(type, isElite) {
  if (isElite) { hitStop(60); return; }
  if (type === "tank" || type === "splitter") hitStop(40);
}

/* ================= 8. SPAWN WARNING (§5 spec) =================
 * Player có 400–600ms đọc mối nguy: warning 400ms (elite 500ms, vòng vàng) →
 * materialize 200ms easeOutBack 1.25 + 8 particle hút vào → quái bất động
 * thêm 50ms, không gây damage trong 650ms đầu (worker tự enforce).
 */
var _warnings = []; // { x, y, r, elite, age, dur, resolve, onDone }

/**
 * Hiện vòng cảnh báo spawn. Trả về Promise resolve(true) sau 400ms
 * (elite: 500ms) — worker await rồi mới cho quái active.
 * Vòng đứt nét đỏ #ff5d5d (elite: vàng #ffd23f), radius = r + 10,
 * blink 5Hz (alpha 0.3↔0.9) + dấu "!" 16px ở tâm.
 * Reduced-motion: giữ warning (thông tin sống còn), bỏ blink (vòng tĩnh alpha 0.7).
 * @param {number} x
 * @param {number} y
 * @param {number} r bán kính quái (vòng vẽ = r + 10)
 * @param {object} [opts] { elite, onDone }
 * @returns {Promise<boolean>}
 */
function spawnWarning(x, y, r, opts) {
  opts = opts || {};
  var elite = !!opts.elite;
  return new Promise(function (resolve) {
    _warnings.push({ x: x, y: y, r: r + 10, elite: elite,
      age: 0, dur: (elite ? 500 : 400) / 1000,
      resolve: resolve, onDone: opts.onDone || null });
  });
}

/**
 * Portal tím cho chewer từ satellite popup: trước warning 400ms, hiện portal
 * tại mép arena — 2 vòng arc xoay ngược chiều, 350ms. Promise resolve sau 350ms.
 * Reduced-motion: portal tĩnh fade 150ms.
 * @param {number} x
 * @param {number} y
 * @param {object} [opts] { onDone }
 * @returns {Promise<boolean>}
 */
function spawnPortal(x, y, opts) {
  opts = opts || {};
  return new Promise(function (resolve) {
    _warnings.push({ x: x, y: y, r: 26, elite: false, portal: true,
      age: 0, dur: reducedMotion ? 0.15 : 0.35,
      resolve: resolve, onDone: opts.onDone || null });
  });
}

/** @param {CanvasRenderingContext2D} ctx */
function drawWarnings(ctx) {
  var now2 = performance.now();
  for (var i = 0; i < _warnings.length; i++) {
    var w = _warnings[i];
    if (w.portal) {
      var pt = clamp(w.age / w.dur, 0, 1);
      ctx.save();
      ctx.globalAlpha = reducedMotion ? 0.7 * (1 - pt) : 0.8 * (1 - pt * 0.4);
      ctx.strokeStyle = "#c084fc"; ctx.lineWidth = 3;
      if (reducedMotion) {
        ctx.beginPath(); ctx.arc(w.x, w.y, w.r, 0, Math.PI * 2); ctx.stroke();
      } else {
        var a1 = now2 / 240, a2 = -now2 / 190; // 2 arc xoay ngược chiều
        ctx.beginPath(); ctx.arc(w.x, w.y, w.r, a1, a1 + Math.PI * 1.2); ctx.stroke();
        ctx.beginPath(); ctx.arc(w.x, w.y, w.r * 0.65, a2, a2 + Math.PI * 1.2); ctx.stroke();
      }
      ctx.restore();
      continue;
    }
    var blink = reducedMotion ? 0.7 : 0.3 + 0.6 * (0.5 + 0.5 * Math.sin(w.age * 2 * Math.PI * 5));
    ctx.save();
    ctx.globalAlpha = blink;
    ctx.strokeStyle = w.elite ? "#ffd23f" : "#ff5d5d";
    ctx.lineWidth = w.elite ? 3 : 2;
    ctx.setLineDash([8, 6]);
    ctx.beginPath(); ctx.arc(w.x, w.y, w.r, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = w.elite ? "#ffd23f" : "#ff5d5d";
    ctx.font = "bold 16px system-ui, sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("!", w.x, w.y);
    ctx.restore();
  }
  ctx.textBaseline = "alphabetic";
}

/**
 * Quái "hiện hình": scale 0→1 trong 200ms easeOutBack (overshoot 1.25)
 * + 8 particle hút vào tâm (implode). Worker đọc materializeScale(e) khi vẽ.
 * Reduced-motion: thành fade 150ms (worker đọc materializeAlpha).
 * @param {object} entity quái vừa hết warning
 */
function materialize(entity) {
  entity.jfMat = { age: 0, dur: reducedMotion ? 0.15 : 0.2 };
  for (var i = 0; i < 8; i++) {
    var a = (i / 8) * Math.PI * 2 + rand(-0.2, 0.2);
    var rr = rand(24, 44);
    var p = allocParticle();
    p.x = entity.x + Math.cos(a) * rr; p.y = entity.y + Math.sin(a) * rr;
    var spd = rr / 0.2; // về tới tâm đúng lúc materialize xong
    p.vx = -Math.cos(a) * spd; p.vy = -Math.sin(a) * spd;
    p.grav = 0; p.drag = 1; p.age = 0; p.life = 0.25;
    p.size = rand(2, 3.5); p.shape = SHAPE_DOT;
    p.color = entity.color || "#c084fc"; p.fade = 1;
  }
  _track(entity);
}

/**
 * @param {object} entity
 * @returns {number} scale materialize (1 khi xong / không có)
 */
function materializeScale(entity) {
  var m = entity.jfMat;
  if (!m) return 1;
  if (reducedMotion) return 1;
  return Math.max(0.01, Ease.easeOutBack(clamp(m.age / m.dur, 0, 1), 1.25));
}

/**
 * @param {object} entity
 * @returns {number} alpha materialize cho reduced-motion (1 khi xong)
 */
function materializeAlpha(entity) {
  var m = entity.jfMat;
  if (!m || !reducedMotion) return 1;
  return clamp(m.age / m.dur, 0, 1);
}

/* ================= 9. DEATH ANIMATIONS (§6 spec) =================
 * deathAnim(type, entity, onDone): chạy animation chết, rồi gọi onDone —
 * worker spawn burst §3 trong onDone rồi mới gỡ entity khỏi mảng.
 * Worker đọc deathTransform(e) mỗi frame khi vẽ entity đang chết:
 * - squash (chaser/mini): scaleY→0.6, scaleX→1.4, 120ms easeInQuad
 * - pop (chewer): 3 shard "răng" tím bay 3 hướng (Juice spawn ngay) + fade
 * - inflate→explode (tank): phồng 1→1.15 trong 100ms easeInQuad rồi onDone
 *   (worker: burst 24 + shockwave + hit-stop 40ms + shake tier 4)
 * - dissolve (dasher): vệt streak theo hướng di chuyển cuối, fade 150ms
 * - split (splitter): 2 nửa trượt ngược nhau 12px trong 100ms → worker spawn
 *   2 mini với spawn animation rút gọn (warning 200ms)
 * - boss: không qua đây — worker chạy death cinematic §13 riêng
 * Reduced-motion: squash/pop thành fade 150ms; tank bỏ phase phồng.
 */
var DEATH_DUR = { squash: 0.12, pop: 0.15, inflate: 0.1, dissolve: 0.15, split: 0.1, fade: 0.15 };

function deathAnim(type, entity, onDone) {
  var e = entity, kind;
  if (reducedMotion && (type === "chaser" || type === "mini" || type === "chewer")) {
    kind = "fade";
  } else if (type === "chaser" || type === "mini") {
    kind = "squash";
  } else if (type === "chewer") {
    kind = "pop";
    for (var i = 0; i < 3; i++) { // 3 shard "răng" tím bay ra 3 hướng
      var a = (i / 3) * Math.PI * 2 + rand(-0.3, 0.3);
      var sp = rand(120, 220);
      var p = allocParticle();
      p.x = e.x; p.y = e.y;
      p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp;
      p.grav = 60; p.drag = 0.97; p.age = 0; p.life = rand(0.3, 0.45);
      p.size = rand(3, 5); p.shape = SHAPE_SHARD;
      p.rot = rand(0, Math.PI * 2); p.vr = rand(-12, 12); _shardAlive++;
      p.color = i === 0 ? "#ffffff" : "#c084fc"; p.fade = 1;
    }
  } else if (type === "tank") {
    kind = reducedMotion ? "explode" : "inflate";
  } else if (type === "dasher") {
    kind = "dissolve";
    var dx = e.dx || 0, dy = e.dy || 0; // hướng di chuyển cuối (worker set)
    for (var j = 0; j < 5; j++) {
      var q = allocParticle();
      q.x = e.x + rand(-8, 8); q.y = e.y + rand(-8, 8);
      q.vx = dx * rand(60, 160) + rand(-30, 30); q.vy = dy * rand(60, 160) + rand(-30, 30);
      q.grav = 0; q.drag = 0.94; q.age = 0; q.life = 0.15;
      q.size = 2; q.shape = SHAPE_STREAK; q.len = rand(8, 16);
      q.color = "#ffe14d"; q.fade = 1;
    }
  } else if (type === "splitter") {
    kind = "split";
  } else {
    if (typeof onDone === "function") onDone(); // boss / loại lạ: worker tự xử
    return;
  }
  e.jfDeath = { kind: kind, age: 0, dur: kind === "explode" ? 0.001 : DEATH_DUR[kind],
    onDone: (typeof onDone === "function" ? onDone : null), fired: false };
  _track(e);
}

/**
 * Đọc transform animation chết để worker áp khi vẽ entity.
 * @param {object} entity
 * @returns {{sx:number,sy:number,alpha:number,split:number}|null}
 *   sx/sy: scale; alpha: độ mờ; split: offset px mỗi nửa trượt ngược nhau
 *   (splitter — worker vẽ 2 nửa sprite dịch ±split theo trục x).
 *   null khi entity không trong death anim.
 */
function deathTransform(entity) {
  var d = entity.jfDeath;
  if (!d) return null;
  var p = clamp(d.age / d.dur, 0, 1);
  switch (d.kind) {
    case "squash": {
      var k = Ease.easeInQuad(p);
      return { sx: 1 + 0.4 * k, sy: 1 - 0.4 * k, alpha: 1, split: 0 };
    }
    case "pop":
      return { sx: 1.1, sy: 1.1, alpha: 1 - p, split: 0 };
    case "inflate": {
      var s = 1 + 0.15 * Ease.easeInQuad(p);
      return { sx: s, sy: s, alpha: 1, split: 0 };
    }
    case "split":
      return { sx: 1, sy: 1, alpha: 1 - p * 0.3, split: 12 * Ease.easeInQuad(p) };
    case "explode":
      return { sx: 1, sy: 1, alpha: 1, split: 0 };
    default: // fade / dissolve
      return { sx: 1, sy: 1, alpha: 1 - p, split: 0 };
  }
}

/* ================= 10. DAMAGE NUMBERS (§4 spec) =================
 * Pool 24 · font bold 13px system-ui, stroke đen 2px · màu theo loại:
 * normal #ffffff · crit #ffd23f (17px, scale pop 1.35→1.0, 150ms easeOutBack) ·
 * playerHurt #ff5d5d · heal #5dff8f (prefix "+").
 * Bay lên 42px trong 650ms (easeOutCubic), fade từ 55% thời gian.
 * Gộp: damage cùng target trong 120ms cộng dồn thành 1 số (nảy scale 1.15).
 * Quá 24 số → ghi đè số cũ nhất (ring-buffer).
 * Reduced-motion: giữ nguyên (thông tin combat), chỉ bỏ scale pop của crit.
 */

/**
 * Spawn 1 damage number tại điểm hit.
 * @param {number} x
 * @param {number} y
 * @param {number} amount sát thương (làm tròn)
 * @param {string} [kind] normal|crit|playerHurt|heal
 * @param {object} [target] entity nhận damage — dùng để gộp số trong 120ms;
 *   không truyền thì mỗi số độc lập. Không spawn cho target đã chết
 *   (worker kiểm tra trước khi gọi).
 */
function damageNumber(x, y, amount, kind, target) {
  kind = DMG_COLORS[kind] ? kind : "normal";
  amount = Math.round(amount);
  if (!(amount > 0) && kind !== "heal") return;
  var i, d;
  if (target) { // gộp damage cùng target trong 120ms
    for (i = 0; i < P_DMG.n; i++) {
      d = P_DMG.items[i];
      if (d.active && d.target === target && d.kind === kind && d.age < 0.12) {
        d.amount += amount;
        d.text = (kind === "heal" ? "+" : "") + d.amount;
        d.age = 0; d.x = x + rand(-6, 6); d.y = y; // refresh, số nảy
        d.popAge = 0; d.popDur = 0.12; // nảy scale 1.15
        d.popAmp = 0.15;
        return;
      }
    }
  }
  d = P_DMG.next();
  d.active = true;
  d.x = x + rand(-6, 6); d.y = y;
  d.amount = amount;
  d.text = (kind === "heal" ? "+" : "") + amount;
  d.color = DMG_COLORS[kind];
  d.age = 0; d.life = 0.65;
  d.size = kind === "crit" ? 17 : 13;
  d.kind = kind; d.target = target || null;
  d.popAge = 0; d.popDur = 0.15; // crit scale pop 1.35→1.0
  d.popAmp = kind === "crit" ? 0.35 : 0;
}

/** @param {CanvasRenderingContext2D} ctx */
function drawDamageNumbers(ctx) {
  ctx.textAlign = "center";
  for (var i = 0; i < P_DMG.n; i++) {
    var d = P_DMG.items[i];
    if (!d.active) continue;
    var rise = 42 * Ease.easeOutCubic(clamp(d.age / d.life, 0, 1));
    var t = d.age / d.life;
    var a = t < 0.55 ? 1 : 1 - (t - 0.55) / 0.45;
    var sc = 1;
    if (d.popAmp > 0 && !reducedMotion) {
      var pk = clamp(d.popAge / d.popDur, 0, 1);
      sc = 1 + d.popAmp * (1 - Ease.easeOutBack(pk));
    }
    ctx.save();
    ctx.globalAlpha = clamp(a, 0, 1);
    ctx.translate(d.x, d.y - rise);
    ctx.scale(sc, sc);
    ctx.font = "bold " + d.size + "px system-ui, sans-serif";
    ctx.lineWidth = 2; ctx.strokeStyle = "#000000";
    ctx.strokeText(d.text, 0, 0);
    ctx.fillStyle = d.color;
    ctx.fillText(d.text, 0, 0);
    ctx.restore();
  }
  ctx.globalAlpha = 1; ctx.textAlign = "left";
}

/* ================= UPDATE FX (real-time) =================
 * Gọi 1 lần/frame với rawDt (giây) — từ render path, KỂ CẢ khi game pause,
 * vì FX (shake decay, particle, warning blink) chạy theo thời gian thực,
 * không bị timescale/draft ảnh hưởng.
 * @param {number} rawDt delta giây chưa scale
 */
function updateFx(rawDt) {
  var dt = Math.min(0.1, Math.max(0, rawDt));
  var i, now = performance.now();

  _updateShakes(dt);

  // burst đặt lịch (boss 3 đợt 0/150/300ms)
  for (i = _pending.length - 1; i >= 0; i--) {
    if (now >= _pending[i].at) {
      var fn = _pending[i].fn;
      _pending.splice(i, 1);
      fn();
    }
  }

  // particles
  var dragK;
  for (i = 0; i < P_PART.n; i++) {
    var p = P_PART.items[i];
    if (!p.active) continue;
    p.age += dt;
    if (p.age >= p.life) {
      p.active = false; _aliveParts--;
      if (p.shape === SHAPE_SHARD) _shardAlive--;
      continue;
    }
    if (p.shape !== SHAPE_WISP) {
      p.vy += p.grav * dt;
      dragK = Math.pow(p.drag, dt * 60);
      p.vx *= dragK; p.vy *= dragK;
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
    if (p.shape === SHAPE_SHARD) p.rot += p.vr * dt;
  }

  // rings / ghosts / floats / damage numbers
  for (i = 0; i < P_RING.n; i++) {
    var r = P_RING.items[i];
    if (!r.active) continue;
    r.age += dt; if (r.age >= r.life) r.active = false;
  }
  for (i = 0; i < P_GHOST.n; i++) {
    var g = P_GHOST.items[i];
    if (!g.active) continue;
    g.age += dt; if (g.age >= g.life) g.active = false;
  }
  for (i = 0; i < P_FLOAT.n; i++) {
    var f = P_FLOAT.items[i];
    if (!f.active) continue;
    f.age += dt; if (f.age >= f.life) f.active = false;
  }
  for (i = 0; i < P_DMG.n; i++) {
    var d = P_DMG.items[i];
    if (!d.active) continue;
    d.age += dt; d.popAge += dt;
    if (d.age >= d.life) { d.active = false; d.target = null; }
  }

  // spawn warnings → resolve promise khi hết giờ
  for (i = _warnings.length - 1; i >= 0; i--) {
    var w = _warnings[i];
    w.age += dt;
    if (w.age >= w.dur) {
      _warnings.splice(i, 1);
      if (typeof w.onDone === "function") { try { w.onDone(); } catch (e) {} }
      w.resolve(true);
    }
  }

  // entity juice state: flash / pop / materialize / death
  for (i = _ents.length - 1; i >= 0; i--) {
    var e = _ents[i];
    var busy = false;
    if (e.jfFlash) {
      e.jfFlash.age += dt;
      if (e.jfFlash.age >= e.jfFlash.dur) e.jfFlash = null; else busy = true;
    }
    if (e.jfPop) {
      e.jfPop.age += dt;
      if (e.jfPop.age >= e.jfPop.dur) e.jfPop = null; else busy = true;
    }
    if (e.jfMat) {
      e.jfMat.age += dt;
      if (e.jfMat.age >= e.jfMat.dur) e.jfMat = null; else busy = true;
    }
    if (e.jfDeath) {
      var dd = e.jfDeath;
      dd.age += dt;
      if (dd.age >= dd.dur) {
        e.jfDeath = null;
        if (!dd.fired) { dd.fired = true; if (typeof dd.onDone === "function") { try { dd.onDone(); } catch (err) {} } }
      } else busy = true;
    }
    if (!busy && !_entsBusy(e)) _ents.splice(i, 1);
  }
}

/**
 * Xóa toàn bộ FX state (gọi khi reset game / đổi wave lớn).
 * Không resolve các spawnWarning promise đang treo — worker nên await xong
 * trước khi reset.
 */
function reset() {
  var i;
  _shakes.length = 0;
  _pending.length = 0;
  // Settle warning promises đang treo — tránh worker await vĩnh viễn
  for (i = 0; i < _warnings.length; i++) { try { _warnings[i].resolve(false); } catch (e) {} }
  _warnings.length = 0;
  // Fire death onDone đang treo trước khi xóa entity
  for (i = 0; i < _ents.length; i++) { try { if (typeof _ents[i].onDone === "function") _ents[i].onDone(); } catch (e) {} }
  _ents.length = 0;
  _hitStopMs = 0; _slowMoMs = 0; _timeScale = 1;
  _aliveParts = 0; _shardAlive = 0;
  var pools = [P_PART, P_RING, P_GHOST, P_FLOAT, P_DMG];
  for (i = 0; i < pools.length; i++) {
    var items = pools[i].items;
    for (var j = 0; j < items.length; j++) { items[j].active = false; if (items[j].target !== undefined) items[j].target = null; }
  }
}

/* ================= PUBLIC API ================= */
var Juice = {
  /* 1. easing */
  Ease: Ease,
  /* 11. reduced motion (đọc 1 lần lúc boot) */
  reducedMotion: reducedMotion,
  /* 2. timescale */
  update: update,
  hitStop: hitStop,
  slowMo: slowMo,
  isHitStop: isHitStop,
  isSlowMo: isSlowMo,
  /** Set true khi panel draft mở (game pause) — hitStop bị bỏ qua khi cờ này bật. */
  /* 3. shake */
  addShake: addShake,
  applyShake: applyShake,
  windowJitter: windowJitter,
  /* 4+7. pools & bursts */
  burst: burst,
  drawParticles: drawParticles,
  aliveParticles: aliveParticles,
  addRing: addRing,
  drawRings: drawRings,
  pushGhost: pushGhost,
  drawGhosts: drawGhosts,
  floatText: floatText,
  drawFloats: drawFloats,
  /* 5. hit flash */
  hitFlash: hitFlash,
  flashOverlay: flashOverlay,
  popScale: popScale,
  /* 6. hit-stop triggers */
  onKill: onKill,
  /* 8. spawn */
  spawnWarning: spawnWarning,
  spawnPortal: spawnPortal,
  drawWarnings: drawWarnings,
  materialize: materialize,
  materializeScale: materializeScale,
  materializeAlpha: materializeAlpha,
  /* 9. death anims */
  deathAnim: deathAnim,
  deathTransform: deathTransform,
  /* 10. damage numbers */
  damageNumber: damageNumber,
  drawDamageNumbers: drawDamageNumbers,
  /* fx clock + reset */
  updateFx: updateFx,
  reset: reset
};

/* timeScale: read-only getter (1 | 0 hit-stop | 0.2–0.4 slow-mo) */
try {
  Object.defineProperty(Juice, "timeScale", { get: function () { return _timeScale; }, enumerable: true });
} catch (e) { Juice.timeScale = 1; }

window.Juice = Juice;
Object.defineProperty(Juice, "draftOpen", { get: function () { return _draftOpen; }, set: function (v) { _draftOpen = !!v; }, configurable: true });
})();
