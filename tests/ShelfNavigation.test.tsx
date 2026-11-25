import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { books } from '../src/data/books'
import { Shelf } from '../src/shelf/Shelf'
import App from '../src/App'

// 첫 화면은 인트로이고 서가는 1권에서 시작한다(tests/Screens.test.tsx). 여기서는 서가의 47권에서 시작해 본다.
const AT_47 = { screen: 'shelf', index: 46 } as const


const currentNo = () => {
  const current = screen.getAllByRole('button', { current: true })
  expect(current).toHaveLength(1)
  return Number(current[0].closest('[data-testid="book"]')!.getAttribute('data-no'))
}
const bookButton = (no: number) =>
  screen.getByRole('button', { name: `${no}권 ${books[no - 1].title}` })
const scene = () => screen.getByRole('region', { name: '서가명강 서가' })

afterEach(() => vi.useRealTimers())

describe('Shelf controls', () => {
  it('renders each book as a named button, the current one marked aria-current', () => {
    render(<Shelf books={books} initialIndex={46} />)
    expect(screen.getAllByRole('button')).toHaveLength(books.length)
    expect(bookButton(42)).toHaveAccessibleName('42권 천문학이라는 위로')
    expect(bookButton(47)).toHaveAttribute('aria-current', 'true')
    expect(bookButton(46)).not.toHaveAttribute('aria-current')
  })

  it('uses a roving tabindex that follows the current book', () => {
    render(<Shelf books={books} initialIndex={46} />)
    const stops = () => screen.getAllByRole('button').filter((b) => b.tabIndex === 0)
    expect(stops()).toEqual([bookButton(47)])
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(stops()).toEqual([bookButton(46)])
    expect(bookButton(47).tabIndex).toBe(-1)
  })

  it('moves focus with the current book when focus is inside the shelf', () => {
    render(<Shelf books={books} initialIndex={46} />)
    bookButton(47).focus()
    fireEvent.keyDown(bookButton(47), { key: 'ArrowLeft' })
    expect(bookButton(46)).toHaveFocus()
  })
})

describe('Shelf keyboard', () => {
  it('ArrowLeft from 47 makes 46 current with its front cover', () => {
    render(<Shelf books={books} initialIndex={46} />)
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(currentNo()).toBe(46)
    const li = bookButton(46).closest('[data-testid="book"]')!
    expect(li).toHaveAttribute('data-current', 'true')
    const front = screen.getByAltText('한비자, 권력의 법칙 앞표지')
    expect(li).toContainElement(front)
    expect(front).not.toHaveAttribute('aria-hidden')
    expect(screen.getByAltText('외계인을 만나는 가장 확실한 방법 앞표지')).toHaveAttribute(
      'aria-hidden',
      'true',
    )
  })

  it('ArrowRight at the last book stays, ArrowLeft at the first stays', () => {
    render(<Shelf books={books} initialIndex={books.length - 1} />)
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(currentNo()).toBe(books.at(-1)!.no)
    fireEvent.keyDown(window, { key: 'Home' })
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(currentNo()).toBe(1)
  })

  it('Home and End jump to the ends', () => {
    render(<Shelf books={books} initialIndex={20} />)
    fireEvent.keyDown(window, { key: 'Home' })
    expect(currentNo()).toBe(1)
    fireEvent.keyDown(window, { key: 'End' })
    expect(currentNo()).toBe(books.at(-1)!.no)
  })

  it('ignores keys with modifiers or typed into a form field', () => {
    render(
      <>
        <input aria-label="검색" />
        <Shelf books={books} initialIndex={46} />
      </>,
    )
    fireEvent.keyDown(window, { key: 'ArrowLeft', metaKey: true })
    fireEvent.keyDown(window, { key: 'ArrowLeft', altKey: true })
    fireEvent.keyDown(window, { key: 'Home', ctrlKey: true })
    fireEvent.keyDown(screen.getByLabelText('검색'), { key: 'ArrowLeft' })
    expect(currentNo()).toBe(47)
  })
})

describe('Shelf click', () => {
  it('clicking a spine makes that book current', async () => {
    const user = userEvent.setup()
    render(<Shelf books={books} initialIndex={46} />)
    await user.click(bookButton(40))
    expect(currentNo()).toBe(40)
    await user.click(screen.getByAltText('천문학이라는 위로 책등'))
    expect(currentNo()).toBe(42)
  })

  it('reports changes through onCurrentChange and can be controlled', () => {
    const onChange = vi.fn()
    const { rerender } = render(
      <Shelf books={books} currentIndex={10} onCurrentChange={onChange} />,
    )
    expect(currentNo()).toBe(11)
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(onChange).toHaveBeenLastCalledWith(11)
    expect(currentNo()).toBe(11) // 부모가 값을 바꾸기 전까지는 그대로
    rerender(<Shelf books={books} currentIndex={11} onCurrentChange={onChange} />)
    expect(currentNo()).toBe(12)
    fireEvent.click(bookButton(12))
    expect(onChange).toHaveBeenCalledTimes(1) // 이미 현재 책이면 알리지 않는다
  })

  it('calls onCurrentChange when uncontrolled too', () => {
    const onChange = vi.fn()
    render(<Shelf books={books} initialIndex={46} onCurrentChange={onChange} />)
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(onChange).toHaveBeenCalledWith(45)
    expect(currentNo()).toBe(46)
  })
})

