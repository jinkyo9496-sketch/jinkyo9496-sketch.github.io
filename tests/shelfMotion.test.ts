import { describe, expect, it } from 'vitest'
import { computeShelfLayout, visibleRadius } from '../src/shelf/layout'
import { books as realBooks } from '../src/data/books'
import { SETTLE_OPEN_MS, STEP_MOVE_MS, shelfMoveMs } from '../src/app/useScreen'
import { TILT_MAX_X, TILT_MAX_Y, tiltFor } from '../src/shelf/hover'
import {
  CURRENT_POP,
  CURRENT_REST,
  CURRENT_TURN,
  coverPointFrom,
  currentBookTurn,
  currentSilhouette,
  currentTurnOffset,
  EYE_LIFT,
  HOVER_PULL,
  PERSPECTIVE,
  PLACE_LIFT,
  RISE,
  bookPoseTargets,
  cameraFrustum,
  cubicBezier,
  focusBoxFor,
  isSettled,
  loadRange,
  omegaForSettle,
  placeOffset,
  placeTotalMs,
  riseOffset,
  riseTotalMs,
  springStep,
  rowSeenHalf,
  textureRanges,
  rowJumpStart,
} from '../src/shelf3d/motion'

const books = [
  { spineAspect: 0.08, coverAspect: 0.68 },
  { spineAspect: 0.1, coverAspect: 0.68 },
  { spineAspect: 0.06, coverAspect: 0.66 },
]
const H = 500
const slotsFor = (current: number) => computeShelfLayout(books, current, { bookHeight: H, gap: 30, currentGap: 40 })

describe('bookPoseTargets', () => {
  it('keeps the layout x of every book', () => {
    const slots = slotsFor(1)
    const poses = bookPoseTargets(books, slots, { bookHeight: H, hoverIndex: null })
    expect(poses.map((p) => p.x)).toEqual(slots.map((s) => s.x))
  })

  it('turns spine-out books a quarter turn and the current book to face front', () => {
    const poses = bookPoseTargets(books, slotsFor(1), { bookHeight: H, hoverIndex: null })
    expect(poses[0].rotY).toBeCloseTo(Math.PI / 2)
    expect(poses[1].rotY).toBe(0)
    expect(poses[2].rotY).toBeCloseTo(Math.PI / 2)
  })

  it('puts the spine face of spine-out books on the z=0 plane', () => {
    const poses = bookPoseTargets(books, slotsFor(1), { bookHeight: H, hoverIndex: null })
    // 책등이 정면일 때 상자의 앞뒤 깊이는 표지 폭이다
    expect(poses[0].z + (H * books[0].coverAspect) / 2).toBeCloseTo(0)
    expect(poses[2].z + (H * books[2].coverAspect) / 2).toBeCloseTo(0)
  })

  it('brings the cover of the current book forward by 12% of the book height', () => {
    const poses = bookPoseTargets(books, slotsFor(1), { bookHeight: H, hoverIndex: null })
    expect(CURRENT_POP).toBe(0.12)
    expect(poses[1].z + (H * books[1].spineAspect) / 2).toBeCloseTo(H * 0.12)
  })

  it('pulls only the hovered spine-out book toward the viewer by 20% of the book height', () => {
    const poses = bookPoseTargets(books, slotsFor(1), { bookHeight: H, hoverIndex: 2 })
    expect(HOVER_PULL).toBe(0.2)
    expect(poses.map((p) => p.pull)).toEqual([0, 0, H * 0.2])
  })

  it('does not pull the current book when it is hovered', () => {
    const poses = bookPoseTargets(books, slotsFor(1), { bookHeight: H, hoverIndex: 1 })
    expect(poses.map((p) => p.pull)).toEqual([0, 0, 0])
  })
})

