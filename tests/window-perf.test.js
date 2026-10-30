"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

describe("Window Motion Caching and IPC Throttling", () => {
  it("01-winctrl.js định nghĩa CachedWinState để cache hình học cửa sổ", () => {
    const src = fs.readFileSync(path.join(ROOT, "js/game/01-winctrl.js"), "utf8");
    assert.match(src, /CachedWinState/, "thiếu CachedWinState");
    assert.match(src, /sync:\s*function/, "CachedWinState phải có method sync");
  });

  it("applyWindowMotion sử dụng CachedWinState thay vì truy vấn DOM screenX/screenY mỗi frame", () => {
    const src = fs.readFileSync(path.join(ROOT, "js/game/01-winctrl.js"), "utf8");
    assert.match(src, /CachedWinState\.sync\(/);
    assert.match(src, /CachedWinState\.screenX/);
  });
});
