---
name: wk-game-design
description: "Use when designing monsters, stages, bosses, difficulty balance, tutorials, or player-facing copy for WINDOWKILL Web Edition."
---

# wk-game-design — Thiết kế cho WINDOWKILL Web Edition

> Tài liệu gốc: `studio/game-design/GAME-DESIGN-DOC.md` · `docs/bestiary.md`.
> Game fan-made lấy cảm hứng từ Windowkill (Steam). TUYỆT ĐỐI không copy art/audio/brand/text của bản gốc.

## 1. Cơ chế signature — BẤT BIẾN

**Cửa sổ popup CHÍNH LÀ máu.** Đây là định danh của game, không bao giờ thay đổi:

- Quái gặm viền → `window.resizeTo()` thu nhỏ cửa sổ. Cửa sổ nhỏ hơn ngưỡng = thua (Chill 50%, Thường 65%, Khắc nghiệt 75%).
- Bắn đạn vào viền → `window.moveBy()` đẩy cửa sổ bay + hất văng quái đang bám viền.
- Mọi quái / boss / ải / nâng cấp / mechanic mới **phải tương tác được với cơ chế này** — trực tiếp (gặm, hất, nứt viền) hoặc gián tiếp (buff kẻ gặm, trừng phạt đứng gần viền, khiến người chơi phải đẩy cửa sổ có chủ đích).

Nếu ý tưởng mới không động đến cửa sổ dưới bất kỳ dạng nào, ý tưởng đó không hợp với game này.

## 2. Năm design pillars

1. **Cửa sổ là máu** — mọi content mới đều đe dọa hoặc chơi đùa với kích thước cửa sổ.
2. **Đọc hiểu trước, phản xạ sau** — mọi đòn nguy hiểm telegraph **≥ 0.5s** (boss ≥ 0.7s) bằng cả visual + âm thanh, kèm text tiếng Việt lần đầu. Không có đòn "ăn ngay".
3. **5 phút hiểu luật** — tutorial tương tác, mỗi beat đúng **1 câu ≤ 12 từ**, không wall-of-text, luôn có nút **Bỏ qua**.
4. **Khắc chế rõ ràng** — mỗi quái có **điểm yếu + cách khắc chế cụ thể**. Người chơi thua vì chọn sai chiến thuật, không phải vì số liệu bịp.
5. **Công bằng tuyệt đối** — skin chỉ đổi ngoại hình; daily challenge cùng seed cho mọi người; độ Khắc nghiệt khó vì quái mạnh hơn, **không** vì spawn bịp.

## 3. Quy ước thiết kế QUÁI MỚI

Điền template `references/monster-template.md` cho mọi đề xuất quái. Các trường bắt buộc: **tên tiếng Việt**, vai trò, hành vi/state machine, cách tấn công, **điểm yếu**, **cách khắc chế**, tương tác với cửa sổ, và readability (màu theo mục tiêu, shape theo hành vi, telegraph 3 phase).

**Không trùng vai trò với 14 quái hiện có** (`docs/bestiary.md`):

| id | Tên | Vai trò | Đe dọa cửa sổ |
|---|---|---|---|
| chaser | Truy Đuổi | đuổi / dmg tàu | — |
| chewer | Gặm Viền | gặm cửa sổ trực tiếp | thu cửa sổ ~15px/s khi bám |
| tank | Xe Tăng | tanker chắn đường | — |
| dasher | Lao Tới | sát thủ dash | — |
| splitter | Phân Thân | chết → tách mini | — |
| mini | Mini | quấy rối theo bầy | — |
| spitter | Phun Mã Độc | bắn xa | đạn chạm viền → **nứt viền** (+25% gặm/vết) |
| booster | Khuếch Đại Lỗi | buff bầy | chewer gặm nhanh ×1.4 trong aura |
| bomber | Liều Chết Cảm Tử | kamikaze | nổ gần viền → nứt viền |
| freezer | Đóng Băng Hệ Thống | khống chế | đóng băng viền 8s → chewer miễn hất |
| warden | Giáp Gương | phản xạ đạn | đạn phản xạ chạm viền → nứt viền; hộ vệ chewer |
| glimmer | Đom Đóm Vàng | bonus chạy trốn | trốn thoát → khe hở: lần shrink tiếp +10px |
| phantom | Bóng Ma Ẩn | tàng hình | chạm viền lúc ẩn → rạch nứt |
| broodmother | Ổ Lỗi Sinh Sản | đẻ trứng | trứng dính viền → nở thành chewer |

**Readability bắt buộc (bestiary §4):**
- Màu theo mục tiêu: Tím = đe dọa CỬA SỔ · Đỏ = sát thương TÀU · Vàng = tốc độ cao · Vàng kim = bonus · Cam = trâu · Xanh lá = hỗ trợ/sinh sản · Xanh dương = khống chế · Bạc = giáp phản xạ · Cyan = phân tách · Hồng = yếu đông.
- Shape theo hành vi: nhọn = lao vào tàu · vuông = bám/gặm cửa sổ · tròn = nổ/đẻ/tách · sao = buff/bonus · đa giác đều = trâu/giáp.
- Telegraph 3 phase: chuẩn bị (vàng/chớp chậm) → sắp phát (đỏ, hoặc **tím** nếu đòn hại cửa sổ) → phát động. Lần đầu gặp: banner **"QUÁI MỚI: <tên> — <1 dòng cách khắc chế>"**.
- Quái mới spawn: 0.5s "hiện hình" (bất khả xâm phạm & không gây hại, alpha tăng dần). Mỗi wave debut tối đa **1 loại quái mới**.

