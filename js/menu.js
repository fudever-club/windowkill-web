/* WINDOWKILL: Web Edition — launcher logic (Dever theme + user profiles) */
"use strict";
(() => {
  const $ = (id) => document.getElementById(id);
  const bus = ("BroadcastChannel" in window) ? new BroadcastChannel("windowkill_bus") : null;

  /* ---------- user profiles ---------- */
  const AVATARS = ["🎮","⚔️","🛡️","🚀","🐺","🦊","🐉","⚡","🔥","💎","👾","🤖"];
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  let profiles = store.get("wk_profiles", []);
  let activeId = store.get("wk_active_profile", null);
  const active = () => profiles.find(p => p.id === activeId) || null;
  const pkey = (base) => { const p = active(); return p ? `${base}_${p.id}` : base; };

  function saveProfiles() { store.set("wk_profiles", profiles); store.set("wk_active_profile", activeId); }

  function renderProfiles() {
    const bar = $("profile-bar"); bar.innerHTML = "";
    profiles.forEach(p => {
      const chip = document.createElement("button");
      chip.className = "pchip" + (p.id === activeId ? " on" : "");
      chip.innerHTML = `<span>${p.emoji}</span><span></span>`;
      chip.querySelectorAll("span")[1].textContent = p.name;
      chip.title = "Chơi với tài khoản này";
      chip.onclick = () => { activeId = p.id; saveProfiles(); renderAll(); };
      const del = document.createElement("span");
      del.className = "x"; del.textContent = "✕"; del.title = "Xóa tài khoản";
      del.onclick = (e) => {
        e.stopPropagation();
        if (!confirm(`Xóa tài khoản "${p.name}" và toàn bộ kỷ lục của tài khoản này?`)) return;
        ["wk_high_chill","wk_high_normal","wk_high_hard","wk_stats"].forEach(b => { try { localStorage.removeItem(`${b}_${p.id}`); } catch {} });
        profiles = profiles.filter(q => q.id !== p.id);
        if (activeId === p.id) activeId = profiles.length ? profiles[0].id : null;
        saveProfiles(); renderAll();
      };
      chip.appendChild(del);
      bar.appendChild(chip);
    });
    const add = document.createElement("button");
    add.className = "pchip"; add.innerHTML = "<span>＋</span><span>Tài khoản mới</span>";
    add.onclick = () => { const b = $("new-profile-box"); b.style.display = b.style.display === "flex" ? "none" : "flex"; $("new-profile-name").focus(); };
    bar.appendChild(add);
    const who = active() ? ` — ${active().emoji} ${active().name}` : "";
    $("hs-who").textContent = who; $("st-who").textContent = who;
  }

  function createProfile() {
    const name = $("new-profile-name").value.trim().slice(0, 16);
    if (!name) { $("new-profile-name").focus(); return; }
    const p = { id: "p" + Date.now().toString(36), name, emoji: AVATARS[profiles.length % AVATARS.length], createdAt: Date.now() };
    profiles.push(p); activeId = p.id; saveProfiles();
    $("new-profile-name").value = ""; $("new-profile-box").style.display = "none";
    renderAll();
  }
  $("btn-create-profile").onclick = createProfile;
  $("new-profile-name").addEventListener("keydown", e => { if (e.key === "Enter") createProfile(); });

  /* ---------- settings ---------- */
  const settings = Object.assign({ music: true, sfx: true, shake: true, diff: "normal" }, store.get("wk_settings", {}));
  const saveSettings = () => store.set("wk_settings", settings);
  function paintToggles() {
    $("tgl-music").classList.toggle("on", settings.music);
    $("tgl-sfx").classList.toggle("on", settings.sfx);
    $("tgl-shake").classList.toggle("on", settings.shake);
    document.querySelectorAll(".diff-btns .btn-ghost").forEach(b => b.classList.toggle("sel", b.dataset.diff === settings.diff));
  }
  $("tgl-music").onclick = (e) => { settings.music = !settings.music; saveSettings(); paintToggles(); WKAudio.setMusic(settings.music); };
  $("tgl-sfx").onclick = () => { settings.sfx = !settings.sfx; saveSettings(); paintToggles(); WKAudio.setSfx(settings.sfx); };
  $("tgl-shake").onclick = () => { settings.shake = !settings.shake; saveSettings(); paintToggles(); };
  document.querySelectorAll(".diff-btns .btn-ghost").forEach(b => b.onclick = () => { settings.diff = b.dataset.diff; saveSettings(); paintToggles(); renderScores(); });
  WKAudio.setMusic(settings.music); WKAudio.setSfx(settings.sfx);

  /* ---------- high scores & stats (per profile) ---------- */
  const DIFF_LABEL = { chill: "Chill 😌", normal: "Thường 🙂", hard: "Khắc nghiệt 💀" };
  function renderScores() {
    const el = $("hs-list");
    const rows = ["chill", "normal", "hard"].map(d => {
      const h = store.get(pkey("wk_high_" + d), null);
      return `<div>🎚️ ${DIFF_LABEL[d]}: <b style="color:#fde68a">${h ? h.score.toLocaleString("vi-VN") + " điểm · wave " + h.wave : "—"}</b></div>`;
    }).join("");
    el.innerHTML = active() ? rows : "Hãy tạo tài khoản để lưu kỷ lục!";
  }
  function renderStats() {
    const s = store.get(pkey("wk_stats"), { games: 0, kills: 0, bestWave: 0, totalScore: 0, timeSec: 0 });
    const mins = Math.floor(s.timeSec / 60);
    $("stat-list").innerHTML =
      `🎮 Số trận: <b>${s.games}</b> &nbsp;•&nbsp; ☠️ Quái hạ: <b>${s.kills.toLocaleString("vi-VN")}</b><br>` +
      `🌊 Wave cao nhất: <b>${s.bestWave}</b> &nbsp;•&nbsp; ⭐ Tổng điểm: <b>${s.totalScore.toLocaleString("vi-VN")}</b><br>` +
      `⏱️ Tổng thời gian: <b>${mins} phút</b>`;
  }
  function renderAll() { renderProfiles(); renderScores(); renderStats(); }

  /* ---------- game over reports from popup ---------- */
  if (bus) bus.onmessage = (ev) => {
    const m = ev.data || {};
    if (m.type === "gameover" && m.profileId) {
      const prof = profiles.find(p => p.id === m.profileId);
      if (!prof) return;
      const hk = `wk_high_${m.diff}_${m.profileId}`;
      const prev = store.get(hk, null);
      if (!prev || m.score > prev.score) store.set(hk, { score: m.score, wave: m.wave });
      const sk = `wk_stats_${m.profileId}`;
      const s = store.get(sk, { games: 0, kills: 0, bestWave: 0, totalScore: 0, timeSec: 0 });
      s.games++; s.kills += m.kills || 0; s.totalScore += m.score || 0;
      s.bestWave = Math.max(s.bestWave, m.wave || 0); s.timeSec += m.timeSec || 0;
      store.set(sk, s);
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
    const q = new URLSearchParams({
      diff: settings.diff, music: settings.music ? 1 : 0, sfx: settings.sfx ? 1 : 0,
      shake: settings.shake ? 1 : 0, profile: activeId,
    }).toString();
    const w = window.open("game.html?" + q, "windowkill_arena", "width=980,height=700,left=120,top=60,menubar=no,toolbar=no,location=no,status=no,resizable=yes");
    if (!w) $("popup-warn").style.display = "block";
    else { $("popup-warn").style.display = "none"; w.focus(); }
  };

  /* init: migrate legacy global scores to first profile if any */
  if (!profiles.length) {
    const legacy = ["wk_high_chill", "wk_high_normal", "wk_high_hard"].some(k => { try { return localStorage.getItem(k) != null; } catch { return false; } });
    if (legacy) {
      const p = { id: "p" + Date.now().toString(36), name: "Player 1", emoji: "🎮", createdAt: Date.now() };
      profiles.push(p); activeId = p.id; saveProfiles();
    }
  }
  paintToggles(); renderAll();
})();
