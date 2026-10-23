# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

GDS Unified Notification Service — a serverless notification system for GOV.UK built on AWS. Two API surfaces:

- **PSO API** — Public Service Organisations send notifications (mTLS via CloudFront viewer mTLS + API key auth). `POST /send` validates inline and publishes to SQS: processing → dispatch, with analytics fed from every stage. Group sends go via groupprocessing → groupProcessingWorker → dispatch. (`incoming` → `sqs.validation` exists but has no producer in this repo.)
- **Flex API** — End-user apps read/manage notifications and groups (API key auth via VPC endpoint).

## Commands

```sh
pnpm install                        # install dependencies
pnpm run build                      # esbuild bundle lambdas → dist/
pnpm run build:validate             # typecheck only (tsc6 --noEmit via @typescript/typescript6)
pnpm run lint                       # eslint + prettier (check)
pnpm run lint:fix                   # eslint + prettier (auto-fix)
pnpm run test                       # all tests in watch mode (development)
pnpm run test:unit                  # unit tests, run once and exit
pnpm run test:e2e                   # e2e tests, run once and exit (requires mTLS certs + AWS credentials)
pnpm run test:coverage              # unit tests with coverage
pnpm run cdk:synth                  # synthesize CloudFormation templates
pnpm run cdk:diff                   # diff against deployed stack
pnpm run checkov                    # IaC security scanning on CDK output
pnpm run download:certificates      # fetch mTLS client cert pairs from Secrets Manager (read-only)
pnpm run changelog                  # regenerate CHANGELOG.md locally (git-ignored, CI generates it on release)
```

Run a single test file:

```sh
pnpm vitest run src/lambdas/pso/http.postMessage/handler.test.unit.ts
```

Run tests matching a name:

```sh
pnpm vitest run -t "should return 200"
```

Test environment variables:

```sh
VITEST_DISABLE_MSW=true pnpm run test:unit    # disable MSW, allow real HTTP
VITEST_DETAILED_COVERAGE=true pnpm run test:coverage  # per-file coverage
env=dev pnpm run test:e2e                     # e2e against dev environment
```

## Architecture

### Source Layout

- `src/lambdas/pso/` — PSO API Lambda handlers (HTTP and SQS-triggered)
- `src/lambdas/flex/` — Flex API Lambda handlers
- `src/common/services/` — Business logic (notification, processing, validation, analytics, cache, circuit breaker, configuration)
- `src/common/services/adapters/` — Notification adapters (OneSignal, Void) and processing adapters (UDP, Prefixbased, Void)
- `src/common/repositories/` — DynamoDB repositories
- `src/common/middlewares/` — Middy middleware (request/response validation, auth, error handling)
- `src/common/operations/` — Lambda handler wrappers by trigger type (HTTP, SQS, schedule)
- `src/common/models/` — Enums, error classes, organisation metadata
- `src/common/ioc.ts` — Custom IoC container with singleton, time-bound singleton, and new-instance modes

Lambda directories follow `{trigger}.{operationName}/` naming. Each contains `handler.ts` and `handler.test.unit.ts`.

### Infrastructure Layout

- `infrastructure/cdk/cdk.ts` — CDK app entrypoint
- `infrastructure/cdk/config.ts` — Config loading from env vars + SSM Parameter Store
- `infrastructure/cdk/constructs/` — Stacks (UNSGlobalStack in us-east-1, UNSStack, UNSAlarmsStack, UNSTestingStack) and UNSStack's constructs (UNSCommon, UNSMTLS, UNSOrganisations, UNSPSOResources, UNSFlexResources). `cdk:deploy` deploys `--all`
- `infrastructure/cdk/constructs/alarmsConstructs/`, `dashboards/` — CloudWatch alarms (catalogued in `docs/alarms.md`) and dashboards
- `infrastructure/cdk/buildspecs/` — CodeBuild buildspecs for the e2e runner and ZAP scans
- `shared/ssmParameter.ts`, `shared/secretParameters.ts` — single registry of every SSM parameter and secret (see `docs/configuration.md`)
- `infrastructure/cdk/constructs/bases/` — Reusable CDK constructs (API Gateway, Lambda, DynamoDB, SQS, S3, ElastiCache, VPC, KMS)
- `infrastructure/cdk/consumers/` — mTLS client certificates per environment (incl. rolling rotation) and organisation config (`consumersMetadata.ts`)

