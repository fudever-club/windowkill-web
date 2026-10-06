/* ---------------- M2 — BOSS VỠ KÍNH (Shatter) — P1d (rework 2026-10-04) ----------------
 * CEO: mảnh cũ "vô dụng, vô hại" — cắn 8px/3s trên cửa sổ ~1000px là muỗi đốt,
 * mảnh bất tử (hp 9999) nên không có counterplay, đóng tay bị phạt đẻ mini-boss
 * ngược đời. Rework: mảnh là MẢNH KÍNH vỡ ra từ chính viền cửa sổ — gắn chặt
 * fantasy "cửa sổ = máu".
 * - 3 mảnh, DESTRUCTIBLE (4 click để bắn vỡ). Bắn vỡ → +5 gem. KHÔNG pool HP chung.
 * - Vòng đời: drift 2.5s → telegraph 0.9s (sáng tím + rung + mũi tên chỉ viền) →
 *   dive 420px/s về viền gần nhất. Chạm viền → cắn 26px + vết rạn 3s, mảnh tiêu hao.
 * - Đóng tay mảnh (desktop popup thật) = "bắt mảnh" → +3 gem, không phạt.
 * - Triết lý vui > khó: telegraph rõ, bắn vỡ được, không spike.
 * - Hết boss → tất cả mảnh tự đóng (mode "cleanup"). */
/* ---- FRAG-LOGIC-START ---- */
const FRAG = { COUNT: 3, HP: 4, BITE: 26, DRIFT_T: 2.5, TELE_T: 0.9, DIVE_V: 420, GEMS_BREAK: 5, GEMS_CATCH: 3 };
/* Pure-ish: bước 1 tick cho mảnh kính sim. Đột biến sat, trả về events.
 * sat: {fphase, phaseT, x,y,sw,sh, vx,vy, tx,ty,tedge}; b: {x,y,w,h}. */
function fragStep(sat, dt, b) {
  const ev = [];
  const cx = sat.x + sat.sw / 2, cy = sat.y + sat.sh / 2;
  if (sat.fphase === "drift") {
    sat.x += sat.vx * dt; sat.y += sat.vy * dt;
    const nx = sat.x + sat.sw / 2, ny = sat.y + sat.sh / 2;
    if (nx < b.x + 20) sat.vx = Math.abs(sat.vx);
    else if (nx > b.x + b.w - 20) sat.vx = -Math.abs(sat.vx);
    if (ny < b.y + 20) sat.vy = Math.abs(sat.vy);
    else if (ny > b.y + b.h - 20) sat.vy = -Math.abs(sat.vy);
    sat.phaseT -= dt;
    if (sat.phaseT <= 0) {
      // chọn viền gần nhất làm mục tiêu dive
      const dl = cx - b.x, dr = (b.x + b.w) - cx, dtp = cy - b.y, db = (b.y + b.h) - cy;
      const m = Math.min(dl, dr, dtp, db);
      sat.tedge = m === dl ? "left" : m === dr ? "right" : m === dtp ? "top" : "bottom";
      sat.tx = sat.tedge === "left" ? b.x : sat.tedge === "right" ? b.x + b.w : cx;
      sat.ty = sat.tedge === "top" ? b.y : sat.tedge === "bottom" ? b.y + b.h : cy;
      sat.fphase = "telegraph"; sat.phaseT = FRAG.TELE_T;
      ev.push({ type: "telegraph", edge: sat.tedge });
    }
  } else if (sat.fphase === "telegraph") {
    sat.x += (Math.random() - 0.5) * 60 * dt; sat.y += (Math.random() - 0.5) * 60 * dt; // rung tại chỗ
    sat.phaseT -= dt;
    if (sat.phaseT <= 0) {
      const dx = sat.tx - cx, dy = sat.ty - cy, d = Math.sqrt(dx * dx + dy * dy) || 1;
      sat.vx = dx / d * FRAG.DIVE_V; sat.vy = dy / d * FRAG.DIVE_V;
      sat.fphase = "dive";
      ev.push({ type: "dive", edge: sat.tedge });
    }
  } else if (sat.fphase === "dive") {
    sat.x += sat.vx * dt; sat.y += sat.vy * dt;
    const nx = sat.x + sat.sw / 2, ny = sat.y + sat.sh / 2;
    const hit =
      (sat.tedge === "left" && nx <= b.x + 14) || (sat.tedge === "right" && nx >= b.x + b.w - 14) ||
      (sat.tedge === "top" && ny <= b.y + 14) || (sat.tedge === "bottom" && ny >= b.y + b.h - 14);
    if (hit) ev.push({ type: "bite", edge: sat.tedge, x: nx, y: ny });
  }
  return ev;
}
/* ---- FRAG-LOGIC-END ---- */
/* Rải gem tại (x,y) — dùng cho thưởng bắn vỡ / bắt mảnh kính. */
function dropFragGems(x, y, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    G.gems.push({ x: x + rand(-30, 30), y: y + rand(-30, 30), vx: Math.cos(a) * 130, vy: Math.sin(a) * 130, v: 1, t: 0 });
  }
}
function hurtBoss(n) {
  const bs = G.boss;
  if (!bs || bs.dead) return;
  bs.hp -= n; bs.flash = 0.2;
  if (bs.hp <= 0) killBoss(); else bossSplitCheck(bs);
}

