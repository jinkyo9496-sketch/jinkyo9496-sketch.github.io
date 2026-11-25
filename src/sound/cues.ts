import { isWelcome, type Screen } from '../app/screen'
import { FEATURE_TIMING, type FeatureStep } from '../feature/timeline'
import type { FlightPhase } from '../fields3d/FieldBooks3D'
import { FIELDS_FLIGHT, FIELDS_LAYOUT, FIELDS_RETURN, FIELDS_TIMING, fieldsTimeline } from '../fields3d/motion'
import { INTRO_DOTS } from '../intro/entrance'
import { LINEUP, lineupSlideMs } from '../intro/lineup'
import { PAGE_CLOSE, PAGE_OPEN, placeTotalMs } from '../shelf3d/motion'
import type { SoundName } from './catalog'

/**
 * 어느 소리를 언제 낼지 정하는 순수 계산(2026-11-25 효과음. three·DOM 없음, 단위 테스트 `tests/soundCues.test.ts`).
 * 시각은 새로 지어 적지 않는다: 모두 움직임의 상수·시간표에서 끌어온다(`shelf3d/motion.ts`의 `placeTotalMs`·`PAGE_OPEN`·
 * `PAGE_CLOSE`, `fields3d/motion.ts`의 `FIELDS_TIMING`·`fieldsTimeline`·`FIELDS_FLIGHT`·`FIELDS_RETURN`, `intro/lineup.ts`의
 * `LINEUP`, `intro/entrance.ts`의 `INTRO_DOTS`, `feature/timeline.ts`의 `FEATURE_TIMING`). 움직임의 박자를 고치면 소리도 따라간다.
 * 실제로 내고 예약하는 것은 `play.ts`, 화면의 상태를 여기에 넘기는 것은 `useSoundCues.ts`다.
 */

/** 낼 소리 하나: 이름과, 사건이 일어난 때부터 잰 시각(ms) */
export interface Cue {
  name: SoundName
  atMs: number
  /** 세기에 곱하는 값(없으면 1) */
  gain?: number
}

/**
 * 예약의 채널: 같은 채널에 새로 예약하면 앞의 것의 아직 나지 않은 소리는 거둔다(같은 움직임이 다시 시작됐다).
 * intro = 웰컴의 점, welcome = 웰컴 ↔ 서가의 줄, feature = 신간 소개의 말풍선, shelf = 서가의 책 넘기기,
 * page = 책 페이지 열기·닫기·권 넘기기, read = 펼친 책, dial = 분류 화면의 글자 다이얼, fields = 분류 화면의 책(서랍),
 * flight = 분류 화면 ↔ 책 페이지로 나는 책
 */
export type Channel = 'intro' | 'welcome' | 'feature' | 'shelf' | 'page' | 'read' | 'dial' | 'fields' | 'flight'

/** 한 채널에 예약할 소리들. `cues`가 비어 있으면 그 채널의 예약을 거두기만 한다 */
export interface CueGroup {
  channel: Channel
  cues: Cue[]
}

const cue = (name: SoundName, atMs = 0, gain?: number): Cue => (gain === undefined ? { name, atMs } : { name, atMs, gain })

/** 가운데로 온 책이 놓이는 움직임이 끝나는 때(ms): `placeTotalMs`(이동 시간에 비례한다)를 ms로 반올림한다 */
const landMs = (moveMs: number) => Math.round(placeTotalMs(moveMs))

/** 책이 날아서 돌아와 놓일 때의 "툭"(`bookTuck`)은 서가에 꽂힐 때보다 작다 */
const SOFT = 0.7

// ── 웰컴 ─────────────────────────────────────────────────

/** 서·가·명·강의 점 넷: 점마다 내려와 찍히는 때(`intro.css`의 등장 박자)에 "틱"(`penDot`) */
export const introDotCues = (): Cue[] =>
  Array.from({ length: INTRO_DOTS.count }, (_, i) => cue('penDot', INTRO_DOTS.atMs + i * INTRO_DOTS.gapMs + INTRO_DOTS.fallMs))

