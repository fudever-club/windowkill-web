#!/usr/bin/env node
/*
 * capture-bot.js — CDP scripted player for WINDOWKILL gameplay capture.
 *
 * Connects to Chromium's remote-debugging port, verifies the game booted
 * (skips tutorial, never records a menu), then plays a "take":
 *   - holds fire, aims at the nearest enemy every 150ms
 *   - orbits the arena centre (WASD) so the ship keeps moving
 *   - auto-picks upgrade drafts (key 1), resumes pauses, restarts on death
 *     so the take stays full of action
 *
 * Usage: node capture-bot.js --port 9222 --duration 45 --width 1280 --height 720
 *        node capture-bot.js --port 9222 --measure-only   # print VIEWPORT line, exit
 */
"use strict";

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const m = process.argv[i].match(/^--([a-z-]+)(?:=(.+))?$/);
  if (!m) continue;
  let v = m[2];
  if (v === undefined && i + 1 < process.argv.length && !process.argv[i + 1].startsWith("--")) {
    v = process.argv[++i]; // space-separated value: --port 9222
  }
  args[m[1]] = v === undefined ? true : v;
}
const PORT = parseInt(args.port || "9222", 10);
const DURATION = parseFloat(args.duration || "45");
const VW = parseInt(args.width || "1280", 10);
const VH = parseInt(args.height || "720", 10);
const MEASURE_ONLY = !!args["measure-only"];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const VK = { KeyW: 87, KeyA: 65, KeyS: 83, KeyD: 68, Digit1: 49, Escape: 27, Space: 32 };
const KEYNAME = { KeyW: "w", KeyA: "a", KeyS: "s", KeyD: "d", Digit1: "1", Escape: "Escape", Space: " " };

