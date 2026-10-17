/* WINDOWKILL — Stage Themes test suite (RFC stage-themes-modes, QA-01).
 *
 * Hợp đồng: docs/RFC-stage-themes-modes.md §2.1 (theme 5 ải + endless), §3.1
 * (theme schema), §5.1 (acceptance criteria QA-01), edge case F8.
 * Viết từ SPEC — kỳ vọng lấy từ bảng RFC §2.1, không bám implementation.
 *
 * Map AC §5.1:
 *   theme đủ 3 lớp 5 ải ................ T1 (+ T2 từng ải)
 *   BG.build invalid → fallback ........ T3 (F8)
 *   perf smoke < 2ms/frame ............. T5
 *   reduced → decor đứng yên ........... T5
 *   endless: tint TẮT .................. T8
 *   decor không sinh entity ............ T7
 *   motif viền sau BorderFX/dưới StageFX  T6 (T2.3)
 *   tint ±15° chỉ ải 1–5 ............... T4 (T2.4/T2.5)
 *
 * Chạy: node --test tests/stage-themes.test.js
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const gameSrc = () => fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");

/* ---------- brace-matching extractor (bỏ qua string/comment) ---------- */
function extractBrace(src, openIdx) {
  let i = openIdx, depth = 0;
  let inStr = null, esc = false, inLine = false, inBlock = false;
  for (; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (inLine) { if (c === "\n") inLine = false; continue; }
    if (inBlock) { if (c === "*" && n === "/") { inBlock = false; i++; } continue; }
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === inStr) inStr = null;
      continue;
    }
    if (c === "/" && n === "/") { inLine = true; i++; continue; }
    if (c === "/" && n === "*") { inBlock = true; i++; continue; }
    if (c === '"' || c === "'" || c === "`") { inStr = c; continue; }
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) return src.slice(openIdx, i + 1); }
  }
  return null;
}
function extractFunctionDecl(src, name) {
  const m = src.match(new RegExp(`function\\s+${name}\\s*\\(`));
  assert.ok(m, `không tìm thấy function ${name} trong js/game.js — dev chạy: node scripts/build-game.js`);
  const open = src.indexOf("{", m.index);
  const body = extractBrace(src, open);
  assert.ok(body, `ngoặc mất cân bằng ở function ${name}`);
  return src.slice(m.index, open + body.length);
}

/* ---------- canvas 2d mock: method no-op có ghi log; set thuộc tính cũng ghi ---------- */
function mockCtx2d() {
  const calls = [];
  const special = {
    measureText: (...a) => { calls.push(["measureText", ...a]); return { width: 10 }; },
    createLinearGradient: (...a) => {
      calls.push(["createLinearGradient", ...a]);
      return { addColorStop(o, c) { calls.push(["addColorStop", o, c]); } };
    },
    createRadialGradient: (...a) => {
      calls.push(["createRadialGradient", ...a]);
      return { addColorStop(o, c) { calls.push(["addColorStop", o, c]); } };
    },
    getImageData: (...a) => { calls.push(["getImageData", ...a]); return { data: [] }; },
  };
  const px = new Proxy({}, {
    get(tg, p) {
      if (p === "__calls") return calls;
      if (p in tg) return tg[p];
      if (typeof p === "string" && p in special) return special[p];
      if (typeof p === "string") return (...a) => { calls.push([p, ...a]); };
      return undefined;
    },
    set(tg, p, v) { tg[p] = v; calls.push(["set", p, v]); return true; },
  });
  return px;
}
/* document mock ghi lại mọi canvas tạo ra (để verify decor static đã bake) */
function trackingDocument() {
  const created = [];
  return {
    created,
    createElement: (tag) => {
      if (tag !== "canvas") return { style: {} };
      const ctx = mockCtx2d();
      const c = { width: 300, height: 150, style: {}, __ctx: ctx, getContext: () => ctx };
      created.push(c);
      return c;
    },
  };
}
globalThis.document = trackingDocument();

