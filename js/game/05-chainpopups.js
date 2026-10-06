/* ---------------- M1 — Ổ QUÁI BAY (Nest Window) ---------------- */
function nestSpawnPoint(sat) {
  // vị trí ổ trong tọa độ screen → đổi sang arena, spawn ở viền gần nhất
  let cx, cy;
  if (sat.sim) { cx = sat.x + sat.sw / 2; cy = sat.y + sat.sh / 2; }
  else {
    cx = (sat.x + sat.w / 2) - window.screenX;
    cy = (sat.y + sat.h / 2) - window.screenY;
  }
  return nearestEdgePoint(clamp(cx, 0, window.innerWidth), clamp(cy, 0, window.innerHeight));
}

function onNestClose(mode, sat) {
  const p = nestSpawnPoint(sat);
  if (mode === "manual") {
    // đóng tay: ổ vỡ tung, nhả tối đa 4 con dồn (risk/reward)
    const n = Math.min(4, Math.max(0, sat.opts.maxSpawns - sat.spawned));
    for (let i = 0; i < n; i++) {
      const type = sat.opts.pool[(Math.random() * sat.opts.pool.length) | 0];
      spawnEnemyAt(type, p.x + rand(-40, 40), p.y + rand(-40, 40));
    }
    addFloat(p.x, p.y - 24, I18N.t("sat.nest_burst"), "#ff7ad9", true);
    AudioEngine.sfx.bigboom();
  } else if (mode === "killed") {
    burst(p.x, p.y, 26, ["#c084fc", "#8b2fc9", "#fff"], 320);
    addFloat(p.x, p.y - 24, I18N.t("sat.nest_killed"), "#c084fc", true);
  }
  // "timeout": tự rút êm, không phạt
}

function updateNests(dt) {
  const now = performance.now();
  for (const sat of SatManager.values()) {
    if (sat.role !== "nest" || sat.dead) continue;
    if (now - sat.born > 60000) { SatManager.kill(sat.id, "timeout"); continue; } // TTL 60s
    sat.spawnT -= dt;
    if (sat.spawnT <= 0 && sat.spawned < sat.opts.maxSpawns) {
      sat.spawnT = sat.opts.spawnEvery;
      sat.spawned++;
      const type = sat.opts.pool[(Math.random() * sat.opts.pool.length) | 0];
      const p = nestSpawnPoint(sat);
      spawnEnemyAt(type, p.x, p.y);
      AudioEngine.sfx.shrink();
      addFloat(p.x, p.y - 20, I18N.t("sat.nest_released"), "#c084fc");
    }
  }
}

function maybeTriggerNest(n) {
  if (SAT_MODE === "off" || SatManager.anyRole("nest")) return;
  const act = actOf(n);
  const want = (act === 1 && n >= 6) || (act === 3 && n > 0 && n % 5 === 0);
  if (!want) return;
  const sat = SatManager.request("nest", {
    hp: 6, color: "#8b2fc9", label: I18N.t("sat.nest_label"), w: 340, h: 220,
    spawnEvery: 6, pool: ["chewer", "chaser"], maxSpawns: 8,
    onClose: onNestClose,
  });
  if (sat) {
    sat.spawnT = 2; // nhả con đầu sau 2s
    setBanner(I18N.t("sat.nest_spawn"), "");
  } else {
    // SAT_MODE=off hoặc hết quota: spawn thường tương đương, giữ cân bằng
    const p1 = edgeSpawn(), p2 = edgeSpawn();
    spawnEnemyAt("chewer", p1.x, p1.y); spawnEnemyAt("chewer", p2.x, p2.y);
  }
}

/* ---------------- M3 — CỬA SỔ KHIÊN (Shield Window) ----------------
 * Pickup "shieldwin" (wave 4+): gọi cửa sổ khiên xanh bám cạnh cửa sổ chính.
 * - Popup thật: mỗi 0.5s moveTo giữ khoảng cách 16px bên phải cửa sổ chính.
 * - Chewer trong 300px ưu tiên gặm khiên thay vì cửa sổ chính.
 * - Máu kính 60px, mỗi lần bị gặm -12px (popup thật thu nhỏ theo cho thấy được).
 * - Fallback mô phỏng: drone khiên bay quanh tàu r=70, 5 tim, chewer bám drone.
 * - TTL 45s; đóng tay = mất khiên, không phạt; nhặt nữa = hồi đầy. */
function shieldSat() { for (const s of SatManager.values()) if (s.role === "shield" && !s.dead) return s; return null; }

function requestShield() {
  const ex = shieldSat();
  if (ex) { // nhặt nữa = hồi đầy
    ex.shieldPx = 60; ex.hearts = 5;
    addFloat(G.ship.x, G.ship.y - 34, I18N.t("pickup.shield_refilled"), "#38bdf8", true);
    AudioEngine.sfx.pickup();
    return;
  }
  const sat = SatManager.request("shield", {
    hp: 999, color: "#38bdf8", label: I18N.t("sat.shield_label"), w: 260, h: 200,
    shieldPx: 60, hearts: 5,
    onClose: (mode) => {
      if (mode === "killed") {
        const p = shieldTarget() || { x: G.ship.x, y: G.ship.y };
        burst(p.x, p.y, 34, ["#38bdf8", "#ffffff"], 340);
        addFloat(p.x, p.y - 30, I18N.t("pickup.shield_broken"), "#38bdf8", true);
        AudioEngine.sfx.bigboom();
      }
      // thả chewer đang bám khiên
      G.enemies.forEach(e => { if (e.onShield) { e.onShield = false; e.latched = null; } });
    },
  });
  if (sat) {
    sat.shieldPx = 60; sat.hearts = 5; sat.followT = 0;
    setBanner(I18N.t("pickup.shield_banner"), "");
    AudioEngine.sfx.pickup();
  }
}

/* điểm bám của khiên (tọa độ arena): popup thật → viền phải; sim → drone quanh tàu */
function shieldTarget() {
  const sat = shieldSat();
  if (!sat) return null;
  const b = bounds(), s = G.ship;
  if (sat.sim) {
    const t = performance.now() / 1000;
    return { x: s.x + Math.cos(t * 1.4) * 70, y: s.y + Math.sin(t * 1.4) * 70, edge: "drone" };
  }
  const sy = clamp(sat.y + sat.h / 2 - window.screenY, b.y + 20, b.y + b.h - 20);
  return { x: b.x + b.w, y: sy, edge: "right" };
}

function updateShield(dt) {
  const sat = shieldSat();
  if (!sat) return;
  if (performance.now() - sat.born > 45000) { SatManager.kill(sat.id, "timeout"); return; }
  if (sat.sim) return; // drone tự bay quanh tàu
  sat.followT -= dt;
  if (sat.followT <= 0 && sat.canMove && sat.win && !sat.win.closed) {
    sat.followT = 0.5;
    try {
      sat.x = window.screenX + window.outerWidth + 16;
      sat.y = window.screenY + 100;
      sat.win.moveTo(Math.round(sat.x), Math.round(sat.y));
    } catch (e) { /* popup mất quyền di chuyển: đứng yên */ }
  }
}

