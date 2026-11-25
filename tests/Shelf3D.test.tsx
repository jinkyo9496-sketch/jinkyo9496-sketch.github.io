import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { books } from '../src/data/books'
import { tiltFor } from '../src/shelf/hover'
import { CONTEXT_RESTORE_WAIT_MS, Shelf3D } from '../src/shelf3d/Shelf3D'
import type { SceneFactory, ShelfSceneHandle } from '../src/shelf3d/sceneTypes'

const ROW = 630
const BOOK_H = 541.2
const T0 = 3_000_000

/** WebGL 장면을 대신하는 가짜: 무엇을 전달받았는지만 적어 둔다 */
const fakeScene = () => {
  const scene = {
    setStage: vi.fn(),
    setState: vi.fn(),
    setPointer: vi.fn(),
    setPage: vi.fn(),
    setPagePointer: vi.fn(),
    setActive: vi.fn(),
    restore: vi.fn(),
    dispose: vi.fn(),
  } satisfies ShelfSceneHandle
  const create = vi.fn<SceneFactory>(() => scene)
  return { scene, create }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
  vi.setSystemTime(T0)
  vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1440)
  vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(820)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(ROW)
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1440)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    left: 0, top: 0, right: 1440, bottom: ROW, width: 1440, height: ROW, x: 0, y: 0, toJSON: () => ({}),
  })
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

const setup = (props: Partial<Parameters<typeof Shelf3D>[0]> = {}) => {
  const { scene, create } = fakeScene()
  const onOpenCurrent = vi.fn()
  const onCurrentChange = vi.fn()
  const view = render(
    <Shelf3D
      books={books}
      initialIndex={20}
      onOpenCurrent={onOpenCurrent}
      onCurrentChange={onCurrentChange}
      createScene={create}
      {...props}
    />,
  )
  const shelf = screen.getByRole('region', { name: '서가명강 서가' })
  const hit = shelf.querySelector<HTMLElement>('.shelf__hit')!
  const lift = parseFloat(shelf.style.getPropertyValue('--lift'))
  const midY = ROW / 2 - lift
  const li = (no: number) => shelf.querySelector<HTMLElement>(`[data-no="${no}"]`)!
  const button = (no: number) => within(shelf).getByRole('button', { name: `${no}권 ${books[no - 1].title}` })
  const xOf = (no: number) => 720 + parseFloat(button(no).style.getPropertyValue('--x'))
  const hovered = () => Array.from(shelf.querySelectorAll<HTMLElement>('[data-hover]'), (el) => Number(el.dataset.no))
  const move = (clientX: number, clientY: number) => fireEvent.mouseMove(hit, { clientX, clientY })
  const lastPointer = () => scene.setPointer.mock.calls.at(-1)![0]
  const lastState = () => scene.setState.mock.calls.at(-1)![0]
  return { ...view, scene, create, onOpenCurrent, onCurrentChange, shelf, hit, midY, li, button, xOf, hovered, move, lastPointer, lastState }
}

describe('Shelf3D: 줄을 선 서가(웰컴 화면)', () => {
  it('lineup이면 장면에 줄을 선 상태와 줄의 시작 자리(왼쪽 여백)를 넘기고, 펼쳐진 책이 없다', () => {
    const { scene, lastState, shelf, button } = setup({ lineup: true })
    expect(lastState()).toMatchObject({ index: 20, lineup: true })
    // 창 폭 1440: 가운데가 0인 좌표에서 −720 + 20
    expect(scene.setStage.mock.calls.at(-1)![0]).toMatchObject({ lineupLeft: -700 })
    expect(shelf.querySelectorAll('[data-current="true"]')).toHaveLength(0)
    // 책 버튼(포커스 링의 자리)도 줄을 따른다: 1권 책등의 왼쪽 끝이 −700
    const x = parseFloat(button(1).style.getPropertyValue('--x'))
    const w = parseFloat(button(1).style.getPropertyValue('--w'))
    expect(x - w / 2).toBeCloseTo(-700, 1)
    // 현재 책은 그대로다
    expect(button(21)).toHaveAttribute('aria-current', 'true')
  })

  it('평소에는 lineup을 넘기지 않는다', () => {
    const { lastState } = setup()
    expect(lastState()).toEqual({ index: 20, closed: false, moveMs: 680 })
  })
})

