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
  function buzz(p) {
    try { if (hapticOn() && "vibrate" in navigator) navigator.vibrate(p); } catch (e) {}
  }
  window.WKBuzz = buzz; // cho phép game core hoặc console gọi tay

  // Bọc hàm global của game.js để gắn rung mà không đổi behavior gốc
  function wrapFn(name, onCall) {
    try {
      var orig = window[name];
      if (typeof orig !== "function" || orig.__wkWrapped) return false;
      var w = function () {
        var r = orig.apply(this, arguments);
        try { onCall.apply(this, arguments); } catch (e2) {}
        return r;
      };
      w.__wkWrapped = true;
      window[name] = w;
      return true;
    } catch (e) { return false; }
  }

  // Quái chết → rung nhẹ 12ms (bỏ qua nếu đã dead từ trước)
  wrapFn("killEnemy", function (e) { if (e && !e.dead) buzz(12); });
  // Trúng đạn → rung đôi cảnh báo
  wrapFn("hurtShip", function () { buzz([40, 30, 40]); });
  // Nuke nổ → rung mạnh 3 nhịp
  wrapFn("nukeBlast", function () { buzz([60, 40, 60]); });
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

  /* ---------- 5. Joystick rescale (round3) ---------- */
  // game.js — touchMoveVec(): deadzone 12px, max radius 60px, m = d/60
  //   → tốc độ tăng vọt 20% ngay tại mép deadzone. Rescale:
  //   mép deadzone → 0%, mép base (60px) → 100%.
  // Giữ nguyên tuyệt đối: ngưỡng deadzone 12px, hướng vector, tốc độ tối đa
  // khi kéo hết cỡ (m=1 tại 60px). Chỉ đổi đường cong magnitude.
  // LƯU Ý: vòng tròn base vẽ trong render() của game.js dùng literal r=52 —
  // không thể patch sạch nếu không can thiệp mỗi frame (sẽ phá vỡ WKPerf),
  // nên giữ nguyên visual. Một dòng sửa 52→60 trong game.js có thể làm ở
  // đợt sau khi không còn vướng giới hạn 128KB của github MCP call-tool.
  (function rescaleJoystick() {
    var DZ = 12, MAXR = 60;
    function joyMoveVecR3() {
      if (typeof touch === "undefined" || touch === null || touch.moveId === null) return null;
      var dx = touch.moveX - touch.moveOX, dy = touch.moveY - touch.moveOY;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d < DZ) return null;
      var m = (d - DZ) / (MAXR - DZ); // deadzone edge → 0%, base edge → 100%
      if (m > 1) m = 1;
      return { x: dx / d * m, y: dy / d * m };
    }
    try {
      if (typeof window.touchMoveVec === "function" && !window.touchMoveVec.__wkJoyR3) {
        window.touchMoveVec = joyMoveVecR3;
        window.touchMoveVec.__wkJoyR3 = true;
      }
    } catch (e) {}
  })();
})();
