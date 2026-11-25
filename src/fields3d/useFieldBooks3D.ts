import { useEffect, useState } from 'react'
import type { FieldBooks3D } from './FieldBooks3D'

/** three와 책 장면은 따로 떨어진 묶음으로 받는다(인트로와 서가의 첫 화면은 기다리지 않는다) */
const loadFieldBooks3D = () => import('./FieldBooks3D')

/**
 * 학제별 분류의 3D 책 컴포넌트를 받아 온다(받는 중에는 null). WebGL로 그릴지는 서가와 같은 판정
 * (`shelf3d/renderer.ts`의 `chooseRenderer`)의 결과를 App이 내려 준다: enabled가 그 값이다.
 */
export function useFieldBooks3D(enabled: boolean) {
  const [Component, setComponent] = useState<typeof FieldBooks3D | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!enabled) return
    let alive = true
    loadFieldBooks3D().then(
      (module) => alive && setComponent(() => module.FieldBooks3D),
      () => alive && setFailed(true),
    )
    return () => {
      alive = false
    }
  }, [enabled])

  return { FieldBooks3D: Component, failed }
}
