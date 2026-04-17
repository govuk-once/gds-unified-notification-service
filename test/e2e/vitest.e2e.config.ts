import baseConfig from '../../vitest.config';
import { defineConfig, mergeConfig } from 'vitest/config';

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      name: 'e2e',
      include: ['**/*.{test,test.e2e}.ts'],
      setupFiles: ['setup.e2e.vitest.ts'],
      silent: process.env.VITEST_SILENT == 'true',
    },
  })
);