/* chewer gặm khiên thay vì gặm cửa sổ chính */
function damageShield(e) {
  const sat = shieldSat();
  if (!sat) { e.onShield = false; e.latched = null; return; }
  AudioEngine.sfx.shrink(); G.shake = Math.max(G.shake, 4);
  burst(e.x, e.y, 8, ["#38bdf8", "#ffffff"], 180);
  if (sat.sim) {
    sat.hearts = Math.max(0, (sat.hearts ?? 5) - 1);
    if (sat.hearts <= 0) SatManager.kill(sat.id, "killed");
  } else {
    sat.shieldPx = Math.max(0, (sat.shieldPx ?? 60) - 12);
    try { // thu nhỏ popup thật để máu kính nhìn thấy được
      const w = sat.win;
      w.resizeTo(Math.max(120, w.outerWidth - 12), Math.max(90, w.outerHeight - 8));
    } catch (err) { /* bỏ qua */ }
    if (sat.shieldPx <= 0) SatManager.kill(sat.id, "killed");
  }
}

/* ---------------- M4 — MƯA MẢNH VỠ (Debris Rain) ----------------
 * Boss slam 50% → thay bằng 2-3 mảnh vỡ vệ tinh bay về cửa sổ chính (150px/s).
 * - Telegraph đỏ 0.7s trước khi xuất phát; click = 1 dmg (HP 3).
 * - Chạm cửa sổ chính → nổ: shrinkWindow(15,12) + shake 10 + jitter 20.
 * - Đóng tay = coi như bắn hạ nhưng không điểm, không gem (chống exploit).
 * - Fallback: bay trong arena từ viền vào tâm tàu; chạm tàu = 1 dmg;
 *   chạm viền arena = nứt viền (+ thu nhỏ arena nếu đang ở chế độ ảo). */
function spawnDebris() {
  if (SAT_MODE === "off" || SatManager.anyRole("debris")) return;
  const n = 2 + (Math.random() < 0.5 ? 1 : 0);
  setBanner(I18N.t("sat.debris_spawn"), "");
  AudioEngine.sfx.boss();
  for (let i = 0; i < n; i++) {
    SatManager.request("debris", {
      hp: 3, color: "#ff5a5a", label: I18N.t("sat.debris_label"), w: 200, h: 140, speed: 150,
      onClose: (mode, s) => {
        if (mode === "impact" || mode === "killed") {
          const p = s.sim ? { x: s.x + s.sw / 2, y: s.y + s.sh / 2 } : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
          burst(p.x, p.y, 22, ["#ff5a5a", "#ffffff"], 300);
        }
        // manual: không thưởng, không phạt
      },
    });
  }
}

function launchDebris(sat) {
  const sp = sat.opts.speed || 150;
  AudioEngine.sfx.shoot();
  if (sat.sim) {
    const s = G.ship, cx = sat.x + sat.sw / 2, cy = sat.y + sat.sh / 2;
    const d = hypot(s.x - cx, s.y - cy) || 1;
    sat.vx = (s.x - cx) / d * sp; sat.vy = (s.y - cy) / d * sp;
  } else {
    let sx, sy;
    try { sx = sat.win.screenX + sat.w / 2; sy = sat.win.screenY + sat.h / 2; }
    catch (e) { return; }
    const mx = window.screenX + window.outerWidth / 2, my = window.screenY + window.outerHeight / 2;
    const d = hypot(mx - sx, my - sy) || 1;
    sat.vx = (mx - sx) / d * sp; sat.vy = (my - sy) / d * sp;
    SatManager.steer(sat.id, sat.vx, sat.vy);
  }
}

function updateDebris(dt) {
  for (const sat of SatManager.values()) {
    if (sat.role !== "debris" || sat.dead) continue;
    if (sat.warnT === undefined) sat.warnT = 0.7; // telegraph bắt đầu khi vệ tinh đã sống
    if (sat.warnT > 0) {
      sat.warnT -= dt;
      if (sat.warnT <= 0) launchDebris(sat);
      continue;
    }
    if (sat.sim) {
      sat.x += sat.vx * dt; sat.y += sat.vy * dt;
      const s = G.ship, b = bounds();
      const cx = sat.x + sat.sw / 2, cy = sat.y + sat.sh / 2;
      if (dist2(s.x, s.y, cx, cy) < (s.r + 34) * (s.r + 34)) {
        hurtShip(1, cx, cy);
        SatManager.kill(sat.id, "impact");
        continue;
      }
      if (cx < b.x || cx > b.x + b.w || cy < b.y || cy > b.y + b.h) {
        addCrack(cx, cy);
        G.shake = Math.max(G.shake, 8);
        if (!winCtrl.ok && arena) shrinkWindow(8, 6); // arena ảo chính là cửa sổ
        SatManager.kill(sat.id, "impact");
      }
    } else {
      sat.colT = (sat.colT || 0) - dt; // check va chạm mỗi 0.2s
      if (sat.colT <= 0) {
        sat.colT = 0.2;
        try {
          const sx = sat.win.screenX, sy = sat.win.screenY;
          const mx = window.screenX, my = window.screenY, mw = window.outerWidth, mh = window.outerHeight;
          if (sx < mx + mw && sx + sat.w > mx && sy < my + mh && sy + sat.h > my) {
            shrinkWindow(15, 12); G.shake = 10; windowJitter(20);
            AudioEngine.sfx.bigboom();
            addFloat(window.innerWidth / 2, window.innerHeight / 2 - 40, I18N.t("sat.debris_hit"), "#ff5a5a", true);
            SatManager.kill(sat.id, "impact");
          }
        } catch (e) { /* popup đã đóng */ }
      }
    }
  }
}

/* vết nứt viền arena (mô phỏng), mờ dần 3s */
function addCrack(x, y) {
  const b = bounds();
  const edge = Math.abs(x - b.x) < 40 ? "left" : Math.abs(x - (b.x + b.w)) < 40 ? "right"
    : Math.abs(y - b.y) < 40 ? "top" : "bottom";
  G.cracks.push({ x: clamp(x, b.x, b.x + b.w), y: clamp(y, b.y, b.y + b.h), edge, t: 3 });
  AudioEngine.sfx.crack();
}
function updateCracks(dt) {
  for (let i = G.cracks.length - 1; i >= 0; i--) { G.cracks[i].t -= dt; if (G.cracks[i].t <= 0) G.cracks.splice(i, 1); }
}
function drawCracks() {
  for (const c of G.cracks) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, c.t);
    ctx.strokeStyle = "#ff8f8f"; ctx.lineWidth = 2;
    ctx.beginPath();
    const horiz = c.edge === "top" || c.edge === "bottom";
    for (let i = -3; i <= 3; i++) {
      const jx = c.x + (horiz ? i * 12 : (i % 2) * 8 - 4), jy = c.y + (horiz ? (i % 2) * 8 - 4 : i * 12);
      i === -3 ? ctx.moveTo(jx, jy) : ctx.lineTo(jx, jy);
    }
    ctx.stroke();
    ctx.restore();
  }
}

/* ---------------- M8 — QUẢ BOM CƯỜI (Bomb Window) ----------------
 * Act 2+, wave ≥ 8, mỗi wave tối đa 2 quả, không cùng lúc với M5.
 * Đếm ngược 15s (số to trong popup qua sat-tick + khung giả vẽ số).
 * Hết giờ → nổ: 5-6 mini + hất tàu văng. Phá kịp (8 click) → +2 gem +500.
 * ĐÓNG TAY = nổ ngay, toàn dasher. Fallback: khung giả nhấp nháy đỏ-cam. */
