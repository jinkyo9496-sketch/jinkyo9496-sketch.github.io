import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { pruneContent } from '../scripts/pruneContent'

describe('pruneContent: 배포 결과물에서 쓰지 않는 본문 그림을 뺀다', () => {
  let out = ''
  const file = (...p: string[]) => {
    mkdirSync(join(out, ...p.slice(0, -1)), { recursive: true })
    writeFileSync(join(out, ...p), 'x')
  }
  const setup = () => {
    out = mkdtempSync(join(tmpdir(), 'prune-'))
    file('full', '17', 'p001.webp')
    file('full', '33', 'p001.webp')
    file('preview', '17', 'p01.jpg')
    file('preview', '17', 'p30.jpg')
    file('preview', '17', 'flap-front.jpg')
    file('preview', '05', 'p01.jpg')
  }
  afterEach(() => out && rmSync(out, { recursive: true, force: true }))

  it('removes a whole full-text folder, and only the page images of a preview folder (the flaps stay)', () => {
    setup()
    const removed = pruneContent(out, [
      { dir: 'full/33', pages: false },
      { dir: 'preview/17', pages: true },
    ])
    expect(existsSync(join(out, 'full', '33'))).toBe(false)
    expect(existsSync(join(out, 'full', '17', 'p001.webp'))).toBe(true)
    expect(readdirSync(join(out, 'preview', '17'))).toEqual(['flap-front.jpg'])
    expect(existsSync(join(out, 'preview', '05', 'p01.jpg'))).toBe(true)
    expect(removed).toEqual(['full/33', 'preview/17 (쪽 그림 2장)'])
  })

  it('ignores folders that are not there', () => {
    setup()
    expect(pruneContent(out, [{ dir: 'full/40', pages: false }])).toEqual([])
  })
})
