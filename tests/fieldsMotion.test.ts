import { describe, expect, it } from 'vitest'
import { books } from '../src/data/books'
import { fieldBooks, fields } from '../src/data/fields'
import {
  FIELDS_CAMERA,
  FIELDS_FLIGHT,
  FIELDS_HOVER,
  FIELDS_LAYOUT,
  FIELDS_RETURN,
  FIELDS_TIMING,
  directionMoving,
  edgeFadeWidth,
  emptyDirection,
  exitBookPose,
  facingBookAt,
  facingBookBox,
  eyeFrustum,
  fieldBookPose,
  flightEye,
  flightFrame,
  flightProject,
  flightTarget,
  flightTotalMs,
  fieldsTimeline,
  fieldsView,
  hoverMoving,
  hoverYaw,
  planePointAt,
  projectPoint,
  requestItem,
  returnFrame,
  returnTotalMs,
  rotateByQuat,
  rowPlan,
  scrollRange,
  sizeOf,
  stepHover,
  tickDirection,
  turnProgress,
  turnQuaternion,
  turnRadius,
  type BookSize,
  type Direction,
  type Vec3,
} from '../src/fields3d/motion'
import { BOOK_FLY_MS, BOOK_RETURN_MS } from '../src/app/screen'
import { PAGE, pagePose, pageSpot, projectPose, type PageView } from '../src/shelf3d/motion'

const T = FIELDS_TIMING
const L = FIELDS_LAYOUT

/** 1440×900 화면에서 책 자리(오른쪽 71.4% + 화면 여백)의 크기 */
const STAGE = { width: 1020, height: 762 }
const view = fieldsView(STAGE)

const sizesOf = (name: string): BookSize[] => fieldBooks(fields.find((f) => f.name === name)!).map(sizeOf)
const philosophy = sizesOf('철학') // 5권
const psychology = sizesOf('심리') // 2권
const art = sizesOf('예술') // 3권
/** 가장 긴 줄(6권: 생명과학·경제·경영·과학 가운데 생명과학). 네 권 이상이라 끌어 넘긴다 */
const longest = sizesOf('생명과학')

const expectVec = (actual: Vec3, expected: Vec3, digits = 6) => {
  actual.forEach((n, i) => expect(n).toBeCloseTo(expected[i], digits))
}

type Pose = { position: Vec3; quaternion: [number, number, number, number] }

/** 책의 여덟 모서리(월드 좌표) */
const cornersOf = (pose: Pose, size: BookSize): Vec3[] => {
  const out: Vec3[] = []
  for (const sx of [-1, 1])
    for (const sy of [-1, 1])
      for (const sz of [-1, 1]) {
        const r = rotateByQuat(pose.quaternion, [(sx * size.width) / 2, sy / 2, (sz * size.depth) / 2])
        out.push([r[0] + pose.position[0], r[1] + pose.position[1], r[2] + pose.position[2]])
      }
  return out
}

describe('시간표 (fieldsTimeline)', () => {
  it('출발점 값: 등장 600, 벌어짐 450, 돌기 한 권 700 + 권당 시차 60, 서랍으로 들어감 450', () => {
    expect(T.enterMs).toBe(600)
    expect(T.spreadMs).toBe(450)
    expect(T.turnMs).toBe(700)
    expect(T.turnStaggerMs).toBe(60)
    expect(T.exitMs).toBe(450)
  })

  it('등장 → 벌어짐 → 왼쪽 책부터 차례로 돌기', () => {
    const t = fieldsTimeline(4)
    expect(t.spreadAt).toBe(600)
    expect(t.turnAt(0)).toBe(1050)
    expect(t.turnAt(1)).toBe(1110)
    expect(t.turnAt(3)).toBe(1230)
    expect(t.total).toBe(1930)
  })

  it('한 권뿐이어도, 한 권도 없어도 끝나는 때가 있다', () => {
    expect(fieldsTimeline(1).total).toBe(1750)
    expect(fieldsTimeline(0).total).toBe(0)
  })
})

describe('자세 (turnQuaternion)', () => {
  it('시작: 책등(−X)이 보는 사람(+Z)을 향해 서 있다. 앞표지는 오른쪽을 본다', () => {
    const q = turnQuaternion(0)
    expectVec(rotateByQuat(q, [-1, 0, 0]), [0, 0, 1])
    expectVec(rotateByQuat(q, [0, 1, 0]), [0, 1, 0])
    expectVec(rotateByQuat(q, [0, 0, 1]), [1, 0, 0])
  })

  it('끝: 앞표지가 보는 사람을 향하고 책등은 표지의 왼쪽에 있다(책을 정면에서 본 모습)', () => {
    const q = turnQuaternion(1)
    expectVec(rotateByQuat(q, [0, 0, 1]), [0, 0, 1])
    expectVec(rotateByQuat(q, [-1, 0, 0]), [-1, 0, 0])
    expectVec(rotateByQuat(q, [0, 1, 0]), [0, 1, 0])
  })

  it('도는 동안: 세로축으로만 돈다(책은 곧게 서 있다). 책등은 왼쪽으로 넘어가고 앞표지는 보는 사람 쪽으로 온다', () => {
    let prevSpineX = 0.0001
    let prevCoverZ = -0.0001
    for (const p of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      const q = turnQuaternion(p)
      expectVec(rotateByQuat(q, [0, 1, 0]), [0, 1, 0])
      const spine = rotateByQuat(q, [-1, 0, 0])
      const cover = rotateByQuat(q, [0, 0, 1])
      expect(spine[0]).toBeLessThan(prevSpineX)
      expect(spine[2]).toBeGreaterThan(0)
      expect(cover[2]).toBeGreaterThan(prevCoverZ)
      prevSpineX = spine[0]
      prevCoverZ = cover[2]
    }
  })

  it('늘 단위 쿼터니언이다(조금 지나친 진행에서도)', () => {
    for (let p = 0; p <= 1.05; p += 0.05) {
      const [x, y, z, w] = turnQuaternion(p)
      expect(Math.hypot(x, y, z, w)).toBeCloseTo(1, 9)
    }
  })
})

describe('도는 빠르기 (turnProgress)', () => {
  it('0에서 멈춘 채 출발해 1에서 끝난다. 범위 밖은 0과 1', () => {
    expect(turnProgress(0)).toBe(0)
    expect(turnProgress(-1)).toBe(0)
    expect(turnProgress(1)).toBe(1)
    expect(turnProgress(1.5)).toBe(1)
    // 천천히 출발한다(문이 열리기 시작하듯)
    expect(turnProgress(0.05)).toBeLessThan(0.08)
  })

  it('아주 조금 지나쳤다 돌아온다: 넘는 각은 0.5°~2.5°(과하지 않게), 그 전까지는 줄곧 돈다', () => {
    let peak = 0
    let peakAt = 0
    for (let u = 0; u <= 1; u += 0.005) {
      const p = turnProgress(u)
      if (p > peak) {
        peak = p
        peakAt = u
      }
    }
    expect((peak - 1) * 90).toBeGreaterThan(0.5)
    expect((peak - 1) * 90).toBeLessThan(2.5)
    let prev = 0
    for (let u = 0.01; u <= peakAt; u += 0.01) {
      const p = turnProgress(u)
      expect(p).toBeGreaterThan(prev)
      prev = p
    }
    // 끝에 가까우면 거의 제자리다(0.3° 안): 마지막에 튀지 않는다
    for (let u = 0.9; u <= 1; u += 0.01) expect(Math.abs(turnProgress(u) - 1) * 90).toBeLessThan(0.3)
  })
})

