/**
 * WebGL 장면과 React 컴포넌트(`Shelf3D`) 사이의 약속. three에 의존하지 않는다
 * (테스트에서는 이 모양의 가짜 장면을 넣는다).
 */
import type { Book } from '../data/books'
import type { Tilt } from '../shelf/hover'

/**
 * 캔버스와 서가 칸의 치수. 길이는 CSS px.
 * 캔버스는 서가 칸만 덮을 수도, 화면 전체를 덮을 수도 있다(책 페이지는 화면 전체에 그린다):
 * width·height는 캔버스의 크기이고, 서가 칸의 자리는 centreY에 들어 있다.
 */
export interface Stage {
  width: number
  height: number
  bookHeight: number
  gap: number
  currentGap: number
  /** 서가에서 책의 세로 중심이 캔버스 위에서 몇 px 내려온 곳에 오는가 */
  centreY: number
  /**
   * 서가 칸의 아래 끝이 캔버스 위에서 몇 px 내려온 곳인가: 서가에서는 캔버스가 여기서 잘린다.
   * 바닥의 그림자가 이 선에 닿기 전에 다 옅어지게 한다(`floorShadow.ts`). 없으면 정해 둔 길이만큼 번진다
   */
  rowBottom?: number
  /** 웰컴 화면의 줄(`SceneState.lineup`)에서 1권 책등의 왼쪽 끝이 놓이는 가로 좌표(캔버스 가운데가 0, px) */
  lineupLeft?: number
  pixelRatio: number
}

export interface SceneState {
  /** 가운데 책 */
  index: number
  /** true면 가운데 책도 펼치지 않고 책등만 보인 채 지나간다 */
  closed: boolean
  /** 책이 한 번 움직이는 데 걸리는 시간(ms). 평소 680, 지나가는 동안 200~500, 멈춘 직후 900 */
  moveMs: number
  /**
   * true면 웰컴(인트로) 화면의 줄이다: 모든 책이 책등이고 1권 책등이 `Stage.lineupLeft`에서 시작해 번호순으로 이어진다.
   * 가운데 책(index)은 그대로 기억한다: 줄이 풀리면(false) 그 책이 가운데로 온다
   */
  lineup?: boolean
}

export interface ScenePointer {
  /** 포인터가 올라가 있는 책. 없으면 null */
  hoverIndex: number | null
  /**
   * 포인터가 가운데 표지의 어디에 있는가: CSS 서가와 같은 기울임 값(`tiltFor`, deg)으로 적는다. 없으면 null.
   * 장면은 이 값에서 표지 위의 자리를 되읽어 책을 돌린다(`motion.ts`의 `currentTurnOffset`)
   */
  tilt: Tilt | null
}

/** 책 페이지: 가운데 책이 화면 왼쪽에 떠 있고 나머지 책은 치워진 모습 */
export interface ScenePage {
  /** 책 페이지가 열려 있는가 */
  open: boolean
  /** 떠 있는 책이 보이는 면. 'back'이면 반 바퀴 돌아 뒤표지를 보인다 */
  side: 'front' | 'back'
  /**
   * 떠 있는 책의 펼침면(`reader/spread.ts`). 0 또는 없음 = 덮여 있다. 1 = 펼쳐 면지가 보인다, 2부터 본문.
   * 1씩 바뀌면 낱장이 넘어가고, 0과 오가면 표지가 열리고 닫힌다
   */
  spread?: number
  /** 펼친 책에서 포인터가 올라가 있는 면과 그 위쪽·아래쪽: 그쪽 맨 위 낱장의 가까운 모서리가 들린다 */
  peek?: { side: 'left' | 'right'; corner: 'top' | 'bottom'; depth?: number } | null
}

export interface ShelfSceneHandle {
  setStage(stage: Stage): void
  setState(state: SceneState): void
  setPointer(pointer: ScenePointer): void
  /**
   * 책 페이지를 열고 닫는다(가운데 책을 집어 들어 왼쪽에 띄우고, 나머지 책을 왼쪽으로 쓸어 낸다 / 되돌린다).
   * 열려 있는 동안 `setState`로 가운데 책이 바뀌면 보던 책이 왼쪽으로 나가고 새 책이 왼쪽에서 들어온다.
   */
  setPage(page: ScenePage): void
  /** 책 페이지에서 포인터의 자리(화면 가운데가 0, 가장자리가 ±1). 떠 있는 책이 조금 따라 돈다. 없으면 null */
  setPagePointer(point: { x: number; y: number } | null): void
  /** 서가 화면이 보이는가. true가 되면 책들이 아래에서 올라오고, false인 동안에는 그리지 않는다 */
  setActive(active: boolean): void
  /** 잃었던 WebGL 컨텍스트가 돌아왔다: 다시 그린다 */
  restore(): void
  dispose(): void
}

export interface SceneOptions {
  canvas: HTMLCanvasElement
  books: readonly Book[]
  /** 색 토큰(CSS에서 읽은 값): 그림 오기 전의 면, 종이 단면, 그림자 */
  colors: { blank: string; block: string; shadow: string }
  initial: SceneState
  /** 처음부터 책 페이지가 열려 있는가(주소 `#/book/N`으로 들어왔을 때). 기본은 닫힘 */
  page?: ScenePage
}

export type SceneFactory = (options: SceneOptions) => ShelfSceneHandle
