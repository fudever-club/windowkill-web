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
 * X-Profile-Token is allowlisted so the browser may send the SEC-01 auth
 * header cross-origin without failing preflight.
 */
export function applyCors(req, res, allowlist) {
  const origin = req.headers.origin;
  if (!origin || !allowlist.includes(origin)) return false;
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Profile-Token");
  res.setHeader("Access-Control-Max-Age", "600");
  return true;
}

/**
 * SEC-03: is this request's Origin acceptable for a REAL (non-preflight)
 * request? Browsers only block READING cross-origin responses — without this
 * check a hostile page can still WRITE via a "simple request". Rules:
 *   - no Origin header (curl, server-to-server, same-origin GET) => allowed
 *     (those callers are governed by the profile-token auth, SEC-01);
 *   - Origin in the allowlist => allowed;
 *   - Origin whose host equals the Host header (same-origin browser call
 *     through a reverse proxy / local dev) => allowed;
 *   - anything else => not allowed (caller answers 403 for write methods).
 */
export function isOriginAllowed(req, allowlist) {
  const origin = req.headers.origin;
  if (!origin) return true;
  if (allowlist.includes(origin)) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

/**
 * B5: rate-limit key = the real client IP. Behind the Fly.io proxy the
 * socket address is the proxy's, so prefer the FIRST X-Forwarded-For entry
 * (the client as seen by the outermost proxy; Fly overwrites/appends this
 * header at the edge). Fall back to the socket address for direct/VPS use.
 * Note: on a directly exposed deployment a client could spoof XFF to evade
 * rate limits — accepted here because production sits behind Fly; the
 * profile token (SEC-01), not the rate limiter, is the write barrier.
 */
export function clientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.trim()) return xff.split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}
