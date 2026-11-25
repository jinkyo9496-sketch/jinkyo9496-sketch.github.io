/**
 * 포인터가 가운데 책(앞표지) 위에 있을 때의 기울임 계산(순수 함수).
 * 어느 책 위인지는 `layout.ts`의 `bookAtPoint`가 정한다.
 */

/** 좌우 기울임의 최대(deg, rotateY) */
export const TILT_MAX_Y = 5
/** 위아래 기울임의 최대(deg, rotateX) */
export const TILT_MAX_X = 3

export interface Tilt {
  rotateX: number
  rotateY: number
}

const unit = (n: number, half: number) => (half > 0 ? Math.min(1, Math.max(-1, n / half)) : 0)
const round = (n: number) => Math.round(n * 100) / 100

/**
 * 표지 중심을 원점으로 한 포인터 위치(px, 아래가 +y)에서 기울임 각도를 구한다.
 * 표지가 포인터 쪽을 바라본다: 오른쪽이면 rotateY +, 위쪽이면 rotateX +. 가장자리에서 최대이고 그 밖은 같다.
 */
export function tiltFor(point: { x: number; y: number }, faceWidth: number, bookHeight: number): Tilt {
  return {
    rotateX: round(0 - unit(point.y, bookHeight / 2) * TILT_MAX_X),
    rotateY: round(unit(point.x, faceWidth / 2) * TILT_MAX_Y),
  }
}

/**
 * 두 각도를 CSS `rotate` 값 하나(축 + 각도)로 쓴다. 각이 작아 rotateX·rotateY를 잇는 것과 같게 보인다.
 * 기울임이 없으면 빈 문자열.
 */
export function tiltRotateValue({ rotateX, rotateY }: Tilt): string {
  const angle = round(Math.hypot(rotateX, rotateY))
  return angle === 0 ? '' : `${rotateX} ${rotateY} 0 ${angle}deg`
}
