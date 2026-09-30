# MCP Server Survey — FU-DEVER Game Studio / windowkill-web

Ngày khảo sát: 2026-10-01 · Người thực hiện: DevOps/Release subagent
Trạng thái sandbox: `mcp-cli servers` → rỗng (`{"servers":[]}`).

> ⚠️ **Nguyên tắc an toàn (theo yêu cầu lead):** TUYỆT ĐỐI KHÔNG tự kết nối MCP
> server nào cần OAuth/auth của user khi chưa được duyệt. Tài liệu này chỉ
> **liệt kê + hướng dẫn**. Muốn kết nối server nào, lead nhắn
> `"OK kết nối <tên-server>"` thì mới làm.

## Cách kết nối trong môi trường này

Có 2 cơ chế riêng biệt, đừng nhầm lẫn:

| Cơ chế | Lệnh kiểm tra | Ghi chú |
|---|---|---|
| `mcp-cli` — registry "release-reviewed remote MCP connectors" | `mcp-cli servers` (đang rỗng), `mcp-cli auth-url <SERVER>` | Server phải nằm trong danh sách release-reviewed mới xin được link OAuth qua `auth-url` |
| `vercel` — helper OAuth riêng cho Vercel MCP (KHÔNG phải Vercel Deploy CLI) | `vercel status`, `vercel authorize-url`, `vercel exchange-code <code>`, `vercel list-tools`, `vercel call-tool` | `vercel status` hiện báo `authenticated: true` (do môi trường cài sẵn, không phải do agent tự kết nối) |

⚠️ **Cạm bẫy đã xác minh:** binary `vercel` trong PATH ở đây KHÔNG hiểu
`vercel deploy` / `vercel --version` — nó là connector MCP, không phải CLI
deploy cổ điển. Script `scripts/deploy-vercel.sh` đã xử lý phân biệt 2 thứ này.

## Bảng tổng hợp

| # | MCP Server | Dùng để làm gì cho windowkill-web | Cần OAuth user? | Độ ưu tiên |
|---|---|---|---|---|
| 1 | **Vercel** (official) | Quản lý production: xem deployment, build log, runtime log/error, domain, tra cứu docs Vercel | ✅ Có | ⭐ P0 |
| 2 | **Sentry** (official) | Error monitoring cho game JS (game dùng `window.resizeTo/moveBy` rất dễ lỗi theo trình duyệt) | ✅ Có | ⭐ P0 |
| 3 | **Supabase** (official) | Postgres cloud cho **leaderboard toàn cục** (repo đã có `server/` SQLite local — Supabase là bước cloud tiếp theo) | ✅ Có | P1 |
| 4 | **GitHub** (official) | Bổ sung cho `gh` CLI: PR, issue, CI run, code search (repo `fudever-club/windowkill-web`) | ✅ Có | P1 |
| 5 | **PostHog** (official) | Product analytics: event game (wave đạt được, upgrade đã pick, death, retention) | ✅ Có (hoặc personal API key) | P2 |
| 6 | **Neon** (official) | Postgres serverless thay Supabase nếu chỉ cần DB thuần (nhẹ hơn) | ✅ Có (API key) | P2 |
| 7 | **Turso** (official) | SQLite phân tán (libSQL) — hợp với `server/` SQLite hiện tại nhất | ✅ Có (API token) | P2 |
| 8 | **Cloudflare** (official) | DNS/WAF/R2/Workers — chỉ cần khi rời Vercel hoặc cần CDN/WAF riêng | ✅ Có | P3 |

> **Plausible:** không có MCP server chính thức (đã kiểm tra). Nếu studio thích
> Plausible vì nhẹ/privacy-friendly thì dùng dashboard + API thường, không qua MCP.
> Muốn analytics qua MCP → chọn **PostHog**.

---

## 1. Vercel MCP — P0 ⭐

**URL chính thức:** `https://mcp.vercel.com`
**Dùng để làm gì cho dự án:**
- Tra cứu tài liệu Vercel (`search_vercel_documentation`)
- Liệt kê team/project, xem deployment, build log, runtime log/error của
  `windowkill-web` production (`get_git_deployment_context`, `get_runtime_logs`, `get_runtime_errors`)
- Quản lý domain, tạo project

