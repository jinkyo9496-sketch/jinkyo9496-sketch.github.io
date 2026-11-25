/**
 * 팀 공유용 잠금(Vite 플러그인). `시작 5291 (팀 공유).bat`으로 빌드한 사이트를 다른 PC에 보일 때,
 * 환경 변수 `SHARE_PASSWORD`가 있으면 브라우저가 비밀번호를 묻는다(HTTP Basic 인증, 이름은 아무거나).
 * 이 PC의 주소가 회사 밖에서도 닿을 수 있는 주소일 수 있어서 둔다. 개발 서버(`npm run dev`)에는 걸지 않는다.
 */
import type { Plugin } from 'vite'

/** Authorization 헤더가 그 비밀번호를 담고 있는가(이름은 보지 않는다) */
export function isAuthorized(header: string | undefined, password: string) {
  if (!header || !password) return false
  const [scheme, encoded] = header.split(' ')
  if (scheme?.toLowerCase() !== 'basic' || !encoded) return false
  const decoded = Buffer.from(encoded, 'base64').toString('utf-8')
  const at = decoded.indexOf(':')
  return at >= 0 && decoded.slice(at + 1) === password
}

export function sharePassword(password = process.env.SHARE_PASSWORD ?? ''): Plugin {
  return {
    name: 'share-password',
    configurePreviewServer(server) {
      if (!password) return
      server.middlewares.use((req, res, next) => {
        if (isAuthorized(req.headers.authorization, password)) return next()
        res.statusCode = 401
        res.setHeader('WWW-Authenticate', 'Basic realm="seoga-shelf", charset="UTF-8"')
        res.end('비밀번호가 필요합니다.')
      })
    },
  }
}
