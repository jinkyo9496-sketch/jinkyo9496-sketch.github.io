import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../src/App'
import { BOOK_FLY_MS, BOOK_OPEN_MS, BOOK_RETURN_MS, BOOK_TURN_MS, SCREEN_TRANSITION_MS } from '../src/app/screen'
import { bookColors } from '../src/data/bookColors'
import { books } from '../src/data/books'
import { fieldBooks, fields } from '../src/data/fields'
import type { FieldsReturnStep, FieldsRow, FieldsSceneFactory, FieldsSceneHandle } from '../src/fields3d/sceneTypes'
import type { SceneFactory, ShelfSceneHandle } from '../src/shelf3d/sceneTypes'

const T0 = 7_000_000
const tick = (ms: number) => vi.setSystemTime(Date.now() + ms)

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(T0)
  window.history.replaceState(null, '', '/')
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '/')
})

/** 환경(8): 11 31 34 37 39권 */
const ENV = 8
const envBooks = fieldBooks(fields[ENV])
/** 환경 5권 줄의 가짜 값: 끝까지 760px, 책마다 멈출 자리 */
const ROW: FieldsRow = { max: 760, stops: [0, 224, 448, 672, 760] }

const fakeShelfScene = () => {
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
  return { scene, create: vi.fn<SceneFactory>(() => scene) }
}

const fakeFieldsScene = () => {
  let onRow: ((row: FieldsRow | null) => void) | undefined
  const scene = {
    setStage: vi.fn(),
    setField: vi.fn(),
    setActive: vi.fn(),
    setScroll: vi.fn(),
    setHover: vi.fn(),
    bookAt: vi.fn<FieldsSceneHandle['bookAt']>(() => null),
    bookBox: vi.fn<FieldsSceneHandle['bookBox']>((i) => ({ left: 40 + i * 224, top: 270, width: 190, height: 220 })),
    restore: vi.fn(),
    dispose: vi.fn(),
  } satisfies FieldsSceneHandle
  const create = vi.fn<FieldsSceneFactory>((options) => {
    onRow = options.onRow
    return scene
  })
  return { scene, create, settle: (row: FieldsRow | null) => act(() => onRow?.(row)) }
}

const app = () => document.querySelector<HTMLElement>('.app')!
const onScreen = () => document.querySelector<HTMLElement>('.screens')!.dataset.screen
const fieldsScreen = () => document.querySelector<HTMLElement>('[data-screen-name="fields"]')!
const pageRegion = () => document.querySelector<HTMLElement>('.bookpage:not([aria-hidden="true"])')
const dial = () => screen.getByRole('navigation', { name: '학문', hidden: true })
const currentField = () => within(dial()).getByRole('button', { current: true, hidden: true }).textContent
const bookArea = () => document.querySelector<HTMLElement>('.fbooks3d')!
const fieldBookButton = (no: number) =>
  within(fieldsScreen()).getByRole('button', { name: `${no}권 ${books[no - 1].title}`, hidden: true })
/** 분류 화면의 보이지 않는 제목: 책 페이지를 닫고 돌아오면 포커스가 여기에 온다(책 둘레에 포커스 링이 생기지 않는다) */
const fieldsTitle = () => document.querySelector<HTMLElement>('.fields__anchor')!
const shelfCentre = () =>
  within(screen.getByRole('region', { name: '서가명강 서가', hidden: true })).getByRole('button', { current: true, hidden: true })

