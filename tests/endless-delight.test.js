/* WINDOWKILL — Endless Delight tests (node:test).
 * Nhiệm vụ #6 (2026-10-04): content wave 30+ — triết lý "vui vẻ > khó khăn".
 *  - 5 modifier mới của Đạo Diễn Sóng (discobullets/confetti/luckypickup/
 *    boingyship/giggle): tồn tại, apply/clear đúng, KHÔNG chạm stat quái.
 *  - Rotation wave 31+: không lặp trong 8 wave, wave %4==0 → combo 2.
 *  - Event combo remix 30+ (goldrush/neonblackout) + trigger table đúng.
 *  - Victory Lap: trigger đúng wave 40/50/60..., thuần celebration.
 *  - KHÓA KHÔNG TĂNG KHÓ: số liệu spawn wave 31+ giữ nguyên công thức hiện tại
 *    (interval sàn 0.22s, cap 20), không band mới, boss nhịp 5 wave.
 *  - BONUS FIX: banner level-up không bao giờ chứa "undefined".
 * Chạy: node --test tests/endless-delight.test.js
 * Pattern: static analysis bằng regex + trích function thuần qua đếm ngoặc
 * (theo tests/season-monsters.test.js), behavioral qua vm cho monsters.js /
 * tuning.js / i18n.js / juice2.js.
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const gameSrc = fs.readFileSync(path.join(ROOT, "js", "game.js"), "utf8");
const monstersSrc = fs.readFileSync(path.join(ROOT, "js", "monsters.js"), "utf8");
const v2glueSrc = fs.readFileSync(path.join(ROOT, "js", "v2glue.js"), "utf8");
const juice2Src = fs.readFileSync(path.join(ROOT, "js", "juice2.js"), "utf8");
const i18nSrc = fs.readFileSync(path.join(ROOT, "js", "i18n.js"), "utf8");
const tuningSrc = fs.readFileSync(path.join(ROOT, "js", "tuning.js"), "utf8");
const config = JSON.parse(fs.readFileSync(path.join(ROOT, "difficulty.config.json"), "utf8"));

/* ---- helpers ---- */
function loadMonsters() {
  const sb = { console, Math, JSON, Object, Array };
  sb.window = sb; sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(monstersSrc, sb, { filename: "js/monsters.js" });
  return sb.Monsters;
}
function loadTuning() {
  const sb = { console, Math, JSON, Object, Array, Promise };
  sb.window = sb; sb.globalThis = sb; // không có fetch → dùng embedded fallback
  vm.createContext(sb);
  vm.runInContext(tuningSrc, sb, { filename: "js/tuning.js" });
  return sb.window.WK_TUNING;
}
function loadI18N() {
  const store = {};
  const sb = {
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    },
    location: { search: "" },
    document: { readyState: "complete", querySelectorAll: () => [], documentElement: {} },
    console,
  };
  sb.window = sb;
  vm.createContext(sb);
  vm.runInContext(i18nSrc, sb, { filename: "js/i18n.js" });
  return sb.window.I18N;
}
/* Trích 1 function declaration từ source bằng đếm ngoặc (chịu được string). */
function extractFn(src, name) {
  const start = src.indexOf("function " + name + "(");
  assert.ok(start !== -1, `không tìm thấy function ${name} trong source`);
  let j = src.indexOf("{", start);
  let depth = 0, inStr = null, esc = false;
  for (; j < src.length; j++) {
    const c = src[j];
    if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === inStr) inStr = null; }
    else if (c === '"' || c === "'" || c === "`") inStr = c;
    else if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) { j++; break; } }
  }
  return src.slice(start, j);
}
/* Các key difficulty CẤM xuất hiện trong logic vui vẻ mới (không tăng khó). */
const DIFF_FORBIDDEN = /spawnQueue|spawnT\b|G\.enemies|enemies\.push|hpMult|speedMult|chewDps|DIFF\.|monster_hp|spawn_interval|interval_base|base_count|per_wave|concurrent_cap|damageEnemy|hurtShip|shrinkWindow/i;

const NEW_MODS = ["discobullets", "confetti", "luckypickup", "boingyship", "giggle"];
const NEW_MOD_FLAGS = {
  discobullets: "vp1_discoBullets",
  confetti: "vp1_confetti",
  luckypickup: "vp1_luckyPickup",
  boingyship: "vp1_boingy",
  giggle: "vp1_giggle",
};
const ALL_17 = ["gemrain", "tiny", "xpturbo", "tailwind", "starbullets", "slowopen",
  "glowparty", "gemmagnet", "djparty", "hullinsurance", "payday", "fireworks",
  ...NEW_MODS];

