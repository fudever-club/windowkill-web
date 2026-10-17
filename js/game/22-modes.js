/* =====================================================================
   MODES (RFC stage-themes-modes §2.3/§3.3) — 2 mode mới:
   - Time Attack "Chạy Deadline" (?mode=timeattack): 180s, spawn ×0.75, kỷ lục riêng.
   - Boss Rush "Xếp Hình Sếp" (?mode=bossrush): boss_1→5, nghỉ 5s + sửa 30% + +1HP.
   Quy tắc §6: KHÔNG nhân điểm ở bất kỳ mode nào (kill = điểm gốc, boss = 500).
   ===================================================================== */
/* i18n keys qua I18N.register() literal — KHÔNG thêm vào js/i18n.js (RFC §0/F12). */
if (typeof I18N !== "undefined" && I18N && typeof I18N.register === "function") I18N.register({
  vi: {
    "mode.ta.name": "Chạy Deadline",
    "mode.ta.desc": "180 giây farm điểm tốc độ cao — spawn dồn dập, hết giờ là chốt sổ!",
    "mode.ta.timeup_title": "HẾT GIỜ! ⏱",
    "mode.ta.hud": "⏱ {m}:{s}",
    "mode.ta.new_record": "KỶ LỤC MỚI! 🏆",
    "mode.br.name": "Xếp Hình Sếp",
    "mode.br.desc": "5 sếp liên tiếp! Hạ sếp → nghỉ 5s, sửa cửa sổ, hồi 1 HP.",
    "mode.br.banner": "XẾP HÌNH SẾP — 5 SẾP LIÊN TIẾP! 👔",
    "mode.br.rest_banner": "Nghỉ {s}s — sửa cửa sổ! 🔧",
    "mode.br.victory_title": "THẮNG BOSS RUSH! 🏆",
    "mode.br.best_line": "Kỷ lục: {t}s",
    "mode.br.progress": "SẾP {n}/5",
  },
  en: {
    "mode.ta.name": "Deadline Rush",
    "mode.ta.desc": "180 seconds of high-speed farming — dense spawns, time's up means score's locked!",
    "mode.ta.timeup_title": "TIME'S UP! ⏱",
    "mode.ta.hud": "⏱ {m}:{s}",
    "mode.ta.new_record": "NEW RECORD! 🏆",
    "mode.br.name": "Boss Parade",
    "mode.br.desc": "5 bosses in a row! Down a boss → 5s rest, window repair, +1 HP.",
    "mode.br.banner": "BOSS PARADE — 5 BOSSES IN A ROW! 👔",
    "mode.br.rest_banner": "Rest {s}s — repairing window! 🔧",
    "mode.br.victory_title": "BOSS RUSH CLEARED! 🏆",
    "mode.br.best_line": "Best: {t}s",
    "mode.br.progress": "BOSS {n}/5",
  },
});

