# BOSS PERSONALITY — 6 boss có cá tính

> Triết lý: **"vui vẻ > khó khăn"** — mỗi boss phải khiến người chơi CƯỜI/WOW vì thú vị.
> Mọi pattern chỉ là **visual/comedic**, TUYỆT ĐỐI KHÔNG tăng HP / sát thương / tốc độ so với baseline hiện tại.
> Stat lock: `tests/boss-personality.test.js` — ai vô tình buff sẽ fail CI.

## Bảng 6 boss

| Wave | Tên VI | Tên EN | Telegraph (báo trước) | Pattern vui riêng |
|------|--------|--------|----------------------|-------------------|
| 5 | GÃ GẶM KHỔNG LỒ | THE GREAT GNOME | Float "Nó đang đói bụng… chomp chomp!" + rung nhẹ | Hàm nhai chomp-chomp (răng trên/dưới đóng mở theo nhịp) |
| 10 | SẾP DÍ DEADLINE | THE DEADLINE DASHER | Mưa 24 tờ giấy bay + float "NỘP BÀI!" | Đạn boss vẽ thành **tờ giấy** (cùng r/tốc độ/sát thương); khi nện float "NỘP BÀI!" |
| 15 | DJ QUẨY | DJ BOUNCE | Disco burst + float "QUẨY!" | Viền đổi màu theo beat + equalizer nhảy trên đầu; hô "QUẨY!" định kỳ |
| 20 | THẦN CHẾT BỊ CẢM | THE SNIFFLY REAPER | Float "ẮT XÌ!" + burst trắng | Mũi đỏ hắt xì + khăn giấy; hắt xì định kỳ (float + burst) |
| 25 | ÔNG HOÀNG TRUNG TÂM | MR. CORE-CHILL | Hơi trà bốc lên + float telegraph | Tách cà phê trên vai + hơi cà phê bốc lên định kỳ; thỉnh thoảng "ngáp…" |
| 30 | TRÙM CUỐI CÀ KHỊA | THE FINAL TEASER | Mưa 40 confetti vàng | Vương miện + kính râm; cà khịa người chơi bằng taunt ("yếu thế!", "bắt được ta không!", "haha, hụt rồi!"); confetti khi nện |

Wave > 30 (endless): trùm cuối (wave 30) quay lại.

## Stat baseline (KHÔNG ĐỔI — khóa số trong test)

- Wave 5, 10 = act1: `hpMul 1.0, shot "ring", slam 26, adds [chewer, chewer]`, màu `#8b2fc9`
- Wave 15, 20 = act2: `hpMul 1.6, shot "aimed", slam 32, adds [dasher]`, màu `#5b21b6`
- Wave 25, 30 = act3: `hpMul 2.3, shot "spiral", slam 38, adds [chewer, dasher]`, màu `#b91c1c`
- Công thức HP giữ nguyên: `(130 + wave*14) * DIFF.hpMul * hpMul`

## Implement (js/game.js)

- `BOSS_PERSONAS` — bảng 6 entry thuần data (wave, id, nameKey/teleKey i18n, color, hpMul, shot, slam, adds, flair, telegraph).
- `bossPersonaOf(w)` — wave → persona (wave ≥ 30 → wave 30).
- `spawnBoss()` — dùng persona thay vì `ACTS[act].boss`; tên boss i18n hiện ở banner/intro cinematic; gán `bs.persona`/`bs.flair`.
- `bossTelegraph(p)` — visual báo trước riêng (particles/float text), chạy trước cinematic.
- `bossFlairTick(bs, dt)` — hành vi hài định kỳ (hơi cà phê, taunt, "QUẨY!", hắt xì) — visual thuần.
- `drawBossFlair(ctx, bs, r)` — phụ kiện vẽ trên boss (răng nhai, tờ giấy, equalizer, mũi đỏ, tách cà phê, vương miện + kính râm).
- Đạn giấy: flag `paper` trên ebullet, vẽ tờ giấy thay vì vòng tròn đỏ — cùng `r`, cùng vận tốc, cùng sát thương.
- i18n (js/i18n.js): `boss.w5/w10/w15/w20/w25/w30.name` + `.tele`, `boss.w10.papers`, `boss.w15.quay`, `boss.w20.sneeze`, `boss.w25.yawn`, `boss.w30.taunt1/2/3` — đủ VI + EN, không emoji.

## Không đụng

- 2-track (SAT_MODE) và satellite: telegraph/flair không mở popup, không đụng SatManager.
- Campaign boss module (`V2.startStageBoss`): giữ nguyên path, chỉ đổi boss endless.
- Nhạc: không đổi track; DJ chỉ "nhảy theo beat" bằng visual.
- `ACTS[i].boss` giữ lại để tương thích (không consumer nào khác đọc).
