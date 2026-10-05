/* =====================================================================
 * js/stageobj.js — WINDOWKILL · OBJECTIVE PHỤ + HUY HIỆU THEO ẢI
 * Stage Identity item 3: mỗi ải campaign (1-5) có 1 objective phụ gắn với
 * mechanic của ải. Hoàn thành trong run → banner + lưu huy hiệu per profile
 * (qua Campaign.setStageBadge), hiện trên stage card ở menu.
 *
 * Kiến trúc: IIFE, expose window.StageObj (+ module.exports cho node test).
 * Không phụ thuộc thứ tự load nghiêm ngặt: mọi truy cập I18N / Campaign /
 * StageFX / setBanner / addFloat / G đều có guard, chỉ đọc lúc runtime.
 *
 * API:
 *   StageObj.begin(stageId)      — reset tiến trình đầu run (stageId 1-5;
 *                                  0/khác = inactive, vd. endless)
 *   StageObj.update(dt, inputActive) — gọi mỗi frame: đếm thời gian thả phím
 *                                  + hết hạn chuỗi drift-kill
 *   StageObj.onKill(e)           — gọi từ killEnemy (đếm dark-kill ải 4,
 *                                  drift-kill ải 3)
 *   StageObj.onGem()             — gọi khi nhặt gem (ải 1)
 *   StageObj.onSpikeKill()       — gọi qua G.onSpikeKill từ module gai ải 2
 *   StageObj.onPickup(kind)      — gọi khi nhặt pickup (patch ải 5)
 *   StageObj.def(stageId)        — {icon, target} | null (menu.js dùng)
 *   StageObj.state()             — snapshot state hiện tại (cho test)
 * ===================================================================== */
