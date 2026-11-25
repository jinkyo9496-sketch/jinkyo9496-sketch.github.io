import { readFileSync } from 'node:fs'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { VolumeDial } from '../src/chrome/VolumeDial'
import { books } from '../src/data/books'

const dial = () => screen.getByRole('navigation', { name: '권 이동' })
const ticks = () => within(dial()).getAllByRole('button')

describe('VolumeDial: the dial shared by the shelf and the book page', () => {
  it('is a nav named 권 이동 with one line per volume, each a button named N권 제목', () => {
    render(<VolumeDial books={books} currentIndex={10} onGo={vi.fn()} />)
    expect(ticks()).toHaveLength(books.length)
    expect(ticks()[0]).toHaveAccessibleName(`1권 ${books[0].title}`)
    expect(ticks().at(-1)).toHaveAccessibleName(`${books.length}권 ${books.at(-1)!.title}`)
  })

  it('marks only the current volume: aria-current, the one tab stop', () => {
    render(<VolumeDial books={books} currentIndex={10} onGo={vi.fn()} />)
    expect(ticks().filter((t) => t.getAttribute('aria-current') === 'true')).toEqual([ticks()[10]])
    expect(ticks().filter((t) => t.hasAttribute('data-current'))).toEqual([ticks()[10]])
    expect(ticks().filter((t) => t.tabIndex === 0)).toEqual([ticks()[10]])
  })

  it('keeps the current line under a fixed pointer: the track of lines slides, the pointer is decoration', () => {
    const { rerender } = render(<VolumeDial books={books} currentIndex={0} onGo={vi.fn()} />)
    const track = dial().querySelector<HTMLElement>('.dial__track')!
    const pointer = dial().querySelector<HTMLElement>('.dial__pointer')!
    expect(ticks().every((t) => t.parentElement === track)).toBe(true)
    expect(pointer).toHaveAttribute('aria-hidden', 'true')
    expect(track.contains(pointer)).toBe(false)
    // 다이얼이 아는 것은 지금 책의 순번과 권수뿐이고, 자리는 CSS가 계산한다
    expect(dial().style.getPropertyValue('--dial-index')).toBe('0')
    expect(dial().style.getPropertyValue('--dial-count')).toBe(String(books.length))
    rerender(<VolumeDial books={books} currentIndex={22} onGo={vi.fn()} />)
    expect(dial().style.getPropertyValue('--dial-index')).toBe('22')
    expect(dial().querySelector('.dial__track')).toBe(track)
  })

  it('moves focus along with the current line when the book changes while focus is in the dial', () => {
    const { rerender } = render(<VolumeDial books={books} currentIndex={0} onGo={vi.fn()} />)
    ticks()[0].focus()
    rerender(<VolumeDial books={books} currentIndex={33} onGo={vi.fn()} />)
    // 옛 선에 남으면 줄과 함께 미끄러져 다이얼 밖으로 잘린다
    expect(document.activeElement).toBe(ticks()[33])
  })

  it('leaves focus alone when it is somewhere else', () => {
    const { rerender } = render(
      <>
        <button type="button">밖</button>
        <VolumeDial books={books} currentIndex={0} onGo={vi.fn()} />
      </>,
    )
    const outside = screen.getByRole('button', { name: '밖' })
    outside.focus()
    rerender(
      <>
        <button type="button">밖</button>
        <VolumeDial books={books} currentIndex={5} onGo={vi.fn()} />
      </>,
    )
    expect(document.activeElement).toBe(outside)
  })

  it('keeps a style passed by the host next to its own values', () => {
    render(<VolumeDial books={books} currentIndex={3} onGo={vi.fn()} style={{ opacity: 0.5 }} />)
    expect(dial().style.opacity).toBe('0.5')
    expect(dial().style.getPropertyValue('--dial-index')).toBe('3')
  })

  it('goes to the volume of the pressed line, but not for the current one', async () => {
    const onGo = vi.fn()
    render(<VolumeDial books={books} currentIndex={10} onGo={onGo} />)
    await userEvent.click(ticks()[34])
    expect(onGo).toHaveBeenCalledWith(34)
    await userEvent.click(ticks()[10])
    expect(onGo).toHaveBeenCalledTimes(1)
  })

  it('takes a class and extra attributes for where it sits', () => {
    render(<VolumeDial books={books} currentIndex={0} onGo={vi.fn()} className="bookpage__dial" data-open />)
    expect(dial()).toHaveClass('dial', 'bookpage__dial')
    expect(dial()).toHaveAttribute('data-open')
  })
})

