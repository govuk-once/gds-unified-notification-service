# Developer Reference

Common patterns, shared code and conventions for developing Lambda handlers in this repository.

---

## Overview

| Area | Location | Purpose |
| ------------------------ | -------------------------------------------------------- | ----------------------------------------------------------------------- |
| Handlers | [`src/lambdas/flex`](/src/lambdas/flex), [`src/lambdas/pso`](/src/lambdas/pso) | Business logic, one directory per Lambda |
| Base operation classes | [`src/common/operations`](/src/common/operations) | Middleware wiring, DI hookup, per-trigger request lifecycle |
| Middlewares | [`src/common/middlewares`](/src/common/middlewares) | Middy middleware used by the base operation classes |
| Errors | [`src/common/models/Errors`](/src/common/models/Errors) | Typed errors that map to HTTP status codes / SQS partial batch failures |
| Repositories | [`src/common/repositories`](/src/common/repositories) | DynamoDB access, one class per table |
| Services & adapters | [`src/common/services`](/src/common/services) | Business services and external-integration adapters (OneSignal, UDP, Redis) |
| IoC container | [`src/common/ioc.ts`](/src/common/ioc.ts) | Dependency wiring and lifetime management |

There are two Lambda "surfaces": **PSO** (`src/lambdas/pso`, mTLS-protected public API for external departments to send notifications) and **Flex** (`src/lambdas/flex`, the internal API the GOV.UK app backend uses to read/manage a user's notifications). Both are deployed from one CDK stack — see the [Infrastructure Development Guide](./infrastructure-development.md).

---

## Prerequisites

Complete [Environment Setup](./environment-setup.md) before writing handler code.

---

## Lambda directory and naming conventions

See [`src/lambdas/README.md`](/src/lambdas/README.md) for the full convention. In short: a Lambda lives at `src/lambdas/<pso|flex>/{trigger}.{operationName}/handler.ts`, where `trigger` is `http`, `sqs` or `schedule`, and `operationName` matches the OpenAPI `operationId` for HTTP handlers.

---

## Handler patterns

Every handler is a class extending one of four base operation classes from [`src/common/operations`](/src/common/operations), each wrapping the trigger-appropriate Middy pipeline so individual handler files never touch Middy directly.

| Base class | File | Trigger | Used by |
| --------------------- | ------------------------------------------------------------------------ | --------------------------------- | ----------------------------------------------------------- |
| `APIHandler` | [`httpOperation.ts`](/src/common/operations/httpOperation.ts) | API Gateway / ALB | All `pso/http.*` handlers |
| `FlexAPIHandler` | [`flexApiHandler.ts`](/src/common/operations/flexApiHandler.ts) | API Gateway (extends `APIHandler`) | All `flex/http.*` handlers |
| `BatchQueueOperation` | [`batchQueueOperation.ts`](/src/common/operations/batchQueueOperation.ts) | SQS, batch item failure aware | All `pso/sqs.*` handlers |
| `ScheduleOperation` | [`scheduleOperation.ts`](/src/common/operations/scheduleOperation.ts) | EventBridge Scheduler | `pso/schedule.analyticsExport` |

## Related

**Guides:**

- [Environment Setup](./environment-setup.md)
- [Infrastructure Development Guide](./infrastructure-development.md)
- [Deployment Guide](./deployment.md)

**Code:**

- [`src/README.md`](/src/README.md) — unit testing conventions
- [`src/lambdas/README.md`](/src/lambdas/README.md) — Lambda naming conventions
- [`test/e2e/README.md`](/test/e2e/README.md) — end-to-end testing conventions
