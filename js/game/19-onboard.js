/* =====================================================================
   19-onboard.js — WAVE 0 ONBOARDING (scripted, ~60 giây)
   FU-DEVER Game Studio · Game Design + Dev

   VẤN ĐỀ (P0 retention): người mới chết wave 1-2 mà không hiểu vì sao.

   THIẾT KẾ (CEO chốt): dạy đúng 1 câu duy nhất —
   "Đừng để quái gặm hết cửa sổ. Bắn!" — qua CHƠI THỬ CÓ HƯỚNG DẪN,
   không chữ dài, không menu nhiều lớp. Wave 0 scripted ~56s, 5 bước
   (mỗi bước 1 micro-skill; id bước = key message onboard.<id>):
     s0 "intro"  (8s):  hook 1 câu + spawn 1 chewer chậm ngay viền
     s1 "chewer" (15s): chewer bám viền → highlight viền đỏ nhấp nháy;
                        msg động: đã bám → s1 "đang gặm!", chưa → s2
                        "bắn vào viền để hất văng" (micro-skill 1)
     s3 "gem"    (12s): nhặt gem đầu tiên (micro-skill 2)
     s4 "encore" (18s): 2 chewer — lặp lại bài học cho chắc
     s5 "done"   (3s):  payoff → thả wave-break → engine tự startWave(1)

   - Mỗi step qua SỚM khi người chơi làm đúng (hất văng/giết/nhặt gem),
     timeout tự qua → tổng ≤ ~56s dù người chơi AFK.
   - Quái scripted: chewer hp 3, speed ×0.5, gặm chậm; hết step là dọn
     (không để gặm nát cửa sổ người mới).
   - Bỏ qua: nút "Bỏ qua ▸" trong coach-mark bar, bất cứ lúc nào.
   - Người cũ: localStorage wk_onboard_v1 → KHÔNG BAO GIỜ chạy lại.
     ?onboard=1 ép chạy (QA/review), ?onboard=0 tắt hẳn.
   - Tương thích tutorial 10-beat cũ (js/tutorial.js): chạy song song,
     không đụng beat/timeout của nó; wave 0 giữ G.wave = 0 nên script
     wave-1 của tutorial cũ không bị kích hoạt sớm.

   ĐẤU NỐI (hook tối thiểu trong 18-boot.js):
     loop():  if (window.Onboard) { try { Onboard.tick(dt); } catch (e) {} }
     boot():  if (window.Onboard) { try { Onboard.maybeStart(); } catch (e) {} }

   API: window.Onboard = { maybeStart, tick, skip, isActive, isDone }
   ===================================================================== */

/* ---------- storage / query ---------- */
var OB_KEY = "wk_onboard_v1";
var OB_QS = (function () { try { return new URLSearchParams(location.search); } catch (e) { return null; } })();
function obQs(name) { try { return OB_QS ? OB_QS.get(name) : null; } catch (e) { return null; } }
function obLsGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
function obLsSet(k, v) { try { window.localStorage.setItem(k, v); } catch (e) {} }

/* ---------- i18n (fallback khi I18N chưa sẵn — vd test node) ---------- */
var OB_FALLBACK = {
  "onboard.skip":   { vi: "Bỏ qua ▸", en: "Skip ▸" },
  "onboard.title":  { vi: "WAVE 0 — HƯỚNG DẪN", en: "WAVE 0 — TUTORIAL" },
  "onboard.s0":     { vi: "Đừng để quái gặm hết cửa sổ. Bắn!", en: "Don't let them chew through the window. Shoot!" },
  "onboard.s1":     { vi: "Quái tím bám viền — nó đang gặm cửa sổ!", en: "A purple monster latched on — it's chewing the window!" },
  "onboard.s2":     { vi: "Bắn vào viền để hất nó văng ra!", en: "Shoot the edge to knock it off!" },
  "onboard.s3":     { vi: "Nhặt mảnh kính — bay vào là tự nhặt!", en: "Grab the gem — just fly into it!" },
  "onboard.s4":     { vi: "Lại nào — 2 con quái tím! Bắn vào viền!", en: "Again — 2 purple monsters! Shoot the edge!" },
  "onboard.s5":     { vi: "Tuyệt! Sẵn sàng chiến đấu — WAVE 1!", en: "Great! Ready to fight — WAVE 1!" },
  "onboard.knock":  { vi: "Bốp! Hất văng!", en: "Bonk! Knocked off!" },
};
function obLang() {
  try {
    if (typeof I18N !== "undefined" && I18N && typeof I18N.getLang === "function") {
      return I18N.getLang() === "en" ? "en" : "vi";
    }
  } catch (e) {}
  return "vi";
}
function obT(key) {
  try {
    if (typeof I18N !== "undefined" && I18N && typeof I18N.t === "function") {
      var v = I18N.t(key);
      if (v != null && v !== key) return v;
    }
  } catch (e) {}
  var fb = OB_FALLBACK[key];
  return fb ? fb[obLang()] : key;
}