const BG = require(path.join(ROOT, "js/bg.js"));

/* ---------- hue-shift độc lập (tính kỳ vọng, không dùng code game) ---------- */
function hexToHsl(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  let h = 0, s = 0; const l = (mx + mn) / 2;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}
function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r, g, b;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const to = (v) => Math.round((v + m) * 255);
  return "#" + [to(r), to(g), to(b)].map((v) => v.toString(16).padStart(2, "0")).join("");
}
const shiftHue = (hex, deg) => { const [h, s, l] = hexToHsl(hex); return hslToHex(h + deg, s, l); };
function assertHexNear(actual, expected, tol, msg) {
  const pa = [1, 3, 5].map((i) => parseInt(actual.slice(i, i + 2), 16));
  const pe = [1, 3, 5].map((i) => parseInt(expected.slice(i, i + 2), 16));
  const ok = pa.every((v, i) => Math.abs(v - pe[i]) <= tol);
  assert.ok(ok, `${msg}: got ${actual}, expected ~${expected} (±${tol}/kênh)`);
}

/* Kỳ vọng từ RFC §2.1 — KHÔNG copy từ code dev. */
const EXPECT = {
  1: { border: { kind: "rounded", colors: ["#2E6DB4"], width: 3, sync: "none" }, tintHue: 8,
       staticKinds: ["rect", "text"], staticText: ":-(", animKind: "scanline", animCount: 3 },
  2: { border: { kind: "fire", colors: ["#FF6A00"], sync: "spikes" }, tintHue: -10,
       staticKinds: ["bricks", "chimney"], animKind: "spark", animMax: 12 },
  3: { border: { kind: "swirl", colors: ["#3A0CA3", "#7209B7"], width: 3, sync: "none" }, tintHue: 12,
       staticKinds: ["text", "blackhole"], staticText: "404", animKind: "orbit", animMax: 8 },
  4: { border: { kind: "neon", colors: ["#00E5FF"], width: 3, sync: "blackout" }, tintHue: 0,
       staticKinds: ["bulb", "line"], animKind: "flicker", animMax: 6 },
  5: { border: { kind: "danger", colors: ["#4ADE80", "#FF3B30"], width: 4, sync: "danger" }, tintHue: -12,
       staticKinds: ["memblock"], animKind: "fallblock", animMax: 4 },
};

/* ================= T1: schema 3 lớp ================= */
describe("themes/T1: PALETTES[1..5] có theme đủ 3 lớp (decor/border/tintHue)", () => {
  it("BG.getTheme tồn tại, trả đúng theme từng ải", () => {
    assert.equal(typeof BG.getTheme, "function", "RFC §3.1: BG.getTheme(sid) là API bổ sung");
    for (let sid = 1; sid <= 5; sid++) {
      const th = BG.getTheme(sid);
      assert.deepEqual(th, BG.PALETTES[sid].theme, `ải ${sid}: getTheme phải trả PALETTES[${sid}].theme`);
    }
  });
  for (let sid = 1; sid <= 5; sid++) {
    it(`ải ${sid}: decor {statics[], animated[]} + border {kind,colors,width,sync} + tintHue ∈ [-15,15]`, () => {
      const th = BG.getTheme(sid);
      assert.ok(th && typeof th === "object", `thiếu PALETTES[${sid}].theme`);
      assert.ok(Array.isArray(th.decor && th.decor.statics), "decor.statics phải là mảng");
      assert.ok(Array.isArray(th.decor && th.decor.animated), "decor.animated phải là mảng");
      const b = th.border || {};
      assert.ok(typeof b.kind === "string", "border.kind thiếu");
      assert.ok(Array.isArray(b.colors) && b.colors.length >= 1, "border.colors thiếu");
      assert.ok(typeof b.width === "number" && b.width > 0, "border.width thiếu");
      assert.ok(["none", "spikes", "blackout", "danger"].includes(b.sync),
        `border.sync="${b.sync}" không thuộc {none,spikes,blackout,danger}`);
      assert.ok(typeof th.tintHue === "number" && th.tintHue >= -15 && th.tintHue <= 15,
        `tintHue=${th.tintHue} vượt biên ±15°`);
    });
  }
  it("animated ≤ 12 prop/ải (tổng count)", () => {
    for (let sid = 1; sid <= 5; sid++) {
      const n = BG.getTheme(sid).decor.animated.reduce((s, a) => s + (a.count || 1), 0);
      assert.ok(n <= 12, `ải ${sid}: ${n} animated props > 12 (RFC T2.2)`);
    }
  });
});

