/**
 * WebGL 서가(three.js)의 순수 계산: 책의 목표 자세, 스프링, 놓이는 움직임, 올라오는 움직임,
 * 카메라 절두체, 포커스 링의 자리, 그림을 받을 범위, 가운데 책의 쉬는 자세와 포인터를 따라 도는 각도.
 * three에 의존하지 않는다(단위 테스트 `tests/shelfMotion.test.ts`).
 */
import { TILT_MAX_X, TILT_MAX_Y, type Tilt } from '../shelf/hover'
import { CURRENT_POP, computeShelfLayout, visibleRadius, type BookSlot, type LayoutBook } from '../shelf/layout'

export { CURRENT_POP }
/** 원근 거리(책 높이 대비). shelf.css의 perspective와 같은 값 */
export const PERSPECTIVE = 2.6
/** 눈높이: 책의 세로 중심보다 이만큼(책 높이 대비) 위 */
export const EYE_LIFT = 0.03
/** 포인터가 올라간 책등이 뽑혀 나오는 깊이(책 높이 대비). shelf.css의 --pull과 같은 값 */
export const HOVER_PULL = 0.2

export interface BookPose {
  /** 상자 중심의 가로 좌표(px, 화면 가운데가 0) */
  x: number
  /** 상자 중심의 깊이(px, 보는 사람 쪽이 +). 정면에 보이는 면이 z=0(가운데 책은 책 높이의 12% 앞)에 온다 */
  z: number
  /** Y축 회전(rad). 0 = 앞표지가 정면, π/2 = 책등이 정면 */
  rotY: number
  /** 포인터로 뽑혀 나온 깊이(px). z에 더한다(따로 더 빠른 스프링으로 움직인다) */
  pull: number
}

export interface PoseOptions {
  bookHeight: number
  /** 포인터가 올라가 있는 책. 없으면 null */
  hoverIndex: number | null
}

/** 배치(슬롯)와 포인터 상태에서 책마다의 목표 자세를 구한다. */
export function bookPoseTargets(
  books: readonly LayoutBook[],
  slots: readonly BookSlot[],
  { bookHeight, hoverIndex }: PoseOptions,
): BookPose[] {
  return books.map((book, i) => {
    const slot = slots[i]
    const coverW = bookHeight * book.coverAspect
    const spineW = bookHeight * book.spineAspect
    return {
      x: slot.x,
      z: slot.isCurrent ? -spineW / 2 + bookHeight * CURRENT_POP : -coverW / 2,
      rotY: (slot.rotateY * Math.PI) / 180,
      pull: i === hoverIndex && !slot.isCurrent ? bookHeight * HOVER_PULL : 0,
    }
  })
}

export interface Spring {
  x: number
  v: number
}

/** 임계 감쇠 스프링이 목표의 1% 안에 들어오는 시간: (1 + ωt)·e^(−ωt) = 0.01 → ωt ≈ 6.64 */
const SETTLE_OMEGA_T = 6.64

/** 약 seconds 만에 자리를 잡는 스프링의 각진동수 */
export const omegaForSettle = (seconds: number) => SETTLE_OMEGA_T / seconds

/**
 * 임계 감쇠 스프링 한 걸음(닫힌 해라서 프레임 길이와 상관없이 같은 곡선이고, 긴 프레임에도 안정적이다).
 * 속도 0에서 천천히 출발해 넘치지 않고 부드럽게 멈춘다. 도중에 목표가 바뀌어도 속도가 이어진다.
 */
export function springStep({ x, v }: Spring, target: number, omega: number, dt: number): Spring {
  const d = x - target
  const decay = Math.exp(-omega * dt)
  const tmp = (v + omega * d) * dt
  return { x: target + (d + tmp) * decay, v: (v - omega * tmp) * decay }
}

/** 목표에 충분히 가깝고 거의 멈췄는가. 속도는 1초에 eps의 10배까지 봐준다 */
export const isSettled = ({ x, v }: Spring, target: number, eps: number) =>
  Math.abs(x - target) < eps && Math.abs(v) < eps * 10

export interface FrustumInput {
  viewportWidth: number
  viewportHeight: number
  /** 눈에서 z=0 평면까지의 거리(px). CSS perspective와 같다 */
  distance: number
  /** 책의 세로 중심(y=0)이 화면 위에서 몇 px 내려온 곳에 보이는가 */
  centreY: number
  /** 눈높이: 책의 세로 중심보다 몇 px 위인가(시선은 그대로 수평) */
  eyeLift: number
  near: number
}

/**
 * z=0 평면이 CSS 픽셀과 1:1이 되는 비대칭 절두체(near 평면에서의 좌우·상하).
 * 눈은 (0, eyeLift, distance)에서 −z를 본다. CSS의 perspective + perspective-origin과 같은 투영이다.
 */
export function cameraFrustum({ viewportWidth, viewportHeight, distance, centreY, eyeLift, near }: FrustumInput) {
  const k = near / distance
  return {
    left: (-viewportWidth / 2) * k,
    right: (viewportWidth / 2) * k,
    top: (centreY - eyeLift) * k,
    bottom: (centreY - viewportHeight - eyeLift) * k,
  }
}

/** 그림을 받아 둘 책의 범위: 가운데에서 radius + margin 권까지 */
export function loadRange(index: number, radius: number, count: number, margin: number) {
  return { from: Math.max(0, index - radius - margin), to: Math.min(count - 1, index + radius + margin) }
}

export interface TextureStage {
  bookHeight: number
  gap: number
  currentGap: number
  /** 웰컴의 줄에서 1권 책등의 왼쪽 끝(`Stage.lineupLeft`). 모르면 `line`은 없다 */
  lineupLeft?: number
  /** 화면의 반 폭(px) */
  halfWidth: number
  /** 화면에 걸친 책 바깥으로 더 받아 두는 권 수 */
  margin: number
}

