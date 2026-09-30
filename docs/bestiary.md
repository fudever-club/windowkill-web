# BESTIARY — WINDOWKILL Web Edition (FU-DEVER Game Studio)
**Monster Designer spec — Engineering code trực tiếp được. Text trong game: TIẾNG VIỆT.**

> Bối cảnh: quái là "bug/lỗi hệ thống" đang gặm cửa sổ popup (cửa sổ = HP). Mọi quái vẽ bằng canvas shape + màu hex, KHÔNG dùng ảnh. Công thức máu/tốc theo wave, nhân thêm `hpM`/`spM` theo độ khó như quái cũ. Perf: tổng entity < 120, mỗi quái update O(1)-nhẹ.

---

## PHẦN 1 — 8 QUÁI MỚI

### 1. `spitter` — "Phun Mã Độc" (Ranged / bắn xa)
- **Hình dạng canvas:** hình thoi (diamond) `#f43f5e`, r12. Phía trước có "họng súng" là tam giác nhỏ `#7f1d1d`; khi aim, họng súng sáng dần sang `#fff` + 3 chấm đỏ xếp hàng trước mặt (telegraph). Vệt đuôi: hạt đỏ mờ.
- **Chỉ số:** máu `(5 + wave*0.7) × hpM` · tốc `70 × spM` · XP 3 · gem 30 · **debut wave 2**.
- **State machine:**
  - `wander` (2.5s): giữ khoảng cách 280–380 với tàu, di chuyển vòng quanh tàu (strafe). Hết giờ → `aim`.
  - `aim` (0.6s): đứng yên, họng súng sáng dần, vẽ 3 tia mờ hướng về tàu (telegraph ≥0.5s ✓). Hết giờ → `volley`.
  - `volley`: bắn 3 viên "gói mã độc" cách nhau 0.12s — đạn tròn r5 `#f43f5e` viền `#fff`, tốc 170, dmg 1 lên tàu, bay thẳng.
  - `cooldown` (2.2s) → `wander`.
- **Tấn công:** lên TÀU (đạn dmg 1). Lên CỬA SỔ (gián tiếp): viên đạn nào bay tới viền mà chưa trúng tàu sẽ để lại **vết nứt** trên viền đó (tối đa 3 vết/viền). Mỗi vết: chewer gặm tại viền đó +25% lượng shrink. Vết nứt vẽ zigzag `#7c3aed` + text float "⚠ Viền nứt!" lần đầu. Wave clear vá toàn bộ vết nứt.
- **Điểm yếu + cách khắc chế (quan trọng):** máu giấy, đứng yên hoàn toàn trong 0.6s aim → **áp sát vòng sau lưng** trong lúc aim là an toàn nhất. Đạn bay chậm (170) → né ngang đơn giản. Ưu tiên giết trước khi nó kịp nứt 2+ viền. Đạn băng (slow) làm volley thưa, dễ né hơn.
- **Ghi chú implement:** đạn spitter tái dùng mảng `G.ebullets` (thêm field `from:"spitter"`); khi đạn chạm viền → gọi `crackEdge(edge)` thay vì despawn thường.

### 2. `booster` — "Khuếch Đại Lỗi" (Support / buff đồng loại)
- **Hình dạng canvas:** sao 5 cánh `#22c55e`, r14, xoay chậm 0.6 rad/s. Vòng aura r220 vẽ nét đứt `#22c55e` alpha 0.35. Mỗi 1s phát 1 xung vòng tròn lan ra từ tâm (visual buff đang chạy).
- **Chỉ số:** máu `(6 + wave*0.8) × hpM` · tốc `55 × spM` · XP 3 · gem 35 · **debut wave 4**.
- **State machine:**
  - `reposition`: giữ khoảng cách ~300 với tàu; luôn di chuyển về phía "sau lưng" đồng loại gần nhất (nấp sau tank/warden). Không có đòn tấn công trực tiếp.
  - `aura` (passive, tick mỗi 0.25s để nhẹ perf): mọi quái địch trong 220px được +40% tốc độ; chewer trong aura có chu kỳ gặm ×0.7 (0.9s → 0.63s). Quái được buff vẽ viền sáng `#22c55e` nhấp nháy.
