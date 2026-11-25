import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from '../src/App'
import { Logo } from '../src/chrome/Logo'
import { books } from '../src/data/books'

// 첫 화면은 인트로이고 서가는 1권에서 시작한다(tests/Screens.test.tsx). 여기서는 서가의 47권에서 시작해 본다.
const AT_47 = { screen: 'shelf', index: 46 } as const


const header = () => screen.getByRole('banner')
const bar = () => screen.getByRole('contentinfo')
const dial = () => within(bar()).getByRole('navigation', { name: '권 이동' })
const ticks = () => within(dial()).getAllByRole('button')
const shelfCurrentNo = () => {
  const shelf = screen.getByRole('region', { name: '서가명강 서가' })
  const current = within(shelf).getAllByRole('button', { current: true })
  expect(current).toHaveLength(1)
  return Number(current[0].closest('[data-testid="book"]')!.getAttribute('data-no'))
}

describe('Header', () => {
  it('shows the logo image linking to the start page', () => {
    render(<App initial={AT_47} />)
    const link = within(header()).getByRole('link', { name: '서가명강' })
    expect(link).toHaveAttribute('href', '/')
    // 밝은 바탕(서가·인트로)에서는 먹 로고가 보이는 쪽이다
    expect(within(header()).getByRole('img', { name: '서가명강' })).toHaveAttribute('src', '/logo-ink.png')
    expect(header().querySelector('.logo')).toHaveAttribute('data-show', 'ink')
  })

  it('Logo renders an image with alt text when given a src', () => {
    render(<Logo src="/logo.svg" />)
    const img = screen.getByRole('img', { name: '서가명강' })
    expect(img).toHaveAttribute('src', '/logo.svg')
    expect(screen.getByRole('link', { name: '서가명강' })).toHaveAttribute('href', '/')
  })

  it('Logo falls back to the text wordmark without a src', () => {
    render(<Logo src={null} />)
    expect(screen.getByRole('link', { name: '서가명강' })).toHaveTextContent('서가명강')
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('Logo with two versions shows the one for the text tone and names the link once', () => {
    const src = { ink: '/a-ink.png', paper: '/a-paper.png' }
    const { rerender, container } = render(<Logo src={src} tone="ink" />)
    expect(screen.getByRole('img', { name: '서가명강' })).toHaveAttribute('src', '/a-ink.png')
    expect(container.querySelector('.logo')).toHaveAttribute('data-tone', 'ink')
    expect(container.querySelectorAll('img')).toHaveLength(2)

    rerender(<Logo src={src} tone="paper" />)
    expect(screen.getByRole('img', { name: '서가명강' })).toHaveAttribute('src', '/a-paper.png')
    expect(container.querySelector('.logo')).toHaveAttribute('data-tone', 'paper')
    expect(screen.getByRole('link', { name: '서가명강' })).toBeInTheDocument()
  })
})

describe('Logo in one colour (book pages)', () => {
  const src = {
    ink: '/a-ink.png',
    paper: '/a-paper.png',
    mono: { ink: '/a-ink-mono.png', paper: '/a-paper-mono.png' },
  }

  it('shows the one-colour version of the tone when asked', () => {
    const { rerender, container } = render(<Logo src={src} tone="ink" mono />)
    expect(screen.getByRole('img', { name: '서가명강' })).toHaveAttribute('src', '/a-ink-mono.png')
    expect(container.querySelector('.logo')).toHaveAttribute('data-show', 'ink-mono')
    rerender(<Logo src={src} tone="paper" mono />)
    expect(screen.getByRole('img', { name: '서가명강' })).toHaveAttribute('src', '/a-paper-mono.png')
    rerender(<Logo src={src} tone="paper" />)
    expect(screen.getByRole('img', { name: '서가명강' })).toHaveAttribute('src', '/a-paper.png')
    // 겹쳐 둔 네 그림 가운데 이름은 하나만
    expect(container.querySelectorAll('img')).toHaveLength(4)
    expect(screen.getAllByRole('img')).toHaveLength(1)
  })

  it('keeps the two-colour version when there is no one-colour set', () => {
    render(<Logo src={{ ink: '/a-ink.png', paper: '/a-paper.png' }} tone="ink" mono />)
    expect(screen.getByRole('img', { name: '서가명강' })).toHaveAttribute('src', '/a-ink.png')
  })
})

describe('Header without the catalogue', () => {
  it('has no [ 전체 목록 ]: the logo and the menu button [ + ] (전체 메뉴, 2026-11-25) only', () => {
    render(<App initial={AT_47} />)
    // 헤더의 버튼은 전체 메뉴 하나뿐이다(tests/Menu.test.tsx)
    expect(within(header()).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['전체 메뉴'])
    expect(screen.queryByRole('button', { name: '전체 목록' })).toBeNull()
  })

  it('there is no catalogue dialog in the page', () => {
    render(<App initial={AT_47} />)
    expect(document.querySelector('dialog.catalogue')).toBeNull()
    expect(document.querySelectorAll('dialog')).toHaveLength(1) // 상세 창만 남는다
  })
})

describe('Bottom bar', () => {
  it('no longer shows the title, the author, the position, [ 이전 ] [ 다음 ] or [ 자세히 ]', () => {
    render(<App initial={AT_47} />)
    expect(bar()).not.toHaveTextContent('외계인을 만나는 가장 확실한 방법')
    expect(bar()).not.toHaveTextContent('심민섭')
    expect(bar()).not.toHaveTextContent(`47 / ${books.length}`)
    for (const name of ['이전', '다음', '자세히']) expect(screen.queryByRole('button', { name })).toBeNull()
  })

  it('carries the volume dial: one line per volume, only the current one marked and in the tab order', () => {
    render(<App initial={AT_47} />)
    expect(dial()).toHaveClass('dial')
    expect(ticks()).toHaveLength(books.length)
    expect(ticks().filter((t) => t.getAttribute('aria-current') === 'true')).toEqual([ticks()[46]])
    expect(ticks().filter((t) => t.tabIndex === 0)).toEqual([ticks()[46]])
    expect(ticks()[46]).toHaveAccessibleName('47권 외계인을 만나는 가장 확실한 방법')
  })

  it('a line of the dial moves everything to that volume: shelf, dial, hidden heading, status', async () => {
    render(<App initial={AT_47} />)
    await userEvent.click(ticks()[11])
    expect(shelfCurrentNo()).toBe(12)
    expect(ticks().filter((t) => t.getAttribute('aria-current') === 'true')).toEqual([ticks()[11]])
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(`12권 ${books[11].title}`)
    expect(document.querySelector('main [role="status"]')).toHaveTextContent(`12권 ${books[11].title}`)
    // 누른 선에 포커스가 남는다(이제 그 선이 탭 순서에 든 하나다)
    expect(ticks()[11]).toHaveFocus()
  })

  it('the current line does nothing, and no dialog opens from the bar', async () => {
    render(<App initial={AT_47} />)
    await userEvent.click(ticks()[46])
    expect(shelfCurrentNo()).toBe(47)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('has only the dial: no bracket button ([ 학제별 분류 ] was removed 2026-11-24)', () => {
    render(<App initial={AT_47} />)
    const buttons = within(bar()).getAllByRole('button')
    expect(buttons).toHaveLength(books.length)
    for (const button of buttons) expect(dial()).toContainElement(button)
    expect(screen.queryByRole('button', { name: '학제별 분류' })).toBeNull()
  })

  it('follows the shelf when the book changes another way', () => {
    render(<App initial={AT_47} />)
    fireEvent.keyDown(window, { key: 'Home' })
    expect(ticks().filter((t) => t.getAttribute('aria-current') === 'true')).toEqual([ticks()[0]])
  })
})
