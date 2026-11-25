/**
 * 책 부분들의 도형. 무선 제본(페이퍼백): 표지 한 장이 책등을 감싸고(모서리는 직각, 홈·둥근 등·덧댄 테두리 없음),
 * 종이 묶음은 배·위·아래에서 표지와 같은 선으로 잘려 있다.
 *
 * 닫힌 책의 겉모습은 상자와 같다: 앞표지·뒤표지·책등의 인쇄 면이 바깥 치수를 꽉 채운다.
 * 표지의 두께(COVER_THICKNESS)는 안쪽으로 들어가 있고, 그 단면과 안쪽 면은 종이색이다.
 *
 * 재질 묶음(group): 표지 부분은 0 = 인쇄 면(그림), 1 = 종이. 종이 묶음은 0 = 종이 하나.
 */
import * as THREE from 'three'
import { PAGE_TEXTURE, PLAIN_U } from './pageTexture'
import { bookDimensions, type BookSpec } from './spec'

type Vec3 = [number, number, number]
type Side = 'px' | 'nx' | 'py' | 'ny' | 'pz' | 'nz'
/** image: 그림 한 장을 꽉 채운다 · plain: 무늬 없는 종이 · pages: 책장 줄무늬(두께 방향으로 변한다) */
type FaceUv = 'image' | 'plain' | 'pages'

interface Box {
  min: Vec3
  max: Vec3
}

interface Face {
  box: Box
  side: Side
  uv: FaceUv
  group: number
}

/** 면의 바깥 방향과 위쪽. 옆면은 책의 위(+y)가 위, 위·아랫면은 +x가 위(그래야 가로 u가 두께 방향이 된다) */
const SIDES: Record<Side, { axis: 0 | 1 | 2; sign: 1 | -1; up: Vec3 }> = {
  px: { axis: 0, sign: 1, up: [0, 1, 0] },
  nx: { axis: 0, sign: -1, up: [0, 1, 0] },
  py: { axis: 1, sign: 1, up: [1, 0, 0] },
  ny: { axis: 1, sign: -1, up: [1, 0, 0] },
  pz: { axis: 2, sign: 1, up: [0, 1, 0] },
  nz: { axis: 2, sign: -1, up: [0, 1, 0] },
}

const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

/**
 * 면들을 도형 하나로. 면마다 꼭짓점 넷(바깥에서 보아 왼쪽 아래 → 오른쪽 아래 → 오른쪽 위 → 왼쪽 위),
 * u는 바깥에서 볼 때 오른쪽으로, v는 위로 간다. group이 같은 면끼리 이어 놓는다(그리는 횟수를 줄인다).
 */
function build(faces: Face[]) {
  const positions: number[] = []
  const normals: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  const geometry = new THREE.BufferGeometry()
  const ordered = [...faces].sort((a, b) => a.group - b.group)
  let groupStart = 0
  ordered.forEach((face, f) => {
    const { axis, sign, up } = SIDES[face.side]
    const normal: Vec3 = [0, 0, 0]
    normal[axis] = sign
    const right = cross(up, normal)
    const { min, max } = face.box
    const centre: Vec3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2]
    centre[axis] = sign > 0 ? max[axis] : min[axis]
    const size: Vec3 = [max[0] - min[0], max[1] - min[1], max[2] - min[2]]
    const halfRight = Math.abs(dot(right, size)) / 2
    const halfUp = Math.abs(dot(up, size)) / 2
    // 책장 줄무늬는 두께에 맞춰 이어진다(두꺼운 책이라고 줄이 굵어지지 않는다)
    const span = face.uv === 'pages' ? (halfRight * 2) / PAGE_TEXTURE.span : 1
    const corners: [number, number][] = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ]
    for (const [r, u] of corners) {
      positions.push(
        centre[0] + right[0] * halfRight * r + up[0] * halfUp * u,
        centre[1] + right[1] * halfRight * r + up[1] * halfUp * u,
        centre[2] + right[2] * halfRight * r + up[2] * halfUp * u,
      )
      normals.push(...normal)
      if (face.uv === 'plain') uvs.push(PLAIN_U, 0.5)
      else if (face.uv === 'pages') uvs.push(((r + 1) / 2) * span, 0.5)
      else uvs.push((r + 1) / 2, (u + 1) / 2)
    }
    const v = f * 4
    indices.push(v, v + 1, v + 2, v, v + 2, v + 3)
    const next = ordered[f + 1]
    if (!next || next.group !== face.group) {
      geometry.addGroup(groupStart, (f + 1) * 6 - groupStart, face.group)
      groupStart = (f + 1) * 6
    }
  })
  geometry.setIndex(indices)
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  return geometry
}

export interface BookGeometries {
  frontCover: THREE.BufferGeometry
  backCover: THREE.BufferGeometry
  spine: THREE.BufferGeometry
  pageBlock: THREE.BufferGeometry
}

/** 책 한 권의 네 부분(책 좌표, 책 높이 = 1). 겹치는 면이 없다(어른거림 없음) */
export function createBookGeometries(spec: Pick<BookSpec, 'coverAspect' | 'spineAspect'>): BookGeometries {
  const { width, depth, cover: c } = bookDimensions(spec)
  const x0 = -width / 2
  const x1 = width / 2
  const z0 = -depth / 2
  const z1 = depth / 2
  const y: [number, number] = [-0.5, 0.5]
  const box = (xa: number, xb: number, za: number, zb: number): Box => ({ min: [xa, y[0], za], max: [xb, y[1], zb] })

  // 인쇄 면은 바깥 치수 전체, 표지의 몸(단면·안쪽 면)은 책등이 차지한 모서리를 뺀 나머지
  const outer = box(x0, x1, z0, z1)
  const frontSlab = box(x0 + c, x1, z1 - c, z1)
  const backSlab = box(x0 + c, x1, z0, z0 + c)
  const spineSlab = box(x0, x0 + c, z0, z1)
  const block = box(x0 + c, x1, z0 + c, z1 - c)

  return {
    frontCover: build([
      { box: outer, side: 'pz', uv: 'image', group: 0 },
      { box: frontSlab, side: 'nz', uv: 'plain', group: 1 },
      { box: frontSlab, side: 'px', uv: 'plain', group: 1 },
      { box: frontSlab, side: 'py', uv: 'plain', group: 1 },
      { box: frontSlab, side: 'ny', uv: 'plain', group: 1 },
    ]),
    backCover: build([
      { box: outer, side: 'nz', uv: 'image', group: 0 },
      { box: backSlab, side: 'pz', uv: 'plain', group: 1 },
      { box: backSlab, side: 'px', uv: 'plain', group: 1 },
      { box: backSlab, side: 'py', uv: 'plain', group: 1 },
      { box: backSlab, side: 'ny', uv: 'plain', group: 1 },
    ]),
    spine: build([
      { box: outer, side: 'nx', uv: 'image', group: 0 },
      { box: spineSlab, side: 'px', uv: 'plain', group: 1 },
      { box: spineSlab, side: 'py', uv: 'plain', group: 1 },
      { box: spineSlab, side: 'ny', uv: 'plain', group: 1 },
    ]),
    pageBlock: build([
      { box: block, side: 'px', uv: 'pages', group: 0 },
      { box: block, side: 'py', uv: 'pages', group: 0 },
      { box: block, side: 'ny', uv: 'pages', group: 0 },
      { box: block, side: 'pz', uv: 'plain', group: 0 },
      { box: block, side: 'nz', uv: 'plain', group: 0 },
      { box: block, side: 'nx', uv: 'plain', group: 0 },
    ]),
  }
}
