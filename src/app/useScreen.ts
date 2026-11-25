import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import {
  createWheelStepper,
  dragAxis,
  isModalOpen,
  isTypingTarget,
} from '../shelf/useShelfGestures'
import {
  BOOK_CLOSE_MS,
  BOOK_FLY_MS,
  BOOK_OPEN_MS,
  BOOK_TURN_MS,
  FIELD_STEP_MS,
  INITIAL_SCREEN,
  SCREEN_TRANSITION_MS,
  WHEEL_SCREEN_LOCK_MS,
  fieldOf,
  isBookView,
  screenReducer,
  type Screen,
  type ScreenAction,
  type ScreenState,
} from './screen'

/** 세로 쓸기: 이만큼 움직이면 화면을 바꾼다 */
export const SWIPE_STEP_PX = 48

/** 키를 누르고 있을 때(자동 반복): 이보다 빠른 반복은 버린다 */
export const GLIDE_STEP_MS = 90
/** 키 반복이 이 시간 넘게 오지 않으면 손을 뗀 것으로 본다(keyup을 못 받았을 때) */
export const GLIDE_END_MS = 200

/** 한 권씩 넘길 때 책이 움직이는 시간(ms). CSS의 `--dur-shelf`와 같은 값 */
export const STEP_MOVE_MS = 680
/** 지나가다 멈춘 자리의 책이 펼쳐져 나오는 시간(ms). 한 권씩 넘길 때(680ms)보다 느리다 */
export const SETTLE_OPEN_MS = 900
/** 그 느린 속도를 유지하는 시간(ms): 펼쳐져 놓일 때까지 */
export const SETTLE_HOLD_MS = 1400

/**
 * 지나가는 동안 한 걸음이 미끄러지는 시간(ms): 걸음 간격의 1.6배(200~500ms).
 * 걸음이 빠르면 짧게, 느긋하면 길게 미끄러져, 한 권씩 넘길 때와 빠르게 넘길 때가 이어진다.
 */
export const glidePaceFor = (intervalMs: number) => Math.round(Math.min(500, Math.max(200, intervalMs * 1.6)))

/**
 * 지금 책이 한 번 움직이는 데 걸리는 시간(ms): 지나가는 동안에는 걸음의 빠르기(glidePace),
 * 지나가다 멈춘 직후에는 900ms, 평소에는 680ms. CSS 서가는 `--dur-shelf`로, WebGL 서가는 `moveMs`로 받는다.
 */
export const shelfMoveMs = ({ gliding, glidePace, settling }: { gliding: boolean; glidePace: number; settling: boolean }) =>
  gliding ? glidePace : settling ? SETTLE_OPEN_MS : STEP_MOVE_MS

/** 차례로 이어지는 이동의 한 단계(`applyWhenFree`): 앞 단계가 적용된 뒤 `afterMs`가 지나면 이 action을 적용한다 */
export interface RouteStep {
  action: ScreenAction
  afterMs: number
}

/** 잠금 때문에 미뤄 둔 이동(`applyWhenFree`)을 다시 해 보는 가장 긴 간격(ms) */
export const WAIT_RETRY_MS = 250

/** 화면·책 이동에 쓰는 키. 이 밖의 키는 건드리지 않는다 */
/** 누르고 있으면 책장이 계속 지나가는 키 */
const GLIDE_KEYS = ['ArrowLeft', 'ArrowRight']

const SCREEN_KEYS = ['ArrowDown', 'PageDown', 'ArrowUp', 'PageUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End', ' ', 'Escape']

/** Space를 스스로 쓰는 요소(버튼·링크 등) 위에서는 Space로 화면을 바꾸지 않는다 */
const isControl = (target: EventTarget | null) =>
  target instanceof Element && target.closest('button, a[href], summary, [role="button"], [tabindex]:not([tabindex="-1"])') !== null

