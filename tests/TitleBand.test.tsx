import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { books } from '../src/data/books'
import { computeBandOffset } from '../src/band/bandOffset'
import { TitleBand } from '../src/band/TitleBand'
import App from '../src/App'

// 첫 화면은 인트로이고 서가는 1권에서 시작한다(tests/Screens.test.tsx). 여기서는 서가의 47권에서 시작해 본다.
const AT_47 = { screen: 'shelf', index: 46 } as const


describe('computeBandOffset', () => {
  const items = [
    { left: 0, width: 100 },
    { left: 180, width: 300 },
    { left: 560, width: 40 },
  ]

  it('centres the first, middle and last title: -(left + width / 2)', () => {
    expect(computeBandOffset(items, 0)).toBe(-50)
    expect(computeBandOffset(items, 1)).toBe(-330)
    expect(computeBandOffset(items, 2)).toBe(-580)
  })

  it('returns 0 for empty or unmeasured input', () => {
    expect(computeBandOffset([], 0)).toBe(0)
    expect(computeBandOffset(items, 5)).toBe(0)
    expect(computeBandOffset(items, -1)).toBe(0)
    expect(computeBandOffset([{ left: 0, width: 0 }], 0)).toBe(0)
    expect(computeBandOffset([{ left: NaN, width: 10 }], 0)).toBe(0)
  })
})

const titles = () => screen.getAllByTestId('band-title')
const currentTitles = () => titles().filter((t) => t.getAttribute('data-current') === 'true')

describe('TitleBand', () => {
  it('renders every title in series order, each with its No.N superscript', () => {
    render(<TitleBand books={books} currentIndex={46} onNavigate={() => {}} />)
    const all = titles()
    expect(all).toHaveLength(books.length)
    all.forEach((el, i) => {
      expect(el).toHaveTextContent(books[i].title)
      expect(el.querySelector('sup')).toHaveTextContent(`No.${books[i].no}`)
    })
  })

  it('marks exactly one title current and moves the marker with the index', () => {
    const { rerender } = render(<TitleBand books={books} currentIndex={46} onNavigate={() => {}} />)
    expect(currentTitles()).toEqual([titles()[46]])
    rerender(<TitleBand books={books} currentIndex={10} onNavigate={() => {}} />)
    expect(currentTitles()).toEqual([titles()[10]])
  })

  it('clicking another title navigates to it; clicking the current one does nothing', () => {
    const onNavigate = vi.fn()
    render(<TitleBand books={books} currentIndex={46} onNavigate={onNavigate} />)
    fireEvent.click(titles()[41])
    expect(onNavigate).toHaveBeenCalledWith(41)
    fireEvent.click(titles()[46])
    expect(onNavigate).toHaveBeenCalledTimes(1)
  })

  it('is hidden from assistive tech and has no focusable titles', () => {
    render(<TitleBand books={books} currentIndex={46} onNavigate={() => {}} />)
    const band = screen.getByTestId('title-band')
    expect(band).toHaveAttribute('aria-hidden', 'true')
    expect(band.querySelectorAll('button, a, [tabindex]')).toHaveLength(0)
  })
})

describe('App with the title band', () => {
  it('exposes the current book as the h1 and keeps the band in step', () => {
    render(<App initial={AT_47} />)
    const h1 = screen.getByRole('heading', { level: 1 })
    expect(h1).toHaveTextContent('47권 외계인을 만나는 가장 확실한 방법')
    // 알림은 따로 둔 status가 맡는다(tests/shelfFinish.test.tsx). h1은 평범한 제목이다
    expect(h1).not.toHaveAttribute('aria-live')
    expect(h1).toHaveClass('sr-only')
    expect(currentTitles()).toEqual([titles()[46]])

    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(h1).toHaveTextContent(`46권 ${books[45].title}`)
    expect(h1).toHaveTextContent('46권 한비자, 권력의 법칙')
    expect(currentTitles()).toEqual([titles()[45]])
  })

  it('clicking a band title moves the shelf', () => {
    render(<App initial={AT_47} />)
    fireEvent.click(titles()[39])
    expect(
      within(screen.getByRole('region', { name: '서가명강 서가' })).getByRole('button', { current: true }),
    ).toHaveAccessibleName(
      `40권 ${books[39].title}`,
    )
  })
})
