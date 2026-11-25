import { useLayoutEffect, useMemo, useState, type RefObject } from 'react'
import { logoFlightFor, logoFlightStyle, type LogoBox, type LogoFlight } from './logoFlight'

/**
 * 화면 틀(root) 안에서의 자리. `offset*`으로 잰다: 옮기고 키운 것(transform·translate)과 화면 전환의 이동이 끼지 않은,
 * 배치 그대로의 자리다(헤더 로고는 웰컴에서 큰 로고 자리에 옮겨져 있고, 큰 로고는 등장할 때 떠오른다)
 */
function boxWithin(el: HTMLElement, root: HTMLElement): LogoBox | null {
  let left = 0
  let top = 0
  let at: HTMLElement | null = el
  while (at && at !== root) {
    left += at.offsetLeft
    top += at.offsetTop
    at = at.offsetParent instanceof HTMLElement ? at.offsetParent : null
  }
  // 폭은 소수까지 읽는다(배치의 폭. 키운 것은 끼지 않는다): 정수로 반올림한 폭으로 나누면 큰 로고에서 몇 px 어긋난다
  const width = parseFloat(getComputedStyle(el).width)
  return at === root ? { left, top, width: Number.isFinite(width) && width > 0 ? width : el.offsetWidth } : null
}

const same = (a: LogoFlight | null, b: LogoFlight | null) =>
  a === b || (a !== null && b !== null && a.dx === b.dx && a.dy === b.dy && a.scale === b.scale)

/**
 * 헤더의 로고를 웰컴의 큰 로고 자리에 겹치는 값(`logoFlight.ts`)을 화면에서 재서 CSS 변수로 돌려준다(App이 `.app`에 넣는다).
 * 창 크기가 바뀌거나 그림이 도착하면 다시 잰다. 크기는 그대로인 채 자리만 바뀌는 때(비치는 서가의 띠가 재어져 큰 로고가
 * 올라갈 때, 화면이 바뀔 때)는 `watch`로 받는다: 그 값이 바뀌면 다시 잰다. 잴 수 없으면(jsdom, 글자 워드마크) 빈 객체.
 */
export function useLogoFlight(rootRef: RefObject<HTMLElement | null>, watch?: unknown) {
  const [flight, setFlight] = useState<LogoFlight | null>(null)
  useLayoutEffect(() => {
    const root = rootRef.current
    const big = root?.querySelector<HTMLElement>('.intro__logo img')
    // 헤더 로고에서 옮겨지는 것: 겹쳐 둔 그림의 묶음(`.logo__pair`) 또는 그림 하나
    const small = root?.querySelector<HTMLElement>('.header .logo > *')
    if (!root || !big || !small) return
    const measure = () => {
      const a = boxWithin(big, root)
      const b = boxWithin(small, root)
      const next = a && b ? logoFlightFor(a, b) : null
      setFlight((prev) => (same(prev, next) ? prev : next))
    }
    measure()
    window.addEventListener('resize', measure)
    const images = [big, ...small.querySelectorAll('img'), ...(small instanceof HTMLImageElement ? [small] : [])]
    images.forEach((img) => img.addEventListener('load', measure))
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    observer?.observe(big)
    observer?.observe(small)
    observer?.observe(root)
    return () => {
      window.removeEventListener('resize', measure)
      images.forEach((img) => img.removeEventListener('load', measure))
      observer?.disconnect()
    }
  }, [rootRef, watch])
  return useMemo(() => logoFlightStyle(flight), [flight])
}
