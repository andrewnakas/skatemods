"""Draws 1200x630 social preview cards into public/og/.

Run after adding a blog post or changing a card below:  python3 scripts/og.py
Needs Pillow. Cards: the site default, each blog post, and the pages listed in PAGES.
"""
import re
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public' / 'og'
FONTS = Path(__file__).resolve().parent / 'og-fonts'
PAPER, INK, SOFT, ACCENT, LINE = '#f4f1ea', '#141413', '#55524a', '#d63a1f', '#d6d1c4'
W, H, M = 1200, 630, 72

PAGES = {
    'default': ('Guides · History · Maps · Mods', 'Mod every skate game.', 'Guides, history, maps and mods for every skate game, written by players.'),
    'skate-3-online': ('Free · In your browser · Multiplayer', 'Play Skate 3 online.', 'No download, no disc. Skate solo or with up to 10 friends in Chrome or Edge.'),
    'reskate': ('skate. (2025)', 'skate. mods', 'Every ReSkate mod: custom maps, boards, cosmetics and scripts, updated live.'),
    'community': ('Community', 'Where the scenes talk', 'Discord servers for ReSkate, Skate 3, Session, THPS and THUG Pro, and how to contribute.'),
}


def display(size, weight=800, width=75):
    f = ImageFont.truetype(str(FONTS / 'Archivo.ttf'), size)
    f.set_variation_by_axes([weight, width])
    return f


def mono(size):
    return ImageFont.truetype(str(FONTS / 'PlexMono.ttf'), size)


def wrap(draw, text, font, width):
    lines, line = [], ''
    for word in text.split():
        trial = f'{line} {word}'.strip()
        if draw.textlength(trial, font=font) <= width or not line:
            line = trial
        else:
            lines.append(line)
            line = word
    lines.append(line)
    return lines


def card(name, kicker, title, sub):
    img = Image.new('RGB', (W, H), PAPER)
    d = ImageDraw.Draw(img)
    logo = display(44)
    d.text((M, 56), 'SKATE', font=logo, fill=INK)
    d.text((M + d.textlength('SKATE', font=logo), 56), 'MODS', font=logo, fill=ACCENT)
    d.rectangle([M, 128, W - M, 131], fill=INK)
    d.text((M, 158), kicker.upper(), font=mono(26), fill=ACCENT)

    # Largest title size that fits in three lines.
    for size in (112, 100, 90, 80, 70, 62):
        font = display(size)
        lines = wrap(d, title.upper(), font, W - 2 * M)
        if len(lines) <= 3:
            break
    y = 210
    for line in lines:
        d.text((M, y), line, font=font, fill=INK)
        y += int(size * 0.92)

    subfont = ImageFont.truetype(str(FONTS / 'PlexMono.ttf'), 26)
    sub_lines = wrap(d, sub, subfont, W - 2 * M)[:2]
    sy = H - 70 - 36 * len(sub_lines)
    if sy > y + 10:
        for i, line in enumerate(sub_lines):
            d.text((M, sy + i * 36), line, font=subfont, fill=SOFT)
    d.rectangle([0, H - 18, W, H], fill=ACCENT)
    img.save(OUT / f'{name}.png', optimize=True)


def frontmatter(path):
    text = path.read_text()
    block = text.split('---')[1]
    get = lambda key: (re.search(rf'^{key}:\s*(.+)$', block, re.M) or [None, ''])[1].strip().strip('"\'')
    return get('title'), get('description'), get('date')


def field(path, key):
    block = path.read_text().split('---')[1]
    m = re.search(rf'^{key}:\s*(.+)$', block, re.M)
    return m.group(1).strip().strip('"\'') if m else ''


if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    for name, (kicker, title, sub) in PAGES.items():
        card(name, kicker, title, sub)
    for post in sorted((ROOT / 'src' / 'content' / 'blog').glob('*.md')):
        title, desc, date = frontmatter(post)
        card(f'blog-{post.stem}', f'Blog · {date}', title, desc)
    content = ROOT / 'src' / 'content'
    for f in sorted((content / 'guides').glob('*.md')):
        card(f'guide-{f.stem}', f"Guide · {field(f, 'level')}", field(f, 'title'), field(f, 'description'))
    for f in sorted((content / 'faq').glob('*.md')):
        card(f'faq-{f.stem}', 'FAQ', field(f, 'question'), field(f, 'answer'))
    for f in sorted((content / 'communities').glob('*.md')):
        card(f'history-{f.stem}', f"History · {field(f, 'years')}", field(f, 'title'), field(f, 'short'))
    for f in sorted((content / 'games').glob('*.md')):
        card(f'game-{f.stem}', f"Modding · {field(f, 'year')}", field(f, 'title'), field(f, 'short'))
    print('\n'.join(sorted(p.name for p in OUT.glob('*.png'))))
