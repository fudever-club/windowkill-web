/* ---------------- input: phím + chuột + touch ---------------- */
const keys = {};
const mouse = { x: innerWidth / 2, y: innerHeight / 2 - 100, down: false };
const touch = { active: (function(){ try { return ("ontouchstart" in window) || navigator.maxTouchPoints > 0; } catch (e) { return false; } })(), // MOBILE 2026-10-03: nhận touch-capable ngay từ đầu (trước touch đầu tiên) để hiện hint mobile
  moveId: null, aimId: null,
  moveOX: 0, moveOY: 0, moveX: 0, moveY: 0, aimX: 0, aimY: 0, aimDX: 0, aimDY: 0 };
window.addEventListener("keydown", e => {
  keys[e.code] = true;
  // AUDIT 2026-10-02: resume AudioContext ngay trong gesture — trước đây trang game
  // chỉ resume ở touchstart nên người chơi desktop (chuột/phím) mất toàn bộ SFX
  // procedural vì context kẹt "suspended" (gesture ở tab menu không chuyển sang popup).
  try { AudioEngine.resume(); } catch (er) {}
  SatManager.flush(); // phím cũng là user gesture hợp lệ để mở popup
  if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
  if ((e.code === "KeyP" || e.code === "Escape")) {
    if (G.phase === "play") pauseGame(true); else if (G.phase === "paused") pauseGame(false);
  }
  if (e.code === "KeyM") {
    // AUDIT 2026-10-02: trước đây M đọc qp "music" theo chuẩn "off"/"on" trong khi
    // launcher gửi "1"/"0" → vào game với nhạc tắt phải bấm M 2 lần mới bật được, và
    // trạng thái không lưu về settings nên ván sau revert. Dùng biến trạng thái nội
    // bộ khởi tạo từ qp "1"/"0" + ghi lại wk_settings.
    musicOn = !musicOn;
    AudioEngine.setSettings({ music: musicOn });
    if (window.BGM) { try { BGM.setEnabled(musicOn); } catch (e2) {} }
    if (musicOn) AudioEngine.startMusic(curTrack);
    try {
      const st = JSON.parse(localStorage.getItem("wk_settings") || "{}");
      st.music = musicOn; localStorage.setItem("wk_settings", JSON.stringify(st));
    } catch (e2) {}
  }
  if (e.code === "KeyR" && G.phase === "over") resetGame();
  // M22: Neo Quán Tính — Shift kích hoạt neo (xóa hất văng + impulse trơn ải 3 qua module slippery đã export)
  if ((e.code === "ShiftLeft" || e.code === "ShiftRight") && !e.repeat && G.phase === "play" && window.Upgrades2) {
    try {
      if (Upgrades2.tryAnchor(G.ship) && window.StageFX && StageFX.modules && StageFX.modules.slippery &&
          typeof StageFX.modules.slippery.stabilize === "function") StageFX.modules.slippery.stabilize();
    } catch (er) {}
  }
  // Súng Bắn Keo (2026-10-04, CEO chốt) — E vá ngay +60px cửa sổ, hồi chiêu 30s
  if (e.code === "KeyE" && !e.repeat && G.phase === "play") fireGlueGun();
});
window.addEventListener("keyup", e => keys[e.code] = false);
canvas.addEventListener("mousemove", e => { mouse.x = e.clientX; mouse.y = e.clientY; });
canvas.addEventListener("mousedown", e => {
  mouse.down = true;
  try { AudioEngine.resume(); } catch (er) {} // AUDIT 2026-10-02: xem keydown — cứu SFX desktop
  SatManager.flush(); // user gesture: mở popup vệ tinh đang xếp hàng
  SatManager.hitSim(e.clientX, e.clientY); // click vào cửa sổ mô phỏng = 1 sát thương
  // v2.0: tutorial — nút Bỏ qua / nút beat 10
  if (window.Tutorial) { try { if (Tutorial.isActive()) Tutorial.onEvent("tap", { x: e.clientX, y: e.clientY }); } catch (er) {} }
  if (G.phase === "paused") pauseGame(false);
});
window.addEventListener("mouseup", () => mouse.down = false);
canvas.addEventListener("contextmenu", e => e.preventDefault());
window.addEventListener("blur", () => {
  // không auto-pause khi đang thao tác vệ tinh (click popup = blur cửa sổ chính)
  if (G.phase === "play" && SatManager.count() === 0) pauseGame(true);
  // FIX 2026-10-03: xóa phím kẹt — nhả phím khi tab khác đang focus thì keyup
  // không về tới game → tàu tự trôi / đơ sau khi quay lại
  for (const k in keys) keys[k] = false;
});
window.addEventListener("pagehide", () => SatManager.closeAll());

