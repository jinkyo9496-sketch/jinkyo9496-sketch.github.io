/**
 * 학제별 분류 화면의 책(WebGL)이 따르는 순수 계산. three에 의존하지 않는다(단위 테스트 `tests/fieldsMotion.test.ts`).
 *
 * 단위와 축: **책 높이 = 1**. 보는 사람 쪽이 +Z, 오른쪽이 +X, 위가 +Y.
 * 멈춘 책의 표지 면이 z = 0(모든 책의 앞표지가 이 한 평면에 놓인다), 줄의 세로 가운데가 y = 0,
 * x = 0은 그 평면에서 화면(책 자리)의 왼쪽 끝이다. 표지 면 뒤 `wallDepth`만큼 떨어진 곳에 그림자만 받는 벽이 있다.
 * 책의 축은 `src/book3d`와 같다: +Z 앞표지 · −X 책등 · +Y 책의 위쪽. 쿼터니언은 [x, y, z, w](three와 같은 순서).
 *
 * 한 학문의 책이 하는 일(시간표 `fieldsTimeline`):
 *   등장(책등을 정면으로 보이며 조금씩 틈을 둔 줄이 서랍에서 밀려 나온다) → 벌어짐(표지 폭 + 여백의 간격으로)
 *   → 돌기(왼쪽 책부터 차례로, 문이 열리듯 제자리에서 세로축으로 90° 돌아 앞표지가 정면을 본다)
 * 서랍: 왼쪽의 글자 다이얼이 서랍이다. 책은 책 자리의 왼쪽 끝(x = 0, 다이얼과의 경계) 바깥에서 나오고,
 * 학문이 바뀌면 책등 쪽으로 돌아서며 모여 다시 그 안으로 들어간다(`exitBookPose`). 경계 가까이에서는 옅어진다(`edgeFadeWidth`).
 * 카메라는 처음부터 끝까지 움직이지 않는다: 줄의 가운데 높이에서 정면으로, 좁은 화각으로 본다(`fieldsView`).
 * 그래서 멈춘 표지는 화면에서 반듯한 직사각형이고, 왼쪽의 평면 글자 다이얼과 같은 면에 놓인 것으로 읽힌다.
 */
import { EYE_LIFT, PERSPECTIVE, cubicBezier, omegaForSettle, pagePose, springStep, type PageView, type Spring } from '../shelf3d/motion'

export type Vec3 = [number, number, number]
export type Quat = [number, number, number, number]

/** 시간(ms)과 도는 움직임의 모양. 조정은 여기서 한다 */
export const FIELDS_TIMING = {
  /** 등장: 줄지어 선 책등이 서랍(왼쪽 끝 바깥)에서 밀려 나온다. 처음에 빠르고 끝에서 부드럽게 멈춘다 */
  enterMs: 600,
  /** 벌어짐: 책 사이가 표지가 정면을 볼 때의 간격으로 벌어진다 */
  spreadMs: 450,
  /** 돌기: 한 권이 돌아 자리 잡기까지 */
  turnMs: 700,
  /** 돌기: 왼쪽 책부터 권당 이만큼씩 늦게 돈다 */
  turnStaggerMs: 60,
  /** 학문이 바뀌면 보이던 책이 책등 쪽으로 돌아서며 모여 서랍으로 들어가는 시간(전체) */
  exitMs: 450,
  /** 그 시간 가운데 돌아서기에 쓰는 몫(앞부분). 돌아서기가 먼저 끝나고 책등으로 서랍에 들어간다 */
  exitTurnShare: 0.6,
  /** 서랍으로 가는 빠르기의 모양(진행의 거듭제곱): 클수록 돌아서는 동안에는 거의 제자리에 있다가 끝에 빨려 들어간다 */
  exitPull: 3,
  /**
   * 학문이 바뀐 뒤 새 책이 등장하기까지 기다리는 시간(마지막 변경부터). 다이얼의 걸음 간격
   * (`FIELD_STEP_MS` 280)보다 길어야 계속 돌리는 동안 중간 학문이 등장하지 않는다
   */
  settleMs: 320,
  /** 화면에 들어설 때(서가에서 내려올 때) 등장하기까지 기다리는 시간: 화면 전환(700ms)의 뒷부분에 맞춘다 */
  arriveMs: 300,
  /**
   * 도는 움직임은 스프링에 매달린 문과 같다(`turnProgress`). 감쇠비: 1보다 작을수록 더 지나쳤다 돌아온다.
   * 0.8이면 90°의 1.5%, 약 1.4°만 지나친다
   */
  turnDamping: 0.8,
  /** 그 스프링의 빠르기(돌기 시간 전체를 1로 본 각진동수). 7.8이면 시간의 53%쯤에 정면을 지나고 끝에는 멈춰 있다 */
  turnOmega: 7.8,
}

