import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../src/App'
import { computeShelfLayout, type LayoutBook } from '../src/shelf/layout'

const mk = (spineAspect: number, coverAspect = 0.68): LayoutBook => ({ spineAspect, coverAspect })
const sample: LayoutBook[] = [mk(0.1), mk(0.08), mk(0.09, 0.7), mk(0.12), mk(0.07)]
const left = (s: { x: number; faceWidth: number }) => s.x - s.faceWidth / 2
const right = (s: { x: number; faceWidth: number }) => s.x + s.faceWidth / 2

describe('computeShelfLayout closed (gliding past books)', () => {
  const slots = computeShelfLayout(sample, 2, { bookHeight: 600, gap: 10, currentGap: 40, closed: true })

  it('keeps every book spine-out, the centre one included', () => {
    expect(slots.every((s) => s.rotateY === 90 && !s.isCurrent)).toBe(true)
    expect(slots[2].x).toBe(0)
    expect(slots[2].faceWidth).toBeCloseTo(600 * 0.09)
  })

  it('packs the books with the plain gap only, no extra room round the centre', () => {
    for (let i = 1; i < slots.length; i++) {
      expect(left(slots[i]) - right(slots[i - 1])).toBeCloseTo(10)
    }
  })
})

describe('Holding an arrow key', () => {
  const T0 = 1_000_000
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(T0)
  })
  afterEach(() => vi.useRealTimers())

  const shelf = () => screen.getByRole('region', { name: '서가명강 서가', hidden: true })
  const stage = () => document.querySelector<HTMLElement>('.stage')!
  const open = () => [...shelf().querySelectorAll('[data-testid="book"][data-current="true"]')]
  const currentNo = () => {
    const current = within(shelf()).getAllByRole('button', { current: true, hidden: true })
    expect(current).toHaveLength(1)
    return Number(current[0].closest('[data-testid="book"]')!.getAttribute('data-no'))
  }
  const hold = (key: string, at: number) => {
    vi.setSystemTime(T0 + at)
    fireEvent.keyDown(window, { key, repeat: true })
  }
  const start = () => render(<App initial={{ screen: 'shelf', index: 9 }} />)

  it('a single press opens each book as before', () => {
    start()
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(currentNo()).toBe(11)
    expect(open()).toHaveLength(1)
    expect(stage()).not.toHaveAttribute('data-gliding')
  })

  it('glides past the books without turning each one to its cover', () => {
    start()
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    hold('ArrowRight', 500)
    expect(stage()).toHaveAttribute('data-gliding')
    expect(open()).toHaveLength(0)
    hold('ArrowRight', 600)
    hold('ArrowRight', 700)
    expect(currentNo()).toBe(14)
    expect(open()).toHaveLength(0)
  })

  it('steps no faster than once every 90ms while held', () => {
    start()
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    hold('ArrowRight', 500)
    hold('ArrowRight', 530)
    hold('ArrowRight', 560)
    hold('ArrowRight', 590)
    expect(currentNo()).toBe(13)
  })

  it('opens the book it stopped on when the key is released', () => {
    start()
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    hold('ArrowLeft', 500)
    hold('ArrowLeft', 600)
    fireEvent.keyUp(window, { key: 'ArrowLeft' })
    expect(stage()).not.toHaveAttribute('data-gliding')
    expect(currentNo()).toBe(7)
    expect(open()).toHaveLength(1)
  })

  it('also stops gliding when the repeats simply stop coming', () => {
    start()
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    hold('ArrowRight', 500)
    act(() => {
      vi.advanceTimersByTime(250)
    })
    expect(stage()).not.toHaveAttribute('data-gliding')
    expect(open()).toHaveLength(1)
  })
})

