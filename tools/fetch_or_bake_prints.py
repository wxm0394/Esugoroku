#!/usr/bin/env python3
"""Build the high-definition ukiyo-e print library for E-Sugoroku V2.

The script has two jobs:

1. *Fetch* real public-domain woodblock prints (Hiroshige, Yoshitoshi,
   Kuniyoshi, etc.) from Wikimedia Commons and re-composite them into the
   3:2 print format used by the game's cards, with a traditional washi
   frame and the board's colour wash.  This replaces Phase 1's stick-figure
   vector art with real 19th-century imagery whenever the network is
   available.

2. *Bake* procedurally-generated sumi-e / ukiyo-e textures for every print
   that could not be fetched, so the game is always fully playable offline.
   The baked prints use authentic-looking ink-cloud gradients, seigaiha wave
   borders and bamboo-grain paper, and are colour-shifted per board so every
   square is visually distinct.

Output:
  mobile/assets/prints/<board>/<art>.webp     real / baked prints
  mobile/js/prints_assets.js                   manifest imported by the game

Examples:
    python3 tools/fetch_or_bake_prints.py
    python3 tools/fetch_or_bake_prints.py --bake-only
    python3 tools/fetch_or_bake_prints.py --no-network
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageOps

ROOT = Path(__file__).resolve().parents[1]
PRINTS_DIR = ROOT / 'mobile' / 'assets' / 'prints'
MANIFEST = ROOT / 'mobile' / 'js' / 'prints_assets.js'

# Each board: art keys (in node order), a search term for real prints,
# a colour wash (used as a multiply tint) and a frame accent.
BOARDS_SPEC = [
    {
        'id': 'tokaido',
        'art': [
            'nihonbashi', 'shinagawa', 'dojo', 'kawasaki', 'tsurumi',
            'kanagawa', 'hodogaya', 'inari', 'totsuka', 'fujisawa',
            'hiratsuka', 'oiso', 'tea', 'odawara', 'hakone', 'mishima',
            'kyoto',
        ],
        'search': 'Hiroshige The Fifty-three Stations of the Tokaido woodblock print',
        'wash': (217, 175, 108),
        'frame': '#8b6d47',
    },
    {
        'id': 'yokai',
        'art': [
            'kappa', 'yukionna', 'nekomata', 'chagama', 'sanme',
            'funayurei', 'oiwa', 'rokuro', 'kyubi', 'hyakumonogatari',
        ],
        'search': 'Toriyama Sekien yokai ghost supernatural',
        'wash': (150, 140, 120),
        'frame': '#5b4c33',
    },
    {
        'id': 'kesshu',
        'art': [
            'shootsujin', 'yari', 'yumi', 'kabuto', 'gungi', 'oyoroi',
            'ikkit', 'tachi', 'meiyaku', 'shinobi', 'tekijin', 'jindaiko',
            'kesshi', 'kachidoki', 'agarimae', 'agari',
        ],
        'search': 'Ukiyo-e samurai warrior armor kabuto print',
        'wash': (200, 180, 140),
        'frame': '#7c512d',
    },
    {
        'id': 'genji',
        'art': [
            'kiritsubo', 'hahakigi', 'utsusemi', 'yugao', 'wakamurasaki',
            'suetsumuhana', 'momijinoga', 'hananoen', 'aoi', 'sakaki',
            'hanachirusato', 'suma', 'akashi', 'miotsukushi', 'yomogiu',
            'sekiya', 'eawase', 'matsukaze', 'usugumo', 'asagao', 'otome',
            'tamakazura', 'genji',
        ],
        'search': 'Ukiyo-e emaki Genji monogatari print',
        'wash': (230, 210, 165),
        'frame': '#9a7a36',
    },
]

CHARMS_SPEC = [
    {'id': 'charm_stay', 'search': 'netsuke toggles Japanese lacquer', 'wash': (156, 58, 45), 'frame': '#b23a2b'},
    {'id': 'charm_guard', 'search': 'japanese ofuda talisman paper', 'wash': (49, 94, 104), 'frame': '#315e68'},
    {'id': 'charm_dash', 'search': 'japanese tenugui hand towel pattern', 'wash': (138, 106, 40), 'frame': '#8a6a28'},
]

CANVAS_W, CANVAS_H = 640, 480  # 4:3 print face
USER_AGENT = 'E-Sugoroku/2.0 (educational build; contact: local build)'


def fetch_bytes(url: str, timeout: float = 30) -> bytes | None:
    req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT, 'Accept': '*/*'})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = resp.read()
            if len(data) < 1024:
                return None
            return data
    except Exception:
        return None


def search_commons(query: str, limit: int) -> list[str]:
    """Return direct file URLs for the first `limit` PD images on Commons."""
    params = {
        'action': 'query',
        'format': 'json',
        'generator': 'search',
        'gsrsearch': query,
        'gsrnamespace': 6,
        'gsrlimit': str(limit),
        'proptype': 'imageinfo',
        'prop': 'imageinfo',
        'iiprop': 'url|metadata',
        'iiurlwidth': '640',
    }
    url = 'https://commons.wikimedia.org/w/api.php?' + urllib.parse.urlencode(params)
    data = fetch_bytes(url)
    if not data:
        return []
    try:
        result = json.loads(data.decode('utf-8', 'ignore'))
    except Exception:
        return []
    files = []
    for page in result.get('query', {}).get('pages', {}).values():
        info = page.get('imageinfo', [{}])[0] if isinstance(page.get('imageinfo'), list) else {}
        url = (info.get('thumburl') or info.get('thumb', {}).get('url')
               or info.get('url'))
        if url:
            files.append(url)
    return files


def load_image(url_or_bytes) -> Image.Image | None:
    try:
        if isinstance(url_or_bytes, str):
            data = fetch_bytes(url_or_bytes, timeout=40)
            if not data:
                return None
            src = Image.open(io.BytesIO(data))
        else:
            src = Image.open(io.BytesIO(url_or_bytes))
        src = src.convert('RGB')
        return src
    except Exception:
        return None


def fit_crop(src: Image.Image) -> Image.Image:
    """Crop a square center region then resize to the print face."""
    w, h = src.size
    s = min(w, h)
    x = (w - s) // 2
    y = (h - s) // 2
    src = src.crop((x, y, x + s, y + s))
    return src.resize((CANVAS_W, CANVAS_H), Image.LANCZOS)


def washi_background(wash: tuple[int, int, int]) -> Image.Image:
    """Procedural washi paper with subtle ink-cloud and bamboo-grain texture."""
    base = Image.new('RGB', (CANVAS_W, CANVAS_H), tuple(c for c in wash))
    # Lighten the center, darken the edges.
    grad = Image.new('L', (CANVAS_W, CANVAS_H), 0)
    draw = ImageDraw.Draw(grad)
    for i in range(0, CANVAS_H, 6):
        t = i / CANVAS_H
        alpha = int(255 * (0.55 + 0.45 * (1 - abs(t - 0.5) * 2)))
        draw.rectangle([0, i, CANVAS_W, i + 6], fill=alpha)
    base = Image.composite(base, Image.new('RGB', base.size, (245, 238, 218)), grad.convert('L'))
    # Ink cloud brush strokes.
    ink = Image.new('RGB', base.size, (0, 0, 0))
    idraw = ImageDraw.Draw(ink)
    cx, cy = CANVAS_W // 2, CANVAS_H // 2
    import random
    rng = random.Random(17)
    for _ in range(40):
        r = 40 + rng.randint(0, 120)
        x0 = cx + rng.randint(-220, 220)
        y0 = cy + rng.randint(-150, 150)
        idraw.ellipse([x0 - r, y0 - r, x0 + r, y0 + r], fill=(15, 12, 10))
    base = ImageChops_opacity(base, ink, rng)
    # Bamboo-grain overlay.
    grain = Image.new('L', base.size, 255)
    gdraw = ImageDraw.Draw(grain)
    for i in range(0, CANVAS_W, 3):
        off = (i * 7) % 11
        gdraw.line([(i, 0), (i, CANVAS_H)], fill=200 + off, width=1)
    base = Image.composite(base, base.filter(ImageFilter.GaussianBlur(radius=1)), grain.convert('L').point(lambda v: (255 - v) // 4))
    return base


def ImageChops_opacity(base: Image.Image, top: Image.Image, rng) -> Image.Image:
    """Multiply a dark top onto the base at low opacity."""
    alpha = Image.new('L', base.size, 36 + rng.randint(0, 14))
    return Image.composite(base, top, alpha)


def bake_print(art: str, wash: tuple[int, int, int]) -> bytes:
    """Generate a deterministic procedural print for `art`."""
    rng = __import__('random').Random(hashlib.sha256(art.encode('utf-8')).digest())
    base = washi_background(wash)
    draw = ImageDraw.Draw(base)
    w, h = base.size
    # Central coloured field with brush-stroke edges.
    r = 130 + rng.randint(0, 60)
    cx = w // 2 + rng.randint(-60, 60)
    cy = h // 2 + rng.randint(-30, 30)
    field = tuple(int(c * (0.7 + rng.random() * 0.3)) for c in wash)
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=field)
    # A few ink blobs to mimic sumi-e.
    for _ in range(rng.randint(3, 7)):
        bx = cx + rng.randint(-r, r)
        by = cy + rng.randint(-r, r)
        br = rng.randint(8, 26)
        draw.ellipse([bx - br, by - br, bx + br, by + br], fill=(8, 6, 5))
    # Seigaiha-style concentric arcs in the margins.
    for i in range(0, w, 38):
        draw.arc([i, 2, i + 38, 32], 0, 180, fill=(tuple(int(c * 0.8) for c in wash)), width=2)
    base = base.filter(ImageFilter.UnsharpMask(radius=2, threshold=2))
    return base


def compose_print(src: Image.Image | None, art: str, wash: tuple[int, int, int],
                  frame: str, board_id: str, index: int) -> bytes:
    """Composite a fetched texture onto a washi frame."""
    if src is None:
        base = bake_print(art, wash).convert('RGB')
    else:
        base = fit_crop(src)
        # Colour wash as a soft tint so neighbouring prints still differ.
        tint = Image.new('RGB', base.size, wash)
        base = Image.blend(base, tint, 0.18)
    draw = ImageDraw.Draw(base)
    # Outer washi frame.
    fw = 18
    draw.rectangle([0, 0, CANVAS_W - 1, fw - 1], fill=(238, 228, 198))
    draw.rectangle([0, CANVAS_H - fw, CANVAS_W - 1, CANVAS_H - 1], fill=(238, 228, 198))
    draw.rectangle([0, 0, fw - 1, CANVAS_H - 1], fill=(238, 228, 198))
    draw.rectangle([CANVAS_W - fw, 0, CANVAS_W - 1, CANVAS_H - 1], fill=(238, 228, 198))
    # Inner decorative rule.
    draw.rectangle([fw - 4, fw - 4, CANVAS_W - fw + 4, CANVAS_H - fw + 4], outline=frame, width=3)
    # A faint collector's seal mark.
    draw.ellipse([CANVAS_W - 70, 8, CANVAS_W - 12, 62], outline=frame, width=2)
    # Distinct per-print corner notch via hashing.
    corner = 40 + (index * 37) % 140
    draw.rectangle([4, 4, 22, 22], fill=(corner, corner - 10, corner - 30))
    return base


def save_webp(img: Image.Image, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    buffer = io.BytesIO()
    img.convert('RGB').save(buffer, format='WEBP', quality=88, method=4)
    dest.write_bytes(buffer.getvalue())


def build_board(board: dict, textures: dict[str, list[str]], no_network: bool) -> list[str]:
    art_keys = board['art']
    assets = []
    fetch_pool = list(textures.get(board['id'], []))
    for i, art in enumerate(art_keys):
        dest = PRINTS_DIR / f'{board["id"]}_{art}.webp'
        if dest.exists() and dest.stat().st_size > 500:
            assets.append(art)
            continue
        src = None
        if not no_network and fetch_pool:
            src = load_image(fetch_pool[i % len(fetch_pool)])
        img = compose_print(src, art, board['wash'], board['frame'], board['id'], i)
        save_webp(img, dest)
        assets.append(art)
    return assets


def fetch_all_textures(no_network: bool) -> dict[str, list[str]]:
    textures: dict[str, list[str]] = {}
    for board in BOARDS_SPEC:
        n = max(len(board['art']), 9)
        textures[board['id']] = search_commons(board['search'], n) if not no_network else []
    for charm in CHARMS_SPEC:
        textures[charm['id']] = search_commons(charm['search'], 2) if not no_network else []
    return textures


def build_charms(textures, no_network):
    assets = []
    for charm in CHARMS_SPEC:
        dest = PRINTS_DIR / f'{charm["id"]}.webp'
        if dest.exists() and dest.stat().st_size > 500:
            assets.append(charm['id'])
            continue
        src = None
        pool = textures.get(charm['id'], [])
        if pool:
            src = load_image(pool[0])
        img = compose_print(src, charm['id'], charm['wash'], charm['frame'], charm['id'], 0)
        save_webp(img, dest)
        assets.append(charm['id'])
    return assets


def write_manifest(board_assets: dict, charm_assets: list) -> None:
    lines = []
    lines.append("// Auto-generated by tools/fetch_or_bake_prints.py. Do not edit by hand.")
    lines.append("export const PRINT_ROOT = 'assets/prints';")
    lines.append("export const PRINT_ASSETS = {")
    for board_id, keys in board_assets.items():
        lines.append(f"  {board_id}: {json.dumps({k: f'assets/prints/{board_id}_{k}.webp' for k in keys})},")
    lines.append(f"  charms: {json.dumps({k: f'assets/prints/{k}.webp' for k in charm_assets})},")
    lines.append("};")
    MANIFEST.write_text('\n'.join(lines) + '\n', encoding='utf-8')


def main() -> int:
    parser = argparse.ArgumentParser(description="Build ukiyo-e print assets")
    parser.add_argument('--bake-only', action='store_true', help='use only procedural prints (no network)')
    parser.add_argument('--no-network', action='store_true', help='alias for --bake-only')
    args = parser.parse_args()
    no_network = args.bake_only or args.no_network
    PRINTS_DIR.mkdir(parents=True, exist_ok=True)

    print(f"Building prints in {PRINTS_DIR.relative_to(ROOT)}")
    if no_network:
        textures = {}
    else:
        print("Fetching public-domain textures from Wikimedia Commons ...")
        textures = fetch_all_textures(no_network)
        for k, v in textures.items():
            print(f"  {k}: {len(v)} textures")

    board_assets: dict[str, list[str]] = {}
    for board in BOARDS_SPEC:
        board_assets[board['id']] = build_board(board, textures, no_network)
        print(f"  baked {board['id']}: {len(board_assets[board['id']])} prints")

    charm_assets = build_charms(textures, no_network)
    print(f"  baked charms: {len(charm_assets)}")

    write_manifest(board_assets, charm_assets)
    print(f"Wrote {MANIFEST.relative_to(ROOT)}")
    print("Done.")
    return 0


if __name__ == '__main__':
    sys.exit(main())
