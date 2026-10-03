/* WINDOWKILL — Sprint Round 2 · Item 3: schema validation cho difficulty.config.json.
 *
 * Gate CI: JSON sai (thiếu key, sai type/range) → test đỏ. Đồng thời assert:
 *  - số mặc định của section `tuning` = hardcode cũ trong js/game.js
 *    (refactor thuần túy, hành vi không đổi — Item 6 mới tune số);
 *  - cấu trúc cũ (campaign / difficulties / endless) còn nguyên;
 *  - loader js/tuning.js fallback đúng khi fetch fail (offline/file://)
 *    và merge đúng khi fetch thành công.
 *
 * Chạy: node --test tests/config-schema.test.js
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

/* ---------- helpers ---------- */
function isNum(v) { return typeof v === "number" && Number.isFinite(v); }
function reqNum(obj, key, label) {
  assert.ok(obj && Object.prototype.hasOwnProperty.call(obj, key), `${label}: thiếu key "${key}"`);
  assert.ok(isNum(obj[key]), `${label}: "${key}" phải là number hữu hạn, nhận ${JSON.stringify(obj[key])}`);
  return obj[key];
}

/* ---------- 1. cấu trúc cũ còn nguyên ---------- */
describe("config: cấu trúc cũ không bị phá", () => {
  it("top-level keys cũ còn đủ", () => {
    for (const k of ["campaign", "difficulties", "endless", "version"]) {
      assert.ok(CFG[k] !== undefined, `thiếu top-level key "${k}"`);
    }
  });
  it("section tuning mới tồn tại, _note là tài liệu cho designer", () => {
    assert.ok(CFG.tuning && typeof CFG.tuning === "object", "thiếu section tuning");
    assert.ok(typeof CFG.tuning._note === "string" && CFG.tuning._note.length > 20,
      "tuning._note phải là chuỗi tài liệu cho designer");
  });
  it("difficulties 3 nấc còn nguyên", () => {
    for (const k of ["chill", "normal", "hardcore"]) {
      assert.ok(CFG.difficulties[k], `thiếu difficulties.${k}`);
    }
    assert.equal(CFG.difficulties.chill.monster_hp_mult, 0.55, "chill monster_hp_mult 0.55");
  });
  it("campaign/endless còn nguyên", () => {
    assert.equal(CFG.campaign.stages, 5, "campaign.stages 5");
    assert.ok(CFG.endless.waves["1"], "endless.waves['1'] còn");
  });
});

/* ---------- 2. tuning.spawn ---------- */
describe("config: tuning.spawn — schema", () => {
  const s = () => CFG.tuning.spawn;
  it("đủ 6 key, đúng type number", () => {
    for (const k of ["base_count", "per_wave", "interval_floor_s", "interval_base_s",
                     "interval_decay", "concurrent_cap"]) {
      reqNum(s(), k, "tuning.spawn");
    }
  });
  it("range hợp lệ", () => {
    assert.ok(s().base_count >= 0, "base_count >= 0");
    assert.ok(s().per_wave >= 0, "per_wave >= 0");
    assert.ok(s().interval_floor_s > 0, "interval_floor_s > 0");
    assert.ok(s().interval_base_s > 0, "interval_base_s > 0");
    assert.ok(s().interval_decay >= 0, "interval_decay >= 0");
    assert.ok(s().concurrent_cap > 0, "concurrent_cap > 0");
    assert.ok(s().interval_base_s > s().interval_floor_s,
      "interval_base_s phải lớn hơn interval_floor_s");
  });
  it("default = hardcode cũ trong js/game.js (hành vi không đổi)", () => {
    assert.equal(s().base_count, 4, "base_count 4  (= 4 + n*3 trong buildSpawnQueue)");
    assert.equal(s().per_wave, 3, "per_wave 3");
    assert.equal(s().interval_floor_s, 0.22, "interval_floor_s 0.22 (= max(0.22, ...) ở spawn tick)");
    assert.equal(s().interval_base_s, 0.85, "interval_base_s 0.85");
    assert.equal(s().interval_decay, 0.05, "interval_decay 0.05 (= wave*0.05)");
    assert.equal(s().concurrent_cap, 20, "concurrent_cap 20");
  });
});

