# WINDOWKILL Web Edition — Lộ trình phát triển (Phases)

> Fan-made, lấy cảm hứng từ Windowkill. Không sao chép asset/nội dung có bản quyền.

## Phase 1 — Web MVP ✅ (2026-09-30)
- Twin-stick shooter trong popup; cửa sổ popup = thanh máu (resizeTo/moveTo + fallback đấu trường ảo)
- 6 loại quái, boss mỗi 5 wave, 12 nâng cấp, pickup heart/shield/nuke, combo, XP/level
- Launcher + cài đặt + thống kê + kỷ lục localStorage; mobile 2 joystick; nhạc/SFX Web Audio

## Phase 2 — Branding + Accounts + .exe + Deploy ✅ (2026-09-30)
- Retheme FU-DEVER (#0066CC / #004C99 / #0080FF, "WORK HARD - PLAY HARD")
- Hệ thống profile người dùng local (tạo/chọn/xóa, kỷ lục riêng từng profile)
- Assets custom (hero, logo lockup, favicon, OG banner)
- Electron build → `windowkill-web-win32-x64.zip` (152MB portable)
- Deploy Vercel production: https://windowkill-web.vercel.app
- GitHub: https://github.com/fudever-club/windowkill-web
- Release v1.0.0 (4 part .exe): https://github.com/fudever-club/windowkill-web/releases/tag/v1.0.0

## Phase 3 — Deep Development 🔄 (đang thực hiện)
- **Icons**: toàn bộ icon lấy từ svgl.app (SVG local, có manifest), không dùng icon set có sẵn
- **UI audit**: rà soát toàn bộ giao diện theo branding FU-DEVER, sửa lệch chuẩn
- **Backend**: Node + SQLite trên máy — profiles, leaderboard, stats API; frontend tự fallback localStorage khi offline
- **QA/Security/CI-CD**: GitHub Actions CI, security audit (Electron + XSS + CSP), system tests (node:test), checklist kiểm thử bằng computer-use trên browser thật
- Do 3 team agent thực hiện song song; CEO vắng mặt, điều phối viên toàn quyền quyết định kỹ thuật

## Phase 4 — Online & Content (kế tiếp)
- Leaderboard toàn cầu theo backend Phase 3; đồng bộ kỷ lục profile lên cloud (opt-in)
- Achievements, daily challenge (seed theo ngày), thống kê nâng cao
- Quái/boss mới, nâng cấp mới, sound pack mới
- PWA: cài đặt được, chơi offline, icon theo branding

## Phase 5 — Community & Seasons
- Tài khoản cloud, mùa giải (season) + bảng xếp hạng mùa
- Chế độ co-op 2 người (cùng máy / online đơn giản)
- Replay/highlight khoảnh khắc (magic moment)

## Phase 6 — Distribution
- Chuẩn bị phát hành Steam (trailer, capsule art, build pipeline)
- Auto-update cho bản .exe, crash reporting
- Bản mobile đóng gói (Capacitor)

---
*Cập nhật bởi điều phối viên. Mỗi phase kết thúc bằng QA checklist + release tag.*
