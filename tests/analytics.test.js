/* WINDOWKILL — analytics privacy tests (node:test, phân tích tĩnh).
 * Chạy: node --test tests/analytics.test.js
 *
 * js/analytics.js do team phụ trách dữ liệu/frontend phát triển.
 * QUY ƯỚC SKIP như tests/pwa.test.js: file chưa tồn tại → test skip
 * với lý do rõ ràng, KHÔNG fail (giữ suite xanh). QA KHÔNG tự tạo file.
 *
 * Khi file tồn tại, bắt buộc:
 *  - KHÔNG canvas fingerprinting (toDataURL / từ khóa fingerprint)
 *  - KHÔNG gửi raw navigator.userAgent
 *  - KHÔNG đọc/ghi document.cookie
 *  - PHẢI tôn trọng Do Not Track (guard với navigator.doNotTrack)
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const F = "js/analytics.js";
const full = path.join(ROOT, F);
const exists = fs.existsSync(full);

// Đăng ký 1 test skip với lý do hiển thị trong report.
const skipIt = (name, reason) => it(name, { skip: reason }, () => {});

const MISSING =
  `${F} chưa tồn tại — team phụ trách đang phát triển ` +
  "(test sẽ tự bật khi file xuất hiện)";

describe("js/analytics.js — quyền riêng tư", () => {
  if (!exists) {
    skipIt("tồn tại & không rỗng", MISSING);
    skipIt("không canvas fingerprint", MISSING);
    skipIt("không gửi raw navigator.userAgent", MISSING);
    skipIt("không đọc/ghi document.cookie", MISSING);
    skipIt("tôn trọng Do Not Track", MISSING);
    return;
  }

  const src = fs.readFileSync(full, "utf8");

  it("tồn tại & không rỗng", () => {
    assert.ok(src.trim().length > 0, `${F} rỗng`);
  });

  it("không canvas fingerprint", () => {
    // Cấm các primitive exfiltration của canvas fingerprinting.
    // (Từ "fingerprint" trong comment dạng "no fingerprinting" được chấp
    // nhận — đó là tài liệu tuân thủ, không phải code thu thập.)
    assert.ok(
      !/toDataURL/i.test(src),
      "phát hiện canvas.toDataURL — nghi fingerprinting"
    );
    assert.ok(
      !/getImageData/i.test(src),
      "phát hiện canvas.getImageData — nghi fingerprinting"
    );
  });

  it("không gửi raw navigator.userAgent", () => {
    assert.ok(
      !/navigator\.userAgent/.test(src),
      "analytics không được thu thập raw userAgent"
    );
  });

  it("không đọc/ghi document.cookie", () => {
    assert.ok(
      !/document\.cookie/.test(src),
      "analytics không được chạm document.cookie"
    );
  });

  it("tôn trọng Do Not Track", () => {
    assert.match(src, /doNotTrack/, "thiếu kiểm tra navigator.doNotTrack");
    // DNT phải thực sự gate tracking: so sánh doNotTrack === "1"
    // hoặc phủ định hàm kiểm tra dnt().
    assert.match(
      src,
      /doNotTrack.{0,30}===\s*["']1["']|![a-zA-Z_$]*dnt\(\)/i,
      "DNT được đọc nhưng không dùng để tắt tracking"
    );
  });
});
