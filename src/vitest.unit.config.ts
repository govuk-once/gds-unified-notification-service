import baseConfig from '../vitest.config';
import { defineConfig, mergeConfig } from 'vitest/config';

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      name: 'unit',
      include: ['**/*.{test,test.unit}.ts'],
      setupFiles: ['setup.unit.vitest.ts'],
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
        exclude: ['src/**/*.{test,test.unit,mocks,util}.ts'],
        reporter: [process.env.VITEST_DETAILED_COVERAGE == 'true' ? 'text' : 'text-summary', 'lcov'],
      },
    },
  })
);
