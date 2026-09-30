/* WINDOWKILL backend — security headers + strict CORS */
"use strict";

export function applySecurityHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  // JSON-only API: nothing to execute, nothing to frame.
  res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
}

/**
 * Strict CORS: origins must be explicitly allowlisted via WK_CORS_ORIGINS.
 * Default (empty allowlist) => no Access-Control-Allow-Origin header at all
 * (same-origin use only — e.g. frontend served from the same backend process,
 * or a reverse proxy). Preflight is answered only for allowlisted origins.
 */
export function applyCors(req, res, allowlist) {
  const origin = req.headers.origin;
  if (!origin || !allowlist.includes(origin)) return false;
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "600");
  return true;
}
