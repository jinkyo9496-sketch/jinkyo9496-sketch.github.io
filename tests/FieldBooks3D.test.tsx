import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fieldBooks, fields } from '../src/data/fields'
import { Fields } from '../src/fields/Fields'
import { CONTEXT_RESTORE_WAIT_MS, FieldBooks3D, type FlyReturner } from '../src/fields3d/FieldBooks3D'
import { edgeFadeWidth, fieldsView } from '../src/fields3d/motion'
import { FIELDS_SCROLL, rubberBand } from '../src/fields3d/scroll'
import type { FieldsRow, FieldsSceneFactory, FieldsSceneHandle } from '../src/fields3d/sceneTypes'

const WIDTH = 818
const HEIGHT = 762

/** 가짜 장면에서 멈춘 책(표지가 정면)의 자리: 224px 간격, 폭 190px. 스크롤한 만큼 왼쪽으로 간다 */
const PITCH = 224
const BOX = { top: 270, width: 190, height: 220 }
const boxLeft = (i: number, scroll = 0) => 40 + i * PITCH - scroll
/** 가장 긴 줄(생명과학 6권)의 가짜 값: 끝까지 760px, 책마다 멈출 자리 */
const ROW_6: FieldsRow = { max: 760, stops: [0, 224, 448, 672, 760, 760] }
/** 철학(5권) */
const ROW_5: FieldsRow = { max: 88, stops: [0, 88, 88, 88, 88] }
/** 세 권 이하: 고정 */
const ROW_FIXED: FieldsRow = { max: 0, stops: [0, 0, 0] }

/** WebGL 장면을 대신하는 가짜: 무엇을 전달받았는지만 적어 둔다. `settle(row)`는 책이 다 돌아 멈췄다고 알린다 */
const fakeScene = () => {
  let onRow: ((row: FieldsRow | null) => void) | undefined
  const setScroll = vi.fn<FieldsSceneHandle['setScroll']>()
  const lastScroll = (): number => setScroll.mock.calls.at(-1)?.[0] ?? 0
  const scene = {
    setStage: vi.fn(),
    setField: vi.fn<FieldsSceneHandle['setField']>(),
    setActive: vi.fn(),
    setScroll,
    setHover: vi.fn<FieldsSceneHandle['setHover']>(),
    bookAt: vi.fn<FieldsSceneHandle['bookAt']>(() => null),
    bookBox: vi.fn<FieldsSceneHandle['bookBox']>((i) => ({ left: boxLeft(i, lastScroll()), ...BOX })),
    restore: vi.fn(),
    dispose: vi.fn(),
  } satisfies FieldsSceneHandle
  const create = vi.fn<FieldsSceneFactory>((options) => {
    onRow = options.onRow
    return scene
  })
  const settle = (row: FieldsRow | null) => act(() => onRow?.(row))
  return { scene, create, settle, lastScroll }
}

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(HEIGHT)
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(WIDTH)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

const philosophy = fields[0]
const psychology = fields[1]

