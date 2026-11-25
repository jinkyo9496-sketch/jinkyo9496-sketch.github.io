import { describe, expect, it } from 'vitest'
import { isAuthorized } from '../scripts/sharePassword'

const basic = (user: string, password: string) => `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`

describe('팀 공유용 잠금', () => {
  it('비밀번호가 맞으면 통과한다(이름은 아무거나)', () => {
    expect(isAuthorized(basic('team', 'abc-123'), 'abc-123')).toBe(true)
    expect(isAuthorized(basic('', 'abc-123'), 'abc-123')).toBe(true)
  })

  it('비밀번호가 틀리거나 헤더가 없으면 막는다', () => {
    expect(isAuthorized(basic('team', 'wrong'), 'abc-123')).toBe(false)
    expect(isAuthorized(undefined, 'abc-123')).toBe(false)
    expect(isAuthorized('Bearer abc-123', 'abc-123')).toBe(false)
  })

  it('비밀번호에 쌍점이 있어도 된다', () => {
    expect(isAuthorized(basic('team', 'a:b:c'), 'a:b:c')).toBe(true)
  })

  it('잠금 비밀번호가 비어 있으면 빈 비밀번호로도 통과하지 못한다', () => {
    expect(isAuthorized(basic('team', ''), '')).toBe(false)
  })
})
