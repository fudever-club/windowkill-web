/* =====================================================================
 * Shared Web Bundle Stager for Electron (.exe) and Mobile (Capacitor APK)
 * Copies runtime site files, CSS, assets (PNG sprites/audio/icons), and
 * built JS (excluding js/game/ modular source fragments) to targetDir.
 * ===================================================================== */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");

const ROOT_FILES = [
  "index.html",
  "game.html",
  "satellite.html",
  "offline.html",
  "manifest.webmanifest",
  "difficulty.config.json",
];

const COPY_DIRS = ["css", "assets"];
const SKIP_JS_SUBDIRS = new Set(["game"]);

function copyRecursive(src, dst, filterFn) {
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    fs.mkdirSync(dst, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      const full = path.join(src, entry);
      if (filterFn && !filterFn(full, entry)) continue;
      copyRecursive(full, path.join(dst, entry), filterFn);
    }
  } else {
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
  }
}

function stageWebBundle(targetDir) {
  const gameJs = path.join(ROOT, "js", "game.js");
  if (!fs.existsSync(gameJs)) {
    throw new Error("Missing js/game.js — run `node scripts/build-game.js` first.");
  }

  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.mkdirSync(targetDir, { recursive: true });

  for (const rel of ROOT_FILES) {
    const src = path.join(ROOT, rel);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(targetDir, rel));
    }
  }

  for (const dir of COPY_DIRS) {
    const src = path.join(ROOT, dir);
    if (fs.existsSync(src)) {
      copyRecursive(src, path.join(targetDir, dir));
    }
  }

  const jsSrc = path.join(ROOT, "js");
  copyRecursive(jsSrc, path.join(targetDir, "js"), (_full, name) => !SKIP_JS_SUBDIRS.has(name));
  return targetDir;
}

module.exports = { stageWebBundle, ROOT_FILES, COPY_DIRS };
