/* WINDOWKILL — tests cho adaptive quality tiers + haptics (feat/mobile-quality).
 *
 * 1. Tier thresholds: thông số từng nấc (dprCap, particleMul, shadowScale, bg, juice).
 * 2. Auto-degrade: hạ nấc khi fps thấp kéo dài (mock fps qua onFpsSample);
 *    KHÔNG tự tăng nấc khi đang combat; desktop không tự hạ; manual khóa nấc.
 * 3. Weak-device detect: mobile yếu khởi đầu ở nấc thấp; desktop luôn high.
 * 4. Vibrate guard: buzz() của js/mobile.js không crash khi thiếu navigator.vibrate,
 *    và tôn trọng setting tắt haptic.
 * 5. Setting persist: setManual() lưu wk_settings.quality; menu.js có default +
 *    repair + truyền ?quality= sang game.html.
 *
 * Chạy: node --test tests/mobile-quality.test.js
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

/* Nạp js/quality.js trong VM với navigator/window/localStorage giả lập. */
function loadQuality(opts) {
  opts = opts || {};
  const store = Object.assign({}, opts.store || {});
  const nav = Object.assign(
    { userAgent: "", vendor: "", maxTouchPoints: 0 },
    opts.navigator || {}
  );
  const sandbox = {
    navigator: nav,
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    },
    location: { search: opts.search || "" },
    matchMedia: undefined,
    console,
  };
  if (opts.coarsePointer) {
    sandbox.window = sandbox;
    sandbox.window.matchMedia = () => ({ matches: true });
  }
  sandbox.window = sandbox.window || sandbox;
  sandbox.window.location = sandbox.location;
  sandbox.window.navigator = nav;
  sandbox.window.localStorage = sandbox.localStorage;
  vm.createContext(sandbox);
  vm.runInContext(read("js/quality.js"), sandbox, { filename: "js/quality.js" });
  return { Q: sandbox.window.WKQuality, store, sandbox };
}

const MOBILE_NAV = {
  userAgent: "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36",
  maxTouchPoints: 5, hardwareConcurrency: 8, deviceMemory: 8,
};
const WEAK_MOBILE_NAV = {
  userAgent: "Mozilla/5.0 (Linux; Android 11; Redmi 9A) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0 Mobile Safari/537.36",
  maxTouchPoints: 5, hardwareConcurrency: 4, deviceMemory: 2,
};
const DESKTOP_NAV = {
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  maxTouchPoints: 0, hardwareConcurrency: 16, deviceMemory: 16,
};

describe("quality tiers — thông số từng nấc", () => {
  it("đủ 3 nấc high/balanced/lite theo đúng thứ tự", () => {
    const { Q } = loadQuality({ navigator: DESKTOP_NAV });
    assert.deepEqual([...Q.ORDER], ["high", "balanced", "lite"]); // spread: array từ vm realm khác
    for (const t of Q.ORDER) assert.ok(Q.TIERS[t], "thiếu tier " + t);
  });

  it("high: dprCap 2, particle 100%, shadow đủ, bg/juice full", () => {
    const { Q } = loadQuality({ navigator: DESKTOP_NAV });
    const T = Q.TIERS.high;
    assert.equal(T.dprCap, 2);
    assert.equal(T.particleMul, 1.0);
    assert.equal(T.shadowScale, 1);
    assert.equal(T.bg, "full");
    assert.equal(T.juice, "full");
  });

  it("balanced: dprCap 1.5, particle 60%, shadow nửa", () => {
    const { Q } = loadQuality({ navigator: DESKTOP_NAV });
    const T = Q.TIERS.balanced;
    assert.equal(T.dprCap, 1.5);
    assert.equal(T.particleMul, 0.6);
    assert.equal(T.shadowScale, 0.5);
  });

  it("lite: dprCap 1, particle 30%, tắt shadowBlur, bg/juice reduced", () => {
    const { Q } = loadQuality({ navigator: DESKTOP_NAV });
    const T = Q.TIERS.lite;
    assert.equal(T.dprCap, 1);
    assert.equal(T.particleMul, 0.3);
    assert.equal(T.shadowScale, 0);
    assert.equal(T.bg, "reduced");
    assert.equal(T.juice, "reduced");
  });

  it("getter dprCap/particleMul/shadowScale bám theo tier hiện tại", () => {
    const { Q } = loadQuality({ navigator: DESKTOP_NAV });
    Q.setTier("lite", "test");
    assert.equal(Q.dprCap, 1);
    assert.equal(Q.particleMul, 0.3);
    assert.equal(Q.shadowScale, 0);
    Q.setTier("balanced", "test");
    assert.equal(Q.dprCap, 1.5);
    assert.equal(Q.shadowScale, 0.5);
  });
});