/* ---------- DOM helpers (guard cho test node) ---------- */
function obEl(id) { try { return document.getElementById(id); } catch (e) { return null; } }
function obShowOverlay() {
  var bar = obEl("onboard-bar"); if (bar) bar.hidden = false;
}
function obHideOverlay() {
  var bar = obEl("onboard-bar"); if (bar) bar.hidden = true;
  var edge = obEl("onboard-edge"); if (edge) edge.style.display = "none";
}
function obSetMsg(stepId) {
  var el = obEl("onboard-msg"); if (!el) return;
  el.textContent = obT("onboard." + stepId);
}

/* ---------- state ---------- */
/* id bước = key message onboard.<id>; s2 chỉ là biến thể msg của s1 (chưa bám viền) */
var OB_STEPS = ["s0", "s1", "s3", "s4", "s5"];
/* thời lượng tối đa mỗi bước (giây) — tổng 8+15+12+18+3 = 56s */
var OB_DUR = { s0: 8, s1: 15, s3: 12, s4: 18, s5: 3 };
var OB = {
  active: false, done: false, step: 0, t: 0, stepT: 0,
  spawned: [],        // quái chewer scripted của wave 0
  knocked: 0,         // số lần hất văng trong step hiện tại
  xp0: 0,             // xp lúc vào step gem
  bannerShown: false,
};

/* ---------- spawn ---------- */
function obSpawnChewer() {
  var b = null;
  try { b = bounds(); } catch (e) {}
  if (!b) return null;
  var edge = ["top", "bottom", "left", "right"][(Math.random() * 4) | 0];
  var x, y;
  if (edge === "top") { x = b.x + b.w * (0.3 + Math.random() * 0.4); y = b.y + 4; }
  else if (edge === "bottom") { x = b.x + b.w * (0.3 + Math.random() * 0.4); y = b.y + b.h - 4; }
  else if (edge === "left") { x = b.x + 4; y = b.y + b.h * (0.3 + Math.random() * 0.4); }
  else { x = b.x + b.w - 4; y = b.y + b.h * (0.3 + Math.random() * 0.4); }
  var e = null;
  try { e = spawnEnemyAt("chewer", x, y); } catch (err) { e = null; }
  if (e) {
    e.speed *= 0.5;   // chậm một nửa — người mới kịp phản ứng
    e.ob0 = true;     // đánh dấu quái scripted của wave 0
    e._obLatch = null;
    OB.spawned.push(e);
  }
  return e;
}
/* dọn quái scripted còn sót khi qua step / skip / finish — lặng lẽ, không thưởng */
function obClearScripted(fun) {
  try {
    for (var i = 0; i < OB.spawned.length; i++) {
      var e = OB.spawned[i];
      if (e && !e.dead) {
        e.dead = true;
        if (fun) { try { burst(e.x, e.y, 10, ["#c084fc", "#ffffff"], 220); } catch (er) {} }
      }
    }
  } catch (e) {}
  OB.spawned.length = 0;
}
function obAliveSpawned() {
  var n = 0;
  try { for (var i = 0; i < OB.spawned.length; i++) if (OB.spawned[i] && !OB.spawned[i].dead) n++; } catch (e) {}
  return n;
}