## 4. Quy ước ẢI / BOSS

**5 ải campaign**, mỗi ải 10 wave (14–18 phút/ải). Giữa wave: vá +40px, +1 máu, nghỉ 6s. Mini-boss = elite variant ở **wave 5**. Boss cuối = **3 phase** ở **wave 10**, chuyển phase ở 66%/33% HP, mọi đòn telegraph **≥ 0.7s**:

| Ải | Tên | Màu canvas | Mechanic đặc trưng | Quái debut |
|---|---|---|---|---|
| 1 | MÀN HÌNH XANH | gradient `#001133 → #0066CC` | không — ải dạy nền; tutorial chạy wave 1 | Đom Đóm Vàng, Phun Mã Độc |
| 2 | TƯỜNG LỬA | gradient `#1A0D00 → #CC3300` | **Viền gai** chu kỳ 6s (4s bật gây dmg / 2s tắt an toàn) — quái chạm viền lúc bật tự chết | Liều Chết Cảm Tử |
| 3 | TRỌNG LỰC 404 | gradient `#0D0221 → #3A0CA3` | **Trơn trượt** (friction ~0.985), bắn ngược để phanh; đạn viền đẩy cửa sổ mạnh ×2 nhưng cửa sổ trôi quán tính | Đóng Băng Hệ Thống |
| 4 | CÚP ĐIỆN | gradient `#000000 → #0A0A1A` | **Mất điện định kỳ** 20s (sáng 14s / tối 6s); trong tối chỉ thấy outline neon tàu, mắt đỏ quái, telegraph đỏ | Bóng Ma Ẩn |
| 5 | TRÀN BỘ NHỚ | gradient `#0D1B00 → #2D6A00` | **Đấu trường ảo thu hẹp** 8px/10s; nhặt patch xanh nở lại +30px — quản lý 2 "máu" cùng lúc | Khuếch Đại Lỗi, Giáp Gương, Ổ Lỗi Sinh Sản |

**Boss đã có (GAME-DESIGN-DOC §5):** GÃ GẶM KHỔNG LỒ · TƯỜNG LỬA SỐNG · TRỌNG TÂM HỖN LOẠN · MÀN ĐÊM VÔ TẬN · NULL POINTER — KẺ XOÁ CỬA SỔ. Boss mới phải: 3 phase, telegraph ≥ 0.7s mỗi đòn, 1 **điểm yếu rõ ràng** (cửa sổ phản công) và phần thưởng gắn với ải (mở ải tiếp + draft 2/3 + nâng cấp độc quyền).

## 5. Balance — data-driven, không hard-code

- **Số liệu KHÔNG hard-code trong logic.** Mọi chỉ số đọc từ config: `MONSTER_REGISTRY` (14 quái), `BEHAVIORS` (strategy), `STAGES[5]`, `difficulty.config.json` (§8).
- Multiplier độ khó (áp cho cả Campaign): Chill ×0.7 máu / ×0.85 tốc quái · Thường ×1 · Khắc nghiệt ×1.45 máu / ×1.15 tốc, telegraph ×0.75, ngưỡng thua 75%. Bảng đầy đủ ở GAME-DESIGN-DOC §8.2.
- **"Khó nhưng công bằng":** tăng *chất* quái (máu, tốc, telegraph ngắn hơn) — không tăng spawn vượt bảng, boss không thêm pattern mới, không spawn bịp.

## 6. Copy player-facing

- Tiền tệ luôn gọi là **"Mảnh Kính"** (mọi biến thể khác đã bị chốt ở R3).
- Giọng **fu-dever-writer**: Hook → body cụ thể (gạch đầu dòng scan nhanh) → CTA rõ ràng. Tối đa 2–3 emoji có chủ đích: 💎 gem · 🪟 máu cửa sổ · ⚠ nguy hiểm · 🏆 kỷ lục.
- Gọi người chơi là **"bạn"**. Nút ≤ 4 từ. Số kiểu Việt ("12.500 điểm", "Wave 3/10").
- **CẤM zombie language:** "cơ hội vàng", "nhanh tay đăng ký ngay", "vô cùng ý nghĩa", "hành trình đáng nhớ", công thức "Không X. Không Y. Chỉ có Z."
- Banner quái mới phải dạy cách khắc chế trong **1 dòng**. Báo lỗi nói rõ chuyện gì + cách sửa, không lộ jargon (cấm "window.resizeTo() bị chặn").

## 7. Checklist khi đề xuất content mới

- [ ] Tương tác với cơ chế cửa sổ = máu (mục 1)? Nếu không → loại.
- [ ] Telegraph mọi đòn nguy hiểm ≥ 0.5s (boss ≥ 0.7s), đủ visual + âm thanh + text lần đầu?
- [ ] Có **điểm yếu** và **cách khắc chế cụ thể**, 1 dòng giải thích được?
- [ ] Vai trò không trùng 14 quái hiện có; quái mới có template `references/monster-template.md` đã điền đầy đủ?
- [ ] Readability: đúng bảng màu mục tiêu + shape hành vi + 0.5s hiện hình khi spawn?
- [ ] Số liệu nằm trong `MONSTER_REGISTRY` / `BEHAVIORS` / `STAGES` / `difficulty.config.json` — không hard-code?
- [ ] Boss: đủ 3 phase, điểm yếu rõ, phần thưởng gắn ải?
- [ ] Copy theo giọng fu-dever-writer, không zombie language, tiền tệ gọi đúng "Mảnh Kính"?
