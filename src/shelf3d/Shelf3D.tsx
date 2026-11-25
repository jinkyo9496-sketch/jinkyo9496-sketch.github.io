import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from 'react'
import type { Book } from '../data/books'
import { tiltFor, type Tilt } from '../shelf/hover'
import { bookAtPoint, shelfPointFrom } from '../shelf/layout'
import { useShelfGestures } from '../shelf/useShelfGestures'
import { useShelfLayout } from '../shelf/useShelfLayout'
import { stepIndex, useShelfNavigation, type NavAction } from '../shelf/useShelfNavigation'
import '../shelf/shelf.css'
import { play } from '../sound/play'
import { focusBoxFor, placeTotalMs } from './motion'
import { createShelfScene } from './scene'
import type { SceneFactory, ScenePage, ShelfSceneHandle } from './sceneTypes'
import './shelf3d.css'

export interface Shelf3DProps {
  books: readonly Book[]
  /** 처음 가운데에 올 책의 index. 기본값은 1권(0). currentIndex를 주면 무시된다 */
  initialIndex?: number
  /** 주어지면 부모가 상태를 가진다(제어 컴포넌트) */
  currentIndex?: number
  onCurrentChange?: (index: number) => void
  /** 이미 가운데에 있는 책을 다시 고르면(클릭, Enter·Space) 부른다 */
  onOpenCurrent?: () => void
  /** 'all'(기본): 키보드·휠·끌기를 모두 듣는다. 'pointer': 끌기·클릭만(키보드·휠은 App이 듣는다) */
  inputs?: 'all' | 'pointer'
  /** true면 가운데 책도 펼치지 않고 책등만 보인 채 지나간다 */
  closed?: boolean
  /** 책이 한 번 움직이는 데 걸리는 시간(ms). 기본 680(`shelfMoveMs` 참고) */
  moveMs?: number
  /**
   * true면 웰컴(인트로) 화면의 줄이다: 모든 책이 책등이고 1권 책등이 화면 왼쪽 여백에서 시작해 번호순으로 이어진다.
   * 현재 책은 그대로다(다시 내려오면 그 책이 가운데로 와 펼쳐진다)
   */
  lineup?: boolean
  /** 서가 화면이 보이는가. true가 될 때 책이 아래에서 올라오고, false인 동안에는 그리지 않는다. 기본 true */
  active?: boolean
  /** WebGL로 그릴 수 없게 됐다(장면을 만들지 못함, 컨텍스트를 잃고 돌아오지 않음). 부모가 CSS 서가로 바꾼다 */
  onFail?: (reason: string) => void
  /** 장면을 만드는 함수. 테스트에서 가짜 장면을 넣는다 */
  createScene?: SceneFactory
  /**
   * 책 페이지: 열려 있으면 가운데 책이 화면 왼쪽에 떠 있고 나머지 책은 치워진다(`side`는 보이는 면).
   * 그 동안 서가의 조작(호버 등)은 쉬고, 떠 있는 책이 화면 전체의 포인터를 조금 따라 돈다. 기본은 닫힘
   */
  page?: ScenePage
  /**
   * 캔버스를 넣을 바깥 요소. 주면 캔버스는 서가 칸이 아니라 그 요소 전체(화면 전체)를 덮는다:
   * 책 페이지에서는 책이 서가 칸 밖(화면 왼쪽)에 떠 있기 때문이다. 서가 칸의 자리는 둘의 화면 좌표 차로 잰다.
   */
  canvasHost?: HTMLElement | null
}

const PAGE_CLOSED: ScenePage = { open: false, side: 'front' }

/** 한 걸음의 기본 시간(ms). `useScreen`의 STEP_MOVE_MS와 같은 값 */
const DEFAULT_MOVE_MS = 680
/** 그리는 해상도 배율의 상한 */
const MAX_PIXEL_RATIO = 2
/** WebGL 컨텍스트를 잃은 뒤 돌아오기를 기다리는 시간(ms). 넘으면 CSS 서가로 물러난다 */
export const CONTEXT_RESTORE_WAIT_MS = 1500

const px = (n: number) => `${Math.round(n * 100) / 100}px`
/** 올려 둘 수 있는 포인터(마우스)인가. 터치에서는 책이 포인터에 반응하지 않는다 */
const canHover = () => window.matchMedia?.('(hover: hover) and (pointer: fine)').matches ?? true

