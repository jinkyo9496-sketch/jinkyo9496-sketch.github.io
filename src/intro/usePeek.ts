import { useLayoutEffect, useMemo, useState, type RefObject } from 'react'
import { peekFor, peekStyle, type Peek } from './peek'

const same = (a: Peek | null, b: Peek | null) =>
  a === b || (a !== null && b !== null && a.height === b.height && a.shift === b.shift && a.clip === b.clip && a.zone === b.zone)

/**
 * 인트로 아래에 서가의 책 머리를 비치게 하는 값(`peek.ts`)을 화면에서 재서 CSS 변수로 돌려준다(App이 `.app`에 넣는다).
 * 서가 칸(`.screen--shelf .shelf`)의 자리와 높이를 서가 화면 기준으로 잰다: 두 요소의 화면 좌표 차라서 화면이 옮겨져 있어도 같다.
 * 창 크기가 바뀌면 다시 잰다. 잴 수 없으면(jsdom) 빈 객체.
 */
export function usePeek(rootRef: RefObject<HTMLElement | null>, books: readonly { coverAspect: number }[]) {
  // 서가와 같은 기준: 가장 넓은 앞표지(`useShelfLayout`)
  const coverAspect = useMemo(() => Math.max(0, ...books.map((b) => b.coverAspect)), [books])
  const [peek, setPeek] = useState<Peek | null>(null)
  useLayoutEffect(() => {
    const root = rootRef.current
    const screen = root?.querySelector<HTMLElement>('.screen--shelf')
    if (!screen) return
    const measure = () => {
      // 서가 칸은 그리는 방식이 바뀌면 다른 요소가 된다(빈 칸 → WebGL → CSS): 잴 때마다 다시 찾는다. 자리는 같다
      const row = screen.querySelector<HTMLElement>('.shelf')
      const next =
        row && row.clientHeight > 0
          ? peekFor({
              rowTop: row.getBoundingClientRect().top - screen.getBoundingClientRect().top,
              rowHeight: row.clientHeight,
              viewportWidth: window.innerWidth,
              viewportHeight: window.innerHeight,
              coverAspect,
            })
          : null
      setPeek((prev) => (same(prev, next) ? prev : next))
    }
    measure()
    window.addEventListener('resize', measure)
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    observer?.observe(screen)
    return () => {
      window.removeEventListener('resize', measure)
      observer?.disconnect()
    }
  }, [rootRef, coverAspect])
  return useMemo(() => peekStyle(peek), [peek])
}
