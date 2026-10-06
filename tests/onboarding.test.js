/* WINDOWKILL — Wave 0 Onboarding (scripted ~56s) tests (node:test).
 *
 * Spec: wave 0 dạy đúng 1 câu "Đừng để quái gặm hết cửa sổ. Bắn!" qua chơi thử
 * có hướng dẫn — 5 bước (s0 intro → s1 chewer → s3 gem → s4 encore → s5 done),
 * mỗi bước qua sớm khi làm đúng hoặc timeout tự qua; nút Bỏ qua luôn hiện;
 * người cũ (localStorage wk_onboard_v1) không bao giờ chạy lại.
 *
 * Verify:
 *  (a) MANIFEST + build: 19-onboard.js có trong MANIFEST, js/game.js chứa module
 *  (b) trigger: người mới → active, banner WAVE 0, overlay hiện, waveBreak bị giữ
 *  (c) người cũ (flag) → không chạy; ?onboard=0 tắt; ?onboard=1 ép chạy
 *  (d) hất văng chewer → qua bước sớm (msg chuyển sang bước gem)
 *  (e) timeout → tự qua bước
 *  (f) nhặt gem (xp tăng) → qua bước gem
 *  (g) giết cả 2 chewer bước encore → payoff → finish: flag lưu, overlay ẩn,
 *      waveBreak được thả để engine tự startWave(1)
 *  (h) skip(): dừng ngay, lưu flag, dọn quái scripted, overlay ẩn
 *  (i) i18n: đủ 10 key onboard.* VI+EN trong js/i18n.js thật
 *  (j) game.html: overlay #onboard-bar/#onboard-edge + nút skip có data-i18n
 *
 * Chạy: node --test tests/onboarding.test.js
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const SRC = read("js/game/19-onboard.js");

/* ---------- sandbox dựng module 19-onboard.js ---------- */
function makeStore(init) {
  const data = Object.assign({}, init);
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    _data: data,
  };
}
function makeCtx(opts = {}) {
  const store = makeStore(opts.storage);
  const spies = { banner: [], floats: [], bursts: [] };
  const spawned = [];
  const els = {};
  function el(id) {
    if (!els[id]) {
      els[id] = {
        hidden: true, textContent: "", style: {},
        _click: null,
        addEventListener: function (ev, fn) { if (ev === "click") this._click = fn; },
      };
    }
    return els[id];
  }
  const G = Object.assign({
    wave: 0, phase: "play", time: 0, waveBreak: 1.4,
    xp: 0, gems: [], ship: { x: 400, y: 300 },
  }, opts.G);
  const win = {
    localStorage: store,
    addEventListener: () => {},
    WKSpawnGems: (n, x, y) => { G.gems.push({ x, y, vx: 0, vy: 0, v: 1, t: 0 }); },
  };
  const ctx = {
    console, Math, URLSearchParams,
    window: win,
    location: { search: opts.search || "" },
    document: { getElementById: (id) => el(id) },
    G,
    bounds: () => ({ x: 0, y: 0, w: 800, h: 600 }),
    spawnEnemyAt: (type, x, y) => {
      const e = { type, x, y, latched: null, dead: false, speed: 78, hp: 3 };
      spawned.push(e);
      return e;
    },
    setBanner: (t, s) => spies.banner.push([t, s]),
    addFloat: (x, y, txt, color, big) => spies.floats.push({ txt, color }),
    burst: (x, y, n, colors, spd) => spies.bursts.push({ x, y, n }),
    I18N: { t: (k) => k, getLang: () => "vi" }, // t() trả key → module dùng OB_FALLBACK
  };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx, { filename: "19-onboard.js" });
  // pre-create các element overlay để test đọc được ngay cả khi chưa show
  ["onboard-bar", "onboard-msg", "onboard-edge", "onboard-skip"].forEach(el);
  return { ctx, spies, spawned, els, G, win, store, Onboard: ctx.window.Onboard };
}
/* tiến thời gian game: tick(dt) nhiều lần, đồng bộ G.time */
function advance(r, sec) {
  const n = Math.ceil(sec / 0.25);
  for (let i = 0; i < n; i++) { r.G.time += 0.25; r.Onboard.tick(0.25); }
}
const msgOf = (r) => r.els["onboard-msg"].textContent;