describe('springStep (critically damped)', () => {
  const run = (seconds: number, omega: number, dt = 1 / 60) => {
    let s = { x: 0, v: 0 }
    let max = 0
    for (let t = 0; t < seconds - 1e-9; t += dt) {
      s = springStep(s, 1, omega, dt)
      max = Math.max(max, s.x)
    }
    return { ...s, max }
  }

  it('starts gently: the first frame covers far less than a linear move would', () => {
    const omega = omegaForSettle(0.7)
    const first = springStep({ x: 0, v: 0 }, 1, omega, 1 / 60)
    expect(first.x).toBeGreaterThan(0)
    expect(first.x).toBeLessThan((1 / 60 / 0.7) * 0.6)
    expect(first.v).toBeGreaterThan(0)
  })

  it('is within 1% of the target after the settle time and never overshoots', () => {
    const { x, max } = run(0.7, omegaForSettle(0.7))
    expect(Math.abs(1 - x)).toBeLessThan(0.011)
    expect(max).toBeLessThanOrEqual(1)
  })

  it('gives the same result whatever the frame length', () => {
    const omega = omegaForSettle(0.7)
    const a = run(0.4, omega, 1 / 60)
    const b = run(0.4, omega, 1 / 20)
    expect(a.x).toBeCloseTo(b.x, 6)
  })

  it('stays stable with a very long frame (a hidden tab waking up)', () => {
    const s = springStep({ x: 0, v: 50 }, 1, omegaForSettle(0.4), 2)
    expect(s.x).toBeCloseTo(1, 4)
    expect(Math.abs(s.v)).toBeLessThan(1e-3)
  })

  it('carries velocity when the target changes mid-flight', () => {
    const omega = omegaForSettle(0.7)
    let s = { x: 0, v: 0 }
    for (let i = 0; i < 10; i++) s = springStep(s, 1, omega, 1 / 60)
    const turned = springStep(s, 0, omega, 1 / 60)
    // 방향을 바꿔도 바로 뒤로 튀지 않고 속도가 이어진다
    expect(turned.v).toBeLessThan(s.v)
    expect(turned.v).toBeGreaterThan(-s.v * 5)
  })
})

describe('isSettled', () => {
  it('is true only when both the distance and the speed are small', () => {
    expect(isSettled({ x: 1.0001, v: 0.001 }, 1, 0.01)).toBe(true)
    expect(isSettled({ x: 1.5, v: 0 }, 1, 0.01)).toBe(false)
    expect(isSettled({ x: 1, v: 3 }, 1, 0.01)).toBe(false)
  })
})

describe('cameraFrustum', () => {
  const input = { viewportWidth: 1440, viewportHeight: 820, distance: 1400, centreY: 480, eyeLift: 20, near: 14 }

  it('maps the z=0 plane to CSS pixels: the viewport edges scaled to the near plane', () => {
    const f = cameraFrustum(input)
    const k = input.near / input.distance
    expect(f.left).toBeCloseTo(-720 * k)
    expect(f.right).toBeCloseTo(720 * k)
    // 책의 세로 중심(y=0)은 화면 위에서 centreY만큼 내려온 곳, 눈은 그보다 eyeLift만큼 위
    expect(f.top).toBeCloseTo((480 - 20) * k)
    expect(f.bottom).toBeCloseTo((480 - 820 - 20) * k)
  })

  it('keeps the frustum height equal to the viewport height', () => {
    const f = cameraFrustum(input)
    expect((f.top - f.bottom) * (input.distance / input.near)).toBeCloseTo(820)
  })
})

describe('loadRange', () => {
  it('covers the visible books plus a margin, clamped to the series', () => {
    expect(loadRange(10, 8, 47, 3)).toEqual({ from: 0, to: 21 })
    expect(loadRange(45, 8, 47, 3)).toEqual({ from: 34, to: 46 })
    expect(loadRange(20, 5, 47, 2)).toEqual({ from: 13, to: 27 })
  })
})

describe('cubicBezier', () => {
  it('passes through both ends and matches a linear curve', () => {
    const linear = cubicBezier(0.25, 0.25, 0.75, 0.75)
    expect(linear(0)).toBe(0)
    expect(linear(1)).toBe(1)
    expect(linear(0.3)).toBeCloseTo(0.3, 4)
  })

  it('follows the shelf easing: a gentle start, most of the way by the middle', () => {
    const ease = cubicBezier(0.32, 0.12, 0.2, 1)
    expect(ease(0.1)).toBeLessThan(0.1)
    expect(ease(0.5)).toBeGreaterThan(0.7)
    expect(ease(0.9)).toBeGreaterThan(0.98)
    // 시간에 따라 줄어들지 않는다
    let last = 0
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const v = ease(Math.min(1, t))
      expect(v).toBeGreaterThanOrEqual(last - 1e-6)
      last = v
    }
  })
})

