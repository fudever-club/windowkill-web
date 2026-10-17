/* =====================================================================
   WINDOWKILL v2.0 — integration glue (coordinator).
   Nối các module mới (monsters/bosses/tutorial/meta/juice2/i18n)
   vào engine game.js. Load TRƯỚC js/game.js (defer, đúng thứ tự).
   Mọi hàm đều guard try/catch — module nào thiếu thì game chạy như cũ.
   ===================================================================== */
(function () {
  "use strict";

  function safe(fn) { try { return fn(); } catch (e) { return undefined; } }
  function Q() {
    try { return new URLSearchParams(location.search); }
    catch (e) { return { get: function () { return null; } }; }
  }
  // Map quái mới (chưa có trong engine cũ) → loại tương đương — XÓA (RFC ui-audit-boss-cleanup):
  // ADD_MAP chỉ phục vụ campaign stageWave/startStageBoss, không còn caller.

  var V2 = {
    stageId: 0,          // DEPRECATED (RFC ui-audit-boss-cleanup): campaign đã xóa, luôn 0 = endless
    mode: null,          // RFC stage-themes-modes §2.3: ?mode=timeattack|bossrush (whitelist)
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
      /* RFC ui-audit-boss-cleanup §3: campaign đã xóa — boot chỉ đọc ?mode=
         whitelist (timeattack|bossrush). ?stage=/?endless=/?daily= bị bỏ qua,
         game vào endless. Sai → null, endless. */
      var modeQ = q.get("mode");
      this.mode = (modeQ === "timeattack" || modeQ === "bossrush") ? modeQ : null;
      safe(function () { if (window.Modes) window.Modes.init(self.mode); });
      /* RFC stage-themes-modes §2.3.2: boss rush — spawn boss_1 ngay khi vào game */
      safe(function () {
        if (self.mode === "bossrush" && window.Modes && window.Modes.startBossRush) window.Modes.startBossRush();
      });

      safe(function () { self.runMods = (window.Meta) ? Meta.getRunModifiers() : null; });
      safe(function () { if (window.Meta) Meta.check("runStart", { stage: self.stageId, diff: opts.diffKey }); });
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
      // FIX 2026-10-03: Juice2.update PHẢI chạy mỗi frame — decay G.flash/flashRed,
      // rings, multikill, near-death, gameover cine. Thiếu nó, flash trắng từ
      // onLevelUp/onKill/onNuke kẹt vĩnh viễn → cả màn hình phủ xám (bug user báo).
      safe(function () { if (window.Juice2) Juice2.update(dt); });
      // Boss module (Boss Rush) update
      safe(function () {
        if (V2.bossActive && window.Bosses && window.G) Bosses.update(dt, window.G);
      });
      // Tutorial nhịp chill được xử lý trong game.js qua tutActive()
    },
    drawOver: function (ctx, W, H) {
      safe(function () { if (window.Juice2) Juice2.drawOverlays(ctx, W, H); });
      safe(function () { if (V2.bossActive && window.Bosses && window.G) Bosses.draw(ctx, window.G); });
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
    },
    onBossKill: function () {
      // AUDIT 2026-10-02: truyền winPct — thiếu thì thành tựu "hạ boss khi cửa sổ
      // còn < 15%" không bao giờ mở được.
      safe(function () { if (window.Meta) Meta.check("bossKill", { stage: V2.stageId, wave: window.G ? window.G.wave : 0, winPct: (typeof window.WKWinPct === "function") ? window.WKWinPct() : undefined }); });
      safe(function () { if (window.Tutorial) Tutorial.onEvent("bossKill", {}); });
    },
    onLevelUp: function (x, y, level) {
      /* FIX 2026-10-04 "LÊN CẤP undefined!": trước đây làm rơi tham số level
         khi forward sang Juice2 → fallback string nối "undefined". */
      safe(function () { if (window.Juice2) Juice2.onLevelUp(x, y, level); });
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
        }
      });
      safe(function () { if (window.Tutorial) Tutorial.onEvent("death", {}); });
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
