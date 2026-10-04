#!/usr/bin/env bash
#
# capture-gameplay.sh — one command -> 30s–1min WINDOWKILL gameplay video.
#
#   ./scripts/capture-gameplay.sh --duration 45 --out trailer/raw-gameplay.mp4
#
# Pipeline: local game files (file://) -> Chromium (headed, inside Xvfb) ->
# CDP scripted player (capture-bot.js) -> ffmpeg x11grab + game audio.
#
# NOTE: the game is loaded via file://, not http://localhost. Rationale
# (learned 2026-10-04): Chromium >= 142 enforces Local Network Access checks
# that block *every* navigation to http://127.0.0.1 / http://localhost from a
# fresh tab (ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS) — even with
# --no-proxy-server, --disable-features=LocalNetworkAccessChecks, the
# LocalNetworkAccessRestrictionsTemporaryOptOut field trial, and even with the
# LocalNetworkAccessAllowedForUrls enterprise policy set. file:// needs no
# network at all, so it sidesteps the whole class of problems. The game boots
# and plays identically from file:// (verified: phase=play, wave 1+).
# --allow-file-access-from-files is required so the game's fetch() of
# difficulty.config.json and audio assets works from file://.
#
# Requirements: Xvfb, node (>=22), ffmpeg, Chromium.
#   Chromium is looked up in this order: $CHROME_BIN, /opt/meta-chromium/chrome,
#   then PATH (chromium, chromium-browser, google-chrome, google-chrome-stable).
# Audio: used when a PulseAudio/PipeWire server can be started; otherwise the
#   take is recorded video-only and the script says so loudly.
#
set -euo pipefail

# ---------- args ----------
DURATION=45
OUT=""
DIFF="chill"
WIDTH=1280
HEIGHT=720
DISPLAY_NUM=":99"
CDP_PORT=9222
NO_AUDIO=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --duration) DURATION="$2"; shift 2 ;;
    --out) OUT="$2"; shift 2 ;;
    --diff) DIFF="$2"; shift 2 ;;
    --width) WIDTH="$2"; shift 2 ;;
    --height) HEIGHT="$2"; shift 2 ;;
    --display) DISPLAY_NUM="$2"; shift 2 ;;
    --cdp-port) CDP_PORT="$2"; shift 2 ;;
    --no-audio) NO_AUDIO=1; shift ;;
    -h|--help) sed -n '2,22p' "$0"; exit 0 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"
if [[ -z "$OUT" ]]; then
  OUT="trailer/raw-gameplay-$(date +%Y%m%d-%H%M%S).mp4"
fi
mkdir -p "$(dirname "$OUT")"
OUT_ABS="$(cd "$(dirname "$OUT")" && pwd)/$(basename "$OUT")"

# ---------- deps ----------
need() { command -v "$1" >/dev/null 2>&1 || { echo "missing required tool: $1" >&2; exit 3; }; }
need Xvfb; need node; need ffmpeg

CHROME_BIN="${CHROME_BIN:-}"
if [[ -z "$CHROME_BIN" ]]; then
  for c in /opt/meta-chromium/chrome chromium chromium-browser google-chrome google-chrome-stable; do
    if command -v "$c" >/dev/null 2>&1; then CHROME_BIN="$(command -v "$c")"; break; fi
  done
fi
[[ -n "$CHROME_BIN" ]] || { echo "no Chromium found (set CHROME_BIN)" >&2; exit 3; }
node -e "if (typeof WebSocket === 'undefined') { process.exit(1); }" \
  || { echo "node >= 22 with global WebSocket required" >&2; exit 3; }

# ---------- state & cleanup ----------
TMPD="$(mktemp -d /tmp/wk-capture.XXXXXX)"
PROFILE="$TMPD/profile"
SRV_PID=""; XVFB_PID=""; CHROME_PID=""; FF_PID=""; AUDIO_PID=""; PLAYER_PID=""
AUDIO_OK=0

cleanup() {
  echo "[capture] cleaning up..."
  [[ -n "${PLAYER_PID:-}" ]] && kill "$PLAYER_PID" 2>/dev/null || true
  [[ -n "$FF_PID" ]] && kill "$FF_PID" 2>/dev/null || true
  [[ -n "$CHROME_PID" ]] && kill "$CHROME_PID" 2>/dev/null || true
  sleep 1
  [[ -n "$CHROME_PID" ]] && kill -9 "$CHROME_PID" 2>/dev/null || true
  [[ -n "$AUDIO_PID" ]] && kill "$AUDIO_PID" 2>/dev/null || true
  [[ -n "$XVFB_PID" ]] && kill "$XVFB_PID" 2>/dev/null || true
  rm -rf "$TMPD"
}
trap cleanup EXIT INT TERM

