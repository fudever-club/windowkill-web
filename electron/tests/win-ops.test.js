"use strict";
// Unit test cho electron/win-ops.js (không cần Electron, chạy bằng Node thuần).
// Chạy: node --test electron/tests/win-ops.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { sanitizeOp, clampRect, applyOp, handleWinOp } = require("../win-ops");

const DISPLAYS = [
  { workArea: { x: 0, y: 0, width: 1920, height: 1080 } },
  { workArea: { x: 1920, y: 0, width: 1920, height: 1080 } }, // màn 2 bên phải
];

function mockWin(x, y, w, h) {
  const calls = [];
  return {
    calls,
    getBounds: () => ({ x, y, width: w, height: h }),
    setBounds: (r) => calls.push({ setBounds: r }),
  };
}

// ---------- sanitizeOp ----------
test("sanitizeOp: move hợp lệ", () => {
  assert.deepEqual(sanitizeOp({ op: "move", x: 100, y: 200, pid: null }), {
    op: "move", pid: null, x: 100, y: 200,
  });
});

test("sanitizeOp: từ chối op lạ / thiếu / sai kiểu", () => {
  assert.equal(sanitizeOp(null), null);
  assert.equal(sanitizeOp({}), null);
  assert.equal(sanitizeOp({ op: "delete" }), null);
  assert.equal(sanitizeOp({ op: "move", x: 1 }), null); // thiếu y
  assert.equal(sanitizeOp({ op: "move", x: NaN, y: 1 }), null);
  assert.equal(sanitizeOp({ op: "move", x: Infinity, y: 1 }), null);
  assert.equal(sanitizeOp({ op: "move", x: "abc", y: 1 }), null);
  assert.equal(sanitizeOp({ op: "resize", w: 100 }), null);
});

test("sanitizeOp: pid phải khớp regex an toàn", () => {
  assert.equal(sanitizeOp({ op: "move", x: 1, y: 1, pid: "wk_sat_abc-123_X" }).pid, "wk_sat_abc-123_X");
  assert.equal(sanitizeOp({ op: "move", x: 1, y: 1, pid: "../evil" }), null);
  assert.equal(sanitizeOp({ op: "move", x: 1, y: 1, pid: "a".repeat(81) }), null);
  assert.equal(sanitizeOp({ op: "move", x: 1, y: 1, pid: 123 }), null);
});

test("sanitizeOp: clamp giá trị cực lớn về biên an toàn", () => {
  const op = sanitizeOp({ op: "move", x: 1e12, y: -1e12 });
  assert.equal(op.x, 100000);
  assert.equal(op.y, -100000);
  const mv = sanitizeOp({ op: "moveby", dx: 5, dy: -3 });
  assert.deepEqual([mv.dx, mv.dy], [5, -3]);
});

// ---------- clampRect ----------
test("clampRect: giữ cửa sổ luôn tóm được (multi-monitor)", () => {
  // Bay quá phải màn 2 → kẹp lại, chừa 80px
  let r = clampRect(5000, 100, 800, 600, DISPLAYS);
  assert.equal(r.x, 3840 - 80); // ux1 - GRAB
  // Bay quá trái → kẹp, chừa 80px
  r = clampRect(-5000, 100, 800, 600, DISPLAYS);
  assert.equal(r.x, 0 - 800 + 80);
  // y không cho xuống dưới workArea
  r = clampRect(100, 5000, 800, 600, DISPLAYS);
  assert.equal(r.y, 1080 - 80);
  // y không cho lên trên
  r = clampRect(100, -5000, 800, 600, DISPLAYS);
  assert.equal(r.y, 0);
});

test("clampRect: w/h biên an toàn, làm tròn số nguyên", () => {
  const r = clampRect(10.7, 20.2, 1e9, -5, DISPLAYS);
  assert.equal(r.w, 16384);
  assert.equal(r.h, 1);
  assert.equal(Number.isInteger(r.x), true);
});

test("clampRect: không có display → chỉ clamp w/h", () => {
  const r = clampRect(-99999, 50, 800, 600, []);
  assert.deepEqual(r, { x: -99999, y: 50, w: 800, h: 600 });
});

// ---------- applyOp ----------
test("applyOp: move / moveby qua setBounds", () => {
  const win = mockWin(100, 100, 800, 600);
  const r = applyOp(win, { op: "move", pid: null, x: 300, y: 400 }, DISPLAYS);
  assert.deepEqual(r, { x: 300, y: 400, w: 800, h: 600 });
  assert.deepEqual(win.calls[0].setBounds, { x: 300, y: 400, width: 800, height: 600 });

  const r2 = applyOp(win, { op: "moveby", pid: null, dx: 10, dy: -20 }, DISPLAYS);
  assert.deepEqual([r2.x, r2.y], [110, 80]); // cộng dồn từ bounds hiện tại
});

