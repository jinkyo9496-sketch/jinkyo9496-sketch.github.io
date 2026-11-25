import { describe, expect, it } from 'vitest'
import { LINEUP, lineupLeftFor, lineupSlideMs, pagePadFor, rowAfter, rowMotion, type Row } from '../src/intro/lineup'
import { placeTotalMs } from '../src/shelf3d/motion'

const at = (screen: Row['screen'], phase: Row['phase'], extra: Partial<Row> = {}): Row => ({
  screen,
  book: false,
  index: 0,
  phase,
  delayed: false,
  ...extra,
})

describe('웰컴 화면의 줄: 시작 자리', () => {
  it('화면 왼쪽 여백(--page-pad: 20px, 폭 480px 이하 16px)에서 시작한다', () => {
    expect(pagePadFor(1440)).toBe(20)
    expect(pagePadFor(481)).toBe(20)
    expect(pagePadFor(480)).toBe(16)
    // 뷰포트 가운데가 0인 좌표
    expect(lineupLeftFor(1440)).toBe(-700)
    expect(lineupLeftFor(375)).toBe(-171.5)
  })
})

describe('rowAfter: 화면이 바뀔 때 책 줄의 단계', () => {
  it('웰컴에서 시작하면 줄을 선 채(line)다. 서가·분류에서 시작하면 평소 서가(null)', () => {
    expect(rowAfter(null, { screen: 'intro', book: false })).toMatchObject({ phase: 'line', delayed: false })
    expect(rowAfter(null, { screen: 'shelf', book: false }).phase).toBeNull()
    expect(rowAfter(null, { screen: 'shelf', book: true }).phase).toBeNull()
    expect(rowAfter(null, { screen: 'fields', book: false }).phase).toBeNull()
  })

  it('웰컴 → 서가: 줄이 밀린다(slide)', () => {
    expect(rowAfter(at('intro', 'line'), { screen: 'shelf', book: false }).phase).toBe('slide')
    // 꽂히던 중에 다시 내려가도 같다
    expect(rowAfter(at('intro', 'tuck', { delayed: true }), { screen: 'shelf', book: false })).toMatchObject({
      phase: 'slide',
      delayed: false,
    })
  })

  it('신간 소개는 웰컴과 같은 자리다: 거기서도 줄을 서 있고, 웰컴과 오가도 줄은 그대로다', () => {
    expect(rowAfter(null, { screen: 'feature', book: false })).toMatchObject({ phase: 'line', delayed: false })
    expect(rowAfter(at('intro', 'line'), { screen: 'feature', book: false })).toMatchObject({ screen: 'feature', phase: 'line', delayed: false })
    expect(rowAfter(at('feature', 'line'), { screen: 'intro', book: false })).toMatchObject({ screen: 'intro', phase: 'line', delayed: false })
    // 서가에서 올라와 꽂히던 중에 웰컴으로 더 올라가도 꽂히던 단계는 이어진다(화면은 더 움직이지 않으니 늦추지 않는다)
    expect(rowAfter(at('feature', 'tuck', { delayed: true }), { screen: 'intro', book: false })).toMatchObject({ phase: 'tuck', delayed: false })
  })

  it('신간 소개 → 서가: 줄이 밀린다(slide). 서가 → 신간 소개: 먼저 꽂힌다(tuck), 화면은 조금 늦게', () => {
    expect(rowAfter(at('feature', 'line'), { screen: 'shelf', book: false })).toMatchObject({ phase: 'slide', delayed: false })
    expect(rowAfter(at('feature', 'tuck', { delayed: true }), { screen: 'shelf', book: false })).toMatchObject({ phase: 'slide', delayed: false })
    expect(rowAfter(at('shelf', null), { screen: 'feature', book: false })).toMatchObject({ phase: 'tuck', delayed: true })
    expect(rowAfter(at('shelf', 'open'), { screen: 'feature', book: false }).phase).toBe('tuck')
    // 책 페이지·분류에서 바로 오는 길은 없지만, 온다면 웰컴처럼 바로 줄을 선 모습이다
    expect(rowAfter(at('fields', null), { screen: 'feature', book: false })).toMatchObject({ phase: 'line', delayed: false })
    expect(rowAfter(at('feature', 'line'), { screen: 'shelf', book: true }).phase).toBeNull()
  })

  it('서가 → 웰컴: 먼저 꽂힌다(tuck). 화면은 조금 늦게 움직인다(delayed)', () => {
    expect(rowAfter(at('shelf', null), { screen: 'intro', book: false })).toMatchObject({ phase: 'tuck', delayed: true })
    // 내려와 펼쳐지던 중에 올라가도 꽂힌다
    expect(rowAfter(at('shelf', 'open'), { screen: 'intro', book: false }).phase).toBe('tuck')
    expect(rowAfter(at('shelf', 'slide'), { screen: 'intro', book: false }).phase).toBe('tuck')
  })

  it('책 페이지·학제별 분류에서 로고로 웰컴에 오면 바로 줄을 선 모습이다(늦추지 않는다)', () => {
    expect(rowAfter(at('shelf', null, { book: true }), { screen: 'intro', book: false })).toMatchObject({
      phase: 'line',
      delayed: false,
    })
    expect(rowAfter(at('fields', null), { screen: 'intro', book: false })).toMatchObject({ phase: 'line', delayed: false })
  })

  it('서가에서 책 페이지를 열거나 분류로 가면 단계를 거둔다. 서가 안에서 책만 넘기면 그대로다', () => {
    expect(rowAfter(at('shelf', 'slide'), { screen: 'shelf', book: true }).phase).toBeNull()
    expect(rowAfter(at('shelf', 'open'), { screen: 'fields', book: false }).phase).toBeNull()
    expect(rowAfter(at('intro', 'line'), { screen: 'shelf', book: true }).phase).toBeNull()
    const sliding = at('shelf', 'slide')
    expect(rowAfter(sliding, { screen: 'shelf', book: false })).toBe(sliding)
  })
})

