/* WINDOWKILL — Boss personality tests (node:test).
 * 6 boss cá tính wave 5/10/15/20/25/30: identity đầy đủ (tên VI+EN, telegraph),
 * và STAT LOCK — hpMul/shot/slam/adds phải khớp baseline Act hiện tại
 * (ai vô tình buff boss sẽ fail CI). Triết lý "vui vẻ > khó khăn":
 * flair/telegraph chỉ visual, không tăng khó.
 * Chạy: node --test tests/boss-personality.test.js
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const gameSrc = fs.readFileSync(path.join(ROOT, "js", "game.js"), "utf8");
const i18nSrc = fs.readFileSync(path.join(ROOT, "js", "i18n.js"), "utf8");

/* ---- load BOSS_PERSONAS + bossPersonaOf (pure data, không phụ thuộc browser) ---- */
function loadPersonas() {
  const start = gameSrc.indexOf("var BOSS_PERSONAS =");
  assert.ok(start !== -1, "không tìm thấy var BOSS_PERSONAS trong js/game.js");
  const endMarker = "return BOSS_PERSONAS[0];\n}";
  const end = gameSrc.indexOf(endMarker, start);
  assert.ok(end !== -1, "không tìm thấy hết function bossPersonaOf");
  const snippet = gameSrc.slice(start, end + endMarker.length);
  const sb = {};
  vm.createContext(sb);
  vm.runInContext(snippet, sb, { filename: "boss-personas-snippet" });
  return { BOSS_PERSONAS: sb.BOSS_PERSONAS, bossPersonaOf: sb.bossPersonaOf };
}
/* ---- load i18n dict thật ---- */
function loadDict() {
  const store = {};
  const sb = {
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    },
    location: { search: "" },
    document: { readyState: "complete", querySelectorAll: () => [], documentElement: {} },
    console,
  };
  sb.window = sb;
  vm.createContext(sb);
  vm.runInContext(i18nSrc, sb, { filename: "js/i18n.js" });
  return { vi: sb.window.I18N._dict.vi, en: sb.window.I18N._dict.en };
}

const { BOSS_PERSONAS, bossPersonaOf } = loadPersonas();
const dict = loadDict();

/* Baseline Act hiện tại — KHÓA SỐ (đổi số ở đây = đổi thiết kế game, cần CEO duyệt) */
const ACT_BASELINE = {
  1: { hpMul: 1.0, shot: "ring", slam: 26, adds: ["chewer", "chewer"], color: "#8b2fc9" },
  2: { hpMul: 1.6, shot: "aimed", slam: 32, adds: ["dasher"], color: "#5b21b6" },
  3: { hpMul: 2.3, shot: "spiral", slam: 38, adds: ["chewer", "dasher"], color: "#b91c1c" },
};
const actOf = (w) => (w <= 10 ? 1 : w <= 20 ? 2 : 3);
const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

describe("boss personality — bảng BOSS_PERSONAS (6 boss)", () => {
  it("đủ 6 entry, wave 5/10/15/20/25/30 theo thứ tự", () => {
    assert.equal(BOSS_PERSONAS.length, 6);
    assert.equal(BOSS_PERSONAS.map((p) => p.wave).join(","), "5,10,15,20,25,30");
  });
  it("mỗi entry đủ identity: id, nameKey, teleKey, flair, telegraph", () => {
    for (const p of BOSS_PERSONAS) {
      for (const k of ["id", "nameKey", "teleKey", "color", "hpMul", "shot", "slam", "adds", "flair", "telegraph"])
        assert.ok(p[k] !== undefined && p[k] !== "", `${p.wave}: thiếu ${k}`);
    }
  });
  it("id / flair / telegraph phân biệt nhau (6 cá tính riêng)", () => {
    for (const k of ["id", "flair", "telegraph"]) {
      const vals = BOSS_PERSONAS.map((p) => p[k]);
      assert.equal(new Set(vals).size, 6, `${k} trùng nhau: ${vals}`);
    }
  });
  it("id đúng thứ tự mong đợi", () => {
    assert.equal(BOSS_PERSONAS.map((p) => String(p.id)).join(","),
      "gnome,deadline,dj,sniffly,corechill,teaser");
  });
});

