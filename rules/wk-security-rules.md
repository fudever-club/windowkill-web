# WK Security Rules — Quy tắc bảo mật bắt buộc

Nguồn đầy đủ: `SECURITY.md` (audit 2026-10-01) và skill `wk-qa`.

## Web

1. **CSP** trên mọi trang HTML (`index.html`, `game.html`) qua meta tag.
   Không whitelist domain lạ; ưu tiên tài nguyên nội bộ.
2. **Cấm inline event handler** (`onclick=`, `onerror=`...). Gắn listener bằng
   `addEventListener` trong file JS.
3. **BroadcastChannel `windowkill_bus`**: mọi giá trị số từ message `gameover`
   phải ép kiểu bằng `num()`/`int0()` (fallback `0` nếu không phải số hữu hạn)
   **trước khi** lưu localStorage.
4. Render: tên profile và mọi chuỗi do người dùng nhập → `textContent`, không
   `innerHTML`. Số liệu sanitize lại lúc đọc (defense in depth).
5. Backend (`server/`): validate kiểu/miền/độ dài mọi input; giới hạn body JSON
   64 KB; prepared statement cho mọi query; rate limit 120 GET + 30 write/phút/IP;
   security headers; CORS deny-by-default (`WK_CORS_ORIGINS`).

## Electron

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- `setWindowOpenHandler`: chỉ cho phép URL `file:` của app.
- Chặn `will-navigate` ra ngoài origin của app.

## Bí mật & supply chain

- **Không bao giờ** commit token, password, API key, OTP. CI chạy secret scan.
- `electron/` chạy `npm audit --audit-level=moderate` trong CI.
- Không thêm dependency mới khi chưa được Lead Engineering duyệt
  (ưu tiên zero-dependency như backend hiện tại).

## Báo cáo lỗ hổng

Phát hiện issue bảo mật → tạo GitHub issue nhãn `security`, không bàn chi tiết
trong PR public. Fix theo mẫu S1–S8 trong `SECURITY.md`.
