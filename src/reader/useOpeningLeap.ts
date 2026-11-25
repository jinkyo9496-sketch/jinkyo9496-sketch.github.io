import { useEffect, useRef } from 'react'
import { openingSpread, type PreviewShape } from './spread'

/**
 * 책을 펼친 뒤(덮인 책 → 면지) 가운데쯤으로 건너뛰기까지의 시간(ms):
 * 표지가 넘어가는 시간(`shelf3d/reader.ts`의 READER.open 900)에 면지에서 머무는 시간 600을 더한 것
 */
export const OPENING_LEAP_MS = 1500

/**
 * 책 전체가 든 권을 펼치면: 표지가 넘어가고, 면지에서 잠깐 머문 뒤, 책의 가운데쯤(`openingSpread`)으로 건너뛴다.
 * 덮여 있던 책을 펼쳤을 때만이다(넘겨서 면지로 돌아온 것은 아니다). 그 전에 넘기거나 덮으면 거둔다.
 * full: 책 전체가 든 권인가, go: 펼침면을 바꾸는 함수, random: 0 이상 1 미만의 난수(테스트에서 바꾼다)
 */
export function useOpeningLeap(
  spread: number,
  full: boolean,
  shape: PreviewShape,
  go: (spread: number) => void,
  random: () => number = Math.random,
) {
  const was = useRef(spread)
  const latest = useRef({ shape, go, random })
  useEffect(() => {
    latest.current = { shape, go, random }
  })
  useEffect(() => {
    const opened = was.current === 0 && spread === 1
    was.current = spread
    if (!opened || !full) return
    const id = setTimeout(() => {
      const { shape: s, go: leap, random: dice } = latest.current
      leap(openingSpread(s, dice))
    }, OPENING_LEAP_MS)
    // 펼침면이 바뀌면(넘겼다·덮었다) 거둔다
    return () => clearTimeout(id)
  }, [spread, full])
}
