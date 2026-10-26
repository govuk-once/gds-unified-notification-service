# Alarms

The catalogue of CloudWatch alarms deployed by `UNSAlarmsStack`. It is for on-call engineers matching a fired alarm to a runbook, and for developers adding or tuning an alarm.

---

## Overview

All alarms live in a dedicated stack, [`UNSAlarmsStack`](/infrastructure/cdk/constructs/UNSAlarmsStack.ts) (`uns-<env>-alarms-stack`). It deploys after the main stack and reads resource names (API names, queue names, Lambda function names, WAF names) from `UNSStack.resourceNames()` via [`UNSResourceContract`](/infrastructure/cdk/constructs/UNSResourceContract.ts). It is split out so alarms can change without touching the main stack.

| Construct | File | Covers |
| --- | --- | --- |
| `UNSApiGatewayAlarmsConstruct` | [`UNSApiGatewayAlarmsConstruct.ts`](/infrastructure/cdk/constructs/alarmsConstructs/UNSApiGatewayAlarmsConstruct.ts) | 4xx/5xx rates, PSO and Flex |
| `UNSAuthenticationAlarmsConstruct` | [`UNSAuthenticationAlarmsConstruct.ts`](/infrastructure/cdk/constructs/alarmsConstructs/UNSAuthenticationAlarmsConstruct.ts) | mTLS authorizer denials, PSO only |
| `UNSWAFAlarmsConstruct` | [`UNSWAFAlarmsConstructs.ts`](/infrastructure/cdk/constructs/alarmsConstructs/UNSWAFAlarmsConstructs.ts) | WAF blocked-request anomalies, PSO and Flex |
| `UNSOperationalAlarmsConstruct` | [`UNSOperationalAlarmsConstruct.ts`](/infrastructure/cdk/constructs/alarmsConstructs/UNSOperationalAlarmsConstruct.ts) | Queue depth, DLQs, per-stage failure rates and durations, publish failures, PSO only |
| `UNSPerformanceAlarmsConstructs` | [`UNSPerformanceAlarmsConstructs.ts`](/infrastructure/cdk/constructs/alarmsConstructs/UNSPerformanceAlarmsConstructs.ts) | Lambda cold starts, PSO only |
| `UNSIntegrationAlarmsConstruct` | [`UNSIntegrationAlarmsConstruct.ts`](/infrastructure/cdk/constructs/alarmsConstructs/UNSIntegrationAlarmsConstruct.ts) | Provider HTTP error rates, circuit breaker, per-Lambda error rates, PSO and Flex |

Shared helpers (priorities, periods, rate and anomaly alarm builders) live in [`UNSAlarmConstructs.ts`](/infrastructure/cdk/constructs/alarmsConstructs/UNSAlarmConstructs.ts).

### Naming

Alarm names are built with `config.utils.namingHelper(priority, group, name, ...)`, so they are lower-cased and prefixed per environment:

```text
uns-dev-p1-pso-api5xxerrorrateelevated
uns-dev-p2-pso-sqsqueuedepthhigh-dispatch
uns-p1-pso-circuitbreakeropen            # production has no -prod segment
```

This page uses the readable CamelCase form (`Api5xxErrorRateElevated`). Search the console for the lower-cased form.

### Priorities and routing

| Priority | Meaning |
| --- | --- |
| `P1` (`EXTRA_HIGH`) | Service is failing or a dependency is down |
| `P2` (`HIGH`) | Degraded, or heading for an outage |
| `P3` (`MEDIUM`) | Early signal, investigate during working hours |

