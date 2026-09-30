# QA CHECKLIST — WINDOWKILL Web Edition (Computer-Use)

Dành cho người điều phối chạy bằng **browser thật** (Chromium/Chrome desktop +
mobile emulation). Game dùng popup thật làm "thanh máu", nên nhiều bước cần
quan sát hành vi cửa sổ OS-level.

Chuẩn bị:
- Mở `https://windowkill-web.vercel.app` (hoặc `http://localhost:8080` nếu test local).
- Cho phép popup cho site. Mở DevTools → Console để bắt lỗi JS.
- Mỗi bước: PASS/FAIL + chụp màn hình.

## 1. Launcher — tải trang
- [ ] 1.1 Trang tải không lỗi console. Logo FU-DEVER, logo WINDOWKILL, hero art hiển thị.
- [ ] 1.2 Favicon hiển thị đúng trên tab.
- [ ] 1.3 CSP không chặn tài nguyên (không có lỗi "Refused to load" trong console).
- [ ] 1.4 Responsive: thu nhỏ viewport 360px — layout không vỡ, nút bấm được.

## 2. Tài khoản người dùng (profiles)
- [ ] 2.1 Bấm "＋ Tài khoản mới" → ô nhập hiện, nhập tên `QA<Tester>` → Tạo → chip profile xuất hiện, active.
- [ ] 2.2 Nhập tên có ký tự HTML `<img src=x onerror=alert(1)>` → Tạo → tên hiển thị dạng text thuần, KHÔNG thực thi (kiểm tra console, DOM).
- [ ] 2.3 Tạo thêm 2 profile → chuyển active qua lại → kỷ lục/thống kê hiển thị đúng từng profile.
- [ ] 2.4 Xóa 1 profile → confirm dialog hiện → xóa → dữ liệu localStorage của profile đó biến mất.
- [ ] 2.5 Reload trang → profile + cài đặt còn nguyên (localStorage persist).

## 3. Cài đặt
- [ ] 3.1 Toggle nhạc/SFX/rung: bật/tắt, reload vẫn nhớ trạng thái.
- [ ] 3.2 Đổi độ khó Chill → Thường → Khắc nghiệt: nút sáng đúng, reload nhớ.

## 4. Mở popup game
- [ ] 4.1 Chưa có profile → bấm CHƠI NGAY → yêu cầu tạo tài khoản (không mở popup).
- [ ] 4.2 Có profile → CHƠI NGAY → popup `game.html` mở đúng 980×700, focus vào popup.
- [ ] 4.3 Chặn popup trong browser → bấm CHƠI NGAY → cảnh báo "đang chặn popup" hiển thị.

## 5. Gameplay 60 giây (desktop)
- [ ] 5.1 WASD/di chuyển tàu mượt; chuột ngắm, đạn bắn ra đúng hướng chuột.
- [ ] 5.2 Quái spawn theo wave; banner wave hiển thị.
- [ ] 5.3 Quái chewer bám viền → cửa sổ **thu nhỏ thật** (đo outerWidth giảm) HOẶC fallback "đấu trường ảo" bật với thông báo (tùy browser cho phép resize hay không — ghi lại hành vi thực tế).
- [ ] 5.4 Bắn đạn vào viền → cửa sổ bị đẩy bay (moveBy) / quái văng ra.
- [ ] 5.5 Nhặt gem XP → lên cấp → draft 3 lá nâng cấp hiện, chọn 1 lá → hiệu ứng áp dụng.
- [ ] 5.6 Pickup tim/khiên/nuke rơi ra và nhặt được (nếu có).
- [ ] 5.7 P/Esc → pause menu → Tiếp tục / Chơi lại / Về menu đều hoạt động.
- [ ] 5.8 Nhạc nền + SFX phát (sau khi đã tương tác — autoplay policy).

## 6. Game-over & report
- [ ] 6.1 Để quái gặm cửa sổ tới mức tối thiểu (hoặc hết máu) → màn hình GAME OVER: điểm, wave, kills, thời gian.
- [ ] 6.2 "Kỷ lục mới!" hiện khi phá kỷ lục profile.
- [ ] 6.3 Đóng popup → launcher tự cập nhật kỷ lục & thống kê (không cần reload).
- [ ] 6.4 Chơi lại (R) → ván mới bắt đầu sạch.

## 7. Boss
- [ ] 7.1 Sống tới wave 5 → boss spawn, có thanh máu boss, đạn quạt, gọi quái.
- [ ] 7.2 Hạ boss → thưởng, game tiếp tục wave 6.