/**
 * 책등을 보인 책이 화면에 보이는 것으로 치는 범위(가운데에서, px): 화면의 반 폭에 책 높이의 0.35배를 더한다.
 * 책등은 옆면(표지 폭)이 비스듬히 보이므로 화면 끝에서 조금 더 나가야 보이지 않는다. 줄을 서거나 풀 때의 건너뛰기
 * (`rowJumpStart`)와 그림 범위(`textureRanges`)가 같은 값을 쓴다
 */
export const rowSeenHalf = (halfWidth: number, bookHeight: number) => halfWidth + bookHeight * 0.35

/**
 * 그림을 들고 있을 책의 범위 둘.
 * - `near`: 가운데 책(index)의 둘레. 가운데 책을 펼친 배치와 책등만 보이는 배치(더 촘촘하다) 어느 쪽에서든 화면에
 *   걸치는 책(책등 배치는 옆면의 여유 `rowSeenHalf`까지) + margin 권. 배치(펼침·책등·줄)는 입력이 아니다.
 * - `line`: 웰컴의 줄(전부 책등, 1권이 왼쪽 끝)에서 화면에 걸친 책(1권부터)과 margin 권. 가운데 책과 상관없이 같고,
 *   서가를 보는 동안에도 들고 있는다.
 * 웰컴 ↔ 서가의 전환(꽂힘 → 줄 → 밀림 → 펼침)은 가운데 책이 그대로인 채 배치만 바뀐다. 범위가 배치와 상관없으므로
 * 그동안 범위가 달라지지 않는다: 전환 도중에 그림을 새로 받아 올리느라 프레임이 멈추는 일이 없다. 줄이 풀릴 때 화면으로
 * 들어오는 책(`rowJumpStart`가 건너뛰지 않는 책)은 모두 이 범위 안이다. 둘 사이의 책은 받지 않는다: 줄은 건너뛴다.
 */
export function textureRanges(books: readonly LayoutBook[], index: number, stage: TextureStage) {
  const { bookHeight, gap, currentGap, lineupLeft, halfWidth, margin } = stage
  const count = books.length
  const open = computeShelfLayout(books, index, { bookHeight, gap, currentGap })
  const spines = computeShelfLayout(books, index, { bookHeight, gap, currentGap, closed: true })
  const radius = Math.max(
    visibleRadius(open, index, halfWidth),
    visibleRadius(spines, index, rowSeenHalf(halfWidth, bookHeight)),
  )
  const near = loadRange(index, radius, count, margin)
  if (lineupLeft === undefined) return { near, line: null }
  let last = -1
  computeShelfLayout(books, 0, { bookHeight, gap, lineupLeft }).forEach((slot, i) => {
    if (Math.abs(slot.x) - slot.faceWidth / 2 < halfWidth) last = Math.max(last, i)
  })
  return { near, line: { from: 0, to: Math.min(count - 1, last + margin) } }
}

/**
 * 줄을 서거나 풀 때(웰컴 ↔ 서가) 책 한 권이 출발하는 가로 자리. 먼 책을 보다 오가면 줄이 수천 px 밀려야 하는데,
 * 그 사이의 책을 모두 화면으로 지나가게 하지 않고 건너뛴다(끊긴 것은 화면 밖에서만 일어난다).
 * - 지금 보이는 책(가운데에서 seen px 안): 제자리에서 출발한다. 끊기지 않고 밀려 나간다
 * - 보이지 않는 곳에서 보이지 않는 곳으로 가는 책: 바로 도착한 자리에 둔다(화면을 지나가지 않는다)
 * - 보이지 않다가 화면 안으로 오는 책: 도착할 자리에서 2 × seen(화면 폭 하나쯤)보다 멀면 그만큼 떨어진 곳에서 출발한다.
 *   멀리서 오는 책은 모두 같은 거리에서 출발하므로 줄이 흐트러지지 않고, 출발하는 자리는 모두 화면 밖이다
 */
export function rowJumpStart(from: number, to: number, seen: number) {
  if (Math.abs(from) < seen) return from
  if (Math.abs(to) >= seen) return to
  const travel = to - from
  return Math.abs(travel) <= 2 * seen ? from : to - Math.sign(travel) * 2 * seen
}

/**
 * CSS의 cubic-bezier(x1, y1, x2, y2)와 같은 이징 함수(진행 0~1 → 값 0~1).
 * x(t) = 진행이 되는 t를 뉴턴법 + 이분법으로 찾아 y(t)를 돌려준다.
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
  const curve = (a: number, b: number, t: number) => ((1 - 3 * b + 3 * a) * t + (3 * b - 6 * a)) * t * t + 3 * a * t
  const slope = (a: number, b: number, t: number) => 3 * (1 - 3 * b + 3 * a) * t * t + 2 * (3 * b - 6 * a) * t + 3 * a
  return (progress: number) => {
    if (progress <= 0) return 0
    if (progress >= 1) return 1
    let t = progress
    for (let i = 0; i < 6; i++) {
      const d = slope(x1, x2, t)
      if (Math.abs(d) < 1e-6) break
      t -= (curve(x1, x2, t) - progress) / d
    }
    if (!(t >= 0 && t <= 1) || Math.abs(curve(x1, x2, t) - progress) > 1e-5) {
      let lo = 0
      let hi = 1
      for (let i = 0; i < 40; i++) {
        t = (lo + hi) / 2
        if (curve(x1, x2, t) < progress) lo = t
        else hi = t
      }
    }
    return curve(y1, y2, t)
  }
}

/** 서가 이동의 이징(`--ease-shelf`) */
const easeShelf = cubicBezier(0.32, 0.12, 0.2, 1)
const easeSettle = cubicBezier(0.3, 0, 0.3, 1)
const easeRise = cubicBezier(0.2, 0.7, 0.2, 1)

