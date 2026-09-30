# GAME DESIGN DOCUMENT — WINDOWKILL Web Edition v2
### "Chiến dịch 5 ải · 14 quái · Meta progression"

| | |
|---|---|
| **Phiên bản** | 2.0 — Design lock |
| **Ngày** | 2026-10-01 |
| **Studio** | FU-DEVER Game Studio (CEO: Đặng Quang Nhật) |
| **Lead Game Design** | Tổng hợp từ 5 designer: Systems, Level, Monster, UX Writer, Game Feel |
| **Trạng thái** | ✅ Sẵn sàng implement — mọi số liệu nằm trong doc, không hard-code trong logic |
| **Tài liệu liên quan** | `js/game.js` (engine hiện tại) · `docs/bestiary.md` (spec 14 quái chi tiết) · `studio/game-design/archive/GAME-DESIGN-DOC-act3-v1.md` (bản đề xuất 3-act data-driven — xem §15 để hội tụ) · `ROADMAP.md` (Phase 4–6) |

> Fan-made, lấy cảm hứng từ Windowkill (Steam). TUYỆT ĐỐI không copy art/audio/brand/text của bản gốc. Mọi quái vẽ bằng canvas shape, nhạc/SFX synth bằng Web Audio.

---

## 1. Tầm nhìn & Design Pillars

**Tầm nhìn:** Biến WINDOWKILL Web Edition từ "endless wave demo" thành **game hoàn chỉnh đưa ra thị trường**: chiến dịch 5 ải có cốt truyện, 14 quái với khắc chế rõ ràng, newbie 5 phút hiểu luật, người chơi lâu năm có meta để cày (Xưởng, thành tích, daily).

**Cơ chế signature (không bao giờ thay đổi):** Cửa sổ popup CHÍNH LÀ thanh máu. Quái gặm viền → `window.resizeTo()` thu nhỏ. Bắn vào viền → `window.moveBy()` đẩy cửa sổ bay + hất văng quái bám. Mọi thiết kế mới phải tương tác được với cơ chế này.

**5 trụ cột:**
1. **Cửa sổ là máu** — mọi quái, boss, ải đều đe dọa hoặc chơi đùa với kích thước cửa sổ.
2. **Đọc hiểu trước, phản xạ sau** — mọi đòn nguy hiểm telegraph ≥ 0.5s (visual + âm thanh + text lần đầu). Không có đòn "ăn ngay".
3. **5 phút hiểu luật** — tutorial tương tác trong game, mỗi beat 1 câu ≤ 12 từ, không wall-of-text.
4. **Khắc chế rõ ràng** — mỗi quái có điểm yếu + cách khắc chế cụ thể; người chơi thua vì chọn sai chiến thuật, không phải vì số liệu bịp.
5. **Công bằng tuyệt đối** — skin chỉ đổi ngoại hình; daily challenge cùng seed cho mọi người; Khắc nghiệt khó vì quái mạnh hơn, không phải vì spawn bịp.

---

## 2. Quyết định của Lead (hòa giải các bản thiết kế)

Team 5 người làm song song nên có điểm vênh — Lead chốt như sau. Engineering chỉ cần đọc phần này + các section chi tiết.

| # | Vấn đề | Quyết định |
|---|---|---|
| R1 | Systems đề xuất "Mốc thâm nhập" (không chia ải) vs Level đề xuất 5 ải | **Chọn 5 ải của Level Designer** (đúng yêu cầu CEO). "Mốc thâm nhập" (Vùng ven / Tâm bão / Lõi hệ thống / Vực sâu / Vô định) dùng làm banner flavor trong Endless mode. |
| R2 | Nhịp boss: cũ là "mỗi 5 wave" vs mới "mini-boss wave 5 + boss wave 10 mỗi ải" | **Campaign:** wave 5 mỗi ải = mini-boss (elite variant), wave 10 = boss cuối ải. **Endless:** giữ nhịp boss mỗi 5 wave như cũ. |
| R3 | Tên tiền meta: Systems "Mảnh kính" vs UX Writer placeholder "xu" | **Chốt: MẢNH KÍNH.** Mọi copy dùng "mảnh kính". |
| R4 | Slot quái mới trong bảng wave của Level (`[quái bắn tỉa]`, `[quái cảm tử]`, `[quái từ]`, `[quái nhiễu]`) vs 8 quái của Monster | Map chính thức (xem §6): Ải 1 = Đom Đóm Vàng (w2) + Phun Mã Độc (w6); Ải 2 = Liều Chết Cảm Tử (w3); Ải 3 = Đóng Băng Hệ Thống (w3, thay slot `[quái từ]` — quái hút dời sang ý tưởng P2 vì boss ải 3 đã có đòn hút); Ải 4 = Bóng Ma Ẩn (w3, khớp `[quái nhiễu]`); Ải 5 = Khuếch Đại Lỗi (w6) + Giáp Gương (w7) + Ổ Lỗi Sinh Sản (w8) — ải 5 là "ải elite". |
| R5 | Số liệu độ khó vênh giữa 2 bản | Campaign dùng bảng multiplier của Level (§8.2); Endless dùng bảng + công thức của Systems (§8.1). Cả hai đọc từ cùng `difficulty.config.json`. |
| R6 | Tutorial chạy ở "wave 1" chung chung | Tutorial 10 beat chạy trên **Ải 1 – Wave 1 scripted**. Xong tutorial → vào wave 2 ải 1 bình thường. |
| R7 | Tên ải/boss UX Writer để placeholder | Đã điền tên thật từ Level Designer vào toàn bộ copy deck (§12). |
| R8 | Bản `archive/GAME-DESIGN-DOC-act3-v1.md` (3 act data-driven) vs bản này | Hai bản **hội tụ** được: giữ thiết kế 5 ải + 14 quái của bản này, implement bằng kiến trúc data-driven (`MONSTER_REGISTRY`, `BEHAVIORS`, config Act→Stage) của bản archive. Chi tiết §15. |

---

## 3. Core Loop v2

```
Launcher → Chọn ải (màn chọn ải, ải khóa hiện ổ khóa)
  → Ải: 10 wave (wave 1 ải 1 scripted tutorial nếu lần đầu)
    → Wave: giết quái → nhặt 💎 → lên cấp → draft 1/3 nâng cấp
    → Hết wave: vá cửa sổ +40px, +1 máu, nghỉ 6s
    → Wave 5: MINI-BOSS → rớt 20 gem + draft 1/3 ngay + vá +60px
    → Wave 10: BOSS 3 phase → thắng: vá 100% + hồi đầy máu + draft 2/3 + mở ải tiếp
  → Phá đảo ải 5 → mở CHẾ ĐỘ VÔ TẬN + credits
  → Meta sau mỗi run: mảnh kính → Xưởng / skin; thành tích; daily challenge
```

**Điều kiện thua (không đổi):** tàu hết tim HOẶC cửa sổ bị gặm nhỏ hơn ngưỡng (mặc định 65% kích thước gốc ở Thường; Chill 50%, Khắc nghiệt 75%).

---

## 4. Hệ thống Ải — Chiến dịch 5 ải

**Khung chung:** mỗi ải 10 wave, 14–18 phút/ải, cả chiến dịch ~75–90 phút. Giữa wave: vá +40px & +1 máu, draft khi lên cấp. Lưu `unlockedStage` + `stageBest` theo profile. Spawn theo đợt (≤12 con/đợt, đợt sau ra khi đợt trước còn ≤4 con), tổng entity < 120.

**Vũ trụ:** Bạn là tiến trình diệt virus cuối cùng của hệ điều hành FU-OS. Quái là "bug/lỗi hệ thống" đang gặm các cửa sổ. Cửa sổ trình duyệt của bạn là pháo đài cuối cùng.

### ẢI 1 — "MÀN HÌNH XANH" (dạy nền)
- **Cốt truyện:** Một lỗi lạ ("bug tím") tràn ra từ Màn Hình Xanh Chết Chóc và bắt đầu gặm các cửa sổ hệ thống.
- **Màu canvas:** gradient `#001133 → #0066CC` (xanh FU-DEVER), pixel vuông `#66B2FF` trôi chậm, lưới `#004C99`.
- **Mechanic:** không bẫy môi trường — ải dạy nền. Chewer xuất hiện từ wave 2 kèm tutorial prompt.
- **Kỹ năng dạy:** di chuyển + bắn; **cửa sổ = máu**; **bắn vào viền để hất chewer** (`moveBy`).
- **Quái mới:** Đom Đóm Vàng (wave 2), Phun Mã Độc (wave 6).

| Wave | Thành phần (Thường) | Nhịp độ |
|---|---|---|
| 1 | 5 chaser — **scripted cho tutorial 10 beat** | Làm quen, quái spawn xa 10s đầu |
| 2 | 6 chaser + 3 chewer (+ Đom Đóm Vàng 15%) | Tutorial prompt về chewer + hất viền |
| 3 | 8 chaser | Luyện ngắm, rớt gem nhiều |
| 4 | 5 chewer + 4 chaser | Bài kiểm tra hất chewer |
| 5 | **MINI-BOSS: Chewer Cổ Đại** + 4 chaser | Chewer khổng lồ, gặm nhanh gấp đôi; bị hất lần đầu → tách 2 chewer thường |
| 6 | 6 chaser + 2 Phun Mã Độc | Giới thiệu: đường ngắm đỏ, đạn chậm 170 |
| 7 | 4 dasher + 6 chaser + 2 Phun Mã Độc | Giới thiệu dasher |
| 8 | 3 splitter + 5 chaser | Nghỉ-farm gem trước wave 9 |
| 9 | 8 chaser + 4 dasher + 3 chewer + 2 Phun Mã Độc | Tổng duyệt, 4 đợt dồn dập |
| 10 | **BOSS: GÃ GẶM KHỔNG LỒ** (xem §5) | Trước boss: vá full + 8s chuẩn bị |

