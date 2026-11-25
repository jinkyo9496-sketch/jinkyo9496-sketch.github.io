import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../src/App'
import { BOOK_CLOSE_MS, BOOK_OPEN_MS, BOOK_TURN_MS } from '../src/app/screen'
import { bookColors } from '../src/data/bookColors'
import { books } from '../src/data/books'
import { BookPage } from '../src/page/BookPage'
import { CONTEXT_RESTORE_WAIT_MS } from '../src/shelf3d/Shelf3D'
import type { SceneFactory, ShelfSceneHandle } from '../src/shelf3d/sceneTypes'

const blurbs = { 11: { subtitle: '열한 번째 부제', summary: '열한 번째 책의 소개 글.' } }
const T0 = 5_000_000

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

/** 열려 있는(읽히는) 책 페이지. 닫히는 중인 것은 세지 않는다 */
const pageRegion = () => document.querySelector<HTMLElement>('.bookpage:not([aria-hidden="true"])')
const pageOf = (no: number) => screen.getByRole('region', { name: books[no - 1].title })
const app = () => document.querySelector<HTMLElement>('.app')!
const shelf = () => screen.getByRole('region', { name: '서가명강 서가', hidden: true })
const centreButton = () => within(shelf()).getByRole('button', { current: true, hidden: true })
const wheel = (deltaY: number) => fireEvent.wheel(app(), { deltaY })
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

describe('BookPage: the right-hand content', () => {
  const setup = (index = 10, props: Partial<Parameters<typeof BookPage>[0]> = {}) => {
    const handlers = { onGo: vi.fn() }
    const view = render(<BookPage books={books} currentIndex={index} blurbs={blurbs} {...handlers} {...props} />)
    const again = (next: number, more: Partial<Parameters<typeof BookPage>[0]> = {}) =>
      view.rerender(<BookPage books={books} currentIndex={next} blurbs={blurbs} {...handlers} {...props} {...more} />)
    return { ...view, ...handlers, again }
  }

  it('is a region named by its heading, not a dialog', () => {
    setup()
    const region = pageOf(11)
    expect(region.tagName).toBe('SECTION')
    expect(screen.queryByRole('dialog')).toBeNull()
    const heading = within(region).getByRole('heading', { level: 1, name: books[10].title })
    expect(heading).toHaveAttribute('tabindex', '-1')
  })

  it('shows the series number, title, subtitle, author with affiliation, and summary as real text', () => {
    setup()
    const region = pageOf(11)
    expect(within(region).getByText('서가명강 11')).toBeInTheDocument()
    expect(within(region).getByText('열한 번째 부제')).toBeInTheDocument()
    expect(within(region).getByText(`${books[10].author} 지음`)).toBeInTheDocument()
    // 출간일 대신 저자의 소속('서울대학교'는 뺀다)
    expect(within(region).getByText('지구환경과학부 교수')).toBeInTheDocument()
    expect(region.querySelector('time')).toBeNull()
    expect(region.textContent).not.toContain('서울대학교')
    expect(within(region).getByText('열한 번째 책의 소개 글.')).toBeInTheDocument()
  })

  it('leaves out the subtitle and summary of a book without a blurb', () => {
    setup(11)
    const region = pageOf(12)
    expect(region.querySelector('.bookpage__subtitle')).toBeNull()
    expect(region.querySelector('.bookpage__summary')).toBeNull()
    expect(within(region).getByText(`${books[11].author} 지음`)).toBeInTheDocument()
  })

  it('has no 알라딘 button under the text (2026-11-25: the way to the bookstore is the last page of the preview)', () => {
    setup()
    expect(within(pageOf(11)).queryByRole('link', { name: '알라딘에서 보기' })).toBeNull()
    expect(pageOf(11).querySelector('.bookpage__column a')).toBeNull()
    expect(pageOf(11).querySelector('.bookpage__actions')).toBeNull()
  })

  it('has no front/back cover buttons', () => {
    setup()
    expect(screen.queryByRole('button', { name: '앞표지' })).toBeNull()
    expect(screen.queryByRole('button', { name: '뒤표지' })).toBeNull()
  })

  it('has no button to go back (2026-11-24: Esc and the browser’s back close it) and no [ 이전 ] N / 전체 권수 [ 다음 ]', () => {
    setup()
    expect(screen.queryByRole('button', { name: '서가로' })).toBeNull()
    expect(screen.queryByRole('button', { name: '학제별 분류로' })).toBeNull()
    expect(document.querySelector('.bookpage__back')).toBeNull()
    expect(screen.queryByRole('button', { name: '이전' })).toBeNull()
    expect(screen.queryByRole('button', { name: '다음' })).toBeNull()
    expect(pageOf(11)).not.toHaveTextContent(`11 / ${books.length}`)
  })

  it('announces the new book politely when the page changes, not when it opens', () => {
    const { again } = setup()
    const status = within(pageOf(11)).getByRole('status')
    expect(status).toBeEmptyDOMElement()
    again(11)
    expect(within(pageOf(12)).getAllByRole('status')[0]).toHaveTextContent(`12권 ${books[11].title}`)
  })

  it('keeps the heading element (and so the focus) when the page changes', () => {
    const { again } = setup()
    const heading = screen.getByRole('heading', { level: 1 })
    heading.focus()
    again(11)
    expect(screen.getByRole('heading', { level: 1 })).toBe(heading)
    expect(heading).toHaveTextContent(books[11].title)
    expect(heading).toHaveFocus()
  })

  it('lets the previous text fade away as decoration only', () => {
    const { again } = setup()
    again(11)
    const ghost = document.querySelector<HTMLElement>('.bookpage__ghost')!
    expect(ghost).toHaveTextContent(books[10].title)
    expect(ghost).toHaveAttribute('aria-hidden', 'true')
    expect(ghost).toHaveAttribute('inert')
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })
})