/**
 * 웰컴 자리 ↔ 서가의 책 줄(`intro/lineup.ts`).
 * - 내려갈 때(`down`): 줄이 밀리기 시작할 때 `rowSweep`의 "톡", 가운데 책이 펼쳐지기 시작해(밀리는 시간의 `openAt`) 놓이는 움직임이 끝날 때 "툭"
 * - 올라갈 때(`up`): 줄이 1권 자리로 밀리기 시작할 때(`lineAt`) `rowSweep`의 "톡", 가운데 책이 다 꽂힐 때(`tuckMs`) "툭"(`bookTuck`)
 */
export function lineupCues(direction: 'down' | 'up', index: number, count: number): Cue[] {
  if (direction === 'up') return [cue('rowSweep', LINEUP.lineAt), cue('bookTuck', LINEUP.tuckMs)]
  const openAt = Math.round(lineupSlideMs(index, count) * LINEUP.openAt)
  return [cue('rowSweep'), cue('bookLand', openAt + landMs(LINEUP.openMs))]
}

/** 신간 소개의 말풍선: 위에서부터 하나씩 나타나는 간격마다 `noteFlutter`를 부른다(소리 없음) */
export const bubbleCues = (count: number): Cue[] =>
  Array.from({ length: count }, (_, i) => cue('noteFlutter', i * FEATURE_TIMING.bubbleGapMs))

// ── 서가 ─────────────────────────────────────────────────

/**
 * 가운데 책이 한 권 바뀌었다.
 * - 평소: 바로 "톡"(`spineRub`)이 나고, 새 가운데 책이 놓이는 움직임이 끝나는 때(`placeTotalMs(moveMs)`. 한 걸음 680ms면 1000ms)에 "툭"
 * - 책장이 지나가는 중(`gliding`: ←/→를 누르고 있다): 책마다 아주 짧은 틱만. 너무 촘촘한 것은 `play`가 솎는다(`minGapMs`)
 * - 권수 다이얼로 골랐을 때(`byDial`): "톡"(`spineRub`) 대신 다이얼의 틱(한 번에 하나만 낸다). 놓이는 "툭"은 그대로다
 */
export function shelfStepCues({ gliding, moveMs, byDial = false }: { gliding: boolean; moveMs: number; byDial?: boolean }): Cue[] {
  if (gliding) return [cue('glideTick')]
  return [cue(byDial ? 'dialTick' : 'spineRub'), cue('bookLand', landMs(moveMs))]
}

/** 지나가다 멈췄다: 멈춘 자리의 책이 펼쳐져 놓이는 때에 "툭" */
export const glideEndCues = (moveMs: number): Cue[] => [cue('bookLand', landMs(moveMs))]

// ── 책 페이지 ─────────────────────────────────────────────

/** 서가에서 책 페이지를 열었다: 바로 집어 드는 "톡"(`bookPull`), 나머지 책이 쓸려 나가기 시작할 때(`PAGE_OPEN.sweepAt`) `rowSweep`의 "톡" */
export const pageOpenCues = (): Cue[] => [cue('bookPull'), cue('rowSweep', PAGE_OPEN.sweepAt)]

/**
 * 책 페이지를 닫고 서가로: 열기의 거꾸로. 책이 서가로 돌아오기 시작할 때(`retAt`), 나머지 책이 돌아오기 시작할 때(`sweepAt`)
 * `rowSweep`의 "톡", 앞에 나와 있던 책이 제자리에 놓일 때(`total`) "툭"(`bookTuck`)
 */
export const pageCloseCues = (): Cue[] => [
  cue('bookReturn', PAGE_CLOSE.retAt),
  cue('rowSweep', PAGE_CLOSE.sweepAt),
  cue('bookTuck', PAGE_CLOSE.total),
]

/** 책 페이지 안에서 다른 권으로: "톡"(`volumeSlide`). 책 아래의 권수 다이얼로 골랐으면(`byDial`) 그 대신 다이얼의 틱 */
export const volumeTurnCues = (byDial = false): Cue[] => [cue(byDial ? 'dialTick' : 'volumeSlide')]

/**
 * 펼친 책이 다 덮이는 때(ms): `shelf3d/reader.ts`의 `READER.close`와 같은 값(그 파일은 three를 쓰므로 여기서 읽지 않고
 * 같은 값을 적어 둔다. 두 값이 같은지는 `tests/soundCues.test.ts`가 본다). 덮는 자리 `bookShut`(소리 없음)은 표지가 닿는 이때 불린다
 */
export const BOOK_SHUT_AT_MS = 700

