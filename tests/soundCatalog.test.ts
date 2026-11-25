import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MASTER_GAIN, RATE_JITTER, SOUND_FILES, SOUND_NAMES, SOUNDS, voiceOf, type Sound, type SoundFile, type SoundName } from '../src/sound/catalog'

/** 그 음원을 쓰는 자리들 */
const slotsOf = (file: SoundFile) => SOUND_NAMES.filter((name) => (SOUNDS[name] as Sound).file === file).sort()
const sorted = (names: SoundName[]) => [...names].sort()

describe('소리의 구분', () => {
  it('소리 자리 스물다섯이 이름으로 있고, 자리마다 함께 쓰는 사건이 적혀 있다', () => {
    expect(SOUND_NAMES).toHaveLength(25)
    for (const name of SOUND_NAMES) expect((SOUNDS[name] as Sound).for.length).toBeGreaterThan(0)
  })

  it('촘촘히 되풀이되는 자리(지나가는 책등·호버·다이얼·줄 끝)에는 솎는 간격이 있다', () => {
    for (const name of ['glideTick', 'spinePull', 'dialTick', 'rowEnd'] as const) {
      expect(SOUNDS[name].minGapMs).toBeGreaterThan(0)
    }
  })
})

describe('음원(편집자가 들어 보고 정한 것, 2026-11-25)', () => {
  it('음원은 여섯 개이고 파일이 모두 public/sounds에 있다', () => {
    expect(Object.keys(SOUND_FILES).sort()).toEqual(['open', 'riffle', 'thud', 'tik', 'tok', 'whoosh'])
    for (const url of Object.values(SOUND_FILES)) {
      expect(url).toMatch(/^\/sounds\/[a-z]+\.wav$/)
      expect(existsSync(resolve(__dirname, '../public', url.slice(1)))).toBe(true)
    }
  })

  it('"톡"(A): 책 넘기기·책등 호버·집어 들기·돌아오기·권 넘기기·여러 권 밀림', () => {
    expect(slotsOf('tok')).toEqual(sorted(['spineRub', 'spinePull', 'bookPull', 'bookReturn', 'volumeSlide', 'rowSweep']))
  })

  it('"툭"(B): 책이 내려앉음·꽂힘·줄 끝', () => {
    expect(slotsOf('thud')).toEqual(sorted(['bookLand', 'bookTuck', 'rowEnd']))
  })

  it('펼치는 소리(C-1): 책 펼치기·한 장 넘기기·앞뒤표지 / 후루룩(C-2): 여러 장 건너뛰기', () => {
    expect(slotsOf('open')).toEqual(sorted(['coverOpen', 'pageTurn', 'coverFlip']))
    expect(slotsOf('riffle')).toEqual(['pageRiffle'])
  })

  it('"틱"(E): 지나가는 책등·권수 다이얼·글자 다이얼·표지가 돎·버튼·웰컴의 점', () => {
    expect(slotsOf('tik')).toEqual(sorted(['glideTick', 'dialTick', 'dialClack', 'coverSnap', 'buttonTick', 'penDot']))
  })

  it('"휙"(G): 책이 날아감·돌아옴', () => {
    expect(slotsOf('whoosh')).toEqual(['bookWhoosh'])
  })

  it('소리가 없는 자리: 책 덮기·말풍선(편집자 결정), 분류 화면의 책이 나오고 들어감(아직 정하지 않음)', () => {
    const silent = SOUND_NAMES.filter((name) => voiceOf(name) === null)
    expect(sorted(silent)).toEqual(sorted(['bookShut', 'noteFlutter', 'drawerOpen', 'drawerClose', 'drawerThud']))
  })

  it('자리의 세기는 0~1이고, 부르는 쪽이 준 세기를 곱한다', () => {
    for (const name of SOUND_NAMES) {
      const voice = voiceOf(name)
      if (!voice) continue
      expect(voice.gain).toBeGreaterThan(0)
      expect(voice.gain).toBeLessThanOrEqual(1)
    }
    expect(voiceOf('bookTuck', { gain: 0.5 })!.gain).toBeCloseTo(voiceOf('bookTuck')!.gain * 0.5)
  })

  it('전체 음량은 하나로 낮게 두고, 빠르기는 조금만 흩뜨린다', () => {
    expect(MASTER_GAIN).toBeGreaterThan(0)
    expect(MASTER_GAIN).toBeLessThanOrEqual(0.6)
    expect(RATE_JITTER).toBeGreaterThan(0)
    expect(RATE_JITTER).toBeLessThanOrEqual(0.08)
  })
})
