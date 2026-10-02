# SEASON 1 — "MÙA DEADLINE" 🏢⏰
### Design doc — FU-DEVER Game Studio, team Game Design

| | |
|---|---|
| **Phiên bản** | 1.0 — Design lock, chờ Engineering |
| **Ngày** | 2026-10-01 |
| **Yêu cầu tiên quyết** | Game Design v2.0 đã implement (campaign 5 ải, Mảnh Kính, Daily Challenge) |
| **Thời lượng season** | **6 tuần** (đủ dài để cày, đủ ngắn để FOMO) |
| **Tài liệu liên quan** | `studio/game-design/GAME-DESIGN-DOC.md` (v2.0) · `docs/bestiary.md` · `ROADMAP.md` Phase 4–5 |

> Giọng văn: VUI NHỘN, nhanh, tuyệt đối không creepy/u ám. Mọi quái vẽ bằng canvas shape, SFX synth Web Audio. Không copy asset/brand của game gốc.

---

## 1. Chủ đề & cốt truyện

**"MÙA DEADLINE"** — FU-OS sắp release bản mới. Cả hệ thống bước vào chế độ OT: đèn văn phòng sáng trưng, cà phê chảy thành sông, và lũ bug — vốn đã đủ rắc rối — giờ còn bị **dí deadline** nên hoảng loạn gấp đôi.

- **Câu tagline season:** *"Bug cũng phải chạy deadline. Bạn thì không — bạn là người dí chúng."*
- **Visual season:** launcher + menu phủ theme "văn phòng đêm OT": đèn huỳnh quang, sticky note bay, đồng hồ đếm ngược trên HUD trong các wave có quái season.
- **Vị trí trong vũ trụ:** diễn ra song song campaign — quái season "xâm nhập" vào các ải từ ải 2 trở đi (lý do: bug từ phòng dev tràn sang), và là nội dung chính của Daily Challenge trong 6 tuần season.

**Tại sao chủ đề này:** gắn văn hóa dev/hài hước (đúng chất FU-DEVER "WORK HARD - PLAY HARD"), dễ đẻ quái/boss/mission vui, và tạo cảm xúc "cày cùng đồng nghiệp" cho retention.

---

## 2. Quái mới (3 con) + Boss mới (1)

Tuân thủ quy ước readability v2.0 (§6.2): màu theo mục tiêu, shape theo hành vi, telegraph ≥ 0.5s, wave debut có banner.

### 2.1. "DEADLINE DÍ" — quái đồng hồ báo thức
- **id:** `deadline` · **Màu:** vàng (tốc độ/áp lực) · **Shape:** ngôi sao/đồng hồ (bonus-buff bầy)
- **Hành vi:** spawn kèm **đếm ngược 12s** hiện trên đầu (tiếng tích tắc to dần). Hết giờ mà chưa chết → **reo chuông**: toàn bộ quái trên sân **+35% tốc độ trong 10s** ("cả team bị dí"), sau đó nó tự vỡ (không rớt gem).
- **Chỉ số gợi ý:** HP 5+wave×0.6 · tốc 85 · XP 3 · không gây sát thương trực tiếp, bay lượn tránh đạn nhẹ.
- **Cách counter:** **ưu tiên bắn hạ trước khi chuông reo** (như Khuếch Đại Lỗi). Đạn băng **đóng băng đếm ngược 3s**. Banner debut: *"DEADLINE DÍ — hạ nó trước khi chuông reo!"*
- **Tái dùng:** pattern M8 Quả Bom Cười (popup đếm ngược) — chuyển thành entity đếm ngược.

### 2.2. "NHÂN VIÊN OT" — quái tăng nộ theo thời gian
- **id:** `otworker` · **Màu:** đỏ (đe dọa tàu), càng "cáu" càng đỏ sậm + tách cà phê đổ · **Shape:** tam giác/nhọn (lao vào tàu)
- **Hành vi:** ôm cốc cà phê đuổi theo tàu. Mỗi **10s còn sống** +1 stack **"Cáu"** (tối đa 5): mỗi stack +15% tốc, +1 sát thương chạm. Visual: mắt trợn to dần, có quầng "💢".
- **Chỉ số gợi ý:** HP 4+wave×0.5 · tốc 100+wave×5 (chưa cáu) · chạm gây 1 (+1 mỗi 2 stack) · XP 2.
- **Cách counter:** **giết nhanh, đừng để nó OT lâu**. Đạn băng **reset stack Cáu về 0** ("cho nó nghỉ ngơi"). Đừng để 3 con cùng cáu max — dồn đạn băng.
- **Tái dùng:** state machine chaser + stack modifier (tương tự elite scaling).

