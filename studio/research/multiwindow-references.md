# Nghiên cứu multi-window: 2 repo tham khảo

Ngày: 2026-10-01 · Người gửi: CEO (Đặng Quang Nhật)
Mục tiêu: rút bài học cải thiện satellite lifecycle và độ ổn định của WINDOWKILL.

---

## 1. chunqiuyiyu/multi-window-pong-game (Pong xuyên cửa sổ)

**Ý tưởng:** Mở cùng 1 page trên nhiều cửa sổ/tab, quả bóng Pong "bay xuyên" qua các cửa sổ nhờ tọa độ màn hình chung.

**Cơ chế đồng bộ (tất cả qua `localStorage`, KHÔNG dùng BroadcastChannel):**
- `WindowManager.js` giữ registry trung tâm: key `windows` = JSON array `[{id, shape:{x,y,w,h}, metaData}]`, key `count` = bộ đếm ID tăng đơn điệu.
- Mỗi cửa sổ `init()`: lấy `count`, +1 làm ID của mình, push entry `{id, shape, metaData}` vào registry.
- Mỗi frame `update()`: đọc `window.screenLeft/screenTop/innerWidth/innerHeight`, nếu khác cache thì ghi đè registry → các cửa sổ khác nhận qua sự kiện `storage`.
- 2 callback: `winChangeCallback` (thành viên đổi: số lượng/ID) và `winShapeChangeCallback` (di chuyển/resize).
- `beforeunload`: tự xóa mình khỏi registry.
- Game state: **không có master election.** Cửa sổ nào click start thì set `metaData.start=true` và **ghi `ballX/ballY` vào metadata của chính nó mỗi frame** (viết ngay trong hàm `drawRect`!); mọi cửa sổ đọc registry, thấy `ballX` thì đè lên bóng local (last-writer-wins). Paddle: `mousemove` → ghi `playerY` vào metadata.
- Đồng hồ chung: `getTime()` = số giây từ 0h hôm nay — mọi cửa sổ dùng chung wall-clock để animation deterministic, không cần master clock.
- Escape hatch: `?clear` → `localStorage.clear()`.
- Guard: không `init()` khi tab đang hidden (chống browser prerender đăng ký 2 lần).

**Điểm yếu (đừng copy):**
- `init()` gọi `localStorage.clear()` — mở cửa sổ thứ 2 là **xóa luôn đăng ký của cửa sổ 1** (bug demo).
- Ghi state trong hàm vẽ (`drawRect` ghi `ballX`) — lẫn sim/render.
- Mọi cửa sổ vừa tự simulate bóng vừa bị đè giá trị từ registry → jitter.
- Deregister chỉ dựa vào `beforeunload` — crash/taskkill là registry thối, không có heartbeat.
- `localStorage` write mỗi frame + `storage` event async + không fire ở tab ghi → không hợp cho realtime tần suất cao.

## 2. bgstaal/multipleWindow3dScene (boilerplate Three.js)

**Ý tưởng:** Một scene 3D duy nhất "trải dài" qua nhiều cửa sổ — mỗi cửa sổ render đúng phần scene tương ứng vị trí màn hình của nó.

**Cơ chế:** `WindowManager.js` gần như copy của bản Pong (đã **bỏ** bug `localStorage.clear()` trong `init`, chỉ clear khi `?clear` — đây mới là bản nên tham khảo).
- Vẫn: registry `windows` + `count`, `storage` event, 2 callback, `beforeunload` deregister.
- **Scene offset trick:** `world.position = (-window.screenX, -window.screenY)` với easing `falloff 0.05` → ảo giác 1 scene liên tục.
- **Vị trí tương đối giữa các cửa sổ:** mỗi cửa sổ đọc registry, vẽ 1 cube tại tâm mỗi entry (`x + w/2, y + h/2`), easing theo khi cửa sổ khác di chuyển. Từ registry, vector khoảng cách giữa 2 mép cửa sổ bất kỳ tính được bằng phép trừ đơn giản — không cần API đặc biệt.
- Delay `init` 500ms vì `screenX` báo sai lúc page mới load (ghi chú trong code).

**Điểm yếu:** giống bản Pong — không master election, không heartbeat, registry thối khi crash.

## 3. Đính chính: không repo nào có "master election"

Cả 2 repo đều **không** bầu master. "Master" chỉ là implicit: ai ghi cuối cùng thắng (pong) / mỗi cửa sổ tự render phần mình (3D). Kiến trúc **main-authority** của WINDOWKILL (game.html giữ sim, satellite chỉ render) thực ra sạch hơn cả 2 — giữ nguyên, không cần học election.

## 4. WINDOWKILL hiện tại (để so sánh)

