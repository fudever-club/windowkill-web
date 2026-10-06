/* ---------------- pause / chết / reset ---------------- */
function pauseGame(on) {
  if (on && G.phase === "play") { G.phase = "paused"; $("ov-pause").classList.add("show"); paintPauseWjump(); paintPauseQuality(); paintPauseMobileAssist(); }
  else if (!on && G.phase === "paused") {
    G.phase = "play"; $("ov-pause").classList.remove("show"); lastT = performance.now();
  }
}
window.pauseGame = pauseGame; // H3: radial mobile gọi

/* Item 4 — Sprint Round 2: đổi "Độ Nhảy Cửa Sổ" giữa run từ pause menu (game.html#ov-pause). */
function paintPauseWjump() {
  var mode = (typeof wjumpMode === "function") ? wjumpMode() : "normal";
  document.querySelectorAll("[data-wjump]").forEach(function (b) {
    var sel = b.dataset.wjump === mode;
    b.classList.toggle("sel", sel);
    b.setAttribute("aria-pressed", sel ? "true" : "false");
  });
}
document.querySelectorAll("[data-wjump]").forEach(function (b) {
  b.onclick = function () {
    try {
      var st = JSON.parse(localStorage.getItem("wk_settings") || "{}");
      st.wjump = b.dataset.wjump;
      localStorage.setItem("wk_settings", JSON.stringify(st));
    } catch (e) {}
    if (typeof AudioEngine !== "undefined" && AudioEngine.sfx) { try { AudioEngine.sfx.click(); } catch (e) {} }
    paintPauseWjump();
  };
});
/* ---------- feat/mobile-quality: đổi nấc chất lượng giữa run (pause menu) ----------
   Pattern data-wjump: nút [data-quality], lưu wk_settings.quality, áp ngay qua
   WKQuality.setManual (khóa tay khi chọn nấc cụ thể, auto khi chọn Tự động). */
function paintPauseQuality() {
  var q = "auto";
  try {
    if (window.WKQuality) q = window.WKQuality.mode === "manual" ? window.WKQuality.tier : "auto";
  } catch (e) {}
  document.querySelectorAll("[data-quality]").forEach(function (b) {
    var sel = b.dataset.quality === q;
    b.classList.toggle("sel", sel);
    b.setAttribute("aria-pressed", sel ? "true" : "false");
  });
}
document.querySelectorAll("[data-quality]").forEach(function (b) {
  b.onclick = function () {
    try { if (window.WKQuality) window.WKQuality.setManual(b.dataset.quality); } catch (e) {}
    if (typeof AudioEngine !== "undefined" && AudioEngine.sfx) { try { AudioEngine.sfx.click(); } catch (e) {} }
    paintPauseQuality();
  };
});
/* Mobile Assist (2026-10-05, CEO chốt): toggle trong pause menu (game.html#ov-pause).
   Đọc/ghi wk_settings.mobileAssist (mặc định BẬT). Áp dụng từ wave tiếp theo
   vì Campaign.diffOf() đọc setting mỗi lần compose wave. */
