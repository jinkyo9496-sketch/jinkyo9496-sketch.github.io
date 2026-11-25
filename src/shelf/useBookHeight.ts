import { useEffect, useLayoutEffect, useState, type RefObject } from 'react'
import { bookHeightFor, shelfLiftFor } from './metrics'

export { bookHeightFor } from './metrics'

function useWindowValue<T>(read: () => T): T {
  const [value, setValue] = useState(read)
  useEffect(() => {
    const onResize = () => setValue(read())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
    // read는 window만 읽는 순수 함수라 다시 구독할 필요가 없다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return value
}

const readViewportWidth = () => window.innerWidth
const readViewportHeight = () => window.innerHeight

export const useViewportWidth = () => useWindowValue(readViewportWidth)

/** 요소의 높이(px). 재기 전이나 잴 수 없는 환경(jsdom)에서는 null */
function useElementHeight(ref: RefObject<HTMLElement | null>) {
  const [height, setHeight] = useState<number | null>(null)
  // 첫 화면이 그려지기 전에 한 번 재고, 이후에는 크기가 바뀔 때마다 다시 잰다
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setHeight(el.clientHeight > 0 ? el.clientHeight : null)
    measure()
    window.addEventListener('resize', measure)
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    observer?.observe(el)
    return () => {
      window.removeEventListener('resize', measure)
      observer?.disconnect()
    }
  }, [ref])
  return height
}

/**
 * 서가 칸(`ref`)에 맞춘 책 크기: 책 높이, 칸 가운데에서 위로 올리는 양(lift), 반사 길이.
 * `coverAspect`는 가장 넓은 앞표지의 가로/세로.
 */
export function useShelfMetrics(ref: RefObject<HTMLElement | null>, coverAspect: number) {
  const viewportWidth = useViewportWidth()
  const viewportHeight = useWindowValue(readViewportHeight)
  const rowHeight = useElementHeight(ref)
  const bookHeight = bookHeightFor({ viewportWidth, viewportHeight, rowHeight, coverAspect })
  return {
    viewportWidth,
    bookHeight,
    lift: shelfLiftFor(rowHeight, bookHeight),
  }
}
