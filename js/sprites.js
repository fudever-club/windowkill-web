/* =====================================================================
   WINDOWKILL: Web Edition — Cartoon Neon Vector PNG Sprite Registry
   Loads and caches transparent PNG sprites from assets/sprites/ cleanly
   with zero-dependency offscreen hit-flash/frost-tint helpers and instant
   fallback to Canvas vector rendering if an image has not loaded yet
   (or in headless Node test environments without DOM Image).
   ===================================================================== */
"use strict";
(function () {
  var BASE = "assets/sprites/";
  var PATHS = {
    // Player Ship skins & FX
    "ship_default": "Ship/ship_skin_default.png",
    "ship_sunset": "Ship/ship_skin_sunset.png",
    "ship_night": "Ship/ship_skin_night.png",
    "ship_frost": "Ship/ship_skin_frost.png",
    "ship_smith": "Ship/ship_skin_smith.png",
    "ship_fudever": "Ship/ship_skin_fudever.png",
    "ship_hull_base": "Ship/ship_hull_base.png",
    "ship_shield": "Ship/ship_shield_bubble.png",
    "ship_thruster": "Ship/ship_thruster_flame.png",

    // Projectiles
    "proj_cyan": "Projectiles/proj_bullet_cyan.png",
    "proj_ice": "Projectiles/proj_bullet_ice.png",
    "proj_star": "Projectiles/proj_bullet_star.png",
    "proj_disco": "Projectiles/proj_bullet_disco.png",
    "eb_orb": "Projectiles/proj_enemy_orb.png",
    "eb_ice": "Projectiles/proj_enemy_ice.png",
    "eb_spit": "Projectiles/proj_enemy_spit.png",
    "eb_paper": "Projectiles/proj_enemy_paper.png",
    "eb_cursor": "Projectiles/bullet_boss_cursor.png",

    // Pickups & XP Gems
    "gem_xp": "Pickups/gem_xp.png",
    "gem_small": "Pickups/pickup_xp_gem_small.png",
    "gem_large": "Pickups/pickup_xp_gem_large.png",
    "pickup_heart": "Pickups/pickup_heart.png",
    "pickup_shield": "Pickups/pickup_shield.png",
    "pickup_shieldwin": "Pickups/pickup_shieldwin.png",
    "pickup_nuke": "Pickups/pickup_nuke.png",
    "pickup_magnet": "Pickups/pickup_magnet.png",
    "pickup_overdrive": "Pickups/pickup_overdrive.png",
    "pickup_patch": "Pickups/pickup_patch.png",
    "pickup_glass_shard": "Pickups/pickup_glass_shard.png",

    // Monsters (22 canonical + egg + overlays)
    "mon_chaser": "Monsters/mon_chaser.png",
    "mon_chaser_crown": "Monsters/mon_chaser_alpha_crown.png",
    "mon_chewer_head": "Monsters/mon_chewer_head.png",
    "mon_chewer_seg": "Monsters/mon_chewer_seg.png",
    "mon_tank_body": "Monsters/mon_tank_body.png",
    "mon_tank_core": "Monsters/mon_tank_core.png",
    "mon_dasher": "Monsters/mon_dasher.png",
    "mon_splitter": "Monsters/mon_splitter.png",
    "mon_splitter_crack": "Monsters/mon_splitter_crack.png",
    "mon_mini": "Monsters/mon_mini.png",
    "mon_spitter": "Monsters/mon_spitter.png",
    "mon_booster": "Monsters/mon_booster.png",
    "mon_kamikaze": "Monsters/mon_kamikaze.png",
    "mon_kamikaze_spark": "Monsters/mon_kamikaze_fuse_spark.png",
    "mon_freezer": "Monsters/mon_freezer.png",
    "mon_warden_body": "Monsters/mon_warden_body.png",
    "mon_warden_shield": "Monsters/mon_warden_shield.png",
    "mon_glimmer": "Monsters/mon_glimmer.png",
    "mon_phantom": "Monsters/mon_phantom.png",
    "mon_broodmother": "Monsters/mon_broodmother.png",
    "mon_egg": "Monsters/mon_egg.png",
    "mon_deadline": "Monsters/mon_deadline.png",
    "mon_deadline_bell": "Monsters/mon_deadline_bell.png",
    "mon_otworker": "Monsters/mon_otworker.png",
    "mon_meeting": "Monsters/mon_meeting.png",
    "mon_shipper": "Monsters/mon_shipper.png",
    "mon_director": "Monsters/mon_director.png",
    "mon_snatcher": "Monsters/mon_snatcher.png",
    "mon_weaver": "Monsters/mon_weaver.png",
    "mon_healer": "Monsters/mon_healer.png",

    // Endless Boss Personas (6 + attachments)
    "boss_gnome": "Bosses/boss_endless_gnome_body.png",
    "boss_gnome_jaw": "Bosses/boss_endless_gnome_jaw.png",
    "boss_deadline": "Bosses/boss_endless_deadline_body.png",
    "boss_deadline_papers": "Bosses/boss_endless_deadline_papers.png",
    "boss_dj": "Bosses/boss_endless_dj_body.png",
    "boss_dj_turntable": "Bosses/boss_endless_dj_turntable.png",
    "boss_sniffly": "Bosses/boss_endless_sniffly_body.png",
    "boss_sniffly_nose": "Bosses/boss_endless_sniffly_nose.png",
    "boss_corechill": "Bosses/boss_endless_corechill_body.png",
    "boss_corechill_mug": "Bosses/boss_endless_corechill_mug.png",
    "boss_teaser": "Bosses/boss_endless_teaser_body.png",
    "boss_teaser_glasses": "Bosses/boss_endless_teaser_glasses.png",

    // Boss Rush Bosses (5 multi-part rigs)
    "rush_gnawer_upper": "Bosses/boss_rush_gnawer_upper.png",
    "rush_gnawer_lowerjaw": "Bosses/boss_rush_gnawer_lowerjaw.png",
    "rush_gnawer_mouthglow": "Bosses/boss_rush_gnawer_mouthglow.png",
    "rush_firewall_segment": "Bosses/boss_rush_firewall_segment.png",
    "rush_firewall_spike": "Bosses/boss_rush_firewall_spike.png",
    "rush_chaos_core": "Bosses/boss_rush_chaos_core.png",
    "rush_chaos_ring": "Bosses/boss_rush_chaos_ring.png",
    "rush_chaos_mine": "Bosses/boss_rush_chaos_mine.png",
    "rush_night_abyss": "Bosses/boss_rush_night_abyss.png",
    "rush_night_eye": "Bosses/boss_rush_night_eye.png",
    "rush_null_cursor": "Bosses/boss_rush_null_cursor.png",
    "rush_null_glitchbar": "Bosses/boss_rush_null_glitchbar.png",

    // Satellites
    "sat_shield_drone": "Satellites/sat_shield_drone.png",
    "sat_lover_heart": "Satellites/sat_lover_heart.png",
    "sat_mirror_disc": "Satellites/sat_mirror_disc.png",
    "sat_blackhole_vortex": "Satellites/sat_blackhole_vortex.png",
    "sat_window_frame": "Satellites/sat_window_frame.png",

    // 8 Backgrounds (base + parallax)
    "bg_1_base": "Backgrounds/theme_1_bsod_base.png",
    "bg_1_parallax": "Backgrounds/theme_1_bsod_parallax.png",
    "bg_2_base": "Backgrounds/theme_2_firewall_base.png",
    "bg_2_parallax": "Backgrounds/theme_2_firewall_parallax.png",
    "bg_3_base": "Backgrounds/theme_3_gravity404_base.png",
    "bg_3_parallax": "Backgrounds/theme_3_gravity404_parallax.png",
    "bg_4_base": "Backgrounds/theme_4_blackout_base.png",
    "bg_4_parallax": "Backgrounds/theme_4_blackout_parallax.png",
    "bg_5_base": "Backgrounds/theme_5_memory_base.png",
    "bg_5_parallax": "Backgrounds/theme_5_memory_parallax.png",
    "bg_6_base": "Backgrounds/theme_6_kernel_panic_base.png",
    "bg_6_parallax": "Backgrounds/theme_6_kernel_panic_parallax.png",
    "bg_7_base": "Backgrounds/theme_7_cloud_cluster_base.png",
    "bg_7_parallax": "Backgrounds/theme_7_cloud_cluster_parallax.png",
    "bg_8_base": "Backgrounds/theme_8_retro_desktop_base.png",
    "bg_8_parallax": "Backgrounds/theme_8_retro_desktop_parallax.png",

    // UI Badges & Skills
    "skill_glue": "UI/skill_glue_gun_e.png",
    "skill_anchor": "UI/skill_inertia_anchor_shift.png",
    "skill_repair": "UI/ui_skill_repair.png",
    "badge_endless": "UI/badge_endless.png",
    "badge_timeattack": "UI/badge_timeattack.png",
    "badge_bossrush": "UI/badge_bossrush.png",
    "badge_daily": "UI/badge_daily.png",
    "brand_dever": "UI/brand_dever_badge.png",
  };

  var cache = {};
  var listeners = [];
  var gfxEnabled = null;

  function readGfxSetting() {
    if (gfxEnabled !== null) return gfxEnabled;
    try {
      if (typeof localStorage !== "undefined") {
        var raw = localStorage.getItem("wk_settings");
        if (raw) {
          var s = JSON.parse(raw);
          if (s && s.gfxStyle === "vector") return false;
        }
      }
    } catch (e) {}
    return true;
  }

  function setEnabled(on) {
    gfxEnabled = !!on;
  }

  function enabled() {
    return readGfxSetting();
  }

  function get(key) {
    if (!key || !PATHS[key]) return null;
    if (typeof Image === "undefined") return null;
    var entry = cache[key];
    if (!entry) {
      var img = new Image();
      entry = cache[key] = { img: img, ready: false, failed: false, slow: null, flash: null };
      img.onload = function () {
        entry.ready = img.naturalWidth > 0;
        for (var i = 0; i < listeners.length; i++) {
          try { listeners[i](key, img); } catch (e) {}
        }
      };
      img.onerror = function () { entry.failed = true; };
      img.src = BASE + PATHS[key];
    }
    return entry.ready ? entry.img : null;
  }

  function getTinted(key, kind, color) {
    var img = get(key);
    if (!img || typeof document === "undefined") return null;
    var entry = cache[key];
    if (!entry) return img;
    if (entry[kind]) return entry[kind];
    try {
      var nw = img.naturalWidth || 128;
      var nh = img.naturalHeight || 128;
      var maxSide = Math.max(nw, nh);
      var capScale = maxSide > 128 ? (128 / maxSide) : 1;
      var c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(nw * capScale));
      c.height = Math.max(1, Math.round(nh * capScale));
      var cx = c.getContext("2d");
      if (!cx) return img;
      cx.drawImage(img, 0, 0, c.width, c.height);
      cx.globalCompositeOperation = "source-atop";
      cx.fillStyle = color;
      cx.globalAlpha = kind === "flash" ? 0.65 : 0.45;
      cx.fillRect(0, 0, c.width, c.height);
      entry[kind] = c;
      return c;
    } catch (e) {
      return img;
    }
  }

  function draw(ctx, key, x, y, w, h, opts) {
    if (!ctx || !enabled()) return false;
    var img = get(key);
    if (!img) return false;
    opts = opts || {};
    var src = img;
    if (opts.flash) src = getTinted(key, "flash", "#ffffff") || img;
    else if (opts.slow) src = getTinted(key, "slow", "#7dd3fc") || img;

    var sx = opts.sx != null ? opts.sx : 1;
    var sy = opts.sy != null ? opts.sy : sx;
    var dw = (w || img.naturalWidth) * sx;
    var dh = (h || w || img.naturalHeight) * sy;

    // Fast path: skip save/restore when no rotation or alpha override is needed
    // Note: neon glow halos are baked into PNGs cleanly; skip costly Canvas shadowBlur.
    if (!opts.rot && opts.alpha == null) {
      ctx.drawImage(src, x - dw / 2, y - dh / 2, dw, dh);
      return true;
    }

    ctx.save();
    if (x || y) ctx.translate(x, y);
    if (opts.rot) ctx.rotate(opts.rot);
    if (opts.alpha != null) ctx.globalAlpha *= opts.alpha;
    ctx.drawImage(src, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();
    return true;
  }

  function preload(keys) {
    if (typeof Image === "undefined") return;
    var list = Array.isArray(keys) ? keys : Object.keys(PATHS);
    for (var i = 0; i < list.length; i++) get(list[i]);
  }

  function onLoad(cb) {
    if (typeof cb === "function") listeners.push(cb);
  }

  function urlOf(key) {
    return PATHS[key] ? (BASE + PATHS[key]) : null;
  }

  var api = {
    BASE: BASE,
    PATHS: PATHS,
    enabled: enabled,
    setEnabled: setEnabled,
    get: get,
    draw: draw,
    preload: preload,
    onLoad: onLoad,
    urlOf: urlOf,
  };

  if (typeof window !== "undefined") window.WKSprites = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
