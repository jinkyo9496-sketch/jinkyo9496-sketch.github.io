import { describe, expect, it } from 'vitest'
import { bookChecklist, missingBookData, numberingGaps } from '../scripts/bookChecklist'
import { books, type Book } from '../src/data/books'

/** 시험용 책 한 권(48권) */
const book48: Book = {
  no: 48,
  title: '시험용 책',
  author: '홍길동',
  pubDate: '2026-12-01',
  aladinItemId: '1',
  images: { front: '/covers/48_front.jpg', back: '/covers/48_back.jpg', spine: '/covers/48_spine.jpg' },
  spineAspect: 0.09,
  coverAspect: 0.68,
}

describe('missingBookData: 신간에 빠진 자료를 알린다', () => {
  it('아무것도 없는 권은 학문·대표색·표지 세 장을 채우라고 알린다', () => {
    const missing = missingBookData([book48], { fields: [], colors: {}, fileExists: () => false })
    expect(missing).toEqual([
      '48권 시험용 책: src/data/fields.ts의 학문 하나에 넣는다(번호 48)',
      '48권 시험용 책: src/data/bookColors.ts에 48의 대표색을 넣는다(scripts/extractBookColors.ts)',
      '48권 시험용 책: public/covers/48_front.jpg 그림을 넣는다',
      '48권 시험용 책: public/covers/48_back.jpg 그림을 넣는다',
      '48권 시험용 책: public/covers/48_spine.jpg 그림을 넣는다',
    ])
  })

  it('다 갖춘 권은 아무것도 알리지 않는다', () => {
    const missing = missingBookData([book48], {
      fields: [{ name: '과학', nos: [48] }],
      colors: { 48: { background: '#dc6114', text: 'ink' } },
      fileExists: () => true,
    })
    expect(missing).toEqual([])
  })

  it('두 학문에 들어간 권, 책 데이터에 없는 번호도 알린다', () => {
    const missing = missingBookData([book48], {
      fields: [
        { name: '과학', nos: [48] },
        { name: '환경', nos: [48, 49] },
      ],
      colors: { 48: { background: '#dc6114', text: 'ink' }, 50: { background: '#000000', text: 'paper' } },
      fileExists: () => true,
    })
    expect(missing).toEqual([
      '48권 시험용 책: src/data/fields.ts에서 한 학문에만 둔다(지금 과학, 환경)',
      'src/data/fields.ts의 환경에 있는 49권이 src/data/books.ts에 없다',
      'src/data/bookColors.ts에 있는 50권이 src/data/books.ts에 없다',
    ])
  })
})

describe('numberingGaps: 번호는 1권부터 빈틈없이', () => {
  it('어긋난 자리를 알린다', () => {
    expect(numberingGaps([{ no: 1 }, { no: 2 }, { no: 3 }])).toEqual([])
    expect(numberingGaps([{ no: 1 }, { no: 48 }])).toEqual(['src/data/books.ts의 2번째 책은 2권이어야 한다(지금 48권)'])
  })
})

describe('지금의 책 데이터', () => {
  it(`${books.length}권 모두 학문·대표색·표지 그림을 갖추었다`, () => {
    expect(bookChecklist()).toEqual([])
  })
})
