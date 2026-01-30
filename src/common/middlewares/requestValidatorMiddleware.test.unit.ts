import { requestValidatorMiddleware } from '@common/middlewares/requestValidatorMiddleware';
import middy from '@middy/core';
import { APIGatewayEvent, Context } from 'aws-lambda';
import z from 'zod';

describe('requestValidatorMiddleware', () => {
  const mockContext = {} as Context;
  const schema = z.object({
    a: z.number(),
    b: z.string(),
  });
  const instance = requestValidatorMiddleware(schema);

  it('should do nothing if schema is not supplied', async () => {
    // Arrange - define mock lambda
    const schemalessInstance = requestValidatorMiddleware(undefined);
    const handler = vi.fn();
    const obj = { a: 1, b: 'two' };
    const fn = middy().use(schemalessInstance).handler(handler);

    // Act
    await fn({ body: obj } as unknown as APIGatewayEvent, mockContext);

    // Expect
    expect(handler).toHaveBeenCalledWith({ body: obj }, mockContext, expect.any(Object));
  });

  it('should validate schema', async () => {
    // Arrange - define mock lambda
    const handler = vi.fn();
    const obj = { a: 1, b: 'two' };
    const fn = middy().use(instance).handler(handler);

    // Act
    await fn({ body: obj } as unknown as APIGatewayEvent, mockContext);

    // Expect
    expect(handler).toHaveBeenCalledWith({ body: obj }, mockContext, expect.any(Object));
  });
  it('should throw error in case of invalid object', async () => {
    // Arrange - define mock lambda
    const handler = vi.fn();
    const obj = { a: { c: 2 } };
    const fn = middy().use(instance).handler(handler);

    // Act
    const promise = fn({ body: obj } as unknown as APIGatewayEvent, mockContext);

    // Expect
    await expect(promise).rejects.toThrowError('Bad Request');
  });
});