/* ---------- 3. tuning.window_physics ---------- */
describe("config: tuning.window_physics — schema", () => {
  const wp = () => CFG.tuning.window_physics;
  const EXPECTED = {
    calm:   { impulse_max: 15,  cooldown_ms: 300, velocity_max: 150 },
    normal: { impulse_max: 35,  cooldown_ms: 150, velocity_max: 400 },
    wild:   { impulse_max: 950, cooldown_ms: 0,   velocity_max: 950 },
  };
  it("đủ 3 preset calm/normal/wild", () => {
    for (const k of Object.keys(EXPECTED)) {
      assert.ok(wp()[k] && typeof wp()[k] === "object", `thiếu preset "${k}"`);
    }
  });
  it("mỗi preset đủ 3 key, đúng type/range", () => {
    for (const k of Object.keys(EXPECTED)) {
      const p = wp()[k];
      for (const f of ["impulse_max", "cooldown_ms", "velocity_max"]) {
        reqNum(p, f, `tuning.window_physics.${k}`);
        assert.ok(p[f] >= 0, `${k}.${f} >= 0`);
      }
    }
  });
  it("số liệu đúng spec (wild = hiện tại)", () => {
    for (const k of Object.keys(EXPECTED)) {
      assert.deepEqual(
        { impulse_max: wp()[k].impulse_max, cooldown_ms: wp()[k].cooldown_ms, velocity_max: wp()[k].velocity_max },
        EXPECTED[k],
        `preset ${k} sai số`
      );
    }
  });
});

/* ---------- 4. tuning.difficulty_bands ---------- */
describe("config: tuning.difficulty_bands — schema (hook cho Item 6)", () => {
  const bands = () => CFG.tuning.difficulty_bands;
  it("có ít nhất 1 band wave 15–30", () => {
    const keys = Object.keys(bands()).filter((k) => k.charAt(0) !== "_");
    assert.ok(keys.length >= 1, "phải có ít nhất 1 band");
    const b = bands()[keys[0]];
    assert.ok(Array.isArray(b.waves) && b.waves.length === 2, "band.waves phải là [from, to]");
    assert.ok(Number.isInteger(b.waves[0]) && Number.isInteger(b.waves[1]), "waves phải là số nguyên");
    assert.ok(b.waves[0] >= 1 && b.waves[0] <= b.waves[1], "waves: 1 <= from <= to");
  });
  it("band keys đúng type (cap cho phép null)", () => {
    for (const k of Object.keys(bands()).filter((x) => x.charAt(0) !== "_")) {
      const b = bands()[k];
      reqNum(b, "spawn_interval_s_floor", `difficulty_bands.${k}`);
      assert.ok(b.spawn_interval_s_floor > 0, "spawn_interval_s_floor > 0");
      for (const c of ["hp_mult_cap", "speed_mult_cap"]) {
        assert.ok(Object.prototype.hasOwnProperty.call(b, c), `thiếu key "${c}"`);
        const v = b[c];
        assert.ok(v === null || isNum(v), `"${c}" phải là null hoặc number, nhận ${JSON.stringify(v)}`);
        if (isNum(v)) assert.ok(v > 0, `"${c}" > 0 khi là số`);
      }
    }
  });
  it("default band chưa đổi hành vi (floor = global, caps null)", () => {
    const b = bands().late_game_15_30;
    assert.ok(b, "thiếu band late_game_15_30");
    assert.deepEqual(b.waves, [15, 30], "band cover wave 15–30");
    assert.equal(b.spawn_interval_s_floor, CFG.tuning.spawn.interval_floor_s,
      "band floor mặc định = spawn.interval_floor_s");
    assert.equal(b.hp_mult_cap, null, "hp_mult_cap null = không trần");
    assert.equal(b.speed_mult_cap, null, "speed_mult_cap null = không trần");
  });
});

