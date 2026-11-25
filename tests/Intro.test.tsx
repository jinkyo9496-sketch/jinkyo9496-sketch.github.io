import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Intro, CATCHPHRASE } from '../src/intro/Intro'

describe('Intro: 큰 로고와 캐치프레이즈', () => {
  it('화면 제목(h1)이 큰 로고 그림이고 이름은 서가명강이다', () => {
    render(<Intro onOpenShelf={() => {}} />)
    const heading = screen.getByRole('heading', { level: 1, name: '서가명강' })
    const logo = heading.querySelector('img')
    expect(logo).not.toBeNull()
    expect(logo).toHaveAttribute('src', '/logo-ink.png')
    expect(logo).toHaveAttribute('alt', '서가명강')
    // 그림이 오기 전에도 자리가 튀지 않게 원래 크기를 적어 둔다
    expect(logo).toHaveAttribute('width', '552')
    expect(logo).toHaveAttribute('height', '159')
  })

  it('로고 아래에 캐치프레이즈가 한 문장으로 읽힌다', () => {
    render(<Intro onOpenShelf={() => {}} />)
    expect(CATCHPHRASE).toBe('서울대 가지 않아도 들을 수 있는 명강의')
    const phrase = screen.getByText((_, el) => el?.classList.contains('intro__phrase') === true)
    expect(phrase.tagName).toBe('P')
    expect(phrase).toHaveTextContent(CATCHPHRASE)
    expect(phrase.textContent).toBe(CATCHPHRASE)
  })

  it('서 · 가 · 명 · 강 네 글자 위에만 점을 찍는다(이 순서로)', () => {
    const { container } = render(<Intro onOpenShelf={() => {}} />)
    const dots = [...container.querySelectorAll('.intro__phrase .intro__dot')]
    expect(dots.map((d) => d.textContent)).toEqual(['서', '가', '명', '강'])
    // 점이 차례로 찍히는 순서를 CSS에 넘긴다
    expect(dots.map((d) => (d as HTMLElement).style.getPropertyValue('--i'))).toEqual(['0', '1', '2', '3'])
    // "가지"의 가, "명강의"의 명·강이다(다른 '가'는 없다)
    const text = container.querySelector('.intro__phrase')!.textContent!
    expect(text.indexOf('가')).toBe(4)
  })

  it('점을 찍는 글자는 굵어지기 전의 가는 글자를 겹쳐 그릴 수 있게 제 글자를 CSS에 넘긴다', () => {
    const { container } = render(<Intro onOpenShelf={() => {}} />)
    const dots = [...container.querySelectorAll<HTMLElement>('.intro__phrase .intro__dot')]
    // 점이 떨어질 때 가는 글자가 굵은 글자로 채워진다(`intro.css`의 `.intro__dot::after`)
    expect(dots.map((d) => d.dataset.text)).toEqual(['서', '가', '명', '강'])
    // 겹쳐 그리는 글자는 CSS의 것이라 읽히는 글은 그대로다
    expect(container.querySelector('.intro__phrase')!.textContent).toBe(CATCHPHRASE)
  })

  it('서가 보기 버튼은 남아 있고(키보드·읽기 도구용) 서가를 연다', async () => {
    const onOpenShelf = vi.fn()
    render(<Intro onOpenShelf={onOpenShelf} />)
    const enter = screen.getByRole('button', { name: '서가 보기' })
    expect(enter).toHaveClass('intro__enter')
    expect(enter).toHaveTextContent('[ 서가 보기 ]')
    await userEvent.click(enter)
    expect(onOpenShelf).toHaveBeenCalledTimes(1)
    expect(onOpenShelf).toHaveBeenLastCalledWith('button')
  })

  it('아래에 비치는 책 자리를 누르면 서가를 연다(장식이라 읽기 도구에는 없다)', () => {
    const onOpenShelf = vi.fn()
    const { container } = render(<Intro onOpenShelf={onOpenShelf} />)
    const peek = container.querySelector<HTMLElement>('.intro__peek')!
    expect(peek).not.toBeNull()
    expect(peek).toHaveAttribute('aria-hidden', 'true')
    expect(peek).toBeEmptyDOMElement()
    fireEvent.click(peek)
    expect(onOpenShelf).toHaveBeenCalledTimes(1)
    // 마우스로 눌렀다: 포커스를 옮기지 않게 구별해 알린다
    expect(onOpenShelf).toHaveBeenLastCalledWith('peek')
    // 버튼은 하나뿐이다
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })
})

