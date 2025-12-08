import type { MiddlewareObj } from '@middy/core';
import type {
  APIGatewayEvent,
  APIGatewayProxyStructuredResultV2,
} from 'aws-lambda';

export const deserializeBodyFromJson = (): MiddlewareObj<
  APIGatewayEvent,
  Omit<APIGatewayProxyStructuredResultV2, 'body'> & { body: unknown },
  Error
> => ({
  after: async (request): Promise<void> => {
    if (request.event.body && typeof request.event.body !== 'object') {
      request.event.body = JSON.parse(request.event.body);
    }
  },
});
