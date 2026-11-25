import { describe, expect, it } from 'vitest'
import { fieldBooks, fields } from '../src/data/fields'
import { facingBookBox, fieldsView, projectPoint, rowPlan, scrollRange, scrollStops, sizeOf, type BookSize } from '../src/fields3d/motion'
import {
  FIELDS_SCROLL,
  releaseVelocity,
  revealScroll,
  rubberBand,
  scrollMoving,
  stepScroll,
  stepTarget,
  type ScrollMotion,
} from '../src/fields3d/scroll'

const S = FIELDS_SCROLL
const MAX = 600

/** 멈출 때까지 16ms씩 보낸다. 지나간 자리들을 돌려준다 */
const run = (start: ScrollMotion, max = MAX, limitMs = 5000) => {
  let m = start
  const trail = [m.pos]
  for (let t = 0; t < limitMs && scrollMoving(m, max); t += 16) {
    m = stepScroll(m, 16, max)
    trail.push(m.pos)
  }
  return { end: m, trail, ms: (trail.length - 1) * 16 }
}

describe('끝의 저항 (rubberBand)', () => {
  it('범위 안에서는 손을 그대로 따라간다', () => {
    for (const x of [0, 1, 250, MAX]) expect(rubberBand(x, MAX)).toBe(x)
  })

  it('끝을 넘으면 넘은 것보다 덜 가고, 아무리 끌어도 한도를 넘지 않는다', () => {
    expect(rubberBand(MAX + 40, MAX)).toBeGreaterThan(MAX)
    expect(rubberBand(MAX + 40, MAX)).toBeLessThan(MAX + 40)
    expect(rubberBand(-40, MAX)).toBeLessThan(0)
    expect(rubberBand(-40, MAX)).toBeGreaterThan(-40)
    expect(rubberBand(MAX + 100000, MAX)).toBeLessThan(MAX + S.overscrollPx)
    expect(rubberBand(-100000, MAX)).toBeGreaterThan(-S.overscrollPx)
  })

  it('더 끌수록 더 가되 점점 덜 간다(끊기지 않는다)', () => {
    let prev = MAX
    let prevGain = Infinity
    for (let over = 20; over <= 400; over += 20) {
      const x = rubberBand(MAX + over, MAX)
      expect(x).toBeGreaterThan(prev)
      expect(x - prev).toBeLessThan(prevGain)
      prevGain = x - prev
      prev = x
    }
    // 양쪽이 같은 모양이다
    expect(rubberBand(-120, MAX)).toBeCloseTo(-(rubberBand(MAX + 120, MAX) - MAX), 9)
  })
})

describe('손을 뗄 때의 속도 (releaseVelocity)', () => {
  it('마지막 잠깐 동안의 움직임으로 잰다. 왼쪽으로 끌면(손이 왼쪽으로) 줄은 앞으로 간다(+)', () => {
    // 10ms마다 8px씩 왼쪽으로: 스크롤 속도 +0.8px/ms
    const samples = [0, 1, 2, 3, 4, 5].map((i) => ({ t: 1000 + i * 10, x: 500 - i * 8 }))
    expect(releaseVelocity(samples, 1050)).toBeCloseTo(0.8, 6)
    const right = samples.map((s, i) => ({ t: s.t, x: 500 + i * 8 }))
    expect(releaseVelocity(right, 1050)).toBeCloseTo(-0.8, 6)
  })

  it('끌다가 멈춘 뒤에 떼면 흐르지 않는다', () => {
    const samples = [0, 1, 2].map((i) => ({ t: 1000 + i * 10, x: 500 - i * 30 }))
    expect(releaseVelocity(samples, 1020 + S.velocityWindowMs + 50)).toBe(0)
    expect(releaseVelocity([], 1000)).toBe(0)
    expect(releaseVelocity([{ t: 1000, x: 3 }], 1000)).toBe(0)
  })

  it('아주 빠른 손짓은 상한으로 자른다', () => {
    const samples = [0, 1, 2].map((i) => ({ t: 1000 + i * 5, x: 900 - i * 300 }))
    expect(releaseVelocity(samples, 1010)).toBe(S.maxSpeed)
  })
})

