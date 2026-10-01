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

  window.WK_PORTAL_MODE = portal;
  window.WKPortal = {
    isPortal: portal,
    inIframe: inIframe(),
    // Ép/bỏ chế độ portal thủ công (phải gọi trước khi menu/game init).
    force: function (on) { window.WK_PORTAL_MODE = !!on; }
  };

  if (portal) {
    try { console.info("[Portal] portal mode ON — simulation satellites, no service worker, same-window launch"); } catch (e) {}
  }
})();
