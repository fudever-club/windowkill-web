"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

describe("Particle Batching Performance & Zero-GC Map", () => {
  it("js/particles.js không khởi tạo new Map() mỗi lần gọi bucketize()", () => {
    const src = fs.readFileSync(path.join(ROOT, "js/particles.js"), "utf8");
    // Kiểm tra không có new Map() bên trong thân hàm bucketize
    const fnMatch = src.match(/function bucketize\([^)]*\)\s*\{([\s\S]*?)(?:return|\})/);
    assert.ok(fnMatch, "tìm thấy function bucketize");
    assert.ok(!fnMatch[1].includes("new Map()"), "vẫn còn new Map() trong function bucketize()");
  });

  it("bucketize tái sử dụng color bucket và trả về mảng bucket hợp lệ", () => {
    const vm = require("node:vm");
    class MockPath2D {
      constructor() { this.rects = []; }
      rect(x, y, w, h) { this.rects.push([x, y, w, h]); }
    }
    const sandbox = {
      console, Math, JSON, Object, Array, String, Number, Boolean,
      Map, Set, isFinite, parseInt, parseFloat,
      Path2D: MockPath2D,
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(ROOT, "js/particles.js"), "utf8"), sandbox);

    const P = sandbox.WKParticles;
    const parts1 = [
      { x: 10, y: 10, t: 0, life: 1, c: "#fff", sz: 2 },
      { x: 20, y: 20, t: 0.5, life: 1, c: "#fff", sz: 2 }
    ];
    const b1 = P.bucketize(parts1);
    assert.equal(b1.length, 1);
    assert.equal(P.bucketCount(b1), 2);

    // Lần gọi thứ 2: không bị sót dữ liệu từ lần trước
    const parts2 = [
      { x: 30, y: 30, t: 0, life: 1, c: "#ff0000", sz: 3 }
    ];
    const b2 = P.bucketize(parts2);
    assert.equal(b2.length, 1);
    assert.equal(b2[0].c, "#ff0000");
    assert.equal(P.bucketCount(b2), 1);
  });
});