- **Tấn công:** lên CỬA SỔ (gián tiếp): tăng tốc độ gặm của chewer + tăng tốc áp sát của cả bầy. Không gây dmg trực tiếp.
- **Điểm yếu + cách khắc chế:** **ƯU TIÊN GIẾT SỐ 1** — mọi wave có booster, luật bất thành văn: giết nó trước. Nó nấp sau tank/warden → dùng đạn xuyên (pierce) hoặc vòng bên hông. Đạn băng trúng booster → aura TẮT 3s (khắc chế cứng, hiện icon "❄ Ngắt khuếch đại!"). Đứng ngoài vòng aura khi dọn quái xung quanh.
- **Ghi chú implement:** aura tick 0.25s (không mỗi frame); lưu `e.buffed=true` để vẽ viền sáng; khi booster chết, burst xanh lá + text "Đã ngắt khuếch đại!".

### 3. `bomber` — "Liều Chết Cảm Tử" (Kamikaze)
- **Hình dạng canvas:** tròn `#ef4444`, r11; lõi trắng `#fff` chớp nhanh dần khi fuse; vệt khói xám. Khi fuse: phình to 1→1.4×, rung mạnh.
- **Chỉ số:** máu `(4 + wave*0.6) × hpM` · tốc `(130 + wave*5) × spM` · XP 2 · gem 25 · **debut wave 3**.
- **State machine:**
  - `seek`: bay thẳng vào tàu, lượn sóng nhẹ. Khi cách tàu < 70 → `fuse`.
  - `fuse` (0.7s): DỪNG LẠI tại chỗ, phình to + rung + tiếng bíp nhanh dần; vẽ vòng tròn đỏ r100 mờ dần hiện = **blast radius** (telegraph ✓). Hết giờ → `explode`. Nếu bị bắn chết trong fuse → **vẫn nổ** (dmg tính như thường).
  - `explode`: gây 1 dmg cho tàu trong bán kính 100 + knockback mạnh; nếu tâm nổ cách viền < 120 → **nứt viền đó 1 vết** (dùng chung `crackEdge`).
- **Tấn công:** lên TÀU (1 dmg AoE) + lên CỬA SỔ (nứt viền nếu nổ gần viền).
- **Điểm yếu + cách khắc chế:** **giết từ xa** — đừng để nó vào <150px mới bắn (vì chết gần vẫn nổ). Dùng knockback đạn (kbx) đẩy nó ra giữa map/vùng trống rồi mới kết liễu. Tuyệt đối không để nó fuse gần viền. Đạn băng kéo dài fuse thêm 0.5s → thêm thời gian chạy khỏi blast radius.
- **Ghi chú implement:** tái dùng `burst()` + `G.shake`; vòng telegraph vẽ `strokeStyle rgba(239,68,68, alpha theo thời gian fuse)`.

### 4. `freezer` — "Đóng Băng Hệ Thống" (Control / khống chế)
- **Hình dạng canvas:** bông tuyết — 6 cánh vẽ bằng đường thẳng `#38bdf8`, r13, xoay chậm; tâm tròn `#e0f2fe`. Khi chuẩn bị bắn/phun sương, các cánh sáng lên `#fff`.
- **Chỉ số:** máu `(6 + wave*0.7) × hpM` · tốc `60 × spM` · XP 3 · gem 30 · **debut wave 3**.
- **State machine:**
  - `drift`: lượn vòng quanh tàu ở khoảng cách ~260.
  - `aim_ice` (mỗi 3s): telegraph 0.5s (cánh sáng + hạt băng tụ về tâm) → bắn 1 "đạn băng" tốc 140, r6: dmg 0 nhưng trúng tàu → **slow 50% trong 2.5s** (refresh, không cộng dồn). Tàu bị slow vẽ viền băng xanh.
  - `frost` (mỗi 7s): chọn viền gần nhất → telegraph 0.8s (viền hiện sương mờ + text "❄ Sắp đóng băng!") → **đóng băng viền 8s**: chewer đang bám viền đó MIỄN NHIỄM hất văng (bắn đạn vào viền không hất được). Vẽ lớp băng `#38bdf8` alpha 0.5 phủ dọc viền + icon ❄.
