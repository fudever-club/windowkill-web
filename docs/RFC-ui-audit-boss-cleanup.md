# RFC — UI audit + Xóa campaign + Xóa boss glass-shard + Content mới

- **Trạng thái:** SPEC (agent-lead kiêm spec viết — xem §0; TUYỆT ĐỐI chưa viết code).
- **Nhánh:** `feat/ui-audit-boss-cleanup` (từ `dab5c4e`), worktree `~/workspace/windowkill-web-uiaudit`.
- **Phạm vi sửa cho phép:** `js/game/*.js` (module) + `index.html` + `js/menu.js` + `js/i18n.js` (xóa key chết) + `js/v2glue.js` + `js/campaign.js` + `js/stagefx.js` + `js/stageobj.js` + `js/stagemech.js` (xóa) + `tests/*.test.js` + rebuild bundle (`node scripts/build-game.js && node scripts/build-game.js --check && node scripts/bump-sw.js`).
  CẤM: sửa tay `js/game.js` (rebuild), merge main, push itch.io, live browser.
- **Quyết định CEO đã chốt:** (1) bỏ campaign frame (unlock/select ải); (2) bỏ boss glass-shard; (3) KHÔNG tự merge/push.
- **Cần CEO chốt (§5):** chọn 1 trong 3 candidate content mới (team đề xuất "MƯA VỆ TINH").

## 0. Team alignment (họp lead + spec + dev + qa — ghi nhận)

1. **Role fallback:** session này ở depth 2/2, không spawn được subagent. agent-lead
   (tôi) kiêm vai agent-spec để ra RFC này — KHÔNG viết/chỉnh code, chỉ docs.
   agent-dev / agent-qa / agent-eval do chief spawn tiếp theo pipeline framework.
2. **Đã align:** thứ tự ưu tiên trong PR này — (a) xóa campaign trước (vì nó chạm
   nhiều file nhất, tránh conflict), (b) xóa boss glass-shard, (c) fix issue UI P0/P1,
   (d) content mới (sau khi CEO chốt candidate).
3. **Đã align:** nguyên tắc xóa triệt để theo `docs/RFC-nest-removal.md` — mỗi mục xóa
   có checklist grep-verifiable, phân biệt rõ GIỮ vs XÓA (đặc biệt: `addCrack`/`G.cracks`
   render GIỮ vì M4 debris còn dùng; particle shard của juice GIỮ vì dùng chung mọi
   quái chết; chỉ xóa mechanic M2 bossfrag).
4. **Đã align:** Boss Rush sau khi bỏ campaign → mở luôn (không gate), endless là mode
   mặc định (nút CHƠI NGAY vào thẳng endless). Chi tiết §3.
5. **Blocker cần chief/CEO:** chỉ 1 — chốt candidate content mới (§5). Không có blocker
   kỹ thuật nào khác; mọi dependency đã map xong.

## 1. Architectural overview

### 1.1. Menu → game flow (sau khi bỏ campaign — target state)

```
index.html (launcher)
  ├─ CTA "CHƠI NGAY" ──► game.html?diff=&profile=...           (endless, mặc định)
  ├─ Panel "Chế độ chơi" (#v2-modes, tĩnh trong HTML)
  │    ├─ [Chạy Deadline] ──► game.html?...&mode=timeattack
  │    └─ [Xếp Hình Sếp]  ──► game.html?...&mode=bossrush      (mở luôn, không gate)
  ├─ Hub: shop/ach/daily/stats/settings/howto (giữ nguyên)
  └─ profiles, difficulty, settings (giữ nguyên)

game.html
  js/v2glue.js boot(): chỉ đọc ?mode= (whitelist) — ?stage=/?daily=/?endless= BỎ
  js/game.js (bundle từ js/game/*.js)
  12-variety.js startWave(): V2.stageWave() XÓA → luôn endless comp (buildSpawnQueue)
  22-modes.js: Modes.init/tickTimer/drawHUD — mở rộng cho mode mới
```

### 1.2. Campaign wiring hiện tại (để xóa)