# ---------- 1. virtual display ----------
# The Xvfb screen is deliberately TALLER than the target video: Chrome's own
# UI (tabs/toolbar/infobar) sits above the game viewport, so the browser
# window must be bigger than WxH to leave a full WxH viewport. ffmpeg crops
# just the viewport region afterwards.
XVFB_W=$(( WIDTH + 16 ))
XVFB_H=$(( HEIGHT + 260 ))
echo "[capture] Xvfb on $DISPLAY_NUM (${XVFB_W}x${XVFB_H} for ${WIDTH}x${HEIGHT} video)"
Xvfb "$DISPLAY_NUM" -screen 0 "${XVFB_W}x${XVFB_H}x24" >/dev/null 2>&1 &
XVFB_PID=$!
export DISPLAY="$DISPLAY_NUM"
sleep 1

# ---------- 2. audio (best effort) ----------
# Capture law: audio is part of the take. If no audio server is available,
# record video-only rather than failing — and say so loudly.
if [[ "$NO_AUDIO" -eq 0 ]]; then
  if command -v pulseaudio >/dev/null 2>&1 && command -v pactl >/dev/null 2>&1; then
    pulseaudio --start 2>/dev/null || true
    sleep 1
    if pactl load-module module-null-sink sink_name=game_out \
        sink_properties=device.description="GameAudio" >/dev/null 2>&1 \
       && pactl set-default-sink game_out >/dev/null 2>&1; then
      AUDIO_OK=1
      echo "[capture] audio: PulseAudio null sink 'game_out' (monitor will be recorded)"
    fi
  elif command -v pipewire >/dev/null 2>&1 && command -v pipewire-pulse >/dev/null 2>&1 \
       && command -v pactl >/dev/null 2>&1; then
    pipewire >/dev/null 2>&1 & AUDIO_PID=$!
    sleep 1
    pipewire-pulse >/dev/null 2>&1 &
    sleep 2
    if pactl load-module module-null-sink sink_name=game_out \
        sink_properties=device.description="GameAudio" >/dev/null 2>&1 \
       && pactl set-default-sink game_out >/dev/null 2>&1; then
      AUDIO_OK=1
      echo "[capture] audio: PipeWire null sink 'game_out' (monitor will be recorded)"
    fi
  fi
fi
if [[ "$AUDIO_OK" -eq 0 ]]; then
  echo "[capture] WARNING: no PulseAudio/PipeWire server available -> VIDEO-ONLY take (no game audio)"
fi

# ---------- 3. chromium (headed — headless WebGL renders blank) ----------
# Windowed mode + measure-and-adjust: Chrome's own UI (tabs/toolbar/infobar)
# eats part of the window, so we measure the real viewport via the bot and
# grow the window until the viewport is exactly WxH, then crop the viewport
# region in ffmpeg. (Kiosk/fullscreen can't be trusted under Xvfb without a
# window manager — Chrome falls back to a bogus 1050x700 "fullscreen".)
GAME_URL="file://${REPO_ROOT}/game.html?diff=${DIFF}&music=1&sfx=1&sat=sim&shake=0&fx=full"

launch_chrome() { # $1 = window width, $2 = window height
  "$CHROME_BIN" \
    --user-data-dir="$PROFILE" \
    --window-size="$1,$2" --window-position=0,0 \
    --no-first-run --no-default-browser-check \
    --no-sandbox --disable-dev-shm-usage \
    --no-proxy-server \
    --allow-file-access-from-files \
    --autoplay-policy=no-user-gesture-required \
    --remote-debugging-port="$CDP_PORT" \
    --remote-allow-origins="*" \
    "$GAME_URL" >/dev/null 2>&1 &
  CHROME_PID=$!
}

wait_cdp() {
  for i in $(seq 1 60); do
    if curl -sf "http://127.0.0.1:${CDP_PORT}/json/version" >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  echo "CDP never came up" >&2; exit 5
}

echo "[capture] launching Chromium (measure pass) -> $GAME_URL"
launch_chrome "$WIDTH" "$HEIGHT"
sleep 2
echo "[capture] waiting for CDP on :$CDP_PORT ..."
wait_cdp