- **Tấn công:** lên TÀU (slow, không dmg) + lên CỬA SỔ (bảo kê chewer → gián tiếp tăng sát thương cửa sổ).
- **Điểm yếu + cách khắc chế:** ưu tiên giết thứ 2 (sau booster). Đạn băng chậm (140) → né ngang. Khi viền bị đóng băng: **đổi chiến thuật — bắn TRỰC TIẾP vào chewer** thay vì bắn viền hất văng. Đạn băng của mình không giải được băng viền — phải chờ 8s, nên đừng để freezer sống lâu.
- **Ghi chú implement:** thêm `G.frozenEdges = {left:0,...}` đếm ngược; trong logic hất văng chewer (dòng ~523) check `frozenEdges[edge]>0` thì bỏ qua hất.

### 5. `warden` — "Giáp Gương" (Tanker đặc biệt / phản xạ)
- **Hình dạng canvas:** ngũ giác `#cbd5e1` r20, viền `#64748b` dày 3px; mặt trước (hướng di chuyển) vẽ 1 đường chéo gương `#ffffff` alpha 0.9 bóng loáng; khi phản xạ thành công: chớp sáng toàn thân 0.2s.
- **Chỉ số:** máu `(16 + wave*2.5) × hpM` · tốc `40 × spM` · XP 5 · gem 60 · **debut wave 4**.
- **State machine:**
  - `advance`: tiến chậm về phía tàu, mặt gương luôn hướng về tàu (tốc xoay 90°/s — chậm, đây là điểm yếu).
  - `guard` (khi có chewer đang gặm trong 150px): di chuyển tới chắn giữa tàu và chewer (hộ vệ), mặt gương hướng tàu.
  - Cơ chế gương (passive): đạn tàu trúng mặt trước (góc ±60° so với hướng nhìn) bị **PHẢN XẠ** — không gây dmg, đạn nảy theo góc phản xạ và biến mất sau 0.4s; nếu tia phản xạ bay tới viền trong 200px → **nứt viền 1 vết**. Đạn trúng hông/sau → dmg ×1.5. **Knockback (kbx/kby) vẫn tác dụng đầy đủ từ mọi hướng.**
- **Tấn công:** không dmg trực tiếp; lên CỬA SỔ (phản xạ đạn → nứt viền; hộ vệ chewer).
- **Điểm yếu + cách khắc chế:** **vòng ra sau lưng** — gương chỉ che mặt trước, strafe vòng quanh (nó xoay chậm 90°/s). Đạn xuyên (pierce upgrade) bỏ qua gương hoàn toàn. Mẹo nâng cao: **bắn vào viền gần nó** → hất văng làm nó xoay lộ lưng. Đừng xả đạn vào mặt gương khi nó đang chắn trước viền nứt.
- **Ghi chú implement:** tính góc đạn tới vs `e.faceAngle`; phản xạ = vẽ tia sáng ngắn (không cần entity đạn thật) + check khoảng cách tới viền.

### 6. `glimmer` — "Đom Đóm Vàng" (Bonus / chạy trốn rớt gem)
- **Hình dạng canvas:** sao 4 cánh (sparkle) `#fbbf24` r9; scale pulse theo sin + hạt vàng rơi liên tục; có quầng sáng nhẹ.
- **Chỉ số:** máu `2` (cố định, không scale wave) · tốc `175 × spM` · XP 1 · gem 50 (rớt 5 viên gem ×10) · tồn tại tối đa 12s · **debut wave 2**.
- **State machine:**
  - `spawn`: hiện ra ở rìa map + text "✨ Đom Đóm Vàng! Bắn hạ để nhận gem!" (chỉ lần đầu gặp).
  - `flee`: chạy KHỎI tàu (hướng ngược lại, có né nhẹ), luôn nhắm viền gần nhất. Không tấn công, không gây dmg.
  - `escape`: chạm viền → "chui qua khe cửa sổ" biến mất + text "Mất rồi..." → mất thưởng. Khi chui qua, để lại **khe hở** trên viền 5s: lần `shrinkWindow` tiếp theo tại viền đó +10px (vẽ khe hở tím mờ).