/* nảy khung giả */
function bounceSimSat(s, mul, dt) {
  s.x += s.vx * mul * dt; s.y += s.vy * mul * dt;
  const b = bounds();
  if (s.x < b.x) { s.x = b.x; s.vx = Math.abs(s.vx); }
  else if (s.x + s.sw > b.x + b.w) { s.x = b.x + b.w - s.sw; s.vx = -Math.abs(s.vx); }
  if (s.y < b.y) { s.y = b.y; s.vy = Math.abs(s.vy); }
  else if (s.y + s.sh > b.y + b.h) { s.y = b.y + b.h - s.sh; s.vy = -Math.abs(s.vy); }
}

function knockShip(fx, fy, power) {
  const s = G.ship;
  if (!s || G.phase !== "play") return;
  const dx = s.x - fx, dy = s.y - fy, d = hypot(dx, dy) || 1;
  const p = Math.min(power, 700);
  s.kbvx = (s.kbvx || 0) + dx / d * p;
  s.kbvy = (s.kbvy || 0) + dy / d * p;
}

function explodeBomb(sat, manual) {
  if (sat.exploded) return;
  sat.exploded = true;
  const p = nestSpawnPoint(sat);
  const n = 5 + (Math.random() < 0.5 ? 1 : 0);
  const type = manual ? "dasher" : "mini";
  for (let i = 0; i < n; i++) spawnEnemyAt(type, p.x + rand(-60, 60), p.y + rand(-60, 60));
  knockShip(p.x, p.y, 460);
  burst(p.x, p.y, 40, ["#ff5722", "#ff9800", "#ffd166", "#ffffff"], 420);
  jxShake(10, 400, 8); windowJitter(26);
  AudioEngine.sfx.bigboom();
  addFloat(p.x, p.y - 30, manual ? I18N.t("sat.bomb_tick") : I18N.t("sat.bomb_boom"), "#ff5722", true);
}

function onBombClose(mode, sat) {
  const p = nestSpawnPoint(sat);
  if (mode === "manual") {
    explodeBomb(sat, true);
  } else if (mode === "killed") {
    burst(p.x, p.y, 24, ["#ff9800", "#ffd166", "#ffffff"], 300);
    for (let i = 0; i < 2; i++) {
      const a = Math.random() * Math.PI * 2;
      G.gems.push({ x: p.x, y: p.y, vx: Math.cos(a) * 130, vy: Math.sin(a) * 130, v: 1, t: rand(0, 9) });
    }
    G.score += 500;
    addFloat(p.x, p.y - 30, I18N.t("sat.bomb_killed"), "#ffd166", true);
    AudioEngine.sfx.pickup();
  }

}

function updateBombs(dt) {
  for (const sat of SatManager.values()) {
    if (sat.role !== "bomb" || sat.dead) continue;
    sat.fuseT -= dt;
    const secs = Math.max(0, Math.ceil(sat.fuseT));
    if (secs !== sat.tickLast) {
      sat.tickLast = secs;
      if (!sat.sim) SatManager.send(sat.id, { type: "sat-tick", id: sat.id, t: secs }); // popup thật hiện số
      AudioEngine.sfx.click();
    }
    if (sat.fuseT <= 0) {
      explodeBomb(sat, false);
      SatManager.kill(sat.id, "exploded");
    }
  }
}

function maybeTriggerBomb(n) {
  if (n < 8 || G.bombWave === n) return;
  if (SatManager.anyRole("mother") || SatManager.anyRole("bomb")) return;
  G.bombWave = n;
  let made = 0;
  for (let i = 0; i < 2; i++) {
    const sat = SatManager.request("bomb", {
      hp: 8, color: "#ff5722", label: I18N.t("sat.bomb_label"), w: 300, h: 220,
      onClose: onBombClose,
    });
    if (sat) { made++; sat.fuseT = 15; sat.tickLast = -1; }
    else break;
  }
  if (made > 0) {
    setBanner(I18N.t("sat.bomb_spawn"), "");
    AudioEngine.sfx.wave();
  } else if (SAT_MODE === "off") {
    spawnEnemy("dasher"); spawnEnemy("dasher");
  }
}

/* ---------------- M6 — MỘT THÀNH HAI (Giant/Minion) ----------------
 * Act 2+, wave ≥ 9, mỗi wave 1 lần. Khổng lồ (8 HP) bị phá → "BỐP!" tách 2 nhóc
 * (HP 4, nhỏ bằng nửa). Nhóc mỗi 4s nhả 1 mini (tối đa 6); phá cả 2 → 1 heart + 2 gem.
 * ĐÓNG TAY khổng lồ = tách ngay nhưng cả 2 nổi giận (nhanh x1.5, nhả mỗi 2.5s).
 * ĐÓNG TAY 1 nhóc = nhóc còn lại giận 12s (nhả nhanh gấp đôi). */
function spawnMinion(parent, enraged) {
  const sat = SatManager.request("minion", {
    hp: 4, color: "#8bc34a", label: I18N.t("sat.giant_label"), w: 210, h: 150,
    enraged, onClose: onMinionClose,
  });
  if (!sat) return null;
  const sp = (enraged ? 1.5 : 1) * (70 + Math.random() * 40);
  const a = Math.random() * Math.PI * 2;
  sat.vx = Math.cos(a) * sp; sat.vy = Math.sin(a) * sp;
  sat.spawnT = enraged ? 2.5 : 4; sat.spawned = 0; sat.maxSpawns = 6; sat.enrageT = 0; sat.steerT = 0;
  if (sat.sim && parent && parent.sim) {
    const b = bounds();
    sat.x = clamp(parent.x + parent.sw / 2 - sat.sw / 2 + rand(-70, 70), b.x, Math.max(b.x, b.x + b.w - sat.sw));
    sat.y = clamp(parent.y + parent.sh / 2 - sat.sh / 2 + rand(-50, 50), b.y, Math.max(b.y, b.y + b.h - sat.sh));
  }
  return sat;
}

function liveMinion(exceptId) {
  return SatManager.list().find(s => s.role === "minion" && !s.dead && s.id !== exceptId) || null;
}

function onGiantClose(mode, sat) {
  const p = nestSpawnPoint(sat);
  if (mode === "killed" || mode === "manual") {
    const enraged = mode === "manual";
    burst(p.x, p.y, 30, ["#4caf50", "#8bc34a", "#ffffff"], 340);
    AudioEngine.sfx.bigboom();
    addFloat(p.x, p.y - 30, enraged ? I18N.t("sat.giant_split_angry") : I18N.t("sat.giant_split"), "#4caf50", true);
    spawnMinion(sat, enraged);
    spawnMinion(sat, enraged);
  }

}

function onMinionClose(mode, sat) {
  const p = nestSpawnPoint(sat);
  if (mode === "manual") {
    const other = liveMinion(sat.id);
    if (other) {
      other.enrageT = 12;
      addFloat(p.x, p.y - 30, I18N.t("sat.giant_enraged"), "#ff5252", true);
      AudioEngine.sfx.boss();
    }
    burst(p.x, p.y, 20, ["#8bc34a", "#ffffff"], 300);
  } else if (mode === "killed") {
    burst(p.x, p.y, 20, ["#8bc34a", "#ffffff"], 300);
    if (!liveMinion(sat.id)) {
      // phá cả 2 nhóc → 1 heart + 2 gem
      G.pickups.push({ kind: "heart", x: p.x, y: p.y, t: 0 });
      for (let i = 0; i < 2; i++) {
        const a = Math.random() * Math.PI * 2;
        G.gems.push({ x: p.x, y: p.y, vx: Math.cos(a) * 130, vy: Math.sin(a) * 130, v: 1, t: rand(0, 9) });
      }
      addFloat(p.x, p.y - 34, I18N.t("sat.giant_caught"), "#8bc34a", true);
      AudioEngine.sfx.pickup();
    }
  }
}

