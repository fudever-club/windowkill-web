#!/usr/bin/env bash
# WINDOWKILL — push gói portal lên itch.io bằng butler. Chỉ 1 lệnh.
#
# API key lấy theo thứ tự ưu tiên (KHÔNG hardcode key vào repo, KHÔNG in ra log):
#   1. File đã lưu: ~/.config/windowkill/itchio.env   (nội dung: export BUTLER_API_KEY=...; chmod 600; nằm ngoài repo)
#   2. Biến môi trường BUTLER_API_KEY
#   3. Biến môi trường ITCHIO_API_KEY (tên cũ, tương thích ngược)
# Lấy key mới ở: itch.io → Account settings → API keys.
#
# Dùng: ./scripts/itchio-push.sh <user>/<game>:<channel> [zip] [version]
#   vd: ./scripts/itchio-push.sh fudever/windowkill:web
#       ./scripts/itchio-push.sh fudever/windowkill:web dist/windowkill-web-portal.zip 2026.10.02
set -euo pipefail

KEY_FILE="$HOME/.config/windowkill/itchio.env"
if [ -f "$KEY_FILE" ]; then
  # shellcheck disable=SC1091
  . "$KEY_FILE"   # chỉ export BUTLER_API_KEY, không in gì ra
fi
if [ -z "${BUTLER_API_KEY:-}" ] && [ -n "${ITCHIO_API_KEY:-}" ]; then
  BUTLER_API_KEY="$ITCHIO_API_KEY"
fi
: "${BUTLER_API_KEY:?Chưa có API key. Lưu vào $KEY_FILE (dòng: export BUTLER_API_KEY=\"...\") hoặc export BUTLER_API_KEY/ITCHIO_API_KEY. Lấy key ở itch.io → Account settings → API keys.}"
export BUTLER_API_KEY

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
# BUTLER_API_KEY đã export ở trên — butler tự đọc, key không bao giờ in ra log
"$BUTLER" push "$ZIP" "$TARGET" --userversion "$VERSION"
echo "Push xong."
