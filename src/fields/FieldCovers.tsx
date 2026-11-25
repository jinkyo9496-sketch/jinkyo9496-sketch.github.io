import type { CSSProperties } from 'react'
import { fieldBooks, type Field } from '../data/fields'

interface Props {
  /** 지금 가리키는 학문 */
  field: Field
  /** 표지를 눌렀다: 그 책의 번호와 누른 버튼(상세 창이 닫힐 때 포커스가 돌아올 자리) */
  onOpen?: (no: number, opener: HTMLElement) => void
}

/**
 * 가리키는 학문의 책을 앞표지 그림으로 나란히 보인다(움직임 없음, 넘치면 가로 스크롤).
 * WebGL로 책을 그릴 수 없거나 폭이 900px 미만일 때의 책 자리다(`fields3d/FieldBooks3D`의 대체).
 * 표지마다 버튼(이름 "N권 제목")이고 누르면 그 책의 상세 창이 열린다. 그림은 장식이라 alt를 비우고,
 * 표지 아래에 번호·제목·저자를 작은 글자로 적는다.
 */
export function FieldCovers({ field, onOpen }: Props) {
  return (
    <ol className="fcovers" aria-label={`${field.name}의 책`}>
      {fieldBooks(field).map((book) => (
        <li key={book.no} className="fcovers__item" data-no={book.no}>
          <button
            type="button"
            className="fcovers__book"
            aria-label={`${book.no}권 ${book.title}`}
            style={{ '--aspect': book.coverAspect } as CSSProperties}
            onClick={(e) => onOpen?.(book.no, e.currentTarget)}
          >
            <span className="fcovers__cover">
              <img src={book.images.front} alt="" width={300} height={Math.round(300 / book.coverAspect)} decoding="async" draggable={false} />
            </span>
            <span className="fcovers__no">{book.no}</span>
            <span className="fcovers__title">{book.title}</span>
            <span className="fcovers__author">{book.author}</span>
          </button>
        </li>
      ))}
    </ol>
  )
}