# Measure the real viewport; grow the window to compensate for browser chrome.
VP_LINE="$(node scripts/capture-bot.js --port "$CDP_PORT" --measure-only 2>/dev/null | grep '^VIEWPORT ' || true)"
if [[ -z "$VP_LINE" ]]; then echo "viewport measurement failed" >&2; exit 5; fi
# shellcheck disable=SC2086
set -- $VP_LINE # VIEWPORT iw ih ow oh sx sy
IW=$2; IH=$3; OW=$4; OH=$5; SX=$6; SY=$7
echo "[capture] measured viewport ${IW}x${IH} (window ${OW}x${OH} at ${SX},${SY})"
ADJ_W=$(( WIDTH + OW - IW )); ADJ_H=$(( HEIGHT + OH - IH ))
if [[ "$IW" -ne "$WIDTH" || "$IH" -ne "$HEIGHT" ]]; then
  echo "[capture] compensating browser chrome: window -> ${ADJ_W}x${ADJ_H}"
  kill "$CHROME_PID" 2>/dev/null || true; sleep 1; kill -9 "$CHROME_PID" 2>/dev/null || true
  CHROME_PID=""
  # Fresh profile for the take run: Chrome's UI (infobar etc.) must be in the
  # exact same state as during the measure pass, or the compensation is off.
  rm -rf "$PROFILE"
  launch_chrome "$ADJ_W" "$ADJ_H"
  sleep 2
  echo "[capture] waiting for CDP on :$CDP_PORT ..."
  wait_cdp
fi
# Viewport screen offset (window at 0,0; chrome UI sits on top, borders symmetric)
CROP_X=$(( SX + (OW - IW) / 2 ))
CROP_Y=$(( SY + OH - IH ))
CROP_W=$WIDTH; CROP_H=$HEIGHT
echo "[capture] capture region: ${CROP_W}x${CROP_H}+${CROP_X},${CROP_Y}"

# ---------- 4. scripted player (verifies play phase, signals READY) ----------
# The bot verifies boot, prints READY, then waits for our GO so ffmpeg
# and the take start together — never silently recording a menu.
echo "[capture] starting scripted player (boot verification) ..."
coproc BOT { node scripts/capture-bot.js --port "$CDP_PORT" --duration "$DURATION" \
  --width "$WIDTH" --height "$HEIGHT" --wait-go; }
# NOTE: bash auto-creates $BOT_PID for a named coproc but UNSETS it when the
# coproc exits — copy it into our own variable immediately.
PLAYER_PID=$BOT_PID
READY_OK=0
while IFS= read -r -t 90 line <&"${BOT[0]}"; do
  if [[ "$line" == VIEWPORT* ]]; then
    # final geometry (after any window resize): VIEWPORT iw ih ow oh sx sy
    # shellcheck disable=SC2086
    set -- $line
    IW=$2; IH=$3; OW=$4; OH=$5; SX=$6; SY=$7
    CROP_X=$(( SX + (OW - IW) / 2 ))
    CROP_Y=$(( SY + OH - IH ))
    if [[ "$IW" -ne "$WIDTH" || "$IH" -ne "$HEIGHT" ]]; then
      echo "[capture] WARNING: viewport ${IW}x${IH} != target ${WIDTH}x${HEIGHT}; capturing actual viewport"
      CROP_W=$IW; CROP_H=$IH
    fi
    continue
  fi
  [[ "$line" == "READY" ]] && { READY_OK=1; break; }
done
if [[ "$READY_OK" -ne 1 ]]; then
  echo "bot never signalled READY — aborting (not recording a menu)" >&2
  wait "$PLAYER_PID" 2>/dev/null || true
  exit 6
fi
echo "[capture] bot READY — take starts now"

# ---------- 5. record ----------
FF_ARGS=(-y -loglevel warning
  -f x11grab -framerate 30 -video_size "${CROP_W}x${CROP_H}" -i "${DISPLAY_NUM}+${CROP_X},${CROP_Y}")
if [[ "$AUDIO_OK" -eq 1 ]]; then
  FF_ARGS+=(-f pulse -i game_out.monitor)
fi
FF_ARGS+=(-c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p)
if [[ "$AUDIO_OK" -eq 1 ]]; then
  FF_ARGS+=(-c:a aac -b:a 160k)
fi
FF_ARGS+=(-t "$DURATION" "$OUT_ABS")

echo "[capture] recording ${DURATION}s -> $OUT_ABS"
ffmpeg "${FF_ARGS[@]}" &
FF_PID=$!
echo "GO" >&"${BOT[1]}"

wait "$PLAYER_PID" || { echo "bot failed mid-take" >&2; exit 6; }
wait "$FF_PID" || { echo "ffmpeg failed" >&2; exit 7; }
FF_PID=""

# ---------- 6. report ----------
DUR_ACTUAL="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT_ABS" 2>/dev/null || echo "?")"
SIZE="$(du -h "$OUT_ABS" | cut -f1)"
echo "[capture] DONE: $OUT_ABS (${DUR_ACTUAL}s, ${SIZE}, audio=$([[ "$AUDIO_OK" -eq 1 ]] && echo yes || echo no))"