describe('FieldBooks3D: 가리키는 학문의 책을 캔버스에 그린다', () => {
  const setup = (props: Partial<Parameters<typeof FieldBooks3D>[0]> = {}) => {
    const fake = fakeScene()
    const { scene, create } = fake
    const onFail = vi.fn()
    const onOpenBook = vi.fn()
    const base = { field: philosophy, active: true, onFail, onOpenBook, createScene: create }
    const view = render(<FieldBooks3D {...base} {...props} />)
    const show = (next: Partial<Parameters<typeof FieldBooks3D>[0]>) => view.rerender(<FieldBooks3D {...base} {...props} {...next} />)
    return { ...view, ...fake, scene, create, onFail, onOpenBook, show }
  }

  it('캔버스는 보조 기술에 보이지 않고, 장면은 그 캔버스와 지금 학문의 책으로 만든다', () => {
    const { container, create } = setup()
    const canvas = container.querySelector('canvas')!
    expect(canvas).toBeInTheDocument()
    expect(canvas.closest('[aria-hidden="true"]')).not.toBeNull()
    expect(create).toHaveBeenCalledTimes(1)
    const options = create.mock.calls[0][0]
    expect(options.canvas).toBe(canvas)
    expect(options.field.key).toBe('철학')
    expect(options.field.books.map((b) => b.no)).toEqual([5, 18, 24, 32, 48])
  })

  it('화면에 들어오기 전에는 장면을 만들지 않는다(WebGL 컨텍스트를 미리 쓰지 않는다)', () => {
    const { container, create, scene, show } = setup({ active: false })
    expect(create).not.toHaveBeenCalled()
    expect(container.querySelector('canvas')).toBeNull()
    show({ active: true })
    expect(create).toHaveBeenCalledTimes(1)
    expect(scene.setActive).toHaveBeenLastCalledWith(true)
  })

  it('책 자리의 크기와 해상도 배율(최대 2)을 장면에 알린다', () => {
    vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(3)
    const { scene } = setup()
    expect(scene.setStage).toHaveBeenLastCalledWith({
      width: WIDTH,
      height: HEIGHT,
      pixelRatio: 2,
      canvas: { width: WIDTH, height: HEIGHT, left: 0, top: 0 },
    })
  })

  it('캔버스의 왼쪽 끝(다이얼 쪽 서랍 입구)에서 책이 옅어지는 폭을 책 자리의 크기에 맞춰 넣는다. 책 버튼(포커스 링)은 옅어지지 않는다', () => {
    const { container } = setup()
    const host = container.querySelector<HTMLElement>('.fbooks3d__canvas')!
    const expected = edgeFadeWidth(fieldsView({ width: WIDTH, height: HEIGHT }))
    expect(parseFloat(host.style.getPropertyValue('--edge-fade'))).toBeCloseTo(expected, 1)
    expect(host.style.getPropertyValue('--edge-fade')).toMatch(/px$/)
    expect(container.querySelector<HTMLElement>('.fbooks3d__books')!.style.getPropertyValue('--edge-fade')).toBe('')
    expect(host.contains(container.querySelector('.fbooks3d__books'))).toBe(false)
  })

  it('가리키는 학문이 바뀌면 그 학문의 책들이 장면에 전해진다', () => {
    const { scene, show } = setup()
    expect(scene.setField).toHaveBeenLastCalledWith({ key: '철학', books: fieldBooks(philosophy) })
    show({ field: psychology })
    const last = scene.setField.mock.calls.at(-1)![0]
    expect(last.key).toBe('심리')
    expect(last.books.map((b) => b.no)).toEqual([28, 30])
    show({ field: fields[8] })
    expect(scene.setField.mock.calls.at(-1)![0].books.map((b) => b.no)).toEqual([...fields[8].nos])
  })

  it('같은 학문으로 다시 그려도 장면에 다시 전하지 않는다', () => {
    const { scene, show } = setup()
    const calls = scene.setField.mock.calls.length
    show({})
    expect(scene.setField).toHaveBeenCalledTimes(calls)
  })

  it('화면을 떠나면 멈추고, 돌아오면 다시 시작한다(장면은 그대로 쓴다)', () => {
    const { scene, create, show } = setup()
    expect(scene.setActive).toHaveBeenLastCalledWith(true)
    show({ active: false })
    expect(scene.setActive).toHaveBeenLastCalledWith(false)
    show({ active: true })
    expect(scene.setActive).toHaveBeenLastCalledWith(true)
    expect(create).toHaveBeenCalledTimes(1)
    expect(scene.dispose).not.toHaveBeenCalled()
  })

  it('떠나 있는 동안 학문이 바뀌어도 돌아왔을 때 그 학문의 책이 전해져 있다', () => {
    const { scene, show } = setup()
    show({ active: false })
    show({ active: false, field: psychology })
    show({ active: true, field: psychology })
    expect(scene.setField.mock.calls.at(-1)![0].key).toBe('심리')
    // 학문을 먼저 알리고 나서 화면을 켠다(켤 때 그 학문이 1부터 등장한다)
    const fieldOrder = scene.setField.mock.invocationCallOrder.at(-1)!
    const activeOrder = scene.setActive.mock.invocationCallOrder.at(-1)!
    expect(fieldOrder).toBeLessThan(activeOrder)
  })

  it('그 학문의 책마다 버튼이 있다(이름 "N권 제목"). 글자 목록을 따로 두지 않는다', () => {
    const { show, container } = setup()
    const list = screen.getByRole('list', { name: '철학의 책' })
    const buttons = within(list).getAllByRole('button')
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual(fieldBooks(philosophy).map((b) => `${b.no}권 ${b.title}`))
    // 모두 탭 순서에 든다(다이얼의 지금 학문 → 책들)
    buttons.forEach((b) => expect(b.tabIndex).toBe(0))
    expect(container.querySelector('.sr-only')).toBeNull()
    expect(list.textContent).toBe('')
    show({ field: psychology })
    expect(within(screen.getByRole('list', { name: '심리의 책' })).getAllByRole('button')).toHaveLength(2)
  })

  it('장면을 만들지 못하면 알린다(부모가 글자 목록으로 바꾼다)', () => {
    const onFail = vi.fn()
    const create = vi.fn<FieldsSceneFactory>(() => {
      throw new Error('no webgl')
    })
    const { container } = render(<FieldBooks3D field={philosophy} active onFail={onFail} createScene={create} />)
    expect(onFail).toHaveBeenCalledTimes(1)
    expect(container.querySelector('canvas')).toBeNull()
  })

  it('컨텍스트를 잃고 돌아오지 않으면 알리고, 곧 돌아오면 다시 그린다', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { container, scene, onFail } = setup()
    const canvas = container.querySelector('canvas')!
    const lost = new Event('webglcontextlost', { cancelable: true })
    act(() => void canvas.dispatchEvent(lost))
    expect(lost.defaultPrevented).toBe(true)
    act(() => void canvas.dispatchEvent(new Event('webglcontextrestored')))
    act(() => void vi.advanceTimersByTime(CONTEXT_RESTORE_WAIT_MS + 10))
    expect(onFail).not.toHaveBeenCalled()
    expect(scene.restore).toHaveBeenCalledTimes(1)

    act(() => void canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true })))
    act(() => void vi.advanceTimersByTime(CONTEXT_RESTORE_WAIT_MS + 10))
    expect(onFail).toHaveBeenCalledTimes(1)
  })

  it('치우면 장면과 캔버스를 버린다', () => {
    const { container, scene, unmount } = setup()
    const host = container.querySelector('.fbooks3d__canvas')!
    unmount()
    expect(scene.dispose).toHaveBeenCalledTimes(1)
    expect(host.querySelector('canvas')).toBeNull()
  })
})

/** 가장 긴 줄: 생명과학(6권). 네 권 이상이라 끌어 넘기고, 화면 밖으로 가려진 책이 있다 */
const longest = fields[4]

