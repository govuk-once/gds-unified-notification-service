import js from '@eslint/js';
import vitest from '@vitest/eslint-plugin';
import prettierConfig from 'eslint-config-prettier';
import prettierPlugin from 'eslint-plugin-prettier';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores(['artifacts', 'coverage', 'dist', 'node_modules', 'infrastructure/cdk/cdk.out']),
  tseslint.configs.recommendedTypeChecked,
  vitest.configs.recommended,
  {
    files: ['**/*.{js,mjs,cjs,ts,mts,cts}'],
    ignores: ['**/*.{test,test.e2e,test.unit}.ts'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
      parserOptions: {
        projectService: true,
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unused-vars': 'warn',
      'no-undef': 'off',
      'no-unused-vars': 'off',
      'prefer-rest-params': 'off',
    },
  },
  {
    files: ['**/*.{test,test.e2e,test.unit}.ts'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...vitest.environments.env.globals,
      },
      parserOptions: {
        projectService: true,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': 'warn',
      'no-unused-vars': 'off',
      'vitest/no-standalone-expect': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/unbound-method': 'off',
    },
  },
  {
    plugins: {
      js,
      prettier: prettierPlugin,
    },
  },
  prettierConfig,
]);