describe('책의 자리 (rowPlan · fieldBookPose)', () => {
  const plan = rowPlan(philosophy)
  const total = fieldsTimeline(philosophy.length).total
  const poseAt = (i: number, ms: number, sizes = philosophy, p = plan) => fieldBookPose(p, sizes, i, ms)

  it('정면을 본 표지는 겹치지 않고 사이에 같은 여백이 있다. 첫 책은 왼쪽 여백에서 시작한다', () => {
    expect(plan.facing[0] - philosophy[0].width / 2).toBeCloseTo(L.margin, 9)
    for (let i = 1; i < philosophy.length; i++) {
      const leftEdge = plan.facing[i] - philosophy[i].width / 2
      const prevRight = plan.facing[i - 1] + philosophy[i - 1].width / 2
      expect(leftEdge - prevRight).toBeCloseTo(L.gap, 9)
    }
    expect(L.gap).toBeGreaterThan(0.08)
  })

  it('처음에는 모든 책이 서랍 안(책 자리의 왼쪽 끝 바깥, 다이얼 쪽)에, 책등을 보이며 줄지어 있다(모든 학문에서)', () => {
    for (const field of fields) {
      const sizes = fieldBooks(field).map(sizeOf)
      const p = rowPlan(sizes)
      sizes.forEach((size, i) => {
        const pose = fieldBookPose(p, sizes, i, 0)
        const xs = cornersOf(pose, size).map((c) => projectPoint(view, c).x)
        expect(Math.max(...xs)).toBeLessThan(0)
        expectVec(rotateByQuat(pose.quaternion, [-1, 0, 0]), [0, 0, 1])
      })
      // 줄의 맨 오른쪽 책이 경계 바로 안쪽에 있다(멀리서 날아오지 않는다): 책 높이의 20% 안
      const last = sizes.length - 1
      const right = fieldBookPose(p, sizes, last, 0).position[0] + sizes[last].depth / 2
      expect(right).toBeGreaterThan(-0.2)
    }
  })

  it('서랍에서 나오는 차례: 줄의 맨 오른쪽에 설 책이 먼저 경계를 넘고 첫 책이 마지막에 넘는다', () => {
    const crossedAt = (i: number) => {
      for (let ms = 0; ms <= T.enterMs; ms += 5) if (poseAt(i, ms).position[0] > 0) return ms
      return Infinity
    }
    const times = philosophy.map((_, i) => crossedAt(i))
    for (let i = 1; i < times.length; i++) expect(times[i]).toBeLessThan(times[i - 1])
    expect(times[0]).toBeLessThan(T.enterMs)
  })

  it('서랍에서 밀려 나오듯: 처음에 빠르고 끝에서 부드럽게 멈춘다', () => {
    const x = (ms: number) => poseAt(0, ms).position[0]
    const whole = x(T.enterMs) - x(0)
    // 시간의 30%에 길의 60%를 넘게 왔다
    expect((x(T.enterMs * 0.3) - x(0)) / whole).toBeGreaterThan(0.6)
    // 마지막 10%의 시간에는 길의 2%도 움직이지 않는다
    expect((x(T.enterMs) - x(T.enterMs * 0.9)) / whole).toBeLessThan(0.02)
  })

  it('등장하는 동안 책등 사이에 약간의 틈이 있다(책등 폭의 절반쯤). 벌어지면 더 넓어진다', () => {
    expect(L.enterGap).toBeGreaterThanOrEqual(0.04)
    expect(L.enterGap).toBeLessThanOrEqual(0.06)
    for (const ms of [0, 200, T.enterMs])
      for (let i = 1; i < philosophy.length; i++) {
        const between = poseAt(i, ms).position[0] - poseAt(i - 1, ms).position[0]
        const touching = (philosophy[i - 1].depth + philosophy[i].depth) / 2
        expect(between - touching).toBeCloseTo(L.enterGap, 9)
      }
    for (let i = 1; i < philosophy.length; i++) {
      const spread = plan.facing[i] - plan.facing[i - 1]
      expect(spread).toBeGreaterThan(plan.packed[i] - plan.packed[i - 1] + 0.3)
    }
  })

  it('등장이 끝나면 틈을 둔 채로 화면 안에 서 있다(첫 책은 벌어질 때 움직이지 않는 자리). 가장 긴 줄(여섯 권)도 다 들어온다', () => {
    const first = poseAt(0, T.enterMs)
    expect(first.position[0]).toBeCloseTo(plan.facing[0], 9)
    expect(first.position[1]).toBeCloseTo(0, 9)
    const lastIndex = philosophy.length - 1
    const last = poseAt(lastIndex, T.enterMs)
    const xs = cornersOf(last, philosophy[lastIndex]).map((c) => projectPoint(view, c).x)
    expect(Math.max(...xs)).toBeLessThan(STAGE.width)
    const envPlan = rowPlan(longest)
    const envLast = fieldBookPose(envPlan, longest, longest.length - 1, T.enterMs)
    expect(Math.max(...cornersOf(envLast, longest[longest.length - 1]).map((c) => projectPoint(view, c).x))).toBeLessThan(STAGE.width)
    expect(last.position[0] - first.position[0]).toBeCloseTo(plan.packed[lastIndex] - plan.packed[0], 9)
    // 등장하는 동안 오른쪽으로만 움직인다
    let prev = poseAt(0, 0).position[0]
    for (let ms = 60; ms <= T.enterMs; ms += 60) {
      const x = poseAt(0, ms).position[0]
      expect(x).toBeGreaterThan(prev)
      prev = x
    }
  })

  it('벌어짐이 끝나면 책등을 보인 채 제자리(표지가 정면을 볼 자리)에 서 있다: 간격은 표지 폭 + 여백', () => {
    const at = T.enterMs + T.spreadMs
    for (let i = 0; i < philosophy.length; i++) {
      const pose = poseAt(i, at)
      expect(pose.position[0]).toBeCloseTo(plan.facing[i], 9)
      expectVec(rotateByQuat(pose.quaternion, [-1, 0, 0]), [0, 0, 1])
    }
    for (let i = 1; i < philosophy.length; i++) {
      const pitch = plan.facing[i] - plan.facing[i - 1]
      expect(pitch).toBeCloseTo((philosophy[i - 1].width + philosophy[i].width) / 2 + L.gap, 9)
    }
  })

  it('왼쪽 책부터 시차를 두고 돈다', () => {
    const t = fieldsTimeline(4)
    const facing = (i: number, ms: number) => rotateByQuat(poseAt(i, ms).quaternion, [0, 0, 1])[2]
    expect(facing(0, t.turnAt(0))).toBeCloseTo(0, 9)
    expect(facing(0, t.turnAt(1) + 200)).toBeGreaterThan(facing(1, t.turnAt(1) + 200))
    expect(facing(1, t.turnAt(1))).toBeCloseTo(0, 9)
    expect(facing(3, t.turnAt(3))).toBeCloseTo(0, 9)
  })

  it('제자리에서 돈다: 도는 동안 책의 가운데는 옆으로도 위아래로도 움직이지 않고, 책은 곧게 서 있다', () => {
    const t = fieldsTimeline(4)
    for (let i = 0; i < philosophy.length; i++)
      for (let ms = t.turnAt(i); ms <= total; ms += 20) {
        const pose = poseAt(i, ms)
        expect(pose.position[0]).toBeCloseTo(plan.facing[i], 9)
        expect(pose.position[1]).toBeCloseTo(0, 9)
        expectVec(rotateByQuat(pose.quaternion, [0, 1, 0]), [0, 1, 0])
      }
  })

  it('도는 반경: 이웃한 두 책이 어떤 각에 있어도 닿지 않는다(모든 학문에서)', () => {
    for (const field of fields) {
      const sizes = fieldBooks(field).map(sizeOf)
      const p = rowPlan(sizes)
      for (let i = 1; i < sizes.length; i++) {
        expect(turnRadius(sizes[i])).toBeCloseTo(Math.hypot(sizes[i].width, sizes[i].depth) / 2, 9)
        const between = p.facing[i] - p.facing[i - 1]
        // 두 책이 쓸고 지나가는 원이 겹치지 않는다. 사이에 책 높이의 10%가 넘는 틈이 남는다
        expect(between - turnRadius(sizes[i]) - turnRadius(sizes[i - 1])).toBeGreaterThan(0.1)
      }
    }
  })

  it('실제 시간표대로 돌려도 이웃 책과 겹치지 않는다(가장 긴 줄 6권, 10ms마다)', () => {
    const p = rowPlan(longest)
    const end = fieldsTimeline(longest.length).total
    for (let ms = 0; ms <= end; ms += 10) {
      const spans = longest.map((size, i) => {
        const xs = cornersOf(fieldBookPose(p, longest, i, ms), size).map((c) => c[0])
        return [Math.min(...xs), Math.max(...xs)]
      })
      for (let i = 1; i < spans.length; i++) expect(spans[i][0]).toBeGreaterThan(spans[i - 1][1])
    }
  })

  it('다 돌면: 제자리, 앞표지가 정면, 표지 면이 모두 한 평면(z = 0)이다. 그 뒤로는 그대로다', () => {
    for (let i = 0; i < philosophy.length; i++) {
      const pose = poseAt(i, total)
      expectVec(pose.position, [plan.facing[i], 0, -philosophy[i].depth / 2])
      expectVec(rotateByQuat(pose.quaternion, [0, 0, 1]), [0, 0, 1])
      expectVec(rotateByQuat(pose.quaternion, [-1, 0, 0]), [-1, 0, 0])
      expect(poseAt(i, total + 5000)).toEqual(pose)
    }
  })

  it('책등을 보이며 선 동안에는 책등 면이 표지 면(z = 0)에 있다: 멈춘 표지와 같은 크기로 보이고 그림자가 길어지지 않는다', () => {
    for (const sizes of [philosophy, longest]) {
      const p = rowPlan(sizes)
      for (const ms of [0, 300, T.enterMs, T.enterMs + T.spreadMs])
        sizes.forEach((size, i) => {
          const front = Math.max(...cornersOf(fieldBookPose(p, sizes, i, ms), size).map((c) => c[2]))
          expect(front).toBeCloseTo(0, 9)
        })
    }
  })

  it('도는 동안 책의 앞쪽 끝은 표지 면 뒤로 숨지 않고, 앞으로도 책 높이의 30% 넘게 나오지 않는다', () => {
    for (const sizes of [philosophy, longest]) {
      const p = rowPlan(sizes)
      const end = fieldsTimeline(sizes.length).total
      for (let ms = 0; ms <= end; ms += 20)
        sizes.forEach((size, i) => {
          const front = Math.max(...cornersOf(fieldBookPose(p, sizes, i, ms), size).map((c) => c[2]))
          expect(front).toBeGreaterThan(-1e-9)
          expect(front).toBeLessThan(0.3)
        })
    }
  })

  it('멈춘 책은 통째로 뒤의 벽 앞에 있다(모든 권이 벽까지의 깊이보다 얇다). 포인터 반응으로 살짝 돌아도 벽을 건드리지 않는다', () => {
    for (const book of books) expect(book.spineAspect).toBeLessThan(L.wallDepth - 0.02)
    for (const field of fields) {
      const sizes = fieldBooks(field).map(sizeOf)
      const p = rowPlan(sizes)
      const end = fieldsTimeline(sizes.length).total
      sizes.forEach((size, i) => {
        for (const hover of [0, FIELDS_HOVER.yawDeg]) {
          const back = Math.min(...cornersOf(fieldBookPose(p, sizes, i, end, hover), size).map((c) => c[2]))
          expect(back).toBeGreaterThan(-L.wallDepth)
        }
      })
    }
  })
})

