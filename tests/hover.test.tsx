import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { books } from '../src/data/books'
import { TILT_MAX_X, TILT_MAX_Y, tiltFor, tiltRotateValue } from '../src/shelf/hover'
import { bookAtPoint, computeShelfLayout } from '../src/shelf/layout'
import { Shelf } from '../src/shelf/Shelf'

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('bookAtPoint', () => {
  const H = 500
  const slots = computeShelfLayout(books, 20, { bookHeight: H, gap: 40, currentGap: 50 })
  const right = slots[21]

  it('finds the book whose visible face is under the point', () => {
    expect(bookAtPoint(slots, { x: 0, y: 0 }, H, 20)).toBe(20)
    expect(bookAtPoint(slots, { x: right.x, y: 100 }, H, 20)).toBe(21)
    expect(bookAtPoint(slots, { x: slots[18].x, y: -100 }, H, 20)).toBe(18)
  })

  it('includes the tolerance beside a face, and nothing in the wider gap by the cover', () => {
    expect(bookAtPoint(slots, { x: right.x + right.faceWidth / 2 + 19, y: 0 }, H, 20)).toBe(21)
    const coverEdge = slots[20].faceWidth / 2
    expect(bookAtPoint(slots, { x: coverEdge + 45, y: 0 }, H, 20)).toBeNull()
  })

  it('is nothing above the top or below the bottom of the books (the reflection is not a book)', () => {
    expect(bookAtPoint(slots, { x: 0, y: H / 2 }, H, 20)).toBe(20)
    expect(bookAtPoint(slots, { x: 0, y: -H / 2 }, H, 20)).toBe(20)
    expect(bookAtPoint(slots, { x: 0, y: H / 2 + 1 }, H, 20)).toBeNull()
    expect(bookAtPoint(slots, { x: right.x, y: -H / 2 - 1 }, H, 20)).toBeNull()
  })
})

describe('tiltFor', () => {
  const W = 300
  const H = 500

  it('is flat at the centre of the cover', () => {
    expect(tiltFor({ x: 0, y: 0 }, W, H)).toEqual({ rotateX: 0, rotateY: 0 })
  })

  it('turns the cover toward the pointer: up to 5° sideways, 3° up and down', () => {
    expect(TILT_MAX_Y).toBe(5)
    expect(TILT_MAX_X).toBe(3)
    expect(tiltFor({ x: W / 2, y: 0 }, W, H)).toEqual({ rotateX: 0, rotateY: 5 })
    expect(tiltFor({ x: -W / 2, y: 0 }, W, H)).toEqual({ rotateX: 0, rotateY: -5 })
    // 화면 좌표는 아래가 +y. 위를 가리키면 윗변이 뒤로 눕는다(rotateX +)
    expect(tiltFor({ x: 0, y: -H / 2 }, W, H)).toEqual({ rotateX: 3, rotateY: 0 })
    expect(tiltFor({ x: 0, y: H / 2 }, W, H)).toEqual({ rotateX: -3, rotateY: 0 })
    expect(tiltFor({ x: W / 4, y: H / 4 }, W, H)).toEqual({ rotateX: -1.5, rotateY: 2.5 })
  })

  it('clamps beyond the edges and survives a zero-sized face', () => {
    expect(tiltFor({ x: 900, y: -900 }, W, H)).toEqual({ rotateX: 3, rotateY: 5 })
    expect(tiltFor({ x: -900, y: 900 }, W, H)).toEqual({ rotateX: -3, rotateY: -5 })
    expect(tiltFor({ x: 10, y: 10 }, 0, 0)).toEqual({ rotateX: 0, rotateY: 0 })
  })
})

describe('tiltRotateValue', () => {
  it('writes the two angles as one CSS rotate value (axis + angle)', () => {
    expect(tiltRotateValue({ rotateX: 0, rotateY: 5 })).toBe('0 5 0 5deg')
    expect(tiltRotateValue({ rotateX: 3, rotateY: 0 })).toBe('3 0 0 3deg')
    expect(tiltRotateValue({ rotateX: -3, rotateY: 4 })).toBe('-3 4 0 5deg')
  })
  it('is empty when there is no tilt', () => {
    expect(tiltRotateValue({ rotateX: 0, rotateY: 0 })).toBe('')
  })
})

