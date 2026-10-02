"use strict";
// WINDOWKILL Electron — pure window-op validation + clamping.
//
// Module này KHÔNG import electron → unit-test được bằng Node thuần.
// main.js dùng nó trong ipcMain handler; preload.js chỉ forward message.
//
// Thiết kế an toàn:
//  - Mọi IPC input đều validate: op whitelist, số finite, pid khớp regex.
//  - clampRect giữ cửa sổ luôn "tóm được": chừa tối thiểu 80px trên màn hình,
//    xử lý multi-monitor qua union workArea. Không bao giờ để cửa sổ bay mất.
//  - Giới hạn dưới kích thước do BrowserWindow.setMinimumSize đảm nhiệm
//    (main window 900x700, popup 420x340) — game không thể thu cửa sổ tới mất.

const OPS = new Set(["move", "moveby", "resize", "resizeby"]);
const MAX_ABS = 100000; // |x|,|y|,|delta| tối đa cho 1 lệnh
const MAX_DIM = 16384; // w/h tối đa
const GRAB = 80; // số px tối thiểu còn nhìn thấy để user tóm cửa sổ

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function clampNum(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

// msg: { pid?, op, x?, y?, dx?, dy?, w?, h?, dw?, dh? } → sanitized | null
function sanitizeOp(msg) {
  if (!msg || typeof msg !== "object") return null;
  if (!OPS.has(msg.op)) return null;
  let pid = null;
  if (msg.pid !== undefined && msg.pid !== null) {
    if (typeof msg.pid !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(msg.pid)) return null;
    pid = msg.pid;
  }
  const out = { op: msg.op, pid };
  if (msg.op === "move") {
    const x = toNum(msg.x), y = toNum(msg.y);
    if (x === null || y === null) return null;
    out.x = clampNum(x, -MAX_ABS, MAX_ABS);
    out.y = clampNum(y, -MAX_ABS, MAX_ABS);
  } else if (msg.op === "moveby") {
    const dx = toNum(msg.dx), dy = toNum(msg.dy);
    if (dx === null || dy === null) return null;
    out.dx = clampNum(dx, -MAX_ABS, MAX_ABS);
    out.dy = clampNum(dy, -MAX_ABS, MAX_ABS);
  } else if (msg.op === "resize") {
    const w = toNum(msg.w), h = toNum(msg.h);
    if (w === null || h === null) return null;
    out.w = w;
    out.h = h;
  } else {
    // resizeby
    const dw = toNum(msg.dw), dh = toNum(msg.dh);
    if (dw === null || dh === null) return null;
    out.dw = dw;
    out.dh = dh;
  }
  return out;
}

// Clamp rect {x,y,w,h} theo displays [{workArea:{x,y,width,height}}].
// Luôn trả về số nguyên; w/h tối thiểu 1 (giới hạn thật do setMinimumSize).
function clampRect(x, y, w, h, displays) {
  w = Math.max(1, Math.min(MAX_DIM, Math.round(w)));
  h = Math.max(1, Math.min(MAX_DIM, Math.round(h)));
  x = Math.round(x);
  y = Math.round(y);
  if (!displays || !displays.length) return { x, y, w, h };
  let ux0 = Infinity, uy0 = Infinity, ux1 = -Infinity, uy1 = -Infinity;
  for (const d of displays) {
    const wa = d.workArea || d;
    if (!wa || !Number.isFinite(wa.x)) continue;
    ux0 = Math.min(ux0, wa.x);
    uy0 = Math.min(uy0, wa.y);
    ux1 = Math.max(ux1, wa.x + wa.width);
    uy1 = Math.max(uy1, wa.y + wa.height);
  }
  if (!Number.isFinite(ux0)) return { x, y, w, h };
  x = Math.max(ux0 - w + GRAB, Math.min(ux1 - GRAB, x));
  y = Math.max(uy0, Math.min(uy1 - GRAB, y));
  return { x, y, w, h };
}

// Áp op đã sanitize lên BrowserWindow-like.
// win: { getBounds():{x,y,width,height}, setBounds({x,y,width,height}) }
//      (fallback setPosition/setSize nếu thiếu setBounds).
// displays: mảng display cho clampRect (có thể rỗng).
// Trả về rect đã áp {x,y,w,h} hoặc null.
function applyOp(win, op, displays) {
  try {
    if (!win || typeof win.getBounds !== "function") return null;
    if (!op || !OPS.has(op.op)) return null;
    const b = win.getBounds() || {};
    let x = Number(b.x) || 0, y = Number(b.y) || 0;
    let w = Number(b.width) || 800, h = Number(b.height) || 600;
    if (op.op === "move") {
      x = op.x; y = op.y;
    } else if (op.op === "moveby") {
      x = x + op.dx; y = y + op.dy;
    } else if (op.op === "resize") {
      w = op.w; h = op.h;
    } else if (op.op === "resizeby") {
      w = w + op.dw; h = h + op.dh;
    }
    const r = clampRect(x, y, w, h, displays);
    if (typeof win.setBounds === "function") win.setBounds({ x: r.x, y: r.y, width: r.w, height: r.h });
    else {
      if (typeof win.setPosition === "function") win.setPosition(r.x, r.y);
      if (typeof win.setSize === "function") win.setSize(r.w, r.h);
    }
    return r;
  } catch (e) {
    return null;
  }
}

// Dispatcher cho ipcMain handler "wk-win-op" — tách riêng để unit-test được.
// ctx: { ownWindow(): BrowserWindow-like|null,      // cửa sổ gửi IPC
//        popupWindow(pid): BrowserWindow-like|null, // popup theo frameName
//        displays(): Array }                       // cho clampRect
// ĐẢM BẢO luôn set event.returnValue (renderer dùng sendSync — thiếu là treo).
// Trả về true nếu đã áp op lên cửa sổ thật.
function handleWinOp(event, msg, ctx) {
  let applied = false;
  try {
    const op = sanitizeOp(msg);
    if (op && ctx) {
      const target = op.pid
        ? (typeof ctx.popupWindow === "function" ? ctx.popupWindow(op.pid) : null)
        : (typeof ctx.ownWindow === "function" ? ctx.ownWindow() : null);
      if (target) {
        const displays = typeof ctx.displays === "function" ? ctx.displays() : [];
        applied = applyOp(target, op, displays) !== null;
      }
    }
  } catch (e) {
    applied = false;
  }
  try {
    event.returnValue = applied;
  } catch (e) {
    /* event chết: không còn gì để làm */
  }
  return applied;
}

module.exports = { sanitizeOp, clampRect, applyOp, handleWinOp, OPS: Array.from(OPS), MAX_DIM, GRAB };
