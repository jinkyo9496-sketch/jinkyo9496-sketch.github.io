import { useEffect, useState } from 'react'
import type { Screen } from '../app/screen'
import { LINEUP, lineupSlideMs, rowAfter, rowMotion, type RowPhase } from './lineup'

/**
 * 웰컴 자리(웰컴·신간 소개)와 서가 사이에서 책 줄이 거치는 단계(`lineup.ts`)를 시간에 따라 넘긴다. App이 쓴다.
 * - 웰컴·신간 소개: 줄을 서 있다(`lineup`). 둘 사이를 오갈 때는 줄이 움직이지 않는다
 * - 신간 소개(또는 웰컴의 `[ 서가 보기 ]`) → 서가: 책등인 채 밀리고(`slide`) → 가운데 책이 펼쳐져 놓이고(`open`) → 평소의 서가
 * - 서가 → 신간 소개(또는 로고로 웰컴): 가운데 책이 꽂히고(`tuck`) → 줄이 1권 자리로 밀려 간다(`line`)
 * 돌려주는 값: 서가에 넘길 `lineup`·`closed`·`moveMs`(null이면 평소의 값), 화면 전환을 늦출 시간 `screenDelayMs`.
 * 화면이 바뀐 바로 그 그리기에서 단계도 바뀐다(한 프레임이라도 평소 배치가 끼지 않게 그리는 중에 맞춘다).
 * 서가에 내려온 뒤의 책 넘기기는 평소 그대로다: 책장이 지나가는 중(`gliding`)이거나 펼쳐지는 중에 책이 바뀌면 단계를 거둔다.
 */
export function useLineup(screen: Screen, book: boolean, index: number, count: number, gliding = false) {
  const [row, setRow] = useState(() => rowAfter(null, { screen, book, index }))
  const next = rowAfter(row, { screen, book, index, gliding })
  if (next !== row) setRow(next)
  const phase = next.phase
  // 타이머는 책이 바뀌어도 다시 걸지 않는다(밀리는 중에 ← →로 바꾼 책이 밀리는 시간이 다른 먼 책일 때만 다시 잰다)
  const slideWait = phase === 'slide' ? Math.round(lineupSlideMs(index, count) * LINEUP.openAt) : 0

  useEffect(() => {
    const to = (then: RowPhase, ms: number) => {
      const id = setTimeout(() => setRow((r) => (r.phase === phase ? { ...r, phase: then } : r)), ms)
      return () => clearTimeout(id)
    }
    if (phase === 'slide') return to('open', slideWait)
    if (phase === 'open') return to(null, LINEUP.openHoldMs)
    if (phase === 'tuck') return to('line', LINEUP.lineAt)
  }, [phase, slideWait])

  return { ...rowMotion(phase, index, count), screenDelayMs: next.delayed ? LINEUP.screenDelayMs : 0 }
}
