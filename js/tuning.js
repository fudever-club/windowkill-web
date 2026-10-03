/* =====================================================================
   WINDOWKILL — Tuning tập trung (Sprint Round 2 · Item 3)
   Đọc section "tuning" của difficulty.config.json và expose qua
   window.WK_TUNING cho js/game.js (spawn formula, spawn interval,
   concurrent cap, difficulty bands) và cho Item 4 (wjumpPreset đọc
   trực tiếp WK_TUNING.tuning.window_physics).

   Chiến lược load (giống js/campaign.js): EMBEDDED fallback + fetch merge.
   Game boot được cả khi fetch fail (file://, offline, JSON lỗi) vì số
   mặc định = giá trị đang hardcode trong js/game.js (refactor thuần túy).

   window.WK_TUNING:
     .tuning               — section tuning đã merge (+ alias keys, xem dưới)
     .source               — "embedded" | "file"
     .ready                — Promise resolve sau lần fetch đầu (ok hay fail)
     .reload()             — fetch lại thủ công, trả Promise<boolean>
     .spawn()              — sanitized { base_count, per_wave, interval_floor_s,
                             interval_base_s, interval_decay, concurrent_cap }
     .physics(name)        — sanitized preset { name, impulse_max, cooldown_ms,
                             velocity_max }; name mặc định "wild"
     .bandForWave(wave)    — band difficulty_bands chứa wave, hoặc null
     .spawnIntervalFloor(wave) — floor spawn (band override hoặc global)
     .capMult(wave, kind, value) — áp hp_mult_cap / speed_mult_cap
                             (null = giữ nguyên value)
     .spawnIntervalFor(wave) — Item 6: interval theo công thức band
                             max(min_s, base_s × decay^wave); null khi band
                             không có key công thức (game dùng công thức cũ)
     .spotlightFor(wave)    — Item 6: entry tuning.spotlights của wave
                             ({ mods | event | elite_parade }) hoặc null

   Tương thích Item 4: reader của Item 4 (wjumpPreset) đọc preset qua key
   ngắn {impulse, velocity, cooldown}. Loader tự thêm 3 alias này cho mỗi
   preset từ key chuẩn {impulse_max, velocity_max, cooldown_ms} — designer
   chỉ sửa key chuẩn trong JSON.
   ===================================================================== */
