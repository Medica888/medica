import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  // eslint-disable-next-line no-undef
  const env = loadEnv(mode, process.cwd(), '')
  const apiBase = env.VITE_API_BASE_URL || 'http://localhost:3000'

  console.log('apiBase', apiBase);

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
      css: false,
    },
  }
})
