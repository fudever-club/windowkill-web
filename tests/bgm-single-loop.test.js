/* WINDOWKILL — single theme BGM tests (node:test, no deps).
 * CEO chốt 2026-10-04: MỘT theme "High Score Parade" loop liên tục, thay playlist 4 track CC0.
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

describe("A. file theme", () => {
  it("high-score-parade-loop.ogg tồn tại & không rỗng", () => {
    const st = fs.statSync(path.join(ROOT, "assets/music/high-score-parade-loop.ogg"));
    assert.ok(st.size > 100000, "ogg quá nhỏ");
  });
  it("high-score-parade-loop.mp3 tồn tại & không rỗng", () => {
    const st = fs.statSync(path.join(ROOT, "assets/music/high-score-parade-loop.mp3"));
    assert.ok(st.size > 100000, "mp3 quá nhỏ");
  });
  it("ogg có magic OggS", () => {
    const b = fs.readFileSync(path.join(ROOT, "assets/music/high-score-parade-loop.ogg"));
    assert.equal(b.subarray(0, 4).toString("ascii"), "OggS");
  });
  it("mp3 có magic hợp lệ", () => {
    const b = fs.readFileSync(path.join(ROOT, "assets/music/high-score-parade-loop.mp3"));
    const ok = b.subarray(0, 3).toString("ascii") === "ID3" || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0);
    assert.ok(ok, "mp3 magic không hợp lệ");
  });
  it("4 track CC0 cũ đã gỡ", () => {
    for (const f of ["joyfully-loop", "pixel-sprinter-loop", "dog-in-car", "heckin-crows"])
      for (const ext of ["ogg", "mp3"])
        assert.ok(!fs.existsSync(path.join(ROOT, `assets/music/${f}.${ext}`)), `còn sót ${f}.${ext}`);
  });
});

describe("B. js/bgm.js single-loop", () => {
  const src = read("js/bgm.js");
  it("TRACKS chỉ còn 1 theme high-score-parade-loop", () => {
    assert.ok(src.includes('file: "high-score-parade-loop"'), "thiếu theme mới");
    assert.ok(!src.includes("joyfully-loop"), "còn sót track cũ");
    assert.ok(!src.includes("pixel-sprinter"), "còn sót track cũ");
  });
  it("có SINGLE_LOOP flag", () => {
    assert.ok(src.includes("SINGLE_LOOP"), "thiếu SINGLE_LOOP");
  });
  it("player dùng <audio loop> cho single theme", () => {
    assert.ok(src.includes("a.loop = SINGLE_LOOP"), "chưa set audio.loop");
  });
  it("timeupdate KHÔNG crossfade khi single loop", () => {
    assert.ok(src.includes("if (SINGLE_LOOP) return;"), "chưa skip crossfade cho single loop");
  });
  it("giữ fallback procedural khi load lỗi", () => {
    assert.ok(src.includes("fallbackToProcedural"), "mất fallback procedural");
  });
  it("giữ tôn trọng toggle nhạc", () => {
    assert.ok(src.includes("setEnabled"), "mất setEnabled");
  });
});

describe("C. sw.js precache", () => {
  const src = read("sw.js");
  it("precache theme mới (ogg + mp3)", () => {
    assert.ok(src.includes("assets/music/high-score-parade-loop.ogg"));
    assert.ok(src.includes("assets/music/high-score-parade-loop.mp3"));
  });
  it("không còn precache track cũ", () => {
    assert.ok(!src.includes("joyfully-loop"), "còn precache track cũ");
  });
});

describe("D. CREDITS.md", () => {
  const src = read("assets/music/CREDITS.md");
  it("ghi credit High Score Parade", () => {
    assert.ok(src.includes("High Score Parade"), "thiếu credit");
  });
  it("có cảnh báo bản quyền", () => {
    assert.ok(src.toLowerCase().includes("bản quyền") || src.toLowerCase().includes("license"), "thiếu cảnh báo bản quyền");
  });
});
