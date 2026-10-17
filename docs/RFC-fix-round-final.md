# RFC fix-round-final — Miniboss spawner + MobileAssist restore + dead code

Quyết định CEO ("A, A"): (1) thêm spawner miniboss debut wave 4/9/14/19/24
(ngay trước boss wave 5/10/15/20/25); (2) khôi phục MobileAssist multipliers;
(3) dọn dead code campaign. Không đổi tuning, không merge, không push itch.

## F1 — Miniboss spawner (P1)

- Hook: `startWave(n)` trong `js/game/12-variety.js` (dòng 288, ngay sau
  `maybeTriggerGiant(n); // M6`). Boss wave (`n%5===0`) return sớm ở dòng 260
  nên hook chỉ chạy ở wave thường — đúng nhịp CEO.
- Thêm `maybeSpawnMiniBoss(n)` trong `js/game/11-spawn.js` (sau `spawnEnemy`,
  ~dòng 127): mapping `k=(n+1)/5` khi `n%5===4 && k∈[1..5]` →
  wave 4→`mini_boss_1`, 9→2, 14→3, 19→4, 24→5. Ngoài khoảng (vd 29+) → no-op.
- Thân hàm: guard `G.miniBossWave===n` (chống spawn trùng); lấy spec qua
  `miniBossSpecOf('mini_boss_'+k)`; `spawnEnemy('mini_boss_'+k)` (edgeSpawn +
  spawnWarning có sẵn, đã verify `spawnEnemyAt` nhận `mini_boss_N` qua
  `mkEnemy`); banner `setBanner(spec.nameVi, "")` + sfx boss.
- `mkEnemy`/`miniBossSpecOf`/`Monsters.MINIBOSSES` giữ nguyên (resolver đã đúng).

## F2 — Khôi phục MobileAssist multipliers (P1)

- Gốc (git 0360dfc^:js/campaign.js:267): `MOBILE_ASSIST={speedMult:0.85,
  spawnCountMult:0.8, chewDpsMult:0.8}`, áp khi `isMobileDevice()`
  (wk-coarse class hoặc `pointer:coarse`) && `wk_settings.mobileAssist!==false`.
- Hiện tại `mobileAssistOn()` (15-ui.js:53) chỉ check setting — thiếu device check.
- Spec: thêm `mobileAssistActive()` cạnh `mobileAssistOn()` (15-ui.js):
  `= coarseNow() && mobileAssistOn()` (tái dùng `coarseNow()` của js/mobile.js
  — cùng logic với campaign cũ).
- 3 điểm áp (không mutate DIFF gốc):
  1. `mkEnemy` (11-spawn.js:70): speed `* (mobileAssistActive()?0.85:1)`.
  2. `buildSpawnQueue` (11-spawn.js:151): count `* (active?0.8:1)` — đúng ngữ nghĩa
     "số lượng spawn" cũ; KHÔNG áp vào `wkSpawnInterval` (DIFF.spawnMul là
     interval, bị band formula bypass trong wave 15-30).
  3. Chew (10-gamedata.js:160): threshold `DIFF.chew * (active?1.25:1)` (=1/0.8;
     threshold lớn hơn = gặm chậm hơn, tương đương chew DPS ×0.8).
- Toggle pause menu giữ nguyên. Desktop không đổi hành vi.

## F3 — Dọn dead code

- `js/monsters.js`: xóa `makeMiniBoss` (1908) + `miniBossStats` (1913) + export
  (2132). GIỮ `MINIBOSSES` defs (F1 dùng). Sửa header comment 1888-1890
  ("wave 5 mỗi ải" → debut wave 4/9/14/19/24 trước boss).
- `js/upgrades2.js`: xóa `unlockBossStage` (118) + export (272) + header docs
  (dòng 9, 23) + `_bossBeaten` (105; write-never sau khi xóa) + reset ở
  `resetAll` (149); đơn giản `isUnlocked` (115) — 3 upgrade `bossStage:2/3/4`
  (gai_phan, neo_quan_tinh, mat_cu) không còn trigger mở → chuyển thành draft
  thường (bỏ gate), tag "Độc quyền ải N" giữ fallback `tagVi`; xóa key i18n
  `upg2.tag.stage2/3/4` (vi+en) nếu không dùng nữa.

## Test (QA, suite độc lập)

- F1: mapping 4/9/14/19/24 → mini_boss_1..5; wave 29/khác không spawn; boss wave
  không spawn; `mkEnemy('mini_boss_1')` có `e.miniBoss`, hp×8, r×2.5, xp=20.
- F2: coarse+ON → speed×0.85/count×0.8/chew×1.25; desktop hoặc toggle OFF →
  không đổi (tham khảo tests cũ: git show 0360dfc^:tests/mobile-assist.test.js).
- F3: assert `makeMiniBoss/miniBossStats/unlockBossStage/_bossBeaten` không còn
  trong js/; xóa/sửa test dùng chúng (`miniboss-wave5.test.js:60-64`,
  `upgrades2.test.js` U3 + S6 NOTE 210-216); cập nhật ghi chú P4.5/F2 trong
  `qa-independence-uiaudit.test.js` (dòng 16-17, 500+) thành test thật.
