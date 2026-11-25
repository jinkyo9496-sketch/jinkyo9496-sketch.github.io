/**
 * 책 한 권의 3D 모형(three.js만 쓴다. React·서가 장면과 무관하다).
 *
 * 축: 책의 중심이 원점, 책 높이 = 1. +Z 앞표지 · −Z 뒤표지 · −X 책등 · +X 배 · ±Y 위·아래(`spec.ts`).
 * 구조:
 *   group
 *   ├─ pageBlock            종이 묶음(배·위·아래에 책장 줄무늬)
 *   ├─ spine                책등(바깥이 인쇄 면)
 *   ├─ hinges.front (Group) 앞표지의 경첩: 책등 쪽 바깥 모서리(coverHinge)
 *   │   └─ frontCover       rotation.y = hingeRotation('front', 각) 으로 열린다
 *   └─ hinges.back (Group)
 *       └─ backCover
 * 여는 움직임은 아직 없다(경첩만 있다).
 */
import * as THREE from 'three'
import { createBookGeometries } from './geometry'
import { createPageEdgeTexture } from './pageTexture'
import { coverHinge, type BookSpec, type CoverSide } from './spec'
import { sharedBookTextures, type TextureCache } from './textures'

export type BookPart = 'frontCover' | 'backCover' | 'spine' | 'pageBlock'
export type BookFace = 'front' | 'back' | 'spine'
export const BOOK_FACES: readonly BookFace[] = ['front', 'back', 'spine']
const PART_OF: Record<BookFace, BookPart> = { front: 'frontCover', back: 'backCover', spine: 'spine' }

/** 표지: 무광 코팅지 */
const COVER_ROUGHNESS = 0.5
const COVER_SPECULAR = 0.4
/** 종이 단면 */
const PAPER_ROUGHNESS = 0.95

export type MaterialHook = (material: THREE.Material, part: BookPart) => void

export interface BookSharedOptions {
  /** 종이색(`--book-block`) */
  blockColor?: THREE.ColorRepresentation
  /** 비등방 필터(렌더러의 최댓값을 넣는다) */
  anisotropy?: number
  /** 종이 재질을 만든 직후에 부른다(셰이더 고치기 등) */
  onMaterial?: MaterialHook
}

/** 여러 권이 함께 쓰는 것: 종이 재질과 책장 줄무늬 텍스처(한 벌이면 된다) */
export interface BookShared {
  paper: THREE.MeshStandardMaterial
  pageTexture: THREE.DataTexture
  dispose(): void
}

export function createBookShared({ blockColor = 0xffffff, anisotropy = 1, onMaterial }: BookSharedOptions = {}): BookShared {
  const pageTexture = createPageEdgeTexture(anisotropy)
  const paper = new THREE.MeshStandardMaterial({
    color: new THREE.Color(blockColor),
    map: pageTexture,
    roughness: PAPER_ROUGHNESS,
    metalness: 0,
  })
  onMaterial?.(paper, 'pageBlock')
  return {
    paper,
    pageTexture,
    dispose() {
      paper.dispose()
      pageTexture.dispose()
    },
  }
}

export interface BookModelOptions extends BookSharedOptions {
  /** 여러 권이 함께 쓰는 종이 재질. 없으면 이 책이 제 것을 만들고 버린다 */
  shared?: BookShared
  /** 그림이 오기 전의 인쇄 면 색(`--ink-faint`) */
  placeholderColor?: THREE.ColorRepresentation
  roughness?: number
  specular?: number
  /** 그림 캐시. 기본은 앱 전체가 함께 쓰는 것 */
  textures?: TextureCache
  /** 닫힌 책의 그림자(종이 묶음이 책 전체의 그림자를 드리운다) */
  castShadow?: boolean
  receiveShadow?: boolean
}

export interface BookModel {
  spec: BookSpec
  group: THREE.Group
  parts: Record<BookPart, THREE.Mesh>
  /** 표지의 경첩(rotation.y로 연다). 지금은 닫힌 채로만 쓴다 */
  hinges: Record<CoverSide, THREE.Group>
  materials: Record<BookFace, THREE.MeshPhysicalMaterial> & { paper: THREE.MeshStandardMaterial }
  /** 그림이 붙거나 떨어져 다시 그려야 할 때 부른다 */
  onTextureChange: (() => void) | null
  /** 세 면의 그림을 받는다(이미 받았거나 받는 중인 면은 건너뛴다). 모두 끝나면(실패 포함) 풀린다 */
  loadTextures(): Promise<void>
  /** 그림을 놓고 그림 오기 전의 색으로 돌아간다(GPU 메모리). 모형은 그대로 쓸 수 있다 */
  disposeTextures(): void
  /** 받아서 붙인 그림 */
  textureOf(face: BookFace): THREE.Texture | null
  loadedFaces(): number
  /** 그림·재질·도형을 모두 버린다(함께 쓰는 종이 재질은 그 주인이 버린다) */
  dispose(): void
}

