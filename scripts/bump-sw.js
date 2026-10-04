#!/usr/bin/env node
/*
 * WINDOWKILL — tự động stamp SW cache version. HẾT BUMP TAY sw.js.
 *
 * Cơ chế (phương án "pre-commit hook + CI check"):
 *   sw.js giữ dòng `const VERSION = "windowkill-<UTC timestamp>-<short SHA>";`
 *   - timestamp (UTC, `YYYYMMDDTHHMMSSZ`): đảm bảo mỗi stamp là duy nhất → mỗi
 *     stamp đổi byte sw.js → browser phát hiện SW mới → install → cache mới →
 *     client nhận assets mới sau deploy.
 *   - short SHA: SHA của commit mà stamp được tạo *trên nó* (tức parent commit
 *     tại thời điểm pre-commit hook chạy) — để truy vết, không dùng để verify
 *     "khớp commit hiện tại" (bất khả thi ở pre-commit time: SHA của commit
 *     đang tạo chưa tồn tại — chicken-and-egg).
 *
 * Ba chế độ:
 *   node scripts/bump-sw.js [path/sw.js]  — stamp (mặc định: <repo>/sw.js)
 *   node scripts/bump-sw.js --hook        — chế độ pre-commit: nếu file staged
 *                                           chạm site assets → stamp + `git add sw.js`
 *   node scripts/bump-sw.js --check       — chế độ CI verify:
 *                                           1. format VERSION hợp lệ
 *                                           2. PR đổi site files mà sw.js KHÔNG
 *                                              restamp → FAIL (bắt trường hợp
 *                                              bypass hook / quên chạy script)
 *                                           3. SHA trong stamp là ancestor của
 *                                              HEAD (best-effort: shallow clone
 *                                              thì warn + bỏ qua)
 *
 * Bật hook một lần mỗi clone:  git config core.hooksPath .githooks
 * (xem .githooks/pre-commit — hook chỉ gọi `node scripts/bump-sw.js --hook`).
 *
 * Không dependencies, chỉ dùng git + node stdlib.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync, execSync } = require("child_process");

// Đường dẫn (file/dir) mà nếu đổi thì client cần cache mới.
// GIỮ ĐỒNG BỘ với .githooks/pre-commit (hook gọi --hook nên thực ra chỉ cần ở đây).
const SITE_PATHS = [
  "sw.js",
  "index.html",
  "game.html",
  "satellite.html",
  "offline.html",
  "manifest.webmanifest",
  "robots.txt",
  "sitemap.xml",
  "vercel.json",
  "js/",
  "css/",
  "assets/",
];

const VERSION_LINE_RE = /^const VERSION = "windowkill-[^"]*";.*$/m;
const VERSION_VALUE_RE = /^windowkill-(\d{8}T\d{6}Z)-([0-9a-f]{7,40})$/;

function repoRoot() {
  return execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
}

function git(args, opts = {}) {
  return execFileSync("git", args, { encoding: "utf8", stdio: "pipe", ...opts }).trim();
}

function utcStamp(d = new Date()) {
  // 2026-10-04T06:24:22.123Z -> 20261004T062422Z
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
}

function currentShortSha() {
  return git(["rev-parse", "--short", "HEAD"]);
}

function readVersion(swPath) {
  const src = fs.readFileSync(swPath, "utf8");
  const m = src.match(/const VERSION\s*=\s*"([^"]+)"/);
  return m ? m[1] : null;
}

function stamp(swPath) {
  const version = `windowkill-${utcStamp()}-${currentShortSha()}`;
  const src = fs.readFileSync(swPath, "utf8");
  if (!VERSION_LINE_RE.test(src)) {
    console.error(`LỖI: không tìm thấy dòng VERSION auto-stamp trong ${swPath}`);
    process.exit(1);
  }
  const line = `const VERSION = "${version}"; // AUTO-STAMP: không sửa tay — xem scripts/bump-sw.js`;
  const next = src.replace(VERSION_LINE_RE, line);
  fs.writeFileSync(swPath, next);
  console.log(`stamped ${swPath}: ${version}`);
  return version;
}

function hookMode() {
  const root = repoRoot();
  const staged = git(["diff", "--cached", "--name-only", "--diff-filter=ACMR"], { cwd: root })
    .split("\n")
    .filter(Boolean);
  const hit = staged.some((f) => SITE_PATHS.some((p) => (p.endsWith("/") ? f.startsWith(p) : f === p)));
  if (!hit) {
    console.log("pre-commit: không chạm site assets — bỏ qua stamp sw.js");
    return;
  }
  const swPath = path.join(root, "sw.js");
  const version = stamp(swPath);
  git(["add", "sw.js"], { cwd: root });
  console.log(`pre-commit: đã stamp sw.js (${version}) và stage lại`);
}

function resolveBase() {
  if (process.env.SW_CHECK_BASE) return process.env.SW_CHECK_BASE;
  if (process.env.GITHUB_BASE_REF) return `origin/${process.env.GITHUB_BASE_REF}`;
  try {
    git(["rev-parse", "--verify", "HEAD~1"]);
    return "HEAD~1";
  } catch {
    return null;
  }
}

function checkMode() {
  const root = repoRoot();
  const swPath = path.join(root, "sw.js");
  let fail = 0;

  // 1. format
  const version = readVersion(swPath);
  const m = version && version.match(VERSION_VALUE_RE);
  if (!m) {
    console.error(
      `FAIL: sw.js VERSION không đúng format auto-stamp (thấy: ${JSON.stringify(version)}). ` +
        `Chạy: node scripts/bump-sw.js`
    );
    process.exit(1);
  }
  console.log(`ok: format VERSION hợp lệ (${version})`);
  const [, , sha] = m;

  // 2. staleness: PR đổi site files mà sw.js không restamp → FAIL
  const base = resolveBase();
  if (!base) {
    console.log("warn: không resolve được base ref — bỏ qua kiểm tra staleness");
  } else {
    let changed = [];
    let swTouched = [];
    try {
      changed = git(["diff", "--name-only", `${base}...HEAD`, "--", ...SITE_PATHS], { cwd: root })
        .split("\n")
        .filter(Boolean);
      swTouched = git(["diff", "--name-only", `${base}...HEAD`, "--", "sw.js"], { cwd: root })
        .split("\n")
        .filter(Boolean);
    } catch (e) {
      console.log(`warn: không diff được với base ${base} (${e.message.split("\n")[0]}) — bỏ qua kiểm tra staleness`);
    }
    if (changed.length > 0 && swTouched.length === 0) {
      console.error(
        `FAIL: PR đổi ${changed.length} site file(s) mà sw.js không được restamp.\n` +
          `  Chạy: node scripts/bump-sw.js   (hoặc bật hook: git config core.hooksPath .githooks)`
      );
      fail = 1;
    } else if (changed.length > 0) {
      console.log(`ok: ${changed.length} site file(s) đổi và sw.js đã restamp`);
    } else {
      console.log("ok: không đổi site files — không cần restamp");
    }
  }

  // 3. SHA trong stamp là ancestor của HEAD (best-effort)
  try {
    git(["cat-file", "-e", sha]);
  } catch {
    console.log(`warn: SHA ${sha} không resolve được (shallow clone?) — bỏ qua kiểm tra ancestor`);
    process.exit(fail);
  }
  try {
    git(["merge-base", "--is-ancestor", sha, "HEAD"]);
    console.log(`ok: SHA ${sha} là ancestor của HEAD`);
  } catch {
    console.error(`FAIL: SHA ${sha} trong VERSION không phải ancestor của HEAD — stamp lỗi thời, chạy lại: node scripts/bump-sw.js`);
    fail = 1;
  }
  process.exit(fail);
}

function help() {
  console.log(`Dùng:
  node scripts/bump-sw.js [path/sw.js]  stamp VERSION mới vào sw.js
  node scripts/bump-sw.js --hook        chế độ pre-commit hook (tự gọi, không chạy tay)
  node scripts/bump-sw.js --check       chế độ CI verify
  node scripts/bump-sw.js --help        trợ giúp này`);
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) return help();
  if (args.includes("--hook")) return hookMode();
  if (args.includes("--check")) return checkMode();
  const target = args.find((a) => !a.startsWith("--"));
  stamp(target ? path.resolve(target) : path.join(repoRoot(), "sw.js"));
}

main();
