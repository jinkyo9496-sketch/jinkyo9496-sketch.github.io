import { MASTER_GAIN, RATE_JITTER, SOUND_FILES, voiceOf, type PlayOptions, type SoundFile, type SoundName } from './catalog'

/**
 * 음원 파일을 실제로 내는 엔진(2026-11-25. Web Audio). 부르는 쪽(`play.ts`)은 `unlocked`와 `play`만 쓴다.
 * - 브라우저는 방문자의 첫 입력(클릭·키·터치) 전의 소리를 막는다: 첫 입력에서 `AudioContext`를 만들고 깨운 뒤 음원 여섯을
 *   받아 둔다. 그 전에는 `unlocked`가 false이고(요청은 `play.ts`가 버린다), 그 자리의 음원이 오기 전의 요청도 조용히 버린다
 * - 열린 뒤에 브라우저가 멈추면(iOS Safari의 탭 전환·화면 잠금 등) 다음 입력에서 다시 깨운다
 * - 음원이 없는 자리는 아무 소리도 내지 않는다. 전체 음량은 마스터 게인 하나(`MASTER_GAIN`)
 * - `AudioContext`가 없는 환경(jsdom·오래된 브라우저)에서는 엔진을 만들지 않는다(null)
 */

/** 브라우저가 "방문자의 입력"으로 쳐 주는 사건들. 휠·포인터 이동은 치지 않는다 */
const GESTURES = ['pointerdown', 'pointerup', 'keydown', 'touchend', 'click'] as const

const FILE_COUNT = Object.keys(SOUND_FILES).length

type AudioContextCtor = typeof AudioContext

function audioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor }
  return w.AudioContext ?? w.webkitAudioContext ?? null
}

export interface FileEngine {
  /** 소리를 낼 수 있는가: 방문자의 첫 입력으로 `AudioContext`가 돌기 시작한 뒤부터 true */
  readonly unlocked: boolean
  /** 그 자리의 소리를 낸다. 실제로 냈으면 true(음원이 없는 자리, 음원이 아직 오지 않은 자리는 조용하고 false) */
  play(name: SoundName, options?: PlayOptions): boolean
  /** 듣던 입력과 AudioContext를 거둔다 */
  dispose(): void
}

export function createFileEngine(): FileEngine | null {
  const Ctor = audioContextCtor()
  if (!Ctor) return null

  let ctx: AudioContext | null = null
  let master: GainNode | null = null
  const buffers = new Map<SoundFile, AudioBuffer>()
  /** 받고 있는 음원 */
  const loading = new Set<SoundFile>()

  const running = () => ctx !== null && ctx.state === 'running'

  /** 아직 없는 음원을 받아 풀어 둔다. 하나가 실패해도 나머지는 쓰고, 실패한 것은 다음 입력에서 다시 받는다 */
  const load = (c: AudioContext) => {
    for (const file of Object.keys(SOUND_FILES) as SoundFile[]) {
      if (buffers.has(file) || loading.has(file)) continue
      loading.add(file)
      void fetch(SOUND_FILES[file])
        .then((response) => (response.ok ? response.arrayBuffer() : Promise.reject(new Error(String(response.status)))))
        .then((data) => c.decodeAudioData(data))
        .then((buffer) => {
          if (ctx === c) buffers.set(file, buffer)
        })
        .catch(() => {})
        .finally(() => {
          if (ctx === c) loading.delete(file)
        })
    }
  }

  const onGesture = () => {
    try {
      if (!ctx) {
        ctx = new Ctor()
        const made = ctx
        // 열린 뒤에 브라우저가 멈출 수 있다: 그때는 입력을 다시 들어 다음 입력에서 깨운다
        made.addEventListener('statechange', () => {
          if (ctx === made && made.state !== 'running') listen()
        })
        master = ctx.createGain()
        master.gain.value = MASTER_GAIN
        master.connect(ctx.destination)
      }
      load(ctx)
      if (running() && buffers.size === FILE_COUNT) return stopListening()
      void ctx
        .resume()
        .then(() => {
          if (running() && buffers.size === FILE_COUNT) stopListening()
        })
        .catch(() => {})
    } catch {
      // 만들 수 없는 환경: 소리 없이 간다
    }
  }
  const stopListening = () => {
    for (const type of GESTURES) window.removeEventListener(type, onGesture, true)
  }
  /** 입력을 듣는다(이미 듣고 있으면 그대로다: 같은 리스너는 한 번만 붙는다) */
  const listen = () => {
    for (const type of GESTURES) window.addEventListener(type, onGesture, { capture: true, passive: true })
  }
  listen()

  return {
    get unlocked() {
      return running()
    },
    play(name, options) {
      if (!ctx || !master || !running()) return false
      const voice = voiceOf(name, options)
      if (!voice) return false
      const buffer = buffers.get(voice.file)
      if (!buffer) return false
      try {
        const source = ctx.createBufferSource()
        source.buffer = buffer
        source.playbackRate.value = 1 + (Math.random() * 2 - 1) * RATE_JITTER
        const gain = ctx.createGain()
        gain.gain.value = voice.gain
        source.connect(gain)
        gain.connect(master)
        // 다 울리면 노드를 끊어 둔다(마스터에 매달린 채 쌓이지 않게)
        source.onended = () => {
          source.disconnect()
          gain.disconnect()
        }
        source.start()
        return true
      } catch {
        // 소리 하나가 실패해도 화면의 동작에는 영향을 주지 않는다
        return false
      }
    },
    dispose() {
      stopListening()
      void ctx?.close().catch(() => {})
      ctx = null
      master = null
      buffers.clear()
      loading.clear()
    },
  }
}
