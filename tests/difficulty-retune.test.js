/* WINDOWKILL — Sprint Round 2 · Item 6: retune difficulty wave 15–30 (data PR).
 *
 *  - Công thức spawn interval band late_game_15_30: max(1.1s, 3.8s × 0.93^w)
 *    → wave 25: 1.1s → ~54.5 spawn/phút ≤ 55 (chống spam, "căng nhưng công bằng").
 *  - concurrent_cap giữ 20 trong config.
 *  - 6 spotlight waves (17/19/21/24/27/29): ép modifier/event từ data thay vì random;
 *    boss wave (20/25/30) không spotlight.
 *  - Banner "SẮP CÓ THÊM QUÁI!" khi concurrent cap hit (i18n VI/EN, không emoji).
 *
 * Chạy: node --test tests/difficulty-retune.test.js
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const CFG = JSON.parse(read("difficulty.config.json"));
const gameSrc = read("js/game.js");

/* Boot js/tuning.js thật trong vm, fetch trả về difficulty.config.json thật. */
function bootTuning() {
  const cfgText = read("difficulty.config.json");
  const sandbox = {
    console, JSON, Object, Array, Math, String, Number, Boolean, Date,
    parseInt, parseFloat, isNaN, isFinite,
    Promise, setTimeout: () => 0, clearTimeout: () => {},
    fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(cfgText)) }),
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(read("js/tuning.js"), sandbox, { filename: "js/tuning.js" });
  return sandbox;
}

/* Boot js/i18n.js thật trong vm (pattern theo tests/i18n-coverage.test.js). */
function bootI18n() {
  const store = {};
  const sandbox = {
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    },
    location: { search: "" },
    document: { readyState: "complete", querySelectorAll: () => [], documentElement: {} },
    console,
  };
  sandbox.window = sandbox;
  sandbox.window.location = sandbox.location;
  sandbox.window.localStorage = sandbox.localStorage;
  vm.createContext(sandbox);
  vm.runInContext(read("js/i18n.js"), sandbox, { filename: "js/i18n.js" });
  return sandbox.window.I18N;
}

const noEmoji = (s) => !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u.test(s);

