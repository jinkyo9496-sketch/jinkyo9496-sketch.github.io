#!/usr/bin/env python3
"""
알라딘 '미리보기'의 본문 이미지를 권마다 내려받아 public/preview/NN/pKK.jpg 로 저장하고,
쪽수와 면지 색(본문의 별색: 검정·흰색을 뺀 색)을 src/data/previews.ts 에 적는다.

  python3 scripts/downloadPreviews.py          # 없는 것만 받는다
  python3 scripts/downloadPreviews.py --colors # 받지 않고 색·목록만 다시 만든다

이미지는 가로 900px로 줄여 저장한다(원본 1512px. 책 한 쪽의 텍스처로 충분하다).
"""
import colorsys
import io
import re
import sys
import time
import urllib.request
from collections import Counter
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public' / 'preview'
BOOKS = ROOT / 'src' / 'data' / 'books.ts'
MANIFEST = ROOT / 'src' / 'data' / 'previews.ts'
WIDTH = 900
UA = {'User-Agent': 'Mozilla/5.0'}
# 첫 그림이 어느 쪽 면인지 아는 권(자동 판별보다 우선한다). 인쇄용 본문 PDF를 1쪽부터 자른 권은 recto다(scripts/cutPrintPdf.py)
# 2026-11-25: 전 권의 미리보기를 인쇄용 본문 PDF의 앞 30쪽으로 바꿨다(책의 1쪽부터라 모두 recto)
FIRST_SIDE = {no: 'recto' for no in range(1, 49)}


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as res:
        return res.read()


def books():
    text = BOOKS.read_text(encoding='utf-8')
    return [(int(no), item) for no, item in re.findall(r"book\((\d+),.*?'\d{4}-\d\d-\d\d', '(\d*)'", text)]


def download(no: int, item: str) -> None:
    folder = OUT / f'{no:02d}'
    if folder.exists() and any(folder.glob('p*.jpg')):
        return
    # 책 전체(public/full/NN)를 쓰는 권은 미리보기를 다시 받지 않는다(미리보기 쪽 그림을 폐기한 권)
    if (OUT.parent / 'full' / f'{no:02d}').exists():
        return
    html = fetch(f'https://www.aladin.co.kr/shop/book/wletslookViewer.aspx?ItemId={item}').decode('utf-8', 'ignore')
    urls = {}
    for url, n in re.findall(r'(https://image\.aladin\.co\.kr/[^"\'<> ]*?letslook/[^"\'<> ]*?_t(\d+)l\.jpg)', html):
        urls[int(n)] = url
    if not urls:
        print(f'{no:02d}: 미리보기 없음', flush=True)
        return
    folder.mkdir(parents=True, exist_ok=True)
    for n in sorted(urls):
        try:
            image = Image.open(io.BytesIO(fetch(urls[n]))).convert('RGB')
        except Exception as error:  # 한 쪽이 빠져도 나머지는 받는다
            print(f'{no:02d} p{n}: 실패 {error}', flush=True)
            continue
        if image.width > WIDTH:
            image = image.resize((WIDTH, round(image.height * WIDTH / image.width)), Image.LANCZOS)
        image.save(folder / f'p{n:02d}.jpg', quality=82, optimize=True, progressive=True)
        time.sleep(0.15)
    print(f'{no:02d}: {len(urls)}쪽', flush=True)


