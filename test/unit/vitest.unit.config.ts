import { defineConfig, mergeConfig } from 'vitest/config';
import baseConfig from '../../vitest.base.config';

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      name: 'unit',
      include: [
        '**/*.{test,test.unit}.ts',
        '../../packages/core/src/**/*.{test,test.unit}.ts',
        '../../packages/pso/src/**/*.{test,test.unit}.ts',
        '../../packages/flex/src/**/*.{test,test.unit}.ts',
      ],
      setupFiles: ['setup.unit.vitest.ts'],
    },
  })
);