### ẢI 2 — "TƯỜNG LỬA" (dạy vị trí viền)
- **Cốt truyện:** Hệ thống dựng Tường Lửa quanh cửa sổ: viền mọc gai năng lượng. Gai đâm chết mọi thứ chạm vào — kể cả tàu bạn.
- **Màu canvas:** gradient `#1A0D00 → #CC3300`, lưới lục giác `#FF7722` mờ, hạt lửa bay lên.
- **Mechanic — VIỀN GAI:** khung viền trong canvas nhấp nháy chu kỳ 6s (4s "bật" gây sát thương → 2s "tắt" an toàn, viền xám). Quái chạm viền lúc "bật": ăn sát thương lớn (chewer bám tự chết sau ~4s). **Tàu chạm viền: mất 1 máu + bị đẩy bật vào trong.** Implement: va chạm AABB với khung viền trong canvas, không cần API mới.
- **Kỹ năng dạy:** kiểm soát vị trí gần viền; **dùng đạn bắn vào viền để đẩy cửa sổ** thay vì tự bay ra mép; đọc chu kỳ gai.
- **Quái mới:** Liều Chết Cảm Tử (wave 3).

| Wave | Thành phần | Nhịp độ |
|---|---|---|
| 1 | 6 chaser | Làm quen gai: quái chạm viền tự chết |
| 2 | 6 chewer + 2 chaser | Bài học: để gai đâm chewer 4s thay vì vội bắn |
| 3 | 7 chaser + 3 Liều Chết Cảm Tử | Giới thiệu cảm tử: vòng đỏ telegraph 0.6s trước nổ |
| 4 | 5 dasher + 4 chaser | Nghỉ kỹ năng: dụ dasher lao vào gai |
| 5 | **MINI-BOSS: Dasher Xuyên Gai** + 3 cảm tử | Bọc giáp gai (miễn nhiễm gai viền); lao 3 lần chữ Z |
| 6 | 6 chewer + 5 chaser + 2 cảm tử | Ưu tiên hất chewer ra gai đang "bật" |
| 7 | 2 splitter + 6 chaser + 3 cảm tử | Mini từ splitter bị gai dọn — farm gem |
| 8 | 1 tank + 6 chaser | Nghỉ-farm; đừng để tank đẩy bạn vào gai |
| 9 | 10 chaser + 5 cảm tử + 4 dasher | Áp lực viền tối đa, 4 đợt dồn dập |
| 10 | **BOSS: TƯỜNG LỬA SỐNG** | Gai tắt 2.5s sau mỗi đợt quét = cửa sổ phản công |

### ẢI 3 — "TRỌNG LỰC 404" (dạy quán tính)
- **Cốt truyện:** Module vật lý FU-OS lỗi: trọng lực không tồn tại. Mọi thứ trơn như băng — tàu, đạn, và cả cú đẩy cửa sổ.
- **Màu canvas:** gradient `#0D0221 → #3A0CA3`, đường cong xoáy `#9D4EDD` mờ, sao trôi quỹ đạo cong.
- **Mechanic — TRƠN TRƯỢT (friction ~0.985):** tàu giữ vận tốc khi thả phím; phanh = bay ngược hướng. Đạn vào viền đẩy cửa sổ **mạnh gấp đôi** nhưng cửa sổ **trôi quán tính** (lên lịch `moveBy` nhỏ dần trong 300ms — chỉ dùng API cũ gọi nhiều lần). Vùng "đệm khí" giữa màn hình: đứng yên 3s trong vòng tròn trung tâm → tàu tự ổn định.
- **Kỹ năng dạy:** quản lý quán tính; **bắn ngược để phanh**; tính lực đẩy cửa sổ có chủ đích.
- **Quái mới:** Đóng Băng Hệ Thống (wave 3).

| Wave | Thành phần | Nhịp độ |
|---|---|---|
| 1 | 5 chaser | Prompt: "Thả phím — tàu vẫn trôi! Bay ngược để phanh." |
| 2 | 6 chaser + 3 chewer | Hất chewer khi đang trượt — học bắn ngược phanh |
| 3 | 4 Đóng Băng Hệ Thống + 5 chaser | Giới thiệu: đạn băng làm chậm tàu; viền bị đóng băng 8s (chewer miễn hất văng) → đổi chiến thuật bắn thẳng chewer |
| 4 | 6 dasher | Nghỉ kỹ năng: né lao bằng trượt ngang |
| 5 | **MINI-BOSS: Tank Từ Trường** + 4 chaser | Tank tím + vành từ: mỗi 8s hút tàu 1.5s |
| 6 | 2 tank + 6 chaser + 2 Đóng Băng | Tank + slow = bẫy kẹp — giữ khoảng cách |
| 7 | 4 dasher + 4 Đóng Băng + 3 chewer | Ưu tiên diệt Đóng Băng trước |
| 8 | 3 splitter + 6 chaser | Nghỉ-farm; mini trượt nhanh — coi chừng |
| 9 | 8 dasher + 6 chaser + 3 Đóng Băng | Tổng duyệt: né lao + chống slow |
| 10 | **BOSS: TRỌNG TÂM HỖN LOẠN** | Sau xung hút → quá tải 3s (xám, đứng yên) = dồn sát thương ×2 |

### ẢI 4 — "CÚP ĐIỆN" (dạy định vị mù)
- **Cốt truyện:** Bug cắn đứt cáp nguồn. Đèn tắt định kỳ, chỉ còn ánh chớp từ họng súng. Lũ bug nhiễu chỉ hiện nguyên hình khi không ai nhìn thấy.
- **Màu canvas:** gradient `#000000 → #0A0A1A`; khi có điện: lưới neon `#00E5FF` chập chờn; sao là tia lửa điện.
- **Mechanic — MẤT ĐIỆN ĐỊNH KỲ:** chu kỳ 20s (sáng 14s → tối 6s; Chill tối 4s / Khắc nghiệt tối 8s). Khi tối: phủ đen alpha 0.92; chỉ hiện tàu (outline neon), chớp nòng, vụ nổ, **mắt đỏ của quái** và **đường telegraph đỏ**. Pickup "pin" hiếm → soi sáng vùng quanh tàu 10s. Mỗi loại quái có tiếng gầm riêng trước khi tấn công (Web Audio).
- **Kỹ năng dạy:** định vị bằng telegraph thị giác + âm thanh; không xả đạn bừa khi tối (đạn vẫn đẩy cửa sổ!).
- **Quái mới:** Bóng Ma Ẩn (wave 3).

| Wave | Thành phần | Nhịp độ |
|---|---|---|
| 1 | 6 chaser | Lần mất điện đầu: "Nhìn mắt đỏ! Nghe tiếng gầm!" |
| 2 | 5 chewer + 4 chaser | Chewer trong tối: nghe tiếng gặm (audio cue riêng) |
| 3 | 4 Bóng Ma Ẩn + 5 chaser | Giới thiệu: ẩn/hiện 1.8s/0.6s; đạn băng hiện hình 3s |
| 4 | 6 dasher | Nghỉ kỹ năng: tiếng "rít" 0.8s trước khi lao — né theo âm thanh |
| 5 | **MINI-BOSS: Splitter Nhiễu** + 3 chaser | Tách ra mini nhiễu + 1 mini "bóng" (không gây dmg, lừa 5s) |
| 6 | 3 splitter + 5 chaser + 3 Bóng Ma | Ưu tiên diệt splitter khi đèn sáng |
| 7 | 2 tank + 4 Phun Mã Độc + 4 chaser | Sniper trong tối: đường ngắm đỏ là cứu tinh |
| 8 | 6 chewer + 6 chaser | Nghỉ-farm: rớt pin đèn pin nhiều |
| 9 | 8 Bóng Ma + 6 dasher + 3 cảm tử | Hỗn loạn tối đa — mất điện 8s/lần |
| 10 | **BOSS: MÀN ĐÊM VÔ TẬN** | Mất điện 50% thời gian fight; bắn vào con ngươi lúc nó sáng rực = ×1.5 dmg |

### ẢI 5 — "TRÀN BỘ NHỚ" (tổng duyệt — ải elite)
- **Cốt truyện:** Lõi FU-OS. Bug gây tràn bộ nhớ: vùng an toàn bị ăn mòn dần. Giết bug thu "bản vá bộ nhớ" (patch) nới rộng vùng an toàn. Ở trung tâm là **NULL POINTER** — thực thể đang cố `resizeTo(0,0)` xóa sổ cửa sổ của bạn.
- **Màu canvas:** gradient `#0D1B00 → #2D6A00` chuyển dần sang đỏ `#4A0000` khi vùng thu hẹp; mưa ký tự hex; viền vùng an toàn đỏ nhấp nháy.
- **Mechanic — ĐẤU TRƯỜNG ẢO THU HẸP:** toàn ải dùng đấu trường ảo (fallback đã có): co 8px mỗi 10s (từ 90% canvas về tối thiểu 35%). Giết quái rớt **patch xanh**: nhặt → nở lại +30px (tối đa 90%). Chạm viền vùng: tàu mất máu theo thời gian, quái bị đẩy vào trong. Cửa sổ thật vẫn là máu (chewer gặm `resizeTo`) — **quản lý 2 "máu" cùng lúc**.
- **Kỹ năng dạy:** quản lý không gian; ưu tiên mục tiêu; không camp giữa.
- **Quái mới (debut ải elite):** Khuếch Đại Lỗi (w6), Giáp Gương (w7), Ổ Lỗi Sinh Sản (w8).

