import { describe, expect, it, vi } from 'vitest'
import { createWarmQueue } from '../src/shelf3d/warm'

/** 다음 프레임을 손으로 넘기는 가짜 예약 */
const manual = () => {
  const pending: (() => void)[] = []
  return {
    schedule: (run: () => void) => void pending.push(run),
    /** 예약된 것을 한 번 돌린다. 돌린 것이 있으면 true */
    tick: () => {
      const run = pending.shift()
      run?.()
      return run !== undefined
    },
    get waiting() {
      return pending.length
    },
  }
}

describe('createWarmQueue: 받은 그림을 그리기 전에 미리, 조금씩 GPU에 올린다', () => {
  it('넣는 순간에는 올리지 않고, 다음 프레임부터 한 번에 정해진 수만큼만 올린다', () => {
    const frames = manual()
    const upload = vi.fn()
    const queue = createWarmQueue<string>({ upload, perStep: 2, schedule: frames.schedule })
    for (const t of ['a', 'b', 'c', 'd', 'e']) queue.add(t)
    expect(upload).not.toHaveBeenCalled()
    // 예약은 하나만 걸린다
    expect(frames.waiting).toBe(1)
    frames.tick()
    expect(upload.mock.calls.map(([t]) => t)).toEqual(['a', 'b'])
    frames.tick()
    expect(upload.mock.calls.map(([t]) => t)).toEqual(['a', 'b', 'c', 'd'])
    frames.tick()
    expect(upload.mock.calls.map(([t]) => t)).toEqual(['a', 'b', 'c', 'd', 'e'])
    // 다 올렸으면 더 예약하지 않는다
    expect(frames.tick()).toBe(false)
    expect(queue.size).toBe(0)
  })

  it('같은 그림은 한 번만 올린다(기다리는 중에 또 넣어도, 올린 뒤에 또 넣어도)', () => {
    const frames = manual()
    const upload = vi.fn()
    const texture = { id: 1 }
    const queue = createWarmQueue<object>({ upload, perStep: 4, schedule: frames.schedule })
    queue.add(texture)
    queue.add(texture)
    expect(queue.size).toBe(1)
    frames.tick()
    queue.add(texture)
    expect(frames.tick()).toBe(false)
    expect(upload).toHaveBeenCalledTimes(1)
  })

  it('비운 뒤에 넣으면 다시 예약한다', () => {
    const frames = manual()
    const upload = vi.fn()
    const queue = createWarmQueue<string>({ upload, perStep: 1, schedule: frames.schedule })
    queue.add('a')
    frames.tick()
    queue.add('b')
    expect(frames.waiting).toBe(1)
    frames.tick()
    expect(upload.mock.calls.map(([t]) => t)).toEqual(['a', 'b'])
  })

  it('버린 그림(forget)은 올리지 않고, 다시 받으면 다시 올린다', () => {
    const frames = manual()
    const upload = vi.fn()
    const a = { id: 'a' }
    const b = { id: 'b' }
    const queue = createWarmQueue<object>({ upload, perStep: 4, schedule: frames.schedule })
    queue.add(a)
    queue.add(b)
    queue.forget(a)
    frames.tick()
    expect(upload.mock.calls.map(([t]) => t)).toEqual([b])
    queue.add(a)
    frames.tick()
    expect(upload.mock.calls.map(([t]) => t)).toEqual([b, a])
  })

  it('멈춘 뒤(stop)에는 올리지 않는다', () => {
    const frames = manual()
    const upload = vi.fn()
    const queue = createWarmQueue<string>({ upload, perStep: 1, schedule: frames.schedule })
    queue.add('a')
    queue.add('b')
    frames.tick()
    queue.stop()
    frames.tick()
    queue.add('c')
    frames.tick()
    expect(upload.mock.calls.map(([t]) => t)).toEqual(['a'])
  })
})
