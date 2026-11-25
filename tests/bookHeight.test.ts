import { describe, expect, it } from 'vitest'
import {
  bookHeightFor,
  shelfGapsFor,
  shelfLiftFor,
  SHELF_CURRENT_GAP,
  SHELF_GAP,
} from '../src/shelf/metrics'

const ASPECT = 0.6812

describe('bookHeightFor', () => {
  it('is 66% of the viewport height when nothing else limits it', () => {
    expect(bookHeightFor({ viewportWidth: 1440, viewportHeight: 820, coverAspect: ASPECT })).toBeCloseTo(541.2)
    expect(bookHeightFor({ viewportWidth: 1440, viewportHeight: 720, coverAspect: ASPECT })).toBeCloseTo(475.2)
  })

  it('is capped at 720px', () => {
    expect(bookHeightFor({ viewportWidth: 3000, viewportHeight: 2000, coverAspect: ASPECT })).toBe(720)
  })

  it('keeps the desktop size when the shelf row has room (1440×820)', () => {
    const h = bookHeightFor({ viewportWidth: 1440, viewportHeight: 820, rowHeight: 629.8, coverAspect: ASPECT })
    expect(h).toBeCloseTo(541.2)
  })

  it('shrinks to fit a short shelf row, leaving room above and for the reflection below (1920×600)', () => {
    const row = 404.8
    const h = bookHeightFor({ viewportWidth: 1920, viewportHeight: 600, rowHeight: row, coverAspect: ASPECT })
    expect(h).toBeLessThan(396)
    expect(h).toBeLessThanOrEqual(row - 48)
    // 위 24px + 아래(반사 자리) 책 높이의 10%
    expect(h).toBeCloseTo((row - 24) / 1.1)
  })

  it('keeps the centre cover within 78% of a narrow viewport (375×812 → about 290px wide)', () => {
    const h = bookHeightFor({ viewportWidth: 375, viewportHeight: 812, coverAspect: ASPECT })
    expect(h * ASPECT).toBeCloseTo(375 * 0.78)
    expect(h * ASPECT).toBeGreaterThan(280)
    expect(h * ASPECT).toBeLessThan(300)
  })

  it('is not limited by width on a tablet (768×1024)', () => {
    const h = bookHeightFor({ viewportWidth: 768, viewportHeight: 1024, rowHeight: 860, coverAspect: ASPECT })
    expect(h).toBeCloseTo(1024 * 0.66)
  })

  it('ignores an unmeasured row (0 or null) and never collapses', () => {
    const base = bookHeightFor({ viewportWidth: 1440, viewportHeight: 820, coverAspect: ASPECT })
    expect(bookHeightFor({ viewportWidth: 1440, viewportHeight: 820, rowHeight: 0, coverAspect: ASPECT })).toBe(base)
    expect(bookHeightFor({ viewportWidth: 1440, viewportHeight: 820, rowHeight: null, coverAspect: ASPECT })).toBe(base)
    expect(bookHeightFor({ viewportWidth: 1440, viewportHeight: 820, rowHeight: 60, coverAspect: ASPECT })).toBeGreaterThanOrEqual(120)
  })
})

describe('shelfLiftFor', () => {
  it('lifts the books so most of the spare room is below them, never less than 24px above', () => {
    // 1440×820: 남는 높이 88.6 → 위 max(24, 30%) = 26.58, 아래 62.02
    const lift = shelfLiftFor(629.8, 541.2)
    expect(lift).toBeCloseTo(88.6 / 2 - 26.58)
    // 1920×600: 위는 정확히 24px
    const h = (404.8 - 24) / 1.1
    const free = 404.8 - h
    expect(free / 2 - shelfLiftFor(404.8, h)).toBeCloseTo(24)
  })

  it('does not lift when the row is unknown or there is no spare room', () => {
    expect(shelfLiftFor(null, 541.2)).toBe(0)
    expect(shelfLiftFor(0, 541.2)).toBe(0)
    expect(shelfLiftFor(500, 541.2)).toBe(0)
  })
})

describe('shelfGapsFor', () => {
  const SPINE = 0.078
  const desktop = (bookHeight: number, viewportWidth: number) =>
    shelfGapsFor({ bookHeight, viewportWidth, coverAspect: ASPECT, spineAspect: SPINE })

  it('keeps desktop gaps at 0.7 of a spine width whatever the window size', () => {
    expect(desktop(541.2, 1440).gap).toBeCloseTo(541.2 * SPINE * 0.7)
    expect(desktop(720, 2560).gap).toBeCloseTo(720 * SPINE * 0.7)
    expect(desktop(346, 1920).gap).toBeCloseTo(346 * SPINE * 0.7)
  })

  it('sets the centre book apart by a further spine width', () => {
    expect(desktop(541.2, 1440).currentGap).toBeCloseTo(541.2 * SPINE)
  })

  it('runs the row past both screen edges: about 15–16 books span 1440px', () => {
    const { gap, currentGap } = desktop(541.2, 1440)
    const spineWidth = 541.2 * SPINE
    const sideRoom = (1440 - 541.2 * ASPECT) / 2
    const spinesPerSide = (sideRoom - currentGap) / (gap + spineWidth)
    expect(spinesPerSide).toBeGreaterThan(6.5)
    expect(spinesPerSide).toBeLessThan(8)
  })

  it('tightens further when there is little room beside the centre cover, so neighbours still show', () => {
    const h = (375 * 0.78) / ASPECT
    const g = shelfGapsFor({ bookHeight: h, viewportWidth: 375, coverAspect: ASPECT, spineAspect: 0.078 })
    const sideRoom = (375 - h * ASPECT) / 2
    const linear = (SHELF_GAP + SHELF_CURRENT_GAP) * (h / 541.2)
    expect(g.gap + g.currentGap).toBeLessThan(linear / 2)
    // 가운데 책 옆 틈이 옆 여백의 절반을 넘지 않는다 → 옆 책의 책등이 보인다
    expect(g.gap + g.currentGap).toBeLessThanOrEqual(sideRoom / 2)
    expect(g.gap).toBeGreaterThan(4)
  })
})
