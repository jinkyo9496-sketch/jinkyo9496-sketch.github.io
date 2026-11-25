import { fieldIndexOfBook, fields } from '../data/fields'
import { FIELDS_FLIGHT, flightTotalMs, returnTotalMs } from '../fields3d/motion'
import { stepIndex } from '../shelf/useShelfNavigation'

/**
 * 화면 넷, 위에서부터: 인트로(웰컴), 신간 소개(`feature`), 서가, 학제별 분류(`fields`).
 * 신간 소개는 웰컴과 같은 자리에서 내용만 바뀌는 화면이다(2026-11-24): 화면이 밀려 올라가지 않고, 아래에 비치는 서가의
 * 책 머리도 그대로다. 세로로 쌓여 움직이는 것은 웰컴 자리 / 서가 / 학제별 분류 셋이다(`index.css`의 `.screens`).
 */
export const SCREENS = ['intro', 'feature', 'shelf', 'fields'] as const
export type Screen = (typeof SCREENS)[number]

/** 웰컴 자리의 화면인가(인트로·신간 소개): 서가의 책이 전부 책등으로 줄을 서 있고 그 머리가 화면 아래에 비친다 */
export const isWelcome = (screen: Screen) => screen === 'intro' || screen === 'feature'

export interface ScreenState {
  screen: Screen
  /** 서가의 가운데 책 index. 다른 화면에 있는 동안에도 떠날 때의 값이 남아 있다(돌아오면 보던 책 그대로) */
  index: number
  /**
   * 'book'이면 서가 화면에서 가운데 책의 "책 페이지"가 열려 있다(책이 왼쪽에 떠 있고 오른쪽에 소개 글).
   * 서가만 보일 때는 이 값을 두지 않는다.
   */
  view?: 'book'
  /**
   * 책 페이지를 어디서 열었는가. 'fields'면 학제별 분류 화면의 3D 책에서 열었다: 닫으면 서가가 아니라 분류 화면으로
   * 돌아간다(책 페이지 안에서 다른 권으로 넘겨도 남는다. 그때 다이얼은 지금 보던 책의 학문을 가리킨다).
   * 서가에서 열었거나 주소로 들어왔으면 이 값을 두지 않는다.
   * 책 페이지가 열려 있는 동안에만 있다.
   */
  from?: 'fields'
  /**
   * 학제별 분류 화면의 글자 다이얼이 가리키는 학문(`data/fields.ts`의 index). 적지 않으면 0(철학).
   * 다른 화면에 있는 동안에도 남아 있다(돌아오면 보던 학문 그대로). 0일 때는 이 값을 두지 않는다.
   */
  field?: number
}

/** 지금 가리키는 학문의 index(처음은 0 = 철학) */
export const fieldOf = (state: ScreenState) => state.field ?? 0

/** 책 페이지가 열려 있는가 */
export const isBookView = (state: ScreenState) => state.screen === 'shelf' && state.view === 'book'

/** 열려 있는 책 페이지를 닫으면 돌아갈 화면: 분류 화면에서 열었으면 'fields', 아니면 'shelf' */
export const bookOrigin = (state: ScreenState): 'shelf' | 'fields' => (isBookView(state) && state.from === 'fields' ? 'fields' : 'shelf')

export type ScreenAction =
  /** 휠. `over: 'dial'`은 학제별 분류의 글자 다이얼 위에서 굴렸다는 뜻이다(다른 화면에서는 보지 않는다) */
  | { type: 'wheel'; direction: 'down' | 'up'; over?: 'dial' }
  | { type: 'key'; key: string }
  /** 세로로 쓸기. up = 손가락이 위로(내용이 올라온다) */
  | { type: 'swipe'; direction: 'up' | 'down' }
  /** 책을 고른다(권수 다이얼, 책등, 타이틀 띠). 어느 화면에서든 서가의 그 책으로 간다 */
  | { type: 'goTo'; index: number }
  | { type: 'next' }
  | { type: 'prev' }
  /**
   * 서가 화면으로 바로(인트로의 `[ 서가 보기 ]`, 인트로·신간 소개 아래에 비치는 책 자리. 학제별 분류의 `[ 서가로 ]`는
   * 2026-11-24에 없앴다). 가운데 책은 그대로
   */
  | { type: 'openShelf' }
  | { type: 'openIntro' }
  /** 학제별 분류 화면으로(`[ 학제별 분류 ]`) */
  | { type: 'openFields' }
  /** 글자 다이얼에서 학문을 고른다(이름을 눌렀을 때). 화면은 그대로다 */
  | { type: 'goField'; index: number }
  /**
   * 책 페이지를 연다. index가 없으면 서가의 가운데 책, 있으면 어느 화면에서든 그 책(주소로 들어왔을 때).
   * `from: 'fields'`는 학제별 분류 화면의 3D 책을 눌렀을 때: 닫으면 분류 화면으로 돌아온다(분류 화면에 있을 때만 받는다).
   * `menu: true`는 전체 메뉴의 책 목록에서 골랐을 때(2026-11-25): 그 책 페이지는 닫으면 늘 서가다. 분류 화면에서 연
   * 책 페이지가 열려 있었어도 연 곳(`from`)을 잊는다(같은 책을 골라도). 책 페이지 안의 평소 권 넘기기는 `from`을 그대로 둔다
   */
  | { type: 'openBook'; index?: number; from?: 'fields'; menu?: true }
  /** 책 페이지를 닫고 연 곳으로(서가, 또는 분류 화면에서 열었으면 분류 화면). 보던 책이 서가의 가운데 책이다 */
  | { type: 'closeBook' }
  /**
   * 전체 메뉴에서 화면을 골랐다(2026-11-25): 어디에 있든 그 화면으로 간다. 책 페이지가 열려 있으면 닫고 가며
   * (연 곳이 아니라 고른 곳으로), 보던 책이 서가의 가운데 책으로 남는다. `field`가 있으면 그 학문을 가리킨다(없으면 그대로)
   */
  | { type: 'jumpTo'; screen: 'shelf' | 'fields'; field?: number }

