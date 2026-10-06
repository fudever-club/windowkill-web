/* ---------------- điều khiển cửa sổ thật ---------------- */
const winCtrl = { tested: false, ok: true, expect: 0 };
let arena = null; // fallback đấu trường ảo khi trình duyệt chặn resize
const bounds = () => arena || { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
let wvx = 0, wvy = 0;

function shrinkWindow(dw, dh) {
  // v2.0: track sát thương cửa sổ (achievement #10)
  try { G.windowDamagePx = (G.windowDamagePx || 0) + Math.abs(dw) + Math.abs(dh); } catch (er) {}
  if (!winCtrl.ok) {
    if (!arena) arena = { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
    arena.x += dw / 2; arena.y += dh / 2; arena.w -= dw; arena.h -= dh;
    if (arena.w < MIN_W || arena.h < MIN_H) die("window");
    return;
  }
  const nw = window.outerWidth - dw, nh = window.outerHeight - dh;
  if (nw < MIN_W || nh < MIN_H) { die("window"); return; }
  if (!winCtrl.tested) {
    winCtrl.tested = true; winCtrl.expect = nw;
    setTimeout(() => {
      if (Math.abs(window.outerWidth - winCtrl.expect) > 6) {
        winCtrl.ok = false;
        arena = { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
        addFloat(window.innerWidth / 2, 130, I18N.t("error.resize_blocked"), "#ffd479");
      }
    }, 500);
  }
  try { window.moveTo(window.screenX + dw / 2, window.screenY + dh / 2); } catch (e) {}
  try { window.resizeTo(nw, nh); } catch (e) {}
}
function growWindow(dw, dh) { // vá cửa sổ sau mỗi wave
  if (!winCtrl.ok) {
    if (arena) {
      arena.x = Math.max(0, arena.x - dw / 2); arena.y = Math.max(0, arena.y - dh / 2);
      arena.w = Math.min(window.innerWidth, arena.w + dw);
      arena.h = Math.min(window.innerHeight, arena.h + dh);
      arena.x = Math.min(arena.x, window.innerWidth - arena.w);
      arena.y = Math.min(arena.y, window.innerHeight - arena.h);
    }
    return;
  }
  const nw = Math.min(START_W, window.outerWidth + dw);
  const nh = Math.min(720, window.outerHeight + dh);
  try { window.moveTo(window.screenX - (nw - window.outerWidth) / 2, window.screenY - (nh - window.outerHeight) / 2); } catch (e) {}
  try { window.resizeTo(nw, nh); } catch (e) {}
}
/* Súng Bắn Keo (thay Keo Tự Vá 2026-10-04, CEO chốt): bấm E vá ngay +60px,
 * hồi chiêu 30s. Trả về true nếu bắn thành công. */
function fireGlueGun() {
  const s = G.ship;
  if (!s || !s.glueGun || (s.glueGun.cd || 0) > 0) return false;
  const px = s.glueGun.px || 60;
  s.glueGun.cd = s.glueGun.maxCd || 30;
  growWindow(px, Math.round(px * 0.75));
  addFloat(s.x, s.y - 40, `+${px}px`, "#9df3ff");
  try { AudioEngine.sfx.slurp(); } catch (er) {}
  // chùm hạt keo bắn ra 4 hướng — dùng particle system hiện có (rẻ, có cap 600)
  const cols = ["#9df3ff", "#67e8f9", "#a5f3fc"];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2 + Math.random() * 0.25;
    const sp = 180 + Math.random() * 240;
    addPart({ x: s.x, y: s.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0,
      life: 0.5 + Math.random() * 0.4, c: cols[i % cols.length], sz: 2.5 + Math.random() * 3 });
  }
  G.glueFlash = 0.3; // viền cửa sổ flash cyan 0.3s
  return true;
}
/* "Cửa Sổ Cuối Cùng" (Last Stand, CEO chốt 2026-10-05): khi cửa sổ <30%
 * (death spiral — teo, không chỗ né, chờ thua), bật chế độ lật kèo:
 * dmg +50%, tốc bắn +20%, mỗi kill vá +8px. Hysteresis: tắt khi hồi >35%
 * (chống nhấp nháy) hoặc chết. Buff tính qua multiplier lúc dùng (không
 * mutate stat) nên không lo stale khi nhặt upgrade giữa chừng. */
/* FIX P0 2026-10-05: Last Stand bật vĩnh viễn trên mobile portrait.
 * windowIntegrity() hiệu chuẩn theo hằng số desktop START_W=980/MIN_W=250,
 * trong khi arena mobile = viewport (360px) → boot đã 15.1% < 30% → banner +
 * viền đỏ + buff thành trạng thái mặc định, hysteresis tắt không bao giờ đạt.
 * Fix: hiệu chuẩn theo kích thước arena THỰC lúc bắt đầu run (G.arenaInit,
 * chụp trong resetGame): pct = (current − MIN) / (init − MIN).
 *  - Desktop (pointer fine, resizeTo thật): giữ START_W/START_H như cũ — không đổi hành vi.
 *  - Sim/mobile: ref = viewport lúc reset → boot ở 100%, Last Stand chỉ bật
 *    khi bị gặm teo thật. Súng Bắn Keo bị clamp bởi viewport là hành vi đúng — không đụng.
 * Tín hiệu sim tại boot: winCtrl.ok==false (đã probe) HOẶC arena đã tạo HOẶC
 * pointer thô (điện thoại/tablet — resizeTo luôn bị chặn nhưng probe 500ms
 * chưa chạy kịp ở frame đầu). typeof-guard arena để test vm không vỡ. */
function simMode() {
  if (!winCtrl.ok) return true;
  try { if (typeof arena !== "undefined" && arena !== null) return true; } catch (e) {}
  try {
    return !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
  } catch (e) { return false; }
}
function windowIntegrity() {
  // BUGFIX 2026-10-05 (M22 playtest): % nguyên vẹn phải lấy chiều nguy hiểm hơn —
  // trước đây chỉ đo chiều RỘNG nên vỡ theo chiều CAO không có cảnh báo.
  const b = bounds();
  const sim = simMode();
  const w = sim ? b.w : window.outerWidth;
  const h = sim ? b.h : window.outerHeight;
  const init = (sim && typeof G !== "undefined" && G.arenaInit) || null;
  const rw = init ? init.w : START_W;
  const rh = init ? init.h : START_H;
  const wPct = clamp((w - MIN_W) / Math.max(1, rw - MIN_W), 0, 1);
  const hPct = clamp((h - MIN_H) / Math.max(1, rh - MIN_H), 0, 1);
  return Math.min(wPct, hPct);
}
function lsDmgMul() { return G.lastStand ? 1.5 : 1; }   // +50% sát thương
function lsFireMul() { return G.lastStand ? 1.2 : 1; }  // +20% tốc bắn
function setLastStand(on) {
  if (!!G.lastStand === !!on) return; // idempotent: banner/stinger chỉ 1 lần
  G.lastStand = !!on;
  if (on) {
    setBanner(I18N.t("game.laststand_banner"), I18N.t("game.laststand_sub"));
    try { AudioEngine.sfx.stinger("gameOver"); } catch (e) {} // womp-womp cảnh báo
  }
}
function lastStandTick() {
  const s = G.ship;
  if (G.phase !== "play" || !s || s.dead) { if (G.lastStand) setLastStand(false); return; }
  const pct = windowIntegrity();
  if (!G.lastStand && pct < 0.30) setLastStand(true);
  else if (G.lastStand && pct > 0.35) setLastStand(false);
}
/* Mỗi kill khi Last Stand: vá ngay +8px. Tách hàm nhỏ để dễ test. */
function lsOnKill(e) {
  if (!G.lastStand) return false;
  growWindow(8, 6);
  addFloat(e.x, e.y - 40, "+8px", "#ff6b6b");
  return true;
}
/* Nhịp tim Last Stand: lub-dub 2 nhịp/chu kỳ 0.9s — chỉ toán học,
 * không gradient mỗi frame (rẻ). */
function heartbeatPulse(nowMs) {
  const t = (((nowMs / 900) % 1) + 1) % 1;
  const lub = Math.exp(-Math.pow((t - 0.12) * 9, 2));
  const dub = Math.exp(-Math.pow((t - 0.34) * 9, 2)) * 0.65;
  return Math.min(1, lub + dub);
}
/* Item 3 — Sprint Round 2: tuning tập trung.
 * Mọi hằng số balance dưới đọc từ difficulty.config.json qua window.WK_TUNING
 * (js/tuning.js: embed fallback + fetch merge). Số dự phòng cuối = giá trị
 * đang hardcode (refactor thuần túy) nên game boot được cả khi thiếu tuning.js. */
function wkT() {
  try { return (typeof window !== "undefined" && window.WK_TUNING) || null; } catch (e) { return null; }
}
function wkSpawnCfg() {
  var t = wkT();
  if (t) { try { var s = t.spawn(); if (s) return s; } catch (e) {} }
  return { base_count: 4, per_wave: 3, interval_floor_s: 0.22, interval_base_s: 0.85, interval_decay: 0.05, concurrent_cap: 20 };
}
function wkSpawnFloor(wave) {
  var t = wkT();
  if (t) { try { return t.spawnIntervalFloor(wave); } catch (e) {} }
  return 0.22;
}
/* Item 6 — Sprint Round 2: interval spawn theo công thức band (data-driven).
 * Band late_game_15_30: max(1.1s, 3.8s × 0.93^w) — "căng nhưng công bằng",
 * tối đa ~54.5 spawn/phút, chống spam cuối game. Trong band, công thức này
 * thay thế hoàn toàn công thức cũ (kể cả DIFF.spawnMul) để designer nắm chắc
 * nhịp spawn qua data. Ngoài band: giữ nguyên công thức cũ. */
function wkSpawnInterval(wave) {
  var t = wkT(), iv = null;
  if (t && t.spawnIntervalFor) { try { iv = t.spawnIntervalFor(wave); } catch (e) {} }
  if (!(Number.isFinite(iv) && iv > 0)) {
    var TS = wkSpawnCfg();
    iv = TS.interval_base_s * DIFF.spawnMul * onboardSpawnMul() - wave * TS.interval_decay;
  }
  return Math.max(wkSpawnFloor(wave), iv);
}
/* Item 6: đọc entry spotlight của wave từ tuning.spotlights (data). */
function wkSpotlightFor(n) {
  var t = wkT();
  if (t && t.spotlightFor) { try { return t.spotlightFor(n); } catch (e) {} }
  return null;
}
function wkCapMult(wave, kind, value) {
  var t = wkT();
  if (t) { try { return t.capMult(wave, kind, value); } catch (e) {} }
  return value;
}
/* Item 4 — Sprint Round 2: setting "Độ Nhảy Cửa Sổ" (key `wjump` trong wk_settings).
 * 3 nấc — Êm / Vừa (default, CEO chốt) / Điên. Phối hợp worker Item 3: presets đọc từ
 * window.WK_TUNING.tuning.window_physics nếu có ({calm:{impulse,velocity,cooldown},...}),
 * fallback hardcode dưới khi Item 3 chưa xong.
 *  - calm:   impulse ≤15px/event,  cooldown 300ms, velocity ≤150px/s
 *  - normal: impulse ≤35px/event,  cooldown 150ms, velocity ≤400px/s
 *  - wild:   giữ nguyên hiện tại — impulse ≤300px, không cooldown, velocity ≤950px/s */
var WJUMP_PRESETS_FALLBACK = {
  calm:   { impulse: 15,  velocity: 150, cooldown: 300 },
  normal: { impulse: 35,  velocity: 400, cooldown: 150 },
  wild:   { impulse: 300, velocity: 950, cooldown: 0 }
};
function wjumpMode() {
  try {
    var st = JSON.parse(localStorage.getItem("wk_settings") || "{}");
    if (st && ["calm", "normal", "wild"].indexOf(st.wjump) >= 0) return st.wjump;
  } catch (e) {}
  return "normal"; // default = Vừa
}
var _wjumpCache = { t: -1e9, mode: "", preset: null };
function wjumpPreset() {
  var mode = wjumpMode();
  var now = (typeof performance !== "undefined" && performance.now) ? performance.now() : 0;
  if (_wjumpCache.mode === mode && now - _wjumpCache.t < 500) return _wjumpCache.preset;
  var pre = WJUMP_PRESETS_FALLBACK;
  try {
    var tw = window.WK_TUNING && window.WK_TUNING.tuning && window.WK_TUNING.tuning.window_physics;
    if (tw && tw.calm && tw.normal && tw.wild) pre = tw; // worker Item 3 đã migrate
  } catch (e) {}
  var p = pre[mode] || pre.normal;
  _wjumpCache = { t: now, mode: mode, preset: p };
  return p;
}
var _lastPushT = -1e9;
function pushWindow(dx, dy) {
  if (!winCtrl.ok) return;
  var P = wjumpPreset();
  var now = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
  if (P.cooldown > 0 && now - _lastPushT < P.cooldown) return; // cooldown: bỏ qua kick dồn dập
  _lastPushT = now;
  var im = hypot(dx, dy);
  if (im > P.impulse) { dx *= P.impulse / im; dy *= P.impulse / im; } // clamp impulse mỗi event
  wvx += dx; wvy += dy;
  const sp = hypot(wvx, wvy);
  if (sp > P.velocity) { wvx *= P.velocity / sp; wvy *= P.velocity / sp; } // clamp velocity
}
function applyWindowMotion(dt) {
  if (hypot(wvx, wvy) > 2 && winCtrl.ok) {
    var P = wjumpPreset();
    var vsp = hypot(wvx, wvy);
    if (vsp > P.velocity) { wvx *= P.velocity / vsp; wvy *= P.velocity / vsp; } // clamp velocity
    try { window.moveBy(wvx * dt, wvy * dt); } catch (e) {}
    try {
      const aw = window.screen.availWidth || 1920, ah = window.screen.availHeight || 1080;
      const x = window.screenX, y = window.screenY, w = window.outerWidth, h = window.outerHeight;
      const nx = clamp(x, -w + 80, aw - 80), ny = clamp(y, 0, ah - 80);
      if (Math.abs(nx - x) > 1 || Math.abs(ny - y) > 1) window.moveTo(nx, ny);
    } catch (e) {}
  }
  const d = Math.exp(-3.2 * dt); wvx *= d; wvy *= d;
}
function windowJitter(power) {
  if (!winCtrl.ok || !SHAKE_WINDOW) return;
  try { window.moveBy((Math.random() - .5) * power, (Math.random() - .5) * power); } catch (e) {}
}

// WOW: camera shake qua Juice theo bảng tier §1 juice.js (hit 2/120/p1 · chết 3/160/p2 ·
// nổ lớn 6/300/p4 · player hurt 8/350/p8 · boss chết 12/700/p10 · chewer cắn 2/150/p3).
// G.shake vẫn được set để render fallback khi không có Juice.
function jxShake(amp, ms, prio) {
  G.shake = amp;
  if (window.Juice) { try { Juice.addShake(amp, ms, prio); } catch (e) {} }
}

// WOW: drawFn cho Juice.drawGhosts — wrapper đã translate/rotate/scale + alpha,
// chỉ cần vẽ thân tàu tại (g.x, g.y)
function drawShipGhost(c, g) {
  c.fillStyle = "#7dd3fc";
  c.beginPath();
  c.moveTo(g.x + 16, g.y); c.lineTo(g.x - 11, g.y - 11); c.lineTo(g.x - 6, g.y); c.lineTo(g.x - 11, g.y + 11);
  c.closePath(); c.fill();
}

