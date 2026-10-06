/* ---------------- nâng cấp (8 món — cắt từ 12 theo quyết định CEO 2026-10-06:
   mỗi món còn lại phải đổi lối chơi thật; 4 món chỉ +chỉ số/kinh tế vô hình
   (speed, bulletspeed, greed, luck) bị loại để giảm choice paralysis) ---------------- */
const UPS = [
  { ico: "i-fire", t: I18N.t("upg.firerate.name"), d: I18N.t("upg.firerate.desc"), apply: s => s.fireInt *= 0.77 },
  { ico: "i-split", t: I18N.t("upg.streams.name"), d: I18N.t("upg.streams.desc"), apply: s => s.streams = Math.min(4, s.streams + 1), can: s => s.streams < 4 },
  { ico: "i-bomb", t: I18N.t("upg.damage.name"), d: I18N.t("upg.damage.desc"), apply: s => s.dmg += 1 },
  { ico: "i-heart", t: I18N.t("upg.hp.name"), d: I18N.t("upg.hp.desc"), apply: s => { s.maxHp += 1; s.hp = Math.min(s.maxHp, s.hp + 1); } },
  { ico: "i-pierce", t: I18N.t("upg.pierce.name"), d: I18N.t("upg.pierce.desc"), apply: s => s.pierce += 1 },
  { ico: "i-magnet", t: I18N.t("upg.magnet.name"), d: I18N.t("upg.magnet.desc"), apply: s => s.magnet *= 1.6 },
  { ico: "i-shield", t: I18N.t("upg.thorns.name"), d: I18N.t("upg.thorns.desc"), apply: s => s.thorns += 1 },
  { ico: "i-snow", t: I18N.t("upg.ice.name"), d: I18N.t("upg.ice.desc"), apply: s => s.slow = 1.5 },
];
/* M22: icon cho 6 nâng cấp v2 (sprite sẵn có trong game.html) + số slot draft bảo đảm */
const U2_ICON = { gai_phan: "i-shield", neo_quan_tinh: "i-bolt", mat_cu: "i-ghost",
                  dan_no: "i-bomb", dan_xich: "i-split", keo_tu_va: "i-heart-plus" };
const U2_DRAFT_SLOTS = 1;
/* M22: callback sát thương dùng chung cho các hiệu ứng lan/gai của v2 — truyền
   bl=null để không knockback; hook đặt tại call-site va chạm, KHÔNG đặt trong
   damageEnemy để tránh đệ quy nổ→nổ / xích→xích (spec §5.3.2). */
const u2DealDamage = (e, dmg) => damageEnemy(e, dmg, null);
/* D-03: đếm nâng cấp khác nhau đã chọn trong run → achievement #15 "Full Build" */
function noteUpgradeTaken(key) {
  try {
    if (!G.upgTaken) G.upgTaken = {};
    if (key) G.upgTaken[key] = true;
    if (window.Meta && typeof Meta.check === "function")
      Meta.check("upgrade", { distinct: Object.keys(G.upgTaken).length });
  } catch (e) {}
}
function applyDraftPick(u) {
  if (!u) return;
  const res = u.apply(G.ship);
  if (u._u2 && res === null) return; // món v2 bị khóa/trùng tại thời điểm áp → không tính đã nhận
  noteUpgradeTaken(u._draftId || u.t || u.ico);
  try { Telemetry.log("upgrade_chosen", { upgrade_id: u._draftId || u.t || u.ico, wave: G.wave, level: G.level }); } catch (e) {} // telemetry FUN: pick-rate draft (local-first, fail-silent)
}
function openDraft() {
  G.phase = "draft";
  const pool = UPS.filter(u => !u.can || u.can(G.ship));
  const picks = [];
  // M22: slot bảo đảm cho nâng cấp v2 — pool v2 tự loại món đã lấy / chưa mở khóa ải
  if (window.Upgrades2) {
    try {
      const u2 = Upgrades2.rollDraft(U2_DRAFT_SLOTS);
      if (u2.length) {
        const u = u2[0];
        // N4 i18n: tên/mô tả qua Upgrades2.dname/ddesc (EN đầy đủ), fallback nameVi/descVi
        const pick = { t: (Upgrades2.dname ? Upgrades2.dname(u) : u.nameVi),
                       d: (Upgrades2.ddesc ? Upgrades2.ddesc(u) : u.descVi),
                       _draftId: "u2:" + u.id, _u2: true,
                       apply: s => Upgrades2.applyUpgrade(u.id, s) };
        pick["ico"] = U2_ICON[u.id] || "i-sparkles"; // gán động: giữ nguyên dạng pick cho 2 đường draft
        picks.push(pick);
      }
    } catch (er) {}
  }
  while (picks.length < 3 && pool.length) picks.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  if (!picks.length) { G.phase = "play"; return; }
  try { AudioEngine.sfx.stinger("levelUp"); } catch (e) {} // stinger level-up khi mở draft
  // WOW: draft qua Cinema (DOM overlay + phím 1/2/3); fallback overlay cũ
  if (window.Cinema) {
    const ups = picks.map(u => ({ name: u.t, desc: u.d, icon: '<svg class="ic" aria-hidden="true"><use href="#' + u.ico + '"/></svg>' }));
    let ok = false;
    try {
      Cinema.showDraft(ups, (idx) => {
        const u = picks[idx];
        if (u) {
          applyDraftPick(u); AudioEngine.sfx.up();
          addFloat(G.ship.x, G.ship.y - 32, u.t, "#9df3ff", true);
        }
        G.phase = "play"; lastT = performance.now();
      }, { x: G.ship.x, y: G.ship.y, theme: "patch" }); // H1/B4: reframe "VÁ CỬA SỔ"
      ok = true;
    } catch (err) {}
    if (ok) return;
  }
  openDraftLegacy(picks);
}
// Overlay draft cũ (fallback khi không có Cinema)
function openDraftLegacy(picks) {
  const box = $("draft-cards"); box.innerHTML = "";
  picks.forEach(u => {
    const d = document.createElement("div"); d.className = "card";
    d.innerHTML = `<div class="ico"><svg class="ic" aria-hidden="true"><use href="#${u.ico}"/></svg></div><div class="t">${u.t}</div><div class="d">${u.d}</div>`;
    d.onclick = () => {
      applyDraftPick(u); AudioEngine.sfx.up();
      addFloat(G.ship.x, G.ship.y - 32, u.t, "#9df3ff", true);
      $("ov-draft").classList.remove("show");
      G.phase = "play"; lastT = performance.now();
    };
    box.appendChild(d);
  });
  $("ov-draft").classList.add("show");
}
function gainXp(n) {
  G.xp += n * (G.vp1_xpMul || 1); // VP1 xpturbo
  while (G.xp >= G.xpNeed) {
    G.xp -= G.xpNeed; G.level++;
    G.xpNeed = 5 + G.level * 3;
    // v2.0: juice2 level-up FX + meta hook
    if (window.V2) { try { V2.onLevelUp(G.ship.x, G.ship.y, G.level); } catch (er) {} }
    openDraft();
  }
}

