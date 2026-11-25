import { describe, expect, it } from 'vitest'
import { BOOK_CLOSE_MS, BOOK_OPEN_MS, BOOK_TURN_MS } from '../src/app/screen'
import {
  PAGE,
  PAGE_CLOSE,
  PAGE_OPEN,
  PAGE_TURN,
  PERSPECTIVE,
  pageAmount,
  pageOffLeft,
  pagePointerTurn,
  pagePose,
  spreadSpot,
  pageSpot,
  pickUpPose,
  projectPose,
  returnPose,
  returnSettle,
  sweepInOffset,
  sweepOutOffset,
  sweepPlan,
  turnEnterPose,
  turnExitPose,
  type Pose6,
  type PageView,
  MOTION,
} from '../src/shelf3d/motion'

const view: PageView = { width: 1440, height: 820, centreY: 380, bookHeight: 541 }
const ASPECT = 0.6812
const deg = (rad: number) => (rad * 180) / Math.PI
const shelfPose: Pose6 = { x: 0, y: 0, z: 40, yaw: (16 * Math.PI) / 180, pitch: 0, roll: 0 }

describe('page spot: where the floating book sits', () => {
  it('sits in the left part of the screen, large', () => {
    const spot = pageSpot(view, ASPECT)
    expect(spot.x).toBeCloseTo(1440 * PAGE.centreX)
    expect(spot.y).toBeCloseTo(820 * PAGE.centreY)
    expect(spot.height).toBeCloseTo(820 * PAGE.height)
    // 제목 띠 아래의 판 안에, 아래 조작부 위에 들어가는 크기(서가에서와 비슷하거나 조금 작다)
    expect(spot.height / 820).toBeGreaterThanOrEqual(0.58)
    expect(spot.height / 820).toBeLessThanOrEqual(0.64)
    // 표지가 화면 왼쪽 40% 안에 든다
    expect(spot.x + (spot.height * ASPECT) / 2).toBeLessThan(1440 * 0.45)
  })

  it('shrinks on a narrow, tall screen so the cover keeps to its share of the width', () => {
    const spot = pageSpot({ ...view, width: 900, height: 1000 }, ASPECT)
    expect(spot.height * ASPECT).toBeCloseTo(900 * PAGE.maxWidth)
    expect(spot.height).toBeLessThan(1000 * PAGE.height)
  })
})

describe('page pose: the floating book in the scene', () => {
  it('projects back onto its spot at its size (same camera as the shelf)', () => {
    const pose = pagePose(view, ASPECT)
    const spot = pageSpot(view, ASPECT)
    const seen = projectPose(view, pose)
    expect(seen.x).toBeCloseTo(spot.x, 3)
    expect(seen.y).toBeCloseTo(spot.y, 3)
    expect(seen.height).toBeCloseTo(spot.height, 3)
  })

  it('is placed in depth rather than scaled (near the shelf plane, short of the eye)', () => {
    const pose = pagePose(view, ASPECT)
    expect(pose.z).toBeGreaterThan(-view.bookHeight * PERSPECTIVE * 0.2)
    expect(pose.z).toBeLessThan(view.bookHeight * PERSPECTIVE * 0.5)
  })

  it('is turned so the spine reads and leans back so the bottom of the book shows', () => {
    const pose = pagePose(view, ASPECT)
    expect(deg(pose.yaw)).toBeCloseTo(PAGE.rest.yaw)
    expect(deg(pose.pitch)).toBeCloseTo(PAGE.rest.pitch)
    expect(deg(pose.roll)).toBeCloseTo(PAGE.rest.roll)
    // 책은 화면 왼쪽에 있어 시선이 이미 비스듬하다: 그 각보다 더 돌아야 책등이 보인다
    const sightAngle = deg(Math.atan2(-pose.x, view.bookHeight * PERSPECTIVE - pose.z))
    expect(PAGE.rest.yaw).toBeGreaterThan(sightAngle + 8)
    // 뒤로 누워 있다(윗쪽이 멀다): 아랫면이 보인다
    expect(PAGE.rest.pitch).toBeLessThanOrEqual(-4)
    expect(PAGE.rest.pitch).toBeGreaterThanOrEqual(-12)
    // 책등이 넓게 보이도록 돌아 있다
    expect(PAGE.rest.yaw).toBeGreaterThanOrEqual(28)
    expect(Math.abs(PAGE.rest.roll)).toBeLessThanOrEqual(5)
  })

  it('follows the pointer by a few degrees and rests without it', () => {
    expect(pagePointerTurn(null)).toEqual({ yaw: 0, pitch: 0 })
    expect(pagePointerTurn({ x: 0, y: 0 })).toEqual({ yaw: 0, pitch: 0 })
    const far = pagePointerTurn({ x: 1, y: -1 })
    expect(far).toEqual({ yaw: PAGE.turn.yaw, pitch: -PAGE.turn.pitch })
    expect(pagePointerTurn({ x: 9, y: -9 })).toEqual(far)
    expect(PAGE.turn.yaw).toBeLessThanOrEqual(6)
    expect(PAGE.turn.pitch).toBeLessThanOrEqual(6)
  })
})

