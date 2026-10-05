/* WINDOWKILL — stage ritual tests (Item 2: nghi thức vào ải + story quét virus + boss taunt).
 * "Chữa ải vô dụng": mỗi ải campaign (1-5) có bản sắc cảm nhận được ngay khi vào —
 * wave 1 → banner tên ải + 1 câu luật gắn mechanic + 1 câu story; boss ải xuất hiện
 * → 1 câu taunt của boss. Triết lý CEO: VUI, không tăng khó, không rối mắt —
 * tất cả chỉ là text (banner/float), không asset âm thanh mới, không đổi stat.
 * Chạy: node --test tests/stage-ritual.test.js
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const i18nSrc = fs.readFileSync(path.join(ROOT, "js", "i18n.js"), "utf8");
const campaignSrc = fs.readFileSync(path.join(ROOT, "js", "campaign.js"), "utf8");
const v2glueSrc = fs.readFileSync(path.join(ROOT, "js", "v2glue.js"), "utf8");
const gameSrc = fs.readFileSync(path.join(ROOT, "js", "game.js"), "utf8");

/* ---- load i18n dict thật ---- */
function loadDict() {
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
  return { vi: sb.window.I18N._dict.vi, en: sb.window.I18N._dict.en };
}

/* ---- load campaign.js ---- */
function loadCampaign() {
  const store = {};
  const sb = {
    localStorage: {
      getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    },
    location: { search: "" },
    console,
  };
  sb.window = sb;
  sb.window.location = sb.location;
  vm.createContext(sb);
  vm.runInContext(campaignSrc, sb, { filename: "js/campaign.js" });
  return sb.window.Campaign;
}

/* ---- load v2glue.js với stub Campaign/Bosses/G ---- */
function loadV2() {
  const calls = { banner: [], tauntCalls: 0, ritualCalls: 0 };
  const floats = [];
  const sb = {
    location: { search: "" },
    console,
    Campaign: {
      getRunParams: () => null,
      getStageMechanic: () => null,
      getBossTaunt: (id) => { calls.tauntCalls++; return "TAUNT-" + id; },
      getStageRitual: (id) => {
        calls.ritualCalls++;
        return { stageId: id, title: "TITLE-" + id, rule: "RULE-" + id, story: "STORY-" + id };
      },
    },
    Bosses: {
      setHooks() {},
      startBoss: (stageId) => ({ x: 400, y: 200, id: "boss_" + stageId }),
    },
  };
  sb.window = sb;
  sb.G = { floats, ship: { x: 100, y: 200 } };
  sb.WKSetBanner = (t, s) => calls.banner.push([t, s]);
  vm.createContext(sb);
  vm.runInContext(v2glueSrc, sb, { filename: "js/v2glue.js" });
  return { V2: sb.window.V2, calls, floats };
}

const dict = loadDict();
const Campaign = loadCampaign();

describe("stage-ritual — i18n coverage (Item 2)", () => {
  const KEYS = ["ritual_rule", "ritual_story", "boss_taunt"];
  for (const lang of ["vi", "en"]) {
    it(`R1: đủ key campaign.ritual_rule_N / ritual_story_N / boss_taunt_N (N=1..5) — ${lang}`, () => {
      for (let n = 1; n <= 5; n++) {
        for (const k of KEYS) {
          const key = `campaign.${k}_${n}`;
          const v = dict[lang][key];
          assert.ok(typeof v === "string" && v.length > 0, `${lang}: thiếu key "${key}"`);
          assert.ok(!v.startsWith("campaign."), `${lang}: key "${key}" bị lộ raw key`);
          assert.ok(v.length >= 8, `${lang}: "${key}" quá ngắn, coi chừng placeholder`);
        }
      }
    });
  }
  it("R1b: VI và EN khác nhau (không copy-paste quên dịch)", () => {
    for (let n = 1; n <= 5; n++) {
      assert.notEqual(dict.vi[`campaign.ritual_rule_${n}`], dict.en[`campaign.ritual_rule_${n}`]);
      assert.notEqual(dict.vi[`campaign.ritual_story_${n}`], dict.en[`campaign.ritual_story_${n}`]);
      assert.notEqual(dict.vi[`campaign.boss_taunt_${n}`], dict.en[`campaign.boss_taunt_${n}`]);
    }
  });
});

