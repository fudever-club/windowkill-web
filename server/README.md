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
| `WK_CORS_ORIGINS` | _(empty)_ | comma-separated allowed origins; empty = same-origin only. Production must include `https://windowkill.fudever.com`, `https://quangnhat1504.itch.io` **and** `https://html-classic.itch.zone` (the origin the game actually runs from inside the itch.io iframe — B6) |
| `WK_RL_READ` / `WK_RL_WRITE` | `120` / `30` | rate limit per IP per minute (reads / writes) |
| `WK_RL_EVENTS` / `WK_RL_ERRORS` | `60` / `20` | dedicated rate limits per IP per minute for `/api/events` / `/api/errors` |
| `WK_EVENTS_CAP` / `WK_ERRORS_CAP` | `100000` / `500` | max rows kept in the `events` / `errors` tables (oldest trimmed) |
| `WK_MAX_BODY` | `65536` | max JSON body bytes |

systemd template: `windowkill-backend.service` (sample only — not enabled).

## API

All responses are JSON: `{ ok: true, data }` or `{ ok: false, error }`.

| Method & path | Body / query | Description |
|---|---|---|
| `GET /api/health` | — | readiness probe `{ status, version, time }` — runs `SELECT 1` against the DB and returns `503` if the DB is dead (B13); exempt from rate limiting |
| `GET /api/profiles` | — | list profiles (public; token hashes are never returned) |
| `POST /api/profiles` | `{ id?, name, emoji? }` | create profile (name 1–24 chars). Response includes a one-time `token` — see Auth below |
| `DELETE /api/profiles/:id` | header `X-Profile-Token` | delete profile + its scores (auth required) |
| `POST /api/scores` | `{ profileId, score, wave, kills, durationMs, difficulty }` + header `X-Profile-Token` | submit a game result (`difficulty`: `chill`/`normal`/`hard`); score/wave/kills/duration must be mutually plausible (SEC-04) |
| `GET /api/leaderboard?difficulty=&limit=` | `difficulty` default `normal`, `limit` 1–50 default 10 | top scores with profile name/emoji |
| `GET /api/stats/:profileId` | — | aggregated stats + best score per difficulty |
| `POST /api/events` | `{ events: [{ type, ts, ... }] }` (≤100/batch, ≤64 KB) | ingest privacy-friendly analytics events (see `docs/ANALYTICS.md`) |
| `POST /api/errors` | `{ errors: [{ message, source?, ts? }] }` (≤20/batch) | ingest client error reports; table capped at 500 rows (oldest trimmed) |
| `GET /api/metrics` | — | internal dashboard aggregates: `dau`, `games7d`, `avgScore7d`, `bestWave7d`, `byDifficulty7d` |

## Auth — profile tokens (SEC-01)

- `POST /api/profiles` generates a 32-byte random token, stores only its
  **SHA-256 hash** (`profiles.token_hash`), and returns the raw token **once**
  in the create response (`data.token`). It is never stored or shown again.
- `DELETE /api/profiles/:id` and `POST /api/scores` require the header
  `X-Profile-Token: <token>`: missing → `401`, wrong → `403`.
  `js/api.js` persists tokens in `localStorage` (`wk_profile_tokens`, keyed by
  profile id) at creation time and attaches the header automatically.
- **Legacy profiles** (rows created before tokens existed, `token_hash` NULL)
  remain writable *without* a token — the server logs a warning — and are
  **claimed** the first time a write presents any token for them (that token's
  hash is stored; from then on it is required). Rationale: the backend has
  never run publicly, so legacy rows are the owner's own local data; locking
  them out would orphan them, and an un-claimed legacy profile is no more
  exposed than it was before tokens existed. New profiles are always
  token-protected.
- Read endpoints (`leaderboard`, `stats`, `profiles`, `metrics`, `health`)
  stay public.

## Security

- **Profile-token auth** on profile writes/deletes (see Auth above).
- Strict input validation on every endpoint (types, ranges, lengths); malformed JSON → `400`.
  Score validation also checks cross-field plausibility (SEC-04):
  `score ≤ kills*200 + wave*5000 + 10000`, `durationMs ≥ (wave-1)*3000` for wave ≥ 2,
  and `kills ≤ 100 + durationMs/200` — casual anti-cheat, not a proof of play.
- Prepared statements everywhere (no string-concatenated SQL).
- Fixed-window rate limiting per **real client IP** (first `X-Forwarded-For`
  entry behind the Fly proxy, socket address otherwise; separate budgets for
  reads/writes) → `429`. `GET /api/health` is never rate-limited (B5).
- Security headers: `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Cross-Origin-Opener/Resource-Policy`, `Permissions-Policy`, `Content-Security-Policy: default-src 'none'`.
- CORS is **deny-by-default AND enforced on real requests** (SEC-03): origins
  must be allowlisted via `WK_CORS_ORIGINS`; a write request (`POST`/`PUT`/
  `PATCH`/`DELETE`) carrying a foreign, non-same-origin `Origin` is rejected
  `403`, and write bodies must be `Content-Type: application/json` (`415`
  otherwise) — CORS response headers alone do not stop cross-site writes.
- Request body capped at 64 KB; server binds to `127.0.0.1` by default.
- **Schema migrations (B7):** `PRAGMA user_version` + an ordered migration
  list in `src/db.js` runs at boot (migration 1 adds `profiles.token_hash`),
  so new builds upgrade database files already living on a persistent volume.

## Deploy — Fly.io (B3)

Deploy files live **in this repo**: `server/deploy/Dockerfile` +
`server/deploy/fly.toml` (build context = repo root; port 3001; env
`WK_DB=/data/windowkill.db` on the `wk_data` volume; Fly http check and
Docker `HEALTHCHECK` both target `GET /api/health`; CORS origins, including
the itch iframe origin, are set in `fly.toml [env]`).

One-time setup & deploy (from the **repo root**):

```bash
# ⛔ BLOCKER: needs the project owner's own Fly.io account — Muse cannot do this step.
fly auth signup        # or: fly auth login   (Fly asks for a card to verify the free tier)
fly launch --no-deploy --copy-config --config server/deploy/fly.toml
fly volumes create wk_data --size 1 --region sin
fly deploy --config server/deploy/fly.toml --dockerfile server/deploy/Dockerfile
fly status && curl -s https://windowkill-backend.fly.dev/api/health
```

After deploying, point the web build at the backend (`window.WK_API_BASE =
https://windowkill-backend.fly.dev`) — that frontend wiring is a separate
step; without it the game simply keeps running on its localStorage fallback.
**Not yet deployed** — the steps above are ready to run, pending the Fly
account step. Backup note: copy the DB with `sqlite3 .backup` / after a
checkpoint, never by copying the raw `.db` file while the server runs (WAL).

## Tests

```bash
cd server
npm test   # node:test — boots the real server on an ephemeral port, 15 cases
           # (incl. profile-token auth, SEC-04 correlation, CORS enforcement,
           #  XFF rate limiting + health exemption, and the B7 DB migration)
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
  when the backend is unreachable — never throws into game code. It also stores
  the one-time profile token returned at creation (`localStorage`
  `wk_profile_tokens`) and attaches `X-Profile-Token` to score submissions and
  profile deletes automatically.
- `js/menu.js` — keeps `localStorage` as the source of truth; fire-and-forget
  mirrors profile create/delete and game-over scores to the backend; shows a
  🌐/📴 badge and a top-5 online leaderboard per difficulty when online.
