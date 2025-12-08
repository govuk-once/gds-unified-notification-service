import type { MiddlewareObj } from '@middy/core';
import type {
  APIGatewayEvent,
  APIGatewayProxyStructuredResultV2,
} from 'aws-lambda';
import httpError from 'http-errors';
import { type ZodType, z } from 'zod';

export const responseValidatorMiddleware = (
  schema?: ZodType,
): MiddlewareObj<
  APIGatewayEvent,
  Omit<APIGatewayProxyStructuredResultV2, 'body'> & { body: unknown },
  Error
> => ({
  after: async (request): Promise<void> => {
    if (schema) {
      const { error } = schema.safeParse(request?.response?.body);
      if (error) {
        // Log error
        console.log(JSON.stringify(z.treeifyError(error), null, 2));
        throw new httpError.ExpectationFailed();
      }
    }
  },
});
