# DESIGN SPRINT "WOW" — WINDOWKILL Web Edition
### Team Game Design · FU-DEVER Game Studio

| | |
|---|---|
| **Phiên bản** | 1.0 — Design lock cho sprint "tiếp tục phát triển" |
| **Ngày** | 2026-10-01 |
| **Trạng thái** | ✅ Sẵn sàng implement — Engineering đọc trực tiếp, không cần họp thêm |
| **Phạm vi** | Chỉ design, không code. Chi tiết hóa M7/M9/M10 (backlog từ sprint cửa sổ liên hoàn), 8 ý tưởng wow factor, chốt hệ thống điểm mới, cân bằng độ khó tổng thể |
| **Tài liệu liên quan** | `studio/game-design/WOW-DIRECTION.md` · `studio/game-design/MULTIWINDOW-SPEC.md` (M1–M4) · `studio/game-design/GAME-DESIGN-DOC.md` v2.0 |

---

## 0. BỐI CẢNH & NGUYÊN TẮC BẤT KHẢ XÂM PHẠM

**Đã live trên production:** M1 Ổ Quái Bay · M2 Boss Tách Mảnh · M3 Cửa Sổ Khiên · M4 Mưa Mảnh Vỡ · M5 Mẹ Gà Đẻ Trứng (popup mẹ đẻ popup con mỗi 8s) · M6 Một Thành Hai (popup lớn tách đôi, con nhanh gấp đôi) · M8 Quả Bom Cười (popup đếm ngược 15s).

**Định hướng đứng từ user (nhắc lại, không thương lượng):**
1. Nhạc/SFX phải **VUI NHỘN, nhịp nhanh — tuyệt đối không rùng rợn/u ám**. Mọi âm thanh mechanic mới đều là cartoon (boing, glup, pop, slide-whistle), không drone/không minor-creepy.
2. Background **tương phản thấp**, lightness ≤ 14% — juice sáng nhưng không lấn gameplay.
3. Icon từ **svgl.app** hoặc tự vẽ; không copy asset bản quyền.
4. Telegraph mọi mối nguy **≥ 0.5s**. Không đòn "ăn ngay".
5. Quy ước multi-window từ MULTIWINDOW-SPEC: tối đa **3 popup vệ tinh** cùng lúc; mọi mechanic phải định nghĩa "đóng tay thì sao" và **fallback mô phỏng** (khung OS giả trong arena, watermark "mô phỏng"); mobile luôn dùng mô phỏng.

**Triết lý sprint này:** 3 mechanic mới đều là **"kịch tính hề"** — tạo tình huống dở khóc dở cười, không tạo nỗi sợ. Wow factor tập trung vào *game feel* và *khoảnh khắc*, không phải *số lượng hiệu ứng*.

---

## 1. M7 💘 "TÌNH YÊU SÉT ĐÁNH" — 2 popup trôi về nhau, hợp nhất thành siêu-popup

### 1.1. Concept (1 câu)
Hai popup "đang yêu" xuất hiện ở 2 mép arena, vừa phát nhạc tình vừa trôi về phía nhau — chạm nhau là **"cưới"** thành siêu-popup 10 HP quậy phá; phá lẻ từng con trước khi cưới thì rẻ hơn nhiều.

### 1.2. Trigger
| Tham số | Giá trị |
|---|---|
| Wave tối thiểu | Wave 9+ (act 1 muộn), act 2–3 mọi wave |
| Tần suất | Tối đa **1 lần/wave**, cooldown **≥ 3 wave** giữa 2 lần trigger |
| Điều kiện cấm | Không trigger ở wave boss (`wave % 5 == 0`), wave debut quái mới, tutorial, khi đã có ≥ 2 popup threat đang sống |
| Xác suất | 35%/wave đủ điều kiện (seeded RNG, không phải wave nào cũng có — giữ độ hiếm) |

### 1.3. Hành vi chi tiết
1. **Spawn:** 2 popup vệ tinh 260×200 xuất hiện ở 2 mép đối diện arena (trái/phải hoặc trên/dưới — chọn trục dài hơn của màn hình). Mỗi popup HP **4** (tổng 8 click nếu phá lẻ).
2. **Trôi về nhau:** mỗi popup drift về phía popup còn lại với tốc **85 px/s** (act 2: 95, act 3: 105). Không né vật cản — đi thẳng.
3. **Telegraph "đang yêu":** đường đứt nét hồng `#ff9df3` nối 2 popup + icon 💘 nhấp nháy 2Hz ở giữa + SFX "slide-whistle lên giọng" khi spawn. Player nhìn 1 giây là hiểu "2 đứa này sắp gặp nhau".
4. **HỢP NHẤT (merge):** khi 2 khung chạm nhau:
   - Hiệu ứng: confetti hồng 24 hạt + chữ **"CƯỚI NHAU RỒI!"** pop giữa màn hình + SFX chuông đám cưới (major chord, vui).
   - Ra đời **siêu-popup 10 HP** (kích thước 340×260) tại điểm chạm, title bar: `💘 SIÊU POPUP TÌNH YÊU`.
5. **Hành vi siêu-popup:**
   - Drift chậm **55 px/s** về phía cửa sổ chính (muốn "ôm" cửa sổ của bạn).
   - **Aura fan cuồng** (bán kính 200px): chaser/mini trong aura bị "say nắng" — đổi mục tiêu sang **đu theo siêu-popup** thay vì tàu, kéo dài 6s (refresh khi còn trong aura). Quái say nắng vẽ thêm 💘 trên đầu. *Đây là chaos vui vẻ: bầy quái tự dưng bỏ bạn đi theo "người yêu" — bạn được thở, nhưng chúng tụ lại thành bầy đông quanh siêu-popup.*
   - Mỗi **10s** siêu-popup "thả thính": ring hồng nở ra 160px — tàu trúng ring bị **đẩy văng nhẹ 50px** (không sát thương, telegraph ring đứt nét 0.6s trước). Vui, không oan ức.
6. **Tồn tại:** tối đa **60s** sau merge → tự "đi hưởng tuần trăng mật" (drift ra khỏi màn hình, biến mất êm, không phạt).

