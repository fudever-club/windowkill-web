#!/usr/bin/env python3
"""Build individual SVG icon files + sprite from hand-drawn glyphs (Dever style).

Usage: python3 build-sprite.py
Outputs:
  assets/icons/<name>.svg      individual files (canonical, local reference)
  assets/icons/avatar-<n>.svg   profile avatar badges
  assets/icons/sprite.svg       standalone sprite (reference)
  assets/icons/sprite-inline.html  <svg style="display:none"> block to paste into HTML
Glyph style: 24x24, stroke=currentColor, stroke-width=2, round caps (Lucide-like).
Brand icons (github, vercel) are normalized to currentColor.
"""
import os, re

HERE = os.path.dirname(os.path.abspath(__file__))

# ---------------- hand-drawn UI glyphs (inner SVG, 24x24) ----------------
# filled accents use fill="currentColor" stroke="none" explicitly
ICONS = {
"play": '<path d="M8 5v14l11-7z" fill="currentColor" stroke="none"/>',
"pause": '<rect x="6" y="5" width="4" height="14" rx="1.5" fill="currentColor" stroke="none"/><rect x="14" y="5" width="4" height="14" rx="1.5" fill="currentColor" stroke="none"/>',
"restart": '<path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/>',
"home": '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9.5 21v-6h5v6"/>',
"plus": '<path d="M12 5v14M5 12h14"/>',
"close": '<path d="M6 6l12 12M18 6 6 18"/>',
"user": '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/>',
"trophy": '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z"/><path d="M7 6H4.5A1.5 1.5 0 0 0 3 7.5C3 10 5 12 7.5 12M17 6h2.5A1.5 1.5 0 0 1 21 7.5C21 10 19 12 16.5 12"/>',
"chart": '<path d="M6 20v-6M12 20V6M18 20v-9"/><path d="M3 20h18"/>',
"settings": '<path d="M4 8h9M17.5 8H20M4 16h3M11.5 16H20"/><circle cx="15" cy="8" r="2.3"/><circle cx="9" cy="16" r="2.3"/>',
"music": '<path d="M9 18V6l10-2v11"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="15" r="2.5"/>',
"volume": '<path d="M11 5 6.5 9H3v6h3.5L11 19V5z" fill="currentColor" stroke="none"/><path d="M15 9.5a3.5 3.5 0 0 1 0 5M17.8 7a7.5 7.5 0 0 1 0 10"/>',
"vibrate": '<rect x="9" y="2.5" width="6" height="19" rx="2"/><path d="M5.5 8.5v7M3.5 6.5v11M18.5 8.5v7M20.5 6.5v11"/>',
"gauge": '<path d="M4.5 19a9 9 0 1 1 15 0"/><path d="M12 14l4.2-4.2"/><path d="M2.5 19h19"/>',
"heart": '<path d="M12 20.5C7 16.5 3 13.3 3 9.3 3 6.4 5.2 4.5 7.7 4.5c1.7 0 3.3.9 4.3 2.4 1-1.5 2.6-2.4 4.3-2.4 2.5 0 4.7 1.9 4.7 4.8 0 4-4 7.2-9 11.2z"/>',
"heart-plus": '<path d="M12 20.5C7 16.5 3 13.3 3 9.3 3 6.4 5.2 4.5 7.7 4.5c1.7 0 3.3.9 4.3 2.4 1-1.5 2.6-2.4 4.3-2.4 2.5 0 4.7 1.9 4.7 4.8 0 4-4 7.2-9 11.2z"/><path d="M12 8.5v5M9.5 11h5"/>',
"shield": '<path d="M12 3l7 3v5c0 4.5-3 8.6-7 10-4-1.4-7-5.5-7-10V6l7-3z"/>',
"bomb": '<circle cx="10.5" cy="14.5" r="6.5"/><path d="M14.8 10.2c1.2-2.3 2.8-3.6 5.2-4.2"/><path d="M20 6l.7-2M21.7 7.2l2-.7"/>',
"magnet": '<path d="M5 4h4.5v8a2.75 2.75 0 0 0 5.5 0V4H20v8a8 8 0 0 1-16 0V4z"/><path d="M5 8.5h4.5M15 8.5h5" stroke-width="2.6"/>',
"pierce": '<path d="M3 12h17"/><path d="M16.5 7.5 21 12l-4.5 4.5"/><path d="M7 5.5 9 12l-2 6.5"/>',
"rocket": '<path d="M12 2.5c3.4 2.4 5 6.3 5 10.5l2.8 2.8-3.8.6a12 12 0 0 1-8 0l-3.8-.6L7 13c0-4.2 1.6-8.1 5-10.5z"/><circle cx="12" cy="10" r="1.8"/><path d="M9.8 18.6c.4 1.4 1 2.6 2.2 3.9.9-1.3 1.6-2.5 2-3.9"/>',
"fire": '<path d="M12 22c4.2 0 7-2.9 7-6.6 0-3.8-2.8-5.7-4.3-8.6-.9 1.6-2 2.6-3 2.6.2-1.9-.3-3.3-1.3-4.9C7.6 7 5 10.1 5 14.4 5 19.1 7.8 22 12 22z"/>',
"split": '<path d="M6 20v-9M6 11 4 13M6 11l2 2M12 20V5M12 5 10 7M12 5l2 2M18 20v-9M18 11l-2 2M18 11l2 2"/>',
"bolt": '<path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H13L13 2z"/>',
"clover": '<circle cx="9" cy="9" r="3.2"/><circle cx="15" cy="9" r="3.2"/><circle cx="9" cy="15" r="3.2"/><circle cx="15" cy="15" r="3.2"/><path d="M12 17.5c-.2 2-1 3.3-2.8 4.5"/>',
"snow": '<path d="M12 2v20M3.3 7l17.4 10M20.7 7 3.3 17"/><path d="M12 2 10 4.5M12 2l2 2.5M12 22l-2-2.5M12 22l2-2.5"/>',
"gem": '<path d="M6.5 3h11L22 9l-10 12L2 9l4.5-6z"/><path d="M2 9h20"/><path d="M8.7 9 12 3l3.3 6L12 21z"/>',
"skull": '<path d="M12 2.5a7.5 7.5 0 0 0-7.5 7.5c0 2.7 1.5 5 3.7 6.3V19a1.5 1.5 0 0 0 1.5 1.5h4.6A1.5 1.5 0 0 0 15.8 19v-2.7c2.2-1.3 3.7-3.6 3.7-6.3A7.5 7.5 0 0 0 12 2.5z"/><circle cx="9.2" cy="10.5" r="1.3" fill="currentColor" stroke="none"/><circle cx="14.8" cy="10.5" r="1.3" fill="currentColor" stroke="none"/><path d="M10.2 20.5v-2.3M13.8 20.5v-2.3"/>',
"wave": '<path d="M2 9c2.5 0 2.5 2 5 2s2.5-2 5-2 2.5 2 5 2 2.5-2 5-2"/><path d="M2 15c2.5 0 2.5 2 5 2s2.5-2 5-2 2.5 2 5 2 2.5-2 5-2"/>',
"clock": '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3.5 2"/>',
"gamepad": '<path d="M7 8h10a5 5 0 0 1 5 5v1.6a4 4 0 0 1-6.8 2.8L13.6 15.6h-3.2l-1.6 1.8A4 4 0 0 1 2 14.6V13a5 5 0 0 1 5-5z"/><path d="M7.5 11v3.5M5.75 12.75h3.5"/><circle cx="15.8" cy="11.8" r="1.1" fill="currentColor" stroke="none"/><circle cx="18" cy="14" r="1.1" fill="currentColor" stroke="none"/>',
"levelup": '<circle cx="12" cy="12" r="8.5"/><path d="M12 16.5v-8M8.3 11.8 12 8l3.7 3.8"/>',
"lock": '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
"alert": '<path d="M12 3.5 2.8 19.5h18.4L12 3.5z"/><path d="M12 10v4"/><circle cx="12" cy="16.8" r="1.1" fill="currentColor" stroke="none"/>',
"crosshair": '<circle cx="12" cy="12" r="6.5"/><path d="M12 2.5V6M12 18v3.5M2.5 12H6M18 12h3.5"/>',
"smartphone": '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M10.8 18.5h2.4"/>',
"ghost": '<path d="M12 3a7 7 0 0 0-7 7v10.5l2.4-1.9 2.1 1.9 2.5-1.9 2.5 1.9 2.1-1.9 2.4 1.9V10a7 7 0 0 0-7-7z"/><circle cx="9.4" cy="10.3" r="1.2" fill="currentColor" stroke="none"/><circle cx="14.6" cy="10.3" r="1.2" fill="currentColor" stroke="none"/>',
"smile": '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 14.2c1 1.2 2.2 1.8 3.5 1.8s2.5-.6 3.5-1.8"/><circle cx="9" cy="9.6" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="9.6" r="1" fill="currentColor" stroke="none"/>',
"meh": '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 14.5h7"/><circle cx="9" cy="9.6" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="9.6" r="1" fill="currentColor" stroke="none"/>',
"window": '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9.5h18M9.5 9.5V19"/>',
"sparkles": '<path d="M11 4l1.6 4.2 4.2 1.6-4.2 1.6L11 15.6l-1.6-4.2-4.2-1.6 4.2-1.6L11 4z"/><path d="M17.5 14.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2z"/>',
"globe": '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17"/><path d="M12 3.5c-5 5-5 12 0 17"/><path d="M12 3.5c5 5 5 12 0 17"/>',
# ---- recovered 2026-10-02: glyphs that existed in index.html/game.html sprite
# but were missing from this source file (hand-added in v1.1). Now canonical.
"mirror": '<circle cx="12" cy="9" r="5.5"/><path d="M12 14.5V21"/><path d="M9.5 21h5"/><path d="M18.6 3.4l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8z"/>',
"vacuum": '<rect x="3" y="12" width="10" height="7" rx="2"/><path d="M13 15.5h3.5a4 4 0 0 0 4-4V7"/><path d="M20 7l1.5-1.5"/><circle cx="6.5" cy="19.5" r="1.4"/><circle cx="10.5" cy="19.5" r="1.4"/>',
"expand": '<path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3"/>',
# ---- new 2026-10-02 (Design Lead): glyphs for launcher redesign
"flag": '<path d="M6 21V4"/><path d="M6 4.5c4-2.6 7.5 2.6 12 0v8.5c-4.5 2.6-8-2.6-12 0"/>',
"anvil": '<path d="M3.5 7.5h11L20.5 5.8"/><path d="M20.5 5.8c.5 1.7 0 3.2-1.4 4L13.6 11.4"/><path d="M13.6 11.4 12.8 18.5"/><path d="M7 18.5h10"/><circle cx="6" cy="7.5" r="0.9" fill="currentColor" stroke="none"/>',
"shop": '<path d="M3.5 4.5h17L22 9.5"/><path d="M5 9.5h14V20H5z"/><path d="M10 20v-5.5h4V20"/><path d="M8.6 4.5v5M12 4.5v5M15.4 4.5v5"/>',
"calendar": '<rect x="3.5" y="5" width="17" height="16" rx="2.5"/><path d="M3.5 10h17"/><path d="M8 3v4M16 3v4"/><circle cx="9" cy="14.5" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="14.5" r="1" fill="currentColor" stroke="none"/>',
"check": '<circle cx="12" cy="12" r="8.5"/><path d="M8.3 12.3l2.5 2.5 4.9-5.3"/>',
"grad": '<path d="M2.5 9 12 5l9.5 4L12 13 2.5 9z"/><path d="M6.5 10.8V15c0 1.3 2.5 2.6 5.5 2.6s5.5-1.3 5.5-2.6v-4.2"/><path d="M21.5 9v4.5"/><circle cx="21.5" cy="14.8" r="1" fill="currentColor" stroke="none"/>',
"infinity": '<circle cx="8.2" cy="12" r="3.9"/><circle cx="15.8" cy="12" r="3.9"/>',
"palette": '<circle cx="12" cy="12" r="8.5"/><circle cx="8.8" cy="10" r="1.2" fill="currentColor" stroke="none"/><circle cx="12.5" cy="8.6" r="1.2" fill="currentColor" stroke="none"/><circle cx="15.8" cy="11.4" r="1.2" fill="currentColor" stroke="none"/><circle cx="14.8" cy="15.4" r="1.2" fill="currentColor" stroke="none"/>',
}

