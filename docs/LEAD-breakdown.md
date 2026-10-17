# LEAD Breakdown — Stage Themes + Monster Visual Redesign + New Modes

- **Nhánh:** `feat/stage-themes-modes` (repo `~/workspace/windowkill-web-themes`)
- **Trạng thái:** SPEC-CHƯA-CÓ — dev KHÔNG được viết code cho đến khi từng RFC được chốt.
- **Triết lý CEO (bắt buộc):** variety > difficulty; mọi content mới phải tạo khoảnh khắc **CƯỜI/WOW**, không khó/nhanh/điên thêm; cartoon vui nhộn, tuyệt đối không rùng rợn.
- **Ranh giới sửa:** chỉ `js/game/*.js` + `js/monsters.js` + `js/menu.js` + `index.html` (+ `css/` nếu cần cho UI mode) + `tests/` + `docs/`. **CẤM:** sửa tay `js/game.js` (generated — rebuild bằng `node scripts/build-game.js`), `js/game/00-head.js`, `js/sfx2.js`, thêm key vào `js/i18n.js` (key mới → `I18N.register()` literal theo pattern `stagemech.js`/`stageobj.js` để test `i18n-coverage` quét được).

## 0. Kiến trúc hiện có (điểm bám — minimal blast radius)

| Hệ | File | Đã có gì (tận dụng) |
|---|---|---|
| Stage framework | `js/campaign.js` | 5 ải có tên: 1 MÀN HÌNH XANH, 2 TƯỜNG LỬA, 3 TRỌNG LỰC 404, 4 CÚP ĐIỆN, 5 TRÀN BỘ NHỚ; unlock tuần tự; `Campaign.STAGES`, `getWaveComp`, endless loop qua `loopStages` |
| Stage background | `js/bg.js` | `PALETTES` keyed 1–5 (base0/base1, nebulas, grid, parts, vignette) — **theme màu đã có sẵn**, theme mới là mở rộng layer trên |
| Stage mechanics | `js/stagefx.js`, `js/stagemech.js`, `js/stageobj.js` | ải 2 gai viền, ải 3 trượt, ải 4 mất điện, ải 5 vùng thu hẹp; objectives + badge per profile |
| Quái | `js/monsters.js` + mirror `js/game/10-gamedata.js` | **Dual-registration**: mọi thay đổi visual/stat phải đồng bộ 2 file (19 loại quái + snatcher). `BEHAVIORS[behavior].draw(m, ctx)` là điểm vẽ |
| Render | `js/game/17-render.js`, `js/game/16-update.js` | `BG.build(stageId,w,h)` khi đổi ải; mỗi frame chỉ `BG.draw` (perf-critical) |
| Boot/mode | `js/v2glue.js`, `js/menu.js`, `index.html` | `V2.stageId` (0 = endless), `?stage=1..5`; menu có hub + stage cards + nút launch |
| Build/test | `scripts/build-game.js`, `sw.js`, `tests/` | CI `build --check`; SW `AUTO-STAMP` (`scripts/bump-sw.js`); `node --test tests/` (58 file, gồm `i18n-coverage`, `campaign-logic`) |

---

## 1. Stage Themes — đề xuất cụ thể

Palette nền **đã có** trong `js/bg.js`. Theme mới = thêm 3 lớp: (a) **decoration** theo ải (prop vẽ procedural, không đụng gameplay), (b) **motif viền** đồng bộ mechanic ải, (c) **tint nhẹ** quái/bullet theo theme (chỉ đổi hue, không đổi hitbox/behavior). Mỗi ải nhận diện trong 3 giây đầu vào ải.

| Ải | Tên theme | Palette (có sẵn) | Decoration gợi ý | Motif viền |
|---|---|---|---|---|
| 1 | **Màn Hình Xanh Chết Chóc** (BSOD) | Dever blue `#0066CC/#004C99` | pixel-glitch scanline trôi, icon "cửa sổ lỗi" lơ lửng, watermark `:-( ` mờ | viền xanh cobalt + góc bo như cửa sổ Windows |
| 2 | **Lò Lửa Firewall** | cam đất `#CC3300`, than hồng bay lên | ống khói pixel phun tia lửa decor, tường gạch nung ở góc | viền gai đã có (mechanic) + ánh lửa nhấp nháy theo spike on/off |
| 3 | **Hố Đen Trọng Lực 404** | tím vũ trụ `#3A0CA3/#7209B7` | lỗ đen xoáy decor hút particle, mảnh "404" vỡ trôi | viền tím gradient xoáy nhẹ |
| 4 | **Thành Phố Cúp Điện** | đen + neon cyan `#00E5FF` flicker | bóng đèn vỡ / đèn huỳnh quang chập chờn decor, tia sét tĩnh điện | viền neon cyan chớp tắt theo blackout cycle |
| 5 | **Vùng Tràn Bộ Nhớ** | xanh lá độc → đỏ `#2D6A00/#4A0000` | "memory block" xếp chồng rò rỉ, hex rain đã có | viền xanh lá độc chuyển đỏ dần theo danger level |
| Endless | **Vòng Lặp Vô Tận** | xoay palette theo `loopStages` (đã có) + milestone banners | giữ nguyên, không thêm | giữ nguyên |

