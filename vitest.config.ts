import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@common/*': path.resolve(__dirname, './src/common/*'),
      '@common': path.resolve(__dirname, './src/common'),
      '@project/*': path.resolve(__dirname, './src/*'),
      '@project': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    include: ['**/*.{test,test.unit}.ts'],
    setupFiles: ['src/setup.vitest.ts'],
    silent: process.env.VITEST_SILENT == 'true',
    coverage: {
      provider: 'v8',
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.{test,test.unit,mocks}.ts'],
      reporter: [process.env.VITEST_DETAILED_COVERAGE == 'true' ? 'text' : 'text-summary', 'lcov'],
    },
  },
});
