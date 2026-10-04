/* WINDOWKILL — Súng Bắn Keo (thay Keo Tự Vá 2026-10-04, CEO chốt).
 *
 * Bối cảnh: Keo Tự Vá cũ (+10px/20s bị động = 0.5px/s) quá yếu so với tốc độ
 * quái cắn viền (10-30px/phát) — user chê "không có công dụng".
 * Quyết định CEO (widget 2026-10-04): thay bằng Súng Bắn Keo chủ động —
 * bấm E vá ngay +60px, hồi chiêu 30s. id giữ nguyên "keo_tu_va" để khỏi
 * vỡ reference (U2_ICON, i18n key, test cũ).
 *
 * Test này verify:
 *  (a) Upgrades2.applyUpgrade("keo_tu_va") tạo ship.glueGun = { cd:0, maxCd:30, px:60 },
 *      và KHÔNG còn tạo ship.selfGlue;
 *  (b) Upgrades2.tick giảm cooldown theo dt, clamp ở 0 (không âm);
 *  (c) dname/ddesc trả về tên/mô tả mới VI + EN;
 *  (d) fireGlueGun() thật (từ js/game.js): vá đúng px qua growWindow(px, px*0.75),
 *      addFloat "+60px" màu #9df3ff, gọi AudioEngine.sfx.slurp(), bắn 24 hạt keo,
 *      set G.glueFlash = 0.3, set cd = maxCd; trả về true;
 *  (e) cooldown chặn bắn liên tiếp (lần 2 trả về false, growWindow không gọi thêm);
 *  (f) không có glueGun → trả về false;
 *  (g) phím E (mock keydown): phase "play" + sẵn sàng → gọi fireGlueGun;
 *      phase "paused" → không gọi; đang cooldown → không gọi.
 *
 * Chạy: node --test tests/glue-gun.test.js
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");

/* ================= Part 1: upgrades2.js (require trực tiếp) ================= */

function loadUpgrades2(i18nMap) {
  // fresh module mỗi lần để tránh state _taken leak giữa test
  const mPath = path.join(ROOT, "js/upgrades2.js");
  delete require.cache[require.resolve(mPath)];
  if (i18nMap) {
    global.window = { I18N: { t: (k) => (k in i18nMap ? i18nMap[k] : k) } };
  } else {
    delete global.window;
  }
  const U2 = require(mPath);
  // KHÔNG xóa global.window ở đây — T() đọc window tại lúc gọi dname/ddesc.
  // Mỗi test tự dọn qua cleanup().
  return { U2, cleanup: () => { delete global.window; } };
}

describe("Súng Bắn Keo — Upgrades2.apply/tick/i18n", () => {
  it("(a) apply tạo ship.glueGun { cd:0, maxCd:30, px:60 }, không còn selfGlue", () => {
    const { U2, cleanup } = loadUpgrades2();
    try {
      const ship = {};
      assert.ok(U2.applyUpgrade("keo_tu_va", ship)); // trả về upgrade object
      assert.deepEqual(ship.glueGun, { cd: 0, maxCd: 30, px: 60 });
      assert.equal(ship.selfGlue, undefined);
    } finally { cleanup(); }
  });

  it("(b) tick giảm cooldown theo dt và clamp ở 0", () => {
    const { U2, cleanup } = loadUpgrades2();
    try {
      const ship = { glueGun: { cd: 10, maxCd: 30, px: 60 } };
      U2.tick(ship, 3);
      assert.equal(ship.glueGun.cd, 7);
      U2.tick(ship, 10);
      assert.equal(ship.glueGun.cd, 0); // clamp, không âm
      U2.tick(ship, 5);
      assert.equal(ship.glueGun.cd, 0);
    } finally { cleanup(); }
  });

  it("(b2) tick không crash khi chưa có glueGun, không trả về glue event", () => {
    const { U2, cleanup } = loadUpgrades2();
    try {
      assert.equal(U2.tick({}, 1), null);
      assert.equal(U2.tick(null, 1), null);
    } finally { cleanup(); }
  });

  it("(c) dname/ddesc VI mặc định (không I18N)", () => {
    const { U2, cleanup } = loadUpgrades2();
    try {
      const u = U2.get("keo_tu_va");
      assert.equal(U2.dname(u), "Súng Bắn Keo");
      assert.equal(U2.ddesc(u), "Bấm E: vá ngay +60px cửa sổ. Hồi chiêu 30s.");
    } finally { cleanup(); }
  });

  it("(c2) dname/ddesc EN qua I18N", () => {
    const { U2, cleanup } = loadUpgrades2({
      "upg2.keo_tu_va.name": "Glue Gun",
      "upg2.keo_tu_va.desc": "Press E: instantly patch +60px window. 30s cooldown.",
    });
    try {
      const u = U2.get("keo_tu_va");
      assert.equal(U2.dname(u), "Glue Gun");
      assert.equal(U2.ddesc(u), "Press E: instantly patch +60px window. 30s cooldown.");
    } finally { cleanup(); }
  });
});

/* ================= Part 2: game.js — fireGlueGun + phím E =================
 * game.js bọc IIFE nên không gọi trực tiếp được — trích source hàm thật
 * bằng cân bằng ngoặc (pattern tests/shipper-wave11.test.js) rồi chạy
 * trong vm context với mock. */

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

