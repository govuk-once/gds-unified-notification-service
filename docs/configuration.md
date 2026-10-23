# Configuration

The runtime configuration that changes how the service behaves without a code change: SSM parameters, feature flags, per-organisation controls (channels, message retention, deeplink allow-lists), and the message expiry they drive. It is for engineers changing behaviour in an environment and for on-call engineers looking for a safe mitigation.

---

## Overview

| Layer | Where it lives | Changed by | Takes effect |
| --- | --- | --- | --- |
| Deploy-time flags | `config.featureFlag` in [`infrastructure/cdk/config.ts`](/infrastructure/cdk/config.ts) | Code change + deploy | Next deploy |
| Runtime SSM parameters | `/<namespace>/config/...` etc., declared in [`shared/ssmParameter.ts`](/shared/ssmParameter.ts) | Editing the parameter in SSM, or `SSM_PARAMETERS_TO_UPDATE` on deploy | Within about 60 s |
| Secrets | Secrets Manager, declared in [`shared/secretParameters.ts`](/shared/secretParameters.ts) | Editing the secret | When the next dependency rebuild re-reads it (about 60 s) |
| Organisation config | The `organisations` DynamoDB table, seeded from [`consumersMetadata.ts`](/infrastructure/cdk/consumers/consumersMetadata.ts) | Code change + deploy | Next deploy (read on every request by the mTLS authorizer) |

