import { isWelcome, type Screen } from '../app/screen'

/**
 * 웰컴(인트로) 화면에서 서가의 책은 모두 책등으로 줄을 선다: 1권의 책등이 화면 왼쪽 여백에서 시작해 번호순으로 오른쪽으로
 * 이어진다(2026-11-24). 서가로 내려가면 줄이 밀려 가운데에 올 책이 가운데 자리를 찾고 앞표지로 펼쳐져 놓이고,
 * 웰컴으로 올라가면 그 책이 다시 책등으로 꽂힌 뒤 줄 전체가 1권이 왼쪽 끝에 오는 자리로 돌아간다.
 * 신간 소개(`feature`)는 웰컴과 같은 자리의 화면이라 줄도 같다(2026-11-24): 웰컴 ↔ 신간 소개에서는 줄이 움직이지 않고,
 * 줄이 밀리며 펼쳐지는 것·꽂히는 것은 신간 소개 ↔ 서가에서 돈다(웰컴의 `[ 서가 보기 ]`로 서가에 바로 갈 때도 같다).
 * 여기에는 그 단계와 박자의 순수 계산을 둔다(단위 테스트 `tests/lineup.test.ts`). 줄의 배치는 `shelf/layout.ts`의
 * `computeShelfLayout`(`lineupLeft`)이, 단계를 시간에 따라 넘기는 것은 `useLineup.ts`가 맡는다.
 */

/** 박자(ms) */
export const LINEUP = {
  /** 내려갈 때 줄이 밀리는 시간: 화면 전환(700ms)과 같다 */
  slideMs: 700,
  /** 가운데에 올 책이 멀리 있을 때(마지막 권)의 밀리는 시간: 줄이 길게 밀리므로 더 천천히 */
  slideFarMs: 1000,
  /** 이 순번(0부터)까지는 `slideMs` 그대로다: 웰컴의 줄에서 화면에 보이던 책들(1440px 폭에서 18권쯤) */
  nearIndex: 16,
  /** 밀리는 시간의 이만큼이 지나면(줄이 거의 자리를 잡을 무렵: 남은 거리 약 9%) 가운데 책이 펼쳐지기 시작한다 */
  openAt: 0.6,
  /** 펼쳐지는 시간. 지나가다 멈춘 책이 펼쳐질 때(900ms)보다 조금 빠르다: 화면이 다 올라온 뒤에 오래 움직이지 않게 */
  openMs: 720,
  /** 펼쳐져 놓일 때까지 그 속도를 유지하는 시간(놓이는 움직임 `placeTotalMs(720)` ≈ 1059ms보다 조금 길게) */
  openHoldMs: 1100,
  /** 올라갈 때 가운데 책이 책등으로 꽂히는 시간 */
  tuckMs: 520,
  /** 꽂히기 시작한 뒤 이만큼 지나면 줄이 1권 자리로 밀리기 시작한다 */
  lineAt: 160,
  /**
   * 줄이 1권 자리로 돌아가는 시간. 화면 전환(700ms)보다 짧다: 스프링이 이 시간에 남은 거리 1% 안으로 들어오고,
   * 화면이 웰컴에 닿을 때(줄이 밀리기 시작하고 700ms 뒤)에는 계산으로 0.4% 안이다(먼 책에서 실측 9~12px)
   */
  backMs: 600,
  /**
   * 올라갈 때 화면 전환을 이만큼 늦게 시작한다: 꽂히는 것이 먼저 보이고, 웰컴에 닿을 때는 줄이 거의 자리에 와 있다
   * (실측: 1권 책등의 남은 거리 2~12px, 되풀이 왕복에서 26px까지. 남은 몇 px은 약 1.5초에 자리 잡는다)
   */
  screenDelayMs: 160,
} as const

/**
 * 책 줄의 단계.
 * - `line`: 웰컴 자리(웰컴·신간 소개). 전부 책등으로 줄을 서 있다(1권이 왼쪽 끝)
 * - `slide`: 웰컴 자리 → 서가. 책등인 채 줄이 밀려 가운데에 올 책이 가운데로 온다
 * - `open`: 이어서 그 책이 앞표지로 펼쳐져 놓인다
 * - `tuck`: 서가 → 웰컴 자리. 가운데 책이 책등으로 꽂힌다(이어서 `line`: 줄이 1권 자리로 밀려 간다)
 * - `null`: 평소의 서가
 */
export type RowPhase = 'line' | 'slide' | 'open' | 'tuck' | null

