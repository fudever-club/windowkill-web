/* ---------------- spawn & wave ---------------- */
function edgeSpawn() {
  const b = bounds(), m = 34, s = G.ship;
  const e = Math.floor(Math.random() * 4);
  let x, y;
  if (e === 0) { x = rand(b.x, b.x + b.w); y = b.y - m; }
  else if (e === 1) { x = rand(b.x, b.x + b.w); y = b.y + b.h + m; }
  else if (e === 2) { x = b.x - m; y = rand(b.y, b.y + b.h); }
  else { x = b.x + b.w + m; y = rand(b.y, b.y + b.h); }
  if (dist2(x, y, s.x, s.y) < 200 * 200) { x = b.x + b.w - (x - b.x); y = b.y + b.h - (y - b.y); }
  return { x, y };
}
/* REBALANCE v2.0: đường cong độ khó mượt — thay bước nhảy act (count 1→1.15→1.3,
 * hp 1→1.35→1.8, spd 1→1.08→1.15) bằng ramp tuyến tính theo wave; giữ nguyên giá trị
 * tại các mốc cũ (wave 11, wave 21) nên độ gắt tổng thể không đổi, chỉ hết spike đột ngột. */
function smoothCountMul(n) {
  if (n <= 10) return 1;
  if (n <= 20) return 1 + 0.15 * (n - 10) / 10;
  return 1.15 + 0.15 * Math.min(1, (n - 20) / 10);
}
function smoothHpMul(n) {
  if (n <= 10) return 1;
  if (n <= 20) return 1 + 0.35 * (n - 10) / 10;
  return 1.35 + 0.45 * Math.min(1, (n - 20) / 10);
}
function smoothSpMul(n) {
  if (n <= 10) return 1;
  if (n <= 20) return 1 + 0.08 * (n - 10) / 10;
  return 1.08 + 0.07 * Math.min(1, (n - 20) / 10);
}
/* REBALANCE v2.0: onboarding — normal wave 1-3 dịu lại (ít quái, spawn thưa, quái chậm -15%);
 * tutorial v2.0 chạy ở nhịp chill. Hardcore không đổi. */
