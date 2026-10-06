/* =====================================================================
   DATA-DRIVEN GAMEPLAY (v2.0) — spec chi tiết: studio/game-design/GAME-DESIGN-DOC.md
   - MONSTER_REGISTRY: mọi loại quái. Thêm quái mới = thêm 1 entry, không sửa loop.
   - BEHAVIORS: strategy di chuyển/tấn công, tra cứu qua e.behavior.
   - ACTS: 3 Act (stage) — palette, nhạc, pool quái, boss variant riêng.
   - PICKUP_DEFS: vật phẩm rơi, chia tỉ lệ theo trọng số w.
   ===================================================================== */
const MONSTER_REGISTRY = {
  "chaser": { id: "chaser", name: I18N.t("monster.chaser.name"), behavior: "chase", color: "#ff5470",
    r: 12, dmg: 1, score: 10, xp: 1, minWave: 1, weight: 100, acts: [1, 2, 3],
    hp: w => 2 + w * 0.5, spd: w => 95 + w * 7, desc: I18N.t("monster.chaser.desc") },
  "chewer": { id: "chewer", name: I18N.t("monster.chewer.name"), behavior: "chew", color: "#c084fc",
    r: 13, dmg: 1, score: 25, xp: 2, minWave: 2, weight: 70, acts: [1, 2, 3],
    hp: w => 3 + w * 0.4, spd: w => 78 + w * 4,
    init: e => { e.latched = null; e.chewT = 0; }, desc: I18N.t("monster.chewer.desc") },
  "tank": { id: "tank", name: I18N.t("monster.tank.name"), behavior: "chase", color: "#ffb020",
    r: 23, dmg: 1, score: 50, xp: 4, minWave: 3, weight: 40, acts: [1, 2, 3],
    hp: w => 12 + w * 2.2, spd: () => 46, desc: I18N.t("monster.tank.desc") },
  "dasher": { id: "dasher", name: I18N.t("monster.dasher.name"), behavior: "dash", color: "#ffe14d",
    r: 11, dmg: 1, score: 20, xp: 2, minWave: 3, weight: 45, acts: [1, 2, 3],
    hp: w => 4 + w * 0.5, spd: w => 120 + w * 5,
    init: e => { e.state = "stalk"; e.stateT = 0; e.dx = 0; e.dy = 0; },
    desc: I18N.t("monster.dasher.desc") },
  "splitter": { id: "splitter", name: I18N.t("monster.splitter.name"), behavior: "chase", color: "#7df9ff",
    r: 18, dmg: 1, score: 35, xp: 3, minWave: 4, weight: 30, acts: [1, 2, 3],
    hp: w => 7 + w, spd: w => 70 + w * 4,
    onDeath: e => { for (let i = 0; i < 2; i++) spawnEnemyAt("mini", e.x + rand(-14, 14), e.y + rand(-14, 14)); },
    desc: I18N.t("monster.splitter.desc") },
  "mini": { id: "mini", name: I18N.t("monster.mini.name"), behavior: "chase", color: "#ff9df3",
    r: 8, dmg: 1, score: 8, xp: 1, minWave: 0, weight: 0, acts: [1, 2, 3],
    hp: () => 1.5, spd: () => 150, desc: I18N.t("monster.mini.desc") },
  "weaver": { id: "weaver", name: I18N.t("monster.weaver.name"), behavior: "weave", color: "#4dd8a7",
    r: 11, dmg: 1, score: 22, xp: 2, minWave: 6, weight: 40, acts: [1, 2, 3],
    hp: w => 5 + w * 0.6, spd: w => 110 + w * 6, desc: I18N.t("monster.weaver.desc") },
  "spitter": { id: "spitter", name: I18N.t("monster.spitter.name"), behavior: "spit", color: "#b26bff",
    r: 12, dmg: 1, score: 30, xp: 3, minWave: 8, weight: 30, acts: [2, 3],
    hp: w => 6 + w * 0.7, spd: w => 85 + w * 4,
    init: e => { e.shotT = rand(1, 2); }, desc: I18N.t("monster.spitter.desc") },
  "healer": { id: "healer", name: I18N.t("monster.healer.name"), behavior: "heal", color: "#7dff9a",
    r: 12, dmg: 0, score: 28, xp: 3, minWave: 11, weight: 22, acts: [2, 3],
    hp: w => 8 + w * 0.8, spd: w => 90 + w * 4,
    init: e => { e.healT = 0; e.healTarget = null; }, desc: I18N.t("monster.healer.desc") },
  "kamikaze": { id: "kamikaze", name: I18N.t("monster.kamikaze.name"), behavior: "kamikaze", color: "#ff7a1a",
    r: 10, dmg: 1, score: 18, xp: 2, minWave: 13, weight: 30, acts: [2, 3],
    hp: w => 3 + w * 0.4, spd: w => 150 + w * 8,
    init: e => { e.fuse = -1; }, desc: I18N.t("monster.kamikaze.desc") },
  /* SEASON 1 "MÙA DEADLINE" — 3 quái mới. Endless: spawn tự động qua buildSpawnQueue (minWave 6+, weight ~10% tổng). */
  "deadline": { id: "deadline", name: I18N.t("monster.deadline.name"), behavior: "countdownBell", color: "#ffe14d",
    r: 13, dmg: 0, score: 30, xp: 3, minWave: 6, weight: 15, acts: [1, 2, 3],
    hp: w => 5 + w * 0.6, spd: () => 85,
    init: e => { e.countdown = 12; e.tickLast = 12; },
    desc: I18N.t("monster.deadline.desc") },
  "otworker": { id: "otworker", name: I18N.t("monster.otworker.name"), behavior: "rageChase", color: "#ff5252",
    r: 12, dmg: 1, score: 25, xp: 2, minWave: 6, weight: 15, acts: [1, 2, 3],
    hp: w => 4 + w * 0.5, spd: w => 100 + w * 5,
    init: e => { e.rage = 0; e.rageT = 0; },
    desc: I18N.t("monster.otworker.desc") },
  "meeting": { id: "meeting", name: I18N.t("monster.meeting.name"), behavior: "meetingAura", color: "#7dff9a",
    r: 14, dmg: 0, score: 35, xp: 4, minWave: 6, weight: 10, acts: [1, 2, 3],
    hp: w => 8 + w * 0.9, spd: () => 45,
    init: e => { e.summonT = 12; e.warnT = 0; },
    desc: I18N.t("monster.meeting.desc") },
  /* VARIETY PACK 1 (2026-10-03): Shipper Gem — bonus rượt đuổi, dmg 0, không áp lực.
   * CEO 2026-10-04: wave 10 là boss-only → minWave 11, debut scripted ở wave 11 (vp1SpawnShipper). */
  "shipper": { id: "shipper", name: I18N.t("monster.shipper.name"), behavior: "courier", color: "#2dd4bf",
    r: 14, dmg: 0, score: 40, xp: 2, minWave: 11, weight: 25, acts: [1, 2, 3],
    hp: w => 8 + w * 0.9, spd: w => 165,
    init: e => { e.stam = 0; e.state = "cruise"; e.tauntT = 2; },
    onDeath: e => { for (let i = 0; i < 14; i++) { const a = Math.random() * Math.PI * 2;
      G.gems.push({ x: e.x, y: e.y, vx: Math.cos(a) * 130, vy: Math.sin(a) * 130, v: 1, t: rand(0, 9) }); } },
    desc: I18N.t("monster.shipper.desc") },
  /* VARIETY PACK 1: Đạo Diễn Sóng — spawn scripted (weight 0), roll modifier vui. */
  "director": { id: "director", name: I18N.t("monster.director.name"), behavior: "director", color: "#f472b6",
    r: 16, dmg: 0, score: 100, xp: 5, minWave: 12, weight: 0, acts: [1, 2, 3],
    hp: w => 12 + w * 1.0, spd: () => 55,
    init: e => { e.rolled = false; },
    onDeath: e => { addFloat(e.x, e.y - 30, I18N.t("vp1.director.cut"), "#f472b6", true); },
    desc: I18N.t("monster.director.desc") },
};const BEHAVIORS = {
  chase: { update(e, dt, s, spd) { // tìm tàu + lượn sóng nhẹ
    const dx = s.x - e.x, dy = s.y - e.y, d = hypot(dx, dy) || 1;
    const wob = Math.sin(e.t * 6) * 12;
    e.x += (dx / d * spd + -dy / d * wob) * dt;
    e.y += (dy / d * spd + dx / d * wob) * dt;
  } },
  weave: { update(e, dt, s, spd) { // zigzag biên độ lớn, khó đoán
    const dx = s.x - e.x, dy = s.y - e.y, d = hypot(dx, dy) || 1;
    const wob = Math.sin(e.t * 7) * 110;
    e.x += (dx / d * spd + -dy / d * wob) * dt;
    e.y += (dy / d * spd + dx / d * wob) * dt;
  } },
  chew: { update(e, dt, s, spd) { // bám viền -> gặm cửa sổ (chiêu signature)
    if (!e.latched) {
      const sh = typeof shieldTarget === "function" ? shieldTarget() : null; // M3: chewer trong 300px ưu tiên bám khiên
      let p = nearestEdgePoint(e.x, e.y), useShield = false;
      if (sh) {
        const ds = hypot(sh.x - e.x, sh.y - e.y);
        if (ds < 300) { useShield = true; p = { x: sh.x, y: sh.y, edge: sh.edge }; }
      }
      const d = hypot(p.x - e.x, p.y - e.y);
      if (d < 16) {
        e.latched = p.edge; e.onShield = useShield; e.x = p.x; e.y = p.y;
        addFloat(e.x, e.y - 24, useShield ? I18N.t("hud.chew_shield") : I18N.t("hud.chew_window"), useShield ? "#38bdf8" : "#c084fc");
        AudioEngine.sfx.shrink();
      } else { e.x += (p.x - e.x) / d * spd * dt; e.y += (p.y - e.y) / d * spd * dt; }
    } else {
      e.chewT += dt;
      if (e.chewT >= DIFF.chew) {
        e.chewT = 0;
        if (e.onShield && typeof damageShield === "function") damageShield(e); // gặm khiên thay vì gặm cửa sổ
        else {
          const dd = { left: [14, 0], right: [14, 0], top: [0, 14], bottom: [0, 14] }[e.latched];
          shrinkWindow(dd[0], dd[1]);
          AudioEngine.sfx.shrink(); jxShake(2, 150, 3); // WOW tier: chewer cắn
          burst(e.x, e.y, 8, ["#c084fc", "#7c3aed"], 160);
        }
      }
      if (e.onShield) { // bám theo khiên (drone di chuyển)
        const sh2 = typeof shieldTarget === "function" ? shieldTarget() : null;
        if (sh2) { e.x = sh2.x; e.y = sh2.y; } else { e.onShield = false; e.latched = null; }
      } else {
        const q = nearestEdgePoint(e.x, e.y); e.x = q.x; e.y = q.y;
      }
    }
  } },
  dash: { update(e, dt, s, spd) { // stalk -> aim (telegraph) -> dash
    e.stateT -= dt;
    if (e.state === "stalk") {
      const dx = s.x - e.x, dy = s.y - e.y, d = hypot(dx, dy) || 1;
      e.x += dx / d * spd * dt; e.y += dy / d * spd * dt;
      if (d < 260 && e.stateT <= 0) { e.state = "aim"; e.stateT = 0.7; }
    } else if (e.state === "aim") {
      const dx = s.x - e.x, dy = s.y - e.y, d = hypot(dx, dy) || 1;
      e.dx = dx / d; e.dy = dy / d;
      if (e.stateT <= 0) { e.state = "dash"; e.stateT = 0.45; AudioEngine.sfx.shoot(); }
    } else {
      e.x += e.dx * spd * 4.2 * dt; e.y += e.dy * spd * 4.2 * dt;
      if (e.stateT <= 0) { e.state = "stalk"; e.stateT = 1.2; }
    }
  } },
  spit: { update(e, dt, s, spd) { // giữ cự ly, strafe, bắn đạn tầm xa
    const dx = s.x - e.x, dy = s.y - e.y, d = hypot(dx, dy) || 1;
    const want = 320, dir = d > want + 40 ? 1 : d < want - 40 ? -1 : 0;
    const strafe = Math.sin(e.t * 2.1 + e.x * 0.01) > 0 ? 1 : -1;
    e.x += (dx / d * dir * spd + -dy / d * strafe * spd * 0.6) * dt;
    e.y += (dy / d * dir * spd + dx / d * strafe * spd * 0.6) * dt;
    e.shotT -= dt;
    if (e.shotT <= 0 && d < 560) {
      e.shotT = 2.4;
      const a = Math.atan2(dy, dx);
      G.ebullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * 230, vy: Math.sin(a) * 230, r: 5, life: 5 });
      burst(e.x, e.y, 6, ["#b26bff", "#fff"], 140);
      AudioEngine.sfx.shoot();
    }
  } },
  heal: { update(e, dt, s, spd) { // tìm quái mất máu gần nhất để hồi
    let tgt = null, bd = Infinity;
    for (const o of G.enemies) {
      if (o === e || o.dead || o.type === "healer") continue;
      if (o.hp < o.maxHp) { const d2 = dist2(e.x, e.y, o.x, o.y); if (d2 < bd) { bd = d2; tgt = o; } }
    }
    e.healTarget = tgt;
    if (tgt) {
      const dx = tgt.x - e.x, dy = tgt.y - e.y, d = hypot(dx, dy) || 1;
      if (d > 90) { e.x += dx / d * spd * dt; e.y += dy / d * spd * dt; }
      else {
        e.healT += dt;
        if (e.healT >= 0.5) {
          e.healT = 0;
          tgt.hp = Math.min(tgt.maxHp, tgt.hp + tgt.maxHp * 0.08);
          burst(tgt.x, tgt.y, 6, ["#7dff9a", "#fff"], 120);
        }
      }
    } else { // không ai cần hồi -> giữ khoảng cách với tàu
      const dx = e.x - s.x, dy = e.y - s.y, d = hypot(dx, dy) || 1;
      if (d < 200) { e.x += dx / d * spd * dt; e.y += dy / d * spd * dt; }
    }
  } },
  kamikaze: { update(e, dt, s, spd) { // lao vào viền gần nhất rồi tự nổ
    if (e.fuse >= 0) {
      e.fuse -= dt;
      if (Math.random() < 0.5) burst(e.x + rand(-8, 8), e.y + rand(-8, 8), 2, ["#ff7a1a", "#fff"], 120);
      if (e.fuse <= 0) detonateKamikaze(e);
      return;
    }
    const p = nearestEdgePoint(e.x, e.y);
    const dx = p.x - e.x, dy = p.y - e.y, d = hypot(dx, dy) || 1;
        if (d < 46) {
      e.fuse = 0.8;
      AudioEngine.sfx.shrink();
      addFloat(e.x, e.y - 20, I18N.t("combat.kamikaze_warn"), "#ff7a1a");
    } else { e.x += dx / d * spd * dt; e.y += dy / d * spd * dt; }
  } },
  /* SEASON 1 — 3 behavior mới */
  countdownBell: { update(e, dt, s, spd) {
    const dx = s.x - e.x, dy = s.y - e.y, d = hypot(dx, dy) || 1;
    const wob = Math.sin(e.t * 5) * 60;
    e.x += (dx / d * spd * 0.7 + -dy / d * wob) * dt;
    e.y += (dy / d * spd * 0.7 + dx / d * wob) * dt;
    if (e.slowT <= 0) e.countdown -= dt;
    const secs = Math.max(0, Math.ceil(e.countdown));
    if (secs !== e.tickLast) { e.tickLast = secs; AudioEngine.sfx.click(); }
    if (e.countdown <= 0 && !e.dead) {
      G.globalHaste = 1.35; G.hasteT = 10;
      try { AudioEngine.sfx.bellRing(); } catch (err) { try { AudioEngine.sfx.boom(); } catch (e2) {} }
      burst(e.x, e.y, 24, ["#ffe14d", "#ffffff", "#ffb020"], 320);
      addFloat(e.x, e.y - 30, I18N.t("season.bell_ring"), "#ffe14d", true);
      jxShake(4, 200, 3);
      e.dead = true;
    }
  } },
  rageChase: { update(e, dt, s, spd) {
    e.rageT += dt;
    if (e.rageT >= 10 && e.rage < 5) {
      e.rageT = 0; e.rage++;
      addFloat(e.x, e.y - 24, I18N.t("season.rage_up"), "#ff5252");
      try { AudioEngine.sfx.angryStack(); } catch (err) { try { AudioEngine.sfx.hit(); } catch (e2) {} }
    }
    const rageSpd = spd * (1 + 0.15 * e.rage);
    e.dmg = 1 + Math.floor(e.rage / 2);
    const dx = s.x - e.x, dy = s.y - e.y, d = hypot(dx, dy) || 1;
    const wob = Math.sin(e.t * 6) * 12;
    e.x += (dx / d * rageSpd + -dy / d * wob) * dt;
    e.y += (dy / d * rageSpd + dx / d * wob) * dt;
  } },
  meetingAura: { update(e, dt, s, spd) {
    const dx = s.x - e.x, dy = s.y - e.y, d = hypot(dx, dy) || 1;
    e.x += dx / d * spd * 0.3 * dt; e.y += dy / d * spd * 0.3 * dt;
    let z = null;
    for (const zz of G.slowZones) if (zz.from === e) { z = zz; break; }
    if (!z) { z = { x: e.x, y: e.y, r: 160, slow: 0.35, ttl: 9999, from: e }; G.slowZones.push(z); }
    z.x = e.x; z.y = e.y;
    e.summonT -= dt;
    if (e.summonT <= 0.6 && e.warnT <= 0) e.warnT = 0.6;
    if (e.warnT > 0) e.warnT -= dt;
    if (e.summonT <= 0) {
      e.summonT = 12;
      for (const o of G.enemies) {
        if (o === e || o.dead) continue;
        const ox = e.x - o.x, oy = e.y - o.y, od = hypot(ox, oy) || 1;
        if (od < 420) { o.kbx += ox / od * 260; o.kby += oy / od * 260; }
      }
      burst(e.x, e.y, 20, ["#7dff9a", "#ffffff"], 240);
      addFloat(e.x, e.y - 30, I18N.t("season.summon"), "#7dff9a", true);
      try { AudioEngine.sfx.summonPulse(); } catch (err) { try { AudioEngine.sfx.wave(); } catch (e2) {} }
    }
  } },
  /* VARIETY PACK 1: Shipper Gem — chạy TRÁNH tàu (flee) + zigzag + chu kỳ stamina.
   * sprint 3s (205, vệt teal) → tired 2.5s (90) → cruise 1.5s (165). dmg 0. */
  courier: { update(e, dt, s, spd) {
    const dx = e.x - s.x, dy = e.y - s.y, d = hypot(dx, dy) || 1;
    e.stam = (e.stam || 0) + dt;
    const cyc = e.stam % 7;
    let cur;
    if (cyc < 3) { cur = 205; e.state = "sprint"; }
    else if (cyc < 5.5) { cur = 90; e.state = "tired"; }
    else { cur = 165; e.state = "cruise"; }
    // đạn băng kéo dài phase tired thêm (stack đơn giản: trừ stam)
    if (e.slowT > 0 && e.state === "tired") e.stam -= dt * 0.6;
    let mx = dx / d, my = dy / d;
    // tránh viền: cách viền < 60px → bẻ hướng vào trong
    try {
      const b = bounds();
      if (e.x - b.x < 60) mx = Math.abs(mx) * 0.7 + 0.7;
      if (b.x + b.w - e.x < 60) mx = -Math.abs(mx) * 0.7 - 0.7;
      if (e.y - b.y < 60) my = Math.abs(my) * 0.7 + 0.7;
      if (b.y + b.h - e.y < 60) my = -Math.abs(my) * 0.7 - 0.7;
      const ml = hypot(mx, my) || 1; mx /= ml; my /= ml;
    } catch (er) {}
    const wob = Math.sin(e.t * 5) * 60; // zigzag vuông góc
    e.x += (mx * cur + -my * wob) * dt;
    e.y += (my * cur + mx * wob) * dt;
    if (e.state === "sprint") burst(e.x, e.y, 1, ["#2dd4bf"], 60);
    // lêu lêu mỗi 4s
    e.tauntT = (e.tauntT == null ? 2 : e.tauntT) - dt;
    if (e.tauntT <= 0) {
      e.tauntT = 4;
      const taunts = ["lêu lêu~", "bắt được tui hông?", "giao hàng thần tốc!"];
      addFloat(e.x, e.y - 24, taunts[(Math.random() * taunts.length) | 0], "#2dd4bf", false);
    }
  } },
  /* VARIETY PACK 1: Đạo Diễn Sóng — lững thững, roll modifier lúc spawn. */
  director: { update(e, dt, s, spd) {
    if (!e.rolled) { e.rolled = true; vp1RollModifier(e); }
    const dx = s.x - e.x, dy = s.y - e.y, d = hypot(dx, dy) || 1;
    e.x += dx / d * spd * dt; e.y += dy / d * spd * dt;
  } },
};
const ACTS = [
  { id: 1, name: "NEON GRID", waves: [1, 10], hpMul: 1.0, spMul: 1.0, bgStage: 1,
    palette: { bg0: "#0b1e3a", bg1: "#04080f", grid: "#ffffff08", edge: "rgba(255,110,196,0.28)" },
    music: "act1", sub: I18N.t("banner.act_sub_1"),
    boss: { name: "GÃ GẶM KHỔNG LỒ", color: "#8b2fc9", hpMul: 1.0, shot: "ring", slam: 26, adds: ["chewer", "chewer"] } },
  { id: 2, name: "DEEP VOID", waves: [11, 20], hpMul: 1.35, spMul: 1.08, bgStage: 3,
    palette: { bg0: "#160b33", bg1: "#05030d", grid: "#b26bff10", edge: "rgba(178,107,255,0.35)" },
    music: "act2", sub: I18N.t("banner.act_sub_2"),
    boss: { name: "VOID REAPER", color: "#5b21b6", hpMul: 1.6, shot: "aimed", slam: 32, adds: ["dasher"] } },
  { id: 3, name: "CORE BREACH", waves: [21, Infinity], hpMul: 1.8, spMul: 1.15, bgStage: 2,
    palette: { bg0: "#331016", bg1: "#0d0505", grid: "#ff547010", edge: "rgba(255,84,112,0.40)" },
    music: "act3", sub: I18N.t("banner.act_sub_3"),
    boss: { name: "CORE TYRANT", color: "#b91c1c", hpMul: 2.3, shot: "spiral", slam: 38, adds: ["chewer", "dasher"] } },
];
function actOf(w) { return w <= 10 ? 1 : w <= 20 ? 2 : 3; }
/* =====================================================================
   BOSS PERSONALITY (feat/boss-personality, 2026-10-04) — 6 boss cá tính
   cho wave 5/10/15/20/25/30 (wave >30 endless: trùm cuối quay lại).
   TRIẾT LÝ "VUI VẺ > KHÓ KHĂN": telegraph/flair CHỈ là visual + hài,
   TUYỆT ĐỐI KHÔNG đổi HP/sát thương/tốc độ.
   -> hpMul/shot/slam/adds PHẢI KHỚP baseline Act hiện tại, khóa bằng
      tests/boss-personality.test.js (ai vô tình buff sẽ fail CI):
      wave 5,10  = act1: hpMul 1.0, shot "ring",   slam 26, adds [chewer, chewer]
      wave 15,20 = act2: hpMul 1.6, shot "aimed",  slam 32, adds [dasher]
      wave 25,30 = act3: hpMul 2.3, shot "spiral", slam 38, adds [chewer, dasher]
   ===================================================================== */
