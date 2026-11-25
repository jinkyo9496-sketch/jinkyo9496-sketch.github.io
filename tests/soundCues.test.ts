import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SETTLE_OPEN_MS, STEP_MOVE_MS } from '../src/app/useScreen'
import { FEATURE_TIMING } from '../src/feature/timeline'
import { FIELDS_FLIGHT, FIELDS_RETURN, FIELDS_TIMING, fieldsTimeline } from '../src/fields3d/motion'
import { INTRO_DOTS } from '../src/intro/entrance'
import { LINEUP, lineupSlideMs } from '../src/intro/lineup'
import { PAGE_CLOSE, PAGE_OPEN, placeTotalMs } from '../src/shelf3d/motion'
import { READER } from '../src/shelf3d/reader'
import {
  BOOK_SHUT_AT_MS,
  FIELDS_MEMO_IDLE,
  bubbleCues,
  fieldsArrive,
  fieldsChange,
  introDotCues,
  lineupCues,
  shelfStepCues,
  soundTransition,
  spreadCues,
  type Cue,
  type CueGroup,
  type SoundSnapshot,
} from '../src/sound/cues'

const base: SoundSnapshot = {
  screen: 'shelf',
  index: 0,
  count: 48,
  page: false,
  gliding: false,
  moveMs: STEP_MOVE_MS,
  spread: 0,
  flight: null,
  field: 0,
  fieldCount: 5,
  books3d: true,
  featureStep: 'idle',
  featureInstant: false,
  bubbles: 3,
  dialPicks: 0,
}
const snap = (over: Partial<SoundSnapshot> = {}): SoundSnapshot => ({ ...base, ...over })
const step = (prev: Partial<SoundSnapshot>, next: Partial<SoundSnapshot>, now = 10_000, memo = FIELDS_MEMO_IDLE) =>
  soundTransition(snap(prev), snap(next), memo, now)
const on = (groups: CueGroup[], channel: CueGroup['channel']) => groups.find((g) => g.channel === channel)?.cues
const brief = (cues: Cue[] | undefined) => cues?.map((c) => [c.name, c.atMs])
/** 놓이는 움직임이 끝나는 때(ms, 반올림) */
const landMs = (moveMs: number) => Math.round(placeTotalMs(moveMs))

