import { useEffect, useRef, useState } from 'react'
import { fieldLabel, fields } from '../data/fields'
import type { FlightPhase, FlyReturner, FlyStarter } from '../fields3d/FieldBooks3D'
import type { FieldsSceneFactory } from '../fields3d/sceneTypes'
import { useFieldBooks3D } from '../fields3d/useFieldBooks3D'
import type { Renderer } from '../shelf3d/renderer'
import { FieldCovers } from './FieldCovers'
import { FieldDial } from './FieldDial'
import './fields.css'

interface Props {
  /** 지금 가리키는 학문의 index(`data/fields.ts`). 상태는 App이 가진다(`app/screen.ts`의 `field`) */
  currentField: number
  /** 학문 이름을 누르면 그 index로 부른다 */
  onFieldChange: (index: number) => void
  /**
   * 책 자리를 무엇으로 그릴지. App이 서가와 같은 판정(`chooseRenderer`: WebGL 가능 여부·폭 900px)의 결과를 내려 준다.
   * 'webgl'이면 3D 책(`fields3d/FieldBooks3D`), 'css'(기본)면 평면 표지(`FieldCovers`)
   */
  renderer?: Renderer
  /** 이 화면이 보이는가(3D 책은 보일 때 처음부터 등장하고, 보이지 않는 동안에는 그리지 않는다). 기본 true */
  active?: boolean
  /** 3D 책의 장면을 만드는 함수(테스트에서 가짜 장면을 넣는다) */
  createBooksScene?: FieldsSceneFactory
  /**
   * 책(3D)을 골랐다: 그 책의 번호. App이 책 페이지를 연다. fly를 부르면 그 책이 들려서 책 페이지의 자리로 날아간다
   * (`fields3d/FieldBooks3D`의 `FlyStarter`)
   */
  onOpenBook?: (no: number, fly: FlyStarter) => void
  /**
   * 책 페이지로 날아가는·돌아오는 전환의 단계(App이 정한다). 그동안 다이얼은 옅어지고(`data-flight`.
   * 돌아올 때는 책이 날아오는 동안 다시 나타난다), 캔버스는 화면 위로 올라온다
   */
  flight?: FlightPhase
  /** App이 "돌아오게 하기"를 받아 갈 곳(`fields3d/FieldBooks3D`의 `FlyReturner`). 3D 책이 그려져 있는 동안에만 들어 있다 */
  returner?: { current: FlyReturner | null }
  /** 평면 표지를 눌렀다: 그 책의 번호와 누른 버튼. App이 상세 창을 연다(닫히면 그 버튼으로 포커스) */
  onOpenDetail?: (no: number, opener: HTMLElement) => void
}

let lastLogged: string | null = null
/** 평면 표지로 물러난 이유를 한 줄 남긴다(같은 이유는 한 번만) */
function logFallback(reason: string) {
  if (reason === lastLogged) return
  lastLogged = reason
  console.info(`[학제별 분류] 3D 책 대신 평면 표지로 표시: ${reason}`)
}

/**
 * 학제별 분류 화면(서가 아래의 셋째 화면): 왼쪽에 반원 글자 다이얼, 오른쪽에 가리키는 학문의 책.
 * 휠·키보드·쓸기로 다이얼을 돌리고 서가에 돌아가는 것은 App(`useScreen`)이 맡는다. 책 줄을 끌어 넘기는 것은
 * 책 자리(`FieldBooks3D`)가 맡고, 책을 고르면 App에 알린다(3D는 책 페이지, 평면 표지는 상세 창).
 * 탭 순서는 다이얼의 지금 학문 → 그 학문의 책들. 서가로 돌아가는 버튼은 없다(2026-11-24 삭제): 다이얼 밖에서 위로 굴린 휠,
 * 철학에서 ↑·아래로 쓸기, 헤더의 로고(인트로)로 나간다.
 */
export function Fields({
  currentField,
  onFieldChange,
  renderer = 'css',
  active = true,
  createBooksScene,
  onOpenBook,
  onOpenDetail,
  flight = null,
  returner,
}: Props) {
  const field = fields[currentField] ?? fields[0]

  // 책 자리: WebGL을 쓸 수 있으면 3D 책(three는 따로 받는다), 받지 못했거나 그리다 문제가 생기면 평면 표지
  const books3d = useFieldBooks3D(renderer === 'webgl')
  const [sceneFailure, setSceneFailure] = useState<string | null>(null)
  const failure = sceneFailure ?? (books3d.failed ? '3D 책 묶음을 받지 못함' : null)
  const Books3D = renderer === 'webgl' && !failure ? books3d.FieldBooks3D : null
  useEffect(() => {
    if (failure) logFallback(failure)
  }, [failure])

  // 학문이 바뀌면 보조 기술에 한 번 알린다. 포커스가 다이얼에 있으면 포커스가 새 학문으로 옮겨 가며
  // 이미 읽히므로 알리지 않는다(서가의 책 알림과 같은 방식). 처음에는 알리지 않는다.
  const label = fieldLabel(field)
  const [announcement, setAnnouncement] = useState('')
  const announced = useRef(label)
  useEffect(() => {
    if (announced.current === label) return
    announced.current = label
    const focusOnDial = document.activeElement?.closest('.fdial') != null
    setAnnouncement(focusOnDial ? '' : label)
  }, [label])
  // 화면을 떠나 있는 동안에는 알림을 비워 둔다: 돌아왔을 때 같은 학문이어도 다시 읽힌다
  useEffect(() => {
    if (!active) setAnnouncement('')
  }, [active])

  return (
    <section className="fields" aria-labelledby="fields-title" data-flight={flight ?? undefined}>
      {/*
        책 페이지를 닫고 돌아오면 포커스가 여기에 온다(`app/useScreen.ts`): 책에 두지 않아 책 둘레에 포커스 링이 생기지 않고,
        다음 Tab은 다이얼의 지금 학문부터다. 포커스가 오면 지금 학문을 한 번 알린다(떠나면 비운다)
      */}
      <h1
        id="fields-title"
        className="fields__anchor sr-only"
        tabIndex={-1}
        onFocus={() => setAnnouncement(label)}
        onBlur={() => setAnnouncement('')}
      >
        학제별 분류
      </h1>
      <div className="fields__content">
        <FieldDial fields={fields} current={currentField} onChange={onFieldChange} />
        {Books3D ? (
          <Books3D
            field={field}
            active={active}
            onFail={setSceneFailure}
            onOpenBook={(book, fly) => onOpenBook?.(book.no, fly)}
            flight={flight}
            returner={returner}
            {...(createBooksScene && { createScene: createBooksScene })}
          />
        ) : renderer === 'webgl' && !failure ? (
          // 3D 책을 받는 동안: 자리만 잡아 둔다(평면 표지를 잠깐 보였다가 바꾸지 않는다)
          <div className="fbooks3d" />
        ) : (
          <FieldCovers field={field} onOpen={onOpenDetail} />
        )}
        <div className="sr-only" role="status" aria-atomic="true">
          {announcement}
        </div>
      </div>
    </section>
  )
}