describe('분류 화면의 3D 책 → 책 페이지 (WebGL, 책을 날릴 수 없을 때: 화면이 옮겨 간다)', () => {
  const setup = async () => {
    const shelf = fakeShelfScene()
    const fieldsScene = fakeFieldsScene()
    const user = userEvent.setup()
    render(
      <App
        renderer="webgl"
        createScene={shelf.create}
        createFieldsScene={fieldsScene.create}
        initial={{ screen: 'fields', index: 2, field: ENV }}
      />,
    )
    await waitFor(() => expect(fieldsScene.create).toHaveBeenCalledTimes(1), { timeout: 5000 })
    await waitFor(() => expect(shelf.create).toHaveBeenCalledTimes(1), { timeout: 5000 })
    fieldsScene.settle(ROW)
    const lastPage = () => shelf.scene.setPage.mock.calls.at(-1)![0]
    /** 3D 책(그 학문 안의 순번)을 누른다 */
    const clickBook = (i: number) => {
      fieldsScene.scene.bookAt.mockReturnValue(i)
      fireEvent.click(bookArea(), { clientX: 300, clientY: 380 })
    }
    return { shelf, fieldsScene, user, lastPage, clickBook }
  }

  it('3D 책을 누르면 화면이 서가 자리로 옮겨 가고 그 책의 책 페이지가 열린다(전환 없이 바로)', async () => {
    const { clickBook, lastPage, shelf, fieldsScene } = await setup()
    clickBook(1) // 31권
    expect(onScreen()).toBe('shelf')
    expect(screen.getByRole('region', { name: books[30].title })).toBeInTheDocument()
    expect(app()).toHaveAttribute('data-view', 'book')
    expect(app()).toHaveAttribute('data-page', 'direct')
    expect(pageRegion()).toHaveAttribute('data-entrance', 'direct')
    expect(lastPage().open).toBe(true)
    expect(shelf.scene.setState.mock.calls.at(-1)![0].index).toBe(30)
    expect(window.location.hash).toBe('#/book/31')
    expect(document.querySelector('.bookpage__title')).toHaveFocus()
    // 분류 화면은 가려지고 그 입력도 받지 않는다
    expect(fieldsScreen()).toHaveAttribute('inert')
    expect(fieldsScene.scene.setActive).toHaveBeenLastCalledWith(false)
  })

  it('이때 책 페이지에 돌아가는 버튼은 없고(2026-11-24 삭제), Esc로 닫으면 보던 학문 그대로 분류 화면으로 돌아온다', async () => {
    const { clickBook, lastPage } = await setup()
    clickBook(1)
    tick(BOOK_FLY_MS + 10)
    expect(screen.queryByRole('button', { name: '서가로' })).toBeNull()
    expect(screen.queryByRole('button', { name: '학제별 분류로' })).toBeNull()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onScreen()).toBe('fields')
    expect(currentField()).toBe('환경')
    expect(pageRegion()).toBeNull()
    expect(lastPage().open).toBe(false)
    expect(app()).not.toHaveAttribute('data-view')
    expect(fieldsScreen()).not.toHaveAttribute('inert')
    // 포커스는 책이 아니라 분류 화면의 제목에 둔다(책 둘레에 포커스 링이 생기지 않는다)
    expect(fieldBookButton(31)).not.toHaveFocus()
    expect(fieldsTitle()).toHaveFocus()
    expect(fieldsTitle()).toHaveTextContent('학제별 분류')
    expect(fieldsTitle()).toHaveAttribute('tabindex', '-1')
    await waitFor(() => expect(window.location.hash).toBe(''))
  })

  it('Esc로 닫아도 분류 화면으로 돌아온다(전환이 끝난 뒤에 듣는다)', async () => {
    const { clickBook } = await setup()
    clickBook(2) // 34권
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onScreen()).toBe('shelf') // 열자마자 누른 것은 듣지 않는다
    tick(BOOK_FLY_MS + 10)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onScreen()).toBe('fields')
    expect(currentField()).toBe('환경')
    expect(pageRegion()).toBeNull()
    expect(fieldsTitle()).toHaveFocus()
  })

  it('브라우저의 뒤로 가기로 닫아도 분류 화면으로 돌아온다', async () => {
    const { clickBook } = await setup()
    clickBook(0) // 11권
    expect(window.location.hash).toBe('#/book/11')
    act(() => {
      window.history.replaceState(null, '', '/')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(onScreen()).toBe('fields')
    expect(currentField()).toBe('환경')
    expect(pageRegion()).toBeNull()
  })

  it('책 페이지 안에서 다른 권으로 넘긴 뒤 닫으면 그 권의 학문을 가리킨 채 분류 화면으로 돌아온다', async () => {
    const { clickBook } = await setup()
    clickBook(1) // 31권
    tick(BOOK_FLY_MS + 10)
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    expect(screen.getByRole('region', { name: books[31].title })).toBeInTheDocument()
    tick(BOOK_TURN_MS + 10)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onScreen()).toBe('fields')
    // 32권은 철학의 책이다: 다이얼은 철학을 가리킨다. 포커스는 책이 아니라 제목에
    expect(currentField()).toBe('철학')
    expect(fieldsTitle()).toHaveFocus()
    // 서가의 가운데 책은 마지막에 본 책이다
    expect(shelfCentre()).toHaveAccessibleName(`32권 ${books[31].title}`)
  })

  it('분류 화면에서 연 책 페이지는 책이 날아가 닿을 때까지만 잠긴다(서가에서 여는 전환만큼 기다리지 않는다)', async () => {
    const { clickBook } = await setup()
    clickBook(1)
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    expect(screen.getByRole('region', { name: books[30].title })).toBeInTheDocument() // 아직 잠겨 있다
    tick(BOOK_FLY_MS + 10)
    expect(BOOK_FLY_MS).toBeLessThan(BOOK_OPEN_MS)
    expect(BOOK_FLY_MS).toBeGreaterThan(SCREEN_TRANSITION_MS)
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    expect(screen.getByRole('region', { name: books[31].title })).toBeInTheDocument()
  })

  it('키보드로 고른다: 책의 버튼에서 Enter를 누르면 그 책의 책 페이지', async () => {
    const { user } = await setup()
    fieldBookButton(37).focus()
    await user.keyboard('{Enter}')
    expect(onScreen()).toBe('shelf')
    expect(screen.getByRole('region', { name: books[36].title })).toBeInTheDocument()
    tick(BOOK_FLY_MS + 10)
    fireEvent.keyDown(window, { key: 'Escape' })
    // 닫으면 포커스는 그 책이 아니라 분류 화면의 제목에 온다
    expect(fieldBookButton(37)).not.toHaveFocus()
    expect(fieldsTitle()).toHaveFocus()
  })

  it('닫은 뒤 서가에 가서 연 책 페이지는 서가로 돌아간다', async () => {
    const { clickBook, user } = await setup()
    clickBook(1)
    tick(BOOK_FLY_MS + 10)
    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.keyDown(window, { key: 'Home' })
    fireEvent.keyDown(window, { key: 'ArrowUp' })
    expect(onScreen()).toBe('shelf')
    tick(3000)
    await user.click(shelfCentre())
    expect(app()).toHaveAttribute('data-page', 'open')
    tick(BOOK_OPEN_MS + 10)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onScreen()).toBe('shelf')
  })

  it('책 페이지가 열려 있는 동안 ←/→는 분류 화면의 줄을 넘기지 않는다', async () => {
    const { clickBook, fieldsScene } = await setup()
    clickBook(1)
    tick(BOOK_FLY_MS + 10)
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(fieldsScene.scene.setScroll).not.toHaveBeenCalled()
  })
})