/** 첫 화면은 인트로. 서가는 1권에서 시작한다(그 뒤로는 화면을 오가도 보던 책이 남는다) */
export const INITIAL_SCREEN: ScreenState = { screen: 'intro', index: 0 }

/** 화면 전환 시간(ms). CSS의 `--dur-screen`은 App이 이 값으로 넣는다 */
export const SCREEN_TRANSITION_MS = 700
/** 휠: 화면이 바뀐 뒤 이 시간 동안은 휠을 받지 않는다(전환 시간 + 평소 쉬는 시간 160ms) */
export const WHEEL_SCREEN_LOCK_MS = SCREEN_TRANSITION_MS + 160

/**
 * 책 페이지의 전환 시간(ms). 이 동안에는 책 페이지를 움직이는 입력(휠·키·버튼)을 받지 않는다.
 * WebGL 장면의 움직임(`shelf3d/motion.ts`의 PAGE_OPEN·PAGE_CLOSE·PAGE_TURN)이 이 안에 끝난다.
 */
export const BOOK_OPEN_MS = 2400
export const BOOK_CLOSE_MS = 2450
export const BOOK_TURN_MS = 880
/**
 * 학제별 분류의 3D 책에서 연 책 페이지의 잠금 시간(ms): 책이 들려 책 페이지의 자리로 날아가고(`fields3d/motion.ts`의
 * `FIELDS_FLIGHT`) 책 페이지와 겹쳐 넘어갈 때까지. 이 동안의 입력(Esc 포함)은 받지 않는다
 */
export const BOOK_FLY_MS = flightTotalMs() + FIELDS_FLIGHT.handoffMs + 40
/**
 * 분류 화면에서 연 책 페이지를 닫고 그 책이 날아서 줄의 제자리에 놓일 때까지의 잠금 시간(ms, `fields3d/motion.ts`의
 * `FIELDS_RETURN`). 이 동안에는 분류 화면의 입력(다이얼·책·화면 이동)을 받지 않는다. 펼친 책이 덮이기를 기다렸다면 그만큼 더한다
 */
export const BOOK_RETURN_MS = returnTotalMs() + 40

/**
 * 글자 다이얼: 한 칸 돌린 뒤 다음 칸까지의 최소 간격(ms). 이 사이의 휠과 누르고 있는 키(자동 반복)는 버린다.
 * 다이얼이 한 칸 도는 시간(`fields.css`의 `--dial-turn` 650ms)보다 짧아, 연달아 굴리면 멈추지 않고 이어서 돈다.
 */
export const FIELD_STEP_MS = 280

const DOWN_KEYS = ['ArrowDown', 'PageDown']
const UP_KEYS = ['ArrowUp', 'PageUp']

/**
 * 화면·가운데 책·책 페이지를 바꾼 상태. 가리키던 학문은 그대로 따라간다.
 * 책 페이지를 어디서 열었는지(`from`)는 책 페이지가 열려 있는 동안만 남는다.
 */
const at = (state: ScreenState, screen: Screen, index: number, book = false, from = book ? state.from : undefined): ScreenState => {
  if (state.screen === screen && state.index === index && isBookView(state) === book && state.from === from) return state
  return {
    screen,
    index,
    ...(book && { view: 'book' as const }),
    ...(book && from && { from }),
    ...(state.field && { field: state.field }),
  }
}

