import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../src/App'
import { FIELD_STEP_MS } from '../src/app/screen'
import { books } from '../src/data/books'
import { fields } from '../src/data/fields'
import { Fields } from '../src/fields/Fields'

const T0 = 1_000_000
const useClock = () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(T0)
}
afterEach(() => vi.useRealTimers())

const dial = () => screen.getByRole('navigation', { name: '학문' })
const fieldButtons = () => within(dial()).getAllByRole('button')
const fieldButton = (name: string) => within(dial()).getByRole('button', { name: new RegExp(`^${name}, \\d+권$`) })
const currentField = () => {
  const current = within(dial()).getAllByRole('button', { current: true })
  expect(current).toHaveLength(1)
  return current[0].textContent
}
const bookList = () => screen.getByRole('list', { name: /의 책$/ })
const status = () => document.querySelector<HTMLElement>('.fields [role="status"]')!
const onScreen = () => document.querySelector<HTMLElement>('.screens')!.dataset.screen
const fieldsCss = () => readFileSync(resolve(process.cwd(), 'src/fields/fields.css'), 'utf8')
/** 글자 다이얼 위에서 굴린 휠 */
const wheel = (deltaY: number) => fireEvent.wheel(document.querySelector('.fdial')!, { deltaY })
/** 다이얼 밖(책 자리 등)에서 굴린 휠 */
const wheelOutside = (deltaY: number, selector = '.fields__content > :not(.fdial)') =>
  fireEvent.wheel(document.querySelector(selector)!, { deltaY })

