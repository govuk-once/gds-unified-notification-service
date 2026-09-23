## Unit testing conventions

Unit tests are colocated with the code they test - there is no separate `unit` directory. This mirrors [`src/lambdas/README.md`](./lambdas/README.md)'s convention of keeping a lambda's `handler.ts` and its test in the same directory.

Run them via:

```sh
pnpm run test:unit

# With coverage
pnpm run test:coverage
VITEST_DETAILED_COVERAGE=true pnpm run test:coverage # per-file breakdown instead of a summary
```

Configuration lives in [`vitest.unit.config.ts`](./vitest.unit.config.ts) (extended from the root [`vitest.config.ts`](../vitest.config.ts)), with shared setup in [`setup.unit.vitest.ts`](./setup.unit.vitest.ts).

### File naming & location

- Test files sit next to the file under test and are named `<subject>.test.unit.ts` (e.g. `handler.ts` / `handler.test.unit.ts`, `campaignsDynamoRepository.ts` / `campaignsDynamoRepository.test.unit.ts`).
- Shared test helpers (factories, mock builders) are named `<name>.test.util.ts` and live under [`src/common/utils`](./common/utils) (e.g. `mockConfigurationImplementation.test.util.ts`, `mockInstanceFactory.test.util.ts`) so they can be imported via the `@common/utils` alias from any test.
- Files matching `*.{test,test.unit}.ts` are excluded from coverage instrumentation (see `coverage.exclude` in [`vitest.config.ts`](../vitest.config.ts)).

### Structure

- Group tests for a unit with a single top-level `describe('<ClassName / Handler name>', () => { ... })`.
- Individual `it(...)` blocks read as a sentence describing the expected behaviour, e.g. `it('should return a status 202 and list of NotificationIDs when call is successful.', ...)`.
- Within a test body, mark the phases with `// Arrange`, `// Act`, `// Assert` comments (the `// Arrange` comment is commonly omitted when there's no setup beyond the shared `beforeEach`).
- Reset mock state in `beforeEach`: `vi.resetAllMocks()` and `vi.useRealTimers()`, then re-seed mocks needed for the majority of tests in that file. Tests that need deterministic timestamps opt into `vi.useFakeTimers()` / `vi.setSystemTime(...)` individually.

### Mocking conventions

- AWS Lambda Powertools (`@aws-lambda-powertools/logger|metrics|tracer`) and the internal `@common/services` / `@common/repositories` barrels are auto-spied at the top of the file:

  ```ts
  vi.mock('@aws-lambda-powertools/logger', { spy: true });
  vi.mock('@aws-lambda-powertools/metrics', { spy: true });
  vi.mock('@aws-lambda-powertools/tracer', { spy: true });
  vi.mock('@common/services', { spy: true });
  vi.mock('@common/repositories', { spy: true });
  ```

- Use the shared factories in `mockInstanceFactory.test.util.ts` instead of hand-rolling mocks:
  - `observabilitySpies()` - a mocked `ObservabilityService` (logger/metrics/tracer).
  - `ServiceSpies(observabilityMock)` - mocked instances of every service/repository, wired to share the same observability mock, returned as a keyed object (e.g. `notificationsDynamoRepositoryMock`, `processingQueueServiceMock`).
- Use `mockDefaultConfig()` + `mockGetParameterImplementation(...)` from `mockConfigurationImplementation.test.util.ts` to stub SSM parameter/secret lookups on `configurationServiceMock.getParameter`, rather than hardcoding config values per test.
- Construct the handler under test by instantiating it directly with the mocked dependencies (see any `http.*/handler.test.unit.ts`), then call `instance.handler()` to obtain the actual Lambda handler function.
- Third-party HTTP calls (e.g. OneSignal, UDP) are intercepted with [MSW](https://mswjs.io/) rather than mocked at the module level. Handlers live in [`src/_unittesthttpmocks`](./_unittesthttpmocks) (one file per provider, aggregated in `index.ts`) and are wired up automatically by `setup.unit.vitest.ts`. Unhandled requests throw by design (`onUnhandledRequest: 'error'`) - add a handler rather than suppressing the error.
  - Set `VITEST_DISABLE_MSW=true` to bypass MSW entirely and let requests hit the real network (useful for one-off debugging, not for CI).

### Coverage requirements

Coverage is measured with the `v8` provider and gated at **80%** for statements, branches, functions and lines (see `coverage.thresholds` in [`vitest.config.ts`](../vitest.config.ts)). This is enforced in the PR pipeline - see [`.github/README-Pipelines.md`](../.github/README-Pipelines.md).
