/**
 * 서가를 무엇으로 그릴지 정한다: WebGL(three.js) 서가 또는 CSS 3D 서가(대체).
 * three에 의존하지 않는다(첫 화면이 three를 기다리지 않게). 단위 테스트 `tests/renderer.test.ts`.
 */

export type Renderer = 'css' | 'webgl'
/**
 * 'auto'(기본): 쓸 수 있으면 WebGL, 아니면 CSS. 'css'·'webgl'은 강제(테스트, `?shelf=css`).
 * 'nogpu'는 확인용: 'auto'와 같되 이 기기에 그래픽 가속이 없는 것처럼 군다(가속 안내를 띄워 볼 때. 개발 서버의 `?shelf=nogpu`)
 */
export type RendererChoice = Renderer | 'auto' | 'nogpu'

/**
 * WebGL 서가를 쓸 수 없는 까닭의 갈래: WebGL2 API가 아예 없음 / 컨텍스트를 만들 수 없음 / 소프트웨어 렌더러뿐 / 만드는 중 오류.
 * 가운데 둘이 "그래픽 가속이 꺼져 있다"로 볼 수 있는 경우다
 */
export type WebGLCause = 'no-api' | 'no-context' | 'software' | 'error'
/** CSS 서가로 물러난 까닭의 갈래: 위의 넷, 화면 폭이 좁음(의도한 배치), 그리다가 난 문제(컨텍스트를 잃음·묶음을 받지 못함) */
export type FallbackCause = WebGLCause | 'narrow' | 'failure'

export type WebGLSupport = { ok: true } | { ok: false; reason: string; cause: WebGLCause }

/** 이 폭보다 좁은 화면은 CSS 서가를 쓴다(모바일 다듬기는 나중에) */
export const WEBGL_MIN_WIDTH = 900

export interface RendererInput {
  forced: RendererChoice
  webgl: WebGLSupport
  /** 화면 폭(px) */
  width: number
  /** 그리는 도중에 난 문제(컨텍스트를 잃음 등). 있으면 강제 여부와 상관없이 CSS로 간다 */
  failure?: string | null
}

export interface RendererPick {
  renderer: Renderer
  /** CSS로 물러난 이유(콘솔에 남기는 글). 강제로 고른 경우에는 없다 */
  reason?: string
  /** 그 이유의 갈래 */
  cause?: FallbackCause
}

/** 'nogpu'가 흉내 내는 것: 컨텍스트를 만들 수 없는 기기 */
const PRETEND_NO_GPU: WebGLSupport = { ok: false, reason: '그래픽 가속이 없는 것으로 흉내 냄(nogpu)', cause: 'no-context' }

/**
 * 그릴 방식과, CSS로 물러났다면 그 이유(강제로 고른 경우에는 이유가 없다).
 * 폭이 좁은 화면은 WebGL을 쓸 수 있든 없든 CSS 서가가 의도한 배치이므로, 이유도 폭이다.
 */
export function chooseRenderer({ forced, webgl, width, failure }: RendererInput): RendererPick {
  if (failure) return { renderer: 'css', reason: failure, cause: 'failure' }
  if (forced === 'css' || forced === 'webgl') return { renderer: forced }
  if (width < WEBGL_MIN_WIDTH) return { renderer: 'css', reason: `화면 폭이 ${WEBGL_MIN_WIDTH}px보다 좁음`, cause: 'narrow' }
  const support = forced === 'nogpu' ? PRETEND_NO_GPU : webgl
  if (!support.ok) return { renderer: 'css', reason: support.reason, cause: support.cause }
  return { renderer: 'webgl' }
}

/**
 * 그래픽 가속을 켜 달라는 안내(`chrome/GpuNotice`)를 보이는가: 화면 폭은 충분한데 그래픽 가속을 쓸 수 없어서
 * (WebGL2 컨텍스트를 만들 수 없음 / 소프트웨어 렌더러뿐) CSS 서가로 물러났을 때만.
 * 보이지 않는 경우: WebGL 서가, 폭 900px 미만, 강제한 CSS 서가, 그리다가 난 문제(컨텍스트를 잃음·묶음을 받지 못함),
 * WebGL2가 아예 없는 브라우저, 컨텍스트를 만들다 난 오류. 뒤의 셋은 가속을 켜도 나아진다고 말할 수 없다.
 */
export function needsAccelerationNotice({ renderer, cause }: RendererPick): boolean {
  return renderer === 'css' && (cause === 'no-context' || cause === 'software')
}

/**
 * 주소의 `?shelf=css` / `?shelf=webgl`로 그리는 방식을 고를 수 있다(확인·비교용).
 * 개발 서버(`dev`)에서는 `?shelf=nogpu`도 듣는다: 그래픽 가속이 없는 기기를 흉내 내 가속 안내를 띄워 본다.
 */
export function rendererFromQuery(search: string, dev = false): RendererChoice {
  const value = new URLSearchParams(search).get('shelf')
  if (value === 'css' || value === 'webgl') return value
  return dev && value === 'nogpu' ? 'nogpu' : 'auto'
}

const SOFTWARE_RENDERER = /swiftshader|llvmpipe|software|basic render/i

interface DetectOptions {
  /** WebGL API가 있는 환경인가(jsdom에는 없다) */
  hasApi?: boolean
  createCanvas?: () => HTMLCanvasElement
}

const release = (gl: WebGL2RenderingContext | null) => gl?.getExtension('WEBGL_lose_context')?.loseContext()

/**
 * WebGL 서가를 그릴 수 있는가. three는 WebGL2가 필요하다. 하드웨어 가속이 꺼져 있거나
 * (컨텍스트를 만들 수 없음) 소프트웨어 렌더러뿐이면 쓸 수 없는 것으로 본다.
 */
export function detectWebGL({
  hasApi = typeof WebGL2RenderingContext !== 'undefined',
  createCanvas = () => document.createElement('canvas'),
}: DetectOptions = {}): WebGLSupport {
  if (!hasApi) return { ok: false, reason: '이 환경에는 WebGL2가 없음', cause: 'no-api' }
  try {
    const gl = createCanvas().getContext('webgl2', { failIfMajorPerformanceCaveat: true })
    if (!gl) {
      // 느려도 된다고 하면 만들어지는가: 그렇다면 소프트웨어 렌더러뿐이다
      const soft = createCanvas().getContext('webgl2')
      release(soft)
      return soft
        ? { ok: false, reason: '소프트웨어 렌더러만 있음(그래픽 가속 꺼짐)', cause: 'software' }
        : { ok: false, reason: 'WebGL2 컨텍스트를 만들 수 없음(그래픽 가속 꺼짐 또는 미지원)', cause: 'no-context' }
    }
    const info = gl.getExtension('WEBGL_debug_renderer_info')
    const name = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : ''
    release(gl)
    if (SOFTWARE_RENDERER.test(name)) return { ok: false, reason: `소프트웨어 렌더러(${name})`, cause: 'software' }
    return { ok: true }
  } catch {
    return { ok: false, reason: 'WebGL2 컨텍스트를 만드는 중 오류', cause: 'error' }
  }
}
