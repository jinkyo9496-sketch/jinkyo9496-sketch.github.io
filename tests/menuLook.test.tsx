import { readFileSync } from 'node:fs'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { contrastRatio, hexToRgb, rgbToHex } from '../src/data/colorMath'
import { MenuToggle } from '../src/menu/Menu'

/**
 * 전체 메뉴의 모양(2026-11-25 편집자 요청): 대괄호 없는 굵은 +, 오른쪽에 붙은 반투명 판, 책 제목 크기의 윗제목,
 * 먹이 살짝 빠진 항목이 포인터·포커스에서 먹이 된다. jsdom은 CSS를 그리지 않으므로 규칙은 CSS의 글을 읽어 확인한다.
 */
const css = readFileSync('src/menu/menu.css', 'utf8').replace(/\r/g, '')
const root = readFileSync('src/index.css', 'utf8')
/** 미디어 쿼리 밖(넓은 화면)의 규칙 */
const wide = css.slice(0, css.indexOf('@media (max-width: 899px)'))
const narrow = css.slice(css.indexOf('@media (max-width: 899px)'))

/** `selector { … }` 블록의 안쪽 글(처음 나오는 것) */
const block = (source: string, selector: string) => {
  const at = source.indexOf(`\n${selector} {`)
  expect(at, `${selector} 규칙이 있다`).toBeGreaterThanOrEqual(0)
  return source.slice(at, source.indexOf('}', at))
}
const px = (text: string, prop: string) => Number(new RegExp(`${prop}: (\\d+(?:\\.\\d+)?)px`).exec(text)?.[1])
const token = (name: string) => new RegExp(`${name}: ([^;]+);`).exec(root)![1].trim()