function updateMinions(dt) {
  for (const sat of SatManager.values()) {
    if (sat.role !== "minion" || sat.dead) continue;
    if (performance.now() - sat.born > 45000) { SatManager.kill(sat.id, "timeout"); continue; }
    let interval = sat.opts.enraged ? 2.5 : 4;
    let speedMul = sat.opts.enraged ? 1.5 : 1;
    if (sat.enrageT > 0) {
      sat.enrageT -= dt;
      interval = Math.max(1.2, interval / 2);
      speedMul *= 1.5;
    }
    if (sat.sim) bounceSimSat(sat, speedMul, dt);
    else if (sat.canMove && sat.win && !sat.win.closed) {
      sat.steerT -= dt;
      if (sat.steerT <= 0) {
        sat.steerT = 2;
        const a = Math.random() * Math.PI * 2, sp = 70 * speedMul;
        SatManager.steer(sat.id, Math.cos(a) * sp, Math.sin(a) * sp);
      }
    }
    sat.spawnT -= dt;
    if (sat.spawnT <= 0 && sat.spawned < sat.maxSpawns) {
      sat.spawnT = interval; sat.spawned++;
      const p = nestSpawnPoint(sat);
      spawnEnemyAt("mini", p.x + rand(-30, 30), p.y + rand(-30, 30));
      AudioEngine.sfx.shrink();
    }
  }
}

function maybeTriggerGiant(n) {
  const act = actOf(n);
  if (act < 2 || n < 9 || G.giantWave === n) return;
  if (SatManager.anyRole("giant")) return;
  G.giantWave = n;
  const sat = SatManager.request("giant", {
    hp: 8, color: "#4caf50", label: I18N.t("sat.giant_big_label"), w: 420, h: 300,
    onClose: onGiantClose,
  });
  if (sat) {
    setBanner(I18N.t("sat.giant_big_spawn"), "");
    AudioEngine.sfx.boss();
  } else if (SAT_MODE === "off") {
    spawnEnemy("tank");
  }
}

/* ---------------- M5 — MẸ GÀ ĐẺ TRỨNG VÀNG (Mother/Chick) ----------------
 * Act 2+, wave ≥ 7, mỗi wave 1 lần, cần ≥ 2 slot trống (mẹ + 2 con = 3 popup).
 * Mẹ mỗi 8s đẻ 1 con (tối đa 2); con nhảy tưng tưng, mỗi 5s nhả 1 mini.
 * Phá MẸ → con "NỔI GIẬN MẤT MẸ": to x1.5, nhanh x2, nhả x2 trong 10s rồi tự vỡ
 * (rơi gem an ủi). ĐÓNG TAY mẹ = con giận + mất 1 HP. ĐÓNG TAY con = nổ, 2 mini. */
function motherChicks(motherId) {
  return SatManager.list().filter(s => s.role === "chick" && !s.dead && s.motherId === motherId);
}
// GC-2026-10: bản đếm không alloc cho check per-frame trong updateMothers
function motherChickCount(motherId) {
  let n = 0;
  for (const s of SatManager.values()) if (s.role === "chick" && !s.dead && s.motherId === motherId) n++;
  return n;
}

function enrageChicks(motherId, msg) {
  const chicks = motherChicks(motherId);
  for (const c of chicks) c.enrageT = 10;
  if (chicks.length) {
    const p = nestSpawnPoint(chicks[0]);
    addFloat(p.x, p.y - 30, msg, "#ff9800", true);
    AudioEngine.sfx.boss();
  }
}

function onMotherClose(mode, sat) {
  const p = nestSpawnPoint(sat);
  if (mode === "killed") {
    burst(p.x, p.y, 26, ["#ff9800", "#ffd54f", "#ffffff"], 320);
    enrageChicks(sat.id, I18N.t("sat.chick_enraged"));
  } else if (mode === "manual") {
    burst(p.x, p.y, 26, ["#ff9800", "#ffd54f", "#ffffff"], 320);
    enrageChicks(sat.id, I18N.t("sat.chick_manual"));
    hurtShip(1, p.x, p.y);
  }

}

function onChickClose(mode, sat) {
  const p = nestSpawnPoint(sat);
  if (mode === "manual") {

    burst(p.x, p.y, 22, ["#ffd54f", "#ff9800", "#ffffff"], 320);
    spawnEnemyAt("mini", p.x - 22, p.y);
    spawnEnemyAt("mini", p.x + 22, p.y);
    addFloat(p.x, p.y - 26, I18N.t("sat.chick_dead"), "#ffd54f", true);
    AudioEngine.sfx.boom();
  } else if (mode === "killed") {
    burst(p.x, p.y, 14, ["#ffd54f", "#ffffff"], 240);
    AudioEngine.sfx.hit();
  }

}

function layChick(mother) {
  const sat = SatManager.request("chick", {
    hp: 4, color: "#ffd54f", label: I18N.t("sat.chick_label"), w: 170, h: 120,
    onClose: onChickClose,
  });
  if (!sat) return null;
  sat.motherId = mother.id;
  const sp = 90 + Math.random() * 60, a = Math.random() * Math.PI * 2;
  sat.vx = Math.cos(a) * sp; sat.vy = Math.sin(a) * sp;
  sat.spawnT = 2; sat.spawned = 0; sat.maxSpawns = 8; sat.enrageT = 0;
  sat.hopPh = Math.random() * 9;
  if (sat.sim && mother.sim) {
    const b = bounds();
    sat.x = clamp(mother.x + mother.sw / 2 - sat.sw / 2 + rand(-70, 70), b.x, Math.max(b.x, b.x + b.w - sat.sw));
    sat.y = clamp(mother.y + mother.sh / 2 - sat.sh / 2 + rand(-50, 50), b.y, Math.max(b.y, b.y + b.h - sat.sh));
  }
  const p = nestSpawnPoint(mother);
  addFloat(p.x, p.y - 20, I18N.t("sat.mother_lay"), "#ffd54f");
  AudioEngine.sfx.pickup();
  return sat;
}

function updateMothers(dt) {
  for (const sat of SatManager.values()) {
    if (sat.role !== "mother" || sat.dead) continue;
    if (performance.now() - sat.born > 75000) { SatManager.kill(sat.id, "timeout"); continue; }
    sat.layT = (sat.layT === undefined ? 3 : sat.layT) - dt;
    if (sat.layT <= 0) {
      if (motherChickCount(sat.id) < 2) layChick(sat);
      sat.layT = 8;
    }
  }
}

function updateChicks(dt) {
  for (const sat of SatManager.values()) {
    if (sat.role !== "chick" || sat.dead) continue;
    const enraged = sat.enrageT > 0;
    if (enraged) {
      sat.enrageT -= dt;
      if (sat.enrageT <= 0) {

        const p = nestSpawnPoint(sat);
        G.gems.push({ x: p.x, y: p.y, vx: rand(-90, 90), vy: rand(-90, 90), v: 1, t: rand(0, 9) });
        addFloat(p.x, p.y - 24, I18N.t("sat.chick_calm"), "#ffd54f");
        burst(p.x, p.y, 16, ["#ffd54f", "#ffffff"], 220);
        AudioEngine.sfx.pickup();
        SatManager.kill(sat.id, "timeout");
        continue;
      }
    }
    const speedMul = enraged ? 2 : 1;
    if (sat.sim) bounceSimSat(sat, speedMul, dt);
    sat.spawnT -= dt;
    if (sat.spawnT <= 0 && sat.spawned < sat.maxSpawns) {
      sat.spawnT = enraged ? 2.5 : 5; sat.spawned++;
      const p = nestSpawnPoint(sat);
      spawnEnemyAt("mini", p.x + rand(-24, 24), p.y + rand(-24, 24));
      AudioEngine.sfx.shrink();
    }
  }
}

