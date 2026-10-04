/* WINDOWKILL Web Edition — PWA install prompt (launcher).
 * Hiện card "Cài game" khi trình duyệt cho phép cài PWA:
 *  - Chromium/Android/Desktop: pwa.js bắt beforeinstallprompt, cất vào
 *    window.__deferredInstallPrompt và bắn event "windowkill:installable" →
 *    card hiện nút "Cài đặt", bấm thì gọi prompt() gốc; sau khi cài
 *    (event "appinstalled") thì ẩn.
 *  - iOS Safari: không có beforeinstallprompt → card hiện hướng dẫn
 *    "Chia sẻ → Thêm vào Màn hình chính".
 * Không hiện khi: đã cài (display-mode: standalone), user đã bấm đóng
 * (nhớ trong localStorage), portal mode, Electron. Không emoji trong DOM.
 * Logic hiện/ẩn thuần (decide/detectEnv/isIosDevice) tách riêng để test node.
 */
(function (root) {
  "use strict";

  var DISMISS_KEY = "wk_install_dismissed";

  /* Pure decision logic — không chạm DOM, test được trong node.
   * state: { installable, ios, standalone, dismissed, suppressed, sessionHidden }
   * trả về "prompt" | "ios" | "hidden" */
  function decide(s) {
    if (!s) return "hidden";
    if (s.standalone || s.dismissed || s.suppressed || s.sessionHidden) return "hidden";
    if (s.installable) return "prompt";
    if (s.ios) return "ios";
    return "hidden";
  }

  function isIosDevice(ua, platform, maxTouchPoints) {
    ua = String(ua || "");
    if (/iphone|ipad|ipod/i.test(ua)) return true;
    // iPadOS 13+ giả UA desktop "Macintosh" — nhận diện qua touch points
    if (/macintosh/i.test(ua) && String(platform || "") === "MacIntel" && (maxTouchPoints || 0) > 1) return true;
    return false;
  }

  /* Đọc môi trường trình duyệt. opt cho phép inject fake navigator/window khi test:
   * detectEnv({ navigator: {...}, window: {...} }) */
  function detectEnv(opt) {
    opt = opt || {};
    var nav = opt.navigator || (typeof navigator !== "undefined" ? navigator : {});
    var win = opt.window || root;
    var ios = isIosDevice(nav.userAgent, nav.platform, nav.maxTouchPoints);
    var standalone = false;
    try {
      standalone = (win.matchMedia && win.matchMedia("(display-mode: standalone)").matches) ||
        !!nav.standalone; // iOS Safari cũ: navigator.standalone
    } catch (e) { standalone = false; }
    var suppressed = false;
    try {
      suppressed = !!win.WK_PORTAL_MODE || /Electron\//.test(nav.userAgent || "");
    } catch (e) { suppressed = false; }
    var dismissed = false;
    try {
      var ls = win.localStorage || (typeof localStorage !== "undefined" ? localStorage : null);
      dismissed = !!ls && ls.getItem(DISMISS_KEY) === "1";
    } catch (e) { dismissed = false; }
    return { ios: ios, standalone: standalone, suppressed: suppressed, dismissed: dismissed };
  }

  function init() {
    if (typeof document === "undefined") return; // node/test
    var card = document.getElementById("install-card");
    if (!card) return;
    var env = detectEnv();
    var state = {
      installable: !!root.__deferredInstallPrompt, // pwa.js có thể đã bắt event trước
      ios: env.ios,
      standalone: env.standalone,
      suppressed: env.suppressed,
      dismissed: env.dismissed,
      sessionHidden: false,
    };

    function render() {
      var mode = decide(state);
      card.hidden = mode === "hidden";
      if (mode === "hidden") return;
      var els = card.querySelectorAll("[data-install-variant]");
      for (var i = 0; i < els.length; i++) {
        els[i].hidden = els[i].getAttribute("data-install-variant") !== mode;
      }
    }

    root.addEventListener("windowkill:installable", function () {
      state.installable = true;
      render();
    });
    root.addEventListener("appinstalled", function () {
      // Đã cài xong → ẩn ngay (lần mở sau standalone sẽ ẩn hẳn)
      state.installable = false;
      state.sessionHidden = true;
      render();
    });

    function persistDismiss() {
      try { root.localStorage.setItem(DISMISS_KEY, "1"); } catch (e) {}
      state.dismissed = true;
      render();
    }

    var btnInstall = document.getElementById("btn-install");
    if (btnInstall) btnInstall.addEventListener("click", function () {
      var dp = root.__deferredInstallPrompt;
      if (!dp || typeof dp.prompt !== "function") { render(); return; }
      try { dp.prompt(); } catch (e) { render(); return; }
      var done = function (choice) {
        if (choice && choice.outcome === "accepted") {
          root.__deferredInstallPrompt = null;
          state.installable = false;
        }
        // Dù accept hay cancel prompt gốc: ẩn hết phiên này, không nag.
        // (accept → appinstalled tới ngay sau và ẩn hẳn)
        state.sessionHidden = true;
        render();
      };
      try {
        if (dp.userChoice && typeof dp.userChoice.then === "function") dp.userChoice.then(done, function () { render(); });
        else done(null);
      } catch (e) { render(); }
    });

    var btnIosOk = document.getElementById("btn-install-ios-ok");
    if (btnIosOk) btnIosOk.addEventListener("click", persistDismiss);
    var btnDismiss = document.getElementById("btn-install-dismiss");
    if (btnDismiss) btnDismiss.addEventListener("click", persistDismiss);

    render();
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }

  var api = { decide: decide, isIosDevice: isIosDevice, detectEnv: detectEnv, DISMISS_KEY: DISMISS_KEY };
  root.InstallPrompt = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
