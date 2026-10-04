/* WINDOWKILL — Boss VỠ KÍNH (Shatter) rework tests (node:test).
 * CEO 2026-10-04: mảnh boss cũ "vô dụng, vô hại" (cắn 8px/3s, bất tử hp 9999,
 * đóng tay bị phạt đẻ mini-boss). Rework: mảnh kính DESTRUCTIBLE vỡ ra từ viền,
 * vòng đời drift → telegraph → dive → bite (26px, tiêu hao), bắn vỡ +5 gem,
 * bắt tay +3 gem, không phạt.
 * Chạy: node --test tests/boss-fragment.test.js
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const gameSrc = fs.readFileSync(path.join(ROOT, "js", "game.js"), "utf8");
const i18nSrc = fs.readFileSync(path.join(ROOT, "js", "i18n.js"), "utf8");
const EMOJI_RE = new RegExp("[\\u{1F300}-\\u{1FAFF}\\u{2600}-\\u{27BF}]", "u");

/* ---- load FRAG + fragStep (pure logic, không phụ thuộc browser) ---- */
function loadFragLogic() {
  const a = gameSrc.indexOf("/* ---- FRAG-LOGIC-START ---- */");
  const b = gameSrc.indexOf("/* ---- FRAG-LOGIC-END ---- */", a);
  assert.ok(a !== -1 && b !== -1, "không tìm thấy FRAG-LOGIC markers trong js/game.js");
  const snippet = gameSrc.slice(a, b);
  const sb = { Math, console };
  vm.createContext(sb);
  vm.runInContext(snippet, sb, { filename: "frag-logic-snippet" });
  return {
    FRAG: vm.runInContext("FRAG", sb),
    fragStep: vm.runInContext("fragStep", sb),
  };
}
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

const { FRAG, fragStep } = loadFragLogic();
const dict = loadDict();
const B = { x: 0, y: 0, w: 1000, h: 700 };
const mkSat = (x, y) => ({ fphase: "drift", phaseT: FRAG.DRIFT_T, x, y, sw: 230, sh: 143, vx: 50, vy: 30, tx: 0, ty: 0, tedge: null });

describe("boss vỡ kính — FRAG config (số design đã chốt)", () => {
  it("đủ 8 hằng số, đúng giá trị rework", () => {
    // so qua JSON vì FRAG từ vm context khác (prototype khác realm)
    assert.equal(
      JSON.stringify(FRAG),
      JSON.stringify({ COUNT: 3, HP: 4, BITE: 26, DRIFT_T: 2.5, TELE_T: 0.9, DIVE_V: 420, GEMS_BREAK: 5, GEMS_CATCH: 3 })
    );
  });
  it("mảnh DESTRUCTIBLE: HP nhỏ (4), không còn bất tử 9999", () => {
    assert.ok(FRAG.HP > 0 && FRAG.HP <= 6, "HP mảnh phải nhỏ để bắn vỡ được, nhận: " + FRAG.HP);
    assert.ok(!gameSrc.includes('hp: 9999, color: "#c084fc"'), "code cũ hp:9999 phải bị xóa");
  });
  it("cắn 26px — đủ để cảm nhận, không brutal", () => {
    assert.ok(FRAG.BITE >= 20 && FRAG.BITE <= 40, "BITE ngoài khoảng công bằng: " + FRAG.BITE);
    assert.ok(gameSrc.includes("shrinkWindow(FRAG.BITE, 0)"), "fragmentBite phải dùng FRAG.BITE");
  });
});

