/* WINDOWKILL — api.js client tests (node:test, fetch mock).
 * SYSTEM TEST: backend là OPTIONAL — client phải degrade êm về localStorage
 * khi backend chết, và luồng token auth (X-Profile-Token) phải đúng.
 * Chạy: node --test tests/api-client.test.js
 */
"use strict";

const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const API_SRC = fs.readFileSync(path.join(ROOT, "js/api.js"), "utf8");

function makeEnv() {
  const store = {};
  const localStorage = {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { for (const k of Object.keys(store)) delete store[k]; },
  };
  const calls = [];
  let fetchImpl = async () => { throw new Error("network down"); };
  const sandbox = {
    localStorage,
    navigator: {},
    AbortController,
    setTimeout,
    clearTimeout,
    console,
    fetch: (...a) => { calls.push(a); return fetchImpl(...a); },
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(API_SRC, sandbox, { filename: "js/api.js" });
  return {
    api: sandbox.window.WKApi,
    store, calls,
    setFetch: (fn) => { fetchImpl = fn; },
    setBase: (v) => { sandbox.window.WK_API_BASE = v; },
  };
}

const okHealth = () => ({ ok: true, json: async () => ({ ok: true, data: { status: "up" } }) });

describe("api.js — base URL resolution", () => {
  it("A1: window.WK_API_BASE được ưu tiên, strip trailing slash", async () => {
    const e = makeEnv();
    e.setBase("https://backend.example/");
    e.setFetch(async () => okHealth());
    assert.equal(await e.api.isOnline(), true);
    assert.ok(e.calls[0][0] === "https://backend.example/api/health", `got ${e.calls[0][0]}`);
  });
  it("A2: localStorage wk_api_base là fallback khi không có WK_API_BASE", async () => {
    const e = makeEnv();
    e.store["wk_api_base"] = "http://localhost:3001/";
    e.setFetch(async () => okHealth());
    assert.equal(await e.api.isOnline(), true);
    assert.ok(e.calls[0][0] === "http://localhost:3001/api/health", `got ${e.calls[0][0]}`);
  });
  it("A3: không cấu hình gì → same-origin ''", async () => {
    const e = makeEnv();
    e.setFetch(async () => okHealth());
    assert.equal(await e.api.isOnline(), true);
    assert.equal(e.calls[0][0], "/api/health");
  });
});

describe("api.js — offline degrade êm", () => {
  it("A4: fetch reject → isOnline false, mọi method trả null, không throw", async () => {
    const e = makeEnv();
    e.setFetch(async () => { throw new Error("down"); });
    assert.equal(await e.api.isOnline(), false);
    assert.equal(await e.api.leaderboard("chill", 5), null);
    assert.equal(await e.api.submitScore({ profileId: "x", score: 1 }), null);
    assert.equal(await e.api.listProfiles(), null);
  });
  it("A5: health trả ok:false / HTTP lỗi → coi như offline, không gọi tiếp", async () => {
    const e = makeEnv();
    e.setFetch(async () => ({ ok: true, json: async () => ({ ok: false }) }));
    assert.equal(await e.api.isOnline(), false);
    const n = e.calls.length;
    assert.equal(await e.api.leaderboard(), null);
    assert.equal(e.calls.length, n, "không được gọi fetch khi đã biết offline");
  });
  it("A6: health cache trong TTL — lần 2 không fetch lại; reset() buộc check lại", async () => {
    const e = makeEnv();
    e.setFetch(async () => okHealth());
    assert.equal(await e.api.isOnline(), true);
    assert.equal(await e.api.isOnline(), true);
    assert.equal(e.calls.length, 1);
    e.api.reset();
    assert.equal(await e.api.isOnline(), true);
    assert.equal(e.calls.length, 2);
  });
});

describe("api.js — profile token lifecycle (SEC-01)", () => {
  function onlineEnv() {
    const e = makeEnv();
    const seen = [];
    e.setFetch(async (url, opts = {}) => {
      seen.push({ url, headers: opts.headers || {} });
      if (url.endsWith("/api/health")) return okHealth();
      if (url.endsWith("/api/profiles") && opts.method === "POST")
        return { ok: true, json: async () => ({ ok: true, data: { id: "p1", token: "tok123" } }) };
      if (url.endsWith("/api/scores"))
        return { ok: true, json: async () => ({ ok: true, data: { id: 1 } }) };
      if (/\/api\/profiles\//.test(url) && opts.method === "DELETE")
        return { ok: true, json: async () => ({ ok: true, data: { deleted: true } }) };
      return { ok: false, json: async () => null };
    });
    return { e, seen };
  }
  it("A7: createProfile lưu token one-time; submitScore gửi X-Profile-Token", async () => {
    const { e, seen } = onlineEnv();
    const d = await e.api.createProfile({ name: "T" });
    assert.equal(d.id, "p1");
    assert.equal(e.api.hasProfileToken("p1"), true);
    await e.api.submitScore({ profileId: "p1", score: 100 });
    const sc = seen.find((s) => s.url.endsWith("/api/scores"));
    assert.ok(sc, "phải gọi /api/scores");
    assert.equal(sc.headers["X-Profile-Token"], "tok123");
  });
  it("A8: submitScore không token → không gửi header; deleteProfile xong xóa token", async () => {
    const { e, seen } = onlineEnv();
    await e.api.createProfile({ name: "T" });
    await e.api.submitScore({ profileId: "ghost", score: 5 });
    const sc = seen.filter((s) => s.url.endsWith("/api/scores")).pop();
    assert.equal(sc.headers["X-Profile-Token"], undefined);
    await e.api.deleteProfile("p1");
    assert.equal(e.api.hasProfileToken("p1"), false);
  });
  it("A9: JSON hỏng trong wk_profile_tokens → coi như không có token, không crash", async () => {
    const e = makeEnv();
    e.store["wk_profile_tokens"] = "{broken";
    assert.equal(e.api.hasProfileToken("p1"), false);
  });
});
