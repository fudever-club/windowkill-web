#!/usr/bin/env node
/*
 * WINDOWKILL — build js/game.js từ các module nguồn js/game/*.js
 *
 * Lý do: js/game.js là god-file (~5.300 dòng), mọi PR đều chạm vào gây
 * merge conflict. Tách SOURCE thành module nhỏ theo trách nhiệm, rồi nối
 * lại thành js/game.js (file ship cho browser) bằng script này.
 *
 * QUY TẮC:
 * - SỬA CODE TRONG js/game/*.js, KHÔNG sửa trực tiếp js/game.js
 *   (file đó là GENERATED — đầu file có ghi rõ).
 * - Sau khi sửa source: chạy `node scripts/build-game.js` để rebuild.
 * - Thứ tự nối file lấy từ js/game/MANIFEST.txt (không tự đoán theo tên).
 *
 * Chế độ:
 *   node scripts/build-game.js          — build (ghi đè js/game.js)
 *   node scripts/build-game.js --check  — CI verify: build ra bộ nhớ đệm,
 *                                          so byte với js/game.js hiện tại,
 *                                          FAIL nếu lệch (quên build).
 *   node scripts/build-game.js --hook   — pre-commit: nếu file staged chạm
 *                                          js/game/* → build + git add js/game.js
 *
 * Không dependencies, chỉ dùng git + node stdlib.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const SRC_DIR = path.join(ROOT, "js", "game");
const MANIFEST = path.join(SRC_DIR, "MANIFEST.txt");
const OUT = path.join(ROOT, "js", "game.js");

const GENERATED_NOTICE = `/* =====================================================================
   GENERATED FILE — KHÔNG SỬA TRỰC TIẾP.
   Nguồn: js/game/*.js (thứ tự trong js/game/MANIFEST.txt).
   Sửa source rồi chạy: node scripts/build-game.js
   ===================================================================== */
`;

function readManifest() {
  const list = fs.readFileSync(MANIFEST, "utf8").split("\n").map(s => s.trim()).filter(Boolean);
  if (list.length === 0) throw new Error("MANIFEST.txt rỗng");
  return list;
}

// Toàn bộ game chạy trong 1 IIFE (khớp bản gốc trước khi tách):
// mỗi module là fragment, KHÔNG tự bọc IIFE để node --check từng file được.
const IIFE_OPEN = '"use strict";\n(() => {\n';
const IIFE_CLOSE = "})();\n"; // module cuối đã kết thúc bằng newline

function build() {
  const files = readManifest();
  const chunks = files.map(f => {
    const p = path.join(SRC_DIR, f);
    if (!fs.existsSync(p)) throw new Error(`thiếu source module: js/game/${f}`);
    return fs.readFileSync(p, "utf8");
  });
  // Mỗi source file kết thúc bằng đúng 1 newline; nối trực tiếp trong IIFE.
  return GENERATED_NOTICE + IIFE_OPEN + chunks.join("") + IIFE_CLOSE;
}

function main() {
  const mode = process.argv[2] || "";
  if (mode === "--check") {
    const built = build();
    const cur = fs.readFileSync(OUT, "utf8");
    if (built === cur) {
      console.log("OK: js/game.js khớp với js/game/* (không cần rebuild)");
      return;
    }
    console.error("FAIL: js/game.js LỖI THỜI so với js/game/* — chạy: node scripts/build-game.js");
    process.exit(1);
  }
  if (mode === "--hook") {
    let staged = "";
    try {
      staged = execFileSync("git", ["diff", "--cached", "--name-only"], { encoding: "utf8" });
    } catch { return; }
    if (!staged.split("\n").some(f => f.startsWith("js/game/") && f !== "js/game.js")) return;
    fs.writeFileSync(OUT, build());
    execFileSync("git", ["add", OUT]);
    console.log("build-game.js --hook: đã rebuild js/game.js từ js/game/*");
    return;
  }
  fs.writeFileSync(OUT, build());
  console.log(`built ${path.relative(ROOT, OUT)} từ ${readManifest().length} modules`);
}

main();
