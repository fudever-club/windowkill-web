/* ============================================================================
 * WINDOWKILL — Tutorial tương tác 10 beat
 * FU-DEVER Game Studio · Engineering
 *
 * Spec: studio/game-design/GAME-DESIGN-DOC.md §9 (10 beat), §12.4/12.5 (copy)
 * File MỚI — không sửa bất kỳ file có sẵn nào. Chạy cùng scope với js/game.js
 * (classic script) nên đọc được các global: G, DIFF, UPS, spawnEnemyAt,
 * bounds, openDraft, AudioEngine, addFloat, Cinema... — TẤT CẢ đều guard
 * try/catch + typeof để game không bao giờ crash vì tutorial.
 *
 * API: window.Tutorial = { start, update, onEvent, draw, skip, isActive,
 *         isDone, beatIndex, isMobile, skipButtonRect }
 * Xem INTEGRATION.md để coordinator đấu nối.
 * ========================================================================== */
(function () {
"use strict";

/* ---------------- helpers ---------------- */
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function now() { try { return performance.now(); } catch (e) { return Date.now(); } }
function win() { try { return typeof window !== "undefined" ? window : null; } catch (e) { return null; } }
function lsGet(k) { try { var w = win(); if (!w || !w.localStorage) return null; return w.localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { var w = win(); if (w && w.localStorage) w.localStorage.setItem(k, v); } catch (e) {} }

/* Game state (global G của game.js) — null khi chưa có / chạy test. */
function gs() {
  try { return (typeof G !== "undefined" && G) ? G : null; } catch (e) { return null; }
}
function shipOf(g) { try { return (g && g.ship) ? g.ship : null; } catch (e) { return null; } }
function boundsOf() {
  try { if (typeof bounds === "function") { var b = bounds(); if (b && isFinite(b.w)) return b; } } catch (e) {}
  return { x: 0, y: 0, w: 960, h: 640 };
}

/* ---------------- copy deck (§12.5: gọi người chơi là "bạn", giữ thuật
 * ngữ Anh wave/draft/XP. Mỗi coach-mark 1 ý, ≤ 12 từ.) ---------------- */
var COPY = {
  "tut.beat1":  { vi: "Di chuyển bằng WASD hoặc phím mũi tên.",
                 en: "Move with WASD or arrow keys.",
                 mvi: "Kéo joystick trái để di chuyển tàu.",
                 men: "Drag the left joystick to move." },
  "tut.beat2":  { vi: "Chĩa chuột vào quái, giữ chuột để bắn.",
                 en: "Aim at a monster, hold to shoot.",
                 mvi: "Kéo joystick phải để ngắm và bắn.",
                 men: "Drag the right joystick to aim and shoot." },
  "tut.beat3":  { vi: "Hạ con quái đầu tiên nào!",
                 en: "Take down your first monster!" },
  "tut.beat4":  { vi: "Nhặt mảnh kính để nạp đầy thanh XP.",
                 en: "Grab the gem to fill the XP bar." },
  "tut.beat5":  { vi: "Lên cấp! Chọn 1 trong 3 nâng cấp.",
                 en: "Level up! Pick 1 of 3 upgrades." },
  "tut.beat6":  { vi: "Quái tím xuất hiện — nó gặm cửa sổ!",
                 en: "A purple monster appears — it chews the window!" },
  "tut.beat7":  { vi: "Bắn vào viền để hất quái văng ra.",
                 en: "Shoot the edge to knock it off." },
  "tut.beat8":  { vi: "Cửa sổ vỡ là thua — như hết tim vậy.",
                 en: "Window broken means defeat — like losing hearts." },
  "tut.beat9":  { vi: "Hết wave — cửa sổ được vá lại.",
                 en: "Wave cleared — the window is repaired." },
  "tut.beat10": { vi: "Sống sót đến wave 5 để gặp boss.",
                 en: "Survive to wave 5 to meet the boss." },
  "tut.skip":   { vi: "Bỏ qua", en: "Skip" },
  "tut.next":   { vi: "Chiến tiếp", en: "Keep fighting" },
  /* Modal + launcher (coordinator render DOM — xem TUTORIAL-MODAL-SPEC.md) */
  "tut.modal.title": { vi: "Học chơi trong 2 phút?", en: "Learn in 2 minutes?" },
  "tut.modal.desc":  { vi: "Hướng dẫn ngắn: điều khiển, bắn quái và bí mật của cửa sổ.",
                      en: "A quick guide: controls, shooting monsters, and the window's secret." },
  "tut.modal.yes":   { vi: "Học ngay", en: "Teach me" },
  "tut.modal.no":    { vi: "Vào game luôn", en: "Play now" },
  "tut.replay":      { vi: "Chơi lại hướng dẫn", en: "Replay tutorial" },
};

/* ---------------- beat table (§9) ---------------- */
var BEATS = [
  { id: "move",      key: "tut.beat1",  timeout: 15, need: 200, needMobile: 150 },
  { id: "aim",       key: "tut.beat2",  timeout: 20, need: 3 },
  { id: "firstkill", key: "tut.beat3",  timeout: 25, need: 1 },
  { id: "gem",       key: "tut.beat4",  timeout: 30, need: 1 },
  { id: "draft",     key: "tut.beat5",  timeout: 0 /* chờ click */ },
  { id: "chewer",    key: "tut.beat6",  timeout: 30 },
  { id: "edgeshot",  key: "tut.beat7",  timeout: 25 },
  { id: "windowhp",  key: "tut.beat8",  timeout: 2.5 },
  { id: "waveclear", key: "tut.beat9",  timeout: 2.5 },
  { id: "bosstease", key: "tut.beat10", timeout: 0 /* chờ nút Chiến tiếp */ },
];

/* 3 nâng cấp đơn giản cho draft đầu (§9 beat 5) */
var SIMPLE_UP_TITLES = ["Tốc bắn +30%", "Sát thương +1", "Tốc độ +18%"];

/* Wave 1 scripted: 5 chaser, spawn xa, 10s đầu an toàn (§9) */
var SCRIPT_TIMES = [1.5, 4.5, 8, 12, 16];
var STORE_VER = "wk_tut_v1_"; // + profileId = "done"

/* ---------------- state ---------------- */
var S = null;
function freshState() {
  return {
    active: false, idx: 0, t: 0, profileId: "default", lang: "vi",
    mobile: false, domSkip: false,
    // scripted wave 1
    scripted: false, scriptT: 0, scriptIdx: 0,
    // counters
    moveAcc: 0, lastX: 0, lastY: 0, hasLast: false,
    hits: 0, kills0: 0, killsSeen: 0, xp0: 0,
    // draft
    wasDraft: false, draftWrapped: false, origOpenDraft: null,
    savedXpNeed: null,
    // chewer
    chewerSpawned: false, chewerRef: null, latchT: 0, latchInfo: null,
    savedChew: null, mercyT: 0,
    // wave clear hold
    // gem scripted
    scriptGem: null,
    // ui rects
    btnRect: null, skipRect: null,
    done: false,
  };
}

/* i18n: window.I18N.t(key) nếu coordinator cung cấp, else built-in. */
function T(key) {
  var c = COPY[key];
  try {
    var w = win();
    if (w && w.I18N && typeof w.I18N.t === "function") {
      var v = null;
      if (S && S.mobile) { try { v = w.I18N.t(key + ".m"); } catch (e) { v = null; } }
      if (v == null || v === key + ".m") { try { v = w.I18N.t(key); } catch (e) { v = null; } }
      if (v != null && v !== key) return v;
    }
  } catch (e) {}
  if (!c) return key;
  var lang = (S && S.lang === "en") ? "en" : "vi";
  if (S && S.mobile) return (lang === "en" ? (c.men || c.en) : (c.mvi || c.vi));
  return lang === "en" ? c.en : c.vi;
}

/* ---------------- scripted wave 1 (§9: 5 chaser, spawn xa, 10s đầu an toàn) ---------------- */
function farCorner(g) {
  var b = boundsOf(), s = shipOf(g);
  var sx = s ? s.x : b.x + b.w / 2, sy = s ? s.y : b.y + b.h / 2;
  var corners = [
    { x: b.x + 40, y: b.y + 40 }, { x: b.x + b.w - 40, y: b.y + 40 },
    { x: b.x + 40, y: b.y + b.h - 40 }, { x: b.x + b.w - 40, y: b.y + b.h - 40 },
  ];
  var best = corners[0], bd = -1;
  for (var i = 0; i < corners.length; i++) {
    var dx = corners[i].x - sx, dy = corners[i].y - sy, d = dx * dx + dy * dy;
    if (d > bd) { bd = d; best = corners[i]; }
  }
  return best;
}
function applyWave1Script(g) {
  if (!g) return;
  try {
    if (g.spawnQueue) g.spawnQueue.length = 0; // wave 1 chạy scripted, không random
    if (typeof g.spawnT !== "undefined") g.spawnT = 0;
  } catch (e) {}
  S.scripted = true; S.scriptT = 0; S.scriptIdx = 0;
}
function updateScript(dt) {
  if (!S.scripted || S.scriptIdx >= SCRIPT_TIMES.length) return;
  S.scriptT += dt;
  while (S.scriptIdx < SCRIPT_TIMES.length && S.scriptT >= SCRIPT_TIMES[S.scriptIdx]) {
    var n = S.scriptIdx++;
    var g = gs();
    try {
      if (typeof spawnEnemyAt === "function") {
        var p = farCorner(g);
        var e = spawnEnemyAt("chaser", p.x, p.y);
        if (e && n < 3) e.speed *= 0.55; // 3 con đầu chậm — 10s đầu an toàn
      }
    } catch (err) {}
  }
}

/* ---------------- draft beat 5: chỉ 3 nâng cấp đơn giản ----------------
 * Wrap runtime openDraft (không sửa file): trong tutorial, draft đầu chỉ
 * hiện Tốc bắn +30% / Sát thương +1 / Tốc độ +18%. */
function simplePicks() {
  try {
    if (typeof UPS === "undefined" || !UPS || !UPS.length) return null;
    var out = [];
    for (var i = 0; i < SIMPLE_UP_TITLES.length; i++) {
      var u = null;
      for (var j = 0; j < UPS.length; j++) if (UPS[j].t === SIMPLE_UP_TITLES[i]) { u = UPS[j]; break; }
      if (u) out.push(u);
    }
    return out.length === 3 ? out : null;
  } catch (e) { return null; }
}
function armDraftWrap() {
  if (S.draftWrapped) return;
  try {
    if (typeof openDraft !== "function") return;
    // đã wrap từ session trước (chưa disarm) → tái dùng, không wrap chồng
    if (openDraft.__tutWrapped) {
      S.origOpenDraft = openDraft.__tutOrig || null;
      S.draftWrapped = true;
      return;
    }
    var orig = openDraft;
    var wrapped = function () {
      var gg = gs();
      var origFn = wrapped.__tutOrig;
      if (!S.active || !gg || typeof origFn !== "function") { return origFn(); }
      var picks = simplePicks();
      if (!picks) { return origFn(); } // fallback: draft gốc
      try {
        gg.phase = "draft";
        Tutorial.onEvent("draftOpened", {});
        var w = win();
        if (w && w.Cinema && typeof w.Cinema.showDraft === "function") {
          var ups = picks.map(function (u) {
            return { name: u.t, desc: u.d, icon: '<svg class="ic" aria-hidden="true"><use href="#' + u.ico + '"></use></svg>' };
          });
          w.Cinema.showDraft(ups, function (idx2) {
            var u = picks[idx2];
            var g2 = gs();
            try { if (u && g2 && g2.ship) u.apply(g2.ship); } catch (e) {}
            try { if (w.AudioEngine && w.AudioEngine.sfx) w.AudioEngine.sfx.up(); } catch (e) {}
            try { if (typeof addFloat === "function" && g2 && g2.ship) addFloat(g2.ship.x, g2.ship.y - 32, u.t, "#9df3ff", true); } catch (e) {}
            if (g2) g2.phase = "play";
            try { lastT = now(); } catch (e) {}
            Tutorial.onEvent("draftClosed", { pick: u ? u.t : null });
          }, (gg.ship ? { x: gg.ship.x, y: gg.ship.y } : {}));
          return;
        }
      } catch (err) { /* rơi xuống fallback */ }
      // Fallback: DOM legacy (giống openDraftLegacy của game.js, 3 thẻ đơn giản)
      try {
        var doc = w && w.document;
        var box = doc && doc.getElementById("draft-cards");
        if (box && doc) {
          box.innerHTML = "";
          picks.forEach(function (u) {
            var d = doc.createElement("div"); d.className = "card";
            d.innerHTML = '<div class="ico"><svg class="ic" aria-hidden="true"><use href="#' + u.ico + '"></use></svg></div>' +
              '<div class="t"></div><div class="d"></div>';
            d.querySelector(".t").textContent = u.t;
            d.querySelector(".d").textContent = u.d;
            d.onclick = function () {
              var g2 = gs();
              try { if (g2 && g2.ship) u.apply(g2.ship); } catch (e) {}
              try { if (w.AudioEngine && w.AudioEngine.sfx) w.AudioEngine.sfx.up(); } catch (e) {}
              try { if (typeof addFloat === "function" && g2 && g2.ship) addFloat(g2.ship.x, g2.ship.y - 32, u.t, "#9df3ff", true); } catch (e) {}
              var ov = doc.getElementById("ov-draft"); if (ov) ov.classList.remove("show");
              if (g2) g2.phase = "play";
              try { lastT = now(); } catch (e) {}
              Tutorial.onEvent("draftClosed", { pick: u.t });
            };
            box.appendChild(d);
          });
          var ovd = doc.getElementById("ov-draft"); if (ovd) ovd.classList.add("show");
          return;
        }
      } catch (err2) {}
      return origFn(); // hết cách → draft gốc
    };
    wrapped.__tutWrapped = true;
    wrapped.__tutOrig = orig;
    openDraft = wrapped;
    S.origOpenDraft = orig;
    S.draftWrapped = true;
  } catch (e) {}
}
function disarmDraftWrap() {
  if (!S.draftWrapped) return;
  try {
    var cur = (typeof openDraft !== "undefined") ? openDraft : null;
    var orig = (cur && cur.__tutWrapped) ? cur.__tutOrig : S.origOpenDraft;
    if (typeof orig === "function") openDraft = orig;
  } catch (e) {}
  S.draftWrapped = false; S.origOpenDraft = null;
}

/* ---------------- chewer (beat 6/7) ---------------- */
function spawnTutorialChewer() {
  var g = gs();
  try {
    if (typeof spawnEnemyAt !== "function") return null;
    var b = boundsOf();
    // spawn lệch về phía viền trên → chewer đi thẳng ra viền rồi bám
    var e = spawnEnemyAt("chewer", b.x + b.w / 2 + 60, b.y + b.h * 0.32);
    if (e) { S.chewerSpawned = true; S.chewerRef = e; }
    return e;
  } catch (err) { return null; }
}
function findLatchedChewer(g) {
  try {
    if (!g || !g.enemies) return null;
    for (var i = 0; i < g.enemies.length; i++) {
      var e = g.enemies[i];
      if (e && !e.dead && e.type === "chewer" && e.latched) return e;
    }
  } catch (err) {}
  return null;
}
function mercyOn() {
  try {
    if (typeof DIFF !== "undefined" && DIFF && S.savedChew == null) {
      S.savedChew = DIFF.chew; DIFF.chew = DIFF.chew * 2; // tốc gặm -50%
      S.mercyT = 15;
    }
  } catch (e) {}
}
function mercyOff() {
  try {
    if (typeof DIFF !== "undefined" && DIFF && S.savedChew != null) { DIFF.chew = S.savedChew; }
  } catch (e) {}
  S.savedChew = null; S.mercyT = 0;
}

/* ---------------- beat machine ---------------- */
function cur() { return BEATS[S.idx]; }
function gotoBeat(i) {
  if (!S.active) return;
  exitBeat(S.idx);
  S.idx = i; S.t = 0;
  enterBeat(i);
}
function nextBeat() { gotoBeat(Math.min(S.idx + 1, BEATS.length - 1)); }

function enterBeat(i) {
  var g = gs(), s = shipOf(g);
  switch (BEATS[i].id) {
    case "move":
      S.moveAcc = 0; S.hasLast = false;
      if (s) { S.lastX = s.x; S.lastY = s.y; S.hasLast = true; }
      break;
    case "aim": S.hits = 0; break;
    case "firstkill": S.kills0 = g ? g.kills | 0 : 0; S.killsSeen = 0; break;
    case "gem":
      S.xp0 = g ? g.xp | 0 : 0;
      // override xpNeed = 1 trong tutorial (§9 beat 4)
      try { if (g && S.savedXpNeed == null) { S.savedXpNeed = g.xpNeed; g.xpNeed = 1; } } catch (e) {}
      // backup: rớt 1 gem scripted cạnh tàu nếu chưa có gem nào
      try {
        if (g && g.gems && !g.gems.length && s) {
          var gem = { x: s.x + 90, y: s.y - 70, vx: 0, vy: 0, v: 1, t: 0, tut: true };
          g.gems.push(gem); S.scriptGem = gem;
        }
      } catch (e) {}
      break;
    case "chewer":
      S.latchT = 0; S.chewerSpawned = false; S.chewerRef = null; S.latchInfo = null;
      spawnTutorialChewer();
      break;
    case "edgeshot": mercyOn(); break; // ân huệ newbie: tốc gặm -50% trong 15s
    case "bosstease": holdWaveBreak(); break;
  }
}
function exitBeat(i) {
  switch (BEATS[i].id) {
    case "edgeshot": mercyOff(); break;
  }
}
function holdWaveBreak() {
  try { var g = gs(); if (g && g.wave === 1 && typeof g.waveBreak === "number") g.waveBreak = 30; } catch (e) {}
}

/* Poll những gì đo được trực tiếp từ G (coordinator không cần gửi). */
function poll(g, dt) {
  var s = shipOf(g);
  // di chuyển
  if (s && S.idx === 0) {
    if (!S.hasLast) { S.lastX = s.x; S.lastY = s.y; S.hasLast = true; }
    else {
      var dx = s.x - S.lastX, dy = s.y - S.lastY;
      S.moveAcc += Math.sqrt(dx * dx + dy * dy);
      S.lastX = s.x; S.lastY = s.y;
    }
  }
  // kill
  if (S.idx === 2) S.killsSeen = Math.max(S.killsSeen, (g.kills | 0) - S.kills0);
  // gem/XP (beat 4 qua khi XP tăng = đã nhặt gem)
  if (S.idx === 3) {
    var xp = g.xp | 0;
    if (xp > S.xp0) passBeat();
  }
  // draft phase
  if (g.phase === "draft" && !S.wasDraft) { S.wasDraft = true; onEvent("draftOpened", {}); }
  if (g.phase !== "draft" && S.wasDraft && S.idx === 4) { S.wasDraft = false; onEvent("draftClosed", {}); }
  else if (g.phase !== "draft") S.wasDraft = false;
  // chewer bám viền
  if (S.idx === 5) {
    var c = findLatchedChewer(g);
    if (c) {
      if (!S.chewerRef || S.chewerRef !== c) { S.chewerRef = c; S.latchT = 0; }
      S.latchT += dt;
      S.latchInfo = { edge: c.latched, x: c.x, y: c.y };
      if (S.latchT >= 1) nextBeat();
    } else if (S.chewerSpawned) {
      // chewer bị giết trước khi bám → nhảy thẳng beat 8 (§9)
      var ref = S.chewerRef;
      if (ref && ref.dead) gotoBeat(7);
      else if (ref && !inEnemies(g, ref)) gotoBeat(7);
    }
  }
  // beat 7: chewer văng ra / bị hạ
  if (S.idx === 6) {
    var r = S.chewerRef;
    if (r) {
      S.latchInfo = r.latched ? { edge: r.latched, x: r.x, y: r.y } : S.latchInfo;
      if (r.dead || !r.latched || !inEnemies(g, r)) nextBeat();
    } else {
      var c2 = findLatchedChewer(g);
      if (c2) { S.chewerRef = c2; S.latchInfo = { edge: c2.latched, x: c2.x, y: c2.y }; }
    }
  }
  // beat 8 (windowhp): đọc 2.5s rồi chờ waveClear(1) mới sang beat 9
  if (S.idx === 7 && S.t >= 2.5 && g.wave === 1 && g.waveClearShown) gotoBeat(8);
  // wave 1 đã clear → giữ waveBreak: wave 2 chờ đến khi bấm "Chiến tiếp"
  if (g.wave === 1 && g.waveClearShown && typeof g.waveBreak === "number" && g.waveBreak < 20) {
    g.waveBreak = 30;
  }
  // gem scripted tự bay về sau 8s (§9 beat 4)
  if (S.idx === 3 && S.t > 8 && S.scriptGem && s) {
    var gm = S.scriptGem;
    try {
      if (g.gems && g.gems.indexOf(gm) >= 0) {
        var gx = s.x - gm.x, gy = s.y - gm.y, gd = Math.sqrt(gx * gx + gy * gy) || 1;
        var sp = 420;
        gm.x += gx / gd * sp * dt; gm.y += gy / gd * sp * dt;
      } else S.scriptGem = null;
    } catch (e) { S.scriptGem = null; }
  }
  // ân huệ newbie hết 15s → trả tốc gặm
  if (S.mercyT > 0) { S.mercyT -= dt; if (S.mercyT <= 0) mercyOff(); }
}
function inEnemies(g, ref) {
  try { return g.enemies && g.enemies.indexOf(ref) >= 0; } catch (e) { return false; }
}

function passBeat() { if (S.active) nextBeat(); }

/* update theo từng beat: passCondition + timeout (§9) */
function beatUpdate(dt) {
  var b = cur();
  S.t += dt;
  switch (b.id) {
    case "move": {
      var need = S.mobile ? b.needMobile : b.need;
      if (S.moveAcc >= need) nextBeat();
      else if (b.timeout && S.t >= b.timeout) nextBeat();
      break;
    }
    case "aim":
      if (S.hits >= b.need) nextBeat();
      else if (b.timeout && S.t >= b.timeout) nextBeat();
      break;
    case "firstkill":
      if (S.killsSeen >= b.need) nextBeat();
      else if (b.timeout && S.t >= b.timeout) nextBeat();
      break;
    case "gem":
      // qua khi nhặt (poll) hoặc timeout → ép lên cấp bằng chính gainXp của game
      if (b.timeout && S.t >= b.timeout) {
        try {
          var g2 = gs();
          if (g2 && g2.phase === "play" && typeof gainXp === "function") { g2.xpNeed = 1; gainXp(1); }
        } catch (e) {}
        nextBeat();
      }
      break;
    case "draft":
      // trừ draft: chờ click, không timeout; failsafe nếu draft chưa từng mở
      if (S.t > 60) {
        try {
          var g3 = gs();
          if (g3 && g3.phase !== "draft" && typeof gainXp === "function") { g3.xpNeed = 1; gainXp(1); }
        } catch (e) {}
        S.t = 0;
      }
      break;
    case "chewer":
      if (b.timeout && S.t >= b.timeout) gotoBeat(7); // quá lâu → nhảy beat 8
      break;
    case "edgeshot":
      if (b.timeout && S.t >= b.timeout) nextBeat();
      break;
    case "windowhp": break; // đọc 2.5s; poll chờ waveClear(1) rồi sang beat 9
    case "waveclear":
      if (S.t >= b.timeout) nextBeat();
      break;
    case "bosstease": break; // chờ nút Chiến tiếp
  }
}

/* ---------------- public API ---------------- */
function detectMobile() {
  try {
    var w = win(); if (!w) return false;
    if (w.navigator && w.navigator.maxTouchPoints > 0) return true;
    if ("ontouchstart" in w) return true;
  } catch (e) {}
  return false;
}
function start(opts) {
  opts = opts || {};
  S = freshState();
  S.active = true; S.done = false;
  S.profileId = String(opts.profileId || "default");
  S.lang = opts.lang === "en" ? "en" : "vi";
  S.mobile = typeof opts.mobile === "boolean" ? opts.mobile : detectMobile();
  S.domSkip = !!opts.domSkip; // coordinator tự vẽ nút Bỏ qua (DOM)
  armDraftWrap();
  var g = gs();
  if (g) { S.kills0 = g.kills | 0; S.xp0 = g.xp | 0; }
  enterBeat(0);
  return true;
}
function cleanup(releaseWave) {
  try { disarmDraftWrap(); } catch (e) {}
  try { mercyOff(); } catch (e) {}
  try {
    var g = gs();
    if (g) {
      if (S.savedXpNeed != null && S.idx === 3) g.xpNeed = S.savedXpNeed; // skip giữa beat 4
      if (releaseWave && g.wave === 1 && typeof g.waveBreak === "number" && g.waveBreak > 5) g.waveBreak = 0.4;
    }
  } catch (e) {}
  S.savedXpNeed = null;
}
function skip() {
  if (!S || !S.active) return;
  cleanup(true);
  S.active = false; // skip KHÔNG lưu done — modal sẽ hiện lại lần sau
}
function complete() {
  if (!S || !S.active) return;
  try { lsSet(STORE_VER + S.profileId, "done"); } catch (e) {}
  cleanup(true);
  S.active = false; S.done = true;
}
function isActive() { return !!(S && S.active); }
function isDone(profileId) {
  try { return lsGet(STORE_VER + String(profileId || "default")) === "done"; }
  catch (e) { return false; }
}
function beatIndex() { return S ? S.idx : -1; }

/* Coordinator gọi khi các sự kiện xảy ra (xem INTEGRATION.md).
 * Những gì poll được (di chuyển, kill, gem, draft, latch, waveClear)
 * Tutorial tự đo — onEvent là kênh bổ sung/bắt buộc cho:
 * bulletHit, tap, key (không poll được). */
function onEvent(name, data) {
  if (!S || !S.active) return;
  data = data || {};
  var g = gs();
  switch (name) {
    case "playerMove": if (S.idx === 0 && data.dist > 0) S.moveAcc += data.dist; break;
    case "bulletHit": if (S.idx === 1) S.hits++; break;
    case "kill":
      if (S.idx === 2 && g) S.killsSeen = Math.max(S.killsSeen, (g.kills | 0) - S.kills0);
      break;
    case "gemPickup": if (S.idx === 3) passBeat(); break;
    case "draftOpened": S.wasDraft = true; break;
    case "draftClosed":
      S.wasDraft = false;
      if (S.idx === 4) { disarmDraftWrap(); nextBeat(); } // draft đầu xong → trả draft gốc
      break;
    case "chewerLatch":
      if (S.idx === 5 && data) {
        S.latchT = Math.max(S.latchT, 0.01);
        S.latchInfo = { edge: data.edge, x: data.x, y: data.y };
      }
      break;
    case "chewerKnockoff":
    case "chewerKilled":
      if (S.idx === 5) gotoBeat(7);       // giết trước khi bám → nhảy beat 8
      else if (S.idx === 6) nextBeat();    // văng/hạ trong beat 7 → qua
      break;
    case "waveClear":
      if (data.wave === 1 && S.idx === 7 && S.t >= 2.5) gotoBeat(8);
      break;
    case "tap": handleTap(data.x, data.y); break;
    case "key":
      if ((data.code === "Enter" || data.code === "Space" || data.code === "NumpadEnter") && S.idx === 9) complete();
      break;
  }
}
function handleTap(x, y) {
  if (x == null || y == null) return;
  if (!S.domSkip && S.skipRect && x >= S.skipRect.x && x <= S.skipRect.x + S.skipRect.w &&
      y >= S.skipRect.y && y <= S.skipRect.y + S.skipRect.h) { skip(); return; }
  if (S.idx === 9 && S.btnRect && x >= S.btnRect.x && x <= S.btnRect.x + S.btnRect.w &&
      y >= S.btnRect.y && y <= S.btnRect.y + S.btnRect.h) { complete(); }
}
function skipButtonRect() { return S && S.skipRect ? { x: S.skipRect.x, y: S.skipRect.y, w: S.skipRect.w, h: S.skipRect.h } : null; }

function update(dt) {
  if (!S || !S.active) return;
  var g = gs();
  if (!g) return;
  try {
    if (g.phase === "over") { cleanup(false); S.active = false; return; } // chết → hủy tutorial
    if (g.phase === "pause") return; // pause → đóng băng timer
    dt = Math.min(Math.max(dt || 0, 0), 0.25);
    if (!S.scripted && g.wave === 1) applyWave1Script(g);
    updateScript(dt);
    poll(g, dt);
    if (S.active) beatUpdate(dt);
  } catch (err) { /* tutorial không bao giờ được crash game */ }
}

/* ---------------- coach-mark renderer ----------------
 * draw(ctx): text ≤12 từ gần đối tượng liên quan, dim nền nhẹ,
 * KHÔNG chặn input (canvas thuần, không tạo DOM — trừ overlay draft của game). */
function rr(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
function wrapText(c, text, maxW) {
  var words = String(text).split(/\s+/), lines = [], line = "";
  for (var i = 0; i < words.length; i++) {
    var t = line ? line + " " + words[i] : words[i];
    if (c.measureText(t).width > maxW && line) { lines.push(line); line = words[i]; }
    else line = t;
  }
  if (line) lines.push(line);
  return lines;
}
function drawPanel(c, ax, ay, text, W, H) {
  var maxW = Math.min(250, W * 0.7);
  c.font = "14px system-ui, -apple-system, 'Segoe UI', sans-serif";
  var lines = wrapText(c, text, maxW - 20);
  var lh = 20, pw = 0;
  for (var i = 0; i < lines.length; i++) pw = Math.max(pw, c.measureText(lines[i]).width);
  pw += 20; var ph = lines.length * lh + 16;
  var px = clamp(ax - pw / 2, 8, W - pw - 8);
  var py = ay - ph - 18;
  if (py < 8) py = ay + 26; // hết chỗ phía trên → vẽ dưới
  if (py + ph > H - 8) py = H - ph - 8;
  c.save();
  c.shadowColor = "rgba(0,128,255,0.55)"; c.shadowBlur = 14;
  rr(c, px, py, pw, ph, 10);
  c.fillStyle = "rgba(6,14,28,0.9)"; c.fill();
  c.shadowBlur = 0;
  c.strokeStyle = "rgba(0,128,255,0.8)"; c.lineWidth = 1.5; c.stroke();
  c.fillStyle = "#f2f7ff"; c.textAlign = "left"; c.textBaseline = "top";
  for (var j = 0; j < lines.length; j++) c.fillText(lines[j], px + 10, py + 8 + j * lh);
  c.restore();
}
function drawSkipPill(c, W) {
  var label = T("tut.skip");
  c.font = "600 13px system-ui, sans-serif";
  var w = c.measureText(label).width + 26, h = 30;
  // MOBILE 2026-10-03: trước đây (12,12) đè lên dãy tim HUD (vẽ ở 14,32) trên mọi
  // màn hình. Chuyển sang góc phải, dưới 2 nút HUD DOM (cao ~54px) để không
  // chồng bất cứ thứ gì: tim/WAVE bên trái, thanh máu cửa sổ ở giữa-trên.
  var x = W - w - 12, y = 62;
  c.save();
  rr(c, x, y, w, h, 15);
  c.fillStyle = "rgba(6,14,28,0.72)"; c.fill();
  c.strokeStyle = "rgba(148,163,184,0.6)"; c.lineWidth = 1; c.stroke();
  c.fillStyle = "#cbd5e1"; c.textAlign = "center"; c.textBaseline = "middle";
  c.fillText(label, x + w / 2, y + h / 2 + 1);
  c.restore();
  S.skipRect = { x: x, y: y, w: w, h: h };
}
function drawNextButton(c, W, H) {
  var label = T("tut.next");
  c.font = "700 16px system-ui, sans-serif";
  var w = Math.max(180, c.measureText(label).width + 52), h = 48;
  var x = W / 2 - w / 2, y = H * 0.70;
  var pulse = 0.5 + 0.5 * Math.sin(now() / 280);
  c.save();
  c.shadowColor = "rgba(0,128,255,0.7)"; c.shadowBlur = 18 + 10 * pulse;
  rr(c, x, y, w, h, 14);
  var gr = c.createLinearGradient(x, y, x, y + h);
  gr.addColorStop(0, "#0a84ff"); gr.addColorStop(1, "#0057b8");
  c.fillStyle = gr; c.fill();
  c.shadowBlur = 0;
  c.fillStyle = "#fff"; c.textAlign = "center"; c.textBaseline = "middle";
  c.fillText(label, x + w / 2, y + h / 2 + 1);
  c.restore();
  S.btnRect = { x: x, y: y, w: w, h: h };
}
function drawEdgeFlash(c) {
  var li = S.latchInfo; if (!li) return;
  var b = boundsOf();
  var pulse = 0.45 + 0.55 * Math.abs(Math.sin(now() / 220));
  c.save();
  c.strokeStyle = "rgba(192,132,252," + pulse.toFixed(2) + ")";
  c.lineWidth = 7; c.lineCap = "round";
  var x = clamp(li.x, b.x, b.x + b.w), y = clamp(li.y, b.y, b.y + b.h), L = 70;
  c.beginPath();
  if (li.edge === "top") { c.moveTo(x - L, b.y); c.lineTo(x + L, b.y); }
  else if (li.edge === "bottom") { c.moveTo(x - L, b.y + b.h); c.lineTo(x + L, b.y + b.h); }
  else if (li.edge === "left") { c.moveTo(b.x, y - L); c.lineTo(b.x, y + L); }
  else { c.moveTo(b.x + b.w, y - L); c.lineTo(b.x + b.w, y + L); }
  c.stroke();
  // mũi tên chỉ điểm bám (§9 beat 7 — signature)
  var ax = x, ay = y, dx = 0, dy = 0;
  if (li.edge === "top") { ay = y + 52; dy = -1; }
  else if (li.edge === "bottom") { ay = y - 52; dy = 1; }
  else if (li.edge === "left") { ax = x + 52; dx = -1; }
  else { ax = x - 52; dx = 1; }
  var bob = 6 * Math.sin(now() / 200);
  ax += dx * bob; ay += dy * bob;
  c.fillStyle = "rgba(255,214,102," + (0.65 + 0.35 * pulse).toFixed(2) + ")";
  c.beginPath();
  var s2 = 13;
  if (dy === -1) { c.moveTo(ax, ay - s2); c.lineTo(ax - s2 * 0.8, ay + s2 * 0.6); c.lineTo(ax + s2 * 0.8, ay + s2 * 0.6); }
  else if (dy === 1) { c.moveTo(ax, ay + s2); c.lineTo(ax - s2 * 0.8, ay - s2 * 0.6); c.lineTo(ax + s2 * 0.8, ay - s2 * 0.6); }
  else if (dx === -1) { c.moveTo(ax - s2, ay); c.lineTo(ax + s2 * 0.6, ay - s2 * 0.8); c.lineTo(ax + s2 * 0.6, ay + s2 * 0.8); }
  else { c.moveTo(ax + s2, ay); c.lineTo(ax - s2 * 0.6, ay - s2 * 0.8); c.lineTo(ax - s2 * 0.6, ay + s2 * 0.8); }
  c.closePath(); c.fill();
  c.restore();
}
function beatAnchor() {
  var g = gs(), s = shipOf(g), b = boundsOf();
  var id = cur().id;
  if ((id === "move" || id === "aim" || id === "firstkill") && s) return { x: s.x, y: s.y - 20 };
  if (id === "gem") {
    if (S.scriptGem) return { x: S.scriptGem.x, y: S.scriptGem.y - 14 };
    if (g && g.gems && g.gems.length) return { x: g.gems[0].x, y: g.gems[0].y - 14 };
    if (s) return { x: s.x, y: s.y - 20 };
  }
  if (id === "chewer" && S.chewerRef && !S.chewerRef.dead) return { x: S.chewerRef.x, y: S.chewerRef.y - 18 };
  if (id === "edgeshot" && S.latchInfo) return { x: S.latchInfo.x, y: S.latchInfo.y + (S.latchInfo.edge === "top" ? 110 : S.latchInfo.edge === "bottom" ? -110 : 0) };
  if (id === "windowhp") return { x: b.x + b.w / 2, y: b.y + 60 };
  if (id === "waveclear") return { x: b.x + b.w / 2, y: b.y + b.h / 2 - 60 };
  if (id === "bosstease" && S.btnRect) return { x: S.btnRect.x + S.btnRect.w / 2, y: S.btnRect.y - 10 };
  if (s) return { x: s.x, y: s.y - 20 };
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
}
function draw(ctx) {
  if (!S || !S.active || !ctx) return;
  try {
    var c = ctx;
    // MOBILE 2026-10-03: canvas.width/height giờ là device px (DPR) — coach-mark
    // cần CSS px → dùng clientWidth/clientHeight
    var W = c.canvas ? (c.canvas.clientWidth || window.innerWidth || 960) : 960,
        H = c.canvas ? (c.canvas.clientHeight || window.innerHeight || 640) : 640;
    var id = cur().id;
    // dim nhẹ khi cần tập trung (beat 6/7)
    if (id === "chewer" || id === "edgeshot") {
      c.save(); c.fillStyle = "rgba(2,4,12,0.28)"; c.fillRect(0, 0, W, H); c.restore();
      if (id === "edgeshot") drawEdgeFlash(c);
    }
    // beat 5: overlay draft (DOM) của game che canvas → không vẽ coach-mark
    if (id !== "draft") {
      if (id === "bosstease") drawNextButton(c, W, H);
      var a = beatAnchor();
      drawPanel(c, a.x, a.y, T(cur().key), W, H);
    }
    if (!S.domSkip) drawSkipPill(c, W);
  } catch (err) { /* vẽ lỗi không được crash game */ }
}

/* ---------------- export ---------------- */
var Tutorial = {
  start: start, update: update, onEvent: onEvent, draw: draw,
  skip: skip, isActive: isActive, isDone: isDone, beatIndex: beatIndex,
  isMobile: function () { return !!(S && S.mobile); },
  skipButtonRect: skipButtonRect,
  version: 1,
};
(function expose() {
  try { var w = win(); if (w) w.Tutorial = Tutorial; } catch (e) {}
  try { if (typeof module !== "undefined" && module.exports) module.exports = Tutorial; } catch (e) {}
})();
})();
