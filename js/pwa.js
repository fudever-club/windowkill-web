/* WINDOWKILL Web Edition — PWA bootstrap (không inline, tương thích CSP script-src 'self').
 * - Đăng ký service worker sau khi trang load xong.
 * - Giữ lại beforeinstallprompt để menu có thể hiện nút "Cài đặt app" khi cần,
 *   phát event "windowkill:installable" thay vì tự ý hiện UI (không ép UX).
 * - Portal mode (window.WK_PORTAL_MODE do js/portal.js set): bỏ qua đăng ký SW,
 *   vì SW vô nghĩa khi game chạy trên domain portal (itch.io, CrazyGames...). */
(function () {
  "use strict";

  var portalMode = false;
  try { portalMode = !!window.WK_PORTAL_MODE; } catch (e) {}

  if (!portalMode && "serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").catch(function (err) {
        console.warn("[PWA] Service worker registration failed:", err);
      });
    });
  }

  // Cất install prompt: menu.js có thể đọc window.__deferredInstallPrompt khi muốn.
  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    window.__deferredInstallPrompt = e;
    window.dispatchEvent(new CustomEvent("windowkill:installable"));
  });
})();
