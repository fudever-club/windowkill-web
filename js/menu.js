/* WINDOWKILL: Web Edition — launcher logic (Dever theme + user profiles) */
"use strict";
(() => {
  const $ = (id) => document.getElementById(id);
  const bus = ("BroadcastChannel" in window) ? new BroadcastChannel("windowkill_bus") : null;

  /* ---------- privacy-friendly analytics bootstrap ----------
     js/analytics.js is loaded via <script defer> in <head>; events fired
     before it finishes loading wait in __wk_analytics_prequeue and are
     drained by analytics.js on init. */
  window.__wk_analytics_prequeue = window.__wk_analytics_prequeue || [];
  const Analytics = {
    track(type, data, opts) {
      try {
        if (window.WKAnalytics && window.WKAnalytics.ready) window.WKAnalytics.track(type, data, opts);
        else window.__wk_analytics_prequeue.push({ type, data, opts });
      } catch {}
    },
    setProfile(id) {
      try { if (window.WKAnalytics && window.WKAnalytics.ready) window.WKAnalytics.setProfile(id); } catch {}
    },
  };

  /* Ẩn ảnh bị lỗi tải (thay cho inline onerror — tương thích CSP script-src 'self') */
  document.querySelectorAll("img[data-hide-onerror]").forEach(img => {
    img.addEventListener("error", () => { img.style.display = "none"; });
  });

  /* ---------- user profiles ---------- */
  const AVATARS = ["i-avatar-1","i-avatar-2","i-avatar-3","i-avatar-4","i-avatar-5","i-avatar-6","i-avatar-7","i-avatar-8"];
  const avatarOf = (p, i) => p.avatar || AVATARS[i % AVATARS.length];
  const svgIcon = (id, cls) => `<svg class="${cls || "ic"}" aria-hidden="true"><use href="#${id}"/></svg>`;
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  /* SECURITY: ép mọi giá trị số từ BroadcastChannel/localStorage thành number
     thật — tránh XSS qua innerHTML khi kẻ tấn công gửi chuỗi HTML giả dạng score. */
  const num = (v, dflt = 0) => { const n = Number(v); return Number.isFinite(n) ? n : dflt; };
  const int0 = (v) => Math.max(0, Math.floor(num(v)));
  let profiles = store.get("wk_profiles", []);
  let activeId = store.get("wk_active_profile", null);
  const active = () => profiles.find(p => p.id === activeId) || null;
  const pkey = (base) => { const p = active(); return p ? `${base}_${p.id}` : base; };

  function saveProfiles() { store.set("wk_profiles", profiles); store.set("wk_active_profile", activeId); }

  const escapeHtml = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ---------- optional backend mirror (graceful offline) ----------
     Backend is strictly optional: every call is fire-and-forget and every
     render falls back to localStorage when the backend is unreachable. */
  const Backend = {
    online: false,
    init() {
      if (!window.WKApi) return;
      WKApi.isOnline().then(on => {
        this.online = !!on;
        const badge = $("backend-badge");
        if (badge) badge.innerHTML = on ? svgIcon("i-globe") + " Online" : svgIcon("i-close") + " Offline";
        if (on) renderScores(); // refresh once to include the online leaderboard
      }).catch(() => { this.online = false; });
    },
    fire(p) { if (p && p.catch) p.catch(() => {}); },
    syncCreate(p) { if (this.online && window.WKApi) this.fire(WKApi.createProfile({ id: p.id, name: p.name, avatar: p.avatar })); },
    syncDelete(id) { if (this.online && window.WKApi) this.fire(WKApi.deleteProfile(id)); },
    syncScore(m) {
      if (!this.online || !window.WKApi) return;
      this.fire(WKApi.submitScore({
        profileId: m.profileId, score: m.score | 0, wave: m.wave | 0,
        kills: m.kills | 0, durationMs: Math.round((m.timeSec || 0) * 1000), difficulty: m.diff,
      }));
    },
  };

  function renderProfiles() {
    const bar = $("profile-bar"); bar.innerHTML = "";
    profiles.forEach((p, i) => {
      if (!p.avatar) { p.avatar = AVATARS[i % AVATARS.length]; }
      const chip = document.createElement("button");
      chip.className = "pchip" + (p.id === activeId ? " on" : "");
      chip.innerHTML = `<svg class="av" aria-hidden="true"><use href="#${avatarOf(p, i)}"/></svg><span></span>`;
      const nameSpan = chip.querySelector("span");
      if (nameSpan) nameSpan.textContent = p.name; // guard: markup đổi vẫn không crash
      chip.title = "Chơi với tài khoản này";
      chip.onclick = () => { activeId = p.id; saveProfiles(); Analytics.setProfile(p.id); renderAll(); };
      const del = document.createElement("span");
      del.className = "x"; del.innerHTML = svgIcon("i-close"); del.title = "Xóa tài khoản";
      del.onclick = (e) => {
        e.stopPropagation();
        if (!confirm(`Xóa tài khoản "${p.name}" và toàn bộ kỷ lục của tài khoản này?`)) return;
        ["wk_high_chill","wk_high_normal","wk_high_hard","wk_stats"].forEach(b => { try { localStorage.removeItem(`${b}_${p.id}`); } catch {} });
        Backend.syncDelete(p.id);
        profiles = profiles.filter(q => q.id !== p.id);
        if (activeId === p.id) activeId = profiles.length ? profiles[0].id : null;
        saveProfiles(); renderAll();
      };
      chip.appendChild(del);
      bar.appendChild(chip);
    });
    const add = document.createElement("button");
    add.className = "pchip"; add.innerHTML = svgIcon("i-plus") + "<span>Tài khoản mới</span>";
    add.onclick = () => { const b = $("new-profile-box"); b.style.display = b.style.display === "flex" ? "none" : "flex"; $("new-profile-name").focus(); };
    bar.appendChild(add);
    const who = active() ? ` — ${active().name}` : "";
    $("hs-who").textContent = who; $("st-who").textContent = who;
  }

  function createProfile() {
    const name = $("new-profile-name").value.trim().slice(0, 16);
    if (!name) { $("new-profile-name").focus(); return; }
    const p = { id: "p" + Date.now().toString(36), name, avatar: AVATARS[profiles.length % AVATARS.length], createdAt: Date.now() };
    profiles.push(p); activeId = p.id; saveProfiles(); Backend.syncCreate(p);
    $("new-profile-name").value = ""; $("new-profile-box").style.display = "none";
    renderAll();
  }
  $("btn-create-profile").onclick = createProfile;
  $("new-profile-name").addEventListener("keydown", e => { if (e.key === "Enter") createProfile(); });

  /* ---------- settings ---------- */
  const settings = Object.assign({ music: true, sfx: true, shake: true, diff: "normal", fx: "full", sat: "auto", analytics: true }, store.get("wk_settings", {}));
  const saveSettings = () => store.set("wk_settings", settings);
  function paintToggles() {
    $("tgl-music").classList.toggle("on", settings.music);
    $("tgl-sfx").classList.toggle("on", settings.sfx);
    $("tgl-shake").classList.toggle("on", settings.shake);
    const ta = $("tgl-analytics");
    if (ta) ta.classList.toggle("on", settings.analytics);
    document.querySelectorAll(".diff-btns .btn-ghost").forEach(b => b.classList.toggle("sel", b.dataset.diff === settings.diff));
    document.querySelectorAll("[data-fx]").forEach(b => b.classList.toggle("sel", b.dataset.fx === settings.fx));
  }
  document.querySelectorAll("[data-fx]").forEach(b => b.onclick = () => {
    settings.fx = b.dataset.fx; saveSettings(); paintToggles();
  });
  document.querySelectorAll("[data-sat]").forEach(b => b.classList.toggle("sel", b.dataset.sat === settings.sat));
  document.querySelectorAll("[data-sat]").forEach(b => b.onclick = () => {
    settings.sat = b.dataset.sat; saveSettings();
    document.querySelectorAll("[data-sat]").forEach(x => x.classList.toggle("sel", x === b));
  });
  /* Analytics opt-out toggle — injected via DOM because index.html is frozen.
     Reuses the existing .setrow/.tgl styles. */
  function injectAnalyticsToggle() {
    if ($("tgl-analytics")) return;
    const anchor = $("tgl-shake");
    if (!anchor || !anchor.parentElement || !anchor.parentElement.parentElement) return;
    const row = document.createElement("div");
    row.className = "setrow";
    const label = document.createElement("span");
    label.innerHTML = svgIcon("i-chart") + " ";
    label.appendChild(document.createTextNode("Thống kê ẩn danh (không cookie)"));
    const btn = document.createElement("button");
    btn.className = "tgl" + (settings.analytics ? " on" : "");
    btn.id = "tgl-analytics";
    btn.setAttribute("aria-label", "Bật/tắt thống kê ẩn danh");
    btn.title = "Gửi thống kê ẩn danh giúp cải thiện game. Không cookie, không định danh, tôn trọng Do-Not-Track.";
    btn.onclick = () => {
      settings.analytics = !settings.analytics; saveSettings();
      btn.classList.toggle("on", settings.analytics);
      try {
        if (window.WKAnalytics && window.WKAnalytics.ready) window.WKAnalytics.setEnabled(settings.analytics);
      } catch {}
      // force:true => this one event is sent even when the user just opted out
      Analytics.track("settings_changed", { key: "analytics", value: settings.analytics }, { force: true });
    };
    row.appendChild(label); row.appendChild(btn);
    anchor.parentElement.insertAdjacentElement("afterend", row);
  }
  injectAnalyticsToggle();
  $("tgl-music").onclick = (e) => { settings.music = !settings.music; saveSettings(); paintToggles(); WKAudio.setMusic(settings.music); Analytics.track("settings_changed", { key: "music", value: settings.music }); };
  $("tgl-sfx").onclick = () => { settings.sfx = !settings.sfx; saveSettings(); paintToggles(); WKAudio.setSfx(settings.sfx); Analytics.track("settings_changed", { key: "sfx", value: settings.sfx }); };
  $("tgl-shake").onclick = () => { settings.shake = !settings.shake; saveSettings(); paintToggles(); Analytics.track("settings_changed", { key: "shake", value: settings.shake }); };
  document.querySelectorAll(".diff-btns .btn-ghost").forEach(b => b.onclick = () => { settings.diff = b.dataset.diff; saveSettings(); paintToggles(); renderScores(); Analytics.track("settings_changed", { key: "diff", value: settings.diff }); });
  WKAudio.setMusic(settings.music); WKAudio.setSfx(settings.sfx);

  /* ---------- high scores & stats (per profile) ---------- */
  const DIFF_LABEL = {
    chill: `${svgIcon("i-smile")} Chill`,
    normal: `${svgIcon("i-meh")} Thường`,
    hard: `${svgIcon("i-skull")} Khắc nghiệt`,
  };
  let lbToken = 0; // guards against out-of-order leaderboard responses
  function renderScores() {
    const el = $("hs-list");
    const rows = ["chill", "normal", "hard"].map(d => {
      const h = store.get(pkey("wk_high_" + d), null);
      const txt = h ? `<span class="hs-num" data-v="${num(h.score)}" style="color:#fde68a">${num(h.score).toLocaleString("vi-VN")}</span> điểm · wave ${int0(h.wave)}` : "—";
      return `<div>${svgIcon("i-gauge")} ${DIFF_LABEL[d]}: <b>${txt}</b></div>`;
    }).join("");
    el.innerHTML = active() ? rows : "Hãy tạo tài khoản để lưu kỷ lục!";
    if (Backend.online && active() && window.WKApi) {
      const t = ++lbToken;
      const box = document.createElement("div");
      box.style.marginTop = "10px";
      box.innerHTML = `<div style="font-size:12.5px;color:#5f7ba3">${svgIcon("i-globe")} Đang tải bảng xếp hạng online…</div>`;
      el.appendChild(box);
      WKApi.leaderboard(settings.diff, 5).then(lb => {
        if (t !== lbToken || !lb) { box.remove(); return; }
        if (!lb.length) { box.innerHTML = `<div style="font-size:12.5px;color:#5f7ba3">${svgIcon("i-globe")} Chưa có điểm online cho độ khó này.</div>`; return; }
        box.innerHTML = `<div style="font-size:12.5px;color:#5f7ba3;margin-bottom:4px">${svgIcon("i-globe")} Bảng xếp hạng online — ${DIFF_LABEL[settings.diff]}</div>` +
          lb.map((r, i) => `<div><span class="rank r${i + 1}">${i + 1}</span> ${escapeHtml(r.profileName)} — <b style="color:#fde68a">${num(r.score).toLocaleString("vi-VN")}</b> <span style="color:#5f7ba3">· wave ${int0(r.wave)}</span></div>`).join("");
      }).catch(() => box.remove());
    }
  }
  function renderStats() {
    const raw = store.get(pkey("wk_stats"), { games: 0, kills: 0, bestWave: 0, totalScore: 0, timeSec: 0 });
    const s = { games: int0(raw.games), kills: int0(raw.kills), bestWave: int0(raw.bestWave), totalScore: num(raw.totalScore), timeSec: int0(raw.timeSec) };
    const mins = Math.floor(s.timeSec / 60);
    $("stat-list").innerHTML =
      `${svgIcon("i-gamepad")} Số trận: <b>${s.games}</b> &nbsp;•&nbsp; ${svgIcon("i-skull")} Quái hạ: <b>${s.kills.toLocaleString("vi-VN")}</b><br>` +
      `${svgIcon("i-wave")} Wave cao nhất: <b>${s.bestWave}</b> &nbsp;•&nbsp; ${svgIcon("i-gem")} Tổng điểm: <b>${s.totalScore.toLocaleString("vi-VN")}</b><br>` +
      `${svgIcon("i-clock")} Tổng thời gian: <b>${mins} phút</b>`;
  }
  function renderAll() { renderProfiles(); renderScores(); renderStats(); }

  /* ---------- game over reports from popup ---------- */
  if (bus) bus.onmessage = (ev) => {
    const m = ev.data || {};
    if (m.type === "gameover" && m.profileId) {
      const prof = profiles.find(p => p.id === m.profileId);
      if (!prof) return;
      const score = num(m.score), wave = int0(m.wave), kills = int0(m.kills), timeSec = int0(m.timeSec);
      const hk = `wk_high_${m.diff}_${m.profileId}`;
      const prev = store.get(hk, null);
      if (!prev || score > num(prev.score)) store.set(hk, { score, wave });
      const sk = `wk_stats_${m.profileId}`;
      const s = store.get(sk, { games: 0, kills: 0, bestWave: 0, totalScore: 0, timeSec: 0 });
      s.games = int0(s.games) + 1; s.kills = int0(s.kills) + kills; s.totalScore = num(s.totalScore) + score;
      s.bestWave = Math.max(int0(s.bestWave), wave); s.timeSec = int0(s.timeSec) + timeSec;
      store.set(sk, s);
      Backend.syncScore({ profileId: m.profileId, score, wave, kills, timeSec, diff: m.diff }); // mirror to optional backend
      if (m.profileId === activeId) { renderScores(); renderStats(); }
    }
  };

  /* ---------- launch game ---------- */
  function ensureProfile() {
    if (!active()) {
      const box = $("new-profile-box");
      box.style.display = "flex";
      $("new-profile-name").focus();
      $("new-profile-name").placeholder = "Nhập tên để tạo tài khoản rồi bấm CHƠI NGAY";
      return false;
    }
    return true;
  }
  $("btn-play").onclick = () => {
    if (!ensureProfile()) return;
    WKAudio.ensure();
    const p = active();
    if (p) { Analytics.setProfile(p.id); Analytics.track("game_start", { difficulty: settings.diff }); }
    const q = new URLSearchParams({
      diff: settings.diff, music: settings.music ? 1 : 0, sfx: settings.sfx ? 1 : 0,
      shake: settings.shake ? 1 : 0, fx: settings.fx === "reduced" ? "reduced" : "full",
      sat: ["auto", "sim", "off"].includes(settings.sat) ? settings.sat : "auto", profile: activeId,
    }).toString();
    const w = window.open("game.html?" + q, "windowkill_arena", "width=980,height=700,left=120,top=60,menubar=no,toolbar=no,location=no,status=no,resizable=yes");
    if (!w) $("popup-warn").style.display = "block";
    else { $("popup-warn").style.display = "none"; w.focus(); }
  };

  /* init: migrate legacy global scores to first profile if any */
  if (!profiles.length) {
    const legacy = ["wk_high_chill", "wk_high_normal", "wk_high_hard"].some(k => { try { return localStorage.getItem(k) != null; } catch { return false; } });
    if (legacy) {
      const p = { id: "p" + Date.now().toString(36), name: "Player 1", avatar: "i-avatar-1", createdAt: Date.now() };
      profiles.push(p); activeId = p.id; saveProfiles();
    }
  }
  /* WOW: micro-interactions — Cinema.pressFx / countUp / slidePanel + ui sfx.
     Tất cả đều guard: không có Cinema/AudioEngine thì menu chạy như cũ. */
  (function wowUI() {
    try {
      if (window.Cinema) {
        document.querySelectorAll(".panel").forEach(p => { try { Cinema.slidePanel(p); } catch (e) {} });
      }
      const BTN = ".btn-big,.btn-ghost,.pchip,.tgl";
      // press FX qua delegation (bao phủ cả nút tạo động như profile chips)
      document.addEventListener("pointerdown", (ev) => {
        const b = ev.target && ev.target.closest ? ev.target.closest(BTN) : null;
        if (b && window.Cinema) { try { Cinema.pressFx(b); } catch (e) {} }
      });
      // click / hover sfx
      document.addEventListener("click", (ev) => {
        const b = ev.target && ev.target.closest ? ev.target.closest(BTN) : null;
        if (b && window.AudioEngine && AudioEngine.sfx && AudioEngine.sfx.ui_click) {
          try { AudioEngine.sfx.ui_click(); } catch (e) {}
        }
      });
      let lastHover = null;
      document.addEventListener("mouseover", (ev) => {
        const b = ev.target && ev.target.closest ? ev.target.closest(BTN) : null;
        if (b && b !== lastHover) {
          lastHover = b;
          if (window.AudioEngine && AudioEngine.sfx && AudioEngine.sfx.ui_hover) {
            try { AudioEngine.sfx.ui_hover(); } catch (e) {}
          }
        }
      });
    } catch (e) {}
    // countUp cho điểm kỷ lục sau mỗi lần renderScores
    try {
      const _renderScores = renderScores;
      renderScores = function () {
        _renderScores();
        if (!window.Cinema) return;
        try {
          document.querySelectorAll("#hs-list .hs-num").forEach(el => {
            const v = parseFloat(el.dataset.v || "0") || 0;
            Cinema.countUp(el, v, { format: (x) => Math.round(x).toLocaleString("vi-VN") });
          });
        } catch (e) {}
      };
    } catch (e) {}
  })();
  paintToggles(); renderAll(); Backend.init();
  if (activeId) Analytics.setProfile(activeId); // warm the sha256 profile hash for analytics
})();