Every alarm notifies the alert SNS topic created in `UNSCommon`. When `alerts/slack/workspaceId` and `alerts/slack/channelId` are set in SSM, AWS Chatbot forwards the topic to Slack (see [Configuration: Slack](./configuration.md#slack-alerts-and-release-announcements)). Missing data is treated as not breaching, so an idle environment stays green.

---

## Catalogue

Metric namespace for custom metrics: `NOTIFICATIONS_UNS_<ENV>` (e.g. `NOTIFICATIONS_UNS_DEV`), with dimensions `service` (`NOTIFICATIONS_PSO` / `NOTIFICATIONS_FLEX`) and `environment`.

### API Gateway (PSO and Flex)

| Alarm | Priority | Condition | Runbook |
| --- | --- | --- | --- |
| `Api5xxErrorRateElevated` | P1 | 5xx rate > 1% over 5 min ⚠️ | [API Gateway Errors](./runbooks/api-gateway-errors.md) |
| `Api4xxErrorRateElevated` | P2 | 4xx rate > 10% over 5 min ⚠️ | [API Gateway Errors](./runbooks/api-gateway-errors.md) |

### Authentication (PSO)

| Alarm | Priority | Condition | Runbook |
| --- | --- | --- | --- |
| `MTLSDenialRateHigh` | P2 | `MTLS_AUTH_REQUESTS_DENIED_COUNT` / `MTLS_AUTH_REQUESTS_COUNT` > 0.1% over 5 min ⚠️ | [API Gateway Errors: Step 3](./runbooks/api-gateway-errors.md#step-3-mtls-specific-checks-pso-only) |
| `RevokedCertificateDetected` | P2 | Any revoked-certificate denial, 2 of 2 five-minute periods | [API Gateway Errors: Step 3](./runbooks/api-gateway-errors.md#step-3-mtls-specific-checks-pso-only) |
| `UnknownCertificateSpikeDetected` | P2 | > 5 unknown-certificate denials per 5 min, 5 of 5 periods | [API Gateway Errors: Step 3](./runbooks/api-gateway-errors.md#step-3-mtls-specific-checks-pso-only) |

### WAF (PSO and Flex)

| Alarm | Priority | Condition | Runbook |
| --- | --- | --- | --- |
| `WafBlockRequestSpike` | P2 | `BlockedRequests` above the 3σ anomaly band, 5 min | [API Gateway Errors](./runbooks/api-gateway-errors.md) |

> These alarm on the **regional** WAF attached to each API Gateway stage. The CloudFront-scoped WAF in front of PSO (`UNSGlobalStack`, us-east-1) has no alarm yet.

### Pipeline (PSO)

| Alarm | Priority | Condition | Runbook |
| --- | --- | --- | --- |
| `SqsQueueDepthHigh-<queue>` | P2 | > 1000 visible messages, 5 of 5 one-minute periods. One per queue | [Queue Backlog](./runbooks/queue-backlog-and-dispatch-failures.md) |
| `ValidationFailureRateHigh` | P2 | `ANALYTICS_EVENT_VALIDATION_FAILED` / `ANALYTICS_EVENT_VALIDATING` > 5% over 5 min ⚠️ | [Queue Backlog](./runbooks/queue-backlog-and-dispatch-failures.md) |
| `ProcessingFailureRateHigh` | P2 | `ANALYTICS_EVENT_PROCESSING_FAILED` / `ANALYTICS_EVENT_PROCESSING` > 5% over 5 min ⚠️ | [Queue Backlog](./runbooks/queue-backlog-and-dispatch-failures.md) |
| `DispatchFailureRateHigh` | P2 | `ANALYTICS_EVENT_DISPATCHING_FAILED` / `ANALYTICS_EVENT_DISPATCHING` > 5% over 5 min ⚠️ | [Queue Backlog](./runbooks/queue-backlog-and-dispatch-failures.md) |
| `ValidationDurationP95High` | P2 | p95 > 2000 ms over 5 min | [Queue Backlog](./runbooks/queue-backlog-and-dispatch-failures.md) |
| `ProcessingDurationP95High` | P2 | p95 > 3000 ms over 5 min | [Queue Backlog](./runbooks/queue-backlog-and-dispatch-failures.md) |
| `DispatchDurationP95High` | P2 | p95 > 5000 ms over 5 min ⚠️ | [Queue Backlog](./runbooks/queue-backlog-and-dispatch-failures.md) |
| `GroupProcessingDurationP95PerMessageHigh` | P2 | p95 per message > 3000 ms over 5 min | [Queue Backlog](./runbooks/queue-backlog-and-dispatch-failures.md) |
| `DispatchRateLimitingEnforced` | P2 | `CIRCUIT_BREAKER_RATE_LIMITING_ENFORCED` ≥ 1, 2 of 2 one-minute periods | [Queue Backlog: Step 3](./runbooks/queue-backlog-and-dispatch-failures.md#step-3-circuit-breaker-and-rate-limiting) |
| `{Validation,Processing,Dispatch,GroupProcessing}BatchItemFailures` | P3 | > 0, 2 of 2 one-minute periods | [Queue Backlog](./runbooks/queue-backlog-and-dispatch-failures.md) |
| `{Processing,GroupProcessing,Dispatch,Analytics}QueuePublishFailed` | P3 | > 0 in one minute | [Queue Backlog](./runbooks/queue-backlog-and-dispatch-failures.md) |
| `dlqMessageCountMedium-<queue>` | P3 | > 10 visible DLQ messages in any 1 of 15 one-minute periods ⚠️ | [Queue Backlog](./runbooks/queue-backlog-and-dispatch-failures.md) |
| `MessageCountHigh-<queue>` | P2 | > 1000 visible DLQ messages in any 1 of 15 one-minute periods ⚠️ | [Queue Backlog](./runbooks/queue-backlog-and-dispatch-failures.md) |
| `OldestMessageHigh-<queue>` | P2 | Oldest DLQ message older than 3 days | [Queue Backlog](./runbooks/queue-backlog-and-dispatch-failures.md) |

### Integrations

| Alarm | Priority | Scope | Condition | Runbook |
| --- | --- | --- | --- | --- |
| `OneSignalOffline` | P1 | PSO (downstream) | Provider HTTP error rate > 40% ⚠️ | [Queue Backlog](./runbooks/queue-backlog-and-dispatch-failures.md#mitigating-a-downstream-adapter-failure) |
| `UDPOffline` | P1 | PSO (upstream) | Provider HTTP error rate > 40% ⚠️ | [Queue Backlog](./runbooks/queue-backlog-and-dispatch-failures.md#mitigating-a-downstream-adapter-failure) |
| `CircuitBreakerOpen` | P1 | PSO and Flex | `CIRCUIT_BREAKER_STATE` ≥ 1 in one minute | [Queue Backlog: Step 3](./runbooks/queue-backlog-and-dispatch-failures.md#step-3-circuit-breaker-and-rate-limiting) |
| `LambdaErrorRateElevated-<lambda>` | P2 | Every PSO and Flex Lambda | `Errors` / `Invocations` > 1% over 5 min ⚠️ | [API Gateway Errors](./runbooks/api-gateway-errors.md) |

### Performance (PSO)

| Alarm | Priority | Condition |
| --- | --- | --- |
| `<lambda>-ColdStartRateElevatedDetected` | P1 | > 20 cold starts in 5 min, per Lambda. `postGroupMessage`, `groupProcessingWorker` and `analytics` are excluded |

---

## Known discrepancies ⚠️

Rows marked ⚠️ behave differently from what the threshold or description suggests. These are code issues to fix in the alarm constructs; this catalogue describes what is deployed today.

1. **Rate alarms fire at one third of the stated percentage.** `addRateAlarm` computes `(FILL(failed, 0) / total) * 300`, not `* 100`. So a "1%" threshold fires at about 0.33%, and "40%" at about 13.3%. This affects every rate alarm: API 4xx/5xx, mTLS denial, stage failure rates, provider offline and Lambda error rate.
2. **Rate alarms always evaluate over 5 minutes.** The `MathExpression` period is fixed at 5 minutes, which overrides the 1-minute metric period used by the provider alarms. `OneSignalOffline` and `UDPOffline` therefore evaluate over 5 minutes, not the 1 minute their description says.
3. **`DispatchFailureRateHigh` description** interpolates `PROCESSING_DURATION_P95_MS` (3000), so it reads "exceeded 3000%". The threshold actually used is 5%.
4. **`DispatchDurationP95High` description** says 3000 ms. The threshold is 5000 ms.
5. **DLQ count alarms** say "for 15 consecutive minutes" but use `datapointsToAlarm: 1` with `evaluationPeriods: 15`. A single breaching minute fires them.

---

## Adding or changing an alarm

1. Add it to the construct that matches its category, using `addAlarm`, `addRateAlarm` or `addAnomalyDetectionAlarm` so naming, SNS routing and `RemovalPolicy.DESTROY` are applied consistently.
2. Put thresholds in the construct's exported threshold object (e.g. `OperationalAlarmThreshold`), not inline.
3. If the alarm needs a new resource name, expose it through `UNSResourceContract` / `UNSStack.resourceNames()` rather than importing constructs across stacks.
4. Add a row to this catalogue and link a runbook. Ground the runbook in the real alarm name; see the [runbook template](./runbooks/README.md#runbook-template).

---

## Related

**Guides:**

- [Runbooks](./runbooks/README.md)
- [Infrastructure Development Guide](./infrastructure-development.md)
- [Configuration](./configuration.md)

**Code:**

- [`infrastructure/cdk/constructs/UNSAlarmsStack.ts`](/infrastructure/cdk/constructs/UNSAlarmsStack.ts)
- [`infrastructure/cdk/constructs/alarmsConstructs`](/infrastructure/cdk/constructs/alarmsConstructs)
- [`infrastructure/cdk/constructs/dashboards`](/infrastructure/cdk/constructs/dashboards)