| Wave | Thành phần | Nhịp độ |
|---|---|---|
| 1 | 6 chaser | Prompt: "Nhặt patch xanh để nới vùng an toàn!" |
| 2 | 6 chewer + 4 chaser | Quản lý 2 "máu": cửa sổ + vùng an toàn |
| 3 | 4 cảm tử + 6 chaser | Giữ khoảng cách bằng moveBy đẩy cửa sổ |
| 4 | 2 tank + 6 chaser | Nghỉ-farm: tank rớt patch nhiều |
| 5 | **MINI-BOSS: Chewer Chúa Tể** + 4 dasher | Vương miện đỏ; gặm kép: mỗi giây bám viền, vùng an toàn thu thêm 4px |
| 6 | 4 Phun Mã Độc + 6 chaser + 2 Khuếch Đại Lỗi | Debut Khuếch Đại Lỗi: aura +40% tốc bầy, gặm nhanh ×1.4 → **giết nó đầu tiên** |
| 7 | 4 dasher + 4 Bóng Ma + 4 chewer + 1 Giáp Gương | Debut Giáp Gương: đạn trúng mặt trước bị phản xạ (nứt viền!) → vòng sau lưng, đạn xuyên bỏ qua gương |
| 8 | 3 splitter + 8 chaser + 1 Ổ Lỗi Sinh Sản | Debut Ổ Lỗi: đẻ trứng 1/4s, trứng 1 hit vỡ, trứng dính viền → nở thành chewer → đẩy mẹ ra giữa map |
| 9 | 10 chaser + 4 tank + 4 cảm tử + 2 Phun Mã Độc | Bài thi tốt nghiệp: 5 đợt dồn dập, không nghỉ |
| 10 | **BOSS: NULL POINTER — KẺ XOÁ CỬA SỔ** | Phase 3: đếm ngược 20s `resizeTo(0,0)` — cuộc đua DPS |

### Chế độ VÔ TẬN (mở sau khi phá đảo ải 5)
- Quay vòng 5 ải (1→5→1...), mỗi vòng **+25% máu quái, +15% sát thương** (stack cộng dồn). Mechanic đặc trưng mỗi ải giữ nguyên.
- Mỗi vòng quay lại ải 1: vá full + hồi đầy máu (1 lần/vòng).
- Boss mỗi 5 wave (nhịp cũ). Bảng xếp hạng endless riêng per profile.
- Banner mốc: "Vùng ven" (w5) → "Tâm bão" (w10) → "Lõi hệ thống" (w15) → "Vực sâu" (w20) → "Vô định" (w25+).

---

## 5. Boss cuối ải (5 boss — 3 phase)

*Khung chung: phase chuyển tại 66% / 33% HP. Mọi đòn telegraph ≥ 0.7s (vẽ trước đỏ/vàng + âm thanh cảnh báo). HP theo công thức: `HP_boss ≈ DPS_kỳ_vọng × 150s` → fight ~2–3 phút. Hạ boss: vá cửa sổ 100% + hồi đầy máu + draft 2/3 nâng cấp + mở ải tiếp.*

### BOSS 1 — "GÃ GẶM KHỔNG LỒ" (ải 1)
- **Hình dạng:** chewer phóng to 6×, thân tím bầu dục, hàm răng hình khung cửa sổ trắng nhấp nháy, 6 chân bám. Di chuyển chậm về viền gần nhất để gặm.
- **Phase 1 (100–66%):** (1) *Phun đạn quạt*: đứng yên 1s (miệng há, sáng đỏ) → phun 7 viên đạn tím hình quạt về phía tàu. (2) *Gọi đàn em*: gầm (sóng âm vẽ vòng tròn) → spawn 3 chewer ở viền ngẫu nhiên.
- **Phase 2 (66–33%):** thêm (3) *Nện cửa sổ*: nhảy lên giữa màn hình (bóng đổ telegraph 1s) → nện xuống, `resizeTo` thu cửa sổ 30px tức thì + sóng xung kích vòng tròn phải né.
- **Phase 3 (33–0%):** đạn quạt thành 2 đợt liên tiếp; gọi 4 chewer; nện nhanh hơn (telegraph 0.7s).
- **Điểm yếu:** khi há miệng phun đạn (1s đứng yên) — xả đạn vào miệng ×1.5 sát thương (tâm ngắm vàng). Hất chewer con bằng đạn viền trước khi chúng gặm.
- **Thưởng:** mở ải 2 + draft 2/3 + huy hiệu "Diệt Gặm".

### BOSS 2 — "TƯỜNG LỬA SỐNG" (ải 2)
- **Hình dạng:** đoạn tường gai dài 1/3 viền màn hình (gạch cam + gai tam giác nhấp nháy), trượt dọc viền như rắn lửa. Máu hiển thị trên thanh boss.
- **Phase 1:** (1) *Mưa gai*: gai sáng đỏ 0.8s → bắn 10 gai nhọn bay thẳng vào trong. (2) *Quét viền*: tường trượt nhanh 1 vòng quanh viền (vệt lửa telegraph 1s) — tàu chạm viền lúc này mất 2 máu.
- **Phase 2:** thêm (3) *Nhả cảm tử*: "đẻ" 3 Liều Chết Cảm Tử từ gai, lao ngay vào tàu.
- **Phase 3:** tường tách 2 đoạn quét ngược chiều; mưa gai 2 đợt chéo.
- **Điểm yếu:** sau mỗi đợt *quét viền*, gai **tắt 2.5s** (xám lại — đúng chu kỳ đã dạy) → áp sát bắn thân tường ×2 sát thương. Không đứng sát viền khi tường sáng đỏ.
- **Thưởng:** mở ải 3 + draft 2/3 + nâng cấp độc quyền ải: **"Gai Phản"** (tàu chạm viền gây 3 dmg cho quái trong 120px).

### BOSS 3 — "TRỌNG TÂM HỖN LOẠN" (ải 3)
- **Hình dạng:** lõi cầu tím phát sáng, 3 vành quỹ đạo xoay (`#9D4EDD`), tâm là biểu tượng nam châm. Lơ lửng, di chuyển đường sin.
- **Phase 1:** (1) *Xung hút*: phồng to (telegraph 1s, vòng tím lan ra) → hút tàu + đạn người chơi 2s (đạn bị hút vô hiệu). (2) *Mìn quỹ đạo*: thả 4 mìn lên vành, trôi theo vành, chạm nổ.
- **Phase 2:** thêm (3) *Giật cửa sổ*: "kéo" cửa sổ trình duyệt — `moveBy` ngẫu nhiên 3 lần liên tiếp + rung màn hình. Bay bù quán tính.
- **Phase 3:** xung hút + giật cửa sổ **đồng thời**; mìn tăng lên 8, vành xoay nhanh gấp đôi.
- **Điểm yếu:** sau mỗi *xung hút*, lõi **quá tải 3s** (xám, đứng yên, ngừng hút) → mọi sát thương ×2. Mẹo: ngừng bắn lúc hút, dồn đạn lúc quá tải.
- **Thưởng:** mở ải 4 + draft 2/3 + nâng cấp độc quyền: **"Neo Quán Tính"** (Shift: dừng trượt tức thì, hồi chiêu 8s).

### BOSS 4 — "MÀN ĐÊM VÔ TẬN" (ải 4)
- **Hình dạng:** không thân cố định — **đôi mắt đỏ khổng lồ** trôi trong bóng tối + outline tím lóe khi tấn công. Thanh máu boss luôn hiện.
- **Phase 1 (mất điện 50% thời gian):** (1) *Tia quét mắt*: 2 đường telegraph đỏ song song 1s → laser quét ngang màn hình, né bằng bay lên/xuống. (2) *Gọi nhiễu*: spawn 3 Bóng Ma Ẩn từ bóng tối.
- **Phase 2:** thêm (3) *Vùng tối di động*: 2 vùng đen đặc (kể cả đèn pin không xuyên) trôi 8s — quái trong vùng ẩn mắt đỏ.
- **Phase 3:** tia quét thành chữ X; mắt nhân đôi (4 mắt, 2 cặp tia so le); vùng tối tăng lên 3.
- **Điểm yếu:** trước mỗi đòn, mắt **sáng rực 1s** (telegraph) — lúc này **nhận ×1.5 sát thương** (bắn vào con ngươi). Khi đèn sáng: outline hiện rõ — dồn sát thương. Đừng xả đạn trong vùng tối di động.
- **Thưởng:** mở ải 5 + draft 2/3 + nâng cấp độc quyền: **"Mắt Cú"** (lúc mất điện, hiện outline mờ mọi quái trong 200px quanh tàu).

### BOSS 5 — "NULL POINTER — KẺ XOÁ CỬA SỔ" (ải 5, boss cuối)
- **Hình dạng:** con trỏ chuột khổng lồ bị lỗi (mũi tên vỡ, pixel tím rơi), kéo đuôi là các khung cửa sổ vỡ. Tay cầm hàm `resizeTo(0,0)` phát sáng đỏ.
- **Phase 1 (100–66%) — "Tổng duyệt ải 1–2":** (1) *Gặm hệ thống*: gọi 4 chewer + tự gặm viền (thu cửa sổ 20px/5s khi bám). (2) *Viền gai ma*: dựng gai tạm trên 1 viền ngẫu nhiên 6s (tái hiện ải 2, telegraph vàng).
- **Phase 2 (66–33%) — "Tổng duyệt ải 3–4":** thêm (3) *Xung hỗn loạn*: tắt đèn 4s + trơn trượt toàn sân 10s (tái hiện ải 3+4); boss tàng hình chỉ còn mắt đỏ. (4) *Mưa con trỏ*: 12 con trỏ nhỏ (đạn) bay zigzag về phía tàu.
- **Phase 3 (33–0%) — "Lệnh Xóa":** boss đứng yên, giơ cao hàm `resizeTo(0,0)` — **đếm ngược 20s** giữa màn hình. Mỗi 5s `resizeTo` thu cửa sổ 40px. Giết boss trước khi hết giờ = thắng; hết giờ = cửa sổ về 0 = thua ngay (bất kể máu tàu). Đồng thời vẫn phun đạn quạt + gọi chewer gây áp lực.
- **Điểm yếu:** phase 3 là đua DPS thuần — dồn mọi nâng cấp vào boss, bỏ qua quái con (chỉ né). Giữ vị trí giữa vùng an toàn đang thu hẹp; nhặt patch để có chỗ đứng.
- **Thưởng:** credits + mở **CHẾ ĐỘ VÔ TẬN** + skin "Hacker FU-DEVER" + danh hiệu "NGƯỜI GIỮ CỬA SỔ".

