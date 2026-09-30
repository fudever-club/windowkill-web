# File map — WINDOWKILL Web Edition

Bảng file → vai trò (1 dòng mỗi file).

| File | Vai trò |
|---|---|
| `index.html` | Launcher: menu chính, chọn/tạo/xóa profiles, cài đặt (nhạc/SFX/rung/độ khó), kỷ lục, thống kê |
| `game.html` | Popup đấu trường: canvas game, HUD, pause menu |
| `css/style.css` | Stylesheet dùng chung cho launcher + arena |
| `js/audio.js` | Web Audio engine: nhạc chiptune + SFX, dùng chung cho menu và game |
| `js/menu.js` | Launcher logic: profiles, cài đặt, kỷ lục, mirror điểm lên backend |
| `js/game.js` | Gameplay: arena engine, spawn, quái vật, nâng cấp, particle, HUD (config data-driven: `DIFFS`, `MONSTER_REGISTRY`, `BEHAVIORS`) |
| `js/api.js` | Backend probe: kiểm tra backend khả dụng, fallback tự động về localStorage |
| `js/analytics.js` | Analytics ẩn danh (opt-out qua cài đặt) |
| `js/pwa.js` | Đăng ký service worker, xử lý install prompt |
| `server/src/index.js` | Entry point backend: bootstrap, listen, graceful shutdown (SIGINT/SIGTERM) |
| `server/src/server.js` | Tạo app HTTP (`createApp`) |
| `server/src/config.js` | Đọc biến môi trường: PORT/HOST/WK_DB, rate limits, caps, CORS |
| `server/src/db.js` | SQLite WAL, migrations, prepared statements |
| `server/src/validate.js` | Validate input request |
| `server/src/ratelimit.js` | Rate limit theo IP/phút |
| `server/src/security.js` | Headers bảo mật, giới hạn body, CORS deny-by-default |
| `server/windowkill-backend.service` | Template systemd (mẫu, chưa enable) |
| `electron/main.js` | Electron wrapper: đóng gói bản desktop .exe Windows |
| `electron/package.json` | Manifest build Electron |
| `manifest.webmanifest` | PWA manifest |
| `sw.js` | Service worker (cache asset, offline) |
| `offline.html` | Trang fallback khi mất mạng |
| `sitemap.xml` | Sitemap SEO (production: `https://windowkill-web.vercel.app`) |
| `robots.txt` | robots + Sitemap pointer |
| `vercel.json` | Cấu hình deploy Vercel (static) |
| `README.md` | Tài liệu repo chính |
| `ROADMAP.md` | Kế hoạch phát triển |
| `SECURITY.md` | Chính sách bảo mật |
| `studio/game-design/GAME-DESIGN-DOC.md` | Tài liệu thiết kế game |
| `studio/growth/GTM-PLAN.md` | Kế hoạch go-to-market |
| `tests/` | Tests client: smoke, game-logic, pwa, analytics (`node --test tests/`) |
| `server/tests/` | Tests backend (`node --test server/tests/`) |
| `assets/` | Asset: hero.jpg, og-banner.jpg, logo-lockup.webp, favicon.png, icons/, brand/ |
| `scripts/deploy-vercel.sh` | Script deploy lên Vercel |
| `.github/workflows/ci.yml` | CI: test + lint, phải xanh mới merge |