describe('Intro: 등장 애니메이션의 CSS', () => {
  const css = readFileSync(join(__dirname, '../src/intro/intro.css'), 'utf8')
  /** 선택자 하나의 선언 묶음(주석 제외) */
  const rule = (selector: string) => {
    const plain = css.replace(/\/\*[\s\S]*?\*\//g, '')
    const at = plain.indexOf(`${selector} {`)
    return at < 0 ? null : plain.slice(at, plain.indexOf('}', at))
  }

  it('서가 보기 버튼은 평소에 보이지 않고 키보드 포커스가 왔을 때만 보인다(등장 애니메이션은 없다)', () => {
    // 2026-11-24: 화면에서 지우되 키보드·읽기 도구의 길은 남긴다(건너뛰기 링크 방식).
    // 움직임(animation)으로 숨기면 포커스가 떠날 때 처음부터 다시 돌아 버튼이 한참 사라진다: 상태로만 숨긴다
    const hidden = rule('.intro__enter:not(:focus-visible)')
    expect(hidden).toMatch(/opacity:\s*0/)
    expect(hidden).toMatch(/pointer-events:\s*none/)
    expect(css.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/\.intro__enter[^{]*\{[^}]*animation/)
  })

  it('인트로에서는 헤더 아래의 선을 거둔다(작은 로고와 같은 박자 300ms)', () => {
    expect(rule(".app:has(> .screens[data-screen='intro']) > .header::after")).toMatch(/opacity:\s*0/)
    expect(rule('.app > .header::after')).toMatch(/transition:\s*opacity 300ms linear/)
  })

  it('웰컴 자리(인트로·신간 소개)일 때 서가 화면을 위로 당겨 책 머리만 비치게 한다(화면 전환과 같은 시간·이징)', () => {
    const peeking = rule(".screens[data-place='welcome'] > .screen--shelf")!
    expect(peeking).toMatch(/translate:\s*0 calc\(var\(--peek-shift, 0px\) \* -1\)/)
    // 서가 칸의 위(타이틀 띠·헤더 자리)는 잘라 낸다
    expect(peeking).toMatch(/clip-path:\s*inset\(var\(--peek-clip, 0px\) 0 0 0\)/)
    const rest = rule('.screens > .screen--shelf')!
    expect(rest).toMatch(/translate var\(--dur-screen\) var\(--ease-shelf\)/)
    expect(rest).toMatch(/clip-path var\(--dur-screen\) var\(--ease-shelf\)/)
  })

  it('타이틀 띠는 웰컴 자리에서 감춘다(자른 선이 큰 제목을 반쯤 자른 채 지나가지 않게)', () => {
    expect(rule(".screens[data-place='welcome'] .stage > .band")).toMatch(/opacity:\s*0/)
    // 서가로 내려갈 때는 자름이 풀릴 무렵 나타난다
    const index = readFileSync(join(__dirname, '../src/index.css'), 'utf8')
    expect(index).toMatch(/opacity 320ms linear 240ms/)
  })

  it('비치는 책은 로고 → 캐치프레이즈 → 점이 끝날 무렵 한 번 올라온다', () => {
    expect(rule('.screens > .screen--shelf')).toMatch(/animation:\s*intro-peek 760ms var\(--ease-shelf\) 1900ms backwards/)
  })
})
