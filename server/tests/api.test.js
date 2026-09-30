/* WINDOWKILL backend — API tests (node:test, zero dependencies).
 * Boots the real HTTP server on an ephemeral port with a throwaway SQLite file.
 */
"use strict";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createApp } from "../src/server.js";

let app, base;

test.before(async () => {
  const dir = mkdtempSync(join(tmpdir(), "wk-test-"));
  app = createApp({
    dbPath: join(dir, "test.db"),
    port: 0,
    host: "127.0.0.1",
    rateLimitRead: 1000,
    rateLimitWrite: 1000,
  });
  const addr = await app.listen();
  base = `http://127.0.0.1:${addr.port}`;
});

test.after(async () => {
  await app.close();
});

async function req(method, path, body) {
  const r = await fetch(base + path, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await r.json();
  return { status: r.status, json, headers: r.headers };
}

test("GET /api/health returns ok + security headers", async () => {
  const r = await req("GET", "/api/health");
  assert.equal(r.status, 200);
  assert.equal(r.json.ok, true);
  assert.equal(r.json.data.status, "up");
  assert.equal(r.headers.get("x-content-type-options"), "nosniff");
  assert.equal(r.headers.get("x-frame-options"), "DENY");
  assert.equal(r.headers.get("content-security-policy"), "default-src 'none'; frame-ancestors 'none'");
  // same-origin default: no CORS header
  assert.equal(r.headers.get("access-control-allow-origin"), null);
});

test("profiles: create, list, validation", async () => {
  const bad = await req("POST", "/api/profiles", { name: "   " });
  assert.equal(bad.status, 400);
  assert.equal(bad.json.ok, false);

  const created = await req("POST", "/api/profiles", { id: "p_test1", name: "NhatPro", emoji: "🚀" });
  assert.equal(created.status, 201);
  assert.equal(created.json.data.id, "p_test1");
  assert.equal(created.json.data.name, "NhatPro");

  const dup = await req("POST", "/api/profiles", { id: "p_test1", name: "Other" });
  assert.equal(dup.status, 409);

  const list = await req("GET", "/api/profiles");
  assert.equal(list.status, 200);
  assert.ok(list.json.data.some((p) => p.id === "p_test1"));
});

test("scores: submit, leaderboard ordering, stats aggregation", async () => {
  await req("POST", "/api/profiles", { id: "p_a", name: "A" });
  await req("POST", "/api/profiles", { id: "p_b", name: "B" });

  const badDiff = await req("POST", "/api/scores", {
    profileId: "p_a", score: 100, wave: 3, kills: 10, durationMs: 60000, difficulty: "insane",
  });
  assert.equal(badDiff.status, 400);

  const noProfile = await req("POST", "/api/scores", {
    profileId: "p_nope", score: 100, wave: 3, kills: 10, durationMs: 60000, difficulty: "normal",
  });
  assert.equal(noProfile.status, 404);

  const neg = await req("POST", "/api/scores", {
    profileId: "p_a", score: -5, wave: 3, kills: 10, durationMs: 60000, difficulty: "normal",
  });
  assert.equal(neg.status, 400);

  await req("POST", "/api/scores", { profileId: "p_a", score: 500, wave: 5, kills: 30, durationMs: 120000, difficulty: "normal" });
  await req("POST", "/api/scores", { profileId: "p_b", score: 900, wave: 7, kills: 50, durationMs: 180000, difficulty: "normal" });
  await req("POST", "/api/scores", { profileId: "p_a", score: 700, wave: 6, kills: 40, durationMs: 150000, difficulty: "hard" });

  const lb = await req("GET", "/api/leaderboard?difficulty=normal&limit=10");
  assert.equal(lb.status, 200);
  assert.equal(lb.json.data.length, 2);
  assert.equal(lb.json.data[0].score, 900);
  assert.equal(lb.json.data[0].profileName, "B");
  assert.equal(lb.json.data[1].score, 500);

  const lbHard = await req("GET", "/api/leaderboard?difficulty=hard");
  assert.equal(lbHard.json.data.length, 1);

  const lbBad = await req("GET", "/api/leaderboard?difficulty=nope");
  assert.equal(lbBad.status, 400);

  const stats = await req("GET", "/api/stats/p_a");
  assert.equal(stats.status, 200);
  const s = stats.json.data;
  assert.equal(s.games, 2);
  assert.equal(s.kills, 70);
  assert.equal(s.totalScore, 1200);
  assert.equal(s.bestWave, 6);
  assert.equal(s.bestPerDifficulty.normal.score, 500);
  assert.equal(s.bestPerDifficulty.hard.score, 700);

  const stats404 = await req("GET", "/api/stats/p_nope");
  assert.equal(stats404.status, 404);
});

test("delete profile cascades scores", async () => {
  await req("POST", "/api/profiles", { id: "p_del", name: "Del" });
  await req("POST", "/api/scores", {
    profileId: "p_del", score: 100, wave: 1, kills: 5, durationMs: 10000, difficulty: "chill",
  });
  const del = await req("DELETE", "/api/profiles/p_del");
  assert.equal(del.status, 200);
  const lb = await req("GET", "/api/leaderboard?difficulty=chill");
  assert.ok(!lb.json.data.some((r) => r.profileId === "p_del"));
  const again = await req("DELETE", "/api/profiles/p_del");
  assert.equal(again.status, 404);
});

test("unknown routes return JSON 404", async () => {
  const r = await req("GET", "/api/nope");
  assert.equal(r.status, 404);
  assert.equal(r.json.ok, false);
});

test("rate limiter blocks excessive writes", async () => {
  const dir = mkdtempSync(join(tmpdir(), "wk-rl-"));
  const rlApp = createApp({
    dbPath: join(dir, "rl.db"),
    port: 0,
    host: "127.0.0.1",
    rateLimitRead: 1000,
    rateLimitWrite: 3,
  });
  const addr = await rlApp.listen();
  const b = `http://127.0.0.1:${addr.port}`;
  const post = () =>
    fetch(b + "/api/profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "x" }),
    }).then((r) => r.status);
  const codes = [await post(), await post(), await post(), await post(), await post()];
  assert.ok(codes.slice(0, 3).every((c) => c === 201), `first 3 should pass: ${codes}`);
  assert.ok(codes.slice(3).every((c) => c === 429), `rest should be limited: ${codes}`);
  await rlApp.close();
});