### Mini-boss giữa ải (wave 5 mỗi ải)
*Elite variant = quái thường phóng to 2.5×, HP ×8, thêm đúng 1 đòn mới. Hạ: rớt 20 gem + **draft 1/3 ngay** + vá +60px.*

| Ải | Mini-boss | Đòn thêm |
|---|---|---|
| 1 | **Chewer Cổ Đại** (răng vàng, gặm nhanh gấp đôi) | Bị hất khỏi viền lần đầu → tách 2 chewer thường |
| 2 | **Dasher Xuyên Gai** (giáp gai cam, miễn nhiễm gai viền) | Lao 3 lần chữ Z (mỗi lần telegraph 0.5s) |
| 3 | **Tank Từ Trường** (tím sẫm, vành từ tính) | Mỗi 8s hút tàu 1.5s (vòng tím telegraph) |
| 4 | **Splitter Nhiễu** (nửa ẩn nửa hiện) | Khi tách: thêm 1 mini "bóng" (không gây dmg, lừa 5s) |
| 5 | **Chewer Chúa Tể** (vương miện đỏ) | Gặm kép: mỗi giây bám viền, vùng an toàn thu thêm 4px |

---

## 6. Bestiary — 14 quái

> Spec chi tiết từng con (state machine, chỉ số, cách vẽ canvas): **`docs/bestiary.md`**. Dưới đây là bảng tổng hợp + quy ước readability.

### 6.1. Bảng cân bằng

| id | Tên Việt | Vai trò | Máu (×hpM) | Tốc (×spM) | Đe dọa chính | XP | Khắc chế tóm tắt |
|---|---|---|---|---|---|---|---|
| chaser | Truy Đuổi | đuổi / dmg tàu | 2+wave*0.5 | 95+wave*7 | chạm tàu | 1 | Giữ khoảng cách, bắn khi nó lượn |
| chewer | Gặm Viền | gặm cửa sổ | 3+wave*0.4 | 78+wave*4 | ~15px/s cửa sổ khi bám | 2 | Bắn vào viền gần nó để hất văng |
| tank | Xe Tăng | tanker | 12+wave*2.2 | 46 | chắn đường, trâu | 4 | Đạn xuyên / vòng sau, dồn dmg |
| dasher | Lao Tới | sát thủ dash | 4+wave*0.5 | 120+wave*5 | dash bất ngờ /3s | 2 | Né ngang khi aim đỏ, đừng đứng yên |
| splitter | Phân Thân | phân tách | 7+wave | 70+wave*4 | chết → 2 mini | 3 | Giết ở xa, lùi ra trước khi vỡ |
| mini | Mini | quấy rối | 1.5 | 150 | theo bầy | 1 | Đạn băng → vỡ ngay |
| spitter | Phun Mã Độc | bắn xa | 5+wave*0.7 | 70 | đạn 170 + nứt viền | 3 | Áp sát vòng sau lưng lúc aim 0.6s |
| booster | Khuếch Đại Lỗi | buff bầy | 6+wave*0.8 | 55 | aura +40% tốc, gặm ×1.4 | 3 | **GIẾT ĐẦU TIÊN**; đạn băng tắt aura 3s |
| bomber | Liều Chết Cảm Tử | kamikaze | 4+wave*0.6 | 130+wave*5 | nổ AoE r100 + nứt viền | 2 | Giết từ >150px; đẩy ra giữa map |
| freezer | Đóng Băng Hệ Thống | khống chế | 6+wave*0.7 | 60 | slow 50% + băng viền 8s | 3 | Né đạn băng; viền băng → bắn thẳng chewer |
| warden | Giáp Gương | tanker phản xạ | 16+wave*2.5 | 40 | phản xạ nứt viền, hộ vệ chewer | 5 | Vòng sau lưng; đạn xuyên; hất xoay |
| glimmer | Đom Đóm Vàng | bonus | 2 (cố định) | 175 | không (chạy trốn 12s) | 1 (rớt 5 gem) | Chặn đầu hướng viền; đạn băng |
| phantom | Bóng Ma Ẩn | tàng hình | 3+wave*0.5 | 150/0 | dmg bất ngờ + rạch viền | 3 | Đạn băng hiện hình 3s; đứng xa viền |
| broodmother | Ổ Lỗi Sinh Sản | đẻ trứng | 14+wave*1.8 | 38 | 1 trứng/4s → mini/chewer | 6 | Bắn trứng (1 hit); đẩy mẹ ra giữa map |

**Cơ chế window-as-HP mới cần thêm vào engine** (từ Monster Designer):
- `crackEdge(edge)` — vết nứt viền: mỗi vết +25% lượng chewer gặm tại viền đó (tối đa 3 vết/viền); vẽ zigzag `#7c3aed`; wave clear vá toàn bộ.
- `G.frozenEdges = {left:0,...}` — viền bị đóng băng 8s: chewer đang bám MIỄN NHIỄM hất văng; vẽ lớp băng `#38bdf8` alpha 0.5 + ❄.
- `G.windowGaps` — khe hở khi Đom Đóm Vàng trốn thoát: lần `shrinkWindow` tiếp theo tại viền đó +10px.

### 6.2. Quy ước readability (bắt buộc mọi quái mới)
- **Màu theo mục tiêu:** Tím = đe dọa CỬA SỔ · Đỏ = sát thương TÀU · Vàng = tốc độ cao · Vàng kim = bonus · Cam = trâu · Xanh lá = hỗ trợ/sinh sản (giết sớm) · Xanh dương = khống chế/băng · Bạc = giáp phản xạ · Cyan = phân tách · Hồng = yếu đông.
- **Shape theo hành vi:** nhọn/tam giác = lao vào tàu · vuông = bám/gặm cửa sổ · tròn = nổ/đẻ/tách · sao = buff/bonus · đa giác đều = trâu/giáp.
- **Telegraph 3 phase:** chuẩn bị (vàng/chớp chậm) → sắp phát (đỏ/chớp nhanh; đòn hại cửa sổ dùng TÍM) → phát động. Kèm âm thanh + text tiếng Việt lần đầu gặp.
- **Quái mới spawn:** 0.5s "hiện hình" (bất khả xâm phạm & không gây hại, alpha tăng dần).
- **Wave debut:** banner "QUÁI MỚI: <tên> — <1 dòng cách khắc chế>". Mỗi wave debut tối đa 1 loại quái mới.

### 6.3. Nâng cấp 6 quái cũ (tóm tắt — chi tiết trong `docs/bestiary.md` §3)
- **chaser:** elite `chaser_alpha` từ wave 6 (máu ×2, vệt đỏ); bay đội hình chữ V từ wave 8; chớp đỏ 0.3s trước khi chạm (dạy timing né).
- **chewer:** báo gặm 0.5s trước mỗi lần gặm (viền rung + răng cưa chớp + tiếng rộp rộp); elite "chewer bự" wave 7+ (cần 2 phát bắn viền mới hất văng); bị hất → choáng 1.5s (cửa sổ phản công).
- **tank:** đòn húc wave 6+ (windup 0.6s → húc 3× tốc); chết rơi 2 mini wave 5+; lõi giữa thân trúng đạn ×1.5 dmg (reward aim chuẩn).
- **dasher:** đường aim 3 phase màu (vàng mờ → vàng chớp nhanh → ĐỎ 0.15s cuối); dash giả 30% wave 7+ (hủy giữa chừng, aim lại); vệt tàn ảnh khi dash.
- **splitter:** báo vỡ khi máu <50% (phồng + rung 0.5s); tách 3 mini wave 8+ (mini con máu 1); mini con kế thừa knockback.
- **mini:** nhịp bầy đàn (3s đuổi → 1s tản); mini vàng 10% wave 9+ (rớt 2 gem); mini đang slow trúng thêm đạn băng → vỡ tan.

---

## 7. Nâng cấp (Upgrades)

### 7.1. 12 nâng cấp hiện tại — giữ nguyên
Tốc bắn +30% · +1 tia đạn (max 4) · Sát thương +1 · Tốc chạy +18% · +1 máu max & hồi 1 · Đạn xuyên +1 · Nam châm +60% · Giáp gai · +30% điểm · Đạn nhanh +25% · +50% rớt đồ · Đạn băng (slow 1.5s).

### 7.2. 6 nâng cấp MỚI

