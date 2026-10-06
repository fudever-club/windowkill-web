/* WINDOWKILL — QA overlay (?qa=1) tests.
 *
 * Chế độ overlay cho test máy thật: FPS avg/low, số quái, wave,
 * vòng tròn touch theo thời gian thực. Chỉ bật khi ?qa=1.
 *
 * 1. Unit (không cần sandbox): qaParseEnabled, createQaFps, createQaTouches
 *    — load module trong vm sandbox tối giản, gọi qua window.QAOverlay.
 * 2. Integration (sandbox + stub canvas/ctx/G): enabled khi ?qa=1,
 *    tắt khi ?qa=0/vắng; touchstart → track point; frame() vẽ text;
 *    tap nút đóng → disable.
 *
 * Chạy: node --test tests/qa-overlay.test.js
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const SRC = fs.readFileSync(path.join(ROOT, "js/game/21-qaoverlay.js"), "utf8");

/* Sandbox tối giản cho module 21-qaoverlay.js */
function bootQa(search) {
  const listeners = {}; // canvas listeners: name -> [fn]
  const winListeners = {};
  const noop = () => {};
  const ctxCalls = [];
  const mkCtx = () => new Proxy({}, {
    get(t, p) {
      if (p === "canvas") return undefined;
      return (...a) => { ctxCalls.push([p, ...a]); };
    },
    set(t, p, v) { t[p] = v; return true; },
  });
  const sandbox = {
    console, Math, JSON, Object, Array, String, Number, Boolean, Date, RegExp, Error,
    Map, Set, parseInt, parseFloat, isNaN, isFinite,
    URLSearchParams,
    location: { search: search || "" },
    navigator: {},
    G: { enemies: [{}, {}, {}], wave: 5 },
    canvas: {
      addEventListener: (n, fn) => { (listeners[n] = listeners[n] || []).push(fn); },
      removeEventListener: noop,
    },
    ctx: mkCtx(),
  };
  sandbox.window = {
    innerWidth: 800, innerHeight: 600,
    addEventListener: (n, fn) => { (winListeners[n] = winListeners[n] || []).push(fn); },
    removeEventListener: noop,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox, { filename: "js/game/21-qaoverlay.js" });
  const Q = sandbox.window.QAOverlay;
  assert.ok(Q, "window.QAOverlay phải được expose");
  return { Q, listeners, winListeners, ctxCalls, sandbox };
}

const touchEvent = (touches) => ({ changedTouches: touches });

describe("qaParseEnabled (?qa=1)", () => {
  const { Q } = bootQa("?qa=1");
  it("?qa=1 → bật", () => assert.equal(Q._parse("?qa=1"), true));
  it("&qa=1 giữa query → bật", () => assert.equal(Q._parse("?diff=hard&qa=1"), true));
  it("?qa=0 → tắt", () => assert.equal(Q._parse("?qa=0"), false));
  it("không có qa → tắt", () => assert.equal(Q._parse(""), false));
  it("?qa=2 → tắt (chỉ đúng '1')", () => assert.equal(Q._parse("?qa=2"), false));
  it("?QA=1 (hoa) → tắt (case-sensitive)", () => assert.equal(Q._parse("?QA=1"), false));
});

describe("createQaFps", () => {
  it("60 frame 1/60 → avg ≈ 60", () => {
    const { Q } = bootQa("?qa=1");
    const f = Q._fps;
    for (let i = 0; i < 60; i++) f.sample(1 / 60);
    assert.ok(Math.abs(f.avg - 60) < 1, `avg=${f.avg}`);
  });
  it("1 frame chậm (0.5s) → low rớt", () => {
    const { Q } = bootQa("?qa=1");
    const f = Q._fps;
    for (let i = 0; i < 30; i++) f.sample(1 / 60);
    f.sample(0.5); // 1 frame 2fps
    for (let i = 0; i < 29; i++) f.sample(1 / 60); // đủ 1s window
    assert.ok(f.low < 10, `low=${f.low}`);
  });
  it("cửa sổ mới reset low về bình thường", () => {
    const { Q } = bootQa("?qa=1");
    const f = Q._fps;
    f.sample(0.5);
    for (let i = 0; i < 59; i++) f.sample(1 / 60);
    for (let i = 0; i < 60; i++) f.sample(1 / 60); // thêm 1s toàn frame nhanh
    assert.ok(f.low > 50, `low=${f.low}`);
  });
});

