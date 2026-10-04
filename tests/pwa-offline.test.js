/* WINDOWKILL — PWA offline flow tests (node:test, static analysis sw.js).
 * SYSTEM TEST: service worker là tuyến phòng thủ offline/PWA — version bump,
 * dọn cache cũ, update flow, và precache phải bao hết JS game (từng rớt vào
 * offline.html thiếu JS ở audit 2026-10-02).
 * Chạy: node --test tests/pwa-offline.test.js
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

describe("sw.js — versioning & lifecycle", () => {
  const sw = read("sw.js");
  const ver = (sw.match(/const VERSION\s*=\s*"([^"]+)"/) || [])[1];
  it("P1: VERSION bump đổi tên cache (ép client nhận bản mới sau deploy)", () => {
    assert.ok(ver, "thiếu const VERSION");
    assert.notEqual(ver, "windowkill-v8", "VERSION phải bump khỏi v8 (đổi chiến lược cache)");
    assert.ok(sw.includes("VERSION + \"-core\"") && sw.includes("VERSION + \"-static\""),
      "tên cache phải dẫn xuất từ VERSION");
  });
  it("P2: activate xóa cache cũ cùng prefix, giữ 2 cache hiện tại", () => {
    assert.ok(/\.filter\(\(k\) => k\.indexOf\("windowkill-"\) === 0 && k !== CORE_CACHE && k !== STATIC_CACHE\)/.test(sw),
      "activate phải lọc đúng prefix và giữ cache hiện tại");
    assert.ok(sw.includes("caches.delete(k)"), "phải xóa cache cũ");
  });
  it("P3: update flow — skipWaiting khi install + nhận message SKIP_WAITING + clients.claim", () => {
    assert.ok(sw.includes("self.skipWaiting()"), "thiếu skipWaiting");
    assert.ok(sw.includes('d === "SKIP_WAITING" || (d && d.type === "SKIP_WAITING")'),
      "thiếu handler message SKIP_WAITING (string + object)");
    assert.ok(sw.includes("self.clients.claim()"), "thiếu clients.claim");
  });
});

describe("sw.js — chiến lược cache & offline fallback", () => {
  const sw = read("sw.js");
  it("P4: navigation = network-first, fallback cache rồi offline.html", () => {
    assert.ok(sw.includes("function networkFirstPage"), "thiếu networkFirstPage");
    assert.ok(sw.includes("caches.match(OFFLINE_URL)"), "fallback cuối phải là offline.html");
  });
  it("P5: game core (js/css/html) = network-first — không kẹt JS cũ sau deploy", () => {
    assert.ok(sw.includes("function networkFirstCore"), "thiếu networkFirstCore");
    assert.ok(/function isCoreAsset/.test(sw), "thiếu phân loại core asset");
    assert.ok(!sw.includes("staleWhileRevalidate"), "không còn stale-while-revalidate cho game core");
  });
  it("P5b: asset nặng (audio/ảnh/fonts) = cache-first", () => {
    assert.ok(sw.includes("function cacheFirst"), "thiếu cacheFirst");
    assert.ok(/function isHeavyAsset/.test(sw), "thiếu phân loại heavy asset");
    assert.ok(sw.includes('pathname.indexOf("/assets/") === 0'), "assets/* phải vào cache-first");
  });
  it("P6: chỉ cache same-origin (không chạm tài nguyên cross-origin)", () => {
    assert.ok(sw.includes("req.url.indexOf(self.location.origin) === 0"), "putIfOk phải guard origin");
  });
  it("P6b: /api/* và range request không bị nuốt vào cache", () => {
    assert.ok(sw.includes('url.pathname.startsWith("/api/")'), "thiếu bypass /api/*");
    assert.ok(sw.includes('req.headers.has("range")'), "thiếu bypass range request");
  });
});

describe("sw.js — precache đầy đủ game", () => {
  const sw = read("sw.js");
  const coreM = sw.match(/const CORE_ASSETS = \[([\s\S]*?)\];/);
  const staticM = sw.match(/const STATIC_ASSETS = \[([\s\S]*?)\];/);
  assert.ok(coreM, "thiếu CORE_ASSETS");
  assert.ok(staticM, "thiếu STATIC_ASSETS");
  const collect = (m) => {
    const assets = [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
    const offM = sw.match(/const OFFLINE_URL\s*=\s*"([^"]+)"/);
    if (offM && /\bOFFLINE_URL\b/.test(m[1]) && !assets.includes(offM[1])) assets.push(offM[1]);
    return assets;
  };
  const core = collect(coreM);
  const stat = collect(staticM);
  const all = core.concat(stat);
  it("P7: mọi file JS game (kể cả v2.0) đều được precache vào CORE", () => {
    const need = ["js/game.js", "js/menu.js", "js/api.js", "js/i18n.js", "js/campaign.js",
      "js/meta.js", "js/tutorial.js", "js/monsters.js", "js/bosses.js", "js/v2glue.js",
      "js/upgrades2.js", "js/mobile.js", "js/portal.js", "js/pwa.js", "js/tuning.js",
      "js/audio.js", "js/bgm.js", "js/bg.js", "js/juice.js", "js/cinema.js",
      "js/juice2.js", "js/sfx2.js", "js/stagefx.js", "js/analytics.js",
      "js/quality.js", "js/install-prompt.js"];
    const missing = need.filter((f) => !core.includes(f));
    assert.deepEqual(missing, [], `CORE precache thiếu: ${missing.join(", ")}`);
  });
  it("P7b: trang HTML + manifest + tuning config trong CORE; track BGM đầu trong STATIC", () => {
    for (const f of ["index.html", "game.html", "satellite.html", "offline.html",
      "manifest.webmanifest", "difficulty.config.json", "css/style.css", "css/roles.css"]) {
      assert.ok(core.includes(f), `CORE thiếu ${f}`);
    }
    assert.ok(stat.includes("assets/music/high-score-parade-loop.mp3"), "STATIC thiếu theme BGM");
    assert.ok(stat.includes("assets/music/high-score-parade-loop.ogg"), "STATIC thiếu theme BGM (ogg)");
  });
  it("P8: mọi asset precache tồn tại trên disk (tránh install fail cả SW)", () => {
    const missing = all.filter((a) => !fs.existsSync(path.join(ROOT, a)));
    assert.deepEqual(missing, [], `asset không tồn tại: ${missing.join(", ")}`);
  });
  it("P9: offline.html được precache (fallback cuối có cái để hiện)", () => {
    assert.ok(core.includes("offline.html"), "thiếu offline.html trong CORE precache");
  });
});

describe("pwa.js — toast 'có bản mới' trong game", () => {
  const pwa = read("js/pwa.js");
  it("P10a: phát hiện update qua registration.onupdatefound + state installed", () => {
    assert.ok(pwa.includes('addEventListener("updatefound"'), "thiếu updatefound listener");
    assert.ok(pwa.includes('nw.state === "installed"'), "phải chờ worker mới state installed");
    assert.ok(pwa.includes("navigator.serviceWorker.controller"),
      "chỉ hiện toast khi page đã có controller (không phải lần cài đầu)");
  });
  it("P10b: toast DOM có id riêng, role=status, icon SVG (không emoji), nút đóng", () => {
    assert.ok(pwa.includes("wk-update-toast"), "thiếu id wk-update-toast");
    assert.ok(pwa.includes('setAttribute("role", "status")'), "toast cần role=status");
    assert.ok(pwa.includes('#i-restart'), "toast dùng icon SVG #i-restart");
    assert.ok(pwa.includes('className = "toast-x"'), "toast cần nút đóng");
  });
  it("P10c: bấm toast → SKIP_WAITING; reload CHỈ khi user đã bấm (controllerchange guard)", () => {
    assert.ok(pwa.includes('postMessage({ type: "SKIP_WAITING" })'), "thiếu postMessage SKIP_WAITING");
    assert.ok(pwa.includes('addEventListener("controllerchange"'), "thiếu controllerchange");
    assert.ok(/var updatePending = false/.test(pwa) && /if \(updatePending && !reloading\)/.test(pwa),
      "reload phải guard bằng updatePending (tránh reload ở lần claim đầu tiên)");
  });
  it("P10d: text toast qua i18n (không hardcode ngôn ngữ)", () => {
    assert.ok(pwa.includes('t("pwa.update_text"'), "toast phải dùng I18N key pwa.update_text");
  });
});

describe("js/i18n.js — key toast update đủ 2 ngôn ngữ", () => {
  const i18n = read("js/i18n.js");
  it("P11: pwa.update_text + pwa.update_aria tồn tại trong cả vi và en", () => {
    for (const k of ["pwa.update_text", "pwa.update_aria"]) {
      assert.ok(i18n.includes('"' + k + '"'), `thiếu key ${k}`);
    }
    assert.ok(/"pwa\.update_text": "Có bản mới/.test(i18n), "thiếu bản VI");
    assert.ok(/"pwa\.update_text": "New version available/.test(i18n), "thiếu bản EN");
  });
});
