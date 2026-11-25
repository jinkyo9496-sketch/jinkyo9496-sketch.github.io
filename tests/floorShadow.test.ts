import { describe, expect, it } from 'vitest'
import { computeShelfLayout } from '../src/shelf/layout'
import {
  FLOOR_SHADOW,
  contactShadow,
  floorShadowAt,
  shadowAt,
  visibleFloorDepth,
  type ContactShadow,
} from '../src/shelf3d/floorShadow'
import { CURRENT_POP, CURRENT_REST, HOVER_PULL, PLACE_LIFT, bookPoseTargets, projectPose } from '../src/shelf3d/motion'

/** 1440×900쯤의 서가: 책 높이 400, 책 아래로 보이는 바닥 15px */
const H = 400
const GAP = 32
const STAGE = { width: 1440, height: 900, bookHeight: H, centreY: 300, rowBottom: 515 }
const BOOK = { coverAspect: 0.68, spineAspect: 0.07 }
const rad = (deg: number) => (deg * Math.PI) / 180

/** 책등을 보이며 줄에 선 책(책등 면이 z = 0) */
const spinePose = (x = 0, extra: Partial<{ y: number; z: number }> = {}) => ({
  x,
  y: extra.y ?? 0,
  z: -(H * BOOK.coverAspect) / 2 + (extra.z ?? 0),
  yaw: Math.PI / 2,
})
/** 가운데 책: 앞으로 나와 쉬는 자세로 돌아 있다 */
const centrePose = (extra: Partial<{ y: number; z: number; yaw: number }> = {}) => ({
  x: 0,
  y: extra.y ?? 0,
  z: -(H * BOOK.spineAspect) / 2 + H * CURRENT_POP + (extra.z ?? 0),
  yaw: rad(extra.yaw ?? CURRENT_REST.yaw),
})

const depth = visibleFloorDepth(STAGE)
const options = { bookHeight: H, gap: GAP, depth }
const shadowOf = (pose: { x: number; y: number; z: number; yaw: number }) => contactShadow(pose, BOOK, options)
const at = (list: ContactShadow[], x: number, z: number) => floorShadowAt(list, x, z, options)

describe('visibleFloorDepth: 책 아래로 보이는 바닥의 깊이', () => {
  it('그 깊이의 바닥은 캔버스가 잘리는 선(서가 칸의 아래 끝)에 보인다', () => {
    expect(depth).toBeGreaterThan(0)
    expect(projectPose(STAGE, { x: 0, y: -H / 2, z: depth }).y).toBeCloseTo(STAGE.rowBottom, 6)
  })

  it('보이는 바닥이 넓어지면 깊어진다', () => {
    expect(visibleFloorDepth({ ...STAGE, rowBottom: 540 })).toBeGreaterThan(depth)
  })

  it('책의 아래 끝이 잘리는 선에 닿거나 넘으면 0이다', () => {
    expect(visibleFloorDepth({ ...STAGE, rowBottom: STAGE.centreY + H / 2 })).toBe(0)
    expect(visibleFloorDepth({ ...STAGE, rowBottom: 400 })).toBe(0)
  })

  it('잘리는 선을 모르면 그림자가 번지는 가장 긴 길이를 쓴다', () => {
    expect(visibleFloorDepth({ bookHeight: H, centreY: 300 })).toBeCloseTo(H * FLOOR_SHADOW.forward, 6)
  })
})

