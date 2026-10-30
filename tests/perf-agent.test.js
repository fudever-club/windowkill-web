"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { calculateFrameStats, formatMarkdownTable } = require("../scripts/perf-benchmark.js");

describe("Benchmark Agent metrics calculation", () => {
  it("tính đúng avg, p50, p95, p99 và min FPS từ danh sách frame times", () => {
    // 100 frames at ~16.6ms (60 FPS), with a few slow frames (33.3ms = 30 FPS, 50ms = 20 FPS)
    const frameTimes = [];
    for (let i = 0; i < 90; i++) frameTimes.push(16.66);
    for (let i = 0; i < 8; i++) frameTimes.push(33.33);
    frameTimes.push(50.0);
    frameTimes.push(66.6);

    const stats = calculateFrameStats(frameTimes);
    assert.ok(stats.avgFps >= 50 && stats.avgFps <= 60, "avgFps trong khoảng hợp lý");
    assert.equal(Math.round(stats.p50Fps), 60, "p50Fps đạt ~60");
    assert.ok(stats.p95Fps <= stats.p50Fps, "p95Fps thấp hơn hoặc bằng p50Fps");
    assert.ok(stats.minFps <= stats.p99Fps, "minFps nhỏ hơn hoặc bằng p99Fps");
    assert.equal(stats.totalFrames, 100);
    assert.ok(stats.jankFrames >= 2, "phát hiện frame jank (>33.3ms)");
  });

  it("formatMarkdownTable tạo chuỗi markdown hợp lệ với các cột so sánh", () => {
    const baseline = {
      avgFps: 48.5, p50Fps: 52.0, p95Fps: 32.1, p99Fps: 22.4, minFps: 18.0, jankFrames: 42
    };
    const optimized = {
      avgFps: 59.8, p50Fps: 60.0, p95Fps: 58.2, p99Fps: 54.0, minFps: 50.5, jankFrames: 2
    };
    const md = formatMarkdownTable(baseline, optimized);
    assert.match(md, /Chỉ số Hiệu năng/);
    assert.match(md, /Baseline/);
    assert.match(md, /Tối [Ưư]u/i);
    assert.match(md, /59\.8/);
  });
});