describe('VolumeDial colours (tokens only)', () => {
  const css = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

  it('draws light grey lines by default (the shelf: paper ground) and paper lines on a book page', () => {
    const chrome = css('../src/chrome/chrome.css')
    expect(chrome).toMatch(/\.dial\s*\{[^}]*--dial-line:\s*var\(--shelf-ink-faint\)/)
    expect(chrome).toMatch(/\.dial__tick::before\s*\{[^}]*background:\s*var\(--dial-line\)/)
    expect(css('../src/page/bookPage.css')).toMatch(/\.bookpage__dial\s*\{[^}]*--dial-line:\s*var\(--shelf-paper\)/)
  })

  it('never draws the shelf dial in full ink: light grey lines, a mid grey pointer', () => {
    const chrome = css('../src/chrome/chrome.css')
    expect(chrome).not.toMatch(/--dial-[a-z]+:\s*var\(--shelf-ink\)/)
    expect(chrome).toMatch(/\.dial\s*\{[^}]*--dial-pointer:\s*var\(--shelf-ink-2\)/)
    expect(chrome).toMatch(/\.dial__pointer\s*\{[^}]*background:\s*var\(--dial-pointer\)/)
    expect(css('../src/index.css')).toMatch(/--shelf-ink-2:\s*#6b6b6b/)
  })

  it('draws every line the same: the current one is not longer, thicker or another colour', () => {
    const chrome = css('../src/chrome/chrome.css')
    const current = chrome.match(/\.dial__tick\[data-current\]::before\s*\{([^}]*)\}/)
    expect(current?.[1] ?? '').not.toMatch(/width|height|background/)
    expect(chrome).not.toMatch(/--dial-mark/)
  })

  it('slides the track so the current line sits at the centre, at the pace of the shelf', () => {
    const chrome = css('../src/chrome/chrome.css')
    const track = chrome.match(/\.dial__track\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(track).toMatch(/left:\s*50%/)
    expect(track).toMatch(/translate:\s*calc\(\(var\(--dial-index\) \+ 0\.5\) \* var\(--tick-w\) \* -1\) 0/)
    expect(track).toMatch(/transition:\s*translate var\(--dur-shelf\) var\(--ease-shelf\)/)
    // 양쪽에 (권수 - 1)개씩 놓일 폭. 자리가 모자라면 쓰는 쪽이 준 --dial-max에서 끝을 잘라 낸다
    const dial = chrome.match(/\.dial\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(dial).toMatch(/width:\s*min\(calc\(\(var\(--dial-count\) \* 2 - 1\) \* var\(--tick-w\)\), var\(--dial-max, 100%\)\)/)
    // 기본값을 .dial에 적으면 쓰는 쪽(.bar__dial)의 값을 덮는다
    expect(dial).not.toMatch(/--dial-max:/)
    expect(dial).toMatch(/overflow:\s*clip/)
  })

  it('draws the pointer as a sharp downward triangle (no rounding)', () => {
    const pointer = css('../src/chrome/chrome.css').match(/\.dial__pointer\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(pointer).toMatch(/clip-path:\s*polygon\(0 0, 100% 0, 50% 100%\)/)
    expect(pointer).toMatch(/pointer-events:\s*none/)
    expect(pointer).not.toMatch(/radius/)
  })

  it('book page: paper lines dimmed, a paper pointer, and a width that stops short of the back button', () => {
    const page = css('../src/page/bookPage.css')
    const rule = page.match(/\.bookpage__dial\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(rule).toMatch(/--dial-pointer:\s*var\(--shelf-paper\)/)
    expect(rule).toMatch(/--dial-dim:\s*0\.7/)
    expect(rule).toMatch(/--dial-max:/)
  })

  it('uses no hex colours in the chrome styles', () => {
    expect(css('../src/chrome/chrome.css')).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })
})
