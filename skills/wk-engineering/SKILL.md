---
name: wk-engineering
description: "Use when implementing code for WINDOWKILL Web Edition: file map, vanilla-JS conventions, testing, perf budget, PWA/SEO checklist."
---

# wk-engineering — WINDOWKILL Web Edition

Technical skill for the FU-DEVER Game Studio repo **WINDOWKILL Web Edition** (twin-stick shooter trong popup; cửa sổ popup chính là máu: quái gặm nhỏ cửa sổ, đạn đẩy cửa sổ bay).

> Bản đồ file chi tiết: xem [references/file-map.md](references/file-map.md).

## 1. Quy ước code

- **Vanilla JS thuần, KHÔNG build step.** Sửa file trực tiếp; tất cả `<script>` là thẻ script thường (KHÔNG dùng ES module trên client).
- Comment tiếng Việt được (repo hiện tại đã dùng comment tiếng Việt xuyên suốt).
- Strict mode: mọi file JS dùng `"use strict";`.
- **localStorage:** mọi key dùng prefix `wk_` (`wk_profiles`, `wk_active_profile`, `wk_settings`, `wk_stats`, `wk_high_*`, `wk_analytics`, `wk_api_base`, `wk_high_chill/normal/hard`).
- **Không hard-code số liệu gameplay trong logic.** Mọi thông số quái vật / độ khó / nâng cấp phải đọc từ config data-driven trong `js/game.js`:
  - `DIFFS` (chill / normal / hardcore; alias `hard` cho `hardcore`)
  - `MONSTER_REGISTRY` (chaser, chewer, tank, dasher, splitter, mini — trường `hp`, `spd` là hàm theo wave)
  - `BEHAVIORS` (chase / chew / dash…)
  - Hệ **Acts** (3 act: palette, nhạc, pool quái, boss variant riêng)
- Muốn đổi số liệu → sửa config, không sửa code spawn/physics.
- Backend (`server/`) dùng `import` ESM với Node 24 built-ins (`node:http`, `node:sqlite`) — zero dependency, KHÔNG `npm install`.

## 2. Testing

Sau mọi thay đổi file JS, chạy:

```bash
node --check js/game.js   # lặp lại cho mọi file JS đã sửa (cả server/)
node --test tests/        # smoke, game-logic, pwa, analytics
node --test server/tests/
```

**Giữ CI xanh** (`.github/workflows/ci.yml`): không merge khi CI đỏ.

## 3. Perf budget

- Mục tiêu **60fps** trên laptop phổ thông.
- **Particle cap 400** — capping cứng số particle/frame; vượt thì ưu tiên giữ particle mới nhất, drop cái cũ nhất.
- Object pooling cho đạn / particle / gem (tái sử dụng object, tránh tạo rác GC giữa game loop).
- Lazy-load asset nặng (hero.jpg, og-banner.jpg…) — không chặn first paint của launcher.

## 4. Checklist PWA

- `manifest.webmanifest` (name, icons, theme/background color, display standalone)
- `sw.js` — service worker cache-first cho asset, version bump khi đổi asset
- `offline.html` — trang fallback khi mất mạng
- Installable: đáp ứng tiêu chí install của Chromium (manifest + SW + HTTPS)

## 5. Checklist SEO

- `index.html`: title, description, canonical, favicon, theme-color, Open Graph (`og:title`, `og:description`, `og:image` → `assets/og-banner.jpg`, `og:url`)
- `sitemap.xml` — cập nhật `<lastmod>` khi release (URLs: `/` và `/game.html`)
- `robots.txt` — `Allow: /`, trỏ `Sitemap:` đúng domain production

## 6. Backend (`server/`)

- Zero-dependency Node 24, SQLite **WAL mode** (`server/data/windowkill.db`).
- Tất cả query qua **prepared statements** (`server/src/db.js`) — tuyệt đối không nối chuỗi SQL.
- Validate mọi input (`server/src/validate.js`), giới hạn body JSON **64KB** (`WK_MAX_BODY=65536`).
- Rate limit mỗi IP/phút: 120 GET đọc / 30 write (`WK_RL_READ` / `WK_RL_WRITE`); `/api/events` 60, `/api/errors` 20.
- **CORS deny-by-default**: mặc định same-origin; chỉ bật origin trong `WK_CORS_ORIGINS`.
- Bind mặc định `127.0.0.1:3001`; `PORT`/`HOST` qua biến môi trường.
- Backend là **tùy chọn**: game vẫn chạy 100% offline trên static hosting nhờ `localStorage` (`js/api.js` tự probe rồi fallback).

## 7. Quy trình git

Repo hiện tại chưa có file `rules/wk-git-workflow.md` — khi file này được bổ sung, ưu tiên đọc nó. Quy trình mặc định:

- Nhánh theo team: `team/<team>` (VD `team/engineering`) — làm feature trên nhánh con rồi PR vào `team/<team>` trước khi PR lên `main`.
- Mọi thay đổi lên `main` đều qua **Pull Request**; CI xanh mới merge.
- KHÔNG commit zip/binary lớn (VD file .exe ~150MB của Electron build), KHÔNG push secret.
- Không chạy `git` thay user trừ khi task yêu cầu rõ ràng.
