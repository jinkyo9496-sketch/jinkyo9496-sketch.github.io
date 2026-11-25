/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { bookCountHtml } from './scripts/bookCountHtml'
import { pruneUnusedContent } from './scripts/pruneContent'
import { sharePassword } from './scripts/sharePassword'

export default defineConfig({
  // index.html의 "1~N권"을 책 데이터의 권수로 채운다.
  // 빌드가 끝나면 쓰지 않는 쪽의 본문 그림(미리보기 / 책 전체)을 결과물에서 뺀다
  // 팀 공유(`시작 5291 (팀 공유).bat`)에서는 비밀번호를 묻는다
  plugins: [react(), bookCountHtml(), pruneUnusedContent(), sharePassword()],
  server: { port: 5290, strictPort: true },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
  },
})
