import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SOUNDS } from '../src/sound/catalog'
import { cancelAllCues, cancelCues, play, scheduleCues, setSoundEngine, soundLog, type SoundEngine } from '../src/sound/play'

/** 가짜 엔진: 불린 이름을 적어 둔다 */
function fakeEngine(unlocked = true) {
  const played: string[] = []
  const engine: SoundEngine & { played: string[]; unlocked: boolean } = {
    unlocked,
    played,
    play: (name) => void played.push(name),
  }
  return engine
}

describe('play(이름)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000_000)
  })
  afterEach(() => {
    cancelAllCues()
    setSoundEngine(null)
    vi.useRealTimers()
  })

  it('부르는 쪽은 이름만 알고, 엔진이 그 이름을 받는다', () => {
    const engine = fakeEngine()
    setSoundEngine(engine)
    expect(play('spineRub')).toBe(true)
    expect(engine.played).toEqual(['spineRub'])
    expect(soundLog().at(-1)?.name).toBe('spineRub')
  })

  it('엔진이 아직 열리지 않았으면 조용히 버린다: 쌓아 두었다가 나중에 내지 않는다', () => {
    const engine = fakeEngine(false)
    setSoundEngine(engine)
    const before = soundLog().length
    expect(play('spineRub')).toBe(false)
    expect(play('bookLand')).toBe(false)
    engine.unlocked = true
    expect(engine.played).toEqual([])
    expect(soundLog()).toHaveLength(before)
    play('buttonTick')
    expect(engine.played).toEqual(['buttonTick'])
  })

  it('엔진을 끼우지 않으면(소리 없는 엔진) 소리가 없다: 오류 없이 받기만 하고, 나지 않았으니 기록에도 적지 않는다', () => {
    setSoundEngine(null)
    const before = soundLog().length
    expect(() => play('bookLand')).not.toThrow()
    expect(play('spineRub')).toBe(true)
    expect(soundLog()).toHaveLength(before)
  })

  it('엔진이 실제로는 내지 않았다고 하면(소리 없는 자리·음원이 아직 오지 않음) 기록에 적지 않는다', () => {
    setSoundEngine({ unlocked: true, play: (name) => name !== 'bookShut' })
    const before = soundLog().length
    play('bookShut')
    expect(soundLog()).toHaveLength(before)
    play('bookLand')
    expect(soundLog()).toHaveLength(before + 1)
  })

  it('최소 간격을 둔 소리는 그 안에 다시 불려도 한 번만 난다(촘촘하면 솎는다)', () => {
    const gap = SOUNDS.glideTick.minGapMs!
    expect(gap).toBeGreaterThan(0)
    const engine = fakeEngine()
    setSoundEngine(engine)
    play('glideTick')
    vi.advanceTimersByTime(gap - 1)
    expect(play('glideTick')).toBe(false)
    vi.advanceTimersByTime(1)
    expect(play('glideTick')).toBe(true)
    expect(engine.played).toEqual(['glideTick', 'glideTick'])
    expect(SOUNDS.spinePull.minGapMs).toBeGreaterThan(0)
  })

  it('엔진이 내지 않았다고 한 요청은 최소 간격의 기준이 되지 않는다: 바로 다음 요청이 솎이지 않는다', () => {
    const gap = SOUNDS.glideTick.minGapMs!
    let ready = false
    const played: string[] = []
    setSoundEngine({
      unlocked: true,
      play: (name) => {
        if (!ready) return false
        played.push(name)
        return true
      },
    })
    // 음원이 아직 오지 않았다: 엔진에 넘어가지만 나지 않는다
    expect(play('glideTick')).toBe(true)
    ready = true
    vi.advanceTimersByTime(1)
    // 앞의 것이 나지 않았으므로 간격 안이어도 난다
    expect(play('glideTick')).toBe(true)
    expect(played).toEqual(['glideTick'])
    // 실제로 난 것은 기준이 된다
    vi.advanceTimersByTime(gap - 1)
    expect(play('glideTick')).toBe(false)
    vi.advanceTimersByTime(1)
    expect(play('glideTick')).toBe(true)
    expect(played).toEqual(['glideTick', 'glideTick'])
  })

  it('예약한 소리는 제때 나고, 같은 채널에 새로 예약하거나 거두면 아직 나지 않은 것은 사라진다', () => {
    const engine = fakeEngine()
    setSoundEngine(engine)
    scheduleCues('shelf', [
      { name: 'spineRub', atMs: 0 },
      { name: 'bookLand', atMs: 1000 },
    ])
    expect(engine.played).toEqual(['spineRub'])
    vi.advanceTimersByTime(999)
    expect(engine.played).toEqual(['spineRub'])
    vi.advanceTimersByTime(1)
    expect(engine.played).toEqual(['spineRub', 'bookLand'])

    scheduleCues('shelf', [{ name: 'bookLand', atMs: 1000 }])
    scheduleCues('page', [{ name: 'rowSweep', atMs: 320 }])
    vi.advanceTimersByTime(500)
    // 다른 채널은 건드리지 않는다
    scheduleCues('shelf', [{ name: 'spineRub', atMs: 0 }])
    cancelCues('shelf')
    vi.advanceTimersByTime(5000)
    expect(engine.played).toEqual(['spineRub', 'bookLand', 'rowSweep', 'spineRub'])
  })

  it('모두 거두면 어느 채널의 예약도 남지 않는다(컴포넌트가 사라질 때)', () => {
    const engine = fakeEngine()
    setSoundEngine(engine)
    scheduleCues('page', [{ name: 'bookTuck', atMs: 2300 }])
    scheduleCues('fields', [{ name: 'drawerOpen', atMs: 300 }])
    cancelAllCues()
    vi.advanceTimersByTime(5000)
    expect(engine.played).toEqual([])
  })
})
