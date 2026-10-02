"""WK audit harness — CDP driver with background event capture."""
import json, os, shutil, subprocess, sys, threading, time, urllib.request
import websocket

CHROME = "/opt/meta-chromium/chrome"
BASE = "http://127.0.0.1:8901"

KEYCODES = {
    "KeyW": ("w", 87), "KeyA": ("a", 65), "KeyS": ("s", 83), "KeyD": ("d", 68),
    "KeyP": ("p", 80), "KeyR": ("r", 82), "KeyM": ("m", 77),
    "Digit1": ("1", 49), "Digit2": ("2", 50), "Digit3": ("3", 51),
    "Space": (" ", 32), "Escape": ("Escape", 27),
}

class CDP:
    def __init__(self, ws_url, port):
        self.port = port
        self._id = 0
        self.events = []
        self._waiters = {}
        self._lock = threading.Lock()
        self.ws = websocket.create_connection(ws_url, timeout=30)
        self._reader = threading.Thread(target=self._read, daemon=True)
        self._reader.start()

    def _read(self):
        while True:
            try:
                msg = json.loads(self.ws.recv())
            except Exception:
                return
            if "id" in msg:
                with self._lock:
                    w = self._waiters.pop(msg["id"], None)
                if w is not None:
                    w.append(msg)
            else:
                self.events.append(msg)

    def call(self, method, params=None, timeout=30):
        with self._lock:
            self._id += 1
            mid = self._id
            box = []
            self._waiters[mid] = box
        self.ws.send(json.dumps({"id": mid, "method": method, "params": params or {}}))
        end = time.time() + timeout
        while time.time() < end:
            if box:
                m = box[0]
                if "error" in m:
                    raise RuntimeError(f"{method}: {m['error']}")
                return m.get("result", {})
            time.sleep(0.02)
        raise TimeoutError(method)

    def evaluate(self, expr, await_promise=False):
        r = self.call("Runtime.evaluate", {"expression": expr, "returnByValue": True,
                                            "awaitPromise": await_promise})
        if r.get("exceptionDetails"):
            raise RuntimeError(str(r["exceptionDetails"])[:400])
        res = r.get("result", r)
        return res.get("value") if isinstance(res, dict) else None

    def key(self, code, down=True):
        k, vk = KEYCODES[code]
        self.call("Input.dispatchKeyEvent", {
            "type": "keyDown" if down else "keyUp",
            "code": code, "key": k, "windowsVirtualKeyCode": vk, "autoRepeat": False})

    def click(self, x, y):
        self.call("Input.dispatchMouseEvent", {"type": "mousePressed", "x": x, "y": y, "button": "left", "clickCount": 1})
        self.call("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": x, "y": y, "button": "left", "clickCount": 1})

    def click_selector(self, sel):
        box = self.evaluate(
            f"(()=>{{const e=document.querySelector({json.dumps(sel)}); if(!e) return null;"
            f"e.scrollIntoView({{block:'center', inline:'center'}});"
            f"const r=e.getBoundingClientRect(); return {{x:r.x+r.width/2, y:r.y+r.height/2, w:r.width, h:r.height}};}})()")
        if not box:
            return False
        time.sleep(0.15)
        box = self.evaluate(
            f"(()=>{{const e=document.querySelector({json.dumps(sel)}); if(!e) return null;"
            f"const r=e.getBoundingClientRect(); return {{x:r.x+r.width/2, y:r.y+r.height/2}};}})()")
        if not box:
            return False
        self.click(box["x"], box["y"])
        return True

    def mouse_move(self, x, y):
        self.call("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": int(x), "y": int(y)})

    def errors(self):
        out = []
        for e in self.events:
            m = e.get("method")
            if m == "Runtime.exceptionThrown":
                d = e["params"]["exceptionDetails"]
                desc = (d.get("exception") or {}).get("description", "") or d.get("text", "")
                out.append({"type": "exception", "text": str(desc)[:400]})
            elif m == "Runtime.consoleAPICalled" and e["params"].get("type") == "error":
                args = [a.get("value", a.get("description", "")) for a in e["params"].get("args", [])]
                out.append({"type": "console.error", "text": str(args)[:400]})
            elif m == "Log.entryAdded":
                en = e["params"]["entry"]
                if en.get("level") == "error":
                    out.append({"type": "log.error", "text": (en.get("text", "") + " " + en.get("url", ""))[:400]})
        return out

    def enable_capture(self):
        self.call("Runtime.enable")
        self.call("Log.enable")
        self.call("Page.enable")

    def close(self):
        try:
            self.ws.close()
        except Exception:
            pass