### 1.4. Cách phá
- **Trước merge:** bắn/click mỗi popup 4 HP — tổng 8 HP, không có aura, không có ring. **Đây là cách rẻ nhất.**
- **Sau merge:** siêu-popup 10 HP. Mỗi khi mất 3 HP: nó "giật mình" (shake popup 150ms + SFX "hic!") nhưng không phản đòn.
- **Phá siêu-popup:** nổ confetti lớn 40 hạt + **rớt 2 gem + 1 pickup ngẫu nhiên** (heart/shield/nuke) quanh điểm vỡ + **+80 điểm** (điểm cố định, xem §6).
- Nuke/đạn xuyên/damage AoE đều ăn lên popup như thường.

### 1.5. Risk / Reward
| Lựa chọn | Chi phí | Lợi ích | Rủi ro |
|---|---|---|---|
| Phá lẻ trước merge | 8 HP sát thương, 0 chaos | Yên ổn, +20 điểm (2×10) | Phải ưu tiên ngay, bỏ quái khác 5–8s |
| Để merge rồi phá | 10 HP + chịu aura/ring 10–20s | **+80 điểm + 2 gem + 1 pickup** | Bầy quái tụ đông quanh siêu-popup; ring đẩy văng có thể hất bạn vào đạn |
| Bỏ mặc 60s | 0 | 0 | Aura làm bầy quái tụ 1 chỗ — thực ra dễ dọn bằng AoE (chiến thuật "lùa gà") |

*Design intent:* không có lựa chọn nào "sai" — đây là mechanic **tạo tình huống**, không phải bẫy. Người chơi giỏi biến aura thành công cụ gom quái.

### 1.6. Fallback simulation
2 khung OS giả (title bar + 3 nút + watermark "mô phỏng") drift trong arena theo cùng tốc độ/vector. Merge → 1 khung lớn hơn, title `💘 SIÊU POPUP TÌNH YÊU (mô phỏng)`. Click vào khung = 1 sát thương (crosshair + số dmg nảy như M1–M4). Aura/ring vẽ bằng canvas như thường.

### 1.7. Đóng tay (quy ước chống exploit)
- Đóng **1 popup trước merge** → popup còn lại "thất tình" 💔: drift nhanh gấp đôi ra khỏi màn hình, **rớt 1 gem** an ủi tại chỗ. Không phạt, không thưởng điểm.
- Đóng **siêu-popup sau merge** → coi như phá nhưng **0 điểm, 0 gem, 0 pickup** (chống exploit đóng tay ăn reward). Không spawn phạt — vì siêu-popup không phải threat gây sát thương.

### 1.8. Copy deck
| Tình huống | Text (≤ 12 từ) |
|---|---|
| Spawn | "💘 2 popup đang yêu nhau — ngăn chúng gặp mặt!" |
| Merge | "CƯỚI NHAU RỒI! Siêu-popup 10 HP!" |
| Phá siêu-popup | "💘 Tan vỡ! +80 điểm" |
| Thất tình (đóng 1) | "💔 Thất tình bỏ đi... rớt 1 gem" |