describe('FieldBooks3D: 책 줄을 끌어서 넘긴다 (S13)', () => {
  const setup = (props: Partial<Parameters<typeof FieldBooks3D>[0]> = {}) => {
    const fake = fakeScene()
    const onOpenBook = vi.fn()
    const base = { field: longest, active: true, onOpenBook, createScene: fake.create }
    const view = render(<FieldBooks3D {...base} {...props} />)
    const show = (next: Partial<Parameters<typeof FieldBooks3D>[0]>) => view.rerender(<FieldBooks3D {...base} {...props} {...next} />)
    const area = view.container.querySelector<HTMLElement>('.fbooks3d')!
    const down = (x: number, y: number) => fireEvent.pointerDown(area, { clientX: x, clientY: y, button: 0, pointerId: 1 })
    const move = (x: number, y: number) => fireEvent.pointerMove(area, { clientX: x, clientY: y, pointerId: 1 })
    const up = (x: number, y: number) => fireEvent.pointerUp(area, { clientX: x, clientY: y, pointerId: 1 })
    return { ...view, ...fake, onOpenBook, show, area, down, move, up }
  }
  /** 흐르고 되돌아오는 움직임이 끝날 만큼 시간을 보낸다 */
  const settleMotion = (ms = 3000) => act(() => void vi.advanceTimersByTime(ms))

  it('책들이 다 돌기 전에는 끌 수 없다', () => {
    const { scene, area, down, move, up } = setup()
    down(500, 300)
    move(380, 302)
    up(380, 302)
    expect(scene.setScroll).not.toHaveBeenCalled()
    expect(area).not.toHaveAttribute('data-grab')
  })

  it('네 권 이상이면 잡고 좌우로 끄는 만큼 줄이 손을 따라온다', () => {
    const { scene, settle, area, down, move, up, lastScroll } = setup()
    settle(ROW_6)
    expect(area).toHaveAttribute('data-grab')
    down(500, 300)
    move(497, 300) // 문턱(6px) 아래: 아직 끌기가 아니다
    expect(scene.setScroll).not.toHaveBeenCalled()
    move(400, 304)
    expect(lastScroll()).toBe(100)
    expect(area).toHaveAttribute('data-dragging')
    move(350, 310)
    expect(lastScroll()).toBe(150)
    move(420, 310) // 되돌리면 되돌아온다
    expect(lastScroll()).toBe(80)
    up(420, 310)
    expect(area).not.toHaveAttribute('data-dragging')
  })

  it('세 권 이하는 고정이다: 끌어도 움직이지 않고 잡는 커서도 아니다', () => {
    const { scene, settle, area, down, move, up } = setup({ field: fields[2] })
    settle(ROW_FIXED)
    expect(area).not.toHaveAttribute('data-grab')
    down(500, 300)
    move(300, 300)
    up(300, 300)
    expect(scene.setScroll).not.toHaveBeenCalled()
    expect(area).not.toHaveAttribute('data-dragging')
  })

  it('세로로 더 움직인 끌기는 줄을 넘기지 않는다(다이얼 돌리기의 몫)', () => {
    const { scene, settle, down, move, up } = setup()
    settle(ROW_6)
    down(500, 300)
    move(495, 360)
    move(300, 380) // 방향은 문턱을 넘는 순간에 정해진다
    up(300, 380)
    expect(scene.setScroll).not.toHaveBeenCalled()
  })

  it('끝 너머로 끌면 손보다 덜 가고(저항), 놓으면 끝으로 되돌아온다', () => {
    vi.useFakeTimers()
    const { settle, down, move, up, lastScroll } = setup()
    settle(ROW_6)
    down(300, 300)
    move(500, 300) // 처음 자리에서 오른쪽으로 200px
    expect(lastScroll()).toBeCloseTo(rubberBand(-200, ROW_6.max), 6)
    expect(lastScroll()).toBeLessThan(0)
    expect(lastScroll()).toBeGreaterThan(-FIELDS_SCROLL.overscrollPx)
    act(() => void vi.advanceTimersByTime(300)) // 멈췄다가 놓는다
    up(500, 300)
    settleMotion()
    expect(lastScroll()).toBe(0)
  })

  it('손을 떼면 관성으로 조금 더 흐르다 멈춘다', () => {
    vi.useFakeTimers()
    const { scene, settle, down, move, up, lastScroll } = setup()
    settle(ROW_6)
    down(600, 300)
    for (const x of [560, 520, 480]) {
      act(() => void vi.advanceTimersByTime(10))
      move(x, 300)
    }
    expect(lastScroll()).toBe(120)
    up(480, 300)
    settleMotion()
    const after = lastScroll()
    expect(after).toBeGreaterThan(120 + 100)
    expect(after).toBeLessThanOrEqual(ROW_6.max)
    // 멈춘 뒤에는 더 부르지 않는다
    const calls = scene.setScroll.mock.calls.length
    settleMotion(1000)
    expect(scene.setScroll).toHaveBeenCalledTimes(calls)
  })

  it('세게 던져도 끝에서 멈춘다(가장 긴 줄 6권을 끝까지)', () => {
    vi.useFakeTimers()
    const { scene, settle, down, move, up, lastScroll } = setup()
    settle(ROW_6)
    for (let n = 0; n < 4; n++) {
      down(700, 300)
      for (const x of [600, 500, 400, 300]) {
        act(() => void vi.advanceTimersByTime(8))
        move(x, 300)
      }
      up(300, 300)
      settleMotion()
    }
    expect(lastScroll()).toBe(ROW_6.max)
    const all = scene.setScroll.mock.calls.map(([px]) => px)
    expect(Math.max(...all)).toBeLessThan(ROW_6.max + FIELDS_SCROLL.overscrollPx)
  })

  it('흐르는 줄을 다시 잡으면 그 자리에서 멈춘다', () => {
    vi.useFakeTimers()
    const { scene, settle, down, move, up, lastScroll } = setup()
    settle(ROW_6)
    down(600, 300)
    for (const x of [560, 520, 480]) {
      act(() => void vi.advanceTimersByTime(10))
      move(x, 300)
    }
    up(480, 300)
    act(() => void vi.advanceTimersByTime(60))
    const caught = lastScroll()
    down(480, 300)
    const calls = scene.setScroll.mock.calls.length
    settleMotion(1000)
    expect(scene.setScroll).toHaveBeenCalledTimes(calls)
    move(430, 300)
    expect(lastScroll()).toBeCloseTo(caught + 50, 6)
  })

  it('학문이 바뀌면 스크롤은 0에서 다시 시작한다', () => {
    const { settle, down, move, up, lastScroll, show } = setup()
    settle(ROW_6)
    down(500, 300)
    move(300, 300)
    up(300, 300)
    expect(lastScroll()).toBe(200)
    show({ field: philosophy })
    settle(null)
    settle(ROW_5)
    down(500, 300)
    move(470, 300)
    expect(lastScroll()).toBe(30)
  })

  it('←/→ 키는 줄을 한 권씩 넘기고 끝에서 멈춘다', () => {
    vi.useFakeTimers()
    const { settle, lastScroll, scene } = setup()
    settle(ROW_6)
    const key = (k: string) => {
      fireEvent.keyDown(window, { key: k })
      settleMotion(1200)
    }
    key('ArrowRight')
    expect(lastScroll()).toBe(224)
    key('ArrowRight')
    expect(lastScroll()).toBe(448)
    key('ArrowLeft')
    expect(lastScroll()).toBe(224)
    key('ArrowLeft')
    key('ArrowLeft')
    expect(lastScroll()).toBe(0)
    for (let i = 0; i < 6; i++) key('ArrowRight')
    expect(lastScroll()).toBe(ROW_6.max)
    // 이어서 빠르게 두 번 누르면 두 권을 간다(가던 목표에서 한 권 더)
    key('ArrowLeft')
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    settleMotion(1500)
    expect(lastScroll()).toBe(224)
    // 다른 키와 조합 키는 건드리지 않는다
    const calls = scene.setScroll.mock.calls.length
    fireEvent.keyDown(window, { key: 'ArrowRight', shiftKey: true })
    fireEvent.keyDown(window, { key: 'a' })
    settleMotion(500)
    expect(scene.setScroll).toHaveBeenCalledTimes(calls)
  })

  it('키: 다 돌기 전, 세 권 이하, 화면이 보이지 않을 때, 창이 열려 있을 때는 넘기지 않는다', () => {
    vi.useFakeTimers()
    const { settle, scene, show } = setup()
    const press = () => {
      fireEvent.keyDown(window, { key: 'ArrowRight' })
      settleMotion(800)
    }
    press()
    settle(ROW_FIXED)
    press()
    settle(ROW_6)
    show({ active: false })
    press()
    show({ active: true })
    const dialog = document.createElement('dialog')
    dialog.setAttribute('open', '')
    document.body.append(dialog)
    press()
    dialog.remove()
    expect(scene.setScroll).not.toHaveBeenCalled()
    press()
    expect(scene.setScroll).toHaveBeenCalled()
  })

  it('가로 휠(트랙패드의 좌우 쓸기)은 줄을 넘긴다. 세로 휠은 건드리지 않는다', () => {
    const { settle, area, lastScroll, scene } = setup()
    settle(ROW_6)
    expect(fireEvent.wheel(area, { deltaX: 120, deltaY: 4 })).toBe(false)
    expect(lastScroll()).toBe(120)
    fireEvent.wheel(area, { deltaX: -50 })
    expect(lastScroll()).toBe(70)
    // 끝에서는 더 가지 않는다(휠은 저항 없이 멈춘다)
    fireEvent.wheel(area, { deltaX: 5000 })
    expect(lastScroll()).toBe(ROW_6.max)
    fireEvent.wheel(area, { deltaX: -9000 })
    expect(lastScroll()).toBe(0)
    const calls = scene.setScroll.mock.calls.length
    expect(fireEvent.wheel(area, { deltaY: 120 })).toBe(true)
    expect(fireEvent.wheel(area, { deltaX: 80, deltaY: 120 })).toBe(true)
    expect(scene.setScroll).toHaveBeenCalledTimes(calls)
  })

  it('끈 뒤에 따라오는 클릭은 책을 열지 않는다. 그냥 누르면 연다', () => {
    const { scene, settle, area, down, move, up, onOpenBook } = setup()
    settle(ROW_6)
    scene.bookAt.mockReturnValue(1)
    down(500, 300)
    move(440, 300)
    up(440, 300)
    fireEvent.click(area, { clientX: 440, clientY: 300 })
    expect(onOpenBook).not.toHaveBeenCalled()
    // 문턱 아래로 흔들린 것은 클릭이다
    down(440, 300)
    move(437, 302)
    up(437, 302)
    fireEvent.click(area, { clientX: 437, clientY: 302 })
    expect(onOpenBook).toHaveBeenCalledTimes(1)
  })

  it('세 권 이하에서도 끈 뒤의 클릭은 책을 열지 않는다', () => {
    const { scene, settle, area, down, move, up, onOpenBook } = setup({ field: fields[2] })
    settle(ROW_FIXED)
    scene.bookAt.mockReturnValue(0)
    down(500, 300)
    move(400, 300)
    up(400, 300)
    fireEvent.click(area, { clientX: 400, clientY: 300 })
    expect(onOpenBook).not.toHaveBeenCalled()
  })
})

