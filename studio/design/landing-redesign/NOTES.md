# Landing Redesign — Quyết định IA + Icon (Design Lead, 2026-10-02)

## Vấn đề (user feedback)
1. Emoji rải khắp DOM UI (Xưởng/Thành tựu/Daily/Thống kê/Chiến dịch) — thiếu chuyên nghiệp,
   bất chấp chỉ đạo đứng: icon lấy từ svgl.app / bộ SVG đồng bộ của dự án.
2. Landing chất đống mọi panel trên một trang dài — phải CLEAN: có icon shop, bấm mở kho hàng.

## Quyết định IA (Information Architecture)

**Landing mới (màn hình đầu):**
- Hero (logo + tagline) — giữ nguyên.
- Thẻ profile — giữ nguyên.
- **Hàng nút hub: 6 nút icon SVG + nhãn** — Cửa hàng · Thành tựu · Daily · Thống kê · Cài đặt · Cách chơi.
- Panel **Độ khó** riêng (tách ra khỏi Cài đặt — quyết định: độ khó là lựa chọn trước khi chơi,
  không phải "cài đặt hệ thống").
- Nút **CHƠI NGAY** nổi bật + chọn ải Chiến dịch gọn gàng — giữ nguyên vị trí/logic.
- Footer — giữ nguyên.

**Overlay `#hub-overlay` (6 dialog, mở 1 lúc 1 cái):**
- `shop` → **Kho hàng**: lưới Xưởng (mua node, badge số dư Mảnh Kính + count-up ăn mừng khi mua).
- `ach` → Thành tựu (header có đếm `(mở/tổng)`).
- `daily` → Daily (header có ngày, nút Chơi Daily).
- `stats` → Kỷ lục + Thống kê (2 khối xếp chồng).
- `settings` → toàn bộ cài đặt (nhạc/SFX/rung/haptic/FX/satellites/ngôn ngữ).
- `howto` → Cách chơi + nút "Chơi lại hướng dẫn" (được đưa vào đây).

Đóng bằng: nút X · phím Esc · click backdrop. Mở có animation pop-in 180ms,
tôn trọng `prefers-reduced-motion`. Focus vào nút Đóng khi mở, trả focus về nút
đã bấm khi đóng. Deep-link `#shop`/`#ach`/… qua hash. Mobile 390px: hub 3 cột,
dialog 90vh scroll.

**Nguyên tắc: GIỮ NGUYÊN 100% chức năng + luồng dữ liệu** — chỉ đổi cách trình
bày/điều hướng. Không thêm/bớt tính năng. Mọi label mới có đủ i18n VI + EN
(`menu.hub.*`, 9 keys).

## Quyết định icon
- svgl.app chỉ có **brand logo** → giữ cho GitHub/Vercel ở footer (đã có).
- Glyph UI game không có trên svgl.app → dùng bộ custom 24×24 đồng nhất của dự án
  (stroke currentColor, width 2, đầu tròn), theo đúng DESIGN-SYSTEM.md §3.
- **8 glyph vẽ mới**: `shop` (awning cửa tiệm), `flag`, `anvil` (đe — header Xưởng),
  `calendar` (Daily), `check` (thành tựu đã mở), `grad` (mũ cử nhân — tutorial),
  `infinity` (chơi tự do), `palette` (skin reward).
- **3 glyph khôi phục** (`flag`/`anvil` đã được menu.js reference nhưng KHÔNG tồn tại
  trong sprite → header Xưởng/Chiến dịch bị mất icon trên production;
  `mirror`/`vacuum`/`expand` đã hand-add vào sprite HTML nhưng thiếu trong
  `build-sprite.py` → regenerate sẽ làm mất). Tất cả đưa vào `build-sprite.py`
  thành single source of truth. Sprite: 63 symbols.
- Emoji còn lại: chỉ trong **canvas gameplay** (`ctx.fillText`/`addFloat`/banner:
  `hud.*`, `banner.*`, `sat.*`, `juice.warn`, `campaign.boss_banner_*`) — là logic
  render, NGOÀI phạm vi, giữ nguyên. Level pips ●/○ giữ nguyên (glyph text đơn sắc).

## Screenshots
- `before-landing-1440.png` / `before-landing-390.png` — base: landing chất đống.
- `after-landing-1440.png` / `after-landing-390.png` — landing sạch mới.
- `after-shop-1440.png` / `after-shop-390.png` — dialog Kho hàng (Xưởng).
- `after-achievements-1440.png` — dialog Thành tựu.

## Bug phát hiện & sửa trong lúc làm
1. Thẻ "Chơi tự do" render literal `svgIcon("i-infinity")` — quên `${}` trong
   template literal. Đã sửa.
2. Nút "Chơi lại hướng dẫn" rơi ra `document.body` (hiện ở góc trang) vì selector
   `[data-i18n='menu.howto.1']` không bao giờ khớp (markup dùng `data-i18n-html`).
   Đã chuyển nút vào `#v2-howto-body` trong dialog Cách chơi — đây là nhà đúng của nó.

## Test
- Full suite: **164 pass / 0 fail / 1 skip** (baseline 87/0/1 + 77 test mới).
- `tests/launcher-ui.test.js` mới: sprite coverage (mọi `#i-X` được reference phải
  tồn tại), không emoji trong DOM UI, cấu trúc hub, i18n hub keys VI+EN, hub
  controller, CSS hub.

## Sửa CTA theo feedback user (2026-10-02, leader trực tiếp)
**Vấn đề:** nút CHƠI NGAY dùng `position:sticky;bottom:10px` với margin 10px/6px —
bị kẹp giữa panel Độ khó và ghi chú popup, không có không gian thở; khi scroll còn
đè lên nội dung (nhìn "khó chịu" đúng như user nói).
**Giải pháp:** bỏ sticky hoàn toàn. CTA thành `<section class="cta-band">` riêng:
padding 46px/40px (mobile 36px/32px), căn giữa, có radial glow xanh nhẹ phía sau
để tạo "khoảnh khắc" riêng cho CTA thay vì chen giữa các ô vuông. Ghi chú popup
nằm trong band, chữ nhỏ mờ. `js/menu.js` (vị trí chèn panel chọn ải) đổi selector
`.closest(".row")` → `.closest(".cta-band, .row")`. Test mới khóa design trong
`tests/launcher-ui.test.js` (CTA trong band, không sticky).
