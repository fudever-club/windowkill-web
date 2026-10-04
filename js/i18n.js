/* =====================================================================
   WINDOWKILL i18n — hệ thống đa ngôn ngữ EN/VI (API contract cho mọi team)
   =====================================================================
   - IIFE, expose `window.I18N`. Không phụ thuộc module nào khác.
   - Giữ thuật ngữ Anh theo GAME-DESIGN-DOC §12: wave, combo, draft, DPS,
     XP, HP, boss, gem, Mảnh Kính (meta currency).
   - Quy ước icon DOM (bắt buộc, Design Team): emoji KHÔNG được dùng làm
     icon trong DOM — dùng SVG `<use href="#i-..."/>` từ assets/icons (xem
     assets/icons/MANIFEST.md). Emoji chỉ còn trong text vẽ canvas gameplay
     (fillText) và KHÔNG chạm được bằng CSS/DOM.
   ---------------------------------------------------------------------
   API (HỢP ĐỒNG ỔN ĐỊNH — các team khác code theo API này):
     I18N.t(key, vars)      — dịch key, hỗ trợ {var} interpolation.
                             Fallback: lang hiện tại → 'vi' → key thô.
     I18N.setLang('vi'|'en')— đổi ngôn ngữ, lưu `wk_lang`, applyDOM lại,
                             bắn event "wk:lang".
     I18N.getLang()          — 'vi' | 'en'.
     I18N.detect()           — ?lang= → wk_lang đã lưu →
                               WK_PORTAL_MODE===true ? 'en' : → 'vi'.
     I18N.register(dict)    — thêm key: I18N.register({en:{...}, vi:{...}}).
                             Deep-merge; key trùng sẽ bị ghi đè.
     I18N.applyDOM(root?)    — quét [data-i18n] (text), [data-i18n-html]
                             (innerHTML), [data-i18n-ph|aria|title|alt]
                             (attribute) rồi thay bằng bản dịch.
     I18N.locale()           — 'vi-VN' | 'en-US' (định dạng số).
     I18N.fmtNum(n)          — số theo locale ngôn ngữ hiện tại.
   ===================================================================== */
