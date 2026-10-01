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
      if (window.I18N && typeof I18N.t === "function") return I18N.t(key, vars);
    } catch (e) {}
    return key;
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

    /* ---- boot: gọi 1 lần từ game.js sau resetGame() ---- */
    boot: function (opts) {
      opts = opts || {};
      var q = Q(), self = this;
      var st = parseInt(q.get("stage") || "0", 10);
      if (st >= 1 && st <= 5 && window.Campaign) this.stageId = st;
      if (q.get("endless") === "1" && window.Campaign) this.endless = true;
      if (q.get("daily") === "1" && window.Meta) this.daily = true;

      safe(function () { self.runMods = (window.Meta) ? Meta.getRunModifiers() : null; });
      safe(function () { if (window.Meta) Meta.check("runStart", { stage: self.stageId, diff: opts.diffKey }); });
      // Daily: seed modifier hiển thị qua banner (điểm ×1.1^n tính lúc submit)
      safe(function () {
        if (self.daily && window.Meta) {
          var d = Meta.getDaily();
          if (d && d.modifiers && d.modifiers.length && window.WKSetBanner) {
            window.WKSetBanner(T("meta.daily_banner", { m1: d.modifiers[0], m2: d.modifiers[1] }) || ("DAILY: " + d.modifiers.join(" + ")), "");
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
        Tutorial.start({ profileId: pid });
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
      safe(function () {
        if (V2.stageId && !V2.stageDone && window.StageFX && window.G) {
          var m = StageFX.activeModule ? StageFX.activeModule() : null;
          if (m && m.update) m.update(dt, window.G);
        }
      });
      // Tutorial nhịp chill được xử lý trong game.js qua tutActive()
    },
    drawOver: function (ctx, W, H) {
      safe(function () { if (window.Juice2) Juice2.drawOverlays(ctx, W, H); });
      safe(function () { if (V2.bossActive && window.Bosses && window.G) Bosses.draw(ctx, window.G); });
      safe(function () {
        if (V2.stageId && !V2.stageDone && window.StageFX && window.G) {
          var m = StageFX.activeModule ? StageFX.activeModule() : null;
          if (m && m.draw) m.draw(ctx, window.G);
        }
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
      safe(function () { if (window.Meta) Meta.check("waveClear", { wave: n, windowDamagePx: window.G ? (window.G.windowDamagePx || 0) : 0 }); });
      safe(function () { if (window.Tutorial) Tutorial.onEvent("waveClear", { wave: n }); });
      safe(function () { if (window.Campaign && V2.stageId) Campaign.onWaveClear(V2.stageId, n); });
      // StageFX: thoát mechanic cũ (mechanic theo ải, không theo wave)
    },
    onBossKill: function () {
      safe(function () { if (window.Meta) Meta.check("bossKill", { stage: V2.stageId, wave: window.G ? window.G.wave : 0 }); });
      safe(function () { if (window.Tutorial) Tutorial.onEvent("bossKill", {}); });
    },
    // Boss ải (module Bosses) chết → thưởng + mở ải kế
    onStageBossDead: function (b) {
      var self = this;
      safe(function () { if (window.Bosses) Bosses.stop(); });
      self.bossActive = false;
      safe(function () { if (window.StageFX) StageFX.exitAll ? StageFX.exitAll() : null; });
      safe(function () { if (window.Meta) Meta.check("bossKill", { stage: self.stageId }); });
      var nx = self.stageId + 1;
      safe(function () {
        if (window.Campaign) {
          Campaign.onBossKill(self.stageId);
          if (nx <= 5) { try { window.WKSetBanner(T("campaign.stage_clear", { n: nx - 1 }) || ("Hoàn thành ải " + (nx - 1) + "!"), ""); } catch (e) {} }
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
      var sc = 0, wv = 0;
      safe(function () { if (window.G) { sc = window.G.score | 0; wv = window.G.wave | 0; } });
      safe(function () {
        if (window.Meta) {
          Meta.check("runEnd", { score: sc, wave: wv, reason: reason });
          var rw = Meta.rewardsForRun({ waveCleared: wv, bossKilled: 0, score: sc });
          if (rw > 0) Meta.addShards(rw, "run");
          if (V2.daily) Meta.submitScore(Math.round(sc * 1.21), wv);
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
        var comp = Campaign.getWaveComp(this.stageId, n, "normal");
        if (!comp || !comp.length) return null;
        var q = [];
        comp.forEach(function (c) {
          var t = (window.Monsters && Monsters.MONSTER_REGISTRY[c.monster]) ? c.monster : (ADD_MAP[c.monster] || "chaser");
          for (var i = 0; i < (c.count || 1); i++) q.push(t);
        });
        return { queue: q, boss: false };
      } catch (e) { return null; }
    },
    startStageBoss: function (n) {
      var self = this, G = window.G;
      if (!window.Bosses || !G) return false;
      try {
        var diff = { hpM: 1, spM: 1, bossHpMult: 1, telegraphMult: 1 };
        try {
          if (window.Campaign) {
            var rp = Campaign.getRunParams ? Campaign.getRunParams(this.stageId, "normal") : null;
            if (rp) diff = { hpM: rp.hpM || 1, spM: rp.spM || 1, bossHpMult: rp.bossHpMult || 1, telegraphMult: rp.telegraphMult || 1 };
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
      safe(function () { StageFX.enter(V2.stageId, window.G, {}); });
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
