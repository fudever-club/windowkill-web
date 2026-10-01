# WINDOWKILL — Design System v1.1
*FU-DEVER Game Studio · Design Team · 2026-10-01*

Tài liệu chuẩn thiết kế duy nhất cho toàn bộ game. Mọi PR visual mới phải tuân thủ.

*Changelog v1.0 → v1.1: thêm visual spec M7/M10/M9 (§7), tint title bar mô phỏng theo role (§8), launcher hero polish (§9), 2 icon mới (§10), 4 role satellite mới (§1).*

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
màu neon chói cho nền, không gradient rực. Mọi background của mặt popup satellite
giữ lightness ≤ 14%.

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
| `lover` (M7 Đang Yêu) | `#ff5f8a` hồng tim | Tim đập thình thịch "ĐI TÌM TÌNH YÊU…", long lanh |
| `superlove` (M7 Siêu-popup) | `#ff5f8a` + sét `#ffe93c` | Tim khổng lồ + tia sét nhấp nháy "SIÊU TÌNH YÊU!" |
| `mirror` (M10 Gương) | `#a5f3fc` bạc gương | Mặt gương lấp lánh, vệt sáng chạy qua, viền `#f0abfc` |
| `blackhole` (M9 Hố Đen) | `#7c3aed` tím đĩa bồi tụ | Hố đen + đĩa bồi tụ xoay, mắt ngố "HÚT HÚT HÚT…" |

`satellite.html` tự theme theo `?color=` qua CSS var `--role`
(HP bar, boot overlay, glow viền, damage number).
Từ v1.1: thêm `css/roles.css` — satellite chỉ cần 1 dòng JS
`document.body.dataset.role = ROLE;` là tự theme theo role (§1, xem §9).

## 2. Typography

- Font: `system-ui` toàn game (không webfont ngoài — nhanh, offline OK).
- Tiêu đề lớn: 700, letter-spacing rộng (VD: "LEVEL UP" 700 + spacing).
- Label popup: 11px, letter-spacing 2px, uppercase.
- Damage number: 800, có text-shadow glow theo màu role (xem §7 — mỗi role
  M7/M10/M9 có màu số riêng để phân biệt nguồn sát thương).
- Không dùng emoji làm icon trong DOM — chỉ SVG. (Emoji còn trong canvas
  `fillText` gameplay: ❤️ 💎 🔥 — giữ nguyên, thuộc render game.)

## 3. Icon

- **Ưu tiên svgl.app** cho icon thương hiệu (đã dùng: `github`, `vercel`).
- **42 icon UI tự vẽ** (bomb, magnet, gem, shield, ghost…): đã audit 2026-10-01 —
  svgl.app KHÔNG có glyph UI thuần tương đương (chỉ có brand icons),
  nên giữ bộ tự vẽ. Chuẩn: viewBox 24×24, stroke `currentColor`,
  stroke-width 2, linecap/linejoin round — đồng nhất toàn bộ.
- v1.1 thêm 2 icon: `i-mirror` (M10), `i-vacuum` (M9) — xem §10.
  M7 dùng lại `i-heart` có sẵn.
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
  Áp dụng cho cả 3 mechanics mới: tim đập "thình thịch" cartoon,
  gương "coong" vui tai, hố đen "sluuurp/glup/ợ" hề hước — KHÔNG drone,
  KHÔNG minor-creepy, KHÔNG xoáy đen đáng sợ.

## 6. Mobile

- Satellite trên mobile = **simulation** (vẽ cửa sổ giả trên canvas):
  giữ nguyên cá tính role (màu, mặt, chữ kêu), title bar macOS 3 nút,
  tag "mô phỏng" góc phải. Từ v1.1 title bar tint theo role (§8).
- Touch target ≥ 44px. Không hover-only interaction.

## 7. Visual Spec — M7 · M10 · M9

> Khóa theo implementation PR #20 (đã merge) + DESIGN-SPRINT-WOW §1–3.
> Lưu ý: siêu-popup M7 KHÔNG bắn đạn — vũ khí của nó là aura "say nắng"
> + ring "thả thính" (theo design lock §1.5). Mọi telegraph nguy hiểm ≥ 0.5s.

### 7.1 M7 💘 "Tình Yêu Sét Đánh" (role `lover` → `superlove`)

**Bảng màu:**

