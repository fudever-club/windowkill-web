/* WINDOWKILL — "Cửa Sổ Cuối Cùng" (Last Stand, CEO chốt 2026-10-05).
 *
 * Bối cảnh: khi cửa sổ teo <30% (như screenshot wave 10 boss: 23% nguyên vẹn,
 * khung teo bằng hộp diêm), game rơi vào death spiral — không chỗ né, chỉ
 * ngồi chờ thua. Quyết định CEO: biến khoảnh khắc này thành pha lật kèo.
 *
 * Spec (đã duyệt, không đổi số):
 *  - Trigger: window integrity < 30% → bật. Tắt khi hồi > 35% (hysteresis)
 *    hoặc chết.
 *  - Khi bật: sát thương +50%, tốc bắn +20%, mỗi kill vá ngay +8px.
 *  - Viền đỏ rực + stinger cảnh báo (gameOver womp-womp) 1 lần + banner
 *    "CỬA SỔ CUỐI CÙNG!" 1 lần + nhịp tim (lub-dub, chỉ toán học).
 *  - i18n VI/EN. Không đụng difficulty.config.json / nhạc nền.
 *
 * Test này verify:
 *  (a) windowIntegrity() tái dùng đúng công thức HUD (% nguyên vẹn);
 *  (b) trigger <30%, KHÔNG trigger khi >=30%;
 *  (c) hysteresis: đang bật + pct 0.32 → vẫn bật; pct 0.36 → tắt;
 *  (d) tắt khi phase != "play" hoặc tàu chết;
 *  (e) lsDmgMul/lsFireMul đúng số (1.5 / 1.2 khi bật, 1 khi tắt);
 *  (f) lsOnKill: khi bật → growWindow(8,6) + float "+8px"; khi tắt → false;
 *  (g) setLastStand idempotent: gọi 2 lần → banner + stinger đúng 1 lần;
 *  (h) heartbeatPulse: chu kỳ 0.9s, có 2 đỉnh lub-dub, clamp [0,1];
 *  (i) i18n VI/EN đủ 3 key mới.
 *
 * Chạy: node --test tests/last-stand.test.js
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const gameSrc = fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");

function extractFunction(src, name) {
  const headRe = new RegExp("function\\s+" + name + "\\s*\\([^)]*\\)\\s*\\{");
  const m = headRe.exec(src);
  assert.ok(m, `không tìm thấy function ${name} trong js/game.js`);
  let depth = 0, i = m.index + m[0].length - 1;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (depth === 0) break; }
  }
  assert.ok(depth === 0, `ngoặc mất cân bằng trong function ${name}`);
  return src.slice(m.index, i + 1);
}

const FNS = ["windowIntegrity", "lsDmgMul", "lsFireMul", "setLastStand",
  "lastStandTick", "lsOnKill", "heartbeatPulse"]
  .map((n) => extractFunction(gameSrc, n)).join("\n");

/* Dựng context: winPct điều khiển được qua outerWidth.
 * Công thức: clamp((outerWidth - MIN_W) / (START_W - MIN_W)) với
 * MIN_W=250, START_W=980 → pct 0.29 ≈ outerWidth 462. */
function makeCtx(overrides = {}) {
  const spies = { banner: [], stingers: [], grow: [], floats: [] };
  const G = { lastStand: false, phase: "play", ship: { dead: false } };
  const winCtrl = { ok: true };
  const win = { outerWidth: 980 };
  const ctx = {
    console, Math,
    G, winCtrl,
    window: win,
    bounds: () => ({ x: 0, y: 0, w: 800, h: 600 }),
    clamp: (v, a, b) => Math.min(b, Math.max(a, v)),
    MIN_W: 250, START_W: 980,
    setBanner: (t, sub) => spies.banner.push([t, sub]),
    I18N: { t: (k) => k },
    AudioEngine: { sfx: { stinger: (n) => spies.stingers.push(n) } },
    growWindow: (dw, dh) => spies.grow.push([dw, dh]),
    addFloat: (x, y, txt, color) => spies.floats.push({ txt, color }),
  };
  Object.assign(ctx.window, overrides.window || {});
  Object.assign(G, overrides.G || {});
  if (overrides.winCtrl) Object.assign(winCtrl, overrides.winCtrl);
  vm.createContext(ctx);
  vm.runInContext(FNS, ctx, { filename: "last-stand-fns" });
  return { ctx, spies, G, win };
}

function setPct(win, pct) { win.outerWidth = 250 + pct * (980 - 250); }