## 8. Mobile (device emulation 390×844, touch)
- [ ] 8.1 2 joystick ảo hiện; joystick trái di chuyển, phải ngắm+bắn.
- [ ] 8.2 Không scroll trang khi chơi (touch-action none).
- [ ] 8.3 Draft nâng cấp / pause bấm được bằng touch.

## 9. Độ khó
- [ ] 9.1 Chơi 1 ván ngắn ở "Khắc nghiệt" → quái trâu/nhanh hơn rõ rệt so với Chill (kiểm chứng fix DIFFS.hard).

## 10. Hiệu năng
- [ ] 10.1 FPS ổn định khi ~30 quái + đạn trên màn hình (không drop < 30fps kéo dài).
- [ ] 10.2 Không rò rỉ: chơi 5 phút, memory trong Task Manager không tăng vô hạn.

## 11. Chụp màn hình bắt buộc
1. Launcher desktop (full).
2. Draft 3 nâng cấp khi lên cấp.
3. Boss wave 5.
4. Game over + kỷ lục mới.
5. Mobile emulation đang chơi.

## Tiêu chí đạt
Không có FAIL ở mục 1–4, 6; mục 5.3 ghi rõ hành vi thực tế của browser test.
Mọi lỗi console JS đều phải được log lại kèm bước tái hiện.

## 12. Kiểm thử tự động (node:test) — QA sở hữu, chạy không cần browser
Chạy: `node --test tests/*.test.js` (web) và `node --test server/tests/*.test.js` (API backend).
Quy ước: test cho file/chức năng team khác đang phát triển → SKIP có lý do rõ ràng (không fail);
khi file/marker xuất hiện và đúng chuẩn → test tự bật và phải PASS.

### 12.1 tests/smoke.test.js (32 tests) — PASS
Assets, tham chiếu HTML, syntax JS, hằng số gameplay, chống XSS (menu.js),
bảo mật Electron main.js, CI workflow.

### 12.2 tests/pwa.test.js (21 tests) — PASS (team frontend đã giao file)
- manifest.webmanifest: tồn tại, JSON hợp lệ, đủ name / icons 192x192+512x512 / theme_color, icon files resolve được.
- sw.js: tồn tại, dùng `caches`, có `fetch` + `install` event listener.
- offline.html: trang HTML có nội dung offline (chấp nhận tiếng Việt "mất kết nối").
- robots.txt: có directive `User-agent`.
- sitemap.xml: XML hợp lệ, có `<urlset>` và `<loc>`.
- index.html + game.html: có `<link rel="manifest">` và `<meta name="theme-color">`.

### 12.3 tests/game-logic.test.js (11 tests) — 10 PASS, 1 SKIP
- "pure function export": SKIP theo thiết kế — đề xuất team gameplay tách
  `js/logic.js` export `{ MONSTER_REGISTRY, ACTS }` để test động trong tương lai
  (hiện game.js là browser script thuần; QA không sửa file của team khác).
- MONSTER_REGISTRY: tồn tại, ≥ 10 loại quái — PASS.
- ACTS: tồn tại, đủ 3 act — PASS.
- Pickup: đủ 2 pickup mới (magnet, overdrive trong PICKUP_DEFS, ngoài heart/shield/nuke) — PASS.
- Regression core loop/wave/XP-draft/combo (static, luôn chạy) — PASS.

### 12.4 tests/analytics.test.js (6 tests) — PASS (team dữ liệu đã giao js/analytics.js)
- Không canvas fingerprinting (cấm `toDataURL`/`getImageData`).
- Không gửi raw `navigator.userAgent`.
- Không đọc/ghi `document.cookie`.
- Tôn trọng Do Not Track (đọc `navigator.doNotTrack === "1"` và gate tracking).

### 12.5 CI (.github/workflows/ci.yml)
- 2 job cũ `web` và `electron-audit` giữ nguyên.
- Job mới `qa-extra`: chạy `node --test` cho 3 file test mới (12.2–12.4),
  validate `manifest.webmanifest` bằng node (skip nếu file chưa có),
  quét secret trong code (fail nếu match pattern trong step "No secrets in code";
  loại trừ `.git`, `node_modules`, `dist/`, và chính file workflow chứa literal pattern).

### 12.6 server/tests/api.test.js (10 tests) — PASS
Health + security headers, profiles CRUD/validation, scores/leaderboard/stats,
xóa profile cascade, 404 JSON, rate limiter.
