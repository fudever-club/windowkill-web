/* =====================================================================
   WINDOWKILL — Adaptive quality tiers cho mobile (feat/mobile-quality)
   =====================================================================
   Plain script, không phụ thuộc module nào. Load TRƯỚC js/game.js trong
   game.html. Expose `window.WKQuality`.

   3 nấc chất lượng:
     high     — desktop / máy khỏe: DPR cap 2, particle 100%, shadowBlur đủ
     balanced — mobile tầm trung:  DPR cap 1.5, particle 60%, shadowBlur nửa
     lite     — máy yếu:           DPR cap 1, particle 30%, tắt shadowBlur,
                                   BG + Juice ở chế độ reduced

   Tự động hạ nấc khi fps trung bình < ngưỡng trong vài giây; phát hiện sớm
   máy yếu qua navigator.hardwareConcurrency / deviceMemory / mobile UA +
   touch. KHÔNG BAO GIỜ tự tăng nấc khi đang combat (G.phase === "play") —
   chỉ tăng khi idle/menu, hoặc khi user chỉnh tay.

   Desktop (không phải mobile): mode auto luôn giữ high, không tự hạ nấc.
   Setting tay `quality` (auto/high/balanced/lite) lưu trong wk_settings,
   đồng bộ với launcher (index.html) qua URL param ?quality=.

   API:
     WKQuality.init()                 — đọc URL + setting + detect thiết bị
     WKQuality.setOnTierChange(fn)    — game.js đăng ký để áp nấc (BG/Juice/fit)
     WKQuality.setTier(name, reason)  — đổi nấc (gọi onTierChange nếu đổi)
     WKQuality.setManual(name)        — user chỉnh tay, persist vào wk_settings
     WKQuality.onFpsSample(fps, inCombat) — gọi mỗi giây từ perfTick của game.js
     WKQuality.tier / .mode / .mobile
     WKQuality.dprCap / .particleMul / .shadowScale (getter theo nấc hiện tại)
     WKQuality.TIERS / .ORDER / .THRESHOLDS (cho test + debug)
   ===================================================================== */
