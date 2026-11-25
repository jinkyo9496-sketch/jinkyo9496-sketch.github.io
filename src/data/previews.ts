// scripts/downloadPreviews.py 가 만든다. 손으로 고치지 않는다.
// pages: 미리보기 쪽수(public/preview/NN/p01.jpg ~), first: 첫 그림이 오른쪽 면(recto)인가 왼쪽 면(verso)인가,
// aspect: 한 쪽의 가로/세로, flaps: 앞날개·뒷날개 그림의 가로/세로(flap-front.jpg, flap-back.jpg. 없으면 null),
// endpaper: 면지 색(본문에 쓰인 별색. 검정·흰색을 뺀 색). 찾지 못하면 null
export interface Preview {
  pages: number
  first: 'recto' | 'verso'
  aspect: number
  endpaper: string | null
  flaps: { front: number | null; back: number | null }
}

export const previews: Readonly<Record<number, Preview>> = {
  1: { pages: 30, first: 'recto', aspect: 0.6808, endpaper: '#ff685d', flaps: { front: 0.5318, back: 0.5318 } },
  2: { pages: 30, first: 'recto', aspect: 0.6808, endpaper: '#3b44ad', flaps: { front: 0.5318, back: 0.5318 } },
  3: { pages: 30, first: 'recto', aspect: 0.6808, endpaper: '#00b8b0', flaps: { front: 0.5318, back: 0.5318 } },
  4: { pages: 30, first: 'recto', aspect: 0.6808, endpaper: '#9c7ad1', flaps: { front: 0.5318, back: 0.5318 } },
  5: { pages: 30, first: 'recto', aspect: 0.6808, endpaper: '#0081c3', flaps: { front: 0.5318, back: 0.5318 } },
  6: { pages: 30, first: 'recto', aspect: 0.6808, endpaper: '#765ab1', flaps: { front: 0.5318, back: 0.5318 } },
  7: { pages: 30, first: 'recto', aspect: 0.6808, endpaper: '#3d5488', flaps: { front: 0.5318, back: 0.5318 } },
  8: { pages: 30, first: 'recto', aspect: 0.6808, endpaper: '#b08f70', flaps: { front: 0.5318, back: 0.5318 } },
  9: { pages: 30, first: 'recto', aspect: 0.6808, endpaper: '#0b76bc', flaps: { front: 0.5318, back: 0.5318 } },
  10: { pages: 30, first: 'recto', aspect: 0.6808, endpaper: '#207c6f', flaps: { front: 0.5318, back: 0.5318 } },
  11: { pages: 30, first: 'recto', aspect: 0.6808, endpaper: '#6290e6', flaps: { front: 0.5318, back: 0.5318 } },
  12: { pages: 30, first: 'recto', aspect: 0.6808, endpaper: '#008fb7', flaps: { front: 0.5318, back: 0.5318 } },
  13: { pages: 30, first: 'recto', aspect: 0.6808, endpaper: '#50c88b', flaps: { front: 0.5318, back: 0.5318 } },
  14: { pages: 30, first: 'recto', aspect: 0.6808, endpaper: '#765ab1', flaps: { front: 0.5318, back: 0.5318 } },
  15: { pages: 30, first: 'recto', aspect: 0.6808, endpaper: '#d35055', flaps: { front: 0.5318, back: 0.5318 } },
  16: { pages: 30, first: 'recto', aspect: 0.6808, endpaper: '#629167', flaps: { front: 0.5318, back: 0.5318 } },
  17: { pages: 30, first: 'recto', aspect: 0.6808, endpaper: '#a7877a', flaps: { front: 0.5318, back: 0.5318 } },
  18: { pages: 30, first: 'recto', aspect: 0.6808, endpaper: '#6359b0', flaps: { front: 0.5318, back: 0.5318 } },
  19: { pages: 30, first: 'recto', aspect: 0.6808, endpaper: '#4d6a88', flaps: { front: 0.5318, back: 0.5318 } },
  20: { pages: 30, first: 'recto', aspect: 0.6808, endpaper: '#8f9044', flaps: { front: 0.5318, back: 0.5318 } },
  21: { pages: 30, first: 'recto', aspect: 0.6808, endpaper: '#5279a4', flaps: { front: 0.5318, back: 0.5318 } },
  22: { pages: 30, first: 'recto', aspect: 0.6808, endpaper: '#6dc82b', flaps: { front: 0.5318, back: 0.5318 } },
  23: { pages: 30, first: 'recto', aspect: 0.6808, endpaper: '#f19d21', flaps: { front: 0.5318, back: 0.5318 } },
  24: { pages: 30, first: 'recto', aspect: 0.6808, endpaper: '#6359b0', flaps: { front: 0.5318, back: 0.5318 } },
  25: { pages: 30, first: 'recto', aspect: 0.6808, endpaper: '#d257b1', flaps: { front: 0.5318, back: 0.5318 } },
  26: { pages: 30, first: 'recto', aspect: 0.6808, endpaper: null, flaps: { front: 0.5318, back: 0.5318 } },
  27: { pages: 30, first: 'recto', aspect: 0.6808, endpaper: null, flaps: { front: 0.5318, back: 0.5318 } },
  28: { pages: 30, first: 'recto', aspect: 0.6808, endpaper: null, flaps: { front: 0.5318, back: 0.5318 } },
  29: { pages: 30, first: 'recto', aspect: 0.6808, endpaper: '#019cdc', flaps: { front: 0.5318, back: 0.5318 } },
  30: { pages: 30, first: 'recto', aspect: 0.6808, endpaper: '#ff893f', flaps: { front: 0.5318, back: 0.5318 } },
  31: { pages: 30, first: 'recto', aspect: 0.6808, endpaper: '#12af6c', flaps: { front: 0.5318, back: 0.5318 } },
  32: { pages: 30, first: 'recto', aspect: 0.6808, endpaper: '#009c77', flaps: { front: 0.5318, back: 0.5318 } },
  33: { pages: 30, first: 'recto', aspect: 0.6808, endpaper: '#ea4e97', flaps: { front: 0.5318, back: 0.5318 } },
  34: { pages: 30, first: 'recto', aspect: 0.6808, endpaper: '#ae7c57', flaps: { front: 0.5318, back: 0.5318 } },
  35: { pages: 30, first: 'recto', aspect: 0.6808, endpaper: '#19ad89', flaps: { front: 0.5318, back: 0.5318 } },
  36: { pages: 30, first: 'recto', aspect: 0.6808, endpaper: '#7f7659', flaps: { front: 0.5318, back: 0.5318 } },
  37: { pages: 30, first: 'recto', aspect: 0.6808, endpaper: '#6e7ad0', flaps: { front: 0.5318, back: 0.5318 } },
  38: { pages: 30, first: 'recto', aspect: 0.6808, endpaper: '#00adef', flaps: { front: 0.5318, back: 0.5318 } },
  39: { pages: 30, first: 'recto', aspect: 0.6808, endpaper: '#00adef', flaps: { front: 0.5318, back: 0.5318 } },
  40: { pages: 30, first: 'recto', aspect: 0.6808, endpaper: '#4784c5', flaps: { front: 0.5318, back: 0.5318 } },
  41: { pages: 30, first: 'recto', aspect: 0.6808, endpaper: '#00a465', flaps: { front: 0.5318, back: 0.5318 } },
  42: { pages: 30, first: 'recto', aspect: 0.6808, endpaper: '#3e65b0', flaps: { front: 0.5318, back: 0.5318 } },
  43: { pages: 30, first: 'recto', aspect: 0.6808, endpaper: '#aa86b6', flaps: { front: 0.5318, back: 0.5318 } },
  44: { pages: 30, first: 'recto', aspect: 0.6808, endpaper: '#875f3b', flaps: { front: 0.5318, back: 0.5318 } },
  45: { pages: 30, first: 'recto', aspect: 0.6808, endpaper: '#47b47a', flaps: { front: 0.5318, back: 0.5318 } },
  46: { pages: 30, first: 'recto', aspect: 0.6808, endpaper: '#fe854e', flaps: { front: 0.5318, back: 0.5318 } },
  47: { pages: 30, first: 'recto', aspect: 0.6808, endpaper: '#ed5b4e', flaps: { front: 0.5318, back: 0.5318 } },
  48: { pages: 30, first: 'recto', aspect: 0.6808, endpaper: '#5d9765', flaps: { front: 0.5318, back: 0.5318 } },
}

export const previewPageSrc = (no: number, page: number) =>
  `/preview/${String(no).padStart(2, '0')}/p${String(page).padStart(2, '0')}.jpg`

export const flapSrc = (no: number, side: 'front' | 'back') =>
  `/preview/${String(no).padStart(2, '0')}/flap-${side}.jpg`
