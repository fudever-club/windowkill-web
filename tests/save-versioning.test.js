/* WINDOWKILL — N8 save versioning tests (node:test, no deps).
 * Seed các save cũ/tương lai/hỏng vào localStorage stub, load lại js/meta.js,
 * assert: không crash, dữ liệu nguyên vẹn, version key đúng quy ước Q1-A.
 * Chạy: node --test tests/save-versioning.test.js */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const META_PATH = path.join(__dirname, "..", "js", "meta.js");

// Load lại meta.js với localStorage stub đã seed sẵn. Mỗi lần load là 1 "lần mở game".
function loadGame(seed) {
  delete require.cache[require.resolve(META_PATH)];
  const store = {};
  for (const k of Object.keys(seed || {})) store[k] = String(seed[k]);
  const warnings = [], infos = [], errors = [];
  global.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
  const orig = { warn: console.warn, info: console.info, error: console.error };
  console.warn = (m) => warnings.push(String(m));
  console.info = (m) => infos.push(String(m));
  console.error = (m) => errors.push(String(m));
  let Meta, threw = null;
  try { Meta = require(META_PATH); } catch (e) { threw = e; }
  console.warn = orig.warn; console.info = orig.info; console.error = orig.error;
  return { Meta, store, warnings, infos, errors, threw };
}

const V1_SEED = { // save v1 điển hình: có data, KHÔNG có wk_save_version
  wk_meta_shards: "120",
  wk_meta_shards_total: "450",
  wk_meta_workshop: '{"1":2,"3":1}',
  wk_meta_skins: '["default"]',
  wk_meta_stats: '{"kills":131,"wave":6}',
};

describe("N8 — save versioning (Q1-A: wk_save_version, forward-only)", () => {
  it("SAVE_VERSION hiện tại là 2", () => {
    const { Meta, threw } = loadGame({});
    assert.equal(threw, null);
    assert.equal(Meta.SAVE_VERSION, 2);
  });

  it("save v1 ngầm định (thiếu key) → migrate 1→2, dữ liệu nguyên vẹn", () => {
    const { Meta, store, threw } = loadGame(V1_SEED);
    assert.equal(threw, null, "load không được crash");
    assert.equal(store.wk_save_version, "2", "ghi version 2 sau migrate");
    assert.equal(Meta.saveVersion(), 2);
    assert.equal(Meta.getShards(), 120, "mảnh kính giữ nguyên");
    assert.equal(Meta.getTotalShards(), 450, "tổng lifetime giữ nguyên");
    assert.equal(Meta.getWorkshop()["1"], 2, "workshop node 1 giữ nguyên");
    assert.equal(Meta.getWorkshop()["3"], 1, "workshop node 3 giữ nguyên");
    assert.deepEqual(JSON.parse(store.wk_meta_stats), { kills: 131, wave: 6 });
  });

  it("save ghi rõ version 1 → migrate lên 2", () => {
    const { store, threw } = loadGame({ ...V1_SEED, wk_save_version: "1" });
    assert.equal(threw, null);
    assert.equal(store.wk_save_version, "2");
  });

  it("save mới tinh (trống) → khởi tạo ở version 2, defaults hoạt động", () => {
    const { Meta, store, threw } = loadGame({});
    assert.equal(threw, null);
    assert.equal(store.wk_save_version, "2");
    assert.equal(Meta.getShards(), 0);
    assert.ok(Array.isArray(Meta.getAchievements()) && Meta.getAchievements().length > 0);
  });

  it("save v1 thiếu field (partial) → không crash, thiếu thì default", () => {
    const { Meta, store, threw } = loadGame({ wk_meta_shards: "45" });
    assert.equal(threw, null);
    assert.equal(store.wk_save_version, "2");
    assert.equal(Meta.getShards(), 45);
    assert.equal(Meta.getTotalShards(), 0);
  });

  it("save v1 JSON hỏng ở 1 key → không crash, key đó về default", () => {
    const { Meta, threw } = loadGame({ ...V1_SEED, wk_meta_workshop: "{broken-json" });
    assert.equal(threw, null);
    assert.equal(Meta.getShards(), 120, "key lành vẫn nguyên");
    const ws = Meta.getWorkshop();
    assert.ok(Object.values(ws).every((lv) => lv === 0), "key hỏng về default (mọi node level 0)");
  });

  it("save version tương lai (99) → KHÔNG crash, KHÔNG downgrade, có cảnh báo", () => {
    const { Meta, store, warnings, threw } = loadGame({ ...V1_SEED, wk_save_version: "99" });
    assert.equal(threw, null, "không được crash với version tương lai");
    assert.equal(store.wk_save_version, "99", "giữ nguyên, không ghi đè");
    assert.equal(Meta.saveVersion(), 99);
    assert.equal(Meta.getShards(), 120, "dữ liệu đọc bình thường");
    assert.ok(warnings.some((w) => w.includes("99")), "phải có cảnh báo console");
  });

  it("version lạ ('abc') → coi như v1, migrate lên 2, không crash", () => {
    const { store, threw } = loadGame({ wk_meta_shards: "10", wk_save_version: "abc" });
    assert.equal(threw, null);
    assert.equal(store.wk_save_version, "2");
    assert.equal(store.wk_meta_shards, "10");
  });

  it("migrateSave chạy tuần tự từng bước và chỉ tiến", () => {
    const { Meta, threw } = loadGame({});
    assert.equal(threw, null);
    assert.equal(Meta._migrateSave(1, 2), 2, "1→2");
    assert.equal(Meta._migrateSave(2, 2), 2, "đã ở 2 → no-op");
    assert.equal(Meta._migrateSave(5, 2), 5, "from > to → không lùi");
  });

  it("ghi đè version thủ công rồi load lại → idempotent", () => {
    const first = loadGame(V1_SEED);
    assert.equal(first.store.wk_save_version, "2");
    const second = loadGame(first.store); // load lại từ store đã migrate
    assert.equal(second.threw, null);
    assert.equal(second.store.wk_save_version, "2");
    assert.equal(second.Meta.getShards(), 120);
  });
});
