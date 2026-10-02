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
        if (badge) badge.innerHTML = on ? svgIcon("i-globe") + " " + I18N.t("common.online") : svgIcon("i-close") + " " + I18N.t("common.offline");
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
      chip.title = I18N.t("menu.profile.play_as");
      chip.onclick = () => { activeId = p.id; saveProfiles(); Analytics.setProfile(p.id); renderAll(); };
      const del = document.createElement("span");
      del.className = "x"; del.innerHTML = svgIcon("i-close"); del.title = I18N.t("menu.profile.delete");
      del.onclick = (e) => {
        e.stopPropagation();
        if (!confirm(I18N.t("menu.profile.delete_confirm", { name: p.name }))) return;
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
    add.className = "pchip"; add.innerHTML = svgIcon("i-plus") + "<span>" + I18N.t("menu.profile.new") + "</span>";
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
  const settings = Object.assign({ music: true, sfx: true, shake: true, haptic: true, diff: "normal", fx: "full", sat: "auto", analytics: true }, store.get("wk_settings", {}));
  if (!["chill", "normal", "hard"].includes(settings.diff)) settings.diff = "normal"; // repair corrupted diff
  const saveSettings = () => store.set("wk_settings", settings);
  function paintToggles() {
    $("tgl-music").classList.toggle("on", settings.music);
    $("tgl-sfx").classList.toggle("on", settings.sfx);
    $("tgl-shake").classList.toggle("on", settings.shake);
    const th = $("tgl-haptic");
    if (th) th.classList.toggle("on", settings.haptic);
    const ta = $("tgl-analytics");
    if (ta) ta.classList.toggle("on", settings.analytics);
    document.querySelectorAll("[data-diff]").forEach(b => b.classList.toggle("sel", b.dataset.diff === settings.diff));
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
    label.appendChild(document.createTextNode(I18N.t("settings.analytics")));
    const btn = document.createElement("button");
    btn.className = "tgl" + (settings.analytics ? " on" : "");
    btn.id = "tgl-analytics";
    btn.setAttribute("aria-label", I18N.t("settings.analytics_aria"));
    btn.title = I18N.t("settings.analytics_title");
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
  $("tgl-music").onclick = (e) => { settings.music = !settings.music; saveSettings(); paintToggles(); if (window.BGM) BGM.setEnabled(settings.music); if (window.WKAudio) WKAudio.setMusic(settings.music); Analytics.track("settings_changed", { key: "music", value: settings.music }); };
  $("tgl-sfx").onclick = () => { settings.sfx = !settings.sfx; saveSettings(); paintToggles(); if (window.WKAudio) WKAudio.setSfx(settings.sfx); Analytics.track("settings_changed", { key: "sfx", value: settings.sfx }); };
  $("tgl-shake").onclick = () => { settings.shake = !settings.shake; saveSettings(); paintToggles(); Analytics.track("settings_changed", { key: "shake", value: settings.shake }); };
  const thBtn = $("tgl-haptic");
  if (thBtn) thBtn.onclick = () => { settings.haptic = !settings.haptic; saveSettings(); paintToggles(); Analytics.track("settings_changed", { key: "haptic", value: settings.haptic }); };
  document.querySelectorAll("[data-diff]").forEach(b => b.onclick = () => { settings.diff = b.dataset.diff; saveSettings(); paintToggles(); renderScores(); Analytics.track("settings_changed", { key: "diff", value: settings.diff }); });
  if (window.WKAudio) { WKAudio.setMusic(settings.music); WKAudio.setSfx(settings.sfx); }
  if (window.BGM) { try { BGM.init(); BGM.setEnabled(settings.music); } catch (e) {} } // BGM: nhạc nền file thật

  /* ---------- high scores & stats (per profile) ---------- */
  const DIFF_LABEL = {
    chill: `${svgIcon("i-smile")} ${I18N.t("menu.diff.chill")}`,
    normal: `${svgIcon("i-meh")} ${I18N.t("menu.diff.normal")}`,
    hard: `${svgIcon("i-skull")} ${I18N.t("menu.diff.hard")}`,
  };
  let lbToken = 0; // guards against out-of-order leaderboard responses
  function renderScores() {
    const el = $("hs-list");
    const rows = ["chill", "normal", "hard"].map(d => {
      const h = store.get(pkey("wk_high_" + d), null);
      const txt = h ? I18N.t("menu.scores.line", { score: `<span class="hs-num" data-v="${num(h.score)}" style="color:#fde68a">${I18N.fmtNum(num(h.score))}</span>`, wave: int0(h.wave) }) : "—";
      return `<div>${svgIcon("i-gauge")} ${DIFF_LABEL[d]}: <b>${txt}</b></div>`;
    }).join("");
    el.innerHTML = active() ? rows : I18N.t("menu.scores.no_profile");
    if (Backend.online && active() && window.WKApi) {
      const t = ++lbToken;
      const box = document.createElement("div");
      box.style.marginTop = "10px";
      box.innerHTML = `<div style="font-size:12.5px;color:#5f7ba3">${svgIcon("i-globe")} ${I18N.t("menu.scores.loading")}</div>`;
      el.appendChild(box);
      WKApi.leaderboard(settings.diff, 5).then(lb => {
        if (t !== lbToken || !lb) { box.remove(); return; }
        if (!lb.length) { box.innerHTML = `<div style="font-size:12.5px;color:#5f7ba3">${svgIcon("i-globe")} ${I18N.t("menu.scores.empty_online")}</div>`; return; }
        box.innerHTML = `<div style="font-size:12.5px;color:#5f7ba3;margin-bottom:4px">${svgIcon("i-globe")} ${I18N.t("menu.scores.online_title", { diff: DIFF_LABEL[settings.diff] })}</div>` +
          lb.map((r, i) => `<div><span class="rank r${i + 1}">${i + 1}</span> ${escapeHtml(r.profileName)} — <b style="color:#fde68a">${I18N.fmtNum(num(r.score))}</b> <span style="color:#5f7ba3">· wave ${int0(r.wave)}</span></div>`).join("");
      }).catch(() => box.remove());
    }
  }
  function renderStats() {
    const raw = store.get(pkey("wk_stats"), { games: 0, kills: 0, bestWave: 0, totalScore: 0, timeSec: 0 });
    const s = { games: int0(raw.games), kills: int0(raw.kills), bestWave: int0(raw.bestWave), totalScore: num(raw.totalScore), timeSec: int0(raw.timeSec) };
    const mins = Math.floor(s.timeSec / 60);
    $("stat-list").innerHTML =
      `${svgIcon("i-gamepad")} ${I18N.t("menu.stats.games")}: <b>${s.games}</b> &nbsp;•&nbsp; ${svgIcon("i-skull")} ${I18N.t("menu.stats.kills")}: <b>${I18N.fmtNum(s.kills)}</b><br>` +
      `${svgIcon("i-wave")} ${I18N.t("menu.stats.best_wave")}: <b>${s.bestWave}</b> &nbsp;•&nbsp; ${svgIcon("i-gem")} ${I18N.t("menu.stats.total_score")}: <b>${I18N.fmtNum(s.totalScore)}</b><br>` +
      `${svgIcon("i-clock")} ${I18N.t("menu.stats.time")}: <b>${I18N.t("menu.stats.minutes", { n: mins })}</b>`;
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
      $("new-profile-name").placeholder = I18N.t("menu.profile.enter_name_hint");
      return false;
    }
    return true;
  }
  $("btn-play").onclick = () => {
    if (!ensureProfile()) return;
    if (window.WKAudio) WKAudio.ensure();
    const p = active();
    if (p) { Analytics.setProfile(p.id); Analytics.track("game_start", { difficulty: settings.diff }); }
    const q = new URLSearchParams({
      diff: settings.diff, music: settings.music ? 1 : 0, sfx: settings.sfx ? 1 : 0,
      shake: settings.shake ? 1 : 0, fx: settings.fx === "reduced" ? "reduced" : "full",
      sat: ["auto", "sim", "off"].includes(settings.sat) ? settings.sat : "auto", profile: activeId,
    });
    if (window.WK_PORTAL_MODE) {
      // Portal/iframe (itch.io, CrazyGames...): popup bị chặn → mở game ngay trong khung hiện tại
      q.set("portal", "1"); q.set("sat", "sim");
      window.location.href = "game.html?" + q.toString();
      return;
    }
    const w = window.open("game.html?" + q.toString(), "windowkill_arena", "width=980,height=700,left=120,top=60,menubar=no,toolbar=no,location=no,status=no,resizable=yes");
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
            Cinema.countUp(el, v, { format: (x) => I18N.fmtNum(Math.round(x)) });
          });
        } catch (e) {}
      };
    } catch (e) {}
  })();
  /* ---------- v2.0: language toggle, stage select, tutorial modal, meta panels ----------
     Tất cả guard — module nào thiếu thì launcher chạy như cũ. */
  (function v2menu() {
    try {
      if (!window.I18N) return;
      const vt = (k, fb) => { try { const v = I18N.t(k); return (!v || v === k) ? fb : v; } catch (e) { return fb; } };
      const stName = (st) => { try { return (I18N.getLang() === "en" && st.nameEn) ? st.nameEn : st.nameVi; } catch (e) { return st.nameVi; } };
      const lang = (window.I18N && I18N.lang) || "vi";

      /* 1. Language toggle — chèn vào settings panel */
      try {
        const setPanel = document.querySelector("#tgl-music").closest(".panel");
        const row = document.createElement("div");
        row.className = "setrow";
        row.innerHTML = `<span><svg class="ic" aria-hidden="true"><use href="#i-globe"/></svg> <span>${escapeHtml(vt("menu.lang", "Ngôn ngữ / Language"))}</span></span>
          <div class="row opt-btns" style="gap:8px">
            <button class="btn-ghost" data-lang="vi">Tiếng Việt</button>
            <button class="btn-ghost" data-lang="en">English</button>
          </div>`;
        setPanel.appendChild(row);
        row.querySelectorAll("[data-lang]").forEach(b => {
          b.classList.toggle("sel", b.dataset.lang === lang);
          b.onclick = () => { try { I18N.setLang(b.dataset.lang); } catch (e) {} setTimeout(() => location.reload(), 80); };
        });
      } catch (e) {}

      let v2sel = { kind: "free" }; // free | stage | daily
      let v2skipTut = null;         // null = hỏi lần đầu; true = bỏ qua; false = học

      function launchGame() {
        if (!ensureProfile()) return;
        if (window.WKAudio) WKAudio.ensure();
        const p = active();
        if (p) { Analytics.setProfile(p.id); Analytics.track("game_start", { difficulty: settings.diff, mode: v2sel.kind }); }
        const q = new URLSearchParams({
          diff: settings.diff, music: settings.music ? 1 : 0, sfx: settings.sfx ? 1 : 0,
          shake: settings.shake ? 1 : 0, fx: settings.fx === "reduced" ? "reduced" : "full",
          sat: ["auto", "sim", "off"].includes(settings.sat) ? settings.sat : "auto", profile: activeId,
        });
        if (v2sel.kind === "stage") q.set("stage", String(v2sel.n));
        if (v2sel.kind === "daily") q.set("daily", "1");
        if (v2skipTut === true) q.set("tut", "0");
        else if (v2skipTut === false) q.set("tut", "1");
        if (window.WK_PORTAL_MODE) {
          q.set("portal", "1"); q.set("sat", "sim");
          window.location.href = "game.html?" + q.toString();
          return;
        }
        const w = window.open("game.html?" + q.toString(), "windowkill_arena", "width=980,height=700,left=120,top=60,menubar=no,toolbar=no,location=no,status=no,resizable=yes");
        if (!w) $("popup-warn").style.display = "block";
        else { $("popup-warn").style.display = "none"; w.focus(); }
      }

      /* 2. Stage select — panel trước nút CHƠI NGAY */
      try {
        if (window.Campaign) {
          const wrap = document.createElement("div");
          wrap.className = "panel"; wrap.id = "v2-stages";
          const unlocked = Campaign.getUnlockedStage(activeId);
          const best = Campaign.getStageBest(activeId);
          const cards = Campaign.STAGES.map(st => {
            const lock = st.id > unlocked;
            const b = best[String(st.id)] || {};
            return `<button class="btn-ghost v2-stage" data-stage="${st.id}" ${lock ? "disabled" : ""}
              style="min-width:148px;text-align:left;opacity:${lock ? 0.55 : 1}">
              <div style="font-weight:800">${lock ? "🔒" : "🪟"} ${escapeHtml(vt("campaign.stage", "Ải"))} ${st.id}</div>
              <div style="font-size:12.5px">${escapeHtml(stName(st))}</div>
              <div style="font-size:11.5px;color:#5f7ba3">${b.score ? ("🏆 " + I18N.fmtNum(b.score)) : (lock ? escapeHtml(vt("campaign.locked_hint", "Phá đảo ải trước để mở")) : "—")}</div>
            </button>`;
          }).join("");
          wrap.innerHTML = `<h3><svg class="ic" aria-hidden="true"><use href="#i-flag"/></svg> ${escapeHtml(vt("campaign.title", "Chiến dịch"))}</h3>
            <div class="row" style="gap:8px;flex-wrap:wrap">
              <button class="btn-ghost v2-stage sel" data-stage="0" style="min-width:148px;text-align:left">
                <div style="font-weight:800">♾️ ${escapeHtml(vt("campaign.free", "Chơi tự do"))}</div>
                <div style="font-size:12.5px">${escapeHtml(vt("campaign.free_desc", "Endless như cũ, boss mỗi 5 wave"))}</div>
              </button>${cards}
            </div>`;
          const playRow = document.querySelector("#btn-play").closest(".row");
          playRow.parentNode.insertBefore(wrap, playRow);
          wrap.querySelectorAll(".v2-stage").forEach(b => {
            b.onclick = () => {
              wrap.querySelectorAll(".v2-stage").forEach(x => x.classList.remove("sel"));
              b.classList.add("sel");
              const s = b.dataset.stage;
              v2sel = s === "0" ? { kind: "free" } : { kind: "stage", n: parseInt(s, 10) };
            };
          });
        }
      } catch (e) {}

      /* 3. Tutorial modal + nút chơi lại hướng dẫn */
      function showTutModal() {
        const ov = document.createElement("div");
        ov.id = "v2-tutmodal";
        ov.style.cssText = "position:fixed;inset:0;background:rgba(2,8,20,.72);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px";
        ov.innerHTML = `<div class="panel" style="max-width:420px;text-align:center">
          <h3>🎓 ${escapeHtml(vt("tutorial.modal_title", "Học chơi trong 2 phút?"))}</h3>
          <p style="font-size:14px;color:#c8dcf5">${escapeHtml(vt("tutorial.modal_desc", "Hướng dẫn tương tác ngay trong game: di chuyển, bắn, nhặt gem, chọn nâng cấp."))}</p>
          <div class="row" style="gap:10px;justify-content:center;margin-top:12px">
            <button class="btn-big" id="v2-tut-yes">${escapeHtml(vt("tutorial.modal_yes", "Học chơi"))}</button>
            <button class="btn-ghost" id="v2-tut-no">${escapeHtml(vt("tutorial.modal_no", "Chơi luôn"))}</button>
          </div></div>`;
        document.body.appendChild(ov);
        ov.querySelector("#v2-tut-yes").onclick = () => { ov.remove(); v2skipTut = false; launchGame(); };
        ov.querySelector("#v2-tut-no").onclick = () => { ov.remove(); v2skipTut = true; launchGame(); };
      }
      $("btn-play").onclick = () => {
        if (window.Tutorial && v2skipTut === null && !Tutorial.isDone(activeId)) { showTutModal(); return; }
        launchGame();
      };
      try { // nút "chơi lại hướng dẫn" trong panel cách chơi
        const howto = document.querySelector("[data-i18n='menu.howto.1']");
        const btn = document.createElement("button");
        btn.className = "btn-ghost"; btn.style.marginTop = "10px";
        btn.innerHTML = `🎓 ${escapeHtml(vt("tutorial.replay", "Chơi lại hướng dẫn"))}`;
        btn.onclick = () => { v2skipTut = false; launchGame(); };
        (howto ? howto.closest(".panel") : document.body).appendChild(btn);
      } catch (e) {}

      /* 4. Meta panels: Xưởng + Thành tựu + Daily */
      try {
        if (window.Meta) {
          const mp = document.createElement("div");
          mp.className = "panel"; mp.id = "v2-meta";
          const anchor = document.querySelector("#hs-list").closest(".panel");
          anchor.parentNode.insertBefore(mp, anchor.nextSibling);
          function renderMeta() {
            const shards = Meta.getShards();
            const nodes = Meta.WORKSHOP.map(d => {
              const lv = (Meta.getWorkshop()[String(d.id)] || 0);
              const maxed = lv >= d.maxLevel;
              const cost = maxed ? 0 : (d.costs[lv] || d.costs[d.costs.length - 1]);
              const can = !maxed && shards >= cost;
              return `<div style="border:1px solid #1c3d6e;border-radius:10px;padding:8px;min-width:150px;flex:1">
                <div style="font-weight:800;font-size:13px">${escapeHtml(d.nameVi)} <span style="color:#ffd479">${"●".repeat(lv)}${"○".repeat(d.maxLevel - lv)}</span></div>
                <div style="font-size:11.5px;color:#8fb0d8">${escapeHtml(d.descVi)}</div>
                <button class="btn-ghost v2-buy" data-node="${d.id}" ${can ? "" : "disabled"} style="margin-top:6px;font-size:12px">
                  ${maxed ? "MAX" : ("💎 " + cost)}</button></div>`;
            }).join("");
            const achvs = Meta.getAchievements();
            const unCount = achvs.filter(a => a.unlocked).length;
            const achHtml = achvs.map(a => `<div style="font-size:12.5px;padding:3px 0">${a.unlocked ? "✅" : "🔒"} <b>${escapeHtml(a.nameVi)}</b>
              <span style="color:#5f7ba3">+${a.reward}💎</span><br><span style="color:#8fb0d8;font-size:11.5px">${escapeHtml(a.condDescVi)}</span></div>`).join("");
            const d = Meta.getDaily();
            const dMods = (d.modifiers || []).join(" · ");
            mp.innerHTML = `
              <h3><svg class="ic" aria-hidden="true"><use href="#i-anvil"/></svg> ${escapeHtml(vt("meta.workshop", "Xưởng"))}
                <span style="float:right;font-size:14px">💎 ${I18N.fmtNum(shards)} ${escapeHtml(vt("meta.shards", "Mảnh Kính"))}</span></h3>
              <div class="row" style="gap:8px;flex-wrap:wrap">${nodes}</div>
              <h3 style="margin-top:14px">🏆 ${escapeHtml(vt("meta.achievements", "Thành tựu"))} (${unCount}/${achvs.length})</h3>
              <div style="max-height:220px;overflow:auto">${achHtml}</div>
              <h3 style="margin-top:14px">📅 Daily — ${escapeHtml(d.dateStr || "")}</h3>
              <div style="font-size:13px;color:#c8dcf5">${escapeHtml(dMods)}</div>
              <div style="font-size:12.5px;color:#8fb0d8">${escapeHtml(vt("meta.daily_best", "Kỷ lục hôm nay"))}: ${I18N.fmtNum(d.bestScore || 0)} · 🔥 ${d.streak || 0}</div>
              <div class="row" style="gap:8px;margin-top:8px">
                <button class="btn-ghost" id="v2-daily-play">📅 ${escapeHtml(vt("meta.daily_play", "Chơi Daily"))}</button>
                ${Meta.canEmergencyRepair() ? `<button class="btn-ghost" id="v2-emg">🛠️ ${escapeHtml(vt("meta.emergency", "Sửa khẩn cấp"))} (−50💎)</button>` : ""}
              </div>`;
            mp.querySelectorAll(".v2-buy").forEach(b => { b.onclick = () => { if (Meta.buyNode(b.dataset.node).ok) renderMeta(); }; });
            const dp = mp.querySelector("#v2-daily-play");
            if (dp) dp.onclick = () => { v2sel = { kind: "daily" }; launchGame(); v2sel = { kind: "free" }; };
            const em = mp.querySelector("#v2-emg");
            if (em) em.onclick = () => { const r = Meta.emergencyRepair(); if (r && r.ok) { alert("✅"); renderMeta(); } };
          }
          renderMeta();
        }
      } catch (e) {}
    } catch (e) {}
  })();
  paintToggles(); renderAll(); Backend.init();
  if (activeId) Analytics.setProfile(activeId); // warm the sha256 profile hash for analytics
})();
