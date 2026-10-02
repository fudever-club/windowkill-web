/* WINDOWKILL Web Edition — privacy-friendly analytics (no cookies, no fingerprint).
 *
 * Design principles:
 *  - Opt-out: honours Do-Not-Track (DNT=1 => fully disabled) and the in-game
 *    "analytics" settings toggle (localStorage "wk_analytics", default ON).
 *  - No cookies, no fingerprinting. The only identity is a SHA-256 hash of the
 *    local profile id — the raw id is NEVER sent.
 *  - Fire-and-forget: events are batched (15 s) and sent with
 *    navigator.sendBeacon (fetch keepalive fallback) so they survive page unload.
 *  - Backend is optional: if it is unreachable everything is silently dropped and
 *    the game keeps working 100% offline.
 *
 * Event collection is self-contained: it listens to the existing
 * BroadcastChannel "windowkill_bus" (gameover payloads posted by game.html)
 * plus future message types ("wave", "upgrade_chosen") — the gameplay team can
 * post them without touching this file.
 *
 * Public API: window.WKAnalytics = { track(type, data, opts), setProfile(id),
 *   flush(), setEnabled(bool), isEnabled(), ready }
 */
"use strict";
// Idempotency guard: the file may be referenced from multiple pages/scripts.
if (window.WKAnalytics && window.WKAnalytics.ready) {
  /* already initialised — do not double-register listeners */
} else {
window.WKAnalytics = (() => {
  const BUS = "windowkill_bus";
  const FLUSH_MS = 15_000;
  const MAX_BATCH = 50;
  const MAX_QUEUE = 500; // drop oldest beyond this (memory guard)
  const ERROR_MIN_INTERVAL_MS = 5_000; // client-side throttle for error events
  const ERROR_MAX_PER_MIN = 10;

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  };

  const dnt = () => {
    try {
      return navigator.doNotTrack === "1" || window.doNotTrack === "1" ||
        navigator.msDoNotTrack === "1";
    } catch { return false; }
  };

  /* enabled state: DNT always wins; otherwise the user toggle (default ON).
   * PORTAL (blocker #3): tắt hẳn analytics trong iframe portal — Poki chặn mọi external request. */
  const portalMode = (() => { try { return window.WK_PORTAL_MODE === true; } catch { return false; } })();
  let enabled = !dnt() && !portalMode && store.get("wk_analytics") !== "0";
  const isEnabled = () => enabled && !dnt() && !portalMode;

  const queue = [];            // analytics events awaiting batch flush
  const errorQueue = [];       // error events (own pipeline -> /api/errors)
  let profileHash = null;      // sha256 hex, resolved async
  let profileHashPending = null;
  let flushTimer = null;
  let lastErrorAt = 0;
  const errorTimes = [];

  function setProfile(id) {
    if (!id || typeof id !== "string") return;
    if (profileHashPending) return; // hash once per page load
    try {
      profileHashPending = crypto.subtle.digest("SHA-256", new TextEncoder().encode("wk:" + id))
        .then((buf) => {
          profileHash = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
        })
        .catch(() => { profileHash = null; });
    } catch { profileHash = null; }
  }

  const num = (v, dflt = 0) => { const n = Number(v); return Number.isFinite(n) ? n : dflt; };

  function track(type, data, opts) {
    if (typeof type !== "string" || !type) return;
    const force = !!(opts && opts.force);
    if (!isEnabled() && !force) return;
    const ev = { type, ts: Date.now(), ...(data && typeof data === "object" ? data : {}) };
    if (type === "error") {
      // throttle: drop bursts, dedupe identical messages within the window
      const now = Date.now();
      while (errorTimes.length && now - errorTimes[0] > 60_000) errorTimes.shift();
      if (errorTimes.length >= ERROR_MAX_PER_MIN) return;
      if (now - lastErrorAt < ERROR_MIN_INTERVAL_MS &&
          errorQueue.length && errorQueue[errorQueue.length - 1].message === ev.message) return;
      lastErrorAt = now;
      errorTimes.push(now);
      errorQueue.push(ev);
      if (errorQueue.length > 50) errorQueue.shift();
      scheduleFlush(2_000);
    } else {
      queue.push(ev);
      if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);
      if (queue.length >= MAX_BATCH) flush();
    }
  }

  function sendBeaconJson(path, payload) {
    const body = JSON.stringify(payload);
    if (body.length > 60 * 1024) return false; // keep under the server 64 KB cap
    const url = apiBase() + path;
    try {
      if (typeof navigator.sendBeacon === "function") {
        const blob = new Blob([body], { type: "application/json" });
        if (navigator.sendBeacon(url, blob)) return true;
      }
    } catch { /* fall through to fetch */ }
    try {
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
        credentials: "omit",
      }).catch(() => {});
      return true;
    } catch { return false; }
  }

  function apiBase() {
    // Same resolution order as js/api.js (duplicated to stay dependency-free).
    try {
      if (typeof window.WK_API_BASE === "string" && window.WK_API_BASE) {
        return window.WK_API_BASE.replace(/\/$/, "");
      }
      const v = localStorage.getItem("wk_api_base");
      if (v) return v.replace(/\/$/, "");
    } catch {}
    return "";
  }

  function stampProfile(ev) {
    if (profileHash) ev.profile_id_hash = profileHash;
    return ev;
  }

  function flush() {
    flushTimer = null;
    // Drain the pre-queue left by menu.js before this script finished loading.
    try {
      const pre = window.__wk_analytics_prequeue;
      if (Array.isArray(pre) && pre.length) {
        window.__wk_analytics_prequeue = [];
        for (const e of pre) track(e && e.type, e && e.data);
      }
    } catch {}
    if (!isEnabled()) { queue.length = 0; errorQueue.length = 0; return; }
    // Prefer the shared transport from js/api.js when available.
    const api = window.WKApi;
    if (queue.length) {
      const batch = queue.splice(0, MAX_BATCH).map(stampProfile);
      if (api && typeof api.sendEvents === "function") api.sendEvents(batch);
      else sendBeaconJson("/api/events", { events: batch });
    }
    if (errorQueue.length) {
      const batch = errorQueue.splice(0, 20).map(stampProfile);
      if (api && typeof api.sendErrors === "function") api.sendErrors(batch);
      else sendBeaconJson("/api/errors", { errors: batch });
    }
  }

  function scheduleFlush(ms) {
    if (flushTimer) return;
    flushTimer = setTimeout(flush, Math.max(0, ms | 0));
  }

  /* ---------- automatic hooks: errors ---------- */
  window.addEventListener("error", (e) => {
    const msg = String((e && e.message) || "unknown error").slice(0, 500);
    const src = e && e.filename
      ? String(e.filename).split("/").slice(-1)[0] + ":" + num(e.lineno) + ":" + num(e.colno)
      : "";
    track("error", { message: msg, source: src.slice(0, 200) });
  });
  window.addEventListener("unhandledrejection", (e) => {
    let msg = "unhandledrejection";
    try {
      const r = e && e.reason;
      msg = String((r && (r.message || r)) || r).slice(0, 500);
    } catch {}
    track("error", { message: msg, source: "promise" });
  });

  /* ---------- automatic hooks: game events over BroadcastChannel ----------
     game.html (game.js) already posts { type:"gameover", profileId, score, wave,
     kills, timeSec, diff }. This listener needs NO changes in game.js. */
  try {
    if ("BroadcastChannel" in window) {
      const bus = new BroadcastChannel(BUS);
      bus.onmessage = (ev) => {
        const m = (ev && ev.data) || {};
        if (m.type === "gameover") {
          setProfile(m.profileId);
          track("game_over", {
            score: Math.max(0, Math.floor(num(m.score))),
            wave: Math.max(0, Math.floor(num(m.wave))),
            duration_s: Math.max(0, Math.floor(num(m.timeSec))),
            difficulty: ["chill", "normal", "hard"].includes(m.diff) ? m.diff : "normal",
          });
        } else if (m.type === "wave") {
          // Reserved for gameplay team: bus.postMessage({ type:"wave", wave, act })
          track("wave_reached", {
            wave: Math.max(1, Math.floor(num(m.wave, 1))),
            ...(m.act !== undefined ? { act: Math.max(0, Math.floor(num(m.act))) } : {}),
          });
        } else if (m.type === "upgrade_chosen") {
          // Reserved: bus.postMessage({ type:"upgrade_chosen", upgradeId })
          track("upgrade_chosen", { upgrade_id: String(m.upgradeId || "").slice(0, 64) });
        } else if (m.type === "upgrade_draft_shown") {
          // Reserved: bus.postMessage({ type:"upgrade_draft_shown" })
          track("upgrade_draft_shown", {});
        }
      };
    }
  } catch {}

  /* ---------- periodic + unload flush ---------- */
  setInterval(() => { if (queue.length || errorQueue.length) flush(); }, FLUSH_MS);
  document.addEventListener("visibilitychange", () => { if (document.hidden) flush(); });
  window.addEventListener("pagehide", flush);

  function setEnabled(on) {
    enabled = !!on && !dnt();
    store.set("wk_analytics", enabled ? "1" : "0");
    if (!enabled) { queue.length = 0; errorQueue.length = 0; }
  }

  const api = { track, setProfile, flush, setEnabled, isEnabled, ready: true };

  // Drain anything queued before this script executed.
  setTimeout(flush, 0);
  return api;
})();
} // end idempotency guard
