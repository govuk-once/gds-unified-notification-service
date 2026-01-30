import type { MiddlewareObj } from '@middy/core';
import type { APIGatewayEvent, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import httpError from 'http-errors';
import { type ZodType, z } from 'zod';

export const requestValidatorMiddleware = (
  schema?: ZodType
): MiddlewareObj<APIGatewayEvent, APIGatewayProxyStructuredResultV2, Error> => ({
  before: (request): void => {
    if (schema) {
      const { error } = schema.safeParse(request.event.body);
      if (error) {
        throw new httpError.BadRequest(`Bad Request: \n\n${z.prettifyError(error)}`);
      }
    }
  },
});
