import { afterEach, describe, expect, it } from 'vitest'
// @ts-expect-error 타입 선언이 없는 배포용 파일(Vercel이 그대로 읽는다)
import middleware from '../middleware.js'

const ask = (password?: string) =>
  middleware(
    new Request('https://example.test/covers/01_front.jpg', {
      headers: password === undefined ? {} : { authorization: `Basic ${Buffer.from(`팀:${password}`).toString('base64')}` },
    }),
  ) as Response | undefined

describe('Vercel에 올린 사이트의 잠금', () => {
  afterEach(() => {
    delete process.env.SHARE_PASSWORD
  })

  it('비밀번호가 맞으면 지나간다(이름은 아무거나, 한글이어도)', () => {
    process.env.SHARE_PASSWORD = 'abc-123'
    expect(ask('abc-123')).toBeUndefined()
  })

  it('비밀번호가 없거나 틀리면 401로 비밀번호를 묻는다', () => {
    process.env.SHARE_PASSWORD = 'abc-123'
    expect(ask()?.status).toBe(401)
    expect(ask('wrong')?.status).toBe(401)
    expect(ask()?.headers.get('WWW-Authenticate')).toContain('Basic')
  })

  it('환경 변수에 비밀번호를 넣지 않았으면 아무에게도 열지 않는다', () => {
    expect(ask('')?.status).toBe(503)
    expect(ask('anything')?.status).toBe(503)
  })
})
