#!/usr/bin/env bash
#
# deploy-vercel.sh — Deploy windowkill-web (static site) lên Vercel production.
#
#   ./scripts/deploy-vercel.sh --check    # preflight only: build staging, in manifest, KHÔNG deploy
#   ./scripts/deploy-vercel.sh --deploy   # deploy production (mặc định)
#   ./scripts/deploy-vercel.sh --verify   # chỉ verify production hiện tại, không deploy
#
# Quy ước:
#   - Chỉ upload file static theo allowlist; KHÔNG bao giờ upload server/, electron/,
#     studio/, docs/, tests/, .github/, .git.
#   - Auth qua VERCEL_TOKEN (env). KHÔNG in token ra log/stdout (đã scrub).
#   - Binary `vercel` trong PATH của sandbox là MCP OAuth helper, KHÔNG phải
#     Deploy CLI -> script tự phân biệt và dùng classic CLI qua npx khi cần.
#
set -euo pipefail

# ---------------------------------------------------------------- cấu hình ---
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_ID="${VERCEL_PROJECT_ID:-prj_MXASVDT1paqqmXR8hDnU0PwI2Fsv}"
PROD_URL="${PROD_URL:-https://windowkill-web.vercel.app}"
VERCEL_CLI_VERSION="${VERCEL_CLI_VERSION:-latest}"
STAGING_PARENT="${STAGING_PARENT:-/tmp}"

# File/bắt buộc phải có (thiếu -> fail)
REQUIRED=(index.html game.html css js assets)
# File static nên có nếu tồn tại (thiếu -> chỉ warning, vẫn deploy).
# vercel.json là config deploy (headers cho manifest/sw.js) -> phải upload kèm.
OPTIONAL=(manifest.webmanifest sw.js offline.html robots.txt sitemap.xml vercel.json)

ACTION="deploy"
KEEP_STAGING=0
STAGING=""

usage() {
  sed -n '2,/^#$/p' "${BASH_SOURCE[0]}" | sed 's/^# \?//'
  echo "Env: VERCEL_TOKEN (bắt buộc khi deploy), VERCEL_PROJECT_ID, VERCEL_ORG_ID,"
  echo "     VERCEL_BIN (đường dẫn tới classic vercel CLI), VERCEL_CLI_VERSION, PROD_URL"
}

log()  { printf '[deploy] %s\n' "$*"; }
warn() { printf '[deploy][WARN] %s\n' "$*" >&2; }
fail() { printf '[deploy][ERROR] %s\n' "$*" >&2; exit "${2:-1}"; }

# Scrub token khỏi mọi output trước khi in/log
scrub() {
  if [[ -n "${VERCEL_TOKEN:-}" ]]; then
    sed "s/${VERCEL_TOKEN//\//\\/}/[REDACTED]/g"
  else
    cat
  fi
}

# ------------------------------------------------------- chọn Vercel CLI ----
# Trả về chuỗi lệnh chạy được classic Deploy CLI.
pick_vercel_bin() {
  if [[ -n "${VERCEL_BIN:-}" ]]; then
    [[ -x "${VERCEL_BIN}" ]] || fail "VERCEL_BIN=${VERCEL_BIN} không thực thi được."
    echo "${VERCEL_BIN}"; return
  fi
  # `vercel` trong PATH của sandbox là MCP helper -> kiểm tra có subcommand deploy không
  if command -v vercel >/dev/null 2>&1 && vercel deploy --help >/dev/null 2>&1; then
    command -v vercel; return
  fi
  if command -v npx >/dev/null 2>&1; then
    echo "npx --yes vercel@${VERCEL_CLI_VERSION}"
    return
  fi
  fail "Không tìm thấy Vercel Deploy CLI (cần node/npx hoặc VERCEL_BIN)."
}

# ------------------------------------------------------------- staging -------
build_staging() {
  STAGING="$(mktemp -d "${STAGING_PARENT}/windowkill-deploy-XXXXXX")"
  log "Staging dir: ${STAGING}"
  local missing_required=0
  for f in "${REQUIRED[@]}"; do
    if [[ -e "${REPO_ROOT}/${f}" ]]; then
      cp -r "${REPO_ROOT}/${f}" "${STAGING}/"
    else
      warn "Thiếu file BẮT BUỘC: ${f}"; missing_required=1
    fi
  done
  for f in "${OPTIONAL[@]}"; do
    if [[ -e "${REPO_ROOT}/${f}" ]]; then
      cp -r "${REPO_ROOT}/${f}" "${STAGING}/"
    else
      warn "Thiếu file optional (sẽ bỏ qua khi upload): ${f}"
    fi
  done
  # Không bao giờ để lọt thư mục nội bộ vào staging
  for d in server electron studio docs tests .github .git node_modules; do
    rm -rf "${STAGING}/${d}"
  done
  if [[ "${missing_required}" -ne 0 ]]; then
    fail "Preflight FAIL: thiếu file bắt buộc." 3
  fi
  ( cd "${STAGING}" && find . -type f | sort > filelist.txt )
  ( cd "${STAGING}" && find . -type f ! -name 'filelist.txt' -exec sha256sum {} + | sort -k2 > sha256sums.txt )
  log "Staging OK — $(wc -l < "${STAGING}/filelist.txt") file:"
  sed 's/^/  /' "${STAGING}/filelist.txt"
  local commit="unknown"
  commit="$(git -C "${REPO_ROOT}" rev-parse --short HEAD 2>/dev/null || echo unknown)"
  log "Git commit: ${commit}"
}