describe('placeOffset (the arriving centre book)', () => {
  it('takes 1000ms for a normal 680ms step and scales with slower moves', () => {
    expect(PLACE_LIFT).toBe(0.04)
    expect(placeTotalMs(680)).toBeCloseTo(1000)
    expect(placeTotalMs(900)).toBeCloseTo(1323.5, 0)
  })

  it('comes forward while the book travels, pauses about 0.15s, then settles', () => {
    expect(placeOffset(0, 680)).toBe(0)
    expect(placeOffset(300, 680)).toBeGreaterThan(0.5)
    // 620ms에 다 나와서 780ms까지 멈춰 있다
    expect(placeOffset(620, 680)).toBeCloseTo(1, 3)
    expect(placeOffset(700, 680)).toBe(1)
    expect(placeOffset(779, 680)).toBe(1)
    expect(placeOffset(890, 680)).toBeGreaterThan(0)
    expect(placeOffset(890, 680)).toBeLessThan(1)
    expect(placeOffset(1000, 680)).toBe(0)
    expect(placeOffset(5000, 680)).toBe(0)
  })

  it('stretches with the move time (a book opening after a glide)', () => {
    expect(placeOffset(800, 900)).toBeLessThan(1)
    expect(placeOffset(900, 900)).toBe(1)
    expect(placeOffset(1020, 900)).toBe(1)
    expect(placeOffset(1324, 900)).toBe(0)
  })
})

describe('riseOffset (entering the shelf screen)', () => {
  it('starts 55% of the book height below and takes 760ms after a 180ms wait', () => {
    expect(RISE.from).toBe(0.55)
    expect(riseOffset(0, 0)).toBe(1)
    expect(riseOffset(180, 0)).toBe(1)
    expect(riseOffset(400, 0)).toBeGreaterThan(0)
    expect(riseOffset(400, 0)).toBeLessThan(0.5)
    expect(riseOffset(940, 0)).toBe(0)
  })

  it('staggers by 40ms per book of distance from the centre, up to 8 books', () => {
    expect(riseOffset(180 + 3 * 40, 3)).toBe(1)
    expect(riseOffset(180 + 3 * 40 + 760, 3)).toBe(0)
    expect(riseOffset(600, 3)).toBeGreaterThan(riseOffset(600, 1))
    expect(riseOffset(700, 20)).toBe(riseOffset(700, 8))
    expect(riseTotalMs()).toBe(180 + 8 * 40 + 760)
    expect(riseOffset(riseTotalMs(), 30)).toBe(0)
  })
})

describe('focusBoxFor (the focus ring over a book)', () => {
  const slots = slotsFor(1)

  it('covers the spine exactly where the layout puts it', () => {
    expect(focusBoxFor(slots[2], H)).toEqual({ x: slots[2].x, y: 0, width: slots[2].faceWidth, height: H })
  })

  it('grows with the centre cover, which sits 12% of the book height nearer', () => {
    const box = focusBoxFor(slots[1], H)
    const scale = PERSPECTIVE / (PERSPECTIVE - CURRENT_POP)
    expect(box.x).toBeCloseTo(0)
    expect(box.width).toBeCloseTo(slots[1].faceWidth * scale)
    expect(box.height).toBeCloseTo(H * scale)
    // 눈높이가 책 중심보다 조금 위라서, 가까운 책은 아주 조금 아래로 보인다
    expect(box.y).toBeCloseTo(H * EYE_LIFT * (scale - 1))
  })
})

