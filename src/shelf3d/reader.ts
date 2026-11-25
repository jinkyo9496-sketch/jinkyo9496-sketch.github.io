/**
 * 펼친 책: 표지를 젖히고, 면지와 미리보기 낱장을 넘긴다(three.js. 책 모형 `book3d`에 붙여 쓴다).
 *
 * 모형 좌표(책 높이 = 1): 책등이 −X, 앞표지가 +Z. 표지를 π만큼 열면 표지 안쪽이 책등의 왼쪽에 평평하게 놓인다.
 *   right  오른쪽에 보이는 면(종이 묶음 위)
 *   left   왼쪽에 보이는 면(표지 안쪽에 붙어 표지와 함께 돈다)
 *   leaf   넘어가는 낱장 한 장(앞·뒤 두 면). 넘어가는 동안에만 보인다
 * 어느 면에 무엇이 보이는지는 `reader/spread.ts`가 정한다.
 */
import * as THREE from 'three'
import { COVER_THICKNESS, hingeRotation, type BookModel, type TextureCache } from '../book3d'
import { PLAIN_U } from '../book3d/pageTexture'
import {
  clampSpread,
  jumpSteps,
  leafFaces,
  maxSpread,
  pagesNear,
  pileShare,
  spreadFaces,
  type Face,
  type PreviewShape,
} from '../reader/spread'

/** 책을 펼치는 / 덮는 / 한 장 넘기는 시간(ms) */
export const READER = {
  open: 900,
  close: 700,
  turn: 860,
  /** 넘어가는 낱장이 휘는 정도(rad): 한가운데를 지날 때 바깥 끝이 책등 쪽보다 이만큼 뒤처진다 */
  lag: 1.05,
  /** 낱장을 나누는 칸 수(휘는 곡선의 매끄러움) */
  segments: 28,
  /** 펼침면 가운데(책등 쪽)의 그늘: 가장 어두운 밝기와, 그늘이 풀리는 거리(쪽 폭 대비) */
  gutter: { shade: 0.66, width: 0.2 },
  /**
   * 펼친 쪽이 휘어 오른 높이(쪽 폭 대비): 무선 제본이라 쪽이 책등에서 솟았다가 바깥 끝으로 내려앉는다.
   * 놓인 쪽과 넘어가는 낱장이 같은 곡선에서 시작하고 끝난다
   */
  arch: 0.05,
  /**
   * 다 펼친 표지의 각(rad). 무선 제본의 표지는 평평하게 눕지 않고 조금 들려 있다(180°가 아니라 170°).
   * 왼쪽에 놓인 쪽과 그리로 넘어가는 낱장도 이 각에 맞춘다
   */
  cover: (170 * Math.PI) / 180,
  /**
   * 표지가 열리고 닫히는 동안 휘는 정도(rad): 반쯤 열렸을 때 배 쪽 끝이 책등 쪽보다 이만큼 뒤처진다.
   * 무선 제본의 표지는 얇은 종이라 판처럼 돌지 않고 낱장처럼 휘며 따라온다
   */
  coverLag: 0.6,
  /** 표지에 대한 본문 쪽의 크기. 무선 책은 표지와 본문을 함께 재단하므로 크기가 같다(작으면 색 면 둘레에 흰 테가 보인다) */
  pageScale: 1,
  /**
   * 포인터를 올린 쪽의 맨 위 낱장이 들리는 정도(rad, 바깥 끝의 기울기): 포인터에 가까운 모서리(near)가 더 들린다.
   * ms는 들리고 내려앉는 빠르기(시간 상수)
   */
  peek: { near: 0.62, far: 0.2, ms: 110 },
  /** 넘기는 동안 누른 쪽 모서리가 이만큼(rad) 앞서 간다 */
  twist: 0.22,
  /** 한꺼번에 넘어가고 있을 수 있는 낱장의 수(빠르게 이어 넘길 때). 넘으면 가장 앞선 장부터 바로 놓는다 */
  pool: 5,
  /**
   * 펼친 곳의 앞뒤로 이만큼의 펼침면까지 그림을 들고 있는다. 그보다 멀어진 쪽의 그림은 놓는다(다시 오면 다시 받는다).
   * 책 한 권이 통째로 들어 있는 권(수백 쪽)을 끝까지 넘겨도 그래픽 메모리가 쌓이지 않게 한다. pool보다 커야 한다
   */
  keep: 8,
  /**
   * 쪽 그림을 고를 때 한 단계 가까이 더 선명한 사본(밉 단계)을 쓰게 하는 값(음수일수록 선명, 0 = 그대로).
   * 누운 면에 붙은 작은 글자가 덜 뭉개진다. 너무 낮추면 움직일 때 자글거린다
   */
  mapBias: -0.75,
  /**
   * 여러 장을 건너뛸 때(종이 더미의 옆면을 눌렀을 때): 낱장 몇 장이 stagger(ms) 간격으로 잇달아 넘어간다.
   * 사이의 장은 그리지 않는다(첫 장은 지금 면에서, 마지막 장은 목표의 바로 앞에서 떠난다)
   */
  jump: { leaves: 4, stagger: 90 },
  /**
   * 종이 더미(책 전체가 든 권): 넘긴 만큼 왼쪽이 두꺼워지고 오른쪽이 얇아진다. ms는 두께가 따라가는 빠르기(시간 상수),
   * slit은 포인터를 올린 깊이에 보이는 틈의 굵기(책 높이 대비)와 농도
   */
  /**
   * fan: 더미의 배 쪽 면이 비스듬히 누운 정도(두께 대비 바깥으로 나온 길이). 펼친 두꺼운 책은 아래 장일수록 바깥으로 나와
   * 위에서 보면 배 쪽에 책장의 단면이 띠로 보인다. 이 띠가 두께를 보이는 자리이고 포인터로 깊이를 고르는 자리다.
   * 왼쪽이 더 누워 있다: 펼친 책은 화면의 왼쪽에 있어 눈이 왼쪽 더미를 오른쪽에서 비스듬히 보므로, 같은 기울기면 왼쪽 띠는 거의 가려진다
   */
  /** lines: 단면의 줄무늬. 무늬 한 벌(texels줄)이 덮는 두께 span(책 높이 대비)과 가장 어두운 줄이 어두워지는 정도 contrast */
  /**
   * base: 더미가 얇아도 띠가 이만큼(책 높이 대비)은 더 나온다. 실제 책보다 넓게 보이게 한 값이다: 띠가 포인터로 누르는 자리라
   * 좁으면 누르기 어렵다(2026-11-24 편집자 요청으로 fan과 함께 키웠다. 전에는 fan 1.05 / 0.62, base 없음)
   */
  pile: {
    ms: 220,
    slit: 0.0042,
    slitOpacity: 0.5,
    fan: { left: 1.0, right: 0.9 },
    base: 0.02,
    lines: { texels: 64, span: 0.085, contrast: 0.42 },
  },
}

/** 재질의 그림 읽기(`map_fragment`)에 `READER.mapBias`를 넣는다. 모르는 모양의 셰이더는 그대로 둔다 */
export function sharperMapFragment(fragment: string) {
  return fragment.replace('texture2D( map, vMapUv )', `texture2D( map, vMapUv, ${READER.mapBias.toFixed(2)} )`)
}

/** 포인터가 올라가 있는 쪽 면과, 그 면의 위쪽·아래쪽 */
export interface ReaderPeek {
  side: 'left' | 'right'
  corner: 'top' | 'bottom'
  /** 종이 더미의 옆면 위라면 그 깊이(0 = 맨 위, 1 = 맨 아래): 그 깊이에 틈이 보인다 */
  depth?: number
}

/** 날개 그림: 주소와 가로/세로 */
export interface FlapImage {
  src: string
  aspect: number
}

/**
 * 놓인 쪽의 기울기(rad): 책등에서 u(0~1)만큼 떨어진 곳. 높이 h(u) = 4.5·u^0.7·(1−u)^1.6 의 기울기다
 * (책등에서 가파르게 솟아 폭의 30%쯤에서 가장 높고, 바깥 끝에서 0으로 내려앉는다). amount는 가장 높은 곳의 높이쯤
 */
export function archSlope(u: number, amount: number) {
  if (amount === 0) return 0
  const t = Math.min(0.999, Math.max(0.004, u))
  const d = 4.5 * (0.7 * t ** -0.3 * (1 - t) ** 1.6 - 1.6 * t ** 0.7 * (1 - t) ** 0.6)
  return Math.min(1.1, Math.max(-1.1, Math.atan(amount * d)))
}