/* ================= 1. Modifier mới ================= */
describe("Endless Delight — 5 modifier mới (js/monsters.js)", () => {
  it("5 modifier mới tồn tại trong WAVE_MODIFIERS", () => {
    const M = loadMonsters();
    const ids = M.WAVE_MODIFIERS.map((m) => m.id);
    for (const id of NEW_MODS) assert.ok(ids.includes(id), `thiếu modifier ${id}`);
  });
  it("apply set đúng 1 flag, clear reset về falsy", () => {
    const M = loadMonsters();
    for (const id of NEW_MODS) {
      const m = M.WAVE_MODIFIERS.find((x) => x.id === id);
      const G = {};
      m.apply(G);
      assert.equal(Object.keys(G).length, 1, `${id}.apply chỉ được set đúng 1 key`);
      assert.equal(Object.keys(G)[0], NEW_MOD_FLAGS[id], `${id}.apply sai flag`);
      assert.ok(G[NEW_MOD_FLAGS[id]], `${id}.apply phải truthy`);
      m.clear(G);
      assert.ok(!G[NEW_MOD_FLAGS[id]], `${id}.clear phải reset về falsy`);
    }
  });
  it("LUẬT SẮT: mọi apply/clear của 17 modifier chỉ set G.vp1_* (không chạm stat)", () => {
    const bodies = [...monstersSrc.matchAll(/(apply|clear): function \(G\) \{([^}]*)\}/g)];
    assert.equal(bodies.length, 34, "phải có đúng 34 apply/clear (17 modifier)");
    for (const [, kind, body] of bodies) {
      assert.match(body.trim(), /^G\.vp1_\w+ = (true|false|\d+(\.\d+)?);$/,
        `${kind} vi phạm luật sắt (chỉ được gán G.vp1_*): ${body.trim().slice(0, 80)}`);
    }
  });
  it("modifier mới được game.js tiêu thụ (flag đọc ở draw/update/kill)", () => {
    assert.match(gameSrc, /G\.vp1_discoBullets/, "thiếu hook discobullets");
    assert.match(gameSrc, /G\.vp1_confetti/, "thiếu hook confetti");
    assert.match(gameSrc, /G\.vp1_luckyPickup/, "thiếu hook luckypickup");
    assert.match(gameSrc, /G\.vp1_boingy/, "thiếu hook boingyship");
    assert.match(gameSrc, /G\.vp1_giggle/, "thiếu hook giggle");
  });
  it("flag mới được reset khi chơi lại", () => {
    for (const f of Object.values(NEW_MOD_FLAGS)) {
      assert.match(gameSrc, new RegExp(f + ":\\s*false"), `thiếu reset ${f}`);
    }
  });
});

