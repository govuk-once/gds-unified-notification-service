import { defineConfig, mergeConfig } from 'vitest/config';
import baseConfig from '../../vitest.config';

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      name: 'e2e',
      include: ['**/*.{test,test.e2e}.ts'],
      setupFiles: ['utils/setup.e2e.vitest.ts'],
      testTimeout: 60000,
    },
  })
);
