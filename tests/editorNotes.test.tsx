import { render, screen, within } from '@testing-library/react'
import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'
import { createBookModel, createBookShared, createTextureCache, type BookSpec } from '../src/book3d'
import { books } from '../src/data/books'
import { editorNotes } from '../src/data/editorNotes'
import { BookPage } from '../src/page/BookPage'
import { openBookReach } from '../src/shelf3d/motion'
import { createBookReader } from '../src/shelf3d/reader'

describe('editorNotes: 권별 편집자의 한 마디', () => {
  // 47권까지는 모두 있다. 신간은 없어도 된다(그 칸이 보이지 않는다. docs/신간-추가.md)
  it('has a note for volumes 1~47 and only for known books, each of a few non-empty lines', () => {
    for (const book of books.filter((b) => b.no <= 47)) expect(editorNotes[book.no], `${book.no}권`).toBeDefined()
    const known = new Set(books.map((b) => b.no))
    for (const [no, note] of Object.entries(editorNotes)) {
      expect(known.has(Number(no)), `${no}권`).toBe(true)
      expect(note.length).toBeGreaterThanOrEqual(2)
      for (const line of note) expect(line.trim().length).toBeGreaterThan(10)
    }
  })

  it('does not carry the working notes of the document (니즈, 마크다운)', () => {
    for (const note of Object.values(editorNotes)) for (const line of note) expect(line).not.toMatch(/공략 니즈|\*\*|^#/)
  })
})

describe('BookPage: 편집자의 한 마디', () => {
  const blurbs = {
    11: { subtitle: '부제', summary: '열한 번째 책의 소개 글.' },
  }
  const notes = { 11: ['첫 줄입니다.', '둘째 줄입니다.'] }
  const setup = (index: number) =>
    render(<BookPage books={books} currentIndex={index} blurbs={blurbs} notes={notes} onGo={vi.fn()} />)

  it('comes after the summary as the last thing in the text, under its own heading', () => {
    setup(10)
    const region = screen.getByRole('region', { name: books[10].title })
    const heading = within(region).getByRole('heading', {
      level: 2,
      name: '편집자의 한 마디',
    })
    const note = region.querySelector('.bookpage__note')!
    expect(note).toContainElement(heading)
    expect(note).toHaveTextContent('첫 줄입니다. 둘째 줄입니다.')
    const summary = region.querySelector('.bookpage__summary')!
    expect(summary.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(region.querySelector('.bookpage__text')!.lastElementChild).toBe(note)
    expect(within(region).queryByRole('link', { name: '알라딘에서 보기' })).toBeNull()
  })

  it('is left out for a book without a note', () => {
    setup(11)
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull()
    expect(document.querySelector('.bookpage__note')).toBeNull()
  })

  it('uses the real notes by default', () => {
    render(<BookPage books={books} currentIndex={0} onGo={vi.fn()} />)
    expect(document.querySelector('.bookpage__note')).toHaveTextContent(editorNotes[1][0])
  })
})

describe('펼친 책의 왼쪽 면도 그림자를 드리운다', () => {
  const spec: BookSpec = {
    no: 17,
    title: '시험용 책',
    coverAspect: 0.68,
    spineAspect: 0.09,
    images: { front: '/f.jpg', back: '/b.jpg', spine: '/s.jpg' },
  }
  it('turns on the opened cover’s shadow, and off again when the book is shut', () => {
    const model = createBookModel(spec, {
      shared: createBookShared(),
      castShadow: true,
    })
    const cover = model.parts.frontCover
    expect(cover.castShadow).toBe(false)
    const reader = createBookReader({
      model,
      shape: { pages: 10, first: 'recto' as const },
      srcOf: (p) => `/p${p}.jpg`,
      endpaper: 0x888888,
      textures: createTextureCache(() => Promise.resolve(new THREE.Texture())),
    })
    reader.setSpread(1, false)
    expect(cover.castShadow).toBe(true)
    reader.setSpread(0, false)
    expect(cover.castShadow).toBe(false)
    reader.setSpread(1, false)
    reader.dispose()
    expect(cover.castShadow).toBe(false)
  })

  it('reaches past the outer edge of the opened cover (shadow box)', () => {
    // 책의 중심에서 펼친 표지의 바깥 끝까지: 표지 폭의 1.5배
    for (const aspect of [0.6, 0.68, 0.75]) expect(openBookReach(aspect)).toBeGreaterThan(1.5 * aspect)
    expect(openBookReach(0.68)).toBeLessThan(1.5 * 0.68 + 0.3)
  })
})
