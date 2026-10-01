# BGM Credits — `assets/music/`

Nhạc nền có thật cho WINDOWKILL. Tất cả 4 track đều là **CC0 1.0 Universal (public domain)** —
dùng thương mại thoải mái, **không bắt buộc ghi công** (ghi ở đây để minh bạch).

Phong cách: vui nhộn, nhịp nhanh, chiptune/arcade — tuyệt đối không rùng rợn/u ám (theo feedback user 2026-10-01).

| # | Track | Tác giả | Nguồn | License | File |
|---|-------|---------|-------|---------|------|
| 1 | "Joyfully" (loop, 170 BPM) | MintoDog | http://opengameart.org/content/joyfully | CC0 | `joyfully-loop.mp3` / `.ogg` |
| 2 | "Pixel Sprinter" (loop version) | Zane Little Music | https://opengameart.org/content/pixel-sprinter | CC0 | `pixel-sprinter-loop.mp3` / `.ogg` |
| 3 | "Dog in Car" (seamless loop) | congusbongus | https://opengameart.org/node/143647 | CC0 | `dog-in-car.mp3` / `.ogg` |
| 4 | "Heckin' Crows" ("A cheerful chiptune for an arcade game") | congusbongus | https://opengameart.org/node/101054 | CC0 | `heckin-crows.mp3` / `.ogg` |

Ghi chú kỹ thuật:
- File gốc tải từ OpenGameArt.org (định dạng ogg/mp3).
- MP3 được convert về 192kbps bằng ffmpeg để giảm dung lượng (mỗi file < 5MB); bản OGG gốc giữ lại làm fallback.
- Player: `js/bgm.js` — playlist shuffle + loop, crossfade ~1.5s, âm lượng 0.5 (không lấn SFX).
- Khi BGM phát được → procedural music layers của `js/audio.js` tự tắt (tránh chồng nhạc); SFX giữ nguyên.
- Nếu tất cả track load lỗi → tự fallback về procedural music, game không crash.
