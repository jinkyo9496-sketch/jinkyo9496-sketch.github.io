import type { Screen } from '../app/screen'

/**
 * 신간 소개 화면(웰컴 아래, 서가 위)의 박자와 단계. 순수 계산만 둔다(단위 테스트 `tests/featureTimeline.test.ts`).
 * 웰컴에서 내려오면 처음부터 저절로 이어진다(휠로 단계를 넘기지 않는다. 2026-11-24 편집자 결정):
 * 말풍선 셋 → 큰 문구(말풍선을 위로 밀어낸다) → 도서 목업 → 책 정보 → 책 소개 문구 → 편집자의 한 마디 → 영상.
 * 서가에서 올라오면 다 펼쳐진 마지막 모습으로 바로 놓인다. 단계를 시간에 따라 넘기는 것은 `useFeature.ts`,
 * 단계마다의 모습은 `feature.css`(시간은 `featureCssVars`로 받는다)가 맡는다.
 */

/** 단계, 시간 순서대로. `idle`은 아직 아무것도 없는 처음 */
export const FEATURE_STEPS = ['idle', 'bubbles', 'claim', 'mockup', 'info', 'pitch', 'note', 'video'] as const
export type FeatureStep = (typeof FEATURE_STEPS)[number]

/** 다 펼쳐진 마지막 단계: 목업·책 정보·소개 문구·편집자의 한 마디가 왼쪽에, 영상이 오른쪽에 있다 */
export const FEATURE_FINAL: FeatureStep = 'video'

/** 박자(ms). 값은 여기에만 둔다 */
export const FEATURE_TIMING = {
  /** 웰컴에서 내려온 뒤 첫 말풍선까지: 큰 로고가 헤더로 날아가기 시작한 뒤 */
  startMs: 350,
  /** 말풍선 사이의 간격(위에서부터 하나씩) */
  bubbleGapMs: 750,
  /** 말풍선 하나가 생겨나는 시간 */
  bubbleInMs: 480,
  /** 셋째 말풍선이 다 나온 뒤 큰 문구까지의 멈춤 */
  bubbleHoldMs: 1200,
  /** 큰 문구가 아래에서 올라오며 말풍선을 위로 밀어내는 시간 */
  claimInMs: 720,
  /** 큰 문구가 읽히게 머무는 시간 */
  claimHoldMs: 2000,
  /** 큰 문구가 물러나는 시간(목업이 들어오는 동안) */
  claimOutMs: 380,
  /** 목업이 가운데에 나타나는 시간 */
  mockupInMs: 700,
  /** 목업이 가운데에 떠 있는 시간 */
  mockupHoldMs: 1000,
  /** 목업이 왼쪽으로 비키고 도서명·부제·저자가 붙는 시간 */
  infoMs: 700,
  /** 책 정보가 다 붙은 뒤 책 소개 문구까지 */
  pitchGapMs: 200,
  /** 책 소개 문구가 나타나는 시간 */
  pitchMs: 500,
  /** 소개 문구가 다 나온 뒤 편집자의 한 마디까지 */
  noteGapMs: 250,
  /** 편집자의 한 마디가 나타나는 시간 */
  noteMs: 600,
  /** 한 마디가 다 나온 뒤 영상까지 */
  noteHoldMs: 700,
  /** 책과 글이 왼쪽으로 밀리고 영상이 나타나는 시간 */
  videoMs: 760,
} as const

export type FeatureTiming = { readonly [K in keyof typeof FEATURE_TIMING]: number }

/** 단계마다 시작하는 때(ms, 웰컴에서 내려온 순간이 0). 앞 단계가 다 보인 뒤에 다음 단계가 시작한다 */
export function featureSchedule(t: FeatureTiming = FEATURE_TIMING): { step: FeatureStep; at: number }[] {
  const bubbles = t.startMs
  const claim = bubbles + t.bubbleGapMs * 2 + t.bubbleInMs + t.bubbleHoldMs
  const mockup = claim + t.claimInMs + t.claimHoldMs
  const info = mockup + t.mockupInMs + t.mockupHoldMs
  const pitch = info + t.infoMs + t.pitchGapMs
  const note = pitch + t.pitchMs + t.noteGapMs
  const video = note + t.noteMs + t.noteHoldMs
  return [
    { step: 'bubbles', at: bubbles },
    { step: 'claim', at: claim },
    { step: 'mockup', at: mockup },
    { step: 'info', at: info },
    { step: 'pitch', at: pitch },
    { step: 'note', at: note },
    { step: 'video', at: video },
  ]
}