/* ================= 2. Rotation wave 31+ ================= */
describe("Endless Delight — rotation wave 31+ (không lặp, combo)", () => {
  const pick = new Function(extractFn(gameSrc, "vp1EndlessPick") + "; return vp1EndlessPick;")();
  const HISTORY = 8;

  it("VP1_ENDLESS_HISTORY = 8", () => {
    assert.match(gameSrc, /var VP1_ENDLESS_HISTORY = 8;/);
  });
  it("vp1RollModifier chuyển sang endless roll khi wave >= 31", () => {
    assert.match(gameSrc, /if \(n >= 31\) \{ vp1RollModifierEndless\(mods, n\); return; \}/);
  });
  it("wave 31..220: không modifier nào lặp trong 8 wave liên tiếp", () => {
    let hist = [];
    for (let n = 31; n <= 220; n++) {
      const got = pick(ALL_17, hist.slice(), n, Math.random);
      for (const id of got) hist.push(id);
      while (hist.length > HISTORY) hist.shift();
      const win = hist.slice(-HISTORY);
      assert.equal(new Set(win).size, win.length,
        `lặp modifier trong 8 wave gần nhất tại wave ${n}: ${win.join(",")}`);
    }
  });
  it("wave chia hết cho 4 → combo 2 modifier khác nhau; wave khác → 1", () => {
    for (let n = 31; n <= 120; n++) {
      const got = pick(ALL_17, [], n, Math.random);
      if (n % 4 === 0) {
        assert.equal(got.length, 2, `wave ${n} phải combo 2 modifier`);
        assert.notEqual(got[0], got[1], `wave ${n}: 2 modifier phải khác nhau`);
      } else {
        assert.equal(got.length, 1, `wave ${n} chỉ 1 modifier`);
      }
    }
  });
  it("hết pool (lịch sử đầy) → reset và roll lại hợp lệ", () => {
    const got = pick(ALL_17, ALL_17.slice(), 33, () => 0);
    assert.equal(got.length, 1);
    assert.ok(ALL_17.includes(got[0]));
  });
  it("Director vẫn spawn ở wave 31+ (không boss, không breather)", () => {
    const fns = ["vp1IsBreather", "vp1IsBossWave", "vp1DirectorEligible"]
      .map((n) => extractFn(gameSrc, n)).join("\n");
    const f = new Function(fns + "; return { vp1IsBreather, vp1IsBossWave, vp1DirectorEligible };")();
    assert.equal(f.vp1DirectorEligible(31), true);
    assert.equal(f.vp1DirectorEligible(32), true);
    assert.equal(f.vp1DirectorEligible(33), true);
    assert.equal(f.vp1DirectorEligible(35), false, "wave 35 boss → không director");
    assert.equal(f.vp1DirectorEligible(34), false, "wave 34 breather → không director");
    assert.equal(f.vp1DirectorEligible(40), false, "wave 40 boss → không director");
  });
  it("logic endless mới không chạm difficulty", () => {
    for (const n of ["vp1EndlessPick", "vp1RollModifierEndless", "vp1IsVictoryLap"]) {
      const body = extractFn(gameSrc, n);
      assert.ok(!DIFF_FORBIDDEN.test(body), `${n} chạm key difficulty: ${body.slice(0, 120)}`);
    }
  });
});

/* ================= 3. Event combo remix 30+ ================= */
describe("Endless Delight — event combo remix (goldrush / neonblackout)", () => {
  // vp1RollEvent gọi vp1IsBossWave — stub qua tham số của Function
  const rollWithStub = new Function("vp1IsBossWave",
    extractFn(gameSrc, "vp1RollEvent") + "; return vp1RollEvent;")(
    (n) => n % 5 === 0);

  it("goldrush ở wave 36/84/108 (meteor + golden; wave 60 là boss nên bỏ qua)", () => {
    assert.equal(rollWithStub(36), "goldrush");
    assert.equal(rollWithStub(84), "goldrush");
    assert.equal(rollWithStub(108), "goldrush");
    assert.equal(rollWithStub(60), null, "wave 60 boss → không event");
  });
  it("neonblackout ở wave 44/68/92 (blackout + dj)", () => {
    assert.equal(rollWithStub(44), "neonblackout");
    assert.equal(rollWithStub(68), "neonblackout");
    assert.equal(rollWithStub(92), "neonblackout");
  });
  it("event đơn cũ không bị combo ghi đè sai", () => {
    assert.equal(rollWithStub(48), "golden", "wave 48 vẫn golden đơn");
    assert.equal(rollWithStub(42), "blackout", "wave 42 vẫn blackout đơn");
    assert.equal(rollWithStub(38), "meteor", "wave 38 vẫn meteor đơn");
    assert.equal(rollWithStub(62), "meteor", "wave 62 vẫn meteor đơn");
    assert.equal(rollWithStub(50), null, "wave 50 boss → không event");
    assert.equal(rollWithStub(40), null, "wave 40 boss → không event");
    assert.equal(rollWithStub(32), null, "wave 32 thường → không event");
  });
  it("vp1TriggerEvent xử lý combo: goldrush set meteors+golden, neonblackout set blackout+dj", () => {
    const body = extractFn(gameSrc, "vp1TriggerEvent");
    assert.match(body, /ev === "goldrush"/);
    assert.match(body, /ev === "neonblackout"/);
    assert.match(body, /G\.vp1_eventDj = true/);
    assert.ok(!DIFF_FORBIDDEN.test(body), "trigger event chạm difficulty");
  });
  it("startWave tự clear dj của event neonblackout (không rò sang wave sau)", () => {
    assert.match(gameSrc, /if \(G\.vp1_eventDj\) \{ G\.vp1_dj = false; G\.vp1_eventDj = false; \}/);
  });
});

