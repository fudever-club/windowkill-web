/* =====================================================================
 * js/bosses.js — WINDOWKILL v2 · 5 BOSS CUỐI ẢI (3 phase)
 * Spec: studio/game-design/GAME-DESIGN-DOC.md §5 (boss), §11 (game feel),
 *       §12.2 (banner), §13.3 (HUD)
 *
 * Kiến trúc: IIFE, expose window.Bosses. KHÔNG sửa file có sẵn — coordinator
 * (game.js) chỉ cần: Bosses.setHooks({...}) [tùy chọn], Bosses.startBoss(),
 * Bosses.update(), Bosses.draw(), Bosses.hit(), Bosses.barData().
 *
 * Mọi đòn nguy hiểm đều có telegraph ≥ 0.7s (visual đỏ/vàng + sfx cảnh báo).
 * Mọi số liệu đọc từ tham số diff (difficulty.config.json qua coordinator),
 * không hard-code trong logic — hằng số dưới đây chỉ là fallback.
 * ===================================================================== */
(function () {
  "use strict";
  /* AUDIT 2026-10-02: chọn chuỗi EN cho tên/banner boss khi ngôn ngữ hiện tại là EN. */
  function isEn() { try { return typeof I18N !== "undefined" && I18N.getLang && I18N.getLang() === "en"; } catch (e) { return false; } }
  var W = (typeof window !== "undefined") ? window : globalThis;

  /* ---------------- hooks (coordinator có thể override) ---------------- */
  var H = {};
  function setHooks(h) { H = h || {}; }

  function defSpawnEnemy(type, x, y, G) {
    if (G && Array.isArray(G.enemies)) {
      G.enemies.push({ type: type, x: x, y: y, r: 16, hp: 6, maxHp: 6, t: 0,
        spawnT: 0.5, dead: false, vx: 0, vy: 0 });
    }
  }
  function defSpawnPickup(kind, x, y, G) {
    if (G && Array.isArray(G.pickups)) G.pickups.push({ kind: kind, x: x, y: y, t: 0, life: 12 });
  }
  function defSpawnGems(n, x, y, G) {
    if (G && Array.isArray(G.gems)) {
      for (var i = 0; i < n; i++) {
        var a = Math.random() * Math.PI * 2;
        G.gems.push({ x: x + Math.cos(a) * 20, y: y + Math.sin(a) * 20,
          vx: Math.cos(a) * 120, vy: Math.sin(a) * 120, v: 1, t: 0 });
      }
    }
  }
  function defFireEB(x, y, vx, vy, G, o) {
    if (G && Array.isArray(G.ebullets)) {
      var b = { x: x, y: y, vx: vx, vy: vy, r: 6, life: 4 };
      if (o) for (var k in o) b[k] = o[k];
      G.ebullets.push(b);
    }
  }
  var hooks = {
    spawnEnemy:  function (type, x, y, G) { (H.spawnEnemy  || defSpawnEnemy)(type, x, y, G); },
    spawnPickup: function (kind, x, y, G) { (H.spawnPickup || defSpawnPickup)(kind, x, y, G); },
    spawnGems:   function (n, x, y, G)    { (H.spawnGems   || defSpawnGems)(n, x, y, G); },
    fireEB:      function (x, y, vx, vy, G, o) { (H.fireEB || defFireEB)(x, y, vx, vy, G, o); },
    hurtShip: function (dmg, x, y) {
      if (H.hurtShip) { H.hurtShip(dmg, x, y); return; }
      try { if (typeof W.hurtShip === "function") W.hurtShip(dmg, x, y); } catch (e) {}
    },
    banner: function (title, sub) {
      if (H.banner) { H.banner(title, sub); return; }
      try { if (typeof W.setBanner === "function") W.setBanner(title, sub); } catch (e) {}
    },
    onBossDead: function (b, G) { if (H.onBossDead) H.onBossDead(b, G); },
    onTimeout:  function (b, G) { if (H.onTimeout)  H.onTimeout(b, G); },
  };

  /* ---------------- helpers an toàn ---------------- */
  function sfx(name, fallback) {
    try {
      var A = W.AudioEngine;
      if (A && A.sfx) {
        if (typeof A.sfx[name] === "function") { A.sfx[name](); return; }
        if (fallback && typeof A.sfx[fallback] === "function") { A.sfx[fallback](); return; }
      }
    } catch (e) {}
  }
  function ring(x, y, maxR, color, life, G) {
    if (G && Array.isArray(G.rings)) {
      G.rings.push({ x: x, y: y, r: 6, maxR: maxR, c: color, t: 0, life: life || 0.6 });
    }
  }
  function float(x, y, text, color, big, G) {
    if (G && Array.isArray(G.floats)) {
      G.floats.push({ x: x, y: y, text: text, color: color || "#fff", t: 0, life: 1.4, big: !!big });
    }
  }
  function burst(x, y, n, colors, spd, G) {
    if (!G || !Array.isArray(G.parts)) return;
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, s = (0.3 + Math.random() * 0.7) * (spd || 260);
      G.parts.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        t: 0, life: 0.4 + Math.random() * 0.5, c: colors[i % colors.length], sz: 2 + Math.random() * 3.5 });
    }
  }
  function shake(amp, ms, prio) {
    try { if (W.Juice && typeof W.Juice.addShake === "function") W.Juice.addShake(amp, ms, prio || 5); } catch (e) {}
  }
  function slowmo(scale, dur) {
    try { if (W.Cinema && typeof W.Cinema.slowmo === "function") W.Cinema.slowmo(scale, dur); } catch (e) {}
  }
  // Cửa sổ thật: đi qua engine globals (có fallback đấu trường ảo trong game.js).
  // Trong iframe bị chặn → try/catch, game vẫn chạy bình thường.
  function doShrink(dw, dh) {
    try { if (typeof W.shrinkWindow === "function") { W.shrinkWindow(dw, dh); return true; } } catch (e) {}
    try { if (typeof shrinkWindow === "function") { shrinkWindow(dw, dh); return true; } } catch (e) {}
    return false;
  }
  function doGrow(dw, dh) {
    try { if (typeof W.growWindow === "function") { W.growWindow(dw, dh); return; } } catch (e) {}
    try { if (typeof growWindow === "function") { growWindow(dw, dh); } } catch (e) {}
  }
  function doMoveBy(dx, dy) {
    try { if (typeof W.pushWindow === "function") { W.pushWindow(dx, dy); return true; } } catch (e) {}
    try { if (typeof pushWindow === "function") { pushWindow(dx, dy); return true; } } catch (e) {}
    try { if (W.moveBy) { W.moveBy(dx, dy); return true; } } catch (e) {}
    return false;
  }
  function winJitter(p) {
    try { if (typeof W.windowJitter === "function") { W.windowJitter(p); return; } } catch (e) {}
    try { if (typeof windowJitter === "function") { windowJitter(p); } } catch (e) {}
  }
  function angTo(ax, ay, bx, by) { return Math.atan2(by - ay, bx - ax); }
  function dist(ax, ay, bx, by) { var dx = bx - ax, dy = by - ay; return Math.sqrt(dx * dx + dy * dy); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  /* ---------------- diff (difficulty.config.json qua coordinator) -------- */
  var DIFF_DEFAULTS = {
    bossHpMul: 1,        // §8.2: Chill 0.75 / Thường 1 / Khắc nghiệt 1.35
    telegraphMul: 1,     // §8.2: Chill 1.3 / Thường 1 / Khắc nghiệt 0.75
    boss5Timer: 20,      // §8.2: Chill 25 / Thường 20 / Khắc nghiệt 16
    enemySpdMul: 1,
  };
  function resolveDiff(d) {
    d = d || {};
    return {
      bossHpMul:    d.bossHpMul    != null ? d.bossHpMul    : DIFF_DEFAULTS.bossHpMul,
      telegraphMul: d.telegraphMul != null ? d.telegraphMul : DIFF_DEFAULTS.telegraphMul,
      boss5Timer:   d.boss5Timer   != null ? d.boss5Timer   : DIFF_DEFAULTS.boss5Timer,
      enemySpdMul:  d.enemySpdMul  != null ? d.enemySpdMul  : DIFF_DEFAULTS.enemySpdMul,
    };
  }

  /* ---------------- telegraph registry ---------------- */
  // b.teles: [{kind, t, dur, ...}] — vẽ bởi Bosses.draw(), tick bởi tickTelegraphs.
  function addTele(b, kind, dur, data) {
    var t = { kind: kind, t: dur, dur: dur };
    if (data) for (var k in data) t[k] = data[k];
    b.teles.push(t);
    return t;
  }
  function tickTelegraphs(b, dt) {
    for (var i = b.teles.length - 1; i >= 0; i--) {
      b.teles[i].t -= dt;
      if (b.teles[i].t <= 0) b.teles.splice(i, 1);
    }
  }
  // Mọi telegraph đòn ≥ 0.7s (floor tuyệt đối theo §5 — kể cả Khắc nghiệt).
  function teleDur(b, spec) { return Math.max(0.7, (spec.tele || 1) * b.teleMul); }
  function beginAttack(b, key, spec, G) {
    var dur = teleDur(b, spec);
    b.atk = { key: key, st: "tele", t: dur, spec: spec };
    if (spec.telegraph) spec.telegraph(b, G, dur);
    sfx(spec.warnSfx || "warn", "thud");
    if (spec.warnText) float(b.x, b.y - b.r - 34, spec.warnText, "#ffd479", false, G);
  }

  /* ---------------- chuyển phase ---------------- */
  function enterPhase(b, n, G) {
    b.phase = n;
    b.stun = 1.2;                    // §11.3: stun 1.2s khi mất phase
    b.atk = null; b.teles.length = 0;
    b.spdMul = 1 + 0.25 * (n - 1);   // §11.3: sau mỗi phase tốc đánh +25%
    b.atkT = 1.6;
    hooks.banner("BOSS SUY YẾU!", ""); // §11.3: banner khi boss mất phase
    ring(b.x, b.y, 150, "#ff5470", 0.7, G);
    burst(b.x, b.y, 40, ["#ff5470", "#ffd479", "#ffffff"], 340, G);
    sfx("phaseBreak", "bigboom");
    shake(9, 500, 8);
    hooks.spawnPickup("heart", b.x - 40, b.y, G);
    hooks.spawnPickup("heart", b.x + 40, b.y, G);
    if (b.def.id === "null" && n === 3) {
      // §5 boss 5 P3 "Lệnh Xóa": đếm ngược 20s (diff.boss5Timer)
      b.countdown = b.diff.boss5Timer;
      b.shrinkTick = 0; b.gemT = 2; b.sideT = 2;
      hooks.banner("⚠ LỆNH XÓA", "Giết nó trước khi cửa sổ về 0!");
    }
  }

  /* =====================================================================
     5 ĐỊNH NGHĨA BOSS — theo §5 GAME-DESIGN-DOC
     ===================================================================== */
  var BOSSES = [
    /* ---------------- BOSS 1 — GÃ GẶM KHỔNG LỒ (ải 1) ---------------- */
    {
      id: "gnawer", stage: 1, nameVi: "GÃ GẶM KHỔNG LỒ", nameEn: "THE COLOSSAL GNAWER",
      bannerTitle: "⚠ BOSS: GÃ GẶM KHỔNG LỒ", bannerTitleEn: "⚠ BOSS: THE COLOSSAL GNAWER",
      bannerSub: "Nó nện cửa sổ — giữ 🪟 sống sót!", bannerSubEn: "It slams the window — keep 🪟 alive!",
      expDps: 10, color: "#8b2fc9", r: 54,
      hpAt: function (d) { return Math.round(10 * 150 * resolveDiff(d).bossHpMul); },
      attacksP1: ["fan", "adds"],
      phases: [
        { hpAt: 0.66, attacks: ["fan", "adds", "slam"] },
        { hpAt: 0.33, attacks: ["fan2", "adds4", "slamFast"] },
      ],
      attacks: {
        fan: { tele: 1.0, recover: 0.8, cd: 3.2, warnSfx: "boss_roar", warnText: "Nó há miệng!",
          telegraph: function (b, G, dur) { b.mouthOpen = true; b.mouthT = dur + 0.4; addTele(b, "mouth", dur, {}); },
          fire: function (b, G) {
            var s = G.ship, base = angTo(b.x, b.y, s.x, s.y), n = 7;
            for (var i = 0; i < n; i++) {
              var a = base + (i - (n - 1) / 2) * 0.16;
              hooks.fireEB(b.x, b.y, Math.cos(a) * 240, Math.sin(a) * 240, G, { r: 7, color: "#c084fc" });
            }
            sfx("shoot", "thud"); shake(3, 150, 2);
            b.mouthOpen = false;
          } },
        fan2: { tele: 1.0, recover: 0.7, cd: 2.6, warnSfx: "boss_roar", warnText: "Đạn quạt kép!",
          telegraph: function (b, G, dur) { b.mouthOpen = true; b.mouthT = dur + 0.4; addTele(b, "mouth", dur, {}); },
          fire: function (b, G) {
            var s = G.ship, base = angTo(b.x, b.y, s.x, s.y);
            for (var wv = 0; wv < 2; wv++) {
              for (var i = 0; i < 7; i++) {
                var a = base + (i - 3) * 0.16 + wv * 0.28;
                hooks.fireEB(b.x, b.y, Math.cos(a) * 250, Math.sin(a) * 250, G, { r: 7, color: "#c084fc" });
              }
            }
            sfx("shoot", "thud"); shake(4, 180, 3);
            b.mouthOpen = false;
          } },
        adds: { tele: 0.8, recover: 0.6, cd: 7, warnSfx: "boss_roar", warnText: "Nó gọi đàn em!",
          telegraph: function (b, G, dur) { addTele(b, "roar", dur, {}); },
          fire: function (b, G) {
            var w = W.innerWidth || 900, h = W.innerHeight || 600;
            for (var i = 0; i < 3; i++) {
              var e = Math.floor(Math.random() * 4);
              var x = e === 0 ? 30 : (e === 1 ? w - 30 : Math.random() * w);
              var y = e === 0 || e === 1 ? Math.random() * h : (e === 2 ? 30 : h - 30);
              hooks.spawnEnemy("chewer", x, y, G);
            }
          } },
        adds4: { tele: 0.8, recover: 0.6, cd: 6, warnSfx: "boss_roar", warnText: "Cả bầy kéo tới!",
          telegraph: function (b, G, dur) { addTele(b, "roar", dur, {}); },
          fire: function (b, G) {
            var w = W.innerWidth || 900, h = W.innerHeight || 600;
            for (var i = 0; i < 4; i++) {
              hooks.spawnEnemy("chewer", 30 + Math.random() * (w - 60), Math.random() < 0.5 ? 30 : h - 30, G);
            }
          } },
        slam: { tele: 1.0, recover: 1.0, cd: 9, warnSfx: "warn", warnText: "Nó nhảy lên — tránh ra!",
          telegraph: function (b, G, dur) {
            var w = W.innerWidth || 900, h = W.innerHeight || 600;
            b.slamX = w / 2; b.slamY = h / 2;
            addTele(b, "slamShadow", dur, { x: b.slamX, y: b.slamY, r: 90 });
            slowmo(0.5, 0.7); // §11.4: slow-mo khi telegraph slam
          },
          fire: function (b, G) {
            b.x = b.slamX; b.y = b.slamY;
            doShrink(30, 22); // §5: resizeTo thu 30px
            ring(b.x, b.y, 200, "#c084fc", 0.8, G);
            burst(b.x, b.y, 30, ["#c084fc", "#ff5470"], 380, G);
            sfx("bigboom"); shake(8, 400, 8); winJitter(26);
            var s = G.ship;
            if (dist(b.x, b.y, s.x, s.y) < 150) hooks.hurtShip(1, b.x, b.y);
            float(b.x, b.y - 70, "RẦM!!", "#ff5470", true, G);
          } },
        slamFast: { tele: 0.7, recover: 0.8, cd: 7, warnSfx: "warn", warnText: "Nện liên tục!",
          telegraph: function (b, G, dur) {
            var w = W.innerWidth || 900, h = W.innerHeight || 600;
            b.slamX = w / 2; b.slamY = h / 2;
            addTele(b, "slamShadow", dur, { x: b.slamX, y: b.slamY, r: 90 });
          },
          fire: function (b, G) {
            b.x = b.slamX; b.y = b.slamY;
            doShrink(30, 22);
            ring(b.x, b.y, 200, "#c084fc", 0.8, G);
            burst(b.x, b.y, 30, ["#c084fc", "#ff5470"], 380, G);
            sfx("bigboom"); shake(8, 400, 8); winJitter(26);
            var s = G.ship;
            if (dist(b.x, b.y, s.x, s.y) < 150) hooks.hurtShip(1, b.x, b.y);
          } },
      },
      // Điểm yếu §5: há miệng phun đạn (đứng yên 1s) → bắn vào miệng ×1.5
      damageMult: function (b, x, y) {
        if (!b.mouthOpen) return 1;
        var mx = b.x + Math.cos(b.mouthAng || 0) * b.r, my = b.y + Math.sin(b.mouthAng || 0) * b.r;
        return dist(x, y, mx, my) < 52 ? 1.5 : 1;
      },
      update: function (b, dt, G) {
        var s = G.ship, w = W.innerWidth || 900, h = W.innerHeight || 600;
        if (b.mouthT > 0) b.mouthT -= dt; else b.mouthOpen = false;
        b.mouthAng = angTo(b.x, b.y, s.x, s.y);
        if (!b.atk || b.atk.key === "fan" || b.atk.key === "fan2" || b.atk.key === "adds" || b.atk.key === "adds4") {
          // Di chuyển chậm về viền gần nhất để gặm (trừ lúc telegraph nện)
          var dx = Math.min(b.x, w - b.x), dy = Math.min(b.y, h - b.y);
          var sp = 42 * (b.phase >= 3 ? 1.4 : 1);
          if (dx < dy) b.x += (b.x < w / 2 ? -1 : 1) * sp * dt;
          else b.y += (b.y < h / 2 ? -1 : 1) * sp * dt;
          b.x = clamp(b.x, 60, w - 60); b.y = clamp(b.y, 80, h - 80);
        }
        b.bob = (b.bob || 0) + dt * 3;
      },
      draw: function (ctx, b) {
        var x = b.x, y = b.y, s = b.r / 54;
        var flash = b.flash > 0;
        ctx.save();
        ctx.translate(x, y + Math.sin(b.bob || 0) * 4);
        // 6 chân bám
        ctx.strokeStyle = flash ? "#fff" : "#6d28d9"; ctx.lineWidth = 5 * s;
        for (var i = 0; i < 6; i++) {
          var a = (i / 6) * Math.PI * 2 + 0.3;
          ctx.beginPath(); ctx.moveTo(Math.cos(a) * 40 * s, Math.sin(a) * 30 * s);
          ctx.lineTo(Math.cos(a) * 62 * s, Math.sin(a) * 46 * s); ctx.stroke();
        }
        // thân tím bầu dục
        ctx.fillStyle = flash ? "#ffffff" : "#8b2fc9";
        ctx.beginPath(); ctx.ellipse(0, 0, 54 * s, 40 * s, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = flash ? "#fff" : "#a855f7";
        ctx.beginPath(); ctx.ellipse(-10 * s, -8 * s, 30 * s, 20 * s, -0.3, 0, Math.PI * 2); ctx.fill();
        // hàm răng hình khung cửa sổ trắng nhấp nháy
        var ma = b.mouthAng || 0;
        var mx = Math.cos(ma) * 44 * s, my = Math.sin(ma) * 34 * s;
        ctx.save(); ctx.translate(mx, my); ctx.rotate(ma);
        var open = b.mouthOpen ? 1 : 0.25;
        ctx.fillStyle = b.mouthOpen ? "#ff2222" : "#2a0a3a"; // miệng há sáng đỏ
        ctx.fillRect(-6, -14 * s, 26, 28 * s * open + 6);
        ctx.fillStyle = "#fff";
        var blink = (Math.sin((b.t || 0) * 10) > 0) ? 1 : 0.55;
        ctx.globalAlpha = blink;
        for (var t2 = 0; t2 < 4; t2++) { // răng cưa
          ctx.beginPath();
          ctx.moveTo(20, -14 * s + t2 * 8 * s); ctx.lineTo(10, -10 * s + t2 * 8 * s); ctx.lineTo(20, -6 * s + t2 * 8 * s);
          ctx.closePath(); ctx.fill();
        }
        ctx.globalAlpha = 1; ctx.restore();
        // tâm ngắm vàng khi miệng há (gợi ý điểm yếu)
        if (b.mouthOpen) {
          ctx.strokeStyle = "#ffd479"; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(mx, my, 30 * s, 0, Math.PI * 2); ctx.stroke();
        }
        // mắt
        ctx.fillStyle = "#ff2222";
        ctx.beginPath(); ctx.arc(-18 * s, -18 * s, 7 * s, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(6 * s, -22 * s, 7 * s, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      },
    },

    /* ---------------- BOSS 2 — TƯỜNG LỬA SỐNG (ải 2) ---------------- */
    {
      id: "firewall", stage: 2, nameVi: "TƯỜNG LỬA SỐNG", nameEn: "THE LIVING FIREWALL",
      bannerTitle: "⚠ BOSS: TƯỜNG LỬA SỐNG", bannerTitleEn: "⚠ BOSS: THE LIVING FIREWALL",
      bannerSub: "Gai tắt 2.5s sau mỗi đợt quét — áp sát!", bannerSubEn: "Spikes drop 2.5s after each sweep — get close!",
      expDps: 14, color: "#ff6a00", r: 40,
      hpAt: function (d) { return Math.round(14 * 150 * resolveDiff(d).bossHpMul); },
      attacksP1: ["rain", "sweep"],
      phases: [
        { hpAt: 0.66, attacks: ["rain", "sweep", "spawnBombers"] },
        { hpAt: 0.33, attacks: ["rainX", "splitSweep", "spawnBombers"] },
      ],
      attacks: {
        rain: { tele: 0.8, recover: 0.6, cd: 4, warnSfx: "warn", warnText: "Mưa gai!",
          telegraph: function (b, G, dur) { b.rainGlow = dur; addTele(b, "rainGlow", dur, {}); },
          fire: function (b, G) {
            for (var i = 0; i < 10; i++) {
              var p = wallPoint(b, Math.random());
              var iv = inward(b.wall.edge);
              hooks.fireEB(p.x, p.y, iv.x * 230, iv.y * 230, G, { r: 6, color: "#ff9a3c", spike: true });
            }
            sfx("shoot", "thud");
          } },
        rainX: { tele: 0.9, recover: 0.6, cd: 3.4, warnSfx: "warn", warnText: "Mưa gai chéo — 2 đợt!",
          telegraph: function (b, G, dur) { b.rainGlow = dur; addTele(b, "rainGlow", dur, {}); },
          fire: function (b, G) {
            for (var wv = 0; wv < 2; wv++) {
              for (var i = 0; i < 8; i++) {
                var p = wallPoint(b, Math.random());
                var iv = inward(b.wall.edge);
                var vx = iv.x * 220 + (wv === 0 ? 90 : -90), vy = iv.y * 220 + (wv === 0 ? -90 : 90);
                hooks.fireEB(p.x, p.y, vx, vy, G, { r: 6, color: "#ff9a3c", spike: true });
              }
            }
            sfx("shoot", "thud");
          } },
        sweep: { tele: 1.0, recover: 0.8, cd: 10, warnSfx: "warn", warnText: "QUÉT VIỀN — tránh xa viền!",
          telegraph: function (b, G, dur) { addTele(b, "sweepTrail", dur, { edge: "all" }); },
          fire: function (b, G) {
            b.sweep = { t: 0, dur: 4.2, segs: [{ edge: b.wall.edge, pos: 0, dir: 1, dist: 0 }] };
            sfx("boss_roar");
          } },
        splitSweep: { tele: 1.0, recover: 0.8, cd: 9, warnSfx: "warn", warnText: "Tách đôi — quét ngược chiều!",
          telegraph: function (b, G, dur) { addTele(b, "sweepTrail", dur, { edge: "all" }); b.splitWall = true; },
          fire: function (b, G) {
            b.sweep = { t: 0, dur: 4.6, segs: [
              { edge: b.wall.edge, pos: 0, dir: 1, dist: 0 },
              { edge: b.wall.edge, pos: 1, dir: -1, dist: 0 },
            ] };
            sfx("boss_roar");
          } },
        spawnBombers: { tele: 0.8, recover: 0.6, cd: 12, warnSfx: "boss_roar", warnText: "Nó nhả cảm tử!",
          telegraph: function (b, G, dur) { addTele(b, "roar", dur, {}); },
          fire: function (b, G) {
            for (var i = 0; i < 3; i++) {
              var p = wallPoint(b, 0.2 + i * 0.3);
              hooks.spawnEnemy("bomber", p.x, p.y, G);
            }
          } },
      },
      // Điểm yếu §5: sau quét viền, gai tắt 2.5s → áp sát bắn thân ×2
      damageMult: function (b) { return b.exposed > 0 ? 2 : 1; },
      update: function (b, dt, G) {
        if (b.exposed > 0) b.exposed -= dt;
        if (b.rainGlow > 0) b.rainGlow -= dt;
        var w = W.innerWidth || 900, h = W.innerHeight || 600;
        if (b.sweep) {
          var sw = b.sweep; sw.t += dt;
          var per = 2 * (w + h);
          sw.segs.forEach(function (sg) {
            sg.dist = (sg.dist || 0) + sg.dir * dt * per / sw.dur; // px dọc chu vi
          });
          // Tàu chạm viền lúc quét → mất 2 máu (§5)
          var s = G.ship, m = 34;
          var onEdge = s.x < m || s.x > w - m || s.y < m || s.y > h - m;
          b.edgeHurtT = (b.edgeHurtT || 0) - dt;
          if (onEdge && b.edgeHurtT <= 0) { hooks.hurtShip(2, s.x, s.y); b.edgeHurtT = 0.6; }
          if (sw.t >= sw.dur) {
            b.sweep = null; b.splitWall = false;
            b.exposed = 2.5; // §5: gai tắt 2.5s = cửa sổ phản công
            b.wall.edge = "top"; b.wall.pos = 0.5;
            float(b.x, b.y - 60, "GAI TẮT — ÁP SÁT!", "#ffd479", true, G);
            sfx("up", "gem");
          }
        } else {
          // Trượt dọc viền như rắn lửa
          b.wall.pos += dt * 0.12 * (b.phase >= 3 ? 1.5 : 1);
          if (b.wall.pos > 1) { b.wall.pos = 0; b.wall.edge = nextEdge(b.wall.edge); }
        }
        var p = wallPoint(b, b.wall.pos);
        b.x = p.x; b.y = p.y;
      },
      draw: function (ctx, b) {
        var p = wallPoint(b, b.wall.pos), w = W.innerWidth || 900, h = W.innerHeight || 600;
        var horiz = b.wall.edge === "top" || b.wall.edge === "bottom";
        var len = (horiz ? w : h) / 3, th = 26;
        var exposed = b.exposed > 0;
        var segs = b.splitWall && b.sweep ? b.sweep.segs : [{ edge: b.wall.edge, pos: b.wall.pos }];
        ctx.save();
        segs.forEach(function (sg) {
          var q = wallPoint(b, b.wall.pos);
          if (b.sweep && sg.dist !== undefined) q = pointOnPerimeter(b, sg);
          ctx.save();
          ctx.translate(q.x, q.y);
          if (!horiz) ctx.rotate(Math.PI / 2);
          var glow = b.rainGlow > 0 || (b.sweep && !exposed);
          // thân tường gạch cam
          ctx.fillStyle = exposed ? "#4a4a4a" : (glow ? "#ff3d00" : "#cc5500");
          ctx.fillRect(-len / 2, -th / 2, len, th);
          ctx.fillStyle = exposed ? "#333" : "#ff9a3c";
          for (var i = 0; i < 8; i++) ctx.fillRect(-len / 2 + i * (len / 8) + 3, -th / 2 + 3, len / 8 - 6, th - 6);
          // gai tam giác nhấp nháy
          var dirY = b.wall.edge === "top" ? 1 : (b.wall.edge === "bottom" ? -1 : 0);
          var dirX = b.wall.edge === "left" ? 1 : (b.wall.edge === "right" ? -1 : 0);
          ctx.fillStyle = exposed ? "#555" : (glow ? "#ff2222" : "#ffb03c");
          var blink = Math.sin((b.t || 0) * 12) > 0 ? 1 : 0.6;
          ctx.globalAlpha = exposed ? 0.5 : blink;
          for (var g = 0; g < 10; g++) {
            var gx = -len / 2 + g * (len / 10) + len / 20;
            ctx.beginPath();
            if (horiz) { ctx.moveTo(gx - 7, dirY * th / 2); ctx.lineTo(gx + 7, dirY * th / 2); ctx.lineTo(gx, dirY * (th / 2 + 20)); }
            else { ctx.moveTo(dirX * th / 2, gx - 7); ctx.lineTo(dirX * th / 2, gx + 7); ctx.lineTo(dirX * (th / 2 + 20), gx); }
            ctx.closePath(); ctx.fill();
          }
          ctx.globalAlpha = 1;
          ctx.restore();
        });
        ctx.restore();
      },
    },

    /* ---------------- BOSS 3 — TRỌNG TÂM HỖN LOẠN (ải 3) ---------------- */
    {
      id: "chaos", stage: 3, nameVi: "TRỌNG TÂM HỖN LOẠN", nameEn: "CHAOS CORE",
      bannerTitle: "⚠ BOSS: TRỌNG TÂM HỖN LOẠN", bannerTitleEn: "⚠ BOSS: CHAOS CORE",
      bannerSub: "Ngừng bắn lúc hút — dồn đạn lúc quá tải!", bannerSubEn: "Hold fire while it sucks — burst when it overloads!",
      expDps: 18, color: "#9D4EDD", r: 46,
      hpAt: function (d) { return Math.round(18 * 150 * resolveDiff(d).bossHpMul); },
      attacksP1: ["pull", "mines"],
      phases: [
        { hpAt: 0.66, attacks: ["pull", "mines", "yank"] },
        { hpAt: 0.33, attacks: ["pullYank", "mines8", "yank"] },
      ],
      attacks: {
        pull: { tele: 1.0, recover: 0.8, cd: 11, warnSfx: "warn", warnText: "XUNG HÚT — ngừng bắn!",
          telegraph: function (b, G, dur) { addTele(b, "pullRing", dur, {}); },
          fire: function (b, G) { b.pullT = 2; sfx("boss_roar"); } },
        pullYank: { tele: 1.0, recover: 0.8, cd: 10, warnSfx: "warn", warnText: "HÚT + GIẬT CÙNG LÚC!",
          telegraph: function (b, G, dur) { addTele(b, "pullRing", dur, {}); },
          fire: function (b, G) { b.pullT = 2; b.yankDuring = 2; sfx("boss_roar"); } },
        mines: { tele: 0.8, recover: 0.6, cd: 8, warnSfx: "warn", warnText: "Mìn quỹ đạo!",
          telegraph: function (b, G, dur) { addTele(b, "roar", dur, {}); },
          fire: function (b, G) { dropMines(b, 4, G); } },
        mines8: { tele: 0.8, recover: 0.6, cd: 7, warnSfx: "warn", warnText: "Mìn dày đặc!",
          telegraph: function (b, G, dur) { addTele(b, "roar", dur, {}); },
          fire: function (b, G) { dropMines(b, 8, G); b.ringSpdMul = 2; } },
        yank: { tele: 0.9, recover: 0.8, cd: 12, warnSfx: "warn", warnText: "Nó đang KÉO cửa sổ!",
          telegraph: function (b, G, dur) { addTele(b, "yankWarn", dur, {}); },
          fire: function (b, G) { yankWindow(3, G); } },
      },
      // Điểm yếu §5: sau xung hút, quá tải 3s (xám, đứng yên) → ×2
      damageMult: function (b) { return b.overload > 0 ? 2 : 1; },
      update: function (b, dt, G) {
        var w = W.innerWidth || 900, h = W.innerHeight || 600;
        b.ringAng = (b.ringAng || 0) + dt * (b.ringSpdMul || 1) * 1.2;
        if (b.overload > 0) {
          b.overload -= dt; // quá tải: xám, đứng yên, ngừng hút
          if (b.overload <= 0) float(b.x, b.y - 60, "Hết quá tải!", "#9D4EDD", false, G);
        } else if (!(b.pullT > 0)) {
          // Lơ lửng đường sin
          b.t2 = (b.t2 || 0) + dt;
          b.x = w / 2 + Math.sin(b.t2 * 0.5) * w * 0.32;
          b.y = h * 0.35 + Math.sin(b.t2 * 0.9) * 70;
        }
        // Xung hút 2s: hút tàu + đạn người chơi (đạn bị vô hiệu)
        if (b.pullT > 0) {
          b.pullT -= dt;
          var s = G.ship, a = angTo(s.x, s.y, b.x, b.y), d = dist(s.x, s.y, b.x, b.y);
          if (d > 90) { s.x += Math.cos(a) * 260 * dt; s.y += Math.sin(a) * 260 * dt; }
          if (G.bullets) {
            for (var i = G.bullets.length - 1; i >= 0; i--) {
              var pb = G.bullets[i], pa = angTo(pb.x, pb.y, b.x, b.y), pd = dist(pb.x, pb.y, b.x, b.y);
              pb.vx = Math.cos(pa) * 500; pb.vy = Math.sin(pa) * 500;
              if (pd < 44) { pb.life = 0; pb.dead = true; burst(pb.x, pb.y, 3, ["#9D4EDD"], 120, G); }
            }
          }
          if (b.yankDuring > 0) { // P3: hút + giật đồng thời
            b.yankDuring -= dt; b.yankT = (b.yankT || 0) - dt;
            if (b.yankT <= 0) { b.yankT = 0.6; yankWindow(1, G); }
          }
          if (b.pullT <= 0) {
            b.overload = 3; // §5: quá tải 3s sau hút
            float(b.x, b.y - 60, "QUÁ TẢI — DỒN ĐẠN! ×2", "#ffd479", true, G);
            sfx("up", "gem");
          }
        }
        // Mìn quỹ đạo trôi theo vành
        if (b.mines) {
          for (var m = b.mines.length - 1; m >= 0; m--) {
            var mn = b.mines[m];
            mn.ang += dt * (b.ringSpdMul || 1) * 0.9;
            mn.x = b.x + Math.cos(mn.ang) * mn.rr; mn.y = b.y + Math.sin(mn.ang) * mn.rr;
            mn.t -= dt;
            var sd = dist(mn.x, mn.y, G.ship.x, G.ship.y);
            if (sd < 26 || mn.t <= 0) {
              ring(mn.x, mn.y, 90, "#9D4EDD", 0.5, G);
              burst(mn.x, mn.y, 16, ["#9D4EDD", "#fff"], 260, G);
              if (sd < 90) hooks.hurtShip(1, mn.x, mn.y);
              b.mines.splice(m, 1);
              sfx("boom");
            }
          }
        }
      },
      draw: function (ctx, b) {
        var x = b.x, y = b.y;
        var overloaded = b.overload > 0, flash = b.flash > 0;
        ctx.save(); ctx.translate(x, y);
        // 3 vành quỹ đạo xoay
        for (var i = 0; i < 3; i++) {
          ctx.save(); ctx.rotate((b.ringAng || 0) + i * Math.PI / 3);
          ctx.strokeStyle = overloaded ? "#555" : (flash ? "#fff" : "#9D4EDD");
          ctx.lineWidth = 3; ctx.globalAlpha = 0.8;
          ctx.beginPath(); ctx.ellipse(0, 0, 62 + i * 16, 34 + i * 10, 0, 0, Math.PI * 2); ctx.stroke();
          ctx.restore();
        }
        ctx.globalAlpha = 1;
        // lõi cầu tím (xám khi quá tải)
        var g = ctx.createRadialGradient(0, 0, 4, 0, 0, 46);
        if (overloaded) { g.addColorStop(0, "#999"); g.addColorStop(1, "#444"); }
        else if (flash) { g.addColorStop(0, "#fff"); g.addColorStop(1, "#c084fc"); }
        else { g.addColorStop(0, "#e9d5ff"); g.addColorStop(0.5, "#9D4EDD"); g.addColorStop(1, "#4c1d95"); }
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(0, 0, 40, 0, Math.PI * 2); ctx.fill();
        // biểu tượng nam châm ở tâm
        ctx.strokeStyle = overloaded ? "#222" : "#fff"; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(0, -4, 12, Math.PI, 0); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-12, -4); ctx.lineTo(-12, 10); ctx.moveTo(12, -4); ctx.lineTo(12, 10); ctx.stroke();
        // phồng to khi telegraph hút
        if (b.pullT > 0 || hasTele(b, "pullRing")) {
          ctx.strokeStyle = "#e9d5ff"; ctx.lineWidth = 3;
          var pr = 46 + (1 - (b.pullT > 0 ? b.pullT / 2 : 0)) * 40;
          ctx.globalAlpha = 0.7; ctx.beginPath(); ctx.arc(0, 0, pr, 0, Math.PI * 2); ctx.stroke();
          ctx.globalAlpha = 1;
        }
        // mìn trên vành
        if (b.mines) b.mines.forEach(function (mn) {
          ctx.fillStyle = "#f43f5e";
          ctx.beginPath(); ctx.arc(mn.x - x, mn.y - y, 9, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(mn.x - x, mn.y - y, 3, 0, Math.PI * 2); ctx.fill();
        });
        ctx.restore();
      },
    },

    /* ---------------- BOSS 4 — MÀN ĐÊM VÔ TẬN (ải 4) ---------------- */
    {
      id: "night", stage: 4, nameVi: "MÀN ĐÊM VÔ TẬN", nameEn: "ENDLESS NIGHT",
      bannerTitle: "⚠ BOSS: MÀN ĐÊM VÔ TẬN", bannerTitleEn: "⚠ BOSS: ENDLESS NIGHT",
      bannerSub: "Bắn vào con ngươi lúc nó sáng rực!", bannerSubEn: "Shoot the pupil when it blazes!",
      expDps: 22, color: "#1a0533", r: 60,
      hpAt: function (d) { return Math.round(22 * 150 * resolveDiff(d).bossHpMul); },
      attacksP1: ["sweepLaser", "phantoms"],
      phases: [
        { hpAt: 0.66, attacks: ["sweepLaser", "phantoms", "darkZones"] },
        { hpAt: 0.33, attacks: ["xLaser", "phantoms", "zones3"] },
      ],
      attacks: {
        sweepLaser: { tele: 1.0, recover: 0.8, cd: 8, warnSfx: "warn", warnText: "Tia quét — bay lên/xuống!",
          telegraph: function (b, G, dur) {
            var h = W.innerHeight || 600;
            var y = h * (0.3 + Math.random() * 0.4);
            b.laserY = y; // giữ vị trí telegraph — fire() dùng lại, không nhảy về giữa
            b.eyeFlare = dur + 0.3; // §5: mắt sáng rực = telegraph điểm yếu
            addTele(b, "laserLines", dur, { y1: y - 26, y2: y + 26, dir: 1 });
          },
          fire: function (b, G) { b.laser = { t: 1.6, fromTele: true }; sfx("shoot", "thud"); } },
        xLaser: { tele: 1.2, recover: 1.0, cd: 9, warnSfx: "warn", warnText: "Tia chữ X!",
          telegraph: function (b, G, dur) {
            b.eyeFlare = dur + 0.3;
            addTele(b, "laserX", dur, { rot: 0 });
          },
          fire: function (b, G) { b.laserX = { t: 2.0, rot: 0 }; sfx("shoot", "thud"); } },
        phantoms: { tele: 0.8, recover: 0.6, cd: 10, warnSfx: "boss_roar", warnText: "Bóng ma trỗi dậy!",
          telegraph: function (b, G, dur) { addTele(b, "roar", dur, {}); },
          fire: function (b, G) {
            var w = W.innerWidth || 900, h = W.innerHeight || 600;
            for (var i = 0; i < 3; i++) hooks.spawnEnemy("phantom", Math.random() * w, Math.random() * h * 0.6, G);
          } },
        darkZones: { tele: 0.8, recover: 0.6, cd: 14, warnSfx: "warn", warnText: "Vùng tối di động!",
          telegraph: function (b, G, dur) { addTele(b, "roar", dur, {}); },
          fire: function (b, G) { spawnDarkZones(b, 2, G); } },
        zones3: { tele: 0.8, recover: 0.6, cd: 12, warnSfx: "warn", warnText: "Bóng tối nuốt sân!",
          telegraph: function (b, G, dur) { addTele(b, "roar", dur, {}); },
          fire: function (b, G) { spawnDarkZones(b, 3, G); } },
      },
      // Điểm yếu §5: mắt sáng rực 1s trước đòn → bắn vào con ngươi ×1.5
      damageMult: function (b, x, y) {
        if (!(b.eyeFlare > 0) || !b.eyePos) return 1;
        for (var i = 0; i < b.eyePos.length; i++) {
          if (dist(x, y, b.eyePos[i].x, b.eyePos[i].y) < 30) return 1.5;
        }
        return 1;
      },
      update: function (b, dt, G) {
        var w = W.innerWidth || 900, h = W.innerHeight || 600;
        if (b.eyeFlare > 0) b.eyeFlare -= dt;
        // Mất điện 50% thời gian fight (§5)
        b.darkT = (b.darkT || 0) + dt;
        var cyc = 12;
        b.isDark = (b.darkT % cyc) > cyc / 2;
        // Mắt trôi (2 mắt; P3: 4 mắt)
        b.t2 = (b.t2 || 0) + dt;
        var nEyes = b.phase >= 3 ? 4 : 2;
        b.eyePos = [];
        for (var i = 0; i < nEyes; i++) {
          b.eyePos.push({
            x: w / 2 + Math.sin(b.t2 * 0.4 + i * 1.7) * w * 0.3,
            y: h * 0.3 + Math.cos(b.t2 * 0.55 + i * 2.1) * 90,
          });
        }
        b.x = b.eyePos[0].x; b.y = b.eyePos[0].y;
        // Tia quét ngang: dải laser di chuyển dọc
        if (b.laser) {
          b.laser.t -= dt;
          if (!b.laser.y) {
            b.laser.y = (b.laserY != null ? b.laserY : h / 2);
            b.laser.vy = (G.ship.y > b.laser.y ? 1 : -1) * 160;
          }
          b.laser.y += b.laser.vy * dt;
          b.laserHurtT = (b.laserHurtT || 0) - dt;
          if (Math.abs(G.ship.y - b.laser.y) < 40 && b.laserHurtT <= 0) {
            hooks.hurtShip(1, G.ship.x, G.ship.y); b.laserHurtT = 0.5;
          }
          if (b.laser.t <= 0 || b.laser.y < -40 || b.laser.y > h + 40) b.laser = null;
        }
        // Tia chữ X xoay chậm
        if (b.laserX) {
          b.laserX.t -= dt; b.laserX.rot += dt * 0.5;
          b.laserHurtT = (b.laserHurtT || 0) - dt;
          if (b.laserHurtT <= 0 && nearXBeam(G.ship.x, G.ship.y, b, w, h)) {
            hooks.hurtShip(1, G.ship.x, G.ship.y); b.laserHurtT = 0.5;
          }
          if (b.laserX.t <= 0) b.laserX = null;
        }
        // Vùng tối di động 8s (đèn pin không xuyên — alpha 1)
        if (b.zones) {
          for (var z = b.zones.length - 1; z >= 0; z--) {
            var zn = b.zones[z];
            zn.t -= dt; zn.x += zn.vx * dt; zn.y += zn.vy * dt;
            if (zn.x < 90 || zn.x > w - 90) zn.vx *= -1;
            if (zn.y < 90 || zn.y > h - 90) zn.vy *= -1;
            if (zn.t <= 0) b.zones.splice(z, 1);
          }
        }
      },
      draw: function (ctx, b) {
        var w = W.innerWidth || 900, h = W.innerHeight || 600;
        ctx.save();
        // Mất điện 50%: phủ tối (coordinator vẽ overlay chính; đây là lớp boss)
        if (b.isDark) { ctx.fillStyle = "rgba(0,0,0,0.55)"; ctx.fillRect(0, 0, w, h); }
        // Outline tím lóe khi tấn công / khi đèn sáng
        var attacking = b.laser || b.laserX || b.eyeFlare > 0;
        // Đôi mắt đỏ khổng lồ
        (b.eyePos || []).forEach(function (e, i) {
          var flare = b.eyeFlare > 0;
          var er = (b.phase >= 3 ? 24 : 30) * (flare ? 1.25 : 1);
          // tròng trắng lóe outline tím
          if (!b.isDark || attacking) {
            ctx.strokeStyle = "rgba(168,85,247," + (attacking ? 0.9 : 0.35) + ")";
            ctx.lineWidth = 3;
            ctx.beginPath(); ctx.ellipse(e.x, e.y, er + 8, er * 0.7 + 6, 0, 0, Math.PI * 2); ctx.stroke();
          }
          // mắt đỏ (+ sáng rực khi telegraph điểm yếu)
          var g = ctx.createRadialGradient(e.x, e.y, 2, e.x, e.y, er);
          if (flare) { g.addColorStop(0, "#fff"); g.addColorStop(0.4, "#ffdd44"); g.addColorStop(1, "#ff2222"); }
          else { g.addColorStop(0, "#ff6666"); g.addColorStop(1, "#990000"); }
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.ellipse(e.x, e.y, er, er * 0.72, 0, 0, Math.PI * 2); ctx.fill();
          // con ngươi
          ctx.fillStyle = "#050505";
          var px = e.x + Math.cos(b.t2 || 0) * 4, py = e.y + Math.sin((b.t2 || 0) * 1.3) * 3;
          ctx.beginPath(); ctx.arc(px, py, er * 0.28, 0, Math.PI * 2); ctx.fill();
          if (b.phase >= 3 && i % 2 === 1) { // P3: đánh dấu cặp mắt thứ hai
            ctx.strokeStyle = "#ff9a3c"; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(e.x, e.y, er + 14, 0, Math.PI * 2); ctx.stroke();
          }
        });
        // Tia laser đang quét ngang
        if (b.laser && b.laser.y != null) {
          ctx.fillStyle = "rgba(255,40,40,0.85)";
          ctx.fillRect(0, b.laser.y - 16, w, 32);
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, b.laser.y - 3, w, 6);
        }
        // Tia chữ X xoay
        if (b.laserX) {
          ctx.save(); ctx.translate(w / 2, h / 2); ctx.rotate(b.laserX.rot);
          ctx.fillStyle = "rgba(255,40,40,0.8)";
          ctx.fillRect(-w, -16, w * 2, 32);
          ctx.save(); ctx.rotate(Math.PI / 2);
          ctx.fillRect(-w, -16, w * 2, 32);
          ctx.restore(); ctx.restore();
        }
        // Vùng tối di động (đen đặc — đèn pin không xuyên)
        if (b.zones) b.zones.forEach(function (zn) {
          ctx.fillStyle = "rgba(0,0,0,1)";
          ctx.beginPath(); ctx.arc(zn.x, zn.y, zn.r, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = "rgba(120,40,180,0.6)"; ctx.lineWidth = 2;
          ctx.setLineDash([6, 6]);
          ctx.beginPath(); ctx.arc(zn.x, zn.y, zn.r, 0, Math.PI * 2); ctx.stroke();
          ctx.setLineDash([]);
        });
        ctx.restore();
      },
    },

    /* ---------------- BOSS 5 — NULL POINTER (ải 5, boss cuối) ---------------- */
    {
      id: "null", stage: 5, nameVi: "NULL POINTER", nameEn: "NULL POINTER",
      bannerTitle: "⚠ BOSS CUỐI: NULL POINTER", bannerTitleEn: "⚠ FINAL BOSS: NULL POINTER",
      bannerSub: "20 giây. Giết nó trước khi cửa sổ về 0!", bannerSubEn: "20 seconds. Kill it before the window hits 0!",
      expDps: 26, color: "#f43f5e", r: 52,
      hpAt: function (d) { return Math.round(26 * 150 * resolveDiff(d).bossHpMul); },
      attacksP1: ["sysChew", "ghostSpikes"],
      phases: [
        { hpAt: 0.66, attacks: ["sysChew", "ghostSpikes", "chaos", "cursorRain"] },
        { hpAt: 0.33, attacks: ["countdown"] },
      ],
      attacks: {
        sysChew: { tele: 1.0, recover: 0.8, cd: 12, warnSfx: "warn", warnText: "Nó bám viền gặm hệ thống!",
          telegraph: function (b, G, dur) {
            var w = W.innerWidth || 900, h = W.innerHeight || 600;
            var edges = ["top", "right", "bottom", "left"];
            var best = "top", bd = 1e9;
            edges.forEach(function (e) {
              var p = { top: [b.x, 0], right: [w, b.y], bottom: [b.x, h], left: [0, b.y] }[e];
              var d = dist(b.x, b.y, p[0], p[1]);
              if (d < bd) { bd = d; best = e; }
            });
            b.chewEdge = best;
            addTele(b, "edgeGlow", dur, { edge: best });
          },
          fire: function (b, G) {
            b.latched = true; b.latchT = 6; b.chewT = 0;
            hooks.spawnEnemy("chewer", b.x - 60, b.y, G);
            hooks.spawnEnemy("chewer", b.x + 60, b.y, G);
            hooks.spawnEnemy("chewer", b.x, b.y - 60, G);
            hooks.spawnEnemy("chewer", b.x, b.y + 60, G);
            sfx("shrink", "thud");
          } },
        ghostSpikes: { tele: 0.8, recover: 0.6, cd: 11, warnSfx: "warn", warnText: "Viền gai ma!",
          telegraph: function (b, G, dur) {
            var edges = ["top", "right", "bottom", "left"];
            b.ghostEdgePick = edges[Math.floor(Math.random() * 4)];
            addTele(b, "edgeGlow", dur, { edge: b.ghostEdgePick, ghost: true });
          },
          fire: function (b, G) {
            b.ghostEdge = { edge: b.ghostEdgePick, t: 6 };
            sfx("warn", "thud");
          } },
        chaos: { tele: 1.0, recover: 0.8, cd: 16, warnSfx: "warn", warnText: "NHIỄU LOẠN — đèn tắt!",
          telegraph: function (b, G, dur) { addTele(b, "roar", dur, {}); },
          fire: function (b, G) {
            // Tái hiện ải 3+4: tắt đèn 4s + trơn trượt toàn sân 10s
            G.bossFx = { dark: 4, slip: 10 };
            b.invisible = 4; // chỉ còn mắt đỏ
            float(b.x, b.y - 70, "TẮT ĐÈN 4s — TRƠN 10s!", "#ff5470", true, G);
            sfx("over", "thud");
          } },
        cursorRain: { tele: 0.8, recover: 0.6, cd: 9, warnSfx: "warn", warnText: "Mưa con trỏ!",
          telegraph: function (b, G, dur) { addTele(b, "rainGlow", dur, {}); },
          fire: function (b, G) {
            var s = G.ship;
            for (var i = 0; i < 12; i++) {
              var sx = Math.random() * (W.innerWidth || 900);
              var a = angTo(sx, -30, s.x + (Math.random() - 0.5) * 200, s.y);
              hooks.fireEB(sx, -30, Math.cos(a) * 200, Math.sin(a) * 200, G,
                { r: 7, color: "#f43f5e", zig: true, zigT: Math.random() * 6, cursor: true });
            }
            sfx("shoot", "thud");
          } },
        countdown: { tele: 1.2, recover: 0.5, cd: 9999, warnSfx: "boss_roar", warnText: "LỆNH XÓA — GIẾT NÓ NGAY!",
          telegraph: function (b, G, dur) { addTele(b, "roar", dur, {}); },
          fire: function (b, G) {
            var w = W.innerWidth || 900;
            b.x = w / 2; b.y = 150; // đứng yên giơ cao hàm resizeTo
            sfx("boss_roar"); shake(10, 600, 9);
          } },
      },
      // P3 là đua DPS thuần — không có điểm yếu riêng
      damageMult: function () { return 1; },
      update: function (b, dt, G) {
        var w = W.innerWidth || 900, h = W.innerHeight || 600;
        if (b.phase < 3) {
          // P1/P2: lượn lờ + bám viền gặm hệ thống
          if (b.latched) {
            b.latchT -= dt; b.chewT -= dt;
            var p = { top: [b.x, 24], right: [w - 24, b.y], bottom: [b.x, h - 24], left: [24, b.y] }[b.chewEdge || "top"];
            b.x += (p[0] - b.x) * Math.min(1, dt * 4);
            b.y += (p[1] - b.y) * Math.min(1, dt * 4);
            if (b.chewT <= 0) {
              b.chewT = 5; // §5: thu cửa sổ 20px/5s khi bám
              doShrink(20, 15);
              burst(b.x, b.y, 8, ["#f43f5e", "#c084fc"], 200, G);
              sfx("shrink", "thud");
            }
            if (b.latchT <= 0) { b.latched = false; b.chewEdge = null; }
          } else {
            b.t2 = (b.t2 || 0) + dt;
            b.x = w / 2 + Math.sin(b.t2 * 0.6) * w * 0.3;
            b.y = 170 + Math.sin(b.t2 * 1.1) * 60;
          }
          if (b.ghostEdge) {
            b.ghostEdge.t -= dt;
            if (b.ghostEdge.t <= 0) b.ghostEdge = null;
          }
          if (b.invisible > 0) b.invisible -= dt;
          // Viền gai ma: tàu chạm viền đó → 1 dmg + bật vào trong
          if (b.ghostEdge && G.ship) {
            var s = G.ship, m = 30, ge = b.ghostEdge.edge, hit = false;
            if (ge === "top" && s.y < m) hit = true;
            if (ge === "bottom" && s.y > h - m) hit = true;
            if (ge === "left" && s.x < m) hit = true;
            if (ge === "right" && s.x > w - m) hit = true;
            b.ghostHurtT = (b.ghostHurtT || 0) - dt;
            if (hit && b.ghostHurtT <= 0) {
              b.ghostHurtT = 0.8;
              hooks.hurtShip(1, s.x, s.y);
              s.x += (w / 2 - s.x) * 0.15; s.y += (h / 2 - s.y) * 0.15;
            }
          }
        } else {
          // P3 "Lệnh Xóa": đếm ngược 20s — đua DPS
          if (b.countdown > 0) {
            b.countdown -= dt;
            b.shrinkTick = (b.shrinkTick || 0) + dt;
            if (b.shrinkTick >= 5) { // §5: mỗi 5s resizeTo thu 40px
              b.shrinkTick -= 5;
              doShrink(40, 30);
              float(b.x, b.y + 80, "−40px 🪟", "#ff2222", true, G);
              sfx("shrink", "thud"); shake(7, 350, 8);
            }
            // Van xả §16.5: rớt thêm gem giữa fight để lên cấp
            b.gemT = (b.gemT || 0) - dt;
            if (b.gemT <= 0) { b.gemT = 6; hooks.spawnGems(5, b.x + (Math.random() - 0.5) * 200, b.y + 80, G); }
            // Vẫn gây áp lực: đạn quạt + gọi chewer xen kẽ
            b.sideT = (b.sideT || 0) - dt;
            if (b.sideT <= 0) {
              b.sideT = 4;
              var s2 = G.ship, base = angTo(b.x, b.y, s2.x, s2.y);
              for (var i = 0; i < 5; i++) {
                var a = base + (i - 2) * 0.18;
                hooks.fireEB(b.x, b.y + 40, Math.cos(a) * 230, Math.sin(a) * 230, G, { r: 6, color: "#f43f5e" });
              }
              hooks.spawnEnemy("chewer", Math.random() * w, 30, G);
            }
            if (b.countdown <= 0) {
              b.countdown = 0;
              hooks.onTimeout(b, G); // coordinator → die("window")
            }
          }
        }
        b.glitch = (b.glitch || 0) + dt * 8;
      },
      draw: function (ctx, b) {
        var x = b.x, y = b.y;
        ctx.save();
        var jx = (b.invisible > 0) ? 0 : Math.sin(b.glitch) * 4; // glitch rung khi hiện hình
        ctx.translate(x + jx, y);
        if (!(b.invisible > 0)) {
          // Con trỏ chuột khổng lồ bị lỗi (mũi tên vỡ)
          ctx.fillStyle = b.flash > 0 ? "#ffffff" : "#f8fafc";
          ctx.strokeStyle = "#f43f5e"; ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(0, -52); ctx.lineTo(0, 28); ctx.lineTo(18, 12); ctx.lineTo(26, 30);
          ctx.lineTo(34, 24); ctx.lineTo(26, 6); ctx.lineTo(40, 6); ctx.lineTo(40, -2);
          ctx.closePath(); ctx.fill(); ctx.stroke();
          // Pixel tím rơi (đuôi)
          ctx.fillStyle = "#c084fc";
          for (var i = 0; i < 8; i++) {
            var py = 34 + ((b.glitch * 30 + i * 23) % 60);
            ctx.globalAlpha = 0.7 - i * 0.07;
            ctx.fillRect(-14 + (i % 3) * 12, py, 8, 8);
          }
          ctx.globalAlpha = 1;
          // Khung cửa sổ vỡ kéo theo
          ctx.strokeStyle = "#7c3aed"; ctx.lineWidth = 2;
          ctx.strokeRect(-46, -30, 26, 20);
          ctx.beginPath(); ctx.moveTo(-46, -10); ctx.lineTo(-20, -22); ctx.stroke();
          // Hàm resizeTo(0,0) phát sáng đỏ trên tay
          var glow = b.phase >= 3 ? (Math.sin(b.glitch * 2) > 0 ? 1 : 0.4) : 0.7;
          ctx.globalAlpha = glow;
          ctx.fillStyle = "#ff2222";
          ctx.font = "bold 13px monospace"; ctx.textAlign = "center";
          ctx.fillText("resizeTo(0,0)", 0, -62);
          ctx.globalAlpha = 1;
        }
        // Mắt đỏ (luôn hiện — kể cả tàng hình P2)
        ctx.fillStyle = "#ff2222";
        ctx.beginPath(); ctx.arc(-12, -6, 7, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(12, -6, 7, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.beginPath(); ctx.arc(-12, -6, 2.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(12, -6, 2.5, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        // Đếm ngược P3 giữa màn hình
        if (b.phase >= 3 && b.countdown > 0) {
          var w = W.innerWidth || 900;
          ctx.save();
          ctx.textAlign = "center";
          var urgent = b.countdown < 10;
          ctx.globalAlpha = urgent ? (Math.sin(b.glitch * 3) > 0 ? 1 : 0.45) : 1;
          ctx.fillStyle = "#ff2222";
          ctx.font = "bold 64px monospace";
          var mm = Math.floor(b.countdown / 60), ss = Math.floor(b.countdown % 60);
          ctx.fillText(mm + ":" + (ss < 10 ? "0" : "") + ss, w / 2, 120);
          ctx.font = "bold 16px sans-serif";
          ctx.fillText("CỬA SỔ SẼ BỊ XÓA", w / 2, 146);
          ctx.restore();
        }
      },
    },
  ];

  /* ---------------- helpers dùng chung cho boss ---------------- */
  function hasTele(b, kind) {
    for (var i = 0; i < b.teles.length; i++) if (b.teles[i].kind === kind) return true;
    return false;
  }
  function dropMines(b, n, G) {
    b.mines = b.mines || [];
    for (var i = 0; i < n && b.mines.length < 12; i++) {
      var ang = Math.random() * Math.PI * 2, rr = 70 + Math.random() * 40;
      b.mines.push({ ang: ang, rr: rr, x: b.x + Math.cos(ang) * rr, y: b.y + Math.sin(ang) * rr, t: 14 });
    }
    sfx("boom", "thud");
  }
  function yankWindow(times, G) {
    for (var i = 0; i < times; i++) {
      var dx = (Math.random() - 0.5) * 260, dy = (Math.random() - 0.5) * 200;
      doMoveBy(dx, dy);
      if (G && G.ship) float(G.ship.x, G.ship.y - 50, "Giật!", "#9D4EDD", false, G);
    }
    winJitter(18); shake(6, 400, 7);
    sfx("bigboom");
  }
  function wallPoint(b, frac) {
    var w = W.innerWidth || 900, h = W.innerHeight || 600;
    var per = 2 * (w + h), d = ((frac % 1) + 1) % 1 * per;
    return pointOnPerimeter(b, { edge: null, dist: d });
  }
  function pointOnPerimeter(b, sg) {
    var w = W.innerWidth || 900, h = W.innerHeight || 600;
    var d = ((sg.dist % (2 * (w + h))) + 2 * (w + h)) % (2 * (w + h));
    if (d < w) return { x: d, y: 0 };
    if (d < w + h) return { x: w, y: d - w };
    if (d < 2 * w + h) return { x: w - (d - w - h), y: h };
    return { x: 0, y: h - (d - 2 * w - h) };
  }
  function inward(edge) {
    return { top: { x: 0, y: 1 }, bottom: { x: 0, y: -1 }, left: { x: 1, y: 0 }, right: { x: -1, y: 0 } }[edge] || { x: 0, y: 1 };
  }
  function nextEdge(e) {
    return { top: "right", right: "bottom", bottom: "left", left: "top" }[e] || "top";
  }
  function edgePoint(edge) {
    var w = W.innerWidth || 900, h = W.innerHeight || 600;
    return { top: { x: w / 2, y: 0 }, right: { x: w, y: h / 2 },
             bottom: { x: w / 2, y: h }, left: { x: 0, y: h / 2 } }[edge] || { x: w / 2, y: 0 };
  }
  function spawnDarkZones(b, n, G) {
    var w = W.innerWidth || 900, h = W.innerHeight || 600;
    b.zones = b.zones || [];
    for (var i = 0; i < n; i++) {
      b.zones.push({ x: w * (0.25 + Math.random() * 0.5), y: h * (0.25 + Math.random() * 0.5),
        r: 95, t: 8, vx: (Math.random() - 0.5) * 90, vy: (Math.random() - 0.5) * 90 });
    }
  }
  function nearXBeam(px, py, b, w, h) {
    // khoảng cách điểm tới 2 đường chéo qua tâm (xoay rot)
    var cx = w / 2, cy = h / 2, rot = b.laserX.rot;
    var dx = px - cx, dy = py - cy;
    var c = Math.cos(-rot), s = Math.sin(-rot);
    var lx = dx * c - dy * s, ly = dx * s + dy * c;
    var d1 = Math.abs(ly) / Math.SQRT2, d2 = Math.abs(lx) / Math.SQRT2;
    return Math.min(d1, d2) < 26;
  }

  /* ---------------- update/draw/hit/barData ---------------- */
  function pickAttack(b) {
    var list = b.phase === 1 ? b.def.attacksP1 : b.def.phases[b.phase - 2].attacks;
    b.atkIdx = ((b.atkIdx == null ? -1 : b.atkIdx) + 1) % list.length;
    return list[b.atkIdx];
  }
  function updateBoss(dt, G) {
    var b = Bosses.active;
    if (!b || !G) return;
    // AUDIT 2026-10-02 (CRITICAL): trước đây guard có `b.dead` → boss chết bằng đạn
    // (hit() set dead ngoài update) không bao giờ tới được hooks.onBossDead ở cuối hàm
    // → campaign soft-lock: boss biến mất nhưng wave/ải không bao giờ clear.
    // Xả hook đúng 1 lần ngay khi thấy dead, rồi dừng.
    if (b.dead) {
      if (Bosses.active === b && !b._deadFired) {
        b._deadFired = true;
        try { hooks.onBossDead(b, G); } catch (e) {}
      }
      return;
    }
    var def = b.def;
    b.t += dt;
    if (b.flash > 0) b.flash -= dt;
    // Chuyển phase tại 66% / 33% HP
    var f = b.hp / b.maxHp;
    var want = f <= 1 / 3 ? 3 : (f <= 2 / 3 ? 2 : 1);
    if (want > b.phase) enterPhase(b, want, G);
    if (b.stun > 0) { b.stun -= dt; tickTelegraphs(b, dt); return; }
    if (def.update) { try { def.update(b, dt, G); } catch (e) {} }
    // Scheduler đòn
    if (!b.atk) {
      b.atkT -= dt * b.spdMul;
      if (b.atkT <= 0) {
        var key = pickAttack(b), spec = def.attacks[key];
        if (spec) beginAttack(b, key, spec, G);
      }
    } else {
      var a = b.atk;
      a.t -= dt;
      if (a.st === "tele" && a.t <= 0) {
        try { a.spec.fire(b, G); } catch (e) {}
        a.st = "recover"; a.t = a.spec.recover || 0.6;
      } else if (a.st === "recover" && a.t <= 0) {
        b.atk = null;
        b.atkT = (a.spec.cd || 3) / b.spdMul;
      }
    }
    tickTelegraphs(b, dt);
    updateZigzag(dt, G);
    if (b.dead && Bosses.active === b && !b._deadFired) { b._deadFired = true; try { hooks.onBossDead(b, G); } catch (e) {} }
  }
  // Đạn zigzag (boss 5 mưa con trỏ): cập nhật vận tốc mỗi frame
  function updateZigzag(dt, G) {
    if (!G || !G.ebullets) return;
    for (var i = 0; i < G.ebullets.length; i++) {
      var e = G.ebullets[i];
      if (!e.zig || e.dead) continue;
      e.zigT = (e.zigT || 0) + dt * 6;
      var sp = Math.sqrt(e.vx * e.vx + e.vy * e.vy) || 200;
      var base = Math.atan2(e.vy, e.vx);
      var a = base + Math.sin(e.zigT) * 0.5;
      e.vx = Math.cos(a) * sp; e.vy = Math.sin(a) * sp;
    }
  }
  function drawTelegraphs(ctx, b) {
    for (var i = 0; i < b.teles.length; i++) {
      var t = b.teles[i], k = 1 - t.t / t.dur; // 0→1 tiến trình
      var pulse = Math.sin(t.t * 14) > 0 ? 1 : 0.45;
      if (t.kind === "mouth") {
        ctx.save(); ctx.globalAlpha = pulse;
        ctx.strokeStyle = "#ff2222"; ctx.lineWidth = 4;
        var ma = b.mouthAng || 0;
        ctx.beginPath();
        ctx.arc(b.x + Math.cos(ma) * b.r, b.y + Math.sin(ma) * b.r, 34 + k * 10, 0, Math.PI * 2);
        ctx.stroke(); ctx.restore();
      } else if (t.kind === "roar") {
        ctx.save(); ctx.globalAlpha = pulse * 0.8;
        ctx.strokeStyle = "#ffd479"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 14 + k * 60, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 30 + k * 90, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      } else if (t.kind === "slamShadow") {
        var w = W.innerWidth || 900, h = W.innerHeight || 600;
        ctx.save(); ctx.globalAlpha = 0.35 + pulse * 0.4;
        ctx.fillStyle = "#ff2222";
        ctx.beginPath(); ctx.ellipse(t.x, t.y, t.r * (0.6 + k * 0.4), t.r * 0.6 * (0.6 + k * 0.4), 0, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 0.9; ctx.strokeStyle = "#ffd479"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(t.x, t.y, t.r, t.r * 0.6, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      } else if (t.kind === "rainGlow") {
        ctx.save(); ctx.globalAlpha = pulse * 0.5;
        ctx.fillStyle = "#ff2222"; ctx.fillRect(0, 0, W.innerWidth || 900, W.innerHeight || 600);
        ctx.restore();
      } else if (t.kind === "sweepTrail") {
        var w2 = W.innerWidth || 900, h2 = W.innerHeight || 600;
        ctx.save(); ctx.globalAlpha = 0.35 + pulse * 0.4;
        ctx.strokeStyle = "#ff5500"; ctx.lineWidth = 10;
        ctx.strokeRect(8, 8, w2 - 16, h2 - 16);
        ctx.restore();
      } else if (t.kind === "pullRing") {
        ctx.save(); ctx.globalAlpha = pulse;
        ctx.strokeStyle = "#e9d5ff"; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 20 + k * 160, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      } else if (t.kind === "yankWarn") {
        ctx.save(); ctx.globalAlpha = pulse;
        ctx.strokeStyle = "#ffd479"; ctx.lineWidth = 3; ctx.setLineDash([10, 8]);
        ctx.strokeRect(14, 14, (W.innerWidth || 900) - 28, (W.innerHeight || 600) - 28);
        ctx.setLineDash([]); ctx.restore();
      } else if (t.kind === "laserLines") {
        ctx.save(); ctx.globalAlpha = 0.4 + pulse * 0.5;
        ctx.strokeStyle = "#ff2222"; ctx.lineWidth = 5;
        var w3 = W.innerWidth || 900;
        ctx.beginPath(); ctx.moveTo(0, t.y1); ctx.lineTo(w3, t.y1); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, t.y2); ctx.lineTo(w3, t.y2); ctx.stroke();
        ctx.restore();
      } else if (t.kind === "laserX") {
        var w4 = W.innerWidth || 900, h4 = W.innerHeight || 600;
        ctx.save(); ctx.globalAlpha = 0.4 + pulse * 0.5;
        ctx.translate(w4 / 2, h4 / 2); ctx.rotate(t.rot || 0);
        ctx.strokeStyle = "#ff2222"; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(-w4, 0); ctx.lineTo(w4, 0); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, -h4); ctx.lineTo(0, h4); ctx.stroke();
        ctx.restore();
      } else if (t.kind === "edgeGlow") {
        var w5 = W.innerWidth || 900, h5 = W.innerHeight || 600;
        ctx.save(); ctx.globalAlpha = pulse;
        ctx.fillStyle = t.ghost ? "#ffd479" : "#c084fc";
        var m = 14;
        if (t.edge === "top") ctx.fillRect(0, 0, w5, m);
        if (t.edge === "bottom") ctx.fillRect(0, h5 - m, w5, m);
        if (t.edge === "left") ctx.fillRect(0, 0, m, h5);
        if (t.edge === "right") ctx.fillRect(w5 - m, 0, m, h5);
        ctx.restore();
      }
    }
  }

  /* ---------------- public API ---------------- */
  var Bosses = {
    BOSSES: BOSSES,
    active: null,
    G: null,

    setHooks: setHooks,

    startBoss: function (stageId, diff, G) {
      var def = BOSSES[stageId - 1];
      if (!def) return null;
      var d = resolveDiff(diff);
      var w = W.innerWidth || 900, h = W.innerHeight || 600;
      var hp = def.hpAt(d);
      var b = {
        def: def, id: def.id, x: w / 2, y: 150, r: def.r,
        hp: hp, maxHp: hp, t: 0, phase: 1, stun: 0, flash: 0,
        atk: null, atkT: 1.2, atkIdx: -1, spdMul: 1,
        teles: [], teleMul: d.telegraphMul, diff: d,
        dead: false, wall: { edge: "top", pos: 0.5 },
      };
      if (def.id === "firewall") { b.y = 60; }
      this.active = b;
      if (G) { this.G = G; G.boss = b; }
      try { slowmo(0.5, 0.8); } catch (e) {}
      shake(10, 600, 9);
      sfx("boss_roar", "boss");
      hooks.banner((isEn() && def.bannerTitleEn) ? def.bannerTitleEn : def.bannerTitle,
                   (isEn() && def.bannerSubEn) ? def.bannerSubEn : def.bannerSub);
      return b;
    },

    update: function (dt, G) { updateBoss(dt, G || this.G); },

    draw: function (ctx, G) {
      var b = this.active;
      if (!b || b.dead || !ctx) return;
      try { drawTelegraphs(ctx, b); } catch (e) {}
      try { b.def.draw(ctx, b); } catch (e) {}
      // Viền gai ma boss 5
      var ge = this.ghostEdge(b);
      if (ge) {
        var w = W.innerWidth || 900, h = W.innerHeight || 600, m = 16;
        var blink = Math.sin((b.t || 0) * 10) > 0 ? 1 : 0.4;
        ctx.save(); ctx.globalAlpha = blink; ctx.fillStyle = "#ffd479";
        if (ge.edge === "top") ctx.fillRect(0, 0, w, m);
        if (ge.edge === "bottom") ctx.fillRect(0, h - m, w, m);
        if (ge.edge === "left") ctx.fillRect(0, 0, m, h);
        if (ge.edge === "right") ctx.fillRect(w - m, 0, m, h);
        ctx.restore();
      }
    },

    // Engine GỌI HÀM NÀY khi đạn trúng boss (thay vì trừ hp trực tiếp)
    hit: function (b, dmg, x, y, G) {
      if (!b || b.dead) return 0;
      var mult = 1;
      try { mult = b.def.damageMult ? b.def.damageMult(b, x == null ? b.x : x, y == null ? b.y : y) : 1; } catch (e) {}
      if (!(mult > 0)) mult = 1;
      var dealt = dmg * mult;
      b.hp -= dealt; b.flash = 0.15;
      if (mult > 1 && G) float(x, y - 18, "×" + mult + "!", "#ffd479", false, G);
      if (b.hp <= 0) { b.hp = 0; b.dead = true; }
      return dealt;
    },

    barData: function (b) {
      b = b || this.active;
      if (!b) return null;
      return { hp: b.hp, maxHp: b.maxHp, phase: b.phase,
               countdown: b.countdown > 0 ? b.countdown : null,
               nameVi: b.def.nameVi, nameEn: b.def.nameEn, bannerTitle: b.def.bannerTitle, isEn: isEn() };
    },

    isDark: function (b) { b = b || this.active; return !!(b && b.isDark); },
    inDarkness: function (b, x, y) {
      b = b || this.active;
      if (!b || !b.zones) return false;
      for (var i = 0; i < b.zones.length; i++) {
        var zn = b.zones[i];
        var dx = x - zn.x, dy = y - zn.y;
        if (dx * dx + dy * dy < zn.r * zn.r) return true;
      }
      return false;
    },
    ghostEdge: function (b) {
      b = b || this.active;
      return b && b.ghostEdge && b.ghostEdge.t > 0 ? b.ghostEdge : null;
    },

    stop: function () {
      if (this.G) { try { this.G.boss = null; } catch (e) {} }
      this.active = null;
    },
  };

  W.Bosses = Bosses;
})();
