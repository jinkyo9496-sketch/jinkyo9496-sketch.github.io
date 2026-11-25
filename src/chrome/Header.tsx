import type { ReactNode } from 'react'
import type { TextTone } from '../data/colorMath'
import { Logo } from './Logo'

interface Props {
  /** 로고를 누르면 첫 화면(인트로)으로 */
  onHome?: () => void
  /** 지금 헤더 바탕 위의 글자색(책 페이지에서는 그 책의 글자색). 로고가 이에 맞춰 바뀐다 */
  tone?: TextTone
  /** 한 색 로고를 쓴다(책 페이지) */
  mono?: boolean
  /** 오른쪽 끝에 놓을 것(전체 메뉴 버튼 `menu/MenuToggle`). 헤더의 글자색을 따른다 */
  end?: ReactNode
  /** 오른쪽 끝의 것을 거둔다(인트로: 헤더의 로고와 함께 물러난다). 보이지 않는 동안에는 조작·읽기에서 뺀다 */
  endOff?: boolean
}

/** 헤더: 모든 화면 위에 늘 떠 있다. 왼쪽에 로고, 오른쪽 끝에 전체 메뉴 버튼 */
export function Header({ onHome, tone, mono, end, endOff = false }: Props) {
  return (
    <header className="header">
      <Logo onHome={onHome} tone={tone} mono={mono} />
      {end && (
        <div className="header__end" data-off={endOff ? '' : undefined} inert={endOff} aria-hidden={endOff || undefined}>
          {end}
        </div>
      )}
    </header>
  )
}
