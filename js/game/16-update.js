/* ---------------- update ---------------- */
function killEnemy(e) {
  if (e.dead) return;
  e.dead = true; G.kills++;
  G.waveKills = (G.waveKills || 0) + 1;
  G.combo++; G.comboT = 2.5;
  const def = MONSTER_REGISTRY[e.type];
  const base = def ? def.score : 10;
  const pts = base; // §6 "điểm gốc cố định": mỗi kill = đúng điểm gốc, không cộng/không nhân
  G.score += pts;
  // v2.0: juice2 + meta + tutorial hook
  if (window.V2) { try { V2.onKill(e); } catch (er) {} }
  // WOW: death anim + burst + hit-stop theo loại (tank/splitter/elite)
  if (window.Juice) {
    try {
      Juice.onKill(e.type, e.r >= 23);
      Juice.deathAnim(e.type, e, null);
      Juice.burst(e.type, e.x, e.y);
      G.dying.push(e); // giữ lại để vẽ death-anim (~150ms)
    } catch (err) {}
  }
  if (e.type === "tank") jxShake(6, 300, 4); else jxShake(3, 160, 2);
  // WOW: sfx.death theo loại quái (fallback boom cũ)
  try { AudioEngine.sfx.death(e.type); } catch (err) { try { AudioEngine.sfx.boom(); } catch (e2) {} }
  burst(e.x, e.y, e.type === "tank" ? 26 : 14, [e.color, "#ffffff", "#ffd166"], 300);
  // WOW: damage number thay float +pts cũ (fallback khi không có Juice)
  if (window.Juice) { try { Juice.damageNumber(e.x, e.y - 16, pts, "normal", null); } catch (err) {} }
  else addFloat(e.x, e.y - 16, `+${pts}`, "#fde68a");
  // WOW: combo qua Cinema (milestone x10/x25/x50/x100 nội bộ); fallback float cũ
  if (window.Cinema) { try { Cinema.combo(G.combo); } catch (err) {} }
  else if (G.combo >= 5 && G.combo % 5 === 0) addFloat(e.x, e.y - 40, `🔥 COMBO x${G.combo}!`, "#f9a8d4", true);
  if (def && def.onDeath) def.onDeath(e); // vd splitter đẻ mini
  lsOnKill(e); // "Cửa Sổ Cuối Cùng": mỗi kill vá ngay +8px cửa sổ
  // VP1 fireworks: kill nổ pháo hoa lớn nhiều màu
  if (G.vp1_fireworks) burst(e.x, e.y, 40, ["#ff5470", "#ffd166", "#7df9ff", "#c084fc", "#ffffff"], 420);
  // Endless Delight confetti: kill nổ giấy màu ăn mừng (trang trí, không đổi dmg)
  if (G.vp1_confetti) burst(e.x, e.y, 22, ["#ff5470", "#ffd166", "#7df9ff", "#c084fc", "#a7f3d0", "#ffffff"], 380);
  // Endless Delight giggle: 25% kill kêu "boing" cartoon vui tai
  if (G.vp1_giggle && Math.random() < 0.25) { try { AudioEngine.sfx.boing(); } catch (e2) {} }
  const n = ((e.type === "tank" ? 3 : 1) + (e.vp1_elite ? 2 : 0)) * (G.vp1_gemMul || 1);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    // VP1 golden: gem ×2 giá trị; VP1 breather: gem ×1.5 giá trị
    const vp1GemValMul = (G.vp1_golden ? 2 : 1) * (G.vp1_breather ? 1.5 : 1);
    G.gems.push({ x: e.x, y: e.y, vx: Math.cos(a) * 130, vy: Math.sin(a) * 130, v: e.xp * vp1GemValMul, t: rand(0, 9) });
  }
  // VP1 glowparty: mỗi kill +1 gem
  if (G.vp1_glowParty) G.gems.push({ x: e.x, y: e.y - 10, vx: 0, vy: -60, v: 1, t: 0 });
  // STAGE-OBJ: objective phụ theo ải — dark-kill (ải 4) / drift-kill (ải 3)
  try { if (window.StageObj) StageObj.onKill(e); } catch (er) {}
  // STAGE-MECH: twist thưởng theo ải — drift-kill ×2 (ải 3), dark-kill ×2 (ải 4)
  try { if (window.StageMech) StageMech.onKill(e); } catch (er2) {}
  // STAGE-OBJ ải 5 (theo GAME-DESIGN-DOC §4 — mechanic còn thiếu): quái rớt patch
  // xanh nới vùng an toàn. Roll riêng 12%, KHÔNG vào bảng random chung (không tăng khó,
  // chỉ thêm pickup có lợi + mục tiêu cho objective "Kỹ Sư Bản Vá").
  try {
    if (window.V2 && V2.stageId === 5 && window.StageFX && StageFX.activeId === "shrink" && Math.random() < 0.12)
      G.pickups.push({ kind: "patch", x: e.x, y: e.y, t: 0 });
  } catch (er) {}
  // rớt vật phẩm: 10% tổng, chia theo trọng số PICKUP_DEFS
  // REBALANCE v2.0: chill tăng tỉ lệ rớt heart/shield ~+50% (pickupBoost × trọng số + dropRateMul × tỉ lệ chung)
  const boost = DIFF.pickupBoost || 1;
  const dropRate = 0.10 * (DIFF.dropRateMul || 1) * (G.vp1_pickupMul || 1); // VP1 payday
  const wOf = k => ((k === "heart" || k === "shield") ? PICKUP_DEFS[k].w * boost : PICKUP_DEFS[k].w);
  const pdefs = Object.entries(PICKUP_DEFS).filter(([, d]) => !d.can || d.can(G.ship));
  const ptot = pdefs.reduce((a, [k]) => a + wOf(k), 0);
  const roll = Math.random() / G.ship.dropMul;
  if (roll < dropRate && ptot > 0) {
    let r = roll / dropRate * ptot, kind = pdefs[0][0];
    for (const [k] of pdefs) { r -= wOf(k); if (r <= 0) { kind = k; break; } }
    G.pickups.push({ kind, x: e.x, y: e.y, t: 0 });
  }
}
function nukeBlast() {
  AudioEngine.sfx.nuke();
  jxShake(12, 700, 10); windowJitter(30);
  // WOW: flash trắng toàn màn hình khi nuke nổ
  if (window.Cinema) { try { Cinema.nukeFlash(); } catch (e) {} }
  addFloat(G.ship.x, G.ship.y - 40, "💣 NUKE!", "#ffd166", true);
  // v2.0: juice2 nuke FX
  if (window.V2) { try { V2.onNuke(); } catch (er) {} }
  G.enemies.forEach(e => { if (!e.dead) { e.hp -= 15; if (e.hp <= 0) killEnemy(e); else { e.flash = 0.15; } } });
  if (G.boss && !G.boss.dead) {
    G.boss.hp -= 40; G.boss.flash = 0.2;
    if (G.boss.hp <= 0) killBoss(); else if (typeof bossSplitCheck === "function") bossSplitCheck(G.boss); // M2
  }
  // v2.0: nuke cũng trúng boss module
  if (window.V2 && window.Bosses) { try { if (V2.bossActive && Bosses.active && !Bosses.active.dead) Bosses.hit(Bosses.active, 15, Bosses.active.x, Bosses.active.y, G); } catch (er) {} }
  G.ebullets = [];
  const b = bounds();
  burst(b.x + b.w / 2, b.y + b.h / 2, 60, ["#ffd166", "#ff9a3d", "#fff"], 520);
}
function killBoss() {
  const bs = G.boss; if (!bs || bs.dead) return;
  bs.dead = true; G.boss = null;
  for (const sat of SatManager.values()) // M2: hết boss → mảnh tự đóng
    if (sat.role === "fragment" && !sat.dead) SatManager.kill(sat.id, "cleanup");
  if (typeof BG !== "undefined") BG.setDim(0); // hết dim nền
  const pts = 500; // §6: boss = 500 cố định
  G.score += pts; G.kills++;
  // v2.0: meta + tutorial hook
  if (window.V2) { try { V2.onBossKill(); } catch (er) {} }
  // STAGE-MECH: ải 1 reboot tốt nghiệp khi hạ boss; ải 5 CTRL+Z nếu hạ trong lúc NULL hút
  try { if (window.StageMech) StageMech.onBossKill(); } catch (er2) {}
  try { AudioEngine.sfx.explosion(1.2); } catch (err) { try { AudioEngine.sfx.bigboom(); } catch (e2) {} }
  try { AudioEngine.sfx.stinger("victory"); } catch (e) {} // stinger victory khi hạ boss
  jxShake(12, 700, 10); windowJitter(30);
  burst(bs.x, bs.y, 60, ["#c084fc", "#fff", "#ffd166"], 420);
  // WOW: boss burst + hit-stop elite + damage number vàng
  if (window.Juice) {
    try { Juice.burst("boss", bs.x, bs.y); Juice.onKill("boss", true); } catch (err) {}
    try { Juice.damageNumber(bs.x, bs.y - 60, pts, "crit", null); } catch (err) {}
  }
  addFloat(bs.x, bs.y - 50, I18N.t("banner.boss_down", { pts }), "#fde68a", true);
  // WOW: death cinematic (~2.1s, lock update) — banner "BOSS BỊ HẠ!" do Cinema vẽ
  if (window.Cinema) {
    G.bossCine = true;
    try {
      Cinema.bossDeath(bs, { player: G.ship, drawBoss: (c, x, y, s, a) => drawBossShape(c, x, y, s, a, bs.color) })
        .then(() => { G.bossCine = false; }, () => { G.bossCine = false; });
    } catch (err) { G.bossCine = false; }
  } else {
    setBanner(`WAVE ${G.wave} CLEAR — ${ACTS[(G.act || 1) - 1].name}`, I18N.t("banner.wave_clear_sub"));
  }
  try { AudioEngine.setMusicState("VICTORY"); } catch (err) {}
  for (let i = 0; i < 6; i++) {
    const a = Math.random() * Math.PI * 2;
    G.gems.push({ x: bs.x, y: bs.y, vx: Math.cos(a) * 160, vy: Math.sin(a) * 160, v: 2, t: rand(0, 9) });
  }
  G.pickups.push({ kind: "nuke", x: bs.x - 40, y: bs.y, t: 0 });
  G.pickups.push({ kind: "heart", x: bs.x + 40, y: bs.y, t: 0 });
}

