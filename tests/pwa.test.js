/* WINDOWKILL Web Edition — PWA tests (node:test, no deps).
 * Chạy: node --test tests/pwa.test.js
 *
 * Phạm vi: manifest.webmanifest, sw.js, offline.html, robots.txt,
 * sitemap.xml và khai báo PWA trong index.html / game.html
 * (link rel="manifest", meta theme-color).
 *
 * QUY ƯỚC SKIP: team frontend đang tạo các file này song song.
 * File nào chưa tồn tại → test tương ứng SKIP với lý do rõ ràng,
 * KHÔNG fail (giữ suite xanh). Khi file tồn tại và đúng chuẩn → PASS.
 * QA KHÔNG tự tạo file PWA.
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const exists = (p) => fs.existsSync(path.join(ROOT, p));
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const size = (p) => fs.statSync(path.join(ROOT, p)).size;

const MISSING = (f) =>
  `${f} chưa tồn tại — team frontend đang phát triển (test sẽ tự bật khi file xuất hiện)`;

// Đăng ký 1 test skip với lý do hiển thị trong report.
const skipIt = (name, reason) => it(name, { skip: reason }, () => {});

describe("manifest.webmanifest", () => {
  const F = "manifest.webmanifest";
  if (!exists(F)) {
    skipIt("tồn tại & không rỗng", MISSING(F));
    skipIt("JSON hợp lệ", MISSING(F));
    skipIt("có name (string, không rỗng)", MISSING(F));
    skipIt("icons: mảng, đủ 192x192 và 512x512", MISSING(F));
    skipIt("theme_color là mã màu hex hợp lệ", MISSING(F));
    skipIt("icon files được tham chiếu tồn tại trên disk", MISSING(F));
    return;
  }

  const getManifest = () => {
    let m;
    assert.doesNotThrow(
      () => {
        m = JSON.parse(read(F));
      },
      `${F} không phải JSON hợp lệ`
    );
    return m;
  };

  it("tồn tại & không rỗng", () => {
    assert.ok(size(F) > 0, `${F} rỗng`);
  });

  it("JSON hợp lệ", () => {
    getManifest();
  });

  it("có name (string, không rỗng)", () => {
    const m = getManifest();
    assert.equal(typeof m.name, "string", "thiếu field name");
    assert.ok(m.name.trim().length > 0, "name rỗng");
  });

  it("icons: mảng, đủ 192x192 và 512x512", () => {
    const m = getManifest();
    assert.ok(Array.isArray(m.icons) && m.icons.length > 0, "thiếu field icons[]");
    const sizes = m.icons.flatMap((ic) => String(ic.sizes || "").split(/\s+/));
    assert.ok(sizes.includes("192x192"), "thiếu icon 192x192");
    assert.ok(sizes.includes("512x512"), "thiếu icon 512x512");
    for (const ic of m.icons) {
      assert.ok(ic.src, "icon thiếu src");
      assert.ok(ic.sizes, "icon thiếu sizes");
    }
  });

  it("theme_color là mã màu hex hợp lệ", () => {
    const m = getManifest();
    assert.match(
      String(m.theme_color || ""),
      /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/,
      "thiếu/sai theme_color"
    );
  });

  it("icon files được tham chiếu tồn tại trên disk", () => {
    const m = getManifest();
    const missing = [];
    for (const ic of m.icons) {
      const src = String(ic.src || "").split("?")[0];
      if (/^(https?:|data:)/.test(src)) continue;
      if (!exists(src.replace(/^\//, ""))) missing.push(src);
    }
    assert.deepEqual(missing, [], `icon gãy: ${missing.join(", ")}`);
  });
});

describe("sw.js (service worker)", () => {
  const F = "sw.js";
  if (!exists(F)) {
    skipIt("tồn tại & không rỗng", MISSING(F));
    skipIt("dùng Cache Storage API (caches)", MISSING(F));
    skipIt("intercept request qua fetch event", MISSING(F));
    skipIt("có install handler để precache", MISSING(F));
    return;
  }
  const src = () => read(F);

  it("tồn tại & không rỗng", () => {
    assert.ok(size(F) > 0, `${F} rỗng`);
  });

  it("dùng Cache Storage API (caches)", () => {
    assert.match(src(), /\bcaches\b/, "sw.js không dùng caches");
  });

  it("intercept request qua fetch event", () => {
    assert.match(src(), /addEventListener\s*\(\s*["']fetch["']/, "thiếu fetch event listener");
  });

  it("có install handler để precache", () => {
    assert.match(src(), /addEventListener\s*\(\s*["']install["']/, "thiếu install event listener");
  });
});

describe("offline.html", () => {
  const F = "offline.html";
  if (!exists(F)) {
    skipIt("tồn tại & không rỗng", MISSING(F));
    skipIt("là trang HTML có nội dung offline", MISSING(F));
    return;
  }

  it("tồn tại & không rỗng", () => {
    assert.ok(size(F) > 0, `${F} rỗng`);
  });

  it("là trang HTML có nội dung offline (vi/en)", () => {
    const html = read(F);
    assert.match(html, /<html[\s>]/i, "không phải trang HTML");
    // Chấp nhận tiếng Việt ("mất kết nối", "ngoại tuyến", "không có mạng")
    // lẫn tiếng Anh ("offline") — frontend viết trang tiếng Việt.
    assert.match(
      html,
      /offline|ngoại tuyến|mất kết nối|không có mạng|mat ket noi/i,
      "không có nội dung offline"
    );
  });
});

describe("robots.txt", () => {
  const F = "robots.txt";
  if (!exists(F)) {
    skipIt("tồn tại & không rỗng", MISSING(F));
    skipIt("có directive User-agent", MISSING(F));
    return;
  }

  it("tồn tại & không rỗng", () => {
    assert.ok(size(F) > 0, `${F} rỗng`);
  });

  it("có directive User-agent", () => {
    assert.match(read(F), /^User-agent:/im, "thiếu directive User-agent");
  });
});

describe("sitemap.xml", () => {
  const F = "sitemap.xml";
  if (!exists(F)) {
    skipIt("tồn tại & không rỗng", MISSING(F));
    skipIt("XML hợp lệ, có <urlset>", MISSING(F));
    skipIt("có ít nhất 1 <loc>", MISSING(F));
    return;
  }

  it("tồn tại & không rỗng", () => {
    assert.ok(size(F) > 0, `${F} rỗng`);
  });

  it("XML hợp lệ, có <urlset>", () => {
    const xml = read(F).trim();
    assert.match(xml, /^(\s*<\?xml[^>]*\?>\s*)?<urlset[\s>]/, "không phải sitemap XML");
    assert.match(xml, /<\/urlset>\s*$/, "thiếu thẻ đóng </urlset>");
  });

  it("có ít nhất 1 <loc>", () => {
    assert.match(read(F), /<loc>[^<]+<\/loc>/, "sitemap không có <loc> nào");
  });
});

describe("khai báo PWA trong HTML", () => {
  const F = "manifest.webmanifest";
  for (const page of ["index.html", "game.html"]) {
    if (!exists(F)) {
      skipIt(`${page}: có <link rel="manifest">`, MISSING(F));
      skipIt(`${page}: có <meta name="theme-color">`, MISSING(F));
      continue;
    }
    it(`${page}: có <link rel="manifest" href="manifest.webmanifest">`, () => {
      const html = read(page);
      assert.match(html, /<link[^>]+rel=["']manifest["'][^>]*>/i, "thiếu link manifest");
      assert.match(html, /href=["']manifest\.webmanifest["']/, "href manifest sai");
    });
    it(`${page}: có <meta name="theme-color">`, () => {
      const html = read(page);
      assert.match(
        html,
        /<meta[^>]+name=["']theme-color["'][^>]*>/i,
        "thiếu meta theme-color"
      );
    });
  }
});
