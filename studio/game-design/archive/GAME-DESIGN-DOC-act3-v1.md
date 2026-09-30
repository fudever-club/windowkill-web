# WINDOWKILL Web Edition — Game Design Doc: Hệ thống Stage / Monster mở rộng

> **Phiên bản:** 2.0 (data-driven) · **Ngày:** 2026-10-01 · **Tác giả:** Gameplay Programmer, FU-DEVER Game Studio
> **Phạm vi:** `js/game.js` (arena engine). Không đụng `index.html`, `game.html`, `js/menu.js`, `js/api.js`, `server/`, `tests/`.

---

## 1. Triết lý: "Drop spec vào là chạy"

Toàn bộ nội dung gameplay (quái, act, độ khó) sống trong **2 bảng dữ liệu thuần** ở đầu `js/game.js`:

- `MONSTER_REGISTRY` — mọi loại quái.
- `ACTS` — 3 Act (stage), mỗi Act có palette, nhạc, pool quái, boss variant riêng.

Game loop **không** chứa `if (type === "...")` cho từng quái nữa. Nó chỉ làm 3 việc:

1. Tra registry: `def = MONSTER_REGISTRY[e.type]`
2. Gọi strategy: `BEHAVIORS[e.behavior].update(e, dt, ship, spd)`
3. Vẽ: nhánh render theo `e.type` (chỉ là hình vẽ, không phải logic)

**Thêm quái mới = thêm 1 entry vào registry. Không sửa game loop.**

---

## 2. MONSTER_REGISTRY — schema

```js
MONSTER_REGISTRY = {
  "<id>": {
    id:        "<id>",            // string, trùng key (giữ quote để test nhận diện)
    name:      "Tên hiển thị",    // tiếng Việt, dùng cho banner/float tương lai
    behavior:  "<strategy>",      // key trong BEHAVIORS (xem §3)
    color:     "#rrggbb",         // màu chủ đạo khi vẽ
    r:         12,               // bán kính va chạm (px)
    dmg:       1,                // sát thương chạm vào tàu (0 = không gây dmg, vd healer)
    score:     10,               // điểm cơ bản khi hạ
    xp:        1,                // số gem XP rơi ra
    minWave:   1,                // wave đầu tiên được phép spawn
    weight:    100,              // trọng số trong pool spawn (0 = không spawn tự nhiên)
    acts:      [1, 2, 3],        // các Act được phép xuất hiện
    hp:   w => 2 + w * 0.5,      // HP theo wave toàn cục w
    spd:  w => 95 + w * 7,       // tốc độ theo wave toàn cục w
    init: e => { … },            // (optional) khởi tạo field riêng, vd dasher.state
    onDeath: e => { … },         // (optional) hiệu ứng khi chết, vd splitter đẻ mini
    desc: "Mô tả cho team design",
  },
}
```

### 2.1. Bảng 10 quái hiện tại

| # | id | Tên | Behavior | HP(w) | SPD(w) | Điểm | Mở từ | Act | Ghi chú |
|---|----|-----|----------|-------|--------|------|-------|-----|---------|
| 1 | `chaser` | Truy Đuổi | chase | 2+0.5w | 95+7w | 10 | w1 | 1,2,3 | Lao thẳng vào tàu, hơi lượn sóng |
| 2 | `chewer` | Gặm Viền | chew | 3+0.4w | 78+4w | 25 | w2 | 1,2,3 | **Signature:** bám viền → `shrinkWindow()` gặm nhỏ cửa sổ |
| 3 | `tank` | Xe Tăng | chase | 12+2.2w | 46 | 50 | w3 | 1,2,3 | Trâu, chậm, rớt 3 gem |
| 4 | `dasher` | Lao Tới | dash | 4+0.5w | 120+5w | 20 | w3 | 1,2,3 | stalk → aim (telegraph) → dash |
| 5 | `splitter` | Phân Thân | chase | 7+1w | 70+4w | 35 | w4 | 1,2,3 | Chết đẻ 2 `mini` (qua `onDeath`) |
| 6 | `mini` | Mini | chase | 1.5 | 150 | 8 | — | 1,2,3 | Chỉ sinh từ splitter (`weight: 0`) |
| 7 | `weaver` | Dệt Lưới | weave | 5+0.6w | 110+6w | 22 | w6 | 1,2,3 | **Mới:** zigzag biên độ lớn, khó ngắm |
| 8 | `spitter` | Phun Độc | spit | 6+0.7w | 85+4w | 30 | w8 | 2,3 | **Mới:** giữ khoảng cách ~320px, bắn đạn tầm xa vào tàu |
| 9 | `healer` | Hồi Phục | heal | 8+0.8w | 90+4w | 28 | w11 | 2,3 | **Mới:** tìm quái đồng minh mất máu, hồi 8% maxHP/0.5s; `dmg: 0` |
| 10 | `kamikaze` | Cảm Tử | kamikaze | 3+0.4w | 150+8w | 18 | w13 | 2,3 | **Mới:** lao tới viền gần nhất → kích ngòi 0.8s → **tự nổ, `shrinkWindow(20,16)`** |

