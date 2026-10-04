# Credits — `assets/stingers/`

4 stinger one-shot cho WINDOWKILL (CEO duyệt "tuyệt vời" 2026-10-04).

## Nguồn
- Sáng tác, phối khí, sound design và mix: **Claude (Anthropic)** — sinh bằng code
  (Python/NumPy/SciPy), theo kịch bản producer của FU-DEVER Game Studio.
- 100% tổng hợp từ oscillator và noise trong code. **Không dùng sample, loop,
  beat hay audio của bên thứ ba.**

## Files
| Stinger | Dùng khi | File |
|---|---|---|
| wave-clear | clear xong 1 wave | `stinger-wave-clear.ogg` / `.mp3` (arp đi lên + ding) |
| level-up | mở draft chọn nâng cấp | `stinger-level-up.ogg` / `.mp3` (arp nhanh dần + pop) |
| game-over | thua (trong `die()`) | `stinger-game-over.ogg` / `.mp3` (slide-whistle "womp-womp" ×2, HÀI) |
| victory | hạ boss | `stinger-victory.ogg` / `.mp3` (snare roll + brass fanfare) |

OGG (Vorbis) là primary; MP3 (192kbps) là fallback cho trình duyệt không chơi OGG (Safari).

## Tích hợp
- Player: §2b trong `js/audio.js` (`AudioEngine.sfx.stinger(name)`) — preload sau
  user gesture đầu, phát qua sfxBus (tôn trọng toggle SFX), fallback về SFX
  procedural cũ nếu file load lỗi.
- Trigger trong `js/game.js`: `die()` (thay `sfx.over()` buồn), `openDraft()`,
  `killBoss()`, wave-clear; `js/cinema.js` (waveClear cinematic).

## Lưu ý bản quyền
Nhạc sinh bởi AI — trạng thái bản quyền khi phát hành thương mại chưa rõ ràng
ở một số khu vực. Game hiện miễn phí trên itch.io nên không vấn đề; xem lại
trước khi bán game.
