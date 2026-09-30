# SECURITY.md — WINDOWKILL Web Edition

Audit thực hiện: 2026-10-01 · Phạm vi: `index.html`, `game.html`, `js/*.js`, `electron/main.js`, workflow CI, quét secret.

## Tổng quan

| # | Finding | Mức độ | Trạng thái |
|---|---------|--------|------------|
| S1 | XSS qua BroadcastChannel → localStorage → innerHTML (menu.js) | 🔴 Cao | ✅ Đã fix |
| S2 | localStorage cũ bị "đầu độc" vẫn render qua innerHTML | 🟡 Trung bình | ✅ Đã fix |
| S3 | Thiếu Content-Security-Policy | 🟡 Trung bình | ✅ Đã fix |
| S4 | Inline event handler (`onerror`) — xung đột CSP | 🟢 Thấp | ✅ Đã fix |
| S5 | Electron `setWindowOpenHandler` cho phép mọi URL | 🟡 Trung bình | ✅ Đã fix |
| S6 | Electron không chặn `will-navigate` ra ngoài | 🟢 Thấp | ✅ Đã fix |
| S7 | Cấu hình Electron cơ bản | — | ✅ Đạt (không cần fix) |
| S8 | Không phát hiện secret/token trong repo | — | ✅ Đạt |

> Ghi chú: `npm audit` không chạy được trong môi trường dev hiện tại (registry nội bộ chặn
> endpoint audit). CI trên GitHub Actions chạy `npm audit --audit-level=moderate` cho `electron/`.

## Chi tiết & cách fix

### S1 — XSS qua BroadcastChannel (🔴 Cao) — ĐÃ FIX
`menu.js` nhận message `gameover` từ popup qua `BroadcastChannel("windowkill_bus")`,
lưu `m.score / m.wave / m.kills / m.timeSec` thẳng vào localStorage rồi render bằng
`innerHTML` trong `renderScores()`/`renderStats()`. Bất kỳ tab cùng origin nào
(hoặc localStorage bị ghi đè thủ công) cũng có thể gửi chuỗi HTML/JS giả dạng
con số → thực thi script trong ngữ cảnh launcher.

**Fix:** thêm `num()` / `int0()` — ép mọi giá trị về `Number`, fallback `0` nếu
không phải số hữu hạn — áp dụng ngay trong handler `gameover`, trước khi lưu.

### S2 — Dữ liệu localStorage cũ bị đầu độc (🟡) — ĐÃ FIX
Kể cả sau S1, localStorage ghi từ bản cũ vẫn có thể chứa chuỗi HTML.
**Fix:** `renderScores()` và `renderStats()` sanitize lại bằng `num()`/`int0()`
ngay lúc đọc (defense in depth). Tên profile đã dùng `textContent` từ đầu — an toàn.

### S3 — Thiếu CSP (🟡) — ĐÃ FIX
Thêm meta CSP cho cả `index.html` và `game.html`:
```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
img-src 'self' data:; connect-src 'self'; object-src 'none';
base-uri 'self'; frame-ancestors 'self'
```
`style-src 'unsafe-inline'` được giữ lại vì codebase dùng nhiều inline style;
`script-src` giữ `'self'` thuần (không inline script).

### S4 — Inline event handler (🟢) — ĐÃ FIX
`index.html` có 2 `onerror="..."` trên `<img>` — CSP `script-src 'self'` sẽ chặn.
**Fix:** bỏ attribute, thay bằng `data-hide-onerror` + `addEventListener("error", …)`
trong `js/menu.js`. CI có bước grep chặn inline handler tái xuất hiện.

### S5 — Electron mở popup với mọi URL (🟡) — ĐÃ FIX
`setWindowOpenHandler` trước đây `allow` mọi URL — nếu game gọi `window.open()`
với URL ngoài ý muốn, nội dung đó chạy trong cửa sổ Electron (có bridge).
**Fix:** thêm `isAllowedAppUrl()` — chỉ `file:` nằm trong thư mục `app/` đóng gói
mới được mở; còn lại `deny`.

### S6 — Không chặn điều hướng (🟢) — ĐÃ FIX
Thêm `webContents.on("will-navigate")` → `preventDefault()` với mọi URL ngoài
`file:` trong thư mục app.

### S7 — Cấu hình Electron cơ bản — ĐẠT
`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`,
không dùng `shell.openExternal`, không có preload lạ, menu mặc định đã tắt.
Không phát hiện remote module hay `enableRemoteModule`.

### S8 — Quét secret — ĐẠT
Grep toàn repo (`js/html/json/md/yml`, trừ `node_modules`, `dist`, `package-lock`)
với pattern api_key/secret/password/bearer/private-key: không phát hiện.
Không commit file `.env` (không tồn tại).

## Bug ngoài phạm vi bảo mật (đã fix kèm)
- **Độ khó "Khắc nghiệt" không có hiệu lực:** launcher gửi `diff=hard` nhưng
  `game.js` chỉ định nghĩa key `hardcore` → rơi về `normal`. Fix: `DIFFS.hard =
  DIFFS.hardcore` (alias) trong `js/game.js`.

## Khuyến nghị tiếp theo (chưa làm)
- Chuyển khối `<style>` lớn trong `index.html`/`game.html` vào `css/` để bỏ
  `'unsafe-inline'` khỏi `style-src`.
- Thêm `rel="noopener"` nếu sau này có link ngoài.
- Cân nhắc `trusted types` nếu mở rộng phần render HTML động.
- Chạy kiểm thử OWASP ZAP định kỳ trên bản deploy Vercel.
