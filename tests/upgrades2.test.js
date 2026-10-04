/* WINDOWKILL — M22 wiring test (spec: studio/dev/audits/frontend-arch.md §5.7 + Phụ lục A).
 * Động: require trực tiếp js/upgrades2.js (module.exports) — 13 test U1–U13.
 * Tĩnh: regex trên source game.js / v2glue.js pin các call-site chống hồi quy — 7 test S1–S7
 * (gộp thêm assert cho F-02, Phụ lục A node 6–10 và D-03 vào các test tĩnh cùng chủ đề).
 */
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, it, beforeEach } = require("node:test");

const ROOT = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const U = require(path.join(ROOT, "js", "upgrades2.js"));

describe("Upgrades2 — unit (động)", () => {
  beforeEach(() => { U.resetAll(); });

  it("U1: LIST đủ 6 nâng cấp, đúng id và pool", () => {
    assert.deepEqual(U.LIST.map((u) => u.id),
      ["gai_phan", "neo_quan_tinh", "mat_cu", "dan_no", "dan_xich", "keo_tu_va"]);
    assert.equal(U.LIST.filter((u) => u.pool === "common").length, 3);
    assert.equal(U.LIST.filter((u) => u.pool.indexOf("stage") === 0).length, 3);
  });

  it("U2: draftPool khi chưa hạ boss chỉ có 3 món common", () => {
    const pool = U.draftPool();
    assert.equal(pool.length, 3);
    assert.ok(!pool.some((u) => u.id === "gai_phan"));
  });

  it("U3: unlockBossStage(2) mở Gai Phản và trả đúng upgrade", () => {
    const up = U.unlockBossStage(2);
    assert.ok(up && up.id === "gai_phan");
    assert.ok(U.draftPool().some((u) => u.id === "gai_phan"));
    assert.equal(U.unlockBossStage(5), null);
    assert.equal(U.unlockBossStage(1), null);
  });

  it("U4: applyUpgrade bị khoá trả null, ship không đổi", () => {
    const ship = {};
    assert.equal(U.applyUpgrade("gai_phan", ship), null);
    assert.equal(ship.thornBorder, undefined);
  });

  it("U5: applyUpgrade dan_no gán explosive và chặn lấy trùng", () => {
    const ship = {};
    const up = U.applyUpgrade("dan_no", ship);
    assert.ok(up && up.id === "dan_no");
    assert.deepEqual(ship.explosive, { r: 60, dmg: 1 });
    assert.equal(U.applyUpgrade("dan_no", ship), null);
    assert.equal(U.hasTaken("dan_no"), true);
  });

  it("U6: resetRun mở lại pool nhưng giữ unlock boss", () => {
    U.unlockBossStage(2);
    U.applyUpgrade("dan_no", {});
    U.resetRun();
    assert.equal(U.hasTaken("dan_no"), false);
    assert.ok(U.draftPool().some((u) => u.id === "gai_phan"), "unlock ải vẫn giữ sau resetRun");
  });

  it("U7: explodeAt chỉ lan quái trong 60px, trừ quái trúng trực tiếp", () => {
    const ship = { explosive: { r: 60, dmg: 1 } };
    const hit = { x: 0, y: 0, dead: false };
    const near = { x: 50, y: 0, dead: false };
    const far = { x: 70, y: 0, dead: false };
    const calls = [];
    const out = U.explodeAt(0, 0, hit, [hit, near, far], (e, d) => calls.push([e, d]), ship);
    assert.deepEqual(calls, [[near, 1]]);
    assert.deepEqual(out, [near]);
  });

  it("U8: explodeAt không có explosive thì no-op", () => {
    let n = 0;
    const out = U.explodeAt(0, 0, { x: 0, y: 0 }, [{ x: 10, y: 0, dead: false }], () => { n++; }, {});
    assert.deepEqual(out, []);
    assert.equal(n, 0);
  });

  it("U9: chainFrom nảy sang quái gần nhất với 50% sát thương; ngoài 150px → null", () => {
    const ship = { chain: { r: 150, mul: 0.5 } };
    const hit = { x: 0, y: 0, dead: false };
    const far100 = { x: 100, y: 0, dead: false };
    const near40 = { x: 40, y: 0, dead: false };
    const calls = [];
    const tgt = U.chainFrom(hit, [hit, far100, near40], 10, (e, d) => calls.push([e, d]), ship);
    assert.equal(tgt, near40);
    assert.deepEqual(calls, [[near40, 5]]);
    const calls2 = [];
    assert.equal(U.chainFrom(hit, [hit, { x: 200, y: 0, dead: false }], 10, (e, d) => calls2.push([e, d]), ship), null);
    assert.equal(calls2.length, 0);
  });

  it("U10: checkThornBorder: giữa sân 0 hit, sát viền gây 3 dmg", () => {
    const bounds = { l: 0, t: 0, r: 800, b: 600 };
    const e = { x: 50, y: 300, dead: false };
    const calls = [];
    const mid = { x: 400, y: 300, r: 13, thornBorder: { dmg: 3, r: 120 } };
    assert.equal(U.checkThornBorder(mid, [e], bounds, (en, d) => calls.push([en, d])), 0);
    assert.equal(calls.length, 0);
    const edge = { x: 13, y: 300, r: 13, thornBorder: { dmg: 3, r: 120 } };
    assert.equal(U.checkThornBorder(edge, [e], bounds, (en, d) => calls.push([en, d])), 1);
    assert.deepEqual(calls, [[e, 3]]);
  });

  it("U11: tryAnchor dập knockback, tôn trọng cooldown 8s", () => {
    const ship = { inertiaAnchor: { cd: 0, max: 8 }, kbvx: 99, kbvy: -50 };
    assert.equal(U.tryAnchor(ship), true);
    assert.equal(ship.kbvx, 0);
    assert.equal(ship.kbvy, 0);
    assert.equal(ship.inertiaAnchor.cd, 8);
    assert.equal(U.tryAnchor(ship), false);
  });

  it("U12: tick: hồi chiêu Súng Bắn Keo giảm theo dt (clamp 0), cooldown neo giảm theo dt", () => {
    // 2026-10-04 (CEO chốt): Keo Tự Vá bị động (+10px/20s) bị thay bằng Súng Bắn Keo
    // chủ động — tick chỉ giảm cooldown, không còn trả về { glue }.
    const glueShip = { glueGun: { cd: 10, maxCd: 30, px: 60 } };
    assert.equal(U.tick(glueShip, 3), null);
    assert.equal(glueShip.glueGun.cd, 7);
    U.tick(glueShip, 10);
    assert.equal(glueShip.glueGun.cd, 0);
    const anchorShip = { inertiaAnchor: { cd: 8, max: 8 } };
    U.tick(anchorShip, 3);
    assert.equal(anchorShip.inertiaAnchor.cd, 5);
  });

  it("U13: owlTargets lọc theo 200px và bỏ quái dead", () => {
    const ship = { x: 0, y: 0, owlEye: { r: 200 } };
    const inside = { x: 100, y: 0, dead: false };
    const outside = { x: 300, y: 0, dead: false };
    const deadIn = { x: 50, y: 0, dead: true };
    assert.deepEqual(U.owlTargets(ship, [inside, outside, deadIn]), [inside]);
    assert.deepEqual(U.owlTargets({}, [inside]), []);
  });
});

