import type { AnchorHTMLAttributes, ButtonHTMLAttributes, MouseEvent, ReactNode } from 'react'
import { play } from '../sound/play'

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'children'> & {
  children: ReactNode
}

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'children'> & {
  children: ReactNode
}

const classes = (className?: string) => (className ? `bracket ${className}` : 'bracket')

/**
 * 누르면 소리 자리 `buttonTick`(2026-11-25 효과음)을 부르고, 쓰는 쪽의 `onClick`을 그대로 부른다.
 * 더 갈 곳이 없어 막아 둔 버튼(`aria-disabled`)은 소리가 없다
 */
function withTick<E extends HTMLElement>(onClick: ((e: MouseEvent<E>) => void) | undefined, blocked: unknown) {
  return (e: MouseEvent<E>) => {
    if (blocked !== true && blocked !== 'true') play('buttonTick')
    onClick?.(e)
  }
}

/** 대괄호는 장식이라 읽히는 이름은 라벨뿐이다 */
function Label({ children }: { children: ReactNode }) {
  return (
    <span className="bracket__text">
      <span aria-hidden="true">[ </span>
      {children}
      <span aria-hidden="true"> ]</span>
    </span>
  )
}

/**
 * `[ 라벨 ]` 표기의 버튼.
 * 더 갈 곳이 없을 때는 `disabled` 대신 `aria-disabled`를 준다(포커스가 버튼에 남는다).
 */
export function BracketButton({ children, className, ...rest }: Props) {
  return (
    <button type="button" className={classes(className)} {...rest} onClick={withTick(rest.onClick, rest['aria-disabled'])}>
      <Label>{children}</Label>
    </button>
  )
}

/** 같은 모양의 링크(`<a>`) */
export function BracketLink({ children, className, ...rest }: LinkProps) {
  return (
    <a className={classes(className)} {...rest} onClick={withTick(rest.onClick, rest['aria-disabled'])}>
      <Label>{children}</Label>
    </a>
  )
}