describe('rowAfter: 서가에 내려온 뒤의 책 넘기기(평소 동작에 단계의 값이 새지 않는다)', () => {
  const shelf = { screen: 'shelf', book: false } as const

  it('펼쳐지는 중(open)에 가운데 책이 바뀌면 단계를 거둔다: 평소의 한 걸음(680ms)으로 넘어간다', () => {
    expect(rowAfter(at('shelf', 'open'), { ...shelf, index: 1 })).toMatchObject({ phase: null, index: 1 })
  })

  it('책장이 지나가는 중(gliding)이면 밀리는 중이든 펼쳐지는 중이든 단계를 거둔다: 지나가는 박자를 덮지 않는다', () => {
    expect(rowAfter(at('shelf', 'open'), { ...shelf, index: 0, gliding: true }).phase).toBeNull()
    expect(rowAfter(at('shelf', 'slide'), { ...shelf, index: 1, gliding: true }).phase).toBeNull()
    expect(rowAfter(at('shelf', 'slide'), { ...shelf, index: 0, gliding: true }).phase).toBeNull()
  })

  it('밀리는 중(slide)에 한 번 넘기면 단계는 그대로다(새 책이 가운데로 와 펼쳐진다)', () => {
    expect(rowAfter(at('shelf', 'slide'), { ...shelf, index: 1 })).toMatchObject({ phase: 'slide', index: 1 })
  })

  it('평소(null)에는 책을 넘겨도 지나가도 단계가 생기지 않는다', () => {
    expect(rowAfter(at('shelf', null), { ...shelf, index: 5 }).phase).toBeNull()
    expect(rowAfter(at('shelf', null), { ...shelf, index: 5, gliding: true }).phase).toBeNull()
  })

  it('웰컴에서 내려올 때 보던 책을 기억한다', () => {
    expect(rowAfter(at('intro', 'line', { index: 11 }), { ...shelf, index: 11 })).toMatchObject({ phase: 'slide', index: 11 })
  })
})

describe('rowMotion: 단계마다 서가에 넘기는 것', () => {
  it('line: 전부 책등으로 줄을 선다', () => {
    expect(rowMotion('line', 0, 47)).toMatchObject({ lineup: true, closed: true })
  })

  it('slide: 책등인 채 가운데 자리로 밀린다(700ms). 먼 책은 더 천천히(최대 1000ms)', () => {
    expect(rowMotion('slide', 0, 47)).toEqual({ lineup: false, closed: true, moveMs: 700 })
    expect(lineupSlideMs(0, 47)).toBe(700)
    expect(lineupSlideMs(LINEUP.nearIndex, 47)).toBe(700)
    expect(lineupSlideMs(46, 47)).toBe(1000)
    const mid = lineupSlideMs(31, 47)
    expect(mid).toBeGreaterThan(700)
    expect(mid).toBeLessThan(1000)
  })

  it('open: 가운데 책이 펼쳐져 놓인다(멈춘 뒤 펼침 900ms보다 조금 빠르게)', () => {
    expect(rowMotion('open', 0, 47)).toEqual({ lineup: false, closed: false, moveMs: LINEUP.openMs })
    expect(LINEUP.openMs).toBeLessThanOrEqual(900)
  })

  it('tuck: 가운데 책이 책등으로 꽂힌다. 그 뒤 line에서 줄이 1권 자리로 밀려 간다', () => {
    expect(rowMotion('tuck', 11, 47)).toEqual({ lineup: false, closed: true, moveMs: LINEUP.tuckMs })
    expect(rowMotion('line', 11, 47)).toEqual({ lineup: true, closed: true, moveMs: LINEUP.backMs })
  })

  it('평소(null)에는 아무것도 덮지 않는다', () => {
    expect(rowMotion(null, 5, 47)).toEqual({ lineup: false, closed: false, moveMs: null })
  })
})

describe('박자', () => {
  it('내려갈 때: 가까운 책은 1.3~1.6초 안에 다 놓인다', () => {
    const total = LINEUP.slideMs * LINEUP.openAt + placeTotalMs(LINEUP.openMs)
    expect(total).toBeGreaterThanOrEqual(1300)
    expect(total).toBeLessThanOrEqual(1600)
    // 놓이는 움직임이 끝난 뒤에 평소 속도로 돌아간다
    expect(LINEUP.openHoldMs).toBeGreaterThanOrEqual(placeTotalMs(LINEUP.openMs))
  })

  it('올라갈 때: 화면이 웰컴에 닿을 때(늦춘 시간 + 700ms) 줄은 이미 가지런하다', () => {
    const arrive = LINEUP.screenDelayMs + 700
    // 꽂히는 움직임과, 그 뒤에 시작하는 줄 밀림이 모두 그 안에 끝난다
    expect(LINEUP.tuckMs).toBeLessThanOrEqual(arrive)
    expect(LINEUP.lineAt + LINEUP.backMs).toBeLessThanOrEqual(arrive)
    // 화면 전환 뒤의 휠 잠금(860ms)을 넘기지 않는다
    expect(arrive).toBeLessThanOrEqual(860)
  })
})
