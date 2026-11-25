import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import type { Book } from '../data/books'
import { computeBandOffset, type BandItem } from './bandOffset'
import './titleBand.css'

interface TitleBandProps {
  books: readonly Pick<Book, 'no' | 'title'>[]
  currentIndex: number
  /** 현재 책이 아닌 제목을 누르면 그 책의 index를 알린다 */
  onNavigate: (index: number) => void
}

/**
 * 서가 위를 가로지르는 제목 띠. 현재 책 제목이 화면 중앙에 오도록 띠 전체가 가로로 움직인다.
 * 장식용 반복이라 보조 기술에는 숨긴다(현재 책은 App의 h1이 알린다).
 */
export function TitleBand({ books, currentIndex, onNavigate }: TitleBandProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [items, setItems] = useState<BandItem[]>([])

  // 제목 폭은 글꼴·화면 폭에 따라 달라지므로 DOM에서 잰다. 다시 잰 결과는 애니메이션 없이 반영한다.
  const measure = useCallback(() => {
    const track = trackRef.current
    if (!track) return
    track.style.transition = 'none'
    setItems(
      Array.from(track.querySelectorAll<HTMLElement>('.band__title'), (el) => ({
        left: el.offsetLeft,
        width: el.offsetWidth,
      })),
    )
  }, [])

  useLayoutEffect(() => {
    measure()
    window.addEventListener('resize', measure)
    // Pretendard는 늦게 도착한다. 글꼴이 바뀌면 띠 폭이 변하므로 그때 다시 잰다.
    let alive = true
    document.fonts?.ready.then(() => alive && measure())
    const track = trackRef.current
    const observer =
      track && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    if (track) observer?.observe(track)
    return () => {
      alive = false
      window.removeEventListener('resize', measure)
      observer?.disconnect()
    }
  }, [measure, books])

  // measure()가 꺼 둔 transition을, 새 위치가 반영된 뒤에 되살린다
  useLayoutEffect(() => {
    const track = trackRef.current
    if (!track || track.style.transition === '') return
    void track.offsetWidth
    track.style.transition = ''
  }, [items])

  const offset = computeBandOffset(items, currentIndex)

  return (
    <div className="band" data-testid="title-band" aria-hidden="true">
      <div
        ref={trackRef}
        className="band__track"
        style={{ transform: `translate3d(${Math.round(offset * 100) / 100}px, 0, 0)` }}
      >
        {books.map((book, i) => {
          const isCurrent = i === currentIndex
          return (
            <span
              key={book.no}
              className="band__item"
              data-testid="band-title"
              data-current={isCurrent}
              onClick={isCurrent ? undefined : () => onNavigate(i)}
            >
              <span className="band__title">{book.title}</span>
              <sup className="band__no">No.{book.no}</sup>
            </span>
          )
        })}
      </div>
    </div>
  )
}