/** 영상이 다 자리 잡을 때까지의 전체 시간(ms) */
export const featureTotalMs = (t: FeatureTiming = FEATURE_TIMING) => featureSchedule(t).at(-1)!.at + t.videoMs

/** 내려온 뒤 `ms`가 지났을 때의 단계 */
export function featureStepAt(ms: number, t: FeatureTiming = FEATURE_TIMING): FeatureStep {
  let step: FeatureStep = 'idle'
  for (const entry of featureSchedule(t)) if (ms >= entry.at) step = entry.step
  return step
}

/** 지금 단계(`step`)가 `target`에 닿았거나 지났는가 */
export const stepReached = (step: FeatureStep, target: FeatureStep) => FEATURE_STEPS.indexOf(step) >= FEATURE_STEPS.indexOf(target)

/** CSS에 넘기는 박자(`feature.css`가 쓴다) */
export function featureCssVars(t: FeatureTiming = FEATURE_TIMING): Record<string, string> {
  return {
    '--bubble-gap': `${t.bubbleGapMs}ms`,
    '--bubble-in': `${t.bubbleInMs}ms`,
    '--claim-in': `${t.claimInMs}ms`,
    '--claim-out': `${t.claimOutMs}ms`,
    '--mockup-in': `${t.mockupInMs}ms`,
    '--info-ms': `${t.infoMs}ms`,
    '--pitch-ms': `${t.pitchMs}ms`,
    '--note-ms': `${t.noteMs}ms`,
    '--video-ms': `${t.videoMs}ms`,
  }
}

/** 신간 소개가 지금 어디까지 왔는가 */
export interface FeatureRun {
  /** 마지막으로 본 화면 */
  screen: Screen
  step: FeatureStep
  /** 시간에 따라 단계가 넘어가는 중인가(웰컴에서 내려와 도는 동안) */
  playing: boolean
  /** 전환 없이 그 모습으로 바로 놓는가(서가에서 올라왔을 때: 애니메이션을 다시 돌리지 않는다) */
  instant: boolean
  /** 처음부터 돈 횟수(다시 돌 때마다 타이머를 새로 건다) */
  plays: number
}

/** 처음 화면에서의 상태: 신간 소개에서 시작하면 마지막 모습, 아니면 아직 아무것도 없다 */
export const featureStart = (screen: Screen): FeatureRun => ({
  screen,
  step: screen === 'feature' ? FEATURE_FINAL : 'idle',
  playing: false,
  instant: screen === 'feature',
  plays: 0,
})

/**
 * 화면이 바뀐 뒤의 상태. 바뀐 것이 없으면 `prev`를 그대로 돌려준다.
 * - 웰컴 → 신간 소개: 처음부터 돈다
 * - 그 밖의 화면(서가 등) → 신간 소개: 다 펼쳐진 마지막 모습으로 바로 놓인다
 * - 웰컴으로: 거둔다(다시 내려오면 처음부터)
 * - 서가·학제별 분류로: 보이던 모습 그대로 멈춘다(화면과 함께 밀려 나간다)
 */
export function featureAfter(prev: FeatureRun, screen: Screen): FeatureRun {
  if (prev.screen === screen) return prev
  if (screen === 'feature') {
    return prev.screen === 'intro'
      ? { screen, step: 'idle', playing: true, instant: false, plays: prev.plays + 1 }
      : { screen, step: FEATURE_FINAL, playing: false, instant: true, plays: prev.plays }
  }
  if (screen === 'intro') return { screen, step: 'idle', playing: false, instant: false, plays: prev.plays }
  return { ...prev, screen, playing: false }
}