describe('shelfMoveMs (how long one move takes)', () => {
  it('is 680ms for a single step', () => {
    expect(STEP_MOVE_MS).toBe(680)
    expect(shelfMoveMs({ gliding: false, glidePace: 200, settling: false })).toBe(680)
  })
  it('follows the glide pace while the books run past', () => {
    expect(shelfMoveMs({ gliding: true, glidePace: 200, settling: false })).toBe(200)
    expect(shelfMoveMs({ gliding: true, glidePace: 430, settling: true })).toBe(430)
  })
  it('is 900ms for the book that opens where a glide stopped', () => {
    expect(shelfMoveMs({ gliding: false, glidePace: 200, settling: true })).toBe(SETTLE_OPEN_MS)
    expect(SETTLE_OPEN_MS).toBe(900)
  })
})

describe('the current book as a 3D object (rest pose and pointer turn)', () => {
  const coverW = H * 0.68
  const spineW = H * 0.09
  const at = (yaw: number) => currentSilhouette({ coverWidth: coverW, spineWidth: spineW, bookHeight: H, yaw })

  it('rests turned a little so that the spine shows, with the cover still facing us', () => {
    expect(CURRENT_REST.yaw).toBeGreaterThan(8)
    expect(CURRENT_REST.yaw).toBeLessThanOrEqual(20)
    expect(Math.abs(CURRENT_REST.pitch)).toBeLessThanOrEqual(2)
    expect(currentBookTurn(null)).toEqual(CURRENT_REST)
  })

  it('shows a clear sliver of the spine at rest and no fore-edge', () => {
    const rest = at(CURRENT_REST.yaw)
    // 책등의 1/8 이상이 보인다
    expect(rest.spine).toBeGreaterThan(spineW / 8)
    expect(rest.foreEdge).toBe(0)
    // 표지는 여전히 거의 제 폭으로 보인다
    expect(rest.cover).toBeGreaterThan(coverW * 0.95)
  })

  it('shows neither side when the book is flat (why a rest pose is needed)', () => {
    expect(at(0)).toMatchObject({ spine: 0, foreEdge: 0 })
  })

  it('turns with the pointer: left edge shows more spine, right edge shows the fore-edge', () => {
    const left = currentBookTurn({ x: -1, y: 0 })
    const right = currentBookTurn({ x: 1, y: 0 })
    expect(left).toEqual({ yaw: CURRENT_TURN.yaw, pitch: 0 })
    expect(right).toEqual({ yaw: -CURRENT_TURN.yaw, pitch: 0 })
    expect(CURRENT_TURN.yaw).toBeGreaterThanOrEqual(14)
    expect(at(left.yaw).spine).toBeGreaterThan(at(CURRENT_REST.yaw).spine)
    expect(at(right.yaw).foreEdge).toBeGreaterThan(spineW / 8)
    expect(at(right.yaw).spine).toBe(0)
  })

  it('faces us squarely with the pointer on the middle of the cover, and moves evenly in between', () => {
    expect(currentBookTurn({ x: 0, y: 0 })).toEqual({ yaw: 0, pitch: 0 })
    expect(currentBookTurn({ x: -0.5, y: 0 }).yaw).toBeCloseTo(CURRENT_TURN.yaw / 2)
  })

  it('lifts the edge under the pointer: top of the cover → the top comes forward (pitch +)', () => {
    expect(CURRENT_TURN.pitch).toBe(3)
    expect(currentBookTurn({ x: 0, y: -1 })).toEqual({ yaw: 0, pitch: 3 })
    expect(currentBookTurn({ x: 0, y: 1 })).toEqual({ yaw: 0, pitch: -3 })
  })

  it('clamps beyond the edges of the cover', () => {
    expect(currentBookTurn({ x: -3, y: 9 })).toEqual({ yaw: CURRENT_TURN.yaw, pitch: -CURRENT_TURN.pitch })
    expect(currentBookTurn({ x: 3, y: -9 })).toEqual({ yaw: -CURRENT_TURN.yaw, pitch: CURRENT_TURN.pitch })
  })

  it('reads the pointer position on the cover back from the fallback tilt (tiltFor is unchanged)', () => {
    const p = coverPointFrom(tiltFor({ x: coverW / 4, y: -H / 4 }, coverW, H))
    expect(p.x).toBeCloseTo(0.5, 2)
    expect(p.y).toBeCloseTo(-0.5, 2)
    expect(coverPointFrom(tiltFor({ x: -coverW, y: H }, coverW, H))).toEqual({ x: -1, y: 1 })
    expect(TILT_MAX_Y).toBe(5)
    expect(TILT_MAX_X).toBe(3)
  })

  it('is the offset from the rest pose that the hover spring carries (zero without a pointer)', () => {
    expect(currentTurnOffset(null)).toEqual({ yaw: 0, pitch: 0 })
    const tilt = tiltFor({ x: coverW / 2, y: 0 }, coverW, H)
    expect(currentTurnOffset(tilt).yaw).toBeCloseTo(-CURRENT_TURN.yaw - CURRENT_REST.yaw)
  })

  it('frames the turned cover with the focus ring: centred, containing the whole silhouette', () => {
    const slot = slotsFor(1)[1]
    const flat = focusBoxFor(slot, H)
    const box = focusBoxFor(slot, H, H * books[1].spineAspect)
    const s = currentSilhouette({ coverWidth: slot.faceWidth, spineWidth: H * books[1].spineAspect, bookHeight: H, yaw: CURRENT_REST.yaw })
    expect(box.x).toBe(0)
    expect(box.width).toBeCloseTo(2 * Math.max(-s.left, s.right))
    expect(box.height).toBeCloseTo(s.bottom - s.top)
    expect(box.height).toBeGreaterThan(flat.height)
    expect(box.width).toBeGreaterThan(flat.width * 0.98)
    // 책등 쪽은 그대로다
    expect(focusBoxFor(slotsFor(1)[2], H, 99)).toEqual(focusBoxFor(slotsFor(1)[2], H))
  })
})