describe('서가의 소리', () => {
  it('책을 한 권 넘기면 바로 "톡"(`spineRub`)이 나고, 놓이는 움직임이 끝나는 때(placeTotalMs)에 "툭" 한다', () => {
    expect(brief(shelfStepCues({ gliding: false, moveMs: STEP_MOVE_MS }))).toEqual([
      ['spineRub', 0],
      ['bookLand', landMs(STEP_MOVE_MS)],
    ])
    const { groups } = step({ index: 3 }, { index: 4 })
    expect(brief(on(groups, 'shelf'))).toEqual([
      ['spineRub', 0],
      ['bookLand', 1000],
    ])
  })

  it('키를 누르고 있어 책장이 지나가는 동안에는 책마다 짧은 틱만 난다(놓이는 소리 없음)', () => {
    const { groups } = step({ index: 3, gliding: true }, { index: 4, gliding: true, moveMs: 200 })
    expect(brief(on(groups, 'shelf'))).toEqual([['glideTick', 0]])
  })

  it('지나가다 멈추면 멈춘 자리의 책이 천천히 놓이는 때에 "툭" 한다', () => {
    const { groups } = step({ index: 9, gliding: true }, { index: 9, gliding: false, moveMs: SETTLE_OPEN_MS })
    expect(brief(on(groups, 'shelf'))).toEqual([['bookLand', landMs(SETTLE_OPEN_MS)]])
  })

  it('권수 다이얼로 책을 고르면 "톡"(`spineRub`) 대신 다이얼의 틱이 난다(한 번에 하나). 놓이는 "툭"은 그대로다', () => {
    expect(brief(shelfStepCues({ gliding: false, moveMs: STEP_MOVE_MS, byDial: true }))).toEqual([
      ['dialTick', 0],
      ['bookLand', landMs(STEP_MOVE_MS)],
    ])
    const { groups } = step({ index: 3 }, { index: 9, dialPicks: 1 })
    expect(brief(on(groups, 'shelf'))).toEqual([
      ['dialTick', 0],
      ['bookLand', landMs(STEP_MOVE_MS)],
    ])
  })

  it('키보드·책등 클릭·끌기로 넘길 때는 다이얼의 틱이 아니라 "톡"(`spineRub`)이다(다이얼을 전에 쓴 적이 있어도)', () => {
    expect(shelfStepCues({ gliding: false, moveMs: STEP_MOVE_MS }).map((c) => c.name)).toEqual(['spineRub', 'bookLand'])
    expect(shelfStepCues({ gliding: true, moveMs: 200 }).map((c) => c.name)).toEqual(['glideTick'])
    const { groups } = step({ index: 3, dialPicks: 4 }, { index: 4, dialPicks: 4 })
    expect(on(groups, 'shelf')!.map((c) => c.name)).toEqual(['spineRub', 'bookLand'])
  })

  it('책 페이지의 권수 다이얼로 고르면 "톡"(`volumeSlide`) 대신 틱 하나', () => {
    const { groups } = step({ page: true, index: 3 }, { page: true, index: 9, dialPicks: 1 })
    expect(brief(on(groups, 'page'))).toEqual([['dialTick', 0]])
  })

  it('웰컴에서 내려온 직후 책을 넘기거나 지나가기 시작하면, 내려올 때 예약한 "툭"은 거둔다(두 번 나지 않게)', () => {
    const stepped = step({ index: 0 }, { index: 1 }).groups
    expect(on(stepped, 'welcome')).toEqual([])
    expect(on(stepped, 'shelf')!.filter((c) => c.name === 'bookLand')).toHaveLength(1)
    const gliding = step({ index: 0 }, { index: 1, gliding: true, moveMs: 200 }).groups
    expect(on(gliding, 'welcome')).toEqual([])
  })

  it('서가가 보이지 않는 화면에서 가운데 책이 바뀌어도 소리가 없다', () => {
    const { groups } = step({ screen: 'fields', index: 3 }, { screen: 'fields', index: 4 })
    expect(on(groups, 'shelf')).toBeUndefined()
  })
})

describe('책 페이지의 소리', () => {
  it('서가에서 열면 0ms에 집어 드는 "톡"(`bookPull`), 나머지 책이 쓸려 나가기 시작하는 때(PAGE_OPEN.sweepAt)에 `rowSweep`의 "톡"', () => {
    const { groups } = step({ page: false }, { page: true })
    expect(brief(on(groups, 'page'))).toEqual([
      ['bookPull', 0],
      ['rowSweep', PAGE_OPEN.sweepAt],
    ])
    // 놓이던 책의 "툭"은 거둔다
    expect(on(groups, 'shelf')).toEqual([])
  })

  it('닫으면 그 거꾸로: 책이 돌아오고(retAt) 나머지가 돌아오고(sweepAt) 끝(total)에 꽂히는 "툭"(`bookTuck`)', () => {
    const { groups } = step({ page: true }, { page: false })
    expect(brief(on(groups, 'page'))).toEqual([
      ['bookReturn', PAGE_CLOSE.retAt],
      ['rowSweep', PAGE_CLOSE.sweepAt],
      ['bookTuck', PAGE_CLOSE.total],
    ])
  })

  it('책 페이지 안에서 다른 권으로 넘기면 "톡"(`volumeSlide`) 하나', () => {
    const { groups } = step({ page: true, index: 3 }, { page: true, index: 4 })
    expect(brief(on(groups, 'page'))).toEqual([['volumeSlide', 0]])
    expect(on(groups, 'shelf')).toBeUndefined()
  })

  it('주소로 다른 화면에서 바로 열린 책 페이지는 여는 소리가 없다', () => {
    const { groups } = step({ screen: 'intro', page: false }, { screen: 'shelf', page: true })
    expect(on(groups, 'page') ?? []).toEqual([])
  })

  it('펼치기·한 장 넘기기·여러 장 건너뛰기·덮기를 펼침면의 변화로 가른다', () => {
    expect(brief(spreadCues(0, 1))).toEqual([['coverOpen', 0]])
    expect(brief(spreadCues(4, 5))).toEqual([['pageTurn', 0]])
    expect(brief(spreadCues(5, 4))).toEqual([['pageTurn', 0]])
    expect(brief(spreadCues(1, 88))).toEqual([['pageRiffle', 0]])
    // 덮는 자리 `bookShut`(소리 없음)은 표지가 다 덮이는 때(READER.close)에 불린다
    expect(brief(spreadCues(88, 0))).toEqual([['bookShut', READER.close]])
    expect(BOOK_SHUT_AT_MS).toBe(READER.close)
    expect(spreadCues(3, 3)).toEqual([])
    const { groups } = step({ page: true, spread: 2 }, { page: true, spread: 3 })
    expect(brief(on(groups, 'read'))).toEqual([['pageTurn', 0]])
  })

  it('펼친 책을 덮고 `bookShut`(소리 없음)이 불리기 전에 권을 넘기거나 책 페이지를 닫으면 남은 `bookShut`(소리 없음)은 거둔다', () => {
    expect(on(step({ page: true, index: 3 }, { page: true, index: 4 }).groups, 'read')).toEqual([])
    expect(on(step({ page: true }, { page: false }).groups, 'read')).toEqual([])
  })

  it('책이 바뀌거나 책 페이지가 닫히며 펼침면이 0으로 돌아간 것은 덮는 자리 `bookShut`(소리 없음)을 부르지 않는다', () => {
    expect(on(step({ page: true, index: 3, spread: 4 }, { page: true, index: 4, spread: 0 }).groups, 'read') ?? []).toEqual([])
    expect(on(step({ page: true, spread: 4 }, { page: false, spread: 0 }).groups, 'read') ?? []).toEqual([])
  })
})

