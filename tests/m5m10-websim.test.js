/* WINDOWKILL — regression test cho simulation M5–M10 trên web (node:test, không cần browser).
 *
 * BỐI CẢNH: CEO quyết định KHÔNG gate chain-popup M5–M10 — mở simulation ngay trên web.
 * File này dựng cả 3 module (00-head, 04-satellite, 05-chainpopups) trong vm với stub
 * browser tối thiểu (SAT_MODE=sim như web thật) rồi chạy full vòng đời từng mechanic.
 *
 * LỖI ĐÃ SỬA (2026-10-06, nhánh ws/m5m10-websim):
 *  1. Quota 3 sat đếm cả sat ĐÃ CHẾT (còn nằm trong map 350ms chờ hiệu ứng vỡ):
 *     - M6: giant bị phá khi drone khiên còn sống → chỉ tách 1 minion thay vì 2.
 *     - M7: lovers merge khi còn sat khác → superlove request null, mất siêu-popup.
 *     Fix (04-satellite.js): request() chỉ đếm sat còn sống.
 *  2. M9/M10 sim: vùng hiệu lực (gương 85px / hố đen 240px) tàng hình trên web vì
 *     drawSatFields() bỏ qua sat sim → player không thấy để né/đừng bắn vào.
 *     Fix (04-satellite.js): drawSims() vẽ vòng đứt nét mờ quanh khung giả.
 *  3. M9 sim: quái/gem lọt đúng tâm hố đen (d ≤ 1) kẹt vĩnh viễn vì nhánh hút nằm
 *     trong `if (d > 1)` — không bao giờ bị nuốt.
 *     Fix (05-chainpopups.js): đưa check nuốt (d < 26) ra ngoài, hút chỉ khi d ≥ 26.
 *  4. M9 sim: nuốt đủ 3 con → spitVacuum() chạy NGAY trong vòng lặp đang iterate
 *     G.enemies → quái vừa nhả bị nuốt lại cùng frame; xấu nhất spit lồng nhau
 *     vô hạn treo game. Fix (05-chainpopups.js): gom cờ needSpit, nhả sau vòng lặp.
 *
 * Chạy: node --test tests/m5m10-websim.test.js
 */
"use strict";

const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");

