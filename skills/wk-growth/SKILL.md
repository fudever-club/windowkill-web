---
name: wk-growth
description: "Use when writing marketing copy, README, or producing the showcase video for WINDOWKILL Web Edition."
---

# wk-growth — WINDOWKILL Web Edition

Growth & copy skill for the FU-DEVER Game Studio repo **WINDOWKILL Web Edition**.
Thẻ tra nhanh giọng văn: xem [references/voice-cheat-sheet.md](references/voice-cheat-sheet.md).

## Brand facts (bất biến)

- CÂU LẠC BỘ LẬP TRÌNH FU-DEVER / FU-DEVER Software Engineering Club, **EST. 2018**
- Màu: **#0066CC** / **#004C99** / **#0080FF**
- Tagline: **"WORK HARD - PLAY HARD"**
- Fanpage: `facebook.com/FPTUDever` · Email: `club.dever@gmail.com` · Website: `fudever.com`
- Game **fan-made**, lấy cảm hứng từ **Windowkill (Steam)** — KHÔNG copy art/audio/brand gốc.

## 1. Giọng fu-dever-writer (tóm tắt)

**3 voice:**

| Voice | Dùng khi | Đặc điểm |
|---|---|---|
| Official | Thông báo chính thức (fanpage, landing, README) | Rõ ràng, trực tiếp, ấm áp vừa đủ, không mascot |
| Internal Community | Rủ rê trong group nội bộ CLB | Như đồng đội rủ nhau chơi, không khẩu hiệu, không hashtag |
| Buggy Narrator | Storytelling, Human of DEVER | Ngôi thứ 3 gọi nhân vật là "Buggy", không xưng mình/tôi |

**Cấu trúc mọi copy:** Hook → Body cụ thể (gạch đầu dòng) → CTA rõ ràng.
**Emoji:** tối đa 2–3 cái, có chủ đích (không spam).

**CẤM zombie language:** "cơ hội vàng", "nhanh tay đăng ký ngay", "vô cùng ý nghĩa", "hành trình đáng nhớ", "Không X. Không Y. Chỉ có Z." — và mọi khẩu hiệu tương tự.
**Thiếu fact:** ghi `[ĐIỀN: …]`, tuyệt đối không bịa số liệu, tên người, thời gian.

## 2. Cấu trúc README chuẩn

1. **Hook (2 câu):** nói rõ game là gì — twin-stick shooter chạy trong **popup trình duyệt**; cửa sổ popup **chính là máu** (quái gặm nhỏ cửa sổ, đạn đẩy cửa sổ bay).
2. **Tính năng:** gạch đầu dòng, scan nhanh (6 loại quái, boss mỗi 5 wave, 12 nâng cấp, 3 độ khó, profile riêng từng người chơi, kỷ lục localStorage…).
3. **Cách chơi / cài đặt:** 3 đường — chạy local server (`python3 -m http.server`), bản `.exe` Windows (Electron), backend tùy chọn (`cd server && npm start` → `127.0.0.1:3001`).
4. **CTA:** chơi ngay tại production **https://windowkill-web.vercel.app** → đóng góp (link repo) → liên hệ `club.dever@gmail.com`.
5. **Disclaimer fan-made:** game fan-made lấy cảm hứng từ Windowkill (Steam); không copy art/audio/brand gốc.

## 3. Quy trình sản xuất video showcase

**Môi trường:** đã có sẵn `ffmpeg` 8, `Xvfb`, Chromium tại `/opt/meta-chromium/chrome`. Output: `studio/growth/showcase.mp4` (1280x720).

1. **Chuẩn bị X session:**
   ```bash
   Xvfb :99 -screen 0 1280x720x24 &
   export DISPLAY=:99
   ```
2. **Mở Chromium** (1280x720, fullscreen/kiosk) vào production `https://windowkill-web.vercel.app`:
   ```bash
   /opt/meta-chromium/chrome --kiosk --no-first-run --disable-infobars \
     https://windowkill-web.vercel.app &
   ```
3. **Record** bằng `ffmpeg -f x11grab`:
   ```bash
   ffmpeg -video_size 1280x720 -framerate 30 -f x11grab -i :99 \
     -c:v libx264 -pix_fmt yuv420p raw-capture.mp4
   ```
4. **Điều khiển game bằng scripted input qua CDP** (Chrome DevTools Protocol, remote-debugging-port): tạo profile → bấm CHƠI NGAY → chơi mẫu vài wave (di chuyển + bắn scripted, cố tình để quái gặm cửa sổ để khoe điểm độc đáo nhất).
5. **Edit bằng ffmpeg:** cắt đoạn thừa; thêm title card/intro/outro bằng `drawtext` (font Noto, màu `#0066CC`), chèn branding FU-DEVER + tagline "WORK HARD - PLAY HARD"; fade in/out.
6. **Xuất** mp4 1280x720: `studio/growth/showcase.mp4`.

## 4. Checklist go-to-market

- [ ] **Landing copy:** hook 2 câu + CTA chơi ngay (voice Official)
- [ ] **SEO keywords:** "windowkill web", "game popup trình duyệt", "twin-stick shooter web game", "FU-DEVER"
- [ ] **Content calendar Facebook:** fanpage `facebook.com/FPTUDever` (Official) + group nội bộ (Internal Community) — teaser, launch, highlight kỷ lục, bug-hunt
- [ ] **Vòng lặp feedback người chơi → team Design/Engineering:** thu thập phản hồi sau mỗi đợt chơi, ưu tiên vào backlog
- [ ] **Launch checklist:** production xanh (`https://windowkill-web.vercel.app`), SEO tags + sitemap cập nhật, video showcase xong, lịch post fanpage/group, backup kỷ lục