/** 화면이 바뀐 뒤 포커스를 옮길지: 키보드·버튼으로 왔으면 옮긴다(휠·쓸기는 그대로 둔다) */
type Via = 'focus' | 'none'

/**
 * 화면이 바뀐 뒤 포커스를 받을 요소: 서가는 가운데 책, 인트로는 `[ 서가 보기 ]`(키보드 포커스 때만 보이는 버튼),
 * 신간 소개는 도서명 제목(`tabindex="-1"`, 테두리 없음), 학제별 분류는 글자 다이얼의 지금 학문
 */
export const FOCUS_AFTER: Record<Screen, string> = {
  intro: '.intro__enter',
  feature: '.feature__title',
  shelf: '.shelf [aria-current="true"]',
  fields: '.fdial [aria-current="true"]',
}

/**
 * 화면(인트로/신간 소개/서가/학제별 분류)과 가운데 책의 상태, 그리고 그 상태를 바꾸는 입력(휠·키보드·세로 쓸기).
 * 규칙은 순수 함수 `screenReducer`에 있고, 여기서는 입력을 action으로 바꾸고 잠금·포커스를 맡는다.
 * `rootRef`는 화면 전체(.app). 돌려주는 `pointer` 핸들러를 그 요소에 붙인다.
 */
export function useScreen(rootRef: RefObject<HTMLElement | null>, count: number, initial: ScreenState = INITIAL_SCREEN) {
  const [state, setState] = useState(initial)
  const live = useRef(state)
  const focusAfter = useRef(false)
  /** 화면이 바뀌는 동안(전환 시간)에는 눌린 채 반복되는 키를 받지 않는다 */
  const changingUntil = useRef(0)
  /** 책 페이지의 전환(열기·닫기·넘기기)이 끝나는 때. 그때까지 책 페이지를 움직이는 입력은 받지 않는다 */
  const bookBusyUntil = useRef(0)
  /** 화면 전체의 잠금이 끝나는 때(`lock`): 책이 날아서 분류 화면으로 돌아오는 동안에는 어떤 입력도 받지 않는다 */
  const lockedUntil = useRef(0)
  /** 글자 다이얼(학제별 분류)을 마지막으로 돌린 때. 누르고 있는 키는 `FIELD_STEP_MS`마다 한 칸만 돌린다 */
  const fieldStepAt = useRef(0)
  const wheel = useRef<ReturnType<typeof createWheelStepper> | null>(null)
  /**
   * ←/→ 키를 누르고 있어 책장이 계속 지나가는 중인지. 이 동안 서가는 책을 한 권씩 펼치지 않고
   * 책등만 보인 채 미끄러지고, 손을 떼면 멈춘 자리의 책이 펼쳐진다.
   */
  const [gliding, setGliding] = useState(false)
  /** 지나가는 동안 한 걸음이 미끄러지는 시간(ms) */
  const [glidePace, setGlidePace] = useState(200)
  const glide = useRef<{ lastStepAt: number; timer: ReturnType<typeof setTimeout> | null }>({ lastStepAt: 0, timer: null })
  /** 지나가다 멈춘 책이 천천히 펼쳐져 나오는 중인지 */
  const [settling, setSettling] = useState(false)
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stopSettling = useCallback(() => {
    if (settleTimer.current) clearTimeout(settleTimer.current)
    settleTimer.current = null
    setSettling(false)
  }, [])
  const endGlide = useCallback(() => {
    if (glide.current.timer) clearTimeout(glide.current.timer)
    const wasGliding = glide.current.timer !== null
    glide.current.timer = null
    setGliding(false)
    if (!wasGliding) return
    // 멈춘 자리의 책은 천천히 나온다
    if (settleTimer.current) clearTimeout(settleTimer.current)
    setSettling(true)
    settleTimer.current = setTimeout(stopSettling, SETTLE_HOLD_MS)
  }, [stopSettling])

  /**
   * action을 적용한다. 화면이 바뀌었으면 true.
   * 책 페이지의 전환이 도는 동안에는 책 페이지를 열고 닫고 넘기는 action을 받지 않는다(건너뛰거나 두 번 넘어가지 않게).
   * 로고로 인트로에 가는 것과, 주소가 이미 바뀐 경우(`force`: 브라우저의 뒤로 가기)는 그대로 받는다.
   */
  const apply = useCallback(
    (action: ScreenAction, via: Via = 'none', force = false) => {
      const prev = live.current
      const next = screenReducer(prev, action, count)
      if (next === prev) return false
      // 책이 날아서 돌아오는 동안(`lock`): 로고로 인트로에 가는 것과 주소가 이미 바뀐 경우만 받는다
      if (!force && next.screen !== 'intro' && Date.now() < lockedUntil.current) return false
      const wasBook = isBookView(prev)
      const isBook = isBookView(next)
      if (wasBook || isBook) {
        const now = Date.now()
        const leaving = next.screen !== 'shelf'
        // 전환이 도는 동안에는 닫는 것도 받지 않는다(분류 화면으로 닫는 Esc 포함). 로고로 인트로에 가는 것만 그대로 받는다
        if (!force && next.screen !== 'intro' && now < bookBusyUntil.current) return false
        // 다른 화면에서 책 페이지로 바로 왔으면 서가에서 여는 전환이 없다. 분류 화면의 3D 책은 책이 날아가 닿을 때까지,
        // 주소로 들어온 것은 화면이 옮겨 가는 동안만 잠근다
        const arriving = !wasBook && prev.screen !== 'shelf'
        const arriveMs = next.from === 'fields' ? BOOK_FLY_MS : SCREEN_TRANSITION_MS
        const ms = leaving ? 0 : arriving ? arriveMs : !wasBook ? BOOK_OPEN_MS : !isBook ? BOOK_CLOSE_MS : BOOK_TURN_MS
        bookBusyUntil.current = now + ms
        wheel.current?.lock(ms)
      }
      if (fieldOf(next) !== fieldOf(prev)) fieldStepAt.current = Date.now()
      live.current = next
      setState(next)
      // 책이 천천히 나오던 중에 다시 움직이면 원래 속도로 돌아간다
      if (settleTimer.current) stopSettling()
      if (next.screen === prev.screen) return false
      focusAfter.current = via === 'focus'
      changingUntil.current = Date.now() + SCREEN_TRANSITION_MS
      // 어떤 입력으로 바뀌었든, 전환이 끝날 때까지 휠은 받지 않는다(쌓인 델타도 버린다)
      wheel.current?.lock(WHEEL_SCREEN_LOCK_MS)
      return true
    },
    [count, stopSettling],
  )

  /**
   * 지금부터 ms 동안 입력을 받지 않는다(휠도 잠근다). 분류 화면에서 연 책 페이지를 닫아 그 책이 날아서 돌아오는 동안
   * App이 건다(`BOOK_RETURN_MS`): 돌아오게 할 수 없어 예전 방식으로 물러날 때는 걸지 않는다
   */
  const lock = useCallback((ms: number) => {
    lockedUntil.current = Date.now() + ms
    wheel.current?.hold(ms)
  }, [])
  /**
   * `lock`으로 건 잠금을 바로 푼다. 돌아오는 전환이 끝났거나 도중에 거둬졌을 때 App이 부른다: 잠금만 남지 않게.
   * `lock`이 건 것만 푼다: 화면이 바뀐 뒤의 휠 잠금(`WHEEL_SCREEN_LOCK_MS`)과 책 페이지의 잠금(`bookBusyUntil`)은 그대로다.
   * `lock`을 건 적이 없으면 아무것도 하지 않는다
   */
  const unlock = useCallback(() => {
    if (lockedUntil.current === 0) return
    lockedUntil.current = 0
    wheel.current?.release()
  }, [])

  /**
   * action을 적용하되, 전환이 도는 동안이라 받지 않으면(책 페이지의 잠금·`lock`) 버리지 않고 잠금이 풀린 뒤에 적용한다.
   * 전체 메뉴에서 고른 이동이 쓴다: 고른 것이 조용히 사라지지 않는다. 기다리는 것은 하나뿐이다(다시 부르면 앞의 것을 버린다).
   * 미뤄 둔 이동은 고른 때의 상태에 묶여 있다: 기다리는 사이에 다른 경로로 상태가 바뀌었으면(로고로 인트로에 갔다,
   * 브라우저의 뒤로 가기로 책 페이지가 닫혔다, 주소가 다른 권으로 바뀌었다) 버린다. 나중의 입력을 덮어쓰지 않는다
   */
  /**
   * 여러 단계로 된 길도 받는다(`RouteStep[]`: 전체 메뉴에서 고른 책 — 서가가 그 책으로 넘어가고, 놓인 뒤에 뽑는다.
   * `menu/bookRoute.ts`). 단계는 앞 단계가 적용된 뒤 `afterMs`를 기다려 이어지고, 길 전체가 한 동작이다: 단계가 스스로 바꾼
   * 상태에 다시 묶이므로, 기다리는 사이에 다른 입력이 상태를 바꾸면 남은 단계를 버린다
   */
  const waiting = useRef<ReturnType<typeof setTimeout> | null>(null)
  const applyWhenFree = useCallback(
    (route: ScreenAction | readonly RouteStep[], via: Via = 'none') => {
      if (waiting.current) clearTimeout(waiting.current)
      waiting.current = null
      const steps: readonly RouteStep[] = 'type' in route ? [{ action: route, afterMs: 0 }] : route
      /** 묶여 있는 상태: 처음에는 고른 때의 상태, 그 뒤로는 앞 단계가 만든 상태 */
      let bound = live.current
      const attempt = (i: number) => {
        waiting.current = null
        const step = steps[i]
        if (!step) return
        const before = live.current
        if (before !== bound) return // 그 사이에 다른 경로로 상태가 바뀌었다: 남은 것은 버린다
        // 이미 그 자리면 이 단계는 할 일이 없다
        if (screenReducer(before, step.action, count) !== before) {
          apply(step.action, via)
          if (live.current === before) {
            // 잠겨 있다: 풀릴 때쯤 다시 해 본다(잠금이 일찍 풀리거나 늘어날 수 있어 길어도 WAIT_RETRY_MS마다 본다)
            const left = Math.max(lockedUntil.current, bookBusyUntil.current) - Date.now()
            waiting.current = setTimeout(() => attempt(i), Math.min(WAIT_RETRY_MS, Math.max(left, 0) + 20))
            return
          }
        }
        // 이 단계가 스스로 바꾼 상태에 다시 묶고, 다음 단계를 그 시점에 잇는다
        bound = live.current
        const next = steps[i + 1]
        if (next) waiting.current = setTimeout(() => attempt(i + 1), next.afterMs)
      }
      attempt(0)
    },
    [apply, count],
  )
  useEffect(
    () => () => {
      if (waiting.current) clearTimeout(waiting.current)
    },
    [],
  )

  // 화면이 바뀐 뒤의 포커스(키보드·버튼으로 왔을 때만)
  useEffect(() => {
    if (!focusAfter.current) return
    focusAfter.current = false
    rootRef.current?.querySelector<HTMLElement>(FOCUS_AFTER[state.screen])?.focus({ preventScroll: true })
  }, [state.screen, rootRef])

  // 책 페이지가 열리면 그 제목으로, 닫히면 서가의 가운데 책으로 포커스를 옮긴다(어떤 입력으로 열고 닫았든).
  // 분류 화면에서 연 책 페이지를 닫았으면 분류 화면의 보이지 않는 제목으로 옮긴다: 책에 두지 않는다(돌아온 책 둘레에
  // 포커스 링이 그려지지 않게. 2026-11-23 편집자 요청). 다음 Tab은 다이얼의 지금 학문 → 그 학문의 책들이다
  const bookOpen = isBookView(state)
  const wasBookOpen = useRef(bookOpen)
  useEffect(() => {
    if (wasBookOpen.current === bookOpen) return
    wasBookOpen.current = bookOpen
    const root = rootRef.current
    if (!bookOpen && state.screen === 'fields') {
      const target = root?.querySelector<HTMLElement>('.fields__anchor') ?? root?.querySelector<HTMLElement>('.fdial [aria-current="true"]')
      target?.focus({ preventScroll: true })
      return
    }
    if (state.screen !== 'shelf') return
    const selector = bookOpen ? '.bookpage__title' : '.shelf [aria-current="true"]'
    root?.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true })
  }, [bookOpen, state.screen, rootRef])

  // 키보드: 어디에 포커스가 있든 듣는다(모달이 열려 있거나 글자를 입력하는 중이면 물러난다)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return
      if (isTypingTarget(e.target) || isModalOpen()) return
      // 신간 소개의 영상에 포커스가 있으면 키는 그 조작부의 것이다(↑/↓ 소리, ←/→ 건너뛰기, Space 재생)
      if (e.target instanceof HTMLMediaElement) return
      if (!SCREEN_KEYS.includes(e.key)) return
      const onBookPage = isBookView(live.current)
      // Esc는 책 페이지를 닫을 때만 쓴다
      if (e.key === 'Escape' && !onBookPage) return
      if (e.key === ' ') {
        // 서가에서는 Space가 포커스된 책을 연다. 인트로에서도 버튼 위라면 그 버튼의 것이다.
        if (live.current.screen !== 'intro' || isControl(e.target)) return
      }
      e.preventDefault()
      const now = Date.now()
      if (e.repeat && now < changingUntil.current) return
      const action: ScreenAction = { type: 'key', key: e.key }
      // 누르고 있는 키(자동 반복)는 화면을 바꾸지 않는다: 한 번 누르면 한 화면이고, 다음 화면까지 지나가지 않는다
      if (e.repeat && screenReducer(live.current, action, count).screen !== live.current.screen) return
      // 학제별 분류: 누르고 있으면 글자 다이얼이 이어서 돌되, 걸음 사이 최소 간격을 지킨다
      if (e.repeat && live.current.screen === 'fields' && now - fieldStepAt.current < FIELD_STEP_MS) return
      if (e.repeat && live.current.screen === 'shelf' && !onBookPage && GLIDE_KEYS.includes(e.key)) {
        // 누르고 있는 동안: 한 권씩 펼치지 않고 지나간다. 반복이 끊기면 멈춘 책을 펼친다
        if (glide.current.timer) clearTimeout(glide.current.timer)
        glide.current.timer = setTimeout(endGlide, GLIDE_END_MS)
        if (now - glide.current.lastStepAt < GLIDE_STEP_MS) return
        glide.current.lastStepAt = now
        setGlidePace(glidePaceFor(GLIDE_STEP_MS))
        setGliding(true)
        apply(action, 'focus')
        return
      }
      apply(action, 'focus')
    }
    const onKeyUp = () => {
      if (glide.current.timer) endGlide()
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      if (glide.current.timer) clearTimeout(glide.current.timer)
    }
  }, [apply, endGlide, count])

  // 휠·트랙패드: 화면 어디서든. preventDefault를 쓰려면 passive가 아닌 네이티브 리스너여야 한다
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    // 휠은 화면을 옮긴다(서가의 책은 넘기지 않는다). 책 페이지에서는 한 번 굴리면 한 권이다.
    // 학제별 분류에서는 굴린 자리를 본다: 글자 다이얼(.fdial) 위면 한 학문, 그 밖이면 화면 이동(규칙은 screen.ts)
    let overDial = false
    const stepper = createWheelStepper((direction) => {
      const before = live.current
      if (apply(overDial ? { type: 'wheel', direction, over: 'dial' } : { type: 'wheel', direction })) {
        // 책장이 지나가던 중(← → 를 누른 채)에 화면이 바뀌면 그 자리에서 멈춘다
        endGlide()
        return WHEEL_SCREEN_LOCK_MS
      }
      // 책 페이지: 넘어가는 동안의 휠은 버린다
      if (live.current !== before && isBookView(live.current)) return BOOK_TURN_MS
      // 학제별 분류: 글자 다이얼이 한 칸 돌았다. 같은 손짓의 나머지는 버리고, 계속 굴리면 이 간격으로 이어서 돈다
      if (live.current !== before && live.current.screen === 'fields') return FIELD_STEP_MS
      return undefined // 더 갈 곳이 없다(인트로의 위, 마지막 학문의 아래, 분류 화면의 다이얼 밖에서 아래, 끝 권의 책 페이지)
    })
    wheel.current = stepper
    // 학제별 분류: 가로 휠(트랙패드의 좌우 쓸기)은 다이얼을 돌리지 않는다. 책 줄을 넘기는 것은 책 자리의 몫이다
    // (`fields3d/FieldBooks3D`). 브라우저의 뒤로 가기 손짓이 되지 않게 막되, 평면 표지 줄의 가로 스크롤은 그대로 둔다
    const onWheel = (e: WheelEvent) => {
      const sideways = Math.abs(e.deltaX) > Math.abs(e.deltaY)
      if (sideways && live.current.screen === 'fields' && !e.ctrlKey && !isModalOpen()) {
        if (!(e.target instanceof Element && e.target.closest('.fcovers'))) e.preventDefault()
        return
      }
      overDial = e.target instanceof Element && e.target.closest('.fdial') !== null
      stepper.onWheel(e)
    }
    root.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      root.removeEventListener('wheel', onWheel)
      wheel.current = null
    }
  }, [rootRef, apply, endGlide])

  // 세로 쓸기(터치·마우스 끌기): 문턱을 넘는 순간 세로로 더 움직였으면 화면 전환으로 본다.
  // 가로 끌기는 서가가 책 넘기기로 쓴다(useShelfGestures와 같은 기준 dragAxis).
  const swipe = useRef<{ pointerId: number; x: number; y: number; axis: 'x' | 'y' | null } | null>(null)
  const pointer = useMemo(() => {
    const end = (e: ReactPointerEvent<HTMLElement>) => {
      if (swipe.current?.pointerId === e.pointerId) swipe.current = null
    }
    return {
      onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
        swipe.current = null
        if (e.pointerType === 'mouse' && e.button !== 0) return
        if (isModalOpen()) return
        // 화면의 본문에서 시작한 것만(헤더·하단 바 글자를 끄는 것은 아니다). 영상 위에서 끄는 것은 그 조작부의 것이다
        if (!(e.target instanceof Element) || !e.target.closest('.intro, .feature, .stage, .fields')) return
        if (e.target.closest('video')) return
        swipe.current = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, axis: null }
      },
      onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
        const s = swipe.current
        if (!s || s.pointerId !== e.pointerId) return
        const dy = e.clientY - s.y
        s.axis ??= dragAxis(e.clientX - s.x, dy)
        if (s.axis === 'x') swipe.current = null
        if (s.axis !== 'y' || Math.abs(dy) < SWIPE_STEP_PX) return
        swipe.current = null
        apply({ type: 'swipe', direction: dy < 0 ? 'up' : 'down' })
      },
      onPointerUp: end,
      onPointerCancel: end,
    }
  }, [apply])

  return { state, apply, applyWhenFree, lock, unlock, pointer, gliding, glidePace, settling }
}
