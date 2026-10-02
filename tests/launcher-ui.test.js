/* WINDOWKILL — launcher/hub UI icon & structure tests (node:test, phân tích tĩnh).
 * DESIGN 2026-10-02 (Launcher clean): toàn bộ icon DOM phải là SVG sprite
 * (assets/icons) — KHÔNG còn emoji trong DOM UI; landing sạch với hub nav
 * 6 nút icon mở overlay panel (shop/ach/daily/stats/settings/howto).
 * Chạy: node --test tests/launcher-ui.test.js
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

// Mọi #i-<name> được reference ở code/DOM phải tồn tại trong sprite của
// index.html và game.html (từng mất i-flag/i-anvil trên production).
function spriteIds(html) {
  const ids = new Set();
  for (const m of html.matchAll(/<symbol[^>]*\sid="([^"]+)"/g)) ids.add(m[1]);
  return ids;
}
function referencedIcons(src) {
  const refs = new Set();
  for (const m of src.matchAll(/href="#(i-[a-z0-9-]+)"/g)) refs.add(m[1]);
  for (const m of src.matchAll(/svgIcon\("(i-[a-z0-9-]+)"\)/g)) refs.add(m[1]);
  return refs;
}

describe("sprite coverage", () => {
  const indexHtml = read("index.html");
  const gameHtml = read("game.html");
  const menuJs = read("js/menu.js");
  const spIndex = spriteIds(indexHtml);
  const spGame = spriteIds(gameHtml);
  const want = new Set([...referencedIcons(indexHtml), ...referencedIcons(menuJs)]);
  assert.ok(want.size > 20, "expected many icon references");
  for (const id of want) {
    it(`#${id} tồn tại trong sprite index.html`, () => {
      assert.ok(spIndex.has(id), `index.html sprite thiếu symbol ${id}`);
    });
  }
  const wantGame = referencedIcons(gameHtml);
  for (const id of wantGame) {
    it(`#${id} tồn tại trong sprite game.html`, () => {
      assert.ok(spGame.has(id), `game.html sprite thiếu symbol ${id}`);
    });
  }
});

describe("không emoji trong DOM UI", () => {
  const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{1F100}-\u{1F1FF}]/u;
  const stripComments = (src) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
  it("js/menu.js (trừ comment) không còn emoji", () => {
    const code = stripComments(read("js/menu.js"));
    const hits = [];
    code.split("\n").forEach((ln, i) => { if (EMOJI.test(ln)) hits.push(i + 1); });
    assert.deepEqual(hits, [], `menu.js còn emoji ở dòng ${hits.join(",")}`);
  });
  it("index.html không còn emoji", () => {
    const hits = [];
    read("index.html").split("\n").forEach((ln, i) => { if (EMOJI.test(ln)) hits.push(i + 1); });
    assert.deepEqual(hits, [], `index.html còn emoji ở dòng ${hits.join(",")}`);
  });
  // DOM-facing i18n: chỉ các key render ra DOM launcher (menu/settings/common/
  // gameover/upg/profile). hud/banner/sat/juice/campaign.boss_banner_* là text
  // canvas gameplay (ngoài phạm vi) — cố tình loại trừ.
  it("i18n DOM strings không còn emoji (canvas keys được loại trừ)", () => {
    const src = read("js/i18n.js");
    const domRe = /^"(menu|settings|common|gameover|upg|profile|tutorial|campaign\.(name|stage|free|lock))[^"]*":/;
    const hits = [];
    let dictDepth = 0;
    src.split("\n").forEach((ln, i) => {
      const m = ln.match(/^\s*"([^"]+)":/);
      if (m && EMOJI.test(ln) && domRe.test(ln)) hits.push(`${i + 1}:${m[1]}`);
      void dictDepth;
    });
    assert.deepEqual(hits, [], `i18n DOM keys còn emoji: ${hits.join(", ")}`);
  });
});

describe("cấu trúc hub (landing sạch)", () => {
  const html = read("index.html");
  const hubs = ["shop", "ach", "daily", "stats", "settings", "howto"];
  for (const h of hubs) {
    it(`có nút hub [data-hub="${h}"]`, () => {
      assert.ok(html.includes(`data-hub="${h}"`), `thiếu nút hub ${h}`);
    });
    it(`có dialog [data-hub-panel="${h}"] với role=dialog`, () => {
      const re = new RegExp(`data-hub-panel="${h}"[^>]*role="dialog"`);
      assert.ok(re.test(html), `thiếu dialog ${h}`);
    });
  }
  it("shop mở vào lưới Xưởng (#v2-shop)", () => {
    assert.ok(html.includes('id="v2-shop"'), "thiếu #v2-shop");
  });
  it("không còn panel Xưởng/Thành tựu chất đống trên landing (#v2-meta đã xóa)", () => {
    assert.ok(!html.includes('id="v2-meta"'), "#v2-meta cũ còn tồn tại");
  });
  it("độ khó là panel riêng trên landing (#p-diff)", () => {
    assert.ok(html.includes('id="p-diff"'), "thiếu #p-diff");
    assert.ok(html.includes('data-i18n="menu.hub.difficulty"'), "thiếu label menu.hub.difficulty");
  });
  it("overlay bắt đầu ẩn (hidden)", () => {
    assert.ok(html.includes('id="hub-overlay" hidden'), "overlay phải có hidden ban đầu");
  });
});

describe("i18n hub keys VI+EN", () => {
  const src = read("js/i18n.js");
  const keys = ["menu.hub.shop", "menu.hub.ach", "menu.hub.daily", "menu.hub.stats",
    "menu.hub.settings", "menu.hub.howto", "menu.hub.close", "menu.hub.difficulty", "menu.hub.nav"];
  for (const k of keys) {
    it(`key "${k}" xuất hiện đủ VI+EN`, () => {
      const n = src.split(`"${k}"`).length - 1;
      assert.ok(n >= 2, `key ${k} chỉ xuất hiện ${n} lần (cần ≥2: VI+EN)`);
    });
  }
});

describe("hub controller (menu.js)", () => {
  const js = read("js/menu.js");
  it("có open/close hub + Esc + click backdrop + deep-link hash", () => {
    for (const s of ["function openHub", "function closeHub", 'key === "Escape"',
      "e.target === overlay", "location.hash", "__wkHub"]) {
      assert.ok(js.includes(s), `menu.js thiếu: ${s}`);
    }
  });
  it("render meta tách 3 hàm renderWorkshop/renderAch/renderDaily", () => {
    for (const s of ["function renderWorkshop", "function renderAch", "function renderDaily",
      "$(\"v2-shop\")", "$(\"v2-ach\")", "$(\"v2-daily\")"]) {
      assert.ok(js.includes(s), `menu.js thiếu: ${s}`);
    }
  });
});

describe("CSS hub", () => {
  const css = read("css/style.css");
  it("có style hub-nav/overlay/dialog + prefers-reduced-motion", () => {
    for (const s of [".hub-nav", "#hub-overlay", ".hub-dialog", "prefers-reduced-motion", "@media (max-width: 480px)"]) {
      assert.ok(css.includes(s), `style.css thiếu: ${s}`);
    }
  });
  it("nút hub/close đạt touch ≥44px", () => {
    assert.ok(/\.hub-btn\{[^}]*min-height:76px/.test(css) || css.includes("min-height:76px"), "hub-btn phải ≥44px");
    assert.ok(css.includes("width:44px;height:44px"), "hub-close phải 44px");
  });
});

describe("CTA band (feedback user 2026-10-02: nút CHƠI NGAY không bị kẹp)", () => {
  const html = read("index.html");
  const css = read("css/style.css");
  it("#btn-play nằm trong section.cta-band riêng, không sticky", () => {
    const m = html.match(/<section class="cta-band"[\s\S]*?<\/section>/);
    assert.ok(m, "thiếu section.cta-band");
    assert.ok(m[0].includes('id="btn-play"'), "#btn-play phải nằm trong cta-band");
    assert.ok(!/id="play-row"[^>]*position:sticky/.test(html), "không còn play-row sticky");
  });
  it("cta-band có padding không gian thở (desktop + mobile)", () => {
    assert.ok(/\.cta-band\s*\{[^}]*padding:\s*46px/.test(css), "cta-band cần padding lớn desktop");
    assert.ok(css.includes(".cta-band .popup-note"), "popup-note nằm trong band");
  });
});
