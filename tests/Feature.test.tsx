import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { affiliations } from '../src/data/affiliations'
import { blurbs } from '../src/data/blurbs'
import { books } from '../src/data/books'
import { contrastRatio } from '../src/data/colorMath'
import { editorNotes } from '../src/data/editorNotes'
import { FEATURE_BOOK_NO, FEATURE_BUBBLES, FEATURE_CLAIM, FEATURE_MEDIA, FEATURE_PITCH, Feature } from '../src/feature/Feature'
import { FEATURE_STEPS, featureCssVars, type FeatureStep } from '../src/feature/timeline'

/** 편집자가 직접 쓴 글: 한 글자도 고치지 않는다 */
const EDITOR_NOTE =
  'LLM이 그럴듯하게 대답한다는 건, 인간이 사고하고 말하는 과정이 이미 밝혀졌다는 뜻일까요? 생각의 탄생이라는 게 도대체 언제 어떻게 일어나는지 비밀이 이미 풀린 걸까요? 이런 이야기에 가슴이 뛰는 사람이라면 분명 재미있게 읽을 겁니다.'

/** 편집자가 준 책 소개 문구(신간 소개 전용): 한 글자도 고치지 않는다 */
const PITCH =
  "'내가 이해 못해도 어쨌든 정답이긴 한' 결과를 내주는 기계와 함께하는 우리의 삶은 앞으로 어떻게 달라지게 될까? 한 권으로 살피는 인공지능 인식론의 최전선."

const play = vi.fn(() => Promise.resolve())
const pause = vi.fn()
beforeEach(() => {
  play.mockClear()
  pause.mockClear()
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(play)
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(pause)
})
afterEach(() => vi.restoreAllMocks())

const setup = (step: FeatureStep = 'video', props: Partial<Parameters<typeof Feature>[0]> = {}) => {
  const onOpenShelf = vi.fn()
  const view = render(<Feature step={step} active onOpenShelf={onOpenShelf} {...props} />)
  const region = screen.getByRole('region', { name: '신간 소개' })
  const part = (selector: string) => region.querySelector<HTMLElement>(selector)!
  return { ...view, onOpenShelf, region, part }
}