describe('관성 (stepScroll)', () => {
  it('손을 떼면 같은 방향으로 조금 더 흐르다 점점 느려져 멈춘다', () => {
    const { end, trail, ms } = run({ pos: 100, vel: 1, target: null })
    expect(end.vel).toBe(0)
    expect(end.target).toBeNull()
    expect(end.pos).toBeGreaterThan(100 + 100)
    expect(end.pos).toBeLessThan(MAX)
    // 한 걸음마다 덜 간다
    const steps = trail.slice(1).map((x, i) => x - trail[i])
    steps.slice(1).forEach((d, i) => expect(d).toBeLessThanOrEqual(steps[i] + 1e-9))
    expect(ms).toBeGreaterThan(400)
    expect(ms).toBeLessThan(2500)
  })

  it('흐르는 거리는 속도 × 감속 시간에 가깝다(한 프레임 길이와 상관없이)', () => {
    const fine = run({ pos: 0, vel: 0.6, target: null }, 100000)
    expect(fine.end.pos).toBeCloseTo(0.6 * S.decayMs, -1)
    let m: ScrollMotion = { pos: 0, vel: 0.6, target: null }
    for (let i = 0; i < 400 && scrollMoving(m, 100000); i++) m = stepScroll(m, 50, 100000)
    expect(Math.abs(m.pos - fine.end.pos)).toBeLessThan(4)
  })

  it('속도가 없으면 움직이지 않는다', () => {
    const still: ScrollMotion = { pos: 120, vel: 0, target: null }
    expect(scrollMoving(still, MAX)).toBe(false)
    expect(stepScroll(still, 16, MAX)).toEqual(still)
  })

  it('끝에 닿으면 살짝 넘었다가 끝으로 되돌아와 멈춘다(과하지 않게)', () => {
    const { end, trail } = run({ pos: MAX - 60, vel: S.maxSpeed, target: null })
    expect(end.pos).toBe(MAX)
    expect(end.vel).toBe(0)
    const peak = Math.max(...trail)
    expect(peak).toBeGreaterThan(MAX)
    expect(peak - MAX).toBeLessThan(S.overscrollPx / 2)

    const left = run({ pos: 40, vel: -S.maxSpeed, target: null })
    expect(left.end.pos).toBe(0)
    expect(Math.min(...left.trail)).toBeLessThan(0)
    expect(Math.min(...left.trail)).toBeGreaterThan(-S.overscrollPx / 2)
  })

  it('끝 너머에서 놓으면(저항을 이기고 끌어 둔 자리) 끝으로 되돌아온다', () => {
    const { end, trail, ms } = run({ pos: MAX + 50, vel: 0, target: null })
    expect(end.pos).toBe(MAX)
    // 돌아오는 길에 반대쪽으로 지나치지 않는다
    expect(Math.min(...trail)).toBeGreaterThanOrEqual(MAX - 0.5)
    expect(ms).toBeLessThan(900)
    expect(run({ pos: -50, vel: 0, target: null }).end.pos).toBe(0)
  })

  it('끝 너머에서 바깥쪽으로 던져도 더 나가지 않고 되돌아온다', () => {
    const { end, trail } = run({ pos: MAX + 60, vel: S.maxSpeed, target: null })
    expect(end.pos).toBe(MAX)
    expect(Math.max(...trail)).toBeLessThanOrEqual(MAX + 60)
    const left = run({ pos: -60, vel: -S.maxSpeed, target: null })
    expect(left.end.pos).toBe(0)
    expect(Math.min(...left.trail)).toBeGreaterThanOrEqual(-60)
  })

  it('끝 너머에서 안쪽으로 던지면 그대로 흘러 들어간다(끝에 붙들리지 않는다)', () => {
    const { end } = run({ pos: MAX + 40, vel: -1, target: null })
    expect(end.pos).toBeLessThan(MAX - 100)
    expect(end.pos).toBeGreaterThan(0)
    expect(end.vel).toBe(0)
  })

  it('목표가 있으면(키보드로 한 권, 포커스 따라가기) 그 자리로 부드럽게 가서 정확히 멈춘다', () => {
    const { end, trail, ms } = run({ pos: 0, vel: 0, target: 224 })
    expect(end).toEqual({ pos: 224, vel: 0, target: null })
    expect(Math.max(...trail)).toBeLessThanOrEqual(224 + 0.5)
    trail.slice(1).forEach((x, i) => expect(x).toBeGreaterThanOrEqual(trail[i] - 1e-9))
    expect(ms).toBeGreaterThan(200)
    expect(ms).toBeLessThan(900)
  })
})

describe('한 권씩 넘기기 (stepTarget)', () => {
  const stops = [0, 224, 448, 600, 600, 600, 600]

  it('오른쪽은 다음 책이 맨 앞에 오는 자리, 왼쪽은 이전 책의 자리', () => {
    expect(stepTarget(0, 1, stops, MAX)).toBe(224)
    expect(stepTarget(224, 1, stops, MAX)).toBe(448)
    expect(stepTarget(448, -1, stops, MAX)).toBe(224)
  })

  it('책 사이에 멈춰 있었으면 가까운 다음(이전) 자리로 간다', () => {
    expect(stepTarget(100, 1, stops, MAX)).toBe(224)
    expect(stepTarget(100, -1, stops, MAX)).toBe(0)
    expect(stepTarget(500, 1, stops, MAX)).toBe(600)
    expect(stepTarget(500, -1, stops, MAX)).toBe(448)
  })

  it('양 끝에서 멈춘다', () => {
    expect(stepTarget(0, -1, stops, MAX)).toBe(0)
    expect(stepTarget(600, 1, stops, MAX)).toBe(600)
    // 끝 너머에 있었으면(되돌아오는 중) 끝으로
    expect(stepTarget(-20, -1, stops, MAX)).toBe(0)
    expect(stepTarget(630, 1, stops, MAX)).toBe(600)
  })

  it('세 권 이하(범위 0)는 움직이지 않는다', () => {
    expect(stepTarget(0, 1, [0, 0, 0], 0)).toBe(0)
    expect(stepTarget(0, -1, [0, 0, 0], 0)).toBe(0)
  })
})

