import { describe, expect, it } from 'vitest'
import { bookHash, parseBookHash, screenFromHash } from '../src/app/bookHash'
import { isBookView, screenReducer, type ScreenAction, type ScreenState } from '../src/app/screen'

const COUNT = 47
const shelf = (index: number): ScreenState => ({ screen: 'shelf', index })
const page = (index: number): ScreenState => ({ screen: 'shelf', index, view: 'book' })
const intro = (index = 0): ScreenState => ({ screen: 'intro', index })
const run = (state: ScreenState, action: ScreenAction) => screenReducer(state, action, COUNT)

describe('book page: opening and closing', () => {
  it('opens the page of the centre book from the shelf', () => {
    expect(run(shelf(10), { type: 'openBook' })).toEqual(page(10))
    expect(isBookView(page(10))).toBe(true)
    expect(isBookView(shelf(10))).toBe(false)
    expect(isBookView(intro())).toBe(false)
  })

  it('can open the page of a given book from anywhere (a link), clamped to the series', () => {
    expect(run(intro(), { type: 'openBook', index: 10 })).toEqual(page(10))
    expect(run(shelf(3), { type: 'openBook', index: 10 })).toEqual(page(10))
    expect(run(page(3), { type: 'openBook', index: 10 })).toEqual(page(10))
    expect(run(shelf(3), { type: 'openBook', index: 99 })).toEqual(page(46))
  })

  it('does nothing when there is no book to open (intro without a book) or it is already open', () => {
    const onIntro = intro()
    expect(run(onIntro, { type: 'openBook' })).toBe(onIntro)
    const open = page(10)
    expect(run(open, { type: 'openBook' })).toBe(open)
    expect(run(open, { type: 'openBook', index: 10 })).toBe(open)
  })

  it('closes back to the shelf with the viewed book in the centre', () => {
    const closed = run(page(12), { type: 'closeBook' })
    expect(closed).toEqual(shelf(12))
    expect(isBookView(closed)).toBe(false)
    const onShelf = shelf(12)
    expect(run(onShelf, { type: 'closeBook' })).toBe(onShelf)
  })

  it('closes with Escape, which means nothing on the shelf or the intro', () => {
    expect(run(page(12), { type: 'key', key: 'Escape' })).toEqual(shelf(12))
    const onShelf = shelf(12)
    expect(run(onShelf, { type: 'key', key: 'Escape' })).toBe(onShelf)
    const onIntro = intro()
    expect(run(onIntro, { type: 'key', key: 'Escape' })).toBe(onIntro)
  })

  it('goes to the intro from a page (the logo): the page is closed', () => {
    const next = run(page(12), { type: 'openIntro' })
    expect(next).toEqual(intro(12))
    expect(isBookView(next)).toBe(false)
    // 다시 서가로 오면 서가다(책 페이지가 아니다)
    expect(isBookView(run(next, { type: 'openShelf' }))).toBe(false)
  })
})

describe('book page: moving between volumes', () => {
  it.each(['ArrowDown', 'ArrowRight', 'PageDown'])('%s goes to the next volume, staying on a page', (key) => {
    expect(run(page(10), { type: 'key', key })).toEqual(page(11))
  })

  it.each(['ArrowUp', 'ArrowLeft', 'PageUp'])('%s goes to the previous volume, staying on a page', (key) => {
    expect(run(page(10), { type: 'key', key })).toEqual(page(9))
  })

  it('the wheel moves one volume per step', () => {
    expect(run(page(10), { type: 'wheel', direction: 'down' })).toEqual(page(11))
    expect(run(page(10), { type: 'wheel', direction: 'up' })).toEqual(page(9))
  })

  it('[ 이전 ] [ 다음 ] move one volume', () => {
    expect(run(page(10), { type: 'next' })).toEqual(page(11))
    expect(run(page(10), { type: 'prev' })).toEqual(page(9))
  })

  it('stops at the first and the last volume: nothing happens, the page stays', () => {
    const first = page(0)
    for (const action of [
      { type: 'wheel', direction: 'up' },
      { type: 'key', key: 'ArrowUp' },
      { type: 'key', key: 'ArrowLeft' },
      { type: 'key', key: 'PageUp' },
      { type: 'prev' },
    ] satisfies ScreenAction[])
      expect(run(first, action)).toBe(first)
    const last = page(46)
    for (const action of [
      { type: 'wheel', direction: 'down' },
      { type: 'key', key: 'ArrowDown' },
      { type: 'key', key: 'ArrowRight' },
      { type: 'key', key: 'PageDown' },
      { type: 'next' },
    ] satisfies ScreenAction[])
      expect(run(last, action)).toBe(last)
  })

  it('choosing a book (the dial, the title band) shows that book’s page', () => {
    expect(run(page(10), { type: 'goTo', index: 30 })).toEqual(page(30))
    const open = page(10)
    expect(run(open, { type: 'goTo', index: 10 })).toBe(open)
  })

  it('ignores Home, End, Space, swipes and [ 서가 보기 ] on a page', () => {
    const open = page(10)
    for (const action of [
      { type: 'key', key: 'Home' },
      { type: 'key', key: 'End' },
      { type: 'key', key: ' ' },
      { type: 'swipe', direction: 'up' },
      { type: 'swipe', direction: 'down' },
      { type: 'openShelf' },
    ] satisfies ScreenAction[])
      expect(run(open, action)).toBe(open)
  })

  it('leaves the shelf rules as they were', () => {
    // 서가의 위는 신간 소개다(2026-11-24. 그 위가 인트로)
    expect(run(shelf(0), { type: 'wheel', direction: 'up' })).toEqual({ screen: 'feature', index: 0 })
    expect(run(shelf(5), { type: 'key', key: 'End' })).toEqual(shelf(46))
    expect(run(intro(), { type: 'goTo', index: 7 })).toEqual(shelf(7))
  })
})

describe('book page: the address (#/book/N)', () => {
  it('writes the hash of a volume', () => {
    expect(bookHash(11)).toBe('#/book/11')
  })

  it('reads a volume number back as an index', () => {
    expect(parseBookHash('#/book/11', COUNT)).toBe(10)
    expect(parseBookHash('#/book/1', COUNT)).toBe(0)
    expect(parseBookHash('#/book/47', COUNT)).toBe(46)
    expect(parseBookHash('#/book/11/', COUNT)).toBe(10)
  })

  it.each(['', '#', '#/', '#/book', '#/book/', '#/book/0', '#/book/48', '#/book/abc', '#/book/1.5', '#/books/3', '#book/3', '#/book/-2'])(
    'ignores %j',
    (hash) => {
      expect(parseBookHash(hash, COUNT)).toBeNull()
    },
  )

  it('gives the first screen for an address: the page of that book, or nothing', () => {
    expect(screenFromHash('#/book/11', COUNT)).toEqual(page(10))
    expect(screenFromHash('', COUNT)).toBeNull()
    expect(screenFromHash('#/book/99', COUNT)).toBeNull()
  })
})
