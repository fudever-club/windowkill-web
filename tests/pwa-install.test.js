/* WINDOWKILL — PWA install prompt tests (node:test, no deps).
 * Phạm vi: logic hiện/ẩn card "Cài game" (js/install-prompt.js) + tích hợp
 * tĩnh (index.html card, sprite i-install, i18n vi/en, sw.js precache).
 * Chạy: node --test tests/pwa-install.test.js
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const InstallPrompt = require("../js/install-prompt.js");

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{1F100}-\u{1F1FF}]/u;

describe("InstallPrompt.decide — logic hiện/ẩn", () => {
  const { decide } = InstallPrompt;
  const base = { installable: false, ios: false, standalone: false, dismissed: false, suppressed: false, sessionHidden: false };

  it("state rỗng/null → hidden", () => {
    assert.equal(decide(null), "hidden");
    assert.equal(decide(undefined), "hidden");
    assert.equal(decide({}), "hidden");
  });
  it("desktop thường, chưa có beforeinstallprompt → hidden (không ép UX)", () => {
    assert.equal(decide({ ...base }), "hidden");
  });
  it("beforeinstallprompt đã fire → prompt", () => {
    assert.equal(decide({ ...base, installable: true }), "prompt");
  });
  it("iOS Safari (không có beforeinstallprompt) → ios", () => {
    assert.equal(decide({ ...base, ios: true }), "ios");
  });
  it("installable thắng ios (iOS không bao giờ có event này, nhưng logic phải ưu tiên prompt)", () => {
    assert.equal(decide({ ...base, installable: true, ios: true }), "prompt");
  });
  it("đã cài (standalone) → hidden kể cả khi installable", () => {
    assert.equal(decide({ ...base, installable: true, standalone: true }), "hidden");
    assert.equal(decide({ ...base, ios: true, standalone: true }), "hidden");
  });
  it("user đã bấm đóng (dismissed) → hidden", () => {
    assert.equal(decide({ ...base, installable: true, dismissed: true }), "hidden");
  });
  it("portal / Electron (suppressed) → hidden", () => {
    assert.equal(decide({ ...base, installable: true, suppressed: true }), "hidden");
    assert.equal(decide({ ...base, ios: true, suppressed: true }), "hidden");
  });
  it("sessionHidden (vừa cài xong / vừa từ chối prompt gốc) → hidden", () => {
    assert.equal(decide({ ...base, installable: true, sessionHidden: true }), "hidden");
  });
});

describe("InstallPrompt.isIosDevice — nhận diện iOS", () => {
  const { isIosDevice } = InstallPrompt;
  const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
  const IPAD = "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
  const IPADOS_DESKTOP = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
  const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
  const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36";
  const WIN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

  it("iPhone → true", () => assert.equal(isIosDevice(IPHONE), true));
  it("iPad → true", () => assert.equal(isIosDevice(IPAD), true));
  it("iPadOS giả desktop (MacIntel + touch) → true", () => assert.equal(isIosDevice(IPADOS_DESKTOP, "MacIntel", 5), true));
  it("Mac thật (không touch) → false", () => assert.equal(isIosDevice(MAC, "MacIntel", 0), false));
  it("Android Chrome → false", () => assert.equal(isIosDevice(ANDROID), false));
  it("Windows Chrome → false", () => assert.equal(isIosDevice(WIN), false));
  it("UA rỗng → false", () => assert.equal(isIosDevice(""), false));
});

describe("InstallPrompt.detectEnv — đọc môi trường (inject fake)", () => {
  const { detectEnv } = InstallPrompt;
  const WIN_CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0";
  const fakeWin = (over = {}) => ({
    matchMedia: () => ({ matches: false }),
    localStorage: { getItem: () => null },
    WK_PORTAL_MODE: false,
    ...over,
  });
  const fakeNav = (over = {}) => ({ userAgent: WIN_CHROME, platform: "Win32", maxTouchPoints: 0, ...over });

  it("portal mode → suppressed", () => {
    const env = detectEnv({ navigator: fakeNav(), window: fakeWin({ WK_PORTAL_MODE: true }) });
    assert.equal(env.suppressed, true);
  });
  it("Electron UA → suppressed", () => {
    const env = detectEnv({ navigator: fakeNav({ userAgent: WIN_CHROME + " Electron/28.0.0" }), window: fakeWin() });
    assert.equal(env.suppressed, true);
  });
  it("display-mode standalone → standalone", () => {
    const env = detectEnv({ navigator: fakeNav(), window: fakeWin({ matchMedia: () => ({ matches: true }) }) });
    assert.equal(env.standalone, true);
  });
  it("iOS cũ (navigator.standalone) → standalone", () => {
    const env = detectEnv({ navigator: fakeNav({ standalone: true }), window: fakeWin() });
    assert.equal(env.standalone, true);
  });
  it("đã dismiss (localStorage) → dismissed", () => {
    const env = detectEnv({ navigator: fakeNav(), window: fakeWin({ localStorage: { getItem: (k) => (k === InstallPrompt.DISMISS_KEY ? "1" : null) } }) });
    assert.equal(env.dismissed, true);
  });
  it("iPhone → ios", () => {
    const env = detectEnv({
      navigator: fakeNav({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15", platform: "iPhone", maxTouchPoints: 5 }),
      window: fakeWin(),
    });
    assert.equal(env.ios, true);
    assert.equal(env.suppressed, false);
  });
  it("thiếu navigator/window → không crash, mặc định an toàn", () => {
    const env = detectEnv({ navigator: {}, window: {} });
    assert.equal(env.ios, false);
    assert.equal(env.standalone, false);
    assert.equal(env.suppressed, false);
    assert.equal(env.dismissed, false);
  });
});

describe("tích hợp tĩnh — index.html install card", () => {
  const html = read("index.html");

  it("có section#install-card, ẩn mặc định (hidden)", () => {
    assert.match(html, /<section[^>]*id="install-card"[^>]*hidden[^>]*>/, "thiếu section#install-card[hidden]");
  });
  it("card đứng SAU nút CHƠI NGAY trong DOM (không che nút Play)", () => {
    const playIdx = html.indexOf('id="btn-play"');
    const cardIdx = html.indexOf('id="install-card"');
    assert.ok(playIdx > -1 && cardIdx > -1 && cardIdx > playIdx, "install-card phải đứng sau btn-play");
  });
  it("card không dùng position fixed/absolute (không phủ lên UI)", () => {
    const css = html.slice(0, html.indexOf("</style>"));
    const cardRules = [...css.matchAll(/\.(install-cta-card|install-cta|btn-install|install-dismiss)\s*\{([^}]*)\}/g)];
    assert.ok(cardRules.length > 0, "thiếu CSS cho install card");
    for (const [, sel, body] of cardRules) {
      assert.ok(!/position\s*:\s*(fixed|absolute)/.test(body), `${sel} dùng position phủ UI`);
    }
  });
  it("reference #i-install và sprite index.html có symbol i-install", () => {
    assert.ok(html.includes('href="#i-install"'), "card chưa reference #i-install");
    assert.ok(/<symbol[^>]*id="i-install"/.test(html), "sprite thiếu symbol i-install");
  });
  it("có 2 biến thể nút: Cài đặt (prompt) + Đã hiểu (ios)", () => {
    assert.ok(html.includes('id="btn-install"'), "thiếu nút btn-install");
    assert.ok(html.includes('id="btn-install-ios-ok"'), "thiếu nút btn-install-ios-ok");
    assert.ok(html.includes('id="btn-install-dismiss"'), "thiếu nút đóng install-dismiss");
  });
  it("card không chứa emoji", () => {
    const m = html.match(/<section[^>]*id="install-card"[\s\S]*?<\/section>/);
    assert.ok(m, "không tìm thấy install-card");
    assert.ok(!EMOJI.test(m[0]), "install-card chứa emoji");
  });
  it("index.html load js/install-prompt.js sau js/pwa.js", () => {
    const pwaIdx = html.indexOf('src="js/pwa.js"');
    const ipIdx = html.indexOf('src="js/install-prompt.js"');
    assert.ok(pwaIdx > -1 && ipIdx > -1 && ipIdx > pwaIdx, "thiếu script js/install-prompt.js sau pwa.js");
  });
});

describe("tích hợp tĩnh — i18n & sw.js", () => {
  const KEYS = ["pwa.install_title", "pwa.install_sub", "pwa.install_btn", "pwa.install_dismiss", "pwa.ios_title", "pwa.ios_steps", "pwa.ios_btn"];
  const src = read("js/i18n.js");

  it("mọi key pwa.* có mặt 2 lần trong i18n.js (vi + en)", () => {
    for (const k of KEYS) {
      const hits = src.split(`"${k}"`).length - 1;
      assert.equal(hits, 2, `key ${k} xuất hiện ${hits} lần, cần 2 (vi+en)`);
    }
  });
  it("i18n DOM strings của install card không chứa emoji", () => {
    for (const k of KEYS) {
      const re = new RegExp(`"${k.replace(/\./g, "\\.")}":\\s*"([^"]*)"`, "g");
      for (const m of src.matchAll(re)) assert.ok(!EMOJI.test(m[1]), `key ${k} chứa emoji`);
    }
  });
  it("sw.js precache js/install-prompt.js", () => {
    assert.ok(read("sw.js").includes('"js/install-prompt.js"'), "sw.js thiếu js/install-prompt.js trong precache");
  });
  it("pwa.js vẫn giữ contract: beforeinstallprompt → windowkill:installable", () => {
    const pwa = read("js/pwa.js");
    assert.ok(/beforeinstallprompt/.test(pwa), "pwa.js mất beforeinstallprompt handler");
    assert.ok(/windowkill:installable/.test(pwa), "pwa.js mất event windowkill:installable");
    assert.ok(/__deferredInstallPrompt/.test(pwa), "pwa.js mất __deferredInstallPrompt");
  });
});
