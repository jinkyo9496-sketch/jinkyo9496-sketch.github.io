import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { stepIndex, useShelfNavigation } from '../src/shelf/useShelfNavigation'

describe('stepIndex', () => {
  it('moves one book with next/prev', () => {
    expect(stepIndex(5, { type: 'next' }, 47)).toBe(6)
    expect(stepIndex(5, { type: 'prev' }, 47)).toBe(4)
  })

  it('jumps with first/last/goTo', () => {
    expect(stepIndex(5, { type: 'first' }, 47)).toBe(0)
    expect(stepIndex(5, { type: 'last' }, 47)).toBe(46)
    expect(stepIndex(5, { type: 'goTo', index: 20 }, 47)).toBe(20)
  })

  it('clamps at both ends without wrapping', () => {
    expect(stepIndex(46, { type: 'next' }, 47)).toBe(46)
    expect(stepIndex(0, { type: 'prev' }, 47)).toBe(0)
    expect(stepIndex(5, { type: 'goTo', index: 99 }, 47)).toBe(46)
    expect(stepIndex(5, { type: 'goTo', index: -4 }, 47)).toBe(0)
    expect(stepIndex(5, { type: 'goTo', index: 3.6 }, 47)).toBe(4)
  })

  it('stays at 0 for an empty shelf', () => {
    expect(stepIndex(0, { type: 'next' }, 0)).toBe(0)
    expect(stepIndex(0, { type: 'last' }, 0)).toBe(0)
  })
})

describe('useShelfNavigation', () => {
  it('starts at book 1 by default, or at a clamped initial index', () => {
    expect(renderHook(() => useShelfNavigation(47)).result.current.index).toBe(0)
    expect(renderHook(() => useShelfNavigation(47, 3)).result.current.index).toBe(3)
    expect(renderHook(() => useShelfNavigation(47, 300)).result.current.index).toBe(46)
  })

  it('exposes next, prev, goTo, first, last', () => {
    const { result } = renderHook(() => useShelfNavigation(47, 46))
    act(() => result.current.prev())
    expect(result.current.index).toBe(45)
    act(() => result.current.next())
    act(() => result.current.next())
    expect(result.current.index).toBe(46)
    act(() => result.current.first())
    expect(result.current.index).toBe(0)
    act(() => result.current.prev())
    expect(result.current.index).toBe(0)
    act(() => result.current.goTo(41))
    expect(result.current.index).toBe(41)
    act(() => result.current.last())
    expect(result.current.index).toBe(46)
  })
})