(function () {
  "use strict";

  var DEFAULT_LANG = "vi";
  var STORE_KEY = "wk_lang";

  /* ---------- từ điển gốc (menu/hud/draft/game-over/settings/error) ----------
     Các team khác (campaign, monster mới, tutorial, meta, juice...) tự gọi
     I18N.register() để thêm key của họ — xem INTEGRATION.md. */
  var dict = { vi: {}, en: {} };

  var BASE = {
    vi: {
      /* ----- common ----- */
      "common.play": "CHƠI NGAY",
      "common.retry": "Chơi lại",
      "common.back_menu": "Về menu",
      "common.continue": "Tiếp tục",
      "common.online": "Online",
      "common.offline": "Offline",
      /* ----- menu / launcher ----- */
      "menu.hero_sub": "Twin-stick shooter trong <b>một popup trình duyệt</b> — và <b>cửa sổ chính là thanh máu</b> của bạn. Quái tím gặm nhỏ cửa sổ, đạn bắn vào viền hất văng cả cửa sổ. Sống sót. Đừng để bị \"đóng cửa sổ\".",
      "menu.hero_tagline": "CỬA SỔ = MÁU CỦA BẠN",
      "menu.hero_demo_aria": "Minh họa: quái tím gặm 4 góc cửa sổ trình duyệt, viền nứt dần",
      "menu.hero_demo_label": "MINH HỌA GAMEPLAY",
      "menu.popup_note": "Game mở trong <b>popup riêng</b> — hãy cho phép popup cho trang này.",
      "menu.profile.title": "Tài khoản người dùng",
      "menu.profile.new": "Tài khoản mới",
      "menu.profile.play_as": "Chơi với tài khoản này",
      "menu.profile.delete": "Xóa tài khoản",
      "menu.profile.delete_confirm": "Xóa tài khoản \"{name}\" và toàn bộ kỷ lục của tài khoản này?",
      "menu.profile.create": "Tạo",
      "menu.profile.name_ph": "Tên hiển thị, ví dụ: NhatPro...",
      "menu.profile.enter_name_hint": "Nhập tên để tạo tài khoản rồi bấm CHƠI NGAY",
      "menu.profile.note": "Mỗi tài khoản lưu riêng kỷ lục &amp; thống kê trên máy này.",
      "menu.howto.title": "Cách chơi",
      "menu.howto.1": "<b>Chuột</b> để ngắm &amp; bắn — <b>WASD / phím mũi tên</b> để di chuyển (desktop).",
      "menu.howto.2": "<b>Mobile:</b> joystick trái di chuyển, joystick phải ngắm bắn.",
      "menu.howto.3": "Quái tím bám vào <b>viền cửa sổ</b> sẽ gặm nhỏ dần cửa sổ = mất máu.",
      "menu.howto.4": "Bắn đạn vào viền để <b>hất văng quái</b> &amp; đẩy cửa sổ bay (window slam gây sát thương!).",
      "menu.howto.5": "Nhặt XP lên cấp &rarr; chọn 1 trong 3 nâng cấp. Boss mỗi 5 wave.",
      "menu.howto.6": "Qua wave được vá lại một phần cửa sổ.",
      "menu.scores.title": "Kỷ lục",
      "menu.scores.line": "{score} điểm · wave {wave}",
      "menu.scores.no_profile": "Hãy tạo tài khoản để lưu kỷ lục!",
      "menu.scores.empty_default": "Chưa có dữ liệu — vào game lập kỷ lục đi!",
      "menu.scores.loading": "Đang tải bảng xếp hạng online…",
      "menu.scores.empty_online": "Chưa có điểm online cho độ khó này.",
      "menu.scores.online_title": "Bảng xếp hạng online — {diff}",
      "menu.stats.title": "Thống kê",
      "menu.stats.games": "Số trận",
      "menu.stats.kills": "Quái hạ",
      "menu.stats.best_wave": "Wave cao nhất",
      "menu.stats.total_score": "Tổng điểm",
      "menu.stats.time": "Tổng thời gian",
      "menu.stats.minutes": "{n} phút",
      "menu.diff.chill": "Chill",
      "menu.diff.normal": "Thường",
      "menu.diff.hard": "Khắc nghiệt",
      /* ----- hub nav (landing sạch: icon mở panel) ----- */
      "menu.hub.shop": "Cửa hàng",
      "menu.hub.ach": "Thành tựu",
      "menu.hub.daily": "Daily",
      "menu.hub.stats": "Thống kê",
      "menu.hub.settings": "Cài đặt",
      "menu.hub.howto": "Cách chơi",
      "menu.hub.close": "Đóng",
      "menu.hub.nav": "Bảng điều khiển",
      "menu.hub.difficulty": "Độ khó",
      "menu.footer_made": "Fan-made game lấy cảm hứng từ <b>Windowkill</b> (Steam) — không liên quan tới nhà phát triển gốc.",
      "menu.footer_dev": "Phát triển bởi <b>FU-DEVER</b> — CLB Lập trình, Đại học FPT Đà Nẵng &bull; WORK HARD — PLAY HARD",
      "menu.footer_vercel": "Chơi trên Vercel",
      /* ----- settings ----- */
      "settings.title": "Cài đặt",
      "settings.music": "Nhạc nền",
      "settings.music_aria": "Bật/tắt nhạc nền",
      "settings.sfx": "Hiệu ứng âm thanh",
      "settings.sfx_aria": "Bật/tắt hiệu ứng âm thanh",
      "settings.shake": "Rung cửa sổ khi trúng đòn",
      "settings.shake_aria": "Bật/tắt rung cửa sổ",
      "settings.haptic": "Rung phản hồi (mobile)",
      "settings.haptic_aria": "Bật/tắt rung phản hồi",
      "settings.difficulty": "Độ khó",
      "settings.fx": "Hiệu ứng hình ảnh",
      "settings.fx_full": "Đầy đủ",
      "settings.fx_reduced": "Giảm",
      "settings.quality": "Chất lượng",
      "settings.quality_auto": "Tự động",
      "settings.quality_high": "Cao",
      "settings.quality_balanced": "Cân bằng",
      "settings.quality_lite": "Nhẹ",
      "settings.sat": "Cửa sổ vệ tinh",
      "settings.sat_auto": "Tự động",
      "settings.sat_sim": "Luôn mô phỏng",
      "settings.sat_off": "Tắt",
      "settings.wjump": "Độ Nhảy Cửa Sổ",
      "settings.wjump_calm": "Êm",
      "settings.wjump_normal": "Vừa",
      "settings.wjump_wild": "Điên",
      "settings.analytics": "Thống kê ẩn danh (không cookie)",
      "settings.analytics_aria": "Bật/tắt thống kê ẩn danh",
      "settings.analytics_title": "Gửi thống kê ẩn danh giúp cải thiện game. Không cookie, không định danh, tôn trọng Do-Not-Track.",
      "settings.language": "Ngôn ngữ",
      /* ----- error ----- */
      "error.popup_blocked": "Trình duyệt của bạn đang <b>chặn popup</b>. Hãy cho phép popup cho trang này (biểu tượng <svg class=\"ic\" aria-hidden=\"true\"><use href=\"#i-lock\"/></svg> trên thanh địa chỉ) rồi bấm Chơi lại.",
      "error.resize_blocked": "Trình duyệt chặn resize — dùng đấu trường ảo",
      "error.popup_blocked_game": "Trình duyệt chặn popup — game vẫn chơi đủ mechanic!",
      "error.sim_title": "Dùng cửa sổ mô phỏng",
      /* ----- HUD ----- */
      "hud.window_pct": "{pct}% NGUYÊN VẸN",
      "hud.shield_sim": "KHIÊN \u00d7{hearts}",
      "hud.shield_popup": "KHIÊN {px}px",
      "hud.magnet": "HÚT {s}s",
      "hud.overdrive": "OD {s}s",
      "hud.chip_magnet_aria": "Nam châm: còn {s} giây",
      "hud.chip_overdrive_aria": "Tăng tốc bắn: còn {s} giây",
      "hud.chip_shield_aria": "Khiên: còn {s} giây",
      "hud.chip_winshield_aria": "Khiên cửa sổ",
      "hud.controls": "WASD di chuyển · chuột ngắm · giữ chuột bắn · bắn vào viền để đẩy cửa sổ! (P: pause)",
      "hud.controls_mobile": "Joystick trái: di chuyển · phải: ngắm+bắn",
      "hud.chew_window": "Gặm viền!",
      "hud.chew_shield": "Gặm khiên!",
      /* ----- pause ----- */
      "pause.title": "Tạm dừng",
      "pause.resume": "Tiếp tục",
      "pause.retry": "Chơi lại",
      "pause.quit": "Về menu",
      "pause.hint": "P / Esc: tiếp tục · M: bật/tắt nhạc",
      "pause.hint_mobile": "Chạm nút ⏸ để tiếp tục", // MOBILE 2026-10-03
      "pause.aria": "Tạm dừng",
      "pause.full_aria": "Toàn màn hình",
      /* ----- draft ----- */
      "draft.title": "LÊN CẤP! Chọn 1 nâng cấp",
      "draft.cine_title": "LEVEL UP",
      "draft.pick_one": "Chọn 1 nâng cấp",
      "draft.hint": "Phím 1 / 2 / 3 để chọn nhanh",
      "draft.hint_mobile": "Tap to pick", // MOBILE 2026-10-03
      "draft.hint_mobile": "Chạm để chọn", // MOBILE 2026-10-03
      "draft.aria": "Nâng cấp: {name}",
      "draft.fallback_name": "Nâng cấp {n}",
      "draft.patch_title": "VÁ CỬA SỔ",
      "draft.patch_sub": "Chọn 1 mảnh vá",
      "draft.patch_aria": "Mảnh vá: {name}",
      /* ----- game over ----- */
      "game.title": "WINDOWKILL: Web Edition — Chiến trường",
      "game.hud_pause_aria": "Tạm dừng",
      "game.hud_full_aria": "Toàn màn hình",
      "game.hud_menu_aria": "Menu game",
      "game.hud_menu_pause": "Tạm dừng",
      "game.hud_menu_full": "Toàn màn hình",
      "game.hud_menu_quit": "Về menu",
      "gameover.title_default": "GAME OVER",
      "gameover.title_ship": "Tàu nổ tung!",
      "gameover.title_window": "CỬA SỔ ĐÃ VỠ!",
      "gameover.tip_ship": "Quái vây quá đông. Lần tới giữ khoảng cách xa hơn nhé.",
      "gameover.tip_window": "Quái tím gặm nát viền. Ưu tiên hạ chúng trước nhé.",
      "gameover.score_line": "{score} điểm · Wave {wave}",
      "gameover.stats": "{kills} quái hạ · <svg class=\"ic\" aria-hidden=\"true\"><use href=\"#i-levelup\"/></svg> cấp {level} · <svg class=\"ic\" aria-hidden=\"true\"><use href=\"#i-clock\"/></svg> {time}s · {diff}",
      "gameover.new_record": "Kỷ lục mới!",
      "gameover.retry": "VÁ LẠI & CHƠI TIẾP (R)",
      "gameover.retry_hint": "Chơi lại (R)",
      "gameover.menu": "Về menu",
      /* ----- CTA desktop (web→desktop funnel) ----- */
      "cta.launcher_title": "Desktop Edition",
      "cta.launcher_sub": "Cửa sổ thật, không mô phỏng",
      "cta.gameover_text": "Cửa sổ này chỉ là mô phỏng. Trải nghiệm cửa sổ THẬT trên bản Desktop →",
      "cta.gameover_btn": "Tải Desktop",
      "cta.toast_text": "Bản Desktop: cửa sổ thật đấy!",
      /* ----- PWA install prompt (feat/pwa-trailer) ----- */
      "pwa.install_title": "Cài WINDOWKILL",
      "pwa.install_sub": "Chơi như app thật — mở nhanh, chơi offline, không cần mở trình duyệt",
      "pwa.install_btn": "Cài đặt",
      "pwa.install_dismiss": "Đóng",
      "pwa.ios_title": "Thêm vào Màn hình chính",
      "pwa.ios_steps": "Mở menu <b>Chia sẻ</b> rồi chọn <b>Thêm vào Màn hình chính</b> để cài game",
      "pwa.ios_btn": "Đã hiểu",
      /* ----- satellite permission ----- */
      "satperm.text": "Màn này có cửa sổ vệ tinh — cho mở nhé?",
      "satperm.allow": "Cho phép",
      "satperm.single": "Chơi 1 cửa sổ",
      /* ----- PWA update (toast khi SW phát hiện bản mới) ----- */
      "pwa.update_text": "Có bản mới — bấm để tải lại",
      "pwa.update_aria": "Tải lại để dùng bản mới",
    },
    en: {
      /* ----- common ----- */
      "common.play": "PLAY NOW",
      "common.retry": "Play again",
      "common.back_menu": "Back to menu",
      "common.continue": "Resume",
      "common.online": "Online",
      "common.offline": "Offline",
      /* ----- menu / launcher ----- */
      "menu.hero_sub": "A twin-stick shooter inside <b>one browser popup</b> — and <b>the window itself is your health bar</b>. Purple monsters chew the window smaller; shooting the edge shoves the whole window. Survive. Don't get \"closed\".",
      "menu.hero_tagline": "THE WINDOW IS YOUR HEALTH",
      "menu.hero_demo_aria": "Demo: purple monsters chewing a browser window's corners as cracks spread",
      "menu.hero_demo_label": "GAMEPLAY PREVIEW",
      "menu.popup_note": "The game opens in a <b>separate popup</b> — please allow popups for this page.",
      "menu.profile.title": "Player profiles",
      "menu.profile.new": "New profile",
      "menu.profile.play_as": "Play as this profile",
      "menu.profile.delete": "Delete profile",
      "menu.profile.delete_confirm": "Delete profile \"{name}\" and all of its records?",
      "menu.profile.create": "Create",
      "menu.profile.name_ph": "Display name, e.g. NhatPro...",
      "menu.profile.enter_name_hint": "Enter a name to create a profile, then hit PLAY NOW",
      "menu.profile.note": "Each profile keeps its own records &amp; stats on this device.",
      "menu.howto.title": "How to play",
      "menu.howto.1": "<b>Mouse</b> to aim &amp; shoot — <b>WASD / arrow keys</b> to move (desktop).",
      "menu.howto.2": "<b>Mobile:</b> left joystick moves, right joystick aims &amp; shoots.",
      "menu.howto.3": "Purple monsters latch onto the <b>window edge</b> and chew it smaller = you lose HP.",
      "menu.howto.4": "Shoot the edge to <b>knock monsters off</b> &amp; shove the window flying (window slam deals damage!).",
      "menu.howto.5": "Grab XP to level up &rarr; pick 1 of 3 upgrades. Boss every 5 waves.",
      "menu.howto.6": "Clearing a wave patches the window back up a bit.",
      "menu.scores.title": "Records",
      "menu.scores.line": "{score} pts · wave {wave}",
      "menu.scores.no_profile": "Create a profile to save records!",
      "menu.scores.empty_default": "No data yet — play and set a record!",
      "menu.scores.loading": "Loading online leaderboard…",
      "menu.scores.empty_online": "No online scores for this difficulty yet.",
      "menu.scores.online_title": "Online leaderboard — {diff}",
      "menu.stats.title": "Stats",
      "menu.stats.games": "Games",
      "menu.stats.kills": "Kills",
      "menu.stats.best_wave": "Best wave",
      "menu.stats.total_score": "Total score",
      "menu.stats.time": "Total time",
      "menu.stats.minutes": "{n} min",
      "menu.diff.chill": "Chill",
      "menu.diff.normal": "Normal",
      "menu.diff.hard": "Brutal",
      /* ----- hub nav (clean landing: icon buttons open panels) ----- */
      "menu.hub.shop": "Shop",
      "menu.hub.ach": "Achievements",
      "menu.hub.daily": "Daily",
      "menu.hub.stats": "Stats",
      "menu.hub.settings": "Settings",
      "menu.hub.howto": "How to play",
      "menu.hub.close": "Close",
      "menu.hub.nav": "Control panel",
      "menu.hub.difficulty": "Difficulty",
      "menu.footer_made": "A fan-made game inspired by <b>Windowkill</b> (Steam) — not affiliated with the original developer.",
      "menu.footer_dev": "Developed by <b>FU-DEVER</b> — Programming Club, FPT University Da Nang &bull; WORK HARD — PLAY HARD",
      "menu.footer_vercel": "Play on Vercel",
      /* ----- settings ----- */
      "settings.title": "Settings",
      "settings.music": "Music",
      "settings.music_aria": "Toggle music",
      "settings.sfx": "Sound effects",
      "settings.sfx_aria": "Toggle sound effects",
      "settings.shake": "Shake window on hit",
      "settings.shake_aria": "Toggle window shake",
      "settings.haptic": "Haptic feedback (mobile)",
      "settings.haptic_aria": "Toggle haptics",
      "settings.difficulty": "Difficulty",
      "settings.fx": "Visual effects",
      "settings.fx_full": "Full",
      "settings.fx_reduced": "Reduced",
      "settings.quality": "Quality",
      "settings.quality_auto": "Auto",
      "settings.quality_high": "High",
      "settings.quality_balanced": "Balanced",
      "settings.quality_lite": "Lite",
      "settings.sat": "Satellite windows",
      "settings.sat_auto": "Auto",
      "settings.sat_sim": "Always simulate",
      "settings.sat_off": "Off",
      "settings.wjump": "Window Jump",
      "settings.wjump_calm": "Calm",
      "settings.wjump_normal": "Normal",
      "settings.wjump_wild": "Wild",
      "settings.analytics": "Anonymous stats (no cookies)",
      "settings.analytics_aria": "Toggle anonymous stats",
      "settings.analytics_title": "Send anonymous stats to help improve the game. No cookies, no fingerprinting, respects Do-Not-Track.",
      "settings.language": "Language",
      /* ----- error ----- */
      "error.popup_blocked": "Your browser is <b>blocking popups</b>. Allow popups for this page (the <svg class=\"ic\" aria-hidden=\"true\"><use href=\"#i-lock\"/></svg> icon in the address bar), then hit Play again.",
      "error.resize_blocked": "Browser blocked window resize — using a virtual arena",
      "error.popup_blocked_game": "Browser blocked popups — the game still runs with full mechanics!",
      "error.sim_title": "Using simulated windows",
      /* ----- HUD ----- */
      "hud.window_pct": "{pct}% INTACT",
      "hud.shield_sim": "SHIELD \u00d7{hearts}",
      "hud.shield_popup": "SHIELD {px}px",
      "hud.magnet": "MAGNET {s}s",
      "hud.overdrive": "OD {s}s",
      "hud.chip_magnet_aria": "Magnet: {s}s left",
      "hud.chip_overdrive_aria": "Overdrive: {s}s left",
      "hud.chip_shield_aria": "Shield: {s}s left",
      "hud.chip_winshield_aria": "Window shield",
      "hud.controls": "WASD move · mouse aim · hold to shoot · shoot the edge to shove the window! (P: pause)",
      "hud.controls_mobile": "Left stick: move · right: aim+shoot",
      "hud.chew_window": "Chewing the edge!",
      "hud.chew_shield": "Chewing the shield!",
      /* ----- pause ----- */
      "pause.title": "Paused",
      "pause.resume": "Resume",
      "pause.retry": "Restart",
      "pause.quit": "Quit to menu",
      "pause.hint": "P / Esc: resume · M: toggle music",
      "pause.hint_mobile": "Tap ⏸ to resume", // MOBILE 2026-10-03
      "pause.aria": "Pause",
      "pause.full_aria": "Fullscreen",
      /* ----- draft ----- */
      "draft.title": "LEVEL UP! Pick 1 upgrade",
      "draft.cine_title": "LEVEL UP",
      "draft.pick_one": "Pick 1 upgrade",
      "draft.hint": "Press 1 / 2 / 3 for quick pick",
      "draft.aria": "Upgrade: {name}",
      "draft.fallback_name": "Upgrade {n}",
      "draft.patch_title": "PATCH THE WINDOW",
      "draft.patch_sub": "Pick 1 glass shard",
      "draft.patch_aria": "Patch shard: {name}",
      /* ----- game over ----- */
      "game.title": "WINDOWKILL: Web Edition — Battlefield",
      "game.hud_pause_aria": "Pause",
      "game.hud_full_aria": "Fullscreen",
      "game.hud_menu_aria": "Game menu",
      "game.hud_menu_pause": "Pause",
      "game.hud_menu_full": "Fullscreen",
      "game.hud_menu_quit": "Quit to menu",
      "gameover.title_default": "GAME OVER",
      "gameover.title_ship": "Ship destroyed!",
      "gameover.title_window": "WINDOW SHATTERED!",
      "gameover.tip_ship": "You got swarmed. Next time, keep more distance.",
      "gameover.tip_window": "The purple ones chewed through the edge. Take them out first next time.",
      "gameover.score_line": "{score} pts · Wave {wave}",
      "gameover.stats": "{kills} kills · <svg class=\"ic\" aria-hidden=\"true\"><use href=\"#i-levelup\"/></svg> level {level} · <svg class=\"ic\" aria-hidden=\"true\"><use href=\"#i-clock\"/></svg> {time}s · {diff}",
      "gameover.new_record": "New record!",
      "gameover.retry": "PATCH UP & PLAY AGAIN (R)",
      "gameover.retry_hint": "Play again (R)",
      "gameover.menu": "Back to menu",
      /* ----- desktop CTA (web→desktop funnel) ----- */
      "cta.launcher_title": "Desktop Edition",
      "cta.launcher_sub": "Real windows, no simulation",
      "cta.gameover_text": "This window is just a simulation. Experience REAL windows on Desktop →",
      "cta.gameover_btn": "Get Desktop",
      "cta.toast_text": "Desktop build: real windows!",
      /* ----- PWA install prompt (feat/pwa-trailer) ----- */
      "pwa.install_title": "Install WINDOWKILL",
      "pwa.install_sub": "Play like a real app — launches fast, works offline, no browser needed",
      "pwa.install_btn": "Install",
      "pwa.install_dismiss": "Dismiss",
      "pwa.ios_title": "Add to Home Screen",
      "pwa.ios_steps": "Open the <b>Share</b> menu, then tap <b>Add to Home Screen</b> to install",
      "pwa.ios_btn": "Got it",
      /* ----- satellite permission ----- */
      "satperm.text": "This level has satellite windows — allow them?",
      "satperm.allow": "Allow",
      "satperm.single": "Play single-window",
      /* ----- PWA update (toast when SW detects a new version) ----- */
      "pwa.update_text": "New version available — click to reload",
      "pwa.update_aria": "Reload to get the new version",
    }
  };

  /* Từ điển nội dung game (upgrades / monsters / banner / pickups / satellites).
     Các key này do game.js + cinema.js dùng. Team khác có thể override/mở rộng
     qua I18N.register() — xem INTEGRATION.md. */
  var GAME = {
    vi: {
      /* ----- 12 nâng cấp draft ----- */
      "upg.firerate.name": "Tốc bắn +30%",
      "upg.firerate.desc": "Xả đạn nhanh hơn.",
      "upg.streams.name": "+1 tia đạn",
      "upg.streams.desc": "Bắn thêm một tia (tối đa 4).",
      "upg.damage.name": "Sát thương +1",
      "upg.damage.desc": "Mỗi viên đạn đau hơn.",
      "upg.speed.name": "Tốc độ +18%",
      "upg.speed.desc": "Tàu lanh lẹ hơn.",
      "upg.hp.name": "+1 máu & hồi 1",
      "upg.hp.desc": "Tăng máu tối đa, hồi ngay 1 tim.",
      "upg.pierce.name": "Đạn xuyên +1",
      "upg.pierce.desc": "Đạn bay xuyên thêm quái.",
      "upg.magnet.name": "Nam châm +60%",
      "upg.magnet.desc": "Hút gem từ xa hơn.",
      "upg.thorns.name": "Giáp gai",
      "upg.thorns.desc": "Va chạm hất văng quái và gây sát thương.",
      "upg.greed.name": "Tham lam",
      "upg.greed.desc": "Mỗi gem cho thêm +1 XP.",
      "upg.bulletspeed.name": "Đạn siêu tốc",
      "upg.bulletspeed.desc": "+25% tốc độ & tầm bay đạn.",
      "upg.luck.name": "May mắn",
      "upg.luck.desc": "+50% tỉ lệ rớt vật phẩm.",
      "upg.ice.name": "Đạn băng",
      "upg.ice.desc": "Quái trúng đạn bị làm chậm 1.5s.",
      /* ----- quái (10 loại hiện tại) ----- */
      "monster.chaser.name": "Truy Đuổi",
      "monster.chaser.desc": "Lao thẳng vào tàu.",
      "monster.chewer.name": "Gặm Viền",
      "monster.chewer.desc": "Bám viền, gặm nhỏ cửa sổ.",
      "monster.tank.name": "Xe Tăng",
      "monster.tank.desc": "Trâu, chậm, rớt 3 gem.",
      "monster.dasher.name": "Lao Tới",
      "monster.dasher.desc": "stalk -> aim (telegraph) -> dash.",
      "monster.splitter.name": "Phân Thân",
      "monster.splitter.desc": "Chết đẻ 2 mini.",
      "monster.mini.name": "Mini",
      "monster.mini.desc": "Chỉ sinh từ splitter.",
      "monster.weaver.name": "Dệt Lưới",
      "monster.weaver.desc": "Zigzag biên độ lớn, khó ngắm.",
      "monster.spitter.name": "Phun Độc",
      "monster.spitter.desc": "Giữ khoảng cách, bắn đạn tầm xa.",
      "monster.healer.name": "Hồi Phục",
      "monster.healer.desc": "Hồi máu quái khác, không tấn công.",
      "monster.kamikaze.name": "Cảm Tử",
      "monster.kamikaze.desc": "Lao vào viền cửa sổ rồi tự nổ.",
      /* ----- Season 1 "Mùa Deadline" ----- */
      "monster.deadline.name": "Deadline Dí",
      "monster.deadline.desc": "Đếm ngược 12s — hạ nó trước khi chuông reo!",
      "monster.otworker.name": "Nhân Viên OT",
      "monster.otworker.desc": "Càng sống lâu càng cáu: +tốc, +dame. Đạn băng cho nó nghỉ ngơi.",
      "monster.meeting.name": "Kẻ Họp Hành",
      "monster.meeting.desc": "Tỏa vùng họp làm chậm tàu. Đứng ngoài, bắn từ xa.",
      "season.bell_ring": "RENG RENG! Cả team bị dí!",
      "season.rage_up": "Cáu +1!",
      "season.rage_reset": "Nghỉ ngơi!",
      "season.summon": "Triệu tập họp!",
      "season.in_meeting": "Họp hành làm chậm tiến độ!",
      /* ----- Variety Pack 1 ----- */
      "monster.shipper.name": "Shipper Gem",
      "monster.shipper.desc": "Ôm 15 gem chạy lêu lêu khắp map. Đón đầu lúc nó thấm mệt!",
      "monster.director.name": "Đạo Diễn Sóng",
      "monster.director.desc": "Hô 'ACTION!' rồi roll modifier vui cả wave. Giết được 'CẮT! +100'.",
      "vp1.director.debut": "ĐẠO DIỄN SÓNG xuất hiện!",
      "vp1.director.cut": "CẮT! +100",
      "vp1.mod.gemrain.name": "Mưa Gem",
      "vp1.mod.gemrain.desc": "Tỉ lệ rớt gem ×2 cả wave!",
      "vp1.mod.tiny.name": "Quái Tí Hon",
      "vp1.mod.tiny.desc": "Quái nhỏ 55%, nhanh hơn chút nhưng yếu hơn!",
      "vp1.mod.xpturbo.name": "XP Turbo",
      "vp1.mod.xpturbo.desc": "XP ×2 — lên cấp vù vù!",
      "vp1.mod.tailwind.name": "Tàu Lướt Gió",
      "vp1.mod.tailwind.desc": "Tàu nhanh +20%, lái phê như lướt!",
      "vp1.mod.starbullets.name": "Đạn Sao",
      "vp1.mod.starbullets.desc": "Đạn hình sao, xuyên +1!",
      "vp1.mod.slowopen.name": "Khai Mạc Chậm",
      "vp1.mod.slowopen.desc": "12s đầu wave quái chậm lại, khởi đầu thư thái!",
      "vp1.mod.glowparty.name": "Quái Phát Sáng",
      "vp1.mod.glowparty.desc": "Mỗi kill +1 gem — quái nào cũng thành heo đất!",
      "vp1.mod.gemmagnet.name": "Nam Châm Gem",
      "vp1.mod.gemmagnet.desc": "Bán kính hút gem ×3!",
      "vp1.mod.djparty.name": "DJ Quẩy",
      "vp1.mod.djparty.desc": "Cả map nhảy disco theo nhịp!",
      "vp1.mod.hullinsurance.name": "Bảo Hiểm Vỏ",
      "vp1.mod.hullinsurance.desc": "Cuối wave vá thêm +30px cửa sổ!",
      "vp1.mod.payday.name": "Ngày Lương",
      "vp1.mod.payday.desc": "Tỉ lệ rớt pickup ×2!",
      "vp1.mod.fireworks.name": "Pháo Hoa",
      "vp1.mod.fireworks.desc": "Mỗi kill nổ pháo hoa rực rỡ!",
      /* ----- Endless Delight (wave 30+, 2026-10-04): 5 modifier vui + event combo + Victory Lap ----- */
      "vp1.mod.discobullets.name": "Đạn Disco",
      "vp1.mod.discobullets.desc": "Đạn đổi màu cầu vồng theo nhạc — bắn cho vui mắt!",
      "vp1.mod.confetti.name": "Pháo Giấy",
      "vp1.mod.confetti.desc": "Mỗi quái hạ nổ tung giấy màu ăn mừng!",
      "vp1.mod.luckypickup.name": "Nam Châm May Mắn",
      "vp1.mod.luckypickup.desc": "Vật phẩm rơi tự trôi về phía tàu!",
      "vp1.mod.boingyship.name": "Tàu Nảy Tưng",
      "vp1.mod.boingyship.desc": "Tàu nhún nhảy squash-and-stretch cực cưng!",
      "vp1.mod.giggle.name": "Quái Cười Khành Khạch",
      "vp1.mod.giggle.desc": "Quái rung lắc cười vui + nổ 'boing' khi hạ!",
      "vp1.event.goldrush.banner": "MƯA VÀNG! Sao băng rơi, gem ×2!",
      "vp1.event.neonblackout.banner": "TẮT ĐÈN NEON! Quẩy trong bóng tối!",
      "vp1.victory.banner": "VICTORY LAP — WAVE {n}!",
      "vp1.victory.sub": "Chúc mừng 10 wave! Mưa gem + pháo hoa ăn mừng!",
      "vp1.event.breather.banner": "THỞ ĐI~",
      "vp1.event.meteor.banner": "ƯỚC ĐI! Mưa sao băng tới!",
      "vp1.event.blackout.banner": "TẮT ĐÈN QUẨY!",
      "vp1.event.golden.banner": "GIỜ VÀNG RỰC RỠ!",
      /* ----- Item 6: retune wave 15–30 (spotlight + cap banner) ----- */
      "vp1.cap.banner": "SẮP CÓ THÊM QUÁI!",
      "vp1.spotlight.elite.banner": "DIỄU HÀNH TINH ANH!",
      "vp1.spotlight.elite.sub": "Quái nặng đô diễu hành — rớt thêm gem, không khó hơn!",
      "vp1.spotlight.double.banner": "TỔNG DUYỆT!",
      "vp1.spotlight.golden.sub": "GIỜ VÀNG tri ân — gem ×2 giá trị cả wave!",
      /* ----- banner wave (§12.4) ----- */
      "banner.wave1": "Bắn quái tím trước — chúng gặm cửa sổ!",
      "banner.tip1": "Quái tím gặm viền cửa sổ — bắn chúng xuống!",
      "banner.tip2": "Bắn vào viền để đẩy cửa sổ bay!",
      "banner.tip3": "Nhặt 💎 lên cấp, chọn nâng cấp!",
      "banner.tip4": "Giữ khoảng cách với quái vàng — nó lao tới!",
      "banner.act_sub_1": "Lưới neon — bắn quái tím trước, chúng gặm cửa sổ!",
      "banner.act_sub_2": "Hư không sâu — coi chừng quái bắn xa và cảm tử!",
      "banner.act_sub_3": "Lõi vỡ — tổng lực! Giữ cửa sổ sống sót.",
      "banner.boss_sub": "Nó nện cửa sổ — giữ cửa sổ sống sót!",
      "banner.wave_clear_sub": "Cửa sổ được vá lại +40px",
      "banner.next_boss": "Boss hạ! Chuẩn bị wave tiếp theo…",
      "banner.next": "Chuẩn bị wave tiếp theo…",
      "banner.score_tip": "⭐ Điểm = tổng điểm gốc — không nhân.",
      "banner.patch": "🪟 +vá cửa sổ!",
      "banner.boss_down": "BOSS HẠ! +{pts}",
      /* ----- boss personality (feat/boss-personality): tên + telegraph VI/EN ----- */
      "boss.w5.name": "GÃ GẶM KHỔNG LỒ",
      "boss.w5.tele": "Nó đang đói bụng… chomp chomp!",
      "boss.w10.name": "SẾP DÍ DEADLINE",
      "boss.w10.tele": "DEADLINE DÍ TỚI! Nộp bài ngay!",
      "boss.w15.name": "DJ QUẨY",
      "boss.w15.tele": "Nhạc lên! DJ quẩy theo nhịp!",
      "boss.w20.name": "THẦN CHẾT BỊ CẢM",
      "boss.w20.tele": "Hắt xì… coi chừng đạn bắn ra!",
      "boss.w25.name": "ÔNG HOÀNG TRUNG TÂM",
      "boss.w25.tele": "Giờ nghỉ trà… nhưng ổng vẫn đánh!",
      "boss.w30.name": "TRÙM CUỐI CÀ KHỊA",
      "boss.w30.tele": "Trùm cuối xuất hiện — coi chừng bị cà khịa!",
      "boss.w10.papers": "NỘP BÀI!",
      "boss.w15.quay": "QUẨY!",
      "boss.w20.sneeze": "ẮT XÌ!",
      "boss.w25.yawn": "ngáp…",
      "boss.w30.taunt1": "yếu thế!",
      "boss.w30.taunt2": "bắt được ta không!",
      "boss.w30.taunt3": "haha, hụt rồi!",
      /* ----- v2.0: campaign / tutorial / meta (launcher + game) ----- */
      "campaign.title": "Chiến dịch",
      "campaign.free": "Chơi tự do",
      "campaign.free_desc": "Endless như cũ, boss mỗi 5 wave",
      "campaign.stage": "Ải",
      "campaign.locked_hint": "Phá đảo ải trước để mở",
      "campaign.wave": "ẢI {stage} — WAVE {n}",
      "campaign.stage_unlocked": "Đã mở ải mới: {name}!",
      "campaign.endless_unlocked": "Đã mở CHẾ ĐỘ VÔ TẬN!",
      "campaign.stage_clear": "Hoàn thành ải {n}!",
      "campaign.boss_banner_title_1": "⚠ BOSS: GÃ GẶM KHỔNG LỒ",
      "campaign.boss_banner_sub_1": "Nó nện cửa sổ — giữ 🪟 sống sót!",
      "campaign.boss_banner_title_2": "⚠ BOSS: TƯỜNG LỬA SỐNG",
      "campaign.boss_banner_sub_2": "Gai tắt 2.5s sau mỗi đợt quét — áp sát!",
      "campaign.boss_banner_title_3": "⚠ BOSS: TRỌNG TÂM HỖN LOẠN",
      "campaign.boss_banner_sub_3": "Ngừng bắn lúc hút — dồn đạn lúc quá tải!",
      "campaign.boss_banner_title_4": "⚠ BOSS: MÀN ĐÊM VÔ TẬN",
      "campaign.boss_banner_sub_4": "Bắn vào con ngươi lúc nó sáng rực!",
      "campaign.boss_banner_title_5": "⚠ BOSS CUỐI: NULL POINTER",
      "campaign.boss_banner_sub_5": "20 giây. Giết nó trước khi cửa sổ về 0!",
      "campaign.endless_banner_0": "Vùng ven",
      "campaign.endless_banner_1": "Tâm bão",
      "campaign.endless_banner_2": "Lõi hệ thống",
      "campaign.endless_banner_3": "Vực sâu",
      "campaign.endless_banner_4": "Vô định",
      "tutorial.replay": "Chơi lại hướng dẫn",
      "tutorial.modal_title": "Học chơi trong 2 phút?",
      "tutorial.modal_desc": "Hướng dẫn tương tác ngay trong game: di chuyển, bắn, nhặt gem, chọn nâng cấp.",
      "tutorial.modal_yes": "Học chơi",
      "tutorial.modal_no": "Chơi luôn",
      "menu.lang": "Ngôn ngữ / Language",
      "meta.workshop": "Xưởng",
      "meta.achievements": "Thành tựu",
      "meta.daily_play": "Chơi Daily",
      "meta.daily_banner": "⚡ DAILY: {m1} · {m2}",
      "meta.daily_best": "Kỷ lục hôm nay",
      "meta.shards": "Mảnh Kính",
      "meta.emergency": "Sửa khẩn cấp",
      /* ----- pickup floats ----- */
      "pickup.shield_6s": "Khiên 6s!",
      "pickup.magnet_8s": "HÚT GEM 8s!",
      "pickup.shield_refilled": "Khiên hồi đầy!",
      "pickup.shield_broken": "Khiên vỡ rồi!",
      "pickup.shield_banner": "Khiên cửa sổ! Quái sẽ gặm nó thay bạn.",
      /* ----- combat floats ----- */
      "combat.boom": "BÙM! -cửa sổ",
      "combat.slam": "RẦM!!",
      "combat.knockback": "Hất văng!",
      "combat.kamikaze_warn": "SẮP NỔ!",
      /* ----- cửa sổ vệ tinh (satellite) ----- */
      "sat.generic": "VỆ TINH",
      "sat.sim_badge": "mô phỏng",
      "sat.click_break": "BẤM ĐỂ PHÁ!",
      "sat.nest_label": "Ổ QUÁI",
      "sat.nest_spawn": "Ổ quái xuất hiện! Bấm vào cửa sổ tím để phá.",
      "sat.nest_burst": "Ổ VỠ! Quái tràn ra!",
      "sat.nest_killed": "Ổ quái bị phá!",
      "sat.nest_released": "Ổ nhả quái!",
      "sat.shield_label": "KHIÊN",
      "sat.debris_label": "MẢNH VỠ",
      "sat.debris_spawn": "Mảnh vỡ lao tới! Bấm để phá hủy.",
      "sat.debris_hit": "Mảnh vỡ đâm cửa sổ!",
      "sat.bomb_label": "BOM NÓNG",
      "sat.bomb_spawn": "💣 Bom nóng xuất hiện! Phá trong 15s — đóng tay là nổ ngay!",
      "sat.bomb_tick": "BOM NỔ! Đóng tay = ăn đòn!",
      "sat.bomb_boom": "BÙM! Bom nổ tung!",
      "sat.bomb_killed": "Phá bom! +2 💎 +500",
      "sat.bomb_telegraph": "PHÁ TÔI ĐI! BỐP!",
      "sat.giant_label": "NHÓC TINH NGHỊCH",
      "sat.giant_split_angry": "BỐP! Tách đôi — CẢ 2 NỔI GIẬN!",
      "sat.giant_split": "BỐP! Tách thành 2 nhóc!",
      "sat.giant_enraged": "Nhóc còn lại NỔI GIẬN 12s!",
      "sat.giant_caught": "Cả 2 nhóc bị bắt! +❤️ +2💎",
      "sat.giant_big_label": "KHỔNG LỒ VUI VẺ",
      "sat.giant_big_spawn": "Khổng lồ vui vẻ xuất hiện! Phá nó… nhưng coi chừng tách đôi!",
      "sat.giant_idle": "HIHI! BẮT TÔI ĐI!",
      "sat.giant_angry": "NỔI GIẬN!",
      "sat.mother_label": "MẸ GÀ",
      "sat.mother_spawn": "Mẹ gà đẻ trứng vàng! Phá mẹ trước khi đàn con đông!",
      "sat.mother_lay": "Mẹ gà đẻ trứng!",
      "sat.mother_lay_telegraph": "CỤC TÁC! ĐẺ TRỨNG!",
      "sat.chick_label": "GÀ CON",
      "sat.chick_enraged": "MẤT MẸ! Gà con nổi giận!",
      "sat.chick_manual": "Mẹ bị đóng tay! Gà con nổi giận!",
      "sat.chick_dead": "Gà con nổ tung!",
      "sat.chick_calm": "Gà con nguôi giận 💎",
      "sat.chick_angry": "GIẬN MẤT MẸ!",
      "sat.chick_idle": "CHÍP CHÍP!",
      "sat.love_label": "SIÊU TÌNH YÊU",
      "sat.love_spawn": "💘 SIÊU-POPUP 10 HP! Nó bắn tim độc — phá ngay!",
      "sat.love_broken": "💖 Tình yêu tan vỡ! +4💎 +80",
      "sat.love_manual": "💔 Đóng tay = ăn 3 tim độc!",
      "sat.love_boom": "⚡ BÙM! TÌNH YÊU SÉT ĐÁNH! ⚡",
      "sat.love_telegraph": "⚡ SIÊU TÌNH YÊU 10HP! ⚡",
      "sat.love_pair": "💘 2 cửa sổ đang yêu nhau! Phá trước khi chúng hợp nhất!",
      "sat.love_pair_status": "💘 ĐANG YÊU",
      "sat.love_crush": "💘 say nắng!",
      "sat.love_crush_status": "say nắng",
      "sat.love_lonely": "💔 cô đơn quá…",
      "sat.love_revenge": "💔 trả thù!",
      "sat.love_heartbroken": "💔 THẤT TÌNH! Nó nổi giận!",
      "sat.love_big_heartbroken": "💔 THẤT TÌNH! TRẢ THÙ!",
      "sat.love_seeking": "💘 ĐI TÌM TÌNH YÊU…",
      "sat.mirror_label": "🪞 GƯƠNG THẦN",
      "sat.mirror_zone": "🪞 VÙNG GƯƠNG",
      "sat.mirror_spawn": "🪞 Gương thần xuất hiện! ĐỪNG bắn vào vùng gương!",
      "sat.mirror_killed": "🪞 Phá gương! +2💎 +60",
      "sat.mirror_broken": "🪞 Gương vỡ! Mảnh bay vào mặt!",
      "sat.mirror_reflect": "Gương phản đạn!",
      "sat.mirror_warn": "ĐỪNG BẮN VÀO GƯƠNG!",
      "sat.vacuum_label": "🌀 MÁY HÚT BỤI",
      "sat.vacuum_zone": "🌀 VÙNG HÚT",
      "sat.vacuum_spawn": "🌀 Máy hút bụi vũ trụ! Nó hút quái… rồi nhả ra giận dữ!",
      "sat.vacuum_release": "Máy hút NHẢ quái! Giận x1.6!",
      "sat.vacuum_killed": "Phá máy hút! +{gems}💎 +{pts}",
      "sat.vacuum_killed_simple": "Phá máy hút! +40",
      "sat.vacuum_manual": "Đóng tay! Máy hút ho ra hết!",
      "sat.vacuum_suck": "Hút!",
      "sat.vacuum_gem": "Hố đen nuốt gem!",
      "sat.vacuum_count": "ĐÃ HÚT: {n} — SẮP NHẢ!",
      "sat.bossfrag_label": "MẢNH KÍNH",
      "sat.bossfrag_spawn": "Boss đập vỡ cửa sổ! Bắn vỡ mảnh kính trước khi chúng đâm vào viền!",
      "sat.bossfrag_bite": "RẮC! Mảnh kính đâm vào viền!",
      "sat.bossfrag_break": "Vỡ kính! +5",
      "sat.bossfrag_catch": "Bắt được mảnh kính! +3",
      /* ----- juice / cinema (team Juice sở hữu — key pre-seed, họ override được) ----- */
      "juice.wave_default": "Tiêu diệt tất cả!",
      "juice.combo_lost": "Combo mất!",
      "juice.warn": "CẢNH BÁO",
      "juice.boss_down": "BOSS BỊ HẠ!",
      "juice.shard_float": "+{n} Mảnh Kính",
      "juice.shard_float2": "+ Mảnh Kính",
      "juice.pickup_shield": "Khiên!",
      "juice.level_up": "LÊN CẤP {level}!", /* FIX 2026-10-04 "LÊN CẤP undefined!": banner qua i18n + guard số */
    },
    en: {
      /* ----- 12 draft upgrades ----- */
      "upg.firerate.name": "Fire rate +30%",
      "upg.firerate.desc": "Shoot faster.",
      "upg.streams.name": "+1 bullet stream",
      "upg.streams.desc": "Fire an extra stream (max 4).",
      "upg.damage.name": "Damage +1",
      "upg.damage.desc": "Every bullet hits harder.",
      "upg.speed.name": "Speed +18%",
      "upg.speed.desc": "A nippier ship.",
      "upg.hp.name": "+1 max HP & heal 1",
      "upg.hp.desc": "Raise max HP and heal 1 heart right away.",
      "upg.pierce.name": "Pierce +1",
      "upg.pierce.desc": "Bullets pierce one more monster.",
      "upg.magnet.name": "Magnet +60%",
      "upg.magnet.desc": "Pull gems from farther away.",
      "upg.thorns.name": "Spiky armor",
      "upg.thorns.desc": "Collisions knock monsters back and hurt them.",
      "upg.greed.name": "Greed",
      "upg.greed.desc": "Each gem gives +1 more XP.",
      "upg.bulletspeed.name": "Hyper bullets",
      "upg.bulletspeed.desc": "+25% bullet speed & range.",
      "upg.luck.name": "Luck",
      "upg.luck.desc": "+50% item drop rate.",
      "upg.ice.name": "Ice bullets",
      "upg.ice.desc": "Hit monsters are slowed for 1.5s.",
      /* ----- monsters ----- */
      "monster.chaser.name": "Chaser",
      "monster.chaser.desc": "Charges straight at your ship.",
      "monster.chewer.name": "Edge Chewer",
      "monster.chewer.desc": "Latches onto the edge and chews the window smaller.",
      "monster.tank.name": "Tank",
      "monster.tank.desc": "Tanky, slow, drops 3 gems.",
      "monster.dasher.name": "Dasher",
      "monster.dasher.desc": "stalk -> aim (telegraph) -> dash.",
      "monster.splitter.name": "Splitter",
      "monster.splitter.desc": "Splits into 2 minis on death.",
      "monster.mini.name": "Mini",
      "monster.mini.desc": "Only spawns from a splitter.",
      "monster.weaver.name": "Weaver",
      "monster.weaver.desc": "Wide zigzags, hard to aim at.",
      "monster.spitter.name": "Spitter",
      "monster.spitter.desc": "Keeps its distance, fires long-range shots.",
      "monster.healer.name": "Healer",
      "monster.healer.desc": "Heals other monsters, doesn't attack.",
      "monster.kamikaze.name": "Kamikaze",
      "monster.kamikaze.desc": "Dives into the window edge, then explodes.",
      /* ----- Season 1 "Deadline Season" ----- */
      "monster.deadline.name": "Deadline Chaser",
      "monster.deadline.desc": "12s countdown — kill it before the bell rings!",
      "monster.otworker.name": "OT Worker",
      "monster.otworker.desc": "The longer it lives, the angrier: +speed, +damage. Ice bullets give it a break.",
      "monster.meeting.name": "Meeting Goblin",
      "monster.meeting.desc": "Emits a meeting zone that slows your ship. Stay out, shoot from afar.",
      "season.bell_ring": "RING RING! The whole team is rushed!",
      "season.rage_up": "Anger +1!",
      "season.rage_reset": "Break time!",
      "season.summon": "Meeting summoned!",
      "season.in_meeting": "Meetings slow everything down!",
      /* ----- Variety Pack 1 ----- */
      "monster.shipper.name": "Gem Courier",
      "monster.shipper.desc": "Carries 15 gems and taunts you. Catch it when it's tired!",
      "monster.director.name": "Wave Director",
      "monster.director.desc": "Shouts 'ACTION!' then rolls a fun wave modifier. Kill for 'CUT! +100'.",
      "vp1.director.debut": "WAVE DIRECTOR appears!",
      "vp1.director.cut": "CUT! +100",
      "vp1.mod.gemrain.name": "Gem Rain",
      "vp1.mod.gemrain.desc": "2× gem drop rate all wave!",
      "vp1.mod.tiny.name": "Tiny Terrors",
      "vp1.mod.tiny.desc": "Smaller monsters, a bit faster but weaker!",
      "vp1.mod.xpturbo.name": "XP Turbo",
      "vp1.mod.xpturbo.desc": "2× XP — level up fast!",
      "vp1.mod.tailwind.name": "Tailwind",
      "vp1.mod.tailwind.desc": "+20% ship speed!",
      "vp1.mod.starbullets.name": "Star Bullets",
      "vp1.mod.starbullets.desc": "Star-shaped piercing bullets!",
      "vp1.mod.slowopen.name": "Slow-Mo Opening",
      "vp1.mod.slowopen.desc": "Monsters slowed for the first 12s!",
      "vp1.mod.glowparty.name": "Glow Party",
      "vp1.mod.glowparty.desc": "+1 gem per kill!",
      "vp1.mod.gemmagnet.name": "Gem Magnet",
      "vp1.mod.gemmagnet.desc": "3× gem attract radius!",
      "vp1.mod.djparty.name": "DJ Party",
      "vp1.mod.djparty.desc": "The whole map dances to the beat!",
      "vp1.mod.hullinsurance.name": "Hull Insurance",
      "vp1.mod.hullinsurance.desc": "+30px window repair at wave end!",
      "vp1.mod.payday.name": "Payday",
      "vp1.mod.payday.desc": "2× pickup drop rate!",
      "vp1.mod.fireworks.name": "Fireworks",
      "vp1.mod.fireworks.desc": "Every kill explodes in fireworks!",
      /* ----- Endless Delight (waves 30+, 2026-10-04): 5 fun modifiers + event combos + Victory Lap ----- */
      "vp1.mod.discobullets.name": "Disco Bullets",
      "vp1.mod.discobullets.desc": "Bullets cycle rainbow colors — shoot in style!",
      "vp1.mod.confetti.name": "Confetti Pop",
      "vp1.mod.confetti.desc": "Every kill bursts into celebration confetti!",
      "vp1.mod.luckypickup.name": "Lucky Magnet",
      "vp1.mod.luckypickup.desc": "Dropped pickups drift toward your ship!",
      "vp1.mod.boingyship.name": "Bouncy Ship",
      "vp1.mod.boingyship.desc": "Your ship squashes and stretches adorably!",
      "vp1.mod.giggle.name": "Giggle Horde",
      "vp1.mod.giggle.desc": "Monsters wiggle with laughter + 'boing' on kill!",
      "vp1.event.goldrush.banner": "GOLD RUSH! Meteor shower, 2× gems!",
      "vp1.event.neonblackout.banner": "NEON BLACKOUT! Party in the dark!",
      "vp1.victory.banner": "VICTORY LAP — WAVE {n}!",
      "vp1.victory.sub": "10 more waves down! Gem shower + fireworks!",
      "vp1.event.breather.banner": "TAKE A BREATHER!",
      "vp1.event.meteor.banner": "MAKE A WISH! Meteor shower incoming!",
      "vp1.event.blackout.banner": "LIGHTS-OUT PARTY!",
      "vp1.event.golden.banner": "GOLDEN HOUR!",
      /* ----- Item 6: retune wave 15-30 (spotlight + cap banner) ----- */
      "vp1.cap.banner": "MORE MONSTERS INCOMING!",
      "vp1.spotlight.elite.banner": "ELITE PARADE!",
      "vp1.spotlight.elite.sub": "Heavy monsters on parade — bonus gems, no harder!",
      "vp1.spotlight.double.banner": "FINAL AUDITION!",
      "vp1.spotlight.golden.sub": "Golden hour — 2x gem value all wave!",
      /* ----- wave banners ----- */
      "banner.wave1": "Shoot the purple ones first — they chew the window!",
      "banner.tip1": "Purple monsters chew the window edge — shoot them down!",
      "banner.tip2": "Shoot the edge to shove the window flying!",
      "banner.tip3": "Grab 💎 to level up and pick an upgrade!",
      "banner.tip4": "Keep your distance from the yellow one — it charges!",
      "banner.act_sub_1": "Neon grid — shoot the purple ones first, they chew the window!",
      "banner.act_sub_2": "Deep void — watch out for long-range shooters and kamikazes!",
      "banner.act_sub_3": "Core breach — all out! Keep the window alive.",
      "banner.boss_sub": "It slams the window — keep it alive!",
      "banner.wave_clear_sub": "Window patched +40px",
      "banner.next_boss": "Boss down! Get ready for the next wave…",
      "banner.next": "Get ready for the next wave…",
      "banner.score_tip": "⭐ Score = raw total — no multipliers.",
      "banner.patch": "🪟 +window patched!",
      "banner.boss_down": "BOSS DOWN! +{pts}",
      /* ----- boss personality (feat/boss-personality): names + telegraphs VI/EN ----- */
      "boss.w5.name": "THE GREAT GNOME",
      "boss.w5.tele": "It's hungry… chomp chomp!",
      "boss.w10.name": "THE DEADLINE DASHER",
      "boss.w10.tele": "DEADLINE INCOMING! Submit now!",
      "boss.w15.name": "DJ BOUNCE",
      "boss.w15.tele": "Drop the beat! The DJ bounces to the rhythm!",
      "boss.w20.name": "THE SNIFFLY REAPER",
      "boss.w20.tele": "Achoo… watch out for the shots!",
      "boss.w25.name": "MR. CORE-CHILL",
      "boss.w25.tele": "Tea break… but he still fights!",
      "boss.w30.name": "THE FINAL TEASER",
      "boss.w30.tele": "The final boss arrives — mind the trash talk!",
      "boss.w10.papers": "SUBMIT!",
      "boss.w15.quay": "BOUNCE!",
      "boss.w20.sneeze": "ACHOO!",
      "boss.w25.yawn": "yawn…",
      "boss.w30.taunt1": "too slow!",
      "boss.w30.taunt2": "can't catch me!",
      "boss.w30.taunt3": "haha, missed!",
      /* ----- v2.0: campaign / tutorial / meta (launcher + game) ----- */
      "campaign.title": "Campaign",
      "campaign.free": "Free play",
      "campaign.free_desc": "Classic endless, boss every 5 waves",
      "campaign.stage": "Stage",
      "campaign.locked_hint": "Clear the previous stage to unlock",
      "campaign.wave": "STAGE {stage} — WAVE {n}",
      "campaign.stage_unlocked": "New stage unlocked: {name}!",
      "campaign.endless_unlocked": "ENDLESS MODE unlocked!",
      "campaign.stage_clear": "Stage {n} cleared!",
      "campaign.boss_banner_title_1": "⚠ BOSS: THE COLOSSAL GNAWER",
      "campaign.boss_banner_sub_1": "It slams the window — keep 🪟 alive!",
      "campaign.boss_banner_title_2": "⚠ BOSS: THE LIVING FIREWALL",
      "campaign.boss_banner_sub_2": "Spikes drop 2.5s after each sweep — get close!",
      "campaign.boss_banner_title_3": "⚠ BOSS: CHAOS CORE",
      "campaign.boss_banner_sub_3": "Hold fire while it sucks — burst when it overloads!",
      "campaign.boss_banner_title_4": "⚠ BOSS: ENDLESS NIGHT",
      "campaign.boss_banner_sub_4": "Shoot the pupil when it blazes!",
      "campaign.boss_banner_title_5": "⚠ FINAL BOSS: NULL POINTER",
      "campaign.boss_banner_sub_5": "20 seconds. Kill it before the window hits 0!",
      "campaign.endless_banner_0": "The Fringe",
      "campaign.endless_banner_1": "The Storm's Eye",
      "campaign.endless_banner_2": "System Core",
      "campaign.endless_banner_3": "The Abyss",
      "campaign.endless_banner_4": "The Void",
      "tutorial.replay": "Replay tutorial",
      "tutorial.modal_title": "Learn in 2 minutes?",
      "tutorial.modal_desc": "Interactive in-game tutorial: move, shoot, grab gems, pick upgrades.",
      "tutorial.modal_yes": "Learn",
      "tutorial.modal_no": "Play now",
      "menu.lang": "Ngôn ngữ / Language",
      "meta.workshop": "Workshop",
      "meta.achievements": "Achievements",
      "meta.daily_play": "Play Daily",
      "meta.daily_banner": "⚡ DAILY: {m1} · {m2}",
      "meta.daily_best": "Today's best",
      "meta.shards": "Mảnh Kính",
      "meta.emergency": "Emergency repair",
      /* ----- pickup floats ----- */
      "pickup.shield_6s": "Shield 6s!",
      "pickup.magnet_8s": "GEM MAGNET 8s!",
      "pickup.shield_refilled": "Shield fully recharged!",
      "pickup.shield_broken": "Shield broken!",
      "pickup.shield_banner": "Window shield! Monsters will chew it instead of you.",
      /* ----- combat floats ----- */
      "combat.boom": "BOOM! -window",
      "combat.slam": "WHAM!!",
      "combat.knockback": "Knocked back!",
      "combat.kamikaze_warn": "ABOUT TO BLOW!",
      /* ----- satellite windows ----- */
      "sat.generic": "SATELLITE",
      "sat.sim_badge": "simulated",
      "sat.click_break": "CLICK TO SMASH!",
      "sat.nest_label": "NEST",
      "sat.nest_spawn": "A nest appeared! Click the purple window to smash it.",
      "sat.nest_burst": "NEST BURST! Monsters pour out!",
      "sat.nest_killed": "Nest smashed!",
      "sat.nest_released": "The nest releases monsters!",
      "sat.shield_label": "SHIELD",
      "sat.debris_label": "DEBRIS",
      "sat.debris_spawn": "Debris incoming! Click to destroy.",
      "sat.debris_hit": "Debris hit the window!",
      "sat.bomb_label": "HOT BOMB",
      "sat.bomb_spawn": "💣 Hot bomb incoming! Smash it in 15s — closing it manually sets it off!",
      "sat.bomb_tick": "BOMB ARMED! Closing it = you take the hit!",
      "sat.bomb_boom": "BOOM! The bomb exploded!",
      "sat.bomb_killed": "Bomb defused! +2 💎 +500",
      "sat.bomb_telegraph": "SMASH ME! POP!",
      "sat.giant_label": "RASCAL",
      "sat.giant_split_angry": "POP! It splits — BOTH ARE FURIOUS!",
      "sat.giant_split": "POP! It splits into 2 rascals!",
      "sat.giant_enraged": "The remaining rascal is FURIOUS for 12s!",
      "sat.giant_caught": "Both rascals caught! +❤️ +2💎",
      "sat.giant_big_label": "JOLLY GIANT",
      "sat.giant_big_spawn": "A jolly giant appears! Smash it… but watch out, it splits!",
      "sat.giant_idle": "HEHE! CATCH ME!",
      "sat.giant_angry": "FURIOUS!",
      "sat.mother_label": "MOTHER HEN",
      "sat.mother_spawn": "Mother hen lays golden eggs! Smash her before the chicks multiply!",
      "sat.mother_lay": "Mother hen lays an egg!",
      "sat.mother_lay_telegraph": "CLUCK! LAYING EGGS!",
      "sat.chick_label": "CHICK",
      "sat.chick_enraged": "MAMA'S GONE! The chick is furious!",
      "sat.chick_manual": "Mama was closed manually! The chick is furious!",
      "sat.chick_dead": "The chick exploded!",
      "sat.chick_calm": "The chick calms down 💎",
      "sat.chick_angry": "MAMA-RAGE!",
      "sat.chick_idle": "CHEEP CHEEP!",
      "sat.love_label": "MEGA LOVE",
      "sat.love_spawn": "💘 MEGA-POPUP 10 HP! It shoots poison hearts — smash it now!",
      "sat.love_broken": "💖 Love shattered! +4💎 +80",
      "sat.love_manual": "💔 Closing it manually = 3 poison hearts!",
      "sat.love_boom": "⚡ BOOM! LOVE STRIKES! ⚡",
      "sat.love_telegraph": "⚡ MEGA LOVE 10HP! ⚡",
      "sat.love_pair": "💘 2 windows are in love! Smash them before they merge!",
      "sat.love_pair_status": "💘 IN LOVE",
      "sat.love_crush": "💘 smitten!",
      "sat.love_crush_status": "smitten",
      "sat.love_lonely": "💔 so lonely…",
      "sat.love_revenge": "💔 revenge!",
      "sat.love_heartbroken": "💔 HEARTBROKEN! It's furious!",
      "sat.love_big_heartbroken": "💔 HEARTBROKEN! REVENGE!",
      "sat.love_seeking": "💘 LOOKING FOR LOVE…",
      "sat.mirror_label": "🪞 MAGIC MIRROR",
      "sat.mirror_zone": "🪞 MIRROR ZONE",
      "sat.mirror_spawn": "🪞 A magic mirror appears! DON'T shoot into the mirror zone!",
      "sat.mirror_killed": "🪞 Mirror smashed! +2💎 +60",
      "sat.mirror_broken": "🪞 Mirror shattered! Shards everywhere!",
      "sat.mirror_reflect": "The mirror reflects bullets!",
      "sat.mirror_warn": "DON'T SHOOT THE MIRROR!",
      "sat.vacuum_label": "🌀 VACUUM",
      "sat.vacuum_zone": "🌀 SUCTION ZONE",
      "sat.vacuum_spawn": "🌀 Cosmic vacuum! It sucks monsters in… then spits them out furious!",
      "sat.vacuum_release": "Vacuum SPITS monsters out! 1.6x fury!",
      "sat.vacuum_killed": "Vacuum smashed! +{gems}💎 +{pts}",
      "sat.vacuum_killed_simple": "Vacuum smashed! +40",
      "sat.vacuum_manual": "Closed manually! The vacuum coughs everything out!",
      "sat.vacuum_suck": "Suck!",
      "sat.vacuum_gem": "The black hole swallowed a gem!",
      "sat.vacuum_count": "SUCKED: {n} — ABOUT TO SPIT!",
      "sat.bossfrag_label": "GLASS SHARD",
      "sat.bossfrag_spawn": "The boss shatters the window! Break the glass shards before they hit the frame!",
      "sat.bossfrag_bite": "CRACK! A shard slammed the frame!",
      "sat.bossfrag_break": "Shattered! +5",
      "sat.bossfrag_catch": "Caught a shard! +3",
      /* ----- juice / cinema ----- */
      "juice.wave_default": "Destroy them all!",
      "juice.combo_lost": "Combo lost!",
      "juice.warn": "WARNING",
      "juice.boss_down": "BOSS DOWN!",
      "juice.shard_float": "+{n} glass shards",
      "juice.shard_float2": "+ glass shards",
      "juice.pickup_shield": "Shield!",
      "juice.level_up": "LEVEL UP {level}!", /* FIX 2026-10-04 "LEVEL UP undefined!": banner via i18n + numeric guard */
    }
  };

  /* ---------- engine ---------- */
  function mergeInto(dst, src) {
    if (!src) return;
    for (var k in src) {
      if (!Object.prototype.hasOwnProperty.call(src, k)) continue;
      var v = src[k];
      if (v && typeof v === "object" && !Array.isArray(v) &&
          dst[k] && typeof dst[k] === "object" && !Array.isArray(dst[k])) {
        mergeInto(dst[k], v);
      } else {
        dst[k] = v;
      }
    }
  }
  mergeInto(dict.vi, BASE.vi);
  mergeInto(dict.en, BASE.en);
  mergeInto(dict.vi, GAME.vi);
  mergeInto(dict.en, GAME.en);

  var current = DEFAULT_LANG;

  function detect() {
    try {
      var q = new URLSearchParams(window.location.search || "");
      var l = q.get("lang");
      if (l === "vi" || l === "en") return l;
    } catch (e) {}
    try {
      var saved = window.localStorage.getItem(STORE_KEY);
      if (saved === "vi" || saved === "en") return saved;
    } catch (e) {}
    if (window.WK_PORTAL_MODE === true) return "en";
    return DEFAULT_LANG;
  }

  function t(key, vars) {
    var s = dict[current] ? dict[current][key] : undefined;
    if (s == null && current !== "vi") s = dict.vi[key];
    if (s == null) return key;
    s = String(s);
    if (vars) {
      s = s.replace(/\{(\w+)\}/g, function (m, name) {
        return vars[name] != null ? vars[name] : m;
      });
    }
    return s;
  }

  function register(d) {
    if (!d) return;
    if (d.vi) mergeInto(dict.vi, d.vi);
    if (d.en) mergeInto(dict.en, d.en);
  }

  function getLang() { return current; }

  function setLang(lang) {
    if (lang !== "vi" && lang !== "en") return current;
    current = lang;
    try { window.localStorage.setItem(STORE_KEY, lang); } catch (e) {}
    try { document.documentElement.lang = lang; } catch (e) {}
    applyDOM();
    try {
      window.dispatchEvent(new CustomEvent("wk:lang", { detail: { lang: lang } }));
    } catch (e) {}
    return current;
  }

  /* data-i18n       → textContent
     data-i18n-html  → innerHTML (câu có thẻ b / svg inline)
     data-i18n-ph    → placeholder
     data-i18n-aria  → aria-label
     data-i18n-title → title
     data-i18n-alt   → alt */
  function applyDOM(root) {
    try {
      root = root || document;
      var els, i, el, key;
      els = root.querySelectorAll("[data-i18n]");
      for (i = 0; i < els.length; i++) { el = els[i]; key = el.getAttribute("data-i18n"); if (key) el.textContent = t(key); }
      els = root.querySelectorAll("[data-i18n-html]");
      for (i = 0; i < els.length; i++) { el = els[i]; key = el.getAttribute("data-i18n-html"); if (key) el.innerHTML = t(key); }
      var attrs = { "data-i18n-ph": "placeholder", "data-i18n-aria": "aria-label",
                    "data-i18n-title": "title", "data-i18n-alt": "alt" };
      for (var a in attrs) {
        if (!Object.prototype.hasOwnProperty.call(attrs, a)) continue;
        els = root.querySelectorAll("[" + a + "]");
        for (i = 0; i < els.length; i++) {
          el = els[i]; key = el.getAttribute(a);
          if (key) el.setAttribute(attrs[a], t(key));
        }
      }
      document.documentElement.lang = current;
    } catch (e) {}
  }

  function locale() { return current === "en" ? "en-US" : "vi-VN"; }

  function fmtNum(n) {
    try { return Number(n).toLocaleString(locale()); }
    catch (e) { return String(n); }
  }

  window.I18N = {
    t: t,
    setLang: setLang,
    getLang: getLang,
    detect: detect,
    register: register,
    applyDOM: applyDOM,
    locale: locale,
    fmtNum: fmtNum,
    _dict: dict, // đọc-only cho test/debug
  };

  /* boot: detect → applyDOM (script chạy defer, sau khi DOM parse xong) */
  current = detect();
  try {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () { applyDOM(); });
    } else {
      applyDOM();
    }
  } catch (e) {}
})();