### 1.9. Audio hooks (Web Audio synth, vui nhộn)
- `sfx.love_spawn()`: slide-whistle lên + 2 nốt major.
- `sfx.love_merge()`: chuông cưới (E–G#–B major arpeggio nhanh) + pop confetti.
- `sfx.love_ring()`: "thính" — sine sweep 600→900Hz 0.3s, đáng yêu.
- `sfx.love_break()`: kính vỡ vui (noise burst + major chord rải).
- Nhạc nền không đổi state (không phải threat) — giữ COMBAT.

### 1.10. Số liệu chốt
| HP popup lẻ | Tốc drift về nhau | HP siêu-popup | Tốc drift siêu-popup | Aura R | Ring chu kỳ | Tồn tại | Điểm phá |
|---|---|---|---|---|---|---|---|
| 4 + 4 | 85/95/105 px/s (act 1/2/3) | 10 | 55 px/s | 200px | 10s (đẩy 50px, 0 dmg) | 60s | 80 |

### 1.11. Acceptance (QA)
- [ ] 2 popup luôn spawn ở 2 mép đối diện, đường hồng + 💘 hiện trong 1s đầu.
- [ ] Phá 1 popup trước merge → popup còn lại rời màn hình + rớt đúng 1 gem.
- [ ] Merge đúng khi 2 khung chạm nhau (không sớm/muộn > 0.2s).
- [ ] Quái say nắng đổi target sang siêu-popup, hết 6s quay lại đuổi tàu.
- [ ] Ring hồng có telegraph đứt nét 0.6s, chỉ đẩy văng — không trừ máu.
- [ ] Đóng tay siêu-popup: 0 điểm, 0 rớt đồ.

---

## 2. M10 🪞 "GƯƠNG THẦN LẦY LỘI" — popup phản chiếu đạn player

### 2.1. Concept (1 câu)
Popup mặt gương lầy lội đứng giữa chiến trường **hất ngược đạn của bạn về phía bạn** — nhưng mặt sau của nó mỏng dính, và đạn bị phản xạ vẫn giết được quái (friendly fire là phần thưởng cho góc bắn khéo).

### 2.2. Trigger
| Tham số | Giá trị |
|---|---|
| Wave tối thiểu | Wave 16+ (act 2 muộn) · act 3 mọi wave |
| Tần suất | Tối đa **1 lần/wave**, cooldown **≥ 4 wave** |
| Điều kiện cấm | Không trigger ở wave boss, wave debut quái mới, tutorial, khi đã có ≥ 2 popup threat đang sống |
| Xác suất | 30%/wave đủ điều kiện |

*Ghi chú lore: đây là phiên bản "popup" của quái Giáp Gương (ải 5 trong GDD v2.0) — cùng ngôn ngữ visual (bạc + sparkle), player đã được dạy "vòng sau lưng" từ trước.*

### 2.3. Hành vi chi tiết
1. **Spawn:** popup vệ tinh 300×220, mặt trước vẽ gương bạc lấp lánh (sparkle particles bay quanh). HP **8**. Telegraph spawn: "KÍNH COONG!" + popup rơi từ trên xuống với bounce (như đồ chơi, không đáng sợ).
2. **Mặt gương (front arc):** một cung **120°** ở một phía popup, vẽ viền bạc sáng + 3 mũi tên cong chỉ hướng phản xạ. Cung này **xoay chậm 15°/s** (đọc được, không chóng mặt).
3. **Phản xạ:** đạn player chạm mặt gương trong cung 120° → phản xạ **gương (specular)** qua pháp tuyến tại điểm chạm:
   - Đạn phản xạ: tốc **×1.3**, sát thương **1** (vào tàu), bay tối đa **600px** rồi tan.
   - Đạn phản xạ **vẫn gây sát thương lên quái** (dmg gốc của đạn) — *khuyến khích bắn "bóng bàn" giết quái!*
   - Mỗi lần phản xạ: SFX "kính coong" pitch tăng dần theo chuỗi (combo phản xạ nghe được, vui tai).
4. **Mặt sau (back arc 240°):** đạn trúng mặt sau gây sát thương **bình thường** — đây là cách phá chính.
5. **Melee "cụng đầu":** tàu **húc** vào gương (va chạm thân): gương mất **2 HP**, tàu **không mất máu**, cả hai văng ngược nhau 60px + SFX "boing!" + cooldown húc 0.5s. *Vui, liều, hiệu quả — đúng chất "lầy lội".*
6. **Tồn tại:** **45s** → gương "chán" tự drift ra khỏi màn hình (không phạt). Đứng yên gần như một chỗ, drift nhẹ 20 px/s ngẫu nhiên (đủ để cung gương thay đổi góc).

### 2.4. Cách phá & counterplay
| Cách | Hiệu quả | Ghi chú |
|---|---|---|
| Bắn mặt sau (240°) | 1 dmg/đạn như thường | Cách chính — vòng ra sau, để ý cung gương xoay 15°/s |
| Húc tàu (melee) | 2 dmg/lần húc, 0 dmg nhận vào | Liều nhưng nhanh — 4 cú húc là xong |
| Nuke / đạn nổ AoE | Full dmg, bỏ qua hướng | Đắt nhưng chắc |
| Bắn "bóng bàn" | Đạn phản xạ giết quái khác | Không phá gương, nhưng biến nguy thành cơ |

*Fairness:* đạn phản xạ bay 600px max + có màu **hồng neon** khác đạn quái (đỏ) để player phân biệt "đây là đạn của mình bị hất về". Telegraph cung gương luôn sáng — không bao giờ bị phản xạ "oan".

### 2.5. Risk / Reward
| Lựa chọn | Lợi ích | Rủi ro |
|---|---|---|
| Vòng sau lưng bắn (8 HP) | **+60 điểm + 2 gem** | Mất 5–8s di chuyển, cung gương xoay có thể "quay mặt" về phía bạn |
| Húc melee (4 cú) | Nhanh (~3s), +60 điểm + 2 gem | Phải áp sát — dễ ăn đạn quái khác lúc đang húc |
| Bỏ mặc 45s | 0 (không phạt) | Đạn bạn vô tình bắn vào gương dội ngược lại — tự bóp |
| Chơi bóng bàn | Giết quái bằng đạn phản xạ (điểm kill bình thường) | Cần góc đẹp; fail thì ăn đạn của chính mình |

### 2.6. Fallback simulation
Khung OS giả 300×220 trong arena, một cạnh vẽ dải bạc lấp lánh = mặt gương (xoay 15°/s quanh tâm khung). Đạn player va cạnh bạc → phản xạ theo pháp tuyến cạnh. Click vào khung = bắn mặt sau (1 dmg). Watermark "mô phỏng".

### 2.7. Đóng tay
Gương "vỡ tan tành" thành sparkle vô hại → **0 điểm, 0 gem**. Không phạt (không phải threat gây sát thương trực tiếp), không thưởng (chống exploit).

### 2.8. Copy deck
| Tình huống | Text (≤ 12 từ) |
|---|---|
| Spawn | "🪞 Gương lầy lội! Đừng bắn vào mặt gương!" |
| Phản xạ đầu tiên | "Coong! Đạn dội ngược lại kìa!" |
| Húc melee | "Boing! Cụng đầu hiệu quả đấy!" |
| Phá gương | "🪞 Vỡ tan! +60 điểm" |

### 2.9. Audio hooks
- `sfx.mirror_spawn()`: "kính coong" + rơi bounce (pitch drop comedic).
- `sfx.mirror_reflect(n)`: coong pitch leo theo n (n = số lần phản xạ liên tiếp, reset sau 2s).
- `sfx.mirror_boing()`: boing húc đầu (sine pitch envelope nhanh).
- `sfx.mirror_shatter()`: vỡ kính vui + major chord.

### 2.10. Số liệu chốt
| HP | Cung gương | Tốc xoay cung | Đạn phản xạ | Tầm đạn dội | Melee | Tồn tại | Điểm phá |
|---|---|---|---|---|---|---|---|
| 8 | 120° | 15°/s | tốc ×1.3, 1 dmg vào tàu | 600px | 2 dmg/cú, tàu 0 dmg | 45s | 60 + 2 gem |

### 2.11. Acceptance (QA)
- [ ] Cung gương 120° luôn nhìn thấy rõ (viền bạc + mũi tên), xoay đúng 15°/s.
- [ ] Đạn trúng cung → dội ngược đúng góc specular, tốc ×1.3, màu hồng neon, tan sau 600px.
- [ ] Đạn dội trúng quái → quái mất máu đúng dmg gốc đạn.
- [ ] Húc tàu: gương −2 HP, tàu không mất máu, cooldown 0.5s hoạt động.
- [ ] Bắn mặt sau 240° gây dmg bình thường.
- [ ] Đóng tay: 0 điểm, 0 gem, không crash.

---

## 3. M9 🌀 "MÁY HÚT BỤI VŨ TRỤ" — popup hố đen hút quái rồi "ợ" nhả ra

### 3.1. Concept (1 câu)
Popup máy hút bụi há mồm **"sluuurp"** hút sạch quái (và cả gem của bạn!) trong 12 giây — phá nó lúc đang no là **mở tiệc** (ăn điểm + gem của cả bầy bị nuốt); để nó "ợ" xong thì bầy quái nhả ra **cáu hơn, nhanh hơn**.

### 3.2. Trigger
| Tham số | Giá trị |
|---|---|
| Wave tối thiểu | Wave 12+ (act 2) |
| Tần suất | Tối đa **1 lần/2 wave** (cooldown 2 wave) |
| Điều kiện cấm | Không trigger ở wave boss, wave debut quái mới, tutorial, khi đã có ≥ 2 popup threat đang sống |
| Xác suất | 30%/wave đủ điều kiện |

### 3.3. Hành vi chi tiết
1. **Spawn:** popup vệ tinh 340×260 vẽ **máy hút bụi há mồm** (mắt tròn ngố + mồm đen xoáy). HP **8**. Telegraph 0.8s: vòng gió xoáy + SFX "sluuurp" cartoon (tăng dần, không rùng rợn).
2. **Hút (12s):** bán kính hút **220px** (tính trong tọa độ arena đối với bản mô phỏng; bản popup thật quy đổi qua vị trí popup trên desktop → vùng arena tương ứng):
   - Quái trong bán kính bị kéo về tâm popup với lực **260 px/s** (mạnh hơn tốc chạy của mọi quái trừ dasher đang dash).
   - Quái nặng (tank, warden/booster tương lai): kháng 50% → bị kéo **130 px/s**.
   - Quái chạm tâm popup → bị **nuốt**: biến mất với SFX "glup!" + hiện "+0" bay lên (nhấn mạnh: **không điểm, không gem** — nuốt không tính là giết).
   - **Tàu** trong 140px cũng bị kéo nhẹ **120 px/s** về tâm (vẽ vệt gió telegraph). Tàu chạm tâm: **mất 1 máu** + bị "nhổ" văng ra 120px với SFX "phù!" (công bằng: có telegraph gió rõ ràng).
   - **Gem/pickup** trong bán kính cũng bị hút vào và **MẤT LUÔN** (không nhả lại). *Đây là risk chính: đừng để nó hút mất đống gem bạn đang farm.*
3. **"Ợ" (burp) — khi hết 12s hoặc đã nuốt ≥ 6 con:** popup phồng to 0.5s (telegraph!) rồi **"ỢỢỢ!"** — phun toàn bộ quái đã nuốt ra các hướng ngẫu nhiên:
   - Quái nhả ra bị **enrage**: tốc **+30%**, máu **+1**, mắt đỏ ngầu 5s (vẽ đơn giản, không u ám — kiểu cartoon "cáu").
   - Tối đa nhả **6 con** (nuốt thừa thì... "tiêu hóa" mất, không nhả).
   - SFX: ợ hơi cartoon + confetti nâu đùa (giữ vui nhộn, không gớm).
4. **Sau ợ:** popup "no nê" drift ra khỏi màn hình, biến mất êm.

### 3.4. Cách phá
- **Phá lúc đang hút (8 HP — mục tiêu đứng yên, dễ bắn):** toàn bộ quái đang bị nuốt **"nôn" ra và chết luôn** → bạn nhận **điểm gốc từng con** + **gem rớt** như giết thường + **+40 điểm thưởng phá máy**. *Đây là jackpot: timing chuẩn = ăn cả bầy.*
- Nuke/đạn nổ AoE hiệu quả (popup đứng yên).
- **Không nên:** để nó hút mất gem rồi mới phá — gem đã nuốt không trả lại.

### 3.5. Risk / Reward
| Lựa chọn | Lợi ích | Rủi ro |
|---|---|---|
| Phá ngay khi spawn (0–3s) | An toàn tuyệt đối, +40 điểm | Bỏ lỡ jackpot nuốt bầy |
| Nuôi cho nuốt 4–6 con rồi phá | **Điểm cả bầy + gem cả bầy + 40** — jackpot lớn nhất game | Tàu/gem của bạn cũng bị hút; quái nhả ra nếu bạn phá hụt timing |
| Để nó ợ xong | 0 (không phạt trực tiếp) | Bầy quái enrage +30% tốc ào ra — hỗn loạn vui vẻ |
| Dùng làm "dọn màn" khẩn | 12s hút sạch quái lúc nguy cấp | Mất gem; sau đó ăn bầy enrage |

*Design intent:* M9 là **công cụ 2 lưỡi do player điều khiển timing** — mechanic "đánh cược" đúng nghĩa, khác hẳn M7 (tình huống) và M10 (đọc góc).

### 3.6. Fallback simulation
Khung OS giả 340×260 đặt **cách tàu 300px** (không đè lên tàu lúc spawn), vẽ mồm xoáy đen + mắt ngố. Vòng hút 220px vẽ đứt nét tím xoay. Logic hút/nuốt/ợ y hệt. Click khung = 1 dmg.

### 3.7. Đóng tay
Máy hút "hắt xì" — **nôn toàn bộ quái đã nuốt ra ngay, enrage như ợ** (phạt, giống triết lý M1: đóng threat = ăn dồn). **0 điểm.**

### 3.8. Copy deck
| Tình huống | Text (≤ 12 từ) |
|---|---|
| Spawn | "🌀 Máy hút bụi! Coi chừng gem của bạn!" |
| Nuốt quái | "Glup! (không điểm đâu nhé)" |
| Phá lúc no | "🌀 Nôn tiệc! Ăn điểm cả bầy!" |
| Ợ | "ỢỢỢ! Chúng nó cáu rồi!" |
| Tàu bị hút gần tâm | "Nguy hiểm! Bay ra khỏi vùng hút!" |

### 3.9. Audio hooks
- `sfx.vacuum_spawn()`: "sluuurp" tăng dần 0.8s (filtered noise + pitch up — cartoon).
- `sfx.vacuum_glup()`: glup nuốt (sine drop nhanh) — mỗi con 1 tiếng, throttle 150ms.
- `sfx.vacuum_burp()`: ợ hơi cartoon (square blip + noise) + major chord đùa.
- `sfx.vacuum_die()`: "nôn tiệc" — glup ngược + fanfare ngắn.
- Vòng hút có loop "gió" nhẹ, duck −6dB khi player nói/không cần — giữ dưới SFX critical.

### 3.10. Số liệu chốt
| HP | Bán kính hút | Lực hút quái | Lực hút tàu (140px) | Thời gian hút | Ngưỡng ợ | Enrage | Điểm phá |
|---|---|---|---|---|---|---|---|
| 8 | 220px | 260 px/s (nặng 130) | 120 px/s | 12s | ≥ 6 con hoặc hết giờ | tốc +30%, máu +1 | 40 + điểm cả bầy nuốt |

### 3.11. Acceptance (QA)
- [ ] Telegraph xoáy 0.8s trước khi hút có hiệu lực.
- [ ] Quái trong 220px bị kéo 260 px/s; tank 130 px/s; dasher đang dash thoát được.
- [ ] Nuốt quái hiện "+0" (không điểm, không gem).
- [ ] Gem trong vùng hút bị mất luôn.
- [ ] Phá lúc đang nuốt 4 con → nhận điểm gốc 4 con + gem + 40.
- [ ] Ợ: quái nhả ra +30% tốc, +1 máu, tối đa 6 con.
- [��] Tàu chạm tâm: −1 máu + văng 120px.
- [ ] Đóng tay: nôn quái enrage ngay, 0 điểm.

---

## 4. MA TRẬN TÍCH HỢP — 10 MECHANICS CÙNG SỐNG

### 4.1. Phân loại
| ID | Tên | Loại | Trigger chính | Tương tác cửa sổ |
|---|---|---|---|---|
| M1 | Ổ Quái Bay | Threat | Wave 6+, endless mỗi 5 wave | Đẻ chewer gặm cửa sổ |
| M2 | Boss Tách Mảnh | Boss-phase | Boss phase 2 (NULL POINTER, boss ải 3) | Mảnh chạm cửa sổ cắn 8px |
| M3 | Cửa Sổ Khiên | **Buff** | Pickup wave 4+ | Máu phụ 60px đỡ gặm |
| M4 | Mưa Mảnh Vỡ | Boss-đòn | Boss phase 2+ | Chạm cửa sổ: −15px |
| M5 | Mẹ Gà Đẻ Trứng | Threat | (sprint trước) wave 10+* | Popup con = threat nhỏ |
| M6 | Một Thành Hai | Threat | (sprint trước) wave 12+* | Popup con nhanh gấp đôi |
| M7 | Tình Yêu Sét Đánh | **Tình huống** | Wave 9+, cd 3 wave | Ring đẩy văng (0 dmg) |
| M8 | Quả Bom Cười | Threat/đòn | (sprint trước) wave 8+* | Hết 15s nổ: diệt quái + hất tàu |
| M9 | Máy Hút Bụi Vũ Trụ | **Đánh cược** | Wave 12+, cd 2 wave | Nuốt quái (0 điểm), hút cả gem |
| M10 | Gương Thần Lầy Lội | **Đọc góc** | Wave 16+, cd 4 wave | Dội đạn về tàu (1 dmg) |

*\* Trigger M5/M6/M8 theo sprint trước; nếu chưa có số liệu cooldown, áp dụng chuẩn chung §4.2.*

### 4.2. Luật chung sống (chống ngợp — bắt buộc)
1. **Ngân sách threat:** tối đa **2 popup threat** (M1/M5/M6/M8/M9) cùng sống. Vượt → xếp hàng đợi.
2. **M3 (buff) và M7/M10 (tình huống/đọc góc)** không tính vào ngân sách threat — nhưng tổng popup vẫn ≤ 3 (giới hạn trình duyệt).
3. **Không trigger 2 mechanic mới trong cùng 1 wave** (M7/M9/M10 tách nhau ít nhất 1 wave).
4. **Ưu tiên hàng đợi:** M4 (đòn boss) > M8 (đếm ngược) > M1/M5/M9 > M6 > M7/M10.
5. **Ngân sách spawn:** quái từ popup (M1 đẻ, M5 con, M9 ợ) cộng vào **tổng entity wave ≤ 120**; vượt → nest tạm ngưng đẻ (không mất lượt, đẻ bù khi vãn).
6. **Không trigger popup** trong: tutorial, wave debut quái mới, 3s đầu wave (để player định hình).

### 4.3. Combo tình huống hay (thiết kế để chúng gặp nhau — có kiểm soát)
- M7 aura gom quái + M9 hút → "combo dọn màn": player lùa bầy say nắng vào vùng hút rồi phá máy = jackpot khổng lồ. **Cho phép** — đây là emergent fun, không phải bug.
- M10 gương + M8 bom → đạn dội có thể kích nổ bom sớm. **Cho phép** — reward đọc góc.
- M9 hút + M4 mảnh vỡ bay tới → mảnh vỡ **không bị hút** (đòn boss có "quyền ưu tiên", vẽ vệt đỏ xuyên qua vùng hút). Tránh player dùng M9 vô hiệu hóa đòn boss.

---

## 5. WOW FACTOR ĐÀO SÂU — 8 Ý TƯỞNG CHỐT

> Tiêu chí: vui nhộn (không u ám) · không che gameplay quá 200ms · background lightness ≤ 14% · mọi ý tưởng có số liệu + audio hook + bản rút gọn reduced-motion.

### W1. 🎈 "BÙM BÓNG BAY" — kill thường thành bong bóng nổ
- **Gì:** quái thường chết không "vỡ vụn" nữa — nó **phồng to 1→1.35 trong 120ms** rồi **"PÓP!"** thành 10 mảnh cao su màu + 1 ring nhỏ.
- **Ở đâu:** tier `pop` (quái thường), thay thế burst hiện tại.
- **Số liệu:** scale easeOutBack 120ms → burst 10 hạt (thay vì 14) + ring r40 + SFX pop (pitch random ±5% theo loại quái — mỗi loại 1 "giọng pop" riêng, đồng bộ với 6 giọng quái đã có).
- **Audio:** `sfx.balloon_pop(type)` — synth pop + detune chống machine-gun.
- **Reduced-motion:** bỏ phồng to, chỉ burst 6 hạt.
- **Vì sao wow:** mỗi kill là 1 quả bóng bay nổ — "đã tay" mà hề hước, đúng gu vui nhộn. Không thêm particle (10 < 14 hiện tại) nên rẻ hơn.

### W2. 🎪 "DIỄU HÀNH COMBO" — milestone combo thành parade
- **Gì:** combo x10/x25/x50/x100: thay vì chỉ float chữ, một **dàn cờ mini + confetti chạy ngang top màn hình** 1.2s + số combo **squash-stretch bounce** + nhạc **major-chord stab** vui.
- **Số liệu:** banner parade 1.2s (không pause game), confetti 24 hạt, hit-stop 40ms (giữ nguyên tier), chord stab I–V–vi–IV 0.6s.
- **Combo giờ là "style meter"** (0 điểm — xem §6) nên milestone càng phải **đã mắt/đã tai** để player vẫn thèm combo.
- **Audio:** `sfx.combo_parade(tier)` — pitch leo theo tier (đã có `sfx.combo_milestone`, nâng cấp thêm lớp chord).
- **Reduced-motion:** chỉ float chữ + chord, không parade/confetti.

### W3. 🎬 "VÉN MÀN" — chuyển wave kiểu sân khấu hài
- **Gì:** hết wave: **màn sọc cartoon quét ngang 400ms** (wipe, không fade đen) + trống lăn (drumroll) → quái wave mới **"nhảy lò cò" từ mép dưới vào**, mỗi con squash khi chạm đất.
- **Wave clear bonus:** toàn bộ gem còn lại trên sân **tự bay về phía tàu trong 0.5s** ("mưa gem ăn mừng") — vừa vui vừa functional (không bỏ sót gem).
- **Số liệu:** wipe 400ms easeInOutQuad · drumroll 0.5s · quái spawn hop: rơi từ trên mép 60px + squash 150ms · magnet celebration 0.5s.
- **Audio:** `sfx.curtain()` drumroll + `sfx.gem_rain()` (gem streak pitch đã có — tái dùng).
- **Reduced-motion:** wipe → fade 200ms; bỏ hop (spawn fade-in).

### W4. 🎪 "SÂN KHẤU HÀI" — boss intro kiểu rạp xiếc
- **Gì:** boss không "hiện ra đáng sợ" nữa — nó **rơi từ trên xuống dưới chùm spotlight**, nảy **bounce 2 lần** (dust puff mỗi lần chạm đất), tên boss hiện trên **biển hiệu rạp** (panel bo tròn + bóng đèn nhấp nháy quanh viền).
- **Số liệu:** spotlight cone alpha 0.25 (không che gameplay) · rơi 0.8s + bounce 2×0.3s · biển hiệu 2.2s (thay banner text khô) · shake 6px (giảm từ 10 — hề, không hùng hổ).
- **Audio:** `sfx.boss_circus()` — fanfare major ngắn + slide-whistle rơi + "bịch bịch" bounce. *Tuyệt đối không boss roar gầm gừ.*
- **Reduced-motion:** bỏ bounce/spotlight, biển hiệu fade-in.

### W5. 🌊 "GỢN SÓNG MẶT NƯỚC" — background phản ứng với kill
- **Gì:** mỗi kill gửi **1 gợn sóng tròn mờ** lan trên background "mặt nước tối" (triết lý WOW-DIRECTION §0) — nền *sống* theo hành động của bạn mà vẫn tối.
- **Số liệu:** ripple r_max 90px, life 0.9s, alpha ≤ 0.12, tối đa **12 ripple** cùng lúc (vượt → gộp). Render ≤ 0.5ms/frame (vẽ đường tròn stroke, không fill).
- **Mỗi 3 wave:** "pháo hoa kính" 3s — 20 tia sparkle thủy tinh bay lên, alpha ≤ 0.15, **không vượt lightness 14%**.
- **Reduced-motion:** tắt ripple/sparkle hoàn toàn (nền tĩnh).

### W6. 😱 "HÚT CHẾT!" — near-miss slow-mo
- **Gì:** đạn quái/quái **sượt qua tàu trong 30px mà không trúng** → slow-mo 0.5× trong 0.5s + float **"HÚT CHẾT! +50"** + SFX huýt sáo nhẹ nhõm.
- **Số liệu:** trigger khi khoảng cách min 12–30px (dưới 12px coi như suýt trúng quá — vẫn tính), cooldown **8s**, +50 điểm cố định (flat, không scale).
- **Vì sao wow:** reward **kỹ năng né** — thứ game hiện tại chưa thưởng. Cảm giác "vừa thoát chết" là dopamine mạnh nhất.
- **Audio:** `sfx.phew()` — whistle slide-down + major blip.
- **Reduced-motion:** bỏ slow-mo, giữ float +50 và SFX.

### W7. 💥 "CHỮ TRUYỆN TRANH" — comic SFX words cho multi-kill
- **Gì:** DOUBLE/TRIPLE/RAMPAGE hiện không chỉ là text — mỗi mốc nổ 1 **chữ truyện tranh** ("BÙM!", "RẦM!", "XOẸT!", "ĐOÀNG!") **nảy tưng tưng** tại điểm multi-kill.
- **Số liệu:** chữ scale 0.5→1.2 easeOutBack 200ms, tồn tại 0.8s, font system-ui 900 (không webfont), màu vàng `#FFE14D` viền đen 2px (đọc được trên nền tối).
- **Từ vựng:** DOUBLE → "BÙM!" · TRIPLE → "RẦM RẦM!" · RAMPAGE x4+ → "XOẸT XOẸT!" + mỗi +1 → thêm 1 dấu "!".
- **Audio:** `sfx.multikill(n)` đã có — thêm lớp "chữ nổ" (noise burst ngắn).
- **Reduced-motion:** chữ fade-in/out, không nảy.

### W8. 🎁 "MỞ QUÀ" — pickup thành hộp quà
- **Gì:** heart/shield/nuke không còn là icon trôi nổi — chúng nằm trong **hộp quà nhỏ** (nơ + wobble 3Hz). Nhặt → hộp **bật nắp**: ruy-băng 12 hạt + SFX "ta-da!" + item bay vào tàu.
- **Số liệu:** hộp 26×26px, wobble ±6° 3Hz, tồn tại 12s (nhấp nháy 3s cuối), burst 12 hạt ruy-băng khi mở.
- **Audio:** `sfx.gift_open()` — ta-da major arpeggio 0.4s (phân biệt với `sfx.levelup` bằng tempo nhanh hơn).
- **Gameplay:** hộp quà **to hơn, dễ thấy hơn** icon cũ → readability tăng. M3 shieldwin pickup cũng dùng hộp quà (nơ xanh).
- **Reduced-motion:** bỏ wobble, mở hộp = fade.

### Bảng tổng hợp wow factor
| ID | Tên | Tier ảnh hưởng | Particle mới | Che gameplay? | Audio hook mới |
|---|---|---|---|---|---|
| W1 | Bùm bóng bay | pop (kill thường) | 10 (giảm từ 14) | Không | `sfx.balloon_pop(type)` |
| W2 | Diễu hành combo | milestone | 24 (1.2s) | Không (top bar) | `sfx.combo_parade(tier)` |
| W3 | Vén màn | wave transition | 0 (+magnet có sẵn) | Wipe 400ms* | `sfx.curtain()` |
| W4 | Sân khấu hài | boss intro | dust 16 | Spotlight alpha 0.25 | `sfx.boss_circus()` |
| W5 | Gợn sóng mặt nước | background | ≤12 ripple | Không | Không |
| W6 | Hút chết! | near-miss | 0 | Slow-mo 0.5s (không che) | `sfx.phew()` |
| W7 | Chữ truyện tranh | multi-kill | 0 | Chữ 0.8s tại điểm kill | (mở rộng `sfx.multikill`) |
| W8 | Mở quà | pickup | 12 | Không | `sfx.gift_open()` |

*\* Wipe 400ms là transition giữa wave (không combat) — không vi phạm "không che gameplay quá 200ms khi game đang chạy".*

---

## 6. CÂN BẰNG ĐIỂM SỐ — PHƯƠNG ÁN CHỐT: "ĐIỂM GỐC CỐ ĐỊNH"

### 6.1. Feedback user & vấn đề
> *"Điểm cứ tăng dần khó chịu quá, cứ giữ nguyên điểm gốc được."*

Nguyên nhân: công thức hiện tại `pts = (base + combo×2) × shipMul × actMul` có **3 nguồn phình điểm**:
1. `combo×2` — combo càng cao, mỗi kill càng nhiều điểm (không giới hạn).
2. `shipMul` — độ khó Khắc nghiệt ×1.6 + nâng cấp "Tham lam" ×1.3/stack (cộng dồn).
3. `actMul` — act 2 ×1.25, act 3 ×1.6.
4. Gem: +5×shipMul mỗi viên — vừa farm XP vừa farm điểm, nhập nhằng.

Hệ quả: 2 run cùng kỹ năng cho điểm chênh lệch hàng chục nghìn chỉ vì act/nâng cấp — điểm **không còn đo kỹ năng**.

### 6.2. Phương án chốt (1 phương án duy nhất — Engineering implement đúng thế này)

**"Mỗi kill = đúng điểm gốc trong MONSTER_REGISTRY. Không cộng, không nhân. Hết."**

| Nguồn điểm | Cũ | Mới (chốt) |
|---|---|---|
| Kill quái | `(base + combo×2) × shipMul × actMul` | **`base` (số nguyên gốc)** |
| Gem | +5 × shipMul điểm + XP | **0 điểm — chỉ XP** |
| Boss | 500 × shipMul | **500 cố định** |
| Phá popup (M7/M9/M10) | (chưa có) | **Điểm cố định** theo §1–3 (80/40/60) |
| First blood/wave | +50 | **+50 (giữ — flat, không scale)** |
| Multi-kill | +25 / +60 / +25×N | **Giữ nguyên (flat, không scale)** |
| Near-miss "HÚT CHẾT!" (W6) | (mới) | **+50 flat** |
| Độ khó (Chill/Thường/Khắc nghiệt) | scoreMul 1.0/1.0/1.6 | **Bỏ scoreMul — mọi độ khó điểm như nhau** |

**Combo** giữ nguyên làm **style meter** (milestone, parade W2, gem pitch-scale, float "🔥 COMBO xN") nhưng **đóng góp 0 điểm**.

### 6.3. Bảng điểm gốc (khóa — lấy từ MONSTER_REGISTRY hiện tại, không đổi số)
| Quái | Điểm | Quái | Điểm |
|---|---|---|---|
| Mini | 8 | Chaser (Truy Đuổi) | 10 |
| Cảm Tử (kamikaze) | 18 | Dasher (Lao Tới) | 20 |
| Dệt Lưới (weaver) | 22 | Gặm Viền (chewer) | 25 |
| Hồi Phục (healer) | 28 | Phun Độc (spitter) | 30 |
| Phân Thân (splitter) | 35 | Xe Tăng (tank) | 50 |
| Boss | 500 | Phá M7 / M9 / M10 | 80 / 40 / 60 |

### 6.4. Thay đổi kéo theo (bắt buộc làm cùng)
1. **Nâng cấp "Tham lam"** (`+30% điểm mọi nguồn`): đổi thành **"+1 XP mỗi gem nhặt"** (tên mới: **"Há Hốc"**? — giữ tên "Tham lam", đổi mô tả: *"Mỗi 💎 cho thêm +1 XP."*). Lý do: scoreMul không còn ảnh hưởng điểm — giữ upgrade cũ = upgrade chết.
2. **Xóa `scoreMul`** khỏi DIFF (chill/normal/hardcore) và ACTS — hoặc giữ field nhưng không dùng cho điểm (khuyến nghị xóa để khỏi nhầm).
3. **Mảnh kính từ điểm:** cũ `+1 / 1000 điểm cuối run` → mới **`+1 / 500 điểm`** (vì tổng điểm run giảm ~2–3×; ước tính run clear act 1 ≈ 5.000–6.000 điểm → ~10–12 mảnh, tương đương kinh tế cũ).
4. **Achievement điểm:** "Tay to" 50.000/run → **12.000/run** · "Huyền thoại" 200.000/run → **30.000/run** (Thường+, endless sâu mới chạm được).
5. **Daily M8 "Giờ cao điểm"** (`+30% điểm quái`): đổi thành **quái rớt thêm 1 gem** (giữ tinh thần "giờ cao điểm = farm nhiều"). Công thức `×1.1^modifier` **bỏ**.
6. **Daily anti-cheat:** ngưỡng `run < 3 phút mà điểm > 50.000` → **`> 15.000`**.
7. **HUD:** số điểm hiển thị **tabular-nums** (đã có), thêm tooltip nhỏ: *"Điểm = tổng điểm gốc — không nhân."* (1 dòng, lần đầu mở game sau update).

### 6.5. Ước tính tác động (để Engineering/QA đối chiếu)
- Run clear act 1 (waves 1–10, ~205 kill + 2 boss): **≈ 5.300 điểm** (cũ: ~15.000–25.000 tùy combo/nâng cấp).
- Run endless 25 wave giỏi: **≈ 30.000–37.000 điểm**.
- Điểm giờ **so sánh được** giữa Chill/Thường/Khắc nghiệt và giữa các run — đúng ý user: *"giữ nguyên điểm gốc"*.

### 6.6. Migration code (gợi ý, không bắt buộc theo từng chữ)
- `killEnemy`: `G.score += def.score` (bỏ combo×2, shipMul, actMul).
- Gem pickup: bỏ `G.score += Math.round(5 * s.scoreMul)` — chỉ cộng XP.
- `killBoss`: `G.score += 500`.
- Xóa/bỏ dùng `s.scoreMul`, `DIFF.*.scoreMul`, `ACTS.*.scoreMul`.

---

## 7. CÂN BẰNG ĐỘ KHÓ TỔNG THỂ

### 7.1. Chẩn đoán: 7 mechanics popup có đang "ngợp" không?
Với M1–M8 đã live + M7/M9/M10 sắp thêm, áp lực thực tế lên player gồm:
- **Áp lực spawn:** M1 (tối đa 8 con/60s) + M5 (popup con mỗi 8s) + M9 (ợ ra tối đa 6 con enrage) — wave đông có thể vượt entity budget.
- **Áp lực cửa sổ:** M1/M5 đẻ chewer-leaning + M2 mảnh cắn 8px + M4 −15px — chewer pressure cao hơn GDD v2.0 tính toán.
- **Áp lực chú ý:** tối đa 3 popup + combat chính — ngưỡng chấp nhận được *nếu* tuân §4.2.

**Kết luận:** không cần đập đi xây lại — cần **3 van điều tiết** + vài số liệu chỉnh mịn.

### 7.2. Điều chỉnh số liệu cụ thể (Engineering áp dụng)

**A. Van ngân sách (mới — bắt buộc):**
| Quy tắc | Giá trị |
|---|---|
| Popup threat cùng sống | ≤ 2 (M1/M5/M6/M8/M9) |
| Tổng popup mọi loại | ≤ 3 (giới hạn trình duyệt đã có) |
| Quái từ popup tính vào entity budget | Có — tổng entity wave ≤ 120, nest tạm ngưng đẻ khi chạm trần |
| 2 mechanic mới (M7/M9/M10) cùng 1 wave | Không — cách nhau ≥ 1 wave |

**B. Chỉnh mịn spawn & chew (wave 1–10, Thường):**
| Tham số | Cũ | Mới | Lý do |
|---|---|---|---|
| M1 spawnEvery (act 1) | 6s | **7s** | Giảm rỉ rả ở ải dễ; act 2+ giữ 6s |
| M1 maxSpawns (act 1) | 8 | **6** | act 2+ giữ 8 |
| Chew dps wave 1 → 10 | 8 → 18 px/s | **7 → 15 px/s** | Bù chewer pressure từ M1/M5 (công thức: `chew = 7 + 0.9×(wave−1)`) |
| M8 countdown | 15s | **giữ 15s** | Đã cân bằng (không phá = dọn quái hộ + hất tàu — risk/reward rõ) |
| M6 popup con | nhanh gấp đôi, HP ? | **HP con = 4, chỉ tách 1 lần** (không đệ quy) | Chống bùng nổ entity |
| M5 popup con | (sprint trước) | **khóa: mỗi con là 1 "mini-nest" HP 3, đẻ tối đa 2 mini rồi tự vỡ** | Rõ ràng, có trần |

**C. Boss (giữ nguyên triết lý `HP ≈ DPS_kỳ_vọng × 150s`):**
- Không đổi HP boss — hệ điểm mới không ảnh hưởng DPS (scoreMul chưa bao giờ tăng sát thương).
- Bổ sung: **boss wave không trigger M7/M9/M10** (đã có trong §1–3, nhắc lại để khỏi quên) — boss fight phải "sạch" để player tập trung pattern.

**D. Độ khó Chill/Khắc nghiệt (giữ bảng GDD v2.0 §8.2, chỉ sửa điểm):**
- Bỏ `Điểm ×0.8 / ×1.6` → mọi độ khó điểm như nhau (§6.2).
- Còn lại giữ nguyên (máu quái, tốc, telegraph, vá sau wave...).

### 7.3. Target trải nghiệm (không đổi)
Chill 12–15 phút · Thường 8–12 phút · Khắc nghiệt 5–8 phút. Newbie wave 3–4 trong 5 phút đầu (Chill). QA đo lại sau khi áp dụng §7.2 — nếu wave 8–10 Thường có > 90 entity cùng lúc quá 10s, giảm M1 weight thêm 10%.

---

## 8. THỨ TỰ IMPLEMENT ĐỀ XUẤT (Engineering)

| Phase | Việc | Ghi chú |
|---|---|---|
| E1 | **Hệ điểm mới §6** (kill/gem/boss + sửa Tham lam + mảnh kính + achievement + daily) | Làm trước — ảnh hưởng mọi test điểm sau này |
| E2 | **M9 Máy Hút Bụi** (logic hút/nuốt/ợ phức tạp nhất) | Cần test kỹ lực hút vs mọi behavior quái |
| E3 | **M7 Tình Yêu Sét Đánh** (merge + aura đổi target) | Aura "say nắng" cần hook vào AI chase |
| E4 | **M10 Gương Lầy Lội** (phản xạ specular + melee húc) | Toán phản xạ + phân biệt đạn dội (màu hồng) |
| E5 | **Wow factor W1–W8** | W3 (wipe) + W4 (boss intro) trước; W5 (ripple) cuối vì đụng bg.js |
| E6 | **Van cân bằng §7.2** + luật chung sống §4.2 | Áp sau khi 3 mechanics chạy được |
| E7 | Copy deck VN + audio hooks `sfx.*` mới | UX Writer + Audio có thể song song từ E2 |

Mỗi phase xong → QA theo acceptance criteria từng section (§1.11/2.11/3.11) trước khi sang phase tiếp theo.

---

## 9. CÂU HỎI MỞ — ✅ CEO ĐÃ CHỐT (2026-10-01)

| # | Câu hỏi | Quyết định của CEO (2026-10-01) |
|---|---|---|
| 1 | "Tham lam": giữ tên hay đổi tên? | **GIỮ TÊN** "Tham lam" — đổi hiệu ứng thành **+1 XP mỗi gem nhặt**. Mô tả mới: *"Mỗi 💎 cho thêm +1 XP."* |
| 2 | M7 aura "say nắng": quái có tấn công lẫn nhau không? | **CÓ** — quái dính aura **tấn công lẫn nhau**, áp dụng **tất cả mode**. |
| 3 | W6 "HÚT CHẾT!" +50 có tính vào achievement điểm? | **CÓ** — tính vào achievement điểm. |
| 4 | M9 nuốt gem mất luôn: có quá ác với newbie? | **CHỈ trong HARD (Khắc nghiệt)** gem mới mất vĩnh viễn. **Normal (Thường) / Easy (Chill):** gem trong vùng hút bị **hất văng ra ngoài**, không mất. |

*Các quyết định trên đã được chuyển cho Team Game Dev để implement (2026-10-01). Visual spec tương ứng xem `studio/design/DESIGN-SYSTEM.md` v1.1 §7.1 (M7 aura) và §7.3 (M9 gem theo độ khó).*

---

*Design lock. Tổng cộng: 3 mechanics mới (M7/M9/M10) + 8 wow factor + 1 hệ điểm mới + 1 đợt cân bằng — tất cả số liệu đã chốt, Engineering chỉ việc build.*
