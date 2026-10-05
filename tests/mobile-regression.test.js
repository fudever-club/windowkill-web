/* WINDOWKILL — mobile regression tests (CDP sweep 2026-10-05).
 *
 * Bối cảnh: user chưa test được trên máy thật; sweep bằng headless Chromium +
 * CDP touch events đã verify joystick/radial/glue-button/viewport/reduced-motion
 * (xem /tmp/wkpt/mobile-sweep-results.json). File này khóa các regression ở
 * mức unit/static để CI bắt được:
 *
 * 1. Viewport meta đúng trên game.html + index.html.
 * 2. Mọi data-act trong radial menu (game.html) đều có nhánh xử lý trong
 *    js/mobile.js (pause/full/quit) — chống nút chết im.
 * 3. Radial menu toggle: mở/tắt qua nút, backdrop, Escape.
 * 4. Canvas có đủ 3 touch handler (touchstart/move/end) cho joystick đôi.
 * 5. Nút Súng Bắn Keo: ẩn mặc định, chỉ hiện khi có upgrade + đang play,
 *    click nối tới fireGlueGun.
 * 6. prefers-reduced-motion được tôn trọng (bg/borderfx/cinema).
 * 7. P0 ĐÃ FIX 2026-10-05: windowIntegrity hiệu chuẩn theo arena thực lúc bắt đầu
 *    run (G.arenaInit) thay vì hằng số desktop — portrait 360px boot ở 100%,
 *    Last Stand chỉ bật khi bị gặm teo thật (test hành vi thật trong vm).
 *
 * Chạy: node --test tests/mobile-regression.test.js
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

const gameHtml = read("game.html");
const indexHtml = read("index.html");
const gameJs = read("js/game.js");
const mobileJs = read("js/mobile.js");

describe("mobile-regression: viewport meta", () => {
  for (const [name, html] of [["game.html", gameHtml], ["index.html", indexHtml]]) {
    it(`${name} khóa viewport cho mobile`, () => {
      const m = html.match(/<meta name="viewport" content="([^"]+)"/);
      assert.ok(m, `${name} thiếu meta viewport`);
      const c = m[1];
      assert.ok(c.includes("width=device-width"), "thiếu width=device-width");
      assert.ok(c.includes("user-scalable=no"), "thiếu user-scalable=no (gesture phá game)");
      assert.ok(c.includes("viewport-fit=cover"), "thiếu viewport-fit=cover (tai thỏ iPhone)");
    });
  }
});

describe("mobile-regression: radial menu wiring", () => {
  const acts = [...gameHtml.matchAll(/data-act="([a-z]+)"/g)].map((m) => m[1]);
  it("mọi data-act trong game.html đều có nhánh xử lý", () => {
    assert.ok(acts.length > 0, "không tìm thấy data-act nào");
    for (const a of new Set(acts)) {
      assert.ok(
        mobileJs.includes(`act === "${a}"`),
        `data-act="${a}" không có nhánh xử lý trong js/mobile.js`
      );
    }
  });
  it("3 act pause/full/quit nối đúng hàm", () => {
    assert.ok(mobileJs.includes('act === "pause"') && mobileJs.includes("pauseGame"),
      "pause phải gọi pauseGame");
    assert.ok(mobileJs.includes('act === "full"') && mobileJs.includes("toggleFullscreen"),
      "full phải gọi toggleFullscreen");
    assert.ok(mobileJs.includes('act === "quit"') && mobileJs.includes("quitToMenu"),
      "quit phải gọi quitToMenu");
  });
  it("toggle mở/tắt radial: nút, backdrop, Escape", () => {
    assert.ok(/setOpen\(!isOpen\(\)\)/.test(mobileJs), "nút menu phải đảo trạng thái radial");
    assert.ok(/backdrop\.addEventListener\("click"[^)]*\)[^;]*setOpen\(false\)/s.test(mobileJs) ||
      (mobileJs.includes('backdrop.addEventListener("click"') && mobileJs.includes("setOpen(false)")),
      "backdrop click phải đóng radial");
    assert.ok(mobileJs.includes('"Escape"') && mobileJs.includes("setOpen(false)"),
      "Escape phải đóng radial");
    assert.ok(mobileJs.includes('aria-expanded'), "phải cập nhật aria-expanded (a11y)");
  });
  it("radial chỉ hiện trên touch (wk-coarse)", () => {
    assert.ok(gameHtml.includes("hud-radial"), "game.html thiếu #hud-radial");
    assert.ok(mobileJs.includes("wk-coarse"), "mobile.js phải gate radial bằng wk-coarse");
  });
});

describe("mobile-regression: touch joystick", () => {
  it("canvas đăng ký đủ touchstart/move/end", () => {
    for (const ev of ["touchstart", "touchmove", "touchend"]) {
      assert.ok(
        gameJs.includes(`"${ev}"`) || gameJs.includes(`'${ev}'`),
        `thiếu handler ${ev} trên canvas`
      );
    }
  });
  it("nửa trái = di chuyển, nửa phải = ngắm/bắn", () => {
    assert.ok(/clientX < window\.innerWidth \/ 2/.test(gameJs),
      "touchstart phải chia nửa màn hình");
    assert.ok(gameJs.includes("touch.moveId") && gameJs.includes("touch.aimId"),
      "phải phân biệt moveId / aimId cho joystick đôi");
  });
  it("chặn gesture phá game (pinch/double-tap zoom)", () => {
    assert.ok(mobileJs.includes("gesturestart"), "thiếu chặn iOS pinch-zoom");
    assert.ok(mobileJs.includes("dblclick"), "thiếu chặn double-tap zoom");
  });
});

describe("mobile-regression: nút Súng Bắn Keo", () => {
  it("ẩn mặc định trong HTML", () => {
    const m = gameHtml.match(/<button id="btn-hud-glue"[^>]*>/);
    assert.ok(m, "thiếu #btn-hud-glue");
    assert.ok(m[0].includes("display:none"), "phải ẩn mặc định (display:none)");
  });
  it("chỉ hiện khi có upgrade keo + đang play", () => {
    assert.ok(gameJs.includes("s.glueGun") && gameJs.includes('G.phase === "play"'),
      "điều kiện hiện nút phải là s.glueGun && phase play");
    assert.ok(gameJs.includes("_wantGlueBtn"), "phải có logic toggle _wantGlueBtn");
  });
  it("click nối tới fireGlueGun trong phase play", () => {
    const seg = gameJs.slice(gameJs.indexOf('getElementById("btn-hud-glue")'), gameJs.indexOf('getElementById("btn-hud-glue")') + 400);
    assert.ok(seg.includes("fireGlueGun()"), "click btn-hud-glue phải gọi fireGlueGun()");
    assert.ok(seg.includes('G.phase === "play"'), "phải gate phase play");
  });
});

describe("mobile-regression: prefers-reduced-motion", () => {
  it("bg/borderfx/cinema đọc matchMedia", () => {
    assert.ok(read("js/bg.js").includes("prefers-reduced-motion"), "js/bg.js thiếu");
    assert.ok(read("js/borderfx.js").includes("prefers-reduced-motion"), "js/borderfx.js thiếu");
    assert.ok(read("js/cinema.js").includes("prefers-reduced-motion"), "js/cinema.js thiếu");
  });
  it("có cờ rút gọn hiệu ứng", () => {
    assert.ok(read("js/cinema.js").includes("reducedMotion"), "cinema.js thiếu cờ reducedMotion");
  });
});

/* P0 2026-10-05 — ĐÃ FIX: hiệu chuẩn integrity theo arena thực lúc bắt đầu run
 * (G.arenaInit, chụp trong resetGame). Trước fix: portrait 360px boot đã 15.1%
 * < 30% → Last Stand bật vĩnh viễn (verify CDP, tái hiện 100% máy thật).
 * Test hành vi thật: trích windowIntegrity/simMode/lastStandTick/setLastStand
 * từ js/game.js, chạy trong vm với arena/viewport mock. */
