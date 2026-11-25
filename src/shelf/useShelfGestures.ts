import {
  useEffect,
  useLayoutEffect,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react'
import type { NavAction } from './useShelfNavigation'

/** 휠: 델타가 이만큼 쌓일 때마다 한 권 이동 */
export const WHEEL_STEP_PX = 40
/** 휠: 한 권 이동한 뒤 다음 이동까지의 최소 간격. 이 사이에 들어온 델타는 버리지 않고 쌓아 둔다 */
export const WHEEL_COOLDOWN_MS = 90
/** 휠: 쌓아 두는 델타의 상한(걸음 수). 크게 굴린 한 번이 뒤로 한 걸음 더 이어진다 */
const WHEEL_CARRY_STEPS = 1
/** 휠: 이 시간 넘게 쉬면 누적 델타를 버린다 */
const WHEEL_IDLE_RESET_MS = 250
/** 드래그: 이만큼 끌 때마다 한 권 이동 */
export const DRAG_STEP_PX = 70
/** 드래그: 이 거리 이상 움직이면 클릭이 아니라 드래그로 본다 */
export const DRAG_SLOP_PX = 6

const LINE_HEIGHT_PX = 16

export const isTypingTarget = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))

/**
 * 모달(상세 창)이 열려 있으면 서가는 키보드·휠에 반응하지 않는다.
 * 헤더의 전체 메뉴(`menu/Menu`의 `nav.menu[data-open]`)가 펼쳐져 있는 동안에도 같다: 화면의 입력은 물러나고 패널만 듣는다
 */
export const isModalOpen = () => document.querySelector('dialog[open], nav.menu[data-open]') !== null

/** 끌기의 방향: 문턱(DRAG_SLOP_PX)을 넘는 순간 더 많이 움직인 쪽. 아직 못 넘었으면 null */
export function dragAxis(dx: number, dy: number): 'x' | 'y' | null {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < DRAG_SLOP_PX) return null
  return Math.abs(dy) > Math.abs(dx) ? 'y' : 'x'
}

/**
 * 휠·트랙패드 델타를 "한 칸"으로 바꾸는 리스너를 만든다. 델타가 WHEEL_STEP_PX만큼 쌓일 때마다
 * onStep을 한 번 부른다(걸음 사이 최소 WHEEL_COOLDOWN_MS). 남은 델타는 다음 입력으로 넘겨,
 * 길게 굴리면 여러 권이 이어서 넘어간다. onStep이 숫자를 돌려주면 그 ms 동안은 들어오는 델타를
 * 모두 버린다(화면 전환). `lock(ms)`로 바깥에서도 잠글 수 있다(쌓인 델타도 버린다).
 * `hold(ms)`·`release()`는 따로 드는 잠금이다: 도중에 거둘 수 있는 전환이 쓰고, 풀어도 `lock`의 잠금은 남는다.
 * passive가 아닌 네이티브 리스너로 붙여야 한다(preventDefault).
 */
export function createWheelStepper(onStep: (direction: 'down' | 'up') => number | void) {
  let acc = 0
  let lastEventAt = 0
  let lastStepAt = 0
  let lockedUntil = 0
  let heldUntil = 0
  const cap = WHEEL_STEP_PX * WHEEL_CARRY_STEPS
  return {
    onWheel(e: WheelEvent) {
      if (isModalOpen()) return
      if (e.ctrlKey) return // 핀치 줌 제스처는 브라우저에 맡긴다(확대를 막지 않는다)
      e.preventDefault()
      const now = Date.now()
      if (now < lockedUntil || now < heldUntil) return
      if (now - lastEventAt > WHEEL_IDLE_RESET_MS) acc = 0
      lastEventAt = now
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
      acc += e.deltaMode === 1 ? delta * LINE_HEIGHT_PX : delta
      if (Math.abs(acc) >= WHEEL_STEP_PX && now - lastStepAt >= WHEEL_COOLDOWN_MS) {
        const direction = acc > 0 ? 'down' : 'up'
        const lockMs = onStep(direction)
        lastStepAt = now
        if (typeof lockMs === 'number') {
          acc = 0
          lockedUntil = now + lockMs
          return
        }
        acc -= direction === 'down' ? WHEEL_STEP_PX : -WHEEL_STEP_PX
      }
      acc = Math.max(-cap, Math.min(cap, acc))
    },
    lock(ms: number) {
      acc = 0
      lockedUntil = Math.max(lockedUntil, Date.now() + ms)
    },
    /**
     * 따로 드는 잠금 하나(`hold`): `lock`과 겹쳐 걸리고, `release`로 이것만 바로 풀 수 있다.
     * `lock`으로 건 잠금(화면 전환 등)은 `release`가 건드리지 않는다.
     */
    hold(ms: number) {
      acc = 0
      heldUntil = Date.now() + ms
    },
    release() {
      acc = 0
      heldUntil = 0
    },
  }
}