| Điểm chạm | File | Dùng gì của Campaign |
|---|---|---|
| Stage select panel + lock/unlock + stage card + badge | js/menu.js §2 (~L493-547) | `Campaign.STAGES/getUnlockedStage/getStageBest/hasStageBadge/setStageBadge` |
| Boss Rush guard (`unlocked < 2`) | js/menu.js L583-595 | `Campaign.getUnlockedStage` |
| Boot: `?stage=/?endless=/?daily=` + clamp về ải đã mở | js/v2glue.js L60-75 | `Campaign.getUnlockedStage` |
| Wave comp khi stageId 1-5 (wave 10 = boss module) | js/v2glue.js L237 `stageWave()`; js/game/12-variety.js L260-282 | `Campaign.getWaveComp/getStageMechanic/getStageRitual/getBossTaunt` |
| Run params (bossHpMult, telegraphMult...) | js/game/11-spawn.js L67; js/game/22-modes.js L183 | `Campaign.getRunParams` |
| Miniboss spec (mini_boss_1..5) | js/game/11-spawn.js L52 | `Campaign.getMinibossSpec` |
| Unlock ải khi hạ boss | js/v2glue.js L181 | `Campaign.onBossKill` |
| Stage FX/Mech/Obj per stage | js/game/12-variety.js L278-280; 15-ui.js L194-196; 16-update.js L57; v2glue.js L133/142 | `V2.stageId` 1-5 + `StageFX/StageMech/StageObj.begin` |
| BG palette theo ải | js/game/10-gamedata.js `bgStageSid()` | `V2.stageId` |
| Save: `wk_unlocked_stage_<pid>`, `wk_stage_best_<pid>`, `wk_unlocked_endless_<pid>`, `wk_stage_badges_<pid>` | js/campaign.js L522-560 | localStorage per profile |
| i18n `campaign.*` (39 keys), `stageobj.*` (17 keys) | js/i18n.js | banner/ritual/taunt/stage UI |

### 1.3. Boss glass-shard (M2 "boss vỡ kính") wiring — MỤC TIÊU XÓA §4

```
16-update.js (2 chỗ): G.boss.hp<=0 → killBoss() else bossSplitCheck(G.boss) [M2]
06-bossfrag.js (DELETE toàn file, 183 dòng):
  FRAG const, fragStep(), dropFragGems(), hurtBoss() [orphan — 0 caller],
  bossSplitCheck(): boss 66% HP → SatManager.request("fragment" ×3)
    → drift 2.5s → telegraph 0.9s → dive 420px/s → fragmentBite(): shrinkWindow(26px)
      + G.cracks.push (vết rạn) + sfx.crack
  killBoss() (16-update.js:93): dọn fragment còn lại khi boss chết ("cleanup")
04-satellite.js: ROLE_TB_TINT["fragment"] + drawSimContent nhánh "fragment"
js/i18n.js: sat.bossfrag_* (5 keys × 2 locale)
tests/boss-fragment.test.js
```

**Bằng chứng đây đúng là "boss spam mảnh kính":** banner `sat.bossfrag_spawn` =
"Boss đập vỡ cửa sổ! Bắn vỡ mảnh kính trước khi chúng đâm vào viền!" — mechanic duy
nhất gắn glass-shard với boss. (Đã loại trừ: Cinema.bossIntro chỉ có portal sparkles,
không shard; boss death ring-shatter là celebration 1s, không spam; juice SHAPE_SHARD
là particle chung mọi quái chết — GIỮ.)

---

## 2. PART (i) — UI AUDIT: danh sách issue

### P0 (sai/hỏng — dev BẮT BUỘC fix)

| # | Issue | Vị trí | Chi tiết |
|---|---|---|---|
| UI-01 | Text thô `svgIcon("i-grad")` hiện ra UI | `js/menu.js:632` | Trong `showTutModal()`: `<h3>svgIcon("i-grad") ${...}</h3>` — gọi hàm bị viết
dạng text literal (thiếu `${}`), modal "Học chơi trong 2 phút?" hiện chữ thô `svgIcon("i-grad")`. Dòng 652 viết đúng (`svgIcon("i-grad") + \`...\``) để đối chiếu. Fix: `${svgIcon("i-grad")}`. |
| UI-02 | Thẻ `<footer>` mở 2 lần, đóng 1 lần | `index.html:454` | `<footer>  <footer>` … `</footer>` — 1 footer không bao giờ đóng (parser tự
đóng ở cuối body, không vỡ render nhưng sai HTML, rủi ro a11y/CSS selector `footer`). Fix: xóa 1 thẻ mở. |

### P1 (sai sau khi bỏ campaign / trải nghiệm kém — dev BẮT BUỘC fix)

| # | Issue | Vị trí | Chi tiết |
|---|---|---|---|
| UI-03 | `menu.mode.locked_hint` thành sai sau khi bỏ campaign | `js/menu.js:569` (+en), `#v2-mode-hint` (index.html) | Text "Phá đảo ải 1 để mở Xếp Hình Sếp" — không còn ải. Spec §3: mở Boss Rush
luôn → XÓA key + XÓA logic disable `brBtn` (menu.js L583-595) + ẩn/xóa `#v2-mode-hint` khi không dùng. |
| UI-04 | Comment + logic "đặt panel mode ngay sau #v2-stages" thành dead | `js/menu.js` (~L577-582), `index.html:359-360` | Sau khi xóa #v2-stages, `insertBefore(modesPanel, stagesWrap.nextSibling)` no-op.
Dọn: xóa block di chuyển, panel mode giữ nguyên vị trí tĩnh trong HTML. |
| UI-05 | Deep-link `?stage=N` (bookmark/share cũ) | `js/v2glue.js` boot | Sau khi bỏ: game PHẢI bỏ qua param, vào endless, không crash/kẹt. Spec §3.3. |
| UI-06 | Nút mode/stage `min-width:148px` trên màn 320px | index.html `#v2-modes .row` | 2 nút 148px + gap 8px = 304px — vừa khít 320px nhưng khi thêm mode thứ 3
(content mới) sẽ tràn. Fix: chuyển sang `flex:1 1 140px` để co giãn (P1 vì liên quan content mới). |

