/* =====================================================================
   WINDOWKILL: Web Edition — js/upgrades2.js
   6 NÂNG CẤP MỚI (§7.2 GAME-DESIGN-DOC) — KHÔNG sửa js/game.js.

   - IIFE, "use strict", vanilla JS, không dependency.
   - Mỗi nâng cấp: { id, nameVi, descVi, pool, tagVi?, apply(ship) }.
   - pool: 'common' | 'stage2' | 'stage3' | 'stage4'.
     Độc quyền ải chỉ vào draft SAU KHI hạ boss ải tương ứng:
       unlockBossStage(2|3|4) — integrator gọi khi boss ải chết.
   - Runtime helpers để game.js hook mà không cần sửa struct ship:
       checkThornBorder(ship, enemies, bounds, dealDamage)
       tryAnchor(ship)                    // Shift: dừng trượt tức thì
       tick(ship, dt) -> { glue: px } | null
       owlTargets(ship, enemies)          // Mắt Cú: quái trong 200px
       explodeAt(x, y, hit, enemies, dealDamage)
       chainFrom(hit, enemies, dmg, dealDamage)
   - dealDamage(enemy, dmg): callback do integrator cung cấp (áp sát thương
     qua pipeline hiện có của game — module này không tự trừ HP quái).

   API: window.Upgrades2 = {
     LIST, get(id), draftPool(), rollDraft(n),
     applyUpgrade(id, ship), hasTaken(id),
     unlockBossStage(stage), isUnlocked(id), resetRun(),
     dname(u), ddesc(u), dtag(u),   // I18N (N4): tên/mô tả/tag theo ngôn ngữ hiện tại
     checkThornBorder, tryAnchor, tick, owlTargets, explodeAt, chainFrom
   }
   ===================================================================== */