/* SEASON 1 — hệ thống vùng họp + chuông haste (chạy 1 lần/frame, ngoài vòng lặp quái) */
function seasonTick(dt, s) {
  if (G.hasteT > 0) { G.hasteT -= dt; if (G.hasteT <= 0) G.globalHaste = 1; }
  if (G.slowZones.length) {
    for (const z of G.slowZones) z.ttl -= dt;
    compactInPlace(G.slowZones, _keepZone);
  }
  if (shipSlowMult() < 1) {
    G.zoneFloatT = Math.max(0, (G.zoneFloatT || 0) - dt);
    if (G.zoneFloatT <= 0) { G.zoneFloatT = 2.5; addFloat(s.x, s.y - 30, I18N.t("season.in_meeting"), "#7dff9a"); }
  } else G.zoneFloatT = 0;
}
/* SEASON 1: tàu trong vùng họp bị slow 35% — trả về multiplier tốc độ (1 = bình thường) */
function shipSlowMult() {
  const s = G.ship; if (!s) return 1;
  let m = 1;
  for (const z of (G.slowZones || [])) {
    const dx = s.x - z.x, dy = s.y - z.y;
    if (dx * dx + dy * dy < z.r * z.r) m = Math.min(m, 1 - z.slow);
  }
  return m;
}

