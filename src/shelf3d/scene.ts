/**
 * three.js로 그리는 서가. 책은 한 권씩 따로 만든 모형(`src/book3d`의 `createBookModel`: 표지·책등·종이 묶음)이고,
 * 실제 조명과 그림자 맵으로 음영을 낸다. 길이 단위는 CSS px이다(z=0 평면이 화면 픽셀과 1:1).
 *
 * 책의 면: +Z 앞표지, −Z 뒤표지, −X 책등, +X 배(책장을 넘기는 쪽), ±Y 위·아래(종이 단면).
 * rotation.y = π/2이면 책등이 보는 사람을 향한다(CSS 서가의 rotateY(90deg)와 같다).
 * 가운데 책은 정면에서 조금 돌아 서 있고(`CURRENT_REST`), 포인터를 따라 더 돈다(`currentTurnOffset`).
 *
 * 움직임은 필요할 때만 그린다(멈춰 있으면 프레임을 만들지 않는다). 서가 화면이 보이지 않는 동안에는 그리지 않는다.
 */
import * as THREE from 'three'
import { BOOK_FACES, bookSpecFrom, createBookModel, createBookShared, sharedBookTextures, type BookModel } from '../book3d'
import { pageColorsFor } from '../data/bookColors'
import { bookContent, readerFlaps } from '../data/bookContent'
import { flapSrc } from '../data/previews'
import { createBookReader, type BookReader } from './reader'
import { computeShelfLayout, type BookSlot } from '../shelf/layout'
import { FLOOR_SHADOW, contactShadow, visibleFloorDepth } from './floorShadow'
import {
  CURRENT_REST,
  EYE_LIFT,
  PAGE,
  PAGE_SPREAD,
  mixPose,
  spreadPose,
  openBookReach,
  PAGE_CLOSE,
  PAGE_OPEN,
  PAGE_TURN,
  renderPixelRatio,
  drawOrderFor,
  pageShadowOn,
  PERSPECTIVE,
  PLACE_LIFT,
  RISE,
  bookPoseTargets,
  cameraFrustum,
  currentTurnOffset,
  isSettled,
  omegaForSettle,
  pageAmount,
  pageOffLeft,
  pagePointerTurn,
  pagePose,
  pickUpPose,
  placeOffset,
  placeTotalMs,
  returnPose,
  returnSettle,
  riseOffset,
  riseTotalMs,
  springStep,
  sweepInOffset,
  textureRanges,
  rowJumpStart,
  rowSeenHalf,
  sweepOutOffset,
  sweepPlan,
  turnEnterPose,
  turnExitPose,
  type BookPose,
  type Pose6,
  type Spring,
  type SweepPlan,
} from './motion'
import type { SceneOptions, ScenePage, ScenePointer, SceneState, ShelfSceneHandle, Stage } from './sceneTypes'
import { createWarmQueue } from './warm'

/** 포인터 반응(뽑힘·기울임)이 자리를 잡는 시간(초). CSS 서가의 --hover-move 420ms */
const HOVER_SECONDS = 0.42
/** 화면에 걸친 책 바깥으로 이만큼 더 그림을 받아 둔다 */
const LOAD_MARGIN = 4
/** 받아 둔 범위에서 이만큼 더 벗어난 책의 그림은 버린다(GPU 메모리) */
const KEEP_MARGIN = 10
/** 받은 그림을 미리 GPU에 올릴 때 한 프레임에 올리는 장 수(`warm.ts`) */
const WARM_PER_FRAME = 2
/** 숨은 탭에서 돌아온 긴 프레임은 이만큼(ms)으로 자른다 */
const MAX_FRAME_MS = 100

export interface KeyLight {
  /** 위치(책 높이의 배수). 빛은 여기서 장면 가운데(0,0,0)를 향해 나란히 온다 */
  position: [number, number, number]
  /** 이 조명이 정면(+z)을 보는 흰 면에 보태는 밝기(0~1) */
  onFront: number
  /** 그림자의 농도(1 = 이 조명을 다 가린다) */
  shadow: number
  /** 그림자 가장자리의 흐림(그림자 맵 텍셀 단위) */
  radius: number
  mapSize: [number, number]
}

/**
 * 조명 값. 세기는 "정면을 보는 흰 면이 받는 양"으로 적는다:
 * 표지 색을 그대로 보이려면 정면(+z) 면에서 fill + Σ key = 1이 되어야 한다.
 *
 * - 주광(keys[0]): 정면 위, 조금 왼쪽. 면이 돌 때의 밝기 변화와 책 옆면의 그늘을 만든다.
 * - 옆 조명 둘(keys[1], keys[2]): 정면 위에서 좌우로 60°쯤 누운 빛. 가운데 책은 옆 책등보다 책 높이의
 *   12%만 앞에 있고 옆 책과는 책등 두 개 폭만큼 떨어져 있어서, 빛이 이만큼 누워야 그 그림자가 옆 책등에 닿는다.
 *   뽑혀 나온 책이 양옆 책에 드리우는 그림자도 이 둘이 만든다.
 * - 옆면 그늘(side): 책과 책 사이로 보이는 표지 옆면은 그림이 아니라 그늘로 읽혀야 한다(밝으면 번잡하다).
 *   옆을 보는 면의 빛에 이 값을 곱한다. 책등 평면(z=0)에서 서가 안쪽으로 갈수록 near → deep,
 *   평면보다 앞으로 나온 부분(뽑힌 책)은 exposed까지 밝아진다.
 */
export const LIGHTING = {
  keys: [
    {
      position: [-0.28, 0.95, 1],
      onFront: 0.16,
      shadow: 1,
      radius: 2,
      mapSize: [2048, 1024],
    },
    {
      position: [-1.75, 1.05, 1],
      onFront: 0.34,
      shadow: 1,
      radius: 3.5,
      mapSize: [1024, 512],
    },
    {
      position: [1.75, 1.2, 1],
      onFront: 0.26,
      shadow: 1,
      radius: 3.5,
      mapSize: [1024, 512],
    },
  ] as KeyLight[],
  /** 반구광(하늘/바닥)이 정면 면에 보태는 밝기. 두 주광이 모두 가려진 곳에 남는 밝기이기도 하다 */
  fillOnFront: 0.24,
  /** 반구광의 바닥 쪽 색(하늘 1에 대한 비율). 아래를 보는 면이 조금 더 어둡다 */
  fillGround: 0.55,
  /**
   * 바닥 그림자의 농도(종이색 위에 얹는 먹의 불투명도, 책 바로 밑의 가장 진한 곳).
   * 바닥은 조명의 그림자를 받지 않는다: 책마다 바로 아래의 닿는 그림자 하나만 그린다(`floorShadow.ts`)
   */
  floorShadow: 0.2,
  /**
   * 책 페이지: 떠 있는 책 뒤에 "페이지"(보이지 않는 벽, 그림자만 받는다)가 있고, 이 조명 하나가 책의 그림자를
   * 그 위에 드리운다. 캔버스는 투명해서 페이지의 색은 DOM의 바탕색 그대로다. 이 동안 서가의 바닥과
   * 다른 조명의 그림자는 뺀다(책의 음영을 만드는 빛은 그대로).
   */
  page: {
    /** 빛이 오는 쪽(책에서 본 방향): 오른쪽 위 앞. 그림자가 책의 왼쪽 아래로 드리운다 */
    position: [0.3, 0.42, 1] as [number, number, number],
    /** 그림자의 농도(페이지 색 위에 얹는 먹의 불투명도) */
    shadow: 0.34,
    /** 그림자 맵의 한 변(텍셀)과 가장자리의 흐림(텍셀). 맵이 작을수록 가장자리가 넓게 풀린다 */
    mapSize: 384,
    radius: 3.5,
    /** 페이지(벽)는 떠 있는 책의 중심에서 이만큼(책 높이 대비) 뒤에 있다. 책이 반 바퀴 돌 때 닿지 않는 거리 */
    wall: 0.42,
  },
  /** 표지 재질: 무광 코팅지 */
  roughness: 0.5,
  /** 반사광의 세기(1 = 보통의 비금속). 낮춰서 어두운 색이 허옇게 뜨지 않게 한다 */
  specular: 0.4,
  /** 스펙큘러·에너지 보존으로 줄어드는 확산광을 메우는 보정(정면 흰 면 = 1.0이 되게 실측해 맞춘다) */
  gain: 1.0,
  side: {
    /** 책등 평면(z=0)에서 옆면의 빛에 곱하는 값 */
    near: 0.55,
    /** 서가 안쪽 끝(책등에서 depth만큼 뒤)에서 곱하는 값 */
    deep: 0.3,
    /** 책등 평면보다 앞으로 나온 옆면(뽑힌 책)에 곱하는 값 */
    exposed: 1,
    /** near → deep으로 어두워지는 깊이(책 높이 대비) */
    depth: 0.6,
    /** near → exposed로 밝아지는 거리(책 높이 대비) */
    exposeDepth: 0.08,
  },
}

