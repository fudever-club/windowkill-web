/* WINDOWKILL — Meta progression (Mảnh kính · Xưởng · Skins · Achievements · Daily)
 * Game Design v2 §7.3, §10.1, §10.2, §10.3, Phụ lục A. IIFE, expose window.Meta.
 *
 * Coordinator wiring guide: xem INTEGRATION.md (API + game events) và
 * META-UI-SPEC.md (spec màn hình menu). File này KHÔNG sửa file có sẵn.
 */
"use strict";
(function () {
  "use strict";

  /* ---------------- storage an toàn (Poki incognito chặn storage) ---------------- */
  var LS_OK = (function () {
    try { localStorage.setItem("__wk_meta_probe", "1"); localStorage.removeItem("__wk_meta_probe"); return true; }
    catch (e) { return false; }
  })();
  var mem = {}; // fallback khi localStorage bị chặn
  function lsGet(k) {
    try { return LS_OK ? localStorage.getItem(k) : (mem[k] == null ? null : mem[k]); }
    catch (e) { return null; }
  }
  function lsSet(k, v) {
    try { if (LS_OK) localStorage.setItem(k, v); else mem[k] = v; } catch (e) {}
  }
  function lsGetJSON(k, dflt) {
    var raw = lsGet(k);
    if (raw == null) return dflt;
    try { var v = JSON.parse(raw); return v == null ? dflt : v; } catch (e) { return dflt; }
  }
  function lsSetJSON(k, v) { lsSet(k, JSON.stringify(v)); }

  /* ---------------- localStorage keys — Phụ lục A (TUYỆT ĐỐI không đổi) ---------------- */
  var K = {
    SHARDS: "wk_meta_shards",          // mảnh kính hiện có (int)
    SHARDS_TOTAL: "wk_meta_shards_total", // tổng mảnh lifetime (mở node Xưởng)
    WORKSHOP: "wk_meta_workshop",      // JSON {"1":2,"2":1,...}
    SKINS: "wk_meta_skins",            // JSON ["default",...]
    SKIN_ACTIVE: "wk_meta_skin_active",// skin đang dùng
    ACHV: "wk_meta_achv",              // JSON {"3":true,...}
    STATS: "wk_meta_stats",            // JSON {kills, chewerKills, ...}
    DAILY: "wk_meta_daily",            // JSON {"20261001":{"score":..,"streak":3,"completed":true},"lastDate":"..."}
    UNLOCK_HN: "wk_meta_unlock_hn",    // true/false: đã mở Khắc nghiệt
  };

  var int0 = function (v) { var n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.max(0, n) : 0; };

  /* ---------------- save versioning (N8 — Season 1 DoR, Q1-A) ----------------
   * Quy ước: MỘT key toàn cục `wk_save_version` (int), độc lập với các key wk_meta_*.
   * - Save cũ chưa có key            → coi là v1 (ngầm định).
   * - Code hiện tại ghi version 2 (schema baseline: chưa đổi cấu trúc, chỉ đánh dấu).
   * - Mỗi lần đổi schema sau này: tăng SAVE_VERSION, thêm 1 bước vào MIGRATIONS.
   * - migrateSave(from, to) chạy TUẦN TỰ từng bước (1→2, 2→3, ...), CHỈ TIẾN,
   *   không downgrade. Chạy 1 lần duy nhất khi load, TRƯỚC mọi lần đọc meta.
   * - Version tương lai / giá trị lạ: KHÔNG crash — giữ nguyên + cảnh báo console.
   * - Đối xứng backend: server dùng PRAGMA user_version (xem server/src/store.js).
   */
  var SAVE_VERSION = 2;
  var K_VERSION = "wk_save_version"; // key toàn cục — KHÔNG nằm trong K (Phụ lục A)
  var MIGRATIONS = [
    { from: 1, to: 2, run: function () {
        // v1→v2: baseline marker. Schema v1 = toàn bộ keys wk_meta_* hiện tại;
        // chưa có thay đổi cấu trúc nào, bước này chỉ đánh dấu điểm tựa cho các
        // migration sau (vd Season 1) nối tiếp.
        if (typeof console !== "undefined" && console.info)
          console.info("[wk] save migrated 1→2 (schema baseline, no structural change)");
    } },
    // Bước sau thêm ở đây, vd: { from: 2, to: 3, run: function () { ... } },
  ];
  function readSaveVersion() {
    var raw = lsGet(K_VERSION);
    if (raw == null || raw === "") return 1; // save cũ: v1 ngầm định
    var v = Math.floor(Number(raw));
    if (!Number.isFinite(v) || v < 1) return 1; // giá trị lạ ("abc", -5...) → coi như v1 rồi migrate lên
    return v;
  }
  function migrateSave(from, to) {
    from = Math.floor(Number(from)) || 1;
    to = Math.floor(Number(to)) || SAVE_VERSION;
    var v = from, guard = 0;
    while (v < to && guard++ < 100) {
      var step = null, i;
      for (i = 0; i < MIGRATIONS.length; i++)
        if (MIGRATIONS[i].from === v) { step = MIGRATIONS[i]; break; }
      if (!step) { // thiếu định nghĩa bước: bỏ qua, vẫn tiến version để không kẹt
        if (typeof console !== "undefined" && console.warn)
          console.warn("[wk] save: missing migration step " + v + "→" + (v + 1) + ", skipping");
        v++;
        continue;
      }
      try { step.run(); }
      catch (e) { // bước lỗi: DỪNG, không ghi version mới → lần load sau thử lại, không mất data
        if (typeof console !== "undefined" && console.error)
          console.error("[wk] save: migration " + v + "→" + step.to + " failed:", e);
        break;
      }
      v = step.to;
    }
    return v;
  }
  (function ensureSaveVersion() { // chạy 1 lần lúc khởi động, trước mọi lần đọc meta
    var v = readSaveVersion();
    if (v > SAVE_VERSION) { // save từ tương lai: giữ nguyên, không crash, không downgrade
      if (typeof console !== "undefined" && console.warn)
        console.warn("[wk] save: version " + v + " newer than code (" + SAVE_VERSION + "), keeping as-is");
      return;
    }
    var done = migrateSave(v, SAVE_VERSION);
    if (done >= SAVE_VERSION) lsSet(K_VERSION, String(SAVE_VERSION));
    // done < SAVE_VERSION: có bước lỗi → giữ nguyên key cũ, lần sau thử lại
  })();

  /* ================= 1. MẢNH KÍNH (§10.1) ================= */
  var Shards = {
    get: function () { return int0(lsGet(K.SHARDS)); },
    getTotal: function () { return int0(lsGet(K.SHARDS_TOTAL)); },
    add: function (n, reason) {
      n = int0(n);
      if (n <= 0) return { shards: this.get(), added: 0 };
      var s = this.get() + n, t = this.getTotal() + n;
      lsSet(K.SHARDS, String(s)); lsSet(K.SHARDS_TOTAL, String(t));
      Stats.touch("totalShards", t); // mirror vào stats cho UI đọc nhanh
      return { shards: s, added: n, reason: reason || "" };
    },
    spend: function (n) {
      n = int0(n);
      var s = this.get();
      if (n <= 0 || s < n) return false;
      lsSet(K.SHARDS, String(s - n));
      return true;
    },
    // tiện ích cho coordinator: cộng mảnh cuối run theo §10.1
    // rewardsForRun({waveCleared, bossKilled, score}) -> {breakdown, total}
    rewardsForRun: function (r) {
      r = r || {};
      var b = [];
      if (int0(r.waveCleared) > 0) b.push({ n: 2 * int0(r.waveCleared), reason: "wave" });
      if (r.bossKilled) b.push({ n: 10, reason: "boss" });
      var per1000 = Math.floor(int0(r.score) / 1000);
      if (per1000 > 0) b.push({ n: per1000, reason: "score" });
      var total = 0;
      b.forEach(function (x) { total += x.n; Shards.add(x.n, "run:" + x.reason); });
      return { breakdown: b, total: total };
    },
  };

  /* ================= 2. STATS (cộng dồn — dùng cho điều kiện mở + achievements) ================= */
  var STATS_DEFAULT = {
    kills: 0, chewerKills: 0, bossKills: 0, pickups: 0, repairPx: 0,
    bestWave: 0, bestScore: 0, maxLevel: 0, maxUpgrades: 0,
    dailyCompleted: 0, longestRunSec: 0, totalShards: 0,
  };
  var Stats = {
    get: function () {
      var s = lsGetJSON(K.STATS, null);
      if (!s || typeof s !== "object") return Object.assign({}, STATS_DEFAULT);
      var out = Object.assign({}, STATS_DEFAULT);
      Object.keys(out).forEach(function (k) { out[k] = int0(s[k]); });
      return out;
    },
    save: function (s) { lsSetJSON(K.STATS, s); },
    touch: function (k, v) { var s = this.get(); s[k] = int0(v); this.save(s); return s; },
    bump: function (k, n) { var s = this.get(); s[k] = int0(s[k]) + int0(n || 1); this.save(s); return s; },
    max: function (k, v) { var s = this.get(); v = int0(v); if (v > s[k]) { s[k] = v; this.save(s); } return s; },
  };

  /* ================= 3. XƯỞNG (§7.3 — 10 node) =================
     Giá từng node theo doc: tổng full cây 3.650 mảnh (doc ghi 3.580 — vênh 70,
     dùng giá từng node trong bảng, KHÔNG tự chỉnh). */
  var WORKSHOP_DEFS = [
    { id: 1,  nameVi: "Khung gia cố", nameEn: "Reinforced Frame", descEn: "+1 max HP at run start per level (max +3).", unlockEn: "Available",    descVi: "+1 máu tối đa đầu run (mỗi cấp, tối đa +3).",
      max: 3, prices: [50, 120, 250], unlock: { type: "always" }, unlockVi: "Có sẵn" },
    { id: 2,  nameVi: "Nòng đôi", nameEn: "Twin Barrels", descEn: "+10% fire rate per level (max +30%).", unlockEn: "Earn 100 total shards",        descVi: "+10% tốc bắn mỗi cấp (tối đa +30%).",
      max: 3, prices: [60, 140, 300], unlock: { type: "shards_total", n: 100 }, unlockVi: "Kiếm tổng 100 mảnh" },
    { id: 3,  nameVi: "Đạn chuẩn", nameEn: "Precision Rounds", descEn: "+1 bullet damage per level (max +2).", unlockEn: "Reach wave 5",       descVi: "+1 sát thương đạn mỗi cấp (tối đa +2).",
      max: 2, prices: [100, 250],      unlock: { type: "bestWave", n: 5 }, unlockVi: "Đạt wave 5" },
    { id: 4,  nameVi: "Động cơ phản lực", nameEn: "Jet Engine", descEn: "+8% move speed per level (max +24%).", unlockEn: "Available", descVi: "+8% tốc chạy mỗi cấp (tối đa +24%).",
      max: 3, prices: [40, 100, 220], unlock: { type: "always" }, unlockVi: "Có sẵn" },
    { id: 5,  nameVi: "Nam châm hút", nameEn: "Magnet Coil", descEn: "+25% gem pickup radius per level (max +75%).", unlockEn: "Earn 60 total shards",    descVi: "+25% bán kính hút gem mỗi cấp (tối đa +75%).",
      max: 3, prices: [30, 80, 180],  unlock: { type: "shards_total", n: 60 }, unlockVi: "Kiếm tổng 60 mảnh" },
    { id: 6,  nameVi: "Keo siêu dính", nameEn: "Super Glue", descEn: "End-of-wave repair +60px (lv 1) / +80px (lv 2) instead of 40px.", unlockEn: "Reach wave 5",   descVi: "Vá cuối wave +60px (cấp 1) / +80px (cấp 2), thay vì 40px.",
      max: 2, prices: [80, 200],       unlock: { type: "bestWave", n: 5 }, unlockVi: "Đạt wave 5" },
    { id: 7,  nameVi: "Giáp gai", nameEn: "Spiked Armor", descEn: "Reflect 2 (lv 1) / 4 (lv 2) damage on contact.", unlockEn: "Reach wave 8",        descVi: "Gai phản 2 (cấp 1) / 4 (cấp 2) sát thương khi quái chạm.",
      max: 2, prices: [120, 280],      unlock: { type: "bestWave", n: 8 }, unlockVi: "Đạt wave 8" },
    { id: 8,  nameVi: "Mồi thơm", nameEn: "Sweet Bait", descEn: "+15% (lv 1) / +30% (lv 2) pickup drop rate.", unlockEn: "Earn 200 total shards",        descVi: "+15% (cấp 1) / +30% (cấp 2) tỉ lệ rớt pickup.",
      max: 2, prices: [90, 210],       unlock: { type: "shards_total", n: 200 }, unlockVi: "Kiếm tổng 200 mảnh" },
    { id: 9,  nameVi: "Trợ lý kỹ thuật", nameEn: "Tech Assistant", descEn: "Start each run with 1 random upgrade.", unlockEn: "Reach wave 10", descVi: "Bắt đầu run với 1 nâng cấp ngẫu nhiên.",
      max: 1, prices: [350],           unlock: { type: "bestWave", n: 10 }, unlockVi: "Đạt wave 10" },
    { id: 10, nameVi: "Túi cứu sinh", nameEn: "Life Pack", descEn: "Once per run: at 0 HP, restore 1 HP + 2s invulnerability.", unlockEn: "Kill 1 boss",    descVi: "1 lần/run: máu về 0 → hồi 1 máu + bất tử 2s.",
      max: 1, prices: [400],           unlock: { type: "bossKills", n: 1 }, unlockVi: "Giết 1 boss" },
  ];

  var Workshop = {
    defs: WORKSHOP_DEFS,
    get: function () {
      var raw = lsGetJSON(K.WORKSHOP, {});
      var out = {};
      WORKSHOP_DEFS.forEach(function (d) {
        var v = int0(raw && raw[d.id]);
        out[d.id] = Math.min(v, d.max);
      });
      return out;
    },
    _save: function (m) { lsSetJSON(K.WORKSHOP, m); },
    level: function (id) { return this.get()[id] || 0; },
    countBought: function () { // số node đã mua ≥1 cấp (dùng mở skin "Thợ rèn")
      var m = this.get(), c = 0;
      Object.keys(m).forEach(function (k) { if (m[k] > 0) c++; });
      return c;
    },
    isFull: function () { // full = cả 10 node đều đã mua ít nhất 1 cấp
      var m = this.get();
      return WORKSHOP_DEFS.every(function (d) { return (m[d.id] || 0) > 0; });
    },
    isUnlocked: function (id) {
      var d = WORKSHOP_DEFS.filter(function (x) { return x.id === id; })[0];
      if (!d) return false;
      var u = d.unlock;
      if (u.type === "always") return true;
      var s = Stats.get();
      if (u.type === "shards_total") return Shards.getTotal() >= u.n;
      if (u.type === "bestWave") return s.bestWave >= u.n;
      if (u.type === "bossKills") return s.bossKills >= u.n;
      return false;
    },
    nextPrice: function (id) {
      var d = WORKSHOP_DEFS.filter(function (x) { return x.id === id; })[0];
      var lv = this.level(id);
      if (!d || lv >= d.max) return null;
      return d.prices[lv];
    },
    buyNode: function (id) {
      id = int0(id);
      var d = WORKSHOP_DEFS.filter(function (x) { return x.id === id; })[0];
      if (!d) return { ok: false, error: "unknown_node" };
      var lv = this.level(id);
      if (lv >= d.max) return { ok: false, error: "maxed" };
      if (!this.isUnlocked(id)) return { ok: false, error: "locked" };
      var price = d.prices[lv];
      if (!Shards.spend(price)) return { ok: false, error: "not_enough_shards" };
      var m = this.get(); m[id] = lv + 1; this._save(m);
      // achievement #25: full 10 node → unlock + tặng skin FU-DEVER
      if (this.isFull()) { Achievements.unlock(25); }
      return { ok: true, id: id, level: lv + 1, price: price, shardsLeft: Shards.get() };
    },
    // Modifier áp vào đầu run — coordinator đọc 1 lần khi khởi tạo G/player.
    getRunModifiers: function () {
      var m = this.get();
      var lv = function (id) { return m[id] || 0; };
      return {
        maxHpBonus: lv(1),                    // +1 máu max/cấp
        fireRateMul: 1 + 0.10 * lv(2),        // +10%/cấp
        dmgBonus: lv(3),                      // +1 dmg/cấp
        speedMul: 1 + 0.08 * lv(4),           // +8%/cấp
        magnetMul: 1 + 0.25 * lv(5),          // +25%/cấp
        waveRepairPx: lv(6) === 2 ? 80 : (lv(6) === 1 ? 60 : 40),
        thornsDmg: lv(7) === 2 ? 4 : (lv(7) === 1 ? 2 : 0),
        pickupMul: 1 + 0.15 * lv(8),          // +15%/cấp
        freeUpgrade: lv(9) > 0,               // 1 nâng cấp ngẫu nhiên đầu run
        secondLife: lv(10) > 0,               // 1 lần/run
      };
    },
  };

  /* ================= 4. SKINS (§7.3 — chỉ đổi ngoại hình, công bằng tuyệt đối) ================= */
  var SKIN_DEFS = [
    { id: "default", nameVi: "Mặc định", nameEn: "Default",   unlock: { type: "always" },
      unlockVi: "Có sẵn",
      paletteOverride: { hull: "#22d3ee", accent: "#0ea5e9", trail: "#67e8f9" } },
    { id: "sunset",  nameVi: "Hoàng hôn", nameEn: "Sunset",  unlock: { type: "bestWave", n: 5 },
      unlockVi: "Đạt wave 5",
      paletteOverride: { hull: "#fb923c", accent: "#f43f5e", trail: "#fdba74" } },
    { id: "night",   nameVi: "Bóng đêm", nameEn: "Night",   unlock: { type: "bossKills", n: 3 },
      unlockVi: "Giết 3 boss",
      paletteOverride: { hull: "#1e1b4b", accent: "#7c3aed", trail: "#a78bfa" } },
    { id: "frost",   nameVi: "Băng giá", nameEn: "Frost",   unlock: { type: "dailyCompleted", n: 1 },
      unlockVi: "Hoàn thành 1 Daily Challenge",
      paletteOverride: { hull: "#bae6fd", accent: "#38bdf8", trail: "#e0f2fe" } },
    { id: "smith",   nameVi: "Thợ rèn", nameEn: "Blacksmith",    unlock: { type: "workshopNodes", n: 5 },
      unlockVi: "Mua 5 node Xưởng",
      paletteOverride: { hull: "#d97706", accent: "#92400e", trail: "#fcd34d" } },
    { id: "fudever", nameVi: "FU-DEVER",   unlock: { type: "any", list: [
        { type: "bestWave", n: 15 }, { type: "workshopFull" } ] },
      unlockVi: "Đạt wave 15 hoặc mua full 10 node Xưởng",
      paletteOverride: { hull: "#0066CC", accent: "#0080FF", trail: "#66B2FF" } },
  ];

  function skinCondMet(u) {
    var s = Stats.get();
    if (u.type === "always") return true;
    if (u.type === "bestWave") return s.bestWave >= u.n;
    if (u.type === "bossKills") return s.bossKills >= u.n;
    if (u.type === "dailyCompleted") return s.dailyCompleted >= u.n;
    if (u.type === "workshopNodes") return Workshop.countBought() >= u.n;
    if (u.type === "workshopFull") return Workshop.isFull();
    if (u.type === "any") return (u.list || []).some(skinCondMet);
    return false;
  }

  var Skins = {
    defs: SKIN_DEFS,
    getUnlocked: function () {
      var raw = lsGetJSON(K.SKINS, null);
      if (!Array.isArray(raw)) {
        // khởi tạo: luôn có default; auto-unlock skin nào đã đủ điều kiện (người chơi cũ)
        var init = ["default"];
        var self = this;
        SKIN_DEFS.forEach(function (d) {
          if (d.id !== "default" && skinCondMet(d.unlock) && init.indexOf(d.id) < 0) init.push(d.id);
        });
        lsSetJSON(K.SKINS, init);
        return init;
      }
      if (raw.indexOf("default") < 0) raw.unshift("default");
      return raw;
    },
    isUnlocked: function (id) { return this.getUnlocked().indexOf(id) >= 0; },
    canUnlock: function (id) { // đủ điều kiện nhưng chưa mở (UI hiện nút "Mở")
      var d = SKIN_DEFS.filter(function (x) { return x.id === id; })[0];
      return !!d && !this.isUnlocked(id) && skinCondMet(d.unlock);
    },
    unlockSkin: function (id, force) {
      var d = SKIN_DEFS.filter(function (x) { return x.id === id; })[0];
      if (!d || this.isUnlocked(id)) return { ok: false, error: "invalid" };
      if (!force && !skinCondMet(d.unlock)) return { ok: false, error: "locked" };
      var arr = this.getUnlocked(); arr.push(id); lsSetJSON(K.SKINS, arr);
      return { ok: true, id: id };
    },
    getActive: function () {
      var a = lsGet(K.SKIN_ACTIVE);
      if (this.isUnlocked(a)) return a;
      return "default";
    },
    setActiveSkin: function (id) {
      if (!this.isUnlocked(id)) return { ok: false, error: "locked" };
      lsSet(K.SKIN_ACTIVE, id);
      return { ok: true, id: id };
    },
  };

  /* ================= 5. ACHIEVEMENTS (§10.2 — 25 cái) ================= */
  var ACHV_DEFS = [
    { id: 1,  nameVi: "Chào sân", nameEn: "First Blood", condDescEn: "Clear your first wave 1",                 condDescVi: "Hoàn thành wave 1 đầu tiên",            reward: 5 },
    { id: 2,  nameVi: "Hiểu luật rồi", nameEn: "Got the Rules", condDescEn: "Clear wave 3 on Chill",            condDescVi: "Vượt wave 3 ở Chill",                    reward: 10 },
    { id: 3,  nameVi: "Thợ săn tập sự", nameEn: "Novice Hunter", condDescEn: "100 kills (cumulative)",           condDescVi: "100 quái (cộng dồn)",                    reward: 10 },
    { id: 4,  nameVi: "Thợ săn thực thụ", nameEn: "True Hunter", condDescEn: "1,000 kills (cumulative)",         condDescVi: "1.000 quái (cộng dồn)",                  reward: 25 },
    { id: 5,  nameVi: "Cỗ máy hủy diệt", nameEn: "Destroyer", condDescEn: "10,000 kills (cumulative)",          condDescVi: "10.000 quái (cộng dồn)",                 reward: 60 },
    { id: 6,  nameVi: "Kẻ gặm bị gặm", nameEn: "Chewed the Chewers", condDescEn: "50 chewers (cumulative)",            condDescVi: "50 chewer (cộng dồn)",                   reward: 15 },
    { id: 7,  nameVi: "Đập tan âm mưu", nameEn: "Plot Foiled", condDescEn: "Defeat your first boss",           condDescVi: "Hạ boss đầu tiên",                       reward: 20 },
    { id: 8,  nameVi: "Chuyên gia diệt boss", nameEn: "Boss Slayer", condDescEn: "10 bosses (cumulative)",     condDescVi: "10 boss (cộng dồn)",                     reward: 50 },
    { id: 9,  nameVi: "Người vá víu", nameEn: "Patchwork Hero", condDescEn: "Repair 2,000px of window (cumulative)",             condDescVi: "Vá tổng 2.000px cửa sổ (cộng dồn)",      reward: 15 },
    { id: 10, nameVi: "Cửa sổ bất khả xâm phạm", nameEn: "Untouchable", condDescEn: "Win a wave without losing any window px",  condDescVi: "Thắng 1 wave không mất px cửa sổ nào",   reward: 20 },
    { id: 11, nameVi: "Suýt thì toang", nameEn: "Close Call", condDescEn: "Beat a boss with < 15% window left",           condDescVi: "Thắng boss khi cửa sổ còn < 15%",        reward: 25 },
    { id: 12, nameVi: "Người hùng thầm lặng", nameEn: "Silent Hero", condDescEn: "25 pickups (cumulative)",     condDescVi: "25 pickup (cộng dồn)",                   reward: 10 },
    { id: 13, nameVi: "Dọn sạch", nameEn: "Clean Sweep", condDescEn: "One nuke kills ≥ 15 enemies",                 condDescVi: "1 nuke giết ≥ 15 quái",                  reward: 20 },
    { id: 14, nameVi: "Tốc độ ánh sáng", nameEn: "Lightspeed", condDescEn: "Reach level 10 in one run",          condDescVi: "Cấp 10 trong một run",                   reward: 20 },
    { id: 15, nameVi: "Full build", nameEn: "Full Build", condDescEn: "6 different upgrades in one run",               condDescVi: "6 nâng cấp khác nhau trong một run",     reward: 25 },
    { id: 16, nameVi: "Tay to", nameEn: "Heavy Hitter", condDescEn: "50,000 score in one run (Normal+)",                   condDescVi: "50.000 điểm/run (Thường trở lên)",        reward: 30 },
    { id: 17, nameVi: "Huyền thoại", nameEn: "Legend", condDescEn: "200,000 score in one run (Normal+)",              condDescVi: "200.000 điểm/run (Thường trở lên)",       reward: 60 },
    { id: 18, nameVi: "Không cần nghỉ", nameEn: "No Breaks", condDescEn: "One run lasting 15 minutes",           condDescVi: "1 run dài 15 phút",                      reward: 25 },
    { id: 19, nameVi: "Kiên cường", nameEn: "Resilient", condDescEn: "Survive wave 10 on Normal",               condDescVi: "Sống sót wave 10 Thường",                reward: 30 },
    { id: 20, nameVi: "Vực sâu gọi tên", nameEn: "The Abyss Calls", condDescEn: "Reach wave 15 (any difficulty)",          condDescVi: "Chạm wave 15 (mọi độ khó)",              reward: 40 },
    { id: 21, nameVi: "Dám chơi dám chịu", nameEn: "Risk Taker", condDescEn: "Finish a Harsh run (past wave 1)",        condDescVi: "Hoàn thành 1 run Khắc nghiệt (qua wave 1)", reward: 30 },
    { id: 22, nameVi: "Thử thách mỗi ngày", nameEn: "Daily Grind", condDescEn: "Complete 1 Daily Challenge",       condDescVi: "Hoàn thành 1 Daily Challenge",           reward: "skin:frost" },
    { id: 23, nameVi: "Đều như vắt chanh", nameEn: "Clockwork", condDescEn: "7-day daily streak",        condDescVi: "Streak daily 7 ngày",                    reward: 30 },
    { id: 24, nameVi: "Gắn bó", nameEn: "Devoted", condDescEn: "30-day daily streak",                   condDescVi: "Streak daily 30 ngày",                    reward: 100 },
    { id: 25, nameVi: "WORK HARD – PLAY HARD", nameEn: "WORK HARD – PLAY HARD", condDescEn: "Buy all 10 Workshop nodes",    condDescVi: "Mua full 10 node Xưởng",                 reward: "skin:fudever" },
  ];
  var achvListeners = [];
  var Achievements = {
    DEFS: ACHV_DEFS,
    get: function () {
      var raw = lsGetJSON(K.ACHV, {});
      return (raw && typeof raw === "object") ? raw : {};
    },
    isUnlocked: function (id) { return !!this.get()[id]; },
    onUnlock: function (cb) { if (typeof cb === "function") achvListeners.push(cb); },
    unlock: function (id) {
      id = int0(id);
      var def = ACHV_DEFS.filter(function (d) { return d.id === id; })[0];
      if (!def || this.isUnlocked(id)) return { ok: false };
      var m = this.get(); m[id] = true; lsSetJSON(K.ACHV, m);
      var rewardNote;
      if (typeof def.reward === "number") {
        Shards.add(def.reward, "achievement:" + id);
        rewardNote = "+" + def.reward + (lang === "en" ? " shards" : " mảnh kính");
      } else if (typeof def.reward === "string" && def.reward.indexOf("skin:") === 0) {
        var skinId = def.reward.slice(5);
        Skins.unlockSkin(skinId, true); // force: phần thưởng thành tích
        var skin = SKIN_DEFS.filter(function (x) { return x.id === skinId; })[0];
        rewardNote = "skin " + (skin ? ((lang === "en" && skin.nameEn) ? skin.nameEn : skin.nameVi) : skinId);
      }
      var aName = (lang === "en" && def.nameEn) ? def.nameEn : def.nameVi;
      var info = { id: id, nameVi: def.nameVi, nameEn: def.nameEn, reward: def.reward, rewardNote: rewardNote,
                   copy: ((lang === "en") ? "New achievement: " : "Thành tích mới: ") + aName + " — " + rewardNote + "." };
      achvListeners.forEach(function (cb) { try { cb(info); } catch (e) {} });
      return { ok: true, info: info };
    },
    // coordinator gọi sau mỗi event game. Idempotent: đã mở thì bỏ qua.
    check: function (event, data) {
      data = data || {};
      var s = Stats.get();
      var un = function (id) { return Achievements.unlock(id); };
      var diff = data.difficulty || "normal";
      var isNormalPlus = (diff === "normal" || diff === "hard");
      switch (event) {
        case "kill":
          s = Stats.bump("kills", 1);
          if (data.type === "chewer") s = Stats.bump("chewerKills", 1);
          if (s.kills >= 100) un(3);
          if (s.kills >= 1000) un(4);
          if (s.kills >= 10000) un(5);
          if (s.chewerKills >= 50) un(6);
          break;
        case "bossKill":
          s = Stats.bump("bossKills", 1);
          un(7);
          if (s.bossKills >= 10) un(8);
          if (data.winPct != null && Number(data.winPct) < 0.15) un(11);
          break;
        case "waveClear": {
          var w = int0(data.wave);
          Stats.max("bestWave", w);
          if (w >= 1) un(1);
          if (diff === "chill" && w >= 3) un(2);
          if (diff === "normal" && w >= 10) un(19);
          if (w >= 15) un(20);
          if (diff === "hard" && w >= 1) un(21);
          if (data.windowDamagePx === 0) un(10);
          break;
        }
        case "pickup":
          s = Stats.bump("pickups", 1);
          if (s.pickups >= 25) un(12);
          break;
        case "repair": // vá cửa sổ: data.px
          s = Stats.bump("repairPx", int0(data.px));
          if (s.repairPx >= 2000) un(9);
          break;
        case "nuke":
          if (int0(data.kills) >= 15) un(13);
          break;
        case "levelUp":
          Stats.max("maxLevel", int0(data.level));
          if (int0(data.level) >= 10) un(14);
          break;
        case "upgrade": // 1 nâng cấp được chọn: data.distinct (số loại khác nhau trong run)
          Stats.max("maxUpgrades", int0(data.distinct));
          if (int0(data.distinct) >= 6) un(15);
          break;
        case "runStart":
          RunFlags.reset();
          break;
        case "runEnd": { // data: score, wave, durationSec, difficulty, maxLevel, maxUpgrades
          Stats.max("bestScore", int0(data.score));
          Stats.max("bestWave", int0(data.wave));
          Stats.max("longestRunSec", int0(data.durationSec));
          if (int0(data.score) >= 50000 && isNormalPlus) un(16);
          if (int0(data.score) >= 200000 && isNormalPlus) un(17);
          if (int0(data.durationSec) >= 900) un(18);
          break;
        }
        case "dailyComplete":
          Stats.bump("dailyCompleted", 1);
          un(22);
          break;
        case "streak": {
          var days = int0(data.days);
          if (days >= 7) un(23);
          if (days >= 30) un(24);
          break;
        }
      }
      return true;
    },
  };

  /* ================= 6. DAILY CHALLENGE (§10.3) ================= */
  var DAILY_MODS = [
    { id: "M1", nameVi: "Ngày hội chewer", nameEn: "Chewer Fest", descEn: "Chewers from wave 1, count ×2, chew DPS −20%.", descVi: "Chewer từ wave 1, số lượng ×2, chew dps −20%." },
    { id: "M2", nameVi: "Đạn nặng", nameEn: "Heavy Rounds", descEn: "Bullet speed −25%, damage +50%.",        descVi: "Tốc đạn −25%, sát thương +50%." },
    { id: "M3", nameVi: "Sàn trơn", nameEn: "Slippery Floor", descEn: "Move speed +20%, slide inertia +40%.",        descVi: "Tốc chạy +20%, quán tính trượt +40%." },
    { id: "M4", nameVi: "Mưa gem", nameEn: "Gem Rain", descEn: "Gem drops ×2 quantity, 1 XP each.",         descVi: "Gem rớt ×2 số lượng, mỗi gem 1 XP." },
    { id: "M5", nameVi: "Boss giận dữ", nameEn: "Enraged Boss", descEn: "Boss fires 2 bullet patterns at once, +50% boss score.",    descVi: "Boss 2 pattern đạn cùng lúc, boss +50% điểm." },
    { id: "M6", nameVi: "Cửa sổ mong manh", nameEn: "Fragile Window", descEn: "Defeat threshold 35% (instead of 25%), +60px end-of-wave repair.", descVi: "Ngưỡng thua 35% (thay vì 25%), vá cuối wave +60px." },
    { id: "M7", nameVi: "Chợ đen", nameEn: "Black Market", descEn: "Draft offers 4 choices instead of 3.",         descVi: "Draft 4 lựa chọn thay vì 3." },
    { id: "M8", nameVi: "Giờ cao điểm", nameEn: "Rush Hour", descEn: "Spawn interval −30%, enemy score +30%.",    descVi: "Spawn −30% interval, điểm quái +30%." },
  ];
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function todayKey(d) { // YYYYMMDD, giờ địa phương
    d = d || new Date();
    var y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate();
    return y + (m < 10 ? "0" + m : "" + m) + (day < 10 ? "0" + day : "" + day);
  }
  function dateStrOf(key) { return key.slice(6, 8) + "/" + key.slice(4, 6) + "/" + key.slice(0, 4); }
  function addDays(key, n) {
    var d = new Date(int0(key.slice(0, 4)), int0(key.slice(4, 6)) - 1, int0(key.slice(6, 8)));
    d.setDate(d.getDate() + n);
    return todayKey(d);
  }

  var Daily = {
    MODS: DAILY_MODS,
    _store: function () {
      var s = lsGetJSON(K.DAILY, null);
      if (!s || typeof s !== "object") s = {};
      return s;
    },
    _saveStore: function (s) { lsSetJSON(K.DAILY, s); },
    getDaily: function (dateKey) {
      var key = dateKey || todayKey();
      var seed = parseInt(key, 10) || 0;
      var rng = mulberry32(seed);
      var pool = DAILY_MODS.slice(), mods = [];
      for (var i = 0; i < 2; i++) {
        mods.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
      }
      var store = this._store();
      var prevStreak = 0;
      if (store.lastDate && store[store.lastDate] && typeof store[store.lastDate].streak === "number") {
        // streak chỉ giữ nếu hôm qua vừa chơi; bỏ 1 ngày → hiển thị 0 (reset khi chơi lại)
        prevStreak = (store.lastDate === addDays(key, -1)) ? int0(store[store.lastDate].streak) : 0;
      }
      var today = store[key] || {};
      return {
        seed: key,                       // seed = YYYYMMDD — cùng seed mọi người (§10.3)
        dateStr: dateStrOf(key),
        modifiers: mods,                 // 2 modifier, rng chọn, không trùng
        bestScore: int0(today.score),
        completed: !!today.completed,
        streak: today.completed ? int0(today.streak) : prevStreak,
      };
    },
    // điểm daily = điểm run × 1.1^(số modifier) = ×1.21 (2 modifier). Lấy max.
    submitScore: function (score, wave) {
      var key = todayKey();
      var dailyScore = Math.floor(int0(score) * Math.pow(1.1, 2));
      var store = this._store();
      var entry = store[key] || { score: 0, streak: 0, completed: false };
      store[key] = entry;
      var newBest = dailyScore > int0(entry.score);
      if (newBest) entry.score = dailyScore;

      var reward = 0, streakNow = int0(entry.streak);
      if (int0(wave) >= 1 && !entry.completed) {
        // qua wave 1 = hoàn thành ngày: +15 mảnh; streak +1 nếu hôm qua chơi, bỏ 1 ngày → reset về 1
        entry.completed = true;
        streakNow = (store.lastDate === addDays(key, -1)) ? int0((store[store.lastDate] || {}).streak) + 1 : 1;
        entry.streak = streakNow;
        store.lastDate = key;
        reward += 15;
        if (streakNow === 7) reward += 30; // §10.1: streak ≥ 7 ngày +30 thêm
        Achievements.check("dailyComplete");
        Achievements.check("streak", { days: streakNow });
        this._saveStore(store);
        Shards.add(reward, "daily:" + key);
        // AUDIT 2026-10-02: nuốt rejection của sync (mất mạng/backend lỗi) — trước đây
        // fire-and-forget nên mỗi lần hoàn thành Daily mà API lỗi là 1 unhandled rejection.
        try { var sp = this.syncToServer(); if (sp && typeof sp.catch === "function") sp.catch(function () {}); } catch (e2) {}
      } else {
        this._saveStore(store);
      }
      return { dailyScore: dailyScore, newBest: newBest, streak: streakNow,
               reward: reward, dateKey: key };
    },
    // BXH local (stub dữ liệu — backend top 100 theo Phụ lục B, coordinator nối sau)
    getLocalLeaderboard: function (limit) {
      var store = this._store(), rows = [];
      Object.keys(store).forEach(function (k) {
        if (k === "lastDate") return;
        var e = store[k] || {};
        rows.push({ date: k, dateStr: dateStrOf(k), score: int0(e.score), streak: int0(e.streak) });
      });
      rows.sort(function (a, b) { return b.score - a.score; });
      return rows.slice(0, int0(limit) || 10);
    },
    // STUB: gửi điểm daily lên server khi có backend. Coordinator nối window.WKApi sau.
    // Server validate: seed == date, wave ≤ 10 (§10.3 chống gian lận vừa phải).
    syncToServer: function () {
      try {
        if (typeof window !== "undefined" && window.WKApi && typeof window.WKApi.dailySubmit === "function") {
          var key = todayKey();
          var store = this._store(), e = store[key] || {};
          return window.WKApi.dailySubmit({ date: key, seed: key, score: int0(e.score) });
        }
      } catch (err) {}
      return Promise.resolve({ ok: false, stub: true });
    },
  };

  /* ================= 7. VÁ KHẨN (§10.1) =================
     1 lần/run, tốn 20 mảnh, +60px khi cửa sổ < 40%.
     Coordinator kiểm tra winPct < 0.40 để hiện nút; Meta giữ chi phí + cờ 1 lần/run. */
  var EMERGENCY_COST = 20, EMERGENCY_PX = 60;
  var RunFlags = {
    _f: {},
    reset: function () { this._f = {}; },
    used: function () { return !!this._f.emergencyRepair; },
    mark: function () { this._f.emergencyRepair = true; },
  };
  var Emergency = {
    COST: EMERGENCY_COST,
    PX: EMERGENCY_PX,
    canEmergencyRepair: function () {
      return !RunFlags.used() && Shards.get() >= EMERGENCY_COST;
    },
    // coordinator đã kiểm tra winPct < 0.40 trước khi gọi
    emergencyRepair: function () {
      if (RunFlags.used()) return { ok: false, error: "already_used" };
      if (!Shards.spend(EMERGENCY_COST)) return { ok: false, error: "not_enough_shards" };
      RunFlags.mark();
      return { ok: true, px: EMERGENCY_PX, shardsLeft: Shards.get() };
    },
  };

  /* ================= 8. KHẮC NGHIỆT unlock (§7.3) =================
     Mở Khắc nghiệt: vượt wave 5 ở Thường 1 lần. */
  var Hard = {
    isUnlocked: function () {
      try { return lsGet(K.UNLOCK_HN) === "1"; } catch (e) { return false; }
    },
    check: function (wave, difficulty) {
      if (int0(wave) >= 5 && difficulty === "normal" && !this.isUnlocked()) {
        try { lsSet(K.UNLOCK_HN, "1"); } catch (e) {}
        return { newlyUnlocked: true };
      }
      return { newlyUnlocked: false };
    },
  };

  /* ================= 9. i18n tối giản =================
     Repo hiện CHƯA có I18N global — Meta.t() là fallback để UI dùng ngay.
     Coordinator: nếu sau này có I18N.t('meta.<key>'), gọi Meta.setLang() hoặc
     override I18N. Bảng key đầy đủ xem INTEGRATION.md. */
  var I18N_TABLE = {
    "toast.achievement": { vi: "Thành tích mới: {name} — {reward}.", en: "New achievement: {name} — {reward}." },
    "workshop.title":    { vi: "Xưởng", en: "Workshop" },
    "shards.label":      { vi: "Mảnh kính", en: "Glass shards" },
    "daily.title":       { vi: "Thử thách mỗi ngày", en: "Daily Challenge" },
    "daily.seed":        { vi: "Seed hôm nay: {seed}", en: "Today's seed: {seed}" },
    "daily.streak":      { vi: "Chuỗi: {n} ngày", en: "Streak: {n} days" },
    "daily.best":        { vi: "Điểm cao nhất: {score}", en: "Best score: {score}" },
    "daily.play":        { vi: "Chơi thử thách", en: "Play challenge" },
    "emergency.button":  { vi: "Vá khẩn (−20 mảnh kính)", en: "Emergency repair (−20 shards)" },
    "hard.unlock":       { vi: "Bạn đã chứng minh được bản lĩnh. Khắc nghiệt đang chờ.", en: "You've proven yourself. Harsh awaits." },
  };
  var lang = "vi";
  function t(key, vars) {
    var row = I18N_TABLE[key];
    var s = (row && (row[lang] || row.vi)) || key;
    if (vars) Object.keys(vars).forEach(function (k) { s = s.split("{" + k + "}").join(String(vars[k])); });
    return s;
  }

  /* ================= expose ================= */
  var Meta = {
    version: "2.0.0",
    // shards
    getShards: function () { return Shards.get(); },
    getTotalShards: function () { return Shards.getTotal(); },
    addShards: function (n, reason) { return Shards.add(n, reason); },
    spendShards: function (n) { return Shards.spend(n); },
    rewardsForRun: function (r) { return Shards.rewardsForRun(r); },
    // workshop
    WORKSHOP: WORKSHOP_DEFS,
    getWorkshop: function () { return Workshop.get(); },
    isNodeUnlocked: function (id) { return Workshop.isUnlocked(id); },
    buyNode: function (id) { return Workshop.buyNode(id); },
    getRunModifiers: function () { return Workshop.getRunModifiers(); },
    isWorkshopFull: function () { return Workshop.isFull(); },
    // skins
    SKINS: SKIN_DEFS,
    getSkins: function () {
      var self = this;
      return SKIN_DEFS.map(function (d) {
        return { id: d.id, nameVi: d.nameVi, nameEn: d.nameEn, unlockVi: d.unlockVi, unlockEn: d.unlockEn,
                 unlocked: Skins.isUnlocked(d.id), canUnlock: Skins.canUnlock(d.id),
                 active: self.getActiveSkin() === d.id, paletteOverride: d.paletteOverride };
      });
    },
    unlockSkin: function (id) { return Skins.unlockSkin(id, false); },
    setActiveSkin: function (id) { return Skins.setActiveSkin(id); },
    getActiveSkin: function () { return Skins.getActive(); },
    // achievements
    ACHV_DEFS: ACHV_DEFS,
    getAchievements: function () {
      return ACHV_DEFS.map(function (d) {
        return { id: d.id, nameVi: d.nameVi, nameEn: d.nameEn, condDescVi: d.condDescVi, condDescEn: d.condDescEn,
                 reward: d.reward, unlocked: Achievements.isUnlocked(d.id) };
      });
    },
    check: function (event, data) { return Achievements.check(event, data); },
    onUnlock: function (cb) { return Achievements.onUnlock(cb); },
    // daily
    getDaily: function () { return Daily.getDaily(); },
    submitScore: function (score, wave) { return Daily.submitScore(score, wave); },
    getLocalLeaderboard: function (limit) { return Daily.getLocalLeaderboard(limit); },
    syncToServer: function () { return Daily.syncToServer(); },
    // emergency repair
    getEmergencyCost: function () { return EMERGENCY_COST; },
    canEmergencyRepair: function () { return Emergency.canEmergencyRepair(); },
    emergencyRepair: function () { return Emergency.emergencyRepair(); },
    // hard unlock
    isHardUnlocked: function () { return Hard.isUnlocked(); },
    checkHardUnlock: function (wave, difficulty) { return Hard.check(wave, difficulty); },
    // stats (cho UI tiến trình)
    getStats: function () { return Stats.get(); },
    resetRun: function () { RunFlags.reset(); },
    // i18n
    setLang: function (l) { lang = (l === "en") ? "en" : "vi"; },
    t: t,
    // internal (test)
    _int0: int0, _mulberry32: mulberry32, _todayKey: todayKey, _addDays: addDays,
    _keys: K, _storageOk: LS_OK,
    // save versioning N8 (test + debug)
    SAVE_VERSION: SAVE_VERSION,
    saveVersion: function () { return readSaveVersion(); },
    _migrateSave: migrateSave, _readSaveVersion: readSaveVersion,
  };

  if (typeof window !== "undefined") window.Meta = Meta;
  if (typeof module !== "undefined" && module.exports) module.exports = Meta;
})();
