/* ---------------- state ---------------- */
const G = {
  phase: "boot", wave: 0, act: 0, score: 0, kills: 0, time: 0,
  ship: null, bullets: [], ebullets: [], enemies: [], gems: [], pickups: [], parts: [], floats: [],
  boss: null, spawnQueue: [], spawnT: 0, waveBreak: 0, waveClearShown: false,
  banner: "", bannerT: 0, bannerSub: "",
  _desktopToastShown: false, // CTA web→desktop: toast wave 10 hiện 1 lần/run
  xp: 0, level: 1, xpNeed: 6, shake: 0, combo: 0, comboT: 0, slowmo: 1,
  dying: [], pendingSpawns: 0, waveKills: 0, bossCine: false, // WOW sprint
  cracks: [], // vết nứt viền arena (M4 mô phỏng)
     globalHaste: 1, hasteT: 0, // SEASON 1: chuông Deadline Dí — buff tốc toàn sân
     slowZones: [], // SEASON 1: vùng họp Kẻ Họp Hành — phần tử {x, y, r, slow, ttl, from}
};
let lastT = performance.now();
let musicT = 0; // WOW: music/bg-state tick 500ms
let bossSpawnTok = 0; // WOW: huỷ boss intro cũ nếu restart giữa chừng

function newShip() {
  // v2.0: Xưởng nâng cấp (Meta.getRunModifiers) áp vào tàu đầu run
  var mods = null;
  if (window.V2) { try { mods = V2.runMods; } catch (er) {} }
  mods = mods || {};
  return {
    x: window.innerWidth / 2, y: window.innerHeight / 2, r: 13,
    hp: DIFF.shipHp + (mods.maxHpBonus | 0), maxHp: DIFF.shipHp + (mods.maxHpBonus | 0),
    speed: 275 * (mods.speedMul || 1), fireInt: 0.21 / (mods.fireRateMul || 1), fireT: 0, streams: 1,
    dmg: 1 + (mods.dmgBonus || 0), pierce: 0,
    magnet: 125 * (mods.magnetMul || 1), thorns: mods.thornsDmg || 0, bulletSpd: 560, slow: 0, dropMul: mods.pickupMul || 1, // Phụ lục A: node 7 Giáp gai + node 8 Mồi thơm
    kbvx: 0, kbvy: 0,
    iframes: 0, ang: 0, shieldT: 0, regenT: 0, magnetT: 0, overdriveT: 0,
  };
}
function addFloat(x, y, text, color = "#fff", big = false) {
  G.floats.push({ x, y, text, color, t: 0, life: 1.25, big });
}
// PERF #1 quick-win: cap tổng hạt sống — wave 30 từng ~770 hạt / ~800 fillRect/frame.
// Mọi điểm spawn hạt đi qua addPart(); vượt cap thì bỏ hạt mới (không đổi gameplay).
var MAX_PARTICLES = 600;
function addPart(p) { if (G.parts.length < MAX_PARTICLES) G.parts.push(p); }
function burst(x, y, n, colors, spd = 260) {
  // MOBILE-QUALITY: scale số hạt theo nấc (lite = 30%, balanced = 60%).
  try {
    var mul = (window.WKQuality && window.WKQuality.particleMul) || 1;
    n = Math.max(1, Math.round(n * mul));
  } catch (e) {}
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = (0.3 + Math.random() * 0.7) * spd;
    addPart({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0,
      life: 0.4 + Math.random() * 0.5, c: colors[i % colors.length], sz: 2 + Math.random() * 3.5 });
  }
}