describe('FieldBooks3D: 멈춘 책을 고른다 (S14)', () => {
  const setup = (props: Partial<Parameters<typeof FieldBooks3D>[0]> = {}) => {
    const fake = fakeScene()
    const onOpenBook = vi.fn()
    const base = { field: longest, active: true, onOpenBook, createScene: fake.create }
    const view = render(<FieldBooks3D {...base} {...props} />)
    const area = view.container.querySelector<HTMLElement>('.fbooks3d')!
    const buttons = () => within(screen.getByRole('list', { name: '생명과학의 책' })).getAllByRole('button')
    return { ...view, ...fake, onOpenBook, area, buttons }
  }
  const books = fieldBooks(longest)

  it('책을 누르면 그 책을 알리고, 그 책의 버튼에 포커스를 둔다', () => {
    const { scene, settle, area, onOpenBook, buttons } = setup()
    settle(ROW_6)
    scene.bookAt.mockImplementation((x) => (x > 250 && x < 450 ? 1 : null))
    fireEvent.click(area, { clientX: 300, clientY: 380 })
    expect(scene.bookAt).toHaveBeenLastCalledWith(300, 380)
    expect(onOpenBook).toHaveBeenCalledTimes(1)
    expect(onOpenBook).toHaveBeenLastCalledWith(books[1], expect.any(Function))
    expect(buttons()[1]).toHaveFocus()
    // 책이 없는 자리
    fireEvent.click(area, { clientX: 600, clientY: 380 })
    expect(onOpenBook).toHaveBeenCalledTimes(1)
  })

  it('포인터가 책 위에 있으면 누를 수 있다는 표시를 한다', () => {
    const { scene, settle, area } = setup()
    settle(ROW_6)
    scene.bookAt.mockImplementation((x) => (x > 250 && x < 450 ? 1 : null))
    fireEvent.pointerMove(area, { clientX: 300, clientY: 380, pointerId: 1 })
    expect(area.dataset.over).toBe('book')
    fireEvent.pointerMove(area, { clientX: 600, clientY: 380, pointerId: 1 })
    expect(area.dataset.over).toBe('')
  })

  it('마우스 포인터를 올린 책을 장면에 알린다(그 책이 살짝 돈다). 책 밖으로 나가면 거둔다', () => {
    const { scene, settle, area } = setup()
    settle(ROW_6)
    scene.bookAt.mockImplementation((x) => (x > 250 && x < 450 ? 1 : null))
    fireEvent.pointerMove(area, { clientX: 300, clientY: 380, pointerId: 1, pointerType: 'mouse' })
    expect(scene.setHover).toHaveBeenLastCalledWith(1)
    fireEvent.pointerMove(area, { clientX: 600, clientY: 380, pointerId: 1, pointerType: 'mouse' })
    expect(scene.setHover).toHaveBeenLastCalledWith(null)
    fireEvent.pointerMove(area, { clientX: 300, clientY: 380, pointerId: 1, pointerType: 'mouse' })
    expect(scene.setHover).toHaveBeenLastCalledWith(1)
    fireEvent.pointerLeave(area, { pointerId: 1, pointerType: 'mouse' })
    expect(scene.setHover).toHaveBeenLastCalledWith(null)
  })

  it('포인터 반응은 마우스에서만: 터치와 펜으로는 책이 돌지 않는다', () => {
    const { scene, settle, area } = setup()
    settle(ROW_6)
    scene.bookAt.mockImplementation(() => 1)
    fireEvent.pointerMove(area, { clientX: 300, clientY: 380, pointerId: 1, pointerType: 'touch' })
    fireEvent.pointerMove(area, { clientX: 310, clientY: 380, pointerId: 2, pointerType: 'pen' })
    expect(scene.setHover.mock.calls.filter(([i]) => i !== null)).toEqual([])
  })

  it('끄는 동안에는 포인터 반응을 거둔다. 손을 뗀 뒤 다시 움직이면 돌아온다', () => {
    const { scene, settle, area } = setup()
    settle(ROW_6)
    scene.bookAt.mockImplementation(() => 1)
    const at = (x: number) => ({ clientX: x, clientY: 300, pointerId: 1, pointerType: 'mouse', button: 0 })
    fireEvent.pointerMove(area, at(500))
    expect(scene.setHover).toHaveBeenLastCalledWith(1)
    fireEvent.pointerDown(area, at(500))
    fireEvent.pointerMove(area, at(440))
    expect(area).toHaveAttribute('data-dragging')
    expect(scene.setHover).toHaveBeenLastCalledWith(null)
    fireEvent.pointerMove(area, at(400))
    expect(scene.setHover).toHaveBeenLastCalledWith(null)
    fireEvent.pointerUp(area, at(400))
    fireEvent.pointerMove(area, at(401))
    expect(scene.setHover).toHaveBeenLastCalledWith(1)
  })

  it('세 권 이하의 고정된 줄에서도 끄는 동안에는 포인터 반응을 거둔다', () => {
    const { scene, settle, area } = setup({ field: psychology })
    settle(ROW_FIXED)
    scene.bookAt.mockImplementation(() => 0)
    const at = (x: number) => ({ clientX: x, clientY: 300, pointerId: 1, pointerType: 'mouse', button: 0 })
    fireEvent.pointerMove(area, at(300))
    expect(scene.setHover).toHaveBeenLastCalledWith(0)
    fireEvent.pointerDown(area, at(300))
    fireEvent.pointerMove(area, at(240))
    expect(scene.setHover).toHaveBeenLastCalledWith(null)
  })

  it('책이 다 돌기 전(도는 동안)에는 포인터를 올려도 알리지 않는다', () => {
    const { scene, area } = setup()
    scene.bookAt.mockImplementation(() => 1)
    fireEvent.pointerMove(area, { clientX: 300, clientY: 380, pointerId: 1, pointerType: 'mouse' })
    expect(scene.setHover.mock.calls.filter(([i]) => i !== null)).toEqual([])
  })

  it('키보드: 책의 버튼에서 Enter·Space로 그 책을 연다', async () => {
    const user = userEvent.setup()
    const { settle, onOpenBook, buttons } = setup()
    settle(ROW_6)
    buttons()[2].focus()
    await user.keyboard('{Enter}')
    expect(onOpenBook).toHaveBeenLastCalledWith(books[2], expect.any(Function))
    buttons()[0].focus()
    await user.keyboard(' ')
    expect(onOpenBook).toHaveBeenLastCalledWith(books[0], expect.any(Function))
    expect(onOpenBook).toHaveBeenCalledTimes(2)
  })

  it('버튼은 멈춘 책의 자리에 놓인다(포커스 링이 책을 두른다). 줄을 넘기면 따라간다', () => {
    const { settle, area, buttons } = setup()
    // 다 돌기 전에는 자리를 모른다
    buttons().forEach((b) => expect(b).not.toHaveAttribute('data-placed'))
    settle(ROW_6)
    buttons().forEach((b, i) => {
      expect(b).toHaveAttribute('data-placed')
      expect(b.style.left).toBe(`${boxLeft(i)}px`)
      expect(b.style.top).toBe(`${BOX.top}px`)
      expect(b.style.width).toBe(`${BOX.width}px`)
      expect(b.style.height).toBe(`${BOX.height}px`)
    })
    fireEvent.pointerDown(area, { clientX: 500, clientY: 300, button: 0, pointerId: 1 })
    fireEvent.pointerMove(area, { clientX: 400, clientY: 300, pointerId: 1 })
    buttons().forEach((b, i) => expect(b.style.left).toBe(`${boxLeft(i, 100)}px`))
    // 다시 움직이면(학문이 바뀌는 중) 자리를 지운다
    settle(null)
    buttons().forEach((b) => expect(b).not.toHaveAttribute('data-placed'))
  })

  it('화면 밖(스크롤로 가려진) 책에 포커스가 가면 줄이 그 책이 보이게 넘어간다', () => {
    vi.useFakeTimers()
    const { settle, buttons, lastScroll, scene } = setup()
    settle(ROW_6)
    act(() => buttons()[1].focus()) // 보이는 책: 그대로
    act(() => void vi.advanceTimersByTime(1200))
    expect(scene.setScroll).not.toHaveBeenCalled()
    act(() => buttons()[5].focus())
    act(() => void vi.advanceTimersByTime(1500))
    expect(lastScroll()).toBeCloseTo(boxLeft(5) + BOX.width + FIELDS_SCROLL.revealMarginPx - WIDTH, 6)
    act(() => buttons()[0].focus())
    act(() => void vi.advanceTimersByTime(1500))
    // 첫 책은 왼쪽 끝이 여백만큼 안으로 들어온 자리(더 되돌릴 수 있어도 필요한 만큼만 넘긴다)
    expect(lastScroll()).toBeCloseTo(boxLeft(0) - FIELDS_SCROLL.revealMarginPx, 6)
  })
})

