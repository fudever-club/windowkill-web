# windowkill-backend — optional API server for WINDOWKILL Web Edition

Lightweight backend for **profiles, scores, leaderboard and stats**.
It is **strictly optional**: the game works 100% on static hosting
(Vercel / `python3 -m http.server` / Electron) using `localStorage`.
When the backend is reachable, the launcher (`js/api.js` + `js/menu.js`)
mirrors profiles & game-over scores to it and shows an online leaderboard.

**Zero dependencies** — Node 24 built-ins only (`node:http`, `node:sqlite`).
No `npm install` needed.

## Run

```bash
cd server
npm start            # listens on http://127.0.0.1:3001
```

Environment variables:

| Var | Default | Meaning |
|---|---|---|
| `PORT` | `3001` | listen port |
| `HOST` | `127.0.0.1` | listen address |
| `WK_DB` | `server/data/windowkill.db` | SQLite file path |
| `WK_CORS_ORIGINS` | _(empty)_ | comma-separated allowed origins; empty = same-origin only (no CORS headers) |
| `WK_RL_READ` / `WK_RL_WRITE` | `120` / `30` | rate limit per IP per minute (reads / writes) |
| `WK_RL_EVENTS` / `WK_RL_ERRORS` | `60` / `20` | dedicated rate limits per IP per minute for `/api/events` / `/api/errors` |
| `WK_EVENTS_CAP` / `WK_ERRORS_CAP` | `100000` / `500` | max rows kept in the `events` / `errors` tables (oldest trimmed) |
| `WK_MAX_BODY` | `65536` | max JSON body bytes |

systemd template: `windowkill-backend.service` (sample only — not enabled).

## API

All responses are JSON: `{ ok: true, data }` or `{ ok: false, error }`.

| Method & path | Body / query | Description |
|---|---|---|
| `GET /api/health` | — | liveness probe `{ status, version, time }` |
| `GET /api/profiles` | — | list profiles |
| `POST /api/profiles` | `{ id?, name, emoji? }` | create profile (name 1–24 chars) |
| `DELETE /api/profiles/:id` | — | delete profile + its scores |
| `POST /api/scores` | `{ profileId, score, wave, kills, durationMs, difficulty }` | submit a game result (`difficulty`: `chill`/`normal`/`hard`) |
| `GET /api/leaderboard?difficulty=&limit=` | `difficulty` default `normal`, `limit` 1–50 default 10 | top scores with profile name/emoji |
| `GET /api/stats/:profileId` | — | aggregated stats + best score per difficulty |
| `POST /api/events` | `{ events: [{ type, ts, ... }] }` (≤100/batch, ≤64 KB) | ingest privacy-friendly analytics events (see `docs/ANALYTICS.md`) |
| `POST /api/errors` | `{ errors: [{ message, source?, ts? }] }` (≤20/batch) | ingest client error reports; table capped at 500 rows (oldest trimmed) |
| `GET /api/metrics` | — | internal dashboard aggregates: `dau`, `games7d`, `avgScore7d`, `bestWave7d`, `byDifficulty7d` |

## Security

- Strict input validation on every endpoint (types, ranges, lengths); malformed JSON → `400`.
- Prepared statements everywhere (no string-concatenated SQL).
- Fixed-window rate limiting per IP (separate budgets for reads/writes) → `429`.
- Security headers: `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Cross-Origin-Opener/Resource-Policy`, `Permissions-Policy`, `Content-Security-Policy: default-src 'none'`.
- CORS is **deny-by-default**: origins must be allowlisted via `WK_CORS_ORIGINS`.
- Request body capped at 64 KB; server binds to `127.0.0.1` by default.

## Tests

```bash
cd server
npm test   # node:test — boots the real server on an ephemeral port, 11 cases
```

## Analytics & error pipeline

`POST /api/events` accepts batches of privacy-friendly analytics events —
see `docs/ANALYTICS.md` for the full schema. Validation is strict per event
type (`game_start`, `game_over`, `wave_reached`, `upgrade_chosen`,
`upgrade_draft_shown`, `settings_changed`, `error`); one bad event rejects
the whole batch. Only `score`/`wave`/`difficulty` are extracted into columns
for aggregation — everything else lives in an opaque JSON `payload`.

`POST /api/errors` accepts client error reports (`message` ≤ 500 chars,
`source` ≤ 200 chars, optional `profile_id_hash`). The table is capped at
`WK_ERRORS_CAP` (default 500) rows — oldest are trimmed on every insert.

`GET /api/metrics` returns internal-dashboard aggregates only (no PII):
daily active users (distinct profile hashes, 24 h), games / average score /
best wave over 7 days, and the same broken down by difficulty.

Clients never send raw profile ids: `js/analytics.js` hashes them with
SHA-256 (`crypto.subtle`) before queueing, honours Do-Not-Track, and exposes
an in-game opt-out toggle (`Cài đặt` → `Thống kê ẩn danh`).

## Frontend wiring

- `js/api.js` — `window.WKApi` client. Detects the backend via `GET /api/health`
  (1.5 s timeout, cached 60 s). Base URL: `window.WK_API_BASE`, else
  `localStorage.wk_api_base`, else same origin. Every method resolves to `null`
  when the backend is unreachable — never throws into game code.
- `js/menu.js` — keeps `localStorage` as the source of truth; fire-and-forget
  mirrors profile create/delete and game-over scores to the backend; shows a
  🌐/📴 badge and a top-5 online leaderboard per difficulty when online.