function onboardCountMul(n) { return (DIFF_KEY === "normal" && n <= 3) ? 0.7 : 1; }
function tutActive() { return !!(window.Tutorial && window.Tutorial.isActive && window.Tutorial.isActive()); }
function onboardSpawnMul() {
  if (tutActive()) return 1.5; // nhịp chill
  return (DIFF_KEY === "normal" && G.wave <= 3) ? 1.4 : 1;
}
function onboardSpdMul() {
  if (tutActive()) return 0.85;
  return (DIFF_KEY === "normal" && G.wave <= 3) ? 0.85 : 1;
}
function mkEnemy(type, x, y) {
  // FIX C2b (2026-10-02): id đặc biệt 'mini_boss_N' (campaign wave 5) resolve
  // thành entity mini-boss thật: base monster + hp×8, scale×2.5, gem 20
  // (DIFFICULTY.campaign.miniboss) và bossHpMult theo độ khó đã chọn.
  // e.type giữ = base id để mọi behavior/effect/render theo type cũ nguyên vẹn;
  // đánh dấu e.miniBoss để banner/kill-track nhận diện. Không có Campaign
  // (endless) thì id lạ vẫn trả null như cũ — không đổi hành vi cũ.
  var miniSpec = null;
  if (typeof type === "string" && window.Campaign && Campaign.getMinibossSpec) {
    try { miniSpec = Campaign.getMinibossSpec(type); } catch (e0) { miniSpec = null; }
  }
  var def = MONSTER_REGISTRY[miniSpec ? miniSpec.base : type];
  if (!def) return null;
  var e = {
    type: miniSpec ? miniSpec.base : type, behavior: def.behavior, x, y, t: rand(0, 9), flash: 0, slowT: 0, dead: false,

   kbx: 0, kby: 0, r: def.r, dmg: def.dmg, color: def.color,
    hp: wkCapMult(G.wave, "hp", def.hp(G.wave) * DIFF.hpMul * smoothHpMul(G.wave)),
    speed: wkCapMult(G.wave, "speed", def.spd(G.wave) * DIFF.spMul * smoothSpMul(G.wave) * onboardSpdMul()),
         xp: def.xp,
  };
if (miniSpec) {
    var bossHpM = 1;
    try {
      if (window.V2 && V2.diffKey && Campaign.getRunParams) {
        var rp = Campaign.getRunParams(V2.diffKey);
        if (rp && rp.bossHpMult) bossHpM = rp.bossHpMult;
      }
    } catch (e1) {}
    e.miniBoss = miniSpec.id;
    e.miniName = miniSpec.nameVi;
    e.hp = Math.round(e.hp * miniSpec.hpMult * bossHpM);
    e.r = e.r * miniSpec.scale;
    e.xp = miniSpec.gemReward;
  }
  e.maxHp = e.hp;
  // VP1 tiny: quái nhỏ 55%, nhanh +15%, HP −30% (net dễ hơn)
  if (G.vp1_tiny && !e.miniBoss) { e.r *= 0.55; e.hp *= 0.7; e.maxHp = e.hp; e.speed *= 1.15; }
  // Item 6 — Elite Parade (wave 19): 40% quái thành "tinh anh" — vòng vàng + rớt thêm gem,
  // KHÔNG đổi HP/speed/dmg (triết lý CEO: vui vẻ > khó khăn)
  if (G.vp1_eliteParade && !e.miniBoss && Math.random() < 0.4) e.vp1_elite = true;
  if (def.init) def.init(e);
  return e;
}
function spawnEnemyAt(type, x, y) {
  const e = mkEnemy(type, x, y);
  if (!e) return null;
  // WOW: vòng cảnh báo spawn 400ms (elite 500ms) trước khi quái active;
  // quái chưa vào G.enemies nên không gây damage trong lúc warning + materialize
  if (window.Juice) {
    G.pendingSpawns = (G.pendingSpawns || 0) + 1;
    try {
      Juice.spawnWarning(x, y, e.r, { elite: e.r >= 23 }).then(
        (ok) => {
          G.pendingSpawns = Math.max(0, (G.pendingSpawns || 1) - 1);
          // AUDIT 2026-10-02: Juice.reset() settle warning đang treo bằng resolve(false)
          // (fulfilled, không phải reject) — trước đây handler này không kiểm tra nên
          // quái của run cũ spawn thẳng vào run mới sau restart. Hủy khi ok === false.
          if (ok === false) return;
          if (G.phase === "over") return; // game over trong lúc warning → huỷ
          G.enemies.push(e);
          try { Juice.materialize(e); } catch (err) {}
        },
        () => { G.pendingSpawns = Math.max(0, (G.pendingSpawns || 1) - 1); }
      );
    } catch (err) {
      G.pendingSpawns = Math.max(0, (G.pendingSpawns || 1) - 1);
      G.enemies.push(e);
    }
    return e;
  }
  G.enemies.push(e);
  return e;
}
function spawnEnemy(type) {
  const p = edgeSpawn();
  spawnEnemyAt(type, p.x, p.y);
}
function detonateKamikaze(e) {
  e.dead = true;
  shrinkWindow(20, 16); // nổ gặm cửa sổ
  if (G.phase !== "play") return;
  AudioEngine.sfx.bigboom(); jxShake(6, 300, 4); windowJitter(20); // WOW tier: nổ lớn
  wkBuzz([40, 30, 40]); // HAPTIC (feat/mobile-quality): nổ lớn
  burst(e.x, e.y, 26, ["#ff7a1a", "#ffd166", "#fff"], 340);
  addFloat(e.x, e.y - 24, I18N.t("combat.boom"), "#ff7a1a", true);
  const s = G.ship;
  if (dist2(e.x, e.y, s.x, s.y) < 130 * 130) hurtShip(1, e.x, e.y);
}
function buildSpawnQueue(n) {
  const act = actOf(n);
  const pool = Object.values(MONSTER_REGISTRY).filter(d => d.acts.includes(act) && d.minWave <= n && d.weight > 0);
  // Item 6 — Elite Parade (wave 19): quái "nặng đô" diễu hành (weight ×3).
  // Chỉ tính trên bản sao cục bộ — KHÔNG mutate MONSTER_REGISTRY, KHÔNG đổi stat.
  const ELITE_HEAVY = G.vp1_eliteParade ? { tank: 3, warden: 3, booster: 3, splitter: 3 } : null;
  const wOf = d => d.weight * ((ELITE_HEAVY && ELITE_HEAVY[d.id]) || 1);
  const totalW = pool.reduce((a, d) => a + wOf(d), 0);
  const TS = wkSpawnCfg();
  const count = Math.round((TS.base_count + n * TS.per_wave) * (n === 1 ? 0.7 : 1) * smoothCountMul(n) * onboardCountMul(n));
  const q = [];
  for (let i = 0; i < count; i++) {
    let r = Math.random() * totalW, type = pool[0].id;
    for (const d of pool) { r -= wOf(d); if (r <= 0) { type = d.id; break; } }
    q.push(type);
  }
  return q;
}