function update(dt) {
  const s = G.ship, b = bounds();
  G.time += dt;
  lastStandTick(); // "Cửa Sổ Cuối Cùng": bật/tắt theo % nguyên vẹn cửa sổ
  SatManager.poll(dt); SatManager.updateSims(dt); updateNests(dt); // multi-window P1a
  if (typeof updateShield === "function") { updateShield(dt); updateDebris(dt); } // P1b/P1c
  if (typeof updateFragments === "function") updateFragments(dt); // P1d
  if (typeof updateBombs === "function") updateBombs(dt);
  if (typeof updateMinions === "function") { updateMinions(dt); updateMothers(dt); updateChicks(dt); }
  if (typeof updateLovers === "function") { updateLovers(dt); updateSuperlove(dt); } // M7
  if (typeof updateMirrors === "function") updateMirrors(dt); // M10
  if (typeof updateBlackholes === "function") updateBlackholes(dt); // M9
  updateCracks(dt);
  G.comboT -= dt;
  if (G.comboT <= 0) {
    // WOW: combo đứt → Cinema.comboLost (chỉ khi combo đáng kể)
    if (G.combo >= 3 && window.Cinema) { try { Cinema.comboLost(); } catch (e) {} }
    G.combo = 0;
  }
  s.iframes = Math.max(0, s.iframes - dt);
  s.shieldT = Math.max(0, s.shieldT - dt);
  s.magnetT = Math.max(0, s.magnetT - dt);
  s.overdriveT = Math.max(0, s.overdriveT - dt);
  if (G.glueFlash > 0) G.glueFlash = Math.max(0, G.glueFlash - dt); // Súng Bắn Keo: viền flash cyan
  // Súng Bắn Keo: nút touch chỉ hiện khi có nâng cấp và đang chơi (chỉ chạm DOM khi đổi state)
  const _wantGlueBtn = !!(s.glueGun && G.phase === "play");
  if (_wantGlueBtn !== _glueBtnShown) {
    _glueBtnShown = _wantGlueBtn;
    if (_glueBtn) _glueBtn.style.display = _wantGlueBtn ? "" : "none";
  }
  if (s.regenT > 0) { /* dành cho nâng cấp sau */ }

  /* M22: tick theo thời gian cho nâng cấp v2 — hồi chiêu Súng Bắn Keo + hồi chiêu Neo,
     và Gai Phản có throttle 0,5s (helper gốc không có cooldown) */
  if (window.Upgrades2 && s) {
    try {
      Upgrades2.tick(s, dt);
      if (s.thornBorder) {
        s._thornCd = Math.max(0, (s._thornCd || 0) - dt);
        if (s._thornCd <= 0) {
          const hits = Upgrades2.checkThornBorder(s, G.enemies,
            { l: b.x, t: b.y, r: b.x + b.w, b: b.y + b.h }, u2DealDamage);
          if (hits > 0) s._thornCd = 0.5;
        }
      }
    } catch (er) {}
  }

  /* di chuyển */
  let mx = 0, my = 0;
  if (keys.KeyW || keys.ArrowUp) my -= 1;
  if (keys.KeyS || keys.ArrowDown) my += 1;
  if (keys.KeyA || keys.ArrowLeft) mx -= 1;
  if (keys.KeyD || keys.ArrowRight) mx += 1;
  const tm = touchMoveVec();
  if (tm) { mx = tm.x; my = tm.y; }
  const ml = hypot(mx, my);
  // STAGE-OBJ: tick objective mỗi frame — trạng thái input cho drift detection (ải 3)
  try { if (window.StageObj) StageObj.update(dt, ml > 0.05); } catch (er) {}
  // STAGE-MECH: boss 25% HP ải 5 (NULL hút cửa sổ), chain drift ải 3, reboot flash ải 1
  try { if (window.StageMech) StageMech.update(dt); } catch (er2) {}
  if (ml > 0.05) {
    const sp = s.speed * Math.min(1, ml) * shipSlowMult() * (G.vp1_shipSpdMul || 1); // SEASON 1: vùng họp slow 35% · VP1 tailwind
    s.x += mx / (ml || 1) * sp * dt; s.y += my / (ml || 1) * sp * dt;
    s.moveSpeed = sp; // WOW: Cinema.playerFx tự vẽ trail khi speed > 180
  } else s.moveSpeed = 0;
  s.x = clamp(s.x, b.x + s.r, b.x + b.w - s.r);
  s.y = clamp(s.y, b.y + s.r, b.y + b.h - s.r);

  if (s.kbvx || s.kbvy) {
    s.x += s.kbvx * dt; s.y += s.kbvy * dt;
    const dk = Math.pow(0.02, dt);
    s.kbvx *= dk; s.kbvy *= dk;
    if (dist2(s.kbvx, s.kbvy, 0, 0) < 100) { s.kbvx = 0; s.kbvy = 0; }
    s.x = clamp(s.x, b.x + s.r, b.x + b.w - s.r);
    s.y = clamp(s.y, b.y + s.r, b.y + b.h - s.r);
  }
  const ta = touchAim();
  s.ang = ta ? Math.atan2(ta.y, ta.x) : Math.atan2(mouse.y - s.y, mouse.x - s.x);

  /* bắn */
  s.fireT -= dt;
  const wantFire = mouse.down || keys.Space || (ta && ta.fire);
  if (wantFire && s.fireT <= 0) { s.fireT = s.fireInt / lsFireMul() * (s.overdriveT > 0 ? 0.55 : 1); fireBullet(); }

  /* wave */
  if (G.spawnQueue.length) {
    G.spawnT -= dt;
    if (G.spawnT <= 0) {
      const TS = wkSpawnCfg();
      if (Number.isFinite(TS.concurrent_cap) && TS.concurrent_cap > 0 && G.enemies.length >= TS.concurrent_cap) {
        // Item 3: concurrent cap — pacing mềm: hoãn spawn 0.25s, KHÔNG drop queue
        // (tổng quái/wave không đổi). Mặc định 20.
        G.spawnT = 0.25;
        // Item 6: báo cho người chơi biết còn quái đang chờ spawn (throttle bằng bannerT)
        if (G.bannerT <= 0) setBanner(I18N.t("vp1.cap.banner"), "");
      } else {
        G.spawnT = wkSpawnInterval(G.wave);
        spawnEnemy(G.spawnQueue.pop());
      }
    }
  } else if (!G.enemies.length && !G.boss && !(G.pendingSpawns > 0) && G.phase === "play") {
    G.waveBreak -= dt;
    if (G.waveBreak <= 0) {
      G.waveBreak = 2.6;
      s.hp = Math.min(s.maxHp, s.hp + 1);
      // Phụ lục A node 6 — Keo siêu dính: vá cuối wave theo modifiers Xưởng (mặc định 40px)
      const wrPx = (G.runMods && G.runMods.waveRepairPx) || 40;
      growWindow(wrPx, Math.round(wrPx * 0.75));
      addFloat(s.x, s.y - 40, I18N.t("banner.patch"), "#9df3ff", true);
      startWave(G.wave + 1);
    }
  }
  G.bannerT = Math.max(0, G.bannerT - dt);

  /* đạn ta */
  for (let i = G.bullets.length - 1; i >= 0; i--) {
    const bl = G.bullets[i];
    bl.x += bl.vx * dt; bl.y += bl.vy * dt; bl.life -= dt;
    let dead = bl.life <= 0;
    if (!dead && (bl.x < b.x || bl.x > b.x + b.w || bl.y < b.y || bl.y > b.y + b.h)) {
      // CHIÊU SIGNATURE: bắn vào viền -> đẩy cửa sổ
      const ex = bl.x < b.x ? "left" : bl.x > b.x + b.w ? "right" : null;
      const edge = ex || (bl.y < b.y ? "top" : "bottom");
      const sp = hypot(bl.vx, bl.vy);
      pushWindow(bl.vx / sp * 300, bl.vy / sp * 300);
      AudioEngine.sfx.thud();
      G._borderFlash = { t: performance.now(), edge }; // H1/B2.4: flash viền xanh #0080FF (chiêu signature)
      burst(clamp(bl.x, b.x, b.x + b.w), clamp(bl.y, b.y, b.y + b.h), 8, ["#9df3ff", "#fff"], 200);
      G.enemies.forEach(e => {
        if (e.type === "chewer" && e.latched === edge && !e.dead) {
          e.hp -= 1; e.latched = null;
          const p = nearestEdgePoint(e.x, e.y);
          e.x = p.x - p.dx * 70; e.y = p.y - p.dy * 70;
          burst(e.x, e.y, 10, ["#c084fc", "#fff"], 220);
          addFloat(e.x, e.y - 20, I18N.t("combat.knockback"), "#c084fc");
          if (e.hp <= 0) killEnemy(e);
        }
      });
      dead = true;
    }
    if (!dead && mirrorReflect(bl)) dead = true; // M10: gương thần phản chiếu đạn
    if (!dead) {
      for (const e of G.enemies) {
        if (e.dead) continue;
        if (dist2(bl.x, bl.y, e.x, e.y) < (bl.r + e.r) * (bl.r + e.r)) {
          damageEnemy(e, bl.dmg, bl);
          /* M22: Đạn Nổ + Đạn Xích — hook tại call-site va chạm đạn (chống đệ quy, §5.3.2) */
          if (window.Upgrades2 && (s.explosive || s.chain)) {
            try {
              if (s.explosive) Upgrades2.explodeAt(bl.x, bl.y, e, G.enemies, u2DealDamage, s);
              if (s.chain) Upgrades2.chainFrom(e, G.enemies, bl.dmg, u2DealDamage, s);
            } catch (er) {}
          }
          if (bl.pierce > 0) bl.pierce--; else dead = true;
          break;
        }
      }
      // v2.0: boss module — đạn đi qua Bosses.hit (áp điểm yếu), skip boss cũ
      if (!dead && window.V2) { try { if (V2.hitBoss(bl)) { if (bl.pierce > 0) bl.pierce--; else dead = true; } } catch (er) {} }
      if (!dead && G.boss && !G.boss.dead &&
          dist2(bl.x, bl.y, G.boss.x, G.boss.y) < (bl.r + G.boss.r) * (bl.r + G.boss.r)) {
        G.boss.hp -= bl.dmg; G.boss.flash = 0.08; AudioEngine.sfx.hit();
        burst(bl.x, bl.y, 5, ["#ffd166", "#fff"], 180);
        if (G.boss.hp <= 0) killBoss(); else if (typeof bossSplitCheck === "function") bossSplitCheck(G.boss); // M2
        if (bl.pierce > 0) bl.pierce--; else dead = true;
      }
    }
    if (dead) G.bullets.splice(i, 1);
  }

  /* đạn địch (boss) */
  for (let i = G.ebullets.length - 1; i >= 0; i--) {
    const eb = G.ebullets[i];
    eb.x += eb.vx * dt; eb.y += eb.vy * dt; eb.life -= dt;
    let dead = eb.life <= 0 || eb.x < b.x - 20 || eb.x > b.x + b.w + 20 || eb.y < b.y - 20 || eb.y > b.y + b.h + 20;
    if (!dead && dist2(eb.x, eb.y, s.x, s.y) < (eb.r + s.r) * (eb.r + s.r)) {
      hurtShip(1, eb.x, eb.y); dead = true;
    }
    if (dead) G.ebullets.splice(i, 1);
  }

  seasonTick(dt, s); // SEASON 1: tick chuông haste + vùng họp (1 lần/frame)
  // VP1: timers (slowOpen, blackout, meteors)
  if (G.vp1_slowOpenT > 0) G.vp1_slowOpenT = Math.max(0, G.vp1_slowOpenT - dt);
  if (G.vp1_blackoutT > 0) {
    G.vp1_blackoutT -= dt;
    if (G.vp1_blackoutT <= 0) { try { if (typeof BG !== "undefined") BG.setBlackout(false); } catch (e) {} }
  }
  if (G.vp1_meteors && G.vp1_meteors.length) vp1TickMeteors(dt);
  /* quái */
  for (const e of G.enemies) {
    if (e.dead) continue;
    e.t += dt; e.flash = Math.max(0, e.flash - dt); e.slowT = Math.max(0, e.slowT - dt);
    e.sayNangT = Math.max(0, (e.sayNangT || 0) - dt); // CEO §9-Q2: đếm ngược "say nắng"
    // VP1 slowopen: 12s đầu wave quái chậm 0.6× · VP1 dj: zigzag theo nhịp
    let vp1SpdMul = (G.vp1_slowOpenT > 0 ? 0.6 : 1);
    const spd = e.speed * (e.slowT > 0 ? 0.45 : 1) * (G.globalHaste || 1) * vp1SpdMul; // SEASON 1: chuông Deadline Dí
    // knockback vật lý
    e.x += e.kbx * dt; e.y += e.kby * dt; e.kbx *= 0.9; e.kby *= 0.9;

    // CEO §9-Q2: quái "say nắng" (aura M7) tấn công lẫn nhau thay vì đuổi tàu — mọi độ khó
    if (e.sayNangT > 0) sayNangUpdate(e, dt, spd);
    else {
      // data-driven: mỗi quái chạy strategy của nó (BEHAVIORS[e.behavior])
      const bh = BEHAVIORS[e.behavior] || BEHAVIORS.chase;
      bh.update(e, dt, s, spd);
      // VP1 djparty: zigzag theo nhịp
      if (G.vp1_dj) { e.x += Math.sin(e.t * 8) * 40 * dt; e.y += Math.cos(e.t * 6) * 40 * dt; }
      // Endless Delight giggle: quái rung lắc cười khành khạch (dao động sin thuần → không drift ròng)
      if (G.vp1_giggle) { e.x += Math.sin(e.t * 10 + e.y * 0.05) * 24 * dt; e.y += Math.sin(e.t * 9 + 1.3) * 24 * dt; }
    }
    if (G.phase !== "play") return;
    // chạm tàu (healer dmg=0 -> không gây sát thương; quái say nắng không cắn tàu)
    if (e.sayNangT <= 0 && dist2(e.x, e.y, s.x, s.y) < (e.r + s.r) * (e.r + s.r)) {
      if (e.dmg > 0) hurtShip(e.dmg, e.x, e.y);
      if (G.phase !== "play") return;
      const dx = e.x - s.x, dy = e.y - s.y, d = hypot(dx, dy) || 1;
      const kb = 40 + s.thorns * 60;
      e.kbx += dx / d * kb * 8; e.kby += dy / d * kb * 8;
      if (s.thorns > 0) damageEnemy(e, s.thorns, null);
    }
  }
  compactInPlace(G.enemies, _keepEnemy);
  // wave-clear banner kèm tên Act (hiện 1 lần khi sạch quái)
  // WOW: đợi cả quái đang warning-spawn (pendingSpawns) rồi mới clear
  if (!G.enemies.length && !G.boss && !G.spawnQueue.length && !(G.pendingSpawns > 0) && G.phase === "play" && !G.waveClearShown && G.wave > 0) {
    G.waveClearShown = true;
    // CTA web→desktop (Sprint R2 item 5): toast 1 lần/run khi clear wave 10
    // (flag reset ở resetGame); không hiện trong portal/Electron.
    if (G.wave === 10 && !G._desktopToastShown && !ctaSuppressed()) {
      G._desktopToastShown = true;
      showDesktopToast();
    }
    // v2.0: juice2/meta/tutorial/campaign hook
    if (window.V2) { try { V2.onWaveClear(G.wave); } catch (er) {} }
    // VP1 hullinsurance: cuối wave vá thêm +30px · VP1 breather: +1 HP
    if (G.vp1_hullIns) { try { growWindow(30, 23); } catch (e) {} }
    if (G.vp1_breather && G.ship) {
      const maxHp = G.ship.maxHp || 3;
      if (G.ship.hp < maxHp) { G.ship.hp++; addFloat(G.ship.x, G.ship.y - 40, "+1 HP", "#7dff9a", true); }
    }
    const cfg = ACTS[(G.act || 1) - 1];
    // WOW: wave clear cinematic — slow-mo + confetti + fanfare + VICTORY + vá cửa sổ từng vết
    if (window.Cinema) {
      try {
        const b = bounds(), patches = [];
        for (let i = 0; i < 4; i++) {
          const side = (Math.random() * 4) | 0;
          patches.push(side === 0 ? { x: rand(b.x, b.x + b.w), y: b.y }
            : side === 1 ? { x: rand(b.x, b.x + b.w), y: b.y + b.h }
            : side === 2 ? { x: b.x, y: rand(b.y, b.y + b.h) }
            : { x: b.x + b.w, y: rand(b.y, b.y + b.h) });
        }
        Cinema.waveClear(G.wave, G.waveKills || 0, patches);
      } catch (err) {
        setBanner(`WAVE ${G.wave} CLEAR — ${cfg.name}`, G.wave % 5 === 0 ? I18N.t("banner.next_boss") : I18N.t("banner.next"));
        try { AudioEngine.sfx.stinger("waveClear"); } catch (e) {} // stinger wave-clear thay sfx.wave()
      }
    } else {
      setBanner(`WAVE ${G.wave} CLEAR — ${cfg.name}`, G.wave % 5 === 0 ? I18N.t("banner.next_boss") : I18N.t("banner.next"));
      try { AudioEngine.sfx.stinger("waveClear"); } catch (e) {} // stinger wave-clear thay sfx.wave()
    }
    try { AudioEngine.setMusicState("VICTORY"); } catch (err) {}
  }

  /* boss */
  const bs = G.boss;
  // AUDIT 2026-10-02: boss module (campaign, do Bosses điều khiển) phải được bỏ qua ở
  // block boss cũ này — trước đây engine cũ vừa kéo boss về phía tàu 34px/s, vừa ghi
  // đè bs.phase theo thang 1–4 (module dùng 1–3) khiến enterPhase không bao giờ chạy
  // và pickAttack đọc phases[2] không tồn tại khi HP ≤ 25% (boss đứng đòn).
  const bsIsModule = !!(bs && window.Bosses && Bosses.active === bs);
  if (bs && !bs.dead && !bsIsModule) {
    bs.t += dt; bs.flash = Math.max(0, bs.flash - dt);
    // WOW: boss phase mỗi 25% HP — flash + slow-mo + banner + palette shift
    const frac = bs.hp / bs.maxHp;
    const ph = frac > 0.75 ? 1 : frac > 0.5 ? 2 : frac > 0.25 ? 3 : 4;
    if (ph !== bs.phase) {
      bs.phase = ph;
      if (window.Cinema) {
        try {
          Cinema.bossPhase(ph, {
            x: bs.x, y: bs.y, r: bs.r,
            clearBullets: () => {
              G.ebullets.forEach(eb => burst(eb.x, eb.y, 3, ["#c084fc", "#fff"], 160));
              G.ebullets = [];
            },
            onPalette: (n) => {
              const pal = ["#8b2fc9", "#a855f7", "#d946ef", "#f43f5e"];
              bs.color = pal[(n - 1) % pal.length] || bs.color;
            }
          });
        } catch (err) {}
      }
    }
    const dx = s.x - bs.x, dy = s.y - bs.y, d = hypot(dx, dy) || 1;
    bs.x += dx / d * 34 * dt; bs.y += dy / d * 34 * dt;
    bs.atkT -= dt; bs.spawnT -= dt; bs.slamT -= dt;
    if (bs.atkT <= 0) {
      // REBALANCE v2.0: chill → pattern boss thưa hơn (bossAtkMul)
      bs.atkT = Math.max(1.4, (2.6 - G.wave * 0.06) * (DIFF.bossAtkMul || 1));
      const bdx = s.x - bs.x, bdy = s.y - bs.y, baseA = Math.atan2(bdy, bdx);
      const bMul = DIFF.bossBulletMul || 1; // REBALANCE v2.0: chill → đạn boss chậm hơn
      const paper = bs.persona === "deadline"; // BOSS PERSONALITY: đạn giấy — visual thuần, cùng tốc độ/sát thương
      if (bs.shot === "aimed") { // VOID REAPER: chùm đạn xòe về phía tàu
        for (let i = -3; i <= 3; i++) {
          const a = baseA + i * 0.16;
          G.ebullets.push({ x: bs.x, y: bs.y, vx: Math.cos(a) * 240 * bMul, vy: Math.sin(a) * 240 * bMul, r: 6, life: 4, paper });
        }
      } else if (bs.shot === "spiral") { // CORE TYRANT: xoắn ốc xoay theo thời gian
        const n = 18, off = bs.t * 2.2;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + off;
          G.ebullets.push({ x: bs.x, y: bs.y, vx: Math.cos(a) * 200 * bMul, vy: Math.sin(a) * 200 * bMul, r: 6, life: 4.5, paper });
        }
      } else { // ring: vòng đạn tròn (bản cũ)
        const n = 10 + Math.floor(G.wave / 2);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + bs.t;
          G.ebullets.push({ x: bs.x, y: bs.y, vx: Math.cos(a) * 185 * bMul, vy: Math.sin(a) * 185 * bMul, r: 6, life: 4, paper });
        }
      }
      AudioEngine.sfx.shoot(); jxShake(2, 120, 1); // WOW tier: hit
    }
    if (bs.spawnT <= 0) { bs.spawnT = 6; bs.adds.forEach(t => spawnEnemy(t)); }
    if (bs.slamT <= 0) {
      bs.slamT = bs.shot === "spiral" ? 9 : 12;
      // AUDIT 2026-10-02: trước đây ở đây có sẵn 1 cặp addFloat+shrinkWindow chạy vô
      // điều kiện, rồi nhánh else lại shrink lần nữa → slam không-debris gây sát thương
      // cửa sổ gấp đôi thiết kế. Chỉ shrink trong nhánh else; nhánh debris thay bằng mưa mảnh vỡ.
      if (G.phase !== "play") return;
      // M4: 50% đòn nện → mưa mảnh vỡ (chỉ khi multi-window bật)
      const useDebris = typeof spawnDebris === "function" && typeof SAT_MODE !== "undefined" && SAT_MODE !== "off" && !SatManager.anyRole("debris") && Math.random() < 0.5;
      if (useDebris) spawnDebris();
      else {
        addFloat(bs.x, bs.y - 70, I18N.t("combat.slam"), "#ff5470", true);
        shrinkWindow(bs.slam, Math.round(bs.slam * 0.75));
        if (G.phase !== "play") return;
        AudioEngine.sfx.bigboom(); jxShake(8, 400, 8); windowJitter(26); // WOW tier: boss slam
        wkBuzz([50, 30, 50]); // HAPTIC (feat/mobile-quality): boss nện
        burst(bs.x, bs.y, 30, ["#c084fc", "#ff5470"], 380);
      }
      // BOSS PERSONALITY: flair visual khi nện — KHÔNG đổi sát thương/cửa sổ
      if (bs.persona === "teaser") burst(bs.x, bs.y - 40, 26, ["#ffd166", "#ff5470", "#7df9ff", "#7dff9a"], 320); // confetti
      else if (bs.persona === "deadline") addFloat(bs.x, bs.y - 100, I18N.t("boss.w10.papers"), "#ffffff", true);
      else if (bs.persona === "dj") burst(bs.x, bs.y, 20, ["#ff5d5d", "#ffd166", "#4dd8a7", "#7df9ff", "#b26bff"], 300);
      else if (bs.persona === "sniffly") burst(bs.x, bs.y, 14, ["#7df9ff", "#ffffff"], 220);
    }
    bossFlairTick(bs, dt); // BOSS PERSONALITY: hành vi hài định kỳ — visual thuần
    if (dist2(bs.x, bs.y, s.x, s.y) < (bs.r + s.r) * (bs.r + s.r)) {
      hurtShip(1, bs.x, bs.y);
      if (G.phase !== "play") return;
      const d2 = hypot(dx, dy) || 1;
      s.x -= dx / d2 * 60; s.y -= dy / d2 * 60;
    }
  }

  /* gems */
  for (let i = G.gems.length - 1; i >= 0; i--) {
    const gm = G.gems[i]; gm.t += dt;
    // AUDIT 2026-10-02: gems trước đây không có hạn dùng → tích lũy vô hạn trong
    // session dài (tụt FPS dần). Cho hạn 30s; đồng thời dọn gem NaN (tọa độ hỏng).
    if (gm.t > 30 || !isFinite(gm.x) || !isFinite(gm.y)) { G.gems.splice(i, 1); continue; }
    const dx = s.x - gm.x, dy = s.y - gm.y, d = hypot(dx, dy) || 1;
    const magR = (s.magnetT > 0 ? 1e9 : s.magnet) * (G.vp1_magnetMul || 1); // magnet pickup: hút toàn bộ gem · VP1 gemmagnet
    if (d < magR) { gm.x += dx / d * 360 * dt; gm.y += dy / d * 360 * dt; }
    else { gm.x += gm.vx * dt; gm.y += gm.vy * dt; gm.vx *= 0.94; gm.vy *= 0.94; }
    if (d < 22) {
      G.gems.splice(i, 1); AudioEngine.sfx.gem();
      burst(gm.x, gm.y, 6, ["#7df9ff", "#fff"], 140);
      gainXp(gm.v + (s.xpPerGem || 0)); // §6: gem = 0 điểm, chỉ XP (Tham lam: +1 XP/gem)
      try { if (window.StageObj) StageObj.onGem(); } catch (er) {} // STAGE-OBJ ải 1
      if (G.phase !== "play") return;
    }
  }

  /* pickups (data-driven: PICKUP_DEFS) */
  for (let i = G.pickups.length - 1; i >= 0; i--) {
    const p = G.pickups[i]; p.t += dt;
    if (p.t > 12) { G.pickups.splice(i, 1); continue; }
    // Endless Delight luckypickup: pickup tự trôi về phía tàu (QoL — nhặt dễ hơn, không đổi khó)
    if (G.vp1_luckyPickup) {
      const ldx = s.x - p.x, ldy = s.y - p.y, ld = Math.hypot(ldx, ldy) || 1;
      if (ld > 34) { p.x += ldx / ld * 150 * dt; p.y += ldy / ld * 150 * dt; }
    }
    if (dist2(p.x, p.y, s.x, s.y) < 30 * 30) {
      G.pickups.splice(i, 1); AudioEngine.sfx.pickup();
      const pd = PICKUP_DEFS[p.kind];
      if (pd) pd.use(s);
      try { if (window.StageObj) StageObj.onPickup(p.kind); } catch (er) {} // STAGE-OBJ ải 5 (patch)
      // STAGE-MECH: ải 5 nhặt patch → +5 gem thưởng "vá có công"
      try { if (window.StageMech) StageMech.onPickup(p.kind, p); } catch (er2) {}
      if (p.kind === "heart") wkBuzz(15); // HAPTIC (feat/mobile-quality): nhặt heart
      // v2.0: meta hook (achievement nhặt vật phẩm)
      if (window.V2) { try { V2.onPickup(p.kind); } catch (er) {} }
      burst(p.x, p.y, 14, ["#fff", "#ffd166"], 220);
    }
  }

  /* fx */
  G.parts.forEach(p => { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.96; p.vy *= 0.96; });
  compactInPlace(G.parts, _keepPart);
  G.floats.forEach(f => f.t += dt);
  compactInPlace(G.floats, _keepFloat);
  if (G.cracks) { // M2 rework: vết rạn kính trên viền mờ dần
    G.cracks.forEach(c => c.t += dt);
    compactInPlace(G.cracks, _keepCrack);
  }
  G.shake = Math.max(0, G.shake - 30 * dt);
  applyWindowMotion(dt);
}
function damageEnemy(e, dmg, bl) {
  if (e.dead) return;
  // v2.0: tutorial beat 2 (bắn trúng quái)
  if (window.V2) { try { V2.onBulletHit(e); } catch (er) {} }
  e.hp -= dmg; e.flash = 0.09;
  if (G.ship.slow) {
    e.slowT = G.ship.slow;
    // SEASON 1: đạn băng reset stack Cáu của Nhân Viên OT ("cho nó nghỉ ngơi")
    if (e.type === "otworker" && e.rage > 0) {
      e.rage = 0; e.rageT = 0;
      addFloat(e.x, e.y - 24, I18N.t("season.rage_reset"), "#7dd3fc");
    }
  }
  if (bl) { e.kbx += bl.vx * 0.12; e.kby += bl.vy * 0.12; }
  AudioEngine.sfx.hit();
  // WOW: damage number (tự gộp theo target trong 120ms) + hit flash
  if (window.Juice) {
    try {
      Juice.damageNumber(bl ? bl.x : e.x, (bl ? bl.y : e.y) - 8, dmg, "normal", e);
      Juice.hitFlash(e);
    } catch (err) {}
  }
  burst(bl ? bl.x : e.x, bl ? bl.y : e.y, 5, ["#ffd166", "#fff"], 180);
  if (e.hp <= 0) killEnemy(e);
}

