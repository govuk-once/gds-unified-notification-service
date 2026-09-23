## End to end testing conventions

These tests exercise the deployed PSO and Flex APIs over HTTPS (mTLS), rather than calling handlers directly - see [Unit testing conventions](../../src/README.md) for local, mocked tests.

Run them via:

```sh
# Against your sandbox environment
pnpm run test:e2e

# Against a specific environment
env=dev pnpm run test:e2e
```

Configuration lives in [`vitest.e2e.config.ts`](./vitest.e2e.config.ts) (extended from the root [`vitest.config.ts`](../../vitest.config.ts)), with shared setup in [`utils/setup.e2e.vitest.ts`](./utils/setup.e2e.vitest.ts). The per-test timeout is 60s (higher than the unit test default) to accommodate real network round trips and eventual-consistency polling.

### Prerequisites

- An authenticated AWS shell session against the target account, e.g. `eval $(gds-cli aws once-notifications-development-admin -e)` (see the root [README.md](../../README.md#setting-up-dev--sandbox-environmnent)) - `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and `AWS_REGION` must be present.
- mTLS certificates and API keys are fetched automatically at suite startup from Secrets Manager / API Gateway - run `pnpm run development:sandbox:setup` first if this fails, to provision the domain names these tests depend on.

### File naming & location

- Test files live under `test/e2e/` and are named `<api>.<operationName>.test.e2e.ts` (e.g. `pso.postMessage.test.e2e.ts`, `flex.getNotifications.test.e2e.ts`), matching the operation naming convention in [`src/lambdas/README.md`](../../src/lambdas/README.md).
- Files matching `*.{test,test.e2e}.ts` are picked up automatically; no separate registration is needed.
- Shared fixtures/helpers live in `test/e2e/utils/` (e.g. `setup.e2e.vitest.ts`, `FetchErrors.ts`).

### Structure

- Use the `test` export from `utils/setup.e2e.vitest.ts` (not the base `test` from `vitest`) - it's a fixture-extended test that injects pre-configured API clients as arguments, e.g. `test('...', async ({ psoAPI }) => { ... })`.
- Available fixtures include `psoAPI` / `flexAPI` (fully authenticated), plus deliberately-broken variants for negative testing: `psoAPIWithoutAPIKey`, `psoAPIWithoutMTLSCert`, `psoAPIUsingInsecureProtocol` (and Flex equivalents).
- Group tests per endpoint under a top-level `describe('<Verb /path>', () => { ... })`, with nested `describe('Happy paths', ...)` / `describe('Unhappy paths', ...)` blocks where a file covers both.
- Test titles read as `'status <code> when - <condition>'` (or the specific error code for network-level failures, e.g. `'ECONNRESET when - missing MTLS certificate'`).
- Mark phases with `// Arrange`, `// Act`, `// Assert` comments, same as unit tests.
- Generate fresh, unique test data per test (e.g. `notificationID = uuid()` in `beforeEach`) - these run against shared, real infrastructure, so tests must not depend on state left by other runs.

### Assertions

- For expected validation failures, assert against the shared matchers in `utils/FetchErrors.ts` (`BadRequestAxiosError(errors)`, `NotFoundAxiosError(errors)`) rather than hand-writing the error shape.
- For state that becomes consistent asynchronously (e.g. a notification's status after being queued), poll with `vi.waitFor(() => checkStatus(psoAPI, notificationID), { timeout, interval })` (`checkStatus` is exported from `setup.e2e.vitest.ts`) instead of a fixed `sleep`.

### Scope

- Production runs only the unit test suite as part of deployment (`pnpm run test:unit`); e2e tests run against dev/staging only, to avoid shipping test data into production analytics - see the "Environment deploy steps" section of [`.github/README-Pipelines.md`](../../.github/README-Pipelines.md).
