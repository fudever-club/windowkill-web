/* WINDOWKILL backend — input validation (fail fast, reject garbage) */
"use strict";
import { DIFFICULTIES } from "./db.js";

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

function intIn(v, min, max) {
  return Number.isInteger(v) && v >= min && v <= max ? v : null;
}

export function validId(v) {
  return typeof v === "string" && ID_RE.test(v) ? v : null;
}

export function validProfileBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  if (body.id !== undefined && !validId(body.id)) return null;
  if (typeof body.name !== "string") return null;
  const name = body.name.trim().slice(0, 24);
  if (!name) return null;
  let emoji = "🎮";
  if (body.emoji !== undefined) {
    if (typeof body.emoji !== "string") return null;
    emoji = [...body.emoji].slice(0, 4).join("") || "🎮";
  }
  return { id: body.id, name, emoji };
}

export function validScoreBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const profileId = validId(body.profileId);
  const score = intIn(body.score, 0, 99_999_999);
  const wave = intIn(body.wave, 0, 9_999);
  const kills = intIn(body.kills, 0, 999_999);
  const durationMs = intIn(body.durationMs, 0, 86_400_000);
  const difficulty =
    typeof body.difficulty === "string" && DIFFICULTIES.includes(body.difficulty)
      ? body.difficulty
      : null;
  if (!profileId || score === null || wave === null || kills === null || durationMs === null || !difficulty) {
    return null;
  }
  /* SEC-04: cross-field plausibility (casual anti-cheat, NOT a proof of play).
   * Calibrated against js/game.js, where scores are fixed per kill
   * (max base 50/kill, boss 500, chain-popup bonuses 40–500 per event):
   *   1. score ceiling — score <= kills*200 + wave*5000 + 10000.
   *      200/kill is ~4x the richest regular kill; the wave term absorbs
   *      boss/chain bonuses; the flat 10000 covers a short lucky run.
   *      Kills the classic "score=99,999,999, wave=0, kills=0" forgery.
   *   2. wave needs time — reaching wave N (N>=2) means clearing N-1 waves,
   *      at a very lenient >=3s per cleared wave: durationMs >= (wave-1)*3000.
   *   3. kill rate — sustained kills cannot exceed ~5/s (+100 slack for
   *      nuke/chain bursts): kills <= 100 + durationMs/200.
   * A cheater who maxes EVERY field consistently can still pass — that is
   * accepted for a casual leaderboard; see SEC-04 in the security audit. */
  if (score > kills * 200 + wave * 5000 + 10_000) return null;
  if (wave >= 2 && durationMs < (wave - 1) * 3000) return null;
  if (kills > 100 + Math.floor(durationMs / 200)) return null;
  return { profileId, score, wave, kills, durationMs, difficulty };
}

export function validLeaderboardQuery(searchParams) {
  const difficulty = searchParams.get("difficulty") || "normal";
  if (!DIFFICULTIES.includes(difficulty)) return null;
  const rawLimit = searchParams.get("limit");
  const limit = rawLimit === null ? 10 : intIn(Number(rawLimit), 1, 50);
  if (limit === null) return null;
  return { difficulty, limit };
}

/* ---------- analytics events ---------- */

const EVENT_TYPES = new Set([
  "game_start", "game_over", "wave_reached", "upgrade_chosen",
  "upgrade_draft_shown", "settings_changed", "error",
]);
const HASH_RE = /^[0-9a-f]{64}$/;
const UPGRADE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const SETTING_KEY_RE = /^[A-Za-z0-9_]{1,32}$/;

function validHash(v) {
  return v === undefined || v === null ? null : (typeof v === "string" && HASH_RE.test(v) ? v : false);
}

/* ts must be a plausible client timestamp: not before 2025, not >5 min in the future. */
function validTs(v) {
  if (!Number.isInteger(v)) return null;
  const now = Date.now();
  return v >= 1_735_689_600_000 && v <= now + 300_000 ? v : null;
}

const strCap = (v, max) => (typeof v === "string" && v.length > 0 && v.length <= max ? v : null);

/* Validates one analytics event; returns the normalized form or null.
 * Normalized: { type, ts, profile_id_hash?, difficulty?, score?, wave?, payload }.
 * Unknown fields are stripped; score/wave/difficulty are extracted for metrics. */