describe('전체 메뉴 버튼의 모양', () => {
  it('대괄호 없이 +만 있다(`[ ]` 표기의 예외, 편집자 요청 2026-11-25). 이름과 누르는 영역은 그대로다', () => {
    render(<MenuToggle open={false} onToggle={() => {}} />)
    const button = screen.getByRole('button', { name: '전체 메뉴' })
    expect(button.textContent).toBe('')
    expect(button).not.toHaveClass('bracket')
    expect(button.querySelector('.bracket__text')).toBeNull()
    expect(button.querySelector('.menu-toggle__plus')).toHaveAttribute('aria-hidden', 'true')
    const rule = block(css, '.menu-toggle')
    expect(px(rule, 'width')).toBeGreaterThanOrEqual(44)
    expect(px(rule, 'height')).toBeGreaterThanOrEqual(44)
    expect(block(css, '.menu-toggle:focus-visible')).toContain('outline: 2px solid var(--ink)')
  })

  it('+의 선은 2px이다(전에는 1px)', () => {
    expect(px(block(css, '.menu-toggle__plus::before'), 'height')).toBe(2)
    expect(css).toMatch(/\.menu-toggle__plus::after \{\s*top: 0;\s*bottom: 0;\s*left: 7px;\s*width: 2px;/)
  })
})

describe('판의 자리와 바탕', () => {
  it('오른쪽에 붙고 왼쪽 끝까지 닿지 않는다: 폭은 내용에 맞춘 540px까지', () => {
    const rule = block(wide, '.menu')
    expect(rule).toContain('right: 0;')
    expect(rule).not.toMatch(/\n\s*left:/)
    expect(rule).toContain('width: min(540px, 100vw);')
    // 분류 단은 내용(가장 긴 이름 "경제·경영", 유튜브 줄)의 폭이고 서가 단이 바로 옆에 붙는다
    expect(rule).toContain('grid-template-columns: max-content minmax(0, 1fr);')
    // 두 단 사이는 조금 띄운다(40~48px. 편집자 요청 2026-11-25 셋째 다듬기)
    expect(px(rule, 'column-gap')).toBeGreaterThanOrEqual(40)
    expect(px(rule, 'column-gap')).toBeLessThanOrEqual(48)
    // 뒤 화면과의 경계: 왼쪽과 아래에 1px 선
    expect(rule).toContain('border-left: 1px solid var(--rule);')
    expect(rule).toContain('border-bottom: 1px solid var(--rule);')
  })

  it('좁은 화면(900px 미만)에서는 화면 폭을 다 쓴다', () => {
    const rule = block(narrow, '  .menu')
    expect(rule).toContain('width: 100%;')
    expect(rule).toContain('border-left: 0;')
  })

  it('바탕은 반투명 종이색(`--veil`)이고 뒤를 흐린다. 흐림을 모르는 브라우저에서는 더 불투명한 종이색이다', () => {
    const rule = block(wide, '.menu')
    expect(rule).toContain('background: color-mix(in srgb, var(--paper) 94%, transparent);')
    const supports = css.slice(css.indexOf('@supports'))
    expect(supports).toMatch(/@supports \(backdrop-filter: blur\(1px\)\) or \(-webkit-backdrop-filter: blur\(1px\)\)/)
    const glass = block(supports, '  .menu')
    expect(glass).toContain('background: var(--veil);')
    expect(glass).toMatch(/-webkit-backdrop-filter: blur\(\d+px\);/)
    expect(glass).toMatch(/\n\s*backdrop-filter: blur\(\d+px\);/)
  })

  it('색은 토큰만 쓴다(hex·rgb 값이 없다)', () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(css).not.toMatch(/rgba?\(/)
  })
})

describe('책 한 줄 (2026-11-25 편집자 요청)', () => {
  it('도서명 뒤에 위첨자 번호가 붙고, 저자는 줄의 오른쪽 끝에 맞춘다(겹치지 않게 최소 간격을 둔다)', () => {
    const row = block(wide, '.menu__book')
    expect(row).toContain('display: flex;')
    expect(row).not.toContain('grid')
    const author = block(wide, '.menu__book .menu__sub')
    expect(author).toContain('margin-left: auto;')
    expect(px(author, 'padding-left')).toBeGreaterThanOrEqual(8)
    // 번호는 타이틀 띠의 `No.N`처럼 제목의 윗선에 맞춘 작은 글자다
    const no = block(wide, '.menu__no')
    expect(px(no, 'font-size')).toBeLessThan(px(block(wide, '.menu__item'), 'font-size'))
    expect(no).toContain('align-self: flex-start;')
    // 숫자만 남아 조금 키웠다
    expect(px(no, 'font-size')).toBe(10)
  })
})

describe('글자의 크기와 색', () => {
  it('윗제목(분류·서가·미디어)은 책 제목 줄과 같거나 살짝 작고, 굵기로 구분한다', () => {
    const title = block(wide, '.menu__title')
    const item = block(wide, '.menu__item')
    expect(px(title, 'font-size')).toBeLessThanOrEqual(px(item, 'font-size'))
    expect(px(title, 'font-size')).toBeGreaterThanOrEqual(px(item, 'font-size') - 2)
    expect(title).toContain('font-weight: 700;')
  })

  it('항목은 평소에 먹이 살짝 빠진 색(`--ink-soft`)이고, 포인터를 올리거나 포커스가 오면 먹이다(글자색만 바뀐다)', () => {
    expect(block(wide, '.menu__item')).toContain('color: var(--ink-soft);')
    const hover = block(wide, '  .menu__item:hover')
    expect(hover).toContain('color: var(--ink);')
    expect(hover).not.toContain('background')
    expect(block(wide, '.menu__item:focus-visible')).toContain('color: var(--ink);')
    // 지금 학문·지금 책은 먹 + 굵게
    const current = block(wide, '.menu__item[aria-current]')
    expect(current).toContain('color: var(--ink);')
    expect(current).toContain('font-weight: 700;')
    // 판 안에서는 중간 회색(--ink-2)을 쓰지 않는다: 덧붙은 글도 --ink-soft이고 크기로 구분한다
    expect(css).not.toContain('var(--ink-2)')
  })

  it('`--ink-soft`는 종이 위에서 7:1 이상이고, 반투명 판이 검은 화면을 덮은 가장 나쁜 경우에도 4.5:1 이상이다', () => {
    const soft = token('--ink-soft')
    const paper = token('--paper')
    expect(soft).toMatch(/^#[0-9a-f]{6}$/)
    expect(contrastRatio(soft, paper)).toBeGreaterThanOrEqual(7)
    // --veil(종이 82%)이 검은 바탕을 덮었을 때의 색
    const alpha = Number(/--veil: rgba\(252, 252, 251, ([\d.]+)\)/.exec(root)![1])
    const worst = rgbToHex(hexToRgb(paper).map((c) => Math.round(c * alpha)))
    expect(contrastRatio(soft, worst)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(token('--ink'), worst)).toBeGreaterThanOrEqual(7)
  })
})
