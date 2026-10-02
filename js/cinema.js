/* =====================================================================
   WINDOWKILL: Web Edition — js/cinema.js
   CINEMATICS & VISUAL POLISH (Wave 3 + Wave 4, WOW-DIRECTION §5)

   Tầng cinematic trên nền Juice (js/juice.js):
   - Wave 3: wave banner / countdown / wave clear + vá cửa sổ, upgrade
     draft (DOM), combo system, boss intro / phase / death cinematic.
   - Wave 4: player trail / shield / low-HP heartbeat, satellite portal,
     background states, UI micro-interactions, pickup & gem visuals.

   Spec: studio/ANIMATION-JUICE-DIRECTION.md §7–13,
         studio/VISUAL-STYLE-GUIDE.md (toàn bộ),
         studio/game-design/WOW-DIRECTION.md §2, §4, §5 (Wave 3–4), §6.2, §6.4.

   NGUYÊN TẮC (bất khả xâm phạm):
   - Không hiệu ứng nào che gameplay quá 200ms khi game đang chạy, trừ khi
     game pause có chủ đích (draft / boss intro / boss death).
   - VFX hierarchy §6 style-guide: tối đa 3 hero moments (hạng 1–3) cùng lúc;
     vượt quá → sự kiện hạng 3+ bị giáng cấp (bỏ slow-mo/shake, giữ burst+banner).
   - Brand blue (#0066CC/#0080FF) chỉ dạng glow/viền/nhấn — không fill mảng lớn.
   - Mọi hiệu ứng có bản rút gọn khi prefers-reduced-motion.

   TÍCH HỢP (worker tích hợp thực hiện — xem REPORT cuối file):
   - game.html: <script src="js/juice.js"></script> rồi
     <script src="js/cinema.js"></script>, TRƯỚC js/game.js.
   - Mỗi frame: const rawDt = ...;
                  const dt = Juice.update(rawDt);          // gameplay
                  if (!G.cinePause) updateGame(dt);
                  Cinema.update(rawDt, { player, W, H });  // real-time
                  Juice.updateFx(rawDt);
     Render: ctx.save(); Juice.applyShake(ctx);
             <vẽ background>; Cinema.drawBack(ctx, W, H);
             <vẽ entities>; Juice.drawParticles(); Juice.drawRings();
             Juice.drawGhosts(ctx, drawPlayerGhost); Juice.drawFloats();
             Juice.drawDamageNumbers(); Juice.drawWarnings();
             Cinema.drawFront(ctx, W, H); ctx.restore();

   Ràng buộc kỹ thuật: vanilla JS, IIFE, "use strict", không dependency,
   tương thích CSP (không eval / new Function / inline handler / style attr).
   ===================================================================== */
