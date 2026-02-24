### Conventions to follow when creating new lambdas.

Some quick conventions to keep in mind when creating & naming new lambdas

- Lambdas should be placed in their relevant directories (currently: PSO & Flex)
- Lambdas should be named `handler.ts` within their dedicated directories
- Lambda directories should follow `{trigger}.{operationName}` naming scheme where:
  - Trigger refers to one of: http, sqs etc.
  - Operation id: should refer to name of the handler, in case of OpenAPI request handling, it should match the definition outlined in the specification (docs dir in the root of this repository)
- Lambda class names should match the operation name
- Plurality is important (i.e. GetItems vs GetItem) should be relevant to input/output types.
