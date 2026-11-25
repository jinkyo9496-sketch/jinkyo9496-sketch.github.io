import { describe, expect, it } from 'vitest'
import { bookColors, pageColorsFor } from '../src/data/bookColors'
import { books } from '../src/data/books'
import { INK, PAPER, contrastRatio, ensureReadable, hexToRgb, relativeLuminance, rgbToHex, textOn } from '../src/data/colorMath'

describe('colour maths (WCAG)', () => {
  it('converts between hex and rgb', () => {
    expect(hexToRgb('#ff8000')).toEqual([255, 128, 0])
    expect(rgbToHex([255, 128, 0])).toBe('#ff8000')
    expect(rgbToHex([0.4, 15.6, 300])).toBe('#0010ff')
  })

  it('computes relative luminance', () => {
    expect(relativeLuminance('#000000')).toBe(0)
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 6)
    expect(relativeLuminance('#808080')).toBeCloseTo(0.2159, 3)
  })

  it('computes the contrast ratio, whichever way round', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 6)
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 6)
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 2)
    expect(contrastRatio('#123456', '#123456')).toBe(1)
  })

  it('matches the design tokens', () => {
    expect(INK).toBe('#111111')
    expect(PAPER).toBe('#fcfcfb')
    // design-system.md: --ink-2 는 --paper 위 5.19:1
    expect(contrastRatio('#6b6b6b', PAPER)).toBeCloseTo(5.19, 2)
  })

  it('picks ink or paper, whichever reads better', () => {
    expect(textOn('#f2d44a').text).toBe('ink')
    expect(textOn('#16233f').text).toBe('paper')
    expect(textOn('#000000').text).toBe('paper')
    expect(textOn('#ffffff').text).toBe('ink')
  })

  it('leaves a colour alone when one of the two already reaches 4.5:1', () => {
    expect(ensureReadable('#f2d44a')).toEqual({ background: '#f2d44a', text: 'ink' })
    expect(ensureReadable('#16233f')).toEqual({ background: '#16233f', text: 'paper' })
  })

  it('nudges a mid-tone until its text reaches 4.5:1 and keeps the raw colour', () => {
    // 가운데 밝기: 먹도 종이도 4.5:1에 못 미친다
    const mid = '#787878'
    expect(Math.max(contrastRatio(mid, INK), contrastRatio(mid, PAPER))).toBeLessThan(4.5)
    const fixed = ensureReadable(mid)
    expect(fixed.raw).toBe(mid)
    expect(fixed.background).not.toBe(mid)
    expect(contrastRatio(fixed.background, fixed.text === 'ink' ? INK : PAPER)).toBeGreaterThanOrEqual(4.5)
    // 조금만 움직인다
    const [r] = hexToRgb(fixed.background)
    expect(Math.abs(r - 0x78)).toBeLessThan(16)
  })
})

describe('book key colours (data)', () => {
  it('has one entry per book', () => {
    expect(Object.keys(bookColors).map(Number).sort((a, b) => a - b)).toEqual(books.map((b) => b.no))
  })

  it.each(books.map((b) => [b.no, b.title] as const))('no.%i %s: valid hex and readable text (≥ 4.5:1)', (no) => {
    const c = bookColors[no]
    expect(c.background).toMatch(/^#[0-9a-f]{6}$/)
    if (c.raw !== undefined) expect(c.raw).toMatch(/^#[0-9a-f]{6}$/)
    expect(['ink', 'paper']).toContain(c.text)
    expect(contrastRatio(c.background, c.text === 'ink' ? INK : PAPER)).toBeGreaterThanOrEqual(4.5)
  })

  it('gives CSS values for a page: the background and the token of its text colour', () => {
    const c = bookColors[1]
    expect(pageColorsFor(1)).toEqual({ background: c.background, text: `var(--${c.text})` })
  })
})
