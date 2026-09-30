---
name: wk-qa
description: "Use when testing WINDOWKILL Web Edition: gameplay QA on a real browser, security review, and release checks."
---

# wk-qa — QA cho WINDOWKILL Web Edition

> Quy trình gốc: `docs/QA-CHECKLIST.md` (QA trên browser thật) · `SECURITY.md` (audit bảo mật).
> **Lưu ý phạm vi:** subagent không điều khiển browser thật. Khi bài test cần click/popup/DevTools, dừng đúng bước đó và trả về danh sách bước cần kiểm tra thủ công cho parent agent ủy quyền.

## 1. QA trên browser thật

Môi trường: Chromium/Chrome desktop + mobile emulation. Chuẩn bị: cho phép popup cho site, mở DevTools → Console, mỗi bước ghi **PASS/FAIL + screenshot**.

### 1.1 Launcher — tải trang
- Không lỗi console; logo FU-DEVER, logo WINDOWKILL, hero art hiển thị; favicon đúng trên tab.
- CSP không chặn tài nguyên (không có "Refused to load" trong console).
- Responsive 360px: layout không vỡ, nút bấm được.

### 1.2 Tài khoản (profiles)
- Tạo profile: `QA<Tester>` → chip profile xuất hiện, active.
- **XSS test vector:** tạo profile tên `<img src=x onerror=alert(1)>` → phải render dạng **text thuần** (dùng textContent), KHÔNG thực thi — kiểm tra console và DOM.
- Tạo thêm 2 profile → chuyển active qua lại → kỷ lục/thống kê đúng từng profile.
- Xóa profile → confirm dialog → dữ liệu localStorage của profile đó biến mất.
- Reload trang → profile + cài đặt còn nguyên (localStorage persist).

### 1.3 Cài đặt
- Toggle nhạc/SFX/rung: bật/tắt, reload vẫn nhớ. Đổi độ khó Chill → Thường → Khắc nghiệt: nút sáng đúng, reload nhớ.

### 1.4 Mở popup game
- Chưa có profile → CHƠI NGAY yêu cầu tạo tài khoản (không mở popup).
- Có profile → popup `game.html` mở đúng **980×700**, focus vào popup.
- Browser chặn popup → cảnh báo "đang chặn popup" hiển thị.

### 1.5 Gameplay 60 giây (desktop)
- WASD di chuyển mượt; chuột ngắm, đạn bắn đúng hướng chuột.
- Quái spawn theo wave; banner wave hiển thị.
- Chewer bám viền → cửa sổ **thu nhỏ thật** (đo outerWidth giảm) HOẶC fallback "đấu trường ảo" bật kèm thông báo — **ghi lại hành vi thực tế của browser test** (tiêu chí đạt yêu cầu mục này được ghi rõ).
- Bắn đạn vào viền → cửa sổ bị đẩy bay (moveBy) / quái văng ra.
- Nhặt gem XP → lên cấp → draft 3 lá nâng cấp → chọn 1 → hiệu ứng áp dụng.
- Pickup tim/khiên/nuke rơi và nhặt được. P/Esc → pause menu (Tiếp tục / Chơi lại / Về menu) hoạt động. Nhạc nền + SFX phát sau khi tương tác (autoplay policy).

### 1.6 Game-over & report
- Gặm tới ngưỡng hoặc hết máu → GAME OVER: điểm, wave, kills, thời gian. "Kỷ lục mới!" khi phá kỷ lục profile.
- Đóng popup → launcher tự cập nhật kỷ lục & thống kê (không cần reload). Chơi lại (R) → ván mới sạch.

### 1.7 Boss
- Sống tới wave 5 → boss spawn: thanh máu boss, đạn quạt, gọi quái. Hạ boss → thưởng, game tiếp tục wave 6.

### 1.8 Mobile (emulation 390×844, touch)
- 2 joystick ảo hiện; trái di chuyển, phải ngắm + bắn. Không scroll trang khi chơi (touch-action none). Draft / pause bấm được bằng touch.

### 1.9 Độ khó
- Chơi ngắn ở **Khắc nghiệt** → quái trâu/nhanh hơn rõ rệt so với Chill (kiểm chứng fix DIFFS.hard).

### 1.10 Hiệu năng
- ~30 quái + đạn trên màn hình: không drop dưới 30fps kéo dài. Chơi 5 phút: memory không tăng vô hạn.

### 1.11 Screenshot bắt buộc (5 tấm)
1. Launcher desktop (full). 2. Draft 3 nâng cấp khi lên cấp. 3. Boss wave 5. 4. Game over + kỷ lục mới. 5. Mobile emulation đang chơi.

### Tiêu chí đạt
Không FAIL ở mục 1.1–1.4, 1.6; mục chewer gặm cửa sổ (1.5) phải ghi rõ hành vi thực tế. Mọi lỗi console JS đều log kèm bước tái hiện.

## 2. Quy tắc bảo mật (từ SECURITY.md)

- **CSP meta** trên cả `index.html` và `game.html`: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'`.
- **Sanitize mọi số từ BroadcastChannel bằng `num()`/`int0()`** trước khi lưu localStorage (fix S1); khi đọc lại cũng sanitize (defense in depth, fix S2).
- **Render dùng `textContent`** cho tên profile và mọi chuỗi do người chơi nhập; chỉ số sanitize lúc đọc.
- **CẤM inline event handler** (`onclick`, `onerror`...). Ảnh cần xử lý lỗi dùng `addEventListener("error", …)`. CI có bước grep chặn tái xuất hiện.
- **Electron:** `setWindowOpenHandler` chỉ cho phép `file:` local trong thư mục app đóng gói (còn lại deny); chặn `will-navigate` ra ngoài; `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- **Không để lộ secret/token trong repo** — CI có bước secret scan.

Tóm tắt 8 finding S1–S8 (mức độ + cách fix 1–2 dòng): xem `references/security-review.md`.

## 3. Lệnh kiểm thử (chạy không cần browser — QA sở hữu)

```bash
node --check <file>          # syntax check cho mọi file JS bị thay đổi
node --test tests/           # smoke (32), game-logic (11), pwa (21), analytics (6)
node --test server/tests/    # API backend (10)
```

Quy ước từ QA-CHECKLIST §12: test cho file/chức năng team khác đang phát triển → **SKIP có lý do rõ ràng** (không fail); khi file/marker xuất hiện và đúng chuẩn → test tự bật và phải PASS.

**CI (`.github/workflows/ci.yml`) phải xanh** trước release: job `web`, `electron-audit`, `qa-extra` (chạy node:test + validate manifest + quét secret, loại trừ `.git`, `node_modules`, `dist/`, chính file workflow).

## 4. Release checklist

- [ ] Version đã bump theo semver.
- [ ] Toàn bộ `node --test` xanh + CI xanh.
- [ ] Không có binary lớn (>100MB, ví dụ zip Electron) trong git.
- [ ] Deploy Vercel: kiểm tra production thực tế — launcher tải được, mở popup, không lỗi console.
