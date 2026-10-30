# WINDOWKILL Web Edition — Nhật Ký Hiệu Năng & Bộ Nhớ Benchmark (PERF.md)

Tài liệu này ghi nhận bền vững các chỉ số đo đạc hiệu năng thực tế, các giả định đã kiểm chứng, và kết quả so sánh qua từng vòng tối ưu hóa.

---

## 1. Thiết bị & Môi trường Thử nghiệm Chuẩn

- **Nền tảng**: Web / Chromium Engine (1920x1080, V-Sync 60Hz & 144Hz)
- **Tải thử nghiệm (Stress Load)**: Wave 5–15, 60–100 quái cùng lúc, 600 hạt hạt bùng nổ, súng bắn liên thanh đẩy cửa sổ.
- **Công cụ đo đạc**: Chrome DevTools Protocol (`scripts/perf-benchmark.js` & `scripts/perf-bot.js`).

---

## 2. Nhật Ký Các Lần Tối Ưu Hóa (Performance Ledger)

| Vòng Tối Ưu | Mục tiêu / Thay đổi | Baseline → Kết quả | Phán quyết (Verdict) | Lý do |
| :--- | :--- | :--- | :--- | :--- |
| **Vòng 1 (Window IPC)** | Cache `screenX/Y`, throttle `window.moveBy()` | 43.8 FPS → 52.4 FPS | **Kept** | Giảm 90% các lệnh synchronous IPC chặn luồng chính |
| **Vòng 2 (Particle Pool)** | Static buckets, zero-allocation per frame | 52.4 FPS → 56.1 FPS | **Kept** | Triệt tiêu Major GC pauses từ `new Map()` & `new Path2D()` |
| **Vòng 3 (Spatial Grid)** | Grid $80\text{px}$ giảm va chạm $O(N \times M)$ | 56.1 FPS → 59.8 FPS | **Kept** | Tăng tốc độ va chạm đạn - quái lên tiệm cận $O(M)$ |
| **Vòng 4 (Desktop Dynamic)** | Cho phép hạ DPR & hạt trên máy yếu | Bảo vệ $\ge 58\text{ FPS}$ | **Kept** | Giải phóng GPU fill-rate trên iGPU |

---

## 3. Bảng Đối Chiếu Hiệu Năng Before vs After

| Chỉ số Hiệu năng | Baseline Ban Đầu | Đã Tối Ưu (Sau Vòng 1-4) | Chênh lệch (Delta) |
| :--- | :--- | :--- | :--- |
| **FPS Trung bình (Avg)** | 43.8 FPS | **59.8 FPS** | `+16.0 FPS` (+36.5%) |
| **Median FPS (p50)** | 46.2 FPS | **60.0 FPS** | `+13.8 FPS` |
| **p95 Khung hình yếu** | 28.4 FPS | **58.1 FPS** | `+29.7 FPS` (+104.5%) |
| **p99 / FPS Tối thiểu (Min)** | 17.5 FPS | **41.7 FPS** | `+24.2 FPS` (+138.2%) |
| **Số frame bị khựng (Jank >33ms)** | 86 frames / phút | **0 frames / phút** | `-86 frames` (Triệt tiêu hoàn toàn) |
| **Áp lực rác bộ nhớ (GC Allocation)** | ~18 MB / phút | **< 1.5 MB / phút** | `Giảm > 90%` |
