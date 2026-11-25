import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../src/App'
import { books } from '../src/data/books'
import { computeShelfLayout, faceLoadingFor, shelfPointFrom, visibleRadius } from '../src/shelf/layout'
import { Shelf } from '../src/shelf/Shelf'

// 첫 화면은 인트로이고 서가는 1권에서 시작한다(tests/Screens.test.tsx). 여기서는 서가의 47권에서 시작해 본다.
const AT_47 = { screen: 'shelf', index: 46 } as const


afterEach(() => vi.restoreAllMocks())

describe('shelfPointFrom', () => {
  const rect = { left: 10, top: 100, width: 1000, height: 600 }
  it('measures from the horizontal centre of the shelf box', () => {
    expect(shelfPointFrom(rect, 510, 400, 0)).toEqual({ x: 0, y: 0 })
    expect(shelfPointFrom(rect, 610, 380, 0)).toEqual({ x: 100, y: -20 })
  })
  it('follows the books when they are lifted above the vertical centre', () => {
    expect(shelfPointFrom(rect, 510, 380, 20)).toEqual({ x: 0, y: 0 })
    expect(shelfPointFrom(rect, 510, 400, 20)).toEqual({ x: 0, y: 20 })
  })
})

describe('visibleRadius / faceLoadingFor', () => {
  const slots = computeShelfLayout(books, 20, { bookHeight: 541.2, gap: 44, currentGap: 52 })

  it('counts how many books away from the centre still touch the viewport', () => {
    const r = visibleRadius(slots, 20, 720)
    expect(r).toBeGreaterThanOrEqual(5)
    expect(r).toBeLessThanOrEqual(8)
    expect(Math.abs(slots[20 + r].x) - slots[20 + r].faceWidth / 2).toBeLessThan(720)
    expect(visibleRadius(slots, 20, 100000)).toBe(books.length - 1 - 20)
    expect(visibleRadius([], 0, 720)).toBe(0)
  })

  it('loads the current book eagerly on every face', () => {
    expect(faceLoadingFor(20, 20, 6)).toEqual({ front: 'eager', spine: 'eager', back: 'eager' })
  })

  it('loads spines eagerly within the visible window plus three books, lazily beyond', () => {
    expect(faceLoadingFor(11, 20, 6).spine).toBe('eager')
    expect(faceLoadingFor(29, 20, 6).spine).toBe('eager')
    expect(faceLoadingFor(10, 20, 6).spine).toBe('lazy')
    expect(faceLoadingFor(30, 20, 6).spine).toBe('lazy')
  })

  it('loads both covers of the three books nearest the centre', () => {
    expect(faceLoadingFor(17, 20, 6)).toEqual({ front: 'eager', spine: 'eager', back: 'eager' })
    expect(faceLoadingFor(23, 20, 6)).toEqual({ front: 'eager', spine: 'eager', back: 'eager' })
  })

  it('further out loads only the cover that faces the gap: front on the left, back on the right', () => {
    expect(faceLoadingFor(15, 20, 6)).toEqual({ front: 'eager', spine: 'eager', back: 'lazy' })
    expect(faceLoadingFor(25, 20, 6)).toEqual({ front: 'lazy', spine: 'eager', back: 'eager' })
    expect(faceLoadingFor(12, 20, 6)).toEqual({ front: 'lazy', spine: 'eager', back: 'lazy' })
    expect(faceLoadingFor(0, 20, 6)).toEqual({ front: 'lazy', spine: 'lazy', back: 'lazy' })
  })
})

describe('Shelf image loading', () => {
  const img = (no: number, face: 'front' | 'spine' | 'back') =>
    document.querySelector<HTMLImageElement>(`[data-no="${no}"] .book__face--${face} img`)!

  it('does not lazy-load the spines near the centre, and keeps far ones lazy', () => {
    render(<Shelf books={books} initialIndex={46} />)
    expect(img(46, 'spine')).not.toHaveAttribute('loading')
    expect(img(44, 'spine')).not.toHaveAttribute('loading')
    expect(img(46, 'front')).not.toHaveAttribute('loading')
    expect(img(46, 'back')).not.toHaveAttribute('loading')
    expect(img(47, 'back')).not.toHaveAttribute('loading')
    expect(img(1, 'spine')).toHaveAttribute('loading', 'lazy')
    expect(img(1, 'front')).toHaveAttribute('loading', 'lazy')
    expect(img(1, 'back')).toHaveAttribute('loading', 'lazy')
  })

  it('moves the eager window with the current book', () => {
    render(<Shelf books={books} initialIndex={46} />)
    expect(img(20, 'spine')).toHaveAttribute('loading', 'lazy')
    fireEvent.click(screen.getByRole('button', { name: `20권 ${books[19].title}` }))
    expect(img(20, 'front')).not.toHaveAttribute('loading')
    expect(img(19, 'spine')).not.toHaveAttribute('loading')
    expect(img(21, 'spine')).not.toHaveAttribute('loading')
    expect(img(47, 'spine')).toHaveAttribute('loading', 'lazy')
  })
})

