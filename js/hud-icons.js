/* =====================================================================
   WINDOWKILL — HUDIcons: pre-render SVG symbol -> offscreen canvas cache
   (Hướng 3 / A0 — design system)

   Canvas không vẽ <svg><use> trực tiếp được. Module này đọc <symbol> trong
   inline sprite của game.html, rasterize MỘT LẦN sang offscreen canvas rồi
   cache theo key `${id}_${px}_${color}`. Render loop chỉ drawImage — KHÔNG
   BAO GIỜ vẽ vector trong frame (perf).

   Cách hoạt động: lấy viewBox + innerHTML của symbol, bọc thành
     <svg xmlns viewBox="..."><g fill="none|COLOR" stroke="COLOR"
       stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
       ...paths (currentColor -> COLOR)...</g></svg>
   rồi encode thành data:image/svg+xml. Path có fill="currentColor"
   stroke="none" (mắt skull, chi tiết đặc) được tô đặc theo màu yêu cầu.

   API:
     HUDIcons.get(id, px, color, fill)      -> HTMLCanvasElement (đã cache)
     HUDIcons.draw(ctx, id, px, color, x, y, fill=false)
                                           // vẽ TÂM tại (x, y)
     HUDIcons.splitFloat(text)             -> { icons:[ids], text } | null
                                           // tách emoji khỏi float text
     HUDIcons.drawTextIcon(ctx, icon, px, color, text, cx, y)
                                           // text canh giữa tại cx, icon
                                           // nằm trái text (float/banner)
     HUDIcons.FONT                         // font stack khớp DOM
     HUDIcons.ready()                      // version tăng khi 1 icon load xong
   ===================================================================== */
(function () {
  "use strict";

  var FONT = '"Segoe UI", system-ui, -apple-system, sans-serif';

  var cache = new Map();   // key -> HTMLCanvasElement
  var loading = new Set(); // key đang rasterize
  var _ready = 0;

  function getDpr() {
    return (typeof window.devicePixelRatio === "number" && window.devicePixelRatio > 0)
      ? window.devicePixelRatio : 1;
  }

  function symbolInfo(id) {
    var sym = document.getElementById(id);
    if (!sym) return null;
    return { vb: sym.getAttribute("viewBox") || "0 0 24 24", html: sym.innerHTML || "" };
  }

  function drawDiamond(g, px, d) {
    // Fallback khi symbol không tồn tại: hình thoi 12px #8fb0d8 (dễ phát hiện khi QA)
    g.save();
    g.scale(d, d);
    g.translate(px / 2, px / 2);
    g.fillStyle = "#8fb0d8";
    g.beginPath();
    g.moveTo(0, -6); g.lineTo(5, 0); g.lineTo(0, 6); g.lineTo(-5, 0);
    g.closePath(); g.fill();
    g.restore();
  }

  function get(id, px, color, fill) {
    px = Math.max(1, Math.round(px || 16));
    color = color || "#ffffff";
    var key = id + "_" + px + "_" + color + (fill ? "_f" : "");
    var cv = cache.get(key);
    if (cv) return cv;
    var d = getDpr();
    cv = document.createElement("canvas");
    cv.width = Math.max(1, Math.round(px * d));
    cv.height = Math.max(1, Math.round(px * d));
    cv.__wkPx = px;
    cache.set(key, cv); // trả canvas (rỗng) ngay — vẽ vào sau khi Image load
    var info = symbolInfo(id);
    if (!info) { drawDiamond(cv.getContext("2d"), px, d); _ready++; return cv; }
    if (loading.has(key)) return cv;
    loading.add(key);
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + info.vb + '">' +
      '<g fill="' + (fill ? color : "none") + '" stroke="' + color +
      '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      info.html.split("currentColor").join(color) +
      "</g></svg>";
    var img = new Image();
    img.onload = function () {
      try {
        var g = cv.getContext("2d");
        g.clearRect(0, 0, cv.width, cv.height);
        g.drawImage(img, 0, 0, cv.width, cv.height);
      } catch (e) { /* giữ canvas rỗng */ }
      loading.delete(key);
      _ready++;
    };
    img.onerror = function () { loading.delete(key); };
    img.src = "data:image/svg+xml;utf8," + encodeURIComponent(svg);
    return cv;
  }

  function draw(ctx, id, px, color, x, y, fill) {
    var cv = get(id, px, color, !!fill);
    var w = cv.__wkPx || px;
    ctx.drawImage(cv, x - w / 2, y - w / 2, w, w);
  }

  /* ---- emoji -> icon cho float text (A3): tách emoji, vẽ icon bên trái ---- */
  var FLOAT_EMOJI = [
    ["❤️", "i-heart"], ["💔", "i-heart-crack"], ["💘", "i-heart"],
    ["💣", "i-bomb"], ["🔥", "i-fire"], ["🧲", "i-magnet"],
    ["⚠", "i-alert"], ["❄", "i-snow"], ["✨", "i-sparkles"],
    ["👑", "i-trophy"], ["🦷", "i-fang"], ["🩸", "i-drop"],
    ["🛡", "i-shield"], ["💎", "i-gem"], ["🪟", "i-window"],
    ["🔦", "i-flash"],
  ];

  function splitFloat(text) {
    if (typeof text !== "string") return null;
    var hits = [];
    for (var i = 0; i < FLOAT_EMOJI.length; i++) {
      var emo = FLOAT_EMOJI[i][0], ix = text.indexOf(emo);
      while (ix >= 0) {
        hits.push({ ix: ix, id: FLOAT_EMOJI[i][1] });
        ix = text.indexOf(emo, ix + emo.length);
      }
    }
    if (!hits.length) return null;
    hits.sort(function (a, b) { return a.ix - b.ix; });
    var clean = text;
    for (var j = 0; j < FLOAT_EMOJI.length; j++) clean = clean.split(FLOAT_EMOJI[j][0]).join("");
    clean = clean.replace(/\s+/g, " ").trim();
    return {
      icons: hits.map(function (h) { return h.id; }),
      text: clean,
    };
  }

  // text canh giữa tại (cx, y); icon px nằm bên trái text (gap 4px)
  function drawTextIcon(ctx, icon, px, color, text, cx, y) {
    var tw = ctx.measureText(text).width;
    var tx = cx - tw / 2; // mép trái text
    if (icon) draw(ctx, icon, px, color, tx - 4 - px / 2, y - px / 2, false);
    ctx.fillText(text, cx, y);
  }

  window.HUDIcons = {
    FONT: FONT,
    get: get,
    draw: draw,
    splitFloat: splitFloat,
    drawTextIcon: drawTextIcon,
    ready: function () { return _ready; },
  };
})();
