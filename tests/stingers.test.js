/* WINDOWKILL — stingers tests (node:test, no deps).
 * Chạy: node --test tests/stingers.test.js
 *
 * 4 stinger file-based (CEO duyệt 2026-10-04): wave-clear / level-up / game-over / victory.
 * Phần A: kiểm tra tĩnh (file tồn tại, trigger đúng vị trí, sw precache).
 * Phần B: kiểm tra động — load js/audio.js trong vm sandbox với AudioContext/fetch/
 *   document mock, verify preload → phát qua sfxBus → toggle SFX → fallback procedural.
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const STINGERS = [
  ["wave-clear", "waveClear"],
  ["level-up", "levelUp"],
  ["game-over", "gameOver"],
  ["victory", "victory"],
];

describe("A. file stinger", () => {
  for (const [file] of STINGERS) {
    for (const ext of ["ogg", "mp3"]) {
      const p = `assets/stingers/stinger-${file}.${ext}`;
      it(`${p} tồn tại & không rỗng`, () => {
        const st = fs.statSync(path.join(ROOT, p));
        assert.ok(st.size > 1000, `${p} quá nhỏ/không hợp lệ`);
      });
    }
    it(`stinger-${file}.ogg là OGG hợp lệ`, () => {
      const b = fs.readFileSync(path.join(ROOT, `assets/stingers/stinger-${file}.ogg`));
      assert.equal(b.subarray(0, 4).toString("ascii"), "OggS");
    });
    it(`stinger-${file}.mp3 có magic hợp lệ`, () => {
      const b = fs.readFileSync(path.join(ROOT, `assets/stingers/stinger-${file}.mp3`));
      const isId3 = b.subarray(0, 3).toString("ascii") === "ID3";
      const isFrame = b[0] === 0xff && (b[1] & 0xe0) === 0xe0;
      assert.ok(isId3 || isFrame, "mp3 magic không hợp lệ");
    });
  }
  it("CREDITS.md tồn tại", () => {
    assert.ok(fs.existsSync(path.join(ROOT, "assets/stingers/CREDITS.md")));
  });
});

describe("B. hạ tầng stinger trong js/audio.js", () => {
  const src = read("js/audio.js");
  it("STINGER_DEFS đủ 4 stinger + fallback procedural", () => {
    for (const [, name] of STINGERS) assert.ok(src.includes(`${name}:`), `thiếu def ${name}`);
    for (const fb of ["sfx.wave()", "sfx.up()", "sfx.over()", "sfx.fanfare()"])
      assert.ok(src.includes(fb), `thiếu fallback ${fb}`);
  });
  it("có preloadStingers + playStinger + sfx.stinger(name)", () => {
    assert.ok(src.includes("function preloadStingers()"));
    assert.ok(src.includes("function playStinger(name)"));
    assert.ok(src.includes("stinger(name) { playStinger(name); }"));
  });
  it("resume() preload stinger sau user gesture", () => {
    const m = src.match(/function resume\(\) \{[\s\S]*?\n  \}/);
    assert.ok(m && m[0].includes("preloadStingers()"), "resume() chưa gọi preloadStingers()");
  });
  it("phát qua G.sfxBus (tự tôn trọng toggle SFX)", () => {
    assert.ok(src.includes("src.connect(G.sfxBus)"), "stinger phải route qua G.sfxBus");
  });
  it("chọn OGG primary / MP3 fallback theo canPlayType", () => {
    assert.ok(src.includes('audio/ogg; codecs="vorbis"'));
    assert.ok(src.includes('"assets/stingers/"'));
  });
});

describe("C. trigger trong game.js", () => {
  const src = read("js/game.js");
  it('die() phát stinger("gameOver"), không còn sfx.over()', () => {
    assert.ok(src.includes('stinger("gameOver")'), "die() thiếu stinger gameOver");
    assert.ok(!src.includes("AudioEngine.sfx.over()"), "die() vẫn còn gọi AudioEngine.sfx.over() buồn");
  });
  it('openDraft() phát stinger("levelUp")', () => {
    assert.ok(src.includes('stinger("levelUp")'));
  });
  it('killBoss() phát stinger("victory")', () => {
    assert.ok(src.includes('stinger("victory")'));
  });
  it('wave-clear phát stinger("waveClear") ở cả 2 nhánh fallback', () => {
    const n = (src.match(/stinger\("waveClear"\)/g) || []).length;
    assert.equal(n, 2, `game.js cần 2 trigger waveClear, thấy ${n}`);
  });
});

describe("D. cinema.js", () => {
  const src = read("js/cinema.js");
  it('waveClear cinematic dùng sfx("stinger", "waveClear")', () => {
    assert.ok(src.includes('sfx("stinger", "waveClear")'));
  });
  it("không còn sfx fanfare (tránh chồng tiếng với stinger)", () => {
    assert.ok(!src.includes('sfx("fanfare")'), "cinema.js vẫn còn sfx fanfare");
  });
});

describe("E. sw.js precache", () => {
  const src = read("sw.js");
  for (const [file] of STINGERS)
    for (const ext of ["ogg", "mp3"])
      it(`precache assets/stingers/stinger-${file}.${ext}`, () => {
        assert.ok(src.includes(`assets/stingers/stinger-${file}.${ext}`));
      });
});

/* ================= F. dynamic: audio.js trong sandbox ================= */

