# WINDOWKILL: Web Edition

Twin-stick shooter chạy trong popup trình duyệt — với một khác biệt duy nhất: **cửa sổ game chính là thanh máu**. Quái gặm nhỏ cửa sổ bằng `window.resizeTo()` thật, đạn của bạn hất văng quái và đẩy cửa sổ bay bằng `window.moveBy()` thật.

Fan-made, lấy cảm hứng từ **Windowkill** trên Steam. Phát triển bởi **FU-DEVER Software Engineering Club** — CLB Lập trình, Đại học FPT Đà Nẵng (EST. 2018) · *WORK HARD - PLAY HARD*. Không liên quan đến nhà phát triển gốc của Windowkill.

## Chơi ngay 🎮

- **Web:** https://windowkill-web.vercel.app — mở link, cho phép popup, bấm **CHƠI NGAY**. Không cần cài đặt.
- **Windows:** bản portable chạy offline trong [Release v1.0.0](https://github.com/fudever-club/windowkill-web/releases/tag/v1.0.0) (tải 4 file `.zip.part-*` rồi ghép lại bằng lệnh `copy /b` theo hướng dẫn trong release).

## Cách chơi

- **Di chuyển:** WASD / phím mũi tên (mobile: joystick trái).
- **Ngắm & bắn:** chuột (mobile: joystick phải).
- **Mục tiêu:** sống sót qua từng wave, nhặt XP để lên cấp, mỗi lần lên cấp chọn 1 trong 3 nâng cấp.
- **Thua khi:** cửa sổ bị gặm đến kích thước tối thiểu — giữ cửa sổ càng to, bạn càng sống lâu.
- **Phím tắt:** `P` / `Esc` tạm dừng · `M` bật/tắt nhạc · `R` chơi lại sau khi thua.

## Tính năng

- 10 loại quái data-driven (chaser, chewer, tank, dasher, splitter, mini, weaver, spitter, healer, kamikaze) — thêm quái mới chỉ cần 1 entry registry, không sửa logic.
- **3 Act** (Neon Grid → Deep Void → Core Breach), mỗi Act đổi palette, nhạc nền và pool quái; **boss variant riêng mỗi 5 wave**.
- 12 nâng cấp, vật phẩm: hồi máu / khiên / bom nuke / **nam châm hút XP / overdrive tăng tốc bắn**, hệ thống combo, wave-clear tự vá cửa sổ.
- 3 độ khó: Chill / Thường / Khắc nghiệt.
- **Hồ sơ người chơi:** tạo nhiều profile, kỷ lục và thống kê lưu riêng từng profile.
- Nhạc nền + SFX bằng Web Audio, bật/tắt trong cài đặt. Hỗ trợ mobile với 2 joystick ảo.
- Chế độ **"đấu trường ảo"** tự bật khi trình duyệt chặn resize popup — vẫn chơi đầy đủ tính năng.
- **PWA:** cài đặt như app (manifest + service worker), chơi offline cơ bản.
- **Analytics ẩn danh** (không cookie, không fingerprint, tôn trọng Do-Not-Track, tắt được trong Cài đặt) + tự động báo lỗi JS về backend nếu có.
- Backend tùy chọn (Node 24 + SQLite, zero dependency) cho leaderboard online, ingestion analytics và error log. Không có backend, game vẫn chạy 100% local qua localStorage — chi tiết trong `server/README.md`.

## Chạy từ source

```bash
git clone https://github.com/fudever-club/windowkill-web.git
cd windowkill-web
python3 -m http.server 8080
# mở http://localhost:8080 và cho phép popup
```

- Đóng gói bản Windows (Electron): `cd electron && npm install && npm run pack`
- Deploy web: `vercel deploy` từ thư mục gốc của repo
- Branding FU-DEVER: Royal Blue `#0066CC` · Dark `#004C99` · Accent `#0080FF` — logo CLB tại `assets/brand/dever-logo.png`

## Cấu trúc

```
index.html          Trang chủ / launcher (menu, tài khoản, cài đặt, kỷ lục)
game.html           Popup đấu trường
css/style.css       Theme Dever
js/audio.js         Engine nhạc + SFX (Web Audio)
js/menu.js          Logic launcher + profiles
js/api.js           Client gọi backend tùy chọn (fallback localStorage)
js/analytics.js     Analytics ẩn danh + error monitoring (opt-out, DNT)
js/pwa.js           Đăng ký service worker + install prompt
js/game.js          Toàn bộ gameplay (MONSTER_REGISTRY, ACTS data-driven)
manifest.webmanifest + sw.js + offline.html   PWA
assets/             Logo, key art, favicon, brand, icons PWA
server/             Backend Node + SQLite (leaderboard, analytics, errors)
studio/             Game design doc, bestiary, GTM plan
electron/           Wrapper Electron để build .exe
```

## Đóng góp & liên hệ

Mở issue hoặc pull request trên GitHub — team Game Dev của CLB review mọi đóng góp.

- Fanpage: [facebook.com/FPTUDever](https://facebook.com/FPTUDever)
- Email: club.dever@gmail.com
- Website: [fudever.com](https://fudever.com)
