import { useMemo, type RefObject } from 'react'
import { computeShelfLayout, type LayoutBook } from './layout'
import { lineupLeftFor } from '../intro/lineup'
import { shelfGapsFor } from './metrics'
import { useShelfMetrics } from './useBookHeight'

/**
 * 서가 칸(`ref`)에 맞춘 책 크기·간격과 책마다의 자리(슬롯). CSS 서가와 WebGL 서가가 같은 값을 쓴다
 * (클릭·호버 판정이 두 서가에서 같다).
 * `lineup`이면 웰컴 화면의 줄이다: 전부 책등이고 1권 책등이 화면 왼쪽 여백(`lineupLeft`)에서 시작한다.
 */
export function useShelfLayout(
  ref: RefObject<HTMLElement | null>,
  books: readonly LayoutBook[],
  index: number,
  closed: boolean,
  lineup = false,
) {
  // 책 높이는 가장 넓은 앞표지를 기준으로 화면 폭에 맞춘다(책마다 높이가 달라지지 않게)
  const widestCover = useMemo(() => Math.max(0, ...books.map((b) => b.coverAspect)), [books])
  const { bookHeight, viewportWidth, lift } = useShelfMetrics(ref, widestCover)
  // 간격은 가장 넓은 표지와 평균 책등 폭으로 정한다(책을 넘길 때마다 간격이 달라지지 않게)
  const averageSpine = useMemo(
    () => (books.length ? books.reduce((sum, b) => sum + b.spineAspect, 0) / books.length : undefined),
    [books],
  )
  const { gap, currentGap } = useMemo(
    () => shelfGapsFor({ bookHeight, viewportWidth, coverAspect: widestCover, spineAspect: averageSpine }),
    [bookHeight, viewportWidth, widestCover, averageSpine],
  )
  // 웰컴 화면의 줄이 시작하는 자리(뷰포트 가운데가 0): 화면 왼쪽 여백
  const lineupLeft = lineupLeftFor(viewportWidth)
  const slots = useMemo(
    () => computeShelfLayout(books, index, { bookHeight, gap, currentGap, closed, lineupLeft: lineup ? lineupLeft : undefined }),
    [books, index, bookHeight, gap, currentGap, closed, lineup, lineupLeft],
  )
  return { bookHeight, viewportWidth, lift, gap, currentGap, lineupLeft, slots }
}