describe("weak-device detect lúc khởi động", () => {
  it("desktop: luôn high ở mode auto", () => {
    const { Q } = loadQuality({ navigator: DESKTOP_NAV });
    Q.init();
    assert.equal(Q.mobile, false);
    assert.equal(Q.tier, "high");
    assert.equal(Q.mode, "auto");
  });

  it("mobile khỏe (8 nhân/8GB): khởi đầu balanced (mobile +1 điểm yếu)", () => {
    const { Q } = loadQuality({ navigator: MOBILE_NAV });
    Q.init();
    assert.equal(Q.mobile, true);
    assert.equal(Q.tier, "balanced");
  });

  it("mobile yếu (4 nhân/2GB): khởi đầu lite", () => {
    const { Q } = loadQuality({ navigator: WEAK_MOBILE_NAV });
    Q.init();
    assert.equal(Q.tier, "lite");
  });

  it("touch + coarse pointer (không có mobile UA) vẫn nhận là mobile", () => {
    const { Q } = loadQuality({
      navigator: { userAgent: "Mozilla/5.0", maxTouchPoints: 10, hardwareConcurrency: 8, deviceMemory: 8 },
      coarsePointer: true,
    });
    Q.init();
    assert.equal(Q.mobile, true);
    assert.equal(Q.tier, "balanced");
  });

  it("?quality=lite trên desktop: khóa manual, bỏ qua detect", () => {
    const { Q } = loadQuality({ navigator: DESKTOP_NAV, search: "?quality=lite" });
    Q.init();
    assert.equal(Q.mode, "manual");
    assert.equal(Q.tier, "lite");
  });

  it("legacy ?fx=reduced (không có ?quality=): mobile high → balanced", () => {
    const { Q } = loadQuality({
      navigator: { userAgent: MOBILE_NAV.userAgent, maxTouchPoints: 5, hardwareConcurrency: 8, deviceMemory: 8 },
      search: "?fx=reduced",
    });
    Q.init();
    assert.equal(Q.tier, "balanced");
    assert.equal(Q.mode, "auto"); // vẫn auto, được phép thích ứng tiếp
  });
});

