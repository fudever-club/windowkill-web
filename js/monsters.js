/* =====================================================================
   WINDOWKILL — js/monsters.js
   FU-DEVER Game Studio · Engineering · Monster pack v2 (14 quái)
   Spec: studio/game-design/GAME-DESIGN-DOC.md §2(R4) §5 §6 · docs/bestiary.md
   - IIFE, chạy trong browser / iframe, KHÔNG phụ thuộc popup (không dùng
     window.open / resizeTo / moveBy). Vẽ 100% canvas shape, không copy art.
   - Expose: window.Monsters = { MONSTER_REGISTRY, BEHAVIORS, ... }.
   - Mọi con số khó nhận qua tham số diff = {hpM, spM} (coordinator truyền từ
     difficulty.config.json qua G.diff). Không hard-code multiplier độ khó.
   - Tích hợp: xem INTEGRATION.md (cùng thư mục) — API + điểm hook + i18n.
   ===================================================================== */
(function (root) {
"use strict";

/* ---------------- helpers an toàn (không crash khi thiếu global game) --- */
function gf(name) {
  try { return root[name]; } catch (e) { return undefined; }
}
function callFn(name, args) {
  const f = gf(name);
  if (typeof f === "function") { try { return f.apply(null, args); } catch (e) {} }
  return undefined;
}
function sfx(name) {
  const A = gf("AudioEngine");
  if (A && A.sfx && typeof A.sfx[name] === "function") { try { A.sfx[name](); } catch (e) {} }
}
function float(x, y, text, color, big) { callFn("addFloat", [x, y, text, color, !!big]); }
function puff(x, y, n, colors, spd) { callFn("burst", [x, y, n, colors, spd || 200]); }
function shake(a, b, c) { callFn("jxShake", [a, b, c]); }
function knockShipFx(x, y, power) {
  if (typeof gf("knockShip") === "function") { try { gf("knockShip")(x, y, power); } catch (e) {} }
  else { const s = shipOf(lastG); if (s) { const dx = s.x - x, dy = s.y - y, d = Math.hypot(dx, dy) || 1;
    s.kbvx = (s.kbvx || 0) + dx / d * power; s.kbvy = (s.kbvy || 0) + dy / d * power; } }
}
function boundsOf(over) {
  if (over) return over;
  const b = callFn("bounds", []);
  if (b && typeof b.w === "number") return b;
  return { x: 0, y: 0, w: 960, h: 600 };
}
function shipOf(G) { return G && G.ship ? G.ship : null; }
function diffOf(G) { return (G && G.diff) || { hpM: 1, spM: 1 }; }
var lastG = null;

var TAU = Math.PI * 2;
function rand(a, b) { return a + Math.random() * (b - a); }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function hyp(x, y) { return Math.sqrt(x * x + y * y); }
function angDiff(a, b) {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}
/* điểm + pháp tuyến của viền gần nhất (không phụ thuộc game.js) */
function edgePoint(x, y, b) {
  const dl = x - b.x, dr = (b.x + b.w) - x, dt = y - b.y, db = (b.y + b.h) - y;
  const m = Math.min(dl, dr, dt, db);
  if (m === dl) return { x: b.x, y: clamp(y, b.y, b.y + b.h), edge: "left", dx: -1, dy: 0 };
  if (m === dr) return { x: b.x + b.w, y: clamp(y, b.y, b.y + b.h), edge: "right", dx: 1, dy: 0 };
  if (m === dt) return { x: clamp(x, b.x, b.x + b.w), y: b.y, edge: "top", dx: 0, dy: -1 };
  return { x: clamp(x, b.x, b.x + b.w), y: b.y + b.h, edge: "bottom", dx: 0, dy: 1 };
}
var EDGES = ["left", "right", "top", "bottom"];

/* =====================================================================
   MONSTER_REGISTRY — 14 quái (§6.1 + bestiary chi tiết)
   hpAt(wave, diff) / speedAt(wave, diff): diff = {hpM, spM}.
   ===================================================================== */
var D1 = { hpM: 1, spM: 1 };
function hp1(base) { return function (w, d) { d = d || D1; return base(w) * d.hpM; }; }
function sp1(base) { return function (w, d) { d = d || D1; return base(w) * d.spM; }; }

var MONSTER_REGISTRY = {
  /* ---- 6 quái cũ (nâng cấp §6.3) ---- */
  chaser: { id: "chaser", nameVi: "Truy Đuổi", role: "đuổi / dmg tàu", color: "#ff5470",
    shape: "tam giác nhọn", r: 12, dmg: 1, xp: 1, gems: 10, behavior: "chase",
    hpAt: hp1(w => 2 + w * 0.5), speedAt: sp1(w => 95 + w * 7),
    weaknessVi: "Máu thấp, chỉ biết lao thẳng — dễ bị bắn khi lượn vòng.",
    counterVi: "Giữ khoảng cách, bắn khi nó lượn; né ngang khi thấy chớp đỏ <60px." },
  chewer: { id: "chewer", nameVi: "Gặm Viền", role: "gặm cửa sổ", color: "#c084fc",
    shape: "vuông", r: 13, dmg: 1, xp: 2, gems: 25, behavior: "chew",
    hpAt: hp1(w => 3 + w * 0.4), speedAt: sp1(w => 78 + w * 4),
    weaknessVi: "Bám viền là đứng yên — thành bia cho đạn hất viền.",
    counterVi: "Bắn vào viền gần nó để hất văng; viền băng thì bắn thẳng vào nó." },
  tank: { id: "tank", nameVi: "Xe Tăng", role: "tanker chặn đường", color: "#ffb020",
    shape: "lục giác", r: 23, dmg: 1, xp: 4, gems: 50, behavior: "tank",
    hpAt: hp1(w => 12 + w * 2.2), speedAt: sp1(() => 46),
    weaknessVi: "Chậm; lõi giữa thân nhận ×1.5 sát thương; dễ bị vòng sau.",
    counterVi: "Đạn xuyên / vòng sau lưng, ngắm lõi; né ngang khi nó nghiêng người húc." },
  dasher: { id: "dasher", nameVi: "Lao Tới", role: "sát thủ dash", color: "#ffe14d",
    shape: "tam giác nhọn", r: 11, dmg: 1, xp: 2, gems: 20, behavior: "dash",
    hpAt: hp1(w => 4 + w * 0.5), speedAt: sp1(w => 120 + w * 5),
    weaknessVi: "Phải aim 0.7s trước khi lao — đường aim tố cáo hướng đi.",
    counterVi: "Né ngang khi aim chuyển ĐỎ (0.15s cuối); wave 7+ coi chừng dash giả." },
  splitter: { id: "splitter", nameVi: "Phân Thân", role: "phân tách", color: "#7df9ff",
    shape: "tròn", r: 18, dmg: 1, xp: 3, gems: 35, behavior: "split",
    hpAt: hp1(w => 7 + w), speedAt: sp1(w => 70 + w * 4),
    weaknessVi: "Chết là tách — nhưng báo vỡ trước (phồng + rung khi máu <50%).",
    counterVi: "Giết ở xa, lùi ra trước khi nó vỡ; wave 8+ tách 3 mini máu 1." },
  mini: { id: "mini", nameVi: "Mini", role: "quấy rối nhanh", color: "#ff9df3",
    shape: "tam giác nhỏ", r: 8, dmg: 1, xp: 1, gems: 8, behavior: "swarm",
    hpAt: hp1(() => 1.5), speedAt: sp1(() => 150),
    weaknessVi: "Máu giấy; đạn băng + băng = vỡ tan ngay.",
    counterVi: "Dọn bằng AoE/đạn băng; nhịp 3s đuổi → 1s tản ra." },

  /* ---- 8 quái mới (bestiary Phần 1) ---- */
  spitter: { id: "spitter", nameVi: "Phun Mã Độc", role: "bắn xa", color: "#f43f5e",
    shape: "hình thoi", r: 12, dmg: 1, xp: 3, gems: 30, behavior: "spit",
    debutWave: 2, debutHintVi: "Áp sát vòng sau lưng lúc nó aim 0.6s — đạn bay chậm, né ngang dễ.",
    hpAt: hp1(w => 5 + w * 0.7), speedAt: sp1(() => 70),
    weaknessVi: "Máu giấy, đứng yên hoàn toàn 0.6s khi aim.",
    counterVi: "Áp sát vòng sau lưng lúc aim; giết trước khi nó nứt 2+ viền." },
  booster: { id: "booster", nameVi: "Khuếch Đại Lỗi", role: "buff đồng loại", color: "#22c55e",
    shape: "sao 5 cánh", r: 14, dmg: 0, xp: 3, gems: 35, behavior: "aura",
    debutWave: 4, debutHintVi: "GIẾT NÓ ĐẦU TIÊN — đạn băng trúng nó tắt aura 3s.",
    hpAt: hp1(w => 6 + w * 0.8), speedAt: sp1(() => 55),
    weaknessVi: "Không tấn công trực tiếp; nấp sau tank/warden.",
    counterVi: "Ưu tiên giết số 1; đạn xuyên hoặc vòng hông; đạn băng tắt aura 3s." },
  bomber: { id: "bomber", nameVi: "Liều Chết Cảm Tử", role: "kamikaze", color: "#ef4444",
    shape: "tròn", r: 11, dmg: 1, xp: 2, gems: 25, behavior: "kamikaze",
    debutWave: 3, debutHintVi: "Giết từ xa >150px — chết gần vẫn nổ! Đẩy nó ra giữa map.",
    hpAt: hp1(w => 4 + w * 0.6), speedAt: sp1(w => 130 + w * 5),
    weaknessVi: "Fuse 0.7s đứng yên; đạn băng kéo dài fuse +0.5s.",
    counterVi: "Giết từ >150px; dùng knockback đẩy ra giữa map; đừng để fuse gần viền." },
  freezer: { id: "freezer", nameVi: "Đóng Băng Hệ Thống", role: "khống chế", color: "#38bdf8",
    shape: "bông tuyết 6 cánh", r: 13, dmg: 0, xp: 3, gems: 30, behavior: "ice",
    debutWave: 3, debutHintVi: "Viền bị băng 8s: chewer miễn hất — đổi sang bắn thẳng chewer.",
    hpAt: hp1(w => 6 + w * 0.7), speedAt: sp1(() => 60),
    weaknessVi: "Đạn băng của nó bay chậm (140), né ngang đơn giản.",
    counterVi: "Ưu tiên giết thứ 2 (sau booster); viền băng → bắn TRỰC TIẾP chewer." },
  warden: { id: "warden", nameVi: "Giáp Gương", role: "tanker phản xạ", color: "#cbd5e1",
    shape: "ngũ giác", r: 20, dmg: 0, xp: 5, gems: 60, behavior: "mirror",
    debutWave: 4, debutHintVi: "Đừng bắn mặt gương — vòng sau lưng, đạn xuyên bỏ qua gương.",
    hpAt: hp1(w => 16 + w * 2.5), speedAt: sp1(() => 40),
    weaknessVi: "Gương chỉ che mặt trước; xoay chậm 90°/s; hông/sau nhận ×1.5 dmg.",
    counterVi: "Vòng sau lưng; đạn xuyên; bắn vào viền gần nó để hất xoay lộ lưng." },
  glimmer: { id: "glimmer", nameVi: "Đom Đóm Vàng", role: "bonus chạy trốn", color: "#fbbf24",
    shape: "sao 4 cánh", r: 9, dmg: 0, xp: 1, gems: 50, behavior: "flee",
    debutWave: 2, maxPerWave: 1, lifeT: 12,
    debutHintVi: "Chặn đầu hướng nó chạy về viền — 1-2 viên là hạ, rớt 5 gem!",
    hpAt: hp1(() => 2), speedAt: sp1(() => 175),
    weaknessVi: "Máu 2 cố định, không tấn công, chỉ sống 12s.",
    counterVi: "Chặn đầu hướng viền; đạn băng làm chậm 50%." },
  phantom: { id: "phantom", nameVi: "Bóng Ma Ẩn", role: "tàng hình", color: "#a78bfa",
    shape: "blob méo", r: 12, dmg: 1, xp: 3, gems: 35, behavior: "cloak",
    debutWave: 5, debutHintVi: "Đạn băng là khắc chế cứng — hiện hình 3s. Đứng xa viền.",
    hpAt: hp1(w => 3 + w * 0.5), speedAt: sp1(() => 150),
    weaknessVi: "Hitbox giữ nguyên khi ẩn — bắn phủ vào đám hạt nhiễu vẫn trúng.",
    counterVi: "Đạn băng hiện hình 3s; đứng xa viền để nó không rạch được." },
  broodmother: { id: "broodmother", nameVi: "Ổ Lỗi Sinh Sản", role: "đẻ trứng", color: "#16a34a",
    shape: "tròn to", r: 24, dmg: 0, xp: 6, gems: 70, behavior: "lay",
    debutWave: 5, maxPerWave: 1,
    debutHintVi: "Trứng 1 viên là vỡ — đẩy mẹ ra GIỮA MAP cho trứng khỏi dính viền.",
    hpAt: hp1(w => 14 + w * 1.8), speedAt: sp1(() => 38),
    weaknessVi: "Chậm; trứng máu 1; không lại gần viền (<100px).",
    counterVi: "Bắn trứng ngay (1 hit); knockback đẩy mẹ ra giữa map; AoE dọn trứng." },
  /* ---- Season 1 "Mùa Deadline" — 3 quái mới ---- */
  deadline: { id: "deadline", nameVi: "Deadline Dí", role: "đếm ngược / buff bầy", color: "#ffe14d",
    shape: "đồng hồ báo thức", r: 13, dmg: 0, xp: 3, gems: 30, behavior: "countdownBell",
    debutWave: 4, maxPerWave: 2,
    debutHintVi: "Hạ nó trước khi chuông reo — đạn băng đóng băng đếm ngược 3s!",
    hpAt: hp1(w => 5 + w * 1.8), speedAt: sp1(() => 85),
    weaknessVi: "Không gây sát thương trực tiếp; chỉ nguy hiểm khi chuông reo.",
    counterVi: "Ưu tiên bắn hạ trước; đạn băng kéo dài thời gian." },
  otworker: { id: "otworker", nameVi: "Nhân Viên OT", role: "tăng nộ theo thời gian", color: "#ff5252",
    shape: "tam giác nhọn", r: 12, dmg: 1, xp: 2, gems: 25, behavior: "rageChase",
    debutWave: 6, maxPerWave: 2,
    debutHintVi: "Giết nhanh, đừng để nó OT lâu — đạn băng reset stack Cáu!",
    hpAt: hp1(w => 4 + w * 0.5), speedAt: sp1(w => 100 + w * 5),
    weaknessVi: "Lúc mới spawn còn yếu (0 stack); càng để lâu càng mạnh.",
    counterVi: "Dồn sát thương nhanh; đạn băng cho nó nghỉ ngơi (reset Cáu)." },
  meeting: { id: "meeting", nameVi: "Kẻ Họp Hành", role: "vùng làm chậm / triệu tập", color: "#7dff9a",
    shape: "tròn", r: 14, dmg: 0, xp: 4, gems: 35, behavior: "meetingAura",
    debutWave: 8, maxPerWave: 1,
    debutHintVi: "Đừng vào vòng họp của nó — đứng ngoài bắn từ xa!",
    hpAt: hp1(w => 8 + w * 0.9), speedAt: sp1(() => 45),
    weaknessVi: "Gần như đứng yên; không tấn công trực tiếp.",
    counterVi: "Đứng ngoài vòng 160px; đạn nổ dọn cụm sau triệu tập." },
};

/* entry phụ: trứng của broodmother (entity riêng trong G.enemies) */
var EGG_DEF = { id: "egg", nameVi: "Trứng Lỗi", role: "trứng", color: "#bbf7d0",
  shape: "oval", r: 8, dmg: 0, xp: 0, gems: 0, behavior: "egg",
  hpAt: hp1(() => 1), speedAt: sp1(() => 0) };

/* =====================================================================
   BEHAVIORS — mỗi behavior: { update(m, dt, G), draw(m, ctx) }.
   update nhận G (lấy ship qua G.ship, diff qua G.diff). Không hard-code
   multiplier độ khó: mọi công thức qua diffOf(G) = G.diff || {hpM:1,spM:1}.
   ===================================================================== */
function effSpeed(m, G) {
  let s = m.speed * (m.slowT > 0 ? 0.45 : 1);
  if (m.buffed) s *= 1.4;               // aura booster (§6.1)
  if (m.revealT > 0 && m.behavior === "cloak") s *= 0.5;
  return s;
}
function chaseShip(m, dt, s, spd, wobAmp, wobFreq) {
  const dx = s.x - m.x, dy = s.y - m.y, d = hyp(dx, dy) || 1;
  const wob = Math.sin(m.t * (wobFreq || 6)) * (wobAmp == null ? 12 : wobAmp);
  m.x += (dx / d * spd + -dy / d * wob) * dt;
  m.y += (dy / d * spd + dx / d * wob) * dt;
}

var BEHAVIORS = {
  /* ---------- chase: CHASER nâng cấp (§6.3) ----------
     - elite chaser_alpha (wave≥6, 15%): máu×2, tốc+15%, vệt đỏ
     - đội hình chữ V (wave≥8, ≥3 chaser trong 200px → +20% tốc)
     - telegraph chạm: <60px → chớp đỏ 0.3s */
  chase: {
    init(m, wave) {
      m.elite = wave >= 6 && Math.random() < 0.15;
      if (m.elite) { m.r = 15; m.hp *= 2; m.maxHp = m.hp; m.speed *= 1.15; }
      m.formT = 0; m.formV = false; m.touchWarn = 0;
    },
    update(m, dt, G) {
      const s = shipOf(G); if (!s) return;
      const wave = G.wave || 1;
      if (m.stunT > 0) { m.stunT -= dt; return; }
      let spd = effSpeed(m, G) * (m.elite ? 1 : 1);
      // đội hình chữ V: check neighbor mỗi 0.5s
      m.formT -= dt;
      if (wave >= 8 && m.formT <= 0) {
        m.formT = 0.5;
        let n = 0;
        for (const o of G.enemies) {
          if (o === m || o.dead || o.behavior !== "chase") continue;
          const dd = (o.x - m.x) * (o.x - m.x) + (o.y - m.y) * (o.y - m.y);
          if (dd < 200 * 200) n++;
        }
        m.formV = n >= 2;
      }
      if (m.formV) spd *= 1.2;
      chaseShip(m, dt, s, spd);
      // telegraph chạm
      const d = hyp(s.x - m.x, s.y - m.y);
      if (d < 60 && m.touchWarn <= 0) { m.touchWarn = 0.3; sfx("shoot"); }
      m.touchWarn = Math.max(0, m.touchWarn - dt);
    },
    draw(m, ctx) {
      const s = lastG && lastG.ship;
      ctx.save(); ctx.translate(m.x, m.y);
      if (m.flash > 0) ctx.globalAlpha = 0.45;
      const ang = Math.atan2((s ? s.y : 0) - m.y, (s ? s.x : 0) - m.x);
      ctx.rotate(ang);
      // vệt đỏ của elite
      if (m.elite) {
        ctx.fillStyle = "rgba(255,60,60,0.25)";
        for (let i = 1; i <= 3; i++) {
          ctx.beginPath();
          ctx.moveTo(-m.r - i * 10, 0); ctx.lineTo(-m.r - i * 10 - 8, -6); ctx.lineTo(-m.r - i * 10 - 8, 6);
          ctx.closePath(); ctx.fill();
        }
      }
      const warn = m.touchWarn > 0 && Math.floor(m.touchWarn * 20) % 2 === 0;
      ctx.fillStyle = warn ? "#ff2222" : (m.slowT > 0 ? "#7dd3fc" : m.color);
      ctx.beginPath();
      ctx.moveTo(m.r + 2, 0); ctx.lineTo(-m.r, -m.r * 0.85);
      ctx.lineTo(-m.r * 0.4, 0); ctx.lineTo(-m.r, m.r * 0.85);
      ctx.closePath(); ctx.fill();
      ctx.restore(); ctx.globalAlpha = 1;
    }
  },

  /* ---------- chew: CHEWER nâng cấp (§6.3) ----------
     - báo gặm 0.5s trước mỗi lần gặm (răng cưa chớp tại điểm gặm)
     - elite "chewer bự" (wave≥7): r18, gặm 20px/lần, grip=2
     - bị hất → choáng 1.5s (nằm ngửa, sao xoay) */
  chew: {
    init(m, wave) {
      m.latched = null; m.chewT = 0; m.grip = 1; m.stunT = 0; m.warnSfx = false;
      m.elite = wave >= 7 && Math.random() < 0.2;
      if (m.elite) { m.r = 18; m.hp *= 1.6; m.maxHp = m.hp; m.grip = 2; }
      if (m.miniboss && m.miniboss.id === "ancient") { m.grip = 1; }
    },
    update(m, dt, G) {
      const s = shipOf(G); if (!s) return;
      if (m.stunT > 0) { m.stunT -= dt; return; }   // choáng khi bị hất
      const b = boundsOf();
      if (!m.latched) {
        const p = edgePoint(m.x, m.y, b);
        const d = hyp(p.x - m.x, p.y - m.y);
        const spd = effSpeed(m, G);
        if (d < 16) {
          m.latched = p.edge; m.x = p.x; m.y = p.y; m.chewT = 0;
          float(m.x, m.y - 24, "⚠ Gặm viền!", "#c084fc"); sfx("shrink");
        } else { m.x += (p.x - m.x) / d * spd * dt; m.y += (p.y - m.y) / d * spd * dt; }
      } else {
        const chewBase = (G.diff && G.diff.chew) || 0.9;
        let interval = chewBase * (m.buffed ? 0.7 : 1);       // aura booster
        if (m.miniboss && m.miniboss.id === "ancient") interval *= 0.5; // gặm nhanh gấp đôi
        m.chewT += dt;
        // báo gặm: 0.5s trước khi gặm
        if (interval - m.chewT <= 0.5 && !m.warnSfx) { m.warnSfx = true; sfx("shrink"); }
        if (m.chewT >= interval) {
          m.chewT = 0; m.warnSfx = false;
          const px = (m.elite || (m.miniboss && m.miniboss.id)) ? 20 : 14;
          const amt = Monsters.chewAmount(m.latched, px);
          callFn("shrinkWindow", [m.latched === "left" || m.latched === "right" ? amt : 0,
                                  m.latched === "top" || m.latched === "bottom" ? amt : 0]);
          sfx("shrink"); shake(2, 150, 3);
          puff(m.x, m.y, 8, ["#c084fc", "#7c3aed"], 160);
          // Chewer Chúa Tể: gặm kép — vùng an toàn thu thêm 4px
          if (m.miniboss && m.miniboss.id === "lord") { G.arenaShrink = (G.arenaShrink || 0) + 4; }
        }
        const q = edgePoint(m.x, m.y, b); m.x = q.x; m.y = q.y;
      }
    },
    draw(m, ctx) {
      ctx.save(); ctx.translate(m.x, m.y);
      if (m.flash > 0) ctx.globalAlpha = 0.45;
      if (m.stunT > 0) ctx.rotate(Math.PI);          // nằm ngửa khi choáng
      const q = m.r + Math.sin(m.t * 8) * 1.5;
      ctx.fillStyle = m.slowT > 0 ? "#7dd3fc" : m.color;
      ctx.fillRect(-q, -q, q * 2, q * 2);
      if (m.elite) { ctx.strokeStyle = "#fbbf24"; ctx.lineWidth = 3; ctx.strokeRect(-q, -q, q * 2, q * 2); }
      ctx.fillStyle = "#2a0a3a";
      ctx.fillRect(-5, -5 + (m.latched ? Math.sin(m.t * 10) * 2 : 0), 10, 10);
      if (m.latched) {
        ctx.fillStyle = "#ff5470"; ctx.font = "13px sans-serif"; ctx.textAlign = "center";
        ctx.fillText("⚠", 0, -q - 6);
        // báo gặm: răng cưa chớp tại điểm gặm
        if (m.warnSfx && Math.floor(m.t * 12) % 2 === 0) {
          ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2;
          ctx.beginPath();
          for (let i = -2; i <= 2; i++) {
            const zx = i * 7, zy = (i % 2 === 0 ? -4 : 4) + q + 2;
            i === -2 ? ctx.moveTo(zx, zy) : ctx.lineTo(zx, zy);
          }
          ctx.stroke();
        }
      }
      if (m.stunT > 0) { // sao xoay trên đầu
        ctx.fillStyle = "#ffe14d"; ctx.font = "14px sans-serif"; ctx.textAlign = "center";
        const sa = m.t * 6;
        ctx.fillText("⭐", Math.cos(sa) * 14, -m.r - 8 + Math.sin(sa) * 4);
      }
      // vương miện đỏ của Chewer Chúa Tể
      if (m.miniboss && m.miniboss.id === "lord") {
        ctx.fillStyle = "#ef4444"; ctx.font = "16px sans-serif"; ctx.textAlign = "center";
        ctx.fillText("👑", 0, -m.r - 10);
      }
      // răng vàng của Chewer Cổ Đại
      if (m.miniboss && m.miniboss.id === "ancient") {
        ctx.fillStyle = "#fbbf24"; ctx.font = "12px sans-serif"; ctx.textAlign = "center";
        ctx.fillText("🦷", 0, -m.r - 8);
      }
      ctx.restore(); ctx.globalAlpha = 1;
    }
  },

  /* ---------- tank: TANK nâng cấp (§6.3) ----------
     - đòn húc (wave≥6): windup 0.6s → húc 3× tốc 0.5s, dmg 1
     - chết rơi 2 mini (wave≥5, kế thừa 50% knockback)
     - lõi yếu: trúng lõi (r×0.45) → ×1.5 dmg (xử lý ở Monsters.onHit) */
  tank: {
    init(m, wave) {
      m.state = "roam"; m.stateT = 0; m.hx = 0; m.hy = 0; m.coreFlash = 0;
    },
    update(m, dt, G) {
      const s = shipOf(G); if (!s) return;
      const wave = G.wave || 1;
      if (m.stunT > 0) { m.stunT -= dt; return; }
      m.coreFlash = Math.max(0, m.coreFlash - dt);
      const spd = effSpeed(m, G);
      const dx = s.x - m.x, dy = s.y - m.y, d = hyp(dx, dy) || 1;
      // Tank Từ Trường (mini-boss ải 3): mỗi 8s hút tàu 1.5s
      if (m.miniboss && m.miniboss.id === "magnet") {
        m.magT = (m.magT == null ? 8 : m.magT) - dt;
        if (m.magT <= 0) { m.magT = 8; m.magWarn = 1.0; float(m.x, m.y - m.r - 14, "🧲 Hút!", "#a78bfa"); sfx("shrink"); }
        if (m.magWarn > 0) { m.magWarn -= dt; if (m.magWarn <= 0) { G.shipPull = { x: m.x, y: m.y, t: 1.5, str: 260 }; } }
      }
      if (wave >= 6 && m.state === "roam" && d < 200) {
        m.state = "windup"; m.stateT = 0.6; m.hx = dx / d; m.hy = dy / d; sfx("shoot");
      } else if (m.state === "windup") {
        m.stateT -= dt;
        // nghiêng về sau: lùi nhẹ ngược hướng húc + bụi
        m.x -= m.hx * spd * 0.4 * dt; m.y -= m.hy * spd * 0.4 * dt;
        if (Math.random() < 0.4) puff(m.x - m.hx * m.r, m.y - m.hy * m.r, 2, ["#ffb020", "#8a5a00"], 90);
        if (m.stateT <= 0) { m.state = "charge"; m.stateT = 0.5; sfx("shoot"); }
      } else if (m.state === "charge") {
        m.stateT -= dt;
        m.x += m.hx * spd * 3 * dt; m.y += m.hy * spd * 3 * dt;
        if (Math.random() < 0.6) puff(m.x, m.y, 2, ["#ffb020", "#fff"], 120);
        if (m.stateT <= 0) { m.state = "roam"; m.stateT = 2.0; }
      } else {
        if (m.stateT > 0) m.stateT -= dt;
        else chaseShip(m, dt, s, spd, 6, 4);
      }
    },
    draw(m, ctx) {
      ctx.save(); ctx.translate(m.x, m.y);
      if (m.flash > 0) ctx.globalAlpha = 0.45;
      ctx.rotate(m.t * 0.8);
      ctx.fillStyle = m.slowT > 0 ? "#7dd3fc" : m.color;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; ctx.lineTo(Math.cos(a) * m.r, Math.sin(a) * m.r); }
      ctx.closePath(); ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = "#64748b"; ctx.stroke();
      // lõi yếu — sáng hơn khi bị bắn trúng
      ctx.fillStyle = m.coreFlash > 0 ? "#fff7ae" : "#5b2d00";
      ctx.beginPath(); ctx.arc(0, 0, m.r * 0.45, 0, TAU); ctx.fill();
      if (m.state === "windup") { // telegraph húc: chớp vàng
        ctx.strokeStyle = `rgba(255,225,77,${0.5 + 0.5 * Math.sin(m.t * 30)})`;
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(0, 0, m.r + 8, 0, TAU); ctx.stroke();
      }
      // vành từ tính của Tank Từ Trường
      if (m.miniboss && m.miniboss.id === "magnet") {
        ctx.strokeStyle = m.magWarn > 0 ? "#c4b5fd" : "rgba(124,58,237,0.5)";
        ctx.lineWidth = 3; ctx.setLineDash([8, 6]);
        ctx.beginPath(); ctx.arc(0, 0, m.r + 14, m.t * 2, m.t * 2 + TAU); ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.restore(); ctx.globalAlpha = 1;
    }
  },

  /* ---------- dash: DASHER nâng cấp (§6.3) ----------
     - aim 3 phase màu: vàng mờ → vàng chớp nhanh dần → ĐỎ 0.15s cuối
     - dash giả 30% (wave≥7): hủy sau 0.2s, aim lại hướng mới
     - vệt tàn ảnh 4–5 khi dash */
  dash: {
    init(m, wave) {
      m.state = "stalk"; m.stateT = 0; m.dx = 0; m.dy = 0;
      m.ghosts = []; m.fakeLeft = 0;
    },
    update(m, dt, G) {
      const s = shipOf(G); if (!s) return;
      const wave = G.wave || 1;
      if (m.stunT > 0) { m.stunT -= dt; return; }
      const spd = effSpeed(m, G);
      m.stateT -= dt;
      // Dasher Xuyên Gai (mini-boss ải 2): lao 3 lần chữ Z
      const zig = m.miniboss && m.miniboss.id === "thorn";
      if (m.state === "stalk") {
        const dx = s.x - m.x, dy = s.y - m.y, d = hyp(dx, dy) || 1;
        m.x += dx / d * spd * dt; m.y += dy / d * spd * dt;
        if (d < 260 && m.stateT <= 0) {
          m.state = "aim"; m.stateT = 0.7; m.aimDur = 0.7;
          if (zig && m.zigN == null) m.zigN = 3;
        }
      } else if (m.state === "aim") {
        const dx = s.x - m.x, dy = s.y - m.y, d = hyp(dx, dy) || 1;
        m.dx = dx / d; m.dy = dy / d;
        if (m.stateT <= 0) {
          // dash giả: 30% hủy giữa chừng (sau 0.2s), aim lại
          if (wave >= 7 && !zig && m.fakeLeft <= 0 && Math.random() < 0.3) {
            m.state = "fakedash"; m.stateT = 0.2; m.fakeLeft = 1;
          } else { m.state = "dash"; m.stateT = 0.45; }
          sfx("shoot");
        }
      } else if (m.state === "fakedash") {
        m.x += m.dx * spd * 4.2 * dt; m.y += m.dy * spd * 4.2 * dt;
        if (m.stateT <= 0) { m.state = "aim"; m.stateT = 0.7; m.aimDur = 0.7; }
      } else { // dash
        m.x += m.dx * spd * 4.2 * dt; m.y += m.dy * spd * 4.2 * dt;
        m.ghosts.push({ x: m.x, y: m.y, t: 0.35 });
        if (m.ghosts.length > 5) m.ghosts.shift();
        if (m.stateT <= 0) {
          if (zig && m.zigN > 1) { m.zigN--; m.state = "aim"; m.stateT = 0.5; m.aimDur = 0.5; }
          else { m.state = "stalk"; m.stateT = 1.2; m.zigN = null; }
        }
      }
      for (const gh of m.ghosts) gh.t -= dt;
      m.ghosts = m.ghosts.filter(gh => gh.t > 0);
    },
    draw(m, ctx) {
      // tàn ảnh
      for (const gh of m.ghosts) {
        ctx.save(); ctx.translate(gh.x, gh.y); ctx.globalAlpha = gh.t * 1.2;
        ctx.fillStyle = m.color;
        ctx.beginPath(); ctx.arc(0, 0, m.r * 0.8, 0, TAU); ctx.fill();
        ctx.restore();
      }
      const s = lastG && lastG.ship;
      ctx.save(); ctx.translate(m.x, m.y);
      if (m.flash > 0) ctx.globalAlpha = 0.45;
      // telegraph 3 phase
      if (m.state === "aim" || m.state === "fakedash") {
        const el = (m.aimDur || 0.7) - m.stateT; // thời gian đã aim
        const dur = m.aimDur || 0.7;
        let col, wdt = 3;
        if (el > dur - 0.15) { col = "rgba(255,40,40,0.95)"; wdt = 5; }        // phase 3: ĐỎ
        else if (el > dur * 0.5) { const bl = 0.5 + 0.5 * Math.sin(m.t * 40); col = `rgba(255,225,77,${bl})`; } // phase 2
        else { col = "rgba(255,225,77,0.35)"; }                                 // phase 1
        ctx.strokeStyle = col; ctx.lineWidth = wdt;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(m.dx * 320, m.dy * 320); ctx.stroke();
      }
      const aiming = m.state === "aim" || m.state === "dash" || m.state === "fakedash";
      ctx.rotate(Math.atan2(aiming ? m.dy : (s ? s.y - m.y : 0), aiming ? m.dx : (s ? s.x - m.x : 1)));
      ctx.fillStyle = m.state === "aim" ? "#fff3a0" : (m.slowT > 0 ? "#7dd3fc" : m.color);
      ctx.beginPath();
      ctx.moveTo(m.r + 3, 0); ctx.lineTo(-m.r, -m.r); ctx.lineTo(-m.r * 0.3, 0); ctx.lineTo(-m.r, m.r);
      ctx.closePath(); ctx.fill();
      // giáp gai cam của Dasher Xuyên Gai
      if (m.miniboss && m.miniboss.id === "thorn") {
        ctx.strokeStyle = "#ff9a3d"; ctx.lineWidth = 3;
        for (let i = 0; i < 8; i++) {
          const a = i / 8 * TAU;
          ctx.beginPath(); ctx.moveTo(Math.cos(a) * m.r, Math.sin(a) * m.r);
          ctx.lineTo(Math.cos(a) * (m.r + 7), Math.sin(a) * (m.r + 7)); ctx.stroke();
        }
      }
      ctx.restore(); ctx.globalAlpha = 1;
    }
  },

  /* ---------- split: SPLITTER nâng cấp (§6.3) ----------
     - báo vỡ: máu <50% → phồng to dần + rung
     - tách 3 mini (wave≥8, mini con máu 1) thay vì 2
     - mini con kế thừa knockback của phát kết liễu
     - Splitter Nhiễu (mini-boss ải 4): +1 mini "bóng" (không dmg, 5s) */
  split: {
    init(m, wave) { m.wob = Math.random() * TAU; },
    update(m, dt, G) {
      const s = shipOf(G); if (!s) return;
      if (m.stunT > 0) { m.stunT -= dt; return; }
      chaseShip(m, dt, s, effSpeed(m, G), 20, 3);
    },
    draw(m, ctx) {
      const frac = m.maxHp ? m.hp / m.maxHp : 1;
      const bursting = frac < 0.5;                       // báo vỡ
      const sc = bursting ? 1 + (0.5 - frac) * 0.9 : 1;  // phồng dần
      const jx = bursting ? Math.sin(m.t * 40) * 3 : 0;  // rung
      ctx.save(); ctx.translate(m.x + jx, m.y); ctx.scale(sc, sc);
      if (m.flash > 0) ctx.globalAlpha = 0.45;
      // nửa ẩn nửa hiện của Splitter Nhiễu
      if (m.miniboss && m.miniboss.id === "mirage") ctx.globalAlpha *= 0.55 + 0.35 * Math.sin(m.t * 7);
      ctx.rotate(m.t * 1.2);
      ctx.fillStyle = m.slowT > 0 ? "#7dd3fc" : m.color;
      ctx.beginPath(); ctx.arc(0, 0, m.r, 0, TAU); ctx.fill();
      ctx.strokeStyle = bursting ? "#ff5470" : "#0b3b4a"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-m.r, 0); ctx.lineTo(m.r, 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -m.r); ctx.lineTo(0, m.r); ctx.stroke();
      ctx.restore(); ctx.globalAlpha = 1;
    }
  },

  /* ---------- swarm: MINI nâng cấp (§6.3) ----------
     - nhịp bầy đàn: 3s đuổi → 1s tản ra
     - mini vàng 10% (wave≥9): rớt 2 gem
     - đang slow + trúng thêm đạn băng → vỡ tan (xử lý ở Monsters.onHit) */
  swarm: {
    init(m, wave) {
      m.cycleT = rand(0, 4);
      m.golden = wave >= 9 && Math.random() < 0.1;
      if (m.golden) { m.color = "#fbbf24"; m.gemBonus = 2; }
    },
    update(m, dt, G) {
      const s = shipOf(G); if (!s) return;
      if (m.stunT > 0) { m.stunT -= dt; return; }
      m.cycleT += dt;
      if (m.cycleT > 4) m.cycleT -= 4;
      const spd = effSpeed(m, G);
      if (m.cycleT < 3) { // đuổi
        chaseShip(m, dt, s, spd, 16, 8);
      } else { // tản ra: chạy xa tàu + lệch
        const dx = m.x - s.x, dy = m.y - s.y, d = hyp(dx, dy) || 1;
        const wob = Math.sin(m.t * 9 + m.x * 0.05) * 60;
        m.x += (dx / d * spd + -dy / d * wob) * dt;
        m.y += (dy / d * spd + dx / d * wob) * dt;
      }
      // mini "bóng" của Splitter Nhiễu: không gây dmg, tự tan sau 5s
      if (m.shadow) { m.shadowT = (m.shadowT == null ? 5 : m.shadowT) - dt; if (m.shadowT <= 0) { m.dead = true; puff(m.x, m.y, 8, ["#7df9ff", "#fff"], 120); } }
    },
    draw(m, ctx) {
      const s = lastG && lastG.ship;
      ctx.save(); ctx.translate(m.x, m.y);
      if (m.flash > 0) ctx.globalAlpha = 0.45;
      if (m.shadow) ctx.globalAlpha *= 0.5;
      ctx.rotate(Math.atan2((s ? s.y : 0) - m.y, (s ? s.x : 0) - m.x));
      ctx.fillStyle = m.slowT > 0 ? "#7dd3fc" : m.color;
      ctx.beginPath();
      ctx.moveTo(m.r + 2, 0); ctx.lineTo(-m.r, -m.r * 0.9); ctx.lineTo(-m.r, m.r * 0.9);
      ctx.closePath(); ctx.fill();
      if (m.golden) {
        ctx.strokeStyle = "#fff7ae"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, m.r + 2, 0, TAU); ctx.stroke();
      }
      ctx.restore(); ctx.globalAlpha = 1;
    }
  },

  /* ================= 8 QUÁI MỚI ================= */

  /* ---------- spit: SPITTER "Phun Mã Độc" (bestiary §1.1) ----------
     wander 2.5s (giữ 280–380, strafe) → aim 0.6s (đứng yên, telegraph)
     → volley 3 viên cách nhau 0.12s → cooldown 2.2s.
     Đạn chạm viền → crackEdge. Đạn băng trúng → volley thưa. */
  spit: {
    init(m) { m.state = "wander"; m.stateT = 2.5; m.volleyN = 0; m.volleyT = 0; m.trailT = 0; },
    update(m, dt, G) {
      const s = shipOf(G); if (!s) return;
      if (m.stunT > 0) { m.stunT -= dt; return; }
      const spd = effSpeed(m, G);
      const dx = s.x - m.x, dy = s.y - m.y, d = hyp(dx, dy) || 1;
      m.aimA = Math.atan2(dy, dx);
      m.stateT -= dt;
      if (m.state === "wander") {
        const want = 330, dir = d > want + 50 ? 1 : d < want - 50 ? -1 : 0;
        const strafe = Math.sin(m.t * 2.1 + m.x * 0.01) > 0 ? 1 : -1;
        m.x += (dx / d * dir * spd + -dy / d * strafe * spd * 0.6) * dt;
        m.y += (dy / d * dir * spd + dx / d * strafe * spd * 0.6) * dt;
        if (m.stateT <= 0) { m.state = "aim"; m.stateT = 0.6; }
      } else if (m.state === "aim") {
        if (m.stateT <= 0) { m.state = "volley"; m.volleyN = 3; m.volleyT = 0; }
      } else if (m.state === "volley") {
        const gap = m.slowT > 0 ? 0.24 : 0.12;   // đạn băng → volley thưa
        m.volleyT -= dt;
        if (m.volleyT <= 0 && m.volleyN > 0) {
          m.volleyT = gap; m.volleyN--;
          const a = Math.atan2(dy, dx);
          G.ebullets.push({ x: m.x, y: m.y, vx: Math.cos(a) * 170, vy: Math.sin(a) * 170,
            r: 5, life: 6, from: "spitter", dmg: 1, ice: false });
          puff(m.x, m.y, 4, ["#f43f5e", "#fff"], 120); sfx("shoot");
        }
        if (m.volleyN <= 0) { m.state = "cooldown"; m.stateT = 2.2; }
      } else { // cooldown
        const strafe = Math.sin(m.t * 2.1) > 0 ? 1 : -1; // vẫn strafe nhẹ
        m.x += (-dy / d * strafe * spd * 0.4) * dt;
        m.y += (dx / d * strafe * spd * 0.4) * dt;
        if (m.stateT <= 0) { m.state = "wander"; m.stateT = 2.5; }
      }
      // vệt đuôi hạt đỏ
      m.trailT -= dt;
      if (m.trailT <= 0) { m.trailT = 0.2; puff(m.x, m.y, 1, ["#f43f5e"], 40); }
    },
    draw(m, ctx) {
      ctx.save(); ctx.translate(m.x, m.y);
      if (m.flash > 0) ctx.globalAlpha = 0.45;
      ctx.rotate(m.aimA || 0);
      const aiming = m.state === "aim";
      // thân hình thoi
      ctx.fillStyle = m.slowT > 0 ? "#7dd3fc" : m.color;
      ctx.beginPath();
      ctx.moveTo(m.r + 2, 0); ctx.lineTo(0, -m.r * 0.75); ctx.lineTo(-m.r - 2, 0); ctx.lineTo(0, m.r * 0.75);
      ctx.closePath(); ctx.fill();
      // họng súng: sáng dần sang trắng khi aim
      const glow = aiming ? clamp(1 - m.stateT / 0.6, 0, 1) : 0;
      ctx.fillStyle = aiming ? `rgb(255,${Math.floor(255 * (1 - glow))},${Math.floor(255 * (1 - glow))})` : "#7f1d1d";
      ctx.beginPath();
      ctx.moveTo(m.r + 10, -5); ctx.lineTo(m.r + 10, 5); ctx.lineTo(m.r + 2, 0);
      ctx.closePath(); ctx.fill();
      // telegraph: 3 chấm đỏ xếp hàng trước mặt khi aim (≥0.5s ✓)
      if (aiming) {
        ctx.fillStyle = `rgba(255,60,60,${0.4 + 0.6 * glow})`;
        for (let i = 1; i <= 3; i++) {
          ctx.beginPath(); ctx.arc(m.r + 12 + i * 14, 0, 3.5, 0, TAU); ctx.fill();
        }
      }
      ctx.restore(); ctx.globalAlpha = 1;
    }
  },

  /* ---------- aura: BOOSTER "Khuếch Đại Lỗi" (bestiary §1.2) ----------
     reposition (giữ ~300 tàu, nấp sau lưng đồng loại) + aura passive.
     Buff áp qua Monsters.tickAura (tick 0.25s). Đạn băng → aura tắt 3s. */
  aura: {
    init(m) { m.pulseT = 0; m.auraOffT = 0; },
    update(m, dt, G) {
      const s = shipOf(G); if (!s) return;
      if (m.stunT > 0) { m.stunT -= dt; return; }
      const spd = effSpeed(m, G);
      // tìm đồng loại gần nhất (tank/warden/chewer...) để nấp sau lưng
      let ally = null, bd = Infinity;
      for (const o of G.enemies) {
        if (o === m || o.dead || o.behavior === "aura" || o.behavior === "flee") continue;
        const d2 = (o.x - m.x) * (o.x - m.x) + (o.y - m.y) * (o.y - m.y);
        if (d2 < bd) { bd = d2; ally = o; }
      }
      let tx, ty;
      if (ally) { // vị trí sau lưng đồng loại (phía đối diện tàu)
        const ax = ally.x - s.x, ay = ally.y - s.y, ad = hyp(ax, ay) || 1;
        tx = ally.x + ax / ad * 90; ty = ally.y + ay / ad * 90;
      } else { // giữ khoảng cách ~300 với tàu
        const dx = m.x - s.x, dy = m.y - s.y, d = hyp(dx, dy) || 1;
        tx = s.x + dx / d * 300; ty = s.y + dy / d * 300;
      }
      const mx = tx - m.x, my = ty - m.y, md = hyp(mx, my) || 1;
      if (md > 20) { m.x += mx / md * spd * dt; m.y += my / md * spd * dt; }
      m.pulseT -= dt;
      if (m.pulseT <= 0) { m.pulseT = 1; m.pulse = 1; } // xung visual mỗi 1s
      m.pulse = Math.max(0, (m.pulse || 0) - dt * 2);
      m.auraOffT = Math.max(0, m.auraOffT - dt);
    },
    draw(m, ctx) {
      ctx.save(); ctx.translate(m.x, m.y);
      if (m.flash > 0) ctx.globalAlpha = 0.45;
      const off = m.auraOffT > 0;
      // vòng aura r220 nét đứt
      ctx.strokeStyle = off ? "rgba(125,211,252,0.4)" : "rgba(34,197,94,0.35)";
      ctx.lineWidth = 2; ctx.setLineDash([10, 8]);
      ctx.beginPath(); ctx.arc(0, 0, 220, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
      // xung lan ra mỗi 1s
      if (m.pulse > 0 && !off) {
        ctx.strokeStyle = `rgba(34,197,94,${m.pulse * 0.5})`; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(0, 0, 220 * (1 - m.pulse) + 20, 0, TAU); ctx.stroke();
      }
      if (off) { // icon ❄ ngắt khuếch đại
        ctx.fillStyle = "#7dd3fc"; ctx.font = "16px sans-serif"; ctx.textAlign = "center";
        ctx.fillText("❄", 0, -m.r - 12);
      }
      // sao 5 cánh xoay chậm
      ctx.rotate(m.t * 0.6);
      ctx.fillStyle = m.slowT > 0 ? "#7dd3fc" : m.color;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = i / 10 * TAU - Math.PI / 2, rr = i % 2 === 0 ? m.r : m.r * 0.45;
        ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.closePath(); ctx.fill();
      ctx.restore(); ctx.globalAlpha = 1;
    }
  },

  /* ---------- kamikaze: BOMBER "Liều Chết Cảm Tử" (bestiary §1.3) ----------
     seek (bay vào tàu, <70 → fuse) → fuse 0.7s (đứng yên, telegraph r100)
     → explode (1 dmg AoE r100 + knockback; gần viền <120 → crackEdge).
     Chết trong fuse VẪN NỔ (coordinator gọi Monsters.bomberOnDeath). */
  kamikaze: {
    init(m) { m.fuseT = -1; },
    update(m, dt, G) {
      const s = shipOf(G); if (!s) return;
      if (m.stunT > 0 && m.fuseT < 0) { m.stunT -= dt; return; }
      if (m.fuseT >= 0) {
        m.fuseT -= dt;
        if (Math.random() < 0.5) puff(m.x + rand(-8, 8), m.y + rand(-8, 8), 2, ["#ef4444", "#fff"], 120);
        if (m.fuseT <= 0) Monsters.detonate(m, G);
        return;
      }
      const dx = s.x - m.x, dy = s.y - m.y, d = hyp(dx, dy) || 1;
      const spd = effSpeed(m, G) * (m.slowT > 0 ? 1 : 1);
      if (d < 70) {
        m.fuseT = m.slowT > 0 ? 1.2 : 0.7;  // đạn băng kéo dài fuse +0.5s
        float(m.x, m.y - 22, "SẮP NỔ!", "#ef4444"); sfx("shrink");
      } else {
        const wob = Math.sin(m.t * 5) * 30;
        m.x += (dx / d * spd + -dy / d * wob) * dt;
        m.y += (dy / d * spd + dx / d * wob) * dt;
      }
    },
    draw(m, ctx) {
      const armed = m.fuseT >= 0;
      const fuseFrac = armed ? clamp(1 - m.fuseT / 0.7, 0, 1) : 0;
      ctx.save(); ctx.translate(m.x, m.y);
      if (armed) { // rung + phình 1→1.4×
        ctx.translate(rand(-3, 3) * fuseFrac, rand(-3, 3) * fuseFrac);
        ctx.scale(1 + 0.4 * fuseFrac, 1 + 0.4 * fuseFrac);
        // blast radius telegraph r100
        ctx.strokeStyle = `rgba(239,68,68,${0.25 + 0.55 * fuseFrac})`;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(0, 0, 100, 0, TAU); ctx.stroke();
      }
      if (m.flash > 0) ctx.globalAlpha = 0.45;
      // lõi trắng chớp nhanh dần khi fuse
      const blink = armed && Math.floor(m.t * (10 + 30 * fuseFrac)) % 2 === 0;
      ctx.fillStyle = blink ? "#ffffff" : (m.slowT > 0 ? "#7dd3fc" : m.color);
      ctx.beginPath(); ctx.arc(0, 0, m.r, 0, TAU); ctx.fill();
      ctx.fillStyle = "#7f1d1d";
      ctx.beginPath(); ctx.arc(0, 0, m.r * 0.45, 0, TAU); ctx.fill();
      if (armed) {
        ctx.fillStyle = "#ef4444"; ctx.font = "bold 14px sans-serif"; ctx.textAlign = "center";
        ctx.fillText("!", 0, -m.r - 8);
      }
      ctx.restore(); ctx.globalAlpha = 1;
    }
  },

  /* ---------- ice: FREEZER "Đóng Băng Hệ Thống" (bestiary §1.4) ----------
     drift (~260) + aim_ice mỗi 3s (telegraph 0.5s → đạn băng slow 50%/2.5s)
     + frost mỗi 7s (viền gần nhất, telegraph 0.8s → băng viền 8s). */
  ice: {
    init(m) { m.iceT = 2; m.frostT = 4; m.aimIceT = -1; m.frostWarnT = -1; m.frostEdge = null; },
    update(m, dt, G) {
      const s = shipOf(G); if (!s) return;
      if (m.stunT > 0) { m.stunT -= dt; return; }
      const spd = effSpeed(m, G);
      const dx = s.x - m.x, dy = s.y - m.y, d = hyp(dx, dy) || 1;
      // drift: lượn vòng quanh tàu ở ~260
      const want = 260, dir = d > want + 40 ? 1 : d < want - 40 ? -1 : 0;
      const orb = Math.sin(m.t * 1.4) > 0 ? 1 : -1;
      m.x += (dx / d * dir * spd + -dy / d * orb * spd * 0.7) * dt;
      m.y += (dy / d * dir * spd + dx / d * orb * spd * 0.7) * dt;
      // aim_ice mỗi 3s
      m.iceT -= dt;
      if (m.iceT <= 0 && m.aimIceT < 0) { m.aimIceT = 0.5; sfx("shoot"); }
      if (m.aimIceT >= 0) {
        m.aimIceT -= dt;
        if (m.aimIceT < 0) {
          m.iceT = 3;
          const a = Math.atan2(dy, dx);
          G.ebullets.push({ x: m.x, y: m.y, vx: Math.cos(a) * 140, vy: Math.sin(a) * 140,
            r: 6, life: 7, from: "freezer", dmg: 0, ice: true, slow: 2.5 });
          puff(m.x, m.y, 6, ["#38bdf8", "#e0f2fe"], 130); sfx("shoot");
        }
      }
      // frost mỗi 7s: đóng băng viền gần nhất 8s
      m.frostT -= dt;
      if (m.frostT <= 0 && m.frostWarnT < 0) {
        const b = boundsOf();
        const p = edgePoint(m.x, m.y, b);
        m.frostEdge = p.edge; m.frostWarnT = 0.8;
        float(clamp(m.x, b.x + 60, b.x + b.w - 60), clamp(m.y, b.y + 30, b.y + b.h - 10),
          "❄ Sắp đóng băng!", "#38bdf8");
        sfx("shrink");
      }
      if (m.frostWarnT >= 0) {
        m.frostWarnT -= dt;
        if (m.frostWarnT < 0) {
          m.frostT = 7;
          Monsters.freezeEdge(m.frostEdge, 8, G);
          float(s.x, s.y - 44, "Viền bị đóng băng! Bắn thẳng vào chewer!", "#38bdf8", true);
        }
      }
    },
    draw(m, ctx) {
      ctx.save(); ctx.translate(m.x, m.y);
      if (m.flash > 0) ctx.globalAlpha = 0.45;
      const charging = m.aimIceT >= 0;
      ctx.rotate(m.t * 0.8);
      // bông tuyết 6 cánh
      ctx.strokeStyle = charging ? "#ffffff" : (m.slowT > 0 ? "#7dd3fc" : "#38bdf8");
      ctx.lineWidth = 3;
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * TAU;
        ctx.beginPath(); ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * m.r, Math.sin(a) * m.r); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * m.r * 0.6, Math.sin(a) * m.r * 0.6);
        ctx.lineTo(Math.cos(a + 0.4) * m.r * 0.85, Math.sin(a + 0.4) * m.r * 0.85);
        ctx.moveTo(Math.cos(a) * m.r * 0.6, Math.sin(a) * m.r * 0.6);
        ctx.lineTo(Math.cos(a - 0.4) * m.r * 0.85, Math.sin(a - 0.4) * m.r * 0.85);
        ctx.stroke();
      }
      ctx.fillStyle = "#e0f2fe";
      ctx.beginPath(); ctx.arc(0, 0, m.r * 0.3, 0, TAU); ctx.fill();
      // hạt băng tụ về tâm khi aim
      if (charging) {
        ctx.fillStyle = "rgba(224,242,254,0.8)";
        for (let i = 0; i < 6; i++) {
          const a = i / 6 * TAU + m.t * 3, rr = m.r * (0.5 + m.aimIceT);
          ctx.beginPath(); ctx.arc(Math.cos(a) * rr, Math.sin(a) * rr, 2.5, 0, TAU); ctx.fill();
        }
      }
      ctx.restore(); ctx.globalAlpha = 1;
    }
  },

  /* ---------- mirror: WARDEN "Giáp Gương" (bestiary §1.5) ----------
     advance (mặt gương hướng tàu, xoay 90°/s) + guard (chắn cho chewer).
     Đạn trúng mặt trước (±60°) → PHẢN XẠ (xử lý ở Monsters.onHit);
     hông/sau → ×1.5 dmg. Knockback đầy đủ mọi hướng. */
  mirror: {
    init(m, wave, G) {
      const s = shipOf(G);
      m.faceAngle = s ? Math.atan2(s.y - m.y, s.x - m.x) : 0;
      m.reflectFx = null;
    },
    update(m, dt, G) {
      const s = shipOf(G); if (!s) return;
      if (m.stunT > 0) { m.stunT -= dt; return; }
      const spd = effSpeed(m, G);
      // guard: có chewer đang gặm trong 150px → chắn giữa tàu và chewer
      let guardT = null, bd = Infinity;
      for (const o of G.enemies) {
        if (o === m || o.dead || o.behavior !== "chew" || !o.latched) continue;
        const d2 = (o.x - m.x) * (o.x - m.x) + (o.y - m.y) * (o.y - m.y);
        if (d2 < bd) { bd = d2; guardT = o; }
      }
      let tx = s.x, ty = s.y, faceTx = s.x, faceTy = s.y;
      if (guardT && bd < 150 * 150) {
        tx = (s.x + guardT.x) / 2; ty = (s.y + guardT.y) / 2; // chắn giữa
      }
      const dx = tx - m.x, dy = ty - m.y, d = hyp(dx, dy) || 1;
      if (d > 30) { m.x += dx / d * spd * dt; m.y += dy / d * spd * dt; }
      // mặt gương xoay về tàu, tối đa 90°/s (điểm yếu)
      const want = Math.atan2(faceTy - m.y, faceTx - m.x);
      const diff = angDiff(want, m.faceAngle);
      const maxTurn = Math.PI / 2 * dt;
      m.faceAngle += clamp(diff, -maxTurn, maxTurn);
      if (m.reflectFx) { m.reflectFx.t -= dt; if (m.reflectFx.t <= 0) m.reflectFx = null; }
    },
    draw(m, ctx) {
      ctx.save(); ctx.translate(m.x, m.y);
      if (m.flash > 0) ctx.globalAlpha = 0.45;
      ctx.rotate(m.faceAngle);
      // ngũ giác bạc
      ctx.fillStyle = m.slowT > 0 ? "#7dd3fc" : m.color;
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = i / 5 * TAU - Math.PI / 2;
        ctx.lineTo(Math.cos(a) * m.r, Math.sin(a) * m.r);
      }
      ctx.closePath(); ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = "#64748b"; ctx.stroke();
      // mặt gương: đường chéo bóng loáng phía trước
      ctx.strokeStyle = "rgba(255,255,255,0.9)"; ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(Math.cos(-0.5) * m.r * 0.9, Math.sin(-0.5) * m.r * 0.9);
      ctx.lineTo(Math.cos(0.5) * m.r * 0.9, Math.sin(0.5) * m.r * 0.9);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.4)"; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(-0.9) * m.r * 0.7, Math.sin(-0.9) * m.r * 0.7);
      ctx.lineTo(Math.cos(0.9) * m.r * 0.7, Math.sin(0.9) * m.r * 0.7);
      ctx.stroke();
      ctx.restore();
      // chớp sáng khi phản xạ thành công
      if (m.reflectFx) {
        ctx.save(); ctx.translate(m.x, m.y); ctx.globalAlpha = m.reflectFx.t * 4;
        ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(0, 0, m.r + 6, 0, TAU); ctx.stroke();
        // tia phản xạ ngắn
        ctx.strokeStyle = "rgba(255,255,255,0.8)"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(m.reflectFx.ang) * 90, Math.sin(m.reflectFx.ang) * 90); ctx.stroke();
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }
  },

  /* ---------- flee: GLIMMER "Đom Đóm Vàng" (bestiary §1.6) ----------
     bonus chạy trốn: flee khỏi tàu → chạm viền = escape (mất thưởng +
     để lại khe hở 5s). Máu 2 cố định, sống tối đa 12s. */
  flee: {
    init(m) { m.life = 12; m.sparkT = 0; m.escaped = false; },
    update(m, dt, G) {
      const s = shipOf(G); if (!s) return;
      m.life -= dt;
      if (m.life <= 0) { m.dead = true; return; } // hết giờ → tan biến lặng
      const b = boundsOf();
      // chạy KHỎI tàu, nhắm viền gần nhất
      const dx = m.x - s.x, dy = m.y - s.y, d = hyp(dx, dy) || 1;
      const spd = effSpeed(m, G);
      const wob = Math.sin(m.t * 4) * 40;
      m.x += (dx / d * spd + -dy / d * wob) * dt;
      m.y += (dy / d * spd + dx / d * wob) * dt;
      m.x = clamp(m.x, b.x + 6, b.x + b.w - 6);
      m.y = clamp(m.y, b.y + 6, b.y + b.h - 6);
      // chạm viền → chui qua khe, để lại windowGap 5s
      const p = edgePoint(m.x, m.y, b);
      const ed = Math.min(m.x - b.x, b.x + b.w - m.x, m.y - b.y, b.y + b.h - m.y);
      if (ed < 14 && !m.escaped) {
        m.escaped = true; m.dead = true;
        Monsters.addWindowGap(p.edge, 5, G);
        float(m.x, m.y - 18, "Mất rồi...", "#fbbf24");
        puff(m.x, m.y, 10, ["#fbbf24", "#fff7ae"], 140);
        sfx("shrink");
      }
      // hạt vàng rơi
      m.sparkT -= dt;
      if (m.sparkT <= 0) { m.sparkT = 0.15; puff(m.x, m.y + 6, 1, ["#fbbf24"], 30); }
    },
    draw(m, ctx) {
      ctx.save(); ctx.translate(m.x, m.y);
      if (m.flash > 0) ctx.globalAlpha = 0.45;
      // quầng sáng
      const pulse = 1 + Math.sin(m.t * 8) * 0.15;
      ctx.fillStyle = "rgba(251,191,36,0.18)";
      ctx.beginPath(); ctx.arc(0, 0, m.r * 2.4 * pulse, 0, TAU); ctx.fill();
      // sao 4 cánh
      ctx.scale(pulse, pulse);
      ctx.fillStyle = m.slowT > 0 ? "#7dd3fc" : m.color;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * TAU, rr = i % 2 === 0 ? m.r : m.r * 0.35;
        ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#fff7ae";
      ctx.beginPath(); ctx.arc(0, 0, m.r * 0.25, 0, TAU); ctx.fill();
      ctx.restore(); ctx.globalAlpha = 1;
    }
  },

  /* ---------- cloak: PHANTOM "Bóng Ma Ẩn" (bestiary §1.7) ----------
     visible 0.6s (đứng yên, mắt đỏ) → hidden 1.8s (alpha 0.15, tốc 150).
     Ẩn mà chạm viền → telegraph 0.5s → rạch 2 vết nứt, hiện hình, CD 10s.
     Đạn băng → revealT=3 (hiện hình, tốc -50%). */
  cloak: {
    init(m) { m.state = "visible"; m.stateT = 0.6; m.slashCD = 0; m.slashT = -1; m.revealT = 0; },
    update(m, dt, G) {
      const s = shipOf(G); if (!s) return;
      if (m.stunT > 0) { m.stunT -= dt; return; }
      const b = boundsOf();
      m.slashCD = Math.max(0, m.slashCD - dt);
      m.revealT = Math.max(0, (m.revealT || 0) - dt);
      const revealed = m.revealT > 0;
      if (m.slashT >= 0) { // đang telegraph rạch viền
        m.slashT -= dt;
        if (Math.random() < 0.6) puff(m.x + rand(-14, 14), m.y + rand(-14, 14), 2, ["#a78bfa", "#7c3aed"], 80);
        if (m.slashT < 0) {
          const p = edgePoint(m.x, m.y, b);
          Monsters.crackEdge(p.edge, G, b); Monsters.crackEdge(p.edge, G, b); // rạch 2 vết
          m.state = "visible"; m.stateT = 0.6; m.slashCD = 10;
          float(m.x, m.y - 20, "Viền bị rạch!", "#a78bfa", true);
          shake(4, 250, 5); sfx("crack");
        }
        return;
      }
      m.stateT -= dt;
      if (m.state === "visible") {
        if (m.stateT <= 0) { m.state = "hidden"; m.stateT = 1.8; }
      } else { // hidden: lao nhanh về tàu
        const dx = s.x - m.x, dy = s.y - m.y, d = hyp(dx, dy) || 1;
        const spd = revealed ? effSpeed(m, G) * 0.5 : 150 * diffOf(G).spM;
        m.x += dx / d * spd * dt; m.y += dy / d * spd * dt;
        if (m.stateT <= 0) { m.state = "visible"; m.stateT = 0.6; }
        // chạm viền lúc ẩn → rạch
        const p = edgePoint(m.x, m.y, b);
        const ed = Math.min(m.x - b.x, b.x + b.w - m.x, m.y - b.y, b.y + b.h - m.y);
        if (ed < 24 && m.slashCD <= 0 && !revealed) {
          m.slashT = 0.5;
          float(m.x, m.y - 20, "⚠ Bóng ma rạch viền!", "#a78bfa");
          sfx("shrink");
        }
      }
      // hạt nhiễu tím khi ẩn
      if (m.state === "hidden" && !revealed && Math.random() < 0.3)
        puff(m.x + rand(-10, 10), m.y + rand(-10, 10), 1, ["#a78bfa"], 40);
    },
    draw(m, ctx) {
      const revealed = m.revealT > 0;
      const hidden = m.state === "hidden" && !revealed && m.slashT < 0;
      ctx.save(); ctx.translate(m.x, m.y);
      if (m.flash > 0) ctx.globalAlpha = 0.45;
      else if (hidden) ctx.globalAlpha = 0.15;
      // blob méo 8 điểm sin
      ctx.fillStyle = m.slowT > 0 ? "#7dd3fc" : m.color;
      ctx.beginPath();
      for (let i = 0; i <= 8; i++) {
        const a = i / 8 * TAU;
        const rr = m.r * (1 + 0.18 * Math.sin(a * 3 + m.t * 5));
        const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.fill();
      // mắt đỏ: sáng dần khi visible (telegraph cho đợt áp sát)
      if (!hidden || revealed) {
        const eyeGlow = m.state === "visible" ? clamp(1 - m.stateT / 0.6, 0.2, 1) : 1;
        ctx.fillStyle = `rgba(255,84,112,${eyeGlow})`;
        ctx.beginPath(); ctx.arc(-4, -2, 2.6, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(4, -2, 2.6, 0, TAU); ctx.fill();
      }
      // telegraph rạch: hạt tụ dọc viền
      if (m.slashT >= 0) {
        ctx.globalAlpha = 1;
        ctx.strokeStyle = `rgba(167,139,250,${0.5 + 0.5 * Math.sin(m.t * 30)})`;
        ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
        ctx.beginPath(); ctx.arc(0, 0, m.r + 10, 0, TAU); ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.restore(); ctx.globalAlpha = 1;
    }
  },

  /* ---------- lay: BROODMOTHER "Ổ Lỗi Sinh Sản" (bestiary §1.8) ----------
     lumber (không lại gần viền <100px) + lay mỗi 4s (telegraph 0.8s),
     tối đa 4 trứng sống. Trứng dính viền (<40px) → nở thành chewer. */
  lay: {
    init(m) { m.layT = 2.5; m.layWarnT = -1; m.spots = []; for (let i = 0; i < 6; i++) m.spots.push(rand(0, TAU)); },
    update(m, dt, G) {
      const s = shipOf(G); if (!s) return;
      if (m.stunT > 0) { m.stunT -= dt; return; }
      const b = boundsOf();
      const spd = effSpeed(m, G);
      if (m.layWarnT < 0) {
        // lumber về phía tàu nhưng DỪNG ở cách viền ≥100px
        const dx = s.x - m.x, dy = s.y - m.y, d = hyp(dx, dy) || 1;
        let nx = m.x + dx / d * spd * dt, ny = m.y + dy / d * spd * dt;
        const ed = Math.min(nx - b.x, b.x + b.w - nx, ny - b.y, b.y + b.h - ny);
        if (ed >= 100) { m.x = nx; m.y = ny; }
        else { // trượt song song viền
          m.x += -dy / d * spd * 0.6 * dt; m.y += dx / d * spd * 0.6 * dt;
          m.x = clamp(m.x, b.x + 100, b.x + b.w - 100);
          m.y = clamp(m.y, b.y + 100, b.y + b.h - 100);
        }
        m.layT -= dt;
        if (m.layT <= 0) {
          // đếm trứng sống của mẹ này
          let eggs = 0;
          for (const o of G.enemies) if (!o.dead && o.behavior === "egg" && o.mother === m) eggs++;
          if (eggs < 4) { m.layWarnT = 0.8; sfx("shrink"); }
          else m.layT = 1; // đợi slot trống
        }
      } else {
        m.layWarnT -= dt;
        if (m.layWarnT < 0) {
          m.layT = 4;
          const a = rand(0, TAU), rr = rand(20, 50);
          const ex = clamp(m.x + Math.cos(a) * rr, b.x + 20, b.x + b.w - 20);
          const ey = clamp(m.y + Math.sin(a) * rr, b.y + 20, b.y + b.h - 20);
          const egg = Monsters.makeEnemy("egg", G.wave || 1, diffOf(G), ex, ey);
          if (egg) {
            egg.mother = m;
            const p = edgePoint(ex, ey, b);
            const ed = Math.min(ex - b.x, b.x + b.w - ex, ey - b.y, b.y + b.h - ey);
            if (ed < 40) { // trứng dính viền
              egg.edgeEgg = true; egg.latchedEdge = p.edge; egg.x = p.x; egg.y = p.y;
              float(ex, ey - 14, "⚠ Trứng dính viền!", "#fbbf24");
            }
            G.enemies.push(egg);
            puff(ex, ey, 8, ["#16a34a", "#fbbf24"], 120);
          }
        }
      }
    },
    draw(m, ctx) {
      const warning = m.layWarnT >= 0;
      ctx.save(); ctx.translate(m.x, m.y);
      if (warning) ctx.translate(rand(-2, 2), rand(-2, 2)); // rung khi sắp đẻ
      if (m.flash > 0) ctx.globalAlpha = 0.45;
      // thân tròn to
      ctx.fillStyle = m.slowT > 0 ? "#7dd3fc" : m.color;
      ctx.beginPath(); ctx.arc(0, 0, m.r, 0, TAU); ctx.fill();
      ctx.strokeStyle = "#14532d"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, m.r, 0, TAU); ctx.stroke();
      // đốm trứng phập phồng, sáng trắng khi telegraph
      for (let i = 0; i < m.spots.length; i++) {
        const a = m.spots[i] + m.t * 0.3;
        const rr = m.r * 0.55;
        const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
        const pr = 4 + Math.sin(m.t * 6 + i) * 1.5;
        ctx.fillStyle = warning ? "#ffffff" : "#fbbf24";
        ctx.beginPath(); ctx.arc(px, py, pr, 0, TAU); ctx.fill();
      }
      ctx.restore(); ctx.globalAlpha = 1;
    }
  },

  /* ---------- egg: TRỨNG LỖI (entity riêng của broodmother) ----------
     r8, máu 1, nở sau 5s (vỏ nứt 3 nấc). Dính viền → nở thành chewer bám ngay. */
  egg: {
    init(m) { m.hatchT = 5; m.maxHatch = 5; },
    update(m, dt, G) {
      m.hatchT -= dt;
      if (m.hatchT <= 0 && !m.dead) {
        m.dead = true;
        let type = "mini";
        if (m.edgeEgg) type = "chewer";
        else type = Math.random() < 0.7 ? "mini" : "chaser";
        puff(m.x, m.y, 12, ["#bbf7d0", "#fbbf24", "#fff"], 160);
        sfx("boom");
        // nở qua spawnEnemyAt của game nếu có, không thì đánh dấu để coordinator xử lý
        const spawner = gf("spawnEnemyAt");
        if (typeof spawner === "function") {
          const e = spawner(type, m.x, m.y);
          if (e && m.edgeEgg) { e.latched = m.latchedEdge; }
        } else { m.hatchReq = { type, x: m.x, y: m.y, edge: m.latchedEdge || null }; }
      }
    },
    draw(m, ctx) {
      ctx.save(); ctx.translate(m.x, m.y);
      if (m.flash > 0) ctx.globalAlpha = 0.45;
      const frac = 1 - m.hatchT / m.maxHatch; // 0→1
      // vỏ trứng
      ctx.fillStyle = m.slowT > 0 ? "#7dd3fc" : "#bbf7d0";
      ctx.beginPath(); ctx.ellipse(0, 0, m.r, m.r * 1.25, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = "#16a34a"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(0, 0, m.r, m.r * 1.25, 0, 0, TAU); ctx.stroke();
      // nứt 3 nấc theo thời gian
      ctx.strokeStyle = "#14532d"; ctx.lineWidth = 1.5;
      const cracks = frac > 0.66 ? 3 : frac > 0.33 ? 2 : frac > 0.1 ? 1 : 0;
      for (let i = 0; i < cracks; i++) {
        ctx.beginPath();
        ctx.moveTo(-4 + i * 4, -m.r * 1.1);
        ctx.lineTo(-2 + i * 4, -2); ctx.lineTo(-5 + i * 4, 4);
        ctx.stroke();
      }
      if (m.edgeEgg) { // đánh dấu trứng dính viền
        ctx.fillStyle = "#ff5470"; ctx.font = "11px sans-serif"; ctx.textAlign = "center";
        ctx.fillText("⚠", 0, -m.r - 8);
      }
      ctx.restore(); ctx.globalAlpha = 1;
    }
  },
};

/* =====================================================================
   CƠ CHẾ CỬA SỔ MỚI (§6.1)
   - G.edgeCracks: {left:0,...} — số vết nứt/viền (tối đa 3)
   - G.edgeCrackPos: {left:[{x,y}],...} — vị trí vẽ zigzag
   - G.frozenEdges: {left:0,...} — giây còn lại của băng viền
   - G.windowGaps: {left:0,...} — giây còn lại của khe hở (Đom Đóm)
   ===================================================================== */
function ensureEdgeState(G) {
  if (!G.edgeCracks) {
    G.edgeCracks = { left: 0, right: 0, top: 0, bottom: 0 };
    G.edgeCrackPos = { left: [], right: [], top: [], bottom: [] };
    G.frozenEdges = { left: 0, right: 0, top: 0, bottom: 0 };
    G.windowGaps = { left: 0, right: 0, top: 0, bottom: 0 };
    G.debuted = {}; G.debutWave = -1; G.crackWarned = false; G.freezeWarned = false;
  }
  return G;
}
function crackEdge(edge, G, b) {
  G = ensureEdgeState(G || lastG || {});
  if (!EDGES.includes(edge)) return 0;
  if (G.edgeCracks[edge] >= 3) return G.edgeCracks[edge];
  G.edgeCracks[edge]++;
  b = boundsOf(b);
  // vị trí zigzag ngẫu nhiên dọc viền
  const horiz = edge === "top" || edge === "bottom";
  const t = Math.random();
  const pos = horiz
    ? { x: b.x + t * b.w, y: edge === "top" ? b.y + 6 : b.y + b.h - 6 }
    : { x: edge === "left" ? b.x + 6 : b.x + b.w - 6, y: b.y + t * b.h };
  G.edgeCrackPos[edge].push(pos);
  if (!G.crackWarned) {
    G.crackWarned = true;
    float(pos.x, pos.y - 18, Monsters.t("edge.crackWarn"), "#7c3aed", true);
  }
  sfx("crack");
  puff(pos.x, pos.y, 8, ["#7c3aed", "#c084fc"], 150);
  return G.edgeCracks[edge];
}
/* lượng gặm thực tế tại viền (mỗi vết +25%) */
function chewAmount(edge, basePx, G) {
  G = ensureEdgeState(G || lastG || {});
  const n = (G.edgeCracks && G.edgeCracks[edge]) || 0;
  return basePx * (1 + 0.25 * n);
}
/* viền băng có miễn hất văng không? */
function canKnock(e, G) {
  G = ensureEdgeState(G || lastG || {});
  if (e.latched && G.frozenEdges[e.latched] > 0) return false; // ❄ miễn hất
  return true;
}
/* hất chewer khỏi viền: xử lý grip elite + choáng 1.5s + mini-boss ải 1 */
function knockChew(e, G) {
  if (!canKnock(e, G)) return "frozen";
  if ((e.grip || 1) > 1) { e.grip--; float(e.x, e.y - 20, "Cần thêm 1 phát!", "#c084fc"); return "grip"; }
  const b = boundsOf(), p = edgePoint(e.x, e.y, b);
  e.latched = null; e.chewT = 0; e.stunT = 1.5; e.warnSfx = false;
  e.x = p.x - p.dx * 70; e.y = p.y - p.dy * 70;
  puff(e.x, e.y, 10, ["#c084fc", "#fff"], 220);
  float(e.x, e.y - 20, "Hất văng!", "#c084fc");
  // Chewer Cổ Đại (mini-boss ải 1): bị hất lần đầu → tách 2 chewer thường
  if (e.miniboss && e.miniboss.id === "ancient" && !e.splitDone) {
    e.splitDone = true;
    const spawner = gf("spawnEnemyAt");
    for (let i = 0; i < 2; i++) {
      if (typeof spawner === "function") spawner("chewer", e.x + rand(-30, 30), e.y + rand(-30, 30));
      else if (lastG) lastG.enemies.push(Monsters.makeEnemy("chewer", lastG.wave || 1, diffOf(lastG), e.x + rand(-30, 30), e.y + rand(-30, 30)));
    }
    float(e.x, e.y - 40, "Tách đôi!", "#c084fc", true);
  }
  return "knocked";
}
function freezeEdge(edge, secs, G) {
  G = ensureEdgeState(G || lastG || {});
  if (!EDGES.includes(edge)) return;
  G.frozenEdges[edge] = Math.max(G.frozenEdges[edge], secs || 8);
  if (!G.freezeWarned) { G.freezeWarned = true; }
  sfx("shrink");
}
function addWindowGap(edge, secs, G) {
  G = ensureEdgeState(G || lastG || {});
  if (!EDGES.includes(edge)) return;
  G.windowGaps[edge] = Math.max(G.windowGaps[edge], secs || 5);
}
/* đếm ngược frozenEdges/windowGaps mỗi frame — coordinator gọi trong update */
function tickEdges(dt, G) {
  G = ensureEdgeState(G || lastG || {});
  for (const e of EDGES) {
    if (G.frozenEdges[e] > 0) G.frozenEdges[e] = Math.max(0, G.frozenEdges[e] - dt);
    if (G.windowGaps[e] > 0) G.windowGaps[e] = Math.max(0, G.windowGaps[e] - dt);
  }
}
/* vá toàn bộ vết nứt khi wave clear */
function clearEdges(G) {
  G = ensureEdgeState(G || lastG || {});
  G.edgeCracks = { left: 0, right: 0, top: 0, bottom: 0 };
  G.edgeCrackPos = { left: [], right: [], top: [], bottom: [] };
  G.frozenEdges = { left: 0, right: 0, top: 0, bottom: 0 };
  G.crackWarned = false; G.freezeWarned = false;
  G.debutWave = -1;
}
/* hook vào shrinkWindow: khe hở → lần shrink tiếp tại viền đó +10px */
function shrinkHook(edge, dw, dh, G) {
  G = ensureEdgeState(G || lastG || {});
  let ndw = dw, ndh = dh;
  if (edge && G.windowGaps[edge] > 0) {
    G.windowGaps[edge] = 0; // khe hở dùng 1 lần
    if (edge === "left" || edge === "right") ndw += 10; else ndh += 10;
  }
  return { dw: ndw, dh: ndh };
}
/* vẽ hiệu ứng viền: nứt zigzag tím / băng xanh + ❄ / khe hở tím mờ */
function drawEdgeFx(ctx, b, G) {
  G = ensureEdgeState(G || lastG || {});
  b = boundsOf(b);
  ctx.save();
  // vết nứt: zigzag #7c3aed
  ctx.strokeStyle = "#7c3aed"; ctx.lineWidth = 2.5;
  for (const edge of EDGES) {
    for (const p of G.edgeCrackPos[edge]) {
      ctx.beginPath();
      const horiz = edge === "top" || edge === "bottom";
      for (let i = -3; i <= 3; i++) {
        const jx = p.x + (horiz ? i * 9 : (i % 2) * 6 - 3);
        const jy = p.y + (horiz ? (i % 2) * 6 - 3 : i * 9);
        i === -3 ? ctx.moveTo(jx, jy) : ctx.lineTo(jx, jy);
      }
      ctx.stroke();
    }
  }
  // viền băng: phủ #38bdf8 alpha 0.5 + ❄
  ctx.textAlign = "center";
  for (const edge of EDGES) {
    if (G.frozenEdges[edge] > 0) {
      ctx.fillStyle = "rgba(56,189,248,0.5)";
      if (edge === "left") ctx.fillRect(b.x, b.y, 14, b.h);
      else if (edge === "right") ctx.fillRect(b.x + b.w - 14, b.y, 14, b.h);
      else if (edge === "top") ctx.fillRect(b.x, b.y, b.w, 14);
      else ctx.fillRect(b.x, b.y + b.h - 14, b.w, 14);
      ctx.fillStyle = "#e0f2fe"; ctx.font = "18px sans-serif";
      const cx = edge === "left" ? b.x + 24 : edge === "right" ? b.x + b.w - 24 : b.x + b.w / 2;
      const cy = edge === "top" ? b.y + 28 : edge === "bottom" ? b.y + b.h - 12 : b.y + 30;
      ctx.fillText("❄", cx, cy);
      // đếm ngược
      ctx.font = "12px sans-serif";
      ctx.fillText(Math.ceil(G.frozenEdges[edge]) + "s", cx, cy + 16);
    }
    // khe hở: tím mờ
    if (G.windowGaps[edge] > 0) {
      ctx.fillStyle = "rgba(124,58,237,0.35)";
      const gx = edge === "left" ? b.x : edge === "right" ? b.x + b.w - 60 : b.x + b.w / 2 - 30;
      const gy = edge === "top" ? b.y : edge === "bottom" ? b.y + b.h - 14 : b.y + b.h / 2 - 30;
      const gw = edge === "left" || edge === "right" ? 60 : 60;
      const gh = edge === "top" || edge === "bottom" ? 14 : 60;
      ctx.fillRect(gx, gy, gw, gh);
    }
  }
  ctx.restore();
}

/* =====================================================================
   COMBAT HOOKS — coordinator gọi từ damageEnemy / vòng đạn
   ===================================================================== */
/* Trả về {dmg} đã điều chỉnh, hoặc {dmg:0, reflected:true} nếu bị phản xạ.
   Xử lý: warden gương · tank lõi ×1.5 · mini băng-vỡ · phantom hiện hình ·
   booster tắt aura · glimmer không có gì đặc biệt. */
function onHit(e, bl, dmg, G) {
  G = G || lastG || {};
  const iceBullet = !!(bl && G.ship && G.ship.slow > 0);
  // --- warden: gương phản xạ ---
  if (e.behavior === "mirror") {
    const incoming = Math.atan2(-(bl ? bl.vy : 0), -(bl ? bl.vx : 1)); // hướng đạn đang tới
    const diff = Math.abs(angDiff(incoming, e.faceAngle || 0));
    if (diff < Math.PI / 3) { // mặt trước ±60° → PHẢN XẠ
      const outA = (e.faceAngle || 0) + diff * (Math.random() < 0.5 ? 1 : -1) * 0.5;
      e.reflectFx = { t: 0.25, ang: outA };
      // tia phản xạ bay tới viền trong 200px → nứt viền
      const b = boundsOf();
      let best = null, bd = Infinity;
      const ca = Math.cos(outA), sa = Math.sin(outA);
      const cand = [];
      if (ca > 0.01) cand.push({ edge: "right", t: (b.x + b.w - e.x) / ca });
      if (ca < -0.01) cand.push({ edge: "left", t: (b.x - e.x) / ca });
      if (sa > 0.01) cand.push({ edge: "bottom", t: (b.y + b.h - e.y) / sa });
      if (sa < -0.01) cand.push({ edge: "top", t: (b.y - e.y) / sa });
      for (const c of cand) if (c.t > 0 && c.t < bd) { bd = c.t; best = c.edge; }
      if (best && bd < 200) { crackEdge(best, G, b); float(e.x, e.y - 26, "Gương nứt viền!", "#cbd5e1"); }
      sfx("hit");
      puff(e.x, e.y, 6, ["#ffffff", "#cbd5e1"], 160);
      return { dmg: 0, reflected: true };
    }
    return { dmg: dmg * 1.5 }; // hông/sau → ×1.5
  }
  // --- tank: lõi yếu ---
  if (e.behavior === "tank" && bl) {
    const dd = hyp(bl.x - e.x, bl.y - e.y);
    if (dd < e.r * 0.45) { e.coreFlash = 0.3; return { dmg: dmg * 1.5, core: true }; }
  }
  // --- mini: đang slow + thêm đạn băng → vỡ tan ---
  if (e.behavior === "swarm" && iceBullet && e.slowT > 0 && !e.golden) {
    return { dmg: 99999, shatter: true };
  }
  // --- phantom: đạn băng → hiện hình 3s ---
  if (e.behavior === "cloak" && iceBullet) {
    e.revealT = 3;
    float(e.x, e.y - 20, "Hiện hình!", "#a78bfa");
  }
  // --- booster: đạn băng → tắt aura 3s (khắc chế cứng) ---
  if (e.behavior === "aura" && iceBullet) {
    e.auraOffT = 3;
    float(e.x, e.y - 22, Monsters.t("booster.off"), "#7dd3fc", true);
  }
  return { dmg };
}
/* đạn địch chạm viền: spitter → crackEdge thay vì despawn thường.
   Trả true nếu đã xử lý (coordinator despawn đạn). */
function edgeBulletHit(eb, edge, G) {
  G = G || lastG || {};
  if (eb && eb.from === "spitter") {
    const b = boundsOf();
    const p = edgePoint(eb.x, eb.y, b);
    crackEdge(p.edge, G, b);
    puff(eb.x, eb.y, 6, ["#7c3aed", "#f43f5e"], 140);
    return true;
  }
  return false;
}
/* đạn băng của freezer trúng tàu */
function applyShipSlow(G, secs) {
  const s = shipOf(G); if (!s) return;
  s.slowT = Math.max(s.slowT || 0, secs || 2.5);
  float(s.x, s.y - 30, "Chậm 50%!", "#38bdf8");
  sfx("hit");
}
function shipSpeedMul(G) {
  const s = shipOf(G);
  return s && s.slowT > 0 ? 0.5 : 1;
}
/* bomber nổ: coordinator gọi khi bomber chết (kể cả trong fuse) */
function detonate(m, G) {
  G = G || lastG || {};
  if (m.exploded) return;
  m.exploded = true; m.dead = true;
  const s = shipOf(G);
  const b = boundsOf();
  puff(m.x, m.y, 30, ["#ef4444", "#ffb020", "#fff"], 380);
  shake(8, 400, 7); sfx("bigboom");
  float(m.x, m.y - 26, "BÙM!", "#ef4444", true);
  knockShipFx(m.x, m.y, 520);
  // 1 dmg tàu trong r100
  if (s && hyp(s.x - m.x, s.y - m.y) < 100) callFn("hurtShip", [1, m.x, m.y]);
  // tâm nổ cách viền <120 → nứt viền đó
  const p = edgePoint(m.x, m.y, b);
  const ed = Math.min(m.x - b.x, b.x + b.w - m.x, m.y - b.y, b.y + b.h - m.y);
  if (ed < 120) crackEdge(p.edge, G, b);
}
/* trả true nếu đã cho nổ (coordinator gọi trong killEnemy) */
function bomberOnDeath(e, G) {
  if (e.behavior === "kamikaze" && !e.exploded) { detonate(e, G || lastG); return true; }
  return false;
}
/* tank chết (wave≥5) → rơi 2 mini kế thừa 50% knockback */
function tankOnDeath(e, G) {
  G = G || lastG || {};
  if ((G.wave || 1) < 5) return;
  for (let i = 0; i < 2; i++) {
    const mn = Monsters.makeEnemy("mini", G.wave || 1, diffOf(G),
      e.x + rand(-20, 20), e.y + rand(-20, 20));
    if (mn) { mn.kbx = (e.kbx || 0) * 0.5; mn.kby = (e.kby || 0) * 0.5; G.enemies.push(mn); }
  }
}
/* splitter chết → tách mini (wave≥8: 3 mini máu 1; +mini bóng nếu Nhiễu) */
function splitOnDeath(e, G) {
  G = G || lastG || {};
  const wave = G.wave || 1;
  const n = wave >= 8 ? 3 : 2;
  for (let i = 0; i < n; i++) {
    const mn = Monsters.makeEnemy("mini", wave, diffOf(G), e.x + rand(-16, 16), e.y + rand(-16, 16));
    if (mn) {
      if (wave >= 8) { mn.hp = 1; mn.maxHp = 1; }
      mn.kbx = (e.kbx || 0); mn.kby = (e.kby || 0); // kế thừa knockback
      mn.x += (e.kbx || 0) * 0.05; mn.y += (e.kby || 0) * 0.05;
      G.enemies.push(mn);
    }
  }
  if (e.miniboss && e.miniboss.id === "mirage") { // +1 mini "bóng" lừa 5s
    const sh = Monsters.makeEnemy("mini", wave, diffOf(G), e.x, e.y);
    if (sh) { sh.shadow = true; sh.dmg = 0; sh.shadowT = 5; sh.color = "#7df9ff"; G.enemies.push(sh); }
  }
}
/* booster chết → burst xanh + text */
function boosterOnDeath(e) {
  puff(e.x, e.y, 24, ["#22c55e", "#bbf7d0", "#fff"], 280);
  float(e.x, e.y - 24, Monsters.t("booster.dead"), "#22c55e", true);
  sfx("boom");
}
/* vẽ viền sáng cho quái được buff (coordinator gọi sau drawOneEnemy) */
function drawBuffed(m, ctx) {
  if (!m.buffed || m.dead) return;
  ctx.save(); ctx.translate(m.x, m.y);
  ctx.strokeStyle = `rgba(34,197,94,${0.5 + 0.5 * Math.sin(m.t * 10)})`;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, m.r + 5, 0, TAU); ctx.stroke();
  ctx.restore();
}

/* tick chậm 0.25s: aura booster + bất kỳ logic O(n) nào — coordinator gọi mỗi frame */
var _slowAcc = 0;
function tickSlow(dt, G) {
  G = G || lastG || {};
  ensureEdgeState(G);
  tickEdges(dt, G);
  _slowAcc += dt;
  if (_slowAcc < 0.25) return;
  _slowAcc = 0;
  // reset buff trước khi tính lại
  for (const o of G.enemies) if (!o.dead) { o.buffT = Math.max(0, (o.buffT || 0) - 0.25); if (o.buffT <= 0) o.buffed = false; }
  for (const m of G.enemies) {
    if (m.dead || m.behavior !== "aura") continue;
    if (m.auraOffT > 0 || m.slowT > 0) continue; // băng → aura tắt
    for (const o of G.enemies) {
      if (o === m || o.dead || o.behavior === "aura") continue;
      const d2 = (o.x - m.x) * (o.x - m.x) + (o.y - m.y) * (o.y - m.y);
      if (d2 < 220 * 220) { o.buffed = true; o.buffT = 0.3; }
    }
  }
}
/* ship bị Tank Từ Trường hút — coordinator cộng vào movement */
function shipPullVec(G) {
  const p = G && G.shipPull;
  if (!p || p.t <= 0) return null;
  return p;
}
function tickShipPull(dt, G) {
  if (G && G.shipPull) {
    G.shipPull.t -= dt;
    if (G.shipPull.t <= 0) G.shipPull = null;
  }
}

/* =====================================================================
   DEBUT — banner "QUÁI MỚI" (mỗi wave tối đa 1 loại)
   ===================================================================== */
function debutInfo(type) {
  const def = MONSTER_REGISTRY[type];
  if (!def || !def.debutHintVi) return null;
  return { name: def.nameVi, hint: def.debutHintVi };
}
/* Trả {title, sub} nếu được hiện banner, ngược lại null. */
function checkDebut(G, type) {
  G = ensureEdgeState(G || lastG || {});
  const info = debutInfo(type);
  if (!info) return null;
  if (G.debuted[type]) return null;
  if (G.debutWave === G.wave) return null; // mỗi wave 1 loại
  G.debuted[type] = true; G.debutWave = G.wave;
  return { title: "QUÁI MỚI: " + info.name, sub: info.hint };
}

/* =====================================================================
   MINI-BOSS — elite variant wave 5 mỗi ải (§5)
   HP ×8, to 2.5×, +1 đòn mới. Hạ: 20 gem (coordinator lo draft + vá).
   ===================================================================== */
var MINIBOSSES = {
  1: { id: "ancient", base: "chewer", nameVi: "Chewer Cổ Đại",
       color: "#c084fc", extraVi: "Gặm nhanh gấp đôi; bị hất lần đầu → tách 2 chewer thường",
       rMul: 2.5, hpMul: 8, gems: 20 },
  2: { id: "thorn", base: "dasher", nameVi: "Dasher Xuyên Gai",
       color: "#ff9a3d", extraVi: "Giáp gai (miễn nhiễm gai viền); lao 3 lần chữ Z",
       rMul: 2.5, hpMul: 8, gems: 20 },
  3: { id: "magnet", base: "tank", nameVi: "Tank Từ Trường",
       color: "#7c3aed", extraVi: "Mỗi 8s hút tàu 1.5s (vòng tím telegraph)",
       rMul: 2.5, hpMul: 8, gems: 20 },
  4: { id: "mirage", base: "splitter", nameVi: "Splitter Nhiễu",
       color: "#7df9ff", extraVi: "Nửa ẩn nửa hiện; khi tách +1 mini bóng (lừa 5s)",
       rMul: 2.5, hpMul: 8, gems: 20 },
  5: { id: "lord", base: "chewer", nameVi: "Chewer Chúa Tể",
       color: "#c084fc", extraVi: "Gặm kép: mỗi giây bám viền, vùng an toàn thu thêm 4px",
       rMul: 2.5, hpMul: 8, gems: 20 },
};
function makeMiniBoss(stageId) {
  const mb = MINIBOSSES[stageId];
  return mb ? Object.assign({}, mb) : null;
}
/* chỉ số mini-boss ở wave w với diff */
function miniBossStats(stageId, wave, diff) {
  const mb = MINIBOSSES[stageId];
  if (!mb) return null;
  const def = MONSTER_REGISTRY[mb.base];
  return {
    nameVi: mb.nameVi, extraVi: mb.extraVi, gems: mb.gems,
    r: def.r * mb.rMul,
    hp: def.hpAt(wave, diff) * mb.hpMul,
    speed: def.speedAt(wave, diff),
    xp: def.xp * 4,
  };
}

/* =====================================================================
   SPAWN — tỉ lệ gợi ý (bestiary §2) + factory entity standalone
   ===================================================================== */
var SPAWN_SUGGEST = [
  { type: "spitter", minWave: 2, weight: 10 },
  { type: "glimmer", minWave: 2, weight: 15, maxPerWave: 1 },
  { type: "bomber", minWave: 3, weight: 10 },
  { type: "freezer", minWave: 3, weight: 8 },
  { type: "booster", minWave: 4, weight: 6 },
  { type: "warden", minWave: 4, weight: 6 },
  { type: "phantom", minWave: 5, weight: 8 },
  { type: "broodmother", minWave: 5, weight: 5, maxPerWave: 1 },
];
function spawnWeights(wave) {
  return SPAWN_SUGGEST.filter(s => wave >= s.minWave)
    .map(s => ({ type: s.type, weight: s.weight, maxPerWave: s.maxPerWave || 0 }));
}
/* factory entity độc lập (không cần game.js) — dùng cho test + coordinator */
function makeEnemy(type, wave, diff, x, y) {
  const def = type === "egg" ? EGG_DEF : MONSTER_REGISTRY[type];
  if (!def) return null;
  diff = diff || D1;
  const e = {
    type, behavior: def.behavior, x: x || 0, y: y || 0,
    t: rand(0, 9), flash: 0, slowT: 0, dead: false,
    kbx: 0, kby: 0, r: def.r, dmg: def.dmg, color: def.color,
    hp: def.hpAt(wave, diff), speed: def.speedAt(wave, diff), xp: def.xp,
  };
  e.maxHp = e.hp;
  const bh = BEHAVIORS[def.behavior];
  if (bh && bh.init) { lastG = lastG; try { bh.init(e, wave, { wave }); } catch (err) {} }
  return e;
}
/* khởi tạo state đầu run — coordinator gọi khi new game */
function initState(G) {
  ensureEdgeState(G);
  G.debuted = {}; G.debutWave = -1;
  G.crackWarned = false; G.freezeWarned = false;
  _slowAcc = 0;
  return G;
}

/* =====================================================================
   I18N — bảng key → {vi, en}. Game dùng I18N.t('monster.<key>') nếu có,
   ngược lại Monsters.t(key, lang) dùng trực tiếp.
   ===================================================================== */
var STRINGS = {
  vi: {
    "monster.chaser.name": "Truy Đuổi", "monster.chaser.counter": "Giữ khoảng cách, bắn khi nó lượn; né ngang khi chớp đỏ.",
    "monster.chewer.name": "Gặm Viền", "monster.chewer.counter": "Bắn vào viền gần nó để hất văng.",
    "monster.tank.name": "Xe Tăng", "monster.tank.counter": "Ngắm lõi giữa thân (×1.5 dmg); né khi nó nghiêng người húc.",
    "monster.dasher.name": "Lao Tới", "monster.dasher.counter": "Né ngang khi aim chuyển ĐỎ; coi chừng dash giả.",
    "monster.splitter.name": "Phân Thân", "monster.splitter.counter": "Giết ở xa, lùi ra trước khi nó vỡ.",
    "monster.mini.name": "Mini", "monster.mini.counter": "Đạn băng + băng = vỡ tan ngay.",
    "monster.spitter.name": "Phun Mã Độc", "monster.spitter.counter": "Áp sát vòng sau lưng lúc nó aim 0.6s.",
    "monster.booster.name": "Khuếch Đại Lỗi", "monster.booster.counter": "GIẾT NÓ ĐẦU TIÊN; đạn băng tắt aura 3s.",
    "monster.bomber.name": "Liều Chết Cảm Tử", "monster.bomber.counter": "Giết từ xa >150px; đẩy ra giữa map.",
    "monster.freezer.name": "Đóng Băng Hệ Thống", "monster.freezer.counter": "Viền băng → bắn thẳng vào chewer.",
    "monster.warden.name": "Giáp Gương", "monster.warden.counter": "Vòng sau lưng; đạn xuyên bỏ qua gương.",
    "monster.glimmer.name": "Đom Đóm Vàng", "monster.glimmer.counter": "Chặn đầu hướng viền; 1-2 viên là hạ.",
    "monster.phantom.name": "Bóng Ma Ẩn", "monster.phantom.counter": "Đạn băng hiện hình 3s; đứng xa viền.",
    "monster.broodmother.name": "Ổ Lỗi Sinh Sản", "monster.broodmother.counter": "Trứng 1 viên là vỡ; đẩy mẹ ra giữa map.",
    "monster.egg.name": "Trứng Lỗi", "monster.egg.counter": "Bắn ngay — 1 hit vỡ.",
    "edge.crackWarn": "⚠ Viền nứt!",
    "edge.slashWarn": "⚠ Bóng ma rạch viền!",
    "edge.freezeWarn": "❄ Sắp đóng băng!",
    "edge.frozen": "Viền bị đóng băng! Bắn thẳng vào chewer!",
    "edge.eggStuck": "⚠ Trứng dính viền!",
    "booster.off": "❄ Ngắt khuếch đại!",
    "booster.dead": "Đã ngắt khuếch đại!",
    "glimmer.spawn": "✨ Đom Đóm Vàng! Bắn hạ để nhận gem!",
    "glimmer.escape": "Mất rồi...",
    "bomber.armed": "SẮP NỔ!",
    "phantom.reveal": "Hiện hình!",
    "debut.banner": "QUÁI MỚI: {name} — {hint}",
  },
  en: {
    "monster.chaser.name": "Chaser", "monster.chaser.counter": "Keep distance, shoot while it weaves; strafe on red flash.",
    "monster.chewer.name": "Chewer", "monster.chewer.counter": "Shoot the edge near it to knock it off.",
    "monster.tank.name": "Tank", "monster.tank.counter": "Aim the core (×1.5 dmg); strafe when it winds up.",
    "monster.dasher.name": "Dasher", "monster.dasher.counter": "Strafe when aim turns RED; watch for fake dashes.",
    "monster.splitter.name": "Splitter", "monster.splitter.counter": "Kill from afar, back off before it bursts.",
    "monster.mini.name": "Mini", "monster.mini.counter": "Ice + ice = instant shatter.",
    "monster.spitter.name": "Plague Spitter", "monster.spitter.counter": "Flank behind during its 0.6s aim.",
    "monster.booster.name": "Bug Booster", "monster.booster.counter": "KILL IT FIRST; ice disables aura 3s.",
    "monster.bomber.name": "Suicide Bomber", "monster.bomber.counter": "Kill from >150px; knock it mid-map.",
    "monster.freezer.name": "System Freezer", "monster.freezer.counter": "Frozen edge → shoot chewers directly.",
    "monster.warden.name": "Mirror Warden", "monster.warden.counter": "Flank behind; pierce ignores the mirror.",
    "monster.glimmer.name": "Gold Glimmer", "monster.glimmer.counter": "Cut off its path to the edge; 1-2 hits.",
    "monster.phantom.name": "Hidden Phantom", "monster.phantom.counter": "Ice reveals 3s; stay away from edges.",
    "monster.broodmother.name": "Broodmother", "monster.broodmother.counter": "Eggs pop in 1 hit; push her mid-map.",
    "monster.egg.name": "Bug Egg", "monster.egg.counter": "Shoot it now — 1 hit pops.",
    "edge.crackWarn": "⚠ Edge cracked!",
    "edge.slashWarn": "⚠ Phantom slashing the edge!",
    "edge.freezeWarn": "❄ About to freeze!",
    "edge.frozen": "Edge frozen! Shoot chewers directly!",
    "edge.eggStuck": "⚠ Egg stuck on edge!",
    "booster.off": "❄ Boost interrupted!",
    "booster.dead": "Boost offline!",
    "glimmer.spawn": "✨ Gold Glimmer! Shoot it for gems!",
    "glimmer.escape": "It got away...",
    "bomber.armed": "ABOUT TO BLOW!",
    "phantom.reveal": "Revealed!",
    "debut.banner": "NEW MONSTER: {name} — {hint}",
  }
};
var _lang = "vi";
function t(key, lang) {
  const L = STRINGS[lang || _lang] || STRINGS.vi;
  return L[key] != null ? L[key] : (STRINGS.en[key] != null ? STRINGS.en[key] : key);
}
function setLang(l) { if (STRINGS[l]) _lang = l; }

/* ---------------- expose ---------------- */
var Monsters = {
  MONSTER_REGISTRY, BEHAVIORS, EGG_DEF, MINIBOSSES, SPAWN_SUGGEST,
  makeEnemy, initState, ensureEdgeState,
  crackEdge, chewAmount, canKnock, knockChew, freezeEdge, addWindowGap,
  tickEdges, tickSlow, tickShipPull, clearEdges, shrinkHook, drawEdgeFx, drawBuffed,
  onHit, edgeBulletHit, detonate, bomberOnDeath, tankOnDeath, splitOnDeath, boosterOnDeath,
  applyShipSlow, shipSpeedMul, shipPullVec,
  debutInfo, checkDebut,
  makeMiniBoss, miniBossStats, spawnWeights,
  STRINGS, t, setLang,
  version: "2.0.0-monsters",
};
/* hook update: coordinator set G hiện tại để các hàm dùng G mặc định */
Monsters.setG = function (G) { lastG = G; return G; };

root.Monsters = Monsters;
if (typeof module !== "undefined" && module.exports) module.exports = Monsters;
})(typeof window !== "undefined" ? window : globalThis);