function bossSplitCheck(bs) {
  if (!bs || bs.dead || bs.split) return;
  if (bs.hp > bs.maxHp * 0.66) return; // vào phase 2 ở 66% HP
  bs.split = true;
  const b = bounds();
  for (let i = 0; i < FRAG.COUNT; i++) {
    const sat = SatManager.request("fragment", {
      hp: FRAG.HP, color: "#7dd3fc", label: I18N.t("sat.bossfrag_label"), w: 220, h: 160,
      onClose: (mode, s) => {
        const px = s.sim ? s.x + s.sw / 2 : b.x + b.w / 2;
        const py = s.sim ? s.y + s.sh / 2 : b.y + b.h / 2;
        if (mode === "manual") {
          // bắt mảnh: +3 gem, không phạt (rework: bỏ phạt đẻ mini-boss ngược đời)
          dropFragGems(px, py, FRAG.GEMS_CATCH);
          addFloat(px, py - 30, I18N.t("sat.bossfrag_catch"), "#7dd3fc", true);
          AudioEngine.sfx.gem();
        } else if (mode === "killed") {
          // bắn vỡ mảnh: +5 gem
          dropFragGems(px, py, FRAG.GEMS_BREAK);
          addFloat(px, py - 30, I18N.t("sat.bossfrag_break"), "#7dd3fc", true);
          AudioEngine.sfx.crack();
        }
        // bitten/cleanup: không thêm gì
      },
    });
    if (sat) {
      // vỡ RA TỪ viền: spawn tại điểm ngẫu nhiên trên viền arena
      if (sat.sim) {
        const edge = ["left", "right", "top", "bottom"][i % 4], m = 34;
        if (edge === "left") { sat.x = b.x + m; sat.y = rand(b.y + 70, b.y + b.h - 70 - sat.sh); }
        else if (edge === "right") { sat.x = b.x + b.w - m - sat.sw; sat.y = rand(b.y + 70, b.y + b.h - 70 - sat.sh); }
        else if (edge === "top") { sat.y = b.y + m + 34; sat.x = rand(b.x + 60, b.x + b.w - 60 - sat.sw); }
        else { sat.y = b.y + b.h - m - sat.sh; sat.x = rand(b.x + 60, b.x + b.w - 60 - sat.sw); }
      }
      const ang = -Math.PI / 2 + (i - 1) * 0.9; // 3 hướng chéo lên
      const sp = 60 + Math.random() * 60; // drift 60–120px/s
      sat.vx = Math.cos(ang) * sp; sat.vy = Math.sin(ang) * sp;
      sat.fphase = "drift"; sat.phaseT = FRAG.DRIFT_T; sat.shipCD = 0;
    }
  }
  setBanner(I18N.t("sat.bossfrag_spawn"), "");
  AudioEngine.sfx.boss(); AudioEngine.sfx.crack();
  G.shake = Math.max(G.shake, 10);
}

