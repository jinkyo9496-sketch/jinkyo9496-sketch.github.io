import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { affiliations } from '../data/affiliations'
import { blurbs } from '../data/blurbs'
import { books } from '../data/books'
import { editorNotes } from '../data/editorNotes'
import { FEATURE_FINAL, featureCssVars, stepReached, type FeatureStep } from './timeline'
import './feature.css'

interface Props {
  /** 지금 단계(`timeline.ts`). App이 `useFeature`로 시간에 따라 넘긴다 */
  step: FeatureStep
  /** 전환 없이 그 모습으로 놓는다(서가에서 올라왔을 때: 애니메이션을 다시 돌리지 않는다) */
  instant?: boolean
  /** 이 화면이 보이는가. 보이지 않는 동안에는 영상을 멈추고, 한 번도 보인 적이 없으면 영상을 받지 않는다 */
  active: boolean
  /** 아래에 비치는 책 자리를 마우스로 눌렀다: 서가로 내려간다(휠처럼 포커스는 그대로 둔다) */
  onOpenShelf: () => void
}

/** 소개하는 신간의 번호. 도서명·부제·저자·소속·편집자의 한 마디는 이 번호로 데이터에서 읽는다 */
export const FEATURE_BOOK_NO = 48

/** 말풍선 셋(위에서부터). 편집자가 준 문구와 줄바꿈 그대로다 */
export const FEATURE_BUBBLES: readonly (readonly [string, string])[] = [
  ['AI는 어떻게 인간처럼', '이해하고 대답하는 걸까?'],
  ['AI가 말하는 원리를 알면', '생각의 탄생을 알 수 있을까?'],
  ['최전선 AI 연구자들이', '플라톤 철학을 주목하고 있다?'],
]

/** 말풍선을 밀어내고 올라오는 큰 문구(두 줄) */
export const FEATURE_CLAIM: readonly [string, string] = ['우리는 생각의 탄생을 목격한', '첫 세대가 될 것이다!']

/**
 * 책 소개 문구(저자 아래, 편집자의 한 마디 위). 편집자가 준 글 그대로이고 신간 소개에만 쓴다
 * (전용 상수다: 책 페이지의 소개 `blurbs[48].summary`를 고쳐도 따라 바뀌지 않는다)
 */
export const FEATURE_PITCH =
  "'내가 이해 못해도 어쨌든 정답이긴 한' 결과를 내주는 기계와 함께하는 우리의 삶은 앞으로 어떻게 달라지게 될까? 한 권으로 살피는 인공지능 인식론의 최전선."

/** 그림과 영상(`public/feature/`). 목업은 투명 배경 816×1200, 영상은 H.264 720p 16:9 */
export const FEATURE_MEDIA = {
  mockup: '/feature/48_mockup.webp',
  mockupSize: { width: 816, height: 1200 },
  video: '/feature/48_video.mp4',
  poster: '/feature/48_poster.jpg',
} as const

/** 두 줄 글: 화면에서는 줄마다 한 줄, 읽을 때는 한 문장(줄 사이에 빈칸) */
function Lines({ lines }: { lines: readonly string[] }) {
  return (
    <>
      {lines.map((line, i) => (
        <span key={i}>
          {i > 0 && ' '}
          <span className="feature__line">{line}</span>
        </span>
      ))}
    </>
  )
}

/**
 * 소리 없이 재생한다. 브라우저가 막으면(소리를 켠 채 돌아왔을 때 등) 소리를 끄고 한 번 더 해 본다.
 * 그래도 막히면 첫 장면 그림과 조작부가 남는다(방문자가 눌러 재생한다).
 */
function playQuietly(video: HTMLVideoElement) {
  const attempt = () => {
    try {
      return video.play()
    } catch {
      return undefined
    }
  }
  attempt()?.catch(() => {
    if (video.muted) return
    video.muted = true
    attempt()?.catch(() => {})
  })
}

/**
 * 신간 소개 화면(웰컴 아래, 서가 위. 2026-11-24): 웰컴과 같은 자리(헤더 아래 ~ 비치는 책 위)에서 내용만 바뀐다.
 * 웰컴에서 내려오면 저절로 이어진다: 말풍선 셋 → 큰 문구 → 도서 목업 → 도서명·부제·저자 → 책 소개 문구 → 편집자의 한 마디 → 영상.
 * 단계는 App이 넘겨 주고(`useFeature`, 박자는 `timeline.ts`), 여기서는 단계마다 무엇이 보이는지를 속성으로 적는다
 * (`data-state`·`data-on`: 모습과 움직임은 `feature.css`).
 * 글은 모두 처음부터 DOM에 한 번씩, 읽는 순서대로 있다(말풍선 → 큰 문구 → 도서명 → …). 화면에서 사라진 글도 지우거나
 * 숨기지 않는다: 읽기 도구에는 어느 단계에서든 같은 글이 한 번씩 순서대로 읽힌다.
 * 영상은 영상 자리가 나타날 때 처음 만든다(그 전에는 받지 않는다). 화면을 떠나면 멈추고 돌아오면 이어서 재생한다.
 */
