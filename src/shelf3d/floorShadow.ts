/**
 * WebGL 서가의 바닥 그림자: 책이 바닥에 닿은 자리 바로 아래의 짧고 부드러운 그림자 하나("닿는 그림자").
 * 조명의 그림자 맵을 쓰지 않고, 책의 자세에서 발자국(책이 바닥에 닿은 사각형)을 구해 그 둘레로 옅어지는
 * 그림자를 계산한다. 장면(`scene.ts`)의 바닥 셰이더가 `shadowAt`·`floorFade`와 같은 식으로 그린다.
 * three에 의존하지 않는다(단위 테스트 `tests/floorShadow.test.ts`).
 *
 * 좌표는 장면과 같다: 길이 px, x는 화면 가운데가 0, z는 보는 사람 쪽이 +(책등 면이 z = 0), 바닥은 y = −책 높이/2.
 */
import { EYE_LIFT, PERSPECTIVE } from './motion'

/** 길이는 책 높이의 배수, 농도는 `LIGHTING.floorShadow`(가장 진한 곳의 먹 불투명도)에 곱하는 값 */
export const FLOOR_SHADOW = {
  /** 앞표지를 보인 책(가운데 책)의 농도. 책등을 보인 책은 1 */
  openStrength: 0.8,
  /** 옆과 뒤로 번지는 길이: 책등을 보인 책 / 앞표지를 보인 책(앞으로 나와 있는 만큼 더 넓게) */
  side: 0.05,
  openSide: 0.11,
  /** 앞(보는 사람 쪽)으로 번지는 길이의 상한. 보이는 바닥이 이보다 얕으면 그 깊이까지만 번진다 */
  forward: 0.2,
  /** 보이는 바닥의 앞쪽 이만큼(깊이 대비)에서 모든 그림자가 0까지 옅어진다: 잘리는 선이 보이지 않는다 */
  frontFade: 0.6,
  /** 바닥은 책등 면에서 이만큼 뒤까지만 있고, 그 끝에서 그림자가 0이 된다(책 사이 틈으로 보이는 바닥) */
  back: 0.1,
  /** 책이 바닥에서 이만큼 떨어지면(위로든 아래로든) 그림자가 사라진다 */
  liftFade: 0.3,
  /** 사라질 때까지 번지는 길이가 이만큼 더 늘어난다(1 = 두 배) */
  liftWiden: 1,
  /** 책등을 보인 책이 줄에서 이만큼 앞으로 나오면 이웃과 잇던 넓힘이 다 걷힌다(뽑힌 책) */
  rowLeave: 0.08,
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))
const mix = (a: number, b: number, t: number) => a + (b - a) * t

/** 서가 칸의 치수 가운데 바닥이 보이는 깊이를 정하는 것(`Stage`의 일부) */
export interface FloorView {
  bookHeight: number
  /** 책의 세로 중심이 캔버스 위에서 몇 px 내려온 곳인가 */
  centreY: number
  /** 캔버스가 잘리는 선(서가 칸의 아래 끝)이 캔버스 위에서 몇 px 내려온 곳인가. 모르면 비운다 */
  rowBottom?: number
}

/**
 * 책 아래로 보이는 바닥의 깊이(px): 책등 면(z = 0)에서 보는 사람 쪽으로 이만큼 나온 바닥이
 * 캔버스가 잘리는 선에 보인다. 그림자는 이 안에서 다 옅어져야 한다.
 * 눈은 바닥에서 (0.5 + EYE_LIFT)·H 위, 책등 면에서 PERSPECTIVE·H 앞에 있다.
 */
export function visibleFloorDepth({ bookHeight, centreY, rowBottom }: FloorView) {
  if (rowBottom === undefined) return bookHeight * FLOOR_SHADOW.forward
  const visible = rowBottom - (centreY + bookHeight / 2)
  if (!(visible > 0)) return 0
  const eye = bookHeight * (0.5 + EYE_LIFT)
  return (bookHeight * PERSPECTIVE * visible) / (eye + visible)
}

/** 책 한 권의 닿는 그림자 */
export interface ContactShadow {
  /** 발자국의 중심 */
  x: number
  z: number
  /** 발자국의 반쪽 크기: 책의 가로(표지 폭) 쪽 / 두께(책등 폭) 쪽. 두께 쪽에는 이웃과 잇는 넓힘이 들어 있다 */
  halfW: number
  halfD: number
  /** 책이 돌아선 각(yaw)의 cos·sin */
  cos: number
  sin: number
  /** 농도(0~1). 책 바로 밑에서의 값 */
  strength: number
  /** 옆·뒤로 번지는 길이(px), 앞으로 번지는 길이(px) */
  side: number
  forward: number
}