(function () {
"use strict";

/* ================= helpers ================= */
var TAU = Math.PI * 2;
function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function rand(a, b) { return a + Math.random() * (b - a); }
function lerp(a, b, t) { return a + (b - a) * t; }

/* Easing: ưu tiên Juice.Ease (đồng bộ toàn game), fallback nội bộ nếu
   cinema.js load trước juice.js. */
var _FE = {
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
function E() { return (window.Juice && window.Juice.Ease) || _FE; }

/* Reduced motion: ưu tiên Juice.reducedMotion, fallback matchMedia đọc 1 lần. */
var _rmMedia = (typeof window.matchMedia === "function") &&
  !!window.matchMedia("(prefers-reduced-motion: reduce)").matches;
function RM() {
  var J = window.Juice;
  if (J && typeof J.reducedMotion === "boolean") return J.reducedMotion;
  return _rmMedia;
}

/* ================= audio triggers (guarded) =================
 * Tên SFX theo hợp đồng với audio worker. Mọi gọi đều bọc guard để không
 * crash khi AudioEngine chưa sẵn. */
function sfx(name, a, b) {
  try {
    var A = window.AudioEngine;
    if (A && A.sfx && typeof A.sfx[name] === "function") A.sfx[name](a, b);
  } catch (e) {}
}
function setMusic(state, intensity) {
  try {
    var A = window.AudioEngine;
    if (A && typeof A.setMusicState === "function") A.setMusicState(state, intensity);
  } catch (e) {}
}

/* ================= Juice shortcuts (guarded) ================= */
function jHitStop(ms, opts) { try { return window.Juice ? window.Juice.hitStop(ms, opts) : false; } catch (e) { return false; } }
function jSlowMo(sc, ms) { try { return window.Juice ? window.Juice.slowMo(sc, ms) : false; } catch (e) { return false; } }
function jShake(amp, durMs, prio) { try { if (window.Juice) window.Juice.addShake(amp, durMs, prio); } catch (e) {} }
function jRing(x, y, o) { try { if (window.Juice) window.Juice.addRing(x, y, o); } catch (e) {} }
function jFloat(x, y, t, c, o) { try { if (window.Juice) window.Juice.floatText(x, y, t, c, o); } catch (e) {} }
function jBurst(p, x, y, o) { try { if (window.Juice) window.Juice.burst(p, x, y, o); } catch (e) {} }
function jGhost(x, y, o) { try { if (window.Juice) window.Juice.pushGhost(x, y, o); } catch (e) {} }

/* ================= internal clock + scheduler (real-time) ================= */
var _now = 0;          // giây, tăng theo rawDt trong update()
var _timers = [];      // { at, fn }
var _lock = false;     // true khi cinematic pause-game đang chạy (boss intro/death)
function after(sec, fn) { _timers.push({ at: _now + sec, fn: fn }); }

/* ================= internal pools (không alloc trong frame nóng) ================= */
function makePool(n, factory) {
  var items = new Array(n), i;
  for (i = 0; i < n; i++) items[i] = factory();
  return { items: items, n: n, cursor: 0,
    next: function () { var it = items[this.cursor]; this.cursor = (this.cursor + 1) % this.n; return it; } };
}

/* confetti: 48 hạt (wave clear 36, milestone x50 20) */
var P_CONF = makePool(48, function () {
  return { active: false, x: 0, y: 0, vx: 0, vy: 0, rot: 0, vr: 0,
    age: 0, life: 1.2, color: "#ffffff", w: 5, h: 8 };
});
/* sparkle: 72 tia (pickup 6 tia, shield block 6, sat close 8, milestone x10 10) */
var P_SPK = makePool(72, function () {
  return { active: false, x: 0, y: 0, vx: 0, vy: 0, age: 0, life: 0.4,
    color: "#ffffff", rays: 0, size: 3 };
});
/* speedline: 24 vệt (dash 8) */
var P_SPD = makePool(24, function () {
  return { active: false, x: 0, y: 0, dx: 0, dy: 0, len: 40, age: 0, life: 0.15 };
});
/* magnet gem: 20 viên loot bay về player (boss death) */
var P_MGEM = makePool(20, function () {
  return { active: false, x: 0, y: 0, sx: 0, sy: 0, tx: 0, ty: 0,
    age: 0, life: 0.8, color: "#38BDF8", size: 6 };
});
/* miếng vá cửa sổ: 40 (giữ lại tới khi reset/wave mới) */
var P_PATCH = makePool(40, function () { return { active: false, x: 0, y: 0, age: 0 }; });
/* mảnh vỡ arena ring (boss death): 24 */
var P_SHD = makePool(24, function () {
  return { active: false, x: 0, y: 0, vx: 0, vy: 0, age: 0, life: 0.9, rot: 0 };
});

function spawnConfetti(n, fromTop, cx, cy) {
  if (RM()) return; // Phụ lục B: bỏ confetti
  var colors = ["#0080ff", "#ffd23f", "#5dff8f", "#c084fc"];
  for (var i = 0; i < n; i++) {
    var c = P_CONF.next();
    c.active = true;
    if (fromTop) { c.x = rand(0, _W); c.y = rand(-40, -10); c.vx = rand(-40, 40); c.vy = rand(60, 160); }
    else { c.x = cx + rand(-30, 30); c.y = cy + rand(-20, 20); c.vx = rand(-120, 120); c.vy = rand(-160, -40); }
    c.rot = rand(0, TAU); c.vr = rand(-9, 9);
    c.age = 0; c.life = rand(0.9, 1.4);
    c.color = colors[(Math.random() * colors.length) | 0];
    c.w = rand(4, 7); c.h = rand(6, 11);
  }
}
/** Tia sparkle tỏa tròn: rays=0 → chấm tròn, rays>0 → ngôi sao n tia. */
function spawnSparkle(x, y, color, n, speed, life, rays) {
  for (var i = 0; i < n; i++) {
    var s = P_SPK.next();
    var a = (i / Math.max(1, n)) * TAU + rand(-0.2, 0.2);
    var sp = rand(0.5, 1) * (speed === undefined ? 160 : speed);
    s.active = true; s.x = x; s.y = y;
    s.vx = Math.cos(a) * sp; s.vy = Math.sin(a) * sp;
    s.age = 0; s.life = (life || 0.4) * rand(0.8, 1.2);
    s.color = color; s.rays = rays || 0; s.size = rand(2, 4);
  }
}

/* ================= hero moments (§6 style-guide) =================
 * Tối đa 3 sự kiện hạng 1–3 cùng lúc. Vượt quá → sự kiện hạng 3+ mới bị
 * "giáng cấp": bỏ slow-mo/shake mạnh, giữ burst + banner + text.
 * Player death (hạng 1) do game xử lý riêng — không bao giờ bị giáng cấp. */
var _heroes = []; // { tier, until }
function _heroStart(tier) {
  _heroes.push({ tier: tier, until: _now + 2.5 });
}
function _heroFull(tier) {
  var active = 0, i;
  for (i = _heroes.length - 1; i >= 0; i--) {
    if (_heroes[i].until < _now) _heroes.splice(i, 1);
    else active++;
  }
  if (active >= 3 && tier >= 3) return false; // giáng cấp
  return true;
}

/* ================= typography tokens (§7 style-guide) ================= */
var FONT_NUM = 'ui-monospace,"SF Mono","Cascadia Code","JetBrains Mono",Consolas,monospace';
var FONT_UI = 'system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif';

/** Text có shadow 2px đen alpha 0.6 (§7) — không dùng stroke dày. */
/* A3: cảnh báo boss — icon i-alert 2 bên + text (không emoji) */
function drawWarn(ctx, str, x, y) {
  var font = "900 44px " + FONT_UI;
  ctx.save();
  ctx.font = font; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  var w = ctx.measureText(str).width;
  if (window.HUDIcons) {
    HUDIcons.draw(ctx, "i-alert", 34, "#ff5d5d", x - w / 2 - 12 - 17, y);
    HUDIcons.draw(ctx, "i-alert", 34, "#ff5d5d", x + w / 2 + 12 + 17, y);
  }
  ctx.restore();
  drawText(ctx, str, x, y, font, "#ff5d5d", 1);
}
function drawText(ctx, str, x, y, font, fill, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha === undefined ? 1 : alpha;
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = fill;
  ctx.fillText(str, x, y);
  ctx.restore();
}

/* ================= canvas size cache ================= */
var _W = 960, _H = 600;
var _player = { x: 480, y: 300 }; // vị trí player gần nhất (cho loot magnet)

/* ================= WAVE BANNER / COUNTDOWN / WAVE CLEAR (§8) ================= */
var _banner = null;    // { kind, text, sub, age, resolve, dur }
var _countdown = null; // { idx, age, resolve }

/**
 * Banner "WAVE N": slide từ y=-70 xuống 32% chiều cao, 320ms easeOutBack;
 * hold 900ms; slide-out + fade 250ms easeInQuad. Sub-text fade delay 150ms.
 * opts.boss=true → sau banner chạy countdown "3·2·1" (mỗi số pop 400ms, #ff5d5d).
 * Reduced-motion: bỏ slide (fade 150ms tại chỗ).
 * @param {number} n số wave
 * @param {object} [opts] { sub, boss }
 * @returns {Promise<boolean>} resolve(true) khi banner (+countdown) xong
 */
function waveBanner(n, opts) {
  opts = opts || {};
  return new Promise(function (resolve) {
    try { if (_banner && _banner.resolve) _banner.resolve(false); } catch (e) {}
    _banner = { kind: "wave", text: "WAVE " + n, sub: opts.sub || I18N.t("juice.wave_default"),
      age: 0, resolve: resolve, boss: !!opts.boss };
  });
}

function _bannerPhase(b) {
  // in: 0–0.32 | hold: 0.32–1.22 | out: 1.22–1.47
  if (b.age < 0.32) return "in";
  if (b.age < 1.22) return "hold";
  return "out";
}

function updateBanner(dt) {
  if (_banner) {
    _banner.age += dt;
    var end = _banner.kind === "clear" ? _banner.dur : 1.47;
    if (_banner.age >= end) {
      var r = _banner.resolve;
      if (_banner.kind === "wave" && _banner.boss) {
        _banner = null;
        _countdown = { idx: 0, age: 0, resolve: r };
      } else {
        _banner = null;
        if (typeof r === "function") { try { r(true); } catch (e) {} }
      }
    }
  }
  if (_countdown) {
    _countdown.age += dt;
    if (_countdown.age >= 0.4) {
      _countdown.age = 0;
      _countdown.idx++;
      if (_countdown.idx >= 3) {
        var rr = _countdown.resolve;
        _countdown = null;
        if (typeof rr === "function") { try { rr(true); } catch (e) {} }
      }
    }
  }
}

function drawBanner(ctx) {
  var e = E(), rm = RM();
  if (_banner) {
    var b = _banner, yT = _H * 0.32, alpha = 1, y = yT, scale = 1;
    if (b.kind === "wave") {
      var ph = _bannerPhase(b);
      if (rm) {
        alpha = ph === "in" ? clamp(b.age / 0.15, 0, 1) : ph === "out" ? clamp(1 - (b.age - 1.22) / 0.15, 0, 1) : 1;
      } else if (ph === "in") {
        var k = e.easeOutBack(clamp(b.age / 0.32, 0, 1));
        y = -70 + (yT + 70) * k;
      } else if (ph === "out") {
        var ko = e.easeInQuad(clamp((b.age - 1.22) / 0.25, 0, 1));
        y = yT - (yT + 70) * ko;
        alpha = 1 - ko;
      }
      drawText(ctx, b.text, _W / 2, y, "900 64px " + FONT_UI + "", "#F2F7FF", alpha);
      if (b.sub && b.age > 0.15) {
        var sa = rm ? clamp((b.age - 0.15) / 0.12, 0, 1) : clamp((b.age - 0.15) / 0.25, 0, 1);
        if (ph === "out") sa *= alpha;
        drawText(ctx, b.sub, _W / 2, y + 52, "600 15px " + FONT_UI, "#9DB4D0", sa);
      }
    } else if (b.kind === "clear") {
      // "WAVE CLEAR": scale pop 1.2→1.0 + fade cuối
      var t = clamp(b.age / b.dur, 0, 1);
      scale = rm ? 1 : 1.2 - 0.2 * e.easeOutBack(clamp(b.age / 0.3, 0, 1));
      alpha = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(_W / 2, yT);
      ctx.scale(scale, scale);
      drawText(ctx, b.text, 0, 0, "900 54px " + FONT_UI, "#4ADE80", 1);
      ctx.restore();
    } else if (b.kind === "mini" || b.kind === "bossdown") {
      // banner mini (combo x50) / "BOSS BỊ HẠ!"
      var t2 = clamp(b.age / b.dur, 0, 1);
      var s2 = rm ? 1 : 1 + 0.2 * (1 - e.easeOutBack(clamp(b.age / 0.3, 0, 1)));
      var a2 = t2 > 0.65 ? 1 - (t2 - 0.65) / 0.35 : 1;
      var col = b.kind === "bossdown" ? "#FFE14D" : "#FFE14D";
      ctx.save();
      ctx.globalAlpha = a2;
      ctx.translate(_W / 2, b.kind === "bossdown" ? _H * 0.38 : _H * 0.2);
      ctx.scale(s2, s2);
      drawText(ctx, b.text, 0, 0, "900 " + (b.kind === "bossdown" ? "56px " : "34px ") + FONT_UI, col, 1);
      ctx.restore();
    }
  }
  if (_countdown) {
    var nums = ["3", "2", "1"];
    var ck = clamp(_countdown.age / 0.4, 0, 1);
    var cs = RM() ? 1 : 1.5 - 0.5 * E().easeOutBack(ck);
    ctx.save();
    ctx.globalAlpha = 1 - ck * 0.3;
    ctx.translate(_W / 2, _H * 0.42);
    ctx.scale(cs, cs);
    drawText(ctx, nums[_countdown.idx], 0, 0, "900 72px " + FONT_UI, "#ff5d5d", 1);
    ctx.restore();
  }
}

/**
 * Wave clear celebration (§8): slow-mo 0.3×/350ms + confetti 36 hạt +
 * banner "WAVE CLEAR" + floatText "+N Mảnh Kính" + sfx.fanfare() +
 * setMusicState('VICTORY'). Audio worker tự trả về COMBAT sau 3.5s.
 * @param {number} n số wave vừa clear (hiển thị trong text nếu cần)
 * @param {number} shards số Mảnh Kính thưởng
 * @param {Array} [patches] [{x,y}] vị trí vết gặm cần vá
 * @returns {Promise<boolean>}
 */
function waveClear(n, shards, patches) {
  jSlowMo(0.3, 350);
  spawnConfetti(36, true);
  jFloat(_player.x, _player.y - 46, I18N.t("juice.shard_float", { n: shards }), "#5dff8f", { size: 18 });
  sfx("fanfare");
  setMusic("VICTORY");
  (patches || []).forEach(function (p) { patch(p.x, p.y); });
  return new Promise(function (resolve) {
    try { if (_banner && _banner.resolve) _banner.resolve(false); } catch (e) {}
    _banner = { kind: "clear", text: "WAVE CLEAR", age: 0, dur: 1.6, resolve: resolve };
  });
}

/**
 * Vá cửa sổ tại vết chewer gặm: miếng vá scale-in 0→1, 200ms easeOutBack
 * + 4 sparkle #0080ff. Miếng vá tồn tại tới khi reset()/wave mới.
 */
function patch(x, y) {
  var p = P_PATCH.next();
  p.active = true; p.x = x; p.y = y; p.age = 0;
  spawnSparkle(x, y, "#0080ff", 4, 120, 0.5, 0);
}

function updatePatches(dt) {
  for (var i = 0; i < P_PATCH.n; i++) {
    var p = P_PATCH.items[i];
    if (p.active) p.age += dt;
  }
}

function drawPatches(ctx) {
  var e = E(), rm = RM();
  for (var i = 0; i < P_PATCH.n; i++) {
    var p = P_PATCH.items[i];
    if (!p.active) continue;
    var s = rm ? 1 : e.easeOutBack(clamp(p.age / 0.2, 0, 1));
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(Math.max(0.01, s), Math.max(0.01, s));
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = "#0080ff";
    ctx.lineWidth = 2;
    ctx.fillStyle = "rgba(0,128,255,0.18)";
    var w = 16, h = 11;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-w / 2, -h / 2, w, h, 3);
    else ctx.rect(-w / 2, -h / 2, w, h);
    ctx.fill(); ctx.stroke();
    // 2 đinh vít
    ctx.fillStyle = "#7DD3FC";
    ctx.beginPath(); ctx.arc(-w / 2 + 3, 0, 1.6, 0, TAU); ctx.arc(w / 2 - 3, 0, 1.6, 0, TAU); ctx.fill();
    ctx.restore();
  }
}

/* ================= UPGRADE DRAFT (§9) — DOM overlay =================
 * CHỌN DOM thay vì canvas: ít đụng game.js nhất — worker tích hợp chỉ cần
 * thay ruột openDraft() thành 1 dòng:
 *   Cinema.showDraft(upgrades, function (i) { applyUpgrade(i); }, { x: G.player.x, y: G.player.y });
 * upgrades: [{ icon, name, desc }] — icon là emoji hoặc chuỗi HTML/SVG an toàn
 * (worker tự escape; Cinema gán qua textContent cho name/desc, icon qua
 * innerHTML CHỈ khi bắt đầu bằng "<svg" — còn lại textContent).
 *
 * Sequence (§9): level-up burst tại player (18 hạt vàng + ring 50px) →
 * overlay dim rgba(2,6,18,.55) fade 150ms (KHÔNG blur) → panel scale .92→1
 * 260ms easeOutBack → card stagger 90ms, rise 24px → hover lift -6px +
 * scale 1.04 + viền #0080ff (CSS) → chọn: flash trắng 90ms + scale 1.12→1.0
 * → fade-out 180ms → Juice.draftOpen=false → onPick(i).
 * Phím 1/2/3 cũng chọn được. Không timeout (game đang pause).
 * Reduced-motion: bỏ stagger (fade 120ms cùng lúc), hover chỉ đổi viền,
 * bỏ flash selected.
 */
var _draft = null; // { ov, panel, cards, picked, onPick, keyH }

function _draftEl(tag, cls, parent) {
  var el = document.createElement(tag);
  if (cls) el.className = cls;
  if (parent) parent.appendChild(el);
  return el;
}

/* H1/B4: shatter vui nhộn khi cửa sổ vỡ — canvas riêng #fx-shatter.
 * 24 mảnh kính bo tròn (palette tươi sáng brand), vật lý cartoon (nảy tưng tưng),
 * 10 sparkle lấp lánh. Timeline 1.8s rồi dừng rAF. reduced-motion: không burst. */
var _shatterRAF = 0;
function shatterBurst(x, y) {
  var cv = document.getElementById("fx-shatter");
  if (!cv || !cv.getContext) return;
  var rm = false;
  try { rm = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch (e) {}
  if (rm) return;
  var W = window.innerWidth || 800, H = window.innerHeight || 600;
  if (typeof x !== "number") x = W / 2;
  if (typeof y !== "number") y = H / 2;
  cv.width = W; cv.height = H;
  var ctx = cv.getContext("2d");
  try {
    if (window.AudioEngine && AudioEngine.sfx) {
      if (typeof AudioEngine.sfx.boing === "function") AudioEngine.sfx.boing();
      if (typeof AudioEngine.sfx.crack === "function") AudioEngine.sfx.crack();
    }
  } catch (e2) {}
  var palette = ["#0080FF", "#7df9ff", "#bfe6ff", "#ffffff"];
  var shards = [];
  for (var i = 0; i < 24; i++) {
    var n = 3 + Math.floor(Math.random() * 3); // 3–5 đỉnh
    var size = 14 + Math.random() * 32; // 14–46px
    var pts = [];
    for (var k = 0; k < n; k++) {
      var a = (k / n) * Math.PI * 2 + Math.random() * 0.6;
      var rr = size * (0.55 + Math.random() * 0.45);
      pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
    }
    var va = Math.random() * Math.PI * 2, sp = 180 + Math.random() * 340; // 180–520 px/s
    shards.push({
      x: x, y: y, vx: Math.cos(va) * sp, vy: Math.sin(va) * sp - 120,
      rot: Math.random() * Math.PI * 2, vr: (Math.random() - 0.5) * 12, // ±6 rad/s
      pts: pts, c: palette[i % palette.length], bounces: 0
    });
  }
  var sparks = [];
  for (var s2 = 0; s2 < 10; s2++) {
    var sa = Math.random() * Math.PI * 2, ss = 30 + Math.random() * 60;
    sparks.push({ x: x, y: y, vx: Math.cos(sa) * ss, vy: Math.sin(sa) * ss,
      r: 5 + Math.random() * 6, ph: Math.random() * Math.PI * 2 });
  }
  var t0 = performance.now();
  function star4(c, px, py, r) {
    c.beginPath();
    c.moveTo(px, py - r); c.quadraticCurveTo(px, py, px + r, py);
    c.quadraticCurveTo(px, py, px, py + r); c.quadraticCurveTo(px, py, px - r, py);
    c.quadraticCurveTo(px, py, px, py - r); c.closePath(); c.fill();
  }
  function frame(now) {
    var t = (now - t0) / 1000;
    if (t > 1.8) { ctx.clearRect(0, 0, W, H); _shatterRAF = 0; return; }
    var dt = Math.min(0.05, 1 / 60);
    ctx.clearRect(0, 0, W, H);
    var fade = t < 1.1 ? 1 : 1 - (t - 1.1) / 0.7; // 1.1–1.8s alpha → 0
    // mảnh kính
    for (var i = 0; i < shards.length; i++) {
      var p = shards[i];
      p.vy += 900 * dt; // trọng lực
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      if (p.y > H - 8 && p.vy > 0 && p.bounces < 3) { // nảy tưng tưng ở đáy
        p.y = H - 8; p.vy *= -0.55; p.vx *= 0.8; p.bounces++;
      }
      ctx.save();
      ctx.globalAlpha = Math.max(0, fade);
      ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.beginPath();
      ctx.moveTo(p.pts[0][0], p.pts[0][1]);
      for (var k = 1; k < p.pts.length; k++) ctx.lineTo(p.pts[k][0], p.pts[k][1]);
      ctx.closePath();
      ctx.fillStyle = p.c; ctx.globalAlpha = Math.max(0, fade) * 0.9;
      ctx.fill();
      ctx.lineJoin = "round"; ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1.5;
      ctx.globalAlpha = Math.max(0, fade) * 0.7;
      ctx.stroke();
      ctx.restore();
    }
    // sparkle
    for (var s3 = 0; s3 < sparks.length; s3++) {
      var q = sparks[s3];
      q.x += q.vx * dt; q.y += q.vy * dt;
      ctx.save();
      ctx.globalAlpha = Math.max(0, fade) * (0.4 + 0.6 * Math.abs(Math.sin(t * 6 + q.ph))); // twinkle 0.4↔1
      ctx.fillStyle = "#fff7c2";
      star4(ctx, q.x, q.y, q.r);
      ctx.restore();
    }
    _shatterRAF = requestAnimationFrame(frame);
  }
  if (_shatterRAF) cancelAnimationFrame(_shatterRAF);
  _shatterRAF = requestAnimationFrame(frame);
}

function showDraft(upgrades, onPick, opts) {
  opts = opts || {};
  if (_draft || !document.body) return;
  if (typeof onPick !== "function") onPick = function () {};

  if (window.Juice) window.Juice.draftOpen = true; // hit-stop biết mà tránh

  // 1. level-up burst tại player (trước khi panel hiện)
  if (typeof opts.x === "number") {
    spawnSparkle(opts.x, opts.y || 0, "#ffd23f", 18, 220, 0.6, 0);
    jRing(opts.x, opts.y || 0, { r1: 50, durMs: 300, color: "#ffd23f", alpha: 0.6, ease: 1 });
  }

  var ov = _draftEl("div", "cin-draft-overlay");
  var panel = _draftEl("div", "cin-draft-panel", ov);
  var isPatch = (opts.theme || "patch") === "patch"; // H1/B3: reframe "VÁ CỬA SỔ" (mặc định cho mọi draft level-up)
  var title = _draftEl("div", "cin-draft-title", panel);
  title.textContent = I18N.t(isPatch ? "draft.patch_title" : "draft.cine_title");
  var sub = _draftEl("div", "cin-draft-sub", panel);
  sub.textContent = I18N.t(isPatch ? "draft.patch_sub" : "draft.pick_one");
  var cardsWrap = _draftEl("div", "cin-draft-cards", panel);
  var hint = _draftEl("div", "cin-draft-hint", panel);
  hint.textContent = I18N.t("draft.hint");

  var cards = [];
  (upgrades || []).slice(0, 3).forEach(function (u, i) {
    var card = _draftEl("button", "cin-card", cardsWrap);
    card.type = "button";
    card.setAttribute("aria-label", I18N.t(isPatch ? "draft.patch_aria" : "draft.aria", { name: u.name || ("#" + (i + 1)) }));
    card.setAttribute("aria-keyshortcuts", String(i + 1));
    if (isPatch) card.classList.add("is-patch");
    var ico = _draftEl("div", "cin-card-ico", card);
    if (isPatch) {
      // mảnh kính vá: icon i-shard xoay --rot mỗi card (0/140/250)
      ico.innerHTML = '<svg class="ic" aria-hidden="true"><use href="#i-shard"/></svg>';
      ico.style.setProperty("--rot", ["0deg", "140deg", "250deg"][i % 3]);
    }
    else if (typeof u.icon === "string" && /^\s*<svg/i.test(u.icon)) ico.innerHTML = u.icon;
    else ico.innerHTML = '<svg class="ic" aria-hidden="true"><use href="#i-sparkles"/></svg>';
    var nm = _draftEl("div", "cin-card-name", card);
    nm.textContent = u.name || I18N.t("draft.fallback_name", { n: i + 1 });
    var ds = _draftEl("div", "cin-card-desc", card);
    ds.innerHTML = u.desc || ""; // desc do dev viết, chứa SVG icon → cần parse HTML
    var key = _draftEl("div", "cin-card-key", card);
    key.textContent = String(i + 1);
    card.addEventListener("click", function () { _draftPick(i); });
    cards.push(card);
  });

  document.body.appendChild(ov);
  _draft = { ov: ov, panel: panel, cards: cards, picked: false, onPick: onPick, t0: performance.now(), isPatch: isPatch };

  // entrance animation (real-time rAF — không bị timescale ảnh hưởng)
  var t0 = _draft.t0;
  function entrance(now) {
    if (!_draft || _draft.ov !== ov) return;
    var t = (now - t0) / 1000, ee = E(), rmm = RM();
    ov.style.opacity = String(rmm ? clamp(t / 0.12, 0, 1) : clamp(t / 0.15, 0, 1));
    var pk = ee.easeOutBack(clamp(t / 0.26, 0, 1));
    panel.style.transform = "scale(" + (0.92 + 0.08 * pk).toFixed(4) + ")";
    panel.style.opacity = String(clamp(t / 0.2, 0, 1));
    for (var i = 0; i < cards.length; i++) {
      var ct = rmm ? t : t - i * 0.09;
      var ck = clamp(ct / 0.22, 0, 1);
      cards[i].style.opacity = String(ck);
      cards[i].style.transform = "translateY(" + ((1 - ee.easeOutCubic(ck)) * 24).toFixed(2) + "px)";
    }
    if (t < (rmm ? 0.15 : 0.09 * (cards.length - 1) + 0.25)) {
      requestAnimationFrame(entrance);
    } else {
      for (var j = 0; j < cards.length; j++) { cards[j].style.opacity = "1"; cards[j].style.transform = ""; }
      panel.style.transform = "";
    }
  }
  requestAnimationFrame(entrance);

  function keyH(ev) {
    if (!_draft || _draft.picked) return;
    if (ev.key === "1" || ev.key === "2" || ev.key === "3") {
      var i = +ev.key - 1;
      if (i < cards.length) _draftPick(i);
    }
  }
  _draft.keyH = keyH;
  document.addEventListener("keydown", keyH);
  sfx("ui_click"); // xác nhận panel đã mở (nhẹ)
}

function _draftPick(i) {
  var d = _draft;
  if (!d || d.picked) return;
  d.picked = true;
  document.removeEventListener("keydown", d.keyH);
  var rm = RM(), e = E(), card = d.cards[i], t0 = performance.now();
  sfx("ui_click");
  if (rm) {
    _draftClose(i);
    return;
  }
  // selected: flash trắng 90ms + scale 1.12→1.0 (160ms easeOutBack)
  card.classList.add("cin-selected");
  if (d.isPatch && !rm) {
    // H1/B3: mảnh vá bay từ icon card tới mép viewport gần nhất + seal-flash ring
    try {
      var icoEl = card.querySelector(".cin-card-ico") || card;
      var cr = icoEl.getBoundingClientRect();
      var sx = cr.left + cr.width / 2, sy = cr.top + cr.height / 2;
      var sh = document.createElement("div");
      sh.className = "fly-shard";
      sh.setAttribute("aria-hidden", "true");
      sh.innerHTML = '<svg class="ic" aria-hidden="true"><use href="#i-shard"/></svg>';
      sh.style.left = Math.round(sx) + "px";
      sh.style.top = Math.round(sy) + "px";
      document.body.appendChild(sh);
      // điểm đích = điểm trên mép viewport gần nhất theo hướng tâm viewport → tâm card
      var vx = window.innerWidth, vy = window.innerHeight;
      var ddx = sx - vx / 2, ddy = sy - vy / 2;
      var tx, ty;
      if (Math.abs(ddx) / vx > Math.abs(ddy) / vy) { tx = ddx > 0 ? vx : 0; ty = sy; }
      else { tx = sx; ty = ddy > 0 ? vy : 0; }
      var fdx = Math.round(tx - sx), fdy = Math.round(ty - sy);
      var sealTx = tx, sealTy = ty, done = false;
      var anim = null;
      try {
        anim = sh.animate(
          [{ transform: "translate(0,0) scale(1) rotate(0deg)", opacity: 1 },
           { transform: "translate(" + fdx + "px," + fdy + "px) scale(0.3) rotate(50deg)", opacity: 0.9 }],
          { duration: 480, easing: "cubic-bezier(0.3,0.7,0.25,1)" });
      } catch (e5) {}
      var finish = function () {
        if (done) return; done = true;
        try { if (sh.parentNode) sh.parentNode.removeChild(sh); } catch (e6) {}
        // seal-flash: vòng ring tại điểm đích
        var fl = document.createElement("div");
        fl.className = "seal-flash";
        fl.setAttribute("aria-hidden", "true");
        fl.style.left = Math.round(sealTx) + "px";
        fl.style.top = Math.round(sealTy) + "px";
        document.body.appendChild(fl);
        setTimeout(function () { try { if (fl.parentNode) fl.parentNode.removeChild(fl); } catch (e7) {} }, 380);
        try {
          if (window.AudioEngine && AudioEngine.sfx && typeof AudioEngine.sfx.boing === "function") AudioEngine.sfx.boing();
          else sfx("ui_click");
        } catch (e8) {}
      };
      if (anim && anim.onfinish !== undefined) anim.onfinish = finish;
      setTimeout(finish, 620); // fallback nếu WAAPI không kích hoạt onfinish
    } catch (e4) {}
  }
  function sel(now) {
    if (!_draft) return;
    var t = (now - t0) / 1000;
    var k = e.easeOutBack(clamp(t / 0.16, 0, 1));
    var s = 1.12 - 0.12 * k;
    card.style.transform = "scale(" + s.toFixed(4) + ")";
    if (t < 0.16) requestAnimationFrame(sel);
    else {
      // fade-out 180ms → resume game
      var t1 = performance.now();
      (function fade(n2) {
        if (!_draft) return;
        var tt = (n2 - t1) / 1000;
        d.ov.style.opacity = String(1 - clamp(tt / 0.18, 0, 1));
        if (tt < 0.18) requestAnimationFrame(fade);
        else _draftClose(i);
      })(t1);
    }
  }
  requestAnimationFrame(sel);
}

function _draftClose(i) {
  var d = _draft;
  if (!d) return;
  _draft = null;
  try { if (d.ov.parentNode) d.ov.parentNode.removeChild(d.ov); } catch (e) {}
  if (window.Juice) window.Juice.draftOpen = false;
  try { d.onPick(i); } catch (err) {}
}

/* ================= COMBO SYSTEM (§12) =================
 * Worker gọi Cinema.combo(n) mỗi khi combo tăng, Cinema.comboLost() khi mất.
 * Counter pop 1.3→1.0 130ms easeOutBack; trắng → vàng từ x20; decay bar 3s
 * linear, <1s pulse đỏ 4Hz. Milestone:
 * x10: pop 1.5 + 10 hạt vàng · x25: ring 60px + hitStop 40ms +
 *      sfx.combo_milestone(25) · x50: banner mini + confetti 20 + shake 4px ·
 * x100: slowMo 0.4×/400ms + shake 6px + flash viền vàng.
 * Mất combo: fade + scale→0.8 200ms + text "Combo mất!" xám.
 * Reduced-motion: pop còn 1.1, bỏ confetti milestone, bỏ slow-mo x100. */
var _combo = { n: 0, lastT: -99, popAge: 9, active: false, lostAge: 9, lost: false };
var COMBO_X = 0.5, COMBO_Y = 64; // vị trí counter (tỉ lệ W / px)

function combo(n) {
  n = Math.max(0, Math.round(n));
  var rm = RM();
  _combo.n = n;
  _combo.lastT = _now;
  _combo.popAge = 0;
  _combo.active = n > 0;
  _combo.lost = false;
  _combo.lostAge = 9;
  if (n <= 0) return;
  var cx = _W * COMBO_X, cy = COMBO_Y;
  if (n === 10) {
    _combo.popAmp = 0.5;
    if (!rm) spawnSparkle(cx, cy, "#ffd23f", 10, 180, 0.5, 0);
  } else if (n === 25) {
    _combo.popAmp = 0.5;
    jRing(cx, cy, { r1: 60, durMs: 350, color: "#ffd23f", alpha: 0.7, ease: 1 });
    jHitStop(25); // TUNING 2026-10-02: 40→25, mượt hơn
    sfx("combo_milestone", 25);
  } else if (n === 50) {
    _combo.popAmp = 0.5;
    try { if (_banner && _banner.resolve) _banner.resolve(false); } catch (e) {}
    _banner = { kind: "mini", text: "COMBO x50!!", age: 0, dur: 0.6, resolve: null };
    spawnConfetti(20, false, cx, cy);
    jShake(4, 200, 2);
    sfx("combo_milestone", 50);
  } else if (n === 100) {
    _combo.popAmp = 0.5;
    jSlowMo(0.4, 400);
    jShake(6, 300, 4);
    _goldEdge = { age: 0, dur: 0.15 };
    sfx("combo_milestone", 100);
  } else {
    _combo.popAmp = rm ? 0.1 : 0.3;
  }
}
_combo.popAmp = 0.3;

function comboLost() {
  if (!_combo.active && _combo.lost) return;
  _combo.active = false;
  _combo.lost = true;
  _combo.lostAge = 0;
}

function updateCombo(dt) {
  _combo.popAge += dt;
  _combo.lostAge += dt;
  // tự mất combo khi quá 3s không tăng (game cũng có thể gọi comboLost trực tiếp)
  if (_combo.active && _now - _combo.lastT > 3) comboLost();
}

function drawCombo(ctx) {
  var e = E(), rm = RM();
  // trạng thái "mất combo": fade + scale→0.8 trong 200ms + text xám
  if (_combo.lost && _combo.lostAge < 0.9) {
    var lt = clamp(_combo.lostAge / 0.2, 0, 1);
    var la = 1 - lt;
    ctx.save();
    ctx.globalAlpha = la * 0.8;
    ctx.translate(_W * COMBO_X, COMBO_Y + 34);
    ctx.scale(1 - 0.2 * lt, 1 - 0.2 * lt);
    drawText(ctx, I18N.t("juice.combo_lost"), 0, 0, "600 12px " + FONT_UI, "#9DB4D0", 1);
    ctx.restore();
    return;
  }
  if (!_combo.active || _combo.n <= 0) return;
  var cx = _W * COMBO_X, cy = COMBO_Y;
  var pk = clamp(_combo.popAge / 0.13, 0, 1);
  var sc = 1 + (_combo.popAmp || 0.3) * (1 - e.easeOutBack(pk));
  var gold = _combo.n >= 20;
  var col = gold ? "#FFE14D" : "#ffffff";

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(sc, sc);
  if (gold) {
    // gradient vàng (§12: "chuyển gradient vàng từ x20") — 1 gradient/frame, rẻ
    var g = ctx.createLinearGradient(0, -16, 0, 16);
    g.addColorStop(0, "#FFF7AE");
    g.addColorStop(1, "#FFB020");
    drawText(ctx, "x" + _combo.n, 0, 0, "800 30px " + FONT_NUM, g, 1);
  } else {
    drawText(ctx, "x" + _combo.n, 0, 0, "800 26px " + FONT_NUM, col, 1);
  }
  ctx.restore();

  // decay bar 3s linear; <1s pulse đỏ 4Hz
  var remain = 3 - (_now - _combo.lastT);
  if (remain > 0) {
    var bw = 120, bh = 4, bx = cx - bw / 2, by = cy + 24;
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.14)";
    ctx.fillRect(bx, by, bw, bh);
    var urgent = remain < 1;
    var pulse = urgent && !rm ? 0.55 + 0.45 * Math.sin(_now * TAU * 4) : 1;
    ctx.globalAlpha = pulse;
    ctx.fillStyle = urgent ? "#ff5d5d" : "#FFE14D";
    ctx.fillRect(bx, by, bw * clamp(remain / 3, 0, 1), bh);
    ctx.restore();
  }
}

/* flash viền vàng (combo x100) — vẽ trong drawFront */
var _goldEdge = null;
function drawGoldEdge(ctx) {
  if (!_goldEdge) return;
  var t = clamp(_goldEdge.age / _goldEdge.dur, 0, 1);
  ctx.save();
  ctx.globalAlpha = 0.15 * (1 - t);
  ctx.strokeStyle = "#FFE14D";
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, _W - 10, _H - 10);
  ctx.restore();
  if (t >= 1) _goldEdge = null;
}

/* ================= BOSS CINEMATIC (§13) =================
 * Tích hợp: worker PAUSE gameplay (không update, vẫn render + Cinema.update)
 * trong lúc await promise. Ví dụ:
 *   G.cinePause = true; setMusicState('BOSS');
 *   await Cinema.bossIntro(boss, "KẺ GẶM CỬA SỔ", "Trùm cuối · Wave 10",
 *                          { drawBoss: function (ctx, x, y, scale, alpha) { ... } });
 *   G.cinePause = false;
 * boss bất động 500ms sau intro (đã tính trong promise) rồi worker mới cho
 * boss active. BOSS_STUN_MS export để worker dùng nếu tự quản lý. */
var BOSS_STUN_MS = 500;
var _bossCine = null; // { kind:'intro'|'death', age, bx, by, br, name, title, drawBoss, resolve }
var _phaseFlash = null; // { x, y, r, age }
var _whiteFlash = null; // { age, dur, alpha }
var _sweep = null;      // { age, dur }

/**
 * Intro ~2.4s (+500ms stun): dim 0.65/400ms → "⚠ CẢNH BÁO ⚠" blink 3×/900ms →
 * tên slide-in 350ms → portal xoáy 700ms + 20 hạt → boss scale-in 300ms +
 * roar (shake 6px/300ms + sfx.boss_roar() + sweep) → fade-out 300ms →
 * resolve (boss bất động thêm 500ms đã tính bên trong).
 * Reduced-motion: bỏ blink (banner tĩnh 600ms), bỏ arc xoay.
 */
function bossIntro(boss, name, title, opts) {
  opts = opts || {};
  if (_lock) return Promise.resolve(false);
  _lock = true;
  setMusic("BOSS");
  return new Promise(function (resolve) {
    _bossCine = { kind: "intro", age: 0, bx: boss.x, by: boss.y, br: boss.r || 60,
      name: String(name || "BOSS"), title: String(title || ""),
      drawBoss: opts.drawBoss || null,
      resolve: function () { _lock = false; _bossCine = null; resolve(true); } };
  });
}

/**
 * Phase transition (mỗi 25% HP): hitStop 70ms → đạn địch thành hạt
 * (opts.clearBullets) → shockwave 120px/400ms + sfx.phase_shift() →
 * boss flash 150ms → đổi palette (opts.onPalette(n), game-side) →
 * floatText "PHASE n".
 * Reduced-motion: bỏ hit-stop (giữ clear đạn + text).
 */
function bossPhase(n, opts) {
  opts = opts || {};
  if (!RM()) jHitStop(45); // TUNING 2026-10-02: 70→45, mượt hơn
  if (typeof opts.clearBullets === "function") { try { opts.clearBullets(); } catch (e) {} }
  var bx = opts.x, by = opts.y, br = opts.r || 60;
  jRing(bx, by, { r1: 120, durMs: 400, color: "#ffffff", alpha: 0.6, ease: 2 });
  sfx("phase_shift");
  _phaseFlash = { x: bx, y: by, r: br, age: 0 };
  jFloat(bx, by - br - 24, "PHASE " + n, "#c084fc", { size: 22, lifeMs: 1400 });
  if (typeof opts.onPalette === "function") { try { opts.onPalette(n); } catch (e) {} }
}

/**
 * Death cinematic ~2s (game pause): slowMo 0.25×/700ms → hitStop 90ms
 * (exempt) → shake 12px/700ms + flash trắng 0.25/120ms → particle storm
 * (Juice.burst boss: 90 hạt 3 đợt + 24 shard + 2 shockwave) → boss scale
 * 1→1.3 (200ms) rồi implode →0 (250ms) → banner "BOSS BỊ HẠ!" + loot burst
 * magnet về player.
 * Hero hạng 3: nếu đã có 3 hero moments → giáng cấp (bỏ slow-mo/shake mạnh).
 * Reduced-motion: bỏ slow-mo/shake (fade + burst ít hạt — Juice tự xử).
 */
function bossDeath(boss, opts) {
  opts = opts || {};
  if (_lock) return Promise.resolve(false);
  _lock = true;
  var full = _heroFull(3);
  _heroStart(3);
  var bx = boss.x, by = boss.y, br = boss.r || 60;
  if (full) {
    jHitStop(70, { exempt: true }); // TUNING 2026-10-02: 90→70, giữ punch cho boss chết
    jSlowMo(0.25, 700);
  }
  jShake(full ? 12 : 4, 700, 10);
  _whiteFlash = { age: 0, dur: 0.12, alpha: full ? 0.25 : 0.12 };
  jBurst("boss", bx, by, {});
  bossRingShatter(bx, by);
  sfx("explosion");
  sfx("downlifter");
  return new Promise(function (resolve) {
    _bossCine = { kind: "death", age: 0, bx: bx, by: by, br: br,
      drawBoss: opts.drawBoss || null,
      px: opts.player ? opts.player.x : _player.x,
      py: opts.player ? opts.player.y : _player.y,
      looted: false,
      resolve: function () { _lock = false; _bossCine = null; resolve(true); } };
  });
}

/** Arena ring vỡ thành 24 mảnh khi boss chết (§5.1.C). */
function bossRingShatter(bx, by) {
  var r = Math.min(_W, _H) * 0.35;
  for (var i = 0; i < 24; i++) {
    var s = P_SHD.next();
    var a = (i / 24) * TAU;
    s.active = true;
    s.x = (bx === undefined ? _W / 2 : bx) + Math.cos(a) * r;
    s.y = (by === undefined ? _H / 2 : by) + Math.sin(a) * r;
    var sp = rand(80, 240), oa = a + rand(-0.4, 0.4);
    s.vx = Math.cos(oa) * sp; s.vy = Math.sin(oa) * sp;
    s.age = 0; s.life = rand(0.6, 1.0); s.rot = rand(0, TAU);
  }
  _bg.mode = _bg.mode === "boss" ? "normal" : _bg.mode; // về normal sau khi ring vỡ
}

function updateBossCine(dt) {
  if (_phaseFlash) { _phaseFlash.age += dt; if (_phaseFlash.age > 0.15) _phaseFlash = null; }
  if (_whiteFlash) { _whiteFlash.age += dt; if (_whiteFlash.age > _whiteFlash.dur) _whiteFlash = null; }
  if (_sweep) { _sweep.age += dt; if (_sweep.age > _sweep.dur) _sweep = null; }
  if (_goldEdge) _goldEdge.age += dt;
  var c = _bossCine;
  if (!c) return;
  c.age += dt;
  if (c.kind === "intro") {
    // portal particles: 20 hạt hút vào trong 700ms (1.3–2.0s)
    if (!c.portaled && c.age >= 1.3) {
      c.portaled = true;
      if (!RM()) {
        for (var i = 0; i < 20; i++) {
          var a = rand(0, TAU), rr = rand(50, 110);
          spawnSparkle(c.bx + Math.cos(a) * rr, c.by + Math.sin(a) * rr, "#c084fc", 1, 0, 0.7, 0);
          var s = P_SPK.items[(P_SPK.cursor + P_SPK.n - 1) % P_SPK.n];
          // hút vào tâm: vận tốc hướng tâm
          s.vx = -Math.cos(a) * (rr / 0.7); s.vy = -Math.sin(a) * (rr / 0.7);
        }
      }
    }
    // roar tại 2.0s
    if (!c.roared && c.age >= 2.0) {
      c.roared = true;
      jShake(6, 300, 10);
      sfx("boss_roar");
      _sweep = { age: 0, dur: 0.5 };
    }
    if (c.age >= 3.1) c.resolve(); // 2.6 fade-out + 0.5 stun
  } else if (c.kind === "death") {
    // loot burst magnet tại 0.45s (sau implode)
    if (!c.looted && c.age >= 0.45) {
      c.looted = true;
      _banner = { kind: "bossdown", text: I18N.t("juice.boss_down"), age: 0, dur: 1.8, resolve: null };
      var cols = ["#38BDF8", "#FFE14D", "#5dff8f"];
      for (var j = 0; j < 12; j++) {
        var m = P_MGEM.next();
        m.active = true;
        m.sx = c.bx + rand(-40, 40); m.sy = c.by + rand(-40, 40);
        m.x = m.sx; m.y = m.sy;
        m.tx = c.px; m.ty = c.py;
        m.age = -j * 0.03; // stagger nhẹ
        m.life = 0.8;
        m.color = cols[j % 3]; m.size = rand(5, 8);
      }
      jFloat(c.px, c.py - 50, I18N.t("juice.shard_float2"), "#5dff8f", { size: 16 });
      sfx("fanfare");
    }
    if (c.age >= 2.0) c.resolve();
  }
}

/** Vẽ boss placeholder theo shape-language §3 style-guide (khi worker không
 *  truyền drawBoss): thập nhị giác #FF5F57 + lõi sọ trừu tượng. */
function drawBossPlaceholder(ctx, x, y, r, scale, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.scale(Math.max(0.01, scale), Math.max(0.01, scale));
  var g = ctx.createRadialGradient(0, 0, r * 0.1, 0, 0, r);
  g.addColorStop(0, "#FF8F8F"); g.addColorStop(1, "#FF5F57");
  ctx.fillStyle = g;
  ctx.strokeStyle = "#FF2D2D"; ctx.lineWidth = 4;
  ctx.beginPath();
  for (var i = 0; i < 12; i++) {
    var a = (i / 12) * TAU;
    var px = Math.cos(a) * r, py = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // lõi sọ: 2 hốc mắt + rãnh miệng
  ctx.fillStyle = "#FFFFFF";
  ctx.beginPath(); ctx.arc(-r * 0.28, -r * 0.1, r * 0.14, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(r * 0.28, -r * 0.1, r * 0.14, 0, TAU); ctx.fill();
  ctx.strokeStyle = "#FFFFFF"; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(0, r * 0.25, r * 0.3, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
  ctx.restore();
}

function drawBossCine(ctx) {
  var c = _bossCine, e = E(), rm = RM();
  if (!c) {
    // phase flash (không cần _bossCine)
    if (_phaseFlash) {
      var pf = _phaseFlash, pk = clamp(pf.age / 0.15, 0, 1);
      ctx.save();
      ctx.globalAlpha = (rm ? 0.25 : 0.6) * (1 - pk);
      ctx.fillStyle = "#ffffff";
      ctx.beginPath(); ctx.arc(pf.x, pf.y, pf.r, 0, TAU); ctx.fill();
      ctx.restore();
    }
    return;
  }
  var t = c.age;
  if (c.kind === "intro") {
    // 1. dim → 0.65 trong 400ms; fade-out 2.3–2.6s
    var dim = t < 0.4 ? 0.65 * e.easeOutQuad(clamp(t / 0.4, 0, 1))
            : t < 2.3 ? 0.65
            : 0.65 * (1 - clamp((t - 2.3) / 0.3, 0, 1));
    if (dim > 0.01) {
      ctx.save(); ctx.globalAlpha = dim; ctx.fillStyle = "#020610"; ctx.fillRect(0, 0, _W, _H); ctx.restore();
    }
    // 2. "⚠ CẢNH BÁO ⚠" blink 3× trong 900ms (0.4–1.3s)
    if (t > 0.4 && t < 1.3) {
      var bt = (t - 0.4) / 0.9;
      var on = rm ? true : (Math.sin(bt * Math.PI * 6) > 0);
      if (on) drawWarn(ctx, I18N.t("juice.warn"), _W / 2, _H * 0.3);
    } else if (rm && t >= 0.4 && t < 1.0) {
      drawWarn(ctx, I18N.t("juice.warn"), _W / 2, _H * 0.3);
    }
    // 3. tên boss slide-in từ trái 350ms easeOutBack (0.9–1.25s)
    if (t > 0.9) {
      var nk = rm ? 1 : e.easeOutBack(clamp((t - 0.9) / 0.35, 0, 1));
      var nx = rm ? _W / 2 : lerp(-_W * 0.3, _W / 2, nk);
      var na = t > 2.3 ? 1 - clamp((t - 2.3) / 0.3, 0, 1) : 1;
      drawText(ctx, c.name, nx, _H * 0.42, "800 40px " + FONT_UI, "#FF8F8F", na);
      if (c.title) drawText(ctx, c.title, nx, _H * 0.42 + 36, "600 15px " + FONT_UI, "#9DB4D0", na);
    }
    // 4. portal xoáy 700ms (1.3–2.0s): 2 arc xoay ngược
    if (t > 1.3 && t < 2.0 && !rm) {
      var pa = (t - 1.3) / 0.7, pr = 60 * (1 - pa * 0.3);
      ctx.save();
      ctx.globalAlpha = 0.85 * (1 - pa * 0.3);
      ctx.strokeStyle = "#c084fc"; ctx.lineWidth = 4;
      var a1 = _now * 9, a2 = -_now * 7;
      ctx.beginPath(); ctx.arc(c.bx, c.by, pr, a1, a1 + Math.PI * 1.3); ctx.stroke();
      ctx.beginPath(); ctx.arc(c.bx, c.by, pr * 0.65, a2, a2 + Math.PI * 1.3); ctx.stroke();
      ctx.restore();
    }
    // 5. boss scale-in 0→1 300ms easeOutBack (2.0–2.3s)
    if (t > 2.0) {
      var sk = rm ? 1 : e.easeOutBack(clamp((t - 2.0) / 0.3, 0, 1));
      var sa2 = t > 2.3 ? 1 - clamp((t - 2.3) / 0.3, 0, 1) : 1;
      if (c.drawBoss) { try { c.drawBoss(ctx, c.bx, c.by, Math.max(0.01, sk), sa2); } catch (err) {} }
      else drawBossPlaceholder(ctx, c.bx, c.by, c.br, Math.max(0.01, sk), sa2);
    }
    // sweep sáng sau roar
    if (_sweep) {
      var sw = clamp(_sweep.age / _sweep.dur, 0, 1);
      var sx = lerp(-_W * 0.2, _W * 1.2, e.easeOutCubic(sw));
      var grad = ctx.createLinearGradient(sx - 60, 0, sx + 60, 0);
      grad.addColorStop(0, "rgba(125,211,252,0)");
      grad.addColorStop(0.5, "rgba(125,211,252," + (0.35 * (1 - sw)).toFixed(3) + ")");
      grad.addColorStop(1, "rgba(125,211,252,0)");
      ctx.save(); ctx.fillStyle = grad; ctx.fillRect(0, 0, _W, _H); ctx.restore();
    }
  } else if (c.kind === "death") {
    // boss scale 1→1.3 (200ms easeIn) rồi implode →0 (250ms)
    var ds;
    if (t < 0.2) ds = 1 + 0.3 * e.easeInQuad(t / 0.2);
    else if (t < 0.45) ds = 1.3 * (1 - e.easeInQuad((t - 0.2) / 0.25));
    else ds = 0;
    if (ds > 0.01) {
      if (c.drawBoss) { try { c.drawBoss(ctx, c.bx, c.by, ds, 1); } catch (err2) {} }
      else drawBossPlaceholder(ctx, c.bx, c.by, c.br, ds, 1);
    }
  }
  // phase flash vẽ đè khi có
  if (_phaseFlash) {
    var q = _phaseFlash, qk = clamp(q.age / 0.15, 0, 1);
    ctx.save();
    ctx.globalAlpha = (rm ? 0.25 : 0.6) * (1 - qk);
    ctx.fillStyle = "#ffffff";
    ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, TAU); ctx.fill();
    ctx.restore();
  }
  // flash trắng toàn màn (boss death)
  if (_whiteFlash) {
    var wf = _whiteFlash, wk = clamp(wf.age / wf.dur, 0, 1);
    ctx.save();
    ctx.globalAlpha = wf.alpha * (1 - wk);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, _W, _H);
    ctx.restore();
  }
}

/* ================= PLAYER FX — trail / dash / shield / heartbeat (§7) =================
 * Worker truyền info vào Cinema.update(rawDt, info):
 *   info.player = { x, y, vx, vy, speed, rot, hp, maxHp, shieldT }
 * - Trail: speed > 180px/s → pushGhost mỗi 40ms (Juice pool 12, fade 220ms).
 *   Worker tự gọi Juice.drawGhosts(ctx, drawPlayerGhost) trong render.
 * - Dash: Cinema.dashFx(x, y, dx, dy) — 4 afterimage cách 30ms + 8 speedline.
 * - Shield: shieldT > 0 → vòng #4dd8ff alpha 0.3, pulse 1.4s easeInOutSine.
 *   Cinema.shieldBlock(x, y): flash 0.8/120ms + 6 spark cyan + shake 2px.
 * - Low-HP: hp/maxHp < 0.3 → heartbeat vignette (chỉ viền) 900ms @30% /
 *   600ms @15% + sfx.heartbeat() 1.2Hz đồng bộ.
 * Reduced-motion: bỏ ghost trail, heartbeat → viền đỏ tĩnh alpha 0.25. */
var _trailAcc = 0;
var _hbAcc = 0;
var _shieldFlash = null; // { x, y, age }
var _dashGhosts = [];    // { x, y, at } — afterimage đặt lịch

function playerFx(dt, p) {
  if (!p) return;
  _player.x = p.x; _player.y = p.y;
  var rm = RM();
  // trail: REMOVED (2026-10-01) — user feedback: ghost trail gây đau mắt
  _trailAcc = 0;
  // dash afterimage đặt lịch
  for (var i = _dashGhosts.length - 1; i >= 0; i--) {
    if (_now >= _dashGhosts[i].at) {
      var d = _dashGhosts[i];
      _dashGhosts.splice(i, 1);
      jGhost(d.x, d.y, { rot: d.rot, scale: 0.95, color: "#9DF3FF", alpha: 0.4, lifeMs: 200 });
    }
  }
  if (_shieldFlash) { _shieldFlash.age += dt; if (_shieldFlash.age > 0.12) _shieldFlash = null; }
  // heartbeat sfx 1.2Hz khi low-HP
  var frac = p.maxHp > 0 ? p.hp / p.maxHp : 1;
  if (frac < 0.3 && p.hp > 0) {
    _hbAcc += dt;
    if (_hbAcc >= 1 / 1.2) { _hbAcc = 0; sfx("heartbeat"); }
  } else _hbAcc = 0;
}

/**
 * Dash: 4 afterimage cách nhau 30ms dọc đường dash + 8 speedline trắng
 * (alpha 0.4, dài 30–60px theo hướng dash, life 150ms).
 */
function dashFx(x, y, dx, dy) {
  var len = Math.sqrt(dx * dx + dy * dy) || 1;
  var nx = dx / len, ny = dy / len, rot = Math.atan2(ny, nx);
  var rm = RM();
  if (rm) {
    // bản tĩnh: 1 vệt mờ
    var s0 = P_SPD.next();
    s0.active = true; s0.x = x; s0.y = y; s0.dx = nx; s0.dy = ny;
    s0.len = 60; s0.age = 0; s0.life = 0.25;
    return;
  }
  for (var i = 0; i < 4; i++) {
    _dashGhosts.push({ x: x - nx * i * 14, y: y - ny * i * 14, rot: rot, at: _now + i * 0.03 });
  }
  for (var j = 0; j < 8; j++) {
    var s = P_SPD.next();
    var off = rand(-24, 24);
    s.active = true;
    s.x = x - nx * rand(0, 30) - ny * off;
    s.y = y - ny * rand(0, 30) + nx * off;
    s.dx = nx; s.dy = ny; s.len = rand(30, 60);
    s.age = 0; s.life = 0.15;
  }
}

/** Shield đỡ đòn: ring flash alpha 0.8/120ms + 6 spark cyan + shake 2px/100ms. */
function shieldBlock(x, y) {
  _shieldFlash = { x: x, y: y, age: 0 };
  spawnSparkle(x, y, "#7DD3FC", 6, 200, 0.4, 0);
  jShake(2, 100, 1);
  sfx("hitstop_thump");
}

function drawPlayerFx(ctx, p) {
  if (!p) return;
  var e = E(), rm = RM();
  // shield ring: pulse scale 1.0↔1.06 chu kỳ 1.4s easeInOutSine
  if (p.shieldT > 0) {
    var ph = (Math.sin(_now * TAU / 1.4) + 1) / 2;
    var sc = 1 + 0.06 * ph, r = (p.r || 17) + 8;
    ctx.save();
    ctx.globalAlpha = 0.3 + (rm ? 0 : 0.08 * Math.sin(_now * TAU / 1.4));
    ctx.strokeStyle = "#4dd8ff";
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(p.x, p.y, r * sc, 0, TAU); ctx.stroke();
    ctx.restore();
  }
  if (_shieldFlash) {
    var fk = clamp(_shieldFlash.age / 0.12, 0, 1);
    ctx.save();
    ctx.globalAlpha = 0.8 * (1 - fk);
    ctx.strokeStyle = "#4dd8ff";
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(_shieldFlash.x, _shieldFlash.y, (p.r || 17) + 10 + fk * 14, 0, TAU); ctx.stroke();
    ctx.restore();
  }
  // low-HP heartbeat vignette — CHỈ VIỀN, không che center
  var frac = p.maxHp > 0 ? p.hp / p.maxHp : 1;
  if (frac < 0.3 && p.hp > 0) {
    var cyc = frac < 0.15 ? 0.6 : 0.9;
    var a;
    if (rm) { a = 0.25; }
    else {
      var tt = ((_now % cyc) / cyc) * 900; // pattern chuẩn 900ms
      a = tt < 120 ? 0.45 * (tt / 120)
        : tt < 220 ? 0.45 - 0.3 * ((tt - 120) / 100)
        : tt < 340 ? 0.15 + 0.35 * ((tt - 220) / 120)
        : tt < 640 ? 0.5 * (1 - (tt - 340) / 300)
        : 0;
    }
    if (a > 0.01) {
      var R = Math.max(_W, _H) * 0.75;
      var g = ctx.createRadialGradient(_W / 2, _H / 2, R * 0.55, _W / 2, _H / 2, R);
      g.addColorStop(0, "rgba(255,45,45,0)");
      g.addColorStop(1, "rgba(255,45,45," + (a * 0.9).toFixed(3) + ")");
      ctx.save();
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, _W, _H);
      ctx.restore();
    }
  }
}

/* ================= SATELLITE PORTAL (§11) =================
 * Cinema.satPortal(x, y, dir) → Promise: 2 arc tím xoay ngược 350ms →
 * icon quái bay vào 300ms → resolve (rồi game gọi Juice.spawnWarning 400ms).
 * Cooldown 500ms giữa 2 portal. Cinema.satClose(x, y): implode 150ms +
 * 8 hạt tím #c084fc.
 * satellite.html: overlay tím #7c3aed alpha 0.25 fade-in 200ms + logo pulse
 * khi mở (sửa trong file satellite.html).
 * Reduced-motion: bỏ arc xoay (portal tĩnh fade 150ms), bỏ icon bay. */
var _satPortals = []; // { x, y, dx, dy, age, resolve }
var _satCloses = [];  // { x, y, age }
var _lastPortal = -99;

function satPortal(x, y, dir) {
  if (_now - _lastPortal < 0.5) return Promise.resolve(false);
  _lastPortal = _now;
  dir = dir || { x: 0, y: 1 };
  var len = Math.sqrt(dir.x * dir.x + dir.y * dir.y) || 1;
  return new Promise(function (resolve) {
    _satPortals.push({ x: x, y: y, dx: dir.x / len, dy: dir.y / len, age: 0, resolve: resolve });
  });
}

function satClose(x, y) {
  spawnSparkle(x, y, "#c084fc", 8, 140, 0.4, 0);
  _satCloses.push({ x: x, y: y, age: 0 });
}

function updateSat(dt) {
  var i, s;
  for (i = _satPortals.length - 1; i >= 0; i--) {
    s = _satPortals[i];
    s.age += dt;
    var total = RM() ? 0.15 : 0.65;
    if (s.age >= total) {
      _satPortals.splice(i, 1);
      try { s.resolve(true); } catch (e) {}
    }
  }
  for (i = _satCloses.length - 1; i >= 0; i--) {
    _satCloses[i].age += dt;
    if (_satCloses[i].age >= 0.15) _satCloses.splice(i, 1);
  }
}

function drawSat(ctx) {
  var rm = RM(), i, s;
  for (i = 0; i < _satPortals.length; i++) {
    s = _satPortals[i];
    if (rm) {
      ctx.save();
      ctx.globalAlpha = 0.7 * (1 - s.age / 0.15);
      ctx.strokeStyle = "#c084fc"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(s.x, s.y, 26, 0, TAU); ctx.stroke();
      ctx.restore();
      continue;
    }
    if (s.age < 0.35) {
      // phase 1: 2 arc tím xoay ngược chiều
      var k = s.age / 0.35;
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = "#c084fc"; ctx.lineWidth = 3;
      var a1 = _now * 10, a2 = -_now * 8;
      ctx.beginPath(); ctx.arc(s.x, s.y, 26, a1, a1 + Math.PI * 1.2); ctx.stroke();
      ctx.beginPath(); ctx.arc(s.x, s.y, 17, a2, a2 + Math.PI * 1.2); ctx.stroke();
      ctx.restore();
    } else {
      // phase 2: icon quái bay vào 300ms easeInQuad
      var k2 = E().easeInQuad(clamp((s.age - 0.35) / 0.3, 0, 1));
      var ix = s.x + s.dx * 120 * k2, iy = s.y + s.dy * 120 * k2;
      ctx.save();
      ctx.globalAlpha = 1 - k2 * 0.3;
      ctx.translate(ix, iy);
      ctx.fillStyle = "rgba(192,132,252,0.25)"; // glow giả (không shadowBlur)
      ctx.beginPath(); ctx.arc(0, 0, 18, 0, TAU); ctx.fill();
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = "#c084fc";
      var r = 10;
      ctx.fillRect(-r / 2, -r / 2, r, r);
      ctx.restore();
    }
  }
  for (i = 0; i < _satCloses.length; i++) {
    s = _satCloses[i];
    var ck = E().easeInQuad(clamp(s.age / 0.15, 0, 1));
    ctx.save();
    ctx.globalAlpha = 0.8 * (1 - ck);
    ctx.strokeStyle = "#c084fc"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(s.x, s.y, 24 * (1 - ck), 0, TAU); ctx.stroke();
    ctx.restore();
  }
}

/* ================= BACKGROUND STATES (§5.1) =================
 * Cinema.bgState(state): 'normal' | 'danger' | 'lowhp' | 'boss'.
 * 'breather' và 'stage' là trigger một lần (tự quay về mode trước đó).
 *
 * LƯU Ý TÍCH HỢP: nhánh studio/wow-polish CHƯA có js/bg.js (BG) — nên
 * Cinema vẽ layer riêng, độc lập:
 * - drawBack (gọi sau background, TRƯỚC entities): desaturate low-HP,
 *   arena ring + watermark boss, sóng breather.
 * - drawFront (sau entities): danger vignette + edge pulse, stage veil.
 * Khi BG được merge vào nhánh, worker có thể chuyển grid/particle đổi màu
 * sang BG.setDanger(...) theo spec §5.1.A và giữ nguyên layer của Cinema.
 * Reduced-motion: edge pulse/heartbeat/ring xoay → alpha tĩnh;
 * stage transition cắt thẳng 0ms. */
var _bg = { mode: "normal", a: 0, breath: null, stageFx: null, ringRot: 0 };

function bgState(state) {
  if (state === "breather") {
    if (RM()) return;
    _bg.breath = { age: 0, dur: 1.2 };
    return;
  }
  if (state === "stage") {
    _bg.stageFx = { age: 0, dur: RM() ? 0.001 : 0.8 };
    return;
  }
  if (state === "normal" || state === "danger" || state === "lowhp" || state === "boss") {
    _bg.mode = state;
  }
}
/** Alias tường minh cho stage transition (§5.1.D: crossfade 800ms). */
function stageTransition() { bgState("stage"); }

function updateBg(dt) {
  var target = _bg.mode === "normal" ? 0 : 1;
  _bg.a += clamp(target - _bg.a, -dt * 2, dt * 2); // crossfade 500ms
  _bg.ringRot += dt * (RM() ? 0 : (10 * Math.PI / 180)); // 10°/s
  if (_bg.breath) { _bg.breath.age += dt; if (_bg.breath.age >= _bg.breath.dur) _bg.breath = null; }
  if (_bg.stageFx) { _bg.stageFx.age += dt; if (_bg.stageFx.age >= _bg.stageFx.dur) _bg.stageFx = null; }
}

function drawBgBack(ctx) {
  var a = _bg.a, e = E(), rm = RM();
  if (a <= 0.01 && !_bg.breath) return;
  // --- lowhp: desaturate — phủ #04070F alpha 0.25 (trước player nên player vẫn rực)
  if (_bg.mode === "lowhp") {
    ctx.save();
    ctx.globalAlpha = 0.25 * a;
    ctx.fillStyle = "#04070F";
    ctx.fillRect(0, 0, _W, _H);
    ctx.restore();
  }
  // --- boss: arena ring đứt nét + watermark
  if (_bg.mode === "boss") {
    var r = Math.min(_W, _H) * 0.35;
    ctx.save();
    ctx.globalAlpha = 0.2 * a;
    ctx.strokeStyle = "#FF5470";
    ctx.lineWidth = 3;
    ctx.setLineDash([14, 10]);
    ctx.lineDashOffset = -_bg.ringRot * r;
    ctx.beginPath(); ctx.arc(_W / 2, _H / 2, r, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.05 * a;
    ctx.fillStyle = "#F2F7FF";
    ctx.font = "900 " + Math.round(_W * 0.09) + "px " + FONT_UI;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("FU-DEVER // BOSS", _W / 2, _H / 2);
    ctx.restore();
  }
  // --- breather: sóng xanh #4ADE80 alpha 0.08 lan 1 lần từ tâm
  if (_bg.breath) {
    var bk = clamp(_bg.breath.age / _bg.breath.dur, 0, 1);
    var br2 = Math.max(_W, _H) * 0.75 * e.easeOutCubic(bk);
    ctx.save();
    ctx.globalAlpha = 0.08 * (1 - bk);
    ctx.strokeStyle = "#4ADE80";
    ctx.lineWidth = 26 * (1 - bk) + 4;
    ctx.beginPath(); ctx.arc(_W / 2, _H / 2, br2, 0, TAU); ctx.stroke();
    ctx.restore();
  }
}

function drawBgFront(ctx) {
  var a = _bg.a, rm = RM();
  // --- danger: vignette đỏ 3Hz + edge pulse (window HP < 30%)
  if (_bg.mode === "danger" && a > 0.01) {
    var pulse = rm ? 0.7 : 0.5 + 0.5 * Math.sin(_now * TAU * 3);
    var R = Math.max(_W, _H) * 0.75;
    var g = ctx.createRadialGradient(_W / 2, _H / 2, R * 0.5, _W / 2, _H / 2, R);
    g.addColorStop(0, "rgba(255,84,112,0)");
    g.addColorStop(1, "rgba(255,84,112," + (0.28 * pulse * a).toFixed(3) + ")");
    ctx.save();
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, _W, _H);
    ctx.restore();
    // edge pulse: viền 6px #FF2D2D alpha 0.25 @ 3Hz — 4 rect rẻ
    var ea = (rm ? 0.2 : 0.25 * pulse) * a;
    if (ea > 0.01) {
      ctx.save();
      ctx.globalAlpha = ea;
      ctx.fillStyle = "#FF2D2D";
      ctx.fillRect(0, 0, _W, 6); ctx.fillRect(0, _H - 6, _W, 6);
      ctx.fillRect(0, 0, 6, _H); ctx.fillRect(_W - 6, 0, 6, _H);
      ctx.restore();
    }
  }
  // --- stage transition: veil crossfade 800ms
  if (_bg.stageFx) {
    var sk = clamp(_bg.stageFx.age / _bg.stageFx.dur, 0, 1);
    var sa = Math.sin(sk * Math.PI) * 0.55; // 0→0.55→0
    if (sa > 0.01) {
      ctx.save();
      ctx.globalAlpha = sa;
      ctx.fillStyle = "#04070F";
      ctx.fillRect(0, 0, _W, _H);
      ctx.restore();
    }
  }
}

/* ================= UI MICRO-INTERACTIONS (§10) =================
 * Dùng cho menu.js / index.html (worker tích hợp gắn vào):
 * - Cinema.pressFx(el): nhấn → scale 0.95 (70ms easeInQuad), thả → spring
 *   về 1.0 (120ms easeOutBack). Kèm class CSS .cin-pressable (style.css).
 * - Cinema.countUp(el, to, opts): đếm 0→to trong 900ms easeOutCubic,
 *   format dấu phẩy; opts = { duration, format }.
 * - Cinema.slidePanel(el): slide-in x +28px→0, 220ms easeOutCubic + fade
 *   (class CSS .cin-slide-in trong style.css).
 * Reduced-motion: bỏ spring overshoot (về 1.0 linear 80ms), count-up 300ms. */
function pressFx(el) {
  if (!el || !el.style) return;
  el.classList.add("cin-pressable");
  var rm = RM(), e = E(), t0 = performance.now();
  function down(now) {
    var t = (now - t0) / 1000;
    var k = e.easeInQuad(clamp(t / 0.07, 0, 1));
    el.style.transform = "scale(" + (1 - 0.05 * k).toFixed(4) + ")";
    if (t < 0.07) requestAnimationFrame(down);
    else {
      var t1 = performance.now();
      (function up(n2) {
        var tt = (n2 - t1) / 1000, dur = rm ? 0.08 : 0.12;
        var kk = rm ? clamp(tt / dur, 0, 1) : e.easeOutBack(clamp(tt / dur, 0, 1));
        el.style.transform = "scale(" + (0.95 + 0.05 * kk).toFixed(4) + ")";
        if (tt < dur) requestAnimationFrame(up);
        else el.style.transform = "";
      })(t1);
    }
  }
  requestAnimationFrame(down);
}

function countUp(el, to, opts) {
  if (!el) return;
  opts = opts || {};
  var rm = RM(), e = E();
  var dur = opts.duration || (rm ? 300 : 900);
  var t0 = performance.now();
  var target = Math.round(to);
  function fmt(v) {
    if (typeof opts.format === "function") return opts.format(v);
    return Math.round(v).toLocaleString("en-US");
  }
  el.classList.add("cin-num");
  function tick(now) {
    var t = clamp((now - t0) / dur, 0, 1); // AUDIT 2026-10-02: dur đã là ms — trước đây chia thêm 1000 → countUp chạy ~900 giây, rAF sống 15 phút mỗi lần gọi
    el.textContent = fmt(target * e.easeOutCubic(t));
    if (t < 1) requestAnimationFrame(tick);
    else el.textContent = fmt(target);
  }
  requestAnimationFrame(tick);
}

function slidePanel(el) {
  if (!el || !el.classList) return;
  el.classList.remove("cin-slide-in");
  void el.offsetWidth; // restart animation
  el.classList.add("cin-slide-in");
}

/* ================= PICKUP & GEM VISUALS (§9 style-guide) =================
 * - Bobbing: Cinema.bobY(t) = sin(t·2Hz)·4px; Cinema.bobRot(t) = ±8°;
 *   Cinema.gemSpin(t) = xoay 360°/2s. Worker dùng khi vẽ pickup/gem.
 * - Spawn: Cinema.spawnPopScale(age01) — pop 0→1.2→1 trong 250ms.
 * - Nhặt: Cinema.pickupCollect(kind, x, y, amount) — sparkle 6 tia màu
 *   pickup + text bay. kind: 'heart'|'shield'|'nuke'|'gem'.
 * - Nuke: hạng 2 §6 — flash cam toàn màn 150ms (KHÔNG shake quá 200ms;
 *   Cinema không shake).
 * - Magnet: Cinema.magnetLines(ctx, pairs) — tối đa 20 line #38BDF8/frame.
 * Lifetime blink (3s cuối @4Hz) và magnet hút do game xử lý. */
function bobY(t) { return Math.sin(t * TAU * 2) * 4; }
function bobRot(t) { return Math.sin(t * TAU * 2) * (8 * Math.PI / 180); }
function gemSpin(t) { return t * Math.PI; } // 360°/2s
function spawnPopScale(age01) {
  var k = clamp(age01, 0, 1);
  if (RM()) return k;
  var s = E().easeOutBack(k);
  return s > 1.2 ? 1.2 : s; // overshoot giới hạn 1.2 (§9 style-guide)
}

var _nuke = null; // { age }
function nukeFlash() {
  _nuke = { age: 0 };
  _heroStart(2);
  sfx("explosion");
}

function pickupCollect(kind, x, y, amount) {
  var conf = {
    heart:  { c: "#FF5470", t: "+1 HP" },
    shield: { c: "#7DD3FC", t: I18N.t("juice.pickup_shield") },
    nuke:   { c: "#FF7A1A", t: "NUKE!" },
    gem:    { c: "#38BDF8", t: "+" + (amount || 1) }
  }[kind] || { c: "#ffffff", t: "" };
  spawnSparkle(x, y, conf.c, 6, 200, 0.45, 6); // 6 tia
  if (conf.t) jFloat(x, y - 18, conf.t, conf.c, { size: kind === "nuke" ? 20 : 15 });
  if (kind === "nuke") nukeFlash();
  sfx("ui_click");
}

function magnetLines(ctx, pairs) {
  if (!pairs || !pairs.length) return;
  var n = Math.min(20, pairs.length); // tối đa 20 line/frame
  ctx.save();
  ctx.globalAlpha = 0.3;
  ctx.strokeStyle = "#38BDF8";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (var i = 0; i < n; i++) {
    var p = pairs[i];
    ctx.moveTo(p[0], p[1]);
    ctx.lineTo(p[2], p[3]);
  }
  ctx.stroke();
  ctx.restore();
}

/* ================= internal pool update/draw ================= */
function updatePools(dt) {
  var i, p;
  for (i = 0; i < P_CONF.n; i++) {
    p = P_CONF.items[i];
    if (!p.active) continue;
    p.age += dt;
    if (p.age >= p.life) { p.active = false; continue; }
    p.vy += 300 * dt; // gravity 300 (§8)
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.rot += p.vr * dt;
  }
  for (i = 0; i < P_SPK.n; i++) {
    p = P_SPK.items[i];
    if (!p.active) continue;
    p.age += dt;
    if (p.age >= p.life) { p.active = false; continue; }
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vx *= 0.96; p.vy *= 0.96;
  }
  for (i = 0; i < P_SPD.n; i++) {
    p = P_SPD.items[i];
    if (!p.active) continue;
    p.age += dt;
    if (p.age >= p.life) p.active = false;
  }
  for (i = 0; i < P_MGEM.n; i++) {
    p = P_MGEM.items[i];
    if (!p.active) continue;
    p.age += dt;
    if (p.age >= p.life) {
      p.active = false;
      spawnSparkle(p.tx, p.ty, p.color, 3, 90, 0.3, 0); // pop nhỏ khi chạm
      continue;
    }
    if (p.age < 0) continue;
    var k = E().easeInQuad(clamp(p.age / p.life, 0, 1));
    p.x = p.sx + (p.tx - p.sx) * k;
    p.y = p.sy + (p.ty - p.sy) * k;
  }
  for (i = 0; i < P_SHD.n; i++) {
    p = P_SHD.items[i];
    if (!p.active) continue;
    p.age += dt;
    if (p.age >= p.life) { p.active = false; continue; }
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vx *= 0.97; p.vy *= 0.97;
  }
  if (_nuke) { _nuke.age += dt; if (_nuke.age > 0.15) _nuke = null; }
}

function drawPools(ctx) {
  var i, p, t;
  // confetti
  for (i = 0; i < P_CONF.n; i++) {
    p = P_CONF.items[i];
    if (!p.active) continue;
    t = clamp(p.age / p.life, 0, 1);
    ctx.save();
    ctx.globalAlpha = 1 - t;
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.fillStyle = p.color;
    ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    ctx.restore();
  }
  // sparkle (dot hoặc star n tia)
  for (i = 0; i < P_SPK.n; i++) {
    p = P_SPK.items[i];
    if (!p.active) continue;
    t = clamp(p.age / p.life, 0, 1);
    ctx.save();
    ctx.globalAlpha = 1 - t;
    ctx.translate(p.x, p.y);
    if (p.rays > 0) {
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 2;
      var rr = p.size * 3 * (1 - t * 0.5);
      for (var r2 = 0; r2 < p.rays; r2++) {
        var a = (r2 / p.rays) * TAU;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * rr * 0.3, Math.sin(a) * rr * 0.3);
        ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(0, 0, p.size * (1 - t * 0.5), 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
  // speedlines (dash)
  ctx.save();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  for (i = 0; i < P_SPD.n; i++) {
    p = P_SPD.items[i];
    if (!p.active) continue;
    t = clamp(p.age / p.life, 0, 1);
    ctx.globalAlpha = 0.4 * (1 - t);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x - p.dx * p.len, p.y - p.dy * p.len);
    ctx.stroke();
  }
  ctx.restore();
  // magnet gems (loot boss)
  for (i = 0; i < P_MGEM.n; i++) {
    p = P_MGEM.items[i];
    if (!p.active || p.age < 0) continue;
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.translate(p.x, p.y);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = p.color;
    var s = p.size;
    ctx.fillRect(-s / 2, -s / 2, s, s);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(-1.5, -1.5, 3, 3);
    ctx.restore();
  }
  // ring shards
  for (i = 0; i < P_SHD.n; i++) {
    p = P_SHD.items[i];
    if (!p.active) continue;
    t = clamp(p.age / p.life, 0, 1);
    ctx.save();
    ctx.globalAlpha = 0.5 * (1 - t);
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot + p.age * 3);
    ctx.strokeStyle = "#FF5470";
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 0.7); ctx.stroke();
    ctx.restore();
  }
  // nuke flash (hạng 2 — fullscreen, 150ms, không shake)
  if (_nuke) {
    var nk = clamp(_nuke.age / 0.15, 0, 1);
    ctx.save();
    ctx.globalAlpha = 0.35 * (1 - nk);
    ctx.fillStyle = "#FF7A1A";
    ctx.fillRect(0, 0, _W, _H);
    ctx.restore();
  }
}

/* ================= MAIN: update / drawBack / drawFront / reset ================= */
/**
 * Advance mọi cinematic theo REAL-TIME (không bị timescale ảnh hưởng).
 * Gọi mỗi frame từ render path, kể cả khi game pause (draft/boss cinematic).
 * @param {number} rawDt delta giây chưa scale
 * @param {object} [info] { W, H, player: { x, y, vx, vy, speed, rot, r,
 *   hp, maxHp, shieldT } }
 */
function update(rawDt, info) {
  var dt = clamp(rawDt, 0, 0.1);
  _now += dt;
  info = info || {};
  if (info.W) _W = info.W;
  if (info.H) _H = info.H;

  var i;
  for (i = _timers.length - 1; i >= 0; i--) {
    if (_now >= _timers[i].at) {
      var fn = _timers[i].fn;
      _timers.splice(i, 1);
      try { fn(); } catch (e) {}
    }
  }

  playerFx(dt, info.player);
  updatePools(dt);
  updatePatches(dt);
  updateBanner(dt);
  updateCombo(dt);
  updateBossCine(dt);
  updateBg(dt);
  updateSat(dt);
}

/**
 * Vẽ layer SAU background, TRƯỚC entities.
 * Thứ tự: desaturate low-HP → arena ring + watermark boss → sóng breather.
 */
function drawBack(ctx, W, H) {
  if (W) _W = W;
  if (H) _H = H;
  drawBgBack(ctx);
}

/**
 * Vẽ layer SAU entities + Juice.draw*.
 * Thứ tự: player FX (shield ring, heartbeat vignette) → satellite →
 * danger vignette/edge → boss cinematic → banner/countdown → combo →
 * patches → pools (confetti/sparkle/speedlines/loot) → nuke flash →
 * gold edge flash.
 */
function drawFront(ctx, W, H, player) {
  if (W) _W = W;
  if (H) _H = H;
  drawPlayerFx(ctx, player);
  drawSat(ctx);
  drawBgFront(ctx);
  drawBossCine(ctx);
  drawBanner(ctx);
  drawCombo(ctx);
  drawPatches(ctx);
  drawPools(ctx);
  drawGoldEdge(ctx);
}

/** Xóa toàn bộ cinematic state (gọi khi reset game / game over). */
function reset() {
  var i, pools = [P_CONF, P_SPK, P_SPD, P_MGEM, P_PATCH, P_SHD];
  for (i = 0; i < pools.length; i++) {
    var items = pools[i].items;
    for (var j = 0; j < items.length; j++) items[j].active = false;
  }
  _timers.length = 0;
  _heroes.length = 0;
  // Settle mọi promise đang chờ trước khi xóa — tránh game đơ khi reset giữa cinematic
  try { if (_banner && _banner.resolve) _banner.resolve(false); } catch (e) {}
  try { if (_countdown && _countdown.resolve) _countdown.resolve(false); } catch (e) {}
  try { if (_bossCine && _bossCine.resolve) _bossCine.resolve(false); } catch (e) {}
  try { for (var _spi = 0; _spi < _satPortals.length; _spi++) { if (_satPortals[_spi].resolve) _satPortals[_spi].resolve(false); } } catch (e) {}
  _banner = null; _countdown = null;
  _combo = { n: 0, lastT: -99, popAge: 9, active: false, lostAge: 9, lost: false };
  _bossCine = null; _phaseFlash = null; _whiteFlash = null; _sweep = null;
  _goldEdge = null; _nuke = null; _shieldFlash = null;
  _dashGhosts.length = 0; _satPortals.length = 0; _satCloses.length = 0;
  _bg = { mode: "normal", a: 0, breath: null, stageFx: null, ringRot: 0 };
  _lock = false;
  _trailAcc = 0; _hbAcc = 0;
  if (_draft) {
    try { document.removeEventListener("keydown", _draft.keyH); } catch (e) {}
    try { if (_draft.ov.parentNode) _draft.ov.parentNode.removeChild(_draft.ov); } catch (e) {}
    _draft = null;
  }
  if (window.Juice) window.Juice.draftOpen = false;
}

/* ================= PUBLIC API ================= */
window.Cinema = {
  /* lifecycle */
  update: update,
  drawBack: drawBack,
  drawFront: drawFront,
  reset: reset,
  reducedMotion: _rmMedia,
  /** true khi cinematic pause-game đang chạy (worker check để skip update). */
  get locked() { try { return _lock; } catch (e) { return false; } },

  /* wave (§8) */
  waveBanner: waveBanner,
  waveClear: waveClear,
  patch: patch,

  /* upgrade draft (§9) — DOM */
  showDraft: showDraft,

  /* H1/B2: shatter vui nhộn khi cửa sổ vỡ */
  shatterBurst: shatterBurst,

  /* combo (§12) */
  combo: combo,
  comboLost: comboLost,

  /* boss (§13) */
  bossIntro: bossIntro,
  bossPhase: bossPhase,
  bossDeath: bossDeath,
  bossRingShatter: bossRingShatter,
  BOSS_STUN_MS: BOSS_STUN_MS,

  /* player (§7) */
  dashFx: dashFx,
  shieldBlock: shieldBlock,

  /* satellite (§11) */
  satPortal: satPortal,
  satClose: satClose,

  /* background (§5.1) */
  bgState: bgState,
  stageTransition: stageTransition,

  /* pickup & gem (§9 style-guide) */
  pickupCollect: pickupCollect,
  magnetLines: magnetLines,
  nukeFlash: nukeFlash,
  bobY: bobY,
  bobRot: bobRot,
  gemSpin: gemSpin,
  spawnPopScale: spawnPopScale,

  /* fx utils */
  confetti: function (n, opts) {
    opts = opts || {};
    spawnConfetti(n, !!opts.fromTop, opts.x || _W / 2, opts.y || _H / 3);
  },
  sparkle: function (x, y, color, n) { spawnSparkle(x, y, color || "#ffffff", n || 8, 180, 0.45, 0); },

  /* UI micro-interactions (§10) */
  pressFx: pressFx,
  countUp: countUp,
  slidePanel: slidePanel
};
})();

