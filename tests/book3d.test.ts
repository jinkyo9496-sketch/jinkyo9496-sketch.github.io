import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'
import { books } from '../src/data/books'
import {
  COVER_THICKNESS,
  PAGE_TEXTURE,
  bookAssets,
  bookDimensions,
  bookSpecFrom,
  coverHinge,
  createBookModel,
  createBookShared,
  createTextureCache,
  hingeRotation,
  imagesFor,
  pageEdgeLevels,
  type BookSpec,
} from '../src/book3d'

const spec: BookSpec = {
  no: 7,
  title: '시험용 책',
  coverAspect: 0.68,
  spineAspect: 0.09,
  images: { front: '/f.jpg', back: '/b.jpg', spine: '/s.jpg' },
}

/** 손으로 끝내는 가짜 로더: 어떤 URL을 몇 번 받았는지 적어 둔다 */
const stubSource = () => {
  const pending = new Map<string, { resolve: (t: THREE.Texture) => void; reject: (e: unknown) => void }>()
  const load = vi.fn(
    (url: string) =>
      new Promise<THREE.Texture>((resolve, reject) => {
        pending.set(url, { resolve, reject })
      }),
  )
  const finish = (url: string) => {
    const texture = new THREE.Texture()
    pending.get(url)!.resolve(texture)
    return texture
  }
  const fail = (url: string) => pending.get(url)!.reject(new Error('404'))
  return { load, finish, fail }
}
const settle = () => new Promise((r) => setTimeout(r, 0))

describe('bookSpecFrom / manifest', () => {
  it('maps a Book to the model spec: number, title, proportions, the three images', () => {
    expect(bookSpecFrom(books[0])).toEqual({
      no: 1,
      title: books[0].title,
      coverAspect: books[0].coverAspect,
      spineAspect: books[0].spineAspect,
      images: books[0].images,
    })
  })

  it('lists one asset per book, in order, with a slot for a higher-resolution image set', () => {
    expect(bookAssets).toHaveLength(books.length)
    bookAssets.forEach((asset, i) => {
      expect(asset.no).toBe(books[i].no)
      expect(asset.title).toBe(books[i].title)
      expect(asset.coverAspect).toBe(books[i].coverAspect)
      expect(asset.spineAspect).toBe(books[i].spineAspect)
      expect(asset.images.standard).toEqual(books[i].images)
      // 큰 그림은 아직 없다
      expect(asset.images.high).toBeNull()
    })
  })

  it('picks the high-resolution set only when asked and when there is one', () => {
    const standard = { front: 'a', back: 'b', spine: 'c' }
    const high = { front: 'A', back: 'B', spine: 'C' }
    expect(imagesFor({ images: { standard, high: null } }, 'high')).toBe(standard)
    expect(imagesFor({ images: { standard, high } }, 'high')).toBe(high)
    expect(imagesFor({ images: { standard, high } }, 'standard')).toBe(standard)
    expect(imagesFor({ images: { standard, high } })).toBe(standard)
  })
})

describe('bookDimensions', () => {
  it('is the real proportions at unit height: width = coverAspect, depth = spineAspect', () => {
    expect(bookDimensions(spec)).toEqual({ width: 0.68, height: 1, depth: 0.09, cover: COVER_THICKNESS })
  })

  it('scales with the height', () => {
    const d = bookDimensions(spec, 500)
    expect(d.width).toBeCloseTo(340)
    expect(d.depth).toBeCloseTo(45)
    expect(d.cover).toBeCloseTo(500 * COVER_THICKNESS)
  })
})

describe('coverHinge (where a cover swings open)', () => {
  it('puts the front cover pivot on the outer fold: spine side (−x), front face (+z), vertical axis', () => {
    expect(coverHinge(spec, 'front')).toEqual({ pivot: [-0.34, 0, 0.045], axis: [0, 1, 0], openSign: -1 })
  })

  it('mirrors it for the back cover', () => {
    expect(coverHinge(spec, 'back')).toEqual({ pivot: [-0.34, 0, -0.045], axis: [0, 1, 0], openSign: 1 })
  })

  it('opens toward the reader: a quarter turn brings the fore-edge of the front cover straight out in +z', () => {
    const { pivot, axis } = coverHinge(spec, 'front')
    const p = new THREE.Vector3(...pivot)
    const foreEdge = new THREE.Vector3(0.34, 0, 0.045)
    const turned = foreEdge
      .clone()
      .sub(p)
      .applyAxisAngle(new THREE.Vector3(...axis), hingeRotation('front', Math.PI / 2))
      .add(p)
    expect(turned.x).toBeCloseTo(-0.34)
    expect(turned.z).toBeCloseTo(0.045 + 0.68)
    // 뒤표지는 반대쪽(−z)으로 열린다
    expect(hingeRotation('back', Math.PI / 2)).toBeCloseTo(Math.PI / 2)
  })
})

