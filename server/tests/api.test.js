/* WINDOWKILL backend — API tests (node:test, zero dependencies).
 * Boots the real HTTP server on an ephemeral port with a throwaway SQLite file.
 */
"use strict";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
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

async function req(method, path, body, headers = {}) {
  const r = await fetch(base + path, {
    method,
    headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await r.json().catch(() => null);
  return { status: r.status, json, headers: r.headers };
}
const auth = (token) => ({ "X-Profile-Token": token });

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
  // SEC-01: a strong one-time token is issued at creation…
  assert.equal(typeof created.json.data.token, "string");
  assert.ok(created.json.data.token.length >= 64);
  // …and the stored hash is never exposed back.
  assert.equal(created.json.data.tokenHash, undefined);
  assert.equal(created.json.data.token_hash, undefined);

  const dup = await req("POST", "/api/profiles", { id: "p_test1", name: "Other" });
  assert.equal(dup.status, 409);

  const list = await req("GET", "/api/profiles");
  assert.equal(list.status, 200);
  assert.ok(list.json.data.some((p) => p.id === "p_test1"));
  assert.ok(list.json.data.every((p) => p.token === undefined && p.tokenHash === undefined && p.token_hash === undefined));
});

test("scores: submit, leaderboard ordering, stats aggregation", async () => {
  // SEC-01: score submission now requires the creating profile's token.
  const ca = await req("POST", "/api/profiles", { id: "p_a", name: "A" });
  const cb = await req("POST", "/api/profiles", { id: "p_b", name: "B" });
  const tokA = ca.json.data.token, tokB = cb.json.data.token;
  assert.ok(tokA && tokB && tokA !== tokB);

  const badDiff = await req("POST", "/api/scores", {
    profileId: "p_a", score: 100, wave: 3, kills: 10, durationMs: 60000, difficulty: "insane",
  }, auth(tokA));
  assert.equal(badDiff.status, 400);

  const noProfile = await req("POST", "/api/scores", {
    profileId: "p_nope", score: 100, wave: 3, kills: 10, durationMs: 60000, difficulty: "normal",
  });
  assert.equal(noProfile.status, 404);

  const neg = await req("POST", "/api/scores", {
    profileId: "p_a", score: -5, wave: 3, kills: 10, durationMs: 60000, difficulty: "normal",
  }, auth(tokA));
  assert.equal(neg.status, 400);

  await req("POST", "/api/scores", { profileId: "p_a", score: 500, wave: 5, kills: 30, durationMs: 120000, difficulty: "normal" }, auth(tokA));
  await req("POST", "/api/scores", { profileId: "p_b", score: 900, wave: 7, kills: 50, durationMs: 180000, difficulty: "normal" }, auth(tokB));
  await req("POST", "/api/scores", { profileId: "p_a", score: 700, wave: 6, kills: 40, durationMs: 150000, difficulty: "hard" }, auth(tokA));

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
  const c = await req("POST", "/api/profiles", { id: "p_del", name: "Del" });
  const tok = c.json.data.token;
  await req("POST", "/api/scores", {
    profileId: "p_del", score: 100, wave: 1, kills: 5, durationMs: 10000, difficulty: "chill",
  }, auth(tok));
  // SEC-01: delete requires the profile token
  const noTok = await req("DELETE", "/api/profiles/p_del");
  assert.equal(noTok.status, 401);
  const wrongTok = await req("DELETE", "/api/profiles/p_del", undefined, auth("f".repeat(64)));
  assert.equal(wrongTok.status, 403);
  const del = await req("DELETE", "/api/profiles/p_del", undefined, auth(tok));
  assert.equal(del.status, 200);
  const lb = await req("GET", "/api/leaderboard?difficulty=chill");
  assert.ok(!lb.json.data.some((r) => r.profileId === "p_del"));
  const again = await req("DELETE", "/api/profiles/p_del", undefined, auth(tok));
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

/* ---------- Pha B: SEC-01 / SEC-03 / SEC-04 / B5 / B7 ---------- */

test("SEC-01: score writes require the owning profile's token", async () => {
  const c1 = await req("POST", "/api/profiles", { id: "p_auth1", name: "Auth1" });
  const c2 = await req("POST", "/api/profiles", { id: "p_auth2", name: "Auth2" });
  const body = { profileId: "p_auth1", score: 100, wave: 1, kills: 5, durationMs: 10000, difficulty: "normal" };

  const missing = await req("POST", "/api/scores", body);
  assert.equal(missing.status, 401);
  const wrong = await req("POST", "/api/scores", body, auth("0".repeat(64)));
  assert.equal(wrong.status, 403);
  const otherProfiles = await req("POST", "/api/scores", body, auth(c2.json.data.token));
  assert.equal(otherProfiles.status, 403);
  const good = await req("POST", "/api/scores", body, auth(c1.json.data.token));
  assert.equal(good.status, 201);
});

test("SEC-04: implausible score correlations are rejected", async () => {
  const c = await req("POST", "/api/profiles", { id: "p_corr", name: "Corr" });
  const tok = c.json.data.token;
  const post = (over) => req("POST", "/api/scores", {
    profileId: "p_corr", score: 100, wave: 1, kills: 5, durationMs: 60000, difficulty: "normal", ...over,
  }, auth(tok));

  // the audit's canonical forgery: max score, nothing played
  assert.equal((await post({ score: 99_999_999, wave: 0, kills: 0, durationMs: 0 })).status, 400);
  // wave 50 cannot be reached in 10 seconds
  assert.equal((await post({ wave: 50, kills: 100, score: 5000, durationMs: 10_000 })).status, 400);
  // 999,999 kills cannot happen inside a minute
  assert.equal((await post({ kills: 999_999, score: 5000, wave: 5, durationMs: 60_000 })).status, 400);
  // a plausible run still passes
  assert.equal((await post({ score: 2500, wave: 8, kills: 120, durationMs: 300_000 })).status, 201);
});

test("B7 migration: old-schema DB is upgraded (user_version + token_hash) and legacy profiles still work, then get claimed", async () => {
  const dir = mkdtempSync(join(tmpdir(), "wk-mig-"));
  const dbPath = join(dir, "old.db");
  // Build a genuinely OLD database: base schema, no token_hash, user_version 0.
  const raw = new DatabaseSync(dbPath);
  raw.exec(`CREATE TABLE profiles (id TEXT PRIMARY KEY, name TEXT NOT NULL, emoji TEXT NOT NULL DEFAULT '🎮', created_at INTEGER NOT NULL);
            INSERT INTO profiles (id, name, emoji, created_at) VALUES ('p_legacy', 'Legacy', '🎮', 1700000000000);`);
  raw.close();

  const migApp = createApp({ dbPath, port: 0, host: "127.0.0.1", rateLimitRead: 1000, rateLimitWrite: 1000 });
  const addr = await migApp.listen();
  const b = `http://127.0.0.1:${addr.port}`;
  const j = (r) => r.json();
  try {
    const v = migApp.store.db.prepare("PRAGMA user_version").get();
    assert.equal(v.user_version, 1);
    const cols = migApp.store.db.prepare("PRAGMA table_info(profiles)").all().map((r) => r.name);
    assert.ok(cols.includes("token_hash"));
    assert.equal(migApp.store.getProfileTokenHash("p_legacy"), null);

    const score = { profileId: "p_legacy", score: 100, wave: 1, kills: 5, durationMs: 10000, difficulty: "normal" };
    const post = (headers = {}) => fetch(b + "/api/scores", {
      method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(score),
    });
    // legacy profile: write without a token is still allowed (documented compat)
    assert.equal((await post()).status, 201);
    // first write WITH a token claims the profile
    assert.equal((await post(auth("claim-token-123"))).status, 201);
    assert.ok(migApp.store.getProfileTokenHash("p_legacy"));
    // from now on the token is required
    assert.equal((await post()).status, 401);
    assert.equal((await post(auth("someone-elses-token"))).status, 403);
    assert.equal((await post(auth("claim-token-123"))).status, 201);
    const list = await fetch(b + "/api/profiles").then(j);
    assert.ok(list.data.some((p) => p.id === "p_legacy"));
  } finally {
    await migApp.close();
  }
});

test("SEC-03/B6: CORS is enforced on real writes; itch iframe origin allowed; JSON content-type required", async () => {
  const dir = mkdtempSync(join(tmpdir(), "wk-cors-"));
  const corsApp = createApp({
    dbPath: join(dir, "cors.db"), port: 0, host: "127.0.0.1",
    rateLimitRead: 1000, rateLimitWrite: 1000, rateLimitEvents: 1000, rateLimitErrors: 1000,
    corsOrigins: ["https://windowkill.fudever.com", "https://quangnhat1504.itch.io", "https://html-classic.itch.zone"],
  });
  const addr = await corsApp.listen();
  const b = `http://127.0.0.1:${addr.port}`;
  try {
    const postProfile = (headers) => fetch(b + "/api/profiles", {
      method: "POST", headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ name: "Cors" }),
    });
    const evil = await postProfile({ Origin: "https://evil.example" });
    assert.equal(evil.status, 403);
    const itchFrame = await postProfile({ Origin: "https://html-classic.itch.zone" });
    assert.equal(itchFrame.status, 201);
    assert.equal(itchFrame.headers.get("access-control-allow-origin"), "https://html-classic.itch.zone");
    // reads stay public even for foreign origins (they just get no ACAO header)
    const read = await fetch(b + "/api/leaderboard", { headers: { Origin: "https://evil.example" } });
    assert.equal(read.status, 200);
    assert.equal(read.headers.get("access-control-allow-origin"), null);
    // preflight for an allowlisted origin must permit the token header
    const pre = await fetch(b + "/api/scores", {
      method: "OPTIONS",
      headers: {
        Origin: "https://html-classic.itch.zone",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type, x-profile-token",
      },
    });
    assert.equal(pre.status, 204);
    assert.ok((pre.headers.get("access-control-allow-headers") || "").toLowerCase().includes("x-profile-token"));
    // simple-request style write (non-JSON content type) is refused
    const plain = await fetch(b + "/api/profiles", {
      method: "POST", headers: { "Content-Type": "text/plain", Origin: "https://windowkill.fudever.com" },
      body: JSON.stringify({ name: "Sneaky" }),
    });
    assert.equal(plain.status, 415);
  } finally {
    await corsApp.close();
  }
});

