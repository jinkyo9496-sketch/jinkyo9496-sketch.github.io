import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { bookContent, unusedContent } from '../src/data/bookContent'
import { books } from '../src/data/books'
import { fullBooks, fullPageSrc } from '../src/data/fullBooks'
import { previews } from '../src/data/previews'
import { readingMode } from '../src/data/readingMode'

const preview = {
  5: { pages: 25, first: 'verso' as const, aspect: 0.64, endpaper: '#028cda', flaps: { front: 0.5, back: 0.49 } },
  17: { pages: 30, first: 'recto' as const, aspect: 0.68, endpaper: '#a7877a', flaps: { front: 0.52, back: 0.52 } },
}
const full = { 17: { pages: 340, aspect: 0.6808 }, 33: { pages: 200, aspect: 0.68 } }

describe('bookContent: 권마다 미리보기와 전체 본문 가운데 하나를 고른다', () => {
  it('shows the preview unless the book is switched to the full text', () => {
    const c = bookContent(5, { modes: {}, previews: preview, fullBooks: full })!
    expect(c.mode).toBe('preview')
    expect(c.pages).toBe(25)
    expect(c.first).toBe('verso')
    expect(c.srcOf(3)).toBe('/preview/05/p03.jpg')
  })

  it('shows the whole book from the full folder when switched', () => {
    const c = bookContent(17, { modes: { 17: 'full' }, previews: preview, fullBooks: full })!
    expect(c.mode).toBe('full')
    expect(c.pages).toBe(340)
    // 책 전체는 1쪽(오른쪽 면)부터다
    expect(c.first).toBe('recto')
    expect(c.aspect).toBe(0.6808)
    expect(c.srcOf(7)).toBe('/full/17/p007.webp')
    expect(c.srcOf(340)).toBe('/full/17/p340.webp')
    // 면지 색과 날개는 미리보기의 것을 그대로 쓴다
    expect(c.endpaper).toBe('#a7877a')
    expect(c.flaps).toEqual({ front: 0.52, back: 0.52 })
  })

  it('falls back to the preview when the full text has not been made yet', () => {
    const c = bookContent(5, { modes: { 5: 'full' }, previews: preview, fullBooks: full })!
    expect(c.mode).toBe('preview')
    expect(c.srcOf(1)).toBe('/preview/05/p01.jpg')
  })

  it('shows the full text of a book that has no preview at all', () => {
    const c = bookContent(33, { modes: { 33: 'full' }, previews: preview, fullBooks: full })!
    expect(c.mode).toBe('full')
    expect(c.endpaper).toBeNull()
    expect(c.flaps).toEqual({ front: null, back: null })
  })

  it('is null for a book with nothing to show', () => {
    expect(bookContent(7, { modes: {}, previews: preview, fullBooks: full })).toBeNull()
    expect(bookContent(33, { modes: {}, previews: preview, fullBooks: full })).toBeNull()
  })
})

describe('unusedContent: 배포에서 뺄 것(쓰지 않는 쪽의 본문 그림)', () => {
  it('drops the full folder of books still on the preview, and the preview pages of books on the full text', () => {
    const drop = unusedContent({ modes: { 17: 'full' }, previews: preview, fullBooks: full })
    expect(drop).toContainEqual({ dir: 'full/33', pages: false })
    expect(drop).toContainEqual({ dir: 'preview/17', pages: true })
    expect(drop).not.toContainEqual(expect.objectContaining({ dir: 'full/17' }))
    expect(drop).not.toContainEqual(expect.objectContaining({ dir: 'preview/05' }))
  })
})

describe('the real data', () => {
  const pub = (...p: string[]) => join(__dirname, '..', 'public', ...p)

  it('has a made full text for every book switched to it', () => {
    for (const [no, mode] of Object.entries(readingMode)) if (mode === 'full') expect(fullBooks[Number(no)], `${no}권`).toBeDefined()
  })

  // 책 전체의 그림은 2026-11-25에 프로젝트 밖 보관 폴더로 옮겼다(공개된 곳에 올릴 폴더에는 미리보기 30쪽만 둔다).
  // `public/full`에 되돌려 놓은 권이 있으면 그것을, 없으면 보관 폴더를 본다. 어느 쪽에도 없는 권(보관 폴더가 없는 다른 PC)은 건너뛴다.
  const stored = (...p: string[]) => join(__dirname, '..', '..', 'seoga-shelf 비공개 자료', 'public', ...p)
  const pagesIn = (dir: string) => (existsSync(dir) ? readdirSync(dir).filter((f) => /^p\d{3}\.webp$/.test(f)) : [])

  it('lists exactly the pages of the whole books (in public/full, or in the folder they are kept in)', () => {
    for (const [no, book] of Object.entries(fullBooks)) {
      const two = String(no).padStart(2, '0')
      const root = [pub, stored].find((at) => pagesIn(at('full', two)).length > 0)
      if (!root) continue
      expect(pagesIn(root('full', two)).length, `${no}권`).toBe(book.pages)
      expect(existsSync(root(fullPageSrc(Number(no), book.pages))), `${no}권 마지막 쪽`).toBe(true)
    }
  })

  it('has the whole text in public/full for every book switched to it (a kept-away book cannot be shown)', () => {
    for (const [no, mode] of Object.entries(readingMode)) {
      if (mode === 'full') expect(pagesIn(pub('full', String(no).padStart(2, '0'))).length, `${no}권`).toBe(fullBooks[Number(no)].pages)
    }
  })

  it('shows every book as a preview: the first thirty pages of the print PDF (2026-11-25)', () => {
    for (const book of books) {
      const c = bookContent(book.no)!
      expect(c.mode, `${book.no}권`).toBe('preview')
      expect(c.pages, `${book.no}권`).toBe(30)
      // 책의 1쪽(오른쪽 면)부터다
      expect(c.first, `${book.no}권`).toBe('recto')
      // 본문의 판형은 128 × 188mm
      expect(c.aspect, `${book.no}권`).toBeCloseTo(128 / 188, 2)
      expect(c.srcOf(30)).toBe(`/preview/${String(book.no).padStart(2, '0')}/p30.jpg`)
    }
  })

  it('keeps the whole books at hand for when they are cleared (volumes 1–47), switched off for now', () => {
    for (let no = 1; no <= 47; no++) expect(fullBooks[no].pages, `${no}권`).toBeGreaterThan(190)
    expect(Object.values(readingMode).filter((m) => m === 'full')).toHaveLength(0)
    // 한 권을 책 전체로 돌리면 그 권만 바뀐다
    const sources = { modes: { 12: 'full' as const }, previews, fullBooks }
    expect(bookContent(12, sources)!.mode).toBe('full')
    expect(bookContent(12, sources)!.pages).toBe(fullBooks[12].pages)
    expect(bookContent(13, sources)!.mode).toBe('preview')
  })

  it('keeps book 17 in both folders: 30 pages of preview, the whole book (340) in full', () => {
    expect(previews[17].pages).toBe(30)
    expect(fullBooks[17].pages).toBe(340)
    expect(bookContent(17)!.pages).toBe(readingMode[17] === 'full' ? 340 : 30)
  })
})
