# AUDIT — Backend / Server WINDOWKILL

- **Ngày:** 2026-10-02 · **Người audit:** Backend Engineer, FU-DEVER Game Studio
- **Nơi làm việc:** `~/workspace/wk-deep`, branch `dev/deep-audit-upgrades-2026-10`, base commit `3b25694` (main sau PR #29)
- **Phạm vi:** `server/` (Node zero-dep + `node:sqlite`) — `src/index.js`, `server.js`, `db.js`, `config.js`, `validate.js`, `ratelimit.js`, `security.js`, `tests/api.test.js`, `windowkill-backend.service`, `README.md`; đối chiếu thêm `js/api.js`, `js/menu.js`, `api/leaderboard.js`, `docs/DEPLOY-BACKEND.md` và bộ deploy Fly ở `~/workspace/windowkill-web/dist/deploy-fly/` (ngoài repo — xem B3).
- **Phương pháp:** đọc toàn bộ code + chạy test thật + chạy server local và curl verify hành vi thật (chi tiết ở mục 6). Không sửa file code nào; deliverable duy nhất là báo cáo này.
- **Môi trường test:** Node `v24.20.0` (sandbox Linux). Server test chạy trên `127.0.0.1:3101–3103` với DB tạm trong `/tmp`.

## Kết luận nhanh (verdict)

Code backend **chất lượng tốt ở mức self-host/VPS cho CLB**: validation chặt, prepared statements 100%, security headers đúng, CORS deny-by-default, rate limit tách bucket, test pass 10/10, graceful shutdown chạy thật được. **Nhưng CHƯA deploy-readiness cho public production trên Fly.io**: không có bất kỳ authentication/authorization nào trong khi có endpoint xoá dữ liệu và leaderboard chấp nhận điểm tự khai tối đa (đều đã verify bằng curl); bộ file deploy Fly **không nằm trong repo này** và Dockerfile có lỗi build-context; frontend production **chưa hề được trỏ** về backend; CORS thiếu origin iframe thật của itch.io. Chỉ cần xử lý nhóm CRITICAL+HIGH dưới đây là deploy được cho quy mô hiện tại.

---

## 1. Kiến trúc & chất lượng

**Luồng request** (`server.js:createApp`): `createServer` → `applySecurityHeaders` → `applyCors` (OPTIONS trả 204 nếu origin được allowlist, 403 nếu không) → parse URL → rate-limit theo IP/kind → tìm route trong bảng route tự compile (`method + regex :param`) → nếu là write thì `readBody` (cap `WK_MAX_BODY`, mặc định 64 KB) vào `req.rawBody` → handler tự `JSON.parse` + validate → gọi store (`db.js`, prepared statements) → trả envelope nhất quán `{ok:true,data}` / `{ok:false,error}`. `src/index.js` là bootstrap mỏng: `mkdirSync(dirname(dbPath))`, `listen`, log 1 dòng. Tách factory `createApp(overrides)` cho test — thiết kế sạch, dễ test.

**Error handling:**
- Tốt: malformed JSON → `400 "invalid JSON body"` (verify thật); validation fail → `400` kèm message mô tả; profile trùng id → `409`; không tồn tại → `404`; route lạ → `404` JSON; lỗi còn lại rơi vào catch ngoài cùng → `500 "internal server error"` **không lộ stack/SQL ra client** (đúng chuẩn).
- Chưa tốt: (a) lỗi body-too-large không tới được client — xem B12; (b) phân biệt `409` dựa vào `String(e.message).includes("UNIQUE")` — brittle theo phiên bản Node/SQLite (B20); (c) `decodeURIComponent(param)` với `%` lỗi có thể ném `URIError` → thành `500` thay vì `400` (đọc code, **chưa test live** — B19).

**Logging:** gần như không có. Chỉ có: 1 dòng startup, 1 dòng shutdown, và `console.error("[windowkill-backend] request error:", e?.message)` khi 500 — **chỉ log message, mất stack trace, không timestamp, không method/path/status, không request log**. Điểm cộng: không log body/header/ dữ liệu nhạy cảm nào. Hệ quả thực tế: lên Fly thì `fly logs` gần như trống, không truy vết được request nào gây lỗi hay ai đang abuse (xem B14).

**Graceful shutdown — ĐÃ VERIFY THẬT:** `index.js` bắt `SIGINT`/`SIGTERM` → `app.close()` → `server.close()` xong mới `store.close()` → `process.exit(0)`. Test: gửi SIGTERM **thẳng tới PID node** → log in `shutting down…`, process thoát sạch trong <2s, WAL được checkpoint (file DB 4 KB → 48 KB, `-wal`/`-shm` biến mất). Thiếu: không có timeout ép thoát / `closeAllConnections()` — nếu có connection keep-alive treo, `server.close()` có thể chờ vô hạn (trường hợp này **chưa tái hiện được**, B15); handler không chống gọi 2 lần.

---

## 2. Database (`db.js`)

**Schema** (tạo bằng `CREATE TABLE IF NOT EXISTS` khi mở DB, bật `PRAGMA journal_mode=WAL`, `foreign_keys=ON`):
- `profiles(id TEXT PK, name, emoji DEFAULT '🎮', created_at)`
- `scores(id AUTOINCREMENT PK, profile_id FK → profiles ON DELETE CASCADE, score, wave, kills, duration_ms, difficulty, created_at)`
- `events(id, type, profile_hash, difficulty, score, wave, payload JSON, ts, received_at)` — retention cap mặc định 100.000 dòng, trim sau mỗi batch.
- `errors(id, message, source, profile_hash, ts, received_at)` — cap mặc định 500 dòng.

**Index — khớp tốt với query thực tế:** `idx_scores_leaderboard(difficulty, score DESC, created_at ASC)` đúng pattern leaderboard; `idx_scores_profile(profile_id)` cho stats; `idx_events_type_ts(type, ts)` cho metrics 7d; `idx_events_profile_ts(profile_hash, ts)` cho DAU; `idx_errors_ts(ts)`.

**Thiếu:**
- **Không có migration/versioning nào cả** (B7): không `PRAGMA user_version`, không thư mục migrations, không `ALTER TABLE`. `CREATE TABLE IF NOT EXISTS` là no-op với DB đã tồn tại trên volume → lần đầu cần thêm/sửa cột, deploy code mới lên DB cũ sẽ lỗi SQL lúc runtime chứ không lỗi lúc deploy. Đây là rủi ro chắc chắn gặp, chỉ là chưa gặp vì schema chưa từng đổi.
- **Không có CHECK constraint** trong schema (difficulty, các range số) — toàn bộ ràng buộc sống ở tầng app `validate.js`. Hôm nay an toàn vì chỉ có 1 writer là server này; import tay/CLI là ghi được dữ liệu bẩn.
- **Không transaction tường minh, không `busy_timeout`, không `synchronous` setting** (B8): `addEvents`/`addErrors` insert vòng lặp từng dòng + trim, không bọc `BEGIN/COMMIT`. Trong 1 process thì `node:sqlite` là synchronous nên vòng lặp không bị request khác chen ngang (race ghi đè trong nội bộ server thực tế thấp), nhưng crash giữa batch = batch dở dang không rollback; và nếu có tiến trình ngoài (ssh vào chạy sqlite CLI, backup) giữ lock thì write sẽ `SQLITE_BUSY` ngay → `500` vì không đặt `busy_timeout`.
- **Backup/restore: không tồn tại trong repo** (B9) — không script, không lịch, không checkpoint. README trong bộ deploy-fly (ngoài repo) chỉ gợi ý thủ công `fly ssh sftp get /data/windowkill.db`. Nguy hiểm thật: server dùng WAL — lúc đang chạy, file `.db` chính trong test của audit chỉ 4 KB trong khi `-wal` đã 81 KB, tức **copy riêng file `.db` lúc server đang chạy (hoặc sau kill -9) là mất phần dữ liệu mới nhất nằm trong WAL**. Thủ tục đúng phải là `sqlite3 .backup` / `VACUUM INTO` / checkpoint trước khi copy — chưa được ghi ở đâu trong repo này.
- `profiles` và `scores` **không có retention/pagination** (B11): `GET /api/profiles` trả toàn bộ bảng không limit; 2 bảng lõi lớn vô hạn (chỉ `events`/`errors` có cap).

**Race / ghi điểm:** mỗi `addScore` là 1 câu INSERT nguyên tử, không có read-modify-write nên không có race ghi đè cổ điển. Vấn đề của leaderboard không phải race mà là **không có tính xác thực** — xem B2.

---

## 3. API surface

Mọi endpoint đều **không auth** (không token, không session, không header bí mật — kể cả endpoint "internal"). Cột Rate Limit: bucket áp dụng mặc định/phút/IP.

| # | Endpoint | Auth | Validation chính | Rate limit | Ghi chú |
|---|---|---|---|---|---|
| 1 | `GET /api/health` | Không | — | read 120 | Chỉ trả `{status:"up", version, time}` — **không chạm DB** (liveness, không phải readiness, B13). Bị tính vào read bucket (đã verify 429 ở request thứ 121/phút từ 1 IP) |
| 2 | `GET /api/profiles` | Không | — | read 120 | Trả **toàn bộ** profiles gồm cả `id` — lộ danh sách id phục vụ B1. Không pagination |
| 3 | `POST /api/profiles` | Không | name trim 1–24 ký tự (quá dài bị **cắt** chứ không reject), id tuỳ chọn theo `^[A-Za-z0-9_-]{1,64}$`, emoji cắt 4 ký tự | write 30 | Trùng id → 409. Client tự chọn id được |
| 4 | `DELETE /api/profiles/:id` | **Không** | id theo regex | write 30 | Xoá profile + cascade toàn bộ scores. **Verify thật: xoá không cần bất cứ credential nào** → B1 |
| 5 | `POST /api/scores` | Không | profileId tồn tại (404 nếu không), score 0–99.999.999, wave 0–9.999, kills 0–999.999, durationMs 0–24h, difficulty ∈ chill/normal/hard | write 30 | Chỉ kiểm tra *khoảng giá trị*, không kiểm tra tính hợp lệ của ván chơi → B2 |
| 6 | `GET /api/leaderboard?difficulty=&limit=` | Không | difficulty whitelist, limit 1–50 (mặc định 10) | read 120 | Sort `score DESC, created_at ASC` đúng index |
| 7 | `GET /api/stats/:profileId` | Không | id regex; 404 nếu không có profile | read 120 | Aggregate + best per difficulty |
| 8 | `POST /api/events` | Không | batch 1–100, type whitelist 7 loại, `ts` không trước 2025 / không quá +5 phút, `profile_id_hash` phải là sha256 hex 64 ký tự, 1 event xấu = reject cả batch | events 60 (bucket riêng) | Thiết kế privacy tốt: không lưu raw profile id |
| 9 | `POST /api/errors` | Không | batch 1–20, message 1–500, source cắt 200, ts/hash như trên | errors 20 (bucket riêng) | Cap 500 dòng, trim giữ mới nhất (test cover) |
| 10 | `GET /api/metrics` | **Không** | — | read 120 | Tự mô tả là "internal dashboard" nhưng **public 200 cho bất kỳ ai** (verify thật) — chỉ là aggregate, không PII → B10 |

**Health endpoint:** có (`/api/health`) — đủ cho Fly/Vercel probe ở mức liveness, nhưng (a) không kiểm tra DB nên DB hỏng vẫn "up", (b) `fly.toml` hiện tại **không khai báo bất kỳ health check nào** trỏ vào nó, Dockerfile cũng không có `HEALTHCHECK`.

**CORS:** cơ chế đúng — deny-by-default, chỉ origin trong `WK_CORS_ORIGINS` mới nhận `Access-Control-Allow-Origin` (verify: origin lạ không có header, preflight bị 403; origin allowlist → 204 + header đầy đủ). **Nhưng danh sách origin dự kiến cho production chưa khớp thực tế:**
- `https://windowkill.fudever.com` — có trong ENV của Dockerfile deploy-fly. ✅
- itch.io: Dockerfile ghi `https://quangnhat1504.itch.io` — đó là origin của *trang* game, còn game HTML5 thực tế chạy trong **iframe được serve từ `https://html-classic.itch.zone`**, và `Origin` trình duyệt gửi khi fetch chính là origin của iframe. **Verify thật: request với `Origin: https://html-classic.itch.zone` nhận về KHÔNG có header CORS nào** → client trên itch sẽ bị trình duyệt chặn khi gọi backend (B6). (Origin iframe cần được xác nhận lại tại runtime khi deploy thật — nhưng chắc chắn origin trang itch không phải origin của game đang chạy.)
- Mặc định trong `config.js`/systemd unit: `WK_CORS_ORIGINS` trống → nếu deploy quên set ENV thì mọi client cross-origin đều bị chặn lặng lẽ (game vẫn chạy nhờ fallback localStorage nên rất khó phát hiện).

**Lệch contract frontend (LOW):** `js/menu.js` gửi profile lên server với field `avatar`, server chỉ đọc `emoji` → mọi profile đồng bộ lên server đều thành `🎮` (B16).

---

## 4. Findings theo severity

| ID | Severity | Finding | Bằng chứng |
|---|---|---|---|
| B1 | **CRITICAL** | Không auth ở mọi endpoint + `GET /api/profiles` công khai toàn bộ `id` + `DELETE /api/profiles/:id` không cần credential, cascade xoá scores. Id do client tạo còn **đoán được**: `js/menu.js` dùng `"p" + Date.now().toString(36)`. Bất kỳ ai cũng liệt kê → xoá sạch mọi profile/điểm trong vài phút (rate limit 30 write/phút/IP chỉ làm chậm, không ngăn) | Curl thật: `DELETE /api/profiles/audit1` → `200 {deleted}` không kèm bất kỳ header xác thực nào |
| B2 | **CRITICAL** | Leaderboard không có tính xác thực: `POST /api/scores` chỉ validate khoảng số, không chữ ký ván chơi/không phiên/không kiểm tra quan hệ score↔wave↔kills↔duration. Một lệnh curl đặt được kỷ lục tối đa | Curl thật: `score:99999999, wave:9999, kills:999999, durationMs:86400000` → `201`, đứng đầu leaderboard ngay |
| B3 | **HIGH** | Bộ deploy Fly **không có trong repo này**: `git ls-files` không có `Dockerfile`/`fly.toml` nào; chúng chỉ tồn tại ở `~/workspace/windowkill-web/dist/deploy-fly/` (workspace cũ), còn `dist/` trong repo này bị `.gitignore`. Thêm nữa Dockerfile viết `COPY server/package.json`, `COPY server/src` → **build context phải là root repo**, trong khi README deploy-fly hướng dẫn `cd dist/deploy-fly` rồi `fly launch --copy-config` (context ở đó không có thư mục `server/` → `COPY` fail) và câu hướng dẫn copy file bị cụt ("copy … từ thư mục này vào, rồi:"). Làm đúng theo README nhiều khả năng không build được | Đọc trực tiếp 3 file deploy-fly + `git ls-files` + `.gitignore` của wk-deep |
| B4 | **HIGH** | Frontend chưa bao giờ trỏ tới backend: `window.WK_API_BASE` **không được set ở bất kỳ file HTML/JS nào** trong repo. `js/api.js` fallback về same-origin → trên Vercel static, `GET /api/health` 404 → mọi client luôn "offline" dù Fly deploy thành công. Deploy backend xong mà không sửa bước này thì leaderboard online vẫn không hoạt động | `grep WK_API_BASE` toàn repo: chỉ có code *đọc*, không có code *gán* |
| B5 | **HIGH** | Rate limiter lấy key từ `req.socket.remoteAddress`, không dùng `Fly-Client-IP`/proxy header. Sau Fly proxy (và cả NAT trường học — đúng tệp người chơi FPT), nhiều người chơi dùng chung 1 key → chung ngân sách 120 read / 30 write mỗi phút. Riêng `/api/health` cũng bị tính quota (client probe 1 lần/60s/người + Fly check nếu sau này bật) | Curl thật: bắn health liên tục từ 1 IP → request thứ 121 trong phút trả `429` |
| B6 | **HIGH** | CORS thiếu origin iframe thật của itch.io (xem mục 3): allowlist có origin trang itch nhưng game chạy từ `html-classic.itch.zone` | Curl thật với `Origin: https://html-classic.itch.zone` → response không có `Access-Control-Allow-Origin` |
| B7 | **HIGH** | Không schema migration/versioning: đổi schema sau này không áp được lên DB volume hiện hữu, lỗi chỉ lộ lúc runtime sau deploy (xem mục 2) | `db.js` chỉ có `CREATE TABLE IF NOT EXISTS`, không `user_version` |
| B8 | **MEDIUM** | Không transaction cho batch insert, không `PRAGMA busy_timeout`/`synchronous`: crash giữa batch = dữ liệu dở dang; lock ngoài (backup/CLI) gây `SQLITE_BUSY` → 500 ngay lập tức | Đọc `db.js` — chỉ set `journal_mode=WAL`, `foreign_keys=ON` |
| B9 | **MEDIUM** | Không có cơ chế backup/restore trong repo; hướng dẫn duy nhất (ngoài repo) là copy tay file `.db` — mất dữ liệu trong WAL nếu copy lúc chưa checkpoint | Verify thật: khi server chạy, `.db` 4 KB vs `-wal` 81 KB; sau shutdown sạch WAL mới merge thành 48 KB |
| B10 | **MEDIUM** | `GET /api/metrics` (tự nhận là internal dashboard) public không auth: lộ DAU, số game, điểm trung bình 7 ngày cho bất kỳ ai biết URL backend | Curl thật → `200` kèm số liệu, không cần credential |
| B11 | **MEDIUM** | `GET /api/profiles` không pagination/limit và `profiles`/`scores` không retention: payload + bề mặt lộ thông tin (tên + id toàn bộ người chơi) lớn dần theo thời gian | Đọc `db.js`/`server.js` — `listProfiles` không `LIMIT` |
| B12 | **MEDIUM** | Body quá `WK_MAX_BODY`: `readBody` reject rồi `req.destroy()` huỷ socket **trước** khi handler kịp trả `413` → client nhận connection reset/rỗng, không phải JSON 413 như code dự định | Curl thật với body ~70 KB → HTTP code `000`, không body |
| B13 | **MEDIUM** | Health chỉ là liveness: không `SELECT 1` kiểm tra DB; `fly.toml` không khai báo `[checks]`/`http_service.checks`, Dockerfile không `HEALTHCHECK` → Fly không hề probe `/api/health`. `version:"1.0.0"` hardcode trùng lặp ở `config.js` và `package.json` (drift risk) | Đọc `server.js` route health, `fly.toml`, `Dockerfile` |
| B14 | **MEDIUM** | Logging quá nghèo: không request log, lỗi 500 chỉ log `e.message` (mất stack + ngữ cảnh), không timestamp/cấu trúc → gần như không debug/giám sát được trên Fly, không phát hiện được abuse kiểu B1/B2 | Grep `console.*` toàn `server/src`: chỉ 3 chỗ (startup, shutdown, request error) |
| B15 | **LOW** | Graceful shutdown thiếu force-timeout/`closeAllConnections()` và chống signal kép; trường hợp connection treo kéo dài **chưa tái hiện được** | Đọc `index.js`/`server.js:close()`; SIGTERM bình thường đã verify thoát <2s |
| B16 | **LOW** | Lệch field `avatar` (client) vs `emoji` (server): profile sync lên server luôn mang emoji mặc định 🎮 | `js/menu.js:69` vs `server/src/validate.js:validProfileBody` |
| B17 | **LOW** | Tài liệu drift: `server/README.md` ghi test "11 cases" — thực tế 10 test blocks; `docs/DEPLOY-BACKEND.md` (2026-10-01) vẫn kết luận phương án Vercel/Turso và không nhắc Fly.io — quyết định Fly nằm ngoài repo | Đếm test thật (mục 6) + đọc 2 file |
| B18 | **LOW** | `config.js`: helper `num()` âm thầm bỏ giá trị ≤0/không hợp lệ về default (không thể set limit=0 để tắt, gõ sai ENV không ai biết); `dbPath` lấy từ `new URL(...).pathname` (lệch nếu path chứa ký tự %-encode — không ảnh hưởng Fly/Linux) | Đọc `config.js` |
| B19 | **LOW** | `decodeURIComponent` trên `:param` với chuỗi `%` lỗi → văng vào catch chung thành `500` thay vì `400` (**chưa test live**) | Đọc `server.js` đoạn match params — không try/catch riêng |
| B20 | **LOW** | Nhận diện lỗi trùng id bằng `e.message.includes("UNIQUE")` — phụ thuộc chuỗi message nội bộ của SQLite/Node, đổi phiên bản có thể âm thầm thành `500` thay vì `409` | Đọc handler `POST /api/profiles` |

**Điểm mạnh ghi nhận (không phải finding):** prepared statements 100% (không nối chuỗi SQL); validation theo whitelist/range chặt ở mọi endpoint gồm cả analytics (hash phải đúng sha256 hex, `ts` chống quá khứ/tương lai xa); security headers đầy đủ và đúng (đã verify trên response thật: `nosniff`, `X-Frame-Options: DENY`, `CSP default-src 'none'`, CORP/CORP, Permissions-Policy); body cap; rate limit tách 4 bucket để beacon không chết đói gameplay write; FK cascade đúng; index khớp query; envelope JSON nhất quán; backend optional — sập backend game vẫn chạy localStorage.

---

## 5. Deploy-readiness Fly.io

Đối chiếu `dist/deploy-fly/` của workspace cũ (Dockerfile, fly.toml, README) với `server/` hiện tại:

**Đã khớp / làm đúng:**
- `fly.toml`: `primary_region = "sin"`, `internal_port = 3001` khớp `PORT` mặc định của server; `[[mounts]] source="wk_data" destination="/data"` khớp `WK_DB=/data/windowkill.db` trong Dockerfile ENV; VM `shared-cpu-1x` / 256 MB đủ cho backend này; `auto_stop_machines="suspend"` + `min_machines_running=0` hợp free tier.
- Dockerfile: `node:24-slim` (đủ `node:sqlite` — bản local 24.20 chạy không cần flag), `HOST=0.0.0.0` (bắt buộc trên Fly, ghi đè đúng default `127.0.0.1`), `EXPOSE 3001`, CMD trực tiếp `node src/index.js` (signal tới thẳng node — graceful shutdown đã verify trong điều kiện này).
- Không cần secret nào cho chính backend (không token/DB password) — điểm cộng thật.

**Chưa đạt:**
- Toàn bộ B3 (file không trong repo + build context), B4 (frontend chưa trỏ `WK_API_BASE` — README deploy-fly chỉ nói mơ hồ "set biến lúc build/deploy web", không có cơ chế nào trong repo làm việc đó), B5, B6, B13.
- Dockerfile chạy bằng **root** (không `USER node`), không `.dockerignore`, và `RUN npm install --omit=dev 2>/dev/null || true` nuốt mọi lỗi cài đặt (hiện tại vô hại vì zero-dep, nhưng che lỗi thật sau này).
- ENV cấu hình (CORS) **bake cứng trong Dockerfile** thay vì `[env]` trong fly.toml/`fly secrets` → đổi origin phải rebuild image.
- Không có bước smoke-test sau deploy (curl health/leaderboard) trong README deploy.
- **Blocker đã biết (chỉ ghi nhận): user chưa tạo Fly account** (`fly auth signup` + add thẻ verify) — không thuộc phạm vi audit này. Ngoài ra `docs/DEPLOY-BACKEND.md` trong repo vẫn là quyết định cũ (Vercel/Turso) — cần cập nhật để tránh 2 nguồn sự thật.

### Deploy checklist còn thiếu

- [ ] Đưa `Dockerfile` + `fly.toml` **vào repo** `wk-deep` (đặt ở root repo để build context chứa `server/`, hoặc sửa Dockerfile theo context mới) + thêm `.dockerignore`; sửa README deploy-fly cho hết câu cụt, ghi rõ thư mục chạy lệnh
- [ ] User tạo Fly account + `fly launch`/`fly volumes create wk_data --size 1 --region sin` *(blocker đã biết)*
- [ ] Thêm origin iframe itch thật (`https://html-classic.itch.zone` — xác nhận lại tại runtime) vào `WK_CORS_ORIGINS`; cân nhắc chuyển ENV này sang `[env]` trong fly.toml
- [ ] Có cơ chế set `window.WK_API_BASE = https://<app>.fly.dev` cho bản production `windowkill.fudever.com` (và quyết định rõ bản itch có dùng backend không, vì CORS + iframe)
- [ ] Khai báo health check cho Fly trỏ vào `GET /api/health`; cân nhắc cho `/api/health` ra khỏi read rate-limit bucket và/hoặc bổ sung kiểm tra DB (`SELECT 1`) cho readiness
- [ ] Xử lý B1 trước khi public: tối thiểu — bỏ/khoá `DELETE` công khai (yêu cầu token quản trị qua ENV) và dừng lộ toàn bộ id qua `GET /api/profiles` (hoặc chấp nhận rủi ro bằng văn bản vì đây là game CLB)
- [ ] Chấp nhận/xử lý B2 trước khi coi leaderboard là "chính thức": tối thiểu siết quan hệ score/wave/duration hợp lý + rate limit theo profile; bản đầy đủ cần chữ ký ván chơi — ghi thành quyết định sản phẩm
- [ ] Rate limit theo `Fly-Client-IP` khi chạy sau Fly proxy (B5), giữ `remoteAddress` cho direct/VPS
- [ ] Viết thủ tục backup: `sqlite3 .backup`/`VACUUM INTO` định kỳ từ volume `/data` + thử restore 1 lần; ghi vào repo
- [ ] Thiết kế migration tối thiểu (`PRAGMA user_version` + mảng migration chạy lúc boot) **trước** lần đổi schema đầu tiên
- [ ] Bỏ `/api/metrics` sau token quản trị hoặc chấp nhận public bằng văn bản (B10)
- [ ] Sửa đường body-too-large để trả `413` JSON thật (B12); thêm request/error log tối thiểu có method/path/status + stack ở server log (B14)
- [ ] Cập nhật `docs/DEPLOY-BACKEND.md` theo quyết định Fly.io; sửa số test trong `server/README.md`
- [ ] Sau deploy: smoke test từ ngoài — health, tạo profile, nộp điểm, leaderboard, CORS từ cả 2 origin production, xoá profile test

---

## 6. Scale — chịu được bao nhiêu, nút thắt, lộ trình

**Số đo thật (sandbox, chỉ để tham chiếu tương đối — không phải phần cứng Fly 256 MB):** `GET /api/health` (không chạm DB) ≈ **914 req/s** tuần tự, ≈ **1.239 req/s** với 20 kết nối đồng thời (số bị giới hạn bởi client Python nhiều hơn server). Các query nghiệp vụ đều là prepared statement có index, thời gian ở mức sub-ms đến vài ms trên DB nhỏ. Kết luận định tính: **CPU/DB không phải nút thắt ở quy mô CLB hiện tại** — 1 ván game 5–15 phút mới sinh 1 lần nộp điểm; 1.000 người chơi/ngày cũng chỉ là vài write/phút trung bình, thấp hơn năng lực SQLite single-writer (hàng trăm–nghìn write/s với transaction ngắn) rất xa.

**Nút thắt theo thứ tự sẽ chạm tới trước:**
1. **Rate limit theo IP dùng chung** (B5): 30 write/phút và 120 read/phút *cho cả một NAT trường học/proxy* — chạm trước mọi giới hạn phần cứng khác nếu nhiều người chơi cùng mạng.
2. **`auto_stop suspend` + `min_machines_running=0`**: máy ngủ → request đầu tiên chịu cold start (resume + Node boot + mở DB); người chơi cảm nhận backend "chập chờn", client `healthy()` timeout 1,5s có thể kết luận offline oan. Đây là đánh đổi free-tier có chủ đích, cần biết trước.
3. **Một instance duy nhất + SQLite trên 1 volume**: không scale ngang được (volume gắn 1 machine, SQLite file lock); Fly region `sin` duy nhất — người chơi xa region chịu latency.
4. **`GET /api/profiles` không limit** và các aggregate `metrics()` quét bảng `events` (tối đa 100k dòng, có index hỗ trợ một phần): payload/chi phí tăng tuyến tính theo dữ liệu, cộng với `node:sqlite` **đồng bộ — chặn event loop** trong lúc query chạy, nên 1 query nặng làm đứng mọi request khác trong khoảnh khắc đó.
5. Trần ghi SQLite single-writer khi có nhiều writer đồng thời thật sự (chưa phải vấn đề cho đến khi write/phút ở mức hàng nghìn).

**Lộ trình khi traffic tăng (theo bậc):**
- **Bậc 0 — tối ưu tại chỗ (đủ cho hiện tại → vài nghìn DAU):** sửa rate-limit key theo `Fly-Client-IP`; pagination cho `/api/profiles`; cân nhắc `min_machines_running=1` khi có ngân sách; backup + migration như checklist; giữ 1 instance.
- **Bậc 1 — tách tải đọc:** cache leaderboard trong RAM theo TTL ngắn (leaderboard đổi chậm, query lặp lại nhiều nhất); chuyển `metrics` sang chạy định kỳ/materialize; vẫn 1 writer SQLite.
- **Bậc 2 — đổi DB:** khi cần nhiều instance/nhiều region hoặc write đồng thời cao → chuyển sang Postgres (Neon/Supabase/Fly Postgres) hoặc Turso/libSQL (gần SQLite nhất). Lớp `openDb()` đã gom toàn bộ SQL vào một file + prepared statements đặt tên rõ ràng nên việc port là viết lại adapter `db.js`, không đụng route/validate/client — đánh giá này đồng ý với ghi chú trong `docs/DEPLOY-BACKEND.md`. Đồng thời đây là lúc bắt buộc có migration framework thật.

---

## 7. Kết quả chạy test & chạy thật

### 7.1 Test suite
- Lệnh theo `package.json` — `cd server && npm test` (`node --test tests/api.test.js`): **10 pass / 0 fail**, ~540 ms, Node v24.20.0. Cả 10 test blocks pass: health+headers, profiles CRUD+validation, scores+leaderboard+stats, delete cascade, 404 JSON, rate limit write, events validation+ingest, metrics aggregate, errors cap 500, rate limit bucket riêng cho analytics.
- Lưu ý: lệnh `node --test tests/` (dạng thư mục) **fail** trên Node này (`Cannot find module .../server/tests` — Node coi `tests/` là entry point) → phải dùng `npm test` hoặc đường dẫn file đầy đủ. README server ghi "11 cases" — thực tế là **10** test blocks (B17).

### 7.2 Chạy server thật + curl (127.0.0.1:3101, DB tạm, `WK_CORS_ORIGINS=https://windowkill.fudever.com,https://quangnhat1504.itch.io`)

| Thử nghiệm | Kết quả thật |
|---|---|
| `GET /api/health` | `200 {status:"up", version:"1.0.0", time}` + đủ security headers + `X-RateLimit-*` |
| `POST /api/profiles` hợp lệ / trùng id / JSON hỏng / name rỗng | `201` / `409 profile id already exists` / `400 invalid JSON body` / (trong test suite) `400` |
| `POST /api/scores` hợp lệ | `201 {id:1}` |
| `POST /api/scores` **gian lận tối đa** (score 99.999.999, wave 9.999, kills 999.999, duration 24h) | **`201` và đứng đầu leaderboard** → B2 |
| `GET /api/leaderboard` đúng / sai difficulty | `200` sort giảm dần đúng / `400` kèm message rõ ràng |
| `GET /api/stats/:id` | `200` aggregate đúng với dữ liệu đã nộp (kể cả điểm gian lận) |
| `GET /api/metrics` không credential | **`200` công khai** → B10 |
| `GET /api/nope`, `GET /` | `404 {ok:false, error:"not found"}` |
| CORS: Origin `windowkill.fudever.com` / trang itch / `html-classic.itch.zone` / origin lạ | Có header / Có header / **Không có header** → B6 / Không có header (đúng thiết kế) |
| Preflight OPTIONS origin allowlist / origin lạ | `204` / `403` |
| Body ~70 KB > cap 64 KB | **HTTP `000`, connection bị huỷ, không nhận được JSON 413** → B12 |
| `DELETE /api/profiles/:id` không credential | **`200 {deleted}`**, scores bị cascade sạch → B1 |
| Bắn `GET /api/health` liên tục từ 1 IP (giới hạn mặc định) | Request thứ **121** trong phút → `429 rate limit exceeded` → B5 |
| Throughput (nới rate limit qua ENV) | health ≈ 914 req/s tuần tự, ≈ 1.239 req/s @ 20 concurrent (client-bound, sandbox) |
| SIGTERM gửi thẳng PID node | Log `shutting down…`, thoát <2s, **WAL checkpoint sạch** (DB 4 KB → 48 KB, hết `-wal`/`-shm`) |
| WAL khi đang chạy | `.db` 4 KB trong khi `-wal` 81 KB → copy file lúc này là mất dữ liệu mới → B9 |

### 7.3 Không kiểm chứng được (nói thật)
- **Deploy Fly thật**: không chạy `fly deploy` (ngoài phạm vi + blocker user chưa có Fly account) — mọi nhận định Fly là đối chiếu file cấu hình, chưa phải trải nghiệm runtime; hành vi proxy của Fly đối với `remoteAddress`/`Fly-Client-IP` cần verify lại ngay sau lần deploy đầu.
- **Origin iframe itch tại runtime**: kết luận B6 dựa trên mô hình nhúng HTML5 của itch.io + hành vi server đã verify với header Origin đó; chưa mở trang itch live trong audit này để bắt Origin thực tế.
- **Hiệu năng trên VM Fly 256 MB**: số đo ở mục 6 là của sandbox, không suy trực tiếp sang Fly được.
- **Shutdown khi có connection keep-alive treo** (B15), **`SQLITE_BUSY` khi bị lock ngoài** (B8), và **lỗi `decodeURIComponent`** (B19): suy luận từ code, chưa tái hiện live.
- Tương thích `node:sqlite` trên đúng image `node:24-slim` của Dockerfile: chưa build image trong audit này (chỉ chạy trên Node 24.20 local cùng major version).