describe('Shelf3D: the accessible layer', () => {
  it('draws on a canvas that assistive technology does not see', () => {
    const { shelf, create } = setup()
    const canvas = shelf.querySelector('canvas')!
    expect(canvas).toBeInTheDocument()
    expect(canvas.closest('[aria-hidden="true"]')).not.toBeNull()
    expect(create).toHaveBeenCalledTimes(1)
    expect(create.mock.calls[0][0].canvas).toBe(canvas)
    expect(create.mock.calls[0][0].books).toBe(books)
  })

  it('keeps one real button per book, in order, named "N권 제목"', () => {
    const { shelf } = setup()
    const buttons = within(shelf).getAllByRole('button')
    expect(buttons).toHaveLength(books.length)
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual(books.map((b) => `${b.no}권 ${b.title}`))
    expect(shelf.querySelectorAll('[data-testid="book"]')).toHaveLength(books.length)
  })

  it('marks the current book and keeps only it in the tab order', () => {
    const { shelf, button } = setup()
    const current = within(shelf).getAllByRole('button', { current: true })
    expect(current).toEqual([button(21)])
    expect(button(21)).toHaveAttribute('tabindex', '0')
    expect(within(shelf).getAllByRole('button').filter((b) => b.tabIndex === 0)).toHaveLength(1)
    expect(button(20)).toHaveAttribute('tabindex', '-1')
  })

  it('opens the current book with Enter and with Space', async () => {
    // user-event는 진짜 타이머가 필요하다
    vi.useRealTimers()
    const user = userEvent.setup()
    const { button, onOpenCurrent, onCurrentChange } = setup()
    button(21).focus()
    await user.keyboard('{Enter}')
    expect(onOpenCurrent).toHaveBeenCalledTimes(1)
    await user.keyboard(' ')
    expect(onOpenCurrent).toHaveBeenCalledTimes(2)
    expect(onCurrentChange).not.toHaveBeenCalled()
  })

  it('goes to another book when its button is activated, and focus follows the current book', () => {
    const { button, onCurrentChange, onOpenCurrent } = setup()
    button(21).focus()
    fireEvent.click(button(24))
    expect(onCurrentChange).toHaveBeenCalledWith(23)
    expect(onOpenCurrent).not.toHaveBeenCalled()
    expect(button(24)).toHaveAttribute('aria-current', 'true')
    expect(button(24)).toHaveFocus()
  })

  it('puts each button over its book: spines where the layout says, the cover a little larger', () => {
    const { button } = setup()
    const size = (no: number) => ({
      w: parseFloat(button(no).style.getPropertyValue('--w')),
      h: parseFloat(button(no).style.getPropertyValue('--h')),
    })
    expect(size(25).w).toBeCloseTo(BOOK_H * books[24].spineAspect, 1)
    expect(size(25).h).toBeCloseTo(BOOK_H, 1)
    expect(size(21).w).toBeGreaterThan(BOOK_H * books[20].coverAspect * 1.04)
    expect(parseFloat(button(21).style.getPropertyValue('--x'))).toBeCloseTo(0)
    expect(parseFloat(button(22).style.getPropertyValue('--x'))).toBeGreaterThan(size(21).w / 2)
  })
})

describe('Shelf3D: pointer', () => {
  it('goes to the spine clicked on the flat hit layer', () => {
    const { hit, xOf, midY, onCurrentChange, button } = setup()
    fireEvent.click(hit, { clientX: xOf(24), clientY: midY + 30 })
    expect(onCurrentChange).toHaveBeenCalledWith(23)
    expect(button(24)).toHaveAttribute('aria-current', 'true')
  })

  it('opens the current book when the cover is clicked, leaving focus on its button', () => {
    const { hit, midY, onOpenCurrent, button } = setup()
    fireEvent.click(hit, { clientX: 720, clientY: midY })
    expect(onOpenCurrent).toHaveBeenCalledTimes(1)
    expect(button(21)).toHaveFocus()
  })

  it('does nothing for a click above or below the books', () => {
    const { hit, xOf, midY, onCurrentChange, onOpenCurrent } = setup()
    fireEvent.click(hit, { clientX: xOf(24), clientY: midY + BOOK_H / 2 + 8 })
    expect(onCurrentChange).not.toHaveBeenCalled()
    expect(onOpenCurrent).not.toHaveBeenCalled()
  })

  it('tells the scene which book the pointer is on', () => {
    const { xOf, midY, hovered, move, lastPointer, hit } = setup()
    move(xOf(23), midY + 50)
    expect(hovered()).toEqual([23])
    expect(lastPointer()).toEqual({ hoverIndex: 22, tilt: null })
    expect(hit.dataset.over).toBe('book')
    move(xOf(23), midY + BOOK_H / 2 + 6)
    expect(hovered()).toEqual([])
    expect(lastPointer()).toEqual({ hoverIndex: null, tilt: null })
  })

  it('tilts the centre cover toward the pointer', () => {
    const { midY, move, lastPointer, hovered } = setup()
    const coverW = BOOK_H * books[20].coverAspect
    move(720 + coverW / 4, midY - BOOK_H / 4)
    expect(hovered()).toEqual([21])
    expect(lastPointer()).toEqual({ hoverIndex: 20, tilt: tiltFor({ x: coverW / 4, y: -BOOK_H / 4 }, coverW, BOOK_H) })
  })

  it('clears the hover when the pointer leaves and when a drag starts', () => {
    const { shelf, hit, midY, move, hovered, lastPointer } = setup()
    move(760, midY)
    fireEvent.mouseLeave(hit)
    expect(hovered()).toEqual([])
    expect(lastPointer()).toEqual({ hoverIndex: null, tilt: null })
    move(760, midY)
    fireEvent.pointerDown(shelf, { clientX: 760, clientY: midY, button: 0, pointerId: 1 })
    fireEvent.pointerMove(shelf, { clientX: 750, clientY: midY, pointerId: 1 })
    expect(hovered()).toEqual([])
    expect(lastPointer()).toEqual({ hoverIndex: null, tilt: null })
    move(750, midY)
    expect(hovered()).toEqual([])
  })

  it('clears the hover when the current book changes and holds the tilt until the book is placed', () => {
    const { midY, move, hovered, lastPointer } = setup()
    move(760, midY)
    expect(lastPointer().tilt).not.toBeNull()
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(hovered()).toEqual([])
    expect(lastPointer()).toEqual({ hoverIndex: null, tilt: null })
    vi.setSystemTime(T0 + 700)
    move(761, midY)
    expect(hovered()).toEqual([22])
    expect(lastPointer()).toEqual({ hoverIndex: 21, tilt: null })
    vi.setSystemTime(T0 + 1040)
    move(762, midY)
    expect(lastPointer().tilt).not.toBeNull()
  })
})

