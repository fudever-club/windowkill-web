/* =====================================================================
 * js/stagemech.js — WINDOWKILL · STAGE MECHANICS (twist có thưởng mỗi ải)
 * Mỗi ải campaign (1-5) có 1 mechanic riêng CHỈ THÊM THƯỞNG, không tăng khó:
 *   Ải 1 "Phòng tập tân binh": hạ boss → flash xanh "tốt nghiệp" toàn màn.
 *   Ải 2 "Gai là vũ khí": quái chết bởi gai viền rớt gem ×2 (spike kill
 *     vốn rớt 0 gem nên đây là thưởng thuần).
 *   Ải 3 "Trượt đẹp": drift-kill rớt thêm 1 bộ gem; chuỗi 5 → slow-mo + banner.
 *   Ải 4 "Giờ vàng săn gem": kill trong lúc mất điện rớt thêm 1 bộ gem.
 *   Ải 5 "Kỹ sư bản vá": nhặt patch → +5 gem quanh tàu; boss <25% HP →
 *     cảnh báo + sự kiện hút cửa sổ (NULL): mỗi 0.5s teo 12×9px trong 2s;
 *     hạ boss trong lúc đó → "CTRL+Z" + 20 gem.
 *
 * Kiến trúc: IIFE, expose window.StageMech (+ module.exports cho node test).
 * Không phụ thuộc thứ tự load nghiêm ngặt: mọi truy cập I18N / StageObj /
 * StageFX / Juice / setBanner / addFloat / shrinkWindow / G đều có guard,
 * chỉ đọc lúc runtime. Module KHÔNG tự gọi begin — parent/coordinator wire
 * vào game.js (begin sau StageObj.begin để chain G.onSpikeKill đúng thứ tự).
 *
 * API:
 *   StageMech.begin(stageId)   — reset đầu run (stageId 1-5; 0/invalid = inactive)
 *   StageMech.update(dt)       — gọi mỗi frame: decay flash, hết hạn chuỗi drift,
 *                                event NULL hút cửa sổ ải 5
 *   StageMech.onKill(e)        — gọi từ killEnemy (thưởng gem ải 3, ải 4)
 *   StageMech.onSpikeKill(e)   — gọi qua G.onSpikeKill (thưởng gem ải 2)
 *   StageMech.onBossKill()     — gọi khi hạ boss (ải 1 flash, ải 5 CTRL+Z)
 *   StageMech.onPickup(kind, p)— gọi khi nhặt pickup (thưởng patch ải 5)
 *   StageMech.drawFlash(ctx,w,h) — vẽ flash "tốt nghiệp" ải 1 (gọi trong draw)
 *   StageMech.state()          — snapshot state hiện tại (cho test)
 * ===================================================================== */
