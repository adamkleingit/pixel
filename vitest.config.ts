import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'server',
          environment: 'node',
          include: ['packages/server/src/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'ui',
          environment: 'jsdom',
          include: ['packages/ui/src/**/*.test.{ts,tsx}'],
        },
      },
    ],
  },
})
