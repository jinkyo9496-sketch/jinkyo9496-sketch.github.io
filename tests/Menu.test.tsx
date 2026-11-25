import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../src/App'
import { BOOK_OPEN_MS } from '../src/app/screen'
import { menuBookRoute } from '../src/menu/bookRoute'
import { books } from '../src/data/books'
import { fields } from '../src/data/fields'
import { Menu, YOUTUBE_URL } from '../src/menu/Menu'
import type { SceneFactory, ShelfSceneHandle } from '../src/shelf3d/sceneTypes'

beforeEach(() => window.history.replaceState(null, '', '/'))
afterEach(() => {
  vi.useRealTimers()
  window.history.replaceState(null, '', '/')
})

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

const header = () => screen.getByRole('banner')
const toggle = () => within(header()).getByRole('button', { name: '전체 메뉴' })
const panel = () => document.querySelector<HTMLElement>('nav.menu')!
const isOpen = () => panel().hasAttribute('data-open')
const inPanel = () => within(panel())
const screens = () => document.querySelector<HTMLElement>('.screens')!
const onScreen = () => screens().dataset.screen
const dialField = () => document.querySelector<HTMLElement>('.fdial [aria-current="true"]')!.textContent
const shelfCurrentNo = () => {
  const shelf = screen.getByRole('region', { name: '서가명강 서가', hidden: true })
  const current = within(shelf).getByRole('button', { current: true, hidden: true })
  return Number(current.closest('[data-testid="book"]')!.getAttribute('data-no'))
}
const bookItem = (no: number) => inPanel().getByRole('button', { name: `${no}권 ${books[no - 1].title}` })
/** 학문 항목: 이름은 학문 이름뿐이다(권수는 2026-11-25 편집자 요청으로 지웠다) */
const fieldItem = (i: number) => inPanel().getByRole('button', { name: fields[i].name })
/** 서가의 가운데 책(누르면 책 페이지가 열린다) */
const shelfCentre = () =>
  within(screen.getByRole('region', { name: '서가명강 서가', hidden: true })).getByRole('button', { current: true, hidden: true })
const pageRegion = () => document.querySelector<HTMLElement>('.bookpage:not([aria-hidden="true"])')

const AT_SHELF = { screen: 'shelf', index: 2 } as const

describe('전체 메뉴 버튼 (헤더 오른쪽 끝의 [ + ])', () => {
  it('인트로에서는 거둔다(헤더의 로고와 같다). 신간 소개·서가·학제별 분류에서는 보인다', () => {
    render(<App renderer="css" />)
    expect(onScreen()).toBe('intro')
    expect(within(header()).queryByRole('button', { name: '전체 메뉴' })).toBeNull()
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    expect(onScreen()).toBe('feature')
    expect(toggle()).toBeInTheDocument()
  })

  it('닫혀 있을 때: aria-expanded는 false이고 패널을 가리킨다. 패널은 조작과 읽기에서 빠져 있다', () => {
    render(<App renderer="css" initial={AT_SHELF} />)
    expect(toggle()).toHaveAttribute('aria-expanded', 'false')
    expect(toggle()).toHaveAttribute('aria-controls', panel().id)
    expect(panel()).toHaveAttribute('inert')
    expect(panel()).toHaveAttribute('aria-hidden', 'true')
    expect(screen.queryByRole('navigation', { name: '전체 메뉴' })).toBeNull()
  })

  it('누르면 열리고 다시 누르면 닫힌다', async () => {
    const user = userEvent.setup()
    render(<App renderer="css" initial={AT_SHELF} />)
    await user.click(toggle())
    expect(isOpen()).toBe(true)
    expect(toggle()).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('navigation', { name: '전체 메뉴' })).toBe(panel())
    await user.click(toggle())
    expect(isOpen()).toBe(false)
    expect(toggle()).toHaveAttribute('aria-expanded', 'false')
  })
})

