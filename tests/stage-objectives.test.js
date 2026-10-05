/* WINDOWKILL — stage objectives + badges tests (node:test).
 * SYSTEM TEST: Stage Identity item 3 — objective phụ theo ải (1-5) gắn với
 * mechanic từng ải; hoàn thành → banner + huy hiệu per profile.
 * Chạy: node --test tests/stage-objectives.test.js
 */
"use strict";

const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const CAMPAIGN_SRC = fs.readFileSync(path.join(ROOT, "js/campaign.js"), "utf8");
const STAGEOBJ_SRC = fs.readFileSync(path.join(ROOT, "js/stageobj.js"), "utf8");

const EXPECTED = {
  1: { target: 30, icon: "i-gem" },
  2: { target: 8, icon: "i-fire" },
  3: { target: 5, icon: "i-snow" },
  4: { target: 12, icon: "i-ghost" },
  5: { target: 5, icon: "i-shield" },
};

function makeWorld(seedStore) {
  const store = seedStore || {};
  const registered = { vi: {}, en: {} };
  const calls = { banner: [], float: [], sfx: [] };
  const sandbox = {
    localStorage: {
      getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    },
    location: { search: "" },
    console,
    I18N: {
      register: (d) => { for (const l of ["vi", "en"]) Object.assign(registered[l], d[l] || {}); },
      t: (k) => registered.vi[k] || k,
    },
    G: { ship: { x: 100, y: 200 }, onSpikeKill: "unset" },
    StageFX: {
      _dark: false,
      isDark() { return this._dark; },
      activeId: null,
      modules: { slippery: { st: null } },
      growPatch() {},
    },
    setBanner: (title, sub) => { calls.banner.push([title, sub]); },
    addFloat: (x, y, txt) => { calls.float.push(txt); },
    AudioEngine: { sfx: { up: () => { calls.sfx.push("up"); } } },
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(CAMPAIGN_SRC, sandbox, { filename: "js/campaign.js" });
  vm.runInContext(STAGEOBJ_SRC, sandbox, { filename: "js/stageobj.js" });
  return {
    sandbox, store, registered, calls,
    Campaign: sandbox.window.Campaign,
    StageObj: sandbox.window.StageObj,
  };
}

describe("stageobj.js — định nghĩa objective", () => {
  let w;
  beforeEach(() => { w = makeWorld(); });

  it("S1: đủ 5 objective, icon + target đúng thiết kế", () => {
    for (const [id, exp] of Object.entries(EXPECTED)) {
      const def = w.StageObj.def(Number(id));
      assert.ok(def, `ải ${id} phải có def`);
      assert.equal(def.target, exp.target, `ải ${id} target`);
      assert.equal(def.icon, exp.icon, `ải ${id} icon`);
    }
    assert.equal(w.StageObj.def(0), null, "stage 0 (endless) không có objective");
    assert.equal(w.StageObj.def(6), null, "stage 6 không tồn tại");
  });

  it("S2: i18n VI+EN đầy đủ cho tên/mô tả/tên ngắn + banner", () => {
    const keys = ["done_banner", "done_float"];
    for (let id = 1; id <= 5; id++) keys.push(`${id}.name`, `${id}.desc`, `${id}.short`);
    for (const k of keys) {
      const full = `stageobj.${k}`;
      assert.ok(w.registered.vi[full], `thiếu VI: ${full}`);
      assert.ok(w.registered.en[full], `thiếu EN: ${full}`);
    }
    // không key nào chỉ có EN mà thiếu VI
    const onlyEn = Object.keys(w.registered.en).filter((k) => !w.registered.vi[k]);
    assert.deepEqual(onlyEn, []);
  });
});

describe("stageobj.js — trigger đúng điều kiện", () => {
  let w;
  beforeEach(() => { w = makeWorld(); });

  it("S3: ải 1 — nhặt đủ 30 gem → hoàn thành + banner + badge", () => {
    w.StageObj.begin(1);
    for (let i = 0; i < 29; i++) { w.StageObj.onGem(); assert.equal(w.StageObj.state().done, false); }
    w.StageObj.onGem();
    const st = w.StageObj.state();
    assert.equal(st.done, true);
    assert.equal(st.progress, 30);
    assert.equal(w.calls.banner.length, 1, "banner báo đúng 1 lần");
    assert.equal(w.calls.banner[0][0], "HOÀN THÀNH OBJECTIVE!");
    assert.ok(w.calls.banner[0][1].length > 0, "banner sub có tên objective");
    assert.equal(w.Campaign.hasStageBadge(null, 1), true, "badge ải 1 đã lưu");
  });

  it("S4: ải 2 — hook G.onSpikeKill được cắm; 8 kill gai → xong", () => {
    w.StageObj.begin(2);
    assert.equal(typeof w.sandbox.G.onSpikeKill, "function", "hook gai được cắm ở ải 2");
    for (let i = 0; i < 7; i++) { w.sandbox.G.onSpikeKill(); assert.equal(w.StageObj.state().done, false); }
    w.sandbox.G.onSpikeKill();
    assert.equal(w.StageObj.state().done, true);
    assert.equal(w.Campaign.hasStageBadge(null, 2), true);
  });

  it("S5: ải 2 — ải khác không cắm hook gai", () => {
    w.StageObj.begin(1);
    assert.equal(w.sandbox.G.onSpikeKill, null, "ải 1 phải gỡ hook gai");
    w.StageObj.begin(0);
    assert.equal(w.sandbox.G.onSpikeKill, null, "endless phải gỡ hook gai");
  });

  it("S6: ải 3 — chuỗi 5 drift-kill (trôi, thả phím ≥0.5s) → xong", () => {
    w.StageObj.begin(3);
    w.sandbox.StageFX.modules.slippery.st = { ivx: 100, ivy: 0 }; // đang trôi 100px/s
    for (let i = 0; i < 4; i++) {
      w.StageObj.update(0.6, false); // thả phím 0.6s
      w.StageObj.onKill();
      assert.equal(w.StageObj.state().done, false, `chưa xong ở chain ${i + 1}`);
    }
    assert.equal(w.StageObj.state().chain, 4);
    w.StageObj.update(0.6, false);
    w.StageObj.onKill();
    assert.equal(w.StageObj.state().done, true, "chain ×5 → hoàn thành");
    assert.equal(w.Campaign.hasStageBadge(null, 3), true);
  });

  it("S7: ải 3 — kill lúc đang bấm phím / đứng yên KHÔNG tính drift", () => {
    w.StageObj.begin(3);
    w.sandbox.StageFX.modules.slippery.st = { ivx: 100, ivy: 0 };
    w.StageObj.update(0.6, true); // đang bấm phím → idleT reset
    w.StageObj.onKill();
    assert.equal(w.StageObj.state().chain, 0, "có input thì không phải drift-kill");
    w.sandbox.StageFX.modules.slippery.st = { ivx: 10, ivy: 0 }; // trôi quá chậm
    w.StageObj.update(1.0, false);
    w.StageObj.onKill();
    assert.equal(w.StageObj.state().chain, 0, "tốc độ < 60px/s thì không phải drift");
    assert.equal(w.StageObj.state().done, false);
  });

  it("S8: ải 3 — chuỗi hết hạn sau 4s không có drift-kill", () => {
    w.StageObj.begin(3);
    w.sandbox.StageFX.modules.slippery.st = { ivx: 100, ivy: 0 };
    w.StageObj.update(0.6, false); w.StageObj.onKill();
    w.StageObj.update(0.6, false); w.StageObj.onKill();
    assert.equal(w.StageObj.state().chain, 2);
    w.StageObj.update(5.0, false); // quá CHAIN_WINDOW_S
    assert.equal(w.StageObj.state().chain, 0, "chuỗi reset khi hết hạn");
    assert.equal(w.StageObj.state().done, false);
  });

  it("S9: ải 4 — 12 kill trong bóng tối → xong; kill lúc sáng không tính", () => {
    w.StageObj.begin(4);
    w.sandbox.StageFX._dark = false;
    for (let i = 0; i < 20; i++) w.StageObj.onKill();
    assert.equal(w.StageObj.state().progress, 0, "lúc sáng không đếm");
    w.sandbox.StageFX._dark = true;
    for (let i = 0; i < 11; i++) { w.StageObj.onKill(); assert.equal(w.StageObj.state().done, false); }
    w.StageObj.onKill();
    assert.equal(w.StageObj.state().done, true);
    assert.equal(w.Campaign.hasStageBadge(null, 4), true);
  });

  it("S10: ải 5 — nhặt 5 patch → xong; pickup khác không tính", () => {
    w.StageObj.begin(5);
    w.StageObj.onPickup("heart");
    w.StageObj.onPickup("shield");
    assert.equal(w.StageObj.state().progress, 0, "heart/shield không đếm");
    for (let i = 0; i < 4; i++) { w.StageObj.onPickup("patch"); assert.equal(w.StageObj.state().done, false); }
    w.StageObj.onPickup("patch");
    assert.equal(w.StageObj.state().done, true);
    assert.equal(w.Campaign.hasStageBadge(null, 5), true);
  });
});

describe("stageobj.js — không trigger sai + reset + idempotent", () => {
  let w;
  beforeEach(() => { w = makeWorld(); });

  it("S11: event ải khác không lọt sang objective hiện tại", () => {
    w.StageObj.begin(1);
    w.sandbox.StageFX._dark = true;
    for (let i = 0; i < 50; i++) w.StageObj.onKill(); // dark-kill của ải 4
    w.StageObj.onPickup("patch"); // của ải 5
    w.sandbox.G.onSpikeKill = null;
    const st = w.StageObj.state();
    assert.equal(st.progress, 0, "ải 1 chỉ đếm gem");
    assert.equal(st.done, false);
  });

  it("S12: reset khi begin run mới", () => {
    w.StageObj.begin(1);
    for (let i = 0; i < 10; i++) w.StageObj.onGem();
    assert.equal(w.StageObj.state().progress, 10);
    w.StageObj.begin(1);
    const st = w.StageObj.state();
    assert.equal(st.progress, 0);
    assert.equal(st.done, false);
    assert.equal(st.chain, 0);
  });

  it("S13: begin(0)/endless → inactive, event không đếm", () => {
    w.StageObj.begin(0);
    assert.equal(w.StageObj.state().stageId, 0);
    for (let i = 0; i < 100; i++) w.StageObj.onGem();
    w.StageObj.onPickup("patch");
    assert.equal(w.StageObj.state().done, false);
    assert.equal(w.calls.banner.length, 0, "endless không báo objective");
  });

  it("S14: hoàn thành rồi thì event thêm không báo lại", () => {
    w.StageObj.begin(1);
    for (let i = 0; i < 30; i++) w.StageObj.onGem();
    assert.equal(w.calls.banner.length, 1);
    for (let i = 0; i < 30; i++) w.StageObj.onGem();
    assert.equal(w.calls.banner.length, 1, "không banner lần 2");
    assert.equal(w.Campaign.hasStageBadge(null, 1), true);
  });

  it("S15: đổi ải giữa chừng → state theo ải mới", () => {
    w.StageObj.begin(1);
    for (let i = 0; i < 10; i++) w.StageObj.onGem();
    w.StageObj.begin(4);
    const st = w.StageObj.state();
    assert.equal(st.stageId, 4);
    assert.equal(st.progress, 0, "tiến trình ải cũ không mang sang");
  });
});

describe("campaign.js — persistence huy hiệu per profile", () => {
  let w;
  beforeEach(() => { w = makeWorld(); });

  it("S16: set/has/get per profile độc lập", () => {
    assert.equal(w.Campaign.setStageBadge("p1", 1), true);
    assert.equal(w.Campaign.hasStageBadge("p1", 1), true);
    assert.equal(w.Campaign.hasStageBadge("p2", 1), false, "profile khác không thấy badge");
    // NOTE: deepEqual cross-realm (vm) so sánh prototype → dùng JSON thay thế
    assert.equal(JSON.stringify(w.Campaign.getStageBadges("p2")), "{}");
    assert.equal(JSON.stringify(w.Campaign.getStageBadges("p1")), JSON.stringify({ 1: 1 }));
    w.Campaign.setStageBadge("p2", 3);
    assert.equal(w.Campaign.hasStageBadge("p2", 3), true);
    assert.equal(w.Campaign.hasStageBadge("p1", 3), false);
  });

  it("S17: stageId không hợp lệ bị từ chối", () => {
    assert.equal(w.Campaign.setStageBadge("p1", 0), false);
    assert.equal(w.Campaign.setStageBadge("p1", 6), false);
    assert.equal(w.Campaign.hasStageBadge("p1", 6), false);
  });

  it("S18: badge tồn tại qua 'reload' (đọc lại từ localStorage)", () => {
    w.Campaign.setStageBadge("p1", 2);
    const w2 = makeWorld(w.store); // cùng store = cùng localStorage
    assert.equal(w2.Campaign.hasStageBadge("p1", 2), true, "reload vẫn thấy badge");
    assert.equal(w2.Campaign.hasStageBadge("p1", 1), false);
  });

  it("S19: badge không lẫn với stage best", () => {
    w.Campaign.setStageBest("p1", 1, { score: 999, wave: 10 });
    assert.equal(w.Campaign.hasStageBadge("p1", 1), false, "best score không tạo badge");
    assert.ok(w.store["wk_stage_badges_p1"] !== w.store["wk_stage_best_p1"], "key lưu trữ riêng");
  });
});
