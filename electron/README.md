# WINDOWKILL — Electron Desktop App

Bản desktop (`.exe` Windows) là nơi fantasy **"cửa sổ là máu"** sống THẬT:
quái tím gặm NHỎ cửa sổ thật, đạn bắn vào viền ĐẨY BAY cửa sổ thật,
satellite popup là cửa sổ OS riêng di chuyển được — không còn giới hạn
của browser.

Chiến lược 2-track (CEO chốt 2026-10-03):
- **Web** → chỉ mô phỏng (`sat=sim` mặc định), làm kênh phân phối.
- **Desktop (thư mục này)** → cửa sổ thật qua cầu IPC dưới đây.

## Kiến trúc cầu IPC

```
Renderer (game, js/game.js — KHÔNG sửa)
  window.resizeTo / resizeBy / moveTo / moveBy
  window.open(url, "wk_sat_<id>", ...) + sat.win.moveTo(...)
        │  electron/preload.js (chạy trước mọi script, contextIsolation: true)
        │  - override 4 DOM API → ipcRenderer.sendSync("wk-win-op", {...})
        │  - bọc window.open bằng Proxy: moveTo/... trên popup route theo frameName
        ▼
Main process (electron/main.js)
  ipcMain.on("wk-win-op") → win-ops.handleWinOp(event, msg, ctx)
        │  ctx: ownWindow (pid=null) | popupWindow(pid) — popup track qua
        │       webContents "did-create-window" (details.frameName)
        ▼
electron/win-ops.js (pure, không import electron → unit-test được)
  sanitizeOp → validate op whitelist, số finite, pid /^[A-Za-z0-9_-]{1,80}$/
  clampRect  → kẹp theo union workArea multi-monitor, chừa tối thiểu 80px
               để user luôn tóm được cửa sổ (không bao giờ bay mất)
  applyOp    → BrowserWindow.setBounds (fallback setPosition/setSize)
```

Điểm thiết kế quan trọng:
- **Giữ nguyên chữ ký DOM API** → `js/game.js` không sửa một dòng. Game có sẵn
  cơ chế `winCtrl` tự test `resizeTo` — trên desktop test PASS nên game dùng
  luôn đường cửa sổ thật; trên web test FAIL → fallback "đấu trường ảo" như cũ.
- **sendSync** (đồng bộ) để giữ ngữ nghĩa DOM API: game đọc
  `window.outerWidth` ngay sau `resizeTo` trong `winCtrl` test.
  Handler LUÔN set `event.returnValue` (kể cả khi lỗi) → renderer không bao giờ treo.
- **Giới hạn an toàn**: min size do `BrowserWindow.setMinimumSize` đảm nhiệm
  (main 900×700, popup 420×340) — game không thu cửa sổ tới mất;
  clamp 80px giữ cửa sổ luôn với tới được trên multi-monitor.
- **Bảo mật**: `contextIsolation: true`, `nodeIntegration: false`,
  `sandbox: true` giữ nguyên; chỉ cho `file://` trong thư mục app
  (`isAllowedAppUrl`); mọi IPC input validate ở `win-ops.js`.

## Cấu trúc file

| File | Vai trò |
|---|---|
| `main.js` | BrowserWindow chính 1100×820, preload, IPC handler, track popup, chặn URL ngoài |
| `preload.js` | Override DOM API + Proxy `window.open` (renderer side) |
| `win-ops.js` | Validate/clamp/apply — pure, unit-test bằng Node |
| `tests/win-ops.test.js` | 15 test (`node --test`) |
| `package.json` | `npm start` chạy app, `npm run pack` đóng gói .exe |

## Build .exe (Windows)

```powershell
cd electron
npm install
npm run pack
# → dist/WINDOWKILL Web Edition-win32-x64/WINDOWKILL Web Edition.exe
```

Lưu ý đóng gói: `main.js` load game từ `electron/app/` (`win.loadFile(app/index.html)`).
Trước khi pack, copy web build vào đó:

```powershell
# từ root repo
xcopy /E /I . electron\app
# (loại trừ electron\, .git\, node_modules\ nếu cần gọn)
```

## Test window-mechanics trên Windows

Không cần build .exe để test logic — chạy trên máy dev có Electron:

```powershell
cd electron
npm install
npm start
```

Checklist test tay (máy Windows thật):
1. Mở game (launcher → CHƠI NGAY). Bật devtools console của popup game:
   `window.resizeTo(800,600)` → cửa sổ game THU NHỎ thật (không phải arena ảo).
2. Vào wave 1, để quái tím bám viền → cửa sổ co lại từng nấc; HUD hiện đúng %.
3. Bắn vào viền cửa sổ → cửa sổ bị đẩy trượt đi + quái bám văng ra.
4. `?sat=auto`: mở khiên satellite → popup `satellite.html` mở thành cửa sổ OS
   riêng; khiên di chuyển → popup `moveTo` theo cạnh cửa sổ game.
5. Thu cửa sổ tới min (900×700) → không thu tiếp được (không mất cửa sổ).
6. Kéo/thử đẩy cửa sổ ra khỏi màn hình → luôn còn 80px để tóm lại.
7. Tắt máy ảo multi-monitor nếu có → test clamp không lỗi khi chỉ 1 màn hình.
8. `window.open("https://evil.com")` trong console → bị chặn (deny).

Test tự động (không cần Electron/Windows):

```sh
node --test electron/tests/win-ops.test.js   # 15 test: validate, clamp, dispatch
node --check electron/preload.js && node --check electron/main.js
```

## Còn lại (cần máy Windows thật)

- [ ] Chạy checklist 8 bước trên với .exe đã pack (chưa test vì không có Windows).
- [ ] Ký số (code signing) .exe để tránh SmartScreen cảnh báo — cần cert của user.
- [ ] Auto-update (electron-updater) — chưa làm, hiện tại phát hành bằng itch.io.
- [ ] Icon .exe riêng (hiện dùng icon mặc định của Electron).
