/* WINDOWKILL v2.0 — rebalance độ khó (CEO 2026-10-01) + campaign 5 stages.
 * Static test: assert các con số đã chốt trong js/game.js / difficulty.config.json / js/campaign.js. */
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, it } = require("node:test");

const ROOT = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

describe("CEO rebalance — chill thật chill", () => {
  const src = read("js/game.js");
  const chill = src.match(/chill:\s*\{([^}]*)\}/s);
  assert.ok(chill, "DIFFS.chill tồn tại");
  const c = chill[1];
  const num = (k) => { const m = c.match(new RegExp(k + ":\\s*([0-9.]+)")); return m ? parseFloat(m[1]) : null; };
  assert.equal(num("hpMul"), 0.55, "chill hpMul 0.55");
  assert.equal(num("spMul"), 0.75, "chill spMul 0.75");
  assert.equal(num("spawnMul"), 1.5, "chill spawnMul 1.5");
  assert.equal(num("chew"), 1.7, "chill chew 1.7");
  assert.equal(num("pickupBoost"), 1.5, "chill pickupBoost 1.5");
  assert.equal(num("dropRateMul"), 1.2, "chill dropRateMul 1.2");
  assert.equal(num("bossBulletMul"), 0.8, "chill bossBulletMul 0.8");
  assert.equal(num("bossAtkMul"), 1.3, "chill bossAtkMul 1.3");
});

describe("CEO rebalance — normal wave 1–3 onboarding", () => {
  const src = read("js/game.js");
  assert.match(src, /w1_3|wave <= 3|n <= 3/, "có nhánh wave 1–3");
  assert.match(src, /0\.7/, "count ×0.7 wave 1–3");
  assert.match(src, /spawnMul \* 1\.4|1\.4/, "spawn ×1.4 wave 1–3");
});

describe("CEO rebalance — hardcore giữ nguyên", () => {
  const src = read("js/game.js");
  const hard = src.match(/hardcore:\s*\{([^}]*)\}/s);
  assert.ok(hard, "DIFFS.hardcore tồn tại");
  assert.match(hard[1], /hpMul:\s*1\.45/, "hardcore hpMul 1.45 (không đổi)");
});

describe("difficulty.config.json đồng bộ rebalance", () => {
  const cfg = JSON.parse(read("difficulty.config.json")).difficulties;
  assert.equal(cfg.chill.monster_hp_mult, 0.55, "chill monster_hp_mult 0.55");
  assert.equal(cfg.chill.monster_speed_mult, 0.75, "chill monster_speed_mult 0.75");
  assert.equal(cfg.chill.ship_hp, 4, "chill ship_hp 4");
});

describe("Campaign v2.0 — 5 stages", () => {
  const src = read("js/campaign.js");
  assert.match(src, /STAGES/, "campaign.js có STAGES");
  const ids = [...src.matchAll(/\bid:\s*([1-5])(?=[,\s])/g)].map((m) => parseInt(m[1], 10));
  for (const n of [1, 2, 3, 4, 5]) assert.ok(ids.includes(n), `stage ${n} tồn tại`);
  assert.match(src, /MÀN HÌNH XANH/, "stage 1");
  assert.match(src, /TRÀN BỘ NHỚ/, "stage 5");
});

describe("V2 glue — hook points trong game.js", () => {
  const src = read("js/game.js");
  for (const h of ["V2.boot(", "V2.onKill(", "V2.onWaveClear(", "V2.onGameOver(", "V2.hitstop(", "V2.drawOver(", "V2.stageWave(", "window.G = G"]) {
    assert.ok(src.includes(h), `game.js chứa hook ${h}`);
  }
  const glue = read("js/v2glue.js");
  assert.match(glue, /window\.V2\s*=/, "v2glue.js export window.V2");
});
