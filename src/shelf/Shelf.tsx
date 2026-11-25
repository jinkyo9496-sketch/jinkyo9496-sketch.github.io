import { useCallback, useEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react'
import type { Book } from '../data/books'
import { play } from '../sound/play'
import { tiltFor, tiltRotateValue } from './hover'
import { CURRENT_POP, bookAtPoint, faceLoadingFor, shelfPointFrom, visibleRadius } from './layout'
import { useShelfGestures } from './useShelfGestures'
import { useShelfLayout } from './useShelfLayout'
import { stepIndex, useShelfNavigation, type NavAction } from './useShelfNavigation'
import './shelf.css'

/** 마우스처럼 올려 둘 수 있는 포인터인가(`shelf3d/Shelf3D.tsx`와 같은 판정). 효과음만 이것으로 거른다 */
const canHover = () => window.matchMedia?.('(hover: hover) and (pointer: fine)').matches ?? true

interface ShelfProps {
  books: readonly Book[]
  /** 처음 가운데에 올 책의 index. 기본값은 1권(0). currentIndex를 주면 무시된다 */
  initialIndex?: number
  /** 주어지면 부모가 상태를 가진다(제어 컴포넌트). onCurrentChange로 받은 값을 다시 넣어 준다 */
  currentIndex?: number
  /** 조작으로 가운데 책이 바뀔 때 새 index를 알린다 */
  onCurrentChange?: (index: number) => void
  /** 이미 가운데에 있는 책을 다시 고르면(클릭, Enter·Space) 부른다. 끌기로는 부르지 않는다 */
  onOpenCurrent?: () => void
  /**
   * 'all'(기본): 키보드·휠·끌기를 모두 서가가 듣는다.
   * 'pointer': 끌기·클릭만 듣는다. 키보드와 휠은 부모(App)가 화면 전체에서 듣고 currentIndex로 알려 준다.
   */
  inputs?: 'all' | 'pointer'
  /**
   * true면 가운데 책도 펼치지 않고 모든 책이 책등을 보인 채 지나간다(키를 누르고 있는 동안).
   * 가운데 책은 여전히 현재 책이다(aria-current, 포커스). false로 돌아오면 그 책이 펼쳐진다.
   */
  closed?: boolean
  /**
   * true면 웰컴(인트로) 화면의 줄이다: 모든 책이 책등이고 1권 책등이 화면 왼쪽 여백에서 시작해 번호순으로 이어진다
   * (`layout.ts`의 `lineupLeft`). 현재 책은 그대로다(다시 내려오면 그 책이 가운데로 와 펼쳐진다).
   */
  lineup?: boolean
}

/** 책 중심이 화면 폭의 이 비율보다 멀리 있으면 그리지 않는다(원근 때문에 화면 밖 책의 옆면이 안쪽으로 보일 수 있어 0.5보다 크게) */
const FAR_RATIO = 0.7
/** 그림자 기준 폭(px). shelf.css의 .book__shadow width와 같아야 한다 */
const SHADOW_BASE_W = 100
/** 책이 돌아 자리를 잡고 놓이기까지의 시간(ms). shelf.css의 book-place 길이와 같아야 한다. 이 동안은 표지를 기울이지 않는다 */
const TURN_MS = 1000
export { CURRENT_POP }

const px = (n: number) => `${Math.round(n * 100) / 100}px`
/** 바로 받을 이미지는 loading 속성을 두지 않는다(브라우저 기본 = eager) */
const lazyOnly = (loading: 'eager' | 'lazy') => (loading === 'lazy' ? 'lazy' : undefined)

export function Shelf({
  books,
  initialIndex,
  currentIndex,
  onCurrentChange,
  onOpenCurrent,
  inputs = 'all',
  closed: closedProp = false,
  lineup = false,
}: ShelfProps) {
  // 줄을 선 동안에도 펼쳐진 책이 없다
  const closed = closedProp || lineup
  const own = useShelfNavigation(books.length, initialIndex)
  const controlled = currentIndex !== undefined
  const index = stepIndex(0, { type: 'goTo', index: controlled ? currentIndex : own.index }, books.length)

  const navigate = useCallback(
    (action: NavAction) => {
      const next = stepIndex(index, action, books.length)
      if (next === index) return
      if (!controlled) own.goTo(next)
      onCurrentChange?.(next)
    },
    [index, books.length, controlled, own, onCurrentChange],
  )

  // 책을 고른다: 옆 책이면 그리로 가고, 이미 가운데 책이면 연다
  const choose = (i: number) => {
    if (i === index) onOpenCurrent?.()
    else navigate({ type: 'goTo', index: i })
  }

  const sceneRef = useRef<HTMLElement>(null)

  // 포인터가 올라가 있는 책(S8). 가운데 책이 바뀌면 그때의 표시는 버린다(다시 움직일 때 새로 정한다).
  const [hover, setHover] = useState<{ book: number; at: number } | null>(null)
  const hoverIndex = hover && hover.at === index ? hover.book : null
  // 가운데 표지의 기울임은 움직일 때마다 바뀌므로 다시 그리지 않고 그 책의 --tilt만 고친다
  const tilted = useRef<HTMLElement | null>(null)
  const setTilt = (value: string) => {
    const el = value
      ? (sceneRef.current?.querySelector<HTMLElement>('.book[data-current="true"]') ?? null)
      : null
    if (tilted.current && tilted.current !== el) tilted.current.style.removeProperty('--tilt')
    el?.style.setProperty('--tilt', value)
    tilted.current = el
  }
  const clearHover = () => {
    setHover(null)
    setTilt('')
  }
  const turnedAt = useRef({ index, at: Number.NEGATIVE_INFINITY })
  useEffect(() => {
    if (turnedAt.current.index === index) return
    turnedAt.current = { index, at: Date.now() }
    tilted.current?.style.removeProperty('--tilt')
    tilted.current = null
  }, [index])

  const gestures = useShelfGestures(sceneRef, index, navigate, {
    keysAndWheel: inputs === 'all',
    onDragStart: clearHover,
  })

  // 포커스가 서가 안에 있으면 가운데 책을 따라간다(roving tabindex)
  useEffect(() => {
    const scene = sceneRef.current
    const active = document.activeElement
    if (!scene || !active || active === document.body || !scene.contains(active)) return
    scene.querySelector<HTMLElement>('[aria-current="true"]')?.focus({ preventScroll: true })
  }, [index])

  const { bookHeight, viewportWidth, lift, gap, slots } = useShelfLayout(sceneRef, books, index, closed, lineup)
  // 화면에 걸친 책과 그 둘레의 이미지는 미루지 않고 받는다
  const eagerRadius = visibleRadius(slots, index, viewportWidth / 2)

  // 3D로 돌린 상자는 브라우저의 클릭 판정이 어긋날 수 있어, 평평한 판(.shelf__hit)에서
  // 좌표로 어느 책인지 계산한다. 보이는 면이 모두 z=0 평면에 있어 배치 좌표와 화면 좌표가 같다.
  // 책은 칸 가운데에서 lift만큼 위에 있고, 그 아래 반사는 책으로 치지 않는다.
  const bookAt = (e: MouseEvent<HTMLElement>) => {
    const point = shelfPointFrom(e.currentTarget.getBoundingClientRect(), e.clientX, e.clientY, lift)
    return { point, book: bookAtPoint(slots, point, bookHeight, gap / 2) }
  }

  /**
   * 가운데 책(앞으로 나와 있다)이 옆 책에 드리우는 그림자의 자리: 왼쪽·오른쪽 첫째·둘째 책.
   * 책장이 지나가는 중(closed)에는 펼쳐진 책이 없으므로 그림자도 없다.
   */
  const castOf = (i: number) => {
    const d = i - index
    if (closed || d === 0 || Math.abs(d) > 2) return undefined
    return `${d < 0 ? 'l' : 'r'}${Math.abs(d)}`
  }
  /** 포인터로 뽑혀 나온 책의 바로 왼쪽·오른쪽 책(그 책의 그림자를 받는다) */
  const hoverSideOf = (i: number) => {
    if (hoverIndex === null || hoverIndex === index) return undefined
    if (i === hoverIndex - 1) return 'left'
    if (i === hoverIndex + 1) return 'right'
    return undefined
  }

  return (
    <section
      ref={sceneRef}
      className="shelf"
      aria-label="서가명강 서가"
      style={{ '--book-h': px(bookHeight), '--lift': px(lift) } as CSSProperties}
      {...gestures}
    >
      <ol className="shelf__row">
        {books.map((book, i) => {
          const slot = slots[i]
          const coverW = bookHeight * book.coverAspect
          const spineW = bookHeight * book.spineAspect
          // 보이는 면(앞표지 또는 책등)이 z=0 평면에 오도록 상자를 뒤로 민다
          const z = slot.isCurrent ? -spineW / 2 + bookHeight * CURRENT_POP : -coverW / 2
          const loading = faceLoadingFor(i, index, eagerRadius)
          const side = slot.isCurrent ? 'current' : i <= index ? 'left' : 'right'
          const far = Math.abs(slot.x) > viewportWidth * FAR_RATIO
          const style = {
            '--x': px(slot.x),
            '--z': px(z),
            '--ry': `${slot.rotateY}deg`,
            '--cover-w': px(coverW),
            '--spine-w': px(spineW),
            '--shadow-s': Math.round((slot.faceWidth / SHADOW_BASE_W) * 1000) / 1000,
            // 가운데 책에서 몇 권 떨어져 있는지(조명이 멀수록 약해지고, 들어올 때 가운데부터 올라온다)
            '--dist': Math.min(8, Math.abs(i - index)),
          } as CSSProperties

          return (
            <li
              key={book.no}
              className="book"
              data-testid="book"
              data-no={book.no}
              data-current={slot.isCurrent}
              data-side={side}
              data-far={far || undefined}
              data-hover={i === hoverIndex || undefined}
              data-cast={castOf(i)}
              data-hover-side={hoverSideOf(i)}
              style={style}
            >
              <span className="book__shadow" aria-hidden="true" />
              <button
                type="button"
                className="book__box"
                aria-label={`${book.no}권 ${book.title}`}
                aria-current={i === index || undefined}
                tabIndex={i === index ? 0 : -1}
                onClick={() => choose(i)}
              >
                <span className="book__face book__face--front">
                  <img
                    src={book.images.front}
                    alt={`${book.title} 앞표지`}
                    width={Math.round(coverW)}
                    height={Math.round(bookHeight)}
                    loading={lazyOnly(loading.front)}
                    decoding="async"
                    draggable={false}
                    aria-hidden={!slot.isCurrent || undefined}
                  />
                </span>
                <span className="book__face book__face--spine">
                  <img
                    src={book.images.spine}
                    alt={`${book.title} 책등`}
                    width={Math.round(spineW)}
                    height={Math.round(bookHeight)}
                    loading={lazyOnly(loading.spine)}
                    decoding="async"
                    draggable={false}
                    aria-hidden={slot.isCurrent || undefined}
                  />
                </span>
                <span className="book__face book__face--back">
                  <img
                    src={book.images.back}
                    alt=""
                    width={Math.round(coverW)}
                    height={Math.round(bookHeight)}
                    loading={lazyOnly(loading.back)}
                    decoding="async"
                    draggable={false}
                    aria-hidden="true"
                  />
                </span>
              </button>
            </li>
          )
        })}
      </ol>
      <div
        className="shelf__hit"
        aria-hidden="true"
        onClick={(e) => {
          const i = bookAt(e).book
          if (i === null) return
          // 판은 포커스를 받지 않으니, 가운데 책을 누르면 그 책의 버튼에 포커스를 둔다
          // (상세가 닫힐 때 돌아올 자리)
          if (i === index && onOpenCurrent) {
            sceneRef.current
              ?.querySelector<HTMLElement>('[aria-current="true"]')
              ?.focus({ preventScroll: true })
          }
          choose(i)
        }}
        onMouseMove={(e) => {
          const { point, book: i } = bookAt(e)
          const actionable = i !== null && (i !== index || onOpenCurrent !== undefined)
          e.currentTarget.dataset.over = actionable ? 'book' : ''
          // 끄는 동안에는 책이 반응하지 않는다
          if (sceneRef.current?.dataset.dragging) return
          if (i !== hoverIndex) {
            setHover(i === null ? null : { book: i, at: index })
            // 책등이 뽑혀 나온다: 아주 작은 "톡"(`spinePull`. 가운데 책은 뽑히지 않는다. 촘촘한 반복은 `play`가 솎는다).
            // 책등은 마우스 포인터일 때만 움직이므로(shelf.css) 소리 자리도 그때만 부른다(WebGL 서가와 같은 판정)
            if (i !== null && i !== index && canHover()) play('spinePull')
          }
          // 가운데 표지 위에서는 포인터 쪽으로 살짝 기운다. 책이 도는 동안에는 기울이지 않는다.
          const settled = Date.now() - turnedAt.current.at >= TURN_MS
          setTilt(i === index && settled ? tiltRotateValue(tiltFor(point, slots[i].faceWidth, bookHeight)) : '')
        }}
        onMouseLeave={(e) => {
          e.currentTarget.dataset.over = ''
          clearHover()
        }}
      />
    </section>
  )
}
