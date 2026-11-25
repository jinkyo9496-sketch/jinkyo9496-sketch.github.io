// scripts/cutPrintPdf.py --full 이 만든다. 손으로 고치지 않는다.
// 책 전체를 담은 권(public/full/NN/p001.webp ~). pages: 쪽수, aspect: 한 쪽의 가로/세로. 1쪽(오른쪽 면)부터다
export interface FullBook {
  pages: number
  aspect: number
}

export const fullBooks: Readonly<Record<number, FullBook>> = {
  1: { pages: 280, aspect: 0.6808 },
  2: { pages: 356, aspect: 0.6808 },
  3: { pages: 236, aspect: 0.6808 },
  4: { pages: 304, aspect: 0.6808 },
  5: { pages: 316, aspect: 0.6808 },
  6: { pages: 276, aspect: 0.6808 },
  7: { pages: 360, aspect: 0.6808 },
  8: { pages: 328, aspect: 0.6808 },
  9: { pages: 272, aspect: 0.6808 },
  10: { pages: 312, aspect: 0.6808 },
  11: { pages: 280, aspect: 0.6808 },
  12: { pages: 260, aspect: 0.6808 },
  13: { pages: 320, aspect: 0.6808 },
  14: { pages: 296, aspect: 0.6808 },
  15: { pages: 300, aspect: 0.6808 },
  16: { pages: 352, aspect: 0.6808 },
  17: { pages: 340, aspect: 0.6808 },
  18: { pages: 276, aspect: 0.6808 },
  19: { pages: 316, aspect: 0.6808 },
  20: { pages: 248, aspect: 0.6808 },
  21: { pages: 236, aspect: 0.6808 },
  22: { pages: 268, aspect: 0.6808 },
  23: { pages: 264, aspect: 0.6808 },
  24: { pages: 268, aspect: 0.6808 },
  25: { pages: 252, aspect: 0.6808 },
  26: { pages: 240, aspect: 0.6808 },
  27: { pages: 240, aspect: 0.6808 },
  28: { pages: 216, aspect: 0.6808 },
  29: { pages: 212, aspect: 0.6808 },
  30: { pages: 216, aspect: 0.6808 },
  31: { pages: 304, aspect: 0.6808 },
  32: { pages: 212, aspect: 0.6808 },
  33: { pages: 204, aspect: 0.6808 },
  34: { pages: 206, aspect: 0.6808 },
  35: { pages: 204, aspect: 0.6808 },
  36: { pages: 240, aspect: 0.6808 },
  37: { pages: 256, aspect: 0.6808 },
  38: { pages: 240, aspect: 0.6808 },
  39: { pages: 264, aspect: 0.6808 },
  40: { pages: 234, aspect: 0.6808 },
  41: { pages: 254, aspect: 0.6808 },
  42: { pages: 254, aspect: 0.6808 },
  43: { pages: 198, aspect: 0.6808 },
  44: { pages: 358, aspect: 0.6808 },
  45: { pages: 230, aspect: 0.6808 },
  46: { pages: 222, aspect: 0.6808 },
  47: { pages: 294, aspect: 0.6808 },
}

export const fullPageSrc = (no: number, page: number) => `/full/${String(no).padStart(2, '0')}/p${String(page).padStart(3, '0')}.webp`