---

## 3. BEHAVIORS — 7 strategy di chuyển/tấn công

`BEHAVIORS = { <tên>: { update(e, dt, ship, spd) } }`. Mỗi strategy là 1 hàm thuần, nhận entity `e` đã có sẵn `e.t, e.flash, e.slowT, e.kbx/kby`.

| Strategy | Hành vi | Dùng cho |
|----------|---------|----------|
| `chase` | Tìm tàu + lượn sóng nhẹ (`sin(t*6)*12`) | chaser, tank, splitter, mini |
| `chew` | Tìm điểm viền gần nhất → bám (`latched`) → mỗi `DIFF.chew` giây gọi `shrinkWindow(14,0/0,14)` | chewer |
| `dash` | Máy trạng thái `stalk → aim (telegraph 0.7s) → dash (×4.2 tốc, 0.45s)` | dasher |
| `weave` | Như chase nhưng zigzag mạnh (`sin(t*7)*110` vuông góc) | weaver |
| `spit` | Giữ cự ly ~320px + strafe vòng tròn; mỗi 2.4s bắn 1 viên đạn địch (230px/s, `life 5s`) về phía tàu nếu trong 560px | spitter |
| `heal` | Quét quái đồng minh (`hp < maxHp`, trừ healer khác) gần nhất → áp sát 90px → hồi 8% maxHP mỗi 0.5s (kèm particle xanh); không có mục tiêu thì giữ khoảng cách với tàu | healer |
| `kamikaze` | Bay tới điểm viền gần nhất; cách < 46px → `fuse = 0.8s` (nhấp nháy, báo "SẮP NỔ!") → `detonateKamikaze()`: `shrinkWindow(20,16)` + nổ lan 130px gây 1 dmg lên tàu | kamikaze |

> Muốn behavior hoàn toàn mới (vd quái dịch chuyển tức thời)? Thêm 1 entry vào `BEHAVIORS` rồi trỏ `behavior: "<tên mới>"` trong registry. Game loop không đổi.

---

## 4. ACTS — 3 Act

```js
ACTS = [
  { id: 1, name: "NEON GRID",  waves: [1, 10],       hpMul: 1.0,  spMul: 1.0,  scoreMul: 1.0,
    palette: { bg0:"#0b1e3a", bg1:"#04080f", grid:"#ffffff08",   edge:"rgba(255,110,196,0.28)" },
    music: "act1", sub: "…",
    boss: { name:"GÃ GẶM KHỔNG LỒ", color:"#8b2fc9", hpMul:1.0, shot:"ring",   slam:26 } },
  { id: 2, name: "DEEP VOID",  waves: [11, 20],      hpMul: 1.35, spMul: 1.08, scoreMul: 1.25,
    palette: { bg0:"#160b33", bg1:"#05030d", grid:"#b26bff10",   edge:"rgba(178,107,255,0.35)" },
    music: "act2",
    boss: { name:"VOID REAPER",      color:"#5b21b6", hpMul:1.6, shot:"aimed",  slam:32 } },
  { id: 3, name:"CORE BREACH", waves: [21, Infinity],hpMul: 1.8,  spMul: 1.15, scoreMul: 1.6,
    palette: { bg0:"#331016", bg1:"#0d0505", grid:"#ff547010",   edge:"rgba(255,84,112,0.40)" },
    music: "act3",
    boss: { name:"CORE TYRANT",      color:"#b91c1c", hpMul:2.3, shot:"spiral", slam:38 } },
];
```

