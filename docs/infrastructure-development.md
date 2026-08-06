# Infrastructure Development Guide

Guide to the CDK application in [`infrastructure/cdk`](/infrastructure/cdk): stack composition, constructs, naming, SSM conventions, mTLS, networking, alarms and dashboards.

---

## Overview

This is a **single-stack** CDK app — there is no multi-stack or per-domain split. `infrastructure/cdk/cdk.ts` (the app entry point, `cdk.json`'s `"app": "tsx cdk.ts"`) instantiates one `UNSStack`, which composes five constructs in order:

```text
UNSStack
├── UNSCommon              — KMS, VPC, DynamoDB tables, ElastiCache, SNS alert topic, code signing
├── UNSMTLSCommon           — mTLS private CA, truststore bucket, revocation table, per-consumer client certs
├── UNSOrganisationsCommon  — "organisations" DynamoDB table, seeded via a custom resource
├── UNSPSOResource          — the PSO service: SQS pipeline, HTTP/SQS/schedule Lambdas, mTLS-protected public API Gateway, alarms, dashboards
└── UNSFlexResource         — the Flex service: HTTP Lambdas, public (dev-only) + private API Gateway, alarms, dashboards
```

("PSO" is the public-facing, mTLS-protected send/status API used by external departments; "Flex" is the internal API the GOV.UK app backend uses to read and manage a user's notifications — matching `src/lambdas/pso` and `src/lambdas/flex`.)

Cross-construct wiring happens via typed constructor props (`refs: common`, `mtls: {...}`), not CloudFormation cross-stack exports — there's only one stack. Values that need to survive outside the construct tree (read by scripts, or by other environments) go through **SSM Parameter Store** instead — see [SSM parameter conventions](#ssm-parameter-conventions).

---

## Naming conventions

All naming flows from [`infrastructure/cdk/config.ts`](/infrastructure/cdk/config.ts):

- `project = 'uns'`; `env` comes from the `env` process environment variable (throws if unset).
- `prefix = "${project}-${env}".replace('-prod', '')` — **production has no `-prod` suffix.** Prod prefix is `uns`; dev is `uns-dev`; a sandbox named `alice-a1b2` is `uns-alice-a1b2`.
- `namespace` follows the same `-prod`-stripping rule, and is the root of the SSM parameter path (see below).
- `config.utils.namingHelper(...args)` → `[project, env, ...args].join('-').toLowerCase().replace('-prod', '')` — the canonical **AWS resource name** builder, e.g. `namingHelper('lmdb', 'pso', 'postMessage')` → `uns-dev-lmdb-pso-postmessage`.
- `config.utils.constructNamingHelper(...args)` → `camelCase(...args)` — used only for **CDK construct IDs** in the synthesized template's scope hierarchy, distinct from the AWS-visible resource name above.
- `unremoveableEnvironments = ['dev', 'stg', 'prod']` drives `isMainEnv`. Main environments get `RemovalPolicy.RETAIN`, one-year log/parameter retention, deletion protection on DynamoDB tables, and their own generated mTLS CA. Any other `env` value is treated as an ephemeral developer sandbox: `RemovalPolicy.DESTROY`, one-month retention, and shared VPC/mTLS/CA imported from `dev` via SSM rather than provisioned fresh (see [Sandbox environments](#sandbox-environments)).
- `nonDevelopmentEnvironments = ['stg', 'prod']` drives `isNonDevEnv` (controls e.g. VPC Flow Logs, SSM parameter expiry duration).

---

## Base constructs (`constructs/bases`)

Reusable wrappers around individual AWS resources, used throughout `UNSCommon`/`UNSPSOResources`/`UNSFlexResources`.

| Construct | Wraps | Notes |
| ---------------------------------------------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| [`UNSLambdaConstruct`](/infrastructure/cdk/constructs/bases/UNSLambdaConstruct.ts) | `NodejsFunction` + IAM role + log group | Declarative `iam` props (`dynamodb`, `sqsSend`, `ssmNamespaces`, `sm`, `kms`, `elasticache`, `s3`, …) turned into scoped policy statements. `NODEJS_22_X`, 512MB/30s defaults, `Tracing.ACTIVE`. Static factories `baseHTTPFactory`/`baseSQSFactory`/`baseScheduleFactory(serviceName, signingConfig)` resolve `bundlePath` to `dist/${serviceName}/${kind}.${operationId}` — see [Lambda entry-point resolution](#lambda-entry-point-resolution) |
| [`UNSApiGatewayConstruct`](/infrastructure/cdk/constructs/bases/UNSApiGatewayConstruct.ts) | `RestApi` | Custom domain via Route53 + regional ACM cert, WAFv2 association + logging, optional mTLS truststore, usage plans/API keys, fluent `.GET()/.POST()/.PATCH()/.DELETE()` route registration |
| [`UNSDynamoDBConstruct`](/infrastructure/cdk/constructs/bases/UNSDynamoDBConstruct.ts) | `Table` | Pay-per-request, KMS CMK encryption, PITR, optional TTL. Exposes `attributes` (published to SSM) and precomputed `permissions.{readOnlyById,readOnly,readAndWrite}` IAM shapes |
| [`UNSQueueConstruct`](/infrastructure/cdk/constructs/bases/UNSQueueConstruct.ts) | `Queue` (+ optional DLQ) | KMS-encrypted, default `maxReceiveCount` 10 |
| [`UNSVpcConstruct`](/infrastructure/cdk/constructs/bases/UNSVpcConstruct.ts) | `Vpc` | See [Networking](#networking) |
| [`UNSKMSConstruct`](/infrastructure/cdk/constructs/bases/UNSKMSConstruct.ts) | `kms.Key` | Rotating key + alias, composable principal policy |
| [`UNSS3BucketConstruct`](/infrastructure/cdk/constructs/bases/UNSS3BucketConstruct.ts) | `Bucket` | Private, SSE-S3, TLS-enforced, versioned |
| [`UNSElasticacheConstruct`](/infrastructure/cdk/constructs/bases/UNSElasticacheConstruct.ts) | `CfnServerlessCache` (Valkey) | IAM-authenticated user/group, 10GB/5000 ECPU caps, daily snapshot |
| [`UNSCertificateAuthorityConstruct`](/infrastructure/cdk/constructs/bases/UNSCertificateAuthorityConstruct.ts) | ACM Private CA Root CA | See [mTLS certificate infrastructure](#mtls-certificate-infrastructure) |
| [`UNSClientCertificateConstruct`](/infrastructure/cdk/constructs/bases/UNSClientCertificateConstruct.ts) | Per-consumer client cert | See [mTLS certificate infrastructure](#mtls-certificate-infrastructure) |
| [`UNSCustomResourceConstruct`](/infrastructure/cdk/constructs/bases/UNSCustomResourceConstruct.ts) | `NodejsFunction` + `customResources.Provider` | Generic base for CloudFormation custom resources — see [Custom resources](#custom-resources) |
| [`UNSSlackIntegration`](/infrastructure/cdk/constructs/bases/UNSSlackIntegration.ts) | `chatbot.SlackChannelConfiguration` | Subscribes AWS Chatbot to one or more SNS topics — see [Alerting](#alerting) |

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

Only the SQS-triggered `processing`, `dispatch` and `analytics` Lambdas run inside the VPC (they call ElastiCache and/or UDP) — see [Networking](#networking). PSO's API Gateway is mTLS-protected; Flex's is not.

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

Two distinct path roots are used, both written via [`utils/SSMFromObject.ts`](/infrastructure/cdk/utils/SSMFromObject.ts):

1. **Namespaced, per-environment** — `/${namespace}/...`, e.g. `/uns-dev/table/inbound/attributes`, `/uns-dev/queue/analytics/url`, `/uns/config/dispatch/onesignal/appId` in production. Written both from within CDK constructs (default `SSMFromObject` behaviour) and from a standalone script (`cdk.predeploy.ssm.ts`, see below) for values that need to change independently of a deploy.
2. **Unnamespaced "shared" exports** — `/shared/...` (`SSMFromObject(..., { omitNamespace: true })`), written only by the `dev` environment when `config.exportResourcesForDevSandboxUse` is true: `/shared/vpc`, `/shared/mtls/truststore`, `/shared/mtls/revocation/tableArn`, `/shared/mtls/revocation/attributes`, `/shared/mtls/kmsArn`. Sandbox environments read these back at synth time (`config.sandbox.shared.*`) instead of provisioning their own VPC/CA — see [Sandbox environments](#sandbox-environments).

Pre-existing, infra-team-provided values this app consumes but doesn't own: `/infra/dns/hostedzonename`, `/infra/acm/certificatearnregional`.

### Predeploy / postdeploy scripts

`pnpm run cdk:deploy` wraps `cdk deploy` with two standalone scripts, run **outside** CDK's synth/deploy lifecycle so it never owns or reverts these values:

- [`cdk.predeploy.ssm.ts`](/infrastructure/cdk/cdk.predeploy.ssm.ts) (before deploy) — idempotently ensures a fixed set of operator-configurable `SecureString` parameters exist under `/${namespace}/...` (feature flags, dispatch/processing adapter selection, circuit breaker thresholds), applying `SSM_PARAMETERS_TO_UPDATE` overrides if set, and deleting deprecated keys.
- [`cdk.postdeploy.ssm.ts`](/infrastructure/cdk/cdk.postdeploy.ssm.ts) (after deploy) — looks up the just-deployed Flex private API Gateway and its freshly generated API key, then writes `{apiKey, apiUrl, privateApiUrl, roleArn, region}` into the `${prefix}/flex/consumer` Secrets Manager secret, since an API key value isn't safely obtainable as a CloudFormation token.

If you need a value editable between deploys without CDK reverting it, add it to `cdk.predeploy.ssm.ts` rather than a CDK `StringParameter` resource.

---

## Networking

Confirmed from [`UNSVpcConstruct`](/infrastructure/cdk/constructs/bases/UNSVpcConstruct.ts): this service **does** provision its own VPC in main environments — it is not a VPC-less, fully serverless deployment.

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
- **Which Lambdas are VPC-attached**: only the SQS-triggered `processing`, `dispatch` and `analytics` Lambdas (they call ElastiCache and/or UDP). Every HTTP-triggered Lambda, `validation`, custom-resource Lambdas, and all of Flex's Lambdas are **not** VPC-attached — Checkov's `CKV_AWS_117` is explicitly skipped with the justification "not all lambdas need to be in VPCs by design".

### Sandbox environments

Non-main environments don't create their own VPC (or mTLS CA) at all. `UNSVpcConstruct` checks `!config.isMainEnv && config.sandbox.shared.vpc !== null` and instead **imports** `dev`'s VPC/subnets/security-groups via `Vpc.fromVpcAttributes`, reading the description back from the `/shared/vpc` SSM parameter `dev` exported. The equivalent applies to the mTLS CA and revocation table (see below). This avoids every developer sandbox paying for its own NAT Gateway.

---

## mTLS certificate infrastructure

The full chain, in [`UNSMTLS.ts`](/infrastructure/cdk/constructs/UNSMTLS.ts) plus the CA/client-cert base constructs and custom resources:

1. **Truststore S3 bucket** — created in every environment (versioned, SSE-S3, TLS-enforced).
2. **Main environments only** (`config.isMainEnv`):
   - `revocationTable` — a `UNSDynamoDb` (`certificates`, PK `Id`) tracking issued/revoked certs, checked at request time by the [mTLS authorizer](./developer-reference.md#the-mtls-authorizer).
   - `certificateAuthority` — a `UNSCertificateAuthorityConstruct`: an ACM Private CA root, `GENERAL_PURPOSE` mode (10-year validity) for main environments, `SHORT_LIVED_CERTIFICATE` mode (rolling Sunday-to-Sunday) for sandboxes.
   - Custom-resource providers for CSR generation, revocation-table writes, and Secrets Manager writes (see [Custom resources](#custom-resources)).
   - A dedicated `mtlsConsumerKey` KMS key allowing cross-account decrypt for consumer organisations whose AWS account ID is registered.
   - One `UNSClientCertificateConstruct` per entry in `getConsumers(config.env, config)` — see [Consumers](#consumers-mtls-client-registry) below — each producing a signed cert plus a revocation row.
3. **Sandbox environments** skip CA/revocation-table creation entirely and import `dev`'s values from `/shared/mtls/*` SSM paths.
4. **Truststore upload** happens unconditionally (main or sandbox), via the S3-writer custom resource, writing `truststore.${uuid}.pem` — randomised per deploy because API Gateway "reserves" a truststore object indefinitely and doesn't support sharing one between gateways.
5. **Wired to API Gateway**: only PSO's gateway (`type: 'PUBLIC'`, `domain: 'pso'`) is mTLS-protected; Flex's gateways are not.
6. **Revocation check at request time**: the [mTLS authorizer](./developer-reference.md#the-mtls-authorizer) Lambda is wired as a `RequestAuthorizer` on PSO's API Gateway, with `resultsCacheTtl: 0` (no caching — a revocation takes effect on the next request, not after a cache TTL expires).

### Consumers (mTLS client registry)

`infrastructure/cdk/consumers/` is a per-environment registry of external organisations issued mTLS client certificates to call the PSO public API — **not** related to SQS-triggered Lambdas, despite the directory name.

- [`consumers.ts`](/infrastructure/cdk/consumers/consumers.ts) — `getConsumers(env, config)` switches on environment: `dev`/`stg`/`prod` each have a hardcoded list of real consumer organisations (e.g. `UNS`, `DVLA`); any other `env` value gets a single short-lived `sandbox.dev.today` certificate rolling weekly.
- `devConsumers.ts` / `stagingConsumers.ts` / `productionConsumers.ts` — the hardcoded per-environment lists.
- `consumersMetadata.ts` — display metadata used to seed the `organisations` DynamoDB table.

`getConsumers()` output drives both the client-certificate provisioning in `UNSMTLS.ts` and the API Gateway usage-plan mapping in `UNSPSOResources.ts` (one usage plan per consumer organisation).

---

## Related

**Guides:**

- [Developer Reference](./developer-reference.md)
- [Deployment Guide](./deployment.md)
- [Environment Setup](./environment-setup.md)
- [Runbooks](./runbooks/README.md)

**Code:**

- [`infrastructure/cdk/cdk.ts`](/infrastructure/cdk/cdk.ts)
- [`infrastructure/cdk/config.ts`](/infrastructure/cdk/config.ts)
- [`infrastructure/cdk/constructs/UNSStack.ts`](/infrastructure/cdk/constructs/UNSStack.ts)
- [`infrastructure/cdk/constructs/alarmsConstructs`](/infrastructure/cdk/constructs/alarmsConstructs)
