import { SOUNDS, type PlayOptions, type Sound, type SoundName } from './catalog'
import type { Channel, Cue } from './cues'
import { createFileEngine } from './engine'

/**
 * 부르는 쪽이 쓰는 것은 `play(이름, 옵션)` 하나다(2026-11-25 효과음). 어느 자리가 어느 음원을 쓰는지는 `catalog.ts`,
 * 실제로 내는 것은 `engine.ts`가 알고, 여기는 그 사이에서 세 가지만 맡는다.
 * - 엔진이 아직 열리지 않았으면(방문자의 첫 입력 전) 조용히 버린다. 쌓아 두지 않는다
 * - 최소 간격을 둔 소리(`minGapMs`)가 그 안에 다시 불리면 내지 않는다
 * - 나중에 낼 소리의 예약(`scheduleCues`)과 거두기(`cancelCues`). 예약은 채널마다 한 벌이다
 * 소리 켜기/끄기 버튼은 없다(편집자 확정).
 */

/** 소리를 실제로 내는 것. 테스트는 불린 이름을 적는 가짜 엔진을 끼운다 */
export interface SoundEngine {
  /** 소리를 낼 수 있는가. false인 동안의 요청은 버린다(브라우저는 방문자의 첫 입력 전의 소리를 막는다) */
  readonly unlocked: boolean
  /** 그 자리의 소리를 낸다. 실제로는 나지 않았으면 false를 돌려준다(음원이 없는 자리, 음원이 아직 오지 않았다) */
  play(name: SoundName, options?: PlayOptions): boolean | void
}

/**
 * 소리 없는 엔진: 받기만 하고 내지 않는다(냈다고 하지 않으므로 기록에도 적히지 않는다).
 * `AudioContext`가 없는 환경(jsdom·오래된 브라우저)과 `initSound` 전에 쓴다
 */
const SILENT: SoundEngine = { unlocked: true, play: () => false }

/** 끼워 넣은 엔진(테스트의 가짜 엔진) */
let injected: SoundEngine | null = null
/** 음원 파일을 내는 엔진(`initSound`가 만든다) */
let builtIn: SoundEngine | null = null
const engine = () => injected ?? builtIn ?? SILENT

/**
 * 음원 파일을 내는 엔진을 만들고 방문자의 첫 입력을 듣기 시작한다(그 입력에서 소리가 열린다). App이 뜰 때 한 번 부른다.
 * 여러 번 불러도 같다. `AudioContext`가 없는 환경에서는 아무 일도 하지 않는다
 */
export function initSound() {
  builtIn ??= createFileEngine()
}

/** 소리마다 마지막으로 낸 때(`Date.now()`): 최소 간격을 잰다 */
const lastAt = new Map<SoundName, number>()

/** 최근에 실제로 난 소리 자리(이름과 시각. 엔진이 내지 않았다고 한 요청, 곧 소리 없는 자리·음원이 아직 오지 않은 때의 것은 적지 않는다). 개발 서버의 `window.__sound.log`와 테스트가 읽는다 */
const LOG_KEEP = 200
const log: { name: SoundName; at: number }[] = []

/**
 * 엔진을 바꿔 끼운다(테스트: 불린 이름을 적는 가짜 엔진). null이면 기본 엔진으로 돌아간다.
 * 최소 간격을 재던 기록도 지운다(테스트끼리 섞이지 않게)
 */
export function setSoundEngine(next: SoundEngine | null) {
  injected = next
  lastAt.clear()
}

/** 최근에 실제로 난 소리 자리 */
export const soundLog = (): readonly { name: SoundName; at: number }[] => log

/**
 * 그 이름의 소리 자리를 한 번 부른다. 엔진에 넘겼으면 true(실제로 났는지는 엔진이 안다: 소리 없는 자리도 true다).
 * 엔진이 열리지 않았거나, 최소 간격 안에 다시 불렸으면 넘기지 않고 false(나중에 내려고 쌓아 두지 않는다)
 */
export function play(name: SoundName, options?: PlayOptions): boolean {
  const target = engine()
  if (!target.unlocked) return false
  const now = Date.now()
  const gap = (SOUNDS[name] as Sound).minGapMs
  if (gap !== undefined) {
    const last = lastAt.get(name)
    if (last !== undefined && now - last < gap) return false
  }
  // 기록과 최소 간격의 기준에는 실제로 난 것만 적는다(소리 없는 자리·음원이 아직 오지 않은 때는 적지 않는다)
  if (target.play(name, options) !== false) {
    lastAt.set(name, now)
    record(name)
  }
  return true
}

function record(name: SoundName) {
  log.push({ name, at: Math.round(typeof performance === 'undefined' ? Date.now() : performance.now()) })
  if (log.length > LOG_KEEP) log.splice(0, log.length - LOG_KEEP)
}

// ── 예약 ─────────────────────────────────────────────────

/** 채널마다 아직 나지 않은 예약(setTimeout의 id) */
const pending = new Map<Channel, ReturnType<typeof setTimeout>[]>()

/** 그 채널에 예약해 둔, 아직 나지 않은 소리를 거둔다(전환이 취소됐을 때) */
export function cancelCues(channel: Channel) {
  pending.get(channel)?.forEach(clearTimeout)
  pending.delete(channel)
}

/** 모든 채널의 예약을 거둔다(화면이 사라질 때) */
export function cancelAllCues() {
  for (const ids of pending.values()) ids.forEach(clearTimeout)
  pending.clear()
}

/**
 * 그 채널의 소리를 시간표대로 낸다: 0ms의 것은 바로, 나머지는 그때 가서. 같은 채널에 먼저 예약해 둔 것은 거둔다
 * (같은 움직임이 다시 시작됐으면 앞의 것의 남은 소리는 맞지 않는다). 빈 목록이면 거두기만 한다
 */
export function scheduleCues(channel: Channel, cues: readonly Cue[]) {
  cancelCues(channel)
  const ids: ReturnType<typeof setTimeout>[] = []
  for (const cue of cues) {
    const options = cue.gain === undefined ? undefined : { gain: cue.gain }
    if (cue.atMs <= 0) play(cue.name, options)
    else ids.push(setTimeout(() => play(cue.name, options), cue.atMs))
  }
  if (ids.length > 0) pending.set(channel, ids)
}

// 개발 서버에서만: 어느 소리 자리가 언제 났는지 브라우저 콘솔에서 본다(`window.__sound`). 배포 빌드에는 들어가지 않는다
if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as { __sound?: unknown }).__sound = {
    /** 최근에 실제로 난 소리 자리의 이름과 시각(`performance.now()`, ms) */
    get log() {
      return log
    },
    /** 손으로 내 보기 */
    play: (name: SoundName, options?: PlayOptions) => play(name, options),
  }
}