/* ================= T2: spec từng ải ================= */
describe("themes/T2: từng ải đúng bảng RFC §2.1", () => {
  for (let sid = 1; sid <= 5; sid++) {
    const ex = EXPECT[sid];
    it(`ải ${sid}: border đúng kind/colors/sync`, () => {
      const b = BG.getTheme(sid).border;
      assert.equal(b.kind, ex.border.kind, `ải ${sid}: border.kind`);
      assert.deepEqual(b.colors, ex.border.colors, `ải ${sid}: border.colors`);
      assert.equal(b.sync, ex.border.sync, `ải ${sid}: border.sync`);
      if (ex.border.width !== undefined) assert.equal(b.width, ex.border.width, `ải ${sid}: border.width`);
    });
    it(`ải ${sid}: tintHue = ${ex.tintHue}°`, () => {
      assert.equal(BG.getTheme(sid).tintHue, ex.tintHue, `ải ${sid}: tintHue`);
    });
    it(`ải ${sid}: decor static có kind ${ex.staticKinds.join("+")}`, () => {
      const kinds = BG.getTheme(sid).decor.statics.map((d) => d.kind);
      for (const k of ex.staticKinds) assert.ok(kinds.includes(k), `ải ${sid}: thiếu static kind "${k}"`);
    });
    it(`ải ${sid}: decor animated ${ex.animKind} trong budget`, () => {
      const an = BG.getTheme(sid).decor.animated;
      const kinds = an.map((a) => a.kind);
      assert.ok(kinds.includes(ex.animKind), `ải ${sid}: thiếu animated kind "${ex.animKind}"`);
      const n = an.filter((a) => a.kind === ex.animKind).reduce((s, a) => s + (a.count || 1), 0);
      if (ex.animCount !== undefined) assert.equal(n, ex.animCount, `ải ${sid}: ${ex.animKind} count`);
      if (ex.animMax !== undefined) assert.ok(n <= ex.animMax, `ải ${sid}: ${n} > budget ${ex.animMax}`);
    });
  }
  it("ải 1: glyph ':‑(' trong statics; ải 3: mảnh '404' trong statics", () => {
    const t1 = BG.getTheme(1).decor.statics.filter((d) => d.kind === "text").map((d) => d.text).join(" ");
    assert.ok(t1.includes(":-("), `ải 1: glyph ":-(" là marker BSOD vui vẻ, thấy: ${t1}`);
    const t3 = BG.getTheme(3).decor.statics.filter((d) => d.kind === "text").map((d) => d.text).join(" ");
    assert.ok(t3.includes("404"), `ải 3: mảnh "404" vỡ, thấy: ${t3}`);
    const n404 = BG.getTheme(3).decor.statics.filter((d) => d.kind === "text" && String(d.text).includes("404")).length;
    assert.ok(n404 >= 5, `ải 3: cần ≥5 mảnh "404" vỡ (RFC), thấy ${n404}`);
  });
});