function maybeTriggerMother(n) {
  if (n < 10 || G.motherWave === n) return;
  if (SatManager.anyRole("mother") || SatManager.anyRole("bomb")) return;
  if (SatManager.count() > 1) return;
  G.motherWave = n;
  const sat = SatManager.request("mother", {
    hp: 8, color: "#ff9800", label: I18N.t("sat.mother_label"), w: 340, h: 240,
    onClose: onMotherClose,
  });
  if (sat) {
    sat.layT = 3;
    setBanner(I18N.t("sat.mother_spawn"), "");
    AudioEngine.sfx.pickup();
  } else if (SAT_MODE === "off") {
    spawnEnemy("chewer"); spawnEnemy("chewer");
  }
}

/* ---------------- M7 — TÌNH YÊU SÉT ĐÁNH (Lightning Love) ----------------
 * Act 2+, wave ≥ 12, mỗi wave 1 lần, cần cả 3 slot trống.
 * 2 popup "người yêu" (5 HP) trôi về phía nhau; chạm nhau → "BÙM! TÌNH YÊU SÉT ĐÁNH!"
 * hợp thành SIÊU-POPUP 10 HP. Siêu-popup mỗi 5s bắn 1 trái tim độc vào tàu.
 * Phá siêu-popup → +4 gem +800. ĐÓNG TAY 1 người yêu = người còn lại THẤT TÌNH:
 * nhanh x2, mỗi 4s nhả 1 chaser (tối đa 4), ăn ngay 2 chaser.
 * ĐÓNG TAY siêu-popup = 3 trái tim độc bay vào tàu + hất văng.
 * Fallback: khung giả trôi trong arena, chạm nhau là hợp nhất. */
function loverOf(sat) {
  return SatManager.list().find(s => s.role === "lover" && !s.dead && s.id !== sat.id && s.pairId === sat.pairId) || null;
}

/* tâm lover trong tọa độ screen (popup thật) */
function loverScreen(sat) {
  return { x: sat.x + sat.w / 2, y: sat.y + sat.h / 2 };
}

function loverAnchor(sat) {
  if (sat.sim) return { x: sat.x + sat.sw / 2, y: sat.y + sat.sh / 2 };
  const p = nestSpawnPoint(sat);
  return { x: p.x, y: p.y };
}

function onLoverClose(mode, sat) {
  const p = loverAnchor(sat);
  if (mode === "manual") {
    // đóng tay: người còn lại THẤT TÌNH — giận dữ, đẻ quái trả thù
    const other = loverOf(sat);
    burst(p.x, p.y, 22, ["#ff5f8a", "#ff8fab", "#ffffff"], 300);
    addFloat(p.x, p.y - 28, I18N.t("sat.love_heartbroken"), "#ff5f8a", true);
    AudioEngine.sfx.boss();
    if (other && !other.dead) {
      other.heartbroken = true;
      other.spawnT = 0.5; other.spawned = 0;
      for (let i = 0; i < 2; i++) {
        const q = loverAnchor(other);
        spawnEnemyAt("chaser", q.x + rand(-50, 50), q.y + rand(-50, 50));
      }
    }
  } else if (mode === "killed") {
    burst(p.x, p.y, 16, ["#ff8fab", "#ffffff"], 240);
    addFloat(p.x, p.y - 24, "💔", "#ff8fab", true);
    AudioEngine.sfx.hit();
    const other = loverOf(sat); // người còn lại cô đơn → tự rút sau 6s
    if (other && !other.dead) other.lonelyT = 6;
  }
  // "merge"/"timeout": êm, không phạt
}

function onSuperloveClose(mode, sat) {
  const p = loverAnchor(sat);
  if (mode === "killed") {
    burst(p.x, p.y, 44, ["#ff5f8a", "#ff8fab", "#ffd166", "#ffffff"], 420);
    jxShake(8, 350, 6);
    for (let i = 0; i < 4; i++) {
      const a = Math.random() * Math.PI * 2;
      G.gems.push({ x: p.x, y: p.y, vx: Math.cos(a) * 150, vy: Math.sin(a) * 150, v: 1, t: rand(0, 9) });
    }
    G.score += 80; // §6/§1.10: phá siêu-popup = 80 cố định
    addFloat(p.x, p.y - 34, I18N.t("sat.love_broken"), "#ff8fab", true);
    AudioEngine.sfx.pickup();
  } else if (mode === "manual") {
    // đóng tay siêu-popup: 3 trái tim độc bay vào tàu + hất văng
    burst(p.x, p.y, 30, ["#ff2020", "#ff5f8a", "#ffffff"], 380);
    const s = G.ship;
    const base = Math.atan2(s.y - p.y, s.x - p.x);
    for (let i = -1; i <= 1; i++) {
      const a = base + i * 0.28;
      G.ebullets.push({ x: p.x, y: p.y, vx: Math.cos(a) * 260, vy: Math.sin(a) * 260, r: 7, life: 4 });
    }
    knockShip(p.x, p.y, 420);
    jxShake(8, 350, 6);
    addFloat(p.x, p.y - 30, I18N.t("sat.love_manual"), "#ff2020", true);
    AudioEngine.sfx.bigboom();
  }
}

function mergeLovers(a, b) {
  if (!a || !b || a.dead || b.dead || a.merged || b.merged) return;
  a.merged = b.merged = true;
  const pa = loverAnchor(a), pb = loverAnchor(b);
  const mx = (pa.x + pb.x) / 2, my = (pa.y + pb.y) / 2;
  burst(mx, my, 40, ["#ff5f8a", "#ffd166", "#ffffff"], 400);
  jxShake(7, 300, 5); windowJitter(18);
  AudioEngine.sfx.zap();
  addFloat(mx, my - 40, I18N.t("sat.love_boom"), "#ff8fab", true);
  SatManager.kill(a.id, "merge");
  SatManager.kill(b.id, "merge");
  const sat = SatManager.request("superlove", {
    hp: 10, color: "#ff5f8a", label: I18N.t("sat.love_label"), w: 340, h: 240,
    onClose: onSuperloveClose,
  });
  if (sat) {
    sat.heartT = 2.5; sat.steerT = 0;
    const sp = 40 + Math.random() * 30, an = Math.random() * Math.PI * 2;
    sat.vx = Math.cos(an) * sp; sat.vy = Math.sin(an) * sp;
    if (sat.sim) {
      const bd = bounds();
      sat.x = clamp(mx - sat.sw / 2, bd.x, Math.max(bd.x, bd.x + bd.w - sat.sw));
      sat.y = clamp(my - sat.sh / 2, bd.y, Math.max(bd.y, bd.y + bd.h - sat.sh));
    }
    setBanner(I18N.t("sat.love_spawn"), "");
  }
}

