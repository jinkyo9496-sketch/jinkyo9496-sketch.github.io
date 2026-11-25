import { renderHook } from '@testing-library/react'
import * as THREE from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createBookModel, createBookShared, createTextureCache, type BookSpec } from '../src/book3d'
import { leafCount, maxSpread, openingSpread, spreadFaces } from '../src/reader/spread'
import { OPENING_LEAP_MS, useOpeningLeap } from '../src/reader/useOpeningLeap'
import { PAGE_SPREAD } from '../src/shelf3d/motion'
import { createBookReader } from '../src/shelf3d/reader'

const shape = { pages: 340, first: 'recto' as const }

describe('openingSpread: 책 전체가 든 권을 펼치면 가운데쯤에서 펼쳐진다', () => {
  const pageOf = (s: number) => {
    const f = spreadFaces(s, shape).right
    return f.kind === 'image' ? f.page : NaN
  }
  it('lands within thirty pages of the middle of the book, wherever the dice fall', () => {
    for (const r of [0, 0.01, 0.25, 0.5, 0.75, 0.999]) {
      const s = openingSpread(shape, () => r)
      expect(Math.abs(pageOf(s) - 170)).toBeLessThanOrEqual(31)
    }
    expect(pageOf(openingSpread(shape, () => 0))).toBeLessThan(150)
    expect(pageOf(openingSpread(shape, () => 0.999))).toBeGreaterThan(190)
    expect(pageOf(openingSpread(shape, () => 0.5))).toBeCloseTo(170, -1)
  })
  it('stays inside a short book (never the endpaper spread, never past the end)', () => {
    const short = { pages: 12, first: 'recto' as const }
    for (const r of [0, 0.5, 0.999]) {
      const s = openingSpread(short, () => r)
      expect(s).toBeGreaterThanOrEqual(2)
      expect(s).toBeLessThanOrEqual(maxSpread(short) - 1)
    }
    expect(leafCount(short)).toBe(7)
  })
})

describe('useOpeningLeap: 면지에서 잠깐 머문 뒤 가운데쯤으로', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())
  const setup = (full: boolean) => {
    const go = vi.fn()
    const view = renderHook(({ spread }: { spread: number }) => useOpeningLeap(spread, full, shape, go, () => 0.5), {
      initialProps: { spread: 0 },
    })
    return { go, ...view }
  }

  it('leaps once the cover has opened and the endpaper has had its moment', () => {
    const { go, rerender } = setup(true)
    rerender({ spread: 1 })
    vi.advanceTimersByTime(OPENING_LEAP_MS - 10)
    expect(go).not.toHaveBeenCalled()
    vi.advanceTimersByTime(20)
    expect(go).toHaveBeenCalledTimes(1)
    expect(go).toHaveBeenLastCalledWith(openingSpread(shape, () => 0.5))
  })

  it('does nothing for a preview', () => {
    const { go, rerender } = setup(false)
    rerender({ spread: 1 })
    vi.advanceTimersByTime(OPENING_LEAP_MS * 2)
    expect(go).not.toHaveBeenCalled()
  })

  it('gives way when the reader turns or shuts the book first', () => {
    const { go, rerender } = setup(true)
    rerender({ spread: 1 })
    vi.advanceTimersByTime(300)
    rerender({ spread: 2 })
    vi.advanceTimersByTime(OPENING_LEAP_MS * 2)
    expect(go).not.toHaveBeenCalled()
  })

  it('does not leap when the reader pages back to the endpaper', () => {
    const { go, rerender } = setup(true)
    rerender({ spread: 1 })
    vi.advanceTimersByTime(OPENING_LEAP_MS + 10)
    expect(go).toHaveBeenCalledTimes(1)
    rerender({ spread: 80 })
    rerender({ spread: 2 })
    rerender({ spread: 1 })
    vi.advanceTimersByTime(OPENING_LEAP_MS * 2)
    expect(go).toHaveBeenCalledTimes(1)
  })
})

describe('펼친 책의 자세: 앞으로 일어나 있다', () => {
  it('leans back only a little (it used to lie 20° back)', () => {
    expect(PAGE_SPREAD.rest.pitch).toBeLessThanOrEqual(-6)
    expect(PAGE_SPREAD.rest.pitch).toBeGreaterThanOrEqual(-12)
  })
})

describe('종이 더미가 있어도 왼쪽 쪽은 제자리에 놓인다(넘긴 장 아래로 비치지 않는다)', () => {
  const spec: BookSpec = {
    no: 17,
    title: '시험용 책',
    coverAspect: 0.68,
    spineAspect: 0.09,
    images: { front: '/f.jpg', back: '/b.jpg', spine: '/s.jpg' },
  }
  const leftPage = (pile: boolean) => {
    const model = createBookModel(spec, { shared: createBookShared(), castShadow: true })
    const reader = createBookReader({
      model,
      shape,
      srcOf: (p) => `/p${p}.webp`,
      endpaper: 0x888888,
      textures: createTextureCache(() => Promise.resolve(new THREE.Texture())),
      pile,
    })
    reader.setSpread(100, false)
    model.group.updateMatrixWorld(true)
    // 왼쪽 쪽: 경첩 안의 첫 번째 낱장 도형(표지 다음)
    const mesh = model.hinges.front.children.find((c) => c !== model.parts.frontCover && (c as THREE.Mesh).isMesh && !c.name) as THREE.Mesh
    const at = mesh.geometry.getAttribute('position')
    const points: number[] = []
    const v = new THREE.Vector3()
    for (let i = 0; i < at.count; i++) {
      v.fromBufferAttribute(at, i).applyMatrix4(mesh.matrixWorld)
      points.push(v.x, v.y, v.z)
    }
    return { points, hingeZ: model.hinges.front.position.z }
  }

  it('puts the left page exactly where a book without piles puts it', () => {
    const plain = leftPage(false)
    const piled = leftPage(true)
    expect(piled.hingeZ).toBeCloseTo(plain.hingeZ, 9)
    expect(piled.points.length).toBe(plain.points.length)
    piled.points.forEach((p, i) => expect(p).toBeCloseTo(plain.points[i], 6))
  })
})
