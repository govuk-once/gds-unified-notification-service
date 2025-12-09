import type { MiddlewareObj } from '@middy/core';
import type { APIGatewayEvent, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import httpError from 'http-errors';
import { type ZodType, z } from 'zod';

export const requestValidatorMiddleware = (
  schema?: ZodType
): MiddlewareObj<APIGatewayEvent, APIGatewayProxyStructuredResultV2, Error> => ({
  before: async (request): Promise<void> => {
    if (schema) {
      const { error } = schema.safeParse(request.event.body);
      if (error) {
        console.log(JSON.stringify(z.treeifyError(error), null, 2));
        throw new httpError.BadRequest();
      }
    }
  },
});
