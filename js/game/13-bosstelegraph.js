/* ---------------- BOSS PERSONALITY: telegraph vui riêng từng boss ----------------
 * CHỈ visual (particles/float text/rung nhẹ) — tuyệt đối không đổi stat. */
function bossTelegraph(p) {
  try {
    const b = bounds();
    const cx = b.x + b.w / 2, cy = b.y + 100;
    if (p.telegraph === "hunger") {
      addFloat(cx, cy, I18N.t(p.teleKey), "#ffb020", true);
      jxShake(4, 300, 4);
    } else if (p.telegraph === "papers") {
      for (let i = 0; i < 24; i++) // mưa giấy tờ bay
        addPart({ x: b.x + Math.random() * b.w, y: b.y - 20 - Math.random() * 140,
          vx: (Math.random() - 0.5) * 60, vy: 140 + Math.random() * 90,
          t: 0, life: 2.2, c: "#ffffff", sz: 7 });
      addFloat(cx, cy, I18N.t("boss.w10.papers"), "#ffffff", true);
    } else if (p.telegraph === "disco") {
      burst(cx, b.y + 130, 30, ["#ff5d5d", "#ffd166", "#4dd8a7", "#7df9ff", "#b26bff"], 300);
      addFloat(cx, cy, I18N.t("boss.w15.quay"), "#ffd166", true);
    } else if (p.telegraph === "sneeze") {
      addFloat(cx, cy, I18N.t("boss.w20.sneeze"), "#7df9ff", true);
      burst(cx, b.y + 130, 12, ["#7df9ff", "#ffffff"], 200);
    } else if (p.telegraph === "teabreak") {
      for (let i = 0; i < 10; i++) // hơi trà bốc lên
        addPart({ x: cx + (Math.random() - 0.5) * 60, y: b.y + 150,
          vx: (Math.random() - 0.5) * 20, vy: -60 - Math.random() * 40,
          t: 0, life: 2.0, c: "#ffffff88", sz: 5 });
      addFloat(cx, cy, I18N.t(p.teleKey), "#ffd166", true);
    } else if (p.telegraph === "confetti") {
      for (let i = 0; i < 40; i++) // mưa confetti vàng
        addPart({ x: b.x + Math.random() * b.w, y: b.y - 20 - Math.random() * 200,
          vx: (Math.random() - 0.5) * 120, vy: 150 + Math.random() * 120,
          t: 0, life: 2.6, c: ["#ffd166", "#ff5470", "#7df9ff", "#7dff9a"][i % 4], sz: 6 });
      addFloat(cx, cy, I18N.t(p.teleKey), "#ffd166", true);
    }
  } catch (e) {}
}
/* BOSS PERSONALITY: hành vi hài định kỳ của boss — CHỈ visual/float text,
 * không đổi nhịp tấn công, không spawn thêm quái, không buff. */
function bossFlairTick(bs, dt) {
  bs.flairT = (bs.flairT == null ? 2 : bs.flairT) - dt;
  if (bs.flairT > 0) return;
  try {
    if (bs.persona === "corechill") { // hơi cà phê bốc lên + ngáp
      bs.flairT = 0.5;
      addPart({ x: bs.x + (Math.random() - 0.5) * 40, y: bs.y - bs.r,
        vx: (Math.random() - 0.5) * 16, vy: -50, t: 0, life: 1.4, c: "#ffffff66", sz: 5 });
      if (Math.random() < 0.25) addFloat(bs.x, bs.y - 80, I18N.t("boss.w25.yawn"), "#cccccc", false);
    } else if (bs.persona === "teaser") { // cà khịa người chơi
      bs.flairT = 5 + Math.random() * 3;
      addFloat(bs.x, bs.y - 80, I18N.t("boss.w30.taunt" + (1 + Math.floor(Math.random() * 3))), "#ffd166", true);
    } else if (bs.persona === "dj") { // hô "QUẨY!" theo beat
      bs.flairT = 1.6;
      addFloat(bs.x + (Math.random() - 0.5) * 160, bs.y - 70, I18N.t("boss.w15.quay"), "#ffd166", false);
    } else if (bs.persona === "sniffly") { // hắt xì định kỳ
      bs.flairT = 4 + Math.random() * 3;
      addFloat(bs.x, bs.y - 80, I18N.t("boss.w20.sneeze"), "#7df9ff", true);
      burst(bs.x, bs.y, 8, ["#7df9ff", "#ffffff"], 160);
    } else bs.flairT = 9999; // gnome/deadline: flair nằm ở draw/bullet, không cần tick
  } catch (e) { bs.flairT = 5; }
}
function nearestEdgePoint(x, y) {
  const b = bounds();
  const dl = x - b.x, dr = b.x + b.w - x, dt = y - b.y, db = b.y + b.h - y;
  const m = Math.min(dl, dr, dt, db);
  if (m === dl) return { x: b.x, y: clamp(y, b.y, b.y + b.h), edge: "left", dx: -1, dy: 0 };
  if (m === dr) return { x: b.x + b.w, y: clamp(y, b.y, b.y + b.h), edge: "right", dx: 1, dy: 0 };
  if (m === dt) return { x: clamp(x, b.x, b.x + b.w), y: b.y, edge: "top", dx: 0, dy: -1 };
  return { x: clamp(x, b.x, b.x + b.w), y: b.y + b.h, edge: "bottom", dx: 0, dy: 1 };
}

