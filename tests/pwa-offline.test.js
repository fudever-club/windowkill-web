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
  it("P1: VERSION bump đổi tên cache (ép client nhận bản mới sau deploy)", () => {
    const m = sw.match(/const VERSION\s*=\s*"([^"]+)"/);
    assert.ok(m, "thiếu const VERSION");
    assert.ok(sw.includes("VERSION + \"-static\"") && sw.includes("VERSION + \"-html\""),
      "tên cache phải dẫn xuất từ VERSION");
  });
  it("P2: activate xóa cache cũ cùng prefix, giữ 2 cache hiện tại", () => {
    assert.ok(/\.filter\(\(k\) => k\.indexOf\("windowkill-"\) === 0 && k !== STATIC_CACHE && k !== HTML_CACHE\)/.test(sw),
      "activate phải lọc đúng prefix và giữ cache hiện tại");
    assert.ok(sw.includes("caches.delete(k)"), "phải xóa cache cũ");
  });
  it("P3: update flow — skipWaiting khi install + nhận message SKIP_WAITING + clients.claim", () => {
    assert.ok(sw.includes("self.skipWaiting()"), "thiếu skipWaiting");
    assert.ok(sw.includes('event.data === "SKIP_WAITING"'), "thiếu handler message SKIP_WAITING");
    assert.ok(sw.includes("self.clients.claim()"), "thiếu clients.claim");
  });
});

describe("sw.js — chiến lược cache & offline fallback", () => {
  const sw = read("sw.js");
  it("P4: navigation = network-first, fallback cache rồi offline.html", () => {
    assert.ok(sw.includes("function networkFirstPage"), "thiếu networkFirstPage");
    assert.ok(sw.includes("caches.match(OFFLINE_URL)"), "fallback cuối phải là offline.html");
  });
  it("P5: static = stale-while-revalidate (không kẹt JS cũ sau deploy)", () => {
    assert.ok(sw.includes("function staleWhileRevalidate"), "thiếu staleWhileRevalidate");
  });
  it("P6: chỉ cache same-origin (không chạm tài nguyên cross-origin)", () => {
    assert.ok(sw.includes("req.url.indexOf(self.location.origin) === 0"), "putIfOk phải guard origin");
  });
});

describe("sw.js — precache đầy đủ game", () => {
  const sw = read("sw.js");
  const m = sw.match(/const STATIC_ASSETS = \[([\s\S]*?)\];/);
  assert.ok(m, "thiếu STATIC_ASSETS");
  const assets = [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  // OFFLINE_URL là const — resolve giá trị thật
  const offM = sw.match(/const OFFLINE_URL\s*=\s*"([^"]+)"/);
  if (offM && /\bOFFLINE_URL\b/.test(m[1]) && !assets.includes(offM[1])) assets.push(offM[1]);
  it("P7: mọi file JS game (kể cả v2.0) đều được precache", () => {
    const need = ["js/game.js", "js/menu.js", "js/api.js", "js/i18n.js", "js/campaign.js",
      "js/meta.js", "js/tutorial.js", "js/monsters.js", "js/bosses.js", "js/v2glue.js",
      "js/upgrades2.js", "js/mobile.js", "js/portal.js", "js/pwa.js", "js/tuning.js"];
    const missing = need.filter((f) => !assets.includes(f));
    assert.deepEqual(missing, [], `precache thiếu: ${missing.join(", ")}`);
  });
  it("P8: mọi asset precache tồn tại trên disk (tránh install fail cả SW)", () => {
    const missing = assets.filter((a) => !fs.existsSync(path.join(ROOT, a)));
    assert.deepEqual(missing, [], `asset không tồn tại: ${missing.join(", ")}`);
  });
  it("P9: offline.html được precache (fallback cuối có cái để hiện)", () => {
    assert.ok(assets.includes("offline.html"), "thiếu offline.html trong precache");
  });
});