/**
 * 펼친 책의 펼침면(`reader/spread.ts`: 0 = 덮임, 1부터 펼침)이 바뀌었다.
 * 덮여 있다 펼침 = 펼치는 소리(`coverOpen`), 한 면 = 같은 펼치는 소리(`pageTurn`), 여러 면을 건너뜀(옆면 띠·펼친 뒤의 건너뛰기) = "후루룩",
 * 덮음 = 표지가 다 덮이는 때에 `bookShut`(소리 없음)
 */
export function spreadCues(from: number, to: number): Cue[] {
  if (from === to) return []
  if (to <= 0) return [cue('bookShut', BOOK_SHUT_AT_MS)]
  if (from <= 0) return [cue('coverOpen')]
  return [cue(Math.abs(to - from) === 1 ? 'pageTurn' : 'pageRiffle')]
}

// ── 학제별 분류 ───────────────────────────────────────────

/**
 * 분류 화면의 책(3D)이 지금 어디쯤인지 소리 쪽이 따로 적어 두는 것(장면 `fields3d/scene.ts`의 `requestItem`·`tickDirection`과
 * 같은 규칙을 시각으로만 따라간다). 시각은 `soundTransition`에 넘긴 `now`와 같은 시계(ms)
 */
export interface FieldsMemo {
  /** 지금 가리키는 학문의 책이 서랍에서 나오기 시작하는(시작한) 때. 아직 아무것도 없으면 null */
  enterAt: number | null
  /** 보이던 책이 서랍으로 다 들어가는 때(이미 지났으면 들어가는 책이 없다) */
  leavingUntil: number
}

/** 아직 책이 나온 적이 없다 */
export const FIELDS_MEMO_IDLE: FieldsMemo = { enterAt: null, leavingUntil: 0 }

/** 문처럼 돌 때의 "틱"(`coverSnap`)을 내는 책의 수: 한 화면에 보이는 책까지만(나머지는 화면 밖에서 돈다) */
const snapCount = (count: number) => Math.min(count, Math.ceil(FIELDS_LAYOUT.visibleBooks))

/** 등장: `wait` 뒤에 `drawerOpen`을 부르고(소리 없음), 시간표(`fieldsTimeline`)의 권당 시차로 책마다 돌 때 "틱"(`coverSnap`) */
function enterCues(wait: number, count: number): Cue[] {
  if (count <= 0) return []
  const { turnAt } = fieldsTimeline(count)
  return [cue('drawerOpen', wait), ...Array.from({ length: snapCount(count) }, (_, i) => cue('coverSnap', wait + turnAt(i)))]
}

/** 분류 화면에 들어섰다(서가에서 내려옴): 화면 전환의 뒷부분에 맞춰 기다렸다가(`arriveMs`) 그 학문의 책이 나온다 */
export function fieldsArrive(now: number, count: number): { memo: FieldsMemo; cues: Cue[] } {
  const wait = FIELDS_TIMING.arriveMs
  return { memo: { enterAt: now + wait, leavingUntil: now }, cues: enterCues(wait, count) }
}

/** 날아서 돌아온 책의 줄: 책들이 이미 제자리에 서 있다(서랍에서 나오지 않는다) */
export const fieldsStanding = (now: number): FieldsMemo => ({ enterAt: now, leavingUntil: now })

/**
 * 가리키는 학문이 바뀌었다. 보이던 책이 있으면 서랍으로 들어가기 시작하고(끝 `exitMs`에 `drawerThud`(소리 없음)), 새 책은 기다림(`settleMs`)이
 * 끝나고 앞의 책이 다 들어간 뒤에 나온다. 다이얼을 이어 돌려 아직 나오지 않은 학문을 건너뛰면 `drawerClose`(소리 없음)는 다시 부르지 않고,
 * 들어가던 책의 남은 `drawerThud`(소리 없음)만 제때 부른다(예약을 새로 걸면서 앞의 것이 거둬지므로 다시 넣는다)
 */
