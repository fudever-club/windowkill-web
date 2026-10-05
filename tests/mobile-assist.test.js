/* WINDOWKILL — Mobile Assist (2026-10-05, CEO chốt số qua widget).
 *
 * Bối cảnh: user chơi mobile thấy normal quá khó — arena ~360px vs 980px
 * desktop, ít chỗ né + touch kém chính xác.
 * Spec: khi detect mobile → tốc độ quái ×0.85, số lượng spawn ×0.8,
 * gặm viền ×0.8. Boss HP + sức tàu GIỮ NGUYÊN. Toggle "Hỗ trợ mobile"
 * trong cài đặt, mặc định BẬT. Desktop không đổi hành vi.
 * Implement: áp tại Campaign.diffOf() (shallow copy, không mutate gốc).
 *
 * Chạy: node --test tests/mobile-assist.test.js
 */
"use strict";

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

function loadCampaign() {
  const mPath = path.join(ROOT, "js/campaign.js");
  delete require.cache[require.resolve(mPath)];
  return require(mPath);
}

/* Mock mobile: wk-coarse class (pattern game.js/mobile.js dùng) */
function mockMobile() {
  global.document = { body: { classList: { contains: (c) => c === "wk-coarse" } } };
  global.window = { matchMedia: () => ({ matches: false }) };
}
function mockDesktop() {
  global.document = { body: { classList: { contains: () => false } } };
  global.window = { matchMedia: () => ({ matches: false }) };
}
/* localStorage mock đọc từ object cho trước */
function mockSettings(obj) {
  const store = { wk_settings: JSON.stringify(obj || {}) };
  global.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
  };
  return store;
}
function clearMocks() {
  delete global.document;
  delete global.window;
  delete global.localStorage;
}

describe("Mobile Assist", () => {
  beforeEach(() => { clearMocks(); });
  afterEach(() => { clearMocks(); });

  it("desktop: diffOf trả về số gốc, không có marker", () => {
    mockDesktop(); mockSettings({});
    const C = loadCampaign();
    const d = C.getDifficulty("normal");
    assert.equal(d.monster_speed_mult, 1.0);
    assert.equal(d.spawn_count_mult, 1.0);
    assert.equal(d.chew_dps_mult, 1.0);
    assert.equal(d._mobileAssist, undefined);
    assert.equal(C.mobileAssistActive(), false);
  });

  it("mobile + bật: áp đúng 0.85 / 0.8 / 0.8", () => {
    mockMobile(); mockSettings({});
    const C = loadCampaign();
    assert.equal(C.mobileAssistActive(), true);
    const d = C.getDifficulty("normal");
    assert.equal(d.monster_speed_mult, 0.85);
    assert.equal(d.spawn_count_mult, 0.8);
    assert.equal(d.chew_dps_mult, 0.8);
    assert.equal(d._mobileAssist, true);
  });

  it("mobile + tắt toggle: không áp", () => {
    mockMobile(); mockSettings({ mobileAssist: false });
    const C = loadCampaign();
    assert.equal(C.mobileAssistActive(), false);
    const d = C.getDifficulty("normal");
    assert.equal(d.monster_speed_mult, 1.0);
    assert.equal(d.spawn_count_mult, 1.0);
    assert.equal(d._mobileAssist, undefined);
  });

  it("boss HP + máu quái + tàu GIỮ NGUYÊN khi assist bật", () => {
    mockMobile(); mockSettings({});
    const C = loadCampaign();
    const d = C.getDifficulty("normal");
    assert.equal(d.monster_hp_mult, 1.0);
    assert.equal(d.boss_hp_mult, 1.0);
    assert.equal(d.ship_hp, 3);
    const rp = C.getRunParams("normal");
    assert.equal(rp.monsterHpMult, 1.0);
    assert.equal(rp.bossHpMult, 1.0);
    assert.equal(rp.shipHp, 3);
    assert.equal(rp.monsterSpeedMult, 0.85);
    assert.equal(rp.chewDpsMult, 0.8);
    assert.equal(rp.spawnCountMult, 0.8);
  });

  it("không mutate object gốc dùng chung", () => {
    mockMobile(); mockSettings({});
    let C = loadCampaign();
    const d1 = C.getDifficulty("normal");
    assert.equal(d1.monster_speed_mult, 0.85);
    // reload module + desktop → số gốc còn nguyên
    clearMocks(); mockDesktop(); mockSettings({});
    C = loadCampaign();
    assert.equal(C.getDifficulty("normal").monster_speed_mult, 1.0);
  });

  it("getWaveComp: số lượng spawn giảm (chaser 10 → 8)", () => {
    mockMobile(); mockSettings({});
    const C = loadCampaign();
    const comp = C.getWaveComp(1, 1, "normal");
    assert.ok(Array.isArray(comp) && comp.length > 0);
    const chaser = comp.find((e) => e.monster === "chaser" && !e.isBoss);
    if (chaser) {
      // count gốc × spawn_count_mult(1.0) × assist(0.8), làm tròn
      assert.ok(chaser.count < 10, "count phải giảm so với gốc, got " + chaser.count);
    }
    const boss = comp.find((e) => e.isBoss);
    if (boss) assert.equal(boss.bossHpMult, 1.0);
    for (const e of comp) assert.equal(e.hpMult, e.isBoss ? e.hpMult : 1.0);
  });

  it("getEndlessWave: speed/count/chew giảm, hp giữ", () => {
    mockMobile(); mockSettings({});
    const C = loadCampaign();
    const w = C.getEndlessWave(3, "normal");
    assert.ok(w.speedMult < 1.65 && w.speedMult > 0);
    // wave 3: base.count=34+3k công thức n<=10 → check count đã nhân 0.8
    const C2desk = (() => { clearMocks(); mockDesktop(); mockSettings({}); return loadCampaign(); })();
    const wDesk = C2desk.getEndlessWave(3, "normal");
    assert.ok(w.count < wDesk.count, `mobile ${w.count} < desktop ${wDesk.count}`);
    assert.ok(w.chewDps < wDesk.chewDps);
    assert.equal(w.hpMult, wDesk.hpMult);
  });

  it("assist áp cho mọi độ khó (chill cũng được giảm)", () => {
    mockMobile(); mockSettings({});
    const C = loadCampaign();
    const d = C.getDifficulty("chill");
    assert.ok(Math.abs(d.monster_speed_mult - 0.75 * 0.85) < 1e-9);
    assert.ok(Math.abs(d.spawn_count_mult - 0.8 * 0.8) < 1e-9);
  });

  it("isMobileDevice: false khi không có DOM", () => {
    clearMocks(); // không document/window
    const C = loadCampaign();
    assert.equal(C.isMobileDevice(), false);
  });
});
