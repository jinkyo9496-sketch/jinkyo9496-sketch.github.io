/**
 * three.js로 그리는 학제별 분류의 책. 가리키는 학문의 책이 책등을 정면으로 보이며 서랍(왼쪽 끝 바깥)에서 나와 벌어지고,
 * 문이 열리듯 제자리에서 세로축으로 돌아 앞표지가 정면을 본다. 카메라는 움직이지 않는다(정면, 좁은 화각).
 * 책은 서가와 같은 모형(`src/book3d`의 `createBookModel`)이고 그림 캐시도 서가와 함께 쓴다(`sharedBookTextures`).
 *
 * 길이 단위는 책 높이 = 1(모형 그대로). 자리·자세·시간·카메라는 모두 `motion.ts`의 순수 계산이고,
 * 여기서는 그 값을 모형에 옮겨 그리기만 한다. 움직일 것이 있을 때만 그리고, 분류 화면이 보이지 않는 동안에는 그리지 않는다.
 */
import * as THREE from 'three'
import { BOOK_FACES, bookSpecFrom, createBookModel, createBookShared, sharedBookTextures, type BookModel } from '../book3d'
import type { Spring } from '../shelf3d/motion'
import {
  FIELDS_FLIGHT,
  FIELDS_LAYOUT,
  FIELDS_TIMING,
  directionMoving,
  emptyDirection,
  exitBookPose,
  eyeFrustum,
  facingBookAt,
  facingBookBox,
  fieldBookPose,
  fieldsTimeline,
  fieldsView,
  flightEye,
  flightFrame,
  flightTarget,
  hoverMoving,
  hoverYaw,
  planePointAt,
  requestItem,
  returnFrame,
  rowPlan,
  scrollRange,
  scrollStops,
  sizeOf,
  stepHover,
  tickDirection,
  type BookSize,
  type CanvasFrame,
  type Direction,
  type FieldBookPose,
  type FieldsView,
  type FlightFrame,
  type FlightTarget,
  type ReturnFrame,
  type RowPlan,
} from './motion'
import { FIELDS_SCROLL, revealScroll } from './scroll'
import type {
  FieldsFlight,
  FieldsReturn,
  FieldsReturnStep,
  FieldsRow,
  FieldsSceneHandle,
  FieldsSceneOptions,
  FieldsStage,
  SceneField,
} from './sceneTypes'

/** 숨은 탭에서 돌아온 긴 프레임은 이만큼(ms)으로 자른다 */
const MAX_FRAME_MS = 100

/**
 * 조명 값. 서가(`shelf3d/scene.ts`의 `LIGHTING`)와 같은 방식으로 적는다: 세기는 "그 면이 받는 양"이고,
 * 여기서는 멈춘 책의 표지가 보는 사람(+Z)을 향하므로 **정면을 보는 흰 면에서 합이 1**이 되게 해 표지 색을
 * 원본 그대로 보인다(톤 매핑 없음). 캔버스는 투명하고, 책 뒤의 벽에는 그림자만 얹는다.
 */
export const FIELDS_LIGHTING = {
  /**
   * 주광: 거의 정면, 조금 위·왼쪽. 책 뒤의 벽에 그림자를 드리운다(그림자는 이 조명 하나만).
   * 정면에서 벗어난 만큼만 그림자가 책 밖으로 나온다: 아래로 벽 깊이의 26%, 오른쪽으로 10%(1440×900에서 약 11px·4px)
   */
  key: { position: [-0.1, 0.26, 1] as [number, number, number], onFront: 0.5, mapSize: [2048, 1024] as [number, number], radius: 4 },
  /** 고른 빛: 어느 쪽을 보는 면에나 같은 양. 도는 동안 옆을 보는 면은 이만큼만 받아 조금 어둡다(두께가 읽힌다) */
  fill: 0.5,
  /** 벽에 얹는 그림자의 농도(종이색 위의 먹의 불투명도). 옅게 */
  wallShadow: 0.16,
  /** 표지 재질(서가와 같다): 무광 코팅지 */
  roughness: 0.5,
  specular: 0.4,
  /** 스펙큘러·에너지 보존으로 달라지는 밝기를 맞추는 보정 */
  gain: 1.0,
}

/**
 * 그리는 층. 평소에는 모두 0번 층이고 한 번에 그린다. 책이 날아가는 동안에만 세 번에 나눠 그린다:
 * 나머지 책(0번, 책 자리 안에서만) → 바탕색(VEIL) → 날아가는 책과 그 그림자(FLYING, 화면 어디든)
 */
const FLYING_LAYER = 1
const VEIL_LAYER = 2
/** 돌아오는 책을 그리는 동안, 줄에 선 책이 서랍 입구에서 옅어지게 하는 판(평소에는 CSS 마스크가 하는 일) */
const FADE_LAYER = 3