describe('opening: the book is picked up, then moves to its spot', () => {
  const to = pagePose(view, ASPECT)
  const at = (ms: number) => pickUpPose(shelfPose, to, ms, view.bookHeight)

  it('starts exactly where the book stands on the shelf and ends exactly at the spot', () => {
    expect(at(0)).toEqual(shelfPose)
    expect(at(-50)).toEqual(shelfPose)
    const end = at(PAGE_OPEN.total)
    for (const key of ['x', 'y', 'z', 'yaw', 'pitch', 'roll'] as const) expect(end[key]).toBeCloseTo(to[key], 6)
    expect(at(PAGE_OPEN.total + 500)).toEqual(end)
  })

  it('first comes toward the viewer and takes the leaning pose where it stands, then moves aside', () => {
    const lifted = at(PAGE_OPEN.slideAt)
    expect(lifted.z).toBeGreaterThan(shelfPose.z + (to.z - shelfPose.z) * 0.3)
    // 앞으로 나온 만큼 커 보이므로, 윗쪽이 제목 띠에 닿지 않게 조금 내려와 있다
    expect(lifted.y).toBeLessThan(shelfPose.y)
    const grown = PERSPECTIVE / (PERSPECTIVE - PAGE_OPEN.forward)
    expect(PAGE_OPEN.drop).toBeGreaterThanOrEqual((grown - 1) / 2)
    expect(PAGE_CLOSE.drop).toBe(PAGE_OPEN.drop)
    expect(PAGE_CLOSE.lift).toBe(PAGE_OPEN.forward)
    // 그 자리에서 책 페이지의 자세가 된다. 들린 뒤부터 닿을 때까지 한 번 조금 돌며 기울 뿐이고(nudge), 닿으면 그 자세 그대로다
    const rad = (deg: number) => (deg * Math.PI) / 180
    expect(Math.abs(lifted.yaw - to.yaw)).toBeLessThanOrEqual(rad(MOTION.nudge.yaw) + 1e-9)
    expect(Math.abs(lifted.pitch - to.pitch)).toBeLessThanOrEqual(rad(MOTION.nudge.pitch) + 1e-9)
    expect(Math.abs(lifted.roll - to.roll)).toBeLessThanOrEqual(rad(MOTION.nudge.roll) + 1e-9)
    const arrived = at(PAGE_OPEN.slideAt + PAGE_OPEN.slide)
    expect(arrived.yaw).toBeCloseTo(to.yaw, 6)
    expect(arrived.pitch).toBeCloseTo(to.pitch, 6)
    expect(arrived.roll).toBeCloseTo(to.roll, 6)
    // 한 번만 움직인다: 더해진 각은 올라갔다가 내려올 뿐, 다시 올라가지 않는다
    let turns = 0
    let prev = 0
    let rising = true
    for (let ms = PAGE_OPEN.lift; ms <= PAGE_OPEN.slideAt + PAGE_OPEN.slide; ms += 10) {
      const extra = Math.abs(at(ms).yaw - to.yaw)
      if (rising && extra < prev - 1e-9) rising = false
      else if (!rising && extra > prev + 1e-9) turns++
      prev = extra
    }
    expect(turns).toBe(0)
    expect(lifted.x).toBeCloseTo(0)
    const moving = at(PAGE_OPEN.slideAt + PAGE_OPEN.slide / 2)
    expect(moving.x).toBeLessThan(to.x * 0.3)
    expect(moving.x).toBeGreaterThan(to.x)
  })

  it('never jumps: neighbouring frames stay close', () => {
    let prev = at(0)
    for (let ms = 16; ms <= PAGE_OPEN.total; ms += 16) {
      const next = at(ms)
      expect(Math.abs(next.x - prev.x)).toBeLessThan(30)
      expect(Math.abs(next.z - prev.z)).toBeLessThan(30)
      expect(Math.abs(deg(next.yaw - prev.yaw))).toBeLessThan(3)
      prev = next
    }
  })

  it('runs in order: pick-up, then the sweep, then the page comes in (and fits the input lock)', () => {
    expect(PAGE_OPEN.lift).toBeGreaterThanOrEqual(400)
    expect(PAGE_OPEN.lift).toBeLessThanOrEqual(500)
    expect(PAGE_OPEN.slideAt + PAGE_OPEN.slide).toBeLessThanOrEqual(PAGE_OPEN.total)
    expect(PAGE_OPEN.sweepAt + PAGE_OPEN.maxStagger + PAGE_OPEN.sweep).toBeLessThanOrEqual(PAGE_OPEN.total)
    // 책이 다 쓸려 나간 뒤에야 책 페이지가 들어오고, 든 책이 자리로 옮겨 간다
    expect(PAGE_OPEN.sweepAt).toBeGreaterThanOrEqual(PAGE_OPEN.lift * 0.6)
    expect(PAGE_OPEN.pageAt).toBeGreaterThanOrEqual(PAGE_OPEN.sweepAt + PAGE_OPEN.maxStagger + PAGE_OPEN.sweep - 50)
    // 책 페이지가 거의 다 들어온 뒤에 책이 자리로 옮겨 간다
    expect(PAGE_OPEN.slideAt).toBeGreaterThanOrEqual(PAGE_OPEN.pageAt + PAGE_OPEN.pageIn * 0.8)
    expect(PAGE_OPEN.total).toBeLessThanOrEqual(2500)
    expect(PAGE_OPEN.total).toBeLessThanOrEqual(BOOK_OPEN_MS)
  })
})