(function () {
  "use strict";

  /* Fallback embed = số đang hardcode trong js/game.js (2026-10-03):
     - buildSpawnQueue: count = round((4 + n*3) * ...)
     - spawn tick:      G.spawnT = max(0.22, 0.85*spawnMul*onboard - wave*0.05)
     - pushWindow:      clamp velocity 950; kick đạn: impulse 300, không cooldown
     Wild = hành vi hiện tại. */
  var EMBEDDED_TUNING = {
    spawn: {
      base_count: 4, per_wave: 3,
      interval_floor_s: 0.22, interval_base_s: 0.85, interval_decay: 0.05,
      concurrent_cap: 20
    },
    window_physics: {
      calm:   { impulse_max: 15,  cooldown_ms: 300, velocity_max: 150 },
      normal: { impulse_max: 35,  cooldown_ms: 150, velocity_max: 400 },
      wild:   { impulse_max: 950, cooldown_ms: 0,   velocity_max: 950 }
    },
    difficulty_bands: {
      late_game_15_30: {
        waves: [15, 30],
        spawn_interval_s_floor: 0.22,
        /* Item 6: công thức retune wave 15–30 — interval = max(1.1s, 3.8s × 0.93^w).
           Wave 15 → ~1.28s; từ wave 17 chạm sàn 1.1s → ≤ ~54.5 spawn/phút. */
        spawn_interval_base_s: 3.8, spawn_interval_decay: 0.93, spawn_interval_min_s: 1.1,
        hp_mult_cap: null,
        speed_mult_cap: null
      }
    },
    /* Item 6: 6 spotlight wave — điểm nhấn VUI trong band 15–30
       (boss wave 20/25/30 không spotlight). */
    spotlights: {
      17: { mods: ["tiny"] },
      19: { elite_parade: true },
      21: { mods: ["payday"] },
      24: { event: "golden" },
      27: { mods: ["djparty"] },
      29: { mods: "random2" }
    }
  };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function num(v, fb) { v = parseFloat(v); return Number.isFinite(v) ? v : fb; }

  function deepMerge(dst, src) {
    if (!src || typeof src !== "object") return dst;
    Object.keys(src).forEach(function (k) {
      var sv = src[k], dv = dst[k];
      if (sv && typeof sv === "object" && !Array.isArray(sv) && dv && typeof dv === "object" && !Array.isArray(dv)) {
        deepMerge(dv, sv);
      } else {
        dst[k] = sv;
      }
    });
    return dst;
  }

  var TUNING = clone(EMBEDDED_TUNING);
  var configSource = "embedded";

  /* Thêm alias impulse/velocity/cooldown cho reader Item 4 (luôn suy từ
     key chuẩn — key chuẩn là source of truth duy nhất trong JSON). */
  function withAliases(tuning) {
    var out = clone(tuning);
    var wp = out.window_physics || {};
    ["calm", "normal", "wild"].forEach(function (k) {
      var p = wp[k];
      if (p && typeof p === "object") {
        p.impulse = num(p.impulse_max, 0);
        p.velocity = num(p.velocity_max, 0);
        p.cooldown = num(p.cooldown_ms, 0);
      }
    });
    return out;
  }

  function candidateUrls() {
    var urls = ["difficulty.config.json"];
    try {
      if (typeof document !== "undefined" && document.currentScript && document.currentScript.src) {
        var base = document.currentScript.src.replace(/[^/]*$/, "");
        urls.push(base + "../difficulty.config.json");
      }
    } catch (e) { /* bỏ qua */ }
    return urls;
  }

  function reloadConfig() {
    if (typeof fetch === "undefined") return Promise.resolve(false);
    var urls = candidateUrls(), i = 0;
    function attempt() {
      if (i >= urls.length) return Promise.resolve(false);
      var u = urls[i++];
      return fetch(u, { cache: "no-store" }).then(function (r) {
        if (!r.ok) return attempt();
        return r.json().then(function (json) {
          if (!json || !json.tuning || typeof json.tuning !== "object") return attempt();
          deepMerge(TUNING, json.tuning);
          configSource = "file";
          api.tuning = withAliases(TUNING);
          return true;
        }, function () { return attempt(); });
      }, function () { return attempt(); });
    }
    return attempt();
  }

  /* ---------------- sanitized accessors (game.js dùng) ---------------- */

  function spawnCfg() {
    var s = TUNING.spawn || {}, E = EMBEDDED_TUNING.spawn;
    return {
      base_count: num(s.base_count, E.base_count),
      per_wave: num(s.per_wave, E.per_wave),
      interval_floor_s: num(s.interval_floor_s, E.interval_floor_s),
      interval_base_s: num(s.interval_base_s, E.interval_base_s),
      interval_decay: num(s.interval_decay, E.interval_decay),
      concurrent_cap: num(s.concurrent_cap, E.concurrent_cap)
    };
  }

  function physicsCfg(name) {
    var wp = TUNING.window_physics || {};
    var key = (typeof name === "string" && wp[name]) ? name : "wild";
    var p = wp[key] || {}, E = (EMBEDDED_TUNING.window_physics[key] || EMBEDDED_TUNING.window_physics.wild);
    return {
      name: key,
      impulse_max: num(p.impulse_max, E.impulse_max),
      cooldown_ms: num(p.cooldown_ms, E.cooldown_ms),
      velocity_max: num(p.velocity_max, E.velocity_max)
    };
  }

  function bandForWave(n) {
    var bands = TUNING.difficulty_bands || {};
    var keys = Object.keys(bands);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (k.charAt(0) === "_") continue;
      var b = bands[k] || {};
      var w = b.waves;
      if (Array.isArray(w) && w.length === 2 && n >= w[0] && n <= w[1]) return b;
    }
    return null;
  }

  function spawnIntervalFloor(n) {
    var b = bandForWave(n);
    if (b && Number.isFinite(parseFloat(b.spawn_interval_s_floor))) {
      return parseFloat(b.spawn_interval_s_floor);
    }
    return spawnCfg().interval_floor_s;
  }

  /* Áp trần hệ số theo band (kind: "hp" | "speed"). cap null/không số
     → giữ nguyên value (hành vi hiện tại). */
  function capMult(n, kind, value) {
    var b = bandForWave(n);
    if (!b) return value;
    var cap = (kind === "hp") ? b.hp_mult_cap : b.speed_mult_cap;
    if (cap === null || cap === undefined) return value;
    cap = parseFloat(cap);
    if (!Number.isFinite(cap)) return value;
    return Math.min(value, cap);
  }

  /* Item 6 — interval spawn theo công thức band (data-driven):
       max(spawn_interval_min_s, spawn_interval_base_s × spawn_interval_decay^wave)
     Band late_game_15_30: max(1.1s, 3.8s × 0.93^w).
     Trả về null khi band không có đủ key số → game dùng công thức cũ
     (backward compatible với config của Item 3). */
  function spawnIntervalFor(n) {
    var b = bandForWave(n);
    if (!b) return null;
    var base = parseFloat(b.spawn_interval_base_s);
    var decay = parseFloat(b.spawn_interval_decay);
    if (!Number.isFinite(base) || !Number.isFinite(decay) || base <= 0 || decay <= 0) return null;
    var minS = parseFloat(b.spawn_interval_min_s);
    if (!Number.isFinite(minS) || minS < 0) minS = 0;
    return Math.max(minS, base * Math.pow(decay, n));
  }

  /* Item 6 — spotlight wave (data: tuning.spotlights).
     Trả về { mods: [ids] | "random2", event: id, elite_parade: true }
     (chỉ các field hợp lệ) hoặc null khi wave không có spotlight. */
  function spotlightFor(n) {
    var spots = TUNING.spotlights || {};
    var key = String(n);
    if (!Object.prototype.hasOwnProperty.call(spots, key)) return null;
    var s = spots[key] || {};
    var out = {};
    if (Array.isArray(s.mods)) {
      out.mods = s.mods.filter(function (x) { return typeof x === "string" && x.length > 0; });
      if (!out.mods.length) delete out.mods;
    } else if (s.mods === "random2") {
      out.mods = "random2";
    }
    if (typeof s.event === "string" && s.event.length > 0) out.event = s.event;
    if (s.elite_parade === true) out.elite_parade = true;
    if (!out.mods && !out.event && !out.elite_parade) return null;
    return out;
  }

  var api = {
    tuning: withAliases(TUNING),
    spawn: spawnCfg,
    physics: physicsCfg,
    bandForWave: bandForWave,
    spawnIntervalFloor: spawnIntervalFloor,
    capMult: capMult,
    spawnIntervalFor: spawnIntervalFor,
    spotlightFor: spotlightFor,
    reload: reloadConfig,
    ready: null
  };
  Object.defineProperty(api, "source", { get: function () { return configSource; }, enumerable: true });

  var configReady = (typeof Promise !== "undefined") ? reloadConfig() : null;
  api.ready = configReady;

  try {
    if (typeof window !== "undefined") window.WK_TUNING = api;
    else if (typeof globalThis !== "undefined") globalThis.WK_TUNING = api;
  } catch (e) { /* sandbox lạ — bỏ qua */ }
})();
