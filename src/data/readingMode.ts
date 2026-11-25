/**
 * 권별 전환: 책 페이지에서 펼쳐 보는 본문을 어디서 가져올 것인가. 손으로 고치는 파일이다.
 *   'preview'  미리보기(앞부분 일부). `public/preview/NN/`. 적지 않은 권은 모두 이것이다
 *   'full'     책 전체. `public/full/NN/`(인쇄용 본문 PDF를 `scripts/cutPrintPdf.py --full`로 자른 것)
 * 'full'로 적었어도 전체 본문을 아직 만들지 않은 권은 미리보기가 나온다.
 * 배포용 빌드(`npm run build`)는 쓰지 않는 쪽의 본문 그림을 결과물에서 뺀다(`scripts/pruneContent.ts`).
 *
 * 2026-11-25: 편집자가 1~47권의 인쇄용 본문 PDF를 주어 한때 모두 책 전체로 바꿨다가, 같은 날 "책 앞에 30p만 미리보기로"로 정했다.
 * 지금은 모든 권이 미리보기(인쇄용 본문 PDF의 앞 30쪽)다. 책 전체의 그림은 같은 날 프로젝트 밖 `../seoga-shelf 비공개 자료/public/full/01`~`47`로 옮겼다
 * (공개된 곳에 올릴 폴더에는 미리보기만 둔다). 그 권의 폴더를 `public/full/`로 되돌려 놓은 뒤,
 * 컨펌이 난 권을 책 전체로 돌리려면 아래 `EXCEPTIONS`에 그 권을 'full'로 적으면 된다(`FULL_UNTIL`을 올리면 그 권까지 한꺼번에).
 */
export type ReadingMode = 'preview' | 'full'

/** 이 권까지는 책 전체다(0 = 책 전체로 보이는 권이 없다) */
const FULL_UNTIL = 0

/** 위의 규칙과 다르게 둘 권만 적는다(예: `17: 'full'`) */
const EXCEPTIONS: Readonly<Partial<Record<number, ReadingMode>>> = {}

export const readingMode: Readonly<Partial<Record<number, ReadingMode>>> = {
  ...Object.fromEntries(Array.from({ length: FULL_UNTIL }, (_, i) => [i + 1, 'full' as const])),
  ...EXCEPTIONS,
}
