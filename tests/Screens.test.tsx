import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../src/App'
import { books } from '../src/data/books'
import { featureSchedule } from '../src/feature/timeline'
import type { SceneFactory, ShelfSceneHandle } from '../src/shelf3d/sceneTypes'

const T0 = 1_000_000
const useClock = () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(T0)
}
afterEach(() => vi.useRealTimers())

const header = () => screen.getByRole('banner')
const introScreen = () => document.querySelector<HTMLElement>('[data-screen-name="intro"]')!
/** 신간 소개: 웰컴과 같은 자리에 겹쳐 있는 화면 */
const featureScreen = () => document.querySelector<HTMLElement>('[data-screen-name="feature"]')!
/** 키보드로 신간 소개에 오면 포커스를 받는 것: 도서명 제목 */
const featureTitle = () => featureScreen().querySelector<HTMLElement>('.feature__title')!
const shelfScreen = () => document.querySelector<HTMLElement>('[data-screen-name="shelf"]')!
const fieldsScreen = () => document.querySelector<HTMLElement>('[data-screen-name="fields"]')!
const onScreen = () => document.querySelector<HTMLElement>('.screens')!.dataset.screen
const enter = () => screen.getByRole('button', { name: '서가 보기' })
/** 서가에서 학제별 분류로: 버튼이 없어져(2026-11-24) 키보드 ↓로 간다 */
const toFields = () => fireEvent.keyDown(window, { key: 'ArrowDown' })
/** 학제별 분류에 키보드로 들어오면 포커스를 받는 것: 글자 다이얼의 지금 학문 */
const dialCurrent = () => document.querySelector<HTMLElement>('.fdial [aria-current="true"]')!
/** 다이얼 밖에서 위로 굴린 휠: 학제별 분류에서 서가로 돌아가는 길 */
const wheelUpOutsideDial = () => fireEvent.wheel(document.querySelector('.fields__content > :not(.fdial)')!, { deltaY: -200 })
const shelf = () => screen.getByRole('region', { name: '서가명강 서가', hidden: true })
const currentNo = () => {
  const current = within(shelf()).getAllByRole('button', { current: true, hidden: true })
  expect(current).toHaveLength(1)
  return Number(current[0].closest('[data-testid="book"]')!.getAttribute('data-no'))
}
const bookButton = (no: number) =>
  within(shelf()).getByRole('button', { name: `${no}권 ${books[no - 1].title}`, hidden: true })
const wheel = (deltaY: number, target: Element = document.querySelector('.app')!) =>
  fireEvent.wheel(target, { deltaY })
const expectHidden = (el: HTMLElement, hidden: boolean) => {
  if (hidden) {
    expect(el).toHaveAttribute('inert')
    expect(el).toHaveAttribute('aria-hidden', 'true')
  } else {
    expect(el).not.toHaveAttribute('inert')
    expect(el).not.toHaveAttribute('aria-hidden')
  }
}

describe('Intro screen', () => {
  it('is where the page opens: the shelf screen is inert and hidden, the header stays', () => {
    render(<App />)
    expect(onScreen()).toBe('intro')
    expectHidden(introScreen(), false)
    expectHidden(featureScreen(), true)
    expectHidden(shelfScreen(), true)
    expectHidden(fieldsScreen(), true)
    expect(screen.getByRole('heading', { level: 1 })).toHaveAccessibleName('서가명강')
    expect(screen.queryByRole('contentinfo')).toBeNull()
    expect(within(header()).getByRole('link', { name: '서가명강' })).toBeInTheDocument()
    expect(within(header()).queryByRole('button')).toBeNull()
    // 서가는 1권에서 기다린다
    expect(currentNo()).toBe(1)
  })

  it('shows the big logo, the catchphrase and [ 서가 보기 ], nothing else', () => {
    render(<App />)
    expect(within(introScreen()).getByRole('img', { name: '서가명강' })).toBeInTheDocument()
    expect(within(introScreen()).getAllByRole('button')).toEqual([enter()])
    expect(introScreen()).toHaveTextContent(/^서울대 가지 않아도 들을 수 있는 명강의\[ 서가 보기 \]$/)
  })

  it('the peeking shelf at the bottom of the intro goes straight to the shelf when pressed (no focus move)', () => {
    render(<App />)
    fireEvent.click(introScreen().querySelector('.intro__peek')!)
    expect(onScreen()).toBe('shelf')
    expect(currentNo()).toBe(1)
    expect(bookButton(1)).not.toHaveFocus()
  })

  it('carries the transition time to CSS as --dur-screen', () => {
    render(<App />)
    expect(document.querySelector<HTMLElement>('.app')!.style.getPropertyValue('--dur-screen')).toBe('700ms')
  })

  it('[ 서가 보기 ] goes straight to the shelf (not through 신간 소개) at book 1 and puts focus on that book', async () => {
    render(<App />)
    await userEvent.click(enter())
    expect(onScreen()).toBe('shelf')
    expectHidden(introScreen(), true)
    expectHidden(shelfScreen(), false)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('1권 나는 매주 시체를 보러 간다')
    expect(bookButton(1)).toHaveFocus()
    expect(screen.getByRole('contentinfo')).toBeInTheDocument()
  })
})

