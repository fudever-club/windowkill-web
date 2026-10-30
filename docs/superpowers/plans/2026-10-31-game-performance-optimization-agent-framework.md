# Game Performance Optimization and Multi-Agent Framework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Triển khai toàn diện giải pháp tối ưu hóa hiệu năng game (Zero-Allocation Particles, Spatial Hash Grid collision, Throttled Window IPC, Dynamic Desktop DPR) và xây dựng hệ thống Agent tự động mô phỏng & đo lường benchmark trên web để đảm bảo game đạt 60–144 FPS mượt mà trên mọi thiết bị.

**Architecture:** Sử dụng kiến trúc module hóa theo `MANIFEST.txt` của Windowkill Web; đưa vào cấu trúc dữ liệu phẳng (Spatial Hash Grid $80\text{px}$) thay thế vòng lặp $O(N \times M)$; tái sử dụng bộ đệm tĩnh triệt tiêu rác bộ nhớ V8 Garbage Collection; điều tiết tần suất IPC giữa trình duyệt và Windows DWM; và mở rộng script bot CDP thành hệ thống đo kiểm khung hình chuyên sâu.

**Tech Stack:** Vanilla JavaScript (ES6+), HTML5 Canvas 2D, Web Audio API, Chrome DevTools Protocol (CDP), Node.js test runner (`node:test`).

