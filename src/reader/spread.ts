/**
 * 펼친 책의 낱장과 펼침면(순수 계산. three·React와 무관하다).
 *
 * 책을 펼치면 먼저 면지가 나오고, 한 번 넘기면 본문(미리보기 그림)이 시작한다.
 * 미리보기의 첫 그림이 오른쪽 면(recto)인 책과 왼쪽 면(verso)인 책이 있다(`first`). 그에 따라 짝이 달라진다:
 *   first = 'recto'  낱장 0: 면지 / 면지      낱장 j(≥1): 앞 = 2j−1쪽, 뒤 = 2j쪽
 *   first = 'verso'  낱장 0: 면지 / 1쪽       낱장 j(≥1): 앞 = 2j쪽,   뒤 = 2j+1쪽
 * (없는 쪽은 빈 종이). 이렇게 해야 원래 책에서 마주 보던 두 쪽이 펼침면에서도 마주 본다.
 * 펼침면 spread: 0 = 덮여 있다. s(≥1) = 낱장 s−1장을 넘긴 상태.
 *   s = 1 : 왼쪽 = 표지 안쪽,   오른쪽 = 면지
 *   s = 2 : 왼쪽 = 면지의 뒷면, 오른쪽 = 본문의 첫 오른쪽 면 …
 *   마지막: 왼쪽 = 마지막 낱장의 뒷면, 오른쪽 = 빈 종이(미리보기 끝)
 */
/** 미리보기의 모양: 쪽수와, 첫 그림이 어느 쪽 면인가(기본 recto) */
export interface PreviewShape {
  pages: number
  first?: 'recto' | 'verso'
}

export type Face =
  | { kind: 'cover' } // 표지 안쪽(흰 종이)
  | { kind: 'endpaper' } // 면지(그 책의 별색)
  | { kind: 'image'; page: number } // 미리보기 그림(1부터)
  | { kind: 'blank' } // 빈 종이

const offsetOf = (shape: PreviewShape) => (shape.first === 'verso' ? 1 : 0)

/** 낱장의 수: 면지 1장 + 나머지 미리보기 2쪽마다 1장 */
export const leafCount = (shape: PreviewShape) => 1 + Math.ceil(Math.max(0, shape.pages - offsetOf(shape)) / 2)

/** 가장 끝의 펼침면: 낱장을 모두 넘긴 상태 */
export const maxSpread = (shape: PreviewShape) => leafCount(shape) + 1

/** 0 ~ maxSpread 사이로 맞춘다 */
export const clampSpread = (spread: number, shape: PreviewShape) =>
  Math.min(maxSpread(shape), Math.max(0, Math.round(Number.isFinite(spread) ? spread : 0)))

const image = (page: number, pages: number): Face => (page >= 1 && page <= pages ? { kind: 'image', page } : { kind: 'blank' })

/** 낱장의 앞면(오른쪽에 놓였을 때 보이는 면)과 뒷면 */
export function leafFaces(leaf: number, shape: PreviewShape): { front: Face; back: Face } {
  const o = offsetOf(shape)
  if (leaf <= 0) return { front: { kind: 'endpaper' }, back: o && shape.pages >= 1 ? { kind: 'image', page: 1 } : { kind: 'endpaper' } }
  return { front: image(2 * leaf - 1 + o, shape.pages), back: image(2 * leaf + o, shape.pages) }
}

/** 펼침면(1 이상)의 왼쪽·오른쪽에 보이는 면 */
export function spreadFaces(spread: number, shape: PreviewShape): { left: Face; right: Face } {
  const leaves = leafCount(shape)
  const flipped = Math.max(0, spread - 1)
  return {
    left: flipped === 0 ? { kind: 'cover' } : leafFaces(flipped - 1, shape).back,
    right: flipped < leaves ? leafFaces(flipped, shape).front : { kind: 'blank' },
  }
}

/**
 * 펼침면 a와 b 사이(둘 다 포함)와 그 앞뒤 radius 펼침면에 보이는 그림의 쪽 범위. 그림이 없으면 null.
 * 긴 책에서 펼친 곳 가까이의 그림만 들고 있으려고 쓴다(`shelf3d/reader.ts`).
 */
