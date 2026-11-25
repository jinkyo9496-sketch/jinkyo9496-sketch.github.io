import { describe, expect, it } from 'vitest'
import { computeShelfLayout, pickSlotAt, type LayoutBook } from '../src/shelf/layout'

const mk = (spineAspect: number, coverAspect = 0.68): LayoutBook => ({ spineAspect, coverAspect })
const sample: LayoutBook[] = [mk(0.1), mk(0.08), mk(0.09, 0.7), mk(0.12), mk(0.07)]
const opts = { bookHeight: 600, gap: 4 }

const left = (s: { x: number; faceWidth: number }) => s.x - s.faceWidth / 2
const right = (s: { x: number; faceWidth: number }) => s.x + s.faceWidth / 2

describe('computeShelfLayout', () => {
  it('returns one slot per book in order', () => {
    const slots = computeShelfLayout(sample, 2, opts)
    expect(slots).toHaveLength(sample.length)
    for (let i = 1; i < slots.length; i++) {
      expect(slots[i].x).toBeGreaterThan(slots[i - 1].x)
    }
  })

  it('places the current book at x=0 facing front with cover width', () => {
    const slots = computeShelfLayout(sample, 2, opts)
    expect(slots[2]).toMatchObject({ x: 0, rotateY: 0, isCurrent: true })
    expect(slots[2].faceWidth).toBeCloseTo(600 * 0.7)
    expect(slots.filter((s) => s.isCurrent)).toHaveLength(1)
  })

  it('turns other books so the spine faces the viewer with spine width', () => {
    const slots = computeShelfLayout(sample, 2, opts)
    slots.forEach((s, i) => {
      if (i === 2) return
      expect(Math.abs(s.rotateY)).toBeCloseTo(90)
      expect(s.faceWidth).toBeCloseTo(600 * sample[i].spineAspect)
    })
  })

  it('lays books contiguously with gap between them', () => {
    const slots = computeShelfLayout(sample, 2, opts)
    for (let i = 1; i < slots.length; i++) {
      expect(right(slots[i - 1]) + opts.gap).toBeCloseTo(left(slots[i]))
    }
  })

  it('works at the first index', () => {
    const slots = computeShelfLayout(sample, 0, opts)
    expect(slots[0]).toMatchObject({ x: 0, rotateY: 0, isCurrent: true })
    expect(slots.slice(1).every((s) => s.x > 0)).toBe(true)
    for (let i = 1; i < slots.length; i++) {
      expect(right(slots[i - 1]) + opts.gap).toBeCloseTo(left(slots[i]))
    }
  })

  it('works at the last index', () => {
    const last = sample.length - 1
    const slots = computeShelfLayout(sample, last, opts)
    expect(slots[last]).toMatchObject({ x: 0, rotateY: 0, isCurrent: true })
    expect(slots.slice(0, last).every((s) => s.x < 0)).toBe(true)
    for (let i = 1; i < slots.length; i++) {
      expect(right(slots[i - 1]) + opts.gap).toBeCloseTo(left(slots[i]))
    }
  })

  it('clamps an out-of-range index', () => {
    expect(computeShelfLayout(sample, 99, opts)[4].isCurrent).toBe(true)
    expect(computeShelfLayout(sample, -3, opts)[0].isCurrent).toBe(true)
  })
})

describe('computeShelfLayout currentGap', () => {
  const wide = { ...opts, currentGap: 40 }

  it('adds currentGap on both sides of the current book only', () => {
    const slots = computeShelfLayout(sample, 2, wide)
    expect(slots[2].x).toBe(0)
    expect(left(slots[2]) - right(slots[1])).toBeCloseTo(opts.gap + 40)
    expect(left(slots[3]) - right(slots[2])).toBeCloseTo(opts.gap + 40)
    expect(left(slots[1]) - right(slots[0])).toBeCloseTo(opts.gap)
    expect(left(slots[4]) - right(slots[3])).toBeCloseTo(opts.gap)
  })

  it('keeps the current book centred at either end', () => {
    const first = computeShelfLayout(sample, 0, wide)
    expect(first[0].x).toBe(0)
    expect(left(first[1]) - right(first[0])).toBeCloseTo(opts.gap + 40)
    const lastIdx = sample.length - 1
    const last = computeShelfLayout(sample, lastIdx, wide)
    expect(last[lastIdx].x).toBe(0)
    expect(left(last[lastIdx]) - right(last[lastIdx - 1])).toBeCloseTo(opts.gap + 40)
  })

  it('defaults currentGap to 0', () => {
    expect(computeShelfLayout(sample, 2, { ...opts, currentGap: 0 })).toEqual(
      computeShelfLayout(sample, 2, opts),
    )
  })
})

describe('pickSlotAt', () => {
  const slots = computeShelfLayout(sample, 2, opts)

  it('returns the slot whose visible face contains the x offset', () => {
    expect(pickSlotAt(slots, 0, 0)).toBe(2)
    expect(pickSlotAt(slots, slots[0].x, 0)).toBe(0)
    expect(pickSlotAt(slots, slots[4].x, 0)).toBe(4)
  })

  it('accepts points within the tolerance outside a face edge', () => {
    expect(pickSlotAt(slots, right(slots[3]) + 1.5, 2)).toBe(3)
  })

  it('returns null when no face is near the point', () => {
    expect(pickSlotAt(slots, right(slots[4]) + 50, 2)).toBeNull()
    expect(pickSlotAt(slots, right(slots[3]) + 1.9, 0)).toBeNull()
  })
})

describe('computeShelfLayout lineupLeft (웰컴 화면의 줄: 전부 책등, 1권이 왼쪽 끝)', () => {
  const lined = { bookHeight: 600, gap: 10, currentGap: 40, lineupLeft: -700 }

  it('모든 책이 책등이고 펼쳐진 책이 없다(가운데 책이 몇 권이든)', () => {
    for (const index of [0, 2, 4]) {
      const slots = computeShelfLayout(sample, index, lined)
      expect(slots.every((s) => s.rotateY === 90 && !s.isCurrent)).toBe(true)
      slots.forEach((s, i) => expect(s.faceWidth).toBeCloseTo(600 * sample[i].spineAspect))
    }
  })

  it('1권 책등의 왼쪽 끝이 lineupLeft에 오고, 번호순으로 오른쪽으로 책등 간격(gap)만 두고 이어진다', () => {
    const slots = computeShelfLayout(sample, 3, lined)
    expect(left(slots[0])).toBeCloseTo(-700)
    for (let i = 1; i < slots.length; i++) {
      expect(left(slots[i]) - right(slots[i - 1])).toBeCloseTo(10)
    }
  })

  it('가운데 책이 달라도 줄의 자리는 같다(웰컴 화면의 모습이 늘 같다)', () => {
    const a = computeShelfLayout(sample, 0, lined)
    const b = computeShelfLayout(sample, 4, lined)
    a.forEach((s, i) => expect(s.x).toBeCloseTo(b[i].x))
  })

  it('lineupLeft가 없으면 평소 배치 그대로다', () => {
    const slots = computeShelfLayout(sample, 2, { bookHeight: 600, gap: 10, currentGap: 40 })
    expect(slots[2]).toMatchObject({ x: 0, rotateY: 0, isCurrent: true })
  })
})
