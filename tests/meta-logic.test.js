/* WINDOWKILL — meta.js logic tests (node:test, localStorage shim).
 * SYSTEM TEST: kinh tế Mảnh Kính/Xưởng, Daily seed determinism, và khả năng
 * chịu save cũ/hỏng — những chỗ từng gây crash thật trên production.
 * Chạy: node --test tests/meta-logic.test.js
 */
"use strict";

const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const META_SRC = fs.readFileSync(path.join(ROOT, "js/meta.js"), "utf8");

function loadMeta(seed = {}) {
  const store = { ...seed };
  const sandbox = {
    localStorage: {
      getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
      clear: () => { for (const k of Object.keys(store)) delete store[k]; },
    },
    console,
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(META_SRC, sandbox, { filename: "js/meta.js" });
  return { Meta: sandbox.window.Meta, store };
}

const J = (v) => JSON.stringify(v); // so sánh cross-realm (object từ VM khác realm)

describe("meta.js — Daily determinism (seed = ngày, mọi người giống nhau)", () => {
  it("M1: cùng ngày → cùng seed/modifiers; modifiers 2 cái phân biệt", () => {
    const { Meta } = loadMeta();
    const a = Meta.getDaily();
    const b = Meta.getDaily();
    assert.equal(J(a), J(b), "gọi 2 lần phải giống hệt");
    assert.equal(a.seed, Meta._todayKey());
    assert.equal(a.modifiers.length, 2);
    assert.notEqual(a.modifiers[0].id, a.modifiers[1].id);
  });
  it("M1b: NOTE — Meta.getDaily() public không forward dateKey (chỉ Daily nội bộ nhận); test qua _mulberry32", () => {
    const { Meta } = loadMeta();
    assert.equal(Meta.getDaily("20990101").seed, Meta._todayKey(),
      "public API hiện bỏ qua tham số — ghi nhận, không phải crash");
  });
  it("M2: mulberry32 determinism qua _mulberry32", () => {
    const { Meta } = loadMeta();
    const seq = (s) => { const r = Meta._mulberry32(s); return [r(), r(), r()]; };
    assert.deepEqual(seq(42), seq(42));
    assert.notDeepEqual(seq(42), seq(43));
  });
});

describe("meta.js — kinh tế Mảnh Kính", () => {
  it("M3: add/spend chuẩn; không âm; spend quá số dư thất bại, số dư nguyên", () => {
    const { Meta } = loadMeta();
    assert.equal(Meta.addShards(100, "test").added, 100);
    assert.equal(Meta.getShards(), 100);
    assert.equal(Meta.spendShards(30), true);
    assert.equal(Meta.getShards(), 70);
    assert.equal(Meta.spendShards(1000), false);
    assert.equal(Meta.getShards(), 70, "spend thất bại không được trừ");
    Meta.addShards(-50, "hack");
    assert.ok(Meta.getShards() >= 0, "không được âm");
  });
});

describe("meta.js — Xưởng mua node", () => {
  it("M4: node khóa (bestWave) → locked; node lạ → unknown_node", () => {
    const { Meta } = loadMeta();
    assert.equal(J(Meta.buyNode(3)), J({ ok: false, error: "locked" })); // cần wave 5
    assert.equal(J(Meta.buyNode(999)), J({ ok: false, error: "unknown_node" }));
  });
  it("M5: mua thành công trừ đúng giá, lên cấp; hết tiền → not_enough_shards", () => {
    const { Meta } = loadMeta();
    Meta.addShards(1000, "test");
    const r1 = Meta.buyNode(1); // Khung gia cố: giá [50,120,250], max 3
    assert.equal(r1.ok, true);
    assert.equal(r1.level, 1);
    assert.equal(r1.shardsLeft, 950);
    const r2 = Meta.buyNode(1);
    assert.equal(r2.level, 2);
    assert.equal(r2.shardsLeft, 830);
    Meta.spendShards(Meta.getShards());
    assert.equal(J(Meta.buyNode(4)), J({ ok: false, error: "not_enough_shards" }));
  });
  it("M6: mua tới max → maxed, không trừ thêm", () => {
    const { Meta } = loadMeta();
    Meta.addShards(100000, "test");
    assert.equal(Meta.buyNode(4).ok, true); // max 3
    assert.equal(Meta.buyNode(4).ok, true);
    assert.equal(Meta.buyNode(4).ok, true);
    const before = Meta.getShards();
    assert.equal(J(Meta.buyNode(4)), J({ ok: false, error: "maxed" }));
    assert.equal(Meta.getShards(), before);
  });
});

describe("meta.js — chịu save cũ/hỏng (từng crash production)", () => {
  it("M7: JSON hỏng / sai kiểu trong storage → không crash, trả default", () => {
    const { Meta } = loadMeta({
      wk_meta_shards: "abc",
      wk_meta_workshop: "{broken",
      wk_meta_achv: "null",
      wk_meta_daily: "[1,2",
    });
    assert.doesNotThrow(() => Meta.getShards());
    assert.equal(Meta.getShards(), 0);
    assert.doesNotThrow(() => Meta.getWorkshop());
    const w = JSON.parse(J(Meta.getWorkshop())); // về realm test
    assert.ok(Object.values(w).every((v) => v === 0), "workshop hỏng → reset về 0");
    assert.doesNotThrow(() => Meta.getAchievements());
  });
  it("M8: save trống hoàn toàn → mọi getter trả default hợp lệ", () => {
    const { Meta } = loadMeta();
    assert.equal(Meta.getShards(), 0);
    const w = JSON.parse(J(Meta.getWorkshop()));
    assert.equal(Object.keys(w).length, 10);
    assert.equal(Meta.isWorkshopFull(), false);
    assert.ok(Array.isArray(Meta.getSkins()) && Meta.getSkins().length > 0);
    assert.equal(Meta.getDaily().seed, Meta._todayKey());
  });
});

describe("meta.js — achievement defs đầy đủ", () => {
  it("M9: mọi achievement có id/nameVi/nameEn/reward; id duy nhất", () => {
    const { Meta } = loadMeta();
    const defs = Meta.ACHV_DEFS;
    assert.ok(defs.length >= 20, `chỉ có ${defs.length} achievements`);
    const ids = new Set();
    for (const d of defs) {
      assert.ok(d.id != null, "thiếu id");
      assert.ok(d.nameVi && d.nameEn, `achievement ${d.id} thiếu tên`);
      assert.ok(d.reward, `achievement ${d.id} thiếu reward`);
      assert.ok(!ids.has(d.id), `trùng id ${d.id}`);
      ids.add(d.id);
    }
  });
});
