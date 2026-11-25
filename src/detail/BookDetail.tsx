import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { BracketButton, BracketLink } from '../chrome/BracketButton'
import { blurbs as allBlurbs, type Blurb } from '../data/blurbs'
import { aladinUrl, type Book } from '../data/books'
import { play } from '../sound/play'
import './detail.css'

interface Props {
  /** 열림 여부는 부모가 가진다. 닫힐 때(닫기·Esc·바깥 클릭) onClose로 알린다 */
  open: boolean
  onClose: () => void
  books: readonly Book[]
  currentIndex: number
  onPrev: () => void
  onNext: () => void
  /** 권별 부제·소개. 없는 권은 그 자리를 비운다. 기본값은 `data/blurbs.ts` */
  blurbs?: Readonly<Record<number, Blurb>>
}

/** 'YYYY-MM-DD' → '2025년 9월 15일' */
export function formatPubDate(pubDate: string) {
  const [y, m, d] = pubDate.split('-').map(Number)
  return `${y}년 ${m}월 ${d}일`
}

/** 표지 그림과 `[ 앞표지 ] [ 뒤표지 ]` 전환. 처음은 앞표지. */
function Cover({ book }: { book: Book }) {
  const [side, setSide] = useState<'front' | 'back'>('front')
  /** 보이는 면을 바꾼다. 실제로 바뀔 때만 소리 자리 `coverFlip`을 부른다(2026-11-25 효과음) */
  const turnTo = (next: 'front' | 'back') => {
    if (next !== side) play('coverFlip')
    setSide(next)
  }
  return (
    <>
      {/* 틀은 앞표지 비율로 고정하고 그림은 잘리지 않게 담는다 */}
      <div className="detail__cover" style={{ '--aspect': book.coverAspect } as CSSProperties}>
        <img
          key={side}
          src={book.images[side]}
          alt={`${book.title} ${side === 'front' ? '앞표지' : '뒤표지'}`}
          width={500}
          height={Math.round(500 / book.coverAspect)}
          decoding="async"
          draggable={false}
        />
      </div>
      <div className="detail__sides" role="group" aria-label="표지 면">
        <BracketButton aria-pressed={side === 'front'} onClick={() => turnTo('front')}>
          앞표지
        </BracketButton>
        <BracketButton aria-pressed={side === 'back'} onClick={() => turnTo('back')}>
          뒤표지
        </BracketButton>
      </div>
    </>
  )
}

/**
 * 상세: 현재 책의 표지(앞·뒤)와 서지, 소개, 구매 링크. 네이티브 `<dialog>` 모달.
 * 안에서 이전/다음(버튼, ←/→)으로 옆 책으로 넘어가도 닫히지 않고, 뒤의 서가가 같은 책을 따라온다.
 *
 * ←/→ 키: 모달이 열려 있는 동안 서가의 window 리스너는 스스로 물러나고(`useShelfGestures`의
 * `isModalOpen`), 이 dialog의 onKeyDown 하나만 처리한다. 그래서 키 한 번에 정확히 한 권이다.
 */
export function BookDetail({
  open,
  onClose,
  books,
  currentIndex,
  onPrev,
  onNext,
  blurbs = allBlurbs,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const book = books[currentIndex]
  const blurb = blurbs[book.no]
  const atFirst = currentIndex <= 0
  const atLast = currentIndex >= books.length - 1

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  // 책이 바뀌면 본문을 맨 위에서부터 보여 준다
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0
  }, [book.no])

  // 상세 안에서 책을 넘기면 포커스는 그대로라 아무것도 읽히지 않는다. 바뀐 책을 한 번 알린다.
  // (열 때는 dialog의 이름으로 제목이 읽히므로 비워 둔다. 모달 밖의 알림은 읽히지 않는다.)
  const bookLabel = `${book.no}권 ${book.title}`
  const [announcement, setAnnouncement] = useState('')
  const shown = useRef<string | null>(null)
  useEffect(() => {
    if (!open) {
      shown.current = null
      setAnnouncement('')
      return
    }
    if (shown.current !== null && shown.current !== bookLabel) setAnnouncement(bookLabel)
    shown.current = bookLabel
  }, [open, bookLabel])

  const onKeyDown = (e: KeyboardEvent<HTMLDialogElement>) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    if (e.key === 'ArrowLeft') onPrev()
    else onNext()
  }

  return (
    <dialog
      ref={dialogRef}
      className="detail"
      aria-labelledby="detail-title"
      onKeyDown={onKeyDown}
      onClose={onClose}
      // 배경(::backdrop)을 누르면 대상이 dialog 자신이다. 안쪽 내용은 패널이 받는다.
      onClick={(e) => {
        if (e.target === e.currentTarget) e.currentTarget.close()
      }}
    >
      {open && (
        <div className="detail__panel">
          <div className="sr-only" role="status" aria-atomic="true">
            {announcement}
          </div>
          <div className="detail__head">
            <nav className="detail__nav" aria-label="책 이동">
              {/* 끝에서는 disabled 대신 aria-disabled: 포커스가 버튼에 남는다 */}
              <BracketButton aria-disabled={atFirst || undefined} onClick={atFirst ? undefined : onPrev}>
                이전
              </BracketButton>
              <span className="detail__position">
                {currentIndex + 1} / {books.length}
              </span>
              <BracketButton aria-disabled={atLast || undefined} onClick={atLast ? undefined : onNext}>
                다음
              </BracketButton>
            </nav>
            <BracketButton onClick={() => dialogRef.current?.close()}>닫기</BracketButton>
          </div>

          <div ref={bodyRef} className="detail__body">
            {/* key: 책이 바뀌면 새로 만들어져 앞표지로 돌아간다 */}
            <Cover key={book.no} book={book} />

            <div className="detail__text">
              <p className="detail__series">서가명강 {book.no}</p>
              <h2 id="detail-title" className="detail__title">
                {book.title}
              </h2>
              {blurb?.subtitle && <p className="detail__subtitle">{blurb.subtitle}</p>}
              <p className="detail__meta">
                <span className="detail__author">{book.author} 지음</span>
                <time className="detail__date" dateTime={book.pubDate}>
                  {formatPubDate(book.pubDate)}
                </time>
              </p>
              {blurb?.summary && <p className="detail__summary">{blurb.summary}</p>}
              <p className="detail__buy">
                <BracketLink href={aladinUrl(book)} target="_blank" rel="noopener noreferrer">
                  알라딘에서 보기
                </BracketLink>
              </p>
            </div>
          </div>
        </div>
      )}
    </dialog>
  )
}
