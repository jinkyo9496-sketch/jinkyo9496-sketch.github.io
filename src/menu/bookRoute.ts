import { isBookView, type ScreenState } from '../app/screen'
import { STEP_MOVE_MS, type RouteStep } from '../app/useScreen'
import { LINEUP, lineupSlideMs } from '../intro/lineup'
import { placeTotalMs } from '../shelf3d/motion'

/**
 * 전체 메뉴에서 책을 골랐을 때 그 책의 책 페이지까지 가는 길(순수 계산. WebGL 서가일 때 App이 `useScreen`의
 * `applyWhenFree`에 넘긴다. 2026-11-25 편집자 요청: 서가가 넘어가는 것과 책을 뽑는 것이 겹치지 않게 차례로).
 * 단계 사이의 시점은 새로 짓지 않고 움직임의 상수에서 끌어온다.
 * - 책 페이지가 열려 있다: 한 번에 그 책의 페이지로 넘어간다(기존의 권 넘기기. 연 곳은 잊는다: `menu`).
 * - 학제별 분류: 한 번에 그 책의 책 페이지로(지금의 전환 그대로).
 * - 서가, 지금 가운데 책: 바로 뽑는다(가운데 책을 눌러 열 때와 같은 action).
 * - 서가, 다른 책: 서가가 그 책으로 넘어가고(평소의 책 넘기기. 먼 책도 한 걸음의 시간으로 움직인다), 가운데에 온 책이
 *   놓이는 움직임이 끝난 뒤(`placeTotalMs(STEP_MOVE_MS)`)에 뽑는다.
 * - 신간 소개(웰컴 자리): 그 책이 가운데인 서가로 내려가고(평소의 웰컴 자리 → 서가 전환: 줄이 밀리다 그 책이 펼쳐진다),
 *   펼쳐져 놓이는 움직임이 끝난 뒤(줄이 밀리는 시간의 `LINEUP.openAt` + `placeTotalMs(LINEUP.openMs)`. 효과음의 "툭"과
 *   같은 때)에 뽑는다.
 * 어느 길이든 `from`이 붙지 않아 닫으면 서가다.
 */
export function menuBookRoute(state: ScreenState, index: number, count: number): RouteStep[] {
  if (isBookView(state) || state.screen === 'fields') return [{ action: { type: 'openBook', index, menu: true }, afterMs: 0 }]
  const pull: RouteStep['action'] = { type: 'openBook' }
  if (state.screen === 'shelf') {
    if (state.index === index) return [{ action: pull, afterMs: 0 }]
    return [
      { action: { type: 'goTo', index }, afterMs: 0 },
      { action: pull, afterMs: Math.round(placeTotalMs(STEP_MOVE_MS)) },
    ]
  }
  // 웰컴 자리(신간 소개. 인트로에서는 메뉴 버튼을 거두지만 규칙은 같다)
  return [
    { action: { type: 'goTo', index }, afterMs: 0 },
    { action: pull, afterMs: Math.round(lineupSlideMs(index, count) * LINEUP.openAt) + Math.round(placeTotalMs(LINEUP.openMs)) },
  ]
}