describe('고정된 정면 카메라와 한 화면 세 권 반 (fieldsView)', () => {
  const px = (x: number, y = 0, z = 0) => projectPoint(view, [x, y, z])

  it('정면에서 본다(내려다보는 각 0°): 눈높이가 책의 세로 가운데이고 옆으로도 기울지 않는다', () => {
    const [cx, cy, cz] = view.camera.position
    const [tx, ty, tz] = view.camera.target
    expect(cy).toBe(0)
    expect(ty).toBe(0)
    expect(cx).toBeCloseTo(tx, 9)
    expect(tx).toBeCloseTo(view.visibleWidth / 2, 9)
    expect(tz).toBe(0)
    expect(cz).toBeGreaterThan(0)
  })

  it('화각이 좁다(4~10°): 원근이 거의 없다', () => {
    expect(FIELDS_CAMERA.fovYDeg).toBeGreaterThanOrEqual(4)
    expect(FIELDS_CAMERA.fovYDeg).toBeLessThanOrEqual(10)
    expect(view.camera.fovY).toBe(FIELDS_CAMERA.fovYDeg)
    // 카메라는 책 높이의 열다섯 배보다 멀리 있다
    expect(view.camera.position[2]).toBeGreaterThan(15)
  })

  it('표지 면(z = 0)에서 x = 0이 화면 왼쪽 끝이고, 줄의 가운데(y = 0)가 화면 가운데 높이다', () => {
    expect(px(0).x).toBeCloseTo(0, 6)
    expect(px(0).y).toBeCloseTo(STAGE.height / 2, 6)
    expect(px(view.visibleWidth).x).toBeCloseTo(STAGE.width, 6)
    expect(view.pxPerUnit).toBeCloseTo(STAGE.width / view.visibleWidth, 9)
    // 위가 화면의 위쪽
    expect(px(1, 0.5).y).toBeCloseTo(STAGE.height / 2 - view.pxPerUnit / 2, 6)
  })

  it('네 권 이상이면(철학 5권) 세 권은 다 보이고 네 번째 책은 오른쪽 끝에서 반쯤 잘린다', () => {
    const plan = rowPlan(philosophy)
    const edge = (i: number, side: -1 | 1) => px(plan.facing[i] + (side * philosophy[i].width) / 2).x
    expect(edge(0, -1)).toBeGreaterThan(0)
    expect(edge(2, 1)).toBeLessThan(STAGE.width)
    expect(edge(3, -1)).toBeLessThan(STAGE.width)
    expect(edge(3, 1)).toBeGreaterThan(STAGE.width)
    // 네 번째 책의 가운데가 오른쪽 끝 근처(책 폭의 ±8% 안)
    const bookPx = philosophy[3].width * view.pxPerUnit
    expect(Math.abs(px(plan.facing[3]).x - STAGE.width)).toBeLessThan(bookPx * 0.08)
  })

  it('1440×900에서: 책 높이는 311~330px(다이얼 쪽으로 당겨도 책은 커지지 않는다), 첫 책의 왼쪽 끝은 책 자리 왼쪽에서 약 43px(화면 왼쪽에서 약 463px)', () => {
    expect(view.pxPerUnit).toBeGreaterThanOrEqual(311)
    expect(view.pxPerUnit).toBeLessThanOrEqual(330)
    // 넓어진 책 자리는 책 사이 여백이 받는다: 여전히 세 권 반
    expect(L.visibleBooks).toBe(3.5)
    const box = facingBookBox(rowPlan(philosophy), philosophy, 0, view)
    expect(box.left).toBeGreaterThan(38)
    expect(box.left).toBeLessThan(48)
  })

  it('세 권 이하인 학문은 다 보인다', () => {
    for (const sizes of [psychology, art]) {
      const plan = rowPlan(sizes)
      const last = sizes.length - 1
      expect(px(plan.facing[last] + sizes[last].width / 2).x).toBeLessThan(STAGE.width)
    }
  })

  it('멈춘 표지는 화면에서 반듯한 직사각형이고 비율이 실물 그대로다(줄의 양 끝 책에서도)', () => {
    const plan = rowPlan(longest)
    const end = fieldsTimeline(longest.length).total
    for (const [i, scroll] of [
      [0, 0],
      [3, 0],
      [longest.length - 1, scrollRange(longest, view)],
    ] as const) {
      const pose = fieldBookPose(plan, longest, i, end)
      const { width, depth } = longest[i]
      const at = (x: number, y: number) =>
        projectPoint(view, [pose.position[0] - scroll + x * width, y, pose.position[2] + depth / 2])
      const [tl, tr, bl, br] = [at(-0.5, 0.5), at(0.5, 0.5), at(-0.5, -0.5), at(0.5, -0.5)]
      expect(tl.x).toBeCloseTo(bl.x, 6)
      expect(tr.x).toBeCloseTo(br.x, 6)
      expect(tl.y).toBeCloseTo(tr.y, 6)
      expect(bl.y).toBeCloseTo(br.y, 6)
      expect((tr.x - tl.x) / (bl.y - tl.y)).toBeCloseTo(width, 6)
      expect(bl.y - tl.y).toBeCloseTo(view.pxPerUnit, 6)
    }
  })

  it('멈춘 책의 옆면(책등·배)은 줄의 양 끝에서도 거의 드러나지 않는다: 책 높이의 1% 안', () => {
    const plan = rowPlan(longest)
    const end = fieldsTimeline(longest.length).total
    const shown: number[] = []
    for (const scroll of [0, scrollRange(longest, view)])
      longest.forEach((size, i) => {
        const pose = fieldBookPose(plan, longest, i, end)
        for (const side of [-1, 1]) {
          const x = pose.position[0] - scroll + (side * size.width) / 2
          const front = projectPoint(view, [x, 0, 0]).x
          if (front < 0 || front > STAGE.width) continue
          // 옆면이 화면에서 차지하는 폭: 표지 면의 모서리와 뒤 모서리가 벌어진 만큼
          shown.push(Math.abs(projectPoint(view, [x, 0, -size.depth]).x - front))
        }
      })
    expect(shown.length).toBeGreaterThan(8)
    expect(Math.max(...shown)).toBeLessThan(view.pxPerUnit * 0.01)
  })

  it('등장부터 다 돌 때까지 책의 위아래가 책 자리에서 잘리지 않는다(여러 크기의 창에서)', () => {
    const stages = [STAGE, { width: 780, height: 662 }, { width: 585, height: 500 }, { width: 1250, height: 942 }, { width: 1600, height: 700 }]
    for (const stage of stages) {
      const v = fieldsView(stage)
      for (const sizes of [philosophy, psychology, longest]) {
        const p = rowPlan(sizes)
        const end = fieldsTimeline(sizes.length).total
        for (let ms = 0; ms <= end; ms += 50) {
          const ys = sizes.flatMap((size, i) => cornersOf(fieldBookPose(p, sizes, i, ms), size).map((c) => projectPoint(v, c).y))
          // 위아래로 책 높이의 8%가 넘는 여백이 남는다(그림자와 포커스 링의 자리)
          expect(Math.min(...ys)).toBeGreaterThan(v.pxPerUnit * 0.08)
          expect(Math.max(...ys)).toBeLessThan(stage.height - v.pxPerUnit * 0.08)
        }
      }
    }
  })

  it('아주 넓은 화면에서는 책이 위아래로 잘리지 않게 세로 여유를 지킨다. 흔한 창에서는 세 권 반 그대로다', () => {
    const wide = fieldsView({ width: 1900, height: 500 })
    expect(wide.visibleWidth / wide.camera.aspect).toBeGreaterThanOrEqual(L.minViewHeight - 1e-9)
    expect(wide.visibleWidth).toBeGreaterThan(view.visibleWidth)
    for (const stage of [STAGE, { width: 1020, height: 662 }, { width: 1600, height: 700 }])
      expect(fieldsView(stage).visibleWidth).toBeCloseTo(L.margin + 3.5 * L.coverWidth + 3 * L.gap, 9)
  })
})

