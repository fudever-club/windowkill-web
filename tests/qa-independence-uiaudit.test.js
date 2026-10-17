/* WINDOWKILL — QA INDEPENDENT SUITE (agent-qa, Lauren Tan framework).
 *
 * Suite ĐỘC LẬP viết từ RFC `docs/RFC-ui-audit-boss-cleanup.md` (§7 acceptance),
 * KHÔNG copy từ test của agent-dev. Kiểm chứng:
 *  P1. Xóa campaign frame (tĩnh): 4 file xóa, 0 reference code, i18n sạch,
 *      v2glue/menu bỏ ?stage=/?daily=/?endless=, #v2-stages biến mất, Boss Rush mở.
 *  P2. Xóa boss glass-shard M2 (tĩnh): 06-bossfrag.js xóa, sat.bossfrag_* = 0,
 *      killBoss sạch, các thứ GIỮ (addCrack/M4, SHAPE_SHARD, ring-shatter...) còn.
 *  P3. UI P0/P1: 1 <footer>, không text thô svgIcon("i-grad"), 0 key i18n thô
 *      trong menu (quét data-i18n), nút mode flex.
 *  P4. Runtime (vm, không browser): boot bỏ qua ?stage=3 → endless, wave 1→30
 *      không exception, boss đúng wave 5/10/15, boss 66% HP không split,
 *      killBoss sạch, M4 addCrack còn hoạt động, G.themeSid random 1-5,
 *      hotfix #78 (quitToMenu + BGM.setVolume) còn nguyên.
 *
 * Ghi chú QA (không fail test, báo chief): không còn — các gap đã đóng trong
 * fix-round-final: P4.5A miniboss spawner (maybeSpawnMiniBoss wave 4/9/14/19/24);
 * P4.5B MobileAssist multipliers (mobileAssistActive + 3 điểm áp); F3 dọn
 * unlockBossStage/_bossBeaten/bossStage/makeMiniBoss/miniBossStats.
 *
 * Chạy: node --test tests/qa-independence-uiaudit.test.js
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const exists = (p) => fs.existsSync(path.join(ROOT, p));

/* ---- helper: tách block function bằng đếm ngoặc (độc lập, không copy dev) ---- */
function extractBlock(src, startIdx) {
  let i = startIdx;
  while (i < src.length && src[i] !== "{") i++;
  let depth = 0;
  const begin = i;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (depth === 0) return src.slice(startIdx, i + 1); }
  }
  throw new Error("brace mismatch");
}
/* ---- helper: xóa comment để grep code thật (RFC cho phép chữ 'campaign' trong comment) ---- */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:"'\\])\/\/.*$/gm, "$1");
}

/* =====================================================================
 * P1 — XÓA CAMPAIGN (tĩnh, RFC §7.1)
 * ===================================================================== */
describe("P1.1 campaign files đã xóa + không còn script tag", () => {
  const dead = ["js/campaign.js", "js/stagefx.js", "js/stageobj.js", "js/stagemech.js",
    "tests/campaign-logic.test.js", "tests/stage-mechanics.test.js"];
  for (const f of dead) {
    it(`${f} không tồn tại`, () => {
      assert.ok(!exists(f), `${f} vẫn còn trên đĩa`);
    });
  }
  it("index.html/game.html không còn script tag trỏ 4 file", () => {
    for (const h of ["index.html", "game.html"]) {
      const html = read(h);
      for (const f of ["campaign.js", "stagefx.js", "stageobj.js", "stagemech.js"]) {
        assert.ok(!html.includes(`src="js/${f}"`), `${h} còn script tag ${f}`);
      }
    }
  });
});

describe("P1.2 không còn reference code Campaign/Stage* (trừ comment)", () => {
  const files = ["js/menu.js", "js/v2glue.js", "index.html", "game.html"];
  const mods = fs.readdirSync(path.join(ROOT, "js/game"))
    .filter((f) => f.endsWith(".js")).map((f) => "js/game/" + f);
  const pats = [/\bCampaign\b/, /\bStageFX\b/, /\bStageObj\b/, /\bStageMech\b/,
    /\bstageWave\b/, /\bgetUnlockedStage\b/, /\bgetStageBest\b/, /\bgetWaveComp\b/,
    /\bgetRunParams\b/, /\bgetMinibossSpec\b/, /\bonBossKill\b.*[Cc]ampaign/];
  for (const f of files.concat(mods)) {
    it(`${f}: 0 reference code campaign/stage`, () => {
      const code = stripComments(read(f));
      for (const p of pats) assert.ok(!p.test(code), `${f} còn code match ${p}`);
    });
  }
  it("stageId chỉ còn ở v2glue.js dạng deprecated (= 0), không ở game/menu/HTML", () => {
    for (const f of ["js/menu.js", "index.html", "game.html"]
      .concat(fs.readdirSync(path.join(ROOT, "js/game")).filter((x) => x.endsWith(".js")).map((x) => "js/game/" + x))) {
      const code = stripComments(read(f));
      assert.ok(!/\bstageId\b/.test(code), `${f} còn dùng stageId`);
    }
    const v2 = stripComments(read("js/v2glue.js"));
    assert.ok(/stageId\s*:\s*0/.test(v2), "v2glue.js mất field stageId = 0 (deprecated)");
  });
});

