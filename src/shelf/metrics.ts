/**
 * 서가의 크기 계산(순수 함수). 화면 크기와 서가 칸(grid row)의 실제 높이에서
 * 책 높이, 세로 위치, 반사 길이, 책 사이 간격을 정한다.
 */

/** 책 높이의 기본값: 화면 높이의 이 비율 */
const HEIGHT_RATIO = 0.66
const MAX_HEIGHT = 720
const MIN_HEIGHT = 120
/** 책 위(타이틀 띠와의 사이)에 남기는 최소 여백(px) */
const MIN_ROOM_ABOVE = 24
/** 책 아래에 반사 자리로 남기는 최소 여백(책 높이 대비) */
const MIN_ROOM_BELOW_RATIO = 0.1
/** 남는 높이 가운데 책 위에 두는 몫. 나머지는 아래(반사 자리)로 간다 */
const ROOM_ABOVE_SHARE = 0.3
/** 가운데 앞표지가 화면 폭에서 차지할 수 있는 최대 비율 */
const MAX_COVER_WIDTH_RATIO = 0.78

/** 간격의 기준이 되는 데스크톱 책 높이(1440×820에서의 값) */
const BASE_BOOK_HEIGHT = 541.2
/** 책과 책 사이 간격(px, 기준 책 높이에서). 이 틈으로 옆 책의 표지 면이 보인다 */
export const SHELF_GAP = 44
/** 가운데 책 양옆에 더 띄우는 여백(px, 기준 책 높이에서) */
export const SHELF_CURRENT_GAP = 52
/** 가운데 책 옆 틈은 옆 여백의 이 비율을 넘지 않는다(좁은 화면에서도 옆 책등이 보이게) */
const MAX_CENTRE_GAP_SHARE = 1 / 3

const measured = (rowHeight: number | null | undefined): rowHeight is number =>
  typeof rowHeight === 'number' && rowHeight > 0

export interface BookHeightInput {
  viewportWidth: number
  viewportHeight: number
  /** 서가 칸의 실제 높이(px). 아직 재지 못했으면 null·0 */
  rowHeight?: number | null
  /** 앞표지 가로/세로(가장 넓은 책 기준) */
  coverAspect: number
}

/**
 * 책 높이. 기본은 min(66vh, 720px)이고, 다음 둘을 넘지 않는다.
 * - 서가 칸 높이에서 위 24px와 아래 반사 자리(책 높이의 10%)를 뺀 값
 * - 가운데 앞표지 폭이 화면 폭의 78%가 되는 높이
 */
export function bookHeightFor({ viewportWidth, viewportHeight, rowHeight, coverAspect }: BookHeightInput) {
  let height = Math.min(viewportHeight * HEIGHT_RATIO, MAX_HEIGHT)
  height = Math.min(height, (viewportWidth * MAX_COVER_WIDTH_RATIO) / coverAspect)
  if (measured(rowHeight)) {
    height = Math.min(height, (rowHeight - MIN_ROOM_ABOVE) / (1 + MIN_ROOM_BELOW_RATIO))
  }
  return Math.max(height, MIN_HEIGHT)
}

/** 책 위에 남는 여백(px). 칸을 재지 못했거나 남는 높이가 없으면 null */
function roomAbove(rowHeight: number | null | undefined, bookHeight: number) {
  if (!measured(rowHeight)) return null
  const free = rowHeight - bookHeight
  if (free <= 0) return null
  return { free, above: Math.min(free / 2, Math.max(MIN_ROOM_ABOVE, free * ROOM_ABOVE_SHARE)) }
}

/**
 * 책을 칸의 세로 가운데보다 얼마나 위로 올릴지(px). 남는 높이를 아래쪽(반사 자리)에 더 준다.
 * 클릭 판정(`shelfPointFrom`)도 같은 값을 쓴다.
 */
export function shelfLiftFor(rowHeight: number | null | undefined, bookHeight: number) {
  const room = roomAbove(rowHeight, bookHeight)
  return room ? room.free / 2 - room.above : 0
}

export interface ShelfGapsInput {
  bookHeight: number
  viewportWidth: number
  /** 가운데 책의 앞표지 가로/세로 */
  coverAspect: number
  /** 책등 가로/세로의 평균. 한 화면에 보일 권 수를 맞추는 데 쓴다 */
  spineAspect?: number
}

/** 이 폭 이상이면 데스크톱으로 보고 보이는 권 수를 고정한다 */
const DESKTOP_MIN_WIDTH = 900
/**
 * 데스크톱의 책 사이 간격(책등 폭 대비). 책은 화면 양끝까지 이어지고(끝의 책은 화면 밖으로 걸친다),
 * 1440px 폭에서 15~16권이 보인다. 옆면이 짙은 그늘이라 이 간격에서도 책등이 먼저 읽힌다.
 */
const GAP_PER_SPINE = 0.7
/** 데스크톱에서 가운데 책 양옆에 더 띄우는 여백(책등 폭 대비) */
const CURRENT_GAP_PER_SPINE = 1
const DEFAULT_SPINE_ASPECT = 0.078

/**
 * 책 사이 간격.
 * - 데스크톱(폭 900px 이상): 책등 폭에 비례한 간격(0.7배). 책은 화면 양끝까지 이어진다.
 * - 좁은 화면: 책 높이에 비례하고(기준 높이에서 44 / 52px), 가운데 표지 옆 여백이 좁으면
 *   가운데 책 옆 틈(gap + currentGap)이 그 여백의 1/3을 넘지 않도록 함께 줄인다.
 */
export function shelfGapsFor({
  bookHeight,
  viewportWidth,
  coverAspect,
  spineAspect = DEFAULT_SPINE_ASPECT,
}: ShelfGapsInput) {
  if (viewportWidth >= DESKTOP_MIN_WIDTH) {
    const spineWidth = bookHeight * spineAspect
    return { gap: spineWidth * GAP_PER_SPINE, currentGap: spineWidth * CURRENT_GAP_PER_SPINE }
  }

  const sideRoom = Math.max(0, (viewportWidth - bookHeight * coverAspect) / 2)
  const scale = bookHeight / BASE_BOOK_HEIGHT
  const centreGap = (SHELF_GAP + SHELF_CURRENT_GAP) * scale
  const tighten = Math.min(1, (sideRoom * MAX_CENTRE_GAP_SHARE) / centreGap)
  return { gap: SHELF_GAP * scale * tighten, currentGap: SHELF_CURRENT_GAP * scale * tighten }
}