export function fieldsChange(memo: FieldsMemo, now: number, count: number): { memo: FieldsMemo; cues: Cue[] } {
  const shown = memo.enterAt !== null && now >= memo.enterAt
  const leavingUntil = shown ? now + FIELDS_TIMING.exitMs : memo.leavingUntil
  const left = Math.max(0, leavingUntil - now)
  const wait = Math.max(FIELDS_TIMING.settleMs, left)
  const cues = [...(shown ? [cue('drawerClose')] : []), ...(left > 0 ? [cue('drawerThud', left)] : []), ...enterCues(wait, count)]
  return { memo: { enterAt: now + wait, leavingUntil }, cues }
}

/** 분류 화면의 책이 책 페이지로 날아간다: 들린 뒤(`liftMs`) 날기 시작할 때 "휙" */
export const flightOutCues = (): Cue[] => [cue('bookWhoosh', FIELDS_FLIGHT.liftMs)]

/** 책이 날아서 줄의 제자리로 돌아온다: 날기 시작할 때 "휙", 내려앉아 놓일 때(`flyMs + settleMs`) 작은 "툭"(`bookTuck`) */
export const flightBackCues = (): Cue[] => [cue('bookWhoosh'), cue('bookTuck', FIELDS_RETURN.flyMs + FIELDS_RETURN.settleMs, SOFT)]

// ── 화면의 상태가 바뀌었을 때 ─────────────────────────────

/** 소리를 정하는 데 쓰는 화면의 상태(App이 그릴 때마다 넘긴다) */
export interface SoundSnapshot {
  screen: Screen
  /** 가운데 책(0부터)과 전체 권수 */
  index: number
  count: number
  /** 책 페이지가 열려 있는가(WebGL 서가의 책 페이지. 상세 창은 아니다) */
  page: boolean
  /** ←/→를 누르고 있어 책장이 지나가는 중인가 */
  gliding: boolean
  /** 지금 책이 한 번 움직이는 시간(ms): 놓이는 움직임의 길이가 여기에 비례한다 */
  moveMs: number
  /** 떠 있는 책의 펼침면(0 = 덮임) */
  spread: number
  /** 분류 화면 ↔ 책 페이지로 나는 책의 단계 */
  flight: FlightPhase
  /** 가리키는 학문과 그 학문의 권수 */
  field: number
  fieldCount: number
  /** 분류 화면의 책이 3D인가(평면 표지는 움직이지 않으니 서랍의 자리를 부르지 않는다) */
  books3d: boolean
  /** 신간 소개의 단계와, 전환 없이 마지막 모습으로 놓였는가 */
  featureStep: FeatureStep
  featureInstant: boolean
  /** 말풍선의 수 */
  bubbles: number
  /** 권수 다이얼(서가 하단 바·책 페이지)로 책을 고른 횟수: 이것이 늘면서 책이 바뀌었으면 다이얼로 고른 것이다 */
  dialPicks: number
}

const isReturning = (phase: FlightPhase) => phase === 'settle' || phase === 'depart' || phase === 'return'

/**
 * 상태가 `prev`에서 `next`로 바뀌었을 때 낼 소리(채널별)와, 분류 화면의 책에 대해 적어 둔 것(`memo`)의 새 값.
 * 배경음·포인터를 올릴 때의 버튼 소리·화면 전환 자체의 소리는 없다. 같은 사건이면 서가를 무엇으로 그리든(WebGL·CSS) 같은 소리다.
 * `now`는 `memo`와 같은 시계의 지금(ms)
 */
