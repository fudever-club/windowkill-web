/* WINDOWKILL backend — configuration from environment */
"use strict";

const num = (v, d) => {
  const n = Number.parseInt(v ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : d;
};

export const config = {
  port: num(process.env.PORT, 3001),
  host: process.env.HOST || "127.0.0.1",
  // Path to the SQLite file. Tests override this with a temp dir.
  dbPath: process.env.WK_DB || new URL("../data/windowkill.db", import.meta.url).pathname,
  // Comma-separated list of allowed CORS origins, e.g. "http://localhost:8080,https://windowkill-web.vercel.app".
  // Empty (default) => no CORS headers are sent (same-origin only).
  corsOrigins: (process.env.WK_CORS_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  // Rate limits: max requests per IP per 60s window.
  rateLimitRead: num(process.env.WK_RL_READ, 120),
  rateLimitWrite: num(process.env.WK_RL_WRITE, 30),
  // Dedicated budgets for the analytics/error pipelines.
  rateLimitEvents: num(process.env.WK_RL_EVENTS, 60),
  rateLimitErrors: num(process.env.WK_RL_ERRORS, 20),
  // Retention caps (rows) for the analytics/error tables.
  eventsCap: num(process.env.WK_EVENTS_CAP, 100_000),
  errorsCap: num(process.env.WK_ERRORS_CAP, 500),
  // Max JSON body size in bytes.
  maxBodyBytes: num(process.env.WK_MAX_BODY, 64 * 1024),
  version: "1.0.0",
};
