/**
 * 색 계산(순수 함수): hex ↔ rgb, WCAG 상대 휘도·대비, 바탕색 위에 먹/종이 중 어느 글자색을 쓸지.
 * 책의 대표색(`bookColors.ts`)을 만들 때(`scripts/extractBookColors.ts`)와 그 검증(테스트)에 쓴다.
 */

/** 디자인 토큰 `--ink`, `--paper`와 같은 값(`src/index.css`). 대비 계산에만 쓴다 */
export const INK = '#111111'
export const PAPER = '#fcfcfb'
/** 본문 글자의 최소 대비(WCAG AA) */
export const MIN_CONTRAST = 4.5

export type Rgb = [number, number, number]
export type TextTone = 'ink' | 'paper'

export function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

const byte = (v: number) => Math.min(255, Math.max(0, Math.round(v)))

export function rgbToHex(rgb: Rgb | readonly number[]): string {
  return `#${[rgb[0], rgb[1], rgb[2]].map((v) => byte(v).toString(16).padStart(2, '0')).join('')}`
}

const linear = (v: number) => {
  const s = v / 255
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

/** WCAG 상대 휘도(0~1) */
export function relativeLuminance(hex: string) {
  const [r, g, b] = hexToRgb(hex)
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
}

/** WCAG 대비(1~21). 순서는 상관없다 */
export function contrastRatio(a: string, b: string) {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** 이 바탕색 위에서 먹과 종이 중 대비가 더 큰 글자색과 그 대비 */
export function textOn(background: string): { text: TextTone; ratio: number } {
  const ink = contrastRatio(background, INK)
  const paper = contrastRatio(background, PAPER)
  return ink >= paper ? { text: 'ink', ratio: ink } : { text: 'paper', ratio: paper }
}

export interface ReadableColor {
  background: string
  text: TextTone
  /** 대비를 맞추려고 바탕색을 조정했다면, 표지에서 뽑은 원래 색 */
  raw?: string
}

/**
 * 글자가 4.5:1 이상으로 읽히는 바탕색으로 만든다. 먹이나 종이 중 하나가 이미 닿으면 그대로 두고,
 * 둘 다 못 미치는 가운데 밝기의 색이면 가까운 쪽으로 한 단계씩(채널당 1/255) 밝히거나 어둡게 한다.
 */
export function ensureReadable(raw: string): ReadableColor {
  const first = textOn(raw)
  if (first.ratio >= MIN_CONTRAST) return { background: raw, text: first.text }
  // 먹 글자가 낫다면 바탕을 밝히고, 종이 글자가 낫다면 어둡게 한다. 색상은 유지한다(같은 비율로)
  const [r, g, b] = hexToRgb(raw)
  const lighten = first.text === 'ink'
  for (let step = 1; step <= 255; step++) {
    const k = step / 255
    const next: Rgb = lighten ? [r + (255 - r) * k, g + (255 - g) * k, b + (255 - b) * k] : [r * (1 - k), g * (1 - k), b * (1 - k)]
    const background = rgbToHex(next)
    const tone = lighten ? INK : PAPER
    if (contrastRatio(background, tone) >= MIN_CONTRAST) return { background, text: first.text, raw }
  }
  return { background: lighten ? '#ffffff' : '#000000', text: first.text, raw }
}
