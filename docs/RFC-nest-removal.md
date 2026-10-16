# RFC — Xóa M1/M5/M8 (nest-removal) + Quái mới "Trộm Vặt Chạy Làng"

- **Trạng thái:** SPEC (chờ CEO duyệt) — agent-spec viết, TUYỆT ĐỐI chưa viết code.
- **Nhánh:** `feat/nest-removal` (từ `origin/main` d2b698e), repo `~/workspace/windowkill-web-nest`.
- **Phạm vi sửa cho phép:** `js/game/*.js` (module) + rebuild bundle bằng `node scripts/build-game.js`.
  CẤM: `index.html`, `js/menu.js`, `js/sfx2.js`, `js/game/00-head.js`, sửa tay `js/game.js`.
  `js/i18n.js`: chỉ XÓA key chết, không thêm key mới.
- **Quyết định M5: XÓA.** Gag duy nhất của M5 (gà con "mất mẹ → nổi giận 10s → tự vỡ rớt gem an ủi")
  chỉ là lớp flavor phủ trên đúng core spawner mà M6 (minion) đã có; M5 ngốn 3/3 slot vệ tinh,
  chặn toàn bộ satellite content còn lại; niche "quái có cảm xúc" đã được M7 (thất tình → trả thù)
  làm tốt hơn. Không có giá trị gameplay RIÊNG BIỆT đủ để giữ.
- **Content mới: QUÁI MỚI `snatcher` — "TRỘM VẶT CHẠY LÀNG" (kẻ cướp gem).**
  Mode mới bị LOẠI do `js/menu.js` cấm sửa (không thêm được UI chọn mode); map mới (theme arena)
  variety thấp hơn. Quái mới thắng fun-per-effort và đúng tie-break của CEO (ưu tiên quái mới).

---

## 1. Architectural overview + luồng dữ liệu module

### 1.1. Hệ vệ tinh (satellite) hiện tại

```
12-variety.js  (startWave)
  └─ maybeTrigger*(n) ──► SatManager.request(role, opts)   [04-satellite.js]
                              │  MAX_SATS=3, PRI queue, sim-fallback
                              ▼
                    sat = { id, role, hp, opts:{onClose,...}, sim, win, ... }
                              │
16-update.js (mỗi frame)      │  05-chainpopups.js: update*(dt) theo role
  ├─ SatManager.poll/updateSims
  ├─ updateNests/updateBombs/updateMinions/updateMothers/updateChicks/...
  └─ 17-render.js: SatManager.drawSims() → drawSimContent(role) [04]
                              │
                    SatManager.kill(id, mode) ──► opts.onClose(mode, sat)
                        mode ∈ {killed, manual, timeout, impact, exploded, merge}
```

- Popup thật (Electron) vs khung giả `sim` (web): mọi logic sống ở cửa sổ chính; vệ tinh chỉ render.
- `satellite.html` render popup thật theo `ROLE` (có nhánh `drawNest`, `drawBomb`, `BOMB_T` cho M8).
- Sau xóa: các role còn lại là `fragment` (M2), `shield` (M3), `debris` (M4), `giant`/`minion` (M6),
  `lover`/`superlove` (M7), `mirror` (M10), `blackhole` (M9).

### 1.2. Hệ quái (monster) — nơi đặt content mới

```
js/monsters.js
  MONSTER_REGISTRY[type] = { id, nameVi, role, color, shape, r, dmg, xp, gems,
                             behavior, debutWave, maxPerWave, hpAt, speedAt,
                             weaknessVi, counterVi, debutHintVi }
  BEHAVIORS[behavior] = { init(m, wave), update(m, dt, G), draw(m, ctx) }
  SPAWN_SUGGEST = [{ type, minWave, weight, maxPerWave }] → spawnWeights(wave)
  STRINGS = { vi: {...}, en: {...} }  // i18n riêng, KHÔNG đụng js/i18n.js
  makeEnemy(type, wave, diff, x, y)   // factory cho test + coordinator
```

- Helpers dùng được: `shipOf(G)`, `boundsOf()`, `effSpeed(m, G)`, `hyp(x,y)`, `clamp`,
  `edgePoint(x, y, b)`, `spawnEnemyAt` (phía game).
- Gem schema (16-update.js): `G.gems[] = { x, y, vx, vy, v, t }` (`v` = giá trị đã nhân modifier;
  timeout `t > 30` → despawn; magnet hút về tàu).
