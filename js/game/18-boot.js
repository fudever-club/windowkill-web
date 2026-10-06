/* ---------------- loop & boot ---------------- */
// OPT: FPS monitor + adaptive quality tiers — hạ nấc khi máy yếu (js/quality.js).
// Logic ngưỡng nằm trong WKQuality.onFpsSample: chỉ hạ khi < 35fps 2s liên tiếp
// (hoặc < 22fps hạ ngay), chỉ tăng khi > 55fps 5s mà KHÔNG combat.
let _fpsAcc = 0, _fpsN = 0, _fpsWin = 0, _lastFps = 60;
function perfTick(rawDt) {
  _fpsAcc += rawDt; _fpsN++; _fpsWin += rawDt;
  if (_fpsWin >= 1) {
    _lastFps = _fpsN / Math.max(_fpsAcc, 1e-6);
    _fpsAcc = 0; _fpsN = 0; _fpsWin = 0;
    try { if (window.WKQuality) window.WKQuality.onFpsSample(_lastFps, G.phase === "play"); } catch (e) {}
  }
}
if (typeof window !== "undefined") window.WKPerf = { get fps() { return _lastFps; }, get reduced() { try { return !!(window.WKQuality && window.WKQuality.tier !== "high"); } catch (e) { return false; } } };

function loop(now) {
  const rawDt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
  // WOW: Juice timescale (hit-stop / slow-mo) điều khiển dt gameplay
  let dt = rawDt;
  if (window.Juice) { try { dt = Juice.update(rawDt); } catch (e) { dt = rawDt; } }
  // v2.0: Juice2 hit-stop (đứng hình theo kill/elite/boss)
  if (window.V2) { try { dt = V2.hitstop(rawDt, dt); } catch (e) {} }
  // WOW: cinematic (boss intro/death) hoặc draft mở → pause gameplay
  let cineLocked = false;
  if (window.Cinema) { try { cineLocked = !!Cinema.locked; } catch (e) {} }
  if (window.Juice && Juice.draftOpen) cineLocked = true;
  if (G.phase === "play" && !cineLocked) update(dt);
  // v2.0: Tutorial / Bosses module / StageFX
  if (window.V2) { try { V2.frame(dt); } catch (e) {} }
  // WAVE 0 onboarding (19-onboard.js): scripted ~56s cho người mới, giữ wave 0
  if (window.Onboard) { try { Onboard.tick(dt); } catch (e) {} }
  // WOW: FX clock — warning/materialize/death-anim/particles chạy kể cả khi pause
  if (window.Juice) { try { Juice.updateFx(rawDt); } catch (e) {} }
  // WOW: Cinema clock — banner/combo/boss cine/heartbeat/trail (tự đọc info.player)
  if (window.Cinema) { try { Cinema.update(rawDt, cineInfo()); } catch (e) {} }
  // WOW: dọn entity khi death-anim chạy xong
  if (G.dying && G.dying.length) { try { // OPT: compaction in-place, không alloc array/closure
      let _dw = 0;
      for (let _di = 0; _di < G.dying.length; _di++) { if (G.dying[_di].jfDeath) G.dying[_dw++] = G.dying[_di]; }
      G.dying.length = _dw;
    } catch (e) {} }
  // WOW: music state + background state mỗi 500ms
  musicT += rawDt;
  if (musicT >= 0.5) { musicT = 0; wowMusicTick(); }
  perfTick(rawDt); // OPT: adaptive quality
  render(now);
  // QA overlay (?qa=1) — vẽ sau render, không chạm gameplay
  if (window.QAOverlay) { try { QAOverlay.frame(rawDt); } catch (e) {} }
  requestAnimationFrame(loop);
}

