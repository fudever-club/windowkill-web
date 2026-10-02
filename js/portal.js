/* WINDOWKILL Web Edition — Portal mode bootstrap.
 *
 * Phát hiện game đang chạy trên portal (itch.io / CrazyGames / GameDistribution...),
 * tức là bị nhúng trong <iframe>, và bật chế độ portal:
 *  - Ép satellite dùng simulation (không mở popup thật — iframe chặn popup).
 *  - Tắt đăng ký service worker (SW vô nghĩa trên domain portal).
 *  - Launcher (menu.js) mở game.html ngay trong iframe thay vì window.open().
 *
 * Cách bật (bất kỳ cách nào):
 *  1. Tự động: window.self !== window.top (đang nằm trong iframe).
 *  2. Query: ?portal=1 (để test local).
 *  3. Thủ công: window.WK_PORTAL = true trước khi file này chạy.
 *
 * Cơ chế ép simulation: game.js đọc SAT_MODE từ query ?sat= (auto|sim|off).
 * File này tiêm sat=sim vào URL bằng history.replaceState (không reload)
 * TRƯỚC khi game.js chạy, nên KHÔNG cần sửa game.js (tránh file 158KB).
 *
 * PHẢI load TRƯỚC js/pwa.js, js/menu.js, js/game.js (dùng defer, giữ đúng thứ tự
 * khai báo trong HTML). Không phụ thuộc bất kỳ lib nào.
 */
(function () {
  "use strict";

  function inIframe() {
    try {
      return window.self !== window.top;
    } catch (e) {
      return true; // cross-origin: không đọc được window.top → chắc chắn là iframe
    }
  }

  function queryPortal() {
    try {
      return new URLSearchParams(window.location.search).get("portal") === "1";
    } catch (e) {
      return false;
    }
  }

  var portal = false;
  try { portal = window.WK_PORTAL === true; } catch (e) {}
  if (!portal) portal = queryPortal();
  if (!portal) portal = inIframe();

  // POKI (blocker #3): detect Poki qua ?portal=poki hoặc referrer → WK_POKI.
  // Poki chặn mọi external request: analytics đã tắt theo WK_PORTAL_MODE; footer links ra ngoài bị ẩn.
  var poki = false;
  try {
    poki = new URLSearchParams(window.location.search).get("portal") === "poki" ||
      (document.referrer && /(^|\.)poki\.com$/i.test(new URL(document.referrer).hostname));
  } catch (e) {}
  window.WK_POKI = poki;
  if (poki) portal = true;

  window.WK_PORTAL_MODE = portal;
  window.WKPortal = {
    isPortal: portal,
    inIframe: inIframe(),
    // Ép/bỏ chế độ portal thủ công (phải gọi trước khi menu/game init).
    force: function (on) { window.WK_PORTAL_MODE = !!on; }
  };

  if (portal) {
    try {
      // Tiêm sat=sim để game.js ép simulation (không cần sửa game.js).
      // Tôn trọng ?sat=... nếu đã chỉ định rõ (vd ?portal=1&sat=auto để test popup thật).
      var usp = new URLSearchParams(window.location.search);
      if (!usp.has("sat")) {
        usp.set("sat", "sim");
        var newUrl = window.location.pathname + "?" + usp.toString() + window.location.hash;
        window.history.replaceState(null, "", newUrl);
      }
    } catch (e) {}
    try { console.info("[Portal] portal mode ON — simulation satellites, no service worker, same-window launch"); } catch (e) {}
    // POKI: ẩn link ra ngoài ở footer (Poki cấm branding/quảng cáo ngoài)
    if (poki) {
      var hideLinks = function () {
        try {
          var fl = document.querySelector(".footer-links");
          if (fl) fl.style.display = "none";
        } catch (e) {}
      };
      if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", hideLinks);
      else hideLinks();
    }
  }
})();