describe("Onboarding — wiring tĩnh", () => {
  it("(a) MANIFEST có 19-onboard.js; js/game.js chứa module đã build", () => {
    const man = read("js/game/MANIFEST.txt").split("\n").map((s) => s.trim()).filter(Boolean);
    assert.ok(man.includes("19-onboard.js"), "MANIFEST thiếu 19-onboard.js");
    assert.ok(man.indexOf("19-onboard.js") < man.indexOf("18-boot.js"), "19-onboard.js phải trước 18-boot.js (boot luôn cuối để giữ anchor test)");
    assert.ok(read("js/game.js").includes("window.Onboard"), "js/game.js chưa chứa module (quên build?)");
  });
  it("(j) game.html có overlay + nút skip gắn i18n", () => {
    const html = read("game.html");
    assert.ok(html.includes('id="onboard-bar"'), "thiếu #onboard-bar");
    assert.ok(html.includes('id="onboard-msg"'), "thiếu #onboard-msg");
    assert.ok(html.includes('id="onboard-edge"'), "thiếu #onboard-edge");
    assert.ok(html.includes('id="onboard-skip"'), "thiếu #onboard-skip");
    assert.ok(html.includes('data-i18n="onboard.skip"'), "nút skip thiếu data-i18n");
    assert.ok(html.includes("@keyframes obEdgePulse"), "thiếu CSS animation highlight viền");
  });
  it("(i) đủ 10 key onboard.* VI+EN trong js/i18n.js", () => {
    const src = read("js/i18n.js");
    const keys = ["onboard.skip", "onboard.title", "onboard.s0", "onboard.s1", "onboard.s2",
      "onboard.s3", "onboard.s4", "onboard.s5", "onboard.knock"];
    for (const k of keys) {
      const hits = (src.match(new RegExp(`"${k.replace(/\./g, "\\.")}"`, "g")) || []).length;
      assert.ok(hits >= 2, `key ${k} phải có ở cả VI+EN (thấy ${hits} lần)`);
    }
    // không sửa key của workstream khác: sanity vài key cũ còn nguyên
    assert.ok(src.includes('"banner.next"'), "key banner.next bị mất?");
  });
});

describe("Onboarding — trigger & skip cho người cũ", () => {
  it("(b) người mới: maybeStart → active, banner WAVE 0, overlay hiện, giữ waveBreak", () => {
    const r = makeCtx();
    r.Onboard.maybeStart();
    assert.equal(r.Onboard.isActive(), true);
    assert.ok(r.spies.banner.some(([t]) => t.includes("WAVE 0")), "phải setBanner WAVE 0");
    assert.equal(r.els["onboard-bar"].hidden, false, "coach-mark bar phải hiện");
    assert.ok(msgOf(r).includes("Đừng để quái gặm"), `msg bước đầu sai: ${msgOf(r)}`);
    assert.equal(r.spawned.length, 1, "bước s0 phải spawn 1 chewer");
    r.Onboard.tick(0.25);
    assert.ok(r.G.waveBreak >= 2.0, "waveBreak phải bị giữ ≥2 để chưa vào wave 1");
  });
  it("(c) người cũ (đã có flag) → không chạy lại", () => {
    const r = makeCtx({ storage: { wk_onboard_v1: "1" } });
    r.Onboard.maybeStart();
    assert.equal(r.Onboard.isActive(), false);
    assert.equal(r.els["onboard-bar"].hidden, true);
    assert.equal(r.Onboard.isDone(), true);
  });
  it("(c) ?onboard=0 tắt hẳn; ?onboard=1 ép chạy dù đã có flag", () => {
    const off = makeCtx({ search: "?onboard=0" });
    off.Onboard.maybeStart();
    assert.equal(off.Onboard.isActive(), false);
    const force = makeCtx({ search: "?onboard=1", storage: { wk_onboard_v1: "1" } });
    force.Onboard.maybeStart();
    assert.equal(force.Onboard.isActive(), true, "?onboard=1 phải ép chạy lại (QA)");
  });
  it("(c) không chạy khi không phải đầu run (wave != 0)", () => {
    const r = makeCtx({ G: { wave: 3 } });
    r.Onboard.maybeStart();
    assert.equal(r.Onboard.isActive(), false);
  });
});