/* ================= T3: F8 fallback ================= */
describe("themes/T3 (F8): theme thiếu / sid lạ → fallback an toàn, không throw", () => {
  it("BG.getTheme(99/'x'/NaN/undefined/null) → {} không throw", () => {
    for (const bad of [99, -5, "x", NaN, undefined, null]) {
      assert.doesNotThrow(() => BG.getTheme(bad), `getTheme(${String(bad)}) throw`);
      assert.deepEqual(BG.getTheme(bad), {}, `getTheme(${String(bad)}) phải → {}`);
    }
  });
  it("BG.build với sid lạ → fallback sid=1, không throw", () => {
    const bads = [99, -5, "x", NaN, undefined, null];
    bads.forEach((bad, i) => {
      assert.doesNotThrow(() => BG.build(bad, 900 + i * 37, 640), `BG.build(${String(bad)}) throw`);
    });
    assert.equal(BG.stageId, 1, "sid lạ phải fallback về 1");
  });
  it("theme thiếu field → truy cập optional-chain an toàn (decor rỗng, tintHue 0)", () => {
    const th = BG.getTheme(99);
    assert.equal((th.decor && th.decor.statics && th.decor.statics.length) || 0, 0, "decor rỗng");
    assert.deepEqual(th.border || {}, {}, "border rỗng");
    assert.equal(th.tintHue || 0, 0, "tintHue fallback 0");
  });
});

/* ================= T4: tint quái ================= */
function loadThemeTint() {
  const src = gameSrc();
  const shiftSrc = extractFunctionDecl(src, "_shiftHue");
  const tintSrc = extractFunctionDecl(src, "themeTint");
  const memoDecl = "const _tintMemo = {};";
  const ctx = { Math, console, window: {}, BG, V2: { stageId: 1 }, G: {} };
  vm.createContext(ctx);
  vm.runInContext(memoDecl + "\n" + shiftSrc + "\n" + tintSrc, ctx, { filename: "themeTint" });
  return ctx;
}
describe("themes/T4: tint quái ±15° — chỉ ải 1–5, không đụng boss/đạn/particle", () => {
  it("ải 1–5: themeTint(e) = shift hue đúng tintHue ải (sai số làm tròn cho phép)", () => {
    const ctx = loadThemeTint();
    for (let sid = 1; sid <= 5; sid++) {
      BG.build(sid, 1280, 720);
      ctx.V2 = { stageId: sid };
      ctx.window = { V2: ctx.V2, G: {} };
      const deg = BG.getTheme(sid).tintHue;
      const got = vm.runInContext(`themeTint({ color: "#ff5470", type: "chaser" })`, ctx);
      if (deg === 0) assert.equal(got, "#ff5470", `ải ${sid}: tintHue 0 → giữ nguyên`);
      else assertHexNear(got, shiftHue("#ff5470", deg), 3, `ải ${sid}: shift ${deg}°`);
    }
  });
  it("T2.5: endless (stageId 0) / mode mới (stageId 0) → tint TẮT, trả e.color gốc", () => {
    const ctx = loadThemeTint();
    BG.build(2, 1280, 720);
    for (const st of [0, 6, -1]) {
      ctx.V2 = { stageId: st };
      ctx.window = { V2: ctx.V2, G: {} };
      const got = vm.runInContext(`themeTint({ color: "#ff5470", type: "chaser" })`, ctx);
      assert.equal(got, "#ff5470", `stageId=${st}: tint phải TẮT`);
    }
  });
  it("T2.5: G.themeTint=false → tắt tường minh ngay cả trong ải 1–5", () => {
    const ctx = loadThemeTint();
    BG.build(3, 1280, 720);
    // game thật: window.G === G (cùng object) — mirror đúng
    ctx.G = { themeTint: false };
    ctx.V2 = { stageId: 3 };
    ctx.window = { V2: ctx.V2, G: ctx.G };
    const got = vm.runInContext(`themeTint({ color: "#ff5470", type: "chaser" })`, ctx);
    assert.equal(got, "#ff5470", "G.themeTint=false → giữ e.color gốc");
  });
  it("themeTint memo theo e.color+sid, không throw khi e thiếu color", () => {
    const ctx = loadThemeTint();
    ctx.V2 = { stageId: 1 };
    ctx.window = { V2: ctx.V2, G: {} };
    const a = vm.runInContext(`themeTint({ color: "#ff5470" })`, ctx);
    const b = vm.runInContext(`themeTint({ color: "#ff5470" })`, ctx);
    assert.equal(a, b, "memo: cùng color+sid → cùng kết quả");
    assert.doesNotThrow(() => vm.runInContext(`themeTint(null)`, ctx));
    assert.doesNotThrow(() => vm.runInContext(`themeTint({})`, ctx));
  });
});