/* ---------- harness: thế giới giả lập tối thiểu cho 3 module ---------- */
function makeWorld() {
  const calls = { floats: [], bursts: [], banners: [], sfx: [], ctx: [] };
  const G = {
    ship: { x: 490, y: 360, r: 14, kbvx: 0, kbvy: 0 },
    enemies: [], gems: [], ebullets: [], pickups: [], cracks: [],
    phase: "play", shake: 0, score: 0,
  };
  const gradStub = () => ({ addColorStop() {} });
  const ctxStub = new Proxy({}, {
    get(t, p) {
      if (p === "createLinearGradient" || p === "createRadialGradient") return gradStub;
      if (p === "measureText") return () => ({ width: 0 });
      if (typeof p === "string") return (...a) => { if (calls.ctx.length < 4000) calls.ctx.push([p, a]); };
      return undefined;
    },
    set() { return true; },
  });
  const canvasStub = { width: 0, height: 0, getContext: () => ctxStub, addEventListener() {}, style: {} };
  const elStub = () => ({ style: {}, addEventListener() {}, onclick: null, textContent: "" });
  const sb = {
    console,
    performance,
    setTimeout: (...a) => setTimeout(...a),
    clearTimeout: (...a) => clearTimeout(...a),
    URLSearchParams,
    navigator: { userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0" },
    location: { search: "" },
    window: {
      screenX: 0, screenY: 0, innerWidth: 980, innerHeight: 720,
      outerWidth: 980, outerHeight: 720, devicePixelRatio: 1,
      screen: { availWidth: 1920, availHeight: 1080 },
      addEventListener() {},
    },
    document: {
      hidden: false,
      getElementById: (id) => (id === "game-canvas" ? canvasStub : elStub()),
      createElement: () => elStub(),
      querySelectorAll: () => [],
      addEventListener() {},
    },
    localStorage: { _m: {}, getItem(k) { return this._m[k] ?? null; }, setItem(k, v) { this._m[k] = String(v); } },
    AudioEngine: { setSettings() {}, sfx: new Proxy({}, { get: (t, p) => () => { calls.sfx.push(p); } }) },
    I18N: { t: (k) => k },
    HUDIcons: { draw() {} },
    G,
    arena: null,
    winCtrl: { ok: false },
    MONSTER_REGISTRY: {
      mini: { score: 8, xp: 1 }, chaser: { score: 10, xp: 1 }, tank: { score: 50, xp: 4 },
      dasher: { score: 20, xp: 2 }, chewer: { score: 25, xp: 2 },
    },
    bounds: () => ({ x: 0, y: 0, w: 980, h: 720 }),
    spawnEnemyAt: (type, x, y) => {
      const e = { type, x, y, r: 12, speed: 100, dmg: 1, hp: 10, dead: false };
      G.enemies.push(e); return e;
    },
    spawnEnemy: (type) => {
      const e = { type, x: 10, y: 10, r: 12, speed: 100, dmg: 1, hp: 10, dead: false };
      G.enemies.push(e); return e;
    },
    edgeSpawn: () => ({ x: 0, y: 0 }),
    nearestEdgePoint: (x, y) => ({ x, y }),
    addFloat: (x, y, txt) => { calls.floats.push(txt); },
    burst: (x, y, n) => { calls.bursts.push(n); },
    setBanner: (t) => { calls.banners.push(t); },
    hurtShip: () => {},
    damageEnemy: (e, dmg) => { e.hp = (e.hp ?? 10) - dmg; if (e.hp <= 0) e.dead = true; },
    jxShake: () => {},
    windowJitter: () => {},
    shrinkWindow: () => {},
    actOf: (w) => (w <= 10 ? 1 : w <= 20 ? 2 : 3),
    calls,
  };
  const c = vm.createContext(sb);
  for (const f of ["js/game/00-head.js", "js/game/04-satellite.js", "js/game/05-chainpopups.js"]) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), c, { filename: f });
  }
  return { ctx: c, G, calls, run: (expr) => vm.runInContext(expr, c) };
}

let W;
beforeEach(() => { W = makeWorld(); });

const live = (role) => W.run(`SatManager.list().filter(s => s.role === "${role}" && !s.dead)`);
const dmgTimes = (id, n) => { for (let i = 0; i < n; i++) W.run(`SatManager.damage("${id}")`); };

describe("m5m10-websim: môi trường giả lập", () => {
  it("web (non-Electron) luôn chạy SAT_MODE=sim", () => {
    assert.equal(W.run("SAT_MODE"), "sim");
  });

  it("mọi sat M5–M10 spawn ra đều là khung giả (sim), có vị trí hữu hạn", () => {
    for (const batch of [["bomb", "giant", "mother"], ["lover", "mirror", "blackhole"]]) {
      for (const role of batch) {
        const s = W.run(`SatManager.request("${role}", { hp: 6, color: "#ffffff", label: "${role}", w: 200, h: 140 })`);
        assert.ok(s, `${role}: request không được null`);
      }
      const all = W.run("SatManager.list()");
      assert.ok(all.every((s) => s.sim === true), "tất cả phải là sim trên web");
      assert.ok(all.every((s) => Number.isFinite(s.x) && Number.isFinite(s.y)), "vị trí phải hữu hạn");
      W.run("SatManager.closeAll()");
    }
  });
});