| Phần tử | Màu | Ghi chú |
|---|---|---|
| BG popup lẻ | `#2a0a1a` | Tối, lightness ~8% |
| BG siêu-popup | `#1c0510` | Tối hơn, "đậm đà" hơn |
| Trái tim | `#ff5f8a` | Màu chính cả 2 phase |
| Chữ label | `#ffc2d6` | "ĐI TÌM TÌNH YÊU…" / "SIÊU TÌNH YÊU!" |
| Đường "đang yêu" | `#ff9df3` đứt nét | Nối 2 popup, alpha 0→1 trong 0.5s |
| Tia sét (superlove) | `#ffe93c` ↔ `#fff7ae` | Nhấp nháy 150ms |
| Aura fan cuồng | `#ff9df3` đứt nét, alpha 0.25 | Vòng R 200px, pulse 1.5Hz |
| Ring "thả thính" | `#ff9df3` | Telegraph đứt nét 0.6s → fill 0.12 |
| Thất tình | `#ff2020` + mắt giận | Khi bị đóng tay 1 popup |
| Damage number | `#ff8fc2`, glow `#ff5f8a` | Phân biệt với số dmg thường |

**Animation theo phase:**

- **Spawn (telegraph ≥ 0.5s):** boot overlay 200ms + tim pop scale 1→1.2→1
  (easeOutBack 180ms) + đường đứt nét hồng nối 2 popup + 💘 blink 2Hz ở giữa.
  Player nhìn 1s là hiểu "2 đứa này sắp gặp nhau".
- **Active (đang yêu):** tim đập `1 + 0.22·|sin(t/260ms)|` ("thình thịch");
  drift 85px/s về nhau (act 2: 95, act 3: 105).
- **Merge:** confetti hồng 24 hạt + chữ **"CƯỚI NHAU RỒI!"** pop
  (scale 0.5→1.2 easeOutBack 200ms, tồn tại 1.2s); siêu-popup scale-in
  0.6→1 trong 250ms.
- **Active (siêu-popup):** aura đứt nét R 200px pulse 1.5Hz; drift 55px/s
  về phía cửa sổ chính. Quái say nắng: 💘 14px trên đầu + wobble ±6° 3Hz.
- **Aura "say nắng" — tấn công lẫn nhau (CEO chốt 2026-10-01, mọi mode):**
  khi 2 quái say nắng đánh nhau, vẽ 2 tia chéo hồng `#ff9df3` tại điểm va chạm
  + text comic **"BỐP!"** (style W7: scale 0.7×, tồn tại 0.5s, throttle 300ms).
  Damage number quái-vs-quái: `#ffb3d9`, size 0.8×, KHÔNG crit-scale —
  phân biệt rõ với sát thương của player.
- **Ring "thả thính" (mỗi 10s):** telegraph ring đứt nét r 0→160px trong 0.6s
  → fill alpha 0.12 + đẩy văng 50px (0 sát thương); SFX sine sweep 600→900Hz.
- **Bị bắn:** hit-stop 60ms + tim giật scale 0.9 trong 100ms + damage number.
  Mỗi khi mất 3 HP: shake popup 150ms + SFX "hic!".
- **Chết:** confetti 40 hạt (hồng/vàng/trắng) + **"💘 Tan vỡ! +80 điểm"**;
  2 gem + 1 pickup hop-out (W1).
- **Đóng tay 1 popup (thất tình):** tim `#ff2020` + mắt giận 0.4s →
  drift ×2 ra khỏi màn hình; rớt 1 gem an ủi; 0 điểm.
- **Hết 60s:** "đi hưởng tuần trăng mật" — drift êm ra màn hình, fade 0.5s.

### 7.2 M10 🪞 "Gương Thần Lầy Lội" (role `mirror`)

**Bảng màu:**

| Phần tử | Màu | Ghi chú |
|---|---|---|
| BG popup | `#08131c` | Tối, lạnh |
| Mặt gương | gradient `#164e63 → #a5f3fc → #164e63` | Ellipse 62% khung |
| Viền gương | `#f0abfc` 4px | Hồng nhạt, "lầy lội" |
| Vệt sáng | trắng alpha 0.35 | Chạy qua gương, loop ~1.1s |
| Cung gương 120° | arc `#e0f7ff` lineWidth 6 | Xoay 15°/s, luôn sáng |
| Mũi tên phản xạ | `#ffffff` | 3 mũi tên cong chỉ hướng dội |
| Đạn dội | `#ff5fd2` hồng neon | KHÁC đạn quái đỏ `#ff3b3b` |
| Label | `#a5f3fc` | "ĐỪNG BẮN VÀO GƯƠNG!" |
| Damage number | `#e8f4ff`, glow `#a5f3fc` | Melee "2" scale 1.5× |

- Cùng ngôn ngữ visual với quái Giáp Gương (warden, ải 5 GDD v2.0) —
  bạc + sparkle: player đã được dạy "vòng sau lưng" từ trước.

**Animation theo phase:**

