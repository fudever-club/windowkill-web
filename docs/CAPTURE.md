# CAPTURE.md — Scripted gameplay capture pipeline

One command turns the repo into a 30s–1min gameplay video, ready to use as
marketing/trailer material:

```bash
./scripts/capture-gameplay.sh --duration 45 --out trailer/raw-gameplay.mp4
```

## What it does

1. Starts Xvfb (virtual display, slightly taller than the target video).
2. Launches Chromium **headed** inside Xvfb (headless WebGL renders blank —
   capture law #1) and loads `game.html` directly, skipping the launcher menu.
3. A CDP scripted player (`scripts/capture-bot.js`) verifies the game actually
   reached the **play** phase (it refuses to record a menu), skips the
   tutorial, then plays a "take": holds fire, aims at the nearest enemy,
   orbits the arena on chill difficulty, auto-picks upgrade drafts (key `1`),
   resumes pauses, and restarts the run on death so the take stays alive.
4. ffmpeg records the game viewport (`x11grab` crop) + game audio (PulseAudio/
   PipeWire monitor) to a single H.264/AAC mp4, then everything is cleaned up.

The browser's own UI (tabs/address bar) is measured and cropped out
automatically: the script measures the real viewport, grows the window until
the viewport is exactly `--width`x`--height`, and captures only that region.

## Requirements

| Tool | Notes |
|---|---|
| Xvfb | virtual display |
| node ≥ 22 | global `WebSocket` (used for CDP) |
| ffmpeg (+ ffprobe) | x11grab + libx264 |
| Chromium | `$CHROME_BIN`, `/opt/meta-chromium/chrome`, or on `PATH` |

Optional: `pulseaudio`+`pactl` (or `pipewire`+`pipewire-pulse`+`pactl`) for game
audio. Without them the script records **video-only** and says so loudly —
audio is part of the take, so install one of them on the capture machine.

## Usage

```bash
# 45s take, default output trailer/raw-gameplay-<timestamp>.mp4
./scripts/capture-gameplay.sh --duration 45

# explicit output, harder difficulty, custom size
./scripts/capture-gameplay.sh --duration 60 --out trailer/boss-take.mp4 \
    --diff normal --width 1280 --height 720

# video-only even if audio is available
./scripts/capture-gameplay.sh --duration 30 --no-audio
```

Flags: `--duration` (s, default 45), `--out`, `--diff` (`chill`/`normal`/`hardcore`,
default `chill` — the bot survives longest there), `--width`/`--height`
(default 1280x720), `--display` (default `:99`), `--cdp-port` (default 9222),
`--no-audio`.

## Verifying a take

```bash
ffprobe -v error -show_entries format=duration \
  -show_entries stream=width,height,avg_frame_rate -of default=nw=1 \
  trailer/raw-gameplay.mp4
# contact sheet: scan for menus/death screens before editing
ffmpeg -v error -i trailer/raw-gameplay.mp4 -vf "fps=1/3,scale=320:-1" probe/%02d.png
```

Capture laws (from the `wk-media-capture` skill): never ship a take that
starts on a menu, never include the hero's death / game-over screen, and if
the audio track is silent, fix the audio setup before shooting more.

## Notes for other machines

- **Chromium ≥ 142 blocks `http://127.0.0.1`/`localhost`** (Local Network
  Access checks, `ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS`) even with
  `--no-proxy-server`, `--disable-features=LocalNetworkAccessChecks`, or the
  `LocalNetworkAccessAllowedForUrls` enterprise policy. This pipeline loads
  the game via **`file://`** instead, which needs no network at all
  (`--allow-file-access-from-files` lets the game's `fetch()` of
  `difficulty.config.json`/audio work). Verified: identical boot and gameplay.
- Behind an egress proxy, keep `--no-proxy-server` (already in the script).
- Kiosk/fullscreen modes misbehave under Xvfb without a window manager
  (Chrome falls back to a bogus 1050x700 "fullscreen"); the script uses
  windowed mode + automatic viewport compensation instead.
- `sudo` is not required. The script never touches the repo working tree —
  it only reads game files.
- First run takes ~15s longer (Chromium first-run + game boot); the timer
  starts only after the bot confirms the play phase.