describe('textureRanges: 그림을 들고 있을 책의 범위(웰컴 ↔ 서가의 전환 도중에는 새로 받지 않는다)', () => {
  // 1440×900에서의 실제 치수와 실제 책 전 권
  const stage = { bookHeight: 594, gap: 33.08, currentGap: 47.25, lineupLeft: -700, halfWidth: 720, margin: 4 }
  const layout = (index: number, closed: boolean) =>
    computeShelfLayout(realBooks, index, { bookHeight: stage.bookHeight, gap: stage.gap, currentGap: stage.currentGap, closed })
  const count = realBooks.length

  it('near: 가운데 책을 펼친 배치에서 화면에 걸친 책은 모두 든다(쉬고 있는 서가)', () => {
    for (let index = 0; index < count; index++) {
      const { near } = textureRanges(realBooks, index, stage)
      const seenOpen = loadRange(index, visibleRadius(layout(index, false), index, 720), count, 0)
      expect(near.from).toBeLessThanOrEqual(Math.max(0, seenOpen.from - 4))
      expect(near.to).toBeGreaterThanOrEqual(Math.min(count - 1, seenOpen.to + 4))
    }
  })

  it('near: 책등만 보이는 배치(지나가는 중·꽂힘·밀림)에서 화면에 걸친 책도 모두 든다: 배치가 바뀌어도 범위는 그대로다', () => {
    // 배치(펼침·책등·줄)는 이 계산의 입력이 아니다: 가운데 책이 그대로면 범위가 같다 → 전환 도중에 새로 받는 그림이 없다
    for (let index = 0; index < count; index++) {
      const { near } = textureRanges(realBooks, index, stage)
      const seenClosed = loadRange(index, visibleRadius(layout(index, true), index, 720), count, 0)
      expect(near.from).toBeLessThanOrEqual(Math.max(0, seenClosed.from - 4))
      expect(near.to).toBeGreaterThanOrEqual(Math.min(count - 1, seenClosed.to + 4))
    }
  })

  it('near: 줄이 풀릴 때 화면으로 들어오는 책(rowJumpStart가 건너뛰지 않는 책)은 모두 든다: 그림 없는 책이 화면을 지나가지 않는다', () => {
    const seen = rowSeenHalf(720, stage.bookHeight)
    const lined = computeShelfLayout(realBooks, 0, { bookHeight: stage.bookHeight, gap: stage.gap, lineupLeft: stage.lineupLeft })
    for (let index = 0; index < count; index++) {
      const { near, line } = textureRanges(realBooks, index, stage)
      const held = (i: number) => (i >= near.from && i <= near.to) || (i >= line!.from && i <= line!.to)
      const centred = layout(index, true)
      centred.forEach((slot, i) => {
        const start = rowJumpStart(lined[i].x, slot.x, seen)
        // 줄에서 보이던 책(제자리에서 밀려 나간다)이거나, 화면 안으로 들어오는 책
        const crossesScreen = start !== slot.x || Math.abs(slot.x) < seen
        if (crossesScreen) expect(held(i), `index ${index}, book ${i}`).toBe(true)
      })
      // 올라갈 때(줄을 설 때)도 같다
      lined.forEach((slot, i) => {
        const start = rowJumpStart(centred[i].x, slot.x, seen)
        if (start !== slot.x || Math.abs(slot.x) < seen) expect(held(i), `up: index ${index}, book ${i}`).toBe(true)
      })
    }
  })

  it('line: 웰컴의 줄에서 화면에 걸친 책(1권부터)과 둘레. 가운데 책이 몇 권이든 같다(서가에서도 늘 들고 있는다)', () => {
    const first = textureRanges(realBooks, 0, stage).line!
    expect(first.from).toBe(0)
    // 1440px에서 16~18권쯤이 걸치고 둘레 4권(2026-11-25: 책등을 인쇄용 표지의 실제 폭으로 바꾼 뒤 한두 권 줄었다)
    expect(first.to).toBeGreaterThanOrEqual(15 + 4 - 1)
    expect(first.to).toBeLessThanOrEqual(19 + 4)
    for (let index = 0; index < count; index++) expect(textureRanges(realBooks, index, stage).line).toEqual(first)
  })

  it('줄의 자리를 모르면(lineupLeft 없음) line은 없다', () => {
    expect(textureRanges(realBooks, 5, { ...stage, lineupLeft: undefined }).line).toBeNull()
  })
})