describe('Feature: 신간 소개의 글', () => {
  const book = books.find((b) => b.no === 48)!

  it('48권을 소개한다', () => {
    expect(FEATURE_BOOK_NO).toBe(48)
    expect(book.title).toBe('AI는 어떻게 생각하는가')
  })

  it('말풍선 셋과 큰 문구는 편집자가 준 문구와 줄바꿈 그대로다', () => {
    expect(FEATURE_BUBBLES).toEqual([
      ['AI는 어떻게 인간처럼', '이해하고 대답하는 걸까?'],
      ['AI가 말하는 원리를 알면', '생각의 탄생을 알 수 있을까?'],
      ['최전선 AI 연구자들이', '플라톤 철학을 주목하고 있다?'],
    ])
    expect(FEATURE_CLAIM).toEqual(['우리는 생각의 탄생을 목격한', '첫 세대가 될 것이다!'])
    const { region } = setup()
    const bubbles = [...region.querySelectorAll<HTMLElement>('.feature__bubble')]
    expect(bubbles).toHaveLength(3)
    bubbles.forEach((bubble, i) => {
      expect(bubble.tagName).toBe('P')
      // 두 줄이고, 읽을 때는 한 문장이다
      expect([...bubble.querySelectorAll('.feature__line')].map((l) => l.textContent)).toEqual(FEATURE_BUBBLES[i])
      expect(bubble.textContent).toBe(FEATURE_BUBBLES[i].join(' '))
      // 위에서부터 차례로 생겨나는 순서를 CSS에 넘긴다
      expect(bubble.style.getPropertyValue('--i')).toBe(String(i))
    })
    const claim = region.querySelector<HTMLElement>('.feature__claim')!
    expect(claim.tagName).toBe('P')
    expect(claim.textContent).toBe(FEATURE_CLAIM.join(' '))
    expect([...claim.querySelectorAll('.feature__line')]).toHaveLength(2)
  })

  it('도서명은 제목 요소이고(키보드로 왔을 때 포커스를 받는다) 그 옆에 No.48, 아래로 부제·저자·소속이 데이터에서 온다', () => {
    const { region } = setup()
    const title = within(region).getByRole('heading', { level: 1, name: 'AI는 어떻게 생각하는가' })
    expect(title).toHaveClass('feature__title')
    expect(title).toHaveAttribute('tabindex', '-1')
    expect(title.textContent).toBe(book.title)
    const no = region.querySelector('.feature__no')!
    expect(no.tagName).toBe('SUP')
    expect(no.textContent).toBe('No.48')
    // 제목과 번호는 한 묶음이다(번호가 제목의 우상단에 붙는다)
    expect(title.parentElement).toContainElement(no as HTMLElement)
    expect(region.querySelector('.feature__subtitle')!.textContent).toBe(blurbs[48].subtitle)
    expect(blurbs[48].subtitle).toBe('사유하는 기계가 밝혀낸 인간 지성의 기원')
    expect(region.querySelector('.feature__author')!.textContent).toBe('박상민 지음')
    expect(region.querySelector('.feature__affiliation')!.textContent).toBe(affiliations[48])
    expect(affiliations[48]).toBe('의과대학 가정의학과 교수')
  })

  it('저자 아래·편집자의 한 마디 위에 책 소개 문구 한 문단이 있다: 신간 소개 전용 상수에서 읽는다(책 페이지의 blurbs를 고쳐도 따라 바뀌지 않는다)', () => {
    expect(FEATURE_PITCH).toBe(PITCH)
    const { region } = setup()
    const pitch = region.querySelector<HTMLElement>('.feature__pitch')!
    expect(pitch.tagName).toBe('P')
    expect(pitch.textContent).toBe(PITCH)
    const meta = region.querySelector('.feature__meta')!
    const note = region.querySelector('.feature__note')!
    expect(meta.compareDocumentPosition(pitch) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(pitch.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('편집자의 한 마디는 편집자가 쓴 글 그대로이고 책 페이지와 같은 데이터(editorNotes[48])에서 읽는다', () => {
    expect(editorNotes[48].join(' ')).toBe(EDITOR_NOTE)
    const { region } = setup()
    const note = region.querySelector<HTMLElement>('.feature__note')!
    expect(within(note).getByRole('heading', { level: 2, name: '편집자의 한 마디' })).toBeInTheDocument()
    expect(note.querySelector('.feature__note-text')!.textContent).toBe(EDITOR_NOTE)
  })

  it('읽는 순서: 말풍선 셋 → 큰 문구 → 도서명 → 부제 → 저자 → 소개 문구 → 한 마디. 어느 단계에서든 글은 한 번씩만 있다', () => {
    for (const step of FEATURE_STEPS) {
      const { region, unmount } = setup(step)
      const text = region.textContent!
      const order = [
        ...FEATURE_BUBBLES.map((b) => b.join(' ')),
        FEATURE_CLAIM.join(' '),
        book.title,
        'No.48',
        blurbs[48].subtitle,
        '박상민 지음',
        affiliations[48],
        PITCH,
        '편집자의 한 마디',
        EDITOR_NOTE,
      ]
      let from = 0
      for (const piece of order) {
        const at = text.indexOf(piece, from)
        expect(at, `${step}: ${piece}`).toBeGreaterThanOrEqual(from)
        expect(text.indexOf(piece, at + piece.length), `${step}: ${piece} 두 번`).toBe(-1)
        from = at + piece.length
      }
      // 사라진 글도 읽기 도구에서 숨기지 않는다(DOM에 한 번 있고 그대로 읽힌다)
      expect(region.querySelector('.feature__bubbles')).not.toHaveAttribute('aria-hidden')
      expect(region.querySelector('.feature__claim')).not.toHaveAttribute('aria-hidden')
      unmount()
    }
  })

  it('목업 그림은 준비해 둔 파일이고 크기를 적어 둔다(자리가 튀지 않게). 이름은 제목이 이미 읽으므로 비운다', () => {
    const { region } = setup()
    const mockup = region.querySelector<HTMLImageElement>('img.feature__mockup')!
    expect(FEATURE_MEDIA.mockup).toBe('/feature/48_mockup.webp')
    expect(mockup).toHaveAttribute('src', '/feature/48_mockup.webp')
    expect(mockup).toHaveAttribute('width', '816')
    expect(mockup).toHaveAttribute('height', '1200')
    expect(mockup).toHaveAttribute('alt', '')
  })
})

describe('Feature: 단계마다의 모습', () => {
  const states = (step: FeatureStep) => {
    const { part, region, unmount } = setup(step)
    const result = {
      step: region.dataset.step,
      bubbles: part('.feature__bubbles').dataset.state,
      claim: part('.feature__claim').dataset.state,
      mockup: part('.feature__book').hasAttribute('data-on'),
      info: part('.feature__info').hasAttribute('data-on'),
      pitch: part('.feature__pitch').hasAttribute('data-on'),
      note: part('.feature__note').hasAttribute('data-on'),
      video: part('.feature__video').hasAttribute('data-on'),
    }
    unmount()
    return result
  }

  it('idle: 아직 아무것도 없다', () => {
    expect(states('idle')).toEqual({
      step: 'idle',
      bubbles: 'off',
      claim: 'off',
      mockup: false,
      info: false,
      pitch: false,
      note: false,
      video: false,
    })
  })

  it('bubbles: 말풍선이 생겨난다', () => {
    expect(states('bubbles')).toMatchObject({ bubbles: 'in', claim: 'off', mockup: false })
  })

  it('claim: 큰 문구가 올라오고 말풍선은 위로 밀려 나간다', () => {
    expect(states('claim')).toMatchObject({ bubbles: 'out', claim: 'in', mockup: false })
  })

  it('mockup: 큰 문구가 물러나고 목업이 혼자 가운데 뜬다', () => {
    expect(states('mockup')).toMatchObject({ bubbles: 'out', claim: 'out', mockup: true, info: false, note: false, video: false })
  })

  it('info → pitch → note → video: 책 정보, 소개 문구, 편집자의 한 마디, 영상이 차례로 붙는다', () => {
    expect(states('info')).toMatchObject({ mockup: true, info: true, pitch: false, note: false, video: false })
    expect(states('pitch')).toMatchObject({ mockup: true, info: true, pitch: true, note: false, video: false })
    expect(states('note')).toMatchObject({ mockup: true, info: true, pitch: true, note: true, video: false })
    expect(states('video')).toEqual({
      step: 'video',
      bubbles: 'out',
      claim: 'out',
      mockup: true,
      info: true,
      pitch: true,
      note: true,
      video: true,
    })
  })

  it('서가에서 올라왔을 때(instant)는 전환 없이 그 모습으로 놓는다', () => {
    const first = setup('video', { instant: true })
    expect(first.region).toHaveAttribute('data-instant')
    first.unmount()
    expect(setup('video').region).not.toHaveAttribute('data-instant')
  })

  it('박자는 timeline에서 받아 CSS 변수로 넣는다', () => {
    const { region } = setup()
    for (const [name, value] of Object.entries(featureCssVars())) expect(region.style.getPropertyValue(name)).toBe(value)
  })

  it('아래에 비치는 책 자리를 누르면 서가로 간다(장식이라 읽기 도구에는 없다)', () => {
    const { part, onOpenShelf } = setup()
    const peek = part('.feature__peek')
    expect(peek).toHaveAttribute('aria-hidden', 'true')
    expect(peek).toBeEmptyDOMElement()
    fireEvent.click(peek)
    expect(onOpenShelf).toHaveBeenCalledTimes(1)
  })
})

describe('Feature: 영상', () => {
  const video = (region: HTMLElement) => region.querySelector<HTMLVideoElement>('video')

  it('영상 자리가 나타나기 전에는 영상이 없다(받지 않는다)', () => {
    for (const step of FEATURE_STEPS.filter((s) => s !== 'video')) {
      const { region, unmount } = setup(step)
      expect(video(region), step).toBeNull()
      expect(region.innerHTML).not.toContain('48_video')
      expect(region.innerHTML).not.toContain('48_poster')
      unmount()
    }
    expect(play).not.toHaveBeenCalled()
  })

  it('신간 소개에 들어온 적이 없으면(다른 화면에 있다) 마지막 단계여도 영상이 없다', () => {
    const { region } = setup('video', { active: false })
    expect(video(region)).toBeNull()
  })

  it('영상 단계가 되면 소리 없이 재생한다: muted · playsInline · controls · preload="metadata" · 첫 장면 그림 · 읽히는 이름', () => {
    const { region, rerender } = setup('note')
    rerender(<Feature step="video" active onOpenShelf={() => {}} />)
    const v = video(region)!
    expect(FEATURE_MEDIA).toMatchObject({ video: '/feature/48_video.mp4', poster: '/feature/48_poster.jpg' })
    expect(v).toHaveAttribute('src', '/feature/48_video.mp4')
    expect(v).toHaveAttribute('poster', '/feature/48_poster.jpg')
    expect(v).toHaveAttribute('preload', 'metadata')
    expect(v).toHaveAttribute('controls')
    expect(v).toHaveAttribute('playsinline')
    expect(v.muted).toBe(true)
    expect(v).toHaveAttribute('aria-label', 'AI는 어떻게 생각하는가 소개 영상')
    expect(v).not.toHaveAttribute('loop')
    expect(play).toHaveBeenCalledTimes(1)
  })

  it('신간 소개를 떠나면 멈추고, 돌아오면 다시 재생한다(영상은 그대로 남아 다시 받지 않는다)', () => {
    const { region, rerender } = setup('video')
    const first = video(region)
    expect(play).toHaveBeenCalledTimes(1)
    rerender(<Feature step="video" active={false} onOpenShelf={() => {}} />)
    expect(pause).toHaveBeenCalled()
    expect(video(region)).toBe(first)
    rerender(<Feature step="video" active onOpenShelf={() => {}} />)
    expect(play).toHaveBeenCalledTimes(2)
    // 웰컴으로 올라가 처음으로 돌아갔을 때도 멈춘다
    pause.mockClear()
    rerender(<Feature step="idle" active={false} onOpenShelf={() => {}} />)
    expect(pause).toHaveBeenCalled()
  })

  it('영상 자리가 닫혀 있는 동안에는 남아 있는 영상에 포커스가 가지 않는다(웰컴에 갔다 다시 내려와 처음부터 도는 동안)', () => {
    const { region, rerender } = setup('video')
    const slot = region.querySelector<HTMLElement>('.feature__video')!
    expect(slot).not.toHaveAttribute('inert')
    // 웰컴으로 올라갔다 다시 내려왔다: 영상은 DOM에 남아 있지만 자리는 아직 닫혀 있다
    rerender(<Feature step="idle" active={false} onOpenShelf={() => {}} />)
    rerender(<Feature step="bubbles" active onOpenShelf={() => {}} />)
    expect(video(region)).not.toBeNull()
    expect(slot).toHaveAttribute('inert')
    // 영상 단계에 닿으면 다시 쓸 수 있다
    rerender(<Feature step="video" active onOpenShelf={() => {}} />)
    expect(slot).not.toHaveAttribute('inert')
  })

  it('소리를 켠 채 돌아와 브라우저가 재생을 막으면 소리를 끄고 다시 재생한다', async () => {
    const { region, rerender } = setup('video')
    const v = video(region)!
    rerender(<Feature step="video" active={false} onOpenShelf={() => {}} />)
    v.muted = false
    play.mockImplementationOnce(() => Promise.reject(new DOMException('막힘', 'NotAllowedError')))
    rerender(<Feature step="video" active onOpenShelf={() => {}} />)
    await vi.waitFor(() => expect(play).toHaveBeenCalledTimes(3))
    expect(v.muted).toBe(true)
  })
})

describe('Feature: CSS와 디자인 토큰', () => {
  const read = (path: string) => readFileSync(join(__dirname, path), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  const css = read('../src/feature/feature.css')
  const index = read('../src/index.css')
  const rule = (selector: string) => {
    const at = css.indexOf(`${selector} {`)
    return at < 0 ? null : css.slice(at, css.indexOf('}', at))
  }
  const token = (name: string) => index.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`))?.[1]

  it('컴포넌트에 색 값을 직접 쓰지 않는다(토큰만)', () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(css).not.toMatch(/rgba?\(/)
    expect(css).not.toMatch(/italic/)
  })

  it('말풍선: 새 토큰 --bubble(초록) 바탕의 둥근 타원에 종이색 굵은 글자(편집자가 요청한 예외)', () => {
    const bubble = rule('.feature__bubble')!
    expect(bubble).toMatch(/background:\s*var\(--bubble\)/)
    expect(bubble).toMatch(/color:\s*var\(--paper\)/)
    expect(bubble).toMatch(/border-radius:\s*50%/)
    expect(bubble).toMatch(/font-weight:\s*(600|700)/)
    // 큰 글자(24px 이상)
    const size = bubble.match(/font-size:\s*clamp\((\d+)px/)
    expect(Number(size?.[1])).toBeGreaterThanOrEqual(24)
  })

  it('--bubble 위의 종이색 글자는 큰 글자 기준 대비 3:1 이상이다', () => {
    const bubble = token('--bubble')
    const paper = token('--paper')
    expect(bubble).toBeDefined()
    expect(contrastRatio(bubble!, paper!)).toBeGreaterThanOrEqual(3)
  })

  it('움직임의 시간은 timeline이 넣은 변수로, 이징은 --ease-shelf로 받는다. reduced-motion으로 끄지 않는다', () => {
    for (const name of Object.keys(featureCssVars())) expect(css, name).toContain(`var(${name}`)
    expect(css).toContain('var(--ease-shelf)')
    expect(css).not.toMatch(/prefers-reduced-motion/)
  })

  it('서가에서 올라왔을 때는 전환을 끈다', () => {
    expect(css).toMatch(/\.feature\[data-instant\][^{]*\{[^}]*transition:\s*none/)
  })

  it('내용 자리는 헤더 아래부터 비치는 책 위까지다(웰컴과 같은 자리)', () => {
    expect(rule('.feature')).toMatch(/padding:\s*var\(--header-h\) var\(--page-pad\) var\(--peek-zone, 0px\)/)
    expect(rule('.feature__peek')).toMatch(/height:\s*var\(--peek-zone, 0px\)/)
  })

  it('제목은 포커스를 받아도 테두리를 그리지 않는다(누르는 것이 아니다)', () => {
    expect(rule('.feature__title:focus')).toMatch(/outline:\s*none/)
  })
})
