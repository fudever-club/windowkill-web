/* WINDOWKILL backend — tiny fixed-window rate limiter (per IP, in-memory).
 *
 * Buckets: read | write | events | errors. The legacy check(ip, isWrite)
 * signature maps onto the read/write buckets so existing callers keep working.
 */
"use strict";

const KINDS = ["read", "write", "events", "errors"];

export function createRateLimiter({ readPerMin, writePerMin, eventsPerMin, errorsPerMin }) {
  const limits = {
    read: readPerMin,
    write: writePerMin,
    events: eventsPerMin ?? writePerMin,
    errors: errorsPerMin ?? 20,
  };
  // ip -> { <kind>: {count, reset} }
  const buckets = new Map();

  function fresh() {
    const now = Date.now();
    const b = {};
    for (const k of KINDS) b[k] = { count: 0, reset: now + 60_000 };
    return b;
  }

  function checkKind(ip, kind) {
    const now = Date.now();
    let b = buckets.get(ip);
    if (!b) {
      b = fresh();
      buckets.set(ip, b);
    }
    const slot = b[kind] || b.write;
    if (now > slot.reset) {
      slot.count = 0;
      slot.reset = now + 60_000;
    }
    const limit = limits[kind] ?? limits.write;
    slot.count += 1;
    return { allowed: slot.count <= limit, limit, remaining: Math.max(0, limit - slot.count) };
  }

  // Prevent unbounded memory growth: prune stale entries every 5 minutes.
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [ip, b] of buckets) {
      if (KINDS.every((k) => now > b[k].reset)) buckets.delete(ip);
    }
  }, 5 * 60_000);
  timer.unref?.();

  return {
    check: (ip, isWrite) => checkKind(ip, isWrite ? "write" : "read"),
    checkKind,
  };
}
