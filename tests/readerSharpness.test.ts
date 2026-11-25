import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { READ_PIXEL_RATIO, renderPixelRatio } from '../src/shelf3d/motion'
import { READER, sharperMapFragment } from '../src/shelf3d/reader'

describe('renderPixelRatio: how finely the canvas is drawn', () => {
  it('follows the screen while the book is shut', () => {
    expect(renderPixelRatio(1, false)).toBe(1)
    expect(renderPixelRatio(1.5, false)).toBe(1.5)
    expect(renderPixelRatio(2, false)).toBe(2)
  })

  it('draws at twice the size while a book lies open, so small print stays crisp on an ordinary screen', () => {
    expect(READ_PIXEL_RATIO).toBe(2)
    expect(renderPixelRatio(1, true)).toBe(2)
    expect(renderPixelRatio(1.25, true)).toBe(2)
  })

  it('never goes below what the screen already has', () => {
    expect(renderPixelRatio(2, true)).toBe(2)
  })
})

describe('sharperMapFragment: the pages pick a finer copy of their picture', () => {
  it('biases the picture lookup towards the sharper mip level', () => {
    const out = sharperMapFragment(THREE.ShaderChunk.map_fragment)
    expect(out).toContain(`texture2D( map, vMapUv, ${READER.mapBias.toFixed(2)} )`)
    expect(out).not.toContain('texture2D( map, vMapUv )')
    expect(READER.mapBias).toBeLessThan(0)
    expect(READER.mapBias).toBeGreaterThanOrEqual(-1)
  })

  it('leaves a shader it does not recognise alone', () => {
    expect(sharperMapFragment('void main() {}')).toBe('void main() {}')
  })
})
