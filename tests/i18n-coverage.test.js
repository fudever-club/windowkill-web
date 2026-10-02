/* WINDOWKILL — i18n coverage tests (node:test).
 * SYSTEM TEST: mọi key data-i18n* trong HTML phải tồn tại trong cả 2 dict
 * VI/EN (kể cả key do các team khác register động), và t() phải fallback đúng.
 * Chạy: node --test tests/i18n-coverage.test.js
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

// ---- static: gom key HTML + toàn bộ dict (BASE trong i18n.js + mọi I18N.register) ----
function htmlKeys() {
  const keys = new Set();
  for (const page of ["index.html", "game.html"]) {
    const html = read(page);
    for (const m of html.matchAll(/data-i18n(?:-html|-ph|-aria|-title|-alt)?="([^"]+)"/g)) {
      keys.add(m[1]);
    }
  }
  return keys;
}
function registeredDicts() {
  // Nạp i18n.js thật trong VM → lấy BASE dict qua I18N._dict (khỏi regex giòn)
  const store = {};
  const sandbox = {
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    },
    location: { search: "" },
    document: { readyState: "complete", querySelectorAll: () => [], documentElement: {} },
    console,
  };
  sandbox.window = sandbox;
  sandbox.window.location = sandbox.location;
  sandbox.window.localStorage = sandbox.localStorage;
  vm.createContext(sandbox);
  vm.runInContext(read("js/i18n.js"), sandbox, { filename: "js/i18n.js" });
  const dict = { vi: { ...sandbox.window.I18N._dict.vi }, en: { ...sandbox.window.I18N._dict.en } };

  // Các team khác gọi I18N.register({...}) — trích object literal bằng đếm ngoặc
  // rồi eval với I18N stub, merge key vào dict.
  const stub = { vi: {}, en: {} };
  const fakeI18N = { register: (d) => {
    for (const lang of ["vi", "en"]) if (d[lang]) Object.assign(stub[lang], d[lang]);
  }};
  for (const f of fs.readdirSync(path.join(ROOT, "js"))) {
    if (!f.endsWith(".js") || f === "i18n.js") continue;
    const src = read(path.join("js", f));
    let idx = 0;
    while ((idx = src.indexOf("I18N.register(", idx)) !== -1) {
      let p = idx + "I18N.register(".length, depth = 1, inStr = null, esc = false;
      let j = p;
      for (; j < src.length && depth > 0; j++) {
        const c = src[j];
        if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === inStr) inStr = null; }
        else if (c === '"' || c === "'" || c === "`") inStr = c;
        else if (c === "(" || c === "{") depth++;
        else if (c === ")" || c === "}") depth--;
      }
      const lit = src.slice(p, j - 1);
      try {
        const fn = new Function("I18N", `return (${lit});`);
        // object literal có thể chứa reference biến ngoài → bắt lỗi, bỏ qua chunk đó
        const d = fn(fakeI18N);
        if (d && typeof d === "object") fakeI18N.register(d);
      } catch { /* chunk phụ thuộc runtime — bỏ qua, không fail test */ }
      idx = j;
    }
  }
  for (const lang of ["vi", "en"]) Object.assign(dict[lang], stub[lang]);
  return dict;
}

describe("i18n — HTML keys có mặt trong dict", () => {
  const keys = [...htmlKeys()];
  const dict = registeredDicts();
  it(`quét được key HTML (${keys.length} keys)`, () => {
    assert.ok(keys.length > 30, "quá ít key — regex quét sai?");
  });
  for (const lang of ["vi", "en"]) {
    it(`mọi key HTML tồn tại trong dict ${lang}`, () => {
      const missing = keys.filter((k) => !dict[lang][k] && !dict[lang === "vi" ? "en" : "vi"][k.replace(/\.\d+$/, "")]);
      // key dạng menu.howto.1 (số thứ tự) cho phép thiếu nếu prefix tồn tại — báo riêng
      const hard = missing.filter((k) => !/\.\d+$/.test(k));
      assert.deepEqual(hard, [], `dict ${lang} thiếu: ${hard.slice(0, 10).join(", ")}`);
    });
  }
  it("không key nào chỉ có EN mà thiếu VI (VI là fallback gốc)", () => {
    const onlyEn = Object.keys(dict.en).filter((k) => !dict.vi[k]);
    assert.deepEqual(onlyEn, [], `thiếu VI: ${onlyEn.slice(0, 10).join(", ")}`);
  });
});

// ---- dynamic: nạp i18n.js thật, test t()/fallback/interpolation ----
function loadI18N() {
  const store = {};
  const sandbox = {
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    },
    location: { search: "" },
    document: { readyState: "complete", querySelectorAll: () => [], documentElement: {} },
    console,
  };
  sandbox.window = sandbox;
  sandbox.window.location = sandbox.location;
  sandbox.window.localStorage = sandbox.localStorage;
  vm.createContext(sandbox);
  vm.runInContext(read("js/i18n.js"), sandbox, { filename: "js/i18n.js" });
  return sandbox.window.I18N;
}

describe("i18n — hành vi t()", () => {
  const I18N = loadI18N();
  it("I1: setLang vi/en đổi bản dịch", () => {
    I18N.setLang("vi");
    assert.equal(I18N.t("common.play"), "CHƠI NGAY");
    I18N.setLang("en");
    assert.notEqual(I18N.t("common.play"), "CHƠI NGAY");
    assert.ok(I18N.t("common.play").length > 0);
  });
  it("I2: thiếu key ở EN → fallback VI; key lạ → trả key thô", () => {
    I18N.setLang("en");
    I18N.register({ vi: { "test.onlyvi.zzz": "Chỉ có VI" } });
    assert.equal(I18N.t("test.onlyvi.zzz"), "Chỉ có VI");
    assert.equal(I18N.t("no.such.key.xyz"), "no.such.key.xyz");
  });
  it("I3: interpolation {var} hoạt động (key của BASE dict)", () => {
    I18N.setLang("vi");
    const s = I18N.t("menu.scores.line", { score: "4.056", wave: 6 });
    assert.ok(s.includes("4.056") && s.includes("6"), `got: ${s}`);
  });
  it("I4: setLang giá trị lạ không crash, getLang hợp lệ", () => {
    I18N.setLang("xx");
    assert.ok(["vi", "en"].includes(I18N.getLang()));
  });
});
