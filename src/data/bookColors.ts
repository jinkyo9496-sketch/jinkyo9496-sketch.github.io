/**
 * 책마다의 대표색: 책 페이지(`#/book/N`)의 바탕색과 그 위의 글자색.
 * 앞표지 그림에서 한 번 뽑아 적어 둔 데이터다(`scripts/extractBookColors.ts`, 돌리는 법은 그 파일 머리말).
 * 손으로 고쳐도 된다: 권마다 한 줄.
 * - background: 표지의 바탕색(#rrggbb, 소문자). 화면 전체의 바탕이 된다
 * - text: 그 위의 글자·선·버튼 색. 'ink'(--ink) 또는 'paper'(--paper) 중 대비가 큰 쪽(본문 4.5:1 이상, 테스트가 확인한다)
 * - raw: 대비를 맞추려고 바탕색을 조금 조정한 권에만 적는, 표지에서 뽑은 원래 색
 */
import type { ReadableColor } from './colorMath'

export const bookColors: Readonly<Record<number, ReadableColor>> = {
  1: { background: '#f26660', text: 'ink' }, // 나는 매주 시체를 보러 간다
  2: { background: '#4044af', text: 'paper' }, // 크로스 사이언스
  3: { background: '#03b6b0', text: 'ink' }, // 이토록 아름다운 수학이라면
  4: { background: '#9c7ad0', text: 'ink' }, // 다시 태어난다면, 한국에서 살겠습니까
  5: { background: '#1eb4e6', text: 'ink' }, // 왜 칸트인가
  6: { background: '#fece29', text: 'ink' }, // 세상을 읽는 새로운 언어, 빅데이터
  7: { background: '#ff9450', text: 'ink' }, // 어둠을 뚫고 시가 내게로 왔다
  8: { background: '#ffe114', text: 'ink' }, // 한국 정치의 결정적 순간들
  9: { background: '#006cb7', text: 'paper' }, // 우리는 모두 별에서 왔다
  10: { background: '#007a61', text: 'paper' }, // 우리에게는 헌법이 있다
  11: { background: '#fc86a0', text: 'ink' }, // 위기의 지구, 물러설 곳 없는 인간
  12: { background: '#0093c7', text: 'ink' }, // 삼국시대, 진실과 반전의 역사
  13: { background: '#34d330', text: 'ink' }, // 불온한 것들의 미학
  14: { background: '#765ab1', text: 'paper' }, // 메이지유신을 설계한 최후의 사무라이들
  15: { background: '#ff595b', text: 'ink' }, // 이토록 매혹적인 고전이라면
  16: { background: '#ffc502', text: 'ink' }, // 1780년, 열하로 간 정조의 사신들
  17: { background: '#78664e', text: 'paper' }, // 건축, 모두의 미래를 짓다
  18: { background: '#0487a9', text: 'ink', raw: '#0085a8' }, // 사는 게 고통일 때, 쇼펜하우어
  19: { background: '#cda076', text: 'ink' }, // 음악이 멈춘 순간 진짜 음악이 시작된다
  20: { background: '#8f7f43', text: 'ink' }, // 그들은 로마를 만들었고, 로마는 역사가 되었다
  21: { background: '#f3aeca', text: 'ink' }, // 뇌를 읽다, 마음을 읽다
  22: { background: '#fe8667', text: 'ink' }, // AI는 차별을 인간에게서 배운다
  23: { background: '#fdce28', text: 'ink' }, // 기업은 누구의 것인가
  24: { background: '#434e7b', text: 'paper' }, // 참을 수 없이 불안할 때, 에리히 프롬
  25: { background: '#5063af', text: 'paper' }, // 기억하는 뇌, 망각하는 뇌
  26: { background: '#ff6f4a', text: 'ink' }, // 지속 불가능 대한민국
  27: { background: '#5862b9', text: 'paper' }, // SF, 시대정신이 되다
  28: { background: '#f3c393', text: 'ink' }, // 우리는 왜 타인의 욕망을 욕망하는가
  29: { background: '#00a4e3', text: 'ink' }, // 마지막 생존 코드, 디지털 트랜스포메이션
  30: { background: '#d939b3', text: 'ink' }, // 저, 감정적인 사람입니다
  31: { background: '#6bb7e8', text: 'ink' }, // 우리는 여전히 공룡시대에 산다
  32: { background: '#fddf85', text: 'ink' }, // 내 삶에 예술을 들일 때, 니체
  33: { background: '#00ada3', text: 'ink' }, // 동물이 만드는 지구 절반의 세계
  34: { background: '#f8b645', text: 'ink' }, // 6번째 대멸종 시그널, 식량 전쟁
  35: { background: '#f095ce', text: 'ink' }, // 매우 작은 세계에서 발견한 뜻밖의 생물학
  36: { background: '#ee7d65', text: 'ink' }, // 지배의 법칙
  37: { background: '#9578d2', text: 'ink' }, // 우리는 지구에 홀로 존재하지 않는다
  38: { background: '#00a8e6', text: 'ink' }, // 왜 늙을까, 왜 병들까, 왜 죽을까
  39: { background: '#019a69', text: 'ink' }, // 인간의 시대에 오신 것을 애도합니다
  40: { background: '#1b3c72', text: 'paper' }, // 수학이 내 인생에 말을 걸었다
  41: { background: '#038e63', text: 'ink', raw: '#018d62' }, // 벼랑 끝 민주주의를 경험한 나라
  42: { background: '#343633', text: 'paper' }, // 천문학이라는 위로
  43: { background: '#63a9dc', text: 'ink' }, // 일터를 뒤흔드는 신인류의 등장
  44: { background: '#da6123', text: 'ink' }, // 로마법, 인류 문명의 위대한 유산
  45: { background: '#01a068', text: 'ink' }, // 가난한 나라를 돕는 이유
  46: { background: '#ec6b43', text: 'ink' }, // 한비자, 권력의 법칙
  47: { background: '#dc6114', text: 'ink' }, // 외계인을 만나는 가장 확실한 방법
  48: { background: '#aaabaf', text: 'ink' }, // AI는 어떻게 생각하는가 (표지 바탕의 회색, 손으로 뽑음)
}

/** 책 페이지에 넣을 CSS 값: 바탕색과, 글자색 토큰(`var(--ink)` / `var(--paper)`). 없는 권이면 null */
export function pageColorsFor(no: number): { background: string; text: string } | null {
  const c = bookColors[no]
  return c ? { background: c.background, text: `var(--${c.text})` } : null
}