describe('the other books sweep away to the left', () => {
  // 가운데(3번)를 뺀 책등이 왼쪽부터 놓여 있다. 양 끝의 둘은 화면 밖
  const xs = [-2000, -300, -200, 0, 200, 300, 2000]
  const plan = sweepPlan(xs, 3, 720, 500)

  it('takes only the books on screen, the featured book aside', () => {
    expect(plan.count).toBe(4)
    expect(plan.books[3]).toBeNull()
    expect(plan.books[0]).toBeNull()
    expect(plan.books[6]).toBeNull()
  })

  it('goes in a cascade from the left end, so no book runs into one that has not left yet', () => {
    expect([1, 2, 4, 5].map((i) => plan.books[i]!.rank)).toEqual([0, 1, 2, 3])
  })

  it('carries every book past the left edge', () => {
    for (const i of [1, 2, 4, 5]) expect(xs[i] - plan.books[i]!.travel).toBeLessThanOrEqual(-720 - 500)
  })

  it('each book accelerates out, one after another (25–35ms apart)', () => {
    expect(PAGE_OPEN.stagger).toBeGreaterThanOrEqual(25)
    expect(PAGE_OPEN.stagger).toBeLessThanOrEqual(35)
    const t0 = PAGE_OPEN.sweepAt
    expect(sweepOutOffset(t0, 0, 4)).toBe(0)
    expect(sweepOutOffset(t0 + PAGE_OPEN.sweep, 0, 4)).toBe(1)
    // 가속: 절반의 시간에 절반보다 덜 갔다
    expect(sweepOutOffset(t0 + PAGE_OPEN.sweep / 2, 0, 4)).toBeLessThan(0.35)
    // 다음 책은 한 박자 늦다
    expect(sweepOutOffset(t0 + PAGE_OPEN.stagger, 1, 4)).toBe(0)
    expect(sweepOutOffset(t0 + PAGE_OPEN.stagger + 100, 1, 4)).toBeCloseTo(sweepOutOffset(t0 + 100, 0, 4), 6)
    // 앞선 책이 늘 더 멀리 가 있다
    for (let ms = t0; ms < PAGE_OPEN.total; ms += 20) expect(sweepOutOffset(ms, 0, 4)).toBeGreaterThanOrEqual(sweepOutOffset(ms, 1, 4))
    expect(sweepOutOffset(PAGE_OPEN.total, 3, 4)).toBe(1)
  })

  it('squeezes the stagger when many books are on screen, so all are gone in time', () => {
    expect(sweepOutOffset(PAGE_OPEN.total, 39, 40)).toBe(1)
  })

  it('comes back in the reverse order (the right end first), slowing into place', () => {
    expect(sweepInOffset(0, 3, 4)).toBe(1)
    expect(sweepInOffset(PAGE_CLOSE.total, 0, 4)).toBe(0)
    expect(sweepInOffset(PAGE_CLOSE.total, 3, 4)).toBe(0)
    for (let ms = 0; ms < PAGE_CLOSE.total; ms += 20) expect(sweepInOffset(ms, 3, 4)).toBeLessThanOrEqual(sweepInOffset(ms, 2, 4))
    // 감속: 절반의 시간에 절반보다 더 왔다
    expect(sweepInOffset(PAGE_CLOSE.sweepAt + PAGE_CLOSE.sweep / 2, 3, 4)).toBeLessThan(0.35)
  })
})

