# Deploy backend / leaderboard — đánh giá & quyết định

Ngày: 2026-10-01 · Người đánh giá: Backend team (Muse)

## Mục tiêu

Đưa leaderboard online lên production để người chơi trên `https://windowkill-web.vercel.app`
thấy bảng xếp hạng chung, thay vì chỉ leaderboard local.

## Phương án (a): Vercel serverless functions

Vercel functions là stateless, filesystem ephemeral → **SQLite của backend hiện tại không persist**
(mỗi request có thể đọc DB khác nhau, dữ liệu "bốc hơi"). Muốn leaderboard chung phải dùng DB ngoài:

| Dịch vụ | Kết nối từ Vercel | Vấn đề |
|---|---|---|
| Turso (libsql) | `@libsql/client` + `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` | Cần **signup/tạo database** → cần tài khoản user |
| Neon (Postgres) | `@neondatabase/serverless` + `DATABASE_URL` | Cần **signup/tạo project** → cần tài khoản user |
| Supabase (Postgres) | `postgres` / supabase-js + connection string | Cần **signup/tạo project** → cần tài khoản user |
| Upstash Redis (REST) | `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` | Cần **signup/tạo database** → cần tài khoản user |

**Kết luận (a): KHÔNG tự triển khai được.** Mọi hướng đều đòi tạo tài khoản / lấy token,
mà theo ràng buộc thì tuyệt đối không tự tạo tài khoản dịch vụ, không xin OTP, không hardcode secret.

## Phương án (b): VPS tự quản

Thuê/tận dụng VPS, chạy `node server/src/index.js` + reverse proxy (Caddy/Nginx), trỏ
`window.WK_API_BASE` hoặc `localStorage.wk_api_base` về VPS.

**Kết luận (b): KHÔNG khả thi hiện tại.** Cần SSH access / thông tin server mà user chưa cấp.
Khi nào user cấp VPS + SSH key, backend chạy được nguyên trạng (zero-dep, systemd unit đã có
sẵn `server/windowkill-backend.service`).

## Phương án (c): giữ backend optional self-host + leaderboard local-first (ĐÃ CHỌN)

- Backend Node/SQLite giữ nguyên triết lý **optional**: ai muốn leaderboard chung thì tự host
  (`cd server && npm start`), hướng dẫn đã có trong `server/README.md`.
- Client (`js/api.js`) đã graceful-degrade: không có backend → leaderboard localStorage, game chạy 100%.
- Không tốn chi phí, không cần tài khoản thứ ba, không rủi ro secret.

## Đã chuẩn bị sẵn cho tương lai

- `api/leaderboard.js` — **adapter scaffold** cho Vercel serverless functions: đọc cấu hình từ
  ENV (`WK_LEADERBOARD_DRIVER`, `WK_LEADERBOARD_URL`, `WK_LEADERBOARD_TOKEN`), trả `503
  leaderboard_not_configured` khi chưa cấu hình, và có sẵn khung code + comment hướng dẫn cắm
  driver (Turso/Neon/Supabase) khi user cấp credentials. **Không chứa secret nào.**
- Schema DB (`profiles`, `scores`) đã tách lớp `openDb()` nên việc port sang Postgres sau này
  chỉ là viết lại adapter, không đụng client.

## Cần gì từ user để có leaderboard online thật

1. Chọn 1 trong: Turso / Neon / Supabase / Upstash (khuyến nghị **Turso** — gần SQLite nhất,
   free tier đủ cho CLB).
2. Tự tạo database, lấy `URL` + `TOKEN`, set làm Environment Variables trên Vercel
   (`WK_LEADERBOARD_DRIVER=turso`, `WK_LEADERBOARD_URL=...`, `WK_LEADERBOARD_TOKEN=...`).
3. Báo backend team → team cắm driver vào `api/leaderboard.js` (~30 phút, không cần thêm quyền gì).

**Hoặc** phương án (b): cấp VPS + SSH → team deploy backend hiện tại nguyên trạng.