describe('FieldBooks3D: 누른 책이 책 페이지의 자리로 날아간다', () => {
  const books = fieldBooks(longest)
  const PLAN = { page: { width: 1440, height: 900, centreY: 474, bookHeight: 594 }, veil: '#0487a9' }
  const setup = (props: Partial<Parameters<typeof FieldBooks3D>[0]> = {}, canFly: boolean | null = true) => {
    const fake = fakeScene()
    const flyOut = vi.fn<NonNullable<FieldsSceneHandle['flyOut']>>(() => canFly === true)
    const scene: FieldsSceneHandle = canFly === null ? fake.scene : { ...fake.scene, flyOut }
    const create = vi.fn<FieldsSceneFactory>((options) => {
      fake.create(options)
      return scene
    })
    const onOpenBook = vi.fn<NonNullable<Parameters<typeof FieldBooks3D>[0]['onOpenBook']>>()
    const base = { field: longest, active: true, onOpenBook, createScene: create }
    const view = render(<FieldBooks3D {...base} {...props} />)
    const show = (next: Partial<Parameters<typeof FieldBooks3D>[0]>) => view.rerender(<FieldBooks3D {...base} {...props} {...next} />)
    const area = view.container.querySelector<HTMLElement>('.fbooks3d')!
    const host = view.container.querySelector<HTMLElement>('.fbooks3d__canvas')!
    const buttons = () => within(screen.getByRole('list', { name: '생명과학의 책' })).getAllByRole('button')
    return { ...view, ...fake, flyOut, onOpenBook, area, host, buttons, show }
  }

  it('책을 고르면 부모에게 그 책과 "날려 보내기"를 넘긴다. 부모가 부르면 장면이 그 책을 날린다', () => {
    const { settle, scene, area, onOpenBook, flyOut } = setup()
    settle(ROW_6)
    scene.bookAt.mockReturnValue(2)
    fireEvent.click(area, { clientX: 300, clientY: 380 })
    expect(onOpenBook).toHaveBeenLastCalledWith(books[2], expect.any(Function))
    // 부르기 전에는 날아가지 않는다(부모가 책 페이지를 열 수 있을 때만 부른다)
    expect(flyOut).not.toHaveBeenCalled()
    const landed = vi.fn()
    const fly = onOpenBook.mock.calls[0][1]
    expect(fly(PLAN, landed)).toBe(true)
    expect(flyOut).toHaveBeenCalledWith(2, PLAN, landed)
  })

  it('장면이 날릴 수 없으면(책이 다 돌기 전 등) false를 돌려준다. 날아가기를 모르는 장면도 마찬가지다', () => {
    const refused = setup({}, false)
    refused.settle(ROW_6)
    refused.scene.bookAt.mockReturnValue(1)
    fireEvent.click(refused.area, { clientX: 300, clientY: 380 })
    expect(refused.onOpenBook.mock.calls[0][1](PLAN, () => {})).toBe(false)
    refused.unmount()

    const old = setup({}, null)
    old.settle(ROW_6)
    old.scene.bookAt.mockReturnValue(1)
    fireEvent.click(old.area, { clientX: 300, clientY: 380 })
    expect(old.onOpenBook.mock.calls[0][1](PLAN, () => {})).toBe(false)
  })

  it('키보드(Enter)로 골라도 같은 "날려 보내기"가 넘어간다', async () => {
    const user = userEvent.setup()
    const { settle, onOpenBook, buttons, flyOut } = setup()
    settle(ROW_6)
    buttons()[3].focus()
    await user.keyboard('{Enter}')
    expect(onOpenBook).toHaveBeenLastCalledWith(books[3], expect.any(Function))
    onOpenBook.mock.calls[0][1](PLAN, () => {})
    expect(flyOut).toHaveBeenCalledWith(3, PLAN, expect.any(Function))
  })

  it('날아가기 시작하면 흐르던 줄은 그 자리에서 멈춘다', () => {
    vi.useFakeTimers()
    const { settle, scene, area, onOpenBook, buttons } = setup()
    settle(ROW_6)
    act(() => buttons()[5].focus()) // 줄이 그 책 쪽으로 흐르기 시작한다
    act(() => void vi.advanceTimersByTime(60))
    scene.bookAt.mockReturnValue(1)
    fireEvent.click(area, { clientX: 300, clientY: 380 })
    onOpenBook.mock.calls[0][1](PLAN, () => {})
    const calls = scene.setScroll.mock.calls.length
    act(() => void vi.advanceTimersByTime(1500))
    expect(scene.setScroll.mock.calls.length).toBe(calls)
  })

  it('캔버스의 자리: 화면을 찾지 못하면 책 자리와 같다. 그 값을 장면과 CSS에 넘긴다', () => {
    const { scene, host } = setup()
    expect(scene.setStage.mock.calls.at(-1)![0].canvas).toEqual({ width: WIDTH, height: HEIGHT, left: 0, top: 0 })
    expect(host.style.getPropertyValue('--stage-left')).toBe('0px')
    expect(host.style.getPropertyValue('--stage-top')).toBe('0px')
    expect(host.style.getPropertyValue('--canvas-w')).toBe(`${WIDTH}px`)
    expect(host.style.getPropertyValue('--canvas-h')).toBe(`${HEIGHT}px`)
  })

  it('캔버스는 화면(.screen) 전체를 덮는다: 책 자리가 그 안에서 놓인 자리를 재서 넘긴다', () => {
    const rect = (left: number, top: number) => ({ left, top, right: left, bottom: top, width: 0, height: 0, x: left, y: top, toJSON: () => ({}) })
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return this.classList.contains('fbooks3d') ? rect(420, 1890) : this.classList.contains('screen') ? rect(0, 1800) : rect(0, 0)
    })
    const fake = fakeScene()
    const view = render(
      <div className="screen">
        <FieldBooks3D field={longest} active createScene={fake.create} />
      </div>,
    )
    expect(fake.scene.setStage.mock.calls.at(-1)![0]).toEqual({
      width: WIDTH,
      height: HEIGHT,
      pixelRatio: 1,
      canvas: { width: WIDTH, height: HEIGHT, left: 420, top: 90 },
    })
    const host = view.container.querySelector<HTMLElement>('.fbooks3d__canvas')!
    expect(host.style.getPropertyValue('--stage-left')).toBe('420px')
    expect(host.style.getPropertyValue('--stage-top')).toBe('90px')
  })

  it('전환의 단계를 캔버스에 적는다(fly → handoff → 없음)', () => {
    const { host, show } = setup()
    expect(host).not.toHaveAttribute('data-flight')
    show({ flight: 'fly' })
    expect(host).toHaveAttribute('data-flight', 'fly')
    show({ flight: 'handoff' })
    expect(host).toHaveAttribute('data-flight', 'handoff')
    show({ flight: null })
    expect(host).not.toHaveAttribute('data-flight')
  })

  it('전환이 끝났는데 화면이 그대로 보이면(전환 중에 책 페이지가 닫혔다) 책들이 처음부터 다시 등장한다', () => {
    const { scene, show } = setup()
    show({ flight: 'fly' })
    scene.setActive.mockClear()
    show({ flight: null })
    expect(scene.setActive.mock.calls.map((c) => c[0])).toEqual([false, true])
  })

  it('전환이 끝나며 화면도 떠났으면 그냥 멈춘다(다시 등장시키지 않는다)', () => {
    const { scene, show } = setup()
    show({ flight: 'handoff' })
    scene.setActive.mockClear()
    show({ flight: null, active: false })
    expect(scene.setActive.mock.calls.map((c) => c[0])).toEqual([false])
  })

  it('줄이 다 섰을 때 포커스가 가려진 책에 있으면 그 책이 보이게 넘긴다', () => {
    vi.useFakeTimers()
    const { settle, buttons, lastScroll, scene } = setup()
    // 줄이 서기 전에 포커스가 먼저 온다(자리를 모른다: 넘기지 않는다)
    act(() => buttons()[5].focus())
    act(() => void vi.advanceTimersByTime(500))
    expect(scene.setScroll).not.toHaveBeenCalled()
    settle(ROW_6)
    act(() => void vi.advanceTimersByTime(1500))
    expect(lastScroll()).toBeCloseTo(boxLeft(5) + BOX.width + FIELDS_SCROLL.revealMarginPx - WIDTH, 6)
  })

  it('줄이 섰을 때 포커스가 보이는 책이나 다른 곳에 있으면 줄을 넘기지 않는다', () => {
    vi.useFakeTimers()
    const { settle, buttons, scene } = setup()
    act(() => buttons()[1].focus())
    settle(ROW_6)
    act(() => void vi.advanceTimersByTime(1500))
    expect(scene.setScroll).not.toHaveBeenCalled()
    act(() => buttons()[1].blur())
    settle(null)
    settle(ROW_6)
    act(() => void vi.advanceTimersByTime(1500))
    expect(scene.setScroll).not.toHaveBeenCalled()
  })
})