/* ================= REPORT: ĐIỂM HOOK CHO WORKER TÍCH HỢP =================
 * (ghi chú, không phải code chạy)
 *
 * game.html — thêm TRƯỚC <script src="js/game.js"></script>:
 *   <script src="js/juice.js"></script>
 *   <script src="js/cinema.js"></script>
 *
 * game.js — loop():
 *   const rawDt = Math.min(0.05, (now - last) / 1000);
 *   const dt = Juice.update(rawDt);
 *   if (!G.cinePause && !Cinema.locked) updateGame(dt);
 *   Cinema.update(rawDt, { W, H, player: { x: p.x, y: p.y, vx: p.vx, vy: p.vy,
 *     speed: Math.hypot(p.vx, p.vy), rot: p.rot, r: 17, hp: p.hp, maxHp: p.maxHp,
 *     shieldT: p.shieldT || 0 } });
 *   Juice.updateFx(rawDt);
 *
 * game.js — render():
 *   ctx.save(); Juice.applyShake(ctx);
 *   <vẽ background hiện tại>
 *   Cinema.drawBack(ctx, W, H);
 *   <vẽ player/quái/đạn/pickup như cũ>
 *   Juice.drawParticles(ctx); Juice.drawRings(ctx);
 *   Juice.drawGhosts(ctx, function (c, g, a) { drawPlayerShape(c, g); });
 *   Juice.drawFloats(ctx); Juice.drawDamageNumbers(ctx); Juice.drawWarnings(ctx);
 *   Cinema.drawFront(ctx, W, H, playerInfo);
 *   ctx.restore();
 *
 * game.js — startWave(n): Cinema.waveBanner(n, { boss: isBossWave(n) });
 * game.js — wave clear: Cinema.waveClear(n, shards, chewedSpots);
 * game.js — openDraft(): thay ruột bằng
 *   Cinema.showDraft(upgrades, function (i) { applyUpgrade(i); },
 *                     { x: G.player.x, y: G.player.y });
 * game.js — combo: mỗi kill → Cinema.combo(G.combo); khi reset → Cinema.comboLost();
 * game.js — spawnBoss(): G.cinePause = true;
 *   await Cinema.bossIntro(G.boss, "TÊN BOSS", "Danh hiệu",
 *     { drawBoss: function (ctx, x, y, s, a) { drawBossAt(ctx, x, y, s, a); } });
 *   G.cinePause = false; Cinema.bgState('boss');
 * game.js — boss phase: Cinema.bossPhase(n, { x, y, r,
 *   clearBullets: function () { /* mỗi đạn địch → Juice.burst nhỏ *\/ },
 *   onPalette: function (n) { /* đổi palette boss *\/ } });
 * game.js — killBoss(): G.cinePause = true;
 *   await Cinema.bossDeath(G.boss, { drawBoss: ..., player: G.player });
 *   G.cinePause = false; Cinema.bgState('normal');
 * game.js — dash: Cinema.dashFx(p.x, p.y, p.vx, p.vy);
 * game.js — shield đỡ đòn: Cinema.shieldBlock(x, y);
 * game.js — satellite spawn: await Cinema.satPortal(x, y, { x: dx, y: dy });
 *   rồi await Juice.spawnWarning(x2, y2, r);
 * game.js — satellite đóng: Cinema.satClose(x, y);
 * game.js — window HP < 30%: Cinema.bgState('danger'); hồi phục → 'normal';
 * game.js — player HP thấp: Cinema.bgState('lowhp'); boss wave: 'boss';
 *   wave clear: Cinema.bgState('breather'); đổi stage: Cinema.stageTransition();
 * game.js — nhặt pickup: Cinema.pickupCollect('heart'|'shield'|'nuke'|'gem', x, y, amt);
 * game.js — vẽ gem magnet: Cinema.magnetLines(ctx, [[x1,y1,x2,y2], ...]);
 * game.js — vẽ pickup: y = base + Cinema.bobY(t); rot = Cinema.bobRot(t);
 *   gem: rot = Cinema.gemSpin(t); scale = Cinema.spawnPopScale(age01);
 *
 * menu.js / index.html:
 *   document.querySelectorAll('.btn-big,.btn-ghost').forEach(function (b) {
 *     b.addEventListener('pointerdown', function () { Cinema.pressFx(b); });
 *   });
 *   Cinema.countUp(recordEl, 1234567); Cinema.slidePanel(panelEl);
 *
 * AUDIO (audio worker): các trigger đã gọi đúng tên hợp đồng —
 *   sfx.explosion / hitstop_thump / combo_milestone(tier) / boss_roar /
 *   phase_shift / riser / downlifter / fanfare / heartbeat / ui_click /
 *   ui_hover + AudioEngine.setMusicState('VICTORY'|'BOSS').
 * ===================================================================== */
