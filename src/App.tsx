import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { screenFromHash } from './app/bookHash'
import {
  BOOK_RETURN_MS,
  SCREEN_TRANSITION_MS,
  bookOrigin,
  fieldOf,
  isBookView,
  isWelcome,
  type Screen,
  type ScreenAction,
  type ScreenState,
} from './app/screen'
import { useBookHash } from './app/useBookHash'
import { FOCUS_AFTER, STEP_MOVE_MS, shelfMoveMs, useScreen, type RouteStep } from './app/useScreen'
import { TitleBand } from './band/TitleBand'
import { BottomBar } from './chrome/BottomBar'
import { GpuNotice } from './chrome/GpuNotice'
import { Header } from './chrome/Header'
import './chrome/chrome.css'
import type { Blurb } from './data/blurbs'
import { bookColors, pageColorsFor } from './data/bookColors'
import { bookContent, endsAtStore } from './data/bookContent'
import { clampSpread, maxSpread } from './reader/spread'
import { useOpeningLeap } from './reader/useOpeningLeap'
import { books } from './data/books'
import { fieldIndexOfBook, fields } from './data/fields'
import { BookDetail } from './detail/BookDetail'
import { FEATURE_BUBBLES, Feature } from './feature/Feature'
import { useFeature } from './feature/useFeature'
import { Fields } from './fields/Fields'
import type { FlightPhase, FlyReturner, FlyStarter } from './fields3d/FieldBooks3D'
import { FIELDS_FLIGHT, FIELDS_RETURN, flightTotalMs } from './fields3d/motion'
import type { FieldsReturnStep, FieldsSceneFactory } from './fields3d/sceneTypes'
import { Intro } from './intro/Intro'
import { Menu, MenuToggle, type MenuOpen } from './menu/Menu'
import { menuBookRoute } from './menu/bookRoute'
import { useLineup } from './intro/useLineup'
import { useLogoFlight } from './intro/useLogoFlight'
import { usePeek } from './intro/usePeek'
import { BookPage } from './page/BookPage'
import { Shelf } from './shelf/Shelf'
import { stepIndex } from './shelf/useShelfNavigation'
import { pagePointerTurn, type PageView } from './shelf3d/motion'
import type { RendererChoice } from './shelf3d/renderer'
import type { SceneFactory } from './shelf3d/sceneTypes'
import { useShelfRenderer } from './shelf3d/useShelfRenderer'
import { useSoundCues } from './sound/useSoundCues'

interface Props {
  /** 권별 부제·소개. 주지 않으면 `data/blurbs.ts`를 쓴다(테스트에서 바꿔 넣는다) */
  blurbs?: Readonly<Record<number, Blurb>>
  /** 처음 화면과 책(과 가리키는 학문 `field`). 주지 않으면 인트로 + 1권 + 철학(테스트에서 특정 책·학문으로 시작할 때 쓴다) */
  initial?: ScreenState
  /**
   * 서가를 무엇으로 그릴지. 'auto'(기본): WebGL을 쓸 수 있는 넓은 화면이면 WebGL 서가, 아니면 CSS 서가.
   * 'css' / 'webgl'은 강제(테스트, 주소의 `?shelf=css`). 'nogpu'는 그래픽 가속이 없는 기기 흉내(가속 안내 확인용).
   */
  renderer?: RendererChoice
  /** WebGL 장면을 만드는 함수(테스트에서 가짜 장면을 넣는다). 주지 않으면 three 장면 */
  createScene?: SceneFactory
  /** 학제별 분류의 3D 책 장면을 만드는 함수(테스트에서 가짜 장면을 넣는다). 주지 않으면 three 장면 */
  createFieldsScene?: FieldsSceneFactory
}

/** 책 페이지의 글이 사라지는 시간(ms). 그 뒤에 책 페이지를 치운다(bookPage.css의 opacity 전환) */
const PAGE_LEAVE_MS = 200

/**
 * 날아가는 책이 닿았다는 알림이 이 시간(ms)이 더 지나도록 오지 않으면(가려진 탭처럼 장면이 그려지지 않을 때)
 * 닿은 것으로 치고 책 페이지로 넘어간다
 */
const FLIGHT_LATE_MS = 1200

/**
 * 책 페이지의 펼친 책이 덮이는 시간(ms): `shelf3d/reader.ts`의 `READER.close`(700)에 조금 더한 값. 분류 화면에서 연 책 페이지를
 * 책이 펼쳐진 채로 닫으면, 이만큼 기다려 책이 덮인 뒤에 날아서 돌아간다(그동안 책 페이지의 글은 사라지고 책만 남는다)
 */
const PAGE_SHUT_MS = 760

/** 책 페이지의 책이 포인터를 따라 도는가(서가 장면 `Shelf3D`와 같은 판정: 마우스처럼 올려 둘 수 있는 포인터일 때만) */
const canHover = () => window.matchMedia?.('(hover: hover) and (pointer: fine)').matches ?? true

/** 책이 돌아오는 전환의 단계인가(`FlightPhase`의 settle·depart·return) */
const isReturning = (phase: FlightPhase) => phase === 'settle' || phase === 'depart' || phase === 'return'

/** 돌아오는 전환의 단계 순서: 알림이 늦거나 겹쳐 와도 뒤로 가지 않는다 */
const RETURN_ORDER: readonly FlightPhase[] = ['settle', 'depart', 'return', null]

/**
 * 날아가는·돌아오는 전환의 시간을 CSS에 넘긴다. 열 때: 바탕색이 들어오는 때와 걸리는 시간(헤더가 캔버스의 바탕색과 함께 바뀐다),
 * 겹쳐 넘어가는 시간. 닫을 때(거꾸로): 겹쳐 넘어오는 시간, 바탕색이 걷히는 때와 걸리는 시간(책이 날기 시작한 뒤부터 잰다),
 * 다이얼이 다시 나타나는 때(바탕색이 다 걷힌 뒤)와 걸리는 시간(책이 놓일 때까지)
 */
