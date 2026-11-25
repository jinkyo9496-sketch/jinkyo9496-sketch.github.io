import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BOOK_COUNT_MARK, fillBookCount } from '../scripts/bookCountHtml'
import { books } from '../src/data/books'

describe('fillBookCount: index.html의 권수는 책 데이터에서 채운다', () => {
  it('표시를 권수로 바꾼다(몇 군데든)', () => {
    expect(fillBookCount(`1~${BOOK_COUNT_MARK}권 · 1~${BOOK_COUNT_MARK}권`, 48)).toBe('1~48권 · 1~48권')
  })

  it('index.html에는 숫자 대신 표시가 있고, 채우면 지금의 권수가 된다', () => {
    const html = readFileSync(resolve(__dirname, '../index.html'), 'utf8')
    expect(html).not.toMatch(/1~\d+권/)
    const filled = fillBookCount(html, books.length)
    expect(filled).toContain(`<title>서가명강 서가 — 서울대 가지 않아도 들을 수 있는 명강의 1~${books.length}권</title>`)
    expect(filled).toContain(`시리즈 1~${books.length}권을`)
    expect(filled).not.toContain(BOOK_COUNT_MARK)
  })
})
