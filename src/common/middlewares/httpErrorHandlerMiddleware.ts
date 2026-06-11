import { BaseError } from '@common/models/Errors/BaseError';
import type { MiddlewareObj } from '@middy/core';
import type { APIGatewayEvent, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';

// Add middleware factory
export const httpErrorHandlerMiddleware = (
  loggerCallback: (message: string, statusCode: number, errors: string[] | Error) => void
): MiddlewareObj<APIGatewayEvent, APIGatewayProxyStructuredResultV2, Error> => ({
  onError: (request) => {
    if (request.error instanceof BaseError) {
      loggerCallback('Request failed', request.error.statusCode, request.error.errors);
      request.response = {
        statusCode: request.error.statusCode,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          Status: request.error.statusCode,
          HttpError: request.error.name,
          Errors: request.error.errors,
        }),
      };

      return;
    }

    loggerCallback(
      'Request failed unexpected.',
      500,
      request.error?.message ? [request.error?.message] : ['There was no error message provided.']
    );
    request.response = {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'An unexpected error occurred' }),
    };
  },
});