const FLIGHT_STYLE = {
  '--fly-veil-at': `${FIELDS_FLIGHT.liftMs + FIELDS_FLIGHT.flyMs * FIELDS_FLIGHT.veilFrom}ms`,
  '--fly-veil-ms': `${FIELDS_FLIGHT.flyMs * (FIELDS_FLIGHT.veilTo - FIELDS_FLIGHT.veilFrom)}ms`,
  '--flight-fade': `${FIELDS_FLIGHT.liftMs + FIELDS_FLIGHT.flyMs * FIELDS_FLIGHT.veilFrom}ms`,
  '--flight-handoff': `${FIELDS_FLIGHT.handoffMs}ms`,
  '--return-depart': `${FIELDS_RETURN.departMs}ms`,
  '--return-veil-at': `${FIELDS_RETURN.flyMs * (1 - FIELDS_FLIGHT.veilTo)}ms`,
  '--return-veil-ms': `${FIELDS_RETURN.flyMs * (FIELDS_FLIGHT.veilTo - FIELDS_FLIGHT.veilFrom)}ms`,
  '--return-fade-at': `${FIELDS_RETURN.flyMs * (1 - FIELDS_FLIGHT.veilFrom)}ms`,
  '--return-fade-ms': `${FIELDS_RETURN.flyMs * FIELDS_FLIGHT.veilFrom + FIELDS_RETURN.settleMs}ms`,
}

/** 미리보기가 없는 권: 면지만 있다 */
const NO_PREVIEW = { pages: 0 }

/** 모달(상세)이 열려 있는가 */
const anyDialogOpen = () => document.querySelector('dialog[open]') !== null

/** 가려진 화면에 주는 속성: 포커스·클릭·읽기에서 모두 뺀다 */
const offScreen = (hidden: boolean) => ({ inert: hidden, 'aria-hidden': hidden || undefined })