describe('포인터를 올린 책 (FIELDS_HOVER · stepHover · hoverYaw)', () => {
  it('살짝만 돈다(8~12°), 300~400ms에 자리 잡는다', () => {
    expect(FIELDS_HOVER.yawDeg).toBeGreaterThanOrEqual(8)
    expect(FIELDS_HOVER.yawDeg).toBeLessThanOrEqual(12)
    expect(FIELDS_HOVER.settleMs).toBeGreaterThanOrEqual(300)
    expect(FIELDS_HOVER.settleMs).toBeLessThanOrEqual(400)
  })

  it('올리면 넘치지 않고 부드럽게 다 돌고, 나가면 돌아온다', () => {
    let s = { x: 0, v: 0 }
    expect(hoverMoving(s, false)).toBe(false)
    expect(hoverMoving(s, true)).toBe(true)
    let prev = 0
    for (let ms = 0; ms < FIELDS_HOVER.settleMs; ms += 10) {
      s = stepHover(s, true, 10)
      expect(s.x).toBeGreaterThan(prev)
      expect(s.x).toBeLessThanOrEqual(1)
      prev = s.x
    }
    expect(s.x).toBeGreaterThan(0.98)
    for (let ms = 0; ms < 400; ms += 10) s = stepHover(s, true, 10)
    expect(hoverMoving(s, true)).toBe(false)
    expect(hoverMoving(s, false)).toBe(true)
    for (let ms = 0; ms < FIELDS_HOVER.settleMs; ms += 10) s = stepHover(s, false, 10)
    expect(s.x).toBeLessThan(0.02)
    expect(s.x).toBeGreaterThanOrEqual(0)
  })

  it('각: 0이면 그대로, 1이면 다 돈 각', () => {
    expect(hoverYaw(0)).toBe(0)
    expect(hoverYaw(1)).toBe(FIELDS_HOVER.yawDeg)
    expect(hoverYaw(0.5)).toBeCloseTo(FIELDS_HOVER.yawDeg / 2, 9)
  })

  it('돈 책은 책등이 보는 사람 쪽으로 조금 드러난다. 제자리에서 돌고, 벽도 이웃 책도 건드리지 않는다', () => {
    const plan = rowPlan(philosophy)
    const end = fieldsTimeline(philosophy.length).total
    const rest = fieldBookPose(plan, philosophy, 1, end)
    const tilted = fieldBookPose(plan, philosophy, 1, end, FIELDS_HOVER.yawDeg)
    const spine = rotateByQuat(tilted.quaternion, [-1, 0, 0])
    expect(spine[2]).toBeCloseTo(Math.sin((FIELDS_HOVER.yawDeg * Math.PI) / 180), 9)
    expect(spine[0]).toBeLessThan(0)
    expect(tilted.position[0]).toBe(rest.position[0])
    expect(tilted.position[1]).toBe(rest.position[1])
    const corners = cornersOf(tilted, philosophy[1])
    // 책등 쪽 모서리가 표지 면보다 앞으로 나온다(떠오르는 것처럼 그림자가 조금 길어진다)
    expect(Math.max(...corners.map((c) => c[2]))).toBeGreaterThan(0.05)
    const xs = corners.map((c) => c[0])
    expect(Math.min(...xs)).toBeGreaterThan(plan.facing[0] + philosophy[0].width / 2)
    expect(Math.max(...xs)).toBeLessThan(plan.facing[2] - philosophy[2].width / 2)
    // 책등이 화면에 보이는 폭: 책등 폭의 15%가 넘는다(눈에 띈다)
    const { width, depth } = philosophy[1]
    const cornerX = (z: number) => {
      const r = rotateByQuat(tilted.quaternion, [-width / 2, 0, z])
      return projectPoint(view, [r[0] + tilted.position[0], 0, r[2] + tilted.position[2]]).x
    }
    expect(cornerX(depth / 2) - cornerX(-depth / 2)).toBeGreaterThan(depth * view.pxPerUnit * 0.15)
  })
})

describe('가로 스크롤과 좌표로 책 고르기', () => {
  it('세 권 이하는 스크롤 범위가 0, 네 권 이상은 마지막 책 오른쪽 여백까지', () => {
    expect(scrollRange(psychology, view)).toBe(0)
    expect(scrollRange(art, view)).toBe(0)
    expect(scrollRange(philosophy, view)).toBeGreaterThan(0)
    const plan = rowPlan(longest)
    const end = plan.facing[longest.length - 1] + longest[longest.length - 1].width / 2 + L.margin
    expect(scrollRange(longest, view)).toBeCloseTo(end - view.visibleWidth, 9)
  })

  it('화면 좌표 → 표지 면의 점은 투영의 거꾸로다', () => {
    for (const p of [
      [0.4, 0.2, 0],
      [2.1, -0.4, 0],
      [1.2, 0.05, -0.08],
    ] as Vec3[]) {
      const s = projectPoint(view, p)
      const back = planePointAt(view, s.x, s.y, p[2])
      expect(back.x).toBeCloseTo(p[0], 6)
      expect(back.y).toBeCloseTo(p[1], 6)
    }
  })

  it('표지 위의 점은 그 책, 책 사이·위아래 바깥은 null. 스크롤한 만큼 옮겨서 본다', () => {
    const plan = rowPlan(philosophy)
    expect(facingBookAt(plan, philosophy, { x: plan.facing[0], y: 0 })).toBe(0)
    expect(facingBookAt(plan, philosophy, { x: plan.facing[2] + 0.3, y: -0.45 })).toBe(2)
    expect(facingBookAt(plan, philosophy, { x: plan.facing[0] + philosophy[0].width / 2 + L.gap / 2, y: 0 })).toBeNull()
    expect(facingBookAt(plan, philosophy, { x: plan.facing[1], y: 0.6 })).toBeNull()
    expect(facingBookAt(plan, philosophy, { x: plan.facing[0], y: 0 }, plan.facing[1] - plan.facing[0])).toBe(1)
  })

  it('화면에서 책의 상자 한가운데를 누르면 그 책이다(상자와 고르기가 같은 자리를 쓴다)', () => {
    const plan = rowPlan(longest)
    for (const scroll of [0, 0.7])
      for (let i = 0; i < 4; i++) {
        const box = facingBookBox(plan, longest, i, view, scroll)
        const point = planePointAt(view, box.left + box.width / 2, box.top + box.height / 2)
        expect(facingBookAt(plan, longest, point, scroll)).toBe(i)
      }
  })
})