/**
 * 넘어가는 낱장의 단면(책등에서 바깥 끝까지의 곡선). 종이는 책등에 물려 있고 바깥 끝이 뒤처져 따라온다:
 * 책등에서 u(0~1)만큼 떨어진 곳의 기울기는 angle − dir·lag·u^1.4 이다(0 = 오른쪽에 누움, π = 왼쪽에 누움).
 * arch를 주면 놓인 쪽의 휜 모양(`archSlope`)에서 시작해 반대쪽의 휜 모양으로 끝난다.
 * 돌려주는 값은 칸의 경계마다의 [x, z, 기울기] (쪽 폭 = 1, x는 오른쪽이 +, z는 보는 사람 쪽이 +).
 */
export function leafCurve(
  angle: number,
  lag: number,
  direction: 1 | -1,
  segments = READER.segments,
  arch = 0,
): [number, number, number][] {
  const points: [number, number, number][] = []
  const step = 1 / segments
  const lo = arch ? -1.1 : 0.02
  const hi = Math.PI - lo
  const lean = Math.cos(angle)
  const slope = (u: number) => Math.min(hi, Math.max(lo, angle - direction * lag * u ** 1.4 + archSlope(u, arch) * lean))
  let x = 0
  let z = 0
  points.push([0, 0, slope(0)])
  for (let i = 0; i < segments; i++) {
    const phi = slope((i + 0.5) * step)
    x += Math.cos(phi) * step
    z += Math.sin(phi) * step
    points.push([x, z, slope((i + 1) * step)])
  }
  return points
}

/**
 * 앞표지의 단면(경첩에서 배 쪽 끝까지의 곡선). 경첩이 theta만큼 열린 틀 안에서의 모양이다(x는 배 쪽, +z는 표지의 바깥).
 * 책등에서 u만큼 떨어진 곳은 theta − lag·u^1.4 − archSlope(u) 만큼 열려 있다: 열리는 동안에는 배 쪽 끝이 뒤처지고(lag),
 * 다 펼치면 그 위에 놓인 쪽과 같은 모양으로 휘어 오른다(arch). 어느 곳도 덮인 자리(0°) 아래로, 180° 너머로 가지 않는다.
 * span은 곡선의 길이(쪽 폭 = 1). 돌려주는 값은 칸의 경계마다의 [x, z, 기울기]
 */
export function coverCurve(theta: number, lag: number, arch: number, segments = READER.segments, span = 1): [number, number, number][] {
  const slope = (u: number) => Math.min(Math.PI - theta, Math.max(-theta, -lag * u ** 1.4 - archSlope(u, arch)))
  const step = span / segments
  const points: [number, number, number][] = [[0, 0, slope(0)]]
  let x = 0
  let z = 0
  for (let i = 0; i < segments; i++) {
    const psi = slope((i + 0.5) * step)
    x += Math.cos(psi) * step
    z += Math.sin(psi) * step
    points.push([x, z, slope((i + 1) * step)])
  }
  return points
}

/**
 * 종이 더미 단면의 줄무늬(가로 = 두께 방향, 반복): 책장 몇 장이 한 줄로 보이는 굵기다.
 * 책 모형의 줄무늬(`book3d/pageTexture.ts`)는 서가 크기에 맞춰 가늘고 옅어서, 펼친 책의 좁은 띠에서는 뭉개져 보이지 않는다.
 * 텍셀마다의 밝기(0~1). 씨앗이 정해져 있어 언제나 같다
 */
export function pileLineLevels(): number[] {
  const { texels, contrast } = READER.pile.lines
  let a = 17
  const random = () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return Array.from({ length: texels }, (_, i) => {
    // 밝은 장과 어두운 틈이 번갈아 오고, 드문드문 더 벌어진 틈이 있다
    const gap = i % 2 === 1 ? 0.45 + 0.4 * random() : 0.12 * random()
    return 1 - contrast * (random() < 0.08 ? 1 : gap)
  })
}

function createPileLineTexture(anisotropy: number) {
  const levels = pileLineLevels()
  const data = new Uint8Array(levels.length * 2 * 4)
  for (let row = 0; row < 2; row++)
    levels.forEach((level, i) => {
      const at = (row * levels.length + i) * 4
      data[at] = data[at + 1] = data[at + 2] = Math.round(level * 255)
      data[at + 3] = 255
    })
  const texture = new THREE.DataTexture(data, levels.length, 2, THREE.RGBAFormat)
  // 밝기를 그대로 곱하는 값이라 색 공간 변환을 하지 않는다
  texture.colorSpace = THREE.NoColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.generateMipmaps = true
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.anisotropy = anisotropy
  texture.needsUpdate = true
  return texture
}

const PAPER = 0xfbfaf6
/** 종이 더미의 틈: 먹(그림자와 같은 색) */
const SLIT = 0x111111
const EPS = 0.0006
const ease = (p: number) => {
  const t = Math.min(1, Math.max(0, p))
  return t * t * (3 - 2 * t)
}
const sameFace = (a: Face, b: Face) => a.kind === b.kind && (a.kind !== 'image' || a.page === (b as { page: number }).page)

export interface BookReaderOptions {
  model: BookModel
  /** 미리보기의 모양(쪽수, 첫 그림이 어느 쪽 면인가)과 그 그림의 주소(1쪽부터) */
  shape: PreviewShape
  srcOf: (page: number) => string
  /** 면지 색 */
  endpaper: THREE.ColorRepresentation
  /** 앞날개(펼친 첫 면의 왼쪽, 표지 안쪽에 접혀 있다)와 뒷날개(미리보기가 끝난 면의 오른쪽) */
  flaps?: { front?: FlapImage | null; back?: FlapImage | null }
  textures: TextureCache
  anisotropy?: number
  /** 그림이 도착해 다시 그려야 할 때 */
  onChange?: () => void
  /** 종이 더미를 보인다(책 전체가 든 권): 넘긴 만큼 좌우의 두께가 달라진다. 미리보기만 있는 권은 끈다 */
  pile?: boolean
}

export interface BookReader {
  /** 책이 펼쳐진 정도(0 = 덮임, 1 = 다 펼침). 부드럽게 다듬은 값 */
  readonly openness: number
  /** 지금의 펼침면(목표) */
  readonly spread: number
  /** 좌우 종이 더미의 몫(합 1). 더미를 쓰지 않거나 덮여 있으면 왼쪽 0 */
  readonly pile: { left: number; right: number }
  /** 넘어가고 있는 낱장의 수 */
  readonly turning: number
  /** 펼침면을 바꾼다. animate가 false면 바로 그 모습이 된다 */
  setSpread(spread: number, animate?: boolean): void
  /** 포인터가 올라간 면: 그쪽 맨 위 낱장의 가까운 모서리가 들린다. 없으면 null */
  setPeek(peek: ReaderPeek | null): void
  /** dt(ms)만큼 진행한다. 아직 움직이면 true */
  advance(dtMs: number): boolean
  /** 책을 덮은 모습으로 되돌리고 붙인 것을 모두 버린다 */
  dispose(): void
}

