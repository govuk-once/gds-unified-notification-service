import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['**/*.{test,test.unit}.ts'],

    coverage: {
      provider: 'v8',
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.{test,test.unit}.ts'],
    },
  },
});
