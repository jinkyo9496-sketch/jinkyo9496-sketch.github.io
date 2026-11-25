import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MASTER_GAIN, SOUND_FILES } from '../src/sound/catalog'
import { createFileEngine, type FileEngine } from '../src/sound/engine'

/** 가짜 AudioContext: 만든 노드와 상태만 적는다 */
class FakeContext {
  static made: FakeContext[] = []
  state: 'suspended' | 'running' | 'closed' = 'suspended'
  destination = { kind: 'destination' }
  sources: FakeSource[] = []
  gains: FakeGain[] = []
  private listeners: (() => void)[] = []
  constructor() {
    FakeContext.made.push(this)
  }
  addEventListener(_type: string, fn: () => void) {
    this.listeners.push(fn)
  }
  setState(next: FakeContext['state']) {
    this.state = next
    this.listeners.forEach((fn) => fn())
  }
  resume() {
    this.setState('running')
    return Promise.resolve()
  }
  close() {
    this.state = 'closed'
    return Promise.resolve()
  }
  createGain() {
    const gain = new FakeGain()
    this.gains.push(gain)
    return gain
  }
  createBufferSource() {
    const source = new FakeSource()
    this.sources.push(source)
    return source
  }
  decodeAudioData(data: { url: string }) {
    return Promise.resolve({ decoded: data.url })
  }
}
class FakeGain {
  gain = { value: 1 }
  to: unknown = null
  connect(to: unknown) {
    this.to = to
  }
  disconnect() {
    this.to = null
  }
}
class FakeSource {
  buffer: { decoded: string } | null = null
  playbackRate = { value: 1 }
  to: unknown = null
  started = false
  onended: (() => void) | null = null
  connect(to: unknown) {
    this.to = to
  }
  disconnect() {
    this.to = null
  }
  start() {
    this.started = true
  }
}

const gesture = () => window.dispatchEvent(new Event('pointerdown'))
/** 약속들이 다 풀리게 한다(resume, fetch → 풀기) */
const settle = async () => {
  for (let i = 0; i < 6; i++) await Promise.resolve()
}

describe('음원 파일을 내는 엔진', () => {
  let engine: FileEngine | null = null
  let fetched: string[] = []

  beforeEach(() => {
    FakeContext.made = []
    fetched = []
    vi.stubGlobal('AudioContext', FakeContext)
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        fetched.push(url)
        return Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve({ url }) })
      }),
    )
  })
  afterEach(() => {
    engine?.dispose()
    engine = null
    vi.unstubAllGlobals()
  })

  it('AudioContext가 없는 환경에서는 엔진을 만들지 않는다', () => {
    vi.unstubAllGlobals()
    expect(createFileEngine()).toBeNull()
  })

  it('첫 입력 전에는 아무것도 만들지도 받지도 않고, 열려 있지 않다', () => {
    engine = createFileEngine()!
    expect(engine.unlocked).toBe(false)
    expect(FakeContext.made).toHaveLength(0)
    expect(fetched).toEqual([])
    expect(() => engine!.play('spineRub')).not.toThrow()
  })

  it('첫 입력에서 열리고 음원 여섯을 받는다. 전체 음량은 마스터 게인 하나', async () => {
    engine = createFileEngine()!
    gesture()
    await settle()
    expect(engine.unlocked).toBe(true)
    expect(fetched.sort()).toEqual(Object.values(SOUND_FILES).sort())
    const ctx = FakeContext.made[0]
    expect(ctx.gains[0].gain.value).toBe(MASTER_GAIN)
    expect(ctx.gains[0].to).toBe(ctx.destination)
  })

  it('자리의 음원을 그 자리의 세기로 낸다: 같은 음원을 쓰는 자리는 같은 파일이 난다', async () => {
    engine = createFileEngine()!
    gesture()
    await settle()
    const ctx = FakeContext.made[0]
    engine.play('spineRub')
    engine.play('bookPull')
    engine.play('bookLand', { gain: 0.5 })
    expect(ctx.sources.map((s) => s.buffer?.decoded)).toEqual([SOUND_FILES.tok, SOUND_FILES.tok, SOUND_FILES.thud])
    expect(ctx.sources.every((s) => s.started)).toBe(true)
    expect(ctx.gains[1].gain.value).toBeCloseTo(0.8)
    expect(ctx.gains[3].gain.value).toBeCloseTo(0.7 * 0.5)
    for (const s of ctx.sources) expect(Math.abs(s.playbackRate.value - 1)).toBeLessThanOrEqual(0.04 + 1e-9)
  })

  it('소리가 없는 자리(여기서는 책 덮기·말풍선)는 아무것도 내지 않는다', async () => {
    engine = createFileEngine()!
    gesture()
    await settle()
    engine.play('bookShut')
    engine.play('noteFlutter')
    expect(FakeContext.made[0].sources).toHaveLength(0)
  })

  it('다 울린 소리의 노드는 끊어 둔다', async () => {
    engine = createFileEngine()!
    gesture()
    await settle()
    const ctx = FakeContext.made[0]
    engine.play('buttonTick')
    const source = ctx.sources[0]
    expect(source.to).not.toBeNull()
    source.onended?.()
    expect(source.to).toBeNull()
    expect(ctx.gains[1].to).toBeNull()
  })

  it('열린 뒤 브라우저가 멈추면 조용해지고, 다음 입력에서 다시 열린다', async () => {
    engine = createFileEngine()!
    gesture()
    await settle()
    const ctx = FakeContext.made[0]
    ctx.setState('suspended')
    expect(engine.unlocked).toBe(false)
    engine.play('spineRub')
    expect(ctx.sources).toHaveLength(0)
    gesture()
    await settle()
    expect(engine.unlocked).toBe(true)
    expect(FakeContext.made).toHaveLength(1)
    engine.play('spineRub')
    expect(ctx.sources).toHaveLength(1)
  })

  it('음원을 받지 못해도 오류 없이 조용하고(냈다고 하지 않는다), 다음 입력에서 다시 받는다', async () => {
    let offline = true
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        offline ? Promise.reject(new Error('offline')) : Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve({ url }) }),
      ),
    )
    engine = createFileEngine()!
    gesture()
    await settle()
    expect(engine.play('spineRub')).toBe(false)
    expect(FakeContext.made[0].sources).toHaveLength(0)
    offline = false
    gesture()
    await settle()
    expect(engine.play('spineRub')).toBe(true)
    expect(FakeContext.made).toHaveLength(1)
  })

  it('실제로 냈으면 true, 소리 없는 자리는 false를 돌려준다', async () => {
    engine = createFileEngine()!
    gesture()
    await settle()
    expect(engine.play('bookLand')).toBe(true)
    expect(engine.play('bookShut')).toBe(false)
  })
})