def download_flaps(no: int, item: str) -> None:
    """앞날개(_wfl)·뒷날개(_wbl) 그림을 public/preview/NN/flap-front.jpg, flap-back.jpg 로 받는다(세로 1320px)."""
    folder = OUT / f'{no:02d}'
    if (folder / 'flap-front.jpg').exists() and (folder / 'flap-back.jpg').exists():
        return
    html = fetch(f'https://www.aladin.co.kr/shop/book/wletslookViewer.aspx?ItemId={item}').decode('utf-8', 'ignore')
    got = []
    for key, name in (('wfl', 'flap-front'), ('wbl', 'flap-back')):
        found = re.search(r'https://image\.aladin\.co\.kr/[^"\'<> ]*?letslook/[^"\'<> ]*?_' + key + r'\.jpg', html)
        if not found or (folder / f'{name}.jpg').exists():
            continue
        try:
            image = Image.open(io.BytesIO(fetch(found.group(0)))).convert('RGB')
        except Exception as error:
            print(f'{no:02d} {name}: 실패 {error}', flush=True)
            continue
        if image.height > 1320:
            image = image.resize((round(image.width * 1320 / image.height), 1320), Image.LANCZOS)
        folder.mkdir(parents=True, exist_ok=True)
        image.save(folder / f'{name}.jpg', quality=84, optimize=True, progressive=True)
        got.append(name)
        time.sleep(0.15)
    print(f'{no:02d}: 날개 {got or "없음"}', flush=True)


def flap_aspect(folder: Path, name: str):
    path = folder / f'{name}.jpg'
    if not path.exists():
        return 'null'
    size = Image.open(path).size
    return f'{size[0] / size[1]:.4f}'


