import type { Book } from '../data/books'
import { VolumeDial } from './VolumeDial'

interface Props {
  books: readonly Book[]
  currentIndex: number
  /** 다이얼의 선을 눌렀다: 그 권으로(books의 순번) */
  onGo: (index: number) => void
  /** 가려져 있는가(책 페이지가 열려 있는 동안): 포커스·클릭·읽기에서 뺀다 */
  hidden?: boolean
}

/**
 * 서가의 하단 바: 가운데에 권수 다이얼만 있다. 끌지 않아도 모든 책에 닿을 수 있다.
 * 지금 책의 이름은 타이틀 띠와 보이지 않는 제목·알림이 전한다.
 * 아래 화면(학제별 분류)으로 가는 `[ 학제별 분류 ]` 버튼은 없앴다(2026-11-24): 휠·↓·PageDown·세로 쓸기로 간다.
 */
export function BottomBar({ books, currentIndex, onGo, hidden = false }: Props) {
  return (
    <footer className="bar" inert={hidden} aria-hidden={hidden || undefined}>
      <VolumeDial className="bar__dial" books={books} currentIndex={currentIndex} onGo={onGo} />
    </footer>
  )
}
