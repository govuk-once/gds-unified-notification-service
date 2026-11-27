## GetHealthcheck

Liveness probe for the Portal Backend API - always returns `200 { "status": "ok" }` without touching any dependency.

- **Type:** HTTP (API Gateway)
- **Operation ID:** `getHealthcheck`
- **Route:** `GET /status`

### Sample event

```json
{
  "httpMethod": "GET",
  "path": "/status",
  "headers": { "x-api-key": "mockApiKey" },
  "requestContext": { "requestId": "c6af9ac6-7b61-11e6-9a41-93e8deadbeef" }
}
```

### Logic

```mermaid
flowchart TD
    A[GET /status] --> B[Return 200 status: ok]
```