### 2.3. "KẺ HỌP HÀNH" — quái hỗ trợ vùng làm chậm
- **id:** `meeting` · **Màu:** xanh lá (hỗ trợ — giết sớm) · **Shape:** tròn (triệu hồi/vùng)
- **Hành vi:** đứng yên/di chuyển chậm, tỏa **vùng "họp hành" bán kính 160px**: tàu trong vùng bị **slow 35%** ("họp làm chậm tiến độ" — hiện chữ float vui). Mỗi 12s **"triệu tập"**: kéo quái xung quanh về phía nó thành cụm (không kéo tàu).
- **Chỉ số gợi ý:** HP 8+wave×0.9 · tốc 45 · XP 4 · không tấn công trực tiếp.
- **Cách counter:** **đứng ngoài vòng họp, bắn từ xa**. Đạn Nổ/Đạn Xích dọn cả cụm sau triệu tập. Banner debut: *"KẺ HỌP HÀNH — đừng vào vòng họp của nó!"*
- **Tái dùng:** aura slow của Đóng Băng Hệ Thống + lực hút của M9 Máy Hút Bụi Vũ Trụ (chỉ hút quái, không hút tàu).

### 2.4. BOSS MỚI — "SẾP LỚN: NGÀI DEADLINE" 🏢
- **Hình dạng:** đồng hồ báo thức khổng lồ đeo cà vạt, tay cầm xấp "task" (sticky note), mặt đồng hồ là mặt boss cau có nhưng hài hước.
- **Cách vào:** nút **"Đấu Sếp"** trên launcher trong thời gian season (1 lượt/ngày tính điểm season, chơi lại không giới hạn để luyện).
- **Phase 1 — "Giao việc" (100–66%):** ném xấp task (đạn giấy bay chậm, trúng → slow tàu 2s); mỗi 20s gọi 2 Nhân Viên OT.
- **Phase 2 — "Họp khẩn" (66–33%):** thả 2 vùng họp (slow zone r180, tồn tại 12s); gọi 1 Kẻ Họp Hành + 3 chaser.
- **Phase 3 — "Scope Creep" (33–0%):** **đếm ngược 30s** giữa màn hình. Mỗi 6s thêm 1 "scope" ngẫu nhiên: spawn 1 Deadline Dí / 1 vùng họp / quái nhanh +20% 6s. Hết giờ = **"trễ deadline"** → cửa sổ vỡ ngay (thua, bất kể máu tàu). Đua DPS thuần như NULL POINTER nhưng hỗn loạn leo thang.
- **Điểm yếu:** phase 3 đứng yên "duyệt scope" 2s sau mỗi lần thêm scope → ×1.5 sát thương. Đạn băng kéo dài cửa sổ cơ hội.
- **Thưởng:** +50 mảnh kính · achievement "Dí Lại Sếp" · điểm season ×2.
- **Tái dùng:** countdown phase của NULL POINTER + slow zone + summon patterns.

### 2.5. Bảng chèn quái season vào nội dung hiện có

| Vị trí | Quái season xuất hiện |
|---|---|
| Campaign ải 2+ | Deadline Dí từ wave 4, Nhân Viên OT từ wave 6, Kẻ Họp Hành từ wave 8 (mỗi ải tối đa 2 con/wave) |
| Campaign ải 5 | cả 3 loại, mật độ ×1.5 (ải elite) |
| Endless | từ wave 6, tỉ lệ 10% spawn |
| Daily Challenge | 6 tuần season: mỗi ngày ít nhất 1 modifier liên quan season (M9–M10 mới, xem §3) |

---

## 3. Hệ thống nhiệm vụ season (Missions)

### 3.1. Nhiệm vụ tuần (reset 9:00 thứ 2 hàng tuần, 3 nhiệm vụ/tuần)

