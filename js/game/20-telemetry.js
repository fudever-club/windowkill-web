/* WINDOWKILL — Telemetry "FUN" tối thiểu (local-first, ẩn danh).
 *
 * Vấn đề: pick-rate upgrade, wave quit, nguyên nhân chết đang mù → mọi quyết
 * định balance là cảm tính. Module này là chokepoint duy nhất: game code chỉ
 * gọi Telemetry.log(...) (1 dòng/hook), mọi chuyện còn lại ở đây.
 *
 * =====================================================================
 * SCHEMA EVENT (v1) — 3 loại tối thiểu:
 *
 * 1. "upgrade_chosen" — draft pick-rate (cái nào được chọn + wave).
 *    fields: upgrade_id (string, sanitize về [A-Za-z0-9_-]{1,64} theo server),
 *            wave (int), level (int).
 *    upload: POST /api/events type "upgrade_chosen" (đã có từ Sprint R2).
 *
 * 2. "wave_quit" — người chơi thoát giữa run (pause → "Về menu"), ở wave mấy.
 *    fields: wave, score, kills, duration_s, difficulty, level.
 *    upload: server CHƯA có type riêng → map sang POST /api/events type
 *            "game_over" (score/wave/difficulty/duration_s đều hợp lệ).
 *            Dashboard suy ra quit = game_over KHÔNG kèm death_cause cùng run
 *            (die() luôn gửi kèm death_cause; quit thì không).
 *            Follow-up đề xuất: thêm type "wave_quit" vào server/src/validate.js
 *            + deploy backend, rồi bỏ mapping này.
 *
 * 3. "death" — game over + nguyên nhân chết.
 *    fields: cause ∈ {"enemy","window","unknown"}, wave, score, kills,
 *            duration_s, difficulty, level.
 *    cause mapping: die("window") → "window"  (gặm viền: arena bị quái gặm vỡ);
 *                   die("ship")   → "enemy"   (hết máu: đạn/quái/boss/kamikaze);
 *                   khác          → "unknown".
 *    upload: POST /api/events type "death_cause" (đã có từ Sprint R2).
 *    Lưu ý: hurtShip(dmg,x,y) hiện KHÔNG truyền killer info nên chưa tách được
 *    đạn quái / boss / kamikaze — server đã chừa sẵn enum "boss","kamikaze",
 *    "chewer" cho instrumentation sâu hơn (follow-up: thread killer qua
 *    hurtShip → die(reason)).
 *
 * Mọi event đều gắn: sid (session id NGẪU NHIÊN mỗi lần load trang —
 * crypto.getRandomValues, không liên quan profile), ts (ms), v (schema v1).
 * TUYỆT ĐỐI KHÔNG thu thập: tên, email, device fingerprint, profile id thô.
 * (Server còn strip mọi field lạ — chỉ field trong whitelist mới tới DB.)
 * =====================================================================
 *
 * Kiến trúc local-first:
 *   log() → check consent → validate/normalize → queue (memory) →
 *   persist localStorage (throttle 5s, cap 200 event) →
 *   forward sang window.WKAnalytics (pipeline sẵn có: batch 15s + sendBeacon
 *   → /api/events, fail-silent).
 * - Mất mạng / WKAnalytics chưa sẵn sàng: event nằm lại localStorage, retry ở
 *   flush sau (30s) / lần load trang sau. KHÔNG crash game — log() không bao
 *   giờ throw (mọi thứ bọc try/catch, fail-silent).
 * - Tôn trọng setting analytics hiện có: CHỈ log khi
 *   window.WKAnalytics.isEnabled() (1 chokepoint — tôn trọng DNT + toggle
 *   "Thống kê ẩn danh" (localStorage wk_analytics) + portal mode). Tắt là
 *   không log, không persist, queue cũ bị dọn.
 * - Perf: không chạy per-frame; localStorage write throttle; queue cap;
 *   upload dùng sendBeacon/keepalive của pipeline sẵn có.
 *
 * API: Telemetry.log(type, data) -> true (đã nhận) / false (bỏ qua).
 *      Telemetry.flush() — ép handoff batch đang chờ (dùng cho pagehide/test).
 *      window.WKTelemetry — tham chiếu debug/test.
 */