function extractFn(src, name) {
  const m = new RegExp("function\\s+" + name + "\\s*\\([^)]*\\)\\s*\\{").exec(src);
  assert.ok(m, `không tìm thấy function ${name}`);
  let depth = 0, i = m.index + m[0].length - 1;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (depth === 0) break; }
  }
  assert.ok(depth === 0, `ngoặc mất cân bằng trong ${name}`);
  return src.slice(m.index, i + 1);
}
const INT_FNS = ["simMode", "windowIntegrity", "setLastStand", "lastStandTick"]
  .map((n) => extractFn(gameJs, n)).join("\n");

/* Dựng context điều khiển được: viewport/arena (bounds), winCtrl.ok,
 * matchMedia coarse, G.arenaInit (như resetGame chụp). */
function makeIntegrityCtx(o = {}) {
  const spies = { banner: [], stingers: [] };
  const G = { lastStand: false, phase: "play", ship: { dead: false },
    arenaInit: o.arenaInit === undefined ? null : o.arenaInit };
  const winCtrl = { ok: o.winCtrlOk !== undefined ? o.winCtrlOk : true };
  const win = {
    outerWidth: o.outerWidth !== undefined ? o.outerWidth : 980,
    outerHeight: o.outerHeight !== undefined ? o.outerHeight : 720,
    matchMedia: o.coarse === undefined ? undefined
      : () => ({ matches: !!o.coarse }),
  };
  // bounds(): arena ảo (nếu có) hoặc viewport — y hệt game.js
  let arenaBox = o.arena || null;
  const ctx = {
    console, Math,
    G, winCtrl,
    window: win,
    bounds: () => arenaBox || { x: 0, y: 0,
      w: o.viewportW !== undefined ? o.viewportW : 980,
      h: o.viewportH !== undefined ? o.viewportH : 720 },
    clamp: (v, a, b) => Math.min(b, Math.max(a, v)),
    MIN_W: 250, START_W: 980, MIN_H: 190, START_H: 720,
    setBanner: (t, sub) => spies.banner.push([t, sub]),
    I18N: { t: (k) => k },
    AudioEngine: { sfx: { stinger: (n) => spies.stingers.push(n) } },
  };
  // cho phép test gán arena sau khi tạo ctx (simMode đọc bare `arena`)
  Object.defineProperty(ctx, "_setArena", { value: (b) => { arenaBox = b; ctx.arena = b; } });
  ctx.arena = arenaBox;
  vm.createContext(ctx);
  vm.runInContext(INT_FNS, ctx, { filename: "integrity-fns" });
  return { ctx, spies, G, win,
    integrity: () => vm.runInContext("windowIntegrity()", ctx),
    tick: () => vm.runInContext("lastStandTick()", ctx),
    simMode: () => vm.runInContext("simMode()", ctx) };
}
const vm = require("node:vm");