| Tuần | Nhiệm vụ | Điều kiện | Thưởng |
|---|---|---|---|
| 1 | Chào mừng đến văn phòng | Hạ 50 quái season bất kỳ | 20 mảnh |
| 1 | Đúng giờ | Hạ 10 Deadline Dí trước khi chuông reo | 25 mảnh |
| 1 | Chạy daily 3 ngày | Hoàn thành Daily 3 ngày trong tuần | 30 mảnh |
| 2 | Đừng để ai OT | Hạ 80 Nhân Viên OT khi chưa quá 2 stack Cáu | 30 mảnh |
| 2 | Băng giá văn phòng | Reset 15 stack Cáu bằng đạn băng | 25 mảnh |
| 2 | Sếp gọi | Thắng Ngài Deadline 1 lần | 40 mảnh |
| 3 | Trốn họp thành công | Thắng 5 wave có Kẻ Họp Hành mà không vào vùng họp lần nào | 30 mảnh |
| 3 | Dọn cuộc họp | Dùng đạn nổ giết ≥ 8 quái trong 1 vụ nổ ở wave có Kẻ Họp Hành | 25 mảnh |
| 3 | Cày cuốc | Kiếm 200 mảnh kính trong tuần | 20 mảnh |
| 4 | Deadline là bạn | Thắng wave 8+ ải 2 có ≥ 3 Deadline Dí mà không để reo lần nào | 35 mảnh |
| 4 | Nhân viên gương mẫu | Hoàn thành Daily 5 ngày liên tiếp | 40 mảnh |
| 4 | Đấu sếp khó | Thắng Ngài Deadline ở Khắc nghiệt | 60 mảnh |
| 5 | Văn phòng bất khả xâm phạm | Thắng 1 run season không mất px cửa sổ nào | 40 mảnh |
| 5 | Tốc độ ánh sáng OT | Đạt cấp 12 trong 1 run có quái season | 30 mảnh |
| 5 | Cứu cả team | Phá 5 vùng họp bằng cách hạ Kẻ Họp Hành | 25 mảnh |
| 6 | Nước rút | Hoàn thành tất cả nhiệm vụ tuần 6 (3/3) | 50 mảnh |
| 6 | Người hùng deadline | Hạ Ngài Deadline 3 lần trong tuần 6 | 60 mảnh |
| 6 | Tạm biệt văn phòng | Chơi 10 run trong tuần cuối | 30 mảnh |

### 3.2. Nhiệm vụ meta cả season (không reset)

| Nhiệm vụ | Điều kiện | Thưởng |
|---|---|---|
| Thực tập sinh | Hạ 500 quái season (cộng dồn) | 50 mảnh |
| Nhân viên chính thức | Hạ 2.000 quái season (cộng dồn) | 100 mảnh |
| Quản lý cấp trung | Thắng Ngài Deadline 10 lần (cộng dồn) | skin **"Áo OT Huyền Thoại"** + 80 mảnh |
| Huyền thoại văn phòng | Hoàn thành 15/18 nhiệm vụ tuần | danh hiệu **"NGƯỜI DÍ DEADLINE"** + 150 mảnh |

### 3.3. Modifier Daily mới cho season (thêm vào pool 8 modifier v2.0)

| Modifier | Tên | Hiệu ứng |
|---|---|---|
| M9 | Tuần lễ OT | Nhân Viên OT xuất hiện từ wave 1, stack Cáu nhanh gấp đôi |
| M10 | Họp toàn công ty | Mỗi wave có 1 Kẻ Họp Hành; vùng họp rộng +20% |

---

## 4. Mục tiêu cân bằng

### 4.1. Độ khó
- Quái season ở **tier giữa**: mạnh hơn dasher, yếu hơn tank. Deadline Dí không gây dmg trực tiếp (áp lực gián tiếp); OT Worker là DPS-check mềm; Kẻ Họp Hành là bài toán vị trí.
- Boss Ngài Deadline ≈ **80% độ khó NULL POINTER** (boss cuối v2.0): ít đe dọa cửa sổ trực tiếp hơn, nhiều chaos quản lý hơn. Target: người chơi Thường thắng sau 2–4 lần thử.
- Season không tăng power creep vĩnh viễn: quái season chỉ là content, không có nâng cấp độc quyền mạnh hơn đồ v2.0 (tránh "pay-to-win cảm giác").

### 4.2. Thời gian chơi trung bình
- Daily Challenge season: **8–12 phút** (giữ nguyên khung v2.0).
- Run "Đấu Sếp": **6–9 phút** (3 phase ~2–3 phút/phase).
- Nhiệm vụ tuần: thiết kế để hoàn thành trong **3–5 buổi chơi/tuần, 15–20 phút/buổi**.

### 4.3. Retention hook
1. **Reset thứ 2 hàng tuần** — lý do quay lại đầu tuần.
2. **Điểm season + BXH Mùa** (top 100, reset cuối season) — cạnh tranh nhẹ, công bằng (cùng seed daily).
3. **Skin "Áo OT Huyền Thoại" chỉ kiếm được trong season** — FOMO lành mạnh, không bán bằng tiền.
4. **Streak daily** (kế thừa v2.0) + nhiệm vụ streak tuần 4 — giữ chân 7/30 ngày.
5. **Teaser cuối season:** tuần 6 hé lộ chủ đề Season 2 (1 banner bí ẩn) — giữ người chơi ở lại.