| # | Tên | Hiệu ứng | Nguồn |
|---|---|---|---|
| 1 | **Gai Phản** | Tàu chạm viền gây 3 dmg cho quái trong 120px | Thưởng boss ải 2 (độc quyền ải) |
| 2 | **Neo Quán Tính** | Nhấn Shift: dừng trượt tức thì, hồi chiêu 8s | Thưởng boss ải 3 (độc quyền ải) |
| 3 | **Mắt Cú** | Lúc mất điện: hiện outline mờ mọi quái trong 200px quanh tàu | Thưởng boss ải 4 (độc quyền ải) |
| 4 | **Đạn Nổ** | Đạn nổ AoE r60, 1 dmg lan — dọn trứng/bầy mini | Pool chung (khắc chế Ổ Lỗi Sinh Sản) |
| 5 | **Đạn Xích** | Đạn trúng quái nảy sang quái gần nhất trong 150px, 50% dmg | Pool chung |
| 6 | **Keo Tự Vá** | Mỗi 20s tự vá +10px cửa sổ | Pool chung (van an toàn cho newbie) |

Nâng cấp độc quyền ải (1–3) chỉ xuất hiện trong draft sau khi hạ boss ải tương ứng — tạo cảm giác "chiến lợi phẩm".

### 7.3. Cây nâng cấp vĩnh viễn — "XƯỞNG" (meta, 10 node)

Mua bằng **mảnh kính**, cộng dồn vào mọi run sau. Mở node theo tổng mảnh đã kiếm lifetime HOẶC wave cao nhất từng đạt.

| # | Tên | Hiệu ứng | Giá (mảnh) | Điều kiện mở |
|---|---|---|---|---|
| 1 | Khung gia cố I/II/III | +1 máu tối đa đầu run (tối đa +3) | 50 / 120 / 250 | mặc định |
| 2 | Nòng đôi I/II/III | +10% tốc bắn/cấp (tối đa +30%) | 60 / 140 / 300 | tổng 100 mảnh |
| 3 | Đạn chuẩn I/II | +1 sát thương đạn/cấp (tối đa +2) | 100 / 250 | đạt wave 5 |
| 4 | Động cơ phản lực I/II/III | +8% tốc chạy/cấp (tối đa +24%) | 40 / 100 / 220 | mặc định |
| 5 | Nam châm hút I/II/III | +25% bán kính hút gem/cấp (tối đa +75%) | 30 / 80 / 180 | tổng 60 mảnh |
| 6 | Keo siêu dính I/II | vá cuối wave +60px / +80px (thay vì 40px) | 80 / 200 | đạt wave 5 |
| 7 | Giáp gai I/II | gai phản 2 / 4 dmg khi quái chạm | 120 / 280 | đạt wave 8 |
| 8 | Mồi thơm I/II | +15% / +30% tỉ lệ rớt pickup | 90 / 210 | tổng 200 mảnh |
| 9 | Trợ lý kỹ thuật | bắt đầu run với 1 nâng cấp ngẫu nhiên | 350 | đạt wave 10 |
| 10 | Túi cứu sinh | 1 lần/run: máu về 0 → hồi 1 máu + bất tử 2s | 400 | giết 1 boss |

Tổng full cây: 3.580 mảnh ≈ 60–80 giờ chơi. Mỗi node đều thay đổi cảm giác chơi — không grind vô nghĩa.

**Skin tàu** (canvas, chỉ đổi ngoại hình): Mặc định · Hoàng hôn (wave 5) · Bóng đêm (3 boss) · Băng giá (1 daily) · Thợ rèn (5 node Xưởng) · FU-DEVER (wave 15).
**Mở Khắc nghiệt:** vượt wave 5 ở Thường 1 lần. Thông báo: *"Bạn đã chứng minh được bản lĩnh. Khắc nghiệt đang chờ."*

---

## 8. Đường cong độ khó

### 8.1. Endless mode — bảng 10 wave đầu (Thường = baseline) + công thức wave 11+

| Wave | HP quái | Tốc quái | Số quái | Spawn mỗi | Gặm chewer | Mốc mới |
|---|---|---|---|---|---|---|
| 1 | 0.75× | 0.85× | 7 | 2.5s | 8 px/s | chaser |
| 2 | 0.85× | 0.90× | 10 | 2.2s | 9 px/s | mini, Đom Đóm Vàng, Phun Mã Độc |
| 3 | 1.00× | 0.95× | 13 | 2.0s | 10 px/s | **chewer** (lần đầu gặm cửa sổ), cảm tử, Đóng Băng |
| 4 | 1.10× | 1.00× | 16 | 1.8s | 11 px/s | splitter, Khuếch Đại Lỗi, Giáp Gương |
| 5 | 1.15× | 1.00× | 19 + boss | 1.7s | 12 px/s | boss 1, Bóng Ma Ẩn, Ổ Lỗi Sinh Sản |
| 6 | 1.30× | 1.05× | 22 | 1.6s | 13 px/s | tank |
| 7 | 1.45× | 1.10× | 25 | 1.45s | 14 px/s | dasher |
| 8–10 | 1.60–1.90× | 1.15–1.20× | 28–34 + boss | 1.3–1.1s | 15–18 px/s | boss 2 (thêm đạn xoắn) |

```
hp_mult(n)        = 1.90 × 1.12^(n−10)
speed_mult(n)     = min(1.20 + 0.03×(n−10), 1.65)
count(n)          = 34 + 3×(n−10)
spawn_interval(n) = max(1.10 − 0.05×(n−10), 0.60)s
chew_dps(n)       = 18 + 1.2×(n−10) px/s
boss: n % 5 == 0 → HP ×(1 + 0.25×số boss đã gặp), giữ nguyên pattern
```

### 8.2. Modifier theo độ khó (áp cho cả Campaign)

| Tham số | Chill | Thường | Khắc nghiệt |
|---|---|---|---|
| Máu quái | ×0.7 | ×1 | ×1.45 |
| Tốc quái | ×0.85 | ×1 | ×1.15 |
| Máu tàu | 4 | 3 | 2 |
| Chew dps | ×0.7 | ×1 | ×1.25 |
| Điểm | ×0.8 | ×1 | ×1.6 |
| Số spawn/wave | ×0.8 (tối thiểu 1) | ×1 | ×1.25 |
| HP boss | ×0.75 | ×1 | ×1.35 |
| Telegraph | ×1.3 (dài hơn) | ×1 | ×0.75 (ngắn hơn) |
| Ngưỡng thua cửa sổ | 50% | 65% | 75% |
| Vá sau wave | +50px | +40px | +30px |
| Hồi máu sau wave | +1 | +1 | +1 mỗi 2 wave |
| Gem rớt | ×1.25 | ×1 | ×0.85 |
| Mất điện ải 4 | tối 4s / chu kỳ 22s | 6s / 20s | 8s / 18s |
| Thu hẹp ải 5 | 5px / 10s | 8px / 10s | 12px / 10s |
| Gai ải 2 | 3s bật / 3s tắt | 4s / 2s | 5s / 1.5s |
| Đếm ngược boss 5 P3 | 25s | 20s | 16s |

Khắc nghiệt "khó nhưng công bằng": không tăng số lượng quái vượt bảng trên, boss không thêm pattern mới — thua vì quái trâu + nhanh hơn, telegraph ngắn hơn.

**Target:** Chill run 12–15 phút (newbie wave 3–4 trong 5 phút đầu) · Thường 8–12 phút · Khắc nghiệt 5–8 phút. Mọi số nằm trong `difficulty.config.json`, không hard-code.

---

## 9. Tutorial / Onboarding — 10 beat tương tác

**Nguyên tắc:** học trong game, mỗi beat 1 ý, coach-mark ≤ 12 từ, không wall-of-text. Wave 1 ải 1 chạy **scripted** (spawn cố định). Mỗi beat có timeout tự qua (trừ draft). Nút **"Bỏ qua hướng dẫn"** hiện suốt tutorial (góc phải trên). Lưu `wk_tut_v1_<profileId> = "done"` (có version để reset khi đổi tutorial). Launcher có nút **"Chơi lại hướng dẫn"**.

Lần đầu bấm "Chơi" hiện modal: **"Học chơi trong 2 phút?"** — *"Hướng dẫn ngắn: điều khiển, bắn quái và bí mật của cửa sổ."* — [Học ngay] [Vào game luôn].

| # | Beat | Trigger (code) | Hành động | Coach-mark (≤12 từ) | Qua beat khi |
|---|---|---|---|---|---|
| 1 | Di chuyển | `tutorial.start()` — 1 chaser chậm spawn xa | WASD / joystick trái | "Di chuyển bằng WASD hoặc phím mũi tên." / Mobile: "Kéo joystick trái để di chuyển tàu." | Tàu đi ≥ 200px (mobile ≥ 150px; timeout 15s) |
| 2 | Ngắm & bắn | Beat 1 xong | Chĩa + giữ chuột / Space | "Chĩa chuột vào quái, giữ chuột để bắn." / Mobile: "Kéo joystick phải để ngắm và bắn." | Đạn trúng quái ≥ 3 lần (timeout 20s) |
| 3 | Hạ quái đầu | Beat 2 xong | Bắn hạ chaser | "Hạ con quái đầu tiên nào!" | `kills ≥ 1` (timeout 25s) |
| 4 | Gem & XP | Quái đầu chết → rớt 1 gem scripted (override `xpNeed = 1` trong tutorial) | Chạm gem | "Nhặt 💎 để nạp đầy thanh XP." | Nhặt ≥ 1 gem (gem tự bay về sau 8s) |
| 5 | Draft nâng cấp | `openDraft()` trong tutorial | Chọn 1/3 thẻ | "Lên cấp! Chọn 1 trong 3 nâng cấp." | Click 1 thẻ (draft đầu loại nâng cấp phức tạp: chỉ tốc bắn / sát thương / tốc chạy) |
| 6 | Chewer xuất hiện | Draft đóng → spawn 1 chewer đi thẳng ra viền | Quan sát | "Quái tím xuất hiện — nó gặm cửa sổ!" | Chewer bám viền ≥ 1s (bị giết trước → nhảy beat 8) |
| 7 | Bắn viền hất chewer *(signature)* | Chewer bám viền (viền nhấp nháy + mũi tên chỉ điểm bám) | Bắn vào viền gần chewer | "Bắn vào viền để hất quái văng ra." | Chewer văng/hạ (timeout 25s; lần đầu tốc gặm giảm 50% trong 15s — ân huệ newbie) |
| 8 | Máu cửa sổ | Beat 7 xong | Đọc | "Cửa sổ vỡ là thua — như hết tim vậy." | Tự qua sau 2.5s |
| 9 | Wave clear | `waveClear(1)` | Đọc banner | "Hết wave — cửa sổ được vá lại." | Tự qua sau 2.5s |
| 10 | Hẹn boss | Beat 9 xong — nút "Chiến tiếp" | Bấm nút | "Sống sót đến wave 5 để gặp boss." | Bấm → lưu done → wave 2 bình thường |

