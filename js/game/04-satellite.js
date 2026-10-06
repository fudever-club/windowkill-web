/* ---------------- Satellite Window System (multi-window, MULTIWINDOW-SPEC.md) ----------------
 * 1 cửa sổ chính + tối đa 3 popup vệ tinh. Vệ tinh là dumb renderer:
 * logic ở cửa sổ chính, vệ tinh chỉ vẽ + báo click + drift theo lệnh.
 * Không mở được popup (bị chặn/mobile/user chọn) → fallback "cửa sổ mô phỏng" vẽ trong arena. */
const IS_ELECTRON_APP = /Electron\//.test(navigator.userAgent || "");
// 2-track 2026-10-03 (CEO): WEB = mô phỏng, KHÔNG popup thật.
// Bug 2026-10-03: popup thật cướp focus bàn phím → tàu đơ (quái vẫn chạy).
// Desktop Electron giữ popup thật (cửa sổ OS do app quản lý).
const _satQp = qp.get("sat");
const SAT_MODE = IS_ELECTRON_APP
  ? (_satQp || "auto")
  : (_satQp === "sim" || _satQp === "off" ? _satQp : "sim"); // "auto"/rỗng → "sim"
const IS_MOBILE = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent || "");

const SatManager = (() => {
  const MAX_SATS = 3;
  const PRI = { fragment: 0, debris: 1, nest: 2, shield: 3, lover: 4, superlove: 4, mirror: 5, blackhole: 6 }; // hàng đợi ưu tiên
  const queue = [];
  const sats = new Map(); // id -> sat
  let permAsked = false, pollT = 0, blockedWarned = false;

  const pref = () => { try { return localStorage.getItem("wk_sat_pref"); } catch (e) { return null; } };
  const setPref = (v) => { try { localStorage.setItem("wk_sat_pref", v); } catch (e) {} };

  function request(role, opts = {}) {
    if (SAT_MODE === "off") return null; // mechanic không trigger (caller spawn thường thay thế)
    // M5–M10 websim (2026-10-06): quota chỉ đếm sat CÒN SỐNG. Sat đã dead vẫn nằm
    // trong map tới 350ms (chờ hiệu ứng vỡ) — đếm cả nó khiến spawn mới fail câm:
    // giant bị phá khi drone khiên còn sống → chỉ tách 1 minion; lovers merge khi
    // còn sat khác → superlove request null, mất siêu-popup sau banner "BÙM!".
    let live = 0;
    for (const s of sats.values()) if (!s.dead) live++;
    if (live + queue.length >= MAX_SATS) return null;
    const o = Object.assign({ hp: 6, color: "#8b2fc9", label: I18N.t("sat.generic"), w: 340, h: 220 }, opts);
    const sat = { id: "sat" + Date.now().toString(36) + Math.floor(Math.random() * 46656).toString(36),
      role, hp: Math.max(1, o.hp | 0), maxHp: Math.max(1, o.hp | 0),
      color: /^#[0-9a-fA-F]{6}$/.test(o.color) ? o.color : "#8b2fc9",
      label: String(o.label).slice(0, 24), w: o.w, h: o.h, opts: o,
      win: null, sim: false, ready: false, canMove: false,
      x: 0, y: 0, born: performance.now(), spawnT: 0, spawned: 0, dead: false, shatterT: 0 };
    if (SAT_MODE === "sim" || IS_MOBILE || pref() === "single") makeSim(sat);
    else if (!pref() && !permAsked) { permAsked = true; askPermission(sat); }
    else { queue.push(sat); queue.sort((a, b) => (PRI[a.role] ?? 9) - (PRI[b.role] ?? 9)); }
    return sat;
  }

  /* banner xin phép 1 lần (non-blocking, không pause game) */
  function askPermission(sat) {
    queue.push(sat);
    const bar = $("satperm");
    if (!bar) { flush(); return; }
    bar.style.display = "flex";
    $("btn-sat-allow").onclick = () => { setPref("allow"); bar.style.display = "none"; flush(); };
    $("btn-sat-single").onclick = () => {
      setPref("single"); bar.style.display = "none";
      while (queue.length) makeSim(queue.shift()); // chuyển hàng đợi sang mô phỏng
    };
    setTimeout(() => { // quá 12s không chọn → mô phỏng (R1)
      if (bar.style.display === "flex") { bar.style.display = "none"; setPref("single"); while (queue.length) makeSim(queue.shift()); }
    }, 12000);
  }

  /* mở popup thật ở vị trí cascade từ mép phải cửa sổ chính */
  function openReal(sat) {
    const n = sats.size;
    let left = 0, top = 0;
    try {
      left = window.screenX + window.outerWidth + 24 + n * 36;
      top = window.screenY + 40 + n * 48;
      const aw = window.screen.availWidth || 1920, ah = window.screen.availHeight || 1080;
      left = clamp(Math.round(left), 0, Math.max(0, aw - sat.w - 20));
      top = clamp(Math.round(top), 0, Math.max(0, ah - sat.h - 40));
    } catch (e) {}
    const q = new URLSearchParams({ role: sat.role, id: sat.id, hp: sat.hp, color: sat.color, label: sat.label, enr: sat.opts.enraged ? "1" : "" }).toString();
    let w = null;
    try {
      w = window.open("satellite.html?" + q, "wk_sat_" + sat.id,
        `width=${sat.w},height=${sat.h},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no,resizable=no,scrollbars=no`);
    } catch (e) { w = null; }
    if (!w || w.closed) return false; // bị chặn → fallback
    sat.win = w; sat.x = left; sat.y = top;
    sats.set(sat.id, sat);
    return true;
  }

  /* fallback "cửa sổ mô phỏng": khung OS giả vẽ trong arena */
  function makeSim(sat) {
    sat.sim = true;
    const b = bounds(), s = G.ship || { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    const sw = Math.min(230, b.w * 0.42), sh = sw * 0.62;
    const corners = [
      { x: b.x + 24, y: b.y + 56 }, { x: b.x + b.w - 24 - sw, y: b.y + 56 },
      { x: b.x + 24, y: b.y + b.h - 24 - sh }, { x: b.x + b.w - 24 - sw, y: b.y + b.h - 24 - sh },
    ];
    let best = corners[0], bd = -1;
    for (const c of corners) { const d = (c.x - s.x) ** 2 + (c.y - s.y) ** 2; if (d > bd) { bd = d; best = c; } }
    sat.x = best.x; sat.y = best.y; sat.sw = sw; sat.sh = sh;
    sats.set(sat.id, sat);
    if (!blockedWarned) {
      blockedWarned = true;
      setBanner(I18N.t("error.sim_title"), I18N.t("error.popup_blocked_game"));
    }
  }

  /* gọi ở mọi mousedown/keydown (cần user gesture để window.open) */
  function flush() {
    if (!queue.length || !G || G.phase !== "play" || document.hidden) return;
    while (queue.length && sats.size < MAX_SATS) {
      const sat = queue.shift();
      if (!openReal(sat)) makeSim(sat);
    }
  }

  /* poll mỗi 0.5s: phát hiện đóng tay (R4) */
  function poll(dt) {
    pollT += dt;
    if (pollT < 0.5) return;
    pollT = 0;
    for (const sat of [...sats.values()]) {
      if (sat.dead) { // dọn xác: popup thật đã đóng thì xóa khỏi map (BUG2)
        if (!sat.sim && sat.win && sat.win.closed) sats.delete(sat.id);
        continue;
      }
      if (!sat.sim && sat.win && sat.win.closed) { kill(sat.id, "manual"); }
    }
  }

  function post(id, msg) {
    const sat = sats.get(id);
    if (sat && !sat.sim && sat.win && !sat.win.closed && bus)
      bus.postMessage(Object.assign({ satId: id }, msg));
  }

  /* click vào vệ tinh = 1 sát thương */
  function damage(id, x, y) {
    const sat = sats.get(id);
    if (!sat || sat.dead) return;
    if (sat.role === "shield") return; // khiên của mình — click không phá được
    if (typeof sat.opts.onDamage === "function") { // M2: pool HP chung của boss
      sat.opts.onDamage(1, sat);
      AudioEngine.sfx.hit();
      if (sat.sim) { sat.flash = 1; if (x !== undefined) addFloat(x, y - 14, "-1", "#fff"); }
      return;
    }
    sat.hp = Math.max(0, sat.hp - 1);
    AudioEngine.sfx.hit();
    if (sat.sim) { sat.flash = 1; if (x !== undefined) addFloat(x, y - 14, "-1", "#fff"); }
    else post(id, { type: "sat-dmg", id, hp: sat.hp, x: Math.round(x || 0), y: Math.round(y || 0) });
    if (sat.hp <= 0) kill(id, "killed");
  }

  function kill(id, mode) {
    const sat = sats.get(id);
    if (!sat || sat.dead) return;
    sat.dead = true;
    if (sat.sim) sat.shatterT = 0.3;
    else {
      post(id, { type: "sat-die", id });
      try { setTimeout(() => { try { if (sat.win && !sat.win.closed) sat.win.close(); } catch (e) {} }, 600); } catch (e) {}
    }
    try { if (typeof sat.opts.onClose === "function") sat.opts.onClose(mode, sat); } catch (e) {}
    // dọn khỏi map sau hiệu ứng (sim) hoặc khi popup đã đóng (real)
    if (sat.sim) setTimeout(() => sats.delete(id), 350);
    else {
      // BUG2-FIX: sat thật từng chỉ dọn khi sat-bye tới (bị guard nuốt khi đã dead) —
      // lên lịch xóa map sau khi popup đã đóng; poll() cũng dọn xác mỗi 0.5s.
      try {
        setTimeout(() => {
          const s = sats.get(id);
          if (s && s.dead) {
            try { if (s.win && !s.win.closed) s.win.close(); } catch (e) {}
            sats.delete(id);
          }
        }, 2000);
      } catch (e) {}
    }
  }

  function closeAll() {
    queue.length = 0;
    for (const sat of sats.values()) {
      if (!sat.sim && sat.win) { try { if (!sat.win.closed) sat.win.close(); } catch (e) {} }
    }
    sats.clear();
  }

  /* click test cho cửa sổ mô phỏng (gọi ở mousedown, trước khi bắn) */
  function hitSim(px, py) {
    const list = [...sats.values()].filter(s => s.sim && !s.dead && s.role !== "shield"); // drone khiên không chặn click
    for (let i = list.length - 1; i >= 0; i--) {
      const s = list[i];
      if (px >= s.x && px <= s.x + s.sw && py >= s.y && py <= s.y + s.sh) { damage(s.id, px, py); return true; }
    }
    return false;
  }

  function anyRole(role) { for (const s of sats.values()) if (s.role === role && !s.dead) return true; return false; }
  const list = () => [...sats.values()];
  // GC-2026-10: iterator trực tiếp, không alloc mảng — dùng cho vòng lặp per-frame
  const values = () => sats.values();
  const count = () => sats.size;

  /* bus: sat-ready / sat-hit / sat-bye */
  if (bus) bus.onmessage = (ev) => {
    const m = ev.data || {};
    if (!m || typeof m.type !== "string" || !m.type.startsWith("sat-")) return;
    const id = String(m.id || m.satId || "");
    // BUG1-FIX: sat-bye (user đóng tay popup) phải đi qua kill("manual") để phạt kích hoạt —
    // đặt TRƯỚC guard dead kẻo nhánh này thành dead code.
    if (m.type === "sat-bye") { const s = sats.get(id); if (s && !s.dead) kill(id, "manual"); else sats.delete(id); return; }
    const sat = sats.get(id);
    if (!sat || sat.dead) return;
    if (m.type === "sat-ready") sat.ready = true, sat.canMove = !!m.canMove;
    else if (m.type === "sat-hit") {
      const x = clamp(+m.x || 0, 0, sat.w), y = clamp(+m.y || 0, 0, sat.h);
      damage(id, x, y);
    }
  };

  // DESIGN-SYSTEM v1.1 §8 — tint title bar mô phỏng theo role (giữ tương phản thấp)
  const ROLE_TB_TINT = {
    nest: ["#3a1d5c", "#190b2c"], fragment: ["#274b63", "#10222f"],
    shield: ["#1d3a52", "#0c1c2c"], debris: ["#4a1d1d", "#260d0d"],
    giant: ["#1d4224", "#0d2112"], minion: ["#2d4416", "#141f0a"],
    mother: ["#4d2f0d", "#261505"], chick: ["#4d4211", "#261f09"],
    bomb: ["#4d2113", "#270f08"], lover: ["#4d1428", "#270a14"],
    superlove: ["#521226", "#2a0a13"], mirror: ["#1f3a46", "#0d1a21"],
    blackhole: ["#22133d", "#0f0820"],
  };
  /* vẽ cửa sổ mô phỏng (khung OS giả) */
  function drawSims() {
    const t0 = performance.now(); // dùng chung cho pulse/vệt sáng, tránh gọi nhiều lần
    for (const s of sats.values()) {
      if (!s.sim || s.dead && s.shatterT <= 0) continue;
      if (s.role === "shield" && s.sim) { drawShieldDrone(s); continue; } // M3: drone khiên bay quanh tàu
      const a = s.dead ? Math.max(0, s.shatterT / 0.3) : 1;
      ctx.save();
      ctx.globalAlpha = a;
      // MOBILE-QUALITY: bóng cửa sổ vệ tinh vẽ mỗi frame → scale theo nấc.
      var _satSh = wkShadowScale();
      if (_satSh > 0) { ctx.shadowColor = "rgba(0,0,0,.5)"; ctx.shadowBlur = Math.round(18 * _satSh); ctx.shadowOffsetY = 6; }
      ctx.fillStyle = "#0d1420";
      roundRect(s.x, s.y, s.sw, s.sh, 8); ctx.fill();
      ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
      // title bar — DESIGN-SYSTEM v1.1 §8: tint theo role
      const tb = ROLE_TB_TINT[s.role] || ["#1a2b4a", "#0f1c33"];
      // GC-2026-10: cache gradient title-bar theo màu + y lượng tử hóa (lệch ≤0.5px trên gradient 26px, không thấy được)
      const _tby = Math.round(s.y);
      const tg = _gradGet("sat-tb|" + tb[0] + "|" + tb[1] + "|" + _tby, () => {
        const _g = ctx.createLinearGradient(0, _tby, 0, _tby + 26);
        _g.addColorStop(0, tb[0]); _g.addColorStop(1, tb[1]);
        return _g;
      });
      ctx.fillStyle = tg;
      roundRect(s.x, s.y, s.sw, 26, [8, 8, 0, 0]); ctx.fill();
      const cols = ["#ff5f57", "#febc2e", "#28c840"];
      cols.forEach((c, i) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(s.x + 16 + i * 18, s.y + 13, 5.5, 0, Math.PI * 2); ctx.fill(); });
      ctx.fillStyle = "#cfe3ff"; ctx.font = "600 11px system-ui"; ctx.textAlign = "left"; ctx.textBaseline = "middle";
      ctx.fillText(s.label, s.x + 74, s.y + 14);
      ctx.fillStyle = "#ffffff55"; ctx.font = "10px system-ui"; ctx.textAlign = "right";
      ctx.fillText(I18N.t("sat.sim_badge"), s.x + s.sw - 8, s.y + 14);
      ctx.strokeStyle = "#ffffff22"; ctx.lineWidth = 1;
      roundRect(s.x + 0.5, s.y + 0.5, s.sw - 1, s.sh - 1, 8); ctx.stroke();
      // nội dung theo role
      ctx.save();
      ctx.beginPath(); roundRect(s.x, s.y + 26, s.sw, s.sh - 26, [0, 0, 8, 8]); ctx.clip();
      drawSimContent(s);
      ctx.restore();
      // M9/M10 websim (2026-10-06): vẽ vùng hiệu lực quanh khung GIẢ.
      // drawSatFields() bỏ qua sat sim nên trên web vùng gương 85px / hố đen 240px
      // "tàng hình" — player không thấy để né/đừng bắn vào. Vẽ vòng đứt nét mờ
      // cùng style với bản popup thật, không đổi balance.
      if (!s.dead && (s.role === "mirror" || s.role === "blackhole")) {
        const zR = s.role === "mirror" ? 85 : 240;
        const zc = s.role === "mirror" ? "#67e8f9" : "#7c3aed";
        const zp = 0.5 + 0.3 * Math.sin(t0 / 400);
        ctx.save();
        ctx.globalAlpha = 0.13 + zp * 0.08;
        ctx.strokeStyle = zc; ctx.lineWidth = 2;
        ctx.setLineDash([10, 8]); ctx.lineDashOffset = -t0 / 60;
        ctx.beginPath(); ctx.arc(s.x + s.sw / 2, s.y + s.sh / 2, zR, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
      // thanh HP (rework 2026-10-04: mảnh kính hiện HP của chính nó — destructible)
      const hpf = clamp(s.hp / s.maxHp, 0, 1);
      ctx.fillStyle = "#ffffff18"; ctx.fillRect(s.x + 10, s.y + s.sh - 12, s.sw - 20, 5);
      ctx.fillStyle = s.color; ctx.fillRect(s.x + 10, s.y + s.sh - 12, (s.sw - 20) * hpf, 5);
      if (s.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${s.flash * 0.4})`; roundRect(s.x, s.y, s.sw, s.sh, 8); ctx.fill(); }
      if (s.role === "debris" && (s.warnT || 0) > 0) { // M4: telegraph đỏ 0.7s trước khi bay
        const p = (Math.sin(performance.now() / 90) + 1) / 2;
        ctx.strokeStyle = `rgba(255,60,60,${0.5 + 0.5 * p})`; ctx.lineWidth = 3 + 2 * p;
        roundRect(s.x + 1, s.y + 1, s.sw - 2, s.sh - 2, 8); ctx.stroke();
      }
      ctx.restore();
    }
  }

  /* M3: drone khiên (fallback mô phỏng) bay quanh tàu, 5 tim */
  function drawShieldDrone(s) {
    const sh = typeof shieldTarget === "function" ? shieldTarget() : null;
    if (!sh) return;
    const t = performance.now(), bob = Math.sin(t / 300) * 4;
    const x = sh.x, y = sh.y + bob;
    ctx.save();
    ctx.globalAlpha = s.dead ? Math.max(0, s.shatterT / 0.3) : 1;
    ctx.strokeStyle = "rgba(56,189,248,.35)"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y, 70, 0, Math.PI * 2); ctx.stroke(); // quỹ đạo
    ctx.fillStyle = "#0d1b2e"; ctx.strokeStyle = "#38bdf8"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#38bdf8";
    ctx.beginPath(); ctx.arc(x, y, 6 + Math.sin(t / 200) * 1.5, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 4; i++) { // 4 cánh quạt
      const a = i * Math.PI / 2 + t / 400;
      ctx.strokeStyle = "#7dd3fc"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x + Math.cos(a) * 24, y + Math.sin(a) * 24, 5, 0, Math.PI * 2); ctx.stroke();
    }
    if (window.HUDIcons) {
      const nh = Math.max(0, s.hearts ?? 5);
      if (nh > 0) {
        const hw = nh * 12 + (nh - 1) * 4;
        for (let hi = 0; hi < nh; hi++) HUDIcons.draw(ctx, "i-heart", 12, "#38bdf8", x - hw / 2 + 6 + hi * 16, y - 33, true);
      } else {
        HUDIcons.draw(ctx, "i-heart-crack", 14, "#ff6b81", x, y - 33);
      }
    }
    ctx.fillStyle = "#38bdf8"; ctx.font = "600 10px system-ui";
    ctx.fillText(I18N.t("sat.shield_label"), x, y + 34);
    ctx.restore();
  }


  function drawGoofyFace(x, y, r, color, angry, t) {
    const wob = Math.sin(t / 500) * 0.06;
    ctx.save(); ctx.translate(x, y); ctx.rotate(wob);
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    const ey = -r * 0.25, ex = r * 0.34;
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(-ex, ey, r * 0.22, 0, Math.PI * 2); ctx.arc(ex, ey, r * 0.22, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = angry ? "#ff2020" : "#1a1a2e";
    const px = angry ? 0 : Math.sin(t / 700) * r * 0.05;
    ctx.beginPath(); ctx.arc(-ex + px, ey, r * 0.1, 0, Math.PI * 2); ctx.arc(ex + px, ey, r * 0.1, 0, Math.PI * 2); ctx.fill();
    if (angry) {
      ctx.strokeStyle = "#7a0d0d"; ctx.lineWidth = Math.max(2, r * 0.09); ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-ex - r * 0.22, ey - r * 0.36); ctx.lineTo(-ex + r * 0.2, ey - r * 0.12);
      ctx.moveTo(ex + r * 0.22, ey - r * 0.36); ctx.lineTo(ex - r * 0.2, ey - r * 0.12);
      ctx.stroke();
    }
    ctx.strokeStyle = "#1a1a2e"; ctx.lineWidth = Math.max(2, r * 0.08); ctx.lineCap = "round";
    ctx.beginPath();
    if (angry) ctx.arc(0, r * 0.75, r * 0.4, Math.PI * 1.15, Math.PI * 1.85);
    else ctx.arc(0, r * 0.1, r * 0.5, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();
    ctx.restore();
  }

  function drawSimContent(s) {
    const cx = s.x + s.sw / 2, cy = s.y + 26 + (s.sh - 26) / 2, t = performance.now();
    if (s.role === "nest") {
      ctx.fillStyle = "#120a24"; ctx.fillRect(s.x, s.y + 26, s.sw, s.sh - 26);
      for (let i = 0; i < 5; i++) {
        const a = i / 5 * Math.PI * 2, pulse = 1 + 0.16 * Math.sin(t / 420 + i * 1.7);
        const x = cx + Math.cos(a) * s.sw * 0.26, y = cy + Math.sin(a) * s.sh * 0.2, r = 11 * pulse;
        const g = ctx.createRadialGradient(x, y, 1, x, y, r);
        g.addColorStop(0, "#e9a8ff"); g.addColorStop(0.55, s.color); g.addColorStop(1, "#3b0764");
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.8, a, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "rgba(255,80,80,.9)";
        ctx.beginPath(); ctx.arc(x, y - r * 0.2, 2, 0, Math.PI * 2); ctx.fill();
      }
    } else if (s.role === "debris") { // M4: mảnh vỡ nứt, nhắc bấm để phá
      ctx.fillStyle = "#140a0a"; ctx.fillRect(s.x, s.y + 26, s.sw, s.sh - 26);
      const wob = Math.sin(t / 180) * 0.12;
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(wob);
      ctx.fillStyle = "#3a3f4a";
      ctx.beginPath();
      for (let i = 0; i < 7; i++) {
        const a = i / 7 * Math.PI * 2, r = 26 + (i % 3) * 9;
        i === 0 ? ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r) : ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "#ff5a5a"; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(-18, 12); ctx.lineTo(-4, -2); ctx.lineTo(8, 8); ctx.lineTo(20, -10); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = "#ff8f8f"; ctx.font = "700 13px system-ui"; ctx.textAlign = "center";
      ctx.fillText(I18N.t("sat.click_break"), cx, s.y + s.sh - 22);
    } else if (s.role === "bomb") { // M8
      const urgent = (s.fuseT === undefined ? 15 : s.fuseT) <= 3;
      const blink = Math.floor(t / (urgent ? 120 : 300)) % 2 === 0;
      ctx.fillStyle = blink ? "#3a0d02" : "#1c0701"; ctx.fillRect(s.x, s.y + 26, s.sw, s.sh - 26);
      const r = Math.min(s.sw, s.sh - 26) * 0.22;
      ctx.fillStyle = "#2b2f36"; ctx.beginPath(); ctx.arc(cx, cy - 8, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#4a5058"; ctx.beginPath(); ctx.arc(cx - r * 0.3, cy - 8 - r * 0.3, r * 0.35, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#c98a3a"; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(cx + r * 0.6, cy - 8 - r * 0.7);
      ctx.quadraticCurveTo(cx + r * 1.2, cy - 8 - r * 1.5, cx + r * 0.9, cy - 8 - r * 1.9); ctx.stroke();
      const sp = (Math.sin(t / 70) + 1) / 2;
      ctx.fillStyle = `rgba(255,${140 + Math.floor(80 * sp)},40,.95)`;
      ctx.beginPath(); ctx.arc(cx + r * 0.9, cy - 8 - r * 1.9, 4 + 3 * sp, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = urgent ? "#ff3b30" : "#ffd166"; ctx.font = "700 44px system-ui";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(String(Math.max(0, Math.ceil(s.fuseT === undefined ? 15 : s.fuseT))), cx, cy + r * 1.15);
      ctx.fillStyle = "#ff8f8f"; ctx.font = "700 13px system-ui";
      ctx.fillText(I18N.t("sat.click_break"), cx, s.y + s.sh - 22);
    } else if (s.role === "giant") { // M6
      ctx.fillStyle = "#0a1a0a"; ctx.fillRect(s.x, s.y + 26, s.sw, s.sh - 26);
      drawGoofyFace(cx, cy, Math.min(s.sw, s.sh - 26) * 0.3, "#4caf50", false, t);
      ctx.fillStyle = "#a5ffb0"; ctx.font = "700 13px system-ui"; ctx.textAlign = "center";
      ctx.fillText(I18N.t("sat.bomb_telegraph"), cx, s.y + s.sh - 22);
    } else if (s.role === "minion") { // M6
      const enr = !!(s.opts.enraged || (s.enrageT || 0) > 0);
      ctx.fillStyle = enr ? "#1c0505" : "#0c160a"; ctx.fillRect(s.x, s.y + 26, s.sw, s.sh - 26);
      drawGoofyFace(cx, cy, Math.min(s.sw, s.sh - 26) * 0.3, enr ? "#ff5252" : "#8bc34a", enr, t);
      ctx.fillStyle = enr ? "#ff8f8f" : "#c5f0a8"; ctx.font = "700 13px system-ui"; ctx.textAlign = "center";
      ctx.fillText(enr ? I18N.t("sat.giant_angry") : I18N.t("sat.giant_idle"), cx, s.y + s.sh - 22);
    } else if (s.role === "mother") { // M5
      ctx.fillStyle = "#241105"; ctx.fillRect(s.x, s.y + 26, s.sw, s.sh - 26);
      const r = Math.min(s.sw, s.sh - 26) * 0.26;
      ctx.fillStyle = "#ff9800";
      ctx.beginPath(); ctx.ellipse(cx, cy + 8, r * 1.15, r * 0.85, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#ffa726";
      ctx.beginPath(); ctx.arc(cx + r * 0.72, cy - r * 0.55, r * 0.45, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#e53935";
      for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.arc(cx + r * 0.72 + i * r * 0.28, cy - r * 0.98, r * 0.16, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = "#1a1a1a";
      ctx.beginPath(); ctx.arc(cx + r * 0.84, cy - r * 0.6, r * 0.07, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#ffca28";
      ctx.beginPath(); ctx.moveTo(cx + r * 1.12, cy - r * 0.55); ctx.lineTo(cx + r * 1.38, cy - r * 0.42); ctx.lineTo(cx + r * 1.12, cy - r * 0.3); ctx.closePath(); ctx.fill();
      const flap = Math.sin(t / 240) * 0.5;
      ctx.save(); ctx.translate(cx - r * 0.35, cy + 8); ctx.rotate(-0.4 + flap * 0.3);
      ctx.fillStyle = "#f57c00"; ctx.beginPath(); ctx.ellipse(0, 0, r * 0.55, r * 0.3, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      ctx.fillStyle = "#ffd9a0"; ctx.font = "700 13px system-ui"; ctx.textAlign = "center";
      ctx.fillText(I18N.t("sat.mother_lay_telegraph"), cx, s.y + s.sh - 22);
    } else if (s.role === "chick") { // M5
      const enr = (s.enrageT || 0) > 0;
      ctx.fillStyle = enr ? "#200808" : "#1d1503"; ctx.fillRect(s.x, s.y + 26, s.sw, s.sh - 26);
      const hop = Math.abs(Math.sin(t / 280 + (s.hopPh || 0))) * (enr ? 26 : 16);
      const cr = Math.min(s.sw, s.sh - 26) * (enr ? 0.3 : 0.24);
      ctx.fillStyle = enr ? "#ff8a65" : "#ffd54f";
      ctx.beginPath(); ctx.arc(cx, cy - hop, cr, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#1a1a1a";
      ctx.beginPath(); ctx.arc(cx - cr * 0.3, cy - hop - cr * 0.15, cr * 0.1, 0, Math.PI * 2);
      ctx.arc(cx + cr * 0.3, cy - hop - cr * 0.15, cr * 0.1, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#ff9800";
      ctx.beginPath(); ctx.moveTo(cx - cr * 0.12, cy - hop + cr * 0.1); ctx.lineTo(cx + cr * 0.12, cy - hop + cr * 0.1); ctx.lineTo(cx, cy - hop + cr * 0.32); ctx.closePath(); ctx.fill();
      if (enr) {
        ctx.fillStyle = "#ff5252";
        ctx.beginPath(); ctx.arc(cx - cr * 0.55, cy - hop, cr * 0.16, 0, Math.PI * 2); ctx.arc(cx + cr * 0.55, cy - hop, cr * 0.16, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = enr ? "#ff8f8f" : "#ffe9a8"; ctx.font = "700 13px system-ui"; ctx.textAlign = "center";
      ctx.fillText(enr ? I18N.t("sat.chick_angry") : I18N.t("sat.chick_idle"), cx, s.y + s.sh - 22);
    } else if (s.role === "lover") { // M7: người yêu — trái tim đập thình thịch
      const hb = !!(s.heartbroken);
      ctx.fillStyle = hb ? "#2a0a12" : "#2a0a1a"; ctx.fillRect(s.x, s.y + 26, s.sw, s.sh - 26);
      const beat = 1 + 0.22 * Math.abs(Math.sin(t / 260));
      const r = Math.min(s.sw, s.sh - 26) * 0.26 * beat;
      ctx.fillStyle = hb ? "#ff2020" : "#ff5f8a";
      ctx.beginPath(); // trái tim
      ctx.moveTo(cx, cy + r * 0.75);
      ctx.bezierCurveTo(cx - r * 1.5, cy - r * 0.2, cx - r * 0.8, cy - r * 1.1, cx, cy - r * 0.35);
      ctx.bezierCurveTo(cx + r * 0.8, cy - r * 1.1, cx + r * 1.5, cy - r * 0.2, cx, cy + r * 0.75);
      ctx.fill();
      if (hb) { // mắt giận
        ctx.fillStyle = "#fff";
        ctx.beginPath(); ctx.arc(cx - r * 0.3, cy - r * 0.3, r * 0.12, 0, Math.PI * 2);
        ctx.arc(cx + r * 0.3, cy - r * 0.3, r * 0.12, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#7a0d0d";
        ctx.beginPath(); ctx.arc(cx - r * 0.3, cy - r * 0.3, r * 0.05, 0, Math.PI * 2);
        ctx.arc(cx + r * 0.3, cy - r * 0.3, r * 0.05, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = hb ? "#ff8f8f" : "#ffc2d6"; ctx.font = "700 13px system-ui"; ctx.textAlign = "center";
      ctx.fillText(hb ? I18N.t("sat.love_big_heartbroken") : I18N.t("sat.love_seeking"), cx, s.y + s.sh - 22);
    } else if (s.role === "superlove") { // M7: siêu-popup — tim khổng lồ + sét
      ctx.fillStyle = "#1c0510"; ctx.fillRect(s.x, s.y + 26, s.sw, s.sh - 26);
      const beat = 1 + 0.14 * Math.abs(Math.sin(t / 220));
      const r = Math.min(s.sw, s.sh - 26) * 0.3 * beat;
      ctx.fillStyle = "#ff5f8a";
      ctx.beginPath();
      ctx.moveTo(cx, cy + r * 0.75);
      ctx.bezierCurveTo(cx - r * 1.5, cy - r * 0.2, cx - r * 0.8, cy - r * 1.1, cx, cy - r * 0.35);
      ctx.bezierCurveTo(cx + r * 0.8, cy - r * 1.1, cx + r * 1.5, cy - r * 0.2, cx, cy + r * 0.75);
      ctx.fill();
      const fl = Math.floor(t / 150) % 2 === 0; // tia sét nhấp nháy
      ctx.fillStyle = fl ? "#ffe93c" : "#fff7ae";
      ctx.beginPath();
      ctx.moveTo(cx + 4, cy - r * 1.15); ctx.lineTo(cx - 12, cy + r * 0.1);
      ctx.lineTo(cx - 1, cy + r * 0.1); ctx.lineTo(cx - 6, cy + r * 0.75);
      ctx.lineTo(cx + 12, cy - r * 0.35); ctx.lineTo(cx + 1, cy - r * 0.35);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#ffc2d6"; ctx.font = "700 13px system-ui"; ctx.textAlign = "center";
      ctx.fillText(I18N.t("sat.love_telegraph"), cx, s.y + s.sh - 22);
    } else if (s.role === "mirror") { // M10: gương thần — mặt kính lấp lánh
      ctx.fillStyle = "#08131c"; ctx.fillRect(s.x, s.y + 26, s.sw, s.sh - 26);
      const mw = s.sw * 0.62, mh = (s.sh - 26) * 0.62;
      const gg = ctx.createLinearGradient(cx - mw / 2, cy - mh / 2, cx + mw / 2, cy + mh / 2);
      gg.addColorStop(0, "#164e63"); gg.addColorStop(0.5, "#a5f3fc"); gg.addColorStop(1, "#164e63");
      ctx.fillStyle = gg;
      ctx.beginPath(); ctx.ellipse(cx, cy, mw / 2, mh / 2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#f0abfc"; ctx.lineWidth = 3; ctx.stroke();
      const sx = ((t / 14) % (mw * 1.6)) - mw * 0.8; // vệt sáng chạy qua gương
      ctx.save();
      ctx.beginPath(); ctx.ellipse(cx, cy, mw / 2, mh / 2, 0, 0, Math.PI * 2); ctx.clip();
      ctx.fillStyle = "rgba(255,255,255,.35)";
      ctx.fillRect(cx + sx - 14, cy - mh / 2, 28, mh);
      ctx.restore();
      ctx.fillStyle = "#a5f3fc"; ctx.font = "700 13px system-ui"; ctx.textAlign = "center";
      ctx.fillText(I18N.t("sat.mirror_warn"), cx, s.y + s.sh - 22);
    } else if (s.role === "blackhole") { // M9: hố đen + đĩa bồi tụ xoay
      ctx.fillStyle = "#05030c"; ctx.fillRect(s.x, s.y + 26, s.sw, s.sh - 26);
      const r = Math.min(s.sw, s.sh - 26) * 0.24;
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(t / 900);
      for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = ["#7c3aed", "#c084fc", "#ff9d5c"][i];
        ctx.lineWidth = 5 - i;
        ctx.globalAlpha = 0.85 - i * 0.2;
        ctx.beginPath(); ctx.ellipse(0, 0, r * (1.5 + i * 0.45), r * (0.62 + i * 0.18), 0, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#000";
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.95, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#ff9d5c"; ctx.lineWidth = 2; ctx.stroke();
      const n = (s.swallowed || []).length;
      ctx.fillStyle = "#c084fc"; ctx.font = "700 13px system-ui"; ctx.textAlign = "center";
      ctx.fillText(I18N.t("sat.vacuum_count", { n }), cx, s.y + s.sh - 22);
    } else if (s.role === "fragment") { // M2 rework 2026-10-04: mảnh kính
      ctx.fillStyle = "#0a1626"; ctx.fillRect(s.x, s.y + 26, s.sw, s.sh - 26);
      const wob = Math.sin(t / 200) * 0.1;
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(wob);
      ctx.fillStyle = "rgba(125,211,252,.28)"; // mảnh kính xanh nhạt trong suốt
      ctx.beginPath();
      for (let i = 0; i < 7; i++) {
        const a = i / 7 * Math.PI * 2, r = 24 + (i % 3) * 10;
        i === 0 ? ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r) : ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "#7dd3fc"; ctx.lineWidth = 2; ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,.85)"; ctx.lineWidth = 1.5; // vết nứt
      ctx.beginPath(); ctx.moveTo(-14, 10); ctx.lineTo(-2, -4); ctx.lineTo(10, 6); ctx.lineTo(18, -12); ctx.stroke();
      ctx.restore();
      if (s.fphase === "telegraph") { // telegraph: viền tím nhấp nháy + mũi tên chỉ viền mục tiêu
        const p = (Math.sin(t / 90) + 1) / 2;
        ctx.strokeStyle = `rgba(192,132,252,${0.5 + 0.5 * p})`; ctx.lineWidth = 3 + 2 * p;
        roundRect(s.x + 1, s.y + 1, s.sw - 2, s.sh - 2, 8); ctx.stroke();
        let dx = 0, dy = 1;
        if (s.tedge === "left") { dx = -1; dy = 0; } else if (s.tedge === "right") { dx = 1; dy = 0; }
        else if (s.tedge === "top") { dx = 0; dy = -1; }
        ctx.fillStyle = `rgba(192,132,252,${0.6 + 0.4 * p})`;
        const ahx = cx + dx * 44, ahy = cy + dy * 44;
        ctx.beginPath();
        ctx.moveTo(ahx + dx * 14, ahy + dy * 14);
        ctx.lineTo(ahx - dy * 9, ahy + dx * 9);
        ctx.lineTo(ahx + dy * 9, ahy - dx * 9);
        ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = "#9adcff"; ctx.font = "700 13px system-ui"; ctx.textAlign = "center";
      ctx.fillText(I18N.t("sat.click_break"), cx, s.y + s.sh - 22);
    } else {
      ctx.fillStyle = "#0a0a14"; ctx.fillRect(s.x, s.y + 26, s.sw, s.sh - 26);
      ctx.fillStyle = s.color; ctx.font = "700 22px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("◈", cx, cy);
    }
  }

  function updateSims(dt) {
    for (const s of sats.values()) {
      if (s.flash > 0) s.flash -= dt * 4;
      if (s.dead && s.shatterT > 0) s.shatterT -= dt;
    }
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    if (Array.isArray(r)) { // [tl, tr, br, bl]
      ctx.moveTo(x + r[0], y);
      ctx.lineTo(x + w - r[1], y); ctx.arcTo(x + w, y, x + w, y + r[1], r[1]);
      ctx.lineTo(x + w, y + h - r[2]); ctx.arcTo(x + w, y + h, x + w - r[2], y + h, r[2]);
      ctx.lineTo(x + r[3], y + h); ctx.arcTo(x, y + h, x, y + h - r[3], r[3]);
      ctx.lineTo(x, y + r[0]); ctx.arcTo(x, y, x + r[0], y, r[0]);
    } else {
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
    }
    ctx.closePath();
  }

  return { request, flush, poll, closeAll, count, list, values, anyRole, damage, kill, hitSim, drawSims, updateSims,
    send: (id, msg) => post(id, msg), // M8: gửi sat-tick cho popup thật
    steer: (id, vx, vy) => post(id, { type: "sat-steer", id, vx, vy }),
    warn: (id) => post(id, { type: "sat-warn", id }) };
})();

