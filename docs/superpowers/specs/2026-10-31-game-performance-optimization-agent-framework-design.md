# WINDOWKILL Web Edition: Thiết Kế Tối Ưu Hiệu Năng & Khung Multi-Agent Dài Hạn

**Ngày tạo**: 2026-10-31  
**Tác giả**: FU-DEVER Engineering & Antigravity Agent  
**Trạng thái**: Draft / Đang chờ duyệt  

---

## 1. Bối cảnh & Mục tiêu

### 1.1 Bối cảnh
`WINDOWKILL: Web Edition` là trò chơi twin-stick shooter lấy cảm hứng từ Windowkill, phát triển bởi **FU-DEVER** (Đại học FPT Đà Nẵng). Trò chơi có cơ chế độc nhất: cửa sổ trình duyệt (popup window) biến thành thanh máu của người chơi, co giãn bằng `window.resizeTo()` và dịch chuyển trên màn hình desktop bằng `window.moveTo()` / `window.moveBy()`.

Trò chơi chạy trên môi trường Web (Chromium, Edge, Firefox, Safari) với canvas 2D và Web Audio. Khi bước vào các đợt quái cao (Wave 5, 10, 15+), hiệu ứng đạn, quái (100+) và hạt bùng nổ (lên tới 600 hạt) có thể gây sụt giảm khung hình (tụt FPS), giật khựng (micro-stutter) do nghẽn CPU luồng chính, nghẽn IPC gọi Window API, và áp lực dọn rác bộ nhớ (Garbage Collection).

### 1.2 Mục tiêu cốt lõi
1. **Khung hình mượt mà tối đa (60–144 FPS)**: Loại bỏ các đợt sụt khung hình bất thường khi chiến đấu căng thẳng hoặc khi cửa sổ bị bắn dồn dập.
2. **Cân bằng tải phần cứng CPU và GPU trên nền Web**:
   - Tối ưu hóa Canvas 2D không phát sinh rác bộ nhớ (Zero Garbage Collection allocation) trong vòng lặp game.
   - Mở rộng cơ chế điều chỉnh chất lượng thích ứng (Dynamic Quality Scaling) cho cả máy tính để bàn và laptop dùng card đồ họa tích hợp (iGPU).
   - Tối ưu hóa va chạm đạn - quái bằng Phân vùng không gian (Spatial Hash Grid) giảm độ phức tạp từ $O(N \times M)$ xuống $O(M)$.
3. **Throttled & Interpolated Window IPC**: Điều tiết tần suất gọi API cửa sổ trình duyệt để ngăn chặn tình trạng DWM / Browser UI Thread bị khóa nghẽn.
4. **Hệ thống Agent Mô phỏng & Đo kiểm Tự động**:
   - Agent Bot thông minh chơi game qua giao thức Chrome DevTools Protocol (CDP), tự động né đòn, bắn, chọn nâng cấp để tái hiện chân thực hành vi người chơi.
   - Benchmark Agent tự động ghi lại FPS (trung bình, $p50, p95, p99$, Min), độ trễ khung hình (Frame budget $\le 16.6\text{ms}$), và thời gian gián đoạn GC.
5. **Vận hành dài hạn & Bộ nhớ bền vững**: Ghi nhận toàn bộ thông số đo đạc vào `PERF.md`, tuân thủ kiểm thử nghiêm ngặt không làm thay đổi gameplay gốc.

### 1.3 Giới hạn (Non-Goals)
- Không thay đổi luật chơi, thông số vũ khí, số lượng nâng cấp hay hitbox của quái.
- Không thay đổi định hướng mỹ thuật (Art style) hay hiệu ứng âm thanh đặc trưng của CLB FU-DEVER.

---

## 2. Kiến trúc Chi tiết & Các Module Cải tiến

### 2.1 Subsystem 1: Window IPC Caching & Motion Throttling ([`js/game/01-winctrl.js`](file:///c:/Users/qnhat/_Project/window_kill/js/game/01-winctrl.js))

#### Vấn đề
Hàm `applyWindowMotion(dt)` và `pushWindow(dx, dy)` gọi `window.moveBy()` mỗi frame và liên tục đọc `window.screenX`, `window.screenY`, `window.outerWidth`, `window.outerHeight`. Việc này buộc trình duyệt phải đồng bộ hóa hai chiều liên tục với Windows DWM, khóa cứng luồng xử lý và tụt FPS nghiêm trọng.

#### Giải pháp
- **Đối tượng `CachedWinState`**:
  ```javascript
  const CachedWinState = {
    screenX: 0, screenY: 0, outerW: 0, outerH: 0,
    availW: 1920, availH: 1080,
    lastSync: 0,
    sync: function(now, force) {
      if (force || now - this.lastSync > 100) { // Giới hạn đọc DOM tối đa 10Hz
        this.screenX = window.screenX;
        this.screenY = window.screenY;
        this.outerW = window.outerWidth;
        this.outerH = window.outerHeight;
        this.availW = (window.screen && window.screen.availWidth) || 1920;
        this.availH = (window.screen && window.screen.availHeight) || 1080;
        this.lastSync = now;
      }
    }
  };
  ```