describe('전체 메뉴의 내용', () => {
  const open = async () => {
    const user = userEvent.setup()
    render(<App renderer="css" initial={AT_SHELF} />)
    await user.click(toggle())
    return user
  }

  it('왼쪽에 분류와 학문 열하나, 그 아래 미디어와 유튜브 링크가 있다', async () => {
    await open()
    expect(inPanel().getByRole('button', { name: '분류' })).toBeInTheDocument()
    const list = inPanel().getByRole('list', { name: '학문' })
    // 권수는 적지 않는다: 보이는 글도 읽히는 이름도 학문 이름뿐이다
    expect(within(list).getAllByRole('button').map((b) => b.textContent)).toEqual(fields.map((f) => f.name))
    for (const b of within(list).getAllByRole('button')) expect(b).not.toHaveAttribute('aria-label')
    // 제목 옆의 작은 수(11·48)도 없다
    expect(panel().querySelector('.menu__count')).toBeNull()
    expect(inPanel().getByRole('button', { name: '분류' }).textContent).toBe('분류')
    expect(inPanel().getByRole('button', { name: '서가' }).textContent).toBe('서가')
    expect(within(list).getAllByRole('button')[0]).toHaveTextContent('철학')
    expect(inPanel().getByRole('heading', { name: '미디어' })).toBeInTheDocument()
    const link = inPanel().getByRole('link', { name: '유튜브 @sgmk, 새 창' })
    expect(link).toHaveAttribute('href', 'https://www.youtube.com/@sgmk')
    expect(YOUTUBE_URL).toBe('https://www.youtube.com/@sgmk')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(link).toHaveTextContent('@sgmk')
    // 로고는 장식이다(이름은 링크가 가진다)
    expect(link.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('오른쪽에 서가와 모든 책이 번호순으로 있다. 번호는 도서명 바로 뒤의 위첨자(숫자만)이고 저자가 그 뒤에 온다', async () => {
    await open()
    expect(inPanel().getByRole('button', { name: '서가' })).toBeInTheDocument()
    const list = inPanel().getByRole('list', { name: '책' })
    const items = within(list).getAllByRole('button')
    expect(items).toHaveLength(books.length)
    expect(items.map((b) => b.getAttribute('aria-label'))).toEqual(books.map((b) => `${b.no}권 ${b.title}`))
    const no = items[0].querySelector('.menu__no')!
    expect(no.tagName).toBe('SUP')
    // 숫자만 적는다(`No.`는 2026-11-25 편집자 요청으로 뺐다)
    expect(no.textContent).toBe('1')
    expect(no).toHaveAttribute('aria-hidden', 'true')
    expect(items[9].querySelector('.menu__no')!.textContent).toBe('10')
    // 줄의 순서: 도서명 → 위첨자 번호 → 저자
    expect(Array.from(items[0].children).map((el) => el.className)).toEqual(['menu__name', 'menu__no', 'menu__sub'])
    expect(items[0].querySelector('.menu__sub')).toHaveTextContent(books[0].author)
    expect(items[0]).toHaveTextContent(books[0].title)
  })

  it('지금 화면과 지금 책에 aria-current를 준다', async () => {
    await open()
    expect(inPanel().getByRole('button', { name: '서가' })).toHaveAttribute('aria-current', 'page')
    expect(inPanel().getByRole('button', { name: '분류' })).not.toHaveAttribute('aria-current')
    expect(bookItem(3)).toHaveAttribute('aria-current', 'true')
    expect(bookItem(4)).not.toHaveAttribute('aria-current')
    expect(fieldItem(0)).not.toHaveAttribute('aria-current')
  })

  it('학제별 분류 화면에서는 분류와 지금 학문이 지금 자리다', async () => {
    const user = userEvent.setup()
    render(<App renderer="css" initial={{ screen: 'fields', index: 2, field: 4 }} />)
    await user.click(toggle())
    expect(inPanel().getByRole('button', { name: '분류' })).toHaveAttribute('aria-current', 'page')
    expect(inPanel().getByRole('button', { name: '서가' })).not.toHaveAttribute('aria-current')
    expect(fieldItem(4)).toHaveAttribute('aria-current', 'true')
    expect(bookItem(3)).not.toHaveAttribute('aria-current')
  })
})

describe('전체 메뉴에서 고르기', () => {
  const open = async (initial: Parameters<typeof App>[0]['initial'] = AT_SHELF) => {
    const user = userEvent.setup()
    render(<App renderer="css" initial={initial} />)
    await user.click(toggle())
    return user
  }

  it('분류를 고르면 학제별 분류 화면으로 가고 패널이 닫힌다. 가리키던 학문은 그대로다', async () => {
    const user = await open({ screen: 'shelf', index: 2, field: 5 })
    await user.click(inPanel().getByRole('button', { name: '분류' }))
    expect(onScreen()).toBe('fields')
    expect(dialField()).toBe(fields[5].name)
    expect(isOpen()).toBe(false)
  })

  it('학문을 고르면 그 학문이 선택된 학제별 분류 화면으로 간다', async () => {
    const user = await open()
    await user.click(fieldItem(2))
    expect(onScreen()).toBe('fields')
    expect(dialField()).toBe('예술')
    expect(isOpen()).toBe(false)
  })

  it('서가를 고르면 서가 화면으로 간다. 가운데 책은 그대로다', async () => {
    const user = await open({ screen: 'fields', index: 6, field: 3 })
    await user.click(inPanel().getByRole('button', { name: '서가' }))
    expect(onScreen()).toBe('shelf')
    expect(shelfCurrentNo()).toBe(7)
    expect(isOpen()).toBe(false)
  })

  it('책을 고르면(CSS 서가) 서가가 그 책으로 가고 그 책의 상세 창이 열린다', async () => {
    const user = await open({ screen: 'fields', index: 2 })
    await user.click(bookItem(20))
    expect(isOpen()).toBe(false)
    expect(onScreen()).toBe('shelf')
    expect(shelfCurrentNo()).toBe(20)
    const dialog = document.querySelector('dialog[open]')!
    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveTextContent(books[19].title)
  })

  it('화면이 바뀌면 포커스는 새 화면의 자리로 간다(학제별 분류: 다이얼의 지금 학문)', async () => {
    const user = await open()
    await user.click(fieldItem(1))
    expect(document.activeElement).toBe(document.querySelector('.fdial [aria-current="true"]'))
  })
})

describe('전체 메뉴 닫기와 포커스', () => {
  it('키보드로 열면 포커스가 패널의 첫 항목(분류)으로 가고, Esc로 닫으면 버튼으로 돌아온다', async () => {
    const user = userEvent.setup()
    render(<App renderer="css" initial={AT_SHELF} />)
    toggle().focus()
    await user.keyboard('{Enter}')
    expect(isOpen()).toBe(true)
    expect(document.activeElement).toBe(inPanel().getByRole('button', { name: '분류' }))
    await user.keyboard('{Escape}')
    expect(isOpen()).toBe(false)
    expect(document.activeElement).toBe(toggle())
    expect(onScreen()).toBe('shelf')
  })

  it('패널 밖을 누르면 닫힌다', async () => {
    const user = userEvent.setup()
    render(<App renderer="css" initial={AT_SHELF} />)
    await user.click(toggle())
    await user.click(document.querySelector('.menu__scrim')!)
    expect(isOpen()).toBe(false)
    expect(document.querySelector('.menu__scrim')).toBeNull()
  })

  it('목록 안에서는 ↑/↓·Home·End로 옮기고, 목록마다 탭 순서에는 하나만 든다', async () => {
    const user = userEvent.setup()
    render(<App renderer="css" initial={AT_SHELF} />)
    await user.click(toggle())
    const list = inPanel().getByRole('list', { name: '책' })
    const tabbable = () => within(list).getAllByRole('button').filter((b) => b.tabIndex === 0)
    // 처음에는 지금 책(3권)이 탭 순서에 든다
    expect(tabbable()).toEqual([bookItem(3)])
    bookItem(3).focus()
    await user.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(bookItem(4))
    expect(tabbable()).toEqual([bookItem(4)])
    await user.keyboard('{ArrowUp}{ArrowUp}')
    expect(document.activeElement).toBe(bookItem(2))
    await user.keyboard('{End}')
    expect(document.activeElement).toBe(bookItem(books.length))
    await user.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(bookItem(books.length))
    await user.keyboard('{Home}')
    expect(document.activeElement).toBe(bookItem(1))
    // 화면은 그대로다
    expect(onScreen()).toBe('shelf')
    expect(shelfCurrentNo()).toBe(3)
    const fieldList = inPanel().getByRole('list', { name: '학문' })
    expect(within(fieldList).getAllByRole('button').filter((b) => b.tabIndex === 0)).toHaveLength(1)
  })
})

describe('전체 메뉴가 열려 있는 동안', () => {
  it('아래의 화면은 조작되지 않고, 휠·키가 화면을 옮기거나 책을 넘기지 않는다', async () => {
    const user = userEvent.setup()
    render(<App renderer="css" initial={AT_SHELF} />)
    await user.click(toggle())
    expect(screens()).toHaveAttribute('inert')
    fireEvent.wheel(document.querySelector('.app')!, { deltaY: 300 })
    fireEvent.wheel(panel(), { deltaY: 300 })
    for (const key of ['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End']) {
      fireEvent.keyDown(window, { key })
    }
    expect(onScreen()).toBe('shelf')
    expect(shelfCurrentNo()).toBe(3)
    expect(isOpen()).toBe(true)
    // 닫으면 다시 조작된다
    await user.keyboard('{Escape}')
    expect(screens()).not.toHaveAttribute('inert')
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(shelfCurrentNo()).toBe(4)
  })

  it('패널 안의 휠은 막지 않는다(목록이 스크롤된다)', async () => {
    const user = userEvent.setup()
    render(<App renderer="css" initial={AT_SHELF} />)
    await user.click(toggle())
    const list = inPanel().getByRole('list', { name: '책' })
    // fireEvent는 기본 동작이 막히지 않았으면 true를 돌려준다
    expect(fireEvent.wheel(list, { deltaY: 120 })).toBe(true)
  })

  it('로고를 눌러 인트로로 가면 패널도 닫힌다', async () => {
    const user = userEvent.setup()
    render(<App renderer="css" initial={AT_SHELF} />)
    await user.click(toggle())
    await user.click(within(header()).getByRole('link', { name: '서가명강' }))
    expect(onScreen()).toBe('intro')
    expect(isOpen()).toBe(false)
  })
})

describe('전체 메뉴와 책 페이지 (WebGL 서가)', () => {
  const T0 = 5_000_000
  const setup = async (initial: Parameters<typeof App>[0]['initial'] = AT_SHELF) => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'], shouldAdvanceTime: true })
    vi.setSystemTime(T0)
    const shelf = fakeShelfScene()
    render(<App renderer="webgl" createScene={shelf.create} initial={initial} />)
    await waitFor(() => expect(shelf.create).toHaveBeenCalledTimes(1), { timeout: 5000 })
    return shelf
  }
  /** 시간을 보낸다(잠금이 풀리고, 예약해 둔 이동이 돈다) */
  const pass = (ms: number) => act(() => vi.advanceTimersByTime(ms))
  const click = (el: Element) => fireEvent.click(el, { detail: 1 })

  it('책을 고르면 그 책의 책 페이지가 열린다. 닫으면 서가로 돌아간다', async () => {
    await setup({ screen: 'fields', index: 2, field: 3 })
    click(toggle())
    click(bookItem(20))
    expect(isOpen()).toBe(false)
    expect(onScreen()).toBe('shelf')
    expect(screen.getByRole('region', { name: books[19].title })).toBeInTheDocument()
    expect(document.querySelector('.app')).toHaveAttribute('data-view', 'book')
    pass(BOOK_OPEN_MS + 100)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onScreen()).toBe('shelf')
    expect(document.querySelector('.app')).not.toHaveAttribute('data-view')
    expect(shelfCurrentNo()).toBe(20)
  })

  it('책 페이지에서 다른 책을 고르면 그 책의 페이지로 넘어간다', async () => {
    await setup()
    click(shelfCentre())
    await waitFor(() => expect(pageRegion()).not.toBeNull())
    pass(BOOK_OPEN_MS + 100)
    click(toggle())
    expect(bookItem(3)).toHaveAttribute('aria-current', 'true')
    click(bookItem(30))
    expect(screen.getByRole('region', { name: books[29].title })).toBeInTheDocument()
    expect(document.querySelector('.app')).toHaveAttribute('data-page', 'turn')
  })

  it('책 페이지에서 Esc는 패널만 닫는다. 휠도 권을 넘기지 않는다', async () => {
    await setup({ screen: 'shelf', index: 2, view: 'book' })
    pass(BOOK_OPEN_MS + 100)
    click(toggle())
    fireEvent.wheel(document.querySelector('.app')!, { deltaY: 300 })
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    expect(screen.getByRole('region', { name: books[2].title, hidden: true })).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(isOpen()).toBe(false)
    expect(document.querySelector('.app')).toHaveAttribute('data-view', 'book')
    expect(screen.getByRole('region', { name: books[2].title })).toBeInTheDocument()
    // 패널이 닫힌 뒤의 Esc는 책 페이지를 닫는다
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(document.querySelector('.app')).not.toHaveAttribute('data-view')
  })

  it('책 페이지에서 분류·학문을 고르면 책 페이지를 닫고 그 화면으로 간다', async () => {
    await setup({ screen: 'shelf', index: 2, view: 'book' })
    pass(BOOK_OPEN_MS + 100)
    click(toggle())
    click(fieldItem(6))
    expect(onScreen()).toBe('fields')
    expect(dialField()).toBe(fields[6].name)
    expect(document.querySelector('.app')).not.toHaveAttribute('data-view')
  })

  it('책 페이지에서 서가를 고르면 책 페이지를 닫고 서가로 간다', async () => {
    await setup({ screen: 'shelf', index: 2, view: 'book' })
    pass(BOOK_OPEN_MS + 100)
    click(toggle())
    expect(inPanel().getByRole('button', { name: '서가' })).not.toHaveAttribute('aria-current')
    click(inPanel().getByRole('button', { name: '서가' }))
    expect(onScreen()).toBe('shelf')
    expect(document.querySelector('.app')).not.toHaveAttribute('data-view')
    expect(shelfCurrentNo()).toBe(3)
  })

  it('전환이 도는 동안(잠금) 고른 이동은 사라지지 않고, 잠금이 풀리면 간다', async () => {
    await setup()
    // 서가의 가운데 책을 눌러 책 페이지를 연다: 열리는 전환 동안 책 페이지를 움직이는 입력은 잠긴다
    click(shelfCentre())
    expect(document.querySelector('.app')).toHaveAttribute('data-view', 'book')
    click(toggle())
    click(inPanel().getByRole('button', { name: '분류' }))
    expect(isOpen()).toBe(false)
    // 아직 잠겨 있다: 책 페이지 그대로
    expect(onScreen()).toBe('shelf')
    expect(document.querySelector('.app')).toHaveAttribute('data-view', 'book')
    pass(BOOK_OPEN_MS + 400)
    expect(onScreen()).toBe('fields')
    expect(document.querySelector('.app')).not.toHaveAttribute('data-view')
  })
})

describe('미뤄 둔 이동은 고른 때의 상태에 묶여 있다 (WebGL 서가)', () => {
  const T0 = 6_000_000
  const setup = async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'], shouldAdvanceTime: true })
    vi.setSystemTime(T0)
    const shelf = fakeShelfScene()
    render(<App renderer="webgl" createScene={shelf.create} initial={AT_SHELF} />)
    await waitFor(() => expect(shelf.create).toHaveBeenCalledTimes(1), { timeout: 5000 })
    return shelf
  }
  const pass = (ms: number) => act(() => vi.advanceTimersByTime(ms))
  const click = (el: Element) => fireEvent.click(el, { detail: 1 })

  it('잠금 중에 분류를 고른 뒤 로고로 인트로에 가면, 미뤄 둔 이동은 버려진다(인트로에 머문다)', async () => {
    await setup()
    click(shelfCentre())
    expect(document.querySelector('.app')).toHaveAttribute('data-view', 'book')
    click(toggle())
    click(inPanel().getByRole('button', { name: '분류' }))
    // 로고: 잠금 중에도 받는다
    click(within(header()).getByRole('link', { name: '서가명강' }))
    expect(onScreen()).toBe('intro')
    pass(BOOK_OPEN_MS + 1000)
    expect(onScreen()).toBe('intro')
  })

  it('잠금 중에 책을 고른 뒤 브라우저의 뒤로 가기로 책 페이지를 닫으면, 그 책의 페이지가 다시 열리지 않는다', async () => {
    await setup()
    click(shelfCentre())
    await waitFor(() => expect(window.location.hash).toBe('#/book/3'))
    click(toggle())
    click(bookItem(30))
    // 뒤로 가기: 주소가 먼저 바뀌고 책 페이지가 닫힌다(잠금 중에도)
    act(() => {
      window.history.replaceState(null, '', '/')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(document.querySelector('.app')).not.toHaveAttribute('data-view')
    pass(BOOK_OPEN_MS + 1000)
    expect(document.querySelector('.app')).not.toHaveAttribute('data-view')
    expect(onScreen()).toBe('shelf')
    expect(shelfCurrentNo()).toBe(3)
    expect(window.location.hash).toBe('')
  })
})

describe('메뉴에서 고른 책의 전환 (WebGL 서가): 서가가 그 책으로 넘어가 놓인 뒤에 뽑는다', () => {
  const T0 = 8_000_000
  const setup = async (initial: Parameters<typeof App>[0]['initial']) => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'], shouldAdvanceTime: true })
    vi.setSystemTime(T0)
    const shelf = fakeShelfScene()
    render(<App renderer="webgl" createScene={shelf.create} initial={initial} />)
    await waitFor(() => expect(shelf.create).toHaveBeenCalledTimes(1), { timeout: 5000 })
    return shelf
  }
  const pass = (ms: number) => act(() => vi.advanceTimersByTime(ms))
  const click = (el: Element) => fireEvent.click(el, { detail: 1 })
  const bookView = () => document.querySelector('.app')!.getAttribute('data-view')
  /** 그 길에서 뽑기까지 기다리는 시간 */
  const waitOf = (state: Parameters<typeof menuBookRoute>[0], index: number) => menuBookRoute(state, index, books.length)[1].afterMs

  it('서가에서 다른 책을 고르면: 먼저 서가가 그 책으로 넘어가고, 놓인 뒤에 책 페이지가 열린다(서가에서 여는 전환 그대로)', async () => {
    await setup({ screen: 'shelf', index: 0 })
    const wait = waitOf({ screen: 'shelf', index: 0 }, 29)
    click(toggle())
    click(bookItem(30))
    expect(isOpen()).toBe(false)
    // 첫 단계: 서가가 30권으로 넘어간다. 책 페이지는 아직 아니다
    expect(shelfCurrentNo()).toBe(30)
    expect(bookView()).toBeNull()
    expect(window.location.hash).toBe('')
    pass(wait - 50)
    expect(bookView()).toBeNull()
    // 놓인 뒤: 가운데 책을 눌러 열 때와 같은 전환
    pass(100)
    expect(bookView()).toBe('book')
    expect(document.querySelector('.app')).toHaveAttribute('data-page', 'open')
    expect(screen.getByRole('region', { name: books[29].title })).toBeInTheDocument()
    await waitFor(() => expect(window.location.hash).toBe('#/book/30'))
    // 닫으면 서가의 그 책이다
    pass(BOOK_OPEN_MS + 100)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(bookView()).toBeNull()
    expect(onScreen()).toBe('shelf')
    expect(shelfCurrentNo()).toBe(30)
  })

  it('서가에서 지금 가운데 책을 고르면 바로 책 페이지가 열린다', async () => {
    await setup({ screen: 'shelf', index: 2 })
    click(toggle())
    click(bookItem(3))
    expect(bookView()).toBe('book')
    expect(document.querySelector('.app')).toHaveAttribute('data-page', 'open')
  })

  it('신간 소개에서 고르면: 먼저 그 책이 가운데인 서가로 옮겨 가고, 책이 놓인 뒤에 책 페이지가 열린다', async () => {
    await setup({ screen: 'feature', index: 0 })
    const wait = waitOf({ screen: 'feature', index: 0 }, 9)
    click(toggle())
    click(bookItem(10))
    expect(onScreen()).toBe('shelf')
    expect(shelfCurrentNo()).toBe(10)
    expect(bookView()).toBeNull()
    pass(wait - 50)
    expect(bookView()).toBeNull()
    pass(100)
    expect(bookView()).toBe('book')
    expect(screen.getByRole('region', { name: books[9].title })).toBeInTheDocument()
  })

  it('넘어가는 사이에 다른 입력이 끼면 남은 단계(뽑기)는 버린다', async () => {
    await setup({ screen: 'shelf', index: 0 })
    const wait = waitOf({ screen: 'shelf', index: 0 }, 29)
    click(toggle())
    click(bookItem(30))
    pass(200)
    // 방문자가 책을 한 권 넘겼다
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(shelfCurrentNo()).toBe(31)
    pass(wait + 500)
    expect(bookView()).toBeNull()
    expect(shelfCurrentNo()).toBe(31)
  })

  it('넘어가는 사이에 로고로 인트로에 가도 책 페이지는 열리지 않는다', async () => {
    await setup({ screen: 'feature', index: 0 })
    click(toggle())
    click(bookItem(10))
    pass(100)
    click(within(header()).getByRole('link', { name: '서가명강' }))
    expect(onScreen()).toBe('intro')
    pass(5000)
    expect(onScreen()).toBe('intro')
    expect(bookView()).toBeNull()
  })

  it('넘어가는 사이에 메뉴에서 다른 것을 고르면 앞의 길은 버리고 새로 고른 곳으로 간다', async () => {
    await setup({ screen: 'shelf', index: 0 })
    click(toggle())
    click(bookItem(30))
    pass(100)
    click(toggle())
    click(inPanel().getByRole('button', { name: '분류' }))
    expect(onScreen()).toBe('fields')
    pass(5000)
    expect(onScreen()).toBe('fields')
    expect(bookView()).toBeNull()
  })

  it('학제별 분류에서 고르면 전처럼 한 번에 책 페이지로 간다', async () => {
    await setup({ screen: 'fields', index: 2, field: 3 })
    click(toggle())
    click(bookItem(20))
    expect(onScreen()).toBe('shelf')
    expect(bookView()).toBe('book')
  })
})

describe('전체 메뉴가 열려 있는 동안 물러나는 것들', () => {
  it('책 페이지의 떠 있는 책은 포인터를 따라 돌지 않는다', async () => {
    const shelf = fakeShelfScene()
    render(<App renderer="webgl" createScene={shelf.create} initial={{ screen: 'shelf', index: 2, view: 'book' }} />)
    await waitFor(() => expect(shelf.create).toHaveBeenCalledTimes(1), { timeout: 5000 })
    const moves = () => shelf.scene.setPagePointer.mock.calls.filter(([p]) => p !== null).length
    fireEvent.pointerMove(document.body, { clientX: 100, clientY: 100, pointerType: 'mouse' })
    const before = moves()
    expect(before).toBeGreaterThan(0)
    fireEvent.click(toggle(), { detail: 1 })
    fireEvent.pointerMove(document.body, { clientX: 400, clientY: 300, pointerType: 'mouse' })
    expect(moves()).toBe(before)
    // 닫으면 다시 따라 돈다
    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.pointerMove(document.body, { clientX: 500, clientY: 300, pointerType: 'mouse' })
    expect(moves()).toBe(before + 1)
  })

  it('그래픽 가속 안내도 조작에서 빠진다(판 아래에 가려진 [ 닫기 ]가 탭 순서에 남지 않는다)', async () => {
    window.sessionStorage.clear()
    const user = userEvent.setup()
    render(<App renderer="nogpu" initial={AT_SHELF} />)
    const notice = document.querySelector<HTMLElement>('.gpunotice')!
    expect(notice).not.toHaveAttribute('inert')
    await user.click(toggle())
    expect(notice).toHaveAttribute('inert')
    await user.keyboard('{Escape}')
    expect(notice).not.toHaveAttribute('inert')
  })
})

describe('Menu (혼자 쓸 때)', () => {
  it('분류·서가 버튼의 이름은 보이는 글에서 온다(같은 말의 aria-label을 두지 않는다)', () => {
    const noop = () => {}
    render(
      <Menu open="pointer" here={{ place: null, index: 0, field: 0 }} onClose={noop} onFields={noop} onField={noop} onShelf={noop} onBook={noop} />,
    )
    for (const name of ['분류', '서가']) {
      const button = screen.getByRole('button', { name })
      expect(button).not.toHaveAttribute('aria-label')
    }
  })

  it('폭 900px 미만에서는 학문 줄과 책 줄의 누르는 높이가 44px이다(menu.css)', async () => {
    const { readFileSync } = await import('node:fs')
    const css = readFileSync('src/menu/menu.css', 'utf8')
    const narrow = css.slice(css.indexOf('@media (max-width: 899px)'))
    expect(narrow).toMatch(/\.menu__item,\s*\.menu__book \{\s*min-height: 44px;/)
  })

  it('닫혀 있으면 가림막이 없고, 열려 있으면 가림막을 누를 때 onClose를 부른다', async () => {
    const onClose = vi.fn()
    const noop = () => {}
    const props = { here: { place: null, index: 0, field: 0 }, onClose, onFields: noop, onField: noop, onShelf: noop, onBook: noop }
    const { rerender } = render(<Menu open={false} {...props} />)
    expect(document.querySelector('.menu__scrim')).toBeNull()
    rerender(<Menu open="pointer" {...props} />)
    fireEvent.click(document.querySelector('.menu__scrim')!)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