/** 배치(책 높이 = 1) */
export const FIELDS_LAYOUT = {
  /** 한 화면에 보이는 책의 수 */
  visibleBooks: 3.5,
  /** 그 수를 잴 때 쓰는 표지 폭(1~47권의 `coverAspect`는 0.664~0.682) */
  coverWidth: 0.68,
  /**
   * 정면을 본 표지 사이의 여백. 책 자리를 다이얼 쪽으로 넓히면서(2026-11-23 "생명과학") 0.16 → 0.2: 넓어진 폭을 책이 아니라
   * 여백이 받아, 책 높이는 그대로(1440×900에서 약 328px)이고 한 화면에 여전히 세 권 반이다
   */
  gap: 0.2,
  /** 첫 책 왼쪽(다이얼 쪽)과 마지막 책 오른쪽의 여백. 책 자리의 왼쪽 끝이 다이얼 글자 바로 옆이라 좁게 둔다 */
  margin: 0.13,
  /** 등장할 때 선 책등 사이의 틈(책등 폭 0.07~0.11의 절반쯤). 벌어짐 단계에서 표지 간격까지 더 벌어진다 */
  enterGap: 0.06,
  /** 화면 세로에 들어와야 하는 높이: 아주 넓은 화면에서도 책(1)과 그 아래 그림자·포커스 링이 잘리지 않게 */
  minViewHeight: 1.3,
  /**
   * 서랍 안에 든 줄의 오른쪽 끝이 책 자리의 왼쪽 끝(x = 0)에서 이만큼 안쪽(다이얼 쪽)에 있다. 등장은 여기서 출발하고
   * 퇴장은 여기서 끝난다. 책등을 보이며 선 책은 뒤로 길어서(표지 폭만큼) 원근 때문에 뒤쪽이 화면 가운데 쪽으로
   * 조금 보이므로(약 0.05) 그보다 깊이 둔다
   */
  drawerInset: 0.1,
  /**
   * 책 자리의 왼쪽 끝에서 책이 옅어지는 구간의 폭(`edgeFadeWidth`). 첫 책 왼쪽 여백(`margin`)보다 좁아야
   * 멈춘 첫 책이 흐려지지 않는다(포인터 반응으로 살짝 돈 책의 모서리까지 보면 0.115까지)
   */
  edgeFade: 0.1,
  /**
   * 표지 면(z = 0)에서 뒤의 벽(그림자만 받는다)까지의 깊이. 가장 두꺼운 책(0.101)보다 깊어야 하고,
   * 얕을수록 그림자가 책 바로 뒤에 짧게 붙는다
   */
  wallDepth: 0.14,
}

/** 카메라: 움직이지 않는다. 줄의 가운데 높이에서 정면으로(내려다보는 각 0°) 본다 */
export const FIELDS_CAMERA = {
  /**
   * 세로 화각(deg). 좁을수록 멀리서 보는 것이라 원근이 사라진다. 6°면 카메라가 책 높이의 약 23배 거리에 있고,
   * 줄의 양 끝 책에서도 옆면(책등·배)이 책 높이의 1%도 드러나지 않는다
   */
  fovYDeg: 6,
}

/** 포인터를 올린 책: 책등이 조금 드러나게 살짝 돈다(다 돈 뒤에만, 마우스 포인터에서만) */
export const FIELDS_HOVER = {
  /** 도는 각(deg). 책등 쪽이 보는 사람에게 온다(책이 돌아 나온 방향으로 조금 되돌아가는 것) */
  yawDeg: 12,
  /** 자리 잡는 시간(ms). 임계 감쇠 스프링이라 넘치지 않는다 */
  settleMs: 350,
}

const HALF_PI = Math.PI / 2
const radians = (deg: number) => (deg * Math.PI) / 180
const clamp01 = (n: number) => Math.min(1, Math.max(0, n))
const mix = (a: number, b: number, t: number) => a + (b - a) * t
/** 서가 이동과 같은 이징(`--ease-shelf`) */
const easeShelf = cubicBezier(0.32, 0.12, 0.2, 1)
/** 서랍에서 밀려 나오는 움직임: 처음에 빠르고 끝에서 부드럽게 멈춘다 */
const easeDrawerOut = cubicBezier(0.16, 0.84, 0.3, 1)
/** 돌아서는 움직임: 멈춘 채 출발해 멈추며 끝난다 */
const smooth = (t: number) => t * t * (3 - 2 * t)

// ── 쿼터니언 ─────────────────────────────────────────────

const quatAboutY = (angle: number): Quat => [0, Math.sin(angle / 2), 0, Math.cos(angle / 2)]

/** 벡터를 쿼터니언으로 돌린다 */
export function rotateByQuat([x, y, z, w]: Quat, [vx, vy, vz]: Vec3): Vec3 {
  // t = 2 q × v,  v' = v + w t + q × t
  const tx = 2 * (y * vz - z * vy)
  const ty = 2 * (z * vx - x * vz)
  const tz = 2 * (x * vy - y * vx)
  return [vx + w * tx + (y * tz - z * ty), vy + w * ty + (z * tx - x * tz), vz + w * tz + (x * ty - y * tx)]
}

// ── 책의 크기와 줄 ───────────────────────────────────────

/** 책의 크기(책 높이 = 1): width = 표지 폭, depth = 두께 */
export interface BookSize {
  width: number
  depth: number
}

export const sizeOf = (book: { coverAspect: number; spineAspect: number }): BookSize => ({
  width: book.coverAspect,
  depth: book.spineAspect,
})

/** 한 학문의 책들이 놓이는 자리(책의 중심 x). 스크롤 0 기준 */
export interface RowPlan {
  /**
   * 표지가 정면을 보는 자리: 왼쪽 여백에서 시작해 (표지 폭 + 여백)씩. 책은 이 자리에 책등을 보이며 섰다가
   * 제자리에서 돈다(벌어져 선 자리와 멈춘 자리가 같다)
   */
  facing: number[]
  /** 줄지어 선 자리(등장이 끝났을 때): 첫 책은 제자리 그대로, 나머지는 그 오른쪽에 틈(`enterGap`)을 두고 선다 */
  packed: number[]
}

export function rowPlan(sizes: readonly BookSize[]): RowPlan {
  const facing: number[] = []
  const packed: number[] = []
  let left = FIELDS_LAYOUT.margin
  let packedLeft = 0
  sizes.forEach((size, i) => {
    facing.push(left + size.width / 2)
    if (i === 0) packedLeft = facing[0] - size.depth / 2
    packed.push(packedLeft + size.depth / 2)
    packedLeft += size.depth + FIELDS_LAYOUT.enterGap
    left += size.width + FIELDS_LAYOUT.gap
  })
  return { facing, packed }
}

/**
 * 책이 제자리에서 세로축으로 돌 때 쓸고 지나가는 원의 반지름(위에서 본 책의 대각선의 반).
 * 이웃한 두 책의 반지름을 더해도 간격(표지 폭 + 여백)보다 작으므로, 어떤 순서로 어떤 각에 있어도 서로 닿지 않는다.
 */
