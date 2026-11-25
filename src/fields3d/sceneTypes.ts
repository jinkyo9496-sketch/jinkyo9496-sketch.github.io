/**
 * 학제별 분류의 책 장면(WebGL)과 React 컴포넌트(`FieldBooks3D`) 사이의 약속. three에 의존하지 않는다
 * (테스트에서는 이 모양의 가짜 장면을 넣는다).
 */
import type { Book } from '../data/books'
import type { PageView } from '../shelf3d/motion'
import type { CanvasFrame } from './motion'

/** 책 자리(캔버스)의 크기. 길이는 CSS px */
export interface FieldsStage {
  width: number
  height: number
  pixelRatio: number
  /**
   * 캔버스의 크기와 그 안에서 책 자리가 놓인 자리. 캔버스는 화면 전체를 덮는다: 날아가는 책이 책 자리 밖(책 페이지의 자리)까지
   * 간다. 적지 않으면 캔버스가 책 자리와 같다
   */
  canvas?: CanvasFrame
}

/** 책을 눌러 책 페이지로 날아갈 때 필요한 것 */
export interface FieldsFlight {
  /** 서가 장면의 화면 치수(화면 전체 기준 px): 책 페이지에서 책이 떠 있는 자리를 여기서 구한다(`shelf3d/motion.ts`의 `pagePose`) */
  page: PageView
  /** 책이 날아가는 동안 화면을 덮어 오는 바탕색(그 책의 대표색) */
  veil: string
}

/** 책 페이지를 닫아 그 책이 줄의 제자리로 날아서 돌아올 때 필요한 것 */
export interface FieldsReturn extends FieldsFlight {
  /** 책 페이지의 책이 포인터를 따라 돌아 있는 각(deg, `shelf3d/motion.ts`의 `pagePointerTurn`): 그 자세에서 출발한다. 없으면 쉬는 자세 */
  turn?: { yaw: number; pitch: number }
  /** 출발하기 전에 기다리는 시간(ms): 책 페이지의 책이 펼쳐져 있었으면 덮일 때까지. 그동안 캔버스는 보이지 않는다. 없으면 0 */
  waitMs?: number
}

/**
 * 돌아오는 전환의 단계 알림(차례로 한 번씩): 기다림이 끝나 책 페이지 위로 겹쳐 넘어오기 시작한다('depart') →
 * 다 넘어왔다, 이제 화면은 분류 화면이고 책이 날기 시작한다('return') → 책이 제자리에 놓였다('landed')
 */
export type FieldsReturnStep = 'depart' | 'return' | 'landed'

/** 가리키는 학문과 그 책(보이는 순서대로). key가 같으면 같은 학문이다 */
export interface SceneField {
  key: string
  books: readonly Book[]
}

/**
 * 다 돌아 멈춘 줄(표지가 정면을 보고 서 있다)의 끌기 정보(길이는 CSS px). 책이 다 돌기 전이나 학문이 바뀌는 중에는 줄이 없다(null).
 * 순수 계산은 `motion.ts`의 `scrollRange`·`scrollStops`
 */
export interface FieldsRow {
  /** 끌어 넘길 수 있는 길이. 세 권 이하는 0(고정) */
  max: number
  /** 책마다 멈출 자리: 그 책이 맨 앞에 오는 스크롤(0 ~ max) */
  stops: number[]
  /**
   * 줄이 서 있는 스크롤(0 ~ max). 책이 날아서 돌아온 줄에만 적는다: 그 책이 보이게 처음부터 넘겨진 채로 서 있다.
   * 적지 않으면 컴포넌트가 들고 있던 스크롤 그대로다(새로 선 줄은 0)
   */
  scroll?: number
}

/** 책 자리 안의 상자(CSS px, 왼쪽 위가 0) */
export interface FieldsBox {
  left: number
  top: number
  width: number
  height: number
}