describe("Last Stand — trigger & hysteresis", () => {
  it("(b) trigger khi <30%, không trigger khi >=30%", () => {
    let r = makeCtx(); setPct(r.win, 0.29);
    vm.runInContext("lastStandTick()", r.ctx);
    assert.equal(r.G.lastStand, true);

    r = makeCtx(); setPct(r.win, 0.30);
    vm.runInContext("lastStandTick()", r.ctx);
    assert.equal(r.G.lastStand, false);

    r = makeCtx(); setPct(r.win, 0.80);
    vm.runInContext("lastStandTick()", r.ctx);
    assert.equal(r.G.lastStand, false);
  });

  it("(c) hysteresis: bật rồi, 32% vẫn bật, 36% mới tắt", () => {
    const r = makeCtx(); setPct(r.win, 0.29);
    vm.runInContext("lastStandTick()", r.ctx);
    assert.equal(r.G.lastStand, true);
    setPct(r.win, 0.32); // vùng hysteresis 30–35%
    vm.runInContext("lastStandTick()", r.ctx);
    assert.equal(r.G.lastStand, true, "32% phải giữ Last Stand (chống nhấp nháy)");
    setPct(r.win, 0.35);
    vm.runInContext("lastStandTick()", r.ctx);
    assert.equal(r.G.lastStand, true, "35% chưa tắt (điều kiện >35%)");
    setPct(r.win, 0.36);
    vm.runInContext("lastStandTick()", r.ctx);
    assert.equal(r.G.lastStand, false);
  });

  it("(d) tắt khi phase != play hoặc tàu chết", () => {
    const r = makeCtx({ G: { lastStand: true, phase: "over" } });
    vm.runInContext("lastStandTick()", r.ctx);
    assert.equal(r.G.lastStand, false);

    const r2 = makeCtx({ G: { lastStand: true, phase: "play", ship: { dead: true } } });
    setPct(r2.win, 0.10);
    vm.runInContext("lastStandTick()", r2.ctx);
    assert.equal(r2.G.lastStand, false);
  });

  it("(a) windowIntegrity đúng công thức HUD", () => {
    const r = makeCtx();
    setPct(r.win, 0.23); // đúng screenshot user gửi
    const v = vm.runInContext("windowIntegrity()", r.ctx);
    assert.ok(Math.abs(v - 0.23) < 0.01, `mong đợi ~0.23, được ${v}`);
  });
});

describe("Last Stand — buff & kill", () => {
  it("(e) lsDmgMul=1.5 / lsFireMul=1.2 khi bật, =1 khi tắt", () => {
    const r = makeCtx();
    assert.equal(vm.runInContext("lsDmgMul()", r.ctx), 1);
    assert.equal(vm.runInContext("lsFireMul()", r.ctx), 1);
    r.G.lastStand = true;
    assert.equal(vm.runInContext("lsDmgMul()", r.ctx), 1.5);
    assert.equal(vm.runInContext("lsFireMul()", r.ctx), 1.2);
  });

  it("(f) lsOnKill: bật → growWindow(8,6) + float +8px; tắt → false", () => {
    const r = makeCtx({ G: { lastStand: true } });
    const e = { x: 100, y: 200 };
    assert.equal(vm.runInContext("lsOnKill(e)", Object.assign(r.ctx, { e })), true);
    assert.deepEqual(r.spies.grow, [[8, 6]]);
    assert.equal(r.spies.floats.length, 1);
    assert.equal(r.spies.floats[0].txt, "+8px");

    const r2 = makeCtx();
    assert.equal(vm.runInContext("lsOnKill(e)", Object.assign(r2.ctx, { e })), false);
    assert.deepEqual(r2.spies.grow, []);
  });

  it("(g) setLastStand idempotent: banner + stinger đúng 1 lần", () => {
    const r = makeCtx(); setPct(r.win, 0.2);
    vm.runInContext("setLastStand(true)", r.ctx);
    vm.runInContext("setLastStand(true)", r.ctx); // gọi lại
    assert.equal(r.spies.banner.length, 1);
    assert.deepEqual(r.spies.stingers, ["gameOver"]);
    assert.deepEqual(r.spies.banner[0],
      ["game.laststand_banner", "game.laststand_sub"]);
    vm.runInContext("setLastStand(false)", r.ctx);
    vm.runInContext("setLastStand(false)", r.ctx);
    assert.equal(r.G.lastStand, false);
  });
});

describe("Last Stand — heartbeat & i18n", () => {
  it("(h) heartbeatPulse: chu kỳ 0.9s, 2 đỉnh lub-dub, clamp [0,1]", () => {
    const r = makeCtx();
    const p = (t) => vm.runInContext(`heartbeatPulse(${t})`, r.ctx);
    assert.ok(Math.abs(p(0) - p(900)) < 1e-9, "chu kỳ 900ms");
    const lub = p(108), dub = p(306), valley = p(600);
    assert.ok(lub > 0.9, `đỉnh lub ~1, được ${lub}`);
    assert.ok(dub > 0.4 && dub < lub, `đỉnh dub nhỏ hơn lub, được ${dub}`);
    assert.ok(valley < 0.1, `thung lũng ~0, được ${valley}`);
    for (let t = 0; t < 900; t += 37) {
      const v = p(t);
      assert.ok(v >= 0 && v <= 1, `clamp [0,1], t=${t} được ${v}`);
    }
  });

  it("(i) i18n VI/EN đủ 3 key Last Stand", () => {
    const src = fs.readFileSync(path.join(ROOT, "js/i18n.js"), "utf8");
    for (const k of ["game.laststand_name", "game.laststand_banner", "game.laststand_sub"]) {
      const count = src.split(`"${k}"`).length - 1;
      assert.equal(count, 2, `key ${k} phải có đúng 2 bản (VI+EN), thấy ${count}`);
    }
    assert.ok(src.includes('"Cửa Sổ Cuối Cùng"'));
    assert.ok(src.includes('"LAST STAND!"'));
  });
});
