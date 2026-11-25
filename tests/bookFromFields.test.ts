import { describe, expect, it } from 'vitest'
import { screenFromHash } from '../src/app/bookHash'
import { bookOrigin, isBookView, screenReducer, type ScreenAction, type ScreenState } from '../src/app/screen'

const COUNT = 47
const run = (state: ScreenState, ...actions: ScreenAction[]) => actions.reduce((s, a) => screenReducer(s, a, COUNT), state)

/** 분류 화면: 서가는 3권을 보고 있었고, 다이얼은 환경(8)을 가리킨다 */
const onFields: ScreenState = { screen: 'fields', index: 2, field: 8 }
/** 환경의 둘째 책(31권)을 분류 화면에서 연다 */
const openFromFields: ScreenAction = { type: 'openBook', index: 30, from: 'fields' }

describe('책 페이지를 어디서 열었는가 (screen.ts)', () => {
  it('분류 화면에서 책을 열면 그 책의 책 페이지이고, 분류 화면에서 열었다는 것을 기억한다', () => {
    const opened = run(onFields, openFromFields)
    expect(opened).toEqual({ screen: 'shelf', index: 30, view: 'book', from: 'fields', field: 8 })
    expect(isBookView(opened)).toBe(true)
    expect(bookOrigin(opened)).toBe('fields')
  })

  it('닫으면(버튼·Esc) 서가가 아니라 분류 화면으로 돌아온다. 권을 넘기지 않았으면 보던 학문 그대로다', () => {
    const opened = run(onFields, openFromFields)
    for (const close of [{ type: 'closeBook' }, { type: 'key', key: 'Escape' }] as ScreenAction[]) {
      const closed = run(opened, close)
      expect(closed).toEqual({ screen: 'fields', index: 30, field: 8 })
      expect(bookOrigin(closed)).toBe('shelf')
    }
  })

  it('철학(0)에서 열어도 분류 화면으로 돌아온다', () => {
    const closed = run({ screen: 'fields', index: 0 }, { type: 'openBook', index: 4, from: 'fields' }, { type: 'closeBook' })
    expect(closed).toEqual({ screen: 'fields', index: 4 })
  })

  it('책 페이지 안에서 다른 권으로 넘긴 뒤 닫으면 분류 화면으로 돌아오되, 지금 보던 책의 학문을 가리킨다', () => {
    const turned = run(
      onFields,
      openFromFields,
      { type: 'wheel', direction: 'down' },
      { type: 'key', key: 'ArrowRight' },
      { type: 'goTo', index: 10 },
      { type: 'next' },
    )
    expect(turned).toEqual({ screen: 'shelf', index: 11, view: 'book', from: 'fields', field: 8 })
    // 12권은 역사(9)의 책이다
    expect(run(turned, { type: 'closeBook' })).toEqual({ screen: 'fields', index: 11, field: 9 })
    // 주소가 다른 권으로 바뀌어 넘어간 경우에도
    const byHash = run(onFields, openFromFields, { type: 'openBook', index: 5 })
    expect(bookOrigin(byHash)).toBe('fields')
    // 6권은 경제·경영(7)
    expect(run(byHash, { type: 'key', key: 'Escape' })).toEqual({ screen: 'fields', index: 5, field: 7 })
  })

  it('예: 4권(정치)을 눌러 들어가 10권(법)으로 넘긴 뒤 Esc → 다이얼은 법', () => {
    const politics: ScreenState = { screen: 'fields', index: 0, field: 6 }
    const closed = run(politics, { type: 'openBook', index: 3, from: 'fields' }, { type: 'goTo', index: 9 }, { type: 'key', key: 'Escape' })
    expect(closed).toEqual({ screen: 'fields', index: 9, field: 5 })
  })

  it('철학(0)의 권으로 넘긴 뒤 닫으면 다이얼은 철학이다(field 값을 두지 않는다)', () => {
    const closed = run(onFields, openFromFields, { type: 'next' }, { type: 'closeBook' })
    // 32권은 철학
    expect(closed).toEqual({ screen: 'fields', index: 31 })
  })

  it('서가에서 연 책 페이지를 닫을 때는 가리키던 학문을 바꾸지 않는다', () => {
    const closed = run({ screen: 'shelf', index: 2, field: 8 }, { type: 'openBook' }, { type: 'goTo', index: 9 }, { type: 'closeBook' })
    expect(closed).toEqual({ screen: 'shelf', index: 9, field: 8 })
  })

  it('서가에서 연 책 페이지는 지금처럼 서가로 돌아간다', () => {
    const opened = run({ screen: 'shelf', index: 2, field: 8 }, { type: 'openBook' })
    expect(opened).toEqual({ screen: 'shelf', index: 2, view: 'book', field: 8 })
    expect(bookOrigin(opened)).toBe('shelf')
    expect(run(opened, { type: 'closeBook' })).toEqual({ screen: 'shelf', index: 2, field: 8 })
    expect(run(opened, { type: 'next' }, { type: 'key', key: 'Escape' })).toEqual({ screen: 'shelf', index: 3, field: 8 })
  })

  it('주소로 들어온 책 페이지는 서가로 돌아간다(분류 화면에 있다가 주소가 바뀐 경우도)', () => {
    const direct = screenFromHash('#/book/11', COUNT)!
    expect(bookOrigin(direct)).toBe('shelf')
    expect(run(direct, { type: 'closeBook' })).toEqual({ screen: 'shelf', index: 10 })
    const byAddress = run(onFields, { type: 'openBook', index: 10 })
    expect(bookOrigin(byAddress)).toBe('shelf')
    expect(run(byAddress, { type: 'closeBook' }).screen).toBe('shelf')
  })

  it('"분류 화면에서"는 분류 화면에 있을 때만 받는다', () => {
    const fromShelf = run({ screen: 'shelf', index: 2 }, openFromFields)
    expect(fromShelf).toEqual({ screen: 'shelf', index: 30, view: 'book' })
    const fromIntro = run({ screen: 'intro', index: 2 }, openFromFields)
    expect(bookOrigin(fromIntro)).toBe('shelf')
  })

  it('로고로 인트로에 가면 기억을 지운다', () => {
    const intro = run(onFields, openFromFields, { type: 'openIntro' })
    expect(intro).toEqual({ screen: 'intro', index: 30, field: 8 })
  })

  it('닫은 뒤 서가에서 다시 열면 서가로 돌아간다(기억이 남지 않는다)', () => {
    const again = run(onFields, openFromFields, { type: 'closeBook' }, { type: 'openShelf' }, { type: 'openBook' })
    expect(bookOrigin(again)).toBe('shelf')
    expect(run(again, { type: 'closeBook' }).screen).toBe('shelf')
  })

  it('분류 화면의 ←/→는 화면도 학문도 서가의 책도 바꾸지 않는다(줄을 넘기는 것은 책 자리의 몫)', () => {
    for (const key of ['ArrowLeft', 'ArrowRight']) expect(run(onFields, { type: 'key', key })).toBe(onFields)
  })
})
