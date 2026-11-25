import { describe, expect, it } from 'vitest'
import {
  FIELD_STEP_MS,
  INITIAL_SCREEN,
  SCREENS,
  SCREEN_TRANSITION_MS,
  WHEEL_SCREEN_LOCK_MS,
  fieldOf,
  screenReducer,
  type ScreenAction,
  type ScreenState,
} from '../src/app/screen'

const COUNT = 47
const intro = (index = 0): ScreenState => ({ screen: 'intro', index })
/** 신간 소개: 웰컴과 서가 사이 */
const feature = (index = 0): ScreenState => ({ screen: 'feature', index })
const shelf = (index: number): ScreenState => ({ screen: 'shelf', index })
/** 학제별 분류 화면. field는 가리키는 학문(0 = 철학이면 적지 않는다) */
const fields = (index = 0, field = 0): ScreenState => (field ? { screen: 'fields', index, field } : { screen: 'fields', index })
const LAST_FIELD = 10
const step = (state: ScreenState, action: ScreenAction) => screenReducer(state, action, COUNT)

describe('screen state', () => {
  it('opens on the intro, with book 1 waiting on the shelf', () => {
    expect(INITIAL_SCREEN).toEqual({ screen: 'intro', index: 0 })
  })

  it('has four screens top to bottom: intro, feature (신간 소개), shelf, fields', () => {
    expect(SCREENS).toEqual(['intro', 'feature', 'shelf', 'fields'])
  })

  it('locks the wheel for the screen transition plus a short rest', () => {
    expect(SCREEN_TRANSITION_MS).toBe(700)
    expect(WHEEL_SCREEN_LOCK_MS).toBe(SCREEN_TRANSITION_MS + 160)
  })
})

describe('wheel', () => {
  it('down on the intro goes to the feature screen (신간 소개), keeping the book that was left on the shelf', () => {
    expect(step(intro(), { type: 'wheel', direction: 'down' })).toEqual(feature(0))
    expect(step(intro(11), { type: 'wheel', direction: 'down' })).toEqual(feature(11))
  })

  it('down on the feature screen goes to the shelf at that book; up goes back to the intro', () => {
    expect(step(feature(), { type: 'wheel', direction: 'down' })).toEqual(shelf(0))
    expect(step(feature(11), { type: 'wheel', direction: 'down' })).toEqual(shelf(11))
    expect(step(feature(11), { type: 'wheel', direction: 'up' })).toEqual(intro(11))
  })

  it('up on the intro does nothing (same state object)', () => {
    const state = intro()
    expect(step(state, { type: 'wheel', direction: 'up' })).toBe(state)
  })

  it('down on the shelf goes to the fields screen, whatever book is in the centre', () => {
    for (const i of [0, 5, 46]) expect(step(shelf(i), { type: 'wheel', direction: 'down' })).toEqual(fields(i))
  })

  it('up on the shelf goes to the feature screen, whatever book is in the centre', () => {
    for (const i of [0, 5, 46]) expect(step(shelf(i), { type: 'wheel', direction: 'up' })).toEqual(feature(i))
  })

  it('up on the fields screen (at the first field) goes back to the shelf at the same book', () => {
    expect(step(fields(7), { type: 'wheel', direction: 'up' })).toEqual(shelf(7))
  })
})