var BOSS_PERSONAS = [
  { wave: 5, id: "gnome", nameKey: "boss.w5.name", teleKey: "boss.w5.tele",
    color: "#8b2fc9", hpMul: 1.0, shot: "ring", slam: 26, adds: ["chewer", "chewer"],
    flair: "chomp", telegraph: "hunger" },
  { wave: 10, id: "deadline", nameKey: "boss.w10.name", teleKey: "boss.w10.tele",
    color: "#8b2fc9", hpMul: 1.0, shot: "ring", slam: 26, adds: ["chewer", "chewer"],
    flair: "papers", telegraph: "papers" },
  { wave: 15, id: "dj", nameKey: "boss.w15.name", teleKey: "boss.w15.tele",
    color: "#5b21b6", hpMul: 1.6, shot: "aimed", slam: 32, adds: ["dasher"],
    flair: "beat", telegraph: "disco" },
  { wave: 20, id: "sniffly", nameKey: "boss.w20.name", teleKey: "boss.w20.tele",
    color: "#5b21b6", hpMul: 1.6, shot: "aimed", slam: 32, adds: ["dasher"],
    flair: "sneeze", telegraph: "sneeze" },
  { wave: 25, id: "corechill", nameKey: "boss.w25.name", teleKey: "boss.w25.tele",
    color: "#b91c1c", hpMul: 2.3, shot: "spiral", slam: 38, adds: ["chewer", "dasher"],
    flair: "coffee", telegraph: "teabreak" },
  { wave: 30, id: "teaser", nameKey: "boss.w30.name", teleKey: "boss.w30.tele",
    color: "#b91c1c", hpMul: 2.3, shot: "spiral", slam: 38, adds: ["chewer", "dasher"],
    flair: "taunt", telegraph: "confetti" },
];
/* Wave nào → persona nào. */
function bossPersonaOf(w) {
  for (let i = BOSS_PERSONAS.length - 1; i >= 0; i--)
    if (w >= BOSS_PERSONAS[i].wave) return BOSS_PERSONAS[i];
  return BOSS_PERSONAS[0];
}
/* Item 1 (stage BG wiring): ở campaign mode (V2.stageId 1-5) dùng stageId làm
   sid cho BG.build để mỗi ải hiện đúng palette (BG PALETTES keyed 1-5);
   trước đây chỉ đọc ACTS/G.act (ở campaign luôn = 1 vì wave trong ải chỉ
   1-10) nên ải 2-5 không bao giờ hiện đúng palette. Endless (stageId = 0)
   giữ nguyên behavior ACTS cũ; sid invalid → fallback 1. */