export function validEvent(e) {
  if (!e || typeof e !== "object" || Array.isArray(e)) return null;
  if (typeof e.type !== "string" || !EVENT_TYPES.has(e.type)) return null;
  const ts = validTs(e.ts);
  if (ts === null) return null;
  const hash = validHash(e.profile_id_hash);
  if (hash === false) return null;

  const out = { type: e.type, ts, payload: {} };
  if (hash) out.profile_id_hash = hash;

  switch (e.type) {
    case "game_start": {
      if (typeof e.difficulty !== "string" || !DIFFICULTIES.includes(e.difficulty)) return null;
      out.difficulty = e.difficulty;
      break;
    }
    case "game_over": {
      const score = intIn(e.score, 0, 99_999_999);
      const wave = intIn(e.wave, 0, 9_999);
      if (score === null || wave === null) return null;
      out.score = score;
      out.wave = wave;
      if (e.difficulty !== undefined) {
        if (typeof e.difficulty !== "string" || !DIFFICULTIES.includes(e.difficulty)) return null;
        out.difficulty = e.difficulty;
      }
      const act = e.act === undefined ? null : intIn(e.act, 0, 99);
      const dur = e.duration_s === undefined ? null : intIn(e.duration_s, 0, 86_400);
      if ((e.act !== undefined && act === null) || (e.duration_s !== undefined && dur === null)) return null;
      out.payload = { ...(act !== null ? { act } : {}), ...(dur !== null ? { duration_s: dur } : {}) };
      break;
    }
    case "wave_reached": {
      const wave = intIn(e.wave, 1, 9_999);
      if (wave === null) return null;
      out.wave = wave;
      const act = e.act === undefined ? null : intIn(e.act, 0, 99);
      if (e.act !== undefined && act === null) return null;
      out.payload = act !== null ? { act } : {};
      break;
    }
    case "upgrade_chosen": {
      const id = strCap(e.upgrade_id, 64);
      if (!id || !UPGRADE_ID_RE.test(id)) return null;
      out.payload = { upgrade_id: id };
      break;
    }
    case "upgrade_draft_shown":
      break; // no extra fields
    case "settings_changed": {
      const key = typeof e.key === "string" && SETTING_KEY_RE.test(e.key) ? e.key : null;
      if (!key) return null;
      let value = e.value;
      if (typeof value === "boolean") value = value ? "true" : "false";
      else if (typeof value === "number") value = Number.isFinite(value) ? String(value) : null;
      else if (typeof value !== "string" || value.length > 64) value = null;
      if (value === null) return null;
      out.payload = { key, value };
      break;
    }
    case "error": {
      // errors normally go to /api/errors; accepted here too for robustness
      const message = strCap(e.message, 500);
      if (!message) return null;
      const source = e.source === undefined ? "" : (typeof e.source === "string" ? e.source.slice(0, 200) : null);
      if (source === null) return null;
      out.payload = { message, source };
      break;
    }
    default:
      return null;
  }
  return out;
}

export function validEventsBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const arr = body.events;
  if (!Array.isArray(arr) || arr.length === 0 || arr.length > 100) return null;
  const events = [];
  for (const e of arr) {
    const v = validEvent(e);
    if (!v) return null; // one bad event rejects the whole batch (fail fast)
    events.push(v);
  }
  return { events };
}

/* ---------- client error reports ---------- */

export function validErrorsBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const arr = body.errors;
  if (!Array.isArray(arr) || arr.length === 0 || arr.length > 20) return null;
  const errors = [];
  for (const e of arr) {
    if (!e || typeof e !== "object" || Array.isArray(e)) return null;
    const message = strCap(e.message, 500);
    if (!message) return null;
    const source = e.source === undefined ? "" : (typeof e.source === "string" ? e.source.slice(0, 200) : null);
    if (source === null) return null;
    const ts = e.ts === undefined ? Date.now() : validTs(e.ts);
    if (ts === null) return null;
    const hash = validHash(e.profile_id_hash);
    if (hash === false) return null;
    errors.push({ message, source, ts, profile_id_hash: hash || null });
  }
  return { errors };
}