describe('분류 화면의 3D 책 → 책 페이지: 책이 들려서 날아간다', () => {
  /** 날아가기를 아는 가짜 장면: `land()`는 책이 닿았다고 알린다 */
  const flyingScene = (canFly = true) => {
    const base = fakeFieldsScene()
    let onLanded: (() => void) | undefined
    const flyOut = vi.fn<NonNullable<FieldsSceneHandle['flyOut']>>((_index, _flight, landed) => {
      onLanded = landed
      return canFly
    })
    const scene: FieldsSceneHandle & typeof base.scene = { ...base.scene, flyOut }
    const create = vi.fn<FieldsSceneFactory>((options) => {
      base.create(options)
      return scene
    })
    return { scene, flyOut, create, settle: base.settle, land: () => act(() => onLanded?.()) }
  }
  const screens = () => document.querySelector<HTMLElement>('.screens')!
  const fieldsSection = () => document.querySelector<HTMLElement>('.fields')!
  const host = () => document.querySelector<HTMLElement>('.fbooks3d__canvas')!

  const setup = async (initial: { screen: 'fields'; index: number; field: number } = { screen: 'fields', index: 2, field: ENV }, canFly = true) => {
    // 화면 치수를 잴 수 있어야 날아간다(jsdom은 크기가 0이다)
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1440)
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(900)
    const shelf = fakeShelfScene()
    const fieldsScene = flyingScene(canFly)
    render(<App renderer="webgl" createScene={shelf.create} createFieldsScene={fieldsScene.create} initial={initial} />)
    await waitFor(() => expect(fieldsScene.create).toHaveBeenCalledTimes(1), { timeout: 5000 })
    await waitFor(() => expect(shelf.create).toHaveBeenCalledTimes(1), { timeout: 5000 })
    fieldsScene.settle(ROW)
    const clickBook = (i: number) => {
      fieldsScene.scene.bookAt.mockReturnValue(i)
      fireEvent.click(bookArea(), { clientX: 300, clientY: 380 })
    }
    return { shelf, fieldsScene, clickBook }
  }

  it('책을 누르면 책 페이지가 바로 열리되 화면은 분류 화면 그대로이고, 그 책이 날아가기 시작한다', async () => {
    const { clickBook, fieldsScene, shelf } = await setup()
    clickBook(1) // 31권
    expect(fieldsScene.flyOut).toHaveBeenCalledTimes(1)
    const [index, flight] = fieldsScene.flyOut.mock.calls[0]
    expect(index).toBe(1)
    // 날아갈 곳은 서가 장면의 화면 치수에서, 덮어 오는 바탕색은 그 책의 대표색
    expect(flight.veil).toBe(bookColors[31].background)
    expect(flight.page.width).toBe(1440)
    expect(flight.page.height).toBe(900)
    expect(flight.page.bookHeight).toBeGreaterThan(0)
    expect(flight.page.centreY).toBeGreaterThan(0)
    // 상태는 책 페이지다: 주소, 포커스, 서가 장면
    expect(app()).toHaveAttribute('data-view', 'book')
    expect(app()).toHaveAttribute('data-page', 'direct')
    expect(window.location.hash).toBe('#/book/31')
    expect(document.querySelector('.bookpage__title')).toHaveFocus()
    expect(shelf.scene.setPage.mock.calls.at(-1)![0].open).toBe(true)
    // 보이는 것은 분류 화면이다: 밀려 올라가지 않고, 분류 장면은 계속 그린다. 입력은 받지 않는다
    expect(onScreen()).toBe('fields')
    expect(screens()).toHaveAttribute('data-snap')
    expect(app()).toHaveAttribute('data-fly')
    expect(fieldsSection()).toHaveAttribute('data-flight', 'fly')
    expect(host()).toHaveAttribute('data-flight', 'fly')
    expect(fieldsScene.scene.setActive).toHaveBeenLastCalledWith(true)
    expect(fieldsScreen()).toHaveAttribute('inert')
  })

  it('책이 닿으면 전환 없이 책 페이지로 바뀌고, 분류 화면의 캔버스가 그 위에서 옅어진 뒤 물러난다', async () => {
    const { clickBook, fieldsScene } = await setup()
    clickBook(1)
    fieldsScene.land()
    expect(onScreen()).toBe('shelf')
    expect(screens()).toHaveAttribute('data-snap')
    expect(app()).not.toHaveAttribute('data-fly')
    expect(host()).toHaveAttribute('data-flight', 'handoff')
    expect(fieldsScene.scene.setActive).toHaveBeenLastCalledWith(true)
    await waitFor(() => expect(host()).not.toHaveAttribute('data-flight'), { timeout: 2000 })
    expect(screens()).not.toHaveAttribute('data-snap')
    expect(fieldsSection()).not.toHaveAttribute('data-flight')
    expect(fieldsScene.scene.setActive).toHaveBeenLastCalledWith(false)
    expect(onScreen()).toBe('shelf')
    expect(screen.getByRole('region', { name: books[30].title })).toBeInTheDocument()
  })

  it('키보드(Enter)로 열어도 같은 전환이다', async () => {
    const { fieldsScene } = await setup()
    const user = userEvent.setup()
    fieldBookButton(37).focus()
    await user.keyboard('{Enter}')
    expect(fieldsScene.flyOut).toHaveBeenCalledTimes(1)
    // 37권은 환경 줄의 넷째 책(index 3)이다
    expect(fieldsScene.flyOut.mock.calls[0][0]).toBe(fields[ENV].nos.indexOf(37))
    expect(onScreen()).toBe('fields')
    expect(app()).toHaveAttribute('data-view', 'book')
  })

  it('전환 중의 입력(Esc·방향키)은 듣지 않는다. 끝난 뒤에는 듣는다', async () => {
    const { clickBook, fieldsScene } = await setup()
    clickBook(1)
    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    expect(app()).toHaveAttribute('data-view', 'book')
    expect(screen.getByRole('region', { name: books[30].title })).toBeInTheDocument()
    fieldsScene.land()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(app()).toHaveAttribute('data-view', 'book')
    tick(BOOK_FLY_MS + 10)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onScreen()).toBe('fields')
    expect(pageRegion()).toBeNull()
    expect(fieldsTitle()).toHaveFocus()
  })

  it('전환 중에 브라우저의 뒤로 가기로 닫히면 전환을 거두고 분류 화면에 그대로 있는다(책들이 다시 등장한다)', async () => {
    const { clickBook, fieldsScene } = await setup()
    clickBook(0)
    fieldsScene.scene.setActive.mockClear()
    act(() => {
      window.history.replaceState(null, '', '/')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(onScreen()).toBe('fields')
    expect(app()).not.toHaveAttribute('data-view')
    expect(app()).not.toHaveAttribute('data-fly')
    expect(screens()).not.toHaveAttribute('data-snap')
    expect(host()).not.toHaveAttribute('data-flight')
    expect(fieldsScene.scene.setActive.mock.calls.map((c) => c[0])).toEqual([false, true])
    expect(fieldsScreen()).not.toHaveAttribute('inert')
  })

  it('닿았다는 알림이 오지 않아도(장면이 그려지지 않을 때) 얼마 뒤에는 책 페이지로 넘어간다', async () => {
    const { clickBook } = await setup()
    clickBook(1)
    expect(onScreen()).toBe('fields')
    await waitFor(() => expect(onScreen()).toBe('shelf'), { timeout: 4000 })
    await waitFor(() => expect(host()).not.toHaveAttribute('data-flight'), { timeout: 2000 })
  })

  it('장면이 날릴 수 없다고 하면 지금처럼 화면이 서가 자리로 옮겨 간다', async () => {
    const { clickBook, fieldsScene } = await setup(undefined, false)
    clickBook(1)
    expect(fieldsScene.flyOut).toHaveBeenCalledTimes(1)
    expect(onScreen()).toBe('shelf')
    expect(screens()).not.toHaveAttribute('data-snap')
    expect(app()).not.toHaveAttribute('data-fly')
    expect(fieldsScene.scene.setActive).toHaveBeenLastCalledWith(false)
  })

  it('예: 4권(정치)을 눌러 들어가 10권(법)으로 넘긴 뒤 Esc → 다이얼은 법, 포커스는 제목(책에 두지 않는다)', async () => {
    const { clickBook, fieldsScene } = await setup({ screen: 'fields', index: 0, field: 6 })
    expect(currentField()).toBe('정치')
    clickBook(0) // 4권
    fieldsScene.land()
    await waitFor(() => expect(host()).not.toHaveAttribute('data-flight'), { timeout: 2000 })
    tick(BOOK_FLY_MS + 10)
    act(() => {
      window.history.replaceState(null, '', '#/book/10')
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(screen.getByRole('region', { name: books[9].title })).toBeInTheDocument()
    tick(BOOK_TURN_MS + 10)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onScreen()).toBe('fields')
    expect(currentField()).toBe('법')
    expect(fieldsScene.scene.setField.mock.calls.at(-1)![0].key).toBe('법')
    expect(fieldBookButton(10)).not.toHaveFocus()
    expect(fieldsTitle()).toHaveFocus()
  })
})

describe('책 페이지를 닫으면: 그 책이 날아서 분류 화면의 제자리로 돌아온다', () => {
  /** 날아가기와 돌아오기를 아는 가짜 장면: `land()`는 닿았다고, `step()`은 돌아오는 단계를 알린다 */
  const returningScene = (canReturn = true) => {
    const base = fakeFieldsScene()
    let onLanded: (() => void) | undefined
    let onStep: ((step: FieldsReturnStep) => void) | undefined
    const flyOut = vi.fn<NonNullable<FieldsSceneHandle['flyOut']>>((_index, _flight, landed) => {
      onLanded = landed
      return true
    })
    const flyIn = vi.fn<NonNullable<FieldsSceneHandle['flyIn']>>((_field, _index, _plan, step) => {
      onStep = step
      return canReturn
    })
    const scene: FieldsSceneHandle & typeof base.scene = { ...base.scene, flyOut, flyIn }
    const create = vi.fn<FieldsSceneFactory>((options) => {
      base.create(options)
      return scene
    })
    return {
      scene,
      flyOut,
      flyIn,
      create,
      settle: base.settle,
      land: () => act(() => onLanded?.()),
      step: (step: FieldsReturnStep) => act(() => onStep?.(step)),
    }
  }
  const screens = () => document.querySelector<HTMLElement>('.screens')!
  const fieldsSection = () => document.querySelector<HTMLElement>('.fields')!
  const host = () => document.querySelector<HTMLElement>('.fbooks3d__canvas')!
  const status = () => fieldsSection().querySelector('[role="status"]')!

  /** 분류 화면에서 i번째 책을 열어 책 페이지가 다 차려진 데까지 간다 */
  const openFrom = async (
    i: number,
    initial: { screen: 'fields'; index: number; field: number } = { screen: 'fields', index: 2, field: ENV },
    canReturn = true,
  ) => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1440)
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(900)
    const shelf = fakeShelfScene()
    const fieldsScene = returningScene(canReturn)
    render(<App renderer="webgl" createScene={shelf.create} createFieldsScene={fieldsScene.create} initial={initial} />)
    await waitFor(() => expect(fieldsScene.create).toHaveBeenCalledTimes(1), { timeout: 5000 })
    await waitFor(() => expect(shelf.create).toHaveBeenCalledTimes(1), { timeout: 5000 })
    fieldsScene.settle(ROW)
    fieldsScene.scene.bookAt.mockReturnValue(i)
    fireEvent.click(bookArea(), { clientX: 300, clientY: 380 })
    fieldsScene.land()
    await waitFor(() => expect(host()).not.toHaveAttribute('data-flight'), { timeout: 2000 })
    tick(BOOK_FLY_MS + 10)
    fieldsScene.scene.setActive.mockClear()
    fieldsScene.scene.setField.mockClear()
    const lastPage = () => shelf.scene.setPage.mock.calls.at(-1)![0]
    const esc = () => fireEvent.keyDown(window, { key: 'Escape' })
    return { shelf, fieldsScene, lastPage, esc }
  }

  it('닫으면 상태는 바로 분류 화면이되, 보이는 것은 책 페이지 그대로이고 분류 장면이 그 위로 겹쳐 온다', async () => {
    const { fieldsScene, lastPage, esc } = await openFrom(1) // 31권
    esc()
    // 장면: 환경의 줄이 서 있고 둘째 책(31권)이 책 페이지의 자리에서 돌아온다
    expect(fieldsScene.flyIn).toHaveBeenCalledTimes(1)
    const [field, index, plan] = fieldsScene.flyIn.mock.calls[0]
    expect(field.key).toBe('환경')
    expect(index).toBe(1)
    expect(plan.veil).toBe(bookColors[31].background)
    expect(plan.page.width).toBe(1440)
    expect(plan.page.bookHeight).toBeGreaterThan(0)
    expect(plan.turn).toEqual({ yaw: 0, pitch: 0 })
    expect(plan.waitMs).toBe(0)
    // 상태는 분류 화면이다: 주소, 포커스, 다이얼
    expect(pageRegion()).toBeNull()
    expect(currentField()).toBe('환경')
    expect(fieldsTitle()).toHaveFocus()
    await waitFor(() => expect(window.location.hash).toBe(''))
    // 보이는 것은 아직 책 페이지다: 화면은 서가 자리 그대로(전환 없이), 대표색과 떠 있는 책이 남아 있다
    expect(onScreen()).toBe('shelf')
    expect(screens()).toHaveAttribute('data-snap')
    expect(app()).toHaveAttribute('data-view', 'book')
    expect(app().style.getPropertyValue('--page-bg')).toBe(bookColors[31].background)
    expect(lastPage().open).toBe(true)
    expect(host()).toHaveAttribute('data-flight', 'depart')
    expect(fieldsSection()).toHaveAttribute('data-flight', 'depart')
    // 책들은 서랍에서 다시 나오지 않는다(장면이 줄을 세운 채로 시작한다)
    expect(fieldsScene.scene.setActive.mock.calls.filter((c) => c[0] === false)).toHaveLength(0)
  })

  it('겹쳐 넘어오면 전환 없이 분류 화면으로 바뀌고 책이 날아온다. 놓이면 전환이 끝난다', async () => {
    const { fieldsScene, lastPage, esc } = await openFrom(1)
    esc()
    fieldsScene.step('return')
    expect(onScreen()).toBe('fields')
    expect(screens()).toHaveAttribute('data-snap')
    expect(app()).not.toHaveAttribute('data-view')
    expect(app()).toHaveAttribute('data-return')
    expect(app().style.getPropertyValue('--page-bg')).toBe('')
    expect(lastPage().open).toBe(false)
    expect(host()).toHaveAttribute('data-flight', 'return')
    expect(fieldsSection()).toHaveAttribute('data-flight', 'return')
    fieldsScene.step('landed')
    fieldsScene.settle({ ...ROW, scroll: 0 })
    expect(onScreen()).toBe('fields')
    expect(screens()).not.toHaveAttribute('data-snap')
    expect(app()).not.toHaveAttribute('data-return')
    expect(host()).not.toHaveAttribute('data-flight')
    expect(fieldsSection()).not.toHaveAttribute('data-flight')
    // 끝난 뒤에도 책들이 다시 등장하지 않는다
    expect(fieldsScene.scene.setActive.mock.calls.filter((c) => c[0] === false)).toHaveLength(0)
    // 포커스는 책에 없다
    expect(fieldBookButton(31)).not.toHaveFocus()
    expect(fieldsTitle()).toHaveFocus()
  })

  it('Esc와 브라우저의 뒤로 가기로 닫아도 같은 전환이다', async () => {
    const first = await openFrom(2)
    first.esc()
    // 닫으면서 주소를 되돌리는 것(history.back)이 끝난 뒤에 이어 간다
    await waitFor(() => expect(window.location.hash).toBe(''))
    expect(first.fieldsScene.flyIn).toHaveBeenCalledTimes(1)
    expect(first.fieldsScene.flyIn.mock.calls[0][1]).toBe(2)
    expect(onScreen()).toBe('shelf')
    first.fieldsScene.step('return')
    first.fieldsScene.step('landed')
    tick(BOOK_RETURN_MS + 10)
    // 다시 열어 뒤로 가기로 닫는다
    first.fieldsScene.settle(ROW)
    first.fieldsScene.scene.bookAt.mockReturnValue(4)
    fireEvent.click(bookArea(), { clientX: 300, clientY: 380 })
    first.fieldsScene.land()
    await waitFor(() => expect(host()).not.toHaveAttribute('data-flight'), { timeout: 2000 })
    act(() => {
      window.history.replaceState(null, '', '/')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(first.fieldsScene.flyIn).toHaveBeenCalledTimes(2)
    expect(first.fieldsScene.flyIn.mock.calls[1][1]).toBe(4)
    expect(host()).toHaveAttribute('data-flight', 'depart')
  })

  it('전환 중에는 입력을 받지 않는다(다이얼·책·화면 이동). 끝난 뒤에는 받는다', async () => {
    const { fieldsScene, esc } = await openFrom(1)
    esc()
    fieldsScene.step('return')
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    fireEvent.click(within(dial()).getByRole('button', { name: /^철학/, hidden: true }))
    expect(currentField()).toBe('환경')
    fireEvent.wheel(document.querySelector('.fields__content > :not(.fdial)')!, { deltaY: -200 })
    expect(onScreen()).toBe('fields')
    fieldBookButton(34).focus()
    fireEvent.click(fieldBookButton(34))
    expect(fieldsScene.flyOut).toHaveBeenCalledTimes(1)
    expect(pageRegion()).toBeNull()
    fieldsScene.step('landed')
    fieldsScene.settle(ROW)
    tick(BOOK_RETURN_MS + 10)
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    expect(currentField()).toBe(fields[ENV + 1].name)
  })

  it('책 페이지 안에서 다른 권으로 넘긴 뒤 닫으면 지금 보던 책이 그 책의 학문의 제자리로 돌아간다', async () => {
    const { fieldsScene, esc } = await openFrom(0, { screen: 'fields', index: 0, field: 6 }) // 정치의 4권
    act(() => {
      window.history.replaceState(null, '', '#/book/10')
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    tick(BOOK_TURN_MS + 10)
    esc()
    const law = fields.find((f) => f.name === '법')!
    const [field, index, plan] = fieldsScene.flyIn.mock.calls[0]
    expect(field.key).toBe('법')
    expect(fieldBooks(law)[index].no).toBe(10)
    expect(plan.veil).toBe(bookColors[10].background)
    expect(currentField()).toBe('법')
    expect(onScreen()).toBe('shelf')
  })

  it('책이 펼쳐져 있으면 먼저 덮는다: 덮일 때까지 책 페이지의 책을 그대로 보이고, 그 뒤에 겹쳐 넘어온다', async () => {
    const { fieldsScene, lastPage } = await openFrom(1)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: '펼쳐 보기' }))
    expect(lastPage().spread).toBe(1)
    // 펼친 채로 닫는 길은 브라우저의 뒤로 가기다(Esc는 책부터 덮는다. 닫는 버튼은 2026-11-24에 없앴다)
    act(() => {
      window.history.replaceState(null, '', '/')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(fieldsScene.flyIn).toHaveBeenCalledTimes(1)
    expect(fieldsScene.flyIn.mock.calls[0][2].waitMs).toBeGreaterThanOrEqual(700)
    // 서가 장면은 책 페이지를 연 채로 책만 덮는다
    expect(lastPage().open).toBe(true)
    expect(lastPage().spread ?? 0).toBe(0)
    expect(onScreen()).toBe('shelf')
    expect(host()).toHaveAttribute('data-flight', 'settle')
    fieldsScene.step('depart')
    expect(host()).toHaveAttribute('data-flight', 'depart')
    expect(onScreen()).toBe('shelf')
    fieldsScene.step('return')
    expect(onScreen()).toBe('fields')
  })

  it('장면이 돌아오게 할 수 없다고 하면 지금처럼 화면이 옮겨 오고 책들이 서랍에서 다시 나온다', async () => {
    const { fieldsScene, lastPage, esc } = await openFrom(1, undefined, false)
    esc()
    expect(fieldsScene.flyIn).toHaveBeenCalledTimes(1)
    expect(onScreen()).toBe('fields')
    expect(screens()).not.toHaveAttribute('data-snap')
    expect(app()).not.toHaveAttribute('data-view')
    expect(host()).not.toHaveAttribute('data-flight')
    expect(lastPage().open).toBe(false)
    expect(fieldsScene.scene.setActive).toHaveBeenLastCalledWith(true)
    expect(fieldsTitle()).toHaveFocus()
    // 잠기지 않는다
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    expect(currentField()).toBe(fields[ENV + 1].name)
  })

  it('단계 알림이 오지 않아도(장면이 그려지지 않을 때) 얼마 뒤에는 분류 화면으로 넘어가고 전환이 끝난다', async () => {
    const { esc } = await openFrom(1)
    esc()
    expect(onScreen()).toBe('shelf')
    await waitFor(() => expect(onScreen()).toBe('fields'), { timeout: 4000 })
    await waitFor(() => expect(host()).not.toHaveAttribute('data-flight'), { timeout: 4000 })
  }, 12_000)

  it('돌아오는 중에 다시 책 페이지가 열리면(브라우저의 앞으로 가기) 전환을 거둔다', async () => {
    const { fieldsScene, esc } = await openFrom(1)
    esc()
    fieldsScene.step('return')
    act(() => {
      window.history.replaceState(null, '', '#/book/31')
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(app()).toHaveAttribute('data-view', 'book')
    expect(onScreen()).toBe('shelf')
    expect(host()).not.toHaveAttribute('data-flight')
    expect(screens()).not.toHaveAttribute('data-snap')
  })

  it('돌아오는 중에 로고로 인트로에 가면 전환과 함께 입력 잠금도 풀린다([ 서가 보기 ]가 곧바로 듣는다)', async () => {
    const { fieldsScene, esc } = await openFrom(1)
    esc()
    fieldsScene.step('return')
    fireEvent.click(document.querySelector<HTMLElement>('.header .logo')!)
    expect(onScreen()).toBe('intro')
    expect(host()).not.toHaveAttribute('data-flight')
    fireEvent.click(screen.getByRole('button', { name: '서가 보기' }))
    expect(onScreen()).toBe('shelf')
  })

  it('돌아오는 중에 로고로 인트로에 가도, 화면이 옮겨 가는 동안의 휠 잠금은 남는다(휠이 화면을 한 번 더 옮기지 않는다)', async () => {
    const { fieldsScene, esc } = await openFrom(1)
    esc()
    fieldsScene.step('return')
    fireEvent.click(document.querySelector<HTMLElement>('.header .logo')!)
    expect(onScreen()).toBe('intro')
    fireEvent.wheel(app(), { deltaY: 200 })
    expect(onScreen()).toBe('intro')
  })

  it('돌아오게 할 수 없어 물러난 직후의 휠은 다이얼도 화면도 옮기지 않는다(화면 전환 뒤의 휠 잠금 그대로)', async () => {
    const { esc } = await openFrom(1, undefined, false)
    esc()
    expect(onScreen()).toBe('fields')
    const before = currentField()
    fireEvent.wheel(app(), { deltaY: -200 })
    expect(onScreen()).toBe('fields')
    expect(currentField()).toBe(before)
  })

  it('돌아오는 중에 앞으로 가기로 다시 연 책 페이지에는 돌아오는 전환의 잠금이 남지 않는다', async () => {
    const { fieldsScene, esc } = await openFrom(1)
    esc()
    fieldsScene.step('return')
    act(() => {
      window.history.replaceState(null, '', '#/book/31')
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(app()).toHaveAttribute('data-view', 'book')
    // 주소로 들어온 책 페이지는 화면이 옮겨 가는 동안(700ms)만 잠긴다. 그 뒤에는 돌아오는 전환의 잠금(1060ms)이 남아 있으면 안 된다
    await act(() => new Promise((resolve) => setTimeout(resolve, SCREEN_TRANSITION_MS + 60)))
    esc()
    expect(app()).not.toHaveAttribute('data-view', 'book')
  })

  it('돌아오면 읽기 도구에 지금 학문을 한 번 알린다(학문이 그대로여도)', async () => {
    const { esc } = await openFrom(1)
    expect(status()).toHaveTextContent('')
    esc()
    expect(status()).toHaveTextContent('환경, 5권')
  })

  it('포커스: 돌아온 뒤 Tab은 다이얼의 지금 학문 → 그 학문의 책 순서로 간다', async () => {
    const { fieldsScene, esc } = await openFrom(1)
    esc()
    fieldsScene.step('return')
    fieldsScene.step('landed')
    fieldsScene.settle(ROW)
    const user = userEvent.setup()
    await user.tab()
    expect(within(dial()).getByRole('button', { current: true })).toHaveFocus()
    await user.tab()
    expect(fieldBookButton(11)).toHaveFocus()
  })
})

describe('분류 화면의 가로 휠', () => {
  const wheel = (init: WheelEventInit) => fireEvent.wheel(app(), init)

  it('가로 휠은 글자 다이얼을 돌리지 않는다. 세로 휠은 지금처럼 돌린다', () => {
    render(<App renderer="css" initial={{ screen: 'fields', index: 0, field: 3 }} />)
    expect(currentField()).toBe('문학')
    wheel({ deltaX: 200 })
    wheel({ deltaX: -200, deltaY: 30 })
    expect(currentField()).toBe('문학')
    expect(onScreen()).toBe('fields')
    tick(1000)
    fireEvent.wheel(document.querySelector('.fdial')!, { deltaY: 120 })
    expect(currentField()).toBe('생명과학')
  })

  it('철학에서 왼쪽으로 쓸어도 서가로 가지 않는다', () => {
    render(<App renderer="css" initial={{ screen: 'fields', index: 0 }} />)
    wheel({ deltaX: -300 })
    expect(onScreen()).toBe('fields')
  })
})

describe('분류 화면의 대체 화면: 표지 그림과 상세 창 (WebGL 없음)', () => {
  const dialog = () => document.querySelector<HTMLElement>('dialog.detail[open]')
  const cover = (no: number) => within(fieldsScreen()).getByRole('button', { name: `${no}권 ${books[no - 1].title}` })
  const setup = () => {
    const user = userEvent.setup()
    render(<App renderer="css" initial={{ screen: 'fields', index: 2, field: ENV }} />)
    return { user }
  }

  it('그 학문의 책 앞표지가 나란히 보이고, 표지마다 버튼이다', () => {
    setup()
    const list = within(fieldsScreen()).getByRole('list', { name: '환경의 책' })
    expect(within(list).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(
      envBooks.map((b) => `${b.no}권 ${b.title}`),
    )
    expect(list.querySelectorAll('img')).toHaveLength(envBooks.length)
  })

  it('표지를 누르면 그 책의 상세 창이 열린다. 화면은 분류 화면 그대로다', async () => {
    const { user } = setup()
    await user.click(cover(34))
    expect(dialog()).not.toBeNull()
    expect(within(dialog()!).getByRole('heading', { name: books[33].title })).toBeInTheDocument()
    expect(onScreen()).toBe('fields')
    expect(currentField()).toBe('환경')
    expect(app()).not.toHaveAttribute('data-view')
    expect(window.location.hash).toBe('')
  })

  it('닫으면 분류 화면 그대로이고 포커스는 누른 표지로 돌아온다. 서가의 가운데 책은 바뀌지 않는다', async () => {
    const { user } = setup()
    await user.click(cover(34))
    await user.click(within(dialog()!).getByRole('button', { name: '닫기' }))
    expect(dialog()).toBeNull()
    expect(onScreen()).toBe('fields')
    expect(cover(34)).toHaveFocus()
    expect(shelfCentre()).toHaveAccessibleName(`3권 ${books[2].title}`)
  })

  it('상세 창 안의 [ 이전 ] [ 다음 ]과 ←/→는 닫지 않고 책을 넘긴다(번호 순서)', async () => {
    const { user } = setup()
    await user.click(cover(34))
    await user.click(within(dialog()!).getByRole('button', { name: '다음' }))
    expect(within(dialog()!).getByRole('heading', { name: books[34].title })).toBeInTheDocument()
    fireEvent.keyDown(dialog()!, { key: 'ArrowLeft' })
    fireEvent.keyDown(dialog()!, { key: 'ArrowLeft' })
    expect(within(dialog()!).getByRole('heading', { name: books[32].title })).toBeInTheDocument()
    expect(onScreen()).toBe('fields')
    // 닫은 뒤 다른 표지를 열면 그 책부터다
    await user.click(within(dialog()!).getByRole('button', { name: '닫기' }))
    await user.click(cover(11))
    expect(within(dialog()!).getByRole('heading', { name: books[10].title })).toBeInTheDocument()
  })

  it('상세 창이 열려 있는 동안 다이얼은 휠·키를 받지 않는다', async () => {
    const { user } = setup()
    await user.click(cover(34))
    fireEvent.wheel(app(), { deltaY: 200 })
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    fireEvent.keyDown(window, { key: 'Home' })
    expect(currentField()).toBe('환경')
  })

  it('서가에서 여는 상세 창은 지금처럼 서가의 가운데 책이다', async () => {
    const user = userEvent.setup()
    render(<App renderer="css" initial={{ screen: 'shelf', index: 10 }} />)
    await user.click(shelfCentre())
    expect(within(dialog()!).getByRole('heading', { name: books[10].title })).toBeInTheDocument()
    await user.click(within(dialog()!).getByRole('button', { name: '다음' }))
    expect(shelfCentre()).toHaveAccessibleName(`12권 ${books[11].title}`)
  })
})
