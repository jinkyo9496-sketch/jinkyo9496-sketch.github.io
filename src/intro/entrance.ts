/**
 * 웰컴(인트로)의 등장 박자 가운데 코드가 알아야 하는 값. 움직임 자체는 `intro.css`가 맡고, 여기에는 그 CSS와 같은 값을
 * 적어 둔다(효과음이 점이 찍히는 때를 맞춘다: `sound/cues.ts`). 두 곳의 값이 같은지는 `tests/soundCues.test.ts`가 본다.
 */

/** 서·가·명·강 위의 점(`intro.css`의 `intro-dot`): 첫 점이 내려오기 시작하는 때, 점 사이의 간격, 한 점이 내려와 찍히기까지(ms) */
export const INTRO_DOTS = {
  atMs: 1100,
  gapMs: 160,
  fallMs: 420,
  /** 점의 수(서·가·명·강) */
  count: 4,
} as const