function mobileAssistOn() {
  try {
    var st = JSON.parse(localStorage.getItem("wk_settings") || "{}");
    return !st || st.mobileAssist !== false;
  } catch (e) { return true; }
}
function paintPauseMobileAssist() {
  var on = mobileAssistOn();
  var b = $("btn-pause-mobile-assist");
  if (b) {
    b.classList.toggle("sel", on);
    b.setAttribute("aria-pressed", on ? "true" : "false");
  }
}
(function wirePauseMobileAssist() {
  var b = $("btn-pause-mobile-assist");
  if (!b || b.__wkWired) return;
  b.__wkWired = true;
  b.onclick = function () {
    try {
      var st = JSON.parse(localStorage.getItem("wk_settings") || "{}");
      st.mobileAssist = !mobileAssistOn();
      localStorage.setItem("wk_settings", JSON.stringify(st));
    } catch (e) {}
    if (typeof AudioEngine !== "undefined" && AudioEngine.sfx) { try { AudioEngine.sfx.click(); } catch (e) {} }
    paintPauseMobileAssist();
  };
})();
function hurtShip(dmg, srcx, srcy) {
  const s = G.ship;
  if (G.phase !== "play") return;
  // WOW: khiên chặn đòn → shield block FX (flash + tia lửa + rung nhẹ + âm thanh)
  if (s.shieldT > 0) {
    if (window.Cinema) { try { Cinema.shieldBlock(s.x, s.y); } catch (e) {} }
    return;
  }
  if (s.iframes > 0) return;
  s.hp -= dmg; s.iframes = 0.9;
  AudioEngine.sfx.hurt(); windowJitter(22); jxShake(8, 350, 8); // WOW tier: player hurt
  burst(s.x, s.y, 16, ["#ff5470", "#fff"], 260);
  // WOW: damage number đỏ thay float -dmg cũ
  if (window.Juice) { try { Juice.damageNumber(s.x, s.y - 20, dmg, "playerHurt", null); } catch (e) {} }
  else addFloat(s.x, s.y - 26, `-${dmg} ❤️`, "#ff8f8f", true);
  if (s.hp <= 0) {
    // Phụ lục A node 10 — Túi cứu sinh: 1 lần/run, hồi 1 HP + 2s bất tử thay vì chết
    let slMods = null;
    try { slMods = G.runMods || (window.V2 ? V2.runMods : null); } catch (e) {}
    if (slMods && slMods.secondLife && !s._secondLifeUsed) {
      s._secondLifeUsed = true; s.hp = 1; s.iframes = 2;
      addFloat(s.x, s.y - 40, "Túi cứu sinh!", "#9df3ff", true);
      burst(s.x, s.y, 20, ["#9df3ff", "#ffffff"], 260);
    } else die("ship");
  }
}
function die(reason) {
  if (G.phase === "over") return;
  G.phase = "over";
  if (G.lastStand) setLastStand(false); // tắt Last Stand khi chết
  // v2.0: meta (Mảnh Kính thưởng + achievement runEnd), tutorial hook
  if (window.V2) { try { V2.onGameOver(reason); } catch (er) {} }
  SatManager.closeAll(); // dọn popup vệ tinh, không để tiến trình mồ côi
  try { AudioEngine.sfx.stinger("gameOver"); } catch (e) {} // stinger womp-womp hài — thay sfx.over() procedural buồn
  // H1/B4: cửa sổ vỡ → shatter vui nhộn (mảnh kính bay tại vị trí tàu)
  if (reason === "window" && window.Cinema && typeof Cinema.shatterBurst === "function") {
    try { Cinema.shatterBurst(G.ship ? G.ship.x : undefined, G.ship ? G.ship.y : undefined); } catch (e) {}
  }
  try { AudioEngine.setMusicState("GAMEOVER"); } catch (e) {} // WOW: downlifter + pad
  AudioEngine.stopMusic();
  const reasonTxt = reason === "window" ? I18N.t("gameover.title_window") : I18N.t("gameover.title_ship");
  burst(G.ship.x, G.ship.y, 46, ["#0080FF", "#ffffff", "#8fc3ff"], 380);
  windowJitter(30); jxShake(12, 700, 10); // WOW tier: boss chết / player die
  if (bus) bus.postMessage({ type: "gameover", profileId: PROFILE_ID, score: G.score, wave: G.wave, act: G.act,
    kills: G.kills, time: Math.round(G.time), timeSec: Math.round(G.time), diff: DIFF_KEY, reason: reasonTxt });
  try { Telemetry.log("death", { reason, wave: G.wave, score: G.score, kills: G.kills, duration_s: Math.round(G.time), difficulty: DIFF_KEY, level: G.level }); } catch (e) {} // telemetry FUN: nguyên nhân chết (map reason→cause trong module)
  $("over-title").textContent = reasonTxt;
  $("over-score").textContent = I18N.t("gameover.score_line", { score: I18N.fmtNum(G.score), wave: G.wave });
  $("over-stats").innerHTML = `<svg class="ic" aria-hidden="true"><use href="#i-skull"/></svg> ` + I18N.t("gameover.stats", { kills: `<b>${G.kills}</b>`, level: `<b>${G.level}</b>`, time: `<b>${Math.round(G.time)}s</b>`, diff: `<b>${DIFF.label}</b>` });
  let recTxt = "";
  try {
    const hk = PROFILE_ID ? `wk_high_${DIFF_KEY}_${PROFILE_ID}` : `wk_high_${DIFF_KEY}`;
    const prev = JSON.parse(localStorage.getItem(hk) || "null");
    if (!prev || G.score > prev.score) recTxt = `<svg class="ic" aria-hidden="true"><use href="#i-trophy"/></svg> ${I18N.t("gameover.new_record")}`;
  } catch {}
  $("over-record").innerHTML = recTxt;
  // CTA web→desktop (Sprint R2 item 5): banner game-over chỉ hiện khi wave≥5,
  // và chỉ trên web thường (không portal, không Electron).
  try {
    const ctaEl = $("over-desktop-cta");
    if (ctaEl) ctaEl.hidden = !(G.wave >= 5 && !ctaSuppressed());
  } catch (e) {}
  $("ov-over").classList.add("show");
}
function resetGame() {
  Object.assign(G, {
    phase: "play", wave: 0, act: 0, score: 0, kills: 0, time: 0,
    bullets: [], ebullets: [], enemies: [], gems: [], pickups: [], parts: [], floats: [],
    boss: null, spawnQueue: [], spawnT: 0, waveBreak: 1.4, waveClearShown: false,
    banner: "", bannerT: 0, bannerSub: "",
    xp: 0, level: 1, xpNeed: 6, shake: 0, combo: 0, comboT: 0, slowmo: 1,
    lastStand: false, // "Cửa Sổ Cuối Cùng": reset khi chơi lại
    bombWave: 0, giantWave: 0, motherWave: 0,
    _desktopToastShown: false, // CTA web→desktop: toast wave 10 hiện 1 lần/run
    loveWave: 0, mirrorWave: 0, vacWave: 0, // M7/M10/M9: reset guard 1-lần/wave khi chơi lại
         globalHaste: 1, hasteT: 0, slowZones: [], // SEASON 1: reset chuông + vùng họp khi chơi lại
         // VARIETY PACK 1: reset modifier/event flags khi chơi lại
         vp1_mod: null, vp1_mods: [], vp1_lastMod: null, vp1_gemMul: 1, vp1_tiny: false, vp1_xpMul: 1,
         vp1_shipSpdMul: 1, vp1_starBullets: false, vp1_slowOpenT: 0, vp1_glowParty: false,
         vp1_magnetMul: 1, vp1_dj: false, vp1_hullIns: false, vp1_pickupMul: 1,
         vp1_fireworks: false, vp1_golden: false, vp1_breather: false,
         // Endless Delight (2026-10-04): reset 5 modifier vui wave 30+ khi chơi lại
         vp1_discoBullets: false, vp1_confetti: false, vp1_luckyPickup: false,
         vp1_boingy: false, vp1_giggle: false, vp1_eventDj: false,
         vp1_modHistory: [], // Endless Delight: lịch sử modifier chống lặp (wave 30+)
         vp1_meteors: null, vp1_meteorT: 0, vp1_blackoutT: 0, vp1_directorDebutShown: false,
         // Item 6 (retune wave 15–30): reset spotlight flags khi chơi lại
         vp1_spotlight: false, vp1_spotlightSub: "", vp1_eliteParade: false,
  });
  // F-02 + Phụ lục A: chụp modifiers của Xưởng cho run này (runMods đã được
  // preboot của V2 gán trước lần reset đầu; các lần restart đọc lại cùng nguồn)
  try { G.runMods = (window.V2 && V2.runMods) ? V2.runMods : null; } catch (e) {}
  G.upgTaken = {}; // D-03: đếm distinct upgrade theo run
  G.ship = newShip();
  // AUDIT 2026-10-02: resetGame() trước đây không dọn vệ tinh/boss module/Juice2 —
  // restart từ pause hoặc sau game-over để sót bomb/mother/nest và boss ma của run cũ
  // chạy tiếp sang run mới; cracks + windowDamagePx cũng cộng dồn qua các run.
  try { SatManager.closeAll(); } catch (e) {}
  try { if (window.Bosses) Bosses.stop(); } catch (e) {}
  try { if (window.StageFX) StageFX.exit(); } catch (e) {} // AUDIT 2026-10-02: thoát mechanic ải của run cũ (xóa cả flag G.blackout)
  // STAGE-OBJ: reset objective phụ mỗi run (startWave wave 1 reset lại lần nữa cho chắc)
  try { if (window.StageObj) StageObj.begin(window.V2 ? V2.stageId : 0); } catch (e) {}
  // STAGE-MECH: reset twist thưởng theo ải mỗi run (gọi sau StageObj để chain đúng hook gai ải 2)
  try { if (window.StageMech) StageMech.begin(window.V2 ? V2.stageId : 0); } catch (e2) {}
  try { if (window.Juice2) Juice2.reset(); } catch (e) {}
  // FIX 2026-10-03 (gray-veil #2): boss spawn gọi BG.setDim(0.45), chỉ killBoss()
  // mới setDim(0). Chết giữa boss → dim kẹt 0.45 sang run mới → màn tối/xám đều.
  try { if (typeof BG !== "undefined") BG.setDim(0); } catch (e) {}
  try { if (window.Upgrades2) Upgrades2.resetRun(); } catch (e) {} // M22: mở lại pool draft v2 (giữ unlock boss ải trong phiên)
  G.cracks = []; G.windowDamagePx = 0;
  // Khôi phục kích thước: arena ảo về null (tự tính lại full-size), cửa sổ thật
  // grow về cỡ ban đầu (growWindow tự cap ở START_W × 720).
  arena = null;
  try { growWindow(START_W, 720); } catch (e) {}
  // FIX P0 2026-10-05: chụp kích thước arena THỰC lúc bắt đầu run để hiệu chuẩn
  // windowIntegrity(). Desktop không dùng (giữ START_* như cũ). Mobile/sim:
  // arena = null → bounds() = viewport → boot ở 100%, Last Stand chỉ bật khi
  // bị gặm teo thật.
  try {
    const _b0 = bounds();
    G.arenaInit = { w: _b0.w, h: _b0.h };
  } catch (e) { G.arenaInit = null; }
  // §6.4.7: tooltip điểm 1 lần duy nhất sau update — "Điểm = tổng điểm gốc — không nhân."
  try {
    if (!localStorage.getItem("wk_score_tip_seen")) {
      localStorage.setItem("wk_score_tip_seen", "1");
      setTimeout(() => { try { setBanner(I18N.t("banner.score_tip"), ""); } catch (e) {} }, 2500);
    }
  } catch (e) {}
  ["ov-over", "ov-draft", "ov-pause"].forEach(id => $(id).classList.remove("show"));
  // WOW: reset juice/cinema + hàng đợi spawn
  G.dying = []; G.pendingSpawns = 0; G.waveKills = 0; G.bossCine = false; bossSpawnTok++;
  if (window.Juice) { try { Juice.reset(); } catch (e) {} }
  if (window.Cinema) { try { Cinema.reset(); } catch (e) {} }
  playActMusic(); // Act 1
  refreshBG(); // build background ải 1
  lastT = performance.now();
}
$("btn-again").onclick = () => { AudioEngine.sfx.click(); resetGame(); };
$("btn-restart").onclick = () => { AudioEngine.sfx.click(); resetGame(); };
$("btn-resume").onclick = () => { AudioEngine.sfx.click(); pauseGame(false); };
// H3: tách hàm đặt tên để radial mobile gọi được
// FIX 2026-10-05 (user báo nút home liệt trên mobile): window.close() chỉ đóng
// được tab do script mở — browser chặn với tab thường → bấm không có tác dụng.
// "Về menu" phải về launcher (index.html), không phải đóng tab.
function quitToMenu() { try { Telemetry.log("wave_quit", { phase: G.phase, wave: G.wave, score: G.score, kills: G.kills, duration_s: Math.round(G.time), difficulty: DIFF_KEY, level: G.level }); } catch (e) {} location.href = "index.html"; } // telemetry FUN: wave quit (module tự bỏ khi phase==="over" — đã chết thì death đã log)
window.quitToMenu = quitToMenu;
$("btn-quit").onclick = quitToMenu;
$("btn-quit2").onclick = quitToMenu;
// CTA web→desktop (Sprint R2 item 5): track click mọi CTA desktop (guard trong trackCtaClick)
document.addEventListener("click", (e) => {
  try {
    const t = e.target && e.target.closest ? e.target.closest("[data-cta-id]") : null;
    if (t) trackCtaClick(t.dataset.ctaId);
  } catch (er) {}
});