describe("stage-ritual — Campaign.getStageRitual / getBossTaunt", () => {
  it("R2: getStageRitual(1..5) → {title, rule, story} đầy đủ, không lộ raw key", () => {
    for (let n = 1; n <= 5; n++) {
      const r = Campaign.getStageRitual(n);
      assert.ok(r, `ải ${n}: getStageRitual trả null`);
      assert.equal(r.stageId, n);
      assert.ok(r.title && r.title.length > 0, `ải ${n}: thiếu title`);
      assert.ok(r.rule && r.rule.length > 0, `ải ${n}: thiếu rule`);
      assert.ok(r.story && r.story.length > 0, `ải ${n}: thiếu story`);
      for (const f of ["title", "rule", "story"]) {
        assert.ok(!String(r[f]).startsWith("campaign."), `ải ${n}: ${f} bị lộ raw key`);
      }
    }
  });
  it("R2b: getStageRitual(0/6/99) → null (không crash ải lạ)", () => {
    assert.equal(Campaign.getStageRitual(0), null);
    assert.equal(Campaign.getStageRitual(6), null);
    assert.equal(Campaign.getStageRitual(99), null);
  });
  it("R2c: getBossTaunt(1..5) → string taunt; 0/6 → null", () => {
    for (let n = 1; n <= 5; n++) {
      const t = Campaign.getBossTaunt(n);
      assert.ok(typeof t === "string" && t.length >= 8, `ải ${n}: taunt rỗng/ngắn`);
      assert.ok(!t.startsWith("campaign."), `ải ${n}: taunt lộ raw key`);
    }
    assert.equal(Campaign.getBossTaunt(0), null);
    assert.equal(Campaign.getBossTaunt(6), null);
  });
  it("R2d: rule gắn đúng mechanic từng ải (không nhầm câu)", () => {
    // ải 2 = viền gai → rule phải nhắc "gai"; ải 3 = trơn → "trơn/băng";
    // ải 4 = mất điện → "mắt đỏ"; ải 5 = thu hẹp → "patch xanh/nới sân"
    const r2 = Campaign.getStageRitual(2).rule.toLowerCase();
    const r3 = Campaign.getStageRitual(3).rule.toLowerCase();
    const r4 = Campaign.getStageRitual(4).rule.toLowerCase();
    const r5 = Campaign.getStageRitual(5).rule.toLowerCase();
    assert.ok(r2.includes("gai"), `ải 2 rule phải nhắc gai, được: "${r2}"`);
    assert.ok(r3.includes("trơn") || r3.includes("băng"), `ải 3 rule phải nhắc trơn/băng, được: "${r3}"`);
    assert.ok(r4.includes("mắt đỏ"), `ải 4 rule phải nhắc mắt đỏ, được: "${r4}"`);
    assert.ok(r5.includes("patch xanh") || r5.includes("nới"), `ải 5 rule phải nhắc patch/nới sân, được: "${r5}"`);
  });
});

