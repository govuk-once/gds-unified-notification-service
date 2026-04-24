import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@common/*': path.resolve(__dirname, './src/common/*'),
      '@common': path.resolve(__dirname, './src/common'),
      '@project/*': path.resolve(__dirname, './src/*'),
      '@project': path.resolve(__dirname, './src'),
      '@test/*': path.resolve(__dirname, 'test/*'),
      '@test': path.resolve(__dirname, './test'),
    },
  },
  test: {
    globals: true,
    projects: ['src/vitest.unit.config.ts', 'test/e2e/vitest.e2e.config.ts'],
    coverage: {
      provider: 'v8',
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.{test,test.unit,mocks,util}.ts'],
      reporter: [process.env.VITEST_DETAILED_COVERAGE == 'true' ? 'text' : 'text-summary', 'lcov'],
    },
    silent: process.env.VITEST_SILENT == 'true',
  },
});
