import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'pretendard/dist/web/static/pretendard-dynamic-subset.css'
import './index.css'
import App from './App'
import { rendererFromQuery } from './shelf3d/renderer'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* `?shelf=css`로 CSS 서가를, `?shelf=webgl`로 WebGL 서가를 강제할 수 있다 */}
    {/* 개발 서버에서는 `?shelf=nogpu`로 그래픽 가속이 없는 기기를 흉내 낸다(가속 안내 확인용) */}
    <App renderer={rendererFromQuery(window.location.search, import.meta.env.DEV)} />
  </StrictMode>,
)
