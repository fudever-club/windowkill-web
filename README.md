# WINDOWKILL: Web Edition 🪟🔫 — Full Game

Fan-made game lấy cảm hứng từ **Windowkill** (Steam), phát triển bởi **FU-DEVER** —
CLB Lập trình, Đại học FPT Đà Nẵng · *WORK HARD — PLAY HARD*.

Điểm đặc biệt: **cửa sổ popup của game chính là thanh máu** — game dùng
`window.resizeTo()` / `window.moveTo()` / `window.moveBy()` thật để gặm nhỏ
và đẩy cửa sổ bay quanh desktop. Không liên quan tới nhà phát triển gốc của Windowkill.

## 🎮 Chơi ngay (không cần cài)

- **Web:** mở `index.html` qua local server (xem bên dưới), bấm **CHƠI NGAY**.
- **Windows (.exe):** bản portable chạy offline — build từ source (xem bên dưới),
  hoặc lấy file `windowkill-web-win32-x64.zip` trong `electron/dist/`.

## ✨ Tính năng

- 🪟 Twin-stick shooter trong popup: quái tím gặm viền cửa sổ, đạn hất văng quái & đẩy cửa sổ bay
- 👤 **Tài khoản người dùng**: tạo nhiều profile, mỗi profile lưu riêng kỷ lục & thống kê
- 👹 6 loại quái (chaser, chewer, tank, dasher, splitter, mini) + **Boss mỗi 5 wave**
- ⬆️ XP, lên cấp, draft 3 nâng cấp / 12 loại nâng cấp
- 🎁 Vật phẩm: tim hồi máu, khiên, bom Nuke
- 🎚️ 3 độ khó: Chill / Thường / Khắc nghiệt
- 🎵 Nhạc nền + SFX bằng Web Audio (tắt/mở trong cài đặt)
- 📱 Hỗ trợ mobile: 2 joystick ảo
- 🛟 Fallback "đấu trường ảo" khi trình duyệt chặn resize popup

## 🖥️ Chạy web locally

```bash
cd windowkill-web
python3 -m http.server 8080
# mở http://localhost:8080 và cho phép popup
```

## 📦 Đóng gói bản .exe (Electron)

```bash
cd electron
npm install
npm run pack   # đóng gói win32 x64 -> dist/
```

## ☁️ Deploy lên Vercel

```bash
vercel deploy  # từ thư mục gốc của repo
```

## 🎨 Branding

Theme theo nhận diện FU-DEVER: Royal Blue `#0066CC`, Dark `#004C99`,
Light Accent `#0080FF`. Logo CLB: `assets/brand/dever-logo.png`.

## 📁 Cấu trúc

```
index.html          Trang chủ / launcher (menu, tài khoản, cài đặt, kỷ lục)
game.html           Popup đấu trường
css/style.css       Theme Dever
js/audio.js         Engine nhạc + SFX (Web Audio)
js/menu.js          Logic launcher + profiles
js/game.js          Toàn bộ gameplay
assets/             Logo, key art, favicon, brand
electron/          Wrapper Electron để build .exe
```