function updateLovers(dt) {
  for (const sat of SatManager.values()) {
    if (sat.role !== "lover" || sat.dead) continue;
    if (performance.now() - sat.born > 45000) { SatManager.kill(sat.id, "timeout"); continue; }
    const p = loverOf(sat);
    if (!p) { // mất đôi (bị phá/đóng) → cô đơn, tự rút
      sat.lonelyT = (sat.lonelyT === undefined ? 6 : sat.lonelyT) - dt;
      if (sat.lonelyT <= 0) {
        const q = loverAnchor(sat);
        addFloat(q.x, q.y - 24, I18N.t("sat.love_lonely"), "#ff8fab");
        SatManager.kill(sat.id, "timeout");
      }
      continue;
    }
    const sp = sat.heartbroken ? 150 : 75;
    if (sat.sim) {
      const ax = sat.x + sat.sw / 2, ay = sat.y + sat.sh / 2;
      const bx = p.x + p.sw / 2, by = p.y + p.sh / 2;
      const dx = bx - ax, dy = by - ay, d = hypot(dx, dy) || 1; // OPT: fast hypot (PR #19)
      sat.vx = dx / d * sp; sat.vy = dy / d * sp;
      bounceSimSat(sat, 1, dt);
      if (d < 85) mergeLovers(sat, p);
    } else if (sat.canMove && sat.win && !sat.win.closed) {
      // OPT: tính tâm 2 popup 1 lần/frame, tái dùng d cho cả steer + merge check
      const a = loverScreen(sat), bpos = loverScreen(p);
      const dx = bpos.x - a.x, dy = bpos.y - a.y, d = hypot(dx, dy) || 1;
      sat.steerT = (sat.steerT || 0) - dt;
      if (sat.steerT <= 0) {
        sat.steerT = 1.2;
        SatManager.steer(sat.id, dx / d * sp, dy / d * sp);
      }
      if (d < (sat.w + p.w) / 2 * 0.7) mergeLovers(sat, p);
    }
    // thất tình → đẻ chaser trả thù
    if (sat.heartbroken) {
      sat.spawnT -= dt;
      if (sat.spawnT <= 0 && sat.spawned < 4) {
        sat.spawnT = 4; sat.spawned++;
        const q = loverAnchor(sat);
        spawnEnemyAt("chaser", q.x + rand(-40, 40), q.y + rand(-40, 40));
        AudioEngine.sfx.shrink();
        addFloat(q.x, q.y - 20, I18N.t("sat.love_revenge"), "#ff5f8a");
      }
    }
  }
}

function updateSuperlove(dt) {
  for (const sat of SatManager.values()) {
    if (sat.role !== "superlove" || sat.dead) continue;
    if (performance.now() - sat.born > 60000) { SatManager.kill(sat.id, "timeout"); continue; }
    updateSayNangAura(sat); // CEO §9-Q2: aura I18N.t("sat.love_crush_status") — quái trong 200px tấn công lẫn nhau
    // trôi lững lờ
    if (sat.sim) bounceSimSat(sat, 1, dt);
    else if (sat.canMove && sat.win && !sat.win.closed) {
      sat.steerT -= dt;
      if (sat.steerT <= 0) {
        sat.steerT = 2.5;
        const a = Math.random() * Math.PI * 2, sp = 45;
        SatManager.steer(sat.id, Math.cos(a) * sp, Math.sin(a) * sp);
      }
    }
    // mỗi 5s bắn 1 trái tim độc vào tàu
    sat.heartT -= dt;
    if (sat.heartT <= 0) {
      sat.heartT = 5;
      const p = loverAnchor(sat), s = G.ship;
      const a = Math.atan2(s.y - p.y, s.x - p.x);
      G.ebullets.push({ x: p.x, y: p.y, vx: Math.cos(a) * 170, vy: Math.sin(a) * 170, r: 7, life: 4 });
      AudioEngine.sfx.shrink();
      addFloat(p.x, p.y - 30, "💘!", "#ff8fab");
    }
  }
}

/* CEO chốt §9-Q2 (2026-10-01): aura "say nắng" của siêu-popup M7 — mọi độ khó.
 * Quái trong bán kính 200px bị "say nắng" 6s (refresh khi còn trong aura):
 * thay vì đuổi tàu, chúng TẤN CÔNG LẪN NHAU. Kill do say nắng vẫn cộng điểm gốc
 * cho player (§6 "điểm gốc cố định") — đây là "chaos vui vẻ", không phải bug. */
function updateSayNangAura(sat) {
  const p = loverAnchor(sat), R = 200;
  for (const e of G.enemies) {
    if (e.dead) continue;
    const dx = e.x - p.x, dy = e.y - p.y;
    if (dx * dx + dy * dy < R * R) {
      if (!(e.sayNangT > 0)) {
        e.sayNangT = 6;
        addFloat(e.x, e.y - e.r - 12, I18N.t("sat.love_crush"), "#ff8fab");
        AudioEngine.sfx.pickup();
      } else e.sayNangT = 6; // còn trong aura → refresh 6s
    }
  }
}

/* quái "say nắng": đuổi quái gần nhất còn sống, chạm → cắn 1 dmg (không đuổi tàu nữa) */
function sayNangUpdate(e, dt, spd) {
  let tgt = null, best = Infinity;
  for (const o of G.enemies) {
    if (o === e || o.dead) continue;
    const d2v = dist2(e.x, e.y, o.x, o.y);
    if (d2v < best) { best = d2v; tgt = o; }
  }
  if (!tgt) return; // chỉ còn 1 mình → đứng yên, hết say nắng sẽ đuổi tàu lại
  const dx = tgt.x - e.x, dy = tgt.y - e.y, d = Math.hypot(dx, dy) || 1;
  e.x += dx / d * spd * dt; e.y += dy / d * spd * dt;
  if (d < e.r + tgt.r + 4) {
    damageEnemy(tgt, Math.max(1, e.dmg || 1), null);
    e.kbx -= dx / d * 80; e.kby -= dy / d * 80; // hất nhẹ ra để khỏi dính chùm cắn liên tục
  }
}

function maybeTriggerLove(n) {
  const act = actOf(n);
  if (act < 2 || n < 12 || G.loveWave === n) return;
  if (SatManager.count() > 0) return; // cần cả 3 slot trống
  G.loveWave = n;
  const pairId = "love" + Date.now().toString(36);
  const a = SatManager.request("lover", {
    hp: 5, color: "#ff5f8a", label: I18N.t("sat.love_pair_status"), w: 260, h: 180, onClose: onLoverClose,
  });
  const b = SatManager.request("lover", {
    hp: 5, color: "#c86bff", label: I18N.t("sat.love_pair_status"), w: 260, h: 180, onClose: onLoverClose,
  });
  if (a && b) {
    a.pairId = b.pairId = pairId;
    // đặt 2 khung giả ở 2 góc đối nhau để chúng phải "tìm nhau"
    if (a.sim && b.sim) {
      const bd = bounds();
      const corners = [
        { x: bd.x + 24, y: bd.y + 56 },
        { x: bd.x + bd.w - 24 - b.sw, y: bd.y + bd.h - 24 - b.sh },
      ];
      b.x = corners[1].x; b.y = corners[1].y;
    }
    setBanner(I18N.t("sat.love_pair"), "");
    AudioEngine.sfx.wave();
  } else {
    if (a) SatManager.kill(a.id, "timeout");
    if (b) SatManager.kill(b.id, "timeout");
    if (SAT_MODE === "off") { spawnEnemy("chaser"); spawnEnemy("chaser"); }
  }
}

