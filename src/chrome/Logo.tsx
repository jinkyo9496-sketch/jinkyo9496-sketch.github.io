import type { MouseEvent } from 'react'
import type { TextTone } from '../data/colorMath'
import { LOGO_ALT, logoSrc, type LogoSources } from './logoSrc'

interface Props {
  src?: LogoSources | string | null
  /** 지금 바탕 위의 글자색. 로고가 한 벌이면 여기에 맞는 쪽을 보인다(기본 'ink': 밝은 바탕) */
  tone?: TextTone
  /** 한 색 로고를 쓴다(책 페이지). 로고에 한 색 그림이 없으면 두 색 로고 그대로 */
  mono?: boolean
  /** 주어지면 보통의 클릭은 페이지를 새로 받지 않고 이것을 부른다(첫 화면으로). 새 탭 열기 등은 그대로 둔다 */
  onHome?: () => void
}

const TONES: readonly TextTone[] = ['ink', 'paper']

/** 겹쳐 둘 그림들: 두 색 로고 둘, 한 색 로고가 있으면 둘 더. key는 `data-for`·`data-show`에 쓰는 이름 */
function variantsOf(src: LogoSources): { key: string; src: string }[] {
  const two = TONES.map((t) => ({ key: t as string, src: src[t] }))
  const mono = src.mono
  return mono ? [...two, ...TONES.map((t) => ({ key: `${t}-mono`, src: mono[t] }))] : two
}

/**
 * 헤더 워드마크. 로고 이미지가 있으면 이미지, 없으면 글자. 누르면 첫 화면(인트로)으로 간다.
 * 로고가 한 벌이면 모두 겹쳐 두고 보이는 것만 바꾼다(바탕색 전환과 함께 스며든다. `chrome.css`).
 * 이름(alt)은 보이는 그림에만 준다.
 */
export function Logo({ src = logoSrc, tone = 'ink', mono = false, onHome }: Props) {
  const pair = src !== null && typeof src !== 'string' ? src : null
  const show = mono && pair?.mono ? `${tone}-mono` : tone
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (!onHome || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    onHome()
  }
  return (
    <a className="logo" href="/" data-tone={tone} data-show={show} onClick={onClick}>
      {pair ? (
        <span className="logo__pair">
          {variantsOf(pair).map((v) => (
            <img
              key={v.key}
              className="logo__img"
              data-for={v.key}
              src={v.src}
              alt={v.key === show ? LOGO_ALT : ''}
              aria-hidden={v.key === show ? undefined : true}
            />
          ))}
        </span>
      ) : typeof src === 'string' ? (
        <img className="logo__img" src={src} alt={LOGO_ALT} />
      ) : (
        LOGO_ALT
      )}
    </a>
  )
}
