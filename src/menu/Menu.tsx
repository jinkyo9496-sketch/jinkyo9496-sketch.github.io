import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'
import { books as allBooks, type Book } from '../data/books'
import { fields } from '../data/fields'
import './menu.css'

/** 패널의 id(버튼의 `aria-controls`)와 읽히는 이름 */
export const MENU_ID = 'site-menu'
export const MENU_LABEL = '전체 메뉴'

/** 미디어: 서가명강 유튜브 채널 */
export const YOUTUBE_URL = 'https://www.youtube.com/@sgmk'
export const YOUTUBE_HANDLE = '@sgmk'

/** 열림 상태: 닫힘 / 마우스·터치로 열었다 / 키보드로 열었다(이때만 포커스를 패널의 첫 항목으로 옮긴다) */
export type MenuOpen = false | 'pointer' | 'keys'

/** 지금 어디에 있는가(조용한 표시와 `aria-current`): 서가 / 학제별 분류 / 책 페이지 / 그 밖(신간 소개) */
export interface MenuHere {
  place: 'shelf' | 'fields' | 'book' | null
  /** 서가의 가운데 책(books의 순번). 서가와 책 페이지에서만 지금 책으로 표시한다 */
  index: number
  /** 다이얼이 가리키는 학문(fields의 순번). 학제별 분류에서만 지금 학문으로 표시한다 */
  field: number
}

interface ToggleProps {
  open: boolean
  /** 눌렀다. `byKeys`는 키보드(Enter·Space)로 눌렀는가 */
  onToggle: (byKeys: boolean) => void
}

/**
 * 헤더 오른쪽 끝의 `+`. 열리면 +가 45° 돌아 ×로 보인다. 기호는 CSS로 그린 두 선이고(장식) 이름은 "전체 메뉴"다.
 * 대괄호는 두르지 않는다(`[ ]` 표기의 예외: 편집자 요청 2026-11-25. 그래서 `BracketButton`이 아니다).
 * 삼각형은 쓰지 않는다: 두 다이얼에서 "여기를 가리킨다"는 포인터로 쓰는 모양이라 뜻이 겹친다
 */
export function MenuToggle({ open, onToggle }: ToggleProps) {
  return (
    <button
      type="button"
      className="menu-toggle"
      aria-label={MENU_LABEL}
      aria-expanded={open}
      aria-controls={MENU_ID}
      // 키보드로 누른 클릭은 detail이 0이다
      onClick={(e: MouseEvent<HTMLButtonElement>) => onToggle(e.detail === 0)}
    >
      <span className="menu-toggle__plus" aria-hidden="true" />
    </button>
  )
}

/** 유튜브 로고: 재생 삼각형이 든 가로 사각형. 먹 한 색(`currentColor`). 둥근 모서리는 "로고 그림"이라 디자인 규칙의 예외다 */
function YoutubeMark() {
  return (
    <svg className="menu__yt" viewBox="0 0 24 17" width="24" height="17" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M4 0h16a4 4 0 0 1 4 4v9a4 4 0 0 1-4 4H4a4 4 0 0 1-4-4V4a4 4 0 0 1 4-4Zm5.6 4.6v7.8l6.8-3.9-6.8-3.9Z"
      />
    </svg>
  )
}

const MOVE_KEYS: Record<string, (i: number, last: number) => number> = {
  ArrowDown: (i, last) => Math.min(last, i + 1),
  ArrowUp: (i) => Math.max(0, i - 1),
  Home: () => 0,
  End: (_, last) => last,
}

interface ListProps {
  label: string
  className: string
  ordered?: boolean
  count: number
  /** 지금 항목(없으면 null). 열릴 때 탭 순서에 드는 것은 이것, 없으면 첫 항목이다 */
  current: number | null
  /** 패널이 열린 횟수: 열릴 때마다 탭 순서에 드는 항목을 지금 항목으로 되돌리고, 그 항목이 보이게 목록을 넘겨 둔다 */
  opens: number
  children: (i: number, props: { tabIndex: number; 'aria-current': 'true' | undefined; onFocus: () => void }) => ReactNode
}

/**
 * 목록 하나(학문 / 책). 탭 순서에는 한 항목만 들고(roving tabindex) 안에서는 ↑/↓·Home·End로 옮긴다:
 * 책이 마흔 권을 넘어도 Tab 한 번으로 목록을 빠져나간다
 */