# ---------------------------------------------------------------- deploy -----
do_deploy() {
  [[ -n "${VERCEL_TOKEN:-}" ]] || fail \
    "Thiếu VERCEL_TOKEN. Tạo token tại https://vercel.com/account/tokens (scope project windowkill-web), rồi chạy: VERCEL_TOKEN=... ./scripts/deploy-vercel.sh --deploy" 2
  [[ -n "${STAGING}" ]] || fail "Staging chưa được build (lỗi nội bộ)." 4

  # shellcheck disable=SC2206
  local BIN=( $(pick_vercel_bin) )
  log "Dùng CLI: ${BIN[*]}"
  export VERCEL_TOKEN  # classic CLI tự đọc env này; không truyền --token để khỏi lộ trong ps

  # Link project (non-interactive). Bỏ qua nếu đã link.
  if [[ ! -f "${STAGING}/.vercel/project.json" ]]; then
    log "Link project ${PROJECT_ID} ..."
    ( cd "${STAGING}" && "${BIN[@]}" link --yes --project="${PROJECT_ID}" 2>&1 | scrub ) \
      || fail "vercel link thất bại. Kiểm tra VERCEL_TOKEN / PROJECT_ID." 5
  fi

  log "Deploy --prod ..."
  local out
  out="$(cd "${STAGING}" && "${BIN[@]}" deploy --prod --yes 2>&1 | scrub)" \
    || { printf '%s\n' "${out}"; fail "vercel deploy thất bại." 6; }
  printf '%s\n' "${out}"
  local url
  url="$(printf '%s\n' "${out}" | grep -oE 'https://[^ ]*\.vercel\.app' | tail -1 || true)"
  [[ -n "${url}" ]] && log "Deployment URL: ${url}"
  log "Production: ${PROD_URL}"
}

# ---------------------------------------------------------------- verify -----
check_url() { # $1=path $2=expected content-type prefix
  local code ctype
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "${PROD_URL}${1}")"
  ctype="$(curl -s -o /dev/null -w '%{content_type}' --max-time 20 "${PROD_URL}${1}")"
  if [[ "${code}" == "200" && "${ctype}" == "${2}"* ]]; then
    log "OK  ${1} -> ${code} ${ctype}"
  else
    warn "FAIL ${1} -> ${code} ${ctype} (mong đợi 200 + ${2})"
    return 1
  fi
}

do_verify() {
  local bad=0
  check_url "/index.html"          "text/html"                || bad=1
  check_url "/manifest.webmanifest" "application/manifest+json" || bad=1
  check_url "/sw.js"               "application/javascript"   || bad=1
  check_url "/sitemap.xml"         "application/xml"          || bad=1

  # So sánh hash 1-2 file với local (index.html bắt buộc có; sw.js nếu tồn tại)
  for f in index.html sw.js; do
    if [[ -f "${REPO_ROOT}/${f}" ]]; then
      local code local_h remote_h
      code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "${PROD_URL}/${f}")"
      [[ "${code}" == "200" ]] || { warn "SKIP hash ${f}: remote trả ${code}, chưa có file này trên production"; bad=1; continue; }
      local_h="$(sha256sum "${REPO_ROOT}/${f}" | cut -d' ' -f1)"
      remote_h="$(curl -s --max-time 20 "${PROD_URL}/${f}" | sha256sum | cut -d' ' -f1)"
      if [[ "${local_h}" == "${remote_h}" ]]; then
        log "OK  hash ${f} khớp local (${local_h:0:12}...)"
      else
        warn "FAIL hash ${f}: local ${local_h:0:12}... != remote ${remote_h:0:12}..."
        bad=1
      fi
    fi
  done
  [[ "${bad}" -eq 0 ]] || fail "Verify FAIL: xem WARN ở trên." 7
  log "Verify PASS: production phục vụ đúng."
}

# ------------------------------------------------------------------ main -----
for arg in "$@"; do
  case "${arg}" in
    --check|--dry-run) ACTION="check" ;;
    --deploy)          ACTION="deploy" ;;
    --verify)          ACTION="verify" ;;
    --keep-staging)    KEEP_STAGING=1 ;;
    -h|--help)         usage; exit 0 ;;
    *) fail "Tham số không rõ: ${arg}. Dùng --help." 2 ;;
  esac
done

case "${ACTION}" in
  check)
    build_staging
    log "--check xong: KHÔNG deploy. Staging giữ tại ${STAGING} (tự dọn khi reboot)."
    ;;
  deploy)
    build_staging
    do_deploy
    sleep 5
    do_verify || warn "Deploy xong nhưng verify chưa pass — kiểm tra lại sau vài phút (CDN propagate)."
    ;;
  verify)
    do_verify
    ;;
esac

if [[ "${KEEP_STAGING}" -eq 0 && -n "${STAGING}" && -d "${STAGING}" && "${ACTION}" != "check" ]]; then
  rm -rf "${STAGING}"
fi
exit 0