/* ---------------- M10 — GƯƠNG THẦN LẦY LỘI (Silly Mirror) ----------------
 * Wave ≥ 10, mỗi wave 1 lần, tối đa 1 gương sống.
 * Gương (6 HP) chiếu "vùng gương" bán kính 85px: đạn player bay vào bị PHẢN CHIỀU
 * ngược lại thành đạn địch (1 dmg). Đừng bắn vào gương!
 * Phá gương → +2 gem +60. ĐÓNG TAY = gương vỡ: 4 mảnh vỡ bay vào tàu.
 * Fallback: khung giả — vùng gương vẽ quanh khung. */
function mirrorAnchor(sat) {
  if (sat.sim) return { x: sat.x + sat.sw / 2, y: sat.y + sat.sh / 2 };
  const p = nestSpawnPoint(sat);
  return { x: p.x, y: p.y };
}

function onMirrorClose(mode, sat) {
  const p = mirrorAnchor(sat);
  if (mode === "killed") {
    burst(p.x, p.y, 26, ["#a5f3fc", "#ffffff", "#f0abfc"], 320);
    for (let i = 0; i < 2; i++) {
      const a = Math.random() * Math.PI * 2;
      G.gems.push({ x: p.x, y: p.y, vx: Math.cos(a) * 130, vy: Math.sin(a) * 130, v: 1, t: rand(0, 9) });
    }
    G.score += 60; // §6/§2.10: phá gương = 60 cố định
    addFloat(p.x, p.y - 30, I18N.t("sat.mirror_killed"), "#a5f3fc", true);
    AudioEngine.sfx.pickup();
  } else if (mode === "manual") {
    // đóng tay: gương vỡ — 4 mảnh vỡ bay vào tàu
    burst(p.x, p.y, 30, ["#a5f3fc", "#ff5470", "#ffffff"], 360);
    const s = G.ship;
    const base = Math.atan2(s.y - p.y, s.x - p.x);
    for (let i = 0; i < 4; i++) {
      const a = base + (i - 1.5) * 0.3;
      G.ebullets.push({ x: p.x, y: p.y, vx: Math.cos(a) * 240, vy: Math.sin(a) * 240, r: 6, life: 3.5 });
    }
    jxShake(6, 300, 4);
    addFloat(p.x, p.y - 30, I18N.t("sat.mirror_broken"), "#ff5470", true);
    AudioEngine.sfx.bigboom();
  }
}

/* đạn player bay vào vùng gương → phản chiếu thành đạn địch; trả về true nếu đã phản */
function mirrorReflect(bl) {
  if (!SatManager.anyRole("mirror")) return false; // OPT: không gương sống → skip, tránh alloc SatManager.list() mỗi viên đạn
  for (const m of SatManager.values()) {
    if (m.role !== "mirror" || m.dead) continue;
    if (bl.mirrorId === m.id) continue; // mỗi gương chỉ phản 1 viên 1 lần
    // OPT: dùng anchor đã cache trong updateMirrors (1 lần/frame), fallback tính trực tiếp
    const ax = m._mx !== undefined ? m._mx : mirrorAnchor(m).x;
    const ay = m._my !== undefined ? m._my : mirrorAnchor(m).y;
    const R = 85;
    if (dist2(bl.x, bl.y, ax, ay) < R * R) {
      bl.mirrorId = m.id;
      G.ebullets.push({
        x: bl.x, y: bl.y, vx: -bl.vx, vy: -bl.vy,
        r: Math.max(4, bl.r || 4), life: 3,
      });
      burst(bl.x, bl.y, 10, ["#a5f3fc", "#ffffff", "#f0abfc"], 200);
      addFloat(bl.x, bl.y - 14, I18N.t("sat.mirror_reflect"), "#a5f3fc");
      AudioEngine.sfx.boing();
      return true;
    }
  }
  return false;
}

function updateMirrors(dt) {
  for (const sat of SatManager.values()) {
    if (sat.role !== "mirror" || sat.dead) continue;
    if (performance.now() - sat.born > 40000) { SatManager.kill(sat.id, "timeout"); continue; }
    const _ma = mirrorAnchor(sat); sat._mx = _ma.x; sat._my = _ma.y; // OPT: cache anchor 1 lần/frame cho mirrorReflect
    if (sat.sim) { // gương lững lờ trôi cho khó ngắm
      sat.steerT = (sat.steerT || 0);
      if (!sat.vx) { const a = Math.random() * Math.PI * 2; sat.vx = Math.cos(a) * 45; sat.vy = Math.sin(a) * 45; }
      bounceSimSat(sat, 1, dt);
    }
  }
}

function maybeTriggerMirror(n) {
  if (n < 10 || G.mirrorWave === n) return;
  if (SatManager.anyRole("mirror") || SatManager.count() >= 2) return;
  G.mirrorWave = n;
  const sat = SatManager.request("mirror", {
    hp: 6, color: "#67e8f9", label: I18N.t("sat.mirror_label"), w: 280, h: 200,
    onClose: onMirrorClose,
  });
  if (sat) {
    setBanner(I18N.t("sat.mirror_spawn"), "");
    AudioEngine.sfx.wave();
  } else if (SAT_MODE === "off") {
    spawnEnemy("dasher");
  }
}

/* ---------------- M9 — MÁY HÚT BỤI VŨ TRỤ (Cosmic Vacuum) ----------------
 * Act 3+, mỗi wave 1 lần, tối đa 1 máy sống.
 * Hố đen (8 HP) hút quái trong bán kính 240px; quái chạm tâm → bị NUỐT (mất, không điểm).
 * Mỗi 7s hoặc nuốt đủ 3 con → NHẢ ra: quái giận dữ (nhanh x1.6).
 * Phá máy → mỗi con đã nuốt thành 1 gem +150 điểm/con.
 * ĐÓNG TAY = nhả hết ngay + sóng xung kích hất tàu.
 * Fallback: khung giả vẽ hố đen + vòng xoáy hút. */
function vacAnchor(sat) {
  if (sat.sim) return { x: sat.x + sat.sw / 2, y: sat.y + sat.sh / 2 };
  const p = nestSpawnPoint(sat);
  return { x: p.x, y: p.y };
}

function spitVacuum(sat) {
  const p = vacAnchor(sat);
  const n = sat.swallowed ? sat.swallowed.length : 0;
  if (n > 0) {
    for (const type of sat.swallowed) {
      const e = spawnEnemyAt(type, p.x + rand(-50, 50), p.y + rand(-50, 50));
      if (e) e.speed *= 1.6; // nhả ra giận dữ
    }
    sat.swallowed = [];
    burst(p.x, p.y, 30, ["#7c3aed", "#c084fc", "#ffffff"], 380);
    addFloat(p.x, p.y - 30, I18N.t("sat.vacuum_release"), "#c084fc", true);
    AudioEngine.sfx.boom();
  }
  sat.spitT = 7;
}

