# RFC — Stage Themes + Monster Visual Redesign + New Modes

- **Trạng thái:** SPEC (chờ chief/CEO chốt) — agent-spec viết, **TUYỆT ĐỐI chưa viết code**.
- **Nhánh:** `feat/stage-themes-modes`, repo `~/workspace/windowkill-web-themes` (base: PR #76 + #77).
- **Hợp nhất 3 SPEC của lead:** SPEC-01 (themes) + SPEC-02 (monster redesign) + SPEC-03 (modes) → **1 file RFC duy nhất**.
  Đây là **hợp đồng duy nhất** agent-dev được phép implement theo. Mọi chi tiết không có trong RFC
  → dev KHÔNG tự bịa, phải hỏi lại qua chief.
- **Triết lý CEO (bắt buộc, ưu tiên cao nhất):** variety > difficulty; mọi content mới phải tạo khoảnh
  khắc **CƯỜI / WOW**, không khó/nhanh/điên thêm; cartoon vui nhộn, **tuyệt đối không rùng rợn/u ám**;
  nhạc/SFX vui nhộn nhịp nhanh (không đụng `js/sfx2.js` — chỉ tái dùng SFX có sẵn).
- **Quy tắc §6 "điểm gốc cố định" (bất di bất dịch):** mỗi kill = đúng điểm gốc trong registry,
  **KHÔNG nhân điểm** ở bất kỳ mode nào. Mode mới chỉ thay đổi *cách chơi*, không thay đổi *cách tính điểm*.

## 0. Ranh giới file (minimal blast radius)

**ĐƯỢC sửa:** `js/bg.js`, `js/game/17-render.js`, `js/game/16-update.js`, `js/game/15-ui.js`,
`js/game/11-spawn.js`, `js/game/10-gamedata.js`, `js/monsters.js` (registry + legacy draw),
`js/v2glue.js`, `js/menu.js`, `index.html`, `css/` (nếu cần cho nút mode),
`js/game/MANIFEST.txt`, `tests/`, `docs/`, **MỚI:** `js/game/22-modes.js`.

**CẤM:** sửa tay `js/game.js` (generated — rebuild bằng `node scripts/build-game.js`),
`js/game/00-head.js`, `js/sfx2.js`, `js/game/04-satellite.js`, `js/game/05-chainpopups.js`
(mode mới không được đụng hệ vệ tinh — R2 của lead), thêm key vào `js/i18n.js`
(key mới **CHỈ** qua `I18N.register()` literal trong module — pattern `stagemech.js`/`stageobj.js`/
`10-gamedata.js` — để test `i18n-coverage` quét được).

---

## 1. Architectural Overview

### 1.1. Track Themes — theme engine mở rộng `PALETTES` trong `js/bg.js`

Luồng dữ liệu hiện tại (đã kiểm chứng trong code):

```
game.html load: js/bg.js (BG) → js/game.js (bundle, chứa 10-gamedata.js)
  10-gamedata.js: bgStageSid()            → sid = V2.stageId (1..5) ở campaign,
                                             ACTS[act].bgStage ở endless, fallback 1
  10-gamedata.js: refreshBG()             → BG.build(sid, innerWidth, innerHeight)
  00-head.js:     window resize           → refreshBG()
  12-variety.js:  startWave — act đổi     → refreshBG()
  17-render.js:   render() mỗi frame      → BG.draw(ctx, now)   [PERF-CRITICAL]
  17-render.js:   render()                → BorderFX.draw(...)  [viền cửa sổ]
  17-render.js:   render()                → StageFX.draw(...)   [mechanic ải, via V2.drawOver]
```

Theme mới = **mở rộng, không thay thế**: thêm field `theme` vào mỗi entry `PALETTES[1..5]`
(schema §3.1), gồm 3 lớp:

```
PALETTES[sid].theme = {
  decor:  {...},   // (a) decoration theo ải — 80% STATIC, prerender vào offscreen
                   //     `base` trong paintBase() → 0 chi phí/frame;
                   //     ≤12 prop ANIMATED vẽ trong BG.draw (layer L1.5, sau nebula)
  border: {...},   // (b) motif viền — overlay mới sau BorderFX.draw trong 17-render,
                   //     đồng bộ state mechanic ải (spikes/blackout/danger), KHÔNG đè mechanic
  tintHue: ±15,    // (c) tint quái theo ải — chỉ đổi hue, không đổi shape/hitbox/behavior
}
```

Luồng sau mở rộng:

```
BG.build(sid) → paintBase() ──► + paintDecorStatic(ctx, pal)   [vào offscreen base]
BG.draw(ctx,t) → ... nebula … ──► + drawDecorAnim(ctx, pal, t) [≤12 prop, rẻ]
17-render render() → BorderFX.draw(...) ──► + drawThemeBorder(ctx, W, H, now) [motif viền]
17-render drawOneEnemy(e) ──► mc = themeTint(e) thay e.color ở 9 nhánh redesign
```

- **Perf budget (ràng buộc cứng):** decor static = 0 draw-call/frame thêm (đã bake vào `base`);
  decor animated ≤ 12 prop/ải, mỗi prop ≤ 6 canvas ops, tôn trọng `reduced()` (đứng yên khi
  reduced-motion / quality=reduced); `BG.setQuality` hiện có vẫn áp dụng.
- **Nhận diện ải ≤ 3s:** khi vào ải, banner tên ải (đã có — `stageRitualEnter`) + motif viền +
  decor phải đủ để người chơi gọi tên theme trong 3 giây đầu. Không thêm popup/banner mới.

### 1.2. Track Quái — monster draw pipeline (làm rõ điểm vẽ THẬT)

Kết quả kiểm chứng code — có **3 nơi** liên quan đến "vẽ quái", dev phải hiểu đúng:

```
(a) js/game/17-render.js :: drawOneEnemy(e)   ← ĐIỂM VẼ THẬT TRONG GAME
    - Hàm type-branched khổng lồ: if/else theo e.type
      (chaser|mini, chewer, tank, dasher, splitter, weaver, spitter, healer,
       kamikaze, deadline, otworker, meeting, snatcher, + fallback hình tròn)
    - Được gọi mỗi frame cho G.enemies + G.dying. Đây là nơi DUY NHẤT người chơi nhìn thấy.
    - Redesign 9 quái = VIẾT LẠI 9 NHÁNH này (+ THÊM nhánh "glimmer" mới).

(b) js/monsters.js :: BEHAVIORS[behavior].draw(m, ctx)   ← LEGACY renderer
    - File này ĐƯỢC load trong game.html (trước js/game.js) nhưng draw của nó
      KHÔNG được engine gọi (engine dùng 17-render). Dùng cho: test/bestiary/v1-path.
    - Dev vẫn phải đồng bộ visual ở đây ở mức "nhận diện được là cùng 1 con"
      (không cần pixel-perfect), để không drift 2 renderer.

(c) DUAL-REGISTRY (stat/visual descriptor):
    js/monsters.js :: MONSTER_REGISTRY[type]  ← legacy schema
      { id, nameVi, role, color, shape, r, dmg, xp, gems, behavior,
        debutWave, maxPerWave, hpAt, speedAt, weaknessVi, counterVi, debutHintVi }
    js/game/10-gamedata.js :: MONSTER_REGISTRY[type]  ← schema game THẬT
      { id, name, behavior, color, r, dmg, score, xp, minWave, weight, maxPerWave,
        acts, hp(w), spd(w), init(e), onDeath(e), desc }
    - Mọi field stat (r, dmg, hp, spd, behavior, weight, minWave, maxPerWave) phải KHỚP
      2 file. QA-02 assert parity (xem §5.2).
    - Redesign visual KHÔNG được đổi: r (hitbox), dmg, hp(w), spd(w), behavior,
      weight, minWave, maxPerWave. Chỉ đổi: color (trong biên tint), shape/draw,
      và thêm field mô tả `art` (xem §3.2).
```

**Mapping id đặc biệt (dev PHẢI biết, dễ nhầm):**
| Tên trong task/spec | id trong `10-gamedata.js` (game thật) | nhánh vẽ trong `17-render.js` |
|---|---|---|
| bomber ("Liều Chết Cảm Tử") | `kamikaze` (v2glue `ADD_MAP`: campaign `bomber`→`dasher` — quirk có sẵn, KHÔNG sửa) | nhánh `kamikaze` |
| glimmer ("Đom Đóm Vàng") | **CHƯA CÓ** → dev THÊM entry `glimmer` (weight 0, behavior `flee` MỚI) | **THÊM** nhánh `glimmer` mới |
| 7 con còn lại | id trùng tên (chaser, chewer, tank, dasher, splitter, mini, snatcher) | nhánh cùng tên đã có |

### 1.3. Track Modes — `?mode=` trong `v2glue.js` + nút menu

```
index.html (menu.js)
  └─ panel "Chế độ chơi" MỚI (sau panel stage #v2-stages):
       [⏱ Chạy Deadline]  → v2sel={kind:"mode",mode:"timeattack"}  (luôn mở)
       [👔 Xếp Hình Sếp]   → v2sel={kind:"mode",mode:"bossrush"}    (guard: unlock ≥ ải 2)
     launchGame() ──► game.html?mode=timeattack|bossrush (+ diff, profile, … như cũ)

game.html
  v2glue.js V2.boot():
    q.get("mode") ──► whitelist {timeattack, bossrush} ──► V2.mode
    - mode HỢP LỆ  → V2.stageId=0, V2.endless=false, V2.daily=false (mode ĐỘC QUYỀN,
                     đè ?stage=/?endless=1/?daily=1)
    - mode KHÔNG HỢP LỆ/không có → V2.mode=null, mọi thứ như cũ (fallback an toàn)
    - V2.boot() ──► Modes.init(V2.mode)   [module mới js/game/22-modes.js]

js/game/22-modes.js (MỚI, thêm vào MANIFEST.txt sau 17-render.js):
  window.Modes = {
    init(mode),                 // khởi tạo state theo mode, đăng ký i18n
    tickTimer(dt),              // time attack: trừ giờ (chỉ khi G.phase==="play")
    timeUp(),                   // hết 180s → kết thúc run, hiện kết quả
    spawnScale(),               // trả về {intervalMul, breakMul} cho 11-spawn/16-update
    startBossRush(),            // dựng chuỗi boss_1..boss_5 qua Bosses API
    onBossDown(b),              // hạ boss → nghỉ 5s + sửa 30% + boss kế
    victory(stats),             // thắng boss rush → màn hình thắng
    drawHUD(ctx, W),            // countdown / tiến trình boss (gọi từ 17-render HUD)
  }

Điểm chạm engine (KHÔNG refactor, chỉ thêm nhánh):
  16-update.js :: update()        → if (V2.mode==="timeattack") Modes.tickTimer(dt)
  16-update.js :: killEnemy()     → điểm GIỮ NGUYÊN (§6) — KHÔNG nhân điểm mode
  11-spawn.js  :: wkSpawnInterval→ × Modes.spawnScale().intervalMul (time attack 0.75)
  16-update.js :: wave-break      → waveBreak 2.6 → 1.2 khi time attack
  15-ui.js     :: die()           → giữ nguyên (thua = chết như cũ, mọi mode)
  15-ui.js     :: + showEndScreen({title, lines, record}) — overlay kết quả dùng chung
                                    cho time-up (hết giờ) và victory (thắng boss rush),
                                    tái dùng DOM #ov-over
  17-render.js :: HUD             → Modes.drawHUD(ctx, W)
```

- **Cấm mode chạm:** `04-satellite.js`, `05-chainpopups.js` (R2) — boss rush dùng boss entity
  thường qua `Bosses.startBoss`, không spawn sat mới; time attack không trigger variety sat khác
  bình thường (giữ nguyên `12-variety.js` như endless).
- **StageFX:** mode mới KHÔNG enter StageFX (mechanic ải chỉ thuộc về campaign ải 1–5).

---

## 2. Spec chi tiết

### 2.1. Theme theo ải (stage 1→5 + endless)

Palette màu **giữ nguyên 100%** `PALETTES` hiện có trong `js/bg.js`. Theme = 3 lớp mở rộng
(`decor` + `border` + `tintHue`) theo schema §3.1. Tên ải lấy từ `Campaign.STAGES`
(đã có VI/EN) — không thêm key i18n cho tên theme.

| Ải | Tên ải (có sẵn) | Tên theme (mô tả trong RFC) | Decor (static + animated) | Motif viền (border) | tintHue |
|---|---|---|---|---|---|
| 1 | MÀN HÌNH XANH / BLUE SCREEN | **"Màn Hình Xanh Chết Chóc"** (BSOD vui vẻ) | **Static:** 6 khung "cửa sổ lỗi" vẽ outline (rounded rect + thanh tiêu đề), alpha 0.10, rải ngẫu nhiên; 1 dải scanline ngang mờ; glyph `:-(` cỡ 64px alpha 0.05 góc trên-phải. **Animated:** 3 scanline mỏng trôi chậm dọc (≤3 prop). | Viền cobalt `#2E6DB4` 3px, bo góc 14px như cửa sổ Windows + 4 chấm "nút tiêu đề" ở góc trên-trái. Không sync mechanic. | +8° (nghiêng về cyan vui mắt) |
| 2 | TƯỜNG LỬA / FIREWALL | **"Lò Lửa Firewall"** | **Static:** dải tường gạch nung (gạch pixel 24px) dọc mép dưới; 3 ống khói pixel ở 2 góc dưới. **Animated:** ≤12 tia lửa từ miệng ống khói bay lên (tái dùng logic `parts` mode "rise" có sẵn, màu `#FF9A4D`). | Giữ nguyên gai mechanic (StageMech). **Thêm:** hào quang lửa 6px phía trong viền, màu `#FF6A00`, alpha pulse 0.25→0.45 **đồng bộ chu kỳ gai on/off** (đọc cùng nguồn state StageMech dùng để vẽ gai — dev tra `js/stagemech.js`, không tự tạo timer). | −10° (nghiêng về cam cháy) |
| 3 | TRỌNG LỰC 404 / GRAVITY 404 | **"Hố Đen Trọng Lực 404"** | **Static:** 5 mảnh chữ "404" vỡ (text fragment xoay ngẫu nhiên, alpha 0.12) trôi lơ lửng; 1 xoáy hố đen decor ở tâm-nền (vòng xoáy static + vành sáng tím). **Animated:** 8 hạt nhỏ quay quanh hố đen (quỹ đạo tròn chậm, ≤8 prop). | Viền gradient tím `#3A0CA3`→`#7209B7` 3px + sheen sáng chạy vòng quanh viền chu kỳ 8s (static khi reduced-motion). | +12° (nghiêng về magenta) |
| 4 | CÚP ĐIỆN / BLACKOUT | **"Thành Phố Cúp Điện"** | **Static:** 4 bóng đèn vỡ / tuýp huỳnh quang vẽ outline treo lơ lửng (alpha 0.12); đường dây điện pixel chéo góc. **Animated:** ≤6 tia lửa tĩnh điện nhấp nháy **chỉ khi đèn đang sáng** (không vẽ khi blackout). | Viền neon cyan `#00E5FF` 3px: sáng (alpha 0.8) khi đèn sáng, mờ (alpha 0.15) khi blackout — đọc cùng state blackout mà `BG.setBlackout` đang dùng (dev tra nguồn `blackoutT` trong `js/bg.js`, không tự tạo state). | 0° (giữ nguyên — neon đã đủ nhận diện) |
| 5 | TRÀN BỘ NHỚ / MEMORY OVERFLOW | **"Vùng Tràn Bộ Nhớ"** | **Static:** đống "memory block" (rounded rect xanh lá, có rãnh chip) xếp chồng ở 4 góc như đang rò rỉ/tràn ra; hex rain đã có giữ nguyên. **Animated:** 4 block "rơi" chậm từ mép trên (≤4 prop, rơi 20px/s, loop). | Viền 4px chuyển màu theo `danger`: `#4ADE80` (danger 0) → `#FF3B30` (danger 1), lerp tuyến tính theo giá trị `danger` nội bộ của `BG` (dev tra `danger`/`setDanger` trong `js/bg.js`). | −12° (nghiêng về xanh độc khi danger thấp — cộng hưởng với viền đỏ khi danger cao) |
| Endless | Chơi tự do | **"Vòng Lặp Vô Tận"** | Giữ nguyên: loop palette theo `loopStages` + milestone banners (đã có). **Không thêm decor/motif.** Tint TẮT. | Giữ nguyên. | 0° (tắt) |

**Ràng buộc chung theme:**
- T2.1: Decor static vẽ trong `paintBase()` (bake vào offscreen `base`) — 0 draw-call/frame thêm.
- T2.2: Decor animated ≤ 12 prop/ải, mỗi prop ≤ 6 canvas ops, vẽ ở layer L1.5 (sau nebula,
  trước particles), đứng yên khi `reduced()` true.
- T2.3: Motif viền vẽ **sau** `BorderFX.draw()` trong `17-render.js`, **dưới** `StageFX.draw()`
  (mechanic ải luôn là lớp trên cùng — gameplay readability ưu tiên).
- T2.4: Tint chỉ áp cho quái thường (`e.type` trong `MONSTER_REGISTRY`), **không** áp cho
  `G.boss` (boss giữ palette riêng), không áp cho đạn/particle/pickup.
- T2.5: Flag `G.themeTint` — default `true` khi `V2.stageId` ∈ 1..5, `false` khi endless/mode mới.
  (Không cần UI bật/tắt — quyết định theo ngữ cảnh, tránh rối.)
- T2.6: `PALETTES[sid]` thiếu field `theme` (vd ải mới trong tương lai) → mọi truy cập
  optional-chain + fallback: decor rỗng, border rỗng, tintHue 0. Không throw.

### 2.2. Redesign visual 9 quái (đợt 1)

**Bất biến cho cả 9 con (QA-02 kiểm tra):** `r`, `dmg`, `hp(w)`, `spd(w)`, `behavior`,
`weight`, `minWave`, `maxPerWave` **giữ nguyên tuyệt đối**. Chỉ đổi visual.
`slow` (đạn băng → `#7dd3fc`) giữ nguyên logic ở mọi nhánh.
Phong cách: cartoon tròn trịa, mắt/miệng biểu cảm, **không góc nhọn đáng sợ, không màu máu me**.

#### 2.2.1. chaser — "Tên Lửa Đồ Chơi" (hiện: tam giác trơn #ff5470, r=12)
- Thân tên lửa đồ chơi: mũi tròn (thay vì nhọn hoắt), 2 cánh đuôi bo tròn, cửa sổ buồng lái
  (tròn xanh nhạt `#bfe9ff`).
- Đuôi lửa: 3 lưỡi lửa cam/vàng (`#FF9A3D`/`#FFD166`) dài ~10px, flicker theo `sin(now/60)`;
  elite (`m.elite`) giữ vệt đỏ hiện có + thêm vạch sọc đỏ trên thân.
- Xoay hướng tàu như cũ. Telegraph chạm (<60px chớp) giữ nguyên.

#### 2.2.2. chewer — "Sâu Gặm Pixel" (hiện: hình vuông tím #c084fc + nhân đen, r=13)
- Thân sâu pixel: 3 đốt tròn nối nhau (thay vì 1 hình vuông), màu `#c084fc`, viền đậm `#7c3aed`.
- Hàm răng cưa: 2 hàng răng trắng hình tam giác nhỏ ở mặt trước, nhai (đóng/mở theo
  `sin(e.t*10)`) — khi `e.latched` (đang bám viền) nhai nhanh gấp đôi + hiện "vết cắn":
  3 vết zigzag trắng ngay mép viền cạnh nó.
- Icon `i-alert` khi latched giữ nguyên.

#### 2.2.3. tank — "Xe Tăng Đồ Chơi" (hiện: lục giác #ffb020 + nhân nâu, r=23)
- Thân xe đồ chơi: hình tròn bo (thay lục giác), 2 dải xích đồ chơi 2 bên (chữ nhật bo,
  màu `#8a5a00`, mỗi dải 3 bánh xe tròn nhỏ quay theo `e.t`).
- Tháp pháo tròn nhỏ trên nóc + nòng ngắn chĩa hướng di chuyển (không bắn — chỉ decor).
- **Lõi phát sáng (weakness đọc được bằng mắt):** nhân giữa `#FFE14D` pulse
  (alpha 0.7→1 theo `sin(now/150)`) + vòng hào quang mờ — "bắn vào chỗ sáng".
- Xoay chậm `e.t*0.8` giữ nguyên.

#### 2.2.4. dasher — "Phi Tiêu Ninja" (hiện: phi tiêu vàng #ffe14d, r=11)
- Phi tiêu sleek hơn: thân thon, 2 dải ruy-băng headband (`#ff5470`) bay phấp phới sau đuôi
  (vẽ 2 đường cong sin theo `e.t*12`).
- Aim state: giữ telegraph hiện có; **khi aim, dải aim chuyển ĐỎ** (`#ff3b30`) ở 0.2s cuối
  trước khi dash (đã có theo lead — giữ, làm rõ ngưỡng 0.2s).
- Mắt ninja: dải băng đen + 2 mắt trắng sắc lẹm trên thân.

#### 2.2.5. splitter — "Bong Bóng Xà Phòng" (hiện: tròn #7df9ff + gạch chéo, r=18)
- Bong bóng trong suốt: fill `rgba(125,249,255,0.55)` + viền `#7df9ff` 2px + vệt sáng
  highlight (ellipse trắng alpha 0.7 góc trên-trái) — cảm giác căng phồng.
- Wobble: scale 1±0.04 theo `sin(e.t*6)` (căng phồng như sắp vỡ).
- **Máu < 50%:** 3 vết nứt trắng chạy dọc + scale 0.95 (xẹp nhẹ) — báo trước "sắp vỡ",
  đúng `weaknessVi` đã ghi ("báo vỡ trước").
- Chết vẫn tách 2 mini như cũ (không đổi logic `onDeath`).

#### 2.2.6. mini — "Ong Bắp Cày Mini" (hiện: tam giác hồng #ff9df3, r=8)
- Thân ong bầu dục `#ff9df3` + 2 sọc bụng đậm `#c243c9`.
- 2 cánh ellipse bán trong suốt (`rgba(255,255,255,0.6)`) vỗ nhanh (`sin(e.t*30)` scaleY).
- Ngòi nhỏ phía sau + mắt tròn ngố (không dữ).
- Xoay hướng tàu như nhánh chaser hiện tại.

#### 2.2.7. bomber → nhánh `kamikaze` — "Bom Bi Cartoon" (hiện: tam giác cam #ff7a1a, r=10)
- Bom bi tròn đen-xám (`#3a3a44`, highlight trắng góc trên) thay tam giác; dây fuse trên đỉnh.
- Fuse cháy: tia lửa vàng `#FFD166` + khói xám (2-3 vòng tròn alpha thấp bay lên) —
  **đọc được fuse 0.7s** bằng mắt (tia lửa to dần khi `e.fuse` giảm).
- Khi armed (`e.fuse >= 0`): giữ flash trắng + dấu "!" hiện có; **thêm** mặt lo lắng hề hước
  (2 mắt tròn + miệng sóng) — hề, không creepy.
- Nổ vẫn `detonateKamikaze` như cũ (shrinkWindow 20×16, không đổi).

#### 2.2.8. glimmer — "Đom Đóm Đèn Lồng" (hiện: CHƯA CÓ nhánh vẽ — fallback hình tròn)
- Đèn lồng tròn `#fbbf24`: nan lồng (3 đường dọc cong), nắp + đáy đậm `#b45309`.
- Hào quang pulse: vòng sáng `rgba(251,191,36, a)` với `a = 0.25+0.2*sin(e.t*5)`;
  **người chơi trong 200px → hào quang sáng gấp đôi** ("thèm" đuổi theo — bonus rượt đuổi).
- 2 cánh nhỏ trong suốt + vệt lấp lánh (1 sparkle particle mỗi 0.2s, tái dùng `burst` 1 hạt).
- Behavior `flee` mới (§3.2): dmg 0, không tấn công, chạm viền/thọ 12s → thoát (không điểm).

#### 2.2.9. snatcher — "Trộm Vặt Chạy Làng" (hiện: đã có từ PR #77 — body tím + mặt nạ + túi)
- Giữ concept PR #77, **nâng chi tiết:**
  - Túi vải **phồng theo số gem cướp**: scale túi `1 + 0.18 * carried.length` (0→3 viên),
    miệng túi mở to dần; gem hình thoi trên miệng túi giữ nguyên.
  - Thêm dây đeo mặt nạ (1 đường cong sau đầu) + chùm chìa khóa đồ chơi leng keng ở hông
    (3 vòng tròn nhỏ — decor, gợi "trộm").
  - Khi `phase==="flee"`: giữ giọt mồ hôi + **thêm** 2 vệt bụi chân (puff xám nhạt sau lưng,
    1 puff/0.15s) — cảm giác "chạy thục mạng".
  - Nụ cười ranh mãnh + mắt láo liên giữ nguyên.

### 2.3. Hai mode mới

#### 2.3.1. MODE A — TIME ATTACK: "Chạy Deadline" (`?mode=timeattack`)

**Luồng 1 run:**
1. Menu → nút "⏱ Chạy Deadline" (luôn mở, không cần unlock) → `game.html?mode=timeattack&diff=…`.
2. Run bắt đầu như endless (wave 1, quái từ `buildSpawnQueue`), **đồng hồ 180s** chạy ngay
   khi `G.phase` lần đầu thành `"play"`.
3. Hết 180s → **kết thúc ngay lập tức**: banner "HẾT GIỜ! ⏱", đóng mọi overlay (draft/sat),
   hiện màn hình kết quả (tái dùng `#ov-over` qua `showEndScreen`).
4. Chết (0 HP hoặc cửa sổ vỡ) trước 180s → thua như game thường (`die()` giữ nguyên).

**Luật chi tiết:**
- **Timer:** `V2.ta = { total: 180, left: 180, done: false }`. `Modes.tickTimer(dt)` được gọi
  trong `update()` — **chỉ trừ khi `G.phase === "play"`** (tự động dừng khi pause/draft/gameover
  vì pause → `"paused"`, draft → `"draft"`). Hiển thị HUD giữa-trên: `⏱ M:SS`, to đậm;
  < 30s → đỏ + pulse; < 10s → tick sound mỗi giây (tái dùng `AudioEngine.sfx.click`).
- **Spawn dồn dập:** `wkSpawnInterval(wave) × 0.75`; `waveBreak` 2.6s → **1.2s**; các công thức
  count/hp/speed giữ nguyên (không tăng độ khó cơ số — chỉ tăng *nhịp*).
- **Boss:** vẫn xuất hiện mỗi 5 wave (boss thường endless — `spawnBoss()`), **không dừng timer**.
  Đánh boss là trade-off tự chọn: tốn giờ nhưng 500 điểm.
- **Điểm:** giữ nguyên §6 (kill = điểm gốc, boss = 500). **KHÔNG nhân điểm mode.**
- **Kết thúc hết giờ:** `G.phase = "over"` (tận dụng mọi guard sẵn có: quái ngừng update,
  spawn ngừng); điểm freeze; **không** gọi `die()` (không phải thua — là hết giờ).
- **Kỷ lục riêng:** `localStorage["wk_ta_high_" + DIFF_KEY + "_" + PROFILE_ID]` =
  `{ score, wave, kills, date }`. Hiện "KỶ LỤC MỚI! 🏆" nếu phá. Không đụng kỷ lục endless/campaign.
- **Meta/achievement:** `V2.onGameOver("timeup")` vẫn gọi để telemetry/achievement chạy
  (reason `"timeup"` — dev thêm vào map reason→cause ở `20-telemetry.js` nếu cần, chỉ thêm
  mapping, không sửa logic).

**Khoảnh khắc CƯỜI/WOW:** 30s cuối — nhạc dồn, timer đỏ pulse, người chơi liều lao vào đám
quái farm điểm thay vì chơi an toàn; hết giờ đúng lúc đang combo → "giá như thêm 5s nữa!" —
đua với chính mình/bạn bè, mỗi run 3 phút gọn, hợp demo booth.

#### 2.3.2. MODE B — BOSS RUSH: "Xếp Hình Sếp" (`?mode=bossrush`)

**Luồng 1 run:**
1. Menu → nút "👔 Xếp Hình Sếp" — **guard:** chỉ mở khi `Campaign.getUnlockedStage(profile) >= 2`
   (đã biết boss là gì sau khi phá ải 1); chưa đủ → nút disabled + hint "Phá đảo ải 1 để mở".
2. Vào game: banner "XẾP HÌNH SẾP — 5 SẾP LIÊN TIẾP! 👔", spawn **boss_1** ngay (không wave quái).
3. Hạ boss N → **nghỉ 5s**: banner "Nghỉ {s}s — sửa cửa sổ! 🔧", **sửa cửa sổ 30%**
   (tính trên phần đã mất), **+1 HP** (cap maxHp), dọn sạch đạn địch/adds còn lại.
4. Hết 5s → boss N+1. Lặp đến boss_5.
5. Hạ boss_5 → **THẮNG**: màn hình "THẮNG BOSS RUSH! 🏆" + tổng thời gian + điểm + kỷ lục.
6. Chết bất cứ lúc nào (0 HP hoặc cửa sổ vỡ) → thua như game thường.

**Luật chi tiết:**
- **Thứ tự boss:** `boss_1 → boss_2 → boss_3 → boss_4 → boss_5`, qua `Bosses.startBoss(stageId, diff, G)`
  với `stageId` = 1..5 (tái dùng toàn bộ def/attack/telegraph có sẵn — **không buff/nerf boss**).
- **Hook:** tái dùng pattern `V2.startStageBoss` (setHooks: spawnEnemy/spawnPickup/spawnGems/
  fireEB/hurtShip/banner/onBossDead/onTimeout) — dev copy cấu trúc hook, thay `onBossDead`
  → `Modes.onBossDown`.
- **Diff:** `{ bossHpMul, telegraphMul, enemySpdMul }` map từ `Campaign.getRunParams(diffKey)`
  như `V2.startStageBoss` đang làm (không hardcode Normal).
- **Adds:** chỉ adds theo def boss (vd boss_1 adds chewer) — **không** wave quái thường,
  **không** satellite mới, **không** StageFX/StageMech.
- **Sửa cửa sổ 30%:** `missing = START_W − window.outerWidth` (desktop) / arena tương ứng;
  `growWindow(round(missing*0.3), round(missing*0.3*0.75))`, cap ở START như `growWindow` đã làm.
  Trên web arena-ảo: cùng công thức qua `bounds()` — dev dùng đúng hàm `growWindow` có sẵn,
  không tự tính kích thước.
- **+1 HP:** `s.hp = min(s.maxHp, s.hp+1)`; nếu đã đầy → quy thành 200 điểm an ủi + float "+200".
- **Điểm:** boss = 500 như cũ (§6); adds = điểm gốc. **KHÔNG nhân.**
- **Thắng:** `Modes.victory({ timeSec, score })` → `G.phase="over"` + `showEndScreen` với
  title thắng; kỷ lục `localStorage["wk_br_best_" + DIFF_KEY + "_" + PROFILE_ID]` =
  `{ timeSec, score, date }` — so **thời gian ngắn hơn** là phá kỷ lục (điểm là phụ).
- **Boss 5 timeout:** boss_5 có countdown (diff.boss5Timer) → `onTimeout` → `WKDie("window")`
  như campaign (thua).
- **Pause/draft:** cho phép như thường (timer tổng `G.time` vẫn chạy đúng vì phase-gated).

**Khoảnh khắc CƯỜI/WOW:** fan-service — gặp lại 5 "sếp" đã biết, mỗi boss là 1 câu đố đã thuộc;
5s nghỉ giữa boss là nhịp thở hài ("thở đã, sếp tiếp theo tới!"); thắng cả 5 = cảm giác
"phá đảo" gọn trong ~10 phút.

#### 2.3.3. Vì sao chọn A + B, vì sao loại Gem Fever

| Mode | Variety (cơ chế MỚI?) | Effort | Verdict |
|---|---|---|---|
| A. Time Attack | Cao — lần đầu game có **đồng hồ đếm ngược** + áp lực điểm/thời gian; đảo nhịp chơi (liều vs an toàn) | M (timer + HUD + spawn scale + kết quả) | **CHỌN** |
| B. Boss Rush | Cao — lần đầu **chuỗi boss liên tiếp** + nhịp nghỉ/sửa giữa boss; fan-service 5 boss có sẵn | L (chủ yếu là orchestration qua Bosses API có sẵn) | **CHỌN** |
| C. Gem Fever (endless + modifier ngẫu nhiên mỗi 30s) | **Thấp** — quái `director` (Variety Pack 1) **đã** roll modifier vui ngẫu nhiên; trùng lặp ~100% | — | **LOẠI** |

Cả A và B đều tạo khoảnh khắc WOW mà **không tăng độ khó cơ số** (đúng triết lý CEO):
A tăng *nhịp*, B tái dùng *content đã biết*. Các mode khác bị loại: survival thuần (trùng endless),
PvP (không có netcode — ngoài phạm vi).

---

## 3. Type Definitions & Interfaces

### 3.1. Theme schema — mở rộng `PALETTES` trong `js/bg.js`

```js
// Thêm vào MỖI entry PALETTES[1..5]. Mọi field optional — thiếu = fallback an toàn.
PALETTES[sid].theme = {
  // (a) decoration
  decor: {
    statics: [                       // vẽ 1 lần trong paintBase() → bake vào offscreen
      { kind: "rect",   x: 0.12, y: 0.30, w: 90, h: 64, r: 8,  c: "#2E6DB4", a: 0.10 },
      // kind ∈ {"rect","circle","line","text","chimney","bricks","blackhole","bulb","memblock"}
      // tọa độ x,y ∈ [0,1] (tỉ lệ theo W,H) để chịu được resize
      { kind: "text",   x: 0.94, y: 0.08, text: ":-(", size: 64, c: "#ffffff", a: 0.05 },
    ],
    animated: [                      // vẽ mỗi frame trong drawDecorAnim(), ≤12 phần tử
      { kind: "scanline", count: 3, speed: 12 /*px/s*/, c: "#66B2FF", a: 0.08, h: 2 },
      // kind ∈ {"scanline","spark","orbit","fallblock","flicker"}
    ],
  },
  // (b) motif viền — vẽ sau BorderFX.draw() trong 17-render.js
  border: {
    kind: "rounded" | "fire" | "swirl" | "neon" | "danger",  // theo ải 1..5
    colors: ["#2E6DB4"],          // 1 màu hoặc 2 màu (gradient)
    width: 3,                    // px
    sync: "none" | "spikes" | "blackout" | "danger",
    // sync="spikes":   alpha pulse đồng bộ chu kỳ gai ải 2 (đọc state StageMech)
    // sync="blackout": alpha theo blackout ải 4 (đọc state BG.setBlackout)
    // sync="danger":   lerp colors[0]→colors[1] theo BG danger ải 5
  },
  tintHue: 8,                    // độ lệch hue áp cho quái, ∈ [-15, 15], default 0
};

// API BG bổ sung (trong js/bg.js):
BG.getTheme(sid)                // → PALETTES[sid].theme || {} (không throw khi thiếu)
BG.drawDecorAnim(ctx, t)        // vẽ animated decor của stage hiện tại (gọi trong BG.draw)
// 17-render.js bổ sung:
drawThemeBorder(ctx, W, H, now) // vẽ motif viền theo BG.getTheme(BG.stageId).border
themeTint(e)                    // → màu đã shift hue của e.color (memo theo e.color+sid),
                                //    trả e.color nguyên khi tint tắt
```

### 3.2. Monster visual spec format + dual-registry parity checklist

**Visual spec format** (dev implement 1:1 từng nhánh `drawOneEnemy` trong `17-render.js`):

```
MONSTER ART SPEC — <id>
  base:     <primitive> @ color <hex> r=<r>            // vd: circle body
  parts:    [ {<primitive>, <hex>, <kích thước tương đối theo e.r>, <vị trí>} ... ]
  anim:     <mô tả chuyển động> dùng <biến có sẵn: e.t | now>       // vd: flicker sin(now/60)
  states:   { <tên state có sẵn>: <thay đổi visual> }               // vd: {latched: "nhai ×2 + vết cắn"}
  keep:     [ <hành vi/hiệu ứng HIỆN CÓ phải giữ: slow tint, elite trail, ...> ]
  invariants: r=<r> dmg=<dmg> behavior=<behavior> hp=<hp(w)> spd=<spd(w)>  // KHÔNG ĐỔI
```

Chi tiết từng con xem §2.2 (đó chính là art spec đã chốt — dev không sáng tác thêm).

**Dual-registry parity checklist** (dev chạy sau mỗi sửa, QA-02 assert tự động):
- [ ] Mọi id trong `js/monsters.js` MONSTER_REGISTRY đều có mặt trong `js/game/10-gamedata.js`
      MONSTER_REGISTRY và ngược lại (19 + snatcher + **glimmer mới**).
- [ ] Với 9 id redesign: `color`, `r`, `dmg`, `behavior` KHỚP 2 file (so sánh chuỗi/số tuyệt đối).
- [ ] `weight`, `minWave`/`debutWave`, `maxPerWave` của 9 id **không đổi** so với base
      (dev chụp snapshot trước khi sửa — QA-02 so tự động).
- [ ] `hp(w)`/`spd(w)`/`hpAt`/`speedAt`: không đụng (diff không chứa).
- [ ] `10-gamedata.js` THÊM: entry `glimmer` (weight **0** — không đổi balance endless,
      behavior `"flee"` MỚI) + `BEHAVIORS.flee` (update-only, §3.2.1).
- [ ] `js/monsters.js`: đồng bộ visual legacy `BEHAVIORS.<behavior>.draw` ở mức nhận diện
      (không cần pixel-perfect với 17-render).

#### 3.2.1. `BEHAVIORS.flee` (mới, trong `10-gamedata.js` — cho glimmer)

```js
// Chạy TRÁNH tàu, hướng ra viền gần nhất. Hết lifeT hoặc chạm viền → thoát (không điểm).
flee: { update(e, dt, s, spd) {
  // 1. lifeT đếm ngược (init: e.lifeT = 12)
  // 2. p = nearestEdgePoint(e.x, e.y); di chuyển về p với spd (+ wobble nhẹ sin(e.t*5)*30)
  // 3. nếu dist < 14 HOẶC lifeT <= 0 → e.escaped = true; e.dead = true
  //    (KHÔNG qua killEnemy → không điểm/xp — cùng pattern snatcher RFC nest-removal)
} }
```
Dùng helpers có sẵn: `nearestEdgePoint`, `hyp`/`dist2` (dev tra tên đúng trong file).

### 3.3. Mode contract

```js
// ---- Query param (v2glue.js) ----
game.html?mode=timeattack | game.html?mode=bossrush
V2.mode = null | "timeattack" | "bossrush"   // whitelist; invalid → null
// Precedence: mode hợp lệ ⇒ V2.stageId=0, V2.endless=false, V2.daily=false
//             (đè ?stage=, ?endless=1, ?daily=1 — mode ĐỘC QUYỀN)

// ---- State fields (V2) ----
V2.ta = { total: 180, left: 180, done: false }            // time attack
V2.br = { idx: 0, order: [1,2,3,4,5], restT: 0, won: false, t0: 0 }  // boss rush

// ---- window.Modes (js/game/22-modes.js, MỚI) ----
Modes.init(mode)            // gọi trong V2.boot(); đăng ký i18n (I18N.register literal)
Modes.tickTimer(dt)         // time attack: left -= dt KHI VÀ CHỈ KHI G.phase==="play"
Modes.timeUp()              // left<=0 → freeze, phase="over", showEndScreen(timeup)
Modes.spawnScale()          // → { intervalMul: 0.75, breakMul: 1.2/2.6 } khi timeattack
                            //    else { intervalMul: 1, breakMul: 1 }
Modes.startBossRush()       // setHooks (pattern V2.startStageBoss) → Bosses.startBoss(1,…)
Modes.onBossDown(b)         // hạ boss → dọn sân → restT=5 → sửa 30% + +1HP → boss kế
Modes.victory(stats)        // hạ boss_5 → phase="over", showEndScreen(victory)
Modes.drawHUD(ctx, W)       // HUD: countdown ⏱ M:SS | "SẾP n/5" + tên boss + rest countdown

// ---- 15-ui.js ----
showEndScreen({ kind: "timeup"|"victory", title, lines: [...], recordLine })
//    tái dùng DOM #ov-over (over-title/over-score/over-stats/over-record);
//    kind="timeup": title "HẾT GIỜ! ⏱"; kind="victory": title "THẮNG BOSS RUSH! 🏆"

// ---- Menu wiring (js/menu.js + index.html) ----
// Panel "Chế độ chơi" sau #v2-stages:
//   [⏱ Chạy Deadline] → v2sel={kind:"mode",mode:"timeattack"} — luôn enabled
//   [👔 Xếp Hình Sếp]  → v2sel={kind:"mode",mode:"bossrush"}  — disabled khi
//                        Campaign.getUnlockedStage(activeId) < 2 (+ hint khóa)
// launchGame(): if (v2sel.kind==="mode") q.set("mode", v2sel.mode)
// i18n keys MỚI (I18N.register literal trong js/menu.js, vi+en):
//   menu.mode.title, menu.mode.ta, menu.mode.ta_desc,
//   menu.mode.br, menu.mode.br_desc, menu.mode.locked_hint

// ---- i18n keys MỚI (I18N.register literal trong js/game/22-modes.js, vi+en) ----
mode.ta.name="Chạy Deadline" / "Deadline Rush
...[truncated 1620 chars]
## 4. Failure Modes & Edge Cases

| # | Kịch bản | Phát hiện / Phòng ngừa (contract cho dev+qa) |
|---|---|---|
| F1 | **`?mode=` sai/không hợp lệ** (`?mode=turbo`, `?mode=` rỗng) | Whitelist trong `V2.boot()`: chỉ `timeattack`/`bossrush` được chấp nhận; còn lại → `V2.mode=null`, game chạy như cũ (stage/endless/daily). QA-03: fuzz 10 giá trị sai → 0 exception, fallback đúng. |
| F2 | **Xung đột param:** `?mode=bossrush&stage=3`, `?mode=timeattack&endless=1` | Precedence cứng: mode hợp lệ **đè** stage/endless/daily (`V2.stageId=0`, `endless=false`, `daily=false`). Không có trạng thái "vừa campaign vừa boss rush". |
| F3 | **Timer Time Attack chạy sai khi pause/draft** | `Modes.tickTimer` chỉ trừ khi `G.phase==="play"` (pause→`"paused"`, draft→`"draft"` — đã kiểm chứng code). QA-03: pause giữa run → `left` đứng yên; resume → chạy tiếp. |
| F4 | **Hết giờ đúng lúc draft nâng cấp / giữa boss** | `Modes.timeUp()`: đóng overlay draft (`G.phase="over"` đè `"draft"`), dọn `G.boss` + `Bosses.stop()`, không trao thưởng sau thời điểm hết giờ. Không throw khi `G.boss` null. |
| F5 | **Boss Rush: sửa cửa sổ 30% vượt START / âm** | Chỉ dùng `growWindow()` có sẵn (đã cap ở START_W); `missing = max(0, START_W − outerWidth)`; không tự set kích thước. Trên arena-ảo: cùng công thức qua `bounds()` — dev không hardcode pixel. |
| F6 | **Boss 5 timeout trong Boss Rush** | Tái dùng `hooks.onTimeout` → `WKDie("window")` như campaign (thua). Không có nhánh "timeout mà vẫn thắng". |
| F7 | **Chết trong thời gian nghỉ 5s giữa boss** (đạn địch còn sót) | `Modes.onBossDown`: dọn **sạch** `G.ebullets` + adds còn lại + `Bosses.stop()` trước khi bắt đầu rest; rest vẫn giữ `G.phase="play"` nhưng sân trống. |
| F8 | **Theme thiếu cho ải mới / sid lạ** | `BG.getTheme(sid)` → `{}` khi thiếu; `BG.build` fallback sid=1 đã có; mọi truy cập `theme.*` optional-chain. QA-01: `BG.build(99)` không throw, decor rỗng. |
| F9 | **Quái redesign vỡ hitbox visual** (vẽ to hơn `r`) | Contract: mọi primitive vẽ trong phạm vi `e.r` (+ ≤4px hiệu ứng ngoài như hào quang — không tính hitbox). `r` không đổi. QA-02: assert `r` 9 id bằng snapshot base. |
| F10 | **Dual-registry drift** (sửa `monsters.js` quên `10-gamedata.js`) | QA-02 assert parity tự động (id/color/r/dmg/behavior khớp 2 file); dev sửa 2 file trong **cùng 1 task** (DEV-03/DEV-04). |
| F11 | **SW cache cũ** — user thấy menu không có nút mode / theme cũ | DEV-08 bắt buộc `node scripts/bump-sw.js` sau mỗi DEV; QA-04 verify stamp đổi. (Bài học gray-veil: user cần 1–2 F5 — ngoài phạm vi code.) |
| F12 | **i18n key thiếu** (menu/game hiện raw key) | Key mới CHỈ qua `I18N.register()` literal (trong `22-modes.js` và `menu.js`); cấm thêm vào `js/i18n.js`. QA-04 chạy `i18n-coverage` — thiếu cặp vi/en = fail. |

## 5. Acceptance Criteria (định lượng — cho QA/EVAL)

### 5.1. Track Themes (QA-01)
- [ ] `PALETTES[1..5]` đều có field `theme` đủ 3 lớp (`decor`, `border`, `tintHue`); `BG.getTheme(sid)`
      trả đúng; `BG.getTheme(99)` → `{}` không throw.
- [ ] Vào từng ải 1–5 (campaign): `BG.build` được gọi với `sid` = đúng ải (spy/mock như
      `stage-bg-wiring.test.js`); motif viền + decor của ải đó xuất hiện trong **≤3s**
      (checklist QA tay: gọi tên theme khi nhìn màn hình).
- [ ] `BG.build(1..5, 99, "x", NaN, undefined)` → không throw; fallback sid=1.
- [ ] Perf smoke: `BG.draw` với canvas mock < **2ms/frame** (decor animated ≤12 prop);
      `reduced()` → decor animated đứng yên.
- [ ] Endless: palette loop + milestone banners như cũ; tint TẮT (màu quái = `e.color` gốc).
- [ ] Không entity gameplay nào sinh ra từ decor (grep: `paintDecor`/`drawDecorAnim` không gọi
      `spawnEnemy`/`G.enemies.push`/`SatManager.request`).

### 5.2. Track Quái (QA-02)
- [ ] Dual-registry parity: 19 + snatcher + glimmer ids khớp 2 file; với 9 id redesign,
      `color`/`r`/`dmg`/`behavior` khớp tuyệt đối 2 file.
- [ ] Snapshot stat: `weight`, `minWave`/`debutWave`, `maxPerWave`, `r`, `dmg` của 9 id
      **bằng** snapshot base (dev chụp trước khi sửa, lưu `tests/__snapshots__/` hoặc inline).
- [ ] Draw smoke: gọi nhánh vẽ 9 id (+ glimmer mới) với canvas mock + entity mock
      (đủ field `x,y,r,t,color,phase,carried,fuse,state,latched…`) → **0 exception**.
- [ ] `buildSpawnQueue`: glimmer weight 0 → **không** lọt pool endless (phân phối spawn endless
      không đổi); snatcher `maxPerWave: 1` vẫn tôn trọng.
- [ ] Full suite `node --test tests/`: **100% pass, 0 fail** (ngoài test mới thêm).
- [ ] QA tay: 9 quái nhận diện đúng art spec §2.2; không creepy; `slow` tint `#7dd3fc` còn hoạt động.

### 5.3. Track Modes (QA-03)
- [ ] Parse: `?mode=timeattack` → `V2.mode="timeattack"`, stageId=0; `?mode=bossrush` →
      `V2.mode="bossrush"`; `?mode=xxx`/`?mode=` → `V2.mode=null` (fallback, 0 exception);
      `?mode=bossrush&stage=3` → stageId=0 (mode đè).
- [ ] Time Attack: timer 180s hiển thị `⏱ M:SS`; pause → timer đứng yên; hết giờ →
      `G.phase="over"`, overlay "HẾT GIỜ! ⏱", điểm freeze; kỷ lục lưu đúng key
      `wk_ta_high_<diff>_<profile>`; chết trước 180s → `die()` như thường.
- [ ] Time Attack spawn: `wkSpawnInterval × 0.75`, `waveBreak` 1.2s (assert qua mock/spy
      hoặc test logic `Modes.spawnScale()`).
- [ ] Boss Rush: đủ **5 boss đúng thứ tự 1→5** (mock `Bosses.startBoss` ghi lại stageId);
      giữa boss: rest 5s + `growWindow` được gọi với 30% missing + ship +1 HP (cap maxHp);
      hạ boss_5 → overlay "THẮNG BOSS RUSH! 🏆"; chết giữa chừng → `die()` như thường.
- [ ] Boss Rush guard: `getUnlockedStage < 2` → nút disabled + hint khóa (test logic menu
      với Campaign mock).
- [ ] Điểm §6: kill = điểm gốc, boss = 500 — **không** có hệ số nhân mode nào trong diff.

### 5.4. Gate chung (QA-04)
- [ ] `node scripts/build-game.js --check` xanh (bundle đồng bộ sau mọi DEV).
- [ ] `node scripts/bump-sw.js --check` — stamp `sw.js` đổi sau mỗi DEV task.
- [ ] `i18n-coverage` pass (mọi key mới đủ cặp vi/en, không thêm vào `js/i18n.js`).
- [ ] Full `node --test tests/`: **100% pass**.

---

## 6. Ghi chú bàn giao cho dev (agent-dev) — hợp đồng file-by-file

| Task | File chạm | Việc (chỉ những gì RFC này ghi) |
|---|---|---|
| DEV-01 | `js/bg.js` | Thêm `theme` vào `PALETTES[1..5]` (§3.1); `paintDecorStatic` trong `paintBase()`; `drawDecorAnim` trong `draw()` (layer L1.5); export `BG.getTheme`. Không đổi API cũ. |
| DEV-01 | `js/game/17-render.js` | Thêm `drawThemeBorder(ctx,W,H,now)` sau `BorderFX.draw()`; thêm `themeTint(e)` + áp vào 9 nhánh redesign (§2.2). |
| DEV-02 | `index.html`, `js/menu.js`, `css/` | Stage cards: accent màu theme/ải (1 #0066CC, 2 #CC3300, 3 #9D4EDD, 4 #00E5FF, 5 #4ADE80) — inline style như code hiện tại, không refactor. |
| DEV-03 | `js/game/17-render.js`, `js/monsters.js`, `js/game/10-gamedata.js` | Viết lại 6 nhánh vẽ: chaser, chewer, tank, dasher, splitter, mini (§2.2.1–2.2.6); đồng bộ registry 2 file (chỉ field visual). |
| DEV-04 | như trên | 3 nhánh còn lại: kamikaze (bomber), glimmer (**mới** — thêm entry + `BEHAVIORS.flee` §3.2.1 vào `10-gamedata.js`, weight 0), snatcher nâng chi tiết (§2.2.9); `themeTint` hoàn thiện. |
| DEV-05 | `js/game/22-modes.js` (mới), `js/v2glue.js`, `js/game/16-update.js`, `js/game/11-spawn.js`, `js/game/15-ui.js`, `js/game/17-render.js` | Time Attack: parse `?mode=` (§3.3), `V2.ta`, `Modes.tickTimer/timeUp/spawnScale`, HUD countdown, `showEndScreen("timeup")`, kỷ lục `wk_ta_high_*`. Điểm giữ nguyên §6. |
| DEV-06 | như trên | Boss Rush: `V2.br`, `Modes.startBossRush/onBossDown/victory` (§2.3.2), rest 5s + sửa 30% + +1HP, `showEndScreen("victory")`, kỷ lục `wk_br_best_*`. |
| DEV-07 | `index.html`, `js/menu.js` | Panel "Chế độ chơi": 2 nút + guard unlock ải 2 cho Boss Rush + `I18N.register` keys menu (§3.3). Không refactor menu. |
| DEV-08 | — | Sau **mỗi** DEV: `node scripts/build-game.js` + `node scripts/bump-sw.js` + verify `--check`. |

**MANIFEST.txt:** thêm `22-modes.js` sau `17-render.js` (trước `19-onboard.js`).

**Thứ tự an toàn:** DEV-01 → DEV-02 (themes) ‖ DEV-03 → DEV-04 (quái) ‖ DEV-05 → DEV-06 + DEV-07
(modes, DEV-07 song song được). Mỗi DEV xong → DEV-08 → giao QA.

**Checklist trước khi báo xong mỗi DEV:**
1. `node scripts/build-game.js --check` xanh.
2. `grep` diff không chạm file cấm (§0).
3. Dual-registry parity (§3.2 checklist) nếu đụng quái.
4. Không key mới nào trong `js/i18n.js` (chỉ `I18N.register` literal).
5. Không hệ số nhân điểm nào xuất hiện (§6).