export const turnRadius = (size: BookSize) => Math.hypot(size.width, size.depth) / 2

// ── 시간표 ───────────────────────────────────────────────

export interface FieldsTimeline {
  /** 벌어지기 시작하는 때 */
  spreadAt: number
  /** i번째 책이 돌기 시작하는 때 */
  turnAt(i: number): number
  /** 마지막 책이 자리 잡는 때 */
  total: number
}

export function fieldsTimeline(count: number): FieldsTimeline {
  const T = FIELDS_TIMING
  const turnStart = T.enterMs + T.spreadMs
  const turnAt = (i: number) => turnStart + i * T.turnStaggerMs
  return { spreadAt: T.enterMs, turnAt, total: count > 0 ? turnAt(count - 1) + T.turnMs : 0 }
}

// ── 돌기 ─────────────────────────────────────────────────

/** 감쇠가 모자란 스프링이 0에서 1로 가는 길(u = 0에서 멈춘 채 출발한다) */
function springRise(u: number) {
  const { turnDamping: zeta, turnOmega: omega } = FIELDS_TIMING
  const damped = omega * Math.sqrt(1 - zeta * zeta)
  return 1 - Math.exp(-zeta * omega * u) * (Math.cos(damped * u) + ((zeta * omega) / damped) * Math.sin(damped * u))
}
const SPRING_END = springRise(1)

/**
 * 도는 진행(0 = 책등이 정면, 1 = 앞표지가 정면). u는 돌기 시간의 진행(0~1).
 * 문이 열리듯 천천히 출발해 빨라졌다가, 정면을 아주 조금(약 1.4°) 지나쳤다 돌아와 자리 잡는다. 그래서 1을 조금 넘는 값이 나온다.
 */
export function turnProgress(u: number) {
  if (u <= 0) return 0
  if (u >= 1) return 1
  return springRise(u) / SPRING_END
}

/** 그 진행에서 책이 돌아 있는 각(rad): 책등이 정면이면 90°, 앞표지가 정면이면 0. extraDeg는 포인터 반응이 보태는 각 */
const turnAngle = (progress: number, extraDeg = 0) => (1 - Math.max(0, progress)) * HALF_PI + radians(extraDeg)

/**
 * 도는 동안의 자세: 세로축(Y)으로만 돈다. 책등을 보이며 선 자세(Ry 90°: 책등 −X가 보는 사람 쪽 +Z)에서
 * 책등이 왼쪽으로 넘어가 앞표지(+Z)가 정면을 보는 자세(돌림 없음)까지. extraDeg는 포인터 반응이 보태는 각.
 */
export function turnQuaternion(progress: number, extraDeg = 0): Quat {
  return quatAboutY(turnAngle(progress, extraDeg))
}

/**
 * 그 각으로 돈 책의 중심 z. 정면에서 좁은 화각으로 보므로 앞뒤 자리는 화면에서 거의 보이지 않고(제자리에서 도는 것으로
 * 보인다), 벽에 지는 그림자의 길이만 정한다:
 *   - 책등을 보이며 섰을 때(90°): 책등 면이 표지 면(z = 0)에 온다. 책의 뒤쪽은 벽 너머로 들어가 있어(벽은 그림자만
 *     받는 면이라 책을 가리지 않는다) 깊은 책이 긴 그림자를 드리우지 않고, 책등이 멈춘 표지와 같은 크기로 보인다
 *   - 앞표지가 정면일 때(0°): 앞표지가 표지 면에 오고 책은 통째로 벽 앞에 있다
 *   - 그 사이와 포인터 반응의 작은 각: 둘을 sin²으로 잇는다. 살짝 돈 책은 책등 쪽 모서리가 앞으로 나와 그림자가 조금 길어진다
 */
function turnDepth(angle: number, size: BookSize) {
  const sin = Math.sin(angle)
  // 중심에서 책의 앞쪽 끝·뒤쪽 끝까지의 깊이
  const reach = (size.width / 2) * Math.abs(sin) + (size.depth / 2) * Math.abs(Math.cos(angle))
  return mix(reach - size.depth, -reach, sin * sin)
}

// ── 화면(카메라) ─────────────────────────────────────────

export interface FieldsCamera {
  position: Vec3
  target: Vec3
  /** 세로 화각(deg) */
  fovY: number
  aspect: number
}

export interface FieldsView {
  /** 책 자리(캔버스)의 크기(CSS px) */
  width: number
  height: number
  /** 표지 면(z = 0)에서 화면에 들어오는 가로 길이(책 높이 단위) */
  visibleWidth: number
  /** 그 면에서 1(책 높이)이 화면의 몇 px인가. 끌기(px)를 스크롤 값으로 바꿀 때 쓴다 */
  pxPerUnit: number
  camera: FieldsCamera
}

/**
 * 책 자리의 크기에서 카메라를 정한다: 표지 면에서 화면 폭에 정확히 세 권 반
 * (왼쪽 여백 + 세 권과 그 사이 여백 + 네 번째 책의 반)이 들어오게 거리를 맞춘다. 카메라는 줄의 가운데 높이에서 정면으로 본다.
 */
export function fieldsView({ width, height }: { width: number; height: number }): FieldsView {
  const L = FIELDS_LAYOUT
  const aspect = width / Math.max(1, height)
  const forBooks = L.margin + L.visibleBooks * L.coverWidth + Math.floor(L.visibleBooks) * L.gap
  const visibleWidth = Math.max(forBooks, L.minViewHeight * aspect)
  const distance = visibleWidth / (2 * aspect * Math.tan(radians(FIELDS_CAMERA.fovYDeg) / 2))
  return {
    width,
    height,
    visibleWidth,
    pxPerUnit: width / visibleWidth,
    camera: {
      position: [visibleWidth / 2, 0, distance],
      target: [visibleWidth / 2, 0, 0],
      fovY: FIELDS_CAMERA.fovYDeg,
      aspect,
    },
  }
}

