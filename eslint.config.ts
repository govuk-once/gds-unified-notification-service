import js from '@eslint/js';
import vitest from '@vitest/eslint-plugin';
import prettierConfig from 'eslint-config-prettier';
import markdownlint from 'eslint-plugin-markdownlint';
import markdownlintParser from 'eslint-plugin-markdownlint/parser.js';
import prettierPlugin from 'eslint-plugin-prettier';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores([
    '.claude',
    'artifacts',
    'coverage',
    'dist',
    'node_modules',
    'infrastructure/cdk/cdk.out',
    'docs/swagger-ui-bundle.js',
  ]),
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
  {
    files: ['**/*.md'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: ['**/*.md'],
    plugins: { markdownlint },
    languageOptions: { parser: markdownlintParser },
    rules: {
      ...markdownlint.configs.recommended.rules,
      'markdownlint/md013': 'off', // project uses 120-char lines, not 80
      'markdownlint/md024': 'off', // duplicate headings are common in changelogs/READMEs
      'markdownlint/md033': 'off', // inline HTML is intentional in some docs
      'markdownlint/md036': 'off', // emphasis-as-heading is a style choice
      'markdownlint/md041': 'off', // READMEs here legitimately start with ##
      'markdownlint/md060': 'off', // table pipe alignment — long URLs make this impractical
    },
  },
  prettierConfig,
]);