describe('웰컴과 서가 사이', () => {
  it('내려가면 `rowSweep`의 "톡"이 나고, 가운데 책이 펼쳐져 놓이는 때에 "툭" 한다(lineup.ts의 박자)', () => {
    const openAt = Math.round(lineupSlideMs(0, 48) * LINEUP.openAt)
    expect(brief(lineupCues('down', 0, 48))).toEqual([
      ['rowSweep', 0],
      ['bookLand', openAt + landMs(LINEUP.openMs)],
    ])
    const { groups } = step({ screen: 'feature' }, { screen: 'shelf' })
    expect(brief(on(groups, 'welcome'))).toEqual(brief(lineupCues('down', 0, 48)))
  })

  it('올라가면 가운데 책이 꽂히는 때(tuckMs)에 "툭"(`bookTuck`), 줄이 밀리기 시작하는 때(lineAt)에 `rowSweep`의 "톡"', () => {
    const { groups } = step({ screen: 'shelf' }, { screen: 'feature' })
    expect(brief(on(groups, 'welcome'))).toEqual([
      ['rowSweep', LINEUP.lineAt],
      ['bookTuck', LINEUP.tuckMs],
    ])
  })

  it('웰컴 ↔ 신간 소개는 줄이 움직이지 않으니 소리가 없고, 화면 전환 자체의 소리도 없다', () => {
    expect(on(step({ screen: 'intro' }, { screen: 'feature' }).groups, 'welcome') ?? []).toEqual([])
    const down = step({ screen: 'shelf' }, { screen: 'fields', books3d: false }).groups
    expect(down.flatMap((g) => g.cues)).toEqual([])
  })

  it('책 페이지에서 로고로 웰컴에 가면 꽂히는 단계가 없으니 소리도 없다', () => {
    const { groups } = step({ screen: 'shelf', page: true }, { screen: 'intro', page: false })
    expect(groups.flatMap((g) => g.cues)).toEqual([])
  })

  it('서·가·명·강의 점은 intro.css의 등장 박자에 맞춰 네 번 찍힌다', () => {
    const cues = introDotCues()
    expect(cues.map((c) => c.name)).toEqual(['penDot', 'penDot', 'penDot', 'penDot'])
    expect(cues.map((c) => c.atMs)).toEqual([0, 1, 2, 3].map((i) => INTRO_DOTS.atMs + i * INTRO_DOTS.gapMs + INTRO_DOTS.fallMs))
    // 그 값이 CSS의 값과 같다
    const css = readFileSync(resolve(__dirname, '../src/intro/intro.css'), 'utf8')
    expect(css).toContain(`animation: intro-dot ${INTRO_DOTS.fallMs}ms`)
    expect(css).toContain(`animation-delay: calc(${INTRO_DOTS.atMs}ms + var(--i, 0) * ${INTRO_DOTS.gapMs}ms)`)
  })

  it('웰컴을 떠나면 아직 찍히지 않은 점의 소리를 거둔다', () => {
    expect(on(step({ screen: 'intro' }, { screen: 'feature' }).groups, 'intro')).toEqual([])
  })

  it('신간 소개의 말풍선은 나타나는 간격(bubbleGapMs)마다 하나씩 `noteFlutter`를 부른다(소리 없음)', () => {
    expect(brief(bubbleCues(3))).toEqual([
      ['noteFlutter', 0],
      ['noteFlutter', FEATURE_TIMING.bubbleGapMs],
      ['noteFlutter', FEATURE_TIMING.bubbleGapMs * 2],
    ])
    const { groups } = step({ screen: 'feature', featureStep: 'idle' }, { screen: 'feature', featureStep: 'bubbles' })
    expect(on(groups, 'feature')).toHaveLength(3)
  })

  it('서가에서 올라와 마지막 모습으로 바로 놓인 신간 소개에서는 말풍선의 자리 `noteFlutter`(소리 없음)를 부르지 않는다', () => {
    const { groups } = step(
      { screen: 'shelf', featureStep: 'idle' },
      { screen: 'feature', featureStep: 'video', featureInstant: true },
    )
    expect(on(groups, 'feature') ?? []).toEqual([])
  })
})