describe('글자 다이얼 (Fields 컴포넌트)', () => {
  const setup = (current = 0) => {
    const onFieldChange = vi.fn()
    const view = render(<Fields currentField={current} onFieldChange={onFieldChange} />)
    const show = (next: number) =>
      view.rerender(<Fields currentField={next} onFieldChange={onFieldChange} />)
    return { onFieldChange, show }
  }

  it('학문 열하나가 순서대로 버튼이고, 이름은 "학문, N권"이다', () => {
    setup()
    expect(fieldButtons().map((b) => b.getAttribute('aria-label'))).toEqual(
      fields.map((f) => `${f.name}, ${f.nos.length}권`),
    )
    expect(fieldButtons().map((b) => b.textContent)).toEqual(fields.map((f) => f.name))
    expect(fieldButton('철학')).toHaveAccessibleName('철학, 5권')
    expect(fieldButton('생명과학')).toHaveAccessibleName('생명과학, 6권')
    expect(fieldButton('환경')).toHaveAccessibleName('환경, 5권')
  })

  it('지금 학문만 aria-current이고 탭 순서에 든다(roving tabindex)', () => {
    const { show } = setup(0)
    expect(currentField()).toBe('철학')
    expect(fieldButtons().filter((b) => b.tabIndex === 0)).toEqual([fieldButton('철학')])
    show(4)
    expect(currentField()).toBe('생명과학')
    expect(fieldButtons().filter((b) => b.tabIndex === 0)).toEqual([fieldButton('생명과학')])
    expect(fieldButton('철학')).not.toHaveAttribute('aria-current')
  })

  it('학문 이름을 누르면 그 학문의 index를 알린다', async () => {
    const { onFieldChange } = setup(0)
    await userEvent.click(fieldButton('법'))
    expect(onFieldChange).toHaveBeenCalledWith(5)
  })

  it('다이얼은 가리키는 학문만큼 돌고, 낱말마다 가운데에서 떨어진 칸 수를 안다', () => {
    const { show } = setup(0)
    const wheelEl = dial().querySelector<HTMLElement>('.fdial__wheel')!
    expect(wheelEl.style.getPropertyValue('--field')).toBe('0')
    const items = () => Array.from(dial().querySelectorAll<HTMLElement>('.fdial__item'))
    expect(items().map((el) => el.style.getPropertyValue('--i'))).toEqual(fields.map((_, i) => String(i)))
    expect(items().map((el) => el.dataset.away)).toEqual(['0', '1', '2', '3', '4', '5', '5', '5', '5', '5', '5'])
    show(6)
    expect(wheelEl.style.getPropertyValue('--field')).toBe('6')
    expect(items().map((el) => el.dataset.away)).toEqual(['5', '5', '4', '3', '2', '1', '0', '1', '2', '3', '4'])
  })

  it('포인터는 장식이다(읽히지 않는다). 화살표 그림이 아니라 CSS로 그린 삼각형이다', () => {
    setup()
    const pointer = dial().querySelector('.fdial__pointer')!
    expect(pointer).toHaveAttribute('aria-hidden', 'true')
    expect(pointer).toBeEmptyDOMElement()
    expect(dial().querySelector('.fdial__arrow, svg')).toBeNull()
    expect(within(dial()).queryByRole('img')).toBeNull()
    const css = fieldsCss()
    const rule = css.match(/\.fdial__pointer\s*\{([^}]*)\}/)?.[1] ?? ''
    // 오른쪽(가리키는 낱말 쪽)을 향한 각진 삼각형
    expect(rule).toMatch(/clip-path:\s*polygon\(0 0, 100% 50%, 0 100%\)/)
    expect(rule).toMatch(/background:\s*var\(--ink\)/)
    expect(rule).not.toMatch(/radius/)
  })

  it('오른쪽에는 가리키는 학문의 책이 앞표지 그림으로 나란히 보인다(WebGL이 없을 때). 표지마다 버튼이다', () => {
    const { show } = setup(0)
    expect(bookList()).toHaveAccessibleName('철학의 책')
    const rows = within(bookList()).getAllByRole('listitem')
    expect(rows).toHaveLength(fields[0].nos.length)
    const five = books[4]
    const button = within(rows[0]).getByRole('button')
    expect(button).toHaveAccessibleName(`${five.no}권 ${five.title}`)
    // 표지 그림은 장식이다(이름은 버튼이 전한다). 아래에 번호·제목·저자
    const img = rows[0].querySelector('img')!
    expect(img).toHaveAttribute('src', five.images.front)
    expect(img).toHaveAttribute('alt', '')
    expect(img).toHaveAttribute('draggable', 'false')
    expect(rows[0].querySelector('.fcovers__no')).toHaveTextContent(String(five.no))
    expect(rows[0].querySelector('.fcovers__title')).toHaveTextContent(five.title)
    expect(rows[0].querySelector('.fcovers__author')).toHaveTextContent(five.author)
    show(1)
    expect(bookList()).toHaveAccessibleName('심리의 책')
    expect(within(bookList()).getAllByRole('listitem').map((li) => li.dataset.no)).toEqual(['28', '30'])
  })

  it('표지를 누르면 그 책의 번호와 누른 버튼을 알린다(상세 창을 열 곳)', async () => {
    const onOpenDetail = vi.fn()
    // 33권은 생명과학(index 4)의 책이다
    render(<Fields currentField={4} onFieldChange={() => {}} onOpenDetail={onOpenDetail} />)
    const button = within(bookList()).getByRole('button', { name: `33권 ${books[32].title}` })
    await userEvent.click(button)
    expect(onOpenDetail).toHaveBeenCalledTimes(1)
    expect(onOpenDetail).toHaveBeenLastCalledWith(33, button)
  })

  it('학문이 바뀌면 한 번 알린다("심리, 2권"). 처음에는 비어 있다', () => {
    const { show } = setup(0)
    expect(status()).toHaveAttribute('aria-atomic', 'true')
    expect(status()).toBeEmptyDOMElement()
    show(1)
    expect(status()).toHaveTextContent(/^심리, 2권$/)
    show(0)
    expect(status()).toHaveTextContent(/^철학, 5권$/)
  })

  it('포커스가 다이얼에 있으면 새 학문으로 포커스가 따라가고, 따로 알리지 않는다', () => {
    const { show } = setup(0)
    fieldButton('철학').focus()
    show(1)
    expect(fieldButton('심리')).toHaveFocus()
    expect(status()).toBeEmptyDOMElement()
  })

  it('다이얼은 헤더 아래부터 화면 맨 아래까지 쓴다: 버튼이 있던 아래 줄(빈 상자)이 없다', () => {
    const rule = fieldsCss().match(/\.fields\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(rule).toMatch(/grid-template-rows:\s*minmax\(0, 1fr\);/)
    expect(rule).not.toMatch(/--footer-h/)
  })

  it('다이얼의 위아래 끝은 뚝 잘리지 않고 옅어지며 사라진다(헤더 선과 화면 끝에 낱말이 걸려 보이지 않게)', () => {
    const rule = fieldsCss().match(/\.fdial\s*\{([^}]*)\}/)?.[1] ?? ''
    const fade =
      /mask-image:\s*linear-gradient\(\s*to bottom,\s*transparent 0,\s*black var\(--dial-fade\),\s*black calc\(100% - var\(--dial-fade\)\),\s*transparent 100%\s*\)/
    expect(rule).toMatch(fade)
    expect(rule).toMatch(new RegExp('-webkit-' + fade.source))
    expect(rule).toMatch(/--dial-fade:\s*18%/)
  })

  it('제목은 화면에 보이지 않고 읽기 도구에만 남는다. [ 서가로 ] 버튼과 하단 줄은 없다', () => {
    setup()
    expect(screen.getByRole('region', { name: '학제별 분류' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/^학제별 분류$/)
    expect(screen.getByRole('heading', { level: 1 })).toHaveClass('sr-only')
    expect(fieldsCss()).not.toMatch(/fields__title/)
    expect(screen.queryByRole('button', { name: '서가로' })).toBeNull()
    expect(document.querySelector('.fields__bar, .fields__back')).toBeNull()
    expect(fieldsCss()).not.toMatch(/fields__bar|fields__back/)
  })
})

describe('학제별 분류 화면의 입력 (App)', () => {
  it('처음은 철학이고, ↓·PageDown은 다음 학문, ↑·PageUp은 이전 학문이다(화면은 그대로)', () => {
    render(<App initial={{ screen: 'fields', index: 0 }} />)
    expect(currentField()).toBe('철학')
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    expect(currentField()).toBe('심리')
    fireEvent.keyDown(window, { key: 'PageDown' })
    expect(currentField()).toBe('예술')
    fireEvent.keyDown(window, { key: 'ArrowUp' })
    fireEvent.keyDown(window, { key: 'PageUp' })
    expect(currentField()).toBe('철학')
    expect(onScreen()).toBe('fields')
    expect(bookList()).toHaveAccessibleName('철학의 책')
  })

  it('Home/End는 첫·마지막 학문, 과학에서 아래는 멈춘다', () => {
    render(<App initial={{ screen: 'fields', index: 0 }} />)
    fireEvent.keyDown(window, { key: 'End' })
    expect(currentField()).toBe('과학')
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    expect(currentField()).toBe('과학')
    expect(onScreen()).toBe('fields')
    fireEvent.keyDown(window, { key: 'Home' })
    expect(currentField()).toBe('철학')
  })

  it('철학에서 위는 서가로 가고, 돌아오면 보던 학문 그대로다', () => {
    render(<App initial={{ screen: 'fields', index: 3, field: 2 }} />)
    expect(currentField()).toBe('예술')
    fireEvent.keyDown(window, { key: 'ArrowUp' })
    fireEvent.keyDown(window, { key: 'ArrowUp' })
    expect(onScreen()).toBe('fields')
    expect(currentField()).toBe('철학')
    fireEvent.keyDown(window, { key: 'ArrowUp' })
    expect(onScreen()).toBe('shelf')
  })

  it('서가에 다녀와도 보던 학문 그대로다', async () => {
    render(<App initial={{ screen: 'fields', index: 3, field: 6 }} />)
    wheelOutside(-200)
    expect(onScreen()).toBe('shelf')
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    expect(onScreen()).toBe('fields')
    expect(currentField()).toBe('정치')
  })

  it('학문 이름을 누르면 그 학문을 가리킨다', async () => {
    render(<App initial={{ screen: 'fields', index: 0 }} />)
    await userEvent.click(fieldButton('문학'))
    expect(currentField()).toBe('문학')
    expect(fieldButton('문학')).toHaveFocus()
    expect(bookList()).toHaveAccessibleName('문학의 책')
  })

  it('다이얼 밖에서 굴린 휠은 다이얼을 돌리지 않는다: 위는 서가로(어느 학문이든), 아래는 아무 일도 없다', () => {
    useClock()
    render(<App initial={{ screen: 'fields', index: 0 }} />)
    wheel(200)
    expect(currentField()).toBe('심리')
    vi.setSystemTime(T0 + 1000)
    wheelOutside(200)
    expect(currentField()).toBe('심리')
    expect(onScreen()).toBe('fields')
    vi.setSystemTime(T0 + 2000)
    wheelOutside(-200)
    expect(onScreen()).toBe('shelf')
  })

  it('다이얼 위의 휠은 낱말이 없는 빈 자리에서도 다이얼을 돌린다', () => {
    useClock()
    render(<App initial={{ screen: 'fields', index: 0 }} />)
    fireEvent.wheel(document.querySelector('.fdial__wheel')!, { deltaY: 200 })
    expect(currentField()).toBe('심리')
  })

  it('휠은 한 번 굴릴 때 한 칸이고, 걸음 사이 최소 간격 동안의 휠은 버린다', () => {
    useClock()
    render(<App initial={{ screen: 'fields', index: 0 }} />)
    wheel(200)
    expect(currentField()).toBe('심리')
    // 같은 손짓의 나머지(관성)
    wheel(200)
    vi.setSystemTime(T0 + FIELD_STEP_MS - 20)
    wheel(200)
    expect(currentField()).toBe('심리')
    // 연달아 굴리면 이어서 넘어간다
    vi.setSystemTime(T0 + FIELD_STEP_MS + 10)
    wheel(200)
    expect(currentField()).toBe('예술')
    vi.setSystemTime(T0 + 2 * FIELD_STEP_MS + 20)
    wheel(-200)
    expect(currentField()).toBe('심리')
  })

  it('휠: 철학에서 위는 서가로, 과학에서 아래는 멈춘다', () => {
    useClock()
    render(<App initial={{ screen: 'fields', index: 0, field: 10 }} />)
    wheel(200)
    expect(currentField()).toBe('과학')
    expect(onScreen()).toBe('fields')
    fireEvent.keyDown(window, { key: 'Home' })
    vi.setSystemTime(T0 + 2000)
    wheel(-200)
    expect(onScreen()).toBe('shelf')
  })

  it('서가에서 막 내려온 순간의 휠은 다이얼을 돌리지 않는다(전환 잠금)', () => {
    useClock()
    render(<App initial={{ screen: 'shelf', index: 0 }} />)
    wheel(200)
    expect(onScreen()).toBe('fields')
    vi.setSystemTime(T0 + 500)
    wheel(200)
    vi.setSystemTime(T0 + 850)
    wheel(200)
    expect(currentField()).toBe('철학')
    vi.setSystemTime(T0 + 900)
    wheel(200)
    expect(currentField()).toBe('심리')
  })

  it('누르고 있는 키(자동 반복)는 최소 간격마다 한 칸씩 돌고, 철학에서 서가로 넘어가지 않는다', () => {
    useClock()
    render(<App initial={{ screen: 'fields', index: 0 }} />)
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    fireEvent.keyDown(window, { key: 'ArrowDown', repeat: true })
    vi.setSystemTime(T0 + 30)
    fireEvent.keyDown(window, { key: 'ArrowDown', repeat: true })
    expect(currentField()).toBe('심리')
    vi.setSystemTime(T0 + FIELD_STEP_MS + 10)
    fireEvent.keyDown(window, { key: 'ArrowDown', repeat: true })
    expect(currentField()).toBe('예술')
    // 위로 누르고 있어도 철학에서 멈춘다
    for (let i = 1; i <= 6; i++) {
      vi.setSystemTime(T0 + 5000 + i * (FIELD_STEP_MS + 10))
      fireEvent.keyDown(window, { key: 'ArrowUp', repeat: true })
    }
    expect(currentField()).toBe('철학')
    expect(onScreen()).toBe('fields')
  })

  it('세로 쓸기도 같은 규칙이다: 위로 쓸면 다음 학문, 철학에서 아래로 쓸면 서가', () => {
    render(<App initial={{ screen: 'fields', index: 0 }} />)
    const area = document.querySelector('.fields')!
    const swipe = (from: number, to: number) => {
      fireEvent.pointerDown(area, { clientX: 300, clientY: from, button: 0, pointerId: 1 })
      fireEvent.pointerMove(area, { clientX: 305, clientY: to, pointerId: 1 })
      fireEvent.pointerUp(area, { clientX: 305, clientY: to, pointerId: 1 })
    }
    swipe(400, 300)
    expect(currentField()).toBe('심리')
    swipe(300, 400)
    expect(currentField()).toBe('철학')
    expect(onScreen()).toBe('fields')
    swipe(300, 400)
    expect(onScreen()).toBe('shelf')
  })

  it('키보드로 학문을 바꾸면 화면 밖에서는 알림으로 전한다', () => {
    render(<App initial={{ screen: 'fields', index: 0 }} />)
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    expect(status()).toHaveTextContent(/^심리, 2권$/)
  })
})
