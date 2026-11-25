export interface LayoutBook {
  /** 책등 가로/세로 */
  spineAspect: number
  /** 앞표지 가로/세로 */
  coverAspect: number
}

export interface LayoutOptions {
  /** 책 높이(px) */
  bookHeight: number
  /** 책과 책 사이 간격(px) */
  gap: number
  /** 가운데 책 양옆에 gap에 더해 주는 여백(px). 기본 0 */
  currentGap?: number
  /**
   * true면 가운데 책도 펼치지 않는다: 모든 책이 책등을 보인 채 같은 간격으로 이어지고,
   * 가운데 책의 책등이 x=0에 온다. 키를 누르고 있어 책장이 계속 지나가는 동안 쓴다.
   */
  closed?: boolean
  /**
   * 주면 웰컴(인트로) 화면의 줄이다: 모든 책이 책등을 보인 채 gap 간격으로 이어지고(`closed`와 같은 간격),
   * 1권 책등의 왼쪽 끝이 이 가로 좌표(뷰포트 중앙 기준 px)에 온다. 가운데 책이 몇 권이든 줄의 자리는 같다.
   */
  lineupLeft?: number
}

export interface BookSlot {
  /** 뷰포트 중앙 기준 책(보이는 면)의 가로 중심 좌표(px) */
  x: number
  /** Y축 회전(deg). 0 = 앞표지가 정면, 90 = 책등이 정면 */
  rotateY: number
  /** 정면에 보이는 면의 폭(px): 가운데 책은 앞표지, 나머지는 책등 */
  faceWidth: number
  isCurrent: boolean
}

/** 가운데 책은 책등들보다 이만큼(책 높이 대비) 앞으로 나와 있다. 원근 때문에 약 5% 크게 보인다 */
export const CURRENT_POP = 0.12

/** 책등이 정면을 향하게 하는 회전각. 책등 면이 상자의 -X쪽에 있으므로 +90deg. */
export const SPINE_FACING_ROTATION = 90

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

/**
 * 서가 배치 계산. 가운데(current) 책은 x=0에서 앞표지를 보이고,
 * 나머지 책은 책등을 정면으로 돌린 채 양옆에 gap 간격으로 이어진다.
 * 가운데 책과 바로 옆 책 사이만 gap + currentGap 으로 더 띄운다.
 */
export function computeShelfLayout(
  books: readonly LayoutBook[],
  currentIndex: number,
  { bookHeight, gap, currentGap = 0, closed: closedOption = false, lineupLeft }: LayoutOptions,
): BookSlot[] {
  if (books.length === 0) return []
  const closed = closedOption || lineupLeft !== undefined
  const current = clamp(Math.round(currentIndex), 0, books.length - 1)

  const slots: BookSlot[] = books.map((b, i) => {
    const isCurrent = !closed && i === current
    return {
      x: 0,
      rotateY: isCurrent ? 0 : SPINE_FACING_ROTATION,
      faceWidth: bookHeight * (isCurrent ? b.coverAspect : b.spineAspect),
      isCurrent,
    }
  })

  /** i번째 책과 i+1번째 책 사이 간격 */
  const gapAfter = (i: number) => (!closed && (i === current || i + 1 === current) ? gap + currentGap : gap)

  // 오른쪽으로 이어 붙이기
  for (let i = current + 1; i < slots.length; i++) {
    const prev = slots[i - 1]
    slots[i].x = prev.x + prev.faceWidth / 2 + gapAfter(i - 1) + slots[i].faceWidth / 2
  }
  // 왼쪽으로 이어 붙이기
  for (let i = current - 1; i >= 0; i--) {
    const next = slots[i + 1]
    slots[i].x = next.x - next.faceWidth / 2 - gapAfter(i) - slots[i].faceWidth / 2
  }

  if (lineupLeft !== undefined) {
    // 줄 전체를 옮겨 1권 책등의 왼쪽 끝을 그 자리에 둔다
    const shift = lineupLeft - (slots[0].x - slots[0].faceWidth / 2)
    for (const slot of slots) slot.x += shift
  }

  return slots
}

/**
 * 가로 좌표(뷰포트 중앙 기준 px)에 정면으로 보이는 면이 놓인 책의 index.
 * 면 가장자리에서 tolerance(px)까지는 그 책으로 본다. 없으면 null.
 */
export function pickSlotAt(slots: readonly BookSlot[], x: number, tolerance: number): number | null {
  let best: number | null = null
  let bestDistance = Infinity
  slots.forEach((slot, i) => {
    const distance = Math.abs(x - slot.x) - slot.faceWidth / 2
    if (distance <= tolerance && distance < bestDistance) {
      best = i
      bestDistance = distance
    }
  })
  return best
}

/**
 * 서가 좌표의 점(책 줄의 중심이 원점)에 놓인 책의 index. 세로로 책을 벗어나면(위 여백, 아래 반사) null.
 * 클릭과 호버가 같은 판정을 쓴다.
 */
export function bookAtPoint(
  slots: readonly BookSlot[],
  point: { x: number; y: number },
  bookHeight: number,
  tolerance: number,
): number | null {
  if (Math.abs(point.y) > bookHeight / 2) return null
  return pickSlotAt(slots, point.x, tolerance)
}

/**
 * 포인터의 화면 좌표를 서가 좌표(책 줄의 중심이 원점, px)로 바꾼다.
 * 책은 서가 상자의 가로 가운데, 세로로는 가운데에서 lift만큼 위에 놓인다.
 */
export function shelfPointFrom(
  rect: { left: number; top: number; width: number; height: number },
  clientX: number,
  clientY: number,
  lift: number,
) {
  return {
    x: clientX - (rect.left + rect.width / 2),
    y: clientY - (rect.top + rect.height / 2 - lift),
  }
}

/** 가운데 책에서 몇 권 떨어진 책까지 화면(가운데에서 좌우 halfWidth px)에 걸치는지 */
export function visibleRadius(slots: readonly BookSlot[], currentIndex: number, halfWidth: number) {
  let radius = 0
  slots.forEach((slot, i) => {
    if (Math.abs(slot.x) - slot.faceWidth / 2 < halfWidth) {
      radius = Math.max(radius, Math.abs(i - currentIndex))
    }
  })
  return radius
}

export type Loading = 'eager' | 'lazy'

/** 화면에 걸친 책 바깥으로 이만큼 더 책등을 미리 받는다(넘길 때 빈 책이 보이지 않게) */
const EAGER_SPINE_MARGIN = 3
/** 가운데에서 이만큼까지는 앞·뒤표지를 모두 미리 받는다(곧 가운데로 올 책) */
const EAGER_COVER_NEAR = 3

/**
 * 책 한 권의 면별 이미지 로딩 방식. 화면에 보이는 범위(radius)와 그 둘레는 바로 받고,
 * 먼 책은 미룬다. 옆으로 보이는 표지는 가운데보다 왼쪽 책은 앞표지, 오른쪽 책은 뒤표지다.
 */
export function faceLoadingFor(
  index: number,
  currentIndex: number,
  radius: number,
): { front: Loading; spine: Loading; back: Loading } {
  const distance = Math.abs(index - currentIndex)
  const near = distance <= EAGER_COVER_NEAR
  const visible = distance <= radius
  const when = (eager: boolean): Loading => (eager ? 'eager' : 'lazy')
  return {
    front: when(near || (visible && index < currentIndex)),
    spine: when(distance <= radius + EAGER_SPINE_MARGIN),
    back: when(near || (visible && index > currentIndex)),
  }
}
