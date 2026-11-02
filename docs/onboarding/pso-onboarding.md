# PSO Onboarding Guide

> **Draft** — this document is a work in progress.

This guide walks a new Public Service Organisation (PSO) through connecting to the GOV.UK Unified Notification Service (UNS). By the end you will have working credentials, understand how authentication works, and have copy-paste curl examples to send your first notification.

> **The API examples and templates in this guide are for illustration and context only.** For the authoritative, up-to-date API specification — including all fields, validation rules, and response schemas — refer to the **[UNS PSO API reference](https://govuk-once.github.io/gds-unified-notification-service/pso/)**.

For a broader picture of what UNS is and how it works, read the [Service Overview](./service-overview.md) first.

---

## Contents

- [What you need from the UNS team](#what-you-need-from-the-uns-team)
- [How authentication works](#how-authentication-works)
- [Certificate details](#certificate-details)
- [Making your first request](#making-your-first-request)
- [Sample notification templates](#sample-notification-templates)
  - [Simple push notification](#simple-push-notification)
  - [Push notification with rich message centre content](#push-notification-with-rich-message-centre-content)
  - [Message centre only (no push)](#message-centre-only-no-push)
  - [Notification with a deeplink](#notification-with-a-deeplink)
  - [Batch send](#batch-send-multiple-recipients-in-one-request)
  - [Vehicle tax reminder (DVLA)](#vehicle-tax-reminder-dvla)
- [Send to a group](#send-to-a-group)
  - [Simple group send](#simple-group-send)
  - [Group send with a subgroup and rich message centre content](#group-send-with-a-subgroup-and-rich-message-centre-content)
  - [Batch group send with a campaign ID](#batch-group-send-with-a-campaign-id)
  - [Foreign travel advice alert (Events Aggregator)](#foreign-travel-advice-alert-events-aggregator)
- [Checking notification status](#checking-notification-status)
- [Common errors](#common-errors)
- [Further reading](#further-reading)

---

## What you need from the UNS team

Before you can make a single API call, the UNS team must provision two things for your organisation:

| Credential | What it is | How you get it |
| --- | --- | --- |
| **mTLS client certificate** | A `.crt` file and a matching `.key` file tied to your organisation | Supplied by the UNS team; you do not generate these yourself |
| **API key** | A secret string sent as the `x-api-key` request header | Supplied alongside your certificate |

Contact the UNS team to begin onboarding. They will register your organisation, generate your first certificate pair, and share the credentials with you through a secure channel.

---

## How authentication works

Every request to the PSO API requires **both** factors to succeed. Either alone is insufficient.

### 1. Mutual TLS (mTLS)

UNS sits behind AWS CloudFront, which enforces mutual TLS on every inbound connection. This means your HTTP client must present a client certificate signed by the UNS certificate authority (CA) as part of the TLS handshake — the server authenticates you before your request body is ever read.

The UNS team manages the CA and issues certificates per organisation. You cannot self-generate a certificate that will be accepted; it must be signed by the UNS CA.

```text
Client                             CloudFront (UNS)
  │── TLS ClientHello ──────────────────► │
  │◄─ ServerHello + Server cert ──────── │
  │── Client cert (your .crt) ─────────► │  ← CloudFront verifies this
  │◄─ TLS established ────────────────── │
  │── HTTP request ─────────────────────► │
```

### 2. API key

Once the TLS connection is established, your request must include an `x-api-key` header. API Gateway validates this independently of the certificate. Both factors are required — a valid certificate with a missing or wrong API key returns `403`.

---

## Certificate details

### What the UNS team provisions

Each PSO is issued a certificate with the following attributes:

| Attribute | Example value | Notes |
| --- | --- | --- |
| `commonName` | `ea.2026-09-13.2026-12-13` | Encodes the validity window |
| `organization` | `EventsAggregator` | Your organisation ID in UNS |
| `organizationalUnit` | `ea` | Used internally for routing |
| `startDate` | `2026-09-13` | Certificate becomes valid |
| `expirationDate` | `2026-12-13` | Certificate expires |

### Certificate rotation

Certificates rotate automatically every **3 months**. The UNS team provisions both the current and the upcoming certificate in advance, with a **4-week overlap** so you can update your configuration without downtime. During the overlap period both certificates are valid simultaneously.

The UNS team will notify you ahead of each rotation. You should update your client to use the new certificate before the old one expires.

### Storing credentials securely

- Never commit `.crt` or `.key` files to source control.
- Store them in a secrets manager (AWS Secrets Manager, HashiCorp Vault, or equivalent) and inject them at runtime.
- The `.key` file should have restricted permissions (`chmod 600`).

---

## Making your first request

### Base URL

The UNS team will supply the base URL for each environment when they share your credentials. Use it as the `UNS_API_URL` variable in all examples below.

```bash
UNS_API_URL="https://<supplied-by-uns-team>"
CERT_FILE="your-org.crt"        # path to your certificate file
KEY_FILE="your-org.key"         # path to your private key file
API_KEY="your-api-key"          # x-api-key value supplied by UNS team
```

### Health check

The `/status` endpoint is an easy way of confirming connection can be made to the UNS backend

```bash
curl -s "${UNS_API_URL}/status" \
  --cert "${CERT_FILE}" \
  --key "${KEY_FILE}"
# → {"status":true}
```

### Verify your credentials

Send a test request with your certificate and API key. A `202` response confirms both are working:

<details>
<summary>curl</summary>

```bash
curl -s -o /dev/null -w "%{http_code}" \
  -X POST "${UNS_API_URL}/send" \
  --cert "${CERT_FILE}" \
  --key "${KEY_FILE}" \
  -H "x-api-key: ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d '[{
    "UserID": "<recipient-linking-id>",
    "NotificationTitle": "Test",
    "NotificationBody": "Connection test"
  }]'
```

Response:

```text
202
```

</details>

<details>
<summary>Raw JSON payload</summary>

```json
[
  {
    "UserID": "<recipient-linking-id>",
    "NotificationTitle": "Test",
    "NotificationBody": "Connection test"
  }
]
```

</details>

---

## Sample notification templates

All templates use the variables defined above. Each `POST /send` request accepts **1 to 10 notifications** in a single array. The full field reference is in the [Service Overview](./service-overview.md#sending-to-an-individual-user).

**Notifications showcased in this documentation are for reference only - to showcase functionality, and do not necessarily match real world templates.
**

### Simple push notification

The minimum viable request. Delivers a push notification to the lock screen; the same title and body appear in the in-app message centre as a fallback.

<details>
<summary>curl</summary>

```bash
curl -X POST "${UNS_API_URL}/send" \
  --cert "${CERT_FILE}" \
  --key "${KEY_FILE}" \
  -H "x-api-key: ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d '[{
    "UserID": "<recipient-linking-id>",
    "NotificationTitle": "Your MOT is due soon",
    "NotificationBody": "Your vehicle MOT expires in 28 days."
  }]'
```

Response:

```json
[{ "NotificationID": "a1b2c3d4-e5f6-7890-abcd-ef1234567890" }]
```

</details>

<details>
<summary>Raw JSON payload</summary>

```json
[
  {
    "UserID": "<recipient-linking-id>",
    "NotificationTitle": "Your MOT is due soon",
    "NotificationBody": "Your vehicle MOT expires in 28 days."
  }
]
```

</details>

---

### Push notification with rich message centre content

Sends a short push alert alongside a fully formatted article in the in-app message centre. `MessageBody` supports Markdown.

<details>
<summary>curl</summary>

```bash
curl -X POST "${UNS_API_URL}/send" \
  --cert "${CERT_FILE}" \
  --key "${KEY_FILE}" \
  -H "x-api-key: ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d '[{
    "UserID": "<recipient-linking-id>",
    "NotificationTitle": "Your MOT is due soon",
    "NotificationBody": "Your vehicle MOT expires in 28 days.",
    "MessageTitle": "MOT reminder: action required",
    "MessageBody": "## Your MOT expires soon\n\nYour vehicle MOT expires on **1 November 2026**.\n\n### What to do next\n\n- Book your MOT at an approved test centre\n- Check your vehicle is roadworthy before the test\n\n[Find a test centre](https://www.gov.uk/find-mot-station)"
  }]'
```

</details>

<details>
<summary>Raw JSON payload</summary>

```json
[
  {
    "UserID": "<recipient-linking-id>",
    "NotificationTitle": "Your MOT is due soon",
    "NotificationBody": "Your vehicle MOT expires in 28 days.",
    "MessageTitle": "MOT reminder: action required",
    "MessageBody": "## Your MOT expires soon\n\nYour vehicle MOT expires on **1 November 2026**.\n\n### What to do next\n\n- Book your MOT at an approved test centre\n- Check your vehicle is roadworthy before the test\n\n[Find a test centre](https://www.gov.uk/find-mot-station)"
  }
]
```

</details>

---

### Message centre only (no push)

Silently adds a message to the in-app message centre without triggering a push notification on the lock screen.

<details>
<summary>curl</summary>

```bash
curl -X POST "${UNS_API_URL}/send" \
  --cert "${CERT_FILE}" \
  --key "${KEY_FILE}" \
  -H "x-api-key: ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d '[{
    "UserID": "<recipient-linking-id>",
    "NotificationTitle": "Your account summary is ready",
    "NotificationBody": "Your account summary is ready to view.",
    "Channel": "MESSAGE_CENTRE_ONLY"
  }]'
```

</details>

<details>
<summary>Raw JSON payload</summary>

```json
[
  {
    "UserID": "<recipient-linking-id>",
    "NotificationTitle": "Your account summary is ready",
    "NotificationBody": "Your account summary is ready to view.",
    "Channel": "MESSAGE_CENTRE_ONLY"
  }
]
```

</details>

---

### Notification with a deeplink

Tapping the push notification navigates the user to a specific screen in the GOV.UK app, rather than opening the message centre. The `DeeplinkURL` must be on your organisation's allow-list — the UNS team configures this during onboarding.

<details>
<summary>curl</summary>

```bash
curl -X POST "${UNS_API_URL}/send" \
  --cert "${CERT_FILE}" \
  --key "${KEY_FILE}" \
  -H "x-api-key: ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d '[{
    "UserID": "<recipient-linking-id>",
    "NotificationTitle": "Action required on your licence",
    "NotificationBody": "Tap to view and respond.",
    "DeeplinkURL": "govuk://dvla/licence-check"
  }]'
```

</details>

<details>
<summary>Raw JSON payload</summary>

```json
[
  {
    "UserID": "<recipient-linking-id>",
    "NotificationTitle": "Action required on your licence",
    "NotificationBody": "Tap to view and respond.",
    "DeeplinkURL": "govuk://dvla/licence-check"
  }
]
```

</details>

---

### Batch send (multiple recipients in one request)

Up to 10 notifications per request. Each must have a unique `NotificationID` if you supply one — UNS generates IDs automatically for any item that omits it.

<details>
<summary>curl</summary>

```bash
curl -X POST "${UNS_API_URL}/send" \
  --cert "${CERT_FILE}" \
  --key "${KEY_FILE}" \
  -H "x-api-key: ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d '[
    {
      "UserID": "<recipient-1-linking-id>",
      "NotificationTitle": "Your MOT is due soon",
      "NotificationBody": "Your vehicle MOT expires in 28 days.",
      "CampaignID": "mot-reminders-october-2026"
    },
    {
      "UserID": "<recipient-2-linking-id>",
      "NotificationTitle": "Your MOT is due soon",
      "NotificationBody": "Your vehicle MOT expires in 14 days.",
      "CampaignID": "mot-reminders-october-2026"
    }
  ]'
```

</details>

<details>
<summary>Raw JSON payload</summary>

```json
[
  {
    "UserID": "<recipient-1-linking-id>",
    "NotificationTitle": "Your MOT is due soon",
    "NotificationBody": "Your vehicle MOT expires in 28 days.",
    "CampaignID": "mot-reminders-october-2026"
  },
  {
    "UserID": "<recipient-2-linking-id>",
    "NotificationTitle": "Your MOT is due soon",
    "NotificationBody": "Your vehicle MOT expires in 14 days.",
    "CampaignID": "mot-reminders-october-2026"
  }
]
```

</details>

---

### Vehicle tax reminder (DVLA)

An individual send with a short push alert and a fully formatted Markdown message body, including a reference number and GOV.UK action links. Replace `UserID` with the recipient's actual LinkingID.

<details>
<summary>curl</summary>

```bash
curl -X POST "${UNS_API_URL}/send" \
  --cert "${CERT_FILE}" \
  --key "${KEY_FILE}" \
  -H "x-api-key: ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d '[{
    "CampaignID": "Predeployment_tests",
    "UserID": "<recipient-linking-id>",
    "NotificationTitle": "Vehicle tax reminder",
    "NotificationBody": "Your vehicle tax expires in 21 days",
    "MessageTitle": "Vehicle tax reminder",
    "MessageBody": "Your vehicle tax for **AB12 CDE** runs out on 7 August 2026.\n\nIf you'\''ve already taxed or made a SORN, ignore this message. \nIt may take a couple of days for your tax status to update on your driver and vehicles account.\n\nYour reference number is : **XXXX XXXX XXXX XXXX**\n\nUsing your reference number or V5C log book, you can :\n\n*   [Tax your vehicle](https://www.gov.uk/vehicle-tax)\n    \n*   [Register your vehicle off the road (SORN)](https://www.gov.uk/make-a-sorn)\n    \n*   Tax or SORN by phone on [0300 123 4321](https://www.gov.uk/vehicle-tax)"
  }]'
```

</details>

<details>
<summary>Raw JSON payload</summary>

```json
[
  {
    "CampaignID": "Predeployment_tests",
    "UserID": "<recipient-linking-id>",
    "NotificationTitle": "Vehicle tax reminder",
    "NotificationBody": "Your vehicle tax expires in 21 days",
    "MessageTitle": "Vehicle tax reminder",
    "MessageBody": "Your vehicle tax for **AB12 CDE** runs out on 7 August 2026.\n\nIf you've already taxed or made a SORN, ignore this message. \nIt may take a couple of days for your tax status to update on your driver and vehicles account.\n\nYour reference number is : **XXXX XXXX XXXX XXXX**\n\nUsing your reference number or V5C log book, you can :\n\n*   [Tax your vehicle](https://www.gov.uk/vehicle-tax)\n    \n*   [Register your vehicle off the road (SORN)](https://www.gov.uk/make-a-sorn)\n    \n*   Tax or SORN by phone on [0300 123 4321](https://www.gov.uk/vehicle-tax)"
  }
]
```

</details>

---

## Send to a group

Broadcasts a notification to every user who has joined the target group. UNS handles the fan-out — you send one request regardless of how many members there are. Groups follow a three-level hierarchy: `Namespace` → `Group` → `Subgroup` (optional).

### Simple group send

<details>
<summary>curl</summary>

```bash
curl -X POST "${UNS_API_URL}/v1/send-to-group" \
  --cert "${CERT_FILE}" \
  --key "${KEY_FILE}" \
  -H "x-api-key: ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d '[{
    "Namespace": "travel",
    "Group": "france",
    "NotificationTitle": "France: Travel advice updated",
    "NotificationBody": "There has been a change to the travel advice for France."
  }]'
```

Response:

```json
[{ "GroupNotificationID": "b2c3d4e5-f6a7-8901-bcde-f12345678901", "UsersInGroup": 3240 }]
```

</details>

<details>
<summary>Raw JSON payload</summary>

```json
[
  {
    "Namespace": "travel",
    "Group": "france",
    "NotificationTitle": "France: Travel advice updated",
    "NotificationBody": "There has been a change to the travel advice for France."
  }
]
```

</details>

---

### Group send with a subgroup and rich message centre content

Use `Subgroup` to target a further subdivision of a group. `MessageBody` supports Markdown, the same as individual sends.

<details>
<summary>curl</summary>

```bash
curl -X POST "${UNS_API_URL}/v1/send-to-group" \
  --cert "${CERT_FILE}" \
  --key "${KEY_FILE}" \
  -H "x-api-key: ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d '[{
    "Namespace": "travel",
    "Group": "spain",
    "Subgroup": "digest",
    "NotificationTitle": "Spain: Travel advice updated",
    "NotificationBody": "There has been a change to the travel advice for Spain.",
    "MessageTitle": "Spain: Travel advice updated",
    "MessageBody": "[Go to latest](https://www.gov.uk/foreign-travel-advice/spain)\n\nChanges made:\nEntry requirements updated\n\n[Manage your countries](govuk://app.gov.uk/travelalerts/edit)"
  }]'
```

</details>

<details>
<summary>Raw JSON payload</summary>

```json
[
  {
    "Namespace": "travel",
    "Group": "spain",
    "Subgroup": "digest",
    "NotificationTitle": "Spain: Travel advice updated",
    "NotificationBody": "There has been a change to the travel advice for Spain.",
    "MessageTitle": "Spain: Travel advice updated",
    "MessageBody": "[Go to latest](https://www.gov.uk/foreign-travel-advice/spain)\n\nChanges made:\nEntry requirements updated\n\n[Manage your countries](govuk://app.gov.uk/travelalerts/edit)"
  }
]
```

</details>

---

### Batch group send with a campaign ID

Up to 10 group notifications per request. Adding a `CampaignID` lets you query aggregate delivery stats across all of them afterwards.

<details>
<summary>curl</summary>

```bash
curl -X POST "${UNS_API_URL}/v1/send-to-group" \
  --cert "${CERT_FILE}" \
  --key "${KEY_FILE}" \
  -H "x-api-key: ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d '[
    {
      "Namespace": "travel",
      "Group": "france",
      "Subgroup": "instant",
      "CampaignID": "travel-advice-update-2026-10-27",
      "NotificationTitle": "France: Travel advice updated",
      "NotificationBody": "There has been a change to the travel advice for France."
    },
    {
      "Namespace": "travel",
      "Group": "spain",
      "Subgroup": "instant",
      "CampaignID": "travel-advice-update-2026-10-27",
      "NotificationTitle": "Spain: Travel advice updated",
      "NotificationBody": "There has been a change to the travel advice for Spain."
    }
  ]'
```

</details>

<details>
<summary>Raw JSON payload</summary>

```json
[
  {
    "Namespace": "travel",
    "Group": "france",
    "Subgroup": "instant",
    "CampaignID": "travel-advice-update-2026-10-27",
    "NotificationTitle": "France: Travel advice updated",
    "NotificationBody": "There has been a change to the travel advice for France."
  },
  {
    "Namespace": "travel",
    "Group": "spain",
    "Subgroup": "instant",
    "CampaignID": "travel-advice-update-2026-10-27",
    "NotificationTitle": "Spain: Travel advice updated",
    "NotificationBody": "There has been a change to the travel advice for Spain."
  }
]
```

</details>

---

### Foreign travel advice alert (Events Aggregator)

A group send targeting an instant-delivery subgroup, with a `DeeplinkURL` to open a specific page in the GOV.UK app and a structured Markdown message body including a timestamp and a link to manage subscriptions. The `GroupNotificationID` is supplied explicitly for idempotency; the `CampaignID` encodes the group, channel, and send timestamp.

<details>
<summary>curl</summary>

```bash
curl -X POST "${UNS_API_URL}/v1/send-to-group" \
  --cert "${CERT_FILE}" \
  --key "${KEY_FILE}" \
  -H "x-api-key: ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d '[{
    "GroupNotificationID": "cb0a9936-8ed8-4b41-b730-362be26780de",
    "Namespace": "travel",
    "Group": "spain",
    "Subgroup": "instant",
    "CampaignID": "spain/instant/PUSH_NOTIFICATION_AND_MESSAGE_CENTRE/@2026-08-10T09:14:22.031Z",
    "Channel": "PUSH_NOTIFICATION_AND_MESSAGE_CENTRE",
    "NotificationTitle": "Spain: Travel advice alert",
    "NotificationBody": "There'\''s been a change in country you are interested in",
    "MessageTitle": "Spain: Travel advice alert",
    "MessageBody": "[Go to latest](https://www.gov.uk/foreign-travel-advice/spain)\n\nChanges made:\nStorm warning\n\nTime updated:\n10:14am, 10th August 2026 (BST)\n\n[Manage your countries](govuk://app.gov.uk/travelalerts/edit)",
    "DeeplinkURL": "govuk://app.gov.uk/web?url=https://www.gov.uk/foreign-travel-advice/spain"
  }]'
```

</details>

<details>
<summary>Raw JSON payload</summary>

```json
[
  {
    "GroupNotificationID": "cb0a9936-8ed8-4b41-b730-362be26780de",
    "Namespace": "travel",
    "Group": "spain",
    "Subgroup": "instant",
    "CampaignID": "spain/instant/PUSH_NOTIFICATION_AND_MESSAGE_CENTRE/@2026-08-10T09:14:22.031Z",
    "Channel": "PUSH_NOTIFICATION_AND_MESSAGE_CENTRE",
    "NotificationTitle": "Spain: Travel advice alert",
    "NotificationBody": "There's been a change in country you are interested in",
    "MessageTitle": "Spain: Travel advice alert",
    "MessageBody": "[Go to latest](https://www.gov.uk/foreign-travel-advice/spain)\n\nChanges made:\nStorm warning\n\nTime updated:\n10:14am, 10th August 2026 (BST)\n\n[Manage your countries](govuk://app.gov.uk/travelalerts/edit)",
    "DeeplinkURL": "govuk://app.gov.uk/web?url=https://www.gov.uk/foreign-travel-advice/spain"
  }
]
```

</details>

---

## Checking notification status

Use the `NotificationID` returned from `/send` to query delivery status.

<details>
<summary>curl</summary>

```bash
NOTIFICATION_ID="a1b2c3d4-e5f6-7890-abcd-ef1234567890"

curl -X GET "${UNS_API_URL}/status/${NOTIFICATION_ID}" \
  --cert "${CERT_FILE}" \
  --key "${KEY_FILE}" \
  -H "x-api-key: ${API_KEY}"
```

Response:

```json
[
  {
    "NotificationID": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "EventDateTime": "2026-10-27T09:00:00.000Z",
    "Status": "DISPATCHED"
  },
  {
    "NotificationID": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "EventDateTime": "2026-10-27T09:00:01.500Z",
    "Status": "DELIVERED"
  }
]
```

</details>

### Campaign-level status

If you included a `CampaignID` in your send, you can query aggregate counts across all notifications in that campaign:

<details>
<summary>curl</summary>

```bash
CAMPAIGN_ID="mot-reminders-october-2026"

curl -X GET "${UNS_API_URL}/status/campaign/${CAMPAIGN_ID}" \
  --cert "${CERT_FILE}" \
  --key "${KEY_FILE}" \
  -H "x-api-key: ${API_KEY}"
```

</details>

---

## Common errors

| HTTP status | Likely cause |
| --- | --- |
| `403 Forbidden` | Certificate not recognised, or `x-api-key` missing or incorrect |
| `400 Bad Request` | Request body failed validation — check the `Errors` array in the response body |
| `400` — `Duplicate NotificationIDs are not allowed` | Two items in the same request share a `NotificationID` |
| `400` — channel or deeplink rejected | The `Channel` or `DeeplinkURL` value is not in your organisation's allow-list — contact the UNS team |

---

## Further reading

- [UNS PSO API reference](https://govuk-once.github.io/gds-unified-notification-service/pso/) — full API specification (authoritative)
- [Service Overview](./service-overview.md) — full lifecycle, identity chain, groups, analytics