describe("createQaTouches", () => {
  it("down/move/up/size", () => {
    const { Q } = bootQa("?qa=1");
    const t = Q._touches;
    assert.equal(t.size, 0);
    t.down(7, 100, 200);
    t.down(9, 300, 400);
    assert.equal(t.size, 2);
    t.move(7, 110, 210);
    const seen = [];
    t.each((id, x, y) => seen.push([id, x, y]));
    assert.deepEqual(seen.sort((a, b) => a[0] - b[0]), [[7, 110, 210], [9, 300, 400]]);
    t.up(7);
    assert.equal(t.size, 1);
    t.up(999); // id lạ → không crash
    assert.equal(t.size, 1);
    t.clear();
    assert.equal(t.size, 0);
  });
});

describe("module integration (?qa=1)", () => {
  it("enabled=true, đăng ký touch listeners", () => {
    const { Q, listeners } = bootQa("?qa=1");
    assert.equal(Q.enabled, true);
    assert.ok((listeners["touchstart"] || []).length > 0, "phải hook touchstart");
    assert.ok((listeners["touchmove"] || []).length > 0, "phải hook touchmove");
    assert.ok((listeners["touchend"] || []).length > 0, "phải hook touchend");
  });
  it("touchstart → track point có id", () => {
    const { Q, listeners } = bootQa("?qa=1");
    listeners["touchstart"][0](touchEvent([{ identifier: 7, clientX: 100, clientY: 200 }]));
    listeners["touchstart"][0](touchEvent([{ identifier: 3, clientX: 700, clientY: 200 }]));
    assert.equal(Q._touches.size, 2);
    listeners["touchend"][0](touchEvent([{ identifier: 7, clientX: 100, clientY: 200 }]));
    assert.equal(Q._touches.size, 1);
  });
  it("frame() vẽ panel FPS/wave/touch", () => {
    const { Q, ctxCalls } = bootQa("?qa=1");
    for (let i = 0; i < 20; i++) Q.frame(1 / 60); // > 0.25s → refresh text
    const texts = ctxCalls.filter(c => c[0] === "fillText").map(c => String(c[1]));
    assert.ok(texts.some(t => t.startsWith("FPS ")), `thiếu dòng FPS: ${texts}`);
    assert.ok(texts.some(t => t.includes("wave 5")), `thiếu wave: ${texts}`);
    assert.ok(texts.some(t => t.includes("foe 3")), `thiếu foe: ${texts}`);
  });
  it("vẽ vòng tròn touch theo id", () => {
    const { Q, listeners, ctxCalls } = bootQa("?qa=1");
    listeners["touchstart"][0](touchEvent([{ identifier: 7, clientX: 100, clientY: 200 }]));
    Q.frame(1 / 60);
    const arcs = ctxCalls.filter(c => c[0] === "arc");
    assert.ok(arcs.length > 0, "phải vẽ arc cho touch point");
    assert.deepEqual(arcs[0].slice(1, 3), [100, 200]);
  });
  it("tap nút đóng → disable overlay", () => {
    const { Q, listeners, ctxCalls } = bootQa("?qa=1");
    Q.frame(1 / 60); // draw() tính closeRect (W=800 → x=740,y=8,w=52,h=26)
    assert.equal(Q.enabled, true);
    listeners["touchstart"][0](touchEvent([{ identifier: 1, clientX: 750, clientY: 15 }]));
    assert.equal(Q.enabled, false, "tap vào nút QA x phải tắt overlay");
    assert.equal(Q._touches.size, 0, "tắt thì clear touches");
    const n = ctxCalls.length;
    Q.frame(1 / 60);
    assert.equal(ctxCalls.length, n, "tắt rồi thì frame() không vẽ nữa");
  });
  it("disable() qua API", () => {
    const { Q } = bootQa("?qa=1");
    Q.disable();
    assert.equal(Q.enabled, false);
  });
});

describe("module integration (?qa=0 / vắng)", () => {
  it("?qa=0 → tắt, không hook input", () => {
    const { Q, listeners } = bootQa("?qa=0");
    assert.equal(Q.enabled, false);
    assert.deepEqual(Object.keys(listeners), [], "không được đăng ký listener khi tắt");
  });
  it("không có query → tắt", () => {
    const { Q } = bootQa("");
    assert.equal(Q.enabled, false);
  });
  it("tắt thì frame() không vẽ", () => {
    const { Q, ctxCalls } = bootQa("");
    Q.frame(1 / 60);
    assert.equal(ctxCalls.length, 0);
  });
});