/* ================= 4. Victory Lap ================= */
describe("Endless Delight — Victory Lap (wave 40/50/60...)", () => {
  const isVL = new Function(extractFn(gameSrc, "vp1IsVictoryLap") + "; return vp1IsVictoryLap;")();

  it("trigger đúng wave: 40/50/60/100/110/200, sai wave: 30/35/39/41/45/49/51", () => {
    for (const n of [40, 50, 60, 70, 100, 110, 200]) assert.equal(isVL(n), true, `wave ${n} phải Victory Lap`);
    for (const n of [30, 31, 35, 39, 41, 45, 49, 51, 55]) assert.equal(isVL(n), false, `wave ${n} không Victory Lap`);
  });
  it("startWave gọi Victory Lap trước mọi branch (kể cả boss wave)", () => {
    assert.match(gameSrc, /if \(vp1IsVictoryLap\(n\)\) vp1VictoryLap\(n\);/);
  });
  it("Victory Lap thuần celebration: banner + mưa gem + pháo hoa, KHÔNG chạm difficulty", () => {
    const body = extractFn(gameSrc, "vp1VictoryLap");
    assert.match(body, /vp1\.victory\.banner/);
    assert.match(body, /G\.gems\.push/);
    assert.match(body, /burst\(/);
    assert.ok(!DIFF_FORBIDDEN.test(body),
      `vp1VictoryLap chạm difficulty: ${body.slice(0, 200)}`);
  });
});

/* ================= 5. KHÓA KHÔNG TĂNG KHÓ (số liệu) ================= */
describe("Endless Delight — khóa difficulty wave 30+ (giữ nguyên công thức hiện tại)", () => {
  const PINNED_SPAWN = {
    base_count: 4, per_wave: 3,
    interval_floor_s: 0.22, interval_base_s: 0.85, interval_decay: 0.05,
    concurrent_cap: 20,
  };
  /* So sánh qua JSON để chuẩn hóa object cross-realm (vm) + loại _note. */
  const norm = (o) => {
    const clean = {};
    for (const k of Object.keys(PINNED_SPAWN)) clean[k] = o[k];
    return JSON.parse(JSON.stringify(clean));
  };

  it("difficulty.config.json: tuning.spawn giữ nguyên số đã chốt", () => {
    assert.deepEqual(norm(config.tuning.spawn), PINNED_SPAWN);
  });
  it("js/tuning.js (embedded fallback): tuning.spawn giữ nguyên số đã chốt", () => {
    assert.deepEqual(norm(loadTuning().spawn()), PINNED_SPAWN);
  });
  it("wave 31..80: spawn interval vẫn chạm sàn 0.22s (công thức cũ, không đổi)", () => {
    const s = loadTuning().spawn();
    for (let w = 31; w <= 80; w++) {
      // replicate wkSpawnInterval fallback: max(floor, base*spawnMul*onboard - w*decay), normal + onboard=1
      const iv = Math.max(s.interval_floor_s, s.interval_base_s * 1 * 1 - w * s.interval_decay);
      assert.equal(iv, 0.22, `wave ${w}: interval phải = sàn 0.22s, nhận ${iv}`);
    }
  });
  it("concurrent cap wave 30+ vẫn 20 (không tăng quái cùng lúc)", () => {
    assert.equal(loadTuning().spawn().concurrent_cap, 20);
    assert.equal(config.tuning.spawn.concurrent_cap, 20);
  });
  it("band late_game_15_30 không tràn sang wave 31+ (giữ [15,30])", () => {
    assert.deepEqual(config.tuning.difficulty_bands.late_game_15_30.waves, [15, 30]);
  });
  it("nhịp boss endless vẫn mỗi 5 wave (không thêm boss)", () => {
    assert.equal(config.endless.boss.every_n_waves, 5);
  });
  it("count/wave giữ công thức cũ (4 + 3×wave) — không tăng số lượng", () => {
    const s = loadTuning().spawn();
    assert.equal(s.base_count, 4);
    assert.equal(s.per_wave, 3);
    // game.js buildSpawnQueue: Math.round((TS.base_count + n * TS.per_wave) * ...)
    assert.match(gameSrc, /\(TS\.base_count \+ n \* TS\.per_wave\)/);
  });
});

/* ================= 6. i18n mới (VI/EN, không emoji) ================= */
describe("Endless Delight — i18n VI/EN", () => {
  const NEW_KEYS = [
    "vp1.mod.discobullets.name", "vp1.mod.discobullets.desc",
    "vp1.mod.confetti.name", "vp1.mod.confetti.desc",
    "vp1.mod.luckypickup.name", "vp1.mod.luckypickup.desc",
    "vp1.mod.boingyship.name", "vp1.mod.boingyship.desc",
    "vp1.mod.giggle.name", "vp1.mod.giggle.desc",
    "vp1.event.goldrush.banner", "vp1.event.neonblackout.banner",
    "vp1.victory.banner", "vp1.victory.sub",
    "juice.level_up",
  ];
  const I18N = loadI18N();

  it("mọi key mới tồn tại trong cả VI lẫn EN", () => {
    for (const lang of ["vi", "en"]) {
      I18N.setLang(lang);
      for (const k of NEW_KEYS) {
        const v = I18N.t(k);
        assert.ok(typeof v === "string" && v && v !== k, `thiếu key ${k} (${lang})`);
      }
    }
  });
  it("không key mới nào chứa 'undefined'", () => {
    for (const lang of ["vi", "en"]) {
      I18N.setLang(lang);
      for (const k of NEW_KEYS) {
        assert.ok(!/undefined/i.test(I18N.t(k, { n: 40, level: 3 })), `undefined trong ${k} (${lang})`);
      }
    }
  });
  it("không emoji trong keys vp1 mới (quy ước Design Team)", () => {
    const dict = I18N._dict;
    for (const lang of ["vi", "en"]) {
      for (const k of NEW_KEYS.filter((x) => x.startsWith("vp1."))) {
        // eslint-disable-next-line no-control-regex
        assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(dict[lang][k]), `emoji trong ${k} (${lang})`);
      }
    }
  });
  it("victory banner interpolate {n}", () => {
    I18N.setLang("vi");
    assert.equal(I18N.t("vp1.victory.banner", { n: 40 }), "VICTORY LAP — WAVE 40!");
    I18N.setLang("en");
    assert.equal(I18N.t("vp1.victory.banner", { n: 50 }), "VICTORY LAP — WAVE 50!");
  });
});

