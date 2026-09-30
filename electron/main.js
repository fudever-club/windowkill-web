// WINDOWKILL: Web Edition — Electron shell (Windows .exe build)
// Loads the local web game (index.html) in a desktop window.
//
// GHI CHÚ: các API window.resizeTo()/moveTo()/moveBy() trong Electron có thể
// KHÔNG tác dụng (Electron không hỗ trợ resizeTo/moveTo trên BrowserWindow qua
// DOM). Game đã có fallback "đấu trường ảo" (virtual arena) tự bật khi phát
// hiện resize không ăn, nên vẫn chơi đầy đủ offline.
"use strict";

const { app, BrowserWindow, Menu } = require("electron");
const path = require("path");

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
    },
  });

  // Cho popup game: giữ kích thước hợp lý, bỏ menu.
  win.webContents.setWindowOpenHandler(({ url, frameName }) => {
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
      },
    };
  });

  // Game files (index.html, game.html, css/, js/) are bundled under app/.
  win.loadFile(path.join(__dirname, "app/index.html"));
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