describe('closing: the book flies back to its slot', () => {
  const from = pagePose(view, ASPECT)
  it('waits at the spot until the page is cleared, comes back to the centre, and the others return after it', () => {
    expect(returnPose(from, shelfPose, 0)).toEqual(from)
    const end = returnPose(from, shelfPose, PAGE_CLOSE.total)
    for (const key of ['x', 'y', 'z', 'yaw', 'pitch', 'roll'] as const) expect(end[key]).toBeCloseTo(shelfPose[key], 6)
    expect(returnPose(from, shelfPose, PAGE_CLOSE.retAt)).toEqual(from)
    // 순서: 책 페이지가 치워지고 → 책들이 돌아오고 → 책이 돌아간다
    // 순서: 책 페이지가 치워지고 → 책이 가운데로 돌아와 앞에 서고 → 책들이 돌아오고 → 책이 뒤로 놓인다
    expect(PAGE_CLOSE.retAt).toBeGreaterThanOrEqual(PAGE_CLOSE.clear - 100)
    expect(PAGE_CLOSE.sweepAt).toBeGreaterThanOrEqual(PAGE_CLOSE.retAt + PAGE_CLOSE.ret - 80)
    expect(PAGE_CLOSE.settleAt).toBeGreaterThanOrEqual(PAGE_CLOSE.sweepAt + PAGE_CLOSE.sweep + PAGE_CLOSE.maxStagger - 80)
    expect(PAGE_CLOSE.settleAt).toBeLessThan(PAGE_CLOSE.total)
    expect(PAGE_CLOSE.total).toBeLessThanOrEqual(2500)
    expect(PAGE_CLOSE.total).toBeLessThanOrEqual(BOOK_CLOSE_MS)
  })
})

describe('page to page: out to the left, in from the left', () => {
  const pose = pagePose(view, ASPECT)
  const off = pageOffLeft(view, pose, ASPECT)

  it('has a place off the left edge of the screen', () => {
    const seen = projectPose(view, { ...pose, x: off })
    expect(seen.x + (seen.height * ASPECT) / 2 + seen.height * 0.12).toBeLessThanOrEqual(0)
  })

  it('the outgoing book accelerates out to the left', () => {
    expect(turnExitPose(pose, off, 0)).toEqual(pose)
    expect(turnExitPose(pose, off, PAGE_TURN.exit).x).toBeCloseTo(off)
    const half = turnExitPose(pose, off, PAGE_TURN.exit / 2)
    expect(half.x).toBeLessThan(pose.x)
    expect(half.x).toBeGreaterThan((pose.x + off) / 2)
  })

  it('the incoming book comes in from the left and settles at the spot', () => {
    expect(turnEnterPose(pose, off, 0).x).toBeCloseTo(off)
    expect(turnEnterPose(pose, off, PAGE_TURN.enterAt).x).toBeCloseTo(off)
    const half = turnEnterPose(pose, off, PAGE_TURN.enterAt + PAGE_TURN.enter / 2)
    expect(half.x).toBeGreaterThan((pose.x + off) / 2)
    const end = turnEnterPose(pose, off, PAGE_TURN.total)
    for (const key of ['x', 'y', 'z', 'yaw', 'pitch', 'roll'] as const) expect(end[key]).toBeCloseTo(pose[key], 6)
  })

  it('takes about 0.8–0.9s and fits the input lock', () => {
    expect(PAGE_TURN.total).toBeGreaterThanOrEqual(800)
    expect(PAGE_TURN.total).toBeLessThanOrEqual(900)
    expect(PAGE_TURN.enterAt + PAGE_TURN.enter).toBeLessThanOrEqual(PAGE_TURN.total)
    expect(PAGE_TURN.total).toBeLessThanOrEqual(BOOK_TURN_MS)
  })
})

