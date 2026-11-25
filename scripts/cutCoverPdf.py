#!/usr/bin/env python3
"""
인쇄용 표지 PDF(펼친 표지 한 장: 뒷날개 | 뒤표지 | 책등 | 앞표지 | 앞날개)를 재단선·접는 선대로 잘라
서가의 표지 그림과 펼쳐 보기의 날개 그림으로 만든다. PyMuPDF와 Pillow가 필요하다.

  python scripts/cutCoverPdf.py <표지.pdf> <권 번호>
  python scripts/cutCoverPdf.py --all <표지 PDF 폴더> [건너뛸 권 번호 …]
      폴더 안의 `서가명강NN-도서명_표지.pdf`를 모두 자른다.

  → public/covers/NN_{front,back,spine}.jpg (세로 1468px)
    public/preview/NN/flap-{front,back}.jpg (세로 1320px)
    그 권의 전에 있던 그림은 `표지 재단/이전(알라딘 표지)/`에 옮겨 둔다(이미 옮겨 둔 것이 있으면 그대로 둔다).

자르는 법(시리즈의 표지 판형이 같다는 데 기대어 선을 계산한다):
- 바깥 경계는 PDF 1쪽의 재단 상자(TrimBox). 2쪽부터는 후가공용 판·띠지라 쓰지 않는다.
- 날개는 100mm, 앞·뒤표지는 128mm다. 책등은 그 나머지(재단 폭 − 456mm)라 권마다 다르다.
- 면마다 한 쪽씩 따로 든 PDF(46권: 뒷날개·뒤표지·책등·앞표지·앞날개 순서의 다섯 쪽)는 쪽마다의 재단 상자대로 자른다.
끝나면 잰 값(책등·표지의 비율)을 적어 준다: `src/data/books.ts`의 그 권 줄에 옮겨 적고,
날개를 바꿨으면 `python scripts/downloadPreviews.py --colors`로 미리보기 목록을 다시 만든다.
색은 CMYK를 RGB로 바꾼 값이라 인쇄물과 조금 다를 수 있다.
"""
import io
import re
import shutil
import sys
from pathlib import Path

import pymupdf
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
MM = 72 / 25.4
FLAP = 100 * MM
COVER = 128 * MM
COVER_H = 1468
FLAP_H = 1320
KEEP = ROOT / '표지 재단' / '이전(알라딘 표지)'


def panels(doc):
    """다섯 면의 (쪽, 사각형): back-flap, back, spine, front, front-flap"""
    first = doc[0]
    t = first.trimbox
    # 재단 상자가 따로 없는 PDF는 종이 전체가 돌아온다: 도련만큼 면이 밀린 그림이 조용히 나오지 않게 멈춘다
    if abs(t.width - first.mediabox.width) < 1 and abs(t.height - first.mediabox.height) < 1:
        raise ValueError('재단 상자(TrimBox)가 없는 PDF다: 재단 표시의 좌표를 직접 읽어 잘라야 한다')
    if abs(t.height - 188 * MM) > 3:
        raise ValueError('재단 높이가 188mm가 아니다: %.1fmm' % (t.height / MM))
    # 면마다 한 쪽씩 따로 든 파일: 첫 쪽이 날개 한 장 폭이다
    if abs(t.width - FLAP) < 3 and len(doc) >= 5:
        return [(doc[i], doc[i].trimbox) for i in range(5)]
    spine = t.width - 2 * FLAP - 2 * COVER
    if not 10 < spine < 90:
        raise ValueError('책등 폭이 이상하다: %.1fpt (재단 폭 %.1fpt)' % (spine, t.width))
    xs = [t.x0, t.x0 + FLAP, t.x0 + FLAP + COVER, t.x0 + FLAP + COVER + spine, t.x1 - FLAP, t.x1]
    return [(first, pymupdf.Rect(xs[i], t.y0, xs[i + 1], t.y1)) for i in range(5)]


def render(page, rect, height):
    # 두 배로 그린 뒤 줄인다(글자가 또렷하다)
    scale = height * 2 / rect.height
    pixmap = page.get_pixmap(matrix=pymupdf.Matrix(scale, scale), clip=rect, alpha=False)
    image = Image.open(io.BytesIO(pixmap.tobytes('png'))).convert('RGB')
    return image.resize((max(1, round(image.width * height / image.height)), height), Image.LANCZOS)


def keep_old(path: Path) -> None:
    """전의 그림을 옮겨 둔다(같은 이름이 이미 있으면 그것이 원래 것이니 그대로 둔다)"""
    if not path.exists():
        return
    KEEP.mkdir(parents=True, exist_ok=True)
    name = path.name if path.parent.name == 'covers' else '%s_%s' % (path.parent.name, path.name)
    if not (KEEP / name).exists():
        shutil.copy2(path, KEEP / name)


def cut(pdf: str, no: int) -> dict:
    doc = pymupdf.open(pdf)
    back_flap, back, spine, front, front_flap = panels(doc)
    covers = ROOT / 'public' / 'covers'
    preview = ROOT / 'public' / 'preview' / f'{no:02d}'
    preview.mkdir(parents=True, exist_ok=True)
    sizes = {}
    for name, (page, rect), folder, height in [
        ('front', front, covers, COVER_H),
        ('back', back, covers, COVER_H),
        ('spine', spine, covers, COVER_H),
        ('flap-front', front_flap, preview, FLAP_H),
        ('flap-back', back_flap, preview, FLAP_H),
    ]:
        out = folder / (f'{no:02d}_{name}.jpg' if folder == covers else f'{name}.jpg')
        keep_old(out)
        image = render(page, rect, height)
        image.save(out, quality=88, optimize=True, progressive=True)
        sizes[name] = image.size
    result = {
        'no': no,
        'spineAspect': round(sizes['spine'][0] / sizes['spine'][1], 4),
        'coverAspect': round(sizes['front'][0] / sizes['front'][1], 4),
        'spine': sizes['spine'],
        'front': sizes['front'],
        'spineMm': round(spine[1].width / MM, 1),
    }
    print('%02d: 책등 %.1fmm  spineAspect %.4f  coverAspect %.4f  (spine %dx%d, front %dx%d)' % (
        no, result['spineMm'], result['spineAspect'], result['coverAspect'], *sizes['spine'], *sizes['front']), flush=True)
    return result


if __name__ == '__main__':
    args = sys.argv[1:]
    if args[:1] == ['--all'] and len(args) >= 2:
        skip = {int(a) for a in args[2:]}
        for path in sorted(Path(args[1]).glob('서가명강[0-9][0-9]-*_표지.pdf')):
            no = int(re.match(r'서가명강(\d\d)-', path.name).group(1))
            if no in skip:
                continue
            try:
                cut(str(path), no)
            except Exception as error:  # 한 권이 안 되어도 나머지는 자른다
                print('%02d: 자르지 못함 — %s' % (no, error), flush=True)
    elif len(args) == 2:
        cut(args[0], int(args[1]))
    else:
        raise SystemExit(__doc__)
