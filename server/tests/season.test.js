/* WINDOWKILL backend — Season 1 backend tests (node:test, zero dependencies).
 * Covers: migration 2 (seasons + season_scores + S1 seed), score submission
 * with optional seasonId, GET /api/season/leaderboard (seasonal + all-time
 * boards in parallel), and the clear 404/400 errors for unknown/inactive
 * seasons. Boots the real HTTP server on an ephemeral port.
 */
"use strict";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { createApp } from "../src/server.js";

async function req(base, method, path, body, headers = {}) {
  const r = await fetch(base + path, {
    method,
    headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await r.json().catch(() => null);
  return { status: r.status, json };
}
const auth = (token) => ({ "X-Profile-Token": token });

async function boot(extra = {}) {
  const dir = mkdtempSync(join(tmpdir(), "wk-season-"));
  const app = createApp({
    dbPath: join(dir, "season.db"),
    port: 0,
    host: "127.0.0.1",
    rateLimitRead: 1000,
    rateLimitWrite: 1000,
    ...extra,
  });
  const addr = await app.listen();
  return { app, base: `http://127.0.0.1:${addr.port}` };
}

/* Score bodies that always pass SEC-04 plausibility (score ≤ kills*200 +
 * wave*5000 + 10000, duration ≥ (wave-1)*3000 for wave ≥ 2, kills ≤ 100 +
 * durationMs/200). */
const s = (profileId, score, wave = 1, kills = 5, difficulty = "normal") => ({
  profileId, score, wave, kills, durationMs: 60000, difficulty,
});

test("migration 2: fresh DB gets seasons + season_scores (user_version=2) and one active S1 season", async () => {
  const { app } = await boot();
  try {
    const v = app.store.db.prepare("PRAGMA user_version").get();
    assert.equal(v.user_version, 2);
    const tables = app.store.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name);
    assert.ok(tables.includes("seasons"));
    assert.ok(tables.includes("season_scores"));
    const idx = app.store.db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all().map((r) => r.name);
    assert.ok(idx.includes("idx_season_scores_board"));
    assert.ok(idx.includes("idx_season_scores_profile"));

    const season = app.store.getActiveSeason();
    assert.ok(season);
    assert.equal(season.id, "S1");
    assert.equal(season.status, "active");
    assert.ok(typeof season.startAt === "number");
    assert.ok(season.endAt > season.startAt); // 6-week cadence seeded
    assert.equal(season.name, "Season 1 — Mùa Deadline");
  } finally {
    await app.close();
  }
});

test("migration 2: forward-only upgrade of a user_version=1 DB adds season tables without touching scores", async () => {
  const dir = mkdtempSync(join(tmpdir(), "wk-season-mig1-"));
  const dbPath = join(dir, "v1.db");
  // Simulate a DB that already ran migration 1: base tables + token_hash,
  // user_version = 1, one all-time score — but no season tables at all.
  const raw = new DatabaseSync(dbPath);
  raw.exec(`
    CREATE TABLE profiles (id TEXT PRIMARY KEY, name TEXT NOT NULL, emoji TEXT NOT NULL DEFAULT '🎮', created_at INTEGER NOT NULL, token_hash TEXT);
    CREATE TABLE scores (id INTEGER PRIMARY KEY AUTOINCREMENT, profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, score INTEGER NOT NULL, wave INTEGER NOT NULL, kills INTEGER NOT NULL, duration_ms INTEGER NOT NULL, difficulty TEXT NOT NULL, created_at INTEGER NOT NULL);
    INSERT INTO profiles (id, name, emoji, created_at) VALUES ('p_old', 'Old', '🎮', 1700000000000);
    INSERT INTO scores (profile_id, score, wave, kills, duration_ms, difficulty, created_at) VALUES ('p_old', 4242, 3, 20, 60000, 'normal', 1700000001000);
  `);
  raw.exec("PRAGMA user_version = 1");
  raw.close();

  const app = createApp({ dbPath, port: 0, host: "127.0.0.1" });
  await app.listen();
  try {
    assert.equal(app.store.db.prepare("PRAGMA user_version").get().user_version, 2);
    // all-time board untouched
    const lb = app.store.leaderboard("normal", 10);
    assert.equal(lb.length, 1);
    assert.equal(lb[0].score, 4242);
    // season tables + seed arrived via the migration
    assert.ok(app.store.getActiveSeason());
    assert.equal(app.store.seasonalLeaderboard("S1", "normal", 10).length, 0);
  } finally {
    await app.close();
  }
});

test("scores without seasonId land on the all-time board only (backward compatible)", async () => {
  const { app, base } = await boot();
  try {
    const c = await req(base, "POST", "/api/profiles", { id: "p_plain", name: "Plain" });
    const tok = c.json.data.token;
    const posted = await req(base, "POST", "/api/scores", s("p_plain", 1234), auth(tok));
    assert.equal(posted.status, 201);
    // response shape unchanged: id only, no season fields
    assert.equal(typeof posted.json.data.id, "number");
    assert.equal(posted.json.data.seasonId, undefined);
    assert.equal(posted.json.data.seasonScoreId, undefined);

    const all = await req(base, "GET", "/api/leaderboard?difficulty=normal");
    assert.ok(all.json.data.some((r) => r.profileId === "p_plain" && r.score === 1234));

    const season = await req(base, "GET", "/api/season/leaderboard");
    assert.equal(season.status, 200);
    assert.equal(season.json.data.seasonal.length, 0); // seasonal board untouched
    assert.ok(season.json.data.allTime.some((r) => r.profileId === "p_plain"));
  } finally {
    await app.close();
  }
});

test("scores with seasonId land on both boards; /api/season/leaderboard returns seasonal + allTime", async () => {
  const { app, base } = await boot();
  try {
    const ca = await req(base, "POST", "/api/profiles", { id: "p_sa", name: "SA" });
    const cb = await req(base, "POST", "/api/profiles", { id: "p_sb", name: "SB" });

    const pa = await req(base, "POST", "/api/scores", { ...s("p_sa", 3000), seasonId: "S1" }, auth(ca.json.data.token));
    assert.equal(pa.status, 201);
    assert.equal(pa.json.data.seasonId, "S1");
    assert.equal(typeof pa.json.data.seasonScoreId, "number");

    // SB submits a bigger score but WITHOUT seasonId (an endless run — not a season run)
    await req(base, "POST", "/api/scores", s("p_sb", 9000), auth(cb.json.data.token));

    const lb = await req(base, "GET", "/api/season/leaderboard");
    assert.equal(lb.status, 200);
    const d = lb.json.data;
    // season info block
    assert.equal(d.season.id, "S1");
    assert.equal(d.season.status, "active");
    assert.ok(typeof d.season.startAt === "number");
    // seasonal board: only SA's season run — SB's 9000 does NOT leak in
    assert.equal(d.seasonal.length, 1);
    assert.equal(d.seasonal[0].profileId, "p_sa");
    assert.equal(d.seasonal[0].score, 3000);
    assert.equal(d.seasonal[0].profileName, "SA");
    // all-time board: both runs, ordered score DESC
    assert.equal(d.allTime.length, 2);
    assert.equal(d.allTime[0].profileId, "p_sb");
    assert.equal(d.allTime[0].score, 9000);
    assert.equal(d.allTime[1].profileId, "p_sa");

    // explicit ?season=S1 behaves the same as ?season=current (the default)
    const explicit = await req(base, "GET", "/api/season/leaderboard?season=S1&limit=5");
    assert.equal(explicit.status, 200);
    assert.equal(explicit.json.data.seasonal.length, 1);
    assert.equal(explicit.json.data.allTime.length, 2);
  } finally {
    await app.close();
  }
});

test("season leaderboard query validation: bad difficulty/limit/season id → 400", async () => {
  const { app, base } = await boot();
  try {
    assert.equal((await req(base, "GET", "/api/season/leaderboard?difficulty=insane")).status, 400);
    assert.equal((await req(base, "GET", "/api/season/leaderboard?limit=0")).status, 400);
    assert.equal((await req(base, "GET", "/api/season/leaderboard?limit=51")).status, 400);
    assert.equal((await req(base, "GET", "/api/season/leaderboard?limit=nope")).status, 400);
    // season ids go through the same [A-Za-z0-9_-]{1,64} pattern as profiles
    assert.equal((await req(base, "GET", "/api/season/leaderboard?season=bad!id")).status, 400);
  } finally {
    await app.close();
  }
});

test("unknown season id → 404; missing active season → 404", async () => {
  const { app, base } = await boot();
  try {
    const unknown = await req(base, "GET", "/api/season/leaderboard?season=NOPE");
    assert.equal(unknown.status, 404);
    assert.equal(unknown.json.ok, false);
    assert.ok(unknown.json.error.includes("season not found"));
  } finally {
    await app.close();
  }

  const { app: app2, base: base2 } = await boot();
  try {
    // end the only active season: 'current' now has nothing to resolve to
    app2.store.db.prepare("UPDATE seasons SET status = 'ended' WHERE id = 'S1'").run();
    const none = await req(base2, "GET", "/api/season/leaderboard");
    assert.equal(none.status, 404);
    assert.equal(none.json.ok, false);
    assert.ok(none.json.error.includes("no active season"));
    // but an explicit (ended) season id still resolves — history stays readable
    const ended = await req(base2, "GET", "/api/season/leaderboard?season=S1");
    assert.equal(ended.status, 200);
    assert.equal(ended.json.data.season.status, "ended");
  } finally {
    await app2.close();
  }
});

test("score submit: unknown seasonId → 404; inactive seasonId → 400; malformed seasonId → 400", async () => {
  const { app, base } = await boot();
  try {
    app.store.db.prepare("INSERT INTO seasons (id, name, start_at, status) VALUES ('SOLD', 'Old', 1700000000000, 'ended')").run();
    const c = await req(base, "POST", "/api/profiles", { id: "p_se", name: "SE" });
    const tok = c.json.data.token;

    const unknown = await req(base, "POST", "/api/scores", { ...s("p_se", 100), seasonId: "NOPE" }, auth(tok));
    assert.equal(unknown.status, 404);
    assert.ok(unknown.json.error.includes("season not found"));

    const ended = await req(base, "POST", "/api/scores", { ...s("p_se", 100), seasonId: "SOLD" }, auth(tok));
    assert.equal(ended.status, 400);
    assert.ok(ended.json.error.includes("not active"));

    const malformed = await req(base, "POST", "/api/scores", { ...s("p_se", 100), seasonId: "bad id!" }, auth(tok));
    assert.equal(malformed.status, 400);

    // the rejected submits must not have leaked into either board
    const lb = await req(base, "GET", "/api/season/leaderboard");
    assert.equal(lb.json.data.seasonal.length, 0);
    assert.equal(lb.json.data.allTime.length, 0);
  } finally {
    await app.close();
  }
});

test("SEC-04 plausibility still applies when seasonId is sent", async () => {
  const { app, base } = await boot();
  try {
    const c = await req(base, "POST", "/api/profiles", { id: "p_anti", name: "Anti" });
    const tok = c.json.data.token;
    const forged = await req(base, "POST", "/api/scores",
      { profileId: "p_anti", score: 99_999_999, wave: 0, kills: 0, durationMs: 0, difficulty: "normal", seasonId: "S1" },
      auth(tok));
    assert.equal(forged.status, 400);
    const lb = await req(base, "GET", "/api/season/leaderboard");
    assert.equal(lb.json.data.seasonal.length, 0);
  } finally {
    await app.close();
  }
});

test("seasonal board is difficulty-scoped and ordered (score DESC, createdAt ASC)", async () => {
  const { app, base } = await boot();
  try {
    const ca = await req(base, "POST", "/api/profiles", { id: "p_o1", name: "O1" });
    const cb = await req(base, "POST", "/api/profiles", { id: "p_o2", name: "O2" });
    const ta = ca.json.data.token, tb = cb.json.data.token;

    await req(base, "POST", "/api/scores", { ...s("p_o1", 2000), seasonId: "S1" }, auth(ta));
    await req(base, "POST", "/api/scores", { ...s("p_o2", 5000), seasonId: "S1" }, auth(tb));
    await req(base, "POST", "/api/scores", { ...s("p_o1", 8000, 1, 5, "hard"), seasonId: "S1" }, auth(ta));

    const normal = await req(base, "GET", "/api/season/leaderboard?difficulty=normal");
    assert.equal(normal.json.data.seasonal.length, 2);
    assert.equal(normal.json.data.seasonal[0].score, 5000);
    assert.equal(normal.json.data.seasonal[1].score, 2000);

    const hard = await req(base, "GET", "/api/season/leaderboard?difficulty=hard");
    assert.equal(hard.json.data.seasonal.length, 1);
    assert.equal(hard.json.data.seasonal[0].score, 8000);

    // limit applies to each board independently
    const limited = await req(base, "GET", "/api/season/leaderboard?difficulty=normal&limit=1");
    assert.equal(limited.json.data.seasonal.length, 1);
    assert.equal(limited.json.data.allTime.length, 1);
  } finally {
    await app.close();
  }
});

test("delete profile cascades its season_scores", async () => {
  const { app, base } = await boot();
  try {
    const c = await req(base, "POST", "/api/profiles", { id: "p_gone", name: "Gone" });
    const tok = c.json.data.token;
    await req(base, "POST", "/api/scores", { ...s("p_gone", 1500), seasonId: "S1" }, auth(tok));
    let lb = await req(base, "GET", "/api/season/leaderboard");
    assert.ok(lb.json.data.seasonal.some((r) => r.profileId === "p_gone"));

    const del = await req(base, "DELETE", "/api/profiles/p_gone", undefined, auth(tok));
    assert.equal(del.status, 200);
    lb = await req(base, "GET", "/api/season/leaderboard");
    assert.ok(!lb.json.data.seasonal.some((r) => r.profileId === "p_gone"));
    assert.ok(!lb.json.data.allTime.some((r) => r.profileId === "p_gone"));
  } finally {
    await app.close();
  }
});
