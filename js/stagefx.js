/* =====================================================================
 * js/stagefx.js — WINDOWKILL v2 · 4 MECHANIC ẢI (stage mechanics)
 * Spec: studio/game-design/GAME-DESIGN-DOC.md §4 (mechanic từng ải),
 *       §8.2 (modifier theo độ khó), §15 (mechanic flags)
 *
 * Kiến trúc: IIFE, expose window.StageFX. KHÔNG sửa file có sẵn.
 * Coordinator: StageFX.enter(stageId, G, diff) khi vào ải/wave 10 boss,
 * StageFX.update(dt, G) + StageFX.draw(ctx, G) mỗi frame, StageFX.exit()
 * khi hết ải. Diff đọc từ difficulty.config.json — hằng số dưới chỉ fallback.
 *
 * Ải 2 viền gai · Ải 3 trơn trượt · Ải 4 mất điện · Ải 5 vùng thu hẹp.
 * ===================================================================== */
(function () {
  "use strict";
  var W = (typeof window !== "undefined") ? window : globalThis;

  /* ---------------- helpers an toàn ---------------- */
  function sfx(name, fallback) {
    try {
      var A = W.AudioEngine;
      if (A && A.sfx) {
        if (typeof A.sfx[name] === "function") { A.sfx[name](); return; }
        if (fallback && typeof A.sfx[fallback] === "function") A.sfx[fallback]();
      }
    } catch (e) {}
  }
  function float(x, y, text, color, big, G) {
    if (G && Array.isArray(G.floats)) G.floats.push({ x: x, y: y, text: text, color: color || "#fff", t: 0, life: 1.4, big: !!big });
  }
  function burst(x, y, n, colors, spd, G) {
    if (!G || !Array.isArray(G.parts)) return;
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, s = (0.3 + Math.random() * 0.7) * (spd || 260);
      G.parts.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        t: 0, life: 0.4 + Math.random() * 0.5, c: colors[i % colors.length], sz: 2 + Math.random() * 3.5 });
    }
  }
  function hurtShip(dmg, x, y) {
    // Đi qua engine global (có iframes/shield logic trong game.js)
    try { if (typeof W.hurtShip === "function") W.hurtShip(dmg, x, y); } catch (e) {}
  }
  function doMoveBy(dx, dy) {
    try { if (typeof W.pushWindow === "function") { W.pushWindow(dx, dy); return "push"; } } catch (e) {}
    try { if (typeof pushWindow === "function") { pushWindow(dx, dy); return "push"; } } catch (e) {}
    try { if (W.moveBy) { W.moveBy(dx, dy); return "direct"; } } catch (e) {}
    return "none";
  }
  function winOk() {
    try { if (W.winCtrl && typeof W.winCtrl.ok === "boolean") return W.winCtrl.ok; } catch (e) {}
    try { if (typeof winCtrl !== "undefined" && winCtrl && typeof winCtrl.ok === "boolean") return winCtrl.ok; } catch (e) {}
    return true;
  }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function dist(ax, ay, bx, by) { var dx = bx - ax, dy = by - ay; return Math.sqrt(dx * dx + dy * dy); }

  /* ---------------- diff fallbacks (§8.2) ---------------- */
  var DIFF_DEFAULTS = {
    spikesOn: 4, spikesOff: 2,        // Ải 2: Chill 3/3 · Thường 4/2 · Khắc nghiệt 5/1.5
    friction: 0.985,                  // Ải 3 trơn trượt
    blackoutCycle: 20, blackoutDark: 6, // Ải 4: Chill 22/4 · Thường 20/6 · Khắc nghiệt 18/8
    shrinkPx: 8, shrinkEvery: 10,     // Ải 5: Chill 5 · Thường 8 · Khắc nghiệt 12 (px/10s)
    shrinkMinPct: 0.35, shrinkMaxPct: 0.90,
    patchGrow: 30,                    // pickup patch xanh +30px
  };
  function resolveDiff(d) {
    d = d || {};
    var o = {};
    for (var k in DIFF_DEFAULTS) o[k] = (d[k] != null ? d[k] : DIFF_DEFAULTS[k]);
    return o;
  }

  /* =====================================================================
     MODULE 1 — ẢI 2 "TƯỜNG LỬA": VIỀN GAI (§4 ải 2)
     Chu kỳ 6s: bật 4s gây sát thương / tắt 2s an toàn (theo diff §8.2).
     - Quái chạm viền lúc bật: ăn sát thương lớn (chewer bám tự chết ~4s).
     - Tàu chạm viền lúc bật: mất 1 máu + bị đẩy bật vào trong.
     ===================================================================== */
  var spikes = {
    id: "spikes", nameVi: "Viền gai",
    st: null,
    enter: function (G, diff) {
      var d = resolveDiff(diff);
      this.st = { on: d.spikesOn, off: d.spikesOff, t: 0, isOn: true, hurtT: 0, m: 16 };
      this.diff = d;
    },
    isOn: function () { return !!(this.st && this.st.isOn); },
    // Khung viền trong canvas để check va chạm AABB
    frameHit: function (x, y, G) {
      var w = W.innerWidth || 900, h = W.innerHeight || 600, m = this.st.m;
      return x < m || x > w - m || y < m || y > h - m;
    },
    update: function (dt, G) {
      var st = this.st; if (!st) return;
      st.t += dt;
      var cyc = st.on + st.off;
      if (st.t >= cyc) st.t -= cyc;
      var wasOn = st.isOn;
      st.isOn = st.t < st.on;
      if (st.isOn !== wasOn) { // đổi trạng thái → cue
        sfx(st.isOn ? "warn" : "up", "thud");
        if (!st.isOn && G && G.ship) float(G.ship.x, G.ship.y - 40, "Gai tắt — an toàn!", "#9df3ff", false, G);
      }
      if (!st.isOn || !G) return;
      // Quái chạm viền lúc bật: ăn sát thương lớn
      if (G.enemies) {
        for (var i = G.enemies.length - 1; i >= 0; i--) {
          var e = G.enemies[i];
          if (e.dead) continue;
          if (this.frameHit(e.x, e.y, G)) {
            e.hp = (e.hp || 1) - 30 * dt; // ~4s chewer bám tự chết
            if (Math.random() < dt * 8) burst(e.x, e.y, 2, ["#ff9a3c", "#ff2222"], 140, G);
            if (e.hp <= 0 && !e.dead) {
              e.dead = true;
              if (G.kills != null) G.kills++;
              burst(e.x, e.y, 10, ["#ff9a3c"], 200, G);
            }
          }
        }
      }
      // Tàu chạm viền lúc bật: mất 1 máu + bật vào trong
      var s = G.ship;
      if (s && this.frameHit(s.x, s.y, G)) {
        st.hurtT -= dt;
        if (st.hurtT <= 0) {
          st.hurtT = 0.8;
          hurtShip(1, s.x, s.y);
          var w = W.innerWidth || 900, h = W.innerHeight || 600;
          var cx = w / 2, cy = h / 2;
          var a = Math.atan2(cy - s.y, cx - s.x);
          s.x += Math.cos(a) * 60; s.y += Math.sin(a) * 60; // đẩy bật vào trong
          s.x = clamp(s.x, st.m + 10, w - st.m - 10);
          s.y = clamp(s.y, st.m + 10, h - st.m - 10);
          float(s.x, s.y - 30, "Gai đâm!", "#ff9a3c", false, G);
        }
      }
    },
    draw: function (ctx, G) {
      var st = this.st; if (!st) return;
      var w = W.innerWidth || 900, h = W.innerHeight || 600, m = st.m;
      var on = st.isOn;
      var blink = on ? (Math.sin((G && G.time || 0) * 10) > 0 ? 1 : 0.55) : 0.35;
      ctx.save();
      ctx.globalAlpha = blink;
      ctx.strokeStyle = on ? "#ff5500" : "#555";
      ctx.lineWidth = 3;
      ctx.strokeRect(m, m, w - m * 2, h - m * 2);
      // Gai tam giác quanh khung
      ctx.fillStyle = on ? "#ff9a3c" : "#444";
      var step = 34, dir = 1;
      function spikeRow(x0, y0, x1, y1, nx, ny) {
        var len = dist(x0, y0, x1, y1), n = Math.floor(len / step);
        for (var i = 0; i <= n; i++) {
          var px = x0 + (x1 - x0) * i / n, py = y0 + (y1 - y0) * i / n;
          ctx.beginPath();
          ctx.moveTo(px - 7 * dir, py); ctx.lineTo(px + 7 * dir, py); ctx.lineTo(px + nx * 14, py + ny * 14);
          ctx.closePath(); ctx.fill();
        }
      }
      dir = 1; spikeRow(m, m, w - m, m, 0, 1);            // trên → chĩa xuống
      dir = -1; spikeRow(m, h - m, w - m, h - m, 0, -1);  // dưới → chĩa lên
      dir = 1; // dọc: dùng lại với trục hoán đổi
      var n2 = Math.floor((h - m * 2) / step);
      for (var j = 0; j <= n2; j++) {
        var py2 = m + j * step;
        ctx.beginPath(); ctx.moveTo(m, py2 - 7); ctx.lineTo(m, py2 + 7); ctx.lineTo(m + 14, py2); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(w - m, py2 - 7); ctx.lineTo(w - m, py2 + 7); ctx.lineTo(w - m - 14, py2); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
      // Đồng hồ chu kỳ nhỏ góc trên
      if (G) {
        var cyc = st.on + st.off, left = (st.isOn ? st.on - st.t : cyc - st.t);
        ctx.save();
        ctx.fillStyle = on ? "#ff9a3c" : "#9df3ff";
        ctx.font = "12px sans-serif"; ctx.textAlign = "center";
        var spikeLbl = (on ? "GAI BẬT " : "Gai tắt ") + left.toFixed(0) + "s";
        if (window.HUDIcons) HUDIcons.drawTextIcon(ctx, on ? "i-alert" : null, 14, "#ff9a3c", spikeLbl, w / 2, m + 18);
        else ctx.fillText(spikeLbl, w / 2, m + 18);
        ctx.restore();
      }
    },
    exit: function () { this.st = null; },
  };

  /* =====================================================================
     MODULE 2 — ẢI 3 "TRỌNG LỰC 404": TRƠN TRƯỢT (§4 ải 3)
     - Tàu giữ vận tốc khi thả phím (friction 0.985); bay ngược để phanh.
     - Đạn vào viền đẩy cửa sổ mạnh gấp đôi + quán tính moveBy nhỏ dần 300ms.
       Fallback: nếu winCtrl bị chặn → quán tính chỉ áp cho đấu trường ảo.
     - Vùng đệm khí trung tâm: đứng yên 3s → tàu tự ổn định.
     ===================================================================== */
  var slippery = {
    id: "slippery", nameVi: "Trơn trượt",
    st: null,
    enter: function (G, diff) {
      var d = resolveDiff(diff);
      this.st = { ivx: 0, ivy: 0, stillT: 0, winIx: 0, winIy: 0, winIt: 0 };
      this.diff = d;
    },
    // Coordinator gọi khi đạn người chơi chạm viền (engine phát hiện va chạm)
    onBulletHitEdge: function (nx, ny, G) {
      var st = this.st; if (!st) return;
      // Đẩy cửa sổ mạnh gấp đôi: xung quán tính 300ms
      var power = 2;
      if (winOk()) {
        st.winIx = nx * 620 * power; st.winIy = ny * 620 * power; st.winIt = 0.3;
      } else if (G && G.arena) {
        // Fallback: quán tính cho đấu trường ảo
        st.winIx = nx * 620 * power; st.winIy = ny * 620 * power; st.winIt = 0.3; st.virtual = true;
      }
      // Thêm quán tính cho tàu theo phản lực (cảm giác trơn)
      st.ivx -= nx * 130; st.ivy -= ny * 130;
    },
    // Tàu bị ngoại lực đẩy (gọi từ coordinator khi cần, vd. boss yank)
    addImpulse: function (vx, vy) {
      if (this.st) { this.st.ivx += vx; this.st.ivy += vy; }
    },
    // Đứng yên trong đệm khí → ổn định (dùng cho boss5 P2 slip chung)
    stabilize: function () { if (this.st) { this.st.ivx = 0; this.st.ivy = 0; this.st.stillT = 0; } },
    update: function (dt, G) {
      var st = this.st; if (!st || !G || !G.ship) return;
      var d = this.diff, s = G.ship;
      // Ngoại lực boss5 P2 (trơn toàn sân 10s) — module tái sử dụng
      var chaosSlip = G.bossFx && G.bossFx.slip > 0;
      var fr = chaosSlip ? 0.97 : d.friction;
      // Quán tính tàu: cộng vận tốc dư rồi decay
      s.x += st.ivx * dt; s.y += st.ivy * dt;
      var dec = Math.pow(fr, dt * 60);
      st.ivx *= dec; st.ivy *= dec;
      if (Math.abs(st.ivx) < 2) st.ivx = 0;
      if (Math.abs(st.ivy) < 2) st.ivy = 0;
      // Quán tính cửa sổ 300ms (moveBy nhỏ dần)
      if (st.winIt > 0) {
        st.winIt -= dt;
        var k = Math.max(0, st.winIt / 0.3);
        if (st.virtual && G.arena) {
          G.arena.x += st.winIx * k * dt * 0.2; G.arena.y += st.winIy * k * dt * 0.2;
        } else {
          doMoveBy(st.winIx * k * dt, st.winIy * k * dt);
        }
        if (st.winIt <= 0) { st.winIx = 0; st.winIy = 0; st.virtual = false; }
      }
      // Vùng đệm khí trung tâm: đứng yên 3s → ổn định
      var w = W.innerWidth || 900, h = W.innerHeight || 600;
      var inPad = dist(s.x, s.y, w / 2, h / 2) < 90;
      var spd = Math.abs(st.ivx) + Math.abs(st.ivy);
      if (inPad && spd < 30) {
        st.stillT += dt;
        if (st.stillT >= 3) { this.stabilize(); float(s.x, s.y - 34, "Ổn định!", "#9df3ff", false, G); }
      } else st.stillT = 0;
      st.inPad = inPad; st.stillTshow = st.stillT;
    },
    draw: function (ctx, G) {
      var st = this.st; if (!st) return;
      var w = W.innerWidth || 900, h = W.innerHeight || 600;
      ctx.save();
      // Vòng đệm khí trung tâm
      var pulse = 0.25 + 0.15 * Math.sin((G && G.time || 0) * 3);
      ctx.strokeStyle = "rgba(157,78,221," + (0.4 + pulse) + ")";
      ctx.lineWidth = 2; ctx.setLineDash([8, 8]);
      ctx.beginPath(); ctx.arc(w / 2, h / 2, 90, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(157,78,221,0.75)";
      ctx.font = "11px sans-serif"; ctx.textAlign = "center";
      var label = "Đệm khí" + (st.stillTshow > 0.2 ? " " + Math.max(0, 3 - st.stillTshow).toFixed(1) + "s" : "");
      ctx.fillText(label, w / 2, h / 2 - 96);
      // Vệt trượt của tàu
      var s = G && G.ship, spd = Math.abs(st.ivx) + Math.abs(st.ivy);
      if (s && spd > 60) {
        ctx.strokeStyle = "rgba(157,78,221,0.5)"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x - st.ivx * 0.25, s.y - st.ivy * 0.25); ctx.stroke();
      }
      ctx.restore();
    },
    exit: function () { this.st = null; },
  };

  /* =====================================================================
     MODULE 3 — ẢI 4 "CÚP ĐIỆN": MẤT ĐIỆN ĐỊNH KỲ (§4 ải 4)
     Chu kỳ 20s: sáng 14s / tối 6s (diff §8.2: Chill 22/4, Khắc nghiệt 18/8).
     Khi tối: phủ đen alpha 0.92 — coordinator ẩn quái (chỉ vẽ mắt đỏ +
     telegraph đỏ + outline tàu + chớp nòng + vụ nổ). Pickup "pin": soi
     sáng 10s quanh tàu. Mỗi loại quái có audio cue riêng trước khi tấn công.
     ===================================================================== */
  var CUE_SFX = { // tiếng gầm riêng từng loại quái trước khi tấn công
    chaser: "thud", chewer: "shrink", tank: "bigboom", dasher: "shoot",
    splitter: "boom", mini: "hit", spitter: "shoot", bomber: "warn",
    freezer: "shrink", phantom: "boss_roar", booster: "up", warden: "thud",
    glimmer: "gem", broodmother: "boss_roar",
  };
  var blackout = {
    id: "blackout", nameVi: "Mất điện",
    st: null,
    enter: function (G, diff) {
      var d = resolveDiff(diff);
      var dark = d.blackoutDark, cyc = d.blackoutCycle;
      this.st = { cycle: cyc, dark: dark, light: cyc - dark, t: 0, isDark: false, pinT: 0, warned: false };
      this.diff = d;
      if (G) G.blackout = this.st; // coordinator đọc G.blackout.isDark để ẩn quái
    },
    isDark: function () { return !!(this.st && this.st.isDark); },
    darkAlpha: function () { return this.isDark() ? 0.92 : 0; },
    // Pickup "pin" (đèn pin): coordinator gọi khi nhặt
    addPin: function (G) {
      if (!this.st) return;
      this.st.pinT = 10; // soi sáng 10s quanh tàu
      sfx("pickup", "gem");
      if (G && G.ship) float(G.ship.x, G.ship.y - 34, "Đèn pin! 🔦", "#fef08a", false, G);
    },
    pinActive: function () { return !!(this.st && this.st.pinT > 0); },
    // Audio cue riêng mỗi loại quái trước khi tấn công — coordinator gọi
    cue: function (type) { sfx(CUE_SFX[type] || "warn", "thud"); },
    update: function (dt, G) {
      var st = this.st; if (!st) return;
      st.t += dt;
      if (st.t >= st.cycle) { st.t -= st.cycle; st.warned = false; }
      var wasDark = st.isDark;
      st.isDark = st.t >= st.light;
      if (st.isDark && !wasDark) {
        sfx("over", "thud"); // tiếng cúp điện
        if (G && G.ship) float(G.ship.x, G.ship.y - 60, "MẤT ĐIỆN! Nhìn mắt đỏ!", "#ff5470", true, G);
      } else if (!st.isDark && wasDark) {
        sfx("up", "gem");
      }
      // Cảnh báo trước 1.5s khi sắp tối (để không "ăn ngay")
      if (!st.isDark && !st.warned && st.light - st.t < 1.5) {
        st.warned = true;
        sfx("warn", "thud");
        if (G && G.ship) float(G.ship.x, G.ship.y - 60, "Sắp mất điện!", "#ffd479", false, G);
      }
      if (st.pinT > 0) st.pinT -= dt;
      // Boss 5 P2 "xung hỗn loạn": tắt đèn 4s — module tái sử dụng
      if (G && G.bossFx && G.bossFx.dark > 0 && !st.isDark) {
        st.isDark = true; st.bossDark = true;
      } else if (st.bossDark && !(G && G.bossFx && G.bossFx.dark > 0)) {
        st.bossDark = false; st.isDark = st.t >= st.light;
      }
    },
    draw: function (ctx, G) {
      var st = this.st; if (!st) return;
      var w = W.innerWidth || 900, h = W.innerHeight || 600;
      ctx.save();
      if (st.isDark) {
        ctx.fillStyle = "rgba(0,0,0,0.92)";
        ctx.fillRect(0, 0, w, h);
        // Pin đèn pin: soi sáng vùng quanh tàu 10s
        if (st.pinT > 0 && G && G.ship) {
          var s = G.ship, r = 190;
          var g = ctx.createRadialGradient(s.x, s.y, 20, s.x, s.y, r);
          g.addColorStop(0, "rgba(254,240,138,0.28)");
          g.addColorStop(1, "rgba(254,240,138,0)");
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2); ctx.fill();
          // Viền pin còn lại
          ctx.fillStyle = "#fef08a"; ctx.font = "12px sans-serif"; ctx.textAlign = "center";
          var pinLbl = Math.ceil(st.pinT) + "s";
          if (window.HUDIcons) HUDIcons.drawTextIcon(ctx, "i-flash", 14, "#fef08a", pinLbl, s.x, s.y - r - 8);
          else ctx.fillText(pinLbl, s.x, s.y - r - 8);
        }
        // Outline neon tàu (coordinator vẽ tàu thật; đây là vầng hào quang gợi ý)
        if (G && G.ship) {
          ctx.strokeStyle = "rgba(0,229,255,0.5)"; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(G.ship.x, G.ship.y, 20, 0, Math.PI * 2); ctx.stroke();
        }
      } else {
        // Khi có điện: lưới neon chập chờn (§4)
        var flick = Math.sin((G && G.time || 0) * 17) > 0.96 ? 0.05 : 0.16;
        ctx.strokeStyle = "rgba(0,229,255," + flick + ")";
        ctx.lineWidth = 1;
        for (var gx = 0; gx < w; gx += 64) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, h); ctx.stroke(); }
        for (var gy = 0; gy < h; gy += 64) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke(); }
        // Đếm ngược tới lần mất điện tiếp theo
        var left = st.light - st.t;
        if (left < 5) {
          ctx.fillStyle = "#ffd479"; ctx.font = "12px sans-serif"; ctx.textAlign = "center";
          var blackLbl = "Mất điện sau " + left.toFixed(0) + "s";
          if (window.HUDIcons) HUDIcons.drawTextIcon(ctx, "i-alert", 14, "#ffd479", blackLbl, w / 2, 24);
          else ctx.fillText(blackLbl, w / 2, 24);
        }
      }
      ctx.restore();
    },
    exit: function () { this.st = null; },
  };

  /* =====================================================================
     MODULE 4 — ẢI 5 "TRÀN BỘ NHỚ": VÙNG THU HẸP (§4 ải 5)
     Đấu trường ảo co 8px/10s (tối thiểu 35%, tối đa 90% — diff §8.2).
     Pickup "patch" xanh: +30px (tối đa 90%). Tàu chạm viền vùng: mất máu
     theo thời gian. Quái bị đẩy vào trong.
     ===================================================================== */
  var shrink = {
    id: "shrink", nameVi: "Vùng thu hẹp",
    st: null,
    enter: function (G, diff) {
      var d = resolveDiff(diff);
      var w = W.innerWidth || 900, h = W.innerHeight || 600;
      var pw = w * d.shrinkMaxPct, ph = h * d.shrinkMaxPct;
      this.st = {
        x: (w - pw) / 2, y: (h - ph) / 2, w: pw, h: ph,
        t: 0, edgeT: 0, minW: w * d.shrinkMinPct, minH: h * d.shrinkMinPct,
        maxW: w * d.shrinkMaxPct, maxH: h * d.shrinkMaxPct,
      };
      this.diff = d;
      if (G) G.shrinkArena = this.st; // coordinator kẹp tàu/quái trong vùng
    },
    // Vùng an toàn hiện tại — coordinator dùng để kẹp vị trí
    bounds: function () { return this.st; },
    arenaPct: function () {
      if (!this.st) return 1;
      var w = W.innerWidth || 900;
      return clamp(this.st.w / w, 0, 1);
    },
    // Co thêm (vd. mini-boss Chewer Chúa Tể: +4px/s khi bám viền)
    shrinkExtra: function (px) {
      var st = this.st; if (!st) return;
      st.w = Math.max(st.minW, st.w - px * 2); st.h = Math.max(st.minH, st.h - px * 2);
      st.x += px; st.y += px;
    },
    // Pickup "patch" xanh: nở lại +30px (tối đa 90%)
    growPatch: function (G) {
      var st = this.st; if (!st) return;
      var d = this.diff, g = d.patchGrow;
      st.w = Math.min(st.maxW, st.w + g * 2); st.h = Math.min(st.maxH, st.h + g * 2);
      st.x = Math.max(0, st.x - g); st.y = Math.max(0, st.y - g);
      sfx("up", "gem");
      burst(st.x + st.w / 2, st.y + st.h / 2, 14, ["#4ade80", "#fff"], 200, G);
      if (G && G.ship) float(G.ship.x, G.ship.y - 34, "+" + g + "px vùng an toàn!", "#4ade80", false, G);
    },
    // Tàu có đang chạm viền vùng không
    shipOnBorder: function (G) {
      var st = this.st, s = G && G.ship; if (!st || !s) return false;
      var m = 14;
      return s.x - s.r < st.x + m || s.x + s.r > st.x + st.w - m ||
             s.y - s.r < st.y + m || s.y + s.r > st.y + st.h - m;
    },
    // Đẩy quái vào trong nếu lọt ra ngoài vùng
    clampEnemy: function (e) {
      var st = this.st; if (!st || !e) return;
      e.x = clamp(e.x, st.x + 10, st.x + st.w - 10);
      e.y = clamp(e.y, st.y + 10, st.y + st.h - 10);
    },
    update: function (dt, G) {
      var st = this.st; if (!st || !G) return;
      var d = this.diff;
      // Co 8px mỗi 10s (§4; theo diff §8.2)
      st.t += dt;
      while (st.t >= d.shrinkEvery) {
        st.t -= d.shrinkEvery;
        if (st.w > st.minW + 1) {
          this.shrinkExtra(d.shrinkPx);
          sfx("shrink", "thud");
          if (G.ship) float(G.ship.x, G.ship.y - 50, "Vùng thu hẹp!", "#ff9a3c", false, G);
        }
      }
      // Tàu chạm viền vùng: mất máu theo thời gian (1 máu/s, có grace)
      if (this.shipOnBorder(G)) {
        st.edgeT += dt;
        if (st.edgeT >= 1.0) {
          st.edgeT = 0;
          hurtShip(1, G.ship.x, G.ship.y);
          float(G.ship.x, G.ship.y - 30, "Ra khỏi vùng an toàn!", "#ff5470", false, G);
        }
      } else st.edgeT = 0;
      // Quái bị đẩy vào trong
      if (G.enemies) for (var i = 0; i < G.enemies.length; i++) this.clampEnemy(G.enemies[i]);
    },
    draw: function (ctx, G) {
      var st = this.st; if (!st) return;
      ctx.save();
      // Vùng ngoài = "bộ nhớ tràn": phủ đỏ mờ
      ctx.fillStyle = "rgba(74,0,0,0.35)";
      var w = W.innerWidth || 900, h = W.innerHeight || 600;
      ctx.fillRect(0, 0, w, st.y);
      ctx.fillRect(0, st.y + st.h, w, h - st.y - st.h);
      ctx.fillRect(0, st.y, st.x, st.h);
      ctx.fillRect(st.x + st.w, st.y, w - st.x - st.w, st.h);
      // Viền vùng an toàn đỏ nhấp nháy (§4)
      var blink = Math.sin((G && G.time || 0) * 6) > 0 ? 1 : 0.45;
      ctx.globalAlpha = blink;
      ctx.strokeStyle = "#ff3333"; ctx.lineWidth = 3;
      ctx.strokeRect(st.x, st.y, st.w, st.h);
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#ff9a3c"; ctx.font = "12px sans-serif"; ctx.textAlign = "center";
      ctx.fillText("VÙNG AN TOÀN " + Math.round(this.arenaPct() * 100) + "%", st.x + st.w / 2, st.y - 8);
      ctx.restore();
    },
    exit: function () { this.st = null; },
  };

  /* ---------------- pickup defs cho coordinator merge vào PICKUP_DEFS --- */
  var PICKUPS = {
    pin:   { nameVi: "Pin đèn",   color: "#fef08a", desc: "Soi sáng 10s quanh tàu khi mất điện (ải 4).",
             apply: function (G) { blackout.addPin(G); } },
    patch: { nameVi: "Bản vá",   color: "#4ade80", desc: "Nới vùng an toàn +30px (ải 5, tối đa 90%).",
             apply: function (G) { shrink.growPatch(G); } },
  };

  /* ---------------- API chính ---------------- */
  var modules = { spikes: spikes, slippery: slippery, blackout: blackout, shrink: shrink };
  var STAGE_MODULE = { 2: "spikes", 3: "slippery", 4: "blackout", 5: "shrink" };
  var active = null;
  var activeId = null;

  var StageFX = {
    modules: modules,
    PICKUPS: PICKUPS,
    CUE_SFX: CUE_SFX,
    activeId: null,

    enter: function (stageId, G, diff) {
      this.exit();
      var mid = STAGE_MODULE[stageId];
      if (!mid) return null;
      active = modules[mid]; activeId = mid;
      this.activeId = mid;
      active.enter(G, diff);
      return active;
    },
    update: function (dt, G) { if (active) active.update(dt, G); },
    draw: function (ctx, G) { if (active) active.draw(ctx, G); },
    exit: function () {
      if (active) { try { active.exit(); } catch (e) {} }
      active = null; activeId = null; this.activeId = null;
      // dọn flag G để coordinator không đọc state cũ
      try { if (typeof W !== "undefined" && W.G && W.G.blackout) delete W.G.blackout; } catch (e) {}
    },
    getActive: function () { return active; },

    /* Query helpers cho coordinator/engine */
    isDark: function () { return blackout.isDark(); },
    arenaBounds: function () { return shrink.bounds(); },
    spikesOn: function () { return spikes.isOn(); },
    cue: function (type) { blackout.cue(type); },
    onBulletHitEdge: function (nx, ny, G) { slippery.onBulletHitEdge(nx, ny, G); },
    growPatch: function (G) { shrink.growPatch(G); },
    addPin: function (G) { blackout.addPin(G); },
    shrinkExtra: function (px) { shrink.shrinkExtra(px); },
  };

  W.StageFX = StageFX;
})();
