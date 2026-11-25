/**
 * 배포용 빌드에서 쓰지 않는 쪽의 본문 그림을 뺀다(Vite 플러그인. `vite.config.ts`가 쓴다).
 *
 * `public/`의 파일은 화면에 보이지 않아도 주소를 알면 열린다. 그래서 빌드가 끝난 뒤 결과물 폴더에서
 *   - 미리보기로 보이는 권의 책 전체(`full/NN/`)
 *   - 책 전체로 보이는 권의 미리보기 쪽 그림(`preview/NN/pKK.jpg`. 날개 그림 `flap-*.jpg`는 남긴다)
 * 을 지운다. 무엇을 뺄지는 `src/data/bookContent.ts`의 `unusedContent`가 정한다(권별 전환은 `src/data/readingMode.ts`).
 * `public/` 안의 원본은 건드리지 않는다. 개발 서버(`npm run dev`)에서는 아무것도 하지 않는다.
 */
import { existsSync, readdirSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { Plugin } from 'vite'
import { unusedContent, type UnusedContent } from '../src/data/bookContent'

/** 미리보기의 쪽 그림(날개 그림은 아니다) */
const PAGE_IMAGE = /^p\d+\.jpg$/

/** outDir에서 drop을 지우고, 지운 것의 이름을 돌려준다 */
export function pruneContent(outDir: string, drop: readonly UnusedContent[] = unusedContent()): string[] {
  const removed: string[] = []
  for (const { dir, pages } of drop) {
    const folder = join(outDir, dir)
    if (!existsSync(folder)) continue
    if (!pages) {
      rmSync(folder, { recursive: true, force: true })
      removed.push(dir)
      continue
    }
    const files = readdirSync(folder).filter((f) => PAGE_IMAGE.test(f))
    for (const f of files) rmSync(join(folder, f), { force: true })
    if (files.length > 0) removed.push(`${dir} (쪽 그림 ${files.length}장)`)
  }
  return removed
}

export function pruneUnusedContent(): Plugin {
  let outDir = ''
  return {
    name: 'prune-unused-content',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir)
    },
    closeBundle() {
      const removed = pruneContent(outDir)
      if (removed.length > 0) console.info(`쓰지 않는 본문 그림을 결과물에서 뺐습니다: ${removed.join(', ')}`)
    },
  }
}