/* ---------- (a) công thức interval wave 15/20/25/30 ---------- */
describe("Item 6 — công thức spawn interval band 15–30: max(1.1s, 3.8s × 0.93^w)", () => {
  it("config có đủ 3 key công thức trong band", () => {
    const b = CFG.tuning.difficulty_bands.late_game_15_30;
    assert.equal(b.spawn_interval_base_s, 3.8, "spawn_interval_base_s = 3.8");
    assert.equal(b.spawn_interval_decay, 0.93, "spawn_interval_decay = 0.93");
    assert.equal(b.spawn_interval_min_s, 1.1, "spawn_interval_min_s = 1.1");
  });
  it("loader WK_TUNING.spawnIntervalFor cho đúng số ở wave 15/20/25/30", async () => {
    const sb = bootTuning();
    await sb.WK_TUNING.ready;
    assert.equal(sb.WK_TUNING.source, "file", "đọc từ file config");
    const iv = (w) => sb.WK_TUNING.spawnIntervalFor(w);
    // giá trị kỳ vọng tính độc lập: max(1.1, 3.8 × 0.93^w)
    assert.ok(Math.abs(iv(15) - 1.2795) < 0.001, `wave 15 ≈ 1.2795s, nhận ${iv(15)}`);
    assert.ok(Math.abs(iv(16) - 1.1899) < 0.001, `wave 16 ≈ 1.1899s, nhận ${iv(16)}`);
    assert.ok(Math.abs(iv(17) - 1.1066) < 0.001, `wave 17 ≈ 1.1066s, nhận ${iv(17)}`);
    assert.equal(iv(18), 1.1, "wave 18 chạm sàn 1.1s");
    assert.equal(iv(20), 1.1, "wave 20 = 1.1s");
    assert.equal(iv(25), 1.1, "wave 25 = 1.1s");
    assert.equal(iv(30), 1.1, "wave 30 = 1.1s");
  });
  it("ngoài band 15–30 loader trả null (game dùng công thức cũ)", async () => {
    const sb = bootTuning();
    await sb.WK_TUNING.ready;
    assert.equal(sb.WK_TUNING.spawnIntervalFor(5), null, "wave 5 → null");
    assert.equal(sb.WK_TUNING.spawnIntervalFor(14), null, "wave 14 → null");
    assert.equal(sb.WK_TUNING.spawnIntervalFor(31), null, "wave 31 → null");
  });
  it("embed fallback cũng có công thức (offline/file://)", async () => {
    const sandbox = {
      console, JSON, Object, Array, Math, String, Number, Boolean, Date,
      parseInt, parseFloat, isNaN, isFinite,
      Promise, setTimeout: () => 0, clearTimeout: () => {},
      fetch: () => Promise.reject(new Error("offline")),
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(read("js/tuning.js"), sandbox, { filename: "js/tuning.js" });
    await sandbox.WK_TUNING.ready;
    assert.equal(sandbox.WK_TUNING.source, "embedded");
    assert.equal(sandbox.WK_TUNING.spawnIntervalFor(25), 1.1, "embed: wave 25 = 1.1s");
    assert.ok(Math.abs(sandbox.WK_TUNING.spawnIntervalFor(15) - 1.2795) < 0.001,
      "embed: wave 15 ≈ 1.2795s");
  });
});

/* ---------- (b) spawn/phút wave 25 ≤ 55 ---------- */
describe("Item 6 — trần spawn/phút (chống spam cuối game)", () => {
  it("wave 25: 60/1.1 ≈ 54.5 spawn/phút ≤ 55", async () => {
    const sb = bootTuning();
    await sb.WK_TUNING.ready;
    const perMin = 60 / sb.WK_TUNING.spawnIntervalFor(25);
    assert.ok(perMin <= 55, `wave 25: ${perMin.toFixed(1)} spawn/phút phải ≤ 55`);
  });
  it("mọi wave 15–30 đều ≤ 55 spawn/phút", async () => {
    const sb = bootTuning();
    await sb.WK_TUNING.ready;
    for (let w = 15; w <= 30; w++) {
      const perMin = 60 / sb.WK_TUNING.spawnIntervalFor(w);
      assert.ok(perMin <= 55 + 1e-9, `wave ${w}: ${perMin.toFixed(1)}/phút > 55`);
    }
  });
});

/* ---------- (c) concurrent_cap = 20 ---------- */
describe("Item 6 — concurrent cap giữ 20 (pacing mềm)", () => {
  it("config tuning.spawn.concurrent_cap = 20", () => {
    assert.equal(CFG.tuning.spawn.concurrent_cap, 20, "concurrent_cap = 20");
  });
  it("loader spawn().concurrent_cap = 20", async () => {
    const sb = bootTuning();
    await sb.WK_TUNING.ready;
    assert.equal(sb.WK_TUNING.spawn().concurrent_cap, 20);
  });
  it("game.js: nhánh cap chỉ hoãn 0.25s, không drop queue + có banner", () => {
    const capBlock = gameSrc.match(/G\.enemies\.length >= TS\.concurrent_cap\) \{([\s\S]*?)\n      \} else/);
    assert.ok(capBlock, "nhánh concurrent cap tồn tại");
    assert.match(capBlock[1], /G\.spawnT = 0\.25/, "nhánh cap chỉ hoãn spawn 0.25s");
    assert.ok(!/\.pop\(\)/.test(capBlock[1]), "nhánh cap KHÔNG pop/drop quái khỏi queue");
    assert.match(capBlock[1], /vp1\.cap\.banner/, "nhánh cap hiện banner vp1.cap.banner");
  });
});