describe("boss vỡ kính — fragStep state machine", () => {
  it("drift 2.5s → telegraph, chọn viền GẦN NHẤT", () => {
    const s = mkSat(100, 350); // cx=215 → gần viền trái nhất
    s.vx = 0; s.vy = 0; // đứng yên để vị trí không đổi trong lúc drift
    let evs = [];
    for (let t = 0; t < 2.6; t += 0.1) {
      for (const e of fragStep(s, 0.1, B)) evs.push(e);
    }
    assert.equal(s.fphase, "telegraph");
    assert.equal(s.tedge, "left");
    assert.equal(s.tx, 0);
    assert.ok(evs.some((e) => e.type === "telegraph"), "phải emit event telegraph");
  });
  it("chọn đúng viền gần nhất cho cả 4 viền", () => {
    const cases = [
      [100, 350, "left"], [900, 350, "right"], [500, 60, "top"], [500, 640, "bottom"],
    ];
    for (const [x, y, edge] of cases) {
      const s = mkSat(x, y);
      s.vx = 0; s.vy = 0; s.phaseT = 0.05; // đứng yên, chuyển phase ngay
      fragStep(s, 0.1, B);
      assert.equal(s.tedge, edge, `(${x},${y}) phải chọn viền ${edge}, nhận ${s.tedge}`);
    }
  });
  it("telegraph 0.9s → dive, vận tốc 420px/s hướng về viền", () => {
    const s = mkSat(100, 350); // cx=215 → viền trái gần nhất
    s.vx = 0; s.vy = 0; // đứng yên để giữ nguyên mục tiêu
    for (let t = 0; t < 2.6; t += 0.1) fragStep(s, 0.1, B);
    assert.equal(s.tedge, "left");
    let diveSeen = false;
    for (let t = 0; t < 1.0; t += 0.1) {
      if (fragStep(s, 0.1, B).some((e) => e.type === "dive")) diveSeen = true;
    }
    assert.equal(s.fphase, "dive");
    const sp = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
    assert.ok(Math.abs(sp - 420) < 1, "tốc độ dive phải = 420, nhận: " + sp);
    assert.ok(s.vx < 0, "dive viền trái thì vx âm");
    assert.ok(diveSeen, "phải emit event dive khi chuyển phase");
  });
  it("dive chạm viền → emit bite 1 lần (mảnh tiêu hao, không cắn liên tục)", () => {
    const s = mkSat(60, 350);
    s.fphase = "dive"; s.tedge = "left"; s.tx = 0; s.ty = 350; s.vx = -420; s.vy = 0;
    let bite = null;
    for (let i = 0; i < 40 && !bite; i++) {
      const evs = fragStep(s, 0.05, B);
      bite = evs.find((e) => e.type === "bite") || null;
    }
    assert.ok(bite, "dive phải kết thúc bằng bite");
    assert.equal(bite.edge, "left");
  });
  it("REGRESSION: drift nảy tường KHÔNG cắn (mảnh cũ cắn mỗi lần chạm viền)", () => {
    const s = mkSat(30, 350); // sát viền trái, sẽ nảy liên tục
    s.vx = -200;
    let biteCount = 0;
    for (let t = 0; t < 2.4; t += 0.05) {
      const evs = fragStep(s, 0.05, B);
      biteCount += evs.filter((e) => e.type === "bite").length;
      assert.equal(s.fphase, "drift", "chưa hết 2.5s phải còn drift");
    }
    assert.equal(biteCount, 0, "drift không được emit bite");
  });
});

describe("boss vỡ kính — code cũ đã xóa sạch", () => {
  it("không còn pool HP chung (onDamage redirect)", () => {
    assert.ok(!gameSrc.includes("onDamage: (n) => hurtBoss(n)"), "onDamage redirect phải bị xóa");
  });
  it("không còn phạt đóng tay đẻ mini-boss", () => {
    assert.ok(!gameSrc.includes("mảnh nhập vào arena thành mini-boss"), "comment phạt cũ phải bị xóa");
    const i = gameSrc.indexOf("function bossSplitCheck(bs)");
    const j = gameSrc.indexOf("function fragmentBite", i);
    const fn = gameSrc.slice(i, j);
    assert.ok(!fn.includes('spawnEnemyAt("chaser"'), "bossSplitCheck không được đẻ chaser");
    assert.ok(!fn.includes("hpShare"), "không còn hpShare/pool chung");
  });
  it("không còn cắn 8px", () => {
    assert.ok(!gameSrc.includes("shrinkWindow(8, 0)"), "cắn 8px cũ phải bị xóa");
  });
});

