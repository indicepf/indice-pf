import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      // 'server-only' lança fora do ambiente Next; nos testes vira módulo vazio
      'server-only': path.resolve(__dirname, 'tests/stubs/server-only.ts'),
      '@': path.resolve(__dirname),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
})
