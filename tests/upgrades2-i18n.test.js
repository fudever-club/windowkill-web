/* WINDOWKILL — fix/audit-batch-1, P2: upgrades2 không có tiếng Anh (gate N4).
 *
 * Trước fix: js/upgrades2.js chỉ có nameVi/descVi; game.js openDraft đọc trực tiếp
 * → chế độ EN vẫn hiện card tiếng Việt. Fix: dict "upg2.<id>.name|desc" (+tag) trong
 * js/i18n.js (VI+EN) + helper Upgrades2.dname/ddesc/dtag() + openDraft đi qua helper.
 *
 * Chạy: node --test tests/upgrades2-i18n.test.js
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const IDS = ["gai_phan", "neo_quan_tinh", "mat_cu", "dan_no", "dan_xich", "keo_tu_va"];
const EN = {
  "upg2.gai_phan.name": "Thorn Rebound",
  "upg2.gai_phan.desc": "Touching the border: deal 3 damage to every monster within 120px.",
  "upg2.neo_quan_tinh.name": "Inertia Anchor",
  "upg2.neo_quan_tinh.desc": "Press Shift: stop sliding instantly. 8s cooldown.",
  "upg2.mat_cu.name": "Owl Eyes",
  "upg2.mat_cu.desc": "During blackouts: reveal a faint outline of every monster within 200px of the ship.",
  "upg2.dan_no.name": "Boom Rounds",
  "upg2.dan_no.desc": "Bullets explode (r60), dealing 1 damage — clears eggs and mini swarms.",
  "upg2.dan_xich.name": "Chain Rounds",
  "upg2.dan_xich.desc": "Bullets that hit a monster bounce to the nearest monster within 150px at 50% damage.",
  "upg2.keo_tu_va.name": "Self-Seal Glue",
  "upg2.keo_tu_va.desc": "Every 20s auto-patches +10px of window.",
  "upg2.tag.stage2": "Stage 2 exclusive",
  "upg2.tag.stage3": "Stage 3 exclusive",
  "upg2.tag.stage4": "Stage 4 exclusive",
};

/* Nạp i18n.js thật trong vm để đọc dict VI/EN (pattern tests/i18n-coverage.test.js). */
function loadDict() {
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
  vm.createContext(sandbox);
  vm.runInContext(read("js/i18n.js"), sandbox, { filename: "js/i18n.js" });
  return { vi: sandbox.window.I18N._dict.vi, en: sandbox.window.I18N._dict.en };
}

describe("P2 i18n v2 — dict upg2.* có đủ VI + EN", () => {
  const dict = loadDict();
  for (const lang of ["vi", "en"]) {
    it(`dict ${lang}: đủ name/desc cho 6 nâng cấp v2`, () => {
      const missing = [];
      for (const id of IDS) {
        for (const f of ["name", "desc"]) {
          const k = `upg2.${id}.${f}`;
          if (!dict[lang][k]) missing.push(k);
        }
      }
      assert.deepEqual(missing, [], `thiếu key: ${missing.join(", ")}`);
    });
    it(`dict ${lang}: đủ tag độc quyền ải 2/3/4`, () => {
      for (const s of [2, 3, 4]) assert.ok(dict[lang][`upg2.tag.stage${s}`], `thiếu upg2.tag.stage${s}`);
    });
  }
  it("EN khớp bản dịch chốt (chống hồi quy dịch sai)", () => {
    for (const [k, v] of Object.entries(EN)) assert.equal(dict.en[k], v, `sai EN: ${k}`);
  });
  it("VI giữ nguyên văn bản gốc", () => {
    const U = require(path.join(ROOT, "js", "upgrades2.js"));
    for (const id of IDS) {
      const u = U.get(id);
      assert.equal(dict.vi[`upg2.${id}.name`], u.nameVi);
      assert.equal(dict.vi[`upg2.${id}.desc`], u.descVi);
    }
  });
});

describe("P2 i18n v2 — helper dname/ddesc/dtag", () => {
  it("trả EN khi I18N đang ở chế độ EN", () => {
    globalThis.window = { I18N: { t: (k) => (EN[k] !== undefined ? EN[k] : k) } };
    const U = require(path.join(ROOT, "js", "upgrades2.js"));
    assert.equal(U.dname({ id: "dan_no", nameVi: "Đạn Nổ" }), "Boom Rounds");
    assert.equal(U.ddesc({ id: "dan_no", descVi: "x" }), EN["upg2.dan_no.desc"]);
    assert.equal(U.dtag({ id: "gai_phan", tagVi: "Độc quyền ải 2", bossStage: 2 }), "Stage 2 exclusive");
    assert.equal(U.dtag({ id: "dan_no" }), "", "không tagVi → chuỗi rỗng");
  });
  it("fallback VI khi không có I18N (hoặc thiếu key)", () => {
    delete globalThis.window;
    const U = require(path.join(ROOT, "js", "upgrades2.js"));
    assert.equal(U.dname({ id: "dan_no", nameVi: "Đạn Nổ" }), "Đạn Nổ");
    assert.equal(U.ddesc({ id: "dan_no", descVi: "Mô tả VI" }), "Mô tả VI");
    assert.equal(U.dtag({ id: "gai_phan", tagVi: "Độc quyền ải 2", bossStage: 2 }), "Độc quyền ải 2");
    // key thiếu trong dict EN → T() trả fallback VI
    globalThis.window = { I18N: { t: (k) => k } };
    assert.equal(U.dname({ id: "dan_no", nameVi: "Đạn Nổ" }), "Đạn Nổ");
    delete globalThis.window;
  });
});

describe("P2 i18n v2 — call-site game.js", () => {
  it("openDraft đi qua Upgrades2.dname/ddesc (không đọc trực tiếp nameVi/descVi)", () => {
    const src = read("js/game.js");
    assert.match(src, /Upgrades2\.dname/);
    assert.match(src, /Upgrades2\.ddesc/);
    assert.ok(!/t:\s*u\.nameVi/.test(src), "openDraft còn đọc trực tiếp u.nameVi");
  });
});
