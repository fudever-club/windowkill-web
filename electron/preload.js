"use strict";
// WINDOWKILL Electron — window-control bridge (renderer side).
//
// Preload này chạy TRƯỚC mọi script của game, override các DOM API điều khiển
// cửa sổ để game dùng cửa sổ THẬT thay vì fallback "đấu trường ảo":
//   window.resizeTo / resizeBy / moveTo / moveBy  →  IPC sync sang main
//       → main validate + clamp → BrowserWindow.setBounds
//   window.open(url, target, features)            →  giữ native (Electron tạo
//       BrowserWindow thật), bọc Proxy: moveTo/resizeTo/... gọi trên popup
//       route qua IPC theo frameName (vd "wk_sat_<id>", "windowkill_arena").
//
// Không đổi chữ ký DOM API → KHÔNG cần sửa game.js. Trên web (không có
// preload), các API giữ nguyên hành vi browser → game tự fallback như cũ.
//
// Bảo mật: contextIsolation giữ true (không expose Node), IPC input validate
// ở main (win-ops.js). Dùng sendSync để giữ ngữ nghĩa đồng bộ của DOM API
// (game đọc window.outerWidth ngay sau resizeTo trong winCtrl test).

const { ipcRenderer } = require("electron");

function num(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// Gửi 1 window-op sang main, đồng bộ. Luôn try/catch: nếu main không trả lời,
// game tiếp tục với fallback "đấu trường ảo" như trên web.
function callOp(payload) {
  try {
    ipcRenderer.sendSync("wk-win-op", payload);
  } catch (e) {
    /* main unreachable — game falls back to virtual arena */
  }
}

// --- override DOM API trên cửa sổ hiện tại (giữ nguyên chữ ký) ---
window.resizeTo = function (w, h) {
  callOp({ pid: null, op: "resize", w: num(w, 0), h: num(h, 0) });
};
window.resizeBy = function (dw, dh) {
  callOp({ pid: null, op: "resizeby", dw: num(dw, 0), dh: num(dh, 0) });
};
window.moveTo = function (x, y) {
  callOp({ pid: null, op: "move", x: num(x, 0), y: num(y, 0) });
};
window.moveBy = function (dx, dy) {
  callOp({ pid: null, op: "moveby", dx: num(dx, 0), dy: num(dy, 0) });
};

// --- window.open: bọc Proxy để điều khiển popup thật qua IPC ---
(function () {
  const realOpen = window.open.bind(window);
  const PID_RE = /^[A-Za-z0-9_-]{1,80}$/;

  window.open = function (url, target, features) {
    const w = realOpen(url, target, features);
    if (!w) return w; // bị chặn → game tự fallback
    const pid = typeof target === "string" && PID_RE.test(target) ? target : null;
    if (!pid) return w; // target lạ: giữ nguyên native proxy
    return new Proxy(w, {
      get(t, p) {
        if (p === "moveTo")
          return function (x, y) { callOp({ pid, op: "move", x: num(x, 0), y: num(y, 0) }); };
        if (p === "moveBy")
          return function (dx, dy) { callOp({ pid, op: "moveby", dx: num(dx, 0), dy: num(dy, 0) }); };
        if (p === "resizeTo")
          return function (ww, hh) { callOp({ pid, op: "resize", w: num(ww, 0), h: num(hh, 0) }); };
        if (p === "resizeBy")
          return function (dw, dh) { callOp({ pid, op: "resizeby", dw: num(dw, 0), dh: num(dh, 0) }); };
        const v = Reflect.get(t, p);
        // bind method về target thật (close, postMessage, focus, ...).
        // 'closed' là getter → Reflect.get đã resolve đúng, trả nguyên.
        return typeof v === "function" ? v.bind(t) : v;
      },
      // 'closed' kiểm tra qua get là đủ; không cần has/set trap.
    });
  };
})();
