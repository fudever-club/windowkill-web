/* WINDOWKILL — stage mechanics tests (node:test).
 * UNIT+INTEGRATION TEST: module js/stagemech.js — twist có thưởng mỗi ải campaign (1-5).
 * Mock window/G/I18N/setBanner/addFloat/AudioEngine/Juice/shrinkWindow/StageObj/StageFX
 * theo pattern tests/stage-objectives.test.js (không boot cả game).
 * Chạy: node --test tests/stage-mechanics.test.js
 */
"use strict";

const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

// ---- harness: mock world (globals đọc runtime qua globalThis) ----
const registered = { vi: {}, en: {} };
const calls = { banner: [], float: [], sfx: [], slowMo: [], shrink: [], spikePrev: [] };
let G, StageObjMock, StageFXMock, JuiceMock;

function resetWorld() {
  calls.banner = []; calls.float = []; calls.sfx = [];
  calls.slowMo = []; calls.shrink = []; calls.spikePrev = [];
  G = { gems: [], ship: { x: 100, y: 200 }, rebootFlash: 0, boss: null,
    onSpikeKill: (ev) => { calls.spikePrev.push(ev); } };
  StageObjMock = { _drift: false, isDrifting() { return this._drift; } };
  StageFXMock = { _dark: false, isDark() { return this._dark; } };
  JuiceMock = { slowMo: (f, ms) => { calls.slowMo.push([f, ms]); } };
  globalThis.I18N = {
    register: (d) => { for (const l of ["vi", "en"]) Object.assign(registered[l], d[l] || {}); },
    t: (k) => registered.vi[k] || k,
  };
  globalThis.G = G;
  globalThis.StageObj = StageObjMock;
  globalThis.StageFX = StageFXMock;
  globalThis.Juice = JuiceMock;
  globalThis.setBanner = (title, sub) => { calls.banner.push([title, sub]); };
  globalThis.addFloat = (x, y, txt, color, big) => { calls.float.push({ txt, color, big: !!big }); };
  globalThis.AudioEngine = { sfx: { warn: () => { calls.sfx.push("warn"); }, thud: () => { calls.sfx.push("thud"); } } };
  globalThis.shrinkWindow = (dw, dh) => { calls.shrink.push([dw, dh]); };
}

resetWorld(); // dựng mock trước require để I18N.register (lúc load) gom keys
const StageMech = require(path.join(ROOT, "js/stagemech.js"));

function enemy(type, x, y, xp) {
  return { type: type || "chaser", x: x == null ? 50 : x, y: y == null ? 60 : y, xp: xp == null ? 2 : xp };
}

describe("stagemech.js — ải 1: hạ boss → flash tốt nghiệp", () => {
  beforeEach(() => { resetWorld(); });

  it("M1: onBossKill ở ải 1 → rebootFlash=0.5 + banner TỐT NGHIỆP TÂN BINH!", () => {
    StageMech.begin(1);
    StageMech.onBossKill();
    assert.equal(globalThis.G.rebootFlash, 0.5, "flash xanh 0.5s");
    assert.equal(calls.banner.length, 1);
    assert.equal(calls.banner[0][0], "TỐT NGHIỆP TÂN BINH!");
  });

  it("M2: onBossKill ở ải khác (2) → không làm gì", () => {
    StageMech.begin(2);
    globalThis.G.rebootFlash = 0;
    StageMech.onBossKill();
    assert.equal(globalThis.G.rebootFlash, 0, "không bật flash");
    assert.equal(calls.banner.length, 0, "không banner");
    assert.equal(globalThis.G.gems.length, 0, "không rớt gem");
  });

  it("M3: drawFlash vẽ khi flash>0, không vẽ khi =0", () => {
    StageMech.begin(1);
    StageMech.onBossKill();
    const fills = [];
    const ctx = { fillRect: (x, y, w, h) => fills.push([x, y, w, h]) };
    StageMech.drawFlash(ctx, 800, 600);
    assert.equal(fills.length, 1);
    assert.deepEqual(fills[0], [0, 0, 800, 600]);
    assert.equal(ctx.fillStyle, "rgba(30,100,255,0.75)", "alpha tỉ lệ 0.75 khi f=0.5");
    // decay hết flash → không vẽ
    StageMech.update(0.6);
    assert.equal(globalThis.G.rebootFlash, 0);
    StageMech.drawFlash(ctx, 800, 600);
    assert.equal(fills.length, 1, "flash=0 thì không vẽ");
  });

  it("M4: drawFlash ở ải khác (2) → không vẽ kể cả khi có flash", () => {
    StageMech.begin(2);
    globalThis.G.rebootFlash = 0.5;
    const fills = [];
    StageMech.drawFlash({ fillRect: (...a) => fills.push(a) }, 800, 600);
    assert.equal(fills.length, 0);
  });
});