- Main = authority duy nhất; `sats: Map` in-memory **chỉ ở main**; satellite là dumb renderer.
- Giao tiếp realtime qua `BroadcastChannel("windowkill_bus")` — đúng đắn, nhanh hơn `storage` event cho per-frame.
- Init qua query params (`role/hp/color/label/enr`); lifecycle `sat-ready` (load) → `sat-bye` (`beforeunload`, = user đóng tay → phạt).
- Probe `canMove` bằng `moveBy` test; có simulation fallback.
- **Lỗ hổng lifecycle hiện tại:**
  1. Không heartbeat — `beforeunload` không phải lúc nào cũng chạy (crash, taskkill, mobile) → entry thối trong `sats`.
  2. Main không biết popup **thực sự** ở đâu — chỉ gửi `sat-steer` (vx,vy) rồi "tin" là nó đi đúng; không verify vị trí thật, không phát hiện user kéo popup bằng tay.
  3. Satellite mồ côi: main đóng/crash → popup satellite sống vơ vẩn, không tự đóng (chỉ tự đóng khi đang `dying`).
  4. `sat-ready` post ngay khi script parse — `screenX` có thể sai lúc đầu (đúng như ghi chú của bgstaal), và prerender có thể đăng ký trùng.

---

## 5. KHUYẾN NGHỊ CỤ THỂ cho WINDOWKILL

### Nên làm (ưu tiên)

**P0 — Heartbeat + stale sweep (cả 2 repo đều thiếu, mình làm tốt hơn họ):**
- satellite: mỗi 3s post `{type:"sat-ping", id, shape:{x:screenX, y:screenY, w:innerWidth, h:innerHeight}}` qua bus có sẵn.
- main: lưu `sat.lastSeen`; sweep mỗi 5s, xóa entry quá 10s không ping (coi như chết, **không** tính phạt manual như `sat-bye`).
- Fix đúng lỗ hổng #1, chi phí ~15 dòng.

**P0 — Self-reported shape (pattern WindowManager, nhưng qua BroadcastChannel thay vì localStorage):**
- Dùng luôn `shape` trong `sat-ping` → main biết vị trí thật của popup.
- Mở khóa gameplay mới: M7 lover-merge khi 2 popup **gần nhau** (tính khoảng cách mép = trừ tọa độ, như cách bản 3D đặt cube), M4 debris telegraph chính xác, phát hiện user kéo popup bằng tay (shape đổi mà không do `sat-steer`).
- Giữ BC cho realtime (đang đúng); **đừng** chuyển sang localStorage cho per-frame — `storage` event async + serialize JSON mỗi frame = chậm và giật.

**P1 — Satellite tự sát khi main mất tích (lỗ hổng #3):**
- satellite: mỗi `sat-ping` chờ main trả `sat-ack` (hoặc nghe `sat-roster` định kỳ từ main); quá 2 kỳ không thấy → `window.close()`.
- Đơn giản hơn: main broadcast `{type:"sat-roster", ids:[...]}` mỗi 5s; satellite nào không thấy ID mình trong 2 kỳ liên tiếp → tự đóng.

**P1 — Delayed + guarded init (học bgstaal):**
- satellite: đừng `post sat-ready` ngay khi parse. Chờ `window.onload` + ~400ms (screenX ổn định), và skip nếu `document.hidden` (chống prerender đăng ký trùng). Main đã tạo entry lúc `window.open` nên không sợ mất lượt.

### Có thể làm sau (optional)

- **Shared wall-clock** (giây từ 0h như bản Pong): nếu muốn animation đồng bộ giữa các popup (telegraph blink, boot overlay) thì mọi satellite dùng chung mốc thời gian thay vì `performance.now()` riêng lẻ. Hiện tại chưa ai phàn nàn → để backlog.
- **Key prefix + version** (`wk_...`): chỉ khi nào dùng localStorage cho cross-window state; hiện tại chưa cần.

### Nên tránh (bài học từ bug của họ)

1. **Đừng `localStorage.clear()` trong init** (bug bản Pong xóa registry cửa sổ khác).
2. **Đừng ghi state trong hàm vẽ** (Pong ghi `ballX` trong `drawRect`) — giữ sim/render tách bạch như hiện tại.
3. **Đừng cho mọi cửa sổ cùng simulate** (Pong vừa sim local vừa bị đè → jitter) — giữ main-authority.
4. **Đừng dùng localStorage làm bus realtime** — BC hiện tại nhanh hơn, giữ nguyên.
5. **Đừng implement master election** — không cần; main window là master tự nhiên.

### Pattern có thể copy/adapt nguyên mẫu

- `WindowManager` (~90 dòng, bản 3D) → adapt thành `js/sat-registry.js` phía main: cùng API `getWindows()/getWindowIndexFromId()/setWinShapeChangeCallback()` nhưng nguồn shape là `sat-ping` qua BC thay vì `storage` event. Cho phép sau này mở rộng "satellite biết nhau" mà không sửa nhiều.
- Công thức edge-distance: `dist = max(0, (b.x - (a.x + a.w)))` theo từng trục — dùng cho trigger M7 merge proximity.