// touch: nửa trái = di chuyển, nửa phải = ngắm+bắn
canvas.addEventListener("touchstart", e => {
  e.preventDefault(); touch.active = true;
  document.body.classList.add("wk-coarse"); // H3: bật radial menu khi touch
  AudioEngine.resume();
  for (const t of e.changedTouches) {
    // v2.0: tutorial — tap vào nút Bỏ qua / beat 10 thì không gán joystick
    let tutTap = false;
    if (window.Tutorial) {
      try {
        if (Tutorial.isActive()) {
          const r = Tutorial.skipButtonRect();
          if (r && t.clientX >= r.x && t.clientX <= r.x + r.w && t.clientY >= r.y && t.clientY <= r.y + r.h) tutTap = true;
        }
      } catch (er) {}
    }
    if (tutTap) { try { Tutorial.onEvent("tap", { x: t.clientX, y: t.clientY }); } catch (er) {} continue; }
    if (t.clientX < window.innerWidth / 2 && touch.moveId === null) { // MOBILE 2026-10-03: canvas.width giờ là device px (DPR)
      touch.moveId = t.identifier; touch.moveOX = touch.moveX = t.clientX; touch.moveOY = touch.moveY = t.clientY;
    } else if (touch.aimId === null) {
      touch.aimId = t.identifier; touch.aimX = t.clientX; touch.aimY = t.clientY;
      touch.aimDX = 0; touch.aimDY = 0;
    }
  }
}, { passive: false });
canvas.addEventListener("touchmove", e => {
  e.preventDefault();
  for (const t of e.changedTouches) {
    if (t.identifier === touch.moveId) { touch.moveX = t.clientX; touch.moveY = t.clientY; }
    else if (t.identifier === touch.aimId) {
      touch.aimDX = t.clientX - touch.aimX; touch.aimDY = t.clientY - touch.aimY;
    }
  }
}, { passive: false });
function touchEnd(e) {
  for (const t of e.changedTouches) {
    if (t.identifier === touch.moveId) { touch.moveId = null; touch.moveDX = 0; touch.moveDY = 0; }
    if (t.identifier === touch.aimId) { touch.aimId = null; touch.aimDX = 0; touch.aimDY = 0; }
  }
  if (touch.moveId === null && touch.aimId === null) touch.active = false;
}
canvas.addEventListener("touchend", touchEnd);
canvas.addEventListener("touchcancel", touchEnd);
function touchMoveVec() {
  if (touch.moveId === null) return null;
  const dx = touch.moveX - touch.moveOX, dy = touch.moveY - touch.moveOY;
  const d = hypot(dx, dy);
  if (d < 12) return null;
  // AUDIT 2026-10-02: áp đường cong joystick R3 ngay tại đây (mobile.js round3 từng
  // cố thay window.touchMoveVec nhưng hàm này nằm trong IIFE nên không thay được —
  // dead code). Cũ: m = min(d,60)/60 → nhảy 20% tốc độ ngay tại mép deadzone.
  // Mới: mép deadzone → 0%, mép 60px → 100%, giữ nguyên deadzone/hướng/tốc độ tối đa.
  const m = Math.min(1, (d - 12) / (60 - 12));
  return { x: dx / d * m, y: dy / d * m };
}
function touchAim() {
  const d = hypot(touch.aimDX, touch.aimDY);
  if (touch.aimId === null || d < 14) return null;
  return { x: touch.aimDX / d, y: touch.aimDY / d, fire: d > 24 };
}

