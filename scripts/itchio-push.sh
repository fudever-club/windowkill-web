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
#   vd: ./scripts/itchio-push.sh quangnhat1504/windowkill:web
#       ./scripts/itchio-push.sh quangnhat1504/windowkill:web dist/windowkill-web-portal.zip 2026.10.04
#
# AUTO-RETRY: butler hay rớt mạng qua egress proxy ('use of closed network connection',
# timeout...) → script tự retry tối đa 3 lần, backoff tăng dần (mặc định 5s, 15s;
# chỉnh qua ITCHIO_BACKOFFS="5 15"). Chỉ retry lỗi transient (mạng/proxy); lỗi
# auth/config (key sai, target sai...) thì dừng ngay, không retry.
# Sau push thành công: verify trang itch.io trả HTTP 200 (curl, retry 5 lần cách
# 5s) rồi mới báo SUCCESS. URL trang suy từ TARGET, override được qua ITCHIO_PAGE_URL.
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

TARGET="${1:?Thiếu <user>/<game>:<channel> — vd: quangnhat1504/windowkill:web}"
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

# ---------- push với auto-retry (chỉ retry lỗi mạng/proxy transient) ----------
MAX_ATTEMPTS=3
# pattern lỗi transient (case-insensitive, grep -E): rớt mạng/proxy/egress
TRANSIENT_RE='use of closed network connection|connection reset|timed? ?out|proxy[^a-z]|tls handshake|network is unreachable|temporary failure|no such host|eof\b|connection refused|502|503|504'
# backoff (giây) giữa các lần retry; override: ITCHIO_BACKOFFS="1 2"
read -ra BACKOFFS <<< "${ITCHIO_BACKOFFS:-5 15}"

echo "Push $ZIP → itch.io $TARGET (version $VERSION)"
echo "butler: $BUTLER ($("$BUTLER" --version 2>&1 | head -1 || echo unknown))"

attempt=1
pushed=0
while [ "$attempt" -le "$MAX_ATTEMPTS" ]; do
  echo "--- attempt $attempt/$MAX_ATTEMPTS ---"
  log="$(mktemp)"
  # BUTLER_API_KEY đã export ở trên — butler tự đọc, key không bao giờ in ra log
  if "$BUTLER" push "$ZIP" "$TARGET" --userversion "$VERSION" 2>&1 | tee "$log"; then
    pushed=1
    rm -f "$log"
    break
  fi
  # push rớt: phân loại transient hay lỗi thật
  if grep -Eiq "$TRANSIENT_RE" "$log"; then
    echo "→ lỗi mạng/proxy transient, sẽ retry."
  else
    echo "LỖI không transient — dừng ngay, không retry:"
    tail -n 8 "$log"
    rm -f "$log"
    exit 1
  fi
  rm -f "$log"
  if [ "$attempt" -lt "$MAX_ATTEMPTS" ]; then
    wait_s="${BACKOFFS[$((attempt-1))]:-30}"
    echo "→ đợi ${wait_s}s trước attempt $((attempt+1))..."
    sleep "$wait_s"
  fi
  attempt=$((attempt + 1))
done

[ "$pushed" = "1" ] || { echo "LỖI: push thất bại sau $MAX_ATTEMPTS lần thử (toàn lỗi transient). Kiểm tra mạng/proxy rồi chạy lại."; exit 1; }
echo "Push xong."

# ---------- verify: trang itch.io phải trả HTTP 200 ----------
# TARGET dạng <user>/<game>:<channel> → trang https://<user>.itch.io/<game>
_user_game="${TARGET%%:*}"
_page_user="${_user_game%%/*}"
_page_game="${_user_game##*/}"
PAGE_URL="${ITCHIO_PAGE_URL:-https://${_page_user}.itch.io/${_page_game}}"

echo "Verify: $PAGE_URL"
verified=0
for i in 1 2 3 4 5; do
  code="$(curl -s -o /dev/null -w "%{http_code}" --max-time 20 "$PAGE_URL" 2>/dev/null || echo "000")"
  if [ "$code" = "200" ]; then verified=1; break; fi
  echo "  HTTP $code — đợi 5s rồi thử lại ($i/5)..."
  sleep 5
done
[ "$verified" = "1" ] || { echo "LỖI: $PAGE_URL không trả HTTP 200 sau push (thử 5 lần). Kiểm tra tay trên itch.io dashboard."; exit 1; }

echo "SUCCESS: push $TARGET ($VERSION) + verify $PAGE_URL → HTTP 200."
