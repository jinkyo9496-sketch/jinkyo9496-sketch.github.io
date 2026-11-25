#!/usr/bin/env python3
"""
알라딘의 저자 소개에서 권마다 저자의 소속(첫 문장)을 받아 scripts/affiliations.raw.json 에 적는다.
이 결과를 사람이 다듬어 src/data/affiliations.ts 에 옮긴다('서울대학교'는 뺀다).
  python3 scripts/fetchAffiliations.py
"""
import html as htmllib
import json
import re
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
UA = {'User-Agent': 'Mozilla/5.0'}


def fetch(url: str, referer=None) -> str:
    headers = dict(UA)
    if referer:
        headers['Referer'] = referer
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=30) as res:
        return res.read().decode('utf-8', 'ignore')


def main() -> None:
    text = (ROOT / 'src' / 'data' / 'books.ts').read_text(encoding='utf-8')
    out = {}
    for no, author, item in re.findall(r'book\((\d+), ".*?", "(.*?)", \'\d{4}-\d\d-\d\d\', \'(\d+)\'', text):
        page_url = f'https://www.aladin.co.kr/shop/wproduct.aspx?ItemId={item}'
        try:
            page = fetch(page_url)
            code = re.search(r'isbn: "([0-9A-Za-z]+)"', page).group(1)
            info = fetch(f'https://www.aladin.co.kr/shop/product/getContents.aspx?ISBN={code}&name=AuthorInfo&type=0&date=11', page_url)
            plain = re.sub(r'\s+', ' ', htmllib.unescape(re.sub(r'<[^>]*>', ' ', info)))
            bio = plain.split('받아보세요!')[-1].strip()
            out[no] = {'author': author, 'bio': bio[:900]}
        except Exception as error:
            out[no] = {'author': author, 'error': str(error)}
        print(no, out[no], flush=True)
        time.sleep(0.4)
    (ROOT / 'scripts' / 'affiliations.raw.json').write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding='utf-8')


if __name__ == '__main__':
    main()