window.Modes = {
  /* ---- helpers nội bộ ---- */
  _V2: function () {
    try { if (typeof V2 !== "undefined" && V2) return V2; } catch (e) {}
    try { if (typeof window !== "undefined" && window.V2) return window.V2; } catch (e2) {}
    return null;
  },
  _G: function () {
    try { if (typeof G !== "undefined" && G) return G; } catch (e) {}
    try { if (typeof window !== "undefined" && window.G) return window.G; } catch (e2) {}
    return null;
  },
  _diffKey: function () {
    var V2o = this._V2();
    if (V2o && V2o.diffKey) return V2o.diffKey;
    try { if (typeof DIFF_KEY !== "undefined" && DIFF_KEY) return DIFF_KEY; } catch (e) {}
    return "normal";
  },
  _profileId: function () {
    var V2o = this._V2();
    if (V2o && V2o.profileId) return V2o.profileId;
    try { if (typeof PROFILE_ID !== "undefined" && PROFILE_ID) return PROFILE_ID; } catch (e) {}
    return "default";
  },
  _t: function (k, fallback) {
    try {
      if (typeof I18N !== "undefined" && I18N && typeof I18N.t === "function") {
        var v = I18N.t(k);
        if (v && v !== k) return v;
      }
    } catch (e) {}
    return fallback;
  },
  /* Tôn trọng reduced-motion như các chỗ khác (17-render drawThemeBorder). */
  _reducedMotion: function () {
    try {
      if (typeof window !== "undefined" && window.matchMedia &&
          window.matchMedia("(prefers-reduced-motion: reduce)").matches) return true;
    } catch (e) {}
    return false;
  },

  /* ---- init(mode): gọi trong V2.boot() ---- */
  init: function (mode) {
    var V2o = this._V2();
    if (!V2o) return;
    if (mode === "timeattack") {
      V2o.mode = "timeattack";
      V2o.ta = { total: 180, left: 180, done: false };
    } else if (mode === "bossrush") {
      V2o.mode = "bossrush";
      V2o.br = { idx: 0, order: [1, 2, 3, 4, 5], restT: 0, won: false, t0: Date.now() };
    } else {
      V2o.mode = null;
    }
  },

  /* ---- tickTimer(dt): driver per-frame của Modes (gọi từ update()) ----
     Time Attack: trừ giờ CHỈ khi G.phase==="play" (F3).
     Boss Rush: đếm ngược restT giữa các boss; hết rest → boss kế. */
  tickTimer: function (dt) {
    var V2o = this._V2(), Go = this._G();
    if (!V2o || !Go) return;
    if (Go.phase !== "play") return;
    if (V2o.mode === "timeattack" && V2o.ta && !V2o.ta.done) {
      V2o.ta.left -= dt;
      /* RFC §2.3.1: <10s → tick sound mỗi giây (tái dùng AudioEngine.sfx.click) */
      var _secs = Math.max(0, Math.ceil(V2o.ta.left));
      if (V2o.ta.left < 10 && _secs !== V2o.ta.tickLast) {
        V2o.ta.tickLast = _secs;
        try { if (typeof AudioEngine !== "undefined" && AudioEngine && AudioEngine.sfx) AudioEngine.sfx.click(); } catch (e) {}
      }
      if (V2o.ta.left <= 0) { V2o.ta.left = 0; this.timeUp(); }
    } else if (V2o.mode === "bossrush" && V2o.br && V2o.br.restT > 0) {
      V2o.br.restT -= dt;
      if (V2o.br.restT <= 0) { V2o.br.restT = 0; this._nextBoss(); }
    }
  },

  /* ---- timeUp(): hết 180s (F4) — freeze, KHÔNG phải thua (không gọi die()) ---- */
  timeUp: function () {
    var V2o = this._V2(), Go = this._G();
    if (!V2o || !Go) return;
    if (V2o.ta) V2o.ta.done = true;
    Go.phase = "over"; // tận dụng guard sẵn có: quái/spawn ngừng; đè cả "draft"
    try { if (typeof Bosses !== "undefined" && Bosses && Bosses.stop) Bosses.stop(); } catch (e) {}
    Go.boss = null;
    // kỷ lục riêng (không đụng endless/campaign)
    var key = "wk_ta_high_" + this._diffKey() + "_" + this._profileId();
    var rec = { score: Go.score || 0, wave: Go.wave || 0, kills: Go.kills || 0,
      date: new Date().toISOString().slice(0, 10) };
    var isRecord = true;
    try {
      var prev = JSON.parse((typeof localStorage !== "undefined" && localStorage.getItem(key)) || "null");
      if (prev && (prev.score || 0) >= rec.score) isRecord = false;
    } catch (e2) {}
    if (isRecord) { try { localStorage.setItem(key, JSON.stringify(rec)); } catch (e3) {} }
    try {
      if (typeof showEndScreen === "function") showEndScreen({
        kind: "timeup",
        title: this._t("mode.ta.timeup_title", "HẾT GIỜ! ⏱"),
        lines: ["Điểm: " + rec.score, "Wave: " + rec.wave, "Hạ: " + rec.kills],
        recordLine: isRecord ? this._t("mode.ta.new_record", "KỶ LỤC MỚI! 🏆") : "",
      });
    } catch (e4) {}
    try { if (V2o.onGameOver) V2o.onGameOver("timeup"); } catch (e5) {}
  },

  /* ---- spawnScale(): hệ số nhịp spawn cho time attack (§2.3.1) ---- */
  spawnScale: function () {
    var V2o = this._V2();
    if (V2o && V2o.mode === "timeattack") return { intervalMul: 0.75, breakMul: 1.2 / 2.6 };
    return { intervalMul: 1, breakMul: 1 };
  },

  /* ---- blocksWaves(): boss rush — chặn wave quái thường (chỉ boss + adds theo def) ---- */
  blocksWaves: function () {
    var V2o = this._V2();
    return !!(V2o && V2o.mode === "bossrush");
  },

  /* ---- startBossRush(): dựng chuỗi boss_1..5 qua Bosses API ---- */
  startBossRush: function () {
    var V2o = this._V2();
    if (!V2o || !V2o.br) return;
    V2o.br.idx = 0;
    V2o.br.won = false;
    V2o.br.restT = 0;
    try { if (!V2o.br.t0) V2o.br.t0 = Date.now(); } catch (e) {}
    try {
      var msg = this._t("mode.br.banner", "XẾP HÌNH SẾP — 5 SẾP LIÊN TIẾP! 👔");
      if (typeof banner === "function") banner(msg, "");
      else if (typeof addFloat === "function") addFloat(400, 300, msg, "#ffd479", true);
    } catch (e2) {}
    this._startBoss(V2o.br.order[0]);
  },

  /* ---- _startBoss(n): spawn boss thứ n qua Bosses.startBoss + hooks ---- */
  _startBoss: function (n) {
    var V2o = this._V2(), Go = this._G();
    if (!V2o || !Go) return false;
    // RFC ui-audit-boss-cleanup §3.3: campaign đã xóa → diff mặc định;
    // boss_5 countdown 20s giữ nguyên (khớp campaign.boss_banner_sub_5 cũ "20 giây")
    var BOSS5_COUNTDOWN_S = 20;
    var diff = { bossHpMul: 1, telegraphMul: 1, enemySpdMul: 1 };
    if (n === 5) diff.boss5Timer = BOSS5_COUNTDOWN_S;
    var self = this;
    try {
      if (typeof Bosses === "undefined" || !Bosses || !Bosses.startBoss) return false;
      // Hooks — copy pattern V2.startStageBoss, onBossDead → Modes.onBossDown
      // (setHooks optional — test mock có thể không có)
      try {
        if (typeof Bosses.setHooks === "function") Bosses.setHooks({
          spawnEnemy: function (type, x, y) { try { window.WKSpawnEnemy(type, x, y); } catch (e2) {} },
          spawnPickup: function (kind, x, y) { try { window.WKSpawnPickup(kind, x, y); } catch (e2) {} },
          spawnGems: function (cn, x, y) { try { window.WKSpawnGems(cn, x, y); } catch (e2) {} },
          fireEB: function (x, y, vx, vy, o) { try { window.WKFireEB(x, y, vx, vy, o); } catch (e2) {} },
          hurtShip: function (dmg, x, y) { try { window.WKHurtShip(dmg, x, y); } catch (e2) {} },
          banner: function (t, s) { try { window.WKSetBanner(t, s); } catch (e2) {} },
          onBossDead: function (b) { self.onBossDown(b); },
          onTimeout: function () { try { window.WKDie("window"); } catch (e2) {} },
        });
      } catch (eHook) {}
      var b = Bosses.startBoss(n, diff, Go);
      if (b) { try { V2o.bossActive = true; } catch (e3) {} return true; }
    } catch (e4) {}
    return false;
  },

  /* ---- _nextBoss(): hết rest → boss kế ---- */
  _nextBoss: function () {
    var V2o = this._V2();
    if (!V2o || !V2o.br) return;
    V2o.br.idx++;
    if (V2o.br.idx < V2o.br.order.length) this._startBoss(V2o.br.order[V2o.br.idx]);
  },

  /* ---- onBossDown(b): hạ boss → dọn sân (F7) → rest 5s + sửa 30% (F5) + +1HP ---- */
  onBossDown: function (b) {
    var V2o = this._V2(), Go = this._G();
    if (!V2o || !V2o.br || !Go) return;
    // F7: dọn sạch đạn địch + adds còn lại TRƯỚC khi nghỉ
    Go.ebullets = [];
    Go.enemies = [];
    try { if (typeof Bosses !== "undefined" && Bosses && Bosses.stop) Bosses.stop(); } catch (e) {}
    Go.boss = null;
    var lastIdx = V2o.br.order.length - 1;
    if (V2o.br.idx >= lastIdx) { this.victory(); return; }
    V2o.br.restT = 5;
    // F5: sửa cửa sổ 30% phần đã mất — chỉ dùng growWindow() có sẵn (đã cap ở START)
    try {
      var SW = 980;
      try { if (typeof START_W !== "undefined" && START_W) SW = START_W; } catch (e2) {}
      var ow = 0;
      try { ow = (typeof window !== "undefined" && window.outerWidth) || 0; } catch (e3) {}
      var missing = Math.max(0, SW - ow);
      if (missing > 0 && typeof growWindow === "function") {
        var dw = Math.round(missing * 0.3);
        growWindow(dw, Math.round(dw * 0.75));
      }
    } catch (e4) {}
    // +1 HP (đầy → 200 điểm an ủi)
    try {
      var s = Go.ship;
      if (s) {
        if ((s.hp || 0) < (s.maxHp || 0)) s.hp = Math.min(s.maxHp, (s.hp || 0) + 1);
        else {
          Go.score = (Go.score || 0) + 200;
          if (typeof addFloat === "function") addFloat(s.x, s.y - 40, "+200", "#fde68a", true);
        }
      }
    } catch (e5) {}
    try {
      var msg = this._t("mode.br.rest_banner", "Nghỉ 5s — sửa cửa sổ! 🔧").replace("{s}", "5");
      if (typeof banner === "function") banner(msg, "");
    } catch (e6) {}
  },

  /* ---- victory(): hạ boss_5 → thắng ---- */
  victory: function () {
    var V2o = this._V2(), Go = this._G();
    if (!V2o || !V2o.br || !Go) return;
    V2o.br.won = true;
    Go.phase = "over";
    var timeSec = 0;
    try { timeSec = Math.round((Date.now() - (V2o.br.t0 || Date.now())) / 1000); } catch (e) {}
    // kỷ lục: thời gian NGẮN hơn là thắng (điểm là phụ)
    var key = "wk_br_best_" + this._diffKey() + "_" + this._profileId();
    var rec = { timeSec: timeSec, score: Go.score || 0, date: new Date().toISOString().slice(0, 10) };
    var isRecord = true;
    try {
      var prev = JSON.parse((typeof localStorage !== "undefined" && localStorage.getItem(key)) || "null");
      if (prev && (prev.timeSec || 0) <= rec.timeSec) isRecord = false;
    } catch (e2) {}
    if (isRecord) { try { localStorage.setItem(key, JSON.stringify(rec)); } catch (e3) {} }
    try {
      if (typeof showEndScreen === "function") showEndScreen({
        kind: "victory",
        title: this._t("mode.br.victory_title", "THẮNG BOSS RUSH! 🏆"),
        lines: ["Thời gian: " + timeSec + "s", "Điểm: " + rec.score],
        recordLine: isRecord ? this._t("mode.ta.new_record", "KỶ LỤC MỚI! 🏆") : "",
      });
    } catch (e4) {}
    try { if (V2o.onGameOver) V2o.onGameOver("victory"); } catch (e5) {}
  },

  /* ---- drawHUD(ctx, W): countdown / tiến trình boss (gọi từ 17-render HUD) ---- */
  drawHUD: function (ctx, W) {
    var V2o = this._V2();
    if (!V2o || !V2o.mode || !ctx) return;
    try {
      ctx.save();
      ctx.textAlign = "center";
      if (V2o.mode === "timeattack" && V2o.ta) {
        var left = Math.max(0, V2o.ta.left || 0);
        var m = Math.floor(left / 60), s = Math.floor(left % 60);
        var txt = this._t("mode.ta.hud", "⏱ {m}:{s}")
          .replace("{m}", "" + m).replace("{s}", (s < 10 ? "0" : "") + s);
        ctx.font = "bold 28px sans-serif";
        // <30s: đỏ + pulse (WOW lúc nước rút) — pulse TẮT khi reduced-motion
        var urgent = left < 30 && !V2o.ta.done;
        ctx.fillStyle = urgent ? "#ff3b30" : "#ffffff";
        if (urgent && !this._reducedMotion()) ctx.globalAlpha = 0.75 + 0.25 * Math.sin(Date.now() / 150);
        ctx.fillText(txt, W / 2, 38);
      } else if (V2o.mode === "bossrush" && V2o.br) {
        ctx.font = "bold 22px sans-serif";
        ctx.fillStyle = "#ffd479";
        ctx.fillText(this._t("mode.br.progress", "SẾP {n}/5").replace("{n}", "" + (V2o.br.idx + 1)), W / 2, 34);
        if (V2o.br.restT > 0) {
          ctx.font = "16px sans-serif";
          ctx.fillStyle = "#9df3ff";
          ctx.fillText(this._t("mode.br.rest_banner", "Nghỉ {s}s — sửa cửa sổ! 🔧")
            .replace("{s}", "" + Math.ceil(V2o.br.restT)), W / 2, 58);
        }
      }
      ctx.restore();
    } catch (e) {}
  },
};
