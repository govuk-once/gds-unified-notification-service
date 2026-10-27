import path from 'node:path';
import { defineConfig, mergeConfig } from 'vitest/config';
import baseConfig from '../../vitest.base.config';

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      name: 'unit',
      root: path.resolve(__dirname, '../..'),
      include: [
        'test/unit/**/*.{test,test.unit}.ts',
        'packages/core/src/**/*.{test,test.unit}.ts',
        'packages/pso/src/**/*.{test,test.unit}.ts',
        'packages/flex/src/**/*.{test,test.unit}.ts',
      ],
      setupFiles: ['test/unit/setup.unit.vitest.ts'],
    },
  })
);
