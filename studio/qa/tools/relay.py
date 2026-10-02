"""Mini forward-proxy for audit: Chrome sends even loopback targets here
(--proxy-bypass-list='<-loopback>'); we fetch directly (Python loopback OK)
and relay the response. Only allows http://127.0.0.1:8901 targets."""
import socket, threading, urllib.request, urllib.error

LISTEN = ("127.0.0.1", 8895)
ALLOWED_PREFIX = "http://127.0.0.1:8901/"

def handle(conn):
    try:
        conn.settimeout(15)
        data = b""
        while b"\r\n\r\n" not in data:
            chunk = conn.recv(65536)
            if not chunk:
                conn.close(); return
            data += chunk
        head, _, rest = data.partition(b"\r\n\r\n")
        lines = head.decode("latin1").split("\r\n")
        method, target, _ver = lines[0].split(" ", 2)
        headers = {}
        for ln in lines[1:]:
            if ": " in ln:
                k, v = ln.split(": ", 1)
                headers[k] = v
        if not (target.startswith(ALLOWED_PREFIX) or target == "http://127.0.0.1:8901"):
            body = b"proxy: target not allowed"
            conn.sendall(b"HTTP/1.1 403 Forbidden\r\nContent-Length: " + str(len(body)).encode() + b"\r\n\r\n" + body)
            conn.close(); return
        body_in = rest
        clen = int(headers.get("Content-Length", "0") or "0")
        while len(body_in) < clen:
            chunk = conn.recv(65536)
            if not chunk: break
            body_in += chunk
        req = urllib.request.Request(target, data=body_in[:clen] if clen else None, method=method)
        for k in ("Accept", "Accept-Language", "Content-Type", "Range", "User-Agent"):
            if k in headers:
                req.add_header(k, headers[k])
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                payload = resp.read()
                status = resp.status
                ctype = resp.headers.get("Content-Type", "application/octet-stream")
        except urllib.error.HTTPError as e:
            payload = e.read(); status = e.code
            ctype = e.headers.get("Content-Type", "text/html") if e.headers else "text/html"
        out = (f"HTTP/1.1 {status} OK\r\nContent-Type: {ctype}\r\n"
               f"Content-Length: {len(payload)}\r\nCache-Control: no-store\r\n"
               f"Connection: close\r\n\r\n").encode("latin1") + payload
        conn.sendall(out)
    except Exception:
        pass
    finally:
        try: conn.close()
        except Exception: pass

srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
srv.bind(LISTEN)
srv.listen(64)
print(f"relay on {LISTEN}", flush=True)
while True:
    c, _ = srv.accept()
    threading.Thread(target=handle, args=(c,), daemon=True).start()