async function main() {
  const listRes = await fetch(`http://127.0.0.1:${PORT}/json/list`);
  if (!listRes.ok) throw new Error(`CDP /json/list HTTP ${listRes.status}`);
  const targets = await listRes.json();
  const page = targets.find((t) => t.type === "page" && /game\.html/.test(t.url || ""));
  if (!page) throw new Error("no game.html page target found on CDP port " + PORT);

  const ws = new WebSocket(page.webSocketDebuggerUrl, { maxPayload: 256 * 1024 * 1024 });
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error("CDP ws error")); });

  let seq = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    let m; try { m = JSON.parse(ev.data); } catch { return; }
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id); pending.delete(m.id);
      if (m.error) p.rej(new Error("CDP " + m.error.message));
      else p.res(m.result);
    }
  };
  const send = (method, params = {}) => new Promise((res, rej) => {
    const id = ++seq; pending.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error("CDP timeout: " + method)); } }, 20000);
  });
  const evaluate = async (expr) => {
    const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true });
    return r && r.result ? r.result.value : undefined;
  };
  const keyEvent = (type, code) => send("Input.dispatchKeyEvent", {
    type, code, key: KEYNAME[code] || code, windowsVirtualKeyCode: VK[code] || 0,
  });
  const keyPress = async (code) => { await keyEvent("rawKeyDown", code); await keyEvent("keyUp", code); };
  const mouseMove = (x, y) => send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  const mouseDown = (x, y) => send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  const mouseUp = (x, y) => send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });

  // ---- 1. wait for the game to be in "play" phase (never record a menu) ----
  console.error("[bot] waiting for game boot...");
  const bootT0 = Date.now();
  let phase = null;
  while (Date.now() - bootT0 < 60000) {
    phase = await evaluate(`(function(){ try {
      if (document.readyState !== "complete") return "loading";
      if (typeof G === "undefined") return "nogame";
      return G.phase;
    } catch (e) { return "err"; } })()`).catch(() => "err");
    if (phase === "play") break;
    await sleep(500);
  }
  if (phase !== "play") throw new Error("game did not reach play phase (last=" + phase + ")");
  // skip tutorial overlay if it is showing (first-run profiles)
  await evaluate(`(function(){ try { if (window.Tutorial && Tutorial.isActive()) Tutorial.skip(); } catch (e) {} return 1; })()`);
  await sleep(800);

  const dims = await evaluate(`({ w: window.innerWidth, h: window.innerHeight,
    ow: window.outerWidth, oh: window.outerHeight,
    sx: window.screenX, sy: window.screenY })`);
  const CX = (dims && dims.w) || VW, CY = (dims && dims.h) || VH;
  console.error(`[bot] play phase confirmed, viewport ${CX}x${CY}`);
  // viewport geometry for the orchestrator (crop offset + size compensation)
  console.log(`VIEWPORT ${dims.w} ${dims.h} ${dims.ow} ${dims.oh} ${dims.sx} ${dims.sy}`);
  if (MEASURE_ONLY) { ws.close(); process.exit(0); }

  // signal the orchestrator (capture-gameplay.sh) that the take can start;
  // optionally wait for its GO so ffmpeg and the take begin together.
  console.log("READY");
  if (args["wait-go"]) {
    await new Promise((res) => {
      const onData = (d) => {
        if (/GO/.test(d.toString())) {
          process.stdin.off("data", onData);
          try { process.stdin.pause(); process.stdin.destroy(); } catch (e) {}
          res();
        }
      };
      process.stdin.on("data", onData);
    });
    console.error("[bot] GO received");
  }

  // ---- 2. hold fire from the centre ----
  await mouseMove(CX / 2, CY / 2);
  await mouseDown(CX / 2, CY / 2);

  const held = new Set();
  const setMove = async (dx, dy) => {
    const want = new Set();
    if (dy < -0.25) want.add("KeyW");
    if (dy > 0.25) want.add("KeyS");
    if (dx < -0.25) want.add("KeyA");
    if (dx > 0.25) want.add("KeyD");
    for (const k of held) if (!want.has(k)) { await keyEvent("keyUp", k); held.delete(k); }
    for (const k of want) if (!held.has(k)) { await keyEvent("rawKeyDown", k); held.add(k); }
  };

  // ---- 3. the take ----
  const endAt = Date.now() + DURATION * 1000;
  let lastMove = 0, lastLog = 0, shots = 0;
  console.error(`[bot] take started (${DURATION}s)`);
  while (Date.now() < endAt) {
    const st = await evaluate(`(function(){ try {
      if (typeof G === "undefined") return null;
      var s = G.ship, best = null, bd = 1e18;
      for (var i = 0; i < G.enemies.length; i++) {
        var e = G.enemies[i]; if (e.dead) continue;
        var d = (e.x - s.x) * (e.x - s.x) + (e.y - s.y) * (e.y - s.y);
        if (d < bd) { bd = d; best = e; }
      }
      return { phase: G.phase, wave: G.wave, kills: G.kills,
               sx: s.x, sy: s.y,
               ex: best ? best.x : null, ey: best ? best.y : null };
    } catch (e) { return null; } })()`).catch(() => null);
    if (!st) { await sleep(300); continue; }

    if (st.phase === "draft") { await keyPress("Digit1"); await sleep(400); continue; }
    if (st.phase === "paused") { await keyPress("Escape"); await sleep(400); continue; }
    if (st.phase === "over") {
      // hero death never goes in a take: restart so footage stays alive
      await evaluate(`(function(){ try { resetGame(); } catch (e) {} return 1; })()`);
      console.error("[bot] died -> restarted run");
      await sleep(800); continue;
    }
    if (st.phase !== "play") { await sleep(300); continue; }

    // aim at nearest enemy (fire is held down the whole take)
    if (st.ex !== null && st.ex !== undefined) {
      await mouseMove(Math.max(1, Math.min(CX - 1, st.ex)), Math.max(1, Math.min(CY - 1, st.ey)));
      shots++;
    }
    // orbit the arena centre: tangent direction, refreshed ~1.3x/sec
    const now = Date.now();
    if (now - lastMove > 750) {
      lastMove = now;
      const ang = Math.atan2(st.sy - CY / 2, st.sx - CX / 2) + Math.PI / 2;
      await setMove(Math.cos(ang), Math.sin(ang));
    }
    if (now - lastLog > 5000) {
      lastLog = now;
      console.error(`[bot] wave=${st.wave} kills=${st.kills} t=${Math.round((now - (endAt - DURATION * 1000)) / 1000)}s`);
    }
    await sleep(120);
  }

  for (const k of [...held]) await keyEvent("keyUp", k);
  await mouseUp(CX / 2, CY / 2);
  try { ws.close(); } catch (e) {}
  await sleep(300);
  console.error(`[bot] take finished, aimed shots=${shots}`);
  process.exit(0); // never linger: the orchestrator waits on this process
}

main().catch((e) => { console.error("[bot] FATAL: " + (e && e.stack || e)); process.exit(1); });