/* ---------- QA runtime: boot game thật trong vm, lái vòng đời mảnh ---------- */
function chainable() {
  const fn = function () {};
  return new Proxy(fn, {
    get: (t, p) => {
      if (p === Symbol.toPrimitive) return () => 0;
      if (p === "then") return undefined;
      return (...a) => chainable();
    },
    set: () => true,
  });
}
function mkEl() {
  const noop = () => {};
  return {
    style: {}, dataset: {},
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    addEventListener: noop, removeEventListener: noop, appendChild: noop, remove: noop,
    getContext: () => chainable(), width: 980, height: 700,
    textContent: "", innerHTML: "", onclick: null, onload: null,
    querySelector: () => null, querySelectorAll: () => [],
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 980, height: 700 }),
    play: () => Promise.resolve(), pause: noop, load: noop,
  };
}
function buildSandbox() {
  const noop = () => {};
  let rafCb = null;
  const simNow = { value: 0 };
  const sandbox = {
    console, Math, JSON, Object, Array, String, Number, Boolean, Date, RegExp, Error,
    TypeError, ReferenceError, SyntaxError, RangeError, Promise, Map, Set, WeakMap,
    parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent,
    setTimeout: () => 0, clearTimeout: noop, setInterval: () => 0, clearInterval: noop,
    requestAnimationFrame: (cb) => { rafCb = cb; return 1; },
    cancelAnimationFrame: noop,
    performance: { now: () => simNow.value },
    URLSearchParams, URL, Blob,
    navigator: { userAgent: "node-test", sendBeacon: noop },
    location: { search: "?diff=chill&music=1&sfx=1&shake=1&fx=full&sat=auto&tut=0", href: "http://x/game.html" },
    localStorage: { _s: {}, getItem(k) { return this._s[k] ?? null; }, setItem(k, v) { this._s[k] = String(v); }, removeItem(k) { delete this._s[k]; } },
    sessionStorage: { _s: {}, getItem(k) { return this._s[k] ?? null; }, setItem(k, v) { this._s[k] = String(v); }, removeItem(k) { delete this._s[k]; } },
    innerWidth: 980, innerHeight: 700, outerWidth: 980, outerHeight: 700,
    screenX: 0, screenY: 0, devicePixelRatio: 1, screen: { availWidth: 1920, availHeight: 1080 },
    addEventListener: noop, removeEventListener: noop,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.document = {
    getElementById: () => mkEl(), querySelector: () => mkEl(), querySelectorAll: () => [],
    createElement: () => mkEl(), addEventListener: noop, removeEventListener: noop,
    hidden: false, readyState: "complete", documentElement: mkEl(), body: mkEl(), title: "",
  };
  vm.createContext(sandbox);
  return { sandbox, simNow, getRaf: () => rafCb, clearRaf: () => { rafCb = null; } };
}
const QA_SCRIPTS = ["js/portal.js", "js/pwa.js", "js/analytics.js", "js/i18n.js", "js/audio.js",
  "js/bgm.js", "js/bg.js", "js/juice.js", "js/cinema.js", "js/tuning.js", "js/campaign.js", "js/monsters.js",
  "js/bosses.js", "js/stagefx.js", "js/tutorial.js", "js/meta.js", "js/juice2.js", "js/sfx2.js",
  "js/upgrades2.js", "js/v2glue.js", "js/game.js", "js/mobile.js"];
function bootGameWithFragHook() {
  const { sandbox, simNow, getRaf, clearRaf } = buildSandbox();
  for (const f of QA_SCRIPTS) {
    let src = fs.readFileSync(path.join(ROOT, f), "utf8");
    if (f === "js/game.js") {
      const anchor = "requestAnimationFrame(loop);\n})();";
      assert.ok(src.includes(anchor), "không tìm thấy anchor cuối game.js để gắn hook QA");
      src = src.replace(anchor,
        "requestAnimationFrame(loop);\nwindow.__fragQA = { FRAG, fragStep, bossSplitCheck, updateFragments, fragmentBite,\n" +
        "  G: function() { return G; },\n" +
        "  frags: function() { return SatManager.list().filter(function(s){ return s.role === 'fragment'; }); },\n" +
        "  damage: function(id, x, y) { return SatManager.damage(id, x, y); },\n" +
        "  kill: function(id, m) { return SatManager.kill(id, m); } };\n})();");
    }
    vm.runInContext(src, sandbox, { filename: f });
  }
  assert.ok(sandbox.__fragQA, "hook __fragQA chưa được gắn");
  return { sandbox, simNow, getRaf, clearRaf };
}
const qaRun = (sandbox, code) => vm.runInContext(code, sandbox);

describe("boss vỡ kính — QA runtime (game thật trong vm)", () => {
  it("phase 2 spawn đúng 3 mảnh kính destructible (hp 4, phase drift)", () => {
    const { sandbox } = bootGameWithFragHook();
    const st = qaRun(sandbox, `(function(){
      const G = __fragQA.G();
      G.boss = { hp: 60, maxHp: 100, dead: false, split: false };
      __fragQA.bossSplitCheck(G.boss);
      return __fragQA.frags().map(function(s){ return { id: s.id, hp: s.hp, maxHp: s.maxHp, fphase: s.fphase, sim: s.sim }; });
    })()`);
    assert.equal(st.length, 3, "phải spawn 3 mảnh, nhận: " + st.length);
    for (const f of st) {
      assert.equal(f.hp, 4, "mảnh phải có hp 4 (destructible)");
      assert.equal(f.maxHp, 4);
      assert.equal(f.fphase, "drift");
      assert.ok(f.sim, "trong test phải là sim mode");
    }
  });
  it("bắn vỡ mảnh (4 click) → +5 gem, không trừ HP boss", () => {
    const { sandbox } = bootGameWithFragHook();
    const r = qaRun(sandbox, `(function(){
      const G = __fragQA.G();
      G.boss = { hp: 60, maxHp: 100, dead: false, split: false };
      __fragQA.bossSplitCheck(G.boss);
      const s = __fragQA.frags()[0];
      const gemsBefore = G.gems.length, bossHpBefore = G.boss.hp;
      for (let i = 0; i < 4; i++) __fragQA.damage(s.id);
      return { dead: s.dead, gems: G.gems.length - gemsBefore, bossHp: G.boss.hp, bossHpBefore };
    })()`);
    assert.ok(r.dead, "4 click phải phá được mảnh");
    assert.equal(r.gems, 5, "bắn vỡ phải rớt 5 gem");
    assert.equal(r.bossHp, r.bossHpBefore, "bắn mảnh KHÔNG trừ HP boss (bỏ pool chung)");
  });
  it("đóng tay mảnh = bắt mảnh: +3 gem, KHÔNG đẻ mini-boss (regression phạt cũ)", () => {
    const { sandbox } = bootGameWithFragHook();
    const r = qaRun(sandbox, `(function(){
      const G = __fragQA.G();
      G.boss = { hp: 60, maxHp: 100, dead: false, split: false };
      __fragQA.bossSplitCheck(G.boss);
      const s = __fragQA.frags()[0];
      const gemsBefore = G.gems.length, enemiesBefore = G.enemies.length;
      __fragQA.kill(s.id, "manual");
      return { dead: s.dead, gems: G.gems.length - gemsBefore, enemies: G.enemies.length - enemiesBefore };
    })()`);
    assert.ok(r.dead);
    assert.equal(r.gems, 3, "bắt tay phải +3 gem");
    assert.equal(r.enemies, 0, "KHÔNG được đẻ chaser mini-boss như code cũ");
  });
  it("dive chạm viền → cắn 26px + vết rạn + mảnh tiêu hao", () => {
    const { sandbox } = bootGameWithFragHook();
    qaRun(sandbox, `(function(){
      const G = __fragQA.G();
      G.boss = { hp: 60, maxHp: 100, dead: false, split: false };
      __fragQA.bossSplitCheck(G.boss);
      const s = __fragQA.frags()[0];
      s.fphase = "dive"; s.tedge = "left"; s.tx = 0; s.ty = 350;
      s.x = 60; s.y = 350 - s.sh / 2; s.vx = -420; s.vy = 0; // cx=175, cách viền 175px
      window.__dmg0 = G.windowDamagePx || 0;
      window.__cracks0 = (G.cracks || []).length;
    })()`);
    for (let i = 0; i < 40; i++) qaRun(sandbox, "__fragQA.updateFragments(0.05)");
    const r = qaRun(sandbox, `({
      dmg: __fragQA.G().windowDamagePx - window.__dmg0,
      cracks: __fragQA.G().cracks.length - window.__cracks0,
      live: __fragQA.frags().filter(function(s){ return !s.dead; }).length
    })`);
    assert.equal(r.dmg, 26, "cắn phải gây đúng 26px window damage");
    assert.equal(r.cracks, 1, "phải để lại 1 vết rạn");
    assert.equal(r.live, 2, "mảnh đã cắn phải tiêu hao (chỉ còn 2 mảnh live)");
  });
  it("vòng đời đầy đủ drift→telegraph→dive→bite qua updateFragments thật", () => {
    const { sandbox } = bootGameWithFragHook();
    qaRun(sandbox, `(function(){
      const G = __fragQA.G();
      G.boss = { hp: 60, maxHp: 100, dead: false, split: false };
      __fragQA.bossSplitCheck(G.boss);
      const frags = __fragQA.frags();
      // giết 2 mảnh kia để chỉ còn 1 mảnh cho vòng đời đầy đủ
      for (let i = 1; i < 3; i++) for (let k = 0; k < 4; k++) __fragQA.damage(frags[i].id);
      const s = frags[0];
      s.x = 400; s.y = 300; s.vx = 0; s.vy = 0; // đứng yên giữa arena
      window.__dmg0 = G.windowDamagePx || 0;
    })()`);
    // đọc phase trực tiếp qua frags() mỗi step
    let phases = new Set();
    for (let i = 0; i < 400; i++) {
      qaRun(sandbox, "__fragQA.updateFragments(0.05)");
      const ph = qaRun(sandbox, `(function(){
        const live = __fragQA.frags().filter(function(s){ return !s.dead; });
        return live.length ? live[0].fphase : 'gone';
      })()`);
      phases.add(ph);
      if (ph === "gone") break;
    }
    assert.ok(phases.has("drift"), "phải qua drift, thấy: " + [...phases]);
    assert.ok(phases.has("telegraph"), "phải qua telegraph, thấy: " + [...phases]);
    assert.ok(phases.has("dive"), "phải qua dive, thấy: " + [...phases]);
    assert.ok(phases.has("gone"), "mảnh phải tiêu hao sau bite, thấy: " + [...phases]);
    const dmg = qaRun(sandbox, "__fragQA.G().windowDamagePx - window.__dmg0");
    assert.equal(dmg, 26, "full lifecycle phải gây đúng 26px damage");
  });
});
describe("boss vỡ kính — i18n VI+EN", () => {
  const keys = ["sat.bossfrag_label", "sat.bossfrag_spawn", "sat.bossfrag_bite", "sat.bossfrag_break", "sat.bossfrag_catch"];
  it("đủ 5 key, VI+EN không rỗng, không emoji", () => {
    for (const k of keys) {
      for (const lang of ["vi", "en"]) {
        const v = dict[lang][k];
        assert.ok(typeof v === "string" && v.length > 0, `${lang}.${k} thiếu hoặc rỗng`);
        assert.ok(!EMOJI_RE.test(v), `${lang}.${k} chứa emoji: ${v}`);
      }
    }
  });
  it("key cũ bossfrag_enter đã xóa (không còn nhập arena)", () => {
    assert.equal(dict.vi["sat.bossfrag_enter"], undefined);
    assert.equal(dict.en["sat.bossfrag_enter"], undefined);
  });
  it("banner mới nói rõ counterplay (bắn vỡ trước khi đâm viền)", () => {
    assert.match(dict.vi["sat.bossfrag_spawn"], /Bắn vỡ mảnh kính/);
    assert.match(dict.en["sat.bossfrag_spawn"], /Break the glass shards/);
  });
});
