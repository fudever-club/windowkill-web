#!/usr/bin/env bash
# WINDOWKILL — push gói portal lên itch.io bằng butler. Chỉ 1 lệnh.
#
# Cần: export ITCHIO_API_KEY="..."   (lấy ở itch.io → Account settings → API keys)
# KHÔNG hardcode key vào file này hay bất kỳ file nào trong repo.
#
# Dùng: ./scripts/itchio-push.sh <user>/<game>:<channel> [zip] [version]
#   vd: ./scripts/itchio-push.sh fudever/windowkill:web
#       ./scripts/itchio-push.sh fudever/windowkill:web dist/windowkill-web-portal.zip 2026.10.02
#
# KHÔNG tự chạy khi chưa có key — script sẽ báo lỗi và dừng.
set -euo pipefail

: "${ITCHIO_API_KEY:?Chưa có ITCHIO_API_KEY. Export trước: export ITCHIO_API_KEY=\"...\" (itch.io → Account settings → API keys)}"
TARGET="${1:?Thiếu <user>/<game>:<channel> — vd: fudever/windowkill:web}"
ZIP_ARG="${2:-dist/windowkill-web-portal.zip}"
VERSION="${3:-$(date +%Y.%m.%d)}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# tìm butler: PATH → tools/butler trong repo → ~/workspace/windowkill-web/tools (local)
BUTLER=""
for c in "$(command -v butler 2>/dev/null || true)" \
         "$ROOT/tools/butler/butler" \
         "$HOME/workspace/windowkill-web/tools/butler"; do
  if [ -n "$c" ] && [ -x "$c" ]; then BUTLER="$c"; break; fi
done
[ -n "$BUTLER" ] || { echo "LỖI: không tìm thấy butler. Xem dist/PORTAL-SETUP.md mục cài đặt."; exit 1; }

ZIP="$ZIP_ARG"
[ -f "$ZIP" ] || ZIP="$ROOT/$ZIP_ARG"
[ -f "$ZIP" ] || { echo "LỖI: không thấy $ZIP_ARG. Chạy ./scripts/build-portal.sh trước."; exit 1; }

echo "Push $ZIP → itch.io $TARGET (version $VERSION)"
echo "butler: $BUTLER ($("$BUTLER" --version 2>&1 | head -1 || echo unknown))"
# butler đọc key qua BUTLER_API_KEY — map từ ITCHIO_API_KEY, không in key ra log
BUTLER_API_KEY="$ITCHIO_API_KEY" "$BUTLER" push "$ZIP" "$TARGET" --userversion "$VERSION"
echo "Push xong."
