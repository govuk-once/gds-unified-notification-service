## End to end testing conventions

These tests exercise the deployed PSO and Flex APIs over HTTPS (mTLS) using [Cucumber](https://cucumber.io/) with Gherkin feature files, rather than calling handlers directly — see [Unit testing conventions](../README.md) for local, mocked tests.

Run them via:

```sh
# Against your sandbox environment
pnpm run test:e2e

# Against a specific environment
env=dev pnpm run test:e2e
```

Configuration lives in [`cucumber.json`](../../cucumber.json) at the repo root. It points to feature files in [`test/e2e/features/`](./features/), imports step definitions from [`test/e2e/steps/`](./steps/) and support files from [`test/e2e/support/`](./support/) (including the tsx loader [`register-tsx.mjs`](./support/register-tsx.mjs) which must load first). Tests run with 5 parallel workers and a 30-second default timeout.

### Prerequisites

- An authenticated AWS shell session against the target account, e.g. `eval $(gds-cli aws once-notifications-development-admin -e)` (see the root [README.md](../../README.md#setting-up-dev--sandbox-environment)) — `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and `AWS_REGION` must be present.
- mTLS certificates and API keys are fetched automatically at suite startup from Secrets Manager / API Gateway (see [`shared/credentials.ts`](../../shared/credentials.ts)) — run `pnpm run development:sandbox:setup` first if this fails, to provision the domain names these tests depend on. To fetch a certificate pair to disk (e.g. for `curl` or another client), use `pnpm run download:certificates [certificateId]`.

#### Zscaler certificate setup

If you are using Zscaler, some of the e2e tests will fail as Zscaler intercepts the TLS traffic and Node rejects these request unless you trust the Zscaler root CA. On mac,

```sh
# Check the common Zscaler install directory and find certs
find /Library/Application\ Support/Zscaler -name "*.pem" -o -name "*.crt" 2>/dev/null
# Or in Keychain (most likely)
security find-certificate -a -c "Zscaler" /Library/Keychains/System.keychain

# Export the Zscaler cert to PEM format
mkdir -p ~/.config/zscaler
security find-certificate -a -p -c "Zscaler" /Library/Keychains/System.keychain > ~/.config/zscaler/zscaler-ca.pem

# Then tell Node to trust this cert permanently (assuming zsh)
echo "export NODE_EXTRA_CA_CERTS=~/.config/zscaler/zscaler-ca.pem" >> ~/.zshrc
source ~/.zshrc
```

### File naming & location

- **Feature files** live in [`test/e2e/features/`](./features/) and are named `<api>.<operationName>.feature` (e.g. `pso.postMessage.feature`, `flex.getNotifications.feature`), matching the handler directory naming convention under `packages/pso/src/handlers/` and `packages/flex/src/handlers/`.
- **Step definitions** live in [`test/e2e/steps/`](./steps/) and are named `<domain>.steps.ts` (e.g. `messages.steps.ts`, `notification.steps.ts`, `campaign.steps.ts`). The `outcome.step.ts` file contains the shared `Then` steps for asserting success or failure.
- **Helpers** live in [`test/e2e/helpers/`](./helpers/) (e.g. `errorAssertions.ts`, `waitFor.ts`, `uuid.ts`, `client.ts`, `campaign.ts`, `groups.ts`, `notification.ts`).
- **Support files** live in [`test/e2e/support/`](./support/) — [`hook.ts`](./support/hook.ts) (Cucumber lifecycle hooks and world constructor), [`world.ts`](./support/world.ts) (custom World class), and [`register-tsx.mjs`](./support/register-tsx.mjs) (tsx ESM loader).

### Structure

#### Feature files

Each `.feature` file uses Gherkin syntax to describe scenarios in natural language:

```gherkin
@Pso
Feature: Send Notification

  Scenario Outline: Validation failures
    Given a correctly configured PSO client
    When I attempt to send a notification <Condition>
    Then it should fail with a validation error

    Examples: Missing required fields
      | Condition               |
      | with no UserID          |
      | with no NotificationBody|
```

Tags like `@Pso`, `@Flex`, and `@CIOnly` control filtering and conditional execution. Scenarios tagged `@CIOnly` are skipped outside CI (checked in `hook.ts`).

#### World

The custom World class ([`support/world.ts`](./support/world.ts)) holds all per-scenario state: pre-configured API clients (`psoAPI`, `flexAPI`, and deliberately-broken variants for negative testing like `psoAPIWithoutAPIKey`, `psoAPIWithoutMTLSCert`, `psoAPIUsingInsecureProtocol`), test data (`notificationID`, `campaignID`, `pushID`), and assertion/cleanup queues.

Cucumber creates a fresh World for each scenario. `BeforeAll` in [`hook.ts`](./support/hook.ts) caches the mTLS agent, API keys and domains once per parallel worker; `Before` applies them to each new World via `applyDispatchConfig`.

#### Step definitions

Steps map Gherkin phrases to TypeScript functions using `Given`, `When`, and `Then` from `@cucumber/cucumber`. Custom parameter types (e.g. `{MessageVariant}`, `{APIConfig}`, `{expectedError}`) are registered with `defineParameterType` in the step files that own them.

- **`client.steps.ts`** — `Given a correctly configured {word} client` and `But` overrides for insecure/missing-auth variants.
- **`messages.steps.ts`** — `When I attempt to send a notification {MessageVariant}` for both `/send` and `/v1/send-to-group`.
- **`notification.steps.ts`** — `Given a notification exists`, `When I attempt to get/delete/patch...` for Flex notification endpoints.
- **`campaign.steps.ts`** — `Given a campaign exists`, `When I attempt to get the campaign status`.
- **`group.steps.ts`** — `Given I have joined the following groups:`, `When I attempt to get/modify groups`.
- **`status.steps.ts`** — `When I attempt to get the PSO status`.
- **`outcome.step.ts`** — `Then it should succeed` and `Then it should fail with {expectedError}`, the shared outcome assertions used by all features.

### Assertions

- **Success/failure outcomes** are handled centrally in `outcome.step.ts`. Each `When` step pushes domain-specific checks onto `this.assertions` (happy path) or `this.errorAssertions` (sad path), which the `Then` step executes.
- **Validation errors** use the shared `pushErrorAssertions` function from [`helpers/errorAssertions.ts`](./helpers/errorAssertions.ts). The `validationErrorVariants` map associates each Gherkin condition string (e.g. `'with no UserID'`) with the keyword substrings the error response must contain.
- **Eventual consistency** is polled with the custom `waitFor` from [`helpers/waitFor.ts`](./helpers/waitFor.ts), which retries a callback at a given interval until it passes or the timeout expires.
- **Test data isolation** — each scenario generates unique IDs via `e2eUUID` from [`helpers/uuid.ts`](./helpers/uuid.ts) and registers cleanup callbacks on `this.cleanups`, which the `After` hook drains.

### Scope

- E2E runs in CI against every PR environment (from the GitHub runner) and after each `dev`/`staging` deploy (inside the VPC, in CodeBuild, which is needed to reach the private Flex API). Production runs only the unit test suite as part of deployment (`pnpm run test:unit`), to avoid shipping test data into production analytics. See [Deployment Guide: Reusable deploy workflow](../../docs/deployment.md#reusable-deploy-workflow).
- `UNS_E2E_RUNNER=true` is set when the suite runs inside the CodeBuild runner, switching API resolution to the private API Gateway. Scenarios tagged `@CIOnly` are skipped when this flag and `GITHUB_ACTIONS` are both absent.

### Gotchas

- **Zscaler section is the canonical source** — the root [`README.md`](../../README.md) links to `test/e2e/README.md#zscaler-certificate-setup`. If you move or rename that section, update the inbound link.
- **`register-tsx.mjs` must load first** — Cucumber imports are ordered by the `import` array in [`cucumber.json`](../../cucumber.json). If `register-tsx.mjs` isn't first, TypeScript step files fail to parse because tsx hasn't registered yet.
- **`BeforeAll` runs once per worker, not once globally** — with `"parallel": 5` in `cucumber.json`, the mTLS agent and API keys are fetched up to 5 times. This is intentional (each worker needs its own agent), but can look like duplicate work in logs.
- **Cleanup failures don't fail the scenario** — the `After` hook in [`hook.ts`](./support/hook.ts) logs cleanup errors but doesn't throw, so a flaky delete won't mask the real test result. Check the logs if you see orphaned test data.
