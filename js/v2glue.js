/* =====================================================================
   WINDOWKILL v2.0 — integration glue (coordinator).
   Nối các module mới (campaign/monsters/bosses/tutorial/meta/juice2/i18n)
   vào engine game.js. Load TRƯỚC js/game.js (defer, đúng thứ tự).
   Mọi hàm đều guard try/catch — module nào thiếu thì game chạy như cũ.
   ===================================================================== */
(function () {
  "use strict";

  function safe(fn) { try { return fn(); } catch (e) { return undefined; } }
  function T(key, vars) {
    try {
      if (window.I18N && typeof I18N.t === "function") {
        var v = I18N.t(key, vars);
        // AUDIT 2026-10-02: I18N.t trả về chính key khi thiếu bản dịch (truthy) —
        // phải coi là "không có" (trả "") để các fallback `||` phía sau còn chạy,
        // tránh lộ raw key ra banner (meta.daily_banner, campaign.stage_clear).
        return (typeof v === "string" && v !== key) ? v : "";
      }
    } catch (e) {}
    return "";
  }
  function Q() {
    try { return new URLSearchParams(location.search); }
    catch (e) { return { get: function () { return null; } }; }
  }
  // Map quái mới (chưa có trong engine cũ) → loại tương đương khi boss gọi đàn em
  var ADD_MAP = { bomber: "dasher", phantom: "chaser", broodmother: "splitter", spitter: "spitter", booster: "tank", freezer: "tank", warden: "tank", glimmer: "chaser" };

  var V2 = {
    stageId: 0,          // ?stage=1..5 (campaign mode) | 0 = endless cũ
    endless: false,      // ?endless=1
    daily: false,        // ?daily=1
    stageDone: false,    // đã hạ boss ải → các wave sau chạy endless thường
    runMods: null,       // Meta.getRunModifiers() — áp vào newShip
    bossActive: false,   // Bosses module đang điều khiển boss

    /* ---- preboot (F-02): game.js gọi TRƯỚC resetGame() đầu tiên — chỉ gán
       runMods từ Meta để newShip() của run đầu tiên cũng hưởng Xưởng. Phần
       banner/tutorial vẫn ở boot() sau reset như fix M21. ---- */
    preboot: function () {
      var self = this;
      safe(function () { self.runMods = (window.Meta) ? Meta.getRunModifiers() : null; });
    },

    /* ---- boot: gọi 1 lần từ game.js sau resetGame() ---- */
    boot: function (opts) {
      opts = opts || {};
      var q = Q(), self = this;
      this.diffKey = opts.diffKey || "normal";
      this.profileId = opts.profileId || null;
      var st = parseInt(q.get("stage") || "0", 10);
      if (st >= 1 && st <= 5 && window.Campaign) {
        this.stageId = st;
        // AUDIT 2026-10-02: trước đây boot nhận ?stage= bất kể khóa — mở thẳng
        // game.html?stage=5 là chơi được ải chưa mở. Kẹp về ải cao nhất đã mở.
        safe(function () {
          var un = Campaign.getUnlockedStage(self.profileId);
          if (self.stageId > un) self.stageId = un;
        });
      }
      if (q.get("endless") === "1" && window.Campaign) this.endless = true;
      if (q.get("daily") === "1" && window.Meta) this.daily = true;

      safe(function () { self.runMods = (window.Meta) ? Meta.getRunModifiers() : null; });
      safe(function () { if (window.Meta) Meta.check("runStart", { stage: self.stageId, diff: opts.diffKey }); });
      // Daily: seed modifier hiển thị qua banner (điểm ×1.1^n tính lúc submit)
      safe(function () {
        if (self.daily && window.Meta) {
          var d = Meta.getDaily();
          if (d && d.modifiers && d.modifiers.length && window.WKSetBanner) {
            // AUDIT 2026-10-02: truyền TÊN modifier theo ngôn ngữ (trước đây truyền cả
            // object → banner ra "[object Object]"/raw key).
            var en = (window.I18N && I18N.getLang && I18N.getLang() === "en");
            var nm = function (m) { return m ? ((en && m.nameEn) ? m.nameEn : (m.nameVi || m.id || "")) : ""; };
            window.WKSetBanner(T("meta.daily_banner", { m1: nm(d.modifiers[0]), m2: nm(d.modifiers[1]) }) || ("DAILY: " + d.modifiers.map(nm).join(" + ")), "");
          }
        }
      });
      // Tutorial: tự bật cho người mới (?tut=0 để tắt, ?tut=1 để ép chạy lại)
      safe(function () {
        if (!window.Tutorial) return;
        var force = q.get("tut") === "1";
        if (q.get("tut") === "0") return;
        var pid = opts.profileId || null;
        if (!force && Tutorial.isDone(pid)) return;
        // AUDIT 2026-10-02: truyền lang hiện tại — trước đây thiếu nên tutorial luôn
        // chạy tiếng Việt kể cả khi người chơi chọn EN (COPY của tutorial có đủ EN).
        Tutorial.start({ profileId: pid, lang: (window.I18N && I18N.getLang) ? I18N.getLang() : "vi" });
      });
      // Juice2: áp setting hiệu ứng từ ?fx=
      safe(function () {
        if (window.Juice2 && q.get("fx") === "reduced") Juice2.setQuality("reduced");
      });
    },

    /* ---- frame: gọi mỗi loop() ---- */
    hitstop: function (rawDt, dt) {
      var out = dt;
      safe(function () { if (window.Juice2) { var r = Juice2.updateHitstop(rawDt); if (r === 0) out = 0; } });
      return out;
    },
    frame: function (dt) {
      safe(function () { if (window.Tutorial) Tutorial.update(dt); });
      // Boss module + StageFX (chỉ khi stage mode)
      safe(function () {
        if (V2.bossActive && window.Bosses && window.G) Bosses.update(dt, window.G);
      });
      // AUDIT 2026-10-02: StageFX KHÔNG có activeModule() — glue cũ gọi qua ternary
      // guard nên luôn nhận null → module mechanic ải không bao giờ update (gai không
      // chu kỳ, cúp điện không tắt, arena không thu). API thật: StageFX.update(dt, G)
      // tự xử lý khi không có module active.
      safe(function () {
        if (V2.stageId && !V2.stageDone && window.StageFX && window.G) StageFX.update(dt, window.G);
      });
      // Tutorial nhịp chill được xử lý trong game.js qua tutActive()
    },
    drawOver: function (ctx, W, H) {
      safe(function () { if (window.Juice2) Juice2.drawOverlays(ctx, W, H); });
      safe(function () { if (V2.bossActive && window.Bosses && window.G) Bosses.draw(ctx, window.G); });
      // AUDIT 2026-10-02: như frame() — vẽ qua API thật StageFX.draw(ctx, G).
      safe(function () {
        if (V2.stageId && !V2.stageDone && window.StageFX && window.G) StageFX.draw(ctx, window.G);
      });
      safe(function () { if (window.Tutorial) Tutorial.draw(ctx); });
    },

    /* ---- events từ game.js ---- */
    onKill: function (e) {
      safe(function () { if (window.Juice2) Juice2.onKill(e.x, e.y, e.r >= 23 ? "tank" : "normal"); });
      safe(function () { if (window.Meta) Meta.check("kill", { type: e.type }); });
      safe(function () { if (window.Tutorial) Tutorial.onEvent("kill", { type: e.type }); });
    },
    onBulletHit: function (e) {
      safe(function () { if (window.Tutorial) Tutorial.onEvent("bulletHit", { type: e.type }); });
    },
    onWaveClear: function (n) {
      safe(function () { if (window.Juice2) Juice2.onWaveClear(); });
      // AUDIT 2026-10-02: truyền difficulty — thiếu thì meta mặc định "normal" khiến
      // thành tựu theo độ khó (wave 3 Chill, wave 10 Thường, qua Khắc nghiệt) sai/không mở.
      safe(function () { if (window.Meta) Meta.check("waveClear", { wave: n, difficulty: V2.diffKey || "normal", windowDamagePx: window.G ? (window.G.windowDamagePx || 0) : 0 }); });
      safe(function () { if (window.Tutorial) Tutorial.onEvent("waveClear", { wave: n }); });
      safe(function () { if (window.Campaign && V2.stageId) Campaign.onWaveClear(V2.stageId, n); });
      // StageFX: thoát mechanic cũ (mechanic theo ải, không theo wave)
    },
    onBossKill: function () {
      // AUDIT 2026-10-02: truyền winPct — thiếu thì thành tựu "hạ boss khi cửa sổ
      // còn < 15%" không bao giờ mở được.
      safe(function () { if (window.Meta) Meta.check("bossKill", { stage: V2.stageId, wave: window.G ? window.G.wave : 0, winPct: (typeof window.WKWinPct === "function") ? window.WKWinPct() : undefined }); });
      safe(function () { if (window.Tutorial) Tutorial.onEvent("bossKill", {}); });
    },
    // Boss ải (module Bosses) chết → thưởng + mở ải kế
    onStageBossDead: function (b) {
      var self = this;
      safe(function () { if (window.Bosses) Bosses.stop(); });
      self.bossActive = false;
      safe(function () { if (window.StageFX) StageFX.exit(); }); // AUDIT 2026-10-02: API thật là exit() (exitAll không tồn tại → trước đây mechanic không bao giờ được thoát khi hạ boss)
      safe(function () { if (window.Meta) Meta.check("bossKill", { stage: self.stageId, winPct: (typeof window.WKWinPct === "function") ? window.WKWinPct() : undefined }); });
      var nx = self.stageId + 1;
      safe(function () {
        if (window.Campaign) {
          Campaign.onBossKill(self.stageId);
          if (nx <= 5) { try { window.WKSetBanner(T("campaign.stage_clear", { n: nx - 1 }) || ("Hoàn thành ải " + (nx - 1) + "!"), ""); } catch (e) {} }
        }
      });
      // M22: hạ boss ải 2/3/4 → mở nâng cấp độc quyền ải tương ứng vào draft pool
      safe(function () {
        if (window.Upgrades2 && window.G && window.G.ship) {
          var up = Upgrades2.unlockBossStage(self.stageId);
          if (up && typeof window.addFloat === "function")
            window.addFloat(window.G.ship.x, window.G.ship.y - 40, "Mở nâng cấp: " + (up.nameVi || up.id), "#9df3ff", true);
        }
      });
      self.stageDone = true; // các wave sau chạy endless thường
      safe(function () { if (window.Juice2 && window.G) Juice2.onBossKill(window.G.ship.x, window.G.ship.y); });
      self.onWaveClear(window.G ? window.G.wave : 10);
    },
    onLevelUp: function (x, y, level) {
      safe(function () { if (window.Juice2) Juice2.onLevelUp(x, y); });
      safe(function () { if (window.Meta) Meta.check("levelUp", { level: level }); });
    },
    onPickup: function (kind) {
      safe(function () { if (window.Meta) Meta.check("pickup", { kind: kind }); });
    },
    onNuke: function () {
      safe(function () { if (window.Juice2 && window.G && window.G.ship) Juice2.onNuke(window.G.ship.x, window.G.ship.y); });
    },
    onGameOver: function (reason) {
      var sc = 0, wv = 0, dur = 0;
      safe(function () { if (window.G) { sc = window.G.score | 0; wv = window.G.wave | 0; dur = Math.round(window.G.time || 0); } });
      safe(function () {
        if (window.Meta) {
          // AUDIT 2026-10-02: truyền difficulty + durationSec (thiếu → thành tựu
          // "run 15 phút" không bao giờ mở, thành tựu Thường+ lại mở được ở Chill).
          Meta.check("runEnd", { score: sc, wave: wv, reason: reason, difficulty: V2.diffKey || "normal", durationSec: dur });
          // rewardsForRun() TỰ cộng mảnh bên trong và trả {breakdown, total} —
          // trước đây có nhánh `if (rw > 0) Meta.addShards(rw)` là dead code
          // (object > 0 luôn false); "sửa" nó thành cộng rw.total sẽ thành cộng đôi.
          Meta.rewardsForRun({ waveCleared: wv, bossKilled: 0, score: sc });
          // AUDIT 2026-10-02: truyền điểm THÔ — Meta.submitScore tự nhân ×1.21
          // (2 modifier). Trước đây glue nhân 1.21 trước rồi meta nhân tiếp → ×1.4641.
          if (V2.daily) Meta.submitScore(sc, wv);
        }
      });
      safe(function () { if (window.Tutorial) Tutorial.onEvent("death", {}); });
    },

    /* ---- campaign stage mode ---- */
    // Trả về {queue:[type...], boss:bool} cho wave n, hoặc null (= chạy endless cũ)
    stageWave: function (n) {
      if (!this.stageId || this.stageDone || !window.Campaign) return null;
      try {
        if (n === 10) return { queue: [], boss: true };
        // AUDIT 2026-10-02: dùng độ khó người chơi đã chọn — trước đây hardcode
        // "normal" nên chọn Chill/Khắc nghiệt ở menu vào campaign vẫn là Normal.
        var comp = Campaign.getWaveComp(this.stageId, n, this.diffKey || "normal");
        if (!comp || !comp.length) return null;
        var q = [];
        comp.forEach(function (c) {
          // FIX C2b (2026-10-02): id boss đặc biệt (mini_boss_N/boss_N) KHÔNG
          // fallback thành "chaser" — giữ nguyên id để engine resolve thành
          // entity thật (mkEnemy → Campaign.getMinibossSpec). Trước đây mini-boss
          // wave 5 mọi ải luôn spawn thành chaser thường, bossHpMult cũng mất.
          var t = c.monster;
          var known = window.Monsters && Monsters.MONSTER_REGISTRY[t];
          var bossId = window.Campaign && Campaign.isBossId ? Campaign.isBossId(t) : false;
          if (!known && !bossId) t = ADD_MAP[t] || "chaser";
          for (var i = 0; i < (c.count || 1); i++) q.push(t);
        });
        return { queue: q, boss: false };
      } catch (e) { return null; }
    },
    startStageBoss: function (n) {
      var self = this, G = window.G;
      if (!window.Bosses || !G) return false;
      try {
        // AUDIT 2026-10-02: diff phải theo đúng contract của Bosses.resolveDiff
        // ({bossHpMul, telegraphMul, boss5Timer, enemySpdMul}) — trước đây glue
        // truyền {hpM, spM, bossHpMult, telegraphMult} nên KHÔNG key nào khớp,
        // Bosses luôn dùng DIFF_DEFAULTS (Normal) bất kể độ khó/run params.
        var diff = { bossHpMul: 1, telegraphMul: 1, enemySpdMul: 1 };
        try {
          if (window.Campaign) {
            // getRunParams chỉ nhận (diffKey) và trả monsterHpMult/monsterSpeedMult/
            // bossHpMult/telegraphMult — map sang tên field của Bosses ở đây.
            var rp = Campaign.getRunParams ? Campaign.getRunParams(this.diffKey || "normal") : null;
            if (rp) {
              diff.bossHpMul = rp.bossHpMult || 1;
              diff.telegraphMul = rp.telegraphMult || 1;
              diff.enemySpdMul = rp.monsterSpeedMult || 1;
            }
            var mech = Campaign.getStageMechanic ? Campaign.getStageMechanic(this.stageId, this.diffKey || "normal") : null;
            if (mech && mech.boss5P3CountdownS) diff.boss5Timer = mech.boss5P3CountdownS;
          }
        } catch (e) {}
        Bosses.setHooks({
          spawnEnemy: function (type, x, y) { try { window.WKSpawnEnemy(ADD_MAP[type] || type, x, y); } catch (e) {} },
          spawnPickup: function (kind, x, y) { try { window.WKSpawnPickup(kind, x, y); } catch (e) {} },
          spawnGems: function (cn, x, y) { try { window.WKSpawnGems(cn, x, y); } catch (e) {} },
          fireEB: function (x, y, vx, vy, o) { try { window.WKFireEB(x, y, vx, vy, o); } catch (e) {} },
          hurtShip: function (dmg, x, y) { try { window.WKHurtShip(dmg, x, y); } catch (e) {} },
          banner: function (t, s) { try { window.WKSetBanner(t, s); } catch (e) {} },
          onBossDead: function (b) { self.onStageBossDead(b); },
          onTimeout: function () { try { window.WKDie("window"); } catch (e) {} },
        });
        var b = Bosses.startBoss(this.stageId, diff, G);
        if (b) { this.bossActive = true; return true; }
      } catch (e) {}
      return false;
    },
    // Đạn ta trúng boss module → đi qua Bosses.hit (áp điểm yếu); true = đã xử lý
    hitBoss: function (bl) {
      if (!this.bossActive || !window.Bosses) return false;
      try {
        var b = Bosses.active;
        if (!b || b.dead || !window.G) return false;
        var dx = bl.x - b.x, dy = bl.y - b.y;
        if (dx * dx + dy * dy > (bl.r + b.r) * (bl.r + b.r)) return false;
        Bosses.hit(b, bl.dmg, bl.x, bl.y, window.G);
        return true;
      } catch (e) { return false; }
    },
    stageFxEnter: function () {
      if (!this.stageId || this.stageDone || !window.StageFX || !window.G) return;
      var self = this;
      safe(function () {
        // AUDIT 2026-10-02: truyền diff mechanic theo độ khó đã chọn — trước đây
        // truyền {} nên mọi độ khó đều dùng DIFF_DEFAULTS (thông số Thường).
        var diff = {};
        try {
          if (window.Campaign && Campaign.getStageMechanic) {
            var m = Campaign.getStageMechanic(self.stageId, self.diffKey || "normal");
            if (m) {
              if (m.spikes) { diff.spikesOn = m.spikes.onS; diff.spikesOff = m.spikes.offS; }
              if (m.blackout) { diff.blackoutDark = m.blackout.darkS; diff.blackoutCycle = m.blackout.cycleS; }
              if (m.shrinkingArena) diff.shrinkPx = m.shrinkingArena.pxPer10s;
              if (m.lowFriction) diff.friction = m.lowFriction.friction;
            }
          }
        } catch (e) {}
        StageFX.enter(self.stageId, window.G, diff);
      });
    },
    bossBar: function () {
      // Vẽ thanh boss 3 nấc (đè lên thanh boss cũ khi boss module active)
      if (!this.bossActive || !window.Bosses) return false;
      try {
        var d = Bosses.barData();
        if (!d || !window.WKDrawBossBar) return false;
        window.WKDrawBossBar(d);
        return true;
      } catch (e) { return false; }
    },
  };

  window.V2 = V2;
})();