describe("P1.3 i18n campaign.* / stageobj.* đã xóa", () => {
  it("js/i18n.js: 0 key campaign.* và stageobj.*", () => {
    const src = read("js/i18n.js");
    assert.equal((src.match(/"campaign\./g) || []).length, 0, "còn key campaign.*");
    assert.equal((src.match(/"stageobj\./g) || []).length, 0, "còn key stageobj.*");
    assert.equal((src.match(/'campaign\./g) || []).length, 0, "còn key campaign.* (quote đơn)");
  });
});

describe("P1.4 param ?stage=/?daily=/?endless= không còn được đọc", () => {
  it("v2glue.js: không q.get(\"stage\"/\"daily\"/\"endless\")", () => {
    const code = stripComments(read("js/v2glue.js"));
    for (const k of ["stage", "daily", "endless"])
      assert.ok(!code.includes(`q.get("${k}")`) && !code.includes(`q.get('${k}')`), `v2glue vẫn đọc ?${k}=`);
  });
  it("menu.js launchGame: không q.set(\"stage\"/\"daily\")", () => {
    const code = stripComments(read("js/menu.js"));
    assert.ok(!code.includes(`q.set("stage"`) && !code.includes(`q.set("daily"`), "menu còn set ?stage=/?daily=");
    assert.ok(code.includes(`v2sel = { kind: null }`) || /kind:\s*null/.test(code), "v2sel mặc định phải là null (endless)");
  });
  it("?mode= whitelist vẫn còn (timeattack|bossrush)", () => {
    const code = stripComments(read("js/v2glue.js"));
    assert.ok(code.includes('"timeattack"') && code.includes('"bossrush"'), "mất whitelist ?mode=");
  });
});

describe("P1.5 menu: #v2-stages biến mất, Boss Rush mở không gate", () => {
  it("không còn tạo panel #v2-stages / paintStages / lock-unlock ải", () => {
    const code = stripComments(read("js/menu.js"));
    assert.ok(!code.includes("v2-stages"), "menu.js còn reference v2-stages");
    assert.ok(!/\bpaintStages\b/.test(code), "menu.js còn paintStages");
    const html = read("index.html");
    assert.ok(!html.includes('id="v2-stages"'), "index.html còn panel #v2-stages");
  });
  it("không còn Boss Rush guard (disable brBtn / hint khóa)", () => {
    const code = stripComments(read("js/menu.js"));
    assert.ok(!/locked_hint/.test(code), "menu.js còn menu.mode.locked_hint");
    assert.ok(!code.includes("v2-mode-hint"), "menu.js còn #v2-mode-hint logic");
    assert.ok(!/brBtn/.test(code) || !/disabled/.test(code.split("brBtn")[0].slice(-200) || ""), "nghi còn disable brBtn");
    const html = read("index.html");
    assert.ok(!html.includes("v2-mode-hint"), "index.html còn #v2-mode-hint");
    assert.ok(!/locked_hint/.test(html), "index.html còn key locked_hint");
  });
  it("nút Boss Rush tồn tại, không disabled trong HTML", () => {
    const html = read("index.html");
    const m = /<button[^>]*data-mode="bossrush"[^>]*>/.exec(html);
    assert.ok(m, "thiếu nút data-mode=bossrush");
    assert.ok(!/disabled/.test(m[0]), "nút Boss Rush bị disabled trong HTML");
  });
});

/* =====================================================================
 * P2 — XÓA BOSS GLASS-SHARD M2 (tĩnh, RFC §7.2)
 * ===================================================================== */
describe("P2.1 mechanic M2 đã xóa triệt để", () => {
  it("js/game/06-bossfrag.js không tồn tại; MANIFEST không liệt kê", () => {
    assert.ok(!exists("js/game/06-bossfrag.js"), "06-bossfrag.js vẫn còn");
    const man = read("js/game/MANIFEST.txt");
    assert.ok(!man.includes("06-bossfrag.js"), "MANIFEST còn liệt kê 06-bossfrag.js");
  });
  it("bundle js/game.js: 0 reference bossSplitCheck/fragmentBite/fragStep/\"fragment\"/bossfrag/hurtBoss", () => {
    const bundle = stripComments(read("js/game.js"));
    for (const pat of ["bossSplitCheck", "fragmentBite", "fragStep", "bossfrag", "hurtBoss", '"fragment"', "'fragment'"]) {
      assert.ok(!bundle.includes(pat), `bundle còn chứa ${pat}`);
    }
  });
  it("16-update.js: killBoss không còn loop dọn fragment; không gọi bossSplitCheck", () => {
    const src = read("js/game/16-update.js");
    const idx = src.indexOf("function killBoss()");
    assert.ok(idx >= 0, "không tìm thấy killBoss");
    const body = extractBlock(src, idx);
    assert.ok(!/fragment/i.test(body), "killBoss còn reference fragment");
    assert.ok(!/SatManager\.kill/.test(body), "killBoss còn SatManager.kill (cleanup M2)");
    const code = stripComments(src);
    assert.ok(!code.includes("bossSplitCheck"), "16-update.js còn gọi bossSplitCheck");
  });
  it("04-satellite.js: ROLE_TB_TINT + drawSimContent không còn nhánh fragment", () => {
    const code = stripComments(read("js/game/04-satellite.js"));
    assert.ok(!/fragment\s*:/.test(code), "ROLE_TB_TINT còn entry fragment");
    assert.ok(!/===\s*["']fragment["']/.test(code), "drawSimContent còn nhánh fragment");
  });
  it("i18n: sat.bossfrag_* = 0 (cả vi + en)", () => {
    const src = read("js/i18n.js");
    assert.equal((src.match(/sat\.bossfrag_/g) || []).length, 0, "i18n còn sat.bossfrag_*");
  });
  it("tests/boss-fragment.test.js đã xóa", () => {
    assert.ok(!exists("tests/boss-fragment.test.js"), "test cũ của mechanic M2 vẫn còn");
  });
});

describe("P2.2 GIỮ LẠI — không xóa nhầm (regression)", () => {
  it("addCrack/updateCracks/drawCracks còn (M4 debris dùng)", () => {
    const bundle = read("js/game.js");
    assert.ok(/function addCrack/.test(bundle), "thiếu addCrack");
    assert.ok(/function updateCracks/.test(bundle), "thiếu updateCracks");
    assert.ok(/function drawCracks/.test(bundle), "thiếu drawCracks");
    assert.ok(/G\.cracks\s*=\s*\[\]/.test(bundle), "thiếu G.cracks reset");
  });
  it("shrinkWindow/growWindow + sfx.crack còn (bundle); SHAPE_SHARD còn (juice.js); bossRingShatter còn (cinema.js)", () => {
    const bundle = read("js/game.js");
    assert.ok(bundle.includes("shrinkWindow"), "thiếu shrinkWindow");
    assert.ok(bundle.includes("growWindow"), "thiếu growWindow");
    assert.ok(/sfx\.crack/.test(bundle), "thiếu sfx.crack");
    assert.ok(read("js/juice.js").includes("SHAPE_SHARD"), "juice.js thiếu SHAPE_SHARD");
    assert.ok(read("js/cinema.js").includes("bossRingShatter"), "cinema.js thiếu bossRingShatter");
  });
});

/* =====================================================================
 * P3 — UI P0/P1 (RFC §2, §7.3)
 * ===================================================================== */
describe("P3.1 UI-02: index.html chỉ 1 <footer>", () => {
  it("<footer> mở đúng 1 lần, đóng đúng 1 lần", () => {
    const html = read("index.html");
    assert.equal((html.match(/<footer[\s>]/g) || []).length, 1, "số thẻ <footer> mở != 1");
    assert.equal((html.match(/<\/footer>/g) || []).length, 1, "số thẻ </footer> đóng != 1");
  });
});

describe("P3.2 UI-01: không còn text thô svgIcon(\"i-grad\")", () => {
  it("mọi occurrence svgIcon(\"i-grad\") đều nằm trong ${} hoặc nối chuỗi", () => {
    const lines = read("js/menu.js").split("\n");
    const bad = [];
    lines.forEach((ln, i) => {
      let j = 0;
      while ((j = ln.indexOf('svgIcon("i-grad")', j)) !== -1) {
        const before = ln.slice(Math.max(0, j - 3), j);
        const after = ln.slice(j + 'svgIcon("i-grad")'.length, j + 'svgIcon("i-grad")'.length + 4);
        const ok = before.endsWith("${") || after.startsWith(" + ") || after.startsWith(" +`") || after.startsWith("+ `");
        if (!ok) bad.push(`dòng ${i + 1}: ${ln.trim().slice(0, 80)}`);
        j += 1;
      }
    });
    assert.deepEqual(bad, [], "text thô svgIcon(\"i-grad\") ngoài ${}/nối chuỗi:\n" + bad.join("\n"));
  });
});

describe("P3.3 UI-06: nút mode co giãn (không min-width cứng 148px)", () => {
  it("#v2-modes .v2-mode dùng flex, không còn min-width:148px", () => {
    const html = read("index.html");
    const modesSec = html.slice(html.indexOf('id="v2-modes"'), html.indexOf('id="v2-modes"') + 1500);
    assert.ok(/flex:\s*1\s+1\s+140px/.test(modesSec), "nút mode chưa dùng flex:1 1 140px");
    assert.ok(!/min-width:\s*148px/.test(modesSec), "vẫn còn min-width:148px cứng");
  });
});

describe("P3.4 i18n regression: mọi data-i18n trong HTML đều có key registered", () => {
  /* Thu thập key HTML — cách viết riêng của QA (regex + Set). */
  function qaHtmlKeys() {
    const keys = new Set();
    for (const page of ["index.html", "game.html"]) {
      const html = read(page);
      const re = /data-i18n(?:-html|-ph|-aria|-title|-alt)?="([^"]+)"/g;
      let m;
      while ((m = re.exec(html))) keys.add(m[1]);
    }
    return keys;
  }
  /* Gom dict: nạp js/i18n.js thật trong vm (lấy I18N._dict) + mọi I18N.register
     literal ở các file js khác (tự đếm ngoặc + eval object literal, code QA tự viết). */
  function qaRegistered() {
    const store = {};
    const sb = {
      console,
      localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
      location: { search: "" },
      document: { readyState: "complete", querySelectorAll: () => [], documentElement: {} },
    };
    sb.window = sb; sb.window.location = sb.location; sb.window.localStorage = sb.localStorage;
    vm.createContext(sb);
    vm.runInContext(read("js/i18n.js"), sb, { filename: "js/i18n.js" });
    const have = new Set([...Object.keys(sb.window.I18N._dict.vi || {}), ...Object.keys(sb.window.I18N._dict.en || {})]);
    const files = fs.readdirSync(path.join(ROOT, "js")).filter((f) => f.endsWith(".js") && f !== "i18n.js")
      .map((f) => "js/" + f)
      .concat(fs.readdirSync(path.join(ROOT, "js/game")).filter((f) => f.endsWith(".js")).map((f) => "js/game/" + f));
    for (const f of files) {
      const src = read(f);
      let idx = 0;
      while ((idx = src.indexOf("I18N.register(", idx)) !== -1) {
        try {
          const lit = extractBlock(src, idx).slice("I18N.register(".length); // bỏ "I18N.register(" → object literal
          const obj = vm.runInNewContext("(" + lit + ")", { console });
          for (const lang of ["vi", "en"]) if (obj && obj[lang]) for (const k of Object.keys(obj[lang])) have.add(k);
        } catch (e) { /* register không phải literal thuần — bỏ qua */ }
        idx += 1;
      }
    }
    return have;
  }
  it("0 key data-i18n thiếu (ngăn lặp lại lớp lỗi PR #80)", () => {
    const keys = qaHtmlKeys();
    const have = qaRegistered();
    const missing = [...keys].filter((k) => !have.has(k));
    assert.ok(keys.size > 50, "quét được quá ít key HTML — regex có vấn đề");
    assert.deepEqual(missing, [], "key data-i18n thiếu: " + missing.join(", "));
  });
  it("không còn key campaign.* / stageobj.* / sat.bossfrag_* trong HTML (trừ comment lịch sử)", () => {
    const noHtmlComments = (s) => s.replace(/<!--[\s\S]*?-->/g, " ");
    const all = stripComments(noHtmlComments(read("index.html") + read("game.html")));
    assert.ok(!/campaign\./.test(all), "HTML còn key campaign.*");
    assert.ok(!/stageobj\./.test(all), "HTML còn key stageobj.*");
    assert.ok(!/sat\.bossfrag_/.test(all), "HTML còn key sat.bossfrag_*");
  });
});

/* =====================================================================
 * P4 — RUNTIME (vm sandbox, không browser — harness do QA tự viết)
 *
 * Khác biệt kỹ thuật so với các suite cũ: nạp các MODULE NGUỒN js/game/*.js
 * theo js/game/MANIFEST.txt (thay vì bundle) để gọi trực tiếp startWave/
 * killBoss/addCrack/miniBossSpecOf/mkEnemy/bgStageSid. Tương đương bundle vì
 * `node scripts/build-game.js --check` đã chứng minh bundle ≡ modules.
 * ===================================================================== */

/* Harness: browser tối thiểu để boot toàn bộ script game thật. */
function qaEl(noop) {
  const chain = () => new Proxy(function () {}, {
    get: (t, p) => (p === Symbol.toPrimitive ? () => 0 : (...a) => chain()),
    set: () => true,
  });
  return {
    style: {}, dataset: {},
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    addEventListener: noop, removeEventListener: noop, appendChild: noop, remove: noop,
    getContext: () => chain(), width: 980, height: 700,
    textContent: "", innerHTML: "", onclick: null, onload: null,
    querySelector: () => null, querySelectorAll: () => [],
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 980, height: 700 }),
    play: () => Promise.resolve(), pause: noop, load: noop, focus: noop, click: noop,
  };
}
function qaBoot(search) {
  const noop = () => {};
  let rafCb = null;
  const store = {};
  const simNow = { value: 0 };
  const frameErrs = [];
  const sb = {
    console, Math, JSON, Object, Array, String, Number, Boolean, Date, RegExp, Error,
    TypeError, ReferenceError, SyntaxError, RangeError, Promise, Map, Set, WeakMap,
    parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent,
    setTimeout: () => 0, clearTimeout: noop, setInterval: () => 0, clearInterval: noop,
    requestAnimationFrame: (cb) => { rafCb = cb; return 1; },
    cancelAnimationFrame: noop,
    performance: { now: () => simNow.value },
    URLSearchParams, URL, Blob,
    navigator: { userAgent: "qa-node", sendBeacon: noop },
    location: { search, href: "http://qa/game.html" + search },
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
      key: (i) => Object.keys(store)[i] || null,
      get length() { return Object.keys(store).length; },
    },
    sessionStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    innerWidth: 980, innerHeight: 700, outerWidth: 980, outerHeight: 700,
    screenX: 0, screenY: 0, devicePixelRatio: 1, screen: { availWidth: 1920, availHeight: 1080 },
    addEventListener: noop, removeEventListener: noop,
    open: () => null, close: noop,
  };
  sb.window = sb; sb.globalThis = sb;
  sb.document = {
    getElementById: () => qaEl(noop), querySelector: () => qaEl(noop), querySelectorAll: () => [],
    createElement: () => qaEl(noop), addEventListener: noop, removeEventListener: noop,
    hidden: false, readyState: "complete", documentElement: qaEl(noop), body: qaEl(noop), title: "",
  };
  vm.createContext(sb);
  const pre = ["js/portal.js", "js/pwa.js", "js/analytics.js", "js/i18n.js", "js/audio.js",
    "js/bgm.js", "js/bg.js", "js/juice.js", "js/cinema.js", "js/tuning.js", "js/monsters.js",
    "js/bosses.js", "js/tutorial.js", "js/meta.js", "js/juice2.js", "js/sfx2.js",
    "js/upgrades2.js", "js/v2glue.js"];
  const mods = read("js/game/MANIFEST.txt").split("\n").map((s) => s.trim())
    .filter((s) => s && !s.startsWith("#")).map((f) => "js/game/" + f);
  const post = ["js/mobile.js"];
  for (const f of pre.concat(mods, post)) vm.runInContext(read(f), sb, { filename: f });
  return {
    sb, simNow, store, frameErrs,
    pump(n) {
      for (let i = 0; i < n; i++) {
        simNow.value += 16.7;
        const cb = rafCb; rafCb = null;
        if (cb) { try { cb(simNow.value); } catch (e) { frameErrs.push(e); } }
      }
    },
    run: (code) => vm.runInContext(code, sb),
  };
}

describe("P4.1 boot: ?stage=3&daily=1 bị bỏ qua → endless, không crash", () => {
  it("V2.mode = null, V2.stageId = 0, game vào phase play", () => {
    const g = qaBoot("?diff=chill&stage=3&daily=1&endless=1");
    g.pump(120);
    assert.deepEqual(g.frameErrs, [], "frame ném exception khi boot với ?stage=3");
    const st = g.run("({ mode: V2.mode, stageId: V2.stageId, phase: G.phase })");
    assert.equal(st.mode, null, "?stage=3 không được map thành mode, nhận: " + st.mode);
    assert.equal(st.stageId, 0, "stageId phải = 0 (deprecated), nhận: " + st.stageId);
    assert.equal(st.phase, "play", "game phải vào phase play, nhận: " + st.phase);
  });
  it("?mode=bossrush vẫn vào đúng mode (whitelist còn hoạt động)", () => {
    const g = qaBoot("?diff=chill&mode=bossrush");
    g.pump(60);
    assert.equal(g.run("V2.mode"), "bossrush", "whitelist ?mode=bossrush hỏng");
  });
  it("?mode=lạ → endless (null), không kẹt", () => {
    const g = qaBoot("?mode=stage3hack");
    g.pump(60);
    assert.equal(g.run("V2.mode"), null, "?mode lạ phải fallback endless");
  });
});

describe("P4.2 wave 1→30 endless: 0 exception; boss đúng wave 5/10/15/20/25/30", () => {
  /* Sim nhanh: mỗi frame dọn sạch quái hàng đợi (không XP) để wave-clear nổ tự
     nhiên → waveBreak → startWave(wave+1). Boss wave: killBoss() thật. */
  function simToWave30() {
    const g = qaBoot("?diff=normal&tut=0"); // tut=0: tắt tutorial (không thì wave 0 scripted chặn wave-break)
    g.pump(60);
    g.run("G.xpNeed = 999999999;"); // chặn level-up/draft trong sim (draft đã có suite riêng)
    const bossWaves = [];
    let frames = 0;
    const cap = 40000;
    while (g.run("G.wave") < 30 && frames < cap) {
      g.pump(1); frames++;
      if (g.frameErrs.length) break;
      const w = g.run("G.wave");
      if (g.run("!!G.boss && !G.boss.dead")) { bossWaves.push(w); g.run("killBoss()"); }
      /* dọn sạch để wave-clear nổ tự nhiên; chặn XP (không mở draft) + đạn địch
         + hồi máu ship — sim chỉ kiểm tính toàn vẹn wave-comp, không test balance */
      g.run("G.enemies.length = 0; G.spawnQueue.length = 0; G.pendingSpawns = 0;");
      g.run("G.ebullets.length = 0; G.xp = 0; if (G.ship) G.ship.hp = G.ship.maxHp;");
      if (g.run("G.phase") !== "play") break;
    }
    return { g, bossWaves, frames, wave: g.run("G.wave"), phase: g.run("G.phase") };
  }
  it("sim tới wave 30: 0 frame exception, phase luôn play", () => {
    const { g, frames, wave, phase } = simToWave30();
    assert.deepEqual(g.frameErrs.map(String), [], "frame exceptions:\n" + g.frameErrs.map(String).join("\n"));
    assert.equal(phase, "play", "phase đổi giữa chừng: " + phase);
    assert.ok(wave >= 30, `chỉ sim được tới wave ${wave} sau ${frames} frames`);
  });
  it("boss xuất hiện đúng ở wave 5/10/15/20/25/30 (mỗi wave đúng 1 lần)", () => {
    const { bossWaves } = simToWave30();
    assert.deepEqual(bossWaves, [5, 10, 15, 20, 25, 30],
      "boss waves sai, nhận: " + JSON.stringify(bossWaves));
  });
});

describe("P4.3 boss fight: 66% HP không split; killBoss sạch", () => {
  it("typeof bossSplitCheck/hurtBoss/fragStep === 'undefined' (mechanic M2 đã chết)", () => {
    const g = qaBoot("?diff=normal");
    assert.equal(g.run("typeof bossSplitCheck"), "undefined", "bossSplitCheck còn tồn tại!");
    assert.equal(g.run("typeof hurtBoss"), "undefined", "hurtBoss còn tồn tại!");
    assert.equal(g.run("typeof fragStep"), "undefined", "fragStep còn tồn tại!");
  });
  it("boss 66% HP + chạy 120 frames: SatManager.anyRole('fragment') === false", () => {
    const g = qaBoot("?diff=normal");
    g.pump(60);
    g.run("startWave(5)"); g.pump(3);
    assert.ok(g.run("!!G.boss"), "boss wave 5 chưa spawn — không test được");
    g.run("G.boss.hp = G.boss.maxHp * 0.66; G.ship.maxHp = 99999; G.ship.hp = 99999;");
    for (let i = 0; i < 120; i++) {
      g.pump(1);
      if (g.frameErrs.length) break;
      g.run("G.enemies.length = 0; G.spawnQueue.length = 0; G.pendingSpawns = 0;");
    }
    assert.deepEqual(g.frameErrs.map(String), [], "frame exception trong boss fight");
    assert.equal(g.run("SatManager.anyRole('fragment')"), false,
      "vẫn sinh satellite 'fragment' ở ngưỡng 66% HP!");
  });
  it("killBoss() thật: G.boss = null, +500 điểm, không throw", () => {
    const g = qaBoot("?diff=normal");
    g.pump(60);
    g.run("startWave(10)"); g.pump(3);
    assert.ok(g.run("!!G.boss"), "boss wave 10 chưa spawn");
    const before = g.run("G.score");
    assert.doesNotThrow(() => g.run("killBoss()"), "killBoss ném exception");
    assert.equal(g.run("G.boss"), null, "killBoss không dọn G.boss");
    assert.equal(g.run("G.score") - before, 500, "killBoss không cộng 500 điểm");
  });
});

describe("P4.4 regression GIỮ: M4 addCrack + themeSid random mỗi run", () => {
  it("addCrack(x,y) vẫn vẽ vết nứt (G.cracks tăng)", () => {
    const g = qaBoot("?diff=normal");
    g.pump(30);
    const before = g.run("G.cracks.length");
    g.run("addCrack(200, 150)");
    const after = g.run("G.cracks.length");
    assert.ok(after > before, `addCrack không thêm vết nứt (trước ${before}, sau ${after})`);
  });
  it("G.themeSid ∈ 1..5 sau resetGame (random theme mỗi run)", () => {
    const g = qaBoot("?diff=normal");
    const sid = g.run("G.themeSid");
    assert.ok(Number.isInteger(sid) && sid >= 1 && sid <= 5, "G.themeSid không hợp lệ: " + sid);
  });
  it("bgStageSid() trả đúng themeSid 1-5 (không còn đọc V2.stageId)", () => {
    const g = qaBoot("?diff=normal");
    const ok = g.run("[1,2,3,4,5].every(s => { G.themeSid = s; return bgStageSid() === s; })");
    assert.ok(ok, "bgStageSid() không khớp themeSid");
  });
});

describe("P4.5 miniboss: resolver + mkEnemy + spawner F1 (test thật, gap đã đóng)", () => {
  it("miniBossSpecOf('mini_boss_1..5') resolve đúng base/hp×8/scale×2.5 qua registry", () => {
    const g = qaBoot("?diff=normal");
    const res = g.run("[1,2,3,4,5].map(n => miniBossSpecOf('mini_boss_' + n))");
    const expect = { 1: "chewer", 2: "dasher", 3: "tank", 4: "splitter", 5: "chewer" };
    for (let n = 1; n <= 5; n++) {
      const s = res[n - 1];
      assert.ok(s, `mini_boss_${n} resolve null`);
      assert.equal(s.base, expect[n], `mini_boss_${n} base sai`);
      assert.equal(s.hpMult, 8, `mini_boss_${n} hpMult phải ×8`);
      assert.equal(s.scale, 2.5, `mini_boss_${n} scale phải ×2.5`);
    }
  });
  it("mkEnemy('mini_boss_1') tạo entity mini-boss thật (e.miniBoss, type=base)", () => {
    const g = qaBoot("?diff=normal");
    g.pump(30);
    const e = g.run(`(function(){ const x = mkEnemy("mini_boss_1", 100, 100);
      return x && { mini: x.miniBoss, type: x.type, hp: x.hp, r: x.r }; })()`);
    assert.ok(e && e.mini === "mini_boss_1", "mkEnemy không đánh dấu e.miniBoss, nhận: " + JSON.stringify(e));
    assert.equal(e.type, "chewer", "mini_boss_1 phải có type base chewer");
    assert.ok(e.hp > 0 && e.r > 0, "entity mini-boss stat không hợp lệ");
  });
  it("entity stat: hp×8, r×2.5, xp=20 so với quái base cùng wave", () => {
    const g = qaBoot("?diff=normal");
    g.pump(30);
    const r = g.run(`(function(){
      G.wave = 4; G.vp1_tiny = false;
      var base = mkEnemy("chewer", 100, 100);
      var mb = mkEnemy("mini_boss_1", 100, 100);
      return { baseHp: base.hp, baseR: base.r, mbHp: mb.hp, mbR: mb.r, mbXp: mb.xp, mbMini: mb.miniBoss };
    })()`);
    assert.equal(r.mbMini, "mini_boss_1");
    assert.equal(r.mbHp, Math.round(r.baseHp * 8), `hp phải ×8, nhận ${r.mbHp} vs base ${r.baseHp}`);
    assert.equal(r.mbR, r.baseR * 2.5, `r phải ×2.5, nhận ${r.mbR} vs base ${r.baseR}`);
    assert.equal(r.mbXp, 20, "xp phải = 20 (gemReward)");
  });
});

describe("P4.5A miniboss spawner F1: wave 4/9/14/19/24 spawn đúng mini_boss_N (test thật)", () => {
  it("maybeSpawnMiniBoss(4) spawn mini_boss_1 + banner nameVi + guard 1 lần/wave", () => {
    const g = qaBoot("?diff=normal");
    g.pump(30);
    const r = g.run(`(function(){
      G.wave = 4;
      var before = G.enemies.length + (G.pendingSpawns || 0);
      maybeSpawnMiniBoss(4);
      var after = G.enemies.length + (G.pendingSpawns || 0);
      var banner = G.banner;
      maybeSpawnMiniBoss(4); // guard: không spawn trùng
      var after2 = G.enemies.length + (G.pendingSpawns || 0);
      return { spawned: after - before, banner, guardOk: after2 === after, wave: G.miniBossWave };
    })()`);
    assert.equal(r.spawned, 1, "wave 4 phải spawn đúng 1 miniboss");
    assert.equal(r.banner, "Chewer Cổ Đại", "banner phải hiện nameVi");
    assert.ok(r.guardOk, "gọi 2 lần cùng wave không được spawn trùng");
    assert.equal(r.wave, 4, "guard G.miniBossWave phải set");
  });
  it("wave 29 và boss wave 5 → không spawn", () => {
    const g = qaBoot("?diff=normal");
    g.pump(30);
    const r = g.run(`(function(){
      maybeSpawnMiniBoss(29); maybeSpawnMiniBoss(5); maybeSpawnMiniBoss(10);
      return { wave: G.miniBossWave };
    })()`);
    assert.equal(r.wave, 0, "không wave nào được spawn (guard miniBossWave vẫn 0)");
  });
});

describe("P4.5B mobileAssist F2: coarse+ON → multipliers áp (test thật)", () => {
  it("mobileAssistActive() false trên desktop (không coarse)", () => {
    const g = qaBoot("?diff=normal");
    assert.equal(g.run("mobileAssistActive()"), false);
  });
  it("coarse (class wk-coarse) → active true; speed ×0.85", () => {
    const g = qaBoot("?diff=normal");
    const r = g.run(`(function(){
      document.body.classList.contains = function(c){ return c === "wk-coarse"; };
      var active = mobileAssistActive();
      var on = mkEnemy("chaser", 100, 100);
      document.body.classList.contains = function(){ return false; };
      var off = mkEnemy("chaser", 100, 100);
      return { active, ratio: on.speed / off.speed };
    })()`);
    assert.equal(r.active, true, "coarse + toggle mặc định BẬT → active");
    assert.ok(Math.abs(r.ratio - 0.85) < 1e-9, `speed ratio phải = 0.85, nhận ${r.ratio}`);
  });
});

describe("P4.5C dead code F3: makeMiniBoss/miniBossStats/unlockBossStage/_bossBeaten không còn", () => {
  it("bundle + modules không chứa dead code campaign", () => {
    const bundle = read("js/game.js");
    for (const sym of ["makeMiniBoss", "miniBossStats", "unlockBossStage", "_bossBeaten"]) {
      assert.ok(!bundle.includes(sym), `bundle còn sót ${sym}`);
      assert.ok(!read("js/upgrades2.js").includes(sym), `upgrades2.js còn sót ${sym}`);
    }
    assert.ok(!read("js/monsters.js").includes("makeMiniBoss"), "monsters.js còn sót makeMiniBoss");
  });
});

describe("P4.6 hotfix #78 còn nguyên (BGM.setVolume + quitToMenu)", () => {
  it("BGM.setVolume cập nhật volTarget (không hardcode 0.5)", () => {
    const src = read("js/bgm.js");
    assert.ok(/let\s+volTarget/.test(src), "volTarget không còn mutable");
    assert.ok(/setVolume:\s*\(v\)\s*=>\s*\{[^}]*volTarget\s*=\s*v/.test(src), "setVolume không gán volTarget = v");
  });
  it("quitToMenu: có opener → opener.focus() + window.close() (không navigate index.html)", () => {
    const bundle = read("js/game.js");
    const idx = bundle.indexOf("function quitToMenu()");
    assert.ok(idx >= 0, "không tìm thấy quitToMenu");
    const body = extractBlock(bundle, idx);
    assert.ok(body.includes("window.opener.focus()"), "quitToMenu thiếu opener.focus()");
    assert.ok(body.includes("window.close()"), "quitToMenu thiếu window.close()");
  });
});

describe("P4.7 save cleanup: cleanupLegacyCampaignKeys xóa đúng 4 họ, giữ kỷ lục endless", () => {
  /* Trích function cleanupLegacyCampaignKeys từ menu.js (tự đếm ngoặc) rồi chạy
     trong vm với localStorage stub đã nạp sẵn key cũ + key kỷ lục. */
  function qaCleanupFn() {
    const src = read("js/menu.js");
    const idx = src.indexOf("function cleanupLegacyCampaignKeys()");
    assert.ok(idx >= 0, "không tìm thấy cleanupLegacyCampaignKeys trong menu.js");
    const fnSrc = extractBlock(src, idx);
    const store = {};
    const sb = {
      console,
      localStorage: {
        getItem: (k) => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: (k) => { delete store[k]; },
        key: (i) => Object.keys(store)[i] || null,
        get length() { return Object.keys(store).length; },
      },
    };
    sb.window = sb;
    vm.createContext(sb);
    vm.runInContext(fnSrc + "\nthis.__cleanup = cleanupLegacyCampaignKeys;", sb);
    return { store, run: () => vm.runInContext("__cleanup()", sb) };
  }
  it("xóa đúng 4 họ key campaign, GIỮ key lạ + kỷ lục endless + profile + settings", () => {
    const { store, run } = qaCleanupFn();
    const dead = ["wk_unlocked_stage_default", "wk_stage_best_p1", "wk_unlocked_endless_p1",
      "wk_stage_badges_default", "wk_unlocked_stage_p2"];
    const keep = ["wk_high_normal_default", "wk_high_chill_p1", "wk_profile_list",
      "wk_settings", "wk_save_version", "wk_stats_default", "some_other_key"];
    dead.forEach((k) => { store[k] = "x"; });
    keep.forEach((k) => { store[k] = "y"; });
    run();
    for (const k of dead) assert.ok(!(k in store), `key campaign còn sót: ${k}`);
    for (const k of keep) assert.ok(k in store, `key bị xóa oan: ${k}`);
  });
});
