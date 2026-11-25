import { describe, expect, it } from 'vitest'
import { screenReducer, type ScreenState } from '../src/app/screen'
import { STEP_MOVE_MS } from '../src/app/useScreen'
import { books } from '../src/data/books'
import { LINEUP, lineupSlideMs } from '../src/intro/lineup'
import { menuBookRoute } from '../src/menu/bookRoute'
import { placeTotalMs } from '../src/shelf3d/motion'

const COUNT = books.length
/** 길을 끝까지 따라간 상태 */
const follow = (state: ScreenState, index: number) =>
  menuBookRoute(state, index, COUNT).reduce((s, step) => screenReducer(s, step.action, COUNT), state)

describe('전체 메뉴에서 고른 책으로 가는 길 (menu/bookRoute.ts)', () => {
  it('서가에서 지금 가운데 책을 고르면 바로 뽑는다(가운데 책을 눌러 열 때와 같은 action 하나)', () => {
    const route = menuBookRoute({ screen: 'shelf', index: 2 }, 2, COUNT)
    expect(route).toEqual([{ action: { type: 'openBook' }, afterMs: 0 }])
  })

  it('서가에서 다른 책을 고르면 먼저 서가가 그 책으로 넘어가고, 그 책이 가운데에 놓인 뒤에 뽑는다', () => {
    const route = menuBookRoute({ screen: 'shelf', index: 0 }, 2, COUNT)
    expect(route).toEqual([
      { action: { type: 'goTo', index: 2 }, afterMs: 0 },
      // 한 걸음 넘어온 책이 놓이는 움직임이 끝나는 때(`placeTotalMs(STEP_MOVE_MS)`: 680ms면 1000ms)
      { action: { type: 'openBook' }, afterMs: Math.round(placeTotalMs(STEP_MOVE_MS)) },
    ])
    // 먼 책도 같은 규칙이다(서가의 책 넘기기는 거리에 상관없이 한 걸음의 시간으로 움직인다)
    expect(menuBookRoute({ screen: 'shelf', index: 0 }, 29, COUNT)[1].afterMs).toBe(Math.round(placeTotalMs(STEP_MOVE_MS)))
    expect(follow({ screen: 'shelf', index: 0 }, 29)).toEqual({ screen: 'shelf', index: 29, view: 'book' })
  })

  it('신간 소개(웰컴 자리)에서 고르면 먼저 그 책이 가운데인 서가로 내려가고, 책이 펼쳐져 놓인 뒤에 뽑는다', () => {
    for (const screen of ['feature', 'intro'] as const) {
      for (const index of [9, COUNT - 1]) {
        const route = menuBookRoute({ screen, index: 0 }, index, COUNT)
        expect(route).toEqual([
          { action: { type: 'goTo', index }, afterMs: 0 },
          // 줄이 밀리다가 그 책이 펼쳐지기 시작하고(`openAt`), 펼쳐져 놓이는 움직임이 끝나는 때
          {
            action: { type: 'openBook' },
            afterMs: Math.round(lineupSlideMs(index, COUNT) * LINEUP.openAt) + Math.round(placeTotalMs(LINEUP.openMs)),
          },
        ])
      }
    }
    expect(follow({ screen: 'feature', index: 3 }, 9)).toEqual({ screen: 'shelf', index: 9, view: 'book' })
    // 보던 책을 골라도 서가로 내려가 놓인 뒤에 뽑는다
    expect(menuBookRoute({ screen: 'feature', index: 9 }, 9, COUNT)).toHaveLength(2)
  })

  it('학제별 분류에서 고르면 지금처럼 한 번에 그 책의 책 페이지로 간다', () => {
    const state: ScreenState = { screen: 'fields', index: 2, field: 3 }
    expect(menuBookRoute(state, 19, COUNT)).toEqual([{ action: { type: 'openBook', index: 19, menu: true }, afterMs: 0 }])
    expect(follow(state, 19)).toEqual({ screen: 'shelf', index: 19, view: 'book', field: 3 })
  })

  it('책 페이지가 열려 있으면 지금처럼 그 책의 페이지로 넘어간다(연 곳은 잊는다)', () => {
    const page: ScreenState = { screen: 'shelf', index: 30, view: 'book', from: 'fields', field: 8 }
    expect(menuBookRoute(page, 11, COUNT)).toEqual([{ action: { type: 'openBook', index: 11, menu: true }, afterMs: 0 }])
    expect(follow(page, 11)).toEqual({ screen: 'shelf', index: 11, view: 'book', field: 8 })
  })

  it('어느 길로 가든 닫으면 서가다(`from`이 붙지 않는다)', () => {
    for (const state of [
      { screen: 'shelf', index: 0 },
      { screen: 'feature', index: 0 },
      { screen: 'fields', index: 0, field: 2 },
    ] as ScreenState[]) {
      expect(follow(state, 12).from).toBeUndefined()
    }
  })
})
