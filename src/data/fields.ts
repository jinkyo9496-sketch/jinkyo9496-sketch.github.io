import { books, type Book } from './books'

/** 학제별 분류의 학문 하나 */
export interface Field {
  name: string
  /** 이 학문에 드는 권 번호. 적힌 순서가 화면에 보이는 순서다 */
  nos: readonly number[]
}

/**
 * 학문 열하나와 그 책(스펙 확정 2026-11-23. 2026-11-24 편집자 요청: 33·35권은 환경 → 생명과학, 48권은 철학). 이 순서가 글자 다이얼의 순서이고, 처음 가리키는 것은 철학이다.
 * 모든 권이 정확히 한 번씩 들어 있다(`tests/fields.test.ts`). 신간은 그 학문의 줄 끝에 번호를 붙인다(`docs/신간-추가.md`).
 */
export const fields: readonly Field[] = [
  { name: '철학', nos: [5, 18, 24, 32, 48] },
  { name: '심리', nos: [28, 30] },
  { name: '예술', nos: [13, 17, 19] },
  { name: '문학', nos: [7, 15, 27] },
  { name: '생명과학', nos: [1, 21, 25, 33, 35, 38] },
  { name: '법', nos: [10, 22, 36, 44] },
  { name: '정치', nos: [4, 8, 41, 46] },
  { name: '경제·경영', nos: [6, 23, 26, 29, 43, 45] },
  { name: '환경', nos: [11, 31, 34, 37, 39] },
  { name: '역사', nos: [12, 14, 16, 20] },
  { name: '과학', nos: [2, 3, 9, 40, 42, 47] },
]

const byNo = new Map(books.map((book) => [book.no, book]))

/** 그 학문의 책. 적힌 순서 그대로 */
export function fieldBooks(field: Field): Book[] {
  return field.nos.flatMap((no) => byNo.get(no) ?? [])
}

const fieldOfNo = new Map(fields.flatMap((field, i) => field.nos.map((no) => [no, i] as const)))

/** 그 권이 속한 학문의 순번(`fields`의 index). 어느 학문에도 없는 번호면 null */
export const fieldIndexOfBook = (no: number): number | null => fieldOfNo.get(no) ?? null

/** 읽기 도구용 이름: "철학, 5권" */
export const fieldLabel = (field: Field) => `${field.name}, ${field.nos.length}권`