Coach-mark đặt gần đối tượng liên quan (cạnh tàu / gem / viền bị bám), dim nền nhẹ, **không chặn input** (trừ overlay draft).

**Checklist "5 phút hiểu luật" (playtest 5 người mới):** ≥4/5 qua wave 3 Chill trong 2 run đầu · ≥4/5 tự mô tả được cơ chế chewer/cửa sổ · ≥3/5 chủ động bắn viền hất chewer · không ai hỏi "làm sao lên cấp" sau phút 2. Fail → ưu tiên: tăng ân huệ newbie → tooltip rõ hơn → giảm độ khó wave 1–2.

---

## 10. Meta progression

### 10.1. Tiền tệ: MẢNH KÍNH
Quái gặm vỡ cửa sổ → mảnh kính văng ra. Hợp theme, 2 âm tiết, dễ đọc trên UI nhỏ. **Không mua bằng tiền thật. Không gacha.**

| Nguồn | Lượng |
|---|---|
| Mỗi wave vượt qua | +2 |
| Giết boss | +10 |
| Mỗi 1000 điểm cuối run | +1 (làm tròn xuống) |
| Daily Challenge hoàn thành | +15 |
| Daily streak ≥ 7 ngày | +30 thêm |
| Thành tích | theo §10.2 |

**Dùng để:** mua node Xưởng (§7.3) · mở skin tàu (§7.3) · **Vá khẩn** (1 lần/run): tốn 20 mảnh vá ngay +60px khi cửa sổ < 40% — nút chỉ hiện lúc nguy cấp, là "van xả" chống thua oan.

### 10.2. Achievements — 25 thành tích
*Copy khi unlock: "Thành tích mới: [Tên] — +[X] mảnh kính."*

| # | Tên | Điều kiện | Thưởng |
|---|---|---|---|
| 1 | Chào sân | Hoàn thành wave 1 đầu tiên | 5 |
| 2 | Hiểu luật rồi | Vượt wave 3 ở Chill | 10 |
| 3 | Thợ săn tập sự | 100 quái (cộng dồn) | 10 |
| 4 | Thợ săn thực thụ | 1.000 quái (cộng dồn) | 25 |
| 5 | Cỗ máy hủy diệt | 10.000 quái (cộng dồn) | 60 |
| 6 | Kẻ gặm bị gặm | 50 chewer (cộng dồn) | 15 |
| 7 | Đập tan âm mưu | Hạ boss đầu tiên | 20 |
| 8 | Chuyên gia diệt boss | 10 boss (cộng dồn) | 50 |
| 9 | Người vá víu | Vá tổng 2.000px cửa sổ (cộng dồn) | 15 |
| 10 | Cửa sổ bất khả xâm phạm | Thắng 1 wave không mất px cửa sổ nào | 20 |
| 11 | Suýt thì toang | Thắng boss khi cửa sổ còn < 15% | 25 |
| 12 | Người hùng thầm lặng | 25 pickup (cộng dồn) | 10 |
| 13 | Dọn sạch | 1 nuke giết ≥ 15 quái | 20 |
| 14 | Tốc độ ánh sáng | Cấp 10 trong một run | 20 |
| 15 | Full build | 6 nâng cấp khác nhau trong một run | 25 |
| 16 | Tay to | 50.000 điểm/run (Thường+) | 30 |
| 17 | Huyền thoại | 200.000 điểm/run (Thường+) | 60 |
| 18 | Không cần nghỉ | 1 run dài 15 phút | 25 |
| 19 | Kiên cường | Sống sót wave 10 Thường | 30 |
| 20 | Vực sâu gọi tên | Chạm wave 15 (mọi độ khó) | 40 |
| 21 | Dám chơi dám chịu | Hoàn thành 1 run Khắc nghiệt (qua wave 1) | 30 |
| 22 | Thử thách mỗi ngày | Hoàn thành 1 Daily Challenge | skin Băng giá |
| 23 | Đều như vắt chanh | Streak daily 7 ngày | 30 |
| 24 | Gắn bó | Streak daily 30 ngày | 100 |
| 25 | WORK HARD – PLAY HARD | Full 10 node Xưởng | skin FU-DEVER |

### 10.3. Daily Challenge
- **Seed:** `seed = YYYYMMDD`, PRNG `mulberry32(seed)` — mọi người chơi cùng layout spawn, thứ tự quái, draft. Đổi lúc 00:00 giờ địa phương (UI ghi "Seed hôm nay: 20261001").
- **Cấu trúc:** độ khó cố định **Thường** · 1 run/ngày tính điểm (chơi lại được, lấy điểm cao nhất) · tối đa **10 wave** (~8–10 phút, vừa giờ nghỉ trưa) · mỗi ngày **2 modifier** từ pool 8 (rng chọn, không trùng).
- **Pool 8 modifier:**

| Modifier | Tên | Hiệu ứng |
|---|---|---|
| M1 | Ngày hội chewer | Chewer từ wave 1, số lượng ×2, chew dps −20% |
| M2 | Đạn nặng | Tốc đạn −25%, sát thương +50% |
| M3 | Sàn trơn | Tốc chạy +20%, quán tính trượt +40% |
| M4 | Mưa gem | Gem rớt ×2 số lượng, mỗi gem 1 XP |
| M5 | Boss giận dữ | Boss 2 pattern đạn cùng lúc, boss +50% điểm |
| M6 | Cửa sổ mong manh | Ngưỡng thua 35% (thay vì 25%), vá cuối wave +60px |
| M7 | Chợ đen | Draft 4 lựa chọn thay vì 3 |
| M8 | Giờ cao điểm | Spawn −30% interval, điểm quái +30% |

- **Điểm:** `điểm daily = điểm run × 1.1^(số modifier)` (2 modifier = ×1.21).
- **BXH ngày:** top 100 (backend: bảng `daily_scores(date, profile, score, wave)`). **Streak:** qua wave 1 = +1 streak; bỏ 1 ngày → reset. **Thưởng:** hoàn thành +15 mảnh · top 10 +30 · top 1 +60 + huy hiệu "Nhất ngày" 24h.
- **Chống gian lận (vừa phải):** điểm gửi khi run kết thúc kèm seed + wave + thời gian; server từ chối nếu `wave > 10` hoặc run < 3 phút mà điểm > 50.000.

---

## 11. Game Feel — spec juice

### 11.1. Công cụ mới cần thêm vào engine
1. `G.hitstop` (giây) — freeze update, vẫn render (HS ≤ 90ms = "đòn nặng"; 120–150ms chỉ cho cinematic + slow-mo).
2. `G.flash` (0–1, overlay trắng) + `G.flashRed` (0–1, overlay đỏ) — decay 6/s.
3. `G.rings[]` — shockwave vòng tròn nở: `ring(x, y, maxR, color, life)`.
4. `J` (JuiceManager): `J.ok(key, ms)` throttle sfx/jitter — chống spam.

### 11.2. Hệ thống 4 tier

| Tier | Tên | Khi dùng | Ngân sách/event |
|---|---|---|---|
| 1 | **tick** | Tần suất > 3 lần/s: bắn, đạn trúng, nhặt gem, bắn vào viền, pause | ≤6 particle, shake 0, HS 0, sfx throttle |
| 2 | **pop** | Giết quái thường, hất chewer, latch/gặm, nhặt pickup, chọn upgrade, combo milestone | 8–18 particle + 1 ring, shake 2–6, HS 0–30ms |
| 3 | **boom** | Giết tank, tàu dính đòn, wave clear, lên cấp, boss mất phase, nuke | 26–60 particle + ring + flash, shake 6–12, HS 40–70ms, jitter có |
| 4 | **cinematic** | Boss spawn/kill, game over 2 kiểu | 60–90 particle + multi-ring + flash + slow-mo + banner, shake 10–16, HS 90–150ms, jitter mạnh |

**Quy tắc:** không bao giờ 2 cinematic chồng nhau (mới hủy cũ) · `G.parts > 300` → ép tier pop/boom thành tick (van an toàn perf) · boom tối đa 2 lần/giây toàn cục.