interface BookEntry {
  /** 책 한 권의 모형(책 높이 = 1. group.scale로 책 높이를 준다) */
  model: BookModel
  x: Spring
  z: Spring
  rot: Spring
  pull: Spring
  yaw: Spring
  pitch: Spring
  /** 놓이는 움직임(0~1). placeAt ≥ 0이면 정해진 곡선을 따르고, 아니면 0으로 돌아간다 */
  place: Spring
  placeAt: number
  placeMs: number
  /** 지난 프레임에 놓인 자세(전환을 시작할 때 여기서 출발한다) */
  pose: Pose6 | null
}

/** 책 페이지로 가는·나오는·넘기는 움직임. at은 시작한 뒤 흐른 시간(ms) */
type PageTransition =
  | { kind: 'open'; at: number; featured: number; from: Pose6; plan: SweepPlan }
  | {
      kind: 'close'
      at: number
      featured: number
      from: Pose6
      plan: SweepPlan
    }
  | {
      kind: 'turn'
      at: number
      incoming: number
      outgoing: number | null
      outFrom: Pose6 | null
    }

const TRANSITION_MS = {
  open: PAGE_OPEN.total,
  close: PAGE_CLOSE.total,
  turn: PAGE_TURN.total,
}

const spring = (x = 0): Spring => ({ x, v: 0 })
const radians = (deg: number) => (deg * Math.PI) / 180

/** 그림자 가장자리를 흐리게 하려고 그림자 맵을 읽는 횟수(three의 기본은 5) */
export const SHADOW_TAPS = 3

/**
 * three의 그림자 읽기(`shadowmap_pars_fragment`)에서 그림자 맵을 읽는 표본 수만 줄인 것(점광원의 읽기는 그대로. 이 장면의 그림자 조명은 평행광뿐이다). 책의 화소마다 조명 셋의
 * 그림자 맵을 읽으므로 이 횟수가 서가를 그리는 시간의 큰 몫이다. three가 그 부분을 바꿔 찾지 못하면 원래대로 쓴다.
 */
export function lightShadowChunk(chunk: string, taps = SHADOW_TAPS) {
  const sample = (i: number) =>
    `texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( ${i}, ${taps}, phi ) * radius, shadowCoord.z ) )`
  const lighter = `shadow = ( ${Array.from({ length: taps }, (_, i) => sample(i)).join(' + ')} ) / ${taps}.0;`
  return chunk.replace(
    /shadow = \(\s*texture\( shadowMap, vec3\( shadowCoord\.xy \+ vogelDiskSample\( 0, 5, phi \)[\s\S]*?\) \* 0\.2;/,
    lighter,
  )
}
const LIGHT_SHADOW_CHUNK = lightShadowChunk(THREE.ShaderChunk.shadowmap_pars_fragment)

/**
 * 옆을 보는 면(월드 좌표에서 법선이 좌우를 향하는 면)을 그늘로 만든다: 조명 계산이 끝난 빛에
 * 깊이에 따른 값을 곱한다(값싼 가림 처리). 책이 돌아 정면을 향하면 저절로 풀린다.
 */
function shadeSideFaces(material: THREE.Material, uniforms: Record<string, THREE.IUniform>) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vSideFacing;\nvarying float vShelfZ;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvSideFacing = abs(normalize(mat3(modelMatrix) * normal).x);\nvShelfZ = (modelMatrix * vec4(position, 1.0)).z;',
      )
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <shadowmap_pars_fragment>', LIGHT_SHADOW_CHUNK)
      .replace(
        '#include <common>',
        '#include <common>\nuniform vec3 uSideShade;\nuniform vec2 uSideDepth;\nvarying float vSideFacing;\nvarying float vShelfZ;',
      )
      .replace(
        '#include <opaque_fragment>',
        [
          'float sideAmount = smoothstep(0.55, 0.95, vSideFacing);',
          'float sideShade = vShelfZ < 0.0',
          '  ? mix(uSideShade.x, uSideShade.y, clamp(-vShelfZ / uSideDepth.x, 0.0, 1.0))',
          '  : mix(uSideShade.x, uSideShade.z, clamp(vShelfZ / uSideDepth.y, 0.0, 1.0));',
          'outgoingLight *= mix(1.0, sideShade, sideAmount);',
          '#include <opaque_fragment>',
        ].join('\n'),
      )
  }
  material.customProgramCacheKey = () => 'shelf-side-shade'
}

