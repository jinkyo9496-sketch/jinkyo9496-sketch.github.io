/**
 * 받은 그림(텍스처)을 그리기 전에 미리 GPU에 올리는 줄(three에 의존하지 않는다. 단위 테스트 `tests/warm.test.ts`).
 * three는 그림을 처음 그릴 때 GPU에 올린다(디코딩 + 밉맵). 화면 밖에서 받아 둔 책이 한꺼번에 화면으로 들어오면
 * (주소로 30권의 책 페이지에 바로 온 뒤 웰컴으로 올라갈 때: 1~18권이 한 번도 그려진 적이 없다) 그 프레임에 수십 장이
 * 올라가 움직임이 멈춘다. 그래서 받는 대로 한 프레임에 몇 장씩 미리 올려 둔다: 전환 도중에 올릴 것이 남지 않는다.
 */
export interface WarmQueue<T> {
  /** 올릴 그림을 넣는다(이미 넣었거나 올린 것은 건너뛴다) */
  add(texture: T): void
  /** 버린 그림: 기다리고 있었으면 빼고, 올렸다는 기록도 지운다(다시 받으면 다시 올린다) */
  forget(texture: T): void
  /** 더 올리지 않는다(장면을 버릴 때) */
  stop(): void
  /** 기다리는 그림의 수 */
  readonly size: number
}

export interface WarmOptions<T> {
  /** 그림 한 장을 GPU에 올린다 */
  upload: (texture: T) => void
  /** 한 프레임에 올리는 수 */
  perStep: number
  /** 다음 프레임에 부르게 한다(`requestAnimationFrame`) */
  schedule: (run: () => void) => void
}

export function createWarmQueue<T>({ upload, perStep, schedule }: WarmOptions<T>): WarmQueue<T> {
  const waiting: T[] = []
  const known = new Set<T>()
  let scheduled = false
  let stopped = false

  function step() {
    scheduled = false
    if (stopped) return
    for (let i = 0; i < perStep && waiting.length > 0; i++) upload(waiting.shift() as T)
    plan()
  }

  function plan() {
    if (scheduled || stopped || waiting.length === 0) return
    scheduled = true
    schedule(step)
  }

  return {
    add(texture) {
      if (stopped || known.has(texture)) return
      known.add(texture)
      waiting.push(texture)
      plan()
    },
    forget(texture) {
      if (!known.delete(texture)) return
      const at = waiting.indexOf(texture)
      if (at >= 0) waiting.splice(at, 1)
    },
    stop() {
      stopped = true
      waiting.length = 0
    },
    get size() {
      return waiting.length
    },
  }
}