- **Spawn:** "KÍNH COONG!" — popup rơi từ trên xuống, bounce 2 lần
  (rơi 0.6s + bounce 0.2s×2, dust puff mỗi lần chạm đất, kiểu đồ chơi).
  Cung gương fade-in sau khi chạm đất; **trong lúc rơi KHÔNG phản xạ** (miễn hại).
- **Active:** cung xoay 15°/s (đọc được, không chóng mặt); 6 sparkle bạc
  bay quanh gương (loop).
- **Phản xạ:** đạn chạm cung → flash trắng 2 frame tại điểm chạm + SFX "coong"
  (pitch leo theo chuỗi phản xạ) + đạn dội spawn: tốc ×1.3, 1 dmg vào tàu,
  tầm 600px + fade 100px cuối, trail hồng.
- **Melee húc:** "BOING!" — tàu + gương squash 0.85 trong 120ms, văng ngược
  nhau 60px, chữ comic **"BOING!"** vàng `#FFE14D` viền đen (style W7) 0.6s;
  cooldown húc 0.5s; tàu 0 dmg nhận vào.
- **Chết:** vỡ kính — 16 mảnh shard bạc (polygon) bay + major chord +
  **"🪞 Vỡ tan! +60 điểm"**; 2 gem hop-out.
- **Đóng tay:** vỡ thành sparkle vô hại, 0 điểm, 0 gem.
- **Hết 45s:** gương "chán" — drift êm ra màn hình, fade 0.5s.

### 7.3 M9 🌀 "Máy Hút Bụi Vũ Trụ" (role `blackhole`)

**Bảng màu:**

| Phần tử | Màu | Ghi chú |
|---|---|---|
| BG popup | `#05030c` | Tối nhất game, nhưng có mắt ngố |
| Đĩa bồi tụ | `#7c3aed` → `#c084fc` → `#ff9d5c` | 3 ellipse xoay, alpha .85/.65/.45 |
| Tâm hố đen | `#000`, viền `#ff9d5c` 3px | "Mồm" máy hút |
| Vòng hút R 220 | `#a78bfa` đứt nét, alpha 0.5 | Xoay 10°/s |
| Mắt ngố | trắng + con ngươi đen | Nhìn theo hướng hút, cartoon |
| Vệt hút quái | `#a78bfa` streak | Hướng về tâm |
| Label | `#c084fc` | "HÚT HÚT HÚT…" |
| Damage number | `#c4a5ff`, glow `#7c3aed` | |
| "+0" nuốt quái | `#9db8d9` xám | Nhấn mạnh KHÔNG điểm |
| Quái enrage | mắt đỏ tròn cartoon | KHÔNG u ám — kiểu "cáu" hề |

**Ràng buộc tone (bất khả xâm phạm):** TUYỆT ĐỐI cartoon vui nhộn —
mắt ngố, SFX sluuurp/glup/ợ hơi hề hước. KHÔNG xoáy đen đáng sợ,
KHÔNG drone u ám, KHÔNG minor-creepy.

**Animation theo phase:**

- **Spawn telegraph 0.8s:** vòng gió xoáy alpha 0→0.5 + SFX "sluuurp" tăng dần;
  popup pop-in; **trong 0.8s CHƯA hút** (miễn hại).
- **Hút (12s):** đĩa bồi tụ xoay (t/900); quái bị kéo vẽ vệt xoáy tím hướng tâm.
  Nuốt: quái scale 1→0 trong 150ms tại tâm + "glup!" + float **"+0"** xám 0.8s.
- **Gem — theo độ khó (CEO chốt 2026-10-01):**
  - **Khắc nghiệt (Hard):** gem bị hút → xoáy spiral vào tâm (0.3s, scale 1→0)
    + float **"MẤT!"** `#9db8d9` + glup trầm hơn. **MẤT VĨNH VIỄN.**
  - **Thường / Chill (Normal/Easy):** gem KHÔNG bị nuốt — chạm vòng hút thì
    **hất văng ra ngoài** theo hướng radial (300px/s) + puff trắng nhỏ +
    SFX "phù!" vui. Telegraph: gem trong 260px wobble 0.3s trước khi bị hất.
- **Tàu trong 140px:** vệt gió trắng telegraph; chạm tâm: −1 máu + văng 120px
  + flash đỏ viền nhẹ + SFX "phù!".
- **Ợ:** telegraph 0.5s — popup phồng 1→1.25 (easeOut) + mặt "căng";
  phun tối đa 6 quái hướng ngẫu nhiên + burst nâu nhạt + **"ỢỢỢ!"**;
  quái enrage: mắt đỏ tròn cartoon, trail đỏ nhạt, wobble nhanh —
  tốc +30%, máu +1, 5s.
- **Phá lúc đang hút ("NÔN TIỆC!"):** vòng xoáy unwind ngược 0.4s; quái bị nuốt
  nôn ra và chết → mỗi con pop bóng bay (W1) + điểm gốc float + gem hop-out
  + **"+40"** vàng `#FFE14D`.