describe("stagemech.js — ải 2: spike kill rớt gem ×2", () => {
  beforeEach(() => { resetWorld(); });

  it("M5: tank chết bởi gai → 6 gem (3×2), v=e.xp, float NƯỚNG CHÍN!", () => {
    StageMech.begin(2);
    StageMech.onSpikeKill(enemy("tank", 10, 20, 5));
    assert.equal(globalThis.G.gems.length, 6);
    assert.ok(globalThis.G.gems.every((g) => g.v === 5 && g.x === 10 && g.y === 20));
    assert.equal(calls.float.length, 1);
    assert.equal(calls.float[0].txt, "NƯỚNG CHÍN!");
    assert.equal(calls.float[0].big, true);
  });

  it("M6: quái thường chết bởi gai → 2 gem", () => {
    StageMech.begin(2);
    StageMech.onSpikeKill(enemy("chaser", 1, 2, 3));
    assert.equal(globalThis.G.gems.length, 2);
    assert.ok(globalThis.G.gems.every((g) => g.v === 3));
  });

  it("M7: begin(2) chain hook — G.onSpikeKill cũ (StageObj) vẫn được gọi", () => {
    const prev = globalThis.G.onSpikeKill;
    assert.equal(typeof prev, "function", "giả lập hook cũ của StageObj");
    StageMech.begin(2);
    assert.notEqual(globalThis.G.onSpikeKill, prev, "begin(2) wrap hook");
    const e = enemy("chaser", 7, 8, 1);
    globalThis.G.onSpikeKill(e); // gọi qua hook đã chain
    assert.equal(calls.spikePrev.length, 1, "hook cũ vẫn chạy");
    assert.equal(globalThis.G.gems.length, 2, "hook mới (StageMech) vẫn chạy");
  });

  it("M8: stageId=3 → onSpikeKill không rớt gem, không float", () => {
    StageMech.begin(3);
    StageMech.onSpikeKill(enemy("tank", 10, 20, 5));
    assert.equal(globalThis.G.gems.length, 0);
    assert.equal(calls.float.length, 0);
  });
});

