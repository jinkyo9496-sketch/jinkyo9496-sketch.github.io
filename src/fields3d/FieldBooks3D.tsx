import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import type { Book } from '../data/books'
import { fieldBooks, fieldIndexOfBook, fields, type Field } from '../data/fields'
import { dragAxis, isModalOpen, isTypingTarget } from '../shelf/useShelfGestures'
import { play } from '../sound/play'
import { edgeFadeWidth, fieldsView, type CanvasFrame } from './motion'
import { createFieldsScene } from './scene'
import type { FieldsFlight, FieldsReturn, FieldsReturnStep, FieldsRow, FieldsSceneFactory, FieldsSceneHandle } from './sceneTypes'
import {
  releaseVelocity,
  revealScroll,
  rubberBand,
  scrollMoving,
  stepScroll,
  stepTarget,
  type PointerSample,
  type ScrollMotion,
} from './scroll'

/**
 * 고른 책을 책 페이지의 자리로 날려 보낸다(장면의 `flyOut`). 날아가기 시작했으면 true, 날릴 수 없으면 false.
 * 닿으면 onLanded를 한 번 부른다
 */
export type FlyStarter = (flight: FieldsFlight, onLanded: () => void) => boolean

/**
 * 책 페이지를 닫았다: 그 권(no)이 책 페이지의 자리에서 날아와 그 책의 학문의 줄 제자리에 놓이게 한다(장면의 `flyIn`).
 * 시작했으면 true, 돌아오게 할 수 없으면 false(부모가 예전 방식으로 물러난다). 단계마다 onStep을 부른다
 */
export type FlyReturner = (no: number, flight: FieldsReturn, onStep: (step: FieldsReturnStep) => void) => boolean

/**
 * 책이 날아가는·돌아오는 전환의 단계. 없으면 null.
 * 열 때: 날아가는 중(fly) → 닿아서 책 페이지와 겹쳐 넘어가는 중(handoff).
 * 닫을 때(거꾸로): 펼친 책이 덮이기를 기다리는 중(settle, 덮여 있었으면 건너뛴다) → 책 페이지 위로 겹쳐 넘어오는 중(depart) →
 * 날아와 놓이는 중(return)
 */
export type FlightPhase = 'fly' | 'handoff' | 'settle' | 'depart' | 'return' | null

export interface FieldBooks3DProps {
  /** 지금 가리키는 학문 */
  field: Field
  /** 분류 화면이 보이는가. true가 될 때 책이 처음부터 등장하고, false인 동안에는 그리지 않는다 */
  active: boolean
  /** WebGL로 그릴 수 없게 됐다(장면을 만들지 못함, 컨텍스트를 잃고 돌아오지 않음). 부모가 평면 표지로 바꾼다 */
  onFail?: (reason: string) => void
  /**
   * 멈춘 책을 골랐다(클릭, 책 버튼에서 Enter·Space): 그 책의 책 페이지를 열 곳. fly를 부르면 그 책이 들려서
   * 책 페이지의 자리로 날아간다(부르지 않으면 그대로 서 있다)
   */
  onOpenBook?: (book: Book, fly: FlyStarter) => void
  /**
   * 책 페이지로 날아가는·돌아오는 전환의 단계(부모가 정한다). 그동안 캔버스는 마스크를 벗고 다른 것 위로 올라오며,
   * 'handoff'에서는 책 페이지 위에 겹쳐진 채 옅어지고 'depart'에서는 그 위로 떠오른다(`fields.css`). 날아가는 전환이
   * 끝났는데(null) 화면이 그대로 보이면(전환 중에 책 페이지가 닫혔다) 책들이 처음부터 다시 등장한다. 돌아오는 전환이
   * 끝났을 때는 그대로 둔다(책들이 이미 제자리에 서 있다)
   */
  flight?: FlightPhase
  /** 부모가 "돌아오게 하기"(`FlyReturner`)를 받아 갈 곳: 장면이 있는 동안 여기에 넣어 둔다 */
  returner?: { current: FlyReturner | null }
  /** 장면을 만드는 함수. 테스트에서 가짜 장면을 넣는다 */
  createScene?: FieldsSceneFactory
}

