# BGM Credits — `assets/music/`

Soundtrack duy nhất của WINDOWKILL (CEO chốt 2026-10-04): **một theme chạy loop liên tục**.

## Track hiện tại

| Track | Chi tiết |
|---|---|
| **"High Score Parade" (Game Loop)** | Arcade Funk, ~158 BPM, loop 103.1s (48kHz stereo) |
| Metadata trong file | title "High Score Parade", album "Joystick Odyssey", genre "Arcade Funk" |
| Master | −14.1 LUFS, true peak −1.1 dBTP |
| File | `high-score-parade-loop.ogg` (Vorbis q6, primary) / `.mp3` (192kbps, fallback Safari) |

- Loop edit: one-bar equal-power crossfade ở điểm nối (phần mở đầu/kết thúc fade
  yên tĩnh của source đã loại bỏ). Phát loop bằng thẻ `<audio loop>` — file đã
  được edit để nối liền, không cần crossfade lúc phát.
- Player: `js/bgm.js` — single-track loop, âm lượng 0.5 (không lấn SFX).

## ⚠️ LƯU Ý BẢN QUYỀN (quan trọng)

- **Tác giả/nhà soạn nhạc và giấy phép (license) KHÔNG có trong metadata của file nguồn.**
  Track này đến từ user cung cấp (`High_Score_Parade.mp4`), không phải nhạc tự sáng tác,
  không phải CC0.
- **Chưa được xác minh quyền sử dụng.** Trước khi phát hành rộng rãi (đặc biệt nếu game
  thu phí), CEO cần xác nhận: nguồn gốc track, ai là chủ bản quyền, và điều khoản
  cho phép dùng trong game thương mại.
- Khi có thông tin, bổ sung vào bảng trên: tác giả, nguồn, license, link mua/license.

## Lịch sử

- 2026-10-01 → 2026-10-04: 4 track CC0 (Joyfully, Pixel Sprinter, Dog in Car, Heckin' Crows)
  chạy playlist shuffle. Đã gỡ khỏi repo (còn trong git history) khi CEO chốt single theme.
- File preview `High_Score_Parade_Loop_Preview_3x.mp3` chỉ để nghe thử, KHÔNG ship.

## Ghi chú kỹ thuật

- Khi BGM phát được → procedural music layers của `js/audio.js` tự tắt (tránh chồng nhạc); SFX giữ nguyên.
- Nếu track load lỗi → tự fallback về procedural music, game không crash.
- Tôn trọng toggle nhạc của user (`BGM.setEnabled`).