/** 한 학문의 책과, 미리 계산해 둔 자리·시간 */
interface Run {
  key: string
  books: SceneField['books']
  sizes: BookSize[]
  plan: RowPlan
  total: number
}

const runOf = (field: SceneField): Run => {
  const sizes = field.books.map(sizeOf)
  return { key: field.key, books: field.books, sizes, plan: rowPlan(sizes), total: fieldsTimeline(sizes.length).total }
}

const round = (n: number, digits = 3) => Math.round(n * 10 ** digits) / 10 ** digits

export function createFieldsScene({ canvas, colors, field, onRow }: FieldsSceneOptions) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' })
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
  // 조명은 어느 층을 그릴 때나 켜져 있다(날아가는 책은 따로 그린다: 아래 `render`)
  const fill = new THREE.AmbientLight(0xffffff, 1)
  const key = new THREE.DirectionalLight(0xffffff, 1)
  key.castShadow = true
  fill.layers.enableAll()
  key.layers.enableAll()
  scene.add(fill, key, key.target)

  // ── 벽: 책 바로 뒤에서 종이색 페이지 위에 그림자만 얹는다 ───────────
  const wallMaterial = new THREE.ShadowMaterial({ color: new THREE.Color(colors.shadow), opacity: FIELDS_LIGHTING.wallShadow })
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), wallMaterial)
  wall.receiveShadow = true
  wall.layers.enable(FLYING_LAYER)
  scene.add(wall)

  // ── 바탕색: 책이 날아가는 동안 나머지 책과 다이얼을 덮어 오는 그 책의 대표색(책 페이지의 바탕) ──
  const veilMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false })
  const veil = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), veilMaterial)
  veil.layers.set(VEIL_LAYER)
  veil.frustumCulled = false
  scene.add(veil)

  // ── 서랍 입구의 옅어짐: 책이 돌아오는 동안에는 캔버스가 CSS 마스크를 벗고 있어(돌아오는 책이 입구 왼쪽에서 온다),
  // 줄에 선 책이 입구에서 옅어지는 것을 장면이 대신 그린다. 표지 면(z = 0)의 x = 0 ~ edgeFade에 놓인 판이 이미 그려진 픽셀의
  // 색과 투명도에 0 → 1을 곱한다(마스크와 같은 직선). 놓인 뒤 마스크로 돌아갈 때 걸쳐 있던 책의 모습이 바뀌지 않는다
  const fadeGeometry = new THREE.BufferGeometry()
  {
    // x: 입구 바깥(−1) ~ 입구(0)는 0(가위질의 경계에 걸친 픽셀까지 지운다), 입구 ~ edgeFade는 0 → 1
    const xs = [-1, 0, FIELDS_LAYOUT.edgeFade]
    const alphas = [0, 0, 1]
    fadeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(xs.flatMap((x) => [x, -6, 0, x, 6, 0]), 3))
    fadeGeometry.setAttribute('color', new THREE.Float32BufferAttribute(alphas.flatMap((a) => [1, 1, 1, a, 1, 1, 1, a]), 4))
    fadeGeometry.setIndex([0, 2, 3, 0, 3, 1, 2, 4, 5, 2, 5, 3])
  }
  const fadeMaterial = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.ZeroFactor,
    blendDst: THREE.SrcAlphaFactor,
    blendSrcAlpha: THREE.ZeroFactor,
    blendDstAlpha: THREE.SrcAlphaFactor,
  })
  const fade = new THREE.Mesh(fadeGeometry, fadeMaterial)
  fade.layers.set(FADE_LAYER)
  fade.frustumCulled = false
  scene.add(fade)

  // ── 책: 쓰게 된 권만 만들고, 만든 모형은 장면이 끝날 때까지 둔다(그림은 보이는 학문의 것만 들고 있는다) ──
  const blank = new THREE.Color(colors.blank)
  const shared = createBookShared({ blockColor: colors.block, anisotropy: maxAnisotropy })
  const textures = sharedBookTextures()
  const models = new Map<number, BookModel>()
  function modelOf(book: SceneField['books'][number]) {
    let model = models.get(book.no)
    if (!model) {
      model = createBookModel(bookSpecFrom(book), {
        shared,
        textures,
        placeholderColor: blank,
        roughness: FIELDS_LIGHTING.roughness,
        specular: FIELDS_LIGHTING.specular,
        anisotropy: maxAnisotropy,
        castShadow: true,
        receiveShadow: true,
      })
      model.onTextureChange = () => invalidate()
      model.group.visible = false
      scene.add(model.group)
      models.set(book.no, model)
    }
    return model
  }

  // ── 상태 ─────────────────────────────────────────────
  let stage: FieldsStage | null = null
  let view: FieldsView | null = null
  /** 지금 가리키는 학문(보이지 않는 동안에도 따라간다) */
  let pointed = runOf(field)
  /** 무엇이 보이고, 서랍으로 들어가고, 기다리는가(`motion.ts`) */
  let direction: Direction<Run> = emptyDirection()
  /** 줄을 왼쪽으로 민 길이(책 높이 단위) */
  let scroll = 0
  /** 포인터가 올라가 있는 책(권 번호)과, 책마다 살짝 돌아 있는 정도(0~1). 다 돌아온 책은 지운다 */
  let hovered: number | null = null
  const hovers = new Map<number, Spring>()
  let active = false
  let disposed = false
  let raf = 0
  let lastTime = 0
  let needsRender = true
  const stats = { frames: 0, renderMs: 0 }
  /** 날아가는·돌아오는 책이 함께 갖는 것. from은 줄에서 서 있는 자리와 자세(나갈 때는 누른 순간, 돌아올 때는 놓일 자리) */
  interface Flying {
    model: BookModel
    no: number
    size: BookSize
    from: FieldBookPose
    target: FlightTarget
    /** 흐른 시간(ms): 나갈 때는 누른 뒤, 돌아올 때는 기다림이 끝난 뒤 */
    at: number
  }
  /**
   * 책 페이지로 날아가는 책(`flyOut`, out): 닿은 뒤에도 화면을 떠날 때(`setActive(false)`)까지 남아 닿은 모습을 그린다.
   * 책 페이지에서 돌아오는 책(`flyIn`, in): 놓이면 스스로 줄의 책으로 돌아간다. wait는 출발 전에 남은 기다림(ms)
   */
  let flight:
    | (Flying & { kind: 'out'; frame: FlightFrame; onLanded: () => void; told: boolean })
    | (Flying & { kind: 'in'; frame: ReturnFrame; wait: number; onStep: (step: FieldsReturnStep) => void; said: Set<FieldsReturnStep> })
    | null = null
  /** 방금 돌아온 줄: 다음에 줄을 알릴 때 서 있는 스크롤을 함께 알린다(그 책이 보이게 넘겨져 있다) */
  let returned = false
  /** 지금 카메라가 놓인 눈(평소에는 `view.camera.position`) */
  let eyeNow: [number, number, number] | null = null

  /** 캔버스의 크기와 그 안에서 책 자리가 놓인 자리. 알려 주지 않았으면 캔버스가 곧 책 자리다 */
  const frameOf = (s: FieldsStage): CanvasFrame => s.canvas ?? { width: s.width, height: s.height, left: 0, top: 0 }

  /**
   * 카메라를 그 눈에 놓는다. 눈은 −Z를 똑바로 보고, 표지 면(z = 0)이 화면에 놓이는 자리는 눈과 상관없이 같다
   * (`motion.ts`의 `eyeFrustum`). 평소의 눈은 멀리 있고(좁은 화각) 책은 표지 면 앞뒤 1 안에만 있다.
   * 날아가는 책은 눈 가까이 오므로 그 앞까지 보이게 가까운 면을 당긴다
   */
  function aimCamera(eye: [number, number, number], nearest = 3) {
    if (!stage || !view) return
    const near = Math.max(0.05, eye[2] - nearest)
    const f = eyeFrustum(view, frameOf(stage), eye, near)
    camera.position.set(...eye)
    camera.rotation.set(0, 0, 0)
    camera.updateMatrixWorld()
    camera.projectionMatrix.makePerspective(f.left, f.right, f.top, f.bottom, near, eye[2] + 3)
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert()
    eyeNow = eye
  }

  /**
   * 그 학문의 책 그림을 받아 둔다. 등장을 기다리기 시작할 때 불러서, 기다리는 동안(320ms) 그림이 먼저 온다.
   * 건너뛴 학문의 그림은 다음 학문이 등장할 때 놓는다(화면에 그려진 적이 없어 GPU에는 올라가지 않는다)
   */
  function preload(run: Run) {
    for (const book of run.books) void modelOf(book).loadTextures()
  }

  /** 다 돌아 멈춘 학문(끌고 누를 수 있다). 아직 움직이는 중이거나 화면이 꺼져 있으면 null */
  function resting() {
    const { current } = direction
    return active && view && !flight && current && current.at >= current.item.total ? current.item : null
  }

  /** 줄이 달라졌으면 알린다(다 돌아 멈췄다 / 다시 움직인다 / 화면 크기가 바뀌어 범위가 달라졌다) */
  let told: { run: Run; max: number } | null = null
  function tellRow() {
    const run = resting()
    const row: FieldsRow | null =
      run && view
        ? { max: scrollRange(run.sizes, view) * view.pxPerUnit, stops: scrollStops(run.sizes, view).map((s) => s * view!.pxPerUnit) }
        : null
    if (row ? told?.run === run && told.max === row.max : told === null) return
    if (row && view && returned) {
      row.scroll = scroll * view.pxPerUnit
      returned = false
    }
    told = row && run ? { run, max: row.max } : null
    onRow?.(row)
  }

  /** 새 학문이 등장하기 시작한다: 나머지 책의 그림은 놓는다(이때 들어가던 책은 이미 서랍 안이다) */
  function prepare(run: Run) {
    scroll = 0
    const shown = new Set(run.books.map((book) => book.no))
    for (const [no, model] of models) if (!shown.has(no)) model.disposeTextures()
    preload(run)
  }

  /** 지금의 진행 상태대로 책을 놓는다(카메라는 움직이지 않는다) */
  function place() {
    for (const model of models.values()) model.group.visible = false
    if (!view) return
    const visibleWidth = view.visibleWidth
    /** 그 학문의 책을 poseOf(순번, 포인터 반응의 각)가 주는 자리(화면 기준)에 놓는다 */
    const put = (run: Run, poseOf: (i: number, hoverDeg: number) => FieldBookPose) => {
      run.books.forEach((book, i) => {
        const pose = poseOf(i, hoverYaw(hovers.get(book.no)?.x ?? 0))
        const { group } = modelOf(book)
        group.visible = true
        group.position.set(...pose.position)
        group.quaternion.set(...pose.quaternion)
        group.scale.setScalar(1)
      })
    }
    const { current, leaving } = direction
    if (leaving) {
      const { item, at, out } = leaving
      put(item, (i, hover) => exitBookPose(item.plan, item.sizes, i, at, out, { visibleWidth }, scroll, hover))
    }
    if (current) {
      const { item, at } = current
      put(item, (i, hover) => {
        const pose = fieldBookPose(item.plan, item.sizes, i, at, hover)
        return { position: [pose.position[0] - scroll, pose.position[1], pose.position[2]], quaternion: pose.quaternion }
      })
    }
    // 날아가는 책: 줄에서 벗어나 제 길을 간다. 눈도 함께 책 페이지의 눈으로 옮겨 간다
    if (flight) {
      const { model, frame, target } = flight
      model.group.visible = true
      model.group.position.set(...frame.position)
      model.group.quaternion.set(...frame.quaternion)
      model.group.scale.setScalar(frame.scale)
      const eye = flightEye(view, target, frame.camera)
      // 가까운 면: 눈에서 책까지의 반(책은 눈 쪽으로 책 높이의 반도 나오지 않는다)
      aimCamera(eye, Math.max(3, eye[2] - (eye[2] - frame.position[2]) / 2))
      veilMaterial.opacity = frame.veil
      veil.position.set(eye[0], eye[1], eye[2] - (eye[2] - frame.position[2]) * 0.75)
      veil.scale.setScalar(1000)
    } else if (eyeNow !== view.camera.position) aimCamera(view.camera.position)
  }

  /** 날아가던 책을 줄로 돌려놓는다(층·크기). 카메라는 다음 `place`가 평소의 눈으로 되돌린다 */
  function endFlight() {
    if (!flight) return
    flight.model.group.traverse((o) => o.layers.set(0))
    flight.model.group.scale.setScalar(1)
    flight = null
    veilMaterial.opacity = 0
  }

  /**
   * 그림자를 만드는 조명과 벽을 놓는다. 평소(amount 0)에는 줄 전체를 정면 조금 위·왼쪽에서 비추고 벽은 표지 면 바로 뒤다.
   * 날아가는 책을 그릴 때는 그 책을 따라가며, 눈이 옮겨 간 만큼(amount) 책 페이지의 조명·벽·그림자 농도로 바뀐다
   */
  function aimLight(at: THREE.Vector3, amount: number, wallZ: number) {
    const L = FIELDS_LIGHTING
    const P = FIELDS_FLIGHT.page
    const dir = new THREE.Vector3(...L.key.position).lerp(new THREE.Vector3(...P.light), amount).normalize()
    // three의 확산광은 세기/π이므로 π를 곱해 "흰 면이 받는 양"으로 맞춘다. 정면(+Z)을 보는 면이 기준이다
    key.intensity = (L.key.onFront / dir.z) * Math.PI * L.gain
    key.position.copy(at).addScaledVector(dir, 10)
    key.target.position.copy(at)
    key.target.updateMatrixWorld()
    wallMaterial.opacity = L.wallShadow + (P.shadow - L.wallShadow) * amount
    wall.position.z = wallZ
  }

  /** 평소의 조명과 벽 */
  function aimLightAtRow() {
    if (view) aimLight(new THREE.Vector3(...view.camera.target), 0, -FIELDS_LAYOUT.wallDepth)
  }

  /** 포인터 반응을 ms만큼 보낸다: 포인터가 올라간 책은 살짝 돌고, 나머지는 돌아온다. 아직 움직이면 true */
  function stepHovers(ms: number) {
    if (hovered !== null && !hovers.has(hovered)) hovers.set(hovered, { x: 0, v: 0 })
    let moving = false
    for (const [no, state] of hovers) {
      const on = no === hovered
      const next = stepHover(state, on, ms)
      if (hoverMoving(next, on)) {
        hovers.set(no, next)
        moving = true
      } else if (on) hovers.set(no, { x: 1, v: 0 })
      else hovers.delete(no)
    }
    return moving
  }

  /** 시간을 ms만큼 보내고 책을 놓는다. 아직 움직일 것이 남았으면 true */
  function advance(ms: number) {
    const before = direction.current?.item
    direction = tickDirection(direction, ms)
    const now = direction.current?.item
    if (now && now !== before) prepare(now)
    const hovering = stepHovers(ms)
    let flying = false
    if (flight && !flight.frame.done) {
      if (flight.kind === 'out') {
        flight.at += ms
        flight.frame = flightFrame(flight.from, flight.target, flight.at)
      } else if (flight.wait > 0) {
        // 책 페이지의 책이 덮이기를 기다린다: 출발 자세 그대로다
        flight.wait = Math.max(0, flight.wait - ms)
      } else {
        flight.at += ms
        flight.frame = returnFrame(flight.from, flight.target, flight.at)
      }
      flying = true
    }
    place()
    tellRow()
    return directionMoving(direction, (run) => run.total) || hovering || flying
  }

  /**
   * 날아가는 책이 닿았으면 한 번 알린다(닿은 모습을 그린 뒤에 부른다). 돌아오는 책은 단계마다 한 번씩 알리고,
   * 제자리에 놓였으면 줄의 책으로 돌려놓고(그 자세가 멈춘 줄의 자세와 같다) 평소처럼 다시 그린 뒤에 알린다
   */
  function tellLanded() {
    if (!flight) return
    if (flight.kind === 'out') {
      if (!flight.frame.done || flight.told) return
      flight.told = true
      flight.onLanded()
      return
    }
    const { said, onStep, frame } = flight
    const say = (step: FieldsReturnStep) => {
      if (said.has(step)) return
      said.add(step)
      onStep(step)
    }
    if (flight.wait <= 0) say('depart')
    if (frame.departed) say('return')
    if (!frame.done) return
    endFlight()
    returned = true
    place()
    render()
    tellRow()
    say('landed')
  }

  function render() {
    const started = performance.now()
    if (flight && stage && view) renderFlight(frameOf(stage))
    else renderer.render(scene, camera)
    stats.renderMs = performance.now() - started
    stats.frames++
  }

  /**
   * 책이 날아가는 동안의 그리기. 세 번에 나눠 그린다:
   * (1) 나머지 책과 그 그림자: 책 자리 안에서만(캔버스는 화면 전체를 덮지만 서랍 입구 왼쪽으로는 책이 보이지 않는다.
   *     평소에는 CSS 마스크가 맡는 일이고, 날아가는 책은 그 마스크 밖으로 나가야 해서 이 동안에는 여기서 자른다).
   *     돌아오는 책을 그릴 때는 입구에서 옅어지는 것까지 그린다(`fade`: 놓인 뒤의 마스크와 같은 모습)
   * (2) 바탕색: 화면 전체에 그 책의 대표색을 얹는다(나머지 책과 다이얼을 덮어 온다)
   * (3) 날아가는 책과 그 그림자: 화면 어디든. 조명과 벽은 책을 따라가며 책 페이지의 것으로 바뀐다
   */
  function renderFlight(frame: CanvasFrame) {
    if (!flight) return
    const { frame: now, model } = flight
    renderer.autoClear = false
    renderer.clear()
    aimLightAtRow()
    camera.layers.set(0)
    renderer.setScissor(frame.left, 0, frame.width - frame.left, frame.height)
    renderer.setScissorTest(true)
    renderer.render(scene, camera)
    if (flight.kind === 'in') {
      camera.layers.set(FADE_LAYER)
      renderer.render(scene, camera)
    }
    renderer.setScissorTest(false)
    if (now.veil > 0) {
      camera.layers.set(VEIL_LAYER)
      renderer.render(scene, camera)
    }
    renderer.clearDepth()
    const at = model.group.position
    const wallZ = -FIELDS_LAYOUT.wallDepth + (at.z - FIELDS_FLIGHT.page.wall + FIELDS_LAYOUT.wallDepth) * now.camera
    aimLight(at, now.camera, wallZ)
    camera.layers.set(FLYING_LAYER)
    renderer.render(scene, camera)
    camera.layers.set(0)
    aimLightAtRow()
    renderer.autoClear = true
  }

  /** 검증용: 켜면 화면 주사에 맞춰 진행하지 않는다(`__fields3d.advance`로만 진행한다) */
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
    const moving = advance(Math.min(elapsed, MAX_FRAME_MS))
    if (moving || needsRender) {
      needsRender = false
      render()
    }
    tellLanded()
    if (moving) raf = requestAnimationFrame(frame)
    else lastTime = 0
  }

  /** 다음 프레임에 한 번 그린다. 움직이는 것이 있으면 멈출 때까지 이어서 그린다. 분류 화면이 보이지 않으면 미룬다 */
  function invalidate() {
    needsRender = true
    if (!raf && !disposed && active) raf = requestAnimationFrame(frame)
  }

  // ── 조명·벽 ──────────────────────────────────────────
  function applyLighting() {
    if (!view) return
    const L = FIELDS_LIGHTING
    const centre = new THREE.Vector3(...view.camera.target)
    fill.intensity = L.fill * Math.PI * L.gain

    // 그림자 카메라(직교): 화면에 보이는 줄과 그 둘레를 덮는다
    const reach = view.visibleWidth / 2 + 1.2
    const cam = key.shadow.camera
    cam.left = -reach
    cam.right = reach
    cam.top = 1
    cam.bottom = -1
    cam.near = 1
    cam.far = 20
    cam.updateProjectionMatrix()
    key.shadow.mapSize.set(...L.key.mapSize)
    key.shadow.radius = L.key.radius
    key.shadow.blurSamples = 16
    // 빛과 거의 나란한 면에 줄무늬(acne)가 생기지 않게: 법선 쪽으로 조금, 깊이로 아주 조금 민다
    key.shadow.bias = -0.0004
    key.shadow.normalBias = 0.004
    key.shadow.map?.dispose()
    key.shadow.map = null
    key.shadow.needsUpdate = true

    // 벽은 날아가는 책의 뒤(화면 왼쪽·눈 가까이)에서도 화면을 덮을 만큼 넓다
    wall.scale.set(view.visibleWidth * 8, 12, 1)
    wall.position.set(centre.x, 0, -FIELDS_LAYOUT.wallDepth)
    aimLightAtRow()
    for (const model of models.values())
      for (const face of BOOK_FACES) {
        model.materials[face].roughness = L.roughness
        model.materials[face].specularIntensity = L.specular
      }
    invalidate()
  }

  function setStage(next: FieldsStage) {
    stage = next
    view = fieldsView(next)
    const frame = frameOf(next)
    renderer.setPixelRatio(next.pixelRatio)
    renderer.setSize(frame.width, frame.height, false)
    // 카메라: 줄의 가운데 높이에서 정면으로. 캔버스가 책 자리보다 넓어도(화면 전체) 책 자리의 그림은 같다
    aimCamera(view.camera.position)
    // 화면이 달라지면 끌 수 있는 범위도 달라진다
    setScrollUnits(scroll)
    applyLighting()
    if (active) {
      place()
      render()
    }
    tellRow()
  }

  // ── 조작 ─────────────────────────────────────────────
  function setField(next: SceneField) {
    if (next.key === pointed.key) return
    pointed = runOf(next)
    hovered = null
    if (!active) return
    direction = requestItem(direction, pointed)
    preload(pointed)
    tellRow()
    invalidate()
  }

  function setActive(next: boolean) {
    if (next === active) return
    active = next
    hovered = null
    if (!active) {
      hovers.clear()
      cancelAnimationFrame(raf)
      raf = 0
      lastTime = 0
      // 날아간 책과 바탕색을 그려 둔 채로 떠나지 않는다: 돌아왔을 때 한 프레임이라도 비치지 않게 비운다
      if (flight) {
        endFlight()
        direction = emptyDirection()
        place()
        renderer.clear()
      }
      tellRow()
      return
    }
    // 화면에 들어섰다: 지금 가리키는 학문이 1부터 등장한다. 지난번에 그려 둔 책이 보이지 않게 먼저 비운다
    direction = requestItem(emptyDirection<Run>(), pointed, FIELDS_TIMING.arriveMs)
    preload(pointed)
    scroll = 0
    tellRow()
    if (stage) {
      place()
      render()
    }
    invalidate()
  }

  /** 스크롤을 범위 안으로 자른다. 끌 수 있는 줄(네 권 이상)은 양 끝을 저항 한도만큼 넘을 수 있다 */
  function setScrollUnits(units: number) {
    // 서랍으로 들어가는 책은 끌어 넘겨 둔 자리에서 이어서 들어간다: 그동안에도 그 줄의 범위로 자른다
    const run = direction.current?.item ?? direction.leaving?.item
    const max = run && view ? scrollRange(run.sizes, view) : 0
    const over = max > 0 && view ? FIELDS_SCROLL.overscrollPx / view.pxPerUnit : 0
    scroll = Math.min(max + over, Math.max(-over, units))
  }

  function setScroll(px: number) {
    if (!view || !resting()) return
    const before = scroll
    setScrollUnits(px / view.pxPerUnit)
    if (scroll !== before) invalidate()
  }

  function bookAt(x: number, y: number) {
    const run = resting()
    if (!view || !run) return null
    return facingBookAt(run.plan, run.sizes, planePointAt(view, x, y), scroll)
  }

  function bookBox(index: number) {
    const run = resting()
    if (!view || !run || index < 0 || index >= run.sizes.length) return null
    return facingBookBox(run.plan, run.sizes, index, view, scroll)
  }

  function setHover(index: number | null) {
    const run = resting()
    const next = run && index !== null ? (run.books[index]?.no ?? null) : null
    if (next === hovered) return
    hovered = next
    invalidate()
  }

  function flyOut(index: number, plan: FieldsFlight, onLanded: () => void) {
    const run = resting()
    const current = direction.current
    if (!run || !current || !view || !stage || index < 0 || index >= run.books.length) return false
    const book = run.books[index]
    const target = flightTarget(view, frameOf(stage), plan.page, run.sizes[index].width)
    if (![...target.position, ...target.eye].every(Number.isFinite) || target.eye[2] <= target.position[2]) return false
    // 누른 순간의 화면 자리와 자세(끌어 넘긴 자리, 포인터 반응으로 돈 각)에서 이어진다
    const stood = fieldBookPose(run.plan, run.sizes, index, current.at, hoverYaw(hovers.get(book.no)?.x ?? 0))
    const from: FieldBookPose = { position: [stood.position[0] - scroll, stood.position[1], stood.position[2]], quaternion: stood.quaternion }
    const model = modelOf(book)
    model.group.traverse((o) => o.layers.set(FLYING_LAYER))
    veilMaterial.color.set(plan.veil)
    hovers.delete(book.no)
    hovered = null
    flight = { kind: 'out', model, no: book.no, size: run.sizes[index], from, target, at: 0, frame: flightFrame(from, target, 0), onLanded, told: false }
    tellRow()
    invalidate()
    return true
  }

  /**
   * 책 페이지를 닫았다: 그 학문의 줄을 다 돌아 선 모습으로 바로 세우고(서랍에서 나오지 않는다), index번째 책만 책 페이지의
   * 자리에서 날려 보내 제자리에 놓는다. 그 책이 끌어 넘겨야 보이는 자리면 줄을 처음부터 보이게 넘겨 세운다
   */
  function flyIn(next: SceneField, index: number, plan: FieldsReturn, onStep: (step: FieldsReturnStep) => void) {
    if (disposed || !view || !stage) return false
    const run = next.key === pointed.key ? pointed : runOf(next)
    if (index < 0 || index >= run.books.length) return false
    const target = flightTarget(view, frameOf(stage), plan.page, run.sizes[index].width, plan.turn)
    if (![...target.position, ...target.eye, ...target.quaternion].every(Number.isFinite) || target.eye[2] <= target.position[2]) return false
    endFlight()
    pointed = run
    active = true
    hovered = null
    hovers.clear()
    direction = { current: { item: run, at: run.total }, leaving: null, pending: null }
    prepare(run)
    const max = scrollRange(run.sizes, view)
    const standing = facingBookBox(run.plan, run.sizes, index, view, 0)
    scroll = max > 0 ? revealScroll(0, standing, view.width, max * view.pxPerUnit) / view.pxPerUnit : 0
    const stood = fieldBookPose(run.plan, run.sizes, index, run.total, 0)
    const rest: FieldBookPose = { position: [stood.position[0] - scroll, stood.position[1], stood.position[2]], quaternion: stood.quaternion }
    const book = run.books[index]
    const model = modelOf(book)
    model.group.traverse((o) => o.layers.set(FLYING_LAYER))
    veilMaterial.color.set(plan.veil)
    flight = {
      kind: 'in',
      model,
      no: book.no,
      size: run.sizes[index],
      from: rest,
      target,
      at: 0,
      wait: Math.max(0, plan.waitMs ?? 0),
      frame: returnFrame(rest, target, 0),
      onStep,
      said: new Set(),
    }
    returned = false
    tellRow()
    // 캔버스가 책 페이지 위로 떠오르기 전에 출발하는 모습을 그려 둔다(지난번 그림이 비치지 않게)
    lastTime = 0
    place()
    render()
    invalidate()
    return true
  }

  function restore() {
    applyLighting()
    invalidate()
  }

  function dispose() {
    disposed = true
    cancelAnimationFrame(raf)
    for (const model of models.values()) model.dispose()
    models.clear()
    shared.dispose()
    wall.geometry.dispose()
    wallMaterial.dispose()
    veil.geometry.dispose()
    veilMaterial.dispose()
    fadeGeometry.dispose()
    fadeMaterial.dispose()
    key.shadow.map?.dispose()
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

  const handle: FieldsSceneHandle = { setStage, setField, setActive, setScroll, setHover, flyOut, flyIn, bookAt, bookBox, restore, dispose }

  return {
    ...handle,
    /** 조정·검증용(개발 서버에서만 `window.__fields3d`로 내놓는다) */
    debug: {
      stats,
      lighting: FIELDS_LIGHTING,
      timing: FIELDS_TIMING,
      applyLighting,
      sample,
      bookAt,
      bookBox,
      setScroll,
      setHover,
      get animating() {
        return raf !== 0
      },
      get stage() {
        return stage
      },
      get view() {
        return view
      },
      /** 진행 상태: 보이는·서랍으로 들어가는·기다리는 학문과 흐른 시간(ms), 책의 자리 */
      state() {
        const { current, leaving, pending } = direction
        const phase = (run: Run, at: number) => {
          const t = fieldsTimeline(run.books.length)
          return at < t.spreadAt ? 'enter' : at < t.turnAt(0) ? 'spread' : at < run.total ? 'turn' : 'rest'
        }
        return {
          active,
          pointed: pointed.key,
          current: current && { key: current.item.key, at: Math.round(current.at), phase: phase(current.item, current.at) },
          leaving: leaving && { key: leaving.item.key, at: Math.round(leaving.at), out: Math.round(leaving.out) },
          pending: pending && { key: pending.item.key, wait: Math.round(pending.wait) },
          scroll: round(scroll),
          hovered,
          /** 날아가는 책: 권 번호, 흐른 시간(ms), 자리, 눈이 옮겨 간 정도, 바탕색의 불투명도 */
          flight: flight && {
            kind: flight.kind,
            /** 돌아오는 책: 출발 전에 남은 기다림(ms) */
            wait: flight.kind === 'in' ? Math.round(flight.wait) : 0,
            no: flight.no,
            at: Math.round(flight.at),
            position: flight.frame.position.map((n) => round(n)),
            scale: round(flight.frame.scale),
            camera: round(flight.frame.camera),
            veil: round(flight.frame.veil),
            done: flight.frame.done,
          },
          books: (current?.item.books ?? []).map((book) => {
            const { group } = modelOf(book)
            const cover = new THREE.Vector3(0, 0, 1).applyQuaternion(group.quaternion)
            return {
              no: book.no,
              x: round(group.position.x),
              y: round(group.position.y),
              z: round(group.position.z),
              /** 앞표지가 정면을 보는 정도(0 = 책등이 정면, 1 = 다 돌았다) */
              coverFront: round(cover.z),
              loaded: modelOf(book).loadedFaces(),
            }
          }),
        }
      },
      /** 그림을 떼고 흰 책으로 그린다(조명만 재 볼 때). false로 되돌린다 */
      setWhite(on: boolean) {
        for (const model of models.values())
          for (const face of BOOK_FACES) {
            const material = model.materials[face]
            material.map = on ? null : model.textureOf(face)
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
        for (let i = 0; i < steps; i++) advance((seconds * 1000) / steps)
        render()
        tellLanded()
      },
      /** 날아가는 책의 윤곽(화면 전체 기준 CSS px): 책의 여덟 모서리가 화면에 놓이는 자리를 감싼 상자. 책 페이지의 책과 겹치는지 잴 때 쓴다 */
      flightBox() {
        if (!flight || !stage) return null
        const { group } = flight.model
        const { width, depth } = flight.size
        const frame = frameOf(stage)
        const xs: number[] = []
        const ys: number[] = []
        for (const sx of [-1, 1])
          for (const sy of [-1, 1])
            for (const sz of [-1, 1]) {
              const p = new THREE.Vector3((sx * width) / 2, sy / 2, (sz * depth) / 2).applyMatrix4(group.matrixWorld).project(camera)
              xs.push(((p.x + 1) / 2) * frame.width)
              ys.push(((1 - p.y) / 2) * frame.height)
            }
        return { left: round(Math.min(...xs), 1), top: round(Math.min(...ys), 1), right: round(Math.max(...xs), 1), bottom: round(Math.max(...ys), 1) }
      },
      flyOut,
      flyIn,
    },
  }
}

export type FieldsScene = ReturnType<typeof createFieldsScene>
