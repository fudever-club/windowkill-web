# Phân tích rổ video gameplay — `videos/`

> Phân tích ngày 09/10/2026 · contact sheets: `snapshots/video-analysis/sheet-*.png`
> Định dạng chung: H.264 30fps. Ngang 1280×720, trừ video-01 (dọc 1080×1920).
> Không file nào trùng nội dung (fingerprint MD5 khác nhau toàn bộ).

| # | File | Thời lượng | Âm thanh | Nội dung | Ghi chú |
|---|------|-----------|----------|----------|---------|
| 1 | `boss-take.mp4` | 50.0s | ❌ không có | Boss fight **GÃ GẶM KHỔNG LỒ** (wave 5): intro boss → PHASE 2 → adds (satellite pixel dạng cửa sổ con) → boss đỏ chuyển pha. Watermark "FU-DEVER // BOSS" | Nhiều khung trống/tối ở nửa đầu; đoạn sau 20s là đỉnh — chọn highlight từ 20–50s |
| 2 | `demo-gameplay.mp4` | 45.0s | ❌ không có | Wave 1–3 thường: tutorial caption "Điểm = tổng điểm gốc — không nhân", DOUBLE KILL! +25, combo x1→x6, tim pixel | Chất lượng trung bình, nhiều khung rất trống; dùng được cảnh DOUBLE KILL (~24s) |
| 3 | `showcase-windowkill.mp4` | 58.0s | ❌ không có | **Recording có cửa sổ trình duyệt thật**: brand intro "WINDOWKILL WEB EDITION — Cửa sổ popup chính là thanh máu" (blue card FU-DEVER), rồi gameplay popup thật với HP bar hồng trên title bar, URL bar nhìn thấy | Duy nhất 1 footage thể hiện "cửa sổ = thanh máu" đúng nghĩa — dùng cho cảnh product intro / explain cửa sổ |
| 4 | `video-01.mp4` | 37.0s | ✅ AAC 48kHz (mean −23.7dB) | **Dọc TikTok/Shorts memey**: boss "SÉP ĐÍ DEADLINE" PHASE 3/4, caption vàng "BOSS CỦA TÔI VỪA TỰ SÁT VÀ TÔI KHÔNG HIỂU VÌ SAO", "wave 10 · chiêu VÔ KỊNH sao nó rơi!?", 3s debug (screen code) "gravity bị set NGƯỢC", TRIPLE KILL!! +60, "follow để xem rõ bug tiếp theo" | Style vertical có sẵn caption — mẫu cho phiên bản Shorts của MV; footage đã dựng xong câu chuyện (hook → twist → CTA follow) |
| 5 | `w1-action.mp4` | 60.7s | ⚠️ có nhưng rất nhỏ (mean −32.9dB) | Wave 1 → WAVE CLEAR → đoạn cuối 3 tile liên tiếp là màn **LEVEL UP** (Tốc độ +10% / Đôi bóng / Máy mine) | Audio cần normalize +10dB nếu dùng; 20s cuối chốt ở màn draft LEVEL UP — dùng làm cảnh "lên cấp" |
| 6 | `w1-draft.mp4` | 60.6s | ⚠️ có nhưng rất nhỏ (mean −31.4dB) | Cùng ván với #5 (HUD giống hệt: WAVE 1, 25 kills, Lv 1) — đoạn chơi đơn điệu wave 1 | Gần như b-roll trùng chủ đề #5; kém nổi bật hơn |
| 7 | `w1-wave1-2.mp4` | 60.3s | ✅ AAC (mean −19.8dB) | Wave 1–2 combat dày: đạn nhiều, quái nhiều, banner WAVE 2, "TRÚM XUẤT HIỆN MỖI 5 WAVE", "Boss vỡ thành 3 mảnh!...", "NHẶT ĐỒ — LÊN CẤP — QUÁY LIÊN TỤC", WAVE CLEAR | **Footage combat tốt nhất** cho wave 1–2, audio ổn |
| 8 | `w2-boss-run.mp4` | 121.7s | ✅ AAC (mean −22.0dB, max −1.8dB) | **Full run dài nhất**: wave 1 → WAVE 2 banner → combat → LEVEL UP draft (Búa nổ / Máy mine / +1 hồi máu) → lên wave cao | Cover đủ nhịp điệu run thật; cắt highlight nhiều nhất (độ dài gấp đôi các file khác) |
| 9 | `windowkill-trailer-60s (2).mp4` | 60.0s | ✅ AAC (mean −20.5dB) | **Trailer 60s dựng sẵn**: boss intro → wave clear → WAVE 3 → caption giới thiệu tính năng ("TRÚM XUẤT HIỆN MỖI 5 WAVE", "Điểm = tổng điểm gốc — không nhân", "NHẶT ĐỒ — LÊN CẤP — QUÁY LIÊN TỤC", "Boss vỡ thành 3 mảnh") | Trông như product trailer hoàn chỉnh — có thể dùng gần như nguyên vẹn làm material |

## Điểm cần lưu ý kỹ thuật
- 4 file ngang (boss-take, demo-gameplay, showcase, ...) **không có track audio** — nếu ghép vào MV phải lấy nhạc từ bgm hoặc audio của file khác.
- `w1-action` + `w1-draft` audio chỉ ~−32dB (gần im, lẹt đẹt SFX) → normalize trước khi mix.
- Nhiều khung trong #1, #2, #6 quá trống/tối — khi cắt b-roll nên chọn đoạn ≥12s có quái trên hình.
- FPS counter nhỏ xuất hiện ở góc một số khung (recording tool) — che được nếu cần.
- `video-01.mp4` là duy nhất ở tỷ lệ dọc 9:16 — không cắt thẳng vào MV ngang 16:9, dùng riêng cho Shorts/TikTok.

## Gợi ý nguồn b-roll theo cảnh MV (f2–f4)
- Cảnh **mosaic/feature**: cắt `w1-wave1-2` (combat dày) + caption trong trailer #9.
- Cảnh **boss/hard-stop 133s**: cắt đỉnh boss của `boss-take` (20–50s) hoặc `w2-boss-run`.
- Cảnh **how-to/cửa sổ = máu**: dùng `showcase-windowkill` (duy nhất có cửa sổ thật).