def launch(port, w=1280, h=800, extra_flags=None, seed=None):
    """Launch chrome headless; returns (proc, cdp_of_first_page)."""
    udd = f"/tmp/wk_audit/profile-{port}"
    shutil.rmtree(udd, ignore_errors=True)
    flags = [CHROME, "--headless=new", "--no-sandbox", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
             "--proxy-server=http://127.0.0.1:8895", "--proxy-bypass-list=<-loopback>",
             "--remote-debugging-port={port}".format(port=port), "--remote-allow-origins=*", f"--user-data-dir={udd}",
             f"--window-size={w},{h}", "about:blank"]
    if extra_flags:
        flags[1:1] = extra_flags
    proc = subprocess.Popen(flags, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    ws_url = None
    for _ in range(60):
        try:
            tabs = json.load(urllib.request.urlopen(f"http://127.0.0.1:{port}/json", timeout=2))
            page = next((t for t in tabs if t.get("type") == "page"), None)
            if page:
                ws_url = page["webSocketDebuggerUrl"]
                break
        except Exception:
            pass
        time.sleep(0.5)
    if not ws_url:
        proc.kill()
        raise RuntimeError("chrome did not come up")
    try:
        cdp = CDP(ws_url, port)
    except Exception:
        proc.kill()
        raise
    cdp.enable_capture()
    if seed:
        cdp.call("Page.addScriptToEvaluateOnNewDocument", {"source": seed})
    return proc, cdp


def find_target(port, url_substr, timeout=10):
    end = time.time() + timeout
    while time.time() < end:
        try:
            tabs = json.load(urllib.request.urlopen(f"http://127.0.0.1:{port}/json", timeout=2))
            for t in tabs:
                if t.get("type") == "page" and url_substr in t.get("url", ""):
                    return t
        except Exception:
            pass
        time.sleep(0.5)
    return None


def navigate(cdp, url):
    cdp.call("Page.navigate", {"url": url})
    time.sleep(0.3)


def wait_for(cdp, expr, timeout=15, poll=0.4):
    end = time.time() + timeout
    while time.time() < end:
        try:
            if cdp.evaluate(expr):
                return True
        except Exception:
            pass
        time.sleep(poll)
    return False


def bot_play(cdp, seconds, w=1280, h=800, stop_on=None):
    """Orbit bot: circular movement + fire toward center."""
    import math
    held = set()
    t0 = time.time()
    notes = []
    while time.time() - t0 < seconds:
        t = time.time() - t0
        try:
            dom = cdp.evaluate(
                "({over: !!document.getElementById('ov-over')?.classList.contains('show'),"
                " draft: !!document.getElementById('ov-draft')?.classList.contains('show'),"
                " pause: !!document.getElementById('ov-pause')?.classList.contains('show')})")
        except Exception:
            dom = None
        if dom:
            if stop_on and dom.get(stop_on):
                notes.append(f"{stop_on} at {t:.0f}s")
                break
            if dom.get("over"):
                notes.append(f"gameover at {t:.0f}s")
                break
            if dom.get("pause"):
                cdp.key("KeyP", True); cdp.key("KeyP", False)
                time.sleep(0.3); continue
            if dom.get("draft"):
                for k in list(held):
                    cdp.key(k, False)
                held.clear()
                pick = ["Digit1", "Digit2", "Digit3"][int(t) % 3]
                cdp.key(pick, True); cdp.key(pick, False)
                notes.append(f"draft pick at {t:.0f}s")
                time.sleep(1.0); continue
        ang = (t * 1.1) % (2 * math.pi)
        octant = int(((ang + math.pi / 8) % (2 * math.pi)) / (math.pi / 4))
        keymap = [("KeyD",), ("KeyD", "KeyS"), ("KeyS",), ("KeyA", "KeyS"),
                  ("KeyA",), ("KeyA", "KeyW"), ("KeyW",), ("KeyD", "KeyW")]
        want = set(keymap[octant])
        cdp.mouse_move(w / 2 + 120 * math.cos(ang), h / 2 + 90 * math.sin(ang))
        for k in want - held:
            cdp.key(k, True)
        for k in held - want:
            cdp.key(k, False)
        held = want
        time.sleep(0.12)
    for k in list(held):
        try:
            cdp.key(k, False)
        except Exception:
            pass
    return notes


def save_result(name, data):
    path = f"/tmp/wk_audit/results/{name}.json"
    with open(path, "w") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    print(f"[saved] {path}")