`<namespace>` is `uns-<env>` (`uns` in production, see [Infrastructure Development Guide: Naming conventions](./infrastructure-development.md#naming-conventions)).

### Why changes take about 60 seconds

`ConfigurationService` loads every parameter under the namespace into an in-memory cache with a 60 s TTL. Config-dependent services are `TIMEBOUND_SINGLETON`s in [`ioc.ts`](/src/common/ioc.ts), rebuilt after 60 s. A parameter edit is therefore picked up by warm Lambdas within about a minute, with no redeploy or cold start.

---

## How runtime parameters are managed

Every entry in `shared/ssmParameter.ts` is either:

- **`staticParam(path, type, default)`**: operator-configurable. [`cdk.predeploy.ssm.ts`](/infrastructure/cdk/cdk.predeploy.ssm.ts) creates it as a `SecureString` with its default **only if it doesn't already exist**. CDK never owns it, so a manual edit survives deploys.
- **`infraParam(path, type)`**: written by CDK itself (queue URLs, table attributes, cache endpoints). Don't edit these by hand; the next deploy overwrites them.

To force a value on deploy, set the GitHub Environment variable `SSM_PARAMETERS_TO_UPDATE` to a JSON object of `{ "<path>": "<value>" }`. `_deploy.yml` passes it into `cdk:predeploy:ssm`, which overwrites the listed parameters. Keys listed in `parametersForDeletion` are removed on deploy.

> To add a new operator-configurable value, add a `staticParam` to `shared/ssmParameter.ts`. Don't create a CDK `StringParameter`, because CDK would revert manual changes on the next deploy.

---

## Parameter reference

Paths are relative to `/<namespace>/`.

### Kill switches

Before processing a batch, each SQS stage checks `config/common/enabled` and then its own flag (`BatchQueueOperation.enableConfig` → `ConfigurationService.ensureServiceIsEnabled`). If either is `false`, the invocation throws `ServiceMisconfigurationError` and the **whole batch fails**.

> A kill switch does **not** park messages. Failed batches are redelivered, and PSO queues move a message to its DLQ after 3 receives (`deadLetterQueue.maxRetries: 3`). Disabling a stage for more than a few visibility timeouts sends the messages it would have processed to the DLQ, and the DLQ alarms fire. Plan to redrive the DLQ once the stage is re-enabled. HTTP handlers do not check these flags.

| Path | Default | Stops |
| --- | --- | --- |
| `config/common/enabled` | `true` | Every SQS stage |
| `config/validation/enabled` | `true` | `sqs.validation` |
| `config/processing/enabled` | `true` | `sqs.processing` |
| `config/groupProcessingWorker/enabled` | `true` | `sqs.groupProcessingWorker` |
| `config/dispatch/enabled` | `true` | `sqs.dispatch` |

### Adapters and providers

| Path | Default | Purpose |
| --- | --- | --- |
| `config/processing/adapter` | `VOID` | Processing adapter: `UDP`, `VOID` (see [Developer Reference: Adapters](./developer-reference.md#adapters)) |
| `config/dispatch/adapter` | `VOID` | Dispatch adapter: `OneSignal`, `VOID` |
| `config/dispatch/onesignal/appId` | `placeholder` | OneSignal app ID. The API key is the Secrets Manager secret `config/dispatch/onesignal/apiKey` |
| `udp/config/sm`, `udp/config/kms`, `udp/config/role` | `null` | UDP credentials secret, KMS key and cross-account role |

### Circuit breaker and rate limiting (dispatch)

| Path | Default | Purpose |
| --- | --- | --- |
| `config/dispatch/circuitBreaker/threshold` | `100` | Failures within the window before the breaker opens |
| `config/dispatch/circuitBreaker/windowDuration` | `60` | Sliding window, seconds |
| `config/dispatch/circuitBreaker/halfOpenAfter` | `30` | Seconds before a half-open probe |
| `config/dispatch/circuitBreaker/rateLimitWhenOpen` | `100` | Probe requests per minute allowed while half-open |
| `config/common/cache/notificationsProviderRateLimitPerMinute` | `100` | Dispatch calls to the provider per minute (`CacheService.rateLimit` in `sqs.dispatch`) |

### Content and deeplinks

| Path | Default | Purpose |
| --- | --- | --- |
| `content/allowed/protocols` | `govuk:,https:` | URL protocols allowed inside `MessageBody` |
| `content/allowed/urlHostnames` | `*.gov.uk` | Hostnames allowed inside `MessageBody` |
| `notification/deeplinkTemplate` | `govuk://app.gov.uk/notificationcentre/detail?id:{id}` | Default push deeplink; `{id}` is replaced with the `NotificationID` |

### Groups

| Path | Default | Purpose |
| --- | --- | --- |
| `group/dispatch/workerCount` | `5` | Chunks `postGroupMessage` splits a group into |
| `group/dispatch/workerBatchSize` | `100` | Push IDs per `groupProcessingWorker` invocation |

### Slack alerts and release announcements

| Path | Default | Purpose |
| --- | --- | --- |
| `alerts/slack/workspaceId` | `null` | AWS Chatbot workspace |
| `alerts/slack/channelId` | `null` | Channel for the alarm topic (`uns-<env>-sns-topic-alerts`) |
| `alerts/slack/releaseChannelId` | `null` | Channel for release announcements (`uns-<env>-sns-topic-releases`) |

These are read at **synth time**. `UNSCommon` only creates the Chatbot subscription when the workspace ID and channel ID are both set, so changing them needs a redeploy. See [Releases: Deployment notifications](./releases.md#deployment-notifications).

### Other

| Path | Default | Purpose |
| --- | --- | --- |
| `flex/account`, `flex/vpce` | `null` | The Flex consumer's AWS account and VPC endpoint IDs, read at synth time to build the private Flex API's resource policy and invoke role |
| `certificate/consumers` | `{}` | Map of organisation → consumer AWS account ID, read at synth time by `UNSClientCertificateConstruct` to grant that account cross-account decrypt on its certificate's private key |

---

## Feature flags

The newer message fields are gated twice:

1. **Deploy-time (`config.featureFlag`)**: `groups`, `deeplinkUrl`, `messageRetention` and `channelControls` are all `env !== 'prod'`.
   - `groups` controls whether the group resources are **deployed** at all: the GroupStore table, `groupprocessing` queue, `postGroupMessage`, `groupProcessingWorker`, the Flex group routes and the group dashboard.
   - The other three set the **default value** that `cdk.predeploy.ssm.ts` gives the matching SSM flag when it first creates it.
2. **Runtime SSM flags**: `config/featureFlag/deeplinkUrl`, `config/featureFlag/channelControls`, `config/featureFlag/messageRetention`. These come out as `false` in production and `true` elsewhere. Because predeploy never overwrites an existing value, a flag flipped by hand stays flipped.

| Runtime flag | When `false` | When `true` |
| --- | --- | --- |
| `deeplinkUrl` | A request with `DeeplinkURL` is rejected (400 `unexpected DeeplinkURL`). Dispatch drops any `DeeplinkURL` and uses the template | `DeeplinkURL` is validated against the organisation's [deeplink allow-list](#deeplink-allow-list) and sent to the provider |
| `channelControls` | A request with `Channel` is rejected (400 `unexpected Channel`). Dispatch drops `Channel` | `Channel` must be in the organisation's [allowed channels](#channels) |
| `messageRetention` | A request with `ExpiresInDays` is rejected (400 `unexpected ExpiresInDays`) | `ExpiresInDays` is validated against the organisation's [retention window](#message-retention) |

Request-side enforcement is in [`ValidationService.messageValidation`](/src/common/services/validationService.ts), used by `postMessage` and `postGroupMessage`. Dispatch-side stripping is in [`sqs.dispatch`](/src/lambdas/pso/sqs.dispatch/handler.ts).

> Flipping a flag off while messages are in flight is safe: dispatch strips the gated fields rather than failing.

---

## Organisation config

Each PSO organisation has an `OrganisationConfig` record in the `organisations` table. The mTLS authorizer reads it on every request and passes it to handlers as a JSON string in `requestContext.authorizer.OrganisationConfig` (see [Developer Reference: The mTLS authorizer](./developer-reference.md#the-mtls-authorizer)).

Records are defined in code, in [`consumersMetadata.ts`](/infrastructure/cdk/consumers/consumersMetadata.ts), using presets from [`OrganisationMetadata.ts`](/src/common/models/OrganisationMetadata.ts). On deploy, `UNSOrganisations` seeds them into DynamoDB through the `UNSDynamoDBWriterConstruct` custom resource:

```typescript
DVLA: IOrganisationRecordBuilder('DVLA', {
  Channels: ChannelsControlPreset.All,
  MessageRetention: MessageRetentionPresent.OneMonth,
  DeeplinkAllowList: DeeplinkPreset.AppOnly,
}),
```

Any field left out falls back to the most restrictive preset. Config that fails validation also falls back to the restrictive preset (`.catch(...)` in [`IOrganisationRecord.ts`](/src/common/repositories/interfaces/IOrganisationRecord.ts)) rather than failing the request.

### Channels

| Preset | Allows |
| --- | --- |
| `ChannelsControlPreset.None` (default) | Nothing; any `Channel` is rejected |
| `ChannelsControlPreset.Standard` | `PUSH_NOTIFICATION_AND_MESSAGE_CENTRE` |
| `ChannelsControlPreset.All` | `PUSH_NOTIFICATION_AND_MESSAGE_CENTRE`, `MESSAGE_CENTRE_ONLY` |

A message sent with `MESSAGE_CENTRE_ONLY` is stored and appears in Flex, but the OneSignal adapter skips the push.

### Message retention

| Preset | Meaning |
| --- | --- |
| `MessageRetentionPresent.NotAllowed` (default) | `ExpiresInDays` is rejected |
| `MessageRetentionPresent.OneMonth` | `ExpiresInDays` must be between 2 and 30 |

A custom `{ Allowed: true, Min, Max }` is also accepted. `Min` and `Max` are required when `Allowed` is true, and `Min` must not exceed `Max`.

### Deeplink allow-list

| Preset | Allows |
| --- | --- |
| `DeeplinkPreset.None` (default) | No deeplinks |
| `DeeplinkPreset.AppOnly` | `govuk:` |
| `DeeplinkPreset.AppAndWeb` | `govuk:`, `https:` |

Entries can name a `protocol`, a `hostname`, or both. These replace the SSM `content/allowed/*` values for deeplinks, which only govern URLs inside the message body.

When an explicit `govuk://` deeplink is dispatched, the OneSignal adapter appends `?notificationID=<id>` so the app can open the right notification.

---

## Message expiry (TTL)

The Messages table has DynamoDB TTL on `ExpirationDateTime`, stored as a Unix epoch number.

1. If the request included `ExpiresInDays` (and retention allowed it), it is stored as `RequestedDaysToExpire`, and `ExpirationDateTime` = now + that many days.
2. Otherwise `ExpirationDateTime` = now + the table default of **30 days** (`ttlDurationInSeconds` in `UNSCommon`).

DynamoDB can take up to 48 hours to delete an expired item. Flex `getNotifications` filters out records past `ExpirationDateTime`, and `getNotificationById` returns 404 for them, so expiry is exact from the user's point of view.

---

## Related

**Guides:**

- [Infrastructure Development Guide: SSM parameter conventions](./infrastructure-development.md#ssm-parameter-conventions)
- [Developer Reference](./developer-reference.md)
- [Fix Forward Runbook](./runbooks/fix-forward.md)

**Code:**

- [`shared/ssmParameter.ts`](/shared/ssmParameter.ts)
- [`infrastructure/cdk/cdk.predeploy.ssm.ts`](/infrastructure/cdk/cdk.predeploy.ssm.ts)
- [`src/common/services/validationService.ts`](/src/common/services/validationService.ts)
- [`infrastructure/cdk/consumers/consumersMetadata.ts`](/infrastructure/cdk/consumers/consumersMetadata.ts)
