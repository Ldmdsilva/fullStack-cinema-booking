import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// Vitest config — separate from vite.config.ts so the coverage/test-only
// settings below never leak into the production build config.
export default defineConfig({
  envPrefix: 'VITE_',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./src/test/setupTests.ts'],
    css: true,
    restoreMocks: true,
    // client.ts reads import.meta.env.VITE_API_URL with no fallback. It's
    // normally set by the gitignored .env, which doesn't exist in CI — set
    // it here so the MSW handlers (registered under /api/*) match requests
    // the same way in CI as they do locally.
    env: {
      VITE_API_URL: '/api',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/main.tsx',
        'src/vite-env.d.ts',
        'src/lib/types.ts',
        'src/test/**',
        'src/**/*.test.{ts,tsx}',
        'src/**/*.d.ts',
      ],
      thresholds: {
        lines: 60,
        statements: 60,
        functions: 60,
        branches: 60,
      },
    },
  },
})