describe("stagemech.js — ải 3: drift-kill + chuỗi 5 → slow-mo", () => {
  beforeEach(() => { resetWorld(); });

  it("M9: drift-kill → bonus gem (tank → 3 gem); không drift → 0", () => {
    StageMech.begin(3);
    StageObjMock._drift = false;
    StageMech.onKill(enemy("tank", 50, 60, 4));
    assert.equal(globalThis.G.gems.length, 0, "không drift: module không thưởng");
    assert.equal(calls.float.length, 0);
    StageObjMock._drift = true;
    StageMech.onKill(enemy("tank", 50, 60, 4));
    assert.equal(globalThis.G.gems.length, 3, "drift: bonus 1 bộ gem (tank=3)");
    assert.ok(globalThis.G.gems.every((g) => g.v === 4));
    assert.equal(calls.float[0].txt, "TRƯỢT ĐẸP! ×2");
  });

  it("M10: chuỗi 5 drift-kill → Juice.slowMo(0.3, 1000) + banner chain + reset chain", () => {
    StageMech.begin(3);
    StageObjMock._drift = true;
    for (let i = 0; i < 4; i++) {
      StageMech.onKill(enemy("chaser", 10 + i, 10, 1));
      assert.equal(calls.slowMo.length, 0, `chưa slow-mo ở chain ${i + 1}`);
    }
    StageMech.onKill(enemy("chaser", 50, 10, 1));
    assert.deepEqual(calls.slowMo, [[0.3, 1000]], "slowMo(0.3, 1000) đúng 1 lần");
    assert.equal(calls.banner.length, 1);
    assert.equal(calls.banner[0][0], "404: KỸ NĂNG KHÔNG TÌM THẤY… À CÓ ĐÂY RỒI!");
    assert.equal(StageMech.state().driftChain, 0, "chain reset sau trigger");
  });

  it("M11: chuỗi hết hạn sau 10s → chain=0", () => {
    StageMech.begin(3);
    StageObjMock._drift = true;
    StageMech.onKill(enemy("chaser", 10, 10, 1));
    assert.equal(StageMech.state().driftChain, 1);
    StageMech.update(5);
    assert.equal(StageMech.state().driftChain, 1, "5s chưa hết hạn");
    StageMech.update(5.1);
    const st = StageMech.state();
    assert.equal(st.driftChain, 0, "10s hết hạn → chain=0");
    assert.equal(st.driftChainT, 0);
  });
});

describe("stagemech.js — ải 4: kill trong mất điện rớt thêm gem", () => {
  beforeEach(() => { resetWorld(); });

  it("M12: lúc tối → bonus gem + float nhỏ SĂN ĐÊM! ×2", () => {
    StageMech.begin(4);
    StageFXMock._dark = true;
    StageMech.onKill(enemy("chaser", 30, 40, 2));
    assert.equal(globalThis.G.gems.length, 1);
    assert.equal(globalThis.G.gems[0].v, 2);
    assert.equal(calls.float.length, 1);
    assert.equal(calls.float[0].txt, "SĂN ĐÊM! ×2");
    assert.equal(calls.float[0].big, false, "float nhỏ (big=false)");
  });

  it("M13: lúc sáng → không bonus", () => {
    StageMech.begin(4);
    StageFXMock._dark = false;
    StageMech.onKill(enemy("tank", 30, 40, 2));
    assert.equal(globalThis.G.gems.length, 0);
    assert.equal(calls.float.length, 0);
  });
});

describe("stagemech.js — ải 5: patch + sự kiện NULL hút cửa sổ", () => {
  beforeEach(() => { resetWorld(); });

  it("M14: nhặt patch → +5 gem quanh tàu + float VÁ CÓ CÔNG! +5", () => {
    StageMech.begin(5);
    StageMech.onPickup("patch", { x: 1, y: 1 });
    assert.equal(globalThis.G.gems.length, 5);
    assert.ok(globalThis.G.gems.every((g) => g.x === 100 && g.y === 200 && g.v === 1), "gem quanh tàu");
    assert.equal(calls.float[0].txt, "VÁ CÓ CÔNG! +5");
  });

  it("M15: pickup khác (heart) → không thưởng", () => {
    StageMech.begin(5);
    StageMech.onPickup("heart", { x: 1, y: 1 });
    assert.equal(globalThis.G.gems.length, 0);
    assert.equal(calls.float.length, 0);
  });

  it("M16: boss hp/maxHp=0.2 → event: banner cảnh báo + shrinkT=2 + hút cửa sổ mỗi 0.5s", () => {
    StageMech.begin(5);
    globalThis.G.boss = { x: 300, y: 400, hp: 20, maxHp: 100, dead: false };
    StageMech.update(0.1);
    const st = StageMech.state();
    assert.equal(st.bossEventDone, true);
    assert.ok(st.shrinkT > 0 && st.shrinkT <= 2, "shrinkT đang chạy (1.9 sau update 0.1s)");
    assert.equal(calls.banner[0][0], "CẢNH BÁO: NULL ĐANG HÚT CỬA SỔ!");
    assert.deepEqual(calls.sfx, ["warn"], "sfx cảnh báo");
    assert.equal(calls.shrink.length, 0, "chưa đủ 0.5s tick");
    StageMech.update(0.5); // tick 1
    assert.deepEqual(calls.shrink, [[12, 9]], "teo 12×9px");
    assert.equal(calls.float[0].txt, "−12px 🪟");
    StageMech.update(0.5); // tick 2
    assert.equal(calls.shrink.length, 2, "teo tiếp mỗi 0.5s");
  });

  it("M17: boss >25% HP → không kích event", () => {
    StageMech.begin(5);
    globalThis.G.boss = { x: 300, y: 400, hp: 50, maxHp: 100, dead: false };
    StageMech.update(1.0);
    assert.equal(StageMech.state().bossEventDone, false);
    assert.equal(calls.banner.length, 0);
  });

  it("M18: onBossKill trong lúc shrinkT>0 → CTRL+Z + 20 gem tại vị trí boss cuối", () => {
    StageMech.begin(5);
    globalThis.G.boss = { x: 300, y: 400, hp: 20, maxHp: 100, dead: false };
    StageMech.update(0.1); // kích event, lastBossX/Y = 300/400
    assert.ok(StageMech.state().shrinkT > 0);
    StageMech.onBossKill();
    assert.equal(calls.banner[calls.banner.length - 1][0], "CTRL+Z THÀNH CÔNG!");
    assert.equal(globalThis.G.gems.length, 20);
    assert.ok(globalThis.G.gems.every((g) => g.x === 300 && g.y === 400 && g.v === 1));
  });

  it("M19: onBossKill khi không có event (shrinkT=0) → không bonus", () => {
    StageMech.begin(5);
    StageMech.onBossKill();
    assert.equal(calls.banner.length, 0);
    assert.equal(globalThis.G.gems.length, 0);
  });
});