const KEY_ACTIONS: Record<string, NavAction> = {
  ArrowLeft: { type: 'prev' },
  ArrowRight: { type: 'next' },
  Home: { type: 'first' },
  End: { type: 'last' },
}

export interface ShelfGestureOptions {
  /** false면 키보드·휠은 듣지 않고 끌기만 처리한다(App이 화면 전체에서 대신 듣는다). 기본 true */
  keysAndWheel?: boolean
  /** 끌기가 시작될 때(문턱을 넘는 순간) 한 번 부른다 */
  onDragStart?: () => void
}

/**
 * 서가 조작(키보드·휠·드래그)을 NavAction으로 바꿔 navigate에 넘긴다.
 * 반환한 핸들러는 장면(scene) 요소에 붙인다.
 */
export function useShelfGestures(
  sceneRef: RefObject<HTMLElement | null>,
  index: number,
  navigate: (action: NavAction) => void,
  { keysAndWheel = true, onDragStart }: ShelfGestureOptions = {},
) {
  const live = useRef({ index, navigate, onDragStart })
  useLayoutEffect(() => {
    live.current = { index, navigate, onDragStart }
  })

  // 키보드: 서가를 먼저 클릭하지 않아도 동작하도록 window에서 듣는다
  useEffect(() => {
    if (!keysAndWheel) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return
      if (isTypingTarget(e.target) || isModalOpen()) return
      const action = KEY_ACTIONS[e.key]
      if (!action) return
      e.preventDefault()
      live.current.navigate(action)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [keysAndWheel])

  // 휠·트랙패드: preventDefault를 쓰려면 passive가 아닌 네이티브 리스너여야 한다
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene || !keysAndWheel) return
    const { onWheel } = createWheelStepper((direction) =>
      live.current.navigate({ type: direction === 'down' ? 'next' : 'prev' }),
    )
    scene.addEventListener('wheel', onWheel, { passive: false })
    return () => scene.removeEventListener('wheel', onWheel)
  }, [sceneRef, keysAndWheel])

  // 드래그·스와이프: 왼쪽으로 끌면 뒤 권으로(내용이 손가락을 따라온다).
  // 세로로 더 많이 움직인 끌기는 책을 넘기지 않는다(화면 전환은 App이 맡는다).
  const drag = useRef<{
    pointerId: number
    startX: number
    startY: number
    startIndex: number
    axis: 'x' | 'y' | null
  } | null>(null)
  const dragged = useRef(false)

  const endDrag = (e: ReactPointerEvent<HTMLElement>) => {
    if (drag.current?.pointerId !== e.pointerId) return
    drag.current = null
    delete e.currentTarget.dataset.dragging
  }

  return {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      dragged.current = false
      drag.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        startIndex: live.current.index,
        axis: null,
      }
    },
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
      const d = drag.current
      if (!d || d.pointerId !== e.pointerId) return
      const dx = e.clientX - d.startX
      if (d.axis === null) {
        d.axis = dragAxis(dx, e.clientY - d.startY)
        if (d.axis === null) return
        dragged.current = true
        e.currentTarget.dataset.dragging = 'true'
        // 포인터가 장면 밖으로 나가도 계속 따라오게 한다(jsdom에는 없는 API)
        e.currentTarget.setPointerCapture?.(e.pointerId)
        live.current.onDragStart?.()
      }
      if (d.axis === 'y') return
      const target = d.startIndex + Math.trunc(-dx / DRAG_STEP_PX)
      if (target !== live.current.index) live.current.navigate({ type: 'goTo', index: target })
    },
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
    // 드래그 끝에 따라오는 클릭이 책 선택으로 이어지지 않게 막는다
    onClickCapture: (e: ReactMouseEvent<HTMLElement>) => {
      if (!dragged.current) return
      dragged.current = false
      e.preventDefault()
      e.stopPropagation()
    },
  }
}
