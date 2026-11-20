---
compositionId: bgm
duration_s: 135.993 # == audiomap.audio.duration_sec
canvas: { w: 1920, h: 1080, fps: 30 }
style: # brand spine — BlockFrame preset (frame.md), verbatim tokens
  font: "Inter 800–900 uppercase (display) / Space Grotesk 600 uppercase 0.08em (label chrome) / Inter 500 (body)"
  palette: ["#000000", "#FFFFFF", "#FFFDF5", "#FE90E8", "#C0F7FE", "#99E885", "#F7CB46", "#FFDC8B"]
assets: false # typography carries the video; no user images/videos
build_notes: ["one paused timeline per frame", "no remote assets", "hard cuts frame-to-frame owned by assembler"]
void: ["generic slideshow", "tiny unreadable hero text", "calm/soft gradients"]
---

## Frame 1 — f1

- src: compositions/frames/01-f1.html
- duration: 19.0s # = span length; assembler sums these for cumulative data-start
- span_sec: [0.0, 19.0] # track seconds; frames tile the track
- pacing: beat_cut
- mood: [playful, hype]
- feel: 8s near-silence void then bass rumbles in with sparse-MEDIUM hits and a accelerating hihat fill (18.855→19.923) leading into the first big drop — like the arcade powering on boot-by-boot

### Groups

- **f1g1** — free_design
  - span_sec: [0.0, 8.0]
  - free_design: { dominant_system: "arcade-cabinet-boot-sequence", primitives: ["content-swap", "staggered-reveal", "outline-to-fill"], density_topology: "accumulate" }
  - anchors: [2.0, 4.7, 6.1, 8.0] # sparse LOW pings in the void; AUDIO 8s near-silence
  - copy: ["FU-DEVER", "CLB LẬP TRÌNH · EST. 2018"]
  - intent: typography only — tiny boot pings on 4 anchors stretch into the wordmark; silence = one mark in empty space
- **f1g2** — template: `intro-kinetic-cascade`
  - span_sec: [8.0, 19.0]
  - params: { theme: "dark", icon: "sparkles", phrases: "[...] (worker builds from copy below)", climax: "{} (worker binds)" }
  - role_bindings: { phrase: { times: [11.5, 13.5, 15.0, 17.0] }, climax: { in: 18.0, iconAt: 18.9 } }
  - copy: bass rumble phrasing → climax word "HIGH SCORE PARADE" lands right before the 19s drop
  - intent: word-by-word poster cascade riding the bass bumps; the hihat fill at 18.855 sweeps straight into the climax card and hands off to frame 2's drop

## Frame 2 — f2

- src: compositions/frames/02-f2.html
- duration: 19.0s
- span_sec: [19.0, 38.0]
- pacing: beat_cut
- mood: [hype, aggressive, playful]
- feel: THE DROP — 0.78–0.82 HIGH energy alternating with LOW breathing gaps, a −0.76 DROP hard stop at 30s and SURGE back at 31s, dense alternating pump like arcade combo counter going nuclear

### Groups

- **f2g1** — template: `poster-tile-mosaic`
  - span_sec: [19.0, 30.0]
  - params: { bgColor: "#000000", tiles: "worker-built pastel grid from palette", bands: "worker", gap: "worker", showText: true, labels: "[worker from copy below]", program: "accumulate→recolor-on-beat" }
  - role_bindings: { tileHits: { times: [19.0, 20.0, 21.0, 22.0, 23.0, 25.0, 26.0, 27.0, 28.0, 29.0] } }
  - copy: "CÁC LOẠI QUÁI" tiles — "CHASER", "CHEWER", "TANK", "DASHER", "SPLITTER", "MINI" tiles + "6 LOẠI QUÁI" label; alternating HIGH/LOW beats pop each tile with per-beat pastel flips
- **f2g2** — template: `held-text-strobe-burst`
  - span_sec: [30.0, 33.0]
  - params: { markText: "1UP", fontStyle: "worker", markScale: "worker", idleColor: "#000000", idleInk: "#F7CB46", frames: "worker texture set", strobePlan: "burst on 31.0 SURGE", decor: "worker" }
  - role_bindings: { strobe: { in: 30.0, drop: 30.0, surge: 31.0 } }
  - copy: word "1UP" strobes dark for the −0.76 DROP hard stop at 30 then bursts SUN YELLOW on the 31s SURGE
- **f2g3** — template: `typewriter-phrase-keyword-shuffle`
  - span_sec: [33.0, 38.0]
  - params: { bgColor: "#FFFDF5", textColor: "#000000", accentColor: "#FE90E8", lead1: "BẮN", lead2: "TIẾT KIỆM", lead3: "CỬA SỔ", keyword: "MÁU", periodChar: "▮" }
  - role_bindings: { typeOnsets: { times: [33.5, 34.5, 35.5, 36.0] }, shuffleFrom: 36.5 }
  - copy: types "BẮN TIẾT KIỆM CỬA SỔ" per beat then keyword "MÁU" cycles typefaces on 36.5–38 — the central mechanic, stated deadpan then punchline

