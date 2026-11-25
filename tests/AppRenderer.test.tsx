import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../src/App'
import { books } from '../src/data/books'

afterEach(() => vi.restoreAllMocks())

const shelf = () => screen.getByRole('region', { name: '서가명강 서가', hidden: true })

describe('App: which shelf it mounts', () => {
  it('mounts the CSS shelf where WebGL is not available (jsdom), at once and without a canvas', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    render(<App initial={{ screen: 'shelf', index: 3 }} />)
    expect(shelf().querySelector('.shelf__row')).not.toBeNull()
    expect(shelf().querySelector('canvas')).toBeNull()
    expect(shelf().querySelectorAll('[data-testid="book"]')).toHaveLength(books.length)
    // 이유를 한 줄로 남긴다
    expect(info.mock.calls.flat().join(' ')).toMatch(/CSS 서가/)
  })

  it('mounts the CSS shelf when it is forced, without saying why', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    render(<App renderer="css" />)
    expect(shelf().querySelector('.shelf__row')).not.toBeNull()
    expect(info).not.toHaveBeenCalled()
  })

  it('shows an empty shelf box while the WebGL shelf loads, and falls back to CSS when it cannot start', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    render(<App renderer="webgl" initial={{ screen: 'shelf', index: 3 }} />)
    // three를 받는 동안: 빈 서가 칸(CSS 서가를 잠깐 보였다가 바꾸지 않는다)
    expect(shelf()).toBeEmptyDOMElement()
    // jsdom에는 WebGL이 없어 장면을 만들지 못한다 → CSS 서가
    await waitFor(() => expect(shelf().querySelector('.shelf__row')).not.toBeNull(), { timeout: 5000 })
    expect(shelf().querySelector('canvas')).toBeNull()
    expect(info.mock.calls.flat().join(' ')).toMatch(/CSS 서가/)
  })
})