describe('FieldBooks3D: 책 페이지를 닫으면 그 책이 날아서 제자리로 돌아온다', () => {
  const environment = fields[8]
  const PLAN = { page: { width: 1440, height: 900, centreY: 474, bookHeight: 594 }, veil: '#123456', turn: { yaw: 2, pitch: -1 }, waitMs: 0 }

  /** 돌아오기를 아는 가짜 장면 */
  const returningScene = (canReturn = true) => {
    const base = fakeScene()
    const flyIn = vi.fn<NonNullable<FieldsSceneHandle['flyIn']>>(() => canReturn)
    const scene: FieldsSceneHandle & typeof base.scene = { ...base.scene, flyIn }
    const create = vi.fn<FieldsSceneFactory>((options) => {
      base.create(options)
      return scene
    })
    return { ...base, scene, create, flyIn }
  }
  const setup = (fake: ReturnType<typeof fakeScene> = returningScene(), props: Partial<Parameters<typeof FieldBooks3D>[0]> = {}) => {
    const returner: { current: FlyReturner | null } = { current: null }
    const base = { field: philosophy, active: true, createScene: fake.create, returner }
    const view = render(<FieldBooks3D {...base} {...props} />)
    const show = (next: Partial<Parameters<typeof FieldBooks3D>[0]>) => view.rerender(<FieldBooks3D {...base} {...props} {...next} />)
    const host = view.container.querySelector<HTMLElement>('.fbooks3d__canvas')!
    const area = view.container.querySelector<HTMLElement>('.fbooks3d')!
    return { ...view, fake, returner, show, host, area }
  }

  it('부모에게 "돌아오게 하기"를 내준다: 부르면 장면이 그 책의 학문을 세우고 그 책을 날려 보낸다', () => {
    const fake = returningScene()
    const { returner } = setup(fake)
    const onStep = vi.fn()
    // 39권은 환경의 마지막 책이다(지금 가리키는 학문과 달라도 된다: 장면이 그 학문으로 바로 선다)
    expect(returner.current?.(39, PLAN, onStep)).toBe(true)
    expect(fake.flyIn).toHaveBeenCalledTimes(1)
    const [field, index, plan, step] = fake.flyIn.mock.calls[0]
    expect(field.key).toBe('환경')
    expect(field.books).toEqual(fieldBooks(environment))
    expect(index).toBe(fieldBooks(environment).length - 1)
    expect(plan).toEqual(PLAN)
    // 장면이 알리는 단계는 부모에게 그대로 간다
    step('depart')
    step('landed')
    expect(onStep.mock.calls.map((c) => c[0])).toEqual(['depart', 'landed'])
  })

  it('장면이 거절하거나 돌아오기를 모르면 false를 돌려준다(부모가 예전 방식으로 물러난다)', () => {
    expect(setup(returningScene(false)).returner.current?.(39, PLAN, () => {})).toBe(false)
    expect(setup(fakeScene()).returner.current?.(39, PLAN, () => {})).toBe(false)
  })

  it('떠날 때는 "돌아오게 하기"를 거둔다', () => {
    const { returner, unmount } = setup()
    expect(returner.current).not.toBeNull()
    unmount()
    expect(returner.current).toBeNull()
  })

  it('전환의 단계를 캔버스에 적는다(settle → depart → return → 없음)', () => {
    const { host, show } = setup()
    for (const phase of ['settle', 'depart', 'return'] as const) {
      show({ flight: phase })
      expect(host).toHaveAttribute('data-flight', phase)
    }
    show({ flight: null })
    expect(host).not.toHaveAttribute('data-flight')
  })

  it('돌아오는 전환이 끝나도 책들이 서랍에서 다시 나오지 않는다(이미 제자리에 서 있다)', () => {
    const { fake, show } = setup()
    show({ flight: 'depart' })
    show({ flight: 'return' })
    fake.scene.setActive.mockClear()
    show({ flight: null })
    expect(fake.scene.setActive).not.toHaveBeenCalled()
  })

  it('책이 놓였다는 알림 없이 전환이 끝나면(장면이 그려지지 않았다) 날던 책을 거두고 처음부터 다시 등장시킨다', () => {
    const fake = returningScene()
    const { returner, show } = setup(fake)
    const done = () => {
      show({ flight: 'depart' })
      show({ flight: 'return' })
      fake.scene.setActive.mockClear()
      show({ flight: null })
      return fake.scene.setActive.mock.calls.map((c) => c[0])
    }
    returner.current?.(39, PLAN, () => {})
    expect(done()).toEqual([false, true])
    // 놓였다고 알렸으면 그대로 둔다
    returner.current?.(39, PLAN, () => {})
    fake.flyIn.mock.calls.at(-1)![3]('landed')
    expect(done()).toEqual([])
  })

  it('돌아온 줄이 넘겨진 채로 서 있으면(가려진 자리의 책) 그 자리에서 이어서 넘긴다', () => {
    const { fake, show, area } = setup(returningScene(), { field: longest })
    show({ flight: 'return' })
    fake.settle(null)
    // 장면이 줄을 그 책이 보이게 넘겨 세웠다고 알린다
    fake.settle({ ...ROW_6, scroll: 672 })
    expect(fake.scene.setScroll).not.toHaveBeenCalled()
    fireEvent.wheel(area, { deltaX: 20, deltaY: 0 })
    expect(fake.lastScroll()).toBe(692)
  })
})