function onVacuumClose(mode, sat) {
  const p = vacAnchor(sat);
  const swallowed = sat.swallowed || [];
  const n = swallowed.length;
  if (mode === "killed") {
    burst(p.x, p.y, 36, ["#7c3aed", "#ffd166", "#ffffff"], 400);
    jxShake(7, 320, 5);
    // §6/§3.4: quái bị nuốt "chết luôn" → điểm gốc từng con + gem như giết thường + 40 phá máy
    let pts = 40, gems = 0;
    for (const type of swallowed) {
      const def = MONSTER_REGISTRY[type];
      pts += def && def.score ? def.score : 10;
      const gn = type === "tank" ? 3 : 1, xv = def && def.xp ? def.xp : 1;
      for (let i = 0; i < gn; i++) {
        const a = Math.random() * Math.PI * 2;
        G.gems.push({ x: p.x, y: p.y, vx: Math.cos(a) * 140, vy: Math.sin(a) * 140, v: xv, t: rand(0, 9) });
      }
      gems += gn;
    }
    G.score += pts;
    if (n > 0) {
      addFloat(p.x, p.y - 34, I18N.t("sat.vacuum_killed", { gems, pts }), "#ffd166", true);
    } else {
      addFloat(p.x, p.y - 34, I18N.t("sat.vacuum_killed_simple"), "#c084fc", true);
    }
    AudioEngine.sfx.pickup();
  } else if (mode === "manual") {
    // đóng tay: ho ra tất cả + sóng xung kích
    spitVacuum(sat);
    knockShip(p.x, p.y, 520);
    jxShake(9, 380, 7); windowJitter(22);
    burst(p.x, p.y, 34, ["#7c3aed", "#ff5470", "#ffffff"], 420);
    addFloat(p.x, p.y - 30, I18N.t("sat.vacuum_manual"), "#ff5470", true);
    AudioEngine.sfx.bigboom();
  }
}

function updateBlackholes(dt) {
  for (const sat of SatManager.values()) {
    if (sat.role !== "blackhole" || sat.dead) continue;
    if (performance.now() - sat.born > 45000) { SatManager.kill(sat.id, "timeout"); continue; }
    sat.swallowed = sat.swallowed || [];
    const p = vacAnchor(sat), R = 240;
    // hút quái xung quanh (xoáy trôn ốc)
    // OPT: dist2 kiểm tra tầm trước — chỉ sqrt khi quái đã trong vùng hút
    const R2 = R * R;
    for (const e of G.enemies) {
      if (e.dead || e.type === "boss") continue;
      const dx = p.x - e.x, dy = p.y - e.y, d2 = dx * dx + dy * dy;
      if (d2 < R2) {
        const d = Math.sqrt(d2);
        if (d > 1) {
          const pull = (1 - d / R) * 640;
          const inv = 1 / d;
          e.x += dx * inv * pull * dt;
          e.y += dy * inv * pull * dt;
          // xoáy tiếp tuyến cho vui mắt
          e.x += -dy * inv * pull * 0.45 * dt;
          e.y += dx * inv * pull * 0.45 * dt;
          if (d < 26) {
            e.dead = true; // nuốt: mất luôn, không điểm/kill
            sat.swallowed.push(e.type);
            burst(p.x, p.y, 6, ["#7c3aed", "#ffffff"], 140);
            AudioEngine.sfx.slurp();
            wkBuzz([30, 25, 30]); // HAPTIC (feat/mobile-quality): bị hố đen hút
            addFloat(p.x + rand(-20, 20), p.y - 24, I18N.t("sat.vacuum_suck"), "#c084fc");
            if (sat.swallowed.length >= 3) spitVacuum(sat);
          }
        }
      }
    }
    // CEO chốt §9-Q4 (2026-10-01): hố đen tương tác gem theo độ khó —
    // CHỈ Khắc nghiệt mới nuốt gem mất luôn; Chill/Thường: gem tới tâm bị HẤT VĂNG ra ngoài
    const hardVac = (typeof DIFF_KEY !== "undefined" && (DIFF_KEY === "hardcore" || DIFF_KEY === "hard"));
    for (let i = G.gems.length - 1; i >= 0; i--) {
      const gm = G.gems[i];
      const gdx = p.x - gm.x, gdy = p.y - gm.y, gd = Math.hypot(gdx, gdy);
      if (gd < R && gd > 1) {
        const pull = (1 - gd / R) * 480;
        gm.x += gdx / gd * pull * dt; gm.y += gdy / gd * pull * dt;
        gm.x += -gdy / gd * pull * 0.45 * dt; gm.y += gdx / gd * pull * 0.45 * dt; // xoáy trôn ốc
        if (gd < 26) {
          AudioEngine.sfx.slurp();
          if (hardVac) { // Khắc nghiệt: nuốt mất luôn
            G.gems.splice(i, 1);
            burst(p.x, p.y, 6, ["#7c3aed", "#ffffff"], 140);
            addFloat(p.x + rand(-20, 20), p.y - 24, I18N.t("sat.vacuum_gem"), "#c084fc");
          } else { // Chill/Thường: hất văng ra ngoài, không mất vĩnh viễn
            const ga = Math.atan2(gm.y - p.y, gm.x - p.x) + rand(-0.4, 0.4);
            gm.x = p.x + Math.cos(ga) * 40; gm.y = p.y + Math.sin(ga) * 40;
            gm.vx = Math.cos(ga) * 420; gm.vy = Math.sin(ga) * 420;
            burst(gm.x, gm.y, 6, ["#7df9ff", "#ffffff"], 160);
          }
        }
      }
    }
    // nhả định kỳ mỗi 7s
    sat.spitT = (sat.spitT === undefined ? 7 : sat.spitT) - dt;
    if (sat.spitT <= 0) spitVacuum(sat);
    // khung giả lững lờ
    if (sat.sim) {
      if (!sat.vx) { const a = Math.random() * Math.PI * 2; sat.vx = Math.cos(a) * 35; sat.vy = Math.sin(a) * 35; }
      bounceSimSat(sat, 1, dt);
    }
  }
}

function maybeTriggerVacuum(n) {
  const act = actOf(n);
  if (act < 3 || G.vacWave === n) return;
  if (SatManager.anyRole("blackhole") || SatManager.count() >= 2) return;
  G.vacWave = n;
  const sat = SatManager.request("blackhole", {
    hp: 8, color: "#7c3aed", label: I18N.t("sat.vacuum_label"), w: 300, h: 220,
    onClose: onVacuumClose,
  });
  if (sat) {
    sat.swallowed = []; sat.spitT = 7;
    setBanner(I18N.t("sat.vacuum_spawn"), "");
    AudioEngine.sfx.wave();
  } else if (SAT_MODE === "off") {
    spawnEnemy("tank");
  }
}

/* vẽ vùng hiệu lực của popup THẬT (gương/hố đen nằm ngoài arena nên phải
 * chiếu vùng ảnh hưởng vào trong để player thấy) */
function drawSatFields() {
  const t = performance.now();
  for (const s of SatManager.values()) {
    if (s.dead || s.sim) continue;
    let a = null, R = 0, col = "#fff", label = "";
    if (s.role === "mirror") { a = mirrorAnchor(s); R = 85; col = "#67e8f9"; label = I18N.t("sat.mirror_zone"); }
    else if (s.role === "blackhole") { a = vacAnchor(s); R = 240; col = "#7c3aed"; label = I18N.t("sat.vacuum_zone"); }
    else continue;
    const pulse = 0.5 + 0.3 * Math.sin(t / 400);
    ctx.save();
    ctx.globalAlpha = 0.16 + pulse * 0.1;
    ctx.strokeStyle = col; ctx.lineWidth = 2.5;
    ctx.setLineDash([10, 8]); ctx.lineDashOffset = -t / 60;
    ctx.beginPath(); ctx.arc(a.x, a.y, R, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = col; ctx.font = "700 11px system-ui"; ctx.textAlign = "center";
    ctx.fillText(label, a.x, a.y - R - 8);
    ctx.restore();
  }
}

