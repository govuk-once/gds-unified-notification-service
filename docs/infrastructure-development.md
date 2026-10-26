# Infrastructure Development Guide

Guide to the CDK application in [`infrastructure/cdk`](/infrastructure/cdk): stack composition, constructs, naming, SSM conventions, mTLS, networking, alerting, dashboards and tagging.

---

## Overview

[`infrastructure/cdk/cdk.ts`](/infrastructure/cdk/cdk.ts) (the app entry point, `cdk.json`'s `"app": "tsx cdk.ts"`) defines up to four stacks:

```text
uns-<env>-global-stack        UNSGlobalStack   us-east-1   CloudFront-scoped WAF Web ACL (+ KMS, WAF log group)
        │  crossRegionReferences
        ▼
uns-<env>-stack               UNSStack         eu-west-2   the service itself (below)
        │  resourceNames() → UNSResourceContract
        ├──► uns-<env>-alarms-stack        UNSAlarmsStack    every CloudWatch alarm, see [Alarms](./alarms.md)
        └──► uns-<env>-e2e-testing-stack   UNSTestingStack   CodeBuild e2e/ZAP runner (dev, stg, PR envs only)
```

`UNSStack` composes five constructs in order:

```text
UNSStack
├── UNSCommon              — KMS, VPC, DynamoDB tables, ElastiCache, SNS alert + release topics, Slack (Chatbot), code signing
├── UNSMTLSCommon           — mTLS private CA, truststore bucket, revocation table, per-consumer client certs
├── UNSOrganisationsCommon  — "organisations" DynamoDB table, seeded via a custom resource
├── UNSPSOResource          — the PSO service: SQS pipeline, HTTP/SQS/schedule Lambdas, CloudFront + mTLS-protected API Gateway, dashboards
└── UNSFlexResource         — the Flex service: HTTP Lambdas, public (dev/sandbox-only) + private API Gateway
```

("PSO" is the public-facing, mTLS-protected send/status API used by external departments. "Flex" is the internal API the GOV.UK app backend uses to read and manage a user's notifications. They match `src/lambdas/pso` and `src/lambdas/flex`.)

Within `UNSStack`, constructs are wired together with typed constructor props (`refs: common`, `mtls: {...}`). Between stacks:

- **Global → main**: `UNSStack` receives the `UNSGlobalStack` instance and reads `cloudfrontWebAclArn`. Both stacks set `crossRegionReferences: true`, so CDK carries the ARN across regions.
- **Main → alarms**: alarms never import constructs. `UNSStack.resourceNames()` returns a plain [`UNSResourceContract`](/infrastructure/cdk/constructs/UNSResourceContract.ts) of names (API names, queue/DLQ names, Lambda function names, WAF names, alert topic ARN), so alarms can change and redeploy without touching the main stack. To alarm on a new resource, add its name to the contract.
- **Main → testing**: `UNSTestingStack` receives the VPC, security group, KMS key and Messages table.

Values that need to survive outside the construct tree (read by scripts, Lambdas or other environments) go through **SSM Parameter Store**; see [SSM parameter conventions](#ssm-parameter-conventions).

---

## Naming conventions

All naming flows from [`infrastructure/cdk/config.ts`](/infrastructure/cdk/config.ts):

- `project = 'uns'`; `env` comes from the `env` process environment variable (throws if unset).
- `prefix = "${project}-${env}".replace('-prod', '')` — **production has no `-prod` suffix.** Prod prefix is `uns`; dev is `uns-dev`; a sandbox named `alice-a1b2` is `uns-alice-a1b2`.
- `namespace` follows the same `-prod`-stripping rule, and is the root of the SSM parameter path (see below).
- `config.utils.namingHelper(...args)` → `[project, env, ...args].join('-').toLowerCase().replace('-prod', '')` — the canonical **AWS resource name** builder, e.g. `namingHelper('lmdb', 'pso', 'postMessage')` → `uns-dev-lmdb-pso-postmessage`.
- `config.utils.constructNamingHelper(...args)` → `camelCase(...args)` — used only for **CDK construct IDs** in the synthesized template's scope hierarchy, distinct from the AWS-visible resource name above.
- `unremovableEnvironments = ['dev', 'stg', 'prod']` drives `isMainEnv`. Main environments get `RemovalPolicy.RETAIN`, one-year log/parameter retention, deletion protection on DynamoDB tables, and their own generated mTLS CA. Any other `env` value is treated as an ephemeral developer sandbox: `RemovalPolicy.DESTROY`, one-month retention, and shared VPC/mTLS/CA imported from `dev` via SSM rather than provisioned fresh (see [Sandbox environments](#sandbox-environments)).
- `nonDevelopmentEnvironments = ['stg', 'prod']` drives `isNonDevEnv` (controls e.g. VPC Flow Logs, SSM parameter expiry duration).

---

## Base constructs (`constructs/bases`)

Reusable wrappers around individual AWS resources, used throughout `UNSCommon`/`UNSPSOResources`/`UNSFlexResources`.

| Construct | Wraps | Notes |
| ---------------------------------------------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| [`UNSLambdaConstruct`](/infrastructure/cdk/constructs/bases/UNSLambdaConstruct.ts) | `NodejsFunction` + IAM role + log group | Declarative `iam` props (`dynamodb`, `sqsSend`, `ssmNamespaces`, `sm`, `kms`, `elasticache`, `s3`, …) turned into scoped policy statements. `NODEJS_22_X`, 512MB/30s defaults, `Tracing.ACTIVE`. Static factories `baseHTTPFactory`/`baseSQSFactory`/`baseScheduleFactory(serviceName, signingConfig)` resolve `bundlePath` to `dist/${serviceName}/${kind}.${operationId}` — see [Lambda entry-point resolution](#lambda-entry-point-resolution) |
| [`UNSApiGatewayConstruct`](/infrastructure/cdk/constructs/bases/UNSApiGatewayConstruct.ts) | `RestApi` (+ CloudFront `Distribution`) | Regional custom domain via Route53 + regional ACM cert, regional WAFv2 association + logging, usage plans/API keys, private-API resource policies, fluent `.GET()/.POST()/.PATCH()/.DELETE()` route registration. With `mtls` set, it also creates a CloudFront distribution with **viewer mTLS** (CloudFront trust store), an origin-header secret, the CloudFront WAF from the global stack, and Shield Advanced in `stg`/`prod`. See [mTLS certificate infrastructure](#mtls-certificate-infrastructure) |
| [`UNSDynamoDBConstruct`](/infrastructure/cdk/constructs/bases/UNSDynamoDBConstruct.ts) | `Table` | Pay-per-request, KMS CMK encryption, PITR, optional TTL. Exposes `attributes` (published to SSM) and precomputed `permissions.{readOnlyById,readOnly,readAndWrite}` IAM shapes |
| [`UNSQueueConstruct`](/infrastructure/cdk/constructs/bases/UNSQueueConstruct.ts) | `Queue` (+ optional DLQ) | KMS-encrypted, default `maxReceiveCount` 10 |
| [`UNSVpcConstruct`](/infrastructure/cdk/constructs/bases/UNSVpcConstruct.ts) | `Vpc` | See [Networking](#networking) |
| [`UNSKMSConstruct`](/infrastructure/cdk/constructs/bases/UNSKMSConstruct.ts) | `kms.Key` | Rotating key + alias, composable principal policy |
| [`UNSS3BucketConstruct`](/infrastructure/cdk/constructs/bases/UNSS3BucketConstruct.ts) | `Bucket` | Private, SSE-S3, TLS-enforced, versioned |
| [`UNSElasticacheConstruct`](/infrastructure/cdk/constructs/bases/UNSElasticacheConstruct.ts) | `CfnServerlessCache` (Valkey) | IAM-authenticated user/group, 10GB/5000 ECPU caps, daily snapshot |
| [`UNSCertificateAuthorityConstruct`](/infrastructure/cdk/constructs/bases/UNSCertificateAuthorityConstruct.ts) | ACM Private CA Root CA | See [mTLS certificate infrastructure](#mtls-certificate-infrastructure) |
| [`UNSClientCertificateConstruct`](/infrastructure/cdk/constructs/bases/UNSClientCertificateConstruct.ts) | Per-consumer client cert | See [mTLS certificate infrastructure](#mtls-certificate-infrastructure) |
| [`UNSCustomResourceConstruct`](/infrastructure/cdk/constructs/bases/UNSCustomResourceConstruct.ts) | `NodejsFunction` + `customResources.Provider` | Generic base for CloudFormation custom resources — see [Custom resources](#custom-resources) |
| [`UNSSlackIntegration`](/infrastructure/cdk/constructs/bases/UNSSlackIntegration.ts) | `chatbot.SlackChannelConfiguration` | `UNSSlackAlert`: subscribes AWS Chatbot to one or more SNS topics, see [Alerting](#alerting) |
| [`UNSE2EConstruct`](/infrastructure/cdk/constructs/bases/UNSE2EConstruct.ts) | CodeBuild `Project` + source bucket | VPC-attached runner (`uns-<env>-e2e-runner-project`, bucket `uns-<env>-e2e-runner-builds`) used by `_test_e2e.yml` and the ZAP scans, see [Deployment Guide](./deployment.md#e2e-in-codebuild-_test_e2eyml) |

### Lambda entry-point resolution

The mechanism that ties a CDK Lambda definition to a built handler in `src/lambdas`:

```typescript
static baseFactory(serviceName: string, kind: 'http' | 'sqs' | 'schedule', signingConfig: CodeSigningConfig) {
  return (operationId: string) => ({
    serviceName,
    name: [operationId],
    bundlePath: `./../../dist/${serviceName}/${kind}.${operationId}`,
    signingConfig,
  });
}
```

Since `cdk.json` runs `tsx cdk.ts` from `infrastructure/cdk`, this resolves to `dist/${serviceName}/${kind}.${operationId}` at the repo root — the built output of `src/lambdas/${serviceName}/${kind}.${operationId}/handler.ts`. The directory name under `src/lambdas` (e.g. `pso/http.postMessage`, `pso/sqs.dispatch`) must match the `{kind}.{operationId}` the CDK side requests — this is what [`src/lambdas/README.md`](/src/lambdas/README.md)'s naming convention is protecting.

---

## PSO and Flex resources

`UNSPSOResources.ts` and `UNSFlexResources.ts` are where individual Lambdas, API Gateway routes, alarms and dashboards for each service are actually instantiated, using the base constructs above. Route registration reads, for example:

```typescript
if (this.lambdas.http.getGroups) {
  gateway.GET('getGroups', '/v1/groups', this.lambdas.http.getGroups.integration);
}
```

— one `LambdaIntegration` per route, mapped 1:1 to a handler file. See the [Developer Reference](./developer-reference.md#handler-patterns) for the application-code side of a handler.

Only the SQS-triggered `processing`, `dispatch`, `groupProcessingWorker` and `analytics` Lambdas run inside the VPC (they call ElastiCache and/or UDP); see [Networking](#networking). PSO is reached through CloudFront with viewer mTLS; Flex is not mTLS-protected.

The group resources (GroupStore table, `groupprocessing` queue, `postGroupMessage`, `groupProcessingWorker`, Flex `getGroups`/`modifyGroups`) are only created when `config.featureFlag.groups` is true, which means every environment except `prod`. See [Configuration: Feature flags](./configuration.md#feature-flags).

CloudWatch dashboards are defined in CDK in [`constructs/dashboards`](/infrastructure/cdk/constructs/dashboards): `UNSPSOFlow` (pipeline throughput per stage), `UNSPSOGroupsFlow` (group worker lifecycle) and `UNSPSOUtilization` (incoming notification totals).

---

## Custom resources

[`constructs/customResourceFnsConstructors/`](/infrastructure/cdk/constructs/customResourceFnsConstructors) provides typed subclasses of `UNSCustomResourceConstruct`, each binding a handler in [`customResourceFns/`](/infrastructure/cdk/customResourceFns) (separately bundled from `src/lambdas`, inlined by CDK's `NodejsFunction`, not part of the main `pnpm build`):

| Construct | Handler | Purpose |
| ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `UNSClientCertificateGeneratorConstruct` | [`unsClientCertificateCSRGenerator.ts`](/infrastructure/cdk/customResourceFns/unsClientCertificateCSRGenerator.ts) | Generates a 4096-bit RSA key + self-signed CSR (`node-forge`), stores the private key in Secrets Manager |
| `UNSDynamoDBWriterConstruct` | [`unsDynamoDBWriter.ts`](/infrastructure/cdk/customResourceFns/unsDynamoDBWriter.ts) | Generic table row writer — seeds organisation rows and mTLS revocation rows. `Delete` is a soft delete (`Deleted: true`), not an actual row delete. Any property named `*ToSerializeToSha256` is hashed at execution time, working around CDK's inability to hash a CFN token at synth time |
| `UNSs3ObjectConstruct` | [`unss3ObjectWriter.ts`](/infrastructure/cdk/customResourceFns/unss3ObjectWriter.ts) | Uploads the mTLS truststore PEM to S3 |
| `UNSSMWriterConstruct` (`UNSSMWriterProvider`) | [`unsSMWriter.ts`](/infrastructure/cdk/customResourceFns/unsSMWriter.ts) | Writes a value to **Secrets Manager** — despite the "SM" name, this is Secrets Manager, not SSM Parameter Store. Used to store the signed client cert CRT and export access keys |

---

## SSM parameter conventions

Every parameter the application reads is declared once in [`shared/ssmParameter.ts`](/shared/ssmParameter.ts) (`SSMParameters`), and every secret in [`shared/secretParameters.ts`](/shared/secretParameters.ts). Lambdas, CDK and scripts all import the same registry, so a path is never spelled out twice. `staticParam` entries are operator-configurable with a default; `infraParam` entries are written by CDK. The full reference is in [Configuration](./configuration.md).

Two distinct path roots are used, both written via [`utils/SSMFromObject.ts`](/infrastructure/cdk/utils/SSMFromObject.ts):

1. **Namespaced, per-environment** — `/${namespace}/...`, e.g. `/uns-dev/table/inbound/attributes`, `/uns-dev/queue/analytics/url`, `/uns/config/dispatch/onesignal/appId` in production. Written both from within CDK constructs (default `SSMFromObject` behaviour) and from a standalone script (`cdk.predeploy.ssm.ts`, see below) for values that need to change independently of a deploy.
2. **Unnamespaced "shared" exports** — `/shared/...` (`SSMFromObject(..., { omitNamespace: true })`), written only by the `dev` environment when `config.exportResourcesForDevSandboxUse` is true: `/shared/vpc`, `/shared/mtls/truststore`, `/shared/mtls/revocation/tableArn`, `/shared/mtls/revocation/attributes`, `/shared/mtls/kmsArn`. Sandbox environments read these back at synth time (`config.sandbox.shared.*`) instead of provisioning their own VPC/CA — see [Sandbox environments](#sandbox-environments).

Pre-existing, infra-team-provided values this app consumes but doesn't own: `/infra/dns/hostedzonename`, `/infra/acm/certificatearnregional`, `/infra/acm/certificatearncloudfront` (the us-east-1 certificate for the PSO CloudFront distribution).

### Predeploy / postdeploy scripts

`pnpm run cdk:deploy` wraps `cdk deploy` with two standalone scripts, run **outside** CDK's synth/deploy lifecycle so it never owns or reverts these values:

- [`cdk.predeploy.ssm.ts`](/infrastructure/cdk/cdk.predeploy.ssm.ts) (before deploy): idempotently creates every `staticParam` from `SSMParameters` that doesn't exist yet, as a `SecureString` under `/${namespace}/...` with its default. Feature flag defaults come from `config.featureFlag`. It applies `SSM_PARAMETERS_TO_UPDATE` overrides if set and deletes keys listed in `parametersForDeletion`.
- [`cdk.ephemeral.cleanup.ssm.ts`](/infrastructure/cdk/cdk.ephemeral.cleanup.ssm.ts) (PR environments only, after destroy): deletes everything under `/${namespace}/`, since predeploy-created parameters aren't owned by any stack.
- [`cdk.postdeploy.ssm.ts`](/infrastructure/cdk/cdk.postdeploy.ssm.ts) (after deploy) — looks up the just-deployed Flex private API Gateway and its freshly generated API key, then writes `{apiKey, apiUrl, privateApiUrl, roleArn, region}` into the `${prefix}/flex/consumer` Secrets Manager secret, since an API key value isn't safely obtainable as a CloudFormation token.

If you need a value editable between deploys without CDK reverting it, add it to `cdk.predeploy.ssm.ts` rather than a CDK `StringParameter` resource.

---

## Networking

This service **does** provision its own VPC in main environments.

```typescript
// UNSCommon.ts
this.vpc = new UNSVpcConstruct(this, config, {
  name: ['main'],
  cidr: config.vpc.cidr,        // default 10.0.0.0/16
  zones: config.vpc.zones,      // default ['a', 'b', 'c']
  interfaceEndpoints,            // ApiGateway, Lambda, Sqs, Kms, Ssm, SecretsManager, CloudWatch*, Xray, NetworkFirewall
  gatewayEndpoints,              // DynamoDB, S3
});
```

- `PUBLIC` + `PRIVATE_WITH_EGRESS` subnets (`/23`), one NAT gateway per AZ.
- Two security groups: `privateEgress` (allow-all-outbound, plus explicit tcp/6379 for ElastiCache) and `privateIsolated` (deny-outbound except tcp/6379). Only `privateEgress` is actually attached to anything.
- A restrictive Network ACL on the private subnet group (denies inbound SSH/RDP, allows everything else).
- VPC Flow Logs to S3, enabled only for `stg`/`prod` (`isNonDevEnv`).
- **Which Lambdas are VPC-attached**: only the SQS-triggered `processing`, `dispatch`, `groupProcessingWorker` and `analytics` Lambdas (they call ElastiCache and/or UDP), plus the CodeBuild e2e runner. Every HTTP-triggered Lambda, `validation`, custom-resource Lambdas, and all of Flex's Lambdas are **not** VPC-attached — Checkov's `CKV_AWS_117` is explicitly skipped with the justification "not all lambdas need to be in VPCs by design".

### Sandbox environments

Non-main environments don't create their own VPC (or mTLS CA) at all. `UNSVpcConstruct` checks `!config.isMainEnv && config.sandbox.shared.vpc !== null` and instead **imports** `dev`'s VPC/subnets/security-groups via `Vpc.fromVpcAttributes`, reading the description back from the `/shared/vpc` SSM parameter `dev` exported. The equivalent applies to the mTLS CA and revocation table (see below). This avoids every developer sandbox paying for its own NAT Gateway.

---

## mTLS certificate infrastructure

PSO callers authenticate with a client certificate issued by this service's private CA. Since NOT-289 the TLS handshake ends at **CloudFront**, not API Gateway:

```text
PSO client ──mTLS──► CloudFront (viewer mTLS, trust store, CloudFront WAF)
                         │  adds x-origin-header; forwards CloudFront-Viewer-Cert-{Pem,Subject,Validity}
                         ▼
                  API Gateway (regional custom domain, regional WAF)
                         │  REQUEST authorizer (resultsCacheTtl: 0)
                         ▼
                  mtlsCertificateRevocationAuthorizer ──► revocation table, organisations table
```

The chain, in [`UNSMTLS.ts`](/infrastructure/cdk/constructs/UNSMTLS.ts), the CA and client-cert base constructs, and `UNSApiGatewayConstruct`:

1. **Truststore S3 bucket**: created in every environment (versioned, SSE-S3, TLS-enforced; tagged `DataProtection: Ephemeral` in PR environments).
2. **Main environments only** (`config.isMainEnv`):
   - `revocationTable`: a `UNSDynamoDb` (`certificates`, PK `Id` = SHA-256 of the certificate PEM) tracking issued and revoked certs, checked at request time by the [mTLS authorizer](./developer-reference.md#the-mtls-authorizer).
   - `certificateAuthority`: a `UNSCertificateAuthorityConstruct`, an ACM Private CA root. `dev`/`stg`/`prod` use `GENERAL_PURPOSE` mode, valid until 2036-01-01. Sandboxes import `dev`'s CA rather than creating their own.
   - Custom-resource providers for CSR generation, revocation-table writes and Secrets Manager writes (see [Custom resources](#custom-resources)).
   - A dedicated `mtlsConsumerKey` KMS key allowing cross-account decrypt for consumer organisations whose AWS account ID is registered in the `certificate/consumers` SSM parameter.
   - One `UNSClientCertificateConstruct` per entry in `getConsumers(config.env, config)` (see [Consumers](#consumers-mtls-client-registry)), each producing a private key and signed certificate in Secrets Manager (`<prefix>/tls/<id>/private-key`, `<prefix>/tls/<id>/crt`) plus a revocation row.
3. **Sandbox environments** skip CA and revocation-table creation entirely and import `dev`'s values from the `/shared/mtls/*` SSM paths.
4. **Truststore upload** happens unconditionally (main or sandbox) via the S3-writer custom resource, writing `truststore.${uuid}.pem`. The name is randomised per deploy because a truststore object can't be shared between gateways and stays reserved indefinitely.
5. **CloudFront viewer mTLS**: `UNSApiGatewayConstruct` creates a `CfnTrustStore` from that PEM and sets `ViewerMtlsConfig` to `Mode: required`, `AdvertiseTrustStoreCaNames: true` and `IgnoreCertificateExpiry: false`. CloudFront rejects a client without a valid, unexpired certificate from the CA before any request reaches AWS Lambda. It then forwards the certificate in `CloudFront-Viewer-Cert-*` headers (origin request policy `mtls-cert-headers`) and adds an `x-origin-header` with a 64-character secret from Secrets Manager (`<prefix>/apigw/pso/private-key`). Caching is disabled.
6. **Revocation check at request time**: the [mTLS authorizer](./developer-reference.md#the-mtls-authorizer) is a `RequestAuthorizer` on PSO's API Gateway. Its identity sources are `x-origin-header`, `x-api-key` and the three `CloudFront-Viewer-Cert-*` headers, so a request missing any of them is rejected with 401 before the Lambda runs. `resultsCacheTtl: 0` means a revocation takes effect on the next request.
7. **DNS and edge protection**: the PSO hostname's Route53 alias points at the CloudFront distribution, which uses the us-east-1 certificate `/infra/acm/certificatearncloudfront` and the CloudFront-scoped WAF from `UNSGlobalStack`. In `stg` and `prod`, Shield Advanced protects the distribution. The regional API Gateway keeps its own WAF (AWS managed common and known-bad-inputs rule sets).

### Certificate rotation

Client certificates are defined as code in the consumer registry and rotate by **overlap**. A new certificate is issued while the old one is still valid, so consumers can switch over without downtime.

- `certificate({...})` issues one certificate with explicit `startDate` and `expirationDate`.
- `rollingCertificate({ startDate, frequencyInMonths = 3, migrationPeriodInWeeks = 1 })` generates a series of periods, each lasting `frequencyInMonths`. Each new period starts `migrationPeriodInWeeks` before the previous one ends. On each deploy, only periods covering *today* are emitted, so during a migration window **two** certificates are live. The period dates go into the common name (`<name>.<start>.<end>`), so each rotation creates a new certificate resource and secret.
- Each environment file mixes both: explicit `certificate(...)` entries for older fixed-window certificates, and `rollingCertificate(...)` series for ongoing rotation (e.g. `dev` and `staging`: every 3 months with a 4-week overlap; production `DVLA`: every 4 months with a 4-week overlap). Expired explicit entries stay in the file until someone removes them.
- **A deploy is what rotates certificates.** `rollingCertificate` computes the current period from the deploy-time clock, so a new period's certificate only exists once an environment has been deployed inside the migration window. An environment that isn't deployed during that window goes straight from one certificate to the next with no overlap.
- Sandbox environments get a single `sandbox.dev.today` certificate from `getConsumers`, valid from Sunday to Sunday, matching their short-lived CA window.

To rotate manually, or to revoke: add a new `certificate(...)` entry (or set `revoked: true` on an existing one) in the environment's consumer file and deploy. Revocation writes `Revoked: true` to the revocation table, which the authorizer honours on the next request. Removing an entry soft-deletes its revocation row (`Deleted: true`).

Engineers and test runners fetch issued certificates with `pnpm run download:certificates [certificateId]` ([`scripts/download-certificates.ts`](/scripts/download-certificates.ts)), which reads the `<prefix>/tls/<id>/*` secrets.

### Consumers (mTLS client registry)

`infrastructure/cdk/consumers/` is a per-environment registry of external organisations issued mTLS client certificates to call the PSO public API — **not** related to SQS-triggered Lambdas, despite the directory name.

- [`consumers.ts`](/infrastructure/cdk/consumers/consumers.ts): `certificate()` and `rollingCertificate()` helpers (see [Certificate rotation](#certificate-rotation)), and `getConsumers(env, config)`, which switches on environment. `dev`/`stg`/`prod` each have a list of real consumer organisations (e.g. `UNS`, `DVLA`, `EventsAggregator`); any other `env` gets a single short-lived `sandbox.dev.today` certificate rolling weekly.
- `devConsumers.ts` / `stagingConsumers.ts` / `productionConsumers.ts`: the per-environment certificate lists.
- [`consumersMetadata.ts`](/infrastructure/cdk/consumers/consumersMetadata.ts): each organisation's display name and `OrganisationConfig` (channels, message retention, deeplink allow-list), seeded into the `organisations` table. See [Configuration: Organisation config](./configuration.md#organisation-config).

`getConsumers()` output drives both the client-certificate provisioning in `UNSMTLS.ts` and the API Gateway usage-plan mapping in `UNSPSOResources.ts` (one usage plan per consumer organisation).

---

## Alerting

`UNSCommon` always creates two SNS topics (KMS-encrypted):

| Topic | Fed by | Slack channel parameter |
| --- | --- | --- |
| `uns-<env>-sns-topic-alerts` | Every alarm in `UNSAlarmsStack`, see [Alarms](./alarms.md) | `alerts/slack/channelId` |
| `uns-<env>-sns-topic-releases` | The `Announce release` deploy step, see [Releases](./releases.md#deployment-notifications) | `alerts/slack/releaseChannelId` |

When `alerts/slack/workspaceId` and the topic's channel ID are both set in the environment's SSM namespace, a `UNSSlackAlert` (AWS Chatbot `SlackChannelConfiguration`) subscribes that Slack channel to the topic. These values are read at **synth time**, so setting them needs a redeploy. Without them the topics still exist; nothing is forwarded to Slack.

---

## Tagging

Tags follow the GOV.UK Once AWS Resource Tagging Standard and the Network-Level Exposure Classification Standard (links in `config.ts`).

- **Default tags** (`config.defaultTags()`): `Product`, `BillingProject`, `Service`, `Component`, `Environment`, `Owner`, `Source`, `CostCentre`, `ManagedBy`, `Version` and `retain`. Applied to every resource in `UNSStack` and `UNSGlobalStack`, except ElastiCache users, user groups and serverless caches, which don't handle frequent tag updates reliably. They are also emitted as stack outputs, and applied to predeploy-created SSM parameters.
- **`Exposure`** ([`applyExposureTag`](/infrastructure/cdk/utils/applyExposureTag.ts)): `Internet-Facing` | `Perimeter` | `Internal` | `Isolated`. For example, the PSO API Gateway and its WAF are `Perimeter`, and the SQS queues are `Isolated`.
- **`PII`** ([`applyPiiTag`](/infrastructure/cdk/utils/applyPiiTag.ts)): `true` | `false` | `unknown`. The pipeline queues are `unknown`; the analytics queue is `false`.
- **`DataProtection: Ephemeral`** ([`applyDataProtectionTag`](/infrastructure/cdk/utils/applyDataProtectionTag.ts)): applied to S3 buckets (access logs, mTLS truststore, analytics export, e2e runner source) **only in PR environments** (`config.isEphemeral`), so they're recognised as disposable.

When adding a resource, apply `Exposure` and `PII` tags where the standard asks for them, and `DataProtection: Ephemeral` to any new bucket under `if (config.isEphemeral)`.

---

## Related

**Guides:**

- [Developer Reference](./developer-reference.md)
- [Alarms](./alarms.md)
- [Configuration](./configuration.md)
- [Deployment Guide](./deployment.md)
- [Environment Setup](./environment-setup.md)
- [Runbooks](./runbooks/README.md)

**Code:**

- [`infrastructure/cdk/cdk.ts`](/infrastructure/cdk/cdk.ts)
- [`infrastructure/cdk/config.ts`](/infrastructure/cdk/config.ts)
- [`infrastructure/cdk/constructs/UNSStack.ts`](/infrastructure/cdk/constructs/UNSStack.ts)
- [`infrastructure/cdk/constructs/UNSGlobalStack.ts`](/infrastructure/cdk/constructs/UNSGlobalStack.ts)
- [`infrastructure/cdk/constructs/UNSAlarmsStack.ts`](/infrastructure/cdk/constructs/UNSAlarmsStack.ts)
- [`infrastructure/cdk/constructs/alarmsConstructs`](/infrastructure/cdk/constructs/alarmsConstructs)