## Frame 3 — f3

- src: compositions/frames/03-f3.html
- duration: 39.0s
- span_sec: [38.0, 77.0]
- pacing: beat_cut
- mood: [hype, playful]
- feel: warm LOW feature tour with breathing silences (38–49) then the longest sustained HIGH wall of the track — 49→70s three dense 5–6s HIGH slabs — with the −0.67 DROP at 73 into a slow exhale void

### Groups

- **f3g1** — template: `card-flyby`
  - span_sec: [38.0, 46.0]
  - params: { theme: "light", bgColor: "#0a0a0a", cards: "worker: 6 feature cards from copy below", landings: "worker", yaw: "worker" }
  - role_bindings: { landings: { times: [39.0, 41.0, 43.0, 44.5, 45.5] } }
  - copy: "BOSS MỖI 5 WAVE", "12 NÂNG CẤP DRAFT 3", "ĐỘ KHÓ CHỌN", "CHƠI MOBILE 2 JOYSTICK", "KỶ LỤC LƯU LOCAL" — feature tour cards tumbling on the warm low-mid beats
- **f3g2** — template: `split-anchor-word-slot`
  - span_sec: [46.0, 57.0]
  - params: { bgColor: "#FFFDF5", anchors: "worker", theme: "worker", showText: true, program: "worker" }
  - role_bindings: { slotPops: { times: [49.0, 50.5, 52.0, 53.0, 54.0, 55.5] }, exitWipeFrom: 56.5 }
  - copy: left anchor "PLATFORMER LOGIC" / right slots pop "QUÁI GẶM", "ĐẠN ĐÁ", "CỬA SỔ", "NHỎ DẦN", "ĐÁNH VÀO", "CHẠM VIỀN" — the literal elevator pitch riding the 49→70 HIGH wall opener
- **f3g3** — template: `poster-tile-mosaic`
  - span_sec: [57.0, 64.0]
  - params: { bgColor: "#0a0a0a", tiles: "worker", bands: "worker", gap: "worker", showText: true, labels: "[worker from copy below]", program: "snake-fill+overlay" }
  - role_bindings: { fillHits: { times: [57.0, 58.0, 59.0, 60.0, 61.0, 62.5] }, overlayOn: 63.0 }
  - copy: "CHƠI MIỄN PHÍ" overlay after snake fill — price tag moment, one clean claim on the sustained beat
- **f3g4** — template: `logo-split-lockup-pulse`
  - span_sec: [64.0, 70.0]
  - params: { bgColor: "#000000", markColor: "#FE90E8", textColor: "#FFFFFF", leftMark: "▲", rightMark: "■", word1: "HIGH", word2: "SCORE", word3: "PARADE", word4: "▮" }
  - role_bindings: { splitStart: 64.0, lockup: { times: [65.0, 66.0, 67.0] }, snapClose: 68.0, pulse: { times: [68.5, 69.0, 69.5] } }
  - copy: word-lockup builds "HIGH / SCORE / PARADE" one word per dense beat from the 64s SURGE, snaps shut and pulses through 70
- **f3g5** — free_design
  - span_sec: [70.0, 77.0]
  - free_design: { dominant_system: "damage-shard-cascade", primitives: ["staggered-exit", "negative-space-hold", "screen-shake"], density_topology: "clear-then-watermark" }
  - anchors: [70.0, 73.0, 74.0, 75.0, 76.0] # shard exits ride the LOW slabs, −0.67 DROP at 73 = screen shake + hold
  - copy: ["SỐNG CÒN LÀ THẮNG"]
  - intent: pastel cards shatter off like a damaged window at 70–73, then everything clears leaving one line "SỐNG CÒN LÀ THẮNG" in the VOID — the joke lands in silence

## Frame 4 — f4

- src: compositions/frames/04-f4.html
- duration: 30.0s
- span_sec: [77.0, 107.0]
- pacing: beat_cut
- mood: [hype, glitch, tense]
- feel: long 73–82 VOID + leads-in kick fill at 83 then a strobing 83→97 call-and-response HIGH/MEDIUM/MLOW ladder — every other second means it — before thinning to warm LOW and drifting to the second act; slight BPM stretch (97–112) says "breathe before the finale"

### Groups

- **f4g1** — free_design
  - span_sec: [77.0, 83.0]
  - free_design: { dominant_system: "ghost-billboard", primitives: ["negative-space-hold", "typewriter-reveal", "outline-to-fill"], density_topology: "single-mark" }
  - anchors: [77.0, 80.0, 82.0] # VOID slabs + 83.15 kick-fill lead-in whistle
  - copy: ["Bạn dám chơi không?"]
  - intent: one taunt line practices timidly through the void, fills into solid just as the kick-fill at 83.15 revs the engine