- **Tấn công:** không. Là quái bonus risk/reward.
- **Điểm yếu + cách khắc chế:** máu 2 = 1–2 viên đạn. **Chặn đầu** — đoán hướng nó chạy về viền, đứng chặn bắn. Đạn băng làm chậm 50% → dễ bắn gấp đôi. Cân nhắc: đừng mải đuổi mà quên chewer đang gặm — gem không đáng bằng cửa sổ.
- **Ghi chú implement:** spawn ngẫu nhiên mỗi wave (tỉ lệ ~15%, tối đa 1 con/wave); `G.windowGaps = {edge: timer}` cộng thêm shrink.

### 7. `phantom` — "Bóng Ma Ẩn" (Tàng hình / nhấp nháy)
- **Hình dạng canvas:** blob tròn méo (8 điểm sin) `#a78bfa` r12. `visible`: alpha 1, mắt đỏ `#ff5470` sáng dần. `hidden`: alpha 0.15, chỉ thấy hạt nhiễu tím bay + tiếng rè nhẹ (audio cue).
- **Chỉ số:** máu `(3 + wave*0.5) × hpM` · tốc `150 × spM` (khi ẩn) / 0 (khi hiện) · XP 3 · gem 35 · **debut wave 5**.
- **State machine:**
  - `visible` (0.6s): ĐỨNG YÊN, hiện rõ, mắt đỏ sáng dần (telegraph cho đợt áp sát). Hết giờ → `hidden`.
  - `hidden` (1.8s): alpha 0.15, di chuyển nhanh về phía tàu; **vẫn bị đạn trúng nếu bắn đúng vị trí** (hitbox giữ nguyên — reward gamesense). Chạm tàu → 1 dmg.
  - `slash`: nếu đang ẩn mà chạm viền → rạch **2 vết nứt dài** trên viền (bằng 2 vết thường), hiện hình ngay, cooldown 10s. Telegraph 0.5s trước slash: hạt nhiễu tụ dọc viền + tiếng "rẹt" + text "⚠ Bóng ma rạch viền!".
- **Tấn công:** lên TÀU (1 dmg bất ngờ) + lên CỬA SỔ (rạch nứt khi chạm viền lúc ẩn).
- **Điểm yếu + cách khắc chế:** **đạn băng là khắc chế cứng** — trúng băng → hiện hình 3s (alpha 1, tốc -50%). Bắn phủ vào đám hạt nhiễu khi nó ẩn. Đứng xa viền → nó không có cơ hội slash. Nghe tiếng rè để đoán hướng di chuyển.
- **Ghi chú implement:** thêm field `e.cloak` (0=hidden,1=visible); đạn băng set `e.revealT=3`; khi `revealT>0` bỏ qua cloak.

### 8. `broodmother` — "Ổ Lỗi Sinh Sản" (Đẻ trứng)
- **Hình dạng canvas:** tròn to `#16a34a` r24; 5–7 đốm trứng `#fbbf24` trên lưng phập phồng theo sin; khi sắp đẻ (telegraph 0.8s): đốm sáng lên `#fff`, toàn thân rung.
- **Chỉ số:** máu `(14 + wave*1.8) × hpM` · tốc `38 × spM` · XP 6 · gem 70 · **debut wave 5**.
- **State machine:**
  - `lumber`: di chuyển chậm về phía tàu nhưng **dừng ở cách viền ≥100px** (không áp sát viền).
  - `lay` (mỗi 4s, tối đa 4 trứng sống): telegraph 0.8s → đẻ 1 trứng tại vị trí ngẫu nhiên quanh mình (r30).
  - Trứng (entity riêng `egg`): r8, máu 1 (1 hit vỡ), nở sau 5s — vỏ nứt dần theo thời gian (visual 3 nấc). Nở → mini (70%) / chaser (30%). **Nếu trứng nằm trong 40px của viền → dính viền, nở thành CHEWER** (bám gặm ngay!).