describe('The wheel on the shelf', () => {
  const T0 = 2_000_000
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(T0)
  })
  afterEach(() => vi.useRealTimers())

  const shelf = () => screen.getByRole('region', { name: '서가명강 서가', hidden: true })
  const stage = () => document.querySelector<HTMLElement>('.stage')!
  const currentNo = () =>
    Number(
      within(shelf())
        .getByRole('button', { current: true, hidden: true })
        .closest('[data-testid="book"]')!
        .getAttribute('data-no'),
    )
  const wheel = (deltaY: number, at: number) => {
    vi.setSystemTime(T0 + at)
    fireEvent.wheel(document.querySelector('.app')!, { deltaY })
  }

  it('does not step or glide past books any more: it changes the screen', () => {
    render(<App initial={{ screen: 'shelf', index: 9 }} />)
    for (let i = 0; i < 6; i++) wheel(40, i * 100)
    expect(currentNo()).toBe(10)
    expect(stage()).not.toHaveAttribute('data-gliding')
    expect(stage().style.getPropertyValue('--dur-shelf')).toBe('')
    expect(document.querySelector('.screens')).toHaveAttribute('data-screen', 'fields')
  })

  it('needs 40px before it counts as a turn of the wheel', () => {
    render(<App initial={{ screen: 'shelf', index: 9 }} />)
    wheel(20, 0)
    expect(document.querySelector('.screens')).toHaveAttribute('data-screen', 'shelf')
    wheel(25, 100)
    expect(document.querySelector('.screens')).toHaveAttribute('data-screen', 'fields')
  })
})

describe('Stopping after a glide', () => {
  const T0 = 3_000_000
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(T0)
  })
  afterEach(() => vi.useRealTimers())

  const stage = () => document.querySelector<HTMLElement>('.stage')!
  const hold = (at: number) => {
    vi.setSystemTime(T0 + at)
    fireEvent.keyDown(window, { key: 'ArrowRight', repeat: true })
  }
  /** →를 누르고 있다가 뗀다 */
  const glideAndStop = () => {
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    hold(500)
    hold(600)
    fireEvent.keyUp(window, { key: 'ArrowRight' })
  }

  it('brings the book it stopped on out more slowly than a single step, then returns to normal', () => {
    render(<App initial={{ screen: 'shelf', index: 9 }} />)
    glideAndStop()
    expect(stage()).not.toHaveAttribute('data-gliding')
    expect(stage()).toHaveAttribute('data-settling')
    expect(stage().style.getPropertyValue('--dur-shelf')).toBe('900ms')
    act(() => {
      vi.advanceTimersByTime(1400)
    })
    expect(stage()).not.toHaveAttribute('data-settling')
    expect(stage().style.getPropertyValue('--dur-shelf')).toBe('')
  })

  it('glides at a fixed pace while the key is held', () => {
    render(<App initial={{ screen: 'shelf', index: 9 }} />)
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    hold(500)
    expect(stage()).toHaveAttribute('data-gliding')
    expect(stage().style.getPropertyValue('--dur-shelf')).toBe('200ms')
  })

  it('a single step is not slowed', () => {
    render(<App initial={{ screen: 'shelf', index: 9 }} />)
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    fireEvent.keyUp(window, { key: 'ArrowRight' })
    expect(stage()).not.toHaveAttribute('data-settling')
    expect(stage().style.getPropertyValue('--dur-shelf')).toBe('')
  })

  it('a new step while the book is coming out cancels the slow speed', () => {
    render(<App initial={{ screen: 'shelf', index: 9 }} />)
    glideAndStop()
    expect(stage()).toHaveAttribute('data-settling')
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(stage()).not.toHaveAttribute('data-settling')
  })

  it('holding ↑ or ↓ does not start a glide', () => {
    render(<App initial={{ screen: 'fields', index: 9 }} />)
    fireEvent.keyDown(window, { key: 'ArrowUp' })
    vi.setSystemTime(T0 + 900)
    fireEvent.keyDown(window, { key: 'ArrowUp', repeat: true })
    expect(document.querySelector('.screens')).toHaveAttribute('data-screen', 'shelf')
    expect(stage()).not.toHaveAttribute('data-gliding')
  })
})