describe('Fields: 책 자리를 무엇으로 그릴지', () => {
  const covers = () => document.querySelector('.fcovers')

  it('WebGL을 쓰지 않으면(기본) 표지 그림을 나란히 보인다', () => {
    const { create } = fakeScene()
    render(<Fields currentField={0} onFieldChange={() => {}} createBooksScene={create} />)
    expect(covers()).not.toBeNull()
    expect(document.querySelector('.fields canvas')).toBeNull()
    expect(create).not.toHaveBeenCalled()
  })

  it('WebGL이면 3D 책을 받아 와 그리고, 책마다 버튼이 있다. 책을 누르면 책 페이지를 열라고 알린다', async () => {
    const { scene, create, settle } = fakeScene()
    const onOpenBook = vi.fn()
    const props = { onFieldChange: () => {}, renderer: 'webgl' as const, active: true, createBooksScene: create, onOpenBook }
    const view = render(<Fields currentField={0} {...props} />)
    // 받는 동안: 표지를 잠깐 보였다가 바꾸지 않는다
    expect(covers()).toBeNull()
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1), { timeout: 5000 })
    expect(document.querySelector('.fields canvas')).not.toBeNull()
    expect(covers()).toBeNull()
    expect(within(screen.getByRole('list', { name: '철학의 책' })).getAllByRole('button')).toHaveLength(fieldBooks(fields[0]).length)

    view.rerender(<Fields currentField={4} {...props} />)
    expect(scene.setField.mock.calls.at(-1)![0].key).toBe('생명과학')
    const count = fieldBooks(fields[4]).length
    const buttons = within(screen.getByRole('list', { name: '생명과학의 책' })).getAllByRole('button')
    expect(buttons).toHaveLength(count)

    // Tab 순서: 다이얼의 지금 학문 → 그 학문의 책들
    const tabbable = Array.from(document.querySelectorAll<HTMLElement>('.fields button')).filter((b) => b.tabIndex === 0)
    expect(tabbable[0]).toHaveAccessibleName('생명과학, 6권')
    expect(tabbable.slice(1, 1 + count)).toEqual(buttons)
    expect(tabbable).toHaveLength(1 + count)

    settle(ROW_6)
    scene.bookAt.mockReturnValue(3)
    fireEvent.click(document.querySelector('.fbooks3d')!, { clientX: 300, clientY: 300 })
    expect(onOpenBook).toHaveBeenLastCalledWith(fieldBooks(fields[4])[3].no, expect.any(Function))
  })

  it('장면을 만들지 못하면 표지 그림으로 물러난다', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {})
    const create = vi.fn<FieldsSceneFactory>(() => {
      throw new Error('no webgl')
    })
    render(<Fields currentField={0} onFieldChange={() => {}} renderer="webgl" active createBooksScene={create} />)
    await waitFor(() => expect(covers()).not.toBeNull(), { timeout: 5000 })
    expect(document.querySelector('.fields canvas')).toBeNull()
    expect(within(screen.getByRole('list', { name: '철학의 책' })).getAllByRole('button')).toHaveLength(fieldBooks(fields[0]).length)
  })
})
