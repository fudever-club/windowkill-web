/* WINDOWKILL — SW cache-strategy behavioral tests.
 * Nạp sw.js THẬT vào sandbox mô phỏng môi trường Service Worker (stub self,
 * caches, fetch, Request, Response) rồi kích hoạt các event install/fetch/
 * message/activate để kiểm chứng hành vi:
 *   - game core (js/css/html): network-first — online luôn trả bản mới,
 *     offline fallback về cache;
 *   - asset nặng (assets/*): cache-first — có cache thì không chạm network;
 *   - offline hoàn toàn sau lần load đầu (toàn bộ core đã precache).
 * Chạy: node --test tests/sw-strategy.test.js
 */
"use strict";

const { describe, it, before } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const SW_SRC = fs.readFileSync(path.resolve(__dirname, "..", "sw.js"), "utf8");
const ORIGIN = "https://game.local";

const versionOf = () => SW_SRC.match(/const VERSION\s*=\s*"([^"]+)"/)[1];

function makeSandbox() {
  const listeners = {};
  let fetchImpl = () => Promise.reject(new Error("offline"));
  const store = {}; // cacheName -> Map(url -> response)
  const fetchCalls = [];

  function wrapCache(name) {
    if (!store[name]) store[name] = new Map();
    const map = store[name];
    return {
      match(req) {
        const url = typeof req === "string" ? req : req.url;
        return Promise.resolve(map.get(url));
      },
      put(req, res) { map.set(req.url, res); return Promise.resolve(); },
      addAll(reqs) {
        return Promise.all(
          reqs.map((r) => fetchImpl(r.url, r).then((res) => { map.set(r.url, res); }))
        );
      },
    };
  }

  const caches = {
    open: (name) => Promise.resolve(wrapCache(name)),
    keys: () => Promise.resolve(Object.keys(store)),
    delete: (name) => {
      const had = name in store;
      delete store[name];
      return Promise.resolve(had);
    },
    match: (url) => {
      // giống SW thật: string tương đối được resolve theo scope của SW
      const u = typeof url === "string" ? new URL(url, ORIGIN + "/").href : url.url;
      for (const n of Object.keys(store)) {
        const hit = store[n].get(u);
        if (hit) return Promise.resolve(hit);
      }
      return Promise.resolve(undefined);
    },
  };

  function Request(url, init) {
    const href = new URL(url, ORIGIN + "/").href;
    return {
      url: href,
      method: "GET",
      mode: (init && init.mode) || "no-cors",
      headers: { has: () => false },
      clone() { return Request(href, init); },
    };
  }

  function Response(body, init) {
    const status = (init && init.status) || 200;
    const r = {
      ok: status >= 200 && status < 300,
      status,
      body,
      clone() { return Response(r.body, { status: r.status }); },
    };
    return r;
  }

  const self = {
    location: { origin: ORIGIN },
    skipWaitingCalls: 0,
    claimCalls: 0,
    skipWaiting() { this.skipWaitingCalls++; },
    clients: { claim: () => { self.claimCalls++; return Promise.resolve(); } },
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
  };

  const sandbox = {
    self,
    caches,
    Request,
    Response,
    URL,
    console,
    fetch(req, init) {
      const url = typeof req === "string" ? req : req.url;
      fetchCalls.push(url);
      return fetchImpl(url, req, init);
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(SW_SRC, sandbox, { filename: "sw.js" });

  function fireFetch(url, opts) {
    const req = Request(url, opts);
    req.mode = (opts && opts.mode) || "no-cors";
    if (opts && opts.range) req.headers = { has: (n) => n === "range" };
    if (opts && opts.method) req.method = opts.method;
    let passThrough = true;
    let responded = null;
    const event = {
      request: req,
      respondWith(p) { passThrough = false; responded = p; },
    };
    for (const fn of listeners.fetch || []) fn(event);
    return { req, passThrough, response: responded };
  }

  function fireMessage(data) {
    for (const fn of listeners.message || []) fn({ data });
  }

  function runLifecycle(type) {
    let p = null;
    const event = { waitUntil(x) { p = x; } };
    for (const fn of listeners[type] || []) fn(event);
    return Promise.resolve(p);
  }

  return {
    self,
    store,
    fetchCalls,
    setOnline(bodyFn) {
      fetchImpl = (url) =>
        Promise.resolve(Response(typeof bodyFn === "function" ? bodyFn(url) : bodyFn));
    },
    setOffline() {
      fetchImpl = () => Promise.reject(new Error("network down"));
    },
    fireFetch,
    fireMessage,
    runLifecycle,
    install() { return this.runLifecycle("install"); },
    activate() { return this.runLifecycle("activate"); },
  };
}

describe("sw.js — install precache (nền cho offline hoàn toàn)", () => {
  let sb;
  before(async () => {
    sb = makeSandbox();
    sb.setOnline((url) => "NET:" + url);
    await sb.install();
  });
  it("S1: precache toàn bộ game core vào core cache", () => {
    const core = sb.store[versionOf() + "-core"];
    assert.ok(core, "thiếu core cache");
    for (const f of ["js/game.js", "js/menu.js", "js/i18n.js", "js/pwa.js",
      "css/style.css", "index.html", "game.html", "offline.html",
      "manifest.webmanifest", "difficulty.config.json"]) {
      assert.ok(core.get(ORIGIN + "/" + f), `core thiếu ${f}`);
    }
  });
  it("S2: precache asset nặng (ảnh/icons + track BGM đầu) vào static cache", () => {
    const stat = sb.store[versionOf() + "-static"];
    assert.ok(stat, "thiếu static cache");
    for (const f of ["assets/music/joyfully-loop.mp3", "assets/icons/icon-192.png",
      "assets/hero.jpg", "assets/logo-lockup.webp"]) {
      assert.ok(stat.get(ORIGIN + "/" + f), `static thiếu ${f}`);
    }
  });
});

describe("sw.js — network-first cho game core", () => {
  let sb;
  before(async () => {
    sb = makeSandbox();
    sb.setOnline(() => "v1");
    await sb.install(); // precache v1
  });
  it("S3: online → trả bản MỚI nhất (không trả cache cũ)", async () => {
    sb.setOnline(() => "v2");
    const { passThrough, response } = sb.fireFetch(ORIGIN + "/js/game.js");
    assert.equal(passThrough, false, "core phải được SW xử lý");
    const res = await response;
    assert.equal(res.body, "v2", "phải trả bản network mới, không phải cache v1");
  });
  it("S4: bản mới được lưu vào cache cho lần offline sau", async () => {
    const core = sb.store[versionOf() + "-core"];
    assert.equal(core.get(ORIGIN + "/js/game.js").body, "v2");
  });
  it("S5: offline → fallback về cache (game vẫn boot được)", async () => {
    sb.setOffline();
    const { response } = sb.fireFetch(ORIGIN + "/js/game.js");
    const res = await response;
    assert.ok(res, "offline phải có fallback cache");
    assert.equal(res.body, "v2");
  });
  it("S6: navigation offline → trả trang cache, trang lạ → offline.html", async () => {
    sb.setOffline();
    const page = await sb.fireFetch(ORIGIN + "/game.html", { mode: "navigate" }).response;
    assert.equal(page.body, "v1", "navigation offline phải trả game.html trong cache");
    const odd = await sb.fireFetch(ORIGIN + "/khong-co-trang.html", { mode: "navigate" }).response;
    assert.ok(odd, "phải có fallback cuối");
    assert.equal(odd.body, "v1", "trang lạ offline phải về offline.html đã precache");
  });
});

describe("sw.js — cache-first cho asset nặng", () => {
  let sb;
  before(async () => {
    sb = makeSandbox();
    sb.setOnline(() => "heavy-v1");
    await sb.install();
  });
  it("S7: có cache → trả cache, KHÔNG chạm network", async () => {
    sb.fetchCalls.length = 0;
    sb.setOnline(() => "heavy-v2-must-not-be-used");
    const { response } = sb.fireFetch(ORIGIN + "/assets/music/joyfully-loop.mp3");
    const res = await response;
    assert.equal(res.body, "heavy-v1", "phải trả bản cache");
    assert.equal(sb.fetchCalls.length, 0, "cache-first có hit thì không được fetch");
  });
  it("S8: chưa cache → fetch rồi lưu lại cho lần sau", async () => {
    sb.setOnline((url) => "NET:" + url);
    const url = ORIGIN + "/assets/music/pixel-sprinter-loop.mp3";
    const res = await sb.fireFetch(url).response;
    assert.ok(res.body.startsWith("NET:"), "phải fetch từ network khi cache miss");
    const stat = sb.store[versionOf() + "-static"];
    assert.ok(stat.get(url), "asset mới phải được lưu vào static cache");
  });
  it("S9: offline + chưa cache → không có gì để phục vụ (reject)", async () => {
    sb.setOffline();
    const url = ORIGIN + "/assets/music/dog-in-car.mp3";
    await assert.rejects(sb.fireFetch(url).response, "phải reject khi offline và cache miss");
  });
});

describe("sw.js — pass-through (không nuốt request đặc biệt)", () => {
  const sb = makeSandbox();
  it("S10: range request (audio seek) không bị SW chạm", () => {
    const { passThrough } = sb.fireFetch(ORIGIN + "/assets/music/x.mp3", { range: true });
    assert.equal(passThrough, true);
  });
  it("S11: /api/* không bị cache", () => {
    const { passThrough } = sb.fireFetch(ORIGIN + "/api/health");
    assert.equal(passThrough, true);
  });
  it("S12: cross-origin không bị chạm", () => {
    const { passThrough } = sb.fireFetch("https://cdn.example.com/lib.js");
    assert.equal(passThrough, true);
  });
  it("S13: method khác GET không bị chạm", () => {
    const { passThrough } = sb.fireFetch(ORIGIN + "/api/score", { method: "POST" });
    assert.equal(passThrough, true);
  });
});

describe("sw.js — update flow & lifecycle", () => {
  it("S14: message SKIP_WAITING (string + object) → skipWaiting", () => {
    const sb = makeSandbox();
    sb.fireMessage("SKIP_WAITING");
    sb.fireMessage({ type: "SKIP_WAITING" });
    assert.equal(sb.self.skipWaitingCalls, 2);
  });
  it("S15: install gọi skipWaiting, activate claim + xóa cache cũ", async () => {
    const sb = makeSandbox();
    sb.store["windowkill-v8-static"] = new Map([["x", 1]]);
    sb.store["windowkill-v8-html"] = new Map([["y", 2]]);
    sb.setOnline(() => "x");
    await sb.install();
    assert.ok(sb.self.skipWaitingCalls >= 1, "install phải skipWaiting");
    await sb.activate();
    assert.ok(sb.self.claimCalls >= 1, "activate phải clients.claim");
    const keys = Object.keys(sb.store);
    assert.ok(!keys.some((k) => k.startsWith("windowkill-v8")), "cache v8 cũ phải bị xóa");
    assert.ok(keys.includes(versionOf() + "-core") && keys.includes(versionOf() + "-static"),
      "giữ đúng 2 cache hiện tại");
  });
});
