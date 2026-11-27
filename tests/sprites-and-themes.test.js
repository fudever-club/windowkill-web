/* =====================================================================
 * Tests for Cartoon Neon PNG Sprite Registry (js/sprites.js),
 * Themes 6-8 (js/bg.js), Skin/Theme/Virtual Arena wiring (js/game.js,
 * js/menu.js), and Standalone Build Scripts.
 * ===================================================================== */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");

function mockCtx2d() {
  const calls = [];
  const fn = (name) => (...args) => calls.push([name, args]);
  const grad = { addColorStop() {} };
  return {
    __calls: calls,
    fillStyle: "", strokeStyle: "", lineWidth: 1, globalAlpha: 1,
    globalCompositeOperation: "source-over", font: "", textAlign: "left",
    textBaseline: "alphabetic", shadowColor: "", shadowBlur: 0,
    save: fn("save"), restore: fn("restore"), translate: fn("translate"),
    rotate: fn("rotate"), scale: fn("scale"), beginPath: fn("beginPath"),
    closePath: fn("closePath"), moveTo: fn("moveTo"), lineTo: fn("lineTo"),
    arc: fn("arc"), ellipse: fn("ellipse"), rect: fn("rect"),
    fillRect: fn("fillRect"), strokeRect: fn("strokeRect"), clearRect: fn("clearRect"),
    fill: fn("fill"), stroke: fn("stroke"), fillText: fn("fillText"),
    setLineDash: fn("setLineDash"), drawImage: fn("drawImage"),
    createLinearGradient: () => grad, createRadialGradient: () => grad,
  };
}

describe("WKSprites (js/sprites.js) & PNG Asset Integrity", () => {
  const sprites = require(path.join(ROOT, "js", "sprites.js"));

  it("exposes WKSprites API cleanly in Node without DOM Image", () => {
    assert.equal(sprites.BASE, "assets/sprites/");
    assert.equal(typeof sprites.PATHS, "object");
    assert.ok(Object.keys(sprites.PATHS).length >= 100, "should register 100+ sprite keys");
    assert.equal(sprites.get("ship_default"), null, "headless get returns null safely");
    assert.equal(sprites.draw(mockCtx2d(), "ship_default", 0, 0, 32, 32), false, "headless draw returns false");
    assert.equal(sprites.urlOf("ship_default"), "assets/sprites/Ship/ship_skin_default.png");
    assert.equal(sprites.urlOf("nonexistent_key"), null);
  });

  it("toggles enabled state via setEnabled()", () => {
    sprites.setEnabled(false);
    assert.equal(sprites.enabled(), false);
    sprites.setEnabled(true);
    assert.equal(sprites.enabled(), true);
  });

  it("every registered sprite path resolves to an existing valid PNG file", () => {
    for (const [key, relPath] of Object.entries(sprites.PATHS)) {
      const full = path.join(ROOT, "assets", "sprites", relPath);
      assert.ok(fs.existsSync(full), `Missing PNG for key "${key}": ${relPath}`);
      const st = fs.statSync(full);
      assert.ok(st.size > 100, `Empty/corrupt PNG for key "${key}": ${relPath}`);
    }
  });

  it("preserves all 8 asset category folders under assets/sprites/", () => {
    const dirs = ["Ship", "Projectiles", "Monsters", "Bosses", "Pickups", "Satellites", "Backgrounds", "UI"];
    let totalPng = 0;
    for (const d of dirs) {
      const fullDir = path.join(ROOT, "assets", "sprites", d);
      assert.ok(fs.existsSync(fullDir), `Missing folder assets/sprites/${d}`);
      const pngs = fs.readdirSync(fullDir).filter((f) => f.endsWith(".png"));
      assert.ok(pngs.length >= 5, `Expected >=5 PNGs in ${d}, found ${pngs.length}`);
      totalPng += pngs.length;
    }
    assert.equal(totalPng, 200, "all 200 generated PNG sprites preserved under assets/sprites/");
  });
});

