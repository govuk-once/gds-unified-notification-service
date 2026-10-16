import { defineConfig, mergeConfig } from 'vitest/config';
import baseConfig from '../../vitest.base.config';

export default mergeConfig(
  baseConfig,
  defineConfig({
    define: {
      isCI: process.env.UNS_E2E_RUNNER === 'true' || process.env.GITHUB_ACTIONS === 'true',
    },
    test: {
      name: 'e2e',
      include: ['**/*.{test,test.e2e}.ts'],
      setupFiles: ['utils/setup.e2e.vitest.ts'],
      globalSetup: ['utils/global-setup.e2e.ts'],
      testTimeout: 60000,
    },
  })
);
