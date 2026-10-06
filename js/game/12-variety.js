/* ================= VARIETY PACK 1 (2026-10-03) =================
 * Triết lý CEO: variety cho VUI, không tăng khó. Mọi modifier/event đều
 * có lợi hoặc hài — cấm tăng HP/speed/dmg quái.
 * ===================================================================== */
function vp1GetModifiers() {
  try { return (window.Monsters && Monsters.WAVE_MODIFIERS) || []; } catch (e) { return []; }
}
/* Wave n có phải breather? n>=16 && n%6==4 → 16,22,28,34,40,46 (không trùng boss). */
function vp1IsBreather(n) { return n >= 16 && n % 6 === 4; }
/* Wave n có phải boss? */
function vp1IsBossWave(n) { return n % 5 === 0; }
/* Director spawn khi: n>=12, không boss, không breather. */
function vp1DirectorEligible(n) { return n >= 12 && !vp1IsBossWave(n) && !vp1IsBreather(n); }
/* Roll 1 modifier (không trùng wave trước), apply + banner. */
function vp1RollModifier(e) {
  if (G.vp1_spotlight) return; // Item 6: spotlight wave — modifier đã ép từ data, không roll
  const mods = vp1GetModifiers();
  if (!mods.length) return;
  const n = G.wave || 0;
  if (n >= 31) { vp1RollModifierEndless(mods, n); return; } // Endless Delight
  let pool = mods.filter(m => !G.vp1_lastMod || m.id !== G.vp1_lastMod);
  if (!pool.length) pool = mods;
  const m = pool[(Math.random() * pool.length) | 0];
  vp1ApplyModById(m.id, false);
}
/* Endless Delight (2026-10-04) — pure helper, test được, không chạm G/DOM:
 * chọn modifier cho wave 30+: loại N id gần nhất (chống lặp), wave chia hết
 * cho 4 → 2 id khác nhau (combo, như wave 29 Final Audition). */
function vp1EndlessPick(ids, history, n, rnd) {
  var pool = ids.filter(function (id) { return history.indexOf(id) < 0; });
  if (!pool.length) pool = ids.slice(); // hết pool → reset lịch sử, roll lại từ đầu
  var out = [];
  var take = function () { return pool.splice((rnd() * pool.length) | 0, 1)[0]; };
  out.push(take());
  if (n % 4 === 0 && pool.length) out.push(take()); // wave 32, 36, 40...: combo 2 modifier
  return out;
}
/* Số wave "trí nhớ" chống lặp modifier ở endless (mục tiêu: 30 phút chơi
 * wave 30+ vẫn thấy cái mới — 17 modifier, nhớ 8 → luôn có ≥9 lựa chọn). */
var VP1_ENDLESS_HISTORY = 8;
/* Endless Delight — roll modifier wave 31+ (director đã spawn, không boss/breather).
 * KHÔNG chạm difficulty: chỉ apply modifier vui qua vp1ApplyModById. */
function vp1RollModifierEndless(mods, n) {
  const ids = mods.map(m => m.id);
  const hist = G.vp1_modHistory || (G.vp1_modHistory = []);
  const picked = vp1EndlessPick(ids, hist, n, Math.random);
  const names = [];
  for (const id of picked) {
    if (vp1ApplyModById(id, true)) names.push(I18N.t("vp1.mod." + id + ".name"));
    hist.push(id);
  }
  while (hist.length > VP1_ENDLESS_HISTORY) hist.shift();
  if (picked.length > 1) setBanner(I18N.t("vp1.spotlight.double.banner"), names.join(" + "));
  else if (picked.length === 1) setBanner(names[0], I18N.t("vp1.mod." + picked[0] + ".desc"));
}
/* Item 6: apply 1 modifier theo id (spotlight ép từ data).
 * silent=true → không setBanner (banner wave ở cuối startWave gánh hiển thị
 * qua G.vp1_spotlightSub). Trả về true nếu apply được. */
function vp1ApplyModById(id, silent) {
  const mods = vp1GetModifiers();
  const m = mods.find(x => x.id === id);
  if (!m) return false;
  try { m.apply(G); } catch (er) {}
  G.vp1_lastMod = m.id;
  G.vp1_mod = m.id;
  (G.vp1_mods = G.vp1_mods || []).push(m.id);
  if (!silent) setBanner(I18N.t("vp1.mod." + m.id + ".name"), I18N.t("vp1.mod." + m.id + ".desc"));
  return true;
}
/* Clear modifier wave trước (gọi đầu startWave). Item 6: hỗ trợ nhiều modifier
 * cùng lúc (wave 29 Final Audition). */
