# WINDOWKILL — Design System v1.0
*FU-DEVER Game Studio · Design Team · 2026-10-01*

Tài liệu chuẩn thiết kế duy nhất cho toàn bộ game. Mọi PR visual mới phải tuân thủ.

## 1. Brand & Màu sắc

| Token | Giá trị | Dùng cho |
|---|---|---|
| `--dever-blue` | `#0066CC` | Primary brand, nút chính, link |
| `--dever-dark` | `#004C99` | Nền sâu, header, footer |
| `--dever-accent` | `#0080FF` | Accent, hover, glow, focus ring |
| `--bg-deep` | `#04080f` | Nền launcher/game (tối, tương phản thấp) |
| `--bg-panel` | `#0c1f3a` | Card, panel, draft nâng cấp |
| `--bg-panel-2` | `#12305c` | Card hover |
| `--text-1` | `#ffffff` | Chữ chính |
| `--text-2` | `#cfe6ff` | Chữ phụ |
| `--text-3` | `#9db8d9` | Chữ mờ, hint |
| `--line` | `rgba(0,128,255,.16)` | Viền card/panel (`#0080FF2a`) |

**Nguyên tắc nền:** TƯƠNG PHẢN THẤP — background luôn tối và lặng (Deep Dever),
gameplay (tàu, đạn, quái, particle) là thứ duy nhất được "hét". Không dùng
màu neon chói cho nền, không gradient rực.

**Satellite roles** (mỗi role một cá tính, dùng cho popup thật + simulation):

| Role | Màu | Tính cách |
|---|---|---|
| `nest` (M1 Ổ Quái) | `#8b2fc9` tím | Trứng tím mắt đỏ, rùng rợn nhẹ nhưng cartoon |
| `fragment` (M2 Mảnh Boss) | `#c084fc` tím nhạt | Mảnh răng cưa mắt đỏ |
| `shield` (M3 Khiên) | `#38bdf8` xanh da trời | Lục giác khiên — là đồ của mình, KHÔNG phá được |
| `debris` (M4 Mảnh Vỡ) | `#ff5a5a` đỏ | Đá nứt, telegraph đỏ 0.7s |
| `giant` (M6 Khổng Lồ) | `#4caf50` xanh lá | Blob mắt to cười "PHÁ TÔI ĐI! BỐP!" |
| `minion` (M6 Nhóc) | `#8bc34a` → `#ff5252` khi giận | Tinh nghịch → nổi giận đỏ mặt |
| `mother` (M5 Mẹ Gà) | `#ff9800` cam | Gà mái "CỤC TÁC! ĐẺ TRỨNG!" |
| `chick` (M5 Gà Con) | `#ffd54f` vàng | Nhảy tưng tưng "CHÍP CHÍP!" |
| `bomb` (M8 Bom Cười) | `#ff5722` cam đỏ | Đếm ngược to, 3s cuối nhấp nháy đỏ gấp gáp |

`satellite.html` tự theme theo `?color=` qua CSS var `--role`
(HP bar, boot overlay, glow viền, damage number).

## 2. Typography

- Font: `system-ui` toàn game (không webfont ngoài — nhanh, offline OK).
- Tiêu đề lớn: 700, letter-spacing rộng (VD: "LEVEL UP" 700 + spacing).
- Label popup: 11px, letter-spacing 2px, uppercase.
- Damage number: 800, có text-shadow glow theo màu role.
- Không dùng emoji làm icon trong DOM — chỉ SVG. (Emoji còn trong canvas
  `fillText` gameplay: ❤️ 💎 🔥 — giữ nguyên, thuộc render game.)

## 3. Icon

- **Ưu tiên svgl.app** cho icon thương hiệu (đã dùng: `github`, `vercel`).
- **42 icon UI tự vẽ** (bomb, magnet, gem, shield, ghost…): đã audit 2026-10-01 —
  svgl.app KHÔNG có glyph UI thuần tương đương (chỉ có brand icons),
  nên giữ bộ tự vẽ. Chuẩn: viewBox 24×24, stroke `currentColor`,
  stroke-width 2, linecap/linejoin round — đồng nhất toàn bộ.
- Dùng qua sprite: `<svg class="ic" aria-hidden="true"><use href="#i-<tên>"/></svg>`.
- Quy trình thêm icon: vẽ file `assets/icons/<tên>.svg` → chạy
  `assets/icons/build-sprite.py` → thay sprite trong `index.html`/`game.html`.

## 4. Component

- **Nút chính** (`.btn`): gradient `#0080FF→#0066CC`, chữ trắng,
  `box-shadow: 0 8px 30px #0080FF55`, hover scale nhẹ.
- **Nút ghost** (`.btn-ghost`): trong suốt, hover `#0080FF18`.
- **Card** (`.card`): nền `#0c1f3a`, viền `2px #0080FF66`, radius 16px,
  hover `translateY(-4px) scale(1.03)` + viền `#0080FF`.
- **Draft nâng cấp**: 3 card, icon SVG to, tên 700, mô tả ngắn 1 dòng,
  phím tắt 1/2/3. Mô tả KHÔNG nhúng HTML/SVG thô.
- **Toggle chip** (`.pchip`): off `#0a1a3066`, on gradient Dever.
- **HUD game**: tối giản, số liệu trắng/xanh nhạt, không che gameplay.

## 5. Motion & Âm thanh (phối hợp Engineering)

- Hit-stop 40–90ms, slow-mo boss, shake 7 tầng — đã có trong `juice.js`.
- Mọi popup mở: boot overlay fade 200ms + pulse 1 nhịp
  (tôn trọng `prefers-reduced-motion`).
- Nhạc/SFX: VUI NHỘN, NHỊP NHANH, tuyệt đối không rùng rợn/u ám.

## 6. Mobile

- Satellite trên mobile = **simulation** (vẽ cửa sổ giả trên canvas):
  giữ nguyên cá tính role (màu, mặt, chữ kêu), title bar macOS 3 nút,
  tag "mô phỏng" góc phải.
- Touch target ≥ 44px. Không hover-only interaction.

---
*File này là source of truth. Sửa đổi qua PR của Design Team.*
