import { useEffect, useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { fieldLabel, type Field } from '../data/fields'
import { DRAG_SLOP_PX } from '../shelf/useShelfGestures'

interface Props {
  fields: readonly Field[]
  /** 지금 가리키는 학문의 index */
  current: number
  /** 학문 이름을 누르면 그 index를 알린다 */
  onChange: (index: number) => void
}

/** 가운데에서 이 칸 수보다 멀면 보이지 않는다(`fields.css`의 `data-away='5'`) */
export const DIAL_VISIBLE_STEPS = 4

/**
 * 반원 글자 다이얼. 학문 이름들이 화면 왼쪽 바깥의 한 점을 중심으로 한 원 위에 바큇살처럼 놓이고,
 * 원(`.fdial__wheel`)이 통째로 돌아 가리키는 학문이 삼각형 포인터 옆에 수평으로 온다. 도는 것은 transform 전환 하나라
 * 빠르게 여러 칸을 돌려도 끊기지 않는다. 치수(반지름·간격각·글자 크기)는 모두 `fields.css`에 있다.
 * 휠·키보드·쓸기로 돌리는 것은 App(`useScreen`)이 맡고, 여기서는 이름을 누르는 것만 받는다. 휠은 이 다이얼(`.fdial`)
 * 위에서 굴린 것만 다이얼을 돌린다(그 밖의 휠은 화면을 옮긴다).
 */
export function FieldDial({ fields, current, onChange }: Props) {
  const navRef = useRef<HTMLElement>(null)

  // 포커스가 다이얼 안에 있으면 새로 가리키는 학문으로 따라간다(그 학문만 탭 순서에 있다)
  useEffect(() => {
    const nav = navRef.current
    if (!nav || !nav.contains(document.activeElement)) return
    nav.querySelector<HTMLElement>('[aria-current="true"]')?.focus({ preventScroll: true })
  }, [current])

  // 세로로 쓸다가 낱말 위에서 손을 떼면 클릭이 따라온다: 쓸기(다이얼 한 칸)만 하고 그 클릭은 버린다
  const pressY = useRef<number | null>(null)
  const swiped = useRef(false)
  const onPointerDown = (e: ReactPointerEvent) => {
    pressY.current = e.clientY
    swiped.current = false
  }
  const onPointerUp = (e: ReactPointerEvent) => {
    swiped.current = pressY.current !== null && Math.abs(e.clientY - pressY.current) >= DRAG_SLOP_PX
    pressY.current = null
  }
  const choose = (index: number) => {
    if (swiped.current) {
      swiped.current = false
      return
    }
    onChange(index)
  }

  return (
    <nav ref={navRef} className="fdial" aria-label="학문" onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
      {/* 포인터는 장식이다: 가리키는 학문은 aria-current가 전한다. 서가의 권수 다이얼과 같은 삼각형이고 CSS로 그린다 */}
      <span className="fdial__pointer" aria-hidden="true" />
      <ul className="fdial__wheel" style={{ '--field': current } as CSSProperties}>
        {fields.map((field, i) => {
          const isCurrent = i === current
          return (
            <li
              key={field.name}
              className="fdial__item"
              style={{ '--i': i } as CSSProperties}
              data-away={Math.min(DIAL_VISIBLE_STEPS + 1, Math.abs(i - current))}
            >
              <button
                type="button"
                className="fdial__word"
                aria-label={fieldLabel(field)}
                aria-current={isCurrent ? 'true' : undefined}
                tabIndex={isCurrent ? 0 : -1}
                onClick={() => choose(i)}
              >
                {field.name}
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