/** 깊이 z인 면에서 화면 세로의 반에 들어오는 길이(책 높이 단위) */
const halfHeightAt = ({ camera }: FieldsView, z: number) => (camera.position[2] - z) * Math.tan(radians(camera.fovY) / 2)

/** 월드의 점이 책 자리의 어디(CSS px, 왼쪽 위가 0)에 보이는가 */
export function projectPoint(view: FieldsView, [x, y, z]: Vec3) {
  const half = halfHeightAt(view, z)
  const nx = (x - view.camera.position[0]) / (half * view.camera.aspect)
  const ny = y / half
  return { x: ((nx + 1) / 2) * view.width, y: ((1 - ny) / 2) * view.height }
}

/** 책 자리의 한 점(CSS px)이 가리키는, 깊이 planeZ인 면 위의 점. 기본은 표지 면(z = 0) */
export function planePointAt(view: FieldsView, px: number, py: number, planeZ = 0) {
  const half = halfHeightAt(view, planeZ)
  const nx = (px / view.width) * 2 - 1
  const ny = 1 - (py / view.height) * 2
  return { x: view.camera.position[0] + nx * half * view.camera.aspect, y: ny * half }
}

/**
 * 표지 면의 점 위에 있는 책(없으면 null). scroll은 줄이 왼쪽으로 밀린 길이(책 높이 단위).
 * 포인터 반응으로 책이 살짝 돌아 있어도 멈춘 자리의 표지로 판정한다(클릭과 끌기가 흔들리지 않는다).
 */
export function facingBookAt(plan: RowPlan, sizes: readonly BookSize[], point: { x: number; y: number }, scroll = 0) {
  if (Math.abs(point.y) > 0.5) return null
  const x = point.x + scroll
  const hit = sizes.findIndex((size, i) => Math.abs(x - plan.facing[i]) <= size.width / 2)
  return hit < 0 ? null : hit
}

/**
 * 가로로 끌어 넘길 수 있는 길이(책 높이 단위): 마지막 책과 오른쪽 여백이 화면에 들어올 때까지.
 * 세 권 이하는 0(고정).
 */
export function scrollRange(sizes: readonly BookSize[], view: FieldsView) {
  if (sizes.length === 0) return 0
  const plan = rowPlan(sizes)
  const last = sizes.length - 1
  const end = plan.facing[last] + sizes[last].width / 2 + FIELDS_LAYOUT.margin
  return Math.max(0, end - view.visibleWidth)
}

/**
 * 책마다 멈출 자리(책 높이 단위): 그 책이 첫 책의 자리(왼쪽 여백 바로 뒤)에 오는 스크롤. 범위를 넘으면 끝이다.
 * ←/→로 한 권씩 넘길 때 쓴다(`scroll.ts`의 `stepTarget`). 세 권 이하는 모두 0.
 */
export function scrollStops(sizes: readonly BookSize[], view: FieldsView) {
  const plan = rowPlan(sizes)
  const max = scrollRange(sizes, view)
  const leftOf = (i: number) => plan.facing[i] - sizes[i].width / 2
  return sizes.map((_, i) => Math.min(max, Math.max(0, leftOf(i) - leftOf(0))))
}

/**
 * 정면을 본 i번째 책의 표지가 화면에서 차지하는 상자(CSS px, 책 자리의 왼쪽 위가 0).
 * scroll은 줄이 왼쪽으로 밀린 길이(책 높이 단위). 보이지 않는 책 버튼을 이 자리에 놓아 포커스 링이 책을 두른다.
 */
export function facingBookBox(plan: RowPlan, sizes: readonly BookSize[], i: number, view: FieldsView, scroll = 0) {
  const { width } = sizes[i]
  const topLeft = projectPoint(view, [plan.facing[i] - scroll - width / 2, 0.5, 0])
  return { left: topLeft.x, top: topLeft.y, width: width * view.pxPerUnit, height: view.pxPerUnit }
}

// ── 책 한 권의 자리와 자세 ───────────────────────────────

export interface FieldBookPose {
  position: Vec3
  quaternion: Quat
}

/** 가운데가 x에 있고 세로축으로 angle(rad)만큼 돈 책의 자리와 자세 */
const poseAt = (x: number, angle: number, size: BookSize): FieldBookPose => ({
  position: [x, 0, turnDepth(angle, size)],
  quaternion: quatAboutY(angle),
})

/**
 * 서랍 안에 든 줄이 등장을 마친 자리(`packed`)에서 왼쪽으로 떨어져 있는 길이: 줄의 오른쪽 끝이
 * 경계(x = 0)에서 `drawerInset`만큼 안쪽에 있다
 */
function drawerDepth(plan: RowPlan, sizes: readonly BookSize[]) {
  const last = sizes.length - 1
  return plan.packed[last] + sizes[last].depth / 2 + FIELDS_LAYOUT.drawerInset
}

/** i번째 책이 등장한 뒤 elapsedMs가 지났을 때의 가운데 x(스크롤 0 기준)와 도는 진행 */
function bookSpot(plan: RowPlan, sizes: readonly BookSize[], i: number, elapsedMs: number) {
  const T = FIELDS_TIMING
  const timeline = fieldsTimeline(sizes.length)

  let x = plan.facing[i]
  if (elapsedMs < T.enterMs) {
    x = plan.packed[i] - (1 - easeDrawerOut(clamp01(elapsedMs / T.enterMs))) * drawerDepth(plan, sizes)
  } else if (elapsedMs < timeline.turnAt(0)) {
    x = mix(plan.packed[i], plan.facing[i], easeShelf(clamp01((elapsedMs - timeline.spreadAt) / T.spreadMs)))
  }
  return { x, progress: turnProgress((elapsedMs - timeline.turnAt(i)) / T.turnMs) }
}