- **Lưu ý constraint:** quái mới cần sửa `js/monsters.js` (ngoài `js/game/*.js` nhưng KHÔNG nằm
  trong danh sách cấm). Spec này giả định CEO cho phép sửa `js/monsters.js` cho phần quái mới;
  nếu không, dev phải đề xuất cơ chế `Monsters.register()` riêng (ngoài phạm vi RFC này).

---

## 2. Danh mục XÓA đầy đủ (dev checklist)

### 2.1. `js/game/05-chainpopups.js` — xóa 15 hàm, rename 1, giữ 2

| Hàm | Xử lý |
|---|---|
| `nestSpawnPoint(sat)` | **RENAME → `satSpawnPoint`** (vẫn dùng bởi M6/M7/M10/M9: `onGiantClose`, `onMinionClose`, `updateMinions`, `loverAnchor`, `mirrorAnchor`, `vacAnchor`) — cập nhật mọi caller |
| `onNestClose`, `updateNests`, `maybeTriggerNest` | XÓA (M1) |
| `explodeBomb`, `onBombClose`, `updateBombs`, `maybeTriggerBomb` | XÓA (M8) |
| `motherChicks`, `motherChickCount`, `enrageChicks`, `onMotherClose`, `onChickClose`, `layChick`, `updateMothers`, `updateChicks`, `maybeTriggerMother` | XÓA (M5) |
| `bounceSimSat`, `knockShip` | **GIỮ** (dùng chung M6/M7/M9/M10) — chuyển comment header ra khỏi block M8, đặt ngay trước `updateMinions` hoặc đầu file |
| `drawSatFields()` | GIỮ nguyên (chỉ vẽ mirror/blackhole) |

- Xóa cả 3 section header comment M1/M5/M8. Xóa guard `G.bombWave`, `G.motherWave`.
- Sau xóa, `05-chainpopups.js` còn: M3 shield, M4 debris, M6 giant/minion, M7 love,
  M10 mirror, M9 vacuum + helpers chung.

### 2.2. `js/game/04-satellite.js`

- `PRI`: xóa entry `nest: 2` (bomb vốn không có trong PRI).
- `ROLE_TB_TINT`: xóa 4 entry `nest`, `bomb`, `mother`, `chick`.
- `drawSimContent(s)`: xóa 4 nhánh `s.role === "nest" | "bomb" | "mother" | "chick"`.
- Return API của `SatManager`: xóa `send: (id, msg) => post(id, msg)` (+ comment "M8: gửi sat-tick")
  — caller duy nhất là `updateBombs`.
- ⚠️ `sat.bomb_telegraph` trong `drawSimContent` nhánh `giant` (M6) — key này GIỮ (xem §2.5).

### 2.3. `js/game/12-variety.js` (dòng ~313-314)

```js
// XÓA:
maybeTriggerNest(n); // M1 ...
maybeTriggerBomb(n); maybeTriggerGiant(n); maybeTriggerMother(n); // M8/M6/M5
// THÀNH:
maybeTriggerGiant(n); // M6
maybeTriggerLove(n); maybeTriggerMirror(n); maybeTriggerVacuum(n); // M7/M10/M9
```

### 2.4. `js/game/15-ui.js` + `js/game/16-update.js`

- `resetGame()` (15-ui.js:154): xóa `bombWave: 0,` và `motherWave: 0,`; giữ `giantWave: 0`.
  Sửa comment dòng ~177: "để sót bomb/mother/nest và boss ma" → "để sót vệ tinh và boss ma".
- `update()` (16-update.js:161-165):
  - `updateNests(dt);` → xóa khỏi dòng `SatManager.poll/updateSims`.
  - Xóa dòng `if (typeof updateBombs === "function") updateBombs(dt);`.
  - `{ updateMinions(dt); updateMothers(dt); updateChicks(dt); }` → `{ updateMinions(dt); }`.

### 2.5. `js/i18n.js` — xóa 21 key × 2 locale = 42 dòng (KHÔNG thêm key mới)

VI (dòng 632-636, 641-645, 656-666) và EN (dòng 954-958, 963-967, 978-988):