describe('가려진 책이 보이게 넘기기 (revealScroll)', () => {
  const width = 818

  it('다 보이는 책이면 그대로 둔다', () => {
    expect(revealScroll(120, { left: 60, width: 180 }, width, MAX)).toBe(120)
  })

  it('오른쪽으로 넘친 책은 오른쪽 끝이 여백만큼 안으로 들어올 때까지 넘긴다', () => {
    const to = revealScroll(0, { left: 700, width: 180 }, width, MAX)
    expect(to).toBeCloseTo(700 + 180 + S.revealMarginPx - width, 9)
  })

  it('왼쪽으로 넘친 책은 왼쪽 끝이 여백만큼 안으로 들어올 때까지 되돌린다', () => {
    expect(revealScroll(400, { left: -90, width: 180 }, width, MAX)).toBeCloseTo(400 - 90 - S.revealMarginPx, 9)
  })

  it('범위를 넘지 않는다', () => {
    expect(revealScroll(580, { left: 760, width: 180 }, width, MAX)).toBe(MAX)
    expect(revealScroll(30, { left: -200, width: 180 }, width, MAX)).toBe(0)
    expect(revealScroll(0, { left: 900, width: 180 }, width, 0)).toBe(0)
  })
})

describe('멈춘 줄의 자리 (motion.ts: scrollStops · facingBookBox)', () => {
  const view = fieldsView({ width: 1020, height: 762 })
  const sizesOf = (name: string): BookSize[] => fieldBooks(fields.find((f) => f.name === name)!).map(sizeOf)
  const environment = sizesOf('환경') // 5권: 네 권 이상이라 끌어 넘긴다
  const art = sizesOf('예술')

  it('책마다 멈출 자리: 그 책이 첫 책의 자리에 오는 스크롤, 범위를 넘으면 끝', () => {
    const plan = rowPlan(environment)
    const max = scrollRange(environment, view)
    const stops = scrollStops(environment, view)
    expect(stops).toHaveLength(environment.length)
    expect(stops[0]).toBe(0)
    expect(stops[1]).toBeCloseTo(plan.facing[1] - environment[1].width / 2 - (plan.facing[0] - environment[0].width / 2), 9)
    stops.forEach((s, i) => {
      expect(s).toBeLessThanOrEqual(max + 1e-12)
      if (i) expect(s).toBeGreaterThanOrEqual(stops[i - 1])
    })
    expect(stops[stops.length - 1]).toBeCloseTo(max, 9)
  })

  it('세 권 이하는 멈출 자리가 모두 0이다', () => {
    expect(scrollStops(art, view)).toEqual([0, 0, 0])
  })

  it('멈춘 책의 화면 자리는 정면을 본 표지의 네 모서리를 감싸는 상자다', () => {
    const plan = rowPlan(environment)
    const box = facingBookBox(plan, environment, 1, view)
    const { width } = environment[1]
    const corners = [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ].map(([sx, sy]) => projectPoint(view, [plan.facing[1] + (sx * width) / 2, sy * 0.5, 0]))
    expect(box.left).toBeCloseTo(Math.min(...corners.map((c) => c.x)), 6)
    expect(box.top).toBeCloseTo(Math.min(...corners.map((c) => c.y)), 6)
    expect(box.left + box.width).toBeCloseTo(Math.max(...corners.map((c) => c.x)), 6)
    expect(box.top + box.height).toBeCloseTo(Math.max(...corners.map((c) => c.y)), 6)
    // 1440×900에서 표지는 화면에서 약 223×328px이고, 세로 가운데가 책 자리의 가운데 높이다
    expect(box.width).toBeGreaterThan(205)
    expect(box.width).toBeLessThan(230)
    expect(box.height).toBeGreaterThanOrEqual(311)
    expect(box.height).toBeLessThanOrEqual(330)
    expect(box.top + box.height / 2).toBeCloseTo(762 / 2, 6)
  })

  it('스크롤하면 상자가 꼭 그만큼 왼쪽으로 간다(세로와 크기는 그대로)', () => {
    const plan = rowPlan(environment)
    const a = facingBookBox(plan, environment, 2, view)
    const b = facingBookBox(plan, environment, 2, view, 0.5)
    expect(b.left).toBeCloseTo(a.left - 0.5 * view.pxPerUnit, 6)
    expect(b.top).toBeCloseTo(a.top, 6)
    expect(b.width).toBeCloseTo(a.width, 6)
    expect(b.height).toBeCloseTo(a.height, 6)
  })
})