describe("m5m10-websim: M8 Quả Bom Cười", () => {
  it("hết fuse 15s → nổ: mỗi quả nhả 5–6 mini + hất tàu, không crash", () => {
    W.run("maybeTriggerBomb(8)");
    assert.equal(live("bomb").length, 2);
    assert.ok(live("bomb").every((s) => s.fuseT === 15));
    W.run("updateBombs(15.5)");
    assert.equal(live("bomb").length, 0, "nổ xong phải chết");
    const minis = W.G.enemies.filter((e) => e.type === "mini").length;
    assert.ok(minis >= 10 && minis <= 12, `2 quả nổ phải nhả 10–12 mini, được ${minis}`);
    assert.ok(Math.abs(W.G.ship.kbvx) + Math.abs(W.G.ship.kbvy) > 0, "tàu phải bị hất văng");
  });

  it("click phá kịp (8 dmg) → +2 gem +500 điểm", () => {
    W.run("maybeTriggerBomb(9)");
    const id = live("bomb")[0].id;
    dmgTimes(id, 8);
    assert.equal(W.run(`SatManager.list().find(s => s.id === "${id}").dead`), true, "quả bị click 8 lần phải chết");
    assert.equal(W.G.gems.length, 2);
    assert.equal(W.G.score, 500);
  });
});

describe("m5m10-websim: M6 Một Thành Hai", () => {
  it("giant bị phá khi còn sat khác sống → vẫn tách đủ 2 minion (quota không đếm xác)", () => {
    W.run(`SatManager.request("shield", { hp: 999, color: "#38bdf8", label: "shield", w: 260, h: 200 })`);
    W.run("maybeTriggerGiant(11)");
    assert.equal(live("giant").length, 1);
    dmgTimes(live("giant")[0].id, 8);
    assert.equal(live("minion").length, 2, "phải tách đúng 2 nhóc kể cả khi drone khiên còn sống");
    for (const m of live("minion")) {
      assert.ok(Number.isFinite(m.x) && Number.isFinite(m.vx), "minion phải có vị trí/vận tốc hữu hạn");
    }
  });

  it("minion sống → mỗi 4s nhả 1 mini, tối đa 6", () => {
    W.run("maybeTriggerGiant(11)");
    dmgTimes(live("giant")[0].id, 8);
    W.run("updateMinions(4.1)");
    assert.equal(W.G.enemies.filter((e) => e.type === "mini").length, 2, "2 minion mỗi con nhả 1 mini");
    W.run("updateMinions(30)");
    assert.ok(W.G.enemies.filter((e) => e.type === "mini").length <= 12, "mỗi minion tối đa 6 mini");
  });
});

describe("m5m10-websim: M5 Mẹ Gà Đẻ Trứng", () => {
  it("mẹ đẻ con sau 3s, con nhả mini, tối đa 2 con", () => {
    W.run("maybeTriggerMother(10)");
    assert.equal(live("mother").length, 1);
    W.run("updateMothers(3.1)");
    assert.equal(live("chick").length, 1);
    W.run("updateChicks(2.1)");
    assert.equal(W.G.enemies.filter((e) => e.type === "mini").length, 1, "con nhả mini sau ~2s");
    W.run("updateMothers(20)");
    assert.equal(live("chick").length, 2, "mẹ chỉ giữ tối đa 2 con");
  });
});

describe("m5m10-websim: M7 Tình Yêu Sét Đánh", () => {
  it("2 lovers trôi về nhau → merge thành superlove kể cả khi còn sat khác (quota không đếm xác)", () => {
    W.run("maybeTriggerLove(12)");
    assert.equal(live("lover").length, 2);
    W.run(`SatManager.request("shield", { hp: 999, color: "#38bdf8", label: "shield", w: 260, h: 200 })`);
    W.run(`(() => { const ls = SatManager.list().filter(s => s.role === "lover");
      ls[0].x = 100; ls[0].y = 100; ls[1].x = 140; ls[1].y = 100; })()`);
    W.run("updateLovers(0.016)");
    assert.equal(live("lover").length, 0, "lovers đã merge phải chết");
    assert.equal(live("superlove").length, 1, "phải có superlove kể cả khi drone khiên còn sống");
  });

  it("superlove mỗi 5s bắn 1 trái tim độc vào tàu", () => {
    W.run("maybeTriggerLove(12)");
    W.run(`(() => { const ls = SatManager.list().filter(s => s.role === "lover");
      ls[0].x = 100; ls[0].y = 100; ls[1].x = 140; ls[1].y = 100; })()`);
    W.run("updateLovers(0.016)");
    W.run("updateSuperlove(5.1)");
    assert.ok(W.G.ebullets.length >= 1, "superlove phải bắn tim độc");
  });
});

