/* WINDOWKILL Web Edition — Mobile enhancements (feat/mobile-round2)
 * Progressive enhancement cho mobile, load SAU js/game.js trong game.html.
 * Không sửa logic game core: chỉ bọc (wrap) các hàm global để gắn haptic,
 * wire nút pause HUD, và chặn iOS pinch-gesture. Mọi thứ có guard đầy đủ.
 */
"use strict";
(function () {
  /* ---------- 1. Haptics ---------- */
  var HAPT_ON = true;
  function buzz(p) {
    try { if (HAPT_ON && "vibrate" in navigator) navigator.vibrate(p); } catch (e) {}
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
})();
