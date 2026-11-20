# SCRIPT — Lời chữ trong MV "High Score Parade"

> Kịch bản lời hiển thị (on-screen copy) theo timeline nhạc 135.993s · 161 BPM.
> Tông: **game-arcade cắt mâc** — câu ngắn, mệnh lệnh, đúng chất arcade, không cliché.
> Motion/timing nằm ở `STORYBOARD.md`; file này là truth cho **nội dung chữ**.

## F1 · BOOT (0–19s) — `01-f1.html`

| Thời điểm | Chữ trên màn hình | Ghi chú |
|---|---|---|
| 0.5–8s | `FU-DEVER SYSTEM — READY` | terminal boot, đánh từng ký tự |
| 8–11.5s | `FU-DEVER` | mark lớn giữa màn |
| 11.5–13.5s | **CỬA SỔ · CHÍNH LÀ · MÁU** | phrase cascade, "MÁU" to nhất |
| 13.5–15s | **QUÁI GẶM VIỀN · ĐẠN ĐÁ · CỬA SỔ BAY** | 3 cơ chế cốt lõi |
| 15–17s | **SỐNG SÓT · LÂU HƠN · ĐIỂM CAO HƠN** | lời hứa gameplay |
| 17.9–19s | **HIGH SCORE PARADE** ★ | title drop đúng beat |

## F2 · MOSAIC (19–38s) — `02-f2.html`

| Thời điểm | Chữ | Ghi chú |
|---|---|---|
| 19–30s | Thẻ mosaic: `6 LOẠI QUÁI` · `BOSS MỖI 5 WAVE` · `BẮN NHÀNH` · `KIẾM XP` · `HẠ GỤC NHẬN GEM` · `NHỎ MÀ ĐÁNG NHỚ` | thẻ lật theo onbeat |
| 30–33s | `1UP` | strobe nhấp nháy (arcade classic) |
| 33.5–38s | Typewriter: **BẮN QUÁI · NHẶT GEM · GIỮ MÁU.▮** | 3 động từ, chốt bằng dấu chấm nhấp nháy |

## F3 · SHOWCASE (38–77s) — `03-f3.html`

| Thời điểm | Chữ | Ghi chú |
|---|---|---|
| 43–49s | Điền từ: **CỬA SỔ / THANH MÁU / ĐIỂM SỐ** | 3 anchor của game |
| 49–56.5s | Cặp từ slit: `QUÁI GẶM—VIỀN` · `ĐẠN ĐÁ—BAY` · `GEM—RƠI` · `BẠN—SỐNG SÓT` | mechanics làm động từ |
| 57–64s | Mosaic pixel fill: `CHƠI MIỄN PHÍ` lặp | nền pixel curtain |
| 64–70s | Logo slit: **HIGH SCORE PARADE** | lockup chính |
| 70–77s | **SỐNG ĐƯỢC LÀ THẮNG** | climax message |

## F4 · TAUNT + LEADERBOARD (77–107s) — `04-f4.html`

| Thời điểm | Chữ | Ghi chú |
|---|---|---|
| 79–83s | **Đừng để bị "đóng cửa sổ".** | tagline gốc của game, đánh từng ký tự |
| 83–86s | Flipbook: CHASER → CHEWER → TANK → DASHER → SPLITTER → MINI → BOSS → **6 LOẠI + BOSS** | tên quái thật trong game |
| 86–88s | OT strobe | |
| 88–97s | Leaderboard giả: `WK_BOT 999,999 ★` · `TANK_TP 88,888` · `DEVER 77,777` · `BJỚN→(đã đổi)` · `ANON 1` · `BẠN ???` | hàng hero vàng để trống điểm |
| 97–107s | Pixel curtain + `hẹn gặp ở wave sau.` | chữ mờ nhỏ |

## F5 · OUTRO (107–136s) — `05-f5.html`

| Thời điểm | Chữ | Ghi chú |
|---|---|---|
| 107–112s | **WINDOWKILL** / `WEB EDITION` | title |
| 112–123s | 3 bước: **1 MỞ TRÌNH DUYỆT** · **2 BẮN QUÁI** · **3 VÀO BẢNG KỶ LỤC** | how-to |
| 124–131s | Count-up: `—` → `1,000` → `5,000` → `10,000` → `99,999` → `999,999` → `999,999+` | điểm bắn theo beat |
| 131–133s | **CHƠI NGAY** + `windowkill-web.vercel.app` | CTA, nổ ở 133 |
| 133.4–136s | Card: **FU-DEVER** · `WORK HARD · PLAY HARD` | đóng |

## Quy tắc chữ (đã áp dụng, đừng phá khi edit)

1. Font tiếng Việt: **Segoe UI Black / Segoe UI** (sans) + **Consolas** (mono) — cấm Arial Black/Georgia (thiếu glyph, dấu floating).
2. **KHÔNG uppercase** chữ tiếng Việt có dấu qua CSS `text-transform` — viết hoa sẵn trong nội dung để dấu render chuẩn.
3. Nhạc = audio duy nhất; mọi footage game chèn vào là `<video class="clip" muted>`.
4. Timing chữ bám audiomap (161 BPM, key moments 19/21/30/31/63/64/73/133s) — đổi chữ thì giữ nguyên mốc `in/out`.
