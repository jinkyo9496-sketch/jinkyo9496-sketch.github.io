import { render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { bookContent, endsAtStore, readerFlaps } from '../src/data/bookContent'
import { aladinUrl, books } from '../src/data/books'
import { BookPage, PREVIEW_END_LABEL, PREVIEW_END_NOTE } from '../src/page/BookPage'
import { maxSpread } from '../src/reader/spread'
import { READER } from '../src/shelf3d/reader'

const shape = { pages: 30, first: 'recto' as const }
const max = maxSpread(shape)

describe('BookPage: 미리보기가 끝난 면의 서점 버튼', () => {
  const setup = (spread: number, props: { storeEnd?: boolean } = { storeEnd: true }) => {
    const handlers = { onGo: vi.fn(), onSpread: vi.fn(), onPeek: vi.fn() }
    render(<BookPage books={books} currentIndex={30} spread={spread} maxSpread={max} preview={shape} {...props} {...handlers} />)
    return handlers
  }
  const link = () => screen.queryByRole('link', { name: PREVIEW_END_LABEL })

  it('shows a link to the bookstore on the last spread, with a line saying the preview ends here', () => {
    setup(max)
    const a = link()!
    expect(a).toHaveAttribute('href', aladinUrl(books[30]))
    expect(a).toHaveAttribute('target', '_blank')
    expect(a).toHaveAttribute('rel', 'noopener noreferrer')
    expect(a).toHaveClass('bracket')
    expect(a.closest('.bookpage__end')).toHaveTextContent(PREVIEW_END_NOTE)
  })

  it('keeps it away until the last spread', () => {
    setup(max - 1)
    expect(link()).toBeNull()
  })
  it('keeps it away while the book is shut', () => {
    setup(0)
    expect(link()).toBeNull()
  })

  it('is not there for a book that is shown whole', () => {
    setup(max, { storeEnd: false })
    expect(link()).toBeNull()
  })

  it('still lets the reader turn back from the last spread', () => {
    const { onSpread } = setup(max)
    screen.getByRole('button', { name: '이전 장' }).click()
    expect(onSpread).toHaveBeenCalledWith(max - 1)
  })

  it('draws on the white page with the shelf colours, not the colours of the book page', () => {
    const css = readFileSync('src/page/bookPage.css', 'utf8')
    const rule = css.slice(css.indexOf('.bookpage__end {'))
    const body = rule.slice(0, rule.indexOf('}'))
    expect(body).toContain('--ink: var(--shelf-ink)')
    expect(body).toContain('--paper: var(--shelf-paper)')
    expect(body).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    // 종이는 장면이 조명으로 그린다: 옅은 먹은 쓰지 않는다
    const all = css.slice(css.indexOf('.bookpage__end {'), css.indexOf('.bookpage__edge[aria-disabled'))
    expect(all).not.toContain('ink-2')
  })

  it('is a quiet grey that turns to full ink under the pointer or the focus, without the black box', () => {
    const css = readFileSync('src/page/bookPage.css', 'utf8')
    const all = css.slice(css.indexOf('.bookpage__end {'), css.indexOf('.bookpage__edge[aria-disabled'))
    const rule = (selector: string) => {
      const at = all.indexOf(selector + ' {')
      expect(at, selector).toBeGreaterThan(-1)
      return all.slice(at, all.indexOf('}', at))
    }
    expect(rule('.bookpage__end .bracket__text')).toContain('color: var(--ink-soft)')
    const hover = rule('.bookpage__end .bracket.bracket:hover .bracket__text')
    expect(hover).toContain('background: none')
    expect(hover).toContain('color: var(--ink)')
    expect(rule('.bookpage__end .bracket.bracket:focus-visible .bracket__text')).toContain('color: var(--ink)')
    expect(rule('.bookpage__end-note')).toContain('color: var(--ink-soft)')
  })

  it('cannot be seen, pressed or focused until the last leaf has landed', () => {
    const css = readFileSync('src/page/bookPage.css', 'utf8')
    const delay = Number(/animation: bookpage-end-in \d+ms linear (\d+)ms both/.exec(css)?.[1])
    expect(delay).toBeGreaterThanOrEqual(READER.turn)
    const frames = css.slice(css.indexOf('@keyframes bookpage-end-in'))
    expect(frames.slice(0, frames.indexOf('to {'))).toContain('visibility: hidden')
  })
})

describe('readerFlaps: 펼친 책에 그릴 날개', () => {
  const flaps = { front: 0.52, back: 0.53 }
  it('leaves out the back flap of a preview (the button is there) and keeps the front flap', () => {
    expect(readerFlaps({ mode: 'preview', pages: 30, flaps })).toEqual({ front: 0.52, back: null })
    for (const book of books) expect(readerFlaps(bookContent(book.no)).back).toBeNull()
  })
  it('keeps both flaps of a book shown whole', () => {
    expect(readerFlaps({ mode: 'full', pages: 240, flaps })).toEqual(flaps)
  })
  it('has no flaps for a book with nothing to open', () => {
    expect(readerFlaps(null)).toEqual({ front: null, back: null })
  })
})

describe('endsAtStore: 끝난 면에 서점 버튼을 두는 권', () => {
  it('is every book right now: all of them are previews', () => {
    for (const book of books) expect(endsAtStore(bookContent(book.no))).toBe(true)
  })

  it('is not a book shown whole, nor a book with nothing to open', () => {
    const preview = bookContent(12)!
    expect(endsAtStore({ ...preview, mode: 'full' })).toBe(false)
    expect(endsAtStore({ ...preview, pages: 0 })).toBe(false)
    expect(endsAtStore(null)).toBe(false)
  })
})
