import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import App from '../src/App'
import type { Blurb } from '../src/data/blurbs'
import { books } from '../src/data/books'
import { Shelf } from '../src/shelf/Shelf'

// 첫 화면은 인트로이고 서가는 1권에서 시작한다(tests/Screens.test.tsx). 여기서는 서가의 47권에서 시작해 본다.
const AT_47 = { screen: 'shelf', index: 46 } as const


// 실제 blurbs.ts 내용에 기대지 않는다. 필요한 테스트만 이 값을 넣어 쓴다.
const fixture: Record<number, Blurb> = {
  47: { subtitle: '시험용 부제 47', summary: '시험용 소개 47.' },
  46: { subtitle: '시험용 부제 46', summary: '시험용 소개 46.' },
}

// 모달이 열려 있는 동안 바깥은 보조 기술에서 가려질 수 있어 hidden까지 찾는다
const dialog = () => screen.getByRole('dialog')
const inDialog = () => within(dialog())
const title = () => inDialog().getByRole('heading', { level: 2 })
const cover = () => inDialog().getByRole('img')
const shelf = () => screen.getByRole('region', { name: '서가명강 서가', hidden: true })
const shelfCurrentNo = () => {
  const current = within(shelf()).getAllByRole('button', { current: true, hidden: true })
  expect(current).toHaveLength(1)
  return Number(current[0].closest('[data-testid="book"]')!.getAttribute('data-no'))
}
const bookButton = (no: number) =>
  within(shelf()).getByRole('button', { name: `${no}권 ${books[no - 1].title}`, hidden: true })
const open = async (blurbs: Record<number, Blurb> = {}) => {
  render(<App initial={AT_47} blurbs={blurbs} />)
  await userEvent.click(bookButton(47))
  return dialog()
}