test("POST /api/events: validation + ingest", async () => {
  const now = Date.now();
  const h1 = "a".repeat(64), h2 = "b".repeat(64);

  const badType = await req("POST", "/api/events", { events: [{ type: "hax", ts: now }] });
  assert.equal(badType.status, 400);

  const badTs = await req("POST", "/api/events", { events: [{ type: "game_start", difficulty: "normal", ts: 123 }] });
  assert.equal(badTs.status, 400);

  const badDiff = await req("POST", "/api/events", { events: [{ type: "game_start", difficulty: "insane", ts: now }] });
  assert.equal(badDiff.status, 400);

  const badHash = await req("POST", "/api/events", {
    events: [{ type: "game_start", difficulty: "normal", ts: now, profile_id_hash: "raw-id-leak" }],
  });
  assert.equal(badHash.status, 400);

  const tooMany = await req("POST", "/api/events", {
    events: Array.from({ length: 101 }, () => ({ type: "upgrade_draft_shown", ts: now })),
  });
  assert.equal(tooMany.status, 400);

  const empty = await req("POST", "/api/events", { events: [] });
  assert.equal(empty.status, 400);

  const good = await req("POST", "/api/events", {
    events: [
      { type: "game_start", difficulty: "normal", ts: now, profile_id_hash: h1 },
      { type: "game_start", difficulty: "hard", ts: now, profile_id_hash: h2, extra_junk: "stripped" },
      { type: "game_over", difficulty: "normal", score: 500, wave: 5, duration_s: 120, act: 2, ts: now, profile_id_hash: h1 },
      { type: "game_over", difficulty: "normal", score: 900, wave: 7, ts: now, profile_id_hash: h2 },
      { type: "wave_reached", wave: 3, ts: now, profile_id_hash: h1 },
      { type: "upgrade_chosen", upgrade_id: "pierce_2", ts: now },
      { type: "settings_changed", key: "music", value: false, ts: now },
    ],
  });
  assert.equal(good.status, 201);
  assert.equal(good.json.ok, true);
  assert.equal(good.json.data.inserted, 7);
});

