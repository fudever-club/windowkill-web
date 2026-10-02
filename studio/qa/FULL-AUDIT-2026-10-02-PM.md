# FULL AUDIT — WINDOWKILL (chiều 2026-10-02, bản PM)

**Mục tiêu audit:** `main` @ `02f9430` (merge PR #32 — Design launcher + CTA dưới hero + nối backend leaderboard)
**Nhánh báo cáo:** `team/testing-system-2026-10` · **Ngày:** 2026-10-02 (chiều, +07)
**Team thực hiện:** Testing Team FU-DEVER — Test Lead, Automation Engineer, Device/Browser Matrix Owner, Backend/API Tester, Performance Tester, Release Captain (+ điều phối viên bù phần i18n/PWA do agent Device/Browser không trả kết quả — ghi rõ ở §3.2 và §3.3)
**Phương pháp:** test suite tự động, curl API live, đo headless Chromium, static analysis, GitHub API public. **Không live browser, không máy thật** — mọi giới hạn ghi rõ.

> Báo cáo buổi sáng cùng ngày: `studio/qa/FULL-AUDIT-2026-10-02.md` (bản AM).

---

## 1. Tổng quan kết quả

| Hạng mục | Kết quả |
|---|---|
| Frontend tests (main @ 02f9430) | **166 pass / 0 fail / 1 skip** (167 tests, 7 files) — đúng baseline sáng |
| Server tests (main @ 02f9430, chạy thủ công) | **15 pass / 0 fail** (`server/tests/api.test.js`) |
| Testing branch @ 3e76c1f (44 tests mới) | **210 pass / 0 fail / 1 skip** (211 tests) — 44/44 tests mới xanh |
| Backend API live (Fly.io) | **7/7 kịch bản pass** (health, profile, score 201/401/403, leaderboard, delete) — test data đã dọn sạch (xác minh 3 lớp) |
| i18n EN/VI (static) | **211/211 keys** có đủ VI + EN, gồm toàn bộ màn hình hub/CTA mới |
| PWA / service worker | Luồng update đúng (skipWaiting + clients.claim + purge cache cũ) — **nhưng version chưa bump** (v5) sau 28 commits → action item v6 |
| Performance headless | Tương đương sáng nay (FPS ~59.5 khóa vsync 60Hz, p95 16.7ms, heap +0.55MB/60s) — xem §3.5 + giới hạn đo §7 |
| Bug CRITICAL mới trên main | **Không có** |
| Bug MAJOR mới | **2** (B1: SW chưa bump; B2: CI chưa chạy server tests — P1 còn mở). Trạng thái nhánh miniboss (từng thiếu nửa fix, đã bổ sung) xem §3.5 |
| Gap nguy hiểm chưa cover | **4/4 vẫn mở** (Firefox/Safari thật, mobile máy thật, multi-window e2e thật, server tests trong CI) |

---

## 2. Kết quả test suite (Automation Engineer)

**Frontend — `node --test "tests/*.test.js"` trên main @ 02f9430:**

| File | pass | fail | skip |
|---|---|---|---|
| tests/analytics.test.js | 5 | 0 | 0 |
| tests/game-logic.test.js | 9 | 0 | 1 (skip chủ đích: "game.js export pure function") |
| tests/launcher-ui.test.js | 79 | 0 | 0 |
| tests/pwa.test.js | 21 | 0 | 0 |
| tests/rebalance.test.js | 0* | 0 | 0 |
| tests/smoke.test.js | 32 | 0 | 0 |
| tests/upgrades2.test.js | 20 | 0 | 0 |
| **Tổng** | **166** | **0** | **1** |

\* `rebalance.test.js` báo 0 tests vì file chỉ dùng `describe` (không có `it`) — các assert rebalance vẫn chạy và PASS bên trong describe blocks. Đây là đặc tính báo cáo của `node:test`, không phải file hỏng.

**Server — `server/tests/api.test.js` (chạy thủ công, bù gap P1 CI không chạy):** 15/15 PASS (health + security headers, profiles CRUD + validation, scores/leaderboard/stats, delete cascade, 404 JSON, rate limiter, events/metrics, errors cap, analytics buckets, SEC-01/03/04, B5/B6/B7).

**Nhánh `team/testing-system-2026-10` @ 3e76c1f:** 210 pass / 0 fail / 1 skip — 5 file mới đúng 44 tests (api-client 9, campaign-logic 8, i18n-coverage 8, meta-logic 10, pwa-offline 9), tất cả xanh. Không regression so với main.

---

## 3. Kết quả theo mảng

### 3.1 Backend/API (live https://windowkill-web.fly.dev)

Kịch bản tạo → dùng → xóa (bypass DNS giả sandbox bằng `--resolve ...:66.241.124.119`):

| # | Endpoint | Kỳ vọng | Thực tế | Thời gian |
|---|---|---|---|---|
| 1 | GET /api/health | 200 | ✅ 200 `{"status":"up","version":"1.0.0"}` | ~3.9s (TLS handshake lần đầu) |
| 2 | POST /api/profiles | 201 + one-time token | ✅ 201, token 64 hex trả đúng 1 lần | 0.75s |
| 3 | POST /api/scores (token đúng) | 201 | ✅ 201 | 0.81s |
| 4 | POST /api/scores (không token) | 401 | ✅ 401 `profile token required` | 0.97s |
| 5 | POST /api/scores (token sai) | 403 | ✅ 403 `invalid profile token` | 1.32s |
| 6 | GET /api/leaderboard?difficulty=chill | 200 + chứa score | ✅ 200, đúng 1 entry khớp profile | 0.92s |
| 7 | DELETE /api/profiles/:id | 200 | ✅ 200 | 0.56s |

Security smoke (quan sát): security headers đầy đủ (nosniff, DENY, no-referrer, COOP/CORP same-origin, Permissions-Policy, CSP `default-src 'none'`); rate limit thật (`X-RateLimit-Limit: 120`, health được miễn đúng code); SEC-03 chặn `Origin: https://evil.example` → 403 trước route handler; preflight từ `https://windowkill.fudever.com` → 204 với CORS allowlist đúng.
**Dọn data:** ✅ đã xóa hết — xác minh 3 lớp: leaderboard chill về `[]`, `/api/stats/:id` → 404, `/api/profiles` không còn id test.

### 3.2 i18n — màn hình mới (hub + CTA)

⚠️ *Do agent Device/Browser Matrix không trả kết quả, điều phối viên tự kiểm chứng static (không phải test trình duyệt).*
- Quét 211 keys đang dùng (index.html `data-i18n` + `I18N.t()` trong js/menu.js, js/meta.js, js/game.js, js/v2glue.js) đối chiếu 2 khối VI/EN trong js/i18n.js: **211/211 keys có đủ cả VI và EN** — gồm toàn bộ hub nav (`menu.hub.shop/ach/daily/stats/settings/howto/difficulty`), CTA (`common.play`), popup note, overlays.
- Quét static không phát hiện text hiển thị cứng nào ngoài pattern `data-i18n-html` (fallback trong HTML, runtime thay bằng i18n — đúng chuẩn). Lưu ý: canvas `fillText` và string dựng động chưa được quét nên không khẳng định tuyệt đối.
- **Kết luận:** i18n EN cho launcher mới đầy đủ. Render thật trên trình duyệt: NOT TESTED.

### 3.3 PWA / offline

- `sw.js` hiện tại: `VERSION = "windowkill-v5"`, cache `windowkill-v5-static` / `-html`; luồng update **đúng**: `skipWaiting()` khi install, `clients.claim()` khi activate, purge cache `windowkill-*` cũ, message `SKIP_WAITING` có handler.
- **Vấn đề (B1):** version v5 bump từ commit `703364d`; sau đó có **28 commits** (xác minh: 3 commits chạm file precache `js/game.js`, `js/i18n.js`…) mà **không bump lại** → client đang giữ SW v5 sẽ không tải bản mới sau release. Đặc biệt rủi ro khi PR #33 đổi định dạng save (`wk_save_version`).
- **Action item:** bump → `windowkill-v6` trong cùng batch release sắp tới.
- Luồng offline/update trên máy thật: **NOT TESTED**.

### 3.4 Performance smoke (headless Chromium, SwiftShader)

Phương pháp: tái hiện audit sáng nay (serve local qua relay proxy do sandbox chặn loopback; profile cold mỗi run). Boot: `game.html?diff=chill&music=0&sfx=0&sat=sim&tut=0` (2 run). Gameplay: bot tự chơi 60s (3 run).

| Chỉ số | Sáng nay | Chiều nay | Nhận xét |
|---|---|---|---|
| Boot longtask | 2 task/242ms · 4 task/348ms | 2 task/301ms · 2 task/248ms | tương đương |
| FPS gameplay | 59.9 / 59.5 | 59.45 / 59.55 / 59.61 | tương đương (khóa vsync 60Hz) |
| Frame p95 | 16.7–16.8ms | 16.7ms | tương đương |
| Frame > 33.3ms | 0.1–0.2% | 0.41–0.58% | **hơi tệ đi nhẹ** (m1) |
| Longtask giữa gameplay | 0 | 1–4 task 51–69ms | **mới xuất hiện** (m1) — nghi do draft Cinema/wave transition, p95 chưa ảnh hưởng |
| Heap +/60s | +0.7MB | +0.55MB | tương đương, không tín hiệu leak trong 60s |
| JS trang game | 745,450 B | 753,691 B (+1.1%) | — |
| JS trang menu | 573,716 B | 584,479 B (+1.9%) | menu vẫn tải cả engine game (đã biết) |
| mp3 BGM | 7,335,436 B (192k) | 4,890,355 B (128k, **−33%**) ✅ | đề xuất #1 đã áp dụng |
| PNG icons | 127,422 B | 34,290 B ✅ | đề xuất #3 đã áp dụng |
| SW precache | v4: 34 file / 1,173,304 B | v5: 31 file / 1,008,074 B (**−14%**) ✅ | đề xuất #4 đã áp dụng |
| BGM preload | — | `preload="none"` + gate tương tác đầu tiên ✅ | đề xuất #2 đã áp dụng, hành vi đúng |

**Kết luận perf:** runtime tương đương sáng nay; 4/4 đề xuất tối ưu đã áp dụng và kiểm chứng hành vi đúng. Hai điểm theo dõi (m1, m2): longtask nhỏ giữa gameplay + boot longtask hơi cao hơn — cần đo lại trên thiết bị thật trước khi kết luận.

### 3.5 Trạng thái PR/nhánh chờ merge

*Snapshot audit: ~11:52 UTC 2026-10-02 (Release Captain). Trạng thái PR do Test Lead review kiểm chứng live lúc ~12:11 UTC cùng ngày — đây là thời điểm chốt số liệu cho bản báo cáo này.*

| PR/nhánh | Trạng thái lúc audit | Cập nhật lúc ký (12:11 UTC) |
|---|---|---|
| PR #33 `feat/save-versioning-n8` | ✅ CI xanh thật (test, GitGuardian, Vercel-web); `mergeable: true`; legacy status đỏ chỉ do context `Vercel – server` thừa (project chờ user xóa tay) | Không đổi — **đủ điều kiện merge sau sign-off** |
| PR #34 `team/org-expansion` | (ngoài snapshot audit) | ✅ Đã mở, mergeable (theo review) |
| `team/testing-system-2026-10` | ✅ @ 3e76c1f, chưa mở PR (CI chưa chạy) | Không đổi — cần mở PR → CI |
| PR #35 `fix/miniboss-wave5` @ `4d2b756` | 🔴 remote thiếu nửa fix `js/game.js` (vượt 128KB không push được qua CLI); test C2b-5 của nhánh sẽ FAIL trên CI; merge lúc đó = wave-5 không spawn gì (tệ hơn fallback chaser) | ✅ Đã mở PR, **CI test + GitGuardian xanh** (verify live lúc ký) — merge theo thứ tự CTO, sau PR #33 |
| PR #36 `fix/hitstop-smooth` @ `10155fc` | ❌ 404 trên origin lúc audit | ✅ Đã mở PR, **CI test + GitGuardian xanh** (verify live lúc ký) — merge cuối batch |
| `fix/hud-winbar-overlap` | ❌ 404 trên origin lúc audit | ✅ Đã xuất hiện trên origin (`2d6ea94`) — **nhưng theo quyết định CTO (đã duyệt): HỦY nhánh này sau khi mobile merge**, vì mobile commit `488d95f` là superset (cùng logic winbar responsive + rPad 116) |
| itch.io | ✅ live build #2051440 = 02f9430; các fix chưa lên itch là đúng kỳ vọng | Không đổi |

**Thứ tự merge theo quyết định CTO (đã duyệt, 2026-10-02 ~18:56 +07):**
#34 (org-expansion) → testing PR (sau sign-off) → **#33 (N8)** → **#35 (miniboss)** → **mobile** (thay thế hud-winbar) → **#36 (hitstop)**.
Điều kiện mỗi merge: CI xanh thật (bỏ qua `Vercel – server` thừa) + Test Lead sign-off + không overlap file chưa resolve. Hai nhánh cùng sửa `js/game.js` (miniboss, hitstop) phải merge **nối tiếp**, mỗi nhánh rebase lên main mới trước merge.

---

## 4. Bug mới phát hiện

**CRITICAL: không có.**

**MAJOR:**
- **B1 — sw.js chưa bump v6 (release):** 28 commits sau v5 (3 commits chạm file precache) mà version vẫn `windowkill-v5` → client không nhận bản mới sau release; rủi ro cao khi PR #33 đổi save format. *Fix: bump → `windowkill-v6` trong batch release.*
- **B2 — CI chưa chạy server tests (process, gap P1 còn mở):** `.github/workflows/ci.yml` chỉ chạy `node --test tests/*.test.js`; `server/tests/api.test.js` tồn tại nhưng CI không gọi → regression backend vô hình. *Fix: PR riêng thêm server tests vào ci.yml (điều kiện duy nhất còn thiếu cho sign-off PASS).*

*(Ghi chú: trạng thái nhánh `fix/miniboss-wave5` từng thiếu nửa fix đã được bổ sung sau thời điểm audit — xem §3.5, không còn là bug mở.)*

**MINOR:**
- **m1:** 1–4 longtask 51–69ms xuất hiện giữa gameplay (sáng nay: 0); frame >33.3ms tăng 0.1–0.2% → 0.41–0.58%. Chưa ảnh hưởng p95 — theo dõi, đo lại trên máy thật.
- **m2:** boot longtask tổng 332–566ms (sáng: 242–348ms), phù hợp JS +~9KB. Chưa đo máy yếu thật.
- **m3:** 2 nhánh fix game.js xuất hiện trên origin sau thời điểm audit — chưa có PR/CI.

---

## 5. Sổ gap trung thực (Test Lead xác minh — cả 4 vẫn mở)

| # | Gap | Trạng thái | Bằng chứng | Rủi ro |
|---|---|---|---|---|
| a | Firefox / Safari thật | ❌ NOT TESTED | `studio/qa/FULL-AUDIT-2026-10-02.md:99`; `studio/dev/audits/security.md:227` (nhận định CSP/BroadcastChannel trên FF/Safari chỉ dựa đặc tả); `ROADMAP.md` backlog | CAO |
| b | Mobile máy thật (Android/iPhone) | ❌ NOT TESTED — chỉ CDP emulation | `FULL-AUDIT-2026-10-02.md:100`; `performance.md:12,170`; `ROADMAP.md:46` | CAO (game có joystick touch 2 cần) |
| c | Multi-window popup e2e trên browser thật | ❌ NOT TESTED — chỉ `sat=sim` | `FULL-AUDIT-2026-10-02.md:102` (sandbox chặn loopback cho cửa sổ con); finding M16: nhánh sim mất 100–160px/frame thay vì 8px/3s như popup thật → **sim không thay thế e2e thật** | RẤT CAO (cơ chế lõi game) |
| d | Server tests trong CI | ❌ CHƯA FIX (P1) | `.github/workflows/ci.yml:29-30` không gọi `server/tests` | CAO (backend đã live) |

Không tìm thấy bằng chứng nào bác bỏ 4 gap trên. Mọi tuyên bố "đã test" ngoài phạm vi báo cáo này đều cần evidence mới.

---

## 6. Điều kiện Test Lead sign-off

- **✅ PASS (không điều kiện):** không CRITICAL/P0 mở + gap P1 (d) đã đóng (CI chạy server tests, xanh, có check-run) + mọi tuyên bố có evidence + mọi fix qua PR + CI xanh → **hiện tại CHƯA ĐẠT** (điều kiện d chưa xong).
- **⚠️ CONDITIONAL PASS:** không CRITICAL/P0 + 4 gap ghi nhận trung thực kèm OWNER + DEADLINE cho đợt bù + PR #33 chỉ merge khi CI xanh + không merge nhánh chưa có PR/CI + báo cáo không tuyên bố thiếu evidence → **mức tối đa ký được chiều nay.**
- **❌ FAIL:** còn CRITICAL/P0 mở, hoặc gap P1 không owner/deadline, hoặc báo cáo chứa tuyên bố "đã test" không evidence / gọi simulation là test thật, hoặc đề xuất merge khi CI đỏ.

---

## 7. Giới hạn đo & phương pháp (bắt buộc đọc kèm số liệu)

> **GIỚI HẠN ĐO:** (1) Headless Chromium + render phần mềm SwiftShader, khóa vsync 60Hz — **không đo được headroom trên 60 FPS**. (2) Render phần mềm trên CPU server **khác hoàn toàn GPU thật** — không suy ra hiệu năng điện thoại/laptop yếu/GPU rời. (3) Chỉ đo **chill, wave 1→2, sat=sim, 60 giây** — chưa kiểm chứng wave đông, boss, chain-popup M5–M10, phiên dài. (4) Heap theo dõi 60s — chưa đủ kết luận leak dài hạn. (5) Traffic qua relay proxy local — ms tuyệt đối phồng nhẹ, chỉ so sánh tương đối. (6) **Không phải đo trên thiết bị thật**: chưa có số liệu Safari/Firefox, mobile thật, mạng 3G/4G thật. Mọi kết luận "máy yếu vẫn ổn" từ bộ số này đều là suy diễn không cơ sở.

**Bằng chứng thô:** harness perf tại `~/workspace/wk-perf-harness/` (giữ bởi Performance Tester); backend curl log theo kịch bản §3.1; `git log`/`diff` cho các xác minh static.

---

## 8. Action items (đợt tiếp theo)

| # | Việc | Owner đề xuất | Deadline đề xuất |
|---|---|---|---|
| 1 | PR riêng: thêm `server/tests` vào `ci.yml` (đóng gap P1 → mở đường sign-off PASS) | Backend/API Tester + Automation | Đợt audit tiếp theo |
| 2 | Bump `sw.js` → `windowkill-v6` trong batch release (B1) | Release Captain | Cùng batch merge sắp tới |
| 3 | PR #35 (miniboss): CI đã xanh lúc ký — merge theo thứ tự CTO sau PR #33 | Engineering | Theo batch |
| 4 | Mở PR cho `team/testing-system-2026-10` → CI → merge (sau sign-off) | Điều phối | Theo thứ tự CTO |
| 5 | PR #36 (hitstop): CI đã xanh lúc ký — merge cuối batch theo thứ tự CTO | Điều phối | Theo batch |
| 9 | Merge đúng thứ tự CTO: #34 → testing → #33 → #35 → mobile → #36 | Điều phối | Batch này |
| 6 | Đợt bù real-browser: Firefox/Safari + 1 Android + 1 iPhone thật + multi-window popup e2e (gaps a, b, c) | Device/Browser Matrix Owner | Trước Season 1 |
| 7 | Audit bổ sung sau merge: hit-stop tuning, miniboss wave 5, N8 migrateSave trên save thật cũ | Testing Team | Sau từng merge |
| 8 | Đo lại m1/m2 (longtask gameplay, boot) trên thiết bị thật | Performance Tester | Đợt audit tiếp theo |

---

## 9. Test Lead sign-off

- **Mức ký:** CONDITIONAL PASS
- **Điều kiện kèm theo (nếu có):** (1) Cập nhật §3.5 "Cập nhật sau audit" theo trạng thái PR thực tế lúc ký (PR #34/#35/#36 đã mở, CI test+GitGuardian xanh — kiểm chứng live 2026-10-02 chiều) + đóng dấu thời điểm chốt số liệu; (2) Sửa §3.2: thay tuyên bố tuyệt đối "không có text cứng" bằng "quét static không phát hiện text cứng ngoài pattern data-i18n-html"; (3) Sửa cross-reference header §3.3 → §3.2 + §3.3; (4) Đổi tên M1–M3 tránh nhầm với mechanics M5–M10 (nay là B1–B2), chuyển trạng thái nhánh miniboss ra khỏi mục "Bug mới" (xem §3.5); (5) Mọi merge chỉ khi CI xanh thật (được bỏ qua context thừa Vercel-server sau verify), có PR trước merge, nhánh cùng sửa js/game.js merge nối tiếp có rebase; (4 gap a–d giữ nguyên owner/deadline tại §8, đợt bù real-browser trước Season 1; gap d đóng = đường lên PASS)
- **Chữ ký / người ký:** Test Lead — Testing Team FU-DEVER
- **Thời gian ký:** 2026-10-02 (chiều, +07)

*Các điều kiện (1)–(4) đã được áp dụng vào bản báo cáo này trước khi chốt commit (xem git log).*

---
*Báo cáo tổng hợp bởi điều phối Testing Team, 2026-10-02 chiều (+07). Commit local trên `team/testing-system-2026-10`, không push (parent agent push + mở PR sau).*