describe("stage-ritual — trigger đúng wave 1 (Item 2)", () => {
  it("R3: wave 1 mỗi ải → ritual (banner title+rule, story float), đúng 1 lần", () => {
    for (let stageId = 1; stageId <= 5; stageId++) {
      const { V2, calls, floats } = loadV2();
      V2.stageId = stageId;
      V2.stageDone = false;
      const ok = V2.stageRitualEnter(1);
      assert.equal(ok, true, `ải ${stageId} wave 1 phải trigger ritual`);
      assert.equal(calls.ritualCalls, 1, `ải ${stageId}: getStageRitual phải gọi đúng 1 lần`);
      assert.equal(calls.banner.length, 1, `ải ${stageId}: banner phải gọi đúng 1 lần`);
      assert.deepEqual(calls.banner[0], [`TITLE-${stageId}`, `RULE-${stageId}`],
        `ải ${stageId}: banner phải là (title, rule)`);
      assert.equal(floats.length, 1, `ải ${stageId}: story float phải đúng 1 cái`);
      assert.equal(floats[0].text, `STORY-${stageId}`, `ải ${stageId}: story float sai text`);
    }
  });
  it("R3b: wave 2..10 KHÔNG trigger ritual", () => {
    const { V2, calls, floats } = loadV2();
    V2.stageId = 2;
    V2.stageDone = false;
    for (const n of [2, 3, 5, 9, 10]) {
      assert.equal(V2.stageRitualEnter(n), false, `wave ${n} không được trigger ritual`);
    }
    assert.equal(calls.ritualCalls, 0, "wave khác 1 không được gọi getStageRitual");
    assert.equal(calls.banner.length, 0, "wave khác 1 không được gọi banner");
    assert.equal(floats.length, 0, "wave khác 1 không được push float");
  });
  it("R3c: stageDone=true (sau boss, chạy endless) KHÔNG trigger ritual", () => {
    const { V2, calls, floats } = loadV2();
    V2.stageId = 3;
    V2.stageDone = true;
    assert.equal(V2.stageRitualEnter(1), false);
    assert.equal(calls.banner.length, 0);
    assert.equal(floats.length, 0);
  });
  it("R3d: stageId=0 (endless cũ) KHÔNG trigger ritual", () => {
    const { V2, calls } = loadV2();
    V2.stageId = 0;
    assert.equal(V2.stageRitualEnter(1), false);
    assert.equal(calls.banner.length, 0);
  });
  it("R3e: game.js startWave gọi V2.stageRitualEnter(n) trong nhánh campaign", () => {
    const sw = gameSrc.indexOf("function startWave");
    assert.ok(sw !== -1, "không tìm thấy function startWave trong js/game.js");
    const region = gameSrc.slice(sw, sw + 2500);
    assert.ok(region.includes("stageRitualEnter(n)"),
      "startWave phải gọi V2.stageRitualEnter(n) để kích hoạt nghi thức wave 1");
    assert.ok(region.includes("ritualDone"),
      "startWave phải skip banner wave mặc định khi ritual đã hiện");
  });
});

describe("stage-ritual — boss taunt (Item 2)", () => {
  it("R4: mỗi lần boss spawn → taunt gọi ĐÚNG 1 lần, float text đúng 1 cái", () => {
    const { V2, calls, floats } = loadV2();
    V2.stageId = 4;
    assert.equal(V2.startStageBoss(10), true, "startStageBoss phải trả true");
    assert.equal(calls.tauntCalls, 1, "spawn 1: getBossTaunt phải gọi đúng 1 lần");
    assert.equal(floats.length, 1, "spawn 1: phải push đúng 1 float taunt");
    assert.equal(floats[0].text, "TAUNT-4", "float taunt sai text");
    assert.equal(floats[0].big, true, "taunt nên là float lớn (big=true)");
    // spawn lần 2 (boss khác / restart) → lại đúng 1 lần, không stack
    assert.equal(V2.startStageBoss(10), true);
    assert.equal(calls.tauntCalls, 2, "spawn 2: getBossTaunt phải gọi thêm đúng 1 lần");
    assert.equal(floats.length, 2, "spawn 2: phải push thêm đúng 1 float taunt");
  });
  it("R4b: taunt không chặn boss spawn khi Campaign thiếu (fail-safe)", () => {
    const sb = {
      location: { search: "" },
      console,
      Bosses: { setHooks() {}, startBoss: () => ({ x: 1, y: 1 }) },
    };
    sb.window = sb;
    sb.G = { floats: [], ship: { x: 0, y: 0 } };
    vm.createContext(sb);
    vm.runInContext(v2glueSrc, sb, { filename: "js/v2glue.js" });
    const V2 = sb.window.V2;
    V2.stageId = 1;
    assert.equal(V2.startStageBoss(10), true, "thiếu Campaign vẫn phải spawn boss bình thường");
    assert.equal(sb.G.floats.length, 0, "thiếu Campaign thì không push float");
  });
});