- **f4g2** — template: `roll-flipbook-word-cycle`
  - span_sec: [83.0, 86.0]
  - params: { bgColor: "#000000", textColor: "#FFFFFF", accentColor: "#99E885", flipWords: "[CHASER, CHEWER, TANK, DASHER, SPLITTER, MINI, BOSS, OT]", resolveText: "6 LOẠI + BOSS", periodChar: "▮" }
  - role_bindings: { roll: { start: 83.2, end: 84.0 }, resolve: 85.0 }
  - copy: monster flipbook cycling on the kick flicker, resolve word locks as the wave ramps
- **f4g3** — template: `held-text-strobe-burst`
  - span_sec: [86.0, 88.0]
  - params: { markText: "OT", fontStyle: "worker", markScale: "worker", idleColor: "#0a0a0a", idleInk: "#FE90E8", frames: "worker texture set", strobePlan: "burst pinned on 87 HIGH", decor: "worker" }
  - role_bindings: { strobe: { drop: 86.0, rise: 87.0 } }
  - copy: "OT" — because this is a dev club's game — strobes off the kick, blushes bright on the 87 HIGH
- **f4g4** — free_design
  - span_sec: [88.0, 97.0]
  - free_design: { dominant_system: "rank-leaderboard", primitives: ["word-grid-burst", "content-swap", "freeze-hold"], density_topology: "alternating-call-response" }
  - anchors: [88.5, 89.5, 90.5, 92.5, 94.5, 95.5] # the HIGH/MEDIUM/MLOW alternating ladder
  - copy: ["★ USER HIGH SCORES", "★ WK_BOT — 999,999", "★ BUGGY — 88,888", "★ DEVER — 77,777", "★ BJỚN — 66,666", "★ ANONY  — 1", "★ BẠN — ???"]
  - intent: fake leaderboard rows POP on odd beats / question marks on even beats, freeze-hold the leader row mid-ladder; the anonymous low score is the gag
- **f4g5** — free_design
  - span_sec: [97.0, 107.0]
  - free_design: { dominant_system: "pixel-curtain-drift", primitives: ["staggered-exit", "bg-flow-field", "blur-resolve"], density_topology: "thin-then-dreamy" }
  - anchors: [97.0, 99.0, 102.0, 104.0, 106.5] # hard stop 97 + warm LOW drift to second act
  - copy: ["tuần… kể tiếp…"] tagline ebbs like a load joke
  - intent: tiles cascade out by the 97 hard stop then a soft pastel flow-field bed washes toward frame 5 — the game's "breath" before the last push

## Frame 5 — f5

- src: compositions/frames/05-f5.html
- duration: 28.993s
- span_sec: [107.0, 135.993]
- pacing: beat_cut
- mood: [hype, playful]
- feel: second-act triple wall — 112–117 dense, 118–123 dense, 124–130 dense with two weak dips (markers for card landings), then final −0.85 DROP at 133 into 3s clean silence — the last word hung in the void

### Groups

- **f5g1** — template: `poster-tile-mosaic`
  - span_sec: [107.0, 112.0]
  - params: { bgColor: "#0a0a0a", tiles: "worker", bands: "worker", gap: "worker", showText: true, labels: "[worker from copy below]", program: "accumulate on warm LOW" }
  - role_bindings: { tileHits: { times: [107.5, 108.5, 109.5, 110.5] } }
  - copy: "WINDOWKILL", "WEB EDITION" label-pill — the title card eases back in on the warm ramp
- **f5g2** — free_design
  - span_sec: [112.0, 123.0]
  - free_design: { dominant_system: "how-to-play-chain", primitives: ["content-swap", "directional-fill"], density_topology: "step-per-slab" }
  - anchors: [112.0, 117.0, 118.0, 123.0] # 3 slabs = 3 steps
  - copy: ["1 — MỞ TRÌNH DUYỆT", "2 — BẮN QUÁI", "3 — NHẬN ĐIỂM CAO"] step cards hard-cut swap one per dense slab
- **f5g3** — free_design
  - span_sec: [123.0, 133.0]
  - free_design: { dominant_system: "url-catapult", primitives: ["braam-punch", "crash-zoom-in", "counting-punch", "screen-shake"], density_topology: "build-into-drop" }
  - anchors: [123.0, 124.0, 126.5, 129.0, 130.0, 131.0, 133.0] # dip 123 punches in, build through 130–133 wall
  - copy: ["CHƠI NGAY", "windowkill-web.vercel.app"]
  - intent: count-up 0→10,000 builds in the last wall and explodes into the URL — must resolve exactly ON the 133 DROP
- **f5g4** — free_design
  - span_sec: [133.0, 135.993]
  - free_design: { dominant_system: "closing-plate", primitives: ["freeze-hold", "negative-space-hold"], density_topology: "single-mark-silence" }
  - anchors: [133.0, 135.993] # final hard stop + 3s clean silence
  - copy: ["FU-DEVER — WORK HARD, PLAY HARD"]
  - intent: everything drops away at 133, one centered sign-off mark holds through the trailing silence, title / subtitle / CTA per BlockFrame Closing Plate