/**
 * 책 페이지를 닫은 상태: 연 곳으로 돌아간다. 분류 화면으로 돌아갈 때는 지금 보던 책이 속한 학문을 가리킨다
 * (책 페이지 안에서 다른 권으로 넘겼으면 그 권의 학문. 권 번호는 순번 + 1이다)
 */
const closed = (state: ScreenState): ScreenState => {
  const origin = bookOrigin(state)
  const back = at(state, origin, state.index)
  const field = origin === 'fields' ? fieldIndexOfBook(state.index + 1) : null
  return field === null ? back : atField(back, field)
}

/** 가리키는 학문만 바꾼 상태(범위를 넘으면 끝에서 멈춘다) */
const atField = (state: ScreenState, field: number): ScreenState => {
  const to = Math.max(0, Math.min(fields.length - 1, Math.trunc(field)))
  if (to === fieldOf(state)) return state
  const { field: _, ...rest } = state
  return to ? { ...rest, field: to } : rest
}

/** 위아래를 가리키는 입력(휠, ↑/↓·PageUp/PageDown, 세로 쓸기)의 방향. 그런 입력이 아니면 null */
export function verticalOf(action: ScreenAction): 'up' | 'down' | null {
  switch (action.type) {
    case 'wheel':
      return action.direction
    case 'key':
      return DOWN_KEYS.includes(action.key) ? 'down' : UP_KEYS.includes(action.key) ? 'up' : null
    case 'swipe':
      // 손가락이 위로 가면 내용이 올라온다 = 아래 화면으로
      return action.direction === 'up' ? 'down' : 'up'
    default:
      return null
  }
}

/**
 * 화면과 가운데 책의 다음 상태. 바뀌는 것이 없으면 받은 state를 그대로 돌려준다.
 * 규칙은 화면마다 따로 둔다(`introReducer`·`shelfReducer`·`fieldsReducer`, 책 페이지는 `bookReducer`).
 * - 어느 화면에서든: 책을 고르면(goTo, 번호가 있는 openBook) 서가의 그 책으로, openIntro·openShelf·openFields는 그 화면으로.
 *   화면을 오가도 가운데 책은 그대로다.
 * - 인트로: 아래(휠·↓·PageDown·Space·쓸기) = 신간 소개. 위는 없다.
 * - 신간 소개: 아래 = 서가, 위 = 인트로. Space는 쓰지 않는다(영상의 조작부가 쓴다).
 * - 서가: 아래 = 학제별 분류, 위 = 신간 소개(몇 권이 가운데든). 책 넘기기는 ←/→·Home·End·next·prev·goTo.
 * - 학제별 분류: 위아래는 글자 다이얼을 돌린다(아래 = 다음 학문, 위 = 이전 학문, Home/End = 첫·마지막 학문).
 *   첫 학문(철학)에서 위로 가면 서가, 마지막 학문(과학)에서 아래는 멈춘다. 가리키던 학문은 화면을 오가도 남는다.
 * - 책 페이지: 아래·오른쪽 = 다음 권의 페이지, 위·왼쪽 = 이전 권의 페이지. 1권과 끝 권에서 멈춘다
 *   (페이지를 떠나지 않는다). Esc·closeBook으로 연 곳에 돌아간다(서가. 분류 화면의 3D 책에서 열었으면 분류 화면이고,
 *   다이얼은 지금 보던 책의 학문을 가리킨다).
 * - 전체 메뉴(jumpTo): 어디서든 고른 화면(서가·학제별 분류)으로. 책 페이지가 열려 있으면 닫고 간다.
 */
export function screenReducer(state: ScreenState, action: ScreenAction, count: number): ScreenState {
  // 전체 메뉴에서 고른 화면: 책 페이지가 열려 있든 아니든 같은 규칙이다
  if (action.type === 'jumpTo') {
    const moved = at(state, action.screen, state.index)
    return action.field === undefined ? moved : atField(moved, action.field)
  }
  if (isBookView(state)) return bookReducer(state, action, count)
  switch (action.type) {
    case 'goTo':
      return at(state, 'shelf', stepIndex(state.index, action, count))
    case 'openBook':
      if (action.index !== undefined) {
        const to = stepIndex(state.index, { type: 'goTo', index: action.index }, count)
        const from = !action.menu && action.from === 'fields' && state.screen === 'fields' ? 'fields' : undefined
        return at(state, 'shelf', to, true, from)
      }
      return state.screen === 'shelf' ? at(state, 'shelf', state.index, true) : state
    case 'closeBook':
      return state
    case 'openIntro':
      return at(state, 'intro', state.index)
    case 'openShelf':
      return at(state, 'shelf', state.index)
    case 'openFields':
      return at(state, 'fields', state.index)
    case 'goField':
      return atField(state, action.index)
  }
  switch (state.screen) {
    case 'intro':
      return introReducer(state, action)
    case 'feature':
      return featureReducer(state, action)
    case 'shelf':
      return shelfReducer(state, action, count)
    case 'fields':
      return fieldsReducer(state, action)
  }
}

