/**
 * 책 자산 목록: 3D 모형을 만드는 데 필요한 것(번호·제목·비율·그림 경로)을 `data/books.ts`에서 뽑는다.
 * 더 큰 표지 그림이 생기면 여기 `HIGH_RES_IMAGES`만 채우면 된다(다른 곳은 고치지 않는다).
 */
import { books, type Book } from '../data/books'
import type { BookImages, BookSpec } from './spec'

export type ImageQuality = 'standard' | 'high'

export interface BookAsset {
  no: number
  title: string
  coverAspect: number
  spineAspect: number
  images: {
    /** 지금의 표지 그림(앞표지 폭 500px). 서가가 쓴다 */
    standard: BookImages
    /** 더 큰 그림 한 벌. 아직 없으면 null */
    high: BookImages | null
  }
}

/**
 * 권 번호 → 큰 그림 한 벌(앞·뒤·책등). 비율은 standard와 같아야 한다.
 * 예: `7: { front: '/covers-2x/07_front.jpg', back: '/covers-2x/07_back.jpg', spine: '/covers-2x/07_spine.jpg' }`
 */
export const HIGH_RES_IMAGES: Partial<Record<number, BookImages>> = {}

export function bookAssetFrom(book: Book): BookAsset {
  return {
    no: book.no,
    title: book.title,
    coverAspect: book.coverAspect,
    spineAspect: book.spineAspect,
    images: { standard: book.images, high: HIGH_RES_IMAGES[book.no] ?? null },
  }
}

/** 전 권의 자산, 번호순 */
export const bookAssets: readonly BookAsset[] = books.map(bookAssetFrom)

/** 쓸 그림 한 벌: 'high'를 원하고 큰 그림이 있으면 그것, 아니면 standard */
export function imagesFor(asset: Pick<BookAsset, 'images'>, quality: ImageQuality = 'standard'): BookImages {
  return quality === 'high' && asset.images.high ? asset.images.high : asset.images.standard
}

/** `Book`을 모형의 스펙으로. 서가는 'standard'(기본), 한 권을 크게 보이는 화면은 'high'를 쓴다 */
export function bookSpecFrom(book: Book, quality: ImageQuality = 'standard'): BookSpec {
  const asset = bookAssetFrom(book)
  return {
    no: asset.no,
    title: asset.title,
    coverAspect: asset.coverAspect,
    spineAspect: asset.spineAspect,
    images: imagesFor(asset, quality),
  }
}