- **Tấn công:** lên TÀU (trứng nở ra quái) + lên CỬA SỔ (trứng dính viền → chewer miễn phí).
- **Điểm yếu + cách khắc chế:** **bắn trứng ngay — 1 viên là vỡ**. Dùng knockback (bắn vào viền / đạn) đẩy mẹ ra GIỮA MAP, xa viền → trứng không dính viền được. Dọn hết trứng rồi focus mẹ. Đạn nổ/AoE (nếu có nâng cấp) dọn trứng hàng loạt cực hiệu quả.
- **Ghi chú implement:** entity `egg` dùng chung mảng enemies với `type:"egg"`, field `hatchT`; khi nở gọi `spawnEnemy` tương ứng; cap 4 trứng/mẹ để giữ entity < 120.

---

## PHẦN 2 — BẢNG CÂN BẰNG (14 quái)

| id | Vai trò | Máu (×hpM) | Tốc (×spM) | Đe dọa chính | XP / gem | Khắc chế tóm tắt |
|---|---|---|---|---|---|---|
| chaser | Đuổi / dmg tàu | 2+wave*0.5 | 95+wave*7 | ~0.5 DPS tàu (chạm) | 1 / 10 | Giữ khoảng cách, bắn khi nó lượn |
| chewer | Gặm cửa sổ | 3+wave*0.4 | 78+wave*4 | ~15px/s cửa sổ khi bám | 2 / 25 | Bắn vào viền gần nó để hất văng |
| tank | Tanker chặn đường | 12+wave*2.2 | 46 | ~0.3 DPS + chắn đạn | 4 / 50 | Đạn xuyên / vòng sau, dồn dmg |
| dasher | Sát thủ dash | 4+wave*0.5 | 120+wave*5 | 1 dmg dash bất ngờ /3s | 2 / 20 | Né ngang khi aim đỏ, đừng đứng yên |
| splitter | Phân tách | 7+wave | 70+wave*4 | Chết → 2 mini | 3 / 35 | Giết ở xa, lùi ra trước khi nó vỡ |
| mini | Quấy rối nhanh | 1.5 | 150 | ~0.4 DPS theo bầy | 1 / 8 | Đạn băng → vỡ ngay; dọn bằng AoE |
| spitter | Bắn xa | 5+wave*0.7 | 70 | ~0.4 DPS + nứt viền | 3 / 30 | Áp sát vòng sau lưng lúc aim |
| booster | Buff đồng loại | 6+wave*0.8 | 55 | +40% tốc bầy, gặm nhanh ×1.4 | 3 / 35 | GIẾT ĐẦU TIÊN; băng → tắt aura 3s |
| bomber | Cảm tử | 4+wave*0.6 | 130+wave*5 | 1 dmg AoE r100 + nứt viền | 2 / 25 | Giết từ >150px; đẩy ra giữa map |
| freezer | Khống chế | 6+wave*0.7 | 60 | Slow 50% + băng viền 8s | 3 / 30 | Né đạn băng; băng viền → bắn thẳng chewer |
| warden | Tanker gương | 16+wave*2.5 | 40 | Phản xạ nứt viền, hộ vệ chewer | 5 / 60 | Vòng sau lưng; đạn xuyên; hất xoay |
| glimmer | Bonus chạy trốn | 2 (cố định) | 175 | Không (mất = mất gem) | 1 / 50 | Chặn đầu hướng viền; đạn băng |
| phantom | Tàng hình | 3+wave*0.5 | 150 / 0 | 1 dmg bất ngờ + rạch viền | 3 / 35 | Đạn băng hiện hình 3s; đứng xa viền |
| broodmother | Đẻ trứng | 14+wave*1.8 | 38 | 1 trứng/4s → mini/chewer | 6 / 70 | Bắn trứng (1 hit); đẩy mẹ ra giữa map |

**Gợi ý tỉ lệ spawn (thêm vào bảng random hiện tại):** wave 2: spitter 10%, glimmer 15% (tối đa 1/wave); wave 3: bomber 10%, freezer 8%; wave 4: booster 6%, warden 6%; wave 5: phantom 8%, broodmother 5% (tối đa 1/wave). Mỗi wave debut tối đa **1 loại quái mới**.

---

## PHẦN 3 — NÂNG CẤP 6 QUÁI CŨ (2–3 đề xuất/con, làm được trong 1–2 ngày)

