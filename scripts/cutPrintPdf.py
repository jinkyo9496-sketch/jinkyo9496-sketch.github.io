#!/usr/bin/env python3
"""
인쇄용 본문 PDF(재단 표시가 있는 파일)를 재단선대로 잘라 펼쳐 보기의 그림으로 만든다. PyMuPDF와 Pillow가 필요하다.
그림은 두 곳에 따로 둔다. 어느 쪽을 보일지는 권마다 src/data/readingMode.ts가 정한다.

  미리보기(앞부분 일부)
    python scripts/cutPrintPdf.py <본문.pdf> <권 번호> [첫 쪽] [끝 쪽]
    → public/preview/NN/pKK.jpg (가로 900px). 기본은 1~30쪽.
    - 그 권의 전에 있던 pKK.jpg는 지운다(날개 그림은 그대로). 남겨 둘 그림은 먼저 다른 곳에 옮겨 둔다.
    - 끝나면 목록을 다시 만든다: python scripts/downloadPreviews.py --colors
    - 책의 1쪽(홀수 쪽)부터 자르면 첫 그림이 오른쪽 면이다: downloadPreviews.py의 FIRST_SIDE에 그 권을 'recto'로 적는다.
      짝수 쪽부터 자르면 'verso'다.

  책 전체
    python scripts/cutPrintPdf.py --full <본문.pdf> <권 번호>
    → public/full/NN/pKKK.webp (가로 900px, 처음부터 끝까지. 면지 자리의 색 바탕 쪽은 아래 ENDPAPER_SKIP대로 뺀다). 그 권의 전에 있던 pKKK.webp는 지운다.
    - 목록 src/data/fullBooks.ts는 이 스크립트가 public/full을 읽어 다시 쓴다.
    - 화면에 보이려면 src/data/readingMode.ts에 그 권을 'full'로 적는다.

쪽마다 재단 영역(TrimBox)만 남긴다.
"""
import io
import sys
from pathlib import Path

import pymupdf
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
WIDTH = 900
FULL_LIST = ROOT / 'src' / 'data' / 'fullBooks.ts'

# 책 전체로 자를 때 빼는 쪽: 권 번호 → (앞에서, 뒤에서). 본문 PDF의 앞뒤에 든 면지 자리의 색 바탕 쪽이다
# (펼쳐 보기가 면지를 따로 그리므로 두 번 나오지 않게 뺀다. 2026-11-25 편집자 결정).
# 29~47권은 맨 앞 두 쪽, 29~39권은 글 없는 끝 두 쪽도 뺀다. 34권의 앞 네 쪽은 추천의 말이 인쇄돼 있어 두고,
# 42권은 앞의 색 바탕 네 쪽 가운데 앞 두 쪽만 뺀다(뒤의 두 쪽에는 손글씨가 인쇄돼 있다).
# 40~47권은 끝 두 쪽 가운데 한 쪽에 시리즈 안내가 인쇄돼 있어 둔다. 새 권을 넣을 때는 그 권의 PDF를 보고 여기에 적는다
ENDPAPER_SKIP = {**{no: (2, 2) for no in range(29, 40)}, **{no: (2, 0) for no in range(40, 48)}, 34: (0, 2)}


def render(page) -> Image.Image:
    # 가로 900px의 두 배로 그린 뒤 줄인다(글자가 또렷하다)
    scale = WIDTH * 2 / page.trimbox.width
    pixmap = page.get_pixmap(matrix=pymupdf.Matrix(scale, scale), clip=page.trimbox, alpha=False)
    image = Image.open(io.BytesIO(pixmap.tobytes('png'))).convert('RGB')
    return image.resize((WIDTH, round(image.height * WIDTH / image.width)), Image.LANCZOS)


def cut(pdf: str, no: int, first: int = 1, last: int = 30) -> None:
    doc = pymupdf.open(pdf)
    folder = ROOT / 'public' / 'preview' / f'{no:02d}'
    folder.mkdir(parents=True, exist_ok=True)
    for old in folder.glob('p*.jpg'):
        old.unlink()
    last = min(last, len(doc))
    for n, index in enumerate(range(first - 1, last), start=1):
        render(doc[index]).save(folder / f'p{n:02d}.jpg', quality=82, optimize=True, progressive=True)
    print(f'{no:02d}: {first}~{last}쪽 → {folder}', flush=True)


def cut_full(pdf: str, no: int) -> None:
    doc = pymupdf.open(pdf)
    folder = ROOT / 'public' / 'full' / f'{no:02d}'
    folder.mkdir(parents=True, exist_ok=True)
    for old in folder.glob('p*.webp'):
        old.unlink()
    front, back = ENDPAPER_SKIP.get(no, (0, 0))
    pages = list(doc)[front:len(doc) - back]
    for n, page in enumerate(pages, start=1):
        render(page).save(folder / f'p{n:03d}.webp', quality=80, method=6)
    print(f'{no:02d}: 책 전체 {len(pages)}쪽(PDF {len(doc)}쪽에서 앞 {front}쪽·뒤 {back}쪽을 뺐다) → {folder}', flush=True)
    write_full_list()


def write_full_list() -> None:
    """public/full에 있는 권을 읽어 src/data/fullBooks.ts를 다시 쓴다"""
    rows = []
    for folder in sorted((ROOT / 'public' / 'full').glob('[0-9][0-9]')):
        pages = sorted(folder.glob('p[0-9][0-9][0-9].webp'))
        if not pages:
            continue
        with Image.open(pages[0]) as image:
            aspect = image.width / image.height
        rows.append(f'  {int(folder.name)}: {{ pages: {len(pages)}, aspect: {aspect:.4f} }},\n')
    text = (
        '// scripts/cutPrintPdf.py --full 이 만든다. 손으로 고치지 않는다.\n'
        '// 책 전체를 담은 권(public/full/NN/p001.webp ~). pages: 쪽수, aspect: 한 쪽의 가로/세로. 1쪽(오른쪽 면)부터다\n'
        'export interface FullBook {\n  pages: number\n  aspect: number\n}\n\n'
        'export const fullBooks: Readonly<Record<number, FullBook>> = {\n' + ''.join(rows) + '}\n\n'
        "export const fullPageSrc = (no: number, page: number) => `/full/${String(no).padStart(2, '0')}/p${String(page).padStart(3, '0')}.webp`\n"
    )
    # Windows에서도 LF로 쓴다
    FULL_LIST.write_bytes(text.encode('utf-8'))
    print(f'목록 → {FULL_LIST}', flush=True)


if __name__ == '__main__':
    args = sys.argv[1:]
    if args[:1] == ['--full']:
        if len(args) != 3:
            raise SystemExit(__doc__)
        cut_full(args[1], int(args[2]))
    else:
        if not 2 <= len(args) <= 4:
            raise SystemExit(__doc__)
        cut(args[0], int(args[1]), *(int(a) for a in args[2:4]))