- **Tích lũy sai số & Throttled Dispatch**:
  - Tách biệt vận tốc vật lý (`wvx, wvy`) với lệnh gọi hệ điều hành.
  - Tích lũy độ lệch $(\text{accX}, \text{accY})$. Chỉ kích hoạt `window.moveBy()` khi độ dời tích lũy $|\text{acc}| \ge 1.0\text{px}$ và cách lần gọi trước tối thiểu $\ge 16.6\text{ms}$ (tối đa $60\text{Hz}$).
  - Cập nhật tọa độ nội bộ trong bộ nhớ đệm giúp triệt tiêu hoàn toàn các lệnh đọc DOM đồng bộ.

---

### 2.2 Subsystem 2: Zero-Allocation Particle & Render Pipeline ([`js/particles.js`](file:///c:/Users/qnhat/_Project/window_kill/js/particles.js) & [`js/game/17-render.js`](file:///c:/Users/qnhat/_Project/window_kill/js/game/17-render.js))

#### Vấn đề
Mỗi frame trong `bucketize()`, mã nguồn liên tục khởi tạo `new Map()` và khởi tạo mới `new Path2D()` cho mỗi bucket màu và độ trong suốt (alpha). Khi có 600 hạt ở wave cao, điều này gây rác bộ nhớ khổng lồ khiến Garbage Collector phải dừng ứng dụng định kỳ.

#### Giải pháp
- **Bảng gom hạt tĩnh (Static Pre-allocated Buckets)**:
  - Khởi tạo trước danh sách bucket cố định theo dải màu sắc của game và 8 nấc alpha.
  - Không khởi tạo lại `new Map()` mỗi frame; dùng bộ đếm số lượng hạt đang hoạt động trong từng bucket (`bucket.count = 0`) và tái sử dụng bộ nhớ đệm mảng phẳng.
- **Vẽ tối ưu không lãng phí State Switching**:
  - Gom các hạt cùng màu để gọi `ctx.fillStyle` một lần duy nhất cho mỗi nhóm.
  - Tận dụng `ctx.fillRect()` hàng loạt hoặc tái sử dụng Path2D được reset (`path = new Path2D()` chỉ khi thực sự cần thiết, hoặc vẽ trực tiếp không tạo đối tượng trung gian).
- **In-place Array Compaction**:
  - Thu dọn các hạt hết hạn (`p.life <= p.t`) và đạn đã phát nổ bằng kỹ thuật hai con trỏ tại chỗ (two-pointer swap/write-index), không dùng `.filter()` hay `.splice()`.

---

### 2.3 Subsystem 3: Spatial Hash Grid Collision Detection ([`js/game/16-update.js`](file:///c:/Users/qnhat/_Project/window_kill/js/game/16-update.js))

#### Vấn đề
Vòng lặp kiểm tra đạn va chạm với quái duyệt tuyến tính:
```javascript
for (const bl of G.bullets) {
  for (const e of G.enemies) {
    if (dist2(...) < radius) ...
  }
}
```
Khi người chơi sở hữu súng bắn nhiều tia, đạn nảy, đạn nổ kết hợp với 100+ quái, số phép tính khoảng cách nhân lên thành $10.000+$ lần mỗi frame.

#### Giải pháp
- **Kiến trúc Spatial Hash Grid**:
  - Phân chia đấu trường thành các ô lưới kích thước $80 \times 80\text{px}$.
  - Mỗi đầu frame cập nhật (`update`), các quái còn sống được ghi danh vào danh sách chỉ mục của ô lưới tương ứng.
  - Khi đạn di chuyển, chỉ truy vấn danh sách quái trong ô hiện tại của viên đạn và các ô tiếp giáp ($3 \times 3$ cells).
  - Độ phức tạp giảm từ $O(N \times M)$ xuống xấp xỉ $O(M)$, giải phóng hơn 70% thời gian tính toán vật lý của CPU.

---

### 2.4 Subsystem 4: Dynamic Quality Scaling cho Toàn Bộ Nền Tảng ([`js/quality.js`](file:///c:/Users/qnhat/_Project/window_kill/js/quality.js))

#### Vấn đề
Dòng lệnh `if (!this.mobile) return;` trong hàm `onFpsSample()` ngăn không cho Desktop tự động giảm tải khi máy tính đang gặp hiện tượng sụt FPS (ví dụ máy văn phòng, laptop dùng iGPU, hoặc màn hình 4K tải render nặng).

