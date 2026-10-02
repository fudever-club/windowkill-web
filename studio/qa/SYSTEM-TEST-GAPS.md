# SYSTEM TEST GAPS — những gì test tự động hiện tại KHÔNG cover
### FU-DEVER Testing Team · 2026-10-02 · baseline: main afa5997, suite 131 pass/0 fail/1 skip
### Đợt này đã lấp: api-client (9) · i18n-coverage (8) · meta-logic (10) · campaign-logic (8) · pwa-offline (9)

Huyền thoại mức ưu tiên: **P0** = từng gây sự cố thật / chặn release · **P1** = rủi ro hệ thống cao ·
**P2** = nên có. "Người thật" = không tự động hóa được bằng node:test trong sandbox.

---

## P0 — đã lấp trong đợt này (có test, suite xanh)

- [x] **Backend client degrade êm** — `js/api.js` chưa từng được test: base URL resolution,
      offline → null không throw, health cache TTL, token lifecycle. → `tests/api-client.test.js`
- [x] **i18n key coverage** — key HTML thiếu trong dict VI/EN chỉ lòi ra khi user đổi ngôn ngữ.
      → `tests/i18n-coverage.test.js` (55 keys, cả 2 dict; phát hiện: `Meta.getDaily()` public
      không forward `dateKey` — ghi nhận, không crash)
- [x] **Meta economy + save hỏng** — `buyNode`/`Shards` chưa từng test động; save corrupt từng
      crash production. → `tests/meta-logic.test.js` (10)
- [x] **Campaign unlock/kỷ lục** — logic tuyến tính 5 ải, kỷ lục max theo profile.
      → `tests/campaign-logic.test.js` (8; phát hiện: **mini_boss_*\* wave 5 hiện spawn thành
      "chaser" thường** qua fallback `ADD_MAP || "chaser"` ở v2glue.js:220 — bossHpMult mất
      vì queue chỉ giữ string. Ghi nhận C2b, chờ Game Design quyết)
- [x] **PWA offline flow** — VERSION bump, dọn cache cũ, SKIP_WAITING, precache đủ JS v2.0.
      → `tests/pwa-offline.test.js` (9)

## P0 — còn lại, CẦN NGƯỜI THẬT / THIẾT BỊ THẬT (không tự động hóa được ở đây)

- [ ] **Firefox / Safari (WebKit)** — ma trận trình duyệt hiện chỉ có Chromium. Audit 2026-10-02
      đã ghi "CHƯA TEST". Chủ sở hữu: Device/Browser Matrix Owner. Cần: máy thật hoặc
      BrowserStack tương đương, chạy smoke: menu → tạo profile → chơi 60s → pause → game-over.
- [ ] **Thiết bị thật (Android/iPhone)** — toàn bộ mobile hiện là CDP emulation. Touch joystick,
      haptic, `visualViewport`, DPR/Retina mờ canvas chưa kiểm chứng trên máy thật.
- [ ] **Multi-window popup thật** — sandbox chặn loopback cho cửa sổ con: mới chỉ test `sat=sim`.
      Luồng popup thật + BroadcastChannel giữa các cửa sổ + `resizeTo`/`moveBy` bị chặn bởi
      browser chưa chạy end-to-end. Cần: 2 trình duyệt thật trên máy dev.

## P1 — rủi ro hệ thống, làm tiếp theo (viết test được)

- [ ] **Save migration matrix** — N8 (`wk_save_version`) đang làm trên nhánh riêng. Khi merge:
      seed save từ mọi version (v1 ngầm định → v2 → ...) × profile cũ/mới × JSON hỏng →
      assert không crash, không mất Mảnh Kính/Xưởng. Automation Engineer sở hữu.
- [ ] **CI chưa chạy server tests** — `server/tests/api.test.js` có 15 test thật (boot server
      + SQLite throwaway, pass 15/15) nhưng `.github/workflows/ci.yml` chỉ chạy
      `node --test tests/*.test.js`. Backend đổi mà CI vẫn xanh là lỗ hổng gate. Fix: thêm
      1 step `node --test server/tests/api.test.js` vào CI. (Automation Engineer, 5 phút)
- [ ] **Backend checklist trên Fly thật** — test local không cover: volume restart không mất
      data, CORS từ origin thật (web + itch iframe), rate-limit dưới Fly proxy.
      Backend/API Tester chạy tay mỗi khi `server/` đổi → ghi `studio/qa/BACKEND-CHECKLIST.md`.
- [ ] **Daily cheat-resistance** — server validate `seed == date`, `wave ≤ 10`: chưa có test
      nào gửi seed sai/wave lố để assert bị từ chối (400). Viết khi backend season endpoints xong.
- [ ] **i18n EN đường gameplay** — EN mới chỉ verify menu/DOM; text canvas (banner, boss bar)
      không OCR được — cần người đọc EN chơi 1 run campaign, liệt kê chỗ còn VI.
- [ ] **Analytics privacy regression** — `analytics.test.js` hiện tại tốt; thêm: event payload
      không lẫn profile token / email; `sendBeacon` fallback khi `navigator.sendBeacon` thiếu.

## P2 — nên có

- [ ] **BGM/audio state machine** — track list, không preload trước tương tác, loop liên tục,
      tôn trọng toggle tắt nhạc. Hiện chỉ kiểm tra tĩnh.
- [ ] **Tutorial flow** — modal hiện đúng lần đầu / không hiện lại khi đã skip; nút "chơi lại
      hướng dẫn" trong dialog Cách chơi.
- [ ] **Emergency repair economy** — `Meta.emergencyRepair()` khi winPct < 40%: cost, cooldown,
      không dùng được khi đã hết.
- [ ] **Leaderboard UI states** — online (có data) / offline (fallback local) / trống / lỗi mạng:
      render đúng, không treo spinner.
- [ ] **Perf regression guard** — biến baseline hiện tại (FPS ~57, heap 3.5–5.7MB, transfer
      ~0.84MB) thành test ngưỡng trong CI (chỉ chạy khi PR chạm game.js/render).

---
*Cập nhật hàng tuần bởi Test Lead. Gap nào được lấp → chuyển lên mục "đã lấp", ghi tên test file.*