### P2 (polish — làm nếu effort nhỏ)

| # | Issue | Vị trí | Ghi chú |
|---|---|---|---|
| UI-07 | Canvas HUD font 11px khó đọc trên mobile | `js/game/17-render.js:618` (`11px sans-serif`), các chỗ `13px` | Tăng tối thiểu 12-13px cho text HUD quan trọng; effort nhỏ. |
| UI-08 | `#v2-mode-hint` (12.5px, #8fb0d8) tương phản vừa | index.html | Nếu giữ element cho mục đích khác thì tăng contrast; nếu không → xóa (gộp UI-03). |
| UI-09 | `index.html` còn comment "menu.js di chuyển panel này xuống ngay sau #v2-stages" | index.html:359-360 | Dọn comment chết (gộp UI-04). |
| UI-10 | `js/game/17-render.js:8` comment "TẮT ở endless/mode mới" | — | Sau refactor theme (§3.6) cập nhật comment cho đúng. |

**Kết quả kiểm tra i18n (static):** quét toàn bộ `I18N.t()/vt()/data-i18n` (296 keys tĩnh +
6 họ dynamic) đối chiếu 502 keys đã register → **0 key thiếu**. Không còn lỗi lớp PR #80.
Đề xuất QA thêm regression test quét `data-i18n` trong index.html/game.html (xem §7).

## 3. PART (ii) — SPEC XÓA CAMPAIGN

### 3.1. Quyết định scope (team đề xuất — CEO đã chốt "bỏ luôn khung campaign")

**XÓA TRIỆT ĐỂ:** toàn bộ progression frame + stage content không còn lối vào:
- UI: panel #v2-stages, lock/unlock, stage card, badge, guard Boss Rush cũ.
- Data/logic: `js/campaign.js`, `js/stagefx.js`, `js/stageobj.js`, `js/stagemech.js` (xóa file).
- Save: 4 họ key campaign (cleanup, không migration).
- i18n: `campaign.*` (39×2), `stageobj.*` (17×2) — xác nhận 0 reference sau xóa bằng grep.
- Param: `?stage=/?daily=/?endless=`.

**GIỮ / TÁI DỤNG:**
- Endless comp (`buildSpawnQueue`) thành pipeline duy nhất — code đã là fallback sẵn
  (12-variety.js:283+), chỉ cần xóa nhánh campaign.
- 5 miniboss defs → migrate vào `js/monsters.js` registry (loại quái, debut wave 5/10/15/20/25).
- Stage BG palettes (PR #79) → theme ngẫu nhiên mỗi run (§3.6), giữ giá trị art.
- Boss Rush / Time Attack giữ nguyên, bỏ dependency Campaign (defensive try/catch sẵn).
- Kỷ lục endless, profile, meta/shop/achievement/daily, tutorial: KHÔNG đụng.

**Không chọn "frame-only"** (giữ campaign.js làm data service): stage content không còn lối
vào = code chết 1000+ dòng, trái ý "gọn" của CEO.

### 3.2. Checklist XÓA file

| File | Xử lý |
|---|---|
| `js/campaign.js` (720 dòng) | **DELETE** |
| `js/stagefx.js` (544 dòng) | **DELETE** |
| `js/stageobj.js` (225 dòng) | **DELETE** |
| `js/stagemech.js` (290 dòng) | **DELETE** |
| `index.html` | Xóa 4 thẻ `<script src="js/campaign.js|stagefx.js|stageobj.js|stagemech.js">`; fix UI-02/UI-04/UI-09 |
| `game.html` | Xóa 4 thẻ script tương ứng (L364, 367-369) |
| `tests/campaign-logic.test.js` | **DELETE** |
| `tests/stage-mechanics.test.js` | **DELETE** |
| `tests/stage-bg-wiring.test.js` | Viết lại → test random-theme-per-run (§3.6) |
| `tests/miniboss-wave5.test.js` | Giữ, sửa import → miniboss từ monsters.js |
| `tests/new-modes.test.js` | Giữ, xóa mock Campaign (modes đã defensive) |
| `tests/m5m10-websim.test.js`, `tests/stage-objectives.test.js`, `tests/stage-ritual.test.js` | Kiểm tra reference Campaign/StageObj → xóa phần chết |

### 3.3. Checklist SỬA file (từng điểm chạm)

**`js/menu.js`**
1. XÓA toàn bộ block "2. Stage select" (~L493-547): tạo `#v2-stages`, `paintStages()`,
   `STAGE_ACCENT`, `badgeRow`, `window.__wkRefreshV2 = paintStages` (kiểm tra không còn
   gán __wkRefreshV2 ở chỗ khác — nếu có, giữ cho profile refresh của phần khác).
2. XÓA block di chuyển panel mode (~L577-582, `insertBefore` sau `#v2-stages`).
3. XÓA Boss Rush guard (~L583-595): `Campaign.getUnlockedStage`, disable `brBtn`,
   `#v2-mode-hint` logic. XÓA key `menu.mode.locked_hint` (vi+en) trong register block.
4. XÓA delegated listener "chọn ải → bỏ chọn mode" (~L616-622) và nhánh "chọn mode →
   bỏ chọn ải" (~L606-613, chỉ giữ phần toggle mode).
5. `v2sel`: `{ kind: "free" }` → `{ kind: null }` (null = endless mặc định);
   XÓA nhánh `q.set("stage",...)` và `q.set("daily",...)` trong `launchGame()`;
   `Analytics.track("game_start", { mode: v2sel.kind })` → mode ∈ {null,"mode"}.
6. `stName()` helper (L442) chỉ dùng cho stage → XÓA.

**`js/v2glue.js`**
1. `boot()`: XÓA parse `?stage=/?endless=/?daily=` + clamp `getUnlockedStage`.
   GIỮ `?mode=` whitelist (mở rộng khi thêm mode mới, §5).
   `V2.stageId` → hằng `0` (giữ field để code cũ đọc không vỡ, đánh dấu deprecated).
2. XÓA `stageWave()` (L~230-250, nhánh `Campaign.getWaveComp`) — startWave trong
   12-variety.js sẽ không còn gọi.
3. XÓA trong `onBossKill`: `Campaign.onBossKill(self.stageId)` (L181) — không còn unlock.
4. `V2.stageFxEnter/stageRitualEnter` nếu chỉ phục vụ stage → XÓA; giữ guard
   `if (V2.stageId && ...)` ở L133/142 trở thành no-op (xóa luôn cho gọn).

**`js/game/12-variety.js`** — XÓA block `if (window.V2) { const sv = V2.stageWave(n); ... }`
(L260-282): `V2.startStageBoss`, `G.spawnQueue = sv.queue`, `V2.stageFxEnter()`,
`stageRitualEnter`, banner `campaign.wave`, `StageObj.begin`, `StageMech.begin`.
Endless path phía dưới (`n % 5 === 0 → spawnBoss()`, `buildSpawnQueue(n)`) thành duy nhất.

**`js/game/11-spawn.js`**
1. L51-52: `Campaign.getMinibossSpec(type)` → tra `MONSTER_REGISTRY` (miniboss đã migrate
   sang `js/monsters.js`, §3.5).
2. L67-68: `Campaign.getRunParams(V2.diffKey)` → dùng `DIFF` hiện có (kiểm tra DIFF đã có
   bossHpMult/telegraphMult/monsterSpeedMult; nếu chưa, inline hằng từ tuning).

**`js/game/15-ui.js`** — XÓA `StageObj.begin` (L194), `StageMech.begin` (L196),
`StageFX.exit()` trong `resetGame()` (L~190). Giữ `G.cracks = []` (M4 còn dùng).

**`js/game/16-update.js`** — XÓA L57 (`V2.stageId === 5 && StageFX.activeId === "shrink"`).

**`js/game/17-render.js`** — `themeTint()` (L48) + `drawThemeBorder()` (L76): đổi nguồn
`st` từ `V2.stageId` sang `G.themeSid` (random mỗi run, §3.6); cập nhật comment L8.

**`js/game/10-gamedata.js`** — `bgStageSid()`: thay `V2.stageId` bằng `G.themeSid`
(fallback ACTS bgStage giữ nguyên khi themeSid invalid).

**`js/game/22-modes.js`** — `_startBoss()`: XÓA 2 block `Campaign.getRunParams` /
`Campaign.getStageMechanic(5)` (L183-191) → `diff = { bossHpMul: 1, telegraphMul: 1,
enemySpdMul: 1 }` + `boss5Timer` lấy từ hằng `BOSS5_COUNTDOWN_S = 20` (định nghĩa trong
file, khớp `campaign.boss_banner_sub_5` cũ "20 giây").

**`js/i18n.js`** — XÓA `campaign.*` (vi L566-606, en L867-...; tổng 39 keys × 2) và
`stageobj.*` (17 keys × 2 — xác nhận vị trí bằng grep `stageobj\.` trước khi xóa).
KHÔNG thêm key mới.

### 3.4. Save cleanup (không migration)

- 4 họ key theo profile: `wk_unlocked_stage_<pid>`, `wk_stage_best_<pid>`,
  `wk_unlocked_endless_<pid>`, `wk_stage_badges_<pid>`.
- Spec: thêm hàm `cleanupLegacyCampaignKeys()` trong `js/menu.js` (chạy 1 lần khi
  launcher boot): duyệt `localStorage`, xóa key khớp 4 prefix trên. Try/catch từng key.
- `wk_save_version` (meta.js): KHÔNG cần migration — version này quản lý meta/Xưởng,
  không chứa campaign progress (campaign dùng key riêng, không version).
- Kỷ lục endless: lưu ở key khác (`hs-list` render từ profile records — dev xác nhận
  bằng grep `wk_high\|highscore` không giao với 4 prefix trên; QA test §7.5).

### 3.5. Miniboss migration → `js/monsters.js`

5 defs (`mini_boss_1..5`, base: chewer/dasher/...) từ `Campaign.getMinibossSpec` chuyển
thành registry entries: `{ id, nameVi, role: "miniboss", hpAt, speedAt, ... }`,
debut wave 5/10/15/20/25. `11-spawn.js` tra registry thay vì Campaign.
(Chi tiết field do dev đối chiếu từ campaign.js L130+ trước khi xóa file.)

### 3.6. Stage theme → random theme mỗi run (giữ giá trị art PR #79)

- `resetGame()` (15-ui.js): `G.themeSid = 1 + Math.floor(Math.random() * 5)` —
  random 1-5 mỗi run (không lặp theme run trước nếu có thể, 1 dòng so sánh).
- `bgStageSid()` / `themeTint()` / `drawThemeBorder()` đọc `G.themeSid` thay vì
  `V2.stageId`. Reduced-motion: `drawThemeBorder` đã tôn trọng RM — giữ.
- Banner wave 1 (optional, P2): `setBanner("Chủ đề: " + themeName)` — dùng tên ải cũ
  (MÀN HÌNH XANH...) như flavor, KHÔNG unlock/select. (Cần CEO gật — mặc định làm.)

### 3.7. Quyết định mặc định (team đã align — ghi để dev làm đúng)

| Câu hỏi | Quyết định |
|---|---|
| Mode mặc định khi bấm CHƠI NGAY | Endless (không param) — tương đương "Chơi tự do" cũ nhưng không còn là "card" |
| Boss Rush unlock | Mở luôn, không gate (xóa UI-03) |
| `?stage=N` cũ | Bỏ qua, vào endless, không báo lỗi |
| Kỷ lục endless cũ | Giữ nguyên 100% |
| Stage themes | Random mỗi run (§3.6) |

## 4. PART (iii) — SPEC XÓA BOSS GLASS-SHARD (M2 "boss vỡ kính")

### 4.1. Chốt mục tiêu (đã xác minh — dev không cần tìm lại)

XÓA mechanic M2 trong `js/game/06-bossfrag.js`: boss còn 66% HP → split 3 mảnh kính
vệ tinh (`SatManager.request("fragment")`) → drift → telegraph → dive vào viền →
cắn 26px + vết rạn. Bằng chứng duy nhất khớp mô tả CEO "boss spam mảnh kính":
banner `sat.bossfrag_spawn` ("Boss đập vỡ cửa sổ!...").

### 4.2. Checklist XÓA (theo pattern RFC-nest-removal)

| # | File | Xử lý |
|---|---|---|
| 1 | `js/game/06-bossfrag.js` | **DELETE toàn file** (183 dòng). Đã xác minh: `hurtBoss()` 0 caller (orphan);
`SatManager.request("fragment")` chỉ 1 chỗ (L77); `fragStep/dropFragGems/FRAG` không dùng ngoài. |
| 2 | `js/game/16-update.js:85` | `if (G.boss.hp <= 0) killBoss(); else if (typeof bossSplitCheck === "function") bossSplitCheck(G.boss);` → `if (G.boss.hp <= 0) killBoss();` |
| 3 | `js/game/16-update.js:333` | Tương tự (nhánh nuke trúng boss) |
| 4 | `js/game/16-update.js:95-96` (`killBoss`) | Xóa loop dọn fragment (`sat.role === "fragment"` → `SatManager.kill(id,"cleanup")`) + comment M2 |
| 5 | `js/game/04-satellite.js` | Xóa entry `fragment` trong `ROLE_TB_TINT` + nhánh `s.role === "fragment"` trong `drawSimContent` (grep vị trí chính xác trước khi xóa) |
| 6 | `js/game/MANIFEST.txt` | Xóa dòng `06-bossfrag.js` |
| 7 | `js/i18n.js` | Xóa 5 keys × 2 locale: `sat.bossfrag_label/spawn/bite/break/catch` (vi L682-686, en L983-987) |
| 8 | `tests/boss-fragment.test.js` | **DELETE** (toàn bộ test cho mechanic đã xóa) |

### 4.3. GIỮ LẠI — phân biệt quan trọng (dễ xóa nhầm)

| Thứ | Lý do giữ |
|---|---|
| `addCrack/updateCracks/drawCracks` (05-chainpopups.js) + call sites (16-update.js:172, 17-render.js:158) + `G.cracks = []` reset (15-ui.js:202) | M4 debris impact (05-chainpopups.js:150) còn dùng |
| `AudioEngine.sfx.crack()` | `addCrack` dùng |
| `shrinkWindow/growWindow` | core "cửa sổ = máu", nhiều caller |
| Juice `SHAPE_SHARD` + `Juice.burst("boss")` 24 shard + `Cinema.bossRingShatter` | particle/celebration chung, không phải mechanic M2 |
| `G.shake`, banner, `AudioEngine.sfx.boss()` | dùng chung |

### 4.4. SFX/telemetry/i18n liên quan — kết luận sau kiểm tra

- SFX: `boss()` + `crack()` trong `bossSplitCheck`/`fragmentBite` đi theo file bị xóa;
  không còn reference sau xóa (grep `bossSplitCheck\|fragmentBite` → 0).
- Telemetry: đã grep `js/game/20-telemetry.js` + `js/analytics.js` — **0 event** cho
  bossfrag → không cần sửa.
- i18n: chỉ 5 keys §4.2 — sau xóa, `I18N.t("sat.bossfrag_...")` còn 0 caller.

---

## 5. PART (iv) — ĐỀ XUẤT CONTENT MỚI (CEO chốt 1)

Bối cảnh: hết campaign → content sống ở **mode** (panel #v2-modes) + quái. Triết lý:
variety > difficulty; khoảnh khắc CƯỜI/WOW; nhạc/SFX vui nhộn nhịp nhanh, không creepy.

### 5.1. Ba candidate

**M1 — "MƯA VỆ TINH" (Satellite Storm)** · mode endless-variant · ⭐ team đề xuất
- Luật: tần suất chain-popup ×3 (`maybeTrigger*` weights), `MAX_SATS` 3→5, satellite
  sim-fallback ưu tiên (tránh ngợp popup thật).
- Vì sao vui: mỗi popup là 1 gag có sẵn (M6 một-thành-hai, M7 thất tình, M9 máy hút
  bụi, M10 gương thần) — comedy đến từ variety, không từ difficulty. Moment WOW:
  3-4 popup cùng lúc, màn hình "loạn mà vui".
- Effort: THẤP (~40 dòng: 1 flag `V2.mode === "satstorm"`, multiplier trong
  12-variety.js, MAX_SATS theo mode trong 04-satellite.js, i18n 6 keys, nút menu,
  `?mode=satstorm` whitelist).
- Rủi ro: rối mắt nếu quá dày → cap: tối đa 1 trigger/8s, tôn trọng reduced-motion
  (giảm ×0.3 như juice).

**M2 — "CHỢ GEM ĐIÊN" (Gem Frenzy)** · mode timed 150s
- Luật: gem drop ×3, magnet ×1.5, snatcher weight ×4 (trộm chạy đầy sân), hết giờ
  chốt điểm (tái dùng `Modes.timeUp` pattern).
- Vì sao vui: rượt trộm "CƯỚP ĐÂY! 😈" liên tục — slapstick. Score = gem nhặt.
- Effort: TRUNG BÌNH (~90 dòng: timer reuse, drop/magnet/snatcher multipliers,
  record key riêng `wk_gf_high_*`).
- Rủi ro: overlap cảm giác với Time Attack (cùng timed) → variety thấp hơn M1.

**M3 — "SẾP NỔI GIẬN" (Enraged Bosses)** · mode endless-variant
- Luật: boss mỗi 5 wave như endless, nhưng boss có 2 persona ngẫu nhiên cùng lúc
  (vẽ 2 flair, telegraph xen kẽ) — "sếp đa nhân cách".
- Vì sao vui: boss DJ vừa hô "QUẨY!" vừa hắt xì (sniffly) — visual gag.
- Effort: TRUNG BÌNH-CAO (~120 dòng: persona array, drawBossFlair ×2, telegraph
  merge; rủi ro visual rối).
- Rủi ro: đụng triết lý "không rối mắt" nếu làm ẩu.

### 5.2. Ma trận fun-per-effort

| | Fun (cười/WOW) | Variety | Effort | Rủi ro rối mắt | Tổng |
|---|---|---|---|---|---|
| M1 Mưa Vệ Tinh | ★★★★★ | ★★★★★ | Thấp | Thấp (có cap) | **CHỌN** |
| M2 Chợ Gem Điên | ★★★★ | ★★★ | Trung bình | Thấp | Dự bị |
| M3 Sếp Nổi Giận | ★★★ | ★★★ | Trung bình-cao | Trung bình | Loại |

**Team đề xuất M1.** Lý do: effort thấp nhất, variety cao nhất, tái dùng 100% gag đã
được CEO duyệt (M6/M7/M9/M10), không thêm quái/asset/SFX mới, đúng tinh thần
"bỏ cái rối, giữ cái vui". Nếu CEO muốn timed-mode thì M2 là dự bị hợp lý.

### 5.3. Spec sơ bộ M1 (đủ để dev ước lượng; chi tiết hóa sau khi CEO chốt)

- `?mode=satstorm` — whitelist thêm trong `js/v2glue.js` boot + `js/menu.js` MODE_IDS.
- `22-modes.js`: `Modes.init("satstorm")` → `V2o.satStorm = true`; `spawnScale()`-style
  helper `satRateMul()` → 3 (dùng trong `12-variety.js` `maybeTrigger*` — nhân weight
  hoặc giảm cooldown, chọn 1 cách duy nhất); `SatManager` MAX_SATS: đọc
  `V2.satStorm ? 5 : 3`.
- Cap chống rối: `G.lastSatTriggerT` — tối thiểu 8s giữa 2 trigger; reduced-motion →
  giữ nguyên số lượng ×0.3? Không — satellite là gameplay, không giảm; chỉ giảm
  particle (juice đã làm).
- i18n (register trong 22-modes.js, pattern F12): `mode.ss.name` "Mưa Vệ Tinh",
  `mode.ss.desc` "Popup náo loạn ×3 — gag nào cũng có!", `mode.ss.banner`,
  `mode.ss.hud` ("☔ ×3").
- Menu: nút thứ 3 trong #v2-modes (kèm fix UI-06 flex).
- SFX: tái dùng `pop/slurp/boing` — không thêm mới.
- Record: endless score như thường (không record riêng — mode là variant vui).

---

## 6. EDGE CASES / FAILURE MODES (≥5)

1. **Xóa `campaign.js` nhưng sót caller** → `ReferenceError` mỗi frame. Dev chạy checklist
   grep §7.1 xác nhận 0 trước khi rebuild; các file game bọc `typeof Campaign` defensive
   nhưng menu.js/v2glue.js gọi trực tiếp — xóa theo §3.3.
2. **Save cũ:** user có `wk_unlocked_stage_default=5` — cleanup chỉ xóa đúng 4 prefix;
   QA assert kỷ lục endless + profile + meta còn nguyên sau cleanup (§7.5).
3. **`?stage=3` bookmark cũ:** v2glue bỏ qua → endless. QA test: URL có param lạ không crash.
4. **`hurtBoss` orphan:** đã xác minh 0 caller — xóa cùng file, không cần giữ shim.
5. **M4 debris vs cracks:** `addCrack` GIỮ — QA regression: M4 impact vẫn vẽ vết nứt.
6. **Miniboss migration:** `getMinibossSpec` trả về def có `base` (chewer/dasher) —
   khi chuyển sang monsters.js registry phải giữ nguyên stat mapping, nếu không endless
   wave 5/10/15/20/25 mất miniboss. QA: sim 30 wave có miniboss.
7. **Random theme:** `G.themeSid` phải set trong `resetGame()` TRƯỚC `refreshBG()`
   (15-ui.js gọi refreshBG cuối resetGame — thứ tự đúng); `bossrush`/`timeattack`
   cũng được theme (không crash khi `BG.getTheme(st)` với st 1-5).
8. **Boss Rush `_startBoss`:** xóa `Campaign.getRunParams` → diff mặc định; boss_5
   countdown 20s phải giữ (hằng mới) nếu không boss 5 dễ hơn trước.
9. **i18n:** xóa `campaign.*` trong khi `12-variety.js` còn `I18N.t("campaign.wave")`
   → key thô trên banner. Thứ tự xóa: code trước, key sau; grep cuối §7.1.
10. **M1 satstorm + multi-window thật:** MAX_SATS 5 với popup thật có thể bị browser
    chặn popup → sim-fallback đã có trong SatManager (giữ nguyên logic fallback).

---

## 7. ACCEPTANCE CRITERIA (định lượng — cho QA/eval)

### 7.1. Xóa campaign (static — grep, 0 code tay)
- [ ] `grep -rniE "campaign" js/menu.js js/v2glue.js js/game/*.js index.html game.html` → 0
      (ngoại trừ comment lịch sử có chữ "campaign" — cho phép trong comment, không trong code).
- [ ] `grep -rn "StageFX\|StageObj\|StageMech\|stageWave\|getUnlockedStage\|getStageBest\|stageId" js/ index.html game.html` → 0 (ngoại trừ `V2.stageId = 0` deprecated + `G.themeSid`).
- [ ] `ls js/campaign.js js/stagefx.js js/stageobj.js js/stagemech.js` → không tồn tại.
- [ ] `grep -c "campaign\.\|stageobj\." js/i18n.js` → 0.
- [ ] Bundle rebuild: `js/game.js` không chứa `stageWave|getWaveComp|bossfrag` (grep).
- [ ] `?stage=`/`?daily=`/`?endless=` không còn trong `js/v2glue.js` + `js/menu.js`.

### 7.2. Xóa boss glass-shard (static)
- [ ] `grep -rniE "bossfrag|bossSplitCheck|fragmentBite|fragStep|\"fragment\"" js/ index.html game.html` → 0 (ngoại trừ `js/game.js` bundle cũ trước rebuild).
- [ ] `ls js/game/06-bossfrag.js` → không tồn tại; MANIFEST không liệt kê.
- [ ] `grep -c "sat.bossfrag" js/i18n.js` → 0.
- [ ] GIỮ: `addCrack` còn (grep ≥3: định nghĩa + M4 caller + update/draw), `G.cracks` reset còn.

### 7.3. UI issues
- [ ] UI-01: `grep -n 'svgIcon("i-grad")' js/menu.js` → chỉ còn dòng dùng đúng (`+` hoặc `${}`).
- [ ] UI-02: `grep -c "<footer>" index.html` → 1.
- [ ] UI-03/04: `menu.mode.locked_hint` không còn; `#v2-stages` không còn trong DOM sau load.
- [ ] UI-06: mode buttons dùng flex co giãn (không còn `min-width:148px` cứng).

### 7.4. Tests — `node --test tests/*.test.js` 100% pass, 0 fail
- [ ] Tối thiểu test mới/sửa:
  1. `tests/campaign-removal.test.js` (mới): assert `typeof Campaign === "undefined"`,
     v2glue boot bỏ qua `?stage=3` → endless, cleanup key xóa đúng 4 prefix và giữ key lạ.
  2. `tests/bossfrag-removal.test.js` (mới, thay boss-fragment.test.js): assert
     `typeof bossSplitCheck === "undefined"`, killBoss không reference fragment,
     M4 `addCrack` vẫn hoạt động (regression).
  3. `tests/miniboss-wave5.test.js`: sửa sang monsters.js registry, pass.
  4. `tests/new-modes.test.js`: pass không cần mock Campaign.
  5. `tests/stage-bg-wiring.test.js` → viết lại: `G.themeSid` 1-5 sau resetGame,
     `bgStageSid()` khớp theme.
  6. i18n regression (mở rộng `tests/launcher-ui.test.js` hoặc file mới): mọi
     `data-i18n` trong index.html/game.html đều có key registered (ngăn lặp lại lớp lỗi PR #80).
- [ ] Sim 30 wave endless: 0 exception, miniboss xuất hiện, boss mỗi 5 wave, 0 console.error.
- [ ] Sim boss fight: boss 66% HP KHÔNG split (không còn fragment), killBoss sạch.

### 7.5. QA tay (checklist, không live browser — chạy headless/local theo AGENTS.md nếu cần)
- [ ] Menu: không còn panel Chiến dịch; nút CHƠI NGAY vào endless; 2 mode (+1 nếu CEO chốt M1).
- [ ] Boss Rush bấm được ngay, không hint khóa.
- [ ] Kỷ lục endless cũ còn sau khi save cleanup.
- [ ] Modal tutorial (lần đầu): không còn chữ `svgIcon("i-grad")` thô.

---

## 8. GHI CHÚ BÀN GIAO CHO DEV (agent-dev)

1. **Thứ tự xóa an toàn:** (1) `js/menu.js` (UI frame) → (2) `js/v2glue.js` (param/boot) →
   (3) `js/game/*` (12-variety, 11-spawn, 15-ui, 16-update, 17-render, 10-gamedata, 22-modes,
   04-satellite) → (4) DELETE 4 file campaign/stage* + 06-bossfrag.js →
   (5) `js/i18n.js` (xóa key chết) → (6) `index.html`/`game.html` (script tags, footer) →
   (7) tests → (8) rebuild `node scripts/build-game.js && node scripts/build-game.js --check && node scripts/bump-sw.js` →
   (9) grep verify §7.1/7.2 → (10) `node --test tests/*.test.js`.
2. **Miniboss trước khi xóa campaign.js:** đọc defs từ file cũ, migrate sang
   `js/monsters.js` TRƯỚC khi DELETE (tránh mất data).
3. **i18n:** chỉ XÓA key, không thêm key mới vào `js/i18n.js` (key mode mới đi qua
   `I18N.register()` trong 22-modes.js theo pattern F12; sau register gọi lại
   `I18N.applyDOM()` — bài học PR #80).
4. **Tuyệt đối không đụng:** `bomber`/`broodmother` (quái thường), `addCrack`,
   juice SHAPE_SHARD, `Cinema.bossRingShatter`, endless records, profile, meta/Xưởng.
5. **Ước lượng diff:** xóa ~1780 dòng (4 file campaign/stage* + 06-bossfrag) + ~350 dòng
   rải rác + ~110 dòng i18n + ~200 dòng test cũ; thêm ~150 dòng (theme random, cleanup,
   M1 mode) + ~250 dòng test mới. Ròng ≈ **−2000 dòng**.
6. **Content mới (M1):** CHỜ CEO chốt — dev KHÔNG code M1 trong round này nếu chưa chốt;
   PR này = xóa + fix UI. M1 là PR tiếp theo (tránh nhồi).