describe('Wheel between the screens', () => {
  it('one flick changes the screen and nothing else until the transition is over', () => {
    useClock()
    render(<App />)
    wheel(200)
    // 웰컴 아래는 신간 소개다
    expect(onScreen()).toBe('feature')
    // 같은 손짓의 나머지(관성)는 버린다
    wheel(200)
    vi.setSystemTime(T0 + 400)
    wheel(200)
    vi.setSystemTime(T0 + 850)
    wheel(200)
    expect(onScreen()).toBe('feature')
    // 전환(700ms) + 쉬는 시간(160ms)이 지나면 다음 화면으로
    vi.setSystemTime(T0 + 900)
    wheel(200)
    expect(onScreen()).toBe('shelf')
    vi.setSystemTime(T0 + 1800)
    wheel(200)
    expect(onScreen()).toBe('fields')
    expectHidden(shelfScreen(), true)
    expectHidden(fieldsScreen(), false)
    // 아래는 더 없다
    vi.setSystemTime(T0 + 3000)
    wheel(200)
    expect(onScreen()).toBe('fields')
    // 휠은 책을 넘기지 않았다
    expect(currentNo()).toBe(1)
  })

  it('does not carry a half-finished wheel delta across the screen change', () => {
    useClock()
    render(<App />)
    wheel(200)
    vi.setSystemTime(T0 + 880)
    wheel(20) // 40px이 쌓여야 한 걸음: 앞 손짓의 남은 양이 넘어오지 않았다
    expect(onScreen()).toBe('feature')
  })

  it('on the shelf the wheel never steps books: up is 신간 소개 (then the intro) from any book, and the book is kept', () => {
    useClock()
    render(<App initial={{ screen: 'shelf', index: 2 }} />)
    wheel(-200)
    expect(onScreen()).toBe('feature')
    expectHidden(shelfScreen(), true)
    expectHidden(featureScreen(), false)
    expect(currentNo()).toBe(3)
    vi.setSystemTime(T0 + 2000)
    wheel(-200)
    expect(onScreen()).toBe('intro')
    expectHidden(featureScreen(), true)
    // 웰컴 위는 없다
    vi.setSystemTime(T0 + 4000)
    wheel(-200)
    expect(onScreen()).toBe('intro')
    // 서가로 돌아오면 보던 책 그대로다
    vi.setSystemTime(T0 + 6000)
    wheel(200)
    expect(onScreen()).toBe('feature')
    vi.setSystemTime(T0 + 8000)
    wheel(200)
    expect(onScreen()).toBe('shelf')
    expect(currentNo()).toBe(3)
    expect(document.querySelector('.stage')).not.toHaveAttribute('data-gliding')
  })

  it('up on the fields screen comes back to the shelf at the same book', () => {
    useClock()
    render(<App initial={{ screen: 'fields', index: 11 }} />)
    expect(onScreen()).toBe('fields')
    wheel(-200)
    expect(onScreen()).toBe('shelf')
    expect(currentNo()).toBe(12)
    // 전환이 끝나기 전의 휠은 버린다(신간 소개까지 지나가지 않는다)
    vi.setSystemTime(T0 + 500)
    wheel(-200)
    expect(onScreen()).toBe('shelf')
    vi.setSystemTime(T0 + 900)
    wheel(-200)
    expect(onScreen()).toBe('feature')
  })

  it('works wherever the pointer is, and never lets the page scroll', () => {
    useClock()
    render(<App />)
    expect(wheel(10, enter())).toBe(false)
    vi.setSystemTime(T0 + 2000)
    wheel(200, header())
    expect(onScreen()).toBe('feature')
  })
})