describe('서랍으로 들어가기 (exitBookPose)', () => {
  const total = (sizes: BookSize[]) => fieldsTimeline(sizes.length).total
  const screenXs = (pose: Pose, size: BookSize) => cornersOf(pose, size).map((c) => projectPoint(view, c).x)
  const coverFront = (pose: Pose) => rotateByQuat(pose.quaternion, [0, 0, 1])[2]

  it('들어가기 시작하는 순간은 보이던 자세 그대로다(튀지 않는다): 멈춘 뒤, 도는 중, 벌어지는 중, 등장 중, 끌어 넘긴 자리, 포인터 반응', () => {
    const plan = rowPlan(philosophy)
    const end = total(philosophy)
    for (const at of [200, T.enterMs + 100, 1300, end])
      for (const scroll of [0, 0.25])
        for (const hover of [0, 7])
          philosophy.forEach((_, i) => {
            const shown = fieldBookPose(plan, philosophy, i, at, hover)
            const leaving = exitBookPose(plan, philosophy, i, at, 0, view, scroll, hover)
            expectVec(leaving.position, [shown.position[0] - scroll, shown.position[1], shown.position[2]])
            leaving.quaternion.forEach((n, k) => expect(n).toBeCloseTo(shown.quaternion[k], 9))
          })
  })

  it('다 들어가면 모든 책이 책등을 보인 채 서랍 안(왼쪽 끝 바깥)에 있다. 그 뒤로는 그대로다(모든 학문, 끌어 넘긴 자리에서도)', () => {
    for (const field of fields) {
      const sizes = fieldBooks(field).map(sizeOf)
      const p = rowPlan(sizes)
      for (const scroll of [0, scrollRange(sizes, view)])
        sizes.forEach((size, i) => {
          const pose = exitBookPose(p, sizes, i, total(sizes), T.exitMs, view, scroll)
          expect(Math.max(...screenXs(pose, size))).toBeLessThan(0)
          expectVec(rotateByQuat(pose.quaternion, [-1, 0, 0]), [0, 0, 1])
          expect(exitBookPose(p, sizes, i, total(sizes), T.exitMs * 2, view, scroll)).toEqual(pose)
        })
    }
  })

  it('표지가 책등 쪽으로 돌아서며 왼쪽으로만 간다. 돌아서기가 먼저 끝나고 책등으로 서랍에 들어간다', () => {
    const plan = rowPlan(philosophy)
    const end = total(philosophy)
    for (let i = 0; i < 3; i++) {
      let prevX = Infinity
      let prevFront = 1.0001
      for (let ms = 0; ms <= T.exitMs; ms += 15) {
        const pose = exitBookPose(plan, philosophy, i, end, ms, view)
        expect(pose.position[0]).toBeLessThanOrEqual(prevX)
        expect(coverFront(pose)).toBeLessThanOrEqual(prevFront + 1e-9)
        expectVec(rotateByQuat(pose.quaternion, [0, 1, 0]), [0, 1, 0])
        prevX = pose.position[0]
        prevFront = coverFront(pose)
        // 책의 가운데가 경계를 넘을 때에는 이미 책등이 정면이다
        if (pose.position[0] < 0) expect(coverFront(pose)).toBeCloseTo(0, 6)
      }
    }
  })

  it('돌아서는 동안 첫 책은 제 표지가 차지하던 자리 밖으로(다이얼 쪽으로) 넘어가지 않는다', () => {
    const plan = rowPlan(philosophy)
    const end = total(philosophy)
    for (let ms = 0; ms <= T.exitMs; ms += 10) {
      const pose = exitBookPose(plan, philosophy, 0, end, ms, view)
      if (coverFront(pose) < 0.2) break
      expect(Math.min(...cornersOf(pose, philosophy[0]).map((c) => c[0]))).toBeGreaterThan(L.margin - 0.01)
    }
  })

  it('모이면서 들어간다: 책의 순서는 그대로이고 사이는 좁아지기만 한다', () => {
    const plan = rowPlan(longest)
    const end = total(longest)
    const xs = (ms: number) => longest.map((_, i) => exitBookPose(plan, longest, i, end, ms, view).position[0])
    let prev = xs(0)
    for (let ms = 15; ms <= T.exitMs; ms += 15) {
      const now = xs(ms)
      for (let i = 1; i < now.length; i++) {
        expect(now[i]).toBeGreaterThan(now[i - 1])
        expect(now[i] - now[i - 1]).toBeLessThanOrEqual(prev[i] - prev[i - 1] + 1e-9)
      }
      prev = now
    }
    // 끝에는 등장할 때와 같은 틈으로 붙어 있다
    for (let i = 1; i < prev.length; i++) expect(prev[i] - prev[i - 1]).toBeCloseTo(plan.packed[i] - plan.packed[i - 1], 9)
  })

  it('오른쪽 화면 밖에 있던 책은 화면 끝 바로 밖에서부터 들어온다(먼 길을 가로지르지 않는다). 보이던 책의 자리는 건드리지 않는다', () => {
    const plan = rowPlan(longest)
    const end = total(longest)
    longest.forEach((size, i) => {
      const shown = fieldBookPose(plan, longest, i, end)
      const leaving = exitBookPose(plan, longest, i, end, 0, view)
      const visible = shown.position[0] - size.width / 2 < view.visibleWidth
      if (visible) expect(leaving.position[0]).toBeCloseTo(shown.position[0], 9)
      else {
        // 여전히 화면 밖이고, 화면 끝에서 책 높이의 1.5배 안이다
        expect(Math.min(...screenXs(leaving, size))).toBeGreaterThan(STAGE.width)
        expect(leaving.position[0]).toBeLessThan(view.visibleWidth + 1.5)
      }
    })
  })

  it('들어가는 동안에도 책의 앞쪽 끝은 표지 면 뒤로 숨지 않고 위아래로 움직이지 않는다', () => {
    const plan = rowPlan(philosophy)
    for (const at of [300, 1300, total(philosophy)])
      for (let ms = 0; ms <= T.exitMs; ms += 30)
        philosophy.forEach((size, i) => {
          const pose = exitBookPose(plan, philosophy, i, at, ms, view)
          expect(pose.position[1]).toBe(0)
          const front = Math.max(...cornersOf(pose, size).map((c) => c[2]))
          expect(front).toBeGreaterThan(-1e-9)
          expect(front).toBeLessThan(0.3)
        })
  })
})