**Quyết định lead:** không tạo file theme mới nếu không cần — mở rộng `js/bg.js` (thêm `decor` + `border` vào PALETTES) + 1 module glue mỏng trong `js/game/` nếu spec thấy cần. Endless giữ nguyên (ít effort, đã có loop palette).

## 2. Monster Visual Redesign — phạm vi

19 quái là quá nhiều; redesign **đợt 1 = 9 quái xuất hiện nhiều nhất**, đợt 2 tùy effort còn lại. Phần còn lại giữ nguyên visual cũ.

**Đợt 1 (bắt buộc):** `chaser`, `chewer`, `tank`, `dasher`, `splitter`, `mini`, `bomber`, `glimmer`, `snatcher`.
Gợi ý visual mới (cartoon, nhận diện nhanh, gắn theme ải):
- `chaser` — mũi tên tên lửa đồ chơi (đuôi lửa) thay tam giác trơn
- `chewer` — sâu gặm pixel có hàm răng cưa, khi bám viền hiện "vết cắn"
- `tank` — xe tăng đồ chơi nắp hộp, lõi giữa phát sáng (weakness đọc được bằng mắt)
- `dasher` — phi tiêu ninja có dải aim màu, aim chuyển ĐỎ đã có → giữ
- `splitter` — bong bóng xà phòng căng phồng, nứt vỡ khi máu <50%
- `mini` — ong bắp cày mini cánh rung
- `bomber` — bom bi cartoon có fuse cháy xì khói (đọc được fuse 0.7s)
- `glimmer` — đom đóm đèn lồng bay lượn (bonus → phải "thèm" đuổi theo)
- `snatcher` — giữ concept trộm túi vải + mặt nạ (mới từ PR #77), nâng chi tiết: túi phồng theo số gem cướp được

**Đợt 2 (nếu còn sức):** `spitter`, `freezer`, `warden`, `booster`, `phantom`. **Không đụng:** `deadline`, `otworker`, `meeting`, `shipper`, `director`, `broodmother/egg`, boss variants.

**Đồng bộ theme:** tint hue quái ±15° theo palette ải (chỉ màu, không đổi shape/hitbox) — bật/tắt được qua 1 flag, default BẬT ở ải 1–5, TẮT ở endless để tránh rối.

## 3. New Modes — đề xuất & chọn

| # | Mode | Luật chơi (khác biệt rõ) | Vui ở đâu | Effort |
|---|---|---|---|---|
| A | **TIME ATTACK — "Chạy Deadline"** ✅ CHỌN | 1 run = 180s đếm ngược; score tối đa; hết giờ → kết thúc ngay, không chết được vì hết máu (máu vẫn mất nhưng 0 HP = hết run); wave spawn dồn dập hơn | đua score với chính mình/bạn, mỗi run ngắn gọn, hợp booth demo | M |
| B | **BOSS RUSH — "Xếp Hình Sếp"** ✅ CHỌN | chuỗi 5 boss liên tiếp (boss_1→boss_5); hạ boss → sửa cửa sổ 30% + 5s nghỉ mua đồ; không có wave quái thường (chỉ add nhỏ) | fan-service: gặp lại 5 boss, mỗi boss là 1 "câu đố" đã biết | L |
| C | **GEM FEVER** ❌ LOẠI | endless + modifier ngẫu nhiên mỗi 30s | trùng lặp với Director (quái `director` đã roll modifier) — variety thấp | — |

**Chọn A + B.** Triết lý CEO: cả 2 mode đều tạo khoảnh khắc WOW (đua điểm / gặp boss) mà không tăng độ khó cơ bản. **Bị loại:** survival thuần (trùng endless), PvP (không có netcode).

**Kiến trúc mode:** `?mode=timeattack|bossrush` (mặc định campaign/endless cũ) → `v2glue.js` parse + guard → `V2.mode` → `11-spawn.js`/`16-update.js` nhánh theo mode → UI `15-ui.js`. Menu: thêm 2 nút chọn mode trong hub (`index.html` + `js/menu.js` + i18n literal). Không refactor menu.

---

## 4. Atomic Tasks

### SPEC (viết RFC trước — dev/qa chờ)

| ID | Mô tả | File chạm | Dep | Size |
|---|---|---|---|---|
| SPEC-01 | RFC stage themes: theme data schema (`decor`, `border` trong PALETTES), danh sách decoration/ải, API glue, tint-quái flag, 5+ edge cases, acceptance criteria định lượng (nhận diện ải ≤3s, 0 ảnh hưởng hitbox) | `docs/RFC-stage-themes.md` | — | M |
| SPEC-02 | RFC monster redesign: scope 9 quái đợt 1, draw-spec từng quái (shape, màu, animation cue), dual-reg checklist (monsters.js + 10-gamedata.js), acceptance (spawnWeights không đổi, 100% pass test cũ) | `docs/RFC-monster-redesign.md` | — | M |
| SPEC-03 | RFC modes: luật Time Attack + Boss Rush, param `?mode=`, `V2.mode` contract, UI menu spec, scoring/ranking, 5+ edge cases (vd. boss rush + window repair, time attack + pause), acceptance | `docs/RFC-new-modes.md` | — | M |

### DEV (chỉ sau khi SPEC tương ứng được chốt)

| ID | Mô tả | File chạm | Dep | Size |
|---|---|---|---|---|
| DEV-01 | Mở rộng theme ải: thêm `decor` + `border` vào `PALETTES` (bg.js), vẽ decoration/motif viền theo ải, glue gọi `BG.build` khi đổi ải | `js/bg.js`, `js/game/17-render.js` (gọi), `js/game/16-update.js` nếu cần trigger | SPEC-01 | M |
| DEV-02 | Menu stage cards theo theme: gradient/thumbnail + icon riêng mỗi ải trên card | `index.html` (card markup), `js/menu.js`, `css/` | SPEC-01 | S |
| DEV-03 | Redesign draw đợt 1 (6 quái core): chaser, chewer, tank, dasher, splitter, mini — viết lại `BEHAVIORS.*.draw`, đồng bộ 2 registry | `js/monsters.js`, `js/game/10-gamedata.js` | SPEC-02 | L |
| DEV-04 | Redesign draw đợt 2 (3 quái): bomber, glimmer, snatcher (+ túi phồng theo gem cướp) + tint-hue theo ải (flag bật/tắt) | `js/monsters.js`, `js/game/10-gamedata.js` | SPEC-02, DEV-03 | M |
| DEV-05 | Mode Time Attack: parse `?mode=`, timer 180s + UI countdown, spawn dồn dập, kết thúc tính score, lưu kỷ lục per profile | `js/v2glue.js`, `js/game/11-spawn.js`, `js/game/16-update.js`, `js/game/15-ui.js` | SPEC-03 | M |
| DEV-06 | Mode Boss Rush: chuỗi boss_1→boss_5, sửa cửa sổ 30% + nghỉ 5s giữa boss, add nhỏ, UI tiến trình boss | `js/v2glue.js`, `js/game/11-spawn.js`, `js/game/16-update.js`, `js/game/15-ui.js` | SPEC-03, DEV-05 | L |
| DEV-07 | UI chọn mode trong menu hub: 2 nút + mô tả ngắn, i18n literal VI/EN, guard khi chưa mở khóa | `index.html`, `js/menu.js` | SPEC-03 | S |
| DEV-08 | Rebuild bundle + bump SW + verify (`build --check`, `bump-sw.js --check`) — chạy cuối mỗi DEV task trước khi giao QA | `js/game.js` (generated), `sw.js` | DEV-01..07 | S |

### QA (song song với DEV ngay sau khi SPEC chốt — test-first từ spec)

| ID | Mô tả | File chạm | Dep | Size |
|---|---|---|---|---|
| QA-01 | Suite stage themes: PALETTES đủ 1–5 + endless fallback, `BG.build` không throw với mọi stageId, decor không tạo entity gameplay, perf smoke (BG.draw <2ms/frame mock) | `tests/stage-themes.test.js` | SPEC-01 | M |
| QA-02 | Suite monster redesign: dual-registry sync (19 ids + field draw/color khớp 2 file), `spawnWeights` snapshot không đổi, draw smoke test mọi behavior với canvas mock | `tests/monster-redesign.test.js` | SPEC-02 | M |
| QA-03 | Suite modes: parse `?mode=` (valid/invalid fallback), time attack kết thúc đúng 180s, boss rush đủ 5 boss đúng thứ tự + repair 30%, pause không dừng timer sai | `tests/new-modes.test.js` | SPEC-03 | M |
| QA-04 | Regression gate: full `node --test tests/`, `build-game.js --check`, `i18n-coverage`, SW stamp đổi sau mỗi DEV | chạy CI cục bộ | DEV-08 | S |

### EVAL (sau khi DEV+QA của từng mảng xong)

| ID | Mô tả | Dep | Size |
|---|---|---|---|
| EVAL-01 | Chấm diff stage themes /100 (40 correctness, 25 test rigor, 15 efficiency, 10 security, 10 maintainability); gate merge | DEV-01, DEV-02, QA-01, QA-04 | S |
| EVAL-02 | Chấm diff monster redesign /100; kiểm tra dual-reg drift + perf render | DEV-03, DEV-04, QA-02, QA-04 | S |
| EVAL-03 | Chấm diff modes /100; kiểm tra blast radius menu.js + index.html | DEV-05, DEV-06, DEV-07, QA-03, QA-04 | S |

---

## 5. Thứ tự & song song

```
SPEC-01 ─┐
SPEC-02 ─┼─► (chốt từng RFC) ─► DEV + QA song song theo mảng ─► EVAL ─► PR
SPEC-03 ─┘

Mảng độc lập → chạy song song được:
  Track Themes:  SPEC-01 → DEV-01 + DEV-02 ‖ QA-01 → EVAL-01
  Track Quái:    SPEC-02 → DEV-03 → DEV-04 ‖ QA-02 → EVAL-02
  Track Modes:   SPEC-03 → DEV-05 → DEV-06, DEV-07 ‖ QA-03 → EVAL-03
                                       ▲ DEV-07 song song với DEV-05/06
  Cuối mỗi DEV: DEV-08 (rebuild + bump SW) rồi mới giao QA-04/EVAL
```

Tổng: **3 SPEC + 8 DEV + 4 QA + 3 EVAL = 18 task**. Ước lượng: SPEC 1 lượt, DEV ~5–7 lượt (DEV-03, DEV-06 là L), QA ~3 lượt, EVAL 1 lượt.

## 6. Rủi ro kiến trúc & cách tránh

| # | Rủi ro | Cách tránh |
|---|---|---|
| R1 | **Render pipeline perf** — decoration mới trong `BG.draw`/17-render chạy mỗi frame; particle quá tay → drop FPS trên máy yếu | Spec giới hạn: decor là static/procedural rẻ (≤40 particle/ải như hiện tại); QA-01 có perf smoke; `BG.setQuality` đã có |
| R2 | **Satellite sim-fallback** — mode mới không được đụng `04-satellite.js`/`05-chainpopups.js` (MAX_SATS=3, PRI queue) | SPEC-03 cấm mode chạm satellite; boss rush dùng boss entity thường, không spawn sat mới |
| R3 | **SW cache stale** — user phải F5 1–2 lần mới thấy build mới (stale-while-revalidate; bài học gray-veil 2026-10-03) | DEV-08 bắt buộc `bump-sw.js` sau mỗi DEV; QA-04 verify stamp đổi |
| R4 | **Dual-registration drift** — sửa `js/monsters.js` quên mirror `10-gamedata.js` → quái hiển thị sai trong game thật | QA-02 assert sync 2 file; checklist trong SPEC-02; dev sửa 2 file trong cùng 1 task (DEV-03/04) |
| R5 | **i18n-coverage fail** — key mới không literal → test quét không thấy → CI đỏ | Key mới CHỈ qua `I18N.register()` literal (pattern stagemech.js); cấm thêm vào `js/i18n.js` |
| R6 | **Quên rebuild bundle** — sửa `js/game/*.js` mà không chạy build → `game.js` lệch → CI `--check` đỏ | DEV-08 là task bắt buộc cuối mỗi DEV; QA-04 chạy `--check` |
| R7 | **Blast radius menu.js** — mode picker làm vỡ hub/menu hiện tại | DEV-07 minimal: chỉ thêm 2 nút + handler, không refactor; EVAL-03 kiểm tra diff menu.js |
| R8 | **Tint quái theo ải gây rối visual** — đổi màu quái làm mất nhận diện đã quen | Tint chỉ ±15° hue, flag tắt được, default TẮT ở endless; SPEC-01 định nghĩa rõ |

## 7. Ghi chú cho chief

- Không yêu cầu CEO quyết thêm gì trước khi chạy SPEC — 3 RFC đã đủ chi tiết để spec agent làm việc (tên theme, scope quái, mode A/B đều đã chốt ở trên).
- Điểm duy nhất có thể cần CEO xác nhận sau SPEC: visual mock từng quái (nếu spec agent đề xuất khác gợi ý §2) và copy tiếng Việt/Anh cho nút mode.
- Merge: KHÔNG tự merge — PR chờ approval card của Nhật theo luật L2 hiện hành.
