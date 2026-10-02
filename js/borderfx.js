/* WINDOWKILL — H1/B2: viền màn hình = thanh máu (diegetic)
 * notch = clamp(Math.ceil((1 - winPct) * 10), 0, 10) — 0 = nguyên vẹn, 10 = sắp vỡ.
 * Decal pre-render vào offscreen canvas; rebuild CHỈ khi đổi notch hoặc resize.
 * Mỗi frame chỉ drawImage — KHÔNG vẽ vector trong frame (perf).
 * Vết cắn/nứt dùng seed mulberry32(notch*1000 + k) nên deterministic, không nhấp nháy.
 */
(function () {
"use strict";

var cache = { notch: -1, w: 0, h: 0, cv: null };
var vigCache = { w: 0, h: 0, grads: null };
var reduced = false;
try { reduced = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch (e) {}

function clampN(v) { return v < 0 ? 0 : (v > 10 ? 10 : v); }
function notchFor(pct) { return clampN(Math.ceil((1 - pct) * 10)); }

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Vẽ 1 vết cắn tại (bx,by) trên cạnh `edge` (0=top,1=right,2=bottom,3=left).
// Dùng transform cục bộ: luôn vẽ như cạnh top (mép y=0, ăn sâu vào +y).
function drawBite(x, rnd, edge, bx, by) {
  x.save();
  x.translate(bx, by);
  x.rotate(edge * Math.PI / 2); // 0=top → 1=right → 2=bottom → 3=left
  var r = 10 + rnd() * 6;
  // (1) vết cắn: hình "khuyết" jagged bán nguyệt từ mép vào
  x.beginPath();
  x.moveTo(-r, 0);
  var segs = 5;
  for (var i = 1; i <= segs; i++) {
    var px = -r + (2 * r * i) / segs;
    var py = Math.sin((Math.PI * i) / segs) * r * (0.75 + rnd() * 0.5);
    x.lineTo(px, py);
  }
  x.lineTo(r, 0);
  x.closePath();
  x.fillStyle = "rgba(42,22,80,0.92)"; // #2a1650
  x.fill();
  x.strokeStyle = "#a855f7"; x.lineWidth = 2; x.lineJoin = "round";
  x.stroke();
  // (2) vết nứt: 2–3 polyline jagged tỏa vào trong, dài 24–48px
  x.strokeStyle = "rgba(255,157,243,0.85)"; // #ff9df3
  x.lineWidth = 2; x.lineCap = "round";
  var nCrack = 2 + Math.floor(rnd() * 2);
  for (var c = 0; c < nCrack; c++) {
    var sx = (rnd() - 0.5) * r, sy = r * 0.5;
    var len = 24 + rnd() * 24;
    var ang = Math.PI / 2 + (rnd() - 0.5) * 1.2;
    x.beginPath(); x.moveTo(sx, sy);
    var qx = sx, qy = sy, qs = 3;
    for (var s = 0; s < qs; s++) {
      var a2 = ang + (rnd() - 0.5) * 0.9;
      qx += Math.cos(a2) * (len / qs); qy += Math.sin(a2) * (len / qs);
      x.lineTo(qx, qy);
    }
    x.stroke();
  }
  // (3) vụn kính: 3 chấm tròn #c084fc
  x.fillStyle = "#c084fc";
  for (var d = 0; d < 3; d++) {
    x.beginPath();
    x.arc((rnd() - 0.5) * 2.4 * r, rnd() * 2 * r, 1.5 + rnd(), 0, Math.PI * 2);
    x.fill();
  }
  x.restore();
}

function build(w, h, notch) {
  var cv = document.createElement("canvas");
  cv.width = Math.max(1, Math.round(w));
  cv.height = Math.max(1, Math.round(h));
  var x = cv.getContext("2d");
  for (var k = 0; k < notch; k++) {
    var rnd = mulberry32(notch * 1000 + k);
    var edge = k % 4; // 0=top, 1=right, 2=bottom, 3=left
    var bx, by;
    if (k < 4) {
      // 4 vết đầu luôn ở 4 góc (khớp demo hero "gặm 4 góc"): offset 20–60px dọc cạnh
      var off = 20 + rnd() * 40;
      if (edge === 0) { bx = off; by = 0; }
      else if (edge === 1) { bx = w; by = off; }
      else if (edge === 2) { bx = w - off; by = h; }
      else { bx = 0; by = h - off; }
    } else {
      // ngẫu nhiên dọc cạnh — tránh đè cụm góc HUD (góc phải-trên)
      if (edge === 0) { bx = rnd() * Math.max(40, w - 200); by = 0; }
      else if (edge === 1) { bx = w; by = 60 + rnd() * Math.max(40, h - 60); }
      else if (edge === 2) { bx = rnd() * w; by = h; }
      else { bx = 0; by = rnd() * h; }
    }
    drawBite(x, rnd, edge, bx, by);
  }
  return cv;
}

// B2.3: vignette đỏ nhẹ khi yếu — gradient cache theo resize
function vigGrads(x, w, h) {
  if (vigCache.grads && vigCache.w === w && vigCache.h === h) return vigCache.grads;
  function lg(x0, y0, x1, y1) {
    var g = x.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, "rgba(255,45,80,1)");
    g.addColorStop(1, "rgba(255,45,80,0)");
    return g;
  }
  vigCache = { w: w, h: h, grads: {
    top: lg(0, 0, 0, 60), bottom: lg(0, h, 0, h - 60),
    left: lg(0, 0, 60, 0), right: lg(w, 0, w - 60, 0)
  } };
  return vigCache.grads;
}

function drawVignette(x, w, h, a) {
  if (a <= 0) return;
  var g = vigGrads(x, w, h);
  x.save();
  x.globalAlpha = a;
  x.fillStyle = g.top; x.fillRect(0, 0, w, 60);
  x.fillStyle = g.bottom; x.fillRect(0, h - 60, w, 60);
  x.fillStyle = g.left; x.fillRect(0, 0, 60, h);
  x.fillStyle = g.right; x.fillRect(w - 60, 0, 60, h);
  x.restore();
}

// B2.4: bắn vào viền → viền lóe xanh #0080FF. flash = { t, edge } do game.js đặt.
function drawFlash(x, w, h, flash, nowMs) {
  if (!flash || typeof flash.t !== "number") return;
  var elapsed = nowMs - flash.t;
  var alpha;
  if (reduced) {
    alpha = elapsed < 120 ? 1 : 0; // B2.5: không fade — hiện đặc 120ms rồi tắt
  } else {
    alpha = elapsed < 240 ? 1 - elapsed / 240 : 0;
  }
  if (alpha <= 0) return;
  x.save();
  x.strokeStyle = "rgba(0,128,255," + (alpha * 0.9).toFixed(3) + ")";
  x.lineWidth = 5;
  if (x.roundRect) { x.beginPath(); x.roundRect(3, 3, w - 6, h - 6, 8); x.stroke(); }
  else x.strokeRect(3, 3, w - 6, h - 6);
  // đoạn nhấn theo cạnh bị bắn
  x.strokeStyle = "rgba(125,249,255," + alpha.toFixed(3) + ")";
  x.lineWidth = 9; x.lineCap = "round";
  x.beginPath();
  var e = flash.edge;
  if (e === "top") { x.moveTo(6, 6); x.lineTo(w - 6, 6); }
  else if (e === "right") { x.moveTo(w - 6, 6); x.lineTo(w - 6, h - 6); }
  else if (e === "bottom") { x.moveTo(6, h - 6); x.lineTo(w - 6, h - 6); }
  else if (e === "left") { x.moveTo(6, 6); x.lineTo(6, h - 6); }
  x.stroke();
  x.restore();
}

function draw(x, w, h, pct, flash, nowMs, pulse) {
  var notch = notchFor(pct);
  if (!cache.cv || cache.notch !== notch || cache.w !== w || cache.h !== h) {
    cache.cv = build(w, h, notch);
    cache.notch = notch; cache.w = w; cache.h = h;
  }
  x.drawImage(cache.cv, 0, 0);
  // B2.3: vignette đỏ khi yếu
  if (pct < 0.35) {
    var a = reduced ? 0.12 : 0.10 + 0.08 * (pulse === undefined ? 0.5 : pulse);
    drawVignette(x, w, h, a);
  }
  drawFlash(x, w, h, flash, nowMs === undefined ? 0 : nowMs);
}

window.BorderFX = { draw: draw, notchFor: notchFor };
})();
