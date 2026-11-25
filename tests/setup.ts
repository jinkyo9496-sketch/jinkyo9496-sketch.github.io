import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => cleanup())

// jsdom은 <dialog>의 showModal/close를 구현하지 않는다. open 속성과 close 이벤트만 흉내 낸다.
const dialogProto = HTMLDialogElement.prototype
dialogProto.showModal = function showModal(this: HTMLDialogElement) {
  this.setAttribute('open', '')
}
dialogProto.close = function close(this: HTMLDialogElement) {
  if (!this.hasAttribute('open')) return
  this.removeAttribute('open')
  this.dispatchEvent(new Event('close'))
}

// jsdom은 영상의 play/pause를 구현하지 않는다(부르면 "Not implemented" 오류를 적는다). 신간 소개의 영상이 부른다.
const mediaProto = HTMLMediaElement.prototype
mediaProto.play = function play() {
  return Promise.resolve()
}
mediaProto.pause = function pause() {}