- **Đóng tay:** "hắt xì" — nôn toàn bộ quái đã nuốt ra ngay, enrage như ợ;
  0 điểm.
- **Hết hút:** "no nê" drift ra khỏi màn hình, fade 0.5s.

## 8. Tint title bar cửa sổ mô phỏng theo role

Title bar canvas trong `drawSims()` (game.js) hiện gradient cố định
`#1a2b4a → #0f1c33`. Từ v1.1: **tint theo role** để player nhận biết popup
từ xa, nhưng giữ tương phản thấp (lightness nền title ≤ 20%).

**Spec cho Engineering** — thêm map + thay gradient trong `drawSims()`:

```js
// DESIGN-SYSTEM v1.1 §8 — tint title bar mô phỏng theo role
const ROLE_TB_TINT = {
  nest:      ["#3a1d5c", "#190b2c"],
  fragment:  ["#4a2d6b", "#201335"],
  shield:    ["#1d3a52", "#0c1c2c"],
  debris:    ["#4a1d1d", "#260d0d"],
  giant:     ["#1d4224", "#0d2112"],
  minion:    ["#2d4416", "#141f0a"],
  mother:    ["#4d2f0d", "#261505"],
  chick:     ["#4d4211", "#261f09"],
  bomb:      ["#4d2113", "#270f08"],
  lover:     ["#4d1428", "#270a14"],
  superlove: ["#521226", "#2a0a13"],
  mirror:    ["#1f3a46", "#0d1a21"],
  blackhole: ["#22133d", "#0f0820"],
};
// trong drawSims(), thay 3 dòng gradient cố định bằng:
const tb = ROLE_TB_TINT[s.role] || ["#1a2b4a", "#0f1c33"];
const tg = ctx.createLinearGradient(0, s.y, 0, s.y + 26);
tg.addColorStop(0, tb[0]); tg.addColorStop(1, tb[1]);
```

- Giữ nguyên: 3 nút macOS (đỏ/vàng/xanh), label `#cfe3ff`, tag "mô phỏng".
- Role `shield` (M3, drone bay quanh tàu) không dùng khung OS — miễn tint.
- Fallback: role lạ → gradient cũ `#1a2b4a → #0f1c33`.

## 9. Launcher hero polish

File mới **`css/roles.css`** — Engineering link **sau** `css/style.css` trong
`index.html` (1 dòng). Pure-CSS, không cần đổi HTML hiện tại
(dùng selector specificity cao hơn để thắng block `<style>` inline):

- `.game-logo`: float nhẹ (translateY ±6px, 6s ease-in-out infinite) +
  glow pulse (`drop-shadow #0080FF66 → #0080FF99`, 4s).
- `h1.title`: shimmer — giữ nguyên gradient Dever, chỉ cho "chảy" nhẹ
  (background-size 200%, 8s linear infinite). Không đổi màu brand.
- `header.hero > *`: entrance fade-up stagger 1 lần (delays 0 / .08 / .16s).
- `.brand`: glow viền pulse nhẹ (`#0080FF44`, 3s).
- `.hero-bg`: giữ opacity .28 (tương phản thấp) + `saturate(.85)` +
  drift background-position 60s — nền "thở" mà vẫn lặng.
- `prefers-reduced-motion`: tắt toàn bộ animation hero.
- Mobile ≤ 480px: `h1.title` 40px.

**Quyết định:** hero KHÔNG thêm chi tiết/section mới — chỉ motion + glow.
Lý do: launcher là "bìa" game, đẹp = sạch + thở, không phải thêm chữ.

## 10. Icon bổ sung (v1.1)

2 icon mới theo pipeline `assets/icons/*.svg` → `build-sprite.py`
(24×24, stroke `currentColor`, sw 2, round). M7 dùng lại `i-heart` có sẵn.

- **`i-mirror`** (M10 — gương cầm tay + sparkle):
  `<circle cx="12" cy="9" r="5.5"/><path d="M12 14.5V21"/><path d="M9.5 21h5"/><path d="M18.6 3.4l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8z"/>`
- **`i-vacuum`** (M9 — máy hút bụi cartoon):
  `<rect x="3" y="12" width="10" height="7" rx="2"/><path d="M13 15.5h3.5a4 4 0 0 0 4-4V7"/><path d="M20 7l1.5-1.5"/><circle cx="6.5" cy="19.5" r="1.4"/><circle cx="10.5" cy="19.5" r="1.4"/>`

Dev refine path nếu cần, giữ đúng chuẩn stroke §3.

---
*File này là source of truth. Sửa đổi qua PR của Design Team.*
