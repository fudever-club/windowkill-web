/* =====================================================================
   WINDOWKILL — Campaign / Stage Framework (FU-DEVER Game Studio)
   Design source: studio/game-design/GAME-DESIGN-DOC.md v2.0 (§2,§3,§4,§8,§12.1,§15, Phụ lục A)

   - IIFE, không đụng vào file có sẵn nào (game.js, menu.js...).
   - Không phụ thuộc popup thật — chạy được trong iframe (portal mode).
   - Mọi số cân bằng đọc từ difficulty.config.json (fetch + fallback embed).
   - Chuỗi UI mới đi qua I18N.t('campaign.<key>') khi coordinator cung cấp I18N;
     fallback là copy tiếng Việt chuẩn §12.1.
   - Boss/mini-boss dùng id đặc biệt 'boss_N' / 'mini_boss_N' — module boss P1
     resolve thành entity thật (HP ≈ DPS_kỳ_vọng × 150s, §5).
   ===================================================================== */
(function () {
  "use strict";

  /* ---------------- I18N ---------------- */
  function _t(key, fallback) {
    try {
      if (typeof I18N !== "undefined" && I18N && typeof I18N.t === "function") {
        var v = I18N.t("campaign." + key);
        // I18N.t trả về key thô khi thiếu bản dịch — không được trả key thô ra UI
        if (typeof v === "string" && v && v !== "campaign." + key) return v;
      }
    } catch (e) { /* I18N chưa có — dùng fallback */ }
    return fallback;
  }
  function _fmt(s, vars) {
    return String(s).replace(/\{(\w+)\}/g, function (_, k) {
      return (vars && vars[k] != null) ? vars[k] : "{" + k + "}";
    });
  }
  /* Tên ải theo ngôn ngữ hiện tại (mặc định VI) */
  function stageName(st) {
    try {
      if (typeof I18N !== "undefined" && I18N && typeof I18N.getLang === "function" &&
          I18N.getLang() === "en" && st.nameEn) return st.nameEn;
    } catch (e) {}
    return st.nameVi;
  }

  /* ---------------- Difficulty config: embed + fetch override ----------------
     EMBEDDED_DIFFICULTY là bản copy nguyên văn difficulty.config.json (v2.0.0).
     Khi tune balance: sửa difficulty.config.json TRƯỚC, rồi sync lại block này. */
  var EMBEDDED_DIFFICULTY = {
    version: "2.0.0",
    source: "studio/game-design/GAME-DESIGN-DOC.md §8",
    difficulties: {
      chill:    { label: "Chill", monster_hp_mult: 0.55, monster_speed_mult: 0.75, ship_hp: 4, chew_dps_mult: 0.55, score_mult: 0.8, spawn_count_mult: 0.8, spawn_count_min: 1, boss_hp_mult: 0.65, telegraph_mult: 1.4, window_lose_threshold_pct: 50, wave_repair_px: 50, wave_heal: { amount: 1, every_n_waves: 1 }, gem_drop_mult: 1.4, blackout: { dark_s: 4, cycle_s: 22 }, shrink: { px_per_10s: 5 }, spikes: { on_s: 3, off_s: 3 }, boss5_p3_countdown_s: 25 },
      normal:   { label: "Thường", monster_hp_mult: 1.0, monster_speed_mult: 1.0, ship_hp: 3, chew_dps_mult: 1.0, score_mult: 1.0, spawn_count_mult: 1.0, spawn_count_min: 1, boss_hp_mult: 1.0, telegraph_mult: 1.0, window_lose_threshold_pct: 65, wave_repair_px: 40, wave_heal: { amount: 1, every_n_waves: 1 }, gem_drop_mult: 1.0, blackout: { dark_s: 6, cycle_s: 20 }, shrink: { px_per_10s: 8 }, spikes: { on_s: 4, off_s: 2 }, boss5_p3_countdown_s: 20 },
      hardcore: { label: "Khắc nghiệt", monster_hp_mult: 1.45, monster_speed_mult: 1.15, ship_hp: 2, chew_dps_mult: 1.25, score_mult: 1.6, spawn_count_mult: 1.25, spawn_count_min: 1, boss_hp_mult: 1.35, telegraph_mult: 0.75, window_lose_threshold_pct: 75, wave_repair_px: 30, wave_heal: { amount: 1, every_n_waves: 2 }, gem_drop_mult: 0.85, blackout: { dark_s: 8, cycle_s: 18 }, shrink: { px_per_10s: 12 }, spikes: { on_s: 5, off_s: 1.5 }, boss5_p3_countdown_s: 16 }
    },
    campaign: {
      stages: 5, waves_per_stage: 10, stage_time_target_min: [14, 18],
      spawn: { batch_size: 12, batch_refill_threshold: 4, interval_s: 2.0, max_entities: 120 },
      wave_clear: { boss_kill_repair_pct: 1.0, boss_kill_full_heal: true, miniboss_repair_bonus_px: 20 },
      miniboss: { hp_mult: 8, scale: 2.5, gem_reward: 20 },
      boss: { phase_thresholds: [0.66, 0.33] }
    },
    endless: {
      waves: {
        "1":  { hp_mult: 0.75, speed_mult: 0.85, count: 7,  spawn_interval_s: 2.5,  chew_dps: 8,  boss: null },
        "2":  { hp_mult: 0.85, speed_mult: 0.90, count: 10, spawn_interval_s: 2.2,  chew_dps: 9,  boss: null },
        "3":  { hp_mult: 1.00, speed_mult: 0.95, count: 13, spawn_interval_s: 2.0,  chew_dps: 10, boss: null },
        "4":  { hp_mult: 1.10, speed_mult: 1.00, count: 16, spawn_interval_s: 1.8,  chew_dps: 11, boss: null },
        "5":  { hp_mult: 1.15, speed_mult: 1.00, count: 19, spawn_interval_s: 1.7,  chew_dps: 12, boss: "boss1" },
        "6":  { hp_mult: 1.30, speed_mult: 1.05, count: 22, spawn_interval_s: 1.6,  chew_dps: 13, boss: null },
        "7":  { hp_mult: 1.45, speed_mult: 1.10, count: 25, spawn_interval_s: 1.45, chew_dps: 14, boss: null },
        "8":  { hp_mult: 1.60, speed_mult: 1.15, count: 28, spawn_interval_s: 1.30, chew_dps: 15, boss: null, interpolated: true },
        "9":  { hp_mult: 1.75, speed_mult: 1.175, count: 31, spawn_interval_s: 1.20, chew_dps: 16.5, boss: null, interpolated: true },
        "10": { hp_mult: 1.90, speed_mult: 1.20, count: 34, spawn_interval_s: 1.10, chew_dps: 18, boss: "boss2" }
      },
      formulas_11plus: { count: "34 + 3*(n-10)", spawn_interval_s: "max(1.10 - 0.05*(n-10), 0.60)", chew_dps: "18 + 1.2*(n-10)", hp_mult: "1.90 * 1.12^(n-10)", speed_mult: "min(1.20 + 0.03*(n-10), 1.65)" },
      boss: { every_n_waves: 5, hp_mult_per_boss_met: 0.25, keep_pattern: true },
      loop: { loop_stages: [1, 2, 3, 4, 5], hp_growth_per_loop: 1.25, dmg_growth_per_loop: 1.15, stacking: "additive", full_repair_on_loop_restart: true, milestone_banners: { "5": "Vùng ven", "10": "Tâm bão", "15": "Lõi hệ thống", "20": "Vực sâu", "25": "Vô định" } }
    }
  };

  var DIFFICULTY = JSON.parse(JSON.stringify(EMBEDDED_DIFFICULTY));
  var configSource = "embedded";

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

  /* Thử tải difficulty.config.json (async). Không block game boot vì đã có embed.
     configReady resolve khi xong lần thử đầu (thành công hay không). */
  function candidateUrls() {
    var urls = ["difficulty.config.json"];
    try {
      if (typeof document !== "undefined" && document.currentScript && document.currentScript.src) {
        var base = document.currentScript.src.replace(/[^/]*$/, "");
        urls.push(base + "../difficulty.config.json");
      }
    } catch (e) {}
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
          if (!json || !json.difficulties || !json.endless) return attempt();
          deepMerge(DIFFICULTY, json);
          configSource = "file";
          return true;
        }, function () { return attempt(); });
      }, function () { return attempt(); });
    }
    return attempt();
  }
  var configReady = (typeof Promise !== "undefined") ? reloadConfig() : null;

  /* ---------------- STAGES (5 ải) — copy deck §12.1 nguyên văn ---------------- */
  /* Quy ước monster id: bestiary §6 (chaser, chewer, tank, dasher, splitter, mini,
     spitter, booster, bomber, freezer, warden, glimmer, phantom, broodmother).
     'boss_N' / 'mini_boss_N': id đặc biệt, module boss P1 resolve thành entity thật. */
  var STAGES = [
    {
      id: 1,
      nameVi: "MÀN HÌNH XANH",
      nameEn: "BLUE SCREEN",
      descVi: "Sân tập cho lính mới: quái chậm, cửa sổ rộng.",
      mechanicVi: "Quái tím xuất hiện từ wave 2.",
      palette: { bgGradient: ["#001133", "#0066CC"], gridColor: "#004C99", particleColor: "#66B2FF", particleType: "square" },
      mechanicFlags: { spikes: false, lowFriction: false, blackout: false, shrinkingArena: false },
      miniboss: { id: "mini_boss_1", nameVi: "Chewer Cổ Đại", base: "chewer" },
      boss: { id: "boss_1", nameVi: "GÃ GẶM KHỔNG LỒ" },
      waveTable: [
        [{ monster: "chaser", count: 5, scripted: true }],
        [{ monster: "chaser", count: 6 }, { monster: "chewer", count: 3 }, { monster: "glimmer", count: 1, debut: true, chance: 0.15 }],
        [{ monster: "chaser", count: 8 }],
        [{ monster: "chewer", count: 5 }, { monster: "chaser", count: 4 }],
        [{ monster: "mini_boss_1", count: 1 }, { monster: "chaser", count: 4 }],
        [{ monster: "chaser", count: 6 }, { monster: "spitter", count: 2, debut: true }],
        [{ monster: "dasher", count: 4, debut: true }, { monster: "chaser", count: 6 }, { monster: "spitter", count: 2 }],
        [{ monster: "splitter", count: 3, debut: true }, { monster: "chaser", count: 5 }],
        [{ monster: "chaser", count: 8 }, { monster: "dasher", count: 4 }, { monster: "chewer", count: 3 }, { monster: "spitter", count: 2 }],
        [{ monster: "boss_1", count: 1 }]
      ]
    },
    {
      id: 2,
      nameVi: "TƯỜNG LỬA",
      nameEn: "FIREWALL",
      descVi: "Viền cửa sổ mọc gai — chạm vào là đau.",
      mechanicVi: "Gai bật/tắt theo chu kỳ 6s. Đừng đứng sát viền.",
      palette: { bgGradient: ["#1A0D00", "#CC3300"], gridColor: "#FF7722", particleColor: "#FF7722", particleType: "ember" },
      mechanicFlags: { spikes: true, lowFriction: false, blackout: false, shrinkingArena: false },
      miniboss: { id: "mini_boss_2", nameVi: "Dasher Xuyên Gai", base: "dasher" },
      boss: { id: "boss_2", nameVi: "TƯỜNG LỬA SỐNG" },
      waveTable: [
        [{ monster: "chaser", count: 6 }],
        [{ monster: "chewer", count: 6 }, { monster: "chaser", count: 2 }],
        [{ monster: "chaser", count: 7 }, { monster: "bomber", count: 3, debut: true }],
        [{ monster: "dasher", count: 5 }, { monster: "chaser", count: 4 }],
        [{ monster: "mini_boss_2", count: 1 }, { monster: "bomber", count: 3 }],
        [{ monster: "chewer", count: 6 }, { monster: "chaser", count: 5 }, { monster: "bomber", count: 2 }],
        [{ monster: "splitter", count: 2 }, { monster: "chaser", count: 6 }, { monster: "bomber", count: 3 }],
        [{ monster: "tank", count: 1, debut: true }, { monster: "chaser", count: 6 }],
        [{ monster: "chaser", count: 10 }, { monster: "bomber", count: 5 }, { monster: "dasher", count: 4 }],
        [{ monster: "boss_2", count: 1 }]
      ]
    },
    {
      id: 3,
      nameVi: "TRỌNG LỰC 404",
      nameEn: "GRAVITY 404",
      descVi: "Mọi thứ trơn như băng, kể cả cú đẩy cửa sổ.",
      mechanicVi: "Thả phím tàu vẫn trôi — bay ngược để phanh.",
      palette: { bgGradient: ["#0D0221", "#3A0CA3"], gridColor: "#9D4EDD", particleColor: "#9D4EDD", particleType: "orbit" },
      mechanicFlags: { spikes: false, lowFriction: true, blackout: false, shrinkingArena: false },
      miniboss: { id: "mini_boss_3", nameVi: "Tank Từ Trường", base: "tank" },
      boss: { id: "boss_3", nameVi: "TRỌNG TÂM HỖN LOẠN" },
      waveTable: [
        [{ monster: "chaser", count: 5 }],
        [{ monster: "chaser", count: 6 }, { monster: "chewer", count: 3 }],
        [{ monster: "freezer", count: 4, debut: true }, { monster: "chaser", count: 5 }],
        [{ monster: "dasher", count: 6 }],
        [{ monster: "mini_boss_3", count: 1 }, { monster: "chaser", count: 4 }],
        [{ monster: "tank", count: 2 }, { monster: "chaser", count: 6 }, { monster: "freezer", count: 2 }, { monster: "deadline", count: 2, debut: true }],
        [{ monster: "dasher", count: 4 }, { monster: "freezer", count: 4 }, { monster: "chewer", count: 3 }],
        [{ monster: "splitter", count: 3 }, { monster: "chaser", count: 6 }],
        [{ monster: "dasher", count: 8 }, { monster: "chaser", count: 6 }, { monster: "freezer", count: 3 }],
        [{ monster: "boss_3", count: 1 }]
      ]
    },
    {
      id: 4,
      nameVi: "CÚP ĐIỆN",
      nameEn: "BLACKOUT",
      descVi: "Đèn tắt định kỳ, chỉ còn mắt đỏ của quái.",
      mechanicVi: "Nhìn mắt đỏ, nghe tiếng gầm để định vị.",
      palette: { bgGradient: ["#000000", "#0A0A1A"], gridColor: "#00E5FF", particleColor: "#00E5FF", particleType: "spark" },
      mechanicFlags: { spikes: false, lowFriction: false, blackout: true, shrinkingArena: false },
      miniboss: { id: "mini_boss_4", nameVi: "Splitter Nhiễu", base: "splitter" },
      boss: { id: "boss_4", nameVi: "MÀN ĐÊM VÔ TẬN" },
      waveTable: [
        [{ monster: "chaser", count: 6 }],
        [{ monster: "chewer", count: 5 }, { monster: "chaser", count: 4 }],
        [{ monster: "phantom", count: 4, debut: true }, { monster: "chaser", count: 5 }],
        [{ monster: "dasher", count: 6 }],
        [{ monster: "mini_boss_4", count: 1 }, { monster: "chaser", count: 3 }],
        [{ monster: "splitter", count: 3 }, { monster: "chaser", count: 5 }, { monster: "phantom", count: 3 }, { monster: "otworker", count: 2, debut: true }],
        [{ monster: "tank", count: 2 }, { monster: "spitter", count: 4 }, { monster: "chaser", count: 4 }],
        [{ monster: "chewer", count: 6 }, { monster: "chaser", count: 6 }],
        [{ monster: "phantom", count: 8 }, { monster: "dasher", count: 6 }, { monster: "bomber", count: 3 }, { monster: "deadline", count: 2 }],
        [{ monster: "boss_4", count: 1 }]
      ]
    },
    {
      id: 5,
      nameVi: "TRÀN BỘ NHỚ",
      nameEn: "MEMORY OVERFLOW",
      descVi: "Vùng an toàn thu hẹp dần. Quản lý 2 \"máu\" cùng lúc.",
      mechanicVi: "Nhặt patch xanh để nới vùng an toàn.",
      palette: { bgGradient: ["#0D1B00", "#2D6A00"], gridColor: "#3A6B1E", particleColor: "#8AFF5A", particleType: "hexrain" },
      mechanicFlags: { spikes: false, lowFriction: false, blackout: false, shrinkingArena: true },
      miniboss: { id: "mini_boss_5", nameVi: "Chewer Chúa Tể", base: "chewer" },
      boss: { id: "boss_5", nameVi: "NULL POINTER — KẺ XOÁ CỬA SỔ" },
      waveTable: [
        [{ monster: "chaser", count: 6 }],
        [{ monster: "chewer", count: 6 }, { monster: "chaser", count: 4 }],
        [{ monster: "bomber", count: 4 }, { monster: "chaser", count: 6 }],
        [{ monster: "tank", count: 2 }, { monster: "chaser", count: 6 }],
        [{ monster: "mini_boss_5", count: 1 }, { monster: "dasher", count: 4 }],
        [{ monster: "spitter", count: 4 }, { monster: "chaser", count: 6 }, { monster: "booster", count: 2, debut: true }],
        [{ monster: "dasher", count: 4 }, { monster: "phantom", count: 4 }, { monster: "chewer", count: 4 }, { monster: "warden", count: 1, debut: true }, { monster: "deadline", count: 2 }],
        [{ monster: "splitter", count: 3 }, { monster: "chaser", count: 8 }, { monster: "broodmother", count: 1, debut: true }, { monster: "meeting", count: 1, debut: true }],
        [{ monster: "chaser", count: 10 }, { monster: "tank", count: 4 }, { monster: "bomber", count: 4 }, { monster: "spitter", count: 2 }, { monster: "otworker", count: 2 }, { monster: "meeting", count: 1 }],
        [{ monster: "boss_5", count: 1 }]
      ]
    }
  ];

  /* ---------------- ENDLESS ---------------- */
  var ENDLESS = {
    loopStages: [1, 2, 3, 4, 5],
    hpGrowthPerLoop: 1.25,
    dmgGrowthPerLoop: 1.15,
    banners: ["Vùng ven", "Tâm bão", "Lõi hệ thống", "Vực sâu", "Vô định"]
  };

  /* ---------------- Difficulty helpers ---------------- */
  function normalizeDiffKey(k) {
    if (k === "chill" || k === "hardcore" || k === "hard") return k === "hard" ? "hardcore" : k;
    return "normal";
  }
  function diffOf(key) {
    return DIFFICULTY.difficulties[normalizeDiffKey(key)];
  }
  function isBossId(monster) {
    return monster === "boss_1" || monster === "boss_2" || monster === "boss_3" ||
           monster === "boss_4" || monster === "boss_5" ||
           monster === "mini_boss_1" || monster === "mini_boss_2" || monster === "mini_boss_3" ||
           monster === "mini_boss_4" || monster === "mini_boss_5";
  }

  /** Spec resolve id đặc biệt 'mini_boss_N' (campaign wave 5) thành entity thật.
      FIX C2b (2026-10-02): trước đây v2glue.stageWave fallback id này thành
      "chaser" nên mini-boss thiết kế không bao giờ xuất hiện.
      @returns null nếu id không phải mini-boss; ngược lại
      {id, base, nameVi, hpMult, scale, gemReward} — thông số từ
      DIFFICULTY.campaign.miniboss (§8.1: hp_mult 8, scale 2.5, gem_reward 20). */
  function getMinibossSpec(id) {
    if (typeof id !== "string") return null;
    for (var i = 0; i < STAGES.length; i++) {
      var m = STAGES[i].miniboss;
      if (m && m.id === id) {
        var mb = DIFFICULTY.campaign.miniboss;
        return {
          id: m.id, base: m.base, nameVi: m.nameVi,
          hpMult: mb.hp_mult, scale: mb.scale, gemReward: mb.gem_reward
        };
      }
    }
    return null;
  }

  /** Danh sách spawn của 1 wave trong campaign, đã áp modifier độ khó.
      @returns null nếu stageId/wave không hợp lệ; ngược lại mảng entry:
      {monster, count, hpMult, speedMult, spawnIntervalS, chewDpsMult, telegraphMult,
       isBoss, bossHpMult?, debut?, chance?, scripted?} */
  function getWaveComp(stageId, wave, diffKey) {
    var st = STAGES[stageId - 1];
    if (!st || wave < 1 || wave > 10) return null;
    var d = diffOf(diffKey);
    var spawnIntervalS = DIFFICULTY.campaign.spawn.interval_s;
    return st.waveTable[wave - 1].map(function (e) {
      var boss = isBossId(e.monster);
      var count = boss ? 1 : Math.max(d.spawn_count_min, Math.round(e.count * d.spawn_count_mult));
      var out = {
        monster: e.monster,
        count: count,
        hpMult: d.monster_hp_mult,
        speedMult: d.monster_speed_mult,
        spawnIntervalS: spawnIntervalS,
        chewDpsMult: d.chew_dps_mult,
        telegraphMult: d.telegraph_mult,
        isBoss: boss
      };
      if (boss) out.bossHpMult = d.boss_hp_mult;
      if (e.debut) out.debut = true;
      if (e.chance != null) out.chance = e.chance;
      if (e.scripted) out.scripted = true;
      return out;
    });
  }

  /** Thông số endless cho 1 wave (§8.1 + công thức wave 11+), đã áp modifier độ khó
      và tăng trưởng theo vòng.
      - 1 vòng = 50 wave (5 ải × 10 wave). Vòng sau LẶP LẠI bảng wave 1–50 với
        máu ×1.25^loop, sát thương ×1.15^loop (stack cộng dồn, §4).
      - Boss mỗi 5 wave (§2 R2), variant boss1/boss2 xen kẽ.
      Thành phần quái cụ thể vẫn do engine buildSpawnQueue(n) lo — hàm này chỉ
      cung cấp số scale + stage/palette/mechanic của block hiện tại. */
  function getEndlessWave(wave, diffKey) {
    if (!wave || wave < 1) return null;
    var d = diffOf(diffKey);
    var loop = Math.floor((wave - 1) / 50);
    var n = ((wave - 1) % 50) + 1; // vị trí trong vòng (1..50)
    var stageIdx = Math.floor((n - 1) / 10); // block 10 wave → 1 ải
    var stageId = ENDLESS.loopStages[stageIdx];
    var st = STAGES[stageId - 1];
    var hpGrowth = Math.pow(ENDLESS.hpGrowthPerLoop, loop);
    var dmgGrowth = Math.pow(ENDLESS.dmgGrowthPerLoop, loop);

    var base;
    if (n <= 10) {
      base = DIFFICULTY.endless.waves[String(n)];
    } else {
      var k = n - 10;
      base = {
        hp_mult: 1.90 * Math.pow(1.12, k),
        speed_mult: Math.min(1.20 + 0.03 * k, 1.65),
        count: 34 + 3 * k,
        spawn_interval_s: Math.max(1.10 - 0.05 * k, 0.60),
        chew_dps: 18 + 1.2 * k,
        boss: (n % 5 === 0) ? (((n / 5) % 2 === 1) ? "boss1" : "boss2") : null
      };
    }

    var boss = null;
    if (base.boss) {
      var met = Math.floor((wave - 1) / 5); // số boss đã gặp trước wave này
      boss = {
        variant: base.boss,
        hpMult: d.boss_hp_mult * (1 + DIFFICULTY.endless.boss.hp_mult_per_boss_met * met),
        keepPattern: DIFFICULTY.endless.boss.keep_pattern
      };
    }

    var milestone = null;
    var mb = DIFFICULTY.endless.loop.milestone_banners;
    if (wave >= 25) milestone = _t("endless_banner_4", mb["25"]);
    else if (mb[String(wave)]) {
      var idx = { "5": 0, "10": 1, "15": 2, "20": 3 }[String(wave)];
      milestone = _t("endless_banner_" + idx, mb[String(wave)]);
    }

    return {
      wave: wave,
      loop: loop,
      stageId: stageId,
      palette: st.palette,
      mechanicFlags: st.mechanicFlags,
      hpMult: base.hp_mult * d.monster_hp_mult * hpGrowth,
      dmgMult: dmgGrowth, // sát thương quái tăng theo vòng (stack cộng dồn)
      speedMult: Math.min(base.speed_mult * d.monster_speed_mult, 1.65),
      count: Math.max(d.spawn_count_min, Math.round(base.count * d.spawn_count_mult)),
      spawnIntervalS: base.spawn_interval_s,
      chewDps: base.chew_dps * d.chew_dps_mult,
      telegraphMult: d.telegraph_mult,
      boss: boss,
      milestoneBanner: milestone
    };
  }

  /** Tham số run theo độ khó (§8.2) — game.js dùng khi startStage. */
  function getRunParams(diffKey) {
    var d = diffOf(diffKey);
    return {
      diffKey: normalizeDiffKey(diffKey),
      diffLabel: d.label,
      monsterHpMult: d.monster_hp_mult,
      monsterSpeedMult: d.monster_speed_mult,
      shipHp: d.ship_hp,
      chewDpsMult: d.chew_dps_mult,
      scoreMult: d.score_mult,
      bossHpMult: d.boss_hp_mult,
      telegraphMult: d.telegraph_mult,
      windowLoseThresholdPct: d.window_lose_threshold_pct,
      waveRepairPx: d.wave_repair_px,
      waveHeal: { amount: d.wave_heal.amount, everyNWaves: d.wave_heal.every_n_waves },
      gemDropMult: d.gem_drop_mult,
      spawnCountMult: d.spawn_count_mult
    };
  }

  /** Mechanic đặc trưng của ải, đã áp modifier độ khó (§4 + §8.2). */
  function getStageMechanic(stageId, diffKey) {
    var st = STAGES[stageId - 1];
    if (!st) return null;
    var d = diffOf(diffKey);
    var out = { stageId: stageId, flags: Object.assign({}, st.mechanicFlags) };
    if (st.mechanicFlags.spikes) out.spikes = { onS: d.spikes.on_s, offS: d.spikes.off_s };
    if (st.mechanicFlags.lowFriction) out.lowFriction = { friction: 0.985 }; // §4 ải 3
    if (st.mechanicFlags.blackout) out.blackout = { darkS: d.blackout.dark_s, cycleS: d.blackout.cycle_s };
    if (st.mechanicFlags.shrinkingArena) out.shrinkingArena = { pxPer10s: d.shrink.px_per_10s };
    if (stageId === 5) out.boss5P3CountdownS = d.boss5_p3_countdown_s;
    return out;
  }

  /** Banner boss theo §12.2 (qua I18N để coordinator dịch). */
  function getBossBanner(stageId) {
    var fallbacks = {
      1: { title: "⚠ BOSS: GÃ GẶM KHỔNG LỒ", sub: "Nó nện cửa sổ — giữ 🪟 sống sót!" },
      2: { title: "⚠ BOSS: TƯỜNG LỬA SỐNG", sub: "Gai tắt 2.5s sau mỗi đợt quét — áp sát!" },
      3: { title: "⚠ BOSS: TRỌNG TÂM HỖN LOẠN", sub: "Ngừng bắn lúc hút — dồn đạn lúc quá tải!" },
      4: { title: "⚠ BOSS: MÀN ĐÊM VÔ TẬN", sub: "Bắn vào con ngươi lúc nó sáng rực!" },
      5: { title: "⚠ BOSS CUỐI: NULL POINTER", sub: "20 giây. Giết nó trước khi cửa sổ về 0!" }
    };
    var fb = fallbacks[stageId];
    if (!fb) return null;
    return {
      title: _t("boss_banner_title_" + stageId, fb.title),
      sub: _t("boss_banner_sub_" + stageId, fb.sub)
    };
  }

  /* ---------------- Persistence (localStorage, an toàn trong iframe) ---------------- */
  function lsGet(k) {
    try { return (typeof localStorage !== "undefined") ? localStorage.getItem(k) : null; }
    catch (e) { return null; }
  }
  function lsSet(k, v) {
    try {
      if (typeof localStorage !== "undefined") { localStorage.setItem(k, v); return true; }
    } catch (e) {}
    return false;
  }
  function kUnlocked(pid) { return "wk_unlocked_stage_" + pid; }
  function kBest(pid) { return "wk_stage_best_" + pid; }
  function kEndless(pid) { return "wk_unlocked_endless_" + pid; }

  var _profileId = null;
  function profileId() {
    if (_profileId) return _profileId;
    try {
      if (typeof window !== "undefined" && window.location && window.location.search) {
        var m = /[?&]profile=([^&]+)/.exec(window.location.search);
        if (m) return decodeURIComponent(m[1]);
      }
    } catch (e) {}
    return "default";
  }

  function getUnlockedStage(pid) {
    pid = pid || profileId();
    var v = parseInt(lsGet(kUnlocked(pid)), 10);
    if (!(v >= 1 && v <= 5)) return 1;
    return v;
  }
  function setUnlockedStage(pid, stage) {
    pid = pid || profileId();
    var next = Math.max(getUnlockedStage(pid), Math.min(5, Math.max(1, stage | 0)));
    lsSet(kUnlocked(pid), String(next));
    return next;
  }
  function getStageBest(pid) {
    pid = pid || profileId();
    try {
      var o = JSON.parse(lsGet(kBest(pid)) || "{}");
      return (o && typeof o === "object") ? o : {};
    } catch (e) { return {}; }
  }
  function setStageBest(pid, stage, rec) {
    pid = pid || profileId();
    var best = getStageBest(pid);
    var cur = best[String(stage)] || { score: 0, wave: 0 };
    var score = Math.max(cur.score | 0, (rec && rec.score | 0) || 0);
    var wave = Math.max(cur.wave | 0, (rec && rec.wave | 0) || 0);
    best[String(stage)] = { score: score, wave: wave };
    lsSet(kBest(pid), JSON.stringify(best));
    return best[String(stage)];
  }
  function isEndlessUnlocked(pid) {
    pid = pid || profileId();
    return lsGet(kEndless(pid)) === "1";
  }
  function unlockEndless(pid) {
    pid = pid || profileId();
    lsSet(kEndless(pid), "1");
    return true;
  }

  /* ---------------- Run hooks cho game.js ---------------- */
  var run = null; // {mode:'campaign'|'endless', stageId, wave, diffKey, profileId}

  /** Bắt đầu 1 ải. Trả {ok, comp?, runParams?, mechanic?, reason?}. */
  function startStage(stageId, opts) {
    opts = opts || {};
    var pid = opts.profileId || profileId();
    var diffKey = normalizeDiffKey(opts.diffKey);
    if (!(stageId >= 1 && stageId <= 5)) return { ok: false, reason: "bad_stage" };
    if (stageId > getUnlockedStage(pid)) return { ok: false, reason: "locked" };
    run = { mode: "campaign", stageId: stageId, wave: 1, diffKey: diffKey, profileId: pid };
    return {
      ok: true,
      run: run,
      runParams: getRunParams(diffKey),
      mechanic: getStageMechanic(stageId, diffKey),
      comp: getWaveComp(stageId, 1, diffKey),
      stage: STAGES[stageId - 1]
    };
  }

  /** Bắt đầu endless (yêu cầu đã phá đảo ải 5). */
  function startEndless(opts) {
    opts = opts || {};
    var pid = opts.profileId || profileId();
    var diffKey = normalizeDiffKey(opts.diffKey);
    if (!isEndlessUnlocked(pid)) return { ok: false, reason: "locked" };
    run = { mode: "endless", stageId: 1, wave: 1, diffKey: diffKey, profileId: pid };
    return { ok: true, run: run, runParams: getRunParams(diffKey), endless: getEndlessWave(1, diffKey) };
  }

  /** Gọi khi clear 1 wave campaign: cập nhật kỷ lục ải. */
  function onWaveClear(stageId, wave, score) {
    var pid = profileId();
    return setStageBest(pid, stageId, { score: score, wave: wave });
  }

  /** Gọi khi hạ boss cuối ải: mở ải tiếp theo (hoặc endless nếu ải 5). */
  function onBossKill(stageId, score) {
    var pid = profileId();
    setStageBest(pid, stageId, { score: score, wave: 10 });
    var out = { stageId: stageId, unlockedStage: getUnlockedStage(pid), endlessUnlocked: isEndlessUnlocked(pid), toast: null };
    if (stageId >= 5) {
      unlockEndless(pid);
      out.endlessUnlocked = true;
      out.toast = _t("endless_unlocked", "Đã mở CHẾ ĐỘ VÔ TẬN!");
    } else {
      out.unlockedStage = setUnlockedStage(pid, stageId + 1);
      out.toast = _fmt(_t("stage_unlocked", "Đã mở ải mới: {name}!"), { name: stageName(STAGES[stageId]) });
    }
    return out;
  }

  /* ---------------- Public API ---------------- */
  var Campaign = {
    version: "2.0.0",
    STAGES: STAGES,
    ENDLESS: ENDLESS,
    // difficulty
    getDifficulty: diffOf,
    normalizeDiffKey: normalizeDiffKey,
    getWaveComp: getWaveComp,
    isBossId: isBossId, // FIX C2b: v2glue cần để không fallback mini_boss_N → chaser
    getMinibossSpec: getMinibossSpec, // FIX C2b: engine resolve mini-boss entity thật
    getEndlessWave: getEndlessWave,
    getRunParams: getRunParams,
    getStageMechanic: getStageMechanic,
    getBossBanner: getBossBanner,
    // persistence
    profileId: profileId,
    setProfile: function (id) { _profileId = id || null; },
    getUnlockedStage: getUnlockedStage,
    setUnlockedStage: setUnlockedStage,
    getStageBest: getStageBest,
    setStageBest: setStageBest,
    isEndlessUnlocked: isEndlessUnlocked,
    unlockEndless: unlockEndless,
    // run hooks
    startStage: startStage,
    startEndless: startEndless,
    onWaveClear: onWaveClear,
    onBossKill: onBossKill,
    getRun: function () { return run; },
    // i18n
    t: _t,
    // config
    reloadConfig: reloadConfig,
    configReady: configReady,
    get configSource() { return configSource; },
    get _config() { return DIFFICULTY; }
  };

  if (typeof window !== "undefined") {
    window.Campaign = Campaign;
    /* Alias tương thích: code/test cũ dùng ACTS (3 act). Test mới nên dùng
       Campaign.STAGES (5 stage) — xem INTEGRATION.md. */
    window.ACTS = STAGES;
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = Campaign; // cho node test
  }
})();
