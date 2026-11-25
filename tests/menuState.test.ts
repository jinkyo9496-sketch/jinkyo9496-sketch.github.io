import { describe, expect, it } from 'vitest'
import { bookOrigin, isBookView, screenReducer, type ScreenAction, type ScreenState } from '../src/app/screen'
import { books } from '../src/data/books'
import { fields } from '../src/data/fields'

const COUNT = books.length
const run = (state: ScreenState, ...actions: ScreenAction[]) => actions.reduce((s, a) => screenReducer(s, a, COUNT), state)

/** 서가에서 3권을 보고 있고, 분류 화면의 다이얼은 환경(8)을 가리키고 있었다 */
const onShelf: ScreenState = { screen: 'shelf', index: 2, field: 8 }
const onFields: ScreenState = { screen: 'fields', index: 2, field: 8 }

describe('전체 메뉴에서 고른 이동 (screen.ts의 jumpTo)', () => {
  it('분류를 고르면 학제별 분류 화면으로 간다. 가리키던 학문과 가운데 책은 그대로다', () => {
    expect(run(onShelf, { type: 'jumpTo', screen: 'fields' })).toEqual({ screen: 'fields', index: 2, field: 8 })
    expect(run({ screen: 'feature', index: 5 }, { type: 'jumpTo', screen: 'fields' })).toEqual({ screen: 'fields', index: 5 })
  })

  it('학문을 고르면 그 학문을 가리키는 학제별 분류 화면으로 간다', () => {
    expect(run(onShelf, { type: 'jumpTo', screen: 'fields', field: 3 })).toEqual({ screen: 'fields', index: 2, field: 3 })
    // 철학(0)은 값을 두지 않는다
    expect(run(onShelf, { type: 'jumpTo', screen: 'fields', field: 0 })).toEqual({ screen: 'fields', index: 2 })
    // 이미 분류 화면이면 다이얼만 돈다
    expect(run(onFields, { type: 'jumpTo', screen: 'fields', field: 1 })).toEqual({ screen: 'fields', index: 2, field: 1 })
    // 범위를 넘으면 끝에서 멈춘다
    expect(run(onShelf, { type: 'jumpTo', screen: 'fields', field: 99 })).toEqual({
      screen: 'fields',
      index: 2,
      field: fields.length - 1,
    })
  })

  it('서가를 고르면 서가 화면으로 간다. 가운데 책은 그대로다', () => {
    expect(run(onFields, { type: 'jumpTo', screen: 'shelf' })).toEqual(onShelf)
    expect(run({ screen: 'feature', index: 7 }, { type: 'jumpTo', screen: 'shelf' })).toEqual({ screen: 'shelf', index: 7 })
  })

  it('이미 그 자리면 받은 상태를 그대로 돌려준다', () => {
    expect(run(onShelf, { type: 'jumpTo', screen: 'shelf' })).toBe(onShelf)
    expect(run(onFields, { type: 'jumpTo', screen: 'fields' })).toBe(onFields)
    expect(run(onFields, { type: 'jumpTo', screen: 'fields', field: 8 })).toBe(onFields)
  })

  it('책 페이지가 열려 있으면 닫고 그 화면으로 간다(보던 책이 서가의 가운데 책으로 남는다)', () => {
    const page = run(onShelf, { type: 'openBook' }, { type: 'next' })
    expect(isBookView(page)).toBe(true)
    expect(run(page, { type: 'jumpTo', screen: 'shelf' })).toEqual({ screen: 'shelf', index: 3, field: 8 })
    expect(run(page, { type: 'jumpTo', screen: 'fields' })).toEqual({ screen: 'fields', index: 3, field: 8 })
    expect(run(page, { type: 'jumpTo', screen: 'fields', field: 2 })).toEqual({ screen: 'fields', index: 3, field: 2 })
  })

  it('분류 화면에서 연 책 페이지에서도 고른 곳으로 간다: 서가를 고르면 분류 화면이 아니라 서가다', () => {
    const page = run(onFields, { type: 'openBook', index: 30, from: 'fields' })
    expect(bookOrigin(page)).toBe('fields')
    const shelf = run(page, { type: 'jumpTo', screen: 'shelf' })
    expect(shelf).toEqual({ screen: 'shelf', index: 30, field: 8 })
    expect(bookOrigin(shelf)).toBe('shelf')
    // 분류를 고르면 가리키던 학문 그대로, 학문을 고르면 그 학문
    expect(run(page, { type: 'jumpTo', screen: 'fields' })).toEqual({ screen: 'fields', index: 30, field: 8 })
    expect(run(page, { type: 'jumpTo', screen: 'fields', field: 1 })).toEqual({ screen: 'fields', index: 30, field: 1 })
  })

  it('메뉴에서 연 책 페이지는 어느 화면에서 열었든 닫으면 서가로 돌아간다', () => {
    const page = run(onFields, { type: 'openBook', index: 11 })
    expect(page).toEqual({ screen: 'shelf', index: 11, view: 'book', field: 8 })
    expect(run(page, { type: 'closeBook' })).toEqual({ screen: 'shelf', index: 11, field: 8 })
  })

  it('분류 화면에서 연 책 페이지에서 메뉴로 책을 고르면(menu) 연 곳을 잊는다: 닫으면 서가다', () => {
    const page = run(onFields, { type: 'openBook', index: 30, from: 'fields' })
    const picked = run(page, { type: 'openBook', index: 11, menu: true })
    expect(picked).toEqual({ screen: 'shelf', index: 11, view: 'book', field: 8 })
    expect(bookOrigin(picked)).toBe('shelf')
    expect(run(picked, { type: 'closeBook' })).toEqual({ screen: 'shelf', index: 11, field: 8 })
    // 같은 책을 골라도 연 곳을 잊는다
    const same = run(page, { type: 'openBook', index: 30, menu: true })
    expect(same).toEqual({ screen: 'shelf', index: 30, view: 'book', field: 8 })
    // 분류 화면에서 메뉴로 고른 책도 `from`이 붙지 않는다(`from`을 함께 줘도)
    expect(run(onFields, { type: 'openBook', index: 11, menu: true, from: 'fields' })).toEqual({
      screen: 'shelf',
      index: 11,
      view: 'book',
      field: 8,
    })
  })

  it('책 페이지 안의 평소 권 넘기기(다이얼·휠·키·주소)는 연 곳을 그대로 기억한다', () => {
    const page = run(onFields, { type: 'openBook', index: 30, from: 'fields' })
    for (const turn of [
      { type: 'goTo', index: 11 },
      { type: 'wheel', direction: 'down' },
      { type: 'key', key: 'ArrowRight' },
      { type: 'next' },
      { type: 'openBook', index: 11 },
    ] as ScreenAction[]) {
      expect(bookOrigin(run(page, turn))).toBe('fields')
    }
  })

  it('책 페이지가 열려 있을 때 다른 책을 고르면 그 책의 페이지로 넘어간다', () => {
    const page = run(onShelf, { type: 'openBook' })
    expect(run(page, { type: 'openBook', index: 40 })).toEqual({ screen: 'shelf', index: 40, view: 'book', field: 8 })
  })
})