/* ---------- 5. loader js/tuning.js ---------- */
function bootTuning(fetchStub) {
  const sandbox = {
    console, JSON, Object, Array, Math, String, Number, Boolean, Date,
    parseInt, parseFloat, isNaN, isFinite,
    Promise, setTimeout: () => 0, clearTimeout: () => {},
    fetch: fetchStub,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(read("js/tuning.js"), sandbox, { filename: "js/tuning.js" });
  return sandbox;
}
/* Object từ vm context khác realm → prototype khác, deepStrictEqual luôn fail.
   Chuẩn hoá qua JSON trước khi so sánh. */
function norm(v) { return JSON.parse(JSON.stringify(v)); }

describe("loader js/tuning.js — fallback khi fetch fail (offline/file://)", () => {
  it("game vẫn có số legacy khi không load được JSON", async () => {
    const sb = bootTuning(() => Promise.reject(new Error("offline")));
    await sb.WK_TUNING.ready;
    assert.equal(sb.WK_TUNING.source, "embedded", "source phải là embedded khi fetch fail");
    const s = sb.WK_TUNING.spawn();
    assert.deepEqual(norm(s), {
      base_count: 4, per_wave: 3, interval_floor_s: 0.22,
      interval_base_s: 0.85, interval_decay: 0.05, concurrent_cap: 20,
    }, "spawn() fallback phải = hardcode cũ");
    const p = sb.WK_TUNING.physics("wild");
    assert.deepEqual(norm(p), { name: "wild", impulse_max: 950, cooldown_ms: 0, velocity_max: 950 });
  });
  it("preset expose alias impulse/velocity/cooldown cho reader Item 4", async () => {
    const sb = bootTuning(() => Promise.reject(new Error("offline")));
    await sb.WK_TUNING.ready;
    const twp = sb.WK_TUNING.tuning.window_physics;
    for (const k of ["calm", "normal", "wild"]) {
      assert.ok(twp[k], `thiếu preset ${k}`);
      assert.equal(twp[k].impulse, twp[k].impulse_max, `${k}.impulse alias`);
      assert.equal(twp[k].velocity, twp[k].velocity_max, `${k}.velocity alias`);
      assert.equal(twp[k].cooldown, twp[k].cooldown_ms, `${k}.cooldown alias`);
    }
    assert.deepEqual(
      norm({ impulse: twp.normal.impulse, velocity: twp.normal.velocity, cooldown: twp.normal.cooldown }),
      { impulse: 35, velocity: 400, cooldown: 150 },
      "alias normal khớp fallback của Item 4"
    );
  });
  it("band helpers giữ nguyên hành vi khi caps null", async () => {
    const sb = bootTuning(() => Promise.reject(new Error("offline")));
    await sb.WK_TUNING.ready;
    assert.equal(sb.WK_TUNING.spawnIntervalFloor(20), 0.22, "floor wave 20 = 0.22");
    assert.equal(sb.WK_TUNING.spawnIntervalFloor(5), 0.22, "floor wave 5 = 0.22");
    assert.equal(sb.WK_TUNING.capMult(20, "hp", 3.7), 3.7, "cap null → giữ nguyên");
    assert.equal(sb.WK_TUNING.capMult(20, "speed", 1.9), 1.9, "cap null → giữ nguyên");
    assert.ok(sb.WK_TUNING.bandForWave(20), "wave 20 thuộc band late_game_15_30");
    assert.equal(sb.WK_TUNING.bandForWave(5), null, "wave 5 không thuộc band nào");
  });
});

describe("loader js/tuning.js — merge khi fetch thành công", () => {
  it("số trong JSON ghi đè embed (deep merge)", async () => {
    const sb = bootTuning(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        tuning: {
          spawn: { base_count: 9 },
          window_physics: { normal: { impulse_max: 42 } },
          difficulty_bands: {
            late_game_15_30: { spawn_interval_s_floor: 0.5, hp_mult_cap: 2.5 }
          }
        }
      }),
    }));
    await sb.WK_TUNING.ready;
    assert.equal(sb.WK_TUNING.source, "file", "source phải là file khi fetch ok");
    assert.equal(sb.WK_TUNING.spawn().base_count, 9, "base_count merge từ file");
    assert.equal(sb.WK_TUNING.spawn().per_wave, 3, "per_wave giữ embed (deep merge)");
    const p = sb.WK_TUNING.physics("normal");
    assert.equal(p.impulse_max, 42, "impulse_max merge từ file");
    assert.equal(p.velocity_max, 400, "velocity_max giữ embed");
    assert.equal(sb.WK_TUNING.tuning.window_physics.normal.impulse, 42, "alias impulse theo kịp merge");
    assert.equal(sb.WK_TUNING.spawnIntervalFloor(20), 0.5, "band floor từ file");
    assert.equal(sb.WK_TUNING.capMult(25, "hp", 9.9), 2.5, "hp cap từ file");
    assert.equal(sb.WK_TUNING.capMult(25, "hp", 1.1), 1.1, "dưới cap → giữ nguyên");
  });
  it("JSON thiếu section tuning → giữ embed", async () => {
    const sb = bootTuning(() => Promise.resolve({
      ok: true, json: () => Promise.resolve({ difficulties: {} }),
    }));
    await sb.WK_TUNING.ready;
    assert.equal(sb.WK_TUNING.source, "embedded", "thiếu tuning → giữ embed");
    assert.equal(sb.WK_TUNING.spawn().base_count, 4);
  });
});

