import { responseValidatorMiddleware } from '@common/middlewares/responseValidatorMiddleware';
import middy from '@middy/core';
import { APIGatewayEvent, Context } from 'aws-lambda';
import z from 'zod';

describe('responseValidatorMiddleware', () => {
  const mockContext = {} as Context;
  const schema = z.object({
    a: z.number(),
    b: z.string(),
  });
  const instance = responseValidatorMiddleware(schema);

  it('should do nothing if schema is not supplied', async () => {
    // Arrange - define mock lambda
    const schemalessInstance = responseValidatorMiddleware(undefined);
    const obj = { a: 1, b: 'two' };
    const handler = vi.fn().mockResolvedValueOnce({ body: obj });
    const fn = middy().use(schemalessInstance).handler(handler);

    // Act
    const result = await fn({} as APIGatewayEvent, mockContext);

    // Expect
    expect(result).toEqual({ body: obj });
  });

  it('should validate schema', async () => {
    // Arrange - define mock lambda
    const obj = { a: 1, b: 'two' };
    const handler = vi.fn().mockResolvedValueOnce({ body: obj });
    const fn = middy().use(instance).handler(handler);

    // Act
    const result = await fn({} as APIGatewayEvent, mockContext);

    // Expect
    expect(result).toEqual({ body: obj });
  });

  it('should throw error in case of invalid response schema', async () => {
    // Arrange - define mock lambda
    const obj = { a: { b: 'c' } };
    const handler = vi.fn().mockResolvedValueOnce({ body: obj });
    const fn = middy().use(instance).handler(handler);

    // Act
    const promise = fn({} as APIGatewayEvent, mockContext);

    // Expect
    await expect(promise).rejects.toThrowError('Expectation Failed');
  });
});
