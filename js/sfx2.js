/* =====================================================================
   WINDOWKILL: Web Edition — js/sfx2.js
   8 SFX MỚI (§11.8) bằng Web Audio synth — KHÔNG sửa js/audio.js.

   YÊU CẦU ÂM THANH (direction của user): VUI NHỘN, NHỊP NHANH, TUYỆT ĐỐI
   KHÔNG rùng rợn/u ám → thang TRƯỞNG (C/G major, pentatonic), pitch cao,
   decay nhanh, phong cách cartoon (slide-whistle, boing, bling, tink).

   - IIFE, "use strict", vanilla JS, không dependency.
   - AudioContext riêng, lazy-init khi resume() (gọi sau gesture của user).
   - setEnabled(v): tôn trọng toggle SFX của game (integrator nối menu).
   - Mọi hàm đều try/catch + no-op khi tắt/không có AudioContext.

   API: window.Sfx2 = {
     resume(), setEnabled(v), isEnabled(),
     multikill(n), levelup(), shieldHit(), shieldUp(), phaseBreak(),
     slamWarn(), windowCrack(), windowShatter(), slowmo(), yeet()
   }
   ===================================================================== */
(function () {
"use strict";

var _ctx = null, _master = null, _noiseBuf = null;
var _enabled = true;

function ac() {
  if (_ctx) return _ctx;
  try {
    var AC = (typeof window !== "undefined") &&
      (window.AudioContext || window.webkitAudioContext);
    if (!AC) return null;
    _ctx = new AC();
    _master = _ctx.createGain();
    _master.gain.value = 0.85;
    var comp = _ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 6;
    _master.connect(comp); comp.connect(_ctx.destination);
  } catch (e) { _ctx = null; }
  return _ctx;
}
function resume() {
  var a = ac(); if (!a) return false;
  try { if (a.state === "suspended") a.resume(); } catch (e) {}
  return true;
}
function setEnabled(v) { _enabled = !!v; }
function isEnabled() { return _enabled; }
function noiseBuf(a) {
  if (!_noiseBuf) {
    var len = Math.floor(a.sampleRate * 1.5);
    _noiseBuf = a.createBuffer(1, len, a.sampleRate);
    var d = _noiseBuf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  return _noiseBuf;
}
function dz() { return 1 + (Math.random() * 0.06 - 0.03); } // detune ±3%

/* blip: osc có slide pitch + envelope nhanh. o = {f, f1, dur, type, vol, atk, when} */
function blip(a, t, o) {
  var osc = a.createOscillator();
  osc.type = o.type || "triangle";
  var f0 = (o.f || 440) * dz();
  osc.frequency.setValueAtTime(f0, t);
  if (o.f1) osc.frequency.exponentialRampToValueAtTime(Math.max(30, o.f1), t + o.dur);
  var g = a.createGain();
  var atk = o.atk || 0.005, peak = o.vol || 0.18;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + atk);
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  osc.connect(g); g.connect(_master);
  osc.start(t); osc.stop(t + o.dur + 0.05);
}
/* noiseHit: noise qua filter sweep + envelope nhanh. o = {dur, type, f, f1, q, vol} */
function noiseHit(a, t, o) {
  var src = a.createBufferSource(); src.buffer = noiseBuf(a); src.loop = true;
  var flt = a.createBiquadFilter();
  flt.type = o.type || "highpass";
  flt.frequency.setValueAtTime(o.f || 2000, t); flt.Q.value = o.q || 0.7;
  if (o.f1) flt.frequency.exponentialRampToValueAtTime(Math.max(40, o.f1), t + o.dur);
  var g = a.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(o.vol || 0.15, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  src.connect(flt); flt.connect(g); g.connect(_master);
  src.start(t); src.stop(t + o.dur + 0.05);
}
/* guard chung: trả về currentTime hoặc -1 nếu không phát được */
function ready() {
  if (!_enabled) return -1;
  var a = ac(); if (!a || !_master) return -1;
  try { if (a.state === "suspended") a.resume(); } catch (e) {}
  return a.currentTime;
}

/* C major pentatonic cao — nguyên liệu cho mọi sfx vui nhộn */
var PENTA = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.7, 1318.5];

var Sfx2 = {
  resume: resume, setEnabled: setEnabled, isEnabled: isEnabled,

  /** multikill(n): arpeggio trưởng leo theo n — càng nhiều kill càng lên cao. */
  multikill: function (n) {
    var t = ready(); if (t < 0) return;
    var a = _ctx, steps = Math.min(Math.max(2, n | 0), 6);
    for (var i = 0; i < steps; i++) {
      blip(a, t + i * 0.07, { f: PENTA[i % PENTA.length], dur: 0.11,
        type: "triangle", vol: 0.20 });
      blip(a, t + i * 0.07, { f: PENTA[i % PENTA.length] * 2, dur: 0.07,
        type: "sine", vol: 0.06 });
    }
  },

  /** levelup(): riser vui (saw 300→1200) + shimmer 3 nốt cao lấp lánh. */
  levelup: function () {
    var t = ready(); if (t < 0) return;
    var a = _ctx;
    blip(a, t, { f: 300, f1: 1200, dur: 0.35, type: "sawtooth", vol: 0.10 });
    [1568, 2093, 2637].forEach(function (f, i) {
      blip(a, t + 0.28 + i * 0.09, { f: f, dur: 0.16, type: "sine", vol: 0.12 });
    });
    blip(a, t + 0.28, { f: 1046.5, dur: 0.3, type: "triangle", vol: 0.14 });
  },

  /** shieldHit(): "keng" kim loại — quãng 5 trưởng cao, decay cực nhanh. */
  shieldHit: function () {
    var t = ready(); if (t < 0) return;
    var a = _ctx;
    blip(a, t, { f: 880, dur: 0.12, type: "square", vol: 0.10 });
    blip(a, t, { f: 1318.5, dur: 0.10, type: "triangle", vol: 0.12 });
    noiseHit(a, t, { dur: 0.05, type: "highpass", f: 4000, vol: 0.06 });
  },

  /** shieldUp(): "bling" 2 nốt trưởng đi lên (E5→G5). */
  shieldUp: function () {
    var t = ready(); if (t < 0) return;
    var a = _ctx;
    blip(a, t, { f: 659.25, dur: 0.10, type: "triangle", vol: 0.16 });
    blip(a, t + 0.09, { f: 783.99, dur: 0.18, type: "triangle", vol: 0.18 });
    blip(a, t + 0.09, { f: 1568, dur: 0.12, type: "sine", vol: 0.06 });
  },

  /** phaseBreak(): vỡ giáp kiểu cartoon — tink thủy tinh + triad trưởng rơi vui. */
  phaseBreak: function () {
    var t = ready(); if (t < 0) return;
    var a = _ctx;
    noiseHit(a, t, { dur: 0.16, type: "highpass", f: 2500, f1: 6000, vol: 0.14 });
    [1046.5, 880, 783.99, 659.25].forEach(function (f, i) {
      blip(a, t + 0.05 + i * 0.06, { f: f, dur: 0.12, type: "triangle", vol: 0.14 });
    });
    blip(a, t + 0.3, { f: 1318.5, dur: 0.2, type: "sine", vol: 0.10 });
  },

  /** slamWarn(): còi báo động cartoon — slide-whistle lên/xuống 2 lần, vui. */
  slamWarn: function () {
    var t = ready(); if (t < 0) return;
    var a = _ctx;
    for (var i = 0; i < 2; i++) {
      blip(a, t + i * 0.28, { f: 600, f1: 1200, dur: 0.13, type: "sine", vol: 0.16 });
      blip(a, t + i * 0.28 + 0.14, { f: 1200, f1: 600, dur: 0.13, type: "sine", vol: 0.16 });
    }
  },

  /** windowCrack(): kính nứt — noise cao + 4 tink pentatonic ngẫu nhiên. */
  windowCrack: function () {
    var t = ready(); if (t < 0) return;
    var a = _ctx;
    noiseHit(a, t, { dur: 0.08, type: "highpass", f: 3500, vol: 0.12 });
    for (var i = 0; i < 4; i++) {
      var f = PENTA[4 + Math.floor(Math.random() * 4)];
      blip(a, t + 0.03 + i * 0.05 + Math.random() * 0.02,
        { f: f, dur: 0.09, type: "sine", vol: 0.10 });
    }
  },

  /** windowShatter(): vỡ kính lớn — cascade tink rơi + noise, vẫn giữ pitch cao. */
  windowShatter: function () {
    var t = ready(); if (t < 0) return;
    var a = _ctx;
    noiseHit(a, t, { dur: 0.35, type: "highpass", f: 2000, f1: 7000, vol: 0.16 });
    for (var i = 0; i < 10; i++) {
      var f = PENTA[Math.floor(Math.random() * PENTA.length)] * 2;
      blip(a, t + 0.05 + i * 0.055, { f: f, dur: 0.10, type: "sine", vol: 0.09 });
    }
    blip(a, t + 0.6, { f: 1046.5, dur: 0.25, type: "triangle", vol: 0.12 });
  },

  /** slowmo(): whoosh bóp méo thời gian — noise sweep xuống/rồi lên, nghịch. */
  slowmo: function () {
    var t = ready(); if (t < 0) return;
    var a = _ctx;
    noiseHit(a, t, { dur: 0.55, type: "bandpass", f: 3000, f1: 300, q: 1.2, vol: 0.14 });
    blip(a, t + 0.1, { f: 900, f1: 300, dur: 0.4, type: "sine", vol: 0.08 });
    blip(a, t + 0.45, { f: 300, f1: 900, dur: 0.2, type: "sine", vol: 0.08 });
  },

  /** yeet(): "vút" (slide lên) + "bịch" (boing nảy) — hất văng chewer. */
  yeet: function () {
    var t = ready(); if (t < 0) return;
    var a = _ctx;
    blip(a, t, { f: 400, f1: 1600, dur: 0.18, type: "sine", vol: 0.16 }); // vút
    blip(a, t + 0.18, { f: 300, f1: 90, dur: 0.14, type: "triangle", vol: 0.18 }); // bịch
    blip(a, t + 0.20, { f: 180, f1: 320, dur: 0.12, type: "sine", vol: 0.10 }); // boing nảy
  }
};

if (typeof window !== "undefined") window.Sfx2 = Sfx2;
if (typeof module !== "undefined" && module.exports) module.exports = Sfx2;
})();
