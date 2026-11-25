import { useEffect, useState } from 'react'
import type { Screen } from '../app/screen'
import { featureAfter, featureSchedule, featureStart } from './timeline'

/**
 * 신간 소개의 단계(`timeline.ts`)를 시간에 따라 넘긴다. App이 쓴다.
 * - 웰컴에서 내려오면 처음(`idle`)부터 박자표대로 저절로 이어진다(휠로 넘기지 않는다)
 * - 서가에서 올라오면 다 펼쳐진 마지막 모습으로 바로 놓인다(`instant`: 전환 없이)
 * - 웰컴으로 올라가면 거두고, 서가로 내려가면 보이던 모습 그대로 멈춘다
 * 화면이 바뀐 바로 그 그리기에서 단계도 바뀐다(한 프레임이라도 앞의 모습이 끼지 않게 그리는 중에 맞춘다).
 */
export function useFeature(screen: Screen) {
  const [run, setRun] = useState(() => featureStart(screen))
  const next = featureAfter(run, screen)
  if (next !== run) setRun(next)
  const { playing, plays } = next

  useEffect(() => {
    if (!playing) return
    const ids = featureSchedule().map(({ step, at }) =>
      setTimeout(() => setRun((r) => (r.playing && r.plays === plays ? { ...r, step } : r)), at),
    )
    return () => ids.forEach(clearTimeout)
  }, [playing, plays])

  return { step: next.step, instant: next.instant }
}