describe("auto-degrade theo fps (mock)", () => {
  function mobileAtHigh() {
    const ctx = loadQuality({ navigator: MOBILE_NAV });
    ctx.Q.init();
    ctx.Q.setTier("high", "test"); // đưa về high để test stepping
    assert.equal(ctx.Q.mode, "auto");
    return ctx.Q;
  }

  it("< 35fps trong 2s liên tiếp → hạ 1 nấc", () => {
    const Q = mobileAtHigh();
    Q.onFpsSample(30, true);
    assert.equal(Q.tier, "high"); // mới 1s: chưa hạ
    Q.onFpsSample(30, true);
    assert.equal(Q.tier, "balanced"); // đủ 2s: hạ
  });

  it("tiếp tục thấp → hạ tiếp tới lite rồi dừng ở đáy", () => {
    const Q = mobileAtHigh();
    for (let i = 0; i < 2; i++) Q.onFpsSample(30, true);
    assert.equal(Q.tier, "balanced");
    for (let i = 0; i < 2; i++) Q.onFpsSample(30, true);
    assert.equal(Q.tier, "lite");
    for (let i = 0; i < 6; i++) Q.onFpsSample(5, true);
    assert.equal(Q.tier, "lite"); // không rớt khỏi lite
  });

  it("< 22fps: hạ ngay mỗi giây (fast path)", () => {
    const Q = mobileAtHigh();
    Q.onFpsSample(15, true);
    assert.equal(Q.tier, "balanced");
    Q.onFpsSample(15, true);
    assert.equal(Q.tier, "lite");
  });

  it("fps hồi > 55fps 5s khi KHÔNG combat → tăng 1 nấc", () => {
    const Q = mobileAtHigh();
    Q.setTier("lite", "test");
    for (let i = 0; i < 4; i++) { Q.onFpsSample(60, false); assert.equal(Q.tier, "lite"); }
    Q.onFpsSample(60, false);
    assert.equal(Q.tier, "balanced");
  });

  it("KHÔNG BAO GIỜ tự tăng nấc giữa wave đang căng (inCombat=true)", () => {
    const Q = mobileAtHigh();
    Q.setTier("balanced", "test");
    for (let i = 0; i < 12; i++) Q.onFpsSample(60, true);
    assert.equal(Q.tier, "balanced"); // đứng yên dù fps cao
  });

  it("desktop: fps sập cũng không tự hạ (giữ high)", () => {
    const { Q } = loadQuality({ navigator: DESKTOP_NAV });
    Q.init();
    assert.equal(Q.tier, "high");
    for (let i = 0; i < 10; i++) Q.onFpsSample(8, true);
    assert.equal(Q.tier, "high");
  });

  it("manual lock: fps sập cũng không tự đổi nấc", () => {
    const { Q } = loadQuality({ navigator: MOBILE_NAV });
    Q.init();
    Q.setManual("high");
    assert.equal(Q.mode, "manual");
    for (let i = 0; i < 10; i++) Q.onFpsSample(8, true);
    assert.equal(Q.tier, "high");
  });

  it("onTierChange được gọi khi đổi nấc (game.js dùng để áp BG/Juice/fit)", () => {
    const { Q } = loadQuality({ navigator: MOBILE_NAV });
    Q.init();
    Q.setTier("high", "test");
    const calls = [];
    Q.setOnTierChange((tier, reason) => calls.push([tier, reason]));
    Q.onFpsSample(30, true);
    Q.onFpsSample(30, true);
    assert.deepEqual(calls, [["balanced", "low-fps"]]);
  });
});

