/** 바탕에 따라 골라 쓰는 로고 한 벌: 밝은 바탕용(먹 글자)과 어두운 바탕용(흰 글자). 파일은 public/에 둔다 */
export interface LogoSources {
  /** 글자가 먹(--ink)인 바탕에 놓는 로고 */
  ink: string
  /** 글자가 종이색(--paper)인 바탕에 놓는 로고 */
  paper: string
  /** 한 색 로고(글자 전체가 먹 / 흰색). 책 페이지처럼 바탕색이 책마다 다른 곳에서 쓴다. 없으면 위의 두 색 로고를 쓴다 */
  mono?: { ink: string; paper: string }
}

/**
 * 헤더 로고 이미지 경로. 로고를 바꿀 때는 여기만 고친다.
 * - 한 벌(`{ ink, paper, mono }`): 바탕의 글자색에 맞는 쪽이 보인다. 책 페이지에서는 한 색(`mono`)을 쓴다:
 *   로고의 '명'이 하늘색이라 대표색이 비슷한 권에서 바탕에 묻히기 때문이다
 * - 문자열 하나: 늘 그 그림
 * - null: 글자 워드마크 '서가명강'
 */
export const logoSrc: LogoSources | string | null = {
  ink: '/logo-ink.png',
  paper: '/logo-paper.png',
  mono: { ink: '/logo-ink-mono.png', paper: '/logo-paper-mono.png' },
}

export const LOGO_ALT = '서가명강'
