/* =====================================================================
   WINDOWKILL: Web Edition — js/config.js
   Cấu hình frontend nạp TRƯỚC mọi module backend (js/api.js, js/analytics.js).

   CSP-safe: file JS ngoài, KHÔNG inline <script> (CSP script-src 'self'
   chặn inline — từng làm window.WK_API_BASE không được set, backend chết lặng).
   Nạp với `defer` ngay trước js/api.js (index.html) / js/analytics.js (game.html);
   script defer giữ đúng thứ tự xuất hiện trong HTML.

   Thứ tự resolution giữ nguyên như js/api.js:
     1. window.WK_API_BASE (set ở đây, hoặc script nạp sớm hơn)
     2. localStorage "wk_api_base" (dev override, vd "http://localhost:3001")
     3. "" (same origin)
   ===================================================================== */
(function () {
  "use strict";
  if (typeof window !== "undefined" && !window.WK_API_BASE) {
    window.WK_API_BASE = "https://windowkill-web.fly.dev";
  }
})();