describe('App with the WebGL shelf: the book page replaces the dialog', () => {
  const setup = async (index = 10, hash = '') => {
    if (hash) window.history.replaceState(null, '', `/${hash}`)
    const { scene, create } = fakeScene()
    const user = userEvent.setup()
    const view = render(
      <App renderer="webgl" createScene={create} blurbs={blurbs} initial={hash ? undefined : { screen: 'shelf', index }} />,
    )
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
    const lastPage = () => scene.setPage.mock.calls.at(-1)![0]
    return { ...view, scene, create, user, lastPage }
  }
  const open = async (index = 10) => {
    const ctx = await setup(index)
    await ctx.user.click(centreButton())
    tick(BOOK_OPEN_MS + 10)
    return ctx
  }

  it('opens the page from the centre book: a region, no dialog, the scene told', async () => {
    const { user, lastPage } = await setup()
    expect(pageRegion()).toBeNull()
    await user.click(centreButton())
    expect(pageOf(11)).toBeInTheDocument()
    expect(document.querySelector('dialog[open]')).toBeNull()
    expect(lastPage()).toEqual({ open: true, side: 'front', spread: 0 })
    expect(app()).toHaveAttribute('data-view', 'book')
  })

  it('opens it with Enter on the centre book', async () => {
    const { user } = await setup()
    centreButton().focus()
    await user.keyboard('{Enter}')
    expect(pageOf(11)).toBeInTheDocument()
  })

  it('opens it with Space on the centre book; there is no [ 자세히 ] any more', async () => {
    const { user } = await setup()
    expect(screen.queryByRole('button', { name: '자세히' })).toBeNull()
    centreButton().focus()
    await user.keyboard(' ')
    expect(pageOf(11)).toBeInTheDocument()
  })

  it('the dial under the shelf only moves the shelf; on a page the page has its own dial', async () => {
    const { user } = await setup()
    const shelfDial = screen.getByRole('navigation', { name: '권 이동' })
    expect(shelfDial).not.toHaveClass('bookpage__dial')
    await user.click(within(shelfDial).getByRole('button', { name: `13권 ${books[12].title}` }))
    expect(pageRegion()).toBeNull()
    expect(centreButton()).toHaveAccessibleName(`13권 ${books[12].title}`)
    await user.click(centreButton())
    // 서가의 다이얼은 하단 바와 함께 가려지고, 읽히는 다이얼은 책 페이지의 것 하나다
    expect(screen.getByRole('navigation', { name: '권 이동' })).toHaveClass('dial', 'bookpage__dial')
  })

  it('clicking another book only moves the shelf', async () => {
    const { user } = await setup()
    await user.click(within(shelf()).getByRole('button', { name: `13권 ${books[12].title}` }))
    expect(pageRegion()).toBeNull()
    expect(centreButton()).toHaveAccessibleName(`13권 ${books[12].title}`)
  })

  it('fills the screen with the book’s key colour and its text colour', async () => {
    await open()
    const c = bookColors[11]
    expect(app().style.getPropertyValue('--page-bg')).toBe(c.background)
    expect(app().style.getPropertyValue('--page-fg')).toBe(`var(--${c.text})`)
    // 헤더의 로고도 그 글자색에 맞는 것으로 바뀐다(먹 / 흰색)
    expect(document.querySelector('.header .logo')).toHaveAttribute('data-tone', c.text)
    // 책 페이지에서는 한 색 로고다(하늘색 '명'이 대표색에 묻히지 않게)
    expect(document.querySelector('.header .logo')).toHaveAttribute('data-show', `${c.text}-mono`)
    // 헤더는 그대로 보인다
    expect(screen.getByRole('banner')).toBeInTheDocument()
  })

  it('moves focus to the heading and hides the shelf, the band and the bottom bar', async () => {
    await open()
    expect(within(pageOf(11)).getByRole('heading', { level: 1 })).toHaveFocus()
    const stage = document.querySelector<HTMLElement>('.stage__shelf')!
    const bar = document.querySelector<HTMLElement>('.bar')!
    for (const el of [stage, bar]) {
      expect(el).toHaveAttribute('inert')
      expect(el).toHaveAttribute('aria-hidden', 'true')
    }
    expect(screen.queryByRole('button', { name: '자세히' })).toBeNull()
  })

  it('keeps the title band usable: a faint neighbouring title turns to that book\'s page', async () => {
    await open()
    const titles = screen.getAllByTestId('band-title')
    expect(titles[10]).toHaveAttribute('data-current', 'true')
    fireEvent.click(titles[11])
    expect(pageOf(12)).toBeInTheDocument()
    expect(app()).toHaveAttribute('data-view', 'book')
    tick(BOOK_TURN_MS + 10)
    fireEvent.click(screen.getAllByTestId('band-title')[10])
    expect(pageOf(11)).toBeInTheDocument()
  })

  it('opens the book on the endpaper, turns leaves, and closes it again', async () => {
    const { lastPage } = await open()
    const reader = () => within(screen.getByRole('group', { name: '책 펼쳐 보기' }))
    fireEvent.click(reader().getByRole('button', { name: '펼쳐 보기' }))
    expect(lastPage()).toEqual({ open: true, side: 'front', spread: 1 })
    expect(reader().getByRole('status')).toHaveTextContent('면지')
    fireEvent.click(reader().getByRole('button', { name: '다음 장' }))
    expect(lastPage().spread).toBe(2)
    expect(reader().getByRole('status')).toHaveTextContent('면지 · 1쪽')
    // 펼친 동안 좌우 화살표는 낱장을 넘긴다(책이 바뀌지 않는다)
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(lastPage().spread).toBe(3)
    expect(pageOf(11)).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(lastPage().spread).toBe(2)
    // Esc는 먼저 책을 덮는다
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(lastPage()).toEqual({ open: true, side: 'front', spread: 0 })
    expect(pageOf(11)).toBeInTheDocument()
  })

  it('closes the opened book when the page turns to another book', async () => {
    const { lastPage } = await open()
    fireEvent.click(screen.getByRole('button', { name: '펼쳐 보기' }))
    expect(lastPage()).toEqual({ open: true, side: 'front', spread: 1 })
    tick(BOOK_TURN_MS + 10)
    fireEvent.click(screen.getByRole('button', { name: `12권 ${books[11].title}` }))
    expect(lastPage().spread).toBe(0)
  })

  it('lifts the corner of the page under the pointer: which side, and its top or bottom half', async () => {
    const { lastPage } = await open()
    fireEvent.click(screen.getByRole('button', { name: '펼쳐 보기' }))
    const right = document.querySelector<HTMLElement>('.bookpage__hit--right')!
    right.getBoundingClientRect = () => ({ top: 100, height: 400, left: 0, width: 300, right: 300, bottom: 500, x: 0, y: 100, toJSON: () => ({}) })
    fireEvent.pointerMove(right, { clientY: 150, pointerType: 'mouse' })
    expect(lastPage().peek).toEqual({ side: 'right', corner: 'top' })
    fireEvent.pointerMove(right, { clientY: 450, pointerType: 'mouse' })
    expect(lastPage().peek).toEqual({ side: 'right', corner: 'bottom' })
    fireEvent.pointerLeave(right)
    expect(lastPage().peek).toBeUndefined()
  })

  it('lays no panel: the book and the text sit straight on the key colour', async () => {
    await open()
    expect(document.querySelector('.book-panel')).toBeNull()
  })

  it('writes the page into the address', async () => {
    await open()
    expect(window.location.hash).toBe('#/book/11')
  })

  it('goes to the next and previous volume with the wheel, one book per gesture', async () => {
    const { scene } = await open()
    wheel(120)
    expect(pageOf(12)).toBeInTheDocument()
    expect(app().style.getPropertyValue('--page-bg')).toBe(bookColors[12].background)
    expect(scene.setState.mock.calls.at(-1)![0].index).toBe(11)
    expect(window.location.hash).toBe('#/book/12')
    // 전환 중에는 받지 않는다
    tick(300)
    wheel(120)
    wheel(120)
    expect(pageOf(12)).toBeInTheDocument()
    tick(BOOK_TURN_MS)
    wheel(-120)
    expect(pageOf(11)).toBeInTheDocument()
  })

  it.each([
    ['ArrowDown', 12],
    ['ArrowRight', 12],
    ['PageDown', 12],
    ['ArrowUp', 10],
    ['ArrowLeft', 10],
    ['PageUp', 10],
  ])('%s shows volume %i', async (key, no) => {
    await open()
    fireEvent.keyDown(window, { key })
    expect(pageOf(no)).toBeInTheDocument()
  })

  it('ignores keys while a page transition runs (no skipping)', async () => {
    await open()
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    fireEvent.keyDown(window, { key: 'ArrowDown', repeat: true })
    expect(pageOf(12)).toBeInTheDocument()
    tick(BOOK_TURN_MS + 10)
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    expect(pageOf(13)).toBeInTheDocument()
  })

  it('stops at volume 1 without leaving the page', async () => {
    await open(0)
    wheel(-120)
    fireEvent.keyDown(window, { key: 'ArrowUp' })
    expect(pageOf(1)).toBeInTheDocument()
    expect(document.querySelector('.screens')).toHaveAttribute('data-screen', 'shelf')
  })

  it('a line of the dial turns the page to that volume', async () => {
    const { user } = await open()
    await user.click(screen.getByRole('button', { name: `30권 ${books[29].title}` }))
    expect(pageOf(30)).toBeInTheDocument()
    tick(BOOK_TURN_MS + 10)
    await user.click(screen.getByRole('button', { name: `12권 ${books[11].title}` }))
    expect(pageOf(12)).toBeInTheDocument()
    expect(within(pageOf(12)).getAllByRole('status')[0]).toHaveTextContent(`12권 ${books[11].title}`)
  })

  it('returns to the shelf with Esc: the viewed book is the centre book and has the focus', async () => {
    const { lastPage } = await open()
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    tick(BOOK_TURN_MS + 10)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(pageRegion()).toBeNull()
    expect(lastPage().open).toBe(false)
    expect(app()).not.toHaveAttribute('data-view')
    expect(app().style.getPropertyValue('--page-bg')).toBe('')
    expect(centreButton()).toHaveAccessibleName(`12권 ${books[11].title}`)
    expect(centreButton()).toHaveFocus()
    expect(document.querySelector('.stage__shelf')).not.toHaveAttribute('inert')
    await waitFor(() => expect(window.location.hash).toBe(''))
  })

  it('returns with Esc', async () => {
    await open()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(pageRegion()).toBeNull()
    expect(centreButton()).toHaveFocus()
  })

  it('cannot be reopened until the closing transition is over', async () => {
    const { user } = await open()
    fireEvent.keyDown(window, { key: 'Escape' })
    await user.click(centreButton())
    expect(pageRegion()).toBeNull()
    tick(BOOK_CLOSE_MS + 10)
    await user.click(centreButton())
    expect(pageOf(11)).toBeInTheDocument()
  })

  it('returns to the shelf with the browser’s Back', async () => {
    await open()
    expect(window.location.hash).toBe('#/book/11')
    act(() => {
      window.history.replaceState(null, '', '/')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(pageRegion()).toBeNull()
    expect(centreButton()).toHaveAccessibleName(`11권 ${books[10].title}`)
  })

  it('opens the page of the address when loaded on #/book/N, straight away', async () => {
    const { lastPage, create } = await setup(0, '#/book/23')
    expect(pageOf(23)).toBeInTheDocument()
    expect(document.querySelector('.screens')).toHaveAttribute('data-screen', 'shelf')
    expect(create.mock.calls[0][0].page).toEqual({ open: true, side: 'front', spread: 0 })
    expect(lastPage().open).toBe(true)
    expect(app().style.getPropertyValue('--page-bg')).toBe(bookColors[23].background)
    expect(window.location.hash).toBe('#/book/23')
  })

  it('follows the address when it changes to another book', async () => {
    await open()
    act(() => {
      window.history.replaceState(null, '', '/#/book/30')
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(pageOf(30)).toBeInTheDocument()
  })

  it('goes to the intro from the logo, closing the page', async () => {
    const { user } = await open()
    await user.click(screen.getByRole('link', { name: '서가명강' }))
    expect(document.querySelector('.screens')).toHaveAttribute('data-screen', 'intro')
    expect(pageRegion()).toBeNull()
    expect(app()).not.toHaveAttribute('data-view')
  })

  it('falls back to the dialog for that book when WebGL fails while a page is open', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {})
    await open()
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
    fireEvent(document.querySelector('canvas')!, new Event('webglcontextlost', { cancelable: true }))
    act(() => void vi.advanceTimersByTime(CONTEXT_RESTORE_WAIT_MS + 10))
    expect(pageRegion()).toBeNull()
    const dialog = document.querySelector<HTMLElement>('dialog.detail[open]')!
    expect(dialog).not.toBeNull()
    expect(within(dialog).getByRole('heading', { name: books[10].title })).toBeInTheDocument()
    expect(app()).not.toHaveAttribute('data-view')
  })
})

describe('App with the CSS shelf: the dialog stays', () => {
  it('opens the dialog, not a page', async () => {
    const user = userEvent.setup()
    render(<App renderer="css" initial={{ screen: 'shelf', index: 10 }} />)
    await user.click(centreButton())
    expect(document.querySelector('dialog.detail[open]')).not.toBeNull()
    expect(app()).not.toHaveAttribute('data-view')
    expect(window.location.hash).toBe('')
  })

  it('opens the dialog for the book of the address', () => {
    window.history.replaceState(null, '', '/#/book/23')
    render(<App renderer="css" />)
    const dialog = document.querySelector<HTMLElement>('dialog.detail[open]')!
    expect(within(dialog).getByRole('heading', { name: books[22].title })).toBeInTheDocument()
    expect(app()).not.toHaveAttribute('data-view')
    expect(centreButton()).toHaveAccessibleName(`23권 ${books[22].title}`)
  })
})

describe('BookPage: the volume dial under the book', () => {
  const handlers = () => ({ onGo: vi.fn() })
  const dial = () => screen.getByRole('navigation', { name: '권 이동' })
  const ticks = () => within(dial()).getAllByRole('button')

  it('draws one line per volume and marks only this book’s', () => {
    render(<BookPage books={books} currentIndex={10} {...handlers()} />)
    expect(ticks()).toHaveLength(books.length)
    const current = ticks().filter((t) => t.hasAttribute('data-current'))
    expect(current).toEqual([ticks()[10]])
    expect(ticks()[10]).toHaveAttribute('aria-current', 'true')
    expect(ticks()[10]).toHaveAccessibleName(`11권 ${books[10].title}`)
  })

  it('goes to the volume of the line that is pressed, not for the current one', async () => {
    const user = userEvent.setup()
    const h = handlers()
    render(<BookPage books={books} currentIndex={10} {...h} />)
    await user.click(ticks()[34])
    expect(h.onGo).toHaveBeenCalledWith(34)
    await user.click(ticks()[10])
    expect(h.onGo).toHaveBeenCalledTimes(1)
  })

  it('has a single tab stop: the current volume’s line', () => {
    render(<BookPage books={books} currentIndex={0} {...handlers()} />)
    expect(ticks().filter((t) => t.tabIndex === 0)).toEqual([ticks()[0]])
  })
})