describe('page amount: how much of the page look (shadow on the page, no floor) is in', () => {
  it('comes in while the book moves aside and is whole at the end', () => {
    expect(pageAmount('open', 0)).toBe(0)
    expect(pageAmount('open', PAGE_OPEN.pageAt)).toBe(0)
    expect(pageAmount('open', PAGE_OPEN.total)).toBe(1)
    const mid = pageAmount('open', PAGE_OPEN.pageAt + PAGE_OPEN.pageIn / 2)
    expect(mid).toBeGreaterThan(0)
    expect(mid).toBeLessThan(1)
  })

  it('goes out when closing', () => {
    expect(pageAmount('close', 0)).toBe(1)
    expect(pageAmount('close', PAGE_CLOSE.total)).toBe(0)
  })
})

describe('returnSettle (서가로 돌아온 책이 뒤로 놓이는 움직임)', () => {
  it('comes forward with the return, so the book arrives a little in front of its place', () => {
    expect(returnSettle(0)).toBe(0)
    expect(returnSettle(PAGE_CLOSE.retAt + PAGE_CLOSE.ret / 2)).toBeGreaterThan(0)
    expect(returnSettle(PAGE_CLOSE.retAt + PAGE_CLOSE.ret / 2)).toBeLessThan(1)
    expect(returnSettle(PAGE_CLOSE.retAt + PAGE_CLOSE.ret)).toBeCloseTo(1)
  })

  it('holds there for a beat, then eases back into place by the end of the close', () => {
    expect(returnSettle((PAGE_CLOSE.retAt + PAGE_CLOSE.ret + PAGE_CLOSE.settleAt) / 2)).toBe(1)
    const arrive = PAGE_CLOSE.settleAt
    const settling = arrive + (PAGE_CLOSE.total - arrive) / 2
    expect(returnSettle(settling)).toBeGreaterThan(0)
    expect(returnSettle(settling)).toBeLessThan(1)
    expect(returnSettle(PAGE_CLOSE.total)).toBe(0)
    expect(returnSettle(PAGE_CLOSE.total + 500)).toBe(0)
  })

  it('never jumps: it only rises, holds, then falls', () => {
    let prev = 0
    let falling = false
    for (let ms = 0; ms <= PAGE_CLOSE.total; ms += 10) {
      const v = returnSettle(ms)
      if (v < prev - 1e-9) falling = true
      if (falling) expect(v).toBeLessThanOrEqual(prev + 1e-9)
      expect(Math.abs(v - prev)).toBeLessThan(0.12)
      prev = v
    }
    expect(PAGE_CLOSE.lift).toBeGreaterThan(0)
  })
})

describe('room for the book to open later', () => {
  it('fits the opened spread inside the panel, before the text column', () => {
    // 펼친 책은 책등의 좌우로 표지 폭만큼씩 차지한다. 판은 왼쪽 여백(20px)부터 화면 폭의 60%까지다
    const spot = spreadSpot(view, ASPECT)
    const cover = spot.height * ASPECT
    expect(spot.x - cover).toBeGreaterThan(20)
    expect((spot.x + cover) / 1440).toBeLessThan(0.6)
    expect(PAGE.textFrom).toBeGreaterThanOrEqual(0.6)
    expect(PAGE.textFrom).toBeLessThan(0.66)
  })

  it('keeps the top of the book below the title band', () => {
    const top = 820 * (PAGE.centreY - PAGE.height / 2)
    // 헤더 56 + 띠(위 여백 20 + 글자 46 × 1.2)
    expect(top).toBeGreaterThan(56 + 20 + 46 * 1.2 + 16)
  })
})
