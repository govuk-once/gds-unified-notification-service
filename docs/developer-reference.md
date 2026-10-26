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

The middleware order, the dependency-injection lifecycle and the batch-processing internals are covered in [`src/common/operations/README.md`](/src/common/operations/README.md).

---

## Notification pipeline (PSO)

```text
POST /send ──────────────► processing queue ─► sqs.processing ─► dispatch queue ─► sqs.dispatch ─► OneSignal
 (postMessage:                                    (UDP: UserID →                       (rate limit,
  validates inline,                                ExternalUserID)                      circuit breaker)
  writes Messages table)                                                                       ▲
                                                                                               │
POST /v1/send-to-group ─► groupprocessing queue ─► sqs.groupProcessingWorker ──────────────────┘
 (postGroupMessage)           ▲                        │ (re-queues itself until its push-ID chunk is empty)
                              └────────────────────────┘

incoming queue ─► sqs.validation ─► processing queue     (no producer in this repository, see note)

every stage ─► analytics queue ─► sqs.analytics ─► Messages table events, Campaigns table, CloudWatch Logs CSV
                                                     └─► schedule.analyticsExport ─► S3
```

| Stage | Reads | Writes | Analytics states |
| --- | --- | --- | --- |
| [`http.postMessage`](/src/lambdas/pso/http.postMessage/README.md) | Request + authorizer context | Messages table, `processing` queue | `VALIDATED_API_CALL` |
| [`sqs.validation`](/src/lambdas/pso/sqs.validation/README.md) | `incoming` queue | Messages table, `processing` queue | `VALIDATING`, `VALIDATED`, `VALIDATION_FAILED` |
| [`sqs.processing`](/src/lambdas/pso/sqs.processing/README.md) | `processing` queue | `dispatch` queue | `PROCESSING`, `PROCESSED`, `PROCESSING_FAILED` |
| [`http.postGroupMessage`](/src/lambdas/pso/http.postGroupMessage/README.md) | GroupStore table | ElastiCache chunks, `groupprocessing` queue | |
| [`sqs.groupProcessingWorker`](/src/lambdas/pso/sqs.groupProcessingWorker/README.md) | `groupprocessing` queue, ElastiCache | Messages table, `dispatch` queue | `PROCESSED` |
| [`sqs.dispatch`](/src/lambdas/pso/sqs.dispatch/README.md) | `dispatch` queue | Messages table, provider | `DISPATCHING`, `DISPATCHED`, `DISPATCHING_FAILED` |
| [`sqs.analytics`](/src/lambdas/pso/sqs.analytics/README.md) | `analytics` queue | Messages table `Events`, Campaigns table, CloudWatch Logs | |

> `POST /send` validates in the HTTP handler and publishes directly to `processing`. It does **not** go through the `incoming` queue or `sqs.validation`, and nothing in this repository publishes to `incoming`. As a result, the `ValidationFailureRateHigh` and `ValidationBatchItemFailures` alarms say nothing about API traffic: a rejected `POST /send` is a 400 response, which shows up in `Api4xxErrorRateElevated`.

Every SQS stage is a `BatchQueueOperation`. A failing record is reported as a partial batch item failure, retried, and moved to the queue's DLQ after 3 receives. Each stage can be switched off in SSM; see [Configuration: Kill switches](./configuration.md#kill-switches) for the side effects first. Every record carries `NotificationID` end to end, so search for it across log groups to trace a notification.

---

## Errors

Every application error extends `BaseError` ([`src/common/models/Errors`](/src/common/models/Errors)). In HTTP handlers, `httpErrorHandlerMiddleware` turns it into `{ Status, HttpError, Errors }` with the class's status code; anything that isn't a `BaseError` becomes a generic 500. In SQS handlers, any thrown error fails that record (partial batch item failure).

| Base class | Status | Subclasses | Typically means |
| --- | --- | --- | --- |
| `BadRequestError` | 400 | `ContentValidationError`, `InvalidCharacterError`, `SerializationError`, `UnidentifiableRecordError` | Bad request body/query, disallowed content, a feature-flagged field sent while the flag is off, or an SQS record without `NotificationID`/`DepartmentID` |
| `UnauthorizedError` | 401 | | Authentication failure inside a handler. mTLS denials are authorizer `Deny` policies, so API Gateway returns 403 |
| `NotFoundError` | 404 | `NoDispatchIdFound`, `NoLinkingIdFound` | Missing, expired, hidden or other-user notification (Flex); provider returned no dispatch/linking ID (adapters) |
| `ExpectationFailedError` | 417 | | A handler's response failed its own Zod response schema. A code bug, not a client error |
| `TooManyRequestsError` | 429 | `RateLimitingError` | Dispatch rate limit exceeded |
| `InternalServerError` | 500 | `ServiceMisconfigurationError`, `ParsingFailedError`, `NotImplementedError`, `SimulatedError` | Misconfiguration (missing SSM value, disabled stage, missing organisation record) or an unexpected failure |
| `BadGatewayError` | 502 | `DispatchAdapterError`, `ProcessingAdapterError` | OneSignal or UDP call failed |

Throw the most specific subclass that fits, and pass human-readable messages in the `errors` array; they are returned to the caller as-is for 4xx errors. The [API Gateway Errors runbook](./runbooks/api-gateway-errors.md) explains how to tell an application error from a native API Gateway one.

---

## Services and adapters

Handlers stay thin and delegate to services in [`src/common/services`](/src/common/services), resolved through the IoC container in [`src/common/ioc.ts`](/src/common/ioc.ts). The full catalogue of service classes, the three IoC lifetimes and the tracing conventions are in [`src/common/services/README.md`](/src/common/services/README.md). The rules worth knowing before you add one:

