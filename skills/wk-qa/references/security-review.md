# Security Review — tóm tắt 8 finding S1–S8 (SECURITY.md, audit 2026-10-01)

## S1 — XSS qua BroadcastChannel (🔴 Cao) — ĐÃ FIX
`menu.js` nhận `gameover` qua `BroadcastChannel`, lưu `score/wave/kills/timeSec` thẳng vào localStorage rồi render bằng `innerHTML` → tab cùng origin có thể gửi chuỗi HTML/JS giả dạng số. **Fix:** thêm `num()`/`int0()` ép mọi giá trị về `Number` (fallback `0`) ngay trong handler, trước khi lưu.

## S2 — localStorage cũ bị "đầu độc" (🟡 Trung bình) — ĐÃ FIX
Bản cũ có thể đã ghi chuỗi HTML vào localStorage, vẫn render qua `innerHTML` sau khi fix S1. **Fix:** `renderScores()`/`renderStats()` sanitize lại bằng `num()`/`int0()` lúc đọc (defense in depth). Tên profile vốn dùng `textContent` — an toàn.

## S3 — Thiếu Content-Security-Policy (🟡 Trung bình) — ĐÃ FIX
**Fix:** thêm meta CSP cho cả `index.html` và `game.html`: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'`.

## S4 — Inline event handler (🟢 Thấp) — ĐÃ FIX
2 `onerror="..."` trên `<img>` bị CSP `script-src 'self'` chặn. **Fix:** bỏ attribute, thay bằng `addEventListener("error", …)` trong `js/menu.js`. CI có bước grep chặn inline handler tái xuất hiện.

## S5 — Electron `setWindowOpenHandler` cho phép mọi URL (🟡 Trung bình) — ĐÃ FIX
Trước đây `allow` mọi URL — nội dung ngoài ý muốn có thể chạy trong cửa sổ Electron. **Fix:** `isAllowedAppUrl()` chỉ cho `file:` trong thư mục `app/` đóng gói; còn lại `deny`.

## S6 — Electron không chặn `will-navigate` ra ngoài (🟢 Thấp) — ĐÃ FIX
**Fix:** `webContents.on("will-navigate")` → `preventDefault()` mọi URL ngoài `file:` trong thư mục app.

## S7 — Cấu hình Electron cơ bản — ĐẠT
`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, không `shell.openExternal`, không preload lạ, menu mặc định tắt. Không cần fix.

## S8 — Quét secret — ĐẠT
Grep toàn repo (`js/html/json/md/yml`, trừ `node_modules`, `dist`, `package-lock`) với pattern api_key/secret/password/bearer/private-key: không phát hiện. Không có file `.env`.

## Ghi chú audit
- Bug kèm (đã fix): độ khó "Khắc nghiệt" không có hiệu lực — launcher gửi `diff=hard` nhưng `game.js` chỉ có key `hardcore` → fix bằng alias `DIFFS.hard = DIFFS.hardcore`.
- Khuyến nghị tiếp theo: chuyển khối `<style>` lớn vào `css/` để bỏ `'unsafe-inline'`; thêm `rel="noopener"` cho link ngoài sau này; kiểm thử OWASP ZAP định kỳ trên bản deploy Vercel.
