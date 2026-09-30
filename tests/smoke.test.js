/* WINDOWKILL Web Edition — smoke tests (node:test, no deps).
 * Chạy: node --test tests/
 * Không cần browser: kiểm tra assets, tham chiếu HTML, syntax JS,
 * các hằng số gameplay, và các guard bảo mật (CSP, Electron, XSS sanitize). */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

describe("assets bắt buộc", () => {
  const required = [
    "assets/favicon.png",
    "assets/hero.jpg",
    "assets/logo-lockup.webp",
    "assets/og-banner.jpg",
    "assets/brand/dever-logo.png",
  ];
  for (const f of required) {
    it(`${f} tồn tại & không rỗng`, () => {
      const st = fs.statSync(path.join(ROOT, f));
      assert.ok(st.size > 0, `${f} rỗng`);
    });
  }
  it("favicon là PNG hợp lệ", () => {
    const b = fs.readFileSync(path.join(ROOT, "assets/favicon.png"));
    assert.deepEqual([...b.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
  });
  it("logo-lockup.webp là WebP hợp lệ (RIFF....WEBP)", () => {
    const b = fs.readFileSync(path.join(ROOT, "assets/logo-lockup.webp"));
    assert.equal(b.subarray(0, 4).toString(), "RIFF");
    assert.equal(b.subarray(8, 12).toString(), "WEBP");
  });
});

describe("tham chiếu trong HTML", () => {
  for (const page of ["index.html", "game.html"]) {
    it(`${page}: mọi src/href local đều resolve được`, () => {
      const html = read(page);
      const missing = [];
      for (const m of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
        const ref = m[1];
        if (/^(https?:|data:|mailto:)/.test(ref)) continue;
        if (!fs.existsSync(path.join(ROOT, ref))) missing.push(ref);
      }
      assert.deepEqual(missing, [], `tham chiếu gãy: ${missing.join(", ")}`);
    });
    it(`${page}: có CSP meta tag`, () => {
      const html = read(page);
      assert.match(html, /http-equiv="Content-Security-Policy"/);
      assert.match(html, /script-src 'self'/);
    });
    it(`${page}: không còn inline event handler (CSP script-src 'self')`, () => {
      const html = read(page);
      assert.ok(
        !/\son(click|load|error|mouseover|keydown|keyup|change|submit|focus|blur)=/i.test(html),
        "còn inline event handler — CSP sẽ chặn"
      );
    });
  }
});

describe("syntax JS", () => {
  for (const f of ["js/audio.js", "js/menu.js", "js/game.js", "electron/main.js"]) {
    it(`node --check ${f}`, () => {
      execFileSync(process.execPath, ["--check", path.join(ROOT, f)], { stdio: "pipe" });
    });
  }
});

describe("hằng số gameplay (game.js)", () => {
  const src = read("js/game.js");
  it("3 độ khó: chill / normal / hard đều resolve được", () => {
    assert.match(src, /\bchill:\s*\{/);
    assert.match(src, /\bnormal:\s*\{/);
    assert.match(src, /DIFFS\.hard\s*=\s*DIFFS\.hardcore/);
  });
  it("đủ 12 nâng cấp", () => {
    const n = (src.match(/\bico:/g) || []).length;
    assert.equal(n, 12, `tìm thấy ${n} nâng cấp, kỳ vọng 12`);
  });
  it("đủ 6 loại quái", () => {
    for (const t of ["chaser", "chewer", "tank", "dasher", "splitter", "mini"]) {
      assert.ok(src.includes(`"${t}"`), `thiếu quái ${t}`);
    }
  });
  it("boss xuất hiện mỗi 5 wave", () => {
    assert.match(src, /%\s*5\s*===\s*0/);
    assert.match(src, /function spawnBoss\(\)/);
  });
  it("gameover post số liệu qua BroadcastChannel", () => {
    assert.match(src, /postMessage\(\{\s*type:\s*"gameover"/);
  });
});

describe("chống XSS (menu.js)", () => {
  const src = read("js/menu.js");
  it("có hàm sanitize number", () => {
    assert.match(src, /const num = \(v/);
    assert.match(src, /Number\.isFinite/);
  });
  it("gameover handler ép kiểu số trước khi lưu/render", () => {
    assert.match(src, /const score = num\(m\.score\)/);
    assert.match(src, /int0\(m\.wave\)/);
  });
  it("tên profile render bằng textContent (không innerHTML)", () => {
    assert.match(src, /\.textContent = p\.name/);
  });
});

describe("Electron main.js (bảo mật)", () => {
  const src = read("electron/main.js");
  it("contextIsolation: true", () => assert.match(src, /contextIsolation:\s*true/));
  it("nodeIntegration: false", () => assert.match(src, /nodeIntegration:\s*false/));
  it("sandbox: true", () => assert.match(src, /sandbox:\s*true/));
  it("setWindowOpenHandler chỉ cho phép file:// trong thư mục app", () => {
    assert.match(src, /isAllowedAppUrl/);
    assert.match(src, /u\.protocol !== "file:"/);
    assert.match(src, /\{\s*action:\s*"deny"\s*\}/);
  });
  it("chặn will-navigate ra ngoài", () => {
    assert.match(src, /will-navigate/);
    assert.match(src, /e\.preventDefault\(\)/);
  });
  it("không dùng shell.openExternal bừa bãi", () => {
    assert.ok(!src.includes("openExternal"), "không nên có openExternal");
  });
});

describe("CI workflow", () => {
  it(".github/workflows/ci.yml tồn tại & có các job", () => {
    const yml = read(".github/workflows/ci.yml");
    assert.match(yml, /node --check/);
    assert.match(yml, /npm audit/);
    assert.match(yml, /assets\/favicon\.png/);
    assert.match(yml, /on:\s*\n\s*push:/);
  });
});
