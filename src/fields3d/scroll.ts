/**
 * 학제별 분류의 책 줄을 끌어 넘기는 움직임의 순수 계산(three·DOM 없음, 단위 테스트 `tests/fieldsScroll.test.ts`).
 * 길이는 CSS px, 시간은 ms, 속도는 px/ms. 스크롤 값은 "줄이 왼쪽으로 밀린 길이"이고 범위는 0 ~ max
 * (`motion.ts`의 `scrollRange` × `FieldsView.pxPerUnit`. 세 권 이하는 max = 0).
 */

export const FIELDS_SCROLL = {
  /** 관성: 손을 뗀 뒤 속도가 1/e로 줄어드는 시간. 흐르는 거리는 뗄 때의 속도 × 이 값이다 */
  decayMs: 325,
  /** 이보다 느려지면 멈춘 것으로 본다 */
  stopSpeed: 0.01,
  /** 손을 뗄 때의 속도 상한 */
  maxSpeed: 3,
  /** 손을 뗄 때의 속도를 재는 구간: 마지막 이만큼의 움직임만 본다(끌다가 멈췄다 떼면 흐르지 않는다) */
  velocityWindowMs: 100,
  /** 끝 너머로 끌 때 줄이 따라가는 한도. 아무리 끌어도 이만큼은 넘지 않는다 */
  overscrollPx: 96,
  /** 끝 너머에서의 저항: 처음에는 손이 간 길이의 이 비율만큼 따라가고 갈수록 덜 간다 */
  resistance: 0.55,
  /** 흐르다 끝에 닿을 때의 속도 상한: 끝을 지나치는 길이가 약 edgeSpeed / (spring × e) = 16px이다 */
  edgeSpeed: 0.6,
  /** 끝으로 되돌아오거나 목표 자리로 갈 때의 스프링(임계 감쇠)의 세기(1/ms). 6 / spring ≈ 430ms에 자리 잡는다 */
  spring: 0.014,
  /** 이만큼 가까워지면 목표에 닿은 것으로 본다 */
  restPx: 0.5,
  /** 포커스가 간 책을 보이게 할 때 화면 끝과 책 사이에 두는 여백 */
  revealMarginPx: 24,
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/**
 * 끄는 동안의 자리: 범위 안에서는 손을 그대로 따라가고, 끝을 넘으면 저항하며 덜 간다
 * (넘은 길이 x에 대해 d × (1 − 1 / (x × c / d + 1)). d = 한도, c = 저항).
 */
export function rubberBand(raw: number, max: number, limit = FIELDS_SCROLL.overscrollPx) {
  if (raw >= 0 && raw <= max) return raw
  const over = raw < 0 ? -raw : raw - max
  const give = limit * (1 - 1 / ((over * FIELDS_SCROLL.resistance) / limit + 1))
  return raw < 0 ? -give : max + give
}

/** 포인터가 지나간 자리(t = 시각 ms, x = 화면의 가로 자리) */
export interface PointerSample {
  t: number
  x: number
}

/**
 * 손을 뗄 때의 스크롤 속도(px/ms). 마지막 `velocityWindowMs` 동안의 움직임으로 잰다.
 * 손이 왼쪽으로 가면 줄은 앞으로 간다(+).
 */
export function releaseVelocity(samples: readonly PointerSample[], now: number) {
  const S = FIELDS_SCROLL
  const recent = samples.filter((s) => now - s.t <= S.velocityWindowMs)
  if (recent.length < 2) return 0
  const first = recent[0]
  const last = recent[recent.length - 1]
  const dt = last.t - first.t
  if (dt <= 0) return 0
  return clamp(-(last.x - first.x) / dt, -S.maxSpeed, S.maxSpeed)
}

/** 줄의 움직임: 자리, 속도, 가고 있는 목표(없으면 관성으로 흐른다) */
export interface ScrollMotion {
  pos: number
  vel: number
  target: number | null
}

/** 아직 움직일 것이 남았는가: 목표로 가는 중이거나, 흐르는 중이거나, 끝 너머에 놓여 있다(되돌아와야 한다) */
export const scrollMoving = (m: ScrollMotion, max: number) => m.target !== null || m.vel !== 0 || m.pos < 0 || m.pos > max

/**
 * dt(ms)만큼 보낸 뒤의 움직임.
 * - 목표가 없으면 관성: 속도가 지수로 줄며 흐르다 멈춘다. 끝을 넘으면 그 끝이 목표가 된다(속도는 `edgeSpeed`로 자른다).
 * - 목표가 있으면 임계 감쇠 스프링으로 그 자리에 가서 정확히 멈춘다(지나쳤다 되돌아오지 않는다. 다만 속도를 지닌 채
 *   끝에 닿았으면 그 속도만큼만 살짝 넘는다).
 */
export function stepScroll(m: ScrollMotion, dt: number, max: number): ScrollMotion {
  const S = FIELDS_SCROLL
  if (m.target === null) {
    // 끝 너머에 있다(저항을 이기고 끌어 둔 자리에서 놓았다): 끝으로 되돌아온다. 바깥쪽으로 던진 속도는 버린다.
    // 안쪽으로 던졌으면 붙들지 않고 그대로 흘려보낸다
    const inward = m.pos < 0 ? m.vel > S.stopSpeed : m.pos > max ? m.vel < -S.stopSpeed : false
    if ((m.pos < 0 || m.pos > max) && !inward) return stepScroll({ pos: m.pos, vel: 0, target: clamp(m.pos, 0, max) }, dt, max)
    if (m.vel === 0) return m
    const keep = Math.exp(-dt / S.decayMs)
    const pos = m.pos + m.vel * S.decayMs * (1 - keep)
    const vel = m.vel * keep
    // 범위 안에서 흐르다 끝을 넘었다: 그 끝이 목표가 된다
    const crossed = (m.pos >= 0 && pos < 0) || (m.pos <= max && pos > max)
    if (crossed) return { pos, vel: clamp(vel, -S.edgeSpeed, S.edgeSpeed), target: clamp(pos, 0, max) }
    return { pos, vel: Math.abs(vel) < S.stopSpeed ? 0 : vel, target: null }
  }
  const w = S.spring
  const x = m.pos - m.target
  const lead = m.vel + w * x
  const decay = Math.exp(-w * dt)
  const nx = (x + lead * dt) * decay
  const nv = (m.vel - w * lead * dt) * decay
  if (Math.abs(nx) < S.restPx && Math.abs(nv) < S.stopSpeed) return { pos: m.target, vel: 0, target: null }
  return { pos: m.target + nx, vel: nv, target: m.target }
}

/**
 * ←/→로 한 권 넘길 때의 목표: 지금 자리에서 다음(direction 1) 또는 이전(−1) 책이 맨 앞에 오는 자리.
 * stops는 책마다 멈출 자리(`motion.ts`의 `scrollStops`). 더 갈 곳이 없으면 끝에서 멈춘다.
 */
export function stepTarget(scroll: number, direction: 1 | -1, stops: readonly number[], max: number) {
  const here = clamp(scroll, 0, max)
  const slack = 1
  if (direction > 0) {
    const next = stops.find((stop) => stop > here + slack)
    return clamp(next ?? max, 0, max)
  }
  let prev = 0
  for (const stop of stops) if (stop < here - slack) prev = Math.max(prev, stop)
  return clamp(prev, 0, max)
}

/**
 * 가려진 책(화면에서의 왼쪽 끝 left, 폭 width)이 다 보이게 하는 스크롤. 이미 보이면 그대로다.
 * viewWidth는 책 자리의 폭. 화면 끝과 책 사이에 `revealMarginPx`를 둔다.
 */
export function revealScroll(scroll: number, box: { left: number; width: number }, viewWidth: number, max: number) {
  const margin = FIELDS_SCROLL.revealMarginPx
  const right = box.left + box.width
  if (right > viewWidth) return clamp(scroll + right + margin - viewWidth, 0, max)
  if (box.left < 0) return clamp(scroll + box.left - margin, 0, max)
  return clamp(scroll, 0, max)
}