describe("Onboarding — step machine", () => {
  it("(d) chewer bám viền → msg báo gặm + highlight viền; hất văng → qua bước sớm", () => {
    const r = makeCtx();
    r.Onboard.maybeStart();
    advance(r, 8.5); // hết s0 → sang bước s1 (chewer)
    const chew = r.spawned[0];
    chew.latched = "top";
    r.Onboard.tick(0.25); r.G.time += 0.25;
    assert.ok(msgOf(r).includes("đang gặm"), `đã bám viền phải báo gặm: ${msgOf(r)}`);
    const edgeEl = r.els["onboard-edge"];
    assert.equal(edgeEl.style.display, "block", "viền bị gặm phải được highlight");
    // bắn vào viền → hất văng (latched tuột, còn sống)
    chew.latched = null;
    r.Onboard.tick(0.25); r.G.time += 0.25;
    assert.ok(r.spies.floats.some((f) => f.txt.includes("Bốp")), "phải có float Bốp! khi hất văng");
    assert.ok(msgOf(r).includes("mảnh kính"), `phải sang bước gem: ${msgOf(r)}`);
  });
  it("(e) timeout → tự qua bước (người chơi AFK vẫn xong ~56s)", () => {
    const r = makeCtx();
    r.Onboard.maybeStart();
    advance(r, 8.5);   // hết s0 (8s) → s1
    assert.ok(msgOf(r).length > 0);
    advance(r, 15);    // hết s1 (15s) → s3 gem
    assert.ok(msgOf(r).includes("mảnh kính"), `timeout s1 phải sang bước gem: ${msgOf(r)}`);
    advance(r, 12);    // hết s3 (12s) → s4 encore
    assert.ok(msgOf(r).includes("Lại nào"), `timeout s3 phải sang encore: ${msgOf(r)}`);
  });
  it("(f) nhặt gem (xp tăng) → qua bước gem; giết 2 chewer encore → done → finish", () => {
    const r = makeCtx();
    r.Onboard.maybeStart();
    advance(r, 8.5);   // → s1
    const chew = r.spawned[0];
    chew.dead = true;  // giết luôn (cũng là cách qua)
    r.Onboard.tick(0.25); r.G.time += 0.25;
    assert.ok(msgOf(r).includes("mảnh kính"), "giết chewer phải sang bước gem");
    r.G.xp = 2;        // nhặt gem
    r.Onboard.tick(0.25); r.G.time += 0.25;
    assert.ok(msgOf(r).includes("Lại nào"), `nhặt gem phải sang encore: ${msgOf(r)}`);
    const aliveEncore = r.spawned.filter((e) => !e.dead);
    assert.equal(aliveEncore.length, 2, "encore phải spawn 2 chewer còn sống");
    r.spawned.forEach((e) => { e.dead = true; });
    advance(r, 3);     // qua điều kiện stepT > 2
    assert.ok(msgOf(r).includes("WAVE 1"), `phải sang payoff: ${msgOf(r)}`);
    advance(r, 3.5);   // payoff hiện đủ 3s rồi finish
    assert.equal(r.Onboard.isActive(), false, "xong payoff phải finish");
    assert.equal(r.store._data["wk_onboard_v1"], "1", "phải lưu flag đã học");
    assert.equal(r.els["onboard-bar"].hidden, true, "overlay phải ẩn");
  });
  it("(g) finish thả waveBreak để engine tự startWave(1)", () => {
    const r = makeCtx();
    r.Onboard.maybeStart();
    advance(r, 60); // chạy hết mọi timeout
    assert.equal(r.Onboard.isActive(), false);
    assert.ok(r.G.waveBreak <= 1.2, `waveBreak phải được thả (got ${r.G.waveBreak})`);
    assert.equal(r.G.wave, 0, "module không tự đổi wave — engine gọi startWave(1)");
  });
  it("(h) skip(): dừng ngay, lưu flag, dọn quái, ẩn overlay", () => {
    const r = makeCtx();
    r.Onboard.maybeStart();
    assert.equal(r.spawned.length, 1);
    r.els["onboard-skip"]._click(); // bấm nút Bỏ qua
    assert.equal(r.Onboard.isActive(), false);
    assert.equal(r.store._data["wk_onboard_v1"], "1");
    assert.equal(r.els["onboard-bar"].hidden, true);
    assert.ok(r.spawned.every((e) => e.dead), "quái scripted phải bị dọn khi skip");
    assert.ok(r.G.waveBreak <= 1.2, "skip cũng thả waveBreak để vào wave 1");
  });
  it("resetGame giữa chừng (G.time quay về 0) → chạy lại từ bước đầu", () => {
    const r = makeCtx();
    r.Onboard.maybeStart();
    advance(r, 20); // đang ở bước giữa
    r.G.time = 0;   // mô phỏng resetGame
    r.G.enemies = [];
    r.Onboard.tick(0.25);
    assert.equal(r.Onboard.isActive(), true);
    assert.ok(msgOf(r).includes("Đừng để quái gặm"), "phải restart từ bước s0");
  });
  it("an toàn: wave đã sang 1 (bên ngoài đổi) → tự finish, không kẹt", () => {
    const r = makeCtx();
    r.Onboard.maybeStart();
    r.G.wave = 1;
    r.Onboard.tick(0.25);
    assert.equal(r.Onboard.isActive(), false);
  });
});