export function Feature({ step, instant = false, active, onOpenShelf }: Props) {
  const book = books.find((b) => b.no === FEATURE_BOOK_NO)
  const vars = useMemo(() => featureCssVars() as CSSProperties, [])
  const reached = (target: FeatureStep) => stepReached(step, target)
  const on = (target: FeatureStep) => (reached(target) ? '' : undefined)

  // 영상: 이 화면에서 영상 단계에 닿은 뒤에만 만든다. 한 번 만든 뒤에는 남겨 둔다(다시 받지 않는다)
  const showing = active && step === FEATURE_FINAL
  const [loaded, setLoaded] = useState(false)
  if (showing && !loaded) setLoaded(true)
  const videoRef = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (showing) playQuietly(video)
    else video.pause()
  }, [showing, loaded])

  if (!book) return null
  const subtitle = blurbs[book.no]?.subtitle
  const affiliation = affiliations[book.no]
  const note = editorNotes[book.no]

  return (
    <section className="feature" aria-label="신간 소개" data-step={step} data-instant={instant ? '' : undefined} style={vars}>
      <div className="feature__stage">
        {/* 말풍선: 위에서부터 하나씩 생겨나고(in), 큰 문구가 올라오면 위로 밀려 사라진다(out) */}
        <div className="feature__bubbles" data-state={reached('claim') ? 'out' : reached('bubbles') ? 'in' : 'off'}>
          {FEATURE_BUBBLES.map((lines, i) => (
            <p key={i} className="feature__bubble" style={{ '--i': i } as CSSProperties}>
              <Lines lines={lines} />
            </p>
          ))}
        </div>
        <p className="feature__claim" data-state={reached('mockup') ? 'out' : reached('claim') ? 'in' : 'off'}>
          <Lines lines={FEATURE_CLAIM} />
        </p>
        {/* 목업 · 글 · 영상의 묶음: 가운데에 모여 있어, 글과 영상의 자리가 열리면 앞의 것이 왼쪽으로 밀린다 */}
        <div className="feature__row">
         <div className="feature__group">
          <div className="feature__book" data-on={on('mockup')}>
            {/* 도서명이 바로 옆에서 읽히므로 그림의 이름은 비운다 */}
            <img className="feature__mockup" src={FEATURE_MEDIA.mockup} alt="" {...FEATURE_MEDIA.mockupSize} />
          </div>
          <div className="feature__text" data-on={on('info')}>
            <div className="feature__copy">
              <div className="feature__info" data-on={on('info')}>
                <div className="feature__heading">
                  <h1 className="feature__title" tabIndex={-1}>
                    {book.title}
                  </h1>
                  <sup className="feature__no">No.{book.no}</sup>
                </div>
                {subtitle && <p className="feature__subtitle">{subtitle}</p>}
                <p className="feature__meta">
                  <span className="feature__author">{book.author} 지음</span>
                  {affiliation && (
                    <>
                      {' '}
                      <span className="feature__affiliation">{affiliation}</span>
                    </>
                  )}
                </p>
              </div>
              <p className="feature__pitch" data-on={on('pitch')}>
                {FEATURE_PITCH}
              </p>
              {note && note.length > 0 && (
                <div className="feature__note" data-on={on('note')}>
                  <h2 className="feature__note-label">편집자의 한 마디</h2>
                  <p className="feature__note-text">{note.join(' ')}</p>
                </div>
              )}
            </div>
          </div>
          {/* 자리가 닫혀 있는 동안(영상 단계 전)에는 남아 있는 영상에 포커스도 읽기도 가지 않게 한다 */}
          <div className="feature__video" data-on={on('video')} inert={!reached('video')}>
            <div className="feature__frame">
              {loaded && (
                <video
                  ref={videoRef}
                  src={FEATURE_MEDIA.video}
                  poster={FEATURE_MEDIA.poster}
                  aria-label={`${book.title} 소개 영상`}
                  muted
                  playsInline
                  controls
                  preload="metadata"
                />
              )}
            </div>
          </div>
         </div>
        </div>
      </div>
      {/* 비치는 책 자리를 덮는 보이지 않는 판(웰컴의 `.intro__peek`과 같다): 마우스로 누르면 서가로 */}
      <div className="feature__peek" aria-hidden="true" onClick={onOpenShelf} />
    </section>
  )
}