describe("boss personality — STAT LOCK (không tăng khó)", () => {
  for (const p of BOSS_PERSONAS) {
    const base = ACT_BASELINE[actOf(p.wave)];
    it(`wave ${p.wave} (${p.id}): hpMul/shot/slam/adds/color = baseline act${actOf(p.wave)}`, () => {
      assert.equal(p.hpMul, base.hpMul, "hpMul đổi → boss khó hơn!");
      assert.equal(p.shot, base.shot, "shot pattern đổi!");
      assert.equal(p.slam, base.slam, "slam đổi → cửa sổ mất nhiều máu hơn!");
      assert.deepEqual([...p.adds], [...base.adds], "adds đổi!");
      assert.equal(p.color, base.color, "color đổi!");
    });
  }
  it("công thức HP boss giữ nguyên: (130 + wave*14) * DIFF.hpMul * v.hpMul", () => {
    assert.match(gameSrc, /const hp = \(130 \+ G\.wave \* 14\) \* DIFF\.hpMul \* v\.hpMul;/);
  });
  it("bossFlairTick không đụng hp/dmg/tốc độ (chỉ visual)", () => {
    const m = gameSrc.match(/function bossFlairTick\(bs, dt\) \{[\s\S]*?\n\}/);
    assert.ok(m, "không tìm thấy bossFlairTick");
    const body = m[0];
    assert.ok(!/\.hp\s*=|\.dmg\s*=|\.speed\s*=|spawnEnemy\(/.test(body),
      "bossFlairTick đụng stat/spawn — vi phạm triết lý vui vẻ > khó!");
  });
  it("drawBossFlair không đụng hitbox/sát thương (chỉ vẽ)", () => {
    const m = gameSrc.match(/function drawBossFlair\(c, bs, r\) \{[\s\S]*?\n\}/);
    assert.ok(m, "không tìm thấy drawBossFlair");
    const body = m[0];
    assert.ok(!/bs\.r\s*=|bs\.dmg|hurtShip|shrinkWindow/.test(body),
      "drawBossFlair đụng gameplay!");
  });
  it("đạn giấy giữ nguyên r (chỉ đổi cách vẽ)", () => {
    assert.match(gameSrc, /ctx\.fillRect\(-eb\.r, -eb\.r \* 0\.7, eb\.r \* 2, eb\.r \* 1\.4\)/);
  });
});

describe("boss personality — bossPersonaOf(w)", () => {
  const cases = [[1, "gnome"], [5, "gnome"], [9, "gnome"], [10, "deadline"], [14, "deadline"],
    [15, "dj"], [19, "dj"], [20, "sniffly"], [24, "sniffly"],
    [25, "corechill"], [29, "corechill"], [30, "teaser"], [35, "teaser"], [40, "teaser"], [100, "teaser"]];
  for (const [w, id] of cases)
    it(`wave ${w} → ${id}`, () => { assert.equal(bossPersonaOf(w).id, id); });
});

describe("boss personality — spawnBoss wiring", () => {
  it("spawnBoss dùng bossPersonaOf(G.wave)", () => {
    assert.match(gameSrc, /const v = bossPersonaOf\(G\.wave\)/);
  });
  it("spawnBoss gọi bossTelegraph(v) TRƯỚC cinematic", () => {
    const m = gameSrc.match(/async function spawnBoss\(\) \{[\s\S]*?\n\}[\s\S]*?function bossTelegraph/);
    assert.ok(m, "không tìm thấy spawnBoss");
    const body = m[0];
    assert.ok(body.indexOf("bossTelegraph(v)") < body.indexOf("window.Cinema"),
      "telegraph phải chạy trước cinematic");
  });
  it("G.boss gắn persona + flair", () => {
    assert.match(gameSrc, /persona:\s*v\.id,\s*flair:\s*v\.flair/);
  });
  it("banner/intro hiện tên boss i18n", () => {
    assert.match(gameSrc, /const bName = I18N\.t\(v\.nameKey\);/);
    assert.match(gameSrc, /`BOSS: \$\{bName\}`/);
  });
  it("vòng lặp boss gọi bossFlairTick", () => {
    assert.match(gameSrc, /bossFlairTick\(bs, dt\);/);
  });
  it("draw boss gọi drawBossFlair khi có persona", () => {
    assert.match(gameSrc, /if \(bs\.persona\) drawBossFlair\(ctx, bs, r\);/);
  });
});

describe("boss personality — i18n VI+EN", () => {
  const extraKeys = ["boss.w10.papers", "boss.w15.quay", "boss.w20.sneeze",
    "boss.w25.yawn", "boss.w30.taunt1", "boss.w30.taunt2", "boss.w30.taunt3"];
  for (const p of BOSS_PERSONAS) {
    for (const kk of [p.nameKey, p.teleKey]) {
      it(`${kk}: tồn tại, khác rỗng, VI ≠ EN`, () => {
        assert.ok(dict.vi[kk] && dict.vi[kk].length > 0, `thiếu VI ${kk}`);
        assert.ok(dict.en[kk] && dict.en[kk].length > 0, `thiếu EN ${kk}`);
        assert.notEqual(dict.vi[kk], dict.en[kk], `${kk} VI/EN giống nhau — chưa dịch?`);
      });
    }
  }
  for (const k of extraKeys) {
    it(`${k}: có VI + EN`, () => {
      assert.ok(dict.vi[k], `thiếu VI ${k}`);
      assert.ok(dict.en[k], `thiếu EN ${k}`);
    });
  }
  it("không emoji trong mọi key boss.*", () => {
    for (const lang of ["vi", "en"])
      for (const k of Object.keys(dict[lang]).filter((k) => k.startsWith("boss.")))
        assert.ok(!EMOJI_RE.test(dict[lang][k]), `emoji trong ${lang}.${k}`);
  });
  it("tên boss 6 con phân biệt nhau (VI và EN)", () => {
    for (const lang of ["vi", "en"]) {
      const names = BOSS_PERSONAS.map((p) => dict[lang][p.nameKey]);
      assert.equal(new Set(names).size, 6, `tên ${lang} trùng: ${names}`);
    }
  });
});