export function createBookReader({
  model,
  shape,
  srcOf,
  endpaper,
  flaps,
  textures,
  anisotropy = 1,
  onChange,
  pile: usePile = false,
}: BookReaderOptions): BookReader {
  const w = model.spec.coverAspect
  const d = model.spec.spineAspect
  const pw = w * READER.pageScale
  const ph = READER.pageScale
  /**
   * 오른쪽 쪽은 휘어 오른 만큼 종이 묶음에서 아주 조금 뜬다: 휜 쪽의 바깥 끝이 0보다 조금 내려가므로(곡선의 오차),
   * 그대로 두면 끝이 묶음 속으로 들어가 잘려 보인다. 책이 덮여 있거나 열리는 동안(휘지 않은 동안)에는 뜨지 않는다:
   * 떠 있으면 덮인 표지보다 높아서, 열리는 첫 순간 면지가 표지를 뚫고 보인다
   */
  const FLOAT = pw * 0.014
  const zFlat = d / 2 - COVER_THICKNESS + EPS
  let zRight = zFlat
  const zLeft = d / 2 + COVER_THICKNESS + EPS

  const material = (side: THREE.Side = THREE.FrontSide) => {
    const mat = new THREE.MeshStandardMaterial({ color: PAPER, roughness: 0.92, metalness: 0, vertexColors: true, side })
    // 쪽의 그림은 조금 더 선명한 사본으로 읽는다(READER.mapBias)
    mat.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', sharperMapFragment(THREE.ShaderChunk.map_fragment))
    }
    mat.customProgramCacheKey = () => `page-map-bias:${READER.mapBias}`
    return mat
  }
  /** 그림을 붙이는 면: 좌우의 놓인 면(left, right)과 낱장마다의 앞·뒤(leaf0Front …) */
  type Slot = string
  const mats: Record<Slot, THREE.MeshStandardMaterial> = { left: material(), right: material() }
  const shown: Partial<Record<Slot, Face>> = {}

  /** 책등 쪽이 어두운 그늘(꼭짓점 색). gutterAt: 그 도형에서 책등 쪽 끝의 x */
  const shade = (u: number) => {
    const t = Math.min(1, Math.max(0, u / READER.gutter.width))
    return READER.gutter.shade + (1 - READER.gutter.shade) * t * t * (3 - 2 * t)
  }
  const shaded = (geometry: THREE.BufferGeometry, gutterAt: number) => {
    const position = geometry.getAttribute('position')
    const colors = new Float32Array(position.count * 3)
    for (let i = 0; i < position.count; i++) colors.fill(shade(Math.abs(position.getX(i) - gutterAt) / pw), i * 3, i * 3 + 3)
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    return geometry
  }
  const frontGeometry = shaded(new THREE.PlaneGeometry(pw, ph, 16, 1), -pw / 2)
  const plane = (geometry: THREE.BufferGeometry, mat: THREE.Material) => {
    const mesh = new THREE.Mesh(geometry, mat)
    mesh.receiveShadow = true
    return mesh
  }

  /** 휘어 오른 쪽(놓인 면). 평평한 도형과 같은 자리(가운데 기준)에 놓인다. left는 표지 안쪽에 붙어 −Z를 본다 */
  /**
   * 휜 정도는 책이 펼쳐진 만큼만 든다(archNow): 표지가 닫혀 있거나 열리는 중에 쪽이 솟아 있으면 표지를 뚫고 나온다.
   */
  let archNow = 0
  let thetaNow = -1
  let coverArch = -1
  const archGeometry = (leftSide: boolean) => {
    const segments = READER.segments
    const count = (segments + 1) * 2
    const positions = new THREE.BufferAttribute(new Float32Array(count * 3), 3)
    const normals = new THREE.BufferAttribute(new Float32Array(count * 3), 3)
    const uvs: number[] = []
    const index: number[] = []
    for (let i = 0; i <= segments; i++) {
      const t = i / segments
      for (let row = 0; row < 2; row++) uvs.push(leftSide ? 1 - t : t, row)
      if (i < segments) {
        const a = i * 2
        if (leftSide) index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
        else index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
      }
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', positions)
    geometry.setAttribute('normal', normals)
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
    geometry.setIndex(index)
    const update = (arch: number) => {
      // 휘지 않았으면 완전히 평평하다: leafCurve는 낱장이 겹치지 않게 조금(0.02rad) 들어 올리는데,
      // 놓인 쪽이 그만큼 들려 있으면 바깥쪽 절반이 덮인 표지보다 높아서 열리는 첫 순간 표지를 뚫고 보인다
      const curve = arch ? leafCurve(0, 0, 1, segments, arch) : null
      for (let i = 0; i <= segments; i++) {
        const [cx, cz, phi] = curve ? curve[i] : [i / segments, 0, 0]
        for (let row = 0; row < 2; row++) {
          const k = i * 2 + row
          positions.setXYZ(k, cx * pw - pw / 2, (row - 0.5) * ph, (leftSide ? -1 : 1) * cz * pw)
          normals.setXYZ(k, -Math.sin(phi), 0, (leftSide ? -1 : 1) * Math.cos(phi))
        }
      }
      positions.needsUpdate = true
      normals.needsUpdate = true
    }
    update(0)
    shaded(geometry, -pw / 2)
    return { geometry, update }
  }
  const archRight = archGeometry(false)

  /**
   * 휘는 앞표지: 책 모형의 표지(평평한 판)를 읽는 동안 이 도형으로 바꿔 끼운다(같은 재질: 0 = 인쇄 면, 1 = 종이).
   * 경첩의 좌표로 만든다(x 0 = 접힌 자리, +z = 바깥). 바깥 면 · 안쪽 면 · 위 · 아래 단면 · 배 쪽 단면
   */
  const M = READER.segments
  const cover = model.parts.frontCover
  const coverWas = { geometry: cover.geometry, position: cover.position.clone(), culled: cover.frustumCulled }
  const coverRows = (M + 1) * 2
  const coverPositions = new THREE.BufferAttribute(new Float32Array((coverRows * 4 + 4) * 3), 3)
  const coverNormals = new THREE.BufferAttribute(new Float32Array((coverRows * 4 + 4) * 3), 3)
  const coverGeometry = new THREE.BufferGeometry()
  {
    const uvs: number[] = []
    const outer: number[] = []
    const rest: number[] = []
    for (let i = 0; i <= M; i++) for (let row = 0; row < 2; row++) uvs.push(i / M, row)
    for (let k = 0; k < coverRows * 3 + 4; k++) uvs.push(PLAIN_U, 0.5)
    const [A, B, C, D, E] = [0, coverRows, coverRows * 2, coverRows * 3, coverRows * 4]
    for (let i = 0; i < M; i++) {
      const a = i * 2
      outer.push(A + a, A + a + 2, A + a + 1, A + a + 1, A + a + 2, A + a + 3)
      rest.push(B + a, B + a + 1, B + a + 2, B + a + 1, B + a + 3, B + a + 2)
      // 위·아래 단면: 칸마다 [바깥, 안]
      rest.push(C + a, C + a + 2, C + a + 1, C + a + 1, C + a + 2, C + a + 3)
      rest.push(D + a, D + a + 1, D + a + 2, D + a + 1, D + a + 3, D + a + 2)
    }
    // 배 쪽 단면: [바깥 아래, 안 아래, 바깥 위, 안 위]
    rest.push(E, E + 1, E + 2, E + 2, E + 1, E + 3)
    coverGeometry.setAttribute('position', coverPositions)
    coverGeometry.setAttribute('normal', coverNormals)
    coverGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
    coverGeometry.setIndex([...outer, ...rest])
    coverGeometry.addGroup(0, outer.length, 0)
    coverGeometry.addGroup(outer.length, rest.length, 1)
  }
  cover.geometry = coverGeometry
  cover.position.set(0, 0, 0)
  cover.frustumCulled = false

  /** 표지 안쪽에 놓인 왼쪽 면과 앞날개: 표지와 같은 곡선을 따른다(경첩의 좌표) */
  const strip = (segments: number, colours: boolean) => {
    const count = (segments + 1) * 2
    const positions = new THREE.BufferAttribute(new Float32Array(count * 3), 3)
    const normals = new THREE.BufferAttribute(new Float32Array(count * 3), 3)
    const uvs: number[] = []
    const index: number[] = []
    const colors = new Float32Array(count * 3)
    for (let i = 0; i <= segments; i++) {
      const t = i / segments
      for (let row = 0; row < 2; row++) {
        uvs.push(1 - t, row)
        colors.fill(shade(t), (i * 2 + row) * 3, (i * 2 + row) * 3 + 3)
      }
      if (i < segments) {
        const a = i * 2
        index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
      }
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', positions)
    geometry.setAttribute('normal', normals)
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
    if (colours) geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geometry.setIndex(index)
    /** curve: 쪽 폭 = 1인 곡선, from~1 구간을 표지 안쪽으로 off만큼 띄워 놓는다 */
    const update = (curve: [number, number, number][], from: number, off: number) => {
      const last = curve.length - 1
      for (let i = 0; i <= segments; i++) {
        const at = (from + (1 - from) * (i / segments)) * last
        const lo = Math.min(last - 1, Math.floor(at))
        const f = at - lo
        const x = curve[lo][0] + (curve[lo + 1][0] - curve[lo][0]) * f
        const z = curve[lo][1] + (curve[lo + 1][1] - curve[lo][1]) * f
        const psi = curve[lo][2] + (curve[lo + 1][2] - curve[lo][2]) * f
        const [nx, nz] = [Math.sin(psi), -Math.cos(psi)]
        for (let row = 0; row < 2; row++) {
          const k = i * 2 + row
          positions.setXYZ(k, x * pw + nx * off, (row - 0.5) * ph, z * pw + nz * off)
          normals.setXYZ(k, nx, 0, nz)
        }
      }
      positions.needsUpdate = true
      normals.needsUpdate = true
    }
    return { geometry, update }
  }
  const leftStrip = strip(READER.segments, true)

  /** 표지와 그 안쪽에 붙은 것들을 경첩이 theta만큼 열린 모습으로 휜다 */
  function bendCover(theta: number, lag: number, arch: number) {
    const curve = coverCurve(theta, lag, arch, M, w / pw)
    const c = COVER_THICKNESS
    const [B, C, D, E] = [coverRows, coverRows * 2, coverRows * 3, coverRows * 4]
    for (let i = 0; i <= M; i++) {
      const [cx, cz, psi] = curve[i]
      const [nx, nz] = [-Math.sin(psi), Math.cos(psi)]
      // 왼쪽 더미가 있으면 표지는 그 두께만큼 바깥으로 물러난다(쪽은 제자리에 둔다)
      const [ox, oz] = [cx * pw + nx * leftThick, cz * pw + nz * leftThick]
      const [ix, iz] = [ox - nx * c, oz - nz * c]
      for (let row = 0; row < 2; row++) {
        const k = i * 2 + row
        const y = row - 0.5
        coverPositions.setXYZ(k, ox, y, oz)
        coverNormals.setXYZ(k, nx, 0, nz)
        coverPositions.setXYZ(B + k, ix, y, iz)
        coverNormals.setXYZ(B + k, -nx, 0, -nz)
      }
      // 위(C)·아래(D) 단면
      coverPositions.setXYZ(C + i * 2, ox, 0.5, oz)
      coverPositions.setXYZ(C + i * 2 + 1, ix, 0.5, iz)
      coverPositions.setXYZ(D + i * 2, ox, -0.5, oz)
      coverPositions.setXYZ(D + i * 2 + 1, ix, -0.5, iz)
      for (const k of [C + i * 2, C + i * 2 + 1]) coverNormals.setXYZ(k, 0, 1, 0)
      for (const k of [D + i * 2, D + i * 2 + 1]) coverNormals.setXYZ(k, 0, -1, 0)
      if (i === M) {
        coverPositions.setXYZ(E, ox, -0.5, oz)
        coverPositions.setXYZ(E + 1, ix, -0.5, iz)
        coverPositions.setXYZ(E + 2, ox, 0.5, oz)
        coverPositions.setXYZ(E + 3, ix, 0.5, iz)
        for (let k = E; k < E + 4; k++) coverNormals.setXYZ(k, Math.cos(psi), 0, Math.sin(psi))
      }
    }
    coverPositions.needsUpdate = true
    coverNormals.needsUpdate = true
    const page = coverCurve(theta, lag, arch, READER.segments, 1)
    leftStrip.update(page, 0, c + EPS)
    leftPile?.update(page, leftThick)
    pagePile = page
    flapStrip?.update(page, flapFrom, c + EPS * 2)
  }

  // ── 종이 더미(책 전체가 든 권) ──
  // 쪽이 놓이는 높이는 그대로 두고 더미를 그 아래로 둔다: 오른쪽 더미(종이 묶음)는 위에서부터 얇아지고,
  // 왼쪽 더미는 표지와 왼쪽 쪽 사이에 생긴다(표지가 그 두께만큼 바깥으로 물러난다. 경첩과 왼쪽 쪽은 움직이지 않는다:
  // 쪽이 더미가 없을 때와 꼭 같은 자리에 있어야 넘어와 놓이는 낱장 아래로 비치지 않는다)
  const blockDepth = d - 2 * COVER_THICKNESS
  const block = model.parts.pageBlock
  const spine = model.parts.spine
  const hingeWas = { front: model.hinges.front.position.z, back: model.hinges.back.position.z }
  /** 왼쪽 더미의 몫(다듬은 값)과 지금 그려진 두께(책 높이 대비) */
  let pileNow = 0
  let leftThick = 0
  let pagePile: [number, number, number][] | null = null
  const pileLines = usePile ? createPileLineTexture(anisotropy) : null
  const pileMaterial = usePile ? (model.materials.paper.clone() as THREE.MeshStandardMaterial) : null
  if (pileMaterial) {
    pileMaterial.side = THREE.DoubleSide
    pileMaterial.map = pileLines
  }
  /** 왼쪽 더미: 표지 안쪽의 곡선을 따라 아랫면·윗면·배 쪽 면을 세운다(경첩의 좌표) */
  const makeLeftPile = () => {
    // 칸 하나를 더 둔다: 바깥으로 나온 배 쪽 면의 아래 끝까지 아랫면·윗면을 잇는다
    const S = READER.segments + 1
    const rows = (S + 1) * 2
    const positions = new THREE.BufferAttribute(new Float32Array((rows * 2 + 4) * 3), 3)
    const normals = new THREE.BufferAttribute(new Float32Array((rows * 2 + 4) * 3), 3)
    const uvs = new THREE.BufferAttribute(new Float32Array((rows * 2 + 4) * 2), 2)
    const index: number[] = []
    for (let i = 0; i < S; i++) {
      const a = i * 2
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
      index.push(rows + a, rows + a + 2, rows + a + 1, rows + a + 1, rows + a + 2, rows + a + 3)
    }
    const E = rows * 2
    index.push(E, E + 1, E + 2, E + 2, E + 1, E + 3)
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', positions)
    geometry.setAttribute('normal', normals)
    geometry.setAttribute('uv', uvs)
    geometry.setIndex(index)
    const mesh = new THREE.Mesh(geometry, pileMaterial!)
    mesh.name = 'pile-left'
    mesh.frustumCulled = false
    mesh.receiveShadow = true
    mesh.visible = false
    model.hinges.front.add(mesh)
    const c = COVER_THICKNESS
    const update = (curve: [number, number, number][], thick: number) => {
      const u0 = 0.02
      const u1 = u0 + thick / READER.pile.lines.span
      const out = outOf('left', thick)
      for (let i = 0; i <= S; i++) {
        const [cx, cz, psi] = curve[Math.min(curve.length - 1, i)]
        const [nx, nz] = [Math.sin(psi), -Math.cos(psi)]
        // 마지막 칸: 아래(표지 쪽)는 곡선의 끝에서 바깥으로 더 나오고 위(쪽의 아래)는 그대로다
        const over = i === S ? out : 0
        // a: 표지의 안쪽 면, b: 왼쪽 쪽의 바로 아래
        const ax = cx * pw + nx * (c - thick) + Math.cos(psi) * over
        const az = cz * pw + nz * (c - thick) + Math.sin(psi) * over
        const bx = cx * pw + nx * c
        const bz = cz * pw + nz * c
        if (i === S) leftFore = [bx, bz, ax, az]
        for (const [base, y, ny] of [
          [0, -0.5, -1],
          [rows, 0.5, 1],
        ] as const) {
          const k = base + i * 2
          positions.setXYZ(k, ax, y * ph, az)
          positions.setXYZ(k + 1, bx, y * ph, bz)
          normals.setXYZ(k, 0, ny, 0)
          normals.setXYZ(k + 1, 0, ny, 0)
          uvs.setXY(k, u0, 0.5)
          uvs.setXY(k + 1, u1, 0.5)
        }
        if (i === S) {
          const ys = [-0.5, -0.5, 0.5, 0.5]
          for (let v = 0; v < 4; v++) {
            const inner = v % 2 === 1
            positions.setXYZ(E + v, inner ? bx : ax, ys[v] * ph, inner ? bz : az)
            // 비스듬한 면의 바깥 방향: 곡선의 방향과 쪽의 방향 사이
            const lean = Math.atan(slopeOf('left', thick))
            normals.setXYZ(E + v, Math.cos(psi) * Math.cos(lean) + nx * Math.sin(lean), 0, Math.sin(psi) * Math.cos(lean) + nz * Math.sin(lean))
            uvs.setXY(E + v, inner ? u1 : u0, 0.5)
          }
        }
      }
      positions.needsUpdate = true
      normals.needsUpdate = true
      uvs.needsUpdate = true
    }
    return { mesh, geometry, update }
  }
  /** 배 쪽 면이 누운 정도(책이 펼쳐진 만큼 든다)와 왼쪽 더미 배 쪽 면의 위·아래 끝(경첩의 좌표 [x, z, x, z]) */
  let fanNow = 0
  /** 그 두께의 더미에서 배 쪽 면의 아래 끝이 바깥으로 나온 길이: 두께에 비례하는 몫(fan)에 늘 더 나오는 몫(base)을 더한다 */
  const outOf = (side: 'left' | 'right', thick: number) =>
    (READER.pile.fan[side] * thick + READER.pile.base * Math.min(1, thick / 0.004)) * fanNow
  /** 그 면의 기울기(두께 대비 나온 길이) */
  const slopeOf = (side: 'left' | 'right', thick: number) => (thick > 0 ? outOf(side, thick) / thick : 0)
  let leftFore: [number, number, number, number] = [0, 0, 0, 0]
  const leftPile = usePile ? makeLeftPile() : null

  /** 오른쪽 더미의 비스듬한 배 쪽 면: 종이 묶음(상자)의 배 쪽에 붙이는 쐐기(책 좌표). 배 쪽 면 · 아랫면 · 윗면 */
  const makeRightFan = () => {
    const positions = new THREE.BufferAttribute(new Float32Array(10 * 3), 3)
    const normals = new THREE.BufferAttribute(new Float32Array(10 * 3), 3)
    const uvs = new THREE.BufferAttribute(new Float32Array(10 * 2), 2)
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', positions)
    geometry.setAttribute('normal', normals)
    geometry.setAttribute('uv', uvs)
    geometry.setIndex([0, 1, 2, 2, 1, 3, 4, 5, 6, 7, 8, 9])
    const mesh = new THREE.Mesh(geometry, pileMaterial!)
    mesh.name = 'pile-right-fan'
    mesh.frustumCulled = false
    mesh.receiveShadow = true
    mesh.visible = false
    model.group.add(mesh)
    const update = (thick: number) => {
      const top = d / 2 - COVER_THICKNESS
      const x0 = w / 2
      const x1 = x0 + outOf('right', thick)
      const slope = slopeOf('right', thick)
      const z1 = top - thick
      const u0 = 0.02
      const u1 = u0 + thick / READER.pile.lines.span
      const len = Math.hypot(1, slope)
      // 배 쪽 면: 위(쪽의 끝)에서 아래(바깥으로 나온 끝)로
      const fore: [number, number, number, number][] = [
        [x0, -0.5, top, u0],
        [x0, 0.5, top, u0],
        [x1, -0.5, z1, u1],
        [x1, 0.5, z1, u1],
      ]
      fore.forEach(([x, y, z, u], k) => {
        positions.setXYZ(k, x, y, z)
        normals.setXYZ(k, 1 / len, 0, slope / len)
        uvs.setXY(k, u, 0.5)
      })
      // 아랫면·윗면의 세모(상자의 배 쪽 면과 비스듬한 면 사이)
      ;[-0.5, 0.5].forEach((y, side) => {
        const tri: [number, number, number][] = [
          [x0, top, u0],
          [x0, z1, u1],
          [x1, z1, u1],
        ]
        tri.forEach(([x, z, u], k) => {
          const at = 4 + side * 3 + k
          positions.setXYZ(at, x, y, z)
          normals.setXYZ(at, 0, y < 0 ? -1 : 1, 0)
          uvs.setXY(at, u, 0.5)
        })
      })
      positions.needsUpdate = true
      normals.needsUpdate = true
      uvs.needsUpdate = true
    }
    return { mesh, geometry, update }
  }
  const rightFan = usePile ? makeRightFan() : null

  /** 포인터를 올린 깊이의 틈: 더미의 아랫면(과 오른쪽 더미의 배 쪽 면)에 그리는 어두운 줄 */
  const slitMaterial = usePile
    ? new THREE.MeshBasicMaterial({
        color: SLIT,
        transparent: true,
        opacity: READER.pile.slitOpacity,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    : null
  const makeSlit = (name: string, vertices: number, index: number[], parent: THREE.Object3D) => {
    const positions = new THREE.BufferAttribute(new Float32Array(vertices * 3), 3)
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', positions)
    geometry.setIndex(index)
    const mesh = new THREE.Mesh(geometry, slitMaterial!)
    mesh.name = name
    mesh.frustumCulled = false
    mesh.visible = false
    mesh.renderOrder = 2
    parent.add(mesh)
    return { mesh, geometry, positions }
  }
  // 오른쪽: 아랫면의 띠 하나 + 배 쪽 면의 띠 하나(책 좌표)
  const slitRight = usePile ? makeSlit('pile-slit', 8, [0, 1, 2, 2, 1, 3, 4, 5, 6, 6, 5, 7], model.group) : null
  // 왼쪽: 표지의 곡선을 따라가는 띠(경첩의 좌표)
  const slitLeft = usePile
    ? makeSlit(
        'pile-slit-left',
        (READER.segments + 1) * 2 + 4,
        [
          ...Array.from({ length: READER.segments }, (_, i) => [i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2]).flat(),
          ...[0, 1, 2, 2, 1, 3].map((k) => (READER.segments + 1) * 2 + k),
        ],
        model.hinges.front,
      )
    : null

  /** 더미의 두께를 책이 펼쳐진 만큼(o) 들인다. 덮여 있으면 책은 원래 모습이다 */
  function placePile(o: number) {
    if (!usePile) return
    const share = pileNow * o
    const keep = Math.max(0.02, 1 - share)
    const fan = o
    if (fan !== fanNow) {
      fanNow = fan
      thetaNow = -1
    }
    // 오른쪽 더미의 비스듬한 배 쪽 면(덮여 있으면 없다)
    rightFan!.update(blockDepth * keep)
    // 넘길 장이 남지 않았으면(책 끝) 띠도 없다: 얇게 남겨 둔 종이 묶음에 늘 더 나오는 몫(base)이 붙어 보이지 않게
    rightFan!.mesh.visible = open > 0 && fan > 0 && 1 - share > 0.002
    const thick = blockDepth * share
    block.scale.z = keep
    block.position.z = (blockDepth * (1 - keep)) / 2
    model.hinges.back.position.z = hingeWas.back + blockDepth * (1 - keep)
    // 책등은 두꺼운 쪽 더미의 높이까지만 남는다(얇은 쪽 아래로 벽처럼 남지 않게). 윗선은 그대로
    const tall = (Math.max(thick, blockDepth * keep) + 2 * COVER_THICKNESS) / d
    spine.scale.z = tall
    spine.position.z = (d * (1 - tall)) / 2
    if (thick !== leftThick) {
      leftThick = thick
      // 표지 안쪽의 것들을 새 두께에 맞춰 다시 놓는다
      thetaNow = -1
    }
    leftPile!.mesh.visible = open > 0 && thick > 0.0004
  }

  /** 틈을 그린다: 포인터가 더미의 옆면 위에 있고 책이 가만히 펼쳐져 있을 때만 */
  function placeSlit() {
    if (!slitRight || !slitLeft) return
    const at = open === 1 && turns.length === 0 && peek?.depth !== undefined ? peek : null
    const share = pileNow
    const depth = at ? Math.min(1, Math.max(0, at.depth!)) : 0
    const half = READER.pile.slit / 2
    const showRight = at?.side === 'right' && resting < maxOf() && blockDepth * (1 - share) > READER.pile.slit * 2
    slitRight.mesh.visible = showRight
    if (showRight) {
      const top = d / 2 - COVER_THICKNESS
      const thick = blockDepth * Math.max(0.02, 1 - share)
      const z = top - Math.min(thick - half, Math.max(half, depth * thick))
      const [x0, x1] = [-w / 2 + COVER_THICKNESS, w / 2]
      const y = -0.5 - EPS * 3
      const p = slitRight.positions
      p.setXYZ(0, x0, y, z - half)
      p.setXYZ(1, x1, y, z - half)
      p.setXYZ(2, x0, y, z + half)
      p.setXYZ(3, x1, y, z + half)
      // 배 쪽의 비스듬한 면 위: 그 깊이를 지나는 세로줄
      // 면에서 아주 조금만 띄운다(면의 바깥 방향으로)
      const lift = EPS
      const slope = slopeOf('right', thick)
      const at = (dz: number) => [w / 2 + slope * (top - (z + dz)) + lift, z + dz + lift * slope] as const
      const [xa, za] = at(-half)
      const [xb, zb] = at(half)
      p.setXYZ(4, xa, -0.5, za)
      p.setXYZ(5, xa, 0.5, za)
      p.setXYZ(6, xb, -0.5, zb)
      p.setXYZ(7, xb, 0.5, zb)
      p.needsUpdate = true
    }
    const showLeft = at?.side === 'left' && resting > 1 && leftThick > READER.pile.slit * 2 && pagePile !== null
    slitLeft.mesh.visible = showLeft
    if (showLeft) {
      // 깊이 0은 왼쪽 쪽의 바로 아래(표지에서 가장 멀다), 1은 표지 바로 위
      const off = COVER_THICKNESS - leftThick + Math.min(leftThick - half, Math.max(half, (1 - depth) * leftThick))
      const p = slitLeft.positions
      const y = -0.5 - EPS * 3
      for (let i = 0; i <= READER.segments; i++) {
        const [cx, cz, psi] = pagePile![Math.min(pagePile!.length - 1, i)]
        const [nx, nz] = [Math.sin(psi), -Math.cos(psi)]
        p.setXYZ(i * 2, cx * pw + nx * (off - half), y, cz * pw + nz * (off - half))
        p.setXYZ(i * 2 + 1, cx * pw + nx * (off + half), y, cz * pw + nz * (off + half))
      }
      // 배 쪽의 비스듬한 면 위: 위 끝(깊이 0)에서 아래 끝(깊이 1)으로 가는 선 위의 세로줄
      const [tx, tz, bx, bz] = leftFore
      const E = (READER.segments + 1) * 2
      const span = Math.max(1e-6, leftThick)
      ;[depth - half / span, depth + half / span].forEach((f, k) => {
        const g = Math.min(1, Math.max(0, f))
        const x = tx + (bx - tx) * g
        const z = tz + (bz - tz) * g
        // 면에서 아주 조금 띄운다(쪽이 보는 쪽으로)
        p.setXYZ(E + k * 2, x, -0.5, z + EPS * 4)
        p.setXYZ(E + k * 2 + 1, x, 0.5, z + EPS * 4)
      })
      p.needsUpdate = true
    }
  }

  // 오른쪽: 종이 묶음 위
  const right = plane(frontGeometry, mats.right)
  right.position.set(-w / 2 + pw / 2, 0, zRight)
  model.group.add(right)
  // 왼쪽: 표지 안쪽(경첩 안에 넣어 표지와 함께 돈다. 덮여 있을 때는 −Z를 본다)
  const left = plane(leftStrip.geometry, mats.left)
  left.frustumCulled = false
  model.hinges.front.add(left)

  // 넘어가는 낱장: 책등의 선에 물린 채 휘며 넘어간다. 앞·뒤 두 면이 같은 꼭짓점을 쓰고 그림의 좌우만 반대다
  const N = READER.segments
  const leafColors = new THREE.BufferAttribute(new Float32Array((N + 1) * 2 * 3), 3)
  const uvFront = new Float32Array((N + 1) * 2 * 2)
  const uvBack = new Float32Array((N + 1) * 2 * 2)
  const indices: number[] = []
  for (let i = 0; i <= N; i++) {
    const u = i / N
    for (let row = 0; row < 2; row++) {
      const k = i * 2 + row
      uvFront.set([u, row], k * 2)
      uvBack.set([1 - u, row], k * 2)
      leafColors.setXYZ(k, shade(u), shade(u), shade(u))
    }
    if (i < N) {
      const a = i * 2
      // 아래(row 0)·위(row 1): 앞면이 +Z를 보도록 감는다
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
    }
  }
  /**
   * 낱장 하나: 제 꼭짓점과 앞·뒤 재질을 갖는다. 빠르게 이어 넘기면 여러 장이 함께 넘어가므로 몇 장을 만들어 둔다.
   * bend: 꼭짓점을 곡선에 맞춘다. 아래·위 두 줄이 저마다의 곡선을 갖는다(모서리부터 들리고 비틀리며 넘어간다).
   *   angles: 책등 쪽의 기울기, bends: 바깥 끝으로 갈수록 더해지는 기울기(부호 있음)
   */
  function makeLeaf(index: number) {
    const positions = new THREE.BufferAttribute(new Float32Array((N + 1) * 2 * 3), 3)
    const normals = new THREE.BufferAttribute(new Float32Array((N + 1) * 2 * 3), 3)
    const geometry = (uv: Float32Array) => {
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', positions)
      g.setAttribute('normal', normals)
      g.setAttribute('color', leafColors)
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
      g.setIndex(indices)
      return g
    }
    const front = `leaf${index}Front`
    const back = `leaf${index}Back`
    mats[front] = material()
    mats[back] = material(THREE.BackSide)
    const geometries = [geometry(uvFront), geometry(uvBack)]
    const group = new THREE.Group()
    const meshes = [plane(geometries[0], mats[front]), plane(geometries[1], mats[back])]
    for (const mesh of meshes) mesh.frustumCulled = false
    group.add(...meshes)
    group.position.set(-w / 2, 0, zRight)
    group.visible = false
    model.group.add(group)
    function bend(angles: readonly [number, number], bends: readonly [number, number]) {
      for (let row = 0; row < 2; row++) {
        const angle = Math.min(Math.PI, Math.max(0, angles[row]))
        const curve = leafCurve(angle, Math.abs(bends[row]), bends[row] < 0 ? 1 : -1, N, archNow)
        for (let i = 0; i <= N; i++) {
          const [x, z, phi] = curve[i]
          const k = i * 2 + row
          positions.setXYZ(k, x * pw, (row - 0.5) * ph, z * pw)
          normals.setXYZ(k, -Math.sin(phi), 0, Math.cos(phi))
        }
      }
      positions.needsUpdate = true
      normals.needsUpdate = true
    }
    return { group, front, back, bend, geometries, busy: false }
  }
  type Leaf = ReturnType<typeof makeLeaf>
  const leaves: Leaf[] = Array.from({ length: READER.pool }, (_, i) => makeLeaf(i))
  const freeLeaf = () => leaves.find((l) => !l.busy) ?? null

  // ── 그림 ──
  const held = new Map<string, THREE.Texture | null>()
  const waiting = new Map<string, (() => void)[]>()
  let disposed = false
  /** 그림을 받는다. 아직이면 null을 돌려주고, 도착하면 ready를 부른다 */
  function textureAt(url: string, ready?: () => void): THREE.Texture | null {
    if (held.has(url)) {
      const tex = held.get(url) ?? null
      if (!tex && ready) waiting.get(url)?.push(ready)
      return tex
    }
    held.set(url, null)
    waiting.set(url, ready ? [ready] : [])
    textures.acquire(url).then(
      (tex) => {
        if (disposed) return textures.release(url)
        if (tex.anisotropy < anisotropy) {
          tex.anisotropy = anisotropy
          tex.needsUpdate = true
        }
        held.set(url, tex)
        const callbacks = waiting.get(url) ?? []
        waiting.delete(url)
        // 이 그림을 기다리던 면에 붙인다
        for (const slot of Object.keys(mats) as Slot[]) {
          const face = shown[slot]
          if (face?.kind === 'image' && srcOf(face.page) === url) paint(slot, face, true)
        }
        callbacks.forEach((cb) => cb())
        onChange?.()
      },
      () => {
        held.delete(url)
        waiting.delete(url)
      },
    )
    return null
  }
  /** 지금까지 청한 쪽 그림: 주소 → 쪽 */
  const pageUrls = new Map<string, number>()
  const texture = (page: number) => {
    const url = srcOf(page)
    pageUrls.set(url, page)
    return textureAt(url)
  }
  /** 펼침면 a~b에서 멀어진 쪽의 그림을 놓는다. 아직 받는 중인 그림은 두었다가 다음에 놓는다 */
  function letGo(a: number, b: number) {
    const near = pagesNear(a, b, READER.keep, shape)
    for (const [url, page] of pageUrls) {
      if (near && page >= near.from && page <= near.to) continue
      if (!held.get(url)) continue
      // 그 쪽을 달고 있던 면(쉬고 있는 낱장 등)에서도 뗀다: 다음에 같은 쪽으로 칠할 때 놓은 그림이 남아 있지 않게
      for (const slot of Object.keys(mats) as Slot[]) {
        const face = shown[slot]
        if (face?.kind !== 'image' || face.page !== page) continue
        delete shown[slot]
        mats[slot].map = null
        mats[slot].needsUpdate = true
      }
      held.delete(url)
      pageUrls.delete(url)
      textures.release(url)
    }
  }

  function paint(slot: Slot, face: Face, force = false) {
    const prev = shown[slot]
    if (!force && prev && sameFace(prev, face)) return
    shown[slot] = face
    const mat = mats[slot]
    const map = face.kind === 'image' ? texture(face.page) : null
    mat.color.set(face.kind === 'endpaper' ? endpaper : PAPER)
    if (mat.map !== map) {
      mat.map = map
      mat.needsUpdate = true
    }
  }

  // ── 날개: 표지 끝에서 안쪽으로 접혀 있다. 그 면이 드러나 있을 때만 보인다 ──
  const flapMeshes: THREE.Mesh[] = []
  /** 앞날개의 휘는 도형과, 날개가 시작하는 곳(쪽 폭 대비. 배 쪽 끝에서 끝난다) */
  let flapStrip: ReturnType<typeof strip> | null = null
  let flapFrom = 0
  function flapMesh(image: FlapImage, back: boolean) {
    const fw = Math.min(pw, ph * image.aspect)
    if (!back) {
      flapStrip = strip(12, false)
      flapFrom = 1 - fw / pw
    }
    const geometry = back ? new THREE.PlaneGeometry(fw, ph) : flapStrip!.geometry
    const mat = new THREE.MeshStandardMaterial({ color: PAPER, roughness: 0.6, metalness: 0 })
    const apply = () => {
      mat.map = textureAt(image.src, apply)
      mat.needsUpdate = true
    }
    apply()
    const mesh = plane(geometry, mat)
    // 바깥(배) 쪽 끝에 맞춘다
    if (back) {
      mesh.position.set(-w / 2 + pw - fw / 2, 0, zRight + EPS)
      model.group.add(mesh)
    } else {
      mesh.frustumCulled = false
      model.hinges.front.add(mesh)
    }
    mesh.visible = false
    flapMeshes.push(mesh)
    return mesh
  }
  const frontFlap = flaps?.front ? flapMesh(flaps.front, false) : null
  const backFlap = flaps?.back ? flapMesh(flaps.back, true) : null

  /** 앞뒤 한 장씩의 그림을 미리 받아 둔다 */
  function preload(spread: number) {
    for (const s of [spread - 1, spread + 1]) {
      if (s < 1) continue
      const { left: l, right: r } = spreadFaces(s, shape)
      for (const f of [l, r]) if (f.kind === 'image') texture(f.page)
    }
  }

  // ── 상태 ──
  let spread = 0
  /** 화면에 놓인 펼침면(넘기는 중이면 가장 먼저 떠난 쪽) */
  let resting = 1
  let open = 0
  interface Turn {
    from: number
    to: number
    at: number
    peek: [number, number]
    lead: [number, number]
    leaf: Leaf
  }
  /** 넘어가고 있는 낱장들(먼저 떠난 장이 앞). 모두 같은 방향이다 */
  let turns: Turn[] = []
  /** 건너뛰는 중(낱장 몇 장이 잇달아 넘어가고 있다) */
  let jumping = false
  /** 포인터가 올라간 면(요청), 지금 들려 있는 쪽과 그 낱장, 아래·위 모서리가 들린 정도 */
  let peek: ReaderPeek | null = null
  let peeking: { side: 'left' | 'right'; leaf: Leaf } | null = null
  const lifted: [number, number] = [0, 0]
  const maxOf = () => maxSpread(shape)
  /** 그쪽에 넘길 낱장이 있는가(왼쪽 첫 면은 표지라 낱장이 없다) */
  const canPeek = (side: 'left' | 'right') => (side === 'right' ? resting < maxOf() : resting > 1)

  /** 넘어갈 낱장과 그 아래에 드러날 면을 칠한다(넘기기와 들추기가 함께 쓴다) */
  function paintTurn(leaf: Leaf, from: number, forward: boolean) {
    const faces = leafFaces(forward ? from - 1 : from - 2, shape)
    paint(leaf.front, faces.front)
    paint(leaf.back, faces.back)
    if (forward) paint('right', spreadFaces(from + 1, shape).right)
    else paint('left', spreadFaces(from - 1, shape).left)
  }

  function release(leaf: Leaf) {
    leaf.busy = false
    leaf.group.visible = false
  }

  /** 넘기던 것·들추던 것을 모두 내려놓고 펼침면 s의 모습으로 놓는다 */
  function rest(s: number) {
    resting = s
    turns = []
    jumping = false
    peeking = null
    lifted[0] = lifted[1] = 0
    leaves.forEach(release)
    const faces = spreadFaces(s, shape)
    paint('left', faces.left)
    paint('right', faces.right)
    preload(s)
    letGo(s, s)
  }

  function startTurn(from: number, to: number) {
    const forward = to > from
    const side = forward ? 'right' : 'left'
    // 들춰 놓은 쪽으로 넘기면 그 낱장이 그 모습에서 이어서 넘어간다. 반대쪽이 들려 있었다면 내려놓는다
    let carried: [number, number] = [0, 0]
    let leaf: Leaf | null = null
    if (peeking) {
      if (peeking.side === side && turns.length === 0) {
        carried = [lifted[0], lifted[1]]
        leaf = peeking.leaf
      } else {
        release(peeking.leaf)
        if (turns.length === 0) rest(from)
      }
      peeking = null
      lifted[0] = lifted[1] = 0
    }
    leaf ??= freeLeaf()
    if (!leaf) return false
    leaf.busy = true
    // 넘어가는 낱장: 앞으로 넘기면 오른쪽 맨 위의 장, 뒤로 넘기면 왼쪽 맨 위의 장. 떠난 자리에는 다음 면이 드러난다
    paintTurn(leaf, from, forward)
    // 누른 쪽 모서리가 앞서 간다
    const lead: [number, number] = peek?.side === side ? (peek.corner === 'top' ? [0, 1] : [1, 0]) : [0, 0]
    turns.push({ from, to, at: 0, peek: carried, lead, leaf })
    preload(to)
    letGo(resting, to)
    return true
  }

  /** 가장 먼저 떠난 낱장이 놓였다: 그 장이 덮은 쪽의 놓인 면을 바꾼다 */
  function land(turn: Turn) {
    const forward = turn.to > turn.from
    const faces = spreadFaces(turn.to, shape)
    if (forward) paint('left', faces.left)
    else paint('right', faces.right)
    resting = turn.to
    release(turn.leaf)
  }

  function place() {
    const o = ease(open)
    const theta = o * READER.cover
    model.hinges.front.rotation.y = hingeRotation('front', theta)
    placePile(o)
    // 쪽은 책이 반쯤 열린 뒤부터 휘어 오른다(닫히는 동안에는 먼저 평평해진다)
    const arch = READER.arch * ease((open - 0.5) / 0.5)
    if (arch !== archNow) {
      archNow = arch
      archRight.update(arch)
    }
    // 표지는 열리고 닫히는 동안 배 쪽 끝이 뒤처지며 휘고, 다 펼치면 놓인 쪽의 모양을 따른다
    if (theta !== thetaNow || arch !== coverArch) {
      thetaNow = theta
      coverArch = arch
      bendCover(theta, READER.coverLag * Math.sin(Math.PI * o), arch)
    }
    zRight = zFlat + FLOAT * (arch / READER.arch)
    right.position.z = zRight
    if (backFlap) backFlap.position.z = zRight + EPS
    const visible = open > 0
    // 젖힌 표지(펼친 책의 왼쪽 면)도 그림자를 드리운다. 덮여 있을 때는 끈다(얇은 표지가 제 겉면에 얼룩을 남긴다: book3d/model.ts)
    cover.castShadow = visible && model.parts.pageBlock.castShadow
    right.visible = left.visible = visible
    if (frontFlap) frontFlap.visible = visible && shown.left?.kind === 'cover'
    if (backFlap) backFlap.visible = visible && shown.right?.kind === 'blank'
    // 종이 쪽은 휘어 오르고, 표지 안쪽(날개)과 미리보기가 끝난 면은 평평하다
    right.geometry = shown.right?.kind === 'blank' ? frontGeometry : archRight.geometry
    turns.forEach((turn, order) => {
      const p = ease(turn.at / READER.turn)
      const forward = turn.to > turn.from
      const dir = forward ? 1 : -1
      const angle = (forward ? p : 1 - p) * READER.cover
      const mid = Math.sin(Math.PI * p)
      // 가운데를 지날 때 가장 많이 휘고(바깥 끝이 뒤처진다), 놓일 때는 평평해진다. 들춰 놓았던 모양은 넘어가며 풀린다
      const bend = (row: 0 | 1) => -dir * READER.lag * mid + dir * turn.peek[row] * (1 - p) ** 2
      const lead = (row: 0 | 1) => angle + dir * turn.lead[row] * READER.twist * mid
      turn.leaf.bend([lead(0), lead(1)], [bend(0), bend(1)])
      // 먼저 떠난 장이 내려앉을 쪽에서 아래에 깔린다(뒤따르는 장이 그 위에 놓인다)
      // 떠나는 쪽에서는 먼저 떠나는 장이 위에 있다(건너뛸 때는 여러 장이 함께 누워 있다가 차례로 떠난다)
      const stack = (turns.length - 1 - order) * (1 - p) + order * p
      turn.leaf.group.position.z = zRight + (zLeft - zRight) * (angle / READER.cover) + EPS * (2 + stack)
      turn.leaf.group.visible = visible
    })
    if (peeking) {
      const sign = peeking.side === 'right' ? 1 : -1
      const base = peeking.side === 'right' ? 0 : READER.cover
      peeking.leaf.bend([base, base], [sign * lifted[0], sign * lifted[1]])
      peeking.leaf.group.position.z = (peeking.side === 'right' ? zRight : zLeft) + EPS * 2
      peeking.leaf.group.visible = visible
    }
    placeSlit()
  }

  /**
   * 여러 장을 건너뛴다: 낱장 몇 장이 잇달아 넘어가고(사이의 장은 그리지 않는다) 마지막 장이 놓이면 목표의 모습이다.
   * 낱장이 모자라면 false
   */
  function startJump(from: number, to: number) {
    const steps = jumpSteps(from, to, READER.jump.leaves)
    if (peeking) rest(from)
    if (steps.length === 0 || leaves.filter((l) => !l.busy).length < steps.length) return false
    const forward = to > from
    steps.forEach((s, k) => {
      const leaf = freeLeaf()!
      leaf.busy = true
      // 마지막 장을 칠할 때 그 아래에 드러날 면이 목표의 면이 된다
      paintTurn(leaf, s, forward)
      turns.push({ from: s, to: s + (forward ? 1 : -1), at: -k * READER.jump.stagger, peek: [0, 0], lead: [0, 0], leaf })
    })
    jumping = true
    preload(to)
    return true
  }

  /** 들추기: 포인터가 올라간 쪽의 맨 위 낱장을 가까운 모서리부터 들고, 떠나면 내려놓는다 */
  function advancePeek(dtMs: number) {
    if (turns.length > 0) return false
    const want = open === 1 && spread > 0 && peek && canPeek(peek.side) ? peek : null
    if (!peeking && want) {
      const leaf = freeLeaf()
      if (!leaf) return false
      leaf.busy = true
      paintTurn(leaf, resting, want.side === 'right')
      peeking = { side: want.side, leaf }
    }
    if (!peeking) return false
    const here = want && want.side === peeking.side
    const targets: [number, number] = here
      ? want.corner === 'top'
        ? [READER.peek.far, READER.peek.near]
        : [READER.peek.near, READER.peek.far]
      : [0, 0]
    const k = 1 - Math.exp(-dtMs / READER.peek.ms)
    let moving = false
    for (const row of [0, 1] as const) {
      lifted[row] += (targets[row] - lifted[row]) * k
      if (Math.abs(targets[row] - lifted[row]) > 0.003) moving = true
      else lifted[row] = targets[row]
    }
    // 다 내려앉았으면 원래 면으로 되돌린다(반대쪽을 들춰야 하면 다음 프레임에 시작한다)
    if (!here && !moving) {
      rest(resting)
      return want !== null
    }
    return moving
  }

  function setSpread(next: number, animate = true) {
    const target = clampSpread(next, shape)
    if (target === spread) return
    const from = spread
    spread = target
    if (!animate) {
      open = target > 0 ? 1 : 0
      if (target > 0) pileNow = pileShare(target, shape)
      rest(Math.max(1, target))
      place()
      return
    }
    if (target === 0) return // 덮는다: 지금 면 그대로 표지가 덮인다
    if (from === 0) {
      // 펼친다: 덮여 있던 책은 늘 면지부터
      pileNow = pileShare(target, shape)
      rest(target)
    } else {
      // 넘기는 중에 같은 방향으로 한 장 더: 앞선 장이 넘어가는 동안 다음 장이 뒤따라 넘어간다.
      // 방향을 바꾸거나 여러 장을 건너뛰면(또는 낱장이 모자라면) 넘기던 것을 바로 놓고 새로 넘긴다
      // 건너뛰는 중에 또 넘기면 건너뛰던 것을 바로 놓고 그 면으로 간다(아직 떠나지 않은 낱장들과 순서가 엉키지 않게)
      if (jumping) rest(target)
      const last = turns.at(-1)
      const base = last ? last.to : resting
      const sameWay = !last || Math.sign(target - base) === Math.sign(last.to - last.from)
      if (Math.abs(target - base) === 1 && sameWay && startTurn(base, target)) {
        // 이어서 넘어간다
      } else if (last && Math.abs(target - base) === 1) {
        rest(base)
        if (!startTurn(base, target)) rest(target)
      } else if (turns.length === 0 && Math.abs(target - base) > 1 && startJump(base, target)) {
        // 건너뛴다: 낱장 몇 장이 잇달아 넘어간다
      } else rest(target)
    }
    place()
  }

  function advance(dtMs: number) {
    let moving = false
    const goal = spread > 0 ? 1 : 0
    if (open !== goal) {
      const step = dtMs / (goal ? READER.open : READER.close)
      open = goal ? Math.min(1, open + step) : Math.max(0, open - step)
      moving = true
    }
    for (const turn of turns) turn.at += dtMs
    while (turns.length > 0 && turns[0].at >= READER.turn) land(turns.shift()!)
    if (turns.length > 0) moving = true
    else if (jumping) {
      // 건너뛰기가 끝났다(마지막 장이 놓였다): 지나온 쪽의 그림을 놓는다
      jumping = false
      letGo(resting, resting)
    }
    // 더미의 두께가 넘긴 만큼을 따라간다(덮는 동안에는 그대로 두고 책이 닫히며 사라진다)
    if (usePile && spread > 0) {
      const goal = pileShare(spread, shape)
      if (pileNow !== goal) {
        pileNow += (goal - pileNow) * (1 - Math.exp(-dtMs / READER.pile.ms))
        if (Math.abs(goal - pileNow) < 0.0015) pileNow = goal
        moving = true
      }
    }
    if (advancePeek(dtMs)) moving = true
    place()
    return moving
  }

  rest(1)
  place()

  return {
    get openness() {
      return ease(open)
    },
    get spread() {
      return spread
    },
    get pile() {
      const left = usePile ? pileNow * ease(open) : 0
      return { left, right: 1 - left }
    },
    get turning() {
      return turns.length
    },
    setSpread,
    setPeek(next) {
      peek = next ? { ...next } : null
    },
    advance,
    dispose() {
      disposed = true
      model.hinges.front.rotation.y = 0
      cover.geometry = coverWas.geometry
      cover.position.copy(coverWas.position)
      cover.frustumCulled = coverWas.culled
      cover.castShadow = false
      if (usePile) {
        block.scale.z = 1
        block.position.z = 0
        spine.scale.z = 1
        spine.position.z = 0
        model.hinges.front.position.z = hingeWas.front
        model.hinges.back.position.z = hingeWas.back
        for (const part of [leftPile, rightFan, slitRight, slitLeft]) {
          part?.mesh.removeFromParent()
          part?.geometry.dispose()
        }
        pileMaterial?.dispose()
        pileLines?.dispose()
        slitMaterial?.dispose()
      }
      coverGeometry.dispose()
      leftStrip.geometry.dispose()
      right.removeFromParent()
      left.removeFromParent()
      for (const l of leaves) {
        l.group.removeFromParent()
        l.geometries.forEach((g) => g.dispose())
      }
      frontGeometry.dispose()
      archRight.geometry.dispose()
      for (const mesh of flapMeshes) {
        mesh.removeFromParent()
        mesh.geometry.dispose()
        ;(mesh.material as THREE.Material).dispose()
      }
      for (const mat of Object.values(mats)) mat.dispose()
      for (const [url, tex] of held) if (tex) textures.release(url)
      held.clear()
    },
  }
}
