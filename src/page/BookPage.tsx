import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from 'react'
import { BracketLink } from '../chrome/BracketButton'
import { VolumeDial } from '../chrome/VolumeDial'
import { blurbs as allBlurbs, type Blurb } from '../data/blurbs'
import { editorNotes as allNotes } from '../data/editorNotes'
import { aladinUrl, type Book } from '../data/books'
import { affiliations as allAffiliations } from '../data/affiliations'
import { clampSpread, pileShare, pileTarget, spreadLabel, type PreviewShape } from '../reader/spread'
import './bookPage.css'

interface Props {
  books: readonly Book[]
  currentIndex: number
  /** 권별 저자 소속. 기본값은 `data/affiliations.ts` */
  affiliations?: Readonly<Record<number, string>>
  /** 떠 있는 책의 펼침면(`reader/spread.ts`): 0 = 덮임, 1 = 면지, 2부터 본문. 주지 않으면 펼치는 조작이 없다 */
  spread?: number
  maxSpread?: number
  /** 미리보기의 모양(자리 이름을 적는 데 쓴다) */
  preview?: PreviewShape
  onSpread?: (spread: number) => void
  /** 펼친 책 위의 포인터: 어느 쪽 면의 위쪽·아래쪽에 있는가. 떠나면 null */
  onPeek?: (peek: { side: 'left' | 'right'; corner: 'top' | 'bottom'; depth?: number } | null) => void
  /** 종이 더미의 옆면을 보인다(책 전체가 든 권): 올리면 그 깊이에 틈이 보이고, 누르면 그 쪽으로 건너뛴다 */
  pile?: boolean
  /** 미리보기가 끝난 면(마지막 펼침면의 오른쪽)에 서점으로 가는 버튼을 둔다(`data/bookContent.ts`의 `endsAtStore`) */
  storeEnd?: boolean
  /** 다이얼의 선을 눌렀다: 그 권으로(books의 순번) */
  onGo: (index: number) => void
  /** 권별 부제·소개. 없는 권은 그 자리를 비운다. 기본값은 `data/blurbs.ts` */
  blurbs?: Readonly<Record<number, Blurb>>
  /** 권별 "편집자의 한 마디"(문장 묶음 여러 줄). 없는 권은 그 자리를 비운다. 기본값은 `data/editorNotes.ts` */
  notes?: Readonly<Record<number, readonly string[]>>
  /** 처음 나타나는 방식: 'open'은 서가에서 열렸다(책이 자리를 잡은 뒤 글이 나온다), 'direct'는 주소로 바로 들어왔거나 분류 화면에서 열었다 */
  entrance?: 'open' | 'direct'
  /** 닫히는 중(글이 먼저 사라진다). 이 동안에는 조작·읽기에서 뺀다 */
  leaving?: boolean
}

const NO_PREVIEW: PreviewShape = { pages: 0 }

/** 미리보기가 끝난 면의 한 줄과 서점으로 가는 버튼의 글(2026-11-25. 문구는 편집자가 고른다) */
export const PREVIEW_END_NOTE = '미리보기는 여기까지입니다.'
export const PREVIEW_END_LABEL = '이어서 읽기'

/** 더미 옆면의 누르는 자리가 띠의 양옆으로 더 받는 폭(px). `bookPage.css`의 `--edge-pad`와 같은 값 */
export const EDGE_PAD = 10

/** 키보드로 더미의 옆면을 눌렀을 때 건너뛰는 펼침면 수(포인터가 없어 깊이를 알 수 없다) */
const EDGE_KEY_STEP = 10

/** 지나간 책의 글이 사라지는 시간(ms). bookPage.css의 `bookpage-out`과 같은 값 */
const GHOST_MS = 220

/** 책 한 권의 글: 시리즈 번호, 제목, 부제, 저자와 소속('서울대학교'는 뺀다), 소개, 편집자의 한 마디. 제목은 heading(없으면 장식용 복사본) */
function Text({
  book,
  blurb,
  affiliation,
  note,
  heading,
}: {
  book: Book
  blurb: Blurb | undefined
  affiliation: string | undefined
  note: readonly string[] | undefined
  heading: boolean
}) {
  return (
    <>
      <p className="bookpage__series">서가명강 {book.no}</p>
      {heading ? (
        <h1 id="bookpage-title" className="bookpage__title" tabIndex={-1}>
          {book.title}
        </h1>
      ) : (
        <p className="bookpage__title">{book.title}</p>
      )}
      {blurb?.subtitle && <p className="bookpage__subtitle">{blurb.subtitle}</p>}
      <p className="bookpage__meta">
        <span className="bookpage__author">{book.author} 지음</span>
        {affiliation && <span className="bookpage__affiliation">{affiliation}</span>}
      </p>
      {blurb?.summary && <p className="bookpage__summary">{blurb.summary}</p>}
      {note && note.length > 0 && (
        <div className="bookpage__note">
          {heading ? <h2 className="bookpage__note-label">편집자의 한 마디</h2> : <p className="bookpage__note-label">편집자의 한 마디</p>}
          <p className="bookpage__note-text">{note.join(' ')}</p>
        </div>
      )}
    </>
  )
}

