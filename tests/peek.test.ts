import { describe, expect, it } from 'vitest'
import { PEEK_RATIO, peekFor, peekStyle } from '../src/intro/peek'
import { bookHeightFor, shelfLiftFor } from '../src/shelf/metrics'

const ASPECT = 0.6812

describe('peekFor: 인트로 아래에 비치는 서가의 윗부분', () => {
  it('책 머리가 책 높이의 12%만큼 보인다(1440×900에서 약 71px)', () => {
    expect(PEEK_RATIO).toBe(0.12)
    // 1440×900: 헤더 56 + 띠 91.2 = 서가 칸의 위 147.2, 칸 높이 900 − 147.2 − 48
    const peek = peekFor({ rowTop: 147.2, rowHeight: 704.8, viewportWidth: 1440, viewportHeight: 900, coverAspect: ASPECT })!
    expect(peek.height).toBeCloseTo(594 * 0.12)
    expect(peek.height).toBeGreaterThanOrEqual(50)
    expect(peek.height).toBeLessThanOrEqual(80)
  })

  it('서가와 같은 계산으로 책 윗선을 찾는다: 서가 화면을 올리는 양 = 책 윗선 + 비치는 높이', () => {
    const input = { rowTop: 147.2, rowHeight: 704.8, viewportWidth: 1440, viewportHeight: 900, coverAspect: ASPECT }
    const peek = peekFor(input)!
    const bookHeight = bookHeightFor(input)
    const bookTop = input.rowTop + input.rowHeight / 2 - shelfLiftFor(input.rowHeight, bookHeight) - bookHeight / 2
    expect(peek.shift).toBeCloseTo(bookTop + peek.height)
  })

  it('서가 칸의 위(타이틀 띠·헤더 자리)는 잘라 낸다: 보이는 띠는 칸의 위부터 화면 아래까지', () => {
    const peek = peekFor({ rowTop: 147.2, rowHeight: 704.8, viewportWidth: 1440, viewportHeight: 900, coverAspect: ASPECT })!
    expect(peek.clip).toBe(147.2)
    expect(peek.zone).toBeCloseTo(peek.shift - peek.clip)
    // 책 위의 여백(24px 이상)만큼 책 머리보다 넓다
    expect(peek.zone - peek.height).toBeGreaterThanOrEqual(24)
  })

  it('낮은 창에서도 비치는 띠가 화면의 1/5을 넘지 않는다(로고 묶음의 자리가 남는다)', () => {
    for (const [w, h, band] of [
      [1440, 700, 91.2],
      [1000, 600, 67.2],
    ] as const) {
      const rowTop = 56 + band
      const peek = peekFor({ rowTop, rowHeight: h - rowTop - 48, viewportWidth: w, viewportHeight: h, coverAspect: ASPECT })!
      expect(peek.zone).toBeLessThan(h / 5)
      expect(peek.height).toBeGreaterThan(40)
    }
  })

  it('서가 칸을 재지 못했으면(jsdom) 비치게 하지 않는다', () => {
    expect(peekFor({ rowTop: 0, rowHeight: 0, viewportWidth: 1024, viewportHeight: 768, coverAspect: ASPECT })).toBeNull()
    expect(peekStyle(null)).toEqual({})
  })

  it('CSS에는 px 값 셋을 넘긴다', () => {
    expect(peekStyle({ height: 71.28, shift: 251.9, clip: 147.2, zone: 104.7 })).toEqual({
      '--peek-shift': '251.9px',
      '--peek-clip': '147.2px',
      '--peek-zone': '104.7px',
    })
  })
})