test("GET /api/metrics aggregates events (no PII)", async () => {
  const m = await req("GET", "/api/metrics");
  assert.equal(m.status, 200);
  const d = m.json.data;
  assert.equal(d.dau, 2); // two distinct profile hashes in the last 24h
  assert.equal(d.games7d, 2);
  assert.equal(d.avgScore7d, 700);
  assert.equal(d.bestWave7d, 7);
  assert.equal(d.byDifficulty7d.normal.games, 2);
  assert.equal(d.byDifficulty7d.normal.avgScore, 700);
  assert.equal(d.byDifficulty7d.normal.bestWave, 7);
  assert.ok(typeof d.generatedAt === "number");
});

test("POST /api/errors: validation + 500-row cap", async () => {
  const now = Date.now();
  const bad = await req("POST", "/api/errors", { errors: [{ message: "" }] });
  assert.equal(bad.status, 400);

  const tooLong = await req("POST", "/api/errors", { errors: [{ message: "x".repeat(501) }] });
  assert.equal(tooLong.status, 400);

  const good = await req("POST", "/api/errors", {
    errors: [
      { message: "TypeError: x is undefined", source: "game.js:42:7", ts: now, profile_id_hash: "c".repeat(64) },
      { message: "unhandledrejection", source: "promise", ts: now },
    ],
  });
  assert.equal(good.status, 201);
  assert.equal(good.json.data.inserted, 2);
  assert.ok(good.json.data.stored >= 2);

  // dedicated app with a tiny cap proves the trim keeps only the newest rows
  const dir = mkdtempSync(join(tmpdir(), "wk-errcap-"));
  const capApp = createApp({
    dbPath: join(dir, "cap.db"),
    port: 0,
    host: "127.0.0.1",
    rateLimitRead: 1000,
    rateLimitWrite: 1000,
    rateLimitEvents: 1000,
    rateLimitErrors: 1000,
    errorsCap: 3,
  });
  const addr = await capApp.listen();
  const b = `http://127.0.0.1:${addr.port}`;
  const r = await fetch(b + "/api/errors", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ errors: [1, 2, 3, 4, 5].map((i) => ({ message: `err${i}` })) }),
  });
  assert.equal(r.status, 201);
  assert.equal(capApp.store.errorCount(), 3);
  const newest = capApp.store.db.prepare("SELECT message FROM errors ORDER BY id DESC LIMIT 1").get();
  assert.equal(newest.message, "err5"); // oldest trimmed, newest kept
  await capApp.close();
});

test("analytics pipelines have dedicated rate-limit buckets", async () => {
  const dir = mkdtempSync(join(tmpdir(), "wk-rl2-"));
  const rlApp = createApp({
    dbPath: join(dir, "rl2.db"),
    port: 0,
    host: "127.0.0.1",
    rateLimitRead: 1000,
    rateLimitWrite: 1000,
    rateLimitEvents: 2,
    rateLimitErrors: 1,
  });
  const addr = await rlApp.listen();
  const b = `http://127.0.0.1:${addr.port}`;
  const post = (path, payload) =>
    fetch(b + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then((r) => r.status);
  const ev = { events: [{ type: "upgrade_draft_shown", ts: Date.now() }] };
  const evCodes = [await post("/api/events", ev), await post("/api/events", ev), await post("/api/events", ev)];
  assert.deepEqual(evCodes, [201, 201, 429]);
  const errCodes = [
    await post("/api/errors", { errors: [{ message: "m1" }] }),
    await post("/api/errors", { errors: [{ message: "m2" }] }),
  ];
  assert.deepEqual(errCodes, [201, 429]);
  // gameplay writes are unaffected by the analytics buckets being exhausted
  const w = await post("/api/profiles", { name: "still-fine" });
  assert.equal(w, 201);
  await rlApp.close();
});
