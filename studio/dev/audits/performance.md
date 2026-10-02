# WINDOWKILL — Performance Audit (BEFORE)

- **Ngày đo:** 2026-10-02 · **Nhánh:** `dev/deep-audit-upgrades-2026-10` @ `3b25694`
- **Người đo:** Performance Engineer, FU-DEVER Game Studio
- **Phạm vi:** chỉ ĐO + audit. Không sửa code game, không commit.

## Điều kiện đo (đọc trước khi dùng số)

- Bản local tại `~/workspace/wk-deep`, phục vụ bằng `python3 -m http.server 8971` (HTTP, không file://).
- Headless Chromium (`/opt/meta-chromium/chrome`, `--headless=new --disable-gpu` → render phần mềm SwiftShader), cửa sổ 1280×800, đo qua CDP (Network domain + Performance API + PerformanceObserver `paint`/`longtask` inject trước khi trang chạy).
- Chromium trong sandbox không tới được localhost trực tiếp → traffic đi qua relay proxy local (kiểu harness QA cũ). **Hệ quả: thời gian tuyệt đối (ms) bị phồng nhẹ do relay; so sánh tương đối giữa các lần đo vẫn hợp lệ.** Không throttle mạng/CPU trừ khi ghi rõ.
- Máy đo là máy chủ sandbox (CPU server, render phần mềm) — **không đại diện máy yếu/điện thoại thật**. Chưa kiểm chứng: mạng 3G/4G thật, Safari/Firefox, thiết bị thật.
- Mỗi chỉ số chính đo ≥2 lần; số ghi là giá trị 2 lần đo (hoặc khoảng).
- Server local (python) **không gzip, không hỗ trợ Range** → bytes đo là bytes thô; trên production Vercel có Brotli (đã kiểm chứng, xem mục 6) và Range 206 cho audio, nên bytes text thực tế trên production nhỏ hơn số local.

---

## (a) BẢNG SỐ ĐO BEFORE

### 1. Tải lần đầu — trang menu `index.html` (cold, tắt cache, vô hiệu SW, chưa tương tác)

| Chỉ số | Lần 1 | Lần 2 |
|---|---|---|
| Tổng request | 32 | 32 |
| Tổng bytes lõi (không tính audio stream) | — | **849.8 KB** |
| Audio stream đã tải thêm trong cửa sổ đo ~3.5s | +1,012.2 KB (đang tải dở `pixel-sprinter-loop.mp3`) | chưa kịp ghi nhận |
| DOMContentLoaded | 597 ms | 799 ms |
| load event | 1,063 ms | 1,143 ms |
| First (Contentful) Paint | 664 ms | 840 ms |

Chia theo loại (lần 2, chưa tính media):

| Loại | Số request | Bytes |
|---|---|---|
| Script (19 file JS) | 19 | 562.4 KB |
| Image | 3 | 213.1 KB |
| Document (index.html) | 1 | 31.7 KB |
| Other (icon-192, favicon…) | 2 | 19.8 KB |
| Stylesheet (style.css + roles.css) | 2 | 14.4 KB |
| Fetch (difficulty.config.json, API) | 2 | 7.1 KB |
| Manifest | 1 | 0.7 KB |
| Ping/beacon (analytics /api/errors) | 1 | 0.5 KB |

**Top 10 file nặng nhất trong lần tải đầu (kèm audio đang stream):**

| # | File | KB |
|---|---|---|
| 1 | `assets/music/pixel-sprinter-loop.mp3` (stream, file đầy đủ 1,036 KB) | ≥1,012 (chưa tải xong khi chốt số) |
| 2 | `assets/hero.jpg` | 94.2 |
| 3 | `js/monsters.js` | 79.6 |
| 4 | `assets/logo-lockup.webp` | 76.3 |
| 5 | `js/cinema.js` | 67.2 |
| 6 | `js/bosses.js` | 60.6 |
| 7 | `js/juice.js` | 45.2 |
| 8 | `assets/brand/dever-logo.png` | 42.7 |
| 9 | `js/audio.js` | 42.6 |
| 10 | `js/i18n.js` | 41.6 |

Tổng JS của trang menu: **573,716 B thô ≈ 173,405 B gzip** (tính local bằng gzip-9). Toàn bộ 19 script đều có `defer` (điểm tốt — không chặn parse HTML).

### 2. Tải lần đầu — trang game `game.html?diff=chill&music=0&sfx=0&sat=sim&tut=0` (cold, tắt cache/SW)

| Chỉ số | Lần 1 | Lần 2 |
|---|---|---|
| Tổng request | 29 | 29 |
| Tổng bytes | 855,307 B | 855,307 B |
| DOMContentLoaded | 650 ms | 597 ms |
| load event | 669 ms | 611 ms |
| First (Contentful) Paint | 220 ms | 168 ms |

Tổng JS trang game: **745,450 B thô ≈ 223,342 B gzip** (21 script, đều `defer`). FCP của trang game nhanh hơn menu dù JS nặng hơn (DOM menu nặng + preload hero).

### 3. Audio — `assets/music/` (đo trên đĩa + hành vi tải thật)

Trên đĩa: **15,406,744 B tổng** = mp3 7,335,436 B + ogg 8,071,308 B (4 track × 2 định dạng). Cả 4 mp3 đều **192 kbps** (ffprobe): Joyfully 93.2s / 2,237,666 B · Dog in Car 107.5s / 2,581,151 B · Heckin' Crows 61.6s / 1,480,246 B · Pixel Sprinter 43.1s / 1,036,373 B.

Hành vi thật (đọc `js/bgm.js` + đối chứng bằng network capture):

- `playAt()` **luôn nạp `.mp3` trước**; `.ogg` chỉ là fallback khi mp3 lỗi (`onTrackError`). Trong mọi lần đo bằng Chromium, **ogg không bao giờ được tải** — 8.07 MB ogg là trọng lượng chết trong repo/bản đóng gói đối với trình duyệt hiện đại (vẫn giữ giá trị fallback lý thuyết, xem đề xuất 3).
- `BGM.init()` chạy ngay khi menu mở; `settings.music` mặc định `true` → `setEnabled(true)` → `ensurePlaying()` chạy **trước mọi thao tác của user**. Dù `play()` bị autoplay policy chặn, `load()` với `preload="auto"` vẫn kéo file về: lần đo cold 1 (không hề click) đã tải **1,012 KB mp3 trong ~3.5s đầu**.
- Sau cú click đầu tiên (run audio riêng): track đang phát tải **trọn file** — `joyfully-loop.mp3` transfer 2,237,780 B. (Trên production có Range, trình duyệt tải tăng dần theo thời gian phát thay vì 1 cục, nhưng tổng bytes/track không đổi.)
- Trong 60s chơi game (mục 4): run 1 tải 1 track ≈ 2,185 KB; run 2 tải **2 track ≈ 3,967 KB** (crossfade nạp track kế tiếp). Nghe hết vòng playlist 4 track = **7.34 MB mp3**.

Thử nén lại (ffmpeg, đo thật trên 2 track mẫu):

| Track | Hiện tại (192k mp3) | mp3 128k | opus 96k |
|---|---|---|---|
| joyfully-loop | 2,237,666 B | 1,491,818 B (−33.3%) | 1,115,911 B (−50.1%) |
| dog-in-car | 2,581,151 B | 1,720,782 B (−33.3%) | — |

### 4. Gameplay — `game.html?diff=chill&music=1&sfx=1&sat=sim&tut=0`, bot tự chơi 60s (orbit WASD + lia chuột + chọn draft)

| Chỉ số | Run 1 | Run 2 |
|---|---|---|
| FPS trung bình | **59.9** | **59.5** |
| Frame time TB / median / p95 | 16.70 / 16.70 / 16.7 ms | 16.81 / 16.70 / 16.8 ms |
| Frame time max | 50 ms | 50 ms |
| Frame > 33.3 ms | 3 / 3,611 (0.1%) | 8 / 3,584 (0.2%) |
| Long tasks > 50 ms (toàn phiên, gồm lúc boot trang) | 2 task, tổng 242 ms (102 + 140 ms) | 4 task, tổng 348 ms (51–121 ms) |
| JS heap (performance.memory) | 3.1 MB → 3.8 MB | 3.1 MB → 3.8 MB |
| Tổng network phiên (gồm nhạc) | 3,026 KB | 4,807 KB |

Lưu ý: headless bị khóa vsync 60 Hz nên **không đo được headroom trên 60 FPS**; kết quả "59.5–59.9 FPS ngay cả khi render phần mềm + độ khó chill + vệ tinh sim" là tín hiệu tốt nhưng **chưa kiểm chứng** ở wave đông quái/boss, máy yếu thật, và phiên chơi dài (heap chỉ theo dõi 60s: +0.7 MB, chưa đủ kết luận leak hay không). Long task đếm từ lúc điều hướng (buffered) nên chủ yếu là parse/boot 745 KB JS, không thấy long task phát sinh giữa gameplay trong 2 run.

### 5. Service Worker — `sw.js` (VERSION `windowkill-v4`)

- Precache: **34 file, 1,173,304 B** — số đo trong Cache Storage khớp tuyệt đối với tổng dung lượng trên đĩa của danh sách `STATIC_ASSETS` (đối chứng chéo 2 cách độc lập). Danh sách hợp lý sau audit 2026-10-02: đủ JS v2.0, **không** chứa mp3/ogg (fetch handler bỏ qua media + `/api/` — đúng, tránh phình cache 7.6 MB).
- Chiến lược: HTML network-first + offline fallback; static stale-while-revalidate. Hợp lý cho game tĩnh.
- Lần tải 2 (warm, cùng profile): **30 request, 0 byte qua mạng ở page target** (SW trả từ cache; HTML vẫn network-first — navigation transferSize 32,656 B lấy từ SW context):

| Chỉ số | Lần 1 (cold + cài SW) | Lần 2 (warm) | Cải thiện |
|---|---|---|---|
| DOMContentLoaded | 894 ms | 585 ms | −35% |
| load event | 1,501 ms | 745 ms | −50% |
| First Contentful Paint | 976 ms | 588 ms | −40% |

### 6. Ảnh — kích thước hiện tại vs thử nén thật (PIL/ffmpeg tại /tmp)

| Asset | Hiện tại | Thử nghiệm | Kết quả |
|---|---|---|---|
| `assets/hero.jpg` 960×540 (nền menu, preload, opacity .28) | 96,311 B JPEG | WebP q75/q80 (PIL method 6 + ffmpeg libwebp) | **105,836–127,136 B — TO HƠN gốc** |
| `assets/og-banner.jpg` 1000×524 (chỉ dùng cho og:image meta) | 72,350 B JPEG | WebP q80 | 85,226–88,788 B — **to hơn gốc** |
| `assets/brand/dever-logo.png` 200×200 | 43,586 B PNG | WebP lossless / PNG quantize 256 màu | 33,800 B (−22%) / **7,504 B (−83%)** |
| `assets/icons/icon-512.png` | 63,739 B PNG | WebP q90 / PNG quantize 256 | 9,592 B (−85%) / 32,550 B (−49%) |
| `assets/icons/icon-192.png` | 15,012 B PNG | WebP q90 / PNG quantize 256 | 3,488 B (−77%) / 8,711 B (−42%) |
| `assets/favicon.png` 64×64 | 5,085 B PNG | PNG quantize 256 | 1,860 B (−63%) |
| `assets/logo-lockup.webp` | 77,970 B | đã là WebP | giữ nguyên |

Production đối chứng (chỉ kiểm header, 2026-10-02): Vercel trả **Brotli** cho JS/HTML (`Content-Encoding: br`); `js/game.js` tải thật 51,885 B (br) / 50,357 B (gzip) so với 172,930 B thô (−71%). Mọi asset đều `Cache-Control: public, max-age=0, must-revalidate` — không có far-future cache; SW là lớp bù chính cho khách quay lại.

---

## (b) FINDINGS (xếp theo tác động, kèm bằng chứng số)

### High

- **H1 — Audio là chi phí băng thông lớn nhất và bắt đầu tải trước khi user làm bất cứ điều gì.** Lõi trang menu chỉ 849.8 KB, nhưng mp3 đã stream +1,012 KB trong ~3.5s đầu *khi chưa hề click*; một phiên nghe hết playlist tốn 7.34 MB (192 kbps × 4 track). Khách chỉ ghé menu rồi rời vẫn tốn ~1–2.2 MB. Bằng chứng: cold run 1 (Media 1,012.2 KB, không tương tác), audio run (track đầu tải trọn 2,237,780 B), game run 2 (2 track = 3,967 KB/60s).
- **H2 — Menu tải toàn bộ engine game.** Trang menu nạp 19 script = 573,716 B thô / ~173 KB gzip, trong đó các module thuần gameplay (`monsters.js` 81,398 B, `bosses.js` 61,958 B, `cinema.js` 68,650 B, `stagefx.js` 25,126 B, `juice2.js` 26,374 B…) cộng ~295 KB thô / ~86 KB gzip mà người dùng ở menu chưa cần (menu chỉ thực sự dùng menu/meta/campaign/i18n cho panel phụ — phần phụ thuộc chính xác cần audit ở pha triển khai). Đây là khối JS lớn nhất có thể cắt khỏi first load của trang đích chính.

### Medium

- **M1 — Precache SW chứa file không bao giờ hiển thị trong trang:** `og-banner.jpg` (72,350 B, chỉ phục vụ bot scrape og:image) và `icon-512.png` (63,739 B, chỉ cần khi cài PWA) — tổng **136 KB** trong 1,173 KB precache (11.6%) bị mọi khách mới tải ngay lần đầu dù không dùng tới.
- **M2 — PNG chưa nén lượng tử.** 4 file PNG (dever-logo, icon-512, icon-192, favicon) tổng 127,422 B; thử quantize 256 màu đo thật còn 50,625 B (**−76,797 B, −60%**), đồng thời giảm precache tương ứng. Riêng dever-logo 43,586 B cho ảnh hiển thị nhỏ là quá nặng.
- **M3 — Boot trang game có long task 51–140 ms** (2–4 task/phiên, tổng 242–348 ms) do parse/exec 745 KB JS; chưa thấy ảnh hưởng FPS sau khi vào trận nhưng làm chậm thời gian sẵn sàng chơi và sẽ nặng hơn trên máy yếu (chưa kiểm chứng máy yếu thật).
- **M4 — Không có HTTP cache dài hạn trên production** (`max-age=0, must-revalidate` cho mọi asset, tên file không có hash). Khách quay lại phụ thuộc hoàn toàn vào SW; các ngữ cảnh ngoài SW (mở thẳng `game.html`, satellite) phải revalidate từng file. Tác động bị SW giảm nhẹ nên xếp Medium.

### Low

- **L1 — FPS/heap đang khỏe, không phải vấn đề.** 59.5–59.9 FPS ở render phần mềm, p95 frame 16.7–16.8 ms, heap +0.7 MB/60s. Không cần tối ưu runtime lúc này; chỉ cần giữ regression check khi thêm tính năng.
- **L2 — hero.jpg / og-banner.jpg đã nén JPEG hiệu quả; chuyển WebP làm file TO HƠN (đo thật, +10% đến +32%).** Đừng đổi định dạng mù cho 2 file này. Cơ hội AVIF **chưa kiểm chứng** (sandbox không có encoder AVIF).
- **L3 — FCP menu (664–840 ms) chậm hơn trang game (168–220 ms)** dù nhẹ JS hơn — do DOM/inline style + preload hero; nằm trong mức chấp nhận được ở mạng local, cần đo lại nếu tách JS (H2).

---

## (c) TỐI ƯU ĐỀ XUẤT (xếp theo hiệu quả/rủi ro)

| # | Hành động (file cụ thể) | Tiết kiệm ước lượng | Rủi ro | Khuyến nghị |
|---|---|---|---|---|
| 1 | **Nén lại 4 mp3 xuống 128 kbps** (`assets/music/*.mp3`, giữ nguyên tên/format; ffmpeg `-b:a 128k`) | −33% mỗi track: −2.45 MB cho trọn playlist; −0.75 MB ngay track đầu | Rất thấp: nhạc game/chiptune ở 128 kbps khó phân biệt; cần nghe thử 1 track trước khi áp hàng loạt | ✅ **LÀM NGAY** |
| 2 | **Trì hoãn nạp BGM tới tương tác đầu tiên** (`js/bgm.js`: chưa set `src`/`load()` cho tới khi `unlock` — handler pointerdown/keydown đã có sẵn; chỉ `preload="metadata"` hoặc không preload) | −1.0 đến −2.2 MB cho khách không tương tác/rời menu sớm; khách chơi game không đổi | Thấp–TB: phải giữ watchdog không giết track trước unlock (audit 2026-10-02 đã vá đúng điểm này); nhạc bắt đầu chậm hơn ~0.1–0.5s sau click đầu | ✅ **LÀM NGAY** (pha triển khai) |
| 3 | **Quantize 4 PNG** (`assets/brand/dever-logo.png`, `assets/icons/icon-512.png`, `icon-192.png`, `assets/favicon.png` — pngquant 256 màu hoặc tương đương, giữ nguyên format PNG để không phá manifest/apple-touch-icon) | −76.8 KB trên first load **và** −76.8 KB precache SW | Thấp: kiểm tra mắt thường logo (gradient có thể banding nhẹ ở dever-logo −83%); icon game nét phẳng, gần như không rủi ro | ✅ **LÀM NGAY** |
| 4 | **Bỏ `og-banner.jpg` + `icon-512.png` khỏi precache** (`sw.js` → `STATIC_ASSETS`; bump VERSION) — 2 file vẫn được SWR runtime cache khi thực sự được request | −136 KB tải lần đầu cho mọi khách mới | Thấp: trang offline không cần 2 file này; icon-512 vẫn tải on-demand khi cài PWA | ✅ **LÀM NGAY** |
| 5 | **Không đóng gói `.ogg` vào bản web/portal** (giữ file trong repo nếu muốn, loại khỏi zip portal/deploy; `assets/music/*.ogg`) | −8.07 MB dung lượng gói deploy/zip (0 byte runtime với Chrome — ogg không bao giờ được tải trong các lần đo) | Thấp–TB: mất fallback khi mp3 lỗi trên trình duyệt lạ; đã có fallback procedural phía sau. Cần quyết định của Tech Lead | Nên làm sau khi xác nhận ở pha triển khai |
| 6 | **Tách JS theo trang: lazy-load module gameplay ở menu** (`index.html`/`js/menu.js`: chỉ tải `monsters/bosses/cinema/stagefx/juice2` khi bấm Chơi, hoặc gộp bundle riêng cho `game.html`) | Tới −295 KB thô / −86 KB gzip khỏi first load menu; DCL/FCP menu cải thiện tương ứng | TB: phụ thuộc global chéo giữa các module (menu dùng meta/campaign cho panel), thứ tự `defer` nhạy cảm — cần audit phụ thuộc + test smoke đầy đủ | Làm sau, sau khi có dependency map |
| 7 | **opus 96 kbps làm nguồn chính + mp3 fallback** (`js/bgm.js` playAt: thử `.opus` trước với `canPlayType`, fallback mp3 như cơ chế ogg hiện tại) | Thêm −17% so với mốc 128k mp3 (tổng −50% so với hiện tại, đo thật trên joyfully) | TB: hỗ trợ Opus trong thẻ `<audio>` chưa đồng đều (Safari yếu hơn Chrome/Firefox) — cơ chế fallback giảm rủi ro nhưng tăng độ phức tạp | Để sau mục 1; chỉ làm nếu cần cắt thêm |
| 8 | **Cache header dài hạn cho asset tĩnh trên Vercel** (`vercel.json`: `Cache-Control: public, max-age=31536000, immutable` cho `/assets/*` — cân nhắc kèm đổi tên file khi cập nhật nội dung, vì tên file hiện không có hash) | Không giảm bytes lần đầu; giảm revalidation cho khách quay lại ngoài SW (chưa đo được số phiên thực tế — **chưa kiểm chứng** mức hưởng lợi) | TB: file không-hash + immutable = kẹt bản cũ nếu quên đổi tên; SW hiện đã bù phần lớn | Cân nhắc sau, không khẩn |

### Chưa kiểm chứng được trong sandbox (không bịa số)

- Hiệu năng trên điện thoại/máy yếu thật, mạng di động thật, Safari/Firefox (chỉ đo Chromium headless render phần mềm trên máy chủ).
- FPS ở wave đông/boss và phiên chơi dài > 60s; xu hướng heap dài hạn.
- Lợi ích AVIF cho hero.jpg (không có encoder trong môi trường đo; WebP đã đo là *tệ hơn*).
- Bytes production thực tế cho toàn trang (chỉ đối chứng được `game.js`: br 51,885 B).

*Script đo tạm lưu tại `/tmp/perf.py` (CDP harness), `/tmp/relay8896.py`, kết quả thô `/tmp/cold1.json`, `/tmp/cold2.json`, `/tmp/sw.json`, `/tmp/audio.json`, `/tmp/game1.json`, `/tmp/game2.json` — không đưa vào repo theo quy định deliverable.*
