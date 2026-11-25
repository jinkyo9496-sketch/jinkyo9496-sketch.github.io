import { bookHeightFor, shelfLiftFor } from '../shelf/metrics'

/**
 * 인트로 화면 아래에 서가의 책 머리가 비친다(2026-11-24). 따로 그린 그림이 아니라 서가 화면 그 자체를 위로 당겨 놓은 것이라,
 * 휠을 내리면 비치던 책이 그대로 올라와 서가가 된다. 여기서는 얼마나 당길지를 잰다(순수 계산, 단위 테스트 `tests/peek.test.ts`).
 * 책의 자리는 서가와 같은 계산(`shelf/metrics.ts`)에서 얻는다: 두 서가(WebGL·CSS)의 책 윗선과 맞는다.
 * 인트로에서 서가의 책은 모두 책등으로 줄을 서 있다(`lineup.ts`): 책등은 모두 z = 0 평면에 있고 높이가 같아, 여기서 구한
 * 윗선이 비치는 모든 책의 윗선이다(앞으로 나와 더 크게 보이는 앞표지가 없다).
 */

/** 비치는 책 머리의 높이(책 높이 대비). 1440×900에서 약 71px */
export const PEEK_RATIO = 0.12

export interface PeekInput {
  /** 서가 화면의 위에서 서가 칸(`.shelf`)의 위까지(px): 헤더 자리 + 타이틀 띠 */
  rowTop: number
  /** 서가 칸의 높이(px). 재지 못했으면 0 */
  rowHeight: number
  viewportWidth: number
  viewportHeight: number
  /** 가장 넓은 앞표지의 가로/세로(서가가 책 높이를 정할 때 쓰는 값) */
  coverAspect: number
}

export interface Peek {
  /** 비치는 책 머리의 높이(px) */
  height: number
  /** 인트로일 때 서가 화면을 위로 당기는 양(px): 서가 화면 안의 책 윗선 + 비치는 높이 */
  shift: number
  /** 그때 서가 화면의 위에서 잘라 내는 양(px): 서가 칸의 위. 타이틀 띠와 헤더 자리가 인트로에 보이지 않는다 */
  clip: number
  /** 인트로 화면 아래에서 서가가 차지하는 띠의 높이(px): 책 위의 여백 + 책 머리. 로고 묶음은 이 위에 놓인다 */
  zone: number
}

/** 서가 칸을 재지 못했으면(jsdom) null: 비치게 하지 않는다 */
export function peekFor({ rowTop, rowHeight, viewportWidth, viewportHeight, coverAspect }: PeekInput): Peek | null {
  if (!(rowHeight > 0)) return null
  const bookHeight = bookHeightFor({ viewportWidth, viewportHeight, rowHeight, coverAspect })
  const bookTop = rowTop + rowHeight / 2 - shelfLiftFor(rowHeight, bookHeight) - bookHeight / 2
  const height = bookHeight * PEEK_RATIO
  const shift = bookTop + height
  return { height, shift, clip: rowTop, zone: shift - rowTop }
}

const px = (n: number) => `${Math.round(n * 10) / 10}px`

/** CSS에 넘기는 값(`intro.css`가 쓴다). 재지 못했으면 아무것도 넣지 않는다(CSS의 기본값 0: 비치지 않는다) */
export function peekStyle(peek: Peek | null): Record<string, string> {
  if (!peek) return {}
  return { '--peek-shift': px(peek.shift), '--peek-clip': px(peek.clip), '--peek-zone': px(peek.zone) }
}
