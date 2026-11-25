import { describe, expect, it } from 'vitest'
import { drawOrderFor, pageShadowOn } from '../src/shelf3d/motion'
import * as THREE from 'three'
import { LIGHTING, SHADOW_TAPS, lightShadowChunk } from '../src/shelf3d/scene'

/**
 * 서가 장면의 그리는 비용을 줄이는 약속(2026-11-24). 모든 방문자에게 같은 화면이고 품질을 나누지 않는다.
 * 실측과 근거는 `docs/TODO.md`의 "조정 (2026-11-24): 서가 장면 가볍게 하기".
 */
describe('서가 장면의 그리는 비용', () => {
  it('가운데에 가까운 책부터 그린다: 앞에 선 책이 먼저 그려져 가려진 면의 계산을 건너뛴다', () => {
    expect(drawOrderFor(0)).toBe(0)
    expect(drawOrderFor(120)).toBeLessThan(drawOrderFor(-400))
    expect(drawOrderFor(-120)).toBeLessThan(drawOrderFor(400))
  })

  it('그리는 순서는 좌우가 같고 정수다', () => {
    expect(drawOrderFor(-333.4)).toBe(drawOrderFor(333.4))
    expect(Number.isInteger(drawOrderFor(333.4))).toBe(true)
  })

  it('책 페이지의 그림자 조명은 책 페이지의 모습이 조금이라도 들어와 있을 때만 그림자를 만든다', () => {
    expect(pageShadowOn(0)).toBe(false)
    expect(pageShadowOn(0.001)).toBe(true)
    expect(pageShadowOn(1)).toBe(true)
  })

  it('서가 조명의 그림자 맵은 주광 2048×1024, 옆 조명 1024×512를 넘지 않는다', () => {
    const [main, left, right] = LIGHTING.keys
    expect(main.mapSize).toEqual([2048, 1024])
    expect(left.mapSize).toEqual([1024, 512])
    expect(right.mapSize).toEqual([1024, 512])
  })

  it('그림자 맵을 줄인 만큼 흐림(텍셀 단위)도 줄여 가장자리의 흐린 폭이 예전과 같다', () => {
    // 예전: 4096폭에 흐림 4, 2048폭에 흐림 7
    const [main, left, right] = LIGHTING.keys
    expect(main.radius / main.mapSize[0]).toBeCloseTo(4 / 4096, 6)
    expect(left.radius / left.mapSize[0]).toBeCloseTo(7 / 2048, 6)
    expect(right.radius / right.mapSize[0]).toBeCloseTo(7 / 2048, 6)
  })

  it('그림자 맵을 읽는 횟수를 5에서 3으로 줄인다: three의 그림자 읽기에서 표본 수만 바꾼다', () => {
    const original = THREE.ShaderChunk.shadowmap_pars_fragment
    const lighter = lightShadowChunk(original)
    expect(SHADOW_TAPS).toBe(3)
    // 지금 쓰는 three에서 바꿀 자리를 찾았다(찾지 못하면 원래 것이 그대로 돌아온다)
    expect(lighter).not.toBe(original)
    expect(lighter).not.toMatch(/vogelDiskSample\( \d, 5, phi \) \* radius, shadowCoord\.z/)
    expect(lighter.match(/vogelDiskSample\( \d, 3, phi \) \* radius, shadowCoord\.z/g)).toHaveLength(3)
    expect(lighter).toContain(') / 3.0;')
  })

  it('three가 그 부분을 바꿔 찾지 못하면 원래 그림자 읽기를 그대로 쓴다', () => {
    expect(lightShadowChunk('float getShadow() { return 1.0; }')).toBe('float getShadow() { return 1.0; }')
  })
})
