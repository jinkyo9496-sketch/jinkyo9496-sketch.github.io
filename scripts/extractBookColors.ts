/**
 * 앞표지 그림에서 책마다의 대표색(책 페이지의 바탕색)을 뽑아 `src/data/bookColors.ts`의 내용을 만든다.
 * 새 패키지 없이 브라우저의 canvas로 계산한다. 표지가 바뀌면 다시 돌린다.
 *
 * 쓰는 법(개발 서버가 떠 있는 탭의 콘솔에서):
 *   const m = await import('/scripts/extractBookColors.ts')
 *   copy(await m.run())      // 결과(파일 전체)를 클립보드로 → src/data/bookColors.ts에 붙여 넣는다
 *   await m.sheet()          // 전 권의 표지와 뽑힌 색을 한 화면에 늘어놓아 눈으로 확인한다(다시 부르면 닫힌다. 신간만: m.sheet(48, 48))
 * 손으로 고친 값(`OVERRIDES`)은 다시 돌려도 유지된다. 대비(4.5:1)는 여기서 맞춘다(`ensureReadable`).
 *
 * 방법: 표지는 단색 바탕의 일러스트 + 위쪽의 흰 제목 상자다. 그림을 작게 줄여 픽셀을 색 칸(채널당 16단계)으로
 * 모으고, 흰색·검정·회색을 빼고 채도와 넓이(가장자리는 두 배)로 무게를 매겨 가장 무거운 칸의 평균색을 고른다.
 * 색이 거의 없는 표지(검정·회색·흰색)는 가장 넓은 무채색을 그대로 쓴다.
 */
import { books } from '../src/data/books'
import { ensureReadable, rgbToHex, textOn, type ReadableColor, type Rgb } from '../src/data/colorMath'

/** 눈으로 보고 고친 값(자동으로 뽑은 색이 바탕이 아니라 그림의 색이었던 권). 키는 권 번호 */
export const OVERRIDES: Record<number, string> = {}

const W = 100
const BINS = 16
/** 이보다 채도가 낮으면 무채색으로 본다 */
const MIN_SATURATION = 0.2
/** 색 있는 픽셀이 이 비율보다 적으면 무채색 표지로 본다 */
const MIN_COLOURED = 0.12

async function pixelsOf(src: string) {
  const img = new Image()
  img.src = src
  await img.decode()
  const h = Math.round((W * img.naturalHeight) / img.naturalWidth)
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0, W, h)
  return { data: ctx.getImageData(0, 0, W, h).data, h }
}

interface Bin {
  weight: number
  count: number
  sum: Rgb
}

export async function keyColourOf(src: string): Promise<{ hex: string; neutral: boolean }> {
  const { data, h } = await pixelsOf(src)
  const coloured = new Map<number, Bin>()
  const neutral = new Map<number, Bin>()
  let colouredCount = 0
  const add = (map: Map<number, Bin>, key: number, weight: number, rgb: Rgb) => {
    const bin = map.get(key) ?? { weight: 0, count: 0, sum: [0, 0, 0] }
    bin.weight += weight
    bin.count++
    bin.sum[0] += rgb[0]
    bin.sum[1] += rgb[1]
    bin.sum[2] += rgb[2]
    map.set(key, bin)
  }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4
      const rgb: Rgb = [data[i], data[i + 1], data[i + 2]]
      const max = Math.max(...rgb)
      const min = Math.min(...rgb)
      const saturation = max === 0 ? 0 : (max - min) / max
      const value = max / 255
      const key = ((rgb[0] * BINS) >> 8) * BINS * BINS + ((rgb[1] * BINS) >> 8) * BINS + ((rgb[2] * BINS) >> 8)
      // 가장자리(바깥 12%)는 바탕일 가능성이 높다
      const edge = x < W * 0.12 || x >= W * 0.88 || y < h * 0.08 || y >= h * 0.92 ? 2 : 1
      if (saturation >= MIN_SATURATION && value >= 0.18) {
        colouredCount++
        add(coloured, key, edge * (0.4 + saturation), rgb)
      } else {
        add(neutral, key, edge, rgb)
      }
    }
  const isNeutral = colouredCount / (W * h) < MIN_COLOURED
  const best = [...(isNeutral ? neutral : coloured).values()].sort((a, b) => b.weight - a.weight)[0]
  return { hex: rgbToHex([best.sum[0] / best.count, best.sum[1] / best.count, best.sum[2] / best.count]), neutral: isNeutral }
}

export async function extract(): Promise<{ no: number; title: string; auto: string; color: ReadableColor; neutral: boolean }[]> {
  const out = []
  for (const book of books) {
    const { hex, neutral } = await keyColourOf(book.images.front)
    const color = ensureReadable(OVERRIDES[book.no] ?? hex)
    out.push({ no: book.no, title: book.title, auto: hex, color, neutral })
  }
  return out
}

/** `src/data/bookColors.ts`에 넣을 줄들(권마다 한 줄) */
export async function run() {
  const rows = await extract()
  return rows
    .map(({ no, title, color }) => {
      const raw = color.raw ? `, raw: '${color.raw}'` : ''
      return `  ${no}: { background: '${color.background}', text: '${color.text}'${raw} }, // ${title}`
    })
    .join('\n')
}

/** 확인용: 표지와 뽑힌 색을 한 화면에 늘어놓는다. 다시 부르면 닫는다 */
export async function sheet(from = 1, to = books.length) {
  const old = document.getElementById('colour-sheet')
  if (old) return old.remove()
  const rows = await extract()
  const root = document.createElement('div')
  root.id = 'colour-sheet'
  root.style.cssText = 'position:fixed;inset:0;z-index:9999;overflow:auto;display:grid;grid-template-columns:repeat(8,1fr);gap:6px;padding:6px;background:#888;font:11px/1.2 sans-serif'
  for (const { no, auto, color } of rows.filter((r) => r.no >= from && r.no <= to)) {
    const cell = document.createElement('div')
    const fg = color.text === 'ink' ? '#111111' : '#fcfcfb'
    cell.style.cssText = `display:flex;gap:6px;align-items:center;padding:8px;background:${color.background};color:${fg}`
    cell.innerHTML = `<img src="${books[no - 1].images.front}" style="height:118px;box-shadow:0 4px 10px rgba(0,0,0,.35)"><span>${no}<br>${color.background}<br>${color.text} ${textOn(color.background).ratio.toFixed(1)}${color.raw ? `<br>raw ${color.raw}` : ''}${OVERRIDES[no] ? `<br>auto ${auto}` : ''}</span>`
    root.append(cell)
  }
  document.body.append(root)
}
