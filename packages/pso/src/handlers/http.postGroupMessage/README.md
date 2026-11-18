## PostGroupMessage

Feature-flagged (`config.featureFlag.groups` — infrastructure-level deployment gate) group-notification endpoint. Validates content, resolves group membership, splits push IDs into fixed-size chunks, and queues each chunk for downstream group processing.

- **Type:** HTTP (API Gateway)
- **Operation ID:** `postGroupMessage`
- **Route:** `POST /v1/send-to-group`

### Sample event

```json
{
  "requestContext": {
    "authorizer": {
      "Organization": "ORG01",
      "OrganisationConfig": "{\"MessageRetention\":{\"Allowed\":false},\"Channels\":[]}"
    },
    "requestId": "req-1",
    "requestTimeEpoch": 1428582896000
  },
  "body": [
    {
      "Namespace": "travel",
      "Group": "france",
      "Subgroup": "immediate",
      "GroupNotificationID": "TO_GROUP_ID",
      "CampaignID": "CAM_ID",
      "NotificationTitle": "You have a new Notification",
      "NotificationBody": "Here is the Notification body.",
      "MessageTitle": "You have a new Message",
      "MessageBody": "Open Notification Centre to read your notifications"
    }
  ]
}
```

### Infrastructure

- **DynamoDB** - `GroupStoreDynamoRepository` (the GroupStore table), read-only (`getUsersInGroup`).
- **SQS** - publishes one message per chunk of push IDs (`PushIDs`) to the `groupprocessing` queue via `GroupProcessingQueueService.publishMessageBatch`.
- **SSM** - reads `SSMParameters.Group.Dispatch.ChunkSize` (default `1000`), the number of push IDs per queue message.
- The request schema rejects the whole request with `400` if two items share a `GroupNotificationID` (`Duplicate GroupNotificationIDs are not allowed`).
- Content is validated in-process by `ValidationService.messageValidation`, same as `postMessage` (see [Configuration: Feature flags](../../../../docs/configuration.md#feature-flags)).
- The queued chunks are consumed by [`sqs.groupProcessingWorker`](../sqs.groupProcessingWorker/README.md).

### Logic

```mermaid
flowchart TD
    A["POST /v1/send-to-group"] --> A1{"Schema valid & GroupNotificationIDs unique?"}
    A1 -- No --> C
    A1 -- Yes --> B{Organization resolved?}
    B -- No --> C[400 Bad Request]
    B -- Yes --> D[Stamp OrganisationID from authorizer context]
    D --> E["ValidationService.messageValidation per item"]
    E --> F[Read chunk size from SSM]
    F --> G["GroupStoreDynamoRepository.getUsersInGroup per item"]
    G --> H[Split push IDs into chunks of ChunkSize]
    H --> J["GroupProcessingQueueService.publishMessageBatch"]
    J --> K[202 + GroupNotificationID / UsersInGroup counts]
```