describe('Shelf3D: driving the scene', () => {
  it('passes the stage size, the current book and the timing', () => {
    const { scene, lastState } = setup({ moveMs: 680 })
    expect(lastState()).toEqual({ index: 20, closed: false, moveMs: 680 })
    const stage = scene.setStage.mock.calls.at(-1)![0]
    expect(stage.width).toBe(1440)
    expect(stage.height).toBe(ROW)
    expect(stage.bookHeight).toBeCloseTo(BOOK_H, 1)
    expect(stage.pixelRatio).toBeLessThanOrEqual(2)
    expect(scene.setActive).toHaveBeenLastCalledWith(true)
  })

  it('follows a controlled index, glide mode and its pace', () => {
    const { rerender, create, lastState, button } = setup({ currentIndex: 5 })
    const again = (props: object) =>
      rerender(<Shelf3D books={books} createScene={create} currentIndex={5} {...props} />)
    again({ currentIndex: 6, closed: true, moveMs: 240 })
    expect(lastState()).toEqual({ index: 6, closed: true, moveMs: 240 })
    // 지나가는 동안에도 가운데 책이 현재 책이다
    expect(button(7)).toHaveAttribute('aria-current', 'true')
    again({ currentIndex: 6, closed: false, moveMs: 900 })
    expect(lastState()).toEqual({ index: 6, closed: false, moveMs: 900 })
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('tells the scene when the shelf screen is not showing', () => {
    const { rerender, create, scene } = setup({ active: false })
    expect(scene.setActive).toHaveBeenLastCalledWith(false)
    rerender(<Shelf3D books={books} createScene={create} initialIndex={20} active />)
    expect(scene.setActive).toHaveBeenLastCalledWith(true)
  })

  it('disposes the scene and removes its canvas on unmount', () => {
    const { unmount, scene, shelf } = setup()
    const canvas = shelf.querySelector('canvas')!
    unmount()
    expect(scene.dispose).toHaveBeenCalledTimes(1)
    expect(canvas.isConnected).toBe(false)
  })
})

describe('Shelf3D: when WebGL lets us down', () => {
  it('reports a failure when the scene cannot be created', () => {
    const onFail = vi.fn()
    const create = vi.fn<SceneFactory>(() => {
      throw new Error('no context')
    })
    render(<Shelf3D books={books} createScene={create} onFail={onFail} />)
    expect(onFail).toHaveBeenCalledTimes(1)
    expect(onFail.mock.calls[0][0]).toMatch(/WebGL/)
  })

  it('reports a failure when the context is lost and does not come back', () => {
    const onFail = vi.fn()
    const { shelf } = setup({ onFail })
    fireEvent(shelf.querySelector('canvas')!, new Event('webglcontextlost', { cancelable: true }))
    expect(onFail).not.toHaveBeenCalled()
    act(() => void vi.advanceTimersByTime(CONTEXT_RESTORE_WAIT_MS + 10))
    expect(onFail).toHaveBeenCalledTimes(1)
  })

  it('carries on when the context is restored in time', () => {
    const onFail = vi.fn()
    const { shelf, scene } = setup({ onFail })
    const canvas = shelf.querySelector('canvas')!
    const lost = new Event('webglcontextlost', { cancelable: true })
    fireEvent(canvas, lost)
    expect(lost.defaultPrevented).toBe(true)
    act(() => void vi.advanceTimersByTime(CONTEXT_RESTORE_WAIT_MS / 2))
    fireEvent(canvas, new Event('webglcontextrestored'))
    act(() => void vi.advanceTimersByTime(CONTEXT_RESTORE_WAIT_MS * 2))
    expect(onFail).not.toHaveBeenCalled()
    expect(scene.restore).toHaveBeenCalledTimes(1)
  })
})

describe('Shelf3D: the book page', () => {
  it('tells the scene whether a book page is open and which side shows; closed by default', () => {
    const { rerender, create, scene } = setup()
    expect(scene.setPage).toHaveBeenLastCalledWith({ open: false, side: 'front', spread: 0 })
    expect(create.mock.calls[0][0].page).toEqual({ open: false, side: 'front', spread: 0 })
    rerender(<Shelf3D books={books} createScene={create} initialIndex={20} page={{ open: true, side: 'front' }} />)
    expect(scene.setPage).toHaveBeenLastCalledWith({ open: true, side: 'front', spread: 0 })
    rerender(<Shelf3D books={books} createScene={create} initialIndex={20} page={{ open: true, side: 'back' }} />)
    expect(scene.setPage).toHaveBeenLastCalledWith({ open: true, side: 'back', spread: 0 })
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('creates the scene with the page already open when it starts on a page', () => {
    const { create } = setup({ page: { open: true, side: 'front' } })
    expect(create.mock.calls[0][0].page).toEqual({ open: true, side: 'front', spread: 0 })
  })

  it('sends the pointer place over the whole window while a page is open, and stops after', () => {
    const { rerender, create, scene } = setup({ page: { open: true, side: 'front' } })
    fireEvent.pointerMove(window, { clientX: 1440, clientY: 0 })
    expect(scene.setPagePointer).toHaveBeenLastCalledWith({ x: 1, y: -1 })
    fireEvent.pointerMove(window, { clientX: 720, clientY: 615 })
    expect(scene.setPagePointer).toHaveBeenLastCalledWith({ x: 0, y: 0.5 })
    rerender(<Shelf3D books={books} createScene={create} initialIndex={20} page={{ open: false, side: 'front' }} />)
    expect(scene.setPagePointer).toHaveBeenLastCalledWith(null)
    const calls = scene.setPagePointer.mock.calls.length
    fireEvent.pointerMove(window, { clientX: 100, clientY: 100 })
    expect(scene.setPagePointer).toHaveBeenCalledTimes(calls)
  })

  it('drops the shelf hover when a page opens', () => {
    const { rerender, create, move, midY, xOf, hovered, lastPointer } = setup()
    move(xOf(23), midY)
    expect(hovered()).toEqual([23])
    rerender(<Shelf3D books={books} createScene={create} initialIndex={20} page={{ open: true, side: 'front' }} />)
    expect(hovered()).toEqual([])
    expect(lastPointer()).toEqual({ hoverIndex: null, tilt: null })
  })

  it('draws on a host given from outside (the whole screen), placing the shelf row within it', () => {
    const host = document.createElement('div')
    document.body.append(host)
    // 이 요소만의 값(프로토타입의 가짜 값은 다른 요소가 쓴다)
    Object.defineProperty(host, 'clientHeight', { get: () => 820 })
    host.getBoundingClientRect = () => ({
      left: 0, top: -100, right: 1440, bottom: 720, width: 1440, height: 820, x: 0, y: -100, toJSON: () => ({}),
    })
    const { scene, shelf, create } = setup({ canvasHost: host })
    const canvas = create.mock.calls[0][0].canvas
    expect(canvas.parentElement).toBe(host)
    expect(shelf.querySelector('canvas')).toBeNull()
    const stage = scene.setStage.mock.calls.at(-1)![0]
    expect(stage.width).toBe(1440)
    expect(stage.height).toBe(820)
    // 서가 칸은 host의 위에서 100px 내려와 있다(둘의 화면 좌표 차)
    const lift = parseFloat(shelf.style.getPropertyValue('--lift'))
    expect(stage.centreY).toBeCloseTo(100 + ROW / 2 - lift, 3)
    // 캔버스가 잘리는 선(서가 칸의 아래 끝): 바닥 그림자가 그 앞에서 다 옅어지게 장면에 알린다
    expect(stage.rowBottom).toBe(100 + ROW)
    host.remove()
  })
})
