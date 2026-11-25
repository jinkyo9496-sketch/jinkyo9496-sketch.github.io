import { describe, expect, it, vi } from 'vitest'
import { chooseRenderer, detectWebGL, needsAccelerationNotice, rendererFromQuery } from '../src/shelf3d/renderer'

const ok = { ok: true } as const
const broken = { ok: false, reason: 'WebGL2 컨텍스트를 만들 수 없음', cause: 'no-context' } as const
const softOnly = { ok: false, reason: '소프트웨어 렌더러만 있음', cause: 'software' } as const
const noApi = { ok: false, reason: '이 환경에는 WebGL2가 없음', cause: 'no-api' } as const

describe('chooseRenderer', () => {
  it('uses the WebGL shelf on a wide screen that can draw it', () => {
    expect(chooseRenderer({ forced: 'auto', webgl: ok, width: 1440 })).toEqual({ renderer: 'webgl' })
    expect(chooseRenderer({ forced: 'auto', webgl: ok, width: 900 })).toEqual({ renderer: 'webgl' })
  })

  it('falls back to the CSS shelf when WebGL is not usable, naming the reason', () => {
    expect(chooseRenderer({ forced: 'auto', webgl: broken, width: 1440 })).toEqual({ renderer: 'css', reason: broken.reason, cause: 'no-context' })
  })

  it('keeps the CSS shelf on narrow screens (under 900px)', () => {
    const pick = chooseRenderer({ forced: 'auto', webgl: ok, width: 899 })
    expect(pick.renderer).toBe('css')
    expect(pick.reason).toMatch(/900/)
    expect(pick.cause).toBe('narrow')
  })

  it('names the narrow screen as the cause even when WebGL is not usable either (the layout is the reason there)', () => {
    expect(chooseRenderer({ forced: 'auto', webgl: broken, width: 899 }).cause).toBe('narrow')
    expect(chooseRenderer({ forced: 'auto', webgl: broken, width: 900 }).cause).toBe('no-context')
  })

  it('pretends graphics acceleration is off when asked to (nogpu), on any machine', () => {
    const pick = chooseRenderer({ forced: 'nogpu', webgl: ok, width: 1440 })
    expect(pick.renderer).toBe('css')
    expect(pick.cause).toBe('no-context')
    expect(pick.reason).toMatch(/nogpu/)
    expect(chooseRenderer({ forced: 'nogpu', webgl: ok, width: 800 }).cause).toBe('narrow')
  })

  it('obeys a forced renderer whatever the capability and width', () => {
    expect(chooseRenderer({ forced: 'css', webgl: ok, width: 1440 })).toEqual({ renderer: 'css' })
    expect(chooseRenderer({ forced: 'webgl', webgl: broken, width: 400 })).toEqual({ renderer: 'webgl' })
  })

  it('goes to CSS after a runtime failure, even when WebGL was forced', () => {
    expect(chooseRenderer({ forced: 'webgl', webgl: ok, width: 1440, failure: '컨텍스트를 잃음' })).toEqual({
      renderer: 'css',
      reason: '컨텍스트를 잃음',
      cause: 'failure',
    })
    expect(chooseRenderer({ forced: 'auto', webgl: ok, width: 1440, failure: '컨텍스트를 잃음' }).renderer).toBe('css')
  })
})

describe('needsAccelerationNotice: 그래픽 가속을 켜 달라는 안내를 보이는가', () => {
  const pick = (input: Partial<Parameters<typeof chooseRenderer>[0]>) =>
    chooseRenderer({ forced: 'auto', webgl: ok, width: 1440, ...input })

  it('shows on a wide screen that fell back because no WebGL2 context could be made', () => {
    expect(needsAccelerationNotice(pick({ webgl: broken }))).toBe(true)
    expect(needsAccelerationNotice(pick({ webgl: broken, width: 900 }))).toBe(true)
  })

  it('shows when only a software renderer is on offer', () => {
    expect(needsAccelerationNotice(pick({ webgl: softOnly }))).toBe(true)
  })

  it('does not show where the WebGL shelf is drawn', () => {
    expect(needsAccelerationNotice(pick({}))).toBe(false)
    expect(needsAccelerationNotice(pick({ forced: 'webgl', webgl: broken }))).toBe(false)
  })

  it('does not show on a narrow screen (the CSS shelf is the intended layout there)', () => {
    expect(needsAccelerationNotice(pick({ width: 899 }))).toBe(false)
    expect(needsAccelerationNotice(pick({ width: 899, webgl: broken }))).toBe(false)
    expect(needsAccelerationNotice(pick({ width: 600, webgl: softOnly }))).toBe(false)
  })

  it('does not show when the CSS shelf was forced (?shelf=css)', () => {
    expect(needsAccelerationNotice(pick({ forced: 'css' }))).toBe(false)
    expect(needsAccelerationNotice(pick({ forced: 'css', webgl: broken }))).toBe(false)
  })

  it('does not show after a runtime failure (a lost context or a bundle that did not load may not be about acceleration)', () => {
    expect(needsAccelerationNotice(pick({ failure: '컨텍스트를 잃음' }))).toBe(false)
    expect(needsAccelerationNotice(pick({ failure: 'WebGL 서가 묶음을 받지 못함' }))).toBe(false)
  })

  it('does not show where the browser has no WebGL2 at all, or where making the context threw (turning acceleration on would not help for sure)', () => {
    expect(needsAccelerationNotice(pick({ webgl: noApi }))).toBe(false)
    expect(needsAccelerationNotice(pick({ webgl: { ok: false, reason: '오류', cause: 'error' } }))).toBe(false)
  })

  it('shows for the pretend case (nogpu) on a wide screen only', () => {
    expect(needsAccelerationNotice(pick({ forced: 'nogpu' }))).toBe(true)
    expect(needsAccelerationNotice(pick({ forced: 'nogpu', width: 800 }))).toBe(false)
  })
})

