import { defineConfig } from 'vitest/config';
import path from 'path';

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
  },
});
