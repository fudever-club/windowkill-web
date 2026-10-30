#!/usr/bin/env node
"use strict";

/**
 * perf-benchmark.js — Đo lường và tính toán chỉ số hiệu năng (FPS, Frame Times, Jank, GC)
 * của WINDOWKILL Web Edition.
 */

function calculateFrameStats(frameTimes) {
  if (!frameTimes || frameTimes.length === 0) {
    return {
      totalFrames: 0,
      avgFps: 0,
      p50Fps: 0,
      p95Fps: 0,
      p99Fps: 0,
      minFps: 0,
      jankFrames: 0
    };
  }

  const valid = frameTimes.filter(t => typeof t === "number" && t > 0);
  const n = valid.length;
  if (n === 0) {
    return {
      totalFrames: 0, avgFps: 0, p50Fps: 0, p95Fps: 0, p99Fps: 0, minFps: 0, jankFrames: 0
    };
  }

  // Chuyển frame time (ms) thành FPS tức thời
  const fpsList = valid.map(t => 1000 / t);
  const sortedFps = [...fpsList].sort((a, b) => a - b); // tăng dần: nhỏ nhất ở đầu

  const totalTime = valid.reduce((acc, t) => acc + t, 0);
  const avgFps = (n * 1000) / totalTime;

  // Percentiles
  const p01Idx = Math.floor(n * 0.01);
  const p05Idx = Math.floor(n * 0.05);
  const p50Idx = Math.floor(n * 0.50);

  const minFps = sortedFps[0];
  const p99Fps = sortedFps[p01Idx]; // 1% worst fps = p99 frame time
  const p95Fps = sortedFps[p05Idx]; // 5% worst fps = p95 frame time
  const p50Fps = sortedFps[p50Idx]; // median fps

  // Jank frames: frame kéo dài > 33.3ms (tương đương < 30 FPS hoặc lỡ v-sync)
  const jankFrames = valid.filter(t => t > 33.33).length;

  return {
    totalFrames: n,
    avgFps: Math.round(avgFps * 10) / 10,
    p50Fps: Math.round(p50Fps * 10) / 10,
    p95Fps: Math.round(p95Fps * 10) / 10,
    p99Fps: Math.round(p99Fps * 10) / 10,
    minFps: Math.round(minFps * 10) / 10,
    jankFrames: jankFrames
  };
}

function formatMarkdownTable(baseline, optimized) {
  const diffAvg = (optimized.avgFps - baseline.avgFps).toFixed(1);
  const signAvg = optimized.avgFps >= baseline.avgFps ? "+" : "";

  const diffP95 = (optimized.p95Fps - baseline.p95Fps).toFixed(1);
  const signP95 = optimized.p95Fps >= baseline.p95Fps ? "+" : "";

  const diffMin = (optimized.minFps - baseline.minFps).toFixed(1);
  const signMin = optimized.minFps >= baseline.minFps ? "+" : "";

  const diffJank = (optimized.jankFrames - baseline.jankFrames);
  const signJank = diffJank <= 0 ? "" : "+";

  return `| Chỉ số Hiệu năng | Baseline Ban Đầu | Đã Tối Ưu | Chênh lệch (Delta) |
| :--- | :--- | :--- | :--- |
| **FPS Trung bình (Avg)** | ${baseline.avgFps} FPS | **${optimized.avgFps} FPS** | \`${signAvg}${diffAvg} FPS\` |
| **Median FPS (p50)** | ${baseline.p50Fps} FPS | **${optimized.p50Fps} FPS** | \`${(optimized.p50Fps - baseline.p50Fps).toFixed(1)} FPS\` |
| **p95 Khung hình yếu** | ${baseline.p95Fps} FPS | **${optimized.p95Fps} FPS** | \`${signP95}${diffP95} FPS\` |
| **p99 / FPS Tối thiểu (Min)** | ${baseline.minFps} FPS | **${optimized.minFps} FPS** | \`${signMin}${diffMin} FPS\` |
| **Số frame bị khựng (Jank >33ms)** | ${baseline.jankFrames} frames | **${optimized.jankFrames} frames** | \`${signJank}${diffJank} frames\` |`;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    calculateFrameStats,
    formatMarkdownTable
  };
}