### 4.4. Chỉ số thành công (đo sau 6 tuần)
- ≥ 40% người chơi daily thử ít nhất 1 nhiệm vụ tuần · ≥ 25% hoàn thành ≥ 9/18 nhiệm vụ tuần · retention D7 của người chơi season ≥ 35% · ≥ 60% người thắng Ngài Deadline quay lại đánh tiếp (farm skin).

---

## 5. Ghi chú implement cho team Engineering

### 5.1. Tái dùng được (không viết lại)
- **M8 Quả Bom Cười** (popup đếm ngược 15s) → pattern đếm ngược + "reo" của **Deadline Dí** (chuyển từ popup sang entity bay).
- **M9 Máy Hút Bụi Vũ Trụ** (hút quái xoáy) → lực "triệu tập" của **Kẻ Họp Hành** (chỉ hút quái, bỏ hút tàu).
- **Đóng Băng Hệ Thống** (slow + aura) → **vùng họp** slow 35% + đạn băng reset stack Cáu.
- **NULL POINTER phase 3** (đếm ngược `resizeTo(0,0)`) → **Ngài Deadline phase 3** (đếm ngược 30s + scope creep leo thang).
- **M5 Mẹ Gà Đẻ Trứng** (spawn định kỳ) → nhịp gọi quái của boss phase 1/2.

### 5.2. Mechanic/Hook mới cần thêm
1. `entity.rage` (stack 0–5, +dmg/+speed theo stack) + `resetRageOnFreeze` — cho Nhân Viên OT.
2. `G.globalHaste` (multiplier tốc quái toàn sân, có timer) — cho tiếng chuông Deadline Dí.
3. `G.slowZones[]` (vùng tròn: x, y, r, slow%, ttl) — cho Kẻ Họp Hành + boss phase 2. Va chạm tàu mỗi frame, vẽ vòng đứt nét + chữ "HỌP".
4. `G.seasonMissions` (tiến độ nhiệm vụ tuần/meta, lưu theo profile + tuần) + reset logic thứ 2 9:00.
5. Boss framework: thêm `bossId: "mr_deadline"` với 3 phase + `scopeCreep` timer (mỗi 6s roll debuff) — mở rộng từ boss 5 v2.0.
6. `difficulty.config.json`: thêm 3 quái vào spawn tables (ải 2+ wave 4/6/8, endless wave 6+, tỉ lệ).
7. Daily modifier pool: thêm M9, M10 (rng chọn 2/10 modifier).

### 5.3. File likely cần sửa
- `js/game.js` — `MONSTER_REGISTRY` (+3 quái), `BEHAVIORS` (+rage, countdown-bell, slow-aura, summon-pulse), boss `mr_deadline`, `G.slowZones`, `G.globalHaste`.
- `js/cinema.js` — banner debut 3 quái + banner boss "SẾP LỚN: NGÀI DEADLINE" + banner scope creep.
- `js/menu.js` — nút "Đấu Sếp", tab Nhiệm Vụ season, theme văn phòng OT (CSS).
- `css/style.css` — theme season (đèn huỳnh quang, sticky note), HUD đồng hồ đếm ngược.
- `js/audio.js` — `sfx.clockTick()`, `sfx.bellRing()`, `sfx.angryStack()`, nhạc nền "văn phòng OT" vui nhộn (giữ nguyên tắc: nhanh, vui, không creepy).
- `docs/bestiary.md` — append spec chi tiết 3 quái + boss (state machine, số liệu, cách vẽ).
- `difficulty.config.json` — spawn tables + modifier pool M9/M10.
- (Backend, nếu kịp) `server/` — bảng `season_scores(season_id, profile, score)` + `season_missions(profile, week, mission_id, progress)` cho BXH Mùa.

### 5.4. Thứ tự implement gợi ý (theo độ rủi ro tăng dần)
1. 3 quái mới với behavior cơ bản (tuần 1–2)
2. Slow zones + global haste + rage (tuần 2)
3. Boss Ngài Deadline 3 phase (tuần 3)
4. Hệ thống nhiệm vụ + reset tuần + BXH mùa (tuần 4)
5. Theme OT + audio + polish (tuần 5)
6. QA cân bằng theo §4.4 (tuần 6, trước khi season live)

---
*Design lock 2026-10-01. Mọi số liệu là gợi ý cân bằng ban đầu — Engineering được phép chỉnh ±20% khi playtest, báo lại Game Design nếu vượt ngưỡng.*