function extractKeydownHandler(src) {
  const headRe = /addEventListener\("keydown",\s*e\s*=>\s*\{/;
  const m = headRe.exec(src);
  assert.ok(m, "không tìm thấy keydown handler trong js/game.js");
  let depth = 0, i = m.index + m[0].length - 1;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (depth === 0) break; }
  }
  assert.ok(depth === 0, "ngoặc mất cân bằng trong keydown handler");
  // i đang ở "}" đóng arrow function → lấy thêm ")" đóng addEventListener(
  assert.equal(src[i + 1], ")", "thiếu ) đóng addEventListener");
  return src.slice(m.index, i + 2);
}

function runFireGlueGun(shipState) {
  const spies = { grow: [], floats: [], slurps: 0, parts: [] };
  const G = { ship: shipState, parts: [], glueFlash: 0 };
  const ctx = {
    console, Math,
    G,
    growWindow: (dw, dh) => spies.grow.push([dw, dh]),
    addFloat: (x, y, txt, color) => spies.floats.push({ txt, color }),
    AudioEngine: { sfx: { slurp: () => { spies.slurps++; } } },
    addPart: (p) => { spies.parts.push(p); },
  };
  vm.createContext(ctx);
  const result = vm.runInContext(
    extractFunction(gameSrc, "fireGlueGun") + "\nfireGlueGun();", ctx,
    { filename: "fireGlueGun" });
  return { result, spies, G };
}

function runKeydown(code, repeat, phase, glueCd) {
  const calls = { fireGlueGun: 0 };
  const G = { phase, ship: { x: 400, y: 300 } };
  if (glueCd !== null) G.ship.glueGun = { cd: glueCd, maxCd: 30, px: 60 };
  const ctx = {
    console, Math, JSON,
    G,
    keys: {},
    musicOn: true, curTrack: null,
    AudioEngine: { resume: () => {}, setSettings: () => {}, startMusic: () => {}, sfx: {} },
    SatManager: { flush: () => {} },
    pauseGame: () => {}, resetGame: () => {},
    BGM: { setEnabled: () => {} },
    localStorage: { getItem: () => null, setItem: () => {} },
    Upgrades2: { tryAnchor: () => false },
    StageFX: { modules: {} },
    fireGlueGun: () => { calls.fireGlueGun++; return true; },
  };
  ctx.window = { addEventListener: (t, fn) => { ctx._keydown = fn; } };
  // handler trích ra gọi addEventListener trần (không có prefix window.)
  ctx.addEventListener = (t, fn) => { if (t === "keydown") ctx._keydown = fn; };
  vm.createContext(ctx);
  vm.runInContext(extractKeydownHandler(gameSrc), ctx, { filename: "keydown" });
  assert.ok(typeof ctx._keydown === "function", "keydown listener phải được đăng ký");
  ctx._keydown({ code, repeat: !!repeat, preventDefault: () => {} });
  return calls.fireGlueGun;
}

describe("Súng Bắn Keo — fireGlueGun + phím E (hàm thật từ game.js)", () => {
  it("(d) fireGlueGun vá đúng px, float, sfx, hạt, flash, set cooldown", () => {
    const ship = { x: 400, y: 300, glueGun: { cd: 0, maxCd: 30, px: 60 } };
    const { result, spies, G } = runFireGlueGun(ship);
    assert.equal(result, true);
    assert.deepEqual(spies.grow, [[60, 45]]); // growWindow(60, 45)
    assert.equal(spies.floats.length, 1);
    assert.equal(spies.floats[0].txt, "+60px");
    assert.equal(spies.floats[0].color, "#9df3ff");
    assert.equal(spies.slurps, 1); // AudioEngine.sfx.slurp()
    assert.equal(spies.parts.length, 24); // chùm hạt keo
    assert.equal(G.glueFlash, 0.3); // viền flash cyan 0.3s
    assert.equal(ship.glueGun.cd, 30); // hồi chiêu 30s
  });

  it("(e) cooldown chặn bắn liên tiếp", () => {
    const ship = { x: 400, y: 300, glueGun: { cd: 0, maxCd: 30, px: 60 } };
    assert.equal(runFireGlueGun(ship).result, true);
    const second = runFireGlueGun(ship); // cd=30 > 0
    assert.equal(second.result, false);
    assert.equal(second.spies.grow.length, 0);
    ship.glueGun.cd = 0; // hết cooldown → bắn lại được
    assert.equal(runFireGlueGun(ship).result, true);
  });

  it("(f) không có glueGun → false, không tác dụng phụ", () => {
    const { result, spies } = runFireGlueGun({ x: 400, y: 300 });
    assert.equal(result, false);
    assert.equal(spies.grow.length, 0);
    assert.equal(spies.slurps, 0);
    assert.equal(spies.parts.length, 0);
  });

  it("(g) phím E: play + không repeat → gọi fireGlueGun; paused/repeat → không", () => {
    // Handler chỉ gate theo (KeyE && !repeat && phase==="play") — cooldown guard
    // nằm BÊN TRONG fireGlueGun (đã test ở (e)), nên handler vẫn gọi khi đang cd.
    assert.equal(runKeydown("KeyE", false, "play", 0), 1); // bắn
    assert.equal(runKeydown("KeyE", false, "play", 12), 1); // handler vẫn gọi, fireGlueGun tự chặn
    assert.equal(runKeydown("KeyE", false, "paused", 0), 0); // paused → không gọi
    assert.equal(runKeydown("KeyE", true, "play", 0), 0); // repeat → không gọi
    assert.equal(runKeydown("KeyA", false, "play", 0), 0); // phím khác → không gọi
  });
});