/* ================= T5: perf + reduced ================= */
describe("themes/T5: perf budget + reduced-motion (T2.1/T2.2)", () => {
  it("BG.draw < 2ms/frame với canvas mock (decor animated ≤ 12 prop)", () => {
    for (const sid of [1, 2, 3, 4, 5]) {
      BG.build(sid, 1280, 720);
      const ctx = mockCtx2d();
      for (let i = 0; i < 5; i++) BG.draw(ctx, 1000 + i * 16);
      const N = 60, t0 = process.hrtime.bigint();
      for (let i = 0; i < N; i++) BG.draw(ctx, 2000 + i * 16);
      const ms = Number(process.hrtime.bigint() - t0) / 1e6 / N;
      assert.ok(ms < 2, `ải ${sid}: BG.draw ${ms.toFixed(3)}ms/frame > budget 2ms`);
    }
  });
  it("decor static bake vào offscreen: BG.draw không vẽ thêm vào base canvas", () => {
    const doc = trackingDocument();
    const prev = globalThis.document;
    globalThis.document = doc;
    try {
      BG.build(2, 1100, 700);
      const baseCalls = doc.created.map((c) => c.__ctx.__calls.length);
      const ctx = mockCtx2d();
      for (let i = 0; i < 10; i++) BG.draw(ctx, 5000 + i * 16);
      doc.created.forEach((c, i) => {
        assert.equal(c.__ctx.__calls.length, baseCalls[i],
          `canvas #${i} (bake ở build) nhận thêm ${c.__ctx.__calls.length - baseCalls[i]} calls trong draw — static phải = 0 draw-call/frame`);
      });
    } finally { globalThis.document = prev; }
  });
  it("reduced-motion: BG.draw đứng yên khi setQuality('reduced')", () => {
    BG.setQuality("reduced");
    try {
      for (const sid of [1, 2, 3, 4, 5]) {
        BG.build(sid, 1280, 720);
        BG.setDanger(0); BG.setBlackout(false);
        const a = mockCtx2d(), b = mockCtx2d();
        BG.draw(a, 1000); BG.draw(b, 60000);
        assert.deepEqual(b.__calls, a.__calls,
          `ải ${sid}: reduced → mọi layer (kể cả decor animated) phải đứng yên`);
      }
    } finally { BG.setQuality("full"); }
  });
  it("mỗi prop animated ≤ 6 canvas ops (phân tích static nhánh drawDecorAnim)", () => {
    const src = fs.readFileSync(path.join(ROOT, "js/bg.js"), "utf8");
    const fn = extractFunctionDecl(src, "drawDecorAnim");
    const kinds = ["scanline", "spark", "orbit", "fallblock", "flicker"];
    const pos = kinds.map((k) => fn.indexOf(`p.kind === "${k}"`));
    pos.forEach((p, i) => assert.ok(p > 0, `drawDecorAnim thiếu nhánh kind "${kinds[i]}"`));
    for (let i = 0; i < kinds.length; i++) {
      // segment nhánh: từ kind hiện tại đến kind kế tiếp (hoặc hết vòng lặp for)
      let end = fn.indexOf("\n    }\n    ctx.restore()", pos[i]);
      for (let j = i + 1; j < kinds.length; j++) {
        const p2 = fn.indexOf(`p.kind === "${kinds[j]}"`, pos[i]);
        if (p2 > pos[i] && (end < 0 || p2 < end)) end = p2;
      }
      const seg = fn.slice(pos[i], end < 0 ? undefined : end);
      // đếm ctx.<method>( — không tính gán thuộc tính (globalAlpha/fillStyle/...)
      const ops = (seg.match(/ctx\.(?!globalAlpha|fillStyle|strokeStyle|lineWidth|font|textAlign|shadow)[a-zA-Z]+\s*\(/g) || []).length;
      assert.ok(ops <= 6, `prop "${kinds[i]}": ${ops} canvas ops > 6 (RFC T2.2)`);
    }
  });
});

/* ================= T6: motif viền ================= */
function loadDrawThemeBorder() {
  const src = gameSrc();
  const perimSrc = extractFunctionDecl(src, "_perimPoint");
  const lerpSrc = extractFunctionDecl(src, "_lerpColor");
  const fnSrc = extractFunctionDecl(src, "drawThemeBorder");
  // game thật: window.V2/V2/G cùng object — implementation đọc window.V2
  const V2 = { stageId: 1 }, G = {};
  const ctx = {
    Math, console, BG,
    G, V2, window: { V2, G },
    now: 1000,
  };
  vm.createContext(ctx);
  vm.runInContext(perimSrc + "\n" + lerpSrc + "\n" + fnSrc, ctx, { filename: "drawThemeBorder" });
  return ctx;
}
describe("themes/T6: motif viền — sau BorderFX, dưới StageFX (T2.3)", () => {
  it("render(): drawThemeBorder nằm SAU BorderFX.draw và TRƯỚC lớp mechanic ải", () => {
    const src = gameSrc();
    const renderSrc = extractFunctionDecl(src, "render");
    const iB = renderSrc.indexOf("BorderFX.draw");
    const iT = renderSrc.indexOf("drawThemeBorder(ctx");
    // mechanic ải vẽ qua V2.drawOver → StageFX.draw (v2glue.js) — lớp trên cùng
    const iS = renderSrc.indexOf("V2.drawOver");
    assert.ok(iB > 0 && iT > 0 && iS > 0, "render() phải gọi BorderFX.draw, drawThemeBorder, V2.drawOver");
    assert.ok(iB < iT && iT < iS,
      "thứ tự sai: motif viền phải sau BorderFX.draw và dưới V2.drawOver/StageFX.draw (mechanic ải là lớp trên cùng)");
  });
  it("drawThemeBorder(ctx,W,H,now) vẽ đúng màu motif từng ải, không throw", () => {
    const ctx = loadDrawThemeBorder();
    const cases = [
      [1, "#2E6DB4"], [2, "#FF6A00"], [3, "#3A0CA3"], [4, "#00E5FF"], [5, "#4ADE80"],
    ];
    for (const [sid, color] of cases) {
      BG.build(sid, 1280, 720);
      ctx.V2.stageId = sid; // cùng object với window.V2
      const c = mockCtx2d();
      assert.doesNotThrow(() => vm.runInContext(`drawThemeBorder(__c, 1280, 720, 1000)`, Object.assign(ctx, { __c: c })),
        `ải ${sid}: drawThemeBorder throw`);
      // màu có thể gán trực tiếp (strokeStyle=...) hoặc qua gradient (addColorStop)
      const styles = c.__calls
        .filter((x) => (x[0] === "set" && /style/i.test(x[1])) || x[0] === "addColorStop")
        .map((x) => String(x[2]));
      assert.ok(styles.some((s) => s.toLowerCase().includes(color.toLowerCase())),
        `ải ${sid}: motif viền phải dùng màu ${color}, thấy: ${styles.slice(0, 4).join(" | ")}`);
    }
  });
  it("ải 4: border đồng bộ blackout (sáng khi đèn sáng, mờ khi blackout)", () => {
    const ctx = loadDrawThemeBorder();
    BG.build(4, 1280, 720);
    ctx.V2.stageId = 4;
    BG.setBlackout(false);
    const c1 = mockCtx2d();
    vm.runInContext(`drawThemeBorder(__c, 1280, 720, 1000)`, Object.assign(ctx, { __c: c1 }));
    BG.setBlackout(true);
    const c2 = mockCtx2d();
    vm.runInContext(`drawThemeBorder(__c, 1280, 720, 1000)`, Object.assign(ctx, { __c: c2 }));
    BG.setBlackout(false);
    // drawThemeBorder reset globalAlpha=1 ở cuối (sau restore) — bỏ set cuối, lấy alpha của stroke
    const strokeAlphas = (c) => {
      const a = c.__calls.filter((x) => x[0] === "set" && x[1] === "globalAlpha").map((x) => x[2]);
      return a.slice(0, -1);
    };
    const a1 = strokeAlphas(c1), a2 = strokeAlphas(c2);
    assert.ok(a1.length && a2.length, "border ải 4 phải set globalAlpha theo blackout");
    assert.ok(Math.max(...a1) > Math.max(...a2),
      `đèn sáng (alpha ${Math.max(...a1)}) phải > blackout (alpha ${Math.max(...a2)})`);
  });
  it("ải 5: border lerp xanh→đỏ theo BG danger (giá trị smoothed nội bộ)", () => {
    const ctx = loadDrawThemeBorder();
    BG.build(5, 1280, 720);
    ctx.V2.stageId = 5;
    // lerp độc lập để tính kỳ vọng (không dùng code game)
    const lerp = (c1, c2, t) => {
      const p = (c) => { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
      const a = p(c1), b = p(c2);
      return "#" + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, "0")).join("");
    };
    for (const d of [0, 1]) {
      BG.setDanger(d);
      // danger là giá trị smoothed trong BG.draw — cho converge
      for (let i = 0; i < 60; i++) BG.draw(mockCtx2d(), 50000 + d * 100000 + i * 16);
      const dg = BG.getDanger();
      const c = mockCtx2d();
      vm.runInContext(`drawThemeBorder(__c, 1280, 720, 1000)`, Object.assign(ctx, { __c: c }));
      const stroke = c.__calls.find((x) => x[0] === "set" && x[1] === "strokeStyle");
      assert.ok(stroke, "border ải 5 phải set strokeStyle");
      assertHexNear(String(stroke[2]), lerp("#4ADE80", "#FF3B30", dg), 8,
        `danger target=${d} (smoothed ${dg.toFixed(2)}): viền phải lerp xanh→đỏ`);
    }
    BG.setDanger(0);
  });
});

