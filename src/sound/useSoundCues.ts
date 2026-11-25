import { useEffect, useRef } from 'react'
import { FIELDS_MEMO_IDLE, introDotCues, soundTransition, type SoundSnapshot } from './cues'
import { cancelAllCues, initSound, scheduleCues } from './play'

/**
 * 화면의 상태를 보고 효과음의 자리를 부른다(2026-11-25). App이 그릴 때마다 지금의 상태(`SoundSnapshot`)를 넘기면, 바로 앞의
 * 상태와 견주어 부를 소리 자리를 정하고(`cues.ts`의 `soundTransition`: 순수 계산) 시간표대로 예약한다(`play.ts`).
 * 소리는 얹기만 한다: 화면의 상태·입력·포커스에는 손대지 않는다. 어느 자리가 어느 음원을 쓰는지는 `catalog.ts`.
 * 서가를 WebGL로 그리든 CSS로 그리든 상태가 같으면 부르는 자리도 같다.
 * - 처음 뜰 때: 방문자의 첫 입력을 듣기 시작하고(그때 소리가 열린다), 웰컴에서 시작했으면 점 넷의 자리를 등장 박자에
 *   맞춰 예약한다(소리가 이미 열려 있을 때만 난다: 첫 방문에서는 아직 입력이 없으니 자연히 나지 않는다)
 * - 전환이 거둬지면 그 채널의 예약을, 화면이 사라지면 모든 예약을 거둔다
 */
export function useSoundCues(snapshot: SoundSnapshot) {
  const seen = useRef<SoundSnapshot | null>(null)
  const memo = useRef(FIELDS_MEMO_IDLE)

  useEffect(() => {
    const prev = seen.current
    seen.current = snapshot
    if (!prev) {
      initSound()
      if (snapshot.screen === 'intro') scheduleCues('intro', introDotCues())
      return
    }
    const result = soundTransition(prev, snapshot, memo.current, Date.now())
    memo.current = result.memo
    for (const group of result.groups) scheduleCues(group.channel, group.cues)
  })

  useEffect(
    () => () => {
      cancelAllCues()
      // 개발 서버가 효과를 다시 돌릴 때(StrictMode): 처음부터 다시 본다
      seen.current = null
    },
    [],
  )
}
