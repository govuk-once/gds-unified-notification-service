import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@common/*': path.resolve(__dirname, './packages/core/src/*'),
      '@common': path.resolve(__dirname, './packages/core/src'),
      '@project/*': path.resolve(__dirname, './src/*'),
      '@project': path.resolve(__dirname, './src'),
      '@shared/*': path.resolve(__dirname, './shared/*'),
      '@shared': path.resolve(__dirname, './shared'),
      '@test/*': path.resolve(__dirname, 'test/*'),
      '@test': path.resolve(__dirname, './test'),
    },
  },
  test: {
    globals: true,
    silent: 'passed-only',
    testTimeout: 30000,
  },
});