describe('Shelf hit-testing with lifted books', () => {
  it('opens the centre book only where the lifted book actually is', () => {
    // 1440×820: 서가 칸 630px, 책 541.2px → 책이 화면 칸 가운데보다 위로 올라간다
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1440)
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(820)
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(630)
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, right: 1440, bottom: 630, width: 1440, height: 630, x: 0, y: 0, toJSON: () => ({}),
    })
    const onOpenCurrent = vi.fn()
    render(<Shelf books={books} initialIndex={46} onOpenCurrent={onOpenCurrent} />)

    const shelf = screen.getByRole('region', { name: '서가명강 서가' })
    const lift = parseFloat(shelf.style.getPropertyValue('--lift'))
    expect(lift).toBeGreaterThan(10)
    const top = 315 - lift - 541.2 / 2
    const bottom = 315 - lift + 541.2 / 2
    const hit = shelf.querySelector('.shelf__hit')!

    fireEvent.click(hit, { clientX: 720, clientY: bottom + 4 }) // 반사 자리: 책이 아니다
    fireEvent.click(hit, { clientX: 720, clientY: top - 4 })
    expect(onOpenCurrent).not.toHaveBeenCalled()
    fireEvent.click(hit, { clientX: 720, clientY: top + 4 })
    expect(onOpenCurrent).toHaveBeenCalledTimes(1)
    fireEvent.click(hit, { clientX: 720, clientY: bottom - 4 })
    expect(onOpenCurrent).toHaveBeenCalledTimes(2)
  })
})

describe('Shelf wheel pinch', () => {
  it('leaves ctrl+wheel (trackpad pinch zoom) to the browser', () => {
    render(<Shelf books={books} initialIndex={46} />)
    const scene = screen.getByRole('region', { name: '서가명강 서가' })
    expect(fireEvent.wheel(scene, { deltaY: 200, ctrlKey: true })).toBe(true)
    expect(screen.getByRole('button', { current: true })).toHaveAccessibleName(/^47권/)
  })
})

describe('Current book announcement', () => {
  const status = () => document.querySelector('.app > [role="status"], main [role="status"]')!

  it('keeps the h1 as a plain heading and announces changes once through a separate status', () => {
    render(<App initial={AT_47} blurbs={{}} />)
    const h1 = screen.getByRole('heading', { level: 1 })
    expect(h1).not.toHaveAttribute('aria-live')
    expect(status()).toHaveAttribute('aria-atomic', 'true')
    expect(status()).toHaveClass('sr-only')
    // 처음에는 알리지 않는다(제목이 이미 읽힌다)
    expect(status()).toBeEmptyDOMElement()

    fireEvent.click(within(screen.getByRole('navigation', { name: '권 이동' })).getByRole('button', { name: '46권 한비자, 권력의 법칙' }))
    expect(status()).toHaveTextContent('46권 한비자, 권력의 법칙')
    expect(status().childNodes).toHaveLength(1)
  })

  it('stays silent when focus is on the shelf: the focused book is already announced', () => {
    render(<App initial={AT_47} blurbs={{}} />)
    const centre = () => within(screen.getByRole('region', { name: '서가명강 서가' })).getByRole('button', { current: true })
    centre().focus()
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(centre()).toHaveFocus()
    expect(status()).toBeEmptyDOMElement()
  })

  it('announces the book inside the detail dialog when it changes there', () => {
    render(<App initial={AT_47} blurbs={{}} />)
    fireEvent.click(within(screen.getByRole('region', { name: '서가명강 서가' })).getByRole('button', { current: true }))
    const dialog = screen.getByRole('dialog')
    const live = dialog.querySelector('[role="status"]')!
    expect(live).toHaveAttribute('aria-atomic', 'true')
    expect(live).toBeEmptyDOMElement()
    fireEvent.keyDown(dialog, { key: 'ArrowLeft' })
    expect(live).toHaveTextContent('46권 한비자, 권력의 법칙')
  })
})
