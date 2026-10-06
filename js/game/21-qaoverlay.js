/* ---------------- QA overlay (?qa=1) ----------------
 * Chế độ đo hiệu năng + hiển thị touch point cho test máy thật.
 * Chỉ bật khi URL có ?qa=1 (hoặc &qa=1). Game thường KHÔNG đổi gì.
 * - Góc trái trên: FPS (avg 1s + low 1s), số quái, wave, số touch.
 * - Mỗi touch đang active: vòng tròn vàng + ID → kiểm tra multi-touch
 *   (2 joystick cùng lúc có bị rớt touch không).
 * - Tắt: nút "QA x" góc phải trên, hoặc mở lại với ?qa=0.
 * Perf: vẽ vài hình đơn giản mỗi frame; text cập nhật 4 lần/giây.
 *
 * Test: tests/qa-overlay.test.js (sandbox vm, không cần browser).
 */

/* Pure: parse query string → bật QA overlay? Testable độc lập. */
function qaParseEnabled(search) {
  try {
    return new URLSearchParams(search || "").get("qa") === "1";
  } catch (e) { return false; }
}

/* FPS tracker: avg lăn 1s + low 1s (min instantaneous fps trong cửa sổ 1s).
 * Testable độc lập — sample(dt) với dt giả. */
function createQaFps() {
  let acc = 0, n = 0, avg = 60;
  let lowMin = Infinity, lowWin = 0, low = 60;
  return {
    sample(dt) {
      const d = Math.max(dt, 1e-4);
      const f = 1 / d;
      acc += d; n++;
      if (f < lowMin) lowMin = f;
      lowWin += d;
      if (lowWin >= 1) {
        avg = n / Math.max(acc, 1e-6);
        low = (lowMin === Infinity) ? avg : lowMin;
        acc = 0; n = 0; lowMin = Infinity; lowWin = 0;
      }
    },
    get avg() { return avg; },
    get low() { return low; },
  };
}

/* Touch tracker: map id → {x, y}. Testable độc lập. */
function createQaTouches() {
  const m = new Map();
  return {
    down(id, x, y) { m.set(id, { x: x, y: y }); },
    move(id, x, y) { const t = m.get(id); if (t) { t.x = x; t.y = y; } },
    up(id) { m.delete(id); },
    clear() { m.clear(); },
    get size() { return m.size; },
    each(fn) { m.forEach((v, k) => fn(k, v.x, v.y)); },
  };
}

const QAOverlay = (function () {
  let on = false;
  try {
    on = (typeof location !== "undefined") && qaParseEnabled(location.search);
  } catch (e) { on = false; }
  const fps = createQaFps();
  const touches = createQaTouches();
  let textT = 0;
  let lines = ["QA", "", ""];
  let closeRect = null; // {x,y,w,h} nút đóng — tính lại mỗi lần vẽ

  function disable() { on = false; touches.clear(); closeRect = null; }

  /* Tap vào nút đóng → tắt overlay. Trả về true nếu đã xử lý. */
  function hitClose(x, y) {
    if (!on || !closeRect) return false;
    const r = closeRect;
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) { disable(); return true; }
    return false;
  }

  function onDown(id, x, y) {
    if (!on) return;
    if (hitClose(x, y)) return;
    touches.down(id, x, y);
  }

  /* Đăng ký listeners quan sát (passive, không preventDefault, không đụng
   * logic joystick của game). Chỉ đăng ký khi QA bật. */
  function hookInput() {
    try {
      if (typeof canvas === "undefined" || !canvas || !canvas.addEventListener) return;
      const ts = (e) => { try { for (const t of e.changedTouches) onDown(t.identifier, t.clientX, t.clientY); } catch (er) {} };
      const tm = (e) => { try { for (const t of e.changedTouches) touches.move(t.identifier, t.clientX, t.clientY); } catch (er) {} };
      const te = (e) => { try { for (const t of e.changedTouches) touches.up(t.identifier); } catch (er) {} };
      canvas.addEventListener("touchstart", ts, { passive: true });
      canvas.addEventListener("touchmove", tm, { passive: true });
      canvas.addEventListener("touchend", te, { passive: true });
      canvas.addEventListener("touchcancel", te, { passive: true });
      // Desktop: chuột coi như 1 touch point để test nút đóng + vẽ điểm.
      canvas.addEventListener("mousedown", (e) => { try { onDown("mouse", e.clientX, e.clientY); } catch (er) {} });
      if (typeof window !== "undefined" && window.addEventListener) {
        window.addEventListener("mousemove", (e) => { try { touches.move("mouse", e.clientX, e.clientY); } catch (er) {} });
        window.addEventListener("mouseup", () => { try { touches.up("mouse"); } catch (er) {} });
      }
    } catch (e) {}
  }

  function refreshText() {
    let foes = 0, wave = 0;
    try { foes = (typeof G !== "undefined" && G.enemies) ? G.enemies.length : 0; } catch (e) {}
    try { wave = (typeof G !== "undefined" && typeof G.wave === "number") ? G.wave : 0; } catch (e) {}
    lines = [
      "FPS " + fps.avg.toFixed(0) + "  low " + fps.low.toFixed(0),
      "foe " + foes + "  wave " + wave,
      "touch " + touches.size,
    ];
  }

  function draw() {
    if (!on) return;
    try {
      if (typeof ctx === "undefined" || !ctx) return;
      const W = (typeof window !== "undefined") ? window.innerWidth : 0;
      ctx.save();
      // Panel góc trái trên
      ctx.globalAlpha = 0.72;
      ctx.fillStyle = "#000";
      ctx.fillRect(8, 8, 148, 56);
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#0f0";
      ctx.font = "11px monospace";
      ctx.textBaseline = "top";
      ctx.textAlign = "left";
      for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], 14, 14 + i * 15);
      // Nút đóng góc phải trên
      const bw = 52, bh = 26;
      closeRect = { x: W - bw - 8, y: 8, w: bw, h: bh };
      ctx.globalAlpha = 0.72;
      ctx.fillStyle = "#400";
      ctx.fillRect(closeRect.x, closeRect.y, bw, bh);
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#f88";
      ctx.fillText("QA x", closeRect.x + 12, closeRect.y + 7);
      // Vòng tròn touch: mỗi point 1 vòng + ID
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#ff0";
      ctx.fillStyle = "#ff0";
      touches.each((id, x, y) => {
        ctx.beginPath();
        ctx.arc(x, y, 26, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillText(String(id), x - 3, y - 5);
      });
      ctx.restore();
    } catch (e) {}
  }

  /* Gọi mỗi frame từ loop() sau render(). text throttle 4 lần/giây. */
  function frame(rawDt) {
    if (!on) return;
    fps.sample(rawDt);
    textT += rawDt;
    if (textT >= 0.25) { textT = 0; refreshText(); }
    draw();
  }

  if (on) hookInput();

  return {
    get enabled() { return on; },
    frame: frame,
    draw: draw,
    disable: disable,
    // Test hooks:
    _parse: qaParseEnabled,
    _fps: fps,
    _touches: touches,
    _onDown: onDown,
    _hitClose: hitClose,
  };
})();

try { if (typeof window !== "undefined") window.QAOverlay = QAOverlay; } catch (e) {}