/* ---------- (d) 6 spotlight waves ---------- */
describe("Item 6 — 6 spotlight waves (data: tuning.spotlights)", () => {
  const spots = () => CFG.tuning.spotlights;
  it("đủ 6 wave: 17/19/21/24/27/29", () => {
    const keys = Object.keys(spots()).filter((k) => k.charAt(0) !== "_").map(Number).sort((a, b) => a - b);
    assert.deepEqual(keys, [17, 19, 21, 24, 27, 29], "đúng 6 spotlight waves");
  });
  it("nội dung từng spotlight đúng thiết kế", () => {
    assert.deepEqual(spots()["17"].mods, ["tiny"], "17: Diễu Hành Tí Hon (ép modifier tiny)");
    assert.equal(spots()["19"].elite_parade, true, "19: Elite Parade");
    assert.deepEqual(spots()["21"].mods, ["payday"], "21: Ngày Lương (ép modifier payday)");
    assert.equal(spots()["24"].event, "golden", "24: Giờ Vàng tri ân (ép event golden)");
    assert.deepEqual(spots()["27"].mods, ["djparty"], "27: Disco Invasion (ép modifier djparty)");
    assert.equal(spots()["29"].mods, "random2", "29: Final Audition (roll 2 modifier)");
  });
  it("loader spotlightFor đọc đúng từng wave", async () => {
    const sb = bootTuning();
    await sb.WK_TUNING.ready;
    assert.deepEqual(JSON.parse(JSON.stringify(sb.WK_TUNING.spotlightFor(17))), { mods: ["tiny"] });
    assert.deepEqual(JSON.parse(JSON.stringify(sb.WK_TUNING.spotlightFor(19))), { elite_parade: true });
    assert.deepEqual(JSON.parse(JSON.stringify(sb.WK_TUNING.spotlightFor(24))), { event: "golden" });
    assert.deepEqual(JSON.parse(JSON.stringify(sb.WK_TUNING.spotlightFor(29))), { mods: "random2" });
    assert.equal(sb.WK_TUNING.spotlightFor(18), null, "wave 18 không spotlight");
    assert.equal(sb.WK_TUNING.spotlightFor(16), null, "wave 16 (breather) không spotlight");
  });
  it("game.js: vp1ApplySpotlight tồn tại, boss wave không spotlight", () => {
    assert.match(gameSrc, /function vp1ApplySpotlight\(n\)/, "có hàm vp1ApplySpotlight");
    assert.match(gameSrc, /function vp1ApplySpotlight\(n\) \{\s*\n\s*if \(vp1IsBossWave\(n\)\) return null;/,
      "boss wave (20/25/30) → return null, giữ thuần");
  });
  it("game.js: startWave apply spotlight trước buildSpawnQueue + bỏ roll event khi đã ép", () => {
    assert.match(gameSrc, /const vp1spot = vp1ApplySpotlight\(n\);\s*\n\s*G\.spawnQueue = buildSpawnQueue\(n\);/,
      "spotlight apply trước buildSpawnQueue (elite parade bias pool)");
    assert.match(gameSrc, /if \(!vp1spot \|\| !vp1spot\.event\)/, "bỏ roll event khi spotlight đã ép event");
  });
  it("game.js: director không roll random ở spotlight wave", () => {
    assert.match(gameSrc, /function vp1RollModifier\(e\) \{\s*\n\s*if \(G\.vp1_spotlight\) return;/,
      "vp1RollModifier bỏ qua khi G.vp1_spotlight");
  });
  it("game.js: wave 29 xử lý random2 (2 modifier khác nhau)", () => {
    assert.match(gameSrc, /spot\.mods === "random2"/, "nhận diện random2");
    assert.match(gameSrc, /while \(ids\.length < 2 && pool\.length\)/, "roll đúng 2 modifier khác nhau");
  });
  it("game.js: elite parade không đổi stat (chỉ visual + gem)", () => {
    assert.match(gameSrc, /e\.vp1_elite = true/, "đánh dấu quái tinh anh");
    assert.match(gameSrc, /vòng vàng.*\(chỉ visual\)|\(chỉ visual\)/, "ghi chú chỉ visual");
    // gem bonus: (tank?3:1) + (elite?2:0)
    assert.match(gameSrc, /\(e\.vp1_elite \? 2 : 0\)/, "elite rớt thêm 2 gem");
    // KHÔNG có hp/speed/dmg buff nào cho elite
    const eliteLines = gameSrc.split("\n").filter((l) => l.includes("vp1_elite"));
    for (const l of eliteLines) {
      assert.ok(!/e\.hp\s*\*=|e\.speed\s*\*=|e\.dmg\s*=/.test(l), `không buff stat ở dòng: ${l.trim()}`);
    }
  });
  it("wave 24 Giờ Vàng vẫn trigger (roll table Pack 1 + spotlight khóa lại)", () => {
    assert.match(gameSrc, /if \(n >= 24 && n % 24 === 0\) return "golden"/,
      "vp1RollEvent: wave 24 → golden");
    assert.match(gameSrc, /vp1TriggerEvent\(spot\.event, n\)/, "spotlight ép event qua vp1TriggerEvent");
  });
});

/* ---------- (e) banner cap i18n VI/EN ---------- */
describe("Item 6 — banner concurrent cap i18n VI/EN (không emoji)", () => {
  it('"vp1.cap.banner" tồn tại ở cả 2 locale, đúng nội dung, không emoji', () => {
    const I18N = bootI18n();
    I18N.setLang("vi");
    const vi = I18N.t("vp1.cap.banner");
    I18N.setLang("en");
    const en = I18N.t("vp1.cap.banner");
    assert.equal(vi, "SẮP CÓ THÊM QUÁI!", "VI đúng nội dung");
    assert.equal(en, "MORE MONSTERS INCOMING!", "EN đúng nội dung");
    assert.ok(noEmoji(vi) && noEmoji(en), "không emoji");
  });
  it("các key spotlight banner mới tồn tại VI/EN, không emoji", () => {
    const I18N = bootI18n();
    for (const lang of ["vi", "en"]) {
      I18N.setLang(lang);
      for (const k of ["vp1.spotlight.elite.banner", "vp1.spotlight.elite.sub",
                       "vp1.spotlight.double.banner", "vp1.spotlight.golden.sub"]) {
        const v = I18N.t(k);
        assert.notEqual(v, k, `${lang}: key ${k} tồn tại`);
        assert.ok(v.length > 0, `${lang}: ${k} không rỗng`);
        assert.ok(noEmoji(v), `${lang}: ${k} không emoji`);
      }
    }
  });
});
