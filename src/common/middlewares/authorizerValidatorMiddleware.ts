import { BadRequestError } from '@common/models/Errors/BadRequestError';
import { zodErrorFormatter } from '@common/utils';
import { MiddlewareObj } from '@middy/core';
import { APIGatewayEvent, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { ZodType } from 'zod';

export const authorizerValidatorMiddleware = (
  schema?: ZodType
): MiddlewareObj<APIGatewayEvent, APIGatewayProxyStructuredResultV2, Error> => ({
  before: (request): void => {
    if (schema) {
      const { error, data } = schema.safeParse(request.event.requestContext.authorizer);
      if (error) {
        throw new BadRequestError(['Authorizer did not match expected schema', ...zodErrorFormatter(error)]);
      }
      request.event.requestContext.authorizer = data as typeof schema;
    }
  },
});