describe('Opening the detail', () => {
  it('is closed at first; the centre book opens it on the current book', async () => {
    render(<App initial={AT_47} blurbs={{}} />)
    expect(screen.queryByRole('dialog')).toBeNull()
    await userEvent.click(bookButton(47))
    expect(dialog()).toHaveAttribute('open')
    expect(dialog()).toHaveAccessibleName('외계인을 만나는 가장 확실한 방법')
    expect(title()).toHaveTextContent('외계인을 만나는 가장 확실한 방법')
    expect(inDialog().getByText('서가명강 47')).toBeInTheDocument()
    expect(inDialog().getByText('심민섭 지음')).toBeInTheDocument()
    expect(inDialog().getByText('2026년 11월 4일')).toBeInTheDocument()
    const link = inDialog().getByRole('link', { name: '알라딘에서 보기' })
    expect(link).toHaveAttribute(
      'href',
      'https://www.aladin.co.kr/shop/wproduct.aspx?ItemId=405971604',
    )
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('opens on whichever book is current', async () => {
    render(<App initial={AT_47} blurbs={{}} />)
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    await userEvent.click(bookButton(46))
    expect(title()).toHaveTextContent('한비자, 권력의 법칙')
    expect(inDialog().getByText('서가명강 46')).toBeInTheDocument()
    expect(inDialog().getByText('2026년 8월 31일')).toBeInTheDocument()
  })

  it('Enter or Space on the focused current book opens it', async () => {
    const user = userEvent.setup()
    render(<App initial={AT_47} blurbs={{}} />)
    bookButton(47).focus()
    await user.keyboard('{Enter}')
    expect(title()).toHaveTextContent('외계인을 만나는 가장 확실한 방법')
    await user.click(inDialog().getByRole('button', { name: '닫기' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(bookButton(47)).toHaveFocus()
    await user.keyboard(' ')
    expect(dialog()).toHaveAttribute('open')
  })

  it('a click on the centre cover opens it; a click on another book only navigates', async () => {
    render(<App initial={AT_47} blurbs={{}} />)
    await userEvent.click(bookButton(40))
    expect(shelfCurrentNo()).toBe(40)
    expect(screen.queryByRole('dialog')).toBeNull()
    // 판정용 판(.shelf__hit): jsdom에서는 좌표 0이 화면 중앙 = 가운데 책이다
    fireEvent.click(shelf().querySelector('.shelf__hit')!, { clientX: 0, clientY: 0 })
    expect(title()).toHaveTextContent(books[39].title)
    expect(shelfCurrentNo()).toBe(40)
  })

  it('Shelf calls onOpenCurrent only for the current book, never after a drag', () => {
    const onOpenCurrent = vi.fn()
    const onChange = vi.fn()
    render(
      <Shelf books={books} initialIndex={20} onCurrentChange={onChange} onOpenCurrent={onOpenCurrent} />,
    )
    fireEvent.click(bookButton(30))
    expect(onOpenCurrent).not.toHaveBeenCalled()
    expect(onChange).toHaveBeenLastCalledWith(29)
    fireEvent.click(bookButton(30))
    expect(onOpenCurrent).toHaveBeenCalledTimes(1)
    // 끌기 끝에 따라오는 클릭은 열지 않는다
    const centre = bookButton(30)
    fireEvent.pointerDown(centre, { clientX: 500, clientY: 300, button: 0, pointerId: 1 })
    fireEvent.pointerMove(centre, { clientX: 490, clientY: 300, pointerId: 1 })
    fireEvent.pointerUp(centre, { clientX: 490, clientY: 300, pointerId: 1 })
    fireEvent.click(centre)
    expect(onOpenCurrent).toHaveBeenCalledTimes(1)
  })
})

describe('Blurb', () => {
  it('shows the subtitle and summary when the book has one', async () => {
    await open(fixture)
    expect(inDialog().getByText('시험용 부제 47')).toBeInTheDocument()
    expect(inDialog().getByText('시험용 소개 47.')).toBeInTheDocument()
  })

  it('leaves both out when there is none, with nothing reading "undefined"', async () => {
    const d = await open({})
    expect(d.querySelector('.detail__subtitle')).toBeNull()
    expect(d.querySelector('.detail__summary')).toBeNull()
    expect(inDialog().getAllByRole('heading')).toHaveLength(1)
    expect(d.textContent).not.toMatch(/undefined|null/)
    d.querySelectorAll('p').forEach((p) => expect(p.textContent!.trim()).not.toBe(''))
  })

  it('follows the book: a book without a blurb drops the one shown before', async () => {
    await open(fixture)
    await userEvent.click(inDialog().getByRole('button', { name: '이전' }))
    expect(inDialog().getByText('시험용 소개 46.')).toBeInTheDocument()
    await userEvent.click(inDialog().getByRole('button', { name: '이전' }))
    expect(title()).toHaveTextContent(books[44].title)
    expect(inDialog().queryByText(/시험용/)).toBeNull()
  })
})

describe('Cover toggle', () => {
  const front = () => inDialog().getByRole('button', { name: '앞표지' })
  const back = () => inDialog().getByRole('button', { name: '뒤표지' })

  it('starts on the front cover and swaps to the back and back again', async () => {
    await open()
    expect(cover()).toHaveAttribute('src', '/covers/47_front.jpg')
    expect(cover()).toHaveAttribute('alt', '외계인을 만나는 가장 확실한 방법 앞표지')
    expect(front()).toHaveAttribute('aria-pressed', 'true')
    expect(back()).toHaveAttribute('aria-pressed', 'false')

    await userEvent.click(back())
    expect(cover()).toHaveAttribute('src', '/covers/47_back.jpg')
    expect(cover()).toHaveAttribute('alt', '외계인을 만나는 가장 확실한 방법 뒤표지')
    expect(front()).toHaveAttribute('aria-pressed', 'false')
    expect(back()).toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(front())
    expect(cover()).toHaveAttribute('src', '/covers/47_front.jpg')
    expect(front()).toHaveAttribute('aria-pressed', 'true')
  })

  it('goes back to the front cover when the book changes', async () => {
    await open()
    await userEvent.click(back())
    await userEvent.click(inDialog().getByRole('button', { name: '이전' }))
    expect(cover()).toHaveAttribute('src', '/covers/46_front.jpg')
    expect(cover()).toHaveAttribute('alt', '한비자, 권력의 법칙 앞표지')
    expect(front()).toHaveAttribute('aria-pressed', 'true')
    // 돌아와도 앞표지다
    await userEvent.click(inDialog().getByRole('button', { name: '다음' }))
    expect(cover()).toHaveAttribute('src', '/covers/47_front.jpg')
  })
})

describe('Stepping inside the detail', () => {
  const prev = () => inDialog().getByRole('button', { name: '이전' })
  const next = () => inDialog().getByRole('button', { name: '다음' })

  it('이전/다음 change the book without closing; the shelf follows', async () => {
    await open()
    await userEvent.click(prev())
    expect(dialog()).toHaveAttribute('open')
    expect(title()).toHaveTextContent('한비자, 권력의 법칙')
    expect(inDialog().getByText(`46 / ${books.length}`)).toBeInTheDocument()
    expect(shelfCurrentNo()).toBe(46)
    expect(prev()).toHaveFocus()
    await userEvent.click(next())
    expect(title()).toHaveTextContent('외계인을 만나는 가장 확실한 방법')
    expect(shelfCurrentNo()).toBe(47)
    expect(dialog()).toHaveAttribute('open')
  })

  it('marks the end with aria-disabled instead of disabling, and does nothing there', async () => {
    const last = books.at(-1)!
    render(<App initial={{ screen: 'shelf', index: books.length - 1 }} blurbs={{}} />)
    await userEvent.click(bookButton(last.no))
    expect(next()).toHaveAttribute('aria-disabled', 'true')
    expect(next()).toBeEnabled()
    expect(prev()).not.toHaveAttribute('aria-disabled')
    await userEvent.click(next())
    expect(title()).toHaveTextContent(last.title)
    expect(next()).toHaveFocus()
  })

  it('이전 is aria-disabled at the first book', async () => {
    render(<App initial={AT_47} blurbs={{}} />)
    fireEvent.keyDown(window, { key: 'Home' })
    await userEvent.click(bookButton(1))
    expect(prev()).toHaveAttribute('aria-disabled', 'true')
    expect(next()).not.toHaveAttribute('aria-disabled')
    await userEvent.click(prev())
    expect(title()).toHaveTextContent(books[0].title)
  })

  it('ArrowLeft/ArrowRight step exactly one book per key press', async () => {
    const user = userEvent.setup()
    render(<App initial={AT_47} blurbs={{}} />)
    await user.click(bookButton(47))
    // 실제 브라우저처럼 포커스가 모달 안에 있을 때의 키 입력
    inDialog().getByRole('button', { name: '닫기' }).focus()
    await user.keyboard('{ArrowLeft}')
    expect(title()).toHaveTextContent('한비자, 권력의 법칙')
    expect(shelfCurrentNo()).toBe(46)
    await user.keyboard('{ArrowLeft}')
    expect(shelfCurrentNo()).toBe(45)
    await user.keyboard('{ArrowRight}')
    expect(shelfCurrentNo()).toBe(46)
    expect(title()).toHaveTextContent('한비자, 권력의 법칙')
    expect(dialog()).toHaveAttribute('open')
  })

  it('ignores arrows with modifiers, Home/End, and the wheel behind it', async () => {
    await open()
    fireEvent.keyDown(title(), { key: 'ArrowLeft', metaKey: true })
    fireEvent.keyDown(title(), { key: 'Home' })
    fireEvent.wheel(shelf(), { deltaY: -200 })
    expect(shelfCurrentNo()).toBe(47)
  })
})

describe('Closing the detail', () => {
  it('닫기 closes it and gives focus back to the button that opened it', async () => {
    await open()
    await userEvent.click(inDialog().getByRole('button', { name: '닫기' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(bookButton(47)).toHaveFocus()
  })

  it('closes from a click on the backdrop but not from a click inside', async () => {
    const d = await open()
    await userEvent.click(title())
    expect(d).toHaveAttribute('open')
    // 배경(::backdrop) 클릭은 dialog 요소 자체를 대상으로 온다
    fireEvent.click(d)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('closes when the browser closes it (Esc) and keeps the book reached inside', async () => {
    const d = await open()
    await userEvent.click(inDialog().getByRole('button', { name: '이전' }))
    ;(d as HTMLDialogElement).close()
    expect(await screen.findByRole('contentinfo')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(shelfCurrentNo()).toBe(46)
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(shelfCurrentNo()).toBe(45)
  })

  it('opened from the shelf, focus returns to the current book even after stepping', async () => {
    const user = userEvent.setup()
    render(<App initial={AT_47} blurbs={{}} />)
    bookButton(47).focus()
    await user.keyboard('{Enter}')
    await user.click(inDialog().getByRole('button', { name: '이전' }))
    await user.click(inDialog().getByRole('button', { name: '닫기' }))
    expect(bookButton(46)).toHaveFocus()
  })
})