/* ================= 7. BONUS FIX: "LÊN CẤP undefined!" ================= */
describe("BONUS FIX — banner level-up không chứa 'undefined'", () => {
  it("v2glue.js forward tham số level sang Juice2 (root cause)", () => {
    assert.match(v2glueSrc, /Juice2\.onLevelUp\(x,\s*y,\s*level\)/,
      "v2glue phải truyền level: Juice2.onLevelUp(x, y, level)");
  });
  it("juice2.js không còn nối chuỗi thô 'LÊN CẤP ' + level", () => {
    assert.ok(!/"LÊN CẤP " \+ level/.test(juice2Src), "vẫn còn concat thô gây undefined");
    assert.match(juice2Src, /juice\.level_up/, "phải dùng key i18n juice.level_up");
    assert.match(juice2Src, /isFinite\(level\)/, "phải guard level bằng isFinite");
  });
  it("behavioral: levelLabel không bao giờ trả về 'undefined' (VI + EN)", () => {
    const store = {};
    const sb = {
      localStorage: {
        getItem: (k) => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: (k) => { delete store[k]; },
      },
      location: { search: "" },
      document: { readyState: "complete", querySelectorAll: () => [], documentElement: {} },
      console,
    };
    sb.window = sb;
    vm.createContext(sb);
    vm.runInContext(i18nSrc, sb, { filename: "js/i18n.js" });
    globalThis.window = sb.window; // juice2 đọc window.I18N qua global
    const Juice2 = require(path.join(ROOT, "js", "juice2.js"));
    try {
      sb.window.I18N.setLang("vi");
      assert.equal(Juice2._levelLabel(3), "LÊN CẤP 3!");
      assert.equal(Juice2._levelLabel(undefined), "LÊN CẤP 1!");
      assert.equal(Juice2._levelLabel(null), "LÊN CẤP 1!");
      assert.equal(Juice2._levelLabel("5"), "LÊN CẤP 1!");
      sb.window.I18N.setLang("en");
      assert.equal(Juice2._levelLabel(5), "LEVEL UP 5!");
      assert.equal(Juice2._levelLabel(undefined), "LEVEL UP 1!");
      for (const v of [Juice2._levelLabel(3), Juice2._levelLabel(undefined), Juice2._levelLabel(NaN)]) {
        assert.ok(!/undefined/i.test(v), `label chứa undefined: ${v}`);
      }
    } finally {
      delete globalThis.window;
    }
  });
});
