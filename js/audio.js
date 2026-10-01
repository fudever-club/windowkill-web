/* ============================================================================
 * WINDOWKILL: Web Edition — adaptive audio engine (Web Audio 100% procedural)
 * v2.1 "fun" · vanilla JS, IIFE, strict, zero dependencies, no audio files
 * Hướng nhạc: VUI NHỘN, NHỊP NHANH (user feedback 2026-10-01) — C major / G Mixolydian,
 *   BPM 120-168, SFX cartoon (boing/pop/slide-whistle/sad-trombone). Không rùng rợn.
 *
 * Kiến trúc:
 *   master(1.0) ─┬─ musicBus(.70) → pump → hurtDuck → focusDuck → musicTgl ─┐
 *                ├─ sfxBus(.90) ────────────────────────────────────────────┤
 *                ├─ uiBus(.55) ──────────────────────────────────────────────┼─→ sfxTgl ─→ comp(-18dB, 6:1) → destination
 *                └─ criticalBus(1.0, bypass mọi duck) ───────────────────────┘
 *   musicTgl/sfxTgl = toggle nhạc/SFX của user (hiệu lực ngay, không reload).
 *
 * API public (giữ backward-compat với game.js / menu.js cũ):
 *   AudioEngine.setSettings({music,sfx,musicVol,sfxVol}) · resume() · tone(...)
 *   AudioEngine.sfx.* — 15 tên cũ (shoot hit boom bigboom gem up thud shrink
 *     wave boss over hurt pickup nuke click) vẫn hoạt động, remap sang engine mới.
 *   AudioEngine.startMusic(mode) / stopMusic() — legacy ("menu","game","act1..3").
 *   window.WKAudio = { setMusic, setSfx, ensure } — shim cho menu.js.
 *
 * API mới (worker khác gọi):
 *   AudioEngine.setMusicState(state, intensity, hp01)
 *     state: MENU|CALM|COMBAT|DANGER|BOSS|VICTORY|GAMEOVER (ưu tiên theo thứ tự này)
 *     intensity: 0..4 (số layer nhạc bật) · hp01: HP window/player 0..1 (cho DANGER gate)
 *     Contract: leo thang/priority cao hơn -> ngay (pattern ở bar boundary);
 *       xuống thang -> debounce 4s; rời DANGER cần hp01>0.4 duy trì 5s
 *       (chỉ khi worker truyền hp01 — không truyền = worker quyết định, cho hạ);
 *       VICTORY/GAMEOVER luôn punctual; VICTORY tự quay về sau 3.5s.
 *   AudioEngine.getMusicState() · AudioEngine.duckMusic(db, ms)
 *   sfx mới: death(kind) · explosion(power) · hitstop_thump · combo_milestone(tier)
 *     boss_roar · phase_shift · riser · downlifter · fanfare · heartbeat
 *     ui_click · ui_hover · gnaw · crack (alias của gnaw)
 * ========================================================================== */
