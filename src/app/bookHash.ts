/**
 * 책 페이지의 주소: `#/book/11`. 열린 책 페이지를 주소에 적어 두어, 링크·새로 고침으로 그 책 페이지가 바로 열리고
 * 브라우저의 뒤로 가기로 서가에 돌아간다. 순수 함수(주소와 맞추는 일은 `useBookHash`).
 */
import type { ScreenState } from './screen'

const BOOK_HASH = /^#\/book\/(\d+)\/?$/

/** 권 번호(1~) → 주소의 해시 */
export const bookHash = (no: number) => `#/book/${no}`

/** 해시가 책 페이지를 가리키면 그 책의 index(0~), 아니면 null */
export function parseBookHash(hash: string, count: number): number | null {
  const match = BOOK_HASH.exec(hash)
  if (!match) return null
  const no = Number(match[1])
  return no >= 1 && no <= count ? no - 1 : null
}

/** 이 주소로 들어왔을 때의 첫 화면: 책 페이지를 가리키면 그 책의 페이지, 아니면 null(평소의 첫 화면) */
export function screenFromHash(hash: string, count: number): ScreenState | null {
  const index = parseBookHash(hash, count)
  return index === null ? null : { screen: 'shelf', index, view: 'book' }
}