test("B5: /api/health is exempt from rate limiting and the limiter keys on X-Forwarded-For", async () => {
  const dir = mkdtempSync(join(tmpdir(), "wk-rl3-"));
  const rlApp = createApp({
    dbPath: join(dir, "rl3.db"), port: 0, host: "127.0.0.1",
    rateLimitRead: 3, rateLimitWrite: 1000, rateLimitEvents: 1000, rateLimitErrors: 1000,
  });
  const addr = await rlApp.listen();
  const b = `http://127.0.0.1:${addr.port}`;
  try {
    for (let i = 0; i < 10; i++) {
      const h = await fetch(b + "/api/health");
      assert.equal(h.status, 200, `health request ${i + 1} must not be rate-limited`);
    }
    const readAs = (ip) => fetch(b + "/api/profiles", { headers: { "X-Forwarded-For": ip } }).then((r) => r.status);
    assert.deepEqual(
      [await readAs("203.0.113.1"), await readAs("203.0.113.1"), await readAs("203.0.113.1"), await readAs("203.0.113.1")],
      [200, 200, 200, 429]
    );
    // a different real IP (e.g. another player behind another NAT) has its own budget
    assert.equal(await readAs("203.0.113.2"), 200);
    // only the FIRST XFF entry is the key: same client, different proxy hops share a bucket
    const viaProxy = await fetch(b + "/api/profiles", { headers: { "X-Forwarded-For": "203.0.113.1, 10.0.0.9" } }).then((r) => r.status);
    assert.equal(viaProxy, 429);
  } finally {
    await rlApp.close();
  }
});