describe("M22 wiring — tĩnh (call-site trong engine)", () => {
  const game = read("js/game.js");
  const glue = read("js/v2glue.js");
  const count = (src, re) => (src.match(re) || []).length;

  it("S1: game.js draft có nối rollDraft (slot bảo đảm) + D-03 đếm distinct + node 9 freeUpgrade mở draft", () => {
    assert.match(game, /Upgrades2\.rollDraft\(U2_DRAFT_SLOTS\)/);
    assert.match(game, /_draftId: "u2:" \+ u\.id/);
    assert.equal(count(game, /applyDraftPick\(u\)/g), 3, "định nghĩa + 2 call-site (Cinema + legacy)");
    // D-03: cả hai đường draft đều đi qua applyDraftPick → Meta.check('upgrade', distinct)
    assert.match(game, /Meta\.check\("upgrade", \{ distinct:/);
    assert.match(game, /G\.upgTaken/);
    // Phụ lục A node 9: sau boot, runMods.freeUpgrade → openDraft() ngay khi phase đang play
    assert.match(game, /freeUpgrade && G\.phase === "play"\) \{\s*try \{ openDraft\(\)/);
  });

  it("S2: game.js update gọi tick + checkThornBorder (throttle 0,5s) + node 6 vá wave theo waveRepairPx", () => {
    assert.match(game, /Upgrades2\.tick\(s, dt\)/);
    assert.match(game, /Upgrades2\.checkThornBorder\(s, G\.enemies/);
    assert.match(game, /s\._thornCd = 0\.5/, "Gai Phản bị throttle 0,5s ở phía engine");
    assert.match(game, /\(G\.runMods && G\.runMods\.waveRepairPx\) \|\| 40/);
    assert.match(game, /growWindow\(wrPx, Math\.round\(wrPx \* 0\.75\)\)/);
  });

  it("S3: game.js đạn trúng quái gọi explodeAt và chainFrom đúng 1 call-site mỗi hàm (chống double-hook/đệ quy)", () => {
    assert.equal(count(game, /Upgrades2\.explodeAt\(/g), 1);
    assert.equal(count(game, /Upgrades2\.chainFrom\(/g), 1);
    // hook nằm ở call-site va chạm (sau damageEnemy trực tiếp), không nằm trong damageEnemy
    const dmgFn = game.slice(game.indexOf("function damageEnemy"));
    assert.ok(!/Upgrades2\.(explodeAt|chainFrom)/.test(dmgFn.slice(0, dmgFn.indexOf("\nfunction "))),
      "damageEnemy không chứa hook lan/xích");
  });

  it("S4: game.js Shift gọi tryAnchor", () => {
    assert.match(game, /ShiftLeft[\s\S]{0,200}tryAnchor/);
    assert.equal(count(game, /Upgrades2\.tryAnchor\(/g), 1);
  });

  it("S5: resetGame gọi resetRun + F-02 preboot trước resetGame đầu + consumer node 7/8/10 + getRunModifiers (động)", () => {
    assert.match(game, /Upgrades2\.resetRun\(\)/);
    assert.match(game, /G\.runMods = \(window\.V2 && V2\.runMods\) \? V2\.runMods : null/);
    // F-02: thứ tự ở boot tail — preboot < resetGame() < boot()
    const tail = game.slice(game.lastIndexOf("window.WKDrawBossBar"));
    const iPre = tail.indexOf("V2.preboot("), iReset = tail.indexOf("\nresetGame();"), iBoot = tail.indexOf("V2.boot(");
    assert.ok(iPre >= 0 && iReset > iPre && iBoot > iReset, "preboot phải chạy trước resetGame() đầu tiên");
    assert.match(glue, /preboot: function \(\) \{[\s\S]{0,200}Meta\.getRunModifiers\(\)/);
    // Phụ lục A node 7/8: newShip đọc thornsDmg/pickupMul thay cho hardcode 0/1
    assert.match(game, /thorns: mods\.thornsDmg \|\| 0/);
    assert.match(game, /dropMul: mods\.pickupMul \|\| 1/);
    // Phụ lục A node 10: hurtShip có nhánh secondLife (hồi 1 HP + iframes 2, cờ 1 lần/run)
    assert.match(game, /secondLife && !s\._secondLifeUsed/);
    assert.match(game, /s\._secondLifeUsed = true; s\.hp = 1; s\.iframes = 2;/);
    // Động: getRunModifiers đọc trạng thái mua hiện hữu (không migration) — meta.js
    // tự fallback RAM khi thiếu localStorage (Node), đủ để test hành vi modifiers.
    const Meta = require(path.join(ROOT, "js", "meta.js"));
    Meta.addShards(5000);
    Meta.check("waveClear", { wave: 10, difficulty: "normal", windowDamagePx: 1 }); // mở khóa bestWave cho node 6/7/9
    Meta.check("bossKill", {}); // mở khóa node 10
    assert.equal(Meta.buyNode(6).ok, true); assert.equal(Meta.buyNode(6).ok, true);
    assert.equal(Meta.buyNode(7).ok, true); assert.equal(Meta.buyNode(7).ok, true);
    assert.equal(Meta.buyNode(8).ok, true); assert.equal(Meta.buyNode(8).ok, true);
    assert.equal(Meta.buyNode(9).ok, true);
    assert.equal(Meta.buyNode(10).ok, true);
    const mods = Meta.getRunModifiers();
    assert.equal(mods.waveRepairPx, 80);
    assert.equal(mods.thornsDmg, 4);
    assert.ok(Math.abs(mods.pickupMul - 1.3) < 1e-9);
    assert.equal(mods.freeUpgrade, true);
    assert.equal(mods.secondLife, true);
  });

  it("S6: v2glue.js onStageBossDead gọi unlockBossStage", () => {
    assert.match(glue, /onStageBossDead: function \(b\) \{[\s\S]*?Upgrades2\.unlockBossStage\(self\.stageId\)/);
    assert.equal(count(glue, /Upgrades2\.unlockBossStage\(/g), 1);
  });

  it("S7: game.js render vẽ Mắt Cú (owlTargets) SAU V2.drawOver (sau lớp blackout)", () => {
    const iDraw = game.indexOf("V2.drawOver(ctx, W, H)");
    const iOwl = game.indexOf("Upgrades2.owlTargets");
    assert.ok(iDraw >= 0 && iOwl > iDraw, "owlTargets phải nằm sau drawOver trong render()");
    assert.match(game, /s\.owlEye && window\.StageFX && StageFX\.isDark\(\)/);
  });
});
