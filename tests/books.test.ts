import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { books } from '../src/data/books'

const publicDir = resolve(__dirname, '../public')

describe('books data', () => {
  // 권수는 정해 두지 않는다: 신간이 들어오면 늘어난다(docs/신간-추가.md). 47권까지는 이미 나온 책이다
  it('has at least the 47 published volumes', () => {
    expect(books.length).toBeGreaterThanOrEqual(47)
  })

  it('is sorted by no ascending with nos exactly 1..N, unique', () => {
    const nos = books.map((b) => b.no)
    expect(nos).toEqual(Array.from({ length: books.length }, (_, i) => i + 1))
    expect(new Set(nos).size).toBe(books.length)
  })

  it('every image path points to an existing file in public/covers', () => {
    for (const b of books) {
      const nn = String(b.no).padStart(2, '0')
      expect(b.images.front).toBe(`/covers/${nn}_front.jpg`)
      expect(b.images.back).toBe(`/covers/${nn}_back.jpg`)
      expect(b.images.spine).toBe(`/covers/${nn}_spine.jpg`)
      for (const p of [b.images.front, b.images.back, b.images.spine]) {
        expect(existsSync(resolve(publicDir, '.' + p)), p).toBe(true)
      }
    }
  })

  it('has positive spine and cover aspects, spine narrower than cover', () => {
    for (const b of books) {
      expect(b.spineAspect).toBeGreaterThan(0)
      expect(b.coverAspect).toBeGreaterThan(0)
      expect(b.spineAspect).toBeLessThan(b.coverAspect)
    }
  })

  it('has title, author, pubDate and an Aladin item id (출간 전 신간은 비어 있어도 된다: aladinUrl이 제목 검색으로 간다)', () => {
    for (const b of books) {
      expect(b.title.length).toBeGreaterThan(0)
      expect(b.author.length).toBeGreaterThan(0)
      expect(b.pubDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(b.aladinItemId).toMatch(b.no <= 47 ? /^\d+$/ : /^\d*$/)
    }
    expect(books[46].title).toBe('외계인을 만나는 가장 확실한 방법')
    expect(books[0].title).toBe('나는 매주 시체를 보러 간다')
  })
})

/** JPEG 파일의 가로·세로(px). SOF 마커를 찾아 읽는다 */
function jpegSize(file: string): { width: number; height: number } {
  const buf = readFileSync(file)
  let i = 2
  while (i < buf.length) {
    if (buf[i] !== 0xff) throw new Error(`JPEG 마커가 아니다: ${file}`)
    const marker = buf[i + 1]
    const length = buf.readUInt16BE(i + 2)
    // SOF0~SOF15 가운데 DHT(C4)·JPG(C8)·DAC(CC)를 뺀 것이 크기를 담는다
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) }
    }
    i += 2 + length
  }
  throw new Error(`크기를 찾지 못했다: ${file}`)
}

describe('book proportions match the image files', () => {
  // 표지·책등 이미지를 바꾸면 books.ts의 비율도 함께 고쳐야 한다(안 고치면 그림이 늘어나 보인다)
  it.each(books.map((b) => [b.no, b] as const))('%i권', (_no, b) => {
    const spine = jpegSize(join(publicDir, b.images.spine))
    const front = jpegSize(join(publicDir, b.images.front))
    expect(b.spineAspect).toBeCloseTo(spine.width / spine.height, 2)
    expect(b.coverAspect).toBeCloseTo(front.width / front.height, 2)
  })
})