export default function App({ blurbs, initial, renderer = 'auto', createScene, createFieldsScene }: Props) {
  // 화면(인트로/신간 소개/서가/학제별 분류)과 현재 책 상태는 App이 가진다. 규칙은 `app/screen.ts`.
  // 주소가 책 페이지(`#/book/N`)를 가리키면 그 책의 페이지에서 시작한다.
  const rootRef = useRef<HTMLDivElement>(null)
  const [first] = useState(() => initial ?? screenFromHash(window.location.hash, books.length) ?? undefined)
  const { state, apply, applyWhenFree, lock, unlock, pointer, gliding, glidePace, settling } = useScreen(rootRef, books.length, first)
  useBookHash(state, apply, books.length)
  // 웰컴 자리(웰컴·신간 소개)에서는 서가의 책이 전부 책등으로 줄을 서 있고(1권이 왼쪽 끝), 서가로 내려가면 줄이 밀리며
  // 가운데 책이 펼쳐지고, 올라가면 그 책이 꽂힌 뒤 줄이 1권 자리로 돌아간다. 그 단계와 박자(`intro/lineup.ts`)
  // 서가에 내려온 뒤의 책 넘기기(특히 ←/→를 누르고 있는 gliding)에는 단계의 값이 끼지 않는다: 그때는 단계를 거둔다
  const row = useLineup(state.screen, isBookView(state), state.index, books.length, gliding)
  // 책이 한 번 움직이는 시간: CSS 서가와 타이틀 띠는 --dur-shelf로, WebGL 서가는 moveMs로 받는다
  const moveMs = row.moveMs ?? shelfMoveMs({ gliding, glidePace, settling })
  const stageDuration = moveMs === STEP_MOVE_MS ? null : moveMs
  /** 가운데 책을 펼치지 않는가: 책장이 지나가는 중이거나, 웰컴과 서가 사이에서 책등인 채 밀리고 꽂히는 중 */
  const closed = gliding || row.closed
  // WebGL 서가(three)는 따로 받는다. 받는 동안에는 서가 칸을 비워 둔다(그때 사용자는 인트로에 있다)
  const shelfRenderer = useShelfRenderer(renderer)
  // 인트로 아래에 서가의 책 머리가 비친다: 서가 화면을 얼마나 당겨 둘지를 재서 CSS에 넘긴다(`intro.css`가 쓴다)
  const introPeek = usePeek(rootRef, books)
  // 웰컴 ↔ 신간 소개: 헤더의 로고를 큰 로고 자리에 겹치는 값(`intro.css`가 쓴다. 큰 로고가 헤더로 날아간다)
  const logoFlight = useLogoFlight(rootRef, `${state.screen} ${introPeek['--peek-zone'] ?? ''}`)
  const Shelf3D = shelfRenderer.Shelf3D
  const { screen, index } = state
  const onShelf = screen === 'shelf'
  const current = books[index]
  // 신간 소개의 단계: 웰컴에서 내려오면 처음부터 저절로 이어지고, 서가에서 올라오면 마지막 모습으로 바로 놓인다
  const feature = useFeature(screen)
  /** 바로 앞 화면(처음에는 없다). CSS가 어디서 왔는지에 따라 전환을 고른다: 웰컴 ↔ 신간 소개에서만 로고가 난다 */
  const [trail, setTrail] = useState<{ screen: Screen; from: Screen | null }>({ screen, from: null })
  if (trail.screen !== screen) setTrail({ screen, from: trail.screen })
  const cameFrom = trail.screen === screen ? trail.from : trail.screen

  const goTo = (i: number) => apply({ type: 'goTo', index: i })
  /** 권수 다이얼(서가 하단 바·책 페이지)로 책을 고른 횟수. 효과음이 다이얼로 고른 것을 알아본다("톡" 대신 다이얼의 "틱") */
  const [dialPicks, setDialPicks] = useState(0)
  const goByDial = (i: number) => {
    setDialPicks((n) => n + 1)
    goTo(i)
  }
  const prev = () => apply({ type: 'prev' })
  const next = () => apply({ type: 'next' })

  // 서가가 보이지 않는 동안(학제별 분류), 그리고 거기서 돌아오기 시작하는 첫 순간까지는 책이 움직이는 전환을 끈다.
  // 다른 화면에서 책을 골라 올 때(주소의 책 번호 등) 책들이 미끄러지지 않고 제자리에서 나타난다.
  // 웰컴 화면에서는 끄지 않는다(2026-11-24): 서가의 책 머리가 비치고, 웰컴과 서가를 오갈 때 책이 꽂히고 밀리는 것이 보여야 한다.
  const away = screen === 'fields'
  const [arriving, setArriving] = useState(away)
  useEffect(() => {
    if (away) {
      setArriving(true)
      return
    }
    const id = requestAnimationFrame(() => setArriving(false))
    return () => cancelAnimationFrame(id)
  }, [away])
  const still = away || arriving

  // 현재 책이 바뀌면 보조 기술에 한 번만 알린다. 포커스가 서가의 책에 있으면 포커스가 새 책으로
  // 옮겨 가며 이미 읽히므로 알리지 않는다. 첫 화면도 알리지 않는다(h1이 읽힌다).
  // 서가가 보이지 않는 동안(인트로·학제별 분류)에는 알리지 않는다.
  const currentLabel = `${current.no}권 ${current.title}`
  const [announcement, setAnnouncement] = useState('')
  const announced = useRef(currentLabel)
  useEffect(() => {
    if (announced.current === currentLabel) return
    announced.current = currentLabel
    const focusOnShelf = document.activeElement?.closest('.shelf') != null
    setAnnouncement(focusOnShelf || !onShelf ? '' : currentLabel)
  }, [currentLabel, onShelf])

  // ── 전체 메뉴(2026-11-25): 헤더 오른쪽 끝의 `[ + ]`로 여는 판(`menu/Menu`). 인트로에서는 버튼을 거두고 판도 닫는다 ──
  const [menu, setMenu] = useState<MenuOpen>(false)
  if (menu && screen === 'intro') setMenu(false)
  const menuOpen = menu !== false && screen !== 'intro'
  const menuButton = () => rootRef.current?.querySelector<HTMLElement>('.menu-toggle')
  /** 판을 닫는다. 포커스는 버튼으로 돌아온다(화면이 바뀌면 그 뒤에 새 화면의 자리로 옮겨 간다: `useScreen`) */
  const closeMenu = () => {
    setMenu(false)
    menuButton()?.focus({ preventScroll: true })
  }
  /**
   * 판에서 고른 곳으로 간다. 전환이 도는 동안이라 잠겨 있으면 버리지 않고 잠금이 풀린 뒤에 간다(`applyWhenFree`):
   * 판은 바로 닫히고, 고른 이동은 조용히 사라지지 않는다
   */
  const goFromMenu = (route: ScreenAction | readonly RouteStep[]) => {
    closeMenu()
    applyWhenFree(route, 'focus')
  }

  const [detailOpen, setDetailOpen] = useState(false)
  const detailOpener = useRef<HTMLElement | null>(null)
  /**
   * 학제별 분류의 평면 표지에서 연 상세 창이 보이는 책(books의 순번). 서가의 가운데 책과 따로 둔다:
   * 분류 화면에서 책을 열어 봐도 화면과 서가의 책은 그대로다. 서가에서 연 상세 창은 null(가운데 책을 따라간다)
   */
  const [detailIndex, setDetailIndex] = useState<number | null>(null)

  // ── 책 페이지: WebGL 서가일 때 상세 dialog 대신 열린다(CSS 서가에서는 dialog 그대로) ──
  const webgl = shelfRenderer.renderer === 'webgl'
  const bookOpen = isBookView(state)
  const pageOpen = bookOpen && webgl
  // 캔버스는 서가 화면 전체를 덮는 이 요소에 들어간다(책 페이지에서는 책이 서가 칸 밖에 떠 있다)
  const [canvasHost, setCanvasHost] = useState<HTMLDivElement | null>(null)
  /** 닫히는 중: 글이 사라질 때까지 책 페이지를 잠깐 남겨 둔다 */
  const [leaving, setLeaving] = useState(false)
  /**
   * 어떻게 이 책 페이지에 왔는가: 주소로 바로(direct) / 서가에서 열어서(open) / 다른 책 페이지에서 넘겨서(turn).
   * 학제별 분류의 3D 책에서 열 때도 direct다: 서가에서 책이 떠오르는 전환 없이 책 페이지가 다 차려진다
   * (서가 장면은 보이지 않는 동안 열렸으므로 책이 이미 떠 있다). 그동안 화면에는 분류 화면이 남아 누른 책이
   * 책 페이지의 자리로 날아가고, 닿으면 전환 없이 서가 자리로 바뀐다(`flight`). 책을 날릴 수 없을 때만
   * 전처럼 화면이 700ms에 서가 자리로 옮겨 온다.
   */
  const [pageEntry, setPageEntry] = useState<'direct' | 'open' | 'turn'>(pageOpen ? 'direct' : 'open')
  /** 책 페이지를 닫으면 돌아갈 곳(열 때 적어 둔다: 닫힌 뒤 그 책이 분류 화면으로 날아서 돌아갈지를 이것으로 정한다) */
  const origin = bookOrigin(state)
  const [pageOrigin, setPageOrigin] = useState(origin)
  /** 떠 있는 책의 펼침면(`reader/spread.ts`): 0 = 덮임, 1 = 펼쳐 면지, 2부터 본문. 책이 바뀌거나 닫히면 덮인다 */
  const [spread, setSpread] = useState(0)
  /** 펼친 책에서 포인터가 올라가 있는 면과 그 위쪽·아래쪽(그쪽 낱장의 모서리가 들린다) */
  const [peek, setPeek] = useState<{ side: 'left' | 'right'; corner: 'top' | 'bottom'; depth?: number } | null>(null)
  /** 책 페이지가 열린 횟수(BookPage의 key) */
  const [pageOpens, setPageOpens] = useState(0)
  /**
   * 학제별 분류의 3D 책과 책 페이지 사이의 전환.
   * 열 때: 누른 책이 들려서 책 페이지의 자리로 날아가는 동안('fly')에는 상태가 이미 책 페이지여도 화면은 분류 화면 그대로 보이고,
   * 닿으면('handoff') 전환 없이 서가 자리로 바꾼 뒤 분류 화면의 캔버스가 책 페이지 위에서 옅어진다.
   * 닫을 때(그 거꾸로): 상태는 바로 분류 화면이지만 화면은 책 페이지 그대로 보이고(대표색과 떠 있는 책이 남는다. 글은 사라진다),
   * 책이 펼쳐져 있었으면 덮이기를 기다린 뒤('settle') 분류 화면의 캔버스가 그 위로 떠오른다('depart'). 다 떠오르면 전환 없이
   * 분류 화면으로 바꾸고 그 책이 줄의 제자리로 날아와 놓인다('return').
   * 날릴 수 없을 때(평면 표지, 화면 치수를 모름, 장면이 거절)는 없다(null): 화면이 700ms에 옮겨 간다
   */
  const [flight, setFlight] = useState<FlightPhase>(null)
  /** 돌아오는 전환을 몇 번 시작했는가(시작할 때마다 장면에 그 책을 돌려보내라고 한다)와, 그때 책이 덮이기를 기다리는 시간 */
  const [returns, setReturns] = useState({ count: 0, waitMs: 0 })
  const [seen, setSeen] = useState({ pageOpen, index })
  if (seen.pageOpen !== pageOpen || seen.index !== index) {
    setSeen({ pageOpen, index })
    setSpread(0)
    setPeek(null)
    if (seen.pageOpen !== pageOpen) {
      setLeaving(!pageOpen)
      // 분류 화면에서 연 책 페이지를 닫았다: 그 책이 날아서 돌아간다(할 수 없으면 아래의 효과가 바로 거둔다)
      // 전체 메뉴로 다른 학문을 골라 닫았으면(다이얼이 그 책의 학문을 가리키지 않는다) 날리지 않는다: 화면이 옮겨 간다
      const flyBack =
        !pageOpen &&
        !bookOpen &&
        webgl &&
        screen === 'fields' &&
        pageOrigin === 'fields' &&
        flight === null &&
        fieldIndexOfBook(current.no) === fieldOf(state)
      if (flyBack) {
        // 책 페이지의 모습(`data-page`)은 그대로 둔다: 캔버스가 겹쳐 넘어올 때까지 아무것도 움직이지 않는다
        setFlight(spread > 0 ? 'settle' : 'depart')
        setReturns({ count: returns.count + 1, waitMs: spread > 0 ? PAGE_SHUT_MS : 0 })
      } else setPageEntry(pageOpen && origin === 'fields' ? 'direct' : 'open')
      if (pageOpen) {
        setPageOpens(pageOpens + 1)
        setPageOrigin(origin)
      }
    } else if (pageOpen) setPageEntry('turn')
  }
  useEffect(() => {
    if (!leaving) return
    const id = setTimeout(() => setLeaving(false), PAGE_LEAVE_MS)
    return () => clearTimeout(id)
  }, [leaving])
  // 책 페이지가 열린 채로 연 곳이 바뀌었다(전체 메뉴에서 책을 골라 `from`을 잊었다): 닫힐 때의 판단도 따라간다
  if (pageOpen && pageOrigin !== origin) setPageOrigin(origin)
  const returning = isReturning(flight)
  // 날아가는 중에 책 페이지가 닫혔다(브라우저의 뒤로 가기) / 돌아오는 중에 다시 열렸거나 다른 화면으로 갔다: 전환을 거둔다
  if (flight && (returning ? pageOpen || screen !== 'fields' : !pageOpen)) setFlight(null)
  // 돌아오는 전환이 끝났거나 거둬지면 그 전환이 건 입력 잠금도 푼다(거둔 뒤에 잠금만 남아 입력이 먹지 않는 일이 없게)
  const wasReturning = useRef(false)
  useLayoutEffect(() => {
    if (wasReturning.current && !returning) unlock()
    wasReturning.current = returning
  }, [returning, unlock])
  const land = useCallback(() => setFlight((phase) => (phase === 'fly' ? 'handoff' : phase)), [])
  /** 돌아오는 전환을 그 단계로 보낸다(앞으로만 간다. 전환이 이미 거둬졌으면 아무것도 하지 않는다) */
  const stepReturn = useCallback((to: 'depart' | 'return' | null) => {
    setFlight((phase) => (isReturning(phase) && RETURN_ORDER.indexOf(to) > RETURN_ORDER.indexOf(phase) ? to : phase))
  }, [])
  // 단계 알림(장면)이 오지 않아도(가려진 탭처럼 장면이 그려지지 않을 때) 얼마 뒤에는 다음 단계로 넘어간다
  useEffect(() => {
    if (!flight) return
    const after = (ms: number, then: () => void) => setTimeout(then, ms)
    const id =
      flight === 'fly'
        ? after(flightTotalMs() + FLIGHT_LATE_MS, land)
        : flight === 'handoff'
          ? after(FIELDS_FLIGHT.handoffMs, () => setFlight(null))
          : flight === 'settle'
            ? after(returns.waitMs + FLIGHT_LATE_MS, () => stepReturn('depart'))
            : flight === 'depart'
              ? after(FIELDS_RETURN.departMs + FLIGHT_LATE_MS, () => stepReturn('return'))
              : after(FIELDS_RETURN.flyMs + FIELDS_RETURN.settleMs + FLIGHT_LATE_MS, () => stepReturn(null))
    return () => clearTimeout(id)
  }, [flight, land, stepReturn, returns.waitMs])
  const flying = flight === 'fly'
  /**
   * 책 페이지가 화면에 남아 있는가: 열려 있거나, 닫혔지만 분류 화면의 캔버스가 다 겹쳐 넘어올 때까지(settle·depart).
   * 그동안 대표색·헤더·떠 있는 책(서가 장면)은 책 페이지의 것 그대로다
   */
  const holding = flight === 'settle' || flight === 'depart'
  /** 화면 틀이 지금 보이는 화면(책이 날아가는·돌아오는 동안에는 상태보다 한발 늦다) */
  const shown: Screen = flying ? 'fields' : holding ? 'shelf' : screen
  const pageShown = pageOpen || holding
  const pageColors = pageShown ? pageColorsFor(current.no) : null

  // 효과음(2026-11-25): 화면의 상태가 바뀔 때마다 그 사건의 소리 자리를 움직임의 시간표에 맞춰 부른다. 얹기만 한다:
  // 상태·입력·포커스에는 손대지 않는다(`sound/useSoundCues.ts`, 무엇을 언제 낼지는 `sound/cues.ts`)
  useSoundCues({
    screen,
    index,
    count: books.length,
    page: pageOpen,
    gliding,
    moveMs,
    spread,
    flight,
    field: fieldOf(state),
    fieldCount: fields[fieldOf(state)]?.nos.length ?? 0,
    books3d: webgl,
    featureStep: feature.step,
    featureInstant: feature.instant,
    bubbles: FEATURE_BUBBLES.length,
    dialPicks,
  })

  /**
   * 책 페이지에서 포인터가 있는 자리(화면 가운데가 0, 가장자리가 ±1): 떠 있는 책이 이만큼 따라 돌아 있다. 서가 장면(`Shelf3D`)이
   * 듣는 것과 같은 값을 따로 적어 둔다(돌아가는 책이 그 자세에서 출발한다). 책이 돌아갈 채비를 하는 동안(settle·depart)에는
   * 포인터의 움직임을 막아 책이 그 자세에 머물게 한다(그동안 다른 포인터 반응도 없다)
   */
  const pagePoint = useRef<{ x: number; y: number } | null>(null)
  useEffect(() => {
    if (!pageShown) return
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch' || !canHover()) return
      pagePoint.current = { x: (e.clientX / (window.innerWidth || 1)) * 2 - 1, y: (e.clientY / (window.innerHeight || 1)) * 2 - 1 }
    }
    window.addEventListener('pointermove', onMove)
    return () => {
      window.removeEventListener('pointermove', onMove)
      pagePoint.current = null
    }
  }, [pageShown])
  // 전체 메뉴가 열려 있는 동안에도 같다: 판 위에서 움직이는 포인터를 떠 있는 책이 따라 돌지 않는다(그 자세에 머문다)
  const stillPage = holding || (pageShown && menuOpen)
  useLayoutEffect(() => {
    if (!stillPage) return
    const swallow = (e: Event) => e.stopImmediatePropagation()
    window.addEventListener('pointermove', swallow, true)
    return () => window.removeEventListener('pointermove', swallow, true)
  }, [stillPage])
  const previewShape = bookContent(current.no) ?? NO_PREVIEW
  /** 책을 펼치고 덮고 넘긴다. 펼친 책은 앞표지 쪽에서 본다 */
  const turnTo = (next: number) => {
    const to = clampSpread(next, previewShape)
    setSpread(to)
  }
  // 책 전체가 든 권: 펼치면 면지에서 잠깐 머문 뒤 책의 가운데쯤으로 건너뛴다
  useOpeningLeap(pageOpen ? spread : 0, bookContent(current.no)?.mode === 'full', previewShape, turnTo)
  // 책이 펼쳐져 있는 동안: 좌우 화살표는 책이 아니라 낱장을 넘기고, Esc는 책을 덮는다(한 번 더 누르면 서가로)
  const turnRef = useRef({ spread, turnTo })
  useEffect(() => {
    turnRef.current = { spread, turnTo }
  })
  // 전체 메뉴가 열려 있는 동안에는 물러난다: Esc는 패널만 닫고, 좌우 화살표는 낱장을 넘기지 않는다
  const reading = pageOpen && spread > 0 && !menuOpen
  useEffect(() => {
    if (!reading) return
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || anyDialogOpen()) return
      const { spread: s, turnTo: go } = turnRef.current
      const to = e.key === 'ArrowRight' ? s + 1 : e.key === 'ArrowLeft' ? s - 1 : e.key === 'Escape' ? 0 : null
      if (to === null) return
      e.preventDefault()
      e.stopPropagation()
      go(to)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [reading])

  // 책 페이지는 WebGL 장면이 그린다. 그릴 수 없으면(CSS 서가, 도중에 WebGL을 잃음) 그 책의 상세 dialog로 대신한다
  useEffect(() => {
    if (!bookOpen || webgl) return
    apply({ type: 'closeBook' }, 'none', true)
    if (!anyDialogOpen()) setDetailOpen(true)
  }, [bookOpen, webgl, apply])

  const openDetail = () => {
    if (anyDialogOpen()) return
    if (webgl) {
      apply({ type: 'openBook' })
      return
    }
    detailOpener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setDetailOpen(true)
  }

  /**
   * 서가 장면의 화면 치수(화면 전체 기준 px): 책 페이지에서 책이 떠 있는 자리를 정한다. `Shelf3D`가 장면에 넘기는 값과
   * 같은 것을 화면에서 다시 잰다(책 높이·올린 양은 서가 칸의 `--book-h`·`--lift`). 잴 수 없으면 null
   */
  const pageViewNow = (): PageView | null => {
    const shelf = rootRef.current?.querySelector<HTMLElement>('.shelf')
    if (!shelf || !canvasHost) return null
    const rowTop = shelf.getBoundingClientRect().top - canvasHost.getBoundingClientRect().top
    const view = {
      width: canvasHost.clientWidth,
      height: canvasHost.clientHeight,
      centreY: rowTop + shelf.clientHeight / 2 - parseFloat(shelf.style.getPropertyValue('--lift')),
      bookHeight: parseFloat(shelf.style.getPropertyValue('--book-h')),
    }
    return Object.values(view).every((n) => Number.isFinite(n) && n > 0) ? view : null
  }

  /** 분류 화면의 3D 책 자리가 내주는 "돌아오게 하기"(`fields3d/FieldBooks3D`). 3D 책이 그려져 있는 동안에만 들어 있다 */
  const fieldsReturner = useRef<FlyReturner | null>(null)
  /**
   * 돌아오는 전환을 시작한다: 분류 장면이 그 책의 학문의 줄을 세우고, 그 책을 책 페이지의 자리(포인터를 따라 돌아 있던 자세)에서
   * 날려 보낸다. 책이 펼쳐져 있었으면 덮일 때까지 기다렸다가 출발한다(`waitMs`). 시작했으면 true
   */
  const startReturn = useRef<() => boolean>(() => false)
  useLayoutEffect(() => {
    startReturn.current = () => {
      const page = pageViewNow()
      const veil = pageColorsFor(current.no)?.background
      if (!page || !veil || !fieldsReturner.current) return false
      const onStep = (step: FieldsReturnStep) => stepReturn(step === 'landed' ? null : step)
      return fieldsReturner.current(current.no, { page, veil, turn: pagePointerTurn(pagePoint.current), waitMs: returns.waitMs }, onStep)
    }
  })
  // 책 페이지가 닫혀 돌아오는 전환이 걸렸다(`returns`): 시작하고, 그동안 입력을 잠근다. 할 수 없으면(평면 표지, 화면 치수를 모름,
  // 장면이 거절) 전환을 거둔다: 예전처럼 화면이 옮겨 가고 책들이 서랍에서 다시 나온다
  const returnsStarted = useRef(0)
  useLayoutEffect(() => {
    // 같은 전환을 두 번 시작하지 않는다(개발 서버가 코드를 바꿔 끼우며 효과를 다시 돌릴 때)
    if (returns.count === returnsStarted.current) return
    returnsStarted.current = returns.count
    if (startReturn.current()) lock(returns.waitMs + BOOK_RETURN_MS)
    else setFlight((phase) => (isReturning(phase) ? null : phase))
  }, [returns, lock])

  /**
   * 학제별 분류의 책(3D)을 골랐다: 그 책의 책 페이지를 연다. 닫으면 분류 화면으로 돌아온다.
   * 책 페이지는 바로 열리고(전환 없이 다 차려진 채), 그 책이 들려서 책 페이지의 자리로 날아가 닿을 때까지 화면은
   * 분류 화면을 보인다. 날릴 수 없으면 지금처럼 화면이 서가 자리로 옮겨 간다
   */
  const openBookFromFields = (no: number, fly?: FlyStarter) => {
    const i = books.findIndex((book) => book.no === no)
    if (i < 0 || anyDialogOpen()) return
    const page = fly && webgl ? pageViewNow() : null
    const veil = pageColorsFor(no)?.background
    if (!apply({ type: 'openBook', index: i, from: 'fields' })) return
    if (page && veil && fly?.({ page, veil }, land)) setFlight('fly')
  }

  /**
   * 전체 메뉴에서 책을 골랐다: 그 책의 책 페이지로(서가의 가운데 책을 눌러 여는 것과 같은 책 페이지. 닫으면 서가다).
   * 책 페이지가 열려 있었으면 그 책의 페이지로 넘어간다. CSS 서가(책 페이지가 없다)에서는 서가를 그 책으로 옮기고 상세 창을 연다
   */
  const openBookFromMenu = (i: number) => {
    if (webgl) {
      // 서가·신간 소개에서는 두 단계다: 서가가 그 책으로 넘어가(내려가) 가운데에 놓인 뒤, 가운데 책을 눌러 열 때와 같은
      // 전환으로 뽑는다. 분류 화면과 책 페이지에서는 한 번에 간다(`menu/bookRoute.ts`)
      goFromMenu(menuBookRoute(state, i, books.length))
      return
    }
    goFromMenu({ type: 'goTo', index: i })
    // 닫히면 포커스는 서가의 가운데 책으로(`closeDetail`)
    detailOpener.current = rootRef.current?.querySelector<HTMLElement>('.shelf [aria-current="true"]') ?? null
    setDetailIndex(null)
    setDetailOpen(true)
  }

  /** 학제별 분류의 평면 표지를 눌렀다: 그 책의 상세 창을 연다. 화면과 서가의 책은 그대로다 */
  const openDetailFromFields = (no: number, opener: HTMLElement) => {
    const i = books.findIndex((book) => book.no === no)
    if (i < 0 || anyDialogOpen()) return
    detailOpener.current = opener
    setDetailIndex(i)
    setDetailOpen(true)
  }

  // 닫히면 연 곳으로 포커스를 돌려준다. 서가의 책에서 열었다면 지금의 가운데 책으로
  // (상세 안에서 책을 넘겼을 수 있고, 가운데 책만 탭 순서에 있다). 분류 화면의 표지에서 열었다면 그 표지로.
  const closeDetail = () => {
    setDetailOpen(false)
    setDetailIndex(null)
    const opener = detailOpener.current
    detailOpener.current = null
    const shelf = opener?.closest('.shelf')
    const target = shelf ? shelf.querySelector<HTMLElement>('[aria-current="true"]') : opener
    target?.focus({ preventScroll: true })
  }

  /**
   * 그래픽 가속 안내를 닫는다: 포커스가 그 안(닫기 버튼)에 있었으면 지금 화면에서 포커스를 받는 곳으로 옮긴다
   * (버튼이 사라지며 포커스가 문서 밖으로 떨어지지 않게). 화면을 바꿀 때와 같은 자리다(`FOCUS_AFTER`)
   */
  const leaveNotice = () => {
    if (!document.activeElement?.closest('.gpunotice')) return
    rootRef.current?.querySelector<HTMLElement>(FOCUS_AFTER[screen])?.focus({ preventScroll: true })
  }

  return (
    <div
      ref={rootRef}
      className="app"
      // 책이 돌아갈 채비를 하는 동안(settle·depart)에는 책 페이지의 모습 그대로다
      data-view={pageShown ? 'book' : undefined}
      data-page={pageShown ? pageEntry : undefined}
      data-fly={flying || undefined}
      data-return={flight === 'return' || undefined}
      style={
        {
          '--dur-screen': `${SCREEN_TRANSITION_MS}ms`,
          // 서가에서 웰컴으로 올라갈 때는 화면이 조금 늦게 움직인다: 가운데 책이 꽂히는 것이 먼저 보인다
          '--screen-delay': `${row.screenDelayMs}ms`,
          ...FLIGHT_STYLE,
          ...introPeek,
          ...logoFlight,
          // 책 페이지: 그 책의 대표색이 화면 전체의 바탕이 되고, 글자·선은 먹과 종이 중 잘 읽히는 쪽
          ...(pageColors && { '--page-bg': pageColors.background, '--page-fg': pageColors.text }),
        } as CSSProperties
      }
      {...pointer}
    >
      <Header
        /* 인트로에서는 헤더의 로고를 거두므로(intro.css), 포커스를 로고에 두지 않고 `[ 서가 보기 ]`(키보드 포커스 때만 보인다)로 옮긴다 */
        onHome={() => apply({ type: 'openIntro' }, 'focus')}
        // 책이 날아가는 동안에는 헤더가 아직 종이색이다: 로고는 닿은 뒤에 책 페이지의 것으로 바꾼다
        // (돌아갈 때는 거꾸로: 책이 날기 시작할 때 서가의 것으로 바꾼다)
        tone={pageShown && !flying ? bookColors[current.no]?.text : undefined}
        mono={pageShown && !flying}
        // 전체 메뉴 버튼: 헤더의 로고가 보이는 화면에서만(인트로에서는 로고와 함께 거둔다)
        end={<MenuToggle open={menuOpen} onToggle={(byKeys) => (menuOpen ? closeMenu() : setMenu(byKeys ? 'keys' : 'pointer'))} />}
        endOff={screen === 'intro'}
      />
      {/* 전체 메뉴: 헤더 바로 아래로 펼쳐진다. 헤더·화면들 밖이라 책 페이지에서 열어도 종이와 먹이다 */}
      <Menu
        open={menuOpen ? menu : false}
        here={{ place: bookOpen ? 'book' : screen === 'shelf' ? 'shelf' : screen === 'fields' ? 'fields' : null, index, field: fieldOf(state) }}
        onClose={closeMenu}
        onFields={() => goFromMenu({ type: 'jumpTo', screen: 'fields' })}
        onField={(i) => goFromMenu({ type: 'jumpTo', screen: 'fields', field: i })}
        onShelf={() => goFromMenu({ type: 'jumpTo', screen: 'shelf' })}
        onBook={openBookFromMenu}
      />
      {/* 그래픽 가속을 쓸 수 없어 CSS 서가로 물러났다: 가속을 켜 달라고 헤더 아래 한 줄로 알린다(어느 화면에서든 보인다) */}
      {shelfRenderer.accelerationOff && <GpuNotice onDismiss={leaveNotice} inert={menuOpen} />}
      {/* 세 자리(웰컴 자리 · 서가 · 학제별 분류)가 위아래로 붙어 함께 움직인다(페이지 스크롤이 아니라 transform). 보이지 않는 화면은 inert */}
      {/* 책이 날아가는 동안에는 분류 화면을 그대로 보이고, 닿으면 전환 없이(data-snap) 서가 자리로 바꾼다 */}
      {/* 돌아갈 때는 거꾸로: 분류 화면의 캔버스가 다 겹쳐 넘어올 때까지 서가 자리(책 페이지)를 보이다가 전환 없이 바꾼다 */}
      {/* 신간 소개는 웰컴과 같은 자리다(`data-place`): 화면이 밀려 올라가지 않고 아래에 서가의 책 머리가 그대로 비친다 */}
      <div
        className="screens"
        data-screen={shown}
        data-place={isWelcome(shown) ? 'welcome' : undefined}
        data-from={cameFrom ?? undefined}
        data-snap={flight ? '' : undefined}
        // 전체 메뉴가 열려 있는 동안: 아래의 화면은 그대로 보이되 조작되지 않는다
        inert={menuOpen || undefined}
      >
        <div className="screen" data-screen-name="intro" {...offScreen(screen !== 'intro')}>
          <Intro onOpenShelf={(from) => apply({ type: 'openShelf' }, from === 'button' ? 'focus' : 'none')} />
        </div>
        {/* 신간 소개: 인트로 위에 겹쳐 놓인다(`.screen--feature`). 서가 화면보다 앞에 두어 비치는 책이 그 위에 그려진다 */}
        <div className="screen screen--feature" data-screen-name="feature" {...offScreen(screen !== 'feature')}>
          <Feature
            step={feature.step}
            instant={feature.instant}
            active={screen === 'feature'}
            onOpenShelf={() => apply({ type: 'openShelf' })}
          />
        </div>
        <div
          className="screen screen--shelf"
          data-screen-name="shelf"
          data-still={still || undefined}
          {...offScreen(!onShelf)}
        >
          {webgl && <div ref={setCanvasHost} className="shelf-canvas" aria-hidden="true" />}
          <main
            className="stage"
            data-gliding={gliding || undefined}
            data-settling={(!gliding && settling) || undefined}
            style={stageDuration ? ({ '--dur-shelf': `${stageDuration}ms` } as CSSProperties) : undefined}
          >
            {/* 띠는 장식이라 숨기고, 현재 책은 이 제목과 아래 알림으로 전한다 */}
            {/* 책 페이지가 열려 있으면 서가는 조작·읽기에서 빠지고(책 페이지의 제목이 읽힌다), 띠만 남아 눌린다 */}
            <h1 className="sr-only" aria-hidden={pageOpen || undefined}>
              {currentLabel}
            </h1>
            <div className="sr-only" role="status" aria-atomic="true" aria-hidden={pageOpen || undefined}>
              {announcement}
            </div>
            <TitleBand books={books} currentIndex={index} onNavigate={goTo} />
            <div className="stage__shelf" {...offScreen(pageOpen)}>
            {shelfRenderer.renderer === 'css' ? (
              <Shelf
                books={books}
                currentIndex={index}
                onCurrentChange={goTo}
                onOpenCurrent={openDetail}
                inputs="pointer"
                closed={closed}
                lineup={row.lineup}
              />
            ) : Shelf3D && canvasHost ? (
              <Shelf3D
                books={books}
                currentIndex={index}
                onCurrentChange={goTo}
                onOpenCurrent={openDetail}
                inputs="pointer"
                closed={closed}
                lineup={row.lineup}
                moveMs={moveMs}
                // 책이 돌아갈 채비를 하는 동안(settle·depart)에도 떠 있는 책을 계속 그린다: 펼쳐져 있었으면 그동안 덮인다
                // 웰컴 자리(인트로·신간 소개)에서도 그린다: 서가의 책 머리가 그 아래에 비친다. 서가로 내려올 때는 켜진 채라
                // 책이 아래에서 다시 올라오는 등장(`setActive(true)`)이 돌지 않는다: 비치던 책이 그대로 서가가 된다
                active={onShelf || holding || isWelcome(screen)}
                onFail={shelfRenderer.fail}
                page={{ open: pageShown, side: 'front', spread, peek: spread > 0 ? peek : null }}
                canvasHost={canvasHost}
                {...(createScene && { createScene })}
              />
            ) : (
              <section className="shelf" aria-label="서가명강 서가" />
            )}
            </div>
          </main>
          <BottomBar
            books={books}
            currentIndex={index}
            onGo={goByDial}
            hidden={pageShown}
          />
          {(pageOpen || leaving) && (
            <BookPage
              // 닫히던 중에 다시 열리면 새로 만든다(글이 들어오는 움직임이 처음부터 다시 돈다)
              key={pageOpens}
              books={books}
              currentIndex={index}
              spread={spread}
              maxSpread={maxSpread(previewShape)}
              preview={previewShape}
              pile={bookContent(current.no)?.mode === 'full'}
              storeEnd={endsAtStore(bookContent(current.no))}
              onSpread={turnTo}
              onPeek={(next) =>
                setPeek((prev) =>
                  prev?.side === next?.side && prev?.corner === next?.corner && prev?.depth === next?.depth ? prev : next,
                )
              }
              onGo={goByDial}
              blurbs={blurbs}
              entrance={pageEntry === 'direct' ? 'direct' : 'open'}
              leaving={!pageOpen}
            />
          )}
        </div>
        <div className="screen" data-screen-name="fields" {...offScreen(screen !== 'fields')}>
          <Fields
            currentField={fieldOf(state)}
            onFieldChange={(i) => apply({ type: 'goField', index: i })}
            // 책 자리도 서가와 같은 판정을 따른다: WebGL 서가면 3D 책(누르면 책 페이지), 아니면 평면 표지(누르면 상세 창)
            renderer={shelfRenderer.renderer}
            // 책이 날아가 책 페이지와 겹쳐 넘어갈 때까지는 분류 화면의 장면이 계속 그린다
            active={screen === 'fields' || flight !== null}
            flight={flight}
            returner={fieldsReturner}
            createBooksScene={createFieldsScene}
            onOpenBook={openBookFromFields}
            onOpenDetail={openDetailFromFields}
          />
        </div>
      </div>
      <BookDetail
        open={detailOpen}
        onClose={closeDetail}
        books={books}
        currentIndex={detailIndex ?? index}
        // 분류 화면에서 연 상세 창은 서가를 움직이지 않고 창 안에서만 책을 넘긴다
        onPrev={detailIndex === null ? prev : () => setDetailIndex(stepIndex(detailIndex, { type: 'prev' }, books.length))}
        onNext={detailIndex === null ? next : () => setDetailIndex(stepIndex(detailIndex, { type: 'next' }, books.length))}
        blurbs={blurbs}
      />
    </div>
  )
}
