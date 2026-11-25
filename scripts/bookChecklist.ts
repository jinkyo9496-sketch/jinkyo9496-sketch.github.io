/**
 * 신간 점검표: `src/data/books.ts`의 모든 권이 화면에 꼭 필요한 자료를 갖추었는지 본다.
 * 테스트 `tests/bookChecklist.test.ts`가 돌린다(`npm test`). 빠진 것이 있으면 무엇을 채울지 한 줄씩 알린다.
 *
 * 꼭 있어야 하는 것: 학문(`fields.ts`에 정확히 한 번), 대표색(`bookColors.ts`), 표지 그림 세 장(`public/covers/NN_{front,back,spine}.jpg`).
 * 없어도 되는 것(없으면 그 칸이 비어 보일 뿐이다): 부제·소개(`blurbs.ts`), 편집자의 한 마디(`editorNotes.ts`),
 * 저자 소속(`affiliations.ts`), 펼쳐 보기의 미리보기(`previews.ts`).
 * 신간을 넣는 순서는 `docs/신간-추가.md`.
 */
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { bookColors } from '../src/data/bookColors'
import { books, type Book } from '../src/data/books'
import type { ReadableColor } from '../src/data/colorMath'
import { fields, type Field } from '../src/data/fields'

export interface BookSources {
  fields: readonly Field[]
  colors: Readonly<Record<number, ReadableColor>>
  /** `/covers/01_front.jpg` 같은 주소의 파일이 `public/`에 있는가 */
  fileExists: (url: string) => boolean
}

/** 번호가 1권부터 빈틈없이 이어지는가(어긋난 줄을 알린다) */
export const numberingGaps = (list: readonly Pick<Book, 'no'>[]): string[] =>
  list.flatMap((b, i) =>
    b.no === i + 1 ? [] : [`src/data/books.ts의 ${i + 1}번째 책은 ${i + 1}권이어야 한다(지금 ${b.no}권)`],
  )

/** 권마다 빠진 자료를 알리는 글(빠진 것이 없으면 빈 목록) */
export function missingBookData(list: readonly Book[], src: BookSources): string[] {
  const out: string[] = []
  const known = new Set(list.map((b) => b.no))

  for (const b of list) {
    const label = `${b.no}권 ${b.title}`
    const homes = src.fields.filter((f) => f.nos.includes(b.no)).map((f) => f.name)
    if (homes.length === 0) out.push(`${label}: src/data/fields.ts의 학문 하나에 넣는다(번호 ${b.no})`)
    else if (homes.length > 1 || src.fields.some((f) => f.nos.filter((n) => n === b.no).length > 1))
      out.push(`${label}: src/data/fields.ts에서 한 학문에만 둔다(지금 ${homes.join(', ')})`)
    if (!src.colors[b.no])
      out.push(`${label}: src/data/bookColors.ts에 ${b.no}의 대표색을 넣는다(scripts/extractBookColors.ts)`)
    for (const url of [b.images.front, b.images.back, b.images.spine])
      if (!src.fileExists(url)) out.push(`${label}: public${url} 그림을 넣는다`)
  }

  for (const f of src.fields)
    for (const no of f.nos)
      if (!known.has(no)) out.push(`src/data/fields.ts의 ${f.name}에 있는 ${no}권이 src/data/books.ts에 없다`)
  for (const no of Object.keys(src.colors).map(Number))
    if (!known.has(no)) out.push(`src/data/bookColors.ts에 있는 ${no}권이 src/data/books.ts에 없다`)

  return out
}

const publicDir = resolve(import.meta.dirname, '../public')

/** 지금의 책 데이터를 점검한다 */
export const bookChecklist = (): string[] => [
  ...numberingGaps(books),
  ...missingBookData(books, {
    fields,
    colors: bookColors,
    fileExists: (url) => existsSync(resolve(publicDir, '.' + url)),
  }),
]
