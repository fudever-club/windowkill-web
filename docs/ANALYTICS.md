# WINDOWKILL Analytics — privacy-friendly, tự build

> Không cookie · Không fingerprint · Tôn trọng Do-Not-Track · Opt-out trong game · Backend optional

## 1. Vì sao tự build thay vì Plausible / PostHog?

| Tiêu chí | Tự build (đã chọn) | Plausible | PostHog |
|---|---|---|---|
| Privacy | ✅ Không cookie, không fingerprint; chỉ lưu sha256(profile_id), aggregate | ✅ Privacy-first, không cookie | ⚠️ Có cookie/session, cần cấu hình cookie-less |
| DNT / opt-out | ✅ DNT tắt hẳn SDK; toggle trong Settings | ✅ Tôn trọng DNT | ⚠️ Phải tự cấu hình |
| Chi phí | ✅ 0đ — chạy cùng backend Node/SQLite hiện có | 💰 $9/tháng (10k pageviews) self-host free nhưng cần server | 💰 Free 1M events/tháng, sau đó trả phí; self-host nặng |
| Phụ thuộc ngoài | ✅ Không — zero-dep, cùng repo | ❌ Script + tài khoản Plausible | ❌ SDK + tài khoản PostHog |
| Event game custom (wave, upgrade, boss) | ✅ Schema riêng cho game | ⚠️ Custom events được nhưng dashboard web-centric | ✅ Mạnh về product analytics |
| Offline / Electron / file:// | ✅ Hàng đợi local, drop êm khi không có backend | ❌ Cần mạng tới Plausible | ❌ Cần mạng tới PostHog |
| Công maintain | ⚠️ Team tự maintain (~300 dòng server + ~250 dòng client) | ✅ Họ maintain | ✅ Họ maintain |

**Kết luận:** với quy mô CLB, event đơn giản, và yêu cầu "không cookie + chạy được offline + 0 chi phí", tự build trên backend Node/SQLite sẵn có là hợp lý nhất. Nếu sau này cần funnel/retention phức tạp, có thể export `events` ra PostHog sau — schema đã tách `payload` JSON nên dễ migrate.

## 2. Kiến trúc

```
index.html ── menu.js ──(dynamic import)──▶ js/analytics.js ──sendBeacon──▶ POST /api/events
   │                                                        └─────────────▶ POST /api/errors
   │── BroadcastChannel "windowkill_bus" ◀── game.html (game.js: gameover)
```

- **Client** (`js/analytics.js`, `js/api.js`): hàng đợi trong RAM, batch mỗi **15 s** (hoặc khi tab ẩn/`pagehide`), gửi bằng `navigator.sendBeacon`, fallback `fetch({ keepalive: true })`. Không bao giờ throw vào game.
- **Server** (`server/src/`): bảng `events` + `errors` (SQLite WAL), validate schema chặt, rate-limit riêng từng pipeline.
- **Backend optional**: không có backend → sự kiện bị drop êm, game chạy 100% localStorage như cũ.

## 3. Schema event

`POST /api/events` — body `{ "events": [...] }`, tối đa **100 event/batch**, body ≤ **64 KB**, rate limit **60 req/phút/IP**. Một event lỗi → cả batch bị từ chối (fail fast).

Trường chung: `type` (string), `ts` (ms, không quá khứ 2025 / tương lai +5'), `profile_id_hash` (optional, đúng 64 ký tự hex sha256 — **không bao giờ gửi raw id**).

| type | fields | nguồn |
|---|---|---|
| `game_start` | `difficulty`: chill\|normal\|hard, `profile_id_hash` | menu.js — bấm CHƠI NGAY |
| `game_over` | `score` (0–99.999.999), `wave` (0–9999), `duration_s`, `act?`, `difficulty?`, `profile_id_hash` | bus `gameover` từ game.html → analytics.js tự map, không cần sửa game.js |
| `wave_reached` | `wave` (1–9999), `act?` | bus `wave` — **chờ team gameplay** post từ game.js (đã có listener sẵn) |
| `upgrade_chosen` | `upgrade_id` (1–64 ký tự `[A-Za-z0-9_-]`) | bus `upgrade_chosen` — **chờ team gameplay** |
| `upgrade_draft_shown` | — | bus `upgrade_draft_shown` — **chờ team gameplay** |
| `settings_changed` | `key` (music/sfx/shake/diff/analytics), `value` | menu.js — mọi toggle |
| `error` | `message` (≤500), `source` (≤200, dạng `game.js:42:7`) | `window.onerror` / `unhandledrejection` trong analytics.js |

`POST /api/errors` — body `{ "errors": [...] }`, tối đa **20/batch**, rate limit **20 req/phút/IP**, bảng cap **500 rows** (tự trim dòng cũ nhất). Client còn tự throttle: tối đa 10 error/phút, dedupe message trùng trong 5 s.

`GET /api/metrics` — aggregate cho dashboard nội bộ (không PII): `dau` (distinct hash / 24h), `games7d`, `avgScore7d`, `bestWave7d`, `byDifficulty7d`, `generatedAt`.

## 4. Cách tắt

1. **Trong game:** Cài đặt → tắt `Thống kê ẩn danh (không cookie)`. Sự kiện đang chờ bị xóa, không gửi thêm.
2. **Trình duyệt:** bật Do-Not-Track → SDK tự vô hiệu hóa hoàn toàn (kể cả khi toggle đang bật).
3. **Dev/tự host:** không chạy backend (`server/`) → client tự drop sự kiện.
4. **Xóa hẳn:** xóa `js/analytics.js` + đoạn bootstrap trong `js/menu.js` (không ảnh hưởng game).

## 5. Lưu ý đã biết

- CSP `connect-src 'self'` của index.html: analytics gửi về **same-origin** (reverse proxy `/api/*`). Nếu backend chạy ở `http://localhost:3001` trong lúc dev qua `python3 -m http.server`, cần nới CSP hoặc set `localStorage.wk_api_base` + reverse proxy — ngoài phạm vi task này.
- Error monitoring hiện phủ **launcher (index.html)**; cửa sổ game (game.html) cần team gameplay thêm `js/analytics.js` vào game.html (không được sửa trong task này).
- `wave_reached` / `upgrade_chosen` / `upgrade_draft_shown` đã có listener + schema + test server; chỉ cần game.js post message lên bus là chạy, không cần đụng analytics.js.