describe("m5m10-websim: M10 Gương Thần", () => {
  it("đạn bay vào vùng 85px → phản thành đạn địch; ngoài vùng → không", () => {
    W.run("maybeTriggerMirror(10)");
    assert.equal(live("mirror").length, 1);
    W.run("updateMirrors(0.016)"); // cache anchor
    const r = W.run(`(() => {
      const m = SatManager.list().find(s => s.role === "mirror");
      const inside = mirrorReflect({ x: m._mx, y: m._my, vx: 100, vy: 0, r: 5 });
      const outside = mirrorReflect({ x: m._mx + 500, y: m._my, vx: 100, vy: 0, r: 5 });
      return { inside, outside, n: G.ebullets.length, rvx: G.ebullets[0] && G.ebullets[0].vx };
    })()`);
    assert.equal(r.inside, true);
    assert.equal(r.outside, false);
    assert.equal(r.n, 1, "chỉ 1 viên phản");
    assert.equal(r.rvx, -100, "đạn phản phải đảo chiều vx");
  });
});

describe("m5m10-websim: M9 Máy Hút Bụi", () => {
  it("quái lọt đúng tâm (d ≤ 1) vẫn bị nuốt — không kẹt vĩnh viễn", () => {
    W.run("maybeTriggerVacuum(21)");
    assert.equal(live("blackhole").length, 1);
    W.run(`(() => { const v = SatManager.list().find(s => s.role === "blackhole");
      const cx = v.x + v.sw / 2, cy = v.y + v.sh / 2;
      G.enemies.push({ type: "chaser", x: cx, y: cy, r: 12, speed: 100, dmg: 1, hp: 10, dead: false });
    })()`);
    W.run("updateBlackholes(0.05)");
    assert.equal(W.G.enemies.filter((e) => e.dead).length, 1, "quái ở đúng tâm phải bị nuốt");
  });

  it("nuốt đủ 3 con → nhả ra giận dữ (nhanh x1.6)", () => {
    W.run("maybeTriggerVacuum(21)");
    W.run(`(() => { const v = SatManager.list().find(s => s.role === "blackhole");
      const cx = v.x + v.sw / 2, cy = v.y + v.sh / 2;
      for (let i = 0; i < 3; i++)
        G.enemies.push({ type: "chaser", x: cx + 10, y: cy, r: 12, speed: 100, dmg: 1, hp: 10, dead: false });
    })()`);
    W.run("updateBlackholes(0.05)");
    const out = W.G.enemies.filter((e) => !e.dead);
    assert.equal(out.length, 3, "nhả ra đủ 3 con");
    assert.ok(out.every((e) => e.speed === 160), "quái nhả ra phải nhanh x1.6");
  });

  it("gem ở độ khó thường bị hất văng, không mất vĩnh viễn", () => {
    W.run("maybeTriggerVacuum(21)");
    W.run(`(() => { const v = SatManager.list().find(s => s.role === "blackhole");
      G.gems.push({ x: v.x + v.sw / 2, y: v.y + v.sh / 2, vx: 0, vy: 0, v: 1, t: 0 });
    })()`);
    W.run("updateBlackholes(0.05)");
    assert.equal(W.G.gems.length, 1, "gem không được mất ở Chill/Thường");
    assert.ok(Math.abs(W.G.gems[0].vx) > 300, "gem phải bị hất văng ra ngoài");
  });
});