describe("mobile-regression: P0 window-integrity calibration (ĐÃ FIX 2026-10-05)", () => {
  it("portrait 360×640 sim: boot integrity = 100%, Last Stand OFF", () => {
    // arenaInit như resetGame chụp: bounds() = viewport (arena null)
    const r = makeIntegrityCtx({ winCtrlOk: false, viewportW: 360, viewportH: 640,
      arenaInit: { w: 360, h: 640 } });
    assert.equal(r.integrity(), 1, "boot phải ở 100%");
    r.tick();
    assert.equal(r.G.lastStand, false, "không được bật Last Stand khi boot");
    assert.equal(r.spies.banner.length, 0, "không banner oan");
  });
  it("boot TRƯỚC probe (winCtrl.ok còn true, pointer coarse): vẫn 100%, OFF", () => {
    // đúng scenario bug report: "NGAY SAU BOOT" — probe 500ms chưa chạy
    const r = makeIntegrityCtx({ winCtrlOk: true, coarse: true,
      outerWidth: 360, outerHeight: 640, viewportW: 360, viewportH: 640,
      arenaInit: { w: 360, h: 640 } });
    assert.equal(r.simMode(), true, "coarse pointer phải được coi là sim tại boot");
    assert.equal(r.integrity(), 1);
    r.tick();
    assert.equal(r.G.lastStand, false);
  });
  it("gặm teo arena xuống <30% → Last Stand bật đúng (kèm banner 1 lần)", () => {
    const r = makeIntegrityCtx({ winCtrlOk: false, viewportW: 360, viewportH: 640,
      arenaInit: { w: 360, h: 640 } });
    // gặm còn 280px: (280-250)/(360-250) = 27.3% < 30%
    r.ctx._setArena({ x: 40, y: 0, w: 280, h: 640 });
    assert.ok(r.integrity() < 0.30, `integrity phải <30%, thực tế ${r.integrity()}`);
    r.tick();
    assert.equal(r.G.lastStand, true);
    assert.equal(r.spies.banner.length, 1, "banner đúng 1 lần");
    r.tick();
    assert.equal(r.spies.banner.length, 1, "idempotent: không banner lại");
  });
  it("hysteresis trên sim: 32% giữ bật, 36% mới tắt", () => {
    const r = makeIntegrityCtx({ winCtrlOk: false, viewportW: 360, viewportH: 640,
      arenaInit: { w: 360, h: 640 } });
    r.ctx._setArena({ x: 0, y: 0, w: 280, h: 640 }); // 27.3%
    r.tick();
    assert.equal(r.G.lastStand, true);
    r.ctx._setArena({ x: 0, y: 0, w: 285, h: 640 }); // (35)/110 = 31.8%
    r.tick();
    assert.equal(r.G.lastStand, true, "31.8% phải giữ (hysteresis)");
    r.ctx._setArena({ x: 0, y: 0, w: 295, h: 640 }); // (45)/110 = 40.9% > 35%
    r.tick();
    assert.equal(r.G.lastStand, false, "40.9% phải tắt");
  });
  it("desktop regression: init 980×720, hành vi cũ không đổi", () => {
    const r = makeIntegrityCtx({ winCtrlOk: true, coarse: false,
      outerWidth: 980, outerHeight: 720, arenaInit: null });
    assert.equal(r.simMode(), false);
    assert.equal(r.integrity(), 1);
    r.tick();
    assert.equal(r.G.lastStand, false);
    // teo còn 462px: (462-250)/730 = 29.0% → bật (đúng công thức cũ)
    r.win.outerWidth = 462;
    assert.ok(Math.abs(r.integrity() - 0.2904) < 0.001, `desktop 462px phải ≈29%, thực tế ${r.integrity()}`);
    r.tick();
    assert.equal(r.G.lastStand, true);
  });
  it("desktop bỏ qua arenaInit (dù có cũng dùng START_*)", () => {
    const r = makeIntegrityCtx({ winCtrlOk: true, coarse: false,
      outerWidth: 980, outerHeight: 720, arenaInit: { w: 360, h: 640 } });
    assert.equal(r.integrity(), 1, "desktop không được dùng arenaInit của mobile");
  });
  it("simMode(): ok=false → true; arena tồn tại → true; desktop fine → false", () => {
    assert.equal(makeIntegrityCtx({ winCtrlOk: false }).simMode(), true);
    const r2 = makeIntegrityCtx({ winCtrlOk: true, coarse: false });
    r2.ctx._setArena({ x: 0, y: 0, w: 500, h: 500 });
    assert.equal(r2.simMode(), true, "arena đã tạo → sim");
    assert.equal(makeIntegrityCtx({ winCtrlOk: true, coarse: false }).simMode(), false);
  });
});