describe('rowJumpStart: 줄을 서거나 풀 때 책이 출발하는 자리(먼 책은 사이를 건너뛴다)', () => {
  const SEEN = 900 // 이 안(가운데에서)이면 화면에 보이는 것으로 본다

  it('지금 보이는 책은 제자리에서 출발한다(끊기지 않고 밀려 나간다)', () => {
    expect(rowJumpStart(-600, 3100, SEEN)).toBe(-600)
    expect(rowJumpStart(0, 3700, SEEN)).toBe(0)
  })

  it('보이지 않는 곳에서 보이지 않는 곳으로 가는 책은 바로 도착한 자리에 있다(화면을 지나가지 않는다)', () => {
    expect(rowJumpStart(-2000, 1700, SEEN)).toBe(1700)
    expect(rowJumpStart(1500, 2600, SEEN)).toBe(2600)
  })

  it('보이지 않던 책이 화면 안으로 올 때: 가까우면 제자리에서, 멀면 화면 폭 하나(2 × SEEN)만큼 떨어진 곳에서 출발한다', () => {
    // 가깝다: 그대로
    expect(rowJumpStart(-1000, -300, SEEN)).toBe(-1000)
    // 멀다(왼쪽에서 3,700px): 도착할 자리의 왼쪽 1,800px에서
    expect(rowJumpStart(-4400, -700, SEEN)).toBe(-2500)
    expect(rowJumpStart(-3000, 700, SEEN)).toBe(-1100)
    // 오른쪽에서 오는 책도 같다
    expect(rowJumpStart(4000, 300, SEEN)).toBe(2100)
  })

  it('멀리서 오는 책들은 같은 거리에서 출발한다: 줄이 흐트러지지 않고, 출발하는 자리는 모두 화면 밖이다', () => {
    const targets = [-700, -620, 0, 640, 720]
    const starts = targets.map((to) => rowJumpStart(to - 3700, to, SEEN))
    starts.forEach((start, i) => {
      expect(targets[i] - start).toBe(2 * SEEN)
      expect(start).toBeLessThanOrEqual(-SEEN)
    })
  })
})
