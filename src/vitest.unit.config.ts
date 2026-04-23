import { defineConfig, mergeConfig } from 'vitest/config';
import baseConfig from '../vitest.config';

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      name: 'unit',
      include: ['**/*.{test,test.unit}.ts'],
      setupFiles: ['setup.unit.vitest.ts'],
    },
  })
);