describe("stagemech.js — stage-gating: ải không hợp lệ → inactive", () => {
  beforeEach(() => { resetWorld(); });

  it("M20: begin(0)/begin(7) → stageId=0, mọi event early-return", () => {
    for (const id of [0, 7]) {
      resetWorld();
      assert.equal(StageMech.begin(id), 0, `begin(${id}) trả 0`);
      assert.equal(StageMech.state().stageId, 0);
      StageObjMock._drift = true;
      StageFXMock._dark = true;
      StageMech.onKill(enemy("tank", 10, 20, 5));
      StageMech.onSpikeKill(enemy("tank", 10, 20, 5));
      StageMech.onBossKill();
      StageMech.onPickup("patch", {});
      StageMech.update(1.0);
      const fills = [];
      StageMech.drawFlash({ fillRect: (...a) => fills.push(a) }, 800, 600);
      assert.equal(globalThis.G.gems.length, 0, `ải ${id}: không rớt gem`);
      assert.equal(calls.banner.length, 0, `ải ${id}: không banner`);
      assert.equal(calls.float.length, 0, `ải ${id}: không float`);
      assert.equal(fills.length, 0, `ải ${id}: không drawFlash`);
    }
  });
});

describe("stagemech.js — i18n stagemech.* VI+EN", () => {
  it("M21: đủ 8 keys cả VI và EN", () => {
    const keys = ["graduate", "roast", "drift2", "drift_chain",
      "night2", "patch_thanks", "ctrlz", "null_warn"];
    for (const k of keys) {
      const full = `stagemech.${k}`;
      assert.ok(registered.vi[full], `thiếu VI: ${full}`);
      assert.ok(registered.en[full], `thiếu EN: ${full}`);
      assert.notEqual(registered.vi[full], full, `VI không rỗng: ${full}`);
      assert.notEqual(registered.en[full], full, `EN không rỗng: ${full}`);
    }
    assert.equal(registered.vi["stagemech.graduate"], "TỐT NGHIỆP TÂN BINH!");
    assert.equal(registered.en["stagemech.graduate"], "ROOKIE GRADUATED!");
  });

  it("M22: StageMech._t trả bản dịch VI qua I18N mock", () => {
    assert.equal(StageMech._t("stagemech.roast", "ROASTED!"), "NƯỚNG CHÍN!");
  });
});
