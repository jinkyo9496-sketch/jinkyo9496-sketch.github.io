import { useEffect, useState } from 'react'
import { useViewportWidth } from '../shelf/useBookHeight'
import { chooseRenderer, detectWebGL, needsAccelerationNotice, type RendererChoice, type WebGLSupport } from './renderer'
import type { Shelf3D } from './Shelf3D'

/** three와 WebGL 서가는 따로 떨어진 묶음으로 받는다(인트로와 CSS 서가는 기다리지 않는다) */
const loadShelf3D = () => import('./Shelf3D')

let support: WebGLSupport | null = null
/** WebGL을 쓸 수 있는지는 한 번만 알아본다 */
const webglSupport = () => (support ??= detectWebGL())

let lastLogged: string | null = null
/** CSS 서가로 물러난 이유를 한 줄 남긴다(같은 이유는 한 번만) */
function logFallback(reason: string) {
  if (reason === lastLogged) return
  lastLogged = reason
  console.info(`[서가] WebGL 서가 대신 CSS 서가로 표시: ${reason}`)
}

/**
 * 서가를 무엇으로 그릴지와, WebGL 서가라면 그 컴포넌트(받는 중에는 null).
 * 규칙은 `chooseRenderer`. 그리다가 문제가 생기면 `fail(이유)`로 알려 CSS 서가로 바꾼다.
 * `accelerationOff`: 그래픽 가속을 쓸 수 없어 물러났다(가속을 켜 달라는 안내를 보인다. 규칙은 `needsAccelerationNotice`).
 */
export function useShelfRenderer(forced: RendererChoice) {
  const width = useViewportWidth()
  const [failure, setFailure] = useState<string | null>(null)
  const webgl: WebGLSupport = forced === 'auto' ? webglSupport() : { ok: true }
  const pick = chooseRenderer({ forced, webgl, width, failure })
  const { renderer, reason } = pick
  const [Component, setComponent] = useState<typeof Shelf3D | null>(null)

  useEffect(() => {
    if (renderer !== 'webgl') return
    let alive = true
    loadShelf3D().then(
      (module) => alive && setComponent(() => module.Shelf3D),
      () => alive && setFailure('WebGL 서가 묶음을 받지 못함'),
    )
    return () => {
      alive = false
    }
  }, [renderer])

  useEffect(() => {
    if (renderer === 'css' && reason) logFallback(reason)
  }, [renderer, reason])

  return { renderer, Shelf3D: Component, fail: setFailure, accelerationOff: needsAccelerationNotice(pick) }
}
