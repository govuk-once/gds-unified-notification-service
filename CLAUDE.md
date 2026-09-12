# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

GDS Unified Notification Service — a serverless notification system for GOV.UK built on AWS. Two API surfaces:

- **PSO API** — Public Service Organisations send notifications (mTLS + API key auth). Messages flow through SQS queues: incoming → validation → processing → dispatch → analytics.
- **Flex API** — End-user apps read/manage notifications and groups (API key auth via VPC endpoint).

## Commands

```sh
pnpm install                        # install dependencies
pnpm run build                      # esbuild bundle lambdas → dist/
pnpm run build:validate             # typecheck only (tsc --noEmit)
pnpm run lint                       # eslint + prettier (check)
pnpm run lint:fix                   # eslint + prettier (auto-fix)
pnpm run test                       # all tests (unit + e2e)
pnpm run test:unit                  # unit tests only
pnpm run test:e2e                   # e2e tests (requires mTLS certs + AWS credentials)
pnpm run test:coverage              # unit tests with coverage
pnpm run cdk:synth                  # synthesize CloudFormation templates
pnpm run cdk:diff                   # diff against deployed stack
pnpm run checkov                    # IaC security scanning on CDK output
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
- `src/common/services/adapters/` — Notification adapters (OneSignal, UDP, Void) and processing adapters
- `src/common/repositories/` — DynamoDB repositories
- `src/common/middlewares/` — Middy middleware (request/response validation, auth, error handling)
- `src/common/operations/` — Lambda handler wrappers by trigger type (HTTP, SQS, schedule)
- `src/common/models/` — Enums, error classes, organisation metadata
- `src/common/ioc.ts` — Custom IoC container with singleton, time-bound singleton, and new-instance modes

Lambda directories follow `{trigger}.{operationName}/` naming. Each contains `handler.ts` and `handler.test.unit.ts`.

### Infrastructure Layout

- `infrastructure/cdk/cdk.ts` — CDK app entrypoint
- `infrastructure/cdk/config.ts` — Config loading from env vars + SSM Parameter Store
- `infrastructure/cdk/constructs/` — Stack definitions (UNSStack, UNSAlarmsStack, UNSCommon, UNSPSOResources, UNSFlexResources, UNSMTLS, UNSOrganisations)
- `infrastructure/cdk/constructs/bases/` — Reusable CDK constructs (API Gateway, Lambda, DynamoDB, SQS, S3, ElastiCache, VPC, KMS)
- `infrastructure/cdk/consumers/` — Consumer definitions per environment

### IoC Container

`src/common/ioc.ts` provides dependency injection with three modes:

- **SINGLETON** — one instance for the lifetime of the Lambda container
- **TIMEBOUND_SINGLETON** — recreated after TTL expires (used for config-dependent classes to pick up SSM parameter changes without cold starts)
- **NEW_INSTANCE** — fresh instance per call

### Path Aliases

```
@common/*  → src/common/*
@project/* → src/*
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

Enforced by commitlint via Husky pre-commit hooks. The pre-commit hook also runs typecheck, unit tests, and lint in parallel.

## Tech Stack

- **Runtime:** Node.js 22 (ESM), TypeScript 5.9+
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