test("applyOp: resize / resizeby", () => {
  const win = mockWin(100, 100, 800, 600);
  const r = applyOp(win, { op: "resize", pid: null, w: 500, h: 400 }, DISPLAYS);
  assert.deepEqual([r.w, r.h], [500, 400]);
  const r2 = applyOp(win, { op: "resizeby", pid: null, dw: -8, dh: -6 }, DISPLAYS);
  assert.deepEqual([r2.w, r2.h], [792, 594]);
});

test("applyOp: move ra ngoài màn hình bị kẹp lại", () => {
  const win = mockWin(100, 100, 800, 600);
  const r = applyOp(win, { op: "move", pid: null, x: 99999, y: 99999 }, DISPLAYS);
  assert.ok(r.x <= 3840 - 80 && r.y <= 1080 - 80);
});

test("applyOp: fallback setPosition/setSize khi thiếu setBounds", () => {
  const calls = [];
  const win = {
    getBounds: () => ({ x: 0, y: 0, width: 800, height: 600 }),
    setPosition: (x, y) => calls.push(["pos", x, y]),
    setSize: (w, h) => calls.push(["size", w, h]),
  };
  applyOp(win, { op: "move", pid: null, x: 10, y: 20 }, DISPLAYS);
  assert.deepEqual(calls[0], ["pos", 10, 20]);
});

test("applyOp: win/op không hợp lệ → null, không throw", () => {
  assert.equal(applyOp(null, { op: "move", x: 1, y: 1 }, DISPLAYS), null);
  assert.equal(applyOp({}, { op: "move", x: 1, y: 1 }, DISPLAYS), null);
  assert.equal(applyOp(mockWin(0, 0, 1, 1), { op: "nope" }, DISPLAYS), null);
  const boom = { getBounds: () => { throw new Error("x"); }, setBounds: () => {} };
  assert.equal(applyOp(boom, { op: "move", pid: null, x: 1, y: 1 }, DISPLAYS), null);
});

// ---------- handleWinOp (dispatch, luôn trả lời sendSync) ----------
function testCtx(own, popups) {
  return {
    ownWindow: () => own,
    popupWindow: (pid) => (popups && popups[pid]) || null,
    displays: () => DISPLAYS,
  };
}

test("handleWinOp: route về cửa sổ gửi IPC (pid=null)", () => {
  const win = mockWin(100, 100, 800, 600);
  const event = {};
  const ok = handleWinOp(event, { op: "resize", w: 500, h: 400 }, testCtx(win));
  assert.equal(ok, true);
  assert.equal(event.returnValue, true);
  assert.deepEqual(win.calls[0].setBounds, { x: 100, y: 100, width: 500, height: 400 });
});

test("handleWinOp: route tới popup theo pid (frameName)", () => {
  const sat = mockWin(2000, 100, 300, 200);
  const event = {};
  const ok = handleWinOp(
    event,
    { op: "move", pid: "wk_sat_abc", x: 2100, y: 150 },
    testCtx(mockWin(0, 0, 800, 600), { wk_sat_abc: sat })
  );
  assert.equal(ok, true);
  assert.deepEqual(sat.calls[0].setBounds, { x: 2100, y: 150, width: 300, height: 200 });
});

test("handleWinOp: LUÔN set returnValue kể cả khi lỗi", () => {
  // msg độc hại
  let event = {};
  assert.equal(handleWinOp(event, { op: "rm -rf" }, testCtx(mockWin(0, 0, 1, 1))), false);
  assert.equal(event.returnValue, false);
  // popup không tồn tại
  event = {};
  assert.equal(handleWinOp(event, { op: "move", pid: "wk_sat_ghost", x: 1, y: 1 }, testCtx(mockWin(0, 0, 1, 1), {})), false);
  assert.equal(event.returnValue, false);
  // ctx throw
  event = {};
  assert.equal(handleWinOp(event, { op: "move", x: 1, y: 1 }, { ownWindow: () => { throw new Error("boom"); } }), false);
  assert.equal(event.returnValue, false);
  // msg null
  event = {};
  assert.equal(handleWinOp(event, null, testCtx(mockWin(0, 0, 1, 1))), false);
  assert.equal(event.returnValue, false);
});
