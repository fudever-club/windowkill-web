/* WINDOWKILL backend — HTTP server factory (pure node:http, zero dependencies).
 *
 * Exports createApp(options) so tests can boot the server on an ephemeral port
 * with a throwaway database. src/index.js is the thin production bootstrap.
 */
"use strict";
import { createServer } from "node:http";
import { config as defaultConfig } from "./config.js";
import { openDb } from "./db.js";
import { createRateLimiter } from "./ratelimit.js";
import { applyCors, applySecurityHeaders } from "./security.js";
import { validErrorsBody, validEventsBody, validId, validLeaderboardQuery, validProfileBody, validScoreBody } from "./validate.js";

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function send(res, status, obj, extraHeaders = {}) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    ...extraHeaders,
  });
  res.end(body);
}
const ok = (res, data, status = 200) => send(res, status, { ok: true, data }, );
const fail = (res, status, error) => send(res, status, { ok: false, error });

function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > maxBytes) {
        reject(Object.assign(new Error("body too large"), { code: "BODY_TOO_LARGE" }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/* Route table: [method, pattern, handler]. Pattern supports :param segments. */
function compileRoutes(store, cfg) {
  const routes = [];
  const add = (method, pattern, handler) => {
    const names = [];
    const re = new RegExp(
      "^" + pattern.replace(/:[A-Za-z0-9_]+/g, (m) => { names.push(m.slice(1)); return "([^/]+)"; }) + "$"
    );
    routes.push({ method, re, names, handler });
  };

  add("GET", "/api/health", async (_req, res) => {
    ok(res, { status: "up", version: cfg.version, time: Date.now() });
  });

  add("GET", "/api/profiles", async (_req, res) => {
    ok(res, store.listProfiles());
  });

  add("POST", "/api/profiles", async (req, res) => {
    let body;
    try {
      body = JSON.parse(req.rawBody);
    } catch {
      return fail(res, 400, "invalid JSON body");
    }
    const v = validProfileBody(body);
    if (!v) return fail(res, 400, "invalid profile: need name (1-24 chars), optional id/emoji");
    try {
      const created = store.createProfile(v);
      ok(res, created, 201);
    } catch (e) {
      if (String(e?.message).includes("UNIQUE")) return fail(res, 409, "profile id already exists");
      throw e;
    }
  });

  add("DELETE", "/api/profiles/:id", async (_req, res, params) => {
    const id = validId(params.id);
    if (!id) return fail(res, 400, "invalid profile id");
    if (!store.deleteProfile(id)) return fail(res, 404, "profile not found");
    ok(res, { deleted: id });
  });

  add("POST", "/api/scores", async (req, res) => {
    let body;
    try {
      body = JSON.parse(req.rawBody);
    } catch {
      return fail(res, 400, "invalid JSON body");
    }
    const v = validScoreBody(body);
    if (!v) return fail(res, 400, "invalid score: need profileId, score, wave, kills, durationMs, difficulty(chill|normal|hard)");
    if (!store.getProfile(v.profileId)) return fail(res, 404, "profile not found");
    const created = store.addScore(v);
    ok(res, created, 201);
  });

  add("GET", "/api/leaderboard", async (_req, res, _params, url) => {
    const v = validLeaderboardQuery(url.searchParams);
    if (!v) return fail(res, 400, "invalid query: difficulty must be chill|normal|hard, limit 1-50");
    ok(res, store.leaderboard(v.difficulty, v.limit));
  });

  add("GET", "/api/stats/:profileId", async (_req, res, params) => {
    const id = validId(params.profileId);
    if (!id) return fail(res, 400, "invalid profile id");
    if (!store.getProfile(id)) return fail(res, 404, "profile not found");
    ok(res, { profileId: id, ...store.profileStats(id) });
  });

  /* ---------- privacy-friendly analytics ---------- */

  add("POST", "/api/events", async (req, res) => {
    let body;
    try {
      body = JSON.parse(req.rawBody);
    } catch {
      return fail(res, 400, "invalid JSON body");
    }
    const v = validEventsBody(body);
    if (!v) return fail(res, 400, "invalid events: need { events: [{ type, ts, ... }] } (max 100/batch)");
    ok(res, store.addEvents(v.events), 201);
  });

  add("POST", "/api/errors", async (req, res) => {
    let body;
    try {
      body = JSON.parse(req.rawBody);
    } catch {
      return fail(res, 400, "invalid JSON body");
    }
    const v = validErrorsBody(body);
    if (!v) return fail(res, 400, "invalid errors: need { errors: [{ message, source?, ts? }] } (max 20/batch)");
    ok(res, store.addErrors(v.errors), 201);
  });

  /* Internal dashboard aggregates (counts & averages only — no PII). */
  add("GET", "/api/metrics", async (_req, res) => {
    ok(res, store.metrics());
  });

  return routes;
}

export function createApp(overrides = {}) {
  const cfg = { ...defaultConfig, ...overrides };
  const store = openDb(cfg.dbPath, { eventsCap: cfg.eventsCap, errorsCap: cfg.errorsCap });
  const limiter = createRateLimiter({
    readPerMin: cfg.rateLimitRead,
    writePerMin: cfg.rateLimitWrite,
    eventsPerMin: cfg.rateLimitEvents,
    errorsPerMin: cfg.rateLimitErrors,
  });
  const routes = compileRoutes(store, cfg);

  const server = createServer(async (req, res) => {
    try {
      applySecurityHeaders(res);
      const corsOk = applyCors(req, res, cfg.corsOrigins);

      if (req.method === "OPTIONS") {
        res.writeHead(corsOk ? 204 : 403);
        res.end();
        return;
      }

      let url;
      try {
        url = new URL(req.url, "http://localhost");
      } catch {
        return fail(res, 400, "bad request");
      }

      // Rate limit per client IP. Analytics/error pipelines get their own
      // buckets so a beacon burst can never starve gameplay writes.
      const ip = req.socket.remoteAddress || "unknown";
      const isWrite = WRITE_METHODS.has(req.method);
      const rlKind = !isWrite ? "read"
        : url.pathname === "/api/events" ? "events"
        : url.pathname === "/api/errors" ? "errors"
        : "write";
      const rl = limiter.checkKind(ip, rlKind);
      if (!rl.allowed) {
        return fail(res, 429, "rate limit exceeded, slow down", );
      }
      res.setHeader("X-RateLimit-Limit", String(rl.limit));
      res.setHeader("X-RateLimit-Remaining", String(rl.remaining));

      const route = routes.find((r) => r.method === req.method && r.re.test(url.pathname));
      if (!route) return fail(res, 404, "not found");

      if (isWrite) {
        try {
          req.rawBody = await readBody(req, cfg.maxBodyBytes);
        } catch (e) {
          if (e.code === "BODY_TOO_LARGE") return fail(res, 413, "request body too large");
          return fail(res, 400, "could not read request body");
        }
      }

      const m = url.pathname.match(route.re);
      const params = {};
      route.names.forEach((n, i) => { params[n] = decodeURIComponent(m[i + 1]); });
      await route.handler(req, res, params, url);
    } catch (e) {
      console.error("[windowkill-backend] request error:", e?.message);
      if (!res.headersSent) fail(res, 500, "internal server error");
      else res.end();
    }
  });

  return {
    server,
    store,
    config: cfg,
    listen: () =>
      new Promise((resolve) => {
        server.listen(cfg.port, cfg.host, () => resolve(server.address()));
      }),
    close: () =>
      new Promise((resolve) => {
        server.close(() => {
          store.close();
          resolve();
        });
      }),
  };
}
