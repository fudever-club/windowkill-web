# WK Code Conventions — Quy ước code

## Nguyên tắc nền

- **Vanilla JS thuần, KHÔNG build step.** Sửa file trực tiếp, chạy ngay trên trình duyệt.
  Thẻ `<script>` thường (không ES module, không bundler).
- Comment tiếng Việt được khuyến khích ở logic gameplay phức tạp.
- Mọi số liệu gameplay (máu quái, sát thương, tốc độ spawn, giá nâng cấp) **không hard-code
  trong logic** — đọc từ config data-driven (`MONSTER_REGISTRY`, `BEHAVIORS`, `STAGES`).
  Xem skill `wk-game-design`.

## Bản đồ file (chi tiết: skills/wk-engineering/references/file-map.md)

| File | Vai trò |
|---|---|
| `index.html` | Launcher: menu, profiles, cài đặt, kỷ lục |
| `game.html` | Popup đấu trường |
| `css/style.css` | Theme Dever duy nhất |
| `js/audio.js` | Engine nhạc + SFX (Web Audio) |
| `js/menu.js` | Logic launcher + profiles |
| `js/game.js` | Toàn bộ gameplay |
| `js/api.js` | Probe backend, fallback localStorage |
| `js/analytics.js` | Analytics ẩn danh |
| `js/pwa.js` | PWA install |
| `server/src/*.js` | Backend Node 24 + SQLite (zero dependency) |
| `electron/main.js` | Wrapper build .exe |

## localStorage

- Mọi key prefix `wk_` (`wk_profiles`, `wk_settings`, `wk_stats`, `wk_active_profile`,
  `wk_high_<diff>`, `wk_tut_v1_<profile>`...).
- Không lưu dữ liệu nhạy cảm. Tên profile render bằng `textContent`.

## Tài sản & binary

- **Cấm commit binary lớn** (>10 MB): file `.exe`, `.zip`, `electron/dist/`, video,
  dataset — để ở Release (GitHub Releases) hoặc storage ngoài, ghi link trong doc.
- Ảnh asset nén trước khi commit (ưu tiên `.webp`).

## .gitignore bắt buộc

`node_modules/`, `*.db*` (SQLite), `electron/dist/`, `electron/app/`,
`*.zip`, `*.exe`, `.env`, file video/screenshot tạm.

## Kiểm thử trước commit

```bash
node --check js/<file-da-sua>.js   # mọi file JS thay đổi
node --test tests/                 # smoke, game-logic, pwa, analytics
node --test server/tests/          # API backend
```

Chi tiết xem skill `wk-qa`.
