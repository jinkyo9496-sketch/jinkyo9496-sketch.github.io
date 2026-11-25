/**
 * 웰컴의 큰 로고 ↔ 헤더의 작은 로고(2026-11-24, 신간 소개). 웰컴에서 신간 소개로 내려가면 큰 로고가 줄어들며 왼쪽 위
 * 헤더의 로고 자리로 날아간다. 따로 그린 그림이 아니라 헤더의 로고 그 자체를 옮기고 키워 큰 로고 위에 겹쳐 두었다가
 * 제자리로 돌려보내는 것이라(`intro.css`), 다 날아가면 그 자리에 있는 것이 실제 헤더 로고다.
 * 여기에는 그 옮김과 배율의 순수 계산을 둔다(단위 테스트 `tests/logoFlight.test.ts`). 화면에서 재는 것은 `useLogoFlight.ts`.
 */

/** 화면 틀(.app) 안에서의 자리(px). 두 로고는 같은 그림이라 폭만 맞추면 높이도 맞는다 */
export interface LogoBox {
  left: number
  top: number
  width: number
}

export interface LogoFlight {
  /** 헤더 로고의 왼쪽 위를 큰 로고의 왼쪽 위로 옮기는 양(px) */
  dx: number
  dy: number
  /** 그 자리에서 키우는 배율(왼쪽 위 기준) */
  scale: number
}

/** 잴 수 없으면(그림이 오기 전, jsdom) null: 날지 않고 제자리에서 바뀐다 */
export function logoFlightFor(big: LogoBox, small: LogoBox): LogoFlight | null {
  if (!(big.width > 0) || !(small.width > 0)) return null
  return { dx: big.left - small.left, dy: big.top - small.top, scale: big.width / small.width }
}

const round = (n: number, unit: number) => Math.round(n * unit) / unit

/** CSS에 넘기는 값(`intro.css`가 쓴다). 재지 못했으면 아무것도 넣지 않는다 */
export function logoFlightStyle(flight: LogoFlight | null): Record<string, string> {
  if (!flight) return {}
  return {
    '--logo-dx': `${round(flight.dx, 10)}px`,
    '--logo-dy': `${round(flight.dy, 10)}px`,
    '--logo-scale': `${round(flight.scale, 10000)}`,
  }
}