function RovingList({ label, className, ordered, count, current, opens, children }: ListProps) {
  const ref = useRef<HTMLOListElement & HTMLUListElement>(null)
  const [active, setActive] = useState(current ?? 0)
  const [seen, setSeen] = useState(opens)
  if (seen !== opens) {
    setSeen(opens)
    setActive(current ?? 0)
  }
  // 열릴 때: 지금 항목이 목록의 가운데쯤 보이게(화면 전체가 아니라 이 목록만 넘긴다). 지금 항목이 없으면 처음부터 보인다
  useLayoutEffect(() => {
    const list = ref.current
    if (!list) return
    const item = current === null ? null : list.querySelectorAll<HTMLElement>('button')[current]
    if (!item) {
      list.scrollTop = 0
      return
    }
    const top = item.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop
    list.scrollTop = Math.max(0, top - (list.clientHeight - item.offsetHeight) / 2)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opens])
  const onKeyDown = (e: KeyboardEvent) => {
    const move = MOVE_KEYS[e.key]
    if (!move || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
    const items = ref.current?.querySelectorAll<HTMLElement>('button')
    const from = items ? Array.from(items).indexOf(document.activeElement as HTMLElement) : -1
    if (!items || from < 0) return
    e.preventDefault()
    items[move(from, items.length - 1)].focus()
  }
  const List = ordered ? 'ol' : 'ul'
  return (
    <List ref={ref} className={className} aria-label={label} onKeyDown={onKeyDown}>
      {Array.from({ length: count }, (_, i) => (
        <li key={i}>
          {children(i, {
            tabIndex: i === active ? 0 : -1,
            'aria-current': i === current ? 'true' : undefined,
            onFocus: () => setActive(i),
          })}
        </li>
      ))}
    </List>
  )
}

interface Props {
  open: MenuOpen
  here: MenuHere
  onClose: () => void
  /** `분류`: 학제별 분류 화면으로(가리키는 학문은 그대로) */
  onFields: () => void
  /** 학문 이름: 그 학문이 선택된 학제별 분류 화면으로 */
  onField: (index: number) => void
  /** `서가`: 서가 화면으로(가운데 책은 그대로) */
  onShelf: () => void
  /** 책: 그 책의 책 페이지로 */
  onBook: (index: number) => void
  books?: readonly Book[]
}

/**
 * 전체 메뉴(2026-11-25): 헤더 바로 아래로 펼쳐지는 판. 모달이 아니라 헤더에 붙은 펼침 영역이다(`nav`).
 * 왼쪽 단은 `분류`와 학문 열하나, 그 아래 `미디어`(유튜브). 오른쪽 단은 `서가`와 모든 책(번호순 한 줄씩: 도서명 · 위첨자 번호 · 오른쪽 끝의 저자.
 * 이 목록만 세로로 스크롤된다).
 * 닫혀 있는 동안에도 DOM에 있고(버튼의 `aria-controls`) `inert`로 조작·읽기에서 뺀다. 열려 있는 동안에는 `data-open`이
 * 붙어 화면의 입력(휠·키·쓸기)이 물러난다(`shelf/useShelfGestures`의 `isModalOpen`). Esc와 패널 밖(가림막)을 누르면 닫힌다.
 * 어디로 갈지는 쓰는 쪽(App)이 정한다: 여기서는 고른 것을 알리기만 한다
 */
export function Menu({ open, here, onClose, onFields, onField, onShelf, onBook, books = allBooks }: Props) {
  const isOpen = open !== false
  const first = useRef<HTMLButtonElement>(null)
  const [opens, setOpens] = useState(0)
  const [wasOpen, setWasOpen] = useState(isOpen)
  if (wasOpen !== isOpen) {
    setWasOpen(isOpen)
    if (isOpen) setOpens(opens + 1)
  }

  // 키보드로 열었으면 포커스를 첫 항목(분류)으로
  useEffect(() => {
    if (open === 'keys') first.current?.focus({ preventScroll: true })
  }, [open])

  // Esc: 패널만 닫는다(책 페이지는 그대로). 책 페이지의 Esc보다 먼저 듣는다
  const close = useRef(onClose)
  useEffect(() => {
    close.current = onClose
  })
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      close.current()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [isOpen])

  const fieldNow = here.place === 'fields' ? here.field : null
  const bookNow = here.place === 'shelf' || here.place === 'book' ? here.index : null

  return (
    <>
      {/* 패널 밖: 누르면 닫힌다. 아래의 화면은 보이되 눌리지 않는다 */}
      {isOpen && <div className="menu__scrim" onClick={onClose} />}
      <nav
        id={MENU_ID}
        className="menu"
        aria-label={MENU_LABEL}
        data-open={isOpen ? '' : undefined}
        inert={!isOpen}
        aria-hidden={!isOpen || undefined}
      >
        <div className="menu__col menu__col--fields">
          <h2 className="menu__head">
            <button
              ref={first}
              type="button"
              className="menu__title"
              aria-current={here.place === 'fields' ? 'page' : undefined}
              onClick={onFields}
            >
              <span className="menu__word">분류</span>
            </button>
          </h2>
          <RovingList label="학문" className="menu__list" count={fields.length} current={fieldNow} opens={opens}>
            {(i, roving) => (
              // 권수는 적지 않는다(2026-11-25 편집자 요청): 이름은 학문 이름뿐이다
              <button type="button" className="menu__item" onClick={() => onField(i)} {...roving}>
                <span className="menu__name">{fields[i].name}</span>
              </button>
            )}
          </RovingList>
          <h2 className="menu__head menu__head--media">
            <span className="menu__title">미디어</span>
          </h2>
          <a
            className="menu__media"
            href={YOUTUBE_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`유튜브 ${YOUTUBE_HANDLE}, 새 창`}
          >
            <YoutubeMark />
            <span>{YOUTUBE_HANDLE}</span>
          </a>
        </div>
        <div className="menu__col menu__col--books">
          <h2 className="menu__head">
            <button
              type="button"
              className="menu__title"
              aria-current={here.place === 'shelf' ? 'page' : undefined}
              onClick={onShelf}
            >
              <span className="menu__word">서가</span>
            </button>
          </h2>
          <RovingList label="책" className="menu__list menu__books" ordered count={books.length} current={bookNow} opens={opens}>
            {(i, roving) => (
              <button
                type="button"
                className="menu__item menu__book"
                aria-label={`${books[i].no}권 ${books[i].title}`}
                onClick={() => onBook(i)}
                {...roving}
              >
                <span className="menu__name">{books[i].title}</span>
                {/* 번호는 도서명 바로 뒤의 위첨자, 숫자만(2026-11-25 편집자 요청: 앞이 아니라 뒤에, `No.` 없이) */}
                <sup className="menu__no" aria-hidden="true">
                  {books[i].no}
                </sup>
                <span className="menu__sub" aria-hidden="true">
                  {books[i].author}
                </span>
              </button>
            )}
          </RovingList>
        </div>
      </nav>
    </>
  )
}