/* ---------- step machine ---------- */
function obEnterStep(idx) {
  OB.step = idx; OB.stepT = 0; OB.knocked = 0;
  var id = OB_STEPS[idx];
  /* dọn quái scripted còn sót — TRỪ khi vào s1 (giữ lại con chewer của s0
     để làm bài học "bắn vào viền") */
  if (id !== "s1") obClearScripted(false);
  if (id === "s0") {
    if (!OB.bannerShown) {
      OB.bannerShown = true;
      try { setBanner(obT("onboard.title"), ""); } catch (e) {}
    }
    obSpawnChewer();
  } else if (id === "s3") {
    /* vào bước gem: ghi nhận xp; nếu sân chưa có gem (vd quái bị timeout dọn),
       thả 1 gem gần tàu để bài học luôn chạy được */
    try { OB.xp0 = (typeof G !== "undefined" && G) ? (G.xp | 0) : 0; } catch (e) { OB.xp0 = 0; }
    var needGem = true;
    try { needGem = !(G && G.gems && G.gems.length); } catch (e) {}
    if (needGem) {
      try {
        var b = bounds(), s = G.ship;
        var gx = s ? s.x + 90 : b.x + b.w / 2, gy = s ? s.y : b.y + b.h / 2;
        if (typeof window !== "undefined" && window.WKSpawnGems) window.WKSpawnGems(1, gx, gy);
        else G.gems.push({ x: gx, y: gy, vx: 0, vy: -40, v: 1, t: 0 });
      } catch (e) {}
    }
  } else if (id === "s4") {
    obSpawnChewer(); obSpawnChewer();
  }
  /* msg step s1 động theo trạng thái bám viền (xem obUpdate) */
  if (id !== "s1") obSetMsg(id);
  else obSetMsg("s2");
}
/* kiểm tra hất văng: chewer từng bám viền (latched) mà giờ tuột ra nhưng còn sống */
function obPollKnock() {
  try {
    for (var i = 0; i < OB.spawned.length; i++) {
      var e = OB.spawned[i];
      if (!e || e.dead) continue;
      var was = e._obLatch || null, now = e.latched || null;
      if (was && !now) {
        OB.knocked++;
        try { addFloat(e.x, e.y - 20, obT("onboard.knock"), "#c084fc", true); } catch (er) {}
      }
      e._obLatch = now;
    }
  } catch (e) {}
}
function obUpdate() {
  var id = OB_STEPS[OB.step];
  obPollKnock();
  /* msg động step s1: đã bám viền → báo gặm; chưa → nhắc bắn vào viền */
  if (id === "s1") {
    var latched = false;
    try { for (var i = 0; i < OB.spawned.length; i++) if (OB.spawned[i] && !OB.spawned[i].dead && OB.spawned[i].latched) { latched = true; break; } } catch (e) {}
    obSetMsg(latched ? "s1" : "s2");
  }
  var advance = false;
  if (id === "s1") {
    /* qua khi hất văng hoặc giết được con chewer */
    if (OB.knocked > 0 || obAliveSpawned() === 0) advance = true;
  } else if (id === "s3") {
    /* qua khi nhặt gem (xp tăng) */
    try { if (G && (G.xp | 0) > OB.xp0) advance = true; } catch (e) {}
  } else if (id === "s4") {
    if (OB.knocked > 0 && obAliveSpawned() === 0) advance = true;
    else if (obAliveSpawned() === 0 && OB.stepT > 2) advance = true; // giết sạch cả 2
  }
  /* s5 (payoff): KHÔNG qua ngay — hiện message đủ OB_DUR.s5 rồi mới finish
     (timeout chung bên dưới lo việc này) */
  if (!advance && OB.stepT >= OB_DUR[id]) advance = true; // timeout → tự qua
  if (advance) {
    if (OB.step + 1 >= OB_STEPS.length) { obFinish(false); return; }
    obEnterStep(OB.step + 1);
  }
}