function fragmentBite(edge, x, y) {
  if (edge === "left" || edge === "right") shrinkWindow(FRAG.BITE, 0);
  else shrinkWindow(0, FRAG.BITE);
  // vết rạn kính lưu lại trên viền 3s (visual)
  const b = bounds();
  G.cracks.push({
    edge, t: 0, life: 3,
    at: edge === "left" || edge === "right" ? (y ?? b.y + b.h / 2) : (x ?? b.x + b.w / 2),
  });
  AudioEngine.sfx.crack(); G.shake = Math.max(G.shake, 10);
  addFloat(x ?? b.x + b.w / 2, (y ?? 80) - 24, I18N.t("sat.bossfrag_bite"), "#7dd3fc", true);
}

function updateFragments(dt) {
  for (const sat of SatManager.values()) {
    if (sat.role !== "fragment" || sat.dead) continue;
    sat.shipCD = Math.max(0, (sat.shipCD || 0) - dt);
    if (sat.sim) {
      const b = bounds(), s = G.ship;
      for (const ev of fragStep(sat, dt, b)) {
        if (ev.type === "telegraph") AudioEngine.sfx.hit();
        else if (ev.type === "bite") { fragmentBite(ev.edge, ev.x, ev.y); SatManager.kill(sat.id, "bitten"); }
      }
      if (!sat.dead) {
        const cx = sat.x + sat.sw / 2, cy = sat.y + sat.sh / 2;
        if (sat.shipCD <= 0 && dist2(s.x, s.y, cx, cy) < (s.r + 30) * (s.r + 30)) {
          sat.shipCD = 1; hurtShip(1, cx, cy);
          sat.vx *= -1; sat.vy *= -1;
        }
      }
    } else {
      // desktop popup thật: 3 phase qua steer (drift → telegraph → dive)
      if (!sat.steered && sat.win && !sat.win.closed) {
        sat.steered = true;
        SatManager.steer(sat.id, sat.vx, sat.vy);
      }
      sat.phaseT = (sat.phaseT ?? FRAG.DRIFT_T) - dt;
      if ((sat.fphase === "drift" || !sat.fphase) && sat.phaseT <= 0) {
        sat.fphase = "telegraph"; sat.phaseT = FRAG.TELE_T;
        SatManager.warn(sat.id);
      } else if (sat.fphase === "telegraph" && sat.phaseT <= 0) {
        sat.fphase = "dive";
        try { // lao về tâm cửa sổ chính
          const mx = window.screenX + window.outerWidth / 2, my = window.screenY + window.outerHeight / 2;
          const sx = sat.win.screenX + sat.w / 2, sy = sat.win.screenY + sat.h / 2;
          const dx = mx - sx, dy = my - sy, d = Math.sqrt(dx * dx + dy * dy) || 1;
          SatManager.steer(sat.id, dx / d * FRAG.DIVE_V, dy / d * FRAG.DIVE_V);
        } catch (e) {}
      }
      sat.colT = (sat.colT || 0) - dt; // check va chạm mỗi 0.2s
      if (sat.colT <= 0) {
        sat.colT = 0.2;
        try {
          const sx = sat.win.screenX, sy = sat.win.screenY;
          const mx = window.screenX, my = window.screenY, mw = window.outerWidth, mh = window.outerHeight;
          if (sat.fphase === "dive" && sx < mx + mw && sx + sat.w > mx && sy < my + mh && sy + sat.h > my) {
            const fcX = sx + sat.w / 2, fcY = sy + sat.h / 2;
            const m = Math.min(Math.abs(fcX - mx), Math.abs(fcX - (mx + mw)), Math.abs(fcY - my), Math.abs(fcY - (my + mh)));
            const edge = m === Math.abs(fcX - mx) ? "left" : m === Math.abs(fcX - (mx + mw)) ? "right" : m === Math.abs(fcY - my) ? "top" : "bottom";
            fragmentBite(edge, fcX, fcY);
            SatManager.kill(sat.id, "bitten");
          }
        } catch (e) { /* popup đã đóng */ }
      }
    }
  }
}

