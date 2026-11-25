import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../src/App'
import { BracketButton, BracketLink } from '../src/chrome/BracketButton'
import { books } from '../src/data/books'
import { BookDetail } from '../src/detail/BookDetail'
import { INTRO_DOTS } from '../src/intro/entrance'
import { Shelf } from '../src/shelf/Shelf'
import { cancelAllCues, setSoundEngine, type SoundEngine } from '../src/sound/play'

/** 가짜 엔진: 불린 이름을 적어 둔다(소리는 이미 열려 있다) */
function listen() {
  const played: string[] = []
  const engine: SoundEngine = { unlocked: true, play: (name) => void played.push(name) }
  setSoundEngine(engine)
  return played
}

// App을 처음 그리는 비용(모듈 준비)이 첫 테스트의 제한 시간에 들지 않게 미리 한 번 그려 둔다
beforeAll(() => {
  render(<App renderer="css" initial={{ screen: 'shelf', index: 0 }} />).unmount()
}, 60_000)

describe('소리의 연결', { timeout: 20_000 }, () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000_000)
  })
  afterEach(() => {
    cancelAllCues()
    setSoundEngine(null)
    vi.useRealTimers()
  })

  it('서가에서 →를 누르면 "톡"(`spineRub`)이 나고, 책이 놓이는 때에 "툭" 한다(CSS 서가)', () => {
    const played = listen()
    render(<App renderer="css" initial={{ screen: 'shelf', index: 0 }} />)
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(played).toEqual(['spineRub'])
    act(() => void vi.advanceTimersByTime(999))
    expect(played).toEqual(['spineRub'])
    act(() => void vi.advanceTimersByTime(1))
    expect(played).toEqual(['spineRub', 'bookLand'])
  })

  it('놓이기 전에 또 넘기면 앞의 "툭"은 거두고 새로 잰다', () => {
    const played = listen()
    render(<App renderer="css" initial={{ screen: 'shelf', index: 0 }} />)
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    act(() => void vi.advanceTimersByTime(600))
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    act(() => void vi.advanceTimersByTime(999))
    expect(played).toEqual(['spineRub', 'spineRub'])
    act(() => void vi.advanceTimersByTime(1))
    expect(played).toEqual(['spineRub', 'spineRub', 'bookLand'])
  })

  it('신간 소개에서 서가로 내려온 직후(900ms 뒤) →를 누르면 "툭"은 한 번만 난다', () => {
    const played = listen()
    render(<App renderer="css" initial={{ screen: 'feature', index: 0 }} />)
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    expect(played).toEqual(['rowSweep'])
    act(() => void vi.advanceTimersByTime(900))
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    act(() => void vi.advanceTimersByTime(5000))
    expect(played).toEqual(['rowSweep', 'spineRub', 'bookLand'])
  })

  it('권수 다이얼로 책을 고르면 "톡"(`spineRub`) 대신 다이얼의 틱이 나고, 그 뒤 키보드로 넘기면 다시 "톡"(`spineRub`)이다', () => {
    const played = listen()
    render(<App renderer="css" initial={{ screen: 'shelf', index: 0 }} />)
    const dial = screen.getByRole('navigation', { name: '권 이동' })
    fireEvent.click(dial.querySelectorAll('button')[4]!)
    expect(played).toEqual(['dialTick'])
    act(() => void vi.advanceTimersByTime(1000))
    expect(played).toEqual(['dialTick', 'bookLand'])
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(played).toEqual(['dialTick', 'bookLand', 'spineRub'])
  })

  it('CSS 서가의 책등 호버: 마우스처럼 올려 둘 수 있는 포인터에서만 "톡"(`spinePull`)이 난다(터치에서는 나지 않는다)', () => {
    const ROW = 630
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1440)
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(820)
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(ROW)
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, right: 1440, bottom: ROW, width: 1440, height: ROW, x: 0, y: 0, toJSON: () => ({}),
    })
    const win = window as unknown as { matchMedia?: (query: string) => { matches: boolean } }
    const had = win.matchMedia
    try {
      const played = listen()
      render(<Shelf books={books} initialIndex={20} onOpenCurrent={() => {}} />)
      const shelf = screen.getByRole('region', { name: '서가명강 서가' })
      const hit = shelf.querySelector<HTMLElement>('.shelf__hit')!
      const midY = ROW / 2 - parseFloat(shelf.style.getPropertyValue('--lift'))
      const xOf = (no: number) => 720 + parseFloat(shelf.querySelector<HTMLElement>(`[data-no="${no}"]`)!.style.getPropertyValue('--x'))
      const hovered = () => Array.from(shelf.querySelectorAll<HTMLElement>('[data-hover]'), (el) => Number(el.dataset.no))

      // 터치 기기: 호버 표시(기존 동작)는 그대로이고 소리만 없다
      win.matchMedia = () => ({ matches: false })
      fireEvent.mouseMove(hit, { clientX: xOf(23), clientY: midY })
      expect(hovered()).toEqual([23])
      expect(played).toEqual([])

      // 마우스: 다른 책등으로 옮겨 가면 난다
      win.matchMedia = () => ({ matches: true })
      act(() => void vi.advanceTimersByTime(1000))
      fireEvent.mouseMove(hit, { clientX: xOf(17), clientY: midY })
      expect(hovered()).toEqual([17])
      expect(played).toEqual(['spinePull'])
    } finally {
      win.matchMedia = had
      vi.restoreAllMocks()
    }
  })

  it('1권에서 ←처럼 책이 바뀌지 않는 입력에는 소리가 없다', () => {
    const played = listen()
    render(<App renderer="css" initial={{ screen: 'shelf', index: 0 }} />)
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    act(() => void vi.advanceTimersByTime(3000))
    expect(played).toEqual([])
  })

  it('학제별 분류에서 글자 다이얼이 한 칸 돌면 "틱"(`dialClack`) 한다(평면 표지에서도)', () => {
    const played = listen()
    render(<App renderer="css" initial={{ screen: 'fields', index: 0 }} />)
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    expect(played).toEqual(['dialClack'])
  })

  it('웰컴의 점 네 개가 찍힐 때 "틱"(`penDot`) 네 번(소리가 이미 열려 있을 때). 그 전에 웰컴을 떠나면 나지 않는다', () => {
    const played = listen()
    const first = render(<App renderer="css" />)
    act(() => void vi.advanceTimersByTime(INTRO_DOTS.atMs + INTRO_DOTS.gapMs * 3 + INTRO_DOTS.fallMs))
    expect(played).toEqual(['penDot', 'penDot', 'penDot', 'penDot'])
    first.unmount()

    played.length = 0
    render(<App renderer="css" />)
    act(() => void vi.advanceTimersByTime(INTRO_DOTS.atMs))
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    act(() => void vi.advanceTimersByTime(INTRO_DOTS.gapMs * 3 + INTRO_DOTS.fallMs))
    expect(played.filter((name) => name === 'penDot')).toEqual([])
  })

  it('화면이 사라지면(언마운트) 예약한 소리를 거둔다', () => {
    const played = listen()
    const view = render(<App renderer="css" initial={{ screen: 'shelf', index: 0 }} />)
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    view.unmount()
    act(() => void vi.advanceTimersByTime(5000))
    expect(played).toEqual(['spineRub'])
  })

  it('`[ ]` 버튼과 링크를 누르면 작은 "틱", 쓰는 쪽의 onClick은 그대로 불린다', () => {
    const played = listen()
    const onClick = vi.fn()
    render(
      <>
        <BracketButton onClick={onClick}>닫기</BracketButton>
        <BracketLink href="#x">알라딘에서 보기</BracketLink>
        <BracketButton aria-disabled="true">다음</BracketButton>
      </>,
    )
    fireEvent.click(screen.getByRole('button', { name: '닫기' }))
    expect(onClick).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('link', { name: '알라딘에서 보기' }))
    expect(played).toEqual(['buttonTick', 'buttonTick'])
    // 더 갈 곳이 없어 막아 둔 버튼은 소리가 없다
    fireEvent.click(screen.getByRole('button', { name: '다음' }))
    expect(played).toEqual(['buttonTick', 'buttonTick'])
  })

  it('상세 창에서 앞표지 ↔ 뒤표지를 바꾸면 펼치는 소리(`coverFlip`)가 난다(같은 면을 다시 누르면 나지 않는다)', () => {
    const played = listen()
    render(<BookDetail open onClose={() => {}} books={books} currentIndex={0} onPrev={() => {}} onNext={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: '뒤표지' }))
    expect(played).toContain('coverFlip')
    played.length = 0
    fireEvent.click(screen.getByRole('button', { name: '뒤표지' }))
    expect(played).not.toContain('coverFlip')
  })
})