STROKE_ATTRS = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'

# avatar badges: (glyph, gradient_from, gradient_to)
AVATARS = [
    ("gamepad", "#0080FF", "#004C99"),
    ("rocket", "#1a8cff", "#0066CC"),
    ("bolt", "#4da3ff", "#004C99"),
    ("ghost", "#0066CC", "#003d7a"),
    ("gem", "#0080FF", "#002f66"),
    ("fire", "#33a0ff", "#004C99"),
    ("crosshair", "#0080FF", "#0052a3"),
    ("trophy", "#1a8cff", "#003f8f"),
]

def brand_inner(path):
    with open(os.path.join(HERE, path), encoding="utf-8") as f:
        svg = f.read()
    m = re.search(r'viewBox="([^"]+)"', svg)
    vb = m.group(1) if m else "0 0 24 24"
    inner = re.sub(r'^.*?<svg[^>]*>', '', svg, flags=re.S)
    inner = re.sub(r'</svg>\s*$', '', inner, flags=re.S)
    inner = inner.replace('fill="#000"', 'fill="currentColor"').replace("fill='#000'", "fill='currentColor'")
    inner = inner.replace('fill="#ffff"', 'fill="currentColor"').replace('fill="#fff"', 'fill="currentColor"')
    return vb, inner.strip()