// WOW: info cho Cinema.update/drawFront — heartbeat + trail tự chạy bên trong
const _cineInfo = { W: 0, H: 0, player: { x: 0, y: 0, vx: 0, vy: 0, speed: 0, rot: 0, r: 13, hp: 0, maxHp: 0, shieldT: 0 } };
function cineInfo() { // OPT: tái dùng object, không alloc mỗi frame
  const s = G.ship, p = _cineInfo.player;
  _cineInfo.W = window.innerWidth; _cineInfo.H = window.innerHeight;
  if (s) {
    p.x = s.x; p.y = s.y; p.speed = s.moveSpeed || 0; p.rot = s.ang || 0;
    p.hp = s.hp; p.maxHp = s.maxHp; p.shieldT = s.shieldT || 0;
    _cineInfo.player = p;
  } else _cineInfo.player = null;
  return _cineInfo;
}

// WOW: đồng bộ music state + background state (danger/lowhp/boss/breather)
function wowMusicTick() {
  const s = G.ship; if (!s) return;
  const b = bounds();
  const winPct = windowIntegrity();
  try {
    if (window.Cinema) {
      let st = "normal";
      if (G.boss && !G.boss.dead) st = "boss";
      else if (winPct < 0.3) st = "danger";
      else if (s.hp === 1 || s.hp / s.maxHp < 0.3) st = "lowhp";
      else if (G.waveClearShown && !G.enemies.length && !G.spawnQueue.length) st = "breather";
      try { Cinema.bgState(st); } catch (e) {}
    }
  } catch (e) {}
  try {
    if (!window.AudioEngine || typeof AudioEngine.setMusicState !== "function") return;
    if (G.phase !== "play") return;
    const hp01 = clamp(s.hp / s.maxHp, 0, 1);
    if (G.boss && !G.boss.dead) AudioEngine.setMusicState("BOSS");
    else if (winPct < 0.3 || s.hp === 1) AudioEngine.setMusicState("DANGER", undefined, hp01);
    else if (G.enemies.length >= 12) AudioEngine.setMusicState("COMBAT");
    else if (G.enemies.length < 6) AudioEngine.setMusicState("CALM");
    // 6–11 quái: giữ nguyên state hiện tại (tránh giật)
  } catch (e) {}
}
/* v2.0 bridge: expose controlled globals cho module mới (tutorial/campaign/meta/juice2).
   Tutorial poll G/bounds/openDraft/...; Bosses hooks đi qua window.WK* helpers. */
