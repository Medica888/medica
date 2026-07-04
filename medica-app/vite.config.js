import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  // eslint-disable-next-line no-undef
  const env = loadEnv(mode, process.cwd(), '')
  const apiBase = env.VITE_BACKEND_URL || 'http://localhost:4000'

  return {
    plugins: [react(), tailwindcss()],
    server: {
      proxy: {
        '/api': {
          target: apiBase,
          changeOrigin: true,
        },
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('/src/lib/questionBanks/')) {
              if (id.includes('nbmeQuestions')) return 'question-bank-nbme'
              if (id.includes('uworldQuestions')) return 'question-bank-uworld'
              if (id.includes('balancedQuestions')) return 'question-bank-balanced'
              return 'question-bank'
            }
          },
        },
      },
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.js'],
      env: {
        VITE_USE_BACKEND: 'true',
        VITE_USE_BACKEND_API: 'true',
      },
      testTimeout: 10000,
      exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
      css: false,
    },
  }
})