def main():
    symbols = []
    # 1. hand-drawn UI icons
    for name, inner in ICONS.items():
        with open(os.path.join(HERE, f"{name}.svg"), "w", encoding="utf-8") as f:
            f.write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" {STROKE_ATTRS}>\n{inner}\n</svg>\n')
        symbols.append((f"i-{name}", "0 0 24 24", inner, True))
    # 2. brand icons from svgl.app (normalized to currentColor)
    for name in ("github", "vercel"):
        vb, inner = brand_inner(f"{name}.svg")
        # persist normalized copy as the canonical individual file
        with open(os.path.join(HERE, f"{name}.svg"), "w", encoding="utf-8") as f:
            f.write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}">\n{inner}\n</svg>\n')
        symbols.append((f"i-{name}", vb, inner, False))
    # 3. avatar badges
    for i, (glyph, c1, c2) in enumerate(AVATARS, 1):
        inner_glyph = ICONS[glyph]
        g_attrs = STROKE_ATTRS.replace(chr(32)+"stroke-width="+chr(34)+"2"+chr(34), "") + chr(32)+"stroke-width="+chr(34)+"2.4"+chr(34)
        svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">\n'
               f'<defs><linearGradient id="avg{i}" x1="0" y1="0" x2="1" y2="1">'
               f'<stop offset="0" stop-color="{c1}"/><stop offset="1" stop-color="{c2}"/>'
               f'</linearGradient></defs>\n'
               f'<rect width="48" height="48" rx="12" fill="url(#avg{i})"/>\n'
               f'<g transform="translate(12 12)" {g_attrs}>\n{inner_glyph}\n</g>\n</svg>\n')
        with open(os.path.join(HERE, f"avatar-{i}.svg"), "w", encoding="utf-8") as f:
            f.write(svg)
        sym_inner = (f'<defs><linearGradient id="avg{i}" x1="0" y1="0" x2="1" y2="1">'
                     f'<stop offset="0" stop-color="{c1}"/><stop offset="1" stop-color="{c2}"/>'
                     f'</linearGradient></defs>'
                     f'<rect width="48" height="48" rx="12" fill="url(#avg{i})"/>'
                     f'<g transform="translate(12 12)" {g_attrs}>{inner_glyph}</g>')
        symbols.append((f"i-avatar-{i}", "0 0 48 48", sym_inner, False))
    # 4. sprite
    parts = []
    for sid, vb, inner, stroke in symbols:
        attrs = f' {STROKE_ATTRS}' if stroke else ''
        parts.append(f'<symbol id="{sid}" viewBox="{vb}"{attrs}>\n{inner}\n</symbol>')
    sprite_body = "\n".join(parts)
    with open(os.path.join(HERE, "sprite.svg"), "w", encoding="utf-8") as f:
        f.write(f'<svg xmlns="http://www.w3.org/2000/svg">\n{sprite_body}\n</svg>\n')
    inline = ('<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">\n'
              + sprite_body + '\n</svg>')
    with open(os.path.join(HERE, "sprite-inline.html"), "w", encoding="utf-8") as f:
        f.write(inline)
    print(f"icons: {len(ICONS)} ui + 2 brand + {len(AVATARS)} avatars = {len(symbols)} symbols")
    print(f"sprite-inline.html: {len(inline)} bytes")

if __name__ == "__main__":
    main()
