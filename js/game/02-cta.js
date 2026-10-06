/* ---------------- CTA web→desktop (Sprint R2 item 5) ----------------
   Thân thiện, không dark pattern: chỉ hiện trên web thường —
   KHÔNG portalMode (đang ở itch.io rồi), KHÔNG Electron (đã là desktop). */
const DESKTOP_CTA_URL = "https://quangnhat1504.itch.io/windowkill?utm_source=game&utm_medium=cta&utm_campaign=desktop";
const DESKTOP_CTA_UTM = "utm_source=game&utm_medium=cta&utm_campaign=desktop";
function ctaSuppressed() {
  try { if (window.WK_PORTAL_MODE === true) return true; } catch (e) {}
  try { if (qp.get("portal") === "1") return true; } catch (e) {}
  return IS_ELECTRON_APP;
}
function trackCtaClick(cta_id) {
  try {
    if (window.WKAnalytics && typeof window.WKAnalytics.track === "function") {
      window.WKAnalytics.track("cta_click", { cta_id: cta_id, utm: DESKTOP_CTA_UTM });
    }
  } catch (e) {}
}
/* Toast sau wave 10: 1 lần/run, góc dưới phải, tự tắt sau 6s, có nút đóng. */
function showDesktopToast() {
  try {
    if (document.getElementById("wk-desktop-toast")) return;
    const el = document.createElement("div");
    el.id = "wk-desktop-toast";
    el.setAttribute("role", "status");
    const ico = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    ico.setAttribute("class", "ic"); ico.setAttribute("aria-hidden", "true");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", "#i-window");
    ico.appendChild(use);
    const a = document.createElement("a");
    a.href = DESKTOP_CTA_URL; a.target = "_blank"; a.rel = "noopener";
    a.dataset.ctaId = "wave10_toast";
    a.textContent = (window.I18N ? I18N.t("cta.toast_text") : "Desktop build: real windows!") + " →";
    const x = document.createElement("button");
    x.className = "toast-x"; x.type = "button";
    x.setAttribute("aria-label", window.I18N ? I18N.t("menu.hub.close") : "Close");
    x.textContent = "×";
    const dismiss = () => { try { el.remove(); } catch (e) {} };
    x.addEventListener("click", dismiss);
    el.appendChild(ico); el.appendChild(a); el.appendChild(x);
    document.body.appendChild(el);
    setTimeout(dismiss, 6000);
  } catch (e) {}
}

// WOW: vẽ boss cho Cinema bossIntro/bossDeath — chữ ký (ctx, x, y, scale, alpha)
function drawBossShape(c, x, y, s, a, color) {
  const col = color || "#8b2fc9";
  const t = performance.now() / 1000;
  c.save();
  c.translate(x, y); c.scale(s || 1, s || 1); c.globalAlpha = (a == null ? 1 : a);
  c.rotate(Math.sin(t * 0.8) * 0.12);
  // MOBILE-QUALITY: shadowBlur đắt → scale theo nấc (lite tắt hẳn).
  var _bossSh = wkShadowScale();
  if (_bossSh > 0) { c.shadowColor = col; c.shadowBlur = Math.round(26 * _bossSh); }
  c.fillStyle = col;
  c.fillRect(-34, -34, 68, 68);
  c.shadowBlur = 0;
  c.strokeStyle = "#fff"; c.lineWidth = 3;
  c.strokeRect(-34, -34, 68, 68);
  c.fillStyle = "rgba(255,255,255,.16)";
  c.fillRect(-22, -22, 44, 44);
  c.fillStyle = "#fff";
  c.beginPath(); c.arc(0, 0, 9 + Math.sin(t * 6) * 2, 0, Math.PI * 2); c.fill();
  c.restore();
}