/* ---------- highlight viền bị gặm ---------- */
function obEdgeHighlight() {
  var el = obEl("onboard-edge");
  if (!el) return;
  var edge = null;
  try {
    for (var i = 0; i < OB.spawned.length; i++) {
      var e = OB.spawned[i];
      if (e && !e.dead && e.latched) { edge = e.latched; break; }
    }
  } catch (er) {}
  if (!edge || !OB.active) { el.style.display = "none"; return; }
  var b = null;
  try { b = bounds(); } catch (er) {}
  if (!b) { el.style.display = "none"; return; }
  var T = 12, css = "";
  if (edge === "top") css = "left:" + b.x + "px;top:" + (b.y - T / 2) + "px;width:" + b.w + "px;height:" + T + "px;";
  else if (edge === "bottom") css = "left:" + b.x + "px;top:" + (b.y + b.h - T / 2) + "px;width:" + b.w + "px;height:" + T + "px;";
  else if (edge === "left") css = "left:" + (b.x - T / 2) + "px;top:" + b.y + "px;width:" + T + "px;height:" + b.h + "px;";
  else css = "left:" + (b.x + b.w - T / 2) + "px;top:" + b.y + "px;width:" + T + "px;height:" + b.h + "px;";
  el.style.cssText = "display:block;position:fixed;z-index:55;pointer-events:none;" + css;
  el.style.display = "block"; // tường minh cho chắc (test stub không parse cssText)
}

/* ---------- public API ---------- */
function obStartSteps() {
  OB.active = true; OB.done = false; OB.step = 0; OB.t = 0; OB.stepT = 0;
  OB.spawned.length = 0; OB.knocked = 0; OB.xp0 = 0; OB.bannerShown = false;
  obShowOverlay();
  obEnterStep(0);
}
function obMaybeStart() {
  if (OB.active || OB.done) return;
  try {
    var q = obQs("onboard");
    if (q === "0") return;                                     // ?onboard=0: tắt hẳn
    if (q !== "1" && obLsGet(OB_KEY) === "1") return;           // người cũ: không ép chơi lại
  } catch (e) {}
  try {
    if (typeof G === "undefined" || !G) return;
    if (G.wave !== 0 || G.phase !== "play") return;             // chỉ chạy ở đầu run mới
  } catch (e) { return; }
  obStartSteps();
}
function obFinish(skipped) {
  if (!OB.active) return;
  OB.active = false; OB.done = true;
  obLsSet(OB_KEY, "1");                                        // nhớ: đã học xong
  obClearScripted(true);
  obHideOverlay();
  /* thả wave-break: engine tự gọi startWave(1) trong ~1s (kèm vá cửa sổ + hồi 1 HP) */
  try {
    if (typeof G !== "undefined" && G && G.wave === 0 && G.phase === "play" && G.waveBreak > 1.2) {
      G.waveBreak = 1.2;
    }
  } catch (e) {}
}
function obSkip() {
  if (!OB.active) return;
  try { if (typeof AudioEngine !== "undefined" && AudioEngine && AudioEngine.sfx) AudioEngine.sfx.click(); } catch (e) {}
  obFinish(true);
}
function obTick(dt) {
  if (!OB.active) return;
  var g = null;
  try { g = (typeof G !== "undefined") ? G : null; } catch (e) {}
  if (!g) return;
  if (g.phase !== "play") return;                              // pause/draft/over → đóng băng
  if (g.wave !== 0) { obFinish(false); return; }               // an toàn: đã sang wave khác
  dt = Math.min(Math.max(dt || 0, 0), 0.25);
  if (g.time < OB.t - 0.5) { obStartSteps(); return; }         // resetGame giữa chừng → chạy lại từ đầu
  OB.t += dt; OB.stepT += dt;
  /* giữ wave-break: không cho engine nổ startWave(1) khi đang học */
  try { if (g.waveBreak < 2.0) g.waveBreak = 2.0; } catch (e) {}
  obUpdate(dt);
  obEdgeHighlight();
}
function obIsActive() { return !!OB.active; }
function obIsDone() { return !!OB.done || obLsGet(OB_KEY) === "1"; }

/* đấu nối DOM: nút Bỏ qua + đổi ngôn ngữ giữa chừng */
try {
  var _obSkipBtn = obEl("onboard-skip");
  if (_obSkipBtn && _obSkipBtn.addEventListener) _obSkipBtn.addEventListener("click", function () { obSkip(); });
} catch (e) {}
try {
  if (typeof window !== "undefined" && window.addEventListener) {
    window.addEventListener("wk:lang", function () { if (OB.active) obSetMsg(OB_STEPS[OB.step]); });
  }
} catch (e) {}

if (typeof window !== "undefined") {
  window.Onboard = {
    maybeStart: obMaybeStart, tick: obTick, skip: obSkip,
    isActive: obIsActive, isDone: obIsDone, finish: obFinish,
  };
}
