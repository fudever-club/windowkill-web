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

  /* ---- SEC-01 profile tokens ------------------------------------------------
   * When the backend creates a profile it returns a one-time token; the raw
   * token lives ONLY here, in localStorage "wk_profile_tokens" ({id: token}),
   * and is attached as X-Profile-Token to the writes that need it (score
   * submit, profile delete). Losing it (cleared storage / another browser)
   * makes that server profile read-only from this client — the game itself
   * keeps working fully offline on localStorage profiles. */
  const TOKEN_KEY = "wk_profile_tokens";
  const loadTokens = () => {
    try {
      const t = JSON.parse(localStorage.getItem(TOKEN_KEY) || "{}");
      return t && typeof t === "object" && !Array.isArray(t) ? t : {};
    } catch { return {}; }
  };
  const tokenFor = (id) => {
    const t = loadTokens()[id];
    return typeof t === "string" && t ? t : null;
  };
  const saveToken = (id, token) => {
    try {
      const all = loadTokens();
      all[id] = token;
      localStorage.setItem(TOKEN_KEY, JSON.stringify(all));
    } catch {}
  };
  const dropToken = (id) => {
    try {
      const all = loadTokens();
      delete all[id];
      localStorage.setItem(TOKEN_KEY, JSON.stringify(all));
    } catch {}
  };
  const authHeaders = (id) => {
    const t = id ? tokenFor(id) : null;
    return t ? { "X-Profile-Token": t } : {};
  };

  async function call(method, path, body, extraHeaders) {
    if (!(await healthy())) return null;
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 4000);
      const r = await fetch(base() + path, {
        method,
        signal: ctl.signal,
        headers: {
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
          ...(extraHeaders || {}),
        },
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
    /* On success the response carries the one-time profile `token`:
     * persist it (keyed by profile id) so later writes can authenticate. */
    createProfile: async (p) => {
      const d = await call("POST", "/api/profiles", p);
      if (d && typeof d.token === "string" && d.token && (d.id || (p && p.id))) saveToken(d.id || p.id, d.token);
      return d;
    },
    deleteProfile: (id) =>
      call("DELETE", "/api/profiles/" + encodeURIComponent(id), undefined, authHeaders(id))
        .then((d) => { if (d) dropToken(id); return d; }),
    submitScore: (s) => call("POST", "/api/scores", s, authHeaders(s && s.profileId)),
    /* Lets menu.js (or a future claim flow) register a token obtained
     * out-of-band, e.g. claiming a legacy profile. */
    setProfileToken: (id, token) => { if (id && typeof token === "string" && token) saveToken(id, token); },
    hasProfileToken: (id) => !!tokenFor(id),
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