type InputAction = Extract<ScreenAction, { type: 'wheel' | 'key' | 'swipe' | 'next' | 'prev' }>

/** 인트로: 아래로 가면 신간 소개(서가의 책은 그대로). Space도 아래다 */
function introReducer(state: ScreenState, action: InputAction): ScreenState {
  const down = verticalOf(action) === 'down' || (action.type === 'key' && action.key === ' ')
  return down ? at(state, 'feature', state.index) : state
}

/** 신간 소개: 아래로 가면 서가(보던 책 그대로), 위로 가면 인트로 */
function featureReducer(state: ScreenState, action: InputAction): ScreenState {
  const vertical = verticalOf(action)
  return vertical ? at(state, vertical === 'down' ? 'shelf' : 'intro', state.index) : state
}

/** 서가: 위아래는 화면을 옮기고, 좌우는 책을 넘긴다 */
function shelfReducer(state: ScreenState, action: InputAction, count: number): ScreenState {
  const vertical = verticalOf(action)
  if (vertical) return at(state, vertical === 'down' ? 'fields' : 'feature', state.index)
  const move = (nav: Parameters<typeof stepIndex>[1]) => at(state, 'shelf', stepIndex(state.index, nav, count))
  switch (action.type) {
    case 'key':
      if (action.key === 'ArrowLeft') return move({ type: 'prev' })
      if (action.key === 'ArrowRight') return move({ type: 'next' })
      if (action.key === 'Home') return move({ type: 'first' })
      if (action.key === 'End') return move({ type: 'last' })
      return state
    case 'next':
    case 'prev':
      return move(action)
    default:
      return state
  }
}

/**
 * 학제별 분류: 위아래 입력은 글자 다이얼을 한 칸 돌린다. 첫 학문에서 위로 갈 때만 서가로 가고,
 * 마지막 학문에서 아래는 멈춘다. 휠만은 굴린 자리를 본다: 글자 다이얼 위(`over: 'dial'`)에서는 다이얼을 돌리고,
 * 그 밖에서는 화면을 옮긴다(위 = 서가, 어느 학문이든. 아래는 더 갈 화면이 없어 멈춘다). Home/End는 첫·마지막 학문. 좌우(←/→)는 여기서 쓰지 않는다:
 * 책 줄을 한 권씩 넘기는 것은 책 자리(`fields3d/FieldBooks3D`)가 맡는다.
 */
function fieldsReducer(state: ScreenState, action: InputAction): ScreenState {
  const field = fieldOf(state)
  if (action.type === 'wheel' && action.over !== 'dial') {
    return action.direction === 'up' ? at(state, 'shelf', state.index) : state
  }
  const vertical = verticalOf(action)
  if (vertical === 'down') return atField(state, field + 1)
  if (vertical === 'up') return field === 0 ? at(state, 'shelf', state.index) : atField(state, field - 1)
  if (action.type === 'key' && action.key === 'Home') return atField(state, 0)
  if (action.type === 'key' && action.key === 'End') return atField(state, fields.length - 1)
  return state
}

/** 책 페이지가 열려 있을 때의 규칙 */
function bookReducer(state: ScreenState, action: Exclude<ScreenAction, { type: 'jumpTo' }>, count: number): ScreenState {
  const move = (nav: Parameters<typeof stepIndex>[1]) => at(state, 'shelf', stepIndex(state.index, nav, count), true)
  switch (action.type) {
    case 'wheel':
      return move({ type: action.direction === 'down' ? 'next' : 'prev' })
    case 'key':
      if (DOWN_KEYS.includes(action.key) || action.key === 'ArrowRight') return move({ type: 'next' })
      if (UP_KEYS.includes(action.key) || action.key === 'ArrowLeft') return move({ type: 'prev' })
      if (action.key === 'Escape') return closed(state)
      return state
    case 'next':
    case 'prev':
    case 'goTo':
      return move(action)
    case 'openBook': {
      if (action.index === undefined) return state
      const turned = move({ type: 'goTo', index: action.index })
      // 전체 메뉴에서 고른 책: 연 곳을 잊는다(닫으면 서가). 평소의 권 넘기기는 그대로 기억한다
      if (!action.menu || !turned.from) return turned
      const { from: _, ...fromShelf } = turned
      return fromShelf
    }
    case 'closeBook':
      return closed(state)
    case 'openIntro':
      return at(state, 'intro', state.index)
    case 'swipe':
    case 'openShelf':
    case 'openFields':
    case 'goField':
      return state
  }
}
