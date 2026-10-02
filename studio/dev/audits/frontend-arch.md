# AUDIT KIẾN TRÚC FRONTEND — WINDOWKILL (game client)

| | |
|---|---|
| **Phạm vi** | `js/*.js` (23 file, 17.018 dòng), `index.html`, `game.html`, `satellite.html`, `tests/`, `.github/workflows/ci.yml` |
| **Branch / commit** | `dev/deep-audit-upgrades-2026-10` @ `3b25694` (= main sau PR #29) |
| **Phương pháp** | Chỉ đọc code + grep đối chiếu hai chiều (định nghĩa ↔ call-site) + chạy test suite. Không sửa file code nào trong đợt audit này. |
| **Test baseline (tự chạy lại 2026-10-02)** | `node --test tests/*.test.js` → **67 pass / 0 fail / 1 skip** (68 tests, 23 suites, ~4,1s) — khớp baseline được giao. 1 skip là test "game.js export pure function" bị skip có chủ đích (xem §4). |
| **Deliverable kèm theo** | **M22 WIRING SPEC** ở Phần 5 — viết như mini-spec độc lập, triển khai được ngay. |

---

## 0. CHỐT THUẬT NGỮ TRƯỚC KHI ĐỌC (quan trọng, tránh làm sai đối tượng)

Trong brief và trong trí nhớ dự án, M22 từng được diễn đạt lẫn lộn là "6 nâng cấp Xưởng (Upgrades2)". **Đọc code cho thấy đây là HAI hệ thống khác nhau:**

| | **Upgrades2** (`js/upgrades2.js`) — **đây mới là M22** | **Workshop / Xưởng** (`js/meta.js` §3) |
|---|---|---|
| Bản chất | 6 nâng cấp **trong run**, bốc qua draft khi lên cấp | 10 node meta-progression **mua bằng Mảnh Kính** giữa các run |
| Sở hữu | Không lưu trữ. State `_taken`/`_bossBeaten` chỉ sống trong RAM của trang game | Lưu bền ở `localStorage["wk_meta_workshop"]` = JSON `{"1":2,...}` (id → level) |
| Cách nhận | Thắng draft (chưa từng được nối — xem Phần 5) | `Meta.buyNode(id)` trừ shards, gọi từ menu (`js/menu.js`, nút `.v2-buy`) |
| Trạng thái nối engine | **0%** — không một consumer nào (chứng minh §5.1) | **~50%** — node 1–5 có tác dụng (qua `newShip()`), node 6–10 chưa có consumer, và có lỗi thứ tự boot làm mất tác dụng ở run đầu tiên của mỗi lần tải trang (Finding F-02) |

Báo cáo FULL-AUDIT-2026-10-02 (dòng M22) nói về **Upgrades2**. Phần 5 của tài liệu này là spec cho Upgrades2; tình trạng dở dang của Workshop được ghi ở Finding F-02 và **Phụ lục A của spec** (cùng một mẫu lỗi, effort nhỏ, nên làm chung một sprint).

---

# PHẦN 1 — CẤU TRÚC & BẢN ĐỒ MODULE

## 1.1 Bản đồ module (23 file)

| File | Dòng | Trách nhiệm | Global công khai (`window.*`) | Trang load |
|---|---:|---|---|---|
| `js/portal.js` | 87 | Phát hiện portal/iframe, ép `sat=sim`, tắt SW | `WK_PORTAL_MODE`, `WKPortal`, `WK_POKI` | index + game (đầu tiên) |
| `js/pwa.js` | 27 | Đăng ký service worker, giữ `beforeinstallprompt` | `__deferredInstallPrompt` | index + game |
| `js/analytics.js` | 234 | Analytics privacy-first, batch 15s, nghe BroadcastChannel `windowkill_bus` | `WKAnalytics` | index + game |
| `js/i18n.js` | 797 | Từ điển vi/en, `t(key, vars)`, format số | `I18N` | game (trước mọi thứ trừ portal/pwa/analytics); index (muộn, sau upgrades2) |
| `js/audio.js` | 1.019 | AudioEngine procedural (nhạc adaptive + SFX), shim `WKAudio` cho menu | `AudioEngine`, `WKAudio` | index + game |
| `js/bgm.js` | 277 | Playlist 4 track file thật, crossfade, patch tắt nhạc procedural khi file chạy | `BGM` | index + game |
| `js/api.js` | 104 | Client backend tùy chọn (leaderboard/profiles/daily), offline → resolve `null` | `WKApi` | index only |
| `js/bg.js` | 324 | Nền "Deep Dever" procedural, prerender offscreen | `BG` | game only |
| `js/juice.js` | 1.139 | Game-feel v1: shake tiers, hit-stop, spawn warning, damage numbers, particles/ghosts | `Juice` (+ `Juice.draftOpen`) | index + game |
| `js/cinema.js` | 1.784 | Cinematic: wave banner, draft DOM overlay, boss intro/death, combo, heartbeat | `Cinema` | index + game |
| `js/campaign.js` | 587 | 5 ải, độ khó, wave comp, unlock ải theo profile, stage best | `Campaign`, `ACTS` ⚠️ (xem F-05) | index + game |
| `js/monsters.js` | 1.689 | Registry 14 quái v2 + behaviors + miniboss + debut banner (module độc lập) | `Monsters` | index + game |
| `js/bosses.js` | 1.271 | 5 boss cuối ải, 3 phase, hooks-based | `Bosses` | index + game |
| `js/stagefx.js` | 536 | 4 mechanic ải: gai (2), trơn (3), mất điện (4), thu arena (5) | `StageFX` | index + game |
| `js/tutorial.js` | 764 | Tutorial 10 beat, poll state qua global | `Tutorial` | index + game |
| `js/meta.js` | 659 | Meta: shards, Workshop 10 node, skins, 25 achievements, daily, vá khẩn, mở Khắc nghiệt | `Meta` | index + game |
| `js/juice2.js` | 682 | Game-feel v2: hit-stop theo kill, overlays, near-death/first-blood | `Juice2` | index + game |
| `js/sfx2.js` | 209 | Lớp SFX bổ sung (multikill/levelup/shield…) | `Sfx2` | index + game |
| `js/upgrades2.js` | 282 | **6 draft upgrade v2 (M22 — chưa nối)** | `Upgrades2` | index + game |
| `js/v2glue.js` | 294 | **Coordinator**: nối campaign/monsters/bosses/stagefx/meta/tutorial/juice2 vào engine qua `window.WK*` + `window.G` | `V2` | **game only, ngay trước game.js** |
| `js/menu.js` | 526 | Launcher: profiles, settings, high scores, panel Meta (Xưởng/Achievements/Daily), mở popup game | `__wkRefreshV2` | index only |
| `js/game.js` | 3.603 | **Engine**: loop, ship, đạn, quái (registry nội bộ), boss cũ, satellites/chain-popups (M5–M10), draft 12 món, render, HUD, bridge `WK*` | `G`, `DIFF`, `bounds`, `openDraft`, `gainXp`, `addFloat`, ~15 hàm `WK*`/`window.*` (dòng 3553–3595) | game only |
| `js/mobile.js` | 124 | Haptic, chống pinch iOS — load **sau** game.js | `WKBuzz`, `WKHapticOn` | game only (cuối) |

Kiến trúc tổng thể là **"module vệ tinh + coordinator"**: mọi module v2 được viết theo quy ước *không sửa file có sẵn*, tự chứa trong IIFE, giao tiếp qua `window.*` và qua cầu nối `WK*` mà game.js expose ở cuối file (dòng 3552–3595). `v2glue.js` là lớp keo duy nhất biết cả hai phía. Mẫu này đã cứu dự án nhiều lần (mọi fix audit 2026-10-02 đều đi qua glue), nhưng cái giá là **không có kiểm tra tĩnh nào cho contract** — sai tên field/hàm là no-op im lặng (đã xảy ra ít nhất 4 lần: M9 contract diff của Bosses, M13 API StageFX, M19 bridge shrink/grow, M21 thứ tự boot).

## 1.2 Thứ tự load

Cả hai trang đều dùng `defer` toàn bộ → thứ tự thực thi = thứ tự thẻ `<script>` trong HTML, và các module được viết để **chỉ chạm nhau lúc runtime** (không phải lúc parse), trừ vài ngoại lệ cứng ở §1.3.

- **index.html**: `portal → pwa → analytics` (head) … `audio → bgm → api → juice → cinema → campaign → monsters → bosses → stagefx → tutorial → meta → juice2 → sfx2 → upgrades2 → i18n → menu`. Lưu ý `i18n.js` load **sau** gần hết module ở index (menu.js chạy cuối nên vẫn an toàn), trong khi ở game.html nó load **trước** audio. Không gây lỗi hiện tại nhưng là bất đối xứng dễ cắn người viết module mới giả định `I18N` có sẵn lúc parse.
- **game.html**: `portal → pwa → analytics → i18n` (head) … `audio → bgm → bg → juice → cinema → campaign → monsters → bosses → stagefx → tutorial → meta → juice2 → sfx2 → upgrades2 → v2glue → game → mobile`. `v2glue` **phải** trước `game.js` (game.js gọi `V2.boot()` ở cuối) và `mobile.js` **phải** sau (nó wrap global của game).

## 1.3 Coupling nguy hiểm — sửa file nào dễ vỡ file nào

| # | Điểm coupling | Mức | Bằng chứng / hệ quả |
|---|---|---|---|
| C-1 | **game.js ↔ v2glue.js qua `window.WK*`** (~15 hàm, dòng 3553–3595 của game.js) | 🔴 Cao | Đổi chữ ký bất kỳ hàm `WK*` nào (vd `WKSpawnGems` thiếu `vx/vy/t` từng làm gem thành NaN — M20) là bosses/monsters/glue chết im lặng trong `try/catch`. Không test nào kiểm tra đủ các chữ ký này (xem §4). |
| C-2 | **game.js đọc `V2.runMods` trong `newShip()` nhưng `V2.boot()` chạy sau `resetGame()` đầu tiên** | 🔴 Cao | Xem Finding F-02: Workshop mất tác dụng ở run đầu mỗi lần tải trang. Thứ tự 2 dòng cuối game.js (3599–3600) là load-bearing. |
| C-3 | **Hai `MONSTER_REGISTRY`/`ACTS` song song**: bản nội bộ trong game.js (dòng 2170+, 8 quái + boss cũ) và bản `Monsters` trong monsters.js (14 quái) + `Campaign.ACTS` | 🔴 Cao | Engine chỉ dùng registry **nội bộ** cho spawn thường; monsters.js chỉ được glue dùng để *kiểm tra tồn tại* khi map wave comp (`v2glue.js:204`). Thêm quái ở monsters.js mà không thêm vào game.js → campaign map về quái tương đương qua `ADD_MAP`, không lỗi nhưng cũng không phải quái mới. Đây là nguồn nhầm lẫn lớn nhất cho dev mới (xem F-05). |
| C-4 | `tutorial.js` poll trực tiếp `G`, `UPS`, `spawnEnemyAt`, `bounds`, `openDraft`… qua global scope | 🟠 Trung | Đổi tên field trong `G` hoặc `UPS` là tutorial hỏng thầm (nó guard `typeof` nên không crash — và cũng không ai biết nó đã chết). |
| C-5 | `game.js` top-level dùng ngay `I18N.t(...)` (bảng `DIFFS`, dòng ~28) và `AudioEngine.setSettings` (dòng ~41) **không guard** | 🟠 Trung | Audit cũ đã ghi: chỉ vỡ nếu i18n/audio lỗi tải — nhưng đây là 2 điểm "cứng" duy nhất trong file mà mọi chỗ khác đều guard. Thứ tự script trong game.html là thứ duy nhất bảo vệ chúng. |
| C-6 | Chuỗi sự kiện boss chết có **3 đường**: `killBoss()` (boss cũ, game.js:2747) → `V2.onBossKill()`; `Bosses` module → hooks `onBossDead` → `V2.onStageBossDead()`; `Campaign.onBossKill()` | 🟠 Trung | Nối tính năng "khi hạ boss" (như M22 unlock) mà chọn sai đường là tính năng chỉ chạy ở 1 chế độ. Spec §5.4 chốt đường đúng. |
| C-7 | `menu.js` ↔ game qua **query string + BroadcastChannel**: menu mở `game.html?diff=&profile=&music=&sfx=&sat=&stage=&daily=&endless=`; game trả `gameover` qua bus `windowkill_bus` | 🟠 Trung | Đổi tên param/`DIFF_KEY` là điểm/kỷ lục ghi sai ngăn mà không lỗi. `DIFFS.hard = DIFFS.hardcore` alias (game.js) tồn tại chính vì cú trượt này từng xảy ra. |
| C-8 | Satellite system (~1.600 dòng đầu game.js: SatManager + nest/bomb/giant/mother/lover/mirror/blackhole/fragment) dùng chung `G.enemies`, `bounds()`, `damageEnemy` với core loop | 🟠 Trung | Mọi thay đổi ở vòng đạn/quái trong `update()` phải rà lại mirror-reflect (`mirrorReflect(bl)`) và blackhole — hai hook nằm *giữa* vòng lặp đạn (game.js ~2890). M22 cũng phải chen vào đúng vòng này (spec §5.3.4/5.3.5 đã tính). |

## 1.4 game.js 3.603 dòng — có nên tách?

**Kết luận: KHÔNG tách ngay; tách có điều kiện, sau M22, theo đường may đã có sẵn.** Lý do:

- File này không phải "một cục": nó đã có cấu trúc section rõ (window control → SatManager → từng mechanic vệ tinh → input → state → draft → registry → spawn/wave → update → render → loop → bridge). Rủi ro không nằm ở độ dài mà ở **state dùng chung**: mọi thứ đọc/ghi một object `G` và một `ship` duy nhất, cộng ~40 hàm top-level trong cùng IIFE gọi nhau tự do.
- Tách vật lý (vd chuyển SatManager ra file riêng) đòi hỏi expose thêm hàng chục global mới — đúng loại thay đổi đã gây M19/M20. Lợi ích (đọc dễ hơn) nhỏ hơn rủi ro hồi quy khi đội **không có test động cho game.js** (§4: game.js không `require()` được, test hiện tại chỉ là regex tĩnh).
- **Đường tách an toàn nếu làm** (đánh giá, chưa làm): (1) trước hết tách *dữ liệu thuần* — `DIFFS`, `UPS`, `MONSTER_REGISTRY`/`ACTS`/`PICKUP_DEFS` nội bộ — ra `js/gamedata.js` dạng `window.WKData`, vì chúng không giữ state và test tĩnh đã đang assert trên chúng; (2) sau đó mới tách SatManager + các mechanic vệ tinh (chúng đã gần như tự chứa, chỉ cần `G`, `bounds`, `damageEnemy`, `spawnEnemyAt`, `addFloat`, `burst` — đúng 6 dependency, liệt kê được); (3) **không bao giờ tách** `update()`/`render()`/`damageEnemy()` trong cùng một đợt với thay đổi gameplay. Mỗi bước một PR, CI xanh + QA trình duyệt thật trước merge như quy trình hiện tại.
- Ước lượng nếu làm bước (1)+(2): ~900–1.100 dòng rời khỏi game.js, effort 1 sprint nhỏ, rủi ro trung bình — **hoãn sau Season 1 planning**, không chặn M22.

### Findings Phần 1

| ID | Severity | Finding |
|---|---|---|
| F-01 | 🟠 MAJOR | Không có lớp kiểm tra contract giữa game.js ↔ glue/modules: mọi giao tiếp qua `window.*` + `try/catch` nuốt lỗi. 4 sự cố audit trước (M9, M13, M19, M21) cùng một gốc. Giảm rủi ro rẻ nhất: thêm test tĩnh assert call-site cho từng `WK*` (mẫu đã có ở `tests/rebalance.test.js` cho glue) + quy ước "đổi chữ ký bridge = sửa cả 2 phía trong 1 PR". |
| F-02 | 🔴 CRITICAL (mới) | **Workshop mất tác dụng ở run đầu tiên của mỗi lần tải trang game.** `newShip()` (game.js:2071–2073) đọc `V2.runMods`, nhưng `runMods` chỉ được gán trong `V2.boot()` (v2glue.js:57), mà boot được gọi ở game.js:3600 — **sau** `resetGame()` ở dòng 3599, tức sau khi con tàu đầu tiên đã được tạo với `runMods = null`. Từ lần restart thứ 2 trở đi mới đúng. Người chơi mở game, vào run đầu với thông số gốc dù đã mua Xưởng — và gần như không ai phát hiện vì run sau lại "tự khỏi". Fix thuộc Phụ lục A của spec (không thuộc M22 gốc nhưng cùng sprint). |
| F-03 | 🟡 MINOR | Bất đối xứng thứ tự load i18n giữa 2 trang (§1.2) + 2 điểm dùng cứng không guard ở đầu game.js (C-5). Chưa gây lỗi; ghi lại để người thêm module mới không vấp. |

---

# PHẦN 2 — DEAD CODE & TRÙNG LẶP

Phương pháp: với mỗi global/hàm export, đếm call-site ngoài file định nghĩa (grep toàn repo gồm HTML + tests). "Dead" = 0 call-site. Cần phân biệt **dead vô hại** (API dự trữ cho module khác, có tài liệu) với **dead nguy hiểm** (trông như đang hoạt động nhưng không).

| ID | Severity | Mục | Bằng chứng |
|---|---|---|---|
| D-01 | 🔴 (đây chính là M22) | Toàn bộ `window.Upgrades2` | 0 consumer ngoài chính nó: grep `Upgrades2\|rollDraft\|unlockBossStage\|thornBorder\|inertiaAnchor\|owlEye\|explosive\|selfGlue` trong `js/` (trừ upgrades2.js), HTML, tests → **không một kết quả**. Chi tiết Phần 5. |
| D-02 | 🟠 MAJOR | **5/10 node Workshop không có consumer**: `getRunModifiers()` (meta.js:180–194) trả `waveRepairPx`, `thornsDmg`, `pickupMul`, `freeUpgrade`, `secondLife` — grep 5 key này ngoài meta.js: **0 kết quả**. Cụ thể: vá cuối wave hardcode `growWindow(40, 30)` (game.js:2854); `newShip()` hardcode `thorns: 0, dropMul: 1` (game.js:2080); không có chỗ nào mở draft đầu run cho `freeUpgrade`; `hurtShip()`/`die()` không hề biết `secondLife`. Người chơi mua node 6–10 (tổng 350–1.280 mảnh) là **mất tiền oan** — cùng tính chất với M22 nhưng ở hệ thống đã "ra mắt". Phụ lục A. |
| D-03 | 🟠 MAJOR | `Meta.check("upgrade", {distinct})` — sự kiện mở achievement #15 "Full Build" (6 nâng cấp khác nhau trong 1 run) — **không có caller nào** trong toàn repo (grep `check("upgrade"` → 0). Draft hiện tại không báo cáo số nâng cấp đã chọn cho Meta ở bất kỳ đâu, nên achievement #15 không thể mở bằng đường chính thống. Spec §5.3.1 nối luôn điểm này vì draft là nơi duy nhất đếm được `distinct`. |
| D-04 | 🟡 MINOR | Registry quái **trùng đôi**: game.js giữ `MONSTER_REGISTRY` nội bộ (8 loại: chaser/chewer/tank/dasher/splitter/mini/weaver/spitter…) phục vụ spawn thật; monsters.js giữ registry 14 loại + `makeEnemy()` factory "độc lập" + miniboss/debut — phần lớn **chỉ dùng cho campaign map kiểm tra tồn tại**. Hai bảng đã lệch nhau (monsters.js có `hpAt/speedAt(diff)`, game.js có `hp(w)/spd(w)`). Không nên "dọn" bằng cách xóa một phía trong maintenance — cần quyết định kiến trúc (hợp nhất về một registry) ở sprint riêng. |
| D-05 | 🟡 MINOR | Helper `clamp`/`rand`/`dist2`/storage được định nghĩa lại ở **≥11 file** (bg, bosses, cinema, game, juice, juice2, monsters, stagefx, tutorial, upgrades2, meta…). Đây là hệ quả có chủ đích của quy ước "module tự chứa, không sửa file khác" — chấp nhận được, nhưng mỗi bản sao là một cơ hội lệch hành vi (vd `clamp` của game.js dùng `Math.min/max`, các bản khác dùng ternary — tương đương, hiện chưa lệch). Ghi nhận, không khuyến nghị refactor. |
| D-06 | 🟡 MINOR | `Upgrades2.T()` (upgrades2.js:32–40) tra i18n bằng key `upg.<id>` (vd `upg.gai_phan`) — **không tồn tại key nào như vậy** trong i18n.js (bảng key thật là `upg.firerate.name/.desc`… của 12 món cũ; grep `upg.gai\|upg.dan_\|upg.keo\|upg.mat\|upg.neo` → 0). Hàm luôn rơi về chuỗi VI cứng. Hệ quả: 6 nâng cấp M22 khi nối vào sẽ **chỉ có tiếng Việt** kể cả ở chế độ EN, và cấu trúc `T(key, vi)` hiện tại không phân biệt được name/desc nên không sửa được chỉ bằng cách thêm key. Spec §5.6 xử lý rõ điểm này. |
| D-07 | ⚪ INFO | Các global "ít dùng nhưng có chủ đích", **không phải dead**: `WKPortal.force()` (0 caller — đã ghi ở backlog audit cũ, là API thủ công cho console), `window.WKBuzz` (mobile.js, cho console/core gọi tay), `Meta.syncToServer/getLocalLeaderboard` (stub chờ backend), `Campaign` export cho node test. Liệt kê để đợt dọn dẹp sau không xóa nhầm. |
| D-08 | ⚪ INFO | `js/game.js` còn nhánh boss cũ đầy đủ (spawnBoss/killBoss/block update boss ~150 dòng) chạy song song boss module — đây là boss của chế độ endless, **đang sống**, không phải dead code. Đừng xóa khi thấy "trùng" với bosses.js. |

---

# PHẦN 3 — STATE & SAVE (localStorage)

## 3.1 Schema hiện tại — không có một schema chung, có 5 "đảo" lưu trữ

| Đảo | Key | Chủ sở hữu | Phạm vi profile? | Ghi chú |
|---|---|---|---|---|
| Profiles & settings | `wk_profiles` (JSON array `{id,name,avatar,createdAt}`), `wk_active_profile`, `wk_settings` (JSON, có defaults merge + sửa giá trị hỏng ở menu.js:125) | menu.js (`store.get/set` tự chế) | — | Entry hỏng đã được sanitize sau audit M2 |
| Kỷ lục cổ điển | `wk_high_<diff>` và `wk_high_<diff>_<profileId>`, `wk_stats` / `wk_stats_<profileId>` | menu.js + game.js (die() đọc `wk_high_*`) | ✅ theo profile | Hai biến thể key (có/không profile) cùng tồn tại — legacy |
| Meta v2 | `wk_meta_shards`, `wk_meta_shards_total`, `wk_meta_workshop`, `wk_meta_skins`, `wk_meta_skin_active`, `wk_meta_achv`, `wk_meta_stats`, `wk_meta_daily`, `wk_meta_unlock_hn` | meta.js (hằng `K`, ghi "TUYỆT ĐỐI không đổi") | ❌ **toàn cục** | Đã được audit cũ nêu (mục 5.4 của FULL-AUDIT): campaign thì theo profile, meta thì không → đổi profile vẫn chung shards/workshop/achievements. Chưa có quyết định sản phẩm. |
| Campaign | `wk_unlocked_stage_<profileId>`, `wk_stage_best_<profileId>`, `wk_unlocked_endless_<profileId>` | campaign.js | ✅ theo profile | Mẫu key sạch nhất trong repo |
| Lặt vặt | `wk_lang` (i18n), `wk_tut_v1_<profileId>` (tutorial), `wk_sat_pref`, `wk_score_tip_seen`, `wk_analytics`, `wk_api_base` | rải rác | lẫn lộn | Mỗi module tự bọc try/catch riêng |

## 3.2 Versioning & migration — gần như không có

- **Không có key version tổng** (không `wk_save_version` hay tương đương) và không có hàm migration nào cho meta/campaign. Migration duy nhất trong repo là ở menu.js:~281 (gộp kỷ lục legacy toàn cục vào profile đầu tiên) và cơ chế "defaults merge" từng đảo (`STATS_DEFAULT` trong meta.js, settings defaults trong menu.js, skin tự unlock hồi tố trong `Skins.getUnlocked`).
- Cách tiếp cận hiện tại là **"thêm field thì điền default khi đọc"** (`Object.assign({}, DEFAULTS, saved)` / `int0()` ép số). Cách này an toàn với *thêm* field, nhưng **không an toàn với đổi ngữ nghĩa**: vd nếu Season 1 đổi giá Workshop hoặc đổi công thức shards, save cũ sẽ bị hiểu theo nghĩa mới mà không có điểm chặn nào để chuyển đổi/bồi thường.
- Điểm sáng: meta.js ép kiểu rất kỷ luật (`int0`, clamp level theo `max` khi đọc Workshop) — save bị sửa tay/hỏng JSON trả về default thay vì crash; mẫu này nên là chuẩn cho mọi đảo mới.

## 3.3 Điểm nghẽn khi thêm tính năng mới (Season 1)

| ID | Severity | Điểm nghẽn |
|---|---|---|
| S-01 | 🟠 MAJOR | **Quyết định profile-scope cho `wk_meta_*` phải chốt trước Season 1.** Season pass / season stats gần như chắc chắn cần theo profile *hoặc* toàn cục một cách có chủ đích. Đổi sau khi người chơi đã tích lũy = bắt buộc migration + nguy cơ mất tiến trình. Đây là quyết định sản phẩm, không phải kỹ thuật — cần user/lead chốt, kỹ thuật chỉ thực thi. |
| S-02 | 🟠 MAJOR | Không có save-version → Season 1 nên bắt đầu bằng việc **giới thiệu `wk_save_version` = 1 ngay bây giờ** (ghi kèm, chưa cần migration nào) để mùa sau có điểm tựa. Effort ~10 dòng ở meta.js + menu.js. Đây là việc rẻ nhất trong toàn bộ báo cáo so với giá trị của nó. |
| S-03 | 🟡 MINOR | Mỗi module tự chế một lớp storage (`lsGet/lsSet` xuất hiện ở meta, campaign, tutorial, menu `store`, analytics `store`) với fallback khác nhau (chỉ meta.js có fallback RAM khi bị chặn storage kiểu Poki/incognito). Module Season 1 viết mới nên dùng lại lớp của meta.js thay vì chế thêm bản thứ 6. |
| S-04 | 🟡 MINOR | Daily lưu theo key ngày `YYYYMMDD` cộng dồn vô hạn trong `wk_meta_daily` (mỗi ngày 1 entry nhỏ — vài năm mới đáng kể, nhưng không có dọn dẹp). Chưa cần xử lý; ghi nhận. |
| S-05 | ⚪ INFO | Tin tốt cho M22: Upgrades2 **không cần save migration nào** — state của nó là theo run/trang (§5.5). Người đã mua Workshop thì liên quan Phụ lục A, cũng không cần migration vì `getRunModifiers()` đọc save hiện hữu mỗi lần boot. |

---

# PHẦN 4 — TEST & CI

## 4.1 Kết quả chạy thật

```
$ node --test tests/*.test.js
ℹ tests 68 · suites 23 · pass 67 · fail 0 · skipped 1 · duration ≈ 4,1s
```

Khớp baseline. Cần nói thẳng về **bản chất** của 67 test này: phần lớn là **test tĩnh** — đọc source bằng `fs`, assert bằng regex/sự hiện diện của chuỗi, kiểm tra file tồn tại/định dạng. Chỉ một số ít là test động (`require()` module rồi gọi hàm): campaign/meta qua `module.exports`, difficulty config qua JSON. game.js — file quan trọng nhất — **không thể test động** vì là browser script thuần không export (đó chính là nội dung test bị skip duy nhất, kèm đề xuất tách `js/logic.js`).

## 4.2 Bản đồ phủ test hiện tại

| File test | Phủ cái gì | Động/Tĩnh |
|---|---|---|
| `smoke.test.js` (143 dòng) | Assets bắt buộc tồn tại + magic bytes; mọi `src/href` local trong HTML resolve được; CSP meta; không inline handler; `node --check` cho audio/menu/game/electron; hằng số gameplay (3 độ khó, 12 upgrade, 6 loại quái, boss mỗi 5 wave); chống XSS ở menu; bảo mật Electron; CI tồn tại | Tĩnh |
| `game-logic.test.js` (215 dòng) | Regression core loop bằng regex (rAF loop, `startWave(G.wave+1)`, draft khi lên cấp, combo không nhân điểm, wave-clear vá cửa sổ, 3 pickup gốc) + khối registry bị skip-guard vì game.js không export được | Tĩnh (+1 skip) |
| `rebalance.test.js` (65 dòng) | Thông số rebalance CEO (chill/normal-onboarding/hardcore) khớp `difficulty.config.json`; campaign 5 stages; **hook points của v2glue trong game.js** — mẫu test tĩnh tốt nhất trong repo, spec M22 sẽ nhân rộng mẫu này | Động (require campaign) + tĩnh |
| `pwa.test.js` (217 dòng) | manifest hợp lệ + icons; sw.js dùng Cache API/fetch/install; offline.html; robots/sitemap; khai báo PWA trong HTML | Tĩnh |
| `analytics.test.js` (87 dòng) | Quyền riêng tư: không fingerprint, không raw UA, không cookie, tôn trọng DNT | Tĩnh |

## 4.3 Gap theo rủi ro

| ID | Rủi ro | Gap |
|---|---|---|
| T-01 | 🔴 Cao | **Bosses: 0 test.** 1.271 dòng, 5 boss × 3 phase, contract hooks với glue từng sai field (M9) mà không test nào bắt được. Tối thiểu cần test tĩnh assert tên field contract (`bossHpMul/telegraphMul/boss5Timer/enemySpdMul`) ở cả 2 phía glue ↔ bosses. |
| T-02 | 🔴 Cao | **Meta/Workshop: hành vi gần như không có test động.** `meta.js` có `module.exports` và các hàm thuần (`buyNode`, `getRunModifiers`, `rewardsForRun`, daily seeded RNG) test được ngay trong Node với localStorage stub — nhưng hiện không có file test nào require nó (rebalance chỉ chạm campaign). Đây là gap "rẻ nhất để lấp, giá trị cao nhất": tiền tệ trong game đang không có lưới an toàn. Spec §5.7 có kế hoạch test cho M22; khuyến nghị mở rộng luôn cho Workshop. |
| T-03 | 🟠 Trung | **Campaign: chỉ phủ "đủ 5 stages" + wave comp cơ bản.** Chưa test unlock progression, kẹp stage chưa mở (fix M10), `getRunParams` theo độ khó. |
| T-04 | 🟠 Trung | **Save migration/corruption: 0 test tự động.** Đợt audit trước verify save hỏng bằng CDP thủ công (M2) nhưng không để lại test. Với S-02 (save version) nên kèm test: nạp save hỏng/thiếu field → không crash, ra default. |
| T-05 | 🟠 Trung | **Draft & upgrades (kể cả 12 món cũ): 0 test hành vi.** Chỉ có test đếm "đủ 12 nâng cấp" bằng regex. M22 sẽ là lần đầu draft có test (spec §5.7) — và cũng là lúc nên pin hành vi cũ: draft không trùng, món có `can()` bị loại đúng. |
| T-06 | 🟡 Thấp | i18n: chưa có test "mọi key dùng trong code đều có trong từ điển vi+en" — loại test tĩnh rẻ mà sẽ bắt được lỗi kiểu D-06/m7 (raw key lộ ra banner) trước khi lên production. |
| T-07 | 🟡 Thấp | Tutorial, stagefx, juice/juice2, cinema, monsters (registry 14 loại): 0 test. Chấp nhận được ở mức tĩnh tối thiểu (export tồn tại, registry đủ số loại) — riêng monsters nên có vì nó là dữ liệu cân bằng game. |

## 4.4 CI (`.github/workflows/ci.yml`)

CI hiện chạy (1 job, Node 24, ubuntu-latest): `node --check` cho **mọi** `js/*.js` + `server/src/*.js` + tests → `node --test tests/*.test.js` → kiểm tra 4 asset bắt buộc → `npm audit` (chỉ khi có package.json ở root — hiện không có, nên bước này đang là no-op in ra "skip").

Thiếu, theo thứ tự đáng làm:

1. **Không có lint** (không ESLint/config nào trong repo). Một lint tối thiểu (`no-undef` trên tập global đã khai báo) sẽ bắt được một phần lỗi contract kiểu C-1/T-01. Đây là khoảng trống lớn nhất của CI so với công sức bỏ ra.
2. **Chỉ 1 phiên bản Node (24)** — chấp nhận được (game chạy trên browser, Node chỉ để test), không khuyến nghị ma trận.
3. **Không kiểm tra `server/tests/`** — backend có test riêng (`server/tests/api.test.js`) nhưng CI root không chạy. (Ngoài phạm vi frontend, ghi nhận để team backend biết.)
4. Không có bước kiểm tra trùng thẻ script trong HTML / precache SW khớp danh sách file js (lỗi M1/m3 từng lọt). Một test tĩnh trong `pwa.test.js` assert mọi `js/*.js` xuất hiện trong `sw.js` precache là đủ — rẻ và đúng bệnh.
5. CI chỉ trigger trên `main` (push + PR vào main) — đúng quy ước branch của studio, không đổi.

---

---
---

# PHẦN 5 — M22 WIRING SPEC

> **Mini-spec độc lập.** Đọc riêng phần này là đủ để triển khai M22 mà không cần đọc Phần 1–4.
> Đối tượng: nối 6 nâng cấp của `js/upgrades2.js` (đã viết xong, chưa từng được gọi) vào engine `js/game.js`.
> Nguyên tắc xuyên suốt: **tái dùng nguyên vẹn các helper đã có trong upgrades2.js** (chúng đã đúng và đã tự chứa), chỉ viết lớp nối mỏng trong game.js + 1 dòng trong v2glue.js. Không sửa chữ ký public nào của Upgrades2.

## 5.1 Hiện trạng & bằng chứng "mua/chọn mà không tác dụng"

Nói chính xác hơn theo đúng bản chất của hệ thống: Upgrades2 không phải đồ mua — chúng là **draft upgrade** hứa hẹn xuất hiện khi lên cấp. "Không tác dụng" ở đây tệ hơn cả mua hụt: **người chơi không bao giờ nhìn thấy chúng**, vì:

1. **Draft không biết đến Upgrades2.** `openDraft()` (game.js:2111) chỉ bốc từ mảng nội bộ `UPS` (12 món cũ):
   ```js
   const pool = UPS.filter(u => !u.can || u.can(G.ship));
   ```
   Không có `Upgrades2.rollDraft()` / `draftPool()` ở bất kỳ đâu.
2. **6 field effect không có reader.** `apply()` của mỗi nâng cấp ghi một field lên ship (`ship.thornBorder`, `ship.inertiaAnchor`, `ship.owlEye`, `ship.explosive`, `ship.chain`, `ship.selfGlue`). Grep cả 6 tên field trong toàn repo ngoài upgrades2.js → **0 kết quả**. Engine không đọc, helper runtime (`checkThornBorder`, `tryAnchor`, `tick`, `owlTargets`, `explodeAt`, `chainFrom`) không được gọi.
3. **Unlock không có caller.** `unlockBossStage(2|3|4)` — điều kiện mở 3 món độc quyền ải — không được gọi từ `killBoss()`, `V2.onBossKill()` hay `V2.onStageBossDead()`.
4. **`resetRun()` không có caller** — kể cả khi nối draft, không reset thì `_taken` sẽ rò qua các run trong cùng phiên trang.

Bằng chứng tái lập (chạy lại được):
```bash
grep -rn "Upgrades2" js/ index.html game.html tests/ | grep -v "js/upgrades2.js"
# → (rỗng)
```

## 5.2 Sáu nâng cấp — lời hứa UI & cơ chế đã có sẵn

Nguồn: `LIST` trong upgrades2.js:14–59. Cột "helper" là hàm runtime **đã viết sẵn** trong cùng file.

| # | id | Tên (VI) | Mô tả hứa với người chơi | Pool / điều kiện mở | `apply(ship)` ghi | Helper sẵn có |
|---|---|---|---|---|---|---|
| 1 | `gai_phan` | Gai Phản | "Tàu chạm viền: gây 3 sát thương cho mọi quái trong 120px." | `stage2` — sau khi hạ boss ải 2 | `ship.thornBorder = {dmg:3, r:120}` | `checkThornBorder(ship, enemies, bounds, dealDamage)` |
| 2 | `neo_quan_tinh` | Neo Quán Tính | "Nhấn Shift: dừng trượt tức thì. Hồi chiêu 8s." | `stage3` — sau boss ải 3 | `ship.inertiaAnchor = {cd:0, max:8}` | `tryAnchor(ship)`, cooldown đếm trong `tick()` |
| 3 | `mat_cu` | Mắt Cú | "Lúc mất điện: hiện outline mờ mọi quái trong 200px quanh tàu." | `stage4` — sau boss ải 4 | `ship.owlEye = {r:200}` | `owlTargets(ship, enemies)` → mảng quái (phần vẽ do engine lo) |
| 4 | `dan_no` | Đạn Nổ | "Đạn nổ lan r60, gây 1 sát thương — dọn trứng và bầy mini." | `common` — có ngay | `ship.explosive = {r:60, dmg:1}` | `explodeAt(x, y, hit, enemies, dealDamage, ship)` |
| 5 | `dan_xich` | Đạn Xích | "Đạn trúng quái nảy sang quái gần nhất trong 150px, 50% sát thương." | `common` — có ngay | `ship.chain = {r:150, mul:0.5}` | `chainFrom(hit, enemies, dmg, dealDamage, ship)` |
| 6 | `keo_tu_va` | Keo Tự Vá | "Mỗi 20s tự vá +10px cửa sổ." | `common` — có ngay | `ship.selfGlue = {t:0, every:20, px:10}` | `tick(ship, dt)` → `{glue:10}` mỗi 20s |

Ghi chú trung thực về helper, phát hiện khi đọc kỹ (ảnh hưởng thiết kế ở §5.3):

- ⚠️ **`checkThornBorder` không có cooldown.** Gọi mỗi frame khi tàu chạm viền = 3 dmg × ~60fps cho mọi quái trong 120px — phá cân bằng hoàn toàn. Spec bắt buộc bọc throttle ở phía engine (§5.3.3), không sửa helper.
- ⚠️ **Bất đối xứng `bounds`:** helper chờ `{l, t, r, b}`, engine dùng `bounds()` trả `{x, y, w, h}`. Cần adapter 1 dòng ở call-site.
- ⚠️ **`explodeAt` đọc ship qua tham số thứ 6** (hoặc `hit._ship`). Call-site phải truyền tường minh `G.ship` làm arg 6 — đừng gán `_ship` lên đạn (đạn được tạo ở nhiều nơi).
- ⚠️ **`tryAnchor` dập `vx/vy/slideVx/slideVy`** — ship của engine **không có** các field này (di chuyển là cộng trực tiếp vị trí + `kbvx/kbvy` cho knockback). Helper đã guard `!== undefined` nên an toàn; tác dụng thực tế trong engine hiện tại = **xóa knockback ngay lập tức**. "Trượt" đúng nghĩa chỉ tồn tại ở mechanic trơn ải 3 (StageFX slippery giữ impulse riêng `ivx/ivy` và có hàm nội bộ `stabilize()` nhưng **không export** qua `window.StageFX`). Spec §5.3.6 chốt phạm vi v1 cho khớp thực tế này và ghi rõ phần mở rộng.
- ✅ `tick()` gộp cả hai việc theo thời gian (cooldown Neo + timer Keo) — một call-site duy nhất lo cả 2 nâng cấp + throttle Gai Phản nếu đặt cùng chỗ.

## 5.3 Thiết kế nối — theo từng điểm hook

### 5.3.0 Bảng tổng điểm chạm (tất cả thay đổi)

| File | Vị trí | Thay đổi | Dòng áng chừng |
|---|---|---|---|
| `js/game.js` | `openDraft()` :2111 | Gộp pool draft: 12 món cũ + Upgrades2 (slot bảo đảm) | ~45 |
| `js/game.js` | vòng đạn-ta trong `update()` :~2885–2900 | Sau `damageEnemy(e, bl.dmg, bl)` → gọi `explodeAt` + `chainFrom` | ~15 |
| `js/game.js` | đầu khối timer tàu trong `update()` :~2810 | `Upgrades2.tick()` (Keo + cooldown Neo) + Gai Phản có throttle | ~22 |
| `js/game.js` | handler `keydown` :1950 | Shift → `tryAnchor` | ~6 |
| `js/game.js` | cuối `render()`, sau lời gọi `V2.drawOver(...)` | Vẽ outline Mắt Cú khi đang mất điện | ~15 |
| `js/game.js` | `resetGame()` :2632 | `Upgrades2.resetRun()` | ~3 |
| `js/v2glue.js` | `onStageBossDead()` :145 | `Upgrades2.unlockBossStage(self.stageId)` + thông báo float/banner | ~5 |
| `tests/upgrades2.test.js` | **mới** | Unit (require trực tiếp) + static integration (§5.7) | ~180 |
| `js/game.js` | hằng `U2_ICON` cạnh `UPS` | Map icon cho 6 món (dùng sprite sẵn có, §5.6) | ~8 |

**`js/upgrades2.js`: 0 dòng thay đổi.** `js/meta.js`: 0 dòng (M22 không liên quan lưu trữ — xem §5.5).

### 5.3.1 Draft — `openDraft()` (điểm nối quan trọng nhất)

Thiết kế: **slot bảo đảm**. Trong 3 lá draft, dành tối đa 1 slot cho Upgrades2 nếu pool của nó còn món — lý do: (a) tính năng phải *thấy được* để QA/người chơi kiểm chứng, bốc thuần ngẫu nhiên trên pool gộp 12+6 sẽ làm món độc quyền ải (chỉ mở sau boss, khi run đã sâu) gần như không bao giờ xuất hiện; (b) test tĩnh/động dễ pin hành vi. Đây là quyết định cân bằng có thể chỉnh bằng một hằng số (`U2_DRAFT_SLOTS = 1`), ghi rõ để Game Design đổi nếu muốn thuần ngẫu nhiên.

```js
// cạnh UPS — icon lấy từ sprite sẵn có trong game.html (xem §5.6)
const U2_ICON = { gai_phan: "i-shield", neo_quan_tinh: "i-bolt", mat_cu: "i-ghost",
                  dan_no: "i-bomb", dan_xich: "i-split", keo_tu_va: "i-heart-plus" };

function openDraft() {
  G.phase = "draft";
  const pool = UPS.filter(u => !u.can || u.can(G.ship));
  const picks = [];
  // M22: slot bảo đảm cho Upgrades2 (rollDraft đã tự loại món đã lấy + món chưa mở khoá ải)
  if (window.Upgrades2) {
    try {
      const u2 = Upgrades2.rollDraft(1);
      if (u2.length) {
        const u = u2[0];
        picks.push({ ico: U2_ICON[u.id] || "i-sparkles", t: u.nameVi, d: u.descVi,
                     apply: s => Upgrades2.applyUpgrade(u.id, s) });
      }
    } catch (er) {}
  }
  while (picks.length < 3 && pool.length)
    picks.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  if (!picks.length) { G.phase = "play"; return; }
  /* …phần Cinema.showDraft / openDraftLegacy giữ nguyên — cả hai đều chỉ gọi picks[i].apply(G.ship)… */
}
```

Vì cả hai đường hiển thị draft (Cinema + legacy) đều trừu tượng qua `{t, d, ico, apply}`, **không cần sửa cinema.js hay `openDraftLegacy`** — món Upgrades2 đi qua đúng đường cũ. Ba lưu ý bắt buộc:

1. **`applyUpgrade` có thể trả `null`** (nếu id bị khóa/lấy trùng do race) — wrapper `apply` bỏ qua kết quả là chấp nhận được vì `rollDraft` chỉ trả món hợp lệ tại thời điểm bốc; nhưng float text "đã nhận" ở call-site hiện tại in `u.t` vô điều kiện → người chơi thấy thông báo dù không áp được. Chấp nhận ở v1 (race gần như không thể xảy ra: draft đóng băng game), ghi nhận.
2. **Đếm distinct cho achievement #15 (fix luôn D-03):** duy trì `G.upgTaken` (Set hoặc object) — mỗi lần bất kỳ món nào (cũ + mới) được apply trong draft, thêm định danh vào và gọi `Meta.check("upgrade", {distinct: <số đếm>})` qua `V2` hoặc trực tiếp `window.Meta` có guard. Đây là chỗ duy nhất trong codebase đếm được con số này. Cần khởi tạo lại trong `resetGame()`.
3. **Daily modifier M7 "draft 4 lựa chọn"** hiện cũng chưa được nối (ngoài phạm vi M22) — nếu sau này nối, hằng số `3` trong vòng `while` phải thành biến; đừng hardcode chồng.

### 5.3.2 Callback sát thương dùng chung — quy ước chống đệ quy

Hai helper đạn (Nổ/Xích) và Gai Phản đều nhận `dealDamage(enemy, dmg)`. **Định nghĩa duy nhất, dùng cho cả ba:**

```js
const u2DealDamage = (e, dmg) => damageEnemy(e, dmg, null);
```

- Truyền `bl = null`: `damageEnemy` (game.js:3102) xử lý được (knockback từ đạn bị bỏ qua, slow từ `G.ship.slow` vẫn áp — nhất quán với đường thorns sẵn có ở game.js:2944 cũng gọi `damageEnemy(e, s.thorns, null)`).
- **Chống đệ quy là tính chất kiến trúc, không phải may rủi:** các hook Nổ/Xích được đặt tại *call-site va chạm đạn* (§5.3.4), **không** đặt bên trong `damageEnemy`. Sát thương lan/xích đi qua `damageEnemy` nên không thể kích hoạt lan/xích tiếp. Xích vì thế luôn đúng 1 nảy (khớp mô tả "nảy sang quái gần nhất", không phải nảy chuỗi vô hạn). **Cấm** người implement "tiện tay" chuyển hook vào trong `damageEnemy` — sẽ tạo đệ quy nổ→nổ và xích→xích.
- Tín dụng kill (điểm/gem/combo) tự đúng vì mọi đường đều kết thúc ở `damageEnemy → killEnemy`.

### 5.3.3 Tick theo thời gian + Gai Phản — trong `update(dt)`

Đặt ngay cạnh khối đếm ngược timer tàu sẵn có (`s.iframes = …`, game.js:~2810), chỉ chạy khi `G.phase === "play"` (đúng ngữ cảnh của `update`):

```js
/* M22: Upgrades2 tick — Keo Tự Vá + hồi chiêu Neo Quán Tính + Gai Phản (throttle 0,5s) */
if (window.Upgrades2 && s) {
  try {
    const ev = Upgrades2.tick(s, dt);
    if (ev && ev.glue) {
      growWindow(ev.glue, Math.round(ev.glue * 0.75)); // cùng tỉ lệ 40→30 của vá cuối wave
      addFloat(s.x, s.y - 40, `+${ev.glue}px`, "#9df3ff");
    }
    if (s.thornBorder) {
      s._thornCd = Math.max(0, (s._thornCd || 0) - dt);
      if (s._thornCd <= 0) {
        const hits = Upgrades2.checkThornBorder(s, G.enemies,
          { l: b.x, t: b.y, r: b.x + b.w, b: b.y + b.h }, u2DealDamage);
        if (hits > 0) s._thornCd = 0.5;
      }
    }
  } catch (er) {}
}
```
(`b` là `bounds()` đã có ở đầu `update`.)

Quyết định cần ghi rõ:
- **Throttle 0,5s cho Gai Phản** → DPS tối đa 6/quái trong vùng thay vì ~180. Con số 0,5s là đề xuất của spec này (helper gốc không quy định) — Game Design có thể chỉnh; điều không thể thương lượng là *phải có* throttle.
- Keo Tự Vá dùng `growWindow(px, px*0.75)` vì `growWindow(dw, dh)` nhận hai chiều và vá cuối wave sẵn có dùng cặp (40, 30). Vá +10px hiểu là +10 bề ngang / +7–8 bề dọc — khớp tinh thần "px cửa sổ" của các cơ chế vá khác. Trong arena ảo (fallback resize bị chặn) `growWindow` tự xử lý.
- `_thornCd` là field tạm trên ship — an toàn vì ship được tạo mới mỗi run (§5.5).

### 5.3.4 Đạn Nổ + Đạn Xích — trong vòng đạn-ta của `update()`

Điểm chèn duy nhất: nhánh đạn trúng quái thường (game.js:~2891), ngay sau `damageEnemy(e, bl.dmg, bl)`:

```js
damageEnemy(e, bl.dmg, bl);
/* M22: Đạn Nổ (lan r60, 1 dmg) + Đạn Xích (nảy 50%) — hook tại call-site, KHÔNG đặt trong damageEnemy (chống đệ quy, §5.3.2) */
if (window.Upgrades2 && (s.explosive || s.chain)) {
  try {
    if (s.explosive) Upgrades2.explodeAt(bl.x, bl.y, e, G.enemies, u2DealDamage, s);
    if (s.chain)     Upgrades2.chainFrom(e, G.enemies, bl.dmg, u2DealDamage, s);
  } catch (er) {}
}
if (bl.pierce > 0) bl.pierce--; else dead = true;
```

Phạm vi v1, chốt rõ để QA không báo "thiếu":
- **Chỉ áp cho quái thường** (`G.enemies`). Đạn trúng boss cũ (`G.boss`) và boss module (`V2.hitBoss`) **không** kích nổ lan/xích trong v1 — helper được thiết kế trên mảng enemies; mở rộng sang boss là việc riêng (boss không có "quái gần nhất" rõ ràng khi đứng một mình, và AoE quanh boss sẽ farm adds quá mạnh).
- **Pierce:** mỗi quái trúng trên đường xuyên đều kích hoạt một lần — đúng mô tả, và là tương tác mạnh có chủ đích (pierce + nổ là build). Không cộng dồn nhiều lần trên cùng một quái vì vòng lặp `break` sau mỗi hit như cũ.
- Thứ tự Nổ trước Xích: nổ có thể giết quái mà xích định nảy tới — `chainFrom` tự bỏ qua `e.dead` nên an toàn.
- Hiệu năng: cả hai helper là O(n) trên enemies cho mỗi hit — cùng bậc với vòng va chạm hiện tại, không đổi độ phức tạp khung hình.

### 5.3.5 Mắt Cú — vẽ ở cuối `render()`

Ràng buộc thứ tự vẽ là điểm tinh tế nhất của spec: lớp mất điện của ải 4 được StageFX vẽ **đè lên trên** mọi entity (hình chữ nhật đen 0,92 alpha) trong `V2.drawOver(...)` — lời gọi nằm ở cuối `render()`. Bất kỳ outline nào vẽ trước điểm đó đều bị che mất. Vì vậy hook phải đặt **sau** lời gọi `V2.drawOver`:

```js
if (window.V2) { try { V2.drawOver(ctx, W, H); } catch (e) {} }
/* M22: Mắt Cú — outline quái trong 200px, CHỈ khi đang mất điện, vẽ SAU lớp blackout */
if (window.Upgrades2 && s && s.owlEye && window.StageFX && StageFX.isDark()) {
  try {
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.lineWidth = 1.5;
    for (const e of Upgrades2.owlTargets(s, G.enemies)) {
      ctx.beginPath(); ctx.arc(e.x, e.y, (e.r || 12) + 3, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  } catch (er) {}
}
```

- Điều kiện `StageFX.isDark()` (đã export sẵn, stagefx.js:525) đúng với lời hứa "lúc mất điện". Ngoài ải 4, `isDark()` luôn `false` → Mắt Cú bốc được ở draft (pool `stage4` mở sau boss ải 4, và sau khi hạ boss ải thì `stageDone` chuyển sang endless thường cùng map) — lưu ý: trong endless sau ải 4 không còn chu kỳ mất điện của StageFX, Mắt Cú sẽ ít đất diễn. Đây là hệ quả thiết kế gốc của pool, ghi nhận để Game Design quyết (có thể cho Mắt Cú hoạt động cả khi `G.blackout` của boss 5 — ngoài phạm vi v1).
- Không vẽ cho `G.dying` (quái đang chạy death-anim) — `owlTargets` đã lọc `e.dead`.

### 5.3.6 Neo Quán Tính — handler Shift trong `keydown`

```js
if ((e.code === "ShiftLeft" || e.code === "ShiftRight") && !e.repeat && G.phase === "play") {
  if (window.Upgrades2) { try { Upgrades2.tryAnchor(G.ship); } catch (er) {} }
}
```
Đặt trong handler `keydown` sẵn có (game.js:1950), cạnh nhánh `KeyP`/`KeyM`.

Phạm vi trung thực của v1 (đọc §5.2): tác dụng thực = **xóa `kbvx/kbvy` tức thì** (thoát khỏi cú hất của quái/bomb/mirror) + đặt cooldown 8s do `tick()` đếm. Tàu của engine không "trượt" theo quán tính khi di chuyển thường (vị trí cộng trực tiếp từ input mỗi frame), nên "dừng trượt" ngoài knockback hiện **chỉ còn một nguồn**: impulse của StageFX slippery ở ải 3 — mà món này lại là độc quyền ải 3. Muốn trọn vẹn lời hứa ở đúng ải của nó, cần một trong hai (chọn khi implement, đều nhỏ): (a) export thêm `StageFX.stabilize()` (hàm nội bộ đã tồn tại, stagefx.js:216 — chỉ thiếu expose) và gọi sau `tryAnchor` khi trả `true`; hoặc (b) chấp nhận v1 chỉ xóa knockback và sửa descVi thành "Xóa hất văng tức thì" cho khỏi hứa quá. **Khuyến nghị (a)** — đúng ải, đúng cơ chế, +2 dòng. Mobile không có Shift: v1 không có tương đương cảm ứng (ghi là giới hạn đã biết; double-tap joystick là việc riêng, không chặn M22).

### 5.3.7 Unlock khi hạ boss ải — `v2glue.js onStageBossDead()`

```js
safe(function () { if (window.Upgrades2) {
  var up = Upgrades2.unlockBossStage(self.stageId);
  if (up && window.G && window.G.ship) addFloatSafe(up); // xem dưới
} });
```
Đặt cạnh `Campaign.onBossKill(self.stageId)` trong `onStageBossDead` (v2glue.js:~150). Thông báo: dùng `window.addFloat(G.ship.x, G.ship.y - 40, "Mở nâng cấp: " + up.nameVi, "#9df3ff", true)` (addFloat đã được game.js expose) — đủ cho v1, không cần banner.

Chốt phạm vi:
- **Chỉ boss ải campaign** (đường `Bosses` module → `onStageBossDead`) mới unlock — khớp thiết kế pool: hạ boss ải 2 → Gai Phản vào pool cho phần còn lại của run (post-boss endless trong cùng phiên) và các draft sau đó.
- Boss cũ ở endless (`killBoss` → `V2.onBossKill`) **không** unlock trong v1. Nếu Game Design muốn endless cũng mở dần theo Act, điểm nối tương tự là `V2.onBossKill` với mapping act→stage — ghi là tùy chọn, không tự ý làm.
- Stage 1 và stage 5 không có món độc quyền (`bossStage` chỉ 2/3/4) — `unlockBossStage` trả `null`, code phải chịu được (đã có `if (up …)`).

### 5.3.8 Reset — chống double-apply & rò state

Trong `resetGame()` (game.js:2632), cùng khối dọn module sẵn có (cạnh `Juice2.reset()`):

```js
try { if (window.Upgrades2) Upgrades2.resetRun(); } catch (e) {}
```

Vì sao đủ và đúng:
- `resetRun()` chỉ xóa `_taken` (món đã chọn), **giữ `_bossBeaten`** — đúng ý đồ: trong cùng một phiên trang, đã hạ boss ải thì độc quyền vẫn mở cho lần chơi lại ngay; thoát về menu = tải lại trang = module state tự sạch. **Không** gọi `resetAll()` trong game loop (nó sẽ khóa lại món độc quyền giữa các run trong cùng phiên — sai ý đồ).
- **Không thể double-apply:** (1) ship là object literal mới tinh từ `newShip()` mỗi `resetGame()` — không field `explosive/chain/…` nào sống sót từ run trước; (2) trong một run, `_taken` + `hasTaken` chặn chọn lại cùng món; (3) `apply()` gán đè field (không cộng dồn) nên kể cả gọi trùng cũng idempotent. Ba lớp độc lập — đây là thiết kế an toàn có sẵn của module, lớp nối không được phá (đừng tự cộng stat ở call-site).
- **Cộng dồn với draft cũ & Workshop:** 6 món Upgrades2 tác động qua *field riêng + sát thương phẳng* (nổ 1, xích ×0,5 theo `bl.dmg`, gai 3, keo 10px), không sửa trực tiếp `s.dmg/fireInt/speed` — nên chúng **tự động xếp chồng đúng** với 12 món cũ (vd Đạn Xích hưởng `bl.dmg` đã gồm cả "Sát thương +1" và `dmgBonus` của Workshop node 3) mà không cần công thức hợp nhất nào. Ngoại lệ duy nhất cần nhớ: Workshop node 7 "Giáp gai" (`thornsDmg`, chưa nối — Phụ lục A) và Gai Phản là **hai cơ chế gai khác nhau** (chạm tàu vs chạm viền) dùng hai field khác nhau (`s.thorns` vs `s.thornBorder`) — không xung đột, đừng gộp.

## 5.4 Luồng dữ liệu hoàn chỉnh (sau khi nối)

```
Hạ boss ải 2/3/4 (Bosses module) ─→ V2.onStageBossDead ─→ Upgrades2.unlockBossStage(stage)
Lên cấp ─→ gainXp ─→ openDraft ─→ rollDraft(1) [slot bảo đảm] + UPS cũ ─→ người chơi chọn
        ─→ Upgrades2.applyUpgrade(id, ship) ─→ ship.<field> được gán, _taken[id]=true
Mỗi frame (play) ─→ update: Upgrades2.tick (keo/cooldown) · checkThornBorder (throttle 0,5s)
                 └→ đạn trúng quái: explodeAt + chainFrom (dealDamage = damageEnemy(e,dmg,null))
Phím Shift ─→ tryAnchor · Mất điện ải 4 ─→ render: owlTargets outline sau lớp blackout
resetGame ─→ newShip() (ship sạch) + Upgrades2.resetRun() (mở lại pool, giữ unlock ải trong phiên)
```

## 5.5 Tương thích save cũ

- **Không có gì để migrate.** Upgrades2 không đọc/ghi localStorage; "người đã mua rồi" theo nghĩa Workshop **không tồn tại** với hệ thống này (không bán, không sở hữu bền).
- Người chơi đang giữ save Workshop: không bị ảnh hưởng bởi M22 (hai hệ thống không chạm nhau ngoài việc cùng sửa ship — §5.3.8). Việc họ được hưởng node 6–10 đã mua là phạm vi **Phụ lục A**, và ở đó cũng không cần migration vì `getRunModifiers()` đọc `wk_meta_workshop` hiện hữu tại thời điểm boot — mua từ trước, áp dụng ngay sau khi bản nối được deploy, kể cả các level đã mua dở.
- Save giữa chừng của một *run* không tồn tại trong game này (run không được lưu) → không có khái niệm "run đang dở được áp dụng ngay".

## 5.6 i18n & icon — những gì v1 làm và chưa làm

- **Tên/mô tả:** v1 dùng thẳng `nameVi`/`descVi` từ `LIST` (fallback mà `T()` của module vốn đã dùng). Người chơi EN sẽ thấy tên VI cho 6 món này — **nói thật: đây là thiếu sót đã biết**, gốc ở cấu trúc `T(key, vi)` không tách name/desc (D-06). Sửa đúng cần đổi `T()` trong upgrades2.js sang tra `upg.<id>.name` / `upg.<id>.desc` + thêm 24 key vào i18n.js — tách thành việc i18n riêng (~30 dòng, rủi ro thấp) để không phình M22. Không chặn release M22, nhưng phải ghi vào backlog i18n sweep.
- **Icon:** dùng sprite đã có trong game.html (không thêm asset, đúng quy ước icon của dự án): `gai_phan→i-shield`, `neo_quan_tinh→i-bolt`, `mat_cu→i-ghost`, `dan_no→i-bomb`, `dan_xich→i-split`, `keo_tu_va→i-heart-plus`. Đây là ánh xạ ngữ nghĩa gần nhất trong bộ sẵn có; Design có thể thay sau bằng cách sửa map `U2_ICON` một chỗ.

## 5.7 Kế hoạch test

Phong cách bám đúng `tests/` hiện tại: unit động bằng `require()` cho module có `module.exports` (upgrades2.js có — dòng 281), test tĩnh bằng regex trên source cho phần engine (như `rebalance.test.js` làm với glue). File mới: `tests/upgrades2.test.js`. Lưu ý kỹ thuật: `require` cache theo module — các test dùng chung một instance phải tự `resetRun()/resetAll()` giữa test (cả hai đều export) hoặc xóa `require.cache`; spec chọn `resetAll()` trong `beforeEach`-tương đương (node:test `beforeEach`).

**Unit — `Upgrades2` thuần (động):**

| # | Tên test | Assert |
|---|---|---|
| U1 | `LIST đủ 6 nâng cấp, đúng id và pool` | id = `[gai_phan, neo_quan_tinh, mat_cu, dan_no, dan_xich, keo_tu_va]`; 3 common / 3 stage |
| U2 | `draftPool khi chưa hạ boss chỉ có 3 món common` | `draftPool().length === 3`, không chứa `gai_phan` |
| U3 | `unlockBossStage(2) mở Gai Phản và trả đúng upgrade` | trả `id==="gai_phan"`; `draftPool()` chứa nó; `unlockBossStage(5) === null` |
| U4 | `applyUpgrade bị khoá trả null, ship không đổi` | `applyUpgrade("gai_phan", {}) === null` trước unlock; ship không có `thornBorder` |
| U5 | `applyUpgrade dan_no gán explosive và chặn lấy trùng` | ship.explosive deepEqual `{r:60, dmg:1}`; gọi lần 2 → `null`; `hasTaken` true |
| U6 | `resetRun mở lại pool nhưng giữ unlock boss` | sau reset: `hasTaken("dan_no")===false`, `draftPool()` vẫn chứa `gai_phan` |
| U7 | `explodeAt chỉ lan quái trong 60px, trừ quái trúng trực tiếp` | dealDamage spy: quái ở 50px nhận đúng 1; quái ở 70px không nhận; quái `hit` không nhận |
| U8 | `explodeAt không có explosive thì no-op` | ship `{}` → trả `[]`, spy 0 lần gọi |
| U9 | `chainFrom nảy sang quái gần nhất với 50% sát thương` | 2 ứng viên (100px, 40px) → chọn 40px, dmg = `10*0.5=5`; ngoài 150px → `null` |
| U10 | `checkThornBorder: giữa sân 0 hit, sát viền gây 3 dmg` | bounds `{l:0,t:0,r:800,b:600}`; ship giữa → 0; ship `x = r_ship` sát viền trái → spy nhận `(enemy, 3)` |
| U11 | `tryAnchor dập knockback, tôn trọng cooldown 8s` | ship `{inertiaAnchor:{cd:0,max:8}, kbvx:99}` → `true`, `kbvx===0`, `cd===8`; gọi ngay lần 2 → `false` |
| U12 | `tick: keo chín sau 20s, cooldown neo giảm theo dt` | `tick(ship,19.9)===null`; `tick(ship,0.2)` → `{glue:10}`; anchor cd 8 → sau `tick(ship,3)` còn 5 |
| U13 | `owlTargets lọc theo 200px và bỏ quái dead` | trong/ngoài/dead → chỉ trả quái sống trong vùng; ship không `owlEye` → `[]` |

**Tĩnh — lớp nối trong engine (regex trên source, mẫu rebalance/smoke):**

| # | Tên test | Assert |
|---|---|---|
| S1 | `game.js: draft có nối Upgrades2.rollDraft` | `/Upgrades2\.rollDraft/` khớp trong game.js |
| S2 | `game.js: update gọi Upgrades2.tick và checkThornBorder` | cả hai regex khớp |
| S3 | `game.js: đạn trúng quái gọi explodeAt và chainFrom đúng 1 call-site mỗi hàm` | số match của từng regex trong game.js `=== 1` (chốt chống double-hook/đệ quy) |
| S4 | `game.js: Shift gọi tryAnchor` | `/ShiftLeft[\s\S]{0,200}tryAnchor/` khớp |
| S5 | `game.js: resetGame gọi Upgrades2.resetRun` | regex khớp |
| S6 | `v2glue.js: onStageBossDead gọi unlockBossStage` | regex khớp trong v2glue.js |
| S7 | `game.js: render vẽ Mắt Cú sau V2.drawOver` | vị trí index của `owlTargets` trong source `>` vị trí của `V2.drawOver` |

**Hồi quy & QA tay (bắt buộc trước merge, theo quy ước studio):**
- Toàn bộ suite cũ vẫn 67 pass + 20 test mới = **87 pass / 0 fail / 1 skip**.
- CDP/browser thật: (a) draft hiện cả món cũ và món Upgrades2, chọn được bằng chuột + phím 1/2/3 ở cả đường Cinema và fallback (tắt Cinema để ép legacy); (b) campaign ải 2: hạ boss → draft sau đó có Gai Phản; chạm viền thấy quái gần mất 3 HP theo nhịp ~0,5s, không melt; (c) ải 4 mất điện thấy outline; (d) Đạn Nổ dọn bầy mini, Đạn Xích nảy đúng 1 con; (e) restart giữa run: món đã lấy quay lại pool, unlock ải còn giữ; (f) run đầu tiên sau khi tải trang: draft hoạt động (đây là lớp lỗi thứ tự boot F-02 — M22 không được phép lặp lại nó: mọi hook của M22 đều nằm trong `update/render/openDraft` chạy sau boot, trừ `resetRun` nằm trong `resetGame` là đúng chỗ).

## 5.8 Effort & rủi ro

| Hạng mục | File | Ước lượng |
|---|---|---|
| Lớp nối engine | `js/game.js` (6 điểm chạm, §5.3.0) | ~110 dòng |
| Unlock boss | `js/v2glue.js` | ~5 dòng |
| Icon map | trong game.js cạnh `UPS` | ~8 dòng |
| Test | `tests/upgrades2.test.js` (mới, 20 test) | ~180 dòng |
| `js/upgrades2.js`, `js/meta.js`, `js/cinema.js`, HTML | — | **0 dòng** |
| **Tổng** | 2 file code + 1 file test | **~300 dòng, 0,5–1 ngày dev + 0,5 ngày QA** (1 sprint nhỏ, khớp ước lượng của FULL-AUDIT) |

**Rủi ro hồi quy — TRUNG BÌNH, tập trung ở 2 điểm:**
1. `openDraft()` — đường draft đóng băng gameplay qua `Juice.draftOpen`/`Cinema.locked`; sửa pool ở đây mà làm picks rỗng bất thường có thể kẹt phase `"draft"`. Đã giảm thiểu: giữ nguyên cấu trúc cũ, chỉ *thêm* phần tử vào `picks` trước vòng bốc cũ; nhánh `!picks.length` gốc vẫn là lưới an toàn.
2. Vòng đạn-ta trong `update()` — hot path; hai helper O(n) mỗi hit là chấp nhận được, nhưng đặt sai vị trí (sau `break`, hoặc trong `damageEnemy`) sẽ hoặc không chạy hoặc đệ quy. Test S3 pin đúng 1 call-site là để khóa điểm này.
3. Rủi ro thấp: throttle Gai Phản là hằng số cân bằng mới (0,5s) — cần Game Design chơi thử chốt số, không phải rủi ro kỹ thuật.
4. Điều **không chắc chắn** trong spec này (nói thẳng): (a) ý đồ của Game Design về việc boss endless có mở độc quyền hay không — spec chốt "không" cho v1, cần xác nhận; (b) con số throttle 0,5s và tỉ lệ vá keo (10, 7,5) là đề xuất kỹ thuật, chưa qua playtest; (c) hiệu quả thực tế của Neo Quán Tính phụ thuộc quyết định expose `StageFX.stabilize()` (§5.3.6) — nếu không làm (a) thì desc của món này hứa quá khả năng v1.

---

## Phụ lục A — Việc kèm theo cùng sprint: nối nốt Workshop node 6–10 + fix F-02

Không thuộc M22 gốc nhưng cùng một mẫu lỗi, cùng file, effort nhỏ — làm chung một PR sẽ đóng hẳn chủ đề "mua/chọn mà không tác dụng":

| Node | Hook đề xuất | Vị trí |
|---|---|---|
| F-02 (node 1–5 mất tác dụng ở run đầu) | Tách `V2.boot()` thành hai nửa: gán `runMods` **trước** `resetGame()` đầu tiên (chỉ phần đọc Meta), phần còn lại (banner/tutorial) giữ sau reset như fix M21 | game.js:3599–3600 + v2glue.js `boot()` |
| 6 — Keo siêu dính (`waveRepairPx` 60/80) | `growWindow(40, 30)` → `growWindow(mods.waveRepairPx, Math.round(mods.waveRepairPx*0.75))`, đọc từ cùng nguồn mods như newShip (cần đưa `waveRepairPx` vào tầm nhìn của `update` — lưu vào `G.runMods` lúc reset) | game.js:2854 |
| 7 — Giáp gai (`thornsDmg` 2/4) | `newShip()`: `thorns: mods.thornsDmg \|\| 0` thay cho `thorns: 0` — đường sát thương chạm tàu đã đọc `s.thorns` sẵn (game.js:2944) | game.js:2080 |
| 8 — Mồi thơm (`pickupMul` ×1,15/×1,3) | `newShip()`: `dropMul: mods.pickupMul \|\| 1` thay cho `dropMul: 1` — `killEnemy` đã chia roll theo `dropMul` sẵn (game.js:2721) | game.js:2080 |
| 9 — Trợ lý kỹ thuật (`freeUpgrade`) | Sau `resetGame()` + boot: nếu `runMods.freeUpgrade`, mở 1 draft ngay (tái dùng `openDraft()` sau khi phase đã `"play"`) — cần test kỹ tương tác với tutorial beat đầu | game.js cuối file |
| 10 — Túi cứu sinh (`secondLife`) | Trong `hurtShip()`: khi `s.hp <= 0` và cờ chưa dùng → `s.hp = 1; s.iframes = 2;` đặt cờ `s._secondLifeUsed = true` (ship mới mỗi run nên cờ tự reset), thay vì `die("ship")` | game.js:2589 |

Effort phụ lục: ~45 dòng game.js + ~10 dòng glue + 6 test tĩnh/động (Workshop có `module.exports` nên `getRunModifiers` test động được ngay với localStorage stub — lấp luôn gap T-02 cho phần modifiers). Rủi ro: node 9 là điểm duy nhất có tương tác thứ tự boot/tutorial — nếu gấp, tách node 9 thành PR riêng và ship 6/7/8/10 + F-02 trước.

## Phụ lục B — Danh sách kiểm chứng đã chạy trong đợt audit này

- `node --test tests/*.test.js` → 67 pass / 0 fail / 1 skip (khớp baseline).
- Grep hai chiều cho: `Upgrades2` và 6 field effect (0 consumer); 5 key modifiers Workshop (0 consumer ngoài meta.js); `check("upgrade"` (0 caller); `onBossKill/onStageBossDead/killBoss` (3 đường boss); thứ tự `resetGame()` ↔ `V2.boot()` (game.js:3599–3600); key i18n `upg.*` (không có key cho 6 món mới); call-site `growWindow` (vá wave hardcode tại game.js:2854).
- Đọc toàn văn: `upgrades2.js`, `meta.js`, `v2glue.js`, `ci.yml`; đọc có mục tiêu: `game.js` (draft, newShip, update/render, keydown, resetGame, bridge cuối file), `stagefx.js` (blackout + slippery), `menu.js` (storage + panel Workshop), `campaign.js` (storage).

*— Frontend Architect, FU-DEVER Game Studio · 2026-10-02 · Chỉ đọc + chạy test, không commit trong đợt audit này.*