"use strict";
(function () {
  var TIERS = {
    high:     { dprCap: 2,   particleMul: 1.0, shadowScale: 1,   bg: "full",    juice: "full"    },
    balanced: { dprCap: 1.5, particleMul: 0.6, shadowScale: 0.5, bg: "full",    juice: "reduced" },
    lite:     { dprCap: 1,   particleMul: 0.3, shadowScale: 0,   bg: "reduced", juice: "reduced" },
  };
  var ORDER = ["high", "balanced", "lite"];
  var THRESHOLDS = {
    degradeFps: 35, degradeSecs: 2, // < 35fps trong 2s liên tiếp → hạ 1 nấc
    fastDropFps: 22,                // < 22fps → hạ ngay mỗi giây (máy quá đuối)
    upgradeFps: 55, upgradeSecs: 5, // > 55fps trong 5s + KHÔNG combat → tăng 1 nấc
  };
  var STORE_KEY = "wk_settings";
  var QUALITY_VALUES = ["auto", "high", "balanced", "lite"];

  function readSettings() {
    try {
      if (typeof localStorage === "undefined") return {};
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return {};
      return JSON.parse(raw) || {};
    } catch (e) { return {}; }
  }
  function saveQualitySetting(v) {
    try {
      if (typeof localStorage === "undefined") return;
      var raw = localStorage.getItem(STORE_KEY) || "{}";
      var s = JSON.parse(raw) || {};
      s.quality = v;
      localStorage.setItem(STORE_KEY, JSON.stringify(s));
    } catch (e) {}
  }
  function getParam(name) {
    try {
      var qs = (typeof window !== "undefined" && window.location) ? (window.location.search || "") : "";
      var m = qs.match(new RegExp("[?&]" + name + "=([^&]*)"));
      return m ? decodeURIComponent(m[1]) : null;
    } catch (e) { return null; }
  }
  function isMobileDevice() {
    try {
      var nav = (typeof navigator !== "undefined") ? navigator : {};
      var ua = (nav.userAgent || "") + " " + (nav.vendor || "");
      if (/Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(ua)) return true;
      if (nav.maxTouchPoints > 0 && typeof window !== "undefined" && window.matchMedia &&
          window.matchMedia("(pointer:coarse)").matches) return true;
    } catch (e) {}
    return false;
  }
  // Điểm yếu phần cứng: mobile +1, CPU ≤4 nhân +1, RAM ≤2GB +1.
  function weakScore() {
    var score = 0;
    try {
      var nav = (typeof navigator !== "undefined") ? navigator : {};
      if (isMobileDevice()) score++;
      if (nav.hardwareConcurrency && nav.hardwareConcurrency <= 4) score++;
      if (nav.deviceMemory && nav.deviceMemory <= 2) score++;
    } catch (e) {}
    return score;
  }
  function startTierForDevice(mobile) {
    if (!mobile) return "high"; // desktop: luôn high ở mode auto
    var ws = weakScore();
    if (ws >= 3) return "lite";
    if (ws >= 1) return "balanced";
    return "high";
  }

  var Q = {
    TIERS: TIERS,
    ORDER: ORDER,
    THRESHOLDS: THRESHOLDS,
    mode: "auto",      // "auto" | "manual"
    manualTier: null,
    tier: "high",
    mobile: false,
    _lowSecs: 0,
    _okSecs: 0,
    _onTier: null,

    setOnTierChange: function (fn) { this._onTier = (typeof fn === "function") ? fn : null; },

    _fireTierChange: function (reason) {
      if (this._onTier) { try { this._onTier(this.tier, reason || ""); } catch (e) {} }
    },

    setTier: function (name, reason) {
      if (!TIERS[name] || name === this.tier) return false;
      this.tier = name;
      this._lowSecs = 0;
      this._okSecs = 0;
      this._fireTierChange(reason);
      return true;
    },

    init: function () {
      this.mobile = isMobileDevice();
      this._lowSecs = 0;
      this._okSecs = 0;
      var qp = getParam("quality");
      var st = readSettings();
      var manual = qp || st.quality || "auto";
      if (QUALITY_VALUES.indexOf(manual) < 0) manual = "auto";
      if (manual !== "auto") {
        // Setting tay (hoặc ?quality= từ launcher): khóa nấc, không tự đổi.
        this.mode = "manual";
        this.manualTier = manual;
        this.tier = manual;
      } else {
        this.mode = "auto";
        this.manualTier = null;
        this.tier = startTierForDevice(this.mobile);
        // Tương thích legacy ?fx=reduced (chưa có ?quality=): mobile khởi đầu ở balanced.
        if (this.mobile && this.tier === "high" && getParam("fx") === "reduced") {
          this.tier = "balanced";
        }
      }
      return this.tier;
    },

    // User chỉnh tay từ menu/pause: persist + áp ngay.
    setManual: function (name) {
      if (QUALITY_VALUES.indexOf(name) < 0) name = "auto";
      saveQualitySetting(name);
      if (name === "auto") {
        this.mode = "auto";
        this.manualTier = null;
        this.setTier(startTierForDevice(this.mobile), "manual-auto");
        // Nếu nấc hiện tại đã đúng start tier thì setTier không fire — vẫn
        // reset bộ đếm để auto-degrade bắt đầu sạch.
        this._lowSecs = 0; this._okSecs = 0;
      } else {
        this.mode = "manual";
        this.manualTier = name;
        this.setTier(name, "manual");
      }
      return this.tier;
    },

    // Gọi mỗi giây với fps trung bình. inCombat=true khi G.phase === "play".
    onFpsSample: function (fps, inCombat) {
      if (this.mode !== "auto") return;   // khóa tay: không tự đổi
      if (!this.mobile) return;           // desktop: luôn giữ high
      if (typeof fps !== "number" || !(fps >= 0)) return;
      var idx = ORDER.indexOf(this.tier);
      if (idx < 0) idx = 0;
      if (fps < THRESHOLDS.fastDropFps) {
        // Máy quá đuối: hạ ngay 1 nấc mỗi giây, không chờ đủ 2s.
        if (idx < ORDER.length - 1) this.setTier(ORDER[idx + 1], "fast-drop");
        this._lowSecs = 0; this._okSecs = 0;
        return;
      }
      if (fps < THRESHOLDS.degradeFps) {
        this._lowSecs++;
        this._okSecs = 0;
        if (this._lowSecs >= THRESHOLDS.degradeSecs && idx < ORDER.length - 1) {
          this.setTier(ORDER[idx + 1], "low-fps");
          this._lowSecs = 0;
        }
        return;
      }
      if (fps > THRESHOLDS.upgradeFps) {
        this._lowSecs = 0;
        // KHÔNG BAO GIỜ tự tăng nấc giữa wave đang căng.
        if (inCombat) { this._okSecs = 0; return; }
        this._okSecs++;
        if (this._okSecs >= THRESHOLDS.upgradeSecs && idx > 0) {
          this.setTier(ORDER[idx - 1], "recovered");
          this._okSecs = 0;
        }
        return;
      }
      this._lowSecs = 0;
      this._okSecs = 0;
    },
  };

  Object.defineProperties(Q, {
    dprCap:      { get: function () { return TIERS[this.tier].dprCap; } },
    particleMul: { get: function () { return TIERS[this.tier].particleMul; } },
    shadowScale: { get: function () { return TIERS[this.tier].shadowScale; } },
  });

  if (typeof window !== "undefined") window.WKQuality = Q;
  if (typeof module !== "undefined" && module.exports) module.exports = Q;
})();
