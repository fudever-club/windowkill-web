/* WINDOWKILL — fix/audit-batch-1, P1: CSP giết backend.
 *
 * Bối cảnh: inline <script>window.WK_API_BASE=...</script> trong index.html bị
 * chính CSP `script-src 'self'` chặn → biến không set; game.html không set ở đâu;
 * `connect-src 'self'` còn chặn cả fly.dev → telemetry/leaderboard/cloud scores
 * chết lặng. Fix: js/config.js (file ngoài, CSP-safe) nạp trước js/api.js /
 * js/analytics.js + connect-src mở fly.dev.
 *
 * Chạy: node --test tests/csp-backend.test.js
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const FLY = "https://windowkill-web.fly.dev";

function cspMeta(html) {
  const m = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/);
  assert.ok(m, "thiếu CSP meta tag");
  return m[1];
}
/** Mọi <script> trong HTML phải có src (không inline — script-src 'self' chặn). */
function inlineScripts(html) {
  const noComments = html.replace(/<!--[\s\S]*?-->/g, ""); // bỏ comment HTML
  const bad = [];
  for (const m of noComments.matchAll(/<script(?![^>]*\bsrc\b)[^>]*>/gi)) bad.push(m[0]);
  return bad;
}
function scriptOrder(html, first, second) {
  const a = html.indexOf(first), b = html.indexOf(second);
  assert.ok(a !== -1, `thiếu ${first}`);
  assert.ok(b !== -1, `thiếu ${second}`);
  assert.ok(a < b, `${first} phải nạp TRƯỚC ${second}`);
}

describe("P1 CSP — js/config.js set WK_API_BASE (CSP-safe)", () => {
  it("config.js tồn tại và được smoke test resolve", () => {
    assert.ok(fs.existsSync(path.join(ROOT, "js/config.js")));
  });
  it("config.js set đúng backend Fly khi chưa có giá trị", () => {
    const sandbox = {};
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(read("js/config.js"), sandbox, { filename: "js/config.js" });
    assert.equal(sandbox.window.WK_API_BASE, FLY);
  });
  it("config.js KHÔNG override giá trị đã set trước (dev override)", () => {
    const sandbox = { WK_API_BASE: "http://localhost:3001" };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(read("js/config.js"), sandbox, { filename: "js/config.js" });
    assert.equal(sandbox.window.WK_API_BASE, "http://localhost:3001");
  });
});

describe("P1 CSP — không còn inline script", () => {
  for (const page of ["index.html", "game.html"]) {
    it(`${page}: mọi <script> đều có src`, () => {
      assert.deepEqual(inlineScripts(read(page)), [], "còn inline script — CSP sẽ chặn");
    });
  }
});

describe("P1 CSP — thứ tự nạp config trước backend client", () => {
  it("index.html: js/config.js trước js/api.js", () => {
    scriptOrder(read("index.html"), "js/config.js", "js/api.js");
  });
  it("game.html: js/config.js trước js/analytics.js", () => {
    scriptOrder(read("game.html"), "js/config.js", "js/analytics.js");
  });
});

describe("P1 CSP — connect-src mở fly.dev, frame-ancestors chỉ qua header", () => {
  for (const page of ["index.html", "game.html"]) {
    it(`${page}: connect-src cho phép ${FLY}`, () => {
      const csp = cspMeta(read(page));
      assert.match(csp, new RegExp(`connect-src[^;]*${FLY.replace(/\./g, "\\.")}`));
    });
    it(`${page}: frame-ancestors KHÔNG nằm trong meta (chỉ có tác dụng qua HTTP header)`, () => {
      assert.ok(!cspMeta(read(page)).includes("frame-ancestors"), "còn frame-ancestors trong meta");
    });
    it(`${page}: vẫn giữ script-src 'self'`, () => {
      assert.match(cspMeta(read(page)), /script-src 'self'/);
    });
  }
  it("vercel.json giữ frame-ancestors qua HTTP header (cho phép nhúng itch.io)", () => {
    const v = read("vercel.json");
    assert.match(v, /"Content-Security-Policy"/);
    assert.match(v, /frame-ancestors/);
  });
});

describe("P1 CSP — backend client đọc WK_API_BASE", () => {
  it("js/api.js ưu tiên window.WK_API_BASE", () => {
    assert.match(read("js/api.js"), /window\.WK_API_BASE/);
  });
  it("js/analytics.js (game.html) ưu tiên window.WK_API_BASE", () => {
    assert.match(read("js/analytics.js"), /window\.WK_API_BASE/);
  });
  it("sw.js precache js/config.js (offline vẫn có config)", () => {
    assert.match(read("sw.js"), /"js\/config\.js"/);
  });
});
