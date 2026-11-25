import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { createBookModel, createBookShared, createTextureCache, type BookSpec } from '../src/book3d'
import { jumpSteps, leafCount, maxSpread, pagesNear, pileShare, pileTarget } from '../src/reader/spread'
import { READER, createBookReader } from '../src/shelf3d/reader'

const shape = { pages: 340, first: 'recto' as const }
const max = maxSpread(shape)

describe('pileShare: 넘긴 만큼 왼쪽 더미가 두꺼워진다', () => {
  it('is empty on the left when shut or on the first spread, full at the end', () => {
    expect(pileShare(0, shape)).toBe(0)
    expect(pileShare(1, shape)).toBe(0)
    expect(pileShare(max, shape)).toBe(1)
  })
  it('grows evenly with the leaves turned', () => {
    const mid = Math.round((1 + max) / 2)
    expect(pileShare(mid, shape)).toBeCloseTo(0.5, 1)
    expect(pileShare(40, shape)).toBeLessThan(pileShare(41, shape))
  })
})

describe('pileTarget: 더미의 옆면을 누르면 그 깊이의 쪽으로', () => {
  it('goes further back the deeper into the right pile', () => {
    expect(pileTarget('right', 0, 10, shape)).toBe(11)
    expect(pileTarget('right', 0.5, 10, shape)).toBe(10 + Math.round((max - 10) / 2))
    expect(pileTarget('right', 1, 10, shape)).toBe(max)
  })
  it('goes further forward the deeper into the left pile', () => {
    expect(pileTarget('left', 0, 100, shape)).toBe(99)
    expect(pileTarget('left', 1, 100, shape)).toBe(1)
    expect(pileTarget('left', 0.5, 101, shape)).toBe(51)
  })
  it('stays put when that pile is empty, and clamps the depth', () => {
    expect(pileTarget('right', 0.7, max, shape)).toBe(max)
    expect(pileTarget('left', 0.7, 1, shape)).toBe(1)
    expect(pileTarget('right', 9, 10, shape)).toBe(max)
    expect(pileTarget('left', -3, 10, shape)).toBe(9)
    expect(pileTarget('right', 0.5, 0, shape)).toBe(0)
  })
})

describe('jumpSteps: 건너뛸 때 넘겨 보일 낱장들', () => {
  it('starts at the open spread and ends one short of the target', () => {
    expect(jumpSteps(10, 90, 4)).toEqual([10, 36, 63, 89])
    expect(jumpSteps(90, 10, 4)).toEqual([90, 64, 37, 11])
  })
  it('never shows more leaves than there are to turn', () => {
    expect(jumpSteps(10, 12, 4)).toEqual([10, 11])
    expect(jumpSteps(10, 11, 4)).toEqual([10])
    expect(jumpSteps(10, 10, 4)).toEqual([])
  })
})