### IoC Container

`src/common/ioc.ts` provides dependency injection with three modes:

- **SINGLETON** — one instance for the lifetime of the Lambda container
- **TIMEBOUND_SINGLETON** — recreated after TTL expires (used for config-dependent classes to pick up SSM parameter changes without cold starts)
- **NEW_INSTANCE** — fresh instance per call

### Path Aliases

```text
@common/*  → src/common/*
@project/* → src/*
@shared/*  → shared/*
@test/*    → test/*
```

## Testing

- **Framework:** Vitest with two projects — `unit` (under `src/`) and `e2e` (under `test/e2e/`)
- **Unit tests:** co-located with handlers as `handler.test.unit.ts`. Use MSW for HTTP mocking and `aws-sdk-client-mock` for AWS SDK mocking
- **E2E tests:** run against deployed environments with mTLS client certificates and API keys fetched from AWS at runtime
- **Coverage thresholds:** 80% for statements, branches, functions, and lines
- **Test timeout:** 30s unit, 60s e2e

## Commit Convention

Format: `type(SCOPE): subject`

- **Types:** `build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test|BREAKING CHANGE|BREAKING`
- **Scope:** UPPER-CASE ticket number (e.g., `NOT-123`, `ABC-456`)
- **Example:** `feat(NOT-111): added unit tests`

Enforced by a regex validation script (`scripts/validate-commit-msg.ts`) via Husky's `commit-msg` hook. The pre-commit hook also runs typecheck, unit tests, and lint in parallel.

## Tech Stack

- **Runtime:** Node.js 22 (ESM), TypeScript 6 (via `@typescript/typescript6` compat shim aliased as `typescript`)
- **Package manager:** pnpm 11.x
- **Build:** esbuild (via `tsx scripts/build.ts`)
- **Infrastructure:** AWS CDK v2
- **Key libraries:** AWS Lambda Powertools (logger, metrics, tracer, batch, parser, parameters), Middy (middleware), Zod v4 (validation), Redis (ElastiCache caching)
- **Environments:** developer sandboxes (ephemeral/DESTROY), `dev`, `stg`, `prod` (RETAIN). Region: `eu-west-2`

## Safety

Never run `cdk deploy`, `cdk destroy`, or any command that creates, modifies, or deletes AWS resources unless the user explicitly asks for it. This includes direct AWS CLI/SDK calls that mutate infrastructure (e.g., `aws s3 rm`, `aws dynamodb delete-table`). Read-only commands like `cdk synth`, `cdk diff`, and `checkov` are fine.

Never commit or log secrets, credentials, or private key material. This includes `.pem`, `.key`, `.env` files, API keys, mTLS certificates, and AWS credentials. If a file looks like it may contain secrets, check its contents before staging.

Never run E2E tests (`pnpm run test:e2e`) unless the user explicitly asks for it. They execute against real deployed environments and can trigger real notifications.

Never target `prod` or `stg` environments (e.g., `env=prod`, `env=stg`) without explicit user confirmation. Default to `dev` when an environment is needed.

## Code Style

- Prettier: single quotes, 2-space indent, 120-char lines, trailing commas (ES5), semicolons
- ESLint: typescript-eslint with type checking. `no-floating-promises: error`
- TypeScript runs via the `@typescript/typescript6` compat shim (`npm:@typescript/typescript6@^6.0.2` aliased as `typescript`). typescript-eslint v8 hard-blocks on TypeScript >=7.0, so the JS-based TypeScript 6 API is used for all tooling. To adopt the Go-based TypeScript 7 type checker once typescript-eslint ships TS7 support, add `"typescript7": "npm:typescript@^7.0.2"` to devDependencies and update `build:validate` to `tsgo` (tracked: [typescript-eslint#10940](https://github.com/typescript-eslint/typescript-eslint/issues/10940)).
