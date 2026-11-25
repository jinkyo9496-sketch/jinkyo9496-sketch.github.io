import { describe, expect, it } from 'vitest'
import { aladinUrl, books } from '../src/data/books'

describe('알라딘 링크', () => {
  it('상품 번호가 있으면 그 상품 페이지로 간다', () => {
    expect(aladinUrl({ aladinItemId: '405971604', title: '외계인을 만나는 가장 확실한 방법' })).toBe(
      'https://www.aladin.co.kr/shop/wproduct.aspx?ItemId=405971604',
    )
  })

  it('아직 알라딘에 올라오지 않아 상품 번호가 없는 신간은 제목으로 검색한 결과로 간다', () => {
    const url = new URL(aladinUrl({ aladinItemId: '', title: 'AI는 어떻게 생각하는가' }))
    expect(url.origin + url.pathname).toBe('https://www.aladin.co.kr/search/wsearchresult.aspx')
    expect(url.searchParams.get('SearchTarget')).toBe('Book')
    expect(url.searchParams.get('SearchWord')).toBe('서가명강 AI는 어떻게 생각하는가')
  })

  it('48권은 출간 전이라 상품 번호가 비어 있고, 나머지 권은 모두 숫자다', () => {
    for (const b of books) {
      if (b.no === 48) expect(b.aladinItemId).toBe('')
      else expect(b.aladinItemId).toMatch(/^\d+$/)
    }
  })
})
