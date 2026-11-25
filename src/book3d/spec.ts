/**
 * 책 한 권의 3D 모형이 따르는 치수와 축의 약속(순수 계산, three에 의존하지 않는다).
 *
 * 좌표: 책의 중심이 원점, 책 높이가 1. 닫힌 책을 정면에서 볼 때
 *   +Z 앞표지 · −Z 뒤표지 · −X 책등 · +X 배(책장을 넘기는 쪽) · ±Y 위·아래(종이 단면).
 * 폭(X) = coverAspect, 두께(Z) = spineAspect. 쓰는 쪽에서 `group.scale`로 크기를 정한다.
 */

export interface BookImages {
  front: string
  back: string
  spine: string
}

export interface BookSpec {
  /** 시리즈 번호 */
  no: number
  title: string
  /** 앞표지 가로/세로 = 책의 폭(책 높이 대비) */
  coverAspect: number
  /** 책등 가로/세로 = 책의 두께(책 높이 대비) */
  spineAspect: number
  images: BookImages
}

/** 표지 종이의 두께(책 높이 대비). 실물(0.3mm / 220mm)보다 조금 두껍게: 가까이에서 표지의 단면이 한 줄로 보인다 */
export const COVER_THICKNESS = 0.004

/** 책의 바깥 치수. height를 주면 그 높이의 책(같은 단위) */
export function bookDimensions(spec: Pick<BookSpec, 'coverAspect' | 'spineAspect'>, height = 1) {
  return {
    width: spec.coverAspect * height,
    height,
    depth: spec.spineAspect * height,
    cover: COVER_THICKNESS * height,
  }
}

export type CoverSide = 'front' | 'back'

export interface CoverHinge {
  /** 표지가 도는 축이 지나는 점(책 좌표, 책 높이 = 1) */
  pivot: [number, number, number]
  /** 축의 방향 */
  axis: [number, number, number]
  /** 여는 방향: 축을 중심으로 openSign × (여는 각)만큼 돈다 */
  openSign: 1 | -1
}

/**
 * 표지가 열릴 때의 경첩. 무선 제본이라 표지는 책등의 바깥 모서리(접힌 자리)에서 꺾인다:
 * 앞표지는 (−폭/2, 0, +두께/2), 뒤표지는 (−폭/2, 0, −두께/2)를 지나는 세로축.
 * 앞표지는 −방향으로 돌아야 배 쪽 끝이 보는 사람 쪽(+Z)으로 나온다.
 */
export function coverHinge(spec: Pick<BookSpec, 'coverAspect' | 'spineAspect'>, side: CoverSide = 'front'): CoverHinge {
  const front = side === 'front'
  return {
    pivot: [-spec.coverAspect / 2, 0, (front ? 1 : -1) * (spec.spineAspect / 2)],
    axis: [0, 1, 0],
    openSign: front ? -1 : 1,
  }
}

/** 표지를 openAngle(rad, 0 = 닫힘, π = 완전히 젖힘)만큼 열 때 경첩(`model.hinges[side]`)의 rotation.y */
export const hingeRotation = (side: CoverSide, openAngle: number) => (side === 'front' ? -openAngle : openAngle)