(function () {
  "use strict";
  var W = (typeof window !== "undefined") ? window : globalThis;

  /* ---------------- i18n (VI+EN) — đăng ký literal để test i18n-coverage quét được ---------------- */
  try {
    if (typeof I18N !== "undefined" && I18N && typeof I18N.register === "function") I18N.register({
    vi: {
      "stagemech.graduate": "TỐT NGHIỆP TÂN BINH!",
      "stagemech.roast": "NƯỚNG CHÍN!",
      "stagemech.drift2": "TRƯỢT ĐẸP! ×2",
      "stagemech.drift_chain": "404: KỸ NĂNG KHÔNG TÌM THẤY… À CÓ ĐÂY RỒI!",
      "stagemech.night2": "SĂN ĐÊM! ×2",
      "stagemech.patch_thanks": "VÁ CÓ CÔNG! +5",
      "stagemech.ctrlz": "CTRL+Z THÀNH CÔNG!",
      "stagemech.null_warn": "CẢNH BÁO: NULL ĐANG HÚT CỬA SỔ!"
    },
    en: {
      "stagemech.graduate": "ROOKIE GRADUATED!",
      "stagemech.roast": "ROASTED!",
      "stagemech.drift2": "SICK DRIFT! ×2",
      "stagemech.drift_chain": "404: SKILL NOT FOUND… OH WAIT, THERE IT IS!",
      "stagemech.night2": "NIGHT HUNT! ×2",
      "stagemech.patch_thanks": "PATCHED WITH THANKS! +5",
      "stagemech.ctrlz": "CTRL+Z SUCCESS!",
      "stagemech.null_warn": "WARNING: NULL IS SUCKING THE WINDOW!"
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

  /* ---------------- helpers an toàn ---------------- */
  function G() { try { return W.G || null; } catch (e) { return null; } }
  function banner(main, sub) {
    try { if (typeof W.setBanner === "function") W.setBanner(main, sub || ""); } catch (e) {}
  }
  function float(x, y, text, color, big) {
    try { if (typeof W.addFloat === "function") W.addFloat(x, y, text, color, !!big); } catch (e) {}
  }
  function warnSfx() {
    try {
      var A = W.AudioEngine;
      if (A && A.sfx) {
        if (typeof A.sfx.warn === "function") { A.sfx.warn(); return; }
        if (typeof A.sfx.thud === "function") A.sfx.thud();
      }
    } catch (e) {}
  }
  function gemsOf(G_, n, x, y, v) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2;
      G_.gems.push({ x: x, y: y, vx: Math.cos(a) * 130, vy: Math.sin(a) * 130,
        v: v, t: Math.floor(Math.random() * 10) });
    }
  }
  function isDrifting() {
    try {
      if (W.StageObj && typeof W.StageObj.isDrifting === "function") return !!W.StageObj.isDrifting();
    } catch (e) {}
    return false;
  }
  function isDarkNow() {
    try {
      if (W.StageFX && typeof W.StageFX.isDark === "function") return !!W.StageFX.isDark();
    } catch (e) {}
    return false;
  }
  function screenCX() {
    try { if (typeof window !== "undefined") return window.innerWidth / 2; } catch (e) {}
    return 640;
  }
  function screenCY() {
    try { if (typeof window !== "undefined") return window.innerHeight / 2; } catch (e) {}
    return 360;
  }

  var S = null; // {stageId, driftChain, driftChainT, bossEventDone, shrinkT, shrinkTick, lastBossX, lastBossY}

  /* ---------------- core ---------------- */
  function begin(stageId) {
    stageId = stageId | 0;
    var active = (stageId >= 1 && stageId <= 5);
    S = { stageId: active ? stageId : 0,
      driftChain: 0, driftChainT: 0,
      bossEventDone: false, shrinkT: 0, shrinkTick: 0, lastBossX: 0, lastBossY: 0 };
    // Ải 2: CHAIN hook G.onSpikeKill với hook cũ (StageObj.begin đã cắm trước —
    // thứ tự gọi begin trong game.js phải là StageObj rồi StageMech). Ải khác: không đụng hook.
    try {
      var g = G();
      if (g && S.stageId === 2 && !g.onSpikeKill.__stagemech) {
        var prev = g.onSpikeKill;
        var wrapped = function (ev) { try { if (prev) prev(ev); } catch (_) {} onSpikeKill(ev); };
        wrapped.__stagemech = true; // idempotent: begin(2) 2 lần không lồng hook gấp đôi gem
        g.onSpikeKill = wrapped;
      }
    } catch (e) {}
    return S.stageId;
  }

  function update(dt) {
    if (!S || !S.stageId) return;
    dt = Math.max(0, dt || 0);
    // Ải 1: decay flash tốt nghiệp
    var g = G();
    if (g && g.rebootFlash > 0) g.rebootFlash = Math.max(0, g.rebootFlash - dt);
    // Ải 3: hết hạn chuỗi drift
    if (S.driftChainT > 0) {
      S.driftChainT -= dt;
      if (S.driftChainT <= 0) { S.driftChainT = 0; S.driftChain = 0; }
    }
    // Ải 5: event NULL hút cửa sổ khi boss còn <25% HP
    if (S.stageId === 5 && g && !S.bossEventDone) {
      var boss = g.boss;
      if (boss && !boss.dead) {
        S.lastBossX = boss.x; S.lastBossY = boss.y;
        var maxHp = boss.maxHp || 1;
        if (boss.hp / maxHp <= 0.25) {
          S.bossEventDone = true;
          S.shrinkT = 2; S.shrinkTick = 0;
          banner(t("stagemech.null_warn", "WARNING: NULL IS SUCKING THE WINDOW!"), "");
          warnSfx();
        }
      }
    }
    if (S.stageId === 5 && S.shrinkT > 0) {
      S.shrinkT -= dt; S.shrinkTick += dt;
      while (S.shrinkTick >= 0.5) {
        S.shrinkTick -= 0.5;
        try {
          if (typeof W.shrinkWindow === "function") W.shrinkWindow(12, 9);
        } catch (e) {}
        try {
          float(screenCX(), screenCY() - 60, "−12px 🪟", "#ff5b5b", true);
        } catch (e) {}
      }
    }
  }

  /* ---------------- event từ game loop ---------------- */

  // Ải 1 — "Phòng tập tân binh": hạ boss → flash xanh toàn màn + banner tốt nghiệp
  // Ải 5 — hạ boss trong lúc NULL hút cửa sổ → CTRL+Z + 20 gem tại vị trí boss cuối
  function onBossKill() {
    if (!S || !S.stageId) return;
    var g = G();
    if (S.stageId === 1) {
      if (g) { try { g.rebootFlash = 0.5; } catch (e) {} }
      banner(t("stagemech.graduate", "ROOKIE GRADUATED!"), "");
      return;
    }
    if (S.stageId === 5 && S.shrinkT > 0 && g && g.gems) {
      banner(t("stagemech.ctrlz", "CTRL+Z SUCCESS!"), "");
      for (var i = 0; i < 20; i++) {
        var a = Math.random() * Math.PI * 2;
        g.gems.push({ x: S.lastBossX, y: S.lastBossY,
          vx: Math.cos(a) * 160, vy: Math.sin(a) * 160, v: 1,
          t: Math.floor(Math.random() * 10) });
      }
    }
  }

  // Ải 2 — "Gai là vũ khí": spike kill rớt gem ×2 (tank → 3×2)
  function onSpikeKill(e) {
    if (!S || S.stageId !== 2 || !e) return;
    var g = G();
    if (!g || !g.gems) return;
    var n = (e.type === "tank" ? 3 : 1) * 2;
    for (var i = 0; i < n; i++) {
      g.gems.push({ x: e.x, y: e.y,
        vx: (Math.random() * 2 - 1) * 130, vy: (Math.random() * 2 - 1) * 130,
        v: (e.xp || 1), t: Math.floor(Math.random() * 10) });
    }
    float(e.x, e.y - 16, t("stagemech.roast", "ROASTED!"), "#ff9a3c", true);
  }

  // Ải 3 — "Trượt đẹp": drift-kill rớt thêm 1 bộ gem; chuỗi 5 drift-kill → slow-mo
  // Ải 4 — "Giờ vàng săn gem": kill trong mất điện rớt thêm 1 bộ gem (float nhỏ)
  function onKill(e) {
    if (!S || !S.stageId || !e) return;
    var g = G();
    if (!g || !g.gems) return;
    var n = (e.type === "tank" ? 3 : 1);
    if (S.stageId === 3 && isDrifting()) {
      gemsOf(g, n, e.x, e.y, e.xp);
      float(e.x, e.y - 16, t("stagemech.drift2", "SICK DRIFT! ×2"), "#7df9ff", true);
      S.driftChain = (S.driftChain || 0) + 1;
      S.driftChainT = 10;
      if (S.driftChain >= 5) {
        try { if (W.Juice && typeof W.Juice.slowMo === "function") W.Juice.slowMo(0.3, 1000); } catch (err) {}
        banner(t("stagemech.drift_chain", "404: SKILL NOT FOUND… OH WAIT, THERE IT IS!"), "");
        S.driftChain = 0;
      }
      return;
    }
    if (S.stageId === 4 && isDarkNow()) {
      gemsOf(g, n, e.x, e.y, e.xp);
      float(e.x, e.y - 16, t("stagemech.night2", "NIGHT HUNT! ×2"), "#c084fc", false);
    }
  }

  // Ải 5 — "Kỹ sư bản vá": nhặt patch xanh → +5 gem quanh tàu
  function onPickup(kind, p) {
    if (!S || S.stageId !== 5 || kind !== "patch") return;
    var g = G();
    if (!g || !g.gems) return;
    var ship = g.ship;
    if (!ship) return;
    for (var i = 0; i < 5; i++) {
      var a = Math.random() * Math.PI * 2;
      g.gems.push({ x: ship.x, y: ship.y,
        vx: Math.cos(a) * 120, vy: Math.sin(a) * 120, v: 1,
        t: Math.floor(Math.random() * 10) });
    }
    float(ship.x, ship.y - 30, t("stagemech.patch_thanks", "PATCHED WITH THANKS! +5"), "#4ade80", true);
  }

  // Ải 1 — vẽ flash "tốt nghiệp" (gọi trong draw chính)
  function drawFlash(ctx, w, h) {
    if (!S || S.stageId !== 1) return;
    var g = G();
    var f = g ? (g.rebootFlash || 0) : 0;
    if (f > 0 && ctx) {
      try {
        ctx.fillStyle = "rgba(30,100,255," + (0.75 * f / 0.5) + ")";
        ctx.fillRect(0, 0, w, h);
      } catch (e) {}
    }
  }

  /* ---------------- API ---------------- */
  var StageMech = {
    begin: begin,
    update: update,
    onKill: onKill,
    onSpikeKill: onSpikeKill,
    onBossKill: onBossKill,
    onPickup: onPickup,
    drawFlash: drawFlash,
    state: function () {
      return S ? { stageId: S.stageId, driftChain: S.driftChain,
        driftChainT: Math.round(S.driftChainT * 100) / 100,
        bossEventDone: S.bossEventDone,
        shrinkT: Math.round(S.shrinkT * 100) / 100,
        shrinkTick: Math.round(S.shrinkTick * 100) / 100,
        lastBossX: S.lastBossX, lastBossY: S.lastBossY } : null;
    },
    _t: t // cho test đọc i18n
  };

  W.StageMech = StageMech;
  if (typeof module !== "undefined" && module.exports) module.exports = StageMech;
})();
