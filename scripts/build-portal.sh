#!/usr/bin/env bash
# WINDOWKILL — build gói portal (itch.io / CrazyGames / GameDistribution...).
#
# Copy static site từ repo root → dist/portal/ → đóng zip dist/windowkill-web-portal.zip
# (index.html ở root, sẵn sàng upload lên portal).
#
# HARDENED (blocker #2/#3/#4 portal submission):
#  - BẮT BUỘC sat=sim đã được ép runtime bởi js/portal.js (iframe / ?portal=1).
#  - sw.js BỊ LOẠI khỏi FILES: portal cấm/khuyến nghị không dùng Service Worker trong iframe.
#    (index.html/game.html vẫn chứa inline navigator.serviceWorker.register — coordinator
#    phải gate chúng trong if (!window.WK_PORTAL_MODE), xem INTEGRATION.md mục a.)
#  - Verify sau build: zip không chứa sw.js, size ≤ 50MB (giới hạn CrazyGames),
#    file count, index.html ở root, js/portal.js tồn tại.
#
# Idempotent: chạy lại bao nhiêu lần cũng cho kết quả như nhau.
# Dùng: ./scripts/build-portal.sh
# Test với source giả: PORTAL_REPO_ROOT=/tmp/fake-root ./scripts/build-portal.sh
set -euo pipefail

ROOT="${PORTAL_REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
OUT="$ROOT/dist/portal"
ZIP="$ROOT/dist/windowkill-web-portal.zip"

# CrazyGames hard limit: initial download ≤ 50MB (file ≤ 1500, tổng ≤ 250MB)
MAX_ZIP_BYTES=$((50 * 1024 * 1024))

# allowlist mirror .vercelignore (+ satellite.html cho popup — không dùng ở portal
# nhưng giữ để zip chạy được cả khi mở trực tiếp ngoài iframe).
# LƯU Ý: sw.js bị loại cố ý (blocker #4) — không thêm lại.
FILES=(index.html game.html satellite.html manifest.webmanifest offline.html robots.txt sitemap.xml vercel.json)
DIRS=(css js assets)

rm -rf "$OUT" "$ZIP"
mkdir -p "$OUT"

for f in "${FILES[@]}"; do
  if [ -f "$ROOT/$f" ]; then
    cp "$ROOT/$f" "$OUT/"
  else
    echo "WARN: thiếu $f (bỏ qua)"
  fi
done
for d in "${DIRS[@]}"; do
  if [ -d "$ROOT/$d" ]; then
    cp -r "$ROOT/$d" "$OUT/"
  else
    echo "WARN: thiếu thư mục $d/ (bỏ qua)"
  fi
done

# sanity: index.html bắt buộc ở root, js/portal.js bắt buộc có (portal mode)
[ -f "$OUT/index.html" ] || { echo "LỖI: thiếu index.html, không build zip"; exit 1; }
[ -f "$OUT/js/portal.js" ] || { echo "LỖI: thiếu js/portal.js, không build zip"; exit 1; }

# sanity: sw.js tuyệt đối không được lọt vào zip portal
[ ! -f "$OUT/sw.js" ] || { echo "LỖI: sw.js lọt vào build portal (blocker #4)"; exit 1; }

(cd "$OUT" && zip -qr "$ZIP" .)
zip -T "$ZIP" >/dev/null && echo "verify: zip mở được OK"

# ---------- post-build verification (portal submission requirements) ----------
fail=0
report() { if [ "$1" = "ok" ]; then echo "verify: $2 OK"; else echo "verify LỖI: $2"; fail=1; fi; }

# 1. sw.js absent trong zip
if zipinfo -1 "$ZIP" | grep -Eq "(^|/)sw[.]js$"; then report bad "sw.js vẫn còn trong zip (blocker #4)"; else report ok "sw.js vắng mặt trong zip"; fi

# 2. size ≤ 50MB (CrazyGames initial download limit)
size_b=$(stat -c%s "$ZIP" 2>/dev/null || stat -f%z "$ZIP")
size_h=$(du -h "$ZIP" | cut -f1)
if [ "$size_b" -le "$MAX_ZIP_BYTES" ]; then report ok "size $size_h ($size_b bytes) ≤ 50MB"; else report bad "size $size_h vượt 50MB"; fi

# 3. file count (CrazyGames: ≤ 1500 files)
count=$(find "$OUT" -type f | wc -l | tr -d ' ')
if [ "$count" -le 1500 ]; then report ok "file count $count ≤ 1500"; else report bad "file count $count vượt 1500"; fi

# 4. index.html ở root của zip
if zipinfo -1 "$ZIP" | grep -qx "index[.]html"; then report ok "index.html ở root zip"; else report bad "index.html không ở root zip"; fi

# 5. js/portal.js tồn tại trong zip (runtime ép sat=sim)
if zipinfo -1 "$ZIP" | grep -qx "js/portal[.]js"; then report ok "js/portal.js có trong zip (sat=sim enforcement)"; else report bad "thiếu js/portal.js trong zip"; fi

# 6. manifest không còn reference sw.js (nếu có)
if grep -rq "sw[.]js" "$OUT/manifest.webmanifest" 2>/dev/null; then report bad "manifest.webmanifest còn reference sw.js"; else report ok "manifest không reference sw.js"; fi

echo "Build xong: $ZIP"
echo "  files: $count | size: $size_h ($size_b bytes)"

if [ "$fail" -ne 0 ]; then echo "BUILD FAILED: verify portal không đạt"; exit 1; fi
echo "BUILD PASS: đạt mọi yêu cầu verify portal"