describe('Keys between the screens', () => {
  it.each(['ArrowDown', 'PageDown', ' '])('%j on the intro goes to 신간 소개 and focuses its title', (key) => {
    render(<App />)
    fireEvent.keyDown(document.body, { key })
    expect(onScreen()).toBe('feature')
    expectHidden(introScreen(), true)
    expectHidden(featureScreen(), false)
    expectHidden(shelfScreen(), true)
    expect(featureTitle()).toHaveFocus()
    expect(currentNo()).toBe(1)
  })

  it.each(['ArrowDown', 'PageDown'])('%s on 신간 소개 goes to the shelf at the book that was left and focuses it', (key) => {
    render(<App initial={{ screen: 'feature', index: 4 }} />)
    fireEvent.keyDown(window, { key })
    expect(onScreen()).toBe('shelf')
    expectHidden(featureScreen(), true)
    expect(currentNo()).toBe(5)
    expect(bookButton(5)).toHaveFocus()
  })

  it.each(['ArrowUp', 'PageUp'])('%s on 신간 소개 goes back to the intro and focuses [ 서가 보기 ]', (key) => {
    render(<App initial={{ screen: 'feature', index: 4 }} />)
    fireEvent.keyDown(window, { key })
    expect(onScreen()).toBe('intro')
    expect(enter()).toHaveFocus()
  })

  it('Space on 신간 소개 does not change the screen (the video controls use it)', () => {
    render(<App initial={{ screen: 'feature', index: 0 }} />)
    fireEvent.keyDown(document.body, { key: ' ' })
    expect(onScreen()).toBe('feature')
  })

  it('keys pressed on the video are left to its controls', () => {
    render(<App initial={{ screen: 'feature', index: 0 }} />)
    const video = featureScreen().querySelector('video')!
    expect(fireEvent.keyDown(video, { key: 'ArrowDown' })).toBe(true)
    expect(fireEvent.keyDown(video, { key: 'ArrowUp' })).toBe(true)
    expect(onScreen()).toBe('feature')
  })

  it('Space on a focused control is left to that control', () => {
    render(<App />)
    const logo = within(header()).getByRole('link', { name: '서가명강' })
    logo.focus()
    fireEvent.keyDown(logo, { key: ' ' })
    expect(onScreen()).toBe('intro')
  })

  it.each(['ArrowUp', 'PageUp'])('%s on the shelf goes to 신간 소개 from any book and focuses its title', (key) => {
    render(<App initial={{ screen: 'shelf', index: 5 }} />)
    fireEvent.keyDown(window, { key })
    expect(onScreen()).toBe('feature')
    expect(featureTitle()).toHaveFocus()
    expect(currentNo()).toBe(6)
  })

  it.each(['ArrowDown', 'PageDown'])('%s on the shelf goes to the fields screen and focuses the current field of the dial', (key) => {
    render(<App initial={{ screen: 'shelf', index: 5 }} />)
    fireEvent.keyDown(window, { key })
    expect(onScreen()).toBe('fields')
    expectHidden(introScreen(), true)
    expectHidden(shelfScreen(), true)
    expectHidden(fieldsScreen(), false)
    expect(dialCurrent()).toHaveFocus()
    expect(dialCurrent()).toHaveAccessibleName('철학, 5권')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/^학제별 분류$/)
    expect(currentNo()).toBe(6)
  })

  it.each(['ArrowUp', 'PageUp'])('%s on the fields screen goes to the shelf and focuses the centre book', (key) => {
    render(<App initial={{ screen: 'fields', index: 5 }} />)
    fireEvent.keyDown(window, { key })
    expect(onScreen()).toBe('shelf')
    expect(bookButton(6)).toHaveFocus()
  })

  it('nothing lies below the fields screen: down, left/right, Home/End and Esc never leave it or move the shelf', () => {
    render(<App initial={{ screen: 'fields', index: 5 }} />)
    for (const key of ['ArrowDown', 'PageDown', 'ArrowLeft', 'ArrowRight', 'End', 'ArrowDown', 'Escape']) {
      fireEvent.keyDown(window, { key })
    }
    expect(onScreen()).toBe('fields')
    expect(currentNo()).toBe(6)
  })

  it('ArrowLeft at book 1 stays on the shelf', () => {
    render(<App initial={{ screen: 'shelf', index: 0 }} />)
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(onScreen()).toBe('shelf')
    expect(currentNo()).toBe(1)
  })

  it('a held key (auto-repeat) changes the screen once: it does not run on through the next screen', () => {
    useClock()
    render(<App />)
    fireEvent.keyDown(document.body, { key: 'ArrowDown' })
    fireEvent.keyDown(document.body, { key: 'ArrowDown', repeat: true })
    vi.setSystemTime(T0 + 300)
    fireEvent.keyDown(document.body, { key: 'ArrowDown', repeat: true })
    vi.setSystemTime(T0 + 800)
    fireEvent.keyDown(document.body, { key: 'ArrowDown', repeat: true })
    vi.setSystemTime(T0 + 3000)
    fireEvent.keyDown(document.body, { key: 'ArrowDown', repeat: true })
    expect(onScreen()).toBe('feature')
    expect(currentNo()).toBe(1)
    expect(document.querySelector('.stage')).not.toHaveAttribute('data-gliding')
    // 새로 누르면 넘어간다
    fireEvent.keyDown(document.body, { key: 'ArrowDown' })
    expect(onScreen()).toBe('shelf')
  })

  it('arrows on the intro do not move the hidden shelf', () => {
    render(<App />)
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    fireEvent.keyDown(window, { key: 'End' })
    expect(onScreen()).toBe('intro')
    expect(currentNo()).toBe(1)
  })
})