#### Giải pháp
- Cho phép chế độ `auto` hoạt động thông minh trên cả Desktop:
  - Nếu FPS trung bình rơi xuống dưới $55\text{ FPS}$ trong $2\text{s}$ liên tiếp: tự động hạ chất lượng xuống `balanced` (giảm nhẹ DPR từ 2.0 xuống 1.5, giảm $40\%$ số hạt tối đa, giảm bán kính đổ bóng `shadowBlur`).
  - Nếu FPS rơi xuống dưới $35\text{ FPS}$: hạ xuống `lite` (DPR = 1.0, tắt đổ bóng, tối ưu hóa fill-rate GPU).
  - Khi FPS hồi phục ổn định $\ge 58\text{ FPS}$ trong $5\text{s}$ và ngoài trạng thái combat căng thẳng: nhẹ nhàng nâng trở lại nấc chất lượng cao nhất.

---

### 2.5 Subsystem 5: Khung Agent Tự Động Mô Phỏng & Benchmark Dài Hạn

#### Thành phần
1. **`scripts/perf-bot.js` (Player Simulation Agent)**:
   - Sử dụng CDP (WebSocket Chromium) kết nối tới trang `game.html`.
   - Chiến lược tự động hóa:
     - Giữ bắn liên tục, tính toán góc hướng về quái nguy hiểm gần nhất.
     - Di chuyển quỹ đạo né quái và va chạm viền để tạo chuyển động rung lắc cửa sổ thực tế.
     - Tự động nhận diện màn hình Draft Upgrade (phím `1, 2, 3`) và chọn kỹ năng tối ưu.
     - Hỗ trợ cờ `--wave=10` để ép tải trực tiếp vào các wave nặng nhất.
2. **`scripts/perf-benchmark.js` (Telemetry & Profiling Agent)**:
   - Đo lường và xuất ra file `perf-benchmark.json` và bảng Markdown trong `PERF.md`:
     - Average FPS, p50 FPS, p95 FPS, p99 FPS, Min FPS.
     - Tần suất các frame vượt ngưỡng $16.6\text{ms}$ (Jank frames count).
     - Tốc độ tiêu thụ bộ nhớ JS Heap.
3. **Cross-Platform Verification**:
   - Chạy kiểm thử trên các cấu hình:
     - Profile 1: Desktop High-End (DPR 2, 144Hz).
     - Profile 2: Laptop Standard (DPR 1.5, 60Hz).
     - Profile 3: Mobile Emulated (Touch controls, DPR 1.0).

---

## 3. Kế hoạch Đo đạc & Tiêu chuẩn Nghiệm thu (Verification & SLAs)

| Chỉ số Hiệu năng | Hiện trạng (Baseline ước tính) | Mục tiêu Tối ưu hóa (Target SLA) |
| :--- | :--- | :--- |
| **FPS Trung bình (Wave 5-10)** | 35 – 50 FPS (dao động mạnh) | $\ge 59.5\text{ FPS}$ (trên màn 60Hz) / $120+\text{ FPS}$ (144Hz) |
| **FPS Thấp nhất (p99 Min)** | $< 25\text{ FPS}$ (khựng khi nổ lớn) | $\ge 50\text{ FPS}$ |
| **Tần suất Long Tasks (>50ms)** | 10 – 25 lần / phút | $0$ lần / phút |
| **Áp lực Cấp phát Rác (GC Allocation)** | Hàng chục MB/phút từ Path2D & Map | Giảm $> 85\%$ rác sinh ra trong game loop |
| **Độ trễ phản hồi Window Motion** | Giật cục, đơ DWM | Mượt mà, chuyển động liên tục không drop FPS |
| **Bộ kiểm thử tự động (Unit tests)** | 1.134 Pass, 5 Fail (do game.js lệch) | **100% Pass** (1.140/1.140 tests xanh) |

---

## 4. Lộ trình Thực hiện Từng bước (Implementation Phases)

1. **Giai đoạn 1: Sửa lỗi đồng bộ & Thiết lập Baseline Benchmark Agent**:
   - Sửa các test đang lệch và build lại `js/game.js` sạch sẽ.
   - Xây dựng Agent `scripts/perf-bot.js` & `scripts/perf-benchmark.js` để đo đạc và ghi nhận bộ số liệu Baseline vào `PERF.md`.
2. **Giai đoạn 2: Tối ưu Window IPC & Caching**:
   - Triển khai `CachedWinState` và Throttled Window Motion trong `js/game/01-winctrl.js`.
3. **Giai đoạn 3: Tối ưu Zero-Allocation Particles & Render Pipeline**:
   - Triển khai Pre-allocated Buckets và in-place compaction trong `js/particles.js` và `js/game/17-render.js`.
4. **Giai đoạn 4: Triển khai Spatial Hash Grid cho Va chạm**:
   - Tối ưu vòng lặp va chạm đạn - quái trong `js/game/16-update.js`.
5. **Giai đoạn 5: Mở rộng Adaptive Quality cho Desktop**:
   - Cập nhật `js/quality.js` để tự động bảo vệ khung hình trên mọi cấu hình.
6. **Giai đoạn 6: Benchmark Kiểm chứng, Chạy Toàn Bộ Test & Git Commit/Push**:
   - Chạy lại Benchmark Agent, xuất bảng đối chiếu Before / After.
   - Chạy toàn bộ test suite, xác nhận 100% Pass và thực hiện commit/push.
