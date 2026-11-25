import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../src/App'
import { GPU_NOTICE_KEY, GPU_NOTICE_TEXT, GpuNotice } from '../src/chrome/GpuNotice'

const WIDE = 1024
const setWidth = (width: number) => Object.defineProperty(window, 'innerWidth', { configurable: true, value: width })

beforeEach(() => {
  window.sessionStorage.clear()
  setWidth(WIDE)
  vi.spyOn(console, 'info').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
  setWidth(WIDE)
})

const notice = () => screen.queryByRole('status', { name: '그래픽 가속 안내' })
const closeButton = () => screen.getByRole('button', { name: '그래픽 가속 안내 닫기' })

describe('GpuNotice: 그래픽 가속을 켜 달라는 한 줄 안내', () => {
  it('says that acceleration is off and how to get the 3D shelf, naming both words browsers use', () => {
    render(<GpuNotice />)
    expect(notice()).toHaveTextContent(GPU_NOTICE_TEXT)
    expect(GPU_NOTICE_TEXT).toMatch(/그래픽 가속/)
    expect(GPU_NOTICE_TEXT).toMatch(/하드웨어 가속/)
    expect(GPU_NOTICE_TEXT).toMatch(/3D 서가/)
  })

  it('has a [ 닫기 ] button that can be reached with the keyboard', async () => {
    render(<GpuNotice />)
    expect(closeButton()).toHaveTextContent('[ 닫기 ]')
    await userEvent.tab()
    expect(closeButton()).toHaveFocus()
  })

  it('goes away when closed, tells the parent first, and stays away when drawn again in the same tab', async () => {
    const onDismiss = vi.fn(() => expect(notice()).not.toBeNull())
    const { unmount } = render(<GpuNotice onDismiss={onDismiss} />)
    await userEvent.click(closeButton())
    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(notice()).toBeNull()
    expect(window.sessionStorage.getItem(GPU_NOTICE_KEY)).not.toBeNull()
    unmount()
    render(<GpuNotice />)
    expect(notice()).toBeNull()
  })

  it('closes with Enter on the button', async () => {
    render(<GpuNotice />)
    closeButton().focus()
    await userEvent.keyboard('{Enter}')
    expect(notice()).toBeNull()
  })

  it('works without errors where sessionStorage is blocked', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    render(<GpuNotice />)
    expect(notice()).not.toBeNull()
    await userEvent.click(closeButton())
    expect(notice()).toBeNull()
  })
})

describe('App: when the notice shows', () => {
  it('shows over the CSS shelf when a wide screen fell back for want of graphics acceleration', () => {
    render(<App renderer="nogpu" />)
    expect(notice()).toHaveTextContent(GPU_NOTICE_TEXT)
    // CSS 서가는 그대로 보인다(사이트를 막지 않는다)
    expect(document.querySelector('.shelf .shelf__row')).not.toBeNull()
    // 콘솔의 한 줄도 그대로 남는다
    expect(vi.mocked(console.info).mock.calls.flat().join(' ')).toMatch(/CSS 서가/)
  })

  it('shows on all three screens, outside the screens that go inert', () => {
    render(<App renderer="nogpu" />)
    const onScreen = () => document.querySelector<HTMLElement>('.screens')!.dataset.screen
    expect(onScreen()).toBe('intro')
    expect(notice()).not.toBeNull()
    expect(notice()!.closest('.screens, [inert]')).toBeNull()
  })

  it('stays on the shelf and the fields screen', () => {
    const { unmount } = render(<App renderer="nogpu" initial={{ screen: 'shelf', index: 3 }} />)
    expect(notice()).not.toBeNull()
    unmount()
    render(<App renderer="nogpu" initial={{ screen: 'fields', index: 0 }} />)
    expect(notice()).not.toBeNull()
  })

  it('does not show on a narrow screen (under 900px)', () => {
    setWidth(800)
    render(<App renderer="nogpu" />)
    expect(document.querySelector('.shelf .shelf__row')).not.toBeNull()
    expect(notice()).toBeNull()
  })

  it('does not show when the CSS shelf is forced (?shelf=css)', () => {
    render(<App renderer="css" />)
    expect(notice()).toBeNull()
  })

  it('does not show for the WebGL shelf', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    render(<App renderer="webgl" />)
    expect(notice()).toBeNull()
  })

  it('does not show where the browser has no WebGL2 at all (jsdom, auto)', () => {
    render(<App />)
    expect(notice()).toBeNull()
  })

  it('goes away with [ 닫기 ] and does not come back when the app is drawn again', async () => {
    const { unmount } = render(<App renderer="nogpu" initial={{ screen: 'shelf', index: 3 }} />)
    await userEvent.click(closeButton())
    expect(notice()).toBeNull()
    unmount()
    render(<App renderer="nogpu" initial={{ screen: 'shelf', index: 3 }} />)
    expect(notice()).toBeNull()
  })

  it('keeps focus in the document after closing: it goes to where each screen takes focus', async () => {
    const { unmount } = render(<App renderer="nogpu" initial={{ screen: 'shelf', index: 3 }} />)
    closeButton().focus()
    await userEvent.keyboard('{Enter}')
    expect(document.activeElement).toBe(document.querySelector('.shelf [aria-current="true"]'))
    unmount()

    window.sessionStorage.clear()
    render(<App renderer="nogpu" />)
    closeButton().focus()
    await userEvent.keyboard('{Enter}')
    expect(screen.getByRole('button', { name: '서가 보기' })).toHaveFocus()
  })

  it('does not get in the way of the keys and the wheel that move between screens', () => {
    render(<App renderer="nogpu" />)
    const onScreen = () => document.querySelector<HTMLElement>('.screens')!.dataset.screen
    closeButton().focus()
    // 웰컴 아래는 신간 소개다(2026-11-24)
    fireEvent.keyDown(closeButton(), { key: 'ArrowDown' })
    expect(onScreen()).toBe('feature')
    expect(notice()).not.toBeNull()
  })

  it('lets the wheel over the notice move the screen', () => {
    render(<App renderer="nogpu" />)
    fireEvent.wheel(notice()!, { deltaY: 200 })
    expect(document.querySelector<HTMLElement>('.screens')!.dataset.screen).toBe('feature')
  })
})