export interface Row {
  screen: Screen
  /** 책 페이지가 열려 있는가 */
  book: boolean
  /** 가운데 책(바뀌었는지를 본다) */
  index: number
  phase: RowPhase
  /** 웰컴 자리로 가는 화면 전환을 늦게 시작하는가(꽂히고 올라온 경우에만) */
  delayed: boolean
}

/** `index.css`의 `--page-pad`와 같은 값(px): 기본 20, 폭 480px 이하 16 */
export const pagePadFor = (viewportWidth: number) => (viewportWidth <= 480 ? 16 : 20)

/** 웰컴의 줄에서 1권 책등의 왼쪽 끝이 놓이는 가로 좌표(뷰포트 가운데가 0, px): 화면 왼쪽 여백 */
export const lineupLeftFor = (viewportWidth: number) => -viewportWidth / 2 + pagePadFor(viewportWidth)

/** 내려갈 때 줄이 밀리는 시간(ms): 가운데에 올 책이 웰컴에서 보이던 범위를 넘어 멀수록 길어진다 */
export function lineupSlideMs(index: number, count: number) {
  const last = Math.max(LINEUP.nearIndex + 1, count - 1)
  const far = Math.min(1, Math.max(0, (index - LINEUP.nearIndex) / (last - LINEUP.nearIndex)))
  return Math.round(LINEUP.slideMs + (LINEUP.slideFarMs - LINEUP.slideMs) * far)
}

/**
 * 화면(과 책 페이지 열림, 가운데 책)이 바뀐 뒤의 단계. `prev`가 없으면 처음이다. 바뀐 것이 없으면 `prev`를 그대로 돌려준다.
 * 책 페이지나 학제별 분류에서 웰컴으로 바로 오면(로고) 꽂히는 단계 없이 줄을 선 모습이 된다.
 * 웰컴과 신간 소개 사이에서는 줄의 단계가 그대로다(화면이 움직이지 않으니 늦춤만 거둔다).
 * 서가에 내려온 뒤의 책 넘기기는 평소 그대로여야 한다: 책장이 지나가는 중(`gliding`: ←/→를 누르고 있다)이거나
 * 펼쳐지는 중(`open`)에 가운데 책이 바뀌면 단계를 거둔다(단계의 시간이 평소의 박자를 덮지 않는다).
 * 밀리는 중(`slide`)에 한 번 넘긴 것은 단계를 그대로 둔다: 새 책이 가운데로 와 펼쳐진다.
 */
export function rowAfter(
  prev: Row | null,
  next: { screen: Screen; book: boolean; index?: number; gliding?: boolean },
): Row {
  const index = next.index ?? prev?.index ?? 0
  if (prev && prev.screen === next.screen && prev.book === next.book) {
    const arriving = prev.phase === 'slide' || prev.phase === 'open'
    const drop = arriving && (next.gliding === true || (prev.phase === 'open' && prev.index !== index))
    if (!drop && prev.index === index) return prev
    return { ...prev, index, phase: drop ? null : prev.phase }
  }
  const row = (phase: RowPhase, delayed = false): Row => ({ screen: next.screen, book: next.book, index, phase, delayed })
  if (isWelcome(next.screen)) {
    if (!prev) return row('line')
    if (isWelcome(prev.screen)) return row(prev.phase ?? 'line')
    return prev.screen === 'shelf' && !prev.book ? row('tuck', true) : row('line')
  }
  if (next.screen === 'shelf' && !next.book) {
    if (prev && isWelcome(prev.screen)) return row('slide')
    // 책 페이지를 닫고 서가에 남았다: 평소의 서가
    return row(prev && prev.screen === 'shelf' && !prev.book ? prev.phase : null)
  }
  return row(null)
}

/** 그 단계에서 서가에 넘기는 것: 줄을 서는가, 가운데 책을 펼치지 않는가, 책이 한 번 움직이는 시간(null이면 평소의 값) */
export function rowMotion(phase: RowPhase, index: number, count: number): { lineup: boolean; closed: boolean; moveMs: number | null } {
  switch (phase) {
    case 'line':
      return { lineup: true, closed: true, moveMs: LINEUP.backMs }
    case 'slide':
      return { lineup: false, closed: true, moveMs: lineupSlideMs(index, count) }
    case 'open':
      return { lineup: false, closed: false, moveMs: LINEUP.openMs }
    case 'tuck':
      return { lineup: false, closed: true, moveMs: LINEUP.tuckMs }
    default:
      return { lineup: false, closed: false, moveMs: null }
  }
}
