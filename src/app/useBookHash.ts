import { useEffect, useRef } from 'react'
import { bookHash, parseBookHash } from './bookHash'
import { isBookView, type ScreenAction, type ScreenState } from './screen'

type Apply = (action: ScreenAction, via?: 'focus' | 'none', force?: boolean) => boolean

/**
 * 열린 책 페이지와 주소(`#/book/N`)를 서로 맞춘다.
 * - 상태 → 주소: 책 페이지를 열면 주소에 새 기록을 쌓고(뒤로 가기 = 서가로), 책 페이지 사이를 넘길 때는 그 기록을
 *   바꿔 쓴다. 닫으면 쌓았던 기록을 되돌린다(history.back). 주소로 바로 들어왔거나 그 사이에 뒤로·앞으로 가기가
 *   있었다면(바로 아래 기록이 서가인지 알 수 없다) 해시만 지운다.
 * - 주소 → 상태: 뒤로·앞으로 가기나 주소를 고쳐 해시가 바뀌면 그 책 페이지를 열거나 닫는다.
 * 첫 화면은 `screenFromHash`로 정한다(App).
 */
export function useBookHash(state: ScreenState, apply: Apply, count: number) {
  const open = isBookView(state)
  const index = state.index
  /** 서가에서 책 페이지를 열며 쌓은 기록 위에 그대로 있는가(그렇다면 닫을 때 그 기록을 되돌린다) */
  const pushed = useRef(false)

  useEffect(() => {
    const { pathname, search, hash } = window.location
    const current = parseBookHash(hash, count)
    if (open) {
      if (current === index) return
      const url = pathname + search + bookHash(index + 1)
      if (current !== null) window.history.replaceState(null, '', url)
      else {
        window.history.pushState(null, '', url)
        pushed.current = true
      }
    } else if (current !== null) {
      if (pushed.current) {
        pushed.current = false
        window.history.back()
      } else window.history.replaceState(null, '', pathname + search)
    }
  }, [open, index, count])

  useEffect(() => {
    const sync = () => {
      const target = parseBookHash(window.location.hash, count)
      // 주소는 이미 바뀌었다: 전환 중이어도 따라간다
      // 기록 사이를 오갔으니, 바로 아래 기록이 서가라는 보장이 없다: 닫을 때 되돌리지 않고 해시만 지운다
      pushed.current = false
      if (target !== null) apply({ type: 'openBook', index: target }, 'none', true)
      else apply({ type: 'closeBook' }, 'none', true)
    }
    window.addEventListener('popstate', sync)
    window.addEventListener('hashchange', sync)
    return () => {
      window.removeEventListener('popstate', sync)
      window.removeEventListener('hashchange', sync)
    }
  }, [apply, count])
}