describe('Fields screen (학제별 분류)', () => {
  it('is a region named by its heading, with the field dial and the books. There is no [ 서가로 ] button', () => {
    render(<App initial={{ screen: 'fields', index: 0 }} />)
    const region = screen.getByRole('region', { name: '학제별 분류' })
    expect(fieldsScreen()).toContainElement(region)
    expect(within(region).getByRole('heading', { level: 1 })).toHaveTextContent(/^학제별 분류$/)
    // 내용(글자 다이얼과 책)은 tests/Fields.test.tsx가 본다
    expect(region.querySelector('.fields__content')).not.toBeEmptyDOMElement()
    expect(within(region).queryByRole('button', { name: '서가로' })).toBeNull()
    // 화면마다 제목은 하나만 읽힌다
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('the shelf has no [ 학제별 분류 ] button: ↓ goes there and focuses the current field of the dial', () => {
    render(<App initial={{ screen: 'shelf', index: 8 }} />)
    expect(screen.queryByRole('button', { name: '학제별 분류' })).toBeNull()
    toFields()
    expect(onScreen()).toBe('fields')
    expect(dialCurrent()).toHaveFocus()
  })

  it('↑ at the first field comes back to the shelf at the same book and focuses it', () => {
    useClock()
    render(<App initial={{ screen: 'shelf', index: 8 }} />)
    toFields()
    vi.setSystemTime(T0 + 2000)
    fireEvent.keyDown(window, { key: 'ArrowUp' })
    expect(onScreen()).toBe('shelf')
    expect(currentNo()).toBe(9)
    expect(bookButton(9)).toHaveFocus()
  })

  it('the wheel outside the dial comes back to the shelf at the same book', () => {
    useClock()
    render(<App initial={{ screen: 'fields', index: 8, field: 4 }} />)
    wheelUpOutsideDial()
    expect(onScreen()).toBe('shelf')
    expect(currentNo()).toBe(9)
  })

  it('locks the wheel after a key changed the screen', async () => {
    useClock()
    render(<App initial={{ screen: 'shelf', index: 8 }} />)
    toFields()
    wheel(-200)
    vi.setSystemTime(T0 + 500)
    wheel(-200)
    expect(onScreen()).toBe('fields')
    vi.setSystemTime(T0 + 900)
    wheel(-200)
    expect(onScreen()).toBe('shelf')
  })
})

describe('Logo and dialogs', () => {
  it('the logo goes to the intro without leaving the page', () => {
    render(<App initial={{ screen: 'shelf', index: 11 }} />)
    const logo = within(header()).getByRole('link', { name: '서가명강' })
    expect(fireEvent.click(logo)).toBe(false) // 기본 이동(새로 고침)을 막는다
    expect(onScreen()).toBe('intro')
    // 새 탭으로 열기 같은 조합 클릭은 브라우저에 맡긴다
    expect(fireEvent.click(logo, { metaKey: true })).toBe(true)
  })

  it('the logo moves focus to [ 서가 보기 ]: on the intro the header logo is put away, so focus must not stay on it', async () => {
    render(<App initial={{ screen: 'shelf', index: 11 }} />)
    const logo = within(header()).getByRole('link', { name: '서가명강' })
    logo.focus()
    await userEvent.keyboard('{Enter}')
    expect(onScreen()).toBe('intro')
    expect(enter()).toHaveFocus()
  })

  it('after the logo, going down again shows the book that was left (no reset to book 1)', async () => {
    render(<App initial={{ screen: 'shelf', index: 11 }} />)
    fireEvent.click(within(header()).getByRole('link', { name: '서가명강' }))
    await userEvent.click(enter())
    expect(currentNo()).toBe(12)
    expect(bookButton(12)).toHaveFocus()
  })

  it('the logo goes to the intro from the fields screen too', () => {
    render(<App initial={{ screen: 'fields', index: 11 }} />)
    fireEvent.click(within(header()).getByRole('link', { name: '서가명강' }))
    expect(onScreen()).toBe('intro')
  })

  it('no screen change while the detail dialog is open', async () => {
    useClock()
    render(<App initial={{ screen: 'shelf', index: 0 }} />)
    fireEvent.click(bookButton(1))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('open')
    expect(wheel(-200, dialog)).toBe(true) // 창 안의 스크롤은 그대로 둔다
    fireEvent.keyDown(dialog, { key: 'ArrowUp' })
    fireEvent.keyDown(window, { key: 'PageUp' })
    fireEvent.pointerDown(dialog, { clientX: 300, clientY: 300, button: 0, pointerId: 1 })
    fireEvent.pointerMove(dialog, { clientX: 300, clientY: 500, pointerId: 1 })
    fireEvent.pointerUp(dialog, { clientX: 300, clientY: 500, pointerId: 1 })
    expect(onScreen()).toBe('shelf')
  })
})

describe('Vertical swipe', () => {
  const swipe = (target: Element, from: [number, number], to: [number, number]) => {
    fireEvent.pointerDown(target, { clientX: from[0], clientY: from[1], button: 0, pointerId: 1 })
    fireEvent.pointerMove(target, { clientX: to[0], clientY: to[1], pointerId: 1 })
    fireEvent.pointerUp(target, { clientX: to[0], clientY: to[1], pointerId: 1 })
  }

  it('up on the intro goes to 신간 소개; down does nothing', () => {
    render(<App />)
    swipe(introScreen().querySelector('.intro')!, [300, 400], [305, 500])
    expect(onScreen()).toBe('intro')
    swipe(introScreen().querySelector('.intro')!, [300, 500], [310, 420])
    expect(onScreen()).toBe('feature')
    expect(currentNo()).toBe(1)
  })

  it('on 신간 소개: up goes to the shelf and down to the intro. A drag on the video is left to its controls', () => {
    const { unmount } = render(<App initial={{ screen: 'feature', index: 7 }} />)
    const area = () => featureScreen().querySelector('.feature')!
    swipe(featureScreen().querySelector('video')!, [300, 500], [310, 420])
    expect(onScreen()).toBe('feature')
    swipe(area(), [300, 500], [310, 420])
    expect(onScreen()).toBe('shelf')
    expect(currentNo()).toBe(8)
    unmount()
    render(<App initial={{ screen: 'feature', index: 7 }} />)
    swipe(area(), [300, 420], [310, 500])
    expect(onScreen()).toBe('intro')
  })

  it('on the shelf: down goes to 신간 소개 and up to the fields screen, from any book', () => {
    const { unmount } = render(<App initial={{ screen: 'shelf', index: 20 }} />)
    swipe(shelf(), [300, 300], [310, 380])
    expect(onScreen()).toBe('feature')
    unmount()
    render(<App initial={{ screen: 'shelf', index: 20 }} />)
    swipe(shelf(), [300, 380], [310, 300])
    expect(onScreen()).toBe('fields')
    expect(currentNo()).toBe(21)
  })

  it('down on the fields screen (at the first field) goes to the shelf', () => {
    render(<App initial={{ screen: 'fields', index: 20 }} />)
    const area = fieldsScreen().querySelector('.fields')!
    swipe(area, [300, 300], [310, 380])
    expect(onScreen()).toBe('shelf')
    expect(currentNo()).toBe(21)
  })

  it('a mostly vertical drag on the shelf does not step books; a horizontal one still does', () => {
    render(<App initial={{ screen: 'shelf', index: 20 }} />)
    swipe(shelf(), [500, 300], [480, 320]) // 문턱(48px) 아래: 아무 일도 없다
    expect(currentNo()).toBe(21)
    expect(onScreen()).toBe('shelf')
    swipe(shelf(), [500, 300], [420, 320])
    expect(currentNo()).toBe(22)
    expect(onScreen()).toBe('shelf')
  })
})

describe('Current book for screen readers', () => {
  it('announces book changes only on the shelf screen', () => {
    render(<App initial={{ screen: 'shelf', index: 11 }} />)
    const status = () => shelfScreen().querySelector('[role="status"]')!
    fireEvent.click(within(header()).getByRole('link', { name: '서가명강' }))
    // 웰컴 → 신간 소개 → 서가
    fireEvent.keyDown(document.body, { key: 'ArrowDown' })
    fireEvent.keyDown(document.body, { key: 'ArrowDown' })
    expect(onScreen()).toBe('shelf')
    // 화면이 바뀌며 포커스가 가운데 책(보던 12권)으로 갔으니 따로 알리지 않는다
    expect(status()).toBeEmptyDOMElement()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(`12권 ${books[11].title}`)
  })
})

describe('The WebGL shelf under the intro (비치는 서가)', () => {
  const setup = async (initial?: Parameters<typeof App>[0]['initial']) => {
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
    render(<App renderer="webgl" createScene={create} initial={initial} />)
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
    const actives = () => scene.setActive.mock.calls.map(([on]) => on)
    return { scene, actives }
  }

  it('is drawn on the intro too, and going down does not restart it (the books that peeked are the shelf)', async () => {
    const { actives } = await setup()
    expect(onScreen()).toBe('intro')
    expect(actives().at(-1)).toBe(true)
    // 신간 소개에서도 책 머리가 그대로 비친다
    fireEvent.keyDown(document.body, { key: 'ArrowDown' })
    expect(onScreen()).toBe('feature')
    expect(actives().at(-1)).toBe(true)
    fireEvent.keyDown(document.body, { key: 'ArrowDown' })
    expect(onScreen()).toBe('shelf')
    // 꺼졌다 켜지면 책이 아래에서 다시 올라온다(`setActive(true)`의 등장): 한 번도 꺼지지 않는다
    expect(actives()).not.toContain(false)
    fireEvent.keyDown(window, { key: 'ArrowUp' })
    expect(onScreen()).toBe('feature')
    fireEvent.keyDown(window, { key: 'ArrowUp' })
    expect(onScreen()).toBe('intro')
    expect(actives()).not.toContain(false)
  })

  it('rests on the fields screen and is drawn again when the logo brings the intro back', async () => {
    const { actives } = await setup({ screen: 'fields', index: 3 })
    expect(actives().at(-1)).toBe(false)
    fireEvent.click(within(header()).getByRole('link', { name: '서가명강' }))
    expect(onScreen()).toBe('intro')
    expect(actives().at(-1)).toBe(true)
  })

  it('the shelf stays out of reach on the intro and on 신간 소개: inert and hidden from reading', async () => {
    await setup()
    expectHidden(shelfScreen(), true)
    fireEvent.keyDown(document.body, { key: 'ArrowDown' })
    expect(onScreen()).toBe('feature')
    expectHidden(shelfScreen(), true)
  })

  it('tells CSS that 신간 소개 sits in the welcome place (the shelf keeps peeking) and which screen it came from', async () => {
    await setup()
    const screens = () => document.querySelector<HTMLElement>('.screens')!
    expect(screens()).toHaveAttribute('data-place', 'welcome')
    expect(screens()).not.toHaveAttribute('data-from')
    fireEvent.keyDown(document.body, { key: 'ArrowDown' })
    expect(onScreen()).toBe('feature')
    expect(screens()).toHaveAttribute('data-place', 'welcome')
    expect(screens()).toHaveAttribute('data-from', 'intro')
    fireEvent.keyDown(document.body, { key: 'ArrowDown' })
    expect(onScreen()).toBe('shelf')
    expect(screens()).not.toHaveAttribute('data-place')
    expect(screens()).toHaveAttribute('data-from', 'feature')
    fireEvent.keyDown(window, { key: 'ArrowUp' })
    expect(screens()).toHaveAttribute('data-place', 'welcome')
    expect(screens()).toHaveAttribute('data-from', 'shelf')
  })
})

describe('신간 소개(feature): 웰컴과 서가 사이', () => {
  const step = () => featureScreen().querySelector<HTMLElement>('.feature')!.dataset.step
  const section = () => featureScreen().querySelector<HTMLElement>('.feature')!
  const schedule = featureSchedule()
  const at = (name: string) => schedule.find((s) => s.step === name)!.at

  it('is a region named 신간 소개 on its own screen, laid over the welcome place', () => {
    render(<App initial={{ screen: 'feature', index: 0 }} />)
    expect(onScreen()).toBe('feature')
    const region = screen.getByRole('region', { name: '신간 소개' })
    expect(featureScreen()).toContainElement(region)
    expect(featureScreen()).toHaveClass('screen', 'screen--feature')
    // 화면마다 제목은 하나만 읽힌다: 도서명
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('AI는 어떻게 생각하는가')
    expectHidden(introScreen(), true)
    expectHidden(shelfScreen(), true)
  })

  it('coming down from the intro, the animation runs by itself from the start, step by step', () => {
    vi.useFakeTimers()
    render(<App />)
    const pass = (ms: number) => act(() => void vi.advanceTimersByTime(ms))
    expect(step()).toBe('idle')
    fireEvent.keyDown(document.body, { key: 'ArrowDown' })
    expect(onScreen()).toBe('feature')
    expect(step()).toBe('idle')
    expect(section()).not.toHaveAttribute('data-instant')
    pass(at('bubbles') - 1)
    expect(step()).toBe('idle')
    pass(1)
    expect(step()).toBe('bubbles')
    pass(at('claim') - at('bubbles'))
    expect(step()).toBe('claim')
    pass(at('mockup') - at('claim'))
    expect(step()).toBe('mockup')
    pass(at('info') - at('mockup'))
    expect(step()).toBe('info')
    pass(at('pitch') - at('info'))
    expect(step()).toBe('pitch')
    pass(at('note') - at('pitch'))
    expect(step()).toBe('note')
    // 영상은 영상 자리가 나타날 때 처음 만든다
    expect(featureScreen().querySelector('video')).toBeNull()
    pass(at('video') - at('note'))
    expect(step()).toBe('video')
    expect(featureScreen().querySelector('video')).not.toBeNull()
    // 더 넘어갈 단계가 없다. 휠로 단계를 넘기지도 않는다
    pass(20_000)
    expect(step()).toBe('video')
  })

  it('coming up from the shelf, it is laid out in its last state at once (no replay)', () => {
    vi.useFakeTimers()
    render(<App initial={{ screen: 'shelf', index: 3 }} />)
    expect(step()).toBe('idle')
    expect(featureScreen().querySelector('video')).toBeNull()
    fireEvent.keyDown(window, { key: 'ArrowUp' })
    expect(onScreen()).toBe('feature')
    expect(step()).toBe('video')
    expect(section()).toHaveAttribute('data-instant')
    expect(featureScreen().querySelector('video')).not.toBeNull()
    act(() => void vi.advanceTimersByTime(20_000))
    expect(step()).toBe('video')
  })

  it('going down mid-animation and coming back up shows the last state; going up to the intro resets it', () => {
    vi.useFakeTimers()
    render(<App />)
    const pass = (ms: number) => act(() => void vi.advanceTimersByTime(ms))
    fireEvent.keyDown(document.body, { key: 'ArrowDown' })
    pass(at('claim'))
    expect(step()).toBe('claim')
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    expect(onScreen()).toBe('shelf')
    // 화면과 함께 밀려 나가는 동안에는 보이던 모습 그대로 멈춘다
    pass(5000)
    expect(step()).toBe('claim')
    fireEvent.keyDown(window, { key: 'ArrowUp' })
    expect(step()).toBe('video')
    expect(section()).toHaveAttribute('data-instant')
    pass(1000)
    fireEvent.keyDown(window, { key: 'ArrowUp' })
    expect(onScreen()).toBe('intro')
    expect(step()).toBe('idle')
    expect(section()).not.toHaveAttribute('data-instant')
    // 다시 내려오면 처음부터 돈다
    pass(1000)
    fireEvent.keyDown(document.body, { key: 'ArrowDown' })
    expect(step()).toBe('idle')
    pass(at('bubbles'))
    expect(step()).toBe('bubbles')
  })

  it('the peeking shelf under 신간 소개 goes to the shelf when pressed (no focus move)', () => {
    render(<App initial={{ screen: 'feature', index: 2 }} />)
    fireEvent.click(featureScreen().querySelector('.feature__peek')!)
    expect(onScreen()).toBe('shelf')
    expect(currentNo()).toBe(3)
    expect(bookButton(3)).not.toHaveFocus()
  })

  it('the logo goes to the intro from 신간 소개 too', () => {
    render(<App initial={{ screen: 'feature', index: 2 }} />)
    fireEvent.click(within(header()).getByRole('link', { name: '서가명강' }))
    expect(onScreen()).toBe('intro')
    expect(enter()).toHaveFocus()
  })

  it('the video stops when 신간 소개 is left, for the shelf or for the intro', () => {
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause')
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play')
    render(<App initial={{ screen: 'feature', index: 0 }} />)
    expect(play).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    expect(onScreen()).toBe('shelf')
    expect(pause).toHaveBeenCalled()
    fireEvent.keyDown(window, { key: 'ArrowUp' })
    expect(play).toHaveBeenCalledTimes(2)
    pause.mockClear()
    fireEvent.keyDown(window, { key: 'ArrowUp' })
    expect(onScreen()).toBe('intro')
    expect(pause).toHaveBeenCalled()
    vi.restoreAllMocks()
  })

  it('a book page address starts on the shelf screen and does not run 신간 소개', () => {
    window.history.replaceState(null, '', '#/book/5')
    render(<App />)
    expect(onScreen()).toBe('shelf')
    expect(step()).toBe('idle')
    window.history.replaceState(null, '', window.location.pathname)
  })
})

describe('웰컴의 책 줄(전부 책등) ↔ 서가: 밀리며 펼침 · 꽂힘', () => {
  // 책 페이지를 연 테스트가 주소(#/book/N)를 남기지 않게 한다
  afterEach(() => window.history.replaceState(null, '', window.location.pathname))

  const setup = async (initial?: Parameters<typeof App>[0]['initial']) => {
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
    render(<App renderer="webgl" createScene={create} initial={initial} />)
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
    vi.useFakeTimers()
    const last = () => scene.setState.mock.calls.at(-1)![0]
    const pass = (ms: number) => act(() => void vi.advanceTimersByTime(ms))
    const delay = () => document.querySelector<HTMLElement>('.app')!.style.getPropertyValue('--screen-delay')
    return { scene, last, pass, delay }
  }

  it('웰컴에서는 장면이 줄을 선 모습(lineup)을 받는다: 펼쳐진 책이 없다', async () => {
    const { last } = await setup()
    expect(last()).toMatchObject({ index: 0, closed: true, lineup: true })
    expect(shelf().querySelectorAll('[data-testid="book"][data-current="true"]')).toHaveLength(0)
    // 현재 책(1권)은 그대로다
    expect(currentNo()).toBe(1)
  })

  it('신간 소개에서도 줄은 그대로다: 웰컴에서 내려와도 장면에 새로 넘기는 것이 없다(책이 움직이지 않는다)', async () => {
    const { scene, last, pass, delay } = await setup()
    const calls = scene.setState.mock.calls.length
    fireEvent.keyDown(document.body, { key: 'ArrowDown' })
    expect(onScreen()).toBe('feature')
    pass(2000)
    expect(scene.setState.mock.calls.length).toBe(calls)
    expect(last()).toMatchObject({ index: 0, closed: true, lineup: true })
    expect(delay()).toBe('0ms')
    expect(shelf().querySelectorAll('[data-testid="book"][data-current="true"]')).toHaveLength(0)
  })

  it('웰컴의 [ 서가 보기 ]로 서가에 바로 가도 줄이 밀리며 펼쳐진다', async () => {
    const { last, pass } = await setup()
    fireEvent.click(enter())
    expect(onScreen()).toBe('shelf')
    expect(last()).toEqual({ index: 0, closed: true, moveMs: 700 })
    pass(420)
    expect(last()).toEqual({ index: 0, closed: false, moveMs: 720 })
  })

  it('신간 소개에서 내려가면: 책등인 채 줄이 밀리고(700ms), 거의 자리를 잡을 무렵(420ms) 가운데 책이 펼쳐진다(720ms). 다 놓이면 평소 속도', async () => {
    const { last, pass, delay } = await setup({ screen: 'feature', index: 0 })
    fireEvent.keyDown(document.body, { key: 'ArrowDown' })
    expect(onScreen()).toBe('shelf')
    expect(last()).toEqual({ index: 0, closed: true, moveMs: 700 })
    expect(delay()).toBe('0ms')
    pass(419)
    expect(last()).toEqual({ index: 0, closed: true, moveMs: 700 })
    pass(1)
    expect(last()).toEqual({ index: 0, closed: false, moveMs: 720 })
    expect(shelf().querySelectorAll('[data-testid="book"][data-current="true"]')).toHaveLength(1)
    pass(1100)
    expect(last()).toEqual({ index: 0, closed: false, moveMs: 680 })
  })

  it('서가에서 신간 소개로 올라가면: 가운데 책이 먼저 책등으로 꽂히고(520ms), 160ms 뒤 줄이 1권 자리로 밀려 간다. 화면은 160ms 늦게 움직인다', async () => {
    const { last, pass, delay } = await setup({ screen: 'shelf', index: 11 })
    expect(last()).toEqual({ index: 11, closed: false, moveMs: 680 })
    fireEvent.keyDown(window, { key: 'ArrowUp' })
    expect(onScreen()).toBe('feature')
    expect(last()).toEqual({ index: 11, closed: true, moveMs: 520 })
    expect(delay()).toBe('160ms')
    pass(160)
    expect(last()).toEqual({ index: 11, closed: true, moveMs: 600, lineup: true })
    // 다시 내려오면 보던 책(12권)이 가운데로 와 펼쳐진다
    pass(1000)
    fireEvent.keyDown(document.body, { key: 'ArrowDown' })
    expect(last()).toEqual({ index: 11, closed: true, moveMs: 700 })
    expect(delay()).toBe('0ms')
    pass(420)
    expect(last()).toEqual({ index: 11, closed: false, moveMs: 720 })
    expect(currentNo()).toBe(12)
  })

  it('내려와 펼쳐지는 중에 →를 누르고 있으면 평소처럼 지나간다: 단계의 시간(720ms)이 지나가는 박자(200ms)를 덮지 않는다', async () => {
    const { last, pass } = await setup({ screen: 'feature', index: 0 })
    const stage = () => document.querySelector<HTMLElement>('.stage')!
    fireEvent.keyDown(document.body, { key: 'ArrowDown' })
    pass(900)
    expect(last()).toEqual({ index: 0, closed: false, moveMs: 720 })
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    // 한 번 넘긴 것만으로 평소의 한 걸음이다
    expect(last()).toEqual({ index: 1, closed: false, moveMs: 680 })
    pass(100)
    fireEvent.keyDown(window, { key: 'ArrowRight', repeat: true })
    expect(stage()).toHaveAttribute('data-gliding')
    expect(last()).toEqual({ index: 2, closed: true, moveMs: 200 })
    expect(stage().style.getPropertyValue('--dur-shelf')).toBe('200ms')
    pass(100)
    fireEvent.keyDown(window, { key: 'ArrowRight', repeat: true })
    expect(last()).toEqual({ index: 3, closed: true, moveMs: 200 })
    // 손을 떼면 멈춘 책이 평소대로 천천히 펼쳐지고(900ms), 그 뒤 평소 속도로 돌아간다
    fireEvent.keyUp(window, { key: 'ArrowRight' })
    expect(last()).toEqual({ index: 3, closed: false, moveMs: 900 })
    pass(1400)
    expect(last()).toEqual({ index: 3, closed: false, moveMs: 680 })
    expect(stage().style.getPropertyValue('--dur-shelf')).toBe('')
  })

  it('밀리는 중에 →를 한 번 누르면 새 책 기준으로 계속 밀린 뒤 그 책이 펼쳐진다(누르고 있는 키는 화면 전환 동안 듣지 않는다)', async () => {
    const { last, pass } = await setup({ screen: 'feature', index: 0 })
    fireEvent.keyDown(document.body, { key: 'ArrowDown' })
    pass(100)
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(last()).toEqual({ index: 1, closed: true, moveMs: 700 })
    pass(100)
    // 화면이 바뀌는 700ms 동안의 자동 반복은 기존 규칙대로 버린다: 지나가기가 시작되지 않는다
    fireEvent.keyDown(window, { key: 'ArrowRight', repeat: true })
    expect(last()).toEqual({ index: 1, closed: true, moveMs: 700 })
    fireEvent.keyUp(window, { key: 'ArrowRight' })
    // 펼쳐지는 때는 그대로다: 내려오기 시작하고 420ms 뒤(책을 바꿨다고 다시 기다리지 않는다)
    pass(219)
    expect(last()).toEqual({ index: 1, closed: true, moveMs: 700 })
    pass(1)
    expect(last()).toEqual({ index: 1, closed: false, moveMs: 720 })
    pass(1100)
    expect(last()).toEqual({ index: 1, closed: false, moveMs: 680 })
  })

  it('학제별 분류에서 로고로 웰컴에 오면 바로 줄을 선 모습이다(꽂히는 단계·늦춤 없음)', async () => {
    const { last, delay } = await setup({ screen: 'fields', index: 3 })
    fireEvent.click(within(header()).getByRole('link', { name: '서가명강' }))
    expect(onScreen()).toBe('intro')
    expect(last()).toMatchObject({ index: 3, closed: true, lineup: true })
    expect(delay()).toBe('0ms')
  })

  it('책 페이지에서 로고로 웰컴에 와도 같다', async () => {
    const { last, delay } = await setup({ screen: 'shelf', index: 3, view: 'book' })
    fireEvent.click(within(header()).getByRole('link', { name: '서가명강' }))
    expect(onScreen()).toBe('intro')
    expect(last()).toMatchObject({ index: 3, closed: true, lineup: true })
    expect(delay()).toBe('0ms')
  })

  it('CSS 서가도 같다: 신간 소개(웰컴 자리)에서는 펼쳐진 책이 없고 1권 책등이 왼쪽 여백에서 시작한다. 내려가면 밀린 뒤 펼쳐진다', () => {
    vi.useFakeTimers()
    render(<App renderer="css" initial={{ screen: 'feature', index: 0 }} />)
    const li = (no: number) => shelf().querySelector<HTMLElement>(`[data-testid="book"][data-no="${no}"]`)!
    const x = (no: number) => parseFloat(li(no).style.getPropertyValue('--x'))
    const spineW = (no: number) => parseFloat(li(no).style.getPropertyValue('--spine-w'))
    expect(shelf().querySelectorAll('[data-testid="book"][data-current="true"]')).toHaveLength(0)
    // jsdom의 창 폭 1024: 왼쪽 여백 20px
    expect(x(1) - spineW(1) / 2).toBeCloseTo(-1024 / 2 + 20, 1)
    expect(x(2)).toBeGreaterThan(x(1))
    // 웰컴에서도 책이 움직이는 전환이 꺼져 있지 않다(올라올 때 꽂히고 밀리는 것이 보여야 한다)
    expect(shelfScreen()).not.toHaveAttribute('data-still')
    fireEvent.keyDown(document.body, { key: 'ArrowDown' })
    expect(shelf().querySelectorAll('[data-testid="book"][data-current="true"]')).toHaveLength(0)
    // 가운데에 올 책(1권)의 책등이 가운데로
    expect(x(1)).toBeCloseTo(0)
    act(() => void vi.advanceTimersByTime(420))
    expect(li(1)).toHaveAttribute('data-current', 'true')
    fireEvent.keyDown(window, { key: 'ArrowUp' })
    expect(li(1)).toHaveAttribute('data-current', 'false')
    expect(x(1)).toBeCloseTo(0)
    act(() => void vi.advanceTimersByTime(160))
    expect(x(1) - spineW(1) / 2).toBeCloseTo(-1024 / 2 + 20, 1)
  })
})
