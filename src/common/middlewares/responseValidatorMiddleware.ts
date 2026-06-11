import { ExpectationFailedError } from '@common/models/Errors/ExpectationFailedError';
import type { MiddlewareObj } from '@middy/core';
import type { APIGatewayEvent, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { type ZodType, z } from 'zod';

export const responseValidatorMiddleware = (
  loggerCallback: (message: string, errors: { errors: string[] }) => void,
  schema?: ZodType
): MiddlewareObj<APIGatewayEvent, Omit<APIGatewayProxyStructuredResultV2, 'body'> & { body: unknown }, Error> => ({
  after: (request): void => {
    if (schema) {
      const { error } = schema.safeParse(request?.response?.body);
      if (error) {
        // Log error
        loggerCallback('Response validation failed', z.treeifyError(error));
        throw new ExpectationFailedError();
      }
    }
  },
});
