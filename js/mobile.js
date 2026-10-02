/* WINDOWKILL Web Edition — Mobile enhancements (feat/mobile-round3)
 * Progressive enhancement cho mobile, load SAU js/game.js trong game.html.
 * Không sửa logic game core: chỉ bọc (wrap) các hàm global để gắn haptic,
 * wire nút pause HUD, chặn iOS pinch-gesture, và rescale joystick.
 * Mọi thứ có guard đầy đủ.
 * Tương thích window.WKPerf (adaptive quality, PR #19): KHÔNG thêm bất kỳ
 * tác vụ nào chạy mỗi frame — mọi patch chỉ chạy một lần lúc load.
 */
"use strict";
(function () {
  /* ---------- 1. Haptics ---------- */
  // Cờ public window.WKHapticOn: game core / console có thể đọc-ghi.
  // Mặc định BẬT. Đọc live từ wk_settings (do launcher lưu) nên bắt kịp
  // ngay cả khi user đổi setting ở tab launcher trong lúc game đang chạy.
  var _hapticOverride = null; // null = tuân theo setting đã lưu
  function readHapticSetting() {
    try {
      var raw = localStorage.getItem("wk_settings");
      if (!raw) return true;
      var s = JSON.parse(raw);
      return s.haptic !== false; // mặc định BẬT
    } catch (e) { return true; }
  }
  function hapticOn() {
    return _hapticOverride !== null ? _hapticOverride : readHapticSetting();
  }
  try {
    if (!Object.getOwnPropertyDescriptor(window, "WKHapticOn")) {
      Object.defineProperty(window, "WKHapticOn", {
        get: hapticOn,
        set: function (v) { _hapticOverride = !!v; },
        configurable: true
      });
    }
  } catch (e) {}
  var _lastBuzz = 0;
  function buzz(p) {
    // OPT: throttle chống spam rung (vd nuke giết 30 quái cùng frame) + nhường khi perf đang reduced
    try {
      var now = Date.now();
      if (now - _lastBuzz < 80) return;
      if (window.WKPerf && window.WKPerf.reduced) return;
      _lastBuzz = now;
      if (hapticOn() && "vibrate" in navigator) navigator.vibrate(p);
    } catch (e) {}
  }
  window.WKBuzz = buzz; // cho phép game core hoặc console gọi tay

  // AUDIT 2026-10-02 (CRITICAL): cơ chế wrap cũ (window.killEnemy / hurtShip /
  // nukeBlast / touchMoveVec) là DEAD CODE — các hàm đó nằm trong IIFE của game.js,
  // không hề được export, và dù có export thì lời gọi nội bộ cũng đi qua closure chứ
  // không qua window nên wrap không bao giờ kích hoạt. Hệ quả thật: haptic + rescale
  // joystick không chạy; nút pause cũng chết (đã fix gốc trong game.js + CSS).
  // Nối lại qua các bề mặt hook CÓ THẬT và được gọi qua property lookup:
  //   - V2.onKill(e)  — game.js gọi mỗi khi quái chết (killEnemy)
  //   - V2.onNuke()   — game.js gọi khi nuke nổ (nukeBlast)
  //   - AudioEngine.sfx.hurt() — hurtShip gọi qua object AudioEngine
  function wrapMethod(obj, name, onCall) {
    try {
      if (!obj || typeof obj[name] !== "function" || obj[name].__wkWrapped) return false;
      var orig = obj[name];
      var w = function () {
        var r = orig.apply(this, arguments);
        try { onCall.apply(this, arguments); } catch (e2) {}
        return r;
      };
      w.__wkWrapped = true;
      obj[name] = w;
      return true;
    } catch (e) { return false; }
  }
  // Quái chết → rung nhẹ 12ms
  wrapMethod(window.V2, "onKill", function () { buzz(12); });
  // Nuke nổ → rung mạnh 3 nhịp
  wrapMethod(window.V2, "onNuke", function () { buzz([60, 40, 60]); });
  // Tàu trúng đòn → rung đôi cảnh báo
  try {
    if (window.AudioEngine && AudioEngine.sfx) {
      wrapMethod(AudioEngine.sfx, "hurt", function () { buzz([40, 30, 40]); });
    }
  } catch (e) {}
  // Mở draft (lên cấp) → tick xác nhận (Cinema là object, bọc method)
  try {
    if (window.Cinema && typeof Cinema.showDraft === "function" && !Cinema.showDraft.__wkWrapped) {
      var _sd = Cinema.showDraft;
      var _sdw = function () { var r = _sd.apply(this, arguments); try { buzz(20); } catch (e) {} return r; };
      _sdw.__wkWrapped = true;
      Cinema.showDraft = _sdw;
    }
  } catch (e) {}

  /* ---------- 2. Nút pause HUD (mobile không có phím P) ---------- */
  function wirePauseBtn() {
    var bp = document.getElementById("btn-hud-pause");
    if (!bp || bp.__wkWired) return;
    bp.__wkWired = true;
    bp.addEventListener("click", function (e) {
      e.stopPropagation();
      buzz(10);
      try { if (typeof pauseGame === "function") pauseGame(true); } catch (e2) {}
    });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wirePauseBtn);
  } else {
    wirePauseBtn();
  }

  /* ---------- 3. Chặn iOS pinch-zoom khi chơi ---------- */
  ["gesturestart", "gesturechange", "gestureend"].forEach(function (ev) {
    document.addEventListener(ev, function (e) { try { e.preventDefault(); } catch (e2) {} }, { passive: false });
  });

  /* ---------- 4. Chặn double-tap zoom trên nút (phòng CSS thiếu) ---------- */
  try {
    document.addEventListener("dblclick", function (e) { try { e.preventDefault(); } catch (e2) {} }, { passive: false });
  } catch (e) {}

  /* ---------- 5. Joystick rescale (round3) ----------
     AUDIT 2026-10-02: bản rescale bằng cách thay window.touchMoveVec trước đây là
     dead code (hàm nằm trong IIFE của game.js). Đường cong R3 (mép deadzone → 0%,
     mép base 60px → 100%, giữ nguyên deadzone 12px/hướng/tốc độ tối đa) nay được
     áp TRỰC TIẾP trong touchMoveVec() của game.js. Block này giữ lại làm tài liệu. */
  /* ---------- 6. Hint touch-aware (iPhone) ----------
     iPhone 2026-10-03: nhiều chuỗi hint ghi cho desktop ("P / Esc", "Phím 1/2/3",
     "WASD ...") nhưng hiện cả trên máy cảm ứng. Đổi sang bản mobile khi thiết bị
     có touch. Chạy sau i18n.js đã dịch (defer order đảm bảo). */
  function isTouchDevice() {
    try { return ("ontouchstart" in window) || navigator.maxTouchPoints > 0; } catch (e) { return false; }
  }
  function applyMobileHints() {
    if (!isTouchDevice()) return;
    try {
      var ph = document.querySelector('[data-i18n="pause.hint"]');
      if (ph && window.I18N && typeof I18N.t === "function") ph.textContent = I18N.t("pause.hint_mobile");
    } catch (e) {}
    // draft hint: cinema.js render lúc mở draft → bọc sau khi panel hiện
    try {
      if (window.Cinema && typeof Cinema.showDraft === "function" && !Cinema.showDraft.__wkHintWrapped) {
        var _orig = Cinema.showDraft;
        var _w = function () {
          var r = _orig.apply(this, arguments);
          try {
            var h = document.querySelector(".cin-draft-hint");
            if (h && window.I18N && typeof I18N.t === "function") h.textContent = I18N.t("draft.hint_mobile");
          } catch (e2) {}
          return r;
        };
        _w.__wkHintWrapped = true;
        Cinema.showDraft = _w;
      }
    } catch (e) {}
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyMobileHints);
  } else {
    applyMobileHints();
  }
})();
