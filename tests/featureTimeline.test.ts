import { describe, expect, it } from 'vitest'
import {
  FEATURE_FINAL,
  FEATURE_STEPS,
  FEATURE_TIMING,
  featureAfter,
  featureCssVars,
  featureSchedule,
  featureStart,
  featureStepAt,
  featureTotalMs,
  stepReached,
  type FeatureRun,
} from '../src/feature/timeline'

describe('신간 소개의 박자: 단계의 순서', () => {
  it('말풍선 → 큰 문구 → 목업 → 책 정보 → 소개 문구 → 편집자의 한 마디 → 영상 순서다(처음은 아무것도 없는 idle)', () => {
    expect(FEATURE_STEPS).toEqual(['idle', 'bubbles', 'claim', 'mockup', 'info', 'pitch', 'note', 'video'])
    expect(FEATURE_FINAL).toBe('video')
    expect(featureSchedule().map((s) => s.step)).toEqual(['bubbles', 'claim', 'mockup', 'info', 'pitch', 'note', 'video'])
  })

  it('각 단계는 앞 단계가 다 보인 뒤에 시작한다', () => {
    const at = Object.fromEntries(featureSchedule().map((s) => [s.step, s.at]))
    const t = FEATURE_TIMING
    // 셋째 말풍선이 다 나온 뒤 멈췄다가 큰 문구
    const bubblesDone = at.bubbles + t.bubbleGapMs * 2 + t.bubbleInMs
    expect(at.claim).toBeGreaterThanOrEqual(bubblesDone + t.bubbleHoldMs)
    // 큰 문구가 다 올라와 읽힌 뒤 목업
    expect(at.mockup).toBeGreaterThanOrEqual(at.claim + t.claimInMs + t.claimHoldMs)
    // 목업이 가운데 떠 있다가 왼쪽으로
    expect(at.info).toBeGreaterThanOrEqual(at.mockup + t.mockupInMs + t.mockupHoldMs)
    // 책 정보가 다 붙은 뒤 소개 문구, 소개 문구가 다 나온 뒤 한 마디, 한 마디가 다 나온 뒤 영상
    expect(at.pitch).toBeGreaterThanOrEqual(at.info + t.infoMs)
    expect(at.note).toBeGreaterThanOrEqual(at.pitch + t.pitchMs)
    expect(at.video).toBeGreaterThanOrEqual(at.note + t.noteMs)
    const times = featureSchedule().map((s) => s.at)
    expect([...times].sort((a, b) => a - b)).toEqual(times)
    expect(new Set(times).size).toBe(times.length)
  })

  it('편집자가 준 기준 안이다: 말풍선 간격 750ms, 멈춤 1.2초, 큰 문구 약 2초, 목업 약 1초, 전체 12초 안쪽', () => {
    const t = FEATURE_TIMING
    expect(t.bubbleGapMs).toBe(750)
    expect(t.bubbleHoldMs).toBe(1200)
    expect(t.claimHoldMs).toBe(2000)
    expect(t.mockupHoldMs).toBe(1000)
    expect(featureTotalMs()).toBe(featureSchedule().at(-1)!.at + t.videoMs)
    expect(featureTotalMs()).toBeLessThan(12000)
    expect(featureTotalMs()).toBeGreaterThan(8000)
  })

  it('지난 시간으로 단계를 찾는다', () => {
    const [bubbles, claim, , , , , video] = featureSchedule()
    expect(featureStepAt(0)).toBe('idle')
    expect(featureStepAt(bubbles.at - 1)).toBe('idle')
    expect(featureStepAt(bubbles.at)).toBe('bubbles')
    expect(featureStepAt(claim.at - 1)).toBe('bubbles')
    expect(featureStepAt(claim.at)).toBe('claim')
    expect(featureStepAt(video.at)).toBe('video')
    expect(featureStepAt(60_000)).toBe('video')
  })

  it('stepReached: 그 단계에 닿았거나 지났는가', () => {
    expect(stepReached('idle', 'bubbles')).toBe(false)
    expect(stepReached('mockup', 'mockup')).toBe(true)
    expect(stepReached('video', 'mockup')).toBe(true)
    expect(stepReached('claim', 'mockup')).toBe(false)
  })

  it('박자를 CSS에 넘긴다(값의 원본은 이 모듈 하나)', () => {
    const vars = featureCssVars()
    expect(vars['--bubble-gap']).toBe(`${FEATURE_TIMING.bubbleGapMs}ms`)
    expect(vars['--bubble-in']).toBe(`${FEATURE_TIMING.bubbleInMs}ms`)
    expect(vars['--claim-in']).toBe(`${FEATURE_TIMING.claimInMs}ms`)
    expect(vars['--claim-out']).toBe(`${FEATURE_TIMING.claimOutMs}ms`)
    expect(vars['--mockup-in']).toBe(`${FEATURE_TIMING.mockupInMs}ms`)
    expect(vars['--info-ms']).toBe(`${FEATURE_TIMING.infoMs}ms`)
    expect(vars['--pitch-ms']).toBe(`${FEATURE_TIMING.pitchMs}ms`)
    expect(vars['--note-ms']).toBe(`${FEATURE_TIMING.noteMs}ms`)
    expect(vars['--video-ms']).toBe(`${FEATURE_TIMING.videoMs}ms`)
  })
})

