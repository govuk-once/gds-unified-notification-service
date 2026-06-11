import { httpErrorHandlerMiddleware } from '@common/middlewares/httpErrorHandlerMiddleware';
import { BadRequestError } from '@common/models/Errors/BadRequestError';
import middy from '@middy/core';
import { APIGatewayEvent, Context } from 'aws-lambda';

describe('httpErrorHandlerMiddleware', () => {
  const mockContext = {} as Context;

  const observabilityMock = {
    logger: {
      error: vi.fn(),
    },
  };
  const instance = httpErrorHandlerMiddleware((message: string, statusCode: number, errors: string[] | Error) => {
    observabilityMock.logger.error(message, { statusCode: statusCode, errors: errors });
  });

  it('should handle an custom error and log the details of the error', async () => {
    // Arrange
    const error = new BadRequestError(['Test Bad Request Error']);
    const handler = vi.fn().mockRejectedValueOnce(error);
    const fn = middy().use(instance).handler(handler);

    // Act
    const result = await fn({} as APIGatewayEvent, mockContext);

    // Expect
    expect(result).toEqual({
      statusCode: error.statusCode,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        Status: error.statusCode,
        HttpError: error.name,
        Errors: error.errors,
      }),
    });
    expect(observabilityMock.logger.error).toHaveBeenCalledWith('Request failed', {
      statusCode: error.statusCode,
      errors: error.errors,
    });
  });

  it('should handle any unexpected errors and log that it is unexpected', async () => {
    // Arrange
    const error = new Error('This should not be thrown');
    const handler = vi.fn().mockRejectedValueOnce(error);
    const fn = middy().use(instance).handler(handler);

    // Act
    const result = await fn({} as APIGatewayEvent, mockContext);

    // Expect
    expect(result).toEqual({
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'An unexpected error occurred' }),
    });
    expect(observabilityMock.logger.error).toHaveBeenCalledWith('Request failed unexpected.', {
      statusCode: 500,
      errors: [error.message],
    });
  });

  it('should handle any unexpected errors and log even when it has no error message', async () => {
    // Arrange
    const error = new Error();
    const handler = vi.fn().mockRejectedValueOnce(error);
    const fn = middy().use(instance).handler(handler);

    // Act
    const result = await fn({} as APIGatewayEvent, mockContext);

    // Expect
    expect(result).toEqual({
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'An unexpected error occurred' }),
    });
    expect(observabilityMock.logger.error).toHaveBeenCalledWith('Request failed unexpected.', {
      statusCode: 500,
      errors: ['There was no error message provided.'],
    });
  });
});