describe('경계에서 옅어지기 (edgeFadeWidth)', () => {
  it('책 자리의 왼쪽 끝에서 책 높이의 10~25% 폭으로 옅어진다', () => {
    expect(L.edgeFade).toBeGreaterThanOrEqual(0.1)
    expect(L.edgeFade).toBeLessThanOrEqual(0.25)
    expect(edgeFadeWidth(view)).toBeCloseTo(L.edgeFade * view.pxPerUnit, 9)
  })

  it('다 돌아 멈춘 첫 책은 옅어지는 구간에 걸리지 않는다(여러 크기의 창에서, 포인터 반응으로 살짝 돌아도)', () => {
    const stages = [STAGE, { width: 780, height: 662 }, { width: 585, height: 500 }, { width: 1250, height: 942 }, { width: 1900, height: 500 }]
    for (const stage of stages) {
      const v = fieldsView(stage)
      for (const sizes of [philosophy, psychology, longest]) {
        const plan = rowPlan(sizes)
        expect(facingBookBox(plan, sizes, 0, v).left).toBeGreaterThan(edgeFadeWidth(v))
        const tilted = fieldBookPose(plan, sizes, 0, fieldsTimeline(sizes.length).total, FIELDS_HOVER.yawDeg)
        const left = Math.min(...cornersOf(tilted, sizes[0]).map((c) => projectPoint(v, c).x))
        expect(left).toBeGreaterThan(edgeFadeWidth(v))
      }
    }
  })
})

describe('학문 교체와 건너뛰기 (requestItem · tickDirection)', () => {
  type Item = { key: string }
  const A = { key: '철학' }
  const B = { key: '심리' }
  const C = { key: '예술' }
  const run = (d: Direction<Item>, ms: number, step = 10) => {
    for (let t = 0; t < ms; t += step) d = tickDirection(d, step)
    return d
  }

  it('처음 고르면 정해진 기다림 뒤에 1부터 시작한다', () => {
    let d = requestItem(emptyDirection<Item>(), A, 100)
    expect(d.current).toBeNull()
    d = run(d, 90)
    expect(d.current).toBeNull()
    d = run(d, 20)
    expect(d.current?.item).toBe(A)
    expect(d.current!.at).toBeLessThanOrEqual(10)
    expect(d.pending).toBeNull()
  })

  it('같은 학문을 다시 고르면 아무것도 바뀌지 않는다', () => {
    const shown = run(requestItem(emptyDirection<Item>(), A, 0), 2000)
    expect(requestItem(shown, A)).toBe(shown)
  })

  it('학문이 바뀌면 보이던 책은 그 자리에서 서랍으로 들어가고, 새 책은 기다림이 끝나고 책이 다 들어간 뒤에 1부터', () => {
    const shown = run(requestItem(emptyDirection<Item>(), A, 0), 2000)
    let d = requestItem(shown, B)
    expect(d.current).toBeNull()
    expect(d.leaving).toEqual({ item: A, at: shown.current!.at, out: 0 })
    expect(d.pending?.item).toBe(B)
    d = run(d, T.exitMs - 10)
    expect(d.leaving?.item).toBe(A)
    expect(d.leaving!.at).toBe(shown.current!.at) // 빠져나가는 동안 제 움직임은 멈춘다
    expect(d.current).toBeNull()
    // 들어가는 시간이 기다림보다 길다: 다 들어가기 전에는 기다림이 끝나도 새 책이 나오지 않는다
    expect(T.exitMs).toBeGreaterThan(T.settleMs)
    d = run(d, 20)
    expect(d.leaving).toBeNull()
    expect(d.current?.item).toBe(B)
    expect(d.current!.at).toBeLessThanOrEqual(10)
  })

  it('기다림은 다이얼의 걸음 간격(280ms)보다 길다: 계속 돌리는 동안에는 등장하지 않는다', () => {
    expect(T.settleMs).toBe(320)
    expect(T.settleMs).toBeGreaterThan(280)
  })

  it('빠르게 여러 칸 돌리면 중간 학문은 건너뛰고 멈춘 학문의 책만 등장한다', () => {
    let d = run(requestItem(emptyDirection<Item>(), A, 0), 2000)
    const seen = new Set<string>()
    const watch = (ms: number) => {
      for (let t = 0; t < ms; t += 10) {
        d = tickDirection(d, 10)
        if (d.current) seen.add(d.current.item.key)
      }
    }
    d = requestItem(d, B)
    watch(280)
    d = requestItem(d, C)
    watch(280)
    d = requestItem(d, B)
    watch(280)
    d = requestItem(d, C)
    expect(seen.size).toBe(0)
    // 들어가는 것은 처음 보이던 책뿐이고 이미 끝났다
    expect(d.leaving).toBeNull()
    watch(T.settleMs - 20)
    expect(seen.size).toBe(0)
    watch(40)
    expect([...seen]).toEqual(['예술'])
  })

  it('등장하던 도중에 바뀌면 그 책들도 그때의 모습으로 빠져나간다', () => {
    let d = run(requestItem(emptyDirection<Item>(), A, 0), 400)
    const at = d.current!.at
    d = requestItem(d, B)
    expect(d.leaving).toEqual({ item: A, at, out: 0 })
  })

  it('보이던 학문으로 곧바로 돌아와도 1부터 다시 한다', () => {
    let d = run(requestItem(emptyDirection<Item>(), A, 0), 2000)
    d = requestItem(d, B)
    d = run(d, 100)
    d = requestItem(d, A)
    d = run(d, 600)
    expect(d.current?.item).toBe(A)
    expect(d.current!.at).toBeLessThan(600)
  })

  it('움직일 것이 남았는지: 기다리는 중·빠져나가는 중·등장이 끝나기 전에는 true', () => {
    const total = () => 1930
    expect(directionMoving(emptyDirection<Item>(), total)).toBe(false)
    let d = requestItem(emptyDirection<Item>(), A, 100)
    expect(directionMoving(d, total)).toBe(true)
    d = run(d, 1000)
    expect(directionMoving(d, total)).toBe(true)
    d = run(d, 1200)
    expect(directionMoving(d, total)).toBe(false)
    d = requestItem(d, B)
    expect(directionMoving(d, total)).toBe(true)
  })
})

