/**
 * 종이 단면(배·위·아래)의 책장 줄무늬. 두께 방향으로만 변하는 한 줄짜리 무늬를 실행 중에 만든다.
 * 종이색에 곱하는 밝기(1 = 종이색 그대로)이고, 대비가 낮다. 서가 크기에서는 밉맵이 가는 줄을 뭉개고 굵은 결만 남긴다(어른거리지 않는다).
 */
import * as THREE from 'three'

export const PAGE_TEXTURE = {
  /** 무늬의 텍셀 수(두께 방향) */
  texels: 256,
  /** 가장 어두운 줄이 종이색에서 어두워지는 정도 */
  contrast: 0.18,
  /** 무늬 한 벌이 덮는 두께(책 높이 대비). 책이 두꺼우면 무늬가 늘어나지 않고 이어진다 */
  span: 0.12,
}

/** 무늬가 없는 종이 면(표지 안쪽, 표지의 단면, 첫 장)이 읽는 자리: 0번 텍셀의 한가운데 */
export const PLAIN_U = 0.5 / PAGE_TEXTURE.texels

/** 씨앗이 정해진 난수(mulberry32): 무늬가 언제나 같다 */
function seeded(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * 텍셀마다의 밝기(0~1). 네 겹을 더한다: 책장 한 장 한 장의 가는 줄(가까이에서만 보인다),
 * 몇 장씩 뭉친 띠, 서가 크기에서도 남는 굵은 결(밉맵이 뭉갠 뒤에도 두세 픽셀 폭),
 * 드문드문 벌어진 틈의 어두운 줄. 0번 텍셀은 무늬 없는 종이(1)다.
 */
export function pageEdgeLevels(): number[] {
  const { texels, contrast } = PAGE_TEXTURE
  const random = seeded(47)
  /** 폭이 min~max 텍셀인 띠를 이어 붙인 한 겹(띠마다 밝기가 다르다) */
  const bands = (min: number, max: number) => {
    const out: number[] = []
    while (out.length < texels) {
      const value = random()
      const width = min + Math.floor(random() * (max - min + 1))
      for (let i = 0; i < width && out.length < texels; i++) out.push(value)
    }
    return out
  }
  const coarse = bands(14, 36)
  const band = bands(3, 11)
  const levels = coarse.map((c, i) => {
    const fine = i % 2
    const gap = random() < 0.06 ? 1 : 0
    return 1 - contrast * (0.2 * fine + 0.2 * band[i] + 0.4 * c + 0.2 * gap)
  })
  levels[0] = 1
  return levels
}

/** 줄무늬 텍스처(가로 = 두께 방향, 반복). 밉맵과 비등방 필터로 비스듬히 보일 때도 고르다 */
export function createPageEdgeTexture(anisotropy = 1) {
  const levels = pageEdgeLevels()
  const rows = 2
  const data = new Uint8Array(levels.length * rows * 4)
  for (let row = 0; row < rows; row++)
    levels.forEach((level, i) => {
      const at = (row * levels.length + i) * 4
      const value = Math.round(level * 255)
      data[at] = data[at + 1] = data[at + 2] = value
      data[at + 3] = 255
    })
  const texture = new THREE.DataTexture(data, levels.length, rows, THREE.RGBAFormat)
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