| Nhóm | Keys xóa |
|---|---|
| M1 nest (5) | `sat.nest_label`, `sat.nest_spawn`, `sat.nest_burst`, `sat.nest_killed`, `sat.nest_released` |
| M8 bomb (5) | `sat.bomb_label`, `sat.bomb_spawn`, `sat.bomb_tick`, `sat.bomb_boom`, `sat.bomb_killed` |
| M5 mother/chick (11) | `sat.mother_label`, `sat.mother_spawn`, `sat.mother_lay`, `sat.mother_lay_telegraph`, `sat.chick_label`, `sat.chick_enraged`, `sat.chick_manual`, `sat.chick_dead`, `sat.chick_calm`, `sat.chick_angry`, `sat.chick_idle` |

**GIỮ LẠI:** `sat.bomb_telegraph` (VI 646 / EN 968) — M6 giant render đang dùng
(`drawSimContent` nhánh `giant`). Dev có thể rename → `sat.giant_telegraph` (optional, báo rõ trong PR).

### 2.6. Phân biệt QUAN TRỌNG — những thứ KHÔNG được xóa (dễ nhầm)

- `bomber` ("Liều Chết Cảm Tử", kamikaze) và `broodmother` ("Ổ Lỗi Sinh Sản") trong
  `js/monsters.js` / `js/campaign.js` / `js/bosses.js` (`spawnBombers`) là **quái thường**,
  không liên quan satellite M1/M5/M8 → GIỮ NGUYÊN.
- Icon `i-bomb` trong `09-upgrades.js`, `17-render.js` (pickup icon) là icon damage/pickup
  chung → GIỮ NGUYÊN.
- `js/game/20-telemetry.js`: đã kiểm tra — **không có** event nào cho nest/bomb/mother → không cần sửa.

### 2.7. Tests bị ảnh hưởng

- `tests/m5m10-websim.test.js`: viết lại.
  - XÓA: describe "M8 Quả Bom Cười" (2 its), describe "M5 Mẹ Gà Đẻ Trứng" (1 it),
    sửa describe "môi trường giả lập" (dòng 126-127: batch `[["bomb","giant","mother"],...]`
    → chỉ role còn lại), describe "vẽ + click khung giả" (dòng 274: "mọi role M5–M10"
    → role còn lại; dòng 276-288 role list bỏ `bomb/mother/chick`; dòng 287-288 setup
    `fuseT`/`hopPh`/`enrageT` bỏ), describe "quota sat" (dòng 309, 323 dùng `request("bomb"...)`
    → đổi sang role còn tồn tại, vd `debris`).
  - GIỮ NGUYÊN: M6, M7, M9, M10 suites + quota logic.
- `tests/gc-churn.test.js` (dòng 183-184): xóa 2 assertions về `motherChickCount`.
- `tests/campaign-logic.test.js` (dòng 53): `ADD_MAP` chứa `bomber`/`broodmother` là quái
  thường → GIỮ.

### 2.8. `satellite.html` — CẦN QUYẾT ĐỊNH NGOẠI LỆ

File nằm ngoài `js/game/*.js` (constraint hiện tại cấm sửa). Chứa code chết sau xóa:
`drawNest()` (dòng ~90), `drawBomb()` + `BOMB_T` (dòng ~86, 153-169), dispatch
`ROLE === "nest"/"bomb"` (dòng 273-276), handler `sat-tick` (dòng 349),
default `ROLE = qp.get("role") || "nest"` (dòng 44 → đổi thành `"fragment"`).
- **Đề xuất:** xin ngoại lệ sửa tối thiểu `satellite.html` (xóa ~60 dòng chết).
- **Nếu CEO từ chối:** chấp nhận code chết — các nhánh không bao giờ chạy vì role không
  còn được request; fallback `drawBlob` vẫn an toàn.

---

## 3. Content mới: QUÁI `snatcher` — "TRỘM VẶT CHẠY LÀNG"

### 3.1. Vì sao chọn (fun-per-effort)

| Option | Variety | Effort | Kết luận |
|---|---|---|---|
| A. Quái mới: kẻ cướp gem | Cao — behavior chưa từng có (tương tác với gem, rượt đuổi 2 chiều) | Trung bình (1 registry + 1 behavior + draw + spawn) | **CHỌN** |
| B. Map mới: theme arena "Quán Net Đêm" | Trung bình — chủ yếu cosmetic | Thấp | Thua A về variety |
| C. Mode mới (vd "Heist Rush") | Cao | Rất cao + **BỊ CHẶN** (`js/menu.js` cấm sửa → không thêm UI chọn mode) | LOẠI |