describe('책을 누르면 들려서 책 페이지의 자리로 날아간다 (flightTarget · flightFrame)', () => {
  /** 1440×900: 책 자리는 화면 왼쪽에서 420px, 위에서 90px에 놓여 있다. 서가의 책 높이 594px, 세로 중심 화면 위에서 474px */
  const offset = { left: 420, top: 90 }
  const canvas = { width: 1440, height: 900, ...offset }
  const page: PageView = { width: 1440, height: 900, centreY: 474, bookHeight: 594 }
  const F = FIELDS_FLIGHT
  const book = philosophy[1]
  const target = flightTarget(view, offset, page, book.width)
  const from = fieldBookPose(rowPlan(philosophy), philosophy, 1, 99999)
  const total = flightTotalMs()

  it('시간: 들림 150~200ms, 날아감 600~700ms, 전체 900ms 안팎. 책 페이지의 잠금은 교차까지 덮는다', () => {
    expect(F.liftMs).toBeGreaterThanOrEqual(150)
    expect(F.liftMs).toBeLessThanOrEqual(200)
    expect(F.flyMs).toBeGreaterThanOrEqual(600)
    expect(F.flyMs).toBeLessThanOrEqual(700)
    expect(total).toBe(F.liftMs + F.flyMs)
    expect(Math.abs(total - 900)).toBeLessThanOrEqual(100)
    expect(F.handoffMs).toBeGreaterThanOrEqual(150)
    expect(F.handoffMs).toBeLessThanOrEqual(200)
    expect(BOOK_FLY_MS).toBeGreaterThanOrEqual(total + F.handoffMs)
  })

  it('닿는 자리: 책 페이지의 눈으로 보면 책의 중심이 떠 있는 책의 자리(pageSpot)에, 그 크기로 보인다', () => {
    const spot = pageSpot(page, book.width)
    const [x, y, z] = target.position
    const centre = flightProject(view, target.eye, [x, y, z])
    expect(centre.x + offset.left).toBeCloseTo(spot.x, 6)
    expect(centre.y + offset.top).toBeCloseTo(spot.y, 6)
    const top = flightProject(view, target.eye, [x, y + 0.5, z])
    const bottom = flightProject(view, target.eye, [x, y - 0.5, z])
    expect(bottom.y - top.y).toBeCloseTo(spot.height, 6)
    // 서가 장면이 그리는 자리와 같다
    const shelf = projectPose(page, pagePose(page, book.width))
    expect(centre.x + offset.left).toBeCloseTo(shelf.x, 6)
    expect(centre.y + offset.top).toBeCloseTo(shelf.y, 6)
  })

  it('닿는 눈: 서가 장면의 눈과 같은 화면 자리(가로 가운데, 책의 세로 중심보다 조금 위)이고 원근의 세기가 같다', () => {
    const [ex, ey, ez] = target.eye
    // 눈 바로 앞의 점(표지 면)은 화면의 그 자리에 보인다
    const front = flightProject(view, target.eye, [ex, ey, 0])
    expect(front.x + offset.left).toBeCloseTo(page.width / 2, 6)
    expect(front.y + offset.top).toBeCloseTo(page.centreY - page.bookHeight * 0.03, 6)
    // 눈에서 책까지의 깊이 ÷ 책 높이가 서가 장면과 같다(같은 원근): 서가에서 눈은 2.6 × 594px 앞에 있고 책은 576px로 보이게 다가와 있다
    expect(ez - target.position[2]).toBeCloseTo((2.6 * page.bookHeight) / pageSpot(page, book.width).height, 6)
  })

  it('닿는 자세: 책 페이지의 쉬는 자세(yaw 30°·pitch −7°·roll 5°, 서가 장면과 같은 XYZ 순서)', () => {
    const rad = (d: number) => (d * Math.PI) / 180
    const [rx, ry, rz] = [rad(PAGE.rest.pitch), rad(PAGE.rest.yaw), rad(PAGE.rest.roll)]
    // R = Rx · Ry · Rz 를 앞표지 법선 (0, 0, 1)에 적용: Rz는 그대로, Ry가 (sin y, 0, cos y), Rx가 그 위에
    const expected: Vec3 = [Math.sin(ry), -Math.sin(rx) * Math.cos(ry), Math.cos(rx) * Math.cos(ry)]
    const normal = rotateByQuat(target.quaternion, [0, 0, 1])
    normal.forEach((n, i) => expect(n).toBeCloseTo(expected[i], 9))
    // 책의 위쪽(0, 1, 0): Rz가 (−sin z, cos z, 0)으로, 이어서 Ry, Rx
    const up = rotateByQuat(target.quaternion, [0, 1, 0])
    const a: Vec3 = [-Math.sin(rz) * Math.cos(ry), Math.cos(rz), Math.sin(rz) * Math.sin(ry)]
    const expectedUp: Vec3 = [a[0], a[1] * Math.cos(rx) - a[2] * Math.sin(rx), a[1] * Math.sin(rx) + a[2] * Math.cos(rx)]
    up.forEach((n, i) => expect(n).toBeCloseTo(expectedUp[i], 9))
  })

  it('눈이 옮겨 가는 길: 0이면 평소의 정면 카메라, 1이면 책 페이지의 눈. 원근의 세기(1/거리)가 고르게 바뀐다', () => {
    expect(flightEye(view, target, 0)).toEqual(view.camera.position)
    flightEye(view, target, 1).forEach((n, i) => expect(n).toBeCloseTo(target.eye[i], 9))
    const mid = flightEye(view, target, 0.5)
    expect(1 / mid[2]).toBeCloseTo((1 / view.camera.position[2] + 1 / target.eye[2]) / 2, 9)
  })

  it('절두체: 눈이 어디에 있든 표지 면(z = 0)의 점은 화면의 같은 자리에 보인다(멈춘 책이 밀리지 않는다)', () => {
    for (const c of [0, 0.3, 1]) {
      const eye = flightEye(view, target, c)
      const p = flightProject(view, eye, [1.2, 0.3, 0])
      const still = projectPoint(view, [1.2, 0.3, 0])
      expect(p.x).toBeCloseTo(still.x, 6)
      expect(p.y).toBeCloseTo(still.y, 6)
    }
    // 평소의 눈 + 책 자리만 한 캔버스: 좌우·상하가 대칭이고 세로 화각 6°다
    const near = 1
    const f = eyeFrustum(view, { width: STAGE.width, height: STAGE.height, left: 0, top: 0 }, view.camera.position, near)
    expect(f.right).toBeCloseTo(-f.left, 9)
    expect(f.top).toBeCloseTo(-f.bottom, 9)
    expect(f.top).toBeCloseTo(Math.tan((FIELDS_CAMERA.fovYDeg * Math.PI) / 360) * near, 9)
    // 화면 전체를 덮는 캔버스: 왼쪽·위로 그만큼 넓다(책 자리의 그림은 그대로다)
    const wide = eyeFrustum(view, canvas, view.camera.position, near)
    const perPx = (f.right - f.left) / STAGE.width
    expect(wide.left).toBeCloseTo(f.left - offset.left * perPx, 9)
    expect(wide.right).toBeCloseTo(f.left + (canvas.width - offset.left) * perPx, 9)
    expect(wide.top).toBeCloseTo(f.top + offset.top * perPx, 9)
    expect(wide.bottom).toBeCloseTo(f.top - (canvas.height - offset.top) * perPx, 9)
  })

  it('처음에는 서 있던 그대로다(튀지 않는다)', () => {
    const f = flightFrame(from, target, 0)
    f.position.forEach((n, i) => expect(n).toBeCloseTo(from.position[i], 9))
    f.quaternion.forEach((n, i) => expect(n).toBeCloseTo(from.quaternion[i], 9))
    expect(f.scale).toBe(1)
    expect(f.camera).toBe(0)
    expect(f.veil).toBe(0)
    expect(f.done).toBe(false)
  })

  it('들림: 제자리에서 보는 사람 쪽으로 나오며 조금 커지고 살짝 기운다. 눈과 바탕은 그대로다', () => {
    const f = flightFrame(from, target, F.liftMs)
    expect(f.position[0]).toBeCloseTo(from.position[0], 9)
    expect(f.position[1]).toBeCloseTo(from.position[1], 9)
    expect(f.position[2] - from.position[2]).toBeCloseTo(F.liftZ, 9)
    expect(f.scale).toBeCloseTo(F.liftScale, 9)
    expect(F.liftScale).toBeGreaterThan(1.02)
    expect(F.liftScale).toBeLessThan(1.1)
    // 앞표지가 책 페이지의 자세 쪽(오른쪽)으로 조금 돈다
    const normal = rotateByQuat(f.quaternion, [0, 0, 1])
    expect(normal[0]).toBeGreaterThan(0.05)
    expect(normal[2]).toBeGreaterThan(0.97)
    expect(f.camera).toBe(0)
    expect(f.veil).toBe(0)
    // 들리는 동안 계속 올라온다
    const half = flightFrame(from, target, F.liftMs / 2)
    expect(half.position[2]).toBeGreaterThan(from.position[2])
    expect(half.position[2]).toBeLessThan(f.position[2])
  })

  it('날아감: 가속했다가 부드럽게 닿는다. 눈도 함께 옮겨 간다', () => {
    const at = (share: number) => flightFrame(from, target, F.liftMs + F.flyMs * share)
    const start = at(0)
    const progress = (share: number) => (at(share).position[0] - start.position[0]) / (target.position[0] - start.position[0])
    expect(progress(0.1)).toBeLessThan(0.06) // 천천히 떠난다
    expect(progress(0.5)).toBeGreaterThan(0.5)
    expect(progress(0.9)).toBeGreaterThan(0.97) // 마지막에는 거의 움직이지 않는다
    let prev = -1
    for (let share = 0; share <= 1.0001; share += 0.05) {
      const f = at(Math.min(1, share))
      expect(f.camera).toBeGreaterThanOrEqual(prev)
      prev = f.camera
    }
  })

  it('바탕색은 책이 절반쯤 갔을 때부터 들어오고, 닿기 조금 전에 다 찬다', () => {
    const at = (share: number) => flightFrame(from, target, F.liftMs + F.flyMs * share).veil
    expect(at(F.veilFrom)).toBe(0)
    expect(at(F.veilFrom - 0.1)).toBe(0)
    expect(F.veilFrom).toBeGreaterThanOrEqual(0.4)
    expect(F.veilFrom).toBeLessThanOrEqual(0.6)
    expect(at((F.veilFrom + F.veilTo) / 2)).toBeCloseTo(0.5, 9)
    expect(at(F.veilTo)).toBe(1)
    expect(F.veilTo).toBeLessThan(1)
  })

  it('닿으면 책 페이지의 자리·자세·크기 그대로이고 끝났다고 알린다. 그 뒤로도 그대로다', () => {
    for (const ms of [total, total + 500]) {
      const f = flightFrame(from, target, ms)
      f.position.forEach((n, i) => expect(n).toBeCloseTo(target.position[i], 9))
      f.quaternion.forEach((n, i) => expect(n).toBeCloseTo(target.quaternion[i], 9))
      expect(f.scale).toBe(1)
      expect(f.camera).toBe(1)
      expect(f.veil).toBe(1)
      expect(f.done).toBe(true)
    }
    expect(flightFrame(from, target, total - 1).done).toBe(false)
  })

  it('포인터 반응으로 살짝 돌아 있던 책도 그 자세에서 이어서 들린다', () => {
    const hovered = fieldBookPose(rowPlan(philosophy), philosophy, 1, 99999, FIELDS_HOVER.yawDeg)
    const f = flightFrame(hovered, target, 0)
    f.quaternion.forEach((n, i) => expect(n).toBeCloseTo(hovered.quaternion[i], 9))
  })
})

