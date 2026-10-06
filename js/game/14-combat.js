/* ---------------- bắn ---------------- */
function fireBullet() {
  const s = G.ship;
  let ang;
  const ta = touchAim();
  if (ta) ang = Math.atan2(ta.y, ta.x);
  else ang = Math.atan2(mouse.y - s.y, mouse.x - s.x);
  for (let i = 0; i < s.streams; i++) {
    const a = ang + (i - (s.streams - 1) / 2) * 0.13;
    G.bullets.push({ x: s.x + Math.cos(a) * 18, y: s.y + Math.sin(a) * 18,
      vx: Math.cos(a) * s.bulletSpd, vy: Math.sin(a) * s.bulletSpd,
      r: 4, dmg: s.dmg * lsDmgMul(), pierce: s.pierce + (G.vp1_starBullets ? 1 : 0), life: 1.15,
      star: !!G.vp1_starBullets }); // VP1 starbullets
  }
  // chớp nòng
  addPart({ x: s.x + Math.cos(ang) * 22, y: s.y + Math.sin(ang) * 22,
    vx: 0, vy: 0, t: 0, life: 0.08, c: "#fff7ae", sz: 9 });
  AudioEngine.sfx.shoot();
}