function makeGain(log) {
  const g = {
    gain: {
      value: 1,
      setValueAtTime(v) { g.gain.value = v; },
      setTargetAtTime(v) { log.push(v); g.gain.value = v; },
      exponentialRampToValueAtTime() {},
      linearRampToValueAtTime() {},
      cancelScheduledValues() {},
    },
    connect(d) { g._to = d; return d; },
    disconnect() {},
  };
  return g;
}

function makeSandbox({ oggSupport = "probably", fetchOk = true } = {}) {
  const gainSetCalls = [];
  const sources = [];
  const fetched = [];
  class MockAC {
    constructor() {
      this.state = "running"; this.currentTime = 100; this.sampleRate = 48000;
      this.destination = {}; this.sources = sources; this.gainSetCalls = gainSetCalls;
    }
    resume() { return Promise.resolve(); }
    createGain() { return makeGain(gainSetCalls); }
    createBufferSource() {
      const s = { buffer: null, connect(d) { s._to = d; }, start() { s._started = true; }, stop() {} };
      sources.push(s); return s;
    }
    createOscillator() {
      return { type: "", frequency: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} },
               connect() {}, start() {}, stop() {} };
    }
    createBiquadFilter() {
      return { type: "", frequency: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} },
               Q: { value: 0 }, connect() {} };
    }
    createDelay() { const g = makeGain(gainSetCalls); g.delayTime = { value: 0 }; return g; }
    createDynamicsCompressor() {
      const g = makeGain(gainSetCalls);
      g.threshold = { value: 0 }; g.ratio = { value: 0 }; g.knee = { value: 0 };
      g.attack = { value: 0 }; g.release = { value: 0 }; return g;
    }
    createBuffer(ch, len) { return { getChannelData: () => new Float32Array(len) }; }
    decodeAudioData(ab) { return Promise.resolve({ _decoded: true, _bytes: ab.byteLength }); }
  }
  const win = { AudioContext: MockAC };
  const doc = {
    createElement: () => ({ canPlayType: () => oggSupport }),
    addEventListener() {}, hidden: false,
  };
  const fetchMock = (url) => {
    fetched.push(url);
    if (!fetchOk) return Promise.resolve({ ok: false, status: 404 });
    return Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(64)) });
  };
  const sandbox = { window: win, document: doc, fetch: fetchMock, console,
                    _fetched: fetched, _sources: sources, _gainSetCalls: gainSetCalls };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(read("js/audio.js"), sandbox, { filename: "js/audio.js" });
  sandbox._AE = vm.runInContext("AudioEngine", sandbox);
  return sandbox;
}

const tick = (n = 20) => new Promise((res) => {
  let i = 0; const step = () => (++i >= n ? res() : setImmediate(step)); step();
});

describe("F. dynamic — preload & phát", () => {
  it("resume() preload 4 stinger (OGG khi browser hỗ trợ)", async () => {
    const sb = makeSandbox({ oggSupport: "probably" });
    sb._AE.resume();
    await tick();
    assert.equal(sb._fetched.length, 4, `cần 4 fetch, thấy ${sb._fetched.length}`);
    for (const u of sb._fetched) assert.ok(u.endsWith(".ogg"), `phải là ogg: ${u}`);
  });

  it("không hỗ trợ OGG → dùng MP3", async () => {
    const sb = makeSandbox({ oggSupport: "" });
    sb._AE.resume();
    await tick();
    assert.equal(sb._fetched.length, 4);
    for (const u of sb._fetched) assert.ok(u.endsWith(".mp3"), `phải là mp3: ${u}`);
  });

  it("stinger đã load → phát BufferSource qua sfxBus", async () => {
    const sb = makeSandbox();
    sb._AE.resume();
    await tick();
    sb._AE.sfx.stinger("waveClear");
    assert.equal(sb._sources.length, 1, "phải tạo 1 BufferSource");
    const s = sb._sources[0];
    assert.ok(s.buffer && s.buffer._decoded, "source phải gắn buffer đã decode");
    assert.ok(s._started, "source phải được start()");
    assert.ok(s._to, "source phải connect vào bus");
  });

  it("chưa load xong → fallback procedural (không im lặng, không crash)", async () => {
    const sb = makeSandbox();
    sb._AE.resume();
    // gọi ngay, chưa await → buffer chưa có → fallback sfx.wave() (oscillator, không BufferSource)
    sb._AE.sfx.stinger("waveClear");
    assert.equal(sb._sources.length, 0, "fallback không dùng BufferSource");
  });

  it("fetch lỗi → fallback procedural, không throw", async () => {
    const sb = makeSandbox({ fetchOk: false });
    sb._AE.resume();
    await tick();
    assert.doesNotThrow(() => sb._AE.sfx.stinger("gameOver"));
    assert.equal(sb._sources.length, 0);
  });

  it("toggle SFX tắt → sfxTgl gain về 0 (stinger im theo)", async () => {
    const sb = makeSandbox();
    sb._AE.resume();
    await tick();
    sb._gainSetCalls.length = 0;
    sb._AE.setSettings({ sfx: false });
    assert.ok(sb._gainSetCalls.some((v) => v < 0.001), "tắt SFX phải set gain ~0");
    sb._gainSetCalls.length = 0;
    sb._AE.setSettings({ sfx: true });
    assert.ok(sb._gainSetCalls.some((v) => v > 0.5), "bật SFX phải restore gain");
  });

  it("tên stinger lạ → không crash", () => {
    const sb = makeSandbox();
    assert.doesNotThrow(() => sb._AE.sfx.stinger("khong-co"));
  });
});