### 3.2. Behavior spec (`behavior: "snatch"`, file `js/monsters.js`)

**Registry entry:**
```js
snatcher: { id: "snatcher", nameVi: "Trộm Vặt Chạy Làng", role: "cướp gem",
  color: "#f0abfc", shape: "tên trộm túi vải + mặt nạ", r: 12, dmg: 0, xp: 3,
  gems: 40, behavior: "snatch",
  debutWave: 6, maxPerWave: 1,
  debutHintVi: "Nó chỉ cướp gem rồi chạy — chặn đầu hướng viền, giết là đòi lại hết!",
  hpAt: hp1(w => 6 + w * 0.6), speedAt: sp1(w => 140 + w * 4),
  weaknessVi: "Máu 6; không tấn công — nhưng nhanh. Đạn băng làm chậm 50%.",
  counterVi: "Đừng đuổi thẳng — chặn đầu đường ra viền; giết khi nó đang ôm gem." }
```

**State machine (entity fields):** `m.phase ∈ {"hunt","flee"}`, `m.carried = []` (mảng giá trị
`v` của gem đã cướp, tối đa 3), `m.idleT` (đếm 6s khi không có gem), `m.escaped`.

**`init(m, wave)`:** `m.phase="hunt"; m.carried=[]; m.idleT=0; m.escaped=false;`

**`update(m, dt, G)`:**
1. `phase="hunt"`: tìm gem gần nhất trong `G.gems` (O(n), n nhỏ); di chuyển về phía nó với
   `effSpeed(m, G)` + wobble nhẹ cho vui mắt. Chạm gem (`dist < m.r + 10`):
   `idx = G.gems.indexOf(gem); if (idx >= 0) { G.gems.splice(idx,1); m.carried.push(gem.v); }`
   → `AudioEngine.sfx.slurp()` + float `"CƯỚP ĐÂY! 😈"` (key `monster.snatcher.steal`).
   - `m.carried.length >= 3` → `phase="flee"`.
   - Không còn gem nào trong 6s (`m.idleT += dt`) → `phase="flee"` (chạy tay không).
2. `phase="flee"`: nhắm `edgePoint` gần nhất (như glimmer), chạy tới. `ed < 14` →
   `m.escaped=true; m.dead=true` (không điểm/xp — gem mất), float `"MẤT GEM RỒI! 😭"`.
3. Va chạm tàu: `dmg: 0` — KHÔNG gây sát thương; chỉ hất nhẹ snatcher ra (tránh body-block).
4. **Chết khi đang ôm gem** (bất kể nguồn sát thương — đạn, say-nắng M7, ebullet):
   scatter toàn bộ `m.carried` về `G.gems` tại `(m.x, m.y)` với vận tốc ngẫu nhiên,
   giữ nguyên `v` từng viên → `AudioEngine.sfx.boing()` + float `"ĐÒI LẠI ĐƯỢC! 💎"`.

**`draw(m, ctx)`:** body tròn tím `#f0abfc` + dải mặt nạ đen + mắt láo liên; túi vải sau lưng
vẽ tối đa 3 viên gem (hình thoi nhỏ) theo `m.carried.length`; khi `phase="flee"` thêm
vệt mồ hôi/lo lắng (giọt mồ hôi xanh) — cartoon, tuyệt đối không creepy.

**Spawn:** thêm `{ type: "snatcher", minWave: 6, weight: 6, maxPerWave: 1 }` vào `SPAWN_SUGGEST`.

**i18n (trong `STRINGS` của `js/monsters.js`, vi+en — không đụng `js/i18n.js`):**
`monster.snatcher.name`, `monster.snatcher.counter`, `monster.snatcher.steal`
("CƯỚP ĐÂY! 😈"), `monster.snatcher.caught` ("ĐÒI LẠI ĐƯỢC! 💎"),
`monster.snatcher.escaped` ("MẤT GEM RỒI! 😭").

**SFX (tái dùng, đúng style vui nhộn):** `slurp` (cướp), `boing` (đòi lại/kill),
`hit` (trúng đạn thường). Không thêm SFX mới.

### 3.3. Khoảnh khắc CƯỜI/WOW

