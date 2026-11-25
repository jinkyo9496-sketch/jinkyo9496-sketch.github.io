/**
 * 표지 그림(텍스처)을 URL별로 한 번만 받아 나눠 쓰는 캐시. 쓰는 곳의 수를 세어, 마지막 하나가 놓으면 버린다.
 * 서가와 (나중의) 한 권 화면이 같은 캐시를 쓰면 같은 그림을 두 번 받지 않는다.
 */
import * as THREE from 'three'

export type TextureSource = (url: string) => Promise<THREE.Texture>

export interface TextureCache {
  /** 그림을 받는다(이미 받았거나 받는 중이면 그것을 함께 쓴다). 쓰고 나면 반드시 release */
  acquire(url: string): Promise<THREE.Texture>
  /** acquire 한 번에 한 번. 실패한(reject) acquire에는 부르지 않는다 */
  release(url: string): void
  /** 지금 이 URL을 쓰고 있는 곳의 수 */
  refs(url: string): number
}

/** 표지 색을 원본 그대로 보이기 위한 설정: sRGB, 밉맵, 삼선형 필터 */
export function prepareCoverTexture(texture: THREE.Texture) {
  texture.colorSpace = THREE.SRGBColorSpace
  texture.generateMipmaps = true
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.magFilter = THREE.LinearFilter
  return texture
}

const loadWithThree: TextureSource = (url) => new THREE.TextureLoader().loadAsync(url)

interface Entry {
  refs: number
  promise: Promise<THREE.Texture>
  texture: THREE.Texture | null
}

export function createTextureCache(source: TextureSource = loadWithThree): TextureCache {
  const entries = new Map<string, Entry>()

  function acquire(url: string) {
    const existing = entries.get(url)
    if (existing) {
      existing.refs++
      return existing.promise
    }
    const entry: Entry = { refs: 1, texture: null, promise: Promise.resolve(null as unknown as THREE.Texture) }
    entry.promise = source(url).then(
      (texture) => {
        prepareCoverTexture(texture)
        // 받는 동안 모두가 놓았으면 바로 버린다
        if (entries.get(url) !== entry) texture.dispose()
        else entry.texture = texture
        return texture
      },
      (error) => {
        // 실패한 그림은 잊는다: 다음에 다시 받아 볼 수 있다
        if (entries.get(url) === entry) entries.delete(url)
        throw error
      },
    )
    entries.set(url, entry)
    return entry.promise
  }

  function release(url: string) {
    const entry = entries.get(url)
    if (!entry) return
    entry.refs--
    if (entry.refs > 0) return
    entries.delete(url)
    entry.texture?.dispose()
  }

  return { acquire, release, refs: (url) => entries.get(url)?.refs ?? 0 }
}

let shared: TextureCache | null = null
/** 앱 전체가 함께 쓰는 캐시 */
export function sharedBookTextures() {
  shared ??= createTextureCache()
  return shared
}
