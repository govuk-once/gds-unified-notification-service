# API Gateway Errors Runbook

How to investigate and respond to elevated API Gateway error rates on PSO or Flex.

This runbook is for the on-call engineer. An elevated 5xx or 4xx rate means requests are reaching API Gateway but the platform is failing to serve them, or callers are sending requests it rejects. The fault is almost always behind the gateway, in a Lambda or a downstream dependency, so the work is to read the right code, trace the request to where it broke, and fix or escalate. Work through the steps in order.

> A 5xx is API Gateway or a handler reporting that something behind the edge failed, not that API Gateway itself is broken. The status code is the first clue to where — interpret it before digging further.

---

## Where an error comes from in this service

A request runs `API Gateway → (mTLS authorizer, PSO only) → Lambda handler → (optional) downstream adapter`. Every application-level error extends `BaseError` (see [Developer Reference: Errors](../developer-reference.md#errors)) and is mapped to a status code by `httpErrorHandlerMiddleware`; anything not a `BaseError` becomes a generic `500`.

| Status | Typically means |
| -------- | ------------------------------------------------------------------------------------------------------------------------- |
| **400** | `BadRequestError` — malformed request body/query, or a content-validation failure (`ContentValidationError`) |
| **401** | `UnauthorizedError` |
| **404** | `NotFoundError` — includes `NoDispatchIdFound`/`NoLinkingIdFound` from the notification adapter |
| **417** | `ExpectationFailedError` — the handler's own response failed its Zod schema. A code/contract bug, not client error or an outage |
| **429** | `TooManyRequestsError`/`RateLimitingError` — the `CacheService.rateLimit` check in the dispatch stage was exceeded |
| **500** | `InternalServerError` and subclasses, or any unhandled exception the Lambda itself threw |
| **502** | `BadGatewayError` and subclasses (`DispatchAdapterError`, `ProcessingAdapterError`) — a downstream adapter (OneSignal, UDP) failed |
| native 5xx/503 (no matching handler log) | API Gateway itself — the Lambda crashed, ran out of memory, was throttled, or exceeded its timeout before returning |

The important split: a **500, 502, 400, 404, 417 or 429 with a `BaseError` name in the response body comes from this codebase and is logged with a clear message**; a **native 502/503/504 with no matching application log line comes from API Gateway** because the Lambda never returned cleanly. Which of the two you're looking at decides where you investigate.

---

## Step 1: identify and interpret the error

1. **Read the alarm.** The relevant CloudWatch alarms (see [Infrastructure Development Guide: CloudWatch alarms](../infrastructure-development.md#cloudwatch-alarms) for the full table) are:

   | Alarm | Threshold | Tells you |
   | ---------------------------------------------------- | --------------------------------- | ----------------------------------------------------------- |
   | `Api5xxErrorRateElevated` (P1) | > 1% over 5 min | Requests are failing outright |
   | `Api4xxErrorRateElevated` (P2) | > 10% over 5 min | Callers are sending requests the platform rejects, or auth is failing |
   | `LambdaErrorRateElevated-${name}` (P2), per Lambda | > 1% over 5 min | A specific handler is throwing |
   | `${provider}Offline` (P1) | > 40% HTTP error rate over 1 min | A downstream adapter (OneSignal) is failing — see [Queue Backlog and Dispatch Failures](./queue-backlog-and-dispatch-failures.md) |
   | `MTLSDenialRateHigh` / `RevokedCertificateDetected` / `UnknownCertificateSpikeDetected` (PSO only) | — | The mTLS authorizer is denying requests — see [Step 3](#step-3-mtls-specific-checks-pso-only) |

2. **Find the exact status code and route.** Query the API Gateway access logs for the affected stage in CloudWatch Logs Insights:

   ```text
   fields @timestamp, status, httpMethod, resourcePath, requestId
   | filter status >= 400
   | sort @timestamp desc
   ```

3. **Interpret the spread.** All 5xx on one route points at that handler or a downstream it calls. A mix of 500s across many routes points at a shared fault (config, a resource, a recent deploy). A burst of 502s naming one provider points at a downstream outage. A spike of 401/403 on PSO points at mTLS — see [Step 3](#step-3-mtls-specific-checks-pso-only).

---

## Step 2: trace the request

1. Take the `requestId` from an access log entry for a failed request.
2. Pivot into the Lambda log group for the affected handler and search for that request ID. If you find an application error log (a `BaseError` name and message), the Lambda ran and the fault is in the handler or its downstream. If you find nothing for that request, the Lambda didn't return cleanly — a crash, timeout, or throttle, which is a native API Gateway error rather than an application one.
3. X-Ray tracing is active on every Lambda (`Tracing.ACTIVE`, see [Infrastructure Development Guide: base constructs](../infrastructure-development.md#base-constructs-constructsbases)) — the service map and individual traces show how far a request travelled and which segment errored or timed out.

---

## Step 3: mTLS-specific checks (PSO only)

Flex is not mTLS-protected; skip this section for Flex-only incidents.

If PSO requests are failing at the edge before reaching application logs (401/403, or a distinctive TLS handshake failure), the mTLS authorizer or the certificate itself is the likely cause:

1. Check whether the caller's organisation is in the current consumer registry for the target environment — see [Infrastructure Development Guide: Consumers](../infrastructure-development.md#consumers-mtls-client-registry). A consumer whose certificate window has expired (sandbox certs roll weekly; see `consumers.ts`) will start failing with no code change on this side.
2. Check the `RevokedCertificateDetected` and `UnknownCertificateSpikeDetected` alarms — a spike in either points at a consumer using a stale or wrong certificate, not a platform fault.
3. Search the authorizer's own Lambda log group for the denial reason (no cert presented, unknown cert, `Revoked: true`, or no `Organization` on the record) — the authorizer logs which branch it took.

A caller-side certificate problem is not a fix-forward situation on this side — direct them to reissue/rotate, or check whether their consumer entry needs updating in `devConsumers.ts`/`stagingConsumers.ts`/`productionConsumers.ts`.

---

## Common causes

| Cause | How it presents | Where it sits |
| ---------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| Unhandled exception | 500s with a stack trace in the logs; often starts right after a deploy | A bug in the handler |
| Downstream adapter failure | 502s (`DispatchAdapterError`/`ProcessingAdapterError`); `${provider}Offline` alarm | OneSignal or UDP — see [Queue Backlog and Dispatch Failures](./queue-backlog-and-dispatch-failures.md) |
| Response schema drift | 417s (`ExpectationFailedError`) | The handler's own response no longer matches its Zod schema — a code bug, not an outage |
| Throttling / concurrency | Native 503s or 5xx with Lambda `Throttles` above zero, no matching application log | Reserved/account concurrency exhausted |
| Misconfiguration | 500s/502s starting exactly at a deploy, across multiple routes | A missing or wrong SSM parameter, secret, or IAM permission |
| mTLS denial (PSO only) | 401/403 with no application log, or an authorizer `Deny` in its own logs | See [Step 3](#step-3-mtls-specific-checks-pso-only) |
| Client-side bad requests | 400s/404s, `Api4xxErrorRateElevated` | Often expected caller behaviour — confirm before treating as an incident |

---

## Resolve, mitigate or escalate

Anything shipped as code follows the [Fix Forward Runbook](./fix-forward.md).

- **Followed a deploy** (unhandled exceptions, misconfiguration starting at a known release): the fastest safe route is usually reverting the offending change forward. Compare the error start time against the git tag history (see [Releases Guide](../releases.md)) to confirm.
- **Downstream adapter is failing** (502s, `${provider}Offline`): this is a dependency incident — see [Queue Backlog and Dispatch Failures](./queue-backlog-and-dispatch-failures.md#mitigating-a-downstream-adapter-failure).
- **Throttling**: capacity, not code — review the function's reserved concurrency.
- **mTLS**: see [Step 3](#step-3-mtls-specific-checks-pso-only) — usually not a fix-forward situation on this side.

---

## After recovery

1. Confirm the 5xx/4xx alarm has cleared and held at baseline for an agreed settling period.
2. Raise follow-up work for anything the incident exposed — a missing fallback, an alarm that fired late, a timeout that needs tuning.
3. Feed anything you worked out under pressure back into this runbook.

---

## Related

**Guides:**

- [Fix Forward Runbook](./fix-forward.md)
- [Queue Backlog and Dispatch Failures](./queue-backlog-and-dispatch-failures.md)
- [Developer Reference: Errors](../developer-reference.md#errors)
- [Infrastructure Development Guide: CloudWatch alarms](../infrastructure-development.md#cloudwatch-alarms)

**Code:**

- [`src/common/models/Errors`](/src/common/models/Errors)
- [`src/common/middlewares/httpErrorHandlerMiddleware.ts`](/src/common/middlewares/httpErrorHandlerMiddleware.ts)
- [`infrastructure/cdk/constructs/alarmsConstructs`](/infrastructure/cdk/constructs/alarmsConstructs)