/** 가운데로 온 책이 제자리보다 더 앞으로 나오는 깊이(책 높이 대비). shelf.css의 book-place와 같은 값 */
export const PLACE_LIFT = 0.04
/** 놓이는 움직임의 길이: 한 걸음(680ms)일 때 1000ms. 이동이 느리면 같은 비율로 길어진다 */
const PLACE_PER_MOVE = 1000 / 680
/** 놓이는 움직임의 마디(전체 대비): 여기까지 나오고 / 여기까지 멈췄다가 / 끝에서 제자리 */
const PLACE_OUT = 0.62
const PLACE_HOLD = 0.78

export const placeTotalMs = (moveMs: number) => moveMs * PLACE_PER_MOVE

/**
 * 가운데로 온 책이 놓이는 움직임(0~1, PLACE_LIFT에 곱한다): 오는 동안 조금 앞으로 나와 있다가,
 * 약 0.15초 멈춘 뒤 제자리로 내려앉는다. elapsedMs는 가운데 책이 된 뒤 흐른 시간.
 */
export function placeOffset(elapsedMs: number, moveMs: number) {
  const p = elapsedMs / placeTotalMs(moveMs)
  if (!(p > 0) || p >= 1 - 1e-9) return 0
  if (p < PLACE_OUT) return easeShelf(p / PLACE_OUT)
  if (p < PLACE_HOLD) return 1
  return 1 - easeSettle((p - PLACE_HOLD) / (1 - PLACE_HOLD))
}

/** 서가에 들어설 때 책이 아래에서 올라오는 움직임. shelf.css의 book-rise와 같은 값 */
export const RISE = {
  /** 처음 자리: 이만큼(책 높이 대비) 아래 */
  from: 0.55,
  ms: 760,
  /** 모든 책이 기다리는 시간(ms) */
  delay: 180,
  /** 가운데에서 한 권 멀어질 때마다 늦어지는 시간(ms) */
  stagger: 40,
  /** 이보다 먼 책은 같은 때에 올라온다 */
  maxDistance: 8,
}

export const riseTotalMs = () => RISE.delay + RISE.maxDistance * RISE.stagger + RISE.ms

/** 올라오는 중인 책이 아직 내려가 있는 정도(1 = 처음 자리, 0 = 제자리). distance는 가운데 책에서 몇 권 떨어졌는가 */
export function riseOffset(elapsedMs: number, distance: number) {
  const wait = RISE.delay + Math.min(RISE.maxDistance, Math.abs(distance)) * RISE.stagger
  return 1 - easeRise((elapsedMs - wait) / RISE.ms)
}

/** 각도(deg). 부호는 three의 회전과 같다: yaw +는 책등(왼쪽)이 보는 사람 쪽으로, pitch +는 책의 위쪽이 보는 사람 쪽으로 온다 */
export interface BookTurn {
  yaw: number
  pitch: number
}

/**
 * 가운데 책이 쉬는 자세. 정면으로 납작하게 서 있으면 그림 한 장처럼 보이므로, 책등이 조금 보이게 돌려 둔다.
 * 원근(책 높이의 2.6배 거리) 때문에 약 8°까지는 책등이 표지 뒤에 숨는다. 16°에서 책등의 1/6쯤이 보인다.
 * 위아래로는 기울이지 않는다: 눈높이가 책 가운데라 10° 넘게 숙여야 윗면이 보이는데, 그러면 표지가 누워 보인다.
 */
export const CURRENT_REST: BookTurn = { yaw: 16, pitch: 0 }
/** 포인터가 표지의 가장자리에 있을 때의 각도. 왼쪽 끝에서 책등이 더, 오른쪽 끝에서 배(종이 단면)가 보인다 */
export const CURRENT_TURN: BookTurn = { yaw: 17, pitch: 3 }

const clampUnit = (n: number) => Math.min(1, Math.max(-1, n))

/**
 * CSS 서가와 함께 쓰는 기울임 값(`tiltFor`)에서 표지 위의 포인터 자리를 되읽는다
 * (표지 중심이 0, 가장자리가 ±1, 오른쪽·아래가 +). 컴포넌트와 장면 사이의 약속(`ScenePointer.tilt`)을 그대로 둔다.
 */
export function coverPointFrom(tilt: Tilt) {
  return { x: clampUnit(tilt.rotateY / TILT_MAX_Y) + 0, y: clampUnit(-tilt.rotateX / TILT_MAX_X) + 0 }
}

/**
 * 가운데 책의 자세. 포인터가 없으면 쉬는 자세, 표지 위에 있으면 포인터가 있는 쪽 가장자리가
 * 보는 사람 쪽으로 온다(그쪽 옆면이 드러난다): 왼쪽 → 책등, 오른쪽 → 배, 위 → 윗면 쪽.
 * 표지 한가운데에서는 정면을 본다. point는 표지 중심이 0, 가장자리가 ±1(그 밖은 가장자리와 같다).
 */
export function currentBookTurn(point: { x: number; y: number } | null): BookTurn {
  if (!point) return CURRENT_REST
  return { yaw: -clampUnit(point.x) * CURRENT_TURN.yaw + 0, pitch: -clampUnit(point.y) * CURRENT_TURN.pitch + 0 }
}

/**
 * 쉬는 자세에서 얼마나 더 도는가(deg). 쉬는 자세는 책이 도는 움직임과 함께 도착하고,
 * 이 값만 포인터 반응의 스프링이 싣는다. 포인터가 없으면 0(쉬는 자세로 돌아간다).
 */
