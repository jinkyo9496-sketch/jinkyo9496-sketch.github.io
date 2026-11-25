import { describe, expect, it } from 'vitest'
import { books } from '../src/data/books'
import { fieldBooks, fieldIndexOfBook, fieldLabel, fields, type Field } from '../src/data/fields'

describe('학제 데이터', () => {
  it('학문은 열하나이고, 정해진 순서다(처음은 철학)', () => {
    expect(fields.map((f) => f.name)).toEqual([
      '철학',
      '심리',
      '예술',
      '문학',
      '생명과학',
      '법',
      '정치',
      '경제·경영',
      '환경',
      '역사',
      '과학',
    ])
  })

  // 47권까지의 배정(2026-11-23 확정, 2026-11-24 편집자 요청으로 33·35권을 환경에서 생명과학으로). 신간은 그 학문의 줄 끝에 붙인다(docs/신간-추가.md): 앞부분은 그대로여야 한다
  it('학문마다 권 번호가 적힌 순서대로 들어 있다(신간은 줄 끝에 붙는다)', () => {
    const upTo47 = (f: Field) => f.nos.filter((no) => no <= 47)
    for (const f of fields) expect(f.nos.slice(0, upTo47(f).length), f.name).toEqual(upTo47(f))
    expect(Object.fromEntries(fields.map((f) => [f.name, upTo47(f)]))).toEqual({
      철학: [5, 18, 24, 32],
      심리: [28, 30],
      예술: [13, 17, 19],
      문학: [7, 15, 27],
      생명과학: [1, 21, 25, 33, 35, 38],
      법: [10, 22, 36, 44],
      정치: [4, 8, 41, 46],
      '경제·경영': [6, 23, 26, 29, 43, 45],
      환경: [11, 31, 34, 37, 39],
      역사: [12, 14, 16, 20],
      과학: [2, 3, 9, 40, 42, 47],
    })
  })

  it('모든 권(1권~마지막 권)이 정확히 한 번씩 들어 있다', () => {
    const all = fields.flatMap((f) => f.nos)
    expect(all).toHaveLength(books.length)
    expect([...all].sort((a, b) => a - b)).toEqual(books.map((b) => b.no))
  })

  it('모든 번호가 책 데이터에 있다', () => {
    const known = new Set(books.map((b) => b.no))
    for (const field of fields) for (const no of field.nos) expect(known.has(no)).toBe(true)
  })

  it('fieldBooks는 그 학문의 책을 적힌 순서대로 돌려준다', () => {
    for (const field of fields) expect(fieldBooks(field).map((b) => b.no)).toEqual(field.nos)
    expect(fieldBooks(fields[0])[0]).toBe(books[4])
  })

  it('fieldIndexOfBook은 권 번호가 속한 학문의 순번을 돌려준다(없는 번호는 null)', () => {
    expect(fieldIndexOfBook(4)).toBe(6) // 정치
    expect(fieldIndexOfBook(10)).toBe(5) // 법
    expect(fieldIndexOfBook(5)).toBe(0) // 철학
    expect(fieldIndexOfBook(47)).toBe(10) // 과학
    expect(fieldIndexOfBook(48)).toBe(0) // 철학(2026-11-24 편집자)
    expect(fieldIndexOfBook(33)).toBe(4) // 생명과학(2026-11-24 편집자: 환경에서 옮김)
    expect(fieldIndexOfBook(35)).toBe(4) // 생명과학
    for (const [i, field] of fields.entries()) for (const no of field.nos) expect(fieldIndexOfBook(no)).toBe(i)
    expect(fieldIndexOfBook(0)).toBeNull()
    expect(fieldIndexOfBook(books.length + 1)).toBeNull()
  })

  it('가장 긴 이름은 "경제·경영"이다(다이얼의 폭은 이 이름에 맞춘다)', () => {
    const longest = [...fields].sort((a, b) => b.name.length - a.name.length)[0]
    expect(longest.name).toBe('경제·경영')
  })

  it('fieldLabel은 읽기 도구용 이름이다: 학문 이름과 권수', () => {
    expect(fieldLabel({ name: '철학', nos: [5, 18, 24, 32] })).toBe('철학, 4권')
    expect(fieldLabel({ name: '환경', nos: [11, 31, 33, 34, 35, 37, 39] })).toBe('환경, 7권')
  })
})
