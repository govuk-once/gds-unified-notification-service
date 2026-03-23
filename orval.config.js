import { defineConfig } from 'orval';

export default defineConfig({
  flex: {
    output: {
      client: 'zod',
      mode: 'single',
      target: './src/.generated/flex.ts',
    },
    input: {
      target: './docs/flex/openapi.yml',
    },
  },
  pso: {
    output: {
      client: 'zod',
      mode: 'single',
      target: './src/.generated/pso.ts',
    },
    input: {
      target: './docs/pso/openapi.yml',
    },
  },
});