describe('contactShadow: 책 한 권이 바닥에 닿은 자리의 그림자', () => {
  it('책등을 보인 책: 발자국은 책등 폭 × 표지 폭이고, 옆으로 책 사이 간격의 반씩 넓혀 이웃과 이어진다', () => {
    const s = shadowOf(spinePose(120))
    expect(s.x).toBe(120)
    expect(s.z).toBeCloseTo(-(H * BOOK.coverAspect) / 2, 6)
    expect(s.halfW).toBeCloseTo((H * BOOK.coverAspect) / 2, 6)
    expect(s.halfD).toBeCloseTo((H * BOOK.spineAspect) / 2 + GAP / 2, 6)
    expect(s.strength).toBeCloseTo(1, 6)
  })

  it('책 바로 밑이 가장 진하고 앞으로 갈수록 옅어져, 번지는 길이에서 0이 된다', () => {
    const s = shadowOf(spinePose())
    const values = [0, 0.25, 0.5, 0.75, 1].map((t) => shadowAt(s, 0, t * s.forward))
    expect(values[0]).toBeCloseTo(1, 6)
    for (let i = 1; i < values.length; i++) expect(values[i]).toBeLessThan(values[i - 1])
    expect(values[4]).toBe(0)
    expect(shadowAt(s, 0, -10)).toBeCloseTo(1, 6)
  })

  it('앞으로 번지는 길이는 보이는 바닥의 깊이를 넘지 않는다', () => {
    expect(shadowOf(spinePose()).forward).toBeLessThanOrEqual(depth)
    const roomy = contactShadow(spinePose(), BOOK, { ...options, depth: H })
    expect(roomy.forward).toBeCloseTo(H * FLOOR_SHADOW.forward, 6)
  })

  it('가운데 책: 돌아선 각만큼 돌아간 발자국에, 더 넓고 옅다. 이웃과 잇는 넓힘은 없다', () => {
    const row = shadowOf(spinePose())
    const s = shadowOf(centrePose())
    expect(s.cos).toBeCloseTo(Math.cos(rad(CURRENT_REST.yaw)), 6)
    expect(s.sin).toBeCloseTo(Math.sin(rad(CURRENT_REST.yaw)), 6)
    expect(s.halfW).toBeCloseTo((H * BOOK.coverAspect) / 2, 6)
    expect(s.halfD - (H * BOOK.spineAspect) / 2).toBeLessThan(GAP * 0.05)
    expect(s.strength).toBeLessThan(row.strength)
    expect(s.strength).toBeGreaterThan(0.5)
    expect(s.side).toBeGreaterThan(row.side)
  })

  it('가운데 책의 그림자는 양옆으로 길게 퍼지지 않는다(책 높이의 15% 안에서 끝난다)', () => {
    const s = shadowOf(centrePose())
    const edge = (H * BOOK.coverAspect) / 2 + (H * BOOK.spineAspect) / 2
    for (const z of [-20, 0, 20, 40, 60]) {
      expect(shadowAt(s, edge + H * 0.15, z)).toBe(0)
      expect(shadowAt(s, -edge - H * 0.15, z)).toBe(0)
    }
  })

  it('책이 도는 동안 농도와 번지는 폭이 책등의 값에서 표지의 값으로 고르게 넘어간다', () => {
    const turning = [90, 70, 50, 30, 16].map((yaw) => shadowOf(centrePose({ yaw })))
    for (let i = 1; i < turning.length; i++) {
      expect(turning[i].strength).toBeLessThanOrEqual(turning[i - 1].strength)
      expect(turning[i].side).toBeGreaterThanOrEqual(turning[i - 1].side)
    }
  })

  it('뽑힌 책: 그림자가 책을 따라 앞으로 나오고, 줄을 잇던 넓힘은 걷힌다', () => {
    const rest = shadowOf(spinePose(120))
    const pulled = shadowOf(spinePose(120, { z: H * HOVER_PULL }))
    expect(pulled.z - rest.z).toBeCloseTo(H * HOVER_PULL, 6)
    expect(pulled.halfD).toBeCloseTo((H * BOOK.spineAspect) / 2, 6)
    expect(pulled.strength).toBeCloseTo(1, 6)
  })

  it('놓이는 움직임(앞으로 4%)에서도 그림자가 책 밑에 있다', () => {
    const placed = shadowOf(centrePose({ z: H * PLACE_LIFT }))
    expect(placed.z - shadowOf(centrePose()).z).toBeCloseTo(H * PLACE_LIFT, 6)
  })

  it('바닥에서 멀어진 책(올라오는 중, 집어 든 책): 옅어지고 넓어지다가 사라진다', () => {
    const rest = shadowOf(spinePose())
    const near = shadowOf(spinePose(0, { y: -H * FLOOR_SHADOW.liftFade * 0.3 }))
    const up = shadowOf(spinePose(0, { y: H * FLOOR_SHADOW.liftFade * 0.3 }))
    expect(near.strength).toBeLessThan(rest.strength)
    expect(near.strength).toBeGreaterThan(0)
    expect(near.side).toBeGreaterThan(rest.side)
    expect(up.strength).toBeCloseTo(near.strength, 6)
    expect(shadowOf(spinePose(0, { y: -H * FLOOR_SHADOW.liftFade })).strength).toBe(0)
    expect(shadowOf(spinePose(0, { y: -H * 0.55 })).strength).toBe(0)
  })
})