Lần đầu thấy: một tên trộm mặt nạ lao vào đống gem bạn đang farm, "CƯỚP ĐÂY! 😈",
ôm 3 viên chạy thục mạng ra viền — bạn buộc phải bỏ combat rượt theo, vừa bắn vừa hét
trong đầu "đứng lại!". Giết được → gem văng tung tóe + "ĐÒI LẠI ĐƯỢC! 💎" (boing) —
punchline hoàn hảo. Trượt → "MẤT GEM RỒI! 😭". Đây là **kẻ địch đầu tiên "cướp" thay vì
"giết"** — đảo vai trò hunter/prey trong 10 giây, đúng triết lý variety của CEO.

---

## 4. Edge cases / failure modes (≥5)

### Phần xóa
1. **Caller sót của `nestSpawnPoint`:** M6/M7/M10/M9 vẫn gọi → rename thành `satSpawnPoint`
   và cập nhật TẤT CẢ caller; sót 1 chỗ = `ReferenceError` mỗi frame. Dev dùng grep
   `nestSpawnPoint` xác nhận 0 kết quả sau sửa.
2. **`SatManager.send` bị xóa nhưng còn caller:** hiện chỉ `updateBombs` dùng; sau xóa,
   grep `\.send(` trong `js/game/` phải 0 kết quả (không tính `bus.postMessage`).
3. **Nhầm `bomber`/`broodmother` (quái thường) với M8/M5:** xóa nhầm = mất 2 quái + vỡ
   campaign (dòng 167-242 `js/campaign.js`) + boss `spawnBombers`. Checklist §2.6 bắt buộc.
4. **Key `sat.bomb_telegraph`:** xóa nhầm cùng nhóm bomb = M6 giant render gọi
   `I18N.t` key thiếu → hiện key thô trên khung giả. GIỮ (hoặc rename có chủ đích).
5. **Save/version cũ:** `G.bombWave`/`G.motherWave` không persist vào save (chỉ runtime `G`)
   → không cần migration. (Đã kiểm tra: `save-versioning.test.js` không đụng các field này.)

### Phần quái mới
6. **Race cướp gem với M9 vacuum / magnet / gem timeout:** `G.gems.splice` từ nhiều nơi
   trong 1 frame. Spec: steal LUÔN qua `indexOf` + guard `idx >= 0`; không cache index
   qua frame; không cache object gem (nó có thể đã bị splice).
7. **Snatcher chết bởi nguồn gián tiếp** (say-nắng M7 quái cắn, ebullet, vacuum nuốt):
   logic scatter gem đặt trong `onDeath`/death-path chung của entity (kèm `m.carried`),
   KHÔNG đặt trong kill-credit của player → không bao giờ nuốt gem.
8. **Snatcher ôm gem khi wave kết thúc / game over / restart:** `resetGame()` đã clear
   `G.gems`; `m.escaped/m.dead` không cộng điểm — đảm bảo `escaped=true` thì `gems: 40`
   payout cũng bị skip (chỉ trả payout khi `killed` thật).
9. **Gem bị cướp có `v` đã nhân modifier** (vp1 gemMul, golden...): `m.carried` lưu `v`
   gốc từng viên; scatter trả đúng `v` → không dup/khấu hao giá trị.