**Cần OAuth của user?** ✅ Có — OAuth vào tài khoản Vercel `dangquangnhat1504-4288`.
**Cách kết nối (trong sandbox này):**
```bash
vercel authorize-url        # in ra URL, user mở browser duyệt
vercel exchange-code <CODE> # đổi code lấy token
vercel status               # kiểm tra: authenticated: true
vercel list-tools           # xem tool khả dụng
```
Trên MCP client thông thường (Claude Code/Cursor): thêm
`{"mcpServers":{"vercel":{"type":"http","url":"https://mcp.vercel.com"}}}` rồi duyệt OAuth.
**Ghi chú sandbox:** `vercel status` đã báo `authenticated: true` do môi trường dựng
sẵn — agent KHÔNG tự kết nối thêm gì. Không dùng `vercel disconnect` khi chưa được duyệt.

## 2. Sentry MCP — P0 ⭐

**URL chính thức:** `https://mcp.sentry.dev/mcp`
**Dùng để làm gì cho dự án:**
- Xem issue/crash report từ production theo thời gian thực: game dùng
  `window.resizeTo()`/`window.moveBy()` — các trình duyệt chặn/hành xử khác nhau,
  Sentry là cách duy nhất biết người chơi thật đang gặp lỗi gì.
- Truy vấn event, release, xem stack trace; gắn với deploy để biết bản nào gây lỗi.

**Cần OAuth của user?** ✅ Có — OAuth vào tài khoản Sentry của studio.
**Cách kết nối:**
- MCP client: `{"mcpServers":{"sentry":{"type":"http","url":"https://mcp.sentry.dev/mcp"}}}` → duyệt OAuth.
- Trong sandbox: khi Sentry nằm trong danh sách release-reviewed,
  `mcp-cli auth-url sentry` để xin link OAuth (hiện `mcp-cli servers` đang rỗng nên chưa làm được).
- **Điều kiện tiên quyết (việc của dev, không phải MCP):** game cần nhúng Sentry SDK
  (CDN script + DSN) thì mới có dữ liệu để MCP đọc — đây là thay đổi code, cần lead duyệt riêng.

## 3. Supabase MCP — P1

**URL chính thức:** `https://mcp.supabase.com/mcp`
**Dùng để làm gì cho dự án:**
- Quản lý Postgres cloud cho **leaderboard toàn cục**: tạo bảng `scores`,
  viết/đọc query, xem log, deploy Edge Function làm API submit-score.
- Repo đã có `server/` (Node + SQLite local) — Supabase là ứng viên số 1 khi muốn
  leaderboard online mà không tự vận hành server.

**Cần OAuth của user?** ✅ Có — OAuth vào tài khoản Supabase của studio.
**Cách kết nối:**
- MCP client: `{"mcpServers":{"supabase":{"type":"http","url":"https://mcp.supabase.com/mcp"}}}` → duyệt OAuth, chọn org/project.
- Có thể giới hạn phạm vi qua query param, ví dụ chỉ đọc + 1 project:
  `https://mcp.supabase.com/mcp?project_ref=<project-ref>&read_only=true&features=database,docs`
- Tài liệu: https://supabase.com/docs/guides/ai-tools/mcp · repo https://github.com/supabase/mcp

## 4. GitHub MCP — P1

**URL chính thức:** `https://api.githubcopilot.com/mcp/`
**Dùng để làm gì cho dự án:**
- Đọc/tạo PR, issue, xem GitHub Actions run (repo `fudever-club/windowkill-web`
  đang dùng Actions CI), code search — bổ sung cho `gh` CLI.

**Cần OAuth của user?** ✅ Có — OAuth vào tài khoản GitHub của studio.
**Cách kết nối:**
- MCP client: `{"mcpServers":{"github":{"type":"http","url":"https://api.githubcopilot.com/mcp/"}}}` → duyệt OAuth.
- Hoặc local stdio: `npx -y @github/mcp-server` với `GITHUB_PERSONAL_ACCESS_TOKEN`.
**Ghi chú sandbox:** `gh` CLI đã cài nhưng **chưa login**
(`gh auth status` → not logged into any GitHub hosts). Ưu tiên thấp hơn Vercel/Sentry
vì workflow git hiện tại lead tự làm; khi cần thì lead chạy `gh auth login`.

## 5. PostHog MCP — P2

**URL chính thức:** `https://mcp.posthog.com/mcp`
**Dùng để làm gì cho dự án:**
- Product analytics cho game: định nghĩa event (`wave_completed`, `upgrade_picked`,
  `game_over`, `session_start`), xem funnel/retention, truy vấn insight bằng ngôn ngữ tự nhiên.

