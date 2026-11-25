import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { createBookModel, createBookShared, createTextureCache, type BookSpec } from '../src/book3d'
import { maxSpread, pagesNear } from '../src/reader/spread'
import { READER, createBookReader } from '../src/shelf3d/reader'

const spec: BookSpec = {
  no: 17,
  title: '시험용 책',
  coverAspect: 0.68,
  spineAspect: 0.09,
  images: { front: '/f.jpg', back: '/b.jpg', spine: '/s.jpg' },
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('pagesNear: the pages worth keeping around a spread', () => {
  const shape = { pages: 340, first: 'recto' as const }

  it('covers the spreads within the radius, both pages of each', () => {
    // 펼침면 10: 왼쪽 16쪽, 오른쪽 17쪽. 앞뒤 2 펼침면이면 12~21쪽
    expect(pagesNear(10, 10, 2, shape)).toEqual({ from: 12, to: 21 })
  })

  it('spans from one spread to another (while leaves are still turning between them)', () => {
    expect(pagesNear(10, 13, 1, shape)).toEqual({ from: 14, to: 25 })
    expect(pagesNear(13, 10, 1, shape)).toEqual({ from: 14, to: 25 })
  })

  it('stays inside the book', () => {
    expect(pagesNear(1, 1, 3, shape)).toEqual({ from: 1, to: 5 })
    expect(pagesNear(maxSpread(shape), maxSpread(shape), 3, shape)).toEqual({ from: 334, to: 340 })
  })
})

describe('a long book: the reader lets go of pages it has left behind', () => {
  it('holds only the pages near the open spread, however far it has been read', async () => {
    const shape = { pages: 340, first: 'recto' as const }
    const src = (page: number) => `/p${page}.jpg`
    const cache = createTextureCache(() => Promise.resolve(new THREE.Texture()))
    const shared = createBookShared()
    const reader = createBookReader({
      model: createBookModel(spec, { shared }),
      shape,
      srcOf: src,
      endpaper: 0x888888,
      flaps: { front: { src: '/flap-front.jpg', aspect: 0.52 }, back: { src: '/flap-back.jpg', aspect: 0.52 } },
      textures: cache,
    })
    const held = () => Array.from({ length: shape.pages }, (_, i) => i + 1).filter((p) => cache.refs(src(p)) > 0)

    for (let s = 1; s <= 120; s++) {
      reader.setSpread(s, false)
      await settle()
    }
    // 펼침면 120: 왼쪽 236쪽, 오른쪽 237쪽
    const pages = held()
    expect(pages).toContain(236)
    expect(pages).toContain(237)
    expect(pages.length).toBeLessThanOrEqual(4 * READER.keep + 2)
    expect(Math.min(...pages)).toBeGreaterThanOrEqual(236 - 2 * READER.keep)
    // 날개는 그대로 들고 있다
    expect(cache.refs('/flap-front.jpg')).toBe(1)

    // 되돌아가면 다시 받는다
    reader.setSpread(2, false)
    await settle()
    expect(held()).toContain(1)

    reader.dispose()
    await settle()
    expect(held()).toEqual([])
    expect(cache.refs('/flap-front.jpg')).toBe(0)
  })
})

describe('a long book: no page of the open book keeps a picture that was let go', () => {
  it('turning leaves forget the pages they carried once those pictures are released', async () => {
    const shape = { pages: 340, first: 'recto' as const }
    const gone = new Set<THREE.Texture>()
    // 그림은 조금 늦게 온다(되돌아갈 때 다시 청한 그림이 아직 오지 않은 순간이 생긴다)
    const cache = createTextureCache(
      () =>
        new Promise<THREE.Texture>((resolve) => {
          const texture = new THREE.Texture()
          texture.addEventListener('dispose', () => gone.add(texture))
          setTimeout(() => resolve(texture), 5)
        }),
    )
    const model = createBookModel(spec, { shared: createBookShared() })
    const reader = createBookReader({ model, shape, srcOf: (page) => `/p${page}.jpg`, endpaper: 0x888888, textures: cache })
    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
    /** 책에 붙은 모든 면 가운데 놓은 그림을 달고 있는 것 */
    const stale = () => {
      const found: string[] = []
      model.group.traverse((object) => {
        const mesh = object as THREE.Mesh
        if (!mesh.isMesh) return
        for (const material of [mesh.material].flat()) {
          const map = (material as THREE.MeshStandardMaterial).map
          if (map && gone.has(map)) found.push(mesh.name || mesh.uuid)
        }
      })
      return found
    }
    const settleTurns = async () => {
      for (let i = 0; i < 12 && reader.advance(READER.turn); i++);
      await wait(8)
    }

    reader.setSpread(1, false)
    await wait(8)
    // 빠르게 이어 넘긴다: 여러 낱장이 함께 넘어가며 쪽 그림을 단다
    for (let s = 2; s <= 6; s++) {
      reader.setSpread(s)
      reader.advance(60)
    }
    await settleTurns()
    // 멀리 읽어 나간다(한 장씩): 앞에서 달았던 그림은 놓인다
    for (let s = 7; s <= 6 + 3 * READER.keep; s++) {
      reader.setSpread(s)
      await settleTurns()
      expect(stale(), `펼침면 ${s}`).toEqual([])
    }
    expect(gone.size).toBeGreaterThan(0)
    // 되돌아오며 다시 빠르게 넘긴다
    for (let s = 5 + 3 * READER.keep; s >= 2; s--) {
      reader.setSpread(s)
      reader.advance(60)
      expect(stale(), `펼침면 ${s}`).toEqual([])
      if (s % 4 === 0) await settleTurns()
    }
    reader.dispose()
  })
})