describe('학제별 분류의 소리', () => {
  const T = FIELDS_TIMING
  const turnAt = (i: number) => fieldsTimeline(5).turnAt(i)

  it('화면에 들어서면 등장을 기다린 뒤(arriveMs) `drawerOpen`을 부르고(소리 없음), 보이는 책(네 권까지)이 시간표의 권당 시차로 돌 때마다 "틱"(`coverSnap`)', () => {
    const { cues, memo } = fieldsArrive(1000, 5)
    expect(brief(cues)).toEqual([
      ['drawerOpen', T.arriveMs],
      ['coverSnap', T.arriveMs + turnAt(0)],
      ['coverSnap', T.arriveMs + turnAt(1)],
      ['coverSnap', T.arriveMs + turnAt(2)],
      ['coverSnap', T.arriveMs + turnAt(3)],
    ])
    expect(turnAt(1) - turnAt(0)).toBe(T.turnStaggerMs)
    expect(memo.enterAt).toBe(1000 + T.arriveMs)
  })

  it('두 권뿐인 학문은 두 번만 "틱"(`coverSnap`) 한다', () => {
    expect(fieldsArrive(0, 2).cues.filter((c) => c.name === 'coverSnap')).toHaveLength(2)
  })

  it('학문이 바뀌면 보이던 책이 서랍으로 들어가고(끝에 `drawerThud`(소리 없음)), 다 들어간 뒤 새 책이 나온다', () => {
    const shown = fieldsArrive(0, 5).memo
    const { cues, memo } = fieldsChange(shown, 5000, 3)
    const wait = Math.max(T.settleMs, T.exitMs)
    expect(brief(cues)!.slice(0, 3)).toEqual([
      ['drawerClose', 0],
      ['drawerThud', T.exitMs],
      ['drawerOpen', wait],
    ])
    expect(cues.filter((c) => c.name === 'coverSnap')).toHaveLength(3)
    expect(memo.enterAt).toBe(5000 + wait)
  })

  it('다이얼을 이어서 돌려 아직 등장하지 않은 학문을 건너뛰면 `drawerClose`를 다시 부르지 않고, 남은 `drawerThud`(소리 없음)만 제때 부른다', () => {
    const first = fieldsChange(fieldsArrive(0, 5).memo, 5000, 3).memo
    const { cues, memo } = fieldsChange(first, 5200, 4)
    expect(cues.map((c) => c.name)).not.toContain('drawerClose')
    expect(brief(cues)!.slice(0, 2)).toEqual([
      ['drawerThud', T.exitMs - 200],
      ['drawerOpen', T.settleMs],
    ])
    expect(memo.enterAt).toBe(5200 + T.settleMs)
  })

  it('글자 다이얼이 한 칸 돌면 "틱"(`dialClack`)(3D든 평면 표지든), 서랍의 자리(`drawerOpen`·`drawerClose`·`drawerThud`, 소리 없음)는 책이 움직이는 3D에서만 부른다', () => {
    const webgl = step({ screen: 'fields', field: 0 }, { screen: 'fields', field: 1 }, 9000, fieldsArrive(0, 5).memo).groups
    expect(brief(on(webgl, 'dial'))).toEqual([['dialClack', 0]])
    expect(on(webgl, 'fields')!.map((c) => c.name)).toContain('drawerClose')
    const flat = step({ screen: 'fields', field: 0, books3d: false }, { screen: 'fields', field: 1, books3d: false }).groups
    expect(brief(on(flat, 'dial'))).toEqual([['dialClack', 0]])
    expect(on(flat, 'fields') ?? []).toEqual([])
  })

  it('서가에서 분류 화면으로 내려오면 `drawerOpen`(소리 없음)을 부른다(3D일 때)', () => {
    const { groups, memo } = step({ screen: 'shelf' }, { screen: 'fields' }, 2000)
    expect(on(groups, 'fields')![0]).toEqual({ name: 'drawerOpen', atMs: T.arriveMs })
    expect(memo.enterAt).toBe(2000 + T.arriveMs)
  })

  it('책이 책 페이지로 날아가면 들린 뒤(liftMs) "휙"', () => {
    const { groups } = step({ screen: 'fields' }, { screen: 'shelf', page: true, flight: 'fly' })
    expect(brief(on(groups, 'flight'))).toEqual([['bookWhoosh', FIELDS_FLIGHT.liftMs]])
    // 서가에서 열 때의 자리와 서랍의 자리는 부르지 않는다
    expect(on(groups, 'page') ?? []).toEqual([])
    expect(on(groups, 'fields') ?? []).toEqual([])
  })

  it('날아서 돌아오면 "휙", 제자리에 놓일 때(flyMs + settleMs) 작은 "툭"(`bookTuck`). 줄은 선 채라 서랍의 자리를 부르지 않는다', () => {
    const { groups, memo } = step(
      { screen: 'fields', flight: 'depart' },
      { screen: 'fields', flight: 'return' },
      7000,
    )
    const cues = on(groups, 'flight')!
    expect(brief(cues)).toEqual([
      ['bookWhoosh', 0],
      ['bookTuck', FIELDS_RETURN.flyMs + FIELDS_RETURN.settleMs],
    ])
    expect(cues[1].gain).toBeLessThan(1)
    expect(on(groups, 'fields') ?? []).toEqual([])
    // 줄이 이미 서 있다: 다음에 학문을 바꾸면 `drawerClose`(소리 없음)를 부른다
    expect(fieldsChange(memo, 7001, 3).cues[0].name).toBe('drawerClose')
  })

  it('책이 펼쳐진 채 닫으면 날아가기 전에 덮이는 자리 `bookShut`(소리 없음)이 불린다', () => {
    const { groups } = step(
      { screen: 'shelf', page: true, spread: 5 },
      { screen: 'fields', page: false, spread: 0, flight: 'settle' },
    )
    expect(brief(on(groups, 'read'))).toEqual([['bookShut', BOOK_SHUT_AT_MS]])
  })

  it('날아서 돌아오게 할 수 없어 화면이 옮겨 오면 책들이 다시 나오며 `drawerOpen`(소리 없음)을 부른다', () => {
    const { groups } = step({ screen: 'fields', flight: 'depart' }, { screen: 'fields', flight: null })
    expect(on(groups, 'fields')![0].name).toBe('drawerOpen')
  })

  it('날아가던 전환이 거둬지면 예약한 소리도 거둔다', () => {
    const { groups } = step({ screen: 'shelf', page: true, flight: 'fly' }, { screen: 'fields', page: false, flight: null })
    expect(on(groups, 'flight')).toEqual([])
  })
})
