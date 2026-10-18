# RFC — Full Audit Round 2 (`feat/full-audit-round2`)

Team Lauren Tan · agent-spec · 2026-10-17 ~23:30 +07
Base: b0cec84 (merge PR #81). KHÔNG merge main, KHÔNG push itch.

## 0. Phạm vi & phương pháp

Quét lại toàn bộ sau PR #76–#81, 4 nhóm:

1. **UI audit**: `index.html`/`game.html` cân bằng thẻ (0 lỗi), CSS breakpoints
   480px/640px, rà text cứng 2 ngôn ngữ.
2. **i18n static**: script quét mọi literal `I18N.t("…")` + `data-i18n` trong HTML +
   helper `vt("…")` (menu.js:440) đối chiếu dict đã register — 309 key dùng /
   424 VI / 423 EN đã đăng ký. Key động (`"vp1.mod."+id`, `"boss.w30.taunt"+n`,
   `T(key,vi)` fallback juice2/upgrades2/meta/monsters) đã verify từng họ —
   đủ key, đúng thiết kế.
3. **Gameplay sanity**: luồng `?mode=timeattack|bossrush` (whitelist trong
   `js/v2glue.js`, sai → null → endless), `?stage=` bị bỏ qua → endless không
   crash, 5 boss defs tồn tại (`js/bosses.js`), endless dùng persona-boss riêng
   (không đụng `Bosses` module của Boss Rush).
4. **Dead code**: grep `campaign.js|stagefx|stagemech|stageobj|glass-shard|
   BossFrag` — chỉ còn comment provenance (không ref functional), `sync:"spikes"`
   là config dormant trong `bg.js` (không đọc ở đâu) → không động vào.

## 1. Issue list (severity · file:dòng · cách fix)

### P0 — hỏng, BẮT BUỘC fix

- **P0-1 · Retry Time Attack mất countdown.**
  `resetGame()` (`js/game/15-ui.js:173`) không reset `V2.ta`; `V2.boot()` chỉ chạy
  1 lần lúc tải trang. Hậu quả:
  - Hết 180s → `timeUp()` set `ta.done=true` → bấm "Chơi lại"/phím R → run mới
    vẫn `done=true` → `Modes.tickTimer` (`js/game/22-modes.js`) return sớm →
    **không countdown, không bao giờ hết giờ** (TA thành endless trá hình).
  - Chết giữa chừng → retry giữ `ta.left` cũ (vd 37s thay vì 180s).
  Fix: thêm `Modes.restartRun()` (dựng lại state qua `Modes.init(V2.mode)`);
  `resetGame()` gọi nó (guard `window.Modes`). Boot thường: `V2.mode=null` →
  no-op, không double-init.

- **P0-2 · Retry Boss Rush soft-lock (arena trống vĩnh viễn).**
  `resetGame()` không reset `V2.br`, không gọi `startBossRush()` (chỉ
  `V2.boot()` gọi). `Modes.blocksWaves()` vẫn `true` → không spawn quái thường,
  không spawn boss → người chơi bay trong arena trống vô hạn (thắng hay thua
  cũng dính).
  Fix: cùng `Modes.restartRun()` — nhánh `bossrush` gọi tiếp
  `Modes.startBossRush()` (banner + boss 1). `resetGame()` đã `Bosses.stop()`
  trước đó nên không còn boss ma.

### P1 — trải nghiệm kém, BẮT BUỘC fix

- **P1-1 · EN mode: hint draft trên mobile hiện tiếng Việt.**
  `draft.hint_mobile` thiếu trong dict EN (`js/i18n.js`) → `I18N.t` fallback VI
  "Chạm để chọn". Kèm duplicate chết dòng 169 (text EN "Tap to pick" nằm trong
  dict VI, bị dòng 170 đè).
  Fix: xóa dòng 169; thêm `"draft.hint_mobile": "Tap to pick"` vào dict EN
  (sau `draft.hint`, dòng ~349).

- **P1-2 · End screen 2 mode mới hardcode tiếng Việt.**
  `Modes.timeUp()` (`js/game/22-modes.js:137-140`): `["Điểm: "+s, "Wave: "+w,
  "Hạ: "+k]`; `Modes.victory()` (dòng 275-278): `["Thời gian: "+t+"s",
  "Điểm: "+s]` → chế độ EN vẫn hiện tiếng Việt (scope cấm text lẫn ngôn ngữ).
  Fix: đăng ký 6 key mới trong `I18N.register` của `22-modes.js` (pattern
  RFC §0/F12 — KHÔNG thêm vào `js/i18n.js`):
  `mode.ta.line_score` "Điểm: {score}"/"Score: {score}",
  `mode.ta.line_wave` "Wave {n}"/"Wave {n}",
  `mode.ta.line_kills` "Hạ: {n}"/"Kills: {n}",
  `mode.br.line_time` "Thời gian: {t}s"/"Time: {t}s",
  `mode.br.line_score` "Điểm: {score}"/"Score: {score}";
  dùng `this._t(key, fallback).replace(...)` (có interpolation như key cũ).

### P2 — polish, effort nhỏ

- **P2-1 · Time Attack không có banner mở màn** (Boss Rush có
  "XẾP HÌNH SẾP — 5 SẾP LIÊN TIẾP! 👔"). Thêm trong `Modes.init` nhánh
  timeattack: `banner(mode.ta.name, mode.ta.desc)` (key đã có, guard
  `typeof banner` như `startBossRush`).
- **P2-2 (infra) · SW stamp lỗi thời.** `sw.js` VERSION
  `windowkill-20261017T084340Z-bc5396e` — SHA `bc5396e` không còn trong history
  của HEAD (rebase artifact từ nhánh PR #81) → `tests/sw-version.test.js` S4
  **FAIL trên checkout sạch**. Fix: `node scripts/bump-sw.js` cuối pipeline
  (đúng cơ chế repo, script tự yêu cầu).

### Ghi nhận, KHÔNG action (trung thực: không phải bug)

- Key `boss.w30.taunt1/2/3` đủ 2 dict (false positive của scanner ở prefix).
- `victory()` dùng chung key `mode.ta.new_record` ("KỶ LỤC MỚI! 🏆") — text
  giống hệt, không cần key riêng.
- Comment nhắc file đã xóa (provenance), `sync:"spikes"` dormant — để nguyên.
- Layout 320px: chỉ verify tĩnh được (breakpoint 480px/640px tồn tại, thẻ cân
  bằng); QA thực cần browser — ngoài phạm vi subagent này.

## 2. Edge cases (acceptance)

1. Retry TA sau hết giờ (`ta.done=true`) → countdown chạy lại từ 180s, hết giờ
   → `timeUp()` + end screen đúng key i18n.
2. Retry TA khi chết giữa chừng (`ta.left` lẻ) → reset đúng 180s.
3. Retry BR sau victory (`br.won=true`) → banner + boss 1 spawn lại, `idx=0`.
4. Retry BR khi chết giữa boss 3 → boss cũ đã `Bosses.stop()`, không boss ma,
   waves vẫn bị chặn đúng (chỉ boss).
5. Boot thường (không `?mode=`) → `V2.mode=null` → `restartRun()` no-op.
6. `?mode=xxx` lạ → whitelist → endless, `restartRun()` no-op.
7. Phím R ở màn over (`07-input.js:32`) đi qua cùng path `resetGame()`.
8. Không đổi chỉ số gameplay (HP/dmg/tốc độ) — diff chỉ chạm UI/i18n/state.

## 3. Acceptance criteria (định lượng, cho QA)

- `node --test tests/*.test.js`: **100% pass**, 0 fail (kể cả S4 sw-version).
- Test mới `tests/audit-round2.test.js`:
  - T1: dict EN có `draft.hint_mobile`; dict VI không duplicate key này.
  - T2: mock `I18N.t=k=>"⟦"+k+"⟧"` → `Modes.timeUp()`/`victory()` truyền cho
    `showEndScreen` các line chứa `⟦mode.ta.line_score⟧`,
    `⟦mode.ta.line_wave⟧`, `⟦mode.ta.line_kills⟧`, `⟦mode.br.line_time⟧`,
    `⟦mode.br.line_score⟧`; không chứa "Điểm:"/"Hạ:"/"Thời gian:".
  - T3: `V2.ta={done:true,left:0}` + `V2.mode="timeattack"` →
    `Modes.restartRun()` → `ta={total:180,left:180,done:false}`.
  - T4: `V2.br={won:true,idx:4}` + `V2.mode="bossrush"` →
    `Modes.restartRun()` → `br` tươi (`won:false,idx:0`) và `startBossRush`
    được gọi (banner + `Bosses.startBoss(1,…)`).
  - T5: `V2.mode=null` → `restartRun()` trả `false`, không đụng gì.
  - T6: `Modes.init("timeattack")` → có banner mở màn qua key `mode.ta.name`.
- Pipeline: `node scripts/build-game.js && node scripts/build-game.js --check
  && node scripts/bump-sw.js` đều exit 0.