(function () {
"use strict";

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function dist2(ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }
function T(key, vi) {
  try {
    if (typeof window !== "undefined" && window.I18N && typeof window.I18N.t === "function") {
      var s = window.I18N.t("upg2." + key);
      if (typeof s === "string" && s && s !== "upg2." + key) return s;
    }
  } catch (e) {}
  return vi;
}
/* I18N (gate N4 Season 1): tên/mô tả/tag qua dict "upg2.<id>.name|desc" —
 * fallback tiếng Việt khi key thiếu. Integrator (game.js openDraft) dùng
 * 3 helper này thay vì đọc trực tiếp nameVi/descVi. */
function dname(u) { return u ? T(u.id + ".name", u.nameVi) : ""; }
function ddesc(u) { return u ? T(u.id + ".desc", u.descVi) : ""; }
function dtag(u) {
  if (!u || !u.tagVi) return "";
  return u.bossStage ? T("tag.stage" + u.bossStage, u.tagVi) : u.tagVi;
}

/* ================= 6 nâng cấp §7.2 ================= */
var LIST = [
  {
    id: "gai_phan",
    nameVi: "Gai Phản",
    descVi: "Tàu chạm viền: gây 3 sát thương cho mọi quái trong 120px.",
    pool: "stage2",
    tagVi: "Độc quyền ải 2",
    bossStage: 2,
    apply: function (ship) { ship.thornBorder = { dmg: 3, r: 120 }; }
  },
  {
    id: "neo_quan_tinh",
    nameVi: "Neo Quán Tính",
    descVi: "Nhấn Shift: dừng trượt tức thì. Hồi chiêu 8s.",
    pool: "stage3",
    tagVi: "Độc quyền ải 3",
    bossStage: 3,
    apply: function (ship) { ship.inertiaAnchor = { cd: 0, max: 8 }; }
  },
  {
    id: "mat_cu",
    nameVi: "Mắt Cú",
    descVi: "Lúc mất điện: hiện outline mờ mọi quái trong 200px quanh tàu.",
    pool: "stage4",
    tagVi: "Độc quyền ải 4",
    bossStage: 4,
    apply: function (ship) { ship.owlEye = { r: 200 }; }
  },
  {
    id: "dan_no",
    nameVi: "Đạn Nổ",
    descVi: "Đạn nổ lan r60, gây 1 sát thương — dọn trứng và bầy mini.",
    pool: "common",
    apply: function (ship) { ship.explosive = { r: 60, dmg: 1 }; }
  },
  {
    id: "dan_xich",
    nameVi: "Đạn Xích",
    descVi: "Đạn trúng quái nảy sang quái gần nhất trong 150px, 50% sát thương.",
    pool: "common",
    apply: function (ship) { ship.chain = { r: 150, mul: 0.5 }; }
  },
  {
    id: "keo_tu_va",
    nameVi: "Súng Bắn Keo",
    descVi: "Bấm E: vá ngay +60px cửa sổ. Hồi chiêu 30s.",
    pool: "common",
    apply: function (ship) { ship.glueGun = { cd: 0, maxCd: 30, px: 60 }; }
  }
];

var _taken = {};        // id -> true (đã chọn trong run này)
var _bossBeaten = {};   // stage -> true (boss ải đã hạ → mở độc quyền)

function get(id) {
  for (var i = 0; i < LIST.length; i++) if (LIST[i].id === id) return LIST[i];
  return null;
}
/** Nâng cấp độc quyền chỉ khả dụng sau khi hạ boss ải tương ứng. */
function isUnlocked(u) {
  if (!u) return false;
  if (u.pool === "common") return true;
  return !!_bossBeaten[u.bossStage];
}
/** Integrator gọi khi hạ boss ải `stage` (2/3/4). Trả về upgrade vừa mở. */
function unlockBossStage(stage) {
  _bossBeaten[stage] = true;
  for (var i = 0; i < LIST.length; i++)
    if (LIST[i].bossStage === stage) return LIST[i];
  return null;
}
function hasTaken(id) { return !!_taken[id]; }
/** Pool draft hiện tại: common + độc quyền đã mở, loại món đã lấy. */
function draftPool() {
  return LIST.filter(function (u) { return isUnlocked(u) && !hasTaken(u.id); });
}
/** Bốc n món ngẫu nhiên từ pool (không trùng). */
function rollDraft(n) {
  var pool = draftPool().slice(), picks = [];
  n = Math.min(n, pool.length);
  while (picks.length < n && pool.length)
    picks.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  return picks;
}
/** Áp nâng cấp vào ship + đánh dấu đã lấy. Trả về upgrade hoặc null. */
function applyUpgrade(id, ship) {
  var u = get(id);
  if (!u || !isUnlocked(u) || hasTaken(id)) return null;
  try { u.apply(ship); } catch (e) { return null; }
  _taken[id] = true;
  return u;
}
/** Reset đầu run: món đã lấy + boss đã hạ (giữ nguyên _bossBeaten? KHÔNG —
 *  chiến lợi phẩm theo run; gọi resetAll() khi về menu nếu muốn giữ). */
function resetRun() { _taken = {}; }
/** Xóa cả tiến trình mở độc quyền (khi đổi profile / về menu chính). */
function resetAll() { _taken = {}; _bossBeaten = {}; }

/* ================= runtime helpers ================= */
/**
 * Gai Phản: gọi mỗi frame khi ship có thornBorder.
 * bounds = { l, t, r, b } (viền arena hiện tại). Nếu tàu chạm viền
 * (cách viền <= ship.r + 2) → mọi quái trong 120px nhận 3 dmg.
 * Trả về số quái trúng đòn.
 */
function checkThornBorder(ship, enemies, bounds, dealDamage) {
  if (!ship || !ship.thornBorder || !enemies || !bounds) return 0;
  var tb = ship.thornBorder, r = ship.r || 13;
  var touch = (ship.x - r - 2 <= bounds.l) || (ship.x + r + 2 >= bounds.r) ||
              (ship.y - r - 2 <= bounds.t) || (ship.y + r + 2 >= bounds.b);
  if (!touch) return 0;
  var hits = 0, rr = tb.r * tb.r;
  for (var i = 0; i < enemies.length; i++) {
    var e = enemies[i];
    if (!e || e.dead) continue;
    if (dist2(ship.x, ship.y, e.x, e.y) <= rr) {
      try { dealDamage(e, tb.dmg); } catch (err) {}
      hits++;
    }
  }
  return hits;
}
/**
 * Neo Quán Tính: nhấn Shift → dừng trượt tức thì (xóa mọi vận tốc/kb),
 * hồi chiêu 8s. Trả về true nếu kích hoạt.
 */
function tryAnchor(ship) {
  if (!ship || !ship.inertiaAnchor) return false;
  var an = ship.inertiaAnchor;
  if ((an.cd || 0) > 0) return false;
  ship.kbvx = 0; ship.kbvy = 0;
  if (ship.vx !== undefined) ship.vx = 0;
  if (ship.vy !== undefined) ship.vy = 0;
  if (ship.slideVx !== undefined) ship.slideVx = 0;
  if (ship.slideVy !== undefined) ship.slideVy = 0;
  an.cd = an.max || 8;
  return true;
}
/**
 * Tick mỗi frame (dt đã scale): hồi chiêu Neo + hồi chiêu Súng Bắn Keo.
 * Không còn trả về event (Keo Tự Vá bị động đã bị thay bằng Súng Bắn Keo chủ động).
 */
function tick(ship, dt) {
  if (!ship || !(dt > 0)) return null;
  var ev = null;
  if (ship.inertiaAnchor && ship.inertiaAnchor.cd > 0)
    ship.inertiaAnchor.cd = Math.max(0, ship.inertiaAnchor.cd - dt);
  if (ship.glueGun) {
    ship.glueGun.cd = Math.max(0, (ship.glueGun.cd || 0) - dt);
  }
  return ev;
}
/**
 * Mắt Cú: trả về mảng quái trong 200px quanh tàu (integrator vẽ outline mờ
 * khi mất điện). Trả về [] nếu chưa có nâng cấp.
 */
function owlTargets(ship, enemies) {
  var out = [];
  if (!ship || !ship.owlEye || !enemies) return out;
  var rr = ship.owlEye.r * ship.owlEye.r;
  for (var i = 0; i < enemies.length; i++) {
    var e = enemies[i];
    if (!e || e.dead) continue;
    if (dist2(ship.x, ship.y, e.x, e.y) <= rr) out.push(e);
  }
  return out;
}
/**
 * Đạn Nổ: gọi khi đạn trúng `hit` tại (x, y) — mọi quái khác trong r60
 * nhận 1 dmg lan. Trả về mảng quái trúng lan.
 */
function explodeAt(x, y, hit, enemies, dealDamage) {
  var out = [];
  var G_ship = null;
  if (!enemies) return out;
  // cần ship để biết có nâng cấp không — đọc từ hit._ship do integrator gán,
  // hoặc tham số thứ 6 (tương thích cả 2 cách gọi).
  var ship = (arguments.length > 5) ? arguments[5] : (hit && hit._ship) || null;
  if (!ship || !ship.explosive) return out;
  var ex = ship.explosive, rr = ex.r * ex.r;
  for (var i = 0; i < enemies.length; i++) {
    var e = enemies[i];
    if (!e || e.dead || e === hit) continue;
    if (dist2(x, y, e.x, e.y) <= rr) {
      try { dealDamage(e, ex.dmg); } catch (err) {}
      out.push(e);
    }
  }
  return out;
}
/**
 * Đạn Xích: từ quái vừa trúng `hit`, tìm quái gần nhất trong 150px
 * (khác hit) → gây dmg * 50%. Trả về target hoặc null.
 */
function chainFrom(hit, enemies, dmg, dealDamage, ship) {
  if (!ship || !ship.chain || !hit || !enemies) return null;
  var ch = ship.chain, rr = ch.r * ch.r;
  var best = null, bestD = Infinity;
  for (var i = 0; i < enemies.length; i++) {
    var e = enemies[i];
    if (!e || e.dead || e === hit) continue;
    var d = dist2(hit.x, hit.y, e.x, e.y);
    if (d <= rr && d < bestD) { bestD = d; best = e; }
  }
  if (best) {
    try { dealDamage(best, dmg * (ch.mul == null ? 0.5 : ch.mul)); } catch (err) {}
    return best;
  }
  return null;
}

var Upgrades2 = {
  LIST: LIST,
  get: get,
  draftPool: draftPool,
  rollDraft: rollDraft,
  applyUpgrade: applyUpgrade,
  hasTaken: hasTaken,
  isUnlocked: isUnlocked,
  unlockBossStage: unlockBossStage,
  resetRun: resetRun,
  resetAll: resetAll,
  /* i18n (N4) */
  dname: dname,
  ddesc: ddesc,
  dtag: dtag,
  /* runtime */
  checkThornBorder: checkThornBorder,
  tryAnchor: tryAnchor,
  tick: tick,
  owlTargets: owlTargets,
  explodeAt: explodeAt,
  chainFrom: chainFrom,
  version: "1.0-upg2"
};

if (typeof window !== "undefined") window.Upgrades2 = Upgrades2;
if (typeof module !== "undefined" && module.exports) module.exports = Upgrades2;
})();
