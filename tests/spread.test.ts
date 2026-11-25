import { describe, expect, it } from 'vitest'
import { clampSpread, leafCount, leafFaces, maxSpread, spreadFaces, spreadLabel } from '../src/reader/spread'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { previewPageSrc, previews } from '../src/data/previews'
import { books } from '../src/data/books'

describe('an opened book: the endpaper first, then the preview pages', () => {
  it('opens on the endpaper: inside of the cover on the left, the endpaper on the right', () => {
    expect(spreadFaces(1, { pages: 10 })).toEqual({ left: { kind: 'cover' }, right: { kind: 'endpaper' } })
  })

  it('starts the book after one turn: the back of the endpaper, then page 1', () => {
    expect(spreadFaces(2, { pages: 10 })).toEqual({ left: { kind: 'endpaper' }, right: { kind: 'image', page: 1 } })
    expect(spreadFaces(3, { pages: 10 })).toEqual({ left: { kind: 'image', page: 2 }, right: { kind: 'image', page: 3 } })
  })

  it('puts two preview pages on each leaf and ends on a blank page', () => {
    expect(leafCount({ pages: 10 })).toBe(6)
    expect(leafCount({ pages: 9 })).toBe(6)
    expect(leafFaces(5, { pages: 9 })).toEqual({ front: { kind: 'image', page: 9 }, back: { kind: 'blank' } })
    expect(spreadFaces(maxSpread({ pages: 10 }), { pages: 10 })).toEqual({ left: { kind: 'image', page: 10 }, right: { kind: 'blank' } })
  })

  it('shows every preview page exactly once across the spreads', () => {
    const seen: number[] = []
    for (let s = 1; s <= maxSpread({ pages: 29 }); s++) {
      const { left, right } = spreadFaces(s, { pages: 29 })
      for (const f of [left, right]) if (f.kind === 'image') seen.push(f.page)
    }
    expect(seen).toEqual(Array.from({ length: 29 }, (_, i) => i + 1))
  })

  it('keeps the spread within the book', () => {
    expect(clampSpread(-3, { pages: 10 })).toBe(0)
    expect(clampSpread(99, { pages: 10 })).toBe(maxSpread({ pages: 10 }))
    expect(clampSpread(Number.NaN, { pages: 10 })).toBe(0)
  })

  it('names where the reader is', () => {
    expect(spreadLabel(0, { pages: 10 })).toBe('덮여 있음')
    expect(spreadLabel(1, { pages: 10 })).toBe('면지')
    expect(spreadLabel(2, { pages: 10 })).toBe('면지 · 1쪽')
    expect(spreadLabel(3, { pages: 10 })).toBe('2쪽 · 3쪽')
    expect(spreadLabel(maxSpread({ pages: 9 }), { pages: 9 })).toBe('미리보기 끝')
  })
})

describe('a preview that starts on a left-hand page (first: verso)', () => {
  const shape = { pages: 8, first: 'verso' as const }

  it('still opens on the endpaper; its back is page 1 and the book starts on page 2', () => {
    expect(spreadFaces(1, shape)).toEqual({ left: { kind: 'cover' }, right: { kind: 'endpaper' } })
    expect(spreadFaces(2, shape)).toEqual({ left: { kind: 'image', page: 1 }, right: { kind: 'image', page: 2 } })
    expect(spreadFaces(3, shape)).toEqual({ left: { kind: 'image', page: 3 }, right: { kind: 'image', page: 4 } })
  })

  it('shows every page once and ends on a blank page', () => {
    const seen: number[] = []
    for (let s = 1; s <= maxSpread(shape); s++) {
      const { left, right } = spreadFaces(s, shape)
      for (const f of [left, right]) if (f.kind === 'image') seen.push(f.page)
    }
    expect(seen).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(spreadFaces(maxSpread(shape), shape).right).toEqual({ kind: 'blank' })
  })
})