def spot_colour(folder: Path):
    """본문의 별색: 채도가 있는 픽셀을 색상(hue)으로 모아 가장 많은 묶음의, 가장 진한 쪽 색을 고른다."""
    hues = Counter()
    samples = {}
    for path in sorted(folder.glob('p*.jpg')):
        image = Image.open(path).convert('RGB').resize((90, 132), Image.BILINEAR)
        for r, g, b in image.getdata():
            h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            if s < 0.25 or v < 0.3:
                continue
            key = round(h * 36) % 36
            hues[key] += 1
            samples.setdefault(key, []).append((s, r, g, b))
    if not hues:
        return None
    key = hues.most_common(1)[0][0]
    picked = sorted(samples[key], reverse=True)
    # 가장 진한(채도 높은) 10%의 가운데값: 망점·안티에일리어싱으로 옅어진 픽셀을 뺀다
    top = picked[: max(1, len(picked) // 10)]
    mid = top[len(top) // 2]
    return '#%02x%02x%02x' % mid[1:]


def edge_strips(path: Path):
    image = Image.open(path).convert('RGB').resize((60, 90))
    left = list(image.crop((0, 0, 3, 90)).resize((1, 30)).getdata())
    right = list(image.crop((57, 0, 60, 90)).resize((1, 30)).getdata())
    return left, right


def first_side(no: int, folder: Path) -> str:
    """
    첫 그림이 오른쪽 면(recto)인가 왼쪽 면(verso)인가.
    이 시리즈의 본문은 바깥쪽 가장자리에 별색 띠를 두른 쪽이 많다: 한 낱장의 앞뒤(오른쪽 면 → 다음 왼쪽 면)는
    앞 쪽의 오른쪽 끝과 뒤 쪽의 왼쪽 끝이 둘 다 색이고 서로 닮았다. 그런 짝이 (1,2),(3,4)…에 많으면 홀수 쪽이
    오른쪽 면(첫 그림 = recto), (2,3),(4,5)…에 많으면 짝수 쪽이 오른쪽 면(첫 그림 = verso)이다.
    가르지 못하면 같은 시기의 책을 따른다(14권까지 recto, 그 뒤 verso). 권별 검수가 필요하다.
    """
    if no in FIRST_SIDE:
        return FIRST_SIDE[no]
    strips = [edge_strips(p) for p in sorted(folder.glob('p*.jpg'))]
    coloured = lambda s: sum(1 for c in s if min(c) < 225) / len(s) > 0.3
    close = lambda a, b: sum(abs(x[k] - y[k]) for x, y in zip(a, b) for k in range(3)) / len(a) / 3 < 18
    score = [0, 0]
    for i in range(len(strips) - 1):
        right, left = strips[i][1], strips[i + 1][0]
        if coloured(right) and coloured(left) and close(right, left):
            score[i % 2] += 1
    if score[0] != score[1]:
        return 'recto' if score[0] > score[1] else 'verso'
    return 'recto' if no <= 14 else 'verso'


def kept_endpapers() -> dict:
    """지금 목록에 적힌 면지 색. 쪽 그림을 폐기한 권(책 전체로 확정)은 색을 다시 찾을 수 없으니 이것을 그대로 쓴다"""
    if not MANIFEST.exists():
        return {}
    text = MANIFEST.read_text(encoding='utf-8')
    return {int(no): colour for no, colour in re.findall(r"^\s+(\d+): \{.*?endpaper: '(#[0-9a-f]{6})'", text, re.M)}


def write_manifest() -> None:
    lines = []
    kept = kept_endpapers()
    for no, _ in books():
        folder = OUT / f'{no:02d}'
        pages = sorted(int(p.stem[1:]) for p in folder.glob('p*.jpg')) if folder.exists() else []
        if not pages and not (folder / 'flap-front.jpg').exists():
            continue
        if not pages:
            lines.append(
                f"  {no}: {{ pages: 0, first: 'recto', aspect: 0.68, endpaper: {repr(kept[no]) if no in kept else 'null'}, "
                f"flaps: {{ front: {flap_aspect(folder, 'flap-front')}, back: {flap_aspect(folder, 'flap-back')} }} }},"
            )
            continue
        size = Image.open(folder / f'p{pages[0]:02d}.jpg').size
        colour = spot_colour(folder)
        lines.append(
            f"  {no}: {{ pages: {len(pages)}, first: '{first_side(no, folder)}', aspect: {size[0] / size[1]:.4f}, endpaper: {repr(colour) if colour else 'null'}, "
            f"flaps: {{ front: {flap_aspect(folder, 'flap-front')}, back: {flap_aspect(folder, 'flap-back')} }} }},"
        )
    MANIFEST.write_text(
        '// scripts/downloadPreviews.py 가 만든다. 손으로 고치지 않는다.\n'
        '// pages: 미리보기 쪽수(public/preview/NN/p01.jpg ~), first: 첫 그림이 오른쪽 면(recto)인가 왼쪽 면(verso)인가,\n'
        '// aspect: 한 쪽의 가로/세로, flaps: 앞날개·뒷날개 그림의 가로/세로(flap-front.jpg, flap-back.jpg. 없으면 null),\n'
        '// endpaper: 면지 색(본문에 쓰인 별색. 검정·흰색을 뺀 색). 찾지 못하면 null\n'
        "export interface Preview {\n  pages: number\n  first: 'recto' | 'verso'\n  aspect: number\n  endpaper: string | null\n  flaps: { front: number | null; back: number | null }\n}\n\n"
        'export const previews: Readonly<Record<number, Preview>> = {\n' + '\n'.join(lines) + '\n}\n\n'
        "export const previewPageSrc = (no: number, page: number) =>\n"
        "  `/preview/${String(no).padStart(2, '0')}/p${String(page).padStart(2, '0')}.jpg`\n\n"
        "export const flapSrc = (no: number, side: 'front' | 'back') =>\n"
        "  `/preview/${String(no).padStart(2, '0')}/flap-${side}.jpg`\n",
        encoding='utf-8',
        newline='\n',  # Windows에서 돌려도 줄바꿈은 LF
    )
    print(f'목록: {len(lines)}권', flush=True)


if __name__ == '__main__':
    if '--colors' not in sys.argv:
        for no, item in books():
            try:
                download(no, item)
            except Exception as error:
                print(f'{no:02d}: 실패 {error}', flush=True)
            time.sleep(0.3)
        for no, item in books():
            try:
                download_flaps(no, item)
            except Exception as error:
                print(f'{no:02d}: 날개 실패 {error}', flush=True)
            time.sleep(0.3)
    write_manifest()
