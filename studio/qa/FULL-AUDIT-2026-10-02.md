# FULL AUDIT — WINDOWKILL v2.0 (bảo trì)

- **Ngày:** 2026-10-02 · **Base:** GitHub main `806211b` (PR #28, v2.0 đã release)
- **Branch audit:** `maint/full-audit-2026-10` (local, **chưa push** — chờ leader mở PR)
- **Chế độ:** MAINTENANCE — chỉ audit + fix lỗi, không phát triển tính năng mới.
- **Phương pháp:** (1) rà soát tĩnh toàn bộ ~18.100 dòng bởi 3 auditor độc lập (gameplay core / UI-meta-i18n-save / platform-audio) + đối chiếu tay từng finding trên code thật; (2) QA runtime bằng headless Chromium qua CDP trên HTTP localhost (8 viewport, các luồng menu→game→pause→draft→game-over→restart, campaign boss, daily, portal iframe); (3) test suite `node --test tests/*.test.js`.
- **Kết quả test suite:** baseline 67 pass / 0 fail / 1 skip → sau mọi fix vẫn **67 pass / 0 fail / 1 skip** (không tăng fail ở bất kỳ commit nào).
- **Tổng findings:** 4 CRITICAL · 22 MAJOR · 15 MINOR đã fix · 14 mục ghi nhận chưa fix (kèm lý do/đề xuất ở Mục 5).

---

## 1. CRITICAL — đã fix hết

| # | Finding | Tái hiện / bằng chứng | Fix (commit) |
|---|---|---|---|
| C1 | **Soft-lock khi giết boss campaign bằng đạn.** `Bosses.hit()` set `b.dead` ngoài vòng update, nhưng `hooks.onBossDead` chỉ được gọi ở cuối `updateBoss()` — mà đầu hàm có guard `b.dead` return sớm → hook không bao giờ chạy → `onStageBossDead` không chạy, wave/ải không bao giờ clear, kẹt vô hạn (chỉ thoát bằng đóng popup). | Đọc code bosses.js:1042/1072/1222 + verify runtime sau fix. | Xả hook đúng 1 lần ngay khi thấy `dead` trong updateBoss (`fcd3d27`/`a7f76ce`). **Verify CDP:** bắn chết boss ải 1 qua `V2.hitBoss` → `stageDone=true`, `G.boss=null`, 0 exception. |
| C2 | **Panel Xưởng/Thành tựu/Daily trống 100% trên production.** `menu.js renderMeta()` đọc `d.maxLevel`/`d.costs[lv]` — field thật của meta.js là `max`/`prices` → TypeError bị `catch{}` nuốt, panel đã chèn DOM nhưng không bao giờ có nội dung. Kèm: daily modifiers `join()` trên mảng object → "[object Object]"; nút buy không xét `isNodeUnlocked`; reward skin hiện "+skin:frost💎". | Node repro của auditor + probe runtime trên bản production-clone: panel rỗng, mọi hàm `Meta.*` tự thân đều chạy tốt. | Viết lại renderMeta theo đúng contract (`d.max`/`d.prices`/`isNodeUnlocked`, tên modifier theo ngôn ngữ, reward hiển thị đúng) — `dd00873`. **Verify CDP:** panel render đủ 10 node + daily, mua node trừ 120→70💎 đúng, 0 exception. |
| C3 | **Nút pause HUD chết trên MỌI thiết bị** (3 lớp chồng nhau): (a) mobile.js `wirePauseBtn` gọi global `pauseGame` nhưng game.js là IIFE → không tồn tại; (b) CSS `.hud-btn` cho cả 2 nút cùng `position:fixed; top/right:10px` → nút fullscreen đè khít nút pause, click/tap thật luôn trúng fullscreen (chứng minh bằng `elementsFromPoint`); (c) toàn bộ lớp wrap của mobile.js (haptic kill/hurt/nuke, joystick rescale) là dead code vì wrap các hàm nằm trong IIFE. Trên mobile đây là nút pause thủ công duy nhất ngoài auto-pause. | CDP: `__wkWired=true` nhưng click thật không pause; stack elementsFromPoint cho thấy `BUTTON#btn-hud-full` nằm trên `BUTTON#btn-hud-pause`. | game.js nối listener `btn-hud-pause` trong scope IIFE (`dd00873`); CSS tách `#btn-hud-pause { right: 62px }` (`86bb509`); mobile.js nối haptic qua hook thật `V2.onKill`/`V2.onNuke`/`AudioEngine.sfx.hurt` + đường cong joystick R3 áp trực tiếp trong `touchMoveVec` (`ee3412f`). **Verify CDP:** click chuột thật + viewport 390px đều mở/đóng pause được. |
| C4 | **Service worker offline fallback hỏng:** `networkFirstPage` dùng `cache.match(OFFLINE_URL)` trên HTML_CACHE trong khi `offline.html` được precache vào STATIC_CACHE → fallback resolve `undefined`, mất mạng là thấy trang lỗi mặc định của trình duyệt. | Đối chiếu sw.js install/networkFirstPage. | Đổi sang `caches.match(OFFLINE_URL)` — `dd00873`. |

## 2. MAJOR — đã fix (trừ M22 ghi rõ)

| # | Finding | Fix (commit) |
|---|---|---|
| M1 | **SW precache chỉ có file v1:** thiếu 13 file JS v2 (i18n, campaign, meta, tutorial, monsters, bosses, juice2, sfx2, stagefx, upgrades2, v2glue, mobile, portal) + css/roles.css; VERSION kẹt `windowkill-v3`. | VERSION → `windowkill-v4`, bổ sung đủ 14 file — `dd00873`. |
| M2 | **Save cũ/hỏng làm crash menu:** `wk_stats` = `"null"` → `renderStats` TypeError giết đuôi renderAll; `wk_profiles` chứa entry `null`/thiếu id → crash renderProfiles (đúng lớp bug crash profile trong lịch sử dự án); profiles không phải array → sập launcher. | Sanitize lúc load (`Array.isArray` + lọc entry hợp lệ) + guard `|| {}` ở renderStats — `dd00873`. **Verify CDP:** 2 case save hỏng (corrupt JSON, entry null/sai kiểu) → **0 exception** sau fix. |
| M3 | **BGM fade ném IndexSizeError:** timestamp rAF có thể nhỏ hơn `performance.now()` tại t0 → hệ số k âm → `volume = -0.004` khi fade-in → exception mỗi lần dính. | Clamp k vào [0,1] + clamp volume cuối — `7f41cbd`. Verify: menu bật nhạc 8s, 0 exception. |
| M4 | **Watchdog BGM giết nhạc thật sau ~48s** nếu user chưa tương tác lần nào (autoplay-block bị đếm là track lỗi → `allFailed` vĩnh viễn, unlock sau đó cũng không cứu). | Không đếm fail trước lần tương tác đầu — `ee3412f`. |
| M5 | **Nhạc procedural dự phòng là E minor → E Phrygian** — trái chỉ đạo âm thanh đứng của user (cấm tuyệt đối; phải major/Mixolydian, vui nhộn, nhịp nhanh). Mọi đường fallback đều rơi về nhạc bị cấm. | Chuyển toàn bộ STATES/PROG/BASS_PAT/ARP_SCALE sang E major / E Mixolydian + tăng BPM — `ee3412f`. |
| M6 | **Âm thanh desktop chết:** AudioContext kẹt `suspended` vì trang game chỉ resume ở touchstart (người dùng chuột/phím mất toàn bộ SFX); phím M lệch chuẩn (`off/on` vs `1/0` của launcher → phải bấm 2 lần, không lưu settings); `Sfx2.setEnabled` không có caller (tắt SFX ở menu vẫn nghe lớp sfx2). | Resume trong keydown+mousedown; M dùng biến trạng thái nội bộ + ghi `wk_settings`; nối `Sfx2.setEnabled` ở game boot + toggle menu — `ee3412f`. |
| M7 | **Raw i18n key lộ ra banner:** `meta.daily_banner` + `campaign.stage_clear` không tồn tại trong dict; `I18N.t` trả chính key (truthy) nên fallback `||` chết; daily banner còn truyền object modifier → "[object Object]". | Thêm key vi/en; `T()` của v2glue trả "" khi thiếu dịch; truyền tên modifier theo ngôn ngữ — `ee3412f`. **Verify CDP:** banner hiện "⚡ DAILY: Ngày hội chewer · Mưa gem". |
| M8 | **Điểm Daily bị nhân đôi:** glue nhân ×1.21 trước, meta.submitScore nhân ×1.21 nữa → kỷ lục phồng ×1.4641 (+21% oan). | Glue truyền điểm thô — `ee3412f`. |
| M9 | **Độ khó campaign bị bỏ qua ở 3 lớp:** `getWaveComp` hardcode `"normal"`; `getRunParams` gọi sai chữ ký + đọc field không tồn tại; và contract diff của Bosses là `{bossHpMul, telegraphMul, boss5Timer, enemySpdMul}` trong khi glue truyền `{hpM, spM, bossHpMult, telegraphMult}` — không key nào khớp → boss/wave luôn thông số Normal dù chọn Chill/Khắc nghiệt. | Dùng `diffKey` thật từ boot xuyên suốt + map đúng contract của từng module — `ee3412f` + `fcd3d27`. **Verify CDP:** HP boss ải 1 = **975 (Chill) / 1500 (Thường) / 2025 (Khắc nghiệt)**. |
| M10 | **Khóa ải không được enforce ở cửa vào game:** mở thẳng `game.html?stage=5` chơi được ải chưa mở; panel chọn ải ở menu tính khóa/kỷ lục 1 lần lúc load, đổi profile vẫn hiện của profile trước. | Boot kẹp `stageId` theo `Campaign.getUnlockedStage(profileId)`; tách `paintStages()` + hook refresh trong `renderAll()` — `ee3412f`. **Verify CDP:** `?stage=5` với profile mới → stageId kẹp về 1; đổi profile Alpha(unlock 3)→Beta(unlock 1) panel khóa lại đúng. |
| M11 | **Tutorial luôn tiếng Việt ở chế độ EN:** `Tutorial.start` không được truyền `lang` (COPY song ngữ có đủ nhưng mặc định "vi"). | Truyền `I18N.getLang()` — `ee3412f`. |
| M12 | **Nút "Sửa khẩn cấp" ở launcher trừ Mảnh Kính oan:** nhãn ghi −50💎 (giá thật 20), bấm ở menu trừ thẳng 20💎 mà không có cửa sổ game nào được vá (điều kiện winPct < 40% chỉ có nghĩa trong run; không có UI in-game nào nối tính năng này). | Gỡ nút khỏi launcher (tính năng thuộc luồng in-game — xem Mục 5) — `ee3412f`. |
| M13 | **Mechanic ải (StageFX) đứng yên sau khi enter:** glue gọi `StageFX.activeModule()`/`exitAll()` — cả hai không tồn tại (API thật: `update`/`draw`/`exit`) → gai không chu kỳ, cúp điện không tắt, arena không thu, không exit khi hạ boss; diff truyền `{}` nên luôn dùng thông số Thường. | Dùng API thật + map diff mechanic theo độ khó từ `Campaign.getStageMechanic`; resetGame thêm `StageFX.exit()` — `ee3412f`. **Verify CDP:** ải 2 module `spikes` active, state `t` chạy 0 → 1.5 sau 3s. |
| M14 | **Engine boss cũ can thiệp boss module:** block boss cũ trong game.js kéo boss module về phía tàu 34px/s + ghi đè `phase` theo thang 1–4 trong khi module dùng 1–3 → `enterPhase` không bao giờ chạy (mất stun/banner/heart, boss 5 không khởi tạo countdown "Lệnh Xóa"), và ở ≤25% HP `pickAttack` đọc `phases[2]` không tồn tại → boss đứng đòn. | Bỏ qua toàn bộ block boss cũ khi `Bosses.active === G.boss` — `a7f76ce`. **Verify CDP:** ở 50% HP phase chuyển 1→2 đúng thang module. |
| M15 | **resetGame không dọn state của run cũ:** vệ tinh bomb/mother/nest sống sang run mới khi restart từ pause; boss module ma tiếp tục bắn vào run mới; Juice2 near-death/first-blood không reset (cộng +300 điểm "THOÁT HIỂM" miễn phí); `cracks`/`windowDamagePx` cộng dồn qua các run; cửa sổ/arena đã teo không được khôi phục (run mới bắt đầu với cửa sổ ~250px sát ngưỡng chết). | resetGame thêm `SatManager.closeAll()` + `Bosses.stop()` + `Juice2.reset()` + reset cracks/windowDamagePx + `arena = null` + `growWindow(START_W, 720)` — `a7f76ce`. |
| M16 | **Fragment vệ tinh (chế độ sim) cắn viền mỗi frame:** nhánh sim không đọc `biteCD` → 1 lần chạm viền mất ~100–160px cửa sổ thay vì 8px/3s như bản popup thật. Toàn bộ người chơi mobile/sim dính. | Gate 4 check viền bằng `biteCD`, cắn xong đặt 3s — `a7f76ce`. |
| M17 | **Slam của boss cũ thu cửa sổ 2 lần:** cặp `addFloat`+`shrinkWindow` chạy vô điều kiện rồi nhánh else shrink lần nữa → sát thương cửa sổ gấp đôi thiết kế ở mọi đòn không-debris. | Chỉ shrink trong nhánh else — `a7f76ce`. |
| M18 | **Quái của run cũ spawn vào run mới:** `Juice.reset()` settle spawn-warning bằng `resolve(false)` (fulfilled) nhưng handler ở game.js không kiểm tra → restart đúng lúc warning là quái cũ (HP/speed theo wave cũ) xuất hiện trong run mới. | Handler hủy khi `ok === false` — `a7f76ce`. |
| M19 | **Đòn signature của boss campaign là no-op:** bosses.js/monsters.js tra cứu `window.shrinkWindow/growWindow/pushWindow/windowJitter` (+ `hurtShip/burst/jxShake/spawnEnemyAt`) nhưng game.js chưa từng expose → slam thu cửa sổ của boss 1, shrink định kỳ của boss 5, đẩy cửa sổ không bao giờ xảy ra trong campaign. | Expose đúng contract tại block WK* của game.js — `a7f76ce`. |
| M20 | **Gem qua bridge thành NaN + gems không có hạn dùng:** `WKSpawnGems` chỉ đẩy `{x, y, v}` (thiếu `vx/vy/t`) → tọa độ NaN ngay frame đầu: gem vô hình, không nhặt được, không xóa được; fallback `defSpawnGems` của bosses thiếu `v` → nhặt là XP thành NaN, hỏng lên cấp cả run. Gems không hết hạn → phình vô hạn trong session dài, tụt FPS dần. | Đẩy đủ field ở cả 2 chỗ; gems hết hạn sau 30s + dọn gem NaN — `a7f76ce`. |
| M21 | **Banner Daily chưa từng hiển thị:** `V2.boot()` chạy TRƯỚC `resetGame()` ở cuối game.js, resetGame gán `banner: ""` ngay sau đó → banner boot set bị xóa trong cùng tick (v2glue tự tài liệu "boot gọi sau resetGame" nhưng code ngược lại). | Đưa boot xuống sau resetGame — `fcd3d27`. Verify ở M7. |
| M22 | **6 nâng cấp v2.0 (Upgrades2) chưa từng được tích hợp:** module không có consumer nào trong toàn repo (draft không gọi `rollDraft`), và cả 6 effect (`thornBorder`, `inertiaAnchor`, `owlEye`, `explosive`, `chain`, `selfGlue`) đều không có dòng code nào trong engine đọc các field mà `apply()` set; `unlockBossStage` cũng không có caller. | **KHÔNG fix trong đợt maintenance** — đây là hoàn thiện tính năng dở dang (phải viết 6 effect vào core loop + nối draft + hook unlock), không phải sửa lỗi tối thiểu. Đề xuất sprint phát triển riêng — xem Mục 5. |

## 3. MINOR — đã fix

| # | Finding | Fix |
|---|---|---|
| m1 | `scripts/build-portal.sh` báo "BUILD FAILED" giả (pipefail + `grep -q` đóng pipe sớm → SIGPIPE 141 dù ZIP đạt). | Nạp zipinfo vào biến 1 lần — `5bc22ee` (verify BUILD PASS, ZIP 105 files/15.6MB). |
| m2 | Inline đăng ký SW trong index.html/game.html bị chính CSP `script-src 'self'` chặn vĩnh viễn + gate `WK_PORTAL_MODE` vô hiệu do timing (chỉ sinh lỗi console; pwa.js mới là đường thật). | Gỡ cả 2 block — `dd00873`. |
| m3 | index.html nạp trùng campaign.js/meta.js/tutorial.js 2 lần (IIFE chạy đôi). | Gỡ 3 thẻ trùng — `dd00873`. |
| m4 | `Cinema.countUp` chia thừa 1000 → animation ~900 giây, rAF sống ~15 phút mỗi lần gọi. | Mẫu số về `dur` — `a7f76ce`. |
| m5 | `Juice.reset()` đọc sai field `onDone` (thật: `jfDeath.onDone`) → death callback không bao giờ chạy khi reset. | Đọc đúng field — `a7f76ce`. |
| m6 | `Meta` daily sync fire-and-forget → unhandled rejection mỗi lần hoàn thành Daily khi API lỗi. | Bắt `.catch` — `ee3412f`. |
| m7 | SW nuốt GET `/api/*` + file media vào stale-while-revalidate (leaderboard trả cũ 1 nhịp; mp3 bị cache nguyên file). | Bypass `/api/` + extension media trong fetch handler — `ee3412f`. |
| m8 | Toggle ngôn ngữ luôn highlight "Tiếng Việt" (đọc `I18N.lang` không tồn tại). | Dùng `I18N.getLang()` — `ee3412f`. |
| m9 | satellite.html: float damage dùng trùng id `dmg`; link css/roles.css 2 lần. game.html: symbol `i-mirror`/`i-vacuum` định nghĩa 2 lần. | Class thay id; gỡ trùng — `ee3412f`. |
| m10 | `Meta.check` bị gọi thiếu context → 5 thành tựu sai/không bao giờ mở (#2 wave 3 Chill, #11 hạ boss <15% cửa sổ, #18 run 15 phút, #19/#21 theo độ khó). | Glue truyền `difficulty`/`durationSec`/`winPct` (expose `WKWinPct` đúng công thức engine) — `ee3412f`. |
| m11 | Nhánh cộng mảnh `if (rw > 0) Meta.addShards(rw)` là dead code nguy hiểm (`rewardsForRun` trả object và đã tự cộng bên trong — ai "sửa" sẽ thành cộng đôi). | Gỡ nhánh + comment cảnh báo — `ee3412f`. |
| m12 | Chuỗi EN còn thiếu ở bề mặt hiển thị: tên/banner 5 boss (bosses.js + key campaign.boss_banner_*/endless_banner_*), panel meta (48 defs: 10 workshop + 25 achievements + 8 daily mods + 5 skins thêm `nameEn/descEn/condDescEn/unlockEn`), toast thành tích. | Bổ sung bản dịch + chọn chuỗi theo ngôn ngữ — `dd00873` + `ee3412f`. |
| m13 | Giá "Sửa khẩn cấp" hiển thị sai (−50 thay vì −20) — đã hết hiệu lực khi gỡ nút ở M12; `Meta.getEmergencyCost()` được expose để UI in-game tương lai dùng đúng giá. | `dd00873`. |
| m14 | Nhiễu console vô hại ghi nhận: cảnh báo CSP meta `frame-ancestors` (mọi lần load, do meta không hỗ trợ directive này); `/api/health` 404 + `/api/events` 501 khi chạy local (backend Fly.io chưa deploy — game xử lý êm, không exception). | Không sửa (đúng bản chất môi trường). |

## 4. Ma trận kiểm chứng runtime (headless Chromium + CDP, HTTP localhost)

### 4.1 Thiết bị / viewport — 8/8 PASS (trước đợt fix; các fix sau đó không đổi layout ngoài vị trí nút pause đã verify lại ở 1280px + 390px)

| Viewport | Menu | Game | Ghi chú |
|---|---|---|---|
| Desktop 1920×1080 | ✅ | ✅ | Không overflowX, canvas lấp đầy |
| Laptop 1366×768 | ✅ | ✅ | |
| Tablet 768×1024 + landscape | ✅ | ✅ | |
| Mobile 390×844 + landscape | ✅ | ✅ | Touch-drag: frame thay đổi, game phản hồi, 0 exception |
| Mobile 360×740 + landscape | ✅ | ✅ | |

### 4.2 Luồng chức năng đã chạy

- Menu load sạch (trừ nhiễu m14), tạo profile, chọn ải → tutorial modal → popup game mở đúng `stage=1&tut=1`; chơi 45s không exception.
- Pause: phím P/Esc, nút HUD (sau fix — chuột thật + 390px), resume, restart từ pause, game-over (idle ở Khắc nghiệt → "Tàu nổ tung!" sau ~8s) → Chơi lại hoạt động.
- Campaign: spawn boss ải 1, phase chuyển đúng, bắn chết boss → ải hoàn thành (C1); HP boss theo độ khó (M9); mechanic ải 2 chạy (M13); khóa ải (M10).
- Meta: panel render + mua node + daily (C2); save cũ v1→v2: 4 case (chỉ legacy scores → tự migrate "Player 1" ✅; profile v1 tối thiểu ✅; dữ liệu corrupt → fix M2 ✅; entry null/sai kiểu → fix M2 ✅).
- i18n EN: menu sạch (VI còn lại chỉ là nhãn chọn ngôn ngữ — by design; "Mảnh Kính" giữ nguyên theo convention thuật ngữ của game); overlay pause/level-up/game-over EN đã verify qua DOM; panel meta EN (C2/m12); banner daily EN-path qua nameEn.
- Portal/iframe: `game.html` trong iframe → `WK_PORTAL_MODE=true`, canvas + state chạy, 0 exception; menu `?portal=1` → CHƠI NGAY điều hướng same-tab với `sat=sim` (không popup).
- Hiệu năng (bot chơi ~131s, headless software rendering — chỉ là baseline tham chiếu): FPS median ~57, phần lớn mẫu 50–61, vài dip lẻ 26–47; heap ổn định 3.5–5.7MB, không xu hướng rò (cuối phiên 3.54MB < đầu phiên 5.03MB); tải lần đầu trang menu: 29 resources, ~0.84MB transfer, DOMContentLoaded ~1003ms, load ~1546ms (localhost, không tính độ trễ mạng). File nặng nhất: hero.jpg 96.6KB, monsters.js 81.7KB, logo-lockup.webp 78.3KB, cinema.js 68.8KB.

## 5. Chưa fix / chưa kiểm chứng — nói thật

**Chưa fix (cần quyết định hoặc thuộc phát triển tính năng):**
1. **M22 Upgrades2** — cần sprint tích hợp riêng: nối `rollDraft` vào draft, viết 6 effect vào core loop (đạn nổ lan/chuỗi nảy cần sửa đường đạn trúng; Gai Phản cần check va chạm viền; Neo Quán Tính cần handler Shift; Mắt Cú cần render lúc blackout; Keo Tự Vá cần timer trong loop), gọi `unlockBossStage` khi hạ boss ải. Ước lượng: 1 sprint nhỏ, có rủi ro hồi quy draft — không nên làm trong maintenance.
2. **Nút Sửa khẩn cấp in-game** (sau khi gỡ khỏi launcher ở M12): cần UI trong game khi winPct < 40% + gọi `Meta.emergencyRepair()` + áp +60px — là tính năng, để cùng đợt với M22.
3. **Toast thành tựu:** `Meta.onUnlock` không có subscriber nào — thành tựu mở khóa im lặng. Nối toast = việc mới (nhỏ).
4. **Meta progression dùng key toàn cục** (`wk_meta_*`) không theo profile, trong khi campaign thì theo profile — cần team xác nhận đây là chủ đích hay lệch thiết kế trước khi đổi (đổi = migration save).
5. MINOR tồn: text canvas trong satellite.html chỉ có VI (trang này không nạp i18n.js); `campaign.js descVi/mechanicVi` chưa có bản EN (chưa xác nhận đường hiển thị trực tiếp); tutorial khớp draft đơn giản bằng tiêu đề VI (ở EN rơi về draft gốc, không crash); canvas chưa nhân DPR (mờ trên Retina) + chưa nghe `visualViewport`; `api.js` timeout không dọn ở đường throw + health-cache lệch TTL; BGM patch nuốt state GAMEOVER/VICTORY (đánh đổi thiết kế — nhạc vui chạy tiếp qua màn game-over); promise `bossIntro` của Cinema resolve `true` cả khi bị reset (đã có `bossSpawnTok` bảo vệ); lên 2 cấp trong 1 lần cộng XP làm mất 1 lượt draft (hiếm, cần XP burst lớn); boot game.js phụ thuộc cứng `I18N`/`AudioEngine` không guard (chỉ vỡ nếu file lỗi tải); `WKPortal.force()` chỉ lật cờ, không dọn SW/analytics (chưa có caller).

**Chưa kiểm chứng được (giới hạn môi trường):**
- **Firefox / Safari (WebKit): CHƯA TEST.** Cài Firefox qua Playwright timeout trong sandbox; không có WebKit. Ma trận trình duyệt hiện chỉ có Chromium.
- **Thiết bị thật:** toàn bộ là emulation qua CDP (viewport/touch dispatch) — chưa chạy trên điện thoại/máy thật; tọa độ tàu khi touch không đo trực tiếp được vì state bị khóa trong IIFE (chỉ xác nhận frame thay đổi + 0 exception).
- **Text vẽ bằng canvas** (banner, boss bar, float text) không OCR được bằng quét DOM — đã verify qua biến state (`G.banner`, `barData`) thay vì hình ảnh.
- **Cửa sổ vệ tinh thật (multi-window popup):** sandbox chặn loopback cho cửa sổ con nên chỉ kiểm chứng được chế độ `sat=sim`; luồng popup thật + BroadcastChannel giữa các cửa sổ chưa chạy end-to-end trong đợt này.
- **Backend leaderboard (Fly.io)** chưa deploy: `/api/*` ở local trả 404/501, game fallback localStorage êm — chưa kiểm chứng được đường online thật.
- **itch.io build** đã kiểm chứng qua iframe harness local tương đương, chưa nhúng lại bản build mới lên trang itch.io thật trong đợt audit này (bản live vẫn là build v2.0 `806211b`).

## 6. Commits trên branch `maint/full-audit-2026-10` (chưa push)

| Commit | Nội dung |
|---|---|
| `5bc22ee` | fix(tooling): build-portal.sh báo BUILD FAILED giả (m1) |
| `dd00873` | fix(audit): pause HUD listener + panel meta viết lại + save guards + SW v4/offline (C2, C3a, C4, M1, M2, m2, m3, m12, m13) |
| `86bb509` | fix(audit): 2 nút HUD chồng khít (C3b) |
| `7f41cbd` | fix(audit): BGM fade IndexSizeError (M3) |
| `a7f76ce` | fix(audit): CRITICAL soft-lock boss campaign (C1) + M14–M20 + m4, m5 |
| `ee3412f` | fix(audit): cụm v2glue/i18n/meta/audio/platform (C3c, M4–M13, m6–m11) |
| `fcd3d27` | fix(audit): contract diff của Bosses (M9 lớp 3) + thứ tự boot V2 (M21) |

Test sau commit cuối: **67 pass / 0 fail / 1 skip** — bằng baseline, không hồi quy.
