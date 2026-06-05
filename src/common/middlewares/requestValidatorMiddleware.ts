import { BadRequestError } from '@common/models/Errors/BadRequestError';
import { errorFormatter } from '@common/utils';
import type { MiddlewareObj } from '@middy/core';
import type { APIGatewayEvent, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { type ZodType } from 'zod';

export const requestValidatorMiddleware = (
  schema?: ZodType
): MiddlewareObj<APIGatewayEvent, APIGatewayProxyStructuredResultV2, Error> => ({
  before: (request): void => {
    if (schema) {
      const { error, data } = schema.safeParse(request.event.body);
      if (error) {
        throw new BadRequestError(errorFormatter(error));
      }
      // Re-inject parsed object back into the event
      request.event.body = data as string;
    }
  },
});
