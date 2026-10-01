#!/usr/bin/env bash
# WINDOWKILL — build gói portal (itch.io / CrazyGames / GameDistribution...).
#
# Copy static site từ repo root → dist/portal/ → đóng zip dist/windowkill-web-portal.zip
# (index.html ở root, sẵn sàng upload lên portal).
#
# Idempotent: chạy lại bao nhiêu lần cũng cho kết quả như nhau.
# Dùng: ./scripts/build-portal.sh
# Test với source giả: PORTAL_REPO_ROOT=/tmp/fake-root ./scripts/build-portal.sh
set -euo pipefail

ROOT="${PORTAL_REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
OUT="$ROOT/dist/portal"
ZIP="$ROOT/dist/windowkill-web-portal.zip"

# allowlist mirror .vercelignore (+ satellite.html cho popup — không dùng ở portal
# nhưng giữ để zip chạy được cả khi mở trực tiếp ngoài iframe)
FILES=(index.html game.html satellite.html manifest.webmanifest sw.js offline.html robots.txt sitemap.xml vercel.json)
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

(cd "$OUT" && zip -qr "$ZIP" .)
zip -T "$ZIP" >/dev/null && echo "verify: zip mở được OK"

count=$(find "$OUT" -type f | wc -l | tr -d ' ')
size_h=$(du -h "$ZIP" | cut -f1)
size_b=$(stat -c%s "$ZIP" 2>/dev/null || stat -f%z "$ZIP")
echo "Build xong: $ZIP"
echo "  files: $count | size: $size_h ($size_b bytes)"
