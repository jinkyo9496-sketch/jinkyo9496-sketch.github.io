/**
 * 효과음의 구분과 음원(2026-11-25). 순수 데이터만 둔다(three·DOM·Web Audio 없음. 단위 테스트 `tests/soundCatalog.test.ts`).
 *
 * 소리 자리마다 이름 하나가 있고, 자리는 음원 파일 하나를 쓰거나(`file`) 비어 있다(소리 없음).
 * 음원은 여섯 개뿐이고 여러 자리가 함께 쓴다: 어느 자리가 어느 음원을 쓰는지는 편집자가 들어 보고 정했다.
 * 어느 사건이 어느 자리를 부르는지는 `cues.ts`와 컴포넌트가 정하고, 표와 출처는 `docs/TODO.md`의 "조정 (2026-11-25): 효과음".
 * 음원을 바꾸려면 `public/sounds/`의 파일을 바꾸거나 여기의 `file`·`gain`을 고친다. 실제로 내는 것은 `engine.ts`.
 */

/** 음원 파일(`public/sounds/이름.wav`). 받은 녹음에서 필요한 부분만 자르고 음량을 맞춘 것 */
export const SOUND_FILES = {
  /** 책에 손가락이 닿는 "톡" */
  tok: '/sounds/tok.wav',
  /** 책이 떨어져 닿는 "툭" */
  thud: '/sounds/thud.wav',
  /** 책을 펼치는 종이 소리 */
  open: '/sounds/open.wav',
  /** 책장을 후루룩 넘기는 소리 */
  riffle: '/sounds/riffle.wav',
  /** 짧은 "틱" */
  tik: '/sounds/tik.wav',
  /** 가벼운 "휙" */
  whoosh: '/sounds/whoosh.wav',
} as const

export type SoundFile = keyof typeof SOUND_FILES

/** 전체 음량. 소리 전체를 키우거나 줄일 때는 이 값 하나만 고친다 */
export const MASTER_GAIN = 0.5

/** 부를 때마다 빠르기(높이)를 흩뜨리는 폭(±비율): 같은 음원이 잇달아 나도 기계처럼 들리지 않게 */
export const RATE_JITTER = 0.04

/** 소리 자리 하나 */
export interface Sound {
  /** 이 자리를 함께 쓰는 사건(무엇이 일어날 때 나는 소리인가) */
  for: string
  /** 이 자리가 쓰는 음원. 없으면 소리가 없다(자리만 있다) */
  file?: SoundFile
  /** 이 자리의 세기(0~1, 기본 1). 같은 음원도 자리에 따라 크기가 다르다 */
  gain?: number
  /** 이 시간(ms) 안에 다시 불리면 내지 않는다(촘촘한 반복을 솎는다). 없으면 부를 때마다 난다 */
  minGapMs?: number
}

export const SOUNDS = {
  // ── 서가 ──
  spineRub: { for: '서가에서 책 한 권 넘기기(키보드·책등 클릭·끌기·타이틀 띠)', file: 'tok', gain: 0.8 },
  bookLand: { for: '가운데 책이 내려앉음(책을 넘긴 뒤, 웰컴에서 서가로 내려온 뒤)', file: 'thud', gain: 0.7 },
  glideTick: { for: '←/→를 누르고 있어 책장이 지나갈 때 책마다', file: 'tik', gain: 0.45, minGapMs: 80 },
  spinePull: { for: '포인터로 책등이 뽑혀 나옴', file: 'tok', gain: 0.35, minGapMs: 220 },
  dialTick: { for: '권수 다이얼로 책을 고름(서가 하단 바·책 페이지)', file: 'tik', gain: 0.6, minGapMs: 60 },

  // ── 책 페이지 ──
  bookPull: { for: '책 페이지 열기: 책을 집어 듦', file: 'tok', gain: 1 },
  rowSweep: { for: '여러 권이 밀림(책 페이지 열기·닫기, 웰컴 ↔ 서가의 줄)', file: 'tok', gain: 0.5 },
  bookReturn: { for: '책 페이지 닫기: 든 책이 서가로 돌아옴', file: 'tok', gain: 0.7 },
  bookTuck: { for: '책이 꽂힘·놓임(책 페이지 닫기의 끝, 서가 → 웰컴에서 꽂힘, 분류 화면으로 날아와 놓임)', file: 'thud', gain: 0.55 },
  coverFlip: { for: '앞표지 ↔ 뒤표지(상세 창)', file: 'open', gain: 0.8 },
  volumeSlide: { for: '책 페이지 안에서 다른 권으로', file: 'tok', gain: 0.8 },
  coverOpen: { for: '책 펼치기', file: 'open', gain: 1 },
  pageTurn: { for: '책장 한 장 넘기기', file: 'open', gain: 0.7 },
  pageRiffle: { for: '여러 장을 한꺼번에 건너뛰기(옆면 띠, 펼친 뒤 가운데로)', file: 'riffle', gain: 1 },
  bookShut: { for: '책 덮기(소리 없음: 편집자 결정)' },

  // ── 학제별 분류 ──
  dialClack: { for: '글자 다이얼 한 칸', file: 'tik', gain: 0.8 },
  drawerOpen: { for: '책이 경계에서 나옴(소리 없음: 아직 정하지 않았다)' },
  coverSnap: { for: '책이 문처럼 돌아 표지가 보임(책마다)', file: 'tik', gain: 0.4 },
  drawerClose: { for: '책이 경계로 다시 들어감(소리 없음: 아직 정하지 않았다)' },
  drawerThud: { for: '책이 경계 안으로 다 들어감(소리 없음: 아직 정하지 않았다)' },
  rowEnd: { for: '줄을 끌다 끝 저항에 닿음', file: 'thud', gain: 0.35, minGapMs: 250 },
  bookWhoosh: { for: '책이 책 페이지로 날아감·날아서 돌아옴', file: 'whoosh', gain: 0.6 },

  // ── 웰컴·신간 소개·버튼 ──
  penDot: { for: '서·가·명·강에 점이 찍힘(네 번)', file: 'tik', gain: 0.5 },
  noteFlutter: { for: '신간 소개의 말풍선이 나타남(소리 없음: 편집자 결정)' },
  buttonTick: { for: '`[ ]` 버튼·링크를 누름', file: 'tik', gain: 0.5 },
} as const satisfies Record<string, Sound>

export type SoundName = keyof typeof SOUNDS

/** 소리 이름 전부 */
export const SOUND_NAMES = Object.keys(SOUNDS) as SoundName[]

/** 부를 때 줄 수 있는 것 */
export interface PlayOptions {
  /** 세기에 곱하는 값(기본 1). 같은 자리의 소리를 더 작게 낼 때 */
  gain?: number
}

/** 그 자리가 쓰는 음원과 세기. 소리가 없는 자리면 null */
export function voiceOf(name: SoundName, options: PlayOptions = {}): { file: SoundFile; gain: number } | null {
  const sound: Sound = SOUNDS[name]
  if (!sound.file) return null
  return { file: sound.file, gain: (sound.gain ?? 1) * (options.gain ?? 1) }
}