export interface FieldsSceneHandle {
  setStage(stage: FieldsStage): void
  /**
   * 가리키는 학문이 바뀌었다: 보이던 책은 책등 쪽으로 돌아서며 왼쪽 끝(다이얼 쪽 서랍) 안으로 들어가고,
   * 잠깐 기다린 뒤 새 책이 그 서랍에서 처음부터 등장한다.
   * 기다리는 동안 또 바뀌면 중간 학문은 건너뛴다(`motion.ts`의 `requestItem`)
   */
  setField(field: SceneField): void
  /** 분류 화면이 보이는가. true가 되면 지금 학문의 책이 처음부터 등장하고, false인 동안에는 그리지 않는다 */
  setActive(active: boolean): void
  /**
   * 줄을 왼쪽으로 민 길이(CSS px). 범위는 0 ~ `FieldsRow.max`이고, 끝에서 저항하는 동안에는 양 끝을
   * `scroll.ts`의 `overscrollPx`까지 넘을 수 있다(그 밖은 자른다). 책이 다 돈 뒤에만 듣는다
   */
  setScroll(px: number): void
  /**
   * 포인터가 올라가 있는 책의 순번(없으면 null): 그 책이 살짝 돌아 책등이 조금 드러나고, 나가면 돌아온다.
   * 책이 다 돈 뒤에만 듣는다. 책을 고르는 자리(`bookAt`·`bookBox`)는 바뀌지 않는다
   */
  setHover(index: number | null): void
  /**
   * 멈춘 i번째 책이 들려서 책 페이지의 자리로 날아간다(`motion.ts`의 `flightFrame`). 나머지 책은 제자리에서 바탕색에 덮인다.
   * 닿으면 onLanded를 한 번 부르고, `setActive(false)`가 올 때까지 닿은 모습 그대로 있는다. 날아갈 수 없으면(책이 다 돌기 전,
   * 화면 치수를 모름) false를 돌려주고 아무것도 하지 않는다. 날아가는 동안에는 줄이 없다(`onRow(null)`)
   */
  flyOut?(index: number, flight: FieldsFlight, onLanded: () => void): boolean
  /**
   * 책 페이지를 닫았다: 그 학문의 줄이 처음부터 다 돌아 선 채로(서랍에서 나오지 않는다. 화면이 꺼져 있었어도 켠다) 서고,
   * i번째 책만 책 페이지의 자리에서 날아와 제자리에 놓인다(`motion.ts`의 `returnFrame`: `flyOut`의 거꾸로).
   * 그 책이 끌어 넘겨야 보이는 자리면 줄은 처음부터 보이게 넘겨져 있다(끝나면 `onRow`의 `scroll`로 알린다).
   * 단계마다 onStep을 부른다. 놓인 뒤에는 평소의 멈춘 줄과 같다. 돌아올 수 없으면(화면 치수를 모름) false를 돌려주고
   * 아무것도 하지 않는다. 돌아오는 동안에는 줄이 없다(`onRow(null)`)
   */
  flyIn?(field: SceneField, index: number, flight: FieldsReturn, onStep: (step: FieldsReturnStep) => void): boolean
  /** 책 자리의 한 점(CSS px) 위에 표지가 있는 책의 순번(그 학문 안에서). 없거나 아직 다 돌지 않았으면 null */
  bookAt(x: number, y: number): number | null
  /** 멈춘 i번째 책의 표지가 지금(스크롤한 자리에서) 화면에서 차지하는 상자. 아직 다 돌지 않았으면 null. 책 버튼을 이 자리에 놓는다 */
  bookBox(index: number): FieldsBox | null
  /** 잃었던 WebGL 컨텍스트가 돌아왔다: 다시 그린다 */
  restore(): void
  dispose(): void
}

export interface FieldsSceneOptions {
  canvas: HTMLCanvasElement
  /** 색 토큰(CSS에서 읽은 값): 그림 오기 전의 면, 종이 단면, 그림자 */
  colors: { blank: string; block: string; shadow: string }
  /** 처음 가리키는 학문 */
  field: SceneField
  /**
   * 줄이 달라졌다: 책이 다 돌아 멈췄거나(끌 수 있다), 다시 움직이거나(학문이 바뀜·화면을 떠남: null), 화면 크기가 바뀌었다.
   * 줄이 새로 멈추면 스크롤은 0이다
   */
  onRow?: (row: FieldsRow | null) => void
}

export type FieldsSceneFactory = (options: FieldsSceneOptions) => FieldsSceneHandle