describe('rendererFromQuery', () => {
  it('reads ?shelf=css and ?shelf=webgl, and is auto otherwise', () => {
    expect(rendererFromQuery('?shelf=css')).toBe('css')
    expect(rendererFromQuery('?a=1&shelf=webgl')).toBe('webgl')
    expect(rendererFromQuery('')).toBe('auto')
    expect(rendererFromQuery('?shelf=canvas')).toBe('auto')
  })

  it('reads ?shelf=nogpu on the dev server only', () => {
    expect(rendererFromQuery('?shelf=nogpu', true)).toBe('nogpu')
    expect(rendererFromQuery('?shelf=nogpu', false)).toBe('auto')
    expect(rendererFromQuery('?shelf=nogpu')).toBe('auto')
    expect(rendererFromQuery('?shelf=css', true)).toBe('css')
  })
})

describe('detectWebGL', () => {
  const canvasWith = (getContext: (kind: string, attrs?: WebGLContextAttributes) => unknown) =>
    () => ({ getContext }) as unknown as HTMLCanvasElement
  const gl = (renderer = 'ANGLE (Apple, Apple M2, OpenGL 4.1)') => ({
    getExtension: (name: string) =>
      name === 'WEBGL_debug_renderer_info' ? { UNMASKED_RENDERER_WEBGL: 1 } : name === 'WEBGL_lose_context' ? { loseContext: vi.fn() } : null,
    getParameter: () => renderer,
  })

  it('is not usable where the WebGL API does not exist (jsdom)', () => {
    const createCanvas = vi.fn()
    const result = detectWebGL({ hasApi: false, createCanvas })
    expect(result.ok).toBe(false)
    expect(createCanvas).not.toHaveBeenCalled()
    // 이 테스트 환경(jsdom)에서도 그렇다
    expect(detectWebGL().ok).toBe(false)
    expect(result.ok || result.cause).toBe('no-api')
  })

  it('is usable when a hardware WebGL2 context can be made', () => {
    const getContext = vi.fn(() => gl())
    expect(detectWebGL({ hasApi: true, createCanvas: canvasWith(getContext) })).toEqual({ ok: true })
    expect(getContext).toHaveBeenCalledWith('webgl2', { failIfMajorPerformanceCaveat: true })
  })

  it('is not usable when no context can be made (graphics acceleration off)', () => {
    const result = detectWebGL({ hasApi: true, createCanvas: canvasWith(() => null) })
    expect(result.ok).toBe(false)
    expect(result.ok || result.reason).toMatch(/WebGL2/)
    expect(result.ok || result.cause).toBe('no-context')
  })

  it('is not usable when only a software renderer is on offer', () => {
    const onlySoft = canvasWith((_kind, attrs) => (attrs?.failIfMajorPerformanceCaveat ? null : gl()))
    const soft = detectWebGL({ hasApi: true, createCanvas: onlySoft })
    expect(soft.ok || soft.reason).toMatch(/소프트웨어/)
    const swift = detectWebGL({ hasApi: true, createCanvas: canvasWith(() => gl('Google SwiftShader')) })
    expect(swift.ok || swift.reason).toMatch(/소프트웨어/)
    expect(soft.ok || soft.cause).toBe('software')
    expect(swift.ok || swift.cause).toBe('software')
  })

  it('is not usable when creating the context throws', () => {
    const result = detectWebGL({
      hasApi: true,
      createCanvas: canvasWith(() => {
        throw new Error('boom')
      }),
    })
    expect(result.ok).toBe(false)
    expect(result.ok || result.cause).toBe('error')
  })
})