describe("m5m10-websim: vẽ + click khung giả", () => {
  it("drawSims vẽ được mọi role M5–M10 (+M3/M4) không throw", () => {
    const roles = [
      ["nest", "{}"], ["debris", "{ hp: 3 }"], ["bomb", "{ hp: 8 }"],
      ["giant", "{ hp: 8 }"], ["minion", "{ hp: 4, enraged: true }"],
      ["mother", "{ hp: 8 }"], ["chick", "{ hp: 4 }"], ["lover", "{ hp: 5 }"],
      ["superlove", "{ hp: 10 }"], ["mirror", "{ hp: 6 }"], ["blackhole", "{ hp: 8 }"],
      ["shield", "{ hp: 999 }"], ["fragment", "{ hp: 4 }"],
    ];
    for (const [role, extra] of roles) {
      W.run("SatManager.closeAll()");
      const s = W.run(`SatManager.request("${role}", Object.assign({ hp: 6, color: "#ffffff", label: "${role}", w: 200, h: 140 }, ${extra}))`);
      assert.ok(s, `${role}: request null`);
      W.run(`(() => { const s = SatManager.list()[0];
        if (s.role === "bomb") s.fuseT = 10;
        if (s.role === "chick") { s.hopPh = 1; s.enrageT = 5; }
        if (s.role === "lover") s.heartbroken = true;
        if (s.role === "debris") s.warnT = 0.5;
        if (s.role === "fragment") { s.fphase = "telegraph"; s.tedge = "left"; }
      })()`);
      assert.doesNotThrow(() => W.run("SatManager.drawSims()"), `${role}: drawSims không được throw`);
    }
  });

  it("vùng hiệu lực hiện trên web: gương vẽ vòng 85px, hố đen vẽ vòng 240px", () => {
    for (const [role, R] of [["mirror", 85], ["blackhole", 240]]) {
      W.run("SatManager.closeAll()");
      W.run(`SatManager.request("${role}", { hp: 6, color: "#ffffff", label: "${role}", w: 200, h: 140 })`);
      W.calls.ctx.length = 0;
      W.run("SatManager.drawSims()");
      const rings = W.calls.ctx.filter(([m, a]) => m === "arc" && a[2] === R);
      assert.ok(rings.length >= 1, `${role}: phải vẽ vòng zone ${R}px quanh khung giả`);
    }
  });

  it("hitSim: click trúng khung giả trừ 1 HP; click ngoài không trúng", () => {
    W.run(`SatManager.request("bomb", { hp: 8, color: "#ff5722", label: "bomb", w: 300, h: 220 })`);
    const r = W.run(`(() => { const s = SatManager.list()[0];
      const hit = SatManager.hitSim(s.x + s.sw / 2, s.y + s.sh / 2);
      const miss = SatManager.hitSim(-9999, -9999);
      return { hit, miss, hp: s.hp };
    })()`);
    assert.equal(r.hit, true);
    assert.equal(r.miss, false);
    assert.equal(r.hp, 7);
  });
});

describe("m5m10-websim: quota sat", () => {
  it("tối đa 3 sat sống; sat đã chết không chiếm quota", () => {
    const mk = () => W.run(`SatManager.request("bomb", { hp: 8, color: "#ff5722", label: "b", w: 200, h: 140 })`);
    const a = mk(), b = mk(), c = mk();
    assert.ok(a && b && c, "3 sat đầu phải spawn được");
    assert.equal(mk(), null, "sat thứ 4 phải bị chặn");
    W.run(`SatManager.kill("${a.id}", "killed")`); // dead nhưng còn trong map 350ms
    assert.ok(mk(), "sat đã chết không được chiếm quota");
  });
});