export function createBookModel(spec: BookSpec, options: BookModelOptions = {}): BookModel {
  const {
    placeholderColor = 0xffffff,
    roughness = COVER_ROUGHNESS,
    specular = COVER_SPECULAR,
    anisotropy = 1,
    textures = sharedBookTextures(),
    castShadow = false,
    receiveShadow = false,
    onMaterial,
  } = options
  const ownShared = options.shared ? null : createBookShared(options)
  const paper = (options.shared ?? ownShared!).paper
  const placeholder = new THREE.Color(placeholderColor)

  const printed = (face: BookFace) => {
    const material = new THREE.MeshPhysicalMaterial({
      color: placeholder,
      roughness,
      metalness: 0,
      specularIntensity: specular,
    })
    onMaterial?.(material, PART_OF[face])
    return material
  }
  const materials = { front: printed('front'), back: printed('back'), spine: printed('spine'), paper }

  const geometries = createBookGeometries(spec)
  const mesh = (part: BookPart, material: THREE.Material | THREE.Material[]) => {
    const m = new THREE.Mesh(geometries[part], material)
    m.name = part
    m.receiveShadow = receiveShadow
    return m
  }
  const parts: Record<BookPart, THREE.Mesh> = {
    frontCover: mesh('frontCover', [materials.front, paper]),
    backCover: mesh('backCover', [materials.back, paper]),
    spine: mesh('spine', [materials.spine, paper]),
    pageBlock: mesh('pageBlock', paper),
  }
  // 닫힌 책에서는 종이 묶음만 그림자를 드리운다: 표지는 그 겉에 붙어 있어 그림자가 같고,
  // 얇은 표지가 제 그림자를 제 겉면에 얼룩(acne)으로 남기지 않는다. 표지를 열 때는 그 표지의 castShadow를 켠다.
  parts.pageBlock.castShadow = castShadow

  const group = new THREE.Group()
  group.name = `book-${spec.no}`
  const hinge = (side: CoverSide, cover: THREE.Mesh) => {
    const pivot = new THREE.Group()
    pivot.name = `${side}Hinge`
    pivot.position.set(...coverHinge(spec, side).pivot)
    // 도형은 책 좌표로 만들어져 있으므로, 경첩 안에서 제자리에 오도록 되돌려 놓는다
    cover.position.copy(pivot.position).negate()
    pivot.add(cover)
    return pivot
  }
  const hinges = { front: hinge('front', parts.frontCover), back: hinge('back', parts.backCover) }
  group.add(parts.pageBlock, parts.spine, hinges.front, hinges.back)

  // ── 그림 ─────────────────────────────────────────────
  /** 면마다: 없음 / 받는 중(그 요청의 표시) / 붙인 텍스처 */
  const state: Partial<Record<BookFace, THREE.Texture | { url: string }>> = {}
  let pending: Promise<void> | null = null

  function loadFace(face: BookFace): Promise<void> | null {
    if (state[face]) return null
    const url = spec.images[face]
    const request = { url }
    state[face] = request
    return textures.acquire(url).then(
      (texture) => {
        // 받는 동안 놓았으면(disposeTextures) 이미 release 했다
        if (state[face] !== request) return
        if (texture.anisotropy < anisotropy) {
          texture.anisotropy = anisotropy
          texture.needsUpdate = true
        }
        state[face] = texture
        const material = materials[face]
        material.map = texture
        material.color.set(0xffffff)
        material.needsUpdate = true
        model.onTextureChange?.()
      },
      () => {
        if (state[face] === request) delete state[face]
      },
    )
  }

  function loadTextures() {
    const started = BOOK_FACES.map(loadFace).filter((p): p is Promise<void> => p !== null)
    if (started.length > 0) {
      const all = Promise.all(pending ? [pending, ...started] : started).then(() => {
        if (pending === all) pending = null
      })
      pending = all
    }
    return pending ?? Promise.resolve()
  }

  function disposeTextures() {
    let changed = false
    for (const face of BOOK_FACES) {
      const held = state[face]
      if (!held) continue
      delete state[face]
      textures.release(held instanceof THREE.Texture ? spec.images[face] : held.url)
      const material = materials[face]
      if (material.map) {
        material.map = null
        material.needsUpdate = true
        changed = true
      }
      material.color.copy(placeholder)
    }
    if (changed) model.onTextureChange?.()
  }

  const textureOf = (face: BookFace) => {
    const held = state[face]
    return held instanceof THREE.Texture ? held : null
  }

  const model: BookModel = {
    spec,
    group,
    parts,
    hinges,
    materials,
    onTextureChange: null,
    loadTextures,
    disposeTextures,
    textureOf,
    loadedFaces: () => BOOK_FACES.filter((face) => textureOf(face)).length,
    dispose() {
      model.onTextureChange = null
      disposeTextures()
      BOOK_FACES.forEach((face) => materials[face].dispose())
      Object.values(geometries).forEach((g: THREE.BufferGeometry) => g.dispose())
      ownShared?.dispose()
      group.removeFromParent()
    },
  }
  return model
}
