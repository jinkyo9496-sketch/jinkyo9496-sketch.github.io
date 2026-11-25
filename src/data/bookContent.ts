/**
 * 책 페이지에서 펼쳐 보는 본문: 권마다 미리보기(`previews.ts`)와 책 전체(`fullBooks.ts`) 가운데
 * `readingMode.ts`가 고른 쪽을 돌려준다. 펼쳐 보기는 이 함수만 본다(폴더를 직접 고르지 않는다).
 */
import { fullBooks as allFull, fullPageSrc, type FullBook } from './fullBooks'
import { previewPageSrc, previews as allPreviews, type Preview } from './previews'
import { readingMode, type ReadingMode } from './readingMode'

export interface BookContent {
  /** 실제로 보이는 쪽: 'full'로 적었어도 전체 본문이 없으면 'preview' */
  mode: ReadingMode
  pages: number
  first: 'recto' | 'verso'
  aspect: number
  /** 면지 색과 날개 그림의 비율: 어느 쪽이든 미리보기 목록의 것을 쓴다(날개 그림은 `public/preview/NN/flap-*.jpg`) */
  endpaper: string | null
  flaps: { front: number | null; back: number | null }
  srcOf: (page: number) => string
}

export interface ContentSources {
  modes: Readonly<Partial<Record<number, ReadingMode>>>
  previews: Readonly<Record<number, Preview>>
  fullBooks: Readonly<Record<number, FullBook>>
}

const REAL: ContentSources = { modes: readingMode, previews: allPreviews, fullBooks: allFull }

/** 그 권에서 펼쳐 볼 본문. 보일 것이 없으면 null */
export function bookContent(no: number, { modes, previews, fullBooks }: ContentSources = REAL): BookContent | null {
  const preview = previews[no]
  const full = modes[no] === 'full' ? fullBooks[no] : undefined
  if (full) {
    return {
      mode: 'full',
      pages: full.pages,
      first: 'recto',
      aspect: full.aspect,
      endpaper: preview?.endpaper ?? null,
      flaps: preview?.flaps ?? { front: null, back: null },
      srcOf: (page) => fullPageSrc(no, page),
    }
  }
  if (!preview) return null
  return { mode: 'preview', ...preview, srcOf: (page) => previewPageSrc(no, page) }
}

/**
 * 펼쳐 볼 것이 끝난 면(오른쪽)에 서점으로 가는 버튼을 두는 권인가: 미리보기로 보이는 권이다(2026-11-25).
 * 그런 권은 그 면에 뒷날개를 그리지 않는다. 책 전체로 보이는 권은 책이 정말 끝난 것이라 뒷날개가 나온다
 */
export const endsAtStore = (content: Pick<BookContent, 'mode' | 'pages'> | null | undefined): boolean =>
  content?.mode === 'preview' && content.pages > 0

/** 펼친 책에 그릴 날개(그림의 비율. 없으면 null): 서점으로 가는 버튼이 놓이는 권은 뒷날개를 그리지 않는다. 앞날개는 늘 그대로다 */
export const readerFlaps = (content: Pick<BookContent, 'mode' | 'pages' | 'flaps'> | null | undefined): BookContent['flaps'] => ({
  front: content?.flaps.front ?? null,
  back: endsAtStore(content) ? null : (content?.flaps.back ?? null),
})

/** 배포 결과물에서 뺄 것. dir: `public` 아래의 폴더, pages: true면 본문 그림(pNN.jpg)만 지우고 날개 그림은 남긴다 */
export interface UnusedContent {
  dir: string
  pages: boolean
}

const two = (no: number | string) => String(no).padStart(2, '0')

/** 쓰지 않는 쪽의 본문 그림: 미리보기로 보이는 권의 전체 본문 폴더, 책 전체로 보이는 권의 미리보기 쪽 그림 */
export function unusedContent(sources: ContentSources = REAL): UnusedContent[] {
  const drop: UnusedContent[] = []
  for (const no of Object.keys(sources.fullBooks)) {
    if (bookContent(Number(no), sources)?.mode !== 'full') drop.push({ dir: `full/${two(no)}`, pages: false })
  }
  for (const no of Object.keys(sources.previews)) {
    if (bookContent(Number(no), sources)?.mode === 'full') drop.push({ dir: `preview/${two(no)}`, pages: true })
  }
  return drop
}