### 11.3. Event → feedback (rút gọn — bảng đầy đủ 23 sự kiện ở bản Game Feel gốc)
- **Bắn:** muzzle flash + giật nòng 2px/60ms + đạn scale 1.3→1/80ms; `sfx.shoot()` throttle 90ms.
- **Giết thường:** burst 14 + ring r46 + HS 30ms + shake 5. **Giết tank:** burst 34 + ring r70 + flash 0.25 + HS 55ms + shake 8 + jitter 10.
- **Hạ boss:** burst 90 (4 màu) + 3 ring (r120/180/240 cách nhau 120ms) + flash 0.7 + slow-mo 0.2/1.5s + HS 120ms + shake 16 + jitter 30.
- **Tàu dính đòn:** flashRed 0.55 + knockback 30px + HS 60ms + shake 9 + jitter 22 (giữ iframes 0.9s).
- **Chewer bám viền:** marker tam giác nhấp nháy 1s + viền cạnh sáng đỏ pulse + `sfx.latchWarn()` + jitter 6.
- **Chewer gặm:** vụn kính 6 particle bay vào trong + tween co 150ms (thay vì giật cục) + `sfx.windowCrack()` khi winPct < 50%.
- **Hất văng chewer:** chewer bay với kbx/kby 400px/s + xoay 720°/0.5s + trail tím + HS 25ms + `sfx.yeet()`.
- **Lên cấp:** slow-mo 0.3/0.6s + ring r150 + flash 0.35 + banner "LÊN CẤP n!" + HS 50ms + `sfx.levelup()` mới.
- **Wave clear:** ring toàn màn hình `#0080FF` + viền sáng xanh 0.6s + float "+40px 🪟" + HS 40ms + `sfx.repair()` mới.
- **Boss spawn:** telegraph 1.2s (nền tối → alpha 0.45, boss rơi từ trên + trail, ring r200 khi chạm đất) + zoom canvas 1.0→1.06/0.8s + shake 10 + HS 90ms + `sfx.bossRoar()` mới.
- **Boss mất phase (mỗi 33% HP):** stun 1.2s + burst 40 + flash 0.4 + banner "BOSS SUY YẾU!" + rớt 2 heart + HS 70ms + `sfx.phaseBreak()` mới; sau mỗi phase tốc đánh boss +25%.
- **Game over tàu nổ:** slow-mo 0.15/1.2s + burst 70 + 2 ring + flash 0.8 → fade đen + 8 mảnh tàu văng; overlay sau 1.2s.
- **Game over cửa sổ vỡ:** kính nứt lan (12 đường nứt từ tâm ra viền/0.8s) + mảnh kính rơi + flashRed 0.6 + slow-mo 0.15/1.2s + `sfx.windowShatter()` mới. **Phân biệt rõ với tàu nổ** để player hiểu nguyên nhân chết.

### 11.4. Slow-mo triggers

| Trigger | Timescale | Thời lượng | Cooldown |
|---|---|---|---|
| Near-death save (1 tim + đạn/dasher đang tới trong 90px) | 0.25 | 1.2s | 20s → nếu thoát: float "THOÁT HIỂM! +300" |
| Hạ boss | 0.20 | 1.5s | — |
| Lên cấp | 0.30 | 0.6s | — |
| Nuke | 0.40 | 0.5s | — |
| Boss slam telegraph | 0.50 | 0.7s | — |
| Game over | 0.15 | 1.2s | — |

### 11.5. Kill confirmation
- **Không hiện damage number** cho đạn thường (spam). Chỉ hiện **heavy-hit number** (đòn ≥ 10 dmg: nuke, thorns stack): số vàng `"15!"` big.
- **Multi-kill** (trong 1.0s): DOUBLE KILL! (+25) · TRIPLE KILL!! (+60) · RAMPAGE xN! (+25×N) — render cố định giữa-trên màn hình.
- **First blood mỗi wave:** "🩸 FIRST BLOOD! +50".

### 11.6. Mobile feel
- Haptic `navigator.vibrate` theo sự kiện (giết thường `[15]`, dính đòn `[60]`, boss hạ `[50,40,50,40,80]`, game over `[100,50,100,50,150]`...), throttle 80ms.
- Joystick visual: vòng base + knob scale theo vector; aim stick pulse 6Hz khi đang bắn; nhả stick → knob tween về tâm 120ms.
- Setting **"Hiệu ứng: Đầy đủ / Giảm"** (particle ×0.4, tắt flash, shake ×0.6, tắt haptic, sao nền 40). Tự gợi ý chuyển khi FPS < 45 trong 3s.

### 11.7. Perf budget
`G.parts` cap 400 (giảm: 160) · `G.floats` cap 24 (big float tối đa 1 đồng thời) · `G.rings` cap 12 · shake tối đa 16 · hitstop ≤ 150ms/2s. **Object pooling** cho particle/bullet/float (P1) — `burst()` hiện tạo object literal mỗi particle → GC spike trên mobile sau nuke/boss.

### 11.8. Audio hooks mới (Web Audio, không file mới)
`sfx.multikill(n)` (pitch leo theo n) · `sfx.levelup()` (riser + shimmer) · `sfx.shieldHit()`/`sfx.shieldUp()` (keng kim loại) · `sfx.phaseBreak()` (vỡ giáp) · `sfx.slamWarn()` (còi leo thang) · `sfx.windowCrack()` (kính nứt) · `sfx.slowmo()` (whoosh bóp méo thời gian) · `sfx.yeet()` (vút — bịch). Phụ (không bắt buộc v1): `sfx.pop()`, `sfx.repair()`, `sfx.nukeReady()`, `sfx.comboUp(n)`, `sfx.bossRoar()`, `sfx.windowShatter()`, `sfx.explodeBig()`.

---

## 12. Copy deck (player-facing — dùng được ngay)

**Giọng văn:** tiếng Việt chuẩn, trực tiếp, ấm áp vừa đủ. Giữ thuật ngữ Anh (wave, combo, draft, DPS, XP, HP, boss, gem). CẤM sáo rỗng ("cơ hội vàng", "nhanh tay", công thức "Không X. Không Y. Chỉ có Z."). Emoji ≤ 2–3 có chủ đích: 💎 = gem, 🪟 = máu cửa sổ, ⚠ = nguy hiểm, 🏆 = kỷ lục.

### 12.1. Thẻ chọn ải (màn hình chọn ải)

| Ải | Tên | 1 câu mô tả | 1 câu mechanic |
|---|---|---|---|
| 1 | MÀN HÌNH XANH | Sân tập cho lính mới: quái chậm, cửa sổ rộng. | Quái tím xuất hiện từ wave 2. |
| 2 | TƯỜNG LỬA | Viền cửa sổ mọc gai — chạm vào là đau. | Gai bật/tắt theo chu kỳ 6s. Đừng đứng sát viền. |
| 3 | TRỌNG LỰC 404 | Mọi thứ trơn như băng, kể cả cú đẩy cửa sổ. | Thả phím tàu vẫn trôi — bay ngược để phanh. |
| 4 | CÚP ĐIỆN | Đèn tắt định kỳ, chỉ còn mắt đỏ của quái. | Nhìn mắt đỏ, nghe tiếng gầm để định vị. |
| 5 | TRÀN BỘ NHỚ | Vùng an toàn thu hẹp dần. Quản lý 2 "máu" cùng lúc. | Nhặt patch xanh để nới vùng an toàn. |

### 12.2. Boss xuất hiện

| # | Banner title | Sub |
|---|---|---|
| 1 | ⚠ BOSS: GÃ GẶM KHỔNG LỒ | Nó nện cửa sổ — giữ 🪟 sống sót! |
| 2 | ⚠ BOSS: TƯỜNG LỬA SỐNG | Gai tắt 2.5s sau mỗi đợt quét — áp sát! |
| 3 | ⚠ BOSS: TRỌNG TÂM HỖN LOẠN | Ngừng bắn lúc hút — dồn đạn lúc quá tải! |
| 4 | ⚠ BOSS: MÀN ĐÊM VÔ TẬN | Bắn vào con ngươi lúc nó sáng rực! |
| 5 | ⚠ BOSS CUỐI: NULL POINTER | 20 giây. Giết nó trước khi cửa sổ về 0! |

### 12.3. Game over — 2 biến thể
- **Tàu nổ:** "Tàu nổ tung!" — *"Quái vây quá đông. Lần tới giữ khoảng cách xa hơn nhé."*
- **Cửa sổ vỡ:** "Cửa sổ vỡ nát!" — *"Quái tím gặm nát viền. Ưu tiên hạ chúng trước nhé."*
- CTA: [Chơi lại] [Về menu]. Kỷ lục: "🏆 Kỷ lục mới!"

### 12.4. Banner wave (viết lại từ bản cũ)
- "Quái tím gặm cửa sổ — hạ chúng trước!"
- "Quái tím bám viền — bắn vào viền hất nó ra!"
- "Đạn trúng viền sẽ đẩy cửa sổ bay."
- "Nhặt 💎 đầy thanh XP để lên cấp."
- "Quái vàng sắp lao tới — tránh xa ra!"
- Cảnh báo cửa sổ yếu: "🪟 sắp vỡ! Hạ quái tím ngay!"
- Wave clear: "Vá cửa sổ +40px — nghỉ 2 giây."

### 12.5. Nguyên tắc viết UI
- Xưng hô: gọi người chơi là **"bạn"**. Không "quý khách", không "chúng tôi".
- Nút ≤ 4 từ: Chơi · Chơi lại · Về menu · Bỏ qua · Chiến tiếp · Học ngay · Vào game luôn.
- Số kiểu Việt: "12.500 điểm" · "04:37" · "Wave 3/10" · "HP cửa sổ 35%".
- Báo lỗi = nói rõ chuyện gì + cách sửa, không đổ lỗi: *"Trình duyệt chặn popup rồi. Bật "Cho phép popup" cho trang này rồi bấm Chơi lại nhé."* / *"Trình duyệt không cho đổi kích thước cửa sổ. Game dùng đấu trường ảo thay thế — chơi bình thường nhé."* / Không lộ jargon: cấm "window.resizeTo() bị chặn".

---

## 13. Thay đổi UI/HUD (tóm tắt cho Frontend)