- **Chuyển Act:** `actOf(w) = w<=10 ? 1 : w<=20 ? 2 : 3`. Khi `startWave()` phát hiện Act đổi → banner `ACT 2 — DEEP VOID` + đổi nhạc nền + đổi palette (render đọc `ACTS[G.act-1].palette` mỗi frame).
- **Nhạc theo Act** (`js/audio.js`, thêm `TRACKS`): `act1` 165ms/step (giữ nguyên bản cũ), `act2` 148ms + bass trầm hơn, `act3` 130ms + bass dồn dập. Tương thích ngược: `startMusic("game")` → track act1.
- **Boss mỗi 5 wave** (giữ nguyên luật): wave 5/10 → GÃ GẶM (ring shot), 15/20 → VOID REAPER (aimed spread + gọi dasher), 25/30… → CORE TYRANT (spiral shot + nện nhanh hơn).

### Boss variant — schema

```js
boss: { name, color,             // hiển thị banner + boss bar
        hpMul,                  // nhân với HP boss cơ bản (130 + wave*14) * DIFF.hpMul
        shot: "ring"|"aimed"|"spiral",
        slam: 26,               // px cửa sổ bị nện mỗi lần slam
        adds: ["chewer","chewer"] } // quái gọi ra định kỳ
```

| shot | Mô tả |
|------|-------|
| `ring` | Vòng đạn tròn 10+wave/2 viên (bản cũ) |
| `aimed` | Chùm 7 viên xòe về phía tàu, tốc độ 240 |
| `spiral` | 18 viên xoắn ốc, góc xoay theo `boss.t` |

---

## 5. Công thức difficulty scaling

Với `w` = wave toàn cục, `a` = Act hiện tại, `D` = hệ số độ khó (`DIFFS`):

```
HP_quái    = registry.hp(w)  × D.hpMul × ACTS[a-1].hpMul
SPD_quái   = registry.spd(w) × D.spMul × ACTS[a-1].spMul
HP_boss    = (130 + w×14) × D.hpMul × boss.hpMul
Điểm_hạ    = round((def.score + combo×2) × ship.scoreMul × ACTS[a-1].scoreMul)
Tgian_spawn= max(0.22, 0.85 × D.spawnMul − w×0.05)   (giây/quái)
Số_quái    = round((4 + w×3) × (w==1 ? 0.7 : 1) × (a==1 ? 1 : a==2 ? 1.15 : 1.3))
XP_cần     = 5 + level×3                              (không đổi)
Ngòi_gặm   = D.chew giây                             (không đổi)
```

**Pool spawn wave `n`:** lọc registry theo `acts` chứa Act hiện tại **và** `minWave <= n` **và** `weight > 0`, rồi bốc weighted-random. Kết quả: Act 1 chỉ có quái cận chiến; Act 2+ mới có spitter/healer/kamikaze — độ khó tăng theo chiều sâu chiến thuật, không chỉ số.

---

## 6. Pickup mở rộng (data-driven)

```js
PICKUP_DEFS = {
  heart:     { w: 50, can: s => s.hp < s.maxHp, use: s => { s.hp = min(maxHp, hp+1); … } },
  shield:    { w: 35, use: s => s.shieldT = 6 },
  nuke:      { w: 15, use: () => nukeBlast() },
  magnet:    { w: 22, use: s => s.magnetT = 8 },      // MỚI: hút toàn bộ gem 8s
  overdrive: { w: 18, use: s => s.overdriveT = 8 },   // MỚI: tốc bắn ×1.8 trong 8s
};
```

- Tỉ lệ rớt tổng 10% (giữ nguyên cảm giác bản cũ), chia theo trọng số `w`.
- Pickup mới **vẽ bằng hình canvas** (nam châm đỏ/trắng, tia sét vàng) — không thêm emoji mới vào canvas.
- HUD hiện timer `HÚT …s` / `OD …s` khi hiệu lực.

---

## 7. BroadcastChannel — thay đổi payload (cho lead/QA)

`game.html` → launcher (`menu.js`) qua `BroadcastChannel("windowkill_bus")`:

```js
// trước:
{ type:"gameover", profileId, score, wave, kills, time, timeSec, diff, reason }
// sau (v2.0): THÊM field `act`
{ type:"gameover", profileId, score, wave, act, kills, time, timeSec, diff, reason }
```

- `menu.js` **không cần sửa**: handler chỉ đọc các field cũ, field thừa bị bỏ qua; `Backend.syncScore()` dựng object mới nên không lan ra server.
- Đề xuất (chưa làm): launcher hiển thị "Act đạt được" trong thống kê — team launcher quyết định.