export function currentTurnOffset(tilt: Tilt | null): BookTurn {
  if (!tilt) return { yaw: 0, pitch: 0 }
  const turn = currentBookTurn(coverPointFrom(tilt))
  return { yaw: turn.yaw - CURRENT_REST.yaw, pitch: turn.pitch - CURRENT_REST.pitch }
}

export interface SilhouetteInput {
  coverWidth: number
  spineWidth: number
  bookHeight: number
  /** deg */
  yaw: number
}

/**
 * yaw만큼 돈 가운데 책이 화면에서 차지하는 자리(px, 책 줄의 중심이 원점, 아래가 +y)와
 * 보이는 폭: 앞표지(cover), 책등(spine), 배(foreEdge). 숨은 면은 0.
 * 카메라와 같은 투영이다(눈은 (0, EYE_LIFT, PERSPECTIVE)·책 높이, 책의 중심은 `bookPoseTargets`의 z).
 */
export function currentSilhouette({ coverWidth, spineWidth, bookHeight, yaw }: SilhouetteInput) {
  const rad = (yaw * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const distance = bookHeight * PERSPECTIVE
  const eye = bookHeight * EYE_LIFT
  const z0 = -spineWidth / 2 + bookHeight * CURRENT_POP
  const corner = (x: number, z: number) => {
    const scale = distance / (distance - (-x * sin + z * cos + z0))
    return {
      x: (x * cos + z * sin) * scale,
      top: -(eye + (bookHeight / 2 - eye) * scale),
      bottom: -(eye + (-bookHeight / 2 - eye) * scale),
    }
  }
  const frontLeft = corner(-coverWidth / 2, spineWidth / 2)
  const frontRight = corner(coverWidth / 2, spineWidth / 2)
  const backLeft = corner(-coverWidth / 2, -spineWidth / 2)
  const backRight = corner(coverWidth / 2, -spineWidth / 2)
  const all = [frontLeft, frontRight, backLeft, backRight]
  return {
    left: Math.min(...all.map((c) => c.x)),
    right: Math.max(...all.map((c) => c.x)),
    top: Math.min(...all.map((c) => c.top)),
    bottom: Math.max(...all.map((c) => c.bottom)),
    cover: frontRight.x - frontLeft.x,
    spine: Math.max(0, frontLeft.x - backLeft.x),
    foreEdge: Math.max(0, backRight.x - frontRight.x),
  }
}

/**
 * 책의 보이는 면이 화면에서 차지하는 상자(포커스 링의 자리). 책 줄의 중심이 원점(px, 아래가 +y).
 * 책등은 z=0 평면에 있어 배치와 같고, 가운데 표지는 앞으로 나와 있는 만큼 원근으로 커진다.
 * spineWidth(가운데 책의 두께, px)를 주면 쉬는 자세로 돌아 있는 책 전체를 두른다(가로는 책의 축에 맞춘 채).
 */
export function focusBoxFor(slot: BookSlot, bookHeight: number, spineWidth?: number) {
  if (slot.isCurrent && spineWidth !== undefined) {
    const s = currentSilhouette({ coverWidth: slot.faceWidth, spineWidth, bookHeight, yaw: CURRENT_REST.yaw })
    return { x: 0, y: (s.top + s.bottom) / 2, width: 2 * Math.max(-s.left, s.right), height: s.bottom - s.top }
  }
  const scale = slot.isCurrent ? PERSPECTIVE / (PERSPECTIVE - CURRENT_POP) : 1
  return {
    x: slot.x * scale,
    y: bookHeight * EYE_LIFT * (scale - 1),
    width: slot.faceWidth * scale,
    height: bookHeight * scale,
  }
}

// ── 책 페이지 ──────────────────────────────────────────────────────────────
// 가운데 책을 집어 들어 화면 왼쪽에 띄우고(오른쪽에는 소개 글), 나머지 책은 왼쪽으로 쓸려 나간다.
// 카메라는 서가와 같다(눈은 (0, EYE_LIFT·H, PERSPECTIVE·H), z=0 평면이 CSS px와 1:1). 책은 크기를 키우지 않고
// 보는 사람 쪽으로 다가와서 커 보인다.

/** 책 한 권의 자세(장면 좌표: 길이 px, 각 rad). yaw +는 책등이 보는 사람 쪽으로(앞표지가 오른쪽을 본다) */
export interface Pose6 {
  x: number
  y: number
  z: number
  yaw: number
  pitch: number
  roll: number
}

/** 책 페이지의 자리를 정하는 데 쓰는 화면 치수(`Stage`의 일부) */
export interface PageView {
  /** 캔버스(화면)의 크기 */
  width: number
  height: number
  /** 서가에서 책의 세로 중심이 화면 위에서 몇 px 내려온 곳인가(장면의 y=0) */
  centreY: number
  /** 서가에서의 책 높이(px). 모형의 크기 */
  bookHeight: number
}

/** 떠 있는 책의 자리와 자세. 길이는 화면 대비, 각은 deg */
export const PAGE = {
  /**
   * 책의 중심: 화면 왼쪽에서 폭의 27%, 위에서 높이의 55%(위의 제목 띠와 아래 조작부 사이).
   * 왼쪽으로 붙여 둔다: 나중에 책을 펼치면 책등에서 오른쪽으로 표지 폭의 두 배를 차지한다.
   */
  centreX: 0.27,
  centreY: 0.565,
  /** 오른쪽 글이 시작하는 자리(화면 폭 대비). 펼친 책이 여기까지 오지 않는다. bookPage.css의 --text-from과 같은 값 */
  textFrom: 0.62,
  /** 보이는 책 높이(책의 중심에서): 화면 높이의 64%(판 안에 들어가는 크기). 돌아서 가까워진 책등 쪽은 이보다 조금 크게 보인다 */
  height: 0.64,
  /** 좁은 화면: 보이는 표지 폭이 화면 폭의 이 비율을 넘지 않게 줄인다 */
  maxWidth: 0.34,
  /**
   * 쉬는 자세: 앞표지가 오른쪽(글 쪽)을 보도록 돌아 책등이 넓게 보이고, 뒤로 조금만 누워 아랫면이 살짝 보인다
   * (pitch −: 윗쪽이 멀어진다). 공중에 떠 있는 듯 윗쪽이 왼쪽으로 조금 기울었다(roll +)
   */
  rest: { yaw: 30, pitch: -7, roll: 5 },
  /** 포인터가 화면 가장자리에 있을 때 더 도는 각 */
  turn: { yaw: 5, pitch: 3 },
  /** 뒤표지를 보일 때 책이 반 바퀴 도는 시간(초) */
  flipSeconds: 0.9,
}

const radOf = (d: number) => (d * Math.PI) / 180
const clamp01 = (n: number) => Math.min(1, Math.max(0, n))
const mix = (a: number, b: number, t: number) => a + (b - a) * t

/** 떠 있는 책이 화면에서 차지하는 자리(px, 화면 왼쪽 위가 원점)와 보이는 높이 */
export function pageSpot({ width, height }: Pick<PageView, 'width' | 'height'>, coverAspect: number) {
  return {
    x: width * PAGE.centreX,
    y: height * PAGE.centreY,
    height: Math.min(height * PAGE.height, (width * PAGE.maxWidth) / coverAspect),
  }
}

/** 장면의 자세가 화면의 어디에, 얼마나 크게 보이는가(책의 중심, px. 화면 왼쪽 위가 원점) */
export function projectPose(view: PageView, pose: Pick<Pose6, 'x' | 'y' | 'z'>) {
  const distance = view.bookHeight * PERSPECTIVE
  const eye = view.bookHeight * EYE_LIFT
  const scale = distance / (distance - pose.z)
  return {
    x: view.width / 2 + pose.x * scale,
    y: view.centreY - (eye + (pose.y - eye) * scale),
    height: view.bookHeight * scale,
  }
}

/** 떠 있는 책의 자세: `pageSpot`의 자리에 그 크기로 보이도록 다가온 자리 + 쉬는 자세 */
export function pagePose(view: PageView, coverAspect: number): Pose6 {
  const spot = pageSpot(view, coverAspect)
  const distance = view.bookHeight * PERSPECTIVE
  const eye = view.bookHeight * EYE_LIFT
  // 보이는 크기 = 책 높이 · distance / (distance − z)
  const k = view.bookHeight / spot.height
  return {
    x: (spot.x - view.width / 2) * k,
    y: eye + (view.centreY - spot.y - eye) * k,
    z: distance * (1 - k),
    yaw: radOf(PAGE.rest.yaw),
    pitch: radOf(PAGE.rest.pitch),
    roll: radOf(PAGE.rest.roll),
  }
}

/**
 * 펼친 책의 자리와 자세. 책등이 왼쪽 판의 가운데에 오고, 그 좌우로 표지 폭만큼씩 펼쳐진다.
 * bookPage.css의 펼친 책 조작 영역(.bookpage__hit)과 같은 값이다.
 */
export const PAGE_SPREAD = {
  /** 책등의 자리: 판(왼쪽 여백 ~ 화면 폭의 60%)의 가운데쯤, 판(제목 띠 아래 ~ 조작부 위)의 세로 가운데쯤 */
  centreX: 0.307,
  centreY: 0.55,
  /** 보이는 책 높이: 화면 높이의 66%(덮인 책보다 가까이 온다: 판에 여백이 많이 남지 않는다). 펼친 폭(표지 폭의 두 배)이 화면 폭의 50%를 넘지 않게 줄인다 */
  height: 0.66,
  maxWidth: 0.5,
  /**
   * 거의 정면으로 아주 조금만 돌아 있고, 뒤로는 조금만 누워 있다(2026-11-24: −20° → −9°. 책이 보는 사람에게서 멀어져
   * 누워 보인다는 편집자 요청으로 앞으로 일으켰다. 아랫면은 조금만 보인다)
   */
  rest: { yaw: 4, pitch: -9, roll: 0 },
  /** 포인터를 따라 도는 각을 덮인 책의 이만큼으로 한다(펼친 책은 포인터를 더 크게 따라 돈다) */
  pointer: 2.2,
}

/** 펼친 책이 화면에서 차지하는 자리: 책등의 자리(px)와 보이는 책 높이 */
export function spreadSpot({ width, height }: Pick<PageView, 'width' | 'height'>, coverAspect: number) {
  return {
    x: width * PAGE_SPREAD.centreX,
    y: height * PAGE_SPREAD.centreY,
    height: Math.min(height * PAGE_SPREAD.height, (width * PAGE_SPREAD.maxWidth) / (coverAspect * 2)),
  }
}

/**
 * 펼친 책이 제 중심에서 왼쪽으로 뻗는 거리(책 높이 대비): 젖힌 표지의 바깥 끝(표지 폭의 1.5배)에 여유를 더한 것.
 * 그림자를 만드는 조명의 상자가 여기까지 닿아야 왼쪽 면의 그림자가 잘리지 않는다
 */
export const openBookReach = (coverAspect: number) => coverAspect * 1.5 + 0.12

/** 펼친 책의 자세: 책등이 `spreadSpot`의 자리에 오도록 책의 중심을 표지 폭의 반만큼 오른쪽에 둔다 */
export function spreadPose(view: PageView, coverAspect: number): Pose6 {
  const spot = spreadSpot(view, coverAspect)
  const distance = view.bookHeight * PERSPECTIVE
  const eye = view.bookHeight * EYE_LIFT
  const k = view.bookHeight / spot.height
  return {
    x: (spot.x - view.width / 2) * k + (view.bookHeight * coverAspect) / 2,
    y: eye + (view.centreY - spot.y - eye) * k,
    z: distance * (1 - k),
    yaw: radOf(PAGE_SPREAD.rest.yaw),
    pitch: radOf(PAGE_SPREAD.rest.pitch),
    roll: radOf(PAGE_SPREAD.rest.roll),
  }
}

/** 두 자세의 사이(t: 0 = a, 1 = b) */
export function mixPose(a: Pose6, b: Pose6, t: number): Pose6 {
  return {
    x: mix(a.x, b.x, t),
    y: mix(a.y, b.y, t),
    z: mix(a.z, b.z, t),
    yaw: mix(a.yaw, b.yaw, t),
    pitch: mix(a.pitch, b.pitch, t),
    roll: mix(a.roll, b.roll, t),
  }
}

/**
 * 떠 있는 책이 포인터를 따라 더 도는 각(deg). point는 화면 가운데가 0, 가장자리가 ±1(오른쪽·아래가 +).
 * 앞표지가 포인터 쪽을 조금 본다. 포인터가 없으면 0.
 */
export function pagePointerTurn(point: { x: number; y: number } | null): BookTurn {
  if (!point) return { yaw: 0, pitch: 0 }
  return { yaw: clampUnit(point.x) * PAGE.turn.yaw + 0, pitch: clampUnit(point.y) * PAGE.turn.pitch + 0 }
}

/**
 * 열기(ms). 차례로 일어난다: 집어 들기(lift: 그 자리에서 앞으로 나오며 뒤로 누운 자세가 된다) →
 * 나머지 책이 왼쪽으로 쓸려 나가기(sweep) → 책 페이지가 들어온다(pageAt부터 pageIn 동안: 바탕색·판) →
 * 책 페이지가 다 들어오면 든 책이 제자리로 옮겨 간다(slide). 글은 그 뒤에 나온다.
 */
export const PAGE_OPEN = {
  /** 집어 드는 시간: 보는 사람 쪽으로 다가오며 책 페이지의 쉬는 자세(뒤로 누운 자세)로 돈다 */
  lift: 480,
  /** 나머지 책: 쓸려 나가기 시작하는 때(책이 거의 들린 뒤), 한 권이 나가는 시간, 옆 책과의 시차, 시차의 합의 상한 */
  sweepAt: 320,
  sweep: 420,
  stagger: 30,
  maxStagger: 400,
  /** 책 페이지가 들어오기 시작하는 때(책이 다 쓸려 나간 뒤)와 걸리는 시간. CSS(index.css의 --page-open-at, --page-in)와 같은 값 */
  pageAt: 1100,
  pageIn: 500,
  /** 든 책이 자리로 옮겨 가기 시작하는 때(책 페이지가 거의 들어온 뒤)와 걸리는 시간 */
  slideAt: 1520,
  slide: 720,
  /** 들린 책: 이만큼(책 높이 대비) 앞으로 나오고, 그만큼 커 보이는 윗쪽이 제목 띠에 닿지 않게 이만큼 내려온다 */
  forward: 0.15,
  drop: 0.04,
  total: 2250,
}

/**
 * 닫기(ms). 차례로 일어난다: 책 페이지가 치워진다(clear: 글·바탕색·판) → 떠 있던 책이 서가의 가운데로
 * 돌아와 조금 앞으로 나온 채 선다(retAt부터 ret 동안) → 나머지 책이 왼쪽에서 돌아온다(sweep) →
 * 앞으로 나와 있던 책이 뒤로 빠지며 제자리에 놓인다(settleAt부터 total까지).
 */
export const PAGE_CLOSE = {
  /** 책 페이지가 치워지는 시간. CSS(index.css의 --page-clear)와 같은 값 */
  clear: 450,
  /** 책이 서가의 가운데로 돌아오기 시작하는 때(책 페이지가 거의 치워진 뒤)와 걸리는 시간 */
  retAt: 380,
  ret: 700,
  /** 나머지 책: 돌아오기 시작하는 때(책이 가운데에 선 뒤), 한 권이 들어오는 시간, 시차 */
  sweepAt: 1020,
  sweep: 520,
  stagger: 26,
  maxStagger: 380,
  /** 돌아온 책이 제자리보다 이만큼(책 높이 대비) 앞에 나와, 이만큼 내려와 선다(집어 들 때와 같다: 제목 띠에 닿지 않는다) */
  lift: 0.15,
  drop: 0.04,
  /** 책들이 돌아온 뒤, 앞에 나와 있던 책이 뒤로 놓이기 시작하는 때 */
  settleAt: 1880,
  total: 2300,
}

/**
 * 서가로 돌아온 책이 놓이는 움직임(0~1, PAGE_CLOSE.lift에 곱한다): 돌아오는 동안 제자리보다 조금 앞으로
 * 나와 도착하고, 잠깐 멈춘 뒤 뒤로 살짝 빠지며 제자리에 놓인다. 집어 들었던 책을 다시 꽂는 느낌이다.
 */
export function returnSettle(elapsedMs: number) {
  if (!(elapsedMs > 0) || elapsedMs >= PAGE_CLOSE.total) return 0
  const arriveAt = PAGE_CLOSE.retAt + PAGE_CLOSE.ret
  if (elapsedMs < arriveAt) return easeSlide((elapsedMs - PAGE_CLOSE.retAt) / PAGE_CLOSE.ret)
  const settleAt = PAGE_CLOSE.settleAt
  if (elapsedMs < settleAt) return 1
  return 1 - easeSettle((elapsedMs - settleAt) / (PAGE_CLOSE.total - settleAt))
}

/** 책 페이지 사이(ms): 보던 책이 왼쪽으로 나가고(exit), 다음 책이 왼쪽에서 들어온다(enter) */
export const PAGE_TURN = {
  exit: 380,
  enterAt: 320,
  enter: 540,
  total: 860,
  /** 나가며 더 도는 각, 들어오며 덜 돌아 있는 각(deg) */
  exitYaw: 22,
  enterYaw: -30,
}

const easeLift = cubicBezier(0.3, 0, 0.2, 1)
const easeSlide = cubicBezier(0.5, 0, 0.15, 1)
const easeEnter = cubicBezier(0.16, 0.76, 0.2, 1)
/** 가속해 나가기 / 감속해 들어오기 */
const accelerate = (p: number) => clamp01(p) ** 2.2
const decelerate = (p: number) => 1 - (1 - clamp01(p)) ** 2.2

/**
 * 전환하는 동안 책에 더하는 작은 움직임(deg). 책이 서서 기다리는 구간이 굳어 보이지 않게 한다.
 * 한 번만 움직인다: 들린 뒤부터 자리에 닿을 때까지(닫을 때는 떠나서 서가에 내려앉기 전까지) 가는 쪽으로 조금 돌며 기울었다가 돌아온다
 */
export const MOTION = { nudge: { yaw: 7, pitch: 2, roll: 2.5 } }

/** start~end 구간에서 0 → 1 → 0 으로 한 번 부푼다(양 끝에서 부드럽게 이어진다) */
function swell(elapsedMs: number, start: number, end: number) {
  const t = clamp01((elapsedMs - start) / (end - start))
  return Math.sin(Math.PI * t) ** 2
}

/**
 * 열 때 가운데 책의 자세: 서가의 자세(from)에서 손에 들린 듯 다가오며 정면으로 선 뒤,
 * 떠 있는 자리(to)로 옮겨 가며 쉬는 자세로 돈다. 두 움직임은 조금 겹쳐 한 번에 이어진다.
 */
export function pickUpPose(from: Pose6, to: Pose6, elapsedMs: number, bookHeight: number): Pose6 {
  if (!(elapsedMs > 0)) return from
  const a = easeLift(elapsedMs / PAGE_OPEN.lift)
  const b = easeSlide((elapsedMs - PAGE_OPEN.slideAt) / PAGE_OPEN.slide)
  // 들린 자리: 가는 깊이의 60%까지, 적어도 책 높이의 20%만큼은 다가오고(떠 있는 자리가 가까워도
  // 집어 든 느낌이 나게), 책 높이의 2%만큼 올라온다
  const heldZ = Math.max(mix(from.z, to.z, 0.6), from.z + bookHeight * PAGE_OPEN.forward)
  const nudge = swell(elapsedMs, PAGE_OPEN.lift * 0.6, PAGE_OPEN.slideAt + PAGE_OPEN.slide)
  return {
    x: mix(from.x, to.x, b),
    y: from.y - bookHeight * PAGE_OPEN.drop * a * (1 - b) + (to.y - from.y) * b,
    z: from.z + (heldZ - from.z) * a + (to.z - heldZ) * b,
    // 집어 드는 동안 그 자리에서 책 페이지의 쉬는 자세(뒤로 누운 자세)가 된다. 옮겨 가는 동안에는 자세가 그대로다
    // 들린 뒤부터 자리에 닿을 때까지 한 번, 가는 쪽으로 조금 돌며 기울었다가 돌아온다(nudge)
    yaw: mix(from.yaw, to.yaw, a) - nudge * radOf(MOTION.nudge.yaw),
    pitch: mix(from.pitch, to.pitch, a) + nudge * radOf(MOTION.nudge.pitch),
    roll: mix(from.roll, to.roll, a) + nudge * radOf(MOTION.nudge.roll),
  }
}

/** 닫을 때 책의 자세: 책들이 돌아올 때까지 떠 있던 자리(from)에 있다가, 서가의 자세(to)로 한 번에 돌아간다 */
export function returnPose(from: Pose6, to: Pose6, elapsedMs: number): Pose6 {
  if (!(elapsedMs > PAGE_CLOSE.retAt)) return from
  const p = easeSlide((elapsedMs - PAGE_CLOSE.retAt) / PAGE_CLOSE.ret)
  const nudge = swell(elapsedMs, PAGE_CLOSE.retAt, PAGE_CLOSE.settleAt)
  return {
    x: mix(from.x, to.x, p),
    y: mix(from.y, to.y, p),
    z: mix(from.z, to.z, p),
    // 떠나서 책들이 돌아올 때까지 한 번, 가는 쪽으로 조금 돌며 기울었다가 돌아온다(nudge)
    yaw: mix(from.yaw, to.yaw, p) + nudge * radOf(MOTION.nudge.yaw),
    pitch: mix(from.pitch, to.pitch, p) - nudge * radOf(MOTION.nudge.pitch),
    roll: mix(from.roll, to.roll, p) - nudge * radOf(MOTION.nudge.roll),
  }
}

export interface SweepPlan {
  /** 쓸려 나가는(화면에 보이는) 책의 수 */
  count: number
  /** 책마다: 나가는 순서(왼쪽 끝이 0)와 가는 거리(px). 가운데 책과 화면 밖의 책은 null(움직임 없이 사라진다) */
  books: ({ rank: number; travel: number } | null)[]
}

/**
 * 나머지 책이 왼쪽으로 쓸려 나가는 계획. xs는 책마다의 가로 자리(화면 가운데가 0).
 * 화면(±halfWidth + margin) 안의 책만 움직이고, 왼쪽 끝의 책부터 차례로 나간다: 같은 곡선으로 한 박자씩
 * 늦게 떠나므로 앞선 책이 늘 더 멀리 가 있어 책끼리 겹치지 않는다. 모두 왼쪽 화면 밖(−halfWidth − margin)까지 간다.
 */
export function sweepPlan(xs: readonly number[], featured: number, halfWidth: number, margin: number): SweepPlan {
  const limit = halfWidth + margin
  const shown = xs.map((x, i) => ({ x, i })).filter(({ x, i }) => i !== featured && Math.abs(x) < limit)
  shown.sort((a, b) => a.x - b.x)
  const books: SweepPlan['books'] = xs.map(() => null)
  shown.forEach(({ x, i }, rank) => (books[i] = { rank, travel: x + limit }))
  return { count: shown.length, books }
}

const staggerOf = (t: { stagger: number; maxStagger: number }, count: number) =>
  count > 1 ? Math.min(t.stagger, t.maxStagger / (count - 1)) : 0

/** 열 때: rank번째 책이 쓸려 나간 정도(0 = 제자리, 1 = 화면 밖). 가속하며 나간다 */
export function sweepOutOffset(elapsedMs: number, rank: number, count: number) {
  return accelerate((elapsedMs - PAGE_OPEN.sweepAt - rank * staggerOf(PAGE_OPEN, count)) / PAGE_OPEN.sweep)
}

/** 닫을 때: rank번째 책이 아직 나가 있는 정도(1 = 화면 밖, 0 = 제자리). 나갈 때의 반대 순서(오른쪽 끝부터)로, 감속하며 돌아온다 */
export function sweepInOffset(elapsedMs: number, rank: number, count: number) {
  const order = count - 1 - rank
  return 1 - decelerate((elapsedMs - PAGE_CLOSE.sweepAt - order * staggerOf(PAGE_CLOSE, count)) / PAGE_CLOSE.sweep)
}

/** 떠 있는 책(pose)이 화면 왼쪽 밖으로 완전히 나간 가로 자리(장면 좌표) */
export function pageOffLeft(view: PageView, pose: Pose6, coverAspect: number) {
  const distance = view.bookHeight * PERSPECTIVE
  const k = (distance - pose.z) / distance
  const seenHeight = view.bookHeight / k
  return (-view.width / 2 - seenHeight * (coverAspect / 2 + 0.2)) * k
}

/** 책 페이지 사이: 보던 책이 왼쪽으로 가속하며 나간다(off = `pageOffLeft`) */
export function turnExitPose(pose: Pose6, off: number, elapsedMs: number): Pose6 {
  if (!(elapsedMs > 0)) return pose
  const e = accelerate(elapsedMs / PAGE_TURN.exit)
  return { ...pose, x: mix(pose.x, off, e), yaw: pose.yaw + radOf(PAGE_TURN.exitYaw) * e }
}

/** 책 페이지 사이: 다음 책이 왼쪽 밖에서 들어와 떠 있는 자리에 멈춘다 */
export function turnEnterPose(pose: Pose6, off: number, elapsedMs: number): Pose6 {
  const e = easeEnter((elapsedMs - PAGE_TURN.enterAt) / PAGE_TURN.enter)
  return { ...pose, x: mix(off, pose.x, e), yaw: pose.yaw + radOf(PAGE_TURN.enterYaw) * (1 - e) }
}

/**
 * 책 페이지의 모습(책 뒤 페이지에 드리우는 그림자, 서가 바닥 없음)이 얼마나 들어와 있는가(0~1).
 * 열 때는 책들이 쓸려 나간 뒤 책 페이지와 함께 들어오고, 닫을 때는 책 페이지가 치워지는 동안 빠진다.
 */
export function pageAmount(kind: 'open' | 'close', elapsedMs: number) {
  if (kind === 'open') {
    const p = clamp01((elapsedMs - PAGE_OPEN.pageAt) / PAGE_OPEN.pageIn)
    return p * p * (3 - 2 * p)
  }
  return 1 - clamp01(elapsedMs / PAGE_CLOSE.clear)
}

/** 책을 펼쳐 읽는 동안 캔버스를 그리는 배율: 보통 화면(배율 1)에서도 두 배로 그려 줄여 보인다(작은 본문 글자가 또렷하다) */
export const READ_PIXEL_RATIO = 2

/** 캔버스를 그리는 배율. base는 화면의 배율(`Shelf3D`가 2까지로 자른 값), reading은 책이 펼쳐져 있는가 */
export function renderPixelRatio(base: number, reading: boolean) {
  return reading ? Math.max(base, READ_PIXEL_RATIO) : base
}

/**
 * 책을 그리는 순서(작을수록 먼저). 화면 가운데에 가까운 책부터 그린다: 앞에 선 책이 먼저 그려지면
 * 그 뒤에 가려진 면은 깊이 검사에서 걸러져 조명·그림자 계산을 하지 않는다. 보이는 모습은 같다.
 * x는 책의 가로 자리(px, 화면 가운데가 0)
 */
export function drawOrderFor(x: number) {
  return Math.round(Math.abs(x))
}

/**
 * 책 페이지의 그림자 조명이 그림자를 만드는가. 서가만 보일 때(mix = 0)는 끈다:
 * 켜 두면 벽에 그림자가 지지 않는 동안에도 모든 책의 모든 화소가 그 그림자 맵을 읽는다.
 * mix는 책 페이지의 모습이 들어와 있는 정도(0 = 서가, 1 = 책 페이지)
 */
export function pageShadowOn(mix: number) {
  return mix > 0
}
