import { BadRequestError } from '@common/models/BadRequestError';
import type { MiddlewareObj } from '@middy/core';
import type { APIGatewayEvent, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import httpError from 'http-errors';

export const httpErrorHandlerMiddleware = (): MiddlewareObj<
  APIGatewayEvent,
  APIGatewayProxyStructuredResultV2,
  Error
> => ({
  onError: (request) => {
    if (request.error instanceof BadRequestError) {
      const error = {
        Status: request.error.statusCode,
        HttpError: request.error.name,
        Errors: request.error.errors,
      };
      throw new httpError.BadRequest(JSON.stringify(error));
    }
  },
});