describe('preview data (scripts/downloadPreviews.py)', () => {
  it('has pages and an endpaper colour for the books that have a preview', () => {
    const withPreview = books.filter((b) => previews[b.no])
    expect(withPreview.length).toBeGreaterThan(40)
    for (const b of withPreview) {
      const p = previews[b.no]
      // 책 전체로 확정해 미리보기 쪽 그림을 폐기한 권은 0쪽이다(날개와 면지 색만 남는다)
      expect(p.pages).toBeGreaterThanOrEqual(0)
      expect(['recto', 'verso']).toContain(p.first)
      expect(p.aspect).toBeGreaterThan(0.6)
      expect(p.aspect).toBeLessThan(0.75)
      if (p.endpaper) expect(p.endpaper).toMatch(/^#[0-9a-f]{6}$/)
    }
  })
})

describe('preview images on disk match the data', () => {
  const dir = (no: number) => join(process.cwd(), 'public', 'preview', String(no).padStart(2, '0'))

  it('every preview has exactly the page images it lists (p01 … pNN)', () => {
    for (const [no, p] of Object.entries(previews)) {
      const files = existsSync(dir(Number(no))) ? readdirSync(dir(Number(no))).filter((f) => /^p\d+\.jpg$/.test(f)) : []
      const expected = Array.from({ length: p.pages }, (_, i) => `p${String(i + 1).padStart(2, '0')}.jpg`)
      // 100쪽이 넘는 권(p100.jpg …)이 있어 이름순으로 맞춰 견준다
      expect(files.sort(), `${no}권`).toEqual(expected.sort())
    }
  })

  it('book 17 comes from the print PDF: the first 30 trimmed pages (the whole book is in public/full), starting on a right-hand page, at the cover’s proportions', () => {
    const p = previews[17]
    expect(p.pages).toBe(30)
    expect(p.first).toBe('recto') // 책의 1쪽(반표제)은 오른쪽 면이다
    expect(p.aspect).toBeCloseTo(128 / 188, 3) // 재단 크기 128 × 188mm
    expect(p.aspect).toBeCloseTo(books[16].coverAspect, 2)
    expect(previewPageSrc(17, 30)).toBe('/preview/17/p30.jpg')
  })
})

describe('leafCurve: a turning leaf bends like paper', () => {
  const length = (c: [number, number, number][]) =>
    c.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - c[i][0], p[1] - c[i][1]), 0)

  it('lies flat to the right at rest and flat to the left when turned', async () => {
    const { leafCurve } = await import('../src/shelf3d/reader')
    const right = leafCurve(0, 0, 1)
    expect(right.at(-1)![0]).toBeCloseTo(1, 2)
    expect(right.at(-1)![1]).toBeLessThan(0.03)
    const left = leafCurve(Math.PI, 0, 1)
    expect(left.at(-1)![0]).toBeCloseTo(-1, 2)
    expect(left.at(-1)![1]).toBeLessThan(0.03)
  })

  it('keeps its length and never goes below the pages while it bends', async () => {
    const { leafCurve, READER } = await import('../src/shelf3d/reader')
    for (const direction of [1, -1] as const)
      for (let p = 0; p <= 1; p += 0.1) {
        const curve = leafCurve(p * Math.PI, READER.lag * Math.sin(Math.PI * p), direction)
        expect(length(curve)).toBeCloseTo(1, 5)
        for (const [, z] of curve) expect(z).toBeGreaterThanOrEqual(0)
      }
  })

  it('lets the free edge trail behind the spine side, in the direction it came from', async () => {
    const { leafCurve, READER } = await import('../src/shelf3d/reader')
    const forward = leafCurve(Math.PI / 2, READER.lag, 1)
    // 앞으로 넘길 때: 바깥 끝이 아직 오른쪽에 남아 있다
    expect(forward.at(-1)![0]).toBeGreaterThan(0.15)
    const backward = leafCurve(Math.PI / 2, READER.lag, -1)
    expect(backward.at(-1)![0]).toBeLessThan(-0.15)
  })
})

describe('archSlope / leafCurve with arch: an opened paperback page bows', () => {
  it('rises out of the gutter, peaks, and comes back down to the outer edge', async () => {
    const { leafCurve, READER } = await import('../src/shelf3d/reader')
    const curve = leafCurve(0, 0, 1, READER.segments, READER.arch)
    const heights = curve.map((p) => p[1])
    const peak = Math.max(...heights)
    expect(peak).toBeGreaterThan(0.02)
    expect(peak).toBeLessThan(0.12)
    expect(heights.indexOf(peak) / READER.segments).toBeLessThan(0.5)
    expect(Math.abs(heights.at(-1)!)).toBeLessThan(0.02)
    for (const h of heights) expect(h).toBeGreaterThanOrEqual(-0.01)
  })

  it('mirrors on the left: a leaf lands in the same bowed shape it left', async () => {
    const { leafCurve, READER } = await import('../src/shelf3d/reader')
    const right = leafCurve(0, 0, 1, READER.segments, READER.arch)
    const left = leafCurve(Math.PI, 0, 1, READER.segments, READER.arch)
    right.forEach(([x, z], i) => {
      expect(left[i][0]).toBeCloseTo(-x, 6)
      expect(left[i][1]).toBeCloseTo(z, 6)
    })
  })
})

describe('coverCurve: a paperback cover bends as it opens', () => {
  const tip = (curve: [number, number, number][]) => curve[curve.length - 1]

  it('is a flat board while closed and with nothing bending it', async () => {
    const { coverCurve } = await import('../src/shelf3d/reader')
    const curve = coverCurve(0, 0, 0)
    expect(tip(curve)[0]).toBeCloseTo(1, 5)
    expect(tip(curve)[1]).toBeCloseTo(0, 5)
  })

  it('lets the fore-edge trail behind the spine side mid-way (bends toward the pages)', async () => {
    const { coverCurve, READER } = await import('../src/shelf3d/reader')
    const curve = coverCurve(Math.PI / 2, READER.coverLag, 0)
    expect(tip(curve)[1]).toBeLessThan(-0.05)
    // 책등 쪽은 경첩의 각 그대로다
    expect(curve[0][2]).toBeCloseTo(0, 5)
  })

  it('never dips below the closed cover: every part stays opened at least 0°', async () => {
    const { coverCurve, READER } = await import('../src/shelf3d/reader')
    for (const theta of [0.02, 0.1, 0.3, 0.8]) {
      for (const [, , slope] of coverCurve(theta, READER.coverLag, READER.arch)) {
        expect(slope + theta).toBeGreaterThanOrEqual(-1e-9)
        expect(slope + theta).toBeLessThanOrEqual(Math.PI + 1e-9)
      }
    }
  })

  it('bows like the page lying on it once opened', async () => {
    const { coverCurve, leafCurve, READER } = await import('../src/shelf3d/reader')
    const cover = coverCurve(READER.cover, 0, READER.arch)
    const page = leafCurve(0, 0, 1, READER.segments, READER.arch)
    // 쪽의 높이(+z)만큼 표지가 쪽 쪽(−z)으로 솟는다
    const mid = Math.round(READER.segments * 0.3)
    expect(-cover[mid][1]).toBeCloseTo(page[mid][1], 2)
  })
})

describe('the page size of a paperback', () => {
  it('is the cover size: the text block is trimmed together with the cover', async () => {
    const { READER } = await import('../src/shelf3d/reader')
    expect(READER.pageScale).toBe(1)
  })
})
