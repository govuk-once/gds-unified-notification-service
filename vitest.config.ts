import { defineConfig, mergeConfig } from 'vitest/config';
import { BaseSequencer, TestSpecification } from 'vitest/node';
import baseConfig from './vitest.base.config';

class SortedSequencer extends BaseSequencer {
  sort(files: TestSpecification[]): Promise<TestSpecification[]> {
    return Promise.resolve(files.sort((a, b) => a.moduleId.localeCompare(b.moduleId)));
  }
}

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      globals: true,
      projects: ['src/vitest.unit.config.ts', 'test/e2e/vitest.e2e.config.ts'],
      sequence: {
        sequencer: SortedSequencer,
      },
      reporters:
        process.env.VITEST_HTML_REPORT === 'true'
          ? ['html']
          : process.env.VITEST_TREE_REPORT === 'true'
            ? ['tree']
            : [],
      coverage: {
        provider: 'v8',
        thresholds: {
          statements: 80,
          branches: 80,
          functions: 80,
          lines: 80,
        },
        include: ['src/**/*.ts'],
        exclude: ['src/**/*.{test,test.unit,mocks,util}.ts', 'src/common/ioc.ts'],
        reporter: [process.env.VITEST_DETAILED_COVERAGE == 'true' ? 'text' : 'text-summary', 'lcov'],
      },
      silent: 'passed-only',
      testTimeout: 30000,
    },
  })
);
