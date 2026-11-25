import { useLayoutEffect, useRef, type CSSProperties, type HTMLAttributes } from 'react'
import type { Book } from '../data/books'

type Props = Omit<HTMLAttributes<HTMLElement>, 'children' | 'aria-label'> & {
  books: readonly Book[]
  currentIndex: number
  /** 선을 눌렀다: 그 권으로(books의 순번). 지금 책의 선은 부르지 않는다 */
  onGo: (index: number) => void
}

/**
 * 권수 다이얼: 권마다 세로선 하나, 모두 같은 크기다. 지금 책의 선은 늘 다이얼의 가운데, 뒤집힌 삼각형 포인터 아래에 있고
 * 책이 바뀌면 선의 줄(`.dial__track`)이 좌우로 미끄러진다(1권이면 선이 오른쪽에만, 마지막 권이면 왼쪽에만 있다).
 * 선 하나가 버튼이고 누르면 그 권으로 간다. 서가의 하단 바와 책 페이지가 함께 쓴다.
 * 탭으로는 지금 책의 선 하나만 거친다(권 이동은 화살표 키로도 된다). 포커스가 다이얼에 있을 때 책이 바뀌면 포커스도
 * 새 지금 책의 선으로 옮긴다(옛 선에 남으면 줄과 함께 미끄러져 다이얼 밖으로 잘린다).
 * 여기서는 지금 책의 순번과 권수만 넘기고(`--dial-index`·`--dial-count`) 자리는 CSS가 계산한다(chrome.css의 .dial).
 * 색(`--dial-line`·`--dial-pointer`)과 놓이는 자리·최대 폭(`--dial-max`)은 쓰는 쪽이 정한다.
 */
export function VolumeDial({ books, currentIndex, onGo, className, style, ...rest }: Props) {
  const nav = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    const root = nav.current
    const focused = document.activeElement
    if (!root || !focused || !root.contains(focused)) return
    const current = root.querySelector<HTMLElement>('.dial__tick[data-current]')
    if (current && current !== focused) current.focus({ preventScroll: true })
  }, [currentIndex])

  const vars = { ...style, '--dial-index': currentIndex, '--dial-count': books.length } as CSSProperties
  return (
    <nav ref={nav} className={className ? `dial ${className}` : 'dial'} aria-label="권 이동" style={vars} {...rest}>
      <span className="dial__pointer" aria-hidden="true" />
      <div className="dial__track">
        {books.map((book, i) => {
          const current = i === currentIndex
          const name = `${book.no}권 ${book.title}`
          return (
            <button
              key={book.no}
              type="button"
              className="dial__tick"
              aria-label={name}
              title={name}
              aria-current={current || undefined}
              data-current={current || undefined}
              tabIndex={current ? 0 : -1}
              onClick={current ? undefined : () => onGo(i)}
            />
          )
        })}
      </div>
    </nav>
  )
}