- Construct a service through a `static async create(...)` factory, not a constructor followed by `initialize()`. Register it as an `iocGetXxx` function and use `TIMEBOUND_SINGLETON` if it depends on configuration.
- Read configuration through `ConfigurationService.getParameter(SSMParameters...)`, declaring new parameters in [`shared/ssmParameter.ts`](/shared/ssmParameter.ts) (see [Configuration](./configuration.md)).
- Call `tracer.captureAWSv3Client(client)` on any new AWS SDK client.

### Adapters

`NotificationService` (dispatch) and `ProcessingService` (processing) pick an adapter at creation time from an SSM enum. Switching adapters is a config change, not a deploy:

| Service | SSM parameter | Values | Adapter |
| --- | --- | --- | --- |
| `NotificationService` | `config/dispatch/adapter` | `OneSignal`, `VOID` (default) | [`NotificationAdapterOneSignal`](/src/common/services/adapters/notificationAdapterOneSignal.ts), [`NotificationAdapterVoid`](/src/common/services/adapters/notificationAdapterVoid.ts) |
| `ProcessingService` | `config/processing/adapter` | `UDP`, `VOID` (default) | [`ProcessingAdapterUDP`](/src/common/services/adapters/processingAdapterUDP.ts), [`ProcessingAdapterVoid`](/src/common/services/adapters/processingAdapterVoid.ts) |

- **OneSignal**: sends the push with `idempotency_key = NotificationID`. It skips the push for `MESSAGE_CENTRE_ONLY`, builds the deeplink from `notification/deeplinkTemplate` unless an explicit `DeeplinkURL` is set, and appends `notificationID` to `govuk://` deeplinks.
- **UDP**: resolves `UserID` → `ExternalUserID` through a SigV4-signed, cross-account API Gateway call (`FetchSigV4Service`).
- **Void**: a no-op that passes the message through. It is the default in new environments, so a sandbox never sends real pushes.

Setting an adapter to `VOID` is a quick way to stop calls to a failing provider during an incident without stopping the pipeline. Messages are marked dispatched but **no push is sent**, so only do this with agreement.

To add a provider, implement `NotificationAdapter` / `ProcessingAdapter` from [`interfaces/`](/src/common/services/interfaces), add a value to the SSM enum, and add a branch to the service's `create()`. Record provider calls with `observability.recordProviderHttpMetric(...)` so the `<Provider>Offline` alarm can be added (see [Alarms](./alarms.md)).

---

## The mTLS authorizer

[`http.mtlsCertificateRevocationAuthorizer`](/src/lambdas/pso/http.mtlsCertificateRevocationAuthorizer/README.md) is a REQUEST authorizer on every PSO route. It runs with `resultsCacheTtl: 0`, so on every request it:

1. Reads the client certificate PEM that CloudFront forwards in `CloudFront-Viewer-Cert-PEM`. CloudFront has already checked the certificate chain and expiry against the truststore (see [Infrastructure Development Guide: mTLS](./infrastructure-development.md#mtls-certificate-infrastructure)).
2. Looks up the SHA-256 of the PEM in the MTLS revocation table, and denies the request if there is no record, the record is `Revoked`, or it has no `Organization`.
3. Loads the organisation's record from the `organisations` table.
4. Returns `Allow` with `Organization` and a JSON-encoded `OrganisationConfig` in the authorizer context, and the caller's `x-api-key` as `usageIdentifierKey`, so the right per-organisation usage plan is applied.

Handlers read the context through `psoAuthorizerSchema`:

```typescript
const organisationConfig = event.requestContext.authorizer.OrganisationConfig;
this.validationService.messageValidation(messages, organisationConfig);
```

Each deny branch emits its own metric (`MTLS_AUTH_REQUESTS_DENIED_*`), which feeds the authentication alarms in [Alarms](./alarms.md#authentication-pso).

---

## Logging

Use the Powertools logger on `this.observability.logger`. Don't use `console.*` in Lambda code.

| Level | Use for |
| --- | --- |
| `debug` | Step-by-step detail (cache contents, intermediate values). Emitted only where `LOG_LEVEL=DEBUG`, which is every environment except `prod` (`config.debugMode`) |
| `info` | One line per request on entry (`Received request`), and each expected early exit (e.g. `'Notification not found - returning 404'`) |
| `warn` | Recoverable oddities: retries, fallbacks, a record that will be retried |
| `error` | A denial or failure someone may need to act on, with enough context to act (`certificateId`, `methodArn`, `NotificationID`) |

Conventions:

- Pass context as the second argument (`logger.info('...', { NotificationID })`) instead of interpolating it into the message, so it can be queried in Logs Insights.
- Include `NotificationID` (and `GroupNotificationID` / `CacheKey` for group work) on every log line about a specific notification.
- Never log message content, credentials or certificates. The logger's `jsonReplacerFn` in [`ioc.ts`](/src/common/ioc.ts) masks `NotificationTitle`, `NotificationBody`, `MessageTitle`, `MessageBody`, `clientCertPem`, `CloudFront-Viewer-Cert-PEM`, `Authorization`, `x-api-key`, `apiKey`, `app_id` and `x-amz-security-token`. It matches on **exact key name**, so if you log an object containing a new sensitive field, add the key to that list in the same change.

---

## Related

**Guides:**

- [Environment Setup](./environment-setup.md)
- [Infrastructure Development Guide](./infrastructure-development.md)
- [Deployment Guide](./deployment.md)

**Code:**

- [`src/README.md`](/src/README.md) — unit testing conventions
- [`src/lambdas/README.md`](/src/lambdas/README.md) — Lambda naming conventions
- [`test/e2e/README.md`](/test/e2e/README.md) — end-to-end testing conventions
