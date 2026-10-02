# Security Audit — WINDOWKILL (Deep Audit 2026-10)

- **Vai trò:** Security Engineer, FU-DEVER Game Studio
- **Ngày audit:** 2026-10-02
- **Đối tượng:** WINDOWKILL Web Edition — frontend tĩnh (`index.html`, `game.html`, `satellite.html`, `js/*.js`, `sw.js`, `vercel.json`), backend tùy chọn (`server/src/*.js`, Node zero-dep + `node:sqlite`), adapter Vercel (`api/leaderboard.js`), Electron shell (`electron/main.js`), repo & git history.
- **Baseline code:** branch `dev/deep-audit-upgrades-2026-10`, HEAD `3b25694` (merge PR #29 — bản production hiện tại).
- **Phương pháp:** đọc code tĩnh (static review) toàn bộ phạm vi trên + grep có hệ thống (XSS sinks, `localStorage`, request ra ngoài, pattern secret) + quét git history 190 commit có trong clone. **Không** chạy pentest động, không sửa code (xem mục "Chưa kiểm chứng được" ở cuối).
- **Quan hệ với audit cũ:** `SECURITY.md` (2026-10-01, findings S1–S8) đã được đối chiếu lại trên code hiện tại — cả 8 finding cũ vẫn giữ trạng thái đã fix/đạt, không hồi quy (chi tiết ở mục "Đã kiểm tra và đạt"). Báo cáo này tập trung vào bề mặt **mới**: backend/API, v2.0 (campaign/meta/i18n), headers ở tầng hosting, và các sink còn sót.

## Bảng tổng kết

| Severity | Số lượng | Ghi chú |
|----------|----------|---------|
| CRITICAL | 0 | Không có lỗ hổng nào cho phép chiếm quyền/chiếm dữ liệu người khác ngay trên bản production tĩnh hiện tại. |
| HIGH | 1 | SEC-01 — backend không có auth (chỉ kích hoạt khi backend được phơi ra ngoài localhost, đúng kế hoạch deploy Fly.io). |
| MEDIUM | 3 | SEC-02 … SEC-04 |
| LOW | 7 | SEC-05 … SEC-11 |
| INFO | 3 | SEC-12 … SEC-14 |
| **Tổng** | **14** | |

**Nhận định tổng thể (không phóng đại):** WINDOWKILL là game offline-first, không tài khoản mật khẩu, không thanh toán, không PII thật — nên phần lớn bề mặt tấn công cổ điển (chiếm tài khoản, rò dữ liệu nhạy cảm) **không tồn tại**. Rủi ro thật tập trung ở 2 nơi: (1) backend leaderboard khi deploy public mà vẫn không có auth, và (2) lớp phòng thủ ở tầng hosting (HTTP headers) chưa được dựng, trong khi lớp CSP trong HTML đã làm khá tốt. XSS — rủi ro lớn nhất của một web game render dữ liệu người dùng — hiện được xử lý đúng ở hầu hết các luồng chính (xem mục "Đã kiểm tra và đạt").

---

## Findings

### SEC-01 [HIGH] Backend không có bất kỳ auth/session nào — bất kỳ ai cũng xóa được profile và giả mạo được leaderboard

**Bằng chứng:**

- Toàn bộ route trong `server/src/server.js` không kiểm tra credential nào: `GET /api/profiles` (dòng 61, liệt kê mọi profile), `POST /api/profiles` (65), `DELETE /api/profiles/:id` (83 — xóa profile kèm cascade toàn bộ scores nhờ `ON DELETE CASCADE` trong `server/src/db.js`), `POST /api/scores` (90), `GET /api/metrics` (144). Trong `server/src/` không tồn tại khái niệm token/session/owner (grep `auth|token|session` chỉ ra các biến env của tài liệu deploy, không có code kiểm tra).
- ID profile phía client **dễ đoán**: `js/menu.js:116` — `id: "p" + Date.now().toString(36)` (timestamp mã hóa cơ số 36). Kẻ tấn công không cần dò ngẫu nhiên: liệt kê qua `GET /api/profiles` là có đủ ID thật, và ID tự sinh cũng đoán được theo thời gian tạo.
- Điều kiện duy nhất để submit score là profile tồn tại (`server/src/server.js:90-103`: `validScoreBody` đạt + `store.getProfile(v.profileId)`), tức là "biết ID" = "được quyền ghi điểm dưới tên người đó".

**Tác động thực tế:** Hiện tại giảm nhẹ bởi `server/src/config.js` — `host` mặc định `127.0.0.1`, và backend **chưa deploy public** (đang chờ bước Fly.io signup của user; `api/leaderboard.js` trên Vercel vẫn trả 503). Nhưng theo đúng kế hoạch đã chốt (Fly.io + volume SQLite), ngay khi backend lên public mà giữ nguyên code này, bất kỳ ai trên internet cũng: xóa sạch mọi profile/leaderboard bằng vài request `DELETE`, và chiếm top bảng xếp hạng bằng điểm giả. Đây là finding **phải xử lý trước khi deploy backend**, không phải lỗi đang cháy trên production tĩnh.

**Cách fix cụ thể:**

1. Trước khi deploy public: phát hành **profile token** khi tạo profile — server sinh token ngẫu nhiên (`randomBytes(32)`, như cách `server/src/db.js` đã sinh ID `srv_` bằng `randomBytes(8)`), chỉ lưu **hash** của token trong DB, trả token 1 lần cho client lưu `localStorage`. `DELETE /api/profiles/:id` và `POST /api/scores` bắt buộc header `Authorization: Bearer <token>` khớp với profile.
2. Client cũ không có token → chế độ read-only (xem leaderboard được, không ghi/xóa) để không vỡ fallback offline.
3. Nếu chưa kịp làm (1): tối thiểu **tắt route DELETE ở bản public** (chỉ bật khi env `WK_ALLOW_DELETE=1`) và đặt backend sau reverse proxy có basic-auth cho các route ghi. Không deploy nguyên trạng.

---

### SEC-02 [MEDIUM] Production tĩnh không có HTTP security headers; `frame-ancestors` trong meta CSP bị trình duyệt bỏ qua

**Bằng chứng:**

- `vercel.json:1` (toàn file) chỉ khai báo 2 header: `Content-Type` cho `/manifest.webmanifest` và `Cache-Control: no-cache` cho `/sw.js`. Không có `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`/CSP ở tầng HTTP cho site tĩnh.
- CSP hiện chỉ nằm trong meta: `index.html:6` và `game.html:6` — `... frame-ancestors 'self'`. Theo đặc tả CSP, các directive `frame-ancestors`, `report-uri`, `sandbox` **bị bỏ qua khi khai báo qua `<meta>`** — tức là lớp chống clickjacking mà code tưởng là có thực ra không hiệu lực. Hai trang còn lại không có CSP nào: `satellite.html` (không meta CSP, lại chứa script inline ở `satellite.html:33`) và `offline.html`.

**Tác động thực tế:** Bất kỳ site nào cũng nhúng được game vào iframe (clickjacking/UI-redressing). Với một game không có hành động nhạy cảm (không mua bán, không nút "xóa dữ liệu" trong game page) thì tác động trần là lừa người chơi click trong ngữ cảnh bị che phủ — mức trung bình/thấp, **không** phải chiếm dữ liệu. Cần lưu ý chiều ngược lại: game **cố ý** được nhúng trên portal (itch.io chạy trong iframe — xem `js/portal.js`), nên fix không thể là `DENY`/`'self'` thuần túy, nếu không sẽ phá kênh phân phối chính.

**Cách fix cụ thể:**

1. Thêm block `headers` trong `vercel.json` cho `/(.*)`: `Strict-Transport-Security: max-age=31536000; includeSubDomains`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, và CSP dạng header (giữ nguyên policy hiện tại của meta) với `frame-ancestors 'self' https://*.itch.io https://itch.io` (bổ sung domain portal khi thêm kênh mới). Giữ meta CSP làm lớp dự phòng cho bản Electron/file và bản portal zip.
2. Bỏ `frame-ancestors` khỏi meta (giữ cũng vô hại nhưng gây hiểu lầm là đã được bảo vệ) hoặc thêm comment ghi rõ directive này chỉ hiệu lực ở header.
3. `satellite.html`/`offline.html`: thêm cùng bộ header ở `vercel.json` theo source riêng (`/satellite.html`, `/offline.html`) thay vì meta (vì satellite cần inline script — xem SEC-06).

---

### SEC-03 [MEDIUM] Backend "CORS strict" nhưng không thực thi trên request thật — POST xuyên site kiểu simple-request vẫn ghi được dữ liệu

**Bằng chứng:**

- `server/src/security.js:21-32` (`applyCors`): origin không nằm trong allowlist thì chỉ **không gắn** header `Access-Control-Allow-Origin` — trình duyệt bị chặn *đọc response*, nhưng server không từ chối request.
- `server/src/server.js:165-188`: biến `corsOk` chỉ được dùng để quyết định `OPTIONS` trả 204 hay 403. Mọi `GET/POST/DELETE` thật đều chạy handler bất kể Origin. Đồng thời handler POST (`server/src/server.js:65-103`) đọc `req.rawBody` rồi `JSON.parse` **không kiểm tra `Content-Type`** — một `fetch(..., {mode:"no-cors", headers:{"Content-Type":"text/plain"}, body: JSON.stringify(...)})` từ site khác là "simple request" (không preflight) và vẫn được parse như JSON thường.

**Tác động thực tế:** Một trang web độc hại mà người chơi đang mở (kể cả khi backend chỉ chạy local `127.0.0.1:3001` trên máy người chơi) có thể âm thầm `POST /api/profiles` / `POST /api/scores` ghi dữ liệu rác/điểm giả vào backend của nạn nhân. `DELETE` **không** đi qua được đường này (method DELETE luôn kích preflight và bị chặn ở `OPTIONS` 403 khi origin lạ) — điểm này giới hạn thiệt hại. Đọc dữ liệu xuyên origin cũng bị chặn đúng nhờ thiếu `Access-Control-Allow-Origin`. Vì vậy đây là lỗ hổng *ghi* (integrity), không phải *đọc* (confidentiality) — MEDIUM là mức đúng.

**Cách fix cụ thể:**

1. Trong `server/src/server.js`, trước khi dispatch route: nếu request có header `Origin` và origin không thuộc `cfg.corsOrigins` và không phải same-origin (so với `Host`) → trả `403` cho mọi method ghi (POST/PUT/PATCH/DELETE). Request không có `Origin` (curl, server-to-server) xử lý theo SEC-01 (token).
2. Bắt buộc `Content-Type: application/json` cho các route POST (sai → `415`). Hai lớp này cùng nhau đóng hẳn đường simple-request.

---

### SEC-04 [MEDIUM] Leaderboard tin điểm client gửi lên "đúng định dạng" — tổ hợp điểm bất khả thi vẫn được chấp nhận

**Bằng chứng:** `server/src/validate.js:29-44` (`validScoreBody`) kiểm tra từng trường **độc lập**: `score` 0…99 999 999, `wave` 0…9 999, `kills` 0…999 999, `durationMs` 0…86 400 000, `difficulty` thuộc allowlist. Không có kiểm tra tương quan: một bản ghi `score=99_999_999, wave=0, kills=0, durationMs=0` vượt qua toàn bộ validation và lên thẳng top leaderboard (`server/src/db.js`, query `leaderboard` sắp xếp `score DESC`). Adapter Vercel `api/leaderboard.js` (`handlePost`) cũng chỉ kiểm tra biên từng trường tương tự.

**Tác động thực tế:** Đây là mặt còn lại của SEC-01 nhưng fix khác nhau: kể cả khi đã có profile token, chính chủ (hoặc script) vẫn bơm điểm tối đa không cần chơi. Với leaderboard casual của game miễn phí, cheat điểm là rủi ro **chấp nhận được ở mức độ nào đó** — nhưng hiện tại chi phí gian lận là 1 request curl, không cần đụng vào game.

**Cách fix cụ thể (đúng mức, không over-engineer):**

1. Thêm kiểm tra hợp lý tối thiểu trong `validScoreBody`/server: `durationMs >= wave * 5000` (mỗi wave không thể dưới ~5s), `score <= (kills * 200 + wave * 5000 + 10000)` — hiệu chỉnh theo số liệu điểm thật trong `js/game.js` (điểm cố định, không nhân hệ số). Loại ngay nhóm "max điểm, 0 giây".
2. Rate limit riêng cho `POST /api/scores` theo profile (vd 10/phút) cộng vào bucket write hiện có.
3. Ghi rõ trong `docs/DEPLOY-BACKEND.md`: leaderboard là casual, không dùng cho giải thưởng; nếu sau này có thi đấu thì mới cần server-issued run token (server cấp seed khi bắt đầu run, điểm submit phải kèm token + thời lượng khớp) — không làm ngay.

---

### SEC-05 [LOW] Một sink `innerHTML` chưa escape: `avatar` của profile lấy từ localStorage (`js/menu.js:86`)

**Bằng chứng:**

```js
// js/menu.js:31
const avatarOf = (p, i) => p.avatar || AVATARS[i % AVATARS.length];
// js/menu.js:86
chip.innerHTML = `<svg class="av" aria-hidden="true"><use href="#${avatarOf(p, i)}"/></svg><span></span>`;
```

`p.avatar` đọc từ `localStorage["wk_profiles"]` qua `store.get` mà không qua allowlist/escape — giá trị chứa `"/>` + markup sẽ thoát khỏi thuộc tính `href` và thành HTML thật khi render danh sách profile.

**Tác động thực tế (nói đúng mức):** Hiện tại **không có** đường nào để người khác đưa giá trị lạ vào trường này: UI chỉ gán avatar từ mảng hằng `AVATARS` (8 id cố định, `js/menu.js:30,116`), backend không trả avatar về cho luồng render này. Khai thác được đòi hỏi nạn nhân tự sửa localStorage của chính mình (self-XSS) — không có giá trị tấn công thật hôm nay. Đây là finding *phòng thủ chiều sâu*: chỉ cần sau này có tính năng import profile/đồng bộ avatar từ backend là nó biến thành XSS lưu trữ (stored XSS) ngay.

**Cách fix:** tại `renderProfiles`, ép `avatarOf` trả về phần tử của `AVATARS` (`AVATARS.includes(p.avatar) ? p.avatar : AVATARS[i % AVATARS.length]`). Một dòng, đóng hẳn sink thay vì escape từng chỗ.

### SEC-06 [LOW] `satellite.html` không có CSP và dùng script inline — bề mặt hardening trống

**Bằng chứng:** `satellite.html:33` là một khối `<script>` inline lớn (toàn bộ logic vệ tinh), và file không có meta CSP (đối chiếu `index.html:6`/`game.html:6`). Nếu gắn CSP `script-src 'self'` như hai trang chính, trang này vỡ ngay — đó là lý do nó bị bỏ trống.

**Đánh giá dữ liệu vào hiện tại — đã an toàn:** các tham số query được xử lý đúng mẫu: `satellite.html:47` — `color` kiểm bằng regex `/^#[0-9a-fA-F]{6}$/` sai thì rơi về mặc định; `satellite.html:48-51` — `label` cắt 24 ký tự và gán bằng `textContent` (kể cả vào `document.title`); `hp` qua `parseInt`; message `sat-dmg/sat-steer/sat-tick` đều ép số (`parseInt`/`parseFloat` + clamp ±400) trước khi dùng. Tức là hôm nay **không có XSS qua satellite**, finding này thuần túy là thiếu lớp CSP dự phòng + tiền lệ xấu cho người sửa sau.

**Cách fix:** tách script inline ra `js/satellite.js`, thêm meta CSP giống `game.html`; hoặc tối thiểu bổ sung header CSP cho `/satellite.html` trong `vercel.json` (kèm SEC-02) với `script-src 'self' 'unsafe-inline'` ghi rõ lý do — cách đầu sạch hơn.

### SEC-07 [LOW] BroadcastChannel `windowkill_bus` không xác thực người gửi — mọi tài liệu cùng origin đều giả danh được game

**Bằng chứng:** Ba nơi cùng nghe kênh này và tin message theo `type`: `js/menu.js:230` (`gameover` → ghi high score/stats + đồng bộ backend), `js/game.js:385` (`sat-*` → sát thương/đóng vệ tinh), `js/analytics.js:190` (`gameover/wave/upgrade_*` → ghi analytics). BroadcastChannel theo thiết kế không có origin check ngoài "cùng origin" và không có chữ ký.

**Tác động thực tế:** Bất kỳ tab/trang nào **cùng origin** (một bản game thứ hai, trang tĩnh khác trên cùng domain, hoặc mã chạy được trên domain trong tương lai) đều gửi được `gameover` giả. Nhờ fix S1 của audit cũ, số liệu đã bị ép kiểu (`num()`/`int0()` tại `js/menu.js:37-40` và trong handler) nên hậu quả trần hiện nay là: bơm số liệu giả vào **chính máy của người đang mở trang đó** và/hoặc gửi 1 score giả lên backend qua luồng đồng bộ hợp lệ. Không leo thang thành XSS, không chạm được máy người khác. Rủi ro tăng lên nếu domain chính sau này host thêm nội dung do bên thứ ba đóng góp.

**Cách fix:** Chấp nhận ở hiện tại (đúng với mô hình offline). Nếu muốn bịt: launcher sinh `sessionNonce` ngẫu nhiên mỗi lần mở game, truyền qua query `game.html?nonce=...`, game đính nonce vào mọi message `gameover`; menu bỏ qua message sai nonce. Chi phí thấp, làm khi kênh này bắt đầu mang dữ liệu "có giá" hơn (vd đổi thưởng).

### SEC-08 [LOW] Rate limiter khóa theo IP socket — sau reverse proxy mọi người dùng chung một xô; `/api/metrics` mở công khai

**Bằng chứng:** `server/src/server.js:182-188` — `const ip = req.socket.remoteAddress` rồi `limiter.checkKind(ip, rlKind)`. Code không đọc `X-Forwarded-For` (đúng ở khía cạnh chống giả mạo header), nhưng khi backend chạy sau proxy của Fly.io/Vercel/nginx, `remoteAddress` là IP của proxy → **toàn bộ người chơi chia chung** hạn mức 120 read / 30 write mỗi phút (`server/src/config.js`): một người spam là tất cả bị 429. Ngược lại nếu sau này ai "fix" bằng cách tin `X-Forwarded-For` vô điều kiện thì rate limit bị bypass hoàn toàn bằng header giả. Ngoài ra `GET /api/metrics` (`server/src/server.js:144`) không giới hạn đối tượng: chỉ là số liệu tổng hợp không PII (đã kiểm — `store.metrics()` trong `server/src/db.js` chỉ trả count/average), nên mức độ là INFO-leaning, gộp ở đây vì cùng vùng "phơi bày khi deploy".

**Cách fix:** khi deploy, đặt env cho chế độ proxy tin cậy: chỉ khi `WK_TRUST_PROXY=1` mới lấy IP từ `X-Forwarded-For` (và tài liệu deploy phải ghi proxy nào được phép ghi header này). Cân nhắc chuyển `/api/metrics` ra sau cùng cơ chế token của SEC-01 hoặc tắt bằng env trên bản public.

### SEC-09 [LOW] `deepMerge` trong `js/campaign.js` không chặn khóa `__proto__` khi merge JSON cấu hình tải từ mạng

**Bằng chứng:** `js/campaign.js:81-92` — `deepMerge(dst, src)` duyệt `Object.keys(src)`; với khóa `__proto__`, `dst[k]` là `Object.prototype` (một object) nên hàm đệ quy xuống và gán thuộc tính **lên `Object.prototype`** thay vì object đích. Nguồn dữ liệu là `difficulty.config.json` được `fetch` cùng origin tại `js/campaign.js:112-116`.

**Tác động thực tế:** Điều kiện khai thác là kiểm soát được nội dung `difficulty.config.json` trên origin của game — tức là đã xâm nhập được tầng deploy, lúc đó prototype pollution chỉ là thiệt hại cộng thêm (có thể phá logic game/phòng thủ kiểu kiểm tra thuộc tính ở các phiên bản sau). Không có đường nào cho người chơi/người ngoài đưa JSON này vào. LOW là mức đúng; ghi lại để sửa rẻ một lần.

**Cách fix:** trong vòng lặp của `deepMerge`, bỏ qua các khóa `__proto__`, `constructor`, `prototype`.

### SEC-10 [LOW] `wk_api_base` trong localStorage cho phép trỏ toàn bộ traffic API/analytics tới origin tùy ý

**Bằng chứng:** `js/api.js:14-22` và bản sao tại `js/analytics.js:126-131`: thứ tự phân giải base URL ưu tiên `window.WK_API_BASE`, sau đó `localStorage["wk_api_base"]` — giá trị này được dùng nguyên vẹn làm tiền tố cho mọi `fetch`/`sendBeacon` (profiles, scores, events, errors).

**Tác động thực tế:** Ai ghi được khóa này (script cùng origin, tiện ích mở rộng, hoặc lừa người dùng dán lệnh vào console — mẫu tấn công self-XSS kinh điển) thì dữ liệu gameplay sau đó (tên profile, điểm, hash profile) chảy về server của họ. CSP meta hiện tại (`connect-src 'self'` ở `index.html:6`/`game.html:6`) **chặn phần lớn** đường này trên bản web production — đây là lý do finding chỉ ở LOW — nhưng lớp chặn đó không tồn tại đồng nhất ở mọi bối cảnh chạy (file://, Electron, portal zip) và dễ bị nới lỏng vô ý khi cấu hình backend khác origin (xem thêm ghi chú ở mục "Đã kiểm tra và đạt" về CSP).

**Cách fix:** giữ tính năng override cho dev nhưng chỉ chấp nhận giá trị khớp mẫu an toàn: cùng origin, `http://localhost:*`, `http://127.0.0.1:*`, hoặc domain backend chính thức khai báo cứng trong code. Ngoài mẫu → bỏ qua và rơi về `""`.

### SEC-11 [LOW] `.gitignore` chưa có `.env` — phòng ngừa commit nhầm secret chỉ đang dựa vào thói quen

**Bằng chứng:** `.gitignore` hiện tại gồm `node_modules/`, `server/data/`, `server/*.db*`, `*.log`, `.DS_Store`, `electron/dist/`, `electron/app/`, `*.part-*`, `dist/` — **không** có `.env`, `.env.*`, `*.pem`, `*.key`. Trong khi repo đã có tiền lệ dùng secret thật ở workflow phân phối (`scripts/itchio-push.sh` đọc key từ `~/.config/windowkill/itchio.env` **ngoài repo** — cách làm đúng; `scripts/deploy-vercel.sh` đọc `VERCEL_TOKEN` từ env và có scrub log). Chỉ cần một lần ai đó đặt file `.env` trong thư mục repo để tiện tay là không còn rào chắn nào ngăn commit.

**Cách fix:** thêm vào `.gitignore`: `.env`, `.env.*` (trừ `!.env.example`), `*.pem`, `*.key`, và bổ sung secret-scan (gitleaks) vào `.github/workflows/ci.yml` như quy tắc tại `rules/wk-security-rules.md` đã yêu cầu ("CI chạy secret scan") nhưng workflow hiện tại mới có `npm audit`, chưa có bước quét secret (đã kiểm `.github/workflows/ci.yml`).

---

### SEC-12 [INFO] Dữ liệu tiến trình trong localStorage bị sửa tay là được — chấp nhận được, và code đã "kẹp" đúng mức cần thiết

**Phạm vi đã kiểm:** Toàn bộ khóa lưu trữ (không khóa nào chứa mật khẩu/token/PII):

| Khóa | Nội dung |
|------|----------|
| `wk_profiles`, `wk_active_profile` | Tên hiển thị tự đặt + id + avatar id (dữ liệu cục bộ) |
| `wk_high_{chill,normal,hard}[_profileId]`, `wk_stats[_profileId]` | Kỷ lục & thống kê local |
| `wk_settings`, `wk_sat_pref`, `wk_score_tip_seen`, `wk_lang`, `wk_analytics` | Tùy chọn hiển thị/âm thanh/ngôn ngữ |
| `wk_meta_shards`, `wk_meta_shards_total`, `wk_meta_workshop`, `wk_meta_skins`, `wk_meta_skin_active`, `wk_meta_achv`, `wk_meta_stats`, `wk_meta_daily`, `wk_meta_unlock_hn` | Mảnh Kính, Xưởng, skin, thành tựu, daily (meta v2.0) |
| `wk_unlocked_stage_<pid>`, `wk_stage_best_<pid>`, `wk_unlocked_endless_<pid>`, `wk_tut_v1_<pid>` | Tiến trình campaign/tutorial |
| `wk_api_base` | Override endpoint backend (xem SEC-10) |

**Đánh giá:** Người dùng mở DevTools sửa `wk_meta_shards` thành 999 999 hay mở khóa mọi ải là **gian lận trên máy của chính họ** trong một game single-player offline — không cần anti-tamper (checksum/HMAC) ở tầng này, thêm vào chỉ gây phiền cho người chơi thật. Điều quan trọng là code **không tin mù quáng đến mức vỡ/crash hoặc leo thang**: `js/meta.js:44` có `int0()` (ép số nguyên ≥ 0) cho shards/stats và Workshop bị kẹp `Math.min(v, d.max)` khi đọc; `js/campaign.js:449-457` kẹp stage đã mở trong [1,5]; `js/menu.js:37-40` ép số cho score/stats; các `JSON.parse` đều có try/catch + kiểm tra kiểu (`Array.isArray`, `typeof object`) sau audit 2026-10-02. Điểm **duy nhất** mà dữ liệu sửa tay rời khỏi máy là khi submit lên leaderboard online — phần đó thuộc SEC-01/SEC-04, không thuộc tầng này.

### SEC-13 [INFO] Adapter `api/leaderboard.js` (Vercel) chưa sống — đừng để nó "sống dậy" mà thiếu các lớp bảo vệ của `server/`

File này hiện là scaffold: chưa cấu hình env thì mọi request trả `503` (`api/leaderboard.js`, hàm `configured()` + handler), driver DB chưa cắm (`query()` luôn throw). Điểm tốt: credential chỉ đọc từ env (`WK_LEADERBOARD_DRIVER/URL/TOKEN`), không hardcode; câu query mẫu dùng placeholder `?`; validation POST/GET có biên tương đương `validate.js`. Điểm cần nhớ khi kích hoạt: file này **không có** rate limit, không có CORS header, không có auth — tức là toàn bộ SEC-01/SEC-03/SEC-04 áp dụng nguyên vẹn, cộng thêm phụ thuộc vào giới hạn của nền tảng Vercel. Khuyến nghị: chỉ kích hoạt sau khi đã quyết định mô hình token ở SEC-01, hoặc giữ `server/` làm backend duy nhất và xóa adapter để tránh bề mặt mồ côi.

### SEC-14 [INFO] Hash profile trong analytics là SHA-256 của ID có entropy thấp — đủ cho mục đích hiện tại, đừng coi là ẩn danh mạnh

`js/analytics.js` (`setProfile`) gửi `sha256("wk:" + profileId)` thay vì ID thô — đúng hướng privacy. Nhưng `profileId` phía client có dạng `"p" + Date.now().toString(36)` (`js/menu.js:116`), không gian giá trị theo thời gian tạo khá hẹp: ai có hash và biết khoảng thời gian nạn nhân tạo profile có thể brute-force ngược ra ID. Vì dữ liệu gắn với hash chỉ là thống kê chơi game trên backend của chính studio, rủi ro thực tế không đáng kể — ghi INFO để sau này không ai trích dẫn cơ chế này như "ẩn danh hóa" trong ngữ cảnh nhạy cảm hơn. (ID do server sinh dùng `randomBytes(8)` tại `server/src/db.js` thì không có vấn đề này.)

---

## Kiểm kê request ra ngoài (external requests)

Kết quả grep toàn bộ `fetch(`, `XMLHttpRequest`, `WebSocket`, `sendBeacon`, `new Audio()`, `src=` trên `js/*.js` + 3 trang HTML:

- **Domain ngoài duy nhất được nhắc tới trong code chạy:** không có. Mọi request tự động đều **cùng origin**: `/api/health|profiles|scores|leaderboard|stats|events|errors` (qua `js/api.js`, `js/analytics.js`), `difficulty.config.json` (`js/campaign.js`), nhạc `assets/music/*.mp3|ogg` (`js/bgm.js:14-19,165,194` — file local, không CDN).
- Ngoại lệ theo cấu hình: nếu `wk_api_base`/`WK_API_BASE` được đặt (xem SEC-10), tiền tố `/api/*` sẽ trỏ tới origin đó — đây là tính năng cho backend tự host, không phải mặc định.
- Link ngoài do **người dùng bấm** (không phải request tự động): `index.html:311-312` — GitHub (`github.com/fudever-club/windowkill-web`) và Vercel (`windowkill-web.vercel.app`), cả hai có `rel="noopener"`. URL trong `canonical`/`og:` là metadata tĩnh, trình duyệt không fetch khi chơi.
- Không analytics bên thứ ba, không font CDN, không tracker, không quảng cáo. Analytics tự host và tôn trọng Do-Not-Track + toggle tắt trong game (`js/analytics.js`, đầu file) — đạt.

## Đã kiểm tra và đạt (không có finding)

Các mảng dưới đây đã được đọc/grep trực tiếp trên baseline `3b25694` và **sạch** tại thời điểm audit:

1. **XSS — các luồng render chính đều đúng mẫu.** Tên profile (dữ liệu người dùng nhập duy nhất): render bằng `textContent` (`js/menu.js:87-88` cho chip, và gán `textContent` cho `#hs-who`/`#st-who`). Tên người chơi trên leaderboard online (dữ liệu từ backend, coi như không tin cậy): qua `escapeHtml()` (`js/menu.js:52`, dùng tại dòng 210-211) trước khi vào `innerHTML`. Các `innerHTML` còn lại đều ăn dữ liệu đã ép số hoặc nội dung tĩnh của dev:
   - `js/menu.js` `renderScores`/`renderStats`: mọi giá trị qua `num()`/`int0()`.
   - `js/game.js:2138-2141` (draft legacy) và `js/game.js:2622,2629` (màn hình game-over): nội dung từ bảng `UPS` tĩnh + `I18N.t(...)` + số nội bộ của engine (`G.kills`, `G.level`…), không có dữ liệu người dùng.
   - `js/cinema.js:448` chỉ cho `innerHTML` khi chuỗi bắt đầu bằng `<svg` (icon do dev tạo tại `js/game.js` khi gọi `showDraft`); tên nâng cấp đi qua `textContent` (`js/cinema.js`, `nm.textContent`); riêng `desc` tại `js/cinema.js:453` dùng `innerHTML` nhưng nguồn là mô tả tĩnh trong từ điển i18n của dev — chấp nhận được, lưu ý nếu sau này desc chứa dữ liệu động thì phải đổi.
   - `js/i18n.js:754` (`data-i18n-html` → `innerHTML`): nguồn là từ điển tĩnh đóng gói trong `js/i18n.js`; các biến nội suy tại các điểm gọi đều đã ép số/escape trước (đã soi các caller chính trong `js/menu.js`). 
   - `js/tutorial.js:235-241` (draft fallback): `u.t`/`u.d` gán bằng `textContent`, chỉ cấu trúc thẻ là `innerHTML` tĩnh.
   - `satellite.html`: xem SEC-06 — tham số query được sanitize đúng (regex màu, `textContent` cho label, ép số cho HP/tọa độ).
2. **Không `eval` / `new Function` / `setTimeout(string)` / `document.write`** trong toàn bộ `js/*.js` và các trang HTML (grep 0 kết quả thực thi động; chỉ có nhắc trong comment). Không còn inline event handler (`onclick=`/`onerror=`…) trong `index.html`/`game.html`/`satellite.html`/`offline.html` — fix S4 của audit cũ giữ nguyên.
3. **CSP phía client (meta) cấu hình đúng hướng** cho `index.html`/`game.html`: `script-src 'self'` thuần (không `'unsafe-inline'`, không `'unsafe-eval'`), `object-src 'none'`, `base-uri 'self'`, `connect-src 'self'`, `img-src 'self' data:`. Điểm trừ duy nhất là tầng phân phối header (SEC-02) và `style-src 'unsafe-inline'` — giữ lại có chủ đích vì inline style phổ biến trong codebase, rủi ro CSS-injection ở mức thấp với mô hình dữ liệu hiện tại. *Lưu ý cho đội backend:* `connect-src 'self'` sẽ chặn frontend gọi backend khác origin (vd Fly.io) — khi deploy backend khác domain phải nới directive này thành domain cụ thể, tuyệt đối không nới thành `*`.
4. **SQL injection — không tồn tại.** `server/src/db.js`: 100% truy vấn qua `db.prepare(...)` với placeholder `?` (dòng 61 trở đi: insert/get/list/delete profile, insert score, leaderboard, stats, events, errors); `db.exec` chỉ chạy DDL tĩnh + `PRAGMA` không chứa dữ liệu người dùng. Adapter `api/leaderboard.js` cũng dùng placeholder `?` trong mẫu `query(sql, args)`. Không có nối chuỗi SQL với input ở bất cứ đâu (đã grep `prepare|exec|query` toàn bộ `server/src` + `api/`).
5. **Input validation của backend rất chắc** (`server/src/validate.js`): ID theo regex `^[A-Za-z0-9_-]{1,64}$` (dòng 11); tên trim + cắt 24 ký tự, rỗng thì loại (15-27); mọi số qua `intIn` kiểm tra `Number.isInteger` + biên (29-44); difficulty allowlist dùng chung hằng `DIFFICULTIES`; leaderboard `limit` kẹp 1-50 (46-54); events: allowlist `type`, timestamp phải thuộc cửa sổ hợp lệ (không trước 2025, không quá 5 phút tương lai), `profile_id_hash` phải đúng định dạng SHA-256 hex 64 ký tự, batch tối đa 100 events/20 errors, field lạ bị loại bỏ (81-186). Body tối đa 64 KB (`server/src/config.js`, thực thi tại `readBody` trong `server/src/server.js`) và client cũng tự giới hạn 60 KB khi gửi beacon (`js/api.js`).
6. **Error leakage — đạt.** `server/src/server.js:212-213`: lỗi nội bộ chỉ `console.error` phía server (message), client nhận `"internal server error"` chung chung; lỗi validation trả thông điệp nghiệp vụ cố định, không stack trace, không chi tiết SQL. `api/leaderboard.js` cùng mẫu: catch → log `e.message` phía server, trả `500 {error:"internal server error"}`.
7. **Security headers phía backend — đạt.** `server/src/security.js:4-14` gắn cho mọi response API: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-origin`, `Permissions-Policy` tắt camera/mic/geolocation, và CSP `default-src 'none'; frame-ancestors 'none'` (đúng cho API JSON thuần). Thiếu duy nhất `Strict-Transport-Security` — chấp nhận được vì backend mặc định chạy HTTP local sau proxy; nên bổ sung ở tầng proxy khi deploy HTTPS (gắn với SEC-02).
8. **Rate limit & chống phình dữ liệu — có và chia bucket hợp lý.** `server/src/ratelimit.js`: cửa sổ cố định 60s theo IP, 4 bucket riêng (read 120, write 30, events 60, errors 20 /phút — `server/src/config.js`), có dọn bucket hết hạn mỗi 5 phút chống phình Map; server trả header `X-RateLimit-*` và `429` đúng định dạng. Bảng events/errors có trần lưu trữ (`eventsCap`/`errorsCap` + câu `trim` trong `server/src/db.js`) nên pipeline analytics không làm phình DB vô hạn. (Giới hạn của cơ chế nằm ở SEC-08.)
9. **Supply chain — sạch theo đúng kỳ vọng zero-dep.** Frontend: mọi `<script src>`/`<link href>` trong 3 trang HTML đều là đường dẫn tương đối nội bộ (đã liệt kê toàn bộ) — **không CDN, không script/style bên thứ ba**, nên không cần SRI và không có rủi ro bị thay mã qua CDN. Backend: `server/package.json` khai báo **0 dependency** (chỉ Node built-ins: `node:http`, `node:sqlite`, `node:crypto`). Electron: chỉ `devDependencies` (`electron`, `@electron/packager`) trong `electron/package.json`. Âm thanh/hình ảnh đều là asset trong repo.
10. **Service worker — không có rủi ro cache-poison thực tế.** `sw.js`: chỉ xử lý `GET` cùng origin (dòng 122-129: bỏ qua cross-origin, bỏ qua `Range`, bỏ qua `/api/*` và file media); `putIfOk` (dòng 87-92) chỉ cache response `res.ok` cùng origin; chiến lược network-first cho HTML + stale-while-revalidate cho static; cache có version (`windowkill-v4`) và `activate` xóa cache cũ khác version; không cache POST. Kịch bản "đầu độc" cache đòi hỏi xâm nhập được origin/server trước — lúc đó SW không còn là biên. Điểm trừ nhỏ (không tính finding): stale-while-revalidate nghĩa là bản JS lỗi có thể sống thêm đúng 1 lần tải sau khi deploy bản sửa — đã được giảm bằng kỷ luật bump `VERSION`.
11. **Electron shell — giữ nguyên các fix S5/S6/S7.** `electron/main.js`: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`; `setWindowOpenHandler` chỉ `allow` URL `file:` nằm trong thư mục app đóng gói (`isAllowedAppUrl`), còn lại `deny`; `will-navigate` chặn điều hướng ra ngoài app; không `shell.openExternal`, không remote module.
12. **Quét secret trong repo & history — không phát hiện secret thật.** Đã kiểm: (a) `git ls-files` + toàn bộ tên file trong 190 commit — không file nào tên dạng `.env`/`*secret*`/`*.pem`/`*.key`/`id_rsa` được track; (b) pickaxe trên history với pattern token GitHub (`ghp_`), AWS (`AKIA…`), khóa riêng (`BEGIN … PRIVATE KEY`), khóa kiểu `sk-…` — 0 kết quả; (c) grep cây làm việc hiện tại: các hit cho `api_key/secret/token/password` chỉ nằm ở **tài liệu và script** dưới dạng *tên biến môi trường/hướng dẫn* (`scripts/itchio-push.sh` đọc `BUTLER_API_KEY` từ `~/.config/windowkill/itchio.env` ngoài repo, `scripts/deploy-vercel.sh` đọc `VERCEL_TOKEN` từ env và scrub khỏi log, `dist/PORTAL-SETUP.md`, `docs/MCP-SURVEY.md`, `SECURITY.md`, `skills/wk-qa/references/security-review.md`) — không có giá trị credential nào nằm trong repo (báo cáo này cố ý không trích bất kỳ giá trị nào, kể cả placeholder). Kết luận S8 của audit cũ vẫn đúng. Rủi ro còn lại chỉ là phòng ngừa (SEC-11).
13. **Các fix S1/S2/S3 của audit 2026-10-01 không hồi quy:** ép số cho message `gameover` vẫn còn tại `js/menu.js:37-40` + trong handler dòng 230 trở đi và sanitize lại lúc đọc trong `renderScores`/`renderStats`; meta CSP vẫn có ở cả hai trang chính; tên profile vẫn `textContent`.
14. **Privacy analytics — đạt mức đã cam kết:** không cookie, không fingerprint, tôn trọng Do-Not-Track và toggle trong game, chỉ gửi hash profile (xem SEC-14 về giới hạn), server chỉ lưu hash + số liệu đã validate, `/api/metrics` chỉ trả tổng hợp không PII.

## Thứ tự ưu tiên xử lý (đề xuất cho Tech Lead)

1. **Trước khi deploy backend public:** SEC-01 (profile token) + SEC-03 (chặn Origin lạ cho request ghi + bắt buộc `Content-Type: application/json`) + SEC-04 mục 1-2 (kiểm tra tương quan điểm + rate limit theo profile). Ba việc này là một gói "backend go-live gate".
2. **Sprint bảo trì gần nhất:** SEC-02 (headers tại `vercel.json`, lưu ý allowlist portal cho `frame-ancestors`) + SEC-11 (`.gitignore` + gitleaks CI) — đều là thay đổi cấu hình, rủi ro thấp.
3. **Làm khi tiện (hardening rẻ):** SEC-05 (allowlist avatar, 1 dòng), SEC-09 (chặn `__proto__` trong `deepMerge`), SEC-06 (tách `js/satellite.js`), SEC-10 (allowlist cho `wk_api_base`), SEC-08 (env trust-proxy khi có proxy thật).
4. **Chấp nhận có ghi chép:** SEC-07 (BroadcastChannel), SEC-12 (localStorage offline), SEC-13/SEC-14 (INFO — chỉ cần quyết định trước khi adapter Vercel được kích hoạt hoặc analytics dùng vào việc nhạy cảm hơn).

## Chưa kiểm chứng được (nói thật)

- **Không kiểm thử động:** audit này là đọc code tĩnh. Không chạy server để fuzz API thật, không chạy trình duyệt để thử XSS payload trực tiếp, không dùng OWASP ZAP. Các kết luận "đạt" là dựa trên đường code, chưa phải bằng chứng runtime.
- **Không kiểm chứng hạ tầng production thật:** headers thực tế trên `windowkill.fudever.com`/`windowkill-web.vercel.app` có thể khác `vercel.json` trong repo (cấu hình dashboard, CDN, domain tùy chỉnh) — cần một lần `curl -sI` đối chiếu ở bước verify của leader. Tương tự, bản zip portal (itch.io) không nằm trong phạm vi đọc lần này.
- **`npm audit` cho `electron/` không chạy được** trong sandbox audit này (giới hạn registry, cùng ghi chú đã có trong `SECURITY.md` cũ) — tình trạng lỗ hổng của `electron`/`@electron/packager` dựa vào CI GitHub Actions, chưa được xác minh độc lập tại đây.
- **Git history:** đã quét 190 commit có trong clone `~/workspace/wk-deep` (clone không shallow). Nếu remote còn nhánh/đối tượng không được fetch về clone này thì phần đó nằm ngoài phạm vi quét.
- **Hai trình duyệt chưa test:** không có kiểm chứng runtime trên Firefox/Safari cho các nhận định về CSP meta/BroadcastChannel (đây là giới hạn đã biết của đợt audit tổng) — các nhận định trong báo cáo dựa trên đặc tả chuẩn, áp dụng chung cho engine hiện đại.
- Backend **chưa deploy** nên SEC-01/SEC-03/SEC-04/SEC-08 là đánh giá theo code + kế hoạch deploy đã ghi trong `docs/DEPLOY-BACKEND.md`, không phải sự cố đã xảy ra trên production.
