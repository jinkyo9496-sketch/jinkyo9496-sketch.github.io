import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { books } from '../src/data/books'
import { Shelf } from '../src/shelf/Shelf'
import App from '../src/App'


describe('Shelf', () => {
  it('renders every book', () => {
    render(<Shelf books={books} initialIndex={46} />)
    expect(screen.getAllByTestId('book')).toHaveLength(books.length)
  })

  it('shows exactly one current book, no.47, with its front cover', () => {
    render(<Shelf books={books} initialIndex={46} />)
    const current = screen
      .getAllByTestId('book')
      .filter((el) => el.getAttribute('data-current') === 'true')
    expect(current).toHaveLength(1)
    expect(current[0]).toHaveAttribute('data-no', '47')
    const front = screen.getByAltText('외계인을 만나는 가장 확실한 방법 앞표지')
    expect(current[0]).toContainElement(front)
    expect(front).not.toHaveAttribute('loading', 'lazy')
  })

  it('gives every book a spine image with alt text, lazy for the far ones', () => {
    render(<Shelf books={books} initialIndex={46} />)
    const spine1 = screen.getByAltText('나는 매주 시체를 보러 간다 책등')
    expect(spine1).toHaveAttribute('loading', 'lazy')
    expect(spine1).toHaveAttribute('width')
    expect(spine1).toHaveAttribute('height')
    expect(screen.getAllByAltText(/ 책등$/)).toHaveLength(books.length)
  })

  it('starts at book 1 unless given an initial index', () => {
    render(<Shelf books={books} />)
    const current = screen
      .getAllByTestId('book')
      .find((el) => el.getAttribute('data-current') === 'true')
    expect(current).toHaveAttribute('data-no', '1')
  })
})

describe('App', () => {
  it('renders the shelf, waiting at book 1 behind the intro', () => {
    render(<App />)
    const all = screen.getAllByTestId('book')
    expect(all).toHaveLength(books.length)
    // 웰컴 화면에서는 전부 책등으로 줄을 서 있다(2026-11-24): 펼쳐진 책은 없고, 현재 책은 1권 그대로다
    expect(all.filter((el) => el.getAttribute('data-current') === 'true')).toEqual([])
    expect(all.filter((el) => el.querySelector('[aria-current="true"]'))).toEqual([all[0]])
  })
})