1. **Màn chọn ải** (mới, trong launcher): 5 thẻ ngang — tên ải, mô tả, mechanic, kỷ lục ải, ổ khóa nếu chưa mở. Nút "Vô tận" sau khi phá đảo.
2. **Màn hình Xưởng** (mới): 10 node theo bảng §7.3 — tên, hiệu ứng, giá mảnh kính, trạng thái mở/khóa. Skin tàu: 6 ô preview canvas.
3. **HUD trong game:** thêm thanh phase boss 3 nấc (đánh dấu 66%/33%) · icon modifier daily khi đang chơi daily · cảnh báo "🪟 sắp vỡ!" khi winPct < 25% · đếm ngược phase 3 boss 5.
4. **Toast thành tích:** góc phải trên, 3s, "🏆 [Tên] — +[X] mảnh kính."
5. **Overlay draft:** thêm tag "Độc quyền ải n" cho nâng cấp 1–3 (§7.2).
6. **Game over:** thêm dòng nguyên nhân + tip (§12.3), nút "Vá khẩn" khi đủ mảnh kính (1 lần/run).
7. **Setting mới:** "Hiệu ứng: Đầy đủ / Giảm" · "Rung haptic: bật/tắt" (mobile).

---

## 14. Roadmap implement cho Engineering

### P0 — Khung ải + quái mới + tutorial (2–3 tuần)
- [ ] `difficulty.config.json`: toàn bộ số §8 (không hard-code)
- [ ] Stage framework: `STAGES[5]` (palette, mechanic flags, wave tables §4), màn chọn ải, `unlockedStage`/`stageBest` per profile
- [ ] 8 quái mới (§6 + `docs/bestiary.md`) + 3 cơ chế cửa sổ mới (`crackEdge`, `G.frozenEdges`, `G.windowGaps`)
- [ ] Mini-boss wave 5 (elite variant §5) + nâng cấp 6 quái cũ (§6.3)
- [ ] Tutorial 10 beat (§9) + modal + `wk_tut_v1_<profile>` + "Chơi lại hướng dẫn"
- [ ] Game feel P0: `G.hitstop` + loop mới, `J` throttle, particle cap 400, HS theo §11.3
- [ ] Wave 1 ải 1 scripted; QA checklist "5 phút hiểu luật" (§9)

### P1 — Boss 5 ải + mechanic ải + nâng cấp mới (2–3 tuần)
- [ ] 5 boss 3 phase (§5) + boss bar 3 nấc + telegraph chuẩn
- [ ] 4 mechanic ải: viền gai (ải 2), trơn trượt (ải 3), mất điện (ải 4), vùng thu hẹp + patch (ải 5)
- [ ] 6 nâng cấp mới (§7.2) — 3 độc quyền ải làm phần thưởng boss
- [ ] Game feel P1: `G.flash`/`G.rings`, multi-kill + first blood, 4 sfx mới
- [ ] Chế độ Vô Tận + banner mốc

### P2 — Meta + Daily (2 tuần)
- [ ] Mảnh kính: kiếm/tiêu/vá khẩn + localStorage keys (Phụ lục A)
- [ ] Xưởng 10 node + 6 skin tàu (canvas)
- [ ] 25 achievements + toast
- [ ] Daily challenge: seed `mulberry32(YYYYMMDD)`, 8 modifier, BXH + streak + thưởng
- [ ] Backend (tùy chọn): `POST /api/daily/submit`, `GET /api/daily/leaderboard`, `POST /api/meta/sync` (Phụ lục B)

### P3 — Polish + balance (1–2 tuần)
- [ ] Game feel P2/P3: slow-mo triggers, game over 2 kiểu phân biệt, haptic mobile, setting hiệu ứng, object pooling
- [ ] 8 sfx mới còn lại (§11.8)
- [ ] Playtest balance pass: chỉnh `difficulty.config.json` theo số liệu thật (target §8)
- [ ] QA checklist tổng + release tag v2.0.0

**Nguyên tắc vàng:** juice không bao giờ làm player chết oan — mọi cinematic đều có telegraph, hitstop không freeze input, resume sau pause có 0.5s grace.

---

## 15. Hội tụ với bản archive (3-act data-driven)

Bản `archive/GAME-DESIGN-DOC-act3-v1.md` (Gameplay Programmer) đề xuất kiến trúc **data-driven** rất tốt cho implement — Lead quyết định **giữ thiết kế 5 ải + 14 quái của bản này, implement bằng kiến trúc của bản archive**:

| Khái niệm archive | Áp dụng vào bản này |
|---|---|
| `MONSTER_REGISTRY` (10 quái, schema id/name/behavior/color/r/hp/spd/...) | Mở rộng thành 14 quái (§6): thêm `spitter, booster, bomber, freezer, warden, glimmer, phantom, broodmother` + giữ `weaver` làm quái dự bị P2 |
| `BEHAVIORS` (7 strategy) | Thêm strategy: `spit` (Phun Mã Độc), `aura` (Khuếch Đại Lỗi), `kamikaze` (Cảm Tử), `ice` (Đóng Băng), `mirror` (Giáp Gương), `flee` (Đom Đóm), `cloak` (Bóng Ma), `lay` (Ổ Lỗi) |
| `ACTS[3]` (palette + boss variant + nhạc) | Đổi thành `STAGES[5]` theo §4 (thêm `mechanic` flags: `spikes`, `lowFriction`, `blackout`, `shrinkingArena`) |
| Công thức difficulty scaling | Thay bằng `difficulty.config.json` (§8) |
| `PICKUP_DEFS` (magnet, overdrive mới) | Giữ đề xuất, thêm `patch` (ải 5) và `pin` (đèn pin ải 4); cân tỉ lệ rớt chung |
| BroadcastChannel thêm field `act` | Đổi thành `stage`; `menu.js` tương thích ngược (field thừa bị bỏ qua) |

---

## 16. Rủi ro & câu hỏi mở

1. **Perf ải 4 (mất điện):** phủ đen alpha 0.92 toàn canvas + outline quái mỗi frame — cần đo FPS trên máy yếu trước khi lock. Mitigation: setting "Hiệu ứng: Giảm" tắt bớt.
2. **`moveBy` nhiều lần trong 300ms (quán tính cửa sổ ải 3):** trình duyệt có thể throttle — fallback: nếu `winCtrl.ok === false` thì quán tính chỉ áp dụng cho đấu trường ảo.
3. **Phantom khi ẩn vẫn bị đạn trúng:** có thể gây cảm giác "bắn trúng không khí" — cần playtest; nếu khó chịu → chuyển sang chỉ trúng khi hiện (như bản Level đề xuất).
4. **Quái hút `[quái từ]`:** dời sang P2 (ý tưởng dự bị cùng `weaver` từ bản archive).
5. **Boss 5 phase 3 (đếm ngược 20s):** nếu DPS người chơi quá thấp do build xui → thua chắc chắn gây ức chế. Mitigation: trong phase 3, rớt thêm gem để lên cấp giữa fight (van xả).
6. **Daily leaderboard gian lận:** mức chống gian lận hiện tại là "vừa phải" (game casual, không giải thưởng tiền mặt) — CEO quyết nếu cần nâng.

---

## Phụ lục A — localStorage keys (meta)

```
wk_meta_shards            // mảnh kính hiện có (int)
wk_meta_shards_total      // tổng mảnh lifetime (mở node Xưởng)
wk_meta_workshop          // JSON {"1":2,"2":1,...} cấp đã mua mỗi node
wk_meta_skins             // JSON ["default","sunset",...] skin đã mở
wk_meta_skin_active       // skin đang dùng
wk_meta_achv              // JSON {"3":true,...} thành tích đã mở
wk_meta_stats             // JSON {kills, chewerKills, bossKills, bestWave, bestScore, ...}
wk_meta_daily             // JSON {"20261001":{"score":12345,"streak":3}, "lastDate":"20261001"}
wk_meta_unlock_hn         // true/false: đã mở Khắc nghiệt
wk_tut_v1_<profileId>     // "done" — tutorial
wk_unlocked_stage_<pid>   // 1..5 — ải đã mở
wk_stage_best_<pid>       // JSON {"1":{"score":..,"wave":10},...}
```

## Phụ lục B — Backend SQLite (tùy chọn, daily + meta sync)

```sql
CREATE TABLE daily_scores (date TEXT, profile TEXT, score INTEGER, wave INTEGER,
  modifiers TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (date, profile));
CREATE TABLE meta_sync (profile TEXT PRIMARY KEY, shards INTEGER, workshop TEXT, updated_at DATETIME);
```
- `POST /api/daily/submit` {date, profile, score, wave, modifiers, seed} — server validate `seed == date`, `wave ≤ 10`, run ≥ 3 phút nếu score > 50.000.
- `GET /api/daily/leaderboard?date=YYYYMMDD` — top 100.
- `POST /api/meta/sync` — backup/restore meta cross-device (optional).

## Phụ lục C — File tham chiếu cho Engineering

| File | Vai trò trong v2 |
|---|---|
| `js/game.js` | Arena engine — thêm STAGES, 8 quái, boss 3 phase, mechanic ải, hitstop/slow-mo/rings/flash, crackEdge/frozenEdges/windowGaps |
| `js/menu.js` | Launcher — màn chọn ải, Xưởng, skins, achievements, daily UI, setting hiệu ứng/haptic |
| `js/audio.js` | 8 sfx mới (§11.8) + nhạc theo ải |
| `js/api.js` | Thêm daily/meta endpoints (tùy chọn) |
| `server/src/` | Bảng `daily_scores`, `meta_sync` + 3 endpoints (tùy chọn) |
| `docs/bestiary.md` | Spec chi tiết 14 quái — code trực tiếp được |
| `difficulty.config.json` | **MỚI** — toàn bộ số §8, không hard-code |

---

*Hết GAME DESIGN DOCUMENT v2.0. Mọi số liệu đã sẵn sàng để Engineering implement theo roadmap P0→P3. Chúc team WORK HARD — PLAY HARD.* 🎮
