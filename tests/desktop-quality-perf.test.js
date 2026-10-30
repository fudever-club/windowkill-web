"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");

function loadQuality(opts) {
  opts = opts || {};
  const store = Object.assign({}, opts.store || {});
  const nav = Object.assign(
    { userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0", vendor: "", maxTouchPoints: 0, hardwareConcurrency: 8, deviceMemory: 8 },
    opts.navigator || {}
  );
  const sandbox = {
    navigator: nav,
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    },
    location: { search: opts.search || "" },
    console,
  };
  sandbox.window = sandbox;
  sandbox.window.location = sandbox.location;
  sandbox.window.navigator = nav;
  sandbox.window.localStorage = sandbox.localStorage;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/quality.js"), "utf8"), sandbox, { filename: "js/quality.js" });
  return sandbox.window.WKQuality;
}

describe("Desktop Adaptive Quality Scaling", () => {
  it("expose enableDesktopScaling trên WKQuality", () => {
    const Q = loadQuality();
    assert.equal(typeof Q.enableDesktopScaling, "function");
  });

  it("khi enableDesktopScaling(true), Desktop tự động hạ nấc khi FPS thấp kéo dài", () => {
    const Q = loadQuality();
    Q.init();
    assert.equal(Q.tier, "high");
    Q.enableDesktopScaling(true);
    // 2s < 35fps -> hạ 1 nấc xuống balanced
    Q.onFpsSample(30, true);
    Q.onFpsSample(30, true);
    assert.equal(Q.tier, "balanced");
  });
});