describe('pageEdgeLevels (the page-line pattern)', () => {
  const levels = pageEdgeLevels()

  it('has one level per texel, the first one plain paper', () => {
    expect(levels).toHaveLength(PAGE_TEXTURE.texels)
    expect(levels[0]).toBe(1)
  })

  it('is low-contrast: every level stays within the stated range', () => {
    for (const level of levels) {
      expect(level).toBeGreaterThanOrEqual(1 - PAGE_TEXTURE.contrast)
      expect(level).toBeLessThanOrEqual(1)
    }
    expect(Math.min(...levels)).toBeLessThan(1 - PAGE_TEXTURE.contrast / 2)
  })

  it('is the same every time (no flicker between scenes)', () => {
    expect(pageEdgeLevels()).toEqual(levels)
  })
})

describe('createTextureCache', () => {
  it('loads a URL once however many ask for it, and hands everyone the same texture', async () => {
    const { load, finish } = stubSource()
    const cache = createTextureCache(load)
    const a = cache.acquire('/f.jpg')
    const b = cache.acquire('/f.jpg')
    const texture = finish('/f.jpg')
    expect(await a).toBe(texture)
    expect(await b).toBe(texture)
    expect(load).toHaveBeenCalledTimes(1)
    // 이미 받은 그림은 다시 받지 않는다
    expect(await cache.acquire('/f.jpg')).toBe(texture)
    expect(load).toHaveBeenCalledTimes(1)
    expect(cache.refs('/f.jpg')).toBe(3)
  })

  it('keys by URL: different URLs are different loads', () => {
    const { load } = stubSource()
    const cache = createTextureCache(load)
    void cache.acquire('/a.jpg')
    void cache.acquire('/b.jpg')
    expect(load.mock.calls.map((c) => c[0])).toEqual(['/a.jpg', '/b.jpg'])
  })

  it('prepares the texture for faithful colour: sRGB, mipmaps, trilinear', async () => {
    const { load, finish } = stubSource()
    const cache = createTextureCache(load)
    const got = cache.acquire('/f.jpg')
    finish('/f.jpg')
    const texture = await got
    expect(texture.colorSpace).toBe(THREE.SRGBColorSpace)
    expect(texture.generateMipmaps).toBe(true)
    expect(texture.minFilter).toBe(THREE.LinearMipmapLinearFilter)
    expect(texture.magFilter).toBe(THREE.LinearFilter)
  })

  it('disposes the texture when the last user lets go, and loads again afterwards', async () => {
    const { load, finish } = stubSource()
    const cache = createTextureCache(load)
    const a = cache.acquire('/f.jpg')
    void cache.acquire('/f.jpg')
    const texture = finish('/f.jpg')
    await a
    const disposed = vi.fn()
    texture.addEventListener('dispose', disposed)
    cache.release('/f.jpg')
    expect(disposed).not.toHaveBeenCalled()
    cache.release('/f.jpg')
    expect(disposed).toHaveBeenCalledTimes(1)
    expect(cache.refs('/f.jpg')).toBe(0)
    void cache.acquire('/f.jpg')
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('disposes a texture that arrives after everyone let go', async () => {
    const { load, finish } = stubSource()
    const cache = createTextureCache(load)
    const got = cache.acquire('/f.jpg')
    cache.release('/f.jpg')
    const texture = new THREE.Texture()
    const disposed = vi.fn()
    texture.addEventListener('dispose', disposed)
    const arrived = finish('/f.jpg')
    arrived.addEventListener('dispose', disposed)
    await got.catch(() => {})
    expect(disposed).toHaveBeenCalledTimes(1)
  })

  it('forgets a failed load so that it can be tried again', async () => {
    const { load, fail } = stubSource()
    const cache = createTextureCache(load)
    const got = cache.acquire('/f.jpg')
    fail('/f.jpg')
    await expect(got).rejects.toThrow()
    expect(cache.refs('/f.jpg')).toBe(0)
    void cache.acquire('/f.jpg')
    expect(load).toHaveBeenCalledTimes(2)
  })
})

describe('createBookModel', () => {
  const build = (options: Parameters<typeof createBookModel>[1] = {}) => {
    const source = stubSource()
    const textures = createTextureCache(source.load)
    const model = createBookModel(spec, { textures, blockColor: '#f1eee6', placeholderColor: '#d6d6d3', ...options })
    return { model, textures, ...source }
  }
  const bounds = (object: THREE.Object3D) => {
    object.updateWorldMatrix(true, true)
    return new THREE.Box3().setFromObject(object)
  }

  it('builds one group, centred on the origin, in real proportions at unit height', () => {
    const { model } = build()
    const box = bounds(model.group)
    expect(box.min.toArray().map((n) => +n.toFixed(6))).toEqual([-0.34, -0.5, -0.045])
    expect(box.max.toArray().map((n) => +n.toFixed(6))).toEqual([0.34, 0.5, 0.045])
  })

  it('has named parts: front cover, back cover, spine, page block', () => {
    const { model } = build()
    expect(Object.keys(model.parts).sort()).toEqual(['backCover', 'frontCover', 'pageBlock', 'spine'])
    for (const [name, mesh] of Object.entries(model.parts)) {
      expect(mesh).toBeInstanceOf(THREE.Mesh)
      expect(mesh.name).toBe(name)
      expect(model.group.getObjectByName(name)).toBe(mesh)
    }
  })

  it('keeps the page block flush with the cover on the fore-edge, top and bottom, and inside it elsewhere', () => {
    const { model } = build()
    const block = bounds(model.parts.pageBlock)
    expect(block.max.x).toBeCloseTo(0.34)
    expect(block.max.y).toBeCloseTo(0.5)
    expect(block.min.y).toBeCloseTo(-0.5)
    expect(block.min.x).toBeCloseTo(-0.34 + COVER_THICKNESS)
    expect(block.max.z).toBeCloseTo(0.045 - COVER_THICKNESS)
    expect(block.min.z).toBeCloseTo(-0.045 + COVER_THICKNESS)
  })

  it('faces the front cover to +z with the spine on −x and the back cover on −z', () => {
    const { model } = build()
    expect(bounds(model.parts.frontCover).max.z).toBeCloseTo(0.045)
    expect(bounds(model.parts.frontCover).min.z).toBeCloseTo(0.045 - COVER_THICKNESS)
    expect(bounds(model.parts.backCover).min.z).toBeCloseTo(-0.045)
    expect(bounds(model.parts.spine).min.x).toBeCloseTo(-0.34)
    expect(bounds(model.parts.spine).max.x).toBeCloseTo(-0.34 + COVER_THICKNESS)
  })

  it('hangs the front cover on a hinge at the documented pivot, so turning the hinge opens it', () => {
    const { model } = build()
    const { pivot } = coverHinge(spec, 'front')
    expect(model.hinges.front.position.toArray()).toEqual(pivot)
    expect(model.parts.frontCover.parent).toBe(model.hinges.front)
    model.hinges.front.rotation.y = hingeRotation('front', Math.PI / 2)
    const open = bounds(model.parts.frontCover)
    // 열린 표지는 책등 쪽 모서리에서 앞으로(+z) 서 있다
    expect(open.max.z).toBeCloseTo(0.045 + 0.68)
    expect(open.min.x).toBeCloseTo(-0.34)
    expect(open.max.x).toBeCloseTo(-0.34 + COVER_THICKNESS)
  })

  it('prints each cover part from its own material and shares one paper material for the rest', () => {
    const { model } = build()
    const { front, back, spine, paper } = model.materials
    expect(model.parts.frontCover.material).toEqual([front, paper])
    expect(model.parts.backCover.material).toEqual([back, paper])
    expect(model.parts.spine.material).toEqual([spine, paper])
    expect(model.parts.pageBlock.material).toBe(paper)
    expect(new Set([front, back, spine]).size).toBe(3)
    expect(paper.color.getHexString()).toBe('f1eee6')
    expect(paper.map).toBeInstanceOf(THREE.DataTexture)
  })

  it('maps the cover images the right way round (u to the right as seen from outside)', () => {
    const { model } = build()
    const corner = (mesh: THREE.Mesh, i: number) => {
      const g = mesh.geometry
      return {
        p: new THREE.Vector3().fromBufferAttribute(g.getAttribute('position') as THREE.BufferAttribute, g.getIndex()!.getX(i)),
        uv: new THREE.Vector2().fromBufferAttribute(g.getAttribute('uv') as THREE.BufferAttribute, g.getIndex()!.getX(i)),
      }
    }
    // 첫 꼭짓점은 그림의 왼쪽 아래(u=0, v=0)
    const front = corner(model.parts.frontCover, 0)
    expect(front.uv.toArray()).toEqual([0, 0])
    expect(front.p.toArray().map((n) => +n.toFixed(6))).toEqual([-0.34, -0.5, 0.045])
    const spineCorner = corner(model.parts.spine, 0)
    expect(spineCorner.uv.toArray()).toEqual([0, 0])
    expect(spineCorner.p.toArray().map((n) => +n.toFixed(6))).toEqual([-0.34, -0.5, -0.045])
    const back = corner(model.parts.backCover, 0)
    expect(back.uv.toArray()).toEqual([0, 0])
    expect(back.p.toArray().map((n) => +n.toFixed(6))).toEqual([0.34, -0.5, -0.045])
  })

  it('casts the shadow from the page block only while closed, and every part receives', () => {
    const { model } = build({ castShadow: true, receiveShadow: true })
    expect(model.parts.pageBlock.castShadow).toBe(true)
    expect(model.parts.frontCover.castShadow).toBe(false)
    for (const mesh of Object.values(model.parts)) expect(mesh.receiveShadow).toBe(true)
  })

  it('hands every material to onMaterial with the part it belongs to', () => {
    const seen: string[] = []
    const { model } = build({ onMaterial: (_m, part) => seen.push(part) })
    expect(seen.sort()).toEqual(['backCover', 'frontCover', 'pageBlock', 'spine'])
    expect(model.materials.front).toBeInstanceOf(THREE.MeshPhysicalMaterial)
  })

  it('shows the placeholder colour until a face arrives, then the picture at full colour', async () => {
    const { model, finish, load } = build()
    expect(model.materials.front.color.getHexString()).toBe('d6d6d3')
    const changed = vi.fn()
    model.onTextureChange = changed
    const done = model.loadTextures()
    expect(load.mock.calls.map((c) => c[0]).sort()).toEqual(['/b.jpg', '/f.jpg', '/s.jpg'])
    expect(model.loadedFaces()).toBe(0)
    const texture = finish('/f.jpg')
    await settle()
    expect(model.materials.front.map).toBe(texture)
    expect(model.materials.front.color.getHexString()).toBe('ffffff')
    expect(model.materials.back.map).toBeNull()
    expect(changed).toHaveBeenCalledTimes(1)
    finish('/b.jpg')
    finish('/s.jpg')
    await done
    expect(model.loadedFaces()).toBe(3)
    // 다시 불러도 새로 받지 않는다
    await model.loadTextures()
    expect(load).toHaveBeenCalledTimes(3)
  })

  it('goes back to the placeholder and lets the textures go on disposeTextures', async () => {
    const { model, finish, textures } = build()
    const done = model.loadTextures()
    const texture = finish('/f.jpg')
    finish('/b.jpg')
    finish('/s.jpg')
    await done
    const disposed = vi.fn()
    texture.addEventListener('dispose', disposed)
    model.disposeTextures()
    expect(model.materials.front.map).toBeNull()
    expect(model.materials.front.color.getHexString()).toBe('d6d6d3')
    expect(model.loadedFaces()).toBe(0)
    expect(textures.refs('/f.jpg')).toBe(0)
    expect(disposed).toHaveBeenCalledTimes(1)
  })

  it('ignores a picture that arrives after disposeTextures', async () => {
    const { model, finish } = build()
    void model.loadTextures()
    model.disposeTextures()
    finish('/f.jpg')
    await settle()
    expect(model.materials.front.map).toBeNull()
  })

  it('leaves a failed face on the placeholder and tries it again next time', async () => {
    const { model, finish, fail, load } = build()
    const done = model.loadTextures()
    fail('/f.jpg')
    finish('/b.jpg')
    finish('/s.jpg')
    await done
    expect(model.loadedFaces()).toBe(2)
    void model.loadTextures()
    expect(load).toHaveBeenCalledTimes(4)
  })

  it('shares one image between two models of the same book (shelf + a future detail view)', async () => {
    const source = stubSource()
    const textures = createTextureCache(source.load)
    const a = createBookModel(spec, { textures })
    const b = createBookModel(spec, { textures })
    void a.loadTextures()
    void b.loadTextures()
    expect(source.load).toHaveBeenCalledTimes(3)
    const texture = source.finish('/f.jpg')
    await settle()
    expect(a.materials.front.map).toBe(texture)
    expect(b.materials.front.map).toBe(texture)
    const disposed = vi.fn()
    texture.addEventListener('dispose', disposed)
    a.dispose()
    expect(disposed).not.toHaveBeenCalled()
    b.dispose()
    expect(disposed).toHaveBeenCalledTimes(1)
  })

  it('uses shared paper when given, and does not dispose what it does not own', () => {
    const shared = createBookShared({ blockColor: '#f1eee6' })
    const { model } = build({ shared })
    expect(model.materials.paper).toBe(shared.paper)
    const disposed = vi.fn()
    shared.paper.addEventListener('dispose', disposed)
    const frontDisposed = vi.fn()
    model.materials.front.addEventListener('dispose', frontDisposed)
    model.dispose()
    expect(frontDisposed).toHaveBeenCalledTimes(1)
    expect(disposed).not.toHaveBeenCalled()
    shared.dispose()
    expect(disposed).toHaveBeenCalledTimes(1)
  })
})