function bgStageSid() {
  try {
    const st = window.V2 && V2.stageId;
    if (Number.isInteger(st) && st >= 1 && st <= 5) return st;
  } catch (e) {}
  return (ACTS[(G.act || 1) - 1] || {}).bgStage || 1;
}
/* Rebuild background khi đổi ải / resize (được gọi sau khi G đã khởi tạo). */
function refreshBG() {
  if (typeof BG === "undefined") return;
  BG.build(bgStageSid(), window.innerWidth, window.innerHeight); // MOBILE 2026-10-03: CSS px
}
let curTrack = "act1";
function playActMusic() {
  curTrack = ACTS[(G.act || 1) - 1].music;
  AudioEngine.startMusic(curTrack);
}

const PICKUP_DEFS = {
  "heart":     { w: 50, can: s => s.hp < s.maxHp,
                 use: s => { s.hp = Math.min(s.maxHp, s.hp + 1); addFloat(s.x, s.y - 30, "+1 ❤️", "#7dffa8", true); } },
  "shield":    { w: 35, use: s => { s.shieldT = 6; addFloat(s.x, s.y - 30, I18N.t("pickup.shield_6s"), "#9df3ff", true); } },
  "nuke":      { w: 15, use: () => nukeBlast() },
  "magnet":    { w: 22, use: s => { s.magnetT = 8; addFloat(s.x, s.y - 30, I18N.t("pickup.magnet_8s"), "#7df9ff", true); } },
  "overdrive": { w: 18, use: s => { s.overdriveT = 8; addFloat(s.x, s.y - 30, "OVERDRIVE 8s!", "#ffe14d", true); } },
  "shieldwin": { w: 18, can: () => G.wave >= 4, use: () => requestShield() }, // M3: cửa sổ khiên
  // STAGE-OBJ ải 5: patch xanh nới vùng an toàn (GAME-DESIGN-DOC §4). w: 0 + can: false →
  // KHÔNG vào bảng rớt random chung; chỉ spawn qua roll riêng trong killEnemy khi ải 5.
  "patch":     { w: 0, can: () => false,
                 use: () => { try { if (window.StageFX) StageFX.growPatch(G); } catch (e) {} } },
};

