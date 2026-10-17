/* ---------------- render ---------------- */
/* Nền "Deep Dever": js/bg.js (procedural, prerender offscreen).
 * Gọi BG.build khi đổi ải / resize; mỗi frame chỉ BG.draw. */

/* =====================================================================
   RFC stage-themes-modes §2.1 — theme theo ải:
   (c) themeTint(e): shift hue màu quái ±15° (chỉ đổi hue, không đổi shape/hitbox);
       TẮT ở endless/mode mới (V2.stageId ∉ 1..5) và không áp cho boss/đạn/particle.
   (b) drawThemeBorder(): motif viền theo ải — vẽ SAU BorderFX.draw, DƯỚI StageFX.draw
       (mechanic ải luôn là lớp trên cùng — gameplay readability ưu tiên).
   ===================================================================== */
const _tintMemo = {};
/* P2: hoist array literal khỏi per-frame draw (tránh alloc mỗi frame) */
const _CHASER_FLAMES = ["#FF9A3D", "#FFD166", "#FF9A3D"]; // đuôi lửa chaser flicker
const _SNATCHER_GEM_COLORS = ["#7df9ff", "#ffd166", "#c084fc"]; // gem trên miệng túi snatcher
function _shiftHue(hex, deg) {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex || "")) return hex;
  const n = parseInt(hex.slice(1), 16);
  let r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  let h = 0, st = 0; const l = (mx + mn) / 2;
  if (mx !== mn) {
    const d = mx - mn;
    st = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  h = (h + deg + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * st;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m2 = l - c / 2;
  let rr2, gg2, bb2;
  if (h < 60) { rr2 = c; gg2 = x; bb2 = 0; }
  else if (h < 120) { rr2 = x; gg2 = c; bb2 = 0; }
  else if (h < 180) { rr2 = 0; gg2 = c; bb2 = x; }
  else if (h < 240) { rr2 = 0; gg2 = x; bb2 = c; }
  else if (h < 300) { rr2 = x; gg2 = 0; bb2 = c; }
  else { rr2 = c; gg2 = 0; bb2 = x; }
  const to = v => Math.round((v + m2) * 255);
  return "#" + ((1 << 24) + (to(rr2) << 16) + (to(gg2) << 8) + to(bb2)).toString(16).slice(1);
}
function themeTint(e) {
  if (!e || !e.color) return "#ffffff";
  try {
    if (window.G && G.themeTint === false) return e.color; // override tắt tường minh
    const st = window.V2 ? V2.stageId : 0;
    if (!(st >= 1 && st <= 5)) return e.color; // T2.5: endless/mode mới → TẮT
    const th = (typeof BG !== "undefined" && BG.getTheme(st).tintHue) || 0;
    if (!th) return e.color;
    const k = st + "|" + e.color;
    if (!_tintMemo[k]) _tintMemo[k] = _shiftHue(e.color, th);
    return _tintMemo[k];
  } catch (err) { return e.color; }
}
function _perimPoint(x, y, w, h, d) { // điểm trên chu vi hình chữ nhật tại khoảng cách d
  const tot = 2 * (w + h);
  d = ((d % tot) + tot) % tot;
  if (d < w) return { x: x + d, y };
  d -= w;
  if (d < h) return { x: x + w, y: y + d };
  d -= h;
  if (d < w) return { x: x + w - d, y: y + h };
  d -= w;
  return { x, y: y + h - d };
}
function _lerpColor(c1, c2, t) {
  const p = c => { const n = parseInt(String(c).slice(1), 16) || 0; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const a = p(c1), b = p(c2), m = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return "#" + ((1 << 24) + (m[0] << 16) + (m[1] << 8) + m[2]).toString(16).slice(1);
}
function drawThemeBorder(ctx, W, H, now) {
  let bd = null;
  try {
    const st = window.V2 ? V2.stageId : 0;
    if (!(st >= 1 && st <= 5)) return; // endless/mode mới: không motif viền
    if (typeof BG === "undefined") return;
    bd = BG.getTheme(st).border;
  } catch (e) { return; }
  if (!bd || !bd.kind) return;
  let reducedM = false;
  try { reducedM = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch (e) {}
  const inset = 5, wdt = bd.width || 3;
  const rr = (x, y, w, h, r) => { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); };
  ctx.save();
  if (bd.kind === "rounded") { // ải 1: viền cobalt như cửa sổ Windows + nút tiêu đề
    ctx.strokeStyle = bd.colors[0]; ctx.lineWidth = wdt; ctx.globalAlpha = 0.85;
    rr(inset, inset, W - inset * 2, H - inset * 2, 14); ctx.stroke();
    ctx.fillStyle = "#66B2FF"; ctx.globalAlpha = 0.9;
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(inset + 18 + i * 17, inset + 18, 4, 0, Math.PI * 2); ctx.fill(); }
  } else if (bd.kind === "fire") { // ải 2: hào quang lửa đồng bộ chu kỳ gai (cùng state StageFX)
    let on = true;
    try { on = !!(window.StageFX && StageFX.spikesOn && StageFX.spikesOn()); } catch (e) {}
    ctx.strokeStyle = bd.colors[0]; ctx.lineWidth = wdt;
    ctx.globalAlpha = on ? 0.45 : 0.25;
    ctx.strokeRect(inset + 3, inset + 3, W - (inset + 3) * 2, H - (inset + 3) * 2);
  } else if (bd.kind === "swirl") { // ải 3: viền gradient tím + sheen chạy vòng quanh (chu kỳ 8s)
    const g = ctx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, bd.colors[0]); g.addColorStop(1, bd.colors[1] || bd.colors[0]);
    ctx.strokeStyle = g; ctx.lineWidth = wdt; ctx.globalAlpha = 0.9;
    rr(inset, inset, W - inset * 2, H - inset * 2, 10); ctx.stroke();
    const per = 2 * (W + H - inset * 4);
    const d = reducedM ? per * 0.15 : ((now / 8000) % 1) * per;
    const pt = _perimPoint(inset, inset, W - inset * 2, H - inset * 2, d);
    ctx.globalAlpha = 0.95; ctx.fillStyle = "#e9d5ff";
    ctx.beginPath(); ctx.arc(pt.x, pt.y, 5, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.35;
    ctx.beginPath(); ctx.arc(pt.x, pt.y, 10, 0, Math.PI * 2); ctx.fill();
  } else if (bd.kind === "neon") { // ải 4: viền neon theo blackout (cùng state BG.setBlackout)
    let dark = false;
    try { dark = !!(typeof BG !== "undefined" && BG.blackoutOn && BG.blackoutOn()); } catch (e) {}
    ctx.strokeStyle = bd.colors[0]; ctx.lineWidth = wdt;
    ctx.globalAlpha = dark ? 0.15 : 0.8;
    rr(inset, inset, W - inset * 2, H - inset * 2, 6); ctx.stroke();
  } else if (bd.kind === "danger") { // ải 5: viền lerp xanh→đỏ theo danger nội bộ của BG
    let dg = 0;
    try { dg = (typeof BG !== "undefined" && BG.getDanger) ? BG.getDanger() : 0; } catch (e) {}
    dg = Math.max(0, Math.min(1, dg));
    ctx.strokeStyle = _lerpColor(bd.colors[0], bd.colors[1] || bd.colors[0], dg);
    ctx.lineWidth = wdt; ctx.globalAlpha = 0.9;
    rr(inset, inset, W - inset * 2, H - inset * 2, 8); ctx.stroke();
  }
  ctx.restore(); ctx.globalAlpha = 1;
}

function render(now) {
  const W = window.innerWidth, H = window.innerHeight, b = bounds(), s = G.ship; // MOBILE 2026-10-03: CSS px (canvas.width = device px)
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
  if (G.glueFlash > 0) { // Súng Bắn Keo: viền cửa sổ flash cyan 0.3s
    ctx.save();
    ctx.globalAlpha = Math.min(1, G.glueFlash / 0.3);
    ctx.strokeStyle = "#9df3ff"; ctx.lineWidth = 5;
    ctx.strokeRect(b.x - 3, b.y - 3, b.w + 6, b.h + 6);
    ctx.restore();
  }
  // H1/B3: % nguyên vẹn cửa sổ — tính theo windowIntegrity() (min 2 chiều), viền diegetic vẽ ở cuối frame (trước HUD)
  const winPct = windowIntegrity();
  // H3: font HUD dùng chung — khai báo ở đầu render để mọi section (kể cả floats) dùng được (tránh TDZ)
  const HUDFONT = (window.HUDIcons && HUDIcons.FONT) || '"Segoe UI", system-ui, -apple-system, sans-serif';

  // WOW: Cinema background layers (desat low-HP / boss arena ring / breather) — sau nền, trước entities
  if (window.Cinema) { try { Cinema.drawBack(ctx, W, H); } catch (e) {} }
  // cửa sổ vệ tinh mô phỏng (fallback multi-window)
  SatManager.drawSims();
  if (typeof drawSatFields === "function") drawSatFields(); // M10/M9: vùng hiệu lực popup thật
  if (typeof drawCracks === "function") drawCracks(); // M4: vết nứt viền arena

  // gems: icon i-gem (SVG cache) — không emoji
  G.gems.forEach(gm => {
    if (window.HUDIcons) HUDIcons.draw(ctx, "i-gem", 17, "#7df9ff", gm.x, gm.y + Math.sin(gm.t * 5) * 3);
  });
  // pickups: icon SVG cache (heart/shield/nuke); magnet/overdrive vẽ tay — không emoji
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
    } else if (p.kind === "patch") {
      // STAGE-OBJ ải 5: patch xanh — vẽ tay (vuông xanh + dấu + trắng), không emoji
      ctx.fillStyle = "#22c55e";
      ctx.fillRect(p.x - 11, p.y - 11 + bob, 22, 22);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(p.x - 2.5, p.y - 8 + bob, 5, 16);
      ctx.fillRect(p.x - 8, p.y - 2.5 + bob, 16, 5);
    } else {
      const pkIcon = p.kind === "heart" ? ["i-heart", "#ff5470", true] : p.kind === "shield" ? ["i-shield", "#38bdf8", false] : ["i-bomb", "#ff9d3f", false];
      if (window.HUDIcons) HUDIcons.draw(ctx, pkIcon[0], 24, pkIcon[1], p.x, p.y + bob, pkIcon[2]);
    }
    ctx.globalAlpha = 1;
  });
  // đạn ta
  G.bullets.forEach(bl => {
    ctx.save(); ctx.translate(bl.x, bl.y); ctx.rotate(Math.atan2(bl.vy, bl.vx));
    if (bl.star) { // VP1 starbullets: vẽ hình sao 5 cánh
      ctx.fillStyle = "#ffd166";
      ctx.beginPath();
      for (let k = 0; k < 10; k++) {
        const rr = k % 2 === 0 ? 9 : 4, aa = k * Math.PI / 5 - Math.PI / 2;
        ctx[k === 0 ? "moveTo" : "lineTo"](Math.cos(aa) * rr, Math.sin(aa) * rr);
      }
      ctx.closePath(); ctx.fill();
    } else if (G.vp1_discoBullets) { // Endless Delight discobullets: đạn đổi màu cầu vồng
      ctx.fillStyle = "hsl(" + (((performance.now() / 25) + bl.x + bl.y) % 360) + ",100%,65%)";
      ctx.fillRect(-9, -2.5, 18, 5);
      ctx.fillStyle = "#fff"; ctx.fillRect(3, -1.5, 6, 3);
    } else {
      ctx.fillStyle = "#9df3ff"; ctx.fillRect(-9, -2.5, 18, 5);
      ctx.fillStyle = "#fff"; ctx.fillRect(3, -1.5, 6, 3);
    }
    ctx.restore();
  });
  // đạn địch
  G.ebullets.forEach(eb => {
    if (eb.paper) { // BOSS PERSONALITY: đạn giấy của Sếp Dí Deadline — cùng r/tốc độ/sát thương
      ctx.save(); ctx.translate(eb.x, eb.y); ctx.rotate(eb.x * 0.02);
      ctx.fillStyle = "#ffffff"; ctx.fillRect(-eb.r, -eb.r * 0.7, eb.r * 2, eb.r * 1.4);
      ctx.strokeStyle = "#8b2fc9"; ctx.lineWidth = 1; ctx.strokeRect(-eb.r, -eb.r * 0.7, eb.r * 2, eb.r * 1.4);
      ctx.restore();
      return;
    }
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
    if (e.type === "chaser") {
      // RFC §2.2.1 "Tên Lửa Đồ Chơi": thân tên lửa mũi tròn, cánh đuôi bo tròn,
      // cửa sổ buồng lái, đuôi lửa 3 lưỡi flicker; elite giữ vệt đỏ + sọc đỏ.
      const _ca = Math.atan2(s.y - e.y, s.x - e.x);
      ctx.rotate(_ca);
      const r = e.r, _cBody = slow ? "#7dd3fc" : themeTint(e);
      if (e.elite) { // vệt đỏ của elite (giữ nguyên)
        ctx.fillStyle = "rgba(255,60,60,0.25)";
        for (let i = 1; i <= 3; i++) {
          ctx.beginPath();
          ctx.moveTo(-r - i * 9, 0); ctx.lineTo(-r - i * 9 - 7, -5); ctx.lineTo(-r - i * 9 - 7, 5);
          ctx.closePath(); ctx.fill();
        }
      }
      const _fl = Math.sin(now / 60) * 0.5 + 0.5; // đuôi lửa flicker
      for (let fi = 0; fi < 3; fi++) {
        const _fy = (fi - 1) * r * 0.42, _flen = 8 + _fl * 5 + (fi === 1 ? 3 : 0);
        ctx.fillStyle = _CHASER_FLAMES[fi];
        ctx.beginPath();
        ctx.moveTo(-r * 0.9, _fy - 2.5); ctx.lineTo(-r * 0.9 - _flen, _fy); ctx.lineTo(-r * 0.9, _fy + 2.5);
        ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = _cBody; // thân tên lửa: mũi tròn + cánh đuôi bo
      ctx.beginPath(); ctx.arc(r * 0.45, 0, r * 0.62, -Math.PI / 2, Math.PI / 2); ctx.fill();
      ctx.fillRect(-r * 0.9, -r * 0.62, r * 1.35, r * 1.24);
      ctx.beginPath(); ctx.ellipse(-r * 0.75, -r * 0.72, r * 0.42, r * 0.26, -0.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(-r * 0.75, r * 0.72, r * 0.42, r * 0.26, 0.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#bfe9ff"; // cửa sổ buồng lái
      ctx.beginPath(); ctx.arc(r * 0.25, 0, r * 0.30, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(20,60,100,0.5)"; ctx.lineWidth = 1.5; ctx.stroke();
      if (e.elite) { // vạch sọc đỏ trên thân elite
        ctx.strokeStyle = "#ff2222"; ctx.lineWidth = 2.5;
        for (let si = -1; si <= 1; si++) {
          ctx.beginPath(); ctx.moveTo(-r * 0.5 + si * 6, -r * 0.55); ctx.lineTo(-r * 0.5 + si * 6, r * 0.55); ctx.stroke();
        }
      }
      const _cd = Math.hypot(s.x - e.x, s.y - e.y); // telegraph chạm <60px: chớp đỏ
      if (_cd < 60 && Math.floor(now / 120) % 2 === 0) {
        ctx.save(); ctx.globalAlpha = 0.5; ctx.fillStyle = "#ff2222";
        ctx.beginPath(); ctx.arc(0, 0, r + 4, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    } else if (e.type === "mini") {
      // RFC §2.2.6 "Ong Bắp Cày Mini": thân ong bầu dục + sọc bụng, cánh vỗ nhanh,
      // ngòi sau, mắt tròn ngố.
      const r = e.r, _mBody = slow ? "#7dd3fc" : themeTint(e);
      ctx.rotate(Math.atan2(s.y - e.y, s.x - e.x));
      const _flap = 0.6 + 0.4 * Math.abs(Math.sin(e.t * 30)); // cánh vỗ nhanh
      ctx.save(); ctx.globalAlpha *= 0.6;
      ctx.fillStyle = "#ffffff";
      for (const _wy of [-1, 1]) {
        ctx.save(); ctx.translate(-r * 0.1, _wy * r * 0.55); ctx.scale(1, _flap);
        ctx.beginPath(); ctx.ellipse(0, 0, r * 0.55, r * 0.38, _wy * 0.5, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      ctx.restore();
      ctx.fillStyle = _mBody; // thân ong bầu dục
      ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.72, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#c243c9"; ctx.lineWidth = 2.5; // 2 sọc bụng đậm
      for (const _sx of [-0.35, 0.25]) {
        ctx.beginPath(); ctx.ellipse(_sx * r, 0, r * 0.16, r * 0.68, 0, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.fillStyle = "#7a2d7a"; // ngòi nhỏ phía sau
      ctx.beginPath(); ctx.moveTo(-r, 0); ctx.lineTo(-r - 5, -3); ctx.lineTo(-r - 5, 3); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#fff"; // mắt tròn ngố (không dữ)
      ctx.beginPath(); ctx.arc(r * 0.55, -r * 0.22, r * 0.26, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(r * 0.55, r * 0.22, r * 0.26, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#3a0a3a";
      ctx.beginPath(); ctx.arc(r * 0.60, -r * 0.22, r * 0.12, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(r * 0.60, r * 0.22, r * 0.12, 0, Math.PI * 2); ctx.fill();
    } else if (e.type === "chewer") {
      // RFC §2.2.2 "Sâu Gặm Pixel": 3 đốt tròn nối nhau viền đậm, hàm răng cưa nhai
      // theo sin(e.t*10) (latched → ×2), vết cắn zigzag khi bám viền.
      const r = e.r, _chBody = slow ? "#7dd3fc" : themeTint(e);
      const _latched = !!e.latched;
      const _la = e.latched === "left" ? Math.PI : e.latched === "right" ? 0
        : e.latched === "top" ? -Math.PI / 2 : e.latched === "bottom" ? Math.PI / 2 : 0;
      if (_latched) ctx.rotate(_la); // mặt hướng về viền đang gặm
      const _chew = Math.sin(e.t * (_latched ? 20 : 10)); // nhai đóng/mở
      ctx.fillStyle = _chBody;
      for (let si = -1; si <= 1; si++) { // 3 đốt tròn (thay hình vuông)
        ctx.beginPath(); ctx.arc(si * r * 0.62, 0, r * 0.58, 0, Math.PI * 2); ctx.fill();
      }
      ctx.strokeStyle = "#7c3aed"; ctx.lineWidth = 2;
      for (let si = -1; si <= 1; si++) {
        ctx.beginPath(); ctx.arc(si * r * 0.62, 0, r * 0.58, 0, Math.PI * 2); ctx.stroke();
      }
      const _mouthX = r * 1.05, _open = 2 + (_chew * 0.5 + 0.5) * 5;
      ctx.fillStyle = "#ffffff"; // hàm răng cưa: 2 hàng răng trắng mặt trước
      for (let ti = -1; ti <= 1; ti++) {
        const _ty = ti * r * 0.32;
        ctx.beginPath();
        ctx.moveTo(_mouthX - 4, _ty - _open * 0.5 - 3); ctx.lineTo(_mouthX + 5, _ty - _open * 0.5); ctx.lineTo(_mouthX - 4, _ty - _open * 0.5 + 3);
        ctx.closePath(); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(_mouthX - 4, _ty + _open * 0.5 - 3); ctx.lineTo(_mouthX + 5, _ty + _open * 0.5); ctx.lineTo(_mouthX - 4, _ty + _open * 0.5 + 3);
        ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = "#fff"; // mắt tròn trên đốt đầu
      ctx.beginPath(); ctx.arc(-r * 0.62, -r * 0.25, r * 0.22, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#2a0a3a";
      ctx.beginPath(); ctx.arc(-r * 0.62, -r * 0.25, r * 0.10, 0, Math.PI * 2); ctx.fill();
      if (_latched) { // vết cắn: 3 vết zigzag trắng ngay mép viền
        ctx.strokeStyle = "rgba(255,255,255,0.85)"; ctx.lineWidth = 2;
        for (let bi = -1; bi <= 1; bi++) {
          const _bx = _mouthX + 8, _by = bi * r * 0.5;
          ctx.beginPath();
          ctx.moveTo(_bx, _by); ctx.lineTo(_bx + 5, _by - 4); ctx.lineTo(_bx + 10, _by + 2); ctx.lineTo(_bx + 15, _by - 3);
          ctx.stroke();
        }
        if (window.HUDIcons) {
          ctx.save(); ctx.rotate(-_la);
          HUDIcons.draw(ctx, "i-alert", 14, "#ffd23f", 0, -r - 11);
          ctx.restore();
        }
      }
    } else if (e.type === "tank") {
      // RFC §2.2.3 "Xe Tăng Đồ Chơi": thân tròn bo, 2 dải xích đồ chơi có bánh xe
      // quay theo e.t, tháp pháo decor chĩa hướng tàu, lõi phát sáng (weakness).
      const r = e.r, _tBody = slow ? "#7dd3fc" : themeTint(e);
      ctx.rotate(e.t * 0.8); // xoay chậm giữ nguyên
      ctx.fillStyle = "#8a5a00"; // 2 dải xích đồ chơi 2 bên
      const _tw = r * 1.5, _th2 = r * 0.34, _ty = r * 0.62;
      for (const _sy of [-1, 1]) {
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(-_tw / 2, _sy * _ty - _th2 / 2, _tw, _th2, _th2 / 2);
        else ctx.rect(-_tw / 2, _sy * _ty - _th2 / 2, _tw, _th2);
        ctx.fill();
        for (let wi = -1; wi <= 1; wi++) { // 3 bánh xe tròn nhỏ quay theo e.t
          const _wx = wi * r * 0.45, _wy = _sy * _ty;
          ctx.fillStyle = "#5b3a00";
          ctx.beginPath(); ctx.arc(_wx, _wy, r * 0.14, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = "#ffd98a"; ctx.lineWidth = 1.5;
          const _wa = e.t * 5 + wi;
          ctx.beginPath(); ctx.moveTo(_wx, _wy);
          ctx.lineTo(_wx + Math.cos(_wa) * r * 0.14, _wy + Math.sin(_wa) * r * 0.14); ctx.stroke();
          ctx.fillStyle = "#8a5a00";
        }
      }
      ctx.fillStyle = _tBody; // thân tròn bo (thay lục giác)
      ctx.beginPath(); ctx.arc(0, 0, r * 0.78, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(90,45,0,0.6)"; ctx.lineWidth = 2; ctx.stroke();
      const _pulse = 0.7 + 0.3 * Math.sin(now / 150); // lõi phát sáng: "bắn vào chỗ sáng"
      ctx.save(); ctx.globalAlpha = 0.25 * _pulse; // hào quang mờ
      ctx.fillStyle = "#FFE14D";
      ctx.beginPath(); ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.save(); ctx.globalAlpha = _pulse; // nhân lõi
      ctx.fillStyle = "#FFE14D";
      ctx.beginPath(); ctx.arc(0, 0, r * 0.32, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.save(); // tháp pháo decor: vành quanh lõi + nòng ngắn chĩa hướng tàu
      ctx.rotate(Math.atan2(s.y - e.y, s.x - e.x) - e.t * 0.8);
      ctx.strokeStyle = "#a86a00"; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(0, 0, r * 0.44, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = "#a86a00";
      ctx.fillRect(r * 0.32, -r * 0.08, r * 0.55, r * 0.16);
      ctx.restore();
    } else if (e.type === "dasher") {
      // RFC §2.2.4 "Phi Tiêu Ninja": thân thon, ruy-băng headband bay sau đuôi,
      // aim: dải aim chuyển ĐỎ ở 0.2s cuối; mắt ninja trên thân.
      const r = e.r;
      const _aiming = e.state === "aim" || e.state === "dash";
      if (e.state === "aim") { // telegraph
        const _remain = e.stateT == null ? 0.7 : e.stateT;
        const _last02 = _remain <= 0.2; // ngưỡng 0.2s cuối → ĐỎ
        ctx.strokeStyle = _last02
          ? `rgba(255,59,48,${0.75 + 0.25 * Math.sin(now / 60)})`
          : `rgba(255,225,77,${0.4 + 0.4 * Math.sin(now / 80)})`;
        ctx.lineWidth = _last02 ? 4 : 3;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(e.dx * 320, e.dy * 320); ctx.stroke();
      }
      ctx.rotate(Math.atan2(_aiming ? e.dy : s.y - e.y, _aiming ? e.dx : s.x - e.x));
      ctx.strokeStyle = "#ff5470"; ctx.lineWidth = 3; ctx.lineCap = "round"; // ruy-băng headband
      for (let ri = 0; ri < 2; ri++) {
        const _ry0 = (ri === 0 ? -1 : 1) * r * 0.35;
        ctx.beginPath();
        ctx.moveTo(-r * 0.8, _ry0);
        ctx.quadraticCurveTo(-r * 1.4, _ry0 + Math.sin(e.t * 12 + ri * 2) * 6,
          -r * 1.9, _ry0 + Math.sin(e.t * 12 + ri * 2 + 1) * 9);
        ctx.stroke();
      }
      ctx.fillStyle = slow ? "#7dd3fc" : e.state === "aim" ? "#fff3a0" : themeTint(e); // thân thon (slow tint ưu tiên)
      ctx.beginPath();
      ctx.moveTo(r + 3, 0); ctx.lineTo(-r * 0.7, -r * 0.55); ctx.lineTo(-r, 0); ctx.lineTo(-r * 0.7, r * 0.55);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#1a1a2e"; // dải băng ninja
      ctx.fillRect(-r * 0.25, -r * 0.38, r * 0.75, r * 0.76);
      ctx.fillStyle = "#fff"; // 2 mắt trắng sắc lẹm
      ctx.beginPath();
      ctx.moveTo(r * 0.05, -r * 0.22); ctx.lineTo(r * 0.38, -r * 0.10); ctx.lineTo(r * 0.05, -r * 0.02);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(r * 0.05, r * 0.02); ctx.lineTo(r * 0.38, r * 0.10); ctx.lineTo(r * 0.05, r * 0.22);
      ctx.closePath(); ctx.fill();
    } else if (e.type === "splitter") {
      // RFC §2.2.5 "Bong Bóng Xà Phòng": trong suốt + highlight, wobble căng phồng,
      // máu <50%: 3 vết nứt trắng + xẹp nhẹ (báo vỡ). Chết vẫn tách 2 mini (logic cũ).
      const r = e.r;
      const _frac = e.maxHp ? e.hp / e.maxHp : 1;
      const _cracked = _frac < 0.5;
      const _sc = (_cracked ? 0.95 : 1) * (1 + Math.sin(e.t * 6) * 0.04); // wobble căng phồng
      ctx.scale(_sc, _sc);
      if (slow) { // slow tint #7dd3fc giữ nguyên ở mọi nhánh (QA-02) — alpha giữ độ trong suốt bong bóng
        ctx.save(); ctx.globalAlpha = 0.55;
        ctx.fillStyle = "#7dd3fc";
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      } else {
        ctx.fillStyle = "rgba(125,249,255,0.55)";
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.strokeStyle = slow ? "#7dd3fc" : themeTint(e); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
      ctx.save(); ctx.globalAlpha *= 0.7; // vệt sáng highlight góc trên-trái
      ctx.fillStyle = "#ffffff";
      ctx.beginPath(); ctx.ellipse(-r * 0.35, -r * 0.42, r * 0.28, r * 0.16, -0.6, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      if (_cracked) { // 3 vết nứt trắng chạy dọc — báo trước "sắp vỡ"
        ctx.strokeStyle = "rgba(255,255,255,0.9)"; ctx.lineWidth = 1.5;
        for (let ci = -1; ci <= 1; ci++) {
          const _cx = ci * r * 0.4;
          ctx.beginPath();
          ctx.moveTo(_cx, -r * 0.8); ctx.lineTo(_cx + 4, -r * 0.3);
          ctx.lineTo(_cx - 3, r * 0.2); ctx.lineTo(_cx + 4, r * 0.75);
          ctx.stroke();
        }
      }
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
      // RFC §2.2.7 "Bom Bi Cartoon": bom bi tròn đen-xám, fuse cháy đọc được 0.7s
      // (tia lửa to dần khi e.fuse giảm), mặt lo lắng hề hước khi armed.
      // Nổ vẫn detonateKamikaze như cũ (không đổi logic).
      const r = e.r;
      const armed = e.fuse >= 0;
      const _fuseFrac = armed ? Math.max(0, Math.min(1, 1 - e.fuse / 0.8)) : 0;
      const _flashW = armed && Math.floor(now / 90) % 2 === 0;
      ctx.fillStyle = _flashW ? "#ffffff" : (slow ? "#7dd3fc" : "#3a3a44");
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
      ctx.save(); ctx.globalAlpha *= 0.5; // highlight trắng góc trên
      ctx.fillStyle = "#ffffff";
      ctx.beginPath(); ctx.arc(-r * 0.35, -r * 0.4, r * 0.22, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = "#8a6a3a"; ctx.lineWidth = 2.5; // dây fuse trên đỉnh
      ctx.beginPath(); ctx.moveTo(0, -r); ctx.quadraticCurveTo(4, -r - 7, 9, -r - 5); ctx.stroke();
      const _sparkR = 2.5 + _fuseFrac * 4 + (armed ? Math.sin(now / 50) * 1.2 : 0);
      ctx.fillStyle = "#FFD166"; // tia lửa fuse
      ctx.beginPath(); ctx.arc(9, -r - 5, Math.max(1.5, _sparkR), 0, Math.PI * 2); ctx.fill();
      if (armed) { // khói xám bay lên
        ctx.save(); ctx.globalAlpha *= 0.3;
        ctx.fillStyle = "#9aa0aa";
        for (let ki = 0; ki < 2; ki++) {
          const _ky = -r - 12 - ki * 10 - ((now / 40 + ki * 20) % 20);
          ctx.beginPath(); ctx.arc(9 + Math.sin(now / 200 + ki) * 4, _ky, 4 + ki * 2, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
        ctx.fillStyle = "#fff"; // mặt lo lắng hề hước (không creepy)
        ctx.beginPath(); ctx.arc(-r * 0.3, -r * 0.05, r * 0.20, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(r * 0.3, -r * 0.05, r * 0.20, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#1a1a2e";
        ctx.beginPath(); ctx.arc(-r * 0.3, -r * 0.02, r * 0.09, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(r * 0.3, -r * 0.02, r * 0.09, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "#1a1a2e"; ctx.lineWidth = 2; ctx.lineCap = "round";
        ctx.beginPath();
        for (let wi = 0; wi <= 4; wi++) {
          const _wx = -r * 0.4 + wi * r * 0.2, _wy = r * 0.45 + Math.sin(wi * Math.PI) * 2.5;
          if (wi === 0) ctx.moveTo(_wx, _wy); else ctx.lineTo(_wx, _wy);
        }
        ctx.stroke();
        ctx.fillStyle = "#ff7a1a"; ctx.font = "bold 13px sans-serif"; ctx.textAlign = "center";
        ctx.fillText("!", 0, -r - 8);
      }
    } else if (e.type === "glimmer") {
      // RFC §2.2.8 "Đom Đóm Đèn Lồng" (NHÁNH MỚI): đèn lồng tròn nan cong, hào quang
      // pulse (sáng gấp đôi khi người chơi trong 200px), cánh nhỏ, vệt lấp lánh.
      const r = e.r;
      const _near = Math.hypot(s.x - e.x, s.y - e.y) < 200; // "thèm" đuổi theo
      const _haloA = (0.25 + 0.2 * Math.sin(e.t * 5)) * (_near ? 2 : 1);
      ctx.save(); ctx.globalAlpha = Math.min(0.85, _haloA); // hào quang
      ctx.fillStyle = "#fbbf24";
      ctx.beginPath(); ctx.arc(0, 0, r * 2.2, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      const _gflap = 0.6 + 0.4 * Math.abs(Math.sin(e.t * 18)); // 2 cánh nhỏ vỗ
      ctx.save(); ctx.globalAlpha *= 0.55;
      ctx.fillStyle = "#ffffff";
      for (const _wy of [-1, 1]) {
        ctx.save(); ctx.translate(0, _wy * r * 0.75); ctx.scale(1, _gflap);
        ctx.beginPath(); ctx.ellipse(0, 0, r * 0.42, r * 0.30, _wy * 0.6, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      ctx.restore();
      ctx.fillStyle = slow ? "#7dd3fc" : themeTint(e); // thân đèn lồng tròn
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#b45309"; ctx.lineWidth = 1.5; // nan lồng: 3 đường dọc cong
      for (let ni = -1; ni <= 1; ni++) {
        ctx.beginPath(); ctx.ellipse(ni * r * 0.35, 0, r * 0.30, r * 0.92, 0, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.fillStyle = "#b45309"; // nắp + đáy đậm
      ctx.fillRect(-r * 0.4, -r - 5, r * 0.8, 5);
      ctx.fillRect(-r * 0.4, r, r * 0.8, 5);
      if (!e._glimSpark || now - e._glimSpark > 200) { // vệt lấp lánh: 1 sparkle/0.2s
        e._glimSpark = now;
        try { burst(e.x + (Math.random() - 0.5) * 20, e.y + (Math.random() - 0.5) * 20, 1, ["#fbbf24", "#fff7ae"], 40); } catch (err) {}
      }
    } else if (e.type === "deadline") {
      const urgent = e.countdown <= 3;
      ctx.fillStyle = slow ? "#7dd3fc" : e.color;
      ctx.beginPath(); ctx.arc(0, 0, e.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#7a5c00";
      ctx.beginPath(); ctx.arc(-e.r * 0.7, -e.r * 0.7, e.r * 0.35, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(e.r * 0.7, -e.r * 0.7, e.r * 0.35, 0, Math.PI * 2); ctx.fill();
      const ang = (Math.max(0, e.countdown) / 12) * Math.PI * 2;
      ctx.strokeStyle = "#5b4300"; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(ang) * e.r * 0.7, Math.sin(ang) * e.r * 0.7); ctx.stroke();
      const blink = Math.floor(now / (urgent ? 120 : 300)) % 2 === 0;
      ctx.fillStyle = urgent ? (blink ? "#ff3b30" : "#7a1f1f") : "#ffe14d";
      ctx.font = "bold 15px sans-serif"; ctx.textAlign = "center";
      ctx.fillText(String(Math.max(0, Math.ceil(e.countdown))), 0, -e.r - 8);
    } else if (e.type === "otworker") {
      for (let pi = 0; pi < 5; pi++) {
        ctx.fillStyle = pi < e.rage ? "#ff3b30" : "#ffffff28";
        ctx.fillRect(-15 + pi * 7, -e.r - 12, 5, 5);
      }
      ctx.rotate(Math.atan2(s.y - e.y, s.x - e.x));
      const shades = ["#ff5252", "#f43f3e", "#e5342e", "#d42a24", "#c21f1a", "#a81512"];
      ctx.fillStyle = slow ? "#7dd3fc" : (shades[Math.min(5, e.rage || 0)] || "#ff5252");
      ctx.beginPath(); ctx.moveTo(e.r + 2, 0); ctx.lineTo(-e.r, -e.r * 0.85);
      ctx.lineTo(-e.r * 0.4, 0); ctx.lineTo(-e.r, e.r * 0.85); ctx.closePath(); ctx.fill();
      if (e.rage > 0) {
        ctx.fillStyle = "#8b5a2b";
        ctx.beginPath(); ctx.arc(-e.r * 0.5, e.r * 0.5, 3 + e.rage, 0, Math.PI * 2); ctx.fill();
      }
    } else if (e.type === "meeting") {
      ctx.fillStyle = slow ? "#7dd3fc" : e.color;
      ctx.beginPath(); ctx.arc(0, 0, e.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#0b3b1a";
      ctx.beginPath(); ctx.arc(0, 0, e.r * 0.45, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = e.warnT > 0 ? "#ff3b30" : "rgba(125,255,154,0.55)";
      ctx.lineWidth = 2; ctx.setLineDash([10, 8]);
      ctx.beginPath(); ctx.arc(0, 0, 160, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.textAlign = "center";
      if (e.warnT > 0) {
        ctx.fillStyle = "#ff3b30"; ctx.font = "bold 13px sans-serif";
        ctx.fillText("!", 0, -e.r - 8);
      } else {
        ctx.fillStyle = "rgba(125,255,154,0.85)"; ctx.font = "11px sans-serif";
        ctx.fillText("HỌP", 0, -e.r - 8);
      }
    } else if (e.type === "snatcher") {
      // RFC §2.2.9 — giữ concept PR #77, nâng chi tiết: túi phồng theo gem cướp
      // (scale 1+0.18×carried), miệng túi mở to dần, dây đeo mặt nạ, chùm chìa khóa,
      // flee: giữ giọt mồ hôi + 2 vệt bụi chân (1 puff/0.15s).
      const flee = e.phase === "flee";
      const r = e.r;
      const bag = e.carried || [];
      const _bagScale = 1 + 0.18 * bag.length; // túi phồng theo carried.length (0→3 viên)
      ctx.translate(0, Math.sin(e.t * 9) * 2); // nhún nhảy ranh mãnh
      ctx.strokeStyle = "#1a1a2e"; ctx.lineWidth = 2; // dây đeo mặt nạ (cong sau đầu)
      ctx.beginPath(); ctx.arc(0, 0, r * 1.02, Math.PI * 0.9, Math.PI * 1.6); ctx.stroke();
      ctx.save(); // túi vải sau lưng: phồng + miệng mở to dần
      ctx.translate(-r * 0.95, r * 0.35); ctx.scale(_bagScale, _bagScale);
      ctx.fillStyle = "#b08968";
      ctx.beginPath(); ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#7a5a3a";
      ctx.beginPath();
      ctx.ellipse(0, -r * 0.45, r * (0.28 + bag.length * 0.06), r * 0.16, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      for (let gi = 0; gi < bag.length; gi++) { // gem hình thoi trên miệng túi
        const gx = -r * 0.95 + (gi - 1) * 7, gy = r * 0.35 - r * 0.55 * _bagScale - 5;
        ctx.fillStyle = _SNATCHER_GEM_COLORS[gi % 3];
        ctx.beginPath();
        ctx.moveTo(gx, gy - 5); ctx.lineTo(gx + 4, gy); ctx.lineTo(gx, gy + 5); ctx.lineTo(gx - 4, gy);
        ctx.closePath(); ctx.fill();
      }
      const _jing = Math.sin(e.t * 11) * 2; // chùm chìa khóa đồ chơi leng keng ở hông
      for (let ki = 0; ki < 3; ki++) {
        const _kx = r * 0.85 + ki * 6 - 6, _ky = r * 0.75 + _jing * (ki % 2 ? 1 : -1);
        ctx.fillStyle = "#d1d5db";
        ctx.beginPath(); ctx.arc(_kx, _ky, 3.2, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "#9ca3af"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(_kx, _ky, 3.2, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.fillStyle = slow ? "#7dd3fc" : themeTint(e); // body tròn tím
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#1a1a2e"; // dải mặt nạ đen
      ctx.fillRect(-r * 0.85, -r * 0.35, r * 1.7, r * 0.55);
      const look = Math.sin(e.t * 5) * r * 0.18; // mắt láo liên
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(-r * 0.32 + look, -r * 0.08, r * 0.16, 0, Math.PI * 2);
      ctx.arc(r * 0.32 + look, -r * 0.08, r * 0.16, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#1a1a2e";
      ctx.beginPath();
      ctx.arc(-r * 0.32 + look * 1.4, -r * 0.08, r * 0.07, 0, Math.PI * 2);
      ctx.arc(r * 0.32 + look * 1.4, -r * 0.08, r * 0.07, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#1a1a2e"; ctx.lineWidth = 2; ctx.lineCap = "round"; // cười ranh mãnh
      ctx.beginPath(); ctx.arc(0, r * 0.25, r * 0.35, Math.PI * 0.2, Math.PI * 0.8); ctx.stroke();
      if (flee) { // giọt mồ hôi lo lắng khi chạy trốn
        const swy = (Math.sin(e.t * 6) + 1) / 2 * 3;
        ctx.fillStyle = "#7dd3fc";
        ctx.beginPath(); ctx.arc(r * 0.95, -r * 0.9 + swy, 4.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(r * 0.95, -r * 0.9 - 4 + swy);
        ctx.lineTo(r * 0.95 - 4.5, -r * 0.9 + 2 + swy);
        ctx.lineTo(r * 0.95 + 4.5, -r * 0.9 + 2 + swy);
        ctx.closePath(); ctx.fill();
        if (!e._snPuff || now - e._snPuff > 150) { // 2 vệt bụi chân sau lưng
          e._snPuff = now;
          try { burst(e.x - r, e.y + r * 0.8, 2, ["#d1d5db", "#9ca3af"], 60); } catch (err) {}
        }
      }
    } else {
      // fallback: quái mới chưa có nhánh vẽ riêng vẫn chạy được — hình tròn màu registry
      ctx.fillStyle = slow ? "#7dd3fc" : e.color;
      ctx.beginPath(); ctx.arc(0, 0, e.r, 0, Math.PI * 2); ctx.fill();
    }
    // CEO §9-Q2: quái "say nắng" vẽ 💘 trên đầu
    if (e.sayNangT > 0 && window.HUDIcons) {
      HUDIcons.draw(ctx, "i-heart", 16, "#c084fc", 0, -e.r - 15, true);
    }
    // Item 6 — Elite Parade: vòng vàng nhấp nháy cho quái tinh anh (chỉ visual)
    if (e.vp1_elite) {
      ctx.strokeStyle = "#ffd166"; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(0, 0, e.r + 5 + Math.sin((e.t || 0) * 6) * 1.5, 0, Math.PI * 2); ctx.stroke();
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
    if (bs.persona) drawBossFlair(ctx, bs, r); // BOSS PERSONALITY: phụ kiện hài
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
    // Endless Delight boingyship: squash-and-stretch nảy tưng (trang trí, không đổi hitbox)
    if (G.vp1_boingy) {
      const bs = 1 + 0.12 * Math.sin(performance.now() / 130) * Math.min(1, (s.moveSpeed || 0) / 240 + 0.25);
      ctx.scale(bs, 2 - bs);
    }
    // GC-2026-10: gradient thân tàu hằng số trong hệ tọa độ local → cache, không tạo mỗi frame
    const tg = _gradGet("ship-body", _mkShipGrad);
    ctx.fillStyle = tg;
    ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-11, -11); ctx.lineTo(-6, 0); ctx.lineTo(-11, 11); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#0b2536"; ctx.beginPath(); ctx.arc(2, 0, 4.5, 0, Math.PI * 2); ctx.fill();
    const fl = 10 + Math.random() * 9;
    ctx.fillStyle = "#ffb020";
    ctx.beginPath(); ctx.moveTo(-11, -5); ctx.lineTo(-11 - fl, 0); ctx.lineTo(-11, 5); ctx.closePath(); ctx.fill();
    ctx.restore(); ctx.globalAlpha = 1;
  }

  // particles & floats — batching: gom hạt theo (color, alpha 8 nấc) → 1 Path2D
  // mỗi bucket → 1 fillStyle + 1 globalAlpha + 1 fill() (js/particles.js).
  // Fallback giữ nguyên vòng vẽ cũ nếu file chưa load. Không đổi số lượng/hành vi hạt.
  if (window.WKParticles) window.WKParticles.draw(ctx, G.parts);
  else G.parts.forEach(p => {
    ctx.globalAlpha = Math.max(0, 1 - p.t / p.life); ctx.fillStyle = p.c;
    ctx.fillRect(p.x - p.sz / 2, p.y - p.sz / 2, p.sz, p.sz);
  });
  ctx.globalAlpha = 1; ctx.textAlign = "center";
  // GC-2026-10: font string tính 1 lần/frame (trước: nối chuỗi mỗi float mỗi frame)
  const _flFontBig = "bold 19px " + HUDFONT, _flFontSm = "bold 15px " + HUDFONT;
  G.floats.forEach(f => {
    ctx.globalAlpha = Math.max(0, 1 - f.t / f.life);
    const _ff = f.big ? _flFontBig : _flFontSm;
    ctx.font = _ff;
    ctx.fillStyle = f.color;
    const fy = f.y - f.t * 46;
    let fDone = false;
    if (window.HUDIcons) {
      if (f._fi === undefined) f._fi = HUDIcons.splitFloat(f.text); // cache 1 lần/float
      const fi = f._fi;
      if (fi && fi.icons.length) {
        if (fi.text === "" && fi.icons.length === 1) {
          HUDIcons.draw(ctx, fi.icons[0], 16, f.color, f.x, fy - 8);
        } else {
          // GC-2026-10: cache width 1 lần/float (đo lại nếu font đổi giữa chừng)
          if (f._fw === undefined || f._fwFont !== _ff) { f._fw = ctx.measureText(fi.text).width; f._fwFont = _ff; }
          const ftw = f._fw;
          let fix = f.x - ftw / 2 - 4 - 8;
          for (let ii = fi.icons.length - 1; ii >= 0; ii--) { HUDIcons.draw(ctx, fi.icons[ii], 16, f.color, fix, fy - 8); fix -= 20; }
          ctx.fillText(fi.text, f.x, fy);
        }
        fDone = true;
      }
    }
    if (!fDone) ctx.fillText(f.text, f.x, fy);
  });
  ctx.globalAlpha = 1;
  // M2 rework 2026-10-04: vẽ vết rạn kính trên viền arena (mờ dần theo c.t/c.life)
  if (G.cracks && G.cracks.length) {
    const b = bounds();
    for (const c of G.cracks) {
      const a = Math.max(0, 1 - c.t / c.life);
      let px, py, dx, dy;
      if (c.edge === "left") { px = b.x + 4; py = c.at; dx = 1; dy = 0; }
      else if (c.edge === "right") { px = b.x + b.w - 4; py = c.at; dx = -1; dy = 0; }
      else if (c.edge === "top") { px = c.at; py = b.y + 4; dx = 0; dy = 1; }
      else { px = c.at; py = b.y + b.h - 4; dx = 0; dy = -1; }
      ctx.save(); ctx.globalAlpha = a;
      ctx.strokeStyle = "#bfe9ff"; ctx.lineWidth = 2; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(px, py);
      let jx = px, jy = py;
      for (let i = 1; i <= 5; i++) {
        const off = (i % 2 === 0 ? 9 : -9);
        jx += dx * 15 + (dy !== 0 ? off : (Math.random() - 0.5) * 7);
        jy += dy * 15 + (dx !== 0 ? off : (Math.random() - 0.5) * 7);
        ctx.lineTo(jx, jy);
      }
      ctx.stroke(); ctx.restore();
    }
  }
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

  // H1/B2: viền màn hình = thanh máu — decal notch cache (borderfx.js), flash xanh khi bắn vào viền
  if (window.BorderFX) BorderFX.draw(ctx, W, H, winPct, G._borderFlash, now,
    G.lastStand ? heartbeatPulse(now) : (Math.sin(now / 280) + 1) / 2, !!G.lastStand);
  // RFC stage-themes-modes §2.1: motif viền theo ải — SAU BorderFX, DƯỚI StageFX (mechanic trên cùng)
  drawThemeBorder(ctx, W, H, now);
  // RFC stage-themes-modes §3.3 (DEV-05/DEV-06): HUD mode mới (countdown / tiến trình boss)
  try { if (window.Modes) Modes.drawHUD(ctx, W); } catch (e) {}

  /* ---------- HUD (H3: 2 cụm — pill trái + % nguyên vẹn phải) ---------- */
  ctx.textAlign = "left";
  const hudIcon = (id, px, color, x, y, fill) => { try { HUDIcons.draw(ctx, id, px, color, x, y, fill); } catch (e) {} };
  const coarseHUD = (touch && touch.active) || (window.matchMedia && window.matchMedia("(pointer:coarse)").matches);
  const hsc = W < 560 ? 0.85 : 1; // mobile: cả cụm trái scale 0.85
  const rr = (x, y, w, h, r) => { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); };

  /* ---- chip pickup (A2): thứ tự cố định Shield -> Khiên cửa sổ -> Magnet -> Overdrive ---- */
  const shState = (typeof shieldSat === "function") ? shieldSat() : null;
  const chips = [];
  if (s.shieldT > 0) chips.push({ icon: "i-shield", ic: "#38bdf8", text: Math.ceil(s.shieldT) + "s", tc: "#38bdf8", bg: "rgba(56,189,248,0.14)" });
  if (shState) {
    if (shState.sim) {
      const simLabel = I18N.t("hud.shield_sim", { hearts: "" }).replace(/\s*[×x]\s*$/, "");
      chips.push({ icon: "i-window", ic: "#38bdf8", text: simLabel, tc: "#38bdf8", bg: "rgba(56,189,248,0.14)", hearts: Math.max(0, shState.hearts ?? 5) });
    } else {
      chips.push({ icon: "i-window", ic: "#38bdf8", text: I18N.t("hud.shield_popup", { px: Math.ceil(shState.shieldPx ?? 60) }), tc: "#38bdf8", bg: "rgba(56,189,248,0.14)" });
    }
  }
  if (s.magnetT > 0) chips.push({ icon: "i-magnet", ic: "#ff7ad9", text: Math.ceil(s.magnetT) + "s", tc: "#ff7ad9", bg: "rgba(255,122,217,0.14)" });
  if (s.overdriveT > 0) chips.push({ icon: "i-bolt", ic: "#ffe14d", text: Math.ceil(s.overdriveT) + "s", tc: "#ffe14d", bg: "rgba(255,225,77,0.14)" });
  if (s.glueGun) { // Súng Bắn Keo: chip hiện hồi chiêu — sẵn sàng thì gợi ý phím E
    const gg = s.glueGun, ready = (gg.cd || 0) <= 0;
    chips.push({ icon: "i-heart-plus", ic: "#9df3ff", text: ready ? "E" : Math.ceil(gg.cd) + "s",
      tc: ready ? "#9df3ff" : "#7d8aa0",
      bg: ready ? "rgba(157,243,255,0.16)" : "rgba(125,138,160,0.10)" });
  }

  const CHIP_FONT = "700 13px " + HUDFONT;
  const chipW = (c) => {
    ctx.font = CHIP_FONT;
    let w = 8 + 14 + 5 + ctx.measureText(c.text).width + 8;
    if (c.hearts) w += 5 + c.hearts * 12 + (c.hearts - 1) * 4; // N tim 12px sau text
    return w;
  };

  /* ---- cụm TRÁI: 1 pill duy nhất (tọa độ local, gốc tại 14,10) ---- */
  ctx.save();
  ctx.translate(14, 10);
  ctx.scale(hsc, hsc);
  const padX = 12, padY = 8, baseA = 24, baseB = 50; // local (global y: 34/60)
  // đo hàng A
  // PERF #3: HP bar từng O(maxHp) drawImage/frame — cap 12 icon tim + "+N" cho phần dư.
  const HP_ICON_CAP = 12;
  const heartsDrawn = Math.min(s.maxHp, HP_ICON_CAP);
  const heartsExtra = s.maxHp - heartsDrawn;
  let heartsW = heartsDrawn * 18 + Math.max(0, heartsDrawn - 1) * 5;
  if (heartsExtra > 0) {
    ctx.font = "700 13px " + HUDFONT;
    heartsW += 6 + ctx.measureText("+" + heartsExtra).width;
  }
  const chipsW = chips.reduce((a, c, i) => a + chipW(c) + (i ? 6 : 0), 0);
  const rowAW = heartsW + (chips.length ? 12 + chipsW : 0);
  // đo hàng B
  ctx.font = "700 15px " + HUDFONT;
  const waveTxt = "WAVE " + Math.max(1, G.wave);
  ctx.font = "600 15px " + HUDFONT;
  const killsTxt = String(Math.floor(G.kills)), scoreTxt = String(Math.floor(G.score));
  const comboTxt = "x" + Math.floor(G.combo);
  const wWave = ctx.measureText(waveTxt).width, wKills = ctx.measureText(killsTxt).width,
        wScore = ctx.measureText(scoreTxt).width, wCombo = ctx.measureText(comboTxt).width;
  let rowBW = 16 + 6 + wWave + 16 + 15 + 6 + wKills + 16 + 15 + 6 + wScore;
  if (G.combo >= 3) rowBW += 16 + 15 + 6 + wCombo;
  // XP bar (giữ công thức cũ)
  const xpw = Math.max(120, Math.min(220, W * 0.45));
  ctx.font = "13px " + HUDFONT;
  const lvTxt = "Lv " + G.level;
  const xpRowW = xpw + 8 + ctx.measureText(lvTxt).width;
  const pillW = padX * 2 + Math.max(rowAW, rowBW, xpRowW), pillH = 74;
  // vẽ pill
  rr(0, 0, pillW, pillH, 12);
  ctx.fillStyle = "rgba(5,11,23,0.62)"; ctx.fill();
  ctx.strokeStyle = "rgba(0,128,255,0.30)"; ctx.lineWidth = 1; ctx.stroke();
  // hàng A: tim HP + chip
  let ax = padX;
  for (let i = 0; i < heartsDrawn; i++) {
    const full = i < s.hp;
    hudIcon("i-heart", 18, full ? "#ff5470" : "#42557a", ax + 9, baseA - 5, full);
    ax += 18 + 5;
  }
  if (heartsExtra > 0) { // phần HP vượt cap: gọn thành "+N", không vẽ thêm icon
    ctx.font = "700 13px " + HUDFONT;
    ctx.fillStyle = "#ff8fa3"; ctx.textAlign = "left";
    const plusTxt = "+" + heartsExtra;
    ctx.fillText(plusTxt, ax + 6, baseA);
    ax += 6 + ctx.measureText(plusTxt).width + 12;
  } else {
    ax += 12 - 5; // gap 12 sau tim (đã cộng 5 ở vòng cuối)
  }
  for (const c of chips) {
    const cw = chipW(c), cy = baseA - 5 - 12; // chip cao 24, tâm theo baseline-5
    rr(ax, cy, cw, 24, 8);
    ctx.fillStyle = c.bg; ctx.fill();
    hudIcon(c.icon, 14, c.ic, ax + 8 + 7, baseA - 5);
    ctx.font = CHIP_FONT; ctx.fillStyle = c.tc; ctx.textAlign = "left";
    const tx = ax + 8 + 14 + 5;
    ctx.fillText(c.text, tx, baseA);
    if (c.hearts) {
      let hx = tx + ctx.measureText(c.text).width + 5 + 6;
      for (let hi = 0; hi < c.hearts; hi++) { hudIcon("i-heart", 12, "#38bdf8", hx, baseA - 5, true); hx += 12 + 4; }
    }
    ax += cw + 6;
  }
  // hàng B: wave / kills / score / combo
  let bx = padX;
  const segB = (icon, px, ic, txt, font, tc, fill) => {
    hudIcon(icon, px, ic, bx + px / 2, baseB - 5, fill);
    bx += px + 6;
    ctx.font = font; ctx.fillStyle = tc; ctx.textAlign = "left";
    ctx.fillText(txt, bx, baseB);
    bx += ctx.measureText(txt).width + 16;
  };
  hudIcon("i-wave", 16, "#0080FF", bx + 8, baseB - 5);
  bx += 16 + 6;
  ctx.font = "700 15px " + HUDFONT; ctx.fillStyle = "#F2F7FF"; ctx.textAlign = "left";
  ctx.fillText(waveTxt, bx, baseB); bx += wWave + 16;
  segB("i-skull", 15, "#c9b8e0", killsTxt, "600 15px " + HUDFONT, "#F2F7FF");
  segB("i-star", 15, "#ffd23f", scoreTxt, "600 15px " + HUDFONT, "#F2F7FF", true);
  if (G.combo >= 3) segB("i-fire", 15, "#ff9d3f", comboTxt, "700 15px " + HUDFONT, "#ff9d3f", true);
  // thanh XP
  rr(padX, 60, xpw, 8, 4);
  ctx.fillStyle = "rgba(255,255,255,0.09)"; ctx.fill();
  const xpf = xpw * Math.min(1, G.xp / G.xpNeed);
  if (xpf > 0.5) { rr(padX, 60, xpf, 8, 4); ctx.fillStyle = "#7df9ff"; ctx.fill(); }
  ctx.font = "13px " + HUDFONT; ctx.fillStyle = "#c9b8e0"; ctx.textAlign = "left";
  ctx.fillText(lvTxt, padX + xpw + 8, 68);
  ctx.restore();

  /* ---- cụm PHẢI: % nguyên vẹn cửa sổ (H1: bar cũ đã thay bằng decal viền diegetic) ---- */
  const rPad = coarseHUD ? 64 : 116;
  ctx.font = "600 13px " + HUDFONT; ctx.fillStyle = "#c9b8e0"; ctx.textAlign = "right";
  const wpctTxt = I18N.t("hud.window_pct", { pct: Math.round(winPct * 100) });
  ctx.fillText(wpctTxt, W - rPad, 40);
  const wpctW = ctx.measureText(wpctTxt).width;
  hudIcon("i-window", 15, "#8fb0d8", W - rPad - wpctW - 6 - 7.5, 40 - 5);
  ctx.textAlign = "left";
  // boss bar (v2.0: boss module vẽ thanh 3 nấc khi active)
  var v2bar = false;
  if (window.V2) { try { v2bar = V2.bossBar(); } catch (e) {} }
  if (!v2bar && bs && !bs.dead) {
    const bbw = Math.min(560, W - 120);
    const bby = W < 760 ? 92 : 12; // H3/A1: tránh đè pill trái trên màn hẹp
    ctx.fillStyle = "#000000aa"; ctx.fillRect((W - bbw) / 2, bby, bbw, 14);
    ctx.fillStyle = "#c084fc"; ctx.fillRect((W - bbw) / 2, bby, bbw * clamp(bs.hp / bs.maxHp, 0, 1), 14);
    ctx.fillStyle = "#fff"; ctx.font = "bold 13px sans-serif"; ctx.textAlign = "center";
    ctx.fillText(bs.name || "BOSS", W / 2, bby + 12); ctx.textAlign = "left";
  }
    
   
     // banner
     // hint điều khiển chỉ hiện 6 giây đầu mỗi lượt chơi (render-local, không chạm update)
        if (G.phase !== "play") { G._hintArmed = false; }
           if (G.phase === "play" && !G._hintArmed) { G._hintArmed = true; G._hintUntil = now + 6000; }
              if (typeof G._hintUntil !== "number") G._hintUntil = 0;
                 if (now < G._hintUntil) {
                  ctx.fillStyle = "#8f7bb5"; ctx.font = "13px sans-serif";
    ctx.fillText(touch.active ? I18N.t("hud.controls_mobile") : I18N.t("hud.controls"), 14, H - 14); }

   
   // banner
   if (G.bannerT > 0) {
    ctx.globalAlpha = Math.min(1, G.bannerT);
    ctx.fillStyle = "#ffd7f4";
    // MOBILE 2026-10-03: banner dài (vd "⭐ Điểm = tổng điểm gốc — không nhân.")
    // bị cắt 2 mép trên màn hình hẹp (iPhone 375-390px) → co font cho vừa 94% rộng
    let _bfs = 44;
    ctx.font = "bold 44px sans-serif"; ctx.textAlign = "center";
    try {
      // GC-2026-10: đo width 1 lần/banner (trước: đo mỗi frame trong ~2.4s banner hiện)
      if (G._bwKey !== G.banner) {
        G._bwKey = G.banner;
        ctx.font = "bold 44px sans-serif";
        G._bw = ctx.measureText(G.banner || "").width;
      }
      const _btw = G._bw;
      if (_btw > W * 0.94) { _bfs = Math.max(18, Math.floor(44 * W * 0.94 / _btw)); ctx.font = "bold " + _bfs + "px sans-serif"; }
    } catch (e) {}
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
    // GC-2026-10: cache hình gradient theo W,H; nhịp đập đưa qua globalAlpha
    // (fillStyle alpha × globalAlpha = đúng màu gốc, không đổi visual)
    const _vgKey = W + "x" + H;
    if (!_dangerVg || _dangerVgKey !== _vgKey) {
      _dangerVg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
      _dangerVg.addColorStop(0, "rgba(255,40,70,0)"); _dangerVg.addColorStop(1, "rgba(255,40,70,1)");
      _dangerVgKey = _vgKey;
    }
    const vg = _dangerVg;
    ctx.globalAlpha = 0.18 + 0.22 * p;
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }
  // STAGE-MECH ải 1: flash xanh "reboot" khi hạ boss tốt nghiệp tân binh
  try { if (window.StageMech) StageMech.drawFlash(ctx, W, H); } catch (erf) {}
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