describe('keys', () => {
  const key = (state: ScreenState, k: string) => step(state, { type: 'key', key: k })

  it('ArrowDown, PageDown and Space on the intro go to the feature screen, keeping the shelf book', () => {
    for (const k of ['ArrowDown', 'PageDown', ' ']) {
      expect(key(intro(), k)).toEqual(feature(0))
      expect(key(intro(5), k)).toEqual(feature(5))
    }
  })

  it('on the feature screen: ArrowDown/PageDown go to the shelf, ArrowUp/PageUp to the intro; the rest do nothing', () => {
    expect(key(feature(5), 'ArrowDown')).toEqual(shelf(5))
    expect(key(feature(5), 'PageDown')).toEqual(shelf(5))
    expect(key(feature(5), 'ArrowUp')).toEqual(intro(5))
    expect(key(feature(5), 'PageUp')).toEqual(intro(5))
    const state = feature(5)
    // Space는 영상의 조작부가 쓴다: 화면을 바꾸지 않는다
    for (const k of [' ', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Escape', 'a']) expect(key(state, k)).toBe(state)
  })

  it('other keys on the intro do nothing', () => {
    const state = intro()
    for (const k of ['ArrowUp', 'PageUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'a']) {
      expect(key(state, k)).toBe(state)
    }
  })

  it('ArrowDown and PageDown on the shelf go to the fields screen', () => {
    expect(key(shelf(5), 'ArrowDown')).toEqual(fields(5))
    expect(key(shelf(46), 'PageDown')).toEqual(fields(46))
  })

  it('ArrowUp and PageUp on the shelf go to the feature screen from any book', () => {
    expect(key(shelf(0), 'ArrowUp')).toEqual(feature(0))
    expect(key(shelf(5), 'PageUp')).toEqual(feature(5))
  })

  it('ArrowLeft at book 1 stays on the shelf', () => {
    const state = shelf(0)
    expect(key(state, 'ArrowLeft')).toBe(state)
  })

  it('ArrowLeft/ArrowRight/Home/End move along the shelf', () => {
    expect(key(shelf(5), 'ArrowLeft')).toEqual(shelf(4))
    expect(key(shelf(5), 'ArrowRight')).toEqual(shelf(6))
    expect(key(shelf(5), 'Home')).toEqual(shelf(0))
    expect(key(shelf(5), 'End')).toEqual(shelf(46))
    const last = shelf(46)
    expect(key(last, 'ArrowRight')).toBe(last)
  })

  it('Space on the shelf is left alone (it opens the focused book)', () => {
    const state = shelf(3)
    expect(key(state, ' ')).toBe(state)
  })

  it('ArrowUp and PageUp on the fields screen (at the first field) go to the shelf; left/right and the rest do nothing', () => {
    expect(key(fields(9), 'ArrowUp')).toEqual(shelf(9))
    expect(key(fields(9), 'PageUp')).toEqual(shelf(9))
    const state = fields(9)
    for (const k of ['ArrowLeft', 'ArrowRight', 'Home', ' ', 'Escape', 'a']) {
      expect(key(state, k)).toBe(state)
    }
  })
})

describe('vertical swipe (up = the finger moves up, the content comes up)', () => {
  it('up on the intro goes to the feature screen, keeping the shelf book; down does nothing', () => {
    expect(step(intro(8), { type: 'swipe', direction: 'up' })).toEqual(feature(8))
    const state = intro()
    expect(step(state, { type: 'swipe', direction: 'down' })).toBe(state)
  })

  it('on the feature screen: up goes to the shelf, down to the intro', () => {
    expect(step(feature(8), { type: 'swipe', direction: 'up' })).toEqual(shelf(8))
    expect(step(feature(8), { type: 'swipe', direction: 'down' })).toEqual(intro(8))
  })

  it('on the shelf: up goes to the fields screen, down to the feature screen, from any book', () => {
    expect(step(shelf(7), { type: 'swipe', direction: 'up' })).toEqual(fields(7))
    expect(step(shelf(7), { type: 'swipe', direction: 'down' })).toEqual(feature(7))
  })

  it('on the fields screen (at the first field): down goes to the shelf', () => {
    expect(step(fields(7), { type: 'swipe', direction: 'down' })).toEqual(shelf(7))
  })
})

describe('direct actions', () => {
  it('goTo shows that book on the shelf from any screen, clamped', () => {
    expect(step(intro(), { type: 'goTo', index: 11 })).toEqual(shelf(11))
    expect(step(feature(), { type: 'goTo', index: 11 })).toEqual(shelf(11))
    expect(step(fields(2), { type: 'goTo', index: 11 })).toEqual(shelf(11))
    expect(step(shelf(3), { type: 'goTo', index: 40 })).toEqual(shelf(40))
    expect(step(shelf(3), { type: 'goTo', index: 99 })).toEqual(shelf(46))
    const state = shelf(3)
    expect(step(state, { type: 'goTo', index: 3 })).toBe(state)
  })

  it('openShelf goes straight to the shelf from the intro, the feature screen and the fields screen, keeping the book', () => {
    // 웰컴의 `[ 서가 보기 ]`는 신간 소개를 거치지 않고 서가로 바로 간다
    expect(step(intro(), { type: 'openShelf' })).toEqual(shelf(0))
    expect(step(feature(20), { type: 'openShelf' })).toEqual(shelf(20))
    expect(step(intro(20), { type: 'openShelf' })).toEqual(shelf(20))
    expect(step(fields(20), { type: 'openShelf' })).toEqual(shelf(20))
    const state = shelf(9)
    expect(step(state, { type: 'openShelf' })).toBe(state)
  })

  it('openFields goes to the fields screen and leaves the book where it was', () => {
    expect(step(shelf(12), { type: 'openFields' })).toEqual(fields(12))
    expect(step(intro(3), { type: 'openFields' })).toEqual(fields(3))
    const state = fields(4)
    expect(step(state, { type: 'openFields' })).toBe(state)
  })

  it('openIntro goes to the intro and leaves the book where it was', () => {
    expect(step(shelf(12), { type: 'openIntro' })).toEqual(intro(12))
    expect(step(fields(12), { type: 'openIntro' })).toEqual(intro(12))
    expect(step(feature(12), { type: 'openIntro' })).toEqual(intro(12))
    const state = intro(4)
    expect(step(state, { type: 'openIntro' })).toBe(state)
  })

  it('next/prev step the shelf and never leave it; on the other screens they do nothing', () => {
    expect(step(shelf(3), { type: 'next' })).toEqual(shelf(4))
    expect(step(shelf(3), { type: 'prev' })).toEqual(shelf(2))
    const first = shelf(0)
    expect(step(first, { type: 'prev' })).toBe(first)
    for (const state of [intro(), feature(), fields(3)]) {
      expect(step(state, { type: 'next' })).toBe(state)
      expect(step(state, { type: 'prev' })).toBe(state)
    }
  })

  it('a book page opens only from the shelf (or by its number, from anywhere)', () => {
    expect(step(shelf(3), { type: 'openBook' })).toEqual({ screen: 'shelf', index: 3, view: 'book' })
    const onFields = fields(3)
    expect(step(onFields, { type: 'openBook' })).toBe(onFields)
    const onFeature = feature(3)
    expect(step(onFeature, { type: 'openBook' })).toBe(onFeature)
    expect(step(onFeature, { type: 'openBook', index: 9 })).toEqual({ screen: 'shelf', index: 9, view: 'book' })
    expect(step(onFields, { type: 'openBook', index: 9 })).toEqual({ screen: 'shelf', index: 9, view: 'book' })
  })

  it('an open book page keeps its own rules: the wheel turns volumes, it does not change the screen', () => {
    const page: ScreenState = { screen: 'shelf', index: 10, view: 'book' }
    expect(step(page, { type: 'wheel', direction: 'down' })).toEqual({ ...page, index: 11 })
    expect(step(page, { type: 'key', key: 'ArrowUp' })).toEqual({ ...page, index: 9 })
    expect(step(page, { type: 'openFields' })).toBe(page)
  })
})

describe('학제별 분류: 가리키는 학문(글자 다이얼)', () => {
  const key = (state: ScreenState, k: string) => step(state, { type: 'key', key: k })

  it('처음 가리키는 학문은 철학(0)이다', () => {
    expect(fieldOf(INITIAL_SCREEN)).toBe(0)
    expect(fieldOf(fields(3))).toBe(0)
    expect(fieldOf(fields(3, 4))).toBe(4)
  })

  it('걸음 사이의 최소 간격은 화면 전환보다 짧다', () => {
    expect(FIELD_STEP_MS).toBeGreaterThanOrEqual(200)
    expect(FIELD_STEP_MS).toBeLessThan(SCREEN_TRANSITION_MS)
  })

  it('다이얼 위의 휠 아래·↓·PageDown·위로 쓸기 = 다음 학문(화면과 책은 그대로)', () => {
    const actions: ScreenAction[] = [
      { type: 'wheel', direction: 'down', over: 'dial' },
      { type: 'key', key: 'ArrowDown' },
      { type: 'key', key: 'PageDown' },
      { type: 'swipe', direction: 'up' },
    ]
    for (const action of actions) {
      expect(step(fields(7), action)).toEqual(fields(7, 1))
      expect(step(fields(7, 4), action)).toEqual(fields(7, 5))
    }
  })

  it('다이얼 위의 휠 위·↑·PageUp·아래로 쓸기 = 이전 학문', () => {
    const actions: ScreenAction[] = [
      { type: 'wheel', direction: 'up', over: 'dial' },
      { type: 'key', key: 'ArrowUp' },
      { type: 'key', key: 'PageUp' },
      { type: 'swipe', direction: 'down' },
    ]
    for (const action of actions) {
      expect(step(fields(7, 5), action)).toEqual(fields(7, 4))
      expect(step(fields(7, 1), action)).toEqual(fields(7))
    }
  })

  it('첫 학문(철학)에서 위 = 서가로, 그 밖의 학문에서는 서가로 가지 않는다', () => {
    expect(step(fields(7), { type: 'wheel', direction: 'up', over: 'dial' })).toEqual(shelf(7))
    expect(step(fields(7, 1), { type: 'wheel', direction: 'up', over: 'dial' }).screen).toBe('fields')
    expect(key(fields(7), 'ArrowUp')).toEqual(shelf(7))
    expect(key(fields(7, 1), 'ArrowUp').screen).toBe('fields')
  })

  it('다이얼 밖의 휠은 화면을 옮긴다: 위 = 서가(어느 학문이든, 보던 학문은 그대로), 아래는 더 갈 화면이 없어 멈춘다', () => {
    expect(step(fields(7), { type: 'wheel', direction: 'up' })).toEqual(shelf(7))
    expect(step(fields(7, 6), { type: 'wheel', direction: 'up' })).toEqual({ screen: 'shelf', index: 7, field: 6 })
    const state = fields(7, 3)
    expect(step(state, { type: 'wheel', direction: 'down' })).toBe(state)
  })

  it('다른 화면에서는 휠이 어디에 있든 같다(over는 학제별 분류에서만 본다)', () => {
    expect(step(shelf(5), { type: 'wheel', direction: 'down', over: 'dial' })).toEqual(fields(5))
    expect(step(intro(), { type: 'wheel', direction: 'down', over: 'dial' })).toEqual(feature(0))
    expect(step(feature(), { type: 'wheel', direction: 'down', over: 'dial' })).toEqual(shelf(0))
  })

  it('마지막 학문(과학)에서 아래는 멈춘다(같은 state)', () => {
    const state = fields(7, LAST_FIELD)
    expect(step(state, { type: 'wheel', direction: 'down', over: 'dial' })).toBe(state)
    expect(key(state, 'ArrowDown')).toBe(state)
    expect(key(state, 'PageDown')).toBe(state)
    expect(step(state, { type: 'swipe', direction: 'up' })).toBe(state)
  })

  it('Home/End = 첫·마지막 학문', () => {
    expect(key(fields(7, 5), 'Home')).toEqual(fields(7))
    expect(key(fields(7, 5), 'End')).toEqual(fields(7, LAST_FIELD))
    const last = fields(7, LAST_FIELD)
    expect(key(last, 'End')).toBe(last)
    const first = fields(7)
    expect(key(first, 'Home')).toBe(first)
  })

  it('goField는 그 학문을 가리킨다(범위를 넘으면 끝에서 멈춤)', () => {
    expect(step(fields(7), { type: 'goField', index: 6 })).toEqual(fields(7, 6))
    expect(step(fields(7, 6), { type: 'goField', index: 0 })).toEqual(fields(7))
    expect(step(fields(7), { type: 'goField', index: 99 })).toEqual(fields(7, LAST_FIELD))
    expect(step(fields(7, 2), { type: 'goField', index: -3 })).toEqual(fields(7))
    const state = fields(7, 6)
    expect(step(state, { type: 'goField', index: 6 })).toBe(state)
  })

  it('서가·인트로에 다녀와도 보던 학문 그대로다', () => {
    const left = step(fields(7, 6), { type: 'openShelf' })
    expect(left).toEqual({ screen: 'shelf', index: 7, field: 6 })
    const moved = step(left, { type: 'key', key: 'ArrowRight' })
    expect(moved).toEqual({ screen: 'shelf', index: 8, field: 6 })
    expect(step(moved, { type: 'wheel', direction: 'down' })).toEqual(fields(8, 6))
    const intro6 = step(fields(7, 6), { type: 'openIntro' })
    expect(step(step(intro6, { type: 'openShelf' }), { type: 'openFields' })).toEqual(fields(7, 6))
  })

  it('책 페이지를 열고 닫고 넘겨도 학문은 남는다', () => {
    const page = step({ screen: 'shelf', index: 3, field: 6 }, { type: 'openBook' })
    expect(page).toEqual({ screen: 'shelf', index: 3, view: 'book', field: 6 })
    const turned = step(page, { type: 'wheel', direction: 'down' })
    expect(turned).toEqual({ screen: 'shelf', index: 4, view: 'book', field: 6 })
    expect(step(turned, { type: 'closeBook' })).toEqual({ screen: 'shelf', index: 4, field: 6 })
  })

  it('좌우 키와 next/prev는 학문을 바꾸지 않는다', () => {
    const state = fields(7, 3)
    for (const k of ['ArrowLeft', 'ArrowRight', ' ', 'Escape']) expect(key(state, k)).toBe(state)
    expect(step(state, { type: 'next' })).toBe(state)
    expect(step(state, { type: 'prev' })).toBe(state)
  })
})