"use strict";
const AudioEngine = (() => {

  /* ================= 0. Context / settings / bus graph ================= */
  let ctx = null;
  let G = null; // graph nodes
  const settings = { music: true, sfx: true, musicVol: 0.7, sfxVol: 0.9 };
  let pendingMusicStart = null; // setMusicState gọi trước khi có AudioContext

  function ac() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      buildGraph(ctx);
    }
    return ctx;
  }

  function resume() {
    const a = ac();
    if (!a) return;
    try { if (a.state === "suspended") a.resume(); } catch (e) {}
    if (pendingMusicStart && settings.music) {
      const p = pendingMusicStart; pendingMusicStart = null;
      setMusicState(p.st, p.i);
    }
  }

  function buildGraph(a) {
    const master = a.createGain(); master.gain.value = 1.0;
    const comp = a.createDynamicsCompressor();
    comp.threshold.value = -18;   // spec §3.3
    comp.ratio.value = 6;
    comp.knee.value = 12;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;
    comp.connect(a.destination);

    // Music chain: bus .70 → sidechain pump → hurt/gnaw duck → focus duck → toggle
    const musicBus = a.createGain(); musicBus.gain.value = 0.70;
    const pump = a.createGain();
    const hurtDuck = a.createGain();
    const focusDuck = a.createGain();
    const musicTgl = a.createGain();
    master.connect(musicBus);
    musicBus.connect(pump); pump.connect(hurtDuck); hurtDuck.connect(focusDuck);
    focusDuck.connect(musicTgl); musicTgl.connect(comp);

    // SFX / UI / Critical chains — critical bypass mọi duck
    const sfxBus = a.createGain(); sfxBus.gain.value = 0.90;
    const uiBus = a.createGain(); uiBus.gain.value = 0.55;
    const critBus = a.createGain(); critBus.gain.value = 1.0;
    const sfxTgl = a.createGain(); // toggle SFX của user (cả critical cũng tắt)
    master.connect(sfxBus); master.connect(uiBus); master.connect(critBus);
    sfxBus.connect(sfxTgl); uiBus.connect(sfxTgl); critBus.connect(sfxTgl);
    sfxTgl.connect(comp);

    // 5 music layer độc lập
    const layers = {};
    ["pad", "bass", "drums", "arp", "fx"].forEach(n => {
      const g = a.createGain(); g.gain.value = 0;
      g.connect(musicBus); layers[n] = g;
    });

    // Delay dotted-8th @140bpm = 0.321s, feedback 0.35 — CHỈ cho arp
    const dly = a.createDelay(1.0); dly.delayTime.value = 0.321;
    const fb = a.createGain(); fb.gain.value = 0.35;
    const dlySend = a.createGain(); dlySend.gain.value = 0.5;
    const dlyWet = a.createGain(); dlyWet.gain.value = 0.45;
    layers.arp.connect(dlySend);
    dlySend.connect(dly); dly.connect(fb); fb.connect(dly);
    dly.connect(dlyWet); dlyWet.connect(musicBus);

    G = { master, comp, musicBus, pump, hurtDuck, focusDuck, musicTgl,
          sfxBus, uiBus, critBus, sfxTgl, layers };

    // Áp toggle hiện tại
    musicTgl.gain.value = settings.music ? settings.musicVol : 0;
    sfxTgl.gain.value = settings.sfx ? settings.sfxVol : 0;

    // Tab blur: nhạc duck -20dB/500ms, SFX giữ nguyên, recover 800ms
    document.addEventListener("visibilitychange", () => {
      if (!ctx || !G) return;
      const t = ctx.currentTime;
      if (document.hidden) G.focusDuck.gain.setTargetAtTime(0.1, t, 0.15);
      else G.focusDuck.gain.setTargetAtTime(1.0, t, 0.27);
    });
  }

  /* ================= 1. Voice management (steal) ================= */
  const MAX_VOICES = 24;
  const TYPE_CAP = { shoot: 6, death: 8, gem: 4 };
  // Thứ tự ưu tiên GIỮ (steal từ thấp lên cao): shoot < gem < death < pickup < UI
  const CAT_PRI = { shoot: 1, gem: 2, death: 3, pickup: 4, ui: 5 };
  let active = [];
  let noiseBufCache = null;

  function noiseBuf(a) {
    if (!noiseBufCache) {
      const len = Math.floor(a.sampleRate * 2);
      noiseBufCache = a.createBuffer(1, len, a.sampleRate);
      const d = noiseBufCache.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    return noiseBufCache;
  }
  const dz = () => 1 + (Math.random() * 0.08 - 0.04); // detune ±4% chống machine-gun

  function sweepVoices() {
    if (!ctx) return;
    const now = ctx.currentTime;
    active = active.filter(v => v.alive && v.endT > now - 0.25);
  }
  function killVoice(v) {
    if (!v.alive || !ctx) return;
    v.alive = false;
    try {
      const t = ctx.currentTime;
      v.gain.gain.cancelScheduledValues(t);
      v.gain.gain.setTargetAtTime(0.0001, t, 0.008);
      v.nodes.forEach(n => { try { n.stop(t + 0.09); } catch (e) {} });
    } catch (e) {}
  }
  function registerVoice(v) {
    sweepVoices();
    const cap = TYPE_CAP[v.type];
    if (cap) {
      const same = active.filter(x => x.alive && x.type === v.type)
                         .sort((a, b) => a.t0 - b.t0);
      while (same.length >= cap) killVoice(same.shift());
    }
    if (!v.critical) {
      let pool = active.filter(x => x.alive && !x.critical);
      while (pool.length >= MAX_VOICES) {
        pool.sort((a, b) => (CAT_PRI[a.cat] - CAT_PRI[b.cat]) || (a.t0 - b.t0));
        const victim = pool.shift();
        if (!victim) break;
        killVoice(victim);
      }
    }
    active.push(v);
  }

  /* oneShot({bus,type,cat,critical,when,build}) — build(a,t,out,v) tạo nodes,
     return duration (giây). Critical: không bao giờ bị steal, không bị duck. */
  function oneShot(o) {
    const a = ac();
    if (!a || !G) return null;
    const t = a.currentTime + (o.when || 0);
    const out = a.createGain(); out.gain.value = 1;
    const bus = (typeof o.bus === "function") ? o.bus() : (o.bus || G.sfxBus);
    out.connect(bus);
    const v = { type: o.type || "death", cat: o.cat || "death",
                critical: !!o.critical, gain: out, nodes: [],
                alive: true, t0: t, endT: t + 1 };
    registerVoice(v);
    let dur = 0.3;
    try { dur = o.build(a, t, out, v) || dur; } catch (e) {}
    v.endT = t + dur + 0.15;
    return v;
  }

  /* ---- synth helpers (dùng trong build) ---- */
  function oscNode(a, v, type, f) {
    const o = a.createOscillator(); o.type = type; o.frequency.value = f;
    v.nodes.push(o); return o;
  }
  function adsr(a, t, peak, atk, dur) {
    const g = a.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    return g;
  }
  // blip pitched có slide, route vào voice out
  function blip(a, t, out, v, o) {
    const f0 = o.f * dz();
    const osc = oscNode(a, v, o.type || "sine", f0);
    osc.frequency.setValueAtTime(f0, t);
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t + o.dur);
    const g = adsr(a, t, o.vol || 0.2, o.atk || 0.006, o.dur);
    osc.connect(g); g.connect(out);
    osc.start(t); osc.stop(t + o.dur + 0.05);
  }
  // noise hit có filter sweep
  function noiseHit(a, t, out, v, o) {
    const src = a.createBufferSource(); src.buffer = noiseBuf(a); src.loop = true;
    const flt = a.createBiquadFilter(); flt.type = o.type || "lowpass";
    flt.frequency.setValueAtTime(o.f || 1000, t); flt.Q.value = o.q || 0.8;
    if (o.f1) flt.frequency.exponentialRampToValueAtTime(Math.max(40, o.f1), t + o.dur);
    const g = adsr(a, t, o.vol || 0.2, o.atk || 0.004, o.dur);
    src.connect(flt); flt.connect(g); g.connect(out);
    v.nodes.push(src);
    src.start(t); src.stop(t + o.dur + 0.05);
  }

  /* Duck musicBus (không đụng criticalBus): db sâu, ms thời gian hồi */
  function duckMusic(db, ms) {
    if (!ctx || !G) return;
    const p = G.hurtDuck.gain, t = ctx.currentTime;
    const l = Math.pow(10, -db / 20);
    p.cancelScheduledValues(t);
    p.setValueAtTime(p.value, t);
    p.linearRampToValueAtTime(l, t + 0.03);
    p.linearRampToValueAtTime(1.0, t + 0.03 + Math.max(0.05, ms / 1000));
  }
  let lastGnaw = 0; // cooldown gnaw 120ms — 5 chewer cùng gặm không thành noise trắng

  /* ================= 2. SFX ================= */
  const sfx = {
    /* ---- legacy API (game.js/menu.js cũ) — remap sang engine mới ---- */
    shoot() {
      oneShot({ type: "shoot", cat: "shoot", bus: () => G.sfxBus,
        build(a, t, out, v) {
          blip(a, t, out, v, { f: 880 + Math.random() * 160, f1: 1500,
                               dur: 0.06, type: "square", vol: 0.045 });
          blip(a, t, out, v, { f: 1760 + Math.random() * 320, dur: 0.03,
                               type: "sine", vol: 0.02 });
          return 0.1;
        }});
    },
    hit() {
      oneShot({ type: "death", cat: "death",
        build(a, t, out, v) {
          blip(a, t, out, v, { f: 320, f1: 140, dur: 0.07, type: "triangle", vol: 0.09 });
          noiseHit(a, t, out, v, { dur: 0.02, type: "highpass", f: 4000, vol: 0.05 });
          return 0.12;
        }});
    },
    boom() {
      oneShot({ type: "death", cat: "death",
        build(a, t, out, v) {
          blip(a, t, out, v, { f: 160, f1: 50, dur: 0.22, type: "triangle", vol: 0.14 });
          noiseHit(a, t, out, v, { dur: 0.18, type: "lowpass", f: 1200, f1: 300, vol: 0.10 });
          blip(a, t + 0.1, out, v, { f: 180, f1: 520, dur: 0.18, type: "sine", vol: 0.10 });
          return 0.4;
        }});
    },
    bigboom() { sfx.explosion(1.35); },
    gem(combo) {
      // Gem streak pitch-scale: base × (1 + min(combo,20) × 0.035)
      const c = Math.min(Math.max(0, combo | 0), 20);
      const f = 990 * (1 + c * 0.035);
      oneShot({ type: "gem", cat: "gem",
        build(a, t, out, v) {
          blip(a, t, out, v, { f, f1: f * 1.5, dur: 0.08, type: "sine", vol: 0.07 });
          blip(a, t, out, v, { f: f * 2, dur: 0.06, type: "sine", vol: 0.02 });
          return 0.14;
        }});
    },
    up() {
      oneShot({ type: "pickup", cat: "pickup",
        build(a, t, out, v) {
          [523, 659, 784, 1046].forEach((f, i) =>
            blip(a, t + i * 0.07, out, v, { f, dur: 0.12, type: "triangle", vol: 0.09 }));
          return 0.45;
        }});
    },
    thud() {
      oneShot({ type: "death", cat: "death",
        build(a, t, out, v) {
          blip(a, t, out, v, { f: 120, f1: 60, dur: 0.1, type: "square", vol: 0.10 });
          return 0.16;
        }});
    },
    shrink() {
      oneShot({ type: "pickup", cat: "pickup",
        build(a, t, out, v) {
          blip(a, t, out, v, { f: 300, f1: 140, dur: 0.18, type: "sawtooth", vol: 0.06 });
          return 0.24;
        }});
    },
    wave() {
      oneShot({ type: "pickup", cat: "pickup",
        build(a, t, out, v) {
          [392, 523, 659].forEach((f, i) =>
            blip(a, t + i * 0.09, out, v, { f, dur: 0.14, type: "square", vol: 0.07 }));
          return 0.5;
        }});
    },
    boss() { sfx.boss_roar(); },
    over() {
      oneShot({ type: "death", cat: "death",
        build(a, t, out, v) {
          [330, 262, 196, 131].forEach((f, i) =>
            blip(a, t + i * 0.18, out, v, { f, dur: 0.25, type: "sawtooth", vol: 0.10 }));
          return 1.0;
        }});
    },
    hurt() {
      // CRITICAL: vol .60 + duck music 8dB/400ms — xuyên qua 20+ quái
      duckMusic(8, 400);
      oneShot({ type: "hurt", cat: "death", critical: true, bus: () => G.critBus,
        build(a, t, out, v) {
          blip(a, t, out, v, { f: 220, f1: 70, dur: 0.22, type: "sawtooth", vol: 0.60 });
          noiseHit(a, t, out, v, { dur: 0.15, type: "lowpass", f: 500, vol: 0.25 });
          return 0.35;
        }});
    },
    pickup() {
      oneShot({ type: "pickup", cat: "pickup",
        build(a, t, out, v) {
          blip(a, t, out, v, { f: 660, f1: 990, dur: 0.1, type: "triangle", vol: 0.09 });
          blip(a, t + 0.08, out, v, { f: 990, f1: 1320, dur: 0.12, type: "triangle", vol: 0.08 });
          return 0.3;
        }});
    },
    nuke() {
      // CRITICAL
      oneShot({ type: "nuke", cat: "death", critical: true, bus: () => G.critBus,
        build(a, t, out, v) {
          blip(a, t, out, v, { f: 60, f1: 400, dur: 0.9, type: "sawtooth", vol: 0.16 });
          [880, 1174, 1568].forEach((f, i) =>
            blip(a, t + 0.15 + i * 0.1, out, v, { f, dur: 0.2, type: "triangle", vol: 0.08 }));
          noiseHit(a, t, out, v, { dur: 1.1, type: "lowpass", f: 3000, f1: 200, vol: 0.30 });
          return 1.3;
        }});
    },
    click() { sfx.ui_click(); },
    crack() { sfx.gnaw(); }, // game.js (team/engineering) gọi khi chewer gặm viền

    /* ---- 6 "giọng" quái chết — phân biệt bằng tai ---- */
    death(kind) {
      switch (kind) {
        case "chaser": // boing! lò xo nảy — sine dip rồi vọt lên
          oneShot({ type: "death", cat: "death",
            build(a, t, out, v) {
              const o = oscNode(a, v, "sine", 420 * dz());
              o.frequency.setValueAtTime(420 * dz(), t);
              o.frequency.exponentialRampToValueAtTime(140, t + 0.09);
              o.frequency.exponentialRampToValueAtTime(760, t + 0.2);
              const g = adsr(a, t, 0.24, 0.005, 0.2);
              o.connect(g); g.connect(out);
              o.start(t); o.stop(t + 0.28);
              blip(a, t + 0.02, out, v, { f: 1200, f1: 2400, dur: 0.06, type: "sine", vol: 0.06 });
              return 0.28;
            }}); break;
        case "chewer": // nom-nom! nhai chóp chép vui
          oneShot({ type: "death", cat: "death",
            build(a, t, out, v) {
              [0, 0.09, 0.18].forEach((dt, i) =>
                blip(a, t + dt, out, v, { f: 500 - i * 90, f1: 220 - i * 40,
                                         dur: 0.07, type: "square", vol: 0.14 }));
              noiseHit(a, t, out, v, { dur: 0.12, type: "bandpass", f: 1800, q: 2, vol: 0.08 });
              blip(a, t + 0.26, out, v, { f: 700, f1: 1400, dur: 0.09, type: "sine", vol: 0.10 });
              return 0.38;
            }}); break;
        case "tank": sfx.explosion(1.0); break; // BÙM-boing cartoon
        case "dasher": // slide whistle vút lên — cartoon kinh điển
          oneShot({ type: "death", cat: "death",
            build(a, t, out, v) {
              const o = oscNode(a, v, "sine", 500 * dz());
              o.frequency.setValueAtTime(500 * dz(), t);
              o.frequency.exponentialRampToValueAtTime(2600, t + 0.22);
              const g = adsr(a, t, 0.26, 0.01, 0.22);
              o.connect(g); g.connect(out);
              o.start(t); o.stop(t + 0.3);
              noiseHit(a, t, out, v, { dur: 0.2, type: "highpass", f: 3000, f1: 8000, vol: 0.06 });
              return 0.3;
            }}); break;
        case "splitter": // pop-pop-POP! 3 cái tăng dần
          oneShot({ type: "death", cat: "death",
            build(a, t, out, v) {
              [620, 780, 990].forEach((f0, i) =>
                blip(a, t + i * 0.07, out, v, { f: f0, f1: f0 * 0.45,
                                               dur: 0.08, type: "sine", vol: 0.22 }));
              return 0.3;
            }}); break;
        case "mini": // pew! chíu chíu siêu cao
          oneShot({ type: "death", cat: "death",
            build(a, t, out, v) {
              blip(a, t, out, v, { f: 2400, f1: 3600, dur: 0.09, type: "sine", vol: 0.14 });
              blip(a, t + 0.05, out, v, { f: 3000, f1: 4200, dur: 0.07, type: "sine", vol: 0.10 });
              return 0.16;
            }}); break;
        default:
          oneShot({ type: "death", cat: "death",
            build(a, t, out, v) {
              blip(a, t, out, v, { f: 300, f1: 120, dur: 0.15, type: "sawtooth", vol: 0.12 });
              return 0.2;
            }});
      }
    },

    /* ---- sync points §4 (worker khác gọi cùng frame với animation) ---- */
    explosion(power) { // BÙM-boing! nổ kiểu cartoon
      const p = power || 1;
      oneShot({ type: "death", cat: "death",
        build(a, t, out, v) {
          blip(a, t, out, v, { f: 150, f1: 45, dur: 0.4 * p, type: "triangle", vol: 0.4 });
          noiseHit(a, t, out, v, { dur: 0.35 * p, type: "lowpass", f: 900, f1: 250, vol: 0.25 });
          blip(a, t + 0.12 * p, out, v, { f: 200, f1: 640, dur: 0.3, type: "sine", vol: 0.16 }); // boing tail
          blip(a, t + 0.05, out, v, { f: 1200, f1: 2400, dur: 0.08, type: "sine", vol: 0.05 }); // sparkle
          return 0.6 * p;
        }});
    },
    hitstop_thump() {
      oneShot({ type: "death", cat: "death",
        build(a, t, out, v) {
          blip(a, t, out, v, { f: 95, f1: 38, dur: 0.14, type: "sine", vol: 0.5 });
          noiseHit(a, t, out, v, { dur: 0.03, type: "highpass", f: 3000, vol: 0.10 });
          return 0.2;
        }});
    },
    combo_milestone(tier) {
      const m = 1 + (Math.max(1, tier | 0) - 1) * 0.3; // pitch tăng theo tier
      oneShot({ type: "pickup", cat: "pickup",
        build(a, t, out, v) {
          [660, 830, 990, 1320].forEach((f, i) =>
            blip(a, t + i * 0.06, out, v, { f: f * m, dur: 0.14, type: "triangle", vol: 0.12 }));
          noiseHit(a, t + 0.1, out, v, { dur: 0.3, type: "highpass", f: 6000, vol: 0.06 });
          return 0.6;
        }});
    },
    boss_roar() {
      // CRITICAL: boss spawn / boss chết — BWOOO ngớ ngẩn kiểu tuba đồ chơi, KHÔNG rùng rợn
      duckMusic(5, 500);
      oneShot({ type: "boss", cat: "death", critical: true, bus: () => G.critBus,
        build(a, t, out, v) {
          [98, 103, 92].forEach(f0 => { // G2 Ab2 F#2 — cao hơn, vui hơn
            const o = oscNode(a, v, "square", f0 * dz());
            o.frequency.setValueAtTime(f0 * dz(), t);
            o.frequency.exponentialRampToValueAtTime(70, t + 0.7);
            // wobble hài hước
            const lfo = a.createOscillator(); lfo.type = "sine"; lfo.frequency.value = 9;
            const lg = a.createGain(); lg.gain.value = 12;
            lfo.connect(lg); lg.connect(o.frequency);
            lfo.start(t); lfo.stop(t + 0.8); v.nodes.push(lfo);
            const flt = a.createBiquadFilter();
            flt.type = "lowpass"; flt.frequency.value = 900;
            const g = adsr(a, t, 0.5, 0.03, 0.7);
            o.connect(flt); flt.connect(g); g.connect(out);
            o.start(t); o.stop(t + 0.85);
          });
          blip(a, t + 0.55, out, v, { f: 300, f1: 900, dur: 0.25, type: "sine", vol: 0.12 }); // slide lên cuối
          return 1.0;
        }});
    },
    phase_shift() {
      oneShot({ type: "death", cat: "death",
        build(a, t, out, v) {
          noiseHit(a, t, out, v, { dur: 0.5, type: "bandpass", f: 300, f1: 4200, q: 1.5, vol: 0.25 });
          blip(a, t + 0.1, out, v, { f: 200, f1: 50, dur: 0.4, type: "sine", vol: 0.30 });
          return 0.6;
        }});
      sfx.hitstop_thump();
    },
    riser() {
      // 1.2s riser trước wave boss
      oneShot({ type: "pickup", cat: "pickup",
        build(a, t, out, v) {
          const src = a.createBufferSource(); src.buffer = noiseBuf(a); src.loop = true;
          const flt = a.createBiquadFilter(); flt.type = "highpass";
          flt.frequency.setValueAtTime(400, t);
          flt.frequency.exponentialRampToValueAtTime(8000, t + 1.2);
          const g = a.createGain();
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(0.25, t + 1.2);
          src.connect(flt); flt.connect(g); g.connect(out);
          v.nodes.push(src); src.start(t); src.stop(t + 1.25);
          blip(a, t, out, v, { f: 110, f1: 880, dur: 1.2, type: "sawtooth", vol: 0.10, atk: 0.3 });
          return 1.3;
        }});
    },
    downlifter() {
      // sad trombone "wah-wah-wahhhh" — buồn cười chứ không rùng rợn: gameover / boss chết
      oneShot({ type: "death", cat: "death",
        build(a, t, out, v) {
          const notes = [392, 370, 349, 311]; // G4 F#4 F4 Eb4 — đi xuống từng bậc
          notes.forEach((f0, i) => {
            const o = oscNode(a, v, "sawtooth", f0 * dz());
            o.frequency.setValueAtTime(f0 * dz(), t + i * 0.32);
            o.frequency.linearRampToValueAtTime(f0 * 0.94 * dz(), t + i * 0.32 + 0.3);
            const lfo = a.createOscillator(); lfo.type = "sine"; lfo.frequency.value = 6;
            const lg = a.createGain(); lg.gain.value = f0 * 0.03;
            lfo.connect(lg); lg.connect(o.frequency);
            lfo.start(t + i * 0.32); lfo.stop(t + i * 0.32 + 0.34); v.nodes.push(lfo);
            const g = adsr(a, t + i * 0.32, 0.34, 0.02, 0.3);
            o.connect(g); g.connect(out);
            o.start(t + i * 0.32); o.stop(t + i * 0.32 + 0.38);
          });
          return 1.7;
        }});
    },
    fanfare() {
      // Wave clear: ta-da! C major tưng bừng
      oneShot({ type: "pickup", cat: "pickup",
        build(a, t, out, v) {
          [523.3, 659.3, 784, 1046.5, 1318.5].forEach((f, i) =>
            blip(a, t + i * 0.08, out, v, { f, dur: 0.16, type: "triangle", vol: 0.11 }));
          [261.6, 329.6, 392].forEach(f =>
            blip(a, t + 0.2, out, v, { f, dur: 0.8, type: "sine", vol: 0.08, atk: 0.15 }));
          blip(a, t + 0.42, out, v, { f: 1568, dur: 0.3, type: "sine", vol: 0.08 }); // sparkle đỉnh
          return 1.1;
        }});
    },
    heartbeat() {
      // 1 "lub-dub" — worker gọi lặp ở 1.2Hz khi low-HP
      oneShot({ type: "death", cat: "death",
        build(a, t, out, v) {
          blip(a, t, out, v, { f: 58, dur: 0.11, type: "sine", vol: 0.5 });
          blip(a, t + 0.26, out, v, { f: 52, dur: 0.13, type: "sine", vol: 0.45 });
          return 0.45;
        }});
    },
    ui_click() {
      oneShot({ type: "ui", cat: "ui", bus: () => G.uiBus,
        build(a, t, out, v) {
          blip(a, t, out, v, { f: 520, f1: 700, dur: 0.05, type: "square", vol: 0.05 });
          return 0.1;
        }});
    },
    ui_hover() {
      oneShot({ type: "ui", cat: "ui", bus: () => G.uiBus,
        build(a, t, out, v) {
          blip(a, t, out, v, { f: 1250, dur: 0.035, type: "sine", vol: 0.022 });
          return 0.08;
        }});
    },
    gnaw() {
      // CRITICAL: "krak-krak-krak" 1500→700Hz vol .55 + cooldown 120ms
      // + duck music 4dB/250ms (§4)
      if (!ac() || !G) return;
      const now = ctx.currentTime;
      if (now - lastGnaw < 0.12) return;
      lastGnaw = now;
      duckMusic(4, 250);
      oneShot({ type: "gnaw", cat: "death", critical: true, bus: () => G.critBus,
        build(a, t, out, v) {
          for (let i = 0; i < 3; i++)
            blip(a, t + i * 0.07, out, v,
                 { f: 1500, f1: 700, dur: 0.045, type: "square", vol: 0.55 });
          return 0.3;
        }});
    },
  };

  /* ================= 3. Adaptive music engine ================= */
  const M2F = m => 440 * Math.pow(2, (m - 69) / 12);
  // FUN direction (2026-10-01, user feedback): C major / G Mixolydian — sáng, vui, tinh nghịch.
  // Không còn minor/Phrygian u ám. BPM nhanh: base 120+, combat/boss 148-168.
  const STATES = {
    MENU:    { bpm: 120, inten: 0, scale: "maj", pump: 0 },
    CALM:    { bpm: 128, inten: 1, scale: "maj", pump: 2 },
    COMBAT:  { bpm: 148, inten: 3, scale: "mix", pump: 4 },
    DANGER:  { bpm: 156, inten: 3, scale: "mix", pump: 5 },
    BOSS:    { bpm: 168, inten: 4, scale: "maj", pump: 6 },
    VICTORY: { bpm: 140, inten: 3, scale: "maj", pump: 3 },
  };
  // Ưu tiên: GAMEOVER > BOSS > DANGER > VICTORY > COMBAT > CALM > MENU
  const PRIO = { MENU: 0, CALM: 1, COMBAT: 2, VICTORY: 3, DANGER: 4, BOSS: 5, GAMEOVER: 6 };
  const LEGACY_TRACK = { // startMusic(mode) cũ → state mới
    menu: ["MENU", 0], game: ["CALM", 1],
    act1: ["CALM", 1], act2: ["COMBAT", 3], act3: ["COMBAT", 4],
  };
  const PROG = { // hợp âm pad theo bar (MIDI) — C major vui nhộn: I–V–vi–IV
    MENU:    [[48, 52, 55], [55, 59, 62], [57, 60, 64], [53, 57, 60]], // C G Am F
    CALM:    [[48, 52, 55], [48, 52, 55], [55, 59, 62], [53, 57, 60]], // C C G F
    COMBAT:  [[48, 52, 55], [55, 59, 62], [48, 52, 55], [53, 57, 60]], // C G C F
    DANGER:  [[48, 52, 55], [55, 59, 62], [55, 59, 62], [53, 57, 60]], // C G G F
    BOSS:    [[48, 52, 55], [48, 52, 55], [53, 57, 60], [55, 59, 62]], // C C F G — hùng tráng
    VICTORY: [[48, 52, 55], [57, 60, 64], [53, 57, 60], [55, 59, 62]], // C Am F G
  };
  const BASS_PAT = { // 16 step/bar, 0 = nghỉ (MIDI) — bass nảy tưng tưng, root C
    MENU:   [36,0,0,0, 0,0,0,0, 43,0,0,0, 0,0,41,0],
    CALM:   [36,0,36,0, 0,0,43,0, 41,0,43,0, 45,0,43,0],
    COMBAT: [36,0,36,48, 36,0,43,0, 41,0,41,53, 43,0,45,43],
    DANGER: [36,0,36,48, 36,0,43,0, 36,0,38,40, 41,0,43,45],
    BOSS:   [36,36,48,0, 36,36,43,0, 41,41,53,0, 43,45,43,41], // gallop vui
    VICTORY:[36,0,0,0, 43,0,0,0, 41,0,0,0, 43,0,45,0],
  };
  const ARP_SCALE = {
    maj: [60, 62, 64, 65, 67, 69, 71, 72, 74, 76], // C major 2 octave — sáng rực
    mix: [55, 57, 59, 60, 62, 64, 65, 67, 69],     // G Mixolydian — tinh nghịch
  };
  const ARP_PAT = [0, 1, 2, 3, 4, 5, 4, 3, 2, 3, 4, 5, 4, 3, 2, 1];

  let seq = null;
  function ensureSeq() {
    if (!seq) seq = { on: false, timer: null, step: 0, nextT: 0,
                      state: "MENU", prevState: "MENU", intensity: 0,
                      data: STATES.MENU, bpm: 120, pending: null,
                      layers: { pad: 0, bass: 0, drums: 0, arp: 0, fx: 0 } };
    return seq;
  }
  let downTimer = null, victoryTimer = null, dangerSafeStart = 0;
  let lastMusicReq = null;

  function layerTargets(inten, st) {
    return {
      pad: 1,
      bass: inten >= 1 ? 1 : 0,
      drums: inten >= 2 ? 1 : 0,
      arp: (inten >= 3 && st !== "MENU") ? 1 : 0, // MENU không arp
      fx: inten >= 4 ? 1 : 0,
    };
  }
  // Crossfade 900ms (setTargetAtTime τ=0.3)
  function applyLayerTargets(tg, when) {
    const s = ensureSeq(); s.layers = Object.assign({}, tg);
    if (!ctx || !G) return;
    const t = (when == null) ? ctx.currentTime : when;
    Object.keys(tg).forEach(k => {
      G.layers[k].gain.cancelScheduledValues(t);
      G.layers[k].gain.setTargetAtTime(tg[k] ? 1 : 0, t, 0.3);
    });
  }
  const layerOn = n => ensureSeq().layers[n] > 0.5;
  const stepDur = () => 60 / ensureSeq().bpm / 4;

  /* ---- music voice (không tính vào 24 voice SFX) ---- */
  function padChord(t, midis, barDur, dest) {
    const out = dest || G.layers.pad;
    midis.forEach(m => {
      const o = ctx.createOscillator(); o.type = "triangle";
      o.frequency.value = M2F(m) * dz();
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.055, t + 0.5); // bed trầm: -14dB dưới critical
      g.gain.setValueAtTime(0.055, t + Math.max(0.6, barDur - 0.4));
      g.gain.linearRampToValueAtTime(0.0001, t + barDur + 0.1);
      o.connect(g); g.connect(out);
      if (revOn && revSend && ensureReverb()) {
        const sn = ctx.createGain(); sn.gain.value = 0.4;
        g.connect(sn); sn.connect(revSend);
      }
      o.start(t); o.stop(t + barDur + 0.2);
    });
  }
  function bassNote(t, m, dur, type, vol) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = M2F(m);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(G.layers.bass);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function arpNote(t, m, dur, vol, state) {
    const o = ctx.createOscillator(); o.type = "triangle";
    o.frequency.value = M2F(m) * dz();
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(G.layers.arp);
    if ((state === "VICTORY" || state === "BOSS") && revOn && revSend && ensureReverb()) {
      const sn = ctx.createGain(); sn.gain.value = 0.35;
      g.connect(sn); sn.connect(revSend);
    }
    o.start(t); o.stop(t + dur + 0.05);
  }
  // Sidechain pump giả lập: kick duck musicBus (CALM 2dB → BOSS 6dB), KHÔNG đụng criticalBus
  function pump(t, db) {
    if (!G || db <= 0) return;
    const p = G.pump.gain, l = Math.pow(10, -db / 20);
    p.cancelScheduledValues(t);
    p.setValueAtTime(1, t);
    p.linearRampToValueAtTime(l, t + 0.008);
    p.linearRampToValueAtTime(1, t + 0.28);
  }
  function mKick(t, vol) {
    const o = ctx.createOscillator(); o.type = "sine";
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g); g.connect(G.layers.drums);
    o.start(t); o.stop(t + 0.2);
    pump(t, ensureSeq().data.pump);
  }
  function mSnare(t, vol) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf(ctx); src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = "bandpass";
    f.frequency.value = 1900; f.Q.value = 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    src.connect(f); f.connect(g); g.connect(G.layers.drums);
    src.start(t); src.stop(t + 0.16);
  }
  function mHat(t, vol) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf(ctx); src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = "highpass"; f.frequency.value = 8200;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    src.connect(f); f.connect(g); g.connect(G.layers.drums);
    src.start(t); src.stop(t + 0.07);
  }
  function drumsFor(st, s16, t) {
    switch (st) {
      case "CALM":
        if (s16 === 0 || s16 === 8) mKick(t, 0.30);
        if (s16 % 2 === 0) mHat(t, 0.05); break;
      case "COMBAT":
        if (s16 % 4 === 0) mKick(t, 0.34);
        if (s16 === 4 || s16 === 12) mSnare(t, 0.16);
        if (s16 % 2 === 0) mHat(t, 0.06); break;
      case "DANGER":
        if (s16 % 4 === 0 || s16 === 14) mKick(t, 0.36);
        if (s16 === 4 || s16 === 12) mSnare(t, 0.18);
        if (s16 % 2 === 0) mHat(t, 0.06); break;
      case "BOSS":
        if (s16 === 0 || s16 === 2 || s16 === 4 || s16 === 8 || s16 === 10 || s16 === 12) mKick(t, 0.38);
        if (s16 === 4 || s16 === 12) mSnare(t, 0.20);
        mHat(t, 0.05); break;
      case "VICTORY": // half-time drums
        if (s16 === 0) mKick(t, 0.32);
        if (s16 === 8) mSnare(t, 0.16);
        if (s16 % 4 === 0) mHat(t, 0.05); break;
    }
  }
  function fxSwell(t, barDur) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf(ctx); src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.Q.value = 1.4;
    f.frequency.setValueAtTime(600, t);
    f.frequency.exponentialRampToValueAtTime(3600, t + barDur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.08, t + barDur * 0.8);
    g.gain.exponentialRampToValueAtTime(0.0001, t + barDur);
    src.connect(f); f.connect(g); g.connect(G.layers.fx);
    src.start(t); src.stop(t + barDur + 0.05);
  }
  // Filter sweep 400→8000Hz/2s khi boss intro
  function bossIntroSweep(t) {
    const dur = 2.0;
    const src = ctx.createBufferSource(); src.buffer = noiseBuf(ctx); src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.Q.value = 1.2;
    f.frequency.setValueAtTime(400, t);
    f.frequency.exponentialRampToValueAtTime(8000, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(G.layers.fx);
    if (revOn && revSend && ensureReverb()) {
      const sn = ctx.createGain(); sn.gain.value = 0.5;
      g.connect(sn); sn.connect(revSend);
    }
    src.start(t); src.stop(t + dur + 0.05);
  }

  /* ---- reverb optional: convolver impulse tự tổng hợp 700ms ---- */
  let revNode = null, revSend = null, revOn = false;
  function ensureReverb() {
    if (revNode || !ctx || !G || cpuWeak) return revNode;
    const dur = 0.7, rate = ctx.sampleRate, len = Math.floor(rate * dur);
    const imp = ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const d = imp.getChannelData(c);
      for (let i = 0; i < len; i++)
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2);
    }
    revNode = ctx.createConvolver(); revNode.buffer = imp;
    const wet = ctx.createGain(); wet.gain.value = 0.45;
    revSend = ctx.createGain(); revSend.gain.value = 1;
    revSend.connect(revNode); revNode.connect(wet); wet.connect(G.musicBus);
    revOn = true;
    return revNode;
  }
  function disableReverb() {
    revOn = false;
    try { if (revSend) revSend.disconnect(); } catch (e) {}
  }

  /* ---- lookahead scheduler (timer 25ms, schedule trước 120ms) ---- */
  let cpuEma = 0, cpuWeak = false, schedCount = 0;
  function tick() {
    const t0 = performance.now();
    const s = ensureSeq();
    if (ctx && G && settings.music && s.on) {
      const ahead = ctx.currentTime + 0.12;
      let guard = 0;
      while (s.nextT < ahead && guard++ < 64) {
        scheduleStep(s.step, s.nextT);
        s.nextT += stepDur();
        s.step++;
      }
      if ((++schedCount % 40) === 0) sweepVoices();
    }
    const dt = performance.now() - t0;
    cpuEma = cpuEma * 0.92 + dt * 0.08;
    if (!cpuWeak && cpuEma > 9) { cpuWeak = true; disableReverb(); } // CPU yếu → bypass reverb
  }
  function startSeq() {
    const s = ensureSeq();
    if (!ctx || !G || !settings.music) return;
    if (s.timer) return;
    s.step = 0; s.nextT = ctx.currentTime + 0.08; s.on = true;
    s.timer = setInterval(tick, 25);
  }
  function stopSeq() {
    const s = ensureSeq();
    if (s.timer) { clearInterval(s.timer); s.timer = null; }
    s.on = false;
  }
  function scheduleStep(stp, t) {
    const s = ensureSeq(), st = s.state, D = s.data;
    const st16 = stp % 16;
    if (st16 === 0) applyPending(t); // pattern/bpm đổi CHỈ ở bar boundary
    const bar = Math.floor(stp / 16), barDur = stepDur() * 16;
    if (st16 === 0) {
      const prog = PROG[st] || PROG.CALM;
      padChord(t, prog[bar % prog.length], barDur);
    }
    const bp = BASS_PAT[st], bm = bp && bp[st16];
    if (bm && layerOn("bass"))
      bassNote(t, bm, stepDur() * 0.9,
               (st === "CALM" || st === "MENU") ? "triangle" : "sawtooth", 0.10);
    if (layerOn("drums")) drumsFor(st, st16, t);
    if (layerOn("arp")) {
      const sc = ARP_SCALE[D.scale];
      arpNote(t, sc[ARP_PAT[st16] % sc.length], stepDur() * 0.9, 0.085, st);
    }
    if (layerOn("fx") && st16 === 0 && bar % 4 === 3 && (st === "BOSS" || st === "DANGER"))
      fxSwell(t, barDur);
  }
  function applyPending(t) {
    const s = ensureSeq();
    if (!s.pending) return;
    const p = s.pending; s.pending = null;
    s.state = p.state; s.intensity = p.inten;
    s.data = STATES[p.state]; s.bpm = s.data.bpm;
    applyLayerTargets(layerTargets(p.inten, p.state), t);
    if (p.state === "BOSS") bossIntroSweep(t);
  }

  /* ---- state switching + hysteresis ---- */
  function switchState(st, inten) {
    const s = ensureSeq();
    clearTimeout(downTimer); clearTimeout(victoryTimer);
    const prev = s.state;
    s.prevState = prev;
    s.pending = { state: st, inten };
    // Lên intensity: layer mở NGAY (crossfade 900ms mượt); pattern chờ bar boundary
    if ((PRIO[st] || 0) >= (PRIO[prev] || 0)) {
      s.intensity = inten;
      applyLayerTargets(layerTargets(inten, st));
    } else {
      s.intensity = inten; // xuống: tất cả chờ bar boundary sau debounce
    }
    if (st === "VICTORY") {
      // VICTORY 3.5s rồi tự quay về state trước đó (bypass priority)
      victoryTimer = setTimeout(() => {
        const q = ensureSeq();
        const back = (q.prevState && q.prevState !== "VICTORY" && q.prevState !== "GAMEOVER")
                     ? q.prevState : "CALM";
        forceState(back);
      }, 3500);
    }
    startSeq();
  }
  function forceState(st) { // bypass mọi gate (dùng nội bộ)
    const s = ensureSeq();
    clearTimeout(downTimer); clearTimeout(victoryTimer);
    s.prevState = s.state;
    s.pending = { state: st, inten: STATES[st] ? STATES[st].inten : s.intensity };
    startSeq();
  }
  function applyIntensity(inten) {
    const s = ensureSeq();
    if (inten === s.intensity) return;
    if (inten > s.intensity) { // lên: ngay
      s.intensity = inten;
      applyLayerTargets(layerTargets(inten, s.state));
    } else { // xuống: debounce 4s
      clearTimeout(downTimer);
      downTimer = setTimeout(() => {
        ensureSeq().intensity = inten;
        applyLayerTargets(layerTargets(inten, ensureSeq().state));
      }, 4000);
    }
  }
  // API chính worker khác gọi
  function setMusicState(st, intensity, hp) {
    clearTimeout(downTimer); // request mới hủy downgrade đang debounce
    // (không clear victoryTimer ở đây: gọi lại cùng state không được phá auto-return 3.5s)
    st = String(st || "").toUpperCase();
    if (!STATES[st] && st !== "GAMEOVER") return;
    const s = ensureSeq();
    const inten = (intensity == null) ? (STATES[st] ? STATES[st].inten : 0) : intensity;
    lastMusicReq = { st, i: inten };
    if (!ac()) { pendingMusicStart = lastMusicReq; return; }
    if (!settings.music) return; // latch lại, bật nhạc sẽ apply
    const cur = s.state;
    if (st === cur) {
      applyIntensity(inten);
      if (!ensureSeq().on) { // lần đầu gọi: bật layer theo intensity + chạy scheduler
        const q = ensureSeq();
        applyLayerTargets(layerTargets(q.intensity, q.state));
        startSeq();
      }
      return;
    }
    if (st === "GAMEOVER") { enterGameOver(); return; }
    if (cur === "GAMEOVER") { switchState(st, inten); return; } // restart: unlatch ngay
    // Track HP cho DANGER gate: cần HP>40% duy trì 5s mới được hạ
    if (cur === "DANGER") {
      if (typeof hp === "number") {
        if (hp > 0.4) { if (!dangerSafeStart) dangerSafeStart = performance.now(); }
        else dangerSafeStart = 0;
      }
    } else dangerSafeStart = 0;
    const np = PRIO[st] || 0, cp = PRIO[cur] || 0;
    if (np > cp || st === "VICTORY") { switchState(st, inten); return; } // leo thang / ăn mừng: ngay
    // Xuống thang: debounce 4s chống giật quanh ngưỡng
    // Gate DANGER: chỉ áp khi worker có truyền hp. Không truyền hp = worker
    // quyết định dứt khoát (authoritative) -> cho hạ sau debounce.
    const tryDown = () => {
      const q = ensureSeq();
      if (q.state === "DANGER" && st !== "DANGER" && typeof hp === "number") {
        if (hp > 0.4) { if (!dangerSafeStart) dangerSafeStart = performance.now(); }
        else dangerSafeStart = 0;
        const ok = dangerSafeStart && (performance.now() - dangerSafeStart >= 5000);
        if (!ok) { downTimer = setTimeout(tryDown, 1000); return; } // tự đếm tiếp
      }
      switchState(st, inten);
    };
    downTimer = setTimeout(tryDown, 4000);
  }
  function enterGameOver() {
    const s = ensureSeq();
    clearTimeout(downTimer); clearTimeout(victoryTimer);
    stopSeq();
    s.state = "GAMEOVER"; s.pending = null;
    applyLayerTargets({ pad: 0, bass: 0, drums: 0, arp: 0, fx: 0 });
    if (!ctx || !G) return;
    sfx.downlifter(); // downlifter 1.5s
    padChord(ctx.currentTime + 0.1, [40, 43, 47, 54], 3.2, G.musicBus); // Em(add9)
  }

  /* ================= 4. Legacy compat + public API ================= */
  // tone(f, d, type, vol, slideTo, when, musicBus) — giữ nguyên signature
  function tone(f, d, type, v, slideTo, when, musicBus) {
    type = type || "square"; v = (v == null) ? 0.08 : v; when = when || 0;
    if (musicBus && !settings.music) return;
    if (!musicBus && !settings.sfx) return;
    oneShot({ type: "legacy", cat: "death", critical: false,
              bus: () => (musicBus ? G.musicBus : G.sfxBus), when,
              build(a, t, out, vv) {
                blip(a, t, out, vv, { f, f1: slideTo, dur: d, type, vol: v, atk: 0.012 });
                return d + 0.05;
              }});
  }
  function startMusic(m) {
    resume();
    const raw = String(m != null ? m : (lastMusicReq ? lastMusicReq.st : "MENU"));
    const up = raw.toUpperCase();
    if (STATES[up] || up === "GAMEOVER") { setMusicState(up); return; }
    const map = LEGACY_TRACK[raw.toLowerCase()] || LEGACY_TRACK.game;
    setMusicState(map[0], map[1]);
  }
  function stopMusic() {
    clearTimeout(downTimer); clearTimeout(victoryTimer);
    stopSeq();
  }
  // Toggle nhạc/SFX hiệu lực NGAY (không reload) qua bus gain
  function setSettings(s) {
    if (!s) return;
    const wasMusic = settings.music;
    Object.assign(settings, s);
    if (ctx && G) {
      const t = ctx.currentTime;
      G.musicTgl.gain.setTargetAtTime(settings.music ? settings.musicVol : 0.0001, t, 0.05);
      G.sfxTgl.gain.setTargetAtTime(settings.sfx ? settings.sfxVol : 0.0001, t, 0.03);
    }
    if (wasMusic && !settings.music) stopSeq();
    if (!wasMusic && settings.music && lastMusicReq)
      setMusicState(lastMusicReq.st, lastMusicReq.i);
  }

  return {
    setSettings, resume, tone, sfx,
    startMusic, stopMusic,
    setMusicState,
    getMusicState: () => ensureSeq().state,
    duckMusic,
    version: "2.0-wow",
  };
})();

/* Compat: menu.js gọi WKAudio.setMusic/setSfx/ensure — alias sang AudioEngine. */
window.WKAudio = {
  setMusic: (v) => AudioEngine.setSettings({ music: !!v }),
  setSfx: (v) => AudioEngine.setSettings({ sfx: !!v }),
  ensure: () => AudioEngine.resume(),
};
