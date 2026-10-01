# PORTAL-SETUP — đưa WINDOWKILL lên portal miễn phí

Game đã có **portal mode** (`js/portal.js`): tự phát hiện khi bị nhúng trong
`<iframe>` (itch.io, CrazyGames...) → ép satellite dùng simulation (không mở
popup thật), tắt service worker, launcher mở game ngay trong iframe.
Người chơi chơi **miễn phí** — không cần tài khoản.

## 1. Build gói portal (1 lệnh)

```bash
chmod +x scripts/*.sh   # 1 lần sau khi clone (file tạo qua web API không giữ exec bit)
./scripts/build-portal.sh
# → dist/windowkill-web-portal.zip (index.html ở root)
```

Script idempotent, tự in số file + dung lượng, verify zip mở được.

## 2. itch.io — API key

1. Đăng nhập itch.io → **Account settings** (menu tài khoản) → **API keys**
   → **Generate new API key** (hoặc dùng key có sẵn).
2. Lưu key vào file (KHÔNG hardcode vào repo, KHÔNG commit):
   ```bash
   mkdir -p ~/.config/windowkill && chmod 700 ~/.config/windowkill
   printf 'export BUTLER_API_KEY="%s"\n' "<key-cua-ban>" > ~/.config/windowkill/itchio.env
   chmod 600 ~/.config/windowkill/itchio.env
   ```
   `scripts/itchio-push.sh` **tự source file này** mỗi lần push → auto-push
   không cần nhập key lại. Thứ tự ưu tiên key: file `itchio.env` →
   biến môi trường `BUTLER_API_KEY` → `ITCHIO_API_KEY` (tên cũ).
   Key không bao giờ in ra log/output.

## 3. itch.io — tạo game mới (làm 1 lần)

1. **Dashboard** → **Create new project**.
2. **Kind of project**: chọn **HTML** → hiện ô *"This file will be played in the browser"*:
   upload `dist/windowkill-web-portal.zip` (hoặc để butler push ở bước 4).
3. **Viewport dimensions**: `1280 × 720` (nên tick *Mobile friendly*).
4. **Pricing**: `$0.00` (free).
5. Save → game có trang riêng, chơi ngay trong iframe.

## 4. Push bản mới lên itch.io (1 lệnh)

```bash
./scripts/itchio-push.sh <user>/<game>:web
# vd: ./scripts/itchio-push.sh fudever/windowkill:web
# tùy chọn: ./scripts/itchio-push.sh fudever/windowkill:web dist/windowkill-web-portal.zip 2026.10.02
```

Script tự tìm `butler` (PATH → `tools/butler` → `~/workspace/windowkill-web/tools`),
map `ITCHIO_API_KEY` → `BUTLER_API_KEY`, push với `--userversion`.

### Cài butler (nếu máy chưa có)

```bash
mkdir -p ~/workspace/windowkill-web/tools
cd ~/workspace/windowkill-web/tools
curl -sL -o butler.zip "https://broth.itch.zone/butler/linux-amd64/LATEST/archive/default"
unzip -o butler.zip butler && chmod +x butler
./butler --version
```
macOS: thay `linux-amd64` bằng `darwin-amd64`; Windows: `windows-amd64`.

## 5. CrazyGames / GameDistribution (bước sau — chưa làm)

- **CrazyGames**: cần tích hợp SDK (`CrazyGames.SDK`) cho quảng cáo + login;
  game phải chạy tốt trong iframe + simulation mode đã sẵn. Đăng ký developer,
  upload zip, qua QA của họ.
- **GameDistribution**: tương tự, SDK `gdsdk` cho quảng cáo; có chương trình
  revenue share.
- Cả hai đều **miễn phí cho người upload**. Khi làm: thêm file `js/portal-<sdk>.js`
  riêng, không trộn vào `js/portal.js`.

## 6. Test local trước khi upload

```bash
cd dist/portal && python3 -m http.server 8901
```

- Mở `http://localhost:8901/index.html?portal=1` → console có
  `[Portal] portal mode ON`, bấm CHƠI → game mở **trong cùng tab**
  (không popup), satellite luôn là cửa sổ mô phỏng.
- Test iframe thật: tạo `portal-test.html` nhúng iframe trỏ tới URL trên →
  portal mode tự bật (không cần `?portal=1`).
- Mở `http://localhost:8901/index.html` (không query, top-level) →
  portal mode TẮT, hành vi như bản production (popup + SW bình thường).