/** 그리는 해상도 배율의 상한(서가와 같다) */
const MAX_PIXEL_RATIO = 2
/** 줄이 흐르는 동안 한 프레임으로 치는 시간의 상한(ms): 숨은 탭에서 돌아온 긴 프레임에 줄이 튀지 않게 */
const MAX_SCROLL_FRAME_MS = 64
/** 줄(line) 단위로 오는 휠 델타의 한 줄 높이(px) */
const WHEEL_LINE_PX = 16

const STILL: ScrollMotion = { pos: 0, vel: 0, target: null }
/** WebGL 컨텍스트를 잃은 뒤 돌아오기를 기다리는 시간(ms). 넘으면 평면 표지로 물러난다(서가와 같은 값) */
export const CONTEXT_RESTORE_WAIT_MS = 1500

/**
 * 가리키는 학문의 책을 WebGL(three.js)로 그린다: 책등을 정면으로 보이며 왼쪽 끝(다이얼 쪽 서랍)에서 나와 벌어지고,
 * 문이 열리듯 제자리에서 돌아 앞표지가 정면을 본다. 학문이 바뀌면 돌아서며 그 서랍으로 다시 들어간다.
 * 움직임과 배치는 장면(`scene.ts`)과 순수 계산(`motion.ts`)이 맡고, 여기서는 캔버스·크기·학문·보임 여부를 전한다.
 * 캔버스의 왼쪽 끝에서는 책이 옅어진다(`--edge-fade`: 투명도 마스크의 폭. 모양은 `fields.css`).
 *
 * 책이 다 돌아 멈추면(장면이 `onRow`로 알린다) 줄을 끌어 넘길 수 있다(네 권 이상일 때): 포인터로 잡고 좌우로 끌기(손을 떼면
 * 관성, 끝에서는 저항하다 되돌아옴), ←/→로 한 권씩, 가로 휠. 움직임의 계산은 `scroll.ts`.
 * 캔버스는 장식이라 숨기고, 책마다 보이지 않는 버튼(이름 "N권 제목")을 멈춘 표지의 자리에 놓는다: 포커스 링이 책을 두르고,
 * Enter·Space나 책을 누르면 `onOpenBook`. 포인터는 버튼이 아니라 책 자리 전체가 받아 좌표로 책을 고른다(서가와 같은 방식).
 * 마우스 포인터를 올린 책은 살짝 돌아 책등이 조금 드러난다(`setHover`. 끄는 동안과 다 돌기 전에는 반응하지 않는다).
 */