describe('floorShadowAt: 줄 전체의 바닥 그림자', () => {
  const books = Array.from({ length: 21 }, () => BOOK)
  const rowAt = (index: number, hoverIndex: number | null = null) => {
    const slots = computeShelfLayout(books, index, { bookHeight: H, gap: GAP, currentGap: 38 })
    const targets = bookPoseTargets(books, slots, { bookHeight: H, hoverIndex })
    return {
      slots,
      list: targets.map((t, i) =>
        shadowOf({ x: t.x, y: 0, z: t.z + t.pull, yaw: t.rotY + (i === index ? rad(CURRENT_REST.yaw) : 0) }),
      ),
    }
  }

  it('잘리는 선에서 그림자의 농도는 0에 가깝다(최대 농도의 5% 이하): 어느 책 앞에서든', () => {
    for (const rowBottom of [505, 515, 540, 600]) {
      const d = visibleFloorDepth({ ...STAGE, rowBottom })
      const o = { bookHeight: H, gap: GAP, depth: d }
      const poses = [
        spinePose(-300),
        spinePose(300, { z: H * HOVER_PULL }),
        centrePose(),
        centrePose({ z: H * PLACE_LIFT }),
        centrePose({ yaw: CURRENT_REST.yaw - 17 }),
        centrePose({ yaw: CURRENT_REST.yaw + 17 }),
        spinePose(500, { y: -H * 0.05 }),
      ]
      const list = poses.map((p) => contactShadow(p, BOOK, o))
      for (let x = -700; x <= 700; x += 5) {
        expect(floorShadowAt(list, x, d, o)).toBeLessThanOrEqual(0.05)
        expect(floorShadowAt(list, x, d * 1.2, o)).toBe(0)
      }
    }
  })

  it('책등이 보이는 책들의 그림자는 줄을 따라 고르다(책 앞과 책 사이에서 같은 농도, 겹쳐 진해지지 않는다)', () => {
    const { slots, list } = rowAt(10)
    // 가운데 책의 오른쪽 줄: 12번째 책의 가운데 ~ 20번째 책의 가운데
    for (const z of [1, depth * 0.25, depth * 0.5]) {
      const samples: number[] = []
      for (let x = slots[12].x; x <= slots[20].x; x += 2) samples.push(at(list, x, z))
      expect(Math.max(...samples) - Math.min(...samples)).toBeLessThan(1e-9)
      expect(Math.max(...samples)).toBeLessThanOrEqual(1)
      expect(samples[0]).toBeGreaterThan(0)
    }
  })

  it('어디서도 가장 진한 농도(1)를 넘지 않는다', () => {
    const { list } = rowAt(10, 13)
    for (let x = -700; x <= 700; x += 7) for (let z = -40; z <= depth; z += 6) expect(at(list, x, z)).toBeLessThanOrEqual(1)
  })

  it('1권이 가운데일 때 책이 없는 왼쪽 바닥에는 그림자가 없다', () => {
    const { list } = rowAt(0)
    const edge = (H * BOOK.coverAspect) / 2 + (H * BOOK.spineAspect) / 2
    for (let x = -700; x <= -edge - H * 0.15; x += 10) for (const z of [0, 20, 40, 60]) expect(at(list, x, z)).toBe(0)
  })

  it('서가 안쪽(책등 면 뒤)으로는 바닥이 끝나는 곳에서 다 옅어진다', () => {
    const { slots, list } = rowAt(10)
    const x = slots[14].x
    expect(at(list, x, 0)).toBeGreaterThan(0.9)
    expect(at(list, x, -H * FLOOR_SHADOW.back * 0.5)).toBeLessThan(at(list, x, 0))
    expect(at(list, x, -H * FLOOR_SHADOW.back)).toBe(0)
  })
})
