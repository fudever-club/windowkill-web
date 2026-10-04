/* WINDOWKILL Web Edition — PWA bootstrap (không inline, tương thích CSP script-src 'self').
 * - Đăng ký service worker sau khi trang load xong.
 * - Toast "có bản mới" khi SW phát hiện update: registration.onupdatefound →
 *   worker mới state "installed" + page đang có controller → hiện toast
 *   "Có bản mới — bấm để tải lại"; bấm → postMessage SKIP_WAITING →
 *   controllerchange → reload. Reload CHỈ khi user đã bấm (tránh reload
 *   ngay lần claim đầu tiên của SW mới cài).
 * - Giữ lại beforeinstallprompt để menu có thể hiện nút "Cài đặt app" khi cần,
 *   phát event "windowkill:installable" thay vì tự ý hiện UI (không ép UX).
 * - Portal mode (window.WK_PORTAL_MODE do js/portal.js set): bỏ qua đăng ký SW,
 *   vì SW vô nghĩa khi game chạy trên domain portal (itch.io, CrazyGames...). */
(function () {
  "use strict";

  var portalMode = false;
  try { portalMode = !!window.WK_PORTAL_MODE; } catch (e) {}

  function t(key, fb) {
    try { if (window.I18N && typeof I18N.t === "function") return I18N.t(key); } catch (e) {}
    return fb;
  }

  /* Toast "có bản mới": nút bấm chính (reload), nút × đóng. Không tự tắt —
     user có thể đang giữa run game. */
  function showUpdateToast(onReload) {
    try {
      if (document.getElementById("wk-update-toast")) return;
      var el = document.createElement("div");
      el.id = "wk-update-toast";
      el.setAttribute("role", "status");
      var ico = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      ico.setAttribute("class", "ic"); ico.setAttribute("aria-hidden", "true");
      var use = document.createElementNS("http://www.w3.org/2000/svg", "use");
      use.setAttribute("href", "#i-restart");
      ico.appendChild(use);
      var btn = document.createElement("button");
      btn.type = "button"; btn.className = "wk-update-go";
      btn.setAttribute("aria-label", t("pwa.update_aria", "Reload to get the new version"));
      btn.textContent = t("pwa.update_text", "Có bản mới — bấm để tải lại");
      btn.addEventListener("click", function () {
        try { onReload(); } catch (e) {}
        try { el.remove(); } catch (e2) {}
      });
      var x = document.createElement("button");
      x.className = "toast-x"; x.type = "button";
      x.setAttribute("aria-label", t("menu.hub.close", "Đóng"));
      x.textContent = "×";
      x.addEventListener("click", function () { try { el.remove(); } catch (e) {} });
      el.appendChild(ico); el.appendChild(btn); el.appendChild(x);
      document.body.appendChild(el);
    } catch (e) {}
  }

  if (!portalMode && "serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      var updatePending = false; // user đã bấm "tải lại" → controllerchange mới được reload
      var reloading = false;

      navigator.serviceWorker.register("sw.js").then(function (reg) {
        reg.addEventListener("updatefound", function () {
          var nw = reg.installing;
          if (!nw) return;
          nw.addEventListener("statechange", function () {
            // Worker mới "installed" trong khi page đã có controller = có bản mới.
            if (nw.state === "installed" && navigator.serviceWorker.controller) {
              showUpdateToast(function () {
                updatePending = true;
                nw.postMessage({ type: "SKIP_WAITING" });
              });
            }
          });
        });
        // Chủ động kiểm tra update: khi tab hiện lại + mỗi giờ.
        function checkUpdate() { try { reg.update(); } catch (e) {} }
        document.addEventListener("visibilitychange", function () {
          if (!document.hidden) checkUpdate();
        });
        setInterval(checkUpdate, 60 * 60 * 1000);
      }).catch(function (err) {
        console.warn("[PWA] Service worker registration failed:", err);
      });

      navigator.serviceWorker.addEventListener("controllerchange", function () {
        // Chỉ reload khi user đã bấm toast (updatePending) — không reload ở lần
        // claim đầu tiên của SW mới cài (lúc đó updatePending === false).
        if (updatePending && !reloading) {
          reloading = true;
          window.location.reload();
        }
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
