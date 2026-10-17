/* WINDOWKILL Web Edition — "Deep Dever" procedural background.
 * Triết lý: brand hiện diện qua ánh sáng, không qua màu chói.
 * Nền là mặt nước tối — gameplay là ánh đèn trên mặt nước.
 * Spec: studio/game-design/BACKGROUND-ART-DIRECTION.md
 * 100% procedural, không bitmap. API: BG.build / BG.draw / BG.setDanger /
 * BG.setBlackout / BG.setDim / BG.setQuality. Plain script, không module. */
"use strict";

const BG = (() => {
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

  /* ---------- palette 5 ải (token theo art-direction §2) ----------
     RFC stage-themes-modes §2.1: theme = 3 lớp MỞ RỘNG (decor + border + tintHue),
     palette màu gốc giữ nguyên 100%. Mọi field trong theme optional — thiếu =
     fallback an toàn (decor rỗng, border rỗng, tintHue 0). */
  const PALETTES = {
    1: { // MÀN HÌNH XANH — xanh Dever trầm
      base0: "#04070F", base1: "#0A1626",
      nebulas: [
        { c: "#0066CC", a: 0.10, r: 0.55, x: 0.50, y: 0.28 },
        { c: "#004C99", a: 0.12, r: 0.45, x: 0.50, y: 0.85 },
      ],
      grid: { type: "square", c: "#2E6DB4", a: 0.06, sp: 56 },
      parts: { n: 40, c: "#66B2FF", aMin: 0.20, aMax: 0.38, mode: "drift", spMin: 8, spMax: 14, square: true },
      vignette: 0.50, watermark: true,
      theme: { // "Màn Hình Xanh Chết Chóc" (BSOD vui vẻ)
        decor: {
          statics: [
            { kind: "rect", x: 0.06, y: 0.18, w: 110, h: 78, r: 8, c: "#2E6DB4", a: 0.10, tb: "#2E6DB4" },
            { kind: "rect", x: 0.78, y: 0.30, w: 90, h: 64, r: 8, c: "#2E6DB4", a: 0.10, tb: "#2E6DB4" },
            { kind: "rect", x: 0.30, y: 0.62, w: 120, h: 84, r: 8, c: "#2E6DB4", a: 0.10, tb: "#2E6DB4" },
            { kind: "rect", x: 0.60, y: 0.70, w: 96, h: 68, r: 8, c: "#2E6DB4", a: 0.10, tb: "#2E6DB4" },
            { kind: "rect", x: 0.15, y: 0.78, w: 84, h: 60, r: 8, c: "#2E6DB4", a: 0.10, tb: "#2E6DB4" },
            { kind: "rect", x: 0.86, y: 0.62, w: 100, h: 72, r: 8, c: "#2E6DB4", a: 0.10, tb: "#2E6DB4" },
            { kind: "rect", x: 0, y: 0.52, w: 4000, h: 3, r: 0, c: "#66B2FF", a: 0.06 },
            { kind: "text", x: 0.93, y: 0.10, text: ":-(", size: 64, c: "#ffffff", a: 0.05 },
          ],
          animated: [
            { kind: "scanline", count: 3, speed: 12, c: "#66B2FF", a: 0.08, h: 2 },
          ],
        },
        border: { kind: "rounded", colors: ["#2E6DB4"], width: 3, sync: "none" },
        tintHue: 8,
      },
    },
    2: { // TƯỜNG LỬA — cam đất
      base0: "#0B0605", base1: "#170C07",
      nebulas: [
        { c: "#CC3300", a: 0.07, r: 0.50, x: 0.50, y: 0.30 },
        { c: "#7A1F00", a: 0.10, r: 0.40, x: 0.50, y: 0.80 },
      ],
      grid: { type: "hex", c: "#B34A1F", a: 0.05, sp: 34 },
      parts: { n: 36, c: "#FF9A4D", aMin: 0.25, aMax: 0.42, mode: "rise", spMin: 20, spMax: 40 },
      vignette: 0.55,
      theme: { // "Lò Lửa Firewall"
        decor: {
          statics: [
            { kind: "bricks", rows: 2, c: "#7A2E12", a: 0.50 },
            { kind: "chimney", x: 0.06, w: 36, h: 64, c: "#5a2310", a: 0.60 },
            { kind: "chimney", x: 0.13, w: 30, h: 48, c: "#5a2310", a: 0.60 },
            { kind: "chimney", x: 0.90, w: 36, h: 64, c: "#5a2310", a: 0.60 },
          ],
          animated: [
            { kind: "spark", count: 12, c: "#FF9A4D", a: 0.80 },
          ],
        },
        // hào quang lửa đồng bộ chu kỳ gai ải 2 (đọc cùng state StageFX.spikesOn)
        border: { kind: "fire", colors: ["#FF6A00"], width: 6, sync: "spikes" },
        tintHue: -10,
      },
    },
    3: { // TRỌNG LỰC 404 — tím vũ trụ
      base0: "#080514", base1: "#130B30",
      nebulas: [
        { c: "#3A0CA3", a: 0.12, r: 0.55, x: 0.50, y: 0.35 },
        { c: "#7209B7", a: 0.06, r: 0.38, x: 0.50, y: 0.80 },
      ],
      grid: { type: "swirl", c: "#9D4EDD", a: 0.05, rings: 5 },
      parts: { n: 44, c: "#C4B5FD", aMin: 0.22, aMax: 0.40, mode: "orbit", wMin: 0.05, wMax: 0.12 },
      vignette: 0.50,
      theme: { // "Hố Đen Trọng Lực 404"
        decor: {
          statics: [
            { kind: "text", x: 0.15, y: 0.25, text: "404", size: 56, rot: 0.4, c: "#9D4EDD", a: 0.12 },
            { kind: "text", x: 0.82, y: 0.20, text: "404", size: 44, rot: -0.5, c: "#9D4EDD", a: 0.12 },
            { kind: "text", x: 0.75, y: 0.78, text: "404", size: 64, rot: 0.2, c: "#9D4EDD", a: 0.12 },
            { kind: "text", x: 0.20, y: 0.72, text: "404", size: 40, rot: -0.3, c: "#9D4EDD", a: 0.12 },
            { kind: "text", x: 0.55, y: 0.12, text: "404", size: 48, rot: 0.6, c: "#9D4EDD", a: 0.12 },
            { kind: "blackhole", x: 0.50, y: 0.42, r: 90 },
          ],
          animated: [
            { kind: "orbit", count: 8, cx: 0.50, cy: 0.42, r: 115, c: "#C4B5FD", a: 0.70, speed: 0.5 },
          ],
        },
        border: { kind: "swirl", colors: ["#3A0CA3", "#7209B7"], width: 3, sync: "none" },
        tintHue: 12,
      },
    },
    4: { // CÚP ĐIỆN — gần như đen
      base0: "#020204", base1: "#0A0A14",
      nebulas: [ { c: "#00E5FF", a: 0.05, r: 0.40, x: 0.50, y: 0.50 } ],
      grid: { type: "flicker", c: "#00E5FF", aMin: 0.02, aMax: 0.07, sp: 64 },
      parts: { n: 28, c: "#7DF9FF", aMin: 0.20, aMax: 0.35, mode: "fall", spMin: 60, spMax: 120, lifeMin: 1, lifeMax: 2 },
      vignette: 0.65,
      theme: { // "Thành Phố Cúp Điện"
        decor: {
          statics: [
            { kind: "bulb", x: 0.18, y: 0.30, s: 1.1, c: "#00E5FF", a: 0.12 },
            { kind: "bulb", x: 0.42, y: 0.55, s: 0.9, c: "#00E5FF", a: 0.12 },
            { kind: "bulb", x: 0.68, y: 0.28, s: 1.0, c: "#00E5FF", a: 0.12 },
            { kind: "bulb", x: 0.85, y: 0.60, s: 0.85, c: "#00E5FF", a: 0.12 },
            { kind: "line", x1: 0.05, y1: 0.12, x2: 0.95, y2: 0.30, c: "#00E5FF", a: 0.10, w: 2 },
          ],
          animated: [
            { kind: "flicker", count: 6, c: "#BFF3FF", a: 0.50 },
          ],
        },
        // viền neon theo blackout (cùng state BG.setBlackout)
        border: { kind: "neon", colors: ["#00E5FF"], width: 3, sync: "blackout" },
        tintHue: 0,
      },
    },
    5: { // TRÀN BỘ NHỚ — xanh lá độc → đỏ cảnh báo
      base0: "#060A04", base1: "#0F1C09",
      nebulas: [ { c: "#2D6A00", a: 0.10, r: 0.50, x: 0.50, y: 0.40 } ],
      dangerNeb: { c: "#4A0000", aMax: 0.12, r: 0.55, x: 0.50, y: 0.60 },
      grid: { type: "square", c: "#4A7C2E", a: 0.05, sp: 52 },
      parts: { n: 24, c: "#4ADE80", a: 0.10, mode: "hexrain", spMin: 30, spMax: 70 },
      vignette: 0.55,
      theme: { // "Vùng Tràn Bộ Nhớ"
        decor: {
          statics: [
            { kind: "memblock", x: 0.03, y: 0.04, w: 70, h: 44, c: "#4ADE80", a: 0.16 },
            { kind: "memblock", x: 0.10, y: 0.10, w: 60, h: 38, c: "#4ADE80", a: 0.14 },
            { kind: "memblock", x: 0.05, y: 0.15, w: 52, h: 34, c: "#4ADE80", a: 0.12 },
            { kind: "memblock", x: 0.88, y: 0.04, w: 70, h: 44, c: "#4ADE80", a: 0.16 },
            { kind: "memblock", x: 0.82, y: 0.10, w: 60, h: 38, c: "#4ADE80", a: 0.14 },
            { kind: "memblock", x: 0.90, y: 0.15, w: 52, h: 34, c: "#4ADE80", a: 0.12 },
            { kind: "memblock", x: 0.03, y: 0.82, w: 70, h: 44, c: "#4ADE80", a: 0.16 },
            { kind: "memblock", x: 0.10, y: 0.76, w: 60, h: 38, c: "#4ADE80", a: 0.14 },
            { kind: "memblock", x: 0.05, y: 0.70, w: 52, h: 34, c: "#4ADE80", a: 0.12 },
            { kind: "memblock", x: 0.88, y: 0.82, w: 70, h: 44, c: "#4ADE80", a: 0.16 },
            { kind: "memblock", x: 0.82, y: 0.76, w: 60, h: 38, c: "#4ADE80", a: 0.14 },
            { kind: "memblock", x: 0.90, y: 0.70, w: 52, h: 34, c: "#4ADE80", a: 0.12 },
          ],
          animated: [
            { kind: "fallblock", count: 4, c: "#4ADE80", a: 0.25, speed: 20 },
          ],
        },
        // viền lerp xanh→đỏ theo danger nội bộ của BG
        border: { kind: "danger", colors: ["#4ADE80", "#FF3B30"], width: 4, sync: "danger" },
        tintHue: -12,
      },
    },
  };

  /* ---------- state ---------- */
  let stageId = 1, W = 0, H = 0, lastT = 0;
  let quality = "full";
  let reducedMotion = false;
  let danger = 0, dangerT = 0;
  let blackout = 0, blackoutT = 0;
  let dim = 0, dimT = 0;
  let base = null;        // offscreen L0+L2+L5 (hoặc mảng 3 frame nếu flicker)
  let neb = null;         // offscreen L1
  // GC-2026-10: cache gradient danger-nebula (vẽ mỗi frame khi danger>0; x/y/r cố định theo build)
  let dnebG = null, dnebKey = "";
  let parts = [];         // pool particle
  let hexStrips = [];     // filmstrip mưa hex (ải 5)
  let cols = [];          // cột mưa hex

  if (typeof window !== "undefined" && window.matchMedia) {
    try { reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
  }
  const reduced = () => reducedMotion || quality === "reduced";

  function mkCanvas(w, h) {
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
    return c;
  }
  const R = (a, b) => a + Math.random() * (b - a);

  /* ---------- prerender helpers ---------- */
  function paintBase(ctx, pal, gridAlpha) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, pal.base0); g.addColorStop(1, pal.base1);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    paintGrid(ctx, pal, gridAlpha);
    paintDecorStatic(ctx, pal); // RFC stage-themes-modes: decor static bake vào offscreen
    if (pal.watermark) {
      ctx.save();
      ctx.globalAlpha = 0.035; ctx.fillStyle = "#fff";
      ctx.font = "700 28px system-ui, sans-serif"; ctx.textAlign = "right"; ctx.textBaseline = "alphabetic";
      ctx.fillText("FU-DEVER", W - 24, H - 24);
      ctx.restore();
    }
    // L5 vignette: viền tối + tâm combat tối thêm 10% (quy tắc B5)
    const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, `rgba(0,0,0,${pal.vignette})`);
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    const c = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.min(W, H) * 0.45);
    c.addColorStop(0, "rgba(0,0,0,0.10)"); c.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = c; ctx.fillRect(0, 0, W, H);
  }

  function hexPath(ctx, x, y, s) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 3 * i + Math.PI / 6;
      const px = x + s * Math.cos(a), py = y + s * Math.sin(a);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  function paintGrid(ctx, pal, alphaOverride) {
    const gr = pal.grid, a = alphaOverride !== undefined ? alphaOverride : gr.a;
    ctx.save();
    ctx.strokeStyle = gr.c; ctx.globalAlpha = a; ctx.lineWidth = 1;
    if (gr.type === "square" || gr.type === "flicker") {
      ctx.beginPath();
      for (let x = 0.5; x <= W; x += gr.sp) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
      for (let y = 0.5; y <= H; y += gr.sp) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
      ctx.stroke();
    } else if (gr.type === "hex") {
      const s = gr.sp, w = Math.sqrt(3) * s, hStep = 1.5 * s;
      let row = 0;
      for (let y = -s; y < H + s; y += hStep, row++) {
        for (let x = -w + (row % 2 ? w / 2 : 0); x < W + w; x += w) { hexPath(ctx, x, y, s); ctx.stroke(); }
      }
    } else if (gr.type === "swirl") {
      const cx = W / 2, cy = H / 2, maxR = Math.max(W, H) * 0.55;
      for (let i = 1; i <= gr.rings; i++) {
        ctx.beginPath(); ctx.arc(cx, cy, maxR * i / gr.rings, 0, TAU); ctx.stroke();
      }
      for (let arm = 0; arm < 3; arm++) { // tay xoáy
        ctx.beginPath();
        for (let k = 0; k <= 60; k++) {
          const ang = k / 60 * Math.PI * 4 + arm * TAU / 3;
          const r = maxR * 0.12 + maxR * 0.78 * k / 60;
          const px = cx + r * Math.cos(ang), py = cy + r * Math.sin(ang) * 0.82;
          if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /* ---------- RFC stage-themes-modes §2.1: decor theo ải ----------
     Statics: vẽ 1 lần trong paintBase() → bake vào offscreen base (0 draw-call/frame).
     Animated: ≤12 prop/ải, mỗi prop ≤ 6 canvas ops, vẽ ở layer L1.5 (sau nebula);
     đứng yên khi reduced(). Tọa độ x,y ∈ [0,1] theo W,H để chịu resize. */
  let animProps = []; // props animated của stage hiện tại (precompute trong build)
  function paintDecorStatic(ctx, pal) {
    const th = pal.theme, D = th && th.decor;
    if (!D || !D.statics || !D.statics.length) return;
    ctx.save();
    for (const d of D.statics) {
      const x = (d.x || 0) * W, y = (d.y || 0) * H;
      ctx.globalAlpha = d.a == null ? 0.10 : d.a;
      if (d.kind === "rect") { // khung "cửa sổ lỗi" (ải 1) + dải scanline ngang mờ
        const w = d.w || 60, h = d.h || 40;
        ctx.strokeStyle = d.c || "#ffffff"; ctx.lineWidth = 2;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x, y, w, h, d.r == null ? 6 : d.r); else ctx.rect(x, y, w, h);
        ctx.stroke();
        if (d.tb) { // thanh tiêu đề cửa sổ
          ctx.fillStyle = d.tb;
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(x, y, w, 14, [d.r == null ? 6 : d.r, d.r == null ? 6 : d.r, 0, 0]);
          else ctx.rect(x, y, w, 14);
          ctx.fill();
        }
      } else if (d.kind === "text") { // glyph ":-(" (ải 1) / mảnh "404" vỡ (ải 3)
        ctx.fillStyle = d.c || "#ffffff";
        ctx.font = "700 " + (d.size || 48) + "px system-ui, sans-serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        if (d.rot) { ctx.save(); ctx.translate(x, y); ctx.rotate(d.rot); ctx.fillText(d.text || "", 0, 0); ctx.restore(); }
        else ctx.fillText(d.text || "", x, y);
      } else if (d.kind === "bricks") { // dải tường gạch nung dọc mép dưới (ải 2)
        const bh = 24, rows = d.rows || 2, bw = 24;
        ctx.fillStyle = d.c || "#7A2E12";
        for (let rI = 0; rI < rows; rI++) {
          const yy = H - (rI + 1) * bh, off = (rI % 2) * bw / 2;
          for (let xx = -bw; xx < W + bw; xx += bw) ctx.fillRect(xx + off, yy + 2, bw - 3, bh - 4);
        }
      } else if (d.kind === "chimney") { // ống khói pixel (ải 2) — tia lửa animated bay từ miệng
        const cw = d.w || 36, ch = d.h || 64;
        ctx.fillStyle = d.c || "#5a2310";
        ctx.fillRect(x - cw / 2, H - ch, cw, ch);
        ctx.fillRect(x - cw / 2 - 4, H - ch, cw + 8, 10);
      } else if (d.kind === "blackhole") { // hố đen decor (ải 3): vòng xoáy static + vành sáng tím
        const br = d.r || 90;
        const g = ctx.createRadialGradient(x, y, br * 0.2, x, y, br * 1.6);
        g.addColorStop(0, "rgba(20,8,40,0.85)");
        g.addColorStop(0.55, "rgba(58,12,163,0.35)");
        g.addColorStop(1, "rgba(58,12,163,0)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, br * 1.6, 0, TAU); ctx.fill();
        ctx.strokeStyle = "#9D4EDD"; ctx.lineWidth = 3;
        for (let i = 1; i <= 3; i++) { ctx.beginPath(); ctx.arc(x, y, br * (0.35 + i * 0.22), 0, TAU); ctx.stroke(); }
        ctx.strokeStyle = "rgba(196,181,253,0.5)"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, br * 1.02, 0, TAU); ctx.stroke();
      } else if (d.kind === "bulb") { // bóng đèn vỡ treo lơ lửng (ải 4)
        const s2 = d.s || 1;
        ctx.strokeStyle = d.c || "#00E5FF"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x, y - 46 * s2); ctx.lineTo(x, y - 18 * s2); ctx.stroke();
        ctx.beginPath(); ctx.arc(x, y, 16 * s2, 0, TAU); ctx.stroke();
        ctx.fillStyle = d.c || "#00E5FF";
        ctx.fillRect(x - 7 * s2, y - 26 * s2, 14 * s2, 8 * s2);
        ctx.beginPath();
        ctx.moveTo(x - 8 * s2, y - 8 * s2); ctx.lineTo(x + 2 * s2, y + 2 * s2);
        ctx.lineTo(x - 4 * s2, y + 10 * s2); ctx.stroke();
      } else if (d.kind === "line") { // đường dây điện pixel chéo góc (ải 4)
        ctx.strokeStyle = d.c || "#ffffff"; ctx.lineWidth = d.w || 2;
        ctx.beginPath();
        ctx.moveTo((d.x1 || 0) * W, (d.y1 || 0) * H);
        ctx.lineTo((d.x2 == null ? 1 : d.x2) * W, (d.y2 == null ? 1 : d.y2) * H);
        ctx.stroke();
      } else if (d.kind === "memblock") { // "memory block" rò rỉ ở 4 góc (ải 5)
        const mw = d.w || 70, mh = d.h || 44;
        ctx.fillStyle = d.c || "#4ADE80";
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x, y, mw, mh, 8); else ctx.rect(x, y, mw, mh);
        ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.35)"; ctx.lineWidth = 2;
        for (let gi = 1; gi <= 3; gi++) {
          ctx.beginPath(); ctx.moveTo(x + mw * gi / 4, y + 6); ctx.lineTo(x + mw * gi / 4, y + mh - 6); ctx.stroke();
        }
      }
    }
    ctx.restore();
  }
  function buildAnimProps(pal) {
    const out = [];
    const th = pal.theme, D = th && th.decor;
    const A = (D && D.animated) || [];
    const chimX = [];
    for (const d of ((D && D.statics) || [])) if (d.kind === "chimney") chimX.push(d.x || 0);
    for (const a of A) {
      const n = Math.min(a.count || 0, 12);
      for (let i = 0; i < n; i++) {
        const seed = ((i + 1) * 0.6180339887) % 1;
        const p = { kind: a.kind, i, seed, c: a.c, a: a.a, h: a.h };
        if (a.kind === "scanline") { p.y0 = (i + 0.25) / n; p.speed = (a.speed || 12) * (0.8 + seed * 0.4); }
        else if (a.kind === "spark") { p.chx = chimX.length ? chimX[i % chimX.length] : 0.1 * (i + 1); p.ph = seed * TAU; p.sp = 40 + seed * 40; }
        else if (a.kind === "orbit") { p.cx = a.cx == null ? 0.5 : a.cx; p.cy = a.cy == null ? 0.5 : a.cy; p.ang = seed * TAU; p.or = (a.r || 110) * (0.85 + seed * 0.3); p.w = (a.speed || 0.5) * (seed < 0.5 ? 1 : -1); }
        else if (a.kind === "fallblock") { p.x = seed; p.y0 = i / n; p.sp = a.speed || 20; p.w = 54 + seed * 30; p.h = 34 + seed * 18; }
        else if (a.kind === "flicker") { p.x = 0.15 + seed * 0.7; p.y = 0.2 + ((seed * 7) % 1) * 0.5; p.ph = seed * TAU; }
        out.push(p);
      }
    }
    return out;
  }
  function drawDecorAnim(ctx, pal, t) {
    if (!animProps.length) return;
    const rd = reduced(), tt = rd ? 0 : t / 1000;
    ctx.save();
    for (const p of animProps) {
      if (p.kind === "scanline") { // ải 1: scanline mỏng trôi chậm dọc
        const y = ((p.y0 + tt * p.speed / H) % 1) * H;
        ctx.globalAlpha = p.a; ctx.fillStyle = p.c;
        ctx.fillRect(0, y, W, p.h || 2);
      } else if (p.kind === "spark") { // ải 2: tia lửa từ miệng ống khói bay lên
        const rise = (tt * p.sp + p.ph * 40) % 160;
        const x = p.chx * W + Math.sin(tt * 3 + p.ph) * 8, y = H - 64 - rise;
        ctx.globalAlpha = p.a * (1 - rise / 160);
        ctx.fillStyle = p.c;
        ctx.beginPath(); ctx.arc(x, y, 2.2, 0, TAU); ctx.fill();
      } else if (p.kind === "orbit") { // ải 3: hạt quay quanh hố đen (quỹ đạo tròn chậm)
        const ang = p.ang + tt * p.w;
        const x = p.cx * W + Math.cos(ang) * p.or, y = p.cy * H + Math.sin(ang) * p.or * 0.8;
        ctx.globalAlpha = p.a; ctx.fillStyle = p.c;
        ctx.beginPath(); ctx.arc(x, y, 2.4, 0, TAU); ctx.fill();
      } else if (p.kind === "fallblock") { // ải 5: block "rơi" chậm từ mép trên (loop)
        const y = ((p.y0 + tt * p.sp / H) % 1.2 - 0.1) * H;
        ctx.globalAlpha = p.a; ctx.fillStyle = p.c;
        ctx.fillRect(p.x * W - p.w / 2, y, p.w, p.h);
      } else if (p.kind === "flicker") { // ải 4: tia lửa tĩnh điện — CHỈ khi đèn đang sáng
        if (blackoutT > 0.5) continue;
        if (Math.sin(tt * 13 + p.ph) <= 0.2) continue;
        const x = p.x * W, y = p.y * H;
        ctx.globalAlpha = p.a; ctx.strokeStyle = p.c; ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x - 6, y); ctx.lineTo(x - 2, y - 5); ctx.lineTo(x + 3, y + 1); ctx.lineTo(x + 7, y - 4);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function paintNebula(ctx, pal) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const m = Math.max(W, H);
    for (const n of pal.nebulas) {
      const r = n.r * m, x = n.x * W, y = n.y * H;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, n.c);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.globalAlpha = n.a; // alpha đỉnh = đúng token spec
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.restore();
  }

  function initParts(pal) {
    parts = [];
    const P = pal.parts, n = P.n;
    for (let i = 0; i < n; i++) {
      const p = { x: R(0, W), y: R(0, H), tw: R(0, TAU) };
      if (P.mode === "drift" || P.mode === "rise" || P.mode === "fall") {
        const sp = R(P.spMin, P.spMax), an = P.mode === "drift" ? R(0, TAU) : (P.mode === "rise" ? -Math.PI / 2 + R(-0.3, 0.3) : Math.PI / 2 + R(-0.2, 0.2));
        p.vx = Math.cos(an) * sp; p.vy = Math.sin(an) * sp;
        if (P.mode === "fall") { p.life = R(P.lifeMin, P.lifeMax); p.maxLife = p.life; }
        if (P.mode === "rise") p.fade = Math.random();
      } else if (P.mode === "orbit") {
        p.cx = R(0, W); p.cy = R(0, H); p.orbitR = R(30, 160);
        p.w = R(P.wMin, P.wMax) * (Math.random() < 0.5 ? 1 : -1); p.ang = R(0, TAU);
      }
      parts.push(p);
    }
    if (pal.parts.mode === "hexrain") initHexRain(pal);
  }

  function initHexRain(pal) {
    hexStrips = []; cols = [];
    const chars = "0123456789ABCDEF";
    for (let s = 0; s < 3; s++) {
      const c = mkCanvas(90, H), x = c.getContext("2d");
      x.font = "10px ui-monospace, monospace"; x.fillStyle = pal.parts.c;
      x.globalAlpha = pal.parts.a * R(0.7, 1.3);
      for (let yy = 8; yy < H; yy += 14)
        for (let xx = 4; xx < 90; xx += 12)
          if (Math.random() < 0.75) x.fillText(chars[(Math.random() * 16) | 0], xx, yy);
      hexStrips.push(c);
    }
    const n = pal.parts.n;
    for (let i = 0; i < n; i++)
      cols.push({ x: (i / n) * W + R(-20, 20), y: R(0, H), sp: R(pal.parts.spMin, pal.parts.spMax), strip: (Math.random() * 3) | 0 });
  }

  /* ---------- public API ---------- */
  function build(sid, w, h) {
    if (!PALETTES[sid]) sid = 1;
    if (sid === stageId && Math.abs(w - W) < 8 && Math.abs(h - H) < 8 && base) return; // resize nhỏ: bỏ qua
    stageId = sid; W = Math.round(w); H = Math.round(h);
    const pal = PALETTES[sid];
    if (pal.grid.type === "flicker") { // 3 frame chập chờn, đảo vòng
      base = [0, 1, 2].map(k => {
        const c = mkCanvas(W, H);
        paintBase(c.getContext("2d"), pal, pal.grid.aMin + (pal.grid.aMax - pal.grid.aMin) * k / 2);
        return c;
      });
    } else {
      const c = mkCanvas(W, H);
      paintBase(c.getContext("2d"), pal);
      base = c;
    }
    neb = mkCanvas(W, H);
    paintNebula(neb.getContext("2d"), pal);
    initParts(pal);
    animProps = buildAnimProps(pal); // RFC stage-themes-modes: props animated theo ải
    lastT = 0;
  }

  function stepParts(pal, dt, t) {
    const P = pal.parts, rd = reduced();
    const count = rd ? Math.ceil(parts.length * 0.4) : parts.length;
    for (let i = 0; i < count; i++) {
      const p = parts[i];
      if (P.mode === "drift") { p.x += p.vx * dt; p.y += p.vy * dt; }
      else if (P.mode === "rise") { p.x += p.vx * dt; p.y += p.vy * dt; p.fade -= dt * 0.25; if (p.fade < 0) p.fade = 1; }
      else if (P.mode === "fall") { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
      else if (P.mode === "orbit") { p.ang += p.w * dt; }
      if (P.mode === "fall" && p.life <= 0) { // tái sinh tia lửa
        p.x = R(0, W); p.y = -4; p.life = p.maxLife = R(P.lifeMin, P.lifeMax);
        const sp = R(P.spMin, P.spMax); p.vx = R(-14, 14); p.vy = sp;
      }
      // wrap-around biên
      if (p.x < -8) p.x += W + 16; if (p.x > W + 8) p.x -= W + 16;
      if (p.y < -8 && P.mode !== "fall") p.y += H + 16; if (p.y > H + 8 && P.mode !== "fall") p.y -= H + 16;
    }
  }

  function drawParts(ctx, pal, t) {
    const P = pal.parts, rd = reduced();
    const count = rd ? Math.ceil(parts.length * 0.4) : parts.length;
    ctx.save();
    ctx.fillStyle = P.c;
    for (let i = 0; i < count; i++) {
      const p = parts[i];
      let x = p.x, y = p.y, a;
      if (P.mode === "orbit") { x = p.cx + Math.cos(p.ang) * p.orbitR; y = p.cy + Math.sin(p.ang) * p.orbitR * 0.8; }
      if (rd) a = (P.aMin + P.aMax) / 2;
      else if (P.mode === "rise") a = P.aMin + (P.aMax - P.aMin) * p.fade;
      else if (P.mode === "fall") a = P.aMin + (P.aMax - P.aMin) * clamp(p.life / p.maxLife, 0, 1);
      else a = P.aMin + (P.aMax - P.aMin) * (0.5 + 0.5 * Math.sin(t / 700 + p.tw)); // twinkle
      ctx.globalAlpha = clamp(a, 0, 1);
      if (P.square) ctx.fillRect(x, y, 2, 2);
      else { ctx.beginPath(); ctx.arc(x, y, 1.4, 0, TAU); ctx.fill(); }
    }
    ctx.restore();
  }

  function drawHexRain(ctx, pal, dt) {
    const rd = reduced();
    const count = rd ? Math.ceil(cols.length * 0.4) : cols.length;
    for (let i = 0; i < count; i++) {
      const c = cols[i], s = hexStrips[c.strip];
      if (!rd) { c.y += c.sp * dt; if (c.y >= H) c.y -= H; }
      ctx.drawImage(s, c.x, c.y - H);
      ctx.drawImage(s, c.x, c.y);
    }
  }

  function draw(ctx, t) {
    const pal = PALETTES[stageId];
    if (!base || !ctx) return;
    const dt = lastT ? clamp((t - lastT) / 1000, 0, 0.05) : 0.016;
    lastT = t;
    const rd = reduced();

    // L0+L2+L5 prerender
    if (Array.isArray(base)) ctx.drawImage(base[rd ? 0 : ((t / 200) | 0) % 3], 0, 0);
    else ctx.drawImage(base, 0, 0);

    // L1 nebula drift ±12px (đứng yên khi reduced)
    if (rd) ctx.drawImage(neb, 0, 0);
    else ctx.drawImage(neb, Math.sin(t * 0.00010) * 12, Math.cos(t * 0.00013) * 12);

    // L1.5 theme decor animated (RFC stage-themes-modes) — sau nebula, trước particles
    drawDecorAnim(ctx, pal, t);

    // L3 particles
    if (pal.parts.mode === "hexrain") drawHexRain(ctx, pal, dt);
    else { stepParts(pal, rd ? 0 : dt, t); drawParts(ctx, pal, t); }

    // L4: danger (ải 5) + blackout (ải 4)
    danger += (dangerT - danger) * Math.min(1, dt * 4);
    if (pal.dangerNeb && danger > 0.01) {
      const d = pal.dangerNeb, m = Math.max(W, H), r = d.r * m, x = d.x * W, y = d.y * H;
      // GC-2026-10: cache gradient (key theo tọa độ + màu; build lại khi đổi stage/resize)
      const dk = x + "," + y + "," + r + "|" + d.c;
      if (!dnebG || dnebKey !== dk) {
        dnebG = ctx.createRadialGradient(x, y, 0, x, y, r);
        dnebG.addColorStop(0, d.c); dnebG.addColorStop(1, "rgba(0,0,0,0)");
        dnebKey = dk;
      }
      const g = dnebG;
      ctx.save(); ctx.globalAlpha = danger * d.aMax; ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.restore();
    }
    blackout += (blackoutT - blackout) * Math.min(1, dt * 5); // fade ~0.4s
    if (blackout > 0.01) { ctx.save(); ctx.globalAlpha = Math.min(0.92, blackout); ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H); ctx.restore(); }

    // L5 dim (boss spawn)
    dim += (dimT - dim) * Math.min(1, dt * 6);
    if (dim > 0.01) { ctx.save(); ctx.globalAlpha = dim; ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H); ctx.restore(); }
  }

  function setDanger(x) { dangerT = clamp(+x || 0, 0, 1); }
  function setBlackout(on) { blackoutT = on ? 0.92 : 0; }
  function setDim(a) { dimT = clamp(+a || 0, 0, 1); }
  function setQuality(q) { quality = q === "reduced" ? "reduced" : "full"; }

  /* RFC stage-themes-modes §3.1: API theme bổ sung */
  function getTheme(sid) {
    const p = PALETTES[sid];
    return (p && p.theme) || {}; // thiếu theme → {} (không throw — F8)
  }
  function getDanger() { return danger; } // giá trị danger đã smooth (cho border ải 5)
  function blackoutOn() { return blackoutT > 0.5; } // cùng state BG.setBlackout dùng (border ải 4)

  return { build, draw, setDanger, setBlackout, setDim, setQuality, PALETTES,
           getTheme, getDanger, blackoutOn,
           get stageId() { return stageId; }, get quality() { return quality; } };
})();

if (typeof module !== "undefined" && module.exports) module.exports = BG;
