import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/',
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/testing/setup.ts',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/test/**', 'src/**/*.test.{ts,tsx}', 'src/testing/**', 'src/**/*.d.ts'],
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 70,
        statements: 60,
      },
    },
  },
});
