import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { books } from '../src/data/books'
import { BookPage } from '../src/page/BookPage'
import { maxSpread, pileTarget } from '../src/reader/spread'

const shape = { pages: 340, first: 'recto' as const }
const max = maxSpread(shape)

describe('BookPage: 종이 더미의 옆면(책 전체가 든 권)', () => {
  const setup = (spread: number, pile = true) => {
    const handlers = { onGo: vi.fn(), onSpread: vi.fn(), onPeek: vi.fn() }
    render(<BookPage books={books} currentIndex={16} spread={spread} maxSpread={max} preview={shape} pile={pile} {...handlers} />)
    return handlers
  }
  const edge = (name: string) => screen.getByRole('button', { name })
  const box = (el: HTMLElement) =>
    (el.getBoundingClientRect = () => ({
      top: 200,
      height: 500,
      left: 1000,
      width: 40,
      right: 1040,
      bottom: 700,
      x: 1000,
      y: 200,
      toJSON: () => ({}),
    }))

  it('offers an edge on each side of the open book, only for a book with piles', () => {
    setup(40)
    expect(edge('뒤쪽으로 건너뛰기')).toHaveClass('bookpage__edge--right')
    expect(edge('앞쪽으로 건너뛰기')).toHaveClass('bookpage__edge--left')
  })

  it('has no edges on a preview, or while the book is shut', () => {
    setup(4, false)
    expect(screen.queryByRole('button', { name: '뒤쪽으로 건너뛰기' })).toBeNull()
  })
  it('has no edges while the book is shut', () => {
    setup(0)
    expect(screen.queryByRole('button', { name: '뒤쪽으로 건너뛰기' })).toBeNull()
  })

  it('jumps to the spread at the depth that was pressed', () => {
    const { onSpread } = setup(40)
    const right = edge('뒤쪽으로 건너뛰기')
    box(right)
    // 띠는 양옆의 덧댄 10px을 뺀 1010~1030이다
    fireEvent.click(right, { clientX: 1020, detail: 1 })
    expect(onSpread).toHaveBeenLastCalledWith(pileTarget('right', 0.5, 40, shape))
    const left = edge('앞쪽으로 건너뛰기')
    box(left)
    // 왼쪽 더미는 바깥(왼쪽) 끝이 가장 깊다
    fireEvent.click(left, { clientX: 1000, detail: 1 })
    expect(onSpread).toHaveBeenLastCalledWith(1)
  })

  it('jumps ten spreads from the keyboard (no depth to read)', () => {
    const { onSpread } = setup(40)
    fireEvent.click(edge('뒤쪽으로 건너뛰기'), { detail: 0 })
    expect(onSpread).toHaveBeenLastCalledWith(50)
    fireEvent.click(edge('앞쪽으로 건너뛰기'), { detail: 0 })
    expect(onSpread).toHaveBeenLastCalledWith(30)
  })

  it('tells the scene which depth is under the pointer, and writes nothing on the screen about it', () => {
    const { onPeek } = setup(40)
    const right = edge('뒤쪽으로 건너뛰기')
    box(right)
    fireEvent.pointerMove(right, { clientX: 1015, pointerType: 'mouse' })
    expect(onPeek).toHaveBeenLastCalledWith({ side: 'right', corner: 'bottom', depth: 0.25 })
    // 누르면 갈 쪽수는 적지 않는다(2026-11-24 편집자 요청으로 삭제)
    expect(document.querySelector('.bookpage__edge-label')).toBeNull()
    fireEvent.pointerLeave(right)
    expect(onPeek).toHaveBeenLastCalledWith(null)
  })

  it('takes a press on the padding beside the band: the page side is the top leaf, the outer side the bottom one', () => {
    const { onSpread } = setup(40)
    const right = edge('뒤쪽으로 건너뛰기')
    box(right)
    fireEvent.click(right, { clientX: 1003, detail: 1 })
    expect(onSpread).toHaveBeenLastCalledWith(41)
    fireEvent.click(right, { clientX: 1038, detail: 1 })
    expect(onSpread).toHaveBeenLastCalledWith(max)
  })

  it('marks an edge with nothing left to turn', () => {
    const { onSpread } = setup(max)
    const right = edge('뒤쪽으로 건너뛰기')
    expect(right).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(right, { detail: 0 })
    expect(onSpread).not.toHaveBeenCalled()
  })
})