### 1. chaser
- **Elite `chaser_alpha` (từ wave 6):** r15, máu ×2, tốc +15%, để lại vệt đỏ; tỉ lệ 15% khi spawn chaser. (0.5 ngày: thêm nhánh trong `mkEnemy`.)
- **Bay đội hình (wave ≥8):** khi ≥3 chaser trong 200px, chúng tự xếp chữ V, +20% tốc. Tạo cảm giác "bầy có tổ chức". (1 ngày: check neighbor mỗi 0.5s.)
- **Telegraph chạm:** khi cách tàu <60px, chaser chớp đỏ 0.3s + tiếng "vút" nhỏ → newbie học được timing né. (0.5 ngày.)

### 2. chewer
- **Báo gặm:** 0.5s trước mỗi lần gặm, viền rung nhẹ + hiện "răng cưa" chớp tại điểm gặm + tiếng gặm *rộp rộp*. Người chơi có 0.5s để bắn viền hất văng trước khi mất máu cửa sổ. (1 ngày.)
- **Elite "chewer bự" (wave ≥7):** r18, gặm 20px/lần, cần **2 phát bắn vào viền** mới hất văng (thêm `e.grip=2`). (0.5 ngày.)
- **Choáng khi bị hất:** chewer bị hất văng → choáng 1.5s (nằm ngửa, sao xoay trên đầu), không di chuyển. Tạo "cửa sổ phản công" và dạy người chơi giá trị của cơ chế hất viền. (0.5 ngày.)

### 3. tank
- **Đòn húc (wave ≥6):** khi tàu trong 200px: telegraph 0.6s (nghiêng người về sau, bụi bay) → húc tốc 3× trong 0.5s, dmg 1. Tank không còn là bao cát đứng yên. (1 ngày: thêm state `windup`/`charge`.)
- **Chết rơi mini (wave ≥5):** tank chết → rơi 2 mini (kế thừa 50% knockback còn dư của phát kết liễu). (0.5 ngày.)
- **Điểm yếu lõi:** vòng tròn lõi giữa thân sáng hơn khi bị bắn (flash); đạn trúng lõi (bán kính r×0.45) gây ×1.5 dmg → reward aim chuẩn. (1 ngày.)

### 4. dasher
- **Đường aim 3 phase màu:** stalk = vàng mờ; aim 0.7s = vàng đậm chớp **nhanh dần**; 0.15s cuối = ĐỎ → "né NGAY". Dạy timing bằng màu sắc, đúng quy tắc telegraph chung. (0.5 ngày.)
- **Dash giả (wave ≥7):** 30% dash hủy giữa chừng (sau 0.2s), quay lại `aim` lần 2 với hướng mới. Khắc chế thói quen né sớm. (1 ngày: thêm nhánh trong state machine.)
- **Vệt tàn ảnh:** khi dash để lại 4–5 tàn ảnh mờ dần → đọc được hướng dash, nhìn đã mắt. (0.5 ngày.)

### 5. splitter
- **Báo vỡ:** khi máu <50%: phồng to dần + rung 0.5s trước khi vỡ (hiện tại tách ngay khi chết). Người chơi kịp lùi ra khỏi vị trí mini sắp spawn. (0.5 ngày.)
- **Tách 3 mini (wave ≥8):** thay vì 2 → 3 mini, nhưng mini con máu 1 (dễ dọn hơn). Tăng áp lực số lượng đúng chất "phân tách". (0.5 ngày.)
- **Kế thừa knockback:** mini con spawn tại vị trí + hướng knockback còn dư của phát kết liễu → bắn mạnh thì mini văng xa, có tính chiến thuật. (0.5 ngày, dùng sẵn `e.kbx/kby`.)

### 6. mini
- **Nhịp bầy đàn:** xen kẽ 3s đuổi → 1s tản ra (tránh bị dọn AoE một lần, tạo nhịp thở cho người chơi). (1 ngày.)
- **Mini vàng (wave ≥9):** 10% mini có màu vàng kim, rớt 2 gem — mini-version của glimmer, giữ wave cao luôn có bất ngờ. (0.5 ngày.)
- **Tương tác đạn băng:** mini đang bị slow mà trúng thêm 1 viên đạn băng nữa → **vỡ tan** (chết ngay, hiệu ứng tinh thể). Dạy combo "băng + băng", tăng giá trị nâng cấp đạn băng. (0.5 ngày.)