---

## 8. Cookbook cho team design

### 8.1. Thêm 1 quái mới (không sửa logic)

```js
// 1. Viết behavior (nếu chưa có) — hoặc tái dùng strategy có sẵn:
BEHAVIORS.blink = { update(e, dt, s, spd) {
  e.blinkT -= dt;
  if (e.blinkT <= 0) { e.blinkT = 3; e.x = s.x + rand(-260, 260); e.y = s.y + rand(-260, 260); }
  // rồi chase thường:
  BEHAVIORS.chase.update(e, dt, s, spd);
}};
// 2. Thêm 1 entry registry — XONG, quái sẽ tự spawn theo pool:
"stalker": { id:"stalker", name:"Rình Rập", behavior:"blink",
  color:"#9df3ff", r:11, dmg:1, score:40, xp:3,
  minWave:16, weight:25, acts:[2,3],
  hp: w => 6 + w*0.6, spd: w => 100 + w*5,
  init: e => { e.blinkT = 2; },
  desc:"Dịch chuyển tức thời quanh tàu mỗi 3s." },
// 3. (optional) Thêm nhánh vẽ trong render() theo e.type — nếu không,
```

...render fallback sẽ vẽ hình tròn màu `def.color` nên game vẫn chạy được ngay.

### 8.2. Thêm Act 4

```js
ACTS.push({ id:4, name:"TÊN ACT", waves:[31, Infinity],
  hpMul:2.4, spMul:1.2, scoreMul:2.0,
  palette:{ bg0:"#…", bg1:"#…", grid:"#…", edge:"…" },
  music:"act3", sub:"Mô tả…",
  boss:{ name:"TÊN BOSS", color:"#…", hpMul:3.0, shot:"spiral", slam:44 } });
// + sửa actOf(): w<=10?1 : w<=20?2 : w<=30?3 : 4
// + thêm quái acts:[…,4] nếu muốn pool riêng.
```

### 8.3. Thêm pickup mới

Thêm entry vào `PICKUP_DEFS` (`w`, `use`), thêm nhánh vẽ shape trong `render()` — tỉ lệ rớt tự cân theo trọng số.

---

## 9. Quy tắc hiệu năng (giữ 60fps)

1. **Zero-alloc trong loop nóng:** tái dùng mảng `G.bullets/ebullets/enemies/gems/pickups/parts/floats`; `burst()`/`addFloat()` là nơi duy nhất tạo object, và chỉ khi có sự kiện.
2. **Không closure mới mỗi frame:** `BEHAVIORS.*.update` là hàm static, tra 1 lần qua `e.behavior`.
3. **Healer quét đồng minh** là vòng O(n) duy nhất thêm vào — số healer cùng lúc nhỏ (<6), chấp nhận được.
4. **Render:** palette tra 1 lần/frame (`ACTS[G.act-1].palette`); không tạo gradient mới ngoài 2 gradient đã có.
5. Không emoji mới trong canvas; text float dùng font hệ thống có sẵn.

---

## 10. Checklist QA (cho lead)

- [ ] Wave 1–10: chỉ quái melee, nhạc tempo 165, nền xanh neon.
- [ ] Wave 11: banner `ACT 2 — DEEP VOID`, nhạc nhanh hơn, nền tím; spitter xuất hiện (wave 8+… kiểm tra wave 11+).
- [ ] Wave 21: banner `ACT 3 — CORE BREACH`, nền đỏ, nhạc dồn dập.
- [ ] Boss wave 5/10/15/20/25: đúng tên + màu + kiểu đạn theo Act.
- [ ] Kamikaze nổ → cửa sổ co lại đúng 20×16 (hoặc đấu trường ảo).
- [ ] Healer hồi máu quái khác (thấy particle xanh, HP bar quái tăng).
- [ ] Pickup magnet: mọi gem bay về tàu 8s. Overdrive: tốc bắn tăng rõ.
- [ ] Wave-clear banner có tên Act. Game over → launcher vẫn lưu kỷ lục (payload thêm `act` không vỡ).
- [ ] `node --check js/game.js` + `node --test tests/smoke.test.js` xanh.
- [ ] FPS: wave 25+, >40 entity cùng lúc, không drop dưới 55fps (Chrome DevTools).
