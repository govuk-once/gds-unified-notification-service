## Operations

`src/common/operations` is the base-class layer every Lambda handler in this repo is built on. A handler in `src/lambdas/**` (see [`src/lambdas/README.md`](../../lambdas/README.md)) never wires up [middy](https://middy.js.org/) or [AWS Lambda Powertools](https://docs.powertools.aws.dev/lambda/typescript/latest/) itself - it extends one of the abstract classes here, declares a schema/`operationId`/dependencies, and implements a single `implementation()` (or `recordHandler`) method. Everything else - observability, validation, error formatting, IoC wiring - is inherited.

| Base class | File | Trigger | Used by |
| --- | --- | --- | --- |
| `APIHandler` | [`httpOperation.ts`](./httpOperation.ts) | API Gateway (HTTP + Lambda authorizer) | All PSO `http.*` lambdas, `MtlsCertificateRevocationAuthorizer` |
| `FlexAPIHandler` | [`flexApiHandler.ts`](./flexApiHandler.ts) | API Gateway (HTTP) | All Flex `http.*` lambdas |
| `ScheduleOperation` | [`scheduleOperation.ts`](./scheduleOperation.ts) | EventBridge Scheduler | `schedule.analyticsExport` |
| `QueueHandler` | [`queueOperation.ts`](./queueOperation.ts) | SQS | Not used directly by any lambda - see [Known issues](#known-issues--things-worth-revisiting) |
| `BatchQueueOperation` | [`batchQueueOperation.ts`](./batchQueueOperation.ts) | SQS, partial batch failures | `sqs.validation`, `sqs.processing`, `sqs.dispatch`, `sqs.analytics` |

### The shared shape

All five classes follow the same three-part pattern:

1. **Constructor + `injectDependencies`.** A handler's constructor takes its always-needed dependencies (`ObservabilityService`, and usually `ConfigurationService`) directly, plus an optional `dependencies` factory registered via `injectDependencies()`. This factory returns a map of `{ property: Promise<value> }` built from `iocGetXxx()` calls (see [`src/common/services/README.md`](../services/README.md#ioc-as-a-shared-layer)) - it is *not* resolved yet, just stored.
2. **`middlewares()`.** Each class builds a middy pipeline out of composable pieces: an `observabilityMiddlewares()` step every class defines near-identically (`injectLambdaContext`, `captureLambdaHandler`, `logMetrics`), plus trigger-specific steps (HTTP sanitization/validation, SQS body deserialization, batch processing).
3. **`.handler()`.** Wraps `middlewares(middy())` around an async function that: calls `initializeDependencies(this, this.dependencies)` to actually `await` every promise registered in step 1 and assign it onto `this`, then delegates to `implementation()` (or, for `BatchQueueOperation`, an internal per-record wrapper).

Every lambda's `handler.ts` ends with the same composition-root shape - instantiate the class with its IoC-resolved dependencies, then immediately call `.handler()` to produce the actual exported Lambda entrypoint:

```ts
export const handler = new Dispatch(iocGetConfigurationService(), iocGetObservabilityService(), () => ({
  notificationsDynamoRepository: iocGetNotificationDynamoRepository(),
  notificationsService: iocGetNotificationService(),
  analyticsService: iocGetAnalyticsService(),
  cacheService: iocGetCacheService().connect(),
  circuitBreakerService: iocGetCircuitBreakerService(DISPATCH_PLATFORM_KEY),
})).handler();
```

Because `iocGetXxx()` calls are lazy/memoized (see the services README), this line doesn't do any real work at import time beyond registering promises - actual construction happens inside `initializeDependencies` on each invocation.

### `APIHandler` / `FlexAPIHandler` (HTTP)

`APIHandler<InputSchema, OutputSchema>` is generic over zod request/response schemas and assembles four middleware groups, applied in this order inside `middlewares()`:

1. **`sanitizationMiddlewares`** - `httpHeaderNormalizer`, `httpJsonBodyParser`, `httpEventNormalizer`, the local `serializeBodyToJson` (stringifies object/array response bodies), then `@middy/http-error-handler`.
2. **`observabilityMiddlewares`** - `injectLambdaContext`, `captureLambdaHandler`, `logMetrics` (see [`src/common/services/README.md`](../services/README.md#x-ray-tracing--aws-sdk-v3-client-capture) for the tracing side of this).
3. **`validationMiddlewares`** - `requestValidatorMiddleware(this.requestBodySchema)` and `responseValidatorMiddleware(..., this.responseBodySchema)`, both from [`src/common/middlewares`](../middlewares). Request validation throws `BadRequestError` (→ HTTP 400); response validation throws `ExpectationFailedError` if a handler's own implementation produces a body that doesn't match its declared schema - a safety net against schema drift.
4. **`errorHandlingMiddlewares`** - `httpErrorHandlerMiddleware`, which turns any thrown `BaseError` subclass (see `@common/models/Errors`) into a structured `{ Status, HttpError, Errors }` JSON response with the error's own status code, and anything else into a generic 500.

`implementation()` in the concrete handler only has to deal with already-validated, already-typed input and return a body matching the output schema - see [`PostMessage`](../../lambdas/pso/http.postMessage/handler.ts) for a representative example.

`FlexAPIHandler` is a two-line subclass that adds a `ConfigurationService` constructor parameter ahead of `observability` - it exists purely to standardise that constructor shape across the Flex lambdas (see [Known issues](#known-issues--things-worth-revisiting) for how consistently that's actually used).

### `ScheduleOperation` (EventBridge)

Structurally the simplest base class - no HTTP concerns, so it only applies `observabilityMiddlewares` and DI. `implementation(event: ScheduledEvent, context)` returns `void`. Used by `AnalyticsExport` to trigger the CloudWatch Logs → S3 export on a schedule.

### `QueueHandler` / `BatchQueueOperation` (SQS)

`QueueHandler<InputType, OutputType>` adds a `deserializeRecordBodyFromJson` middleware that JSON-parses every SQS record body in place (swallowing parse failures into a log line, not an error), plus per-record SQS retry-count logging (`ApproximateReceiveCount > 1` → warn log + `QUEUE_MESSAGE_RETRY_ATTEMPT` metric) directly inside `.handler()`.

`BatchQueueOperation<InputSchema>` extends `QueueHandler` and is what every SQS lambda in this repo actually extends. It layers on:

- **Powertools batch processing** - `BatchProcessor(EventType.SQS)` + `processPartialResponse`, so an individual record failure is reported back to SQS as a partial batch item failure (that record alone is retried / eventually DLQ'd) instead of failing the whole batch.
- **Two-stage validation** - `validateIdentifiableRecord` first confirms the record at least has `NotificationID`/`DepartmentID` (so failures can still be attributed/logged), then `validateRecord` validates the full body against `requestBodySchema`, optionally running `ContentValidationService.validate(...)` over `MessageBody` as part of the same zod `superRefine` pass if a `contentValidationService` is wired up.
- **Lifecycle hooks** - `onStart` / `onSuccess` / `onError`, abstract methods concrete handlers implement to publish analytics events around each record (see `Dispatch.onStart/onError/onSuccess` publishing `DISPATCHING`/`DISPATCHED`/`DISPATCHING_FAILED`).
- **A feature flag gate** - if `enableConfig` is set, `implementation()` calls `config.ensureServiceIsEnabled(...)` before processing the batch at all, so a whole queue can be disabled via SSM without a deploy.

The actual per-record logic is a `recordHandler` **class-field arrow function** (not a method) - this is deliberate, so it can be passed as a bound callback (`this.recordHandlerWrapper`) to `processPartialResponse` without losing `this`.

### Middlewares

The reusable building blocks HTTP handlers assemble live in [`src/common/middlewares`](../middlewares): `requestValidatorMiddleware` / `responseValidatorMiddleware` (zod-driven, `before`/`after` hooks respectively), `httpErrorHandlerMiddleware` (`BaseError` → JSON), and `serializeBodyToJson`. They're independent of any specific operation class and could be reused outside `APIHandler` if needed.

### Known issues / things worth revisiting

This layer works and is exercised by every lambda in the repo, but a close read surfaces a few things worth a second look:

- **A debug fault-injection hook ships in the production code path.** [`queueOperation.ts`](./queueOperation.ts)'s `.handler()` inspects every record's `NotificationTitle` against a hardcoded map (`FAIL_AT_VALIDATION`, `FAIL_AT_PROCESSING`, `FAIL_AT_DISPATCH`, `FAIL_AT_ANALYTICS`) and deliberately throws a `SimulatedError` if it matches the current `operationId`. The comment above it says *"to be removed from prod release!"*, but it's still present. `NotificationTitle` is attacker/caller-controlled content from the public `POST /send` payload (see `PostMessage`) - as written, any API caller can deliberately trigger simulated failures in the processing pipeline by choosing one of those four strings as a notification title, and conversely a legitimate notification that happens to be titled e.g. `FAIL_AT_DISPATCH` will have an error injected into it in production. Worth either removing before the next prod release (as the comment says) or gating it behind a non-content signal (a header, an env var, a dedicated test field) so it can't be triggered by real user input.
- **The operations barrel is incomplete.** [`index.ts`](./index.ts) only re-exports `httpOperation` and `queueOperation` - `scheduleOperation`, `batchQueueOperation`, and `flexApiHandler` (i.e. 3 of the 5 base classes, including the one every SQS lambda actually extends) aren't exported from it, so every consumer imports them by deep path instead. This is inconsistent with other barrels in the codebase (e.g. `src/common/services/index.ts` exports everything) and easy to fix by adding the missing `export * from` lines.
- **`FlexAPIHandler` is an under-adopted abstraction.** It exists to standardise a `(config, observability)` constructor for HTTP handlers, but only the Flex lambdas use it - every PSO handler (`PostMessage`, `Dispatch`, etc.) extends `APIHandler`/`BatchQueueOperation` directly and re-declares the identical `config`/`observability` constructor + `injectDependencies` call by hand. Either PSO handlers should adopt the same base, or the abstraction should be reconsidered if it's only ever going to fit one module.
- **`MtlsCertificateRevocationAuthorizer` bends `APIHandler` to fit a use case it wasn't designed for.** A Lambda authorizer isn't really an HTTP JSON API, so this handler has to override `sanitizationMiddlewares`/`validationMiddlewares` to no-ops and cast its `APIGatewayAuthorizerResult` return value with `as unknown as ITypedRequestResponse<z.ZodAny>` to satisfy the base class's return type. The code's own TODO agrees: *"Create a dedicate authorizer handler, and organize existing handlers a bit more."* Worth doing - a small `AuthorizerOperation` base class (observability + DI only, like `ScheduleOperation`) would remove both the overrides and the unsafe cast.
- **`observabilityMiddlewares()` is duplicated three times.** `APIHandler`, `ScheduleOperation`, and `QueueHandler` each independently declare the same `dependencies`/`injectDependencies` storage and a near-identical `observabilityMiddlewares()` body (`injectLambdaContext` + `captureLambdaHandler` + `logMetrics`), with no shared parent class. A small base class (or a standalone middleware-group factory function) covering DI storage + observability wiring would remove the triplication and give the "TODO: look into removing slight overlap between powertools observability (xray sdk) and otel" comment (present in both `httpOperation.ts` and `scheduleOperation.ts`) one place to be resolved instead of two.
- **A couple of type-level escape hatches.** `QueueHandler.middlewares()` casts its return value with `as unknown as IQueueMiddleware<InputType, OutputType>` to reconcile the JSON-deserialization middleware's output type with the class's generic `InputType`. It works, but it's the type system being told to trust the runtime rather than proving it - low risk given the surrounding test coverage, but worth knowing about if this class is ever refactored.