/**
 * i번째 책이 등장한 뒤 elapsedMs가 지났을 때의 자리와 자세(스크롤 0 기준).
 * 등장: 틈을 두고 줄지어 선 채 서랍(왼쪽 끝 바깥)에서 밀려 나온다. 줄의 맨 오른쪽 책이 먼저 나온다
 * → 벌어짐: 제자리로 → 돌기: 제자리에서 세로축으로 돌아 앞표지가 정면.
 * hoverDeg는 포인터 반응이 보태는 각(책등 쪽이 보는 사람에게 온다). 다 돈 책에만 쓴다.
 */
export function fieldBookPose(plan: RowPlan, sizes: readonly BookSize[], i: number, elapsedMs: number, hoverDeg = 0): FieldBookPose {
  const { x, progress } = bookSpot(plan, sizes, i, elapsedMs)
  return poseAt(x, turnAngle(progress, hoverDeg), sizes[i])
}

/**
 * 서랍으로 들어가는 i번째 책의 자리와 자세(화면 기준: 스크롤이 이미 들어 있다). 등장의 거꾸로를 짧게 한다:
 * 등장한 지 atMs이던 때의 모습(스크롤 scroll만큼 밀린 자리, 포인터 반응 hoverDeg) 그대로에서 출발해, outMs 동안
 * 책등 쪽으로 돌아서며(앞부분 `exitTurnShare`) 왼쪽으로 모여, `exitMs`에는 틈을 두고 선 줄로 서랍 안에 있다.
 * 등장·벌어짐·도는 중이었어도 그 자세에서 이어진다.
 * 오른쪽 화면 밖에 있던 책(끌어 넘겨야 보이는 책)은 화면 끝 바로 밖에서 출발한다: 보이지 않는 먼 길을 가로질러 오지 않는다.
 */
export function exitBookPose(
  plan: RowPlan,
  sizes: readonly BookSize[],
  i: number,
  atMs: number,
  outMs: number,
  view: Pick<FieldsView, 'visibleWidth'>,
  scroll = 0,
  hoverDeg = 0,
): FieldBookPose {
  const T = FIELDS_TIMING
  const size = sizes[i]
  const shown = bookSpot(plan, sizes, i, atMs)
  const t = clamp01(outMs / T.exitMs)
  // 화면 끝 바로 밖: 표지가 정면을 본 채로도 통째로 밖이고, 밖에 있던 책끼리는 줄지어 선 간격을 둔다
  const offRight = view.visibleWidth + size.width / 2 + FIELDS_LAYOUT.drawerInset + (plan.packed[i] - plan.packed[0])
  const from = Math.min(shown.x - scroll, offRight)
  const x = mix(from, plan.packed[i] - drawerDepth(plan, sizes), t ** T.exitPull)
  const angle = mix(turnAngle(shown.progress, hoverDeg), HALF_PI, smooth(clamp01(t / T.exitTurnShare)))
  return poseAt(x, angle, size)
}

/** 책 자리의 왼쪽 끝에서 책이 옅어지는 구간의 폭(CSS px). 캔버스의 투명도 마스크에 쓴다 */
export const edgeFadeWidth = (view: Pick<FieldsView, 'pxPerUnit'>) => FIELDS_LAYOUT.edgeFade * view.pxPerUnit

// ── 포인터를 올린 책 ─────────────────────────────────────

const HOVER_OMEGA = omegaForSettle(FIELDS_HOVER.settleMs / 1000)

/** 포인터 반응의 진행(0 = 그대로, 1 = 다 돌았다)을 dtMs만큼 보낸다. 넘치지 않는 스프링(서가의 포인터 반응과 같은 방식) */
export function stepHover(state: Spring, on: boolean, dtMs: number): Spring {
  const next = springStep(state, on ? 1 : 0, HOVER_OMEGA, dtMs / 1000)
  return { x: clamp01(next.x), v: next.v }
}

/** 아직 움직이는 중인가(목표에 닿아 멈췄으면 false) */
export const hoverMoving = ({ x, v }: Spring, on: boolean) => Math.abs(x - (on ? 1 : 0)) > 0.001 || Math.abs(v) > 0.01

/** 그 진행에서 책이 더 돌아 있는 각(deg) */
export const hoverYaw = (amount: number) => clamp01(amount) * FIELDS_HOVER.yawDeg

// ── 학문 교체: 무엇이 보이고, 서랍으로 들어가고, 기다리는가 ─────

/**
 * 책 자리의 진행 상태. 시간은 ms.
 * - current: 보이는 학문과 그 등장부터 흐른 시간(`fieldBookPose`에 넣는다)
 * - leaving: 서랍으로 들어가는 학문. at은 들어가기 시작한 순간의 진행(그 모습에서 이어진다), out은 들어간 시간(`exitBookPose`)
 * - pending: 등장을 기다리는 학문과 남은 기다림
 */
export interface Direction<T extends { key: string }> {
  current: { item: T; at: number } | null
  leaving: { item: T; at: number; out: number } | null
  pending: { item: T; wait: number } | null
}

export const emptyDirection = <T extends { key: string }>(): Direction<T> => ({ current: null, leaving: null, pending: null })

/**
 * 가리키는 학문이 바뀌었다: 보이던 책은 서랍으로 들어가기 시작하고, 새 학문은 wait만큼 기다렸다가 1부터 등장한다.
 * 기다리는 동안 또 바뀌면 기다리던 학문은 등장하지 않고 건너뛴다(마지막에 멈춘 학문만 등장한다).
 */
export function requestItem<T extends { key: string }>(d: Direction<T>, item: T, wait = FIELDS_TIMING.settleMs): Direction<T> {
  if (d.pending ? d.pending.item.key === item.key : d.current?.item.key === item.key) return d
  return {
    current: null,
    leaving: d.leaving ?? (d.current ? { item: d.current.item, at: d.current.at, out: 0 } : null),
    pending: { item, wait },
  }
}