describe("vibrate guard — không crash khi thiếu API", () => {
  // Trích đúng hàm buzz() từ js/mobile.js rồi chạy với navigator giả lập.
  function loadBuzz() {
    const src = read("js/mobile.js");
    const m = src.match(/var _lastBuzz = 0;\s*function buzz\(p\) \{[\s\S]*?\n  \}/);
    assert.ok(m, "không tìm thấy hàm buzz() trong js/mobile.js");
    return m[0];
  }

  function buzzSandbox(navExtra, hapticOn) {
    const calls = [];
    const nav = Object.assign({}, navExtra);
    if (nav.vibrate === "rec") nav.vibrate = (p) => { calls.push(p); return true; };
    const sb = {
      Date,
      window: {},
      navigator: nav,
      hapticOn: hapticOn === undefined ? (() => true) : hapticOn,
    };
    sb.window.WKPerf = null;
    vm.createContext(sb);
    vm.runInContext(loadBuzz() + "\nthis.__buzz = buzz;", sb, { filename: "buzz-extract" });
    return { buzz: sb.__buzz, calls };
  }

  it("source mobile.js có guard \"vibrate\" in navigator", () => {
    assert.ok(read("js/mobile.js").includes('"vibrate" in navigator'),
      'thiếu guard "vibrate" in navigator trong js/mobile.js');
  });

  it("không crash khi navigator không có vibrate", () => {
    const { buzz } = buzzSandbox({}, () => true);
    assert.doesNotThrow(() => buzz(15));
    assert.doesNotThrow(() => buzz([30, 25, 30]));
    assert.doesNotThrow(() => buzz([50, 30, 50]));
  });

  it("gọi navigator.vibrate khi API tồn tại và setting bật", () => {
    const { buzz, calls } = buzzSandbox({ vibrate: "rec" }, () => true);
    buzz(15);
    assert.deepEqual(calls, [15]);
  });

  it("tôn trọng setting tắt haptic (không gọi vibrate)", () => {
    const { buzz, calls } = buzzSandbox({ vibrate: "rec" }, () => false);
    buzz([60, 40, 60]);
    assert.deepEqual(calls, []);
  });

  it("game.js: 4 điểm haptic mới đều gọi qua wkBuzz() có guard", () => {
    const src = read("js/game.js");
    assert.ok(/function wkBuzz\(p\) \{\s*try \{\s*if \(window\.WKBuzz\)/.test(src),
      "thiếu helper wkBuzz() có guard trong js/game.js");
    const sites = [
      ["nổ lớn (kamikaze)", /WOW tier: nổ lớn\n\s+wkBuzz\(/],
      ["bị hố đen hút", /wkBuzz\(\[30, 25, 30\]\)/],
      ["boss nện", /WOW tier: boss slam\n\s+wkBuzz\(/],
      ["nhặt heart", /p\.kind === "heart"\) wkBuzz\(15\)/],
    ];
    for (const [name, re] of sites) assert.ok(re.test(src), "thiếu haptic: " + name);
  });
});

describe("setting quality — persist + menu wiring", () => {
  it("setManual() persist wk_settings.quality", () => {
    const { Q, store } = loadQuality({ navigator: MOBILE_NAV });
    Q.init();
    Q.setManual("lite");
    const saved = JSON.parse(store["wk_settings"]);
    assert.equal(saved.quality, "lite");
    assert.equal(Q.mode, "manual");
    assert.equal(Q.tier, "lite");
  });

  it("setManual('auto') trở lại auto và giữ các key setting khác", () => {
    const { Q, store } = loadQuality({
      navigator: MOBILE_NAV,
      store: { wk_settings: JSON.stringify({ music: false, quality: "lite" }) },
    });
    Q.init();
    assert.equal(Q.tier, "lite");
    Q.setManual("auto");
    const saved = JSON.parse(store["wk_settings"]);
    assert.equal(saved.quality, "auto");
    assert.equal(saved.music, false); // không làm mất setting khác
    assert.equal(Q.mode, "auto");
  });

  it("setManual() với giá trị lạ → về auto", () => {
    const { Q } = loadQuality({ navigator: MOBILE_NAV });
    Q.init();
    Q.setManual("ultra");
    assert.equal(Q.mode, "auto");
  });

  it("menu.js: default quality=auto + repair + cả 2 URL builder truyền ?quality=", () => {
    const src = read("js/menu.js");
    assert.ok(src.includes('quality: "auto"'), "thiếu default quality trong menu.js");
    assert.ok(src.includes('["auto", "high", "balanced", "lite"].includes(settings.quality)'),
      "thiếu repair quality trong menu.js");
    const builders = src.match(/quality: \["auto", "high", "balanced", "lite"\]\.includes\(settings\.quality\) \? settings\.quality : "auto"/g) || [];
    assert.equal(builders.length, 2, "cần cả 2 URL builder (btn-play + launchGame) truyền quality");
    assert.ok(src.includes('Analytics.track("settings_changed", { key: "quality"'),
      "thiếu analytics settings_changed cho quality");
  });

  it("index.html + game.html: đủ 4 nút data-quality với key i18n", () => {
    for (const page of ["index.html", "game.html"]) {
      const html = read(page);
      for (const v of ["auto", "high", "balanced", "lite"]) {
        assert.ok(html.includes(`data-quality="${v}"`), `${page} thiếu nút data-quality="${v}"`);
        assert.ok(html.includes(`data-i18n="settings.quality_${v}"`), `${page} thiếu i18n key cho quality_${v}`);
      }
    }
  });

  it("i18n: key settings.quality* tồn tại ở cả VI và EN", () => {
    const src = read("js/i18n.js");
    for (const k of ["settings.quality", "settings.quality_auto", "settings.quality_high",
                     "settings.quality_balanced", "settings.quality_lite"]) {
      const n = (src.match(new RegExp('"' + k + '"', "g")) || []).length;
      assert.ok(n >= 2, `key ${k} phải có ở cả 2 dict (tìm thấy ${n})`);
    }
  });
});