function vp1ClearModifier() {
  const ids = (G.vp1_mods && G.vp1_mods.length) ? G.vp1_mods : (G.vp1_mod ? [G.vp1_mod] : []);
  if (ids.length) {
    const mods = vp1GetModifiers();
    for (const id of ids) {
      const m = mods.find(x => x.id === id);
      try { if (m) m.clear(G); } catch (e) {}
    }
  }
  G.vp1_mods = [];
  G.vp1_mod = null;
}
/* Item 6 — Spotlight waves 15–30 (data: tuning.spotlights trong difficulty.config.json).
 * Ép modifier/event cụ thể thay vì random — mỗi wave 1 điểm nhấn VUI, không tăng khó.
 * Boss wave (20, 25, 30) KHÔNG spotlight (giữ thuần). Trả về entry spotlight hoặc null. */
function vp1ApplySpotlight(n) {
  if (vp1IsBossWave(n)) return null;
  const spot = wkSpotlightFor(n);
  if (!spot) return null;
  G.vp1_spotlight = true;
  if (spot.event) {
    vp1TriggerEvent(spot.event, n);
    if (spot.event === "golden") G.vp1_spotlightSub = I18N.t("vp1.spotlight.golden.sub");
  } else if (spot.elite_parade) {
    // Diễu hành quái nặng đô + rớt thêm gem — KHÔNG đổi HP/speed/dmg (triết lý CEO)
    G.vp1_eliteParade = true;
    G.vp1_spotlightSub = I18N.t("vp1.spotlight.elite.banner") + " " + I18N.t("vp1.spotlight.elite.sub");
  } else if (spot.mods) {
    const isDouble = spot.mods === "random2";
    let ids = spot.mods;
    if (isDouble) {
      // Wave 29 — Final Audition: roll 2 modifier vui khác nhau
      // (ngoại lệ duy nhất cho quy tắc 1 modifier/wave)
      const pool = vp1GetModifiers().map(m => m.id);
      ids = [];
      while (ids.length < 2 && pool.length) {
        ids.push(pool.splice((Math.random() * pool.length) | 0, 1)[0]);
      }
    }
    const names = [];
    for (const id of ids) {
      if (vp1ApplyModById(id, true)) names.push(I18N.t("vp1.mod." + id + ".name"));
    }
    if (isDouble || names.length > 1) {
      G.vp1_spotlightSub = I18N.t("vp1.spotlight.double.banner") + " " + names.join(" + ");
    } else if (names.length === 1) {
      G.vp1_spotlightSub = names[0] + " — " + I18N.t("vp1.mod." + ids[0] + ".desc");
    }
  }
  return spot;
}
/* Spawn director scripted: 1 con, cách tàu > 300px. */
function vp1SpawnDirector() {
  const def = MONSTER_REGISTRY["director"];
  if (!def) return;
  const b = bounds(), s = G.ship || { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  let x = b.x + b.w / 2, y = b.y + b.h / 2;
  for (let i = 0; i < 12; i++) {
    x = b.x + rand(60, b.w - 60); y = b.y + rand(60, b.h - 60);
    if (hypot(x - s.x, y - s.y) > 300) break;
  }
  spawnEnemyAt("director", x, y);
  if (!G.vp1_directorDebutShown) {
    G.vp1_directorDebutShown = true;
    setBanner(I18N.t("vp1.director.debut"), I18N.t("monster.director.desc"));
  }
}
/* Spawn shipper scripted: 1 con, cách tàu > 300px. Debut wave 11 (CEO 2026-10-04:
 * wave 10 là boss-only, Shipper không thể debut cùng boss). */
function vp1SpawnShipper() {
  const def = MONSTER_REGISTRY["shipper"];
  if (!def) return;
  const b = bounds(), s = G.ship || { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  let x = b.x + b.w / 2, y = b.y + b.h / 2;
  for (let i = 0; i < 12; i++) {
    x = b.x + rand(60, b.w - 60); y = b.y + rand(60, b.h - 60);
    if (hypot(x - s.x, y - s.y) > 300) break;
  }
  spawnEnemyAt("shipper", x, y);
  if (!G.vp1_shipperDebutShown) {
    G.vp1_shipperDebutShown = true;
    setBanner(I18N.t("monster.shipper.name"), I18N.t("monster.shipper.desc"));
  }
}
/* Roll event theo trigger table (§3 spec + Endless Delight remix). Trả về id event hoặc null. */
function vp1RollEvent(n) {
  if (vp1IsBossWave(n)) return null;
  /* Endless Delight (2026-10-04): remix event cũ thành combo mới cho wave 30+.
   * Kiểm tra trước event đơn để combo được ưu tiên ở wave trùng chu kỳ. */
  if (n >= 36 && n % 24 === 12) return "goldrush";     // 36, 84, 108...: Mưa Vàng (meteor + golden; 60/180 là boss nên bỏ qua)
  if (n >= 44 && n % 24 === 20) return "neonblackout"; // 44, 68, 92: Tắt Đèn Neon (blackout + dj)
  if (n >= 24 && n % 24 === 0) return "golden";      // 24, 48...
  if (n >= 18 && n % 24 === 18) return "blackout";   // 18, 42...
  if (n >= 14 && n % 12 === 2) return "meteor";      // 14, 26, 38...
  return null;
}
/* Kích hoạt event đã roll. */
function vp1TriggerEvent(ev, n) {
  if (ev === "meteor") {
    G.vp1_meteors = [5, 15, 25]; // giây trong wave sẽ có sao băng
    setBanner(I18N.t("vp1.event.meteor.banner"), "");
  } else if (ev === "blackout") {
    try { if (typeof BG !== "undefined") BG.setBlackout(true); } catch (e) {}
    G.vp1_blackoutT = 10;
    setBanner(I18N.t("vp1.event.blackout.banner"), "");
  } else if (ev === "golden") {
    G.vp1_golden = true;
    setBanner(I18N.t("vp1.event.golden.banner"), "");
  } else if (ev === "goldrush") {
    /* Endless Delight: Mưa Vàng = sao băng (quái trúng 25 dmg) + Giờ Vàng (gem ×2).
     * Có lợi cho người chơi, không tăng khó. */
    G.vp1_meteors = [5, 15, 25]; // giây trong wave sẽ có sao băng
    G.vp1_golden = true;
    setBanner(I18N.t("vp1.event.goldrush.banner"), "");
  } else if (ev === "neonblackout") {
    /* Endless Delight: Tắt Đèn Neon = blackout 10s + DJ quẩy (quái nhảy disco).
     * dj do event bật (không qua modifier) → đánh dấu để startWave tự clear. */
    try { if (typeof BG !== "undefined") BG.setBlackout(true); } catch (e) {}
    G.vp1_blackoutT = 10;
    G.vp1_dj = true;
    G.vp1_eventDj = true;
    setBanner(I18N.t("vp1.event.neonblackout.banner"), "");
  }
  try { AudioEngine.sfx.wave(); } catch (e) {}
}
/* Endless Delight (2026-10-04) — Victory Lap: beat ăn mừng mỗi 10 wave từ
 * wave 40 (40/50/60...): banner + mưa gem + pháo hoa + fanfare.
 * Thuần celebration — KHÔNG chạm spawn queue/interval/count/HP quái. */
function vp1IsVictoryLap(n) { return n >= 40 && n % 10 === 0; }
function vp1VictoryLap(n) {
  setBanner(I18N.t("vp1.victory.banner", { n: n }), I18N.t("vp1.victory.sub"));
  try {
    const b = bounds();
    // Mưa gem: 24 gem rải khắp arena (gem thường, không đổi giá trị)
    for (let i = 0; i < 24; i++) {
      G.gems.push({ x: b.x + rand(40, b.w - 40), y: b.y + rand(40, b.h - 40),
        vx: rand(-60, 60), vy: rand(-60, 60), v: 2 + ((Math.random() * 4) | 0), t: rand(0, 9) });
    }
    // Pháo hoa chào mừng: 5 chùm rực rỡ
    for (let k = 0; k < 5; k++) {
      burst(b.x + rand(b.w * 0.2, b.w * 0.8), b.y + rand(b.h * 0.2, b.h * 0.6),
        30, ["#ff5470", "#ffd166", "#7df9ff", "#c084fc", "#ffffff"], 420);
    }
  } catch (e) {}
  try { AudioEngine.sfx.wave(); } catch (e) {}
  try { AudioEngine.sfx.bellRing(); } catch (e2) {}
  try { AudioEngine.sfx.up(); } catch (e3) {}
}
/* VP1: tick sao băng — 3 vệt quét ngang, quái trúng 25 dmg, không chạm tàu. */
function vp1TickMeteors(dt) {
  G.vp1_meteorT = (G.vp1_meteorT || 0) + dt;
  if (!G.vp1_meteors.length) return;
  if (G.vp1_meteorT >= G.vp1_meteors[0]) {
    G.vp1_meteors.shift(); G.vp1_meteorT = 0;
    const b = bounds();
    const y = b.y + rand(b.h * 0.2, b.h * 0.8);
    const dir = Math.random() < 0.5 ? 1 : -1;
    // vệt sáng quét ngang
    for (let i = 0; i < 24; i++) {
      addPart({ x: b.x + (dir > 0 ? -i * 30 : b.w + i * 30), y: y + rand(-8, 8),
        vx: dir * 900, vy: 0, life: 1.2, t: 0, c: ["#ffd166", "#ffffff"][i % 2], r: 5 });
    }
    // sát thương quái trên đường quét
    for (const e of G.enemies) {
      if (e.dead) continue;
      if (Math.abs(e.y - y) < 50) {
        damageEnemy(e, 25, null);
        burst(e.x, e.y, 16, ["#ffd166", "#ff9d5c", "#ffffff"], 300);
      }
    }
    try { AudioEngine.sfx.boom(); } catch (e) {}
  }
}
function startWave(n) {
  G.wave = n; G.waveKills = 0;
  G.waveClearShown = false;
  // Endless Delight: Victory Lap mỗi 10 wave từ 40 — beat ăn mừng trước mọi branch
  if (vp1IsVictoryLap(n)) vp1VictoryLap(n);
  // Sprint Round 2 telemetry: wave đã tới (không ảnh hưởng gameplay)
  try {
    if (window.WKAnalytics && typeof window.WKAnalytics.trackWaveReached === "function")
      window.WKAnalytics.trackWaveReached(n, { difficulty: DIFF_KEY, score: G.score });
  } catch (e) {}
  const act = actOf(n), cfg = ACTS[act - 1];
  const changed = act !== G.act;
  G.act = act;
  if (changed) playActMusic(); // đổi nhạc nền theo Act
  if (changed) refreshBG(); // đổi background "Deep Dever" theo ải
  // v2.0 campaign: ?stage=1..5 → wave 10 = boss module, các wave khác lấy comp từ Campaign
  if (window.V2) {
    try {
      const sv = V2.stageWave(n);
      if (sv) {
        if (sv.boss) { V2.startStageBoss(n) || spawnBoss(); return; }
        G.spawnQueue = sv.queue;
        G.spawnQueue.sort(() => Math.random() - 0.5);
        G.spawnT = 0;
        V2.stageFxEnter();
        // Item 2: nghi thức vào ải — wave 1 mỗi ải campaign: banner tên ải +
        // câu luật gắn mechanic + story "quét virus" (thay banner wave mặc định)
        var ritualDone = false;
        try { ritualDone = !!(V2.stageRitualEnter && V2.stageRitualEnter(n)); } catch (err2) {}
        if (!ritualDone) {
          setBanner(I18N.t("campaign.wave", { n: n, stage: V2.stageId }) || `ẢI ${V2.stageId} — WAVE ${n}`, "");
        }
        // STAGE-OBJ: reset objective phụ đầu run (wave 1) — tiến trình reset mỗi run
        if (n === 1 && window.StageObj) { try { StageObj.begin(V2.stageId); } catch (er2) {} }
        // STAGE-MECH: reset lại lần nữa cho chắc (giống StageObj)
        if (n === 1 && window.StageMech) { try { StageMech.begin(V2.stageId); } catch (er3) {} }
        return;
      }
    } catch (er) {}
  }
  if (n % 5 === 0) { spawnBoss(); return; }
  vp1ClearModifier(); // VP1: xóa modifier wave trước (không stack)
  G.vp1_golden = false; G.vp1_meteors = null; G.vp1_blackoutT = 0;
  // Endless Delight: dj do event neonblackout bật → tự clear cuối wave
  if (G.vp1_eventDj) { G.vp1_dj = false; G.vp1_eventDj = false; }
  G.vp1_spotlight = false; G.vp1_spotlightSub = ""; G.vp1_eliteParade = false; // Item 6: reset spotlight
  try { if (typeof BG !== "undefined") BG.setBlackout(false); } catch (e) {}
  // Item 6: spotlight ép trước khi build queue (elite parade cần bias pool ngay trong buildSpawnQueue)
  const vp1spot = vp1ApplySpotlight(n);
  G.spawnQueue = buildSpawnQueue(n);
  // VP1 breather: spawn ×0.6
  if (vp1IsBreather(n)) {
    const keep = Math.max(4, Math.round(G.spawnQueue.length * 0.6));
    G.spawnQueue.length = Math.min(G.spawnQueue.length, keep);
    G.vp1_breather = true;
    setBanner(I18N.t("vp1.event.breather.banner"), "");
  } else G.vp1_breather = false;
  G.spawnQueue.sort(() => Math.random() - 0.5);
  G.spawnT = 0;
  // VP1: director scripted (1 con đầu wave)
  if (vp1DirectorEligible(n)) vp1SpawnDirector();
  // VP1: Shipper debut scripted ở wave 11 (không cùng boss wave 10 — quyết định CEO 2026-10-04)
  if (n === 11) vp1SpawnShipper();
  // VP1: roll event (bỏ qua nếu spotlight đã ép event — vd wave 24 Giờ Vàng)
  if (!vp1spot || !vp1spot.event) {
    const vp1ev = vp1RollEvent(n);
    if (vp1ev) vp1TriggerEvent(vp1ev, n);
  }
  maybeTriggerNest(n); // M1: ổ quái vệ tinh (act 1 wave 6+, endless mỗi 5 wave)
  maybeTriggerBomb(n); maybeTriggerGiant(n); maybeTriggerMother(n); // M8/M6/M5
  maybeTriggerLove(n); maybeTriggerMirror(n); maybeTriggerVacuum(n); // M7/M10/M9
  const sub = n === 1 ? I18N.t("banner.wave1") : pickSub();
  // Item 6: spotlight wave — sub banner mô tả điểm nhấn thay vì tip random (kể cả khi đổi act)
  const waveTitle = changed ? `ACT ${act} — ${cfg.name}` : `WAVE ${n}`;
  const waveSub = changed
    ? (G.vp1_spotlightSub ? `ACT ${act} — ${cfg.name}: ${G.vp1_spotlightSub}` : `ACT ${act} — ${cfg.name}: ${cfg.sub}`)
    : (G.vp1_spotlightSub || sub);
  // WOW: wave banner qua Cinema (fallback setBanner cũ)
  if (window.Cinema) {
    try {
      if (changed) { try { Cinema.stageTransition(); } catch (e) {} }
      Cinema.waveBanner(n, { boss: false, sub: waveSub });
    } catch (err) {
      setBanner(waveTitle, waveSub);
    }
  } else setBanner(waveTitle, waveSub);
}
function pickSub() {
  return [I18N.t("banner.tip1"),
          I18N.t("banner.tip2"),
          I18N.t("banner.tip3"),
          I18N.t("banner.tip4")][Math.floor(Math.random() * 4)];
}
function setBanner(t, sub = "") { G.banner = t; G.bannerSub = sub; G.bannerT = 2.4; }
async function spawnBoss() {
  const b = bounds();
  const v = bossPersonaOf(G.wave); // boss cá tính theo wave (stat = baseline Act, khóa số)
  const hp = (130 + G.wave * 14) * DIFF.hpMul * v.hpMul;
  const bName = I18N.t(v.nameKey);
  G.boss = { x: b.x + b.w / 2, y: b.y + 130, r: 46, hp, maxHp: hp, t: 0,
    atkT: 2.2, spawnT: 5, slamT: 11, phase: 1, wave: G.wave,
    persona: v.id, flair: v.flair,
    name: bName, color: v.color, shot: v.shot, slam: v.slam, adds: v.adds };
  bossTelegraph(v); // telegraph vui riêng — visual thuần, không đụng gameplay
  // WOW: boss intro cinematic (~3.1s, lock update) — game không vẽ boss đè (G.bossCine)
  if (window.Cinema) {
    const tok = ++bossSpawnTok;
    G.bossCine = true;
    try {
      try { AudioEngine.sfx.boss_roar(); } catch (e2) { try { AudioEngine.sfx.boss(); } catch (e3) {} }
      await Cinema.bossIntro(G.boss, `BOSS: ${bName}`, `WAVE ${G.wave} — ${I18N.t(v.teleKey)}`,
        { drawBoss: (c, x, y, s, a) => drawBossShape(c, x, y, s, a, v.color) });
    } catch (err) {}
    G.bossCine = false;
    if (tok !== bossSpawnTok) return; // restart giữa intro → bỏ
    try { Cinema.bgState("boss"); } catch (err) {}
  } else {
    setBanner(`BOSS: ${bName}`, I18N.t(v.teleKey));
    AudioEngine.sfx.boss();
  }
  try { AudioEngine.setMusicState("BOSS"); } catch (err) {}
  if (typeof BG !== "undefined") BG.setDim(0.45); // dim nền khi boss xuất hiện (art-direction §3 L5)
  G.spawnQueue = v.adds.slice();
}
