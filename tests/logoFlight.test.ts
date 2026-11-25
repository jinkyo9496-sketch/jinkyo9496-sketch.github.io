import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { logoFlightFor, logoFlightStyle } from '../src/intro/logoFlight'

describe('logoFlightFor: 헤더의 작은 로고를 웰컴의 큰 로고 자리에 겹치는 옮김과 배율', () => {
  it('왼쪽 위를 맞추고 폭의 비만큼 키운다', () => {
    // 1440×900쯤: 큰 로고 552px(화면 가운데), 헤더 로고 76px(왼쪽 위)
    const flight = logoFlightFor({ left: 444, top: 300, width: 552 }, { left: 20, top: 17, width: 76 })!
    expect(flight.dx).toBe(424)
    expect(flight.dy).toBe(283)
    expect(flight.scale).toBeCloseTo(552 / 76)
  })

  it('잴 수 없으면(그림이 아직 없거나 jsdom) null: 날지 않고 제자리에서 바뀐다', () => {
    expect(logoFlightFor({ left: 0, top: 0, width: 0 }, { left: 20, top: 17, width: 76 })).toBeNull()
    expect(logoFlightFor({ left: 444, top: 300, width: 552 }, { left: 20, top: 17, width: 0 })).toBeNull()
    expect(logoFlightStyle(null)).toEqual({})
  })

  it('CSS 변수로 넘긴다', () => {
    expect(logoFlightStyle({ dx: 424, dy: 283.26, scale: 7.26316 })).toEqual({
      '--logo-dx': '424px',
      '--logo-dy': '283.3px',
      '--logo-scale': '7.2632',
    })
  })
})

describe('로고가 날아가는 CSS(intro.css)', () => {
  const css = readFileSync(join(__dirname, '../src/intro/intro.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  const rule = (selector: string) => {
    const at = css.indexOf(`${selector} {`)
    return at < 0 ? null : css.slice(at, css.indexOf('}', at))
  }

  it('웰컴에서 헤더 로고는 보이지 않는 채 큰 로고의 자리에 겹쳐 있다', () => {
    expect(rule(".app:has(> .screens[data-screen='intro']) > .header .logo > *")).toMatch(
      /transform:\s*translate\(var\(--logo-dx, 0px\), var\(--logo-dy, 0px\)\) scale\(var\(--logo-scale, 1\)\)/,
    )
    expect(rule(".app:has(> .screens[data-screen='intro']) > .header .logo")).toMatch(/visibility:\s*hidden/)
  })

  it('웰컴 → 신간 소개: 헤더 로고가 바로 보이고 화면 전환과 같은 시간·이징으로 제자리(헤더)로 날아간다', () => {
    const fly = rule(".app:has(> .screens[data-screen='feature'][data-from='intro']) > .header .logo > *")!
    expect(fly).toMatch(/transition:\s*transform var\(--dur-screen\) var\(--ease-shelf\)/)
    expect(rule(".app:has(> .screens[data-screen='feature'][data-from='intro']) > .header .logo")).toMatch(/transition:\s*none/)
    // 큰 로고는 그 순간 거둔다(같은 로고가 두 번 보이지 않게). 캐치프레이즈는 사라진다
    expect(rule(".screens[data-screen='feature'] .intro__logo")).toMatch(/visibility:\s*hidden/)
    expect(rule(".screens[data-screen='feature'] .intro__phrase")).toMatch(/opacity:\s*0/)
  })

  it('신간 소개 → 웰컴: 거꾸로 날아가 닿은 뒤에 큰 로고로 바뀐다', () => {
    const back = rule(".app:has(> .screens[data-screen='intro'][data-from='feature']) > .header .logo > *")!
    expect(back).toMatch(/transition:\s*transform var\(--dur-screen\) var\(--ease-shelf\)/)
    expect(rule(".app:has(> .screens[data-screen='intro'][data-from='feature']) > .header .logo")).toMatch(
      /visibility 0s linear var\(--dur-screen\)/,
    )
    expect(rule(".screens[data-screen='intro'][data-from='feature'] .intro__logo")).toMatch(/visibility 0s linear var\(--dur-screen\)/)
  })

  it('신간 소개에서도 서가의 책 머리가 그대로 비친다(웰컴 자리: data-place)', () => {
    const peeking = rule(".screens[data-place='welcome'] > .screen--shelf")!
    expect(peeking).toMatch(/translate:\s*0 calc\(var\(--peek-shift, 0px\) \* -1\)/)
    expect(peeking).toMatch(/clip-path:\s*inset\(var\(--peek-clip, 0px\) 0 0 0\)/)
    expect(rule(".screens[data-place='welcome'] .stage > .band")).toMatch(/opacity:\s*0/)
  })

  it('신간 소개 화면은 웰컴과 같은 자리에 겹쳐 놓인다(index.css)', () => {
    const index = readFileSync(join(__dirname, '../src/index.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    const at = index.indexOf('.screens > .screen--feature {')
    expect(at).toBeGreaterThan(-1)
    const body = index.slice(at, index.indexOf('}', at))
    expect(body).toMatch(/position:\s*absolute/)
    expect(body).toMatch(/top:\s*0/)
  })
})