const Telemetry = (() => {
  const LS_KEY = "wk_telemetry_v1";
  const SCHEMA_V = 1;
  const MAX_QUEUE = 200;          // chặn localStorage phình
  const PERSIST_THROTTLE_MS = 5000;
  const FLUSH_INTERVAL_MS = 30000;
  const DIFFS = ["chill", "normal", "hard"];

  let sid = null;                 // session id ngẫu nhiên, 1 lần/load trang
  let queue = [];                 // event chờ handoff (mirror của localStorage)
  let lastPersist = 0;
  let persistTimer = 0;
  let flushTimer = 0;

  function getSid() {
    if (sid) return sid;
    try {
      const b = new Uint8Array(8);
      if (window.crypto && typeof window.crypto.getRandomValues === "function") {
        window.crypto.getRandomValues(b);
      } else {
        for (let i = 0; i < 8; i++) b[i] = Math.floor(Math.random() * 256);
      }
      sid = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
    } catch (e) {
      sid = "rnd" + Math.floor(Math.random() * 1e12).toString(36);
    }
    return sid;
  }

  /* Consent: 1 chokepoint duy nhất — tái dùng logic sẵn có của js/analytics.js
   * (DNT + toggle wk_analytics + portal mode). Không có pipeline → fail-closed
   * (không log) để không bao giờ ghi lén khi user đã tắt. */
  function enabled() {
    try {
      const A = window.WKAnalytics;
      if (A && typeof A.isEnabled === "function") return !!A.isEnabled();
    } catch (e) {}
    return false;
  }

  const int0 = (v) => {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  };
  const level1 = (v) => Math.max(1, int0(v) || 1);
  const diffOf = (v) => (DIFFS.indexOf(v) >= 0 ? v : "normal");
  /* sanitize đúng pattern server [A-Za-z0-9_-]{1,64} (copy từ js/analytics.js) */
  const sanitizeId = (v) => String(v == null ? "" : v)
    .replace(/[^A-Za-z0-9_-]/g, "-").replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "").slice(0, 64);

  /* die(reason) -> cause enum (khớp server/src/validate.js DEATH_CAUSES) */
  function mapCause(reason) {
    if (reason === "window") return "window"; // gặm viền: arena bị gặm vỡ
    if (reason === "ship") return "enemy";    // hết máu
    return "unknown";
  }

  /* Validate + normalize theo schema v1. Trả null = event không hợp lệ → bỏ. */
  function normalize(type, data) {
    const d = (data && typeof data === "object") ? data : {};
    const base = { v: SCHEMA_V, sid: getSid(), ts: Date.now() };
    if (type === "upgrade_chosen") {
      const id = sanitizeId(d.upgrade_id);
      if (!id) return null;
      return { type, ...base, upgrade_id: id, wave: int0(d.wave), level: level1(d.level) };
    }
    if (type === "wave_quit") {
      if (d.phase === "over") return null; // đã chết → death đã log, tránh double-count
      return { type, ...base,
        wave: int0(d.wave), score: int0(d.score), kills: int0(d.kills),
        duration_s: int0(d.duration_s), difficulty: diffOf(d.difficulty), level: level1(d.level) };
    }
    if (type === "death") {
      return { type, ...base, cause: mapCause(d.reason),
        wave: int0(d.wave), score: int0(d.score), kills: int0(d.kills),
        duration_s: int0(d.duration_s), difficulty: diffOf(d.difficulty), level: level1(d.level) };
    }
    return null; // type lạ → bỏ, không bao giờ gửi rác lên server
  }

  /* Handoff 1 event sang pipeline upload sẵn có (js/analytics.js → /api/events).
   * Chỉ dùng type trong whitelist server — 1 event xấu reject cả batch nên
   * KHÔNG bao giờ forward type lạ. Trả true = đã handoff. */
  function forward(ev) {
    try {
      const A = window.WKAnalytics;
      if (!A || typeof A.isEnabled !== "function" || !A.isEnabled()) return false;
      if (ev.type === "upgrade_chosen" && typeof A.trackUpgradeChosen === "function") {
        A.trackUpgradeChosen(ev.upgrade_id, { wave: ev.wave, level: ev.level });
        return true;
      }
      if (ev.type === "death" && typeof A.trackDeathCause === "function") {
        A.trackDeathCause(ev.cause, { wave: ev.wave, score: ev.score, difficulty: ev.difficulty });
        return true;
      }
      if (ev.type === "wave_quit" && typeof A.track === "function") {
        // server chưa có "wave_quit" → map sang "game_over" (xem schema trên đầu file)
        A.track("game_over", { score: ev.score, wave: ev.wave,
          difficulty: ev.difficulty, duration_s: ev.duration_s });
        return true;
      }
    } catch (e) {}
    return false;
  }

  function persistNow() {
    lastPersist = Date.now();
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(queue.slice(-MAX_QUEUE)));
    } catch (e) {} // quota đầy / private mode → bỏ qua, memory queue vẫn chạy
  }

  function persistThrottled() {
    const now = Date.now();
    if (now - lastPersist >= PERSIST_THROTTLE_MS) { persistNow(); return; }
    if (!persistTimer) {
      try {
        persistTimer = setTimeout(() => { persistTimer = 0; persistNow(); }, PERSIST_THROTTLE_MS);
      } catch (e) {}
    }
  }

  function rehydrate() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) queue = arr.filter((e) => e && typeof e.type === "string").slice(-MAX_QUEUE);
    } catch (e) { queue = []; }
  }

  /* Ép handoff toàn bộ queue đang chờ. Event chưa handoff được giữ lại
   * localStorage để retry — không mất khi mất mạng. */
  function flush() {
    flushTimer = 0;
    if (!queue.length) return;
    try {
      if (!enabled()) { queue = []; persistNow(); return; } // user vừa tắt → dọn
      // local-first: offline thì giữ nguyên trong localStorage, retry sau —
      // onLine=false chắc chắn mất mạng; true thì để pipeline beacon tự xử lý
      try { if (typeof navigator !== "undefined" && navigator && navigator.onLine === false) { persistNow(); return; } } catch (e) {}
      const rest = [];
      for (const ev of queue) { if (!forward(ev)) rest.push(ev); }
      queue = rest.slice(-MAX_QUEUE);
      persistNow();
    } catch (e) {}
  }

  function scheduleFlush(ms) {
    if (flushTimer) return;
    try { flushTimer = setTimeout(flush, Math.max(0, ms | 0)); } catch (e) {}
  }

  /* Entry point duy nhất cho game code. Không bao giờ throw. */
  function log(type, data) {
    try {
      if (!enabled()) return false;
      const ev = normalize(type, data);
      if (!ev) return false;
      queue.push(ev);
      if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);
      persistThrottled();
      scheduleFlush(1000); // handoff nhanh cho pipeline, không đợi batch 15s
      return true;
    } catch (e) { return false; }
  }

  /* init: nhặt event còn sót từ session trước (tắt trang khi mất mạng) */
  try {
    rehydrate();
    scheduleFlush(2000);
    if (typeof setInterval === "function") setInterval(flush, FLUSH_INTERVAL_MS);
    if (typeof document !== "undefined" && document && typeof document.addEventListener === "function") {
      document.addEventListener("visibilitychange", () => { try { if (document.hidden) flush(); } catch (e) {} });
    }
    if (typeof window !== "undefined" && window && typeof window.addEventListener === "function") {
      window.addEventListener("pagehide", flush);
    }
  } catch (e) {}

  const api = { log, flush, ready: true,
    /* test/debug hooks (không dùng trong game): */
    _queue: () => queue.slice(), _lsKey: LS_KEY, _mapCause: mapCause };
  try { window.WKTelemetry = api; } catch (e) {}
  return api;
})();
