import type { CSSProperties } from 'react'
import { BracketButton } from '../chrome/BracketButton'
import { LOGO_ALT, logoSrc } from '../chrome/logoSrc'
import './intro.css'

interface Props {
  /**
   * 서가로 내려간다: 키보드로 `[ 서가 보기 ]`를 눌렀거나(`'button'`: 포커스가 서가의 가운데 책으로 간다),
   * 아래에 비치는 책 자리를 마우스로 눌렀다(`'peek'`: 휠처럼 포커스는 그대로 둔다)
   */
  onOpenShelf: (from: 'button' | 'peek') => void
}

/** 시리즈의 캐치프레이즈. 서 · 가 · 명 · 강 네 글자 위에 점을 찍어 시리즈 이름을 읽어 낸다 */
export const CATCHPHRASE = '서울대 가지 않아도 들을 수 있는 명강의'

/** 캐치프레이즈를 조각으로: 점을 찍는 글자(`dot`)와 그 사이의 글 */
const PHRASE: readonly { text: string; dot?: true }[] = [
  { text: '서', dot: true },
  { text: '울대 ' },
  { text: '가', dot: true },
  { text: '지 않아도 들을 수 있는 ' },
  { text: '명', dot: true },
  { text: '강', dot: true },
  { text: '의' },
]

/** 인트로의 큰 로고: 밝은 바탕용 두 색 로고. 로고가 한 벌이 아니면 그 그림, 없으면 글자 */
const BIG_LOGO = logoSrc === null ? null : typeof logoSrc === 'string' ? logoSrc : logoSrc.ink
/** `public/logo-ink.png`의 크기(그림이 오기 전에도 자리가 튀지 않게 적어 둔다) */
const BIG_LOGO_SIZE = { width: 552, height: 159 }

/**
 * 인트로 화면(서가 위의 첫 화면): 큰 로고와 그 아래의 캐치프레이즈가 한 묶음(로고의 폭에 맞춘 한 줄).
 * 캐치프레이즈의 점은 글자 위에 놓는 글꼴의 점 `•`이다(`.intro__dot::before`). 페이지가 처음 뜰 때 한 번,
 * 로고 → 캐치프레이즈 → 점(서 → 가 → 명 → 강) 순서로 등장한다(`intro.css`).
 * 화면 맨 아래에는 서가의 책 머리가 비친다(2026-11-24): 이 화면이 그리는 것이 아니라 서가 화면을 위로 당겨 놓은 것이다
 * (`intro.css`, 치수는 `peek.ts`). 아래에 무언가 있다는 신호는 그것뿐이다(화살표·글자 없음).
 * 휠·키보드·쓸기로 서가로 내려가는 것은 App이 맡는다. 여기에는 같은 일을 하는 것 둘을 둔다:
 * - `.intro__peek`: 비치는 책 자리를 덮는 보이지 않는 판. 마우스로 누르면 서가로 내려간다(장식이라 읽기 도구에는 없다.
 *   그 위의 서가 화면은 `inert`라 누름이 이 판으로 내려온다)
 * - `[ 서가 보기 ]`: 평소에는 보이지 않고 키보드 포커스가 왔을 때만 보인다(건너뛰기 링크 방식). 키보드·읽기 도구의 길이고,
 *   로고를 눌러 인트로에 왔을 때 포커스가 오는 곳이다
 */
export function Intro({ onOpenShelf }: Props) {
  let dots = 0
  return (
    <section className="intro" aria-labelledby="intro-title">
      <div className="intro__content">
        <div className="intro__lockup">
          <h1 id="intro-title" className="intro__logo">
            {BIG_LOGO ? <img src={BIG_LOGO} alt={LOGO_ALT} {...BIG_LOGO_SIZE} /> : LOGO_ALT}
          </h1>
          <p className="intro__phrase">
            {PHRASE.map((part, i) =>
              part.dot ? (
                <span key={i} className="intro__dot" data-text={part.text} style={{ '--i': dots++ } as CSSProperties}>
                  {part.text}
                </span>
              ) : (
                part.text
              ),
            )}
          </p>
        </div>
      </div>
      <BracketButton className="intro__enter" onClick={() => onOpenShelf('button')}>
        서가 보기
      </BracketButton>
      <div className="intro__peek" aria-hidden="true" onClick={() => onOpenShelf('peek')} />
    </section>
  )
}
