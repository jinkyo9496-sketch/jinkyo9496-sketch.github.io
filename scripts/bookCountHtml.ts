/**
 * `index.html`의 권수(제목·설명의 "1~N권")를 책 데이터에서 채운다(Vite 플러그인. `vite.config.ts`가 쓴다).
 * `index.html`에는 숫자 대신 `BOOK_COUNT_MARK`를 적어 둔다. 개발 서버와 빌드 모두에서 `books.length`로 바뀐다.
 * 신간을 `src/data/books.ts`에 넣으면 따로 고칠 것이 없다. 테스트 `tests/bookCountHtml.test.ts`
 */
import type { Plugin } from 'vite'
import { books } from '../src/data/books'

/** index.html에 적는 권수 자리 */
export const BOOK_COUNT_MARK = '{{권수}}'

export const fillBookCount = (html: string, count: number): string => html.split(BOOK_COUNT_MARK).join(String(count))

export const bookCountHtml = (): Plugin => ({
  name: 'seoga-book-count',
  transformIndexHtml: { order: 'pre', handler: (html) => fillBookCount(html, books.length) },
})
