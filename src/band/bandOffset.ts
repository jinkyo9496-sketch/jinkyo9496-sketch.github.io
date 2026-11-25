/** 띠(track) 왼쪽 끝을 기준으로 잰 제목 상자 */
export interface BandItem {
  left: number
  width: number
}

/**
 * index번째 제목의 가로 중심이 기준점(화면 중앙)에 오도록 하는 띠의 translateX(px).
 * 아직 재지 못했거나 범위를 벗어나면 0.
 */
export function computeBandOffset(items: readonly BandItem[], index: number): number {
  const item = items[index]
  if (!item) return 0
  const centre = item.left + item.width / 2
  return Number.isFinite(centre) && centre !== 0 ? -centre : 0
}
