# Icon Manifest — WINDOWKILL Web Edition

Mọi icon trong UI đều là SVG local, **không dùng icon font / emoji / hotlink**.
Cách dùng: `<svg class="ic" aria-hidden="true"><use href="#i-<tên>"/></svg>`
— sprite 52 symbol được nhúng sẵn trong `index.html` và `game.html`.

## Nguồn

| Icon | Nguồn |
|---|---|
| `github`, `vercel` | [svgl.app](https://svgl.app) — tải từ API công khai (`https://api.svgl.app/` → `route`, file tại `https://svgl.app/library/<name>.svg`). Đã chuẩn hoá `fill` về `currentColor` để ăn theo màu chữ. Dùng ở footer launcher. |
| 42 icon UI (`play`, `pause`, `restart`, `home`, `plus`, `close`, `user`, `trophy`, `chart`, `settings`, `music`, `volume`, `vibrate`, `gauge`, `heart`, `heart-plus`, `shield`, `bomb`, `magnet`, `pierce`, `rocket`, `fire`, `split`, `bolt`, `clover`, `snow`, `gem`, `skull`, `wave`, `clock`, `gamepad`, `levelup`, `lock`, `alert`, `crosshair`, `smartphone`, `ghost`, `smile`, `meh`, `window`, `sparkles`, `globe`) | **Tự vẽ** (svgl.app không có glyph UI thuần). Phong cách đồng nhất: viewBox 24×24, stroke `currentColor`, stroke-width 2, đầu tròn — hợp branding FU-DEVER (xanh `#0066CC`/`#0080FF`). |
| 11 icon UI vẽ mới đợt **Launcher clean 2026-10-02** (`shop`, `flag`, `anvil`, `calendar`, `check`, `grad`, `infinity`, `palette`, `mirror`, `vacuum`, `expand`) | **Tự vẽ** — cùng chuẩn bộ hiện tại (24×24, stroke `currentColor`, width 2, đầu tròn). `shop` = awning + cửa tiệm (hub nav); `flag` = cờ (header Chiến dịch); `anvil` = đe (header Xưởng); `calendar` = lịch (Daily); `check` = dấu tích (thành tựu đã mở); `grad` = mũ cử nhân (tutorial); `infinity` = ∞ (chơi tự do); `palette` = bảng màu (skin reward). `mirror`/`vacuum`/`expand` là glyph hệ thống đã hand-add vào sprite, nay đưa vào `build-sprite.py` thành single source of truth. Lý do: menu.js đã reference `i-flag`/`i-anvil` nhưng glyph không tồn tại → header Xưởng/Chiến dịch bị mất icon trên production. |
| `avatar-1` … `avatar-8` | Tự vẽ: badge gradient xanh Dever + glyph trắng (gamepad, rocket, bolt, ghost, gem, fire, crosshair, trophy). Dùng làm avatar tài khoản người dùng. |

## Tái tạo

```bash
cd assets/icons
python3 build-sprite.py   # sinh *.svg riêng lẻ + sprite.svg + sprite-inline.html
```

Sau đó thay khối sprite trong `index.html` / `game.html` bằng nội dung
`sprite-inline.html` (nằm ngay sau thẻ `<body>`).

## Lưu ý

- Emoji vẫn còn **trong canvas game** (`js/game.js`: chữ nổi `❤️`, `💎`,
  `🔥 COMBO`, `💣 NUKE`, cảnh báo `⚠`) — đó là text vẽ bằng `fillText`,
  thuộc logic render gameplay nên giữ nguyên theo ràng buộc không phá `game.js`.
- Mọi icon DOM (launcher, HUD overlay, draft nâng cấp, profile, leaderboard)
  đã chuyển sang SVG.