export function createShelfScene({ canvas, books, colors, initial, page: initialPage }: SceneOptions) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  })
  renderer.setClearColor(0x000000, 0)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  // 표지 색을 바꾸지 않도록 톤 매핑을 쓰지 않는다
  renderer.toneMapping = THREE.NoToneMapping
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  const maxAnisotropy = renderer.capabilities.getMaxAnisotropy()

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera()

  // ── 조명 ──────────────────────────────────────────────
  const fill = new THREE.HemisphereLight(0xffffff, 0xffffff, 1)
  const keys = LIGHTING.keys.map(() => {
    const light = new THREE.DirectionalLight(0xffffff, 1)
    light.castShadow = true
    scene.add(light, light.target)
    return light
  })
  scene.add(fill)

  // 책 페이지의 그림자만 만드는 조명(빛은 거의 보태지 않는다)
  const pageLight = new THREE.DirectionalLight(0xffffff, 0.01)
  pageLight.castShadow = true
  pageLight.shadow.intensity = 0
  scene.add(pageLight, pageLight.target)

  /** 그림자 카메라(직교)를 상자(가로·세로·앞뒤 범위)에 꼭 맞춘다 */
  const corner = new THREE.Vector3()
  const lightView = new THREE.Matrix4()
  type Range = [number, number]
  function fitShadowBox(light: THREE.DirectionalLight, xs: Range, ys: Range, zs: Range, pad: number) {
    lightView.lookAt(light.position, light.target.position, light.up).setPosition(light.position).invert()
    const min = new THREE.Vector3(Infinity, Infinity, Infinity)
    const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity)
    for (const x of xs)
      for (const y of ys)
        for (const z of zs) {
          corner.set(x, y, z).applyMatrix4(lightView)
          min.min(corner)
          max.max(corner)
        }
    const cam = light.shadow.camera
    cam.left = min.x - pad
    cam.right = max.x + pad
    cam.bottom = min.y - pad
    cam.top = max.y + pad
    // 카메라는 −z를 본다
    cam.near = Math.max(1, -max.z - pad)
    cam.far = -min.z + pad
    cam.updateProjectionMatrix()
  }
  /** 서가의 조명: 책이 놓이는 상자(가로 ±halfW, 책 높이, 앞뒤 깊이)에 맞춘다 */
  const fitShadowCamera = (light: THREE.DirectionalLight, halfW: number, H: number) =>
    fitShadowBox(light, [-halfW, halfW], [-H / 2, H / 2], [-H * 0.75, H * 0.4], H * 0.05)

  // ── 책 페이지의 "페이지": 떠 있는 책 뒤의 벽. 그림자만 받는다 ──
  const wallMaterial = new THREE.ShadowMaterial({
    color: new THREE.Color(colors.shadow),
    opacity: 0,
  })
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), wallMaterial)
  wall.receiveShadow = true
  wall.visible = false
  scene.add(wall)

  // ── 바닥: 종이색 페이지 위에 책마다의 닿는 그림자만 얹는다 ───────────
  // 조명의 그림자는 받지 않는다(여러 조명의 그림자가 겹쳐 길게 퍼지고 캔버스가 잘리는 선에서 끊겼다).
  // 책의 발자국 둘레로 옅어지는 그림자를 셰이더가 직접 그린다: `floorShadow.ts`의 shadowAt·floorFade와 같은 식
  const floorUniforms = {
    uColor: { value: new THREE.Color(colors.shadow) },
    uOpacity: { value: LIGHTING.floorShadow },
    uCount: { value: 0 },
    /** 그림자마다: 발자국의 중심 (x, z)와 반쪽 크기 (가로, 두께) */
    uRect: { value: books.map(() => new THREE.Vector4()) },
    /** 그림자마다: 돌아선 각의 (cos, sin), 농도 */
    uTurn: { value: books.map(() => new THREE.Vector4()) },
    /** 그림자마다: 번지는 길이 (옆·뒤, 앞) */
    uReach: { value: books.map(() => new THREE.Vector2()) },
    /** 보이는 바닥의 깊이, 그 앞쪽에서 옅어지는 구간의 길이, 책등 면 뒤로 바닥이 있는 길이 */
    uFade: { value: new THREE.Vector3(0, 1, 1) },
  }
  const floorMaterial = new THREE.ShaderMaterial({
    uniforms: floorUniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: [
      'varying vec2 vFloor;',
      'void main() {',
      '  vec4 world = modelMatrix * vec4(position, 1.0);',
      '  vFloor = world.xz;',
      '  gl_Position = projectionMatrix * viewMatrix * world;',
      '}',
    ].join('\n'),
    fragmentShader: [
      `#define COUNT ${Math.max(1, books.length)}`,
      'uniform vec3 uColor;',
      'uniform float uOpacity;',
      'uniform int uCount;',
      'uniform vec4 uRect[COUNT];',
      'uniform vec4 uTurn[COUNT];',
      'uniform vec2 uReach[COUNT];',
      'uniform vec3 uFade;',
      'varying vec2 vFloor;',
      'void main() {',
      '  float strongest = 0.0;',
      '  for (int i = 0; i < COUNT; i++) {',
      '    if (i >= uCount) break;',
      '    vec4 rect = uRect[i];',
      '    vec4 turn = uTurn[i];',
      '    vec2 reach = uReach[i];',
      '    vec2 p = vFloor - rect.xy;',
      // 책의 축으로 옮겨 발자국에서 벗어난 만큼을 구하고, 다시 바닥의 축으로 돌린다
      '    vec2 local = vec2(p.x * turn.x - p.y * turn.y, p.x * turn.y + p.y * turn.x);',
      '    vec2 off = sign(local) * max(abs(local) - rect.zw, 0.0);',
      '    vec2 away = vec2(off.x * turn.x + off.y * turn.y, -off.x * turn.y + off.y * turn.x);',
      '    float along = away.y > 0.0 ? reach.y : reach.x;',
      '    float rest = 1.0 - min(1.0, length(vec2(away.x / reach.x, away.y / max(along, 1e-4))));',
      '    strongest = max(strongest, turn.z * rest * rest);',
      '  }',
      '  float z = vFloor.y;',
      '  float fade = z < 0.0',
      '    ? clamp(1.0 + z / uFade.z, 0.0, 1.0)',
      '    : smoothstep(0.0, 1.0, (uFade.x - z) / max(uFade.y, 1e-4));',
      '  gl_FragColor = vec4(uColor, strongest * fade * uOpacity);',
      '  #include <colorspace_fragment>',
      '}',
    ].join('\n'),
  })
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), floorMaterial)
  floor.rotation.x = -Math.PI / 2
  scene.add(floor)
  /** 닿는 그림자를 구할 때의 치수(책 높이·책 사이 간격·보이는 바닥의 깊이). `setStage`가 정한다 */
  let shadowOptions = { bookHeight: 1, gap: 0, depth: 0 }

  // ── 책 ───────────────────────────────────────────────
  const sideUniforms = {
    uSideShade: { value: new THREE.Vector3(1, 1, 1) },
    uSideDepth: { value: new THREE.Vector2(1, 1) },
  }
  const blank = new THREE.Color(colors.blank)
  const onMaterial = (material: THREE.Material) => shadeSideFaces(material, sideUniforms)
  // 종이 재질과 책장 줄무늬는 모든 책이 한 벌을 함께 쓴다
  const shared = createBookShared({
    blockColor: colors.block,
    anisotropy: maxAnisotropy,
    onMaterial,
  })
  const textures = sharedBookTextures()
  /**
   * 받은 표지 그림을 그리기 전에 미리, 한 프레임에 몇 장씩 GPU에 올린다(`warm.ts`). three는 그림을 처음 그릴 때 올리는데,
   * 화면 밖에서 받아 둔 책(웰컴의 줄에 설 1~18권 등)이 한꺼번에 화면으로 들어오면 그 프레임에 수십 장이 올라가 움직임이 멈춘다
   * (주소로 30권의 책 페이지에 바로 온 뒤 웰컴으로 올라갈 때 130~220ms). 받는 대로 올려 두면 전환 도중에 올릴 것이 없다
   */
  const warm = createWarmQueue<THREE.Texture>({
    upload: (texture) => {
      if (!disposed && !renderer.getContext().isContextLost()) renderer.initTexture(texture)
    },
    perStep: WARM_PER_FRAME,
    schedule: (run) => void requestAnimationFrame(run),
  })
  /** 책마다 미리 올리게 넣어 둔 그림(그림이 바뀌면 빠진 것을 줄에서 뺀다) */
  const warmFaces: THREE.Texture[][] = books.map(() => [])
  const warmBook = (i: number, model: BookModel) => {
    const now = BOOK_FACES.map((face) => model.textureOf(face)).filter((t): t is THREE.Texture => t !== null)
    for (const texture of warmFaces[i]) if (!now.includes(texture)) warm.forget(texture)
    for (const texture of now) warm.add(texture)
    warmFaces[i] = now
  }
  const entries: BookEntry[] = books.map((book, bookIndex) => {
    const model = createBookModel(bookSpecFrom(book), {
      shared,
      textures,
      placeholderColor: blank,
      roughness: LIGHTING.roughness,
      specular: LIGHTING.specular,
      anisotropy: maxAnisotropy,
      castShadow: true,
      receiveShadow: true,
      onMaterial,
    })
    model.onTextureChange = () => {
      warmBook(bookIndex, model)
      invalidate()
    }
    model.group.rotation.order = 'XYZ'
    scene.add(model.group)
    return {
      model,
      x: spring(),
      z: spring(),
      rot: spring(),
      pull: spring(),
      yaw: spring(),
      pitch: spring(),
      place: spring(),
      placeAt: -1,
      placeMs: 0,
      pose: null,
    }
  })

  // ── 상태 ─────────────────────────────────────────────
  let state: SceneState = { ...initial }
  let pointer: ScenePointer = { hoverIndex: null, tilt: null }
  let stage: Stage | null = null
  let slots: BookSlot[] = []
  let targets: BookPose[] = []
  let active = false
  /** 올라오는 움직임: 시작한 뒤 흐른 시간(ms)과 그때의 가운데 책. 없으면 null */
  let rise: { at: number; from: number } | null = null
  // 책 페이지
  let page: ScenePage = { open: false, side: 'front', ...initialPage }
  let transition: PageTransition | null = null
  /** 책 페이지의 모습이 들어와 있는 정도(0 = 서가, 1 = 책 페이지). 그림자와 바닥이 따른다 */
  let pageMix = page.open ? 1 : 0
  let appliedMix = -1
  let pagePointer: { x: number; y: number } | null = null
  /** 떠 있는 책: 뒤표지를 보이려 도는 각, 포인터를 따라 도는 각 */
  let flip = spring(page.side === 'back' ? Math.PI : 0)
  let pageYaw = spring()
  let pagePitch = spring()
  /** 펼친 책(책 페이지에서 책을 눌러 펼쳤을 때): 어느 책의 것인가와 그 낱장들 */
  let reader: { index: number; r: BookReader } | null = null
  let disposed = false
  let raf = 0
  let lastTime = 0
  let needsRender = true
  const stats = { frames: 0, renderMs: 0 }
  const BOOK_PARTS = ['pageBlock', 'spine', 'frontCover', 'backCover'] as const

  const hoverOmega = omegaForSettle(HOVER_SECONDS)
  const flipOmega = omegaForSettle(PAGE.flipSeconds)
  /** 펼쳐져 있는 책(없으면 −1): 지나가는 중에는 펼쳐진 책이 없다 */
  const openIndex = (s: SceneState) => (s.closed || s.lineup ? -1 : s.index)

  // ── 그림(텍스처) ──────────────────────────────────────
  /**
   * 화면에 걸친 책과 그 둘레의 그림을 받고, 멀리 벗어난 책의 그림은 버린다.
   * 범위는 `textureRanges`: 가운데 책의 둘레(`near`)와 웰컴의 줄에서 보이는 책(`line`: 1권부터 18권쯤 + 둘레).
   * `line`은 서가를 보는 동안에도 버리지 않고 들고 있는다: 먼 책을 보다 웰컴으로 올라갈 때 한꺼번에 받아 올리느라
   * 프레임이 멈추지 않는다. `near`는 배치(펼침·책등·줄)와 상관없이 가운데 책으로만 정해진다: 웰컴 ↔ 서가의 전환 동안
   * (가운데 책은 그대로다) 새로 받는 그림이 없다. 둘 사이의 책은 받지 않는다(줄은 건너뛴다: `rowJump`)
   */
  function syncTextures() {
    if (!stage) return
    const { near, line } = textureRanges(books, state.index, {
      bookHeight: stage.bookHeight,
      gap: stage.gap,
      currentGap: stage.currentGap,
      lineupLeft: stage.lineupLeft,
      halfWidth: stage.width / 2,
      margin: LOAD_MARGIN,
    })
    const { from, to } = near
    // 웰컴의 줄에서 보이는 책(1권부터)은 늘 들고 있는다
    const lined = (i: number) => line !== null && i >= line.from && i <= line.to
    for (let i = 0; i < books.length; i++) {
      if ((i >= from && i <= to) || lined(i)) void entries[i].model.loadTextures()
      else if (i < from - KEEP_MARGIN || i > to + KEEP_MARGIN) entries[i].model.disposeTextures()
    }
  }

  // ── 배치 ─────────────────────────────────────────────
  function retarget() {
    if (!stage) return
    const { bookHeight, gap, currentGap } = stage
    slots = computeShelfLayout(books, state.index, {
      bookHeight,
      gap,
      currentGap,
      closed: state.closed,
      lineupLeft: state.lineup ? stage.lineupLeft : undefined,
    })
    targets = bookPoseTargets(books, slots, {
      bookHeight,
      hoverIndex: pointer.hoverIndex,
    })
  }

  /** 책이 도는 각의 목표: 배치의 각에, 펼쳐진 책이면 쉬는 자세만큼 더(책이 도는 움직임과 함께 도착한다) */
  const rotTarget = (i: number) => targets[i].rotY + (i === openIndex(state) ? radians(CURRENT_REST.yaw) : 0)
  /** 펼쳐진 책이 쉬는 자세에서 포인터를 따라 더 도는 각. 포인터가 떠나면 0(쉬는 자세)으로 돌아온다 */
  const turnOffset = (i: number) => currentTurnOffset(i === openIndex(state) ? pointer.tilt : null)
  const yawTarget = (i: number) => radians(turnOffset(i).yaw)
  const pitchTarget = (i: number) => radians(turnOffset(i).pitch + (i === openIndex(state) ? CURRENT_REST.pitch : 0))

  // ── 책 페이지 ────────────────────────────────────────
  /** 떠 있는 자리(쉬는 자세). 포인터·뒤표지로 도는 각은 따로 더한다 */
  const floatPose = (i: number): Pose6 => pagePose(stage!, books[i].coverAspect)
  /** 서가에 놓인 자세(가운데 책이면 쉬는 자세로 돌아 있다) */
  const shelfPose = (i: number): Pose6 => ({
    x: targets[i].x,
    y: 0,
    z: targets[i].z,
    yaw: rotTarget(i),
    pitch: pitchTarget(i),
    roll: 0,
  })
  /** 지금 화면에 걸친 책(가운데 책 빼고)이 왼쪽으로 쓸려 나가는 계획. 서가에서 책을 숨기는 범위와 같다 */
  const planSweep = (featured: number) =>
    sweepPlan(
      targets.map((t) => t.x),
      featured,
      stage!.width / 2,
      stage!.bookHeight,
    )

  /** 펼친 책을 덮은 모습으로 되돌리고 낱장을 버린다(다른 책으로 넘어가거나 서가로 돌아갈 때) */
  function dropReader() {
    reader?.r.dispose()
    reader = null
    applyResolution()
  }

  /** 떠 있는 책(index)의 낱장. 없으면 만든다 */
  function readerFor(index: number) {
    if (reader?.index === index) return reader.r
    dropReader()
    const no = books[index].no
    // 미리보기와 책 전체 가운데 그 권에 정해 둔 쪽(data/readingMode.ts)
    const preview = bookContent(no)
    const flapRatios = readerFlaps(preview)
    const r = createBookReader({
      model: entries[index].model,
      shape: preview ?? { pages: 0 },
      srcOf: (p) => preview?.srcOf(p) ?? '',
      // 책 전체가 든 권만 종이 더미의 두께를 보인다(미리보기는 책의 일부라 두께가 맞지 않는다)
      pile: preview?.mode === 'full',
      endpaper: preview?.endpaper ?? pageColorsFor(no)?.background ?? colors.blank,
      flaps: {
        // 미리보기가 끝난 면에는 서점으로 가는 버튼이 놓인다(BookPage): 뒷날개는 책 전체로 보이는 권에서만 그린다(readerFlaps)
        front: flapRatios.front ? { src: flapSrc(no, 'front'), aspect: flapRatios.front } : null,
        back: flapRatios.back ? { src: flapSrc(no, 'back'), aspect: flapRatios.back } : null,
      },
      textures,
      anisotropy: maxAnisotropy,
      onChange: invalidate,
    })
    reader = { index, r }
    return r
  }

  /** 책 페이지의 모습(벽의 그림자 ↔ 바닥과 서가 조명의 그림자)을 섞는다 */
  function applyPageMix() {
    if (pageMix === appliedMix) return
    appliedMix = pageMix
    const L = LIGHTING
    floorUniforms.uOpacity.value = L.floorShadow * (1 - pageMix)
    floor.visible = pageMix < 1
    wallMaterial.opacity = L.page.shadow * pageMix
    wall.visible = pageMix > 0
    keys.forEach((light, i) => (light.shadow.intensity = L.keys[i].shadow * (1 - pageMix)))
    pageLight.shadow.intensity = pageMix
    // 서가만 보일 때는 책 페이지 조명의 그림자를 끈다: 켜 두면 모든 책의 모든 화소가 그 그림자 맵까지 읽는다
    pageLight.castShadow = pageShadowOn(pageMix)
  }

  /** 벽과 책 페이지 조명을 떠 있는 책의 자리에 맞춘다 */
  function placePage() {
    if (!stage) return
    const H = stage.bookHeight
    const L = LIGHTING.page
    const at = floatPose(state.index)
    const wallZ = at.z - H * L.wall
    wall.position.set(0, 0, wallZ)
    wall.scale.set(stage.width * 4 + H * 8, stage.height * 4 + H * 8, 1)
    pageLight.position.set(at.x + L.position[0] * H * 2, at.y + L.position[1] * H * 2, at.z + L.position[2] * H * 2)
    pageLight.target.position.set(at.x, at.y, at.z)
    pageLight.target.updateMatrixWorld()
    // 책이 어느 쪽으로 돌아도 들어가는 상자(책 높이의 ±0.72) + 벽까지. 펼친 책의 자리까지 넣는다
    const half = H * 0.72
    const spread = spreadPose(stage, books[state.index].coverAspect)
    fitShadowBox(
      pageLight,
      // 왼쪽은 젖힌 표지의 바깥 끝까지(펼친 책의 왼쪽 면도 그림자를 드리운다)
      [
        Math.min(at.x - half, spread.x - Math.max(half, H * openBookReach(books[state.index].coverAspect))),
        Math.max(at.x, spread.x) + half,
      ],
      [Math.min(at.y, spread.y) - half, Math.max(at.y, spread.y) + half],
      [wallZ, Math.max(at.z, spread.z) + half],
      H * 0.06,
    )
    pageLight.shadow.mapSize.set(L.mapSize, L.mapSize)
    pageLight.shadow.radius = L.radius
    pageLight.shadow.bias = -0.0004
    pageLight.shadow.normalBias = H * 0.004
    pageLight.shadow.map?.dispose()
    pageLight.shadow.map = null
    pageLight.shadow.needsUpdate = true
  }

  /** 서가의 스프링을 지금의 목표에 바로 놓는다(책 페이지 아래에서 서가는 움직임 없이 따라온다) */
  function snapShelf() {
    entries.forEach((e, i) => {
      const t = targets[i]
      if (!t) return
      e.x = spring(t.x)
      e.z = spring(t.z)
      e.rot = spring(rotTarget(i))
      e.pull = spring(t.pull)
      e.yaw = spring(yawTarget(i))
      e.pitch = spring(pitchTarget(i))
      e.place = spring()
      e.placeAt = -1
    })
  }

  /** 전환 없이 지금 상태(서가 / 책 페이지)의 모습으로 바로 놓는다 */
  function settlePage() {
    transition = null
    pageMix = page.open ? 1 : 0
    flip = spring(page.open && page.side === 'back' ? Math.PI : 0)
    pageYaw = spring()
    pagePitch = spring()
  }

  /** 움직임 없이 지금의 목표 자리에 바로 놓는다 */
  function snap() {
    settlePage()
    entries.forEach((e, i) => {
      const t = targets[i]
      if (!t) return
      e.x = spring(t.x)
      e.z = spring(t.z)
      e.rot = spring(rotTarget(i))
      e.pull = spring(t.pull)
      e.yaw = spring(yawTarget(i))
      e.pitch = spring(pitchTarget(i))
      e.place = spring()
      e.placeAt = -1
    })
  }

  function applyLighting() {
    if (!stage) return
    const H = stage.bookHeight
    const L = LIGHTING
    const halfW = stage.width / 2 + H * 0.9
    // 빛과 거의 나란한 면에 줄무늬(acne)가 생기지 않게: 법선 쪽으로 조금, 깊이로 아주 조금 민다
    const setShadow = (light: THREE.DirectionalLight, mapSize: [number, number], radius: number) => {
      fitShadowCamera(light, halfW, H)
      light.shadow.mapSize.set(...mapSize)
      light.shadow.radius = radius
      light.shadow.blurSamples = 16
      light.shadow.bias = -0.0004
      light.shadow.normalBias = H * 0.004
      // 크기가 바뀌면 그림자 맵을 새로 만든다
      light.shadow.map?.dispose()
      light.shadow.map = null
      light.shadow.needsUpdate = true
    }
    keys.forEach((light, i) => {
      const k = L.keys[i]
      const dir = new THREE.Vector3(...k.position).normalize()
      // three의 확산광은 세기/π이므로 π를 곱해 "흰 면이 받는 양"으로 맞춘다
      light.intensity = (k.onFront / dir.z) * Math.PI * L.gain
      light.position.set(k.position[0] * H, k.position[1] * H, k.position[2] * H)
      light.target.position.set(0, 0, 0)
      light.shadow.intensity = k.shadow
      setShadow(light, k.mapSize, k.radius)
    })
    // 정면(+z)을 보는 면은 하늘색과 바닥색의 중간을 받는다
    const ground = L.fillGround
    fill.intensity = (L.fillOnFront / ((1 + ground) / 2)) * Math.PI * L.gain
    fill.groundColor.setScalar(ground)

    placePage()
    appliedMix = -1
    applyPageMix()
    sideUniforms.uSideShade.value.set(L.side.near, L.side.deep, L.side.exposed)
    sideUniforms.uSideDepth.value.set(H * L.side.depth, H * L.side.exposeDepth)
    for (const e of entries)
      for (const face of BOOK_FACES) {
        const material = e.model.materials[face]
        material.roughness = L.roughness
        material.specularIntensity = L.specular
      }
    invalidate()
  }

  // ── 그리는 배율: 책이 펼쳐져 있는 동안에는 더 촘촘하게 그린다(본문 글자). 전환을 끊지 않게 크기만 바꾼다 ──
  let appliedRatio = 0
  function applyResolution() {
    if (!stage) return
    const ratio = renderPixelRatio(stage.pixelRatio, reader !== null && (page.spread ?? 0) > 0)
    if (ratio === appliedRatio) return
    appliedRatio = ratio
    renderer.setPixelRatio(ratio)
    renderer.setSize(stage.width, stage.height, false)
    invalidate()
  }

  function setStage(next: Stage) {
    stage = next
    const H = next.bookHeight
    appliedRatio = 0
    applyResolution()

    // 카메라: (0, eyeLift, 2.6H)에서 −z를 본다. z=0 평면이 CSS px와 1:1인 비대칭 절두체
    const distance = H * PERSPECTIVE
    const near = distance * 0.1
    const far = distance * 4
    const eyeLift = H * EYE_LIFT
    const f = cameraFrustum({
      viewportWidth: next.width,
      viewportHeight: next.height,
      distance,
      centreY: next.centreY,
      eyeLift,
      near,
    })
    camera.position.set(0, eyeLift, distance)
    camera.rotation.set(0, 0, 0)
    camera.updateMatrixWorld()
    camera.projectionMatrix.makePerspective(f.left, f.right, f.top, f.bottom, near, far)
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert()

    // 모형은 책 높이가 1이다: 폭과 두께는 모형이 제 비율로 갖고 있다
    for (const e of entries) e.model.group.scale.setScalar(H)
    // 바닥은 그림자가 있을 수 있는 곳에만 둔다: 책등 면 바로 뒤(책 사이 틈으로 보이는 만큼)에서
    // 보이는 바닥이 끝나는 깊이(캔버스가 잘리는 선)까지. 그림자는 이 양 끝에서 0이 된다(`floorFade`)
    const depth = visibleFloorDepth(next)
    const floorBack = H * FLOOR_SHADOW.back
    shadowOptions = { bookHeight: H, gap: next.gap, depth }
    floorUniforms.uFade.value.set(depth, depth * FLOOR_SHADOW.frontFade, floorBack)
    floor.position.set(0, -H / 2, (depth - floorBack) / 2)
    floor.scale.set(next.width + H * 2, depth + floorBack, 1)

    retarget()
    snap()
    applyLighting()
    syncTextures()
    invalidate()
  }

  // ── 프레임 ───────────────────────────────────────────
  /** 움직임을 dt초 진행하고 책을 그 자리에 놓는다. 아직 움직이는 것이 있으면 true */
  function advance(dt: number) {
    if (!stage || targets.length === 0) return false
    const H = stage.bookHeight
    const posEps = 0.03
    const angEps = 0.0003
    const moveOmega = omegaForSettle(state.moveMs / 1000)
    let moving = false
    const step = (s: Spring, target: number, omega: number, eps: number): Spring => {
      if (s.x === target && s.v === 0) return s
      const next = springStep(s, target, omega, dt)
      if (isSettled(next, target, eps)) return { x: target, v: 0 }
      moving = true
      return next
    }
    if (rise) {
      rise.at += dt * 1000
      if (rise.at >= riseTotalMs()) rise = null
      else moving = true
    }
    const limit = stage.width / 2 + H
    // 책 페이지의 전환과 떠 있는 책
    const tr = transition
    if (tr) {
      tr.at += dt * 1000
      moving = true
      pageMix = tr.kind === 'turn' ? 1 : pageAmount(tr.kind, tr.at)
    } else if (page.open) {
      const turn = pagePointerTurn(pagePointer)
      flip = step(flip, page.side === 'back' ? Math.PI : 0, flipOmega, angEps)
      pageYaw = step(pageYaw, radians(turn.yaw), hoverOmega, angEps)
      pagePitch = step(pagePitch, radians(turn.pitch), hoverOmega, angEps)
      if (reader?.r.advance(dt * 1000)) moving = true
    }
    const featured = page.open && !tr ? state.index : -1
    let shadows = 0
    entries.forEach((e, i) => {
      const t = targets[i]
      e.x = step(e.x, t.x, moveOmega, posEps)
      e.z = step(e.z, t.z, moveOmega, posEps)
      e.rot = step(e.rot, rotTarget(i), moveOmega, angEps)
      e.pull = step(e.pull, t.pull, hoverOmega, posEps)
      e.yaw = step(e.yaw, yawTarget(i), hoverOmega, angEps)
      e.pitch = step(e.pitch, pitchTarget(i), hoverOmega, angEps)
      if (e.placeAt >= 0) {
        // 가운데로 온 책: 조금 앞으로 나와 있다가 잠깐 멈춘 뒤 내려앉는다
        e.placeAt += dt * 1000
        e.place = spring(placeOffset(e.placeAt, e.placeMs))
        if (e.placeAt >= placeTotalMs(e.placeMs)) e.placeAt = -1
        else moving = true
      } else {
        e.place = step(e.place, 0, hoverOmega, 0.001)
      }
      const y = rise ? -H * RISE.from * riseOffset(rise.at, i - rise.from) : 0
      // 서가에 놓인 자세
      let pose: Pose6 = {
        x: e.x.x,
        y,
        z: e.z.x + e.pull.x + e.place.x * H * PLACE_LIFT,
        yaw: e.rot.x + e.yaw.x,
        pitch: e.pitch.x,
        roll: 0,
      }
      // 화면에서 먼 책은 그리지 않는다(그림자가 화면 안으로 드리울 수 있는 만큼은 남긴다)
      let visible = Math.abs(pose.x) < limit
      if (tr?.kind === 'open' || tr?.kind === 'close') {
        const opening = tr.kind === 'open'
        if (i === tr.featured) {
          pose = opening ? pickUpPose(tr.from, floatPose(i), tr.at, H) : returnPose(tr.from, shelfPose(i), tr.at)
          // 돌아온 책은 조금 앞에 나와 도착했다가, 잠깐 멈춘 뒤 뒤로 빠지며 제자리에 놓인다
          if (!opening) {
            const settle = returnSettle(tr.at)
            pose = {
              ...pose,
              z: pose.z + settle * H * PAGE_CLOSE.lift,
              y: pose.y - settle * H * PAGE_CLOSE.drop,
            }
          }
          visible = true
        } else {
          // 나머지 책: 왼쪽으로 쓸려 나간다 / 왼쪽에서 돌아온다
          const plan = tr.plan.books[i]
          const away = !plan
            ? 1
            : opening
              ? sweepOutOffset(tr.at, plan.rank, tr.plan.count)
              : sweepInOffset(tr.at, plan.rank, tr.plan.count)
          if (plan) pose.x -= plan.travel * away
          visible = plan !== null && away < 1
        }
      } else if (tr?.kind === 'turn') {
        // 책 페이지 사이: 보던 책은 왼쪽으로 나가고, 새 책은 왼쪽에서 들어온다
        if (i === tr.incoming) {
          const at = floatPose(i)
          pose = turnEnterPose(at, pageOffLeft(stage!, at, books[i].coverAspect), tr.at)
          visible = tr.at > PAGE_TURN.enterAt
        } else if (i === tr.outgoing && tr.outFrom) {
          pose = turnExitPose(tr.outFrom, pageOffLeft(stage!, tr.outFrom, books[i].coverAspect), tr.at)
          visible = tr.at < PAGE_TURN.exit
        } else visible = false
      } else if (page.open) {
        // 책 페이지: 가운데 책만 떠 있다
        visible = i === featured
        if (visible) {
          // 펼친 정도만큼 펼친 책의 자리로 옮겨 가 정면을 향하고, 포인터를 덜 따른다
          const o = reader?.index === i ? reader.r.openness : 0
          const at = o > 0 ? mixPose(floatPose(i), spreadPose(stage!, books[i].coverAspect), o) : floatPose(i)
          const follow = 1 - (1 - PAGE_SPREAD.pointer) * o
          pose = {
            ...at,
            yaw: at.yaw + flip.x + pageYaw.x * follow,
            pitch: at.pitch + pagePitch.x * follow,
          }
        }
      }
      e.pose = pose
      const group = e.model.group
      group.position.set(pose.x, pose.y, pose.z)
      group.rotation.set(pose.pitch, pose.yaw, pose.roll)
      group.visible = visible
      // 가운데에 가까운 책부터 그린다: 가려진 면은 깊이 검사에서 걸러져 조명·그림자를 계산하지 않는다
      const order = drawOrderFor(pose.x)
      for (const part of BOOK_PARTS) e.model.parts[part].renderOrder = order
      // 바닥의 닿는 그림자: 보이는 책마다 그 자세에서 구한다(책이 움직이면 따라 움직인다)
      if (visible) {
        const s = contactShadow(pose, books[i], shadowOptions)
        if (s.strength > 0) {
          floorUniforms.uRect.value[shadows].set(s.x, s.z, s.halfW, s.halfD)
          floorUniforms.uTurn.value[shadows].set(s.cos, s.sin, s.strength, 0)
          floorUniforms.uReach.value[shadows].set(s.side, s.forward)
          shadows++
        }
      }
    })
    floorUniforms.uCount.value = shadows
    if (tr && tr.at >= TRANSITION_MS[tr.kind]) {
      // 전환이 끝났다: 마지막 자세가 곧 머무는 자세다
      transition = null
      pageMix = page.open ? 1 : 0
    }
    applyPageMix()
    return moving
  }

  function render() {
    const started = performance.now()
    renderer.render(scene, camera)
    stats.renderMs = performance.now() - started
    stats.frames++
  }

  /** 검증용: 켜면 화면 주사에 맞춰 진행하지 않는다(`__shelf3d.advance`로만 진행한다) */
  let held = false
  function frame(now: number) {
    raf = 0
    if (disposed || !active) return
    if (held) {
      lastTime = 0
      return
    }
    const elapsed = lastTime ? now - lastTime : 16.7
    lastTime = now
    const moving = advance(Math.min(elapsed, MAX_FRAME_MS) / 1000)
    if (moving || needsRender) {
      needsRender = false
      render()
    }
    if (moving) raf = requestAnimationFrame(frame)
    else {
      lastTime = 0
      warmShadowPrograms()
    }
  }

  /**
   * 책 페이지 조명의 그림자를 켜고 끌 때마다 책의 셰이더가 다른 것으로 바뀐다(그림자 맵의 수가 다르다).
   * 처음 바뀌는 순간에 셰이더를 만드느라 전환이 멈칫하지 않도록, 서가가 멈춰 있을 때 반대쪽 것을 미리 만들어 둔다.
   * 가운데 책의 그림이 다 온 뒤에 한 번만 한다(그림이 있는 면과 없는 면은 셰이더가 다르다).
   */
  let warmed = false
  function warmShadowPrograms() {
    if (warmed || disposed || transition || targets.length === 0) return
    if (entries[state.index].model.loadedFaces() < BOOK_FACES.length) return
    warmed = true
    const now = pageLight.castShadow
    pageLight.castShadow = !now
    // 만들 것을 정하는 일은 이 호출 안에서 끝난다. 만드는 일은 그래픽 장치가 뒤에서 한다
    void renderer.compileAsync(scene, camera).catch(() => {})
    pageLight.castShadow = now
  }

  /** 다음 프레임에 한 번 그린다. 움직이는 것이 있으면 멈출 때까지 이어서 그린다. 서가 화면이 보이지 않으면 미룬다 */
  function invalidate() {
    needsRender = true
    if (!raf && !disposed && active) raf = requestAnimationFrame(frame)
  }

  // ── 조작 ─────────────────────────────────────────────
  function setState(next: SceneState) {
    const was = openIndex(state)
    const open = openIndex(next)
    const lined = Boolean(next.lineup)
    const wasLined = Boolean(state.lineup)
    const changed = next.index !== state.index || next.closed !== state.closed || lined !== wasLined
    const from = state.index
    state = { ...next }
    if (!changed) return
    if (page.open) {
      // 책 페이지가 열려 있다: 서가는 보이지 않는 채로 바로 따라오고, 책이 바뀌었으면 페이지를 넘긴다
      retarget()
      snapShelf()
      syncTextures()
      if (next.index !== from) turnPage(from)
      invalidate()
      return
    }
    if (open !== was) {
      if (was >= 0) entries[was].placeAt = -1
      if (open >= 0) {
        entries[open].placeAt = 0
        entries[open].placeMs = next.moveMs
      }
    }
    retarget()
    if (lined !== wasLined) rowJump()
    syncTextures()
    invalidate()
  }

  /**
   * 줄을 서거나 풀었다(웰컴 ↔ 서가): 먼 책을 보다 오가면 줄이 수천 px 밀려야 한다. 사이의 책을 모두 화면으로 지나가게
   * 하지 않고 건너뛴다(`rowJumpStart`): 보이던 책은 그대로 밀려 나가고, 화면으로 들어올 책은 화면 폭 하나쯤 떨어진
   * 곳에서 출발하고, 화면에 오지 않는 책은 바로 도착한 자리에 둔다. 가까운 책(1권 등)에서는 달라지는 것이 없다
   */
  function rowJump() {
    if (!stage) return
    const seen = rowSeenHalf(stage.width / 2, stage.bookHeight)
    entries.forEach((e, i) => {
      const start = rowJumpStart(e.x.x, targets[i].x, seen)
      if (start !== e.x.x) e.x = spring(start)
    })
  }

  /** 책 페이지 사이: 보던 책(from)이 나가고 지금의 가운데 책이 들어온다 */
  function turnPage(from: number) {
    dropReader()
    if (!stage || !active) return settlePage()
    void entries[state.index].model.loadTextures()
    transition = {
      kind: 'turn',
      at: 0,
      incoming: state.index,
      outgoing: from,
      outFrom: entries[from].pose,
    }
    pageMix = 1
    // 새 책은 앞표지로, 포인터 반응 없이 들어온다
    flip = spring()
    pageYaw = spring()
    pagePitch = spring()
  }

  function setPage(next: ScenePage) {
    const opened = next.open !== page.open
    const sideChanged = next.side !== page.side
    const spread = next.open ? (next.spread ?? 0) : 0
    const spreadChanged = spread !== (page.spread ?? 0)
    const peek = next.open && spread > 0 ? (next.peek ?? null) : null
    const peekChanged = peek?.side !== page.peek?.side || peek?.corner !== page.peek?.corner || peek?.depth !== page.peek?.depth
    page = { ...next, spread, peek }
    if (!opened) {
      if (peekChanged && reader) {
        reader.r.setPeek(peek)
        invalidate()
      }
      // 책을 펼치고 덮고 넘긴다(전환 중에는 받지 않는다: 덮인 채로 있는다)
      if (spreadChanged && page.open && targets.length > 0 && (spread > 0 || reader)) {
        readerFor(state.index).setSpread(spread, !transition && stage !== null && active)
      }
      if (spreadChanged) applyResolution()
      if (sideChanged || spreadChanged) invalidate()
      return
    }
    dropReader()
    if (!stage || !active || targets.length === 0) {
      settlePage()
      invalidate()
      return
    }
    const featured = state.index
    const from = entries[featured].pose ?? shelfPose(featured)
    // 서가는 제자리에 멈춰 선 채로 쓸려 나간다 / 돌아온다(포인터로 뽑힌 책, 놓이는 움직임은 정리한다)
    pointer = { hoverIndex: null, tilt: null }
    retarget()
    snapShelf()
    rise = null
    transition = {
      kind: next.open ? 'open' : 'close',
      at: 0,
      featured,
      from,
      plan: planSweep(featured),
    }
    flip = spring()
    pageYaw = spring()
    pagePitch = spring()
    invalidate()
  }

  function setPagePointer(point: { x: number; y: number } | null) {
    pagePointer = point
    if (page.open) invalidate()
  }

  function setPointer(next: ScenePointer) {
    const hoverChanged = next.hoverIndex !== pointer.hoverIndex
    pointer = next
    if (hoverChanged) retarget()
    invalidate()
  }

  function setActive(next: boolean) {
    if (next === active) return
    active = next
    if (!active) {
      cancelAnimationFrame(raf)
      raf = 0
      lastTime = 0
      return
    }
    // 서가 화면에 들어섰다: 책은 제자리에서(미끄러지지 않고) 아래에서 올라온다. 가운데부터 차례로
    // (책 페이지가 열린 채로 들어섰다면 책은 이미 떠 있다)
    snap()
    rise = page.open ? null : { at: 0, from: state.index }
    if (stage) {
      // 지난번에 그려 둔 화면이 한 프레임 보이지 않게 바로 그린다
      advance(0)
      render()
    }
    invalidate()
  }

  function restore() {
    // 컨텍스트가 돌아오면 셰이더를 새로 만든다: 반대쪽 것도 다시 미리 만들어 둔다
    warmed = false
    applyLighting()
    invalidate()
  }

  function dispose() {
    disposed = true
    cancelAnimationFrame(raf)
    warm.stop()
    dropReader()
    for (const e of entries) e.model.dispose()
    shared.dispose()
    floor.geometry.dispose()
    floorMaterial.dispose()
    wall.geometry.dispose()
    wallMaterial.dispose()
    pageLight.shadow.map?.dispose()
    keys.forEach((light) => light.shadow.map?.dispose())
    renderer.dispose()
    // GPU 자원을 바로 돌려준다(캔버스는 이 장면만 쓰고 버린다). 이미 잃은 컨텍스트라면 할 일이 없다
    if (!renderer.getContext().isContextLost()) renderer.forceContextLoss()
  }

  /** 지금 화면의 한 점(CSS px)의 색을 읽는다(그린 직후에 읽어야 해서 한 번 더 그린다) */
  function sample(x: number, y: number): [number, number, number, number] {
    if (!stage) return [0, 0, 0, 0]
    render()
    const gl = renderer.getContext()
    const px = new Uint8Array(4)
    const ratio = renderer.getPixelRatio()
    gl.readPixels(Math.round(x * ratio), Math.round((stage.height - y) * ratio), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px)
    return [px[0], px[1], px[2], px[3]]
  }

  const handle: ShelfSceneHandle = {
    setStage,
    setState,
    setPointer,
    setPage,
    setPagePointer,
    setActive,
    restore,
    dispose,
  }

  return {
    ...handle,
    /** 조명 조정·검증용(개발 서버에서만 `window.__shelf3d`로 내놓는다) */
    debug: {
      stats,
      lighting: LIGHTING,
      applyLighting,
      sample,
      get animating() {
        return raf !== 0
      },
      get stage() {
        return stage
      },
      /** 바닥 그림자: 보이는 바닥의 깊이(px)와 지금 그리는 닿는 그림자의 수 */
      get floor() {
        return { depth: Math.round(shadowOptions.depth * 10) / 10, shadows: floorUniforms.uCount.value }
      },
      /** 책 페이지의 상태: 열림, 전환(종류와 흐른 시간), 모습이 들어온 정도, 뒤표지로 돈 각(deg) */
      get page() {
        return {
          open: page.open,
          side: page.side,
          transition: transition ? { kind: transition.kind, at: Math.round(transition.at) } : null,
          mix: Math.round(pageMix * 1000) / 1000,
          flipDeg: Math.round(((flip.x * 180) / Math.PI) * 10) / 10,
          spread: page.spread ?? 0,
          openness: reader ? Math.round(reader.r.openness * 1000) / 1000 : 0,
        }
      },
      /** 그림을 떼고 흰 책으로 그린다(조명만 재 볼 때). false로 되돌린다 */
      setWhite(on: boolean) {
        for (const e of entries)
          for (const face of BOOK_FACES) {
            const material = e.model.materials[face]
            material.map = on ? null : e.model.textureOf(face)
            material.color.set(on || material.map ? 0xffffff : blank)
            material.needsUpdate = true
          }
        shared.paper.map = on ? null : shared.pageTexture
        shared.paper.needsUpdate = true
        render()
      },
      hold(on: boolean) {
        held = on
        if (!on) invalidate()
      },
      /** 숨은 탭에서는 rAF가 멈추므로 손으로 seconds만큼 진행하고 그린다 */
      advance(seconds: number) {
        const steps = Math.max(1, Math.round(seconds * 60))
        for (let i = 0; i < steps; i++) advance(seconds / steps)
        render()
      },
      books: () =>
        entries.map((e, i) => ({
          no: books[i].no,
          x: Math.round(e.model.group.position.x * 10) / 10,
          y: Math.round(e.model.group.position.y * 10) / 10,
          z: Math.round(e.model.group.position.z * 10) / 10,
          rotDeg: Math.round(((e.rot.x * 180) / Math.PI) * 10) / 10,
          /** 쉬는 자세(rotDeg에 들어 있다)에서 포인터를 따라 더 돈 각 [yaw, pitch] */
          tiltDeg: [Math.round(((e.yaw.x * 180) / Math.PI) * 10) / 10, Math.round(((e.pitch.x * 180) / Math.PI) * 10) / 10],
          visible: e.model.group.visible,
          loaded: e.model.loadedFaces(),
        })),
    },
  }
}

export type ShelfScene = ReturnType<typeof createShelfScene>