describe('featureAfter: 화면이 바뀔 때 신간 소개가 어디서 시작하는가', () => {
  const run = (screen: FeatureRun['screen'], extra: Partial<FeatureRun> = {}): FeatureRun => ({
    screen,
    step: 'idle',
    playing: false,
    instant: false,
    plays: 0,
    ...extra,
  })

  it('처음: 신간 소개에서 시작하면 다 펼쳐진 마지막 모습, 다른 화면이면 아직 아무것도 없다', () => {
    expect(featureStart('feature')).toEqual(run('feature', { step: 'video', instant: true }))
    expect(featureStart('intro')).toEqual(run('intro'))
    expect(featureStart('shelf')).toEqual(run('shelf'))
  })

  it('웰컴에서 내려오면 처음부터 돈다', () => {
    const next = featureAfter(run('intro'), 'feature')
    expect(next).toEqual(run('feature', { playing: true, plays: 1 }))
    // 다 본 뒤 웰컴에 갔다가 다시 내려와도 처음부터
    const again = featureAfter(featureAfter(run('feature', { step: 'video', plays: 1 }), 'intro'), 'feature')
    expect(again).toMatchObject({ step: 'idle', playing: true, plays: 2, instant: false })
  })

  it('서가에서 올라오면 마지막 단계로 바로 놓인다(애니메이션을 다시 돌리지 않는다)', () => {
    expect(featureAfter(run('shelf'), 'feature')).toEqual(run('feature', { step: 'video', instant: true }))
    // 도는 중에 서가로 내려갔다 올라와도 같다
    const left = featureAfter(run('feature', { step: 'claim', playing: true, plays: 1 }), 'shelf')
    expect(left).toMatchObject({ step: 'claim', playing: false })
    expect(featureAfter(left, 'feature')).toMatchObject({ step: 'video', playing: false, instant: true })
  })

  it('웰컴으로 올라가면 거둔다(다시 내려오면 처음부터 돌 수 있게)', () => {
    expect(featureAfter(run('feature', { step: 'video', instant: true, plays: 1 }), 'intro')).toEqual(run('intro', { plays: 1 }))
    expect(featureAfter(run('shelf', { step: 'video', plays: 1 }), 'intro')).toMatchObject({ step: 'idle', playing: false })
  })

  it('서가·분류로 가면 그 모습 그대로 멈춘다. 화면이 그대로면 같은 객체', () => {
    const done = run('feature', { step: 'video', plays: 1 })
    expect(featureAfter(done, 'shelf')).toEqual({ ...done, screen: 'shelf' })
    expect(featureAfter(run('shelf'), 'fields')).toEqual(run('fields'))
    expect(featureAfter(done, 'feature')).toBe(done)
  })
})