/** 시간을 dt(ms)만큼 보낸다. 보이던 책이 다 들어가고 기다림도 끝나면 기다리던 학문이 등장하기 시작한다 */
export function tickDirection<T extends { key: string }>(d: Direction<T>, dt: number): Direction<T> {
  let { current, leaving, pending } = d
  if (current) current = { item: current.item, at: current.at + dt }
  if (leaving) {
    const out = leaving.out + dt
    leaving = out >= FIELDS_TIMING.exitMs ? null : { ...leaving, out }
  }
  if (pending) {
    const wait = Math.max(0, pending.wait - dt)
    if (wait === 0 && !leaving) {
      current = { item: pending.item, at: 0 }
      pending = null
    } else pending = { item: pending.item, wait }
  }
  return { current, leaving, pending }
}

/** 아직 움직일 것이 남았는가(없으면 그리기를 멈춘다). totalOf는 그 학문의 등장이 끝나는 때 */
export function directionMoving<T extends { key: string }>(d: Direction<T>, totalOf: (item: T) => number) {
  return d.pending !== null || d.leaving !== null || (d.current !== null && d.current.at < totalOf(d.current.item))
}

// ── 책을 누르면: 들려서 책 페이지의 자리로 날아간다 ─────────────
//
// 선 책을 누르면 그 책이 살짝 들리고(보는 사람 쪽으로 나오며 조금 커지고 기운다), 책 페이지에서 책이 떠 있는
// 자리·크기·자세로 날아간다. 책 페이지의 떠 있는 책은 서가 장면(`shelf3d`)이 그린다: 그 장면은 가까이서 보는 눈
// (책 높이의 2.6배 거리)이라 원근이 있고, 분류 장면의 눈은 멀리서 정면으로 본다. 그래서 날아가는 동안 **눈도 함께 옮긴다**:
// 표지 면(z = 0)이 화면에 놓이는 자리는 그대로 둔 채 눈만 서가 장면의 눈 자리로 다가간다(멈춰 있는 책의 표지는 밀리지 않는다).
// 닿는 순간에는 서가 장면과 같은 눈·같은 자세라 두 그림의 윤곽이 겹친다(`flightTarget`).
// 책 페이지의 책은 책 자리 밖(화면 왼쪽)에 떠 있으므로 캔버스는 화면 전체를 덮는다(`eyeFrustum`의 canvas).

/** 날아가는 전환의 시간(ms)과 모양. 조정은 여기서 한다 */
export const FIELDS_FLIGHT = {
  /** 들림: 제자리에서 보는 사람 쪽으로 나온다 */
  liftMs: 180,
  /** 날아감: 가속했다가 부드럽게 닿는다 */
  flyMs: 660,
  /** 닿은 뒤 책 페이지와 겹쳐 넘어가는 시간(캔버스의 불투명도, `fields.css`) */
  handoffMs: 180,
  /** 들린 높이(보는 사람 쪽으로, 책 높이 대비). 벽과 멀어져 그림자가 깊어진다 */
  liftZ: 0.22,
  /** 들리며 커지는 비율(눈이 멀어 다가오는 것만으로는 커 보이지 않는다). 날아가는 동안 1로 돌아간다 */
  liftScale: 1.05,
  /** 들리며 기우는 각(deg): 책 페이지의 쉬는 자세 쪽으로 조금(yaw +: 책등이 보는 사람 쪽, 앞표지가 오른쪽을 본다) */
  liftTilt: { yaw: 8, pitch: -2, roll: 1.5 },
  /** 바탕색(그 책의 대표색)이 들어오는 구간: 날아가는 시간의 이 비율부터 이 비율까지(절반쯤 갔을 때부터) */
  veilFrom: 0.45,
  veilTo: 0.95,
  /**
   * 닿을 때의 그림자: 책 페이지의 조명과 벽(`shelf3d/scene.ts`의 `LIGHTING.page`와 같은 값)으로 옮겨 간다.
   * light = 빛이 오는 쪽(오른쪽 위 앞), wall = 책의 중심에서 벽까지(책 높이 대비), shadow = 그림자의 농도
   */
  page: { light: [0.3, 0.42, 1] as Vec3, wall: 0.42, shadow: 0.34 },
}

/** 누른 순간부터 책이 닿을 때까지(ms) */
export const flightTotalMs = () => FIELDS_FLIGHT.liftMs + FIELDS_FLIGHT.flyMs

/** 들리는 움직임: 빠르게 떠서 부드럽게 멈춘다 */
const easeLift = (t: number) => 1 - (1 - t) ** 3
/** 날아가는 움직임: 천천히 떠나 빨라졌다가 길게 감속하며 닿는다 */
const easeFly = cubicBezier(0.45, 0, 0.15, 1)

/**
 * 책 페이지를 닫으면 그 책이 날아서 줄의 제자리로 돌아온다: 열 때의 거꾸로다. 시간(ms)은 열 때와 같은 값에서 시작하고,
 * 조정은 여기서 한다(길과 바탕색의 구간은 `FIELDS_FLIGHT`를 거꾸로 쓴다).
 * 겹쳐 넘어오기(`departMs`): 책 페이지의 책(서가 장면) 위로 분류 장면의 캔버스가 떠오른다. 책은 책 페이지의 자리에 그대로 있다.
 * 날아옴(`flyMs`): 줄의 제자리 위, 들린 자세까지. 처음 5%가 지나면 바탕색이 걷히기 시작해 55%에 다 걷힌다.
 * 내려앉음(`settleMs`): 제자리에서 뒤로 물러나며 바로 선다.
 */
export const FIELDS_RETURN = {
  departMs: FIELDS_FLIGHT.handoffMs,
  flyMs: FIELDS_FLIGHT.flyMs,
  settleMs: FIELDS_FLIGHT.liftMs,
}