describe('reader with piles (책 전체가 든 권)', () => {
  const spec: BookSpec = {
    no: 17,
    title: '시험용 책',
    coverAspect: 0.68,
    spineAspect: 0.09,
    images: { front: '/f.jpg', back: '/b.jpg', spine: '/s.jpg' },
  }
  const src = (p: number) => `/p${p}.webp`
  const make = (pile: boolean) => {
    const model = createBookModel(spec, { shared: createBookShared(), castShadow: true })
    const cache = createTextureCache(() => Promise.resolve(new THREE.Texture()))
    const reader = createBookReader({ model, shape, srcOf: src, endpaper: 0x888888, textures: cache, pile })
    const held = () => Array.from({ length: shape.pages }, (_, i) => i + 1).filter((p) => cache.refs(src(p)) > 0)
    return { model, reader, held }
  }
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0))
  const run = (reader: ReturnType<typeof make>['reader'], ms: number) => {
    for (let t = 0; t < ms; t += 16) reader.advance(16)
  }
  const share = (s: number) => (s - 1) / leafCount(shape)

  it('thins the right pile and thickens the left as the book is read', () => {
    const { model, reader } = make(true)
    const block = model.parts.pageBlock
    reader.setSpread(1, false)
    expect(block.scale.z).toBeCloseTo(1, 2)
    expect(reader.pile.left).toBeCloseTo(0, 2)
    const mid = Math.round((1 + max) / 2)
    reader.setSpread(mid, false)
    expect(reader.pile.left).toBeCloseTo(0.5, 1)
    expect(block.scale.z).toBeCloseTo(0.5, 1)
    // 오른쪽 더미의 윗면(쪽이 놓이는 높이)은 그대로다
    const top = block.position.z + ((spec.spineAspect - 0.008) * block.scale.z) / 2
    expect(top).toBeCloseTo(spec.spineAspect / 2 - 0.004, 4)
    reader.setSpread(max, false)
    expect(reader.pile.left).toBeCloseTo(1, 2)
    expect(block.scale.z).toBeLessThan(0.05)
  })

  it('puts the book back as it was when shut or disposed', () => {
    const { model, reader } = make(true)
    reader.setSpread(120, false)
    reader.setSpread(0, false)
    expect(model.parts.pageBlock.scale.z).toBeCloseTo(1, 5)
    expect(model.parts.pageBlock.position.z).toBeCloseTo(0, 5)
    reader.setSpread(120, false)
    reader.dispose()
    expect(model.parts.pageBlock.scale.z).toBe(1)
    expect(model.parts.pageBlock.position.z).toBe(0)
    expect(model.parts.spine.scale.z).toBe(1)
    expect(model.hinges.back.position.z).toBeCloseTo(-spec.spineAspect / 2, 6)
    expect(model.hinges.front.position.z).toBeCloseTo(spec.spineAspect / 2, 6)
  })

  it('leaves a book without piles (a preview) exactly as before', () => {
    const { model, reader } = make(false)
    reader.setSpread(100, false)
    expect(model.parts.pageBlock.scale.z).toBe(1)
    expect(reader.pile).toEqual({ left: 0, right: 1 })
  })

  it('jumps many spreads by turning a few leaves, not by snapping', () => {
    const { reader } = make(true)
    reader.setSpread(10, false)
    reader.setSpread(120)
    // 넘어가는 중이다(바로 놓이지 않는다)
    expect(reader.advance(16)).toBe(true)
    expect(reader.turning).toBeGreaterThan(1)
    expect(reader.turning).toBeLessThanOrEqual(READER.pool)
    run(reader, READER.turn + 1500)
    expect(reader.turning).toBe(0)
    expect(reader.spread).toBe(120)
    expect(reader.pile.left).toBeCloseTo(share(120), 2)
    // 뒤로도 건너뛴다
    reader.setSpread(5)
    expect(reader.advance(16)).toBe(true)
    run(reader, READER.turn + 1500)
    expect(reader.turning).toBe(0)
    expect(reader.spread).toBe(5)
    expect(reader.pile.left).toBeCloseTo(share(5), 2)
  })

  it('lets go of the pages it jumped over, however many jumps in a row', async () => {
    const { reader, held } = make(true)
    reader.setSpread(10, false)
    await settle()
    for (const to of [120, 30, 150, 60, 160]) {
      reader.setSpread(to)
      // 그림이 도착한 뒤에 넘어간다(받는 중인 그림은 놓을 수 없다)
      await settle()
      run(reader, READER.turn + 1500)
      await settle()
      const near = pagesNear(to, to, READER.keep, shape)!
      const pages = held()
      expect(pages.length).toBeGreaterThan(0)
      expect(Math.min(...pages), `${to}로 건너뛴 뒤`).toBeGreaterThanOrEqual(near.from)
      expect(Math.max(...pages), `${to}로 건너뛴 뒤`).toBeLessThanOrEqual(near.to)
    }
  })

  it('drops the jump and goes straight there when another turn comes mid-jump', () => {
    const { reader } = make(true)
    reader.setSpread(10, false)
    reader.setSpread(120)
    reader.advance(16)
    reader.setSpread(121)
    expect(reader.turning).toBe(0)
    expect(reader.spread).toBe(121)
  })

  describe('배 쪽의 띠: 실제보다 넓게(누르기 쉽게)', () => {
    const block = spec.spineAspect - 0.008
    const fan = (model: ReturnType<typeof make>['model']) => model.group.getObjectByName('pile-right-fan') as THREE.Mesh
    const xs = (mesh: THREE.Mesh) => {
      const at = mesh.geometry.getAttribute('position')
      return Array.from({ length: at.count }, (_, i) => at.getX(i))
    }
    const finite = (mesh: THREE.Mesh) =>
      ['position', 'normal'].every((name) => Array.from(mesh.geometry.getAttribute(name).array as Float32Array).every(Number.isFinite))

    it('juts out by its share of the thickness plus a fixed extra', () => {
      const { model, reader } = make(true)
      const mid = Math.round((1 + max) / 2)
      reader.setSpread(mid, false)
      const thick = block * (1 - reader.pile.left)
      const out = Math.max(...xs(fan(model))) - spec.coverAspect / 2
      expect(out).toBeCloseTo(READER.pile.fan.right * thick + READER.pile.base, 5)
      // 전의 값(두께의 0.62배)보다 넓다
      expect(out).toBeGreaterThan(0.62 * thick + 0.015)
    })

    it('stays finite where a pile is empty, and shows no band where nothing is left to turn', () => {
      const { model, reader } = make(true)
      reader.setSpread(1, false)
      const left = model.group.getObjectByName('pile-left') as THREE.Mesh
      expect(left.visible).toBe(false)
      expect(finite(left)).toBe(true)
      expect(finite(fan(model))).toBe(true)
      reader.setSpread(max, false)
      expect(finite(left)).toBe(true)
      expect(finite(fan(model))).toBe(true)
      expect(fan(model).visible).toBe(false)
      reader.setSpread(max - 3, false)
      expect(fan(model).visible).toBe(true)
    })

    it('draws the slit on the slanted face (the same line as the band)', () => {
      const { model, reader } = make(true)
      reader.setSpread(100, false)
      reader.setPeek({ side: 'right', corner: 'bottom', depth: 0.5 })
      reader.advance(16)
      const slit = model.group.getObjectByName('pile-slit') as THREE.Mesh
      const at = slit.geometry.getAttribute('position')
      const top = spec.spineAspect / 2 - 0.004
      const thick = block * (1 - reader.pile.left)
      const slope = (READER.pile.fan.right * thick + READER.pile.base) / thick
      // 배 쪽 면 위의 네 꼭짓점(4~7): x = 쪽의 끝 + 기울기 × 깊이
      for (let i = 4; i < 8; i++) expect(at.getX(i) - spec.coverAspect / 2).toBeCloseTo(slope * (top - at.getZ(i)), 2)
    })
  })

  it('shows a slit at the hovered depth of a pile, and takes it away', () => {
    const { model, reader } = make(true)
    reader.setSpread(100, false)
    const slit = () => model.group.getObjectByName('pile-slit')
    expect(slit()?.visible ?? false).toBe(false)
    reader.setPeek({ side: 'right', corner: 'bottom', depth: 0.4 })
    reader.advance(16)
    expect(slit()?.visible).toBe(true)
    reader.setPeek(null)
    reader.advance(16)
    expect(slit()?.visible).toBe(false)
  })
})