(function () {
  "use strict";
  var W = (typeof window !== "undefined") ? window : globalThis;

  /* ---------------- i18n (VI+EN) — đăng ký literal để test i18n-coverage quét được ---------------- */
  try {
    if (typeof I18N !== "undefined" && I18N && typeof I18N.register === "function") I18N.register({
    vi: {
      "stageobj.done_banner": "HOÀN THÀNH OBJECTIVE!",
      "stageobj.done_float": "Đã nhận huy hiệu!",
      "stageobj.1.name": "Thợ Mỏ Siêng Năng",
      "stageobj.1.desc": "Nhặt 30 gem trong một run ải 1",
      "stageobj.1.short": "Thợ Mỏ",
      "stageobj.2.name": "Đầu Bếp Lửa",
      "stageobj.2.desc": "Nướng 8 con quái bằng gai viền ải 2",
      "stageobj.2.short": "Nướng Gai",
      "stageobj.3.name": "Vua Drift Băng",
      "stageobj.3.desc": "Chuỗi 5 drift-kill: hạ quái lúc tàu đang trôi mà không bấm phím di chuyển",
      "stageobj.3.short": "Drift ×5",
      "stageobj.4.name": "Thợ Săn Bóng Đêm",
      "stageobj.4.desc": "Hạ 12 con quái trong lúc mất điện ải 4",
      "stageobj.4.short": "Săn Đêm",
      "stageobj.5.name": "Kỹ Sư Bản Vá",
      "stageobj.5.desc": "Nhặt 5 patch xanh để nới vùng an toàn ải 5",
      "stageobj.5.short": "Vá Víu"
    },
    en: {
      "stageobj.done_banner": "OBJECTIVE COMPLETE!",
      "stageobj.done_float": "Badge earned!",
      "stageobj.1.name": "GEM HOARDER",
      "stageobj.1.desc": "Collect 30 gems in one stage 1 run",
      "stageobj.1.short": "Miner",
      "stageobj.2.name": "SPIKE CHEF",
      "stageobj.2.desc": "Fry 8 monsters on the stage 2 border spikes",
      "stageobj.2.short": "Spike Fry",
      "stageobj.3.name": "ICE DRIFTER",
      "stageobj.3.desc": "Chain 5 drift-kills: kill while sliding with no movement input",
      "stageobj.3.short": "Drift ×5",
      "stageobj.4.name": "NIGHT HUNTER",
      "stageobj.4.desc": "Kill 12 monsters during stage 4 blackouts",
      "stageobj.4.short": "Night Hunt",
      "stageobj.5.name": "PATCH ENGINEER",
      "stageobj.5.desc": "Collect 5 green patches to widen the stage 5 safe zone",
      "stageobj.5.short": "Patch Up"
    }
  });
  } catch (e) {}

  function t(key, fb) {
    try {
      if (W.I18N && typeof W.I18N.t === "function") {
        var v = W.I18N.t(key);
        if (v && v !== key) return v;
      }
    } catch (e) {}
    return fb;
  }

  /* ---------------- định nghĩa objective ---------------- */
  // kind: "count" = đếm cộng dồn trong run · "chain" = chuỗi liên tiếp (hết hạn theo giờ)
  var DEFS = {
    1: { icon: "i-gem",   target: 30, kind: "count" },
    2: { icon: "i-fire",  target: 8,  kind: "count" },
    3: { icon: "i-snow",  target: 5,  kind: "chain" },
    4: { icon: "i-ghost", target: 12, kind: "count" },
    5: { icon: "i-shield", target: 5, kind: "count" }
  };
  var CHAIN_WINDOW_S = 4;      // drift-kill: mỗi kill làm mới chuỗi trong 4s
  var DRIFT_MIN_SPEED = 60;    // px/s quán tính — cùng ngưỡng "đang trôi" mà stagefx vẽ vệt trượt
  var DRIFT_MIN_IDLE_S = 0.5;  // phải thả phím di chuyển ít nhất 0.5s mới tính là drift

  var S = null; // {stageId, done, progress, chain, chainT, idleT}

  /* ---------------- helpers đọc state engine (có guard) ---------------- */
  function driftSpeed() {
    try {
      var m = W.StageFX && W.StageFX.modules && W.StageFX.modules.slippery;
      if (m && m.st) return Math.abs(m.st.ivx || 0) + Math.abs(m.st.ivy || 0);
    } catch (e) {}
    return 0;
  }
  function isDarkNow() {
    try {
      if (W.StageFX && typeof W.StageFX.isDark === "function") return !!W.StageFX.isDark();
    } catch (e) {}
    return false;
  }
  function isDrifting() {
    return !!(S && S.stageId === 3 && !S.done &&
      S.idleT >= DRIFT_MIN_IDLE_S && driftSpeed() > DRIFT_MIN_SPEED);
  }

  /* ---------------- core ---------------- */
  function begin(stageId) {
    stageId = stageId | 0;
    var active = !!DEFS[stageId];
    S = { stageId: active ? stageId : 0, done: false, progress: 0, chain: 0, chainT: 0, idleT: 0 };
    // Ải 2: cắm hook để module gai (stagefx.js) báo kill — các ải khác gỡ hook
    try {
      var G = W.G;
      if (G) G.onSpikeKill = (S.stageId === 2) ? function () { onSpikeKill(); } : null;
    } catch (e) {}
    return S.stageId;
  }

  function update(dt, inputActive) {
    if (!S || !S.stageId || S.done) return;
    dt = Math.max(0, dt || 0);
    if (inputActive) S.idleT = 0; else S.idleT += dt;
    if (S.chainT > 0) {
      S.chainT -= dt;
      if (S.chainT <= 0) { S.chainT = 0; S.chain = 0; }
    }
  }

  function checkDone() {
    var def = DEFS[S.stageId];
    if (def && S.progress >= def.target) complete();
  }

  function complete() {
    if (!S || S.done) return;
    S.done = true;
    var stageId = S.stageId;
    // Persist per profile (pattern như stage best)
    try {
      if (W.Campaign && typeof W.Campaign.setStageBadge === "function")
        W.Campaign.setStageBadge(null, stageId);
    } catch (e) {}
    // Báo hoàn thành: banner + float + sfx (toàn bộ có guard)
    try {
      var name = t("stageobj." + stageId + ".name", "Objective");
      if (typeof W.setBanner === "function")
        W.setBanner(t("stageobj.done_banner", "OBJECTIVE COMPLETE!"), name);
      var ship = W.G && W.G.ship;
      if (ship && typeof W.addFloat === "function")
        W.addFloat(ship.x, ship.y - 56, t("stageobj.done_float", "Badge earned!"), "#ffd166", true);
      var sfx = W.AudioEngine && W.AudioEngine.sfx;
      if (sfx) {
        if (typeof sfx.fanfare === "function") sfx.fanfare();
        else if (typeof sfx.up === "function") sfx.up();
        else if (typeof sfx.pickup === "function") sfx.pickup();
      }
    } catch (e) {}
  }

  /* ---------------- event từ game loop ---------------- */
  function onKill() {
    if (!S || !S.stageId || S.done) return;
    if (S.stageId === 4) {
      if (isDarkNow()) { S.progress += 1; checkDone(); }
      return;
    }
    if (S.stageId === 3) {
      if (isDrifting()) {
        S.chain += 1;
        S.chainT = CHAIN_WINDOW_S;
        if (S.chain >= DEFS[3].target) complete();
      }
      // Kill thường KHÔNG phá chuỗi (lenient — vui hơn): chuỗi chỉ hết hạn theo giờ.
      return;
    }
  }

  function onGem() {
    if (!S || S.stageId !== 1 || S.done) return;
    S.progress += 1;
    checkDone();
  }

  function onSpikeKill() {
    if (!S || S.stageId !== 2 || S.done) return;
    S.progress += 1;
    checkDone();
  }

  function onPickup(kind) {
    if (!S || S.stageId !== 5 || S.done) return;
    if (kind === "patch") { S.progress += 1; checkDone(); }
  }

  /* ---------------- API ---------------- */
  var StageObj = {
    begin: begin,
    update: update,
    onKill: onKill,
    onGem: onGem,
    onSpikeKill: onSpikeKill,
    onPickup: onPickup,
    def: function (stageId) { return DEFS[stageId | 0] || null; },
    isDrifting: isDrifting,
    state: function () {
      return S ? { stageId: S.stageId, done: S.done, progress: S.progress,
        chain: S.chain, chainT: Math.round(S.chainT * 100) / 100,
        idleT: Math.round(S.idleT * 100) / 100 } : null;
    },
    _t: t // cho test đọc i18n
  };

  W.StageObj = StageObj;
  if (typeof module !== "undefined" && module.exports) module.exports = StageObj;
})();