export interface ShadowOptions {
  bookHeight: number
  /** 책등을 보인 책 사이의 간격(px). 그림자를 이만큼 넓혀 줄을 따라 이어지게 한다 */
  gap: number
  /** 보이는 바닥의 깊이(`visibleFloorDepth`) */
  depth: number
}

/**
 * 책의 자세에서 닿는 그림자를 구한다. 책이 움직이면 그림자가 따라 움직인다.
 * - 발자국은 표지 폭 × 책등 폭의 사각형이 yaw만큼 돌아간 것이다.
 * - 책등을 보이며 줄에 선 책은 옆으로 간격의 반씩 넓힌다: 이웃한 그림자가 겹치지도 벌어지지도 않고 한 줄로 이어진다.
 * - 앞표지 쪽으로 돌수록(가운데 책) 더 넓고 옅다.
 * - 바닥에서 멀어지면(올라오는 중, 집어 든 책) 옅어지고 넓어지다 사라진다.
 */
export function contactShadow(
  pose: { x: number; y: number; z: number; yaw: number },
  book: { coverAspect: number; spineAspect: number },
  { bookHeight: H, gap, depth }: ShadowOptions,
): ContactShadow {
  const S = FLOOR_SHADOW
  const cos = Math.cos(pose.yaw)
  const sin = Math.sin(pose.yaw)
  const halfW = (H * book.coverAspect) / 2
  const halfD = (H * book.spineAspect) / 2
  /** 0 = 책등이 정면, 1 = 앞표지(또는 뒤표지)가 정면 */
  const open = cos * cos
  /** 발자국의 가장 앞쪽 끝. 줄에 선 책은 0(책등 면) */
  const front = pose.z + halfW * Math.abs(sin) + halfD * Math.abs(cos)
  const inRow = (1 - open) * clamp01(1 - Math.max(0, front) / (H * S.rowLeave))
  const lift = Math.abs(pose.y) / (H * S.liftFade)
  const fade = clamp01(1 - lift)
  const widen = 1 + S.liftWiden * Math.min(1, lift)
  return {
    x: pose.x,
    z: pose.z,
    halfW,
    halfD: halfD + (gap / 2) * inRow,
    cos,
    sin,
    strength: mix(1, S.openStrength, open) * fade * fade,
    side: H * mix(S.side, S.openSide, open) * widen,
    forward: Math.min(H * S.forward, Math.max(0, depth)) * widen,
  }
}

/**
 * 그림자 하나가 바닥의 한 점(x, z)에 주는 농도(0~strength). 발자국 안은 strength,
 * 밖은 발자국에서 멀어질수록 옅어져 번지는 길이(옆·뒤는 side, 앞은 forward)에서 0이 된다.
 */
export function shadowAt(s: ContactShadow, x: number, z: number) {
  const px = x - s.x
  const pz = z - s.z
  // 책의 축으로 옮겨 발자국에서 벗어난 만큼을 구하고, 다시 바닥의 축으로 돌린다
  const lx = px * s.cos - pz * s.sin
  const lz = px * s.sin + pz * s.cos
  const qx = Math.sign(lx) * Math.max(0, Math.abs(lx) - s.halfW)
  const qz = Math.sign(lz) * Math.max(0, Math.abs(lz) - s.halfD)
  const wx = qx * s.cos + qz * s.sin
  const wz = -qx * s.sin + qz * s.cos
  const reach = wz > 0 ? s.forward : s.side
  if (wz !== 0 && !(reach > 0)) return 0
  const t = Math.hypot(wx / s.side, wz === 0 ? 0 : wz / reach)
  const rest = 1 - Math.min(1, t)
  return s.strength * rest * rest
}

/**
 * 바닥의 깊이에 따라 모든 그림자에 곱하는 값(0~1): 책등 면 뒤로는 바닥이 끝나는 곳에서,
 * 앞으로는 보이는 바닥이 끝나는 곳(캔버스가 잘리는 선)에서 0이 된다.
 */
export function floorFade(z: number, { bookHeight, depth }: Pick<ShadowOptions, 'bookHeight' | 'depth'>) {
  if (z < 0) return clamp01(1 + z / (bookHeight * FLOOR_SHADOW.back))
  if (!(depth > 0)) return 0
  const p = clamp01((depth - z) / (depth * FLOOR_SHADOW.frontFade))
  return p * p * (3 - 2 * p)
}

/** 바닥의 한 점의 그림자 농도(0~1): 그림자들 가운데 가장 진한 것 하나만 남긴다(겹쳐도 진해지지 않는다) */
export function floorShadowAt(list: readonly ContactShadow[], x: number, z: number, options: Pick<ShadowOptions, 'bookHeight' | 'depth'>) {
  let strongest = 0
  for (const s of list) strongest = Math.max(strongest, shadowAt(s, x, z))
  return strongest * floorFade(z, options)
}