**Cần OAuth của user?** ✅ Có — OAuth PostHog, hoặc personal API key.
**Cách kết nối:**
- MCP client: `{"mcpServers":{"posthog":{"type":"http","url":"https://mcp.posthog.com/mcp"}}}` → duyệt OAuth hoặc nhập API key.
- **Điều kiện tiên quyết:** game cần nhúng PostHog snippet + định nghĩa event —
  thay đổi code, cần lead duyệt riêng.

## 6. Neon MCP — P2

**Package chính thức:** `@neondatabase/mcp-server-neon` (repo `neondatabase/mcp-server-neon`)
**Dùng để làm gì cho dự án:**
- Quản lý Postgres serverless (tạo DB/branch, chạy SQL) nếu chọn Neon thay vì
  Supabase cho leaderboard — nhẹ hơn, không cần Auth/Storage của Supabase.

**Cần OAuth/API key của user?** ✅ Có — Neon API key (`NEON_API_KEY`).
**Cách kết nối:** local stdio —
`npx -y @neondatabase/mcp-server-neon` với env `NEON_API_KEY=<key>`.
(Chưa có remote HTTP chính thức như Supabase tại thời điểm khảo sát.)

## 7. Turso MCP — P2

**Package:** `@tursodatabase/mcp-server-turso` (cần kiểm tra lại tên package chính
thức tại thời điểm triển khai)
**Dùng để làm gì cho dự án:**
- libSQL/SQLite phân tán — **khớp nhất với `server/` SQLite hiện tại** của repo:
  migrate schema/SQLite local lên Turso gần như nguyên vẹn.

**Cần auth của user?** ✅ Có — Turso API token (`TURSO_API_TOKEN`).
**Cách kết nối:** local stdio qua npx với token; chi tiết theo README của package
tại thời điểm triển khai.

## 8. Cloudflare MCP — P3

**Tài liệu:** https://developers.cloudflare.com/agents/model-context-protocol/
(nhiều remote server theo từng sản phẩm: Workers, R2, DNS, AI Gateway…)
**Dùng để làm gì cho dự án:**
- Hiện tại production deploy trên Vercel → Cloudflare chưa cần.
- Chỉ xem xét khi: cần WAF/bot-fight cho leaderboard API, lưu asset game lên R2,
  hoặc migrate khỏi Vercel sang Workers/Pages.

**Cần OAuth của user?** ✅ Có — OAuth Cloudflare (hỗ trợ Dynamic Client Registration).
**Cách kết nối:** theo từng sản phẩm trong docs Cloudflare; ví dụ tổng quát
`https://mcp.cloudflare.com/mcp` → duyệt OAuth.

---

## Khuyến nghị thứ tự triển khai

1. **Vercel (P0)** — phục vụ trực tiếp release/production đang chạy.
2. **Sentry (P0)** — song song với Vercel; cần nhúng SDK vào game trước (việc dev).
3. **Supabase (P1)** — khi lead quyết định làm leaderboard online.
4. **GitHub (P1)** — khi muốn agent hỗ trợ PR/CI (hiện `gh` chưa login).
5. **PostHog (P2)** — khi game đã ổn định và cần hiểu hành vi người chơi.
6. **Neon/Turso (P2)** — chỉ chọn 1 trong 3 (Supabase/Neon/Turso), không cần cả 3.
7. **Cloudflare (P3)** — khi có nhu cầu infra vượt khỏi Vercel.

## Quy trình duyệt kết nối (đề xuất)

1. Lead nhắn: `"OK kết nối <tên-server>"` (+ tài khoản nào, phạm vi read-only hay full).
2. Agent chạy flow OAuth tương ứng (`vercel authorize-url` / `mcp-cli auth-url <server>` …),
   user duyệt trên browser của mình.
3. Agent verify bằng lệnh read-only (`vercel status`, `mcp-cli status <server>`).
4. Ghi lại vào file này: ngày kết nối, tài khoản, phạm vi.

## Nhật ký kết nối

| Ngày | Server | Tài khoản | Phạm vi | Ghi chú |
|---|---|---|---|---|
| 2026-10-01 | (chưa có) | — | — | `mcp-cli servers` rỗng; `vercel` helper báo authenticated sẵn từ môi trường, agent không tự kết nối thêm |
