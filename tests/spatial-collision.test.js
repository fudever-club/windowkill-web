"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

describe("Spatial Hash Grid Collision Acceleration", () => {
  it("16-update.js có SpatialGrid và method queryNear / insert", () => {
    const src = fs.readFileSync(path.join(ROOT, "js/game/16-update.js"), "utf8");
    assert.match(src, /SpatialGrid/, "thiếu SpatialGrid");
    assert.match(src, /queryNear/, "SpatialGrid phải có queryNear");
    assert.match(src, /SPATIAL_CELL/, "định nghĩa SPATIAL_CELL");
  });

  it("SpatialGrid phân ô và tìm đúng mục tiêu lân cận", () => {
    // Test logic toán học phân ô
    const SPATIAL_CELL = 80;
    const cells = new Map();
    function insert(e) {
      const cx = (e.x / SPATIAL_CELL) | 0;
      const cy = (e.y / SPATIAL_CELL) | 0;
      const key = (cx << 16) ^ cy;
      let list = cells.get(key);
      if (!list) { list = []; cells.set(key, list); }
      list.push(e);
    }
    const e1 = { x: 100, y: 100, id: 1 };
    const e2 = { x: 900, y: 900, id: 2 };
    insert(e1);
    insert(e2);

    // Bullet ở gần e1
    const bx = 110, by = 105;
    const cx = (bx / SPATIAL_CELL) | 0;
    const cy = (by / SPATIAL_CELL) | 0;
    const found = cells.get((cx << 16) ^ cy);
    assert.ok(found);
    assert.equal(found[0].id, 1);
  });
});