window.G = G; window.DIFF = DIFF; window.bounds = bounds;
window.openDraft = openDraft; window.gainXp = gainXp; window.addFloat = addFloat;
window.WKSpawnEnemy = function (type, x, y) { return spawnEnemyAt(type, x, y); };
window.WKSpawnPickup = function (kind, x, y) { G.pickups.push({ kind: kind, x: x, y: y, t: 0 }); };
// AUDIT 2026-10-02: trước đây WKSpawnGems chỉ đẩy {x, y, v} — thiếu vx/vy/t nên vòng
// gems biến tọa độ thành NaN ngay frame đầu (gem vô hình, không nhặt được, không xóa được).
window.WKSpawnGems = function (n, x, y) { for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2; G.gems.push({ x: x + rand(-40, 40), y: y + rand(-40, 40), vx: Math.cos(a) * 120, vy: Math.sin(a) * 120, v: 1, t: 0 }); } };
// AUDIT 2026-10-02: bosses.js/monsters.js tra cứu các hàm này qua window (doShrink/
// doGrow/doMoveBy/winJitter + callFn) nhưng game.js chưa từng expose → đòn signature
// của boss campaign (slam thu cửa sổ, boss 5 shrink định kỳ, đẩy cửa sổ) lặng lẽ
// thành no-op. Expose đúng contract mà 2 module đó tài liệu hoá.
window.shrinkWindow = shrinkWindow; window.growWindow = growWindow;
window.pushWindow = pushWindow; window.windowJitter = windowJitter;
window.wjumpPreset = wjumpPreset; // Item 4: pause UI + test đọc preset đang áp dụng
window.hurtShip = hurtShip; window.burst = burst; window.jxShake = jxShake;
window.spawnEnemyAt = spawnEnemyAt;
window.WKFireEB = function (x, y, vx, vy, o) { G.ebullets.push(Object.assign({ x: x, y: y, vx: vx, vy: vy, r: 7, t: 0 }, o || {})); };
window.WKHurtShip = function (dmg, x, y) { hurtShip(dmg, x, y); };
window.WKSetBanner = function (t, s) { setBanner(t, s); };
window.WKDie = function (reason) { die(reason); };
// AUDIT 2026-10-02: % cửa sổ còn lại theo đúng công thức engine dùng (popup thật
// theo outerWidth, arena ảo theo bounds) — v2glue cần cho thành tựu hạ boss.
window.WKWinPct = function () {
  try { return windowIntegrity(); } catch (e) { return 1; }
};
window.WKDrawBossBar = function (d) {
  // thanh boss 3 nấc (§5.4): viền sáng + 3 khấc phase + tên
  const W = window.innerWidth, bbw = Math.min(560, W - 120); // MOBILE 2026-10-03: CSS px
  ctx.fillStyle = "#000000aa"; ctx.fillRect((W - bbw) / 2, 12, bbw, 14);
  const f = clamp((d.hp || 0) / (d.maxHp || 1), 0, 1);
  ctx.fillStyle = d.color || "#c084fc"; ctx.fillRect((W - bbw) / 2, 12, bbw * f, 14);
  ctx.fillStyle = "#00000088";
  for (let i = 1; i < 3; i++) ctx.fillRect((W - bbw) / 2 + bbw * i / 3 - 1, 12, 2, 14);
  ctx.fillStyle = "#fff"; ctx.font = "bold 12px sans-serif"; ctx.textAlign = "center";
  // AUDIT 2026-10-02: tên boss theo ngôn ngữ (barData cung cấp nameEn + isEn).
  ctx.fillText(((d.isEn && d.nameEn) ? d.nameEn : (d.nameVi || d.name || "BOSS")) + (d.phase ? " — P" + d.phase : ""), W / 2, 24);
  ctx.textAlign = "left";
  if (d.countdown > 0) { ctx.fillStyle = "#ffd479"; ctx.font = "bold 13px sans-serif"; ctx.fillText(Math.ceil(d.countdown) + "s", W / 2 + bbw / 2 + 10, 24); ctx.textAlign = "left"; }
};
// v2.0: cầu nối V2 (js/v2glue.js) — boot campaign/tutorial/meta/daily
// AUDIT 2026-10-02: boot PHẢI chạy sau resetGame() (đúng như tài liệu của v2glue) —
// trước đây boot chạy trước, resetGame gán banner:"" ngay sau đó nên banner Daily
// (và mọi banner boot set) bị xóa trong cùng tick, không bao giờ hiển thị.
// F-02: preboot gán runMods TRƯỚC resetGame() đầu tiên → run đầu mỗi lần tải trang cũng hưởng Xưởng
if (window.V2) { try { V2.preboot(); } catch (e) {} }
resetGame();
if (window.V2) { try { V2.boot({ profileId: PROFILE_ID, diffKey: DIFF_KEY }); } catch (e) {} }
// WAVE 0 onboarding: người mới (chưa có flag wk_onboard_v1) → chạy wave 0
// scripted thay vì vào wave 1 ngay; ?onboard=1 ép chạy, ?onboard=0 tắt.
if (window.Onboard) { try { Onboard.maybeStart(); } catch (e) {} }
// Phụ lục A node 9 — Trợ lý kỹ thuật: mở 1 draft ngay đầu run cho người đã mua
if (window.V2 && V2.runMods && V2.runMods.freeUpgrade && G.phase === "play") {
  try { openDraft(); } catch (e) {}
}
if (bus) bus.postMessage({ type: "arena-open" });
requestAnimationFrame(loop);