describe('책 페이지를 닫으면 날아서 제자리로 돌아온다 (FIELDS_RETURN · returnFrame)', () => {
  const R = FIELDS_RETURN
  const F = FIELDS_FLIGHT
  const offset = { left: 420, top: 90 }
  const page: PageView = { width: 1440, height: 900, centreY: 474, bookHeight: 594 }
  const book = philosophy[1]
  const target = flightTarget(view, offset, page, book.width)
  const rest = fieldBookPose(rowPlan(philosophy), philosophy, 1, 99999)
  /** 겹쳐 넘어온 뒤(날기 시작한 때)부터 잰 시간 */
  const flying = (ms: number) => returnFrame(rest, target, R.departMs + ms)

  it('시간: 겹쳐 넘어오기 → 날아옴 → 내려앉음. 열 때와 같은 값에서 시작한다. 잠금은 끝까지 덮는다', () => {
    expect(R.departMs).toBe(F.handoffMs)
    expect(R.flyMs).toBe(F.flyMs)
    expect(R.settleMs).toBe(F.liftMs)
    expect(returnTotalMs()).toBe(R.departMs + R.flyMs + R.settleMs)
    expect(BOOK_RETURN_MS).toBeGreaterThanOrEqual(returnTotalMs())
    expect(BOOK_RETURN_MS).toBeLessThan(returnTotalMs() + 200)
  })

  it('출발: 겹쳐 넘어오는 동안에는 책 페이지의 자리·자세·눈 그대로이고 바탕색이 다 차 있다(튀지 않는다)', () => {
    for (const ms of [0, R.departMs / 2, R.departMs]) {
      const f = returnFrame(rest, target, ms)
      expect(f.position).toEqual(target.position)
      expect(f.quaternion).toEqual(target.quaternion)
      expect(f.scale).toBe(1)
      expect(f.camera).toBe(1)
      expect(f.veil).toBe(1)
      expect(f.done).toBe(false)
    }
    expect(returnFrame(rest, target, R.departMs - 1).departed).toBe(false)
    expect(returnFrame(rest, target, R.departMs).departed).toBe(true)
  })

  it('날아옴: 열 때 날아간 길을 거꾸로 온다(같은 순간의 자리·자세·크기·눈·바탕색)', () => {
    for (const share of [0.1, 0.3, 0.5, 0.8, 0.95]) {
      const back = flying(R.flyMs * share)
      const out = flightFrame(rest, target, F.liftMs + F.flyMs * (1 - share))
      back.position.forEach((n, i) => expect(n).toBeCloseTo(out.position[i], 9))
      back.quaternion.forEach((n, i) => expect(n).toBeCloseTo(out.quaternion[i], 9))
      expect(back.scale).toBeCloseTo(out.scale, 9)
      expect(back.camera).toBeCloseTo(out.camera, 9)
      expect(back.veil).toBeCloseTo(out.veil, 9)
      expect(back.done).toBe(false)
    }
  })

  it('바탕색은 날아오는 동안 걷힌다: 처음 조금은 다 차 있고, 절반을 조금 지나면 다 걷혀 있다', () => {
    expect(flying(R.flyMs * (1 - F.veilTo)).veil).toBeCloseTo(1, 9)
    expect(flying(R.flyMs * (1 - (F.veilFrom + F.veilTo) / 2)).veil).toBeCloseTo(0.5, 9)
    expect(flying(R.flyMs * (1 - F.veilFrom)).veil).toBeCloseTo(0, 9)
    expect(flying(R.flyMs * 0.8).veil).toBe(0)
  })

  it('날아온 끝: 줄의 제자리 위에 들린 자세(보는 사람 쪽으로 나와 조금 크고 기울었다)이고 눈은 평소의 자리다', () => {
    const f = flying(R.flyMs)
    const lifted = flightFrame(rest, target, F.liftMs)
    f.position.forEach((n, i) => expect(n).toBeCloseTo(lifted.position[i], 9))
    f.quaternion.forEach((n, i) => expect(n).toBeCloseTo(lifted.quaternion[i], 9))
    expect(f.scale).toBeCloseTo(F.liftScale, 9)
    expect(f.camera).toBe(0)
    expect(f.veil).toBe(0)
  })

  it('내려앉음: 제자리에서 뒤로 물러나며 작아지고 바로 선다. 천천히 떠나 부드럽게 놓인다', () => {
    const z = (share: number) => flying(R.flyMs + R.settleMs * share).position[2] - rest.position[2]
    let prev = F.liftZ + 1e-9
    for (let share = 0; share <= 1.0001; share += 0.1) {
      const f = flying(R.flyMs + R.settleMs * Math.min(1, share))
      expect(f.position[0]).toBeCloseTo(rest.position[0], 9)
      expect(f.position[1]).toBeCloseTo(rest.position[1], 9)
      expect(z(Math.min(1, share))).toBeLessThanOrEqual(prev)
      prev = z(Math.min(1, share))
      expect(f.camera).toBe(0)
      expect(f.veil).toBe(0)
    }
    // 처음 10%에는 거의 내려가지 않고, 마지막 10%에도 거의 움직이지 않는다
    expect(z(0.1)).toBeGreaterThan(F.liftZ * 0.9)
    expect(z(0.9)).toBeLessThan(F.liftZ * 0.1)
  })

  it('다 놓이면 멈춘 줄의 자세와 정확히 같고 끝났다고 알린다. 그 뒤로도 그대로다', () => {
    for (const ms of [returnTotalMs(), returnTotalMs() + 500]) {
      const f = returnFrame(rest, target, ms)
      expect(f.position).toEqual(rest.position)
      expect(f.quaternion).toEqual(rest.quaternion)
      expect(f.scale).toBe(1)
      expect(f.camera).toBe(0)
      expect(f.veil).toBe(0)
      expect(f.done).toBe(true)
    }
    expect(returnFrame(rest, target, returnTotalMs() - 1).done).toBe(false)
  })

  it('책 페이지의 책이 포인터를 따라 돌아 있었으면 그 자세에서 출발한다(서가 장면과 같은 XYZ 순서로 yaw·pitch를 보탠다)', () => {
    const rad = (d: number) => (d * Math.PI) / 180
    const turned = flightTarget(view, offset, page, book.width, { yaw: 5, pitch: -3 })
    expect(turned.position).toEqual(target.position)
    expect(turned.eye).toEqual(target.eye)
    const [rx, ry] = [rad(PAGE.rest.pitch - 3), rad(PAGE.rest.yaw + 5)]
    const expected: Vec3 = [Math.sin(ry), -Math.sin(rx) * Math.cos(ry), Math.cos(rx) * Math.cos(ry)]
    rotateByQuat(turned.quaternion, [0, 0, 1]).forEach((n, i) => expect(n).toBeCloseTo(expected[i], 9))
    // 돌아 있지 않으면 그대로다
    expect(flightTarget(view, offset, page, book.width, { yaw: 0, pitch: 0 }).quaternion).toEqual(target.quaternion)
  })
})