---

## PHẦN 4 — NGUYÊN TẮC ĐỌC HIỂU (READABILITY)

### Quy ước MÀU theo mục tiêu đe dọa (newbie nhìn màu đoán được nguy hiểm gì)
| Màu | Ý nghĩa | Quái |
|---|---|---|
| **Tím** `#c084fc` `#8b2fc9` `#7c3aed` | Đe dọa CỬA SỔ (gặm/nứt/rạch) | chewer, boss, vết nứt, phantom (rạch) |
| **Đỏ** `#ff5470` `#ef4444` `#f43f5e` | Sát thương TÀU | chaser, bomber, spitter |
| **Vàng** `#ffe14d` | Tốc độ cao, cần né nhanh | dasher |
| **Vàng kim** `#fbbf24` | Bonus / gem, KHÔNG nguy hiểm | glimmer, mini vàng, đốm trứng |
| **Cam** `#ffb020` | Trâu bò, nhiều máu | tank |
| **Xanh lá** `#22c55e` `#16a34a` | Hỗ trợ / sinh sản (giết sớm) | booster, broodmother |
| **Xanh dương** `#38bdf8` | Khống chế / băng | freezer |
| **Bạc** `#cbd5e1` | Giáp / phản xạ (đừng bắn mặt trước) | warden |
| **Cyan** `#7df9ff` | Phân tách | splitter |
| **Hồng** `#ff9df3` | Yếu, đông | mini |

### Quy ước SHAPE theo hành vi
- **Nhọn / tam giác / mũi tên** → lao vào tàu (chaser, dasher, mini).
- **Vuông** → bám/gặm cửa sổ (chewer, boss).
- **Tròn** → đặc biệt: nổ / đẻ / phân tách (bomber, broodmother, splitter).
- **Sao** → buff hoặc bonus (booster = sao 5 cánh xanh lá; glimmer = sao 4 cánh vàng kim).
- **Đa giác đều** → trâu/giáp (tank = lục giác cam; warden = ngũ giác bạc).

### Quy tắc TELEGRAPH chung (bắt buộc mọi quái)
1. **Mọi đòn nguy hiểm telegraph ≥0.5s** trước khi phát động. Không có đòn "ăn ngay".
2. **3 phase chuẩn:** `chuẩn bị` (màu vàng / chớp chậm) → `sắp phát` (màu đỏ / chớp nhanh) → `phát động`. Riêng đòn hại cửa sổ dùng **tím** thay đỏ ở phase 2.
3. **Telegraph = visual + âm thanh + (lần đầu) text tiếng Việt.** Lần đầu gặp quái mới ở wave debut: banner "QUÁI MỚI: <tên> — <mô tả 1 dòng cách khắc chế>".
4. **Quái mới spawn có 0.5s "hiện hình"**: bất khả xâm phạm & không gây hại, hiện dần từ alpha 0.
5. **Hiệu ứng viền** (nứt/băng/khe hở) luôn có icon + text cảnh báo lần đầu, và visual phân biệt rõ: nứt = zigzag tím `#7c3aed`; băng = phủ xanh `#38bdf8` + ❄; khe hở = tím mờ.
6. **Nhất quán toàn game:** đạn địch luôn có viền sáng/vòng ngoài để phân biệt với đạn tàu; slow luôn vẽ `#7dd3fc` (đã có trong code).

### Quy tắc SPAWN & PERF
- Mỗi wave debut tối đa 1 loại quái mới (xem bảng debut wave 2–5 ở Phần 1).
- Boss wave 5/10/...: từ wave 10, boss có thể gọi thêm 1 `freezer` thay vì chỉ chewer (tăng độ khó theo quái mới).
- Perf: aura/neighbor check chạy theo tick 0.25–0.5s, không mỗi frame; trứng/bẫy giới hạn số lượng sống (broodmother ≤4 trứng, glimmer ≤1/wave); tổng entity giữ <120.