/** 닫은 순간부터 책이 제자리에 놓일 때까지(ms). 펼친 책이 덮이기를 기다리는 시간은 들지 않는다 */
export const returnTotalMs = () => FIELDS_RETURN.departMs + FIELDS_RETURN.flyMs + FIELDS_RETURN.settleMs

/** 내려앉는 움직임: 날아온 끝(거의 멈춘 속도)에서 이어 천천히 떠나고 부드럽게 놓인다 */
const easeSettle = cubicBezier(0.4, 0, 0.2, 1)

/** XYZ 순서의 오일러 각(rad)을 쿼터니언으로. 서가 장면이 책을 돌리는 순서와 같다(`rotation.set(pitch, yaw, roll)`) */
function quatFromEulerXYZ(x: number, y: number, z: number): Quat {
  const [c1, c2, c3] = [Math.cos(x / 2), Math.cos(y / 2), Math.cos(z / 2)]
  const [s1, s2, s3] = [Math.sin(x / 2), Math.sin(y / 2), Math.sin(z / 2)]
  return [s1 * c2 * c3 + c1 * s2 * s3, c1 * s2 * c3 - s1 * c2 * s3, c1 * c2 * s3 + s1 * s2 * c3, c1 * c2 * c3 - s1 * s2 * s3]
}

/** 쿼터니언의 곱 a · b(b를 먼저 돌리고 a를 돌린다) */
function multiplyQuat([ax, ay, az, aw]: Quat, [bx, by, bz, bw]: Quat): Quat {
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ]
}

/** 두 자세 사이(구면 보간). 가까운 쪽으로 돈다 */
function slerpQuat(a: Quat, b: Quat, t: number): Quat {
  let dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]
  const sign = dot < 0 ? -1 : 1
  dot *= sign
  let wa = 1 - t
  let wb = t
  if (dot < 0.9995) {
    const angle = Math.acos(dot)
    wa = Math.sin((1 - t) * angle) / Math.sin(angle)
    wb = Math.sin(t * angle) / Math.sin(angle)
  }
  const q = a.map((n, i) => n * wa + b[i] * wb * sign) as Quat
  const length = Math.hypot(...q)
  return q.map((n) => n / length) as Quat
}

/** 책 자리(무대)가 캔버스 안에서 놓인 자리(CSS px). 캔버스가 화면 전체를 덮으면 화면 왼쪽 위에서 잰 값이다 */
export interface StageOffset {
  left: number
  top: number
}

/** 캔버스의 크기와 그 안에서 책 자리가 놓인 자리(CSS px) */
export interface CanvasFrame extends StageOffset {
  width: number
  height: number
}

/**
 * 눈(eye)에서 본 점이 책 자리의 어디(CSS px, 왼쪽 위가 0)에 보이는가. 눈은 −Z를 똑바로 보고,
 * 표지 면(z = 0)은 눈이 어디에 있든 화면의 같은 자리에 놓인다(`eyeFrustum`). 평소의 눈이면 `projectPoint`와 같다.
 */
export function flightProject(view: FieldsView, [ex, ey, ez]: Vec3, [x, y, z]: Vec3) {
  const s = ez / (ez - z)
  return { x: (ex + (x - ex) * s) * view.pxPerUnit, y: view.height / 2 - (ey + (y - ey) * s) * view.pxPerUnit }
}

/**
 * 그 눈에서 near 거리의 면에 놓이는 절두체(좌우·상하). 표지 면(z = 0)에서 x = 0이 책 자리의 왼쪽 끝, y = 0이 그 세로 가운데,
 * 길이 1이 `pxPerUnit` px로 보이게 맞춘다: 눈이 가까워져도(원근이 세져도) 표지 면의 그림은 그대로다.
 * 캔버스가 책 자리보다 크면(화면 전체) 그만큼 넓게 본다.
 */
export function eyeFrustum(view: FieldsView, canvas: CanvasFrame, [ex, ey, ez]: Vec3, near: number) {
  const u = view.pxPerUnit
  const k = near / ez
  const top = (canvas.top + view.height / 2) / u
  return {
    left: (-canvas.left / u - ex) * k,
    right: ((canvas.width - canvas.left) / u - ex) * k,
    top: (top - ey) * k,
    bottom: (top - canvas.height / u - ey) * k,
  }
}

/** 날아간 책이 닿는 자리와 자세, 그리고 그때의 눈(책 높이 단위, 분류 장면의 좌표) */
export interface FlightTarget {
  position: Vec3
  quaternion: Quat
  /** 서가 장면의 눈과 같은 화면 자리·같은 원근이 되는 눈 */
  eye: Vec3
}

/**
 * 책 페이지에서 떠 있는 책(`shelf3d/motion.ts`의 `pagePose`)과 화면에서 겹치는 자리.
 * page는 서가 장면의 화면 치수(화면 전체 기준 px), offset은 책 자리가 그 화면 안에서 놓인 자리.
 * 서가 장면의 눈과 책을, 눈을 중심으로 "분류 장면의 책 크기 ÷ 서가의 책 크기"만큼 줄여 옮긴다: 눈에서 보는 그림은 같다.
 */
export function flightTarget(
  view: FieldsView,
  offset: StageOffset,
  page: PageView,
  coverAspect: number,
  /** 책 페이지의 책이 포인터를 따라 돌아 있는 각(deg, `shelf3d/motion.ts`의 `pagePointerTurn`). 돌아올 때의 출발 자세에 쓴다 */
  turn: { yaw: number; pitch: number } = { yaw: 0, pitch: 0 },
): FlightTarget {
  const u = view.pxPerUnit
  const H = page.bookHeight
  const pose = pagePose(page, coverAspect)
  // 화면 px로 적은 서가 장면의 눈과 책(x는 오른쪽, y는 아래쪽, z는 보는 사람 쪽)
  const eye = [page.width / 2, page.centreY - H * EYE_LIFT, H * PERSPECTIVE]
  const book = [page.width / 2 + pose.x, page.centreY - pose.y, pose.z]
  const near = book.map((n, i) => eye[i] + ((n - eye[i]) * u) / H)
  const world = ([sx, sy, sz]: number[]): Vec3 => [(sx - offset.left) / u, (offset.top + view.height / 2 - sy) / u, sz / u]
  const quaternion = quatFromEulerXYZ(pose.pitch + radians(turn.pitch), pose.yaw + radians(turn.yaw), pose.roll)
  return { position: world(near), quaternion, eye: world(eye) }
}

