/**
 * Vercel에 올린 사이트의 잠금(Routing Middleware). 모든 요청(그림·영상 포함)에서 비밀번호를 묻는다(HTTP Basic 인증, 이름은 아무거나).
 * 비밀번호는 Vercel 프로젝트의 환경 변수 `SHARE_PASSWORD`. 그 값이 없으면 아무에게도 열지 않는다(잠그는 것을 잊은 채 공개되지 않게).
 * 이 PC에서 공유할 때의 잠금은 `scripts/sharePassword.ts`(같은 규칙). 개발 서버와는 상관없다.
 */
export function passwordFrom(header) {
  if (!header) return null
  const [scheme, encoded] = header.split(' ')
  if (!scheme || scheme.toLowerCase() !== 'basic' || !encoded) return null
  let decoded
  try {
    decoded = new TextDecoder().decode(Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0)))
  } catch {
    return null
  }
  const at = decoded.indexOf(':')
  return at < 0 ? null : decoded.slice(at + 1)
}

export default function middleware(request) {
  const password = process.env.SHARE_PASSWORD
  if (!password) {
    return new Response('잠금 비밀번호(SHARE_PASSWORD)가 설정되지 않아 열 수 없습니다.', { status: 503 })
  }
  if (passwordFrom(request.headers.get('authorization')) === password) return
  return new Response('비밀번호가 필요합니다.', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="seoga-shelf", charset="UTF-8"' },
  })
}
