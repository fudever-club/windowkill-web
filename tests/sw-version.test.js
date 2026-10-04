/* WINDOWKILL — tests cho SW auto-version (scripts/bump-sw.js).
 * SYSTEM TEST: hết thời PR "chỉ để bump sw.js" — version do máy stamp
 * (pre-commit hook), CI verify bằng --check. Test ở đây đảm bảo:
 *  - format VERSION luôn đúng chuẩn auto-stamp
 *  - stamper viết lại đúng dòng VERSION, không đụng phần còn lại của file
 *  - --check pass trên repo thật
 * Chạy: node --test tests/sw-version.test.js
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const SCRIPT = path.join(ROOT, "scripts", "bump-sw.js");
const AUTO_RE = /^windowkill-\d{8}T\d{6}Z-[0-9a-f]{7,40}$/;

function run(args, cwd = ROOT) {
  return execFileSync("node", [SCRIPT, ...args], { encoding: "utf8", cwd });
}

describe("bump-sw.js — auto-stamp SW cache version", () => {
  it("S1: sw.js VERSION theo format auto-stamp", () => {
    const sw = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");
    const m = sw.match(/const VERSION\s*=\s*"([^"]+)"/);
    assert.ok(m, "thiếu const VERSION trong sw.js");
    assert.match(m[1], AUTO_RE, `VERSION không đúng format auto-stamp: ${m[1]}`);
  });

  it("S2: stamper viết lại đúng dòng VERSION, giữ nguyên phần còn lại", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wk-sw-"));
    const fixture = path.join(dir, "sw.js");
    const before =
      '/* header */\nconst VERSION = "windowkill-20000101T000000Z-abc1234"; // AUTO-STAMP\n' +
      'const X = "windowkill-keepme";\n';
    fs.writeFileSync(fixture, before);

    run([fixture]);
    const after = fs.readFileSync(fixture, "utf8");
    const m = after.match(/const VERSION\s*=\s*"([^"]+)"/);
    assert.ok(m, "stamper làm mất dòng VERSION");
    assert.match(m[1], AUTO_RE);
    assert.notEqual(m[1], "windowkill-20000101T000000Z-abc1234", "stamper không đổi giá trị");
    assert.ok(after.includes('const X = "windowkill-keepme";'), "stamper đụng dòng không liên quan");
    assert.ok(after.startsWith("/* header */\n"), "stamper đụng header file");
    assert.ok(after.includes("// AUTO-STAMP"), "thiếu marker AUTO-STAMP sau khi stamp");

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("S3: stamper báo lỗi khi file không có dòng VERSION auto-stamp", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wk-sw-"));
    const fixture = path.join(dir, "sw.js");
    fs.writeFileSync(fixture, "// không có version\n");
    assert.throws(() => run([fixture]), /không tìm thấy dòng VERSION/);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("S4: --check pass trên repo thật", () => {
    const out = run(["--check"]);
    assert.match(out, /ok: format VERSION hợp lệ/);
  });

  it("S5: --help in được cách dùng", () => {
    assert.match(run(["--help"]), /--check/);
  });
});
