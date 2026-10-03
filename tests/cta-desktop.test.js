/* WINDOWKILL — CTA web→desktop tests (node:test, phân tích tĩnh + i18n VM).
 * Sprint R2 item 5: 3 CTA (launcher card / game-over banner wave≥5 / toast wave 10)
 * dẫn về itch.io + UTM đầy đủ; thân thiện, không emoji; ẩn trong portal/Electron.
 * Chạy: node --test tests/cta-desktop.test.js
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

const CTA_URL = "https://quangnhat1504.itch.io/windowkill?utm_source=game&utm_medium=cta&utm_campaign=desktop";
const CTA_IDS = ["launcher_card", "gameover_banner", "wave10_toast"];

// Nạp js/i18n.js thật trong VM (pattern từ tests/i18n-coverage.test.js)
function loadI18N() {
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
  sandbox.window.location = sandbox.location;
  sandbox.window.localStorage = sandbox.localStorage;
  vm.createContext(sandbox);
  vm.runInContext(read("js/i18n.js"), sandbox, { filename: "js/i18n.js" });
  return sandbox.window.I18N;
}

describe("CTA tồn tại trong DOM/source với link itch.io + UTM đầy đủ", () => {
  const indexHtml = read("index.html");
  const gameHtml = read("game.html");
  const gameJs = read("js/game.js");

  it("(a) launcher card #desktop-cta-card cạnh nút Play", () => {
    assert.ok(indexHtml.includes('id="desktop-cta-card"'), "thiếu #desktop-cta-card");
    const m = indexHtml.match(/id="desktop-cta-card"[\s\S]*?<\/a>/);
    assert.ok(m, "card thiếu thẻ <a>");
    const a = m[0];
    assert.ok(a.includes(`href="${CTA_URL}"`), "href thiếu URL itch.io + UTM đầy đủ");
    assert.ok(a.includes('target="_blank"') && a.includes('rel="noopener"'), "thiếu target=_blank rel=noopener");
    assert.ok(a.includes('data-cta-id="launcher_card"'), "thiếu data-cta-id=launcher_card");
    assert.ok(a.includes('href="#i-window"'), "thiếu icon SVG #i-window");
  });

  it("(b) game-over banner #over-desktop-cta trong #ov-over", () => {
    assert.ok(gameHtml.includes('id="over-desktop-cta"'), "thiếu #over-desktop-cta");
    const over = gameHtml.slice(gameHtml.indexOf('id="ov-over"'));
    assert.ok(over.includes('id="over-desktop-cta"'), "#over-desktop-cta phải nằm trong #ov-over");
    const m = gameHtml.match(/id="over-desktop-cta"[\s\S]*?<a\s[^>]*>/);
    assert.ok(m, "banner thiếu thẻ <a>");
    const a = m[0];
    assert.ok(a.includes(`href="${CTA_URL}"`), "href thiếu URL itch.io + UTM đầy đủ");
    assert.ok(a.includes('target="_blank"') && a.includes('rel="noopener"'), "thiếu target=_blank rel=noopener");
    assert.ok(a.includes('data-cta-id="gameover_banner"'), "thiếu data-cta-id=gameover_banner");
  });

  it("(c) toast wave 10 trong js/game.js (wave10_toast + URL UTM)", () => {
    assert.ok(gameJs.includes("wave10_toast"), "game.js thiếu cta_id wave10_toast");
    assert.ok(gameJs.includes("DESKTOP_CTA_URL"), "thiếu const DESKTOP_CTA_URL");
    const m = gameJs.match(/const DESKTOP_CTA_URL = "([^"]+)"/);
    assert.ok(m && m[1] === CTA_URL, `DESKTOP_CTA_URL phải là ${CTA_URL}`);
    assert.ok(gameJs.includes('id = "wk-desktop-toast"') || gameJs.includes("wk-desktop-toast"),
      "thiếu phần tử toast #wk-desktop-toast");
    assert.ok(gameJs.includes("setTimeout(dismiss, 6000)"), "toast phải tự tắt sau 6s");
  });

  it("UTM đồng nhất ở cả 3 CTA", () => {
    const utm = "utm_source=game&utm_medium=cta&utm_campaign=desktop";
    for (const [name, src] of [["index.html", indexHtml], ["game.html", gameHtml], ["game.js", gameJs]]) {
      assert.ok(src.includes(utm), `${name} thiếu UTM đầy đủ`);
    }
  });
});

describe("game-over banner chỉ khi wave≥5 (logic check)", () => {
  const gameJs = read("js/game.js");
  it("die() bật banner theo điều kiện G.wave >= 5", () => {
    const start = gameJs.indexOf("function die(");
    const end = gameJs.indexOf("\nfunction resetGame()");
    const dieBlock = gameJs.slice(start, end);
    assert.ok(dieBlock.includes("over-desktop-cta"), "die() không chạm #over-desktop-cta");
    assert.ok(/G\.wave\s*>=\s*5/.test(dieBlock), "die() thiếu điều kiện G.wave >= 5");
    assert.ok(dieBlock.includes("ctaSuppressed()"), "die() thiếu guard ctaSuppressed()");
  });
  it("banner ẩn mặc định trong HTML (hidden)", () => {
    const m = read("game.html").match(/<div id="over-desktop-cta"[^>]*>/);
    assert.ok(m && /\bhidden\b/.test(m[0]), "#over-desktop-cta phải có thuộc tính hidden mặc định");
  });
});

describe("toast 1 lần/run (flag reset)", () => {
  const gameJs = read("js/game.js");
  it("chỉ trigger khi clear wave 10 và flag chưa bật", () => {
    assert.ok(gameJs.includes("G.wave === 10") && gameJs.includes("!G._desktopToastShown"),
      "thiếu điều kiện G.wave === 10 && !G._desktopToastShown");
    assert.ok(/_desktopToastShown = true/.test(gameJs), "thiếu _desktopToastShown = true sau khi hiện toast");
  });
  it("flag được reset trong resetGame()", () => {
    const rs = gameJs.slice(gameJs.indexOf("function resetGame()"), gameJs.indexOf("function resetGame()") + 2500);
    assert.ok(rs.includes("_desktopToastShown: false"), "resetGame() không reset _desktopToastShown");
  });
});

describe("i18n keys VI+EN đầy đủ", () => {
  const I18N = loadI18N();
  const KEYS = ["cta.launcher_title", "cta.launcher_sub", "cta.gameover_text", "cta.gameover_btn", "cta.toast_text"];
  const EXPECT = {
    vi: {
      "cta.launcher_title": "Desktop Edition",
      "cta.launcher_sub": "Cửa sổ thật, không mô phỏng",
      "cta.gameover_text": "Cửa sổ này chỉ là mô phỏng. Trải nghiệm cửa sổ THẬT trên bản Desktop →",
      "cta.gameover_btn": "Tải Desktop",
      "cta.toast_text": "Bản Desktop: cửa sổ thật đấy!",
    },
    en: {
      "cta.launcher_title": "Desktop Edition",
      "cta.launcher_sub": "Real windows, no simulation",
      "cta.gameover_text": "This window is just a simulation. Experience REAL windows on Desktop →",
      "cta.gameover_btn": "Get Desktop",
      "cta.toast_text": "Desktop build: real windows!",
    },
  };
  for (const lang of ["vi", "en"]) {
    it(`dict ${lang} có đủ 5 key, không rỗng`, () => {
      for (const k of KEYS) {
        const v = I18N._dict[lang][k];
        assert.ok(typeof v === "string" && v.length > 0, `${lang}.${k} thiếu hoặc rỗng`);
        assert.equal(v, EXPECT[lang][k], `${lang}.${k} sai copy`);
      }
    });
  }
  it("data-i18n cta.* trong HTML đều có trong dict", () => {
    const keys = new Set();
    for (const page of ["index.html", "game.html"]) {
      const html = read(page);
      for (const m of html.matchAll(/data-i18n(?:-html|-ph|-aria|-title|-alt)?="(cta\.[^"]+)"/g)) keys.add(m[1]);
    }
    assert.ok(keys.size >= 4, `mong đợi ≥4 key cta.* trong HTML, thấy ${keys.size}`);
    for (const k of keys) {
      assert.ok(I18N._dict.vi[k], `vi thiếu key ${k}`);
      assert.ok(I18N._dict.en[k], `en thiếu key ${k}`);
    }
  });
  it("copy không chứa emoji (quy ước DOM)", () => {
    const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{1F100}-\u{1F1FF}]/u;
    for (const lang of ["vi", "en"]) {
      for (const k of KEYS) {
        assert.ok(!EMOJI.test(I18N._dict[lang][k]), `${lang}.${k} chứa emoji`);
      }
    }
  });
});

describe("không render trong portalMode / Electron (guard check)", () => {
  it("menu.js: initDesktopCta guard WK_PORTAL_MODE + Electron", () => {
    const menuJs = read("js/menu.js");
    const m = menuJs.match(/function initDesktopCta\(\)[\s\S]*?\n  \}/);
    assert.ok(m, "thiếu initDesktopCta()");
    assert.ok(m[0].includes("window.WK_PORTAL_MODE"), "thiếu guard WK_PORTAL_MODE");
    assert.ok(m[0].includes("Electron"), "thiếu guard Electron");
  });
  it("game.js: ctaSuppressed() check WK_PORTAL_MODE + ?portal=1 + IS_ELECTRON_APP", () => {
    const gameJs = read("js/game.js");
    const m = gameJs.match(/function ctaSuppressed\(\)[\s\S]*?\n\}/);
    assert.ok(m, "thiếu ctaSuppressed()");
    assert.ok(m[0].includes("window.WK_PORTAL_MODE"), "thiếu guard WK_PORTAL_MODE");
    assert.ok(m[0].includes('qp.get("portal")'), "thiếu guard ?portal=1");
    assert.ok(m[0].includes("IS_ELECTRON_APP"), "thiếu guard IS_ELECTRON_APP");
  });
  it("launcher card ẩn mặc định trong HTML (hidden)", () => {
    const m = read("index.html").match(/<section id="desktop-cta-card"[^>]*>/);
    assert.ok(m && /\bhidden\b/.test(m[0]), "#desktop-cta-card phải có hidden mặc định");
  });
  it("toast gọi ctaSuppressed() trước khi hiện", () => {
    const gameJs = read("js/game.js");
    assert.ok(/G\.wave === 10[\s\S]{0,80}ctaSuppressed\(\)/.test(gameJs),
      "điều kiện toast wave 10 thiếu ctaSuppressed()");
  });
});

describe("analytics cta_click có guard window.WKAnalytics", () => {
  it("menu.js trackCtaClick guard + bắn cta_click với cta_id, utm", () => {
    const menuJs = read("js/menu.js");
    assert.ok(menuJs.includes('window.WKAnalytics.track("cta_click"'), "menu.js thiếu track cta_click");
    assert.ok(menuJs.includes("window.WKAnalytics &&"), "menu.js thiếu guard window.WKAnalytics &&");
    assert.ok(menuJs.includes("{ cta_id: cta_id, utm: DESKTOP_CTA_UTM }") ||
      menuJs.includes("{ cta_id, utm: DESKTOP_CTA_UTM }"), "payload thiếu cta_id/utm");
  });
  it("game.js trackCtaClick guard + bắn cta_click với cta_id, utm", () => {
    const gameJs = read("js/game.js");
    assert.ok(gameJs.includes('window.WKAnalytics.track("cta_click"'), "game.js thiếu track cta_click");
    assert.ok(gameJs.includes("window.WKAnalytics &&"), "game.js thiếu guard window.WKAnalytics &&");
  });
  it("đủ 3 cta_id hợp lệ (DOM + JS, game.js đọc data-cta-id động)", () => {
    const all = read("js/game.js") + read("js/menu.js") + read("index.html") + read("game.html");
    for (const id of CTA_IDS) assert.ok(all.includes(id), `thiếu cta_id ${id}`);
    assert.ok(read("js/game.js").includes("t.dataset.ctaId"),
      "game.js phải đọc data-cta-id động qua delegated listener để track gameover_banner");
  });
});