/**
 * 책 페이지의 글과 조작부(WebGL 서가일 때 상세 dialog를 대신한다). 화면 왼쪽에는 장면이 그리는 책이 떠 있고,
 * 여기는 오른쪽의 소개 글과 책 아래의 권수 다이얼이다(돌아가는 버튼은 2026-11-24에 없앴다: Esc와 브라우저의 뒤로 가기로 닫는다). 모달이 아니라 보통의 영역(region)이다.
 * 색은 App이 화면 전체에 넣은 책의 대표색을 따른다(`--paper`·`--ink`가 그 페이지의 바탕·글자색).
 * 책이 바뀌면 제목 요소는 그대로 두고 내용만 바꾼다(포커스가 남는다). 지나간 책의 글은 장식으로 잠깐 남아 사라진다.
 */
export function BookPage({
  books,
  currentIndex,
  affiliations = allAffiliations,
  spread = 0,
  maxSpread = 0,
  preview = NO_PREVIEW,
  onSpread,
  onPeek,
  pile = false,
  storeEnd = false,
  onGo,
  blurbs = allBlurbs,
  notes = allNotes,
  entrance = 'open',
  leaving = false,
}: Props) {
  const book = books[currentIndex]
  // 펼친 책의 면 위에서 포인터가 위쪽·아래쪽 어디에 있는지 알린다(터치는 올려 둘 수 없으니 뺀다)
  const peekOn = (side: 'left' | 'right') => ({
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      if (e.pointerType === 'touch') return
      const box = e.currentTarget.getBoundingClientRect()
      onPeek?.({
        side,
        corner: e.clientY - box.top < box.height / 2 ? 'top' : 'bottom',
      })
    },
    onPointerLeave: () => onPeek?.(null),
  })

  // 종이 더미의 옆면(배 쪽의 띠): 포인터의 가로 자리가 더미의 깊이다(쪽에 가까운 쪽 = 맨 위 장, 바깥 끝 = 맨 아래 장)
  const share = pileShare(spread, preview)
  const depthAt = (side: 'left' | 'right', e: { clientX: number; currentTarget: HTMLElement }) => {
    const box = e.currentTarget.getBoundingClientRect()
    if (box.width <= 0) return 0
    const along = side === 'right' ? e.clientX - box.left : box.right - e.clientX
    // 양옆의 덧댄 폭은 깊이에 넣지 않는다(쪽 쪽의 덧댄 곳 = 맨 위 장, 바깥의 덧댄 곳 = 맨 아래 장)
    const band = Math.max(1, box.width - EDGE_PAD * 2)
    return Math.round(Math.min(1, Math.max(0, (along - EDGE_PAD) / band)) * 100) / 100
  }
  const edgeOn = (side: 'left' | 'right') => {
    const empty = side === 'right' ? spread >= maxSpread : spread <= 1
    return {
      'aria-disabled': empty || undefined,
      style: { '--pile': side === 'right' ? 1 - share : share } as CSSProperties,
      onPointerMove: (e: PointerEvent<HTMLElement>) => {
        if (e.pointerType === 'touch' || empty) return
        const depth = depthAt(side, e)
        onPeek?.({ side, corner: 'bottom', depth })
      },
      onPointerLeave: () => onPeek?.(null),
      onClick: (e: MouseEvent<HTMLElement>) => {
        if (empty) return
        // 키보드(detail 0)는 깊이가 없다: 정해 둔 만큼 건너뛴다
        const to = e.detail === 0 ? clampSpread(spread + (side === 'right' ? EDGE_KEY_STEP : -EDGE_KEY_STEP), preview) : pileTarget(side, depthAt(side, e), spread, preview)
        onSpread?.(Math.max(1, to))
      },
    }
  }

  // 책이 바뀌면: 지나간 책을 장식(ghost)으로 남기고, 글이 들어오는 움직임을 다시 튼다(turns의 홀짝으로 이름을 바꾼다)
  const [shown, setShown] = useState(currentIndex)
  const [ghost, setGhost] = useState<number | null>(null)
  const [turns, setTurns] = useState(0)
  if (shown !== currentIndex) {
    setGhost(shown)
    setShown(currentIndex)
    setTurns(turns + 1)
  }
  useEffect(() => {
    if (ghost === null) return
    const id = setTimeout(() => setGhost(null), GHOST_MS)
    return () => clearTimeout(id)
  }, [ghost, turns])

  // 책이 바뀌면 한 번 알린다(포커스는 그대로라 아무것도 읽히지 않는다). 열릴 때는 제목으로 포커스가 가며 읽힌다
  const label = `${book.no}권 ${book.title}`
  const [announcement, setAnnouncement] = useState('')
  const announced = useRef(label)
  useEffect(() => {
    if (announced.current === label) return
    announced.current = label
    setAnnouncement(label)
  }, [label])

  const enter = turns === 0 ? entrance : turns % 2 ? 'turn-a' : 'turn-b'

  return (
    <section
      className="bookpage"
      aria-labelledby="bookpage-title"
      data-entrance={entrance}
      data-leaving={leaving || undefined}
      inert={leaving}
      aria-hidden={leaving || undefined}
    >
      <div className="sr-only" role="status" aria-atomic="true">
        {announcement}
      </div>
      {onSpread && (
        <>
          {/* 책 위의 누르는 자리(그림은 캔버스가 그린다): 덮인 책을 누르면 펼치고, 펼친 책의 오른쪽 면은 다음 장, 왼쪽 면은 이전 장 */}
          <div
            className="bookpage__hits"
            role="group"
            aria-label="책 펼쳐 보기"
            data-open={spread > 0 || undefined}
            style={{ '--cover-aspect': book.coverAspect, '--spine-aspect': book.spineAspect } as CSSProperties}
          >
            {spread === 0 ? (
              <button type="button" className="bookpage__hit bookpage__hit--book" aria-label="펼쳐 보기" onClick={() => onSpread(1)} />
            ) : (
              <>
                <button
                  type="button"
                  className="bookpage__hit bookpage__hit--left"
                  aria-label={spread === 1 ? '덮기' : '이전 장'}
                  onClick={() => onSpread(spread - 1)}
                  {...peekOn('left')}
                />
                <button
                  type="button"
                  className="bookpage__hit bookpage__hit--right"
                  aria-label="다음 장"
                  aria-disabled={spread >= maxSpread || undefined}
                  onClick={spread >= maxSpread ? undefined : () => onSpread(spread + 1)}
                  {...peekOn('right')}
                />
              </>
            )}
            {pile && spread > 0 && (
              <>
                <button type="button" className="bookpage__hit bookpage__edge bookpage__edge--left" aria-label="앞쪽으로 건너뛰기" {...edgeOn('left')} />
                <button type="button" className="bookpage__hit bookpage__edge bookpage__edge--right" aria-label="뒤쪽으로 건너뛰기" {...edgeOn('right')} />
              </>
            )}
            {/* 미리보기가 끝난 면: 빈 종이 위에 한 줄과 서점으로 가는 버튼(마지막 장이 다 넘어온 뒤에 나타난다) */}
            {storeEnd && spread > 0 && spread >= maxSpread && (
              <div className="bookpage__end">
                <p className="bookpage__end-note">{PREVIEW_END_NOTE}</p>
                <BracketLink href={aladinUrl(book)} target="_blank" rel="noopener noreferrer">
                  {PREVIEW_END_LABEL}
                </BracketLink>
              </div>
            )}
            {/* 지금 펼쳐진 자리는 보조 기술에만 알린다 */}
            <span className="sr-only" role="status">
              {spread > 0 ? spreadLabel(spread, preview) : ''}
            </span>
          </div>
        </>
      )}
      {/* 책 아래의 권수 다이얼(서가의 하단 바와 같은 것). 선을 누르면 그 권의 책 페이지로 간다 */}
      <VolumeDial className="bookpage__dial" books={books} currentIndex={currentIndex} onGo={onGo} data-open={spread > 0 || undefined} />
      <div className="bookpage__column">
        <div className="bookpage__text" data-enter={enter}>
          <Text book={book} blurb={blurbs[book.no]} affiliation={affiliations[book.no]} note={notes[book.no]} heading />
        </div>
        {ghost !== null && (
          <div key={turns} className="bookpage__text bookpage__ghost" aria-hidden="true" inert>
            <Text
              book={books[ghost]}
              blurb={blurbs[books[ghost].no]}
              affiliation={affiliations[books[ghost].no]}
              note={notes[books[ghost].no]}
              heading={false}
            />
          </div>
        )}
      </div>
    </section>
  )
}