/* ================= T7: decor thuần visual ================= */
describe("themes/T7: decor không sinh entity gameplay (§5.1)", () => {
  it("js/bg.js không gọi spawnEnemy/G.enemies.push/SatManager/spawnPickup", () => {
    const src = fs.readFileSync(path.join(ROOT, "js/bg.js"), "utf8");
    for (const pat of ["spawnEnemy", "enemies.push", "SatManager", "spawnPickup", "G.gems.push", "G.enemies"]) {
      assert.ok(!src.includes(pat), `js/bg.js chứa "${pat}" — decor phải thuần visual, không entity gameplay`);
    }
  });
});

/* ================= T8: endless ================= */
describe("themes/T8: endless — giữ nguyên, tint TẮT", () => {
  it("sid 0 (endless): không theme mới", () => {
    assert.deepEqual(BG.getTheme(0), {}, "endless (sid 0) không có theme riêng");
  });
  it("endless: màu quái = e.color gốc (không shift)", () => {
    const ctx = loadThemeTint();
    BG.build(3, 1280, 720); // endless vẫn dùng palette ải (ACTS bgStage), nhưng tint tắt
    ctx.V2 = { stageId: 0 };
    ctx.window = { V2: ctx.V2, G: {} };
    const got = vm.runInContext(`themeTint({ color: "#c084fc", type: "chewer" })`, ctx);
    assert.equal(got, "#c084fc", "endless: tint TẮT");
  });
});
