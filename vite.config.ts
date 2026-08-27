import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// GitHub Pages 배포 시 base 를 저장소명으로 바꾼다.
// 🔴 배포 자체는 CEO 승인 게이트다. 여기서는 값만 환경변수로 열어 둔다.
// @types/node 를 넣지 않으려고 globalThis 경유로 읽는다.
const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const base = env['APP_BASE'] ?? '/';

export default defineConfig({
  base,
  plugins: [react()],
  resolve: {
    // 🔴 프로젝트 경로에 한글이 있다. URL.pathname 은 퍼센트 인코딩되므로 반드시 디코딩한다.
    alias: { '@': decodeURIComponent(new URL('./src', import.meta.url).pathname) },
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    minify: 'esbuild',
    assetsInlineLimit: 2048,
    rollupOptions: {
      output: {
        // 초기 청크를 얇게 유지한다(A9). react 는 별도 vendor 청크로 고정.
        manualChunks(id) {
          if (id.includes('node_modules/react')) return 'vendor-react';
          return undefined;
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
