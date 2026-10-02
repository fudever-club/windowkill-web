# SEASON 1 — QUYẾT ĐỊNH THIẾT KẾ CÒN TREO
### FU-DEVER Game Studio · team Game Design · 2026-10-02

Hai điểm ROADMAP yêu cầu chốt trước khi Season 1 "MÙA DEADLINE" bước vào implementation
(N8 trong `studio/dev/ROADMAP.md`). Mỗi điểm có 2–3 phương án + đề xuất của team Design.
User chỉ cần chọn trong 1 phút: đọc phần **"⭐ Đề xuất"** của mỗi mục.

Quy ước hiện trạng (đã verify trên main sau PR #30):
- Meta (`wk_meta_*`: Mảnh Kính, Xưởng, Thành tựu, Daily, skins) = **toàn cục** (global, 1 máy).
- Campaign (mở ải, tiến trình ải) = **theo profile**.
- Backend: profiles có token auth, `scores`, `leaderboard`, `stats`; DB dùng `PRAGMA user_version` cho migration.
- Chưa có version key nào cho save phía client.

---

## Q1. Save versioning — đánh version và migrate dữ liệu thế nào qua các mùa?

### Phương án A — Một version key toàn cục + chuỗi migration (⭐ Đề xuất)
- Thêm `wk_save_version` (integer, bắt đầu từ 2 cho save hiện tại = v1 ngầm định).
- Mỗi lần đổi schema: tăng version, viết hàm `migrateSave(from, to)` chạy tuần tự
  (vd: 1→2 thêm field, 2→3 đổi cấu trúc workshop). Migration chỉ chạy 1 lần khi load game.
- Tương lai: mỗi season mới KHÔNG bắt buộc tăng version — chỉ tăng khi schema đổi thật.
- **Ưu:** đơn giản, 1 chỗ kiểm soát, đối xứng với backend (đã dùng `PRAGMA user_version`);
  test dễ (seed save v1 → load → assert không crash, đúng như audit đã làm thủ công).
- **Nhược:** migration chain dài dần theo năm tháng (chấp nhận được ở quy mô này).
- **Effort:** 0.5 ngày (đúng ước lượng N8).

### Phương án B — Version riêng từng module (`wk_meta_v`, `wk_profile_v`, …)
- **Ưu:** module nào đổi thì migrate module đó, không đụng module khác.
- **Nhược:** phức tạp gấp 3–4 lần: N module × M version = ma trận migration; khó test hết;
  over-engineering cho game có ~10 key save.

### Phương án C — Không version, defensive defaults khi đọc (hiện trạng)
- **Ưu:** 0 công sức.
- **Nhược:** đã từng gây crash profile thật trong quá khứ; càng nhiều mùa càng dễ vỡ ngầm
  (field thiếu → NaN → UI trắng). Audit vừa rồi phải vá tay từng chỗ.

### ⭐ Đề xuất: **Phương án A**
Lý do: đơn giản nhất mà bao hết rủi ro đã từng xảy ra (crash save cũ), đối xứng với
backend, test được bằng suite hiện có. Quy tắc kèm theo: migration **chỉ tiến** (không
downgrade), hỗ trợ save cũ nhất **2 version** trở lại (cũ hơn → reset an toàn + báo user).

---

## Q2. Meta scope + leaderboard mùa — tiến trình theo profile hay toàn cục? BXH reset hay cộng dồn?

### Phần 2a. Phạm vi của tiến trình meta (Mảnh Kính, Xưởng, Thành tựu, nhiệm vụ season)

**Phương án A — Giữ meta TOÀN CỤC như hiện tại (⭐ Đề xuất)**
- `wk_meta_*` giữ nguyên global; nhiệm vụ season (`wk_meta_season`) cũng global.
- Campaign + lượt "Đấu Sếp"/ngày vẫn theo profile như hiện tại.
- **Ưu:** 0 migration dữ liệu (không phải tách save của người chơi hiện tại);
  đúng bản chất game casual 1 máy/nhiều người chơi chung — Mảnh Kính là "két chung của quán net";
  code ít xáo trộn nhất, ít rủi ro regress nhất.
- **Nhược:** 2 profile trên cùng máy chia sẻ két Mảnh Kính (chấp nhận được — đã vậy từ v2.0,
  chưa ai phàn nàn).

**Phương án B — Chuyển meta theo từng profile**
- **Ưu:** "công bằng" về mặt lý thuyết giữa các profile.
- **Nhược:** phải migration dữ liệu hiện tại (két chung bỗng thuộc về ai?);
  tốn effort, rủi ro mất/chia sai Mảnh Kính của người chơi thật; không khớp hành vi
  người dùng casual (gia đình/bạn bè chơi chung máy).

### Phần 2b. Leaderboard mùa

**Phương án A — Hai bảng song song (⭐ Đề xuất)**
- **"Mùa này"**: bảng mới `season_scores(season_id, profileId, score, difficulty, …)`,
  reset theo `season_id` mỗi 6 tuần → người mới vào giữa mùa vẫn có cơ hội leo top (FOMO + retention).
- **"Mọi thời đại"**: bảng `scores` hiện tại giữ nguyên, cộng dồn không reset → giữ lịch sử, vinh danh người chơi lâu năm.
- Frontend: tab chuyển qua lại trong panel BXH (tái dùng UI leaderboard đã có).
- **Ưu:** được cả hai — cạnh tranh công bằng cho người mới + ghi nhận người cũ.
- **Nhược:** thêm 1 bảng + 1 endpoint (effort ~0.5 ngày, đã có mẫu từ `scores`).

**Phương án B — Chỉ reset theo mùa:** người chơi cũ mất hết lịch sử → phản cảm, mất động lực cày dài.
**Phương án C — Chỉ cộng dồn:** người mới không bao giờ đuổi kịp top → giảm động lực tham gia mùa mới.

### ⭐ Đề xuất: **2a-A + 2b-A**
Lý do: ít xáo trộn dữ liệu nhất (không migration két Mảnh Kính), đúng tâm lý người chơi
casual, và cho cả người mới lẫn người cũ lý do để leo BXH. Backend cần thêm:
`season_scores` + `season_missions(profile, week, mission_id, progress)` (đã nêu trong
design doc §5.2) và endpoint `/api/season/leaderboard?season=current` (+ tham số difficulty
như leaderboard hiện tại). Điểm season chỉ tính từ run "Đấu Sếp" và Daily trong mùa
(theo thiết kế §2.4/§3 — chống farm điểm từ endless thường).

---

## ✅ Quyết định — USER ĐÃ CHỐT (2026-10-02)

User chọn **cả 3 theo đề xuất của Design**:

| # | Câu hỏi | Quyết định |
|---|---|---|
| Q1 | Save đánh version kiểu gì? | **A** — 1 key `wk_save_version` + chuỗi migration, hỗ trợ lùi 2 version |
| Q2a | Meta (Mảnh Kính/Xưởng/nhiệm vụ season) theo profile hay toàn cục? | **A** — giữ toàn cục như hiện tại, 0 migration |
| Q2b | Leaderboard mùa reset hay cộng dồn? | **A** — 2 bảng song song: "Mùa này" (reset) + "Mọi thời đại" (cộng dồn) |

→ Season 1 đạt design sign-off. Cập nhật SEASON-1-DESIGN.md §5.2 + Definition of Ready theo các quyết định này trước khi vào implementation.

---

## Quyết định cần user chốt (1 phút) — *đã chốt ở trên, giữ lại để tra cứu*

| # | Câu hỏi | Đề xuất của Design |
|---|---|---|
| Q1 | Save đánh version kiểu gì? | **A** — 1 key `wk_save_version` + chuỗi migration, hỗ trợ lùi 2 version |
| Q2a | Meta (Mảnh Kính/Xưởng/nhiệm vụ season) theo profile hay toàn cục? | **A** — giữ toàn cục như hiện tại, 0 migration |
| Q2b | Leaderboard mùa reset hay cộng dồn? | **A** — 2 bảng song song: "Mùa này" (reset) + "Mọi thời đại" (cộng dồn) |

Sau khi chốt → cập nhật vào SEASON-1-DESIGN.md §5.2 (backend tables) và Definition of Ready,
rồi Season 1 đủ điều kiện vào implementation.