**Spec:** [`docs/superpowers/specs/2026-10-31-game-performance-optimization-agent-framework-design.md`](file:///c:/Users/qnhat/_Project/window_kill/docs/superpowers/specs/2026-10-31-game-performance-optimization-agent-framework-design.md)

## Global Constraints
- Không sửa trực tiếp file `js/game.js`; chỉ sửa trong `js/game/*.js` rồi chạy `node scripts/build-game.js`.
- Giữ nguyên toàn bộ 1.194 tests hiện có xanh 100% (`node --test tests/*.test.js`).
- Không thêm thư viện bên ngoài (Zero dependencies, pure Web standards).
- Không thay đổi gameplay balance, vũ khí, điểm số hay mỹ thuật cốt lõi.

---

### Task 1: Xây dựng Benchmark Agent & Đo đạc Baseline Hiệu Năng Ban Đầu

**Files:**
- Create: `scripts/perf-benchmark.js`
- Create: `PERF.md`
- Test: `tests/perf-agent.test.js`

**Interfaces:**
- Consumes: CDP endpoint qua Chromium hoặc game session
- Produces: `perf-benchmark.json`, báo cáo so sánh bảng Markdown trong `PERF.md`

- [ ] **Step 1: Viết test cho module đo đạc benchmark**
```javascript
// tests/perf-agent.test.js
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { calculateFrameStats } = require("../scripts/perf-benchmark.js");

describe("Benchmark Agent metrics calculation", () => {
  it("tính đúng avg, p50, p95, p99 và min FPS từ danh sách frame times", () => {
    const frameTimes = [16.6, 16.7, 16.5, 33.2, 16.6, 50.0];
    const stats = calculateFrameStats(frameTimes);
    assert.ok(stats.avgFps > 0);
    assert.ok(stats.p95Fps <= stats.p50Fps);
    assert.ok(stats.minFps <= stats.p99Fps);
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận test FAIL (chưa có code)**
Run: `node --test tests/perf-agent.test.js`
Expected: FAIL

- [ ] **Step 3: Triển khai script `scripts/perf-benchmark.js`**
Triển khai module tính toán chỉ số khung hình và ghi file `PERF.md`.

- [ ] **Step 4: Chạy lại test để xác nhận PASS**
Run: `node --test tests/perf-agent.test.js`
Expected: PASS

- [ ] **Step 5: Ghi lại Baseline ban đầu vào `PERF.md` và commit**
```bash
git add scripts/perf-benchmark.js tests/perf-agent.test.js PERF.md
git commit -m "feat(perf): add automated benchmark agent and initial performance ledger"
```

---

### Task 2: Caching & Throttled Window Motion Subsystem

**Files:**
- Modify: `js/game/01-winctrl.js`
- Test: `tests/window-perf.test.js`

**Interfaces:**
- Consumes: `pushWindow(dx, dy)`, `applyWindowMotion(dt)`, `bounds()`
- Produces: `CachedWinState`, mượt mà hóa `window.moveBy()` mà không block main thread

- [ ] **Step 1: Viết unit test cho cơ chế Caching và Throttling Window IPC**
```javascript
// tests/window-perf.test.js
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

describe("Window IPC Throttling & Caching", () => {
  it("01-winctrl.js có CachedWinState và không đọc window.screenX mỗi frame", () => {
    const src = fs.readFileSync(path.join(__dirname, "../js/game/01-winctrl.js"), "utf8");
    assert.match(src, /CachedWinState/);
    assert.match(src, /accumulated/i);
  });
});
```

- [ ] **Step 2: Chạy test xác nhận FAIL**
Run: `node --test tests/window-perf.test.js`
Expected: FAIL

- [ ] **Step 3: Triển khai `CachedWinState` và Throttled Motion trong `js/game/01-winctrl.js`**
Thay thế các lần đọc DOM đồng bộ trực tiếp bằng giá trị cache có TTL, tích lũy độ dời $(\Delta x, \Delta y)$ và chỉ gửi lệnh IPC khi tích lũy đủ $\ge 1\text{px}$.

- [ ] **Step 4: Rebuild game và chạy test**
Run: `node scripts/build-game.js && node --test tests/window-jump.test.js tests/window-perf.test.js`
Expected: PASS

- [ ] **Step 5: Commit task 2**
```bash
git add js/game/01-winctrl.js js/game.js tests/window-perf.test.js
git commit -m "perf(window): cache DOM queries and throttle window motion IPC"
```

---

### Task 3: Zero-Allocation Particle Batching Pipeline

**Files:**
- Modify: `js/particles.js`
- Modify: `js/game/17-render.js`
- Test: `tests/particle-perf.test.js`

**Interfaces:**
- Consumes: `G.parts` array
- Produces: `WKParticles.draw(ctx, parts)` với zero GC allocation

- [ ] **Step 1: Viết test kiểm tra zero-allocation particle bucketize**
```javascript
// tests/particle-perf.test.js
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

describe("Particle Zero-Allocation", () => {
  it("js/particles.js không khởi tạo new Map() trong draw loop", () => {
    const src = fs.readFileSync(path.join(__dirname, "../js/particles.js"), "utf8");
    assert.ok(!/function bucketize\([^)]*\)\s*\{\s*var byColor\s*=\s*new Map\(\)/.test(src), "còn new Map mỗi frame");
  });
});
```

- [ ] **Step 2: Chạy test xác nhận FAIL**
Run: `node --test tests/particle-perf.test.js`
Expected: FAIL

- [ ] **Step 3: Triển khai Static Bucket Pool trong `js/particles.js`**
Cấp phát trước các slot bucket, gom hạt trực tiếp và tái sử dụng bộ nhớ đệm, tối ưu hóa các lệnh vẽ Canvas 2D.

- [ ] **Step 4: Rebuild game và chạy kiểm thử particle**
Run: `node scripts/build-game.js && node --test tests/particle-batching.test.js tests/particle-perf.test.js`
Expected: PASS

- [ ] **Step 5: Commit task 3**
```bash
git add js/particles.js js/game/17-render.js js/game.js tests/particle-perf.test.js
git commit -m "perf(particles): eliminate per-frame allocations via static bucket pooling"
```

---

### Task 4: Phân Vùng Không Gian Spatial Hash Grid cho Va Chạm

**Files:**
- Modify: `js/game/16-update.js`
- Test: `tests/spatial-collision.test.js`

**Interfaces:**
- Consumes: `G.bullets`, `G.enemies`
- Produces: Tìm kiếm va chạm tiệm cận $O(M)$

- [ ] **Step 1: Viết test cho Spatial Grid**
```javascript
// tests/spatial-collision.test.js
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

describe("Spatial Hash Grid Collision", () => {
  it("16-update.js có hàm SpatialGrid và phân loại quái theo cell", () => {
    const src = fs.readFileSync(path.join(__dirname, "../js/game/16-update.js"), "utf8");
    assert.match(src, /SpatialGrid/);
  });
});
```

- [ ] **Step 2: Chạy test xác nhận FAIL**
Run: `node --test tests/spatial-collision.test.js`
Expected: FAIL

- [ ] **Step 3: Triển khai SpatialGrid trong `js/game/16-update.js`**
Tạo cấu trúc lưới ô $80\text{px}$, gán quái vào ô tương ứng ở đầu `update()`, và dùng lưới để tra cứu nhanh va chạm cho từng viên đạn.

- [ ] **Step 4: Rebuild và chạy test va chạm**
Run: `node scripts/build-game.js && node --test tests/spatial-collision.test.js tests/smoke.test.js`
Expected: PASS

- [ ] **Step 5: Commit task 4**
```bash
git add js/game/16-update.js js/game.js tests/spatial-collision.test.js
git commit -m "perf(collision): accelerate bullet-enemy collision with spatial hash grid"
```

---

### Task 5: Dynamic Adaptive Performance Scaling cho Desktop & Multi-Device

**Files:**
- Modify: `js/quality.js`
- Test: `tests/desktop-quality-perf.test.js`

**Interfaces:**
- Consumes: `onFpsSample(fps, inCombat)`
- Produces: Tự động hạ/tăng tier chất lượng thông minh cho cả Desktop khi tụt khung hình

- [ ] **Step 1: Viết test cho Desktop adaptive quality**
```javascript
// tests/desktop-quality-perf.test.js
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const Q = require("../js/quality.js");

describe("Desktop Adaptive Quality Scaling", () => {
  it("Desktop tự động hạ nấc khi FPS thấp liên tục trong mode auto", () => {
    Q.init();
    Q.mobile = false;
    Q.mode = "auto";
    Q.tier = "high";
    Q.onFpsSample(20, true);
    assert.equal(Q.tier, "balanced");
  });
});
```

- [ ] **Step 2: Chạy test xác nhận FAIL**
Run: `node --test tests/desktop-quality-perf.test.js`
Expected: FAIL

- [ ] **Step 3: Cập nhật `js/quality.js`**
Bỏ lệnh cấm desktop thích ứng, cho phép Desktop tự bảo vệ khung hình khi máy yếu hoặc tải nặng.

- [ ] **Step 4: Chạy test xác nhận PASS**
Run: `node --test tests/desktop-quality-perf.test.js tests/mobile-quality.test.js`
Expected: PASS

- [ ] **Step 5: Commit task 5**
```bash
git add js/quality.js tests/desktop-quality-perf.test.js
git commit -m "perf(quality): enable dynamic adaptive performance scaling for desktop devices"
```

---

### Task 6: Nâng Cấp Agent Simulation Bot, Đo Đạc Nghiệm Thu & Push

**Files:**
- Create: `scripts/perf-bot.js`
- Modify: `PERF.md`
- Build & Run: Full suite tests

- [ ] **Step 1: Hoàn thiện Player Simulation Bot `scripts/perf-bot.js` với chế độ Stress Test**
- [ ] **Step 2: Chạy toàn bộ 1.194+ bài test để đảm bảo 100% PASS**
Run: `node --test (Get-ChildItem tests\*.test.js).FullName`
Expected: 100% PASS, 0 FAIL
- [ ] **Step 3: Cập nhật bảng đo lường Before / After vào `PERF.md`**
- [ ] **Step 4: Git commit và push lên repository**
```bash
git push origin main
```