10. **Hiệu năng:** tìm gem gần nhất O(#gems) mỗi frame; `maxPerWave: 1` + debut wave 6
    → tối đa ~2-3 snatcher/run, không đáng kể. Không dùng `SatManager.list()` (alloc).

---

## 5. Acceptance criteria ĐỊNH LƯỢNG (cho QA)

### 5.1. Phần xóa (static — chạy bằng grep/script, 0 code tay)
- [ ] `grep -rnE "role === \"(nest|bomb|mother|chick)\"|\"(nest|bomb|mother|chick)\"" js/game/`
      → 0 kết quả (ngoại trừ string `"bomber"` của quái thường nếu regex chạm — dùng
      word-boundary chính xác).
- [ ] `grep -rn "updateNests\|updateBombs\|updateMothers\|updateChicks\|maybeTriggerNest\|maybeTriggerBomb\|maybeTriggerMother\|onNestClose\|onBombClose\|onMotherClose\|onChickClose\|motherChickCount\|bombWave\|motherWave\|explodeBomb\|layChick\|enrageChicks" js/game/ js/i18n.js`
      → 0 kết quả.
- [ ] `grep -c "satSpawnPoint" js/game/05-chainpopups.js` ≥ 7 (định nghĩa + 6 caller M6/M7/M10/M9);
      `grep -rn "nestSpawnPoint" js/` → 0.
- [ ] `js/i18n.js`: 42 dòng key `sat.(nest|bomb|mother|chick)_*` đã xóa (5+5+11 × 2 locale);
      `sat.bomb_telegraph` còn (2 dòng vi+en).
- [ ] `node scripts/build-game.js` rebuild `js/game.js` thành công; bundle mới không chứa
      các symbol đã xóa (grep tương tự trên `js/game.js`).

### 5.2. Phần xóa (tests)
- [ ] `tests/m5m10-websim.test.js` đã viết lại: suites M6/M7/M9/M10 pass 100%,
      không còn describe/it nào nhắc M1/M5/M8.
- [ ] `tests/gc-churn.test.js` pass (không còn assertion `motherChickCount`).
- [ ] Full suite `node --test tests/`: **100% pass, 0 fail** (baseline hiện tại giữ nguyên
      số lượng test ngoài phần viết lại; tối thiểu không giảm test count của các file khác).

### 5.3. Phần quái mới
- [ ] Tối thiểu **8 unit test mới** (file `tests/snatcher.test.js` hoặc mở rộng
      `tests/game-logic.test.js`), tất cả pass:
      1. Registry entry hợp lệ (đủ field schema §3.2).
      2. `spawnWeights(5)` không chứa `snatcher`; `spawnWeights(6)` chứa.
      3. Steal: gem rời `G.gems`, `m.carried.length` tăng, `v` giữ nguyên.
      4. Đủ 3 gem → `phase="flee"`.
      5. Chạm viền khi flee → `escaped`, gem mất, không cộng điểm.
      6. Chết khi đang ôm 2 gem → đúng 2 gem scatter về `G.gems` với `v` gốc.
      7. Va chạm tàu không trừ HP (`dmg: 0`).
      8. `maxPerWave: 1` được tôn trọng trong `buildSpawnQueue`.
- [ ] `tests/i18n-coverage.test.js` pass với 5 key mới trong `STRINGS` (vi+en đủ cặp).
- [ ] Sim 30 wave (websim như `m5m10-websim.test.js`): snatcher xuất hiện từ wave 6+,
      hoàn thành ≥1 vòng steal→flee→escape và ≥1 vòng steal→kill→scatter, 0 exception,
      0 console.error.

### 5.4. QA tay (headless/real, checklist cho agent-qa)
- [ ] Chơi wave 6+: thấy "TRỘM VẶT CHẠY LÀNG" debut, hành vi đúng §3.2.
- [ ] Khoảnh khắc cười xác nhận: float "CƯỚP ĐÂY! 😈" → rượt đuổi → "ĐÒI LẠI ĐƯỢC! 💎"/"MẤT GEM RỒI! 😭".
- [ ] Không còn banner/text nào của M1/M5/M8 trong suốt run 15 wave.
- [ ] SFX `slurp`/`boing` đúng ngữ cảnh, không creepy; game không giật khi snatcher active.

---

## 6. Ghi chú bàn giao cho dev (agent-dev)

1. Thứ tự xóa an toàn: `05-chainpopups.js` (hàm) → `04-satellite.js` → `12/15/16` (caller)
   → `js/i18n.js` (keys) → tests → rebuild `js/game.js` → (optional, cần ngoại lệ) `satellite.html`.
2. `nestSpawnPoint` → rename `satSpawnPoint` TRƯỚC khi xóa các hàm M1/M5/M8 dùng nó,
   tránh broken intermediate state.
3. Quái mới implement trong `js/monsters.js`: registry + `BEHAVIORS.snatch` + `STRINGS`
   (vi/en) + `SPAWN_SUGGEST`. Không thêm key vào `js/i18n.js`.
4. Tuyệt đối không đụng: `bomber`/`broodmother` (quái thường), icon `i-bomb`,
   `sat.bomb_telegraph` (M6 đang dùng), `js/game.js` (rebuild), 4 file cấm.
5. Ước lượng: xóa ~450 dòng (05) + ~120 dòng (04) + 42 dòng i18n + ~120 dòng test viết lại;
   thêm ~150 dòng quái mới + ~120 dòng test mới. Tổng diff ròng ≈ −600 dòng.
