import path from 'node:path';
import { defineConfig } from 'vitest/config';
import { BaseSequencer, TestSpecification } from 'vitest/node';

class SortedSequencer extends BaseSequencer {
  sort(files: TestSpecification[]): Promise<TestSpecification[]> {
    return Promise.resolve(files.sort((a, b) => a.moduleId.localeCompare(b.moduleId)));
  }
}

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
    sequence: {
      sequencer: SortedSequencer,
    },
    reporters:
      process.env.VITEST_HTML_REPORT === 'true' ? ['html'] : process.env.VITEST_TREE_REPORT === 'true' ? ['tree'] : [],
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
    silent: 'passed-only',
    testTimeout: 30000,
  },
});