/**
 * WebGL(three.js)로 그리는 서가. CSS 서가(`Shelf`)와 같은 props·같은 조작이고, 그림만 캔버스가 그린다.
 * 보조 기술과 키보드를 위한 책 버튼, 좌표로 책을 고르는 평평한 판은 CSS 서가와 같은 DOM이다.
 */
export function Shelf3D({
  books,
  initialIndex,
  currentIndex,
  onCurrentChange,
  onOpenCurrent,
  inputs = 'all',
  closed: closedProp = false,
  lineup = false,
  moveMs = DEFAULT_MOVE_MS,
  active = true,
  onFail,
  createScene = createShelfScene,
  page = PAGE_CLOSED,
  canvasHost = null,
}: Shelf3DProps) {
  // 줄을 선 동안에도 펼쳐진 책이 없다
  const closed = closedProp || lineup
  const pageOpen = page.open
  const pageSide = page.side
  const pageSpread = page.spread ?? 0
  const peekSide = page.peek?.side ?? null
  const peekCorner = page.peek?.corner ?? null
  // 종이 더미의 옆면 위라면 그 깊이(없으면 null)
  const peekDepth = page.peek?.depth ?? null
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

  const sectionRef = useRef<HTMLElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const scene = useRef<ShelfSceneHandle | null>(null)
  const live = useRef({ index, closed, lineup, moveMs, onFail, pageOpen, pageSide, pageSpread })
  useLayoutEffect(() => {
    live.current = { index, closed, lineup, moveMs, onFail, pageOpen, pageSide, pageSpread }
  })

  // ── 장면: 캔버스는 장면마다 새로 만들고, 떠날 때 장면과 함께 버린다 ──
  useEffect(() => {
    const host = canvasHost ?? hostRef.current
    if (!host) return
    const canvas = document.createElement('canvas')
    canvas.className = 'shelf__canvas'
    host.append(canvas)
    const css = getComputedStyle(document.documentElement)
    const token = (name: string) => css.getPropertyValue(name).trim()
    let created: ShelfSceneHandle
    try {
      created = createScene({
        canvas,
        books,
        colors: { blank: token('--ink-faint'), block: token('--book-block'), shadow: token('--ink') },
        initial: {
          index: live.current.index,
          closed: live.current.closed,
          moveMs: live.current.moveMs,
          ...(live.current.lineup && { lineup: true }),
        },
        page: { open: live.current.pageOpen, side: live.current.pageSide, spread: live.current.pageSpread },
      })
    } catch {
      canvas.remove()
      live.current.onFail?.('WebGL 장면을 만들 수 없음')
      return
    }
    scene.current = created

    // 컨텍스트를 잃으면(GPU 재시작 등) 잠깐 기다려 보고, 돌아오지 않으면 CSS 서가로 물러난다
    let waiting: ReturnType<typeof setTimeout> | null = null
    const onLost = (e: Event) => {
      e.preventDefault()
      if (waiting) clearTimeout(waiting)
      waiting = setTimeout(() => live.current.onFail?.('WebGL 컨텍스트를 잃음'), CONTEXT_RESTORE_WAIT_MS)
    }
    const onRestored = () => {
      if (waiting) clearTimeout(waiting)
      waiting = null
      created.restore()
    }
    canvas.addEventListener('webglcontextlost', onLost)
    canvas.addEventListener('webglcontextrestored', onRestored)

    if (import.meta.env.DEV && 'debug' in created) {
      ;(window as unknown as { __shelf3d?: unknown }).__shelf3d = created.debug
    }

    return () => {
      if (waiting) clearTimeout(waiting)
      canvas.removeEventListener('webglcontextlost', onLost)
      canvas.removeEventListener('webglcontextrestored', onRestored)
      scene.current = null
      created.dispose()
      canvas.remove()
    }
  }, [books, createScene, canvasHost])

  // ── 치수: 서가 칸의 크기와 책 높이·간격을 장면에 알린다 ──
  const { bookHeight, lift, gap, currentGap, lineupLeft, slots } = useShelfLayout(sectionRef, books, index, closed, lineup)
  // 캔버스의 크기(width·height)와, 그 안에서 서가 칸이 놓인 자리(rowTop·rowHeight). 캔버스가 서가 칸에 있으면 둘이 같다
  const [box, setBox] = useState<{ width: number; height: number; rowTop: number; rowHeight: number; pixelRatio: number } | null>(null)
  useLayoutEffect(() => {
    const el = sectionRef.current
    if (!el) return
    const measure = () => {
      const next = {
        width: canvasHost ? canvasHost.clientWidth : el.clientWidth,
        height: canvasHost ? canvasHost.clientHeight : el.clientHeight,
        rowTop: canvasHost ? el.getBoundingClientRect().top - canvasHost.getBoundingClientRect().top : 0,
        rowHeight: el.clientHeight,
        pixelRatio: Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO),
      }
      setBox((prev) =>
        prev &&
        prev.width === next.width &&
        prev.height === next.height &&
        prev.rowTop === next.rowTop &&
        prev.rowHeight === next.rowHeight &&
        prev.pixelRatio === next.pixelRatio
          ? prev
          : next,
      )
    }
    measure()
    window.addEventListener('resize', measure)
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    observer?.observe(el)
    if (canvasHost) observer?.observe(canvasHost)
    return () => {
      window.removeEventListener('resize', measure)
      observer?.disconnect()
    }
  }, [canvasHost])
  useEffect(() => {
    if (!box || box.width <= 0 || box.height <= 0) return
    // 바깥 캔버스: 서가에서는 서가 칸만 보이게 자른다(index.css의 .shelf-canvas가 이 값을 쓴다)
    canvasHost?.style.setProperty('--row-top', px(box.rowTop))
    canvasHost?.style.setProperty('--row-bottom', px(Math.max(0, box.height - box.rowTop - box.rowHeight)))
    scene.current?.setStage({
      width: box.width,
      height: box.height,
      pixelRatio: box.pixelRatio,
      bookHeight,
      gap,
      currentGap,
      centreY: box.rowTop + box.rowHeight / 2 - lift,
      // 서가에서 캔버스가 잘리는 선: 바닥 그림자가 이 앞에서 다 옅어진다
      rowBottom: box.rowTop + box.rowHeight,
      // 웰컴 화면의 줄이 시작하는 자리(캔버스는 화면 폭 전체라 가운데가 같다)
      lineupLeft,
    })
  }, [box, bookHeight, gap, currentGap, lift, lineupLeft, books, createScene, canvasHost])

  // ── 상태: 가운데 책, 지나가는 중인지, 움직이는 시간 ──
  useEffect(() => {
    scene.current?.setState({ index, closed, moveMs, ...(lineup && { lineup: true }) })
  }, [index, closed, lineup, moveMs, books, createScene, canvasHost])

  // ── 책 페이지: 열림·보이는 면 ──
  useEffect(() => {
    scene.current?.setPage({
      open: pageOpen,
      side: pageSide,
      spread: pageSpread,
      ...(peekSide &&
        peekCorner && { peek: { side: peekSide, corner: peekCorner, ...(peekDepth !== null && { depth: peekDepth }) } }),
    })
  }, [pageOpen, pageSide, pageSpread, peekSide, peekCorner, peekDepth, books, createScene, canvasHost])

  useEffect(() => {
    scene.current?.setActive(active)
  }, [active, books, createScene, canvasHost])

  // ── 포인터: 올라가 있는 책과 가운데 표지의 기울임 ──
  // 가운데 책이 바뀌면 그때의 표시는 버린다(다시 움직일 때 새로 정한다)
  const [hover, setHover] = useState<{ book: number; at: number } | null>(null)
  const hoverIndex = hover && hover.at === index ? hover.book : null
  const tilt = useRef<Tilt | null>(null)
  const clearHover = () => {
    setHover(null)
    tilt.current = null
    scene.current?.setPointer({ hoverIndex: null, tilt: null })
  }
  const turnedAt = useRef({ index, at: Number.NEGATIVE_INFINITY, ms: 0 })
  useEffect(() => {
    if (turnedAt.current.index === index) return
    // 책이 돌아 놓이는 동안에는 표지를 기울이지 않는다
    turnedAt.current = { index, at: Date.now(), ms: placeTotalMs(live.current.moveMs) }
    tilt.current = null
    scene.current?.setPointer({ hoverIndex: null, tilt: null })
  }, [index])

  // 책 페이지가 열려 있는 동안: 서가의 호버는 내려놓고, 떠 있는 책이 화면 전체의 포인터를 조금 따라 돈다
  useEffect(() => {
    if (!pageOpen) return
    setHover(null)
    tilt.current = null
    scene.current?.setPointer({ hoverIndex: null, tilt: null })
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch' || !canHover()) return
      const w = window.innerWidth || 1
      const h = window.innerHeight || 1
      scene.current?.setPagePointer({ x: (e.clientX / w) * 2 - 1, y: (e.clientY / h) * 2 - 1 })
    }
    window.addEventListener('pointermove', onMove)
    return () => {
      window.removeEventListener('pointermove', onMove)
      scene.current?.setPagePointer(null)
    }
  }, [pageOpen])

  const gestures = useShelfGestures(sectionRef, index, navigate, {
    keysAndWheel: inputs === 'all',
    onDragStart: clearHover,
  })

  // 포커스가 서가 안에 있으면 가운데 책을 따라간다(roving tabindex)
  useEffect(() => {
    const section = sectionRef.current
    const focused = document.activeElement
    if (!section || !focused || focused === document.body || !section.contains(focused)) return
    section.querySelector<HTMLElement>('[aria-current="true"]')?.focus({ preventScroll: true })
  }, [index])

  // 보이는 면이 모두 z=0 평면에 있어(카메라를 그렇게 맞췄다) 배치 좌표와 화면 좌표가 같다.
  // 그래서 클릭·호버는 광선 대신 CSS 서가와 같은 좌표 판정을 쓴다.
  const bookAt = (e: MouseEvent<HTMLElement>) => {
    const point = shelfPointFrom(e.currentTarget.getBoundingClientRect(), e.clientX, e.clientY, lift)
    return { point, book: bookAtPoint(slots, point, bookHeight, gap / 2) }
  }

  // 책 버튼의 자리: 화면에 보이는 책 위(포커스 링이 그 책을 두른다)
  // 가운데 책은 쉬는 자세로 조금 돌아 있다: 그 책 전체(보이는 책등까지)를 두른다
  const boxes = useMemo(
    () => slots.map((slot, i) => focusBoxFor(slot, bookHeight, bookHeight * books[i].spineAspect)),
    [slots, bookHeight, books],
  )

  return (
    <section
      ref={sectionRef}
      className="shelf shelf--webgl"
      aria-label="서가명강 서가"
      style={{ '--book-h': px(bookHeight), '--lift': px(lift) } as CSSProperties}
      {...gestures}
    >
      <div ref={hostRef} className="shelf__canvas-host" aria-hidden="true" />
      <ol className="shelf__books">
        {books.map((book, i) => (
          <li
            key={book.no}
            data-testid="book"
            data-no={book.no}
            data-current={!closed && i === index}
            data-hover={i === hoverIndex || undefined}
          >
            <button
              type="button"
              className="shelf__book"
              aria-label={`${book.no}권 ${book.title}`}
              aria-current={i === index || undefined}
              tabIndex={i === index ? 0 : -1}
              style={
                {
                  '--x': px(boxes[i].x),
                  '--y': px(boxes[i].y),
                  '--w': px(boxes[i].width),
                  '--h': px(boxes[i].height),
                } as CSSProperties
              }
              onClick={() => choose(i)}
            />
          </li>
        ))}
      </ol>
      <div
        className="shelf__hit"
        aria-hidden="true"
        onClick={(e) => {
          const i = bookAt(e).book
          if (i === null) return
          // 판은 포커스를 받지 않으니, 가운데 책을 누르면 그 책의 버튼에 포커스를 둔다(상세가 닫힐 때 돌아올 자리)
          if (i === index && onOpenCurrent) {
            sectionRef.current?.querySelector<HTMLElement>('[aria-current="true"]')?.focus({ preventScroll: true })
          }
          choose(i)
        }}
        onMouseMove={(e) => {
          const { point, book: i } = bookAt(e)
          const actionable = i !== null && (i !== index || onOpenCurrent !== undefined)
          e.currentTarget.dataset.over = actionable ? 'book' : ''
          // 끄는 동안과 터치에서는 책이 반응하지 않는다
          if (sectionRef.current?.dataset.dragging || !canHover()) return
          if (i !== hoverIndex) {
            setHover(i === null ? null : { book: i, at: index })
            // 책등이 뽑혀 나온다: 아주 작은 "톡"(`spinePull`. 가운데 책은 뽑히지 않는다. 촘촘한 반복은 `play`가 솎는다)
            if (i !== null && i !== index) play('spinePull')
          }
          // 가운데 표지 위에서는 책이 포인터를 따라 돈다(장면이 이 값에서 자리를 되읽는다). 책이 돌아 놓이는 동안에는 돌리지 않는다
          const placed = Date.now() - turnedAt.current.at >= turnedAt.current.ms
          tilt.current = i === index && !closed && placed ? tiltFor(point, slots[i].faceWidth, bookHeight) : null
          scene.current?.setPointer({ hoverIndex: i, tilt: tilt.current })
        }}
        onMouseLeave={(e) => {
          e.currentTarget.dataset.over = ''
          clearHover()
        }}
      />
    </section>
  )
}

export default Shelf3D