describe('Shelf hover wiring', () => {
  const ROW = 630
  const BOOK_H = 541.2
  const T0 = 2_000_000

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(T0)
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1440)
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(820)
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(ROW)
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, right: 1440, bottom: ROW, width: 1440, height: ROW, x: 0, y: 0, toJSON: () => ({}),
    })
  })

  const setup = () => {
    render(<Shelf books={books} initialIndex={20} onOpenCurrent={() => {}} />)
    const shelf = screen.getByRole('region', { name: '서가명강 서가' })
    const hit = shelf.querySelector<HTMLElement>('.shelf__hit')!
    const lift = parseFloat(shelf.style.getPropertyValue('--lift'))
    const midY = ROW / 2 - lift
    const li = (no: number) => shelf.querySelector<HTMLElement>(`[data-no="${no}"]`)!
    const xOf = (no: number) => 720 + parseFloat(li(no).style.getPropertyValue('--x'))
    const hovered = () => Array.from(shelf.querySelectorAll<HTMLElement>('[data-hover]'), (el) => Number(el.dataset.no))
    const tilted = () =>
      Array.from(shelf.querySelectorAll<HTMLElement>('.book')).filter((el) => el.style.getPropertyValue('--tilt') !== '')
    const move = (clientX: number, clientY: number) => fireEvent.mouseMove(hit, { clientX, clientY })
    return { shelf, hit, midY, li, xOf, hovered, tilted, move }
  }

  it('marks exactly the one book under the pointer', () => {
    const { xOf, midY, hovered, move, tilted } = setup()
    expect(hovered()).toEqual([])
    move(xOf(23), midY + 50)
    expect(hovered()).toEqual([23])
    move(xOf(17), midY - 200)
    expect(hovered()).toEqual([17])
    expect(tilted()).toEqual([]) // 책등은 기울지 않는다
  })

  it('marks nothing above or below the books', () => {
    const { xOf, midY, hovered, move } = setup()
    move(xOf(23), midY + BOOK_H / 2 + 6)
    expect(hovered()).toEqual([])
    move(xOf(23), midY - BOOK_H / 2 - 6)
    expect(hovered()).toEqual([])
  })

  it('tilts the centre cover toward the pointer and writes it as --tilt on that book', () => {
    const { li, midY, hovered, move, tilted } = setup()
    const coverW = BOOK_H * books[20].coverAspect
    move(720 + coverW / 4, midY - BOOK_H / 4)
    expect(hovered()).toEqual([21])
    expect(tilted()).toEqual([li(21)])
    expect(li(21).style.getPropertyValue('--tilt')).toBe(
      tiltRotateValue(tiltFor({ x: coverW / 4, y: -BOOK_H / 4 }, coverW, BOOK_H)),
    )
    // 책등으로 옮겨 가면 기울임이 풀린다
    move(720 + coverW / 2 + 400, midY)
    expect(tilted()).toEqual([])
  })

  it('clears everything when the pointer leaves', () => {
    const { hit, midY, hovered, move, tilted } = setup()
    move(760, midY)
    expect(hovered()).toEqual([21])
    fireEvent.mouseLeave(hit)
    expect(hovered()).toEqual([])
    expect(tilted()).toEqual([])
  })

  it('clears when a drag starts and stays clear while dragging', () => {
    const { shelf, midY, hovered, move, tilted } = setup()
    move(760, midY)
    fireEvent.pointerDown(shelf, { clientX: 760, clientY: midY, button: 0, pointerId: 1 })
    expect(hovered()).toEqual([21]) // 누르기만 한 것은 끌기가 아니다
    fireEvent.pointerMove(shelf, { clientX: 750, clientY: midY, pointerId: 1 })
    expect(hovered()).toEqual([])
    expect(tilted()).toEqual([])
    move(750, midY)
    expect(hovered()).toEqual([])
    fireEvent.pointerUp(shelf, { clientX: 750, clientY: midY, pointerId: 1 })
    move(751, midY)
    expect(hovered()).toEqual([21])
  })

  it('clears when the current book changes, and holds the tilt until the turn has finished', () => {
    const { midY, hovered, move, tilted, li } = setup()
    move(760, midY)
    expect(tilted()).toEqual([li(21)])
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(hovered()).toEqual([])
    expect(tilted()).toEqual([])
    // 책이 돌아 놓이는 동안(1000ms)에는 표시만 하고 기울이지 않는다
    vi.setSystemTime(T0 + 300)
    move(760, midY)
    expect(hovered()).toEqual([22])
    expect(tilted()).toEqual([])
    vi.setSystemTime(T0 + 700)
    move(761, midY)
    expect(tilted()).toEqual([])
    vi.setSystemTime(T0 + 1040)
    move(762, midY)
    expect(tilted()).toEqual([li(22)])
  })
})