export function FieldBooks3D({
  field,
  active,
  onFail,
  onOpenBook,
  flight = null,
  returner,
  createScene = createFieldsScene,
}: FieldBooks3DProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLOListElement>(null)
  const [scene, setScene] = useState<FieldsSceneHandle | null>(null)
  const sceneRef = useRef<FieldsSceneHandle | null>(null)
  const books = useMemo(() => fieldBooks(field), [field])
  /** 다 돌아 멈춘 줄(끌 수 있는 길이와 멈출 자리). 다 돌기 전·학문이 바뀌는 중에는 null */
  const [row, setRow] = useState<FieldsRow | null>(null)
  const live = useRef({ field, onFail, onOpenBook, active, row, books, width: 0 })
  useLayoutEffect(() => {
    live.current = { ...live.current, field, onFail, onOpenBook, active, row, books }
  })

  // ── 줄의 움직임(스크롤). 값은 ref에 두고 장면과 버튼 자리에 바로 쓴다(프레임마다 다시 그리지 않는다) ──
  const motion = useRef<ScrollMotion>(STILL)
  const frame = useRef({ id: 0, last: 0 })

  /** 책 버튼을 멈춘 표지의 자리에 놓는다. 자리를 모르면(다 돌기 전) 책 자리 전체를 두르는 기본 모양으로 둔다 */
  const placeButtons = useCallback(() => {
    const buttons = listRef.current?.querySelectorAll<HTMLElement>('.fbooks3d__book') ?? []
    buttons.forEach((button, i) => {
      const box = live.current.row ? sceneRef.current?.bookBox(i) : null
      if (!box) {
        button.removeAttribute('data-placed')
        for (const side of ['left', 'top', 'width', 'height'] as const) button.style[side] = ''
        return
      }
      button.setAttribute('data-placed', '')
      button.style.left = `${box.left}px`
      button.style.top = `${box.top}px`
      button.style.width = `${box.width}px`
      button.style.height = `${box.height}px`
    })
  }, [])

  const stopMotion = useCallback(() => {
    cancelAnimationFrame(frame.current.id)
    frame.current.id = 0
  }, [])

  /** 줄을 그 자리에 놓는다: 장면에 알리고 버튼도 따라 옮긴다 */
  const scrollTo = useCallback(
    (next: ScrollMotion) => {
      const moved = next.pos !== motion.current.pos
      motion.current = next
      if (!moved) return
      sceneRef.current?.setScroll(next.pos)
      placeButtons()
    },
    [placeButtons],
  )

  /** 남은 움직임(관성, 끝에서 되돌아옴, 목표로 가기)을 멈출 때까지 프레임마다 보낸다 */
  const runMotion = useCallback(() => {
    const max = live.current.row?.max ?? 0
    if (frame.current.id || !scrollMoving(motion.current, max)) return
    const tick = () => {
      const now = performance.now()
      const dt = Math.min(MAX_SCROLL_FRAME_MS, Math.max(0, now - frame.current.last))
      frame.current.last = now
      const limit = live.current.row?.max ?? 0
      scrollTo(stepScroll(motion.current, dt, limit))
      frame.current.id = scrollMoving(motion.current, limit) ? requestAnimationFrame(tick) : 0
    }
    frame.current.last = performance.now()
    frame.current.id = requestAnimationFrame(tick)
  }, [scrollTo])

  /** 목표 자리로 부드럽게 간다(←/→, 포커스가 간 책 보이기) */
  const glideTo = useCallback(
    (target: number) => {
      if (Math.abs(target - motion.current.pos) < 0.5 && motion.current.target === null) return
      motion.current = { ...motion.current, target }
      runMotion()
    },
    [runMotion],
  )
  useEffect(() => stopMotion, [stopMotion])

  // 분류 화면에 처음 들어설 때 장면을 만든다(그 전에는 WebGL 컨텍스트를 쓰지 않는다). 한번 만든 장면은 계속 쓴다
  const [wanted, setWanted] = useState(active)
  if (active && !wanted) setWanted(true)

  // ── 장면: 캔버스는 장면마다 새로 만들고, 떠날 때 장면과 함께 버린다 ──
  useEffect(() => {
    const host = hostRef.current
    if (!wanted || !host) return
    const canvas = document.createElement('canvas')
    host.append(canvas)
    const css = getComputedStyle(document.documentElement)
    const token = (name: string) => css.getPropertyValue(name).trim()
    let created: FieldsSceneHandle
    try {
      const pointed = live.current.field
      created = createScene({
        canvas,
        colors: { blank: token('--ink-faint'), block: token('--book-block'), shadow: token('--ink') },
        field: { key: pointed.name, books: fieldBooks(pointed) },
        // 줄이 멈췄다 / 다시 움직인다 / 범위가 달라졌다. 다시 움직이면 스크롤은 0으로 돌아간다(장면도 새 줄을 0에서 시작한다)
        onRow: (next) => {
          stopMotion()
          // 날아서 돌아온 줄은 그 책이 보이게 넘겨진 채로 서 있다(`scroll`): 그 자리에서 이어서 넘긴다
          const had = next?.scroll ?? motion.current.pos
          const pos = next ? Math.min(next.max, Math.max(0, had)) : 0
          if (next && pos !== had) sceneRef.current?.setScroll(pos)
          motion.current = { pos, vel: 0, target: null }
          live.current.row = next
          setRow(next)
        },
      })
    } catch {
      canvas.remove()
      live.current.onFail?.('WebGL 장면을 만들 수 없음')
      return
    }
    sceneRef.current = created
    setScene(created)

    // 컨텍스트를 잃으면(GPU 재시작 등) 잠깐 기다려 보고, 돌아오지 않으면 평면 표지로 물러난다
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
      ;(window as unknown as { __fields3d?: unknown }).__fields3d = created.debug
    }

    return () => {
      if (waiting) clearTimeout(waiting)
      canvas.removeEventListener('webglcontextlost', onLost)
      canvas.removeEventListener('webglcontextrestored', onRestored)
      stopMotion()
      motion.current = STILL
      live.current.row = null
      sceneRef.current = null
      setScene(null)
      setRow(null)
      created.dispose()
      canvas.remove()
    }
  }, [wanted, createScene, stopMotion])

  // ── 치수: 책 자리의 크기와, 화면 전체를 덮는 캔버스 안에서 책 자리가 놓인 자리를 장면에 알린다 ──
  // 캔버스는 이 화면(`.screen`) 전체를 덮는다: 날아가는 책이 책 자리 밖(책 페이지에서 책이 떠 있는 자리)까지 간다.
  // 화면을 찾지 못하면(이 컴포넌트만 따로 쓸 때) 캔버스는 책 자리와 같다
  const [box, setBox] = useState<{ width: number; height: number; pixelRatio: number; canvas: CanvasFrame } | null>(null)
  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return
    const screen = root.closest<HTMLElement>('.screen')
    const measure = () => {
      const width = root.clientWidth
      const height = root.clientHeight
      const at = root.getBoundingClientRect()
      const whole = screen?.getBoundingClientRect()
      const canvas: CanvasFrame =
        screen && whole
          ? { width: screen.clientWidth, height: screen.clientHeight, left: at.left - whole.left, top: at.top - whole.top }
          : { width, height, left: 0, top: 0 }
      const next = { width, height, pixelRatio: Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO), canvas }
      setBox((prev) =>
        prev &&
        prev.width === next.width &&
        prev.height === next.height &&
        prev.pixelRatio === next.pixelRatio &&
        prev.canvas.width === canvas.width &&
        prev.canvas.height === canvas.height &&
        prev.canvas.left === canvas.left &&
        prev.canvas.top === canvas.top
          ? prev
          : next,
      )
    }
    measure()
    window.addEventListener('resize', measure)
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    observer?.observe(root)
    if (screen) observer?.observe(screen)
    return () => {
      window.removeEventListener('resize', measure)
      observer?.disconnect()
    }
  }, [])
  useEffect(() => {
    if (!scene || !box || box.width <= 0 || box.height <= 0) return
    live.current.width = box.width
    scene.setStage(box)
  }, [scene, box])
  // 서랍 입구에서 옅어지는 폭: 책 높이에 비례하므로 책 자리의 크기에서 구한다(멈춘 첫 책에는 닿지 않는다)
  // 캔버스의 자리: 책 자리의 왼쪽 위에서 그만큼 바깥으로 나가 화면 전체를 덮는다(`fields.css`가 이 값을 쓴다)
  useLayoutEffect(() => {
    if (!box || box.width <= 0 || box.height <= 0) return
    const style = hostRef.current?.style
    style?.setProperty('--edge-fade', `${edgeFadeWidth(fieldsView(box)).toFixed(2)}px`)
    style?.setProperty('--stage-left', `${box.canvas.left}px`)
    style?.setProperty('--stage-top', `${box.canvas.top}px`)
    style?.setProperty('--canvas-w', `${box.canvas.width}px`)
    style?.setProperty('--canvas-h', `${box.canvas.height}px`)
  }, [box])

  // ── 가리키는 학문: 바뀌면 보이던 책이 나가고 새 책이 들어온다(화면을 켜기 전에 먼저 알린다) ──
  useEffect(() => {
    scene?.setField({ key: field.name, books: fieldBooks(field) })
  }, [scene, field])

  useEffect(() => {
    scene?.setActive(active)
  }, [scene, active])

  // 책 페이지를 닫으면 그 책이 날아서 돌아오게 하는 함수를 부모에게 내준다. 그 책의 학문은 권 번호에서 찾는다
  // (부모의 상태가 아직 이 컴포넌트에 내려오기 전에 불려도 된다: 장면이 그 학문의 줄을 바로 세운다)
  /** 장면이 돌려보내기 시작한 책이 아직 놓이지 않았는가 */
  const returnPending = useRef(false)
  useLayoutEffect(() => {
    if (!returner || !scene) return
    returner.current = (no, plan, onStep) => {
      const at = fieldIndexOfBook(no)
      const home = at === null ? undefined : fields[at]
      const shelf = home ? fieldBooks(home) : []
      const i = shelf.findIndex((book) => book.no === no)
      if (!home || i < 0) return false
      const flying =
        scene.flyIn?.({ key: home.name, books: shelf }, i, plan, (step) => {
          if (step === 'landed') returnPending.current = false
          onStep(step)
        }) ?? false
      if (flying) stopMotion()
      returnPending.current = flying
      return flying
    }
    return () => {
      returner.current = null
    }
  }, [returner, scene, stopMotion])

  // 날아가는 전환이 끝났는데 화면이 그대로 보인다(전환 중에 책 페이지가 닫혔다): 날아간 책을 거두고 처음부터 다시 등장시킨다.
  // 돌아오는 전환(settle·depart·return)이 끝났을 때는 아무것도 하지 않는다: 책들이 제자리에 서 있다. 다만 책이 놓였다는 알림 없이
  // 끝났으면(장면이 그려지지 않아 부모가 기다리다 끝냈다) 날던 책을 거두고 처음부터 다시 등장시킨다
  const wasFlying = useRef<'out' | 'in' | null>(null)
  useEffect(() => {
    const was = wasFlying.current
    wasFlying.current = flight === null ? null : flight === 'fly' || flight === 'handoff' ? 'out' : 'in'
    if (flight !== null || was === null) return
    const stranded = was === 'in' && returnPending.current
    returnPending.current = false
    if (!(was === 'out' || stranded) || !active || !scene) return
    scene.setActive(false)
    scene.setActive(true)
  }, [scene, flight, active])

  // 줄이 다 섰을 때 포커스가 이 줄의 책에 있으면(줄이 서기 전에 Tab으로 가려진 책에 가 있던 경우) 그 책이 보이게 줄을 넘긴다.
  // 책 페이지를 닫고 돌아올 때는 포커스가 책이 아니라 제목(.fields__anchor)에 있어 여기에 해당하지 않는다.
  // 줄은 스크롤 0에서 다시 서므로, 끌어 넘겨야 보이는 책(다섯째 이후)은 가려져 있다
  useEffect(() => {
    if (!row || row.max <= 0) return
    const buttons = Array.from(listRef.current?.querySelectorAll<HTMLElement>('.fbooks3d__book') ?? [])
    const focused = buttons.indexOf(document.activeElement as HTMLElement)
    if (focused < 0 || live.current.width <= 0) return
    const at = sceneRef.current?.bookBox(focused)
    if (at) glideTo(revealScroll(motion.current.pos, at, live.current.width, row.max))
  }, [row, glideTo])

  // 버튼 자리: 줄이 멈추거나 다시 움직일 때, 책 자리의 크기가 바뀔 때, 학문이 바뀔 때 다시 놓는다(스크롤 중에는 `scrollTo`가 놓는다)
  useLayoutEffect(() => {
    placeButtons()
  }, [placeButtons, row, scene, box, books])

  const draggable = row !== null && row.max > 0

  // ── 키보드: ←/→는 줄을 한 권씩 넘긴다(끝에서 멈춤). 창이 열려 있거나 화면이 보이지 않으면 듣지 않는다 ──
  useEffect(() => {
    if (!active || !draggable) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      if (isTypingTarget(e.target) || isModalOpen()) return
      const { row: now } = live.current
      if (!now) return
      const from = motion.current.target ?? motion.current.pos
      glideTo(stepTarget(from, e.key === 'ArrowRight' ? 1 : -1, now.stops, now.max))
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [active, draggable, glideTo])

  // ── 가로 휠(트랙패드의 좌우 쓸기): 분류 화면 어디서든 줄을 넘긴다. 세로 휠은 다이얼의 몫이라 건드리지 않는다 ──
  useEffect(() => {
    const root = rootRef.current
    const area = root?.closest<HTMLElement>('.fields') ?? root
    if (!area || !active) return
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || isModalOpen()) return
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return
      e.preventDefault()
      const { row: now } = live.current
      if (!now || now.max <= 0) return
      stopMotion()
      const delta = e.deltaMode === 1 ? e.deltaX * WHEEL_LINE_PX : e.deltaX
      // 트랙패드는 스스로 관성을 보내 준다: 저항 없이 끝에서 멈춘다
      scrollTo({ pos: Math.min(now.max, Math.max(0, motion.current.pos + delta)), vel: 0, target: null })
    }
    area.addEventListener('wheel', onWheel, { passive: false })
    return () => area.removeEventListener('wheel', onWheel)
  }, [active, scrollTo, stopMotion])

  // ── 포인터: 잡고 좌우로 끌면 줄이 손을 따라오고, 놓으면 관성으로 흐른다. 끌지 않은 클릭은 책을 고른다 ──
  const drag = useRef<{ id: number; x: number; y: number; from: number; axis: 'x' | 'y' | null; samples: PointerSample[] } | null>(null)
  /** 방금 끌었다: 뒤따라오는 클릭은 책을 열지 않는다 */
  const dragged = useRef(false)
  const localPoint = (e: { clientX: number; clientY: number }, el: HTMLElement) => {
    const rect = el.getBoundingClientRect()
    return [e.clientX - rect.left, e.clientY - rect.top] as const
  }
  const endDrag = (e: ReactPointerEvent<HTMLDivElement>, release: boolean) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    drag.current = null
    e.currentTarget.removeAttribute('data-dragging')
    if (d.axis !== 'x') return
    dragged.current = true
    const max = live.current.row?.max ?? 0
    if (max <= 0) return
    const vel = release ? releaseVelocity(d.samples, performance.now()) : 0
    motion.current = { pos: motion.current.pos, vel, target: null }
    runMotion()
  }
  /** 끄는 줄이 끝을 넘어 저항에 닿아 있는가(닿는 순간 한 번만 소리 자리 `rowEnd`를 부른다. 2026-11-25 효과음) */
  const pastEnd = useRef(false)
  const pointer = {
    onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => {
      drag.current = null
      dragged.current = false
      pastEnd.current = false
      if (e.pointerType === 'mouse' && e.button !== 0) return
      if (!live.current.row || isModalOpen()) return
      // 흐르던 줄은 잡는 순간 그 자리에서 멈춘다
      stopMotion()
      motion.current = { pos: motion.current.pos, vel: 0, target: null }
      drag.current = {
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        from: motion.current.pos,
        axis: null,
        samples: [{ t: performance.now(), x: e.clientX }],
      }
    },
    onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => {
      const d = drag.current
      if (!d || d.id !== e.pointerId) {
        // 끌지 않는 동안: 포인터가 책 위에 있으면 누를 수 있다는 표시를 하고, 마우스라면 그 책이 살짝 돈다
        if (e.pointerType === 'touch') return
        const [x, y] = localPoint(e, e.currentTarget)
        const over = sceneRef.current?.bookAt(x, y) ?? null
        e.currentTarget.dataset.over = over !== null ? 'book' : ''
        if (e.pointerType === 'mouse') sceneRef.current?.setHover(live.current.row ? over : null)
        return
      }
      const dx = e.clientX - d.x
      d.axis ??= dragAxis(dx, e.clientY - d.y)
      // 세로로 더 움직였으면 줄을 넘기지 않는다(세로 쓸기는 다이얼 돌리기: `useScreen`이 받는다)
      if (d.axis === 'y') drag.current = null
      if (d.axis !== 'x') return
      // 끄는 동안에는 포인터를 올린 책이 돌지 않는다
      sceneRef.current?.setHover(null)
      const max = live.current.row?.max ?? 0
      // 세 권 이하는 고정: 끌어도 움직이지 않는다(끈 뒤의 클릭만 막는다)
      if (max <= 0) return
      if (!e.currentTarget.hasAttribute('data-dragging')) {
        e.currentTarget.setAttribute('data-dragging', '')
        try {
          e.currentTarget.setPointerCapture?.(e.pointerId)
        } catch {
          // 이미 끝난 포인터: 잡지 못해도 끌기는 이어진다
        }
      }
      d.samples.push({ t: performance.now(), x: e.clientX })
      if (d.samples.length > 12) d.samples.shift()
      // 끝을 넘어 저항이 걸리기 시작하는 순간: 작은 "툭"(끝 안으로 돌아왔다 다시 닿으면 또 난다)
      const over = d.from - dx < 0 || d.from - dx > max
      if (over && !pastEnd.current) play('rowEnd')
      pastEnd.current = over
      scrollTo({ pos: rubberBand(d.from - dx, max), vel: 0, target: null })
    },
    onPointerUp: (e: ReactPointerEvent<HTMLDivElement>) => endDrag(e, true),
    onPointerCancel: (e: ReactPointerEvent<HTMLDivElement>) => endDrag(e, false),
    onPointerLeave: (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!drag.current) e.currentTarget.dataset.over = ''
      sceneRef.current?.setHover(null)
    },
    onClick: (e: ReactMouseEvent<HTMLDivElement>) => {
      // 책 버튼에서 온 클릭(키보드의 Enter·Space)은 그 버튼이 처리한다
      if (e.target instanceof Element && e.target.closest('.fbooks3d__book')) return
      if (dragged.current) {
        dragged.current = false
        return
      }
      if (isModalOpen()) return
      const [x, y] = localPoint(e, e.currentTarget)
      const i = sceneRef.current?.bookAt(x, y) ?? null
      const book = i === null ? undefined : live.current.books[i]
      if (i === null || !book) return
      // 판은 포커스를 받지 않으니, 누른 책의 버튼에 포커스를 둔다(키보드로 고른 것과 같은 상태에서 책 페이지를 연다.
      // 책 페이지가 닫히면 포커스는 이 버튼이 아니라 보이지 않는 제목으로 간다)
      listRef.current?.querySelectorAll<HTMLElement>('.fbooks3d__book')[i]?.focus({ preventScroll: true })
      openBook(i)
    },
  }

  /**
   * i번째 책을 연다: 부모에게 알리고, 부모가 날려 보내라고 하면(`fly`) 그 책이 들려서 책 페이지의 자리로 날아간다.
   * 날아가기 시작하면 흐르던 줄은 그 자리에서 멈춘다
   */
  const openBook = (i: number) => {
    const book = live.current.books[i]
    if (!book) return
    live.current.onOpenBook?.(book, (plan, onLanded) => {
      const flying = sceneRef.current?.flyOut?.(i, plan, onLanded) ?? false
      if (flying) stopMotion()
      return flying
    })
  }

  /** 화면 밖(스크롤로 가려진) 책에 포커스가 가면 그 책이 보이게 줄을 넘긴다 */
  const revealBook = (i: number) => {
    const { row: now, width } = live.current
    if (!now || now.max <= 0 || width <= 0) return
    const at = sceneRef.current?.bookBox(i)
    if (at) glideTo(revealScroll(motion.current.pos, at, width, now.max))
  }

  return (
    <div ref={rootRef} className="fbooks3d" data-grab={draggable ? '' : undefined} {...pointer}>
      <div ref={hostRef} className="fbooks3d__canvas" data-flight={flight ?? undefined} aria-hidden="true" />
      <ol ref={listRef} className="fbooks3d__books" aria-label={`${field.name}의 책`}>
        {books.map((book, i) => (
          <li key={book.no} data-no={book.no}>
            <button
              type="button"
              className="fbooks3d__book"
              data-no={book.no}
              aria-label={`${book.no}권 ${book.title}`}
              onFocus={() => revealBook(i)}
              onClick={() => openBook(i)}
            />
          </li>
        ))}
      </ol>
    </div>
  )
}

export default FieldBooks3D