export function soundTransition(
  prev: SoundSnapshot,
  next: SoundSnapshot,
  memo: FieldsMemo,
  now: number,
): { groups: CueGroup[]; memo: FieldsMemo } {
  const groups: CueGroup[] = []
  const put = (channel: Channel, cues: Cue[] = []) => {
    const at = groups.findIndex((g) => g.channel === channel)
    if (at >= 0) groups[at] = { channel, cues }
    else groups.push({ channel, cues })
  }
  const screenChanged = prev.screen !== next.screen
  const pageChanged = prev.page !== next.page
  const flightStarted = (phase: FlightPhase) => next.flight === phase && prev.flight !== phase
  const byDial = next.dialPicks !== prev.dialPicks

  // ── 웰컴·신간 소개 ──
  if (screenChanged && prev.screen === 'intro') put('intro')
  if (screenChanged && prev.screen === 'feature') put('feature')
  if (next.screen === 'feature' && next.featureStep === 'bubbles' && prev.featureStep !== 'bubbles' && !next.featureInstant) {
    put('feature', bubbleCues(next.bubbles))
  }
  if (screenChanged) {
    // 웰컴 자리 ↔ 서가: 줄이 밀리고 책이 놓인다 / 꽂히고 줄이 돌아간다(`intro/lineup.ts`의 `rowAfter`와 같은 조건)
    const down = isWelcome(prev.screen) && next.screen === 'shelf' && !next.page
    const up = prev.screen === 'shelf' && !prev.page && isWelcome(next.screen)
    put('welcome', down ? lineupCues('down', next.index, next.count) : up ? lineupCues('up', next.index, next.count) : [])
    // 서가를 떠났거나 다른 데서 왔다: 놓이던 책의 남은 소리는 맞지 않는다
    put('shelf')
  }

  // ── 책 페이지 ──
  if (pageChanged) {
    put('shelf')
    // 분류 화면에서 연 책 페이지를 책이 펼쳐진 채 닫았다: 책이 덮인 뒤에 날아서 돌아간다(단계 `settle`). 그때 덮는 자리 `bookShut`(소리 없음)을 부른다
    put('read', !next.page && prev.spread > 0 && next.flight === 'settle' ? spreadCues(prev.spread, 0) : [])
    // 서가에서 열고 서가로 닫을 때만 책이 들리고 나머지가 쓸린다. 분류 화면의 책은 날아간다(아래), 주소로 바로 열리면 전환이 없다
    const fromShelf = next.page && !screenChanged && next.flight === null
    const toShelf = !next.page && !screenChanged && next.screen === 'shelf'
    put('page', fromShelf ? pageOpenCues() : toShelf ? pageCloseCues() : [])
  } else if (next.page && prev.index !== next.index) {
    put('page', volumeTurnCues(byDial))
    // 덮던 책의 남은 `bookShut`(소리 없음) 예약은 다른 권에 맞지 않는다
    put('read')
  } else if (next.page && prev.spread !== next.spread) {
    put('read', spreadCues(prev.spread, next.spread))
  }

  // ── 서가의 책 넘기기 ──
  if (!screenChanged && !pageChanged && next.screen === 'shelf' && !next.page) {
    if (prev.index !== next.index) put('shelf', shelfStepCues({ gliding: next.gliding, moveMs: next.moveMs, byDial }))
    else if (prev.gliding && !next.gliding) put('shelf', glideEndCues(next.moveMs))
    // 웰컴에서 내려온 직후에 책을 넘기거나 지나가기 시작했다: 내려올 때 예약한 "툭"은 그 책의 것이 아니다(두 번 나지 않게 거둔다)
    if (prev.index !== next.index || (!prev.gliding && next.gliding)) put('welcome')
  }

  // ── 분류 화면 ↔ 책 페이지로 나는 책 ──
  if (flightStarted('fly')) put('flight', flightOutCues())
  else if (flightStarted('return')) {
    put('flight', flightBackCues())
    memo = fieldsStanding(now)
  } else if (prev.flight !== null && next.flight === null && (prev.flight !== 'return' || next.screen !== 'fields')) {
    // 전환이 도중에 거둬졌다(다 날아와 놓인 것은 아니다: 그때의 "툭"(`bookTuck`)은 그대로 둔다)
    put('flight')
  }

  // ── 분류 화면 ──
  if (next.screen === 'fields') {
    if (!screenChanged && prev.field !== next.field) put('dial', [cue('dialClack')])
    if (next.books3d) {
      // 책이 서랍에서 나오는 경우: 화면에 들어섰다(날아서 돌아오는 책이 없다) / 돌아오게 할 수 없어 화면이 옮겨 왔다
      const arrived = screenChanged && !isReturning(next.flight)
      const fellBack = !screenChanged && isReturning(prev.flight) && prev.flight !== 'return' && next.flight === null
      if (arrived || fellBack) {
        const entered = fieldsArrive(now, next.fieldCount)
        memo = entered.memo
        put('fields', entered.cues)
      } else if (!screenChanged && prev.field !== next.field && !isReturning(next.flight)) {
        const changed = fieldsChange(memo, now, next.fieldCount)
        memo = changed.memo
        put('fields', changed.cues)
      }
    }
  } else if (screenChanged && prev.screen === 'fields') {
    put('fields')
    memo = FIELDS_MEMO_IDLE
  }

  return { groups, memo }
}
