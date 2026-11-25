import { useMemo, useReducer } from 'react'

export type NavAction =
  | { type: 'next' }
  | { type: 'prev' }
  | { type: 'first' }
  | { type: 'last' }
  | { type: 'goTo'; index: number }

const clampIndex = (i: number, count: number) =>
  Math.min(Math.max(count - 1, 0), Math.max(0, Math.round(i)))

/** 현재 index에 동작을 적용한 다음 index. 양 끝(0, count-1)에서 멈추고 돌아가지 않는다. */
export function stepIndex(index: number, action: NavAction, count: number): number {
  switch (action.type) {
    case 'next':
      return clampIndex(index + 1, count)
    case 'prev':
      return clampIndex(index - 1, count)
    case 'first':
      return 0
    case 'last':
      return clampIndex(count - 1, count)
    case 'goTo':
      return clampIndex(action.index, count)
  }
}

export interface ShelfNavigation {
  index: number
  next: () => void
  prev: () => void
  first: () => void
  last: () => void
  goTo: (index: number) => void
}

/** 서가의 현재 책 index 상태. initialIndex 기본값은 1권(index 0). */
export function useShelfNavigation(count: number, initialIndex?: number): ShelfNavigation {
  const [index, dispatch] = useReducer(
    (state: number, action: NavAction) => stepIndex(state, action, count),
    clampIndex(initialIndex ?? 0, count),
  )
  const actions = useMemo(
    () => ({
      next: () => dispatch({ type: 'next' }),
      prev: () => dispatch({ type: 'prev' }),
      first: () => dispatch({ type: 'first' }),
      last: () => dispatch({ type: 'last' }),
      goTo: (i: number) => dispatch({ type: 'goTo', index: i }),
    }),
    [],
  )
  return { index: clampIndex(index, count), ...actions }
}
