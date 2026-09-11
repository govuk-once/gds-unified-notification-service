# Queue Backlog and Dispatch Failures Runbook

How to investigate and respond to a growing SQS backlog, elevated failure rate, or open circuit breaker anywhere in the PSO notification pipeline.

This runbook is for the on-call engineer. Work through it in order: identify which stage and which alarm, confirm the pattern, then mitigate or escalate.

---

## The pipeline

A notification submitted via PSO's `POST /send` flows through four SQS-triggered stages, each its own Lambda, plus an analytics queue fed from every stage:

```text
incoming queue → validation → processing → dispatch → (notification provider, e.g. OneSignal)
                      │             │            │
                      └─────────────┴────────────┴──→ analytics queue → analytics stage
```

Every stage is a `BatchQueueOperation` handler — see [Developer Reference: SQS handler example](../developer-reference.md). A failure on one record fails only that record (a partial batch item failure); it does not fail the whole batch or block other messages behind it in the same invocation — but a large, sustained failure rate still drains capacity and grows the backlog.

---

## Step 1: identify the affected stage

| Alarm | Threshold | Points at |
| -------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------ |
| `SqsQueueDepthHigh-${name}` (P2), per queue | > 1000, 5/5 datapoints over 1 min | Messages are arriving faster than the stage can process them |
| `{Validation,Processing,Dispatch}FailureRateHigh` (P2) | > 5% over 5 min | That stage's `recordHandler` is throwing for a meaningful share of records |
| `{Validation,Processing,Dispatch}DurationP95High` (P2) | 2000ms / 3000ms / 5000ms respectively | That stage is running slow, which precedes both a backlog and Lambda timeouts |
| `{Validation,Processing,Dispatch}BatchItemFailures` (P3) | > 0, 2/2 datapoints over 1 min | Early signal — individual records are failing before the failure-rate alarm would fire |
| `{Processing,Dispatch,Analytics}QueuePublishFailed` (P3) | > 0, 1/1 datapoint over 1 min | A stage succeeded but **failed to hand off** to the next queue — messages may be silently lost, not just delayed |
| `CircuitBreakerOpen` (P1) | >= 1, 1/1 datapoint over 1 min | The dispatch stage has stopped calling the notification provider entirely — see [Step 3](#step-3-circuit-breaker-and-rate-limiting) |
| `DispatchRateLimitingEnforced` (P2) | >= 1, 2/2 datapoints over 1 min | The dispatch stage is deliberately slowing itself down — see [Step 3](#step-3-circuit-breaker-and-rate-limiting) |
| `${provider}Offline` (P1), e.g. `OneSignalOffline` | > 40% HTTP error rate over 1 min | The notification provider itself is failing |

Identify which named alarm(s) fired — the alarm name encodes the stage (`Validation`/`Processing`/`Dispatch`/`Analytics`), which tells you which Lambda's logs to read next.

> `{Processing,Dispatch,Analytics}QueuePublishFailed` deserves particular attention: this means a stage completed its own work successfully but couldn't enqueue the result for the next stage. Unlike a `recordHandler` failure (which is retried/DLQ'd by SQS), a failed publish inside a stage's own code may not automatically retry depending on where in the handler it occurred — check whether the record was acknowledged (removed from the source queue) before treating this as "will retry itself".

---

## Step 2: read the logs and trace the record

1. **CloudWatch Logs Insights over the affected stage's Lambda log group.** Application errors from this codebase carry a `BaseError` name (`ContentValidationError`, `DispatchAdapterError`, `ProcessingAdapterError`, `RateLimitingError` — see [Developer Reference: Errors](../developer-reference.md#errors)); anything else is an unhandled exception.
2. **Correlate by `NotificationID`.** Every record carries this through the pipeline (see [`IIdentifiableMessage`](/src/lambdas/interfaces/IMessage.ts)) — search for it across stages to see how far a specific notification got before failing.
3. **X-Ray** is active on every Lambda in the pipeline (`processing`, `dispatch` and `analytics` also run inside the VPC — see [Infrastructure Development Guide: Networking](../infrastructure-development.md#networking)) — the service map shows where time is being spent, including calls to ElastiCache and the notification provider.
4. **Retry visibility.** `QueueHandler` logs a `QUEUE_MESSAGE_RETRY_ATTEMPT` metric whenever `ApproximateReceiveCount > 1` on a record — a rising count here is an early sign that records are failing and being redelivered, ahead of the queue depth alarm.

---

## Step 3: circuit breaker and rate limiting

The dispatch stage has two independent self-protection mechanisms — knowing which one is active changes what "back to normal" looks like:

- **Circuit breaker** (`CircuitBreakerService`, backed by `CacheService`/ElastiCache): once open, the dispatch stage stops calling the notification provider entirely rather than continuing to fail against it. `CircuitBreakerOpen` firing is expected, protective behaviour during a provider outage — the fix is the provider recovering (or a code change to widen/narrow the breaker's own thresholds), not retrying harder.
- **Rate limiting** (`CacheService.rateLimit`, throws `TooManyRequestsError`/`RateLimitingError`): the dispatch stage is deliberately throttling itself against a configured limit. `DispatchRateLimitingEnforced` firing usually means genuine load, not a fault — confirm against actual traffic volume before treating it as an incident.

Both read their configuration from SSM (see [Developer Reference: services and adapters](../developer-reference.md#services-and-adapters)) — a threshold that's clearly miscalibrated (opening too eagerly, or not eagerly enough) is a config change via [`cdk.predeploy.ssm.ts`](/infrastructure/cdk/cdk.predeploy.ssm.ts)-managed parameters, not necessarily a code deploy.

---

## Common failure patterns

| Pattern | How it presents | Likely meaning |
| ------------------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Provider outage | `${provider}Offline`; `DispatchFailureRateHigh`; `CircuitBreakerOpen` follows shortly after | The notification provider (e.g. OneSignal) is down or erroring |
| Provider degraded, not down | `DispatchDurationP95High` climbs before any hard failures | Provider is slow; watch for the circuit breaker opening next |
| Content validation rejecting a batch | `ValidationFailureRateHigh`; `ContentValidationError` in the validation stage's logs | Either a genuine bad-content batch from a caller, or an overly strict validation rule shipped in a recent deploy |
| Self-inflicted throttling | `DispatchRateLimitingEnforced`, no corresponding provider-side errors | Working as designed under real load — not necessarily an incident |
| Silent message loss | `{Processing,Dispatch,Analytics}QueuePublishFailed`, queue depth for the *next* stage stays flat despite upstream activity | A stage isn't handing off to the next queue — investigate before assuming "it'll retry" |
| Cascading backlog | `SqsQueueDepthHigh` on multiple queues at once, oldest queue first | An early stage backed up and every stage after it is now starved, not independently broken |

---

## Mitigating a downstream adapter failure

Anything shipped as code follows the [Fix Forward Runbook](./fix-forward.md).

- **Do not** manually retry harder against a provider that's confirmed down — the circuit breaker exists precisely to stop this; fighting it adds load without helping.
- If the provider has a status page or known incident, that confirms the diagnosis — this is their outage, not a platform defect, but the platform's job is still to protect the queue from unbounded backlog while it's down (the circuit breaker and rate limiter should already be doing this automatically).
- If the circuit breaker or rate limiter is misconfigured for the actual failure mode you're seeing (too slow to open, or blocking legitimate traffic), that's a fix-forward SSM/code change — see [Step 3](#step-3-circuit-breaker-and-rate-limiting).
- Once the provider recovers, expect a backlog drain, not an instant return to a flat queue depth graph — SQS visibility timeout and the batch size configured on each Lambda trigger determine the drain rate.

---

## After recovery

1. Confirm queue depth alarms have returned to baseline for every stage, not just the one that first alarmed — a cascading backlog clears from the front, so check the last stage in the chain too.
2. Confirm `CircuitBreakerOpen` has cleared (the breaker closes again) if it was open.
3. Check for any `QueuePublishFailed` incidents during the window and confirm no notifications were silently lost — reconcile against `NotificationsDynamoRepository` state if there's any doubt.
4. Raise follow-up work for anything the incident exposed (a threshold that fired too late, a missing DLQ alarm, a provider integration that needs a better fallback).

---

## Related

**Guides:**

- [Fix Forward Runbook](./fix-forward.md)
- [API Gateway Errors Runbook](./api-gateway-errors.md)
- [Developer Reference: notification pipeline](../developer-reference.md#notification-pipeline-pso)
- [Infrastructure Development Guide: CloudWatch alarms](../infrastructure-development.md#cloudwatch-alarms)

**Code:**

- [`src/lambdas/pso/sqs.validation`](/src/lambdas/pso/sqs.validation), [`sqs.processing`](/src/lambdas/pso/sqs.processing), [`sqs.dispatch`](/src/lambdas/pso/sqs.dispatch), [`sqs.analytics`](/src/lambdas/pso/sqs.analytics)
- [`src/common/services/circuitBreakerService.ts`](/src/common/services/circuitBreakerService.ts)
- [`src/common/services/adapters/notificationAdapterOneSignal.ts`](/src/common/services/adapters/notificationAdapterOneSignal.ts)
- [`infrastructure/cdk/constructs/alarmsConstructs`](/infrastructure/cdk/constructs/alarmsConstructs)
