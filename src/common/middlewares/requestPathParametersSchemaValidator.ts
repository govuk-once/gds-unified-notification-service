import type { MiddlewareObj } from '@middy/core';
import type { APIGatewayEvent, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import httpError from 'http-errors';
import { type ZodType, z } from 'zod';

export const requestPathParametersSchemaValidator = (
  schema?: ZodType
): MiddlewareObj<APIGatewayEvent, APIGatewayProxyStructuredResultV2, Error> => ({
  before: (request): void => {
    if (schema) {
      const { error, data } = schema.safeParse(request.event.pathParameters);
      if (error) {
        throw new httpError.BadRequest(`Bad Request: \n\n${z.prettifyError(error)}`);
      }
    }
  },
});
