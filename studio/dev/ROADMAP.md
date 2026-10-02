# ROADMAP PHÁT TRIỂN — WINDOWKILL

- **Ngày lập:** 2026-10-02 · **Base:** main `3b25694` (sau PR #29)
- **Branch chương trình:** `dev/deep-audit-upgrades-2026-10`
- **Tài liệu nền:** `studio/dev/audits/` (security, ui-ux, backend, performance, frontend-arch) + `studio/qa/FULL-AUDIT-2026-10-02.md`
- **Trạng thái production khi lập:** v2.0 + full-audit fixes đã live tại windowkill.fudever.com và itch.io; backend chưa deploy (chờ Fly account của user).

---

## 1. NOW — Đã làm trong đợt Deep Audit + Nâng cấp này

| Mảng | Đã làm | Kết quả đo/chứng minh |
|---|---|---|
| Audit đa mảng | 5 báo cáo audit độc lập (security, UI/UX, backend, performance có số đo thật, kiến trúc frontend + spec M22) | `studio/dev/audits/*.md` |
| Security | Profile-token auth cho backend (token thô trả 1 lần, server chỉ lưu SHA-256 hash, `timingSafeEqual`); CORS thực thi trên request ghi + chặn simple-request bằng Content-Type; kiểm tra tương quan điểm chống điểm bất khả thi; vercel.json có HSTS/nosniff/Referrer-Policy/`frame-ancestors` (giữ allowlist itch) | Curl verify đủ kịch bản 401/403/200/400; secret scan 190 commit: sạch |
| Backend | Migration DB bằng `PRAGMA user_version`; rate-limit theo IP thật sau proxy (XFF) và miễn quota cho `/api/health`; health = readiness (check DB); file deploy Fly (Dockerfile + fly.toml + healthcheck + volume) đã vào repo tại `server/deploy/` | Server tests 10 → **15 pass / 0 fail**; migration trên DB cũ giữ nguyên dữ liệu |
| Performance | Mp3 192k→128k; BGM không tải trước tương tác đầu tiên; quantize 4 PNG; cắt precache SW | Playlist **7.34MB → 4.89MB (−33%)**; nhạc tải trước tương tác **≥1,012KB → 0 byte**; precache **1,173,304B → 999,183B (−14.8%)**; 4 PNG **−73%** |
| UI/UX | 14 quick wins: CTA Chơi sticky, cảnh báo popup có `role=alert` + focus, touch target ≥44px, `aria-pressed`/focus-visible, chữ muted đạt tương phản AA (4.63:1 → 8.95:1), animation mở overlay + reduced-motion, error state cho bảng xếp hạng, bỏ cấm zoom | Đủ 14/14 mục trong audit ui-ux.md |
| Gameplay upgrade (M22) | Nối 6 nâng cấp Upgrades2 (Gai Phản, Neo Quán Tính, Mắt Cú, Đạn Nổ, Đạn Xích, Keo Tự Vá) vào engine qua draft slot bảo đảm; **fix F-02**: Workshop modifiers nay áp dụng ngay từ run đầu sau khi tải trang; nối 5 node Workshop 6–10 (trước đây mua mà không có tác dụng); achievement #15 đếm được nâng cấp | 20 test mới; runtime harness verify Keo Tự Vá/Đạn Nổ/second-life/free-upgrade chạy thật |
| Tests | Frontend 67 → **87 pass / 0 fail / 1 skip**; server **15 pass / 0 fail** | Chạy lại độc lập ở cuối chương trình |

**Chưa kiểm chứng được trong đợt này (nói thật):** QA trình duyệt thật cho vài effect M22 (Gai Phản/Mắt Cú/unlock boss ở mức runtime, tương tác node Free Upgrade × tutorial) — đã pin bằng unit/static test, cần 1 lượt QA browser theo checklist §5.7 của frontend-arch.md; deploy Fly thật; Firefox/Safari; thiết bị thật.

---

## 2. NEXT — 1–2 sprint tới (xếp theo ưu tiên)

### N1. Deploy backend lên Fly.io → mở leaderboard online thật
- **Việc:** user chạy `fly auth signup` 1 lần (blocker duy nhất) → `fly launch/deploy` theo `server/deploy/` + tạo volume `wk_data` → set `WK_API_BASE` ở frontend (B4) → verify CORS từ iframe itch thực tế.
- **Vì sao trước:** mọi lớp bảo vệ (auth token, rate-limit, anti-score-lố) đã sẵn; leaderboard online là tính năng hứa hẹn lâu nhất còn thiếu và là nền cho Daily/Season sau này.
- **Effort:** 0.5 ngày (phần lớn là chờ thao tác tài khoản). **Phụ thuộc:** tài khoản Fly của user; thẻ/trial theo chính sách Fly hiện hành cần xác minh lại khi làm.

### N2. QA browser thật + playtest cân bằng cho M22/Workshop
- **Việc:** chạy checklist §5.7 (frontend-arch.md): 6 effect ở mức runtime, node Free Upgrade × tutorial beat đầu, Gai Phản throttle, Mắt Cú ở ải cúp điện; Game Design playtest chốt hằng số (throttle 0.5s, tỉ lệ Keo Tự Vá, sát thương lan/xích).
- **Effort:** 0.5–1 ngày. **Phụ thuộc:** không.

### N3. Hoàn thiện đồng bộ token + sửa lệch field profile
- **Việc:** luồng re-claim token trong `js/menu.js` cho profile tạo lúc offline (hiện nộp điểm online sẽ 401 và chỉ mất đồng bộ, game vẫn chạy local); sửa lệch field `avatar` (client) vs `emoji` (server — B16 backend audit).
- **Effort:** 0.5 ngày. **Phụ thuộc:** N1 (có backend live mới test end-to-end được).

### N4. i18n bổ sung cho bề mặt mới
- **Việc:** tên/mô tả EN cho 6 món Upgrades2 (D-06 — hiện chế độ EN vẫn hiện tiếng Việt); 3 key còn thiếu từ đợt UI/UX (`common.checking`, `menu.scores.load_error`, `meta.need_shards`); text VI-only trong satellite.html.
- **Effort:** 0.5 ngày. **Phụ thuộc:** không.

### N5. Ma trận trình duyệt/thiết bị thật
- **Việc:** Firefox + Safari/WebKit (đợt audit trước cài Firefox timeout trong sandbox — làm trên máy thật hoặc CI có sẵn browser), 1 điện thoại Android + 1 iPhone thật: popup/resize giới hạn, touch joystick, hiệu năng wave đông.
- **Effort:** 1 ngày. **Phụ thuộc:** thiết bị thật của user/studio.

### N6. Portal SDK — CrazyGames + GameDistribution
- **Việc:** tích hợp SDK từng portal (ads hook, lifecycle pause khi ads, analytics theo chuẩn portal) sau lớp portal-mode sẵn có; nộp hồ sơ portal.
- **Vì sao:** kênh phân phối miễn phí cho uploader, hợp hướng đi hiện tại (itch.io đã live).
- **Effort:** 2–3 ngày/portal. **Phụ thuộc:** tài khoản portal; điều khoản từng portal phải đọc bản chính thức khi nộp (đặc biệt điều khoản độc quyền của Poki — chưa xác minh, không quyết dựa trên tin đồn).

### N7. CI cứng hơn
- **Việc:** thêm lint vào GitHub Actions (audit kiến trúc chỉ ra đây là khoảng trống lớn nhất), secret-scan (rules của studio đã yêu cầu mà CI chưa có), chạy cả server tests trong CI, matrix Node 2 phiên bản.
- **Effort:** 0.5 ngày. **Phụ thuộc:** không.

### N8. Chốt thiết kế save trước Season 1
- **Việc:** quyết định meta progression theo profile hay toàn cục (hiện `wk_meta_*` là toàn cục trong khi campaign theo profile — cần user/lead chốt); thêm `wk_save_version` + khung migration phía client.
- **Effort:** 0.5 ngày thiết kế + migration. **Phụ thuộc:** quyết định thiết kế (mục hỏi user khi tới sprint).

---

## 3. LATER — Sau 2 sprint

- **Season 1 "MÙA DEADLINE"** — thiết kế đã xong (PR #27, branch `team/game-design-season-1`): 6 tuần, 3 quái mới, boss 3 phase, 18 weekly missions. Triển khai khi N2/N8 xong (cần save versioning + QA browser đạt).
- **Media chain-popup** — shot M8/M6/M5 cần người chơi thật tới wave 8+ (bot chạm trần wave 5); tổ chức 1 phiên quay có người điều khiển, hoặc chờ Season 1 có thêm nội dung rồi quay gộp.
- **Leaderboard public mở rộng** — trang bảng xếp hạng công khai, chia sẻ kỷ lục, chống gian lận mức 2 (ký điểm phía client chỉ là răn đe; cân nhắc server-side sanity nâng cao khi có dữ liệu thật).
- **Backup tự động cho SQLite** khi backend live (Litestream hoặc cron copy có checkpoint — tránh mất dữ liệu WAL khi copy tay).
- **Tách dần `js/game.js`** (3,603 dòng) theo đường an toàn 3 bước trong frontend-arch.md — chỉ làm khi có test phủ đủ (Bosses hiện 0 test là ưu tiên bù trước).
- **Âm thanh/asset thế hệ 2:** cân nhắc Opus 96k thay mp3 (tiết kiệm thêm ~25%), tách JS riêng cho menu (−86KB gzip ước lượng), cache header immutable cho asset có hash.
- **Steam / bản .exe** — Electron build đã có từ v1; quay lại khi bản web ổn định + có trang Steam (phí + quy trình review riêng, cần quyết định của user).

---

## 4. Rủi ro kỹ thuật & nợ kỹ thuật còn tồn

| # | Rủi ro / nợ | Mức | Cách trả dần |
|---|---|---|---|
| R1 | SQLite single-writer + 1 instance Fly: trần scale thấp khi leaderboard có traffic thật; rate-limit theo IP chung (NAT trường học) vẫn có thể chật dù đã theo XFF | Trung bình | Bậc thang đã vạch trong backend.md: tối ưu tại chỗ → cache đọc → adapter Postgres/Turso (db.js đã tách lớp) |
| R2 | Tin `X-Forwarded-For` vô điều kiện: đúng khi sau Fly edge, sai nếu backend bị phơi trực tiếp | Thấp | Khi deploy chỉ expose qua Fly; ghi chú sẵn trong README server |
| R3 | Profile legacy chưa có token vẫn ghi/xoá mở (claim-on-first-token) — cửa sổ tương thích có chủ đích | Thấp | Sau khi backend live + client re-claim (N3) xong, cân nhắc đóng hẳn đường legacy |
| R4 | `js/game.js` monolith 3,603 dòng, coupling cao (8 điểm đã map) — sửa 1 chỗ dễ vỡ chỗ khác | Trung bình | Bù test cho Bosses/meta trước; tách 3 bước ở mục Later; mọi thay đổi vào game.js bắt buộc kèm static pin test như đợt M22 |
| R5 | Test coverage lệch: mảng Bosses/campaign gần như chưa có test động; Firefox/Safari/thiết bị thật = 0 | Trung bình | N2 + N5; thêm test harness vm (đã chứng minh chạy được ở đợt M22) thành pattern chuẩn |
| R6 | Chuỗi EN thiếu ở bề mặt mới (Upgrades2, satellite) — người chơi EN thấy lẫn VI | Thấp | N4 |
| R7 | Canvas chưa nhân DPR (mờ trên Retina), chưa nghe `visualViewport` | Thấp | Việc nhỏ, gộp vào sprint polish sau N2 |
| R8 | Electron/.exe: chưa chạy được `npm audit` trong sandbox; bản .exe v1 đã cũ so với web v2 | Thấp | Đánh giá lại ở mục Later/Steam |
| R9 | Backend chưa từng chạy production: mọi số hiệu năng là của sandbox | Trung bình | N1 xong phải có 1 vòng đo thật + theo dõi health/metrics tuần đầu |

---

## 5. Nguyên tắc giữ cho các đợt sau

1. Branch → PR → CI xanh (cả frontend + server tests) → QA → user duyệt merge. Không direct-main.
2. Mọi claim hiệu năng phải có số đo before/after cùng phương pháp.
3. File ownership rõ ràng khi nhiều worker sửa song song; thay đổi vào `game.js` phải có test pin call-site.
4. Không tuyên bố "đã kiểm chứng" cho thứ chỉ mới đọc code — phân biệt rõ: đọc tĩnh / test tự động / chạy thật / thiết bị thật.