/* ---------- 6. game.js đọc config (phân tích tĩnh) ---------- */
describe("game.js — hardcode đã thay bằng giá trị config", () => {
  const src = read("js/game.js");
  it("buildSpawnQueue dùng base_count/per_wave từ config", () => {
    assert.ok(!/\(\s*4\s*\+\s*n\s*\*\s*3\s*\)/.test(src),
      "không còn hardcode (4 + n*3) trong buildSpawnQueue");
    assert.match(src, /TS\.base_count\s*\+\s*n\s*\*\s*TS\.per_wave/,
      "buildSpawnQueue dùng TS.base_count + n * TS.per_wave");
  });
  it("spawn tick dùng interval config + band floor", () => {
    assert.ok(!/Math\.max\(\s*0\.22\s*,\s*0\.85/.test(src),
      "không còn hardcode Math.max(0.22, 0.85*...) ở spawn tick");
    // Item 6: spawn tick gọi wkSpawnInterval(G.wave) — công thức band
    // max(1.1s, 3.8s × 0.93^w) cho wave 15–30 (data), công thức cũ ngoài band
    assert.match(src, /G\.spawnT = wkSpawnInterval\(G\.wave\)/,
      "spawn tick dùng wkSpawnInterval(G.wave)");
    assert.match(src, /function wkSpawnInterval\(wave\)/,
      "helper wkSpawnInterval tồn tại");
    assert.match(src, /TS\.interval_base_s[\s\S]*TS\.interval_decay/,
      "nhánh fallback ngoài band vẫn dùng TS.interval_base_s / TS.interval_decay");
  });
  it("spawn tick có concurrent cap (pacing mềm, không drop queue)", () => {
    assert.match(src, /concurrent_cap/, "spawn tick đọc concurrent_cap");
    const capBlock = src.match(/G\.enemies\.length >= TS\.concurrent_cap\) \{([\s\S]*?)\n      \} else/);
    assert.ok(capBlock, "nhánh concurrent cap tồn tại");
    assert.match(capBlock[1], /G\.spawnT = 0\.25/, "nhánh cap chỉ hoãn spawn (retry 0.25s)");
    assert.ok(!/\.pop\(\)/.test(capBlock[1]), "nhánh cap KHÔNG pop/drop quái khỏi queue");
  });
  it("mkEnemy áp band caps (null = giữ nguyên)", () => {
    assert.match(src, /wkCapMult\(G\.wave,\s*"hp"/, "hp qua wkCapMult");
    assert.match(src, /wkCapMult\(G\.wave,\s*"speed"/, "speed qua wkCapMult");
  });
  it("không còn MAX velocity 950 hardcode trong pushWindow", () => {
    assert.ok(!/const sp = hypot\(wvx, wvy\), MAX = 950;/.test(src),
      "pushWindow không còn hardcode MAX = 950 (Item 4 đọc preset từ WK_TUNING)");
  });
});
