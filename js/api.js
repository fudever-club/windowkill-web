/* WINDOWKILL: Web Edition — optional backend client.
 *
 * Tries to talk to the windowkill-backend (see server/README.md). The backend
 * is OPTIONAL: if it is not reachable, every method resolves to null and the
 * game keeps working 100% on localStorage (static hosting, file://, Electron).
 *
 * Base URL resolution order:
 *   1. window.WK_API_BASE (set before this script loads)
 *   2. localStorage "wk_api_base" (user override, e.g. "http://localhost:3001")
 *   3. "" (same origin — works when a reverse proxy serves /api/*)
 */
"use strict";
window.WKApi = (() => {
  const base = () => {
    if (typeof window.WK_API_BASE === "string" && window.WK_API_BASE) return window.WK_API_BASE.replace(/\/$/, "");
    try {
      const v = localStorage.getItem("wk_api_base");
      if (v) return v.replace(/\/$/, "");
    } catch {}
    return "";
  };

  let healthCache = null; // null = unknown, true/false = known
  let healthAt = 0;
  const HEALTH_TTL = 60_000;

  async function healthy() {
    const now = Date.now();
    if (healthCache !== null && now - healthAt < HEALTH_TTL) return healthCache;
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 1500);
      const r = await fetch(base() + "/api/health", { signal: ctl.signal, cache: "no-store" });
      clearTimeout(t);
      healthCache = r.ok && (await r.json()).ok === true;
    } catch {
      healthCache = false;
    }
    healthAt = now;
    return healthCache;
  }

  async function call(method, path, body) {
    if (!(await healthy())) return null;
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 4000);
      const r = await fetch(base() + path, {
        method,
        signal: ctl.signal,
        headers: body !== undefined ? { "Content-Type": "application/json" } : {},
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      clearTimeout(t);
      const j = await r.json().catch(() => null);
      if (!r.ok || !j || j.ok !== true) return null;
      return j.data;
    } catch {
      healthCache = false; // backend died mid-session -> stop hammering it
      return null;
    }
  }

  return {
    /** Force re-check on next call (e.g. after user changes wk_api_base). */
    reset: () => { healthCache = null; },
    isOnline: healthy,
    listProfiles: () => call("GET", "/api/profiles"),
    createProfile: (p) => call("POST", "/api/profiles", p),
    deleteProfile: (id) => call("DELETE", "/api/profiles/" + encodeURIComponent(id)),
    submitScore: (s) => call("POST", "/api/scores", s),
    leaderboard: (difficulty = "normal", limit = 5) =>
      call("GET", `/api/leaderboard?difficulty=${encodeURIComponent(difficulty)}&limit=${limit}`),
    profileStats: (id) => call("GET", "/api/stats/" + encodeURIComponent(id)),
    /* Analytics transport (fire-and-forget, no health probe — beacon first so
     * events survive page unload; fetch keepalive fallback). Never throws. */
    sendEvents: (events) => fireBeacon("/api/events", { events }),
    sendErrors: (errors) => fireBeacon("/api/errors", { errors }),
  };

  /* Fire-and-forget JSON POST: navigator.sendBeacon first, fetch keepalive fallback. */
  function fireBeacon(path, payload) {
    try {
      const body = JSON.stringify(payload);
      if (body.length > 60 * 1024) return false; // stay under the server 64 KB body cap
      const url = base() + path;
      if (typeof navigator.sendBeacon === "function") {
        try {
          if (navigator.sendBeacon(url, new Blob([body], { type: "application/json" }))) return true;
        } catch { /* fall through */ }
      }
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
        credentials: "omit",
      }).catch(() => {});
      return true;
    } catch {
      return false;
    }
  }
})();
