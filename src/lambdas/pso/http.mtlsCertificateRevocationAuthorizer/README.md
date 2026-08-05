## MtlsCertificateRevocationAuthorizer

API Gateway **REQUEST** Lambda authorizer for the PSO API. Runs ahead of every PSO HTTP route to confirm the mTLS client certificate presented by the caller (already verified against the CA and expiry by API Gateway itself) hasn't been revoked, and to resolve which `Organization` the caller belongs to.

- **Type:** HTTP (API Gateway custom authorizer)
- **Operation ID:** `mtlsApiGatewayAuthorizer`
- **Identity source:** `context.identity.clientCert.clientCertPem`

### Sample event

`APIGatewayRequestAuthorizerEvent`, relevant fields only:

```json
{
  "type": "REQUEST",
  "methodArn": "arn:aws:execute-api:eu-west-2:123456789012:abc123/dev/POST/send",
  "requestContext": {
    "identity": {
      "clientCert": {
        "clientCertPem": "-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"
      }
    }
  }
}
```

### Infrastructure

- **DynamoDB** - `MTLSRevocationDynamoRepository` (the MTLS Revocation table), read-only, keyed by a SHA-256 hash of the certificate PEM.
- **KMS** - decrypt permission on the shared sandbox KMS key (non-production environments only).
- No SQS, no outbound HTTP calls.
- The authorizer's result (`Allow`/`Deny` IAM policy) is cached by API Gateway for `0` seconds (`resultsCacheTtl`), so this runs on every request - see [`UNSPSOResources.ts`](../../../../infrastructure/cdk/constructs/UNSPSOResources.ts).

### Logic

```mermaid
flowchart TD
    A[Request arrives with client cert] --> B{clientCertPem present?}
    B -- No --> D1[Deny + MTLS_AUTH_REQUESTS_DENIED_COUNT]
    B -- Yes --> C[SHA-256 hash of cert PEM]
    C --> E[Lookup hash in MTLS Revocation table]
    E --> F{Record found?}
    F -- No --> D2[Deny + ...DENIED_UNKNOWN_CERTIFICATE_COUNT]
    F -- Yes --> G{Revoked == true?}
    G -- Yes --> D3[Deny + ...DENIED_REVOKED_CERTIFICATE_COUNT]
    G -- No --> H{Organization set on record?}
    H -- No --> D4[Deny + ...DENIED_NO_ORGANIZATION_COUNT]
    H -- Yes --> I[Allow + attach Organization to authorizer context]
    I --> J[...ALLOWED_COUNT metric]
```

Downstream handlers read the resolved `Organization` from `event.requestContext.authorizer.Organization` - see `PostMessage` and `PostGroupMessage`.
