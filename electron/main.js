// WINDOWKILL: Web Edition — Electron shell (Windows .exe build)
// Loads the local web game (index.html) in a desktop window.
//
// CỬA SỔ THẬT (desktop track): electron/preload.js override các DOM API
// window.resizeTo()/resizeBy()/moveTo()/moveBy() → IPC sync sang main process
// → validate + clamp (electron/win-ops.js) → BrowserWindow.setBounds.
// Nhờ đó game dùng cửa sổ THẬT (quái gặm nhỏ cửa sổ, đạn đẩy bay cửa sổ,
// satellite popup di chuyển được) thay vì fallback "đấu trường ảo".
"use strict";

const { app, BrowserWindow, Menu, ipcMain, screen } = require("electron");
const path = require("path");
const winOps = require("./win-ops");

const PRELOAD = path.join(__dirname, "preload.js");

// frameName (target của window.open) -> BrowserWindow popup.
// Dùng để route window-op từ cửa sổ opener tới popup thật
// (vd "wk_sat_<id>" cho satellite, "windowkill_arena" cho game).
const popupWins = new Map();

function trackPopupWindows(contents) {
  contents.on("did-create-window", (childWin, details) => {
    const name = details && details.frameName;
    if (typeof name === "string" && name) {
      popupWins.set(name, childWin);
      childWin.on("closed", () => {
        if (popupWins.get(name) === childWin) popupWins.delete(name);
      });
      // Đệ quy: popup cũng có thể mở popup (hiện tại satellite không mở thêm).
      trackPopupWindows(childWin.webContents);
    }
  });
}

// IPC: điều khiển cửa sổ thật từ game.
// msg: { pid?, op: move|moveby|resize|resizeby, ... } (đã validate trong win-ops).
// pid=null → cửa sổ gửi IPC; pid=frameName → popup do nó mở.
ipcMain.on("wk-win-op", (event, msg) => {
  winOps.handleWinOp(event, msg, {
    ownWindow: () => {
      const w = BrowserWindow.fromWebContents(event.sender);
      return w && !w.isDestroyed() ? w : null;
    },
    popupWindow: (pid) => {
      const pw = popupWins.get(pid);
      return pw && !pw.isDestroyed() ? pw : null;
    },
    displays: () => {
      try {
        return screen.getAllDisplays();
      } catch (e) {
        return [];
      }
    },
  });
});

function createMainWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 820,
    minWidth: 900,
    minHeight: 700,
    title: "WINDOWKILL: Web Edition",
    backgroundColor: "#070409",
    webPreferences: {
      // Cho phép window.open('game.html?...') mở thành cửa sổ Electron thật
      // (game dùng popup làm "máu": quái tím gặm viền cửa sổ).
      nativeWindowOpen: true,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Cầu điều khiển cửa sổ thật: override resizeTo/moveTo/... qua IPC.
      preload: PRELOAD,
    },
  });

  trackPopupWindows(win.webContents);

  const appRoot = path.join(__dirname, "app");

  // Chỉ cho phép mở popup game từ file game đã đóng gói (chặn URL ngoài/độc hại).
  function isAllowedAppUrl(url) {
    try {
      const u = new URL(url);
      if (u.protocol !== "file:") return false;
      let raw = decodeURIComponent(u.pathname);
      if (process.platform === "win32") {
        // Trên Windows, pathname của file URL có dạng "/C:/path" — nếu không
        // bỏ dấu "/" đầu, path.normalize cho ra "\C:\path" và so sánh luôn sai.
        const m = /^\/([a-zA-Z]:)(\/.*)?$/.exec(raw);
        if (m) raw = m[1] + (m[2] || "/");
      }
      const p = path.normalize(raw);
      const root = path.normalize(appRoot);
      if (process.platform === "win32") {
        // Windows không phân biệt hoa/thường trong đường dẫn
        const pl = p.toLowerCase(), rl = root.toLowerCase();
        return pl === rl || pl.startsWith(rl + path.sep);
      }
      return p === root || p.startsWith(root + path.sep);
    } catch {
      return false;
    }
  }

  // Cho popup game: giữ kích thước hợp lý, bỏ menu.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!isAllowedAppUrl(url)) return { action: "deny" };
    return {
      action: "allow",
      overrideBrowserWindowOptions: {
        width: 980,
        height: 700,
        minWidth: 420,
        minHeight: 340,
        title: "WINDOWKILL: Web Edition — Chiến trường",
        backgroundColor: "#050308",
        autoHideMenuBar: true,
        webPreferences: {
          nativeWindowOpen: true,
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          // Popup (game arena, satellite) cũng cần cầu cửa sổ thật:
          // satellite tự rung qua window.moveBy (juice.js), opener di chuyển
          // popup qua sat.win.moveTo (game.js updateShield).
          preload: PRELOAD,
        },
      },
    };
  });

  // Chặn điều hướng cửa sổ chính ra khỏi file game đã đóng gói.
  win.webContents.on("will-navigate", (e, url) => {
    if (!isAllowedAppUrl(url)) e.preventDefault();
  });

  // Game files (index.html, game.html, css/, js/) are bundled under app/.
  win.loadFile(path.join(appRoot, "index.html"));
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null); // bỏ menu mặc định
  createMainWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