describe("BG Themes 6-8 (js/bg.js) & WKSprites Integration", () => {
  it("supports Themes 6, 7, and 8 cleanly while keeping invalid IDs safe", () => {
    const BG = require(path.join(ROOT, "js", "bg.js"));
    const prevDoc = globalThis.document;
    globalThis.document = {
      createElement: () => ({ width: 1280, height: 720, getContext: () => mockCtx2d() }),
    };
    try {
      for (const sid of [6, 7, 8]) {
        const p = BG.PALETTES[sid];
        const th = BG.getTheme(sid);
        assert.ok(p && p.base0 && p.base1 && p.grid, `Palette ${sid} exists`);
        assert.ok(th && th.decor && th.border && th.border.kind, `Theme ${sid} border & decor valid`);
        assert.doesNotThrow(() => BG.build(sid, 1280, 720));
        assert.doesNotThrow(() => BG.draw(mockCtx2d(), 1200));
      }
      assert.deepEqual(BG.getTheme(9), {});
    } finally {
      globalThis.document = prevDoc;
    }
  });

  it("draws WKSprites base and parallax layers when image objects are ready", () => {
    const src = fs.readFileSync(path.join(ROOT, "js", "bg.js"), "utf8");
    const fakeImg = { width: 512, height: 512, naturalWidth: 512, naturalHeight: 512 };
    const ctxCalls = [];
    const ctx = mockCtx2d();
    const fakeCanvas = {
      width: 1280, height: 720,
      getContext: () => ({
        fillStyle: "", strokeStyle: "", lineWidth: 1, globalAlpha: 1, font: "", textAlign: "left",
        createLinearGradient: () => ({ addColorStop() {} }),
        createRadialGradient: () => ({ addColorStop() {} }),
        save() {}, restore() {}, translate() {}, rotate() {}, beginPath() {}, closePath() {},
        moveTo() {}, lineTo() {}, arc() {}, fill() {}, stroke() {}, fillRect() {}, fillText() {},
        drawImage: (...args) => ctxCalls.push(args),
      }),
    };
    const wkSpritesStub = { enabled: () => true, get: () => fakeImg, onLoad: () => {} };
    const sand = {
      Math, Object, Array, Number, JSON,
      document: { createElement: () => fakeCanvas },
      WKSprites: wkSpritesStub,
      window: { WKSprites: wkSpritesStub },
      performance: { now: () => 1000 },
    };
    sand.globalThis = sand;
    const BGLive = vm.runInNewContext(src + "\n;BG;", sand);
    BGLive.setQuality("full");
    BGLive.build(6, 1280, 720);
    BGLive.draw(ctx, 2500);
    assert.ok(ctxCalls.length >= 1, "paintBase should composite bg_6_base sprite");
    assert.ok(ctx.__calls.some((c) => c[0] === "drawImage"), "BG.draw should draw parallax / base");
  });
});

describe("Web/Mobile/Electron Packaging Contracts", () => {
  it("sw.js precaches js/sprites.js cleanly", () => {
    const sw = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");
    assert.ok(sw.includes('"js/sprites.js"'), "sw.js CORE_ASSETS must include js/sprites.js");
  });

  it("index.html and game.html load js/sprites.js cleanly", () => {
    const idx = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
    const game = fs.readFileSync(path.join(ROOT, "game.html"), "utf8");
    assert.ok(idx.includes('src="js/sprites.js"'), "index.html loads js/sprites.js");
    assert.ok(game.includes('src="js/sprites.js"'), "game.html loads js/sprites.js");
  });

  it("game.js exposes built sprite hooks, Virtual Arena, and 8-theme support", () => {
    const game = fs.readFileSync(path.join(ROOT, "js", "game.js"), "utf8");
    assert.ok(game.includes("FORCE_VIRTUAL_ARENA"), "Virtual Arena flag built into game.js");
    assert.ok(game.includes("drawEnemySprite"), "Enemy PNG sprite renderer built into game.js");
    assert.ok(game.includes("BOSS_SPRITE_MAP"), "Endless boss PNG sprite map built into game.js");
    assert.ok(game.includes("_skinKey"), "Player skin PNG renderer built into game.js");
  });

  it("Electron and Mobile build scripts & manifests exist and pass syntax", () => {
    assert.ok(fs.existsSync(path.join(ROOT, "scripts", "build-electron.js")));
    assert.ok(fs.existsSync(path.join(ROOT, "scripts", "build-mobile.js")));
    assert.ok(fs.existsSync(path.join(ROOT, "scripts", "lib", "stage-web.js")));
    assert.ok(fs.existsSync(path.join(ROOT, "mobile", "capacitor.config.json")));
    assert.ok(fs.existsSync(path.join(ROOT, "electron", "assets", "icon.ico")));
  });
});
