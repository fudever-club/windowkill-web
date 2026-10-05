/* WINDOWKILL — fix/balance batch 2 (CEO ủy quyền 2026-10-05).
 *
 * (1) Warden 26 → 20 HP ở wave debut (wave 4): bestiary flag Warden là quái
 *     trâu nhất game lúc debut (gấp ~1.8× tank) trong khi DPS wave 4 còn thấp
 *     → cảm giác bullet-sponge. Giữ slope 2.5/wave, hạ intercept 16 → 10.
 * (2) winPct đo cả 2 chiều: công thức cũ chỉ đo chiều RỘNG nên cửa sổ vỡ theo
 *     chiều CAO (chạm MIN_H trước) mà không có cảnh báo danger. Fix: min(wPct, hPct).
 *
 * Chạy: node --test tests/balance-batch-2.test.js
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const gameSrc = fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");
const monstersSrc = fs.readFileSync(path.join(ROOT, "js/monsters.js"), "utf8");

describe("Warden — 20 HP ở wave 4 (giữ slope 2.5/wave)", () => {
  it("monsters.js: warden hpAt = hp1(w => 10 + w * 2.5)", () => {
    assert.match(monstersSrc,
      /warden:\s*\{[^}]*hpAt:\s*hp1\(w\s*=>\s*10\s*\+\s*w\s*\*\s*2\.5\)/s,
      "warden hpAt phải là hp1(w => 10 + w * 2.5)");
  });

  it("wave 4 = 20 HP (không còn 26)", () => {
    const m = monstersSrc.match(/hpAt:\s*hp1\((w\s*=>\s*10\s*\+\s*w\s*\*\s*2\.5)\)/);
    assert.ok(m, "không tìm thấy công thức warden");
    const fn = eval(m[1]); // eslint-disable-line no-eval
    assert.equal(fn(4), 20, "wave 4 phải = 20 HP");
    assert.equal(fn(1), 12.5, "wave 1 = 12.5 HP");
  });

  it("không đụng difficulty.config.json", () => {
    const before = fs.readFileSync(path.join(ROOT, "difficulty.config.json"), "utf8");
    assert.match(before, /"monster_hp_mult"/, "config còn nguyên");
  });
});

describe("windowIntegrity — min(2 chiều)", () => {
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
  const FN = extractFunction(gameSrc, "windowIntegrity");

  function makeCtx(overrides = {}) {
    const winCtrl = { ok: true };
    const win = { outerWidth: 980, outerHeight: 720 };
    const ctx = {
      console, Math, winCtrl,
      window: win,
      bounds: () => ({ x: 0, y: 0, w: 800, h: 600 }),
      clamp: (v, a, b) => Math.min(b, Math.max(a, v)),
      MIN_W: 250, START_W: 980, MIN_H: 190, START_H: 720,
    };
    Object.assign(win, overrides.window || {});
    if (overrides.winCtrl) Object.assign(winCtrl, overrides.winCtrl);
    if (overrides.bounds) ctx.bounds = overrides.bounds;
    vm.createContext(ctx);
    vm.runInContext(FN, ctx, { filename: "windowIntegrity" });
    return { ctx, win };
  }
  // width 90% → outerWidth = 250+0.9*730; height 40% → outerHeight = 190+0.4*530
  const pctW = (p) => 250 + p * (980 - 250);
  const pctH = (p) => 190 + p * (720 - 190);

  it("case M22: width 90% + height 40% → winPct ≈ 40% (chiều nguy hiểm hơn)", () => {
    const r = makeCtx({ window: { outerWidth: pctW(0.9), outerHeight: pctH(0.4) } });
    const v = vm.runInContext("windowIntegrity()", r.ctx);
    assert.ok(Math.abs(v - 0.4) < 0.01, `mong đợi ~0.40, được ${v}`);
  });

  it("width full + height 20% → winPct ≈ 20% → bật cảnh báo danger (<25%)", () => {
    const r = makeCtx({ window: { outerWidth: 980, outerHeight: pctH(0.2) } });
    const v = vm.runInContext("windowIntegrity()", r.ctx);
    assert.ok(Math.abs(v - 0.2) < 0.01, `mong đợi ~0.20, được ${v}`);
    assert.ok(v < 0.25, "20% < 25% → HUD phải hiện cảnh báo danger");
  });

  it("ngược lại: height full + width 20% → winPct ≈ 20%", () => {
    const r = makeCtx({ window: { outerWidth: pctW(0.2), outerHeight: 720 } });
    const v = vm.runInContext("windowIntegrity()", r.ctx);
    assert.ok(Math.abs(v - 0.2) < 0.01, `mong đợi ~0.20, được ${v}`);
  });

  it("cả 2 chiều full → 100%; cả 2 chạm min → 0%", () => {
    let r = makeCtx();
    assert.equal(vm.runInContext("windowIntegrity()", r.ctx), 1);
    r = makeCtx({ window: { outerWidth: 250, outerHeight: 190 } });
    assert.equal(vm.runInContext("windowIntegrity()", r.ctx), 0);
  });

  it("sim mode (winCtrl.ok=false): lấy chiều nguy hiểm hơn từ bounds()", () => {
    const r = makeCtx({
      winCtrl: { ok: false },
      bounds: () => ({ x: 0, y: 0, w: pctW(0.9), h: pctH(0.35) }),
    });
    const v = vm.runInContext("windowIntegrity()", r.ctx);
    assert.ok(Math.abs(v - 0.35) < 0.01, `mong đợi ~0.35, được ${v}`);
  });

  it("4 điểm tính winPct đều tái dùng windowIntegrity() (không công thức lẻ)", () => {
    // HUD render, wowMusicTick, WKWinPct hook
    const hud = gameSrc.match(/const winPct = winCtrl\.ok[\s\S]{0,160}?;/g) || [];
    assert.equal(hud.length, 0, `còn công thức width-only lẻ: ${hud.length}`);
    assert.match(gameSrc, /const winPct = windowIntegrity\(\);/, "HUD render dùng windowIntegrity()");
    assert.match(gameSrc, /try \{ return windowIntegrity\(\); \} catch \(e\) \{ return 1; \}/,
      "WKWinPct dùng windowIntegrity()");
  });
});