describe('Shelf wheel', () => {
  const setup = () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(1_000_000)
    render(<Shelf books={books} initialIndex={20} />)
  }

  it('steps once when accumulated delta passes the threshold', () => {
    setup()
    fireEvent.wheel(scene(), { deltaY: 20 })
    expect(currentNo()).toBe(21)
    fireEvent.wheel(scene(), { deltaY: 25 })
    expect(currentNo()).toBe(22)
  })

  it('ignores further deltas during the cooldown, then steps again', () => {
    setup()
    fireEvent.wheel(scene(), { deltaY: 200 })
    fireEvent.wheel(scene(), { deltaY: 200 })
    fireEvent.wheel(scene(), { deltaY: 200 })
    expect(currentNo()).toBe(22)
    vi.setSystemTime(1_000_400)
    fireEvent.wheel(scene(), { deltaY: 200 })
    expect(currentNo()).toBe(23)
  })

  it('moves back on negative deltas and uses horizontal deltas too', () => {
    setup()
    fireEvent.wheel(scene(), { deltaX: -80, deltaY: 3 })
    expect(currentNo()).toBe(20)
    vi.setSystemTime(1_000_400)
    fireEvent.wheel(scene(), { deltaX: 80 })
    expect(currentNo()).toBe(21)
  })

  it('prevents the page from scrolling', () => {
    setup()
    const notPrevented = fireEvent.wheel(scene(), { deltaY: 10 })
    expect(notPrevented).toBe(false)
  })
})

describe('Shelf drag', () => {
  it('dragging left past the threshold steps to later books, one per 70px', () => {
    render(<Shelf books={books} initialIndex={20} />)
    const s = scene()
    fireEvent.pointerDown(s, { clientX: 500, clientY: 300, button: 0, pointerId: 1 })
    fireEvent.pointerMove(s, { clientX: 460, clientY: 300, pointerId: 1 })
    expect(currentNo()).toBe(21)
    fireEvent.pointerMove(s, { clientX: 425, clientY: 300, pointerId: 1 })
    expect(currentNo()).toBe(22)
    fireEvent.pointerMove(s, { clientX: 355, clientY: 300, pointerId: 1 })
    expect(currentNo()).toBe(23)
    fireEvent.pointerUp(s, { clientX: 355, clientY: 300, pointerId: 1 })
    fireEvent.pointerMove(s, { clientX: 100, clientY: 300, pointerId: 1 })
    expect(currentNo()).toBe(23)
  })

  it('dragging right steps to earlier books', () => {
    render(<Shelf books={books} initialIndex={20} />)
    const s = scene()
    fireEvent.pointerDown(s, { clientX: 300, clientY: 300, button: 0, pointerId: 1 })
    fireEvent.pointerMove(s, { clientX: 450, clientY: 300, pointerId: 1 })
    fireEvent.pointerUp(s, { clientX: 450, clientY: 300, pointerId: 1 })
    expect(currentNo()).toBe(19)
  })

  it('a drag that ends on a spine does not also click-select it', () => {
    render(<Shelf books={books} initialIndex={20} />)
    const spine = bookButton(30)
    fireEvent.pointerDown(spine, { clientX: 500, clientY: 300, button: 0, pointerId: 1 })
    fireEvent.pointerMove(spine, { clientX: 425, clientY: 300, pointerId: 1 })
    fireEvent.pointerUp(spine, { clientX: 425, clientY: 300, pointerId: 1 })
    fireEvent.click(spine)
    expect(currentNo()).toBe(22)
    // 다음 번 일반 클릭은 정상 동작
    fireEvent.pointerDown(spine, { clientX: 500, clientY: 300, button: 0, pointerId: 1 })
    fireEvent.pointerUp(spine, { clientX: 501, clientY: 300, pointerId: 1 })
    fireEvent.click(spine)
    expect(currentNo()).toBe(30)
  })
})

describe('App', () => {
  it('owns the shelf state: keyboard moves the current book', () => {
    render(<App initial={AT_47} />)
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    const current = within(scene()).getAllByRole('button', { current: true })
    expect(current).toHaveLength(1)
    expect(current[0]).toHaveAccessibleName('46권 한비자, 권력의 법칙')
  })
})