export function pagesNear(a: number, b: number, radius: number, shape: PreviewShape): { from: number; to: number } | null {
  const lo = Math.max(1, Math.min(a, b) - radius)
  const hi = Math.min(maxSpread(shape), Math.max(a, b) + radius)
  let from = Infinity
  let to = -Infinity
  for (let s = lo; s <= hi; s++) {
    const { left, right } = spreadFaces(s, shape)
    for (const f of [left, right]) {
      if (f.kind !== 'image') continue
      from = Math.min(from, f.page)
      to = Math.max(to, f.page)
    }
  }
  return from <= to ? { from, to } : null
}

/**
 * 펼친 책의 종이 더미(책 전체가 들어 있는 권). 넘긴 낱장은 왼쪽 더미로 간다.
 * `pileShare`: 왼쪽 더미가 차지하는 몫(0 = 모두 오른쪽, 1 = 모두 왼쪽). 덮여 있으면 0
 */
export function pileShare(spread: number, shape: PreviewShape): number {
  const leaves = leafCount(shape)
  if (spread <= 1 || leaves <= 0) return 0
  return Math.min(1, (spread - 1) / leaves)
}

/**
 * 더미의 옆면을 눌렀을 때 갈 펼침면. depth는 그 더미의 맨 위(0)에서 맨 아래(1)까지의 깊이:
 * 오른쪽 더미는 깊을수록 뒤쪽으로, 왼쪽 더미는 깊을수록 앞쪽으로 간다. 넘길 장이 있으면 적어도 한 장은 넘긴다.
 */
export function pileTarget(side: 'left' | 'right', depth: number, spread: number, shape: PreviewShape): number {
  const max = maxSpread(shape)
  if (spread < 1) return spread
  const d = Math.min(1, Math.max(0, Number.isFinite(depth) ? depth : 0))
  if (side === 'right') {
    const remaining = max - spread
    return remaining <= 0 ? spread : spread + Math.max(1, Math.round(d * remaining))
  }
  const turned = spread - 1
  return turned <= 0 ? spread : spread - Math.max(1, Math.round(d * turned))
}

/**
 * 여러 장을 건너뛸 때 실제로 넘겨 보일 낱장들의 출발 펼침면(먼저 떠나는 것부터, 많아야 count장).
 * 첫 장은 지금 펼침면에서 떠나고 마지막 장은 목표의 바로 앞에서 떠난다(그 장이 놓이면 목표의 모습이다).
 */
export function jumpSteps(from: number, to: number, count: number): number[] {
  const dir = Math.sign(to - from)
  const n = Math.min(Math.abs(to - from), Math.max(1, Math.floor(count)))
  if (n <= 0) return []
  if (n === 1) return [to - dir]
  const last = to - dir
  return Array.from({ length: n }, (_, k) => Math.round(from + ((last - from) * k) / (n - 1)))
}

/** 책을 펼쳤을 때 가운데에서 앞뒤로 벗어날 수 있는 쪽수 */
export const OPENING_RANGE_PAGES = 30

/**
 * 책 전체가 든 권을 펼쳤을 때 갈 펼침면: 책의 가운데에서 앞뒤 `OPENING_RANGE_PAGES`쪽 안의 한 곳(고르게 무작위).
 * random은 0 이상 1 미만의 난수. 면지의 펼침면(1)과 책 끝의 빈 면은 고르지 않는다
 */
export function openingSpread(shape: PreviewShape, random: () => number = Math.random): number {
  const max = maxSpread(shape)
  const middle = (1 + max) / 2
  // 한 펼침면이 두 쪽이다
  const reach = OPENING_RANGE_PAGES / 2
  const at = Math.round(middle - reach + Math.min(0.999999, Math.max(0, random())) * reach * 2)
  return Math.min(Math.max(2, max - 1), Math.max(2, at))
}

/** 화면에 적는 자리: 면지·본문 몇 쪽. 보조 기술과 조작부가 쓴다 */
export function spreadLabel(spread: number, shape: PreviewShape): string {
  if (spread <= 0) return '덮여 있음'
  const { left, right } = spreadFaces(spread, shape)
  const name = (f: Face) => (f.kind === 'image' ? `${f.page}쪽` : f.kind === 'endpaper' ? '면지' : null)
  const names = [name(left), name(right)].filter((n): n is string => n !== null)
  if (names.length === 0) return '미리보기 끝'
  return names[0] === names[1] ? names[0] : names.join(' · ')
}