/** 눈이 옮겨 가는 길(amount 0 = 평소의 정면 카메라, 1 = 책 페이지의 눈). 원근의 세기(1/거리)가 고르게 바뀐다 */
export function flightEye(view: FieldsView, target: FlightTarget, amount: number): Vec3 {
  const from = view.camera.position
  if (amount <= 0) return [from[0], from[1], from[2]]
  const t = Math.min(1, amount)
  return [mix(from[0], target.eye[0], t), mix(from[1], target.eye[1], t), 1 / mix(1 / from[2], 1 / target.eye[2], t)]
}

/** 날아가는 책의 한 순간 */
export interface FlightFrame extends FieldBookPose {
  /** 책의 크기(평소 1) */
  scale: number
  /** 눈이 옮겨 간 정도(`flightEye`의 amount). 그림자의 조명·벽도 이만큼 책 페이지 쪽으로 간다 */
  camera: number
  /** 바탕색(그 책의 대표색)의 불투명도 */
  veil: number
  /** 닿았는가 */
  done: boolean
}

/**
 * 들린 정도(lift: 0 = 서 있다, 1 = 다 들렸다)와 날아간 정도(share: 날아가는 시간의 비율 0~1)에서의 책.
 * 열 때(`flightFrame`)와 돌아올 때(`returnFrame`)가 같은 길을 쓴다
 */
function flightPoseAt(from: FieldBookPose, target: FlightTarget, lift: number, share: number): FlightFrame {
  const F = FIELDS_FLIGHT
  const tilt = quatFromEulerXYZ(radians(F.liftTilt.pitch * lift), radians(F.liftTilt.yaw * lift), radians(F.liftTilt.roll * lift))
  const lifted: FieldBookPose = {
    position: [from.position[0], from.position[1], from.position[2] + F.liftZ * lift],
    quaternion: multiplyQuat(tilt, from.quaternion),
  }
  const liftedScale = mix(1, F.liftScale, lift)
  if (share <= 0) return { ...lifted, scale: liftedScale, camera: 0, veil: 0, done: false }
  const t = easeFly(share)
  return {
    position: lifted.position.map((n, i) => mix(n, target.position[i], t)) as Vec3,
    quaternion: slerpQuat(lifted.quaternion, target.quaternion, t),
    scale: mix(liftedScale, 1, t),
    camera: t,
    veil: clamp01((share - F.veilFrom) / (F.veilTo - F.veilFrom)),
    done: false,
  }
}

/**
 * 누른 뒤 elapsedMs가 지났을 때의 책. from은 누른 순간의 자리와 자세(스크롤·포인터 반응이 든 화면 기준).
 * 들림(`liftMs`): 제자리에서 보는 사람 쪽으로 `liftZ`만큼 나오며 조금 커지고 기운다.
 * 날아감(`flyMs`): 닿는 자리·자세로. 눈도 함께 옮겨 가고, 절반쯤부터 바탕색이 들어온다.
 */
export function flightFrame(from: FieldBookPose, target: FlightTarget, elapsedMs: number): FlightFrame {
  const F = FIELDS_FLIGHT
  if (elapsedMs >= flightTotalMs()) {
    return { position: target.position, quaternion: target.quaternion, scale: 1, camera: 1, veil: 1, done: true }
  }
  return flightPoseAt(from, target, easeLift(clamp01(elapsedMs / F.liftMs)), clamp01((elapsedMs - F.liftMs) / F.flyMs))
}

/** 돌아오는 책의 한 순간 */
export interface ReturnFrame extends FlightFrame {
  /** 겹쳐 넘어오기가 끝났는가(이때부터 화면은 분류 화면이고 책이 날기 시작한다) */
  departed: boolean
}

/**
 * 책 페이지를 닫은 뒤(펼친 책이 덮이기를 기다렸다면 그 뒤) elapsedMs가 지났을 때의 책. rest는 줄에서 멈춰 서 있을 자리와 자세
 * (스크롤이 든 화면 기준), target은 책 페이지에서 떠 있던 자리·자세·눈(`flightTarget`).
 * 겹쳐 넘어오기(`departMs`) 동안은 target 그대로(바탕색이 다 차 있다) → 날아옴(`flyMs`): 열 때 날아간 길을 거꾸로 →
 * 내려앉음(`settleMs`): 들린 자세에서 rest로. 끝나면 rest와 정확히 같다(done).
 */
export function returnFrame(rest: FieldBookPose, target: FlightTarget, elapsedMs: number): ReturnFrame {
  const R = FIELDS_RETURN
  const flown = elapsedMs - R.departMs
  if (flown <= 0) {
    return { position: target.position, quaternion: target.quaternion, scale: 1, camera: 1, veil: 1, done: false, departed: flown === 0 }
  }
  if (flown >= R.flyMs + R.settleMs) {
    return { position: rest.position, quaternion: rest.quaternion, scale: 1, camera: 0, veil: 0, done: true, departed: true }
  }
  const frame =
    flown < R.flyMs
      ? flightPoseAt(rest, target, 1, 1 - flown / R.flyMs)
      : flightPoseAt(rest, target, 1 - easeSettle((flown - R.flyMs) / R.settleMs), 0)
  return { ...frame, departed: true }
}
