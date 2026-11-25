import { useEffect, useState } from 'react'
import { BracketButton } from './BracketButton'
import './gpuNotice.css'

/** 안내의 글. Chrome·Edge의 설정에 적힌 이름이 "그래픽 가속" 또는 "하드웨어 가속"이라 두 말을 함께 적는다 */
export const GPU_NOTICE_TEXT =
  '그래픽 가속이 꺼져 있어 간단한 화면으로 보여 드립니다. 브라우저 설정에서 그래픽 가속(하드웨어 가속)을 켜고 다시 열면 3D 서가를 볼 수 있습니다.'

/** 닫았다는 표시를 적어 두는 자리(`sessionStorage`: 그 탭에서만 남는다) */
export const GPU_NOTICE_KEY = 'seoga-shelf:gpu-notice-closed'

/** 이 탭에서 이미 닫았는가. 저장소를 쓸 수 없으면(차단) 닫지 않은 것으로 본다 */
function wasClosed(): boolean {
  try {
    return window.sessionStorage.getItem(GPU_NOTICE_KEY) !== null
  } catch {
    return false
  }
}

/** 닫았다고 적는다. 저장소를 쓸 수 없으면 적지 않는다(이번 화면에서만 사라진다) */
function rememberClosed() {
  try {
    window.sessionStorage.setItem(GPU_NOTICE_KEY, '1')
  } catch {
    // 저장소가 막혀 있다: 안내는 닫히고, 다시 열면 다시 보인다
  }
}

interface Props {
  /**
   * `[ 닫기 ]`를 눌렀다. 안내가 사라지기 직전에 부른다: 포커스가 닫기 버튼에 있었다면 여기서 다른 곳으로 옮긴다
   * (버튼이 사라지며 포커스가 문서 밖으로 떨어지지 않게)
   */
  onDismiss?: () => void
  /** 조작에서 뺀다(`inert`). 전체 메뉴의 판이 이 띠를 덮고 있는 동안 App이 준다: 가려진 `[ 닫기 ]`가 탭 순서에 남지 않는다 */
  inert?: boolean
}

/**
 * 그래픽 가속을 켜 달라는 한 줄 안내: 헤더 바로 아래의 가는 띠. 그래픽 가속을 쓸 수 없어 CSS 서가로 물러났을 때
 * App이 그린다(언제 보이는가는 `shelf3d/renderer.ts`의 `needsAccelerationNotice`). 닫으면 그 탭에서는 다시 보이지 않는다.
 * 글은 `role="status"`로 한 번 읽힌다: 읽기 도구가 바뀐 것으로 알아차리게, 빈 채로 그린 뒤에 글을 넣는다.
 */
export function GpuNotice({ onDismiss, inert = false }: Props) {
  const [closed, setClosed] = useState(wasClosed)
  const [said, setSaid] = useState(false)
  useEffect(() => setSaid(true), [])
  if (closed) return null

  const close = () => {
    rememberClosed()
    onDismiss?.()
    setClosed(true)
  }

  return (
    <div className="gpunotice" inert={inert}>
      <p className="gpunotice__text" role="status" aria-label="그래픽 가속 안내">
        {said ? GPU_NOTICE_TEXT : ''}
      </p>
      <BracketButton className="gpunotice__close" aria-label="그래픽 가속 안내 닫기" onClick={close}>
        닫기
      </BracketButton>
    </div>
  )
}
